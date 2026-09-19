/**
 * PHOTO UPLOAD TOOL
 * Google Apps Script for uploading job photos to customer folders
 * 
 * SETUP:
 * 1. Create a new Google Apps Script project
 * 2. Copy this code into Code.gs
 * 3. Create an HTML file named "PhotoUploadUI" and paste PhotoUploadUI.html content
 * 4. Deploy as Web App (Execute as: Me, Who has access: Anyone)
 * 5. Add the deployed URL to your Dashboard
 */

// ========================================
// CONFIGURATION
// ========================================

const SQUARE_ACCESS_TOKEN = 'REDACTED';
const SQUARE_APPLICATION_ID = 'sq0idp-UsE101iI0GHTKs8WSAJwwA';
const SQUARE_ENVIRONMENT = 'production'; // 'production' or 'sandbox'
const SQUARE_API_VERSION = '2024-12-18';

// Drive folder for customer files
const CUSTOMER_DRIVE_FOLDER_ID = '1tHpDcPkFJ6B3QDopqzpawZrL9Oun2Nrl';

// ========================================
// MAIN WEB APP HANDLER
// ========================================

function doGet() {
  return HtmlService.createHtmlOutputFromFile('PhotoUploadUI')
    .setTitle('Photo Upload Tool')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ========================================
// SQUARE API - CUSTOMERS
// ========================================

/**
 * Get all customers from Square
 */
function getSquareCustomers() {
  try {
    const baseUrl = SQUARE_ENVIRONMENT === 'production' 
      ? 'https://connect.squareup.com/v2'
      : 'https://connect.squareupsandbox.com/v2';
    
    const url = `${baseUrl}/customers`;
    
    const options = {
      method: 'get',
      headers: {
        'Square-Version': SQUARE_API_VERSION,
        'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    Logger.log('Square API Response Code: ' + responseCode);
    
    if (responseCode === 200) {
      const data = JSON.parse(responseText);
      const customers = data.customers || [];
      
      // Sort customers by name
      customers.sort((a, b) => {
        const nameA = (a.given_name || '') + ' ' + (a.family_name || '');
        const nameB = (b.given_name || '') + ' ' + (b.family_name || '');
        return nameA.localeCompare(nameB);
      });
      
      return { success: true, customers: customers };
    } else {
      Logger.log('Error response: ' + responseText);
      return { success: false, error: 'Failed to fetch customers from Square' };
    }
    
  } catch (error) {
    Logger.log('Error in getSquareCustomers: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Add a new customer to Square
 */
function addSquareCustomer(customerData) {
  try {
    const baseUrl = SQUARE_ENVIRONMENT === 'production' 
      ? 'https://connect.squareup.com/v2'
      : 'https://connect.squareupsandbox.com/v2';
    
    const url = `${baseUrl}/customers`;
    
    const payload = {
      given_name: customerData.firstName,
      family_name: customerData.lastName,
      email_address: customerData.email || undefined,
      phone_number: customerData.phone || undefined,
      address: customerData.address ? {
        address_line_1: customerData.address
      } : undefined
    };
    
    const options = {
      method: 'post',
      headers: {
        'Square-Version': SQUARE_API_VERSION,
        'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode === 200) {
      const data = JSON.parse(responseText);
      return { success: true, customer: data.customer };
    } else {
      Logger.log('Error adding customer: ' + responseText);
      return { success: false, error: 'Failed to add customer to Square' };
    }
    
  } catch (error) {
    Logger.log('Error in addSquareCustomer: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ========================================
// GOOGLE DRIVE - PHOTO UPLOADS
// ========================================

/**
 * Get or create customer folder in Drive
 */
function getOrCreateCustomerFolder(customer) {
  try {
    const customerName = `${customer.given_name || ''} ${customer.family_name || ''}`.trim();
    const address = customer.address ? customer.address.address_line_1 || '' : '';
    const folderName = `${customerName} - ${address}`.trim();
    
    Logger.log('Looking for folder: ' + folderName);
    
    const parentFolder = DriveApp.getFolderById(CUSTOMER_DRIVE_FOLDER_ID);
    const folders = parentFolder.getFoldersByName(folderName);
    
    let customerFolder;
    if (folders.hasNext()) {
      // Folder exists
      customerFolder = folders.next();
      Logger.log('Found existing folder');
    } else {
      // Create new folder
      customerFolder = parentFolder.createFolder(folderName);
      Logger.log('Created new folder: ' + folderName);
      
      // Share folder with "Anyone with link can view"
      customerFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    }
    
    return {
      success: true,
      folderId: customerFolder.getId(),
      folderUrl: customerFolder.getUrl(),
      folderName: folderName,
      isNew: !folders.hasNext()
    };
    
  } catch (error) {
    Logger.log('Error in getOrCreateCustomerFolder: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Upload photos to customer folder
 */
function uploadPhotos(customerId, photos) {
  try {
    Logger.log('Starting photo upload for customer: ' + customerId);
    Logger.log('Number of photos: ' + photos.length);
    
    // First, get customer details from Square to get folder name
    const baseUrl = SQUARE_ENVIRONMENT === 'production' 
      ? 'https://connect.squareup.com/v2'
      : 'https://connect.squareupsandbox.com/v2';
    
    const customerUrl = `${baseUrl}/customers/${customerId}`;
    
    const options = {
      method: 'get',
      headers: {
        'Square-Version': SQUARE_API_VERSION,
        'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    };
    
    const customerResponse = UrlFetchApp.fetch(customerUrl, options);
    const customerData = JSON.parse(customerResponse.getContentText());
    
    if (!customerData.customer) {
      return { success: false, error: 'Customer not found' };
    }
    
    // Get or create customer folder
    const folderResult = getOrCreateCustomerFolder(customerData.customer);
    if (!folderResult.success) {
      return folderResult;
    }
    
    const folder = DriveApp.getFolderById(folderResult.folderId);
    const uploadedFiles = [];
    
    // Upload each photo
    photos.forEach((photo, index) => {
      try {
        // Decode base64 image data
        const base64Data = photo.data.split(',')[1];
        const blob = Utilities.newBlob(
          Utilities.base64Decode(base64Data),
          photo.mimeType,
          photo.name
        );
        
        // Upload to Drive
        const file = folder.createFile(blob);
        Logger.log('Uploaded: ' + file.getName());
        
        uploadedFiles.push({
          name: file.getName(),
          url: file.getUrl(),
          size: formatFileSize(file.getSize())
        });
        
      } catch (error) {
        Logger.log('Error uploading photo ' + index + ': ' + error);
      }
    });
    
    return {
      success: true,
      folderUrl: folderResult.folderUrl,
      folderName: folderResult.folderName,
      uploadedCount: uploadedFiles.length,
      files: uploadedFiles,
      isNewFolder: folderResult.isNew
    };
    
  } catch (error) {
    Logger.log('Error in uploadPhotos: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Format file size for display
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// ========================================
// TEST FUNCTIONS
// ========================================

/**
 * Test Square API connection
 */
function testSquareConnection() {
  Logger.log('====================================');
  Logger.log('TESTING SQUARE API CONNECTION');
  Logger.log('====================================\n');
  
  Logger.log('Configuration:');
  Logger.log('✓ Access Token: ' + SQUARE_ACCESS_TOKEN.substring(0, 20) + '...');
  Logger.log('✓ Environment: ' + SQUARE_ENVIRONMENT);
  Logger.log('✓ API Version: ' + SQUARE_API_VERSION);
  
  Logger.log('\nFetching customers...\n');
  
  const result = getSquareCustomers();
  
  if (result.success) {
    Logger.log('✅ SUCCESS! Connected to Square API');
    Logger.log('Found ' + result.customers.length + ' customers');
    
    if (result.customers.length > 0) {
      Logger.log('\nFirst 3 customers:');
      result.customers.slice(0, 3).forEach(customer => {
        Logger.log('- ' + (customer.given_name || '') + ' ' + (customer.family_name || ''));
      });
    }
  } else {
    Logger.log('❌ FAILED! Error: ' + result.error);
  }
  
  return result;
}

/**
 * Test Drive folder access
 */
function testDriveAccess() {
  Logger.log('====================================');
  Logger.log('TESTING GOOGLE DRIVE ACCESS');
  Logger.log('====================================\n');
  
  try {
    const folder = DriveApp.getFolderById(CUSTOMER_DRIVE_FOLDER_ID);
    Logger.log('✅ Successfully accessed folder: ' + folder.getName());
    Logger.log('Folder URL: ' + folder.getUrl());
    
    return { success: true };
  } catch (error) {
    Logger.log('❌ FAILED! Error: ' + error);
    return { success: false, error: error.toString() };
  }
}


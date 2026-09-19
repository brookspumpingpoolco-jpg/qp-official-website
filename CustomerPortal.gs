/**
 * CUSTOMER PORTAL
 * Google Apps Script for customer-facing portal
 * 
 * Features:
 * - Customer authentication
 * - View projects with status tracker
 * - View estimates, jobs, invoices
 * - Schedule appointments
 * - Quick estimate tool
 * - Profile management
 * - Send photos
 * 
 * SETUP:
 * 1. Create a new Google Apps Script project
 * 2. Copy this code into Code.gs
 * 3. Create an HTML file named "CustomerPortalUI" and paste CustomerPortalUI.html content
 * 4. Deploy as Web App (Execute as: Me, Who has access: Anyone)
 * 5. Update URL in customer portal invite emails
 */

// ========================================
// CONFIGURATION
// ========================================

const SPREADSHEET_ID = '1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0';
const CUSTOMER_PORTAL_SHEET_NAME = 'Customer Portal Magic';
const AUTH_SHEET_NAME = 'Authentication'; // Keep for backward compatibility, but prefer Customer Portal sheet
const PROJECTS_SHEET_NAME = 'Projects';
const PROJECT_ITEMS_SHEET_NAME = 'Project Items';
const JOBS_SHEET_NAME = 'Jobs';
const APPOINTMENTS_SHEET_NAME = 'Appointments';
const SERVICE_HISTORY_SHEET_NAME = 'Service_History';
const SERVICE_REPORTS_SHEET_NAME = 'Service Reports';
const QUOTES_SHEET_NAME = 'Quick quote';
const INVOICES_ESTIMATES_SHEET = 'Invoices & Estimates';
const PAYMENT_SCHEDULES_SHEET = 'Payment Schedules';
const INVOICE_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwE4FdbrzP6kCU5cZUJQKalXOGqzIkztBM3xvRj7moBOc5vAmnfM0pVwnVAenGXjdzi/exec';
const COMPANY_NAME = 'A Quality Pool Company';
const COMPANY_EMAIL = 'samr@aqualitypoolcompanyusa.com';
const COMPANY_PHONE = '(502) 731-9217';

// Square API Configuration (get from script properties or set here)
// To set: PropertiesService.getScriptProperties().setProperty('SQUARE_ACCESS_TOKEN', 'your-token');
const SQUARE_ACCESS_TOKEN = PropertiesService.getScriptProperties().getProperty('SQUARE_ACCESS_TOKEN') || 'EAAAl2-YTctbeMzhzczcgN4kIigUZJtouc1WcldX9PJ4LTFcIGIdOcmfvjFCkDxA';
const SQUARE_API_VERSION = '2024-12-18';
const SQUARE_ENVIRONMENT = 'production';

// Google Maps API Key for satellite images
// To set: PropertiesService.getScriptProperties().setProperty('GOOGLE_MAPS_API_KEY', 'your-api-key');
// Get one here: https://console.cloud.google.com/google/maps-apis
const GOOGLE_MAPS_API_KEY = PropertiesService.getScriptProperties().getProperty('GOOGLE_MAPS_API_KEY') || 'AIzaSyAbxEM5S4vVw7ZO_w2CZh_21JPwrVG2Z7Q';

// ========================================
// MAIN WEB APP HANDLER
// ========================================

/**
 * Helper function to create CORS-enabled response
 */
function createCorsResponse(content, mimeType = ContentService.MimeType.JSON) {
  // Note: Google Apps Script doesn't allow setting custom headers directly
  // CORS is handled automatically when deployed with "Anyone" access
  // This function is for consistency
  return ContentService.createTextOutput(content)
    .setMimeType(mimeType);
}

/**
 * Handle OPTIONS requests for CORS preflight
 * Google Apps Script automatically handles CORS when deployed with "Anyone" access
 * This handles preflight requests from editor preview and other origins
 */
function doOptions(e) {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Main handler - serves HTML UI or API endpoints
 */
function doGet(e) {
  try {
    const action = e.parameter.action || '';
    
    // If no action or action is for UI, serve the HTML
    if (!action || action === 'ui' || action === '') {
      try {
        // Try to get the web app URL
        let webAppUrl = '';
        try {
          webAppUrl = ScriptApp.getService().getUrl() || '';
        } catch (e) {
          // If getUrl() fails (script not deployed), use empty string
          webAppUrl = '';
        }
        
        // Always use direct file serving to avoid template syntax errors
        // The HTML will detect the API URL from window.location or use DEPLOYED_WEB_APP_URL
        return HtmlService.createHtmlOutputFromFile('CustomerPortalUI')
          .setTitle('Customer Portal - ' + COMPANY_NAME)
          .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
      } catch (error) {
        // Fallback to direct file serving if template fails
        Logger.log('Error using template, falling back: ' + error.toString());
        return HtmlService.createHtmlOutputFromFile('CustomerPortalUI')
          .setTitle('Customer Portal - ' + COMPANY_NAME)
          .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
      }
    }
    
    // Otherwise handle API actions
    let result;
    
    switch(action) {
      case 'verifyToken':
        result = verifySignupToken(e.parameter.token);
        break;
      case 'getPhases':
        // Return phases as array (not wrapped in success object for this endpoint)
        return ContentService.createTextOutput(JSON.stringify(getStatusPhases()))
          .setMimeType(ContentService.MimeType.JSON);
      default:
        result = {
          success: false,
          error: 'Invalid action or missing parameters'
        };
    }
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log('doGet error: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ========================================
// AUTHENTICATION
// ========================================

/**
 * Get Customer Portal sheet (preferred) or fall back to Authentication sheet
 */
function getCustomerPortalSheet(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(CUSTOMER_PORTAL_SHEET_NAME);
  if (!sheet) {
    // Fallback to Authentication sheet for backward compatibility
    sheet = spreadsheet.getSheetByName(AUTH_SHEET_NAME);
  }
  return sheet;
}

/**
 * Authenticate customer login
 */
function authenticateCustomer(email, password) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = getCustomerPortalSheet(spreadsheet);
    
    if (!authSheet) {
      return {
        success: false,
        error: 'Authentication system not available'
      };
    }
    
    const data = authSheet.getDataRange().getValues();
    
    // Headers in row 2 (index 1), data starts row 3 (index 2)
    let headers = [];
    let dataStartRow = 2;
    
    if (data.length > 1) {
      headers = data[1]; // Row 2 in sheet
    } else if (data.length > 0) {
      headers = data[0]; // Fallback
      dataStartRow = 1;
    }
    
    // Find columns (case-insensitive)
    let emailCol = -1;
    let passwordCol = -1;
    let nameCol = -1;
    let roleCol = -1;
    let statusCol = -1;
    let accountStatusCol = -1;
    
    for (let i = 0; i < headers.length; i++) {
      const header = (headers[i] || '').toString().toLowerCase().trim();
      if (header === 'email' || header === 'email address') emailCol = i;
      if (header === 'password' || header === 'password hash') passwordCol = i;
      if (header === 'name') nameCol = i;
      if (header === 'role' || header === 'user role') roleCol = i;
      if (header === 'status') statusCol = i;
      if (header === 'account status') accountStatusCol = i;
    }
    
    if (emailCol === -1 || passwordCol === -1) {
      return {
        success: false,
        error: 'Authentication sheet structure error'
      };
    }
    
    Logger.log('Authenticating email: ' + email);
    Logger.log('Email column: ' + emailCol + ', Password column: ' + passwordCol + ', Role column: ' + roleCol);
    
    // Find customer by email (start from dataStartRow)
    for (let i = dataStartRow; i < data.length; i++) {
      const row = data[i];
      const rowEmail = (row[emailCol] || '').toString().toLowerCase().trim();
      const rowPassword = (row[passwordCol] || '').toString();
      const rowRole = (row[roleCol] || '').toString().trim();
      
      if (rowEmail === email.toLowerCase().trim()) {
        Logger.log('Found matching email at row ' + (i + 1));
        Logger.log('Row role: "' + rowRole + '", Role column found: ' + (roleCol !== -1));
        Logger.log('Stored password (first 20 chars): ' + rowPassword.substring(0, 20));
        
        // Check role - accept if role is 'Customer' or if role column is empty (for migrated accounts)
        const roleValid = (roleCol === -1) || (rowRole === 'Customer' || rowRole === '');
        
        if (!roleValid) {
          Logger.log('Role validation failed. Role is: ' + rowRole);
          return {
            success: false,
            error: 'Your account role is not valid for customer access'
          };
        }
        
        // Verify password
        const providedPasswordHash = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, password).map(function(byte) {
          return ('0' + (byte & 0xFF).toString(16)).slice(-2);
        }).join('');
        
        Logger.log('Provided password hash (first 20 chars): ' + providedPasswordHash.substring(0, 20));
        
        const passwordMatch = (rowPassword === password || providedPasswordHash === rowPassword);
        Logger.log('Password match: ' + passwordMatch);
        
        if (passwordMatch) {
          // Check account status
          const accountStatus = (row[accountStatusCol] || '').toString();
          const status = (row[statusCol] || '').toString();
          
          Logger.log('Account status: ' + accountStatus + ', Status: ' + status);
          
          if (accountStatus !== 'Approved' && status !== 'Active' && accountStatus !== '' && status !== '') {
            return {
              success: false,
              error: 'Your account is pending approval. Please contact us if you have questions.',
              pendingApproval: true
            };
          }
          
          Logger.log('Authentication successful for: ' + email);
          
          return {
            success: true,
            user: {
              email: rowEmail,
              name: (row[nameCol] || '').toString() || email,
              role: 'Customer'
            }
          };
        } else {
          Logger.log('Password mismatch for: ' + email);
          return {
            success: false,
            error: 'Invalid email or password'
          };
        }
      }
    }
    
    Logger.log('No matching email found for: ' + email);
    return {
      success: false,
      error: 'Invalid email or password'
    };
    
  } catch (error) {
    Logger.log('Authentication error: ' + error.toString());
    Logger.log('Stack trace: ' + error.stack);
    return {
      success: false,
      error: 'Authentication failed: ' + error.toString()
    };
  }
}

/**
 * Create customer account (open signup) with extended information
 */
function createCustomerAccount(name, email, phone, password, address, gateCode, pets, poolType, houseInfo, poolIssues, photos) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = getCustomerPortalSheet(spreadsheet);
    
    if (!authSheet) {
      return { success: false, error: 'Authentication sheet not found' };
    }
    
    const data = authSheet.getDataRange().getValues();
    
    // Headers in row 2 (index 1), data starts row 3 (index 2)
    let headers = [];
    let dataStartRow = 2;
    
    if (data.length > 1) {
      headers = data[1];
    } else if (data.length > 0) {
      headers = data[0];
      dataStartRow = 1;
    }
    
    // Find columns - including all Customer Portal sheet columns
    let emailCol = -1;
    let nameCol = -1;
    let passwordCol = -1;
    let roleCol = -1;
    let statusCol = -1;
    let accountStatusCol = -1;
    let addressCol = -1;
    let gateCodeCol = -1;
    let petsCol = -1;
    let poolTypeCol = -1;
    let houseInfoCol = -1;
    let poolIssuesCol = -1;
    let driveFolderIdCol = -1;
    let createdDateCol = -1;
    let lastLoginCol = -1;
    let notesCol = -1;
    let savedDataCol = -1;
    let phoneCol = -1;
    
    for (let i = 0; i < headers.length; i++) {
      const header = (headers[i] || '').toString().toLowerCase().trim();
      if (header === 'email' || header === 'email address') emailCol = i;
      if (header === 'name') nameCol = i;
      if (header === 'password' || header === 'password hash') passwordCol = i;
      if (header === 'role' || header === 'user role') roleCol = i;
      if (header === 'status') statusCol = i;
      if (header === 'account status') accountStatusCol = i;
      if (header === 'address') addressCol = i;
      if (header === 'gate code') gateCodeCol = i;
      if (header === 'pets') petsCol = i;
      if (header === 'pool type') poolTypeCol = i;
      if (header === 'house info') houseInfoCol = i;
      if (header === 'pool issues') poolIssuesCol = i;
      if (header === 'google drive folder id' || header === 'drive folder id') driveFolderIdCol = i;
      if (header === 'created date') createdDateCol = i;
      if (header === 'last login') lastLoginCol = i;
      if (header === 'notes') notesCol = i;
      if (header === '_ saved data' || header === 'saved data') savedDataCol = i;
      if (header === 'phone') phoneCol = i;
    }
    
    if (emailCol === -1 || passwordCol === -1 || nameCol === -1) {
      return { success: false, error: 'Authentication sheet structure error' };
    }
    
    // Check if email already exists
    for (let i = dataStartRow; i < data.length; i++) {
      const row = data[i];
      const rowEmail = (row[emailCol] || '').toString().toLowerCase().trim();
      
      if (rowEmail === email.toLowerCase().trim()) {
        return { success: false, error: 'An account with this email already exists' };
      }
    }
    
    // Hash password
    const hashedPassword = Utilities.computeDigest(
      Utilities.DigestAlgorithm.MD5,
      password
    ).map(function(byte) {
      return ('0' + (byte & 0xFF).toString(16)).slice(-2);
    }).join('');
    
    // Create Drive folder quickly (just folder creation, no photos/satellite yet)
    // This prevents timeout during signup - photos will be uploaded separately
    let driveFolderId = '';
    try {
      const DRIVE_FOLDER_ID = '1caFBUhSzE5WNAm9vCT4dwDQuAO0iuo1h';
      const folderName = name + ' - ' + address;
      const parentFolder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
      let customerFolder;
      
      // Check if folder already exists
      const existingFolders = parentFolder.getFoldersByName(folderName);
      if (existingFolders.hasNext()) {
        customerFolder = existingFolders.next();
      } else {
        customerFolder = parentFolder.createFolder(folderName);
      }
      
      driveFolderId = customerFolder.getId();
      Logger.log('Drive folder created/retrieved: ' + driveFolderId);
      
      // Schedule photo upload and satellite image save for later (non-blocking)
      // Store photos data in Script Properties temporarily for background processing
      if (photos && photos.length > 0) {
        const photosData = {
          email: email,
          folderId: driveFolderId,
          address: address,
          photos: photos.map(p => ({
            name: p.name,
            data: p.data,
            type: p.type
          }))
        };
        // Store in Script Properties (limited to 9KB per property, so we'll use a trigger)
        // For now, we'll just log it - photos can be uploaded manually or via separate API call
        Logger.log('Photos queued for upload: ' + photos.length + ' photos for ' + email);
      }
    } catch (error) {
      Logger.log('Error creating Drive folder (will continue with signup): ' + error.toString());
      // Don't fail the signup if folder creation fails
    }
    
    // Create new row with ALL fields
    const newRow = [];
    for (let i = 0; i < headers.length; i++) {
      newRow.push('');
    }
    
    const now = new Date();
    
    // Set all available fields
    newRow[nameCol] = name;
    newRow[emailCol] = email.toLowerCase().trim();
    newRow[passwordCol] = hashedPassword;
    if (roleCol !== -1) newRow[roleCol] = 'Customer';
    if (statusCol !== -1) newRow[statusCol] = 'Active';
    if (accountStatusCol !== -1) newRow[accountStatusCol] = 'Approved';
    if (addressCol !== -1) newRow[addressCol] = address || '';
    if (phoneCol !== -1) newRow[phoneCol] = phone || '';
    if (gateCodeCol !== -1) newRow[gateCodeCol] = gateCode || '';
    if (petsCol !== -1) newRow[petsCol] = pets || '';
    if (poolTypeCol !== -1) newRow[poolTypeCol] = poolType || '';
    if (houseInfoCol !== -1) newRow[houseInfoCol] = houseInfo || '';
    if (poolIssuesCol !== -1) newRow[poolIssuesCol] = poolIssues || '';
    if (driveFolderIdCol !== -1) newRow[driveFolderIdCol] = driveFolderId;
    if (createdDateCol !== -1) newRow[createdDateCol] = now;
    if (lastLoginCol !== -1) newRow[lastLoginCol] = now;
    if (notesCol !== -1) newRow[notesCol] = 'Account created via Customer Portal signup';
    
    // Save signup data to _ saved data column as JSON
    if (savedDataCol !== -1) {
      const savedData = {
        signupDate: now.toISOString(),
        photosCount: photos ? photos.length : 0,
        addressConfirmed: false // Will be updated if satellite image was confirmed
      };
      newRow[savedDataCol] = JSON.stringify(savedData);
    }
    
    authSheet.appendRow(newRow);
    
    Logger.log('Customer account created successfully: ' + email);
    
    return {
      success: true,
      user: {
        email: email.toLowerCase().trim(),
        name: name,
        role: 'Customer'
      }
    };
    
  } catch (error) {
    Logger.log('Create account error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Check Square for customer by email and return address if found
 */
function checkSquareCustomerByEmail(email) {
  try {
    if (!SQUARE_ACCESS_TOKEN) {
      return { success: false, error: 'Square API not configured' };
    }
    
    const baseUrl = SQUARE_ENVIRONMENT === 'production' 
      ? 'https://connect.squareup.com/v2'
      : 'https://connect.squareupsandbox.com/v2';
    
    // Search for customer by email
    const url = `${baseUrl}/customers/search`;
    const payload = {
      query: {
        filter: {
          email_address: {
            exact: email.toLowerCase().trim()
          }
        }
      },
      limit: 1
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
    
    if (responseCode === 200) {
      const data = JSON.parse(response.getContentText());
      const customers = data.customers || [];
      
      if (customers.length > 0) {
        const customer = customers[0];
        const address = customer.address;
        
        if (address) {
          const addressParts = [
            address.address_line_1,
            address.address_line_2,
            address.locality,
            address.administrative_district_level_1,
            address.postal_code
          ].filter(Boolean);
          
          return {
            success: true,
            found: true,
            address: addressParts.join(', '),
            customerId: customer.id
          };
        }
      }
    }
    
    return { success: true, found: false };
    
  } catch (error) {
    Logger.log('Error checking Square customer: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Get satellite image for an address using Google Maps Static API
 */
function getSatelliteImageForAddress(address) {
  try {
    // Get API key from script properties or fallback
    const apiKey = PropertiesService.getScriptProperties().getProperty('GOOGLE_MAPS_API_KEY') || GOOGLE_MAPS_API_KEY;
    
    if (!apiKey || apiKey.trim() === '') {
      Logger.log('Google Maps API key not configured');
      return { success: false, error: 'Google Maps API key not configured' };
    }
    
    Logger.log('Getting satellite image for address: ' + address);
    Logger.log('Using API key: ' + apiKey.substring(0, 20) + '...');
    
    // Geocode the address first to get lat/long
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    Logger.log('Geocoding URL: ' + geocodeUrl);
    
    const geocodeResponse = UrlFetchApp.fetch(geocodeUrl);
    const geocodeResponseCode = geocodeResponse.getResponseCode();
    const geocodeResponseText = geocodeResponse.getContentText();
    
    Logger.log('Geocoding response code: ' + geocodeResponseCode);
    
    if (geocodeResponseCode !== 200) {
      Logger.log('Geocoding failed with code: ' + geocodeResponseCode);
      Logger.log('Response: ' + geocodeResponseText.substring(0, 200));
      return { success: false, error: 'Geocoding service error: HTTP ' + geocodeResponseCode };
    }
    
    const geocodeData = JSON.parse(geocodeResponseText);
    Logger.log('Geocoding status: ' + geocodeData.status);
    
    if (geocodeData.status !== 'OK' || !geocodeData.results || geocodeData.results.length === 0) {
      const errorMsg = geocodeData.error_message || 'Address not found';
      Logger.log('Geocoding error: ' + errorMsg);
      return { success: false, error: errorMsg };
    }
    
    const location = geocodeData.results[0].geometry.location;
    const lat = location.lat;
    const lng = location.lng;
    
    Logger.log('Coordinates: ' + lat + ', ' + lng);
    
    // Get satellite image (640x640 pixels, zoom level 19 for detailed view)
    const imageUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=19&size=640x640&maptype=satellite&key=${apiKey}`;
    
    // Also get a street map overlay for context
    const streetUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=19&size=640x640&maptype=roadmap&key=${apiKey}`;
    
    Logger.log('Satellite image URL generated: ' + imageUrl.substring(0, 100) + '...');
    
    // Test if the image URL is accessible
    try {
      const testResponse = UrlFetchApp.fetch(imageUrl);
      const testCode = testResponse.getResponseCode();
      Logger.log('Image URL test response code: ' + testCode);
      
      if (testCode !== 200) {
        const errorText = testResponse.getContentText();
        Logger.log('Image URL test failed. Response: ' + errorText.substring(0, 200));
        return { 
          success: false, 
          error: 'Failed to generate satellite image. Please check Google Maps API configuration.' 
        };
      }
    } catch (testError) {
      Logger.log('Image URL test error: ' + testError.toString());
      // Continue anyway - the URL might still work in the browser
    }
    
    return {
      success: true,
      satelliteImageUrl: imageUrl,
      streetImageUrl: streetUrl,
      coordinates: { lat: lat, lng: lng },
      formattedAddress: geocodeData.results[0].formatted_address
    };
    
  } catch (error) {
    Logger.log('Error getting satellite image: ' + error.toString());
    Logger.log('Error stack: ' + (error.stack || 'No stack trace'));
    return { success: false, error: error.toString() };
  }
}

/**
 * Save customer information and upload photos to Google Drive
 */
function saveCustomerInfoAndPhotos(name, email, address, gateCode, pets, poolType, houseInfo, poolIssues, photos) {
  try {
    const DRIVE_FOLDER_ID = '1caFBUhSzE5WNAm9vCT4dwDQuAO0iuo1h';
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // Try to save to Customers sheet if it exists
    let customersSheet = spreadsheet.getSheetByName('Customers');
    if (!customersSheet) {
      // Create Customers sheet if it doesn't exist
      customersSheet = spreadsheet.insertSheet('Customers');
      customersSheet.appendRow(['Name', 'Email', 'Address', 'Gate Code', 'Pets', 'Pool Type', 'House Info', 'Pool Issues', 'Drive Folder ID', 'Date Created']);
      // Format header row
      const headerRange = customersSheet.getRange(1, 1, 1, 10);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#1a1a1a');
      headerRange.setFontColor('#3b82f6');
      headerRange.setFontSize(11);
    } else {
      // Ensure headers are correct - check and update if needed
      const headers = customersSheet.getRange(1, 1, 1, customersSheet.getLastColumn()).getValues()[0];
      const requiredHeaders = ['Name', 'Email', 'Address', 'Gate Code', 'Pets', 'Pool Type', 'House Info', 'Pool Issues', 'Drive Folder ID', 'Date Created'];
      let needsUpdate = false;
      
      // Check if all required headers exist
      for (let i = 0; i < requiredHeaders.length; i++) {
        if (headers.indexOf(requiredHeaders[i]) === -1) {
          needsUpdate = true;
          break;
        }
      }
      
      // If headers need updating, add missing columns
      if (needsUpdate) {
        const lastCol = customersSheet.getLastColumn();
        let colIndex = lastCol + 1;
        for (let i = 0; i < requiredHeaders.length; i++) {
          if (headers.indexOf(requiredHeaders[i]) === -1) {
            customersSheet.getRange(1, colIndex).setValue(requiredHeaders[i]);
            colIndex++;
          }
        }
        // Format header row
        const headerRange = customersSheet.getRange(1, 1, 1, customersSheet.getLastColumn());
        headerRange.setFontWeight('bold');
        headerRange.setBackground('#1a1a1a');
        headerRange.setFontColor('#3b82f6');
        headerRange.setFontSize(11);
      }
    }
    
    // Create folder in Google Drive
    const folderName = name + ' - ' + address;
    const parentFolder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    let customerFolder;
    
    // Check if folder already exists
    const existingFolders = parentFolder.getFoldersByName(folderName);
    if (existingFolders.hasNext()) {
      customerFolder = existingFolders.next();
    } else {
      customerFolder = parentFolder.createFolder(folderName);
    }
    
    const folderId = customerFolder.getId();
    
    // Get satellite image and save to folder
    try {
      const satelliteResult = getSatelliteImageForAddress(address);
      if (satelliteResult.success && satelliteResult.satelliteImageUrl) {
        // Download and save satellite image
        const imageResponse = UrlFetchApp.fetch(satelliteResult.satelliteImageUrl);
        const imageBlob = imageResponse.getBlob();
        customerFolder.createFile(imageBlob.setName('Property Satellite View.png'));
        Logger.log('Satellite image saved for: ' + email);
      }
    } catch (error) {
      Logger.log('Error saving satellite image: ' + error.toString());
      // Don't fail the whole process if satellite image fails
    }
    
    // Create "Photos" subfolder if photos exist
    if (photos && photos.length > 0) {
      let photosFolder;
      const existingPhotosFolders = customerFolder.getFoldersByName('Photos');
      if (existingPhotosFolders.hasNext()) {
        photosFolder = existingPhotosFolders.next();
      } else {
        photosFolder = customerFolder.createFolder('Photos');
      }
      
      // Upload photos
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        try {
          // Convert base64 to blob
          const base64Data = photo.data.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
          const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), 'image/' + photo.type.split('/')[1], photo.name);
          photosFolder.createFile(blob);
        } catch (error) {
          Logger.log('Error uploading photo ' + photo.name + ': ' + error.toString());
        }
      }
    }
    
    // Save to Customers sheet
    const headers = customersSheet.getRange(1, 1, 1, customersSheet.getLastColumn()).getValues()[0];
    const newRow = [];
    
    // Find column indices or create defaults
    const nameCol = headers.indexOf('Name');
    const emailCol = headers.indexOf('Email');
    const addressCol = headers.indexOf('Address');
    const gateCodeCol = headers.indexOf('Gate Code');
    const petsCol = headers.indexOf('Pets');
    const poolTypeCol = headers.indexOf('Pool Type');
    const houseInfoCol = headers.indexOf('House Info');
    const poolIssuesCol = headers.indexOf('Pool Issues');
    const folderIdCol = headers.indexOf('Drive Folder ID');
    const dateCol = headers.indexOf('Date Created');
    
    // Build row array
    for (let i = 0; i < headers.length; i++) {
      newRow.push('');
    }
    
    if (nameCol !== -1) newRow[nameCol] = name;
    if (emailCol !== -1) newRow[emailCol] = email.toLowerCase().trim();
    if (addressCol !== -1) newRow[addressCol] = address || '';
    if (gateCodeCol !== -1) newRow[gateCodeCol] = gateCode || '';
    if (petsCol !== -1) newRow[petsCol] = pets || '';
    if (poolTypeCol !== -1) newRow[poolTypeCol] = poolType || '';
    if (houseInfoCol !== -1) newRow[houseInfoCol] = houseInfo || '';
    if (poolIssuesCol !== -1) newRow[poolIssuesCol] = poolIssues || '';
    if (folderIdCol !== -1) newRow[folderIdCol] = folderId;
    if (dateCol !== -1) newRow[dateCol] = new Date();
    
    customersSheet.appendRow(newRow);
    
    Logger.log('Customer info and photos saved successfully for: ' + email);
    
    // Return folder ID so it can be saved to Customer Portal sheet
    return { folderId: folderId };
    
  } catch (error) {
    Logger.log('Error saving customer info and photos: ' + error.toString());
    throw error;
  }
}

/**
 * Authenticate with OAuth provider (Google/Apple)
 */
function authenticateWithOAuth(provider, email, name, picture) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = getCustomerPortalSheet(spreadsheet);
    
    if (!authSheet) {
      return { success: false, error: 'Authentication sheet not found' };
    }
    
    const data = authSheet.getDataRange().getValues();
    
    // Headers in row 2 (index 1), data starts row 3 (index 2)
    let headers = [];
    let dataStartRow = 2;
    
    if (data.length > 1) {
      headers = data[1];
    } else if (data.length > 0) {
      headers = data[0];
      dataStartRow = 1;
    }
    
    // Find columns
    let emailCol = -1;
    let nameCol = -1;
    let passwordCol = -1;
    let roleCol = -1;
    let statusCol = -1;
    let accountStatusCol = -1;
    
    for (let i = 0; i < headers.length; i++) {
      const header = (headers[i] || '').toString().toLowerCase().trim();
      if (header === 'email' || header === 'email address') emailCol = i;
      if (header === 'name') nameCol = i;
      if (header === 'password' || header === 'password hash') passwordCol = i;
      if (header === 'role' || header === 'user role') roleCol = i;
      if (header === 'status') statusCol = i;
      if (header === 'account status') accountStatusCol = i;
    }
    
    if (emailCol === -1) {
      return { success: false, error: 'Authentication sheet structure error' };
    }
    
    // Check if customer exists
    let customerExists = false;
    let customerRowIndex = -1;
    
    for (let i = dataStartRow; i < data.length; i++) {
      const row = data[i];
      const rowEmail = (row[emailCol] || '').toString().toLowerCase().trim();
      const rowRole = (row[roleCol] || '').toString();
      
      if (rowEmail === email.toLowerCase().trim() && rowRole === 'Customer') {
        customerExists = true;
        customerRowIndex = i;
        break;
      }
    }
    
    // If customer doesn't exist, create account
    if (!customerExists) {
      const newRow = [];
      for (let i = 0; i < headers.length; i++) {
        newRow.push('');
      }
      
      newRow[nameCol] = name;
      newRow[emailCol] = email.toLowerCase().trim();
      if (passwordCol !== -1) newRow[passwordCol] = ''; // No password for OAuth
      if (roleCol !== -1) newRow[roleCol] = 'Customer';
      if (statusCol !== -1) newRow[statusCol] = 'Active';
      if (accountStatusCol !== -1) newRow[accountStatusCol] = 'Approved';
      
      authSheet.appendRow(newRow);
    } else {
      // Update name if it changed
      if (nameCol !== -1 && customerRowIndex !== -1) {
        const rowNum = customerRowIndex + 1;
        const currentName = (authSheet.getRange(rowNum, nameCol + 1).getValue() || '').toString();
        if (!currentName || currentName.trim() === '') {
          authSheet.getRange(rowNum, nameCol + 1).setValue(name);
        }
      }
    }
    
    return {
      success: true,
      user: {
        email: email.toLowerCase().trim(),
        name: name,
        role: 'Customer'
      }
    };
    
  } catch (error) {
    Logger.log('OAuth auth error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Get customer projects
 */
function getCustomerProjects(customerEmail) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const projectsSheet = spreadsheet.getSheetByName(PROJECTS_SHEET_NAME);
    
    if (!projectsSheet) {
      return {
        success: true,
        projects: []
      };
    }
    
    const data = projectsSheet.getDataRange().getValues();
    if (data.length <= 1) {
      return {
        success: true,
        projects: []
      };
    }
    
    const headers = data[0];
    const projectIdCol = headers.indexOf('Project ID');
    const emailCol = headers.indexOf('Customer Email');
    const nameCol = headers.indexOf('Customer Name');
    const typeCol = headers.indexOf('Project Type');
    const statusCol = headers.indexOf('Status');
    const startDateCol = headers.indexOf('Start Date');
    const completionDateCol = headers.indexOf('Estimated Completion Date');
    const phaseCol = headers.indexOf('Current Phase');
    const notesCol = headers.indexOf('Notes');
    const createdDateCol = headers.indexOf('Created Date');
    const lastUpdatedCol = headers.indexOf('Last Updated');
    
    if (emailCol === -1) {
      return {
        success: false,
        error: 'Projects sheet structure error'
      };
    }
    
    const projects = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rowEmail = (row[emailCol] || '').toString().toLowerCase().trim();
      
      if (rowEmail === customerEmail.toLowerCase().trim()) {
        const project = {
          projectId: row[projectIdCol] || '',
          customerEmail: row[emailCol] || '',
          customerName: row[nameCol] || '',
          projectType: row[typeCol] || 'Other',
          status: row[statusCol] || 'Planning',
          startDate: row[startDateCol] || '',
          estimatedCompletionDate: row[completionDateCol] || '',
          currentPhase: row[phaseCol] || '',
          notes: row[notesCol] || '',
          createdDate: row[createdDateCol] || '',
          lastUpdated: row[lastUpdatedCol] || ''
        };
        
        projects.push(project);
      }
    }
    
    return {
      success: true,
      projects: projects
    };
    
  } catch (error) {
    Logger.log('Error getting customer projects: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Get customer jobs
 */
function getCustomerJobs(customerEmail) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const jobsSheet = spreadsheet.getSheetByName(JOBS_SHEET_NAME);
    
    if (!jobsSheet) {
      return {
        success: true,
        jobs: []
      };
    }
    
    const data = jobsSheet.getDataRange().getValues();
    if (data.length <= 1) {
      return {
        success: true,
        jobs: []
      };
    }
    
    const headers = data[0];
    const jobIdCol = headers.indexOf('Job ID');
    const customerNameCol = headers.indexOf('Customer Name');
    const customerEmailCol = headers.indexOf('Customer Email');
    const customerPhoneCol = headers.indexOf('Customer Phone');
    const serviceTypeCol = headers.indexOf('Service Type');
    const statusCol = headers.indexOf('Status');
    const scheduledDateCol = headers.indexOf('Scheduled Date');
    const scheduledTimeCol = headers.indexOf('Scheduled Time');
    const assignedToCol = headers.indexOf('Assigned To');
    const addressCol = headers.indexOf('Address');
    const notesCol = headers.indexOf('Notes');
    const createdDateCol = headers.indexOf('Created Date');
    const completedDateCol = headers.indexOf('Completed Date');
    const invoiceAmountCol = headers.indexOf('Invoice Amount');
    const invoiceStatusCol = headers.indexOf('Invoice Status');
    
    if (customerEmailCol === -1) {
      return {
        success: false,
        error: 'Jobs sheet structure error'
      };
    }
    
    const jobs = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rowEmail = (row[customerEmailCol] || '').toString().toLowerCase().trim();
      
      if (rowEmail === customerEmail.toLowerCase().trim()) {
        const job = {
          jobId: row[jobIdCol] || '',
          customerName: row[customerNameCol] || '',
          customerEmail: row[customerEmailCol] || '',
          customerPhone: row[customerPhoneCol] || '',
          serviceType: row[serviceTypeCol] || '',
          status: row[statusCol] || 'Scheduled',
          scheduledDate: row[scheduledDateCol] || '',
          scheduledTime: row[scheduledTimeCol] || '',
          assignedTo: row[assignedToCol] || '',
          address: row[addressCol] || '',
          notes: row[notesCol] || '',
          createdDate: row[createdDateCol] || '',
          completedDate: row[completedDateCol] || '',
          invoiceAmount: parseFloat(row[invoiceAmountCol]) || 0,
          invoiceStatus: row[invoiceStatusCol] || ''
        };
        
        jobs.push(job);
      }
    }
    
    // Sort by scheduled date (most recent first)
    jobs.sort((a, b) => {
      const dateA = a.scheduledDate ? new Date(a.scheduledDate) : new Date(0);
      const dateB = b.scheduledDate ? new Date(b.scheduledDate) : new Date(0);
      return dateB - dateA;
    });
    
    return {
      success: true,
      jobs: jobs
    };
    
  } catch (error) {
    Logger.log('Error getting customer jobs: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Get orderables/items with tracking for a customer (from invoices or projects)
 */
function getCustomerOrderables(customerEmail) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const itemsSheet = spreadsheet.getSheetByName(PROJECT_ITEMS_SHEET_NAME);
    
    if (!itemsSheet) {
      return {
        success: true,
        orderables: []
      };
    }
    
    // First get all projects for this customer
    const projectsResult = getCustomerProjects(customerEmail);
    if (!projectsResult.success) {
      return {
        success: true,
        orderables: []
      };
    }
    
    const projects = projectsResult.projects || [];
    const projectIds = projects.map(p => p.projectId);
    
    if (projectIds.length === 0) {
      return {
        success: true,
        orderables: []
      };
    }
    
    const data = itemsSheet.getDataRange().getValues();
    if (data.length <= 1) {
      return {
        success: true,
        orderables: []
      };
    }
    
    const headers = data[0];
    const projectIdCol = headers.indexOf('Project ID');
    const itemNameCol = headers.indexOf('Item Name');
    const descriptionCol = headers.indexOf('Item Description');
    const quantityCol = headers.indexOf('Quantity');
    const unitPriceCol = headers.indexOf('Unit Price');
    const totalCostCol = headers.indexOf('Total Cost');
    const orderDateCol = headers.indexOf('Order Date');
    const deliveryDateCol = headers.indexOf('Delivery Date');
    const statusCol = headers.indexOf('Status');
    const vendorCol = headers.indexOf('Vendor/Supplier');
    const trackingNumberCol = headers.indexOf('Tracking Number');
    const notesCol = headers.indexOf('Notes');
    const addedDateCol = headers.indexOf('Added Date');
    
    if (projectIdCol === -1) {
      return {
        success: false,
        error: 'Project Items sheet structure error'
      };
    }
    
    const orderables = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rowProjectId = (row[projectIdCol] || '').toString();
      
      if (projectIds.includes(rowProjectId)) {
        const status = (row[statusCol] || 'Ordered').toString();
        
        // Calculate progress percentage
        let progress = 0;
        if (status === 'Ordered') progress = 25;
        else if (status === 'Shipped' || status === 'In Transit') progress = 50;
        else if (status === 'Received') progress = 75;
        else if (status === 'Installed' || status === 'Delivered') progress = 100;
        
        const orderable = {
          projectId: rowProjectId,
          itemName: row[itemNameCol] || '',
          description: row[descriptionCol] || '',
          quantity: parseFloat(row[quantityCol]) || 0,
          unitPrice: parseFloat(row[unitPriceCol]) || 0,
          totalCost: parseFloat(row[totalCostCol]) || 0,
          orderDate: row[orderDateCol] || '',
          deliveryDate: row[deliveryDateCol] || '',
          status: status,
          vendor: row[vendorCol] || '',
          trackingNumber: row[trackingNumberCol] || '',
          notes: row[notesCol] || '',
          addedDate: row[addedDateCol] || '',
          progress: progress
        };
        
        orderables.push(orderable);
      }
    }
    
    // Sort by order date (most recent first)
    orderables.sort((a, b) => {
      const dateA = a.orderDate ? new Date(a.orderDate) : new Date(0);
      const dateB = b.orderDate ? new Date(b.orderDate) : new Date(0);
      return dateB - dateA;
    });
    
    return {
      success: true,
      orderables: orderables
    };
    
  } catch (error) {
    Logger.log('Error getting customer orderables: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Get project budget sheet data
 */
function getProjectBudget(projectId) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const budgetSheet = spreadsheet.getSheetByName('Pool Project Budget');
    
    if (!budgetSheet) {
      return { success: true, budget: [] };
    }
    
    const data = budgetSheet.getDataRange().getValues();
    if (data.length <= 1) {
      return { success: true, budget: [] };
    }
    
    const headers = data[0];
    const projectIdCol = headers.indexOf('Project ID');
    const invoiceIdCol = headers.indexOf('Invoice ID');
    const invoiceNumberCol = headers.indexOf('Invoice Number');
    const customerEmailCol = headers.indexOf('Customer Email');
    const customerNameCol = headers.indexOf('Customer Name');
    const itemNameCol = headers.indexOf('Item Name');
    const itemDescCol = headers.indexOf('Item Description');
    const quantityCol = headers.indexOf('Quantity');
    const budgetedAmountCol = headers.indexOf('Budgeted Amount');
    const actualCostCol = headers.indexOf('Actual Cost');
    const statusCol = headers.indexOf('Status');
    const orderDateCol = headers.indexOf('Order Date');
    const deliveryDateCol = headers.indexOf('Delivery Date');
    const trackingNumberCol = headers.indexOf('Tracking Number');
    const vendorCol = headers.indexOf('Vendor');
    const notesCol = headers.indexOf('Notes');
    const createdDateCol = headers.indexOf('Created Date');
    const lastUpdatedCol = headers.indexOf('Last Updated');
    
    if (projectIdCol === -1) {
      return { success: false, error: 'Budget sheet structure error' };
    }
    
    const budget = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if ((row[projectIdCol] || '').toString() === projectId.toString()) {
        budget.push({
          invoiceId: (invoiceIdCol !== -1) ? (row[invoiceIdCol] || '') : '',
          invoiceNumber: (invoiceNumberCol !== -1) ? (row[invoiceNumberCol] || '') : '',
          customerEmail: (customerEmailCol !== -1) ? (row[customerEmailCol] || '') : '',
          customerName: (customerNameCol !== -1) ? (row[customerNameCol] || '') : '',
          itemName: (itemNameCol !== -1) ? (row[itemNameCol] || '') : '',
          itemDescription: (itemDescCol !== -1) ? (row[itemDescCol] || '') : '',
          quantity: (quantityCol !== -1) ? parseFloat(row[quantityCol]) || 0 : 0,
          budgetedAmount: (budgetedAmountCol !== -1) ? parseFloat(row[budgetedAmountCol]) || 0 : 0,
          actualCost: (actualCostCol !== -1) ? parseFloat(row[actualCostCol]) || 0 : 0,
          status: (statusCol !== -1) ? (row[statusCol] || 'Ordered').toString() : 'Ordered',
          orderDate: (orderDateCol !== -1) ? (row[orderDateCol] || '') : '',
          deliveryDate: (deliveryDateCol !== -1) ? (row[deliveryDateCol] || '') : '',
          trackingNumber: (trackingNumberCol !== -1) ? (row[trackingNumberCol] || '').toString() : '',
          vendor: (vendorCol !== -1) ? (row[vendorCol] || '').toString() : '',
          notes: (notesCol !== -1) ? (row[notesCol] || '').toString() : '',
          createdDate: (createdDateCol !== -1) ? (row[createdDateCol] || '') : '',
          lastUpdated: (lastUpdatedCol !== -1) ? (row[lastUpdatedCol] || '') : ''
        });
      }
    }
    
    return {
      success: true,
      budget: budget
    };
    
  } catch (error) {
    Logger.log('Error getting project budget: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Get project items for a specific project
 */
function getProjectItems(projectId) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const itemsSheet = spreadsheet.getSheetByName(PROJECT_ITEMS_SHEET_NAME);
    
    if (!itemsSheet) {
      return {
        success: true,
        items: []
      };
    }
    
    const data = itemsSheet.getDataRange().getValues();
    if (data.length <= 1) {
      return {
        success: true,
        items: []
      };
    }
    
    const headers = data[0];
    const projectIdCol = headers.indexOf('Project ID');
    const itemNameCol = headers.indexOf('Item Name');
    const descriptionCol = headers.indexOf('Item Description');
    const quantityCol = headers.indexOf('Quantity');
    const unitPriceCol = headers.indexOf('Unit Price');
    const totalCostCol = headers.indexOf('Total Cost');
    const orderDateCol = headers.indexOf('Order Date');
    const deliveryDateCol = headers.indexOf('Delivery Date');
    const statusCol = headers.indexOf('Status');
    const vendorCol = headers.indexOf('Vendor/Supplier');
    const trackingNumberCol = headers.indexOf('Tracking Number');
    const notesCol = headers.indexOf('Notes');
    const addedDateCol = headers.indexOf('Added Date');
    
    if (projectIdCol === -1) {
      return {
        success: false,
        error: 'Project Items sheet structure error'
      };
    }
    
    const items = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rowProjectId = (row[projectIdCol] || '').toString();
      
      if (rowProjectId === projectId.toString()) {
        const item = {
          itemName: row[itemNameCol] || '',
          description: row[descriptionCol] || '',
          quantity: parseFloat(row[quantityCol]) || 0,
          unitPrice: parseFloat(row[unitPriceCol]) || 0,
          totalCost: parseFloat(row[totalCostCol]) || 0,
          orderDate: row[orderDateCol] || '',
          deliveryDate: row[deliveryDateCol] || '',
          status: row[statusCol] || 'Ordered',
          vendor: row[vendorCol] || '',
          trackingNumber: (trackingNumberCol !== -1) ? (row[trackingNumberCol] || '') : '',
          notes: row[notesCol] || '',
          addedDate: row[addedDateCol] || ''
        };
        
        items.push(item);
      }
    }
    
    return {
      success: true,
      items: items
    };
    
  } catch (error) {
    Logger.log('Error getting project items: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Get customer profile information including extended data from Customers sheet
 */
function getCustomerProfile(customerEmail) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // First check Customers sheet for extended info
    let customersSheet = spreadsheet.getSheetByName('Customers');
    let profile = {
      email: customerEmail,
      name: '',
      address: '',
      gateCode: '',
      houseInfo: '',
      poolIssues: '',
      customerId: '' // Customer ID from column A
    };
    
    if (customersSheet) {
      const customersData = customersSheet.getDataRange().getValues();
      if (customersData.length > 1) {
        const headers = customersData[0];
        const emailCol = headers.indexOf('Email');
        
        if (emailCol !== -1) {
          for (let i = 1; i < customersData.length; i++) {
            const row = customersData[i];
            const rowEmail = (row[emailCol] || '').toString().toLowerCase().trim();
            
            if (rowEmail === customerEmail.toLowerCase().trim()) {
              // Customer ID is in column A (index 0)
              profile.customerId = (row[0] || '').toString().trim();
              
              const nameCol = headers.indexOf('Name');
              const addressCol = headers.indexOf('Address');
              const gateCodeCol = headers.indexOf('Gate Code');
              const houseInfoCol = headers.indexOf('House Info');
              const poolIssuesCol = headers.indexOf('Pool Issues');
              
              profile.name = (nameCol !== -1) ? (row[nameCol] || '').toString() : '';
              profile.address = (addressCol !== -1) ? (row[addressCol] || '').toString() : '';
              profile.gateCode = (gateCodeCol !== -1) ? (row[gateCodeCol] || '').toString() : '';
              const petsCol = headers.indexOf('Pets');
              const poolTypeCol = headers.indexOf('Pool Type');
              profile.pets = (petsCol !== -1) ? (row[petsCol] || '').toString() : '';
              profile.poolType = (poolTypeCol !== -1) ? (row[poolTypeCol] || '').toString() : '';
              profile.houseInfo = (houseInfoCol !== -1) ? (row[houseInfoCol] || '').toString() : '';
              profile.poolIssues = (poolIssuesCol !== -1) ? (row[poolIssuesCol] || '').toString() : '';
              break;
            }
          }
        }
      }
    }
    
    // If name not found, check Customer Portal sheet (or Authentication sheet as fallback)
    if (!profile.name) {
      const authSheet = getCustomerPortalSheet(spreadsheet);
      if (authSheet) {
        const authData = authSheet.getDataRange().getValues();
        let headers = [];
        if (authData.length > 1) {
          headers = authData[1]; // Headers in row 2
        } else if (authData.length > 0) {
          headers = authData[0];
        }
        
        const emailCol = headers.indexOf('Email');
        const nameCol = headers.indexOf('Name');
        const savedDataCol = headers.indexOf('_ saved data');
        
        if (emailCol !== -1) {
          const dataStartRow = authData.length > 1 ? 2 : 1;
          for (let i = dataStartRow; i < authData.length; i++) {
            const row = authData[i];
            const rowEmail = (row[emailCol] || '').toString().toLowerCase().trim();
            
            if (rowEmail === customerEmail.toLowerCase().trim()) {
              profile.name = (nameCol !== -1) ? (row[nameCol] || '').toString() : customerEmail;
              
              // Get profile picture from saved data
              if (savedDataCol !== -1) {
                const savedDataStr = (row[savedDataCol] || '').toString();
                if (savedDataStr) {
                  try {
                    const savedData = JSON.parse(savedDataStr);
                    if (savedData.profilePicture) {
                      profile.profilePicture = savedData.profilePicture;
                    }
                  } catch (e) {
                    // Ignore parse errors
                  }
                }
              }
              
              break;
            }
          }
        }
      }
    }
    
    return {
      success: true,
      profile: profile
    };
    
  } catch (error) {
    Logger.log('Error getting customer profile: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Update customer profile (gate code, phone, address)
 */
function updateCustomerProfile(customerEmail, profileData) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = getCustomerPortalSheet(spreadsheet);
    
    if (!authSheet) {
      return {
        success: false,
        error: 'Authentication sheet not found'
      };
    }
    
    const data = authSheet.getDataRange().getValues();
    const headers = data[0];
    const emailCol = headers.indexOf('Email');
    const phoneCol = headers.indexOf('Phone');
    const addressCol = headers.indexOf('Address');
    const gateCodeCol = headers.indexOf('Gate Code');
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rowEmail = (row[emailCol] || '').toString().toLowerCase().trim();
      
      if (rowEmail === customerEmail.toLowerCase().trim()) {
        const rowNum = i + 1;
        
        if (profileData.phone !== undefined && phoneCol !== -1) {
          authSheet.getRange(rowNum, phoneCol + 1).setValue(profileData.phone);
        }
        if (profileData.address !== undefined && addressCol !== -1) {
          authSheet.getRange(rowNum, addressCol + 1).setValue(profileData.address);
        }
        if (profileData.gateCode !== undefined && gateCodeCol !== -1) {
          authSheet.getRange(rowNum, gateCodeCol + 1).setValue(profileData.gateCode);
        }
        
        return {
          success: true,
          message: 'Profile updated successfully'
        };
      }
    }
    
    return {
      success: false,
      error: 'Customer not found'
    };
    
  } catch (error) {
    Logger.log('Error updating customer profile: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Get customer invoices
 * Matches invoices by Customer Email OR Customer ID (for more reliable linking)
 */
function getCustomerInvoices(customerEmail) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(INVOICES_ESTIMATES_SHEET);
    
    if (!sheet) {
      return { success: true, invoices: [] };
    }
    
    const dataRows = sheet.getDataRange().getValues();
    if (dataRows.length < 2) {
      return { success: true, invoices: [] };
    }
    
    const headers = dataRows[0];
    const emailCol = headers.indexOf('Customer Email');
    const customerIdCol = headers.indexOf('Customer ID');
    const typeCol = headers.indexOf('Type');
    const statusCol = headers.indexOf('Status');
    const paymentStatusCol = headers.indexOf('Payment Status') !== -1 ? headers.indexOf('Payment Status') : -1;
    
    if (emailCol === -1 || typeCol === -1) {
      return { success: true, invoices: [] };
    }
    
    const invoices = [];
    const customerEmailLower = customerEmail.toLowerCase().trim();
    const seenInvoiceIds = new Set(); // Prevent duplicates if invoice matches both email and ID
    
    for (let i = 1; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowEmail = (row[emailCol] || '').toString().toLowerCase().trim();
      const rowCustomerId = (customerIdCol !== -1 && row[customerIdCol]) ? (row[customerIdCol] || '').toString().toLowerCase().trim() : '';
      const rowType = (row[typeCol] || '').toString();
      const invoiceId = row[0];
      
      // Skip if not an invoice or already seen
      if (rowType !== 'Invoice' || seenInvoiceIds.has(invoiceId)) {
        continue;
      }
      
      // Skip Draft invoices - customers should not see draft invoices
      const rowStatus = (row[statusCol] || '').toString();
      if (rowStatus.toLowerCase() === 'draft') {
        continue;
      }
      
      // Match by email OR by Customer ID (which might be the email or a different ID)
      const matchesEmail = rowEmail === customerEmailLower;
      const matchesCustomerId = rowCustomerId && (rowCustomerId === customerEmailLower || rowCustomerId === customerEmail);
      
      if (matchesEmail || matchesCustomerId) {
        seenInvoiceIds.add(invoiceId);
        invoices.push({
          id: invoiceId,
          invoiceNumber: row[headers.indexOf('Invoice Number')] || invoiceId,
          date: row[headers.indexOf('Date')] || '',
          dueDate: row[headers.indexOf('Due Date')] || '',
          total: row[headers.indexOf('Total')] || 0,
          status: (paymentStatusCol !== -1 && row[paymentStatusCol]) ? row[paymentStatusCol] : (row[statusCol] || ''),
          shareLink: row[headers.indexOf('Share Link')] || ''
        });
      }
    }
    
    // Sort by date descending
    invoices.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    return { success: true, invoices: invoices };
  } catch (error) {
    Logger.log('Error getting customer invoices: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Get detailed invoice information including payment history and payment schedule
 */
function getCustomerInvoiceDetails(invoiceId, customerEmail) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const invoiceSheet = spreadsheet.getSheetByName(INVOICES_ESTIMATES_SHEET);
    
    if (!invoiceSheet) {
      return { success: false, error: 'Invoice sheet not found' };
    }
    
    const dataRows = invoiceSheet.getDataRange().getValues();
    if (dataRows.length < 2) {
      return { success: false, error: 'Invoice not found' };
    }
    
    const headers = dataRows[0];
    const emailCol = headers.indexOf('Customer Email');
    const customerIdCol = headers.indexOf('Customer ID');
    
    // Find invoice
    let invoiceData = null;
    for (let i = 1; i < dataRows.length; i++) {
      if (dataRows[i][0] === invoiceId) {
        const row = dataRows[i];
        const rowEmail = (row[emailCol] || '').toString().toLowerCase().trim();
        const rowCustomerId = (customerIdCol !== -1 && row[customerIdCol]) ? (row[customerIdCol] || '').toString().toLowerCase().trim() : '';
        const customerEmailLower = customerEmail.toLowerCase().trim();
        
        // Verify customer owns this invoice
        const matchesEmail = rowEmail === customerEmailLower;
        const matchesCustomerId = rowCustomerId && (rowCustomerId === customerEmailLower || rowCustomerId === customerEmail);
        
        if (matchesEmail || matchesCustomerId) {
          // Check if invoice is Draft - customers should not see draft invoices
          const rowStatus = (row[headers.indexOf('Status')] || '').toString();
          if (rowStatus.toLowerCase() === 'draft') {
            return { success: false, error: 'Invoice not found or access denied' };
          }
          
          // Parse items JSON safely
          let itemsJson = '[]';
          const itemsCol = headers.indexOf('Items JSON');
          if (itemsCol !== -1 && row[itemsCol]) {
            const itemsValue = row[itemsCol];
            if (typeof itemsValue === 'string') {
              itemsJson = itemsValue;
            } else if (Array.isArray(itemsValue)) {
              itemsJson = JSON.stringify(itemsValue);
            } else if (typeof itemsValue === 'object' && itemsValue !== null) {
              itemsJson = JSON.stringify(itemsValue);
            }
          }
          
          invoiceData = {
            id: row[0],
            type: row[headers.indexOf('Type')] || '',
            status: row[headers.indexOf('Status')] || '',
            customerName: row[headers.indexOf('Customer Name')] || '',
            customerEmail: row[headers.indexOf('Customer Email')] || '',
            customerPhone: row[headers.indexOf('Customer Phone')] || '',
            customerAddress: row[headers.indexOf('Customer Address')] || '',
            date: row[headers.indexOf('Date')] || '',
            dueDate: row[headers.indexOf('Due Date')] || '',
            invoiceNumber: row[headers.indexOf('Invoice Number')] || row[0],
            subtotal: row[headers.indexOf('Subtotal')] || 0,
            taxRate: row[headers.indexOf('Tax Rate')] || 0,
            taxAmount: row[headers.indexOf('Tax Amount')] || 0,
            discount: row[headers.indexOf('Discount')] || 0,
            total: row[headers.indexOf('Total')] || 0,
            items: itemsJson, // Ensure it's always a JSON string
            notes: row[headers.indexOf('Notes')] || '',
            terms: row[headers.indexOf('Terms')] || '',
            shareLink: row[headers.indexOf('Share Link')] || '',
            paymentStatus: (headers.indexOf('Payment Status') !== -1 && row[headers.indexOf('Payment Status')]) ? row[headers.indexOf('Payment Status')] : '',
            projectId: (headers.indexOf('Project ID') !== -1 && row[headers.indexOf('Project ID')]) ? row[headers.indexOf('Project ID')] : ''
          };
          break;
        }
      }
    }
    
    if (!invoiceData) {
      return { success: false, error: 'Invoice not found or access denied' };
    }
    
    // Get payment history for this invoice
    const paymentHistorySheet = spreadsheet.getSheetByName('Payment History');
    const payments = [];
    let totalPaid = 0;
    
    if (paymentHistorySheet) {
      const paymentData = paymentHistorySheet.getDataRange().getValues();
      if (paymentData.length > 1) {
        const paymentHeaders = paymentData[0];
        const invoiceIdCol = paymentHeaders.indexOf('Invoice ID');
        const amountCol = paymentHeaders.indexOf('Amount');
        const dateCol = paymentHeaders.indexOf('Date');
        const methodCol = paymentHeaders.indexOf('Payment Method');
        const transactionIdCol = paymentHeaders.indexOf('Transaction ID');
        const statusCol = paymentHeaders.indexOf('Status');
        
        if (invoiceIdCol !== -1) {
          for (let i = 1; i < paymentData.length; i++) {
            if (paymentData[i][invoiceIdCol] === invoiceId) {
              const amount = parseFloat(paymentData[i][amountCol] || 0);
              totalPaid += amount;
              payments.push({
                date: paymentData[i][dateCol] || '',
                amount: amount,
                method: paymentData[i][methodCol] || '',
                transactionId: paymentData[i][transactionIdCol] || '',
                status: paymentData[i][statusCol] || 'Completed'
              });
            }
          }
        }
      }
    }
    
    // Get payment schedule if exists
    const scheduleSheet = spreadsheet.getSheetByName(PAYMENT_SCHEDULES_SHEET);
    let paymentSchedule = null;
    
    if (scheduleSheet && invoiceData.projectId) {
      const scheduleData = scheduleSheet.getDataRange().getValues();
      if (scheduleData.length > 1) {
        const scheduleHeaders = scheduleData[0];
        const invoiceIdCol = scheduleHeaders.indexOf('Invoice ID');
        const scheduleIdCol = scheduleHeaders.indexOf('Payment Schedule ID');
        const milestonesCol = scheduleHeaders.indexOf('Payment Milestones JSON');
        
        for (let i = 1; i < scheduleData.length; i++) {
          if (scheduleData[i][invoiceIdCol] === invoiceId) {
            try {
              const milestones = JSON.parse(scheduleData[i][milestonesCol] || '[]');
              paymentSchedule = {
                paymentScheduleId: scheduleData[i][scheduleIdCol],
                milestones: milestones
              };
              break;
            } catch (e) {
              Logger.log('Error parsing payment schedule: ' + e.toString());
            }
          }
        }
      }
    }
    
    // Calculate payment progress
    const remaining = parseFloat(invoiceData.total) - totalPaid;
    const paymentProgress = parseFloat(invoiceData.total) > 0 ? (totalPaid / parseFloat(invoiceData.total)) * 100 : 0;
    
    return {
      success: true,
      invoice: invoiceData,
      payments: payments.sort((a, b) => new Date(b.date) - new Date(a.date)),
      totalPaid: totalPaid,
      remaining: remaining,
      paymentProgress: paymentProgress,
      paymentSchedule: paymentSchedule
    };
  } catch (error) {
    Logger.log('Error getting invoice details: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Get customer estimates
 * Matches estimates by Customer Email OR Customer ID (for more reliable linking)
 */
function getCustomerEstimates(customerEmail) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(INVOICES_ESTIMATES_SHEET);
    
    if (!sheet) {
      return { success: true, estimates: [] };
    }
    
    const dataRows = sheet.getDataRange().getValues();
    if (dataRows.length < 2) {
      return { success: true, estimates: [] };
    }
    
    const headers = dataRows[0];
    const emailCol = headers.indexOf('Customer Email');
    const customerIdCol = headers.indexOf('Customer ID');
    const typeCol = headers.indexOf('Type');
    const approvalStatusCol = headers.indexOf('Approval Status') !== -1 ? headers.indexOf('Approval Status') : -1;
    
    if (emailCol === -1 || typeCol === -1) {
      return { success: true, estimates: [] };
    }
    
    const estimates = [];
    const customerEmailLower = customerEmail.toLowerCase().trim();
    const seenEstimateIds = new Set(); // Prevent duplicates if estimate matches both email and ID
    
    for (let i = 1; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowEmail = (row[emailCol] || '').toString().toLowerCase().trim();
      const rowCustomerId = (customerIdCol !== -1 && row[customerIdCol]) ? (row[customerIdCol] || '').toString().toLowerCase().trim() : '';
      const rowType = (row[typeCol] || '').toString();
      const estimateId = row[0];
      
      // Skip if not an estimate or already seen
      if (rowType !== 'Estimate' || seenEstimateIds.has(estimateId)) {
        continue;
      }
      
      // Match by email OR by Customer ID (which might be the email or a different ID)
      const matchesEmail = rowEmail === customerEmailLower;
      const matchesCustomerId = rowCustomerId && (rowCustomerId === customerEmailLower || rowCustomerId === customerEmail);
      
      if (matchesEmail || matchesCustomerId) {
        seenEstimateIds.add(estimateId);
        estimates.push({
          id: estimateId,
          quoteNumber: row[headers.indexOf('Quote/Estimate Number')] || estimateId,
          date: row[headers.indexOf('Date')] || '',
          total: row[headers.indexOf('Total')] || 0,
          approvalStatus: (approvalStatusCol !== -1 && row[approvalStatusCol]) ? row[approvalStatusCol] : 'Pending',
          approvalToken: row[headers.indexOf('Approval Token')] || '',
          shareLink: row[headers.indexOf('Share Link')] || ''
        });
      }
    }
    
    // Sort by date descending
    estimates.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    return { success: true, estimates: estimates };
  } catch (error) {
    Logger.log('Error getting customer estimates: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Get customer payment history
 */
function getCustomerPaymentHistory(customerEmail) {
  try {
    // Use the InvoiceEstimate.gs function via HTTP call or direct function call
    // For now, we'll duplicate the logic
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const invoiceSheet = spreadsheet.getSheetByName(INVOICES_ESTIMATES_SHEET);
    const payments = [];
    
    if (invoiceSheet) {
      const dataRows = invoiceSheet.getDataRange().getValues();
      if (dataRows.length > 1) {
        const headers = dataRows[0];
        const emailCol = headers.indexOf('Customer Email');
        const paymentStatusCol = headers.indexOf('Payment Status') !== -1 ? headers.indexOf('Payment Status') : -1;
        const paymentDateCol = headers.indexOf('Payment Date') !== -1 ? headers.indexOf('Payment Date') : -1;
        const totalCol = headers.indexOf('Total');
        const idCol = 0;
        
        if (emailCol !== -1) {
          for (let i = 1; i < dataRows.length; i++) {
            const row = dataRows[i];
            const rowEmail = (row[emailCol] || '').toString().toLowerCase().trim();
            
            if (rowEmail === customerEmail.toLowerCase().trim()) {
              const paymentStatus = (paymentStatusCol !== -1 && row[paymentStatusCol]) ? row[paymentStatusCol].toString() : '';
              if (paymentStatus === 'Paid') {
                payments.push({
                  invoiceId: row[idCol],
                  invoiceNumber: row[headers.indexOf('Invoice Number')] || row[idCol],
                  amount: row[totalCol] || 0,
                  date: (paymentDateCol !== -1 && row[paymentDateCol]) ? row[paymentDateCol] : (row[headers.indexOf('Date')] || ''),
                  method: 'Stripe'
                });
              }
            }
          }
        }
      }
    }
    
    // Sort by date descending
    payments.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    return { success: true, payments: payments };
  } catch (error) {
    Logger.log('Error getting payment history: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Create payment link for invoice (calls InvoiceEstimate webapp)
 */
function createPaymentLinkForInvoice(invoiceId) {
  try {
    // First, get the invoice to retrieve amount and customer email
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(INVOICES_ESTIMATES_SHEET);
    
    if (!sheet) {
      return { success: false, error: 'Invoice sheet not found' };
    }
    
    const dataRows = sheet.getDataRange().getValues();
    if (dataRows.length < 2) {
      return { success: false, error: 'Invoice not found' };
    }
    
    const headers = dataRows[0];
    const idCol = 0;
    const emailCol = headers.indexOf('Customer Email');
    const totalCol = headers.indexOf('Total');
    const numberCol = headers.indexOf('Invoice Number');
    
    let invoiceData = null;
    for (let i = 1; i < dataRows.length; i++) {
      if (dataRows[i][idCol] === invoiceId) {
        invoiceData = {
          id: invoiceId,
          customerEmail: dataRows[i][emailCol],
          total: dataRows[i][totalCol] || 0,
          invoiceNumber: dataRows[i][numberCol] || invoiceId
        };
        break;
      }
    }
    
    if (!invoiceData) {
      return { success: false, error: 'Invoice not found' };
    }
    
    // Call the InvoiceEstimate webapp API
    const url = INVOICE_WEBAPP_URL;
    const response = UrlFetchApp.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        action: 'createStripeCheckout',
        data: JSON.stringify({
          invoiceId: invoiceId,
          invoiceNumber: invoiceData.invoiceNumber,
          amount: invoiceData.total,
          customerEmail: invoiceData.customerEmail
        })
      }).toString(),
      muteHttpExceptions: true
    });
    
    const result = JSON.parse(response.getContentText());
    return result;
  } catch (error) {
    Logger.log('Error creating payment link: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Approve estimate (calls InvoiceEstimate webapp or uses direct function)
 */
function approveCustomerEstimate(id, token, comment) {
  try {
    const url = INVOICE_WEBAPP_URL;
    const response = UrlFetchApp.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        action: 'approveEstimate',
        id: id,
        token: token,
        comment: comment || ''
      }).toString(),
      muteHttpExceptions: true
    });
    
    const result = JSON.parse(response.getContentText());
    return result;
  } catch (error) {
    Logger.log('Error approving estimate: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Deny estimate (calls InvoiceEstimate webapp)
 */
function denyCustomerEstimate(id, token, comment) {
  try {
    const url = INVOICE_WEBAPP_URL;
    const response = UrlFetchApp.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        action: 'denyEstimate',
        id: id,
        token: token,
        comment: comment || ''
      }).toString(),
      muteHttpExceptions: true
    });
    
    const result = JSON.parse(response.getContentText());
    return result;
  } catch (error) {
    Logger.log('Error denying estimate: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Get project status progress (percentage)
 */
function getProjectStatusProgress(status) {
  const statusOrder = ['Planning', 'Ordering', 'Excavation', 'Installation', 'Final Inspection', 'Complete'];
  const index = statusOrder.indexOf(status);
  if (index === -1) return 0;
  return Math.round((index / (statusOrder.length - 1)) * 100);
}

/**
 * Get status phases for timeline
 */
function getStatusPhases() {
  return [
    { id: 'Planning', label: 'Planning', order: 0 },
    { id: 'Ordering', label: 'Ordering Materials', order: 1 },
    { id: 'Excavation', label: 'Excavation', order: 2 },
    { id: 'Installation', label: 'Installation', order: 3 },
    { id: 'Final Inspection', label: 'Final Inspection', order: 4 },
    { id: 'Complete', label: 'Complete', order: 5 }
  ];
}

/**
 * Verify sign-up token and get customer info
 */
function verifySignupToken(token) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = getCustomerPortalSheet(spreadsheet);
    
    if (!authSheet) {
      return { success: false, error: 'Authentication sheet not found' };
    }
    
    const data = authSheet.getDataRange().getValues();
    
    // Headers in row 2 (index 1), data starts row 3 (index 2)
    let headers = [];
    if (data.length > 1) {
      headers = data[1];
    } else if (data.length > 0) {
      headers = data[0];
    }
    
    // Find columns
    let emailCol = -1;
    let nameCol = -1;
    let tokenCol = -1;
    let tokenExpiresCol = -1;
    let statusCol = -1;
    
    for (let i = 0; i < headers.length; i++) {
      const header = (headers[i] || '').toString().toLowerCase().trim();
      if (header === 'email' || header === 'email address') emailCol = i;
      if (header === 'name') nameCol = i;
      if (header === 'signup token' || header === 'verification code' || header === 'token') tokenCol = i;
      if (header === 'token expires' || header === 'verification expires' || header === 'expires') tokenExpiresCol = i;
      if (header === 'status') statusCol = i;
    }
    
    if (emailCol === -1 || tokenCol === -1) {
      return { success: false, error: 'Required columns not found' };
    }
    
    const dataStartRow = data.length > 1 ? 2 : 1;
    
    // Find customer with matching token
    for (let i = dataStartRow; i < data.length; i++) {
      const row = data[i];
      const rowToken = (row[tokenCol] || '').toString().trim();
      const rowEmail = (row[emailCol] || '').toString().trim();
      const rowName = (row[nameCol] || '').toString().trim();
      
      if (rowToken === token) {
        // Check if token expired
        if (tokenExpiresCol !== -1) {
          const expiresDate = row[tokenExpiresCol];
          if (expiresDate && new Date(expiresDate) < new Date()) {
            return { success: false, error: 'This sign-up link has expired. Please request a new invitation.' };
          }
        }
        
        return {
          success: true,
          email: rowEmail,
          name: rowName,
          token: token
        };
      }
    }
    
    return { success: false, error: 'Invalid or expired sign-up link' };
    
  } catch (error) {
    Logger.log('Error verifying signup token: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Complete sign-up by setting password
 */
function completeSignup(token, password) {
  try {
    if (!password || password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters' };
    }
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = getCustomerPortalSheet(spreadsheet);
    
    if (!authSheet) {
      return { success: false, error: 'Authentication sheet not found' };
    }
    
    const data = authSheet.getDataRange().getValues();
    
    // Headers in row 2 (index 1)
    let headers = [];
    if (data.length > 1) {
      headers = data[1];
    } else if (data.length > 0) {
      headers = data[0];
    }
    
    // Find columns
    let passwordCol = -1;
    let tokenCol = -1;
    let statusCol = -1;
    let accountStatusCol = -1;
    let tokenExpiresCol = -1;
    
    for (let i = 0; i < headers.length; i++) {
      const header = (headers[i] || '').toString().toLowerCase().trim();
      if (header === 'password' || header === 'password hash') passwordCol = i;
      if (header === 'signup token' || header === 'verification code' || header === 'token') tokenCol = i;
      if (header === 'status') statusCol = i;
      if (header === 'account status') accountStatusCol = i;
      if (header === 'token expires' || header === 'verification expires' || header === 'expires') tokenExpiresCol = i;
    }
    
    if (passwordCol === -1 || tokenCol === -1) {
      return { success: false, error: 'Required columns not found' };
    }
    
    const dataStartRow = data.length > 1 ? 2 : 1;
    
    // Hash password (simple MD5 hash)
    const hashedPassword = Utilities.computeDigest(
      Utilities.DigestAlgorithm.MD5,
      password
    ).map(function(byte) {
      return ('0' + (byte & 0xFF).toString(16)).slice(-2);
    }).join('');
    
    // Find customer with matching token and update
    for (let i = dataStartRow; i < data.length; i++) {
      const row = data[i];
      const rowToken = (row[tokenCol] || '').toString().trim();
      
      if (rowToken === token) {
        const rowNum = i + 1; // 1-based row number
        
        // Set password
        authSheet.getRange(rowNum, passwordCol + 1).setValue(hashedPassword);
        
        // Clear token
        authSheet.getRange(rowNum, tokenCol + 1).setValue('');
        
        // Clear token expires
        if (tokenExpiresCol !== -1) {
          authSheet.getRange(rowNum, tokenExpiresCol + 1).setValue('');
        }
        
        // Activate account
        if (statusCol !== -1) {
          authSheet.getRange(rowNum, statusCol + 1).setValue('Active');
        }
        if (accountStatusCol !== -1) {
          authSheet.getRange(rowNum, accountStatusCol + 1).setValue('Approved');
        }
        
        return {
          success: true,
          message: 'Account created successfully! You can now sign in.'
        };
      }
    }
    
    return { success: false, error: 'Invalid or expired sign-up link' };
    
  } catch (error) {
    Logger.log('Error completing signup: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Initiate password reset - send verification code to customer email
 */
function initiatePasswordReset(email) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = getCustomerPortalSheet(spreadsheet);
    
    if (!authSheet) {
      return { success: false, error: 'Authentication system not available' };
    }
    
    const data = authSheet.getDataRange().getValues();
    
    let headers = [];
    if (data.length > 1) {
      headers = data[1];
    } else if (data.length > 0) {
      headers = data[0];
    }
    
    // Find columns
    let emailCol = -1;
    let resetCodeCol = -1;
    let resetExpiresCol = -1;
    let nameCol = -1;
    let roleCol = -1;
    
    for (let i = 0; i < headers.length; i++) {
      const header = (headers[i] || '').toString().toLowerCase().trim();
      if (header === 'email' || header === 'email address') emailCol = i;
      if (header === 'password reset code' || header === 'reset code') resetCodeCol = i;
      if (header === 'reset expires' || header === 'reset code expires') resetExpiresCol = i;
      if (header === 'name') nameCol = i;
      if (header === 'role' || header === 'user role') roleCol = i;
    }
    
    if (emailCol === -1) {
      return { success: false, error: 'Email column not found in system' };
    }
    
    // Create reset code columns if they don't exist
    let authSheetLastCol = headers.length;
    if (resetCodeCol === -1) {
      resetCodeCol = authSheetLastCol;
      authSheet.getRange(2, resetCodeCol + 1).setValue('Password Reset Code');
      authSheetLastCol++;
    }
    if (resetExpiresCol === -1) {
      resetExpiresCol = authSheetLastCol;
      authSheet.getRange(2, resetExpiresCol + 1).setValue('Reset Code Expires');
    }
    
    const dataStartRow = data.length > 1 ? 2 : 1;
    
    // Find customer by email
    let foundRow = -1;
    for (let i = dataStartRow; i < data.length; i++) {
      const row = data[i];
      const rowEmail = (row[emailCol] || '').toString().toLowerCase().trim();
      const rowRole = (row[roleCol] || '').toString();
      
      if (rowEmail === email.toLowerCase().trim() && (rowRole === 'Customer' || rowRole === '')) {
        foundRow = i;
        break;
      }
    }
    
    if (foundRow === -1) {
      // Don't reveal if email exists or not for security
      return {
        success: true,
        message: 'If an account exists with that email, you will receive a verification code shortly.',
        sent: false
      };
    }
    
    // Generate 6-digit random code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Set expiration to 15 minutes from now
    const expiresDate = new Date();
    expiresDate.setMinutes(expiresDate.getMinutes() + 15);
    
    const rowNum = foundRow + 1;
    const row = data[foundRow];
    const customerName = (row[nameCol] || email).toString();
    
    // Update sheet with reset code and expiration
    authSheet.getRange(rowNum, resetCodeCol + 1).setValue(resetCode);
    authSheet.getRange(rowNum, resetExpiresCol + 1).setValue(expiresDate);
    
    // Send email with reset code
    try {
      const subject = 'Password Reset Code - A Quality Pool Company';
      const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #0369a1 0%, #0284c7 100%); padding: 20px; border-radius: 10px 10px 0 0; color: white; text-align: center;">
            <h1 style="margin: 0; font-size: 28px;">Password Reset</h1>
          </div>
          <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
            <p style="margin-top: 0; color: #333;">Hi ${customerName},</p>
            <p style="color: #555;">We received a request to reset the password for your A Quality Pool Company customer account.</p>
            <div style="background: white; border: 2px solid #0369a1; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
              <p style="margin: 0 0 10px 0; color: #666; font-size: 14px;">Your verification code is:</p>
              <p style="margin: 0; font-size: 36px; font-weight: bold; color: #0369a1; letter-spacing: 5px;">${resetCode}</p>
              <p style="margin: 10px 0 0 0; color: #999; font-size: 12px;">This code expires in 15 minutes</p>
            </div>
            <p style="color: #555;">Enter this code on the password reset page to verify your identity and create a new password.</p>
            <p style="color: #999; font-size: 12px; margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd;">
              If you didn't request a password reset, please ignore this email. Your account is secure.
            </p>
            <p style="color: #999; font-size: 12px; margin: 10px 0 0 0;">
              Questions? Contact us at <a href="mailto:${COMPANY_EMAIL}" style="color: #0369a1; text-decoration: none;">${COMPANY_EMAIL}</a>
            </p>
          </div>
        </div>
      `;
      
      MailApp.sendEmail({
        to: email,
        subject: subject,
        htmlBody: htmlBody,
        name: COMPANY_NAME
      });
      
      Logger.log('Password reset code sent to: ' + email);
      
      return {
        success: true,
        message: 'A verification code has been sent to your email. Please check your inbox.',
        sent: true,
        email: email // Return email to verify it (masked in frontend)
      };
    } catch (emailError) {
      Logger.log('Error sending reset email: ' + emailError.toString());
      Logger.log('Error details: ' + JSON.stringify(emailError));
      // Still return success - code was stored
      return {
        success: true,
        message: 'Verification code generated. Please check your email.',
        sent: true
      };
    }
    
  } catch (error) {
    Logger.log('Error initiating password reset: ' + error.toString());
    return {
      success: true,
      message: 'If an account exists with that email, you will receive a verification code shortly.',
      sent: false
    };
  }
}

/**
 * Verify reset code and allow password change
 */
function verifyResetCode(email, resetCode) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = getCustomerPortalSheet(spreadsheet);
    
    if (!authSheet) {
      return { success: false, error: 'Authentication system not available' };
    }
    
    const data = authSheet.getDataRange().getValues();
    
    let headers = [];
    if (data.length > 1) {
      headers = data[1];
    } else if (data.length > 0) {
      headers = data[0];
    }
    
    // Find columns
    let emailCol = -1;
    let resetCodeCol = -1;
    let resetExpiresCol = -1;
    
    for (let i = 0; i < headers.length; i++) {
      const header = (headers[i] || '').toString().toLowerCase().trim();
      if (header === 'email' || header === 'email address') emailCol = i;
      if (header === 'password reset code' || header === 'reset code') resetCodeCol = i;
      if (header === 'reset expires' || header === 'reset code expires') resetExpiresCol = i;
    }
    
    if (emailCol === -1 || resetCodeCol === -1) {
      return { success: false, error: 'System not properly configured' };
    }
    
    const dataStartRow = data.length > 1 ? 2 : 1;
    
    // Find customer and verify code
    for (let i = dataStartRow; i < data.length; i++) {
      const row = data[i];
      const rowEmail = (row[emailCol] || '').toString().toLowerCase().trim();
      const rowResetCode = (row[resetCodeCol] || '').toString().trim();
      
      if (rowEmail === email.toLowerCase().trim()) {
        if (!rowResetCode) {
          return { success: false, error: 'No reset code found. Please request a new one.' };
        }
        
        // Check if code matches
        if (rowResetCode !== resetCode.toString()) {
          return { success: false, error: 'Invalid verification code. Please try again.' };
        }
        
        // Check expiration
        if (resetExpiresCol !== -1) {
          const expiresDate = row[resetExpiresCol];
          if (expiresDate && new Date(expiresDate) < new Date()) {
            return { success: false, error: 'This verification code has expired. Please request a new one.' };
          }
        }
        
        return {
          success: true,
          message: 'Code verified successfully. You can now reset your password.',
          email: email
        };
      }
    }
    
    return { success: false, error: 'Email not found or reset not initiated' };
    
  } catch (error) {
    Logger.log('Error verifying reset code: ' + error.toString());
    return { success: false, error: 'Error verifying code: ' + error.toString() };
  }
}

/**
 * Complete password reset - update password and clear reset code
 */
function resetPassword(email, resetCode, newPassword) {
  try {
    if (!newPassword || newPassword.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters' };
    }
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = getCustomerPortalSheet(spreadsheet);
    
    if (!authSheet) {
      return { success: false, error: 'Authentication system not available' };
    }
    
    const data = authSheet.getDataRange().getValues();
    
    let headers = [];
    if (data.length > 1) {
      headers = data[1];
    } else if (data.length > 0) {
      headers = data[0];
    }
    
    // Find columns
    let emailCol = -1;
    let passwordCol = -1;
    let resetCodeCol = -1;
    let resetExpiresCol = -1;
    let roleCol = -1;
    
    for (let i = 0; i < headers.length; i++) {
      const header = (headers[i] || '').toString().toLowerCase().trim();
      if (header === 'email' || header === 'email address') emailCol = i;
      if (header === 'password' || header === 'password hash') passwordCol = i;
      if (header === 'password reset code' || header === 'reset code') resetCodeCol = i;
      if (header === 'reset expires' || header === 'reset code expires') resetExpiresCol = i;
      if (header === 'role' || header === 'user role') roleCol = i;
    }
    
    if (emailCol === -1 || passwordCol === -1 || resetCodeCol === -1) {
      return { success: false, error: 'System not properly configured' };
    }
    
    const dataStartRow = data.length > 1 ? 2 : 1;
    
    // Hash new password using MD5
    const hashedPassword = Utilities.computeDigest(
      Utilities.DigestAlgorithm.MD5,
      newPassword
    ).map(function(byte) {
      return ('0' + (byte & 0xFF).toString(16)).slice(-2);
    }).join('');
    
    Logger.log('Password reset attempt for email: ' + email);
    Logger.log('New hashed password: ' + hashedPassword);
    
    // Find customer, verify code, and update password
    for (let i = dataStartRow; i < data.length; i++) {
      const row = data[i];
      const rowEmail = (row[emailCol] || '').toString().toLowerCase().trim();
      const rowResetCode = (row[resetCodeCol] || '').toString().trim();
      const rowRole = (row[roleCol] || '').toString();
      
      if (rowEmail === email.toLowerCase().trim()) {
        Logger.log('Found matching email. Role: ' + rowRole);
        Logger.log('Reset code stored: ' + rowResetCode + ', provided: ' + resetCode);
        
        if (!rowResetCode || rowResetCode !== resetCode.toString()) {
          return { success: false, error: 'Invalid or expired reset code' };
        }
        
        // Check expiration
        if (resetExpiresCol !== -1) {
          const expiresDate = row[resetExpiresCol];
          if (expiresDate && new Date(expiresDate) < new Date()) {
            return { success: false, error: 'Reset code has expired' };
          }
        }
        
        const rowNum = i + 1;
        
        // Update password
        authSheet.getRange(rowNum, passwordCol + 1).setValue(hashedPassword);
        
        // Clear reset code and expiration
        authSheet.getRange(rowNum, resetCodeCol + 1).setValue('');
        if (resetExpiresCol !== -1) {
          authSheet.getRange(rowNum, resetExpiresCol + 1).setValue('');
        }
        
        // Ensure Role is set to 'Customer' if empty
        if (roleCol !== -1 && (!rowRole || rowRole === '')) {
          authSheet.getRange(rowNum, roleCol + 1).setValue('Customer');
          Logger.log('Set role to Customer for row ' + rowNum);
        }
        
        Logger.log('Password reset successful for: ' + email);
        Logger.log('Updated password column ' + (passwordCol + 1) + ' in row ' + rowNum);
        
        // Force recalculation
        SpreadsheetApp.flush();
        
        return {
          success: true,
          message: 'Your password has been reset successfully. You can now sign in with your new password.'
        };
      }
    }
    
    return { success: false, error: 'Email not found' };
    
  } catch (error) {
    Logger.log('Error resetting password: ' + error.toString());
    Logger.log('Stack trace: ' + error.stack);
    return { success: false, error: 'Error resetting password: ' + error.toString() };
  }
}

/**
 * Save quote to customer's saved data in Customer Portal sheet
 */
function saveCustomerQuote(customerEmail, quoteData) {
  try {
    if (!customerEmail) {
      return { success: false, error: 'Customer email is required' };
    }
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const portalSheet = getCustomerPortalSheet(spreadsheet);
    
    if (!portalSheet) {
      return { success: false, error: 'Customer Portal sheet not found' };
    }
    
    const data = portalSheet.getDataRange().getValues();
    let headers = [];
    let dataStartRow = 2;
    
    if (data.length > 1) {
      headers = data[1];
    } else if (data.length > 0) {
      headers = data[0];
      dataStartRow = 1;
    }
    
    // Find columns (case-insensitive)
    let emailCol = -1;
    let savedDataCol = -1;
    let nameCol = -1;
    let phoneCol = -1;
    let addressCol = -1;
    let roleCol = -1;
    let statusCol = -1;
    let accountStatusCol = -1;
    let createdDateCol = -1;
    
    for (let i = 0; i < headers.length; i++) {
      const header = String(headers[i] || '').toLowerCase().trim();
      if (header === 'email' || header === 'email address') {
        emailCol = i;
      } else if (header === '_ saved data' || header === 'saved data') {
        savedDataCol = i;
      } else if (header === 'name') {
        nameCol = i;
      } else if (header === 'phone' || header === 'phone number') {
        phoneCol = i;
      } else if (header === 'address') {
        addressCol = i;
      } else if (header === 'role') {
        roleCol = i;
      } else if (header === 'status') {
        statusCol = i;
      } else if (header === 'account status') {
        accountStatusCol = i;
      } else if (header === 'created date' || header === 'created') {
        createdDateCol = i;
      }
    }
    
    if (emailCol === -1) {
      return { success: false, error: 'Email column not found in Customer Portal sheet' };
    }
    
    if (savedDataCol === -1) {
      return { success: false, error: '_ saved data column not found. Please run CustomerPortalSheetSetup.gs' };
    }
    
    // Normalize customer email for comparison
    const normalizedEmail = customerEmail.toLowerCase().trim();
    
    // Find customer row
    let customerRowIndex = -1;
    for (let i = dataStartRow; i < data.length; i++) {
      const row = data[i];
      const rowEmail = (row[emailCol] || '').toString().toLowerCase().trim();
      if (rowEmail === normalizedEmail) {
        customerRowIndex = i;
        break;
      }
    }
    
    // If customer doesn't exist, create a minimal entry
    if (customerRowIndex === -1) {
      Logger.log('Customer not found in Customer Portal sheet, creating entry: ' + customerEmail);
      const newRow = [];
      for (let i = 0; i < headers.length; i++) {
        newRow.push('');
      }
      
      // Set basic customer info from quote data
      if (nameCol !== -1) newRow[nameCol] = quoteData.customerName || '';
      newRow[emailCol] = normalizedEmail;
      if (phoneCol !== -1) newRow[phoneCol] = quoteData.customerPhone || '';
      if (addressCol !== -1) newRow[addressCol] = quoteData.customerAddress || '';
      if (roleCol !== -1) newRow[roleCol] = 'Customer';
      if (statusCol !== -1) newRow[statusCol] = 'Active';
      if (accountStatusCol !== -1) newRow[accountStatusCol] = 'Approved';
      if (createdDateCol !== -1) newRow[createdDateCol] = new Date();
      
      // Initialize saved data with empty quotes object
      newRow[savedDataCol] = JSON.stringify({ quotes: {} });
      
      portalSheet.appendRow(newRow);
      customerRowIndex = portalSheet.getLastRow() - 1; // -1 because appendRow adds a new row
      Logger.log('Created customer entry at row: ' + (customerRowIndex + 1));
    }
    
    // Get existing saved data
    const existingData = (data[customerRowIndex][savedDataCol] || '').toString();
    let savedQuotes = {};
    
    if (existingData) {
      try {
        savedQuotes = JSON.parse(existingData);
      } catch (e) {
        // If not valid JSON, start fresh
        savedQuotes = {};
      }
    }
    
    // Ensure quotes object exists
    if (!savedQuotes.quotes) {
      savedQuotes.quotes = {};
    }
    
    // Generate quote ID if not provided
    const quoteId = quoteData.id || 'quote_' + Date.now();
    quoteData.id = quoteId;
    quoteData.savedDate = new Date().toISOString();
    quoteData.status = quoteData.status || 'Draft';
    
    // Save quote
    savedQuotes.quotes[quoteId] = quoteData;
    
    // Update saved data column
    const rowNum = customerRowIndex + 1;
    portalSheet.getRange(rowNum, savedDataCol + 1).setValue(JSON.stringify(savedQuotes));
    
    return {
      success: true,
      quoteId: quoteId,
      message: 'Quote saved successfully'
    };
    
  } catch (error) {
    Logger.log('Error saving customer quote: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Get all saved quotes for a customer
 */
function getCustomerSavedQuotes(customerEmail) {
  try {
    if (!customerEmail) {
      return { success: false, error: 'Customer email is required' };
    }
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const portalSheet = getCustomerPortalSheet(spreadsheet);
    
    if (!portalSheet) {
      return { success: false, error: 'Customer Portal sheet not found' };
    }
    
    const data = portalSheet.getDataRange().getValues();
    let headers = [];
    let dataStartRow = 2;
    
    if (data.length > 1) {
      headers = data[1];
    } else if (data.length > 0) {
      headers = data[0];
      dataStartRow = 1;
    }
    
    // Find email column (case-insensitive)
    let emailCol = -1;
    let savedDataCol = -1;
    for (let i = 0; i < headers.length; i++) {
      const header = String(headers[i] || '').toLowerCase().trim();
      if (header === 'email' || header === 'email address') {
        emailCol = i;
      }
      if (header === '_ saved data' || header === 'saved data') {
        savedDataCol = i;
      }
    }
    
    if (emailCol === -1) {
      Logger.log('Email column not found. Available headers: ' + headers.join(', '));
      return { success: false, error: 'Email column not found in Customer Portal sheet' };
    }
    
    if (savedDataCol === -1) {
      Logger.log('_ saved data column not found. Returning empty quotes array.');
      return { success: true, quotes: [] };
    }
    
    // Normalize customer email for comparison
    const normalizedEmail = customerEmail.toLowerCase().trim();
    
    // Find customer row
    for (let i = dataStartRow; i < data.length; i++) {
      const row = data[i];
      const rowEmail = (row[emailCol] || '').toString().toLowerCase().trim();
      if (rowEmail === normalizedEmail) {
        const savedData = (row[savedDataCol] || '').toString();
        if (!savedData || savedData.trim() === '') {
          Logger.log('No saved data found for customer: ' + customerEmail);
          return { success: true, quotes: [] };
        }
        
        try {
          const parsed = JSON.parse(savedData);
          const quotes = parsed.quotes || {};
          const quotesArray = Object.keys(quotes).map(id => ({
            id: id,
            ...quotes[id]
          }));
          
          // Sort by saved date (most recent first)
          quotesArray.sort((a, b) => {
            const dateA = a.savedDate ? new Date(a.savedDate) : new Date(0);
            const dateB = b.savedDate ? new Date(b.savedDate) : new Date(0);
            return dateB - dateA;
          });
          
          Logger.log('Found ' + quotesArray.length + ' saved quotes for customer: ' + customerEmail);
          return { success: true, quotes: quotesArray };
        } catch (e) {
          Logger.log('Error parsing saved data for customer ' + customerEmail + ': ' + e.toString());
          Logger.log('Saved data content: ' + savedData.substring(0, 200));
          return { success: true, quotes: [] };
        }
      }
    }
    
    Logger.log('Customer not found in Customer Portal sheet: ' + customerEmail);
    Logger.log('Searched ' + (data.length - dataStartRow) + ' rows');
    return { success: false, error: 'Customer not found in Customer Portal. Please ensure the customer exists in the Customer Portal sheet.' };
    
  } catch (error) {
    Logger.log('Error getting customer quotes: ' + error.toString());
    Logger.log('Stack trace: ' + error.stack);
    return { success: false, error: error.toString() };
  }
}

/**
 * Get a specific saved quote by ID
 */
function getCustomerSavedQuote(customerEmail, quoteId) {
  try {
    const result = getCustomerSavedQuotes(customerEmail);
    if (!result.success) {
      return result;
    }
    
    const quote = result.quotes.find(q => q.id === quoteId);
    if (!quote) {
      return { success: false, error: 'Quote not found' };
    }
    
    return { success: true, quote: quote };
    
  } catch (error) {
    Logger.log('Error getting customer quote: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Release quote to customer via invoice tool and send email notification
 */
function releaseQuoteToCustomer(customerEmail, quoteId, invoiceEstimateId, shareLink) {
  try {
    // Get the saved quote
    const quoteResult = getCustomerSavedQuote(customerEmail, quoteId);
    if (!quoteResult.success) {
      return quoteResult;
    }
    
    const quote = quoteResult.quote;
    
    // Update quote status to "Released"
    quote.status = 'Released';
    quote.releasedDate = new Date().toISOString();
    quote.invoiceEstimateId = invoiceEstimateId;
    quote.shareLink = shareLink || quote.shareLink || '';
    
    // Save updated quote
    const saveResult = saveCustomerQuote(customerEmail, quote);
    if (!saveResult.success) {
      return saveResult;
    }
    
    // Send email notification to customer
    const emailResult = sendQuoteReleaseEmail(customerEmail, quote, invoiceEstimateId, shareLink);
    
    return {
      success: true,
      message: 'Quote released successfully',
      emailSent: emailResult.success,
      shareLink: shareLink
    };
    
  } catch (error) {
    Logger.log('Error releasing quote: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Send email notification when quote is released or changed
 */
function sendQuoteReleaseEmail(customerEmail, quote, invoiceEstimateId, shareLink) {
  try {
    const customerProfile = getCustomerProfile(customerEmail);
    const customerName = customerProfile.success && customerProfile.profile.name 
      ? customerProfile.profile.name 
      : customerEmail;
    
    const invoiceUrl = shareLink || (INVOICE_WEBAPP_URL + '?id=' + invoiceEstimateId);
    
    const subject = 'Your Quote is Ready - ' + COMPANY_NAME;
    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #0369a1; color: white; padding: 20px; text-align: center; }
          .content { background: #f8f9fa; padding: 20px; }
          .button { display: inline-block; background: #0369a1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${COMPANY_NAME}</h1>
          </div>
          <div class="content">
            <p>Dear ${customerName},</p>
            <p>Your quote has been prepared and is ready for review.</p>
            <p><strong>Quote Details:</strong></p>
            <ul>
              <li>Quote Number: ${quote.quoteNumber || quote.id}</li>
              <li>Date: ${quote.date || new Date().toLocaleDateString()}</li>
              <li>Total: $${(quote.total || 0).toFixed(2)}</li>
            </ul>
            <p style="text-align: center;">
              <a href="${invoiceUrl}" class="button">View Your Quote</a>
            </p>
            <p>If you have any questions, please don't hesitate to contact us.</p>
            <p>Best regards,<br>${COMPANY_NAME}</p>
          </div>
          <div class="footer">
            <p>${COMPANY_EMAIL} | ${COMPANY_PHONE}</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    MailApp.sendEmail({
      to: customerEmail,
      subject: subject,
      htmlBody: htmlBody
    });
    
    return { success: true };
    
  } catch (error) {
    Logger.log('Error sending quote release email: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Send email notification when quote is changed (called from InvoiceEstimate)
 */
function sendQuoteChangeEmail(customerEmail, quoteId, changesJson) {
  try {
    const changes = JSON.parse(changesJson || '[]');
    const quoteResult = getCustomerSavedQuote(customerEmail, quoteId);
    if (!quoteResult.success) {
      return { success: false, error: 'Quote not found' };
    }
    
    const quote = quoteResult.quote;
    return sendQuoteChangeEmailInternal(customerEmail, quote, changes);
  } catch (error) {
    Logger.log('Error sending quote change email: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Internal function to send email notification when quote is changed
 */
function sendQuoteChangeEmailInternal(customerEmail, quote, changes) {
  try {
    const customerProfile = getCustomerProfile(customerEmail);
    const customerName = customerProfile.success && customerProfile.profile.name 
      ? customerProfile.profile.name 
      : customerEmail;
    
    const invoiceUrl = quote.invoiceEstimateId 
      ? INVOICE_WEBAPP_URL + '?id=' + quote.invoiceEstimateId
      : '';
    
    const subject = 'Your Quote Has Been Updated - ' + COMPANY_NAME;
    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #0369a1; color: white; padding: 20px; text-align: center; }
          .content { background: #f8f9fa; padding: 20px; }
          .changes { background: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 15px 0; }
          .button { display: inline-block; background: #0369a1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${COMPANY_NAME}</h1>
          </div>
          <div class="content">
            <p>Dear ${customerName},</p>
            <p>We wanted to inform you that your quote has been updated.</p>
            <div class="changes">
              <p><strong>Changes Made:</strong></p>
              <ul>
                ${changes.map(change => `<li>${change}</li>`).join('')}
              </ul>
            </div>
            <p><strong>Updated Quote Details:</strong></p>
            <ul>
              <li>Quote Number: ${quote.quoteNumber || quote.id}</li>
              <li>Date: ${quote.date || new Date().toLocaleDateString()}</li>
              <li>Total: $${(quote.total || 0).toFixed(2)}</li>
            </ul>
            ${invoiceUrl ? `
            <p style="text-align: center;">
              <a href="${invoiceUrl}" class="button">View Updated Quote</a>
            </p>
            ` : ''}
            <p>If you have any questions about these changes, please contact us.</p>
            <p>Best regards,<br>${COMPANY_NAME}</p>
          </div>
          <div class="footer">
            <p>${COMPANY_EMAIL} | ${COMPANY_PHONE}</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    MailApp.sendEmail({
      to: customerEmail,
      subject: subject,
      htmlBody: htmlBody
    });
    
    return { success: true };
    
  } catch (error) {
    Logger.log('Error sending quote change email: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Handle POST requests - main API endpoint
 */
function doPost(e) {
  try {
    let data = {};
    let action = '';
    
    // Parse request data
    if (e.postData && e.postData.contents) {
      const contentType = e.postData.type || '';
      if (contentType.indexOf('application/json') !== -1) {
        // JSON body
        data = JSON.parse(e.postData.contents);
        action = data.action;
      } else {
        // Form-encoded body
        const params = e.postData.contents.split('&');
        params.forEach(param => {
          const [key, value] = param.split('=');
          const decodedKey = decodeURIComponent(key);
          const decodedValue = decodeURIComponent(value || '');
          if (decodedKey === 'action') {
            action = decodedValue;
          } else {
            data[decodedKey] = decodedValue;
          }
        });
      }
    }
    
    // Check URL parameters (for form-encoded POST)
    if (e.parameter && e.parameter.action) {
      action = e.parameter.action;
      Object.keys(e.parameter).forEach(key => {
        if (key !== 'action') {
          data[key] = e.parameter[key];
        }
      });
    }
    
    if (!action) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Action is required'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    let result;
    switch(action) {
      case 'authenticate':
        result = authenticateCustomer(data.email, data.password);
        break;
      case 'signup':
        result = createCustomerAccount(
          data.name, 
          data.email, 
          data.phone || '',
          data.password,
          data.address || '',
          data.gateCode || '',
          data.pets || '',
          data.poolType || '',
          data.houseInfo || '',
          data.poolIssues || '',
          data.photos || []
        );
        break;
      case 'oauthAuth':
        result = authenticateWithOAuth(data.provider, data.email, data.name, data.picture);
        break;
      case 'completeSignup':
        result = completeSignup(data.token, data.password);
        break;
      case 'getProjects':
        result = getCustomerProjects(data.email || data.customerEmail);
        break;
      case 'getProjectItems':
        result = getProjectItems(data.projectId);
        break;
      case 'getCustomerProfile':
        result = getCustomerProfile(data.email || data.customerEmail);
        break;
      case 'checkSquareCustomer':
        result = checkSquareCustomerByEmail(data.email);
        break;
      case 'getCustomerInvoices':
        result = getCustomerInvoices(data.email || data.customerEmail);
        break;
      case 'getCustomerInvoiceDetails':
        result = getCustomerInvoiceDetails(data.invoiceId, data.email || data.customerEmail);
        break;
      case 'getCustomerEstimates':
        result = getCustomerEstimates(data.email || data.customerEmail);
        break;
      case 'getCustomerPaymentHistory':
        result = getCustomerPaymentHistory(data.email || data.customerEmail);
        break;
      case 'createPaymentLink':
        result = createPaymentLinkForInvoice(data.invoiceId);
        break;
      case 'approveEstimate':
        result = approveCustomerEstimate(data.id, data.token, data.comment);
        break;
      case 'denyEstimate':
        result = denyCustomerEstimate(data.id, data.token, data.comment);
        break;
      case 'getSatelliteImage':
        result = getSatelliteImageForAddress(data.address);
        break;
      case 'getCustomerJobs':
        result = getCustomerJobs(data.email || data.customerEmail);
        break;
      case 'getCustomerOrderables':
        result = getCustomerOrderables(data.email || data.customerEmail);
        break;
      case 'getProjectBudget':
        result = getProjectBudget(data.projectId);
        break;
      case 'saveCustomerQuote':
        result = saveCustomerQuote(data.email || data.customerEmail, JSON.parse(data.quoteData || '{}'));
        break;
      case 'getCustomerSavedQuotes':
        result = getCustomerSavedQuotes(data.email || data.customerEmail);
        break;
      case 'getCustomerSavedQuote':
        result = getCustomerSavedQuote(data.email || data.customerEmail, data.quoteId);
        break;
      case 'releaseQuoteToCustomer':
        result = releaseQuoteToCustomer(data.email || data.customerEmail, data.quoteId, data.invoiceEstimateId, data.shareLink);
        break;
      case 'sendQuoteChangeEmail':
        result = sendQuoteChangeEmail(data.email || data.customerEmail, data.quoteId, data.changes || '[]');
        break;
      case 'savePoolReport':
        result = savePoolReport(data.email || data.customerEmail, JSON.parse(data.reportData || '{}'));
        break;
      case 'getCustomerPoolReports':
        result = getCustomerPoolReports(data.email || data.customerEmail);
        break;
      case 'getCustomerServiceHistory':
        result = getCustomerServiceHistory(data.email || data.customerEmail);
        break;
      case 'getCustomerServicePhotos':
        result = getCustomerServicePhotos(data.email || data.customerEmail);
        break;
      case 'checkCustomerExists':
        result = checkCustomerExists(data.email || data.customerEmail);
        break;
      case 'getCustomerPaymentSchedules':
        result = getCustomerPaymentSchedules(data.email || data.customerEmail);
        break;
      case 'getProjectPaymentSchedule':
        result = getProjectPaymentSchedule(data.projectId);
        break;
      case 'getNextPaymentDue':
        result = getNextPaymentDue(data.projectId);
        break;
      case 'createStripePaymentForMilestone':
        result = createStripePaymentForMilestone(data.milestoneId, data.paymentScheduleId, data.customerEmail);
        break;
      case 'requestProjectAddon':
        result = requestProjectAddon(data.projectId, data.addonName, data.basePrice, data.customerEmail, data.customerName, data.message);
        break;
      case 'updateProfilePicture':
        result = updateProfilePicture(data.email || data.customerEmail, data.imageData);
        break;
      case 'askAI':
        result = askPoolAI(data.email || data.customerEmail, data.question);
        break;
      case 'initiatePasswordReset':
        result = initiatePasswordReset(data.email);
        break;
      case 'verifyResetCode':
        result = verifyResetCode(data.email, data.resetCode);
        break;
      case 'resetPassword':
        result = resetPassword(data.email, data.resetCode, data.newPassword);
        break;
      default:
        result = {
          success: false,
          error: 'Invalid action: ' + action
        };
    }
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log('doPost error: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Save pool calculator report to customer's saved data in Customer Portal sheet
 */
function savePoolReport(customerEmail, reportData) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const portalSheet = getCustomerPortalSheet(spreadsheet);
    
    if (!portalSheet) {
      return { success: false, error: 'Customer Portal sheet not found' };
    }
    
    const data = portalSheet.getDataRange().getValues();
    let headers = [];
    let dataStartRow = 2;
    
    if (data.length > 1) {
      headers = data[1];
    } else if (data.length > 0) {
      headers = data[0];
      dataStartRow = 1;
    }
    
    const emailCol = headers.indexOf('Email');
    const savedDataCol = headers.indexOf('_ saved data');
    
    if (emailCol === -1) {
      return { success: false, error: 'Email column not found' };
    }
    
    if (savedDataCol === -1) {
      return { success: false, error: '_ saved data column not found. Please run CustomerPortalSheetSetup.gs' };
    }
    
    // Find customer row
    let customerRowIndex = -1;
    for (let i = dataStartRow; i < data.length; i++) {
      const row = data[i];
      const rowEmail = (row[emailCol] || '').toString().toLowerCase().trim();
      if (rowEmail === customerEmail.toLowerCase().trim()) {
        customerRowIndex = i;
        break;
      }
    }
    
    if (customerRowIndex === -1) {
      return { success: false, error: 'Customer not found in Customer Portal sheet' };
    }
    
    // Get existing saved data
    const existingData = (data[customerRowIndex][savedDataCol] || '').toString();
    let savedData = {};
    
    if (existingData) {
      try {
        savedData = JSON.parse(existingData);
      } catch (e) {
        // If not valid JSON, start fresh
        savedData = {};
      }
    }
    
    // Ensure poolReports array exists
    if (!savedData.poolReports) {
      savedData.poolReports = [];
    }
    
    // Add new report (prepend to show most recent first)
    savedData.poolReports.unshift(reportData);
    
    // Update saved data column
    const rowNum = customerRowIndex + 1;
    portalSheet.getRange(rowNum, savedDataCol + 1).setValue(JSON.stringify(savedData));
    
    return {
      success: true,
      reportId: reportData.id,
      message: 'Pool report saved successfully'
    };
    
  } catch (error) {
    Logger.log('Error saving pool report: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Check if customer exists in Customer Portal
 */
function checkCustomerExists(customerEmail) {
  try {
    if (!customerEmail) {
      return { exists: false };
    }
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const portalSheet = getCustomerPortalSheet(spreadsheet);
    
    if (!portalSheet) {
      return { exists: false };
    }
    
    const data = portalSheet.getDataRange().getValues();
    let headers = [];
    let dataStartRow = 2;
    
    if (data.length > 1) {
      headers = data[1];
    } else if (data.length > 0) {
      headers = data[0];
      dataStartRow = 1;
    }
    
    const emailCol = headers.indexOf('Email');
    
    if (emailCol === -1) {
      return { exists: false };
    }
    
    // Check if customer email exists
    for (let i = dataStartRow; i < data.length; i++) {
      const row = data[i];
      const rowEmail = (row[emailCol] || '').toString().toLowerCase().trim();
      if (rowEmail === customerEmail.toLowerCase().trim()) {
        // Check if they have a password (active account)
        const passwordCol = headers.indexOf('Password Hash');
        if (passwordCol !== -1) {
          const password = (row[passwordCol] || '').toString();
          if (password && password.length > 0) {
            return { exists: true, hasActiveAccount: true };
          }
        }
        return { exists: true, hasActiveAccount: false };
      }
    }
    
    return { exists: false };
    
  } catch (error) {
    Logger.log('Error checking customer exists: ' + error.toString());
    return { exists: false };
  }
}

/**
 * Update customer profile picture
 */
function updateProfilePicture(customerEmail, imageData) {
  try {
    if (!customerEmail || !imageData) {
      return { success: false, error: 'Email and image data are required' };
    }
    
    // Save image to Google Drive
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const portalSheet = getCustomerPortalSheet(spreadsheet);
    
    if (!portalSheet) {
      return { success: false, error: 'Customer Portal sheet not found' };
    }
    
    // Get customer's Drive folder
    const data = portalSheet.getDataRange().getValues();
    let headers = [];
    let dataStartRow = 2;
    
    if (data.length > 1) {
      headers = data[1];
    } else if (data.length > 0) {
      headers = data[0];
      dataStartRow = 1;
    }
    
    const emailCol = headers.indexOf('Email');
    const driveFolderCol = headers.indexOf('Google Drive Folder ID');
    
    if (emailCol === -1) {
      return { success: false, error: 'Email column not found' };
    }
    
    // Find customer row
    let customerRowIndex = -1;
    let customerFolderId = null;
    
    for (let i = dataStartRow; i < data.length; i++) {
      const row = data[i];
      const rowEmail = (row[emailCol] || '').toString().toLowerCase().trim();
      if (rowEmail === customerEmail.toLowerCase().trim()) {
        customerRowIndex = i;
        if (driveFolderCol !== -1) {
          customerFolderId = (row[driveFolderCol] || '').toString();
        }
        break;
      }
    }
    
    if (customerRowIndex === -1) {
      return { success: false, error: 'Customer not found' };
    }
    
    // Save image to Drive
    let imageUrl = '';
    try {
      // Decode base64 image
      const base64Data = imageData.split(',')[1] || imageData;
      const blob = Utilities.newBlob(
        Utilities.base64Decode(base64Data),
        'image/jpeg',
        'profile-picture.jpg'
      );
      
      // Save to customer folder or main folder
      let file;
      if (customerFolderId) {
        try {
          const customerFolder = DriveApp.getFolderById(customerFolderId);
          // Delete old profile picture if exists
          const existingFiles = customerFolder.getFilesByName('profile-picture.jpg');
          while (existingFiles.hasNext()) {
            existingFiles.next().setTrashed(true);
          }
          file = customerFolder.createFile(blob);
        } catch (e) {
          // Folder doesn't exist or error, use main folder
          const mainFolder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
          file = mainFolder.createFile(blob);
        }
      } else {
        const mainFolder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
        file = mainFolder.createFile(blob);
      }
      
      // Make file shareable
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      imageUrl = file.getUrl();
      
      // Update profile picture URL in saved data
      const savedDataCol = headers.indexOf('_ saved data');
      if (savedDataCol !== -1) {
        const existingData = (data[customerRowIndex][savedDataCol] || '').toString();
        let savedData = {};
        
        if (existingData) {
          try {
            savedData = JSON.parse(existingData);
          } catch (e) {
            // Start fresh
            savedData = {};
          }
        }
        
        savedData.profilePicture = imageUrl;
        
        const rowNum = customerRowIndex + 1;
        portalSheet.getRange(rowNum, savedDataCol + 1).setValue(JSON.stringify(savedData));
      }
      
      return {
        success: true,
        profilePictureUrl: imageUrl,
        message: 'Profile picture updated successfully'
      };
    } catch (error) {
      Logger.log('Error saving profile picture: ' + error.toString());
      return { success: false, error: 'Error saving image: ' + error.toString() };
    }
    
  } catch (error) {
    Logger.log('Error updating profile picture: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Ask AI assistant about pool-related questions
 */
function askPoolAI(customerEmail, question) {
  try {
    if (!question || !question.trim()) {
      return { success: false, error: 'Question is required' };
    }
    
    // Get OpenAI API key from Script Properties
    const openAIKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
    if (!openAIKey) {
      return { 
        success: false, 
        error: 'OpenAI API key not configured. Please set OPENAI_API_KEY in Script Properties.' 
      };
    }
    
    // Get customer profile for context
    const customerProfile = getCustomerProfile(customerEmail);
    const customerName = customerProfile.success && customerProfile.profile.name 
      ? customerProfile.profile.name 
      : 'Customer';
    const poolType = customerProfile.success && customerProfile.profile.poolType 
      ? customerProfile.profile.poolType 
      : '';
    
    // Create system prompt for pool professional
    const systemPrompt = `You are a professional pool service expert representing A Quality Pool Company. You provide helpful, accurate, and friendly advice about pool maintenance, chemicals, equipment, troubleshooting, and pool care. Always address customers professionally and sign off as "A Quality Pool Company". Keep responses concise but informative.`;
    
    // Create user message with context
    let userMessage = question;
    if (poolType) {
      userMessage = `Customer has a ${poolType} pool. ${question}`;
    }
    
    // Call OpenAI API
    const url = 'https://api.openai.com/v1/chat/completions';
    const payload = {
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      max_tokens: 500,
      temperature: 0.7
    };
    
    const options = {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + openAIKey,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode === 200) {
      const result = JSON.parse(responseText);
      const aiResponse = result.choices && result.choices[0] && result.choices[0].message
        ? result.choices[0].message.content
        : 'I apologize, but I could not generate a response. Please try again.';
      
      // Ensure response is signed from A Quality Pool Company
      let finalResponse = aiResponse.trim();
      if (!finalResponse.includes('A Quality Pool Company') && !finalResponse.includes('A Quality Pool')) {
        finalResponse += '\n\nBest regards,\nA Quality Pool Company';
      }
      
      return {
        success: true,
        response: finalResponse
      };
    } else {
      Logger.log('OpenAI API error: ' + responseCode + ' - ' + responseText);
      return { 
        success: false, 
        error: 'AI service temporarily unavailable. Please contact A Quality Pool Company directly for assistance.' 
      };
    }
    
  } catch (error) {
    Logger.log('Error asking AI: ' + error.toString());
    return { 
      success: false, 
      error: 'I apologize, but I encountered an error. Please try again or contact A Quality Pool Company directly for assistance.' 
    };
  }
}

/**
 * Get all pool calculator reports for a customer
 */
function getCustomerPoolReports(customerEmail) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const portalSheet = getCustomerPortalSheet(spreadsheet);
    
    if (!portalSheet) {
      return { success: false, error: 'Customer Portal sheet not found' };
    }
    
    const data = portalSheet.getDataRange().getValues();
    let headers = [];
    let dataStartRow = 2;
    
    if (data.length > 1) {
      headers = data[1];
    } else if (data.length > 0) {
      headers = data[0];
      dataStartRow = 1;
    }
    
    const emailCol = headers.indexOf('Email');
    const savedDataCol = headers.indexOf('_ saved data');
    
    if (emailCol === -1) {
      return { success: false, error: 'Email column not found' };
    }
    
    if (savedDataCol === -1) {
      return { success: true, reports: [] };
    }
    
    // Find customer row
    for (let i = dataStartRow; i < data.length; i++) {
      const row = data[i];
      const rowEmail = (row[emailCol] || '').toString().toLowerCase().trim();
      if (rowEmail === customerEmail.toLowerCase().trim()) {
        const savedData = (row[savedDataCol] || '').toString();
        if (!savedData) {
          return { success: true, reports: [] };
        }
        
        try {
          const parsed = JSON.parse(savedData);
          const reports = parsed.poolReports || [];
          
          // Sort by date (most recent first)
          reports.sort((a, b) => {
            const dateA = a.date ? new Date(a.date) : new Date(0);
            const dateB = b.date ? new Date(b.date) : new Date(0);
            return dateB - dateA;
          });
          
          return { success: true, reports: reports };
        } catch (e) {
          return { success: true, reports: [] };
        }
      }
    }
    
    return { success: false, error: 'Customer not found' };
    
  } catch (error) {
    Logger.log('Error getting customer pool reports: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Get customer-facing service timeline:
 * - upcoming weekly service visits from Appointments
 * - past services from Service_History (plus completed appointment fallback)
 */
function getCustomerServiceHistory(customerEmail) {
  try {
    const email = String(customerEmail || '').toLowerCase().trim();
    if (!email) return { success: false, error: 'Customer email is required' };

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const upcomingWeekly = [];
    const pastServices = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // -------- Appointments (upcoming weekly + fallback past) --------
    const apptSheet = ss.getSheetByName(APPOINTMENTS_SHEET_NAME);
    if (apptSheet && apptSheet.getLastRow() > 1) {
      const rows = apptSheet.getDataRange().getValues();
      const headers = rows[0].map(h => String(h || '').trim());

      const colId = headers.indexOf('ID') >= 0 ? headers.indexOf('ID') : headers.indexOf('AppointmentID');
      const colEmail = headers.indexOf('CustomerEmail');
      const colName = headers.indexOf('CustomerName');
      const colSvc = headers.indexOf('ServiceType');
      const colDate = headers.indexOf('Date');
      const colTime = headers.indexOf('Time');
      const colStatus = headers.indexOf('Status');
      const colAssigned = headers.indexOf('AssignedTo');
      const colAddress = headers.indexOf('Address');
      const colNotes = headers.indexOf('Notes');

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const rowEmail = String(row[colEmail] || '').toLowerCase().trim();
        if (rowEmail !== email) continue;

        const serviceType = String(row[colSvc] || '').trim();
        const status = String(row[colStatus] || 'Scheduled').trim();
        const dateRaw = row[colDate];
        const dateObj = dateRaw ? new Date(dateRaw) : null;
        const dateIso = dateObj && !isNaN(dateObj.getTime())
          ? Utilities.formatDate(dateObj, Session.getScriptTimeZone(), 'yyyy-MM-dd')
          : '';
        const isWeekly = /pool service|weekly/i.test(serviceType);
        const isCancelled = /cancel/i.test(status);
        const isCompleted = /complete|done/i.test(status);

        if (isWeekly && dateObj && !isNaN(dateObj.getTime()) && dateObj >= today && !isCancelled && !isCompleted) {
          upcomingWeekly.push({
            appointmentId: colId >= 0 ? String(row[colId] || '') : '',
            customerName: colName >= 0 ? String(row[colName] || '') : '',
            date: dateIso,
            time: colTime >= 0 ? String(row[colTime] || '') : '',
            serviceType: serviceType || 'Pool Service',
            status: status || 'Scheduled',
            technician: colAssigned >= 0 ? String(row[colAssigned] || '') : '',
            address: colAddress >= 0 ? String(row[colAddress] || '') : ''
          });
        }

        // Fallback past service timeline from appointments (if already completed)
        if (dateObj && !isNaN(dateObj.getTime()) && (dateObj < today || isCompleted)) {
          pastServices.push({
            date: dateIso,
            timestamp: colTime >= 0 ? String(row[colTime] || '') : '',
            serviceType: serviceType || 'Service',
            description: serviceType || 'Service visit',
            notes: colNotes >= 0 ? String(row[colNotes] || '') : '',
            performedBy: colAssigned >= 0 ? String(row[colAssigned] || '') : '',
            status: status || 'Completed',
            source: 'appointments'
          });
        }
      }
    }

    // -------- Service_History (preferred for completed service details) --------
    const historySheet = ss.getSheetByName(SERVICE_HISTORY_SHEET_NAME);
    if (historySheet && historySheet.getLastRow() > 1) {
      const rows = historySheet.getDataRange().getValues();
      const headers = rows[0].map(h => String(h || '').trim());

      const colDate = headers.indexOf('Date');
      const colEmail = headers.indexOf('Customer Email');
      const colServiceType = headers.indexOf('Service Type');
      const colDesc = headers.indexOf('Description');
      const colNotes = headers.indexOf('Notes');
      const colPerformed = headers.indexOf('Performed By');
      const colTs = headers.indexOf('Timestamp');
      const colChem = headers.indexOf('Chemical Readings JSON');
      const colDetails = headers.indexOf('Service Details JSON');

      for (let i = rows.length - 1; i >= 1; i--) {
        const row = rows[i];
        const rowEmail = String(row[colEmail] || '').toLowerCase().trim();
        if (rowEmail !== email) continue;

        let details = {};
        let chemistry = {};
        try { details = colDetails >= 0 && row[colDetails] ? JSON.parse(row[colDetails]) : {}; } catch (e) { details = {}; }
        try { chemistry = colChem >= 0 && row[colChem] ? JSON.parse(row[colChem]) : {}; } catch (e) { chemistry = {}; }

        pastServices.push({
          date: colDate >= 0 ? String(row[colDate] || '') : '',
          timestamp: colTs >= 0 ? String(row[colTs] || '') : '',
          serviceType: colServiceType >= 0 ? String(row[colServiceType] || 'Service') : 'Service',
          description: colDesc >= 0 ? String(row[colDesc] || '') : '',
          notes: colNotes >= 0 ? String(row[colNotes] || '') : '',
          performedBy: colPerformed >= 0 ? String(row[colPerformed] || '') : '',
          workPerformed: String(details.workPerformed || ''),
          issuesFound: String(details.issuesFound || ''),
          chemicalReadings: chemistry,
          status: 'Completed',
          source: 'service_history'
        });
      }
    }

    upcomingWeekly.sort((a, b) => {
      const da = new Date((a.date || '') + 'T' + (a.time || '00:00') + ':00');
      const db = new Date((b.date || '') + 'T' + (b.time || '00:00') + ':00');
      return da - db;
    });

    pastServices.sort((a, b) => {
      const da = new Date((a.date || '1970-01-01') + 'T' + (a.timestamp || '00:00') + ':00');
      const db = new Date((b.date || '1970-01-01') + 'T' + (b.timestamp || '00:00') + ':00');
      return db - da;
    });

    return {
      success: true,
      upcomingWeekly: upcomingWeekly,
      pastServices: pastServices,
      totals: {
        weeklyUpcoming: upcomingWeekly.length,
        pastServices: pastServices.length
      }
    };
  } catch (error) {
    Logger.log('Error getting customer service history: ' + error.toString());
    return { success: false, error: error.toString(), upcomingWeekly: [], pastServices: [] };
  }
}

/**
 * Get customer service photos for the portal Photos tab.
 * Pulls from Service Reports sheet and pool report snapshots.
 */
function getCustomerServicePhotos(customerEmail) {
  try {
    const email = String(customerEmail || '').toLowerCase().trim();
    if (!email) return { success: false, error: 'Customer email is required', photos: [] };

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const photos = [];
    const seen = {};

    const pushPhoto = function(url, date, caption, source) {
      const u = String(url || '').trim();
      if (!u || !/^https?:\/\//i.test(u)) return;
      if (seen[u]) return;
      seen[u] = true;
      photos.push({ url: u, date: String(date || ''), caption: String(caption || ''), source: String(source || '') });
    };

    // Service Reports photos URL field
    const reportsSheet = ss.getSheetByName(SERVICE_REPORTS_SHEET_NAME);
    if (reportsSheet && reportsSheet.getLastRow() > 1) {
      const rows = reportsSheet.getDataRange().getValues();
      const headers = rows[0].map(h => String(h || '').trim());
      const colEmail = headers.indexOf('Customer Email');
      const colDate = headers.indexOf('Service Date');
      const colType = headers.indexOf('Service Type');
      const colNotes = headers.indexOf('Notes');
      const colPhotoUrl = headers.indexOf('Photos URL');

      for (let i = rows.length - 1; i >= 1; i--) {
        const row = rows[i];
        const rowEmail = String(row[colEmail] || '').toLowerCase().trim();
        if (rowEmail !== email) continue;

        const urlsRaw = colPhotoUrl >= 0 ? String(row[colPhotoUrl] || '') : '';
        if (!urlsRaw) continue;
        const urls = urlsRaw.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
        const caption = (colType >= 0 ? String(row[colType] || 'Service') : 'Service')
          + (colNotes >= 0 && row[colNotes] ? ' • ' + String(row[colNotes]).substring(0, 80) : '');
        const date = colDate >= 0 ? String(row[colDate] || '') : '';
        urls.forEach(function(u) { pushPhoto(u, date, caption, 'service_report'); });
      }
    }

    // Pool report single photo URL fallback
    const poolReports = getCustomerPoolReports(email);
    if (poolReports && poolReports.success) {
      (poolReports.reports || []).forEach(function(r) {
        if (r && r.photoUrl) {
          pushPhoto(r.photoUrl, r.date || '', (r.poolShape ? String(r.poolShape) + ' pool snapshot' : 'Pool snapshot'), 'pool_report');
        }
      });
    }

    photos.sort((a, b) => {
      const da = new Date(a.date || '1970-01-01');
      const db = new Date(b.date || '1970-01-01');
      return db - da;
    });

    return { success: true, photos: photos };
  } catch (error) {
    Logger.log('Error getting customer service photos: ' + error.toString());
    return { success: false, error: error.toString(), photos: [] };
  }
}

// ========================================
// PAYMENT SCHEDULE FUNCTIONS
// ========================================

/**
 * Get all payment schedules for a customer
 */
function getCustomerPaymentSchedules(customerEmail) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const invoiceSheet = spreadsheet.getSheetByName(INVOICES_ESTIMATES_SHEET);
    const scheduleSheet = spreadsheet.getSheetByName(PAYMENT_SCHEDULES_SHEET);
    
    if (!invoiceSheet || !scheduleSheet) {
      return { success: true, schedules: [] };
    }
    
    // Get all invoices for customer
    const invoiceData = invoiceSheet.getDataRange().getValues();
    const invoiceHeaders = invoiceData[0];
    const invoiceEmailCol = invoiceHeaders.indexOf('Customer Email');
    const invoiceIdCol = invoiceHeaders.indexOf('ID');
    const invoiceStatusCol = invoiceHeaders.indexOf('Invoice Status');
    
    const customerInvoiceIds = [];
    for (let i = 1; i < invoiceData.length; i++) {
      const rowEmail = (invoiceData[i][invoiceEmailCol] || '').toString().toLowerCase().trim();
      if (rowEmail === customerEmail.toLowerCase().trim()) {
        const invoiceStatus = invoiceStatusCol !== -1 ? (invoiceData[i][invoiceStatusCol] || '') : '';
        // Only get finalized invoices with payment schedules
        if (invoiceStatus === 'Finalized' || invoiceStatus === '') {
          customerInvoiceIds.push(invoiceData[i][invoiceIdCol]);
        }
      }
    }
    
    if (customerInvoiceIds.length === 0) {
      return { success: true, schedules: [] };
    }
    
    // Get payment schedules for these invoices
    const scheduleData = scheduleSheet.getDataRange().getValues();
    const scheduleHeaders = scheduleData[0];
    const scheduleInvoiceIdCol = scheduleHeaders.indexOf('Invoice ID');
    const scheduleIdCol = scheduleHeaders.indexOf('Payment Schedule ID');
    const milestonesCol = scheduleHeaders.indexOf('Payment Milestones JSON');
    const projectIdCol = scheduleHeaders.indexOf('Project ID');
    
    const schedules = [];
    for (let i = 1; i < scheduleData.length; i++) {
      const invoiceId = scheduleData[i][scheduleInvoiceIdCol];
      if (customerInvoiceIds.indexOf(invoiceId) !== -1) {
        try {
          const milestones = JSON.parse(scheduleData[i][milestonesCol] || '[]');
          schedules.push({
            paymentScheduleId: scheduleData[i][scheduleIdCol],
            invoiceId: invoiceId,
            projectId: scheduleData[i][projectIdCol] || '',
            milestones: milestones
          });
        } catch (e) {
          Logger.log('Error parsing milestones for schedule ' + i + ': ' + e.toString());
        }
      }
    }
    
    return { success: true, schedules: schedules };
  } catch (error) {
    Logger.log('Error getting customer payment schedules: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Get payment schedule for a specific project
 */
function getProjectPaymentSchedule(projectId) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const projectsSheet = spreadsheet.getSheetByName(PROJECTS_SHEET_NAME);
    const scheduleSheet = spreadsheet.getSheetByName(PAYMENT_SCHEDULES_SHEET);
    
    if (!projectsSheet || !scheduleSheet) {
      return { success: false, error: 'Sheets not found' };
    }
    
    // Get project to find payment schedule ID
    const projectData = projectsSheet.getDataRange().getValues();
    const projectHeaders = projectData[0];
    const projectIdCol = projectHeaders.indexOf('Project ID');
    const paymentScheduleIdCol = projectHeaders.indexOf('Payment Schedule ID');
    
    let paymentScheduleId = '';
    for (let i = 1; i < projectData.length; i++) {
      if (projectData[i][projectIdCol] === projectId) {
        paymentScheduleId = projectData[i][paymentScheduleIdCol] || '';
        break;
      }
    }
    
    if (!paymentScheduleId) {
      return { success: false, error: 'Payment schedule not found for project' };
    }
    
    // Get payment schedule
    const scheduleData = scheduleSheet.getDataRange().getValues();
    const scheduleHeaders = scheduleData[0];
    const scheduleIdCol = scheduleHeaders.indexOf('Payment Schedule ID');
    const milestonesCol = scheduleHeaders.indexOf('Payment Milestones JSON');
    const totalAmountCol = scheduleHeaders.indexOf('Total Contract Amount');
    
    for (let i = 1; i < scheduleData.length; i++) {
      if (scheduleData[i][scheduleIdCol] === paymentScheduleId) {
        try {
          const milestones = JSON.parse(scheduleData[i][milestonesCol] || '[]');
          return {
            success: true,
            paymentSchedule: {
              paymentScheduleId: paymentScheduleId,
              totalAmount: scheduleData[i][totalAmountCol] || 0,
              milestones: milestones
            }
          };
        } catch (e) {
          return { success: false, error: 'Error parsing payment schedule data' };
        }
      }
    }
    
    return { success: false, error: 'Payment schedule not found' };
  } catch (error) {
    Logger.log('Error getting project payment schedule: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Get next payment due for a project
 */
function getNextPaymentDue(projectId) {
  try {
    const scheduleResult = getProjectPaymentSchedule(projectId);
    if (!scheduleResult.success) {
      return scheduleResult;
    }
    
    const milestones = scheduleResult.paymentSchedule.milestones;
    const now = new Date();
    
    // Find next unpaid milestone
    for (const milestone of milestones) {
      if (milestone.status !== 'paid' && milestone.status !== 'Paid') {
        // Check if due date has passed or phase trigger
        if (milestone.dueTrigger === 'date' && milestone.dueDate) {
          const dueDate = new Date(milestone.dueDate);
          if (dueDate <= now) {
            return {
              success: true,
              milestone: milestone,
              isOverdue: true
            };
          } else {
            return {
              success: true,
              milestone: milestone,
              isOverdue: false
            };
          }
        } else {
          // Phase-based or no specific date - return as next
          return {
            success: true,
            milestone: milestone,
            isOverdue: false
          };
        }
      }
    }
    
    return { success: true, milestone: null, message: 'All payments complete' };
  } catch (error) {
    Logger.log('Error getting next payment due: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Create Stripe checkout for milestone payment
 */
function createStripePaymentForMilestone(milestoneId, paymentScheduleId, customerEmail) {
  try {
    // Call InvoiceEstimate webapp to create checkout
    const invoiceWebAppUrl = INVOICE_WEBAPP_URL;
    
    const response = UrlFetchApp.fetch(invoiceWebAppUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      payload: {
        action: 'createStripeCheckoutForMilestone',
        milestoneId: milestoneId,
        paymentScheduleId: paymentScheduleId,
        customerEmail: customerEmail
      },
      muteHttpExceptions: true
    });
    
    const result = JSON.parse(response.getContentText());
    return result;
  } catch (error) {
    Logger.log('Error creating Stripe payment for milestone: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Send payment confirmation email
 */
function sendPaymentConfirmationEmail(customerEmail, amount, transactionId, milestoneName) {
  try {
    const emailSubject = 'Payment Received - Thank You!';
    const emailBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #10b981;">Payment Received</h2>
        <p>We've received your payment of $${parseFloat(amount).toFixed(2)} for ${milestoneName || 'your payment'}.</p>
        <p><strong>Transaction ID:</strong> ${transactionId}</p>
        <p>Thank you for your payment!</p>
        <p>Best regards,<br>${COMPANY_NAME}</p>
      </div>
    `;
    
    MailApp.sendEmail({
      to: customerEmail,
      subject: emailSubject,
      htmlBody: emailBody
    });
    
    return { success: true };
  } catch (error) {
    Logger.log('Error sending payment confirmation: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Request project add-on (upsell feature)
 */
function requestProjectAddon(projectId, addonName, basePrice, customerEmail, customerName, message) {
  try {
    const emailSubject = `Add-on Request: ${addonName} - Project ${projectId}`;
    const emailBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #0369a1;">✨ New Add-on Request</h2>
        <div style="background: #f0f9ff; border-left: 4px solid #0369a1; padding: 16px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 0; font-size: 16px; font-weight: 700; color: #0369a1;">${addonName}</p>
        </div>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 12px; background: #f9fafb; font-weight: 700; border: 1px solid #e5e7eb;">Customer:</td>
            <td style="padding: 12px; border: 1px solid #e5e7eb;">${customerName || customerEmail}</td>
          </tr>
          <tr>
            <td style="padding: 12px; background: #f9fafb; font-weight: 700; border: 1px solid #e5e7eb;">Email:</td>
            <td style="padding: 12px; border: 1px solid #e5e7eb;"><a href="mailto:${customerEmail}">${customerEmail}</a></td>
          </tr>
          <tr>
            <td style="padding: 12px; background: #f9fafb; font-weight: 700; border: 1px solid #e5e7eb;">Project ID:</td>
            <td style="padding: 12px; border: 1px solid #e5e7eb;"><strong>${projectId}</strong></td>
          </tr>
          <tr>
            <td style="padding: 12px; background: #f9fafb; font-weight: 700; border: 1px solid #e5e7eb;">Add-on:</td>
            <td style="padding: 12px; border: 1px solid #e5e7eb;"><strong style="color: #0369a1;">${addonName}</strong></td>
          </tr>
          <tr>
            <td style="padding: 12px; background: #f9fafb; font-weight: 700; border: 1px solid #e5e7eb;">Base Price:</td>
            <td style="padding: 12px; border: 1px solid #e5e7eb;"><strong style="color: #10b981; font-size: 18px;">$${parseFloat(basePrice).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></td>
          </tr>
        </table>
        
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0 0 12px 0; font-weight: 700; color: #111827;">Customer Message:</p>
          <p style="margin: 0; color: #374151; white-space: pre-wrap; line-height: 1.6;">${message}</p>
        </div>
        
        <div style="background: #fef3c7; border: 2px solid #f59e0b; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; color: #92400e; font-weight: 600;">
            <i class="fas fa-exclamation-circle"></i> Action Required: Please contact the customer to provide a detailed quote for this add-on.
          </p>
        </div>
        
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          This is an automated notification from the Customer Portal.
        </p>
      </div>
    `;
    
    // Send email to company
    MailApp.sendEmail({
      to: COMPANY_EMAIL,
      subject: emailSubject,
      htmlBody: emailBody
    });
    
    // Also send confirmation to customer
    const customerConfirmBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #0369a1;">Thank You for Your Interest!</h2>
        <p>Dear ${customerName || 'Customer'},</p>
        <p>We've received your request for <strong>${addonName}</strong> to be added to your project <strong>${projectId}</strong>.</p>
        
        <div style="background: #f0f9ff; border-left: 4px solid #0369a1; padding: 16px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 0; font-weight: 700; color: #0369a1;">What's Next?</p>
          <p style="margin: 8px 0 0 0; color: #0369a1;">Our team will review your request and contact you within 1-2 business days with a detailed quote.</p>
        </div>
        
        <p>If you have any questions in the meantime, please don't hesitate to contact us:</p>
        <p>
          <strong>Email:</strong> ${COMPANY_EMAIL}<br>
          <strong>Phone:</strong> ${COMPANY_PHONE}
        </p>
        
        <p>Best regards,<br>${COMPANY_NAME}</p>
      </div>
    `;
    
    MailApp.sendEmail({
      to: customerEmail,
      subject: `Add-on Request Received: ${addonName}`,
      htmlBody: customerConfirmBody
    });
    
    return { success: true, message: 'Add-on request submitted successfully' };
  } catch (error) {
    Logger.log('Error requesting project addon: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}


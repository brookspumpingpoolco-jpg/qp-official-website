/**
 * MULTI-TENANT CUSTOMER MANAGEMENT SYSTEM
 * Google Apps Script for managing customer data with Company ID isolation
 * No external dependencies - 100% owned platform
 * 
 * SETUP:
 * 1. Create a new Google Apps Script project
 * 2. Copy this code into Code.gs
 * 3. Create an HTML file named "CustomerInfoUI" and paste CustomerInfoUI.html content
 * 4. Deploy as Web App (Execute as: Me, Who has access: Anyone)
 * 5. Add the deployed URL to your Dashboard
 */

// ========================================
// CONFIGURATION
// ========================================

// Spreadsheet and Sheet Names
const SPREADSHEET_ID = '1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0';
const AUTH_SHEET_NAME = 'Authentication';
const CUSTOMERS_SHEET_NAME = 'Customers';

// Drive folder for customer files
const CUSTOMER_DRIVE_FOLDER_ID = '1tHpDcPkFJ6B3QDopqzpawZrL9Oun2Nrl';

// ========================================
// MAIN WEB APP HANDLERS
// ========================================

function doGet(e) {
  const action = e.parameter.action || 'ui';
  const email = e.parameter.email || '';
  
  // Handle API actions
  if (action === 'getCustomers') {
    return ContentService.createTextOutput(JSON.stringify(getCustomers(email)))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === 'getCompanyInfo') {
    return ContentService.createTextOutput(JSON.stringify(getCompanyInfo(email)))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === 'getCustomerInvoices') {
    const customerEmail = e.parameter.customerEmail || '';
    return ContentService.createTextOutput(JSON.stringify(getCustomerInvoicesForUI(customerEmail, email)))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === 'getCustomerFiles') {
    const customerId = e.parameter.customerId || '';
    const customerName = e.parameter.customerName || '';
    const customerAddress = e.parameter.customerAddress || '';
    return ContentService.createTextOutput(JSON.stringify(getCustomerDriveFiles(customerName, customerAddress)))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === 'sendPhotosToCustomer') {
    const customerEmail = e.parameter.customerEmail || '';
    const customerName = e.parameter.customerName || '';
    const photoUrls = e.parameter.photoUrls || '[]';
    return ContentService.createTextOutput(JSON.stringify(sendPhotosEmail(customerEmail, customerName, JSON.parse(photoUrls))))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  // Default: Return UI
  const template = HtmlService.createTemplateFromFile('CustomerInfoUI');
  template.userEmail = email;
  
  return template.evaluate()
    .setTitle('Customer Management')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ========================================
// CUSTOMER INVOICES INTEGRATION
// ========================================

/**
 * Get customer invoices for UI display
 */
function getCustomerInvoicesForUI(customerEmail, userEmail) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const invoiceSheet = spreadsheet.getSheetByName('Invoices & Estimates');
    
    if (!invoiceSheet) {
      return { success: true, invoices: [] };
    }
    
    const data = invoiceSheet.getDataRange().getValues();
    if (data.length < 2) {
      return { success: true, invoices: [] };
    }
    
    const headers = data[0];
    const emailCol = headers.indexOf('Customer Email');
    const customerIdCol = headers.indexOf('Customer ID');
    const typeCol = headers.indexOf('Type');
    const statusCol = headers.indexOf('Status');
    const paymentStatusCol = headers.indexOf('Payment Status');
    
    if (emailCol === -1 || typeCol === -1) {
      return { success: true, invoices: [] };
    }
    
    const invoices = [];
    const customerEmailLower = customerEmail.toLowerCase().trim();
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rowEmail = (row[emailCol] || '').toString().toLowerCase().trim();
      const rowType = (row[typeCol] || '').toString();
      
      if (rowType === 'Invoice' && rowEmail === customerEmailLower) {
        const total = parseFloat(row[headers.indexOf('Total')] || 0);
        const date = row[headers.indexOf('Date')] || '';
        const dueDate = row[headers.indexOf('Due Date')] || '';
        const paymentStatus = paymentStatusCol !== -1 ? (row[paymentStatusCol] || '') : (row[statusCol] || '');
        
        // Calculate if overdue
        let isOverdue = false;
        let daysOverdue = 0;
        if (dueDate && paymentStatus !== 'Paid') {
          const due = new Date(dueDate);
          const now = new Date();
          if (due < now) {
            isOverdue = true;
            daysOverdue = Math.floor((now - due) / (1000 * 60 * 60 * 24));
          }
        }
        
        invoices.push({
          id: row[0],
          invoiceNumber: row[headers.indexOf('Invoice Number')] || row[0],
          date: date,
          dueDate: dueDate,
          total: total,
          status: paymentStatus || row[statusCol] || '',
          isOverdue: isOverdue,
          daysOverdue: daysOverdue,
          shareLink: row[headers.indexOf('Share Link')] || '',
          description: row[headers.indexOf('Notes')] || ''
        });
      }
    }
    
    // Sort by date descending
    invoices.sort((a, b) => {
      const dateA = a.date ? new Date(a.date) : new Date(0);
      const dateB = b.date ? new Date(b.date) : new Date(0);
      return dateB - dateA;
    });
    
    // Calculate totals
    const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.total, 0);
    const totalPaid = invoices.filter(inv => inv.status === 'Paid').reduce((sum, inv) => sum + inv.total, 0);
    const totalOutstanding = totalInvoiced - totalPaid;
    const totalOverdue = invoices.filter(inv => inv.isOverdue).reduce((sum, inv) => sum + inv.total, 0);
    
    return {
      success: true,
      invoices: invoices,
      summary: {
        totalInvoiced: totalInvoiced,
        totalPaid: totalPaid,
        totalOutstanding: totalOutstanding,
        totalOverdue: totalOverdue,
        count: invoices.length
      }
    };
  } catch (error) {
    Logger.log('Error getting customer invoices: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ========================================
// CUSTOMER DRIVE FILES INTEGRATION
// ========================================

/**
 * Get customer Drive folder files
 */
function getCustomerDriveFiles(customerName, customerAddress) {
  try {
    const parentFolder = DriveApp.getFolderById(CUSTOMER_DRIVE_FOLDER_ID);
    const folderName = `${customerName} - ${customerAddress}`.trim();
    
    const folders = parentFolder.getFoldersByName(folderName);
    if (!folders.hasNext()) {
      return { success: true, files: [], folderUrl: '', folderId: '' };
    }
    
    const customerFolder = folders.next();
    const files = customerFolder.getFiles();
    const fileList = [];
    
    while (files.hasNext()) {
      const file = files.next();
      const fileType = file.getMimeType();
      const isImage = fileType.startsWith('image/');
      
      fileList.push({
        id: file.getId(),
        name: file.getName(),
        url: file.getUrl(),
        thumbnailUrl: isImage ? `https://drive.google.com/thumbnail?id=${file.getId()}&sz=w400` : '',
        size: file.getSize(),
        mimeType: fileType,
        isImage: isImage,
        dateCreated: file.getDateCreated().toISOString(),
        lastModified: file.getLastUpdated().toISOString()
      });
    }
    
    // Sort by date (newest first)
    fileList.sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated));
    
    return {
      success: true,
      files: fileList,
      folderUrl: customerFolder.getUrl(),
      folderId: customerFolder.getId(),
      folderName: folderName
    };
  } catch (error) {
    Logger.log('Error getting customer files: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Send photos to customer via email
 */
function sendPhotosEmail(customerEmail, customerName, photoUrls) {
  try {
    if (!photoUrls || photoUrls.length === 0) {
      return { success: false, error: 'No photos provided' };
    }
    
    const subject = `Pool Photos - ${customerName}`;
    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%); color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; }
    .photo-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 20px 0; }
    .photo-item { border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .photo-item img { width: 100%; height: 150px; object-fit: cover; }
    .button { display: inline-block; padding: 12px 24px; background: #06b6d4; color: white; text-decoration: none; border-radius: 8px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">🏊 Pool Photos</h1>
    </div>
    <div class="content">
      <p>Hi ${customerName},</p>
      <p>We've shared ${photoUrls.length} photo${photoUrls.length > 1 ? 's' : ''} from your pool service:</p>
      <div class="photo-grid">
        ${photoUrls.map(url => `
          <div class="photo-item">
            <img src="${url}" alt="Pool Photo">
          </div>
        `).join('')}
      </div>
      <p>All photos have been saved to your customer folder. If you have any questions, please don't hesitate to reach out!</p>
      <p>Best regards,<br>A Quality Pool Company</p>
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
    
    return { success: true, message: 'Photos sent successfully' };
  } catch (error) {
    Logger.log('Error sending photos email: ' + error);
    return { success: false, error: error.toString() };
  }
}

function doPost(e) {
  try {
    const params = e.parameter;
    const action = params.action;
    
    if (action === 'addCustomer') {
      const result = addCustomer(
        params.email,
        params.name,
        params.customerEmail,
        params.phone,
        params.address,
        params.city,
        params.state,
        params.zip,
        params.notes,
        params.poolData,
        params.serviceData,
        params.customData
      );
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === 'updateCustomer') {
      const result = updateCustomer(
        params.email,
        params.rowIndex,
        params.name,
        params.customerEmail,
        params.phone,
        params.address,
        params.city,
        params.state,
        params.zip,
        params.notes,
        params.poolData,
        params.serviceData,
        params.customData
      );
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === 'deleteCustomer') {
      const result = deleteCustomer(params.email, params.rowIndex);
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: 'Unknown action'
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ========================================
// AUTHENTICATION & COMPANY ID
// ========================================

/**
 * Get Company ID for a user from Authentication sheet
 * Admin users default to CMP-AQUALITYPOOL if not in sheet
 */
function getCompanyIdForUser(email) {
  try {
    // Normalize email
    const cleanEmail = email ? email.toString().trim() : '';
    
    // Check if admin - default to CMP-AQUALITYPOOL
    if (isAdmin(cleanEmail)) {
      Logger.log('Admin user detected: ' + cleanEmail);
      return { success: true, companyId: 'CMP-AQUALITYPOOL', isAdmin: true };
    }
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = ss.getSheetByName(AUTH_SHEET_NAME);
    
    if (!authSheet) {
      return { success: false, error: 'Authentication sheet not found' };
    }
    
    const data = authSheet.getDataRange().getValues();
    if (data.length < 2) {
      return { success: false, error: 'Authentication sheet is empty' };
    }
    
    // Headers might be in row 1 or row 2 (if row 1 is for logo)
    let headers = data[0];
    let dataStartRow = 1;
    
    // Check if row 1 looks like headers (has "Email" or "Name")
    const firstRowText = headers.join('').toLowerCase();
    if (!firstRowText.includes('email') && data.length > 1) {
      headers = data[1]; // Use row 2 as headers
      dataStartRow = 2;
    }
    
    const emailCol = headers.indexOf('Email');
    const companyIdCol = headers.indexOf('Company ID');
    
    if (emailCol === -1) {
      return { success: false, error: 'Email column not found in Authentication sheet. Found columns: ' + headers.join(', ') };
    }
    
    if (companyIdCol === -1) {
      return { success: false, error: 'Company ID column not found in Authentication sheet. Found columns: ' + headers.join(', ') };
    }
    
    // Find user row
    for (let i = dataStartRow; i < data.length; i++) {
      if (data[i][emailCol] === email) {
        const companyId = data[i][companyIdCol];
        
        if (!companyId) {
          return { success: false, error: 'Company ID not set for this user. Please add a Company ID in the Authentication sheet.' };
        }
        
        return { success: true, companyId: companyId, isAdmin: false };
      }
    }
    
    Logger.log('User not found in Authentication sheet: ' + cleanEmail);
    return { success: false, error: 'User not found: ' + cleanEmail };
    
  } catch (error) {
    Logger.log('Error in getCompanyIdForUser: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Get Company Info (name and ID) for a user
 * Admin gets AQuality Pool as default with admin flag
 */
function getCompanyInfo(email) {
  try {
    // Normalize email
    const cleanEmail = email ? email.toString().trim() : '';
    
    // Check if admin
    if (isAdmin(cleanEmail)) {
      return {
        success: true,
        companyId: 'CMP-AQUALITYPOOL',
        companyName: 'AQuality Pool (Admin)',
        isAdmin: true
      };
    }
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = ss.getSheetByName(AUTH_SHEET_NAME);
    
    if (!authSheet) {
      return { success: false, error: 'Authentication sheet not found' };
    }
    
    const data = authSheet.getDataRange().getValues();
    if (data.length < 2) {
      return { success: false, error: 'Authentication sheet is empty' };
    }
    
    // Headers might be in row 1 or row 2 (if row 1 is for logo)
    let headers = data[0];
    let dataStartRow = 1;
    
    // Check if row 1 looks like headers (has "Email" or "Name")
    const firstRowText = headers.join('').toLowerCase();
    if (!firstRowText.includes('email') && data.length > 1) {
      headers = data[1]; // Use row 2 as headers
      dataStartRow = 2;
    }
    
    // Find column indexes - try both "Company" and "Company Name"
    const emailCol = headers.indexOf('Email');
    const companyIdCol = headers.indexOf('Company ID');
    let companyNameCol = headers.indexOf('Company Name');
    if (companyNameCol === -1) {
      companyNameCol = headers.indexOf('Company'); // Fallback to "Company"
    }
    
    if (emailCol === -1 || companyIdCol === -1) {
      return { success: false, error: 'Required columns not found (Email or Company ID). Found columns: ' + headers.join(', ') };
    }
    
    // Find user row
    for (let i = dataStartRow; i < data.length; i++) {
      const rowEmail = (data[i][emailCol] || '').toString().toLowerCase().trim();
      if (rowEmail === cleanEmail.toLowerCase()) {
        const companyId = data[i][companyIdCol];
        const companyName = companyNameCol !== -1 ? (data[i][companyNameCol] || 'My Company') : 'My Company';
        
        if (!companyId) {
          return { success: false, error: 'Company ID not set for this user' };
        }
        
        return { 
          success: true, 
          companyId: companyId,
          companyName: companyName,
          isAdmin: false
        };
      }
    }
    
    return { success: false, error: 'User not found' };
    
  } catch (error) {
    Logger.log('Error in getCompanyInfo: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Check if user is an admin
 * Admin (samr@aqualitypoolcompanyusa.com) can see all companies and customers
 */
function isAdmin(email) {
  if (!email) return false;
  const cleanEmail = email.toString().toLowerCase().trim();
  return cleanEmail === 'samr@aqualitypoolcompanyusa.com';
}

/**
 * Get company name by Company ID from Authentication sheet
 */
function getCompanyNameById(companyId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = ss.getSheetByName(AUTH_SHEET_NAME);
    
    if (!authSheet) {
      return companyId; // Fallback to ID if sheet not found
    }
    
    const data = authSheet.getDataRange().getValues();
    if (data.length < 2) {
      return companyId;
    }
    
    // Headers might be in row 1 or row 2
    let headers = data[0];
    let dataStartRow = 1;
    
    const firstRowText = headers.join('').toLowerCase();
    if (!firstRowText.includes('email') && data.length > 1) {
      headers = data[1];
      dataStartRow = 2;
    }
    
    const companyIdCol = headers.indexOf('Company ID');
    let companyNameCol = headers.indexOf('Company Name');
    if (companyNameCol === -1) {
      companyNameCol = headers.indexOf('Company');
    }
    
    if (companyIdCol === -1 || companyNameCol === -1) {
      return companyId;
    }
    
    // Find company row
    for (let i = dataStartRow; i < data.length; i++) {
      if (data[i][companyIdCol] === companyId) {
        return data[i][companyNameCol] || companyId;
      }
    }
    
    return companyId; // Fallback to ID if not found
    
  } catch (error) {
    Logger.log('Error in getCompanyNameById: ' + error);
    return companyId; // Fallback to ID on error
  }
}

// ========================================
// GOOGLE SHEET CUSTOMERS (Multi-Tenant)
// ========================================

/**
 * Get all customers from Customers sheet filtered by Company ID
 * Admin (samr) can see all companies and customers with company labels
 */
function getCustomers(email) {
  try {
    // Normalize email
    const cleanEmail = email ? email.toString().trim() : '';
    
    // Check if admin
    const adminMode = isAdmin(cleanEmail);
    let companyId = null;
    
    if (!adminMode) {
      // Get Company ID for regular user
      const companyResult = getCompanyIdForUser(cleanEmail);
      if (!companyResult.success) {
        return companyResult;
      }
      companyId = companyResult.companyId;
    }
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const customersSheet = ss.getSheetByName(CUSTOMERS_SHEET_NAME);
    
    if (!customersSheet) {
      return { success: false, error: 'Customers sheet not found' };
    }
    
    const data = customersSheet.getDataRange().getValues();
    const headers = data[0];
    
    // Get column indexes
    const companyIdCol = headers.indexOf('Company ID');
    const customerIdCol = headers.indexOf('Customer ID');
    const nameCol = headers.indexOf('Name');
    const emailCol = headers.indexOf('Email');
    const phoneCol = headers.indexOf('Phone');
    const addressCol = headers.indexOf('Address');
    const cityCol = headers.indexOf('City');
    const stateCol = headers.indexOf('State');
    const zipCol = headers.indexOf('Zip Code');
    const notesCol = headers.indexOf('Notes');
    const createdCol = headers.indexOf('Created Date');
    const updatedCol = headers.indexOf('Last Updated');
    const poolDataCol = headers.indexOf('Pool Data JSON');
    const serviceDataCol = headers.indexOf('Service Data JSON');
    const customDataCol = headers.indexOf('Custom Data JSON');
    
    // Filter customers by Company ID (or show all for admin)
    const customers = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rowCompanyId = row[companyIdCol];
      
      // Include if admin OR if matches user's company
      if (adminMode || rowCompanyId === companyId) {
        let companyName = null;
        if (adminMode && rowCompanyId) {
          try {
            companyName = getCompanyNameById(rowCompanyId);
            // Fallback if companyName is null or undefined
            if (!companyName || companyName === rowCompanyId) {
              companyName = rowCompanyId || 'Unknown Company';
            }
          } catch (e) {
            Logger.log('Error getting company name: ' + e);
            companyName = rowCompanyId || 'Unknown Company';
          }
        }
        
        // Parse JSON columns
        let poolData = {};
        let serviceData = {};
        let customData = {};
        
        try {
          if (poolDataCol !== -1 && row[poolDataCol]) {
            poolData = JSON.parse(row[poolDataCol]);
          }
        } catch (e) {
          Logger.log('Error parsing poolData: ' + e);
        }
        
        try {
          if (serviceDataCol !== -1 && row[serviceDataCol]) {
            serviceData = JSON.parse(row[serviceDataCol]);
          }
        } catch (e) {
          Logger.log('Error parsing serviceData: ' + e);
        }
        
        try {
          if (customDataCol !== -1 && row[customDataCol]) {
            customData = JSON.parse(row[customDataCol]);
          }
        } catch (e) {
          Logger.log('Error parsing customData: ' + e);
        }
        
        customers.push({
          rowIndex: i + 1,
          // Use Customer ID if the column exists; otherwise fall back to email as stable identifier
          id: (customerIdCol >= 0 && row[customerIdCol]) ? String(row[customerIdCol]) : (emailCol >= 0 ? String(row[emailCol] || '') : ''),
          name: row[nameCol] || '',
          given_name: row[nameCol] ? row[nameCol].split(' ')[0] : '',
          family_name: row[nameCol] ? row[nameCol].split(' ').slice(1).join(' ') : '',
          email: row[emailCol] || '',
          email_address: row[emailCol] || '',
          phone: row[phoneCol] || '',
          phone_number: row[phoneCol] || '',
          address: row[addressCol] || '',
          city: row[cityCol] || '',
          state: row[stateCol] || '',
          zip: row[zipCol] || '',
          notes: row[notesCol] || '',
          note: row[notesCol] || '',
          created_at: row[createdCol] || '',
          updated_at: row[updatedCol] || '',
          // JSON data
          poolData: poolData,
          serviceData: serviceData,
          customData: customData,
          // Admin-specific fields
          companyId: adminMode ? rowCompanyId : undefined,
          companyName: adminMode ? companyName : undefined
        });
      }
    }
    
    // Sort by company name (admin) then by customer name
    // For admin: prioritize "A Quality Pool Company" first
    customers.sort((a, b) => {
      if (adminMode) {
        const aqpcName = 'A Quality Pool Company';
        const aIsAQPC = a.companyName === aqpcName;
        const bIsAQPC = b.companyName === aqpcName;
        
        // A Quality Pool Company always comes first
        if (aIsAQPC && !bIsAQPC) return -1;
        if (!aIsAQPC && bIsAQPC) return 1;
        
        // Then sort by company name
        if (a.companyName && b.companyName) {
          const companyCompare = a.companyName.localeCompare(b.companyName);
          if (companyCompare !== 0) return companyCompare;
        }
      }
      
      // Then sort by customer name
      const nameA = `${a.given_name} ${a.family_name}`;
      const nameB = `${b.given_name} ${b.family_name}`;
      return nameA.localeCompare(nameB);
    });
    
    // Get list of unique companies for admin filter
    let companies = [];
    if (adminMode) {
      const companyMap = new Map();
      customers.forEach(customer => {
        if (customer.companyId && customer.companyName) {
          if (!companyMap.has(customer.companyId)) {
            companyMap.set(customer.companyId, {
              id: customer.companyId,
              name: customer.companyName,
              count: 0
            });
          }
          companyMap.get(customer.companyId).count++;
        }
      });
      companies = Array.from(companyMap.values());
      // Sort companies: A Quality Pool Company first, then alphabetically
      companies.sort((a, b) => {
        const aqpcName = 'A Quality Pool Company';
        if (a.name === aqpcName) return -1;
        if (b.name === aqpcName) return 1;
        return a.name.localeCompare(b.name);
      });
    }
    
    return { 
      success: true, 
      customers: customers,
      isAdmin: adminMode,
      companies: companies,
      totalCount: customers.length
    };
    
  } catch (error) {
    Logger.log('Error in getCustomers: ' + error);
    return { success: false, error: error.toString() };
  }
}

// Alias for compatibility
function getSquareCustomers(email) {
  return getCustomers(email);
}

// ========================================
// CUSTOMER MANAGEMENT (ADD/EDIT/DELETE)
// ========================================

/**
 * Generate unique Customer ID
 */
function generateCustomerId() {
  const year = new Date().getFullYear();
  const timestamp = Date.now().toString().slice(-6);
  return `CUST-${year}-${timestamp}`;
}

/**
 * Add a new customer with JSON data support
 */
function addCustomer(email, name, customerEmail, phone, address, city, state, zip, notes, poolData, serviceData, customData) {
  try {
    // Get Company ID for this user (admin defaults to CMP-AQUALITYPOOL)
    const companyResult = getCompanyIdForUser(email);
    if (!companyResult.success) {
      return companyResult;
    }
    
    const companyId = companyResult.companyId;
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const customersSheet = ss.getSheetByName(CUSTOMERS_SHEET_NAME);
    
    if (!customersSheet) {
      return { success: false, error: 'Customers sheet not found' };
    }
    
    const now = new Date().toISOString();
    const customerId = generateCustomerId();
    
    // Prepare row data with JSON columns
    const newRow = [
      companyId,
      name || '',          // col B: Name  (sheet has NO Customer ID column)
      customerEmail || '',
      phone || '',
      address || '',
      city || '',
      state || '',
      zip || '',
      notes || '',
      now,
      now,
      poolData || '{}',
      serviceData || '{}',
      customData || '{}'
    ];
    
    // Add to sheet
    const nextRow = customersSheet.getLastRow() + 1;
    customersSheet.getRange(nextRow, 1, 1, newRow.length).setValues([newRow]);
    
    return {
      success: true,
      message: 'Customer added successfully',
      customerId: customerId
    };
    
  } catch (error) {
    Logger.log('Error in addCustomer: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Update an existing customer with JSON data support
 */
function updateCustomer(email, rowIndex, name, customerEmail, phone, address, city, state, zip, notes, poolData, serviceData, customData) {
  try {
    // Get Company ID for this user (admin defaults to CMP-AQUALITYPOOL)
    const companyResult = getCompanyIdForUser(email);
    if (!companyResult.success) {
      return companyResult;
    }
    
    const companyId = companyResult.companyId;
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const customersSheet = ss.getSheetByName(CUSTOMERS_SHEET_NAME);
    
    if (!customersSheet) {
      return { success: false, error: 'Customers sheet not found' };
    }
    
    // Verify this row belongs to the user's company (or user is admin)
    const data = customersSheet.getDataRange().getValues();
    const headers = data[0];
    const companyIdCol = headers.indexOf('Company ID');
    
    const rowData = data[rowIndex - 1];
    const isAdminUser = companyResult.isAdmin || false;
    
    if (!isAdminUser && rowData[companyIdCol] !== companyId) {
      return { success: false, error: 'Unauthorized: Cannot edit this customer' };
    }
    
    // Update the row
    const now = new Date().toISOString();
    const createdDate = rowData[headers.indexOf('Created Date')];  // preserve original created date
    
    const updatedRow = [
      companyId,
      name || '',          // col B: Name  (no Customer ID column in sheet)
      customerEmail || '',
      phone || '',
      address || '',
      city || '',
      state || '',
      zip || '',
      notes || '',
      createdDate,
      now,
      poolData || '{}',
      serviceData || '{}',
      customData || '{}'
    ];
    
    customersSheet.getRange(rowIndex, 1, 1, updatedRow.length).setValues([updatedRow]);
    
    return {
      success: true,
      message: 'Customer updated successfully'
    };
    
  } catch (error) {
    Logger.log('Error in updateCustomer: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Delete a customer
 */
function deleteCustomer(email, rowIndex) {
  try {
    // Get Company ID for this user (admin defaults to CMP-AQUALITYPOOL)
    const companyResult = getCompanyIdForUser(email);
    if (!companyResult.success) {
      return companyResult;
    }
    
    const companyId = companyResult.companyId;
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const customersSheet = ss.getSheetByName(CUSTOMERS_SHEET_NAME);
    
    if (!customersSheet) {
      return { success: false, error: 'Customers sheet not found' };
    }
    
    // Verify this row belongs to the user's company (or user is admin)
    const data = customersSheet.getDataRange().getValues();
    const headers = data[0];
    const companyIdCol = headers.indexOf('Company ID');
    
    const rowData = data[rowIndex - 1];
    const isAdminUser = companyResult.isAdmin || false;
    
    if (!isAdminUser && rowData[companyIdCol] !== companyId) {
      return { success: false, error: 'Unauthorized: Cannot delete this customer' };
    }
    
    // Delete the row
    customersSheet.deleteRow(rowIndex);
    
    return {
      success: true,
      message: 'Customer deleted successfully'
    };
    
  } catch (error) {
    Logger.log('Error in deleteCustomer: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ========================================
// TEST FUNCTIONS
// ========================================
/**
 * ONE-TIME DATA MIGRATION: Fix rows where addCustomer incorrectly wrote
 * the Customer ID (CUST-XXXX) into the Name column, shifting all fields right by 1.
 *
 * Run this function ONCE from the Apps Script editor after deploying the code fix.
 * It detects rows where the Name column contains a CUST-* code and removes that
 * value, shifting Name/Email/Phone/etc. back to their correct columns.
 */
function fixCorruptedCustomerRows() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CUSTOMERS_SHEET_NAME);
    if (!sheet) return { success: false, error: 'Customers sheet not found' };

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const nameCol = headers.indexOf('Name');
    if (nameCol === -1) return { success: false, error: 'Name column not found in sheet headers' };

    const custCodeRegex = /^CUST-\d{4}-/i;
    let fixedCount = 0;
    const log = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const nameValue = String(row[nameCol] || '').trim();

      // Skip empty rows
      if (!nameValue && !row[nameCol + 1]) continue;

      // If the Name column holds a CUST-* code the row was written with the old bug
      if (custCodeRegex.test(nameValue)) {
        const oldCustId = nameValue;
        // Build corrected row: remove element at nameCol (the misplaced Customer ID)
        const fixedRow = row.slice(0, nameCol).concat(row.slice(nameCol + 1));
        sheet.getRange(i + 1, 1, 1, fixedRow.length).setValues([fixedRow]);
        log.push('Row ' + (i + 1) + ': removed "' + oldCustId + '" from Name column → name is now "' + fixedRow[nameCol] + '"');
        fixedCount++;
      }
    }

    Logger.log('fixCorruptedCustomerRows: fixed ' + fixedCount + ' rows.\n' + log.join('\n'));
    return {
      success: true,
      fixedCount: fixedCount,
      message: 'Fixed ' + fixedCount + ' corrupted row(s). Check Logger for details.',
      details: log
    };
  } catch (error) {
    Logger.log('fixCorruptedCustomerRows error: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ========================================
// ========================================

/**
 * TEST FUNCTION - Run this to authorize spreadsheet access
 * This will trigger the authorization dialog
 */
function authorizeSpreadsheetAccess() {
  try {
    Logger.log('Testing spreadsheet access...');
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = spreadsheet.getSheetByName(AUTH_SHEET_NAME);
    
    if (authSheet) {
      Logger.log('✅ Success! Spreadsheet access authorized.');
      Logger.log('Sheet name: ' + authSheet.getName());
      Logger.log('Rows: ' + authSheet.getLastRow());
      return {
        success: true,
        message: 'Authorization successful! You can now use the Customer Info tool.'
      };
    } else {
      Logger.log('⚠️ Sheet not found: ' + AUTH_SHEET_NAME);
      return {
        success: false,
        error: 'Authentication sheet not found'
      };
    }
  } catch (error) {
    Logger.log('❌ Authorization error: ' + error.toString());
    Logger.log('');
    Logger.log('TO AUTHORIZE:');
    Logger.log('1. Click "Run" button in Apps Script editor');
    Logger.log('2. Click "Review Permissions" when prompted');
    Logger.log('3. Select your Google account');
    Logger.log('4. Click "Advanced" → "Go to [Project] (unsafe)" if shown');
    Logger.log('5. Click "Allow"');
    Logger.log('6. Run this function again to verify');
    
    throw error;
  }
}

/**
 * TEST FUNCTION - Run this to authorize email sending
 * This will trigger the email authorization dialog
 */
function authorizeEmailAccess() {
  try {
    Logger.log('Testing email access...');
    
    // Try to get user email (this may trigger authorization)
    let userEmail;
    try {
      userEmail = Session.getActiveUser().getEmail();
      Logger.log('User email: ' + userEmail);
    } catch (e) {
      Logger.log('Cannot get user email yet - will be available after authorization');
    }
    
    // Try to send a test email (this will trigger authorization)
    MailApp.sendEmail({
      to: userEmail || 'test@example.com',
      subject: 'Authorization Test - Customer Portal Invite',
      body: 'If you receive this email, email permissions are working!'
    });
    
    Logger.log('✅ Success! Email access authorized.');
    Logger.log('You can now send portal invites.');
    return {
      success: true,
      message: 'Email authorization successful!'
    };
    
  } catch (error) {
    Logger.log('❌ Email authorization error: ' + error.toString());
    Logger.log('');
    Logger.log('TO AUTHORIZE EMAIL:');
    Logger.log('1. Click "Run" button in Apps Script editor');
    Logger.log('2. Click "Review Permissions" when prompted');
    Logger.log('3. Select your Google account');
    Logger.log('4. Click "Advanced" → "Go to [Project] (unsafe)" if shown');
    Logger.log('5. Click "Allow" (this will grant email sending permissions)');
    Logger.log('6. Run this function again to verify');
    
    throw error;
  }
}

// ========================================
// CUSTOMER PORTAL INVITE
// ========================================

/**
 * Check if customer already has portal access
 */
function checkCustomerPortalAccess(customerEmail) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = spreadsheet.getSheetByName(AUTH_SHEET_NAME);
    
    if (!authSheet) {
      return { success: false, error: 'Authentication sheet not found' };
    }
    
    const data = authSheet.getDataRange().getValues();
    
    // Headers are in row 2 (row 1 is blank for logo)
    // Data starts in row 3
    let headers = [];
    let dataStartRow = 2; // Row 3 in sheet = index 2 in array
    
    if (data.length > 1) {
      headers = data[1]; // Row 2 in sheet = index 1 in array
    } else if (data.length > 0) {
      headers = data[0]; // Fallback to row 1 if row 2 doesn't exist
      dataStartRow = 1;
    }
    
    // Find email and role columns (case-insensitive)
    // Based on your sheet: Email is Column C (index 2), Role is Column E (index 4)
    let emailCol = -1;
    let roleCol = -1;
    
    for (let i = 0; i < headers.length; i++) {
      const header = (headers[i] || '').toString().toLowerCase().trim();
      if (header === 'email' || header === 'email address') {
        emailCol = i;
      }
      if (header === 'role' || header === 'user role') {
        roleCol = i;
      }
    }
    
    if (emailCol === -1) {
      return { 
        success: false, 
        error: 'Email column not found in Authentication sheet. Please ensure the sheet has an "Email" column header.' 
      };
    }
    
    if (roleCol === -1) {
      return { 
        success: false, 
        error: 'Role column not found in Authentication sheet. Please ensure the sheet has a "Role" column header.' 
      };
    }
    
    // Find password and status columns
    let passwordCol = -1;
    let statusCol = -1;
    let accountStatusCol = -1;
    let tokenCol = -1;
    
    for (let i = 0; i < headers.length; i++) {
      const header = (headers[i] || '').toString().toLowerCase().trim();
      if (header === 'password') passwordCol = i;
      if (header === 'status') statusCol = i;
      if (header === 'account status') accountStatusCol = i;
      if (header === 'signup token' || header === 'verification code' || header === 'token') tokenCol = i;
    }
    
    // Check if customer email exists with "Customer" role (start from dataStartRow)
    for (let i = dataStartRow; i < data.length; i++) {
      const row = data[i];
      const email = (row[emailCol] || '').toString().toLowerCase().trim();
      const role = (row[roleCol] || '').toString();
      
      if (email === customerEmail.toLowerCase().trim() && role === 'Customer') {
        // Check if they have a password set (active account) or just a token (pending sign-up)
        const password = passwordCol !== -1 ? (row[passwordCol] || '').toString() : '';
        const token = tokenCol !== -1 ? (row[tokenCol] || '').toString() : '';
        const status = statusCol !== -1 ? (row[statusCol] || '').toString() : '';
        const accountStatus = accountStatusCol !== -1 ? (row[accountStatusCol] || '').toString() : '';
        
        // If they have a password and are Active/Approved, they have access
        if (password && password.length > 0 && status === 'Active' && accountStatus === 'Approved') {
          return { 
            success: true, 
            hasAccess: true, 
            message: 'Customer already has portal access' 
          };
        }
        
        // If they have a token but no password, they're pending sign-up
        if (token && token.length > 0 && (!password || password.length === 0)) {
          return {
            success: true,
            hasAccess: false,
            pendingSignup: true,
            message: 'Invitation sent - pending customer sign-up'
          };
        }
      }
    }
    
    return { 
      success: true, 
      hasAccess: false, 
      message: 'Customer does not have portal access yet' 
    };
    
  } catch (error) {
    Logger.log('Error checking customer portal access: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Send customer portal invite email
 * Only sends if customer is NEW (doesn't already have portal access)
 */
function sendCustomerPortalInvite(customerEmail, customerName) {
  try {
    // Check if customer already has portal access
    const checkResult = checkCustomerPortalAccess(customerEmail);
    if (!checkResult.success) {
      return checkResult;
    }
    
    if (checkResult.hasAccess) {
      return {
        success: false,
        error: 'Customer already has portal access. No invite needed.'
      };
    }
    
    // Generate unique sign-up token
    const token = Utilities.getUuid();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Token expires in 7 days
    
    // Add customer to Authentication sheet as pending
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = spreadsheet.getSheetByName(AUTH_SHEET_NAME);
    
    if (!authSheet) {
      return { success: false, error: 'Authentication sheet not found' };
    }
    
    // Headers are in row 2 (row 1 is blank for logo)
    // Based on your sheet structure: Name (B), Email (C), Password (D), Role (E), Status (F), Account Status (G), etc.
    const data = authSheet.getDataRange().getValues();
    let headers = [];
    let dataStartRow = 2; // Row 3 in sheet = index 2 in array
    
    if (data.length > 1) {
      headers = data[1]; // Row 2 in sheet = index 1 in array
    } else if (data.length > 0) {
      headers = data[0]; // Fallback
      dataStartRow = 1;
    }
    
    // Find columns (case-insensitive)
    // Expected: Name (B/1), Email (C/2), Role (E/4), Status (F/5), Account Status (G/6), Verification Code (H/7)
    let nameCol = -1;
    let emailCol = -1;
    let roleCol = -1;
    let statusCol = -1;
    let accountStatusCol = -1;
    let signupTokenCol = -1;
    let tokenExpiresCol = -1;
    
    for (let i = 0; i < headers.length; i++) {
      const header = (headers[i] || '').toString().toLowerCase().trim();
      if (header === 'name') nameCol = i;
      if (header === 'email' || header === 'email address') emailCol = i;
      if (header === 'role' || header === 'user role') roleCol = i;
      if (header === 'status') statusCol = i;
      if (header === 'account status') accountStatusCol = i;
      if (header === 'verification code' || header === 'signup token' || header === 'token') signupTokenCol = i;
      if (header === 'token expires' || header === 'verification expires' || header === 'expires') tokenExpiresCol = i;
    }
    
    // Validate required columns
    if (emailCol === -1) {
      return { success: false, error: 'Email column not found in Authentication sheet' };
    }
    if (nameCol === -1) {
      return { success: false, error: 'Name column not found in Authentication sheet' };
    }
    if (roleCol === -1) {
      return { success: false, error: 'Role column not found in Authentication sheet' };
    }
    
    // Build row data array (fill with empty values first)
    const numColumns = headers.length;
    const newRow = new Array(numColumns).fill('');
    
    // Set values for found columns
    if (nameCol !== -1) newRow[nameCol] = customerName || '';
    if (emailCol !== -1) newRow[emailCol] = customerEmail;
    if (roleCol !== -1) newRow[roleCol] = 'Customer';
    if (statusCol !== -1) newRow[statusCol] = 'Pending';
    if (accountStatusCol !== -1) newRow[accountStatusCol] = 'Pending';
    if (signupTokenCol !== -1) newRow[signupTokenCol] = token;
    if (tokenExpiresCol !== -1) newRow[tokenExpiresCol] = expiresAt;
    
    authSheet.appendRow(newRow);
    
    // Generate portal sign-up URL
    const portalSignupUrl = 'https://script.google.com/macros/s/AKfycbzufaCna0EMb_E-Z1lAnj0giInxYUsSWw7wj-Z1PCaMz7T9ny92nzbutiR3GwPD9Pw/exec?token=' + encodeURIComponent(token);
    
    // Send invite email
    const emailSubject = 'Welcome to ' + COMPANY_NAME + ' Customer Portal';
    const emailHtml = getPortalInviteEmailTemplate(customerName, portalSignupUrl, token);
    
    MailApp.sendEmail({
      to: customerEmail,
      subject: emailSubject,
      htmlBody: emailHtml
    });
    
    Logger.log('Portal invite sent to: ' + customerEmail);
    
    return {
      success: true,
      message: 'Portal invite sent successfully',
      token: token
    };
    
  } catch (error) {
    Logger.log('Error sending portal invite: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Get portal invite email HTML template
 */
function getPortalInviteEmailTemplate(customerName, signupUrl, token) {
  const LOGO_URL = 'https://cdn.prod.website-files.com/6931dc4e8e97334e195432df/6931dca5c5fb5c5fc0860f2c_test.png';
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #0369a1 0%, #0284c7 100%); padding: 40px; text-align: center;">
              <img src="${LOGO_URL}" alt="${COMPANY_NAME}" style="max-width: 120px; height: auto; margin-bottom: 16px;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 800;">Welcome to Your Customer Portal!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.6;">Hi ${customerName || 'there'},</p>
              <p style="margin: 0 0 30px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                You've been invited to access your customer portal for ${COMPANY_NAME}! Your portal gives you convenient access to:
              </p>
              <ul style="margin: 0 0 30px 0; padding-left: 20px; color: #374151; font-size: 16px; line-height: 2;">
                <li>View your project status and timeline</li>
                <li>Track orders and purchases</li>
                <li>View estimates and invoices</li>
                <li>Schedule service appointments</li>
                <li>Pay invoices online</li>
                <li>Upload photos and communicate with our team</li>
              </ul>
              <div style="background: #f0f9ff; border: 2px solid #0284c7; border-radius: 12px; padding: 24px; text-align: center; margin: 30px 0;">
                <p style="margin: 0 0 20px 0; color: #0369a1; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Get Started</p>
                <a href="${signupUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #0369a1 0%, #0284c7 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(3, 105, 161, 0.3);">
                  Set Up Your Portal Access
                </a>
                <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 12px;">
                  This link will expire in 7 days. If you have trouble, contact us at ${COMPANY_EMAIL}
                </p>
              </div>
              <p style="margin: 30px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                If you didn't expect this invitation, please ignore this email or contact us if you have concerns.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f9fafb; padding: 30px 40px; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 12px;">© ${new Date().getFullYear()} ${COMPANY_NAME}. All rights reserved.</p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">${COMPANY_EMAIL} | (502) 731-9217</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}


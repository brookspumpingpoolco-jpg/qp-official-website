/**
 * MULTI-TENANT CUSTOMER MANAGEMENT SYSTEM
 * 100% owned platform - no external dependencies
 * Company ID-based data isolation
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

const SPREADSHEET_ID = '1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0';
const AUTH_SHEET_NAME = 'Authentication';
const CUSTOMERS_SHEET_NAME = 'Customers';

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
  
  // Default: Return UI
  const template = HtmlService.createTemplateFromFile('CustomerInfoUI');
  template.userEmail = email;
  
  return template.evaluate()
    .setTitle('Customer Management')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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
        params.poolData || '{}',
        params.serviceData || '{}',
        params.customData || '{}'
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
        params.poolData || '{}',
        params.serviceData || '{}',
        params.customData || '{}'
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
 */
function getCompanyIdForUser(email) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = ss.getSheetByName(AUTH_SHEET_NAME);
    
    if (!authSheet) {
      return { success: false, error: 'Authentication sheet not found' };
    }
    
    const data = authSheet.getDataRange().getValues();
    const headers = data[0];
    const emailCol = headers.indexOf('Email');
    const companyIdCol = headers.indexOf('Company ID');
    
    if (emailCol === -1 || companyIdCol === -1) {
      return { success: false, error: 'Required columns not found' };
    }
    
    // Find user row
    for (let i = 1; i < data.length; i++) {
      if (data[i][emailCol] === email) {
        const companyId = data[i][companyIdCol];
        
        if (!companyId) {
          return { success: false, error: 'Company ID not set for this user' };
        }
        
        return { success: true, companyId: companyId };
      }
    }
    
    return { success: false, error: 'User not found' };
    
  } catch (error) {
    Logger.log('Error in getCompanyIdForUser: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Get Company Info (name and ID) for a user
 */
function getCompanyInfo(email) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = ss.getSheetByName(AUTH_SHEET_NAME);
    
    if (!authSheet) {
      return { success: false, error: 'Authentication sheet not found' };
    }
    
    const data = authSheet.getDataRange().getValues();
    const headers = data[0];
    
    // Find column indexes - try both "Company" and "Company Name"
    const emailCol = headers.indexOf('Email');
    const companyIdCol = headers.indexOf('Company ID');
    let companyNameCol = headers.indexOf('Company Name');
    if (companyNameCol === -1) {
      companyNameCol = headers.indexOf('Company'); // Fallback to "Company"
    }
    
    if (emailCol === -1 || companyIdCol === -1) {
      return { success: false, error: 'Required columns not found (Email or Company ID)' };
    }
    
    // Find user row
    for (let i = 1; i < data.length; i++) {
      if (data[i][emailCol] === email) {
        const companyId = data[i][companyIdCol];
        const companyName = data[i][companyNameCol] || 'My Company';
        
        if (!companyId) {
          return { success: false, error: 'Company ID not set for this user' };
        }
        
        return { 
          success: true, 
          companyId: companyId,
          companyName: companyName
        };
      }
    }
    
    return { success: false, error: 'User not found' };
    
  } catch (error) {
    Logger.log('Error in getCompanyInfo: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ========================================
// CUSTOMER MANAGEMENT
// ========================================

/**
 * Get all customers filtered by Company ID
 */
function getCustomers(email) {
  try {
    // Get Company ID for this user
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
    
    // Filter customers by Company ID
    const customers = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      
      // Only include customers for this company
      if (row[companyIdCol] === companyId) {
        // Parse JSON data safely
        let poolData = {};
        let serviceData = {};
        let customData = {};
        
        try {
          poolData = row[poolDataCol] ? JSON.parse(row[poolDataCol]) : {};
        } catch (e) {
          poolData = {};
        }
        
        try {
          serviceData = row[serviceDataCol] ? JSON.parse(row[serviceDataCol]) : {};
        } catch (e) {
          serviceData = {};
        }
        
        try {
          customData = row[customDataCol] ? JSON.parse(row[customDataCol]) : {};
        } catch (e) {
          customData = {};
        }
        
        customers.push({
          rowIndex: i + 1,
          // Use Customer ID if the column exists; otherwise fall back to email as stable identifier
          id: (customerIdCol >= 0 && row[customerIdCol]) ? String(row[customerIdCol]) : (emailCol >= 0 ? String(row[emailCol] || '') : ''),
          name: row[nameCol] || '',
          email: row[emailCol] || '',
          phone: row[phoneCol] || '',
          address: row[addressCol] || '',
          city: row[cityCol] || '',
          state: row[stateCol] || '',
          zip: row[zipCol] || '',
          notes: row[notesCol] || '',
          created: row[createdCol] || '',
          updated: row[updatedCol] || '',
          poolData: poolData,
          serviceData: serviceData,
          customData: customData
        });
      }
    }
    
    // Sort by name
    customers.sort((a, b) => a.name.localeCompare(b.name));
    
    return { success: true, customers: customers, total: customers.length };
    
  } catch (error) {
    Logger.log('Error in getCustomers: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Generate unique Customer ID
 */
function generateCustomerId() {
  const year = new Date().getFullYear();
  const timestamp = Date.now().toString().slice(-6);
  return `CUST-${year}-${timestamp}`;
}

/**
 * Add a new customer
 */
function addCustomer(email, name, customerEmail, phone, address, city, state, zip, notes, poolData, serviceData, customData) {
  try {
    // Get Company ID for this user
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
    
    Logger.log(`Customer added: ${customerId} for company ${companyId}`);
    
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
 * Update an existing customer
 */
function updateCustomer(email, rowIndex, name, customerEmail, phone, address, city, state, zip, notes, poolData, serviceData, customData) {
  try {
    // Get Company ID for this user
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
    
    // Verify this row belongs to the user's company
    const data = customersSheet.getDataRange().getValues();
    const headers = data[0];
    const companyIdCol = headers.indexOf('Company ID');
    
    const rowData = data[rowIndex - 1];
    if (rowData[companyIdCol] !== companyId) {
      Logger.log(`Unauthorized edit attempt: User ${email} (${companyId}) tried to edit row ${rowIndex}`);
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
    
    Logger.log(`Customer updated: ${customerId} by ${email}`);
    
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
    // Get Company ID for this user
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
    
    // Verify this row belongs to the user's company
    const data = customersSheet.getDataRange().getValues();
    const headers = data[0];
    const companyIdCol = headers.indexOf('Company ID');
    
    const rowData = data[rowIndex - 1];
    if (rowData[companyIdCol] !== companyId) {
      Logger.log(`Unauthorized delete attempt: User ${email} (${companyId}) tried to delete row ${rowIndex}`);
      return { success: false, error: 'Unauthorized: Cannot delete this customer' };
    }
    
    const customerId = rowData[headers.indexOf('Customer ID')];
    
    // Delete the row
    customersSheet.deleteRow(rowIndex);
    
    Logger.log(`Customer deleted: ${customerId} by ${email}`);
    
    return {
      success: true,
      message: 'Customer deleted successfully'
    };
    
  } catch (error) {
    Logger.log('Error in deleteCustomer: ' + error);
    return { success: false, error: error.toString() };
  }
}

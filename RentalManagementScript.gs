// Rental Property Management System - Google Apps Script
// Handles property management, tenant tracking, and Stripe payments

// ============================================
// CONFIGURATION
// ============================================

// Spreadsheet ID - Update this with your Google Sheet ID
const SPREADSHEET_ID = '1sC_q33TB088JdHc23zhLAU_bM59Q9nE7eZf9ugL4YoY';

// Stripe API Key - Update with your Stripe Secret Key
const STRIPE_SECRET_KEY = 'REDACTED';

// Stripe API Base URL
const STRIPE_API_URL = 'https://api.stripe.com/v1';

// Master Properties Sheet Name
const MASTER_SHEET_NAME = 'Properties';

// Authentication Sheet Name
const AUTH_SHEET_NAME = 'Users';

// Google Drive folder for tenant documents (leases, receipts, etc.)
const TENANT_DOCUMENTS_FOLDER_ID = '1qWttkQIH6kx0uAJLhme4HRJoMzlvkg65';

// Google Drive folder for storage unit documents (insurance, leases, etc.)
const STORAGE_DOCUMENTS_FOLDER_ID = TENANT_DOCUMENTS_FOLDER_ID;

// Background Checks Sheet Name
const BACKGROUND_CHECKS_SHEET_NAME = 'Background Checks';

// ============================================
// MAIN HANDLERS
// ============================================

/**
 * Handle OPTIONS requests for CORS preflight
 * Google Apps Script automatically handles CORS when deployed with "Anyone" access
 */
function doOptions(e) {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Helper function to create CORS-enabled JSON response
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handle GET requests
 */
function doGet(e) {
  try {
    e = e || {};
    const params = e.parameter || {};
    const action = params.action || '';
    
    // If no action is provided, serve the RentalDashboard HTML page
    // This is what lets you embed the full dashboard directly in Google Sites
    if (!action) {
      return HtmlService
        .createHtmlOutputFromFile('RentalDashboard')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
    
    if (action === 'getProperties') {
      return handleGetProperties(params);
    } else if (action === 'getPropertyDetails') {
      return handleGetPropertyDetails(params.propertyId);
    } else if (action === 'getPropertyAnalytics') {
      return handleGetPropertyAnalytics(params.propertyId);
    } else if (action === 'getAllTenants') {
      return handleGetAllTenants();
    } else if (action === 'sendRentReminders') {
      return handleSendRentReminders();
    } else if (action === 'addExpense') {
      return handleAddExpense(params);
    } else if (action === 'createPayment') {
      return handleCreatePayment(params.propertyId, params.amount);
    } else if (action === 'createPaymentLink') {
      return handleCreatePaymentLink(params.propertyId);
    } else if (action === 'paymentSuccess') {
      return handlePaymentSuccess(params.propertyId, params.session_id);
    } else if (action === 'paymentCancel') {
      return handlePaymentCancel();
    } else if (action === 'stripeWebhook') {
      return handleStripeWebhook(e);
    } else if (action === 'login') {
      return handleRentalLogin(params);
    } else if (action === 'checkAuth') {
      return handleCheckAuth(params);
    } else if (action === 'setupAutopay') {
      return handleSetupAutopay(params);
    } else if (action === 'getAutopayStatus') {
      return handleGetAutopayStatus(params);
    } else if (action === 'cancelAutopay') {
      return handleCancelAutopay(params);
    } else if (action === 'sendAutopaySetupEmail') {
      return handleSendAutopaySetupEmail(params);
    } else if (action === 'autopaySuccess') {
      return handleAutopaySuccess(params);
    } else if (action === 'autopayCancel') {
      return handleAutopayCancel();
    } else if (action === 'tenantPortal') {
      return HtmlService
        .createHtmlOutputFromFile('TenantPortal')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    } else if (action === 'sendTenantInvite') {
      return handleSendTenantInvite(params);
    } else if (action === 'tenantLogin') {
      return handleTenantLogin(params);
    } else if (action === 'getTenantProperty') {
      return handleGetTenantProperty(params);
    } else if (action === 'tenantPayRent') {
      return handleTenantPayRent(params);
    } else if (action === 'getTenantLeases') {
      return handleGetTenantLeases(params);
    } else if (action === 'backgroundCheck') {
      return HtmlService
        .createHtmlOutputFromFile('BackgroundCheck')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    } else if (action === 'getBackgroundCheckByCode') {
      const code = params.code;
      if (!code) {
        return createJsonResponse({
          success: false,
          message: 'Check code is required'
        });
      }
      const result = handleGetBackgroundCheckByCode(code);
      return createJsonResponse(result);
    } else if (action === 'requestBackgroundCheck') {
      return handleRequestBackgroundCheck(params);
    } else if (action === 'getBackgroundCheckStatus') {
      return handleGetBackgroundCheckStatus(params);
    } else if (action === 'submitMaintenanceRequest') {
      return handleSubmitMaintenanceRequest(e);
    } else if (action === 'getPaymentStreak') {
      return handleGetPaymentStreak(params);
    } else if (action === 'waiveLateFee') {
      return handleWaiveLateFee(params);
    } else if (action === 'goodDeedMonth') {
      return handleGoodDeedMonth(params);
    } else if (action === 'createStorageUnits') {
      return handleCreateStorageUnits();
    } else if (action === 'getAvailableStorageUnits') {
      return handleGetAvailableStorageUnits();
    } else if (action === 'getStorageUnitDetails') {
      return handleGetStorageUnitDetails(params);
    } else if (action === 'getStoragePaymentHistory') {
      return handleGetStoragePaymentHistory(params);
    } else if (action === 'updateStorageVehicleInfo') {
      return handleUpdateStorageVehicleInfo(params);
    } else if (action === 'createStorageCustomerPortal') {
      return handleCreateStorageCustomerPortal(params);
    } else {
      return createJsonResponse({
        success: false,
        message: 'Invalid action'
      });
    }
  } catch (error) {
    Logger.log('doGet error: ' + error.toString());
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

/**
 * Handle POST requests
 */
function doPost(e) {
  try {
    // Check if this is a Stripe webhook
    const contentType = e.postData ? e.postData.type : '';
    if (contentType.indexOf('application/json') !== -1 || e.parameter.type) {
      // This might be a Stripe webhook
      return handleStripeWebhook(e);
    }
    
    let requestData = {};
    
    // Parse JSON body if available
    if (e.postData && e.postData.contents) {
      try {
        requestData = JSON.parse(e.postData.contents);
      } catch (parseError) {
        // If not JSON, try form data
        const params = e.postData.contents.split('&');
        params.forEach(param => {
          const [key, value] = param.split('=');
          requestData[decodeURIComponent(key)] = decodeURIComponent(value || '');
        });
      }
    }
    
    // Also check parameters
    if (e.parameter) {
      Object.keys(e.parameter).forEach(key => {
        requestData[key] = e.parameter[key];
      });
    }
    
    const action = requestData.action;
    
    if (action === 'addProperty') {
      return handleAddProperty(requestData);
    } else if (action === 'processPayment') {
      return handleProcessPayment(requestData);
    } else if (action === 'addExpense') {
      return handleAddExpense(requestData);
    } else if (action === 'sendRentReminder') {
      return handleSendRentReminder(requestData);
    } else if (action === 'login') {
      return handleRentalLogin(requestData);
    } else if (action === 'setupAutopay') {
      return handleSetupAutopay(requestData);
    } else if (action === 'cancelAutopay') {
      return handleCancelAutopay(requestData);
    } else if (action === 'sendAutopaySetupEmail') {
      return handleSendAutopaySetupEmail(requestData);
    } else if (action === 'sendTenantInvite') {
      return handleSendTenantInvite(requestData);
    } else if (action === 'tenantLogin') {
      return handleTenantLogin(requestData);
    } else if (action === 'getTenantProperty') {
      return handleGetTenantProperty(requestData);
    } else if (action === 'tenantPayRent') {
      return handleTenantPayRent(requestData);
    } else if (action === 'getTenantLeases') {
      return handleGetTenantLeases(requestData);
    } else if (action === 'getTenantPaymentHistory') {
      return handleGetTenantPaymentHistory(requestData);
    } else if (action === 'createStripeCustomerPortal') {
      return handleCreateStripeCustomerPortal(requestData);
    } else if (action === 'requestBackgroundCheck') {
      return handleRequestBackgroundCheck(requestData);
    } else if (action === 'submitBackgroundCheck') {
      return handleSubmitBackgroundCheck(requestData);
    } else if (action === 'getBackgroundCheckStatus') {
      return handleGetBackgroundCheckStatus(requestData);
    } else if (action === 'tenantSignup') {
      return handleTenantSignup(requestData);
    } else if (action === 'storageUnitSignup') {
      return handleStorageUnitSignup(requestData);
    } else if (action === 'getPendingTenants') {
      return handleGetPendingTenants(requestData);
    } else if (action === 'approveTenant') {
      return handleApproveTenant(requestData);
    } else if (action === 'rejectTenant') {
      return handleRejectTenant(requestData);
    } else if (action === 'sendPortalInstructions') {
      return handleSendPortalInstructions(requestData);
    } else if (action === 'submitMaintenanceRequest') {
      return handleSubmitMaintenanceRequest(e);
    } else if (action === 'getPaymentStreak') {
      return handleGetPaymentStreak(requestData);
    } else if (action === 'waiveLateFee') {
      return handleWaiveLateFee(requestData);
    } else if (action === 'goodDeedMonth') {
      return handleGoodDeedMonth(requestData);
    } else if (action === 'createStorageUnits') {
      return handleCreateStorageUnits();
    } else if (action === 'getAvailableStorageUnits') {
      return handleGetAvailableStorageUnits();
    } else if (action === 'updateStorageVehicleInfo') {
      return handleUpdateStorageVehicleInfo(requestData);
    } else if (action === 'createStorageCustomerPortal') {
      return handleCreateStorageCustomerPortal(requestData);
    } else if (action === 'createStoragePaymentLink') {
      return handleCreateStoragePaymentLink(requestData);
    } else {
      return createJsonResponse({
        success: false,
        message: 'Invalid action'
      });
    }
  } catch (error) {
    Logger.log('doPost error: ' + error.toString());
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

// ============================================
// PROPERTY MANAGEMENT
// ============================================

/**
 * Get all properties (optionally filtered by type)
 */
function handleGetProperties(params) {
  try {
    params = params || {};
    const filterType = params.filterType || params.propertyType; // Support both parameter names
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const masterSheet = getOrCreateMasterSheet(spreadsheet);
    
    const data = masterSheet.getDataRange().getValues();
    const headers = data[0];
    
    // Find column indices
    const colMap = {};
    headers.forEach((header, index) => {
      colMap[header] = index;
    });
    
    const properties = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[0]) { // If property ID exists
        const propertyType = row[colMap['Property Type']] || 'Rental Property';
        
        // Apply filter if specified
        if (filterType && propertyType !== filterType) {
          continue;
        }
        
        properties.push({
          id: row[colMap['ID']] || generateId(),
          propertyType: propertyType,
          propertyName: row[colMap['Property Name']] || '',
          unitNumber: row[colMap['Unit Number']] || '',
          size: row[colMap['Size']] || '',
          address: row[colMap['Address']] || '',
          monthlyRent: row[colMap['Monthly Rent']] || 0,
          tenantName: row[colMap['Tenant Name']] || '',
          tenantEmail: row[colMap['Tenant Email']] || '',
          tenantPhone: row[colMap['Tenant Phone']] || '',
          status: row[colMap['Status']] || 'Vacant',
          createdAt: row[colMap['Created At']] || new Date().toISOString()
        });
      }
    }
    
    // Calculate stats
    const stats = calculateStats(properties);
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      properties: properties,
      stats: stats
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log('handleGetProperties error: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Get property details
 */
function handleGetPropertyDetails(propertyId) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const masterSheet = getOrCreateMasterSheet(spreadsheet);
    
    const property = getPropertyById(propertyId, masterSheet);
    
    if (!property) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Property not found'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Include property type and storage-specific fields
    const data = masterSheet.getDataRange().getValues();
    const headers = data[0];
    const colMap = {};
    headers.forEach((header, index) => {
      colMap[header] = index;
    });
    
    // Find the property row and get all fields
    for (let i = 1; i < data.length; i++) {
      if (data[i][colMap['ID']] === propertyId) {
        property.propertyType = data[i][colMap['Property Type']] || 'Rental Property';
        property.unitNumber = data[i][colMap['Unit Number']] || '';
        property.size = data[i][colMap['Size']] || '';
        break;
      }
    }
    
    // Get payment history from property sheet
    const propertySheet = spreadsheet.getSheetByName(property.propertyName);
    const paymentHistory = [];
    
    if (propertySheet) {
      // Payment data starts at row 22 (after headers at row 21)
      // Read until we hit the EXPENSES section
      for (let row = 22; row < 100; row++) {
        const dateValue = propertySheet.getRange(row, 1).getValue();
        if (dateValue === 'EXPENSES') break; // Stop at expenses section
        if (dateValue && dateValue !== '') {
          paymentHistory.push({
            date: dateValue,
            amount: propertySheet.getRange(row, 2).getValue() || 0,
            lateFee: propertySheet.getRange(row, 3).getValue() || 0,
            total: propertySheet.getRange(row, 4).getValue() || 0,
            status: propertySheet.getRange(row, 5).getValue() || 'Pending',
            paymentDate: propertySheet.getRange(row, 6).getValue() || '',
            stripeId: propertySheet.getRange(row, 7).getValue() || '',
            notes: propertySheet.getRange(row, 8).getValue() || ''
          });
        }
      }
    }
    
    property.paymentHistory = paymentHistory;
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      property: property
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log('handleGetPropertyDetails error: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Add a new property
 */
function handleAddProperty(data) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const masterSheet = getOrCreateMasterSheet(spreadsheet);
    
    // Generate unique ID
    const propertyId = generateId();
    
    // Add to master sheet
    const newRow = [
      propertyId,
      data.propertyType || 'Rental Property',
      data.propertyName,
      data.unitNumber || '',
      data.size || '',
      data.address,
      data.monthlyRent,
      data.tenantName || '',
      data.tenantEmail || '',
      data.tenantPhone || '',
      data.tenantName ? 'Occupied' : 'Vacant',
      new Date().toISOString()
    ];
    
    masterSheet.appendRow(newRow);
    
    // Create property-specific sheet (only for rental properties)
    if (data.propertyType === 'Storage Unit') {
      // Add to consolidated Storage Units sheet instead of individual sheet
      const unitData = {
        unitNumber: data.unitNumber || '',
        size: data.size || '',
        monthlyRent: data.monthlyRent || 0,
        powerIncluded: data.powerIncluded || false,
        gateCode: data.gateCode || '', // Gate code for automation
        tenantName: data.tenantName || '',
        tenantEmail: data.tenantEmail || '',
        tenantPhone: data.tenantPhone || '',
        status: data.tenantName ? 'Occupied' : 'Vacant',
        propertyId: propertyId
      };
      addUnitToStorageUnitsSheet(spreadsheet, unitData);
    } else {
      createPropertySheet(spreadsheet, data.propertyName, data);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: 'Property added successfully',
      propertyId: propertyId
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log('handleAddProperty error: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================
// SHEET MANAGEMENT
// ============================================

/**
 * Get or create master properties sheet
 */
function getOrCreateMasterSheet(spreadsheet) {
  let masterSheet = spreadsheet.getSheetByName(MASTER_SHEET_NAME);
  
  if (!masterSheet) {
    masterSheet = spreadsheet.insertSheet(MASTER_SHEET_NAME);
    
    // Set up headers
    const headers = [
      'ID',
      'Property Type',
      'Property Name',
      'Unit Number',
      'Size',
      'Address',
      'Monthly Rent',
      'Power Included',
      'Tenant Name',
      'Tenant Email',
      'Tenant Phone',
      'Status',
      'Created At'
    ];
    
    masterSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    masterSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    masterSheet.getRange(1, 1, 1, headers.length).setBackground('#4285f4');
    masterSheet.getRange(1, 1, 1, headers.length).setFontColor('#ffffff');
    
    // Freeze header row
    masterSheet.setFrozenRows(1);
  }
  
  return masterSheet;
}

/**
 * Create a comprehensive sheet for a specific property
 * Includes: Property Info, Financial Overview, Payment History, Late Notices, Expenses, Profit Analysis
 */
function createPropertySheet(spreadsheet, propertyName, propertyData) {
  try {
    // Safety check: if spreadsheet is not provided, get it from SPREADSHEET_ID
    if (!spreadsheet) {
      try {
        spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
      } catch (e) {
        Logger.log('Error opening spreadsheet: ' + e.toString());
        Logger.log('Spreadsheet ID: ' + SPREADSHEET_ID);
        throw new Error('Cannot access spreadsheet. Please verify the SPREADSHEET_ID is correct and the spreadsheet exists. Error: ' + e.toString());
      }
    }
    
    // Verify spreadsheet is accessible
    if (!spreadsheet) {
      throw new Error('Spreadsheet object is null or undefined');
    }
    
    // Safety check: ensure propertyName is provided
    if (!propertyName) {
      throw new Error('Property name is required');
    }
    
    // Safety check: ensure propertyData is provided
    if (!propertyData) {
      propertyData = {};
    }
    
  // Check if sheet already exists
    let propertySheet;
    try {
      propertySheet = spreadsheet.getSheetByName(propertyName);
    } catch (e) {
      Logger.log('Error checking for existing sheet: ' + e.toString());
      throw new Error('Cannot access spreadsheet sheets. Make sure the script has permission to edit the spreadsheet. Error: ' + e.toString());
    }
  
  if (propertySheet) {
      return propertySheet; // Don't recreate if exists
  }
  
  // Create new sheet
  propertySheet = spreadsheet.insertSheet(propertyName);
  
    // Clear any default formatting
    propertySheet.clearFormats();
    
    // Freeze first row only (can't freeze columns if we're merging across them)
    try {
      propertySheet.setFrozenRows(1);
    } catch (freezeError) {
      Logger.log('Warning: Could not freeze rows (non-critical): ' + freezeError.toString());
    }
    
    // COLUMN LAYOUT - Everything side by side, visible on one screen
    
    // COLUMN A-B: PROPERTY INFO (Rows 2-15)
  propertySheet.getRange(2, 1).setValue('PROPERTY INFORMATION');
  propertySheet.getRange(2, 1, 1, 2).merge();
    propertySheet.getRange(2, 1, 1, 2).setBackground('#1e40af').setFontColor('#ffffff').setFontWeight('bold').setFontSize(12);
    
    propertySheet.getRange(3, 1).setValue('Property Name:'); propertySheet.getRange(3, 2).setValue(propertyData.propertyName || propertyName);
    propertySheet.getRange(4, 1).setValue('Address:'); propertySheet.getRange(4, 2).setValue(propertyData.address || '');
    propertySheet.getRange(5, 1).setValue('Monthly Rent:'); propertySheet.getRange(5, 2).setValue(parseFloat(propertyData.monthlyRent || 0)).setNumberFormat('$#,##0.00');
    propertySheet.getRange(6, 1).setValue('Tenant Name:'); propertySheet.getRange(6, 2).setValue(propertyData.tenantName || 'Vacant');
    propertySheet.getRange(7, 1).setValue('Tenant Email:'); propertySheet.getRange(7, 2).setValue(propertyData.tenantEmail || '');
    propertySheet.getRange(8, 1).setValue('Tenant Phone:'); propertySheet.getRange(8, 2).setValue(propertyData.tenantPhone || '');
    propertySheet.getRange(9, 1).setValue('Status:'); propertySheet.getRange(9, 2).setValue(propertyData.tenantName ? 'Occupied' : 'Vacant');
    
    SpreadsheetApp.flush();
    
    // COLUMN D-E: FINANCIAL OVERVIEW (Rows 2-15)
    propertySheet.getRange(2, 4).setValue('FINANCIAL OVERVIEW');
    propertySheet.getRange(2, 4, 1, 2).merge();
    propertySheet.getRange(2, 4, 1, 2).setBackground('#059669').setFontColor('#ffffff').setFontWeight('bold').setFontSize(12);
    
    propertySheet.getRange(3, 4).setValue('Ownership:'); propertySheet.getRange(3, 5).setValue('Fully Owned');
    propertySheet.getRange(4, 4).setValue('Monthly Mortgage:'); propertySheet.getRange(4, 5).setValue(0).setNumberFormat('$#,##0.00');
    propertySheet.getRange(5, 4).setValue('Annual Taxes:'); propertySheet.getRange(5, 5).setValue(0).setNumberFormat('$#,##0.00');
    propertySheet.getRange(6, 4).setValue('Monthly Tax:'); propertySheet.getRange(6, 5).setFormula('=E5/12').setNumberFormat('$#,##0.00');
    propertySheet.getRange(7, 4).setValue('Annual Insurance:'); propertySheet.getRange(7, 5).setValue(0).setNumberFormat('$#,##0.00');
    propertySheet.getRange(8, 4).setValue('Monthly Insurance:'); propertySheet.getRange(8, 5).setFormula('=E7/12').setNumberFormat('$#,##0.00');
    propertySheet.getRange(9, 4).setValue('Total Expenses:'); propertySheet.getRange(9, 5).setFormula('=E4+E6+E8').setNumberFormat('$#,##0.00').setFontWeight('bold');
    propertySheet.getRange(10, 4).setValue('Cash Flow:'); propertySheet.getRange(10, 5).setFormula('=B5-E9').setNumberFormat('$#,##0.00').setFontWeight('bold');
    
    SpreadsheetApp.flush();
    
    // COLUMN G-O: PAYMENT HISTORY (Rows 2-100) - Main transaction log
    propertySheet.getRange(2, 7).setValue('PAYMENT HISTORY');
    propertySheet.getRange(2, 7, 1, 9).merge();
    propertySheet.getRange(2, 7, 1, 9).setBackground('#1e40af').setFontColor('#ffffff').setFontWeight('bold').setFontSize(12);
    
    const headers = ['Date Due', 'Date Paid', 'Rent', 'Late Fee', 'Total', 'Method', 'Status', 'Stripe ID', 'Notes'];
    propertySheet.getRange(3, 7, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#3b82f6').setFontColor('#ffffff');
    propertySheet.getRange(4, 7, 100, 2).setNumberFormat('mm/dd/yyyy'); // Date columns
    propertySheet.getRange(4, 9, 100, 3).setNumberFormat('$#,##0.00'); // Amount columns
    
    SpreadsheetApp.flush();
    
    // COLUMN R-X: LATE NOTICES (Rows 2-50)
    propertySheet.getRange(2, 18).setValue('LATE NOTICES');
    propertySheet.getRange(2, 18, 1, 7).merge();
    propertySheet.getRange(2, 18, 1, 7).setBackground('#dc2626').setFontColor('#ffffff').setFontWeight('bold').setFontSize(12);
    
    const noticeHeaders = ['Notice Date', 'Due Date', 'Type', 'Sent To', 'Method', 'Status', 'Notes'];
    propertySheet.getRange(3, 18, 1, noticeHeaders.length).setValues([noticeHeaders]).setFontWeight('bold').setBackground('#ef4444').setFontColor('#ffffff');
    propertySheet.getRange(4, 18, 50, 2).setNumberFormat('mm/dd/yyyy');
    
    SpreadsheetApp.flush();
    
    // COLUMN Z-AF: EXPENSES (Rows 2-50)
    propertySheet.getRange(2, 26).setValue('EXPENSES');
    propertySheet.getRange(2, 26, 1, 6).merge();
    propertySheet.getRange(2, 26, 1, 6).setBackground('#f59e0b').setFontColor('#ffffff').setFontWeight('bold').setFontSize(12);
    
    const expenseHeaders = ['Date', 'Category', 'Amount', 'Vendor', 'Description', 'Receipt #'];
    propertySheet.getRange(3, 26, 1, expenseHeaders.length).setValues([expenseHeaders]).setFontWeight('bold').setBackground('#fbbf24').setFontColor('#ffffff');
    propertySheet.getRange(4, 26, 50, 1).setNumberFormat('mm/dd/yyyy');
    propertySheet.getRange(4, 28, 50, 1).setNumberFormat('$#,##0.00');
    
    SpreadsheetApp.flush();
    
    // Profit analysis will be handled in HTML - removed from spreadsheet
    
    // Set column widths for landscape view (wrap in try-catch - non-critical)
    try {
      const widths = [
        [1, 100], [2, 120], [3, 20], [4, 100], [5, 100], [6, 20],
        [7, 80], [8, 80], [9, 80], [10, 70], [11, 80], [12, 80], [13, 70], [14, 150], [15, 150], [17, 20],
        [18, 80], [19, 80], [20, 70], [21, 100], [22, 70], [23, 70], [24, 120], [25, 20],
        [26, 80], [27, 80], [28, 80], [29, 100], [30, 120], [31, 100], [32, 20]
      ];
      
      for (let i = 0; i < widths.length; i++) {
        propertySheet.setColumnWidth(widths[i][0], widths[i][1]);
        // Flush every 5 columns to avoid rate limits
        if (i % 5 === 0) {
          SpreadsheetApp.flush();
        }
      }
      
      SpreadsheetApp.flush();
    } catch (widthError) {
      Logger.log('Warning: Could not set all column widths (non-critical): ' + widthError.toString());
      // Continue anyway - column widths are nice but not critical
    }
    
    Logger.log('Property sheet created successfully: ' + propertyName);
  return propertySheet;
  } catch (error) {
    Logger.log('Error creating property sheet: ' + error.toString());
    Logger.log('Error stack: ' + error.stack);
    // Return the sheet even if formatting failed, so at least the sheet exists
    try {
      return spreadsheet.getSheetByName(propertyName);
    } catch (e) {
      throw new Error('Failed to create property sheet: ' + error.toString());
    }
  }
}

/**
 * Helper function to format section headers
 */
function formatPropertySectionHeader(sheet, row, col, numCols, color) {
  try {
    const range = sheet.getRange(row, col, 1, numCols);
    range.setFontWeight('bold');
    range.setFontSize(14);
    range.setBackground(color);
    range.setFontColor('#ffffff');
  } catch (error) {
    Logger.log('Error formatting section header at row ' + row + ': ' + error.toString());
    // Continue even if formatting fails
  }
}

/**
 * Get property by ID
 */
function getPropertyById(propertyId, masterSheet) {
  const data = masterSheet.getDataRange().getValues();
  const headers = data[0];
  
  const colMap = {};
  headers.forEach((header, index) => {
    colMap[header] = index;
  });
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[colMap['ID']] === propertyId) {
      return {
        id: row[colMap['ID']],
        propertyType: row[colMap['Property Type']] || 'Rental Property',
        propertyName: row[colMap['Property Name']] || '',
        unitNumber: row[colMap['Unit Number']] || '',
        size: row[colMap['Size']] || '',
        address: row[colMap['Address']] || '',
        monthlyRent: row[colMap['Monthly Rent']] || 0,
        powerIncluded: row[colMap['Power Included']] || false,
        tenantName: row[colMap['Tenant Name']] || '',
        tenantEmail: row[colMap['Tenant Email']] || '',
        tenantPhone: row[colMap['Tenant Phone']] || '',
        status: row[colMap['Status']] || 'Vacant',
        createdAt: row[colMap['Created At']] || new Date().toISOString()
      };
    }
  }
  
  return null;
}

// ============================================
// PAYMENT PROCESSING
// ============================================

/**
 * Create Stripe payment
 */
function handleCreatePayment(propertyId, amount) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const masterSheet = getOrCreateMasterSheet(spreadsheet);
    const property = getPropertyById(propertyId, masterSheet);
    
    if (!property) {
      return HtmlService.createHtmlOutput('<h1>Error</h1><p>Property not found</p>');
    }
    
    // Calculate late fee
    const lateFee = calculateLateFeeForProperty(property);
    const totalAmount = parseFloat(amount) || (parseFloat(property.monthlyRent) + lateFee);
    
    // Create Stripe Checkout Session
    const checkoutSession = createStripeCheckoutSession(property, totalAmount);
    
    if (checkoutSession && checkoutSession.url) {
      // Return HTML that redirects to Stripe
      return HtmlService.createHtmlOutput(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Redirecting to Payment...</title>
          <meta http-equiv="refresh" content="0;url=${checkoutSession.url}">
        </head>
        <body>
          <p>Redirecting to payment page...</p>
          <script>window.location.href = "${checkoutSession.url}";</script>
        </body>
        </html>
      `);
    } else {
      return HtmlService.createHtmlOutput('<h1>Error</h1><p>Failed to create payment session</p>');
    }
  } catch (error) {
    Logger.log('handleCreatePayment error: ' + error.toString());
    return HtmlService.createHtmlOutput('<h1>Error</h1><p>' + error.toString() + '</p>');
  }
}

/**
 * Process payment (webhook or manual)
 */
function handleProcessPayment(data) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const masterSheet = getOrCreateMasterSheet(spreadsheet);
    const property = getPropertyById(data.propertyId, masterSheet);
    
    if (!property) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Property not found'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    let propertySheet = spreadsheet.getSheetByName(property.propertyName);
    if (!propertySheet) {
      propertySheet = createPropertySheet(spreadsheet, property.propertyName, property);
    }
    
    const lateFee = calculateLateFeeForProperty(property);
    const rentAmount = parseFloat(property.monthlyRent);
    const totalAmount = rentAmount + lateFee;
    
    // Record payment in property sheet - Payment History is in columns G-O (7-15), starts at row 4
    const today = new Date();
    const dueDate = new Date(today.getFullYear(), today.getMonth(), 1);
    
    // Payment History columns: G(7)=Date Due, H(8)=Date Paid, I(9)=Rent, J(10)=Late Fee, K(11)=Total, L(12)=Method, M(13)=Status, N(14)=Stripe ID, O(15)=Notes
    const paymentRow = [
      dueDate,                       // G (7): Date Due - Date object
      today,                         // H (8): Date Paid - Date object
      rentAmount,                    // I (9): Rent Amount
      lateFee,                       // J (10): Late Fee
      totalAmount,                   // K (11): Total Amount
      data.paymentMethod || 'Manual', // L (12): Payment Method
      'Paid',                        // M (13): Payment Status
      data.stripePaymentId || '',    // N (14): Stripe Payment ID
      data.notes || ''               // O (15): Notes
    ];
    
    // Find the first empty row after payment headers (starts at row 4, column G/7)
    let insertRow = 4;
    for (let row = 4; row < 104; row++) {
      const cellValue = propertySheet.getRange(row, 7).getValue(); // Check Date Due column (G/7)
      if (!cellValue || cellValue === '' || cellValue === 'LATE NOTICES') {
          insertRow = row;
        break;
      }
    }
    // Write to columns G-O (7-15)
    propertySheet.getRange(insertRow, 7, 1, paymentRow.length).setValues([paymentRow]);
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: 'Payment recorded successfully'
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log('handleProcessPayment error: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================
// STRIPE INTEGRATION
// ============================================

/**
 * Create Stripe Checkout Session
 */
function createStripeCheckoutSession(property, amount) {
  try {
    const amountInCents = Math.round(amount * 100);
    const webAppUrl = ScriptApp.getService().getUrl();
    
    // Build form-encoded payload
    const payload = [
      'payment_method_types[]=card',
      'line_items[0][price_data][currency]=usd',
      'line_items[0][price_data][product_data][name]=' + encodeURIComponent(property.propertyName + ' - Rent Payment'),
      'line_items[0][price_data][unit_amount]=' + amountInCents,
      'line_items[0][quantity]=1',
      'mode=payment',
      'success_url=' + encodeURIComponent(webAppUrl + '?action=paymentSuccess&propertyId=' + property.id + '&session_id={CHECKOUT_SESSION_ID}'),
      'cancel_url=' + encodeURIComponent(webAppUrl + '?action=paymentCancel'),
      'metadata[property_id]=' + property.id,
      'metadata[property_name]=' + encodeURIComponent(property.propertyName)
    ].join('&');
    
    const options = {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      payload: payload,
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(STRIPE_API_URL + '/checkout/sessions', options);
    const responseData = JSON.parse(response.getContentText());
    
    if (responseData.id && responseData.url) {
      return {
        id: responseData.id,
        url: responseData.url
      };
    } else {
      Logger.log('Stripe error: ' + JSON.stringify(responseData));
      return null;
    }
  } catch (error) {
    Logger.log('createStripeCheckoutSession error: ' + error.toString());
    return null;
  }
}

/**
 * Handle payment success - verifies and records payment
 */
function handlePaymentSuccess(propertyId, sessionId) {
  try {
    // Verify the payment with Stripe and record it
    let paymentRecorded = false;
    if (sessionId) {
      paymentRecorded = recordPaymentFromSession(sessionId, propertyId);
      if (!paymentRecorded) {
        Logger.log('Payment verification failed or already recorded');
      }
    }
    
    return HtmlService.createHtmlOutput(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Payment Successful</title>
        <style>
          body {
            font-family: 'Barlow', sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: #f3f4f6;
          }
          .success-container {
            background: white;
            padding: 40px;
            border-radius: 16px;
            text-align: center;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            max-width: 500px;
          }
          .success-icon {
            font-size: 64px;
            color: #059669;
            margin-bottom: 20px;
          }
          h1 {
            color: #111827;
            margin-bottom: 16px;
          }
          p {
            color: #6b7280;
            margin-bottom: 24px;
          }
          .btn {
            background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            text-decoration: none;
            display: inline-block;
            font-weight: 600;
          }
        </style>
      </head>
      <body>
        <div class="success-container">
          <div class="success-icon">✓</div>
          <h1>Payment Successful!</h1>
          <p>Your rent payment has been processed successfully.</p>
          <a href="javascript:window.close()" class="btn">Close</a>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    Logger.log('handlePaymentSuccess error: ' + error.toString());
    return HtmlService.createHtmlOutput('<h1>Payment Processed</h1><p>There was an error recording the payment, but it may have been processed. Please check your records.</p>');
  }
}

/**
 * Handle payment cancel
 */
function handlePaymentCancel() {
  return HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payment Cancelled</title>
      <style>
        body {
          font-family: 'Barlow', sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
          background: #f3f4f6;
        }
        .cancel-container {
          background: white;
          padding: 40px;
          border-radius: 16px;
          text-align: center;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          max-width: 500px;
        }
        .cancel-icon {
          font-size: 64px;
          color: #dc2626;
          margin-bottom: 20px;
        }
        h1 {
          color: #111827;
          margin-bottom: 16px;
        }
        p {
          color: #6b7280;
          margin-bottom: 24px;
        }
        .btn {
          background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
          color: white;
          padding: 12px 24px;
          border-radius: 8px;
          text-decoration: none;
          display: inline-block;
          font-weight: 600;
        }
      </style>
    </head>
    <body>
      <div class="cancel-container">
        <div class="cancel-icon">✕</div>
        <h1>Payment Cancelled</h1>
        <p>Your payment was cancelled. No charges were made.</p>
        <a href="javascript:window.close()" class="btn">Close</a>
      </div>
    </body>
    </html>
  `);
}

// ============================================
// STRIPE WEBHOOK HANDLING
// ============================================

/**
 * Handle Stripe webhook events
 * This automatically records payments when Stripe notifies us
 */
function handleStripeWebhook(e) {
  try {
    // Get webhook payload
    let payload = {};
    if (e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else if (e.parameter) {
      payload = e.parameter;
    }
    
    const eventType = payload.type;
    const eventData = payload.data ? payload.data.object : payload;
    
    Logger.log('Stripe webhook received: ' + eventType);
    
    // Handle checkout.session.completed event (payment successful)
    if (eventType === 'checkout.session.completed') {
      const sessionId = eventData.id;
      const propertyId = eventData.metadata ? eventData.metadata.property_id : null;
      const paymentStatus = eventData.payment_status;
      
      if (paymentStatus === 'paid' && propertyId) {
        const recorded = recordPaymentFromSession(sessionId, propertyId);
        if (recorded) {
          Logger.log('Payment automatically recorded from webhook: ' + sessionId);
          return createJsonResponse({
            success: true,
            message: 'Payment recorded'
          });
        }
      }
    }
    
    // Handle payment_intent.succeeded (alternative event)
    if (eventType === 'payment_intent.succeeded') {
      const paymentIntentId = eventData.id;
      // Try to find the checkout session from metadata
      const propertyId = eventData.metadata ? eventData.metadata.property_id : null;
      if (propertyId) {
        // Record payment using payment intent
        recordPaymentFromPaymentIntent(paymentIntentId, propertyId);
      }
    }
    
    // Handle invoice.payment_succeeded (subscription payments)
    if (eventType === 'invoice.payment_succeeded') {
      const subscriptionId = eventData.subscription;
      const amountPaid = eventData.amount_paid;
      const propertyId = eventData.metadata ? eventData.metadata.property_id : null;
      
      if (subscriptionId && propertyId) {
        // Get subscription details to find property
        const subOptions = {
          method: 'get',
          headers: {
            'Authorization': 'Bearer ' + STRIPE_SECRET_KEY
          },
          muteHttpExceptions: true
        };
        
        const subResponse = UrlFetchApp.fetch(STRIPE_API_URL + '/subscriptions/' + subscriptionId, subOptions);
        const subscription = JSON.parse(subResponse.getContentText());
        
        if (subscription.metadata && subscription.metadata.property_id === propertyId) {
          // Record the subscription payment
          recordSubscriptionPayment(propertyId, amountPaid, eventData.id);
          Logger.log('Subscription payment recorded: ' + eventData.id);
        }
      }
    }
    
    return createJsonResponse({
      success: true,
      message: 'Webhook processed'
    });
  } catch (error) {
    Logger.log('handleStripeWebhook error: ' + error.toString());
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

/**
 * Record payment from Stripe Checkout Session
 * Checks if already recorded to avoid duplicates
 */
function recordPaymentFromSession(sessionId, propertyId) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const masterSheet = getOrCreateMasterSheet(spreadsheet);
    const property = getPropertyById(propertyId, masterSheet);
    
    if (!property) {
      Logger.log('Property not found: ' + propertyId);
      return false;
    }
    
    let propertySheet = spreadsheet.getSheetByName(property.propertyName);
    if (!propertySheet) {
      propertySheet = createPropertySheet(spreadsheet, property.propertyName, property);
    }
    
    // Check if payment already recorded (by Stripe Payment ID)
    // Payment History is in columns G-O (7-15), Stripe ID is in column N (14)
    const lastRow = propertySheet.getLastRow();
    for (let row = 4; row <= lastRow && row < 104; row++) {
      const stripeId = propertySheet.getRange(row, 14).getValue(); // Column N (14) = Stripe ID
      if (stripeId === sessionId) {
        Logger.log('Payment already recorded: ' + sessionId);
        return true; // Already recorded
      }
      // Stop if we hit the Late Notices section (row 2, column R/18)
      if (propertySheet.getRange(2, 18).getValue() === 'LATE NOTICES') {
        if (row >= 2) break;
      }
    }
    
    // Get session details from Stripe
    const options = {
      method: 'get',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY
      },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(STRIPE_API_URL + '/checkout/sessions/' + sessionId, options);
    const sessionData = JSON.parse(response.getContentText());
    
    if (sessionData.payment_status !== 'paid') {
      Logger.log('Payment not completed: ' + sessionData.payment_status);
      return false;
    }
    
    // Calculate amounts
    const lateFee = calculateLateFeeForProperty(property);
    const rentAmount = parseFloat(property.monthlyRent);
    const totalAmount = rentAmount + lateFee;
    
    // Get payment date from Stripe (convert to Date object, not string)
    let paymentDate = new Date();
    if (sessionData.created) {
      paymentDate = new Date(sessionData.created * 1000);
    }
    
    // Calculate due date (1st of current month) - use Date object
    const today = new Date();
    const dueDate = new Date(today.getFullYear(), today.getMonth(), 1);
    
    // Payment History columns: G(7)=Date Due, H(8)=Date Paid, I(9)=Rent, J(10)=Late Fee, K(11)=Total, L(12)=Method, M(13)=Status, N(14)=Stripe ID, O(15)=Notes
    const paymentRow = [
      dueDate,              // G (7): Date Due - Date object
      paymentDate,          // H (8): Date Paid - Date object
      rentAmount,           // I (9): Rent Amount
      lateFee,              // J (10): Late Fee
      totalAmount,          // K (11): Total Amount
      'Stripe',             // L (12): Payment Method
      'Paid',               // M (13): Payment Status
      sessionId,            // N (14): Stripe Payment ID
      'Payment via Stripe - Auto Recorded' // O (15): Notes
    ];
    
    // Find the first empty row after payment headers (starts at row 4, column G/7)
    let insertRow = 4;
    for (let row = 4; row < 104; row++) {
      const cellValue = propertySheet.getRange(row, 7).getValue(); // Check Date Due column (G/7)
      if (!cellValue || cellValue === '' || cellValue === 'LATE NOTICES') {
          insertRow = row;
        break;
      }
    }
    // Write to columns G-O (7-15)
    propertySheet.getRange(insertRow, 7, 1, paymentRow.length).setValues([paymentRow]);
    
    Logger.log('Payment recorded successfully: ' + sessionId);
    return true;
  } catch (error) {
    Logger.log('recordPaymentFromSession error: ' + error.toString());
    return false;
  }
}

/**
 * Record payment from Payment Intent (alternative method)
 */
function recordPaymentFromPaymentIntent(paymentIntentId, propertyId) {
  try {
    // Get payment intent details
    const options = {
      method: 'get',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY
      },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(STRIPE_API_URL + '/payment_intents/' + paymentIntentId, options);
    const paymentIntent = JSON.parse(response.getContentText());
    
    if (paymentIntent.status !== 'succeeded') {
      return false;
    }
    
    // Use the payment intent ID as the session ID for tracking
    return recordPaymentFromSession(paymentIntentId, propertyId);
  } catch (error) {
    Logger.log('recordPaymentFromPaymentIntent error: ' + error.toString());
    return false;
  }
}

/**
 * Record subscription payment (autopay)
 */
function recordSubscriptionPayment(propertyId, amountPaid, invoiceId) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const masterSheet = getOrCreateMasterSheet(spreadsheet);
    const property = getPropertyById(propertyId, masterSheet);
    
    if (!property) {
      Logger.log('Property not found: ' + propertyId);
      return false;
    }
    
    let propertySheet = spreadsheet.getSheetByName(property.propertyName);
    if (!propertySheet) {
      propertySheet = createPropertySheet(spreadsheet, property.propertyName, property);
    }
    
    // Check if payment already recorded - Column N (14) for Stripe ID
    // Payment History is in columns G-O (7-15), Stripe ID is in column N (14)
    const lastRow = propertySheet.getLastRow();
    for (let row = 4; row <= lastRow && row < 104; row++) {
      const stripeId = propertySheet.getRange(row, 14).getValue(); // Column N (14) = Stripe ID
      if (stripeId === invoiceId) {
        Logger.log('Subscription payment already recorded: ' + invoiceId);
        return true;
      }
      // Stop if we hit the Late Notices section
      if (propertySheet.getRange(2, 18).getValue() === 'LATE NOTICES') {
        if (row >= 2) break;
      }
    }
    
    // Calculate amounts (subscription payments are just rent, no late fee for autopay)
    const rentAmount = parseFloat(property.monthlyRent);
    const totalAmount = amountPaid / 100; // Convert from cents
    
    const today = new Date();
    const dueDate = new Date(today.getFullYear(), today.getMonth(), 1);
    const paymentDate = today;
    
    // Payment History columns: G(7)=Date Due, H(8)=Date Paid, I(9)=Rent, J(10)=Late Fee, K(11)=Total, L(12)=Method, M(13)=Status, N(14)=Stripe ID, O(15)=Notes
    const paymentRow = [
      dueDate,              // G (7): Date Due - Date object
      paymentDate,          // H (8): Date Paid - Date object
      rentAmount,           // I (9): Rent Amount
      0,                    // J (10): Late Fee (no late fee for autopay)
      totalAmount,          // K (11): Total Amount
      'Stripe Autopay',     // L (12): Payment Method
      'Paid',               // M (13): Payment Status
      invoiceId,            // N (14): Stripe Payment ID
      'Payment via Stripe Autopay' // O (15): Notes
    ];
    
    // Find the first empty row after payment headers (starts at row 4, column G/7)
    let insertRow = 4;
    for (let row = 4; row < 104; row++) {
      const cellValue = propertySheet.getRange(row, 7).getValue(); // Check Date Due column (G/7)
      if (!cellValue || cellValue === '' || cellValue === 'LATE NOTICES') {
          insertRow = row;
        break;
      }
    }
    // Write to columns G-O (7-15)
    propertySheet.getRange(insertRow, 7, 1, paymentRow.length).setValues([paymentRow]);
    
    Logger.log('Subscription payment recorded successfully: ' + invoiceId);
    return true;
  } catch (error) {
    Logger.log('recordSubscriptionPayment error: ' + error.toString());
    return false;
  }
}

// ============================================
// LATE FEE CALCULATION
// ============================================

/**
 * Calculate late fee for a property
 */
function calculateLateFeeForProperty(property) {
  if (!property.tenantName) {
    return 0; // No tenant, no late fee
  }
  
  const today = new Date();
  const currentDay = today.getDate();
  
  // Rent is due on the 1st, late fee starts on the 8th
  if (currentDay < 8) {
    return 0; // Not late yet
  }
  
  // Calculate days late (starting from the 8th)
  const daysLate = currentDay - 7;
  const lateFeePerDay = 29;
  
  return daysLate * lateFeePerDay;
}

// ============================================
// STATISTICS
// ============================================

/**
 * Calculate statistics
 */
function calculateStats(properties) {
  const stats = {
    totalProperties: properties.length,
    totalTenants: 0,
    monthlyRent: 0,
    latePayments: 0,
    // Storage unit stats
    storageUnits: {
      total: 0,
      available: 0,
      occupied: 0,
      bySize: {
        '14x42': { total: 0, available: 0, occupied: 0 },
        '10x10': { total: 0, available: 0, occupied: 0 }
      },
      withPower: 0,
      withInsurance: 0,
      totalRevenue: 0
    },
    rentalProperties: {
      total: 0,
      occupied: 0,
      vacant: 0
    }
  };
  
  properties.forEach(property => {
    if (property.propertyType === 'Storage Unit') {
      stats.storageUnits.total++;
      
      if (property.status === 'Occupied' || property.tenantName) {
        stats.storageUnits.occupied++;
        stats.totalTenants++;
        const rent = parseFloat(property.monthlyRent) || 0;
        stats.monthlyRent += rent;
        stats.storageUnits.totalRevenue += rent;
      } else {
        stats.storageUnits.available++;
      }
      
      // Track by size
      const size = property.size || '';
      if (stats.storageUnits.bySize[size]) {
        stats.storageUnits.bySize[size].total++;
        if (property.status === 'Occupied' || property.tenantName) {
          stats.storageUnits.bySize[size].occupied++;
        } else {
          stats.storageUnits.bySize[size].available++;
        }
      }
      
      // Track power
      if (property.powerIncluded) {
        stats.storageUnits.withPower++;
      }
    } else {
      // Rental property
      stats.rentalProperties.total++;
      if (property.tenantName) {
        stats.totalTenants++;
        stats.rentalProperties.occupied++;
        stats.monthlyRent += parseFloat(property.monthlyRent) || 0;
        
        const lateFee = calculateLateFeeForProperty(property);
        if (lateFee > 0) {
          stats.latePayments++;
        }
      } else {
        stats.rentalProperties.vacant++;
      }
    }
  });
  
  return stats;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Generate unique ID
 */
function generateId() {
  return 'PROP_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Generate a unique gate code for storage units
 * Format: 4-digit code (0000-9999)
 */
function generateGateCode(spreadsheet) {
  const sheet = getOrCreateStorageUnitsSheet(spreadsheet);
  const data = sheet.getDataRange().getValues();
  const gateCodeCol = 4; // Column E (0-indexed is 4)
  
  // Get all existing gate codes
  const existingCodes = new Set();
  for (let i = 1; i < data.length; i++) {
    const code = data[i][gateCodeCol];
    if (code && code.toString().trim() !== '') {
      existingCodes.add(code.toString().trim());
    }
  }
  
  // Generate random 4-digit code
  let attempts = 0;
  while (attempts < 100) {
    const code = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    if (!existingCodes.has(code)) {
      return code;
    }
    attempts++;
  }
  
  // Fallback: use timestamp-based code if random fails
  return String(Date.now() % 10000).padStart(4, '0');
}

// ============================================
// ANALYTICS & REPORTING
// ============================================

/**
 * Get property analytics
 */
function handleGetPropertyAnalytics(propertyId) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const masterSheet = getOrCreateMasterSheet(spreadsheet);
    const property = getPropertyById(propertyId, masterSheet);
    
    if (!property) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Property not found'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const propertySheet = spreadsheet.getSheetByName(property.propertyName);
    
    // Get payment data (starts at row 22, before EXPENSES section)
    const payments = [];
    if (propertySheet) {
      for (let row = 22; row < 100; row++) {
        const dateValue = propertySheet.getRange(row, 1).getValue();
        if (dateValue === 'EXPENSES') break; // Stop at expenses section
        const statusValue = propertySheet.getRange(row, 5).getValue();
        if (dateValue && dateValue !== '' && statusValue === 'Paid') {
          payments.push({
            date: dateValue,
            rentAmount: propertySheet.getRange(row, 2).getValue() || 0,
            lateFee: propertySheet.getRange(row, 3).getValue() || 0,
            total: propertySheet.getRange(row, 4).getValue() || 0,
            paymentDate: propertySheet.getRange(row, 6).getValue() || '',
            onTime: (propertySheet.getRange(row, 3).getValue() || 0) === 0
          });
        }
      }
    }
    
    // Calculate analytics
    const totalPayments = payments.length;
    const onTimePayments = payments.filter(p => p.onTime).length;
    const payOnTimePercent = totalPayments > 0 ? (onTimePayments / totalPayments) * 100 : 0;
    const totalRent = payments.reduce((sum, p) => sum + (p.rentAmount || 0), 0);
    const totalLateFees = payments.reduce((sum, p) => sum + (p.lateFee || 0), 0);
    
    // Get expenses (starts after EXPENSES header)
    const expenses = [];
    let totalExpenses = 0;
    if (propertySheet) {
      // Find EXPENSES section and read until MONTHLY ANALYSIS
      let expensesStartRow = 0;
      for (let row = 20; row < 100; row++) {
        if (propertySheet.getRange(row, 1).getValue() === 'EXPENSES') {
          expensesStartRow = row + 2; // Skip header row
          break;
        }
      }
      if (expensesStartRow > 0) {
        for (let row = expensesStartRow; row < 100; row++) {
          const dateValue = propertySheet.getRange(row, 1).getValue();
          if (dateValue === 'MONTHLY ANALYSIS') break; // Stop at monthly section
          const amountValue = propertySheet.getRange(row, 3).getValue();
          if (dateValue && dateValue !== '' && amountValue) {
            expenses.push({
              date: dateValue,
              description: propertySheet.getRange(row, 2).getValue() || '',
              amount: amountValue,
              category: propertySheet.getRange(row, 4).getValue() || '',
              notes: propertySheet.getRange(row, 5).getValue() || ''
            });
            totalExpenses += parseFloat(amountValue || 0);
          }
        }
      }
    }
    
    // Get monthly data (starts after MONTHLY ANALYSIS header)
    const monthlyData = [];
    if (propertySheet) {
      let monthlyStartRow = 0;
      for (let row = 20; row < 100; row++) {
        if (propertySheet.getRange(row, 1).getValue() === 'MONTHLY ANALYSIS') {
          monthlyStartRow = row + 2; // Skip header row
          break;
        }
      }
      if (monthlyStartRow > 0) {
        for (let row = monthlyStartRow; row < 200; row++) {
          const monthValue = propertySheet.getRange(row, 1).getValue();
          if (monthValue && monthValue !== '') {
            monthlyData.push({
              month: monthValue,
              rentIncome: propertySheet.getRange(row, 2).getValue() || 0,
              lateFees: propertySheet.getRange(row, 3).getValue() || 0,
              totalIncome: propertySheet.getRange(row, 4).getValue() || 0,
              expenses: propertySheet.getRange(row, 5).getValue() || 0,
              netProfit: propertySheet.getRange(row, 6).getValue() || 0,
              payOnTime: propertySheet.getRange(row, 7).getValue() || 0
            });
          }
        }
      }
    }
    
    const netProfit = totalRent + totalLateFees - totalExpenses;
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      analytics: {
        payOnTimePercent: payOnTimePercent,
        totalRent: totalRent,
        totalLateFees: totalLateFees,
        totalExpenses: totalExpenses,
        netProfit: netProfit,
        totalPayments: totalPayments,
        onTimePayments: onTimePayments
      },
      payments: payments,
      expenses: expenses,
      monthlyData: monthlyData
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log('handleGetPropertyAnalytics error: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Get all tenants
 */
function handleGetAllTenants() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const masterSheet = getOrCreateMasterSheet(spreadsheet);
    
    const data = masterSheet.getDataRange().getValues();
    const headers = data[0];
    
    const colMap = {};
    headers.forEach((header, index) => {
      colMap[header] = index;
    });
    
    const tenants = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[colMap['Tenant Name']] && row[colMap['Status']] === 'Occupied') {
        tenants.push({
          propertyId: row[colMap['ID']],
          propertyName: row[colMap['Property Name']] || '',
          address: row[colMap['Address']] || '',
          monthlyRent: row[colMap['Monthly Rent']] || 0,
          tenantName: row[colMap['Tenant Name']] || '',
          tenantEmail: row[colMap['Tenant Email']] || '',
          tenantPhone: row[colMap['Tenant Phone']] || ''
        });
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      tenants: tenants
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log('handleGetAllTenants error: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Add expense to property
 */
function handleAddExpense(data) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const masterSheet = getOrCreateMasterSheet(spreadsheet);
    const property = getPropertyById(data.propertyId, masterSheet);
    
    if (!property) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Property not found'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    let propertySheet = spreadsheet.getSheetByName(property.propertyName);
    if (!propertySheet) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Property sheet not found'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Find EXPENSES section and first empty row
    let expensesStartRow = 0;
    for (let row = 20; row < 100; row++) {
      if (propertySheet.getRange(row, 1).getValue() === 'EXPENSES') {
        expensesStartRow = row + 2; // Skip header row
        break;
      }
    }
    
    if (expensesStartRow === 0) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Expenses section not found in property sheet'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Find first empty row in expenses section
    let insertRow = expensesStartRow;
    for (let row = expensesStartRow; row < 100; row++) {
      const dateValue = propertySheet.getRange(row, 1).getValue();
      if (!dateValue || dateValue === '' || dateValue === 'MONTHLY ANALYSIS') {
        if (dateValue === 'MONTHLY ANALYSIS') {
          propertySheet.insertRowBefore(row);
          insertRow = row;
        } else {
          insertRow = row;
        }
        break;
      }
    }
    
    const today = new Date();
    const expenseRow = [
      data.date || today.toISOString().split('T')[0],
      data.description || '',
      parseFloat(data.amount) || 0,
      data.category || 'Other',
      data.notes || ''
    ];
    
    propertySheet.getRange(insertRow, 1, 1, expenseRow.length).setValues([expenseRow]);
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: 'Expense added successfully'
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log('handleAddExpense error: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================
// STRIPE PAYMENT LINKS
// ============================================

/**
 * Create Stripe Payment Link (for email reminders)
 * Uses Checkout Session which is more reliable than Payment Links API
 */
function handleCreatePaymentLink(propertyId) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const masterSheet = getOrCreateMasterSheet(spreadsheet);
    const property = getPropertyById(propertyId, masterSheet);
    
    if (!property) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Property not found'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const lateFee = calculateLateFeeForProperty(property);
    const rentAmount = parseFloat(property.monthlyRent);
    const totalAmount = rentAmount + lateFee;
    const amountInCents = Math.round(totalAmount * 100);
    const webAppUrl = ScriptApp.getService().getUrl();
    
    // Validate webAppUrl
    if (!webAppUrl || webAppUrl === '') {
      Logger.log('ERROR: Web App URL is empty!');
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Web App URL not configured. Please deploy the script as a Web App first.'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    Logger.log('Creating payment link for property: ' + property.propertyName);
    Logger.log('Amount: $' + totalAmount + ' (' + amountInCents + ' cents)');
    Logger.log('Web App URL: ' + webAppUrl);
    
    // Create Stripe Checkout Session (works like a payment link)
    const successUrl = webAppUrl + '?action=paymentSuccess&propertyId=' + property.id + '&session_id={CHECKOUT_SESSION_ID}';
    const cancelUrl = webAppUrl + '?action=paymentCancel';
    
    // Build payload - removed expires_at as it's not valid for checkout sessions
    const payload = [
      'payment_method_types[]=card',
      'line_items[0][price_data][currency]=usd',
      'line_items[0][price_data][product_data][name]=' + encodeURIComponent(property.propertyName + ' - Rent Payment'),
      'line_items[0][price_data][unit_amount]=' + amountInCents,
      'line_items[0][quantity]=1',
      'mode=payment',
      'success_url=' + encodeURIComponent(successUrl),
      'cancel_url=' + encodeURIComponent(cancelUrl),
      'metadata[property_id]=' + property.id,
      'metadata[property_name]=' + encodeURIComponent(property.propertyName)
    ].join('&');
    
    Logger.log('Stripe payload: ' + payload.substring(0, 200) + '...');
    
    const options = {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      payload: payload,
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(STRIPE_API_URL + '/checkout/sessions', options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    Logger.log('Stripe API Response Code: ' + responseCode);
    Logger.log('Stripe API Response: ' + responseText);
    
    if (responseCode !== 200) {
      Logger.log('Stripe API Error - Code: ' + responseCode + ', Response: ' + responseText);
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Stripe API error (Code ' + responseCode + '): ' + responseText
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (parseError) {
      Logger.log('Failed to parse Stripe response: ' + parseError.toString());
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Invalid response from Stripe: ' + responseText
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Check for Stripe error object
    if (responseData.error) {
      Logger.log('Stripe Error: ' + JSON.stringify(responseData.error));
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Stripe error: ' + (responseData.error.message || JSON.stringify(responseData.error))
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    if (responseData.id && responseData.url) {
      Logger.log('Payment link created successfully: ' + responseData.id);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        paymentLink: responseData.url,
        paymentLinkId: responseData.id
      })).setMimeType(ContentService.MimeType.JSON);
    } else {
      Logger.log('Stripe Checkout Session error - Missing id or url: ' + JSON.stringify(responseData));
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Failed to create payment link. Response: ' + JSON.stringify(responseData)
      })).setMimeType(ContentService.MimeType.JSON);
    }
  } catch (error) {
    Logger.log('handleCreatePaymentLink error: ' + error.toString());
    Logger.log('Error stack: ' + error.stack);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: 'Error creating payment link: ' + error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Send rent reminder to tenant
 */
function handleSendRentReminder(data) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const masterSheet = getOrCreateMasterSheet(spreadsheet);
    const property = getPropertyById(data.propertyId, masterSheet);
    
    if (!property || !property.tenantEmail) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Property not found or tenant email missing'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Create payment link
    const paymentLinkResponse = handleCreatePaymentLink(data.propertyId);
    let paymentLinkData;
    try {
      paymentLinkData = JSON.parse(paymentLinkResponse.getContent());
    } catch (parseError) {
      Logger.log('Failed to parse payment link response: ' + parseError.toString());
      Logger.log('Response content: ' + paymentLinkResponse.getContent());
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Failed to create payment link: Invalid response from server'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    if (!paymentLinkData.success) {
      Logger.log('Payment link creation failed: ' + (paymentLinkData.message || 'Unknown error'));
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Failed to create payment link: ' + (paymentLinkData.message || 'Unknown error')
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const lateFee = calculateLateFeeForProperty(property);
    const rentAmount = parseFloat(property.monthlyRent);
    const totalAmount = rentAmount + lateFee;
    
    // Generate email HTML
    const emailHtml = generateRentReminderEmail(property, totalAmount, lateFee, paymentLinkData.paymentLink);
    
    // Send email
    try {
      MailApp.sendEmail({
        to: property.tenantEmail,
        subject: 'Rent Reminder - ' + property.propertyName,
        htmlBody: emailHtml,
        name: 'Rental Property Management'
      });
      
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: 'Rent reminder sent successfully',
        emailSent: true
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (emailError) {
      Logger.log('Email error: ' + emailError.toString());
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Failed to send email: ' + emailError.toString()
      })).setMimeType(ContentService.MimeType.JSON);
    }
  } catch (error) {
    Logger.log('handleSendRentReminder error: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Send rent reminders to all tenants
 */
function handleSendRentReminders() {
  try {
    const tenantsResponse = handleGetAllTenants();
    const tenantsData = JSON.parse(tenantsResponse.getContent());
    
    if (!tenantsData.success || !tenantsData.tenants || tenantsData.tenants.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'No tenants found'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const results = [];
    
    tenantsData.tenants.forEach(tenant => {
      try {
        const reminderResponse = handleSendRentReminder({ propertyId: tenant.propertyId });
        const reminderData = JSON.parse(reminderResponse.getContent());
        results.push({
          propertyId: tenant.propertyId,
          propertyName: tenant.propertyName,
          tenantEmail: tenant.tenantEmail,
          success: reminderData.success,
          message: reminderData.message
        });
      } catch (error) {
        results.push({
          propertyId: tenant.propertyId,
          propertyName: tenant.propertyName,
          tenantEmail: tenant.tenantEmail,
          success: false,
          message: error.toString()
        });
      }
    });
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      results: results,
      totalSent: results.filter(r => r.success).length,
      totalFailed: results.filter(r => !r.success).length
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log('handleSendRentReminders error: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Generate rent reminder email HTML
 */
function generateRentReminderEmail(property, totalAmount, lateFee, paymentLink) {
  const currentMonth = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const dueDate = '1st of ' + currentMonth;
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
      color: white;
      padding: 30px;
      text-align: center;
      border-radius: 10px 10px 0 0;
    }
    .content {
      background: #f9fafb;
      padding: 30px;
      border: 1px solid #e5e7eb;
    }
    .amount-box {
      background: white;
      border: 2px solid #3b82f6;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
      text-align: center;
    }
    .amount {
      font-size: 32px;
      font-weight: bold;
      color: #1e40af;
      margin: 10px 0;
    }
    .late-fee {
      color: #dc2626;
      font-weight: bold;
      margin-top: 10px;
    }
    .button {
      display: inline-block;
      background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
      color: white;
      padding: 15px 30px;
      text-decoration: none;
      border-radius: 8px;
      font-weight: bold;
      margin: 20px 0;
    }
    .footer {
      background: #f3f4f6;
      padding: 20px;
      text-align: center;
      font-size: 12px;
      color: #6b7280;
      border-radius: 0 0 10px 10px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Rent Reminder</h1>
    <p>${property.propertyName}</p>
  </div>
  
  <div class="content">
    <p>Hello ${property.tenantName},</p>
    
    <p>This is a friendly reminder that your rent payment for <strong>${currentMonth}</strong> is due.</p>
    
    <div class="amount-box">
      <div style="font-size: 14px; color: #6b7280;">Total Amount Due</div>
      <div class="amount">$${totalAmount.toFixed(2)}</div>
      ${lateFee > 0 ? `<div class="late-fee">Late Fee: $${lateFee.toFixed(2)}</div>` : ''}
      <div style="font-size: 12px; color: #6b7280; margin-top: 10px;">Rent: $${parseFloat(property.monthlyRent).toFixed(2)}</div>
    </div>
    
    <p style="text-align: center;">
      <a href="${paymentLink}" class="button">Pay Rent Now</a>
    </p>
    
    <p>You can pay securely online using the button above. The payment link is valid for 30 days.</p>
    
    <p>If you have any questions or concerns, please don't hesitate to contact us.</p>
    
    <p>Thank you,<br>Property Management</p>
  </div>
  
  <div class="footer">
    <p>This is an automated reminder. Please do not reply to this email.</p>
  </div>
</body>
</html>
  `;
}

// ============================================
// AUTHENTICATION
// ============================================

/**
 * Hash password using SHA-256
 */
function hashPassword(password) {
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    password,
    Utilities.Charset.UTF_8
  ).map(function(byte) {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('');
}

/**
 * Verify password
 */
function verifyPassword(password, hash) {
  const hashedPassword = hashPassword(password);
  return hashedPassword === hash;
}

/**
 * Get or create Users sheet for authentication
 */
function getOrCreateUsersSheet(spreadsheet) {
  let usersSheet = spreadsheet.getSheetByName(AUTH_SHEET_NAME);
  
  if (!usersSheet) {
    usersSheet = spreadsheet.insertSheet(AUTH_SHEET_NAME);
    
    // Set up headers
    const headers = [
      'Name',
      'Email',
      'Password Hash',
      'Role',
      'Status',
      'Account Status',  // Pending, Approved, Rejected
      'Property ID',
      'Property Name',
      'Phone',
      'Created At',
      'Last Login',
      'Notes'
    ];
    
    usersSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    usersSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    usersSheet.getRange(1, 1, 1, headers.length).setBackground('#1e40af');
    usersSheet.getRange(1, 1, 1, headers.length).setFontColor('#ffffff');
    usersSheet.setFrozenRows(1);
    
    // Add default admin user (password: admin123 - change this!)
    const defaultPassword = hashPassword('admin123');
    usersSheet.appendRow([
      'Admin User',
      'admin@rental.com',
      defaultPassword,
      'Admin',
      'Active',
      'Approved',
      '',
      '',
      '',
      new Date().toISOString(),
      '',
      ''
    ]);
  }
  
  return usersSheet;
}

/**
 * Handle login
 */
function handleRentalLogin(data) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const usersSheet = getOrCreateUsersSheet(spreadsheet);
    
    const email = (data.email || '').toLowerCase().trim();
    const password = data.password || '';
    
    if (!email || !password) {
      return createJsonResponse({
        success: false,
        message: 'Email and password are required'
      });
    }
    
    const dataRange = usersSheet.getDataRange().getValues();
    const headers = dataRange[0];
    
    // Find column indices
    const colMap = {};
    headers.forEach((header, index) => {
      colMap[header] = index;
    });
    
    // Find user
    for (let i = 1; i < dataRange.length; i++) {
      const row = dataRange[i];
      const userEmail = (row[colMap['Email']] || '').toLowerCase().trim();
      const passwordHash = row[colMap['Password Hash']] || '';
      const status = row[colMap['Status']] || '';
      const role = row[colMap['Role']] || '';
      
      if (userEmail === email) {
        if (status !== 'Active') {
          return createJsonResponse({
            success: false,
            message: 'Account is inactive'
          });
        }
        
        if (verifyPassword(password, passwordHash)) {
          // Update last login
          usersSheet.getRange(i + 1, colMap['Last Login'] + 1).setValue(new Date().toISOString());
          
          return createJsonResponse({
            success: true,
            message: 'Login successful',
            user: {
              name: row[colMap['Name']] || '',
              email: userEmail,
              role: role,
              propertyId: row[colMap['Property ID']] || ''
            }
          });
        } else {
          return createJsonResponse({
            success: false,
            message: 'Invalid email or password'
          });
        }
      }
    }
    
    return createJsonResponse({
      success: false,
      message: 'Invalid email or password'
    });
  } catch (error) {
    Logger.log('handleRentalLogin error: ' + error.toString());
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

/**
 * Check authentication
 */
function handleCheckAuth(data) {
  try {
    // Simple token-based check (in production, use proper JWT or session tokens)
    const email = data.email || '';
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const usersSheet = getOrCreateUsersSheet(spreadsheet);
    
    const dataRange = usersSheet.getDataRange().getValues();
    const headers = dataRange[0];
    
    const colMap = {};
    headers.forEach((header, index) => {
      colMap[header] = index;
    });
    
    for (let i = 1; i < dataRange.length; i++) {
      const row = dataRange[i];
      const userEmail = (row[colMap['Email']] || '').toLowerCase().trim();
      
      if (userEmail === email.toLowerCase().trim()) {
        return createJsonResponse({
          success: true,
          user: {
            name: row[colMap['Name']] || '',
            email: userEmail,
            role: row[colMap['Role']] || '',
            propertyId: row[colMap['Property ID']] || ''
          }
        });
      }
    }
    
    return createJsonResponse({
      success: false,
      message: 'User not found'
    });
  } catch (error) {
    Logger.log('handleCheckAuth error: ' + error.toString());
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

// ============================================
// AUTOPAY FUNCTIONALITY
// ============================================

/**
 * Setup autopay for a tenant using Stripe Subscriptions
 */
function handleSetupAutopay(data) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const masterSheet = getOrCreateMasterSheet(spreadsheet);
    const property = getPropertyById(data.propertyId, masterSheet);
    
    if (!property || !property.tenantEmail) {
      return createJsonResponse({
        success: false,
        message: 'Property not found or tenant email missing'
      });
    }
    
    const rentAmount = parseFloat(property.monthlyRent);
    const amountInCents = Math.round(rentAmount * 100);
    const webAppUrl = ScriptApp.getService().getUrl();
    
    // Create Stripe Subscription for monthly rent
    // First, create a price for the subscription
    const pricePayload = [
      'currency=usd',
      'unit_amount=' + amountInCents,
      'recurring[interval]=month',
      'recurring[interval_count]=1',
      'product_data[name]=' + encodeURIComponent(property.propertyName + ' - Monthly Rent'),
      'product_data[metadata][property_id]=' + property.id
    ].join('&');
    
    const priceOptions = {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      payload: pricePayload,
      muteHttpExceptions: true
    };
    
    const priceResponse = UrlFetchApp.fetch(STRIPE_API_URL + '/prices', priceOptions);
    const priceData = JSON.parse(priceResponse.getContentText());
    
    if (!priceData.id) {
      Logger.log('Failed to create price: ' + JSON.stringify(priceData));
      return createJsonResponse({
        success: false,
        message: 'Failed to create subscription price: ' + JSON.stringify(priceData)
      });
    }
    
    // Create Checkout Session for subscription setup
    const checkoutPayload = [
      'payment_method_types[]=card',
      'line_items[0][price]=' + priceData.id,
      'line_items[0][quantity]=1',
      'mode=subscription',
      'success_url=' + encodeURIComponent(webAppUrl + '?action=autopaySuccess&propertyId=' + property.id + '&session_id={CHECKOUT_SESSION_ID}'),
      'cancel_url=' + encodeURIComponent(webAppUrl + '?action=autopayCancel'),
      'customer_email=' + encodeURIComponent(property.tenantEmail),
      'metadata[property_id]=' + property.id,
      'metadata[property_name]=' + encodeURIComponent(property.propertyName),
      'subscription_data[metadata][property_id]=' + property.id,
      'subscription_data[metadata][property_name]=' + encodeURIComponent(property.propertyName)
    ].join('&');
    
    const checkoutOptions = {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      payload: checkoutPayload,
      muteHttpExceptions: true
    };
    
    const checkoutResponse = UrlFetchApp.fetch(STRIPE_API_URL + '/checkout/sessions', checkoutOptions);
    const checkoutData = JSON.parse(checkoutResponse.getContentText());
    
    if (checkoutData.id && checkoutData.url) {
      // Store subscription setup in property sheet
      let propertySheet = spreadsheet.getSheetByName(property.propertyName);
      if (!propertySheet) {
        propertySheet = createPropertySheet(spreadsheet, property.propertyName, property);
      }
      
      // Add autopay info to property sheet (in a dedicated section or metadata)
      return createJsonResponse({
        success: true,
        checkoutUrl: checkoutData.url,
        sessionId: checkoutData.id,
        message: 'Autopay setup initiated'
      });
    } else {
      Logger.log('Failed to create checkout session: ' + JSON.stringify(checkoutData));
      return createJsonResponse({
        success: false,
        message: 'Failed to create autopay setup: ' + JSON.stringify(checkoutData)
      });
    }
  } catch (error) {
    Logger.log('handleSetupAutopay error: ' + error.toString());
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

/**
 * Get autopay status for a property
 */
function handleGetAutopayStatus(data) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const masterSheet = getOrCreateMasterSheet(spreadsheet);
    const property = getPropertyById(data.propertyId, masterSheet);
    
    if (!property) {
      return createJsonResponse({
        success: false,
        message: 'Property not found'
      });
    }
    
    // Check for active Stripe subscription
    // List subscriptions and filter by metadata
    const options = {
      method: 'get',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY
      },
      muteHttpExceptions: true
    };
    
    // Get subscriptions (limit to recent ones)
    const response = UrlFetchApp.fetch(STRIPE_API_URL + '/subscriptions?limit=100', options);
    const subscriptionsData = JSON.parse(response.getContentText());
    
    let activeSubscription = null;
    if (subscriptionsData.data && subscriptionsData.data.length > 0) {
      // Find subscription with matching property ID in metadata
      activeSubscription = subscriptionsData.data.find(sub => {
        const metadata = sub.metadata || {};
        return (metadata.property_id === property.id) && 
               (sub.status === 'active' || sub.status === 'trialing');
      });
    }
    
    return createJsonResponse({
      success: true,
      autopayEnabled: activeSubscription !== null,
      subscription: activeSubscription ? {
        id: activeSubscription.id,
        status: activeSubscription.status,
        currentPeriodEnd: activeSubscription.current_period_end,
        cancelAtPeriodEnd: activeSubscription.cancel_at_period_end
      } : null
    });
  } catch (error) {
    Logger.log('handleGetAutopayStatus error: ' + error.toString());
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

/**
 * Cancel autopay
 */
function handleCancelAutopay(data) {
  try {
    const subscriptionId = data.subscriptionId;
    
    if (!subscriptionId) {
      return createJsonResponse({
        success: false,
        message: 'Subscription ID is required'
      });
    }
    
    // Cancel subscription at period end
    const payload = [
      'cancel_at_period_end=true'
    ].join('&');
    
    const options = {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      payload: payload,
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(STRIPE_API_URL + '/subscriptions/' + subscriptionId, options);
    const subscriptionData = JSON.parse(response.getContentText());
    
    if (subscriptionData.id) {
      return createJsonResponse({
        success: true,
        message: 'Autopay will be cancelled at the end of the current billing period',
        subscription: {
          id: subscriptionData.id,
          status: subscriptionData.status,
          cancelAtPeriodEnd: subscriptionData.cancel_at_period_end
        }
      });
    } else {
      return createJsonResponse({
        success: false,
        message: 'Failed to cancel subscription: ' + JSON.stringify(subscriptionData)
      });
    }
  } catch (error) {
    Logger.log('handleCancelAutopay error: ' + error.toString());
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

/**
 * Handle autopay success
 */
function handleAutopaySuccess(propertyId, sessionId) {
  try {
    // Get session details from Stripe
    const options = {
      method: 'get',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY
      },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(STRIPE_API_URL + '/checkout/sessions/' + sessionId, options);
    const sessionData = JSON.parse(response.getContentText());
    
    if (sessionData.subscription) {
      Logger.log('Autopay subscription created: ' + sessionData.subscription);
      
      return HtmlService.createHtmlOutput(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Autopay Setup Successful</title>
          <style>
            body {
              font-family: 'Barlow', sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background: #f3f4f6;
            }
            .success-container {
              background: white;
              padding: 40px;
              border-radius: 16px;
              text-align: center;
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
              max-width: 500px;
            }
            .success-icon {
              font-size: 64px;
              color: #059669;
              margin-bottom: 20px;
            }
            h1 {
              color: #111827;
              margin-bottom: 16px;
            }
            p {
              color: #6b7280;
              margin-bottom: 24px;
            }
            .btn {
              background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
              color: white;
              padding: 12px 24px;
              border-radius: 8px;
              text-decoration: none;
              display: inline-block;
              font-weight: 600;
            }
          </style>
        </head>
        <body>
          <div class="success-container">
            <div class="success-icon">✓</div>
            <h1>Autopay Setup Complete!</h1>
            <p>Your rent will now be automatically charged on the 1st of each month.</p>
            <a href="javascript:window.close()" class="btn">Close</a>
          </div>
        </body>
        </html>
      `);
    } else {
      return HtmlService.createHtmlOutput('<h1>Error</h1><p>Subscription not found in session</p>');
    }
  } catch (error) {
    Logger.log('handleAutopaySuccess error: ' + error.toString());
    return HtmlService.createHtmlOutput('<h1>Error</h1><p>' + error.toString() + '</p>');
  }
}

/**
 * Send autopay setup email to tenant
 */
function handleSendAutopaySetupEmail(data) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const masterSheet = getOrCreateMasterSheet(spreadsheet);
    const property = getPropertyById(data.propertyId, masterSheet);
    
    if (!property || !property.tenantEmail) {
      return createJsonResponse({
        success: false,
        message: 'Property not found or tenant email missing'
      });
    }
    
    // Create autopay setup link
    const autopayResponse = handleSetupAutopay(data);
    const autopayData = JSON.parse(autopayResponse.getContent());
    
    if (!autopayData.success || !autopayData.checkoutUrl) {
      return createJsonResponse({
        success: false,
        message: 'Failed to create autopay setup link: ' + (autopayData.message || 'Unknown error')
      });
    }
    
    const rentAmount = parseFloat(property.monthlyRent);
    const currentMonth = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMMM yyyy');
    
    // Generate email HTML
    const emailHtml = generateAutopaySetupEmail(property, rentAmount, autopayData.checkoutUrl, currentMonth);
    
    // Send email
    MailApp.sendEmail({
      to: property.tenantEmail,
      subject: 'Set Up Automatic Rent Payments - ' + property.propertyName,
      htmlBody: emailHtml
    });
    
    Logger.log('Autopay setup email sent to: ' + property.tenantEmail);
    
    return createJsonResponse({
      success: true,
      message: 'Autopay setup email sent to tenant'
    });
  } catch (error) {
    Logger.log('handleSendAutopaySetupEmail error: ' + error.toString());
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

/**
 * Generate HTML email for autopay setup
 */
function generateAutopaySetupEmail(property, rentAmount, checkoutUrl, currentMonth) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: 'Barlow', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #111827;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background: #f3f4f6;
    }
    .email-container {
      background: white;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 700;
    }
    .content {
      padding: 30px;
    }
    .amount-box {
      background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
      border: 2px solid #3b82f6;
      border-radius: 12px;
      padding: 20px;
      text-align: center;
      margin: 20px 0;
    }
    .amount {
      font-size: 32px;
      font-weight: 800;
      color: #1e40af;
      margin: 10px 0;
    }
    .button {
      display: inline-block;
      background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
      color: white;
      padding: 16px 32px;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 700;
      font-size: 16px;
      margin: 20px 0;
      text-align: center;
    }
    .button:hover {
      opacity: 0.9;
    }
    .benefits {
      background: #f9fafb;
      border-left: 4px solid #3b82f6;
      padding: 20px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .benefits ul {
      margin: 10px 0;
      padding-left: 20px;
    }
    .benefits li {
      margin: 8px 0;
      color: #4b5563;
    }
    .footer {
      background: #f9fafb;
      padding: 20px;
      text-align: center;
      font-size: 12px;
      color: #6b7280;
      border-top: 1px solid #e5e7eb;
    }
    .info-box {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <h1>Set Up Automatic Rent Payments</h1>
    </div>
    
    <div class="content">
      <p>Hello ${property.tenantName || 'Tenant'},</p>
      
      <p>We're offering you the convenience of <strong>automatic rent payments</strong> for <strong>${property.propertyName}</strong>.</p>
      
      <div class="amount-box">
        <div style="font-size: 14px; color: #6b7280; margin-bottom: 8px;">Monthly Rent</div>
        <div class="amount">$${rentAmount.toFixed(2)}</div>
        <div style="font-size: 12px; color: #6b7280; margin-top: 8px;">Charged automatically on the 1st of each month</div>
      </div>
      
      <div style="text-align: center;">
        <a href="${checkoutUrl}" class="button">Set Up Autopay Now</a>
      </div>
      
      <div class="benefits">
        <h3 style="margin-top: 0; color: #1e40af;">Benefits of Autopay:</h3>
        <ul>
          <li><strong>Never miss a payment</strong> - Rent is automatically charged on the 1st</li>
          <li><strong>Avoid late fees</strong> - Payments are always on time</li>
          <li><strong>Save time</strong> - No need to remember to pay each month</li>
          <li><strong>Secure</strong> - Powered by Stripe, trusted by millions</li>
          <li><strong>Easy to cancel</strong> - Cancel anytime from your account</li>
        </ul>
      </div>
      
      <div class="info-box">
        <strong>How it works:</strong><br>
        1. Click the button above to set up autopay<br>
        2. Enter your payment method (credit/debit card)<br>
        3. Your rent will be automatically charged on the 1st of each month<br>
        4. You'll receive email confirmations for each payment
      </div>
      
      <p>If you have any questions or prefer to pay manually, please don't hesitate to contact us.</p>
      
      <p>Thank you,<br><strong>Property Management</strong></p>
    </div>
    
    <div class="footer">
      <p>This is an automated email. Please do not reply to this message.</p>
      <p>If you have questions, please contact your property manager.</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Handle autopay cancel
 */
function handleAutopayCancel() {
  return HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Autopay Setup Cancelled</title>
      <style>
        body {
          font-family: 'Barlow', sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
          background: #f3f4f6;
        }
        .cancel-container {
          background: white;
          padding: 40px;
          border-radius: 16px;
          text-align: center;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          max-width: 500px;
        }
        .cancel-icon {
          font-size: 64px;
          color: #dc2626;
          margin-bottom: 20px;
        }
        h1 {
          color: #111827;
          margin-bottom: 16px;
        }
        p {
          color: #6b7280;
          margin-bottom: 24px;
        }
        .btn {
          background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
          color: white;
          padding: 12px 24px;
          border-radius: 8px;
          text-decoration: none;
          display: inline-block;
          font-weight: 600;
        }
      </style>
    </head>
    <body>
      <div class="cancel-container">
        <div class="cancel-icon">✕</div>
        <h1>Autopay Setup Cancelled</h1>
        <p>You can set up autopay again at any time from the property details.</p>
        <a href="javascript:window.close()" class="btn">Close</a>
      </div>
    </body>
    </html>
  `);
}

// ============================================
// SETUP FUNCTION
// ============================================

/**
 * Setup function - Run this once to initialize the spreadsheet
 */
function setupRentalSystem() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // Create master sheet
    getOrCreateMasterSheet(spreadsheet);
    
    // Create users sheet for authentication
    getOrCreateUsersSheet(spreadsheet);
    
    Logger.log('Rental system setup complete!');
    Logger.log('Master sheet created: ' + MASTER_SHEET_NAME);
    Logger.log('Users sheet created: ' + AUTH_SHEET_NAME);
    Logger.log('Default admin user: admin@rental.com / admin123 (CHANGE THIS!)');
    
    return 'Setup complete!';
  } catch (error) {
    Logger.log('Setup error: ' + error.toString());
    return 'Setup failed: ' + error.toString();
  }
}

/**
 * Test function to verify spreadsheet access
 * Run this first to check if you can access the spreadsheet
 */
function testSpreadsheetAccess() {
  try {
    Logger.log('Testing spreadsheet access...');
    Logger.log('Spreadsheet ID: ' + SPREADSHEET_ID);
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    Logger.log('Spreadsheet opened successfully!');
    Logger.log('Spreadsheet name: ' + spreadsheet.getName());
    
    const sheets = spreadsheet.getSheets();
    Logger.log('Number of sheets: ' + sheets.length);
    Logger.log('Sheet names: ' + sheets.map(s => s.getName()).join(', '));
    
    return 'SUCCESS: Spreadsheet is accessible!';
  } catch (error) {
    Logger.log('ERROR: Cannot access spreadsheet');
    Logger.log('Error: ' + error.toString());
    Logger.log('Stack: ' + error.stack);
    return 'ERROR: ' + error.toString() + '\n\nPlease:\n1. Verify the SPREADSHEET_ID is correct\n2. Make sure the spreadsheet exists\n3. Run setupRentalSystem() to authorize access';
  }
}

/**
 * Test function to create a property sheet (for testing from Apps Script editor)
 * Usage: Update the propertyName and propertyData below, then run this function
 * 
 * IMPORTANT: Run testSpreadsheetAccess() first to verify access!
 * IMPORTANT: Run setupRentalSystem() first to authorize spreadsheet access!
 */
function testCreatePropertySheet() {
  try {
    Logger.log('Starting testCreatePropertySheet...');
    Logger.log('Spreadsheet ID: ' + SPREADSHEET_ID);
    
    // First test if we can access the spreadsheet
    const testResult = testSpreadsheetAccess();
    if (testResult.indexOf('ERROR') !== -1) {
      return testResult;
    }
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const propertyName = 'Test Property';
    const propertyData = {
      propertyName: 'Test Property',
      address: '123 Test St',
      monthlyRent: 1500,
      tenantName: 'Test Tenant',
      tenantEmail: 'test@example.com',
      tenantPhone: '(555) 123-4567'
    };
    
    Logger.log('Calling createPropertySheet...');
    const sheet = createPropertySheet(spreadsheet, propertyName, propertyData);
    Logger.log('Property sheet created: ' + sheet.getName());
    return 'Property sheet created successfully!';
  } catch (error) {
    Logger.log('Error in testCreatePropertySheet: ' + error.toString());
    Logger.log('Stack: ' + error.stack);
    return 'Error: ' + error.toString() + '\n\nRun testSpreadsheetAccess() first to check permissions!';
  }
}

// ============================================
// TENANT PORTAL SYSTEM
// ============================================

/**
 * Send tenant invite - Admin sends invite to tenant email
 * Email must match tenant email in property sheet
 */
function handleSendTenantInvite(data) {
  try {
    const propertyId = data.propertyId || data.property_id;
    const tenantEmail = (data.tenantEmail || data.tenant_email || '').toLowerCase().trim();
    
    if (!propertyId || !tenantEmail) {
      return createJsonResponse({
        success: false,
        message: 'Property ID and tenant email are required'
      });
    }
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const masterSheet = getOrCreateMasterSheet(spreadsheet);
    const property = getPropertyById(propertyId, masterSheet);
    
    if (!property) {
      return createJsonResponse({
        success: false,
        message: 'Property not found'
      });
    }
    
    // Verify email matches property tenant email
    const propertyTenantEmail = (property.tenantEmail || '').toLowerCase().trim();
    if (propertyTenantEmail !== tenantEmail) {
      return createJsonResponse({
        success: false,
        message: 'Email does not match tenant email for this property. Please use the exact email on file.'
      });
    }
    
    // Generate invite token (simple token for now)
    const inviteToken = Utilities.getUuid();
    const webAppUrl = ScriptApp.getService().getUrl();
    const portalUrl = webAppUrl + '?action=tenantPortal&token=' + inviteToken + '&email=' + encodeURIComponent(tenantEmail);
    
    // Store invite token in property sheet or separate invites sheet
    // For now, we'll use a simple approach - store in property metadata
    // In production, you'd want a separate invites sheet with expiration
    
    // Send comprehensive instructions email automatically
    const emailSubject = 'Welcome to Your Tenant Portal - ' + property.propertyName;
    const emailBody = generatePortalInstructionsEmail(property.tenantName || '', portalUrl, property, tenantEmail);
    
    MailApp.sendEmail({
      to: tenantEmail,
      subject: emailSubject,
      htmlBody: emailBody
    });
    
    Logger.log('Tenant invite sent to: ' + tenantEmail);
    
    return createJsonResponse({
      success: true,
      message: 'Invite sent successfully',
      portalUrl: portalUrl
    });
    
  } catch (error) {
    Logger.log('handleSendTenantInvite error: ' + error.toString());
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

/**
 * Tenant login - Verify email and password, check approval status
 */
function handleTenantLogin(data) {
  try {
    const email = (data.email || '').toLowerCase().trim();
    const password = data.password || '';
    
    if (!email || !password) {
      return createJsonResponse({
        success: false,
        message: 'Email and password are required'
      });
    }
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const usersSheet = getOrCreateUsersSheet(spreadsheet);
    
    // Find user in Users sheet
    const dataRange = usersSheet.getDataRange().getValues();
    const headers = dataRange[0];
    
    // Find column indices
    const colMap = {};
    headers.forEach((header, index) => {
      colMap[header] = index;
    });
    
    // Find user by email
    for (let i = 1; i < dataRange.length; i++) {
      const row = dataRange[i];
      const userEmail = (row[colMap['Email']] || '').toLowerCase().trim();
      const passwordHash = row[colMap['Password Hash']] || '';
      const accountStatus = (row[colMap['Account Status']] || '').toString().trim();
      const status = (row[colMap['Status']] || '').toString().trim();
      const role = (row[colMap['Role']] || '').toString().trim();
      
      if (userEmail === email && role === 'Tenant') {
        // Check if account is approved
        if (accountStatus !== 'Approved') {
          return createJsonResponse({
            success: false,
            message: accountStatus === 'Pending' 
              ? 'Your account is pending approval. Please wait for admin approval.'
              : 'Your account has been rejected. Please contact your landlord.'
          });
        }
        
        // Check if account is active
        if (status !== 'Active') {
          return createJsonResponse({
            success: false,
            message: 'Your account is inactive. Please contact your landlord.'
          });
        }
        
        // Verify password
        if (!verifyPassword(password, passwordHash)) {
          return createJsonResponse({
            success: false,
            message: 'Invalid email or password'
          });
        }
        
        // Update last login
        usersSheet.getRange(i + 1, colMap['Last Login'] + 1).setValue(new Date().toISOString());
        
        // Get property info
        const propertyId = row[colMap['Property ID']] || '';
        const propertyName = row[colMap['Property Name']] || '';
        
        let property = null;
        if (propertyId) {
          const masterSheet = getOrCreateMasterSheet(spreadsheet);
          property = getPropertyById(propertyId, masterSheet);
        }
        
        return createJsonResponse({
          success: true,
          message: 'Login successful',
          property: property || {
            id: propertyId,
            propertyName: propertyName,
            tenantName: row[colMap['Name']] || '',
            tenantEmail: email,
            tenantPhone: row[colMap['Phone']] || ''
          }
        });
      }
    }
    
    return createJsonResponse({
      success: false,
      message: 'Invalid email or password. If you haven\'t signed up yet, please create an account first.'
    });
    
  } catch (error) {
    Logger.log('handleTenantLogin error: ' + error.toString());
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

/**
 * Get tenant property details
 */
function handleGetTenantProperty(data) {
  try {
    const email = (data.email || '').toLowerCase().trim();
    
    if (!email) {
      return createJsonResponse({
        success: false,
        message: 'Email is required'
      });
    }
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const masterSheet = getOrCreateMasterSheet(spreadsheet);
    
    // Find property by tenant email (same logic as handleTenantLogin)
    const sheetData = masterSheet.getDataRange().getValues();
    const headers = sheetData[0];
    const colMap = {};
    headers.forEach((header, index) => {
      colMap[header] = index;
    });
    
    let property = null;
    for (let i = 1; i < sheetData.length; i++) {
      const row = sheetData[i];
      const tenantEmail = (row[colMap['Tenant Email']] || '').toLowerCase().trim();
      if (tenantEmail === email) {
        property = {
          id: row[colMap['ID']],
          propertyName: row[colMap['Property Name']] || '',
          address: row[colMap['Address']] || '',
          monthlyRent: row[colMap['Monthly Rent']] || 0,
          tenantName: row[colMap['Tenant Name']] || '',
          tenantEmail: tenantEmail,
          tenantPhone: row[colMap['Tenant Phone']] || '',
          status: row[colMap['Status']] || 'Vacant'
        };
        break;
      }
    }
    
    if (!property) {
      return createJsonResponse({
        success: false,
        message: 'Property not found'
      });
    }
    
    // Get payment history from property sheet
    let propertySheet = spreadsheet.getSheetByName(property.propertyName);
    const paymentHistory = [];
    
    if (propertySheet) {
      // Payment History is in columns G-O (7-15), starts at row 4
      const lastRow = propertySheet.getLastRow();
      for (let row = 4; row <= lastRow && row < 104; row++) {
        const dateDue = propertySheet.getRange(row, 7).getValue();
        const datePaid = propertySheet.getRange(row, 8).getValue();
        if (dateDue || datePaid) {
          paymentHistory.push({
            dateDue: dateDue,
            datePaid: datePaid,
            rentAmount: propertySheet.getRange(row, 9).getValue(),
            lateFee: propertySheet.getRange(row, 10).getValue(),
            totalAmount: propertySheet.getRange(row, 11).getValue(),
            paymentMethod: propertySheet.getRange(row, 12).getValue(),
            status: propertySheet.getRange(row, 13).getValue(),
            stripeId: propertySheet.getRange(row, 14).getValue(),
            notes: propertySheet.getRange(row, 15).getValue()
          });
        }
      }
    }
    
    // Get autopay status
    const autopayStatus = handleGetAutopayStatus({ propertyId: property.id });
    const autopayData = JSON.parse(autopayStatus.getContent());
    
    return createJsonResponse({
      success: true,
      property: property,
      paymentHistory: paymentHistory,
      autopay: autopayData.autopay || { enabled: false }
    });
    
  } catch (error) {
    Logger.log('handleGetTenantProperty error: ' + error.toString());
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

/**
 * Tenant pay rent - Create payment link for tenant
 */
function handleTenantPayRent(data) {
  try {
    const email = (data.email || '').toLowerCase().trim();
    
    if (!email) {
      return createJsonResponse({
        success: false,
        message: 'Email is required'
      });
    }
    
    // Find property by email
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const masterSheet = getOrCreateMasterSheet(spreadsheet);
    const sheetData = masterSheet.getDataRange().getValues();
    const headers = sheetData[0];
    const colMap = {};
    headers.forEach((header, index) => {
      colMap[header] = index;
    });
    
    let property = null;
    for (let i = 1; i < sheetData.length; i++) {
      const row = sheetData[i];
      const tenantEmail = (row[colMap['Tenant Email']] || '').toLowerCase().trim();
      if (tenantEmail === email) {
        property = {
          id: row[colMap['ID']],
          propertyName: row[colMap['Property Name']] || '',
          monthlyRent: row[colMap['Monthly Rent']] || 0,
          tenantEmail: tenantEmail
        };
        break;
      }
    }
    
    if (!property) {
      return createJsonResponse({
        success: false,
        message: 'Property not found'
      });
    }
    
    // Create payment link using existing function
    const paymentLinkResponse = handleCreatePaymentLink(property.id);
    const paymentLinkData = JSON.parse(paymentLinkResponse.getContent());
    
    if (paymentLinkData.success) {
      return createJsonResponse({
        success: true,
        paymentUrl: paymentLinkData.paymentLink
      });
    } else {
      return createJsonResponse({
        success: false,
        message: paymentLinkData.message || 'Failed to create payment link'
      });
    }
    
  } catch (error) {
    Logger.log('handleTenantPayRent error: ' + error.toString());
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

/**
 * Get tenant leases from Drive folder
 */
function handleGetTenantLeases(data) {
  try {
    const email = (data.email || '').toLowerCase().trim();
    
    if (!email) {
      return createJsonResponse({
        success: false,
        message: 'Email is required'
      });
    }
    
    // Find property by email
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const masterSheet = getOrCreateMasterSheet(spreadsheet);
    const sheetData = masterSheet.getDataRange().getValues();
    const headers = sheetData[0];
    const colMap = {};
    headers.forEach((header, index) => {
      colMap[header] = index;
    });
    
    let property = null;
    for (let i = 1; i < sheetData.length; i++) {
      const row = sheetData[i];
      const tenantEmail = (row[colMap['Tenant Email']] || '').toLowerCase().trim();
      if (tenantEmail === email) {
        property = {
          id: row[colMap['ID']],
          propertyName: row[colMap['Property Name']] || ''
        };
        break;
      }
    }
    
    if (!property) {
      return createJsonResponse({
        success: false,
        message: 'Property not found'
      });
    }
    
    // Get files from Drive folder
    const folder = DriveApp.getFolderById(TENANT_DOCUMENTS_FOLDER_ID);
    const files = folder.getFiles();
    const leases = [];
    
    // Look for files related to this property
    while (files.hasNext()) {
      const file = files.next();
      const fileName = file.getName().toLowerCase();
      const propertyName = property.propertyName.toLowerCase();
      
      // Check if file name contains property name or property ID
      if (fileName.includes(propertyName) || fileName.includes(property.id) || fileName.includes('lease')) {
        leases.push({
          name: file.getName(),
          id: file.getId(),
          url: file.getUrl(),
          dateModified: file.getLastUpdated(),
          size: file.getSize()
        });
      }
    }
    
    return createJsonResponse({
      success: true,
      leases: leases
    });
    
  } catch (error) {
    Logger.log('handleGetTenantLeases error: ' + error.toString());
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

/**
 * Get tenant payment history
 */
function handleGetTenantPaymentHistory(data) {
  try {
    const email = (data.email || '').toLowerCase().trim();
    
    if (!email) {
      return createJsonResponse({
        success: false,
        message: 'Email is required'
      });
    }
    
    // This is already handled in handleGetTenantProperty, but separate endpoint for convenience
    const propertyResponse = handleGetTenantProperty(data);
    const propertyData = JSON.parse(propertyResponse.getContent());
    
    if (propertyData.success) {
      return createJsonResponse({
        success: true,
        paymentHistory: propertyData.paymentHistory || []
      });
    } else {
      return propertyResponse;
    }
    
  } catch (error) {
    Logger.log('handleGetTenantPaymentHistory error: ' + error.toString());
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

/**
 * Create Stripe Customer Portal session for managing cards/autopay
 */
function handleCreateStripeCustomerPortal(data) {
  try {
    const email = (data.email || '').toLowerCase().trim();
    
    if (!email) {
      return createJsonResponse({
        success: false,
        message: 'Email is required'
      });
    }
    
    // Find property and get Stripe customer ID if exists
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const masterSheet = getOrCreateMasterSheet(spreadsheet);
    const sheetData = masterSheet.getDataRange().getValues();
    const headers = sheetData[0];
    const colMap = {};
    headers.forEach((header, index) => {
      colMap[header] = index;
    });
    
    let property = null;
    for (let i = 1; i < sheetData.length; i++) {
      const row = sheetData[i];
      const tenantEmail = (row[colMap['Tenant Email']] || '').toLowerCase().trim();
      if (tenantEmail === email) {
        property = {
          id: row[colMap['ID']],
          propertyName: row[colMap['Property Name']] || ''
        };
        break;
      }
    }
    
    if (!property) {
      return createJsonResponse({
        success: false,
        message: 'Property not found'
      });
    }
    
    // Get or create Stripe customer
    // First, check if customer exists by email
    const searchOptions = {
      method: 'get',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY
      },
      muteHttpExceptions: true
    };
    
    const searchResponse = UrlFetchApp.fetch(STRIPE_API_URL + '/customers/search?query=email:\'' + email + '\'', searchOptions);
    const searchData = JSON.parse(searchResponse.getContentText());
    
    let customerId = null;
    if (searchData.data && searchData.data.length > 0) {
      customerId = searchData.data[0].id;
    } else {
      // Create new customer
      const createPayload = [
        'email=' + encodeURIComponent(email),
        'metadata[property_id]=' + property.id,
        'metadata[property_name]=' + encodeURIComponent(property.propertyName)
      ].join('&');
      
      const createOptions = {
        method: 'post',
        headers: {
          'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        payload: createPayload,
        muteHttpExceptions: true
      };
      
      const createResponse = UrlFetchApp.fetch(STRIPE_API_URL + '/customers', createOptions);
      const customerData = JSON.parse(createResponse.getContentText());
      customerId = customerData.id;
    }
    
    if (!customerId) {
      return createJsonResponse({
        success: false,
        message: 'Failed to get or create Stripe customer'
      });
    }
    
    // Create customer portal session
    const webAppUrl = ScriptApp.getService().getUrl();
    const payload = [
      'customer=' + customerId,
      'return_url=' + encodeURIComponent(webAppUrl + '?action=tenantPortal&email=' + encodeURIComponent(email))
    ].join('&');
    
    const options = {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      payload: payload,
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(STRIPE_API_URL + '/billing_portal/sessions', options);
    const portalData = JSON.parse(response.getContentText());
    
    if (portalData.url) {
      return createJsonResponse({
        success: true,
        portalUrl: portalData.url
      });
    } else {
      return createJsonResponse({
        success: false,
        message: 'Failed to create portal session'
      });
    }
    
  } catch (error) {
    Logger.log('handleCreateStripeCustomerPortal error: ' + error.toString());
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

/**
 * Generate tenant invite email HTML
 */
function generateTenantInviteEmail(property, portalUrl) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #1e40af; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
        .button:hover { background: #2563eb; }
        .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Welcome to Your Tenant Portal</h1>
        </div>
        <div class="content">
          <p>Hello ${property.tenantName || 'Tenant'},</p>
          <p>You've been invited to access your tenant portal for <strong>${property.propertyName}</strong>.</p>
          <p>From your portal, you can:</p>
          <ul>
            <li>View your lease documents</li>
            <li>Pay rent online</li>
            <li>Set up autopay</li>
            <li>Manage your payment methods</li>
            <li>View payment history</li>
          </ul>
          <p style="text-align: center;">
            <a href="${portalUrl}" class="button">Access Your Portal</a>
          </p>
          <p><strong>Important:</strong> You must use the email address <strong>${property.tenantEmail}</strong> to access your portal.</p>
          <p>If you have any questions, please contact your landlord.</p>
        </div>
        <div class="footer">
          <p>This is an automated message. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Request email permissions - Run this once to authorize email sending
 * This will trigger the permission dialog
 */
function requestEmailPermissions() {
  try {
    // Try to send a test email to yourself to trigger permission request
    // Replace with your actual email address
    const testEmail = Session.getActiveUser().getEmail();
    
    MailApp.sendEmail({
      to: testEmail,
      subject: 'Email Permissions Test - Rental System',
      body: 'This is a test email to authorize email sending permissions. You can delete this email.',
      htmlBody: '<p>This is a test email to authorize email sending permissions. You can delete this email.</p>'
    });
    
    return 'Email permissions authorized! You can now send rent reminders and autopay setup emails.';
  } catch (error) {
    Logger.log('Permission request error: ' + error.toString());
    return 'Permission error: ' + error.toString() + '\n\nPlease run this function again and click "Review Permissions" when prompted.';
  }
}

// ============================================
// BACKGROUND & CREDIT CHECK SYSTEM
// ============================================

/**
 * Initialize Background Checks sheet if it doesn't exist
 */
function getOrCreateBackgroundChecksSheet(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(BACKGROUND_CHECKS_SHEET_NAME);
  
  if (!sheet) {
    sheet = spreadsheet.insertSheet(BACKGROUND_CHECKS_SHEET_NAME);
    
    // Set up headers
    const headers = [
      'Check Code',
      'Property ID',
      'Property Name',
      'Tenant Name',
      'Tenant Email',
      'Status',
      'Requested Date',
      'Completed Date',
      'SSN',
      'Date of Birth',
      'Current Address',
      'Previous Address',
      'Employer',
      'Employer Phone',
      'Monthly Income',
      'Employment Start Date',
      'Emergency Contact Name',
      'Emergency Contact Phone',
      'Emergency Contact Relationship',
      'References',
      'Notes',
      'Check Results',
      'Created At',
      'Updated At'
    ];
    
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    // Format header row
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#1e40af');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');
    headerRange.setFontSize(11);
    headerRange.setHorizontalAlignment('center');
    
    // Set column widths
    sheet.setColumnWidth(1, 120); // Check Code
    sheet.setColumnWidth(2, 100); // Property ID
    sheet.setColumnWidth(3, 150); // Property Name
    sheet.setColumnWidth(4, 150); // Tenant Name
    sheet.setColumnWidth(5, 200); // Tenant Email
    sheet.setColumnWidth(6, 100); // Status
    sheet.setColumnWidth(7, 120); // Requested Date
    sheet.setColumnWidth(8, 120); // Completed Date
    sheet.setColumnWidth(9, 120); // SSN
    sheet.setColumnWidth(10, 120); // DOB
    sheet.setColumnWidth(11, 200); // Current Address
    sheet.setColumnWidth(12, 200); // Previous Address
    sheet.setColumnWidth(13, 150); // Employer
    sheet.setColumnWidth(14, 120); // Employer Phone
    sheet.setColumnWidth(15, 120); // Monthly Income
    sheet.setColumnWidth(16, 120); // Employment Start
    sheet.setColumnWidth(17, 150); // Emergency Contact Name
    sheet.setColumnWidth(18, 120); // Emergency Contact Phone
    sheet.setColumnWidth(19, 120); // Emergency Contact Relationship
    sheet.setColumnWidth(20, 300); // References
    sheet.setColumnWidth(21, 300); // Notes
    sheet.setColumnWidth(22, 300); // Check Results
    sheet.setColumnWidth(23, 150); // Created At
    sheet.setColumnWidth(24, 150); // Updated At
    
    sheet.setFrozenRows(1);
    
    Logger.log('Background Checks sheet created');
  }
  
  return sheet;
}

/**
 * Request background check - Admin creates check request with unique code
 */
function handleRequestBackgroundCheck(data) {
  try {
    const propertyId = data.propertyId || data.property_id;
    
    if (!propertyId) {
      return createJsonResponse({
        success: false,
        message: 'Property ID is required'
      });
    }
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const masterSheet = getOrCreateMasterSheet(spreadsheet);
    const property = getPropertyById(propertyId, masterSheet);
    
    if (!property) {
      return createJsonResponse({
        success: false,
        message: 'Property not found'
      });
    }
    
    if (!property.tenantEmail) {
      return createJsonResponse({
        success: false,
        message: 'Property does not have a tenant email. Please add tenant information first.'
      });
    }
    
    // Generate unique check code
    const checkCode = 'BG-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    
    // Get or create Background Checks sheet
    const checksSheet = getOrCreateBackgroundChecksSheet(spreadsheet);
    
    // Create check request row
    const now = new Date();
    const newRow = [
      checkCode,                                    // Check Code
      property.id,                                  // Property ID
      property.propertyName,                        // Property Name
      property.tenantName || '',                    // Tenant Name
      property.tenantEmail,                         // Tenant Email
      'Pending',                                    // Status
      now,                                          // Requested Date
      '',                                           // Completed Date
      '',                                           // SSN
      '',                                           // Date of Birth
      '',                                           // Current Address
      '',                                           // Previous Address
      '',                                           // Employer
      '',                                           // Employer Phone
      '',                                           // Monthly Income
      '',                                           // Employment Start Date
      '',                                           // Emergency Contact Name
      '',                                           // Emergency Contact Phone
      '',                                           // Emergency Contact Relationship
      '',                                           // References
      '',                                           // Notes
      '',                                           // Check Results
      now,                                          // Created At
      now                                           // Updated At
    ];
    
    checksSheet.appendRow(newRow);
    
    // Generate background check URL
    const webAppUrl = ScriptApp.getService().getUrl();
    const checkUrl = webAppUrl + '?action=backgroundCheck&code=' + checkCode;
    
    // Send email to tenant with check link
    const emailSubject = 'Background & Credit Check Required - ' + property.propertyName;
    const emailBody = generateBackgroundCheckInviteEmail(property, checkCode, checkUrl);
    
    MailApp.sendEmail({
      to: property.tenantEmail,
      subject: emailSubject,
      htmlBody: emailBody
    });
    
    Logger.log('Background check requested: ' + checkCode + ' for property: ' + property.propertyName);
    
    return createJsonResponse({
      success: true,
      message: 'Background check request created and email sent',
      checkCode: checkCode,
      checkUrl: checkUrl
    });
    
  } catch (error) {
    Logger.log('handleRequestBackgroundCheck error: ' + error.toString());
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

/**
 * Submit background check - Tenant completes the form
 */
function handleSubmitBackgroundCheck(data) {
  try {
    const checkCode = data.checkCode || data.code;
    
    if (!checkCode) {
      return createJsonResponse({
        success: false,
        message: 'Check code is required'
      });
    }
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const checksSheet = getOrCreateBackgroundChecksSheet(spreadsheet);
    
    // Find check request by code
    const dataRange = checksSheet.getDataRange();
    const values = dataRange.getValues();
    const headers = values[0];
    
    // Find column indices
    const colMap = {};
    headers.forEach((header, index) => {
      colMap[header] = index;
    });
    
    let checkRowIndex = -1;
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (row[colMap['Check Code']] === checkCode) {
        checkRowIndex = i + 1; // +1 because sheet rows are 1-indexed
        break;
      }
    }
    
    if (checkRowIndex === -1) {
      return createJsonResponse({
        success: false,
        message: 'Invalid check code'
      });
    }
    
    // Update check with submitted data
    const now = new Date();
    
    checksSheet.getRange(checkRowIndex, colMap['SSN'] + 1).setValue(data.ssn || '');
    checksSheet.getRange(checkRowIndex, colMap['Date of Birth'] + 1).setValue(data.dateOfBirth || '');
    checksSheet.getRange(checkRowIndex, colMap['Current Address'] + 1).setValue(data.currentAddress || '');
    checksSheet.getRange(checkRowIndex, colMap['Previous Address'] + 1).setValue(data.previousAddress || '');
    checksSheet.getRange(checkRowIndex, colMap['Employer'] + 1).setValue(data.employer || '');
    checksSheet.getRange(checkRowIndex, colMap['Employer Phone'] + 1).setValue(data.employerPhone || '');
    checksSheet.getRange(checkRowIndex, colMap['Monthly Income'] + 1).setValue(data.monthlyIncome || '');
    checksSheet.getRange(checkRowIndex, colMap['Employment Start Date'] + 1).setValue(data.employmentStartDate || '');
    checksSheet.getRange(checkRowIndex, colMap['Emergency Contact Name'] + 1).setValue(data.emergencyContactName || '');
    checksSheet.getRange(checkRowIndex, colMap['Emergency Contact Phone'] + 1).setValue(data.emergencyContactPhone || '');
    checksSheet.getRange(checkRowIndex, colMap['Emergency Contact Relationship'] + 1).setValue(data.emergencyContactRelationship || '');
    checksSheet.getRange(checkRowIndex, colMap['References'] + 1).setValue(data.references || '');
    checksSheet.getRange(checkRowIndex, colMap['Notes'] + 1).setValue(data.notes || '');
    checksSheet.getRange(checkRowIndex, colMap['Status'] + 1).setValue('Completed');
    checksSheet.getRange(checkRowIndex, colMap['Completed Date'] + 1).setValue(now);
    checksSheet.getRange(checkRowIndex, colMap['Updated At'] + 1).setValue(now);
    
    Logger.log('Background check submitted: ' + checkCode);
    
    return createJsonResponse({
      success: true,
      message: 'Background check submitted successfully'
    });
    
  } catch (error) {
    Logger.log('handleSubmitBackgroundCheck error: ' + error.toString());
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

/**
 * Get background check status
 */
function handleGetBackgroundCheckStatus(data) {
  try {
    const propertyId = data.propertyId || data.property_id;
    
    if (!propertyId) {
      return createJsonResponse({
        success: false,
        message: 'Property ID is required'
      });
    }
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const checksSheet = getOrCreateBackgroundChecksSheet(spreadsheet);
    
    const dataRange = checksSheet.getDataRange();
    const values = dataRange.getValues();
    const headers = values[0];
    
    // Find column indices
    const colMap = {};
    headers.forEach((header, index) => {
      colMap[header] = index;
    });
    
    // Find most recent check for this property
    let latestCheck = null;
    for (let i = values.length - 1; i >= 1; i--) {
      const row = values[i];
      if (row[colMap['Property ID']] === propertyId) {
        latestCheck = {
          checkCode: row[colMap['Check Code']],
          status: row[colMap['Status']],
          requestedDate: row[colMap['Requested Date']],
          completedDate: row[colMap['Completed Date']],
          tenantName: row[colMap['Tenant Name']],
          tenantEmail: row[colMap['Tenant Email']]
        };
        break;
      }
    }
    
    return createJsonResponse({
      success: true,
      check: latestCheck
    });
    
  } catch (error) {
    Logger.log('handleGetBackgroundCheckStatus error: ' + error.toString());
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

/**
 * Get background check by code (for tenant form)
 */
function handleGetBackgroundCheckByCode(code) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const checksSheet = getOrCreateBackgroundChecksSheet(spreadsheet);
    
    const dataRange = checksSheet.getDataRange();
    const values = dataRange.getValues();
    const headers = values[0];
    
    // Find column indices
    const colMap = {};
    headers.forEach((header, index) => {
      colMap[header] = index;
    });
    
    // Find check by code
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (row[colMap['Check Code']] === code) {
        return {
          success: true,
          check: {
            code: row[colMap['Check Code']],
            propertyName: row[colMap['Property Name']],
            tenantName: row[colMap['Tenant Name']],
            tenantEmail: row[colMap['Tenant Email']],
            status: row[colMap['Status']],
            requestedDate: row[colMap['Requested Date']]
          }
        };
      }
    }
    
    return {
      success: false,
      message: 'Invalid check code'
    };
    
  } catch (error) {
    Logger.log('handleGetBackgroundCheckByCode error: ' + error.toString());
    return {
      success: false,
      message: error.toString()
    };
  }
}

/**
 * Generate background check invite email
 */
function generateBackgroundCheckInviteEmail(property, checkCode, checkUrl) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #1e40af; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
        .button:hover { background: #2563eb; }
        .code { background: #e5e7eb; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 18px; text-align: center; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Background & Credit Check Required</h1>
        </div>
        <div class="content">
          <p>Hello ${property.tenantName || 'Tenant'},</p>
          <p>We need you to complete a background and credit check for <strong>${property.propertyName}</strong>.</p>
          <p>Please click the button below to access the secure form:</p>
          <p style="text-align: center;">
            <a href="${checkUrl}" class="button">Complete Background Check</a>
          </p>
          <p>Or use this code: <strong>${checkCode}</strong></p>
          <p><strong>Important:</strong> Please complete this check as soon as possible. All information is kept confidential and secure.</p>
          <p>If you have any questions, please contact your landlord.</p>
        </div>
        <div class="footer">
          <p>This is an automated message. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}


// ============================================
// TENANT SIGN-UP & APPROVAL SYSTEM
// ============================================

/**
 * Handle tenant sign-up request
 */
function handleTenantSignup(data) {
  try {
    const name = (data.name || '').trim();
    const email = (data.email || '').toLowerCase().trim();
    const password = data.password || '';
    const phone = (data.phone || '').trim();
    const propertyId = data.propertyId || '';
    
    if (!name || !email || !password) {
      return createJsonResponse({
        success: false,
        message: 'Name, email, and password are required'
      });
    }
    
    if (password.length < 6) {
      return createJsonResponse({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const usersSheet = getOrCreateUsersSheet(spreadsheet);
    
    // Check if email already exists
    const dataRange = usersSheet.getDataRange().getValues();
    const headers = dataRange[0];
    const colMap = {};
    headers.forEach((header, index) => {
      colMap[header] = index;
    });
    
    for (let i = 1; i < dataRange.length; i++) {
      const row = dataRange[i];
      const userEmail = (row[colMap['Email']] || '').toLowerCase().trim();
      if (userEmail === email) {
        return createJsonResponse({
          success: false,
          message: 'An account with this email already exists. Please log in instead.'
        });
      }
    }
    
    // Verify email matches a property tenant email (optional check)
    let propertyName = '';
    if (propertyId) {
      const masterSheet = getOrCreateMasterSheet(spreadsheet);
      const property = getPropertyById(propertyId, masterSheet);
      if (property) {
        propertyName = property.propertyName || '';
        // Verify email matches property tenant email
        const propertyTenantEmail = (property.tenantEmail || '').toLowerCase().trim();
        if (propertyTenantEmail && propertyTenantEmail !== email) {
          return createJsonResponse({
            success: false,
            message: 'Email does not match the tenant email on file for this property. Please use the email associated with your lease.'
          });
        }
      }
    }
    
    // Hash password
    const passwordHash = hashPassword(password);
    
    // Create tenant account with Pending status
    const now = new Date().toISOString();
    usersSheet.appendRow([
      name,
      email,
      passwordHash,
      'Tenant',
      'Active',
      'Pending',  // Account Status - needs admin approval
      propertyId || '',
      propertyName,
      phone || '',
      now,
      '',
      'Sign-up request - pending approval'
    ]);
    
    Logger.log('Tenant sign-up request created: ' + email);
    
    return createJsonResponse({
      success: true,
      message: 'Account created successfully! Your request is pending admin approval. You will receive an email when your account is approved.'
    });
    
  } catch (error) {
    Logger.log('handleTenantSignup error: ' + error.toString());
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

/**
 * Auto-assign next available storage unit
 */
function getNextAvailableStorageUnit(spreadsheet) {
  try {
    const storageUnitsSheet = getOrCreateStorageUnitsSheet(spreadsheet);
    const dataRows = storageUnitsSheet.getDataRange().getValues();
    const headers = dataRows[0];
    const colMap = {};
    headers.forEach((header, index) => {
      colMap[header] = index;
    });
    
    // Find first vacant unit
    for (let i = 1; i < dataRows.length; i++) {
      const row = dataRows[i];
      const status = row[colMap['Status']] || '';
      if (status === 'Vacant' || status === '') {
        return {
          rowIndex: i,
          unitNumber: row[colMap['Unit Number']],
          size: row[colMap['Size']],
          monthlyRent: parseFloat(row[colMap['Monthly Rent']]) || 0,
          propertyId: row[colMap['Property ID']] || ''
        };
      }
    }
    
    return null;
  } catch (error) {
    Logger.log('getNextAvailableStorageUnit error: ' + error.toString());
    return null;
  }
}

/**
 * Handle storage unit signup with auto-assignment, insurance, gate code, and prorated rent
 */
function handleStorageUnitSignup(data) {
  try {
    const name = (data.name || '').trim();
    const email = (data.email || '').toLowerCase().trim();
    const password = data.password || '';
    const phone = (data.phone || '').trim();
    const includeInsurance = data.includeInsurance === 'true' || data.includeInsurance === true;
    const includePower = data.includePower === 'true' || data.includePower === true;
    const insuranceType = includeInsurance ? 'Paid' : (data.insuranceType || ''); // 'Paid' or 'Own'
    const insuranceFileData = data.insuranceFileData || ''; // Base64 encoded file
    const insuranceFileName = data.insuranceFileName || '';
    const insurancePolicyNumber = data.insurancePolicyNumber || '';
    const insuranceExpirationDate = data.insuranceExpirationDate || '';
    const emergencyContactName = (data.emergencyContactName || '').trim();
    const emergencyContactPhone = (data.emergencyContactPhone || '').trim();
    const emergencyContactRelation = (data.emergencyContactRelation || '').trim();
    const licensePlate = (data.licensePlate || '').trim().toUpperCase();
    const vehicleColor = (data.vehicleColor || '').trim();
    const termsAccepted = data.termsAccepted === 'true' || data.termsAccepted === true;
    const startDate = data.startDate || new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    // Validation
    if (!name || !email || !password) {
      return createJsonResponse({
        success: false,
        message: 'Name, email, and password are required'
      });
    }
    
    if (password.length < 6) {
      return createJsonResponse({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }
    
    if (!emergencyContactName || !emergencyContactPhone) {
      return createJsonResponse({
        success: false,
        message: 'Emergency contact name and phone are required'
      });
    }
    
    if (!termsAccepted) {
      return createJsonResponse({
        success: false,
        message: 'You must accept the terms and conditions'
      });
    }
    
    // Insurance validation - customer must either pay or provide their own
    if (!includeInsurance && (!insuranceFileData || !insuranceFileName)) {
      return createJsonResponse({
        success: false,
        message: 'Insurance is required. Please either pay $25/month or upload your insurance declaration page.'
      });
    }
    
    if (!licensePlate || !vehicleColor) {
      return createJsonResponse({
        success: false,
        message: 'License plate and vehicle color are required for facility access'
      });
    }
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const masterSheet = getOrCreateMasterSheet(spreadsheet);
    const usersSheet = getOrCreateUsersSheet(spreadsheet);
    const storageUnitsSheet = getOrCreateStorageUnitsSheet(spreadsheet);
    
    // Use selected unit ID if provided, otherwise auto-assign
    const selectedUnitId = (data.selectedUnitId || '').trim();
    let availableUnit = null;
    let unitNumber = '';
    let propertyId = '';
    let monthlyRent = 0;
    let unitRowIndex = -1;
    
    if (selectedUnitId) {
      // Find the selected unit
      const dataRows = storageUnitsSheet.getDataRange().getValues();
      const headers = dataRows[0];
      const colMap = {};
      headers.forEach((header, index) => {
        colMap[header] = index;
      });
      
      for (let i = 1; i < dataRows.length; i++) {
        const row = dataRows[i];
        const rowUnitNumber = (row[colMap['Unit Number']] || '').toString().trim();
        const status = (row[colMap['Status']] || '').toString().toLowerCase();
        const tenantEmail = (row[colMap['Tenant Email']] || '').toString().trim();
        
        if (rowUnitNumber === selectedUnitId) {
          // Check if unit is available
          if (status && status !== 'vacant' && status !== 'available' && tenantEmail) {
            return createJsonResponse({
              success: false,
              message: 'Selected unit is no longer available. Please select another unit.'
            });
          }
          
          unitNumber = rowUnitNumber;
          unitRowIndex = i;
          monthlyRent = parseFloat(row[colMap['Monthly Rent']]) || 0;
          propertyId = row[colMap['ID']] || '';
          availableUnit = {
            unitNumber: unitNumber,
            propertyId: propertyId,
            monthlyRent: monthlyRent,
            rowIndex: unitRowIndex
          };
          break;
        }
      }
      
      if (!availableUnit) {
        return createJsonResponse({
          success: false,
          message: 'Selected unit not found. Please select a valid unit.'
        });
      }
    } else {
      // Auto-assign next available unit
      availableUnit = getNextAvailableStorageUnit(spreadsheet);
      if (!availableUnit) {
        return createJsonResponse({
          success: false,
          message: 'No storage units available at this time. Please contact us for availability.'
        });
      }
      
      unitNumber = availableUnit.unitNumber;
      propertyId = availableUnit.propertyId;
      monthlyRent = availableUnit.monthlyRent;
      unitRowIndex = availableUnit.rowIndex;
    }
    
    // Check if email already exists
    const dataRange = usersSheet.getDataRange().getValues();
    const headers = dataRange[0];
    const colMap = {};
    headers.forEach((header, index) => {
      colMap[header] = index;
    });
    
    for (let i = 1; i < dataRange.length; i++) {
      const row = dataRange[i];
      const userEmail = (row[colMap['Email']] || '').toLowerCase().trim();
      if (userEmail === email) {
        return createJsonResponse({
          success: false,
          message: 'An account with this email already exists. Please log in instead.'
        });
      }
    }
    
    // Calculate prorated rent
    const startDateObj = new Date(startDate + 'T00:00:00');
    startDateObj.setHours(0, 0, 0, 0);
    
    const insuranceFee = includeInsurance ? 25 : 0;
    const powerFee = includePower ? 60 : 0;
    const subtotal = monthlyRent + insuranceFee + powerFee;
    const taxRate = 0.095; // 9.5% tax
    const taxAmount = subtotal * taxRate;
    const fullMonthlyTotal = subtotal + taxAmount;
    
    // Calculate prorated amount
    const startMonth = startDateObj.getMonth();
    const startYear = startDateObj.getFullYear();
    const daysInMonth = new Date(startYear, startMonth + 1, 0).getDate();
    const startDay = startDateObj.getDate();
    const daysRemaining = daysInMonth - startDay + 1;
    const proratedSubtotal = (subtotal / daysInMonth) * daysRemaining;
    const proratedTax = (taxAmount / daysInMonth) * daysRemaining;
    const proratedAmount = proratedSubtotal + proratedTax;
    
    // Calculate lease end date (12 months from start, auto-renewal default true)
    const leaseEndDateObj = new Date(startDateObj);
    leaseEndDateObj.setFullYear(leaseEndDateObj.getFullYear() + 1);
    
    // Generate gate code
    const gateCode = generateGateCode(spreadsheet);
    
    // Handle insurance document upload if provided
    let insuranceDocumentUrl = '';
    if (!includeInsurance && insuranceFileData) {
      try {
        // Decode base64 file data
        const fileBytes = Utilities.base64Decode(insuranceFileData);
        const fileId = uploadInsuranceDocument(email, unitNumber, fileBytes, insuranceFileName);
        if (fileId) {
          const file = DriveApp.getFileById(fileId);
          insuranceDocumentUrl = file.getUrl();
        }
      } catch (error) {
        Logger.log('Insurance document upload error: ' + error.toString());
        // Continue without document URL, but log the error
      }
    }
    
    // Hash password
    const passwordHash = hashPassword(password);
    
    // Calculate final monthly rent (including insurance, power, and tax)
    const finalMonthlyRent = fullMonthlyTotal; // Already includes tax
    
    // Update consolidated Storage Units sheet
    const storageData = storageUnitsSheet.getDataRange().getValues();
    const storageHeaders = storageData[0];
    const storageColMap = {};
    storageHeaders.forEach((header, index) => {
      storageColMap[header] = index;
    });
    
    const finalInsuranceType = includeInsurance ? 'Paid' : 'Own';
    const rowToUpdate = unitRowIndex + 1; // Convert to 1-based index
    
    // Helper function to safely set cell value if column exists
    function setCellValueIfExists(columnName, value, formatFunction) {
      if (storageColMap[columnName] !== undefined && storageColMap[columnName] !== null) {
        const colIndex = storageColMap[columnName] + 1; // Convert to 1-based
        if (colIndex > 0) {
          const cell = storageUnitsSheet.getRange(rowToUpdate, colIndex);
          if (formatFunction) {
            formatFunction(cell, value);
          } else {
            cell.setValue(value);
          }
        }
      }
    }
    
    setCellValueIfExists('Tenant Name', name);
    setCellValueIfExists('Tenant Email', email);
    setCellValueIfExists('Tenant Phone', phone);
    setCellValueIfExists('Status', 'Occupied');
    setCellValueIfExists('Gate Code', gateCode);
    setCellValueIfExists('Monthly Rent', finalMonthlyRent, (cell, val) => {
      cell.setValue(val).setNumberFormat('$#,##0.00');
    });
    setCellValueIfExists('Power Included', includePower);
    setCellValueIfExists('Lease Start Date', startDateObj);
    setCellValueIfExists('Lease End Date', leaseEndDateObj);
    setCellValueIfExists('Auto-Renewal', true);
    setCellValueIfExists('Insurance Type', finalInsuranceType);
    
    if (insuranceDocumentUrl) {
      setCellValueIfExists('Insurance Document URL', insuranceDocumentUrl);
    }
    if (insurancePolicyNumber) {
      setCellValueIfExists('Insurance Policy Number', insurancePolicyNumber);
    }
    if (insuranceExpirationDate) {
      setCellValueIfExists('Insurance Expiration Date', new Date(insuranceExpirationDate));
    }
    
    setCellValueIfExists('Emergency Contact Name', emergencyContactName);
    setCellValueIfExists('Emergency Contact Phone', emergencyContactPhone);
    setCellValueIfExists('Emergency Contact Relation', emergencyContactRelation);
    setCellValueIfExists('License Plate', licensePlate);
    setCellValueIfExists('Vehicle Color', vehicleColor);
    
    SpreadsheetApp.flush();
    
    // Add first payment record to Storage Unit Payments sheet
    const firstOfMonth = new Date(startYear, startMonth, 1);
    addStorageUnitPayment(spreadsheet, unitNumber, {
      dateDue: firstOfMonth,
      datePaid: '',
      rent: monthlyRent,
      lateFee: 0,
      total: proratedAmount,
      method: 'Prorated',
      status: 'Pending',
      stripeId: '',
      notes: `Prorated for ${daysRemaining} days (${startDate})${includeInsurance ? ' + Insurance $25' : ''}${includePower ? ' + Power $60' : ''}`
    });
    
    // Update master sheet (for compatibility with existing dashboard)
    const masterData = masterSheet.getDataRange().getValues();
    const masterHeaders = masterData[0];
    const masterColMap = {};
    masterHeaders.forEach((header, index) => {
      masterColMap[header] = index;
    });
    
    for (let i = 1; i < masterData.length; i++) {
      if (masterData[i][masterColMap['ID']] === propertyId) {
        masterSheet.getRange(i + 1, masterColMap['Tenant Name'] + 1).setValue(name);
        masterSheet.getRange(i + 1, masterColMap['Tenant Email'] + 1).setValue(email);
        masterSheet.getRange(i + 1, masterColMap['Tenant Phone'] + 1).setValue(phone);
        masterSheet.getRange(i + 1, masterColMap['Status'] + 1).setValue('Occupied');
        masterSheet.getRange(i + 1, masterColMap['Monthly Rent'] + 1).setValue(finalMonthlyRent);
        if (includePower && masterColMap['Power Included'] !== undefined) {
          masterSheet.getRange(i + 1, masterColMap['Power Included'] + 1).setValue(true);
        }
        break;
      }
    }
    
    // Create tenant account
    const now = new Date().toISOString();
    usersSheet.appendRow([
      name,
      email,
      passwordHash,
      'Tenant',
      'Active',
      'Approved', // Auto-approve for storage units (public signup)
      propertyId,
      `Storage Unit ${unitNumber}`,
      phone,
      now,
      '',
      `Storage Unit Signup - Unit ${unitNumber}${includeInsurance ? ' (Insurance $25)' : ''}${includePower ? ' (Power $60)' : ''} - Prorated: $${proratedAmount.toFixed(2)}`
    ]);
    
    // Generate lease agreement PDF (placeholder for now)
    // TODO: Generate actual lease PDF
    
    // Send confirmation email with gate code and payment rules
    try {
      sendStorageSignupConfirmation(email, name, unitNumber, gateCode, startDateObj, proratedAmount, fullMonthlyTotal, finalInsuranceType, licensePlate, vehicleColor);
    } catch (emailError) {
      Logger.log('Email send error: ' + emailError.toString());
      // Continue even if email fails
    }
    
    Logger.log('Storage unit signup completed: ' + email + ' - Unit: ' + unitNumber);
    
    // Return success with redirect flag
    return createJsonResponse({
      success: true,
      message: `Account created successfully! Unit ${unitNumber} has been assigned to you. Please complete your profile setup.`,
      gateCode: gateCode,
      proratedAmount: proratedAmount,
      daysRemaining: daysRemaining,
      monthlyTotal: fullMonthlyTotal,
      unitNumber: unitNumber,
      redirectToProfile: true,
      email: email
    });
    
  } catch (error) {
    Logger.log('handleStorageUnitSignup error: ' + error.toString());
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

/**
 * Get pending tenant requests for admin dashboard
 */
function handleGetPendingTenants(data) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const usersSheet = getOrCreateUsersSheet(spreadsheet);
    
    const dataRange = usersSheet.getDataRange().getValues();
    
    if (dataRange.length < 2) {
      // No data rows, return empty array
      return createJsonResponse({
        success: true,
        pendingTenants: []
      });
    }
    
    const headers = dataRange[0];
    
    // Find column indices
    const colMap = {};
    headers.forEach((header, index) => {
      colMap[header] = index;
    });
    
    // Check if Account Status column exists, if not, add it
    if (colMap['Account Status'] === undefined) {
      // Add Account Status column
      const lastCol = headers.length;
      usersSheet.getRange(1, lastCol + 1).setValue('Account Status');
      usersSheet.getRange(1, lastCol + 1).setFontWeight('bold');
      usersSheet.getRange(1, lastCol + 1).setBackground('#1e40af');
      usersSheet.getRange(1, lastCol + 1).setFontColor('#ffffff');
      colMap['Account Status'] = lastCol;
      
      // Set all existing users based on their role
      // Tenants default to Pending so admin can review and approve them
      // Admins are Approved by default
      for (let i = 2; i < dataRange.length; i++) {
        const row = dataRange[i];
        const role = (row[colMap['Role']] || '').toString().trim();
        const status = role === 'Admin' ? 'Approved' : 'Pending';
        usersSheet.getRange(i + 1, lastCol + 1).setValue(status);
        Logger.log('Set user ' + (row[colMap['Email']] || '') + ' (Role: ' + role + ') to Account Status: ' + status);
      }
      
      // Refresh data after adding column
      SpreadsheetApp.flush();
      dataRange = usersSheet.getDataRange().getValues();
      headers = dataRange[0];
      // Rebuild colMap with updated headers
      Object.keys(colMap).forEach(key => delete colMap[key]);
      headers.forEach((header, index) => {
        colMap[header] = index;
      });
      Logger.log('Account Status column added. Refreshed data. Column map: ' + JSON.stringify(colMap));
    }
    
    const pendingTenants = [];
    
    for (let i = 1; i < dataRange.length; i++) {
      const row = dataRange[i];
      const role = (row[colMap['Role']] || '').toString().trim();
      const accountStatus = colMap['Account Status'] !== undefined ? (row[colMap['Account Status']] || '').toString().trim() : '';
      
      Logger.log('Row ' + (i + 1) + ': Role=' + role + ', AccountStatus=' + accountStatus + ', Email=' + (row[colMap['Email']] || ''));
      
      // Check if it's a Tenant with Pending status
      // Also check if Account Status is empty (treat as Pending for existing tenants)
      if (role === 'Tenant' && (accountStatus === 'Pending' || accountStatus === '')) {
        Logger.log('Adding pending tenant: ' + (row[colMap['Email']] || ''));
        pendingTenants.push({
          rowIndex: i + 1,  // Sheet row number (1-indexed)
          name: row[colMap['Name']] || '',
          email: row[colMap['Email']] || '',
          phone: colMap['Phone'] !== undefined ? (row[colMap['Phone']] || '') : '',
          propertyId: colMap['Property ID'] !== undefined ? (row[colMap['Property ID']] || '') : '',
          propertyName: colMap['Property Name'] !== undefined ? (row[colMap['Property Name']] || '') : '',
          createdAt: colMap['Created At'] !== undefined ? (row[colMap['Created At']] || '') : '',
          notes: colMap['Notes'] !== undefined ? (row[colMap['Notes']] || '') : ''
        });
      }
    }
    
    Logger.log('Found ' + pendingTenants.length + ' pending tenants');
    Logger.log('Column map: ' + JSON.stringify(colMap));
    Logger.log('Total rows in sheet: ' + dataRange.length);
    
    return createJsonResponse({
      success: true,
      pendingTenants: pendingTenants,
      debug: {
        totalRows: dataRange.length,
        columnMap: colMap,
        foundPending: pendingTenants.length
      }
    });
    
  } catch (error) {
    Logger.log('handleGetPendingTenants error: ' + error.toString());
    Logger.log('Error stack: ' + error.stack);
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

/**
 * Approve tenant account
 */
function handleApproveTenant(data) {
  try {
    const rowIndex = parseInt(data.rowIndex);
    
    if (!rowIndex) {
      return createJsonResponse({
        success: false,
        message: 'Row index is required'
      });
    }
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const usersSheet = getOrCreateUsersSheet(spreadsheet);
    
    const dataRange = usersSheet.getDataRange().getValues();
    const headers = dataRange[0];
    
    // Find column indices
    const colMap = {};
    headers.forEach((header, index) => {
      colMap[header] = index;
    });
    
    // Verify row exists and is a pending tenant
    if (rowIndex < 2 || rowIndex > dataRange.length) {
      return createJsonResponse({
        success: false,
        message: 'Invalid row index'
      });
    }
    
    const row = dataRange[rowIndex - 1];  // Convert to 0-indexed
    const role = (row[colMap['Role']] || '').toString().trim();
    const accountStatus = (row[colMap['Account Status']] || '').toString().trim();
    
    if (role !== 'Tenant' || accountStatus !== 'Pending') {
      return createJsonResponse({
        success: false,
        message: 'This account is not a pending tenant request'
      });
    }
    
    // Update account status to Approved
    usersSheet.getRange(rowIndex, colMap['Account Status'] + 1).setValue('Approved');
    
    // Send approval email with comprehensive instructions
    const tenantEmail = row[colMap['Email']] || '';
    const tenantName = row[colMap['Name']] || '';
    const propertyId = row[colMap['Property ID']] || '';
    
    if (tenantEmail) {
      const webAppUrl = ScriptApp.getService().getUrl();
      const portalUrl = webAppUrl + '?action=tenantPortal';
      
      // Get property info for instructions
      let property = null;
      if (propertyId) {
        const masterSheet = getOrCreateMasterSheet(spreadsheet);
        property = getPropertyById(propertyId, masterSheet);
      }
      
      MailApp.sendEmail({
        to: tenantEmail,
        subject: 'Your Tenant Portal Account Has Been Approved',
        htmlBody: generateTenantApprovalEmail(tenantName, portalUrl, property)
      });
    }
    
    Logger.log('Tenant account approved: ' + tenantEmail);
    
    return createJsonResponse({
      success: true,
      message: 'Tenant account approved successfully'
    });
    
  } catch (error) {
    Logger.log('handleApproveTenant error: ' + error.toString());
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

/**
 * Reject tenant account
 */
function handleRejectTenant(data) {
  try {
    const rowIndex = parseInt(data.rowIndex);
    const reason = (data.reason || '').trim();
    
    if (!rowIndex) {
      return createJsonResponse({
        success: false,
        message: 'Row index is required'
      });
    }
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const usersSheet = getOrCreateUsersSheet(spreadsheet);
    
    const dataRange = usersSheet.getDataRange().getValues();
    const headers = dataRange[0];
    
    // Find column indices
    const colMap = {};
    headers.forEach((header, index) => {
      colMap[header] = index;
    });
    
    // Verify row exists and is a pending tenant
    if (rowIndex < 2 || rowIndex > dataRange.length) {
      return createJsonResponse({
        success: false,
        message: 'Invalid row index'
      });
    }
    
    const row = dataRange[rowIndex - 1];  // Convert to 0-indexed
    const role = (row[colMap['Role']] || '').toString().trim();
    const accountStatus = (row[colMap['Account Status']] || '').toString().trim();
    
    if (role !== 'Tenant' || accountStatus !== 'Pending') {
      return createJsonResponse({
        success: false,
        message: 'This account is not a pending tenant request'
      });
    }
    
    // Update account status to Rejected
    usersSheet.getRange(rowIndex, colMap['Account Status'] + 1).setValue('Rejected');
    usersSheet.getRange(rowIndex, colMap['Status'] + 1).setValue('Inactive');
    
    // Update notes with rejection reason
    const notes = reason ? 'Rejected: ' + reason : 'Account rejected by admin';
    usersSheet.getRange(rowIndex, colMap['Notes'] + 1).setValue(notes);
    
    // Send rejection email
    const tenantEmail = row[colMap['Email']] || '';
    const tenantName = row[colMap['Name']] || '';
    
    if (tenantEmail) {
      MailApp.sendEmail({
        to: tenantEmail,
        subject: 'Tenant Portal Account Request',
        htmlBody: generateTenantRejectionEmail(tenantName, reason)
      });
    }
    
    Logger.log('Tenant account rejected: ' + tenantEmail);
    
    return createJsonResponse({
      success: true,
      message: 'Tenant account rejected successfully'
    });
    
  } catch (error) {
    Logger.log('handleRejectTenant error: ' + error.toString());
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

/**
 * Send portal instructions to tenant
 */
function handleSendPortalInstructions(data) {
  try {
    const email = (data.email || data.tenantEmail || '').toLowerCase().trim();
    const propertyId = data.propertyId || '';
    
    if (!email) {
      return createJsonResponse({
        success: false,
        message: 'Email is required'
      });
    }
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const webAppUrl = ScriptApp.getService().getUrl();
    const portalUrl = webAppUrl + '?action=tenantPortal';
    
    // Get property info if propertyId provided
    let property = null;
    if (propertyId) {
      const masterSheet = getOrCreateMasterSheet(spreadsheet);
      property = getPropertyById(propertyId, masterSheet);
    }
    
    // Try to get tenant name from Users sheet
    let tenantName = '';
    try {
      const usersSheet = getOrCreateUsersSheet(spreadsheet);
      const dataRange = usersSheet.getDataRange().getValues();
      const headers = dataRange[0];
      const colMap = {};
      headers.forEach((header, index) => {
        colMap[header] = index;
      });
      
      for (let i = 1; i < dataRange.length; i++) {
        const row = dataRange[i];
        const userEmail = (row[colMap['Email']] || '').toLowerCase().trim();
        if (userEmail === email) {
          tenantName = row[colMap['Name']] || '';
          break;
        }
      }
    } catch (e) {
      Logger.log('Could not get tenant name from Users sheet: ' + e.toString());
    }
    
    // If no name found and property exists, use property tenant name
    if (!tenantName && property) {
      tenantName = property.tenantName || '';
    }
    
    // Send comprehensive instructions email
    MailApp.sendEmail({
      to: email,
      subject: 'How to Use Your Tenant Portal - Complete Guide',
      htmlBody: generatePortalInstructionsEmail(tenantName, portalUrl, property, email)
    });
    
    Logger.log('Portal instructions sent to: ' + email);
    
    return createJsonResponse({
      success: true,
      message: 'Portal instructions sent successfully'
    });
    
  } catch (error) {
    Logger.log('handleSendPortalInstructions error: ' + error.toString());
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

/**
 * Generate tenant approval email with comprehensive instructions
 */
function generateTenantApprovalEmail(tenantName, portalUrl, property) {
  // Use comprehensive instructions email
  return generatePortalInstructionsEmail(tenantName, portalUrl, property, '');
}

/**
 * Generate comprehensive portal instructions email
 */
function generatePortalInstructionsEmail(tenantName, portalUrl, property, tenantEmail) {
  const propertyName = property ? property.propertyName : '';
  const emailInstruction = tenantEmail ? `<p><strong>📧 Login Email:</strong> Use <strong>${tenantEmail}</strong> to log in to your portal.</p>` : '';
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 650px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); color: white; padding: 30px 20px; text-align: center; border-radius: 12px 12px 0 0; }
        .content { background: #f9fafb; padding: 35px; border-radius: 0 0 12px 12px; }
        .button { display: inline-block; background: #f97316; color: white; padding: 14px 35px; text-decoration: none; border-radius: 8px; margin: 25px 0; font-weight: bold; font-size: 16px; }
        .button:hover { background: #ea580c; }
        .section { background: white; padding: 25px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #1e3a8a; }
        .section-title { font-size: 18px; font-weight: bold; color: #1e3a8a; margin-bottom: 15px; }
        .step { margin: 15px 0; padding-left: 25px; }
        .step-number { background: #1e3a8a; color: white; border-radius: 50%; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 10px; margin-left: -25px; }
        ul { margin: 10px 0; padding-left: 25px; }
        li { margin: 8px 0; }
        .highlight { background: #fef3c7; padding: 15px; border-radius: 6px; border-left: 4px solid #f59e0b; margin: 20px 0; }
        .footer { text-align: center; margin-top: 40px; color: #6b7280; font-size: 12px; border-top: 1px solid #e5e7eb; padding-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0; font-size: 28px;">🎉 Your Tenant Portal is Ready!</h1>
          ${propertyName ? `<p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">${propertyName}</p>` : ''}
        </div>
        <div class="content">
          <p style="font-size: 16px;">Hello ${tenantName || 'Tenant'},</p>
          <p style="font-size: 16px;">Great news! Your tenant portal account has been approved and is ready to use.</p>
          
          ${emailInstruction}
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${portalUrl}" class="button">🚀 Access Your Portal Now</a>
          </div>
          
          <div class="highlight">
            <strong>💡 First Time?</strong> If you haven't created your account yet, you'll need to click "Create Account" on the login page first. Use the email address associated with your lease.
          </div>
          
          <div class="section">
            <div class="section-title">📋 What You Can Do in Your Portal</div>
            <ul>
              <li><strong>View Property Details</strong> - See your property information, rent amount, and contact details</li>
              <li><strong>Pay Rent Online</strong> - Make one-time rent payments securely using Stripe</li>
              <li><strong>Set Up Autopay</strong> - Enable automatic monthly rent payments so you never miss a payment</li>
              <li><strong>Manage Payment Methods</strong> - Add, update, or remove credit/debit cards</li>
              <li><strong>View Payment History</strong> - See all your past payments, dates, and amounts</li>
              <li><strong>Access Lease Documents</strong> - View and download your lease agreement and other documents</li>
            </ul>
          </div>
          
          <div class="section">
            <div class="section-title">🔐 How to Log In</div>
            <div class="step">
              <span class="step-number">1</span>
              <strong>Visit the Portal:</strong> Click the button above or use this link: <a href="${portalUrl}">${portalUrl}</a>
            </div>
            <div class="step">
              <span class="step-number">2</span>
              <strong>Enter Your Email:</strong> Use the email address associated with your lease
            </div>
            <div class="step">
              <span class="step-number">3</span>
              <strong>Enter Your Password:</strong> Use the password you created when signing up
            </div>
            <div class="step">
              <span class="step-number">4</span>
              <strong>Access Your Dashboard:</strong> Once logged in, you'll see all your property information
            </div>
          </div>
          
          <div class="section">
            <div class="section-title">💳 Making a Payment</div>
            <div class="step">
              <span class="step-number">1</span>
              <strong>Click "Pay Rent Now":</strong> Found in the "Overview" tab of your portal
            </div>
            <div class="step">
              <span class="step-number">2</span>
              <strong>Enter Payment Details:</strong> You'll be redirected to a secure Stripe checkout page
            </div>
            <div class="step">
              <span class="step-number">3</span>
              <strong>Complete Payment:</strong> Enter your card information and confirm
            </div>
            <div class="step">
              <span class="step-number">4</span>
              <strong>Confirmation:</strong> You'll receive a receipt, and the payment will be recorded automatically
            </div>
          </div>
          
          <div class="section">
            <div class="section-title">🔄 Setting Up Autopay</div>
            <div class="step">
              <span class="step-number">1</span>
              <strong>Go to "Autopay" Tab:</strong> Click the Autopay tab in your portal
            </div>
            <div class="step">
              <span class="step-number">2</span>
              <strong>Click "Set Up Autopay":</strong> You'll be taken to Stripe's secure customer portal
            </div>
            <div class="step">
              <span class="step-number">3</span>
              <strong>Add Payment Method:</strong> Enter your credit or debit card information
            </div>
            <div class="step">
              <span class="step-number">4</span>
              <strong>Enable Subscription:</strong> Confirm that you want to set up automatic monthly payments
            </div>
            <p style="margin-top: 15px;"><strong>✅ Once enabled:</strong> Your rent will be automatically charged on the due date each month. You can cancel or change your payment method at any time.</p>
          </div>
          
          <div class="section">
            <div class="section-title">📄 Accessing Lease Documents</div>
            <div class="step">
              <span class="step-number">1</span>
              <strong>Go to "Leases" Tab:</strong> Click the Leases tab in your portal
            </div>
            <div class="step">
              <span class="step-number">2</span>
              <strong>View Documents:</strong> All your lease documents will be listed here
            </div>
            <div class="step">
              <span class="step-number">3</span>
              <strong>Download:</strong> Click "View" to open or download any document
            </div>
          </div>
          
          <div class="highlight">
            <strong>❓ Need Help?</strong> If you have any questions or need assistance, please contact your landlord directly. For technical issues with the portal, you can also reach out via email.
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${portalUrl}" class="button">Access Your Portal</a>
          </div>
        </div>
        <div class="footer">
          <p>This is an automated message from <strong>McAfee Properties</strong>.</p>
          <p>Your portal URL: <a href="${portalUrl}" style="color: #1e3a8a;">${portalUrl}</a></p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate tenant rejection email
 */
function generateTenantRejectionEmail(tenantName, reason) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
        .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Account Request</h1>
        </div>
        <div class="content">
          <p>Hello ${tenantName || 'Tenant'},</p>
          <p>Thank you for your interest in the tenant portal.</p>
          <p>Unfortunately, your account request could not be approved at this time.</p>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
          <p>If you believe this is an error, or if you have questions, please contact your landlord directly.</p>
        </div>
        <div class="footer">
          <p>This is an automated message from McAfee Properties.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Get payment streak information for a property
 */
function handleGetPaymentStreak(data) {
  try {
    const propertyId = data.propertyId || data.property_id;
    
    if (!propertyId) {
      return createJsonResponse({
        success: false,
        message: 'Property ID is required'
      });
    }
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const masterSheet = getOrCreateMasterSheet(spreadsheet);
    const property = getPropertyById(propertyId, masterSheet);
    
    if (!property) {
      return createJsonResponse({
        success: false,
        message: 'Property not found'
      });
    }
    
    const propertySheet = spreadsheet.getSheetByName(property.propertyName);
    if (!propertySheet) {
      return createJsonResponse({
        success: true,
        streak: 0,
        onTimeCount: 0,
        eligibleForGoodDeed: false
      });
    }
    
    // Get payment history from property sheet (columns G-O, starting at row 4)
    // Payment History columns: G(7)=Date Due, H(8)=Date Paid, I(9)=Rent, J(10)=Late Fee, K(11)=Total, L(12)=Method, M(13)=Status, N(14)=Stripe ID, O(15)=Notes
    const streakData = calculatePaymentStreak(propertySheet, property);
    
    return createJsonResponse({
      success: true,
      streak: streakData.streak,
      onTimeCount: streakData.onTimeCount,
      eligibleForGoodDeed: streakData.eligibleForGoodDeed,
      lastLatePayment: streakData.lastLatePayment,
      gracePeriodUsed: streakData.gracePeriodUsed
    });
    
  } catch (error) {
    Logger.log('handleGetPaymentStreak error: ' + error.toString());
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

/**
 * Calculate payment streak with grace period
 * On-time = paid by the 7th (or paid with late fee waived)
 */
function calculatePaymentStreak(propertySheet, property) {
  try {
    // Payment History columns: G(7)=Date Due, H(8)=Date Paid, I(9)=Rent, J(10)=Late Fee, K(11)=Total, L(12)=Method, M(13)=Status, N(14)=Stripe ID, O(15)=Notes
    let streak = 0;
    let onTimeCount = 0;
    let gracePeriodUsed = false;
    let lastLatePayment = null;
    const today = new Date();
    const oneYearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
    
    // Read payment history from row 4 to row 103 (stopping before EXPENSES section)
    // Read from bottom up (most recent first) to properly track streak
    const payments = [];
    for (let row = 4; row < 104; row++) {
      const dateDue = propertySheet.getRange(row, 7).getValue(); // Column G
      const datePaid = propertySheet.getRange(row, 8).getValue(); // Column H
      const lateFee = propertySheet.getRange(row, 10).getValue(); // Column J
      const notes = propertySheet.getRange(row, 15).getValue(); // Column O
      const status = propertySheet.getRange(row, 13).getValue(); // Column M
      
      // Stop if we hit empty row or EXPENSES section
      if (!dateDue || dateDue === '' || dateDue === 'EXPENSES') break;
      if (status !== 'Paid') continue; // Only count paid payments
      
      // Convert dates
      let dueDate = dateDue;
      if (typeof dueDate === 'string') {
        dueDate = new Date(dueDate);
      }
      
      // Only count payments in the last year
      if (dueDate < oneYearAgo) continue;
      
      let paidDate = datePaid;
      if (typeof paidDate === 'string') {
        paidDate = new Date(paidDate);
      }
      
      // Check if late fee was waived (in notes)
      const feeWaived = notes && (notes.toString().toLowerCase().includes('waived') || notes.toString().toLowerCase().includes('good deed'));
      
      payments.push({
        dueDate: dueDate,
        paidDate: paidDate,
        lateFee: lateFee,
        feeWaived: feeWaived
      });
    }
    
    // Sort payments by due date (most recent first)
    payments.sort((a, b) => b.dueDate - a.dueDate);
    
    // Calculate streak going backwards (most recent first)
    for (let i = 0; i < payments.length; i++) {
      const payment = payments[i];
      
      // Payment is on-time if:
      // 1. Paid within 7 days of due date (by the 7th of the month)
      // 2. OR late fee was waived
      // 3. OR late fee is 0
      const daysAfterDue = Math.floor((payment.paidDate - payment.dueDate) / (1000 * 60 * 60 * 24));
      const isOnTime = daysAfterDue <= 7 || payment.feeWaived || (payment.lateFee === 0 || payment.lateFee === '');
      
      if (isOnTime) {
        onTimeCount++;
        streak++;
      } else {
        // One late payment doesn't break the streak (grace period)
        if (!gracePeriodUsed) {
          gracePeriodUsed = true;
          onTimeCount++; // Count it as on-time for streak purposes
          streak++;
          lastLatePayment = payment.dueDate;
        } else {
          // Second late payment breaks the streak
          streak = 0;
          onTimeCount = 0;
          gracePeriodUsed = false;
          break; // Stop counting once streak is broken
        }
      }
    }
    
    // Eligible for good deed if 4+ months of on-time payments
    const eligibleForGoodDeed = onTimeCount >= 4;
    
    return {
      streak: streak,
      onTimeCount: onTimeCount,
      eligibleForGoodDeed: eligibleForGoodDeed,
      lastLatePayment: lastLatePayment,
      gracePeriodUsed: gracePeriodUsed
    };
    
  } catch (error) {
    Logger.log('calculatePaymentStreak error: ' + error.toString());
    return {
      streak: 0,
      onTimeCount: 0,
      eligibleForGoodDeed: false,
      lastLatePayment: null,
      gracePeriodUsed: false
    };
  }
}

/**
 * Waive late fee for a property
 */
function handleWaiveLateFee(data) {
  try {
    const propertyId = data.propertyId || data.property_id;
    const reason = data.reason || 'Manual waiver';
    
    if (!propertyId) {
      return createJsonResponse({
        success: false,
        message: 'Property ID is required'
      });
    }
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const masterSheet = getOrCreateMasterSheet(spreadsheet);
    const property = getPropertyById(propertyId, masterSheet);
    
    if (!property) {
      return createJsonResponse({
        success: false,
        message: 'Property not found'
      });
    }
    
    const propertySheet = spreadsheet.getSheetByName(property.propertyName);
    if (!propertySheet) {
      return createJsonResponse({
        success: false,
        message: 'Property sheet not found'
      });
    }
    
    // Find the current month's payment row (most recent unpaid or current month)
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const firstOfMonth = new Date(currentYear, currentMonth, 1);
    
    // Find the row for current month's payment
    let targetRow = -1;
    for (let row = 4; row < 104; row++) {
      const dateDue = propertySheet.getRange(row, 7).getValue(); // Column G
      if (!dateDue || dateDue === '' || dateDue === 'EXPENSES') break;
      
      let dueDate = dateDue;
      if (typeof dueDate === 'string') {
        dueDate = new Date(dueDate);
      }
      
      // Check if this is the current month's payment
      if (dueDate.getMonth() === currentMonth && dueDate.getFullYear() === currentYear) {
        targetRow = row;
        break;
      }
    }
    
    if (targetRow === -1) {
      // Create a new row for current month if it doesn't exist
      targetRow = 4;
      // Find first empty row
      for (let row = 4; row < 104; row++) {
        const dateDue = propertySheet.getRange(row, 7).getValue();
        if (!dateDue || dateDue === '') {
          targetRow = row;
          break;
        }
      }
      
      // Set up the row
      propertySheet.getRange(targetRow, 7).setValue(firstOfMonth); // Date Due
      propertySheet.getRange(targetRow, 9).setValue(parseFloat(property.monthlyRent)); // Rent
    }
    
    // Set late fee to 0 and add note
    propertySheet.getRange(targetRow, 10).setValue(0); // Late Fee = 0
    const currentNotes = propertySheet.getRange(targetRow, 15).getValue() || ''; // Column O
    const newNotes = currentNotes + (currentNotes ? '; ' : '') + `Late fee waived: ${reason} (${new Date().toLocaleDateString()})`;
    propertySheet.getRange(targetRow, 15).setValue(newNotes);
    
    // Recalculate total (rent + late fee)
    const rent = propertySheet.getRange(targetRow, 9).getValue();
    const lateFee = 0;
    propertySheet.getRange(targetRow, 11).setValue(rent + lateFee); // Total
    
    return createJsonResponse({
      success: true,
      message: 'Late fee waived successfully'
    });
    
  } catch (error) {
    Logger.log('handleWaiveLateFee error: ' + error.toString());
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

/**
 * Apply Good Deed Month - waive late fee if tenant has 4+ months of on-time payments
 */
function handleGoodDeedMonth(data) {
  try {
    const propertyId = data.propertyId || data.property_id;
    
    if (!propertyId) {
      return createJsonResponse({
        success: false,
        message: 'Property ID is required'
      });
    }
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const masterSheet = getOrCreateMasterSheet(spreadsheet);
    const property = getPropertyById(propertyId, masterSheet);
    
    if (!property) {
      return createJsonResponse({
        success: false,
        message: 'Property not found'
      });
    }
    
    const propertySheet = spreadsheet.getSheetByName(property.propertyName);
    if (!propertySheet) {
      return createJsonResponse({
        success: false,
        message: 'Property sheet not found'
      });
    }
    
    // Check payment streak
    const streakData = calculatePaymentStreak(propertySheet, property);
    
    if (!streakData.eligibleForGoodDeed) {
      return createJsonResponse({
        success: false,
        message: `Tenant needs ${4 - streakData.onTimeCount} more on-time payment${4 - streakData.onTimeCount !== 1 ? 's' : ''} to be eligible for Good Deed Month`
      });
    }
    
    // Waive the late fee with good deed reason (call the internal logic directly)
    const reason = `Good Deed Month - ${streakData.onTimeCount} months on-time payments`;
    
    // Find the current month's payment row
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const firstOfMonth = new Date(currentYear, currentMonth, 1);
    
    let targetRow = -1;
    for (let row = 4; row < 104; row++) {
      const dateDue = propertySheet.getRange(row, 7).getValue();
      if (!dateDue || dateDue === '' || dateDue === 'EXPENSES') break;
      
      let dueDate = dateDue;
      if (typeof dueDate === 'string') {
        dueDate = new Date(dueDate);
      }
      
      if (dueDate.getMonth() === currentMonth && dueDate.getFullYear() === currentYear) {
        targetRow = row;
        break;
      }
    }
    
    if (targetRow === -1) {
      targetRow = 4;
      for (let row = 4; row < 104; row++) {
        const dateDue = propertySheet.getRange(row, 7).getValue();
        if (!dateDue || dateDue === '') {
          targetRow = row;
          break;
        }
      }
      propertySheet.getRange(targetRow, 7).setValue(firstOfMonth);
      propertySheet.getRange(targetRow, 9).setValue(parseFloat(property.monthlyRent));
    }
    
    // Set late fee to 0 and add note
    propertySheet.getRange(targetRow, 10).setValue(0);
    const currentNotes = propertySheet.getRange(targetRow, 15).getValue() || '';
    const newNotes = currentNotes + (currentNotes ? '; ' : '') + `Late fee waived: ${reason} (${new Date().toLocaleDateString()})`;
    propertySheet.getRange(targetRow, 15).setValue(newNotes);
    
    const rent = propertySheet.getRange(targetRow, 9).getValue();
    propertySheet.getRange(targetRow, 11).setValue(rent);
    
    const waiveResult = {
      success: true,
      message: 'Late fee waived successfully'
    };
    
    if (waiveResult.success) {
      // Send notification email to tenant
      if (property.tenantEmail) {
        const emailSubject = `Good Deed Month - Late Fee Waived - ${property.propertyName}`;
        const emailBody = `
          <h2>Good Deed Month - Late Fee Waived!</h2>
          <p>Hello ${property.tenantName || 'Tenant'},</p>
          <p>Congratulations! We're waiving your late fee for this month as a reward for your excellent payment history.</p>
          <p><strong>Payment Streak:</strong> ${streakData.onTimeCount} months of on-time payments</p>
          <p><strong>Property:</strong> ${property.propertyName}</p>
          <p>Thank you for being a responsible tenant! Keep up the great work.</p>
          <hr>
          <p><small>This is an automated message from McAfee Properties.</small></p>
        `;
        
        MailApp.sendEmail({
          to: property.tenantEmail,
          subject: emailSubject,
          htmlBody: emailBody
        });
      }
    }
    
    return waiveResult;
    
  } catch (error) {
    Logger.log('handleGoodDeedMonth error: ' + error.toString());
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

/**
 * Get available storage units for signup
 */
function handleGetAvailableStorageUnits() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const storageUnitsSheet = getOrCreateStorageUnitsSheet(spreadsheet);
    
    if (!storageUnitsSheet) {
      return createJsonResponse({
        success: true,
        units: []
      });
    }
    
    const data = storageUnitsSheet.getDataRange().getValues();
    if (data.length < 2) {
      return createJsonResponse({
        success: true,
        units: []
      });
    }
    
    const headers = data[0];
    const colMap = {};
    headers.forEach((header, index) => {
      colMap[header] = index;
    });
    
    const availableUnits = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const unitNumber = row[colMap['Unit Number']] || '';
      const status = (row[colMap['Status']] || '').toString().toLowerCase();
      const tenantEmail = (row[colMap['Tenant Email']] || '').toString().trim();
      
      // Unit is available if status is empty, 'vacant', or no tenant email
      const isAvailable = (!status || status === 'vacant' || status === 'available') && !tenantEmail;
      
      if (unitNumber) {
        availableUnits.push({
          unitId: unitNumber,
          unitNumber: unitNumber,
          available: isAvailable,
          size: row[colMap['Size']] || '',
          monthlyRent: parseFloat(row[colMap['Monthly Rent']]) || 0
        });
      }
    }
    
    return createJsonResponse({
      success: true,
      units: availableUnits
    });
    
  } catch (error) {
    Logger.log('handleGetAvailableStorageUnits error: ' + error.toString());
    return createJsonResponse({
      success: false,
      message: error.toString(),
      units: []
    });
  }
}

/**
 * Create all storage units in bulk - RUN THIS FUNCTION FROM SCRIPT EDITOR
 * Creates 43 units total: 20 units of 14x42 at $250/month and 23 units of 10x10 at $150/month
 * 
 * INSTRUCTIONS:
 * 1. Open Google Apps Script Editor
 * 2. Select "createAllStorageUnits" from the function dropdown
 * 3. Click the Run button (▶)
 * 4. Check the execution log for results
 * 
 * This function will:
 * - Create 20 units of 14x42 at $250/month (SU-01 through SU-20)
 * - Create 23 units of 10x10 at $150/month (SU-21 through SU-43)
 * - Skip any units that already exist
 * - Create individual sheets for each unit
 */
function createAllStorageUnits() {
  try {
    const result = handleCreateStorageUnits();
    const response = JSON.parse(result.getContent());
    
    Logger.log('========================================');
    Logger.log('STORAGE UNIT CREATION COMPLETE');
    Logger.log('========================================');
    Logger.log(`Total units to create: ${response.total || 43}`);
    Logger.log(`Units created: ${response.created || 0}`);
    Logger.log(`Units skipped (already exist): ${response.skipped || 0}`);
    Logger.log(`Message: ${response.message || ''}`);
    Logger.log('========================================');
    
    return result;
  } catch (error) {
    Logger.log('ERROR creating storage units: ' + error.toString());
    throw error;
  }
}

/**
 * Create all storage units in bulk
 * Creates 43 units total: 20 units of 14x42 at $250/month and 23 units of 10x10 at $150/month
 */
function handleCreateStorageUnits() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const masterSheet = getOrCreateMasterSheet(spreadsheet);
    
    const storageUnits = [];
    const baseAddress = 'Storage Facility'; // Update with actual address
    
    // Determine how many of each size (user said 43 total, but didn't specify breakdown)
    // We'll create a mix - let's say 20 units of 14x42 and 23 units of 10x10 = 43 total
    // User can adjust these numbers if needed
    const units14x42 = 20; // $250/month
    const units10x10 = 23; // $150/month
    let unitCounter = 1;
    
    // Create 14x42 units ($250/month)
    for (let i = 0; i < units14x42; i++) {
      const unitNumber = 'SU-' + String(unitCounter).padStart(2, '0');
      storageUnits.push({
        propertyType: 'Storage Unit',
        propertyName: `Storage Unit ${unitNumber}`,
        unitNumber: unitNumber,
        size: '14x42',
        address: baseAddress,
        monthlyRent: 250, // $250/month
        powerIncluded: false, // Default no power
        tenantName: '',
        tenantEmail: '',
        tenantPhone: '',
        status: 'Vacant'
      });
      unitCounter++;
    }
    
    // Create 10x10 units ($150/month)
    for (let i = 0; i < units10x10; i++) {
      const unitNumber = 'SU-' + String(unitCounter).padStart(2, '0');
      storageUnits.push({
        propertyType: 'Storage Unit',
        propertyName: `Storage Unit ${unitNumber}`,
        unitNumber: unitNumber,
        size: '10x10',
        address: baseAddress,
        monthlyRent: 150, // $150/month
        powerIncluded: false, // Default no power
        gateCode: '', // Gate code (set manually or via automation)
        tenantName: '',
        tenantEmail: '',
        tenantPhone: '',
        status: 'Vacant'
      });
      unitCounter++;
    }
    
    // Check which units already exist
    const existingRows = masterSheet.getDataRange().getValues();
    const existingUnitNumbers = new Set();
    const headers = existingRows[0];
    const unitNumberCol = headers.indexOf('Unit Number');
    
    if (unitNumberCol >= 0) {
      for (let i = 1; i < existingRows.length; i++) {
        const unitNum = existingRows[i][unitNumberCol];
        if (unitNum) {
          existingUnitNumbers.add(unitNum.toString());
        }
      }
    }
    
    // Add only new units
    let created = 0;
    let skipped = 0;
    
    for (const unit of storageUnits) {
      if (existingUnitNumbers.has(unit.unitNumber)) {
        skipped++;
        continue;
      }
      
      const propertyId = generateId();
      const newRow = [
        propertyId,
        unit.propertyType,
        unit.propertyName,
        unit.unitNumber,
        unit.size,
        unit.address,
        unit.monthlyRent,
        unit.powerIncluded || false, // Power Included
        unit.tenantName,
        unit.tenantEmail,
        unit.tenantPhone,
        unit.status,
        new Date().toISOString()
      ];
      
      masterSheet.appendRow(newRow);
      
      // Add to consolidated Storage Units sheet
      addUnitToStorageUnitsSheet(spreadsheet, unit);
      
      created++;
    }
    
    return createJsonResponse({
      success: true,
      message: `Created ${created} storage units. ${skipped} already existed.`,
      created: created,
      skipped: skipped,
      total: storageUnits.length
    });
    
  } catch (error) {
    Logger.log('handleCreateStorageUnits error: ' + error.toString());
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

/**
 * Get or create the consolidated Storage Units sheet
 */
function getOrCreateStorageUnitsSheet(spreadsheet) {
  let sheet = spreadsheet.getSheetByName('Storage Units');
  
  if (!sheet) {
    // Create the sheet
    sheet = spreadsheet.insertSheet('Storage Units');
    
    // Set up headers
    const headers = [
      'Unit Number',
      'Size',
      'Monthly Rent',
      'Power Included',
      'Gate Code',
      'Tenant Name',
      'Tenant Email',
      'Tenant Phone',
      'Status',
      'Property ID',
      'Lease Start Date',
      'Lease End Date',
      'Auto-Renewal',
      'Insurance Type',
      'Insurance Document URL',
      'Insurance Expiration Date',
      'Insurance Policy Number',
      'Emergency Contact Name',
      'Emergency Contact Phone',
      'Emergency Contact Relation',
      'License Plate',
      'Vehicle Color',
      'Payment Method ID',
      'Autopay Enabled',
      'Stripe Customer ID',
      'Stripe Subscription ID',
      'Created Date',
      'Notes'
    ];
    
    // Format header row
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#1e40af')
      .setFontColor('#ffffff')
      .setFontSize(12);
    
    // Freeze header row
    sheet.setFrozenRows(1);
    
    // Set column widths
    sheet.setColumnWidth(1, 100); // Unit Number
    sheet.setColumnWidth(2, 80);  // Size
    sheet.setColumnWidth(3, 120); // Monthly Rent
    sheet.setColumnWidth(4, 120); // Power Included
    sheet.setColumnWidth(5, 100); // Gate Code
    sheet.setColumnWidth(6, 150); // Tenant Name
    sheet.setColumnWidth(7, 200); // Tenant Email
    sheet.setColumnWidth(8, 130); // Tenant Phone
    sheet.setColumnWidth(9, 100); // Status
    sheet.setColumnWidth(10, 200); // Property ID
    sheet.setColumnWidth(11, 130); // Lease Start Date
    sheet.setColumnWidth(12, 130); // Lease End Date
    sheet.setColumnWidth(13, 120); // Auto-Renewal
    sheet.setColumnWidth(14, 120); // Insurance Type
    sheet.setColumnWidth(15, 250); // Insurance Document URL
    sheet.setColumnWidth(16, 130); // Insurance Expiration Date
    sheet.setColumnWidth(17, 150); // Insurance Policy Number
    sheet.setColumnWidth(18, 150); // Emergency Contact Name
    sheet.setColumnWidth(19, 130); // Emergency Contact Phone
    sheet.setColumnWidth(20, 120); // Emergency Contact Relation
    sheet.setColumnWidth(21, 120); // License Plate
    sheet.setColumnWidth(22, 120); // Vehicle Color
    sheet.setColumnWidth(23, 200); // Payment Method ID
    sheet.setColumnWidth(24, 120); // Autopay Enabled
    sheet.setColumnWidth(25, 200); // Stripe Customer ID
    sheet.setColumnWidth(26, 200); // Stripe Subscription ID
    sheet.setColumnWidth(27, 150); // Created Date
    sheet.setColumnWidth(28, 300); // Notes
    
    // Format columns
    sheet.getRange(2, 3, 1000, 1).setNumberFormat('$#,##0.00'); // Monthly Rent
    sheet.getRange(2, 4, 1000, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireCheckbox().build()
    ); // Power Included checkbox
    sheet.getRange(2, 11, 1000, 2).setNumberFormat('mm/dd/yyyy'); // Lease dates
    sheet.getRange(2, 13, 1000, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireCheckbox().build()
    ); // Auto-Renewal checkbox
    sheet.getRange(2, 16, 1000, 1).setNumberFormat('mm/dd/yyyy'); // Insurance Expiration
    sheet.getRange(2, 24, 1000, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireCheckbox().build()
    ); // Autopay Enabled checkbox
    sheet.getRange(2, 27, 1000, 1).setNumberFormat('mm/dd/yyyy'); // Created Date
    
    SpreadsheetApp.flush();
  }
  
  return sheet;
}

/**
 * Add a unit to the consolidated Storage Units sheet
 */
function addUnitToStorageUnitsSheet(spreadsheet, unitData) {
  try {
    const sheet = getOrCreateStorageUnitsSheet(spreadsheet);
    
    // Check if unit already exists
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === unitData.unitNumber) {
        return; // Unit already exists
      }
    }
    
    // Add new row with all fields
    const newRow = [
      unitData.unitNumber || '',
      unitData.size || '',
      parseFloat(unitData.monthlyRent || 0),
      unitData.powerIncluded || false,
      unitData.gateCode || '',
      unitData.tenantName || '',
      unitData.tenantEmail || '',
      unitData.tenantPhone || '',
      unitData.status || 'Vacant',
      unitData.propertyId || '',
      unitData.leaseStartDate || '',
      unitData.leaseEndDate || '',
      unitData.autoRenewal || false,
      unitData.insuranceType || '',
      unitData.insuranceDocumentUrl || '',
      unitData.insuranceExpirationDate || '',
      unitData.insurancePolicyNumber || '',
      unitData.emergencyContactName || '',
      unitData.emergencyContactPhone || '',
      unitData.emergencyContactRelation || '',
      unitData.licensePlate || '',
      unitData.vehicleColor || '',
      unitData.paymentMethodId || '',
      unitData.autopayEnabled || false,
      unitData.stripeCustomerId || '',
      unitData.stripeSubscriptionId || '',
      new Date(),
      unitData.notes || ''
    ];
    
    sheet.appendRow(newRow);
    SpreadsheetApp.flush();
    
  } catch (error) {
    Logger.log('addUnitToStorageUnitsSheet error: ' + error.toString());
  }
}

/**
 * Get or create the Storage Unit Payments sheet for payment history
 */
function getOrCreateStorageUnitPaymentsSheet(spreadsheet) {
  let sheet = spreadsheet.getSheetByName('Storage Unit Payments');
  
  if (!sheet) {
    sheet = spreadsheet.insertSheet('Storage Unit Payments');
    
    const headers = [
      'Unit Number',
      'Date Due',
      'Date Paid',
      'Rent',
      'Late Fee',
      'Total',
      'Method',
      'Status',
      'Stripe ID',
      'Notes'
    ];
    
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#1e40af')
      .setFontColor('#ffffff')
      .setFontSize(12);
    
    sheet.setFrozenRows(1);
    sheet.getRange(2, 2, 1000, 2).setNumberFormat('mm/dd/yyyy'); // Date columns
    sheet.getRange(2, 4, 1000, 3).setNumberFormat('$#,##0.00'); // Money columns
    
    SpreadsheetApp.flush();
  }
  
  return sheet;
}

/**
 * Add a payment record for a storage unit
 */
function addStorageUnitPayment(spreadsheet, unitNumber, paymentData) {
  try {
    const sheet = getOrCreateStorageUnitPaymentsSheet(spreadsheet);
    
    const newRow = [
      unitNumber,
      paymentData.dateDue || new Date(),
      paymentData.datePaid || '',
      paymentData.rent || 0,
      paymentData.lateFee || 0,
      paymentData.total || 0,
      paymentData.method || '',
      paymentData.status || 'Pending',
      paymentData.stripeId || '',
      paymentData.notes || ''
    ];
    
    sheet.appendRow(newRow);
    SpreadsheetApp.flush();
    
  } catch (error) {
    Logger.log('addStorageUnitPayment error: ' + error.toString());
  }
}

/**
 * Upload insurance document to Google Drive
 */
function uploadInsuranceDocument(email, unitNumber, fileData, fileName) {
  try {
    // Get or create customer folder
    const parentFolder = DriveApp.getFolderById(STORAGE_DOCUMENTS_FOLDER_ID);
    const folderName = `${unitNumber} - ${email}`;
    
    let customerFolder;
    const existingFolders = parentFolder.getFoldersByName(folderName);
    if (existingFolders.hasNext()) {
      customerFolder = existingFolders.next();
    } else {
      customerFolder = parentFolder.createFolder(folderName);
    }
    
    // Upload file
    const blob = Utilities.newBlob(fileData, 'application/pdf', fileName);
    const file = customerFolder.createFile(blob);
    
    // Make file viewable by anyone with link (or set specific permissions)
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return file.getId();
    
  } catch (error) {
    Logger.log('uploadInsuranceDocument error: ' + error.toString());
    return null;
  }
}

/**
 * Update storage unit in consolidated sheet
 */
function updateStorageUnitInSheet(spreadsheet, unitNumber, updates) {
  try {
    const sheet = getOrCreateStorageUnitsSheet(spreadsheet);
    const data = sheet.getDataRange().getValues();
    const unitNumberCol = 0; // Column A
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][unitNumberCol] === unitNumber) {
        const row = i + 1;
        const headers = data[0];
        
        // Map column names to indices
        const colMap = {};
        headers.forEach((header, index) => {
          colMap[header] = index;
        });
        
        // Update each field
        if (updates.gateCode !== undefined && colMap['Gate Code'] !== undefined) {
          sheet.getRange(row, colMap['Gate Code'] + 1).setValue(updates.gateCode);
        }
        if (updates.tenantName !== undefined && colMap['Tenant Name'] !== undefined) {
          sheet.getRange(row, colMap['Tenant Name'] + 1).setValue(updates.tenantName);
        }
        if (updates.tenantEmail !== undefined && colMap['Tenant Email'] !== undefined) {
          sheet.getRange(row, colMap['Tenant Email'] + 1).setValue(updates.tenantEmail);
        }
        if (updates.tenantPhone !== undefined && colMap['Tenant Phone'] !== undefined) {
          sheet.getRange(row, colMap['Tenant Phone'] + 1).setValue(updates.tenantPhone);
        }
        if (updates.status !== undefined && colMap['Status'] !== undefined) {
          sheet.getRange(row, colMap['Status'] + 1).setValue(updates.status);
        }
        if (updates.insuranceType !== undefined && colMap['Insurance Type'] !== undefined) {
          sheet.getRange(row, colMap['Insurance Type'] + 1).setValue(updates.insuranceType);
        }
        if (updates.insuranceDocumentUrl !== undefined && colMap['Insurance Document URL'] !== undefined) {
          sheet.getRange(row, colMap['Insurance Document URL'] + 1).setValue(updates.insuranceDocumentUrl);
        }
        if (updates.insuranceExpirationDate !== undefined && colMap['Insurance Expiration Date'] !== undefined) {
          sheet.getRange(row, colMap['Insurance Expiration Date'] + 1).setValue(updates.insuranceExpirationDate);
        }
        if (updates.insurancePolicyNumber !== undefined && colMap['Insurance Policy Number'] !== undefined) {
          sheet.getRange(row, colMap['Insurance Policy Number'] + 1).setValue(updates.insurancePolicyNumber);
        }
        if (updates.leaseStartDate !== undefined && colMap['Lease Start Date'] !== undefined) {
          sheet.getRange(row, colMap['Lease Start Date'] + 1).setValue(updates.leaseStartDate);
        }
        if (updates.leaseEndDate !== undefined && colMap['Lease End Date'] !== undefined) {
          sheet.getRange(row, colMap['Lease End Date'] + 1).setValue(updates.leaseEndDate);
        }
        if (updates.emergencyContactName !== undefined && colMap['Emergency Contact Name'] !== undefined) {
          sheet.getRange(row, colMap['Emergency Contact Name'] + 1).setValue(updates.emergencyContactName);
        }
        if (updates.emergencyContactPhone !== undefined && colMap['Emergency Contact Phone'] !== undefined) {
          sheet.getRange(row, colMap['Emergency Contact Phone'] + 1).setValue(updates.emergencyContactPhone);
        }
        if (updates.emergencyContactRelation !== undefined && colMap['Emergency Contact Relation'] !== undefined) {
          sheet.getRange(row, colMap['Emergency Contact Relation'] + 1).setValue(updates.emergencyContactRelation);
        }
        if (updates.monthlyRent !== undefined && colMap['Monthly Rent'] !== undefined) {
          sheet.getRange(row, colMap['Monthly Rent'] + 1).setValue(updates.monthlyRent).setNumberFormat('$#,##0.00');
        }
        if (updates.autopayEnabled !== undefined && colMap['Autopay Enabled'] !== undefined) {
          sheet.getRange(row, colMap['Autopay Enabled'] + 1).setValue(updates.autopayEnabled);
        }
        if (updates.stripeCustomerId !== undefined && colMap['Stripe Customer ID'] !== undefined) {
          sheet.getRange(row, colMap['Stripe Customer ID'] + 1).setValue(updates.stripeCustomerId);
        }
        if (updates.stripeSubscriptionId !== undefined && colMap['Stripe Subscription ID'] !== undefined) {
          sheet.getRange(row, colMap['Stripe Subscription ID'] + 1).setValue(updates.stripeSubscriptionId);
        }
        
        SpreadsheetApp.flush();
        return true;
      }
    }
    
    return false;
  } catch (error) {
    Logger.log('updateStorageUnitInSheet error: ' + error.toString());
    return false;
  }
}

/**
 * Send storage unit signup confirmation email with gate code
 */
function sendStorageSignupConfirmation(email, name, unitNumber, gateCode, startDate, proratedAmount, monthlyTotal, insuranceType, licensePlate, vehicleColor) {
  try {
    const portalUrl = ScriptApp.getService().getUrl() + '?action=tenantPortal';
    
    const subject = 'Welcome to Armory Storage - Unit ' + unitNumber + ' Confirmation';
    const htmlBody = `
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
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); padding: 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700;">Welcome to Armory Storage</h1>
              <p style="margin: 10px 0 0 0; color: #e0e7ff; font-size: 18px;">Your Storage Unit Rental Confirmation</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.6;">Hi ${name || 'there'},</p>
              <p style="margin: 0 0 30px 0; color: #374151; font-size: 16px; line-height: 1.6;">Thank you for choosing Armory Storage! Your storage unit rental has been confirmed.</p>
              
              <div style="background-color: #f0f9ff; border: 2px solid #0284c7; border-radius: 8px; padding: 25px; margin: 30px 0;">
                <h2 style="margin: 0 0 20px 0; color: #0369a1; font-size: 20px;">Unit Information</h2>
                <table width="100%" cellpadding="8">
                  <tr>
                    <td style="color: #374151; font-weight: 600;">Unit Number:</td>
                    <td style="color: #0369a1; font-weight: 700; font-size: 18px;">${unitNumber}</td>
                  </tr>
                  <tr>
                    <td style="color: #374151; font-weight: 600;">Start Date:</td>
                    <td style="color: #374151;">${Utilities.formatDate(startDate, Session.getScriptTimeZone(), 'MMMM dd, yyyy')}</td>
                  </tr>
                  <tr>
                    <td style="color: #374151; font-weight: 600;">Monthly Rent:</td>
                    <td style="color: #374151;">$${monthlyTotal.toFixed(2)}/month</td>
                  </tr>
                  <tr>
                    <td style="color: #374151; font-weight: 600;">Insurance:</td>
                    <td style="color: #374151;">${insuranceType === 'Paid' ? 'Included ($25/month)' : 'Own Insurance'}</td>
                  </tr>
                </table>
              </div>
              
              <div style="background-color: #fef3c7; border: 2px solid #f59e0b; border-radius: 8px; padding: 25px; margin: 30px 0; text-align: center;">
                <p style="margin: 0 0 10px 0; color: #92400e; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Your Gate Code</p>
                <p style="margin: 0; color: #b45309; font-size: 48px; font-weight: 700; letter-spacing: 4px; font-family: 'Courier New', monospace;">${gateCode}</p>
                <p style="margin: 15px 0 0 0; color: #92400e; font-size: 14px;">Use this code to access the facility</p>
              </div>
              
              <div style="background-color: #ecfdf5; border: 2px solid #10b981; border-radius: 8px; padding: 25px; margin: 30px 0;">
                <h3 style="margin: 0 0 15px 0; color: #047857; font-size: 18px;">First Payment</h3>
                <p style="margin: 0 0 10px 0; color: #374151;">Your prorated first month payment is:</p>
                <p style="margin: 0; color: #047857; font-size: 24px; font-weight: 700;">$${proratedAmount.toFixed(2)}</p>
              </div>
              
              <div style="margin: 30px 0; padding: 20px; background-color: #f9fafb; border-radius: 8px;">
                <h3 style="margin: 0 0 15px 0; color: #374151; font-size: 18px;">Access Your Portal</h3>
                <p style="margin: 0 0 20px 0; color: #6b7280; font-size: 14px; line-height: 1.6;">Log in to your customer portal to view payment history, update account information, and manage your storage unit.</p>
                <a href="${portalUrl}" style="display: inline-block; padding: 12px 30px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">Access Customer Portal</a>
              </div>
              
              <div style="margin-top: 30px; padding-top: 30px; border-top: 2px solid #e5e7eb;">
                <h3 style="margin: 0 0 20px 0; color: #374151; font-size: 20px; font-weight: 700;">Payment & Access Rules</h3>
                
                <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin-bottom: 20px;">
                  <h4 style="margin: 0 0 10px 0; color: #92400e; font-size: 16px; font-weight: 700;">📅 Payment Due Dates</h4>
                  <p style="margin: 0; color: #78350f; font-size: 14px; line-height: 1.6;">
                    All payments for storage are due on the <strong>1st of every month</strong>. Your monthly rent is <strong>$${monthlyTotal.toFixed(2)}</strong>.
                  </p>
                </div>
                
                <div style="background-color: #fee2e2; border-left: 4px solid #ef4444; padding: 16px; margin-bottom: 20px;">
                  <h4 style="margin: 0 0 10px 0; color: #991b1b; font-size: 16px; font-weight: 700;">⏰ Late Payment Policy</h4>
                  <ul style="margin: 0; padding-left: 20px; color: #7f1d1d; font-size: 14px; line-height: 1.8;">
                    <li><strong>Access will be disabled at 12:00 midnight</strong> on the day your payment is late</li>
                    <li>A <strong>$30 late fee</strong> will be charged on the <strong>3rd day</strong> after the due date</li>
                    <li>To restore access, you must pay the full amount including the late fee</li>
                  </ul>
                </div>
                
                <div style="background-color: #dcfce7; border-left: 4px solid #10b981; padding: 16px; margin-bottom: 20px;">
                  <h4 style="margin: 0 0 10px 0; color: #065f46; font-size: 16px; font-weight: 700;">💳 Autopay Setup</h4>
                  <p style="margin: 0; color: #064e3b; font-size: 14px; line-height: 1.6;">
                    We strongly recommend setting up autopay to avoid late fees and access interruptions. You can set up autopay in your customer portal after logging in.
                  </p>
                </div>
                
                <div style="background-color: #f3f4f6; border-left: 4px solid #6b7280; padding: 16px; margin-bottom: 20px;">
                  <h4 style="margin: 0 0 10px 0; color: #374151; font-size: 16px; font-weight: 700;">⚠️ Non-Payment</h4>
                  <p style="margin: 0; color: #4b5563; font-size: 14px; line-height: 1.6;">
                    Units with outstanding balances may be subject to auction through <strong>StorageAuctions.com</strong> in accordance with state law. Please keep your account current.
                  </p>
                </div>
                
                <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                  <h4 style="margin: 0 0 15px 0; color: #374151; font-size: 18px;">Vehicle Information</h4>
                  <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;"><strong>License Plate:</strong> ${licensePlate || 'N/A'}</p>
                  <p style="margin: 0 0 15px 0; color: #6b7280; font-size: 14px;"><strong>Vehicle Color:</strong> ${vehicleColor || 'N/A'}</p>
                  <p style="margin: 0; color: #9ca3af; font-size: 12px;">This information is used for facility access via license plate readers for the safeguarding of our customers.</p>
                </div>
                
                <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                  <h4 style="margin: 0 0 15px 0; color: #374151; font-size: 18px;">Other Important Reminders</h4>
                  <ul style="margin: 0; padding-left: 20px; color: #6b7280; font-size: 14px; line-height: 1.8;">
                    <li>Save your gate code in a safe place: <strong style="font-family: monospace; font-size: 16px;">${gateCode}</strong></li>
                    <li>Keep your insurance information up to date in your portal</li>
                    <li>Update your vehicle information if you change vehicles</li>
                    <li>Contact us immediately if you need to update your payment method</li>
                  </ul>
                </div>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f9fafb; padding: 30px 40px; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 12px;">© ${new Date().getFullYear()} Armory Storage. All rights reserved.</p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">If you have any questions, please contact us through your customer portal.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
    
    MailApp.sendEmail({
      to: email,
      subject: subject,
      htmlBody: htmlBody
    });
    
    Logger.log('Storage signup confirmation email sent to: ' + email);
    
  } catch (error) {
    Logger.log('sendStorageSignupConfirmation error: ' + error.toString());
    throw error;
  }
}

/**
 * Setup autopay for storage unit using Stripe Subscriptions
 */
function handleSetupStorageAutopay(data) {
  try {
    const email = (data.email || '').toLowerCase().trim();
    const unitNumber = (data.unitNumber || '').trim();
    
    if (!email || !unitNumber) {
      return createJsonResponse({
        success: false,
        message: 'Email and unit number are required'
      });
    }
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const storageUnitsSheet = getOrCreateStorageUnitsSheet(spreadsheet);
    const dataRows = storageUnitsSheet.getDataRange().getValues();
    const headers = dataRows[0];
    const colMap = {};
    headers.forEach((header, index) => {
      colMap[header] = index;
    });
    
    // Find the storage unit
    let unitRow = -1;
    for (let i = 1; i < dataRows.length; i++) {
      if (dataRows[i][colMap['Unit Number']] === unitNumber && 
          (dataRows[i][colMap['Tenant Email']] || '').toLowerCase().trim() === email) {
        unitRow = i;
        break;
      }
    }
    
    if (unitRow === -1) {
      return createJsonResponse({
        success: false,
        message: 'Storage unit not found'
      });
    }
    
    const row = dataRows[unitRow];
    const monthlyRent = parseFloat(row[colMap['Monthly Rent']]) || 0;
    const amountInCents = Math.round(monthlyRent * 100);
    const webAppUrl = ScriptApp.getService().getUrl();
    
    // Get or create Stripe customer
    let customerId = row[colMap['Stripe Customer ID']] || '';
    if (!customerId) {
      // Search for existing customer by email
      const searchOptions = {
        method: 'get',
        headers: {
          'Authorization': 'Bearer ' + STRIPE_SECRET_KEY
        },
        muteHttpExceptions: true
      };
      
      const searchResponse = UrlFetchApp.fetch(STRIPE_API_URL + '/customers/search?query=email:\'' + email + '\'', searchOptions);
      const searchData = JSON.parse(searchResponse.getContentText());
      
      if (searchData.data && searchData.data.length > 0) {
        customerId = searchData.data[0].id;
      } else {
        // Create new customer
        const createPayload = [
          'email=' + encodeURIComponent(email),
          'metadata[unit_number]=' + unitNumber
        ].join('&');
        
        const createOptions = {
          method: 'post',
          headers: {
            'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          payload: createPayload,
          muteHttpExceptions: true
        };
        
        const createResponse = UrlFetchApp.fetch(STRIPE_API_URL + '/customers', createOptions);
        const customerData = JSON.parse(createResponse.getContentText());
        customerId = customerData.id;
      }
      
      // Update storage unit sheet with customer ID
      if (customerId) {
        storageUnitsSheet.getRange(unitRow + 1, colMap['Stripe Customer ID'] + 1).setValue(customerId);
        SpreadsheetApp.flush();
      }
    }
    
    // Create price for subscription
    const pricePayload = [
      'currency=usd',
      'unit_amount=' + amountInCents,
      'recurring[interval]=month',
      'recurring[interval_count]=1',
      'product_data[name]=' + encodeURIComponent('Storage Unit ' + unitNumber + ' - Monthly Rent'),
      'product_data[metadata][unit_number]=' + unitNumber
    ].join('&');
    
    const priceOptions = {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      payload: pricePayload,
      muteHttpExceptions: true
    };
    
    const priceResponse = UrlFetchApp.fetch(STRIPE_API_URL + '/prices', priceOptions);
    const priceData = JSON.parse(priceResponse.getContentText());
    
    if (!priceData.id) {
      return createJsonResponse({
        success: false,
        message: 'Failed to create subscription price'
      });
    }
    
    // Create Checkout Session for subscription
    const checkoutPayload = [
      'payment_method_types[]=card',
      'line_items[0][price]=' + priceData.id,
      'line_items[0][quantity]=1',
      'mode=subscription',
      'success_url=' + encodeURIComponent(webAppUrl + '?action=tenantPortal&email=' + encodeURIComponent(email) + '&autopay=success'),
      'cancel_url=' + encodeURIComponent(webAppUrl + '?action=tenantPortal&email=' + encodeURIComponent(email) + '&autopay=cancelled'),
      'customer=' + customerId,
      'metadata[unit_number]=' + unitNumber,
      'subscription_data[metadata][unit_number]=' + unitNumber
    ].join('&');
    
    const checkoutOptions = {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      payload: checkoutPayload,
      muteHttpExceptions: true
    };
    
    const checkoutResponse = UrlFetchApp.fetch(STRIPE_API_URL + '/checkout/sessions', checkoutOptions);
    const checkoutData = JSON.parse(checkoutResponse.getContentText());
    
    if (checkoutData.id && checkoutData.url) {
      return createJsonResponse({
        success: true,
        checkoutUrl: checkoutData.url,
        sessionId: checkoutData.id
      });
    } else {
      return createJsonResponse({
        success: false,
        message: 'Failed to create checkout session'
      });
    }
    
  } catch (error) {
    Logger.log('handleSetupStorageAutopay error: ' + error.toString());
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

/**
 * Get storage unit details by email
 */
function handleGetStorageUnitDetails(data) {
  try {
    const email = (data.email || '').toLowerCase().trim();
    
    if (!email) {
      return createJsonResponse({
        success: false,
        message: 'Email is required'
      });
    }
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const storageUnitsSheet = getOrCreateStorageUnitsSheet(spreadsheet);
    const dataRows = storageUnitsSheet.getDataRange().getValues();
    const headers = dataRows[0];
    const colMap = {};
    headers.forEach((header, index) => {
      colMap[header] = index;
    });
    
    // Find unit by email
    for (let i = 1; i < dataRows.length; i++) {
      const row = dataRows[i];
      const tenantEmail = (row[colMap['Tenant Email']] || '').toLowerCase().trim();
      if (tenantEmail === email && row[colMap['Status']] === 'Occupied') {
        return createJsonResponse({
          success: true,
          unit: {
            unitNumber: row[colMap['Unit Number']],
            size: row[colMap['Size']],
            monthlyRent: row[colMap['Monthly Rent']],
            gateCode: row[colMap['Gate Code']],
            powerIncluded: row[colMap['Power Included']],
            leaseStartDate: row[colMap['Lease Start Date']],
            leaseEndDate: row[colMap['Lease End Date']],
            autoRenewal: row[colMap['Auto-Renewal']],
            insuranceType: row[colMap['Insurance Type']],
            autopayEnabled: row[colMap['Autopay Enabled']],
            stripeSubscriptionId: row[colMap['Stripe Subscription ID']],
            licensePlate: row[colMap['License Plate']] || '',
            vehicleColor: row[colMap['Vehicle Color']] || '',
            emergencyContactName: row[colMap['Emergency Contact Name']] || '',
            emergencyContactPhone: row[colMap['Emergency Contact Phone']] || '',
            emergencyContactRelation: row[colMap['Emergency Contact Relation']] || '',
            stripeCustomerId: row[colMap['Stripe Customer ID']] || ''
          }
        });
      }
    }
    
    return createJsonResponse({
      success: false,
      message: 'Storage unit not found'
    });
    
  } catch (error) {
    Logger.log('handleGetStorageUnitDetails error: ' + error.toString());
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

/**
 * Get payment history for storage unit
 */
function handleGetStoragePaymentHistory(data) {
  try {
    const email = (data.email || '').toLowerCase().trim();
    const unitNumber = data.unitNumber;
    
    if (!email) {
      return createJsonResponse({
        success: false,
        message: 'Email is required'
      });
    }
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const paymentsSheet = getOrCreateStorageUnitPaymentsSheet(spreadsheet);
    const dataRows = paymentsSheet.getDataRange().getValues();
    
    if (dataRows.length < 2) {
      return createJsonResponse({
        success: true,
        payments: []
      });
    }
    
    // If unitNumber provided, filter by it; otherwise find unit by email
    let targetUnitNumber = unitNumber;
    if (!targetUnitNumber) {
      const storageUnitsSheet = getOrCreateStorageUnitsSheet(spreadsheet);
      const unitRows = storageUnitsSheet.getDataRange().getValues();
      const unitHeaders = unitRows[0];
      const unitColMap = {};
      unitHeaders.forEach((header, index) => {
        unitColMap[header] = index;
      });
      
      for (let i = 1; i < unitRows.length; i++) {
        const row = unitRows[i];
        if ((row[unitColMap['Tenant Email']] || '').toLowerCase().trim() === email) {
          targetUnitNumber = row[unitColMap['Unit Number']];
          break;
        }
      }
    }
    
    if (!targetUnitNumber) {
      return createJsonResponse({
        success: true,
        payments: []
      });
    }
    
    const headers = dataRows[0];
    const unitNumberCol = headers.indexOf('Unit Number');
    const payments = [];
    
    for (let i = 1; i < dataRows.length; i++) {
      const row = dataRows[i];
      if (row[unitNumberCol] === targetUnitNumber) {
        payments.push({
          dateDue: row[headers.indexOf('Date Due')],
          datePaid: row[headers.indexOf('Date Paid')],
          rent: row[headers.indexOf('Rent')],
          lateFee: row[headers.indexOf('Late Fee')],
          total: row[headers.indexOf('Total')],
          method: row[headers.indexOf('Method')],
          status: row[headers.indexOf('Status')],
          stripeId: row[headers.indexOf('Stripe ID')],
          notes: row[headers.indexOf('Notes')]
        });
      }
    }
    
    // Sort by date due descending
    payments.sort((a, b) => {
      const dateA = a.dateDue ? new Date(a.dateDue).getTime() : 0;
      const dateB = b.dateDue ? new Date(b.dateDue).getTime() : 0;
      return dateB - dateA;
    });
    
    return createJsonResponse({
      success: true,
      payments: payments
    });
    
  } catch (error) {
    Logger.log('handleGetStoragePaymentHistory error: ' + error.toString());
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

/**
 * Create Stripe payment link for storage unit rent
 */
function handleCreateStoragePaymentLink(data) {
  try {
    const email = (data.email || '').toLowerCase().trim();
    const unitNumber = (data.unitNumber || '').trim();
    
    if (!email || !unitNumber) {
      return createJsonResponse({
        success: false,
        message: 'Email and unit number are required'
      });
    }
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const storageUnitsSheet = getOrCreateStorageUnitsSheet(spreadsheet);
    const dataRows = storageUnitsSheet.getDataRange().getValues();
    const headers = dataRows[0];
    const colMap = {};
    headers.forEach((header, index) => {
      colMap[header] = index;
    });
    
    // Find the storage unit
    let unitRow = -1;
    for (let i = 1; i < dataRows.length; i++) {
      if (dataRows[i][colMap['Unit Number']] === unitNumber && 
          (dataRows[i][colMap['Tenant Email']] || '').toLowerCase().trim() === email) {
        unitRow = i;
        break;
      }
    }
    
    if (unitRow === -1) {
      return createJsonResponse({
        success: false,
        message: 'Storage unit not found'
      });
    }
    
    const row = dataRows[unitRow];
    const monthlyRent = parseFloat(row[colMap['Monthly Rent']]) || 0;
    const amountInCents = Math.round(monthlyRent * 100);
    const webAppUrl = ScriptApp.getService().getUrl();
    
    // Create Stripe Checkout Session
    const payload = [
      'payment_method_types[]=card',
      'mode=payment',
      'success_url=' + encodeURIComponent(webAppUrl + '?action=tenantPortal&email=' + encodeURIComponent(email) + '&payment=success'),
      'cancel_url=' + encodeURIComponent(webAppUrl + '?action=tenantPortal&email=' + encodeURIComponent(email) + '&payment=cancelled'),
      'line_items[0][price_data][currency]=usd',
      'line_items[0][price_data][product_data][name]=Storage Unit ' + unitNumber + ' - Monthly Rent',
      'line_items[0][price_data][unit_amount]=' + amountInCents,
      'line_items[0][quantity]=1',
      'customer_email=' + encodeURIComponent(email),
      'metadata[unit_number]=' + unitNumber,
      'metadata[payment_type]=storage_rent'
    ].join('&');
    
    const options = {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      payload: payload,
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(STRIPE_API_URL + '/checkout/sessions', options);
    const sessionData = JSON.parse(response.getContentText());
    
    if (sessionData.url) {
      return createJsonResponse({
        success: true,
        paymentUrl: sessionData.url
      });
    } else {
      return createJsonResponse({
        success: false,
        message: 'Failed to create payment link'
      });
    }
    
  } catch (error) {
    Logger.log('handleCreateStoragePaymentLink error: ' + error.toString());
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

/**
 * Handle maintenance request submission
 */
function handleSubmitMaintenanceRequest(e) {
  try {
    const formData = e.parameter || {};
    const propertyId = formData.propertyId || '';
    const propertyName = formData.propertyName || '';
    const description = formData.description || '';
    const priority = formData.priority || 'medium';
    
    // Get tenant email from property
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const masterSheet = getOrCreateMasterSheet(spreadsheet);
    const property = getPropertyById(propertyId, masterSheet);
    
    if (!property) {
      return createJsonResponse({
        success: false,
        message: 'Property not found'
      });
    }
    
    const tenantEmail = property.tenantEmail || '';
    const tenantName = property.tenantName || 'Tenant';
    
    // Handle file uploads if present (simplified - Google Apps Script has limitations with multipart/form-data)
    // For production, you might want to use base64 encoding or a different file upload approach
    let photoNote = '';
    if (e.postData && e.postData.contents) {
      photoNote = ' (Photos included in request)';
      Logger.log('Photos included in maintenance request');
    }
    
    // Create maintenance request ID
    const requestId = 'MR-' + Date.now();
    
    // Email to landlord/maintenance
    const maintenanceEmail = 'brookspumpingpoolco@gmail.com';
    const emailSubject = `Maintenance Request - ${propertyName} (${priority.toUpperCase()})`;
    
    const emailBody = `
      <h2>New Maintenance Request</h2>
      <p><strong>Request ID:</strong> ${requestId}</p>
      <p><strong>Property:</strong> ${propertyName}</p>
      <p><strong>Address:</strong> ${property.address || 'N/A'}</p>
      <p><strong>Tenant:</strong> ${tenantName} (${tenantEmail})</p>
      <p><strong>Priority:</strong> ${priority.toUpperCase()}</p>
      <p><strong>Description:</strong></p>
      <p>${description.replace(/\n/g, '<br>')}</p>
      ${photoNote ? `<p><strong>Note:</strong>${photoNote}</p>` : ''}
      <hr>
      <p><small>Submitted on ${new Date().toLocaleString()}</small></p>
    `;
    
    MailApp.sendEmail({
      to: maintenanceEmail,
      subject: emailSubject,
      htmlBody: emailBody
    });
    
    // Send confirmation email to tenant
    if (tenantEmail) {
      const confirmationSubject = `Maintenance Request Received - ${propertyName}`;
      const confirmationBody = `
        <h2>Maintenance Request Received</h2>
        <p>Hello ${tenantName},</p>
        <p>We have received your maintenance request for <strong>${propertyName}</strong>.</p>
        <p><strong>Request ID:</strong> ${requestId}</p>
        <p><strong>Priority:</strong> ${priority.toUpperCase()}</p>
        <p><strong>Description:</strong></p>
        <p>${description.replace(/\n/g, '<br>')}</p>
        <p>Our maintenance team will review your request and contact you soon. For urgent matters, please contact us directly.</p>
        <hr>
        <p><small>This is an automated confirmation. Please do not reply to this email.</small></p>
      `;
      
      MailApp.sendEmail({
        to: tenantEmail,
        subject: confirmationSubject,
        htmlBody: confirmationBody
      });
    }
    
    return createJsonResponse({
      success: true,
      message: 'Maintenance request submitted successfully',
      requestId: requestId
    });
    
  } catch (error) {
    Logger.log('handleSubmitMaintenanceRequest error: ' + error.toString());
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

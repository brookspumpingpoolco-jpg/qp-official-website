// Dashboard Web App - Google Apps Script
// Serves the Dashboard HTML interface

// Spreadsheet ID - Shared with InvoiceEstimate.gs
const SPREADSHEET_ID = '1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0';

// Dashboard Web App URL - This is the deployed Web App URL
const DASHBOARD_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycby15jSZaAfFvMdKRV6nTFFmV1-Asmzunf4x4kSPHjVmXVqrwfTBVDy_oarEKgwR_bdZ/exec';

// Authentication Script URL - Update this to match your AuthenticationScript.gs Web App URL
const AUTH_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwe79iB2_OR6xco-ycEjvPKTOaCfLwtNx44je_CBMJxUK1_ncI6s3N4JnuDw0wk4z5x/exec';

// InvoiceEstimate Script URL - For payment earnings (has spreadsheet permissions)
// IMPORTANT: Update this to match your InvoiceEstimate.gs Web App URL
// To find it: Open InvoiceEstimate.gs -> Deploy -> Manage deployments -> Copy the Web App URL
// If not set, requests will fall back to AUTH_SCRIPT_URL
const INVOICE_ESTIMATE_URL = 'https://script.google.com/macros/s/AKfycbzq732_zhGRgoA2qzImXdEC9ZeIBiKE1gCLrhjxitrIaqvSBKwr3aYk2wKMFJKl8cWsYw/exec'; // Must match the deployed InvoiceEstimate web app used by PM tasks/customer search

function doGet(e) {
  // Handle CORS preflight requests
  if (e.parameter && e.parameter.method === 'OPTIONS') {
    return ContentService.createTextOutput('');
  }
  
  // Check if this is a proxy request (fallback for POST issues)
  // Must check this FIRST before any other processing
  if (e.parameter && (e.parameter.proxy === 'true' || e.parameter.action)) {
    Logger.log('doGet: Detected proxy request, action: ' + (e.parameter.action || 'none'));
    return handleProxyRequest(e);
  }
  
  // Regular dashboard request - only serve HTML if NOT a proxy request
  // Get URL parameters from the request
  const email = e.parameter.email || '';
  const name = e.parameter.name || '';
  const role = e.parameter.role || '';
  const keepSignedIn = e.parameter.keepSignedIn || 'false';
  
  // Log for debugging
  Logger.log('Dashboard doGet - Email from URL parameter: ' + email);
  Logger.log('Dashboard doGet - Name: ' + name);
  Logger.log('Dashboard doGet - Role: ' + role);
  
  // Get the Web App URL (for proxy requests)
  // Try to get from ScriptApp first, fallback to constant
  let webAppUrl = DASHBOARD_WEB_APP_URL;
  try {
    const serviceUrl = ScriptApp.getService().getUrl();
    if (serviceUrl) {
      webAppUrl = serviceUrl;
    }
  } catch (e) {
    // If ScriptApp.getService() fails (e.g., in editor), use constant
    Logger.log('Using constant Web App URL: ' + webAppUrl);
  }
  
  // Load the HTML file as a template
  const template = HtmlService.createTemplateFromFile('Dashboard_Embed');
  
  // Pass URL parameters to the template
  // These will be available as <?= email ?>, <?= name ?>, etc. in the HTML
  template.email = email;
  template.name = name;
  template.role = role;
  template.keepSignedIn = keepSignedIn;
  template.webAppUrl = webAppUrl; // Pass the actual Web App URL
  template.invoiceEstimateUrl = INVOICE_ESTIMATE_URL; // PM tasks + customer search - must match deployed InvoiceEstimate.gs

  Logger.log('Dashboard template - Email passed to template: ' + email);
  
  // Evaluate the template and return
  return template.evaluate()
    .setTitle('Team Dashboard')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Handle proxy requests (shared between doGet and doPost)
 */
function handleProxyRequest(e) {
  try {
    Logger.log('=== handleProxyRequest called ===');
    Logger.log('Timestamp: ' + new Date().toISOString());
    Logger.log('Event object exists: ' + (e ? 'YES' : 'NO'));
    
    // Ensure e exists
    if (!e) {
      e = {};
      Logger.log('WARNING: Event object e was null/undefined');
    }
    if (!e.parameter) {
      e.parameter = {};
    }
    
    Logger.log('Parameters: ' + JSON.stringify(e.parameter));
    Logger.log('PostData exists: ' + (e.postData ? 'YES' : 'NO'));
    if (e.postData) {
      Logger.log('PostData type: ' + (e.postData.type || 'none'));
      Logger.log('PostData contents length: ' + (e.postData.contents ? e.postData.contents.length : 0));
      Logger.log('PostData preview: ' + (e.postData.contents ? e.postData.contents.substring(0, 200) : 'none'));
    }
    
    let action = '';
    const formData = {};
    
    // CRITICAL: Check postData FIRST for POST requests (most common case)
    if (e.postData && e.postData.contents) {
      const contentType = e.postData.type || '';
      Logger.log('Processing postData with contentType: ' + contentType);
      
      if (contentType.indexOf('application/x-www-form-urlencoded') !== -1 || 
          contentType.indexOf('application/json') === -1) {
        // Form-encoded data
        try {
          const params = e.postData.contents.split('&');
          Logger.log('Parsing ' + params.length + ' form parameters');
          params.forEach(param => {
            const equalIndex = param.indexOf('=');
            if (equalIndex > 0) {
              const key = param.substring(0, equalIndex);
              const value = param.substring(equalIndex + 1);
              const decodedKey = decodeURIComponent(key);
              const decodedValue = decodeURIComponent(value || '');
              if (decodedKey === 'action') {
                action = decodedValue;
                Logger.log('Action from postData: ' + action);
              } else if (decodedKey !== 'proxy') {
                formData[decodedKey] = decodedValue;
              }
            }
          });
        } catch (parseError) {
          Logger.log('Error parsing postData: ' + parseError.toString());
        }
      } else if (contentType.indexOf('application/json') !== -1) {
        // JSON data
        try {
          const jsonData = JSON.parse(e.postData.contents);
          action = jsonData.action;
          Object.keys(jsonData).forEach(key => {
            if (key !== 'action' && key !== 'proxy') {
              formData[key] = jsonData[key];
            }
          });
          Logger.log('Parsed JSON data, action: ' + action);
        } catch (parseError) {
          Logger.log('Error parsing JSON postData: ' + parseError.toString());
        }
      }
    }
    
    // Fallback: Get action from parameters (for GET requests with query params)
    if (!action && e.parameter && e.parameter.action) {
      action = e.parameter.action;
      Logger.log('Action from parameters: ' + action);
      Object.keys(e.parameter).forEach(key => {
        if (key !== 'action' && key !== 'proxy') {
          formData[key] = e.parameter[key];
        }
      });
    }
    
    if (!action) {
      Logger.log('ERROR: No action found in request');
      Logger.log('Available keys in e.parameter: ' + Object.keys(e.parameter || {}).join(', '));
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Action is required'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Handle payment earnings requests - proxy to InvoiceEstimate (has spreadsheet permissions)
    if (action === 'getStripeEarnings' || action === 'getPaymentEarnings') {
      Logger.log('Proxying payment earnings request to InvoiceEstimate...');
      Logger.log('Action: ' + action);
      Logger.log('Form data keys: ' + Object.keys(formData).join(', '));
      
      // Proxy to InvoiceEstimate Web App (has spreadsheet permissions)
      if (INVOICE_ESTIMATE_URL && INVOICE_ESTIMATE_URL.trim() !== '') {
        // Build form-encoded payload string to ensure action is included
        const payloadParts = [];
        payloadParts.push('action=' + encodeURIComponent(action));
        
        // Add all other form data
        Object.keys(formData).forEach(key => {
          if (key !== 'action') {
            const value = formData[key];
            if (value !== null && value !== undefined) {
              payloadParts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
            }
          }
        });
        
        const payloadString = payloadParts.join('&');
        
        Logger.log('Proxying to InvoiceEstimate URL: ' + INVOICE_ESTIMATE_URL);
        Logger.log('Payload string: ' + payloadString);
        
        const proxyOptions = {
          method: 'post',
          payload: payloadString,
          contentType: 'application/x-www-form-urlencoded',
          muteHttpExceptions: true
        };
        
        try {
          const response = UrlFetchApp.fetch(INVOICE_ESTIMATE_URL, proxyOptions);
          const responseText = response.getContentText();
          const responseCode = response.getResponseCode();
          Logger.log('InvoiceEstimate response code: ' + responseCode);
          Logger.log('InvoiceEstimate response preview: ' + responseText.substring(0, 200));
          
          if (responseCode === 200) {
            return ContentService.createTextOutput(responseText)
              .setMimeType(ContentService.MimeType.JSON);
          } else {
            Logger.log('InvoiceEstimate returned error code: ' + responseCode);
            Logger.log('Response: ' + responseText.substring(0, 500));
            return ContentService.createTextOutput(JSON.stringify({
              success: false,
              error: 'InvoiceEstimate returned error code: ' + responseCode
            })).setMimeType(ContentService.MimeType.JSON);
          }
        } catch (proxyError) {
          Logger.log('Error proxying to InvoiceEstimate: ' + proxyError.toString());
          return ContentService.createTextOutput(JSON.stringify({
            success: false,
            error: 'Proxy error: ' + proxyError.toString()
          })).setMimeType(ContentService.MimeType.JSON);
        }
      } else {
        Logger.log('InvoiceEstimate URL not configured - payment earnings will not work');
        Logger.log('Please set INVOICE_ESTIMATE_URL in DashboardScript.gs');
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          error: 'InvoiceEstimate Web App URL not configured. Please set INVOICE_ESTIMATE_URL in DashboardScript.gs'
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }
    
    // Add action to form data (ensure it's there)
    formData.action = action;
    
    Logger.log('Making proxy request to: ' + AUTH_SCRIPT_URL);
    Logger.log('Form data keys: ' + Object.keys(formData).join(', '));
    Logger.log('Form data (first 500 chars): ' + JSON.stringify(formData).substring(0, 500));
    
    // Make request to Authentication Script using UrlFetchApp (no CORS restrictions)
    // Send as object so it's available in e.parameter (which AuthenticationScript checks)
    const options = {
      method: 'post',
      payload: formData, // Send as object - Google Apps Script converts to form-encoded
      muteHttpExceptions: true,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    };
    
    Logger.log('Sending request with options: method=' + options.method + ', muteHttpExceptions=' + options.muteHttpExceptions);
    
    const response = UrlFetchApp.fetch(AUTH_SCRIPT_URL, options);
    const responseText = response.getContentText();
    const responseCode = response.getResponseCode();
    
    // Log for debugging
    Logger.log('Proxy response - Code: ' + responseCode + ', Length: ' + responseText.length);
    Logger.log('Response preview (first 500 chars): ' + responseText.substring(0, 500));
    
    // Check for HTTP errors (404, 500, etc.)
    if (responseCode !== 200) {
      Logger.log('ERROR: AuthenticationScript returned HTTP error code: ' + responseCode);
      Logger.log('Response text (first 1000 chars): ' + responseText.substring(0, 1000));
      
      let errorMessage = 'Authentication Script error';
      if (responseCode === 404) {
        errorMessage = 'Authentication Script not found (404). Please check that the Web App is deployed and the URL is correct.';
      } else if (responseCode === 403) {
        errorMessage = 'Authentication Script access denied (403). Please check Web App permissions.';
      } else if (responseCode === 500) {
        errorMessage = 'Authentication Script server error (500). Check the script logs.';
      } else {
        errorMessage = 'Authentication Script returned error code: ' + responseCode;
      }
      
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: errorMessage
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Check for HTML responses (error pages)
    const responseLower = responseText.trim().toLowerCase();
    if (responseLower.startsWith('<!doctype') || 
        responseLower.startsWith('<html') ||
        responseText.includes('<!DOCTYPE') ||
        responseText.includes('<html')) {
      Logger.log('ERROR: Received HTML instead of JSON from Authentication Script');
      Logger.log('Full HTML response (first 1000 chars): ' + responseText.substring(0, 1000));
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Received HTML instead of JSON from Authentication Script. The Web App may not be deployed correctly. Please verify the deployment URL and ensure the script is deployed as a Web App with "Execute as: Me" and "Who has access: Anyone".'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Validate it's JSON
    try {
      JSON.parse(responseText);
      Logger.log('Response is valid JSON');
    } catch (parseError) {
      Logger.log('WARNING: Response is not valid JSON: ' + parseError.toString());
      Logger.log('Response text (first 500 chars): ' + responseText.substring(0, 500));
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Invalid JSON response from Authentication Script: ' + responseText.substring(0, 200)
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Return the response
    Logger.log('Returning JSON response');
    return ContentService.createTextOutput(responseText)
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log('=== Proxy error ===');
    Logger.log('Error message: ' + error.toString());
    Logger.log('Error stack: ' + (error.stack || 'No stack trace'));
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: 'Proxy error: ' + error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Proxy function to make requests to Authentication Script
 * This avoids CORS issues by making the request server-side
 */
function doPost(e) {
  // Handle CORS preflight requests (OPTIONS)
  if (e.parameter && e.parameter.method === 'OPTIONS') {
    return ContentService.createTextOutput('');
  }
  
  // Use the shared proxy handler
  return handleProxyRequest(e);
}

/**
 * Test function to verify AuthenticationScript connection
 * Run this from the Apps Script editor to test
 */
function testAuthScriptConnection() {
  Logger.log('Testing AuthenticationScript connection...');
  Logger.log('AUTH_SCRIPT_URL: ' + AUTH_SCRIPT_URL);
  
  const testData = {
    action: 'ping'
  };
  
  const options = {
    method: 'post',
    payload: testData,
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(AUTH_SCRIPT_URL, options);
    const responseText = response.getContentText();
    const responseCode = response.getResponseCode();
    
    Logger.log('Response Code: ' + responseCode);
    Logger.log('Response Text: ' + responseText);
    
    if (responseText.trim().toLowerCase().startsWith('<!doctype') || 
        responseText.trim().toLowerCase().startsWith('<html')) {
      Logger.log('ERROR: AuthenticationScript returned HTML instead of JSON');
      Logger.log('This usually means the script is not deployed as a Web App, or the URL is incorrect');
    } else {
      Logger.log('SUCCESS: AuthenticationScript returned JSON');
      try {
        const json = JSON.parse(responseText);
        Logger.log('Parsed JSON: ' + JSON.stringify(json));
      } catch (e) {
        Logger.log('WARNING: Response is not valid JSON: ' + e.toString());
      }
    }
  } catch (error) {
    Logger.log('ERROR: Failed to connect to AuthenticationScript: ' + error.toString());
  }
}

// ========================================
// PAYMENT DATA FUNCTIONS
// ========================================

/**
 * Get payment earnings data from Payment History sheet
 * Supports date range filtering
 * Payment History format: Date, Invoice ID, Company ID, Amount, Payment Method, Transaction ID, Status, Email, Description, Fee, Notes
 */
function getPaymentEarnings(startDate, endDate) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName('Payment History');
    
    if (!sheet) {
      Logger.log('Payment History sheet not found');
      return { success: false, error: 'Payment History sheet not found' };
    }
    
    const lastRow = sheet.getLastRow();
    Logger.log('Payment History sheet last row: ' + lastRow);
    
    if (lastRow < 2) {
      Logger.log('No data rows found in Payment History');
      return { 
        success: true, 
        totalAmount: 0, 
        totalFees: 0,
        netAmount: 0,
        paymentCount: 0,
        byMethod: {},
        byStatus: {},
        payments: []
      };
    }
    
    // Detect if sheet has logo row (row 1) or starts with headers (row 1)
    // Check first row to see if it's a header row
    const firstRow = sheet.getRange(1, 1, 1, 11).getValues()[0];
    const firstCell = String(firstRow[0] || '').trim();
    
    let dataStartRow = 1;
    let headerRow = 1;
    
    // If first row looks like a logo/header (contains "PAYMENT" or is merged), skip it
    if (firstCell.toUpperCase().includes('PAYMENT') || firstCell.includes('💳')) {
      dataStartRow = 3; // Row 1 = logo, Row 2 = headers, Row 3+ = data
      headerRow = 2;
    } else {
      // Check if row 1 has headers
      const headerCheck = String(firstRow[0] || '').trim();
      if (headerCheck === 'Date' || headerCheck === 'Invoice ID') {
        dataStartRow = 2; // Row 1 = headers, Row 2+ = data
        headerRow = 1;
      }
    }
    
    Logger.log('Data starts at row: ' + dataStartRow + ', Header row: ' + headerRow);
    
    if (lastRow < dataStartRow) {
      Logger.log('No data rows found');
      return { 
        success: true, 
        totalAmount: 0, 
        totalFees: 0,
        netAmount: 0,
        paymentCount: 0,
        byMethod: {},
        byStatus: {},
        payments: []
      };
    }
    
    // Read all data rows
    const numRows = lastRow - dataStartRow + 1;
    const dataRange = sheet.getRange(dataStartRow, 1, numRows, 11);
    const data = dataRange.getValues();
    
    Logger.log('Read ' + data.length + ' rows from Payment History');
    
    // Column mapping (11 columns)
    // 0: Date, 1: Invoice ID, 2: Company ID, 3: Amount, 4: Payment Method, 
    // 5: Transaction ID, 6: Status, 7: Email, 8: Description, 9: Fee, 10: Notes
    
    let totalAmount = 0;
    let totalFees = 0;
    let paymentCount = 0;
    const byMethod = {};
    const byStatus = {};
    const payments = [];
    
    // Parse date range
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    if (end) {
      end.setHours(23, 59, 59, 999); // Include entire end date
    }
    
    Logger.log('Date range: ' + (start ? start.toISOString() : 'no start') + ' to ' + (end ? end.toISOString() : 'no end'));
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      
      // Skip if first column is empty (likely a header row that got through)
      if (!row[0] || String(row[0]).trim() === '') continue;
      
      // Parse date - handle both Date objects and date strings
      let paymentDate = row[0];
      if (paymentDate instanceof Date) {
        // Already a date
      } else if (typeof paymentDate === 'string') {
        paymentDate = new Date(paymentDate);
      } else {
        // Try to convert
        paymentDate = new Date(paymentDate);
      }
      
      // Skip if date is invalid
      if (isNaN(paymentDate.getTime())) {
        Logger.log('Skipping row ' + (i + dataStartRow) + ' - invalid date: ' + row[0]);
        continue;
      }
      
      const amount = parseFloat(row[3]) || 0;
      const status = String(row[6] || '').trim();
      const method = String(row[4] || '').trim() || 'Unknown';
      const fee = parseFloat(row[9]) || 0;
      
      // Filter by date range
      if (start && paymentDate < start) continue;
      if (end && paymentDate > end) continue;
      
      // Only count completed payments
      if (status === 'Completed' && amount > 0) {
        totalAmount += amount;
        totalFees += fee;
        paymentCount++;
        
        // Group by payment method
        if (!byMethod[method]) byMethod[method] = 0;
        byMethod[method] += amount;
        
        // Group by status
        if (!byStatus[status]) byStatus[status] = 0;
        byStatus[status] += amount;
        
        // Store payment details
        payments.push({
          date: paymentDate,
          invoiceId: row[1],
          amount: amount,
          method: method,
          status: status,
          email: row[7],
          description: row[8],
          fee: fee
        });
      }
    }
    
    Logger.log('Processed payments: ' + paymentCount + ', Total: $' + totalAmount.toFixed(2));
    
    return {
      success: true,
      totalAmount: totalAmount,
      totalFees: totalFees,
      netAmount: totalAmount - totalFees,
      paymentCount: paymentCount,
      byMethod: byMethod,
      byStatus: byStatus,
      payments: payments
    };
  } catch (error) {
    Logger.log('Error getting payment earnings: ' + error.toString());
    Logger.log('Error stack: ' + (error.stack || 'No stack'));
    return { success: false, error: error.toString() };
  }
}

/**
 * Handle getStripeEarnings action (for backward compatibility)
 * Also supports date range via startDate and endDate parameters
 */
function handleGetStripeEarnings(period, startDate, endDate) {
  try {
    let start = null;
    let end = null;
    
    if (startDate && endDate) {
      // Custom date range
      start = new Date(startDate);
      end = new Date(endDate);
    } else if (period === 'today') {
      // Today's earnings
      start = new Date();
      start.setHours(0, 0, 0, 0);
      end = new Date();
      end.setHours(23, 59, 59, 999);
    } else if (period === 'month') {
      // Current month
      start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end = new Date();
      end.setHours(23, 59, 59, 999);
    } else if (period === 'year') {
      // Current year
      start = new Date();
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      end = new Date();
      end.setHours(23, 59, 59, 999);
    }
    
    const result = getPaymentEarnings(start, end);
    
    if (result.success) {
      return {
        success: true,
        totalAmount: result.totalAmount,
        netAmount: result.netAmount,
        totalFees: result.totalFees,
        paymentCount: result.paymentCount,
        byMethod: result.byMethod,
        byStatus: result.byStatus,
        period: period || 'custom',
        startDate: start ? start.toISOString() : null,
        endDate: end ? end.toISOString() : null
      };
    } else {
      return result;
    }
  } catch (error) {
    Logger.log('Error in handleGetStripeEarnings: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}


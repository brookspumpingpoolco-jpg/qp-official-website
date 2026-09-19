/**
 * ========================================
 * PAYMENT REPORTING - STANDALONE WEB APP
 * ========================================
 * 
 * ⚠️ IMPORTANT: This is a COMPLETELY STANDALONE script
 * - Does NOT call InvoiceEstimate.gs functions
 * - Does NOT share functions with InvoiceEstimate.gs
 * - All functions are self-contained
 * - Uses its own constants and sheet references
 * 
 * This script should be deployed as a SEPARATE web app from InvoiceEstimate.gs
 * 
 * DEPLOYMENT:
 * 1. Create a NEW Apps Script project (separate from InvoiceEstimate)
 * 2. Copy this entire file into it
 * 3. Update the constants below (SPREADSHEET_ID, etc.)
 * 4. Deploy as Web App:
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Use the web app URL for payment reporting API calls
 * 
 * WEBHOOK SETUP:
 * - Stripe → Cloudflare Worker → This script (PaymentReporting_Standalone)
 * - DO NOT point Stripe webhooks to InvoiceEstimate.gs
 * - This script handles ALL payment webhooks independently
 * 
 * USAGE:
 * POST to: https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
 * 
 * Action: reportPayment
 * Data: {
 *   invoiceId: "INV-2024-001",
 *   amount: 100.00,
 *   paymentMethod: "Cash",
 *   transactionId: "TXN-123",
 *   notes: "Payment received",
 *   paymentDate: "2024-01-15"
 * }
 */

// ========================================
// CONFIGURATION - UPDATE THESE VALUES
// ========================================
const SPREADSHEET_ID = '1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0';
const INVOICES_ESTIMATES_SHEET = 'Invoices & Estimates';
const PAYMENT_HISTORY_SHEET = 'Payment History';

// Company settings
const COMPANY_NAME = 'A Quality Pool Company';
const COMPANY_EMAIL = 'samr@aqualitypoolcompanyusa.com';
const COMPANY_PHONE = '(502) 706-9172';

// ========================================
// MAIN HTTP HANDLERS
// ========================================

/**
 * Handle OPTIONS requests (CORS preflight - required for Stripe)
 */
function doOptions(e) {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT)
    .setHeaders({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
}

/**
 * Handle GET requests (for testing)
 */
function doGet(e) {
  try {
    const action = e.parameter.action || 'test';
    
    if (action === 'test') {
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: 'Payment Reporting Web App is running',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: 'Invalid action'
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle POST requests (main API endpoint)
 * Now handles BOTH manual payments AND Stripe webhooks!
 */
function doPost(e) {
  // CRITICAL: Log immediately - even before try/catch
  try {
    Logger.log('========================================');
    Logger.log('🔵🔵🔵 PAYMENT REPORTING STANDALONE - doPost CALLED');
    Logger.log('📋 Script: PaymentReporting_Standalone.gs');
    Logger.log('⏰ Timestamp: ' + new Date().toISOString());
    Logger.log('🔗 Web App: Payment Reporting (NOT InvoiceEstimate)');
    Logger.log('Event object exists: ' + (e ? 'YES' : 'NO'));
    Logger.log('postData exists: ' + (e && e.postData ? 'YES' : 'NO'));
    
    if (!e) {
      Logger.log('❌ ERROR: Event object e is null/undefined!');
      return ContentService.createTextOutput(JSON.stringify({ error: 'No event data' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // ========================================
    // CHECK FOR STRIPE WEBHOOK FIRST (ROBUST DETECTION)
    // ========================================
    Logger.log('Checking for Stripe webhook...');
    
    if (e.postData) {
      Logger.log('postData.type: ' + (e.postData.type || 'NONE'));
      Logger.log('postData.contents length: ' + (e.postData.contents ? e.postData.contents.length : 0));
      if (e.postData.contents) {
        Logger.log('postData.contents preview (first 300 chars): ' + e.postData.contents.substring(0, 300));
      }
    }
    
    // ROBUST: Try to detect Stripe webhook from ANY POST data, not just specific content type
    if (e.postData && e.postData.contents) {
      try {
        Logger.log('🔵 Attempting to parse POST data as JSON...');
        const webhookData = JSON.parse(e.postData.contents);
        Logger.log('✅ JSON parsed successfully');
        Logger.log('Parsed data keys: ' + Object.keys(webhookData).join(', '));
        Logger.log('Data type field: ' + (webhookData.type || 'NO TYPE FIELD'));
        
        // Check if this is a Stripe webhook (multiple ways to detect)
        // Your payload has: type: "checkout.session.completed" at top level, object: "event"
        const isStripeWebhook = 
          (webhookData.type && webhookData.type.startsWith('checkout.session')) ||
          (webhookData.type === 'checkout.session.completed') ||
          (webhookData.object === 'event' && webhookData.type && webhookData.type.includes('checkout')) ||
          (webhookData.data && webhookData.data.object && webhookData.data.object.object === 'checkout.session') ||
          (webhookData.type && webhookData.type.includes('checkout.session')) ||
          (webhookData.object === 'event' && webhookData.type); // Catches any Stripe event
        
        if (isStripeWebhook) {
          Logger.log('✅✅✅ STRIPE WEBHOOK DETECTED! Type: ' + (webhookData.type || 'unknown'));
          Logger.log('Full webhook data structure: ' + JSON.stringify(webhookData).substring(0, 500));
          
          // Process webhook SYNCHRONOUSLY so we can catch errors
          try {
            Logger.log('🔵 Calling handleStripeWebhook...');
            Logger.log('🔵 Webhook data structure check:');
            Logger.log('   - event.type: ' + (webhookData.type || 'MISSING'));
            Logger.log('   - event.data: ' + (webhookData.data ? 'EXISTS' : 'MISSING'));
            Logger.log('   - event.data.object: ' + (webhookData.data?.object ? 'EXISTS' : 'MISSING'));
            
            const webhookResult = handleStripeWebhook(webhookData);
            
            // handleStripeWebhook returns a ContentService response, extract the JSON
            let resultData = { received: true, processed: true };
            try {
              const resultText = webhookResult.getContent();
              resultData = JSON.parse(resultText);
              Logger.log('✅ handleStripeWebhook returned: ' + JSON.stringify(resultData));
            } catch (parseErr) {
              Logger.log('⚠️ Could not parse webhook result, but continuing...');
            }
            
            Logger.log('✅ handleStripeWebhook completed successfully');
            Logger.log('========================================');
            
            // Return the result from handleStripeWebhook
            return webhookResult;
          } catch (webhookError) {
            Logger.log('========================================');
            Logger.log('❌❌❌ CRITICAL WEBHOOK ERROR: ' + webhookError.toString());
            Logger.log('Error stack: ' + (webhookError.stack || 'No stack'));
            Logger.log('Error name: ' + (webhookError.name || 'Unknown'));
            Logger.log('Error message: ' + (webhookError.message || 'No message'));
            Logger.log('Error at line: ' + (webhookError.lineNumber || 'Unknown'));
            Logger.log('Full error: ' + JSON.stringify(webhookError));
            Logger.log('========================================');
            
            // Still return 200 to Stripe (don't cause retries)
            // But log the error so we can debug
            return ContentService.createTextOutput(JSON.stringify({ 
              received: true, 
              processed: false,
              error: webhookError.toString(),
              timestamp: new Date().toISOString()
            }))
              .setMimeType(ContentService.MimeType.JSON);
          }
        } else {
          Logger.log('⚠️ JSON parsed but not a Stripe webhook');
          Logger.log('Type: ' + (webhookData.type || 'none'));
          Logger.log('Object: ' + (webhookData.object || 'none'));
        }
      } catch (parseError) {
        Logger.log('❌ Error parsing POST data as JSON: ' + parseError.toString());
        Logger.log('This might be form-encoded data, continuing with normal processing...');
      }
    } else {
      Logger.log('⚠️ No postData.contents to parse');
    }
    
    // ========================================
    // NORMAL API PROCESSING
    // ========================================
    let action = null;
    let data = {};
    
    // Parse action and data from different sources
    if (e.parameter && e.parameter.action) {
      action = e.parameter.action;
    }
    
    if (e.parameter && e.parameter.data) {
      try {
        data = JSON.parse(e.parameter.data);
      } catch (e) {
        data = e.parameter.data;
      }
    }
    
    // Try to parse from postData (JSON)
    if (e.postData && e.postData.contents) {
      try {
        const postData = JSON.parse(e.postData.contents);
        if (postData.action) action = postData.action;
        if (postData.data) data = postData.data;
        else if (!action) data = postData; // If no action, use whole object as data
      } catch (e) {
        // Not JSON, try form-encoded
        if (e.postData.type && e.postData.type.includes('form')) {
          const params = e.postData.contents.split('&');
          for (const param of params) {
            const [key, value] = param.split('=');
            if (key === 'action') action = decodeURIComponent(value);
            if (key === 'data') {
              try {
                data = JSON.parse(decodeURIComponent(value));
              } catch (e) {
                data = decodeURIComponent(value);
              }
            }
          }
        }
      }
    }
    
    // Default action if not specified
    if (!action && data.invoiceId) {
      action = 'reportPayment';
    }
    
    let result = { success: false, error: 'Invalid action' };
    
    switch (action) {
      case 'reportPayment':
        result = reportManualPayment(
          data.invoiceId,
          data.amount,
          data.paymentMethod || 'Manual',
          data.transactionId || '',
          data.notes || '',
          data.paymentDate ? new Date(data.paymentDate) : new Date()
        );
        break;
        
      case 'getPaymentHistory':
        result = getPaymentHistory(data.invoiceId || data.customerEmail || data.identifier);
        break;
        
      case 'getPaymentRecords':
        result = getPaymentRecords(data.invoiceId);
        break;
        
      case 'getPaymentHistoryByEmail':
        result = getPaymentHistoryByEmail(data.customerEmail || data.email);
        break;
        
      case 'testPayment':
        // Test payment - simulates Stripe payment without using checkout session
        Logger.log('🧪 TEST PAYMENT REQUESTED');
        result = testPayment(
          data.invoiceId,
          data.amount,
          data.customerEmail || '',
          data.customerName || '',
          data.paymentMethod || 'Test Payment'
        );
        break;
        
      case 'simulateWebhook':
        // Simulate Stripe webhook with test data
        Logger.log('🧪 SIMULATE WEBHOOK REQUESTED');
        const testEvent = {
          type: data.eventType || 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_test_' + Date.now(),
              amount_total: Math.round((data.amount || 0) * 100),
              currency: 'usd',
              customer_details: {
                email: data.customerEmail || '',
                name: data.customerName || ''
              },
              metadata: {
                invoice_id: data.invoiceId || '',
                invoice_number: data.invoiceNumber || data.invoiceId || ''
              },
              payment_intent: 'pi_test_' + Date.now(),
              payment_status: 'paid'
            }
          }
        };
        try {
          const webhookResult = handleStripeWebhook(testEvent);
          const resultText = webhookResult.getContent();
          result = JSON.parse(resultText);
        } catch (webhookError) {
          result = {
            success: false,
            error: 'Webhook simulation failed: ' + webhookError.toString()
          };
        }
        break;
        
      case 'listInvoiceIds':
        // Debug function to list all invoice IDs in the sheet
        result = listInvoiceIds();
        break;
        
      case 'test':
        result = {
          success: true,
          message: 'Payment Reporting API is working',
          received: data
        };
        break;
        
      default:
        result = { success: false, error: 'Unknown action: ' + action };
    }
    
    Logger.log('========================================');
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log('========================================');
    Logger.log('❌❌❌ doPost ERROR: ' + error.toString());
    Logger.log('Error stack: ' + (error.stack || 'No stack trace'));
    Logger.log('Error name: ' + (error.name || 'Unknown'));
    Logger.log('========================================');
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * List all invoice IDs in the sheet (for debugging)
 */
function listInvoiceIds() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const invoiceSheet = spreadsheet.getSheetByName(INVOICES_ESTIMATES_SHEET);
    
    if (!invoiceSheet) {
      return { success: false, error: 'Invoice sheet not found' };
    }
    
    enforce8ColumnStructure(invoiceSheet);
    const dataRows = invoiceSheet.getDataRange().getValues();
    const sheetCols = invoiceSheet.getLastColumn();
    const is8Column = (sheetCols >= 8);
    const idCol = is8Column ? 0 : 0; // Column A (index 0) for 8-column, Column 1 (index 0) for others
    
    const invoiceIds = [];
    for (let i = 1; i < dataRows.length; i++) {
      const invoiceId = String(dataRows[i][idCol] || '').trim();
      if (invoiceId) {
        invoiceIds.push({
          row: i + 1,
          invoiceId: invoiceId
        });
      }
    }
    
    Logger.log('Found ' + invoiceIds.length + ' invoice IDs in sheet');
    return {
      success: true,
      count: invoiceIds.length,
      invoiceIds: invoiceIds,
      structure: is8Column ? '8-column' : 'other',
      idColumn: idCol + 1
    };
  } catch (error) {
    Logger.log('Error listing invoice IDs: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Test function to verify logging works
 * Run this from Apps Script editor to test
 */
function testLogging() {
  Logger.log('TEST LOG - If you see this, logging works!');
  Logger.log('Timestamp: ' + new Date().toISOString());
  return 'Logging test complete - check View → Logs';
}

/**
 * Test function to verify payment recording works
 * Run this from Apps Script editor to test
 */
function testPaymentRecording() {
  try {
    Logger.log('========================================');
    Logger.log('🧪 TEST: Payment Recording');
    Logger.log('========================================');
    
    // Test 1: Check spreadsheet access
    Logger.log('Test 1: Checking spreadsheet access...');
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    Logger.log('✅ Spreadsheet opened: ' + spreadsheet.getName());
    
    // Test 2: Check Payment History sheet
    Logger.log('Test 2: Checking Payment History sheet...');
    let paymentSheet = spreadsheet.getSheetByName(PAYMENT_HISTORY_SHEET);
    if (!paymentSheet) {
      Logger.log('⚠️ Payment History sheet not found, creating...');
      paymentSheet = spreadsheet.insertSheet(PAYMENT_HISTORY_SHEET);
      const headers = ['Date', 'Invoice ID', 'Company ID', 'Amount', 'Payment Method', 'Transaction ID', 'Status', 'Email', 'Description', 'Fee', 'Notes'];
      paymentSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      paymentSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      Logger.log('✅ Payment History sheet created');
    } else {
      Logger.log('✅ Payment History sheet exists');
      Logger.log('   - Rows: ' + paymentSheet.getLastRow());
      Logger.log('   - Columns: ' + paymentSheet.getLastColumn());
    }
    
    // Test 3: Test recordPaymentHistory function
    Logger.log('Test 3: Testing recordPaymentHistory function...');
    const testResult = recordPaymentHistory(
      'TEST-INV-001',
      100.00,
      'TEST-TXN-001',
      'Test',
      'CMP-AQUALITYPOOL',
      new Date(),
      'test@example.com',
      'Test payment recording',
      2.90
    );
    
    if (testResult.success) {
      Logger.log('✅ Payment recording test PASSED');
    } else {
      Logger.log('❌ Payment recording test FAILED: ' + testResult.error);
    }
    
    // Test 4: Check invoice sheet
    Logger.log('Test 4: Checking Invoice sheet...');
    const invoiceSheet = spreadsheet.getSheetByName(INVOICES_ESTIMATES_SHEET);
    if (invoiceSheet) {
      Logger.log('✅ Invoice sheet exists');
      Logger.log('   - Rows: ' + invoiceSheet.getLastRow());
      Logger.log('   - Columns: ' + invoiceSheet.getLastColumn());
    } else {
      Logger.log('❌ Invoice sheet NOT FOUND: ' + INVOICES_ESTIMATES_SHEET);
    }
    
    Logger.log('========================================');
    Logger.log('🧪 TEST COMPLETE');
    Logger.log('========================================');
    
    return {
      success: true,
      message: 'Test complete - check logs',
      paymentSheetExists: !!paymentSheet,
      invoiceSheetExists: !!invoiceSheet,
      paymentRecordTest: testResult.success
    };
  } catch (error) {
    Logger.log('❌ TEST ERROR: ' + error.toString());
    Logger.log('Error stack: ' + (error.stack || 'No stack'));
    return {
      success: false,
      error: error.toString()
    };
  }
}

// ========================================
// PAYMENT REPORTING FUNCTIONS
// ========================================

/**
 * Test payment function - Records payment without Stripe checkout
 * Use this for testing instead of creating real checkout sessions
 */
function testPayment(invoiceId, amount, customerEmail, customerName, paymentMethod) {
  try {
    Logger.log('========================================');
    Logger.log('🧪 TEST PAYMENT - ' + new Date().toISOString());
    Logger.log('Invoice ID: ' + invoiceId);
    Logger.log('Amount: $' + amount);
    Logger.log('Customer: ' + (customerName || customerEmail || 'N/A'));
    Logger.log('========================================');
    
    if (!invoiceId || !amount || amount <= 0) {
      return {
        success: false,
        error: 'Invalid test payment data: invoiceId and amount required'
      };
    }
    
    // Use reportManualPayment to record the test payment
    const result = reportManualPayment(
      invoiceId,
      parseFloat(amount),
      paymentMethod || 'Test Payment',
      'TEST-TXN-' + Date.now(),
      'Test payment - no Stripe checkout required',
      new Date(),
      false // Don't skip payment history - record it
    );
    
    if (result.success) {
      Logger.log('✅ Test payment recorded successfully');
      Logger.log('   - Total Paid: $' + result.totalPaid.toFixed(2));
      Logger.log('   - Remaining: $' + result.remaining.toFixed(2));
      Logger.log('   - Progress: ' + result.paymentProgress.toFixed(1) + '%');
    } else {
      Logger.log('❌ Test payment failed: ' + result.error);
    }
    
    Logger.log('========================================');
    return result;
  } catch (error) {
    Logger.log('❌ Test payment error: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Report a manual payment for an invoice
 * @param {boolean} skipPaymentHistory - If true, skip recording to Payment History (already recorded)
 */
function reportManualPayment(invoiceId, amount, paymentMethod, transactionId, notes, paymentDate, skipPaymentHistory) {
  try {
    if (!invoiceId || !amount || amount <= 0) {
      return { success: false, error: 'Invalid payment data: invoiceId and amount required' };
    }
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const invoiceSheet = spreadsheet.getSheetByName(INVOICES_ESTIMATES_SHEET);
    
    if (!invoiceSheet) {
      return { success: false, error: 'Invoice sheet not found: ' + INVOICES_ESTIMATES_SHEET };
    }
    
    // Find the invoice
    // First, enforce 8-column structure to ensure correct column positions
    enforce8ColumnStructure(invoiceSheet);
    
    const dataRows = invoiceSheet.getDataRange().getValues();
    const headers = dataRows[0];
    const sheetCols = invoiceSheet.getLastColumn();
    const is8Column = (sheetCols >= 8);
    
    // Determine ID column position based on structure
    // 8-column: ID (1), Customer Email (2), Company ID (3), JSON (4-6), Total (7), Payment Schedule (8)
    // 7-column: ID (1), Email (2), JSON (3-5), Total (6), Payment Schedule (7)
    // 4-column: ID (1), Email (2), JSON (3), Total (4)
    const idCol = is8Column ? 0 : 0; // Column A (index 0) for 8-column, Column 1 (index 0) for others
    const companyIdCol = is8Column ? 2 : -1; // Column C (index 2) for 8-column
    
    let invoiceRow = -1;
    let invoiceTotal = 0;
    let customerEmail = '';
    let customerName = '';
    let invoiceData = null;
    let companyId = 'CMP-AQUALITYPOOL'; // Default, will be extracted from invoice
    
    Logger.log('Searching for invoice ID: ' + invoiceId);
    Logger.log('Sheet structure: ' + (is8Column ? '8-column' : 'other') + ' (ID column index: ' + idCol + ')');
    
    // Try to find invoice by ID (check correct column based on structure)
    for (let i = 1; i < dataRows.length; i++) {
      const rowId = String(dataRows[i][idCol] || '').trim();
      Logger.log('Row ' + (i + 1) + ': Checking ID "' + rowId + '" against "' + String(invoiceId).trim() + '"');
      if (rowId === String(invoiceId).trim()) {
        invoiceRow = i + 1;
        Logger.log('✅ Found invoice at row: ' + invoiceRow);
        
        // Extract Company ID from invoice (8-column structure: Column C = Company ID)
        if (is8Column && companyIdCol !== -1) {
          companyId = String(dataRows[i][companyIdCol] || '').trim() || 'CMP-AQUALITYPOOL';
          Logger.log('Company ID from invoice (Column C): ' + companyId);
        }
        
        // Try to get invoice data from JSON columns
        try {
          // Check for 8-column structure (ID, Customer Email, Company ID, JSON1, JSON2, JSON3, Total, Payment Schedule)
          const jsonCol1 = is8Column ? 3 : 2; // Column D (index 3) for 8-column, Column C (index 2) for others
          const jsonCol2 = is8Column ? 4 : 3;
          const jsonCol3 = is8Column ? 5 : 4;
          
          const jsonPart1 = String(dataRows[i][jsonCol1] || '').trim();
          const jsonPart2 = String(dataRows[i][jsonCol2] || '').trim();
          const jsonPart3 = String(dataRows[i][jsonCol3] || '').trim();
          let jsonStr = concatenateJsonChunks(jsonPart1, jsonPart2, jsonPart3);
          
          if (!jsonStr || jsonStr.length === 0) {
            jsonStr = (jsonPart1 + jsonPart2 + jsonPart3).trim();
          }
          
          if (jsonStr && jsonStr.startsWith('{')) {
            invoiceData = JSON.parse(jsonStr);
            invoiceTotal = parseFloat(invoiceData.total) || 0;
            customerEmail = invoiceData.customerEmail || '';
            customerName = invoiceData.customerName || '';
          }
        } catch (e) {
          Logger.log('Could not parse invoice JSON: ' + e.toString());
        }
        
        // Fallback to column headers if JSON parsing failed
        if (!customerEmail) {
          const emailCol = is8Column ? 1 : (headers.indexOf('Customer Email') !== -1 ? headers.indexOf('Customer Email') : 1); // Column B (index 1) for 8-column
          const nameCol = headers.indexOf('Customer Name');
          const totalCol = is8Column ? 6 : (headers.indexOf('Total') !== -1 ? headers.indexOf('Total') : 3); // Column G (index 6) for 8-column
          
          if (emailCol !== -1 && emailCol < dataRows[i].length) customerEmail = dataRows[i][emailCol] || '';
          if (nameCol !== -1 && nameCol < dataRows[i].length) customerName = dataRows[i][nameCol] || '';
          if (totalCol !== -1 && totalCol < dataRows[i].length) invoiceTotal = parseFloat(dataRows[i][totalCol] || 0);
        }
        
        break;
      }
    }
    
    if (invoiceRow === -1) {
      return { success: false, error: 'Invoice not found: ' + invoiceId };
    }
    
    // Record payment in payment history (unless already recorded)
    if (!skipPaymentHistory) {
      Logger.log('📝 Recording payment to Payment History...');
      const paymentRecordResult = recordPaymentHistory(
        invoiceId,
        parseFloat(amount),
        transactionId || 'MANUAL-' + Date.now(),
        paymentMethod || 'Manual',
        companyId, // Company ID extracted from invoice
        paymentDate || new Date(),
        customerEmail,
        `Manual payment for Invoice ${invoiceId}`,
        0 // No fee for manual payments
      );
      
      if (!paymentRecordResult.success) {
        Logger.log('⚠️ Warning: Failed to record payment history: ' + (paymentRecordResult.error || 'Unknown error'));
      } else if (paymentRecordResult.duplicate) {
        Logger.log('⚠️ Duplicate payment detected and prevented');
      } else {
        Logger.log('✅ Payment recorded to Payment History');
      }
    } else {
      Logger.log('⏭️ Skipping payment history record (already recorded via webhook)');
    }
    
    // Calculate total paid so far
    const paymentHistorySheet = spreadsheet.getSheetByName(PAYMENT_HISTORY_SHEET);
    let totalPaid = 0;
    
    if (paymentHistorySheet) {
      const paymentData = paymentHistorySheet.getDataRange().getValues();
      if (paymentData.length > 1) {
        const paymentHeaders = paymentData[0];
        const invoiceIdCol = paymentHeaders.indexOf('Invoice ID');
        const amountCol = paymentHeaders.indexOf('Amount');
        const statusCol = paymentHeaders.indexOf('Status');
        
        if (invoiceIdCol !== -1 && amountCol !== -1) {
          for (let i = 1; i < paymentData.length; i++) {
            if (String(paymentData[i][invoiceIdCol] || '').trim() === String(invoiceId).trim()) {
              const paymentStatus = paymentData[i][statusCol] || 'Completed';
              if (paymentStatus === 'Completed' || paymentStatus === 'completed') {
                totalPaid += parseFloat(paymentData[i][amountCol] || 0);
              }
            }
          }
        }
      }
    }
    
    // Update invoice JSON with payment info
    if (invoiceData) {
      // Initialize partial payments array if needed
      if (!invoiceData.partialPayments) {
        invoiceData.partialPayments = [];
      }
      
      // Add this payment
      invoiceData.partialPayments.push({
        amount: parseFloat(amount),
        paidDate: (paymentDate || new Date()).toISOString(),
        transactionId: transactionId || 'MANUAL-' + Date.now(),
        status: 'Completed',
        method: paymentMethod || 'Manual',
        notes: notes || ''
      });
      
      // Update payment status - ensure status reverts to "Paid" when fully paid
      if (totalPaid >= invoiceTotal - 0.01) {
        invoiceData.paymentStatus = 'Paid';
        invoiceData.status = 'Paid'; // Also update main status field
        invoiceData.invoiceStatus = 'Paid'; // Also update invoiceStatus field
        invoiceData.paidDate = (paymentDate || new Date()).toISOString();
      } else if (totalPaid > 0) {
        invoiceData.paymentStatus = 'Partial';
        invoiceData.totalPaid = totalPaid;
        invoiceData.remainingBalance = invoiceTotal - totalPaid;
      }
      
      // Write updated JSON back to sheet
      try {
        const updatedJsonStr = JSON.stringify(invoiceData);
        const is8Column = headers.length >= 8;
        const jsonCol1 = is8Column ? 4 : 3;
        const jsonCol2 = is8Column ? 5 : 4;
        const jsonCol3 = is8Column ? 6 : 5;
        
        // Split JSON if needed (for large invoices)
        const chunkSize = 50000; // Google Sheets cell limit
        const chunk1 = updatedJsonStr.substring(0, chunkSize);
        const chunk2 = updatedJsonStr.substring(chunkSize, chunkSize * 2);
        const chunk3 = updatedJsonStr.substring(chunkSize * 2);
        
        invoiceSheet.getRange(invoiceRow, jsonCol1 + 1).setValue(chunk1);
        if (jsonCol2 !== -1) invoiceSheet.getRange(invoiceRow, jsonCol2 + 1).setValue(chunk2 || '');
        if (jsonCol3 !== -1) invoiceSheet.getRange(invoiceRow, jsonCol3 + 1).setValue(chunk3 || '');
      } catch (e) {
        Logger.log('Error updating invoice JSON: ' + e.toString());
      }
    }
    
    // Update invoice payment status columns (if they exist)
    const paymentStatusCol = headers.indexOf('Payment Status');
    const paymentDateCol = headers.indexOf('Payment Date');
    
    if (totalPaid >= invoiceTotal - 0.01) {
      // Fully paid
      if (paymentStatusCol !== -1) {
        invoiceSheet.getRange(invoiceRow, paymentStatusCol + 1).setValue('Paid');
      }
      if (paymentDateCol !== -1) {
        invoiceSheet.getRange(invoiceRow, paymentDateCol + 1).setValue(paymentDate || new Date());
      }
    } else if (totalPaid > 0) {
      // Partially paid
      if (paymentStatusCol !== -1) {
        invoiceSheet.getRange(invoiceRow, paymentStatusCol + 1).setValue('Partially Paid');
      }
    }
    
    SpreadsheetApp.flush();
    
    // Send confirmation email if customer email exists
    if (customerEmail) {
      try {
        sendPaymentConfirmationEmail(customerEmail, customerName, invoiceId, parseFloat(amount), totalPaid, invoiceTotal);
        Logger.log('✅ Payment confirmation email sent to: ' + customerEmail);
      } catch (e) {
        Logger.log('Error sending confirmation email: ' + e.toString());
      }
    }
    
    Logger.log('✅ Manual payment recorded: $' + amount.toFixed(2) + ' for invoice ' + invoiceId);
    
    return {
      success: true,
      totalPaid: totalPaid,
      remaining: invoiceTotal - totalPaid,
      paymentProgress: invoiceTotal > 0 ? (totalPaid / invoiceTotal) * 100 : 0,
      message: totalPaid >= invoiceTotal - 0.01 ? 'Invoice paid in full' : 'Partial payment recorded'
    };
  } catch (error) {
    Logger.log('❌ Error reporting manual payment: ' + error.toString());
    Logger.log('Stack: ' + (error.stack || 'No stack trace'));
    return { success: false, error: error.toString() };
  }
}

/**
 * Get payment history for an invoice or customer
 * Compatible with InvoiceEstimate format for SaaS-style queries
 */
function getPaymentHistory(identifier) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const paymentHistorySheet = spreadsheet.getSheetByName(PAYMENT_HISTORY_SHEET);
    
    if (!paymentHistorySheet) {
      return { success: true, payments: [] };
    }
    
    const paymentData = paymentHistorySheet.getDataRange().getValues();
    if (paymentData.length <= 1) {
      return { success: true, payments: [] };
    }
    
    const headers = paymentData[0];
    // Column mapping (11 columns - matches InvoiceEstimate format)
    // 0: Date, 1: Invoice ID, 2: Company ID, 3: Amount, 4: Payment Method, 
    // 5: Transaction ID, 6: Status, 7: Email, 8: Description, 9: Fee, 10: Notes
    const dateCol = 0;
    const invoiceIdCol = 1;
    const companyIdCol = 2;
    const amountCol = 3;
    const paymentMethodCol = 4;
    const transactionIdCol = 5;
    const statusCol = 6;
    const emailCol = 7;
    const descriptionCol = 8;
    const feeCol = 9;
    const notesCol = 10;
    
    const payments = [];
    const searchTerm = String(identifier).trim().toLowerCase();
    
    for (let i = 1; i < paymentData.length; i++) {
      const row = paymentData[i];
      const invoiceId = String(row[invoiceIdCol] || '').trim();
      const email = String(row[emailCol] || '').trim().toLowerCase();
      
      // Match by Invoice ID or Email
      if (invoiceId.toLowerCase() === searchTerm || email === searchTerm) {
        payments.push({
          date: row[dateCol],
          invoiceId: invoiceId,
          companyId: String(row[companyIdCol] || '').trim(),
          amount: parseFloat(row[amountCol] || 0),
          paymentMethod: String(row[paymentMethodCol] || '').trim(),
          transactionId: String(row[transactionIdCol] || '').trim(),
          status: String(row[statusCol] || '').trim(),
          email: String(row[emailCol] || '').trim(),
          description: String(row[descriptionCol] || '').trim(),
          fee: parseFloat(row[feeCol] || 0),
          notes: String(row[notesCol] || '').trim()
        });
      }
    }
    
    // Sort by date descending (newest first)
    payments.sort((a, b) => {
      const dateA = a.date instanceof Date ? a.date : new Date(a.date);
      const dateB = b.date instanceof Date ? b.date : new Date(b.date);
      return dateB - dateA;
    });
    
    return { success: true, payments: payments };
  } catch (error) {
    Logger.log('Error getting payment history: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Get payment records for a specific invoice ID
 * Matches InvoiceEstimate.getPaymentRecords() format for SaaS compatibility
 */
function getPaymentRecords(invoiceId) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const paymentHistorySheet = spreadsheet.getSheetByName(PAYMENT_HISTORY_SHEET);
    
    if (!paymentHistorySheet) {
      return { success: true, payments: [], message: 'No payment history yet' };
    }
    
    const paymentData = paymentHistorySheet.getDataRange().getValues();
    if (paymentData.length < 2) {
      return { success: true, payments: [], message: 'No payments recorded' };
    }
    
    // Column mapping (11 columns - matches InvoiceEstimate format)
    // 0: Date, 1: Invoice ID, 2: Company ID, 3: Amount, 4: Payment Method, 
    // 5: Transaction ID, 6: Status, 7: Email, 8: Description, 9: Fee, 10: Notes
    const payments = [];
    const searchInvoiceId = String(invoiceId).trim();
    
    for (let i = 1; i < paymentData.length; i++) {
      const row = paymentData[i];
      const rowInvoiceId = String(row[1] || '').trim();
      
      if (rowInvoiceId === searchInvoiceId) {
        payments.push({
          date: row[0],
          invoiceId: rowInvoiceId,
          companyId: String(row[2] || '').trim(),
          amount: parseFloat(row[3] || 0),
          paymentMethod: String(row[4] || '').trim(),
          transactionId: String(row[5] || '').trim(),
          status: String(row[6] || '').trim(),
          email: String(row[7] || '').trim(),
          description: String(row[8] || '').trim(),
          fee: parseFloat(row[9] || 0),
          notes: String(row[10] || '').trim()
        });
      }
    }
    
    // Sort by date descending (newest first)
    payments.sort((a, b) => {
      const dateA = a.date instanceof Date ? a.date : new Date(a.date);
      const dateB = b.date instanceof Date ? b.date : new Date(b.date);
      return dateB - dateA;
    });
    
    return { success: true, payments: payments };
  } catch (error) {
    Logger.log('Error getting payment records: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Get payment history by customer email
 * Matches InvoiceEstimate.getPaymentHistory() format for SaaS compatibility
 */
function getPaymentHistoryByEmail(customerEmail) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const paymentHistorySheet = spreadsheet.getSheetByName(PAYMENT_HISTORY_SHEET);
    
    if (!paymentHistorySheet) {
      return { success: true, payments: [] };
    }
    
    const paymentData = paymentHistorySheet.getDataRange().getValues();
    if (paymentData.length <= 1) {
      return { success: true, payments: [] };
    }
    
    const payments = [];
    const searchEmail = String(customerEmail).trim().toLowerCase();
    
    for (let i = 1; i < paymentData.length; i++) {
      const row = paymentData[i];
      const email = String(row[7] || '').trim().toLowerCase(); // Email column (index 7)
      
      if (email === searchEmail) {
        payments.push({
          date: row[0],
          invoiceId: String(row[1] || '').trim(),
          companyId: String(row[2] || '').trim(),
          amount: parseFloat(row[3] || 0),
          paymentMethod: String(row[4] || '').trim(),
          transactionId: String(row[5] || '').trim(),
          status: String(row[6] || '').trim(),
          email: String(row[7] || '').trim(),
          description: String(row[8] || '').trim(),
          fee: parseFloat(row[9] || 0),
          notes: String(row[10] || '').trim()
        });
      }
    }
    
    // Sort by date descending (newest first)
    payments.sort((a, b) => {
      const dateA = a.date instanceof Date ? a.date : new Date(a.date);
      const dateB = b.date instanceof Date ? b.date : new Date(b.date);
      return dateB - dateA;
    });
    
    return { success: true, payments: payments };
  } catch (error) {
    Logger.log('Error getting payment history by email: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Record payment in Payment History sheet
 */
function recordPaymentHistory(invoiceId, amount, transactionId, paymentMethod, companyId, paymentDate, email, description, fee) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = spreadsheet.getSheetByName(PAYMENT_HISTORY_SHEET);
    
    if (!sheet) {
      sheet = spreadsheet.insertSheet(PAYMENT_HISTORY_SHEET);
      const headers = ['Date', 'Invoice ID', 'Company ID', 'Amount', 'Payment Method', 'Transaction ID', 'Status', 'Email', 'Description', 'Fee', 'Notes'];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    }
    
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      // CRITICAL: Check for duplicate payment before recording
      const existingData = sheet.getDataRange().getValues();
      const transactionIdCol = 5; // Column F (index 5) - Transaction ID
      const invoiceIdCol = 1; // Column B (index 1) - Invoice ID
      const txnNorm = String(transactionId || '').trim();
      const invNorm = String(invoiceId || '').trim();
      const incomingDate = paymentDate ? (paymentDate instanceof Date ? paymentDate : new Date(paymentDate)) : new Date();
      
      for (let i = 1; i < existingData.length; i++) {
        const existingTxnId = String(existingData[i][transactionIdCol] || '').trim();
        const existingInvId = String(existingData[i][invoiceIdCol] || '').trim();
        const existingAmount = parseFloat(existingData[i][3] || 0);
        const existingDate = existingData[i][0] instanceof Date ? existingData[i][0] : new Date(existingData[i][0]);

        const txnMatch = txnNorm && existingTxnId && existingTxnId === txnNorm;
        const invAmtMatch = existingInvId === invNorm && Math.abs(existingAmount - (parseFloat(amount) || 0)) < 0.01;

        if (txnMatch || invAmtMatch) {
          const timeDiff = Math.abs((incomingDate instanceof Date ? incomingDate : new Date(incomingDate)) - (existingDate instanceof Date ? existingDate : new Date(existingDate))) / 1000 / 60; // minutes
          if (timeDiff < 1) {
            Logger.log('⚠️ DUPLICATE PAYMENT DETECTED - Skipping: Transaction ID ' + transactionId + ' or Invoice ' + invoiceId + ' already recorded');
            return {
              success: true,
              duplicate: true,
              message: 'Payment already recorded (duplicate prevented)'
            };
          }
        }
      }

      const dateValue = incomingDate;

      // Ensure correct column structure: Date, Invoice ID, Company ID, Amount, Payment Method, Transaction ID, Status, Email, Description, Fee, Notes
      sheet.appendRow([
        dateValue,                    // Column A (1): Date
        invoiceId,                    // Column B (2): Invoice ID
        companyId || 'CMP-AQUALITYPOOL', // Column C (3): Company ID
        amount,                       // Column D (4): Amount
        paymentMethod || 'Manual',    // Column E (5): Payment Method
        transactionId || '',         // Column F (6): Transaction ID
        'Completed',                  // Column G (7): Status
        email || '',                  // Column H (8): Email
        description || '',            // Column I (9): Description
        fee || 0,                     // Column J (10): Fee
        ''                            // Column K (11): Notes
      ]);
    } finally {
      lock.releaseLock();
    }
    
    Logger.log('✅ Payment recorded: Invoice ' + invoiceId + ', Amount: $' + amount + ', Transaction: ' + (transactionId || 'N/A'));
    
    return { success: true };
  } catch (error) {
    Logger.log('Error recording payment history: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Send payment confirmation email (Enhanced with logo and invoice-style formatting)
 */
function sendPaymentConfirmationEmail(customerEmail, customerName, invoiceId, amount, totalPaid, invoiceTotal) {
  try {
    totalPaid = totalPaid || amount;
    invoiceTotal = invoiceTotal || 0;
    const isPartialPayment = totalPaid < invoiceTotal - 0.01;
    const remainingBalance = invoiceTotal - totalPaid;
    
    // Get invoice web app URL for viewing invoice online
    const INVOICE_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbya0FobRwi-Sj5RsAyqxLDBw9LXMu3uOS0rSTf0SlHNmKKc5AXX6r6G12Fgv4tOqhJw/exec';
    const viewInvoiceLink = INVOICE_WEBAPP_URL + '?id=' + encodeURIComponent(invoiceId);
    
    // Logo URL (same as invoice template)
    const logoUrl = 'https://cdn.prod.website-files.com/6931dc4e8e97334e195432df/693b5a1f7ef7137d7f72cb1b_test%20(5).png';
    
    // Get customer first name
    const customerFirstName = customerName ? customerName.split(' ')[0] : 'Valued Customer';
    
    const emailSubject = isPartialPayment 
      ? `Partial Payment Received - Invoice ${invoiceId} - ${COMPANY_NAME}`
      : `Payment Received - Invoice ${invoiceId} - ${COMPANY_NAME}`;
    
    const emailBody = `
      <!DOCTYPE html>
      <html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Payment Confirmation - ${COMPANY_NAME}</title>
        <style type="text/css">
          body {
            margin: 0;
            padding: 0;
            -webkit-text-size-adjust: 100%;
            -ms-text-size-adjust: 100%;
            background-color: #f5f7fa;
          }
          table {
            border-collapse: collapse;
            mso-table-lspace: 0pt;
            mso-table-rspace: 0pt;
          }
          img {
            border: 0;
            height: auto;
            line-height: 100%;
            outline: none;
            text-decoration: none;
            -ms-interpolation-mode: bicubic;
          }
          @media only screen and (max-width: 600px) {
            .mobile-padding {
              padding-left: 16px !important;
              padding-right: 16px !important;
            }
          }
        </style>
      </head>
      <body style="background-color: #f5f7fa; margin: 0; padding: 0;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f5f7fa;">
          <tr>
            <td align="center" style="padding: 40px 20px;">
              <!-- Main Container -->
              <table border="0" cellpadding="0" cellspacing="0" width="640" style="max-width: 640px; width: 100%; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                
                <!-- Header -->
                <tr>
                  <td align="center" style="background: linear-gradient(135deg, #0c4a6e 0%, #0369a1 100%); padding: 32px 24px; text-align: center;">
                    <img src="${logoUrl}" alt="${COMPANY_NAME}" style="max-width: 180px; height: auto; margin-bottom: 16px; display: block; border-radius: 8px;">
                    <h1 style="color: white; margin: 12px 0 4px 0; font-size: 26px; font-weight: 800; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${COMPANY_NAME}</h1>
                    <p style="color: #e0f2fe; margin: 0; font-size: 14px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Payment Confirmation</p>
                  </td>
                </tr>
                
                <!-- Body -->
                <tr>
                  <td style="padding: 32px 24px;">
                    <h2 style="font-size: 18px; font-weight: 600; color: #0f172a; margin: 0 0 16px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Hello ${customerFirstName},</h2>
                    <div style="font-size: 15px; color: #475569; margin: 0 0 24px 0; line-height: 1.7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                      <p style="margin: 0 0 16px 0;">We have successfully received your payment!</p>
                    </div>
                    
                    <!-- Payment Summary -->
                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0;">
                      <table border="0" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                          <td width="50%" style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; vertical-align: top;">
                            <span style="font-size: 14px; color: #64748b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Invoice Number</span><br>
                            <strong style="font-size: 14px; color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${invoiceId}</strong>
                          </td>
                          <td width="50%" style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; vertical-align: top;">
                            <span style="font-size: 14px; color: #64748b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Payment Date</span><br>
                            <strong style="font-size: 14px; color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</strong>
                          </td>
                        </tr>
                        <tr>
                          <td width="50%" style="padding: 10px 0; vertical-align: top;">
                            <span style="font-size: 14px; color: #64748b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Amount Paid</span><br>
                            <strong style="font-size: 20px; color: #10b981; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">$${parseFloat(amount).toFixed(2)}</strong>
                          </td>
                          <td width="50%" style="padding: 10px 0; vertical-align: top;">
                            <span style="font-size: 14px; color: #64748b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Invoice Total</span><br>
                            <strong style="font-size: 14px; color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">$${parseFloat(invoiceTotal).toFixed(2)}</strong>
                          </td>
                        </tr>
                      </table>
                      ${isPartialPayment ? `
                        <div style="background: #fef3c7; border: 2px solid #f59e0b; border-radius: 8px; padding: 16px; margin-top: 20px;">
                          <p style="margin: 0; color: #92400e; font-size: 14px; font-weight: 600;">
                            <strong>Partial Payment</strong><br>
                            Total Paid: $${totalPaid.toFixed(2)}<br>
                            Remaining Balance: $${remainingBalance.toFixed(2)}
                          </p>
                        </div>
                      ` : `
                        <div style="background: #f0fdf4; border: 2px solid #10b981; border-radius: 8px; padding: 16px; margin-top: 20px; text-align: center;">
                          <p style="margin: 0; color: #065f46; font-size: 16px; font-weight: 600;">
                            ✓ Invoice Paid in Full
                          </p>
                        </div>
                      `}
                    </div>
                    
                    <!-- View Invoice Button -->
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td align="center" style="padding: 32px 0 16px 0;">
                          <a href="${viewInvoiceLink}" style="display: inline-block; background: linear-gradient(135deg, #0369a1 0%, #0284c7 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">View Invoice Online</a>
                        </td>
                      </tr>
                    </table>
                    
                    <p style="font-size: 15px; color: #475569; margin: 24px 0 0 0; line-height: 1.7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                      Thank you for your payment! We appreciate your business.
                    </p>
                    <p style="font-size: 15px; color: #475569; margin: 16px 0 0 0; line-height: 1.7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                      If you have any questions about this payment or your invoice, please don't hesitate to contact us.
                    </p>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
                    <p style="font-size: 13px; color: #64748b; margin: 4px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;"><strong>${COMPANY_NAME}</strong></p>
                    <p style="font-size: 13px; color: #64748b; margin: 4px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${COMPANY_EMAIL} | ${COMPANY_PHONE}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
    
    MailApp.sendEmail({
      to: customerEmail,
      subject: emailSubject,
      htmlBody: emailBody
    });
    
    return { success: true };
  } catch (error) {
    Logger.log('Error sending payment confirmation email: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

// ========================================
// STRIPE WEBHOOK HANDLER (3-LAYER FALLBACK)
// ========================================

/**
 * Handle Stripe webhook events with seamless 3-layer linking
 */
function handleStripeWebhook(event) {
  try {
    Logger.log('========================================');
    Logger.log('🟢 PAYMENT REPORTING - handleStripeWebhook CALLED');
    Logger.log('📋 Script: PaymentReporting_Standalone.gs (NOT InvoiceEstimate)');
    Logger.log('⏰ Timestamp: ' + new Date().toISOString());
    Logger.log('Event type: ' + (event.type || 'NO TYPE'));
    
    // Handle checkout.session.completed
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const sessionId = session.id;
      const paidAmount = session.amount_total / 100;
      
      Logger.log('Session ID: ' + sessionId);
      Logger.log('Amount: $' + paidAmount.toFixed(2));
      Logger.log('Metadata: ' + JSON.stringify(session.metadata || {}));
      
      // 3-LAYER LINKING SYSTEM
      let invoiceId = null;
      let invoiceRow = -1;
      
      // LAYER 1: Metadata
      invoiceId = session.metadata?.invoice_id;
      if (invoiceId) {
        Logger.log('✅ LAYER 1: Found invoice ID from metadata: ' + invoiceId);
      } else {
        Logger.log('⚠️ LAYER 1: No invoice_id in metadata, trying LAYER 2...');
        
        // LAYER 2: Session ID lookup
        const sessionLookup = findInvoiceByStripeSessionId(sessionId);
        if (sessionLookup && sessionLookup.invoiceId) {
          invoiceId = sessionLookup.invoiceId;
          invoiceRow = sessionLookup.rowIndex;
          Logger.log('✅ LAYER 2: Found invoice by session ID: ' + invoiceId);
        } else {
          Logger.log('⚠️ LAYER 2: Session ID not found, trying LAYER 3...');
          
          // LAYER 3: Email + amount match
          const customerEmail = session.customer_details?.email || session.customer_email;
          if (customerEmail && paidAmount) {
            const emailLookup = findInvoiceByEmailAndAmount(customerEmail, paidAmount);
            if (emailLookup && emailLookup.invoiceId) {
              invoiceId = emailLookup.invoiceId;
              invoiceRow = emailLookup.rowIndex;
              Logger.log('✅ LAYER 3: Found invoice by email+amount: ' + invoiceId);
            }
          }
        }
      }
      
      if (invoiceId) {
        Logger.log('✅ Processing payment for invoice: ' + invoiceId);
        
        // Get invoice data to extract company ID and customer info
        const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
        const invoiceSheet = spreadsheet.getSheetByName(INVOICES_ESTIMATES_SHEET);
        let companyId = 'CMP-AQUALITYPOOL';
        let customerEmail = session.customer_details?.email || session.customer_email || '';
        let customerName = session.customer_details?.name || '';
        let invoiceNumber = '';
        
        if (invoiceSheet) {
          enforce8ColumnStructure(invoiceSheet);
          const lastRow = invoiceSheet.getLastRow();
          const sheetCols = invoiceSheet.getLastColumn();
          const is8Column = (sheetCols >= 8);
          const idCol = is8Column ? 2 : 1; // Invoice ID column (1-based)
          const companyIdCol = is8Column ? 1 : -1; // Company ID column (1-based)
          const json1Col = is8Column ? 4 : 3; // JSON part 1 (1-based)
          const json2Col = is8Column ? 5 : 4;
          const json3Col = is8Column ? 6 : 5;
          
          // Find invoice row
          let foundRow = invoiceRow > 0 ? invoiceRow : null;
          if (!foundRow) {
            for (let i = 1; i < lastRow; i++) {
              const rowId = String(invoiceSheet.getRange(i + 1, idCol).getValue() || '').trim();
              if (rowId === String(invoiceId).trim()) {
                foundRow = i + 1;
                break;
              }
            }
          }
          
          if (foundRow) {
            // Get company ID from Column C (index 2)
            if (is8Column && companyIdCol !== -1) {
              companyId = String(invoiceSheet.getRange(foundRow, companyIdCol).getValue() || '').trim() || 'CMP-AQUALITYPOOL';
              Logger.log('Extracted Company ID from Column C: ' + companyId);
            }
            
            // Get invoice JSON to extract customer info and invoice number
            const jsonPart1 = invoiceSheet.getRange(foundRow, json1Col).getValue() || '';
            const jsonPart2 = invoiceSheet.getRange(foundRow, json2Col).getValue() || '';
            const jsonPart3 = invoiceSheet.getRange(foundRow, json3Col).getValue() || '';
            let jsonStr = concatenateJsonChunks(jsonPart1, jsonPart2, jsonPart3);
            
            if (!jsonStr || jsonStr.length === 0) {
              jsonStr = String(jsonPart1 || '').trim();
            }
            
            if (jsonStr && jsonStr.startsWith('{')) {
              try {
                const invoiceData = JSON.parse(jsonStr);
                customerEmail = customerEmail || invoiceData.customerEmail || '';
                customerName = customerName || invoiceData.customerName || '';
                invoiceNumber = invoiceData.invoiceNumber || invoiceId;
              } catch (e) {
                Logger.log('Could not parse invoice JSON: ' + e.toString());
              }
            }
          }
        }
        
        // Calculate Stripe fee (2.9% + $0.30)
        const stripeFee = (paidAmount * 0.029) + 0.30;
        
        // Create detailed description
        const description = customerName 
          ? `Stripe payment for Invoice ${invoiceNumber} - ${customerName}`
          : `Stripe payment for Invoice ${invoiceNumber}`;
        
        // Record payment in Payment History FIRST (with full linkage)
        const paymentRecordResult = recordPaymentHistory(
          invoiceId,
          paidAmount,
          session.payment_intent || sessionId,
          'Stripe',
          companyId,
          new Date(),
          customerEmail,
          description,
          stripeFee
        );
        
        if (!paymentRecordResult.success) {
          Logger.log('⚠️ Warning: Failed to record payment history, but continuing...');
        } else {
          Logger.log('✅ Payment recorded in Payment History with full linkage');
        }
        
        // Now process payment using reportManualPayment to update invoice status
        // Skip payment history since we already recorded it above with full Stripe data
        const result = reportManualPayment(
          invoiceId,
          paidAmount,
          'Stripe',
          session.payment_intent || sessionId,
          'Stripe payment - Session: ' + sessionId,
          new Date(),
          true // Skip payment history (already recorded with full Stripe data)
        );
        
        Logger.log('✅ Stripe payment fully processed: ' + JSON.stringify(result));
        Logger.log('   - Invoice ID: ' + invoiceId);
        Logger.log('   - Amount: $' + paidAmount.toFixed(2));
        Logger.log('   - Stripe Fee: $' + stripeFee.toFixed(2));
        Logger.log('   - Company ID: ' + companyId);
        Logger.log('   - Customer: ' + (customerName || customerEmail || 'N/A'));
        Logger.log('========================================');
        return ContentService.createTextOutput(JSON.stringify({ 
          received: true, 
          processed: true, 
          invoiceId: invoiceId,
          amount: paidAmount,
          fee: stripeFee,
          companyId: companyId
        }))
          .setMimeType(ContentService.MimeType.JSON);
      } else {
        Logger.log('❌ Could not link payment to invoice');
        Logger.log('Session details: ' + JSON.stringify({
          id: sessionId,
          amount: paidAmount,
          customer_email: session.customer_details?.email || session.customer_email,
          metadata: session.metadata
        }));
        try {
          const fallbackInvoiceId = (session.metadata && (session.metadata.invoice_id || session.metadata.project_id || session.metadata.order_id))
            ? String(session.metadata.invoice_id || session.metadata.project_id || session.metadata.order_id).trim()
            : ('UNLINKED-' + String(sessionId || new Date().getTime()));
          const fallbackEmail = session.customer_details?.email || session.customer_email || '';
          const fallbackFee = (paidAmount * 0.029) + 0.30;
          recordPaymentHistory(
            fallbackInvoiceId,
            paidAmount,
            session.payment_intent || sessionId,
            'Stripe',
            'CMP-AQUALITYPOOL',
            new Date(),
            fallbackEmail,
            'Stripe payment (unlinked checkout session ' + sessionId + ')',
            fallbackFee
          );
        } catch (fallbackErr) {
          Logger.log('⚠️ Failed to record unlinked checkout payment: ' + fallbackErr.toString());
        }
        Logger.log('========================================');
      }
    }
    
    // Handle payment_intent.succeeded (alternative event)
    if (event.type === 'payment_intent.succeeded') {
      Logger.log('🟢 payment_intent.succeeded event received');
      const paymentIntent = event.data.object;
      const paymentIntentId = paymentIntent.id;
      const paidAmount = paymentIntent.amount / 100; // Convert from cents
      
      Logger.log('Payment Intent ID: ' + paymentIntentId);
      Logger.log('Amount: $' + paidAmount.toFixed(2));
      Logger.log('Metadata: ' + JSON.stringify(paymentIntent.metadata || {}));
      
      // Try to get invoice ID from metadata
      let invoiceId = paymentIntent.metadata?.invoice_id;
      
      // If no invoice_id in metadata, try to find via customer email + amount
      if (!invoiceId) {
        const customerEmail = paymentIntent.receipt_email || paymentIntent.metadata?.customer_email;
        if (customerEmail && paidAmount) {
          Logger.log('⚠️ No invoice_id in metadata, trying email+amount lookup...');
          const emailLookup = findInvoiceByEmailAndAmount(customerEmail, paidAmount);
          if (emailLookup && emailLookup.invoiceId) {
            invoiceId = emailLookup.invoiceId;
            Logger.log('✅ Found invoice by email+amount: ' + invoiceId);
          }
        }
      } else {
        Logger.log('✅ Found invoice ID from metadata: ' + invoiceId);
      }
      
      if (invoiceId) {
        Logger.log('✅ Processing payment_intent for invoice: ' + invoiceId);
        
        // Get invoice data to extract company ID and customer info
        const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
        const invoiceSheet = spreadsheet.getSheetByName(INVOICES_ESTIMATES_SHEET);
        let companyId = 'CMP-AQUALITYPOOL';
        let customerEmail = paymentIntent.receipt_email || paymentIntent.metadata?.customer_email || '';
        let customerName = paymentIntent.metadata?.customer_name || '';
        let invoiceNumber = '';
        
        if (invoiceSheet) {
          enforce8ColumnStructure(invoiceSheet);
          const lastRow = invoiceSheet.getLastRow();
          const sheetCols = invoiceSheet.getLastColumn();
          const is8Column = (sheetCols >= 8);
          const idCol = is8Column ? 1 : 0; // Invoice ID index (0-based)
          const companyIdCol = is8Column ? 0 : -1; // Company ID index (0-based)
          const json1Col = is8Column ? 3 : 2; // JSON part 1 index (0-based)
          const json2Col = is8Column ? 4 : 3;
          const json3Col = is8Column ? 5 : 4;
          
          // Find invoice row
          for (let i = 1; i < lastRow; i++) {
            const rowId = String(invoiceSheet.getRange(i + 1, idCol + 1).getValue() || '').trim();
            if (rowId === String(invoiceId).trim()) {
              const foundRow = i + 1;
              
              // Get company ID from Column C (index 2)
              if (is8Column && companyIdCol !== -1) {
                companyId = String(invoiceSheet.getRange(foundRow, companyIdCol + 1).getValue() || '').trim() || 'CMP-AQUALITYPOOL';
                Logger.log('Extracted Company ID from Column C: ' + companyId);
              }
              
              // Get invoice JSON
              const jsonPart1 = invoiceSheet.getRange(foundRow, json1Col + 1).getValue() || '';
              const jsonPart2 = invoiceSheet.getRange(foundRow, json2Col + 1).getValue() || '';
              const jsonPart3 = invoiceSheet.getRange(foundRow, json3Col + 1).getValue() || '';
              let jsonStr = concatenateJsonChunks(jsonPart1, jsonPart2, jsonPart3);
              
              if (!jsonStr || jsonStr.length === 0) {
                jsonStr = String(jsonPart1 || '').trim();
              }
              
              if (jsonStr && jsonStr.startsWith('{')) {
                try {
                  const invoiceData = JSON.parse(jsonStr);
                  customerEmail = customerEmail || invoiceData.customerEmail || '';
                  customerName = customerName || invoiceData.customerName || '';
                  invoiceNumber = invoiceData.invoiceNumber || invoiceId;
                } catch (e) {
                  Logger.log('Could not parse invoice JSON: ' + e.toString());
                }
              }
              break;
            }
          }
        }
        
        // Calculate Stripe fee (2.9% + $0.30)
        const stripeFee = (paidAmount * 0.029) + 0.30;
        
        // Create detailed description
        const description = customerName 
          ? `Stripe payment for Invoice ${invoiceNumber} - ${customerName}`
          : `Stripe payment for Invoice ${invoiceNumber}`;
        
        // Record payment in Payment History
        const paymentRecordResult = recordPaymentHistory(
          invoiceId,
          paidAmount,
          paymentIntentId,
          'Stripe',
          companyId,
          new Date(),
          customerEmail,
          description,
          stripeFee
        );
        
        if (!paymentRecordResult.success) {
          Logger.log('⚠️ Warning: Failed to record payment history');
        } else {
          Logger.log('✅ Payment recorded in Payment History');
        }
        
        // Update invoice status
        const result = reportManualPayment(
          invoiceId,
          paidAmount,
          'Stripe',
          paymentIntentId,
          'Stripe payment - Payment Intent: ' + paymentIntentId,
          new Date(),
          true // Skip payment history (already recorded)
        );
        
        Logger.log('✅ payment_intent.succeeded processed: ' + JSON.stringify(result));
        Logger.log('   - Invoice ID: ' + invoiceId);
        Logger.log('   - Amount: $' + paidAmount.toFixed(2));
        Logger.log('   - Payment Intent: ' + paymentIntentId);
        Logger.log('========================================');
        return ContentService.createTextOutput(JSON.stringify({ 
          received: true, 
          processed: true, 
          invoiceId: invoiceId,
          amount: paidAmount,
          paymentIntentId: paymentIntentId
        }))
          .setMimeType(ContentService.MimeType.JSON);
      } else {
        Logger.log('❌ Could not link payment_intent to invoice');
        Logger.log('Payment Intent details: ' + JSON.stringify({
          id: paymentIntentId,
          amount: paidAmount,
          metadata: paymentIntent.metadata
        }));
        Logger.log('========================================');
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({ received: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log('❌ Webhook error: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({ error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * LAYER 2: Find invoice by Stripe session ID
 */
function findInvoiceByStripeSessionId(sessionId) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(INVOICES_ESTIMATES_SHEET);
    if (!sheet) return null;
    
    enforce8ColumnStructure(sheet);
    const lastRow = sheet.getLastRow();
    const sheetCols = sheet.getLastColumn();
    const is8Column = (sheetCols >= 8);
    const json1Col = is8Column ? 4 : 3; // Column D (1-based) for 8-column
    const json2Col = is8Column ? 5 : 4;
    const json3Col = is8Column ? 6 : 5;
    const idCol = is8Column ? 1 : 1; // Column A (1-based) for 8-column
    
    for (let i = 1; i < lastRow; i++) {
      const jsonPart1 = sheet.getRange(i + 1, json1Col).getValue() || '';
      const jsonPart2 = sheet.getRange(i + 1, json2Col).getValue() || '';
      const jsonPart3 = sheet.getRange(i + 1, json3Col).getValue() || '';
      let jsonStr = concatenateJsonChunks(jsonPart1, jsonPart2, jsonPart3);
      
      if (!jsonStr || jsonStr.length === 0) {
        jsonStr = String(jsonPart1 || '').trim();
      }
      
      if (jsonStr && jsonStr.startsWith('{')) {
        try {
          const invoiceData = JSON.parse(jsonStr);
          if (invoiceData.paymentLinkId === sessionId || 
              invoiceData.stripeSessionId === sessionId ||
              (invoiceData.paymentLink && invoiceData.paymentLink.includes(sessionId))) {
            const invoiceId = sheet.getRange(i + 1, idCol).getValue();
            return { invoiceId: String(invoiceId).trim(), rowIndex: i + 1 };
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
    return null;
  } catch (error) {
    Logger.log('Error finding invoice by session ID: ' + error.toString());
    return null;
  }
}

/**
 * LAYER 3: Find invoice by email and amount
 */
function findInvoiceByEmailAndAmount(customerEmail, amount) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(INVOICES_ESTIMATES_SHEET);
    if (!sheet) return null;
    
    enforce8ColumnStructure(sheet);
    const lastRow = sheet.getLastRow();
    const sheetCols = sheet.getLastColumn();
    const is8Column = (sheetCols >= 8);
    const json1Col = is8Column ? 4 : 3; // Column D (1-based) for 8-column
    const json2Col = is8Column ? 5 : 4;
    const json3Col = is8Column ? 6 : 5;
    const idCol = is8Column ? 1 : 1; // Column A (1-based) for 8-column
    
    const amountTolerance = 1.00;
    const searchEmail = customerEmail.toLowerCase().trim();
    
    for (let i = 1; i < lastRow; i++) {
      const jsonPart1 = sheet.getRange(i + 1, json1Col).getValue() || '';
      const jsonPart2 = sheet.getRange(i + 1, json2Col).getValue() || '';
      const jsonPart3 = sheet.getRange(i + 1, json3Col).getValue() || '';
      let jsonStr = concatenateJsonChunks(jsonPart1, jsonPart2, jsonPart3);
      
      if (!jsonStr || jsonStr.length === 0) {
        jsonStr = String(jsonPart1 || '').trim();
      }
      
      if (jsonStr && jsonStr.startsWith('{')) {
        try {
          const invoiceData = JSON.parse(jsonStr);
          const invoiceEmail = (invoiceData.customerEmail || '').toLowerCase().trim();
          const invoiceAmount = parseFloat(invoiceData.total) || 0;
          
          if (invoiceEmail === searchEmail && 
              Math.abs(invoiceAmount - amount) <= amountTolerance) {
            const invoiceId = sheet.getRange(i + 1, idCol).getValue();
            return { invoiceId: String(invoiceId).trim(), rowIndex: i + 1 };
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
    return null;
  } catch (error) {
    Logger.log('Error finding invoice by email+amount: ' + error.toString());
    return null;
  }
}

// ========================================
// HELPER FUNCTIONS FOR JSON HANDLING
// ========================================

/**
 * Split JSON string into chunks for Google Sheets (max 50k chars per cell)
 */
function splitJsonString(jsonString) {
  const MAX_CHUNK_SIZE = 49500;
  const chunks = [];
  
  if (jsonString.length <= MAX_CHUNK_SIZE) {
    return [jsonString, '', ''];
  }
  
  let remaining = jsonString;
  while (remaining.length > 0 && chunks.length < 3) {
    if (remaining.length <= MAX_CHUNK_SIZE) {
      chunks.push(remaining);
      remaining = '';
    } else {
      let splitPoint = MAX_CHUNK_SIZE;
      for (let i = MAX_CHUNK_SIZE; i > MAX_CHUNK_SIZE - 100 && i > 0; i--) {
        if (remaining[i] === ',' || remaining[i] === '}' || remaining[i] === ']') {
          splitPoint = i + 1;
          break;
        }
      }
      chunks.push(remaining.substring(0, splitPoint));
      remaining = remaining.substring(splitPoint);
    }
  }
  
  while (chunks.length < 3) {
    chunks.push('');
  }
  
  return chunks.slice(0, 3);
}

/**
 * Concatenate JSON chunks back into single string
 */
function concatenateJsonChunks(chunk1, chunk2, chunk3) {
  const parts = [];
  if (chunk1) parts.push(String(chunk1).trim());
  if (chunk2) parts.push(String(chunk2).trim());
  if (chunk3) parts.push(String(chunk3).trim());
  return parts.join('');
}

/**
 * Enforce 8-column structure for invoice sheet
 * Column structure: ID (1), Customer Email (2), Company ID (3), JSON Parts (4-6), Total (7), Payment Schedule (8)
 */
function enforce8ColumnStructure(sheet) {
  try {
    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, Math.max(lastCol, 8)).getValues()[0];
    const expectedHeaders = ['ID', 'Customer Email', 'Company ID', 'JSON Part 1', 'JSON Part 2', 'JSON Part 3', 'Total', 'Payment Schedule'];
    
    // Check if headers are correct
    let headersNeedUpdate = false;
    if (lastCol < 8) {
      headersNeedUpdate = true;
    } else {
      for (let i = 0; i < 8; i++) {
        const currentHeader = String(headers[i] || '').trim();
        const expectedHeader = expectedHeaders[i];
        if (currentHeader !== expectedHeader) {
          headersNeedUpdate = true;
          Logger.log('Header mismatch at column ' + (i + 1) + ': Expected "' + expectedHeader + '", found "' + currentHeader + '"');
          break;
        }
      }
    }
    
    if (headersNeedUpdate) {
      Logger.log('🔄 Enforcing 8-column structure...');
      
      // Ensure we have exactly 8 columns
      if (lastCol < 8) {
        const missingCols = 8 - lastCol;
        sheet.insertColumns(lastCol + 1, missingCols);
        Logger.log('✅ Added ' + missingCols + ' missing columns');
      } else if (lastCol > 8) {
        const numColsToDelete = lastCol - 8;
        sheet.deleteColumns(9, numColsToDelete);
        SpreadsheetApp.flush();
        Logger.log('✅ Removed ' + numColsToDelete + ' extra columns');
      }
      
      // Set correct headers
      sheet.getRange(1, 1, 1, 8).setValues([expectedHeaders]);
      sheet.getRange(1, 1, 1, 8).setFontWeight('bold');
      sheet.getRange(1, 1, 1, 8).setBackground('#0369a1');
      sheet.getRange(1, 1, 1, 8).setFontColor('#ffffff');
      SpreadsheetApp.flush();
      Logger.log('✅ Headers updated to 8-column structure');
      return true;
    }
    
    return false; // No changes needed
  } catch (error) {
    Logger.log('Error enforcing 8-column structure: ' + error.toString());
    return false;
  }
}


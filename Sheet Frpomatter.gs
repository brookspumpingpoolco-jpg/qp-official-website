/**
 * Sheet Formatter - Professional Payment History & Invoice Formatting
 * 
 * Creates beautiful, professional sheets with logos, dropdowns, and formatting
 * Call using: formatPaymentHistorySheet() or formatInvoiceSheet()
 */

// ========================================
// FORMAT PAYMENT HISTORY SHEET
// ========================================

/**
 * Format Payment History sheet with logo row, dropdowns, and professional styling
 */
function formatPaymentHistorySheet() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName('Payment History');
    
    if (!sheet) {
      Logger.log('❌ Payment History sheet not found');
      return { success: false, error: 'Payment History sheet not found' };
    }
    
    // Step 1: Add logo/header row at the top
    sheet.insertRows(1);
    const logoCell = sheet.getRange('A1');
    logoCell.setValue('💳 PAYMENT HISTORY - A Quality Pool Company');
    logoCell.setFontSize(18);
    logoCell.setFontWeight('bold');
    logoCell.setFontColor('#0369a1'); // Professional blue
    logoCell.setBackground('#e0f2fe'); // Light blue background
    
    // Merge logo cell across all columns
    sheet.getRange('A1:K1').merge();
    sheet.getRange('A1:K1').setVerticalAlignment('middle');
    sheet.getRange('A1:K1').setHorizontalAlignment('center');
    sheet.setRowHeight(1, 35);
    
    // Step 2: Format header row (now row 2)
    const headerRow = sheet.getRange('A2:K2');
    
    // Set header text - includes Email, Description, and Fee from CSV
    const headers = ['Date', 'Invoice ID', 'Company ID', 'Amount', 'Payment Method', 'Transaction ID', 'Status', 'Email', 'Description', 'Fee', 'Notes'];
    for (let i = 0; i < headers.length; i++) {
      sheet.getRange(2, i + 1).setValue(headers[i]);
    }
    
    headerRow.setFontWeight('bold');
    headerRow.setFontColor('#ffffff'); // White text
    headerRow.setBackground('#1e40af'); // Dark blue background
    headerRow.setFontSize(11);
    headerRow.setHorizontalAlignment('center');
    headerRow.setVerticalAlignment('middle');
    sheet.setRowHeight(2, 25);
    
    // Step 3: Set column widths
    sheet.setColumnWidth(1, 140); // Date
    sheet.setColumnWidth(2, 130); // Invoice ID
    sheet.setColumnWidth(3, 130); // Company ID
    sheet.setColumnWidth(4, 120); // Amount
    sheet.setColumnWidth(5, 150); // Payment Method
    sheet.setColumnWidth(6, 170); // Transaction ID
    sheet.setColumnWidth(7, 120); // Status
    sheet.setColumnWidth(8, 180); // Email
    sheet.setColumnWidth(9, 200); // Description
    sheet.setColumnWidth(10, 100); // Fee
    sheet.setColumnWidth(11, 170); // Notes
    
    // Step 4: Add dropdowns and validation
    const lastRow = sheet.getLastRow();
    
    // Only apply formatting if there are data rows
    if (lastRow > 2) {
      const dataRange = sheet.getRange(3, 1, lastRow - 2, 11);
      
      // Payment Method dropdown (Column E)
      const paymentMethodRange = sheet.getRange(3, 5, lastRow - 2, 1);
      const paymentMethodRule = SpreadsheetApp.newDataValidation()
        .requireValueInList(['Stripe', 'Check', 'ACH', 'Cash', 'Credit Card', 'Wire Transfer', 'PayPal', 'Manual'])
        .setAllowInvalid(false)
        .setHelpText('Select payment method')
        .build();
      paymentMethodRange.setDataValidation(paymentMethodRule);
      
      // Status dropdown (Column G)
      const statusRange = sheet.getRange(3, 7, lastRow - 2, 1);
      const statusRule = SpreadsheetApp.newDataValidation()
        .requireValueInList(['Completed', 'Pending', 'Failed', 'Refunded'])
        .setAllowInvalid(false)
        .setHelpText('Select payment status')
        .build();
      statusRange.setDataValidation(statusRule);
      
      // Step 5: Format data rows
      for (let row = 3; row <= lastRow; row++) {
        // Alternate row colors for readability
        if (row % 2 === 0) {
          sheet.getRange(row, 1, 1, 11).setBackground('#f8fafc'); // Light gray
        } else {
          sheet.getRange(row, 1, 1, 11).setBackground('#ffffff'); // White
        }
        
        // Format Amount column as currency (Column D)
        sheet.getRange(row, 4).setNumberFormat('$#,##0.00');
        
        // Format Fee column as currency (Column J)
        sheet.getRange(row, 10).setNumberFormat('$#,##0.00');
        
        // Format Date column (Column A)
        sheet.getRange(row, 1).setNumberFormat('MMM dd, yyyy HH:mm');
        
        // Center align numeric columns
        sheet.getRange(row, 4).setHorizontalAlignment('right'); // Amount
        sheet.getRange(row, 7).setHorizontalAlignment('center'); // Status
        sheet.getRange(row, 10).setHorizontalAlignment('right'); // Fee
      }
      
      // Step 6: Add borders to all data
      dataRange.setBorder(true, true, true, true, true, true);
    }
    
    // Add borders to header row
    headerRow.setBorder(true, true, true, true, false, false);
    
    // Step 7: Freeze header rows
    sheet.setFrozenRows(2); // Freeze logo + header row
    
    Logger.log('✅ Payment History sheet formatted beautifully!');
    
    return { 
      success: true, 
      message: 'Payment History sheet formatted successfully',
      details: {
        logoRow: 'Row 1',
        headerRow: 'Row 2',
        dataStartRow: 'Row 3',
        dropdowns: ['Payment Method', 'Status'],
        columns: 11
      }
    };
  } catch (error) {
    Logger.log('Error formatting Payment History: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

// ========================================
// FORMAT INVOICE ESTIMATES SHEET
// ========================================

/**
 * Format Invoices & Estimates sheet with professional styling
 */
function formatInvoiceSheet() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName('Invoices & Estimates');
    
    if (!sheet) {
      Logger.log('❌ Invoices & Estimates sheet not found');
      return { success: false, error: 'Invoices & Estimates sheet not found' };
    }
    
    // Step 1: Add logo/header row
    sheet.insertRows(1);
    const logoCell = sheet.getRange('A1');
    logoCell.setValue('📄 INVOICES & ESTIMATES - A Quality Pool Company');
    logoCell.setFontSize(18);
    logoCell.setFontWeight('bold');
    logoCell.setFontColor('#0369a1');
    logoCell.setBackground('#e0f2fe');
    
    sheet.getRange('A1:H1').merge();
    sheet.getRange('A1:H1').setVerticalAlignment('middle');
    sheet.getRange('A1:H1').setHorizontalAlignment('center');
    sheet.setRowHeight(1, 35);
    
    // Step 2: Format header row (now row 2)
    const headerRow = sheet.getRange('A2:H2');
    
    // Set header text if not already present
    const headers = ['Company ID', 'Invoice ID', 'Customer Email', 'JSON Data 1', 'JSON Data 2', 'JSON Data 3', 'Total', 'Payment Schedule'];
    for (let i = 0; i < headers.length; i++) {
      sheet.getRange(2, i + 1).setValue(headers[i]);
    }
    
    headerRow.setFontWeight('bold');
    headerRow.setFontColor('#ffffff');
    headerRow.setBackground('#1e40af');
    headerRow.setFontSize(11);
    headerRow.setHorizontalAlignment('center');
    sheet.setRowHeight(2, 25);
    
    // Step 3: Set column widths
    sheet.setColumnWidth(1, 120); // Company ID
    sheet.setColumnWidth(2, 130); // Invoice ID
    sheet.setColumnWidth(3, 160); // Customer Email
    sheet.setColumnWidth(4, 180); // JSON Data 1
    sheet.setColumnWidth(5, 180); // JSON Data 2
    sheet.setColumnWidth(6, 180); // JSON Data 3
    sheet.setColumnWidth(7, 120); // Total
    sheet.setColumnWidth(8, 140); // Payment Schedule
    
    // Step 4: Format data rows
    const lastRow = sheet.getLastRow();
    
    // Only apply formatting if there are data rows
    if (lastRow > 2) {
      for (let row = 3; row <= lastRow; row++) {
        if (row % 2 === 0) {
          sheet.getRange(row, 1, 1, 8).setBackground('#f8fafc');
        } else {
          sheet.getRange(row, 1, 1, 8).setBackground('#ffffff');
        }
        
        // Format Total column as currency
        sheet.getRange(row, 7).setNumberFormat('$#,##0.00');
        sheet.getRange(row, 7).setHorizontalAlignment('right');
      }
      
      // Step 5: Add borders
      sheet.getRange(3, 1, lastRow - 2, 8).setBorder(true, true, true, true, true, true);
    }
    
    // Add borders to header row
    headerRow.setBorder(true, true, true, true, false, false);
    
    // Step 6: Freeze header rows
    sheet.setFrozenRows(2);
    
    Logger.log('✅ Invoices & Estimates sheet formatted!');
    
    return { 
      success: true, 
      message: 'Invoices & Estimates sheet formatted successfully'
    };
  } catch (error) {
    Logger.log('Error formatting Invoices sheet: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

// ========================================
// FORMAT ANY CUSTOM SHEET
// ========================================

/**
 * Format any sheet with professional styling
 * @param {string} sheetName - Name of sheet to format
 * @param {object} options - Formatting options
 */
function formatCustomSheet(sheetName, options) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(sheetName);
    
    if (!sheet) {
      return { success: false, error: 'Sheet not found: ' + sheetName };
    }
    
    // Default options
    options = options || {};
    const logoText = options.logoText || '📊 ' + sheetName.toUpperCase();
    const logoColor = options.logoColor || '#0369a1';
    const logoBg = options.logoBgColor || '#e0f2fe';
    const headerColor = options.headerColor || '#1e40af';
    const columns = options.columns || 8;
    
    // Add logo row
    sheet.insertRows(1);
    const logoCell = sheet.getRange('A1');
    logoCell.setValue(logoText);
    logoCell.setFontSize(16);
    logoCell.setFontWeight('bold');
    logoCell.setFontColor(logoColor);
    logoCell.setBackground(logoBg);
    
    sheet.getRange(1, 1, 1, columns).merge();
    sheet.getRange(1, 1, 1, columns).setVerticalAlignment('middle');
    sheet.getRange(1, 1, 1, columns).setHorizontalAlignment('center');
    sheet.setRowHeight(1, 35);
    
    // Format header row
    const headerRow = sheet.getRange(2, 1, 1, columns);
    headerRow.setFontWeight('bold');
    headerRow.setFontColor('#ffffff');
    headerRow.setBackground(headerColor);
    headerRow.setFontSize(11);
    headerRow.setHorizontalAlignment('center');
    sheet.setRowHeight(2, 25);
    
    // Format data rows
    const lastRow = sheet.getLastRow();
    
    // Only apply formatting if there are data rows
    if (lastRow > 2) {
      for (let row = 3; row <= lastRow; row++) {
        if (row % 2 === 0) {
          sheet.getRange(row, 1, 1, columns).setBackground('#f8fafc');
        } else {
          sheet.getRange(row, 1, 1, columns).setBackground('#ffffff');
        }
      }
      
      // Add borders
      sheet.getRange(3, 1, lastRow - 2, columns).setBorder(true, true, true, true, true, true);
    }
    
    // Add borders to header row
    headerRow.setBorder(true, true, true, true, false, false);
    
    // Freeze header rows
    sheet.setFrozenRows(2);
    
    Logger.log('✅ Sheet formatted: ' + sheetName);
    
    return { 
      success: true, 
      message: 'Sheet ' + sheetName + ' formatted successfully'
    };
  } catch (error) {
    Logger.log('Error formatting sheet: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

// ========================================
// ADD MENU ITEMS FOR EASY ACCESS
// ========================================

/**
 * Create custom menu items in Google Sheets
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('💳 Sheet Formatter')
    .addItem('Format Payment History', 'formatPaymentHistorySheet')
    .addItem('Format Invoices & Estimates', 'formatInvoiceSheet')
    .addSeparator()
    .addItem('🟢 Import Stripe Payments', 'importStripePaymentsPreFilled')
    .addItem('Reset Formatting (Delete & Rebuild)', 'resetPaymentHistorySheet')
    .addToUi();
}

// ========================================
// RESET SHEET (Delete and Rebuild)
// ========================================

/**
 * Delete Payment History sheet and rebuild it from scratch (fresh formatting)
 */
function resetPaymentHistorySheet() {
  try {
    const ui = SpreadsheetApp.getUi();
    const response = ui.alert('⚠️ This will DELETE the Payment History sheet and rebuild it. Continue?', ui.ButtonSet.YES_NO);
    
    if (response !== ui.Button.YES) {
      Logger.log('Reset cancelled by user');
      return { success: false, message: 'Reset cancelled' };
    }
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName('Payment History');
    
    if (sheet) {
      spreadsheet.deleteSheet(sheet);
      Logger.log('✅ Payment History sheet deleted');
    }
    
    // Rebuild fresh sheet - using exact signature from InvoiceEstimate.gs
    recordPaymentHistory('DEMO-001', 0, 'DEMO', 'Demo', 'CMP-AQUALITYPOOL');
    
    // Re-format
    formatPaymentHistorySheet();
    
    ui.alert('✅ Payment History sheet rebuilt and formatted!');
    return { success: true, message: 'Sheet reset and reformatted' };
    
  } catch (error) {
    Logger.log('Error resetting sheet: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

// ========================================
// ALTERNATIVE: DASHBOARD SHEET WITH CHARTS
// ========================================

/**
 * Create a professional dashboard sheet
 */
function createDashboardSheet() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let dashboardSheet = spreadsheet.getSheetByName('Dashboard');
    
    if (!dashboardSheet) {
      dashboardSheet = spreadsheet.insertSheet('Dashboard', 0);
    }
    
    // Logo row
    dashboardSheet.setRowHeight(1, 50);
    const logoCell = dashboardSheet.getRange('A1:D1');
    logoCell.merge();
    logoCell.setValue('📊 PAYMENT DASHBOARD - A Quality Pool Company');
    logoCell.setFontSize(20);
    logoCell.setFontWeight('bold');
    logoCell.setFontColor('#ffffff');
    logoCell.setBackground('#0369a1');
    logoCell.setHorizontalAlignment('center');
    logoCell.setVerticalAlignment('middle');
    
    // Add key metrics
    const metricsStart = 3;
    dashboardSheet.getRange('A3').setValue('Total Revenue');
    dashboardSheet.getRange('B3').setValue('=SUMIF(\'Payment History\'!G:G,"Completed",\'Payment History\'!D:D)');
    dashboardSheet.getRange('B3').setNumberFormat('$#,##0.00');
    dashboardSheet.getRange('B3').setFontSize(14).setFontWeight('bold').setFontColor('#10b981');
    
    dashboardSheet.getRange('A5').setValue('Payments Received');
    dashboardSheet.getRange('B5').setValue('=COUNTIF(\'Payment History\'!G:G,"Completed")');
    dashboardSheet.getRange('B5').setFontSize(14).setFontWeight('bold').setFontColor('#3b82f6');
    
    dashboardSheet.getRange('A7').setValue('Pending Payments');
    dashboardSheet.getRange('B7').setValue('=COUNTIF(\'Payment History\'!G:G,"Pending")');
    dashboardSheet.getRange('B7').setFontSize(14).setFontWeight('bold').setFontColor('#f59e0b');
    
    dashboardSheet.getRange('A9').setValue('Average Payment');
    dashboardSheet.getRange('B9').setValue('=AVERAGEIF(\'Payment History\'!G:G,"Completed",\'Payment History\'!D:D)');
    dashboardSheet.getRange('B9').setNumberFormat('$#,##0.00');
    dashboardSheet.getRange('B9').setFontSize(14).setFontWeight('bold').setFontColor('#8b5cf6');
    
    // Format cells
    dashboardSheet.setColumnWidth(1, 180);
    dashboardSheet.setColumnWidth(2, 150);
    
    Logger.log('✅ Dashboard sheet created!');
    return { success: true, message: 'Dashboard sheet created' };
    
  } catch (error) {
    Logger.log('Error creating dashboard: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

// ========================================
// STRIPE PAYMENT IMPORTER
// ========================================

/**
 * Helper function to concatenate JSON chunks (matching InvoiceEstimate.gs)
 */
function concatenateJsonChunks(chunk1, chunk2, chunk3) {
  let result = String(chunk1 || '').trim();
  if (chunk2) result += String(chunk2).trim();
  if (chunk3) result += String(chunk3).trim();
  return result;
}

/**
 * Record payment in payment history with actual payment date, email, description, and fee
 * @param {string} invoiceId - Invoice ID
 * @param {number} amount - Payment amount
 * @param {string} transactionId - Transaction ID
 * @param {string} paymentMethod - Payment method
 * @param {string} companyId - Company ID
 * @param {Date|string} paymentDate - Actual payment date (optional, defaults to now)
 * @param {string} email - Customer email (optional)
 * @param {string} description - Payment description (optional)
 * @param {number} fee - Payment fee (optional)
 */
function recordPaymentHistoryWithDate(invoiceId, amount, transactionId, paymentMethod, companyId, paymentDate, email, description, fee) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = spreadsheet.getSheetByName('Payment History');
    
    if (!sheet) {
      sheet = spreadsheet.insertSheet('Payment History');
      const headers = ['Date', 'Invoice ID', 'Company ID', 'Amount', 'Payment Method', 'Transaction ID', 'Status', 'Email', 'Description', 'Fee', 'Notes'];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    }
    
    // Parse payment date - handle both Date objects and date strings
    let dateValue = new Date();
    if (paymentDate) {
      if (typeof paymentDate === 'string') {
        // Parse date string like "2026-02-07 16:54:39"
        const parsedDate = new Date(paymentDate.replace(' ', 'T') + 'Z'); // Add Z for UTC
        if (!isNaN(parsedDate.getTime())) {
          dateValue = parsedDate;
        }
      } else if (paymentDate instanceof Date) {
        dateValue = paymentDate;
      }
    }
    
    sheet.appendRow([
      dateValue,
      invoiceId,
      companyId || 'CMP-AQUALITYPOOL',
      amount,
      paymentMethod || 'Stripe',
      transactionId || '',
      'Completed',
      email || '',
      description || '',
      fee || 0,
      ''
    ]);
    
    Logger.log('Payment recorded: Invoice ' + invoiceId + ', Amount: $' + amount + ', Date: ' + dateValue.toISOString() + ', Email: ' + (email || 'N/A') + ', Company: ' + (companyId || 'CMP-AQUALITYPOOL'));
    
    return { success: true };
  } catch (error) {
    Logger.log('Error recording payment history: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Import pre-filled Stripe payments from CSV and record all backdated payments
 * Matches invoices by email (Column C and JSON data in Columns 4-6)
 * Highlights fully-paid invoices in green
 */
function importStripePaymentsPreFilled() {
  try {
    // Try to get a UI; if not available (editor/headless), proceed without prompt
    let ui = null;
    try {
      ui = SpreadsheetApp.getUi();
    } catch (e) {
      ui = null;
    }

    if (ui) {
      const response = ui.alert(
        '🟢 Import Stripe Payments\n\nThis will import all paid Stripe payments from CSV, record them, and highlight fully-paid invoices in green.\n\nContinue?',
        ui.ButtonSet.YES_NO
      );
      if (response !== ui.Button.YES) {
        Logger.log('Import cancelled by user');
        return;
      }
    } else {
      Logger.log('Spreadsheet UI not available; running import headless');
    }
    
    // Use data from unified_payments.csv (hardcoded in getPrefilledStripePaymentData)
    const paymentData = getPrefilledStripePaymentData();
    Logger.log('Starting import of ' + paymentData.length + ' Stripe payments from CSV data...');
    
    Logger.log('Starting import of ' + paymentData.length + ' Stripe payments from CSV...');
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const invoicesSheet = spreadsheet.getSheetByName('Invoices & Estimates');
    
    if (!invoicesSheet) {
      Logger.log('❌ Invoices & Estimates sheet not found');
      if (ui) ui.alert('❌ Invoices & Estimates sheet not found');
      return;
    }
    
    // Track payments per invoice
    const invoicePayments = {}; // { invoiceId: { total: amount, paid: sum of payments } }
    const invoiceData = {}; // { invoiceId: { row, jsonData, invoiceTotal } }
    
    // First, read all invoices and build lookup by email
    const lastRow = invoicesSheet.getLastRow();
    const sheetCols = invoicesSheet.getLastColumn();
    const is8Column = (sheetCols >= 8);
    const idCol = is8Column ? 2 : 1;
    const emailCol = is8Column ? 3 : 2;
    const json1Col = is8Column ? 4 : 3;
    const json2Col = is8Column ? 5 : 4;
    const json3Col = is8Column ? 6 : 5;
    const companyIdCol = is8Column ? 1 : 0;
    
    Logger.log('Reading ' + (lastRow - 1) + ' invoices from sheet...');
    
    // Build email-to-invoice mapping
    const emailToInvoices = {}; // { email: [invoiceIds] }
    
    for (let r = 2; r <= lastRow; r++) {
      try {
        const invoiceId = String(invoicesSheet.getRange(r, idCol).getValue() || '').trim();
        if (!invoiceId) continue;
        
        // Read email from column C
        const columnEmail = String(invoicesSheet.getRange(r, emailCol).getValue() || '').trim().toLowerCase();
        
        // Read JSON data
        const jsonPart1 = invoicesSheet.getRange(r, json1Col).getValue() || '';
        const jsonPart2 = invoicesSheet.getRange(r, json2Col).getValue() || '';
        const jsonPart3 = invoicesSheet.getRange(r, json3Col).getValue() || '';
        let jsonStr = concatenateJsonChunks(jsonPart1, jsonPart2, jsonPart3);
        
        if (!jsonStr || jsonStr.length === 0) {
          jsonStr = String(jsonPart1 || '').trim();
        }
        
        let jsonData = null;
        let jsonEmail = '';
        let invoiceTotal = 0;
        
        if (jsonStr && jsonStr.startsWith('{')) {
          try {
            jsonData = JSON.parse(jsonStr);
            jsonEmail = String(jsonData.customerEmail || '').trim().toLowerCase();
            invoiceTotal = parseFloat(jsonData.total) || 0;
          } catch (e) {
            Logger.log('⚠️ Error parsing JSON for invoice ' + invoiceId + ': ' + e.toString());
          }
        }
        
        // Store invoice data
        invoiceData[invoiceId] = {
          row: r,
          jsonData: jsonData,
          invoiceTotal: invoiceTotal,
          columnEmail: columnEmail,
          jsonEmail: jsonEmail
        };
        
        // Add to email mapping (use both column email and JSON email)
        if (columnEmail) {
          if (!emailToInvoices[columnEmail]) emailToInvoices[columnEmail] = [];
          if (emailToInvoices[columnEmail].indexOf(invoiceId) === -1) {
            emailToInvoices[columnEmail].push(invoiceId);
          }
        }
        if (jsonEmail && jsonEmail !== columnEmail) {
          if (!emailToInvoices[jsonEmail]) emailToInvoices[jsonEmail] = [];
          if (emailToInvoices[jsonEmail].indexOf(invoiceId) === -1) {
            emailToInvoices[jsonEmail].push(invoiceId);
          }
        }
      } catch (e) {
        Logger.log('⚠️ Error reading invoice row ' + r + ': ' + e.toString());
      }
    }
    
    Logger.log('Found ' + Object.keys(invoiceData).length + ' invoices');
    
    // Sort payments by date (oldest to newest)
    paymentData.sort((a, b) => {
      const dateA = new Date(a['Created date (UTC)'].replace(' ', 'T') + 'Z');
      const dateB = new Date(b['Created date (UTC)'].replace(' ', 'T') + 'Z');
      return dateA - dateB; // Oldest first
    });
    
    Logger.log('✅ Sorted ' + paymentData.length + ' payments chronologically (oldest to newest)');
    
    // Process each payment from CSV
    let successCount = 0;
    let failCount = 0;
    
    paymentData.forEach(payment => {
      try {
        const paymentEmail = String(payment['Customer Email'] || '').trim().toLowerCase();
        if (!paymentEmail) {
          failCount++;
          return;
        }

        const amount = parseFloat(payment.Amount) || 0;
        if (amount <= 0) {
          failCount++;
          return;
        }
        
        const paymentDate = payment['Created date (UTC)'] || new Date().toISOString();
        const transactionId = payment.id || ('IMP-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9));
        const description = String(payment.Description || '').trim();
        
        // Find matching invoices by email
        const matchingInvoiceIds = emailToInvoices[paymentEmail] || [];
        
        const fee = parseFloat(payment.Fee) || 0;
        const email = payment['Customer Email'] || '';
        
        if (matchingInvoiceIds.length === 0) {
          // No invoice found - record as N/A with actual payment date, email, description, and fee
          recordPaymentHistoryWithDate('N/A', amount, transactionId, 'Stripe', 'CMP-AQUALITYPOOL', paymentDate, email, description, fee);
          Logger.log('⚠️ No invoice found for ' + paymentEmail + ' — recorded as N/A: $' + amount.toFixed(2));
          failCount++;
          return;
        }
        
        // For now, match to first invoice (could be enhanced to match by amount)
        const invoiceId = matchingInvoiceIds[0];
        const invoice = invoiceData[invoiceId];
        
        if (!invoice) {
          failCount++;
          return;
        }
        
        // Record payment in Payment History with actual payment date, email, description, and fee
        const companyId = invoicesSheet.getRange(invoice.row, companyIdCol).getValue() || 'CMP-AQUALITYPOOL';
        recordPaymentHistoryWithDate(invoiceId, amount, transactionId, 'Stripe', companyId, paymentDate, email, description, fee);
        
        // Track payment for this invoice
        if (!invoicePayments[invoiceId]) {
          invoicePayments[invoiceId] = { total: invoice.invoiceTotal, paid: 0 };
        }
        invoicePayments[invoiceId].paid += amount;
        
        successCount++;
        Logger.log('✅ Payment recorded: ' + paymentEmail + ' - $' + amount.toFixed(2) + ' -> Invoice ' + invoiceId);
        
      } catch (error) {
        failCount++;
        Logger.log('❌ Error processing payment: ' + error.toString());
      }
    });
    
    // Now highlight fully-paid invoices (totalPaid >= invoiceTotal - 0.01)
      let highlightCount = 0;
    Object.keys(invoicePayments).forEach(invoiceId => {
      const payment = invoicePayments[invoiceId];
      const invoice = invoiceData[invoiceId];
      
      if (invoice && payment.paid >= payment.total - 0.01) {
        // Fully paid - highlight green
        try {
          invoicesSheet.getRange(invoice.row, 1, 1, sheetCols).setBackground('#d4edda');
          invoicesSheet.getRange(invoice.row, 1, 1, sheetCols).setFontColor('#155724');
              highlightCount++;
          Logger.log('🟢 Highlighted fully-paid invoice: ' + invoiceId + ' ($' + payment.paid.toFixed(2) + ' / $' + payment.total.toFixed(2) + ')');
          } catch (e) {
          Logger.log('⚠️ Error highlighting invoice ' + invoiceId + ': ' + e.toString());
          }
        }
      });
    
    if (ui) {
      ui.alert(
        '✅ Import Complete!\n\n' +
        'Payments Processed: ' + successCount + '\n' +
        'Failed: ' + failCount + '\n' +
        'Fully-Paid Invoices Highlighted: ' + highlightCount + '\n\n' +
        'Check Payment History sheet for details.'
      );
    } else {
      Logger.log('Import Complete - Processed: ' + successCount + ', Failed: ' + failCount + ', Highlighted: ' + highlightCount);
    }
    
    Logger.log('✅ Stripe import complete!');
    
  } catch (error) {
    Logger.log('Error in importStripePaymentsPreFilled: ' + error.toString());
    try {
      const ui2 = SpreadsheetApp.getUi();
      ui2.alert('❌ Error: ' + error.toString());
    } catch (e) {
      Logger.log('No UI available to alert error: ' + error.toString());
    }
  }
}

/**
 * Parse CSV content into array of objects
 * Handles quoted fields and commas within quotes
 */
function parseCSV(csvContent) {
  const lines = csvContent.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];
  
  // Parse headers
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);
  
  const data = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = (values[index] || '').trim();
    });
    // Only include "Paid" status payments with valid amounts
    if (obj.Status === 'Paid' && obj.Amount && parseFloat(obj.Amount) > 0) {
      data.push(obj);
    }
  }
  
  return data;
}

/**
 * Parse a single CSV line, handling quoted fields
 */
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add last field
  values.push(current);
  
  return values.map(v => v.trim().replace(/^"|"$/g, ''));
}

/**
 * Return the prefilled Stripe payment data array from unified_payments.csv
 * Extracted so the importer can be run without a UI prompt (from the editor).
 */
function getPrefilledStripePaymentData() {
  return [
    { "id": "ch_3SyEmJKD1FHpDEfg0akkpbMq", "Created date (UTC)": "2026-02-07 16:54:39", "Amount": "275.00", "Customer Email": "Prospectkennel2@gmail.com", "Description": "Driveway", "Fee": "8.28", "Status": "Paid" },
    { "id": "ch_3SxccxKD1FHpDEfg1os9K0zf", "Created date (UTC)": "2026-02-06 00:10:36", "Amount": "257.25", "Customer Email": "doug.whitlock@eku.edu", "Description": "Snow clear 2387 Lancaster rd", "Fee": "7.00", "Status": "Paid" },
    { "id": "ch_3SxXeeKD1FHpDEfg0yiMsCKE", "Created date (UTC)": "2026-02-05 18:51:53", "Amount": "282.97", "Customer Email": "kmeyer4118@gmail.com", "Description": "", "Fee": "8.51", "Status": "Paid" },
    { "id": "ch_3SxDcpKD1FHpDEfg1w5yN4YL", "Created date (UTC)": "2026-02-04 21:28:39", "Amount": "875.00", "Customer Email": "kevin.justice@uss.salvationarmy.org", "Description": "", "Fee": "25.68", "Status": "Paid" },
    { "id": "ch_3SxBshKD1FHpDEfg0ofeAL73", "Created date (UTC)": "2026-02-04 19:37:08", "Amount": "125.00", "Customer Email": "", "Description": "Snow Clearing", "Fee": "3.43", "Status": "Paid" },
    { "id": "ch_3SwvIjKD1FHpDEfg0bThREXg", "Created date (UTC)": "2026-02-04 01:54:42", "Amount": "150.00", "Customer Email": "nolandevaughn@gmail.com", "Description": "", "Fee": "4.65", "Status": "Paid" },
    { "id": "ch_3SwY44KD1FHpDEfg1pO8bhzS", "Created date (UTC)": "2026-02-03 01:06:01", "Amount": "200.00", "Customer Email": "Kylakegirl77@gmail.com", "Description": "", "Fee": "6.10", "Status": "Paid" },
    { "id": "ch_3SwWcSKD1FHpDEfg0MY1CXt0", "Created date (UTC)": "2026-02-02 23:33:25", "Amount": "200.00", "Customer Email": "mattbegg@roadrunner.com", "Description": "", "Fee": "6.10", "Status": "Paid" },
    { "id": "ch_3Sw92WKD1FHpDEfg1caOdm93", "Created date (UTC)": "2026-02-01 22:22:45", "Amount": "257.25", "Customer Email": "linnry@gmail.com", "Description": "", "Fee": "7.76", "Status": "Paid" },
    { "id": "ch_3Svmr0KD1FHpDEfg1eMwAh3q", "Created date (UTC)": "2026-01-31 22:41:23", "Amount": "239.96", "Customer Email": "thechrismay@gmail.com", "Description": "", "Fee": "7.26", "Status": "Paid" },
    { "id": "ch_3SvU4wKD1FHpDEfg1yhgmIAx", "Created date (UTC)": "2026-01-31 05:38:51", "Amount": "239.96", "Customer Email": "Knkelley@kw.com", "Description": "", "Fee": "7.26", "Status": "Paid" },
    { "id": "ch_3SvRfUKD1FHpDEfg1a8UZzDv", "Created date (UTC)": "2026-01-31 00:04:05", "Amount": "681.73", "Customer Email": "llburdine@gmail.com", "Description": "", "Fee": "20.07", "Status": "Paid" },
    { "id": "ch_3SvKbvKD1FHpDEfg0pRTQEj2", "Created date (UTC)": "2026-01-30 16:34:09", "Amount": "245.42", "Customer Email": "gina.pinto@yahoo.com", "Description": "", "Fee": "7.42", "Status": "Paid" },
    { "id": "ch_3SvHw0KD1FHpDEfg0lIkW0eX", "Created date (UTC)": "2026-01-30 13:40:29", "Amount": "163.61", "Customer Email": "dawnfmosley@gmail.com", "Description": "", "Fee": "5.04", "Status": "Paid" },
    { "id": "ch_3Sv3jPKD1FHpDEfg15uxfzP9", "Created date (UTC)": "2026-01-29 22:31:25", "Amount": "196.60", "Customer Email": "leeann.morrison@eku.edu", "Description": "", "Fee": "6.00", "Status": "Paid" },
    { "id": "ch_3SujiBKD1FHpDEfg0mZn9sGS", "Created date (UTC)": "2026-01-29 01:07:55", "Amount": "169.60", "Customer Email": "dougchrisman@me.com", "Description": "", "Fee": "5.22", "Status": "Paid" },
    { "id": "ch_3Ss8zCKD1FHpDEfg0d4j8SKi", "Created date (UTC)": "2026-01-21 21:30:47", "Amount": "136.88", "Customer Email": "hatmakers@gmail.com", "Description": "", "Fee": "4.27", "Status": "Paid" },
    { "id": "ch_3SqMr4KD1FHpDEfg18yGoYBq", "Created date (UTC)": "2026-01-16 23:55:04", "Amount": "632.50", "Customer Email": "marshalpee@icloud.com", "Description": "", "Fee": "18.64", "Status": "Paid" }
  ];
}

/**
 * Core processor for Stripe payment arrays. Returns a summary object.
 * options: { showUi: boolean }
 */
function processStripePaymentData(paymentData, options) {
  options = options || {};
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let successCount = 0;
  let failCount = 0;
  let matchedInvoices = [];

  paymentData.forEach(payment => {
    try {
      let lookup = String(payment['Customer Email'] || '').trim();
      const description = String(payment.Description || '').trim();
      if (!lookup && description) lookup = description;
      if (!lookup) {
        failCount++;
        return;
      }

      const amount = parseFloat(payment.Amount) || 0;
      const paymentDate = payment['Created date (UTC)'] || new Date().toISOString();

      const importTxn = 'IMP-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);

      const res = recordPayment(lookup, amount, 'Stripe', paymentDate, description || 'Stripe Payment', '', true);
      if (res && res.success) {
        successCount++;
        matchedInvoices.push({ invoiceId: res.invoiceId || 'N/A', lookup: lookup, amount: amount });
      } else {
        const errMsg = res && res.error ? String(res.error) : 'unknown';
        if (errMsg.toLowerCase().indexOf('invoice not found') !== -1) {
          const fallback = recordPaymentHistory('N/A', amount, importTxn, 'Stripe', 'CMP-AQUALITYPOOL');
          if (fallback && fallback.success) {
            successCount++;
          } else {
            failCount++;
          }
        } else {
          failCount++;
        }
      }
    } catch (error) {
      failCount++;
    }
  });

  // Highlight matched invoices
  const invoicesSheet = spreadsheet.getSheetByName('Invoices & Estimates');
  let highlightCount = 0;
  if (invoicesSheet && matchedInvoices.length > 0) {
    const lastRow = invoicesSheet.getLastRow();
    const sheetCols = invoicesSheet.getLastColumn();
    const uniqueInvoiceIds = [...new Set(matchedInvoices.map(m => m.invoiceId).filter(id => id && id !== 'N/A'))];
    uniqueInvoiceIds.forEach(invId => {
      for (let r = 2; r <= lastRow; r++) {
        try {
          const rowId = String(invoicesSheet.getRange(r, 2).getValue() || '').trim();
          if (rowId === String(invId).trim()) {
            invoicesSheet.getRange(r, 1, 1, sheetCols).setBackground('#d4edda');
            invoicesSheet.getRange(r, 1, 1, sheetCols).setFontColor('#155724');
            highlightCount++;
            break;
          }
        } catch (e) {
          // Skip on error
        }
      }
    });
  }

  const summary = { successCount: successCount, failCount: failCount, highlighted: highlightCount, matchedInvoices: matchedInvoices };

  if (options.showUi) {
    const ui = SpreadsheetApp.getUi();
    ui.alert(
      '✅ Import Complete!\n\n' +
      'Payments Processed: ' + successCount + '\n' +
      'Failed: ' + failCount + '\n\n' +
      'Check Payment History sheet for details.\n' +
      'Fully-paid invoices highlighted in green!'
    );
  }

  return summary;
}

/**
 * Headless entrypoint so the importer can be executed from the editor.
 * Returns a JSON-like summary object and writes results to the spreadsheet.
 */
function importStripePaymentsPreFilledFromEditor() {
  const data = getPrefilledStripePaymentData();
  const result = processStripePaymentData(data, { showUi: false });
  Logger.log('importStripePaymentsPreFilledFromEditor result: ' + JSON.stringify(result));
  return result;
}

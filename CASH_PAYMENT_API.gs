/**
 * ===================================
 * CASH PAYMENT RECORDING API
 * ===================================
 * Add these functions to InvoiceEstimate.gs
 * 
 * This adds the ability to record cash/check payments
 * and track payment history with milestone support.
 */

/**
 * Record a cash/check payment for an invoice
 * Called from invoice viewer when staff records a manual payment
 */
function recordCashPayment(invoiceId, amount, paymentMethod, paymentDate, notes) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(INVOICES_ESTIMATES_SHEET);
    
    if (!sheet) {
      return { success: false, error: 'Invoices sheet not found' };
    }

    // Find the invoice
    enforce8ColumnStructure(sheet);
    const lastRow = sheet.getLastRow();
    const sheetCols = sheet.getLastColumn();
    const is8Column = (sheetCols >= 8);
    const idCol = is8Column ? 2 : 1;
    const json1Col = is8Column ? 4 : 3;
    const json2Col = is8Column ? 5 : 4;
    const json3Col = is8Column ? 6 : 5;
    const companyIdCol = is8Column ? 1 : 0;

    let foundRow = -1;
    let invoiceData = null;
    let companyId = 'CMP-AQUALITYPOOL';

    for (let i = 1; i < lastRow; i++) {
      const rowId = String(sheet.getRange(i + 1, idCol).getValue() || '').trim();
      if (rowId === invoiceId) {
        foundRow = i;
        companyId = is8Column ? (sheet.getRange(i + 1, companyIdCol).getValue() || 'CMP-AQUALITYPOOL') : 'CMP-AQUALITYPOOL';
        
        // Get current invoice data
        const jsonPart1 = sheet.getRange(i + 1, json1Col).getValue() || '';
        const jsonPart2 = sheet.getRange(i + 1, json2Col).getValue() || '';
        const jsonPart3 = sheet.getRange(i + 1, json3Col).getValue() || '';
        let jsonStr = concatenateJsonChunks(jsonPart1, jsonPart2, jsonPart3);
        
        if (jsonStr && jsonStr.startsWith('{')) {
          invoiceData = JSON.parse(jsonStr);
        }
        break;
      }
    }

    if (foundRow === -1 || !invoiceData) {
      return { success: false, error: 'Invoice not found' };
    }

    // Parse payment details
    const paymentAmount = parseFloat(amount) || 0;
    if (paymentAmount <= 0) {
      return { success: false, error: 'Invalid payment amount' };
    }

    const invoiceTotal = parseFloat(invoiceData.total || 0);
    const currentTotalPaid = parseFloat(invoiceData.totalPaid || 0);
    const newTotalPaid = currentTotalPaid + paymentAmount;
    const remainingBalance = invoiceTotal - newTotalPaid;

    // Generate unique transaction ID
    const transactionId = 'PAY-' + Date.now() + '-' + Math.random().toString(36).substring(7);

    // Create payment record
    const payment = {
      date: paymentDate || new Date().toISOString(),
      amount: paymentAmount,
      method: paymentMethod || 'Cash',
      transactionId: transactionId,
      status: 'Completed',
      notes: notes || ''
    };

    // Update invoice data
    if (!invoiceData.paymentHistory) {
      invoiceData.paymentHistory = [];
    }
    invoiceData.paymentHistory.push(payment);
    invoiceData.totalPaid = newTotalPaid;
    invoiceData.remainingBalance = remainingBalance;

    // Update payment status
    if (remainingBalance <= 0.01) {
      invoiceData.paymentStatus = 'Paid';
      invoiceData.status = 'Paid';
    } else if (newTotalPaid > 0) {
      invoiceData.paymentStatus = 'Partial';
    }

    // Save updated invoice data back to sheet
    const updatedJsonStr = JSON.stringify(invoiceData);
    const chunks = splitJsonString(updatedJsonStr);
    sheet.getRange(foundRow + 1, json1Col).setValue(chunks[0] || '');
    sheet.getRange(foundRow + 1, json2Col).setValue(chunks[1] || '');
    sheet.getRange(foundRow + 1, json3Col).setValue(chunks[2] || '');

    // Highlight row if fully paid (green background)
    if (remainingBalance <= 0.01) {
      const rowRange = sheet.getRange(foundRow + 1, 1, 1, sheet.getLastColumn());
      rowRange.setBackground('#d1fae5'); // Light green
    } else if (newTotalPaid > 0) {
      // Partial payment - yellow background
      const rowRange = sheet.getRange(foundRow + 1, 1, 1, sheet.getLastColumn());
      rowRange.setBackground('#fef3c7'); // Light yellow
    }

    // Record in payment history sheet
    recordPaymentHistory(
      invoiceId,
      paymentAmount,
      transactionId,
      paymentMethod || 'Cash',
      companyId,
      paymentDate || new Date(),
      invoiceData.customerEmail || '',
      notes || 'Manual payment recorded',
      0 // No fee for cash/check
    );

    // Send payment confirmation email
    if (invoiceData.customerEmail) {
      sendPaymentConfirmationEmail(
        invoiceData.customerEmail,
        invoiceData.customerName || 'Customer',
        invoiceId,
        paymentAmount,
        newTotalPaid,
        invoiceTotal
      );
    }

    return {
      success: true,
      invoiceId: invoiceId,
      paymentAmount: paymentAmount,
      transactionId: transactionId,
      totalPaid: newTotalPaid,
      invoiceTotal: invoiceTotal,
      remainingBalance: remainingBalance,
      paymentStatus: invoiceData.paymentStatus,
      message: remainingBalance <= 0.01 ? 'Invoice marked as fully paid' : 'Partial payment recorded'
    };

  } catch (error) {
    Logger.log('Error recording cash payment: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Get payment history for an invoice
 */
function getPaymentHistory(invoiceId) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(INVOICES_ESTIMATES_SHEET);
    
    if (!sheet) {
      return { success: false, error: 'Invoices sheet not found' };
    }

    // Find the invoice
    enforce8ColumnStructure(sheet);
    const lastRow = sheet.getLastRow();
    const sheetCols = sheet.getLastColumn();
    const is8Column = (sheetCols >= 8);
    const idCol = is8Column ? 2 : 1;
    const json1Col = is8Column ? 4 : 3;
    const json2Col = is8Column ? 5 : 4;
    const json3Col = is8Column ? 6 : 5;

    for (let i = 1; i < lastRow; i++) {
      const rowId = String(sheet.getRange(i + 1, idCol).getValue() || '').trim();
      if (rowId === invoiceId) {
        const jsonPart1 = sheet.getRange(i + 1, json1Col).getValue() || '';
        const jsonPart2 = sheet.getRange(i + 1, json2Col).getValue() || '';
        const jsonPart3 = sheet.getRange(i + 1, json3Col).getValue() || '';
        let jsonStr = concatenateJsonChunks(jsonPart1, jsonPart2, jsonPart3);
        
        if (jsonStr && jsonStr.startsWith('{')) {
          const invoiceData = JSON.parse(jsonStr);
          const paymentHistory = invoiceData.paymentHistory || [];
          const totalPaid = parseFloat(invoiceData.totalPaid || 0);
          const invoiceTotal = parseFloat(invoiceData.total || 0);
          const remainingBalance = invoiceTotal - totalPaid;

          return {
            success: true,
            payments: paymentHistory,
            totalPaid: totalPaid,
            invoiceTotal: invoiceTotal,
            remainingBalance: remainingBalance,
            paymentStatus: invoiceData.paymentStatus || 'Pending'
          };
        }
      }
    }

    return { success: false, error: 'Invoice not found' };
  } catch (error) {
    Logger.log('Error getting payment history: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Update the main doPost handler to include new actions
 * Add these cases to your existing doPost function:
 */

// In your doPost function, add these cases:
/*
case 'recordCashPayment':
  const recordResult = recordCashPayment(
    requestData.invoiceId,
    requestData.amount,
    requestData.paymentMethod,
    requestData.paymentDate,
    requestData.notes
  );
  return ContentService.createTextOutput(JSON.stringify(recordResult))
    .setMimeType(ContentService.MimeType.JSON);

case 'getPaymentHistory':
  const historyResult = getPaymentHistory(requestData.invoiceId);
  return ContentService.createTextOutput(JSON.stringify(historyResult))
    .setMimeType(ContentService.MimeType.JSON);
*/

/**
 * Helper function to split JSON into chunks for Google Sheets cells
 * (Already exists in your code, but included for reference)
 */
function splitJsonString(jsonStr) {
  const maxChunkSize = 50000;
  const chunks = [];
  
  if (jsonStr.length <= maxChunkSize) {
    chunks.push(jsonStr);
    return chunks;
  }
  
  let start = 0;
  while (start < jsonStr.length) {
    chunks.push(jsonStr.substring(start, start + maxChunkSize));
    start += maxChunkSize;
  }
  
  return chunks;
}

/**
 * Helper function to concatenate JSON chunks
 * (Already exists in your code, but included for reference)
 */
function concatenateJsonChunks(chunk1, chunk2, chunk3) {
  return (chunk1 || '') + (chunk2 || '') + (chunk3 || '');
}



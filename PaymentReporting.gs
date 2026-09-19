/**
 * ========================================
 * PAYMENT REPORTING - STANDALONE FILE
 * ========================================
 * 
 * This file handles manual payment reporting for invoices.
 * Add this file to your Apps Script project alongside InvoiceEstimate.gs
 * 
 * SETUP REQUIRED:
 * 1. Make sure these constants match your main file:
 *    - SPREADSHEET_ID
 *    - INVOICES_ESTIMATES_SHEET
 *    - PAYMENT_HISTORY_SHEET
 * 
 * 2. This file requires these functions from InvoiceEstimate.gs:
 *    - recordPaymentHistory()
 *    - sendPaymentConfirmationEmail()
 * 
 * 3. Add this to your doPost() switch statement in InvoiceEstimate.gs:
 *    case 'reportPayment':
 *      const paymentData = JSON.parse(e.parameter.data || '{}');
 *      result = reportManualPayment(
 *        paymentData.invoiceId,
 *        paymentData.amount,
 *        paymentData.paymentMethod || 'Manual',
 *        paymentData.transactionId || '',
 *        paymentData.notes || '',
 *        paymentData.paymentDate || new Date()
 *      );
 *      break;
 */

// ========================================
// CONSTANTS - Update these to match your main file
// ========================================
const SPREADSHEET_ID = '1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0';
const INVOICES_ESTIMATES_SHEET = 'Invoices & Estimates';
const PAYMENT_HISTORY_SHEET = 'Payment History';

/**
 * Report a manual payment for an invoice
 * This allows admins to record payments received outside of Stripe (cash, check, bank transfer, etc.)
 * 
 * @param {string} invoiceId - The invoice ID
 * @param {number} amount - Payment amount
 * @param {string} paymentMethod - Payment method (Cash, Check, Bank Transfer, etc.)
 * @param {string} transactionId - Optional transaction ID
 * @param {string} notes - Optional payment notes
 * @param {Date} paymentDate - Optional payment date (defaults to now)
 * @returns {object} - Success status and payment details
 */
function reportManualPayment(invoiceId, amount, paymentMethod, transactionId, notes, paymentDate) {
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
    const dataRows = invoiceSheet.getDataRange().getValues();
    const headers = dataRows[0];
    let invoiceRow = -1;
    let invoiceTotal = 0;
    let customerEmail = '';
    let customerName = '';
    let invoiceData = null;
    
    // Try to find invoice by ID (check multiple columns)
    for (let i = 1; i < dataRows.length; i++) {
      const rowId = String(dataRows[i][0] || '').trim();
      if (rowId === String(invoiceId).trim()) {
        invoiceRow = i + 1; // +1 because sheet rows are 1-indexed
        
        // Try to get invoice data from JSON columns
        try {
          const jsonCol1 = dataRows[i][headers.indexOf('JSON Part 1')] || dataRows[i][3] || '';
          const jsonCol2 = dataRows[i][headers.indexOf('JSON Part 2')] || dataRows[i][4] || '';
          const jsonCol3 = dataRows[i][headers.indexOf('JSON Part 3') || dataRows[i][5] || ''];
          let jsonStr = (jsonCol1 + jsonCol2 + jsonCol3).trim();
          
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
          const emailCol = headers.indexOf('Customer Email');
          const nameCol = headers.indexOf('Customer Name');
          const totalCol = headers.indexOf('Total');
          
          if (emailCol !== -1) customerEmail = dataRows[i][emailCol] || '';
          if (nameCol !== -1) customerName = dataRows[i][nameCol] || '';
          if (totalCol !== -1) invoiceTotal = parseFloat(dataRows[i][totalCol] || 0);
        }
        
        break;
      }
    }
    
    if (invoiceRow === -1) {
      return { success: false, error: 'Invoice not found: ' + invoiceId };
    }
    
    // Record payment in payment history (requires recordPaymentHistory from main file)
    try {
      const paymentResult = recordPaymentHistory(
        invoiceId, 
        parseFloat(amount), 
        transactionId || 'MANUAL-' + Date.now(), 
        paymentMethod || 'Manual'
      );
      
      if (!paymentResult || !paymentResult.success) {
        Logger.log('Warning: Failed to record payment history, but continuing...');
      }
    } catch (e) {
      Logger.log('Error calling recordPaymentHistory: ' + e.toString());
      // Continue anyway - we'll update the invoice status
    }
    
    // Calculate total paid so far
    const paymentHistorySheet = spreadsheet.getSheetByName(PAYMENT_HISTORY_SHEET);
    let totalPaid = parseFloat(amount); // Start with this payment
    
    if (paymentHistorySheet) {
      const paymentData = paymentHistorySheet.getDataRange().getValues();
      if (paymentData.length > 1) {
        const paymentHeaders = paymentData[0];
        const invoiceIdCol = paymentHeaders.indexOf('Invoice ID');
        const amountCol = paymentHeaders.indexOf('Amount');
        const statusCol = paymentHeaders.indexOf('Status');
        
        if (invoiceIdCol !== -1 && amountCol !== -1) {
          totalPaid = 0; // Recalculate from scratch
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
      
      // Update payment status
      if (totalPaid >= invoiceTotal - 0.01) {
        invoiceData.paymentStatus = 'Paid';
        invoiceData.paidDate = (paymentDate || new Date()).toISOString();
      } else if (totalPaid > 0) {
        invoiceData.paymentStatus = 'Partial';
        invoiceData.totalPaid = totalPaid;
        invoiceData.remainingBalance = invoiceTotal - totalPaid;
      }
      
      // Write updated JSON back to sheet
      try {
        const updatedJsonStr = JSON.stringify(invoiceData);
        const jsonCol1 = headers.indexOf('JSON Part 1');
        const jsonCol2 = headers.indexOf('JSON Part 2');
        const jsonCol3 = headers.indexOf('JSON Part 3');
        
        if (jsonCol1 !== -1) {
          // Split JSON if needed (for large invoices)
          const chunkSize = 50000; // Google Sheets cell limit
          const chunk1 = updatedJsonStr.substring(0, chunkSize);
          const chunk2 = updatedJsonStr.substring(chunkSize, chunkSize * 2);
          const chunk3 = updatedJsonStr.substring(chunkSize * 2);
          
          invoiceSheet.getRange(invoiceRow, jsonCol1 + 1).setValue(chunk1);
          if (jsonCol2 !== -1) invoiceSheet.getRange(invoiceRow, jsonCol2 + 1).setValue(chunk2 || '');
          if (jsonCol3 !== -1) invoiceSheet.getRange(invoiceRow, jsonCol3 + 1).setValue(chunk3 || '');
        }
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
    
    // Update payment schedule milestone if applicable
    const scheduleSheet = spreadsheet.getSheetByName('Payment Schedules');
    if (scheduleSheet) {
      try {
        const scheduleData = scheduleSheet.getDataRange().getValues();
        if (scheduleData.length > 1) {
          const scheduleHeaders = scheduleData[0];
          const invoiceIdCol = scheduleHeaders.indexOf('Invoice ID');
          const milestonesCol = scheduleHeaders.indexOf('Payment Milestones JSON');
          
          if (invoiceIdCol !== -1 && milestonesCol !== -1) {
            for (let i = 1; i < scheduleData.length; i++) {
              if (String(scheduleData[i][invoiceIdCol] || '').trim() === String(invoiceId).trim()) {
                try {
                  const milestones = JSON.parse(scheduleData[i][milestonesCol] || '[]');
                  // Find matching milestone and mark as paid
                  for (let j = 0; j < milestones.length; j++) {
                    if (milestones[j].status !== 'paid' && milestones[j].status !== 'Paid') {
                      // Mark first unpaid milestone as paid
                      milestones[j].status = 'Paid';
                      milestones[j].paidDate = (paymentDate || new Date()).toISOString();
                      milestones[j].paymentMethod = paymentMethod || 'Manual';
                      milestones[j].transactionId = transactionId || '';
                      break;
                    }
                  }
                  scheduleSheet.getRange(i + 1, milestonesCol + 1).setValue(JSON.stringify(milestones));
                  break;
                } catch (e) {
                  Logger.log('Error updating payment schedule: ' + e.toString());
                }
              }
            }
          }
        }
      } catch (e) {
        Logger.log('Error accessing payment schedules: ' + e.toString());
      }
    }
    
    // Send confirmation email if customer email exists (requires sendPaymentConfirmationEmail from main file)
    if (customerEmail) {
      try {
        sendPaymentConfirmationEmail(customerEmail, customerName, invoiceId, parseFloat(amount), totalPaid, invoiceTotal);
        Logger.log('✅ Payment confirmation email sent to: ' + customerEmail);
      } catch (e) {
        Logger.log('Error sending confirmation email: ' + e.toString());
        // Don't fail the whole operation if email fails
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
 * Quick test function - call this from Apps Script editor to test payment reporting
 * Example: testPaymentReporting('INV-2024-001', 100, 'Cash', 'TEST-123', 'Test payment')
 */
function testPaymentReporting(invoiceId, amount, method, transactionId, notes) {
  const result = reportManualPayment(
    invoiceId || 'INV-2024-001',
    amount || 100,
    method || 'Cash',
    transactionId || 'TEST-' + Date.now(),
    notes || 'Test payment',
    new Date()
  );
  Logger.log('Test result: ' + JSON.stringify(result));
  return result;
}



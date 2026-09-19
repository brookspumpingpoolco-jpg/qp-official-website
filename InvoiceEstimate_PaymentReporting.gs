/**
 * Payment Reporting Function for InvoiceEstimate
 * 
 * This function should be added to InvoiceEstimate.gs after the sendPaymentConfirmationEmail function
 * (around line 3191, before "// ========================================")
 * 
 * Also add this case to the doPost/doGet switch statement:
 * case 'reportPayment':
 *   const paymentData = JSON.parse(e.parameter.data || '{}');
 *   result = reportManualPayment(
 *     paymentData.invoiceId,
 *     paymentData.amount,
 *     paymentData.paymentMethod || 'Manual',
 *     paymentData.transactionId || '',
 *     paymentData.notes || '',
 *     paymentData.paymentDate || new Date()
 *   );
 *   break;
 */

/**
 * Report a manual payment for an invoice
 * This allows admins to record payments received outside of Stripe (cash, check, bank transfer, etc.)
 */
function reportManualPayment(invoiceId, amount, paymentMethod, transactionId, notes, paymentDate) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const invoiceSheet = spreadsheet.getSheetByName(INVOICES_ESTIMATES_SHEET);
    
    if (!invoiceSheet) {
      return { success: false, error: 'Invoice sheet not found' };
    }
    
    // Find the invoice
    const dataRows = invoiceSheet.getDataRange().getValues();
    const headers = dataRows[0];
    let invoiceRow = -1;
    let invoiceTotal = 0;
    let customerEmail = '';
    let customerName = '';
    
    for (let i = 1; i < dataRows.length; i++) {
      if (dataRows[i][0] === invoiceId) {
        invoiceRow = i + 1; // +1 because sheet rows are 1-indexed
        invoiceTotal = parseFloat(dataRows[i][headers.indexOf('Total')] || 0);
        customerEmail = dataRows[i][headers.indexOf('Customer Email')] || '';
        customerName = dataRows[i][headers.indexOf('Customer Name')] || '';
        break;
      }
    }
    
    if (invoiceRow === -1) {
      return { success: false, error: 'Invoice not found' };
    }
    
    // Record payment in payment history
    const paymentResult = recordPaymentHistory(invoiceId, parseFloat(amount), transactionId || 'MANUAL-' + Date.now(), paymentMethod || 'Manual');
    
    if (!paymentResult.success) {
      return { success: false, error: 'Failed to record payment history' };
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
        
        if (invoiceIdCol !== -1) {
          for (let i = 1; i < paymentData.length; i++) {
            if (paymentData[i][invoiceIdCol] === invoiceId) {
              const paymentStatus = paymentData[i][statusCol] || 'Completed';
              if (paymentStatus === 'Completed' || paymentStatus === 'completed') {
                totalPaid += parseFloat(paymentData[i][amountCol] || 0);
              }
            }
          }
        }
      }
    }
    
    // Update invoice payment status
    const paymentStatusCol = headers.indexOf('Payment Status');
    const paymentDateCol = headers.indexOf('Payment Date');
    
    if (totalPaid >= invoiceTotal) {
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
    
    // Update payment schedule milestone if applicable
    const scheduleSheet = spreadsheet.getSheetByName('Payment Schedules');
    if (scheduleSheet) {
      const scheduleData = scheduleSheet.getDataRange().getValues();
      if (scheduleData.length > 1) {
        const scheduleHeaders = scheduleData[0];
        const invoiceIdCol = scheduleHeaders.indexOf('Invoice ID');
        const milestonesCol = scheduleHeaders.indexOf('Payment Milestones JSON');
        
        for (let i = 1; i < scheduleData.length; i++) {
          if (scheduleData[i][invoiceIdCol] === invoiceId) {
            try {
              const milestones = JSON.parse(scheduleData[i][milestonesCol] || '[]');
              // Find matching milestone and mark as paid
              for (let j = 0; j < milestones.length; j++) {
                if (milestones[j].status !== 'paid' && milestones[j].status !== 'Paid') {
                  // Mark first unpaid milestone as paid
                  milestones[j].status = 'Paid';
                  milestones[j].paidDate = paymentDate || new Date();
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
    
    // Send confirmation email if customer email exists
    if (customerEmail) {
      sendPaymentConfirmationEmail(customerEmail, customerName, invoiceId, parseFloat(amount));
    }
    
    return {
      success: true,
      totalPaid: totalPaid,
      remaining: invoiceTotal - totalPaid,
      paymentProgress: (totalPaid / invoiceTotal) * 100
    };
  } catch (error) {
    Logger.log('Error reporting manual payment: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}


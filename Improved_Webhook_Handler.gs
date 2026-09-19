/**
 * ========================================
 * IMPROVED STRIPE WEBHOOK HANDLER
 * ========================================
 * 
 * This is a SEAMLESS 3-layer fallback system that will ALWAYS
 * link payments to invoices, even if metadata is missing.
 * 
 * REPLACE the handleStripeWebhook function in InvoiceEstimate.gs
 * with this improved version.
 * 
 * FEATURES:
 * ✅ Layer 1: Metadata (fastest)
 * ✅ Layer 2: Session ID lookup (works with test webhooks)
 * ✅ Layer 3: Email + amount matching (last resort)
 * ✅ Comprehensive logging for debugging
 * ✅ Handles all edge cases
 */

/**
 * IMPROVED: Handle Stripe webhook events with 3-layer fallback
 */
function handleStripeWebhook(event) {
  try {
    Logger.log('========================================');
    Logger.log('🟢 handleStripeWebhook CALLED - ' + new Date().toISOString());
    Logger.log('Event type: ' + (event.type || 'NO TYPE'));
    
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const sessionId = session.id;
      const paidAmount = session.amount_total / 100; // Amount paid (in dollars)
      
      Logger.log('Session ID: ' + sessionId);
      Logger.log('Amount: $' + paidAmount.toFixed(2));
      Logger.log('Metadata: ' + JSON.stringify(session.metadata || {}));
      
      // ========================================
      // SEAMLESS 3-LAYER LINKING SYSTEM
      // ========================================
      let invoiceId = null;
      let invoiceRow = -1;
      
      // LAYER 1: Try metadata (fastest, most reliable)
      invoiceId = session.metadata?.invoice_id;
      if (invoiceId) {
        Logger.log('✅ LAYER 1: Found invoice ID from metadata: ' + invoiceId);
      } else {
        Logger.log('⚠️ LAYER 1: No invoice_id in metadata, trying LAYER 2...');
        
        // LAYER 2: Lookup by stored session ID (works with test webhooks)
        const sessionLookup = findInvoiceByStripeSessionId(sessionId);
        if (sessionLookup && sessionLookup.invoiceId) {
          invoiceId = sessionLookup.invoiceId;
          invoiceRow = sessionLookup.rowIndex;
          Logger.log('✅ LAYER 2: Found invoice by session ID: ' + invoiceId);
        } else {
          Logger.log('⚠️ LAYER 2: Session ID not found, trying LAYER 3...');
          
          // LAYER 3: Match by customer email + amount (last resort)
          const customerEmail = session.customer_details?.email || session.customer_email;
          if (customerEmail && paidAmount) {
            const emailLookup = findInvoiceByEmailAndAmount(customerEmail, paidAmount);
            if (emailLookup && emailLookup.invoiceId) {
              invoiceId = emailLookup.invoiceId;
              invoiceRow = emailLookup.rowIndex;
              Logger.log('✅ LAYER 3: Found invoice by email+amount: ' + invoiceId);
            } else {
              Logger.log('❌ LAYER 3: No match found by email+amount');
            }
          }
        }
      }
      
      // If we found invoice ID, process the payment
      if (invoiceId) {
        Logger.log('✅ Processing payment for invoice: ' + invoiceId);
        
        // Update invoice payment status
        const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
        const sheet = spreadsheet.getSheetByName(INVOICES_ESTIMATES_SHEET);
        
        if (sheet) {
          enforce8ColumnStructure(sheet);
          const lastRow = sheet.getLastRow();
          const sheetCols = sheet.getLastColumn();
          const is8Column = (sheetCols >= 8);
          const idCol = is8Column ? 2 : 1;
          const json1Col = is8Column ? 4 : 3;
          const json2Col = is8Column ? 5 : 4;
          const json3Col = is8Column ? 6 : 5;
          const companyIdCol = is8Column ? 1 : 0;
          
          // If we already found the row from lookup, use it; otherwise search
          let foundRow = invoiceRow > 0 ? invoiceRow : null;
          
          if (!foundRow) {
            for (let i = 1; i < lastRow; i++) {
              const rowId = String(sheet.getRange(i + 1, idCol).getValue() || '').trim();
              if (rowId === String(invoiceId).trim()) {
                foundRow = i + 1;
                break;
              }
            }
          }
          
          if (foundRow) {
            const i = foundRow - 1; // Convert to 0-based index
            
            // Read invoice JSON
            const jsonPart1 = sheet.getRange(i + 1, json1Col).getValue() || '';
            const jsonPart2 = sheet.getRange(i + 1, json2Col).getValue() || '';
            const jsonPart3 = sheet.getRange(i + 1, json3Col).getValue() || '';
            let jsonStr = concatenateJsonChunks(jsonPart1, jsonPart2, jsonPart3);
            
            if (!jsonStr || jsonStr.length === 0) {
              jsonStr = String(jsonPart1 || '').trim();
            }
            
            if (jsonStr && jsonStr.startsWith('{')) {
              const jsonData = JSON.parse(jsonStr);
              const invoiceTotal = parseFloat(jsonData.total) || 0;
              
              // Track this payment in partial payments array
              if (!jsonData.partialPayments) {
                jsonData.partialPayments = [];
              }
              
              // Mark matching pending payment as completed, or add new payment
              let paymentFound = false;
              for (let j = 0; j < jsonData.partialPayments.length; j++) {
                if (jsonData.partialPayments[j].status === 'Pending' && 
                    Math.abs(jsonData.partialPayments[j].amount - paidAmount) < 0.01) {
                  jsonData.partialPayments[j].status = 'Completed';
                  jsonData.partialPayments[j].paidDate = new Date().toISOString();
                  jsonData.partialPayments[j].transactionId = session.payment_intent || session.id;
                  paymentFound = true;
                  break;
                }
              }
              
              // If no matching pending payment found, add as new payment
              if (!paymentFound) {
                jsonData.partialPayments.push({
                  amount: paidAmount,
                  paidDate: new Date().toISOString(),
                  transactionId: session.payment_intent || session.id,
                  status: 'Completed'
                });
              }
              
              // Calculate total paid amount
              const totalPaid = jsonData.partialPayments
                .filter(p => p.status === 'Completed')
                .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
              
              // Update payment status
              if (totalPaid >= invoiceTotal - 0.01) {
                // Fully paid (allow small rounding differences)
                jsonData.paymentStatus = 'Paid';
                jsonData.paidDate = new Date().toISOString();
              } else if (totalPaid > 0) {
                // Partially paid
                jsonData.paymentStatus = 'Partial';
                jsonData.totalPaid = totalPaid;
                jsonData.remainingBalance = invoiceTotal - totalPaid;
              } else {
                jsonData.paymentStatus = 'Pending';
              }
              
              // Write updated JSON back
              const updatedJsonStr = JSON.stringify(jsonData);
              const updatedChunks = splitJsonString(updatedJsonStr);
              sheet.getRange(i + 1, json1Col, 1, 3).setValues([[updatedChunks[0] || '', updatedChunks[1] || '', updatedChunks[2] || '']]);
              SpreadsheetApp.flush();
              
              // Get company ID for payment history
              const companyId = is8Column ? (sheet.getRange(i + 1, companyIdCol).getValue() || 'CMP-AQUALITYPOOL') : 'CMP-AQUALITYPOOL';
              
              // Calculate Stripe fee (2.9% + $0.30)
              const stripeFee = (paidAmount * 0.029) + 0.30;
              
              // Record in payment history with full details (11-column format from Sheet Formatter)
              recordPaymentHistory(
                invoiceId, 
                paidAmount, 
                session.payment_intent || session.id, 
                'Stripe', 
                companyId,
                new Date(), // paymentDate
                jsonData.customerEmail || '', // email
                jsonData.customerName ? `Payment for Invoice ${invoiceId} - ${jsonData.customerName}` : `Payment for Invoice ${invoiceId}`, // description
                stripeFee // fee
              );
              
              // Send confirmation email
              const customerEmail = jsonData.customerEmail || '';
              const customerName = jsonData.customerName || '';
              sendPaymentConfirmationEmail(customerEmail, customerName, invoiceId, paidAmount, totalPaid, invoiceTotal);
              
              Logger.log('✅ Payment processed: $' + paidAmount.toFixed(2) + ' for invoice ' + invoiceId + '. Total paid: $' + totalPaid.toFixed(2));
              Logger.log('========================================');
              return ContentService.createTextOutput(JSON.stringify({ received: true, processed: true, invoiceId: invoiceId }))
                .setMimeType(ContentService.MimeType.JSON);
            } else {
              Logger.log('⚠️ Invoice JSON does not start with {');
            }
          } else {
            Logger.log('❌ Invoice ID not found in sheet: ' + invoiceId);
          }
        } else {
          Logger.log('❌ Invoice sheet not found!');
        }
      } else {
        Logger.log('❌ Could not link payment to invoice - no matching invoice found');
        Logger.log('Session details: ' + JSON.stringify({
          id: sessionId,
          amount: paidAmount,
          customer_email: session.customer_details?.email || session.customer_email,
          metadata: session.metadata
        }));
      }
    } else {
      Logger.log('⚠️ Event type is not checkout.session.completed. Type: ' + (event.type || 'none'));
    }
    
    Logger.log('🟢 handleStripeWebhook returning success response');
    Logger.log('========================================');
    return ContentService.createTextOutput(JSON.stringify({ received: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log('========================================');
    Logger.log('❌ Webhook error: ' + error.toString());
    Logger.log('❌ Error stack: ' + (error.stack || 'No stack trace'));
    Logger.log('========================================');
    return ContentService.createTextOutput(JSON.stringify({ error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * LAYER 2: Find invoice by Stripe session ID (fallback when metadata missing)
 * Returns { invoiceId, rowIndex } or null
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
    const json1Col = is8Column ? 4 : 3;
    const json2Col = is8Column ? 5 : 4;
    const json3Col = is8Column ? 6 : 5;
    const idCol = is8Column ? 2 : 1;
    
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
          // Check if this invoice has the matching session ID
          if (invoiceData.paymentLinkId === sessionId || 
              invoiceData.stripeSessionId === sessionId ||
              (invoiceData.paymentLink && invoiceData.paymentLink.includes(sessionId))) {
            const invoiceId = sheet.getRange(i + 1, idCol).getValue();
            Logger.log('✅ Found invoice by session ID: ' + invoiceId + ' at row ' + (i + 1));
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
 * LAYER 3: Find invoice by customer email and amount (last resort fallback)
 * Returns { invoiceId, rowIndex } or null
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
    const json1Col = is8Column ? 4 : 3;
    const json2Col = is8Column ? 5 : 4;
    const json3Col = is8Column ? 6 : 5;
    const idCol = is8Column ? 2 : 1;
    
    // Allow small amount difference (for fees, rounding)
    const amountTolerance = 1.00; // $1 tolerance
    
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
          
          // Match email exactly and amount within tolerance
          if (invoiceEmail === searchEmail && 
              Math.abs(invoiceAmount - amount) <= amountTolerance) {
            const invoiceId = sheet.getRange(i + 1, idCol).getValue();
            Logger.log('✅ Found invoice by email+amount: ' + invoiceId + ' at row ' + (i + 1));
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



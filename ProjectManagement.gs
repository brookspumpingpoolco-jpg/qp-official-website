/**
 * Project Management System
 * Handles projects, expenses, milestone invoices, and customer approvals
 */

// Note: CUSTOMER_DRIVE_FOLDER_ID and getOrCreateCustomerFolder() are defined in InvoiceEstimate.gs
// (fuzzy name matching). Do not redeclare getOrCreateCustomerFolder here — it would override IE.

/** Default company ID for PM_Expenses rows (admin / single-company deployment). */
var PM_EXPENSES_DEFAULT_COMPANY_ID = 'CMP-AQUALITYPOOL';

/**
 * If PM_Expenses has legacy layout (A1 = Expense ID), insert Company ID column A and backfill.
 */
function ensurePMExpensesCompanyIdColumn_(sheet) {
  if (!sheet) return;
  var lastRow = sheet.getLastRow();
  if (lastRow < 1) return;
  var a1 = String(sheet.getRange(1, 1).getDisplayValue() || '').trim();
  if (a1 === 'Company ID') return;
  if (a1 !== 'Expense ID') {
    Logger.log('PM_Expenses: unexpected A1 header "' + a1 + '" — run setupPMExpensesSheet or fix headers manually');
    return;
  }
  sheet.insertColumnBefore(1);
  sheet.getRange(1, 1).setValue('Company ID');
  if (lastRow >= 2) {
    sheet.getRange(2, 1, lastRow + 1, 1).setValue(PM_EXPENSES_DEFAULT_COMPANY_ID);
  }
  Logger.log('PM_Expenses: inserted Company ID column and backfilled ' + PM_EXPENSES_DEFAULT_COMPANY_ID);
}

/**
 * @returns {{companyId:number,expenseId:number,projectId:number,date:number,category:number,description:number,amount:number,paidFrom:number,receiptJson:number}}
 */
function getPMExpensesColumnIndices_(sheet) {
  ensurePMExpensesCompanyIdColumn_(sheet);
  var h = String(sheet.getRange(1, 1).getDisplayValue() || '').trim();
  if (h === 'Company ID') {
    return {
      companyId: 0,
      expenseId: 1,
      projectId: 2,
      date: 3,
      category: 4,
      description: 5,
      amount: 6,
      paidFrom: 7,
      receiptJson: 8
    };
  }
  Logger.log('PM_Expenses: Company ID header missing after migration; using legacy 8-column indices');
  return {
    companyId: -1,
    expenseId: 0,
    projectId: 1,
    date: 2,
    category: 3,
    description: 4,
    amount: 5,
    paidFrom: 6,
    receiptJson: 7
  };
}

// ============================================================================
// SHEET INITIALIZATION FUNCTIONS
// ============================================================================

/**
 * Initialize all project management sheets
 * Creates sheets if they don't exist with proper column structure
 */
function initializeProjectManagementSheets() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  setupPMProjectsSheet(spreadsheet);
  setupPMExpensesSheet(spreadsheet);
  setupPMProjectInvoicesSheet(spreadsheet);
  setupPMApprovalTokensSheet(spreadsheet);
  setupPMTasksSheet(spreadsheet);
  setupPMTaskCompletionsSheet(spreadsheet);
  
  Logger.log('✅ All project management sheets initialized');
  return { success: true, message: 'Sheets initialized successfully' };
}

/**
 * Setup PM_Projects sheet
 * Columns: Project ID, Invoice ID, Customer Email, Project JSON (3 cols), Status, Total Value, Profit Margin
 * @param {Spreadsheet} spreadsheet - Optional spreadsheet object. If not provided, will open by ID.
 */
function setupPMProjectsSheet(spreadsheet) {
  // Get spreadsheet if not provided
  if (!spreadsheet) {
    spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  
  if (!spreadsheet) {
    Logger.log('❌ Failed to open spreadsheet');
    return;
  }
  
  let sheet = spreadsheet.getSheetByName(PM_PROJECTS_SHEET);
  
  if (!sheet) {
    sheet = spreadsheet.insertSheet(PM_PROJECTS_SHEET);
    Logger.log('Created PM_Projects sheet');
  }
  
  // Set up headers
  const headers = [
    'Project ID',
    'Invoice ID',
    'Customer Email', 
    'Project JSON Part 1',
    'Project JSON Part 2',
    'Project JSON Part 3',
    'Status',
    'Total Value',
    'Profit Margin %'
  ];
  
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.getRange(1, 1, 1, headers.length).setBackground('#0369a1');
  sheet.getRange(1, 1, 1, headers.length).setFontColor('#ffffff');
  
  // Set column widths
  sheet.setColumnWidth(1, 150); // Project ID
  sheet.setColumnWidth(2, 220); // Invoice ID
  sheet.setColumnWidth(3, 200); // Customer Email
  sheet.setColumnWidth(4, 150); // JSON Part 1
  sheet.setColumnWidth(5, 150); // JSON Part 2
  sheet.setColumnWidth(6, 150); // JSON Part 3
  sheet.setColumnWidth(7, 120); // Status
  sheet.setColumnWidth(8, 120); // Total Value
  sheet.setColumnWidth(9, 120); // Profit Margin
  
  sheet.setFrozenRows(1);
  
  Logger.log('✅ PM_Projects sheet configured');
}

/**
 * Setup PM_Expenses sheet
 * Columns: Company ID, Expense ID, Project ID, Date, Category, Description, Amount, Paid From Account, Receipt/Notes JSON
 * @param {Spreadsheet} spreadsheet - Optional spreadsheet object. If not provided, will open by ID.
 */
function setupPMExpensesSheet(spreadsheet) {
  // Get spreadsheet if not provided
  if (!spreadsheet) {
    spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  
  if (!spreadsheet) {
    Logger.log('❌ Failed to open spreadsheet');
    return;
  }
  
  let sheet = spreadsheet.getSheetByName(PM_EXPENSES_SHEET);
  
  if (!sheet) {
    sheet = spreadsheet.insertSheet(PM_EXPENSES_SHEET);
    Logger.log('Created PM_Expenses sheet');
  }
  
  // Set up headers
  const headers = [
    'Company ID',
    'Expense ID',
    'Project ID',
    'Date',
    'Category',
    'Description',
    'Amount',
    'Paid From Account',
    'Receipt/Notes JSON'
  ];
  
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.getRange(1, 1, 1, headers.length).setBackground('#059669');
  sheet.getRange(1, 1, 1, headers.length).setFontColor('#ffffff');
  
  // Set column widths
  sheet.setColumnWidth(1, 140); // Company ID
  sheet.setColumnWidth(2, 150); // Expense ID
  sheet.setColumnWidth(3, 150); // Project ID
  sheet.setColumnWidth(4, 100); // Date
  sheet.setColumnWidth(5, 120); // Category
  sheet.setColumnWidth(6, 250); // Description
  sheet.setColumnWidth(7, 100); // Amount
  sheet.setColumnWidth(8, 150); // Paid From Account
  sheet.setColumnWidth(9, 200); // Receipt/Notes JSON
  
  sheet.setFrozenRows(1);
  
  Logger.log('✅ PM_Expenses sheet configured');
}

/**
 * Setup PM_Project_Invoices sheet
 * Columns: Invoice ID, Project ID, Milestone Name, Amount, Status, Stripe Payment Link, Date Sent, Date Paid
 * @param {Spreadsheet} spreadsheet - Optional spreadsheet object. If not provided, will open by ID.
 */
function setupPMProjectInvoicesSheet(spreadsheet) {
  // Get spreadsheet if not provided
  if (!spreadsheet) {
    spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  
  if (!spreadsheet) {
    Logger.log('❌ Failed to open spreadsheet');
    return;
  }
  
  let sheet = spreadsheet.getSheetByName(PM_PROJECT_INVOICES_SHEET);
  
  if (!sheet) {
    sheet = spreadsheet.insertSheet(PM_PROJECT_INVOICES_SHEET);
    Logger.log('Created PM_Project_Invoices sheet');
  }
  
  // Set up headers - MUST match all columns appended in createOneOffProjectInvoice!
  const headers = [
    'Invoice ID',
    'Project ID',
    'Milestone Name',
    'Amount',
    'Status',
    'Stripe Payment Link',
    'Date Sent',
    'Notes',
    'Type',
    'Quantity',
    'Unit Price'
  ];
  
  // Only update headers if row 1 is empty or doesn't have the right count
  const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const hasHeaders = firstRow && firstRow.some(cell => cell !== '');
  
  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.getRange(1, 1, 1, headers.length).setBackground('#7c3aed');
    sheet.getRange(1, 1, 1, headers.length).setFontColor('#ffffff');
    Logger.log('✅ PM_Project_Invoices headers created');
  } else {
    Logger.log('⚠️  PM_Project_Invoices sheet already has headers - preserving existing data');
  }
  
  // Set column widths
  sheet.setColumnWidth(1, 150); // Invoice ID
  sheet.setColumnWidth(2, 150); // Project ID
  sheet.setColumnWidth(3, 200); // Milestone Name
  sheet.setColumnWidth(4, 100); // Amount
  sheet.setColumnWidth(5, 100); // Status
  sheet.setColumnWidth(6, 250); // Stripe Payment Link
  sheet.setColumnWidth(7, 120); // Date Sent
  sheet.setColumnWidth(8, 150); // Notes
  sheet.setColumnWidth(9, 100); // Type
  sheet.setColumnWidth(10, 100); // Quantity
  sheet.setColumnWidth(11, 120); // Unit Price
  
  sheet.setFrozenRows(1);
  
  Logger.log('✅ PM_Project_Invoices sheet configured with ' + headers.length + ' columns');
}

/**
 * Setup PM_Approval_Tokens sheet (for security)
 * Columns: Token, Estimate ID, Customer Email, Created Date, Expires Date, Used
 */
function setupPMApprovalTokensSheet(spreadsheet) {
  // Get spreadsheet if not provided
  if (!spreadsheet) {
    spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  
  if (!spreadsheet) {
    Logger.log('❌ Failed to open spreadsheet');
    return;
  }
  
  let sheet = spreadsheet.getSheetByName(PM_APPROVAL_TOKENS_SHEET);
  
  if (!sheet) {
    sheet = spreadsheet.insertSheet(PM_APPROVAL_TOKENS_SHEET);
    Logger.log('Created PM_Approval_Tokens sheet');
  }
  
  // Set up headers
  const headers = [
    'Token',
    'Estimate ID',
    'Customer Email',
    'Created Date',
    'Expires Date',
    'Used'
  ];
  
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.getRange(1, 1, 1, headers.length).setBackground('#ef4444');
  sheet.getRange(1, 1, 1, headers.length).setFontColor('#ffffff');
  
  // Set column widths
  sheet.setColumnWidth(1, 250); // Token
  sheet.setColumnWidth(2, 150); // Estimate ID
  sheet.setColumnWidth(3, 200); // Customer Email
  sheet.setColumnWidth(4, 150); // Created Date
  sheet.setColumnWidth(5, 150); // Expires Date
  sheet.setColumnWidth(6, 80); // Used
  
  sheet.setFrozenRows(1);
  
  Logger.log('✅ PM_Approval_Tokens sheet configured');
}

/**
 * PM_Tasks — company-scoped to-dos (optional project link, Calendar sync)
 */
function setupPMTasksSheet(spreadsheet) {
  if (!spreadsheet) {
    spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  if (!spreadsheet) return;

  var sheet = spreadsheet.getSheetByName(PM_TASKS_SHEET);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(PM_TASKS_SHEET);
    Logger.log('Created PM_Tasks sheet');
  }

  if (String(sheet.getRange(1, 1).getValue() || '').trim() === 'Company ID') {
    return;
  }

  var headers = [
    'Company ID',
    'Task ID',
    'Title',
    'Project ID',
    'Customer Name',
    'Customer Email',
    'Due Date',
    'Due Time',
    'Priority',
    'Status',
    'Notes',
    'Calendar Event ID',
    'Link Type',
    'Link ID',
    'Created Date'
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.getRange(1, 1, 1, headers.length).setBackground('#0d9488');
  sheet.getRange(1, 1, 1, headers.length).setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  Logger.log('✅ PM_Tasks sheet configured');
}

/**
 * Audit log when a task is marked completed (stores Task ID + snapshot)
 */
function setupPMTaskCompletionsSheet(spreadsheet) {
  if (!spreadsheet) {
    spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  if (!spreadsheet) return;

  var sheet = spreadsheet.getSheetByName(PM_TASK_COMPLETIONS_SHEET);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(PM_TASK_COMPLETIONS_SHEET);
    Logger.log('Created PM_Task_Completions sheet');
  }

  if (String(sheet.getRange(1, 1).getValue() || '').trim() === 'Company ID') {
    return;
  }

  var headers = [
    'Company ID',
    'Task ID',
    'Completed At',
    'Title Snapshot',
    'Project ID'
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.getRange(1, 1, 1, headers.length).setBackground('#115e59');
  sheet.getRange(1, 1, 1, headers.length).setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  Logger.log('✅ PM_Task_Completions sheet configured');
}

// ============================================================================
// CUSTOMER APPROVAL WORKFLOW
// ============================================================================

/**
 * Generate customer approval link with secure token
 * @param {string} estimateId - The estimate ID to approve
 * @returns {object} - Success status and approval URL
 */
function generateCustomerApprovalLink(estimateId) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const estimateSheet = spreadsheet.getSheetByName(INVOICES_ESTIMATES_SHEET);
    
    // Get estimate data
    const estimate = getInvoiceEstimate(estimateId);
    if (!estimate.success) {
      return { success: false, error: 'Estimate not found' };
    }
    
    const customerEmail = estimate.data.customerEmail;
    
    // Generate secure token
    const token = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      estimateId + customerEmail + new Date().getTime() + 'POOL_PROJECT_SECRET_2024'
    ).map(byte => ('0' + (byte & 0xFF).toString(16)).slice(-2)).join('');
    
    const createdDate = new Date();
    const expiresDate = new Date(createdDate.getTime() + (30 * 24 * 60 * 60 * 1000)); // 30 days
    
    // Save token to sheet
    const tokensSheet = spreadsheet.getSheetByName(PM_APPROVAL_TOKENS_SHEET);
    if (!tokensSheet) {
      setupPMApprovalTokensSheet(spreadsheet);
    }
    
    const tokenSheet = spreadsheet.getSheetByName(PM_APPROVAL_TOKENS_SHEET);
    tokenSheet.appendRow([
      token,
      estimateId,
      customerEmail,
      createdDate,
      expiresDate,
      false
    ]);
    
    // Generate approval URL (you'll replace this with your Webflow domain)
    const approvalUrl = 'https://www.aqualitypoolcompanyusa.com/estimate-approval?id=' + estimateId + '&token=' + token + '&email=' + encodeURIComponent(customerEmail);
    
    Logger.log('✅ Approval link generated for estimate: ' + estimateId);
    
    return {
      success: true,
      approvalUrl: approvalUrl,
      token: token,
      expiresDate: expiresDate
    };
    
  } catch (error) {
    Logger.log('❌ Error generating approval link: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Get estimate data for approval (called from Webflow)
 * @param {string} estimateId - The estimate ID
 * @param {string} token - Security token
 * @returns {object} - Estimate data if token is valid
 */
function getEstimateForApproval(estimateId, token) {
  try {
    // Validate token (allow viewing even if used)
    const tokenValid = validateApprovalToken(estimateId, token, true);
    if (!tokenValid.success) {
      return { success: false, error: 'Invalid or expired token' };
    }
    
    // Get estimate data
    const estimate = getInvoiceEstimate(estimateId);
    if (!estimate.success) {
      return { success: false, error: 'Estimate not found' };
    }
    
    const estimateData = estimate.data;

    // Get document type from approval tokens sheet (most authoritative source)
    var docType = '';
    try {
      const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
      const tokensSheet = spreadsheet.getSheetByName(PM_APPROVAL_TOKENS_SHEET);
      if (tokensSheet) {
        const tokenData = tokensSheet.getDataRange().getValues();
        const tokenStr = String(token || '').trim();
        const estimateIdStr = String(estimateId || '').trim();
        
        for (let i = 1; i < tokenData.length; i++) {
          const row = tokenData[i];
          if (String(row[0] || '').trim() === tokenStr && String(row[1] || '').trim() === estimateIdStr) {
            // Column 7 is DocumentType (if it exists)
            if (row.length > 6 && row[6]) {
              docType = String(row[6]).trim();
              Logger.log('✅ Using DocumentType from approval token: ' + docType);
            } else {
              // Token found but no DocumentType column - infer from ID format
              // Approval tokens are only for estimates, so default to Estimate if found
              docType = 'Estimate';
              Logger.log('✅ Token found but no DocumentType column - inferring as Estimate');
            }
            break;
          }
        }
      }
      
      // If still no type, try to normalize from estimate data
      if (!docType) {
        // Check ID format: EST- indicates estimate, INV- indicates invoice
        const idStr = String(estimateId || '').toUpperCase();
        if (idStr.startsWith('EST-')) {
          docType = 'Estimate';
          Logger.log('✅ Using ID format to detect Estimate (EST- prefix)');
        } else if (idStr.startsWith('INV-')) {
          docType = 'Invoice';
          Logger.log('✅ Using ID format to detect Invoice (INV- prefix)');
        } else {
          // Fall back to normalizing estimate data type
          if (typeof normalizeInvoiceEstimateType === 'function') {
            docType = normalizeInvoiceEstimateType(estimateData.type);
          } else {
            var _t = String(estimateData.type || '').toLowerCase();
            docType = (_t === 'estimate') ? 'Estimate' : 'Invoice';
            if (_t === 'snow removal' || _t === 'snow-removal') docType = 'Invoice';
          }
          Logger.log('✅ Using normalized type from estimate data: ' + docType);
        }
      }
    } catch (typeErr) {
      Logger.log('⚠️ Error reading document type: ' + typeErr.toString());
      docType = estimateData.type || 'Estimate'; // Default to Estimate for approval link
    }
    
    // Final safety: ensure docType is valid
    if (!docType || (docType !== 'Invoice' && docType !== 'Estimate')) {
      docType = 'Estimate'; // Default to Estimate for approval links
      Logger.log('⚠️ Invalid docType, defaulting to Estimate');
    }
    var taxAmt = estimateData.taxAmount != null ? estimateData.taxAmount : estimateData.tax;
    
    // Send email notification when customer views quote
    try {
      sendQuoteViewNotification(estimateId, estimateData);
    } catch (emailError) {
      Logger.log('⚠️ Error sending quote view notification: ' + emailError.toString());
      // Don't fail the request if email fails
    }
    
    // Return sanitized data for display (same fields the public viewer needs as getInvoiceEstimate)
    return {
      success: true,
      estimate: {
        id: estimateId,
        type: docType,
        customerName: estimateData.customerName,
        customerEmail: estimateData.customerEmail,
        customerPhone: estimateData.customerPhone,
        customerAddress: estimateData.customerAddress,
        date: estimateData.date,
        dueDate: estimateData.dueDate || '',
        invoiceNumber: estimateData.invoiceNumber || '',
        quoteNumber: estimateData.quoteNumber || '',
        items: estimateData.items,
        subtotal: estimateData.subtotal,
        taxRate: estimateData.taxRate,
        tax: taxAmt,
        taxAmount: taxAmt,
        discount: estimateData.discount,
        total: estimateData.total,
        notes: estimateData.notes,
        terms: estimateData.terms,
        paymentSchedule: estimateData.paymentSchedule || [],
        approvalStatus: estimateData.approvalStatus || '',
        approvalDate: estimateData.approvalDate || '',
        adminSigned: estimateData.adminSigned || false,
        adminSignatureData: estimateData.adminSignatureData || estimateData.adminSignature || '',
        adminPrintedName: estimateData.adminPrintedName || '',
        adminSignedDate: estimateData.adminSignedDate || '',
        contractFullyExecuted: estimateData.contractFullyExecuted || false,
        contractPdfUrl: estimateData.contractPdfUrl || '',
        printedName: estimateData.printedName || '',
        signatureUrl: estimateData.signatureUrl || '',
        pdfUrl: estimateData.pdfUrl || '',
        paymentLink: estimateData.paymentLink || '',
        shareLink: estimateData.shareLink || '',
        paymentStatus: estimateData.paymentStatus || '',
        status: estimateData.status || '',
        totalPaid: estimateData.totalPaid,
        remainingBalance: estimateData.remainingBalance,
        addProcessingFee: estimateData.addProcessingFee,
        processingFee: estimateData.processingFee,
        projectType: estimateData.projectType || ''
      }
    };
    
  } catch (error) {
    Logger.log('❌ Error getting estimate for approval: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Send email notification when customer views a quote
 * @param {string} estimateId - The estimate ID
 * @param {object} estimateData - The estimate data
 */
function sendQuoteViewNotification(estimateId, estimateData) {
  try {
    // Track views to avoid spamming - check if we've sent a notification recently
    const viewKey = 'quote_view_' + estimateId;
    const lastViewTime = PropertiesService.getScriptProperties().getProperty(viewKey);
    const now = new Date().getTime();
    
    // Only send notification if last view was more than 1 hour ago (to avoid spam)
    if (lastViewTime) {
      const timeSinceLastView = now - parseInt(lastViewTime);
      const oneHour = 60 * 60 * 1000; // 1 hour in milliseconds
      if (timeSinceLastView < oneHour) {
        Logger.log('⏭️ Skipping quote view notification (sent recently)');
        return;
      }
    }
    
    // Update last view time
    PropertiesService.getScriptProperties().setProperty(viewKey, now.toString());
    
    const subject = '👁️ Quote Viewed: ' + estimateData.customerName + ' - ' + estimateId;
    
    const htmlBody = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">' +
      '<div style="background: linear-gradient(135deg, #0369a1 0%, #0ea5e9 100%); padding: 30px; text-align: center;">' +
        '<h1 style="color: white; margin: 0; font-size: 28px;">Quote Viewed</h1>' +
      '</div>' +
      '<div style="padding: 30px; background: #f9fafb;">' +
        '<p style="font-size: 16px; margin-bottom: 20px;"><strong>Customer Activity Alert</strong></p>' +
        '<p style="margin-bottom: 24px;">' + estimateData.customerName + ' has viewed their quote/estimate.</p>' +
        '<div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb;">' +
          '<p style="margin: 0 0 8px 0; font-size: 13px; color: #6b7280;"><strong>Estimate ID:</strong> ' + estimateId + '</p>' +
          '<p style="margin: 0 0 8px 0; font-size: 13px; color: #6b7280;"><strong>Customer:</strong> ' + estimateData.customerName + '</p>' +
          '<p style="margin: 0 0 8px 0; font-size: 13px; color: #6b7280;"><strong>Email:</strong> ' + estimateData.customerEmail + '</p>' +
          '<p style="margin: 0 0 8px 0; font-size: 13px; color: #6b7280;"><strong>Phone:</strong> ' + (estimateData.customerPhone || 'N/A') + '</p>' +
          '<p style="margin: 0 0 8px 0; font-size: 13px; color: #6b7280;"><strong>Total Amount:</strong> $' + parseFloat(estimateData.total || 0).toFixed(2) + '</p>' +
          '<p style="margin: 0; font-size: 13px; color: #6b7280;"><strong>Current Status:</strong> ' + (estimateData.approvalStatus || 'Pending Review') + '</p>' +
        '</div>' +
        '<div style="background: #eff6ff; padding: 16px; border-radius: 8px; border-left: 4px solid #3b82f6; margin: 20px 0;">' +
          '<p style="margin: 0; font-size: 14px; color: #1e40af; line-height: 1.6;">' +
            '<strong>💡 Next Steps:</strong> The customer can now review and sign the contract. You\'ll receive another notification when they approve or decline.' +
          '</p>' +
        '</div>' +
        '<p style="margin-top: 20px; font-size: 14px; color: #6b7280;">View this estimate in your InvoiceEstimateUI to track its status.</p>' +
      '</div>' +
    '</div>';
    
    MailApp.sendEmail({
      to: COMPANY_EMAIL,
      subject: subject,
      htmlBody: htmlBody
    });
    
    Logger.log('✅ Quote view notification sent for estimate: ' + estimateId);
    
  } catch (error) {
    Logger.log('⚠️ Error sending quote view notification: ' + error.toString());
    // Don't throw - this is a non-critical notification
  }
}

/**
 * Validate approval token (allows viewing even if used, only checks expiration)
 * @param {string} estimateId - The estimate ID
 * @param {string} token - Security token
 * @param {boolean} allowUsed - If true, allows viewing even if token was used (default: true)
 * @returns {object} - Validation result
 */
function validateApprovalToken(estimateId, token, allowUsed) {
  try {
    allowUsed = allowUsed !== false; // Default to true
    
    if (!token || !String(token).trim()) {
      return { success: false, error: 'Token not found' };
    }
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const tokensSheet = spreadsheet.getSheetByName(PM_APPROVAL_TOKENS_SHEET);
    
    if (!tokensSheet) {
      return { success: false, error: 'Tokens sheet not found' };
    }
    
    const data = tokensSheet.getDataRange().getValues();
    const tokenStr = String(token).trim();
    const estimateIdStr = String(estimateId || '').trim();
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rowToken = String(row[0] || '').trim();
      const rowEstimateId = String(row[1] || '').trim();
      
      if (rowToken === tokenStr && rowEstimateId === estimateIdStr) {
        const used = row[5];
        
        // Only check if used when actually approving (not when viewing)
        if (!allowUsed && (used === true || String(used).toLowerCase() === 'true')) {
          return { success: false, error: 'Token already used' };
        }
        
        const expiresVal = row[4];
        if (expiresVal) {
          const expiresDate = expiresVal instanceof Date ? expiresVal : new Date(expiresVal);
          if (!isNaN(expiresDate.getTime()) && new Date() > expiresDate) {
            return { success: false, error: 'Token expired' };
          }
        }
        
        return { success: true, rowIndex: i + 1 };
      }
    }
    
    return { success: false, error: 'Token not found' };
    
  } catch (error) {
    Logger.log('❌ Error validating token: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Handle estimate approval/rejection (called from Webflow)
 * @param {string} estimateId - The estimate ID
 * @param {string} token - Security token
 * @param {boolean} approved - Whether approved or rejected
 * @param {string} signatureData - Base64 signature image
 * @param {string} customerNotes - Optional customer notes
 * @param {string} printedName - Printed legal name
 * @returns {object} - Result with project ID if approved
 */
function handleEstimateApproval(estimateId, token, approved, signatureData, customerNotes, printedName) {
  try {
    // Validate token (don't allow used tokens for approval - only for viewing)
    const tokenValid = validateApprovalToken(estimateId, token, false);
    if (!tokenValid.success) {
      return { success: false, error: 'Invalid or expired token' };
    }
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // Mark token as used
    const tokensSheet = spreadsheet.getSheetByName(PM_APPROVAL_TOKENS_SHEET);
    tokensSheet.getRange(tokenValid.rowIndex, 6).setValue(true);
    
    // Get estimate
    const estimate = getInvoiceEstimate(estimateId);
    if (!estimate.success) {
      return { success: false, error: 'Estimate not found' };
    }
    
    const estimateData = estimate.data;
    
    if (approved) {
      // Save signature to Google Drive
      let signatureUrl = '';
      if (signatureData) {
        signatureUrl = saveSignatureToGoogleDrive(estimateId, signatureData);
      }
      
      // Update estimate with approval info
      estimateData.approvalStatus = 'Approved';
      estimateData.status = 'Approved';
      estimateData.approvalDate = new Date().toISOString();
      estimateData.signatureUrl = signatureUrl;
      estimateData.signatureData = signatureData || ''; // Save signature data for later use
      estimateData.printedName = printedName || '';
      estimateData.customerNotes = customerNotes || '';
      
      // Save updated estimate
      saveInvoiceEstimate(estimateData);
      
      // Generate and save signed contract PDF to Google Drive
      let contractPdfUrl = '';
      try {
        contractPdfUrl = generateAndSaveSignedContract(estimateId, estimateData, signatureData, printedName);
        estimateData.contractPdfUrl = contractPdfUrl;
        Logger.log('✅ Signed contract saved to Google Drive: ' + contractPdfUrl);
        
        // Wait a moment to ensure PDF is fully saved before attaching to email
        Utilities.sleep(500);
      } catch (error) {
        Logger.log('⚠️ Error saving contract PDF: ' + error.toString());
      }
      
      // Create project from approved estimate
      const project = createProjectFromEstimate(estimateId);
      
      if (project.success) {
        // Reload estimate data to ensure we have the latest payment schedule
        const reloadedEstimate = getInvoiceEstimate(estimateId);
        if (reloadedEstimate.success && reloadedEstimate.data) {
          // Merge updated data with approval info (preserve approval-specific fields)
          const reloadedData = reloadedEstimate.data;
          estimateData.paymentSchedule = reloadedData.paymentSchedule || estimateData.paymentSchedule;
          estimateData.items = reloadedData.items || estimateData.items;
          estimateData.total = reloadedData.total || estimateData.total;
          estimateData.subtotal = reloadedData.subtotal || estimateData.subtotal;
          estimateData.tax = reloadedData.tax || estimateData.tax;
          estimateData.discount = reloadedData.discount || estimateData.discount;
          // Keep approval fields we just set
          // (approvalStatus, approvalDate, signatureUrl, printedName, customerNotes, contractPdfUrl already set)
        }
        
        // Ensure contractPdfUrl is in estimateData for email
        if (contractPdfUrl) {
          estimateData.contractPdfUrl = contractPdfUrl;
        }
        
        // Send notification email to ADMIN
        sendApprovalConfirmationEmail(estimateData, project.projectId, contractPdfUrl);
        // Send confirmation email to CUSTOMER immediately (no countersignature required)
        sendCustomerApprovalConfirmationEmail(estimateData, project.projectId, contractPdfUrl);

        // Also send Brooks link + Telegram draft when available (same shared helper as InvoiceEstimate flow).
        try {
          if (typeof sendBrooksLinkNotification === 'function') {
            var brooksViewLink = '';
            if (typeof getCustomerViewerWebflowUrl === 'function') {
              brooksViewLink = getCustomerViewerWebflowUrl('Estimate', estimateId, token);
            }
            if (!brooksViewLink) {
              brooksViewLink = 'https://aesthetic-kataifi-88ba27.netlify.app/invoiceestimateviewer.html'
                + '?id=' + encodeURIComponent(String(estimateId || '').trim())
                + (token ? '&token=' + encodeURIComponent(String(token).trim()) : '');
            }

            var brooksDraft = 'Hi ' + String((estimateData.customerName || 'there')).split(' ')[0]
              + '! Your estimate has been approved and signed. You can review it here: ' + brooksViewLink;

            var brooksRes = sendBrooksLinkNotification(
              brooksViewLink,
              estimateId,
              'Estimate',
              estimateData.customerName || '',
              estimateData.customerPhone || '',
              token || '',
              brooksDraft
            );
            Logger.log('Brooks notify from handleEstimateApproval: ' + JSON.stringify(brooksRes));
          }
        } catch (brooksErr) {
          Logger.log('⚠️ Brooks notify (handleEstimateApproval) failed: ' + brooksErr.toString());
        }
        
        Logger.log('✅ Estimate approved and project created: ' + project.projectId);
        
        return {
          success: true,
          message: 'Estimate approved and project created',
          projectId: project.projectId,
          estimateId: estimateId,
          contractPdfUrl: contractPdfUrl
        };
      } else {
        return { success: false, error: 'Project creation failed: ' + project.error };
      }
      
    } else {
      // Handle rejection
      estimateData.approvalStatus = 'Rejected';
      estimateData.status = 'Rejected';
      estimateData.rejectionDate = new Date().toISOString();
      estimateData.customerNotes = customerNotes || '';
      
      saveInvoiceEstimate(estimateData);
      
      // Send rejection notification
      sendRejectionNotificationEmail(estimateData);
      
      Logger.log('ℹ️ Estimate rejected: ' + estimateId);
      
      return {
        success: true,
        message: 'Estimate rejected',
        estimateId: estimateId
      };
    }
    
  } catch (error) {
    Logger.log('❌ Error handling approval: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Save signature image to Google Drive
 * @param {string} estimateId - The estimate ID
 * @param {string} signatureData - Base64 signature image data
 * @returns {string} - URL of saved signature
 */
function saveSignatureToGoogleDrive(estimateId, signatureData) {
  try {
    // Remove data:image/png;base64, prefix if present
    const base64Data = signatureData.replace(/^data:image\/\w+;base64,/, '');
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), 'image/png', 'signature_' + estimateId + '.png');
    
    const folder = DriveApp.getFolderById(CUSTOMER_DRIVE_FOLDER_ID);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    Logger.log('✅ Signature saved to Drive for estimate: ' + estimateId);
    return file.getUrl();
    
  } catch (error) {
    Logger.log('⚠️ Error saving signature: ' + error.toString());
    return '';
  }
}

/**
 * Send approval confirmation email
 * @param {object} estimateData - The estimate data
 * @param {string} projectId - The created project ID
 * @param {string} contractPdfUrl - URL to signed contract PDF
 */
function sendApprovalConfirmationEmail(estimateData, projectId, contractPdfUrl) {
  try {
    const subject = '✅ Contract Approved - Your Signed Agreement - ' + COMPANY_NAME;
    
    // Get payment schedule for first payment amount
    let paymentSchedule = [];
    if (estimateData.paymentSchedule) {
      if (typeof estimateData.paymentSchedule === 'string') {
        try {
          paymentSchedule = JSON.parse(estimateData.paymentSchedule);
        } catch (e) {
          Logger.log('⚠️ Error parsing payment schedule string: ' + e.toString());
          paymentSchedule = [];
        }
      } else if (Array.isArray(estimateData.paymentSchedule)) {
        paymentSchedule = estimateData.paymentSchedule;
      }
    }
    
    Logger.log('📋 Payment schedule loaded: ' + paymentSchedule.length + ' milestones');
    if (paymentSchedule.length > 0) {
      Logger.log('📋 First payment: ' + JSON.stringify(paymentSchedule[0]));
    }
    
    const firstPayment = paymentSchedule.length > 0 ? paymentSchedule[0] : null;
    
    // Generate Stripe payment link for first payment
    let stripePaymentLink = '';
    let stripeError = '';
    
    if (firstPayment && parseFloat(firstPayment.amount) > 0) {
      try {
        Logger.log('💳 Attempting to create Stripe checkout for: $' + parseFloat(firstPayment.amount));
        
        // Use the existing createStripePaymentLink function
        const invoiceId = estimateData.id || projectId;
        const paymentResult = createStripePaymentLink(
          estimateData.customerEmail,
          estimateData.customerName,
          projectId + ' - ' + firstPayment.name,
          parseFloat(firstPayment.amount),
          invoiceId,
          projectId
        );
        
        Logger.log('💳 Stripe payment link result: ' + JSON.stringify(paymentResult));
        
        if (paymentResult && paymentResult.success && paymentResult.paymentUrl) {
          stripePaymentLink = paymentResult.paymentUrl;
          Logger.log('✅ Stripe payment link generated for first payment: ' + stripePaymentLink);
        } else {
          stripeError = paymentResult ? (paymentResult.error || 'Unknown error') : 'No response from Stripe';
          Logger.log('⚠️ Failed to generate Stripe link: ' + stripeError);
        }
      } catch (error) {
        stripeError = error.toString();
        Logger.log('⚠️ Error creating Stripe payment link: ' + stripeError);
      }
    } else {
      Logger.log('⚠️ No first payment found or amount is 0');
      if (!firstPayment) {
        Logger.log('⚠️ Payment schedule is empty or first payment is missing');
      } else {
        Logger.log('⚠️ First payment amount: ' + parseFloat(firstPayment.amount));
      }
    }
    
    var paymentBlock = '';
    if (firstPayment && parseFloat(firstPayment.amount) > 0) {
      var stripeBlock = (stripePaymentLink && stripePaymentLink.length > 0)
        ? '<a href="' + stripePaymentLink + '" style="display: inline-block; padding: 18px 40px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-decoration: none; border-radius: 10px; font-weight: 800; font-size: 20px; box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4); margin-bottom: 12px;">💳 Pay Now Online</a><p style="margin: 12px 0 0 0; font-size: 13px; color: #78350f;">Secure payment powered by Stripe</p><p style="margin: 16px 0 0 0; font-size: 13px; color: #78350f; font-style: italic;">Or pay by check at our first project meeting</p>'
        : '<div style="background: white; padding: 20px; border-radius: 8px; margin-top: 16px;"><p style="margin: 0 0 12px 0; font-size: 15px; color: #78350f; font-weight: 700;">Payment Options:</p><p style="margin: 0 0 8px 0; font-size: 14px; color: #78350f;">✓ Pay by check at our first project meeting</p><p style="margin: 0; font-size: 14px; color: #78350f;">✓ Call ' + COMPANY_PHONE + ' to arrange payment</p></div>';
      paymentBlock = '<div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); padding: 30px; border-radius: 12px; margin: 30px 0; border: 3px solid #f59e0b; text-align: center;">' +
        '<p style="margin: 0 0 12px 0; font-size: 18px; font-weight: 700; color: #78350f;">' + (firstPayment.name || 'First Payment') + '</p>' +
        '<p style="margin: 0 0 24px 0; font-size: 42px; font-weight: 900; color: #92400e;">$' + parseFloat(firstPayment.amount).toFixed(2) + '</p>' + stripeBlock + '</div>';
    }
    const htmlBody = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">' +
      '<div style="background: linear-gradient(135deg, #0369a1 0%, #0ea5e9 100%); padding: 30px; text-align: center;"><h1 style="color: white; margin: 0; font-size: 28px;">Contract Approved</h1></div>' +
      '<div style="padding: 30px; background: #f9fafb;">' +
        '<p style="font-size: 16px; margin-bottom: 20px;"><strong>' + estimateData.customerName + ',</strong></p>' +
        '<p style="margin-bottom: 24px;">Thank you for signing your contract! Once our company signs the contract, we will return a fully executed copy back to you via email.</p>' +
        '<div style="background: #eff6ff; padding: 16px; border-radius: 8px; border-left: 4px solid #3b82f6; margin: 20px 0;">' +
          '<p style="margin: 0; font-size: 14px; color: #1e40af;">' +
            '<strong>📝 Next Step:</strong> Our team will review and sign your contract. Once fully executed, you\'ll receive the final signed copy via email.</p></div>' +
        paymentBlock +
        '<div style="background: white; padding: 16px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb;">' +
          '<p style="margin: 0 0 8px 0; font-size: 13px; color: #6b7280;"><strong>Project ID:</strong> ' + projectId + '</p>' +
          '<p style="margin: 0; font-size: 13px; color: #6b7280;"><strong>Contract Amount:</strong> $' + parseFloat(estimateData.total).toFixed(2) + '</p></div>' +
        '<div style="background: #eff6ff; padding: 20px; border-radius: 8px; border-left: 4px solid #3b82f6; margin: 24px 0;">' +
          '<p style="margin: 0 0 12px 0; font-size: 15px; font-weight: 700; color: #1e40af;">📧 Communication & Updates</p>' +
          '<p style="margin: 0; font-size: 14px; color: #374151;">You will receive daily work updates via email. We\'ll contact you within 24-48 hours to schedule your project start date.</p></div>' +
        '<p style="margin-top: 20px; font-size: 14px; color: #6b7280;">Questions? Call ' + COMPANY_PHONE + ' or reply to this email.</p>' +
        '<p style="margin-top: 20px; font-size: 14px; color: #6b7280;">' + COMPANY_NAME + '<br>' + COMPANY_PHONE + ' | ' + COMPANY_EMAIL + '</p>' +
      '</div></div>';
    
    // Get contract PDF as attachment
    let attachments = [];
    if (contractPdfUrl && contractPdfUrl.length > 0) {
      try {
        Logger.log('📎 Attempting to attach PDF from URL: ' + contractPdfUrl);
        
        // Extract file ID from Google Drive URL
        // URL format: https://drive.google.com/file/d/FILE_ID/view
        let fileId = null;
        const driveMatch = contractPdfUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (driveMatch) {
          fileId = driveMatch[1];
          Logger.log('📎 Extracted file ID from /d/ pattern: ' + fileId);
        } else {
          // Try direct ID match
          const idMatch = contractPdfUrl.match(/[a-zA-Z0-9_-]{25,}/);
          if (idMatch) {
            fileId = idMatch[0];
            Logger.log('📎 Extracted file ID from direct match: ' + fileId);
          }
        }
        
        if (fileId) {
          try {
            const pdfFile = DriveApp.getFileById(fileId);
            const pdfBlob = pdfFile.getBlob();
            const fileName = 'Signed_Contract_' + estimateData.customerName.replace(/[^a-zA-Z0-9]/g, '_') + '_' + (estimateData.id || projectId) + '.pdf';
            pdfBlob.setName(fileName);
            attachments.push(pdfBlob);
            Logger.log('✅ PDF attached to admin email: ' + fileName + ' (Size: ' + pdfBlob.getBytes().length + ' bytes)');
          } catch (fileError) {
            Logger.log('⚠️ Error accessing PDF file: ' + fileError.toString());
            Logger.log('⚠️ File ID was: ' + fileId);
          }
        } else {
          Logger.log('⚠️ Could not extract file ID from URL: ' + contractPdfUrl);
        }
      } catch (e) {
        Logger.log('⚠️ Could not attach PDF: ' + e.toString());
        Logger.log('⚠️ PDF URL was: ' + contractPdfUrl);
      }
    } else {
      Logger.log('⚠️ No contract PDF URL provided for admin email attachment');
    }
    
    // Send to ADMIN (not customer) - customer has signed, admin needs to sign
    const emailOptions = {
      to: COMPANY_EMAIL, // Changed: Send to admin, not customer
      subject: '📝 Contract Signed by Customer - Awaiting Your Signature - ' + estimateData.customerName,
      htmlBody: '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">' +
        '<div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; text-align: center;"><h1 style="color: white; margin: 0; font-size: 28px;">Contract Signed by Customer</h1></div>' +
        '<div style="padding: 30px; background: #f9fafb;">' +
          '<p style="font-size: 16px; margin-bottom: 20px;"><strong>Action Required:</strong></p>' +
          '<p style="margin-bottom: 24px;">' + estimateData.customerName + ' has signed the contract. ' + (attachments.length > 0 ? 'The signed contract PDF is attached to this email.' : 'Please review the contract in the InvoiceEstimateUI.') + '</p>' +
          '<p style="margin-bottom: 24px; font-weight: 700; color: #dc2626;">⚠️ IMPORTANT: Please sign the contract in the InvoiceEstimateUI.</p>' +
          '<div style="background: #fef3c7; padding: 20px; border-radius: 8px; border-left: 4px solid #f59e0b; margin: 24px 0;">' +
            '<p style="margin: 0 0 12px 0; font-size: 15px; font-weight: 700; color: #78350f;">📋 Contract Details</p>' +
            '<p style="margin: 0 0 8px 0; font-size: 14px; color: #374151;"><strong>Project ID:</strong> ' + projectId + '</p>' +
            '<p style="margin: 0 0 8px 0; font-size: 14px; color: #374151;"><strong>Customer:</strong> ' + estimateData.customerName + '</p>' +
            '<p style="margin: 0 0 8px 0; font-size: 14px; color: #374151;"><strong>Contract Amount:</strong> $' + parseFloat(estimateData.total).toFixed(2) + '</p>' +
            '<p style="margin: 0 0 8px 0; font-size: 14px; color: #374151;"><strong>Signed By:</strong> ' + (estimateData.printedName || estimateData.customerName) + '</p>' +
            '<p style="margin: 0; font-size: 14px; color: #374151;"><strong>Date Signed:</strong> ' + (estimateData.approvalDate ? new Date(estimateData.approvalDate).toLocaleDateString() : 'N/A') + '</p>' +
          '</div>' +
          '<div style="background: #eff6ff; padding: 20px; border-radius: 8px; border-left: 4px solid #3b82f6; margin: 24px 0;">' +
            '<p style="margin: 0 0 12px 0; font-size: 15px; font-weight: 700; color: #1e40af;">✅ Next Steps</p>' +
            '<p style="margin: 0; font-size: 14px; color: #374151;">1. Open the InvoiceEstimateUI and go to the Invoices tab. 2. Find this contract in Contracts Awaiting Your Signature. 3. Sign using the signature pad. 4. Customer will receive the fully executed contract.</p>' +
          '</div>' +
          (contractPdfUrl ? '<div style="text-align: center; margin: 30px 0;"><a href="' + contractPdfUrl + '" style="display: inline-block; padding: 16px 32px; background: #0369a1; color: white; text-decoration: none; border-radius: 8px; font-weight: 700;">📄 View Signed Contract PDF</a></div>' : '') +
          '<p style="margin-top: 20px; font-size: 14px; color: #6b7280;">This contract will appear under Pending Actions for your signature.</p>' +
        '</div></div>'
    };
    
    // Add attachments if available
    if (attachments.length > 0) {
      emailOptions.attachments = attachments;
      Logger.log('📎 Adding ' + attachments.length + ' attachment(s) to admin email');
    } else {
      Logger.log('⚠️ No attachments to add to admin email');
    }
    
    MailApp.sendEmail(emailOptions);
    
    Logger.log('✅ Approval confirmation email sent to ADMIN: ' + COMPANY_EMAIL + (attachments.length > 0 ? ' with PDF attachment' : ' (no attachment)'));
    
  } catch (error) {
    Logger.log('⚠️ Error sending approval email: ' + error.toString());
  }
}

/**
 * Send approval confirmation email to CUSTOMER with payment link
 * @param {object} estimateData - The estimate data
 * @param {string} projectId - The created project ID
 * @param {string} contractPdfUrl - URL to signed contract PDF
 */
function sendCustomerApprovalConfirmationEmail(estimateData, projectId, contractPdfUrl) {
  try {
    const subject = '✅ Contract Approved - Your Signed Agreement - ' + COMPANY_NAME;
    
    // Get payment schedule for first payment amount
    let paymentSchedule = [];
    if (estimateData.paymentSchedule) {
      if (typeof estimateData.paymentSchedule === 'string') {
        try {
          paymentSchedule = JSON.parse(estimateData.paymentSchedule);
        } catch (e) {
          Logger.log('⚠️ Error parsing payment schedule string: ' + e.toString());
          paymentSchedule = [];
        }
      } else if (Array.isArray(estimateData.paymentSchedule)) {
        paymentSchedule = estimateData.paymentSchedule;
      }
    }
    
    const firstPayment = paymentSchedule.length > 0 ? paymentSchedule[0] : null;
    
    // Generate Stripe payment link for first payment
    let stripePaymentLink = '';
    
    if (firstPayment && parseFloat(firstPayment.amount) > 0) {
      try {
        Logger.log('💳 Creating Stripe payment link for customer: $' + parseFloat(firstPayment.amount));
        
        const invoiceId = estimateData.id || projectId;
        const paymentResult = createStripePaymentLink(
          estimateData.customerEmail,
          estimateData.customerName,
          (projectId + ' - ' + firstPayment.name),
          parseFloat(firstPayment.amount),
          invoiceId,
          projectId
        );
        
        if (paymentResult && paymentResult.success && paymentResult.paymentUrl) {
          stripePaymentLink = paymentResult.paymentUrl;
          Logger.log('✅ Stripe payment link generated for customer: ' + stripePaymentLink);
        } else {
          Logger.log('⚠️ Failed to generate Stripe link for customer: ' + (paymentResult ? paymentResult.error : 'Unknown error'));
        }
      } catch (error) {
        Logger.log('⚠️ Error creating Stripe payment link for customer: ' + error.toString());
      }
    }
    
    var payBlock = '';
    if (firstPayment && parseFloat(firstPayment.amount) > 0) {
      var stripeBlock = (stripePaymentLink && stripePaymentLink.length > 0)
        ? '<a href="' + stripePaymentLink + '" style="display: inline-block; padding: 18px 40px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-decoration: none; border-radius: 10px; font-weight: 800;">💳 Pay Now Online</a><p style="margin: 12px 0 0 0; font-size: 13px; color: #78350f;">Secure payment powered by Stripe</p>'
        : '<div style="background: white; padding: 20px; border-radius: 8px; margin-top: 16px;"><p style="margin: 0 0 12px 0; font-size: 15px; color: #78350f; font-weight: 700;">Payment Options:</p><p style="margin: 0; font-size: 14px; color: #78350f;">✓ Pay by check at our first project meeting</p><p style="margin: 0; font-size: 14px; color: #78350f;">✓ Call ' + COMPANY_PHONE + ' to arrange payment</p></div>';
      payBlock = '<div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); padding: 30px; border-radius: 12px; margin: 30px 0; border: 3px solid #f59e0b; text-align: center;">' +
        '<p style="margin: 0 0 12px 0; font-size: 18px; font-weight: 700; color: #78350f;">' + (firstPayment.name || 'First Payment') + '</p>' +
        '<p style="margin: 0 0 24px 0; font-size: 42px; font-weight: 900; color: #92400e;">$' + parseFloat(firstPayment.amount).toFixed(2) + '</p>' + stripeBlock + '</div>';
    }
    const htmlBody = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">' +
      '<div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center;"><h1 style="color: white; margin: 0; font-size: 28px;">Contract Approved!</h1></div>' +
      '<div style="padding: 30px; background: #f9fafb;">' +
        '<p style="font-size: 16px; margin-bottom: 20px;"><strong>' + estimateData.customerName + ',</strong></p>' +
        '<p style="margin-bottom: 24px;">Thank you for signing! Your approved estimate is attached to this email for your records.</p>' +
        '<div style="background: #eff6ff; padding: 16px; border-radius: 8px; border-left: 4px solid #3b82f6; margin: 20px 0;">' +
          '<p style="margin: 0; font-size: 14px; color: #1e40af;"><strong>📝 Next Step:</strong> Our team will be in touch within 24–48 hours to confirm your project start date and next steps.</p></div>' +
        payBlock +
        '<div style="background: white; padding: 16px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb;">' +
          '<p style="margin: 0 0 8px 0; font-size: 13px; color: #6b7280;"><strong>Project ID:</strong> ' + projectId + '</p>' +
          '<p style="margin: 0; font-size: 13px; color: #6b7280;"><strong>Contract Amount:</strong> $' + parseFloat(estimateData.total).toFixed(2) + '</p></div>' +
        '<div style="background: #eff6ff; padding: 20px; border-radius: 8px; border-left: 4px solid #3b82f6; margin: 24px 0;">' +
          '<p style="margin: 0 0 12px 0; font-size: 15px; font-weight: 700; color: #1e40af;">📧 Communication & Updates</p>' +
          '<p style="margin: 0; font-size: 14px; color: #374151;">You will receive daily work updates via email. We\'ll contact you within 24-48 hours to schedule your project start date.</p></div>' +
        '<p style="margin-top: 20px; font-size: 14px; color: #6b7280;">Questions? Call ' + COMPANY_PHONE + ' or reply to this email.</p>' +
        '<p style="margin-top: 20px; font-size: 14px; color: #6b7280;">' + COMPANY_NAME + '<br>' + COMPANY_PHONE + ' | ' + COMPANY_EMAIL + '</p>' +
      '</div></div>';
    
    // Get contract PDF as attachment
    let attachments = [];
    if (contractPdfUrl) {
      try {
        const driveMatch = contractPdfUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (driveMatch) {
          const fileId = driveMatch[1];
          const pdfFile = DriveApp.getFileById(fileId);
          const pdfBlob = pdfFile.getBlob();
          pdfBlob.setName('Signed_Contract_' + estimateData.customerName + '_' + (estimateData.id || projectId) + '.pdf');
          attachments.push(pdfBlob);
          Logger.log('✅ PDF attached to customer email: ' + pdfFile.getName());
        }
      } catch (e) {
        Logger.log('⚠️ Could not attach PDF to customer email: ' + e.toString());
      }
    }
    
    const emailOptions = {
      to: estimateData.customerEmail,
      subject: subject,
      htmlBody: htmlBody
    };
    
    if (attachments.length > 0) {
      emailOptions.attachments = attachments;
    }
    
    MailApp.sendEmail(emailOptions);
    
    Logger.log('✅ Customer approval confirmation email sent with payment link to: ' + estimateData.customerEmail);
    
  } catch (error) {
    Logger.log('⚠️ Error sending customer approval email: ' + error.toString());
  }
}

/**
 * Send rejection notification email
 * @param {object} estimateData - The estimate data
 */
function sendRejectionNotificationEmail(estimateData) {
  try {
    const subject = 'Estimate Update - ' + COMPANY_NAME;
    
    const htmlBody = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">' +
      '<div style="background: #6b7280; padding: 30px; text-align: center;"><h1 style="color: white; margin: 0;">Thank You for Reviewing</h1></div>' +
      '<div style="padding: 30px; background: #f9fafb;">' +
        '<p>Dear ' + estimateData.customerName + ',</p>' +
        '<p>We understand that our estimate didn\'t meet your needs at this time.</p>' +
        (estimateData.customerNotes ? '<div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;"><h3>Your Feedback:</h3><p>' + estimateData.customerNotes + '</p></div>' : '') +
        '<p>We\'d love to discuss any concerns or make adjustments. Please feel free to contact us:</p>' +
        '<p><strong>Phone:</strong> ' + COMPANY_PHONE + '<br><strong>Email:</strong> ' + COMPANY_EMAIL + '</p>' +
        '<p>We appreciate your consideration and hope to work with you in the future.</p>' +
        '<p>Best regards,<br>' + COMPANY_NAME + '</p>' +
      '</div></div>';
    
    MailApp.sendEmail({
      to: estimateData.customerEmail,
      subject: subject,
      htmlBody: htmlBody
    });
    
    // Notify company
    MailApp.sendEmail({
      to: COMPANY_EMAIL,
      subject: 'Estimate Rejected: ' + estimateData.customerName,
      htmlBody: '<p>' + estimateData.customerName + ' has rejected the estimate.</p>' +
        (estimateData.customerNotes ? '<p><strong>Customer Notes:</strong> ' + estimateData.customerNotes + '</p>' : '') +
        '<p>Consider reaching out to discuss their concerns.</p>'
    });
    
    Logger.log('✅ Rejection notification emails sent');
    
  } catch (error) {
    Logger.log('⚠️ Error sending rejection email: ' + error.toString());
  }
}

// ============================================================================
// PROJECT CRUD OPERATIONS
// ============================================================================

/**
 * Create project from approved estimate
 * @param {string} estimateId - The estimate ID
 * @returns {object} - Created project data
 */
function createProjectFromEstimate(estimateId) {
  try {
    const estimate = getInvoiceEstimate(estimateId);
    if (!estimate.success) {
      return { success: false, error: 'Invoice/Estimate not found' };
    }
    
    const estimateData = estimate.data;
    
    // Log what we received from getInvoiceEstimate
    Logger.log('📋 estimateData keys: ' + Object.keys(estimateData).join(', '));
    Logger.log('📋 estimateData.items type: ' + typeof estimateData.items);
    Logger.log('📋 estimateData.items value (first 200 chars): ' + String(estimateData.items || '').substring(0, 200));
    
    // Check if already has a project
    if (estimateData.projectId) {
      return { 
        success: false, 
        error: 'This invoice/estimate already has a project: ' + estimateData.projectId 
      };
    }
    
    // Generate project ID
    const projectId = 'PROJ-' + new Date().getTime();
    
    // Parse items - try multiple approaches
    let items = [];
    
    // Method 1: Direct items field
    if (estimateData.items) {
      if (typeof estimateData.items === 'string') {
        try {
          const parsed = JSON.parse(estimateData.items);
          if (Array.isArray(parsed)) {
            items = parsed;
            Logger.log('✅ Parsed items from string: ' + items.length + ' items');
          }
        } catch (e) {
          Logger.log('⚠️ Error parsing items string: ' + e.toString());
        }
      } else if (Array.isArray(estimateData.items)) {
        items = estimateData.items;
        Logger.log('✅ Items is already an array: ' + items.length + ' items');
      }
    }
    
    // Method 2: Try lineItems if items is empty
    if (items.length === 0 && estimateData.lineItems) {
      if (Array.isArray(estimateData.lineItems)) {
        items = estimateData.lineItems;
        Logger.log('✅ Using lineItems: ' + items.length + ' items');
      } else if (typeof estimateData.lineItems === 'string') {
        try {
          items = JSON.parse(estimateData.lineItems);
          Logger.log('✅ Parsed lineItems from string: ' + items.length + ' items');
        } catch (e) {
          Logger.log('⚠️ Error parsing lineItems: ' + e.toString());
        }
      }
    }
    
    // Method 3: Try to extract from the raw JSON if available
    if (items.length === 0 && estimateData.rawData) {
      try {
        const rawData = typeof estimateData.rawData === 'string' ? JSON.parse(estimateData.rawData) : estimateData.rawData;
        if (rawData.items) {
          if (typeof rawData.items === 'string') {
            items = JSON.parse(rawData.items);
          } else if (Array.isArray(rawData.items)) {
            items = rawData.items;
          }
          Logger.log('✅ Found items in rawData: ' + items.length + ' items');
        }
      } catch (e) {
        Logger.log('⚠️ Error extracting from rawData: ' + e.toString());
      }
    }
    
    // Ensure items is an array
    if (!Array.isArray(items)) {
      Logger.log('⚠️ Items is still not an array after all attempts, setting to empty array');
      items = [];
    }
    
    // Log final items
    Logger.log('📋 FINAL items count: ' + items.length);
    if (items.length > 0) {
      Logger.log('📋 First item sample: ' + JSON.stringify(items[0]));
    } else {
      Logger.log('⚠️ WARNING: No items found to copy to project!');
      Logger.log('📋 Full estimateData structure: ' + JSON.stringify(estimateData).substring(0, 500));
    }
    
    // Parse payment schedule if it's a string
    let paymentSchedule = estimateData.paymentSchedule || [];
    if (typeof paymentSchedule === 'string') {
      try {
        paymentSchedule = JSON.parse(paymentSchedule);
      } catch (e) {
        Logger.log('⚠️ Error parsing payment schedule: ' + e.toString());
        paymentSchedule = [];
      }
    }
    
    // Ensure items is properly formatted as an array
    if (!Array.isArray(items)) {
      Logger.log('⚠️ Items is not an array, setting to empty array');
      items = [];
    }
    
    // Log final items count
    Logger.log('✅ Final items count for project: ' + items.length);
    if (items.length > 0) {
      Logger.log('✅ Sample item structure: ' + JSON.stringify(items[0]));
    }
    
    // Create project JSON
    const projectData = {
      projectId: projectId,
      invoiceId: estimateId, // Store both invoice and estimate IDs
      estimateId: estimateId,
      customerName: estimateData.customerName,
      customerEmail: estimateData.customerEmail,
      customerPhone: estimateData.customerPhone,
      customerAddress: estimateData.customerAddress,
      items: items, // Store as array - will be JSON stringified when saving
      subtotal: parseFloat(estimateData.subtotal || 0),
      taxRate: parseFloat(estimateData.taxRate || 0),
      tax: parseFloat(estimateData.tax || 0),
      discount: parseFloat(estimateData.discount || 0),
      total: parseFloat(estimateData.total || estimateData.totalValue || 0),
      totalValue: parseFloat(estimateData.total || estimateData.totalValue || 0),
      paymentSchedule: paymentSchedule,
      status: 'Active',
      createdDate: new Date().toISOString(),
      notes: estimateData.notes || '',
      terms: estimateData.terms || '',
      signatureUrl: estimateData.signatureUrl || '',
      changeOrders: [],
      dailyUpdates: [],
      milestoneStatus: {}
    };
    
    // Initialize milestone status
    if (projectData.paymentSchedule && projectData.paymentSchedule.length > 0) {
      projectData.paymentSchedule.forEach(milestone => {
        projectData.milestoneStatus[milestone.id] = {
          invoiced: false,
          paid: false,
          invoiceId: null,
          datePaid: null
        };
      });
    }
    
    // Convert to JSON and chunk if needed
    const projectJson = JSON.stringify(projectData);
    const chunks = chunkJsonData(projectJson, 50000);
    
    // Save to PM_Projects sheet
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let projectsSheet = spreadsheet.getSheetByName(PM_PROJECTS_SHEET);
    
    if (!projectsSheet) {
      setupPMProjectsSheet(spreadsheet);
      projectsSheet = spreadsheet.getSheetByName(PM_PROJECTS_SHEET);
    }
    
    const headers = projectsSheet.getRange(1, 1, 1, projectsSheet.getLastColumn()).getValues()[0] || [];
    const rowData = new Array(headers.length).fill('');
    const setIfHeader = function(headerName, value) {
      const idx = headers.indexOf(headerName);
      if (idx !== -1) rowData[idx] = value;
    };
    
    setIfHeader('Company ID', 'CMP-AQUALITYPOOL');
    setIfHeader('Project ID', projectId);
    setIfHeader('Invoice ID', estimateId); // CRITICAL: PM_Projects column B must store source invoice/estimate ID
    setIfHeader('Customer Email', estimateData.customerEmail || '');
    setIfHeader('Project JSON Part 1', chunks[0] || '');
    setIfHeader('Project JSON Part 2', chunks[1] || '');
    setIfHeader('Project JSON Part 3', chunks[2] || '');
    setIfHeader('Status', 'Active');
    setIfHeader('Total Value', parseFloat(estimateData.total || estimateData.totalValue || 0));
    setIfHeader('Profit Margin %', 0);
    
    // Legacy fallback (if headers are missing/unknown)
    if (rowData.every(function(v) { return v === ''; })) {
      projectsSheet.appendRow([
        projectId,
        estimateId, // Column B = Invoice ID
        estimateData.customerEmail || '',
        chunks[0] || '',
        chunks[1] || '',
        chunks[2] || '',
        'Active',
        parseFloat(estimateData.total || estimateData.totalValue || 0),
        0
      ]);
    } else {
      projectsSheet.appendRow(rowData);
    }
    
    // Link invoice/estimate to project (add Project ID column if needed)
    const estimatesSheet = spreadsheet.getSheetByName(INVOICES_ESTIMATES_SHEET);
    if (estimatesSheet) {
      const estimateRow = findEstimateRow(estimatesSheet, estimateId);
      if (estimateRow > 0) {
        // Check if sheet has 8 columns (new structure) or 7 (old structure)
        const lastCol = estimatesSheet.getLastColumn();
        let projectIdCol = -1;
        
        // Find Project ID column
        const estimateHeaders = estimatesSheet.getRange(1, 1, 1, lastCol).getValues()[0];
        projectIdCol = estimateHeaders.indexOf('Project ID');
        
        if (projectIdCol === -1) {
          // Add Project ID column
          if (lastCol >= 8) {
            // New structure - Project ID should be column 9 (after Payment Schedule column 8)
            projectIdCol = 9;
            estimatesSheet.insertColumnAfter(8);
            estimatesSheet.getRange(1, projectIdCol).setValue('Project ID').setFontWeight('bold').setBackground('#0369a1').setFontColor('#ffffff');
          } else {
            // Old structure - Project ID should be column 8
            projectIdCol = 8;
            estimatesSheet.insertColumnAfter(7);
            estimatesSheet.getRange(1, projectIdCol).setValue('Project ID').setFontWeight('bold').setBackground('#0369a1').setFontColor('#ffffff');
          }
        }
        
        estimatesSheet.getRange(estimateRow, projectIdCol).setValue(projectId);
        Logger.log('✅ Linked invoice/estimate ' + estimateId + ' to project ' + projectId + ' in column ' + projectIdCol);
      }
    }
    
    Logger.log('✅ Project created: ' + projectId);
    
    return {
      success: true,
      projectId: projectId,
      projectData: projectData
    };
    
  } catch (error) {
    Logger.log('❌ Error creating project: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Find estimate row in sheet
 * @param {Sheet} sheet - The sheet to search
 * @param {string} estimateId - The estimate ID to find
 * @returns {number} - Row number (0 if not found)
 */
function findEstimateRow(sheet, estimateId) {
  const data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return 0;
  const headers = data[0] || [];
  const idCol = headers.indexOf('ID') !== -1 ? headers.indexOf('ID') : 1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol] || '').trim() === String(estimateId || '').trim()) {
      return i + 1;
    }
  }
  return 0;
}

/**
 * Force-persist admin countersign fields directly on the estimate row JSON.
 * This bypasses any legacy save-path mismatch so Pending Actions immediately reflects signed state.
 */
function forcePersistEstimateSignState(estimateId, patchData) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(INVOICES_ESTIMATES_SHEET);
    if (!sheet) return { success: false, error: 'Invoices & Estimates sheet not found' };
    
    const data = sheet.getDataRange().getValues();
    if (!data || data.length < 2) return { success: false, error: 'No estimate rows found' };
    
    const headers = data[0] || [];
    const idCol = headers.indexOf('ID') !== -1 ? headers.indexOf('ID') : 1;
    const json1Col = headers.indexOf('JSON Part 1') !== -1 ? headers.indexOf('JSON Part 1') : 3;
    const json2Col = headers.indexOf('JSON Part 2') !== -1 ? headers.indexOf('JSON Part 2') : 4;
    const json3Col = headers.indexOf('JSON Part 3') !== -1 ? headers.indexOf('JSON Part 3') : 5;
    
    let rowNum = 0;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idCol] || '').trim() === String(estimateId || '').trim()) {
        rowNum = i + 1;
        break;
      }
    }
    if (!rowNum) return { success: false, error: 'Estimate row not found: ' + estimateId };
    
    const j1 = data[rowNum - 1][json1Col] || '';
    const j2 = data[rowNum - 1][json2Col] || '';
    const j3 = data[rowNum - 1][json3Col] || '';
    let jsonStr = concatenateJsonChunks(j1, j2, j3);
    if (!jsonStr || !jsonStr.length) jsonStr = String(j1 || '').trim();
    if (!jsonStr || !jsonStr.startsWith('{')) return { success: false, error: 'Invalid JSON for estimate row' };
    
    const jsonData = JSON.parse(jsonStr);
    Object.keys(patchData || {}).forEach(function(k) {
      jsonData[k] = patchData[k];
    });
    
    const updatedJsonStr = JSON.stringify(jsonData);
    const updated = (typeof splitJsonString === 'function')
      ? splitJsonString(updatedJsonStr)
      : [updatedJsonStr, '', ''];
    sheet.getRange(rowNum, json1Col + 1, 1, 3).setValues([[updated[0] || '', updated[1] || '', updated[2] || '']]);
    SpreadsheetApp.flush();
    
    return { success: true, row: rowNum };
  } catch (error) {
    Logger.log('forcePersistEstimateSignState error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Chunk JSON data for storage in multiple columns
 * @param {string} jsonString - The JSON string to chunk
 * @param {number} chunkSize - Size of each chunk
 * @returns {array} - Array of chunks
 */
function chunkJsonData(jsonString, chunkSize) {
  const chunks = [];
  for (let i = 0; i < jsonString.length; i += chunkSize) {
    chunks.push(jsonString.substring(i, i + chunkSize));
  }
  // Ensure we have at least 3 elements
  while (chunks.length < 3) {
    chunks.push('');
  }
  return chunks;
}

/**
 * Get project by ID
 * @param {string} projectId - The project ID
 * @returns {object} - Project data
 */
function getProject(projectId) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(PM_PROJECTS_SHEET);
    
    if (!sheet) {
      return { success: false, error: 'Projects sheet not found' };
    }
    
    const data = sheet.getDataRange().getValues();
    
    // Detect columns by header name (case-insensitive).
    const headers = (data[0] || []).map(function(h) { return String(h || '').trim(); });
    function colIdx(names) {
      const list = Array.isArray(names) ? names : [names];
      for (var n = 0; n < list.length; n++) {
        var want = String(list[n] || '').toLowerCase();
        for (var c = 0; c < headers.length; c++) {
          if (String(headers[c] || '').toLowerCase() === want) return c;
        }
      }
      return -1;
    }

    const hasCompanyId = String(headers[0] || '').toLowerCase() === 'company id';
    let projectIdCol = colIdx(['Project ID', 'ProjectId']);
    let json1Col = colIdx('Project JSON Part 1');
    let json2Col = colIdx('Project JSON Part 2');
    let json3Col = colIdx('Project JSON Part 3');

    // Fallback indexes must match the actual PM_Projects layout.
    // With Company ID: [0]=Company ID, [1]=Project ID, [2]=Customer Email, [3..5]=JSON parts
    if (hasCompanyId) {
      if (projectIdCol === -1) projectIdCol = 1;
      if (json1Col === -1) json1Col = 3;
      if (json2Col === -1) json2Col = 4;
      if (json3Col === -1) json3Col = 5;
    } else {
      if (projectIdCol === -1) projectIdCol = 0;
      if (json1Col === -1) {
        var invColFallback = colIdx(['Invoice ID', 'Linked Invoice ID', 'Estimate ID', 'Linked Invoice']);
        if (invColFallback !== -1) {
          json1Col = invColFallback + 2;
          json2Col = invColFallback + 3;
          json3Col = invColFallback + 4;
        } else {
          if (json1Col === -1) json1Col = 2;
          if (json2Col === -1) json2Col = 3;
          if (json3Col === -1) json3Col = 4;
        }
      }
    }

    Logger.log('getProject column map — projectIdCol:' + projectIdCol + ' json1:' + json1Col + ' json2:' + json2Col + ' json3:' + json3Col);

    var jsonColsResolved = resolvePmJsonChunkColumns_(headers, hasCompanyId);
    var statusColResolved = findPmSheetColumnIndex_(headers, ['Status', 'Project Status', 'PM Status']);
    if (statusColResolved === -1) statusColResolved = hasCompanyId ? 6 : jsonColsResolved.json1Col + 3;
    
    const targetProjectId = String(projectId || '').trim();
    const unique = function(arr) {
      const out = [];
      arr.forEach(function(v) {
        const n = Number(v);
        if (!isNaN(n) && n >= 0 && out.indexOf(n) === -1) out.push(n);
      });
      return out;
    };
    const idCandidates = unique([projectIdCol, 1, 0, 2]);
    const jsonStartCandidates = unique([json1Col, 2, 3, 4]);

    function parseProjectFromRow(row, rowNum) {
      for (var j = 0; j < jsonStartCandidates.length; j++) {
        var start = jsonStartCandidates[j];
        var part1 = String(row[start] || '');
        var part2 = String(row[start + 1] || '');
        var part3 = String(row[start + 2] || '');
        var combined = concatenateJsonChunks(part1, part2, part3);
        if (!combined || !combined.trim()) continue;
        try {
          var parsed = JSON.parse(combined);
          if (parsed && typeof parsed === 'object') return parsed;
        } catch (e1) {
          // Try next candidate
        }
      }
      Logger.log('⚠️ getProject: matched ID row but no parseable JSON at row ' + rowNum);
      return null;
    }

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      let matched = false;
      for (let k = 0; k < idCandidates.length; k++) {
        const candidateCol = idCandidates[k];
        if (String(row[candidateCol] || '').trim() === targetProjectId) {
          matched = true;
          break;
        }
      }
      if (!matched) continue;

      const projectData = parseProjectFromRow(row, i + 1);
      if (!projectData) continue;

      if (statusColResolved >= 0 && statusColResolved < row.length && row[statusColResolved] !== '' && row[statusColResolved] != null) {
        projectData.status = String(row[statusColResolved]).trim();
      }
      
      // Ensure items is properly formatted
      if (projectData.items) {
        if (typeof projectData.items === 'string') {
          try {
            projectData.items = JSON.parse(projectData.items);
          } catch (e) {
            Logger.log('⚠️ Error parsing items string: ' + e.toString());
            projectData.items = [];
          }
        }
        if (!Array.isArray(projectData.items)) {
          Logger.log('⚠️ Items is not an array, converting...');
          projectData.items = [];
        }
      } else {
        projectData.items = [];
      }
      
      Logger.log('📋 getProject returning ' + projectData.items.length + ' items');
      
      return {
        success: true,
        project: projectData
      };
    }
    
    return { success: false, error: 'Project not found' };
    
  } catch (error) {
    Logger.log('❌ Error getting project: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Find a PM project whose linked estimate/invoice ID matches (estimateId, invoiceId, linkedEstimateId, etc.).
 * Used so the invoice viewer can show the same line items as project details (including one-off add-ons).
 */
function getProjectByLinkedInvoiceId(linkedInvoiceId) {
  try {
    const target = String(linkedInvoiceId || '').trim();
    if (!target) return { success: false, error: 'No invoice id' };

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(PM_PROJECTS_SHEET);
    if (!sheet) return { success: false, error: 'Projects sheet not found' };

    const data = sheet.getDataRange().getValues();
    const headers = (data[0] || []).map(function(h) { return String(h || '').trim(); });
    function colIdx(names) {
      const list = Array.isArray(names) ? names : [names];
      for (let n = 0; n < list.length; n++) {
        const want = String(list[n] || '').toLowerCase();
        for (let c = 0; c < headers.length; c++) {
          if (String(headers[c] || '').toLowerCase() === want) return c;
        }
      }
      return -1;
    }

    const hasCompanyId = String(headers[0] || '').toLowerCase() === 'company id';
    let projectIdCol = colIdx(['Project ID', 'ProjectId']);
    let json1Col = colIdx('Project JSON Part 1');
    let json2Col = colIdx('Project JSON Part 2');
    let json3Col = colIdx('Project JSON Part 3');

    if (hasCompanyId) {
      if (projectIdCol === -1) projectIdCol = 1;
      if (json1Col === -1) json1Col = 3;
      if (json2Col === -1) json2Col = 4;
      if (json3Col === -1) json3Col = 5;
    } else {
      if (projectIdCol === -1) projectIdCol = 0;
      if (json1Col === -1) json1Col = 2;
      if (json2Col === -1) json2Col = 3;
      if (json3Col === -1) json3Col = 4;
    }

    const unique = function(arr) {
      const out = [];
      arr.forEach(function(v) {
        const n = Number(v);
        if (!isNaN(n) && n >= 0 && out.indexOf(n) === -1) out.push(n);
      });
      return out;
    };
    const jsonStartCandidates = unique([json1Col, 2, 3, 4]);

    function parseProjectFromRow(row, rowNum) {
      for (let j = 0; j < jsonStartCandidates.length; j++) {
        const start = jsonStartCandidates[j];
        const part1 = String(row[start] || '');
        const part2 = String(row[start + 1] || '');
        const part3 = String(row[start + 2] || '');
        const combined = concatenateJsonChunks(part1, part2, part3);
        if (!combined || !combined.trim()) continue;
        try {
          const parsed = JSON.parse(combined);
          if (parsed && typeof parsed === 'object') return parsed;
        } catch (e1) { /* try next */ }
      }
      return null;
    }

    const targetLower = target.toLowerCase();

    function linksToInvoice(pd) {
      if (!pd || typeof pd !== 'object') return false;
      const ids = [
        pd.id,
        pd.estimateId,
        pd.invoiceId,
        pd.linkedEstimateId,
        pd.linkedInvoiceId,
        pd.quoteNumber,
        pd.invoiceNumber
      ];
      for (let i = 0; i < ids.length; i++) {
        const s = String(ids[i] || '').trim();
        if (!s) continue;
        if (s === target || s.toLowerCase() === targetLower) return true;
      }
      return false;
    }

    const invoiceIdHeaderCol = colIdx(['Invoice ID', 'InvoiceId', 'Estimate ID', 'Linked Invoice ID', 'Source Invoice']);

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const pid = String(row[projectIdCol] || '').trim();
      let cellLinked = '';
      if (invoiceIdHeaderCol >= 0) {
        cellLinked = String(row[invoiceIdHeaderCol] || '').trim();
      }

      const projectData = parseProjectFromRow(row, i + 1);
      const matchByCell = cellLinked && (cellLinked === target || cellLinked.toLowerCase() === targetLower);
      const matchByJson = projectData && linksToInvoice(projectData);
      if (!matchByCell && !matchByJson) continue;
      if (!projectData) continue;

      if (projectData.items) {
        if (typeof projectData.items === 'string') {
          try {
            projectData.items = JSON.parse(projectData.items);
          } catch (e) {
            projectData.items = [];
          }
        }
        if (!Array.isArray(projectData.items)) projectData.items = [];
      } else {
        projectData.items = [];
      }

      if (!projectData.projectId && pid) projectData.projectId = pid;

      Logger.log('📎 getProjectByLinkedInvoiceId: matched project ' + pid + ' for invoice ' + target);
      return {
        success: true,
        project: projectData,
        projectId: pid || projectData.projectId || ''
      };
    }

    // Fallback: same rows as getAllProjects (handles chunk/parse differences)
    try {
      if (typeof getAllProjects === 'function') {
        const all = getAllProjects();
        const list = (all && all.success && Array.isArray(all.projects)) ? all.projects : [];
        for (let j = 0; j < list.length; j++) {
          const row = list[j];
          const pd = row.projectData;
          if (!pd || typeof pd !== 'object') continue;
          if (!linksToInvoice(pd)) continue;
          let items = pd.items;
          if (typeof items === 'string') {
            try { items = JSON.parse(items || '[]'); } catch (e) { items = []; }
          }
          if (!Array.isArray(items)) items = [];
          pd.items = items;
          if (!pd.projectId && row.projectId) pd.projectId = row.projectId;
          Logger.log('📎 getProjectByLinkedInvoiceId: matched via getAllProjects fallback for ' + target);
          return {
            success: true,
            project: pd,
            projectId: String(row.projectId || pd.projectId || '').trim()
          };
        }
      }
    } catch (fbErr) {
      Logger.log('getProjectByLinkedInvoiceId getAllProjects fallback: ' + fbErr.toString());
    }

    return { success: false, error: 'No project linked to this invoice' };
  } catch (error) {
    Logger.log('❌ getProjectByLinkedInvoiceId: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * getProjectDetails lives in InvoiceEstimate.gs (column I merge, one-off schedule sync, invoice-id fallback).
 * A duplicate here overrides that implementation and breaks the project detail UI.
 */

/**
 * Update project
 * @param {string} projectId - The project ID
 * @param {object} updates - Updates to apply
 * @returns {object} - Success status
 */
/**
 * Find 0-based column index by header name(s).
 */
function findPmSheetColumnIndex_(headers, names) {
  const list = Array.isArray(names) ? names : [names];
  for (let r = 0; r < list.length; r++) {
    const want = String(list[r] || '').trim().toLowerCase();
    for (let c = 0; c < headers.length; c++) {
      if (String(headers[c] || '').trim().toLowerCase() === want) return c;
    }
  }
  return -1;
}

/**
 * Resolve JSON chunk columns for PM_Projects. Supports:
 * - Company ID layout (JSON at 3–5)
 * - Invoice ID + Email layout: JSON starts two columns after Invoice ID (e.g. A=Project, B=Invoice, C=Email, D–F=JSON)
 * - Legacy: no Invoice column → JSON at 2–4
 */
function resolvePmJsonChunkColumns_(headers, hasCompanyId) {
  let json1Col = findPmSheetColumnIndex_(headers, ['Project JSON Part 1']);
  let json2Col = findPmSheetColumnIndex_(headers, ['Project JSON Part 2']);
  let json3Col = findPmSheetColumnIndex_(headers, ['Project JSON Part 3']);
  if (json1Col !== -1 && json2Col !== -1 && json3Col !== -1) {
    return { json1Col: json1Col, json2Col: json2Col, json3Col: json3Col };
  }
  if (hasCompanyId) {
    return { json1Col: 3, json2Col: 4, json3Col: 5 };
  }
  const invCol = findPmSheetColumnIndex_(headers, ['Invoice ID', 'Linked Invoice ID', 'Estimate ID', 'Linked Invoice']);
  if (invCol !== -1) {
    const start = invCol + 2;
    return { json1Col: start, json2Col: start + 1, json3Col: start + 2 };
  }
  return { json1Col: 2, json2Col: 3, json3Col: 4 };
}

/**
 * Same Project ID column candidates as getProject — updateProject must use this or writes miss the row
 * when the ID lives in column B/C while A is Invoice ID / label.
 */
function getPmProjectIdColumnCandidates_(headers) {
  const hdrs = headers || [];
  function colIdx(names) {
    const list = Array.isArray(names) ? names : [names];
    for (var n = 0; n < list.length; n++) {
      var want = String(list[n] || '').toLowerCase();
      for (var c = 0; c < hdrs.length; c++) {
        if (String(hdrs[c] || '').toLowerCase() === want) return c;
      }
    }
    return -1;
  }
  var hasCompanyId = String(hdrs[0] || '').toLowerCase() === 'company id';
  var projectIdCol = colIdx(['Project ID', 'ProjectId']);
  if (hasCompanyId) {
    if (projectIdCol === -1) projectIdCol = 1;
  } else {
    if (projectIdCol === -1) projectIdCol = 0;
  }
  var out = [];
  [projectIdCol, 1, 0, 2].forEach(function(v) {
    var n = Number(v);
    if (!isNaN(n) && n >= 0 && out.indexOf(n) === -1) out.push(n);
  });
  return out;
}

function pmRowMatchesProjectId_(row, targetPid, idCandidates) {
  var t = String(targetPid || '').trim();
  for (var k = 0; k < idCandidates.length; k++) {
    var c = idCandidates[k];
    if (c >= 0 && c < row.length && String(row[c] || '').trim() === t) return true;
  }
  return false;
}

function updateProject(projectId, updates) {
  try {
    const project = getProject(projectId);
    if (!project.success) {
      return { success: false, error: 'Project not found' };
    }
    
    // Merge updates (full project object or partial)
    const projectData = { ...project.project, ...updates };
    
    // Convert to JSON and chunk
    const projectJson = JSON.stringify(projectData);
    const chunks = chunkJsonData(projectJson, 50000);
    
    // Find and update row — must match getProject's multi-column ID search (not only column A/B).
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(PM_PROJECTS_SHEET);
    const data = sheet.getDataRange().getValues();
    const headers = (data[0] || []).map(function(h) { return String(h || '').trim(); });
    const hasCompanyId = String(headers[0] || '').toLowerCase() === 'company id';
    const idCandidates = getPmProjectIdColumnCandidates_(headers);
    const jsonCols = resolvePmJsonChunkColumns_(headers, hasCompanyId);
    const json1Col = jsonCols.json1Col;
    const json2Col = jsonCols.json2Col;
    const json3Col = jsonCols.json3Col;
    let statusCol = findPmSheetColumnIndex_(headers, ['Status', 'Project Status', 'PM Status']);
    if (statusCol === -1) statusCol = hasCompanyId ? 6 : json1Col + 3;
    let totalCol = findPmSheetColumnIndex_(headers, ['Total Value', 'Total', 'Contract Total']);
    if (totalCol === -1) totalCol = hasCompanyId ? 7 : json1Col + 4;

    const targetPid = String(projectId || '').trim();
    for (let i = 1; i < data.length; i++) {
      if (!pmRowMatchesProjectId_(data[i], targetPid, idCandidates)) continue;

      // Sheet.getRange(row, col, numRows, numCols); third param is row count, not end row.
      sheet.getRange(i + 1, json1Col + 1, 1, 3).setValues([[chunks[0] || '', chunks[1] || '', chunks[2] || '']]);
      // Status column: prefer explicit updates.status (setProjectStopOrder passes full project; spread can miss edge cases).
      var statusVal = null;
      if (updates != null && Object.prototype.hasOwnProperty.call(updates, 'status') && updates.status !== undefined && updates.status !== null) {
        statusVal = String(updates.status);
      } else if (projectData.status !== undefined && projectData.status !== null) {
        statusVal = String(projectData.status);
      }
      if (statusVal !== null && statusVal !== '') {
        sheet.getRange(i + 1, statusCol + 1).setValue(statusVal);
        // Backup if header detection pointed at wrong index but sheet is standard 9-col (A–I): Status is column G.
        if (!hasCompanyId && headers.length >= 7 && statusCol !== 6) {
          var h7 = String(headers[6] || '').trim().toLowerCase();
          if (h7 === 'status') {
            sheet.getRange(i + 1, 7).setValue(statusVal);
          }
        }
        SpreadsheetApp.flush();
      }
      const totalVal = projectData.totalValue != null && projectData.totalValue !== ''
        ? projectData.totalValue
        : (projectData.total != null && projectData.total !== '' ? projectData.total : null);
      if (totalVal !== undefined && totalVal !== null && totalVal !== '') {
        sheet.getRange(i + 1, totalCol + 1).setValue(parseFloat(totalVal));
      }

      Logger.log('✅ Project updated: ' + projectId + ' (row ' + (i + 1) + '), status col ' + (statusCol + 1) + ' = ' + String(projectData.status || ''));
      return { success: true };
    }

    return { success: false, error: 'Project not found in sheet' };
    
  } catch (error) {
    Logger.log('❌ Error updating project: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Get all projects from PM_Projects sheet.
 * Supports both layouts: with Company ID (col 0) or without (Project ID in col 0).
 * @returns {object} - List of all projects
 */
function getAllProjects() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(PM_PROJECTS_SHEET);
    
    if (!sheet) {
      Logger.log('PM_Projects sheet not found');
      return { success: true, projects: [] };
    }
    
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) {
      return { success: true, projects: [] };
    }
    
    // Detect layout: Company ID row, or Project ID + optional Invoice ID + Email + JSON D–F + Status G…
    const headers = data[0] || [];
    const headersNorm = (data[0] || []).map(function(h) { return String(h || '').trim(); });
    const hasCompanyId = (headers[0] && String(headers[0]).trim() === 'Company ID');
    const idCol = hasCompanyId ? 1 : 0;
    const jsonCols = resolvePmJsonChunkColumns_(headersNorm, hasCompanyId);
    const json1Col = jsonCols.json1Col;
    const json2Col = jsonCols.json2Col;
    const json3Col = jsonCols.json3Col;
    let emailCol = findPmSheetColumnIndex_(headersNorm, ['Customer Email', 'Email']);
    if (emailCol === -1) {
      if (hasCompanyId) emailCol = 2;
      else if (json1Col > 0) emailCol = json1Col - 1;
      else emailCol = 1;
    }
    let statusCol = findPmSheetColumnIndex_(headersNorm, ['Status', 'Project Status', 'PM Status']);
    if (statusCol === -1) statusCol = hasCompanyId ? 6 : json1Col + 3;
    let totalCol = findPmSheetColumnIndex_(headersNorm, ['Total Value', 'Total', 'Contract Total']);
    if (totalCol === -1) totalCol = hasCompanyId ? 7 : json1Col + 4;
    let marginCol = findPmSheetColumnIndex_(headersNorm, ['Profit Margin', 'Margin', 'PM Margin', 'Profit Margin %']);
    if (marginCol === -1) marginCol = hasCompanyId ? 8 : json1Col + 5;
    
    // Build payment totals once (fast) instead of per-project breakdown calls.
    const paymentTotalsById = {};
    try {
      const paymentHistorySheetName = (typeof PAYMENT_HISTORY_SHEET !== 'undefined' && PAYMENT_HISTORY_SHEET)
        ? PAYMENT_HISTORY_SHEET
        : 'Payment History';
      const paymentSheet = spreadsheet.getSheetByName(paymentHistorySheetName);
      if (paymentSheet && paymentSheet.getLastRow() > 1) {
        const payRows = paymentSheet.getRange(2, 1, paymentSheet.getLastRow() - 1, Math.max(11, paymentSheet.getLastColumn())).getValues();
        for (let p = 0; p < payRows.length; p++) {
          const r = payRows[p];
          const invoiceKey = String(r[1] || '').trim(); // Column B: Invoice ID / linked key
          const amount = parseFloat(r[3] || 0) || 0;    // Column D: Amount
          const statusTxt = String(r[6] || '').toLowerCase(); // Column G: Status
          if (!invoiceKey || amount <= 0) continue;
          if (
            statusTxt.indexOf('failed') !== -1 ||
            statusTxt.indexOf('void') !== -1 ||
            statusTxt.indexOf('refund') !== -1 ||
            statusTxt.indexOf('canceled') !== -1 ||
            statusTxt.indexOf('cancelled') !== -1
          ) {
            continue;
          }
          paymentTotalsById[invoiceKey] = (paymentTotalsById[invoiceKey] || 0) + amount;
        }
      }
    } catch (payErr) {
      Logger.log('⚠️ getAllProjects payment aggregate failed: ' + payErr.toString());
    }

    const projects = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const projectId = row[idCol];
      if (!projectId || String(projectId).trim() === '') continue;
      let projectData = null;
      // Fast-path parse from expected columns
      try {
        const jsonStr = String(row[json1Col] || '') + String(row[json2Col] || '') + String(row[json3Col] || '');
        if (jsonStr && jsonStr.trim()) {
          projectData = JSON.parse(jsonStr);
        }
      } catch (e) {
        Logger.log('⚠️ Error parsing project JSON for row ' + (i + 1) + ' (' + projectId + '): ' + e.toString());
      }

      // Robust fallback: reuse getProject(), which now handles mixed column layouts.
      if (!projectData) {
        try {
          const proj = getProject(String(projectId).trim());
          if (proj && proj.success) {
            projectData = proj.project || null;
          }
        } catch (e2) {
          Logger.log('⚠️ getAllProjects fallback getProject failed for ' + projectId + ': ' + e2.toString());
        }
      }
      if (!projectData) continue;

      const resolvedLinkedId = String(projectData.estimateId || projectData.invoiceId || projectData.linkedEstimateId || '').trim();
      const totalValue = parseFloat(row[totalCol] || projectData.totalValue || projectData.total || 0) || 0;

      const paymentKeys = Array.from(new Set([
        String(projectId || '').trim(),
        String(projectData.estimateId || '').trim(),
        String(projectData.invoiceId || '').trim(),
        String(projectData.linkedEstimateId || '').trim(),
        resolvedLinkedId
      ].filter(function(v) { return !!v; })));

      const hasHistoryMatch = paymentKeys.some(function(key) {
        return Object.prototype.hasOwnProperty.call(paymentTotalsById, key);
      });
      const paidFromHistory = paymentKeys.reduce(function(sum, key) {
        return sum + (parseFloat(paymentTotalsById[key] || 0) || 0);
      }, 0);

      const fallbackPaid = parseFloat(projectData.totalPaid || 0) || 0;
      let computedPaid = hasHistoryMatch ? Math.max(0, paidFromHistory) : fallbackPaid;

      const explicitBalanceCandidates = [
        projectData.balanceDue,
        projectData.remainingBalance,
        projectData.balance,
        projectData.totalOwed,
        projectData.balanceRemaining
      ];
      const explicitBalance = explicitBalanceCandidates
        .map(function(v) { return parseFloat(v); })
        .find(function(v) { return !isNaN(v) && isFinite(v) && v >= 0; });

      let computedBalance;
      if (hasHistoryMatch) {
        computedBalance = Math.max(0, totalValue - computedPaid);
      } else if (explicitBalance != null) {
        computedBalance = Math.max(0, explicitBalance);
        computedPaid = Math.max(0, totalValue - computedBalance);
      } else {
        computedBalance = Math.max(0, totalValue - computedPaid);
      }

      // Keep payload fields synchronized for UI consumers.
      projectData.totalPaid = computedPaid;
      projectData.balanceDue = computedBalance;
      projectData.remainingBalance = computedBalance;
      projectData.balance = computedBalance;

      projects.push({
        projectId: projectId,
        customerEmail: row[emailCol] || projectData.customerEmail || '',
        status: row[statusCol] || projectData.status || 'Active',
        totalValue: totalValue,
        totalPaid: computedPaid,
        balanceDue: computedBalance,
        remainingBalance: computedBalance,
        balance: computedBalance,
        profitMargin: parseFloat(row[marginCol] || projectData.profitMargin || 0),
        projectData: projectData
      });
    }
    
    Logger.log('✅ getAllProjects found ' + projects.length + ' projects');
    return { success: true, projects: projects };
    
  } catch (error) {
    Logger.log('❌ Error getting all projects: ' + error.toString());
    return { success: false, error: error.toString(), projects: [] };
  }
}

// ============================================================================
// MILESTONE INVOICE GENERATION & STRIPE INTEGRATION
// ============================================================================

/**
 * Same rules as generateMilestoneInvoice / createStripePaymentLink — defaults processing fee ON.
 * Used so milestone customer emails match Stripe checkout.
 */
function pmResolveApplyProcessingFeeForStripe_(projectData) {
  var applyProcessingFee = !!(projectData && projectData.addProcessingFee);
  if (!applyProcessingFee && projectData && Array.isArray(projectData.items)) {
    applyProcessingFee = projectData.items.some(function(item) {
      var name = String(item.name || item.description || '').toLowerCase();
      return item.isProcessingFee === true || name.indexOf('processing fee') !== -1;
    });
  }
  if (!applyProcessingFee && projectData && projectData.processingFee != null && parseFloat(projectData.processingFee || 0) > 0) {
    applyProcessingFee = true;
  }
  if (!applyProcessingFee && projectData) {
    try {
      var linkedId = projectData.estimateId || projectData.invoiceId || projectData.linkedEstimateId || '';
      if (linkedId && typeof getInvoiceEstimate === 'function') {
        var linkedDoc = getInvoiceEstimate(linkedId);
        if (linkedDoc && linkedDoc.success && linkedDoc.data) {
          var linkedData = linkedDoc.data;
          if (linkedData.addProcessingFee === true) applyProcessingFee = true;
          if (!applyProcessingFee && linkedData.processingFee != null && parseFloat(linkedData.processingFee || 0) > 0) {
            applyProcessingFee = true;
          }
        }
      }
    } catch (feeLookupErr) {
      Logger.log('⚠️ pmResolveApplyProcessingFeeForStripe_: ' + feeLookupErr.toString());
    }
  }
  if (!applyProcessingFee) {
    applyProcessingFee = true;
    Logger.log('ℹ️ pmResolveApplyProcessingFeeForStripe_: defaulting processing fee ON for milestone Stripe alignment');
  }
  return applyProcessingFee;
}

/**
 * Generate milestone invoice with Stripe payment link
 * @param {string} projectId - The project ID
 * @param {string} milestoneId - The milestone ID from payment schedule
 * @returns {object} - Invoice data with Stripe payment link
 */
function generateMilestoneInvoice(projectId, milestoneId, forceAddProcessingFee) {
  try {
    const project = getProject(projectId);
    if (!project.success) {
      return { success: false, error: 'Project not found' };
    }
    
    const projectData = project.project;

    // Normalize payment schedule (can be array, JSON string, or object)
    let paymentSchedule = projectData.paymentSchedule || [];
    if (typeof paymentSchedule === 'string') {
      try { paymentSchedule = JSON.parse(paymentSchedule || '[]'); } catch (e) { paymentSchedule = []; }
    }
    if (!Array.isArray(paymentSchedule) && paymentSchedule && typeof paymentSchedule === 'object') {
      paymentSchedule = Object.values(paymentSchedule);
    }
    if (!Array.isArray(paymentSchedule)) paymentSchedule = [];
    if (!projectData.milestoneStatus || typeof projectData.milestoneStatus !== 'object') {
      projectData.milestoneStatus = {};
    }
    
    // Find milestone in payment schedule
    const milestone = paymentSchedule.find(function(m) {
      return String(m && m.id || '').trim() === String(milestoneId || '').trim();
    });
    if (!milestone) {
      return { success: false, error: 'Milestone not found' };
    }
    
    // Check if already invoiced
    if (projectData.milestoneStatus[milestoneId] && projectData.milestoneStatus[milestoneId].invoiced) {
      return { success: false, error: 'Milestone already invoiced' };
    }
    
    // Generate invoice ID
    const invoiceId = 'INV-' + projectId + '-' + milestoneId + '-' + new Date().getTime();
    
    // Determine processing fee: respect explicit user choice, otherwise use project default
    let applyProcessingFee;
    if (forceAddProcessingFee === true) {
      applyProcessingFee = true;
    } else if (forceAddProcessingFee === false) {
      applyProcessingFee = false;  // User explicitly said NO
    } else {
      applyProcessingFee = pmResolveApplyProcessingFeeForStripe_(projectData);  // Use project default
    }

    // Create Stripe payment link
    const stripeLink = createStripePaymentLink(
      projectData.customerEmail,
      projectData.customerName,
      milestone.name,
      milestone.amount,
      invoiceId,
      projectId,
      projectData.customerAddress || '', // Pass customer address if available
      {
        addProcessingFee: applyProcessingFee
      }
    );
    
    if (!stripeLink.success || !stripeLink.paymentUrl) {
      return {
        success: false,
        error: 'Failed to create Stripe payment link: ' + ((stripeLink && stripeLink.error) ? stripeLink.error : 'Unknown Stripe error')
      };
    }
    
    // Save invoice to PM_Project_Invoices sheet with processing fee flag
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let invoicesSheet = spreadsheet.getSheetByName(PM_PROJECT_INVOICES_SHEET);
    
    if (!invoicesSheet) {
      setupPMProjectInvoicesSheet(spreadsheet);
      invoicesSheet = spreadsheet.getSheetByName(PM_PROJECT_INVOICES_SHEET);
    }
    
    invoicesSheet.appendRow([
      invoiceId,
      projectId,
      milestone.name,
      milestone.amount,
      'Pending',
      stripeLink.paymentUrl,
      new Date(),
      applyProcessingFee  // Store the processing fee flag for later reference
    ]);
    
    // Update project milestone status
    if (!projectData.milestoneStatus) projectData.milestoneStatus = {};
    projectData.milestoneStatus[milestoneId] = {
      invoiced: true,
      paid: false,
      invoiceId: invoiceId,
      dateSent: new Date().toISOString(),
      stripePaymentUrl: stripeLink.paymentUrl,
      addProcessingFee: applyProcessingFee  // Store flag in project too

    };
    
    updateProject(projectId, { milestoneStatus: projectData.milestoneStatus });
    
    Logger.log('✅ Invoice created: ' + invoiceId);
    
    return {
      success: true,
      invoiceId: invoiceId,
      paymentUrl: stripeLink.paymentUrl,
      milestone: milestone
    };
    
  } catch (error) {
    Logger.log('❌ Error generating milestone invoice: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Create Stripe payment link
 * @param {string} customerEmail - Customer email
 * @param {string} customerName - Customer name
 * @param {string} description - Payment description (milestone name)
 * @param {number} amount - Amount in dollars
 * @param {string} invoiceId - Invoice ID for metadata
 * @param {string} projectId - Project ID for metadata
 * @param {string} customerAddress - Optional customer address
 * @returns {object} - Stripe payment link URL
 */
function createStripePaymentLink(customerEmail, customerName, description, amount, invoiceId, projectId, customerAddress) {
  try {
    if (!STRIPE_SECRET_KEY || !String(STRIPE_SECRET_KEY).trim()) {
      return { success: false, error: 'Stripe secret key is missing. Configure STRIPE_SECRET_KEY in script properties.' };
    }
    const optionsArg = (arguments.length >= 8 && arguments[7] && typeof arguments[7] === 'object') ? arguments[7] : {};
    const parseBooleanFlag = function(value, defaultValue) {
      if (value === undefined || value === null || value === '') return defaultValue;
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return value !== 0;
      var normalized = String(value).trim().toLowerCase();
      if (['true', '1', 'yes', 'y', 'on'].indexOf(normalized) !== -1) return true;
      if (['false', '0', 'no', 'n', 'off'].indexOf(normalized) !== -1) return false;
      return defaultValue;
    };
    const baseAmount = parseFloat(amount || 0);
    const addProcessingFee = parseBooleanFlag(optionsArg.addProcessingFee, false);
    const processingFee = addProcessingFee
      ? Math.round(((baseAmount * 0.029) + 0.29) * 100) / 100
      : 0;
    const totalChargeAmount = baseAmount + processingFee;

    // Create or get Stripe customer (with address if available)
    const customer = createOrGetStripeCustomer(customerEmail, customerName, customerAddress);
    if (!customer.success) {
      return {
        success: false,
        error: 'Failed to create Stripe customer' + (customer.error ? ': ' + customer.error : '')
      };
    }
    
    // Parse address if available
    let addressData = null;
    if (customerAddress && customerAddress.trim()) {
      // Try to parse address (format: "Street, City, State ZIP" or similar)
      const addressParts = customerAddress.split(',').map(s => s.trim());
      if (addressParts.length >= 2) {
        const zipStateMatch = addressParts[addressParts.length - 1].match(/([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/i);
        if (zipStateMatch) {
          addressData = {
            line1: addressParts[0] || '',
            city: addressParts.length > 2 ? addressParts[addressParts.length - 2] : '',
            state: zipStateMatch[1].toUpperCase(),
            postal_code: zipStateMatch[2],
            country: 'US'
          };
        }
      }
    }
    
    // Create payment link (one-time payment)
    // When automatic_tax is enabled with a customer, the customer must have a valid address
    // If no address, we'll use customer_email instead and collect address during checkout
    const payload = {
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][product_data][name]': description + ' (Base Amount)',
      'line_items[0][price_data][product_data][description]': 'Milestone base amount before processing fee',
      'line_items[0][price_data][unit_amount]': Math.round(baseAmount * 100), // Convert to cents
      'line_items[0][quantity]': 1,
      'mode': 'payment',
      'success_url': 'https://www.aqualitypoolcompanyusa.com/payment-success?invoice_id=' + invoiceId,
      'cancel_url': 'https://www.aqualitypoolcompanyusa.com/payment-cancelled',
      'metadata[invoice_id]': invoiceId,
      'metadata[project_id]': projectId,
      'metadata[milestone_name]': description,
      'metadata[base_amount]': String(baseAmount.toFixed(2)),
      'metadata[processing_fee]': String(processingFee.toFixed(2)),
      'metadata[total_charge_amount]': String(totalChargeAmount.toFixed(2)),
      'metadata[add_processing_fee]': addProcessingFee ? 'true' : 'false',
      'automatic_tax[enabled]': 'true',
      'billing_address_collection': 'required' // Always collect billing address for tax calculation
    };

    if (addProcessingFee && processingFee > 0) {
      payload['line_items[1][price_data][currency]'] = 'usd';
      payload['line_items[1][price_data][product_data][name]'] = 'Processing Fee';
      payload['line_items[1][price_data][product_data][description]'] = 'Credit card processing fee (2.9% + $0.29)';
      payload['line_items[1][price_data][unit_amount]'] = Math.round(processingFee * 100);
      payload['line_items[1][quantity]'] = 1;
      payload['custom_text[submit][message]'] = 'Checkout total includes base amount + processing fee.';
    }
    
    // If we have a valid address, use customer ID (Stripe will use customer's address)
    // Otherwise, use customer_email and let Stripe collect address during checkout
    if (addressData && customer.customerId) {
      // Update customer with address first
      try {
        const updatePayload = Object.keys(addressData).map(key => 
          encodeURIComponent('address[' + key + ']') + '=' + encodeURIComponent(addressData[key])
        ).join('&');
        
        const updateOptions = {
          method: 'post',
          headers: {
            'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          payload: updatePayload
        };
        
        UrlFetchApp.fetch(STRIPE_API_URL + '/customers/' + customer.customerId, updateOptions);
        payload['customer'] = customer.customerId;
        Logger.log('✅ Updated Stripe customer with address');
      } catch (e) {
        Logger.log('⚠️ Could not update customer address, using customer_email instead: ' + e.toString());
        payload['customer_email'] = customerEmail;
      }
    } else {
      // Use customer_email instead of customer ID - Stripe will collect address during checkout
      payload['customer_email'] = customerEmail;
      Logger.log('ℹ️ Using customer_email (no address available) - Stripe will collect address during checkout');
    }
    
    const options = {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      payload: Object.keys(payload).map(key => 
        encodeURIComponent(key) + '=' + encodeURIComponent(payload[key])
      ).join('&'),
      muteHttpExceptions: true // Get full error response
    };
    
    const response = UrlFetchApp.fetch(STRIPE_API_URL + '/checkout/sessions', options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode !== 200) {
      Logger.log('❌ Stripe Checkout Session API Error: ' + responseCode);
      Logger.log('Response: ' + responseText);
      
      let errorMessage = 'Failed to create Stripe payment link: ' + responseCode;
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.error?.message || errorData.message || errorMessage;
        Logger.log('Stripe Error Message: ' + errorMessage);
        Logger.log('Stripe Error Type: ' + (errorData.error?.type || 'Unknown'));
        Logger.log('Stripe Error Code: ' + (errorData.error?.code || 'Unknown'));
      } catch (e) {
        Logger.log('Could not parse error response: ' + e.toString());
      }
      
      return { success: false, error: errorMessage };
    }
    
    const session = JSON.parse(responseText);
    
    if (!session.url) {
      Logger.log('❌ Stripe session created but no URL returned');
      Logger.log('Session data: ' + JSON.stringify(session));
      return { success: false, error: 'Stripe session created but no payment URL returned' };
    }
    
    Logger.log('✅ Stripe payment link created for invoice: ' + invoiceId);
    
    return {
      success: true,
      paymentUrl: session.url,
      sessionId: session.id,
      baseAmount: baseAmount,
      processingFee: processingFee,
      totalAmount: totalChargeAmount
    };
    
  } catch (error) {
    Logger.log('❌ Error creating Stripe payment link: ' + error.toString());
    Logger.log('Error stack: ' + (error.stack || 'No stack trace'));
    return { success: false, error: error.toString() };
  }
}

/**
 * Create or get Stripe customer
 * @param {string} email - Customer email
 * @param {string} name - Customer name
 * @param {string} address - Optional customer address
 * @returns {object} - Stripe customer ID
 */
function createOrGetStripeCustomer(email, name, address) {
  try {
    // Search for existing customer
    const searchOptions = {
      method: 'get',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY
      },
      muteHttpExceptions: true
    };
    
    const searchResponse = UrlFetchApp.fetch(
      STRIPE_API_URL + '/customers?email=' + encodeURIComponent(email) + '&limit=1',
      searchOptions
    );
    const searchCode = searchResponse.getResponseCode();
    const searchText = searchResponse.getContentText();
    if (searchCode < 200 || searchCode >= 300) {
      let searchMsg = 'Stripe customer search failed (HTTP ' + searchCode + ')';
      try {
        const searchErrData = JSON.parse(searchText || '{}');
        searchMsg = (searchErrData.error && searchErrData.error.message)
          ? searchErrData.error.message
          : searchMsg;
      } catch (_) {}
      return { success: false, error: searchMsg };
    }
    const searchData = JSON.parse(searchText || '{}');
    
    if (searchData.data && searchData.data.length > 0) {
      return { success: true, customerId: searchData.data[0].id };
    }
    
    // Create new customer
    const createPayload = {
      'email': email,
      'name': name
    };
    
    const createOptions = {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      payload: Object.keys(createPayload).map(key => 
        encodeURIComponent(key) + '=' + encodeURIComponent(createPayload[key])
      ).join('&'),
      muteHttpExceptions: true
    };
    
    const createResponse = UrlFetchApp.fetch(STRIPE_API_URL + '/customers', createOptions);
    const createCode = createResponse.getResponseCode();
    const createText = createResponse.getContentText();
    if (createCode < 200 || createCode >= 300) {
      let createMsg = 'Stripe customer creation failed (HTTP ' + createCode + ')';
      try {
        const createErrData = JSON.parse(createText || '{}');
        createMsg = (createErrData.error && createErrData.error.message)
          ? createErrData.error.message
          : createMsg;
      } catch (_) {}
      return { success: false, error: createMsg };
    }

    const customer = JSON.parse(createText || '{}');
    
    Logger.log('✅ Stripe customer created: ' + customer.id);
    
    return { success: true, customerId: customer.id };
    
  } catch (error) {
    Logger.log('❌ Error with Stripe customer: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Handle Stripe webhook for payment confirmations
 * This should be called from doPost() in main script
 * @param {object} event - Webhook event data
 * @returns {object} - Processing result
 */
function handleStripeWebhook(event) {
  try {
    Logger.log('📥 Stripe webhook received: ' + event.type);
    
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const invoiceId = session.metadata.invoice_id;
      const projectId = session.metadata.project_id;
      
      if (!invoiceId || !projectId) {
        Logger.log('⚠️ Webhook missing metadata');
        return { success: false, error: 'Missing metadata' };
      }
      
      // Update invoice status to Paid
      const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
      const invoicesSheet = spreadsheet.getSheetByName(PM_PROJECT_INVOICES_SHEET);
      
      if (invoicesSheet) {
        const data = invoicesSheet.getDataRange().getValues();
        for (let i = 1; i < data.length; i++) {
          if (data[i][0] === invoiceId) {
            invoicesSheet.getRange(i + 1, 5).setValue('Paid');
            invoicesSheet.getRange(i + 1, 8).setValue(new Date());
            break;
          }
        }
      }
      
      // Update project milestone status
      const project = getProject(projectId);
      if (project.success) {
        const projectData = project.project;
        
        // Find which milestone this invoice was for
        for (const milestoneId in projectData.milestoneStatus) {
          if (projectData.milestoneStatus[milestoneId].invoiceId === invoiceId) {
            projectData.milestoneStatus[milestoneId].paid = true;
            projectData.milestoneStatus[milestoneId].datePaid = new Date().toISOString();
            break;
          }
        }
        
        updateProject(projectId, { milestoneStatus: projectData.milestoneStatus });
      }
      
      // Send payment confirmation email
      sendPaymentConfirmationEmail(invoiceId, projectId);
      
      Logger.log('✅ Payment processed for invoice: ' + invoiceId);
      
      return { success: true };
    }
    
    return { success: true, message: 'Event type not handled' };
    
  } catch (error) {
    Logger.log('❌ Error handling Stripe webhook: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Send payment confirmation email
 * @param {string} invoiceId - The invoice ID
 * @param {string} projectId - The project ID
 */
function sendPaymentConfirmationEmail(invoiceId, projectId) {
  try {
    const project = getProject(projectId);
    if (!project.success) return;
    
    const projectData = project.project;
    
    // Get invoice details
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const invoicesSheet = spreadsheet.getSheetByName(PM_PROJECT_INVOICES_SHEET);
    const data = invoicesSheet.getDataRange().getValues();
    
    let milestoneName = '';
    let amount = 0;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === invoiceId) {
        milestoneName = data[i][2];
        amount = data[i][3];
        break;
      }
    }
    
    const subject = '✅ Payment Received - ' + milestoneName;
    
    const htmlBody = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">' +
      '<div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center;"><h1 style="color: white; margin: 0;">Payment Received!</h1></div>' +
      '<div style="padding: 30px; background: #f9fafb;">' +
        '<p>Dear ' + projectData.customerName + ',</p>' +
        '<p>Thank you! We\'ve received your payment.</p>' +
        '<div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">' +
          '<h2 style="color: #10b981; margin-top: 0;">Payment Details</h2>' +
          '<p><strong>Project:</strong> ' + projectId + '</p>' +
          '<p><strong>Milestone:</strong> ' + milestoneName + '</p>' +
          '<p><strong>Amount:</strong> $' + parseFloat(amount).toFixed(2) + '</p>' +
          '<p><strong>Date:</strong> ' + new Date().toLocaleDateString() + '</p>' +
        '</div>' +
        '<p>Your project is progressing smoothly.</p>' +
        '<p>Best regards,<br>' + COMPANY_NAME + '<br>' + COMPANY_PHONE + '</p>' +
      '</div></div>';
    
    MailApp.sendEmail({
      to: projectData.customerEmail,
      subject: subject,
      htmlBody: htmlBody
    });
    
    // Notify company
    MailApp.sendEmail({
      to: COMPANY_EMAIL,
      subject: '💰 Payment Received: ' + projectData.customerName,
      htmlBody: '<p>Payment received for ' + projectData.customerName + '</p>' +
        '<p><strong>Milestone:</strong> ' + milestoneName + '</p>' +
        '<p><strong>Amount:</strong> $' + parseFloat(amount).toFixed(2) + '</p>' +
        '<p><strong>Project ID:</strong> ' + projectId + '</p>'
    });
    
    Logger.log('✅ Payment confirmation emails sent');
    
  } catch (error) {
    Logger.log('⚠️ Error sending payment confirmation: ' + error.toString());
  }
}

// ============================================================================
// INVOICE EMAIL SENDING
// ============================================================================

/**
 * Send milestone invoice email to customer
 * @param {string} projectId - The project ID
 * @param {string} milestoneId - The milestone ID
 * @param {string} invoiceId - The invoice ID
 * @param {boolean} addProcessingFee - Whether to include processing fee (optional, defaults to project/invoice setting)
 * @returns {object} - Send result
 */
function sendMilestoneInvoiceEmail(projectId, milestoneId, invoiceId, addProcessingFee) {
  try {
    const project = getProject(projectId);
    if (!project.success) {
      return { success: false, error: 'Project not found' };
    }
    
    const projectData = project.project;
    
    // Get payment schedule and determine milestone type
    const paymentSchedule = Array.isArray(projectData.paymentSchedule) ? projectData.paymentSchedule : [];
    const milestoneStatusMap = projectData.milestoneStatus || {};
    const linkedId = projectData.estimateId || projectData.invoiceId || '';
    let statusFromHistory = {};
    let totalPaidAcrossProject = 0;
    try {
      if (typeof getMilestoneStatusFromHistory === 'function') {
        const hist = getMilestoneStatusFromHistory(projectId, linkedId);
        if (hist && hist.success) {
          statusFromHistory = hist.milestones || {};
          totalPaidAcrossProject = parseFloat(hist.totalPaid || 0);
        }
      }
    } catch (historyError) {
      Logger.log('⚠️ sendMilestoneInvoiceEmail history lookup failed: ' + historyError.toString());
    }
    const normMilestoneId = String(milestoneId == null ? '' : milestoneId).trim();
    const isSameMilestoneId = function(value) {
      return String(value == null ? '' : value).trim() === normMilestoneId;
    };

    const milestoneIndex = paymentSchedule.findIndex(m => isSameMilestoneId(m && m.id));
    const milestoneName = paymentSchedule[milestoneIndex]?.name || 'Milestone Payment';
    
    // For count purposes, only include regular (non-one-off) milestones
    const regularMilestones = paymentSchedule.filter(m => m.type !== 'one-off');
    const regularMilestoneIndex = regularMilestones.findIndex(m => isSameMilestoneId(m && m.id));
    const isFirstPayment = regularMilestoneIndex === 0;
    const isFinalPayment = regularMilestoneIndex === regularMilestones.length - 1;
    
    // Determine milestone type for personalized message
    const milestoneNameLower = milestoneName.toLowerCase();
    const isDeposit = milestoneNameLower.includes('deposit') || milestoneNameLower.includes('down payment') || isFirstPayment;
    const isProgress = !isDeposit && !isFinalPayment;
    
    // Get invoice details
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const invoicesSheet = spreadsheet.getSheetByName(PM_PROJECT_INVOICES_SHEET);
    const data = invoicesSheet.getDataRange().getValues();
    
    let amount = 0;
    let stripeLink = '';
    let invoiceRowAddProcessingFee = null;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === invoiceId) {
        amount = data[i][3];
        stripeLink = data[i][5];
        if (data[i].length >= 8) {
          const rawFlag = data[i][7];
          if (rawFlag === true || String(rawFlag).toLowerCase() === 'true') invoiceRowAddProcessingFee = true;
          if (rawFlag === false || String(rawFlag).toLowerCase() === 'false') invoiceRowAddProcessingFee = false;
        }
        break;
      }
    }
    
    if (!stripeLink) {
      return { success: false, error: 'Invoice not found' };
    }
    
    // Get user settings for email template
    const userSettings = getUserSettings('admin');
    
    // Extract first name from customer name
    let firstName = 'Valued Customer';
    if (projectData.customerName && typeof projectData.customerName === 'string') {
      const name = projectData.customerName.trim();
      if (name.indexOf(' ') > 0) {
        firstName = name.substring(0, name.indexOf(' '));
      } else {
        firstName = name;
      }
    }
    
    // Determine next unpaid regular milestone (exclude one-off items) for context in the email
    const nextUnpaidMilestone = regularMilestones.find(m => {
      const key = String(m.id || '');
      const fromHistory = statusFromHistory[key];
      const fromProject = milestoneStatusMap[key];
      return !((fromHistory && fromHistory.paid === true) || (fromProject && fromProject.paid === true));
    }) || null;
    // Use only regular milestones for the "payment X of Y" count (exclude one-off items)
    const totalMilestones = regularMilestones.length;
    const currentPaymentNumber = regularMilestoneIndex >= 0 ? (regularMilestoneIndex + 1) : 1;
    const remainingAfterCurrent = Math.max(0, totalMilestones - currentPaymentNumber);

    let progressCatchphrase = '';
    if (totalMilestones > 1) {
      if (currentPaymentNumber === 1) {
        progressCatchphrase = 'You are on payment 1 of ' + totalMilestones + ' - great start!';
      } else if (remainingAfterCurrent === 0) {
        progressCatchphrase = 'You made it - this is payment ' + currentPaymentNumber + ' of ' + totalMilestones + '.';
      } else if (remainingAfterCurrent === 1) {
        progressCatchphrase = 'You are almost there - payment ' + currentPaymentNumber + ' of ' + totalMilestones + '.';
      } else {
        progressCatchphrase = 'Progress update: payment ' + currentPaymentNumber + ' of ' + totalMilestones + '.';
      }
    } else {
      progressCatchphrase = 'This is your project payment request.';
    }
    const progressLine = progressCatchphrase ? (progressCatchphrase + '\n\n') : '';

    // Create personalized message based on milestone type
    let customMessage;
    if (isDeposit) {
      customMessage = progressLine +
        'We are so excited to start your project! This is an amazing journey we\'re about to embark on together, and we can\'t wait to bring your vision to life.\n\n' +
        'To get started, we require a deposit of $' + parseFloat(amount).toFixed(2) + ' for ' + milestoneName + '. This deposit secures your spot on our schedule and allows us to begin ordering materials and planning the work ahead.\n\n' +
        'Once we receive your deposit, we\'ll be in touch to schedule our first project meeting and discuss the timeline in detail. We\'re committed to making this process smooth and transparent every step of the way.\n\n' +
        'Thank you for choosing ' + COMPANY_NAME + ' - we\'re honored to be working with you!';
    } else if (isFinalPayment) {
      customMessage = progressLine +
        'Congratulations! Your project is complete, and we hope you\'re absolutely thrilled with the results. It\'s been a pleasure working with you throughout this process.\n\n' +
        'This final payment of $' + parseFloat(amount).toFixed(2) + ' completes your payment schedule. We want to thank you for your trust and partnership throughout this project.\n\n' +
        'If you\'re happy with our work, we\'d be incredibly grateful if you could take a moment to leave us a review. Your feedback helps us improve and helps neighbors in our community find reliable service.\n\n' +
        'Thank you again for choosing ' + COMPANY_NAME + '!';
    } else {
      customMessage = progressLine +
        'Great news! Your project is progressing beautifully, and we\'re excited to share the progress with you.\n\n' +
        'The payment link below is for $' + parseFloat(amount).toFixed(2) + ' for this milestone only: ' + milestoneName + '. Add-on charges are billed separately.\n\n' +
        'A summary of your payment schedule is included below for context.\n\n' +
        (nextUnpaidMilestone ? ('After this payment, the next milestone is: ' + (nextUnpaidMilestone.name || 'Next milestone') + '.\n\n') : '') +
        'If you have any questions about the work being done or need clarification on anything, don\'t hesitate to reach out. We\'re here to ensure you\'re completely satisfied every step of the way.\n\n' +
        'Thank you for your continued partnership!';
    }
    
    // Email must show ONLY this milestone amount (not full project line items or one-offs). Match Stripe: fee on milestone base.
    var milestoneBase = parseFloat(amount);
    if (!(milestoneBase > 0) && milestoneIndex >= 0 && paymentSchedule[milestoneIndex]) {
      milestoneBase = parseFloat(paymentSchedule[milestoneIndex].amount || paymentSchedule[milestoneIndex].total || 0);
    }
    // Respect explicit addProcessingFee if provided.
    // Else use milestone status flag, then invoice-row flag, then project default.
    var applyProc;
    if (addProcessingFee === true) {
      applyProc = true;
    } else if (addProcessingFee === false) {
      applyProc = false;
    } else if (milestoneStatusMap[milestoneId] && typeof milestoneStatusMap[milestoneId].addProcessingFee === 'boolean') {
      applyProc = milestoneStatusMap[milestoneId].addProcessingFee;
    } else if (typeof invoiceRowAddProcessingFee === 'boolean') {
      applyProc = invoiceRowAddProcessingFee;
    } else {
      applyProc = pmResolveApplyProcessingFeeForStripe_(projectData);
    }
    var procFee = applyProc ? Math.round((milestoneBase * 0.029 + 0.29) * 100) / 100 : 0;
    var emailTotalWithFee = milestoneBase + procFee;
    var linkedProjectDocId = String(
      projectData.invoiceId ||
      projectData.estimateId ||
      projectData.linkedEstimateId ||
      projectData.linkedInvoiceId ||
      ''
    ).trim();
    
    // For milestone invoices, ALWAYS use the invoice viewer with the milestone invoice ID
    // Do not link back to the original estimate - that won't have the payment button
    var projectDocShareLink =
      'https://www.aqualitypoolcompanyusa.com/invoice-viewer?id=' + encodeURIComponent(invoiceId) +
      '&projectId=' + encodeURIComponent(String(projectId || '').trim()) +
      (linkedProjectDocId ? ('&linkedId=' + encodeURIComponent(linkedProjectDocId)) : '');
    
    const invoiceData = {
      type: 'Invoice',
      customerName: projectData.customerName,
      customerEmail: projectData.customerEmail,
      customerPhone: projectData.customerPhone || '',
      customerAddress: projectData.customerAddress || '',
      invoiceNumber: invoiceId,
      quoteNumber: invoiceId,
      date: new Date().toLocaleDateString(),
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString(), // 14 days from now
      items: JSON.stringify([{
        name: milestoneName,
        description: 'Milestone payment only — not add-ons. Project: ' + projectId,
        quantity: 1,
        price: milestoneBase,
        total: milestoneBase
      }]),
      subtotal: milestoneBase,
      taxRate: 0,
      tax: 0,
      discount: 0,
      total: emailTotalWithFee,
      addProcessingFee: applyProc,
      processingFee: procFee,
      paymentSchedule: JSON.stringify(regularMilestones),
      // Add milestone info to notes
      notes: 'Project: ' + projectId + '\n\nThis invoice is for: ' + milestoneName + ' ($' + parseFloat(amount).toFixed(2) + ')\n' +
        'Paid to date: $' + parseFloat(totalPaidAcrossProject || 0).toFixed(2) + '\n' +
        (nextUnpaidMilestone ? ('Next payment: ' + (nextUnpaidMilestone.name || 'N/A') + '\n') : 'Next payment: Complete\n') +
        '\nPayment Schedule:\n' + regularMilestones.map(function(m, idx) {
        var milestoneAmount = parseFloat(m.amount || m.total || 0);
        var key = String(m.id || '');
        var paidFromHistory = statusFromHistory[key] && statusFromHistory[key].paid === true;
        var paidFromProject = milestoneStatusMap[key] && milestoneStatusMap[key].paid === true;
        var isPaid = paidFromHistory || paidFromProject || m.status === 'Paid' || parseFloat(m.paid || 0) >= milestoneAmount - 0.01;
        var isCurrent = m.id === milestoneId;
        var statusIcon = isPaid ? '✅' : (isCurrent ? '👉' : '⏳');
        return statusIcon + ' ' + (m.name || 'Milestone ' + (idx + 1)) + ': $' + milestoneAmount.toFixed(2) + (isPaid ? ' (Paid)' : (isCurrent ? ' (Due Now)' : ''));
      }).join('\n'),
      paymentLink: stripeLink, // Payment link is still for the milestone amount only
      shareLink: projectDocShareLink,
      status: 'Pending',
      paymentStatus: 'Pending',
      id: invoiceId,
      includeReviewRequest: true,
      // Add milestone context
      currentMilestoneId: milestoneId,
      currentMilestoneName: milestoneName,
      currentMilestoneAmount: milestoneBase,
      isMilestoneInvoice: true,
      totalPaidAcrossProject: totalPaidAcrossProject,
      nextMilestoneName: nextUnpaidMilestone ? (nextUnpaidMilestone.name || '') : '',
      terms: projectData.terms || ''
    };
    
    // Send using the same enhanced email template
    const emailResult = sendEnhancedInvoiceEmail(
      invoiceData,
      userSettings,
      customMessage,
      [] // No attachments for milestone invoices
    );
    
    if (!emailResult || !emailResult.success) {
      Logger.log('❌ Enhanced email sending failed: ' + (emailResult ? emailResult.error : 'No result returned'));
      return { success: false, error: emailResult ? emailResult.error : 'Email sending failed' };
    }
    
    // Send copy to company
    MailApp.sendEmail({
      to: COMPANY_EMAIL,
      subject: '📧 Invoice Sent: ' + projectData.customerName + ' - ' + milestoneName,
      htmlBody: '<p>Invoice has been sent to ' + projectData.customerName + '</p>' +
        '<p><strong>Project:</strong> ' + projectId + '</p>' +
        '<p><strong>Milestone:</strong> ' + milestoneName + '</p>' +
        '<p><strong>Amount:</strong> $' + parseFloat(amount).toFixed(2) + '</p>' +
        '<p><a href="' + stripeLink + '">View Payment Link</a></p>'
    });

    // Send Brooks Telegram/email notification for milestone invoices too.
    try {
      if (typeof sendBrooksLinkNotification === 'function') {
        var invoiceViewLink = projectDocShareLink;
        var customerFirstName = String((projectData.customerName || 'there')).split(' ')[0];
        var brooksDraft = 'Hi ' + customerFirstName + '! Your milestone invoice (' + milestoneName + ') is ready. You can review and pay it here: ' + invoiceViewLink;

        var brooksRes = sendBrooksLinkNotification(
          invoiceViewLink,
          invoiceId,
          'Invoice',
          projectData.customerName || '',
          projectData.customerPhone || '',
          '',
          brooksDraft
        );
        Logger.log('Brooks notify from sendMilestoneInvoiceEmail: ' + JSON.stringify(brooksRes));
      }
    } catch (brooksErr) {
      Logger.log('⚠️ Brooks notify (sendMilestoneInvoiceEmail) failed: ' + brooksErr.toString());
    }
    
    Logger.log('✅ Milestone invoice email sent: ' + invoiceId);
    
    return { success: true };
    
  } catch (error) {
    Logger.log('❌ Error sending milestone invoice email: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Quick send invoice - generates and emails in one step
 * @param {string} projectId - The project ID
 * @param {string} milestoneId - The milestone ID
 * @returns {object} - Result
 */
function quickSendInvoice(projectId, milestoneId, addProcessingFee) {
  try {
    let resolvedProjectId = String(projectId || '').trim();
    let project = getProject(resolvedProjectId);

    // Fallback resolution for legacy callers that may pass estimate/invoice IDs
    // (or missing/incorrect project IDs) from project detail contexts.
    if ((!project || !project.success) && typeof getAllProjects === 'function') {
      try {
        const all = getAllProjects();
        const projects = (all && all.success && Array.isArray(all.projects)) ? all.projects : [];
        const targetMilestone = String(milestoneId || '').trim();
        const targetId = String(projectId || '').trim();

        const matched = projects.find(function(p) {
          const pid = String(p.projectId || '').trim();
          const pd = p.projectData || {};
          const estId = String(pd.estimateId || '').trim();
          const invId = String(pd.invoiceId || '').trim();
          const linkedId = String(pd.linkedEstimateId || '').trim();
          let schedule = pd.paymentSchedule || [];
          if (typeof schedule === 'string') {
            try { schedule = JSON.parse(schedule); } catch (e) { schedule = []; }
          }
          const hasMilestone = Array.isArray(schedule) && schedule.some(function(ms) {
            return String(ms.id || '').trim() === targetMilestone;
          });

          if (targetId) {
            return pid === targetId || estId === targetId || invId === targetId || linkedId === targetId || hasMilestone;
          }
          return hasMilestone;
        });

        if (matched && matched.projectId) {
          resolvedProjectId = String(matched.projectId).trim();
          project = getProject(resolvedProjectId);
        }
      } catch (resolveErr) {
        Logger.log('⚠️ quickSendInvoice fallback project resolution failed: ' + resolveErr.toString());
      }
    }

    if (!project || !project.success) {
      return { success: false, error: 'Project not found: ' + String(projectId || '') };
    }

    const projectData = project.project || {};
    const milestoneStatus = (projectData.milestoneStatus || {})[milestoneId] || {};

    // Reuse an existing milestone invoice when it already exists so we can
    // resend an updated payment-schedule email without failing.
    let invoice = null;
    if (milestoneStatus.invoiced && milestoneStatus.invoiceId) {
      // If caller explicitly chose processing fee ON/OFF, enforce that choice
      // even for already-invoiced milestones by refreshing the Stripe link.
      if (typeof addProcessingFee === 'boolean') {
        try {
          let currentFeeFlag = null;
          if (typeof milestoneStatus.addProcessingFee === 'boolean') {
            currentFeeFlag = milestoneStatus.addProcessingFee;
          }

          // Fallback: read stored flag from PM_Project_Invoices col H when available
          if (currentFeeFlag === null) {
            const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
            const invSheet = spreadsheet.getSheetByName(PM_PROJECT_INVOICES_SHEET);
            if (invSheet) {
              const invRows = invSheet.getDataRange().getValues() || [];
              for (let ir = 1; ir < invRows.length; ir++) {
                if (String(invRows[ir][0] || '').trim() === String(milestoneStatus.invoiceId).trim()) {
                  const raw = invRows[ir][7];
                  if (raw === true || String(raw).toLowerCase() === 'true') currentFeeFlag = true;
                  if (raw === false || String(raw).toLowerCase() === 'false') currentFeeFlag = false;
                  break;
                }
              }
            }
          }

          const needsRefresh =
            !String(milestoneStatus.stripePaymentUrl || '').trim() ||
            currentFeeFlag === null ||
            currentFeeFlag !== addProcessingFee;

          if (needsRefresh) {
            let paymentSchedule = projectData.paymentSchedule || [];
            if (typeof paymentSchedule === 'string') {
              try { paymentSchedule = JSON.parse(paymentSchedule || '[]'); } catch (_) { paymentSchedule = []; }
            }
            if (!Array.isArray(paymentSchedule)) paymentSchedule = [];

            const ms = paymentSchedule.find(function(m) {
              return String(m && m.id || '').trim() === String(milestoneId || '').trim();
            });

            const msName = (ms && (ms.name || ms.title)) || ('Milestone ' + String(milestoneId || ''));
            const msAmount = parseFloat((ms && (ms.amount || ms.total)) || 0);

            if (msAmount > 0) {
              const refreshed = createStripePaymentLink(
                projectData.customerEmail,
                projectData.customerName,
                msName,
                msAmount,
                String(milestoneStatus.invoiceId || '').trim(),
                resolvedProjectId,
                projectData.customerAddress || '',
                { addProcessingFee: addProcessingFee }
              );

              if (refreshed && refreshed.success && refreshed.paymentUrl) {
                const freshUrl = String(refreshed.paymentUrl || '').trim();
                milestoneStatus.stripePaymentUrl = freshUrl;
                milestoneStatus.addProcessingFee = addProcessingFee;

                if (!projectData.milestoneStatus) projectData.milestoneStatus = {};
                projectData.milestoneStatus[milestoneId] = milestoneStatus;
                updateProject(resolvedProjectId, { milestoneStatus: projectData.milestoneStatus });

                // Update PM_Project_Invoices row: payment link (col F) + fee flag (col H)
                try {
                  const spreadsheet2 = SpreadsheetApp.openById(SPREADSHEET_ID);
                  const invSheet2 = spreadsheet2.getSheetByName(PM_PROJECT_INVOICES_SHEET);
                  if (invSheet2) {
                    const invRows2 = invSheet2.getDataRange().getValues() || [];
                    for (let ir2 = 1; ir2 < invRows2.length; ir2++) {
                      if (String(invRows2[ir2][0] || '').trim() === String(milestoneStatus.invoiceId || '').trim()) {
                        invSheet2.getRange(ir2 + 1, 6).setValue(freshUrl);
                        invSheet2.getRange(ir2 + 1, 8).setValue(addProcessingFee === true);
                        break;
                      }
                    }
                  }
                } catch (sheetSyncErr) {
                  Logger.log('⚠️ quickSendInvoice fee-refresh sheet sync warning: ' + sheetSyncErr.toString());
                }
              }
            }
          }
        } catch (feeRefreshErr) {
          Logger.log('⚠️ quickSendInvoice fee-refresh warning: ' + feeRefreshErr.toString());
        }
      }

      invoice = {
        success: true,
        invoiceId: milestoneStatus.invoiceId,
        paymentUrl: milestoneStatus.stripePaymentUrl || ''
      };
    } else {
      invoice = generateMilestoneInvoice(resolvedProjectId, milestoneId, addProcessingFee);
      if (!invoice.success) {
        return invoice;
      }
    }
    
    // Send email
    const emailResult = sendMilestoneInvoiceEmail(resolvedProjectId, milestoneId, invoice.invoiceId, addProcessingFee);
    if (!emailResult.success) {
      return emailResult;
    }
    
    Logger.log('✅ Invoice generated and sent: ' + invoice.invoiceId);
    
    const pdForShare = (project && project.project) || {};
    const linkedDocIdForShare = String(
      pdForShare.estimateId ||
      pdForShare.linkedEstimateId ||
      pdForShare.invoiceId ||
      pdForShare.linkedInvoiceId ||
      ''
    ).trim();

    return {
      success: true,
      projectId: resolvedProjectId,
      invoiceId: invoice.invoiceId,
      paymentUrl: invoice.paymentUrl,
      // Milestone invoice sends must always open the milestone invoice (Pay Now)
      shareLink:
        'https://www.aqualitypoolcompanyusa.com/invoice-viewer?id=' + encodeURIComponent(invoice.invoiceId) +
        '&projectId=' + encodeURIComponent(resolvedProjectId) +
        (linkedDocIdForShare ? ('&linkedId=' + encodeURIComponent(linkedDocIdForShare)) : '')
    };
    
  } catch (error) {
    Logger.log('❌ Error in quick send invoice: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Quick-send milestone invoice using an externally created Stripe payment link.
 * This is used as a fallback when Apps Script UrlFetch quota is exhausted.
 *
 * @param {string} projectId
 * @param {string} milestoneId
 * @param {string} paymentUrl
 * @returns {object}
 */
function quickSendInvoiceWithPaymentLink(projectId, milestoneId, paymentUrl, addProcessingFee) {
  try {
    const cleanPaymentUrl = String(paymentUrl || '').trim();
    if (!cleanPaymentUrl) {
      return { success: false, error: 'Missing Stripe payment URL' };
    }

    let resolvedProjectId = String(projectId || '').trim();
    let project = getProject(resolvedProjectId);

    // Keep same fallback resolution behavior as quickSendInvoice
    if ((!project || !project.success) && typeof getAllProjects === 'function') {
      try {
        const all = getAllProjects();
        const projects = (all && all.success && Array.isArray(all.projects)) ? all.projects : [];
        const targetMilestone = String(milestoneId || '').trim();
        const targetId = String(projectId || '').trim();

        const matched = projects.find(function(p) {
          const pid = String(p.projectId || '').trim();
          const pd = p.projectData || {};
          const estId = String(pd.estimateId || '').trim();
          const invId = String(pd.invoiceId || '').trim();
          const linkedId = String(pd.linkedEstimateId || '').trim();
          let schedule = pd.paymentSchedule || [];
          if (typeof schedule === 'string') {
            try { schedule = JSON.parse(schedule); } catch (e) { schedule = []; }
          }
          const hasMilestone = Array.isArray(schedule) && schedule.some(function(ms) {
            return String(ms.id || '').trim() === targetMilestone;
          });

          if (targetId) {
            return pid === targetId || estId === targetId || invId === targetId || linkedId === targetId || hasMilestone;
          }
          return hasMilestone;
        });

        if (matched && matched.projectId) {
          resolvedProjectId = String(matched.projectId).trim();
          project = getProject(resolvedProjectId);
        }
      } catch (resolveErr) {
        Logger.log('⚠️ quickSendInvoiceWithPaymentLink fallback resolution failed: ' + resolveErr.toString());
      }
    }

    if (!project || !project.success) {
      return { success: false, error: 'Project not found: ' + String(projectId || '') };
    }

    const projectData = project.project || {};
    let paymentSchedule = projectData.paymentSchedule || [];
    if (typeof paymentSchedule === 'string') {
      try { paymentSchedule = JSON.parse(paymentSchedule || '[]'); } catch (e) { paymentSchedule = []; }
    }
    if (!Array.isArray(paymentSchedule)) paymentSchedule = [];

    const milestone = paymentSchedule.find(function(m) {
      return String(m && m.id || '').trim() === String(milestoneId || '').trim();
    });
    if (!milestone) {
      return { success: false, error: 'Milestone not found' };
    }

    if (!projectData.milestoneStatus) projectData.milestoneStatus = {};
    let invoiceId = '';
    const existing = projectData.milestoneStatus[milestoneId] || {};

    if (existing.invoiced && existing.invoiceId) {
      invoiceId = String(existing.invoiceId).trim();
    } else {
      invoiceId = 'INV-' + resolvedProjectId + '-' + milestoneId + '-' + new Date().getTime();
    }

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let invoicesSheet = spreadsheet.getSheetByName(PM_PROJECT_INVOICES_SHEET);
    if (!invoicesSheet) {
      setupPMProjectInvoicesSheet(spreadsheet);
      invoicesSheet = spreadsheet.getSheetByName(PM_PROJECT_INVOICES_SHEET);
    }

    // Upsert invoice row
    const rows = invoicesSheet.getDataRange().getValues();
    let foundRow = -1;
    for (var r = 1; r < rows.length; r++) {
      if (String(rows[r][0] || '').trim() === invoiceId) {
        foundRow = r + 1;
        break;
      }
    }

    let resolvedAddProcessingFee = null;
    if (addProcessingFee === true) resolvedAddProcessingFee = true;
    else if (addProcessingFee === false) resolvedAddProcessingFee = false;

    if (foundRow > 0) {
      invoicesSheet.getRange(foundRow, 6).setValue(cleanPaymentUrl); // Payment Link
      if (resolvedAddProcessingFee !== null) {
        invoicesSheet.getRange(foundRow, 8).setValue(resolvedAddProcessingFee); // Add Processing Fee flag
      }
    } else {
      invoicesSheet.appendRow([
        invoiceId,
        resolvedProjectId,
        milestone.name,
        milestone.amount,
        'Pending',
        cleanPaymentUrl,
        new Date(),
        resolvedAddProcessingFee === null ? '' : resolvedAddProcessingFee
      ]);
    }

    projectData.milestoneStatus[milestoneId] = {
      invoiced: true,
      paid: !!existing.paid,
      invoiceId: invoiceId,
      dateSent: new Date().toISOString(),
      stripePaymentUrl: cleanPaymentUrl,
      addProcessingFee: resolvedAddProcessingFee
    };
    updateProject(resolvedProjectId, { milestoneStatus: projectData.milestoneStatus });

    const emailResult = sendMilestoneInvoiceEmail(resolvedProjectId, milestoneId, invoiceId, addProcessingFee);
    if (!emailResult || !emailResult.success) {
      return { success: false, error: emailResult ? emailResult.error : 'Email sending failed' };
    }

    const linkedDocIdForShare = String(
      projectData.estimateId ||
      projectData.linkedEstimateId ||
      projectData.invoiceId ||
      projectData.linkedInvoiceId ||
      ''
    ).trim();

    return {
      success: true,
      projectId: resolvedProjectId,
      invoiceId: invoiceId,
      paymentUrl: cleanPaymentUrl,
      // Milestone invoice sends must always open the milestone invoice (Pay Now)
      shareLink:
        'https://www.aqualitypoolcompanyusa.com/invoice-viewer?id=' + encodeURIComponent(invoiceId) +
        '&projectId=' + encodeURIComponent(resolvedProjectId) +
        (linkedDocIdForShare ? ('&linkedId=' + encodeURIComponent(linkedDocIdForShare)) : '')
    };
  } catch (error) {
    Logger.log('❌ Error in quickSendInvoiceWithPaymentLink: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

// ============================================================================
// GEMINI API SETUP (One-time setup function - DELETE AFTER USE)
// ============================================================================

/**
 * One-time function to set Gemini API key
 * Run this ONCE, then DELETE this function for security
 * @returns {string} - Confirmation message
 */
function setGeminiApiKey() {
  try {
    PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', 'AIzaSyDDFvFWgnwoN1_0EJp6GgOxjElw8OZzdzA');
    Logger.log('✅ Gemini API key set successfully!');
    return '✅ Gemini API key has been set! You can now delete this function.';
  } catch (error) {
    Logger.log('❌ Error setting API key: ' + error.toString());
    return '❌ Error: ' + error.toString();
  }
}

/**
 * Test function to verify Gemini API key is set
 * @returns {string} - Status message
 */
function testGeminiKey() {
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (key) {
    Logger.log('✅ Gemini API key found: ' + key.substring(0, 10) + '...');
    return '✅ Key is set! (' + key.substring(0, 10) + '...)';
  } else {
    Logger.log('❌ No Gemini API key found');
    return '❌ Key not set! Run setGeminiApiKey() first.';
  }
}

// ============================================================================
// EXPENSE TRACKING
// ============================================================================

/**
 * Add expense to project
 * @param {object} expenseData - Expense details
 * @returns {object} - Created expense
 */
function addExpense(expenseData) {
  try {
    const expenseId = 'EXP-' + new Date().getTime();
    const companyId = expenseData.companyId || PM_EXPENSES_DEFAULT_COMPANY_ID;
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let expensesSheet = spreadsheet.getSheetByName(PM_EXPENSES_SHEET);
    
    // Auto-create sheet if it doesn't exist
    if (!expensesSheet) {
      Logger.log('⚠️ PM_Expenses sheet not found, creating it...');
      setupPMExpensesSheet(spreadsheet);
      expensesSheet = spreadsheet.getSheetByName(PM_EXPENSES_SHEET);
      if (!expensesSheet) {
        Logger.log('❌ Failed to create PM_Expenses sheet');
        return { success: false, error: 'Failed to create expenses sheet' };
      }
    }
    
    // Create receipt/notes JSON
    const receiptData = {
      receiptUrl: expenseData.receiptUrl || '',
      notes: expenseData.notes || '',
      vendor: expenseData.vendor || '',
      invoiceNumber: expenseData.invoiceNumber || ''
    };
    
    expensesSheet.appendRow([
      companyId,
      expenseId,
      expenseData.projectId,
      expenseData.date || new Date(),
      expenseData.category,
      expenseData.description,
      parseFloat(expenseData.amount),
      expenseData.paidFromAccount,
      JSON.stringify(receiptData)
    ]);
    
    // Update project profit margin
    updateProjectProfitMargin(expenseData.projectId);
    
    Logger.log('✅ Expense added: ' + expenseId);
    
    return {
      success: true,
      expenseId: expenseId
    };
    
  } catch (error) {
    Logger.log('❌ Error adding expense: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Get project expenses
 * @param {string} projectId - The project ID
 * @returns {object} - List of expenses
 */
function getProjectExpenses(projectId) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let expensesSheet = spreadsheet.getSheetByName(PM_EXPENSES_SHEET);
    
    // Auto-create sheet if it doesn't exist
    if (!expensesSheet) {
      Logger.log('⚠️ PM_Expenses sheet not found, creating it...');
      setupPMExpensesSheet(spreadsheet);
      expensesSheet = spreadsheet.getSheetByName(PM_EXPENSES_SHEET);
      if (!expensesSheet) {
        Logger.log('❌ Failed to create PM_Expenses sheet');
        return { success: true, expenses: [], total: 0 };
      }
    }
    
    var col = getPMExpensesColumnIndices_(expensesSheet);
    const data = expensesSheet.getDataRange().getValues();
    const expenses = [];
    let totalExpenses = 0;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][col.projectId] === projectId) {
        let receiptData = {};
        try {
          if (data[i][col.receiptJson] && String(data[i][col.receiptJson]).trim()) {
            receiptData = JSON.parse(data[i][col.receiptJson]);
          }
        } catch (parseError) {
          Logger.log('⚠️ Error parsing receipt data for expense ' + data[i][col.expenseId] + ': ' + parseError.toString());
          receiptData = {};
        }
        
        expenses.push({
          companyId: col.companyId >= 0 ? data[i][col.companyId] : PM_EXPENSES_DEFAULT_COMPANY_ID,
          expenseId: data[i][col.expenseId],
          projectId: data[i][col.projectId],
          date: data[i][col.date],
          category: data[i][col.category],
          description: data[i][col.description],
          amount: data[i][col.amount],
          paidFromAccount: data[i][col.paidFrom],
          receiptData: receiptData
        });
        
        totalExpenses += parseFloat(data[i][col.amount] || 0);
      }
    }
    
    return {
      success: true,
      expenses: expenses,
      total: totalExpenses
    };
    
  } catch (error) {
    Logger.log('❌ Error getting project expenses: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Update expense
 * @param {string} expenseId - The expense ID
 * @param {object} expenseData - Updated expense details
 * @returns {object} - Update result
 */
function updateExpense(expenseId, expenseData) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let expensesSheet = spreadsheet.getSheetByName(PM_EXPENSES_SHEET);
    
    // Auto-create sheet if it doesn't exist
    if (!expensesSheet) {
      Logger.log('⚠️ PM_Expenses sheet not found, creating it...');
      setupPMExpensesSheet(spreadsheet);
      expensesSheet = spreadsheet.getSheetByName(PM_EXPENSES_SHEET);
      if (!expensesSheet) {
        Logger.log('❌ Failed to create PM_Expenses sheet');
        return { success: false, error: 'Failed to create expenses sheet' };
      }
    }
    
    var col = getPMExpensesColumnIndices_(expensesSheet);
    const data = expensesSheet.getDataRange().getValues();
    
    // Find expense row
    for (let i = 1; i < data.length; i++) {
      if (data[i][col.expenseId] === expenseId) {
        var existingReceipt = {};
        try {
          if (data[i][col.receiptJson] && String(data[i][col.receiptJson]).trim()) {
            existingReceipt = JSON.parse(data[i][col.receiptJson]);
          }
        } catch (e) { existingReceipt = {}; }
        const receiptData = {
          receiptUrl: expenseData.receiptUrl !== undefined && expenseData.receiptUrl !== ''
            ? expenseData.receiptUrl : (existingReceipt.receiptUrl || ''),
          notes: expenseData.notes !== undefined ? expenseData.notes : (existingReceipt.notes || ''),
          vendor: expenseData.vendor !== undefined ? expenseData.vendor : (existingReceipt.vendor || ''),
          invoiceNumber: expenseData.invoiceNumber !== undefined ? expenseData.invoiceNumber : (existingReceipt.invoiceNumber || '')
        };
        
        if (col.companyId >= 0) {
          expensesSheet.getRange(i + 1, col.companyId + 1).setValue(
            expenseData.companyId || data[i][col.companyId] || PM_EXPENSES_DEFAULT_COMPANY_ID
          );
        }
        expensesSheet.getRange(i + 1, col.projectId + 1).setValue(expenseData.projectId || data[i][col.projectId]);
        expensesSheet.getRange(i + 1, col.date + 1).setValue(expenseData.date || data[i][col.date]);
        expensesSheet.getRange(i + 1, col.category + 1).setValue(expenseData.category || data[i][col.category]);
        expensesSheet.getRange(i + 1, col.description + 1).setValue(expenseData.description || data[i][col.description]);
        expensesSheet.getRange(i + 1, col.amount + 1).setValue(parseFloat(expenseData.amount || data[i][col.amount]));
        expensesSheet.getRange(i + 1, col.paidFrom + 1).setValue(expenseData.paidFromAccount || data[i][col.paidFrom]);
        expensesSheet.getRange(i + 1, col.receiptJson + 1).setValue(JSON.stringify(receiptData));
        
        const projectId = expenseData.projectId || data[i][col.projectId];
        updateProjectProfitMargin(projectId);
        
        Logger.log('✅ Expense updated: ' + expenseId);
        
        return {
          success: true,
          expenseId: expenseId
        };
      }
    }
    
    return { success: false, error: 'Expense not found' };
    
  } catch (error) {
    Logger.log('❌ Error updating expense: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Delete expense
 * @param {string} expenseId - The expense ID
 * @returns {object} - Delete result
 */
function deleteExpense(expenseId) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let expensesSheet = spreadsheet.getSheetByName(PM_EXPENSES_SHEET);
    
    // Auto-create sheet if it doesn't exist
    if (!expensesSheet) {
      Logger.log('⚠️ PM_Expenses sheet not found, creating it...');
      setupPMExpensesSheet(spreadsheet);
      expensesSheet = spreadsheet.getSheetByName(PM_EXPENSES_SHEET);
      if (!expensesSheet) {
        Logger.log('❌ Failed to create PM_Expenses sheet');
        return { success: false, error: 'Failed to create expenses sheet' };
      }
    }
    
    var col = getPMExpensesColumnIndices_(expensesSheet);
    const data = expensesSheet.getDataRange().getValues();
    
    // Find expense row
    for (let i = 1; i < data.length; i++) {
      if (data[i][col.expenseId] === expenseId) {
        const projectId = data[i][col.projectId];
        
        // Delete row
        expensesSheet.deleteRow(i + 1);
        
        // Update project profit margin
        updateProjectProfitMargin(projectId);
        
        Logger.log('✅ Expense deleted: ' + expenseId);
        
        return {
          success: true,
          expenseId: expenseId
        };
      }
    }
    
    return { success: false, error: 'Expense not found' };
    
  } catch (error) {
    Logger.log('❌ Error deleting expense: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Get expense by ID
 * @param {string} expenseId - The expense ID
 * @returns {object} - Expense data
 */
function getExpense(expenseId) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let expensesSheet = spreadsheet.getSheetByName(PM_EXPENSES_SHEET);
    
    // Auto-create sheet if it doesn't exist
    if (!expensesSheet) {
      Logger.log('⚠️ PM_Expenses sheet not found, creating it...');
      setupPMExpensesSheet(spreadsheet);
      expensesSheet = spreadsheet.getSheetByName(PM_EXPENSES_SHEET);
      if (!expensesSheet) {
        Logger.log('❌ Failed to create PM_Expenses sheet');
        return { success: false, error: 'Failed to create expenses sheet' };
      }
    }
    
    var col = getPMExpensesColumnIndices_(expensesSheet);
    const data = expensesSheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][col.expenseId] === expenseId) {
        var receiptData = {};
        try {
          if (data[i][col.receiptJson] && String(data[i][col.receiptJson]).trim()) {
            receiptData = JSON.parse(data[i][col.receiptJson]);
          }
        } catch (e) { receiptData = {}; }
        
        return {
          success: true,
          expense: {
            companyId: col.companyId >= 0 ? data[i][col.companyId] : PM_EXPENSES_DEFAULT_COMPANY_ID,
            expenseId: data[i][col.expenseId],
            projectId: data[i][col.projectId],
            date: data[i][col.date],
            category: data[i][col.category],
            description: data[i][col.description],
            amount: data[i][col.amount],
            paidFromAccount: data[i][col.paidFrom],
            receiptData: receiptData
          }
        };
      }
    }
    
    return { success: false, error: 'Expense not found' };
    
  } catch (error) {
    Logger.log('❌ Error getting expense: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Export project expenses to CSV
 * @param {string} projectId - The project ID
 * @param {string} startDate - Optional start date filter
 * @param {string} endDate - Optional end date filter
 * @param {string} category - Optional category filter
 * @returns {object} - CSV data
 */
function exportProjectExpenses(projectId, startDate, endDate, category) {
  try {
    const expensesResult = getProjectExpenses(projectId);
    
    if (!expensesResult.success) {
      return { success: false, error: expensesResult.error };
    }
    
    let expenses = expensesResult.expenses || [];
    
    // Apply filters
    if (startDate) {
      const start = new Date(startDate);
      expenses = expenses.filter(e => new Date(e.date) >= start);
    }
    
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      expenses = expenses.filter(e => new Date(e.date) <= end);
    }
    
    if (category) {
      expenses = expenses.filter(e => e.category === category);
    }
    
    // Sort by date (newest first)
    expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Build CSV
    let csv = 'Company ID,Expense ID,Project ID,Date,Category,Description,Amount,Paid From Account,Vendor,Invoice Number,Notes\n';
    
    expenses.forEach(expense => {
      const receiptData = expense.receiptData || {};
      const date = new Date(expense.date).toLocaleDateString();
      const amount = parseFloat(expense.amount || 0).toFixed(2);
      const vendor = (receiptData.vendor || '').replace(/"/g, '""');
      const invoiceNumber = (receiptData.invoiceNumber || '').replace(/"/g, '""');
      const notes = (receiptData.notes || '').replace(/"/g, '""');
      const cid = (expense.companyId || PM_EXPENSES_DEFAULT_COMPANY_ID).replace(/"/g, '""');
      
      csv += '"' + cid + '","' + expense.expenseId + '","' + expense.projectId + '","' + date + '","' + expense.category + '","' + expense.description.replace(/"/g, '""') + '","' + amount + '","' + expense.paidFromAccount + '","' + vendor + '","' + invoiceNumber + '","' + notes + '"\n';
    });
    
    const project = getProject(projectId);
    const projectName = project.success && project.project ? project.project.customerName : projectId;
    const filename = 'Expenses_' + projectName + '_' + new Date().toISOString().split('T')[0] + '.csv';
    
    return {
      success: true,
      csv: csv,
      filename: filename,
      count: expenses.length
    };
    
  } catch (error) {
    Logger.log('❌ Error exporting expenses: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Calculate project profit
 * @param {string} projectId - The project ID
 * @returns {object} - Profit calculation
 */
function calculateProjectProfit(projectId) {
  try {
    const project = getProject(projectId);
    if (!project.success) {
      return { success: false, error: 'Project not found' };
    }
    
    const projectData = project.project;
    const totalRevenue = parseFloat(projectData.total);
    
    // Get total expenses
    const expenses = getProjectExpenses(projectId);
    const totalExpenses = expenses.total || 0;
    
    // Get total paid invoices
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const invoicesSheet = spreadsheet.getSheetByName(PM_PROJECT_INVOICES_SHEET);
    let totalPaid = 0;
    
    if (invoicesSheet) {
      const data = invoicesSheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (data[i][1] === projectId && data[i][4] === 'Paid') {
          totalPaid += parseFloat(data[i][3] || 0);
        }
      }
    }
    
    const profit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
    const remainingRevenue = totalRevenue - totalPaid;
    
    return {
      success: true,
      totalRevenue: totalRevenue,
      totalExpenses: totalExpenses,
      totalPaid: totalPaid,
      remainingRevenue: remainingRevenue,
      profit: profit,
      profitMargin: profitMargin
    };
    
  } catch (error) {
    Logger.log('❌ Error calculating project profit: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Update project profit margin in sheet
 * @param {string} projectId - The project ID
 */
function updateProjectProfitMargin(projectId) {
  try {
    const profitCalc = calculateProjectProfit(projectId);
    if (!profitCalc.success) return;
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const projectsSheet = spreadsheet.getSheetByName(PM_PROJECTS_SHEET);
    const data = projectsSheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === projectId) {
        projectsSheet.getRange(i + 1, 8).setValue(profitCalc.profitMargin.toFixed(2));
        break;
      }
    }
    
    Logger.log('✅ Profit margin updated for project: ' + projectId);
    
  } catch (error) {
    Logger.log('⚠️ Error updating profit margin: ' + error.toString());
  }
}

// ============================================================================
// CHANGE ORDERS
// ============================================================================

/**
 * Create change order
 * @param {string} projectId - The project ID
 * @param {object} changeOrderData - Change order details
 * @returns {object} - Created change order with invoice
 */
function createChangeOrder(projectId, changeOrderData) {
  try {
    const project = getProject(projectId);
    if (!project.success) {
      return { success: false, error: 'Project not found' };
    }
    
    const projectData = project.project;
    
    // Generate change order ID
    const changeOrderId = 'CO-' + projectId + '-' + new Date().getTime();
    
    // Create change order object
    const changeOrder = {
      id: changeOrderId,
      description: changeOrderData.description,
      items: changeOrderData.items || [],
      amount: parseFloat(changeOrderData.amount),
      approved: false,
      createdDate: new Date().toISOString(),
      notes: changeOrderData.notes || ''
    };
    
    // Add to project change orders
    if (!projectData.changeOrders) projectData.changeOrders = [];
    projectData.changeOrders.push(changeOrder);
    
    // Update project total
    const newTotal = parseFloat(projectData.total) + parseFloat(changeOrderData.amount);
    
    updateProject(projectId, {
      changeOrders: projectData.changeOrders,
      total: newTotal
    });
    
    // Generate invoice for change order if auto-invoice is enabled
    if (changeOrderData.autoInvoice) {
      const invoiceId = 'INV-CO-' + changeOrderId;
      
      const stripeLink = createStripePaymentLink(
        projectData.customerEmail,
        projectData.customerName,
        'Change Order: ' + changeOrderData.description,
        changeOrderData.amount,
        invoiceId,
        projectId
      );
      
      if (stripeLink.success) {
        const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
        const invoicesSheet = spreadsheet.getSheetByName(PM_PROJECT_INVOICES_SHEET);
        
        invoicesSheet.appendRow([
          invoiceId,
          projectId,
          'Change Order: ' + changeOrderData.description,
          changeOrderData.amount,
          'Pending',
          stripeLink.paymentUrl,
          new Date(),
          ''
        ]);
        
        changeOrder.invoiceId = invoiceId;
        changeOrder.stripePaymentUrl = stripeLink.paymentUrl;
      }
    }
    
    Logger.log('✅ Change order created: ' + changeOrderId);
    
    return {
      success: true,
      changeOrderId: changeOrderId,
      changeOrder: changeOrder
    };
    
  } catch (error) {
    Logger.log('❌ Error creating change order: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

// ============================================================================
// AI-POWERED CUSTOMER COMMUNICATION
// ============================================================================

/**
 * Generate daily summary with AI (OpenAI API)
 * @param {string} projectId - The project ID
 * @param {string} workDescription - Raw work description
 * @param {array} photoUrls - Optional array of photo URLs
 * @param {string} workDate - Optional work date (defaults to today)
 * @returns {object} - AI-enhanced summary
 */
function generateDailySummaryWithAI(projectId, workDescription, photoUrls, workDate) {
  try {
    const project = getProject(projectId);
    if (!project.success) {
      return { success: false, error: 'Project not found' };
    }
    
    const projectData = project.project;
    
    // Get OpenAI API key (hardcoded for immediate use)
    const openaiApiKey = 'REDACTED';
    
    Logger.log('🔍 Using OpenAI API key: ' + openaiApiKey.substring(0, 10) + '...');
    
    if (!openaiApiKey || openaiApiKey.trim() === '') {
      Logger.log('⚠️ No OpenAI API key configured');
      return {
        success: true,
        enhancedSummary: workDescription,
        originalText: workDescription,
        aiUsed: false,
        error: 'OpenAI API key not configured'
      };
    }
    
    // Determine date context (normalize to midnight for accurate comparison)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const workDateObj = workDate ? new Date(workDate) : new Date();
    workDateObj.setHours(0, 0, 0, 0);
    
    const isToday = workDateObj.getTime() === today.getTime();
    const isFuture = workDateObj.getTime() > today.getTime();
    const isPast = workDateObj.getTime() < today.getTime();
    
    // Create clear date context string
    let dateContext = '';
    let tenseInstruction = '';
    if (isToday) {
      dateContext = 'today';
      tenseInstruction = 'Use PAST tense (e.g., "we completed", "we finished") since the work was done today.';
    } else if (isFuture) {
      dateContext = 'on ' + workDateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      tenseInstruction = 'Use FUTURE tense (e.g., "we will complete", "we will be doing") since this work is scheduled for ' + workDateObj.toLocaleDateString() + '. DO NOT say "today" - reference the actual date: ' + workDateObj.toLocaleDateString() + '.';
    } else {
      dateContext = 'on ' + workDateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      tenseInstruction = 'Use PAST tense (e.g., "we completed", "we finished") since this work was done in the past.';
    }
    
    // Create prompt for OpenAI - generate 3 variations
    const prompt = 'You are ' + COMPANY_NAME + ' communicating with a homeowner about their pool installation project.\n\n' +
      'Project Details:\n' +
      '- Customer: ' + projectData.customerName + '\n' +
      '- Project Type: Pool Installation\n' +
      '- Work Date: ' + dateContext + '\n' +
      '- Date Type: ' + (isToday ? 'TODAY' : (isFuture ? 'FUTURE' : 'PAST')) + '\n\n' +
      'Work Description (raw notes from crew):\n' + workDescription + '\n\n' +
      'Rewrite this as a simple, direct update message. CRITICAL RULES:\n' +
      '- NO greeting (no "Hello", "Dear", "Hi", etc.)\n' +
      '- NO subject line\n' +
      '- NO closing (no "Best regards", "Thank you", etc.)\n' +
      '- Just the work update itself - simple and direct\n' +
      '- ' + tenseInstruction + '\n' +
      '- Be concise - 2-3 sentences max\n' +
      '- Don\'t add details that weren\'t in the original notes\n' +
      '- DO NOT add generic "next steps" or "we will proceed" statements unless they were in the original notes\n' +
      '- ' + (isFuture ? 'DO NOT use "today" - use the actual date: ' + workDateObj.toLocaleDateString() : '') + '\n' +
      '- ONLY mention what was actually done or will be done - no speculation\n\n' +
      'Generate 3 DIFFERENT variations of this update message. Each should be:\n' +
      '- Simple and direct\n' +
      '- Professional but casual\n' +
      '- Slightly different wording/style\n' +
      '- Same core information\n\n' +
      'Format your response as:\n' +
      'VARIATION 1:\n[first variation]\n\nVARIATION 2:\n[second variation]\n\nVARIATION 3:\n[third variation]';
    
    // Call OpenAI API
    const apiUrl = 'https://api.openai.com/v1/chat/completions';
    
    const payload = {
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a professional pool construction company assistant. Rewrite work notes into simple, direct customer updates. NO greetings, NO subject lines, NO closings - just the work update itself. Generate 3 different variations.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7, // Higher temperature for more variation
      max_tokens: 300 // More tokens for 3 variations
    };
    
    const options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Authorization': 'Bearer ' + openaiApiKey
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    Logger.log('📡 Calling OpenAI API...');
    const response = UrlFetchApp.fetch(apiUrl, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    Logger.log('📡 Response code: ' + responseCode);
    
    if (responseCode !== 200) {
      Logger.log('❌ OpenAI API error - Response: ' + responseText);
      let errorMessage = 'Unknown error';
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.error?.message || JSON.stringify(errorData);
      } catch (e) {
        errorMessage = responseText.substring(0, 200);
      }
      return {
        success: true,
        enhancedSummary: workDescription,
        originalText: workDescription,
        aiUsed: false,
        error: 'OpenAI API error: ' + errorMessage
      };
    }
    
    const responseData = JSON.parse(responseText);
    
    if (responseData.choices && responseData.choices.length > 0 && responseData.choices[0].message) {
      const aiResponse = responseData.choices[0].message.content.trim();
      
      // Parse the 3 variations from the response
      const variations = [];
      const variationPattern = /VARIATION\s+\d+:\s*([^\n]+(?:\n(?!VARIATION)[^\n]+)*)/gi;
      let match;
      
      while ((match = variationPattern.exec(aiResponse)) !== null) {
        const variation = match[1].trim();
        // Clean up any remaining formatting
        const cleaned = variation.replace(/^[-•]\s*/, '').trim();
        if (cleaned) {
          variations.push(cleaned);
        }
      }
      
      // If pattern matching didn't work, try splitting by "VARIATION" markers
      if (variations.length === 0) {
        const parts = aiResponse.split(/VARIATION\s+\d+:/i).filter(p => p.trim());
        variations.push(...parts.map(p => p.trim()).slice(0, 3));
      }
      
      // If still no variations, try splitting by numbered lines
      if (variations.length === 0) {
        const lines = aiResponse.split('\n').filter(l => l.trim());
        // Look for patterns like "1.", "2.", "3." or similar
        const numberedPattern = /^\d+[\.\)]\s*(.+)$/;
        const numbered = lines.filter(l => numberedPattern.test(l));
        if (numbered.length >= 3) {
          variations.push(...numbered.slice(0, 3).map(l => l.replace(numberedPattern, '$1').trim()));
        } else {
          // Fallback: just split into 3 parts
          const chunkSize = Math.ceil(lines.length / 3);
          for (let i = 0; i < 3; i++) {
            const chunk = lines.slice(i * chunkSize, (i + 1) * chunkSize).join(' ').trim();
            if (chunk) variations.push(chunk);
          }
        }
      }
      
      // Ensure we have at least 1 variation (use first as fallback)
      if (variations.length === 0) {
        variations.push(aiResponse);
      }
      
      // Ensure we have exactly 3 variations (duplicate if needed)
      while (variations.length < 3) {
        variations.push(variations[variations.length - 1] || workDescription);
      }
      
      // Clean up variations - remove any remaining greetings/closings
      const cleanedVariations = variations.map(v => {
        let cleaned = v.trim();
        // Remove common greetings at start
        cleaned = cleaned.replace(/^(Hello|Hi|Dear|Hey)\s+[^,]+[,\s]*/i, '');
        // Remove common closings at end
        cleaned = cleaned.replace(/\s*(Best regards|Thank you|Thanks|Sincerely)[^.]*$/i, '').trim();
        // Remove subject line patterns
        cleaned = cleaned.replace(/^(Subject|Re):\s*/i, '');
        return cleaned;
      });
      
      Logger.log('✅ AI generated 3 variations for project: ' + projectId);
      Logger.log('📝 Variations count: ' + cleanedVariations.length);
      
      return {
        success: true,
        enhancedSummary: cleanedVariations[0], // First variation as default
        variations: cleanedVariations, // All 3 variations
        originalText: workDescription,
        aiUsed: true
      };
    } else {
      Logger.log('⚠️ No AI response in choices, using raw text');
      Logger.log('📋 Response data: ' + JSON.stringify(responseData).substring(0, 200));
      return {
        success: true,
        enhancedSummary: workDescription,
        originalText: workDescription,
        aiUsed: false,
        error: 'No response from OpenAI API'
      };
    }
    
  } catch (error) {
    Logger.log('❌ Error generating AI summary: ' + error.toString());
    Logger.log('❌ Error stack: ' + (error.stack || 'No stack trace'));
    // Fallback to original text
    return {
      success: true,
      enhancedSummary: workDescription,
      originalText: workDescription,
      aiUsed: false,
      error: error.toString()
    };
  }
}

/**
 * Send daily update email to customer using enhanced invoice template format
 * @param {string} projectId - The project ID
 * @param {string} summary - Work summary (can be AI-enhanced)
 * @param {array} photoUrls - Optional array of photo URLs
 * @param {string} workDate - Optional work date (defaults to today)
 * @returns {object} - Send result
 */
function sendDailyUpdateEmail(projectId, summary, photoUrls, workDate, imagesData, openingMessage) {
  try {
    const project = getProject(projectId);
    if (!project.success) {
      return { success: false, error: 'Project not found' };
    }
    
    const projectData = project.project;
    const userSettings = getUserSettings('admin');
    
    // Determine if this is for today or future work
    const workDateObj = workDate ? new Date(workDate) : new Date();
    const isToday = workDateObj.toDateString() === new Date().toDateString();
    const isFuture = workDateObj > new Date();
    const dateLabel = isToday ? 'Today' : (isFuture ? workDateObj.toLocaleDateString() : workDateObj.toLocaleDateString());
    
    // Extract first name
    let firstName = 'Valued Customer';
    if (projectData.customerName && typeof projectData.customerName === 'string') {
      const name = projectData.customerName.trim();
      if (name.indexOf(' ') > 0) {
        firstName = name.substring(0, name.indexOf(' '));
      } else {
        firstName = name;
      }
    }
    
    // Process uploaded images: save to customer folder and get URLs
    let savedImageUrls = [];
    let imageGalleryHtml = '';
    
    if (imagesData && imagesData.length > 0) {
      try {
        // Get or create customer folder
        const customerFolder = getOrCreateCustomerFolder(projectData.customerName, projectData.customerAddress);
        
        if (customerFolder) {
          const dateStr = Utilities.formatDate(workDateObj, Session.getScriptTimeZone(), 'yyyy-MM-dd');
          
          // Process each image
          for (let i = 0; i < imagesData.length; i++) {
            const imgData = imagesData[i];
            try {
              // Convert base64 to blob
              const base64Data = imgData.data.split(',')[1] || imgData.data;
              const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), 'image/jpeg', imgData.filename || ('photo_' + (i + 1) + '.jpg'));
              
              // Create filename with date
              const fileName = dateStr + '_' + (imgData.filename || ('photo_' + (i + 1) + '.jpg'));
              
              // Save to customer folder
              const file = customerFolder.createFile(blob.setName(fileName));
              file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
              
              // Get direct image URL for email display
              // Convert Drive file URL to direct image URL
              const fileId = file.getId();
              const directImageUrl = 'https://drive.google.com/uc?export=view&id=' + fileId;
              
              savedImageUrls.push({
                url: directImageUrl,
                caption: imgData.caption || ''
              });
              
              Logger.log('✅ Saved image to customer folder: ' + fileName);
            } catch (imgError) {
              Logger.log('⚠️ Error saving image ' + i + ': ' + imgError.toString());
            }
          }
        } else {
          Logger.log('⚠️ Could not get or create customer folder');
        }
      } catch (folderError) {
        Logger.log('⚠️ Error processing images: ' + folderError.toString());
      }
      
      // Build image gallery HTML with captions
      if (savedImageUrls.length > 0) {
        imageGalleryHtml = '<div style="margin: 24px 0;"><table border="0" cellpadding="0" cellspacing="0" width="100%"><tr><td><table border="0" cellpadding="0" cellspacing="0" width="100%">' +
          savedImageUrls.map(function(img, index) {
            var cap = img.caption ? '<p style="margin: 8px 0 0 0; color: #64748b; font-size: 13px; font-style: italic; text-align: center;">' + img.caption + '</p>' : '';
            return '<tr><td style="padding: 12px; text-align: center; vertical-align: top;"><img src="' + img.url + '" alt="Progress Photo ' + (index + 1) + '" style="max-width: 500px; width: auto; height: auto; border-radius: 8px; display: block; margin: 0 auto;">' + cap + '</td></tr>';
          }).join('') +
          '</table></td></tr></table></div>';
      }
    }
    
    // Build photo section HTML for legacy photoUrls (smaller images like invoice template)
    let photosHtml = '';
    if (photoUrls && photoUrls.length > 0) {
      var photoW = 100 / Math.min(photoUrls.length, 4);
      photosHtml = '<table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 24px 0;"><tr><td><table border="0" cellpadding="0" cellspacing="0" width="100%"><tr>' +
        photoUrls.slice(0, 4).map(function(url) {
          return '<td width="' + photoW + '%" style="padding: 2px;"><img src="' + url + '" alt="Progress Photo" style="width: 100%; max-width: 150px; height: auto; border-radius: 8px; display: block;"></td>';
        }).join('') +
        '</tr></table></td></tr></table>';
    }
    
    // Separate opening message and update message
    // Opening message comes from first visit selection (if checked) - passed as parameter
    // Update message comes from the TinyMCE editor content (summary parameter)
    let updateMessage = summary;
    
    // Clean up update message (remove duplicate greetings, etc.)
    if (updateMessage && typeof updateMessage === 'string') {
      const firstName = projectData.customerName ? projectData.customerName.split(' ')[0] : '';
      
      // Remove duplicate greetings anywhere in the text
      if (firstName && firstName !== 'Valued Customer') {
        var esc = firstName.replace(/[.*+?^${}()|[\]\\]/g, function(m) { return '\\' + m; });
        updateMessage = updateMessage.replace(new RegExp('Dear\\s+' + esc + '[,\\s]*', 'gi'), '');
        updateMessage = updateMessage.replace(new RegExp('Hello\\s+' + esc + '[,\\s]*', 'gi'), '');
        updateMessage = updateMessage.replace(new RegExp('Hi\\s+' + esc + '[,\\s]*', 'gi'), '');
        updateMessage = updateMessage.replace(new RegExp('\\b' + esc + '\\s*,\\s*', 'gi'), '');
      }
      
      // Remove duplicate "Best regards" sections
      updateMessage = updateMessage.replace(/(Best regards[^.]*\.\s*){2,}/gi, '');
      
      // Clean up multiple spaces and newlines
      updateMessage = updateMessage.replace(/\s{2,}/g, ' ').trim();
    }
    
    // Use enhanced invoice email template
    // Pass opening message and update message separately
    const emailResult = sendEnhancedInvoiceEmail(
      {
        type: 'Project Update',
        customerName: projectData.customerName,
        customerEmail: projectData.customerEmail,
        customerPhone: projectData.customerPhone || '',
        customerAddress: projectData.customerAddress || '',
        invoiceNumber: projectId,
        date: workDateObj.toLocaleDateString(),
        items: JSON.stringify([{
          name: isFuture ? 'Upcoming Work' : 'Work Completed',
          description: summary,
          quantity: 1,
          price: 0
        }]),
        subtotal: 0,
        taxRate: 0,
        tax: 0,
        discount: 0,
        total: 0,
        notes: 'Project: ' + projectId + '\nDate: ' + dateLabel,
        paymentLink: '',
        shareLink: 'https://www.aqualitypoolcompanyusa.com/invoice-viewer?id=' + projectId,
        status: 'Update',
        paymentStatus: 'N/A',
        id: projectId,
        includeReviewRequest: true,
        customImageGallery: imageGalleryHtml || photosHtml, // Pass custom image gallery HTML
        openingMessage: openingMessage || '', // Opening message for fancy box
        updateMessage: updateMessage // Update message for body text
      },
      userSettings,
      updateMessage, // Pass update message as customMessage for backward compatibility
      [] // No attachments
    );
    
    if (!emailResult || !emailResult.success) {
      Logger.log('❌ Enhanced email sending failed: ' + (emailResult ? emailResult.error : 'No result returned'));
      return { success: false, error: emailResult ? emailResult.error : 'Email sending failed' };
    }
    
    // Save update to project history
    if (!projectData.dailyUpdates) projectData.dailyUpdates = [];
    projectData.dailyUpdates.push({
      date: workDateObj.toISOString(),
      summary: summary,
      photoUrls: photoUrls || [],
      imageUrls: savedImageUrls.map(img => img.url),
      sentBy: Session.getActiveUser().getEmail()
    });
    
    updateProject(projectId, { dailyUpdates: projectData.dailyUpdates });
    
    Logger.log('✅ Daily update email sent for project: ' + projectId);
    
    return { success: true };
    
  } catch (error) {
    Logger.log('❌ Error sending daily update: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Quick send daily update with AI enhancement
 * @param {string} projectId - The project ID
 * @param {string} rawNotes - Raw work notes
 * @param {array} photoUrls - Optional photo URLs
 * @param {string} workDate - Optional work date (defaults to today)
 * @returns {object} - Result
 */
function quickSendDailyUpdate(projectId, rawNotes, photoUrls, workDate, imagesData) {
  try {
    // Generate AI-enhanced summary
    const aiResult = generateDailySummaryWithAI(projectId, rawNotes, photoUrls);
    
    if (!aiResult.success) {
      return aiResult;
    }
    
    // Send email with enhanced summary
    const emailResult = sendDailyUpdateEmail(projectId, aiResult.enhancedSummary, photoUrls, workDate, imagesData || []);
    
    return {
      success: emailResult.success,
      aiUsed: aiResult.aiUsed,
      enhancedSummary: aiResult.enhancedSummary,
      originalText: aiResult.originalText
    };
    
  } catch (error) {
    Logger.log('❌ Error in quick send daily update: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

// ============================================================================
// SIGNED CONTRACT PDF GENERATION AND STORAGE
// ============================================================================

/**
 * Generate signed contract PDF and save to customer's Google Drive folder
 * Uses unified PDF generation function for consistency
 * @param {string} estimateId - The estimate ID
 * @param {object} estimateData - The estimate data
 * @param {string} signatureData - Base64 signature image
 * @param {string} printedName - Customer's printed name
 * @returns {string} - URL of saved PDF
 */
function generateAndSaveSignedContract(estimateId, estimateData, signatureData, printedName) {
  try {
    // Use unified PDF generation function
    return generateUnifiedPDF(estimateId, estimateData, {
      customerSignature: signatureData,
      customerPrintedName: printedName,
      isSignedContract: true
    });
  } catch (error) {
    Logger.log('❌ Error generating signed contract PDF: ' + error.toString());
    return '';
  }
}

/**
 * Legacy function - now uses unified PDF generation
 * @deprecated Use generateUnifiedPDF directly
 */
function generateAndSaveSignedContractLegacy(estimateId, estimateData, signatureData, printedName) {
  try {
    // Create a temporary Google Doc for the contract
    const docTitle = 'Signed Contract - ' + estimateData.customerName + ' - ' + estimateId;
    const doc = DocumentApp.create(docTitle);
    const body = doc.getBody();
    body.clear();
    
    // Header with logo (if available)
    // Try to get logo from Drive - you'll need to add your logo file ID
    // For now, using text header
    let para = body.appendParagraph(COMPANY_NAME);
    para.setHeading(DocumentApp.ParagraphHeading.TITLE);
    para.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    para.setFontSize(20);
    para.setBold(true);
    
    // Add tagline
    body.appendParagraph('INSTALLS • SERVICE • CONCRETE LEAK DETECTION')
      .setAlignment(DocumentApp.HorizontalAlignment.CENTER)
      .setFontSize(10);
    
    body.appendParagraph(COMPANY_PHONE)
      .setAlignment(DocumentApp.HorizontalAlignment.CENTER)
      .setFontSize(12)
      .setBold(true);
    
    body.appendParagraph('\n');
    
    para = body.appendParagraph('SIGNED CONTRACT AGREEMENT');
    para.setHeading(DocumentApp.ParagraphHeading.HEADING1);
    para.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    para.setFontSize(16);
    para.setBold(true);
    
    // Contract Details
    body.appendParagraph('\nContract #: ' + estimateId);
    body.appendParagraph('Date Approved: ' + new Date().toLocaleDateString());
    body.appendParagraph('\n');
    
    // Customer Info
    body.appendParagraph('CUSTOMER INFORMATION').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph('Name: ' + (estimateData.customerName || 'N/A'));
    body.appendParagraph('Email: ' + (estimateData.customerEmail || 'N/A'));
    body.appendParagraph('Phone: ' + (estimateData.customerPhone || 'N/A'));
    body.appendParagraph('Address: ' + (estimateData.customerAddress || 'N/A'));
    body.appendParagraph('\n');
    
    // Project Details
    body.appendParagraph('PROJECT SCOPE').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    const items = JSON.parse(estimateData.items || '[]');
    if (items.length > 0) {
      const table = body.appendTable();
      const headerRow = table.appendTableRow();
      headerRow.appendTableCell('Description');
      headerRow.appendTableCell('Qty');
      headerRow.appendTableCell('Price');
      headerRow.appendTableCell('Total');
      
      items.forEach(item => {
        const row = table.appendTableRow();
        row.appendTableCell(item.name || '');
        row.appendTableCell(String(item.quantity || 0));
        row.appendTableCell('$' + parseFloat(item.price || 0).toFixed(2));
        row.appendTableCell('$' + (parseFloat(item.quantity || 0) * parseFloat(item.price || 0)).toFixed(2));
      });
    }
    body.appendParagraph('\n');
    
    // Financial Summary
    body.appendParagraph('FINANCIAL SUMMARY').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    const subtotal = parseFloat(estimateData.subtotal || 0);
    const tax = parseFloat(estimateData.tax || 0);
    const discount = parseFloat(estimateData.discount || 0);
    const total = parseFloat(estimateData.total || 0);
    
    body.appendParagraph('Subtotal: $' + subtotal.toFixed(2));
    if (tax > 0) body.appendParagraph('Tax: $' + tax.toFixed(2));
    if (discount > 0) body.appendParagraph('Discount: -$' + discount.toFixed(2));
    const totalPara = body.appendParagraph('TOTAL CONTRACT AMOUNT: $' + total.toFixed(2));
    totalPara.setBold(true);
    totalPara.setFontSize(14);
    body.appendParagraph('\n');
    
    // Payment Schedule
    const paymentSchedule = estimateData.paymentSchedule ? 
      (typeof estimateData.paymentSchedule === 'string' ? JSON.parse(estimateData.paymentSchedule) : estimateData.paymentSchedule) : [];
    
    if (paymentSchedule.length > 0) {
      body.appendParagraph('PAYMENT SCHEDULE').setHeading(DocumentApp.ParagraphHeading.HEADING2);
      const schedTable = body.appendTable();
      const schedHeader = schedTable.appendTableRow();
      schedHeader.appendTableCell('Milestone');
      schedHeader.appendTableCell('Amount');
      schedHeader.appendTableCell('Percentage');
      
      paymentSchedule.forEach(milestone => {
        const row = schedTable.appendTableRow();
        row.appendTableCell(milestone.name || '');
        row.appendTableCell('$' + parseFloat(milestone.amount || 0).toFixed(2));
        row.appendTableCell(parseFloat(milestone.percent || 0).toFixed(1) + '%');
      });
      body.appendParagraph('\n');
    }
    
    // Terms and Conditions
    if (estimateData.terms) {
      body.appendParagraph('TERMS AND CONDITIONS').setHeading(DocumentApp.ParagraphHeading.HEADING2);
      body.appendParagraph(estimateData.terms);
      body.appendParagraph('\n');
    }
    
    // Agreement
    body.appendParagraph('CUSTOMER AGREEMENT').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph('By signing below, the customer agrees to:');
    body.appendListItem('The project scope and timeline as described above');
    body.appendListItem('The total contract amount and payment schedule');
    body.appendListItem('The terms and conditions outlined in this contract');
    body.appendListItem('Permission to begin work upon receipt of first payment');
    body.appendParagraph('\n');
    
    // Signature Section
    body.appendParagraph('CUSTOMER SIGNATURE').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    
    // Add signature image if available
    if (signatureData) {
      try {
        const base64Data = signatureData.replace(/^data:image\/\w+;base64,/, '');
        const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), 'image/png');
        const image = body.appendImage(blob);
        image.setWidth(200);
        image.setHeight(80);
      } catch (e) {
        Logger.log('Error adding signature image: ' + e.toString());
      }
    }
    
    body.appendParagraph('\nPrinted Name: ' + (printedName || 'N/A')).setBold(true);
    body.appendParagraph('Date Signed: ' + new Date().toLocaleString());
    
    // Add footer
    body.appendParagraph('\n\n');
    body.appendParagraph('─'.repeat(50))
      .setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    body.appendParagraph(COMPANY_NAME)
      .setAlignment(DocumentApp.HorizontalAlignment.CENTER)
      .setFontSize(10);
    body.appendParagraph(COMPANY_PHONE + ' | ' + COMPANY_EMAIL)
      .setAlignment(DocumentApp.HorizontalAlignment.CENTER)
      .setFontSize(9);
    
    // Verify document has content before saving
    const text = body.getText();
    if (!text || text.trim().length < 50) {
      Logger.log('⚠️ Warning: Document appears to be empty or incomplete. Text length: ' + (text ? text.length : 0));
      Logger.log('Document preview: ' + (text ? text.substring(0, 200) : 'No text'));
    } else {
      Logger.log('✅ Document content verified. Text length: ' + text.length);
    }
    
    // Ensure document is saved
    doc.saveAndClose();
    
    // Wait a moment for document to fully save and render
    Utilities.sleep(1000);
    
    // Convert to PDF
    const docFile = DriveApp.getFileById(doc.getId());
    const pdfBlob = docFile.getAs('application/pdf');
    pdfBlob.setName('Signed_Contract_' + estimateData.customerName.replace(/[^a-zA-Z0-9]/g, '_') + '_' + estimateId + '.pdf');
    
    // Get or create customer folder in main Drive folder
    const mainFolder = DriveApp.getFolderById(CUSTOMER_DRIVE_FOLDER_ID);
    const customerFolderName = estimateData.customerName + ' - ' + (estimateData.customerAddress || 'No Address');
    
    let customerFolder;
    const existingFolders = mainFolder.getFoldersByName(customerFolderName);
    if (existingFolders.hasNext()) {
      customerFolder = existingFolders.next();
    } else {
      customerFolder = mainFolder.createFolder(customerFolderName);
    }
    
    // Save PDF to customer folder
    const pdfFile = customerFolder.createFile(pdfBlob);
    pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // Delete temporary doc
    docFile.setTrashed(true);
    
    Logger.log('✅ Contract PDF saved to Drive: ' + customerFolderName);
    return pdfFile.getUrl();
    
  } catch (error) {
    Logger.log('❌ Error generating signed contract: ' + error.toString());
    throw error;
  }
}

// ============================================================================
// AUTOMATED INVOICING SYSTEM
// ============================================================================

/**
 * Get pending actions for admin
 * Returns estimates waiting for admin signature and invoices that need to be sent
 * @returns {object} - Pending actions list
 */
function getPendingActions() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(INVOICES_ESTIMATES_SHEET);
    
    if (!sheet) {
      return { success: false, error: 'Sheet not found' };
    }
    
    const dataRows = sheet.getDataRange().getValues();
    if (dataRows.length < 2) {
      return { success: true, pendingSignatures: [], pendingInvoices: [] };
    }
    
    const pendingSignatures = [];
    const pendingInvoices = [];
    
    // Find column indices
    const headers = dataRows[0];
    const idCol = headers.indexOf('ID') !== -1 ? headers.indexOf('ID') : 0;
    const typeCol = headers.indexOf('Type') !== -1 ? headers.indexOf('Type') : 1;
    const statusCol = headers.indexOf('Approval Status') !== -1 ? headers.indexOf('Approval Status') : -1;
    const jsonCol = headers.indexOf('JSON Data Part 1') !== -1 ? headers.indexOf('JSON Data Part 1') : 2;
    
    Logger.log('📋 Scanning ' + (dataRows.length - 1) + ' rows for pending actions...');
    
    for (let i = 1; i < dataRows.length; i++) {
      const row = dataRows[i];
      const invoiceId = row[idCol];
      const type = row[typeCol] || '';
      const columnApprovalStatus = statusCol !== -1 ? (row[statusCol] || '') : '';
      
      if (!invoiceId) continue;
      
      // Get JSON data
      let jsonData = {};
      try {
        const jsonPart1 = row[jsonCol] || '';
        const jsonPart2 = row[jsonCol + 1] || '';
        const jsonPart3 = row[jsonCol + 2] || '';
        const jsonStr = concatenateJsonChunks(jsonPart1, jsonPart2, jsonPart3) || jsonPart1;
        if (jsonStr && jsonStr.trim().startsWith('{')) {
          jsonData = JSON.parse(jsonStr);
        }
      } catch (e) {
        Logger.log('⚠️ Error parsing JSON for ' + invoiceId + ': ' + e.toString());
        continue;
      }
      
      // Get approval status from JSON (primary source) or column (fallback)
      const approvalStatus = jsonData.approvalStatus || columnApprovalStatus || '';
      const adminSigned = (
        jsonData.adminSigned === true ||
        jsonData.adminSigned === 'true' ||
        !!jsonData.adminSignatureData ||
        !!jsonData.adminSignature ||
        !!jsonData.adminSignedDate ||
        !!jsonData.contractPdfUrl ||
        jsonData.contractFullyExecuted === true
      );
      const hasCustomerSignature = !!(jsonData.signatureData || jsonData.signatureUrl || jsonData.printedName);
      
      // Check for estimates waiting for admin signature
      // Criteria:
      // 1. Must be an Estimate
      // 2. Customer must have approved (approvalStatus === 'Approved')
      // 3. Customer must have signed (has signature data)
      // 4. Admin must NOT have signed yet (!adminSigned)
      if (type === 'Estimate' || type === '') {
        const isApproved = approvalStatus === 'Approved';
        const needsAdminSignature = isApproved && hasCustomerSignature && !adminSigned;
        
        if (needsAdminSignature) {
          Logger.log('📝 Found contract awaiting admin signature: ' + invoiceId + ' - ' + (jsonData.customerName || 'Unknown'));
          pendingSignatures.push({
            id: invoiceId,
            customerName: jsonData.customerName || 'Unknown',
            customerEmail: jsonData.customerEmail || '',
            total: parseFloat(jsonData.total || 0),
            date: jsonData.date || '',
            approvalDate: jsonData.approvalDate || '',
            printedName: jsonData.printedName || '',
            contractPdfUrl: jsonData.contractPdfUrl || '',
            quoteNumber: jsonData.quoteNumber || jsonData.invoiceNumber || invoiceId,
            type: jsonData.type || type || 'Estimate'
          });
        }
      }
      
      // Check for invoices that need to be sent
      // (Invoices that are created but not yet sent)
      if (type === 'Invoice') {
        const invoiceSent = jsonData.invoiceSent === true || jsonData.invoiceSent === 'true';
        if (!invoiceSent) {
          Logger.log('📧 Found invoice ready to send: ' + invoiceId);
          pendingInvoices.push({
            id: invoiceId,
            customerName: jsonData.customerName || 'Unknown',
            customerEmail: jsonData.customerEmail || '',
            total: parseFloat(jsonData.total || 0),
            date: jsonData.date || '',
            invoiceNumber: jsonData.invoiceNumber || invoiceId,
            paymentSchedule: jsonData.paymentSchedule || []
          });
        }
      }
    }
    
    Logger.log('✅ Found ' + pendingSignatures.length + ' pending signatures and ' + pendingInvoices.length + ' pending invoices');
    
    return {
      success: true,
      pendingSignatures: pendingSignatures,
      pendingInvoices: pendingInvoices
    };
    
  } catch (error) {
    Logger.log('❌ Error getting pending actions: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Admin signs a contract
 * @param {string} estimateId - The estimate ID
 * @param {string} signatureData - Base64 signature image
 * @param {string} adminName - Admin's printed name
 * @returns {object} - Success status
 */
function adminSignContract(estimateId, signatureData, adminName) {
  try {
    const cleanEstimateId = String(estimateId || '').trim();
    if (!cleanEstimateId) {
      return { success: false, error: 'Missing estimate ID' };
    }

    // Get estimate data
    const estimate = getInvoiceEstimate(cleanEstimateId);
    if (!estimate.success) {
      return { success: false, error: 'Estimate not found' };
    }
    
    const estimateData = estimate.data;
    
    // Check if customer has already approved
    if (estimateData.approvalStatus !== 'Approved') {
      return { success: false, error: 'Customer has not approved this estimate yet' };
    }
    
    const alreadySigned = estimateData.adminSigned === true || String(estimateData.adminSigned).toLowerCase() === 'true';
    const nowIso = new Date().toISOString();

    // Hard-persist signed markers immediately so UI reflects success quickly.
    try {
      const forcePersist = forcePersistEstimateSignState(cleanEstimateId, {
        approvalStatus: 'Approved',
        adminSigned: true,
        adminSignature: signatureData || estimateData.adminSignature || '',
        adminSignatureData: signatureData || estimateData.adminSignatureData || '',
        adminPrintedName: adminName || estimateData.adminPrintedName || COMPANY_NAME,
        adminSignedDate: estimateData.adminSignedDate || nowIso,
        contractFullyExecuted: true,
        contractExecutionQueuedAt: nowIso,
        contractExecutionStatus: 'Queued',
        projectId: estimateData.projectId || '',
        adminSignedNotificationSent: estimateData.adminSignedNotificationSent === true || String(estimateData.adminSignedNotificationSent).toLowerCase() === 'true'
      });
      if (!forcePersist.success) {
        Logger.log('⚠️ forcePersistEstimateSignState failed: ' + forcePersist.error);
        return { success: false, error: 'Failed to persist signed state: ' + forcePersist.error };
      } else {
        Logger.log('✅ forcePersistEstimateSignState updated row ' + forcePersist.row);
      }
    } catch (persistErr) {
      Logger.log('⚠️ Error force-persisting signed state: ' + persistErr.toString());
      return { success: false, error: 'Failed to persist signed state: ' + persistErr.toString() };
    }

    // Queue heavy post-sign processing (PDF generation + notification + project safety checks).
    const queueRes = enqueueDeferredAdminCountersign_(cleanEstimateId);
    if (!queueRes.success) {
      Logger.log('⚠️ enqueueDeferredAdminCountersign_ failed: ' + queueRes.error);
      return { success: false, error: 'Signed, but failed to queue post-processing: ' + queueRes.error };
    }

    // Make sure worker trigger exists.
    ensureDeferredAdminCountersignTrigger_();
    
    Logger.log('✅ Admin signed contract (fast path queued): ' + cleanEstimateId + ', queueKey=' + queueRes.queueKey);
    
    return {
      success: true,
      message: alreadySigned
        ? 'Estimate already countersigned. Post-processing queued.'
        : 'Estimate countersigned successfully. Final PDF and notifications are processing in background.',
      deferred: true,
      queueKey: queueRes.queueKey,
      contractPdfUrl: estimateData.contractPdfUrl || '',
      projectId: estimateData.projectId || '',
      contractCreationRequired: true
    };
    
  } catch (error) {
    Logger.log('❌ Error in admin sign contract: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/** Deferred worker queue for admin countersign post-processing */
var DEFER_ADMIN_SIGN_PREFIX_ = 'DEFER_ADMIN_SIGN_';
var DEFER_ADMIN_SIGN_MAX_ATTEMPTS_ = 8;

/** Add/refresh a deferred admin-sign job keyed by estimate ID. */
function enqueueDeferredAdminCountersign_(estimateId) {
  try {
    var id = String(estimateId || '').trim();
    if (!id) return { success: false, error: 'Missing estimateId' };

    var props = PropertiesService.getScriptProperties();
    var key = DEFER_ADMIN_SIGN_PREFIX_ + id;
    var existingRaw = props.getProperty(key);
    var existing = {};
    if (existingRaw) {
      try { existing = JSON.parse(existingRaw); } catch (e) { existing = {}; }
    }

    var payload = {
      estimateId: id,
      queuedAt: new Date().toISOString(),
      attempts: parseInt(existing.attempts || 0, 10) || 0,
      lastError: ''
    };
    props.setProperty(key, JSON.stringify(payload));
    return { success: true, queueKey: key };
  } catch (error) {
    Logger.log('enqueueDeferredAdminCountersign_ error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/** Ensure time-driven trigger exists for deferred admin-sign jobs. */
function ensureDeferredAdminCountersignTrigger_() {
  try {
    var fnName = 'processDeferredAdminCountersignJobs_';
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction && triggers[i].getHandlerFunction() === fnName) {
        return true;
      }
    }
    ScriptApp.newTrigger(fnName).timeBased().everyMinutes(2).create();
    return true;
  } catch (error) {
    Logger.log('ensureDeferredAdminCountersignTrigger_ error: ' + error.toString());
    return false;
  }
}

/** Optional cleanup: remove worker trigger if queue empty. */
function cleanupDeferredAdminCountersignTriggerIfIdle_() {
  try {
    var props = PropertiesService.getScriptProperties().getProperties();
    var keys = Object.keys(props).filter(function(k) { return k.indexOf(DEFER_ADMIN_SIGN_PREFIX_) === 0; });
    if (keys.length > 0) return;

    var fnName = 'processDeferredAdminCountersignJobs_';
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction && triggers[i].getHandlerFunction() === fnName) {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }
  } catch (e) {
    Logger.log('cleanupDeferredAdminCountersignTriggerIfIdle_ error: ' + e.toString());
  }
}

/** Process one deferred admin-sign job; returns status object. */
function processOneDeferredAdminCountersignJob_(payload) {
  var estimateId = String((payload && payload.estimateId) || '').trim();
  if (!estimateId) return { success: false, done: true, error: 'Missing estimateId in payload' };

  var estResult = getInvoiceEstimate(estimateId);
  if (!estResult || !estResult.success || !estResult.data) {
    return { success: false, done: false, error: 'Estimate not found: ' + estimateId };
  }
  var estimateData = estResult.data;

  var adminSigned = estimateData.adminSigned === true || String(estimateData.adminSigned).toLowerCase() === 'true';
  if (!adminSigned) {
    return { success: false, done: true, error: 'Estimate is no longer marked admin-signed: ' + estimateId };
  }

  // Ensure project exists (safety net)
  var projectId = String(estimateData.projectId || '').trim();
  if (!projectId && typeof createProjectFromEstimate === 'function') {
    try {
      var pc = createProjectFromEstimate(estimateId);
      if (pc && pc.success && pc.projectId) {
        projectId = String(pc.projectId).trim();
        estimateData.projectId = projectId;
      } else if (pc && !pc.success) {
        Logger.log('⚠️ Deferred project create failed for ' + estimateId + ': ' + pc.error);
      }
    } catch (e) {
      Logger.log('⚠️ Deferred project create exception for ' + estimateId + ': ' + e.toString());
    }
  }

  // Generate or refresh fully executed PDF
  var contractPdfUrl = String(estimateData.contractPdfUrl || '').trim();
  if (!contractPdfUrl) {
    try {
      contractPdfUrl = generateAndSaveSignedContractWithAdminSignature(
        estimateId,
        estimateData,
        estimateData.signatureData || null,
        estimateData.printedName || '',
        estimateData.adminSignatureData || estimateData.adminSignature || '',
        estimateData.adminPrintedName || COMPANY_NAME
      ) || '';
    } catch (pdfErr) {
      return { success: false, done: false, error: 'PDF generation failed: ' + pdfErr.toString() };
    }
  }

  // Send fully executed notification once.
  var notificationSent = estimateData.adminSignedNotificationSent === true || String(estimateData.adminSignedNotificationSent).toLowerCase() === 'true';
  if (!notificationSent) {
    try {
      sendAdminSignedNotificationEmail(estimateData, contractPdfUrl);
      notificationSent = true;
    } catch (mailErr) {
      return { success: false, done: false, error: 'Notification send failed: ' + mailErr.toString() };
    }
  }

  // Persist final post-processing state.
  var persisted = forcePersistEstimateSignState(estimateId, {
    approvalStatus: 'Approved',
    adminSigned: true,
    contractFullyExecuted: true,
    contractPdfUrl: contractPdfUrl,
    projectId: projectId,
    adminSignedNotificationSent: notificationSent,
    contractExecutionStatus: 'Completed',
    contractExecutionCompletedAt: new Date().toISOString()
  });
  if (!persisted || !persisted.success) {
    return { success: false, done: false, error: 'Final persist failed: ' + (persisted && persisted.error ? persisted.error : 'unknown') };
  }

  return { success: true, done: true, estimateId: estimateId, projectId: projectId, contractPdfUrl: contractPdfUrl };
}

/** Time-driven worker: processes queued admin-sign jobs in small batches. */
function processDeferredAdminCountersignJobs_() {
  var propsSvc = PropertiesService.getScriptProperties();
  var all = propsSvc.getProperties();
  var keys = Object.keys(all).filter(function(k) { return k.indexOf(DEFER_ADMIN_SIGN_PREFIX_) === 0; });
  if (keys.length === 0) {
    cleanupDeferredAdminCountersignTriggerIfIdle_();
    return { success: true, processed: 0, remaining: 0 };
  }

  var processed = 0;
  var maxPerRun = 2;
  for (var i = 0; i < keys.length && processed < maxPerRun; i++) {
    var key = keys[i];
    var raw = all[key] || '';
    var payload = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch (e) {
      payload = {};
    }
    payload.estimateId = payload.estimateId || key.substring(DEFER_ADMIN_SIGN_PREFIX_.length);
    payload.attempts = parseInt(payload.attempts || 0, 10) || 0;

    try {
      var res = processOneDeferredAdminCountersignJob_(payload);
      if (res && res.success && res.done) {
        propsSvc.deleteProperty(key);
      } else {
        payload.attempts += 1;
        payload.lastError = (res && res.error) ? String(res.error) : 'Unknown processing error';
        payload.lastTriedAt = new Date().toISOString();

        if (payload.attempts >= DEFER_ADMIN_SIGN_MAX_ATTEMPTS_ || (res && res.done === true)) {
          Logger.log('❌ Deferred admin-sign job dropped after attempts: ' + key + ' error=' + payload.lastError);
          propsSvc.deleteProperty(key);
        } else {
          propsSvc.setProperty(key, JSON.stringify(payload));
        }
      }
    } catch (jobErr) {
      payload.attempts += 1;
      payload.lastError = String(jobErr);
      payload.lastTriedAt = new Date().toISOString();
      if (payload.attempts >= DEFER_ADMIN_SIGN_MAX_ATTEMPTS_) {
        Logger.log('❌ Deferred admin-sign exception dropped: ' + key + ' error=' + payload.lastError);
        propsSvc.deleteProperty(key);
      } else {
        propsSvc.setProperty(key, JSON.stringify(payload));
      }
    }

    processed++;
  }

  var remaining = Object.keys(propsSvc.getProperties()).filter(function(k) { return k.indexOf(DEFER_ADMIN_SIGN_PREFIX_) === 0; }).length;
  if (remaining === 0) cleanupDeferredAdminCountersignTriggerIfIdle_();
  return { success: true, processed: processed, remaining: remaining };
}

/**
 * Send invoice with Stripe checkout link
 * @param {string} invoiceId - The invoice ID
 * @param {string} milestoneId - Optional milestone ID for project invoices
 * @returns {object} - Success status and payment URL
 */
function sendInvoiceWithStripe(invoiceId, milestoneId) {
  try {
    // Get invoice data
    const invoice = getInvoiceEstimate(invoiceId);
    if (!invoice.success) {
      return { success: false, error: 'Invoice not found' };
    }
    
    const invoiceData = invoice.data;
    
    // Generate Stripe payment link
    const paymentResult = createStripePaymentLink(
      invoiceData.customerEmail,
      invoiceData.customerName,
      ('Invoice ' + (invoiceData.invoiceNumber || invoiceId)),
      parseFloat(invoiceData.total || 0),
      invoiceId,
      invoiceData.projectId || ''
    );
    
    if (!paymentResult.success) {
      return { success: false, error: 'Failed to create payment link: ' + paymentResult.error };
    }
    
    // Send invoice email with payment link
    const emailResult = sendInvoiceEmail(invoiceData, paymentResult.paymentUrl);
    
    if (!emailResult.success) {
      return { success: false, error: 'Failed to send email: ' + emailResult.error };
    }
    
    // Mark invoice as sent
    invoiceData.invoiceSent = true;
    invoiceData.invoiceSentDate = new Date().toISOString();
    invoiceData.stripePaymentUrl = paymentResult.paymentUrl;
    invoiceData.stripeSessionId = paymentResult.sessionId;
    
    saveInvoiceEstimate(invoiceData);
    
    Logger.log('✅ Invoice sent with Stripe link: ' + invoiceId);
    
    return {
      success: true,
      paymentUrl: paymentResult.paymentUrl,
      sessionId: paymentResult.sessionId
    };
    
  } catch (error) {
    Logger.log('❌ Error sending invoice with Stripe: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Send invoice email with payment link
 * @param {object} invoiceData - Invoice data
 * @param {string} paymentUrl - Stripe payment URL
 * @returns {object} - Success status
 */
function sendInvoiceEmail(invoiceData, paymentUrl) {
  try {
    const subject = 'Invoice Due: ' + (invoiceData.invoiceNumber || invoiceData.id) + ' - ' + COMPANY_NAME;
    
    const htmlBody = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">' +
      '<div style="background: linear-gradient(135deg, #0369a1 0%, #0ea5e9 100%); padding: 30px; text-align: center;"><h1 style="color: white; margin: 0; font-size: 28px;">Invoice Payment Due</h1></div>' +
      '<div style="padding: 30px; background: #f9fafb;">' +
        '<p style="font-size: 16px; margin-bottom: 20px;"><strong>' + invoiceData.customerName + ',</strong></p>' +
        '<p style="margin-bottom: 24px;">Your invoice is ready for payment. Please review the details below and complete payment using the secure link.</p>' +
        '<div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb;">' +
          '<p style="margin: 0 0 8px 0; font-size: 13px; color: #6b7280;"><strong>Invoice Number:</strong> ' + (invoiceData.invoiceNumber || invoiceData.id) + '</p>' +
          '<p style="margin: 0 0 8px 0; font-size: 13px; color: #6b7280;"><strong>Date:</strong> ' + (invoiceData.date || new Date().toLocaleDateString()) + '</p>' +
          '<p style="margin: 0; font-size: 20px; font-weight: 700; color: #111827;">Amount Due: $' + parseFloat(invoiceData.total || 0).toFixed(2) + '</p>' +
        '</div>' +
        '<div style="text-align: center; margin: 30px 0;">' +
          '<a href="' + paymentUrl + '" style="display: inline-block; padding: 18px 40px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-decoration: none; border-radius: 10px; font-weight: 800; font-size: 20px;">💳 Pay Invoice Now</a>' +
          '<p style="margin: 12px 0 0 0; font-size: 13px; color: #6b7280;">Secure payment powered by Stripe</p>' +
        '</div>' +
        '<p style="margin-top: 24px; font-size: 14px; color: #374151;">If you have any questions about this invoice, please contact us.</p>' +
        '<p style="margin-top: 20px; font-size: 14px; color: #6b7280;">' + COMPANY_NAME + '<br>' + COMPANY_PHONE + ' | ' + COMPANY_EMAIL + '</p>' +
      '</div></div>';
    
    MailApp.sendEmail({
      to: invoiceData.customerEmail,
      subject: subject,
      htmlBody: htmlBody
    });
    
    Logger.log('✅ Invoice email sent to: ' + invoiceData.customerEmail);
    
    return { success: true };
    
  } catch (error) {
    Logger.log('❌ Error sending invoice email: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Send notification email when admin signs contract
 * @param {object} estimateData - Estimate data
 * @param {string} contractPdfUrl - Contract PDF URL
 */
function sendAdminSignedNotificationEmail(estimateData, contractPdfUrl) {
  try {
    const subject = '✅ Contract Fully Executed - We\'re Ready to Begin! - ' + COMPANY_NAME;
    
    // Get payment schedule for first payment
    let paymentSchedule = [];
    if (estimateData.paymentSchedule) {
      if (typeof estimateData.paymentSchedule === 'string') {
        try {
          paymentSchedule = JSON.parse(estimateData.paymentSchedule);
        } catch (e) {
          Logger.log('⚠️ Error parsing payment schedule string: ' + e.toString());
          paymentSchedule = [];
        }
      } else if (Array.isArray(estimateData.paymentSchedule)) {
        paymentSchedule = estimateData.paymentSchedule;
      }
    }
    
    const firstPayment = paymentSchedule.length > 0 ? paymentSchedule[0] : null;
    
    // Generate Stripe payment link for first payment
    let stripePaymentLink = '';
    let stripeError = '';
    
    if (firstPayment && parseFloat(firstPayment.amount) > 0) {
      try {
        // Get project ID if available
        let projectId = '';
        try {
          const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
          const estimatesSheet = spreadsheet.getSheetByName('Invoices & Estimates');
          if (estimatesSheet) {
            const estimateRow = findEstimateRow(estimatesSheet, estimateData.id);
            if (estimateRow > 0 && estimatesSheet.getLastColumn() >= 8) {
              projectId = estimatesSheet.getRange(estimateRow, 8).getValue() || '';
            }
          }
        } catch (e) {
          Logger.log('⚠️ Could not get project ID: ' + e.toString());
        }
        
        Logger.log('💳 Attempting to create Stripe checkout for first payment: $' + parseFloat(firstPayment.amount));
        
        const paymentResult = createStripePaymentLink(
          estimateData.customerEmail,
          estimateData.customerName,
          (estimateData.id + ' - ' + firstPayment.name),
          parseFloat(firstPayment.amount),
          estimateData.id,
          projectId
        );
        
        Logger.log('💳 Stripe payment link result: ' + JSON.stringify(paymentResult));
        
        if (paymentResult && paymentResult.success && paymentResult.paymentUrl) {
          stripePaymentLink = paymentResult.paymentUrl;
          Logger.log('✅ Stripe payment link generated for first payment: ' + stripePaymentLink);
        } else {
          stripeError = paymentResult ? (paymentResult.error || 'Unknown error') : 'No response from Stripe';
          Logger.log('⚠️ Failed to generate Stripe link: ' + stripeError);
        }
      } catch (error) {
        stripeError = error.toString();
        Logger.log('⚠️ Error creating Stripe payment link: ' + stripeError);
      }
    }
    
    var firstName = (estimateData.customerName || 'there').split(' ')[0];
    var fmtTotal  = '$' + parseFloat(estimateData.total || 0).toFixed(2);
    var estRef    = estimateData.quoteNumber || estimateData.invoiceNumber || estimateData.id || '';

    var contractBtnHtml = contractPdfUrl
      ? '<div style="text-align:center;margin:24px 0;"><a href="' + contractPdfUrl + '" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#0369a1 0%,#0284c7 100%);color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;">📄 Download Executed Contract</a></div>'
      : '';

    var payBlock2 = '';
    if (firstPayment && parseFloat(firstPayment.amount) > 0) {
      var stripeBlock2 = (stripePaymentLink && stripePaymentLink.length > 0)
        ? '<a href="' + stripePaymentLink + '" style="display:inline-block;padding:16px 40px;background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:#fff;text-decoration:none;border-radius:10px;font-weight:800;font-size:18px;">💳 Pay Now Online</a><p style="margin:10px 0 0;font-size:12px;color:#6b7280;">Secure payment powered by Stripe</p>'
        : '<div style="background:#fff;padding:16px;border-radius:8px;margin-top:12px;"><p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#78350f;">Payment Options:</p><p style="margin:0 0 4px;font-size:13px;color:#78350f;">✓ Pay by check at our first project meeting</p><p style="margin:0;font-size:13px;color:#78350f;">✓ Call ' + COMPANY_PHONE + ' to arrange payment</p></div>';
      payBlock2 = '<div style="background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);padding:24px;border-radius:12px;margin:24px 0;border:3px solid #f59e0b;text-align:center;">'
        + '<p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#78350f;">' + (firstPayment.name || 'First Payment') + ' — Due Now</p>'
        + '<p style="margin:0 0 20px;font-size:38px;font-weight:900;color:#92400e;">$' + parseFloat(firstPayment.amount).toFixed(2) + '</p>'
        + stripeBlock2 + '</div>';
    }

    const htmlBody = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>'
      + '<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;">'
      + '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f9fafb;">'
      + '<tr><td align="center" style="padding:40px 20px;">'
      + '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;background:#fff;border-radius:16px;box-shadow:0 4px 12px rgba(0,0,0,.1);overflow:hidden;">'

      // Header with logo + pool banner
      + '<tr><td style="padding:0;background:#0369a1;">'
      + '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-image:url(\'https://media.angi.com/s3fs-public/BOY-WA~1.jpeg\');background-size:cover;background-position:center;">'
      + '<tr><td style="background:linear-gradient(135deg,rgba(3,105,161,.75) 0%,rgba(2,132,199,.65) 100%);padding:28px 40px;text-align:center;">'
      + '<img src="https://cdn.prod.website-files.com/6931dc4e8e97334e195432df/6993ce0abcd54d3520799318_IMG_1763-p-500.jpg" alt="A Quality Pool Company" style="max-width:130px;height:auto;border-radius:8px;margin-bottom:14px;display:block;margin-left:auto;margin-right:auto;">'
      + '<h1 style="margin:0;color:#fff;font-size:24px;font-weight:800;text-shadow:0 2px 6px rgba(0,0,0,.3);">✅ Contract Fully Executed!</h1>'
      + '<p style="margin:6px 0 0;color:rgba(255,255,255,.9);font-size:14px;">Both parties have signed — you\'re all set!</p>'
      + '</td></tr></table></td></tr>'

      // Content
      + '<tr><td style="padding:40px;">'
      + '<p style="margin:0 0 20px;font-size:16px;color:#1f2937;">Hi <strong>' + firstName + '</strong>,</p>'
      + '<p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">Great news — your estimate <strong>' + estRef + '</strong> has been fully executed and signed by both parties. We\'re looking forward to getting started on your project!</p>'

      // Contract summary box
      + '<div style="background:#f0fdf4;border:2px solid #10b981;border-radius:10px;padding:20px;margin-bottom:24px;">'
      + '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr>'
      + '<td><div style="font-size:13px;color:#6b7280;margin-bottom:4px;">Estimate #</div><div style="font-size:16px;font-weight:700;color:#1f2937;">' + estRef + '</div></td>'
      + '<td style="text-align:right;"><div style="font-size:13px;color:#6b7280;margin-bottom:4px;">Contract Amount</div><div style="font-size:22px;font-weight:800;color:#059669;">' + fmtTotal + '</div></td>'
      + '</tr></table></div>'

      + contractBtnHtml
      + payBlock2

      // What's next
      + '<div style="background:#eff6ff;border-left:4px solid #3b82f6;border-radius:8px;padding:20px;margin:24px 0;">'
      + '<p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#1e40af;">📋 What Happens Next</p>'
      + '<p style="margin:0 0 6px;font-size:14px;color:#374151;">✓ We\'ll contact you within 24-48 hours to schedule your project start date.</p>'
      + '<p style="margin:0 0 6px;font-size:14px;color:#374151;">✓ You\'ll receive daily work updates by email throughout the project.</p>'
      + '<p style="margin:0;font-size:14px;color:#374151;">✓ Each invoice will be sent via email with a secure payment link.</p>'
      + '</div>'

      + '<p style="margin:0;font-size:14px;color:#6b7280;">Questions? Call <a href="tel:5027069172" style="color:#0284c7;text-decoration:none;">' + COMPANY_PHONE + '</a> or reply to this email.</p>'
      + '</td></tr>'

      // Footer
      + '<tr><td style="background:#f9fafb;padding:24px 40px;border-top:1px solid #e5e7eb;">'
      + '<p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#374151;">' + COMPANY_NAME + '</p>'
      + '<p style="margin:0 0 4px;font-size:13px;color:#6b7280;">📞 <a href="tel:5027069172" style="color:#0284c7;text-decoration:none;">' + COMPANY_PHONE + '</a></p>'
      + '<p style="margin:0;font-size:13px;color:#6b7280;">📧 <a href="mailto:' + COMPANY_EMAIL + '" style="color:#0284c7;text-decoration:none;">' + COMPANY_EMAIL + '</a></p>'
      + '</td></tr>'
      + '</table>'
      + '<p style="margin:20px 0 0;text-align:center;color:#6b7280;font-size:12px;">© ' + new Date().getFullYear() + ' A Quality Pool Company. All rights reserved.</p>'
      + '</td></tr></table></body></html>';
    
    // Get contract PDF as attachment
    const pdfSourceUrl = contractPdfUrl || estimateData.contractPdfUrl || '';
    let attachments = [];
    if (pdfSourceUrl) {
      try {
        let fileId = null;
        const driveMatch = pdfSourceUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (driveMatch) {
          fileId = driveMatch[1];
        } else {
          // Fallback for URLs like open?id=... or any direct-id pattern
          const idMatch = pdfSourceUrl.match(/[a-zA-Z0-9_-]{25,}/);
          if (idMatch) fileId = idMatch[0];
        }
        
        if (fileId) {
          const pdfFile = DriveApp.getFileById(fileId);
          const pdfBlob = pdfFile.getBlob();
          pdfBlob.setName('Fully_Executed_Contract_' + estimateData.customerName + '_' + estimateData.id + '.pdf');
          attachments.push(pdfBlob);
        } else {
          Logger.log('⚠️ Could not parse Drive file ID from contract URL: ' + pdfSourceUrl);
        }
      } catch (e) {
        Logger.log('⚠️ Could not attach PDF: ' + e.toString());
      }
    }
    
    const emailOptions = {
      to: estimateData.customerEmail,
      subject: subject,
      htmlBody: htmlBody
    };
    
    if (attachments.length > 0) {
      emailOptions.attachments = attachments;
    }
    
    MailApp.sendEmail(emailOptions);
    
    Logger.log('✅ Admin signed notification sent to: ' + estimateData.customerEmail);
    
  } catch (error) {
    Logger.log('❌ Error sending admin signed notification: ' + error.toString());
  }
}

/**
 * Generate signed contract PDF with both customer and admin signatures
 * Uses unified PDF generation function for consistency
 */
function generateAndSaveSignedContractWithAdminSignature(estimateId, estimateData, customerSignatureData, customerPrintedName, adminSignatureData, adminPrintedName) {
  try {
    // Use unified PDF generation function
    return generateUnifiedPDF(estimateId, estimateData, {
      customerSignature: customerSignatureData,
      customerPrintedName: customerPrintedName,
      adminSignature: adminSignatureData,
      adminPrintedName: adminPrintedName,
      signedContractImageUrl: estimateData.signedContractImageUrl || '',
      isSignedContract: true
    });
  } catch (error) {
    Logger.log('❌ Error generating fully executed contract PDF: ' + error.toString());
    return '';
  }
}

/**
 * Legacy function - now uses unified PDF generation
 * @deprecated Use generateUnifiedPDF directly
 */
function generateAndSaveSignedContractWithAdminSignatureLegacy(estimateId, estimateData, customerSignatureData, customerPrintedName, adminSignatureData, adminPrintedName) {
  try {
    const customerName = estimateData.customerName || 'Unknown Customer';
    const fileName = 'Fully_Executed_Contract_' + customerName.replace(/[^a-zA-Z0-9]/g, '_') + '_' + estimateId + '.pdf';

    // Get or create customer folder in main Drive folder
    const mainFolder = DriveApp.getFolderById(CUSTOMER_DRIVE_FOLDER_ID);
    const customerFolderName = customerName + ' - ' + (estimateData.customerAddress || 'No Address');
    
    let customerFolder;
    const existingFolders = mainFolder.getFoldersByName(customerFolderName);
    if (existingFolders.hasNext()) {
      customerFolder = existingFolders.next();
    } else {
      customerFolder = mainFolder.createFolder(customerFolderName);
    }
    
    const doc = DocumentApp.create('Temp Fully Executed Contract - ' + estimateId);
    const body = doc.getBody();
    body.clear();

    // Header (same as before)
    let para = body.appendParagraph(COMPANY_NAME);
    para.setHeading(DocumentApp.ParagraphHeading.TITLE);
    para.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    para.setFontSize(20);
    para.setBold(true);
    
    body.appendParagraph('INSTALLS • SERVICE • CONCRETE LEAK DETECTION')
      .setAlignment(DocumentApp.HorizontalAlignment.CENTER)
      .setFontSize(10);
    
    body.appendParagraph(COMPANY_PHONE)
      .setAlignment(DocumentApp.HorizontalAlignment.CENTER)
      .setFontSize(12)
      .setBold(true);
    
    body.appendParagraph('\n');
    
    para = body.appendParagraph('FULLY EXECUTED CONTRACT AGREEMENT');
    para.setHeading(DocumentApp.ParagraphHeading.HEADING1);
    para.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    para.setFontSize(16);
    para.setBold(true);
    
    // Contract Details
    body.appendParagraph('\nContract #: ' + estimateId);
    body.appendParagraph('Date Approved: ' + (estimateData.approvalDate ? new Date(estimateData.approvalDate).toLocaleDateString() : new Date().toLocaleDateString()));
    body.appendParagraph('\n');
    
    // Customer Info
    body.appendParagraph('CUSTOMER INFORMATION').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph('Name: ' + (estimateData.customerName || 'N/A'));
    body.appendParagraph('Email: ' + (estimateData.customerEmail || 'N/A'));
    body.appendParagraph('Phone: ' + (estimateData.customerPhone || 'N/A'));
    body.appendParagraph('Address: ' + (estimateData.customerAddress || 'N/A'));
    body.appendParagraph('\n');
    
    // Project Details
    body.appendParagraph('PROJECT SCOPE').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    const items = JSON.parse(estimateData.items || '[]');
    if (items.length > 0) {
      const table = body.appendTable();
      const headerRow = table.appendTableRow();
      headerRow.appendTableCell('Description');
      headerRow.appendTableCell('Qty');
      headerRow.appendTableCell('Price');
      headerRow.appendTableCell('Total');
      
      items.forEach(item => {
        const row = table.appendTableRow();
        row.appendTableCell(item.name || '');
        row.appendTableCell(String(item.quantity || 0));
        row.appendTableCell('$' + parseFloat(item.price || 0).toFixed(2));
        row.appendTableCell('$' + (parseFloat(item.quantity || 0) * parseFloat(item.price || 0)).toFixed(2));
      });
    }
    body.appendParagraph('\n');
    
    // Financial Summary
    body.appendParagraph('FINANCIAL SUMMARY').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    const subtotal = parseFloat(estimateData.subtotal || 0);
    const tax = parseFloat(estimateData.tax || 0);
    const discount = parseFloat(estimateData.discount || 0);
    const total = parseFloat(estimateData.total || 0);
    
    body.appendParagraph('Subtotal: $' + subtotal.toFixed(2));
    if (tax > 0) body.appendParagraph('Tax: $' + tax.toFixed(2));
    if (discount > 0) body.appendParagraph('Discount: -$' + discount.toFixed(2));
    const totalPara = body.appendParagraph('TOTAL CONTRACT AMOUNT: $' + total.toFixed(2));
    totalPara.setBold(true);
    totalPara.setFontSize(14);
    body.appendParagraph('\n');
    
    // Payment Schedule
    const paymentSchedule = estimateData.paymentSchedule ? 
      (typeof estimateData.paymentSchedule === 'string' ? JSON.parse(estimateData.paymentSchedule) : estimateData.paymentSchedule) : [];
    
    if (paymentSchedule.length > 0) {
      body.appendParagraph('PAYMENT SCHEDULE').setHeading(DocumentApp.ParagraphHeading.HEADING2);
      const schedTable = body.appendTable();
      const schedHeader = schedTable.appendTableRow();
      schedHeader.appendTableCell('Milestone');
      schedHeader.appendTableCell('Amount');
      schedHeader.appendTableCell('Percentage');
      
      paymentSchedule.forEach(milestone => {
        const row = schedTable.appendTableRow();
        row.appendTableCell(milestone.name || '');
        row.appendTableCell('$' + parseFloat(milestone.amount || 0).toFixed(2));
        row.appendTableCell(parseFloat(milestone.percent || 0).toFixed(1) + '%');
      });
      body.appendParagraph('\n');
    }
    
    // Terms and Conditions
    if (estimateData.terms) {
      body.appendParagraph('TERMS AND CONDITIONS').setHeading(DocumentApp.ParagraphHeading.HEADING2);
      body.appendParagraph(estimateData.terms);
      body.appendParagraph('\n');
    }
    
    // Agreement
    body.appendParagraph('CUSTOMER AGREEMENT').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph('By signing below, the customer agrees to:');
    body.appendListItem('The project scope and timeline as described above');
    body.appendListItem('The total contract amount and payment schedule');
    body.appendListItem('The terms and conditions outlined in this contract');
    body.appendListItem('Permission to begin work upon receipt of first payment');
    body.appendParagraph('\n');
    
    // Add customer signature
    body.appendParagraph('\nCUSTOMER SIGNATURE').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    if (customerSignatureData) {
      try {
        const base64Data = customerSignatureData.replace(/^data:image\/\w+;base64,/, '');
        const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), 'image/png');
        const image = body.appendImage(blob);
        image.setWidth(200);
        image.setHeight(80);
      } catch (e) {
        Logger.log('Error adding customer signature: ' + e.toString());
      }
    }
    body.appendParagraph('Printed Name: ' + (customerPrintedName || customerName)).setBold(true);
    body.appendParagraph('Date Signed: ' + (estimateData.approvalDate ? new Date(estimateData.approvalDate).toLocaleString() : 'N/A'));
    
    // Add uploaded signed contract image if available
    if (estimateData.signedContractImageUrl) {
      try {
        body.appendParagraph('\nUPLOADED SIGNED CONTRACT').setHeading(DocumentApp.ParagraphHeading.HEADING2);
        body.appendParagraph('Below is the uploaded image of the signed contract:');
        
        // Get image from Drive
        const driveMatch = estimateData.signedContractImageUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (driveMatch) {
          const fileId = driveMatch[1];
          const imageFile = DriveApp.getFileById(fileId);
          const imageBlob = imageFile.getBlob();
          const image = body.appendImage(imageBlob);
          
          // Scale image to fit page width (max 500px wide)
          const maxWidth = 500;
          const originalWidth = image.getWidth();
          if (originalWidth > maxWidth) {
            const ratio = maxWidth / originalWidth;
            image.setWidth(maxWidth);
            image.setHeight(image.getHeight() * ratio);
          }
          
          body.appendParagraph('Uploaded: ' + (estimateData.signedContractImageUploaded ? new Date(estimateData.signedContractImageUploaded).toLocaleString() : 'N/A'));
        }
      } catch (e) {
        Logger.log('Error adding uploaded contract image: ' + e.toString());
      }
    }
    
    // Add admin signature
    body.appendParagraph('\nCOMPANY SIGNATURE').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    if (adminSignatureData) {
      try {
        const base64Data = adminSignatureData.replace(/^data:image\/\w+;base64,/, '');
        const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), 'image/png');
        const image = body.appendImage(blob);
        image.setWidth(200);
        image.setHeight(80);
      } catch (e) {
        Logger.log('Error adding admin signature: ' + e.toString());
      }
    }
    body.appendParagraph('Printed Name: ' + (adminPrintedName || COMPANY_NAME)).setBold(true);
    body.appendParagraph('Date Signed: ' + new Date().toLocaleString());
    
    // Footer
    body.appendParagraph('\n\n');
    body.appendParagraph('─'.repeat(50))
      .setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    body.appendParagraph(COMPANY_NAME)
      .setAlignment(DocumentApp.HorizontalAlignment.CENTER)
      .setFontSize(10);
    body.appendParagraph(COMPANY_PHONE + ' | ' + COMPANY_EMAIL)
      .setAlignment(DocumentApp.HorizontalAlignment.CENTER)
      .setFontSize(9);
    
    // Verify document has content before saving
    const text = body.getText();
    if (!text || text.trim().length < 50) {
      Logger.log('⚠️ Warning: Document appears to be empty or incomplete. Text length: ' + (text ? text.length : 0));
      Logger.log('Document preview: ' + (text ? text.substring(0, 200) : 'No text'));
    } else {
      Logger.log('✅ Document content verified. Text length: ' + text.length);
    }
    
    doc.saveAndClose();
    
    // Wait for document to fully save and render
    Utilities.sleep(1500);
    
    const docFile = DriveApp.getFileById(doc.getId());
    
    // Verify document exists and has content
    if (!docFile) {
      Logger.log('❌ Error: Document file not found after save');
      return '';
    }
    
    const pdfBlob = docFile.getAs('application/pdf');
    pdfBlob.setName(fileName);

    const pdfFile = customerFolder.createFile(pdfBlob);
    pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // Delete temporary doc
    docFile.setTrashed(true);

    Logger.log('✅ Fully executed contract PDF saved: ' + pdfFile.getUrl());
    Logger.log('✅ PDF file size: ' + pdfBlob.getBytes().length + ' bytes');
    
    return pdfFile.getUrl();

  } catch (error) {
    Logger.log('❌ Error generating fully executed contract: ' + error.toString());
    return '';
  }
}

/**
 * Record payment received
 * @param {string} invoiceId - Invoice ID
 * @param {number} amount - Amount paid
 * @param {string} paymentMethod - Payment method (Stripe, Check, Cash, etc.)
 * @param {string} paymentDate - Payment date
 * @param {string} notes - Optional notes
 * @returns {object} - Success status
 */
function recordPayment(invoiceId, amount, paymentMethod, paymentDate, notes) {
  try {
    // Get invoice data
    const invoice = getInvoiceEstimate(invoiceId);
    if (!invoice.success) {
      return { success: false, error: 'Invoice not found' };
    }
    
    const invoiceData = invoice.data;
    
    // Initialize payments array if it doesn't exist
    if (!invoiceData.payments) {
      invoiceData.payments = [];
    }
    
    // Add payment record
    const payment = {
      id: 'PAY-' + new Date().getTime(),
      amount: parseFloat(amount),
      method: paymentMethod || 'Unknown',
      date: paymentDate || new Date().toISOString(),
      notes: notes || '',
      recordedDate: new Date().toISOString()
    };
    
    invoiceData.payments.push(payment);
    
    // Calculate total paid
    const totalPaid = invoiceData.payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    invoiceData.totalPaid = totalPaid;
    invoiceData.paymentStatus = totalPaid >= parseFloat(invoiceData.total || 0) ? 'Paid' : 'Partially Paid';
    
    // Save updated invoice
    saveInvoiceEstimate(invoiceData);
    
    Logger.log('✅ Payment recorded: $' + amount + ' for invoice ' + invoiceId);
    
    return {
      success: true,
      totalPaid: totalPaid,
      paymentStatus: invoiceData.paymentStatus
    };
    
  } catch (error) {
    Logger.log('❌ Error recording payment: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Upload signed contract image
 * @param {string} estimateId - The estimate ID
 * @param {string} imageData - Base64 image data (data URL)
 * @param {string} imageName - Optional image name
 * @returns {object} - Success status and image URL
 */
function uploadSignedContractImage(estimateId, imageData, imageName) {
  try {
    // Get estimate data
    const estimate = getInvoiceEstimate(estimateId);
    if (!estimate.success) {
      return { success: false, error: 'Estimate not found' };
    }
    
    const estimateData = estimate.data;
    const customerName = estimateData.customerName || 'Unknown Customer';
    
    // Get or create customer folder
    const mainFolder = DriveApp.getFolderById(CUSTOMER_DRIVE_FOLDER_ID);
    const customerFolderName = customerName + ' - ' + (estimateData.customerAddress || 'No Address');
    
    let customerFolder;
    const existingFolders = mainFolder.getFoldersByName(customerFolderName);
    if (existingFolders.hasNext()) {
      customerFolder = existingFolders.next();
    } else {
      customerFolder = mainFolder.createFolder(customerFolderName);
    }
    
    // Decode base64 image
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), 'image/png', imageName || ('Signed_Contract_' + estimateId + '.png'));
    
    // Save image to customer folder
    const imageFile = customerFolder.createFile(blob);
    imageFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // Update estimate with image URL
    estimateData.signedContractImageUrl = imageFile.getUrl();
    estimateData.signedContractImageUploaded = new Date().toISOString();
    
    saveInvoiceEstimate(estimateData);
    
    Logger.log('✅ Signed contract image uploaded: ' + imageFile.getUrl());
    
    return {
      success: true,
      imageUrl: imageFile.getUrl(),
      message: 'Signed contract image uploaded successfully'
    };
    
  } catch (error) {
    Logger.log('❌ Error uploading signed contract image: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Send payment reminder email for a specific milestone
 */
function sendPaymentReminder(projectId, milestoneId) {
  try {
    Logger.log('📧 sendPaymentReminder called with projectId: ' + projectId + ', milestoneId: ' + milestoneId);
    
    if (!projectId || !milestoneId) {
      Logger.log('❌ Missing projectId or milestoneId');
      return { success: false, error: 'Project ID and Milestone ID are required' };
    }
    
    const project = getProject(projectId);
    if (!project.success) {
      Logger.log('❌ Project not found: ' + projectId);
      return { success: false, error: 'Project not found' };
    }
    
    const projectData = project.project;
    Logger.log('✅ Project found: ' + projectId);
    let paymentSchedule = projectData.paymentSchedule || [];
    if (typeof paymentSchedule === 'string') {
      try { paymentSchedule = JSON.parse(paymentSchedule || '[]'); } catch (e) { paymentSchedule = []; }
    }
    if (!Array.isArray(paymentSchedule) && paymentSchedule && typeof paymentSchedule === 'object') {
      paymentSchedule = Object.values(paymentSchedule);
    }
    if (!Array.isArray(paymentSchedule)) paymentSchedule = [];
    const milestone = paymentSchedule.find(function(m) {
      return String(m && m.id || '').trim() === String(milestoneId || '').trim();
    });
    
    if (!milestone) {
      return { success: false, error: 'Milestone not found' };
    }
    
    // Get milestone invoice if it exists
    const milestoneStatus = projectData.milestoneStatus && projectData.milestoneStatus[milestoneId];
    const invoiceId = milestoneStatus && milestoneStatus.invoiceId;
    
    // Generate Stripe payment link
    let stripePaymentLink = '';
    try {
      const paymentResult = createStripePaymentLink(
        projectData.customerEmail,
        projectData.customerName,
        (projectId + ' - ' + milestone.name),
        parseFloat(milestone.amount),
        invoiceId || projectId,
        projectId
      );
      
      if (paymentResult.success && paymentResult.paymentUrl) {
        stripePaymentLink = paymentResult.paymentUrl;
      }
    } catch (e) {
      Logger.log('⚠️ Error creating Stripe link: ' + e.toString());
    }
    
    const subject = 'Payment Reminder - ' + milestone.name + ' - ' + COMPANY_NAME;
    var stripeLinkBlock = stripePaymentLink ? '<a href="' + stripePaymentLink + '" style="display: inline-block; padding: 18px 36px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-decoration: none; border-radius: 10px; font-weight: 800; font-size: 20px;">💳 Pay Now Online</a>' : '';
    const htmlBody = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">' +
      '<div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; text-align: center;"><h1 style="color: white; margin: 0; font-size: 28px;">Payment Reminder</h1></div>' +
      '<div style="padding: 30px; background: #f9fafb;">' +
        '<p style="font-size: 16px; margin-bottom: 20px;"><strong>' + projectData.customerName + ',</strong></p>' +
        '<p style="margin-bottom: 24px;">This is a friendly reminder that payment is due for:</p>' +
        '<div style="background: white; padding: 24px; border-radius: 12px; margin: 24px 0; border: 2px solid #f59e0b; text-align: center;">' +
          '<p style="margin: 0 0 10px 0; font-size: 18px; font-weight: 700; color: #78350f;">' + milestone.name + '</p>' +
          '<p style="margin: 0 0 24px 0; font-size: 42px; font-weight: 800; color: #92400e;">$' + parseFloat(milestone.amount).toFixed(2) + '</p>' + stripeLinkBlock +
          '<p style="margin: 15px 0 0 0; font-size: 14px; color: #78350f;">Or pay by check/cash at our next project meeting</p>' +
        '</div>' +
        '<p style="margin-top: 20px; font-size: 14px; color: #6b7280;">Questions? Call ' + COMPANY_PHONE + ' or reply to this email.</p>' +
      '</div></div>';
    
    MailApp.sendEmail({
      to: projectData.customerEmail,
      subject: subject,
      htmlBody: htmlBody
    });
    
    Logger.log('✅ Payment reminder sent for milestone: ' + milestone.name);
    return { success: true };
    
  } catch (error) {
    Logger.log('❌ Error sending payment reminder: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Send payment reminder for all outstanding payments in a project
 */
function sendProjectPaymentReminder(projectId) {
  try {
    const project = getProject(projectId);
    if (!project.success) {
      return { success: false, error: 'Project not found' };
    }
    
    const projectData = project.project;
    const paymentSchedule = projectData.paymentSchedule || [];
    const milestoneStatus = projectData.milestoneStatus || {};
    
    // Find all unpaid milestones
    const unpaidMilestones = paymentSchedule.filter(milestone => {
      const status = milestoneStatus[milestone.id];
      return status && status.invoiced && !status.paid;
    });
    
    if (unpaidMilestones.length === 0) {
      return { success: false, error: 'No outstanding payments found' };
    }
    
    const totalOutstanding = unpaidMilestones.reduce((sum, m) => sum + parseFloat(m.amount || 0), 0);
    
    // Generate Stripe payment links for all unpaid milestones
    let paymentLinks = [];
    unpaidMilestones.forEach(milestone => {
      try {
        const status = milestoneStatus[milestone.id];
        const invoiceId = status && status.invoiceId;
        const paymentResult = createStripePaymentLink(
          projectData.customerEmail,
          projectData.customerName,
          (projectId + ' - ' + milestone.name),
          parseFloat(milestone.amount),
          invoiceId || projectId,
          projectId
        );
        
        if (paymentResult.success && paymentResult.paymentUrl) {
          paymentLinks.push({
            name: milestone.name,
            amount: milestone.amount,
            url: paymentResult.paymentUrl
          });
        }
      } catch (e) {
        Logger.log('⚠️ Error creating Stripe link for ' + milestone.name + ': ' + e.toString());
      }
    });
    
    const subject = 'Payment Reminder - Outstanding Payments - ' + COMPANY_NAME;
    let paymentLinksHtml = '';
    if (paymentLinks.length > 0) {
      paymentLinks.forEach(function(link) {
        paymentLinksHtml += '<div style="background: white; padding: 16px; border-radius: 8px; margin: 12px 0; border: 1px solid #e5e7eb;">' +
          '<div style="display: flex; justify-content: space-between; align-items: center;">' +
            '<div><div style="font-weight: 600; color: #111827;">' + link.name + '</div><div style="font-size: 18px; font-weight: 700; color: #0369a1; margin-top: 4px;">$' + parseFloat(link.amount).toFixed(2) + '</div></div>' +
            '<a href="' + link.url + '" style="padding: 10px 20px; background: #10b981; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">Pay Now</a>' +
          '</div></div>';
      });
    }
    
    const htmlBody = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">' +
      '<div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; text-align: center;"><h1 style="color: white; margin: 0; font-size: 28px;">Payment Reminder</h1></div>' +
      '<div style="padding: 30px; background: #f9fafb;">' +
        '<p style="font-size: 16px; margin-bottom: 20px;"><strong>' + projectData.customerName + ',</strong></p>' +
        '<p style="margin-bottom: 24px;">This is a friendly reminder that you have <strong>' + unpaidMilestones.length + '</strong> outstanding payment(s) totaling:</p>' +
        '<div style="background: white; padding: 24px; border-radius: 12px; margin: 24px 0; border: 2px solid #f59e0b; text-align: center;">' +
          '<p style="margin: 0 0 24px 0; font-size: 42px; font-weight: 800; color: #92400e;">$' + totalOutstanding.toFixed(2) + '</p>' + paymentLinksHtml +
        '</div>' +
        '<p style="margin: 20px 0; font-size: 14px; color: #6b7280;">You can also pay by check or cash at our next project meeting.</p>' +
        '<p style="margin-top: 20px; font-size: 14px; color: #6b7280;">Questions? Call ' + COMPANY_PHONE + ' or reply to this email.</p>' +
      '</div></div>';
    
    MailApp.sendEmail({
      to: projectData.customerEmail,
      subject: subject,
      htmlBody: htmlBody
    });
    
    Logger.log('✅ Payment reminder sent for ' + unpaidMilestones.length + ' outstanding payments');
    return { success: true, unpaidCount: unpaidMilestones.length };
    
  } catch (error) {
    Logger.log('❌ Error sending project payment reminder: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Record manual payment for a project milestone
 */
function recordManualPayment(projectId, milestoneId, amount, paymentMethod, notes, paymentDate) {
  try {
    const project = getProject(projectId);
    if (!project.success) {
      return { success: false, error: 'Project not found' };
    }
    
    const projectData = project.project;
    let paymentSchedule = projectData.paymentSchedule || [];
    if (typeof paymentSchedule === 'string') {
      try { paymentSchedule = JSON.parse(paymentSchedule || '[]'); } catch (e) { paymentSchedule = []; }
    }
    if (!Array.isArray(paymentSchedule) && paymentSchedule && typeof paymentSchedule === 'object') {
      paymentSchedule = Object.values(paymentSchedule);
    }
    if (!Array.isArray(paymentSchedule)) paymentSchedule = [];
    
    // If milestoneId is provided, validate it exists
    let milestone = null;
    if (milestoneId && milestoneId.trim() !== '') {
      milestone = paymentSchedule.find(function(m) {
        return String(m && m.id || '').trim() === String(milestoneId || '').trim();
      });
      if (!milestone) {
        return { success: false, error: 'Milestone not found' };
      }
      
      // Initialize milestone status if needed
      if (!projectData.milestoneStatus) {
        projectData.milestoneStatus = {};
      }
      if (!projectData.milestoneStatus[milestoneId]) {
        projectData.milestoneStatus[milestoneId] = {
          invoiced: false,
          paid: false,
          invoiceId: null,
          datePaid: null
        };
      }
      
      // Record payment for milestone
      projectData.milestoneStatus[milestoneId].paid = true;
      projectData.milestoneStatus[milestoneId].datePaid = paymentDate || new Date().toISOString();
      projectData.milestoneStatus[milestoneId].paymentMethod = paymentMethod || 'Manual';
      projectData.milestoneStatus[milestoneId].paymentAmount = parseFloat(amount);
      projectData.milestoneStatus[milestoneId].paymentNotes = notes || '';
    }
    
    // Initialize payments array if needed
    if (!projectData.payments) {
      projectData.payments = [];
    }
    
    // Add payment record
    projectData.payments.push({
      id: 'PAY-' + new Date().getTime(),
      milestoneId: milestoneId || null,
      milestoneName: milestone ? milestone.name : 'General Payment',
      amount: parseFloat(amount),
      method: paymentMethod || 'Manual',
      date: paymentDate || new Date().toISOString(),
      notes: notes || ''
    });
    
    // Update project
    updateProject(projectId, { projectData: projectData });
    
    const paymentType = milestone ? 'milestone ' + milestone.name : 'project';
    Logger.log('✅ Manual payment recorded: $' + amount + ' for ' + paymentType);
    
    return { success: true };
    
  } catch (error) {
    Logger.log('❌ Error recording manual payment: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Get project payment history
 */
function getProjectPaymentHistoryLegacy_(projectId) {
  try {
    const project = getProject(projectId);
    if (!project.success) {
      return { success: false, error: 'Project not found' };
    }
    
    const projectData = project.project;
    const payments = projectData.payments || [];
    
    // Sort by date descending
    payments.sort((a, b) => {
      const dateA = a.date ? new Date(a.date) : new Date(0);
      const dateB = b.date ? new Date(b.date) : new Date(0);
      return dateB - dateA;
    });
    
    return {
      success: true,
      payments: payments
    };
    
  } catch (error) {
    Logger.log('❌ Error getting payment history: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

// ============================================================================
// ONE-OFF BILLING & WORK ORDERS
// ============================================================================

/**
 * Create one-off invoice for a project (not part of payment schedule)
 * @param {string} projectId - The project ID
 * @param {string} description - Item/service description
 * @param {number} amount - Total amount
 * @param {number} quantity - Quantity (default 1)
 * @param {number} unitPrice - Unit price
 * @param {string} notes - Additional notes
 * @param {boolean} sendEmail - Whether to send invoice email
 * @param {boolean} includeFullInvoiceInEmail - If true (default), email lists all project line items and project total; if false, only this add-on line and amount
 * @param {boolean} addProcessingFee - If true, Stripe checkout and email include card processing fee (2.9% + $0.29) on this add-on amount
 * @returns {object} - Created invoice data
 */
function createOneOffProjectInvoice(projectId, description, amount, quantity, unitPrice, notes, sendEmail, includeFullInvoiceInEmail, addProcessingFee) {
  try {
    const project = getProject(projectId);
    if (!project.success) {
      return { success: false, error: 'Project not found' };
    }
    
    const projectData = project.project;
    var applyProcFee = addProcessingFee === true;
    var oneOffProcFee = applyProcFee
      ? Math.round(((parseFloat(amount) * 0.029) + 0.29) * 100) / 100
      : 0;
    var checkoutTotal = Math.round((parseFloat(amount) + oneOffProcFee) * 100) / 100;
    
    // ── Use the existing project invoice/estimate as the share link ────────────
    // This keeps all billing on ONE invoice the customer can view
    const existingLinkedId = projectData.estimateId || projectData.invoiceId || projectData.linkedEstimateId || '';
    const existingShareLink = existingLinkedId
      ? (WEBFLOW_INVOICE_VIEWER_URL + '?id=' + encodeURIComponent(existingLinkedId))
      : '';
    
    // Generate a tracking ID for PM_Project_Invoices (Stripe payment link reference)
    const trackingId = 'ONE-' + projectId + '-' + new Date().getTime();
    
    // Create Stripe payment link for this one-off (optional 2.9% + $0.29 via checkout line items)
    const stripeLink = createStripePaymentLink(
      projectData.customerEmail,
      projectData.customerName,
      description,
      amount,
      trackingId,
      projectId,
      projectData.customerAddress || '',
      { addProcessingFee: applyProcFee }
    );
    
    if (!stripeLink.success) {
      return { success: false, error: 'Failed to create Stripe payment link: ' + stripeLink.error };
    }
    
    // ── Track in PM_Project_Invoices (for payment reconciliation) ─────────────
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let invoicesSheet = spreadsheet.getSheetByName(PM_PROJECT_INVOICES_SHEET);
    if (!invoicesSheet) {
      setupPMProjectInvoicesSheet(spreadsheet);
      invoicesSheet = spreadsheet.getSheetByName(PM_PROJECT_INVOICES_SHEET);
    }
    
    // Verify headers exist - NEVER overwrite the header row
    const lastRow = invoicesSheet.getLastRow();
    const currentHeaders = invoicesSheet.getRange(1, 1, 1, 11).getValues()[0];
    
    if (!currentHeaders || currentHeaders[0] === '' || lastRow < 1) {
      // Headers missing - recreate them
      Logger.log('⚠️  PM_Project_Invoices headers missing - recreating');
      setupPMProjectInvoicesSheet(spreadsheet);
    }
    
    // Now safely append the row
    invoicesSheet.appendRow([
      trackingId,
      projectId,
      description,
      amount,
      'Pending',
      stripeLink.paymentUrl,
      new Date(),
      notes || '',
      'One-Off',
      quantity || 1,
      unitPrice || amount
    ]);
    
    // Verify append succeeded
    const newLastRow = invoicesSheet.getLastRow();
    Logger.log('✅ One-off invoice tracked in PM_Project_Invoices row ' + newLastRow);
    Logger.log('   Tracking ID: ' + trackingId + ' | Amount: $' + amount + ' | Project: ' + projectId);
    
    // ── Add as a line item to the project's items array ────────────────────────
    // This makes the item appear on the existing invoice when the customer views it
    if (!Array.isArray(projectData.items)) projectData.items = [];
    projectData.items.push({
      name: description,
      description: notes || description,
      quantity: quantity || 1,
      price: unitPrice || (amount / (quantity || 1)),
      total: amount,
      isOneOff: true,
      oneOffTrackingId: trackingId,
      dateAdded: new Date().toISOString()
    });
    
    // ── Add to payment schedule ────────────────────────────────────────────────
    if (!Array.isArray(projectData.paymentSchedule)) projectData.paymentSchedule = [];
    const oneOffMilestoneId = 'one-off-' + new Date().getTime();
    projectData.paymentSchedule.push({
      id: oneOffMilestoneId,
      name: description,
      amount: amount,
      percent: 0,
      type: 'one-off',
      trackingId: trackingId,
      stripePaymentUrl: stripeLink.paymentUrl,
      shareLink: existingShareLink,   // links to the EXISTING project invoice
      dateCreated: new Date().toISOString(),
      notes: notes || ''
    });
    
    // ── Update project total value ─────────────────────────────────────────────
    const currentTotal = parseFloat(projectData.totalValue || projectData.total || 0);
    projectData.totalValue = currentTotal + amount;
    if (projectData.total !== undefined) projectData.total = projectData.totalValue;
    
    // Save all project data changes
    updateProject(projectId, projectData);

    // ── Also update the original Invoices & Estimates record ──────────────────
    // This ensures the viewer shows the one-off item when the customer opens
    // the existing estimate/invoice link (not just the PM_Project_Invoices path).
    if (existingLinkedId) {
      try {
        const newLineItem = {
          name:        description,
          description: notes || description,
          quantity:    quantity || 1,
          price:       unitPrice || (amount / (quantity || 1)),
          total:       amount,
          isOneOff:    true,
          oneOffTrackingId: trackingId
        };
        const updateResult = addItemToInvoiceRecord(existingLinkedId, newLineItem);
        if (!updateResult.success) {
          Logger.log('⚠️ Could not update invoice record ' + existingLinkedId + ': ' + updateResult.error);
        }
      } catch (updateErr) {
        Logger.log('⚠️ Error updating invoice record: ' + updateErr.toString());
      }
    }

    // ── Send email using enhanced template ────────────────────────────────────
    var emailFullInvoice = includeFullInvoiceInEmail !== false;
    if (sendEmail) {
      try {
        const userSettings = getUserSettings('admin');
        
        // All project items (for full-invoice email) including the new one-off
        const allItems = Array.isArray(projectData.items) ? projectData.items : [];
        const mapItemForEmail = function(item) {
          return {
            name: item.name || item.description || 'Item',
            description: item.description || '',
            quantity: parseFloat(item.quantity || 1),
            price: parseFloat(item.price || item.unitPrice || 0),
            total: parseFloat(item.total || (item.quantity * item.price) || 0),
            isOneOff: item.isOneOff === true
          };
        };
        var allItemsJson = JSON.stringify(allItems.map(mapItemForEmail));
        var projectTotal = projectData.totalValue || projectData.total || amount;
        var emailSubtotal = projectTotal;
        var emailTotal = projectTotal;
        if (!emailFullInvoice) {
          var oneLine = [{
            name: description,
            description: notes || description,
            quantity: quantity || 1,
            price: unitPrice || (amount / (quantity || 1)),
            total: amount,
            isOneOff: true
          }];
          allItemsJson = JSON.stringify(oneLine.map(mapItemForEmail));
          emailSubtotal = amount;
          emailTotal = amount;
        }
        
        // Build invoice data pointing to the existing invoice
        const invoiceData = {
          type: 'Invoice',
          customerName: projectData.customerName,
          customerEmail: projectData.customerEmail,
          customerPhone: projectData.customerPhone || '',
          customerAddress: projectData.customerAddress || '',
          invoiceNumber: existingLinkedId || trackingId,
          quoteNumber: existingLinkedId || trackingId,
          date: new Date().toLocaleDateString(),
          dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString(),
          items: allItemsJson,
          subtotal: emailSubtotal,
          taxRate: parseFloat(projectData.taxRate || 0),
          tax: 0,
          discount: 0,
          total: emailTotal,
          notes: notes || ('Additional item added to project: ' + projectId),
          terms: projectData.terms || '',
          paymentLink: stripeLink.paymentUrl,     // Stripe: base ± processing fee lines per applyProcFee
          shareLink: (function() {
            var base = existingShareLink || (WEBFLOW_INVOICE_VIEWER_URL + '?id=' + encodeURIComponent(trackingId));
            if (!emailFullInvoice && existingLinkedId) {
              return base + (base.indexOf('?') >= 0 ? '&' : '?') + 'oneOffTrackingId=' + encodeURIComponent(trackingId);
            }
            return base;
          })(),
          status: 'Pending',
          paymentStatus: 'Pending',
          id: existingLinkedId || trackingId,
          projectId: projectId,
          isOneOffInvoice: true,
          currentMilestoneName: description,
          currentMilestoneAmount: amount,
          addProcessingFee: false,
          processingFee: oneOffProcFee > 0 ? oneOffProcFee : undefined
        };
        
        var feeNote = applyProcFee
          ? ('\n\nCard processing fee (2.9% + $0.29) applies to this payment: $' + oneOffProcFee.toFixed(2) +
            '\nTotal due at checkout: $' + checkoutTotal.toFixed(2) + '.')
          : '';
        var customMessage = emailFullInvoice
          ? ('We have added a new item to your project ' + projectId + '.\n\n' +
            'Item: ' + description + '\n' +
            'Amount: $' + parseFloat(amount).toFixed(2) +
            (notes ? '\n\nNotes: ' + notes : '') + feeNote + '\n\n' +
            'Your updated invoice is available below. Please use the payment link to pay this item at your convenience.\n\n' +
            'Thank you for choosing ' + COMPANY_NAME + '!')
          : ('Please use the payment link below for this add-on to your project ' + projectId + '.\n\n' +
            'Item: ' + description + '\n' +
            'Amount due: $' + parseFloat(amount).toFixed(2) +
            (notes ? '\n\nNotes: ' + notes : '') + feeNote + '\n\n' +
            'Your full project invoice is also available from the link if you need the complete document.\n\n' +
            'Thank you for choosing ' + COMPANY_NAME + '!');
        
        const emailResult = sendEnhancedInvoiceEmail(invoiceData, userSettings, customMessage, []);
        
        if (!emailResult || !emailResult.success) {
          Logger.log('⚠️ Enhanced email failed for one-off, falling back: ' + (emailResult ? emailResult.error : 'no result'));
          var fallbackLink = existingShareLink || (WEBFLOW_INVOICE_VIEWER_URL + '?id=' + encodeURIComponent(trackingId));
          if (!emailFullInvoice && existingLinkedId) {
            fallbackLink = fallbackLink + (fallbackLink.indexOf('?') >= 0 ? '&' : '?') + 'oneOffTrackingId=' + encodeURIComponent(trackingId);
          }
          MailApp.sendEmail({
            to: projectData.customerEmail,
            subject: 'Invoice: ' + description + ' - ' + COMPANY_NAME,
            htmlBody: '<p>Dear ' + projectData.customerName + ',</p>' +
              '<p>A new item has been added to your project ' + projectId + '.</p>' +
              '<p><strong>Item:</strong> ' + description + '</p>' +
              '<p><strong>Amount:</strong> $' + parseFloat(amount).toFixed(2) + '</p>' +
              (applyProcFee ? '<p><strong>Card processing fee:</strong> $' + oneOffProcFee.toFixed(2) + '</p>' +
                '<p><strong>Total due at checkout:</strong> $' + checkoutTotal.toFixed(2) + '</p>' : '') +
              (notes ? '<p><strong>Notes:</strong> ' + notes + '</p>' : '') +
              '<p><a href="' + fallbackLink + '" style="background: #0369a1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; margin-top: 20px;">View and Pay Invoice</a></p>' +
              '<p>Thank you!</p>'
          });
        }
        
        // Company copy
        MailApp.sendEmail({
          to: COMPANY_EMAIL,
          subject: '📧 One-Off Item Billed: ' + projectData.customerName + ' - ' + description,
          htmlBody: '<p>One-off item billed to ' + projectData.customerName + '</p>' +
            '<p><strong>Project:</strong> ' + projectId + '</p>' +
            '<p><strong>Item:</strong> ' + description + '</p>' +
            '<p><strong>Base amount:</strong> $' + parseFloat(amount).toFixed(2) + '</p>' +
            (applyProcFee ? '<p><strong>Processing fee:</strong> $' + oneOffProcFee.toFixed(2) + '</p>' +
              '<p><strong>Checkout total:</strong> $' + checkoutTotal.toFixed(2) + '</p>' : '') +
            (existingShareLink ? '<p><a href="' + existingShareLink + '">View Full Invoice</a></p>' : '')
        });
        
      } catch (emailError) {
        Logger.log('⚠️ Email error in createOneOffProjectInvoice: ' + emailError.toString());
      }
    }
    
    Logger.log('✅ One-off item added to project: ' + trackingId);

    // Brooks Telegram (same project as InvoiceEstimate.gs — helpers optional if script is standalone)
    try {
      if (typeof sendTelegramBotMessage_ === 'function' && typeof escapeTelegramHtml_ === 'function') {
        var tgViewerLink = existingShareLink || (WEBFLOW_INVOICE_VIEWER_URL + '?id=' + encodeURIComponent(trackingId));
        if (includeFullInvoiceInEmail === false && existingLinkedId) {
          tgViewerLink = tgViewerLink + (tgViewerLink.indexOf('?') >= 0 ? '&' : '?') +
            'oneOffTrackingId=' + encodeURIComponent(trackingId);
        }
        var amtLabel = '$' + parseFloat(amount).toFixed(2);
        var tgHtml = '<b>One-off billed</b>\n' +
          '<b>Project:</b> ' + escapeTelegramHtml_(projectId) + '\n' +
          '<b>Customer:</b> ' + escapeTelegramHtml_(String(projectData.customerName || '')) + '\n' +
          '<b>Item:</b> ' + escapeTelegramHtml_(String(description)) + '\n' +
          '<b>Amount:</b> ' + escapeTelegramHtml_(amtLabel);
        if (applyProcFee) {
          tgHtml += '\n<b>Processing fee:</b> ' + escapeTelegramHtml_('$' + oneOffProcFee.toFixed(2));
          tgHtml += '\n<b>Checkout total:</b> ' + escapeTelegramHtml_('$' + checkoutTotal.toFixed(2));
        }
        if (notes) {
          tgHtml += '\n<b>Notes:</b> ' + escapeTelegramHtml_(String(notes));
        }
        tgHtml += '\n<b>Tracking:</b> <code>' + escapeTelegramHtml_(trackingId) + '</code>';
        var tgButtons = [{ text: 'Pay (Stripe)', url: String(stripeLink.paymentUrl) }];
        if (tgViewerLink) {
          tgButtons.push({ text: 'View invoice', url: String(tgViewerLink) });
        }
        var tgOneOff = sendTelegramBotMessage_(tgHtml, tgButtons);
        if (!tgOneOff.success) {
          Logger.log('Telegram one-off notify: ' + (tgOneOff.error || 'failed'));
        }
      }
    } catch (tgErr) {
      Logger.log('Telegram one-off notify error: ' + tgErr);
    }
    
    return {
      success: true,
      invoiceId: trackingId,
      paymentUrl: stripeLink.paymentUrl,
      shareLink: existingShareLink,
      baseAmount: parseFloat(amount),
      processingFee: oneOffProcFee,
      checkoutTotal: checkoutTotal,
      addProcessingFee: applyProcFee
    };
    
  } catch (error) {
    Logger.log('❌ Error creating one-off invoice: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Create work order for a project
 * @param {string} projectId - The project ID
 * @param {string} title - Work order title
 * @param {string} description - Work description
 * @param {string} priority - Priority (Normal/High/Urgent)
 * @param {string} dueDate - Due date (ISO string)
 * @param {string} estimatedHours - Estimated hours
 * @param {string} assignedTo - Assigned team member
 * @param {string} notes - Additional notes
 * @returns {object} - Created work order data
 */

/**
 * Resend the email for an existing one-off invoice
 * @param {string} projectId - The project ID
 * @param {string} invoiceId - The invoice ID (PM tracking id)
 * @param {boolean} includeFullInvoiceInEmail - If true (default), email lists all project line items and total; if false, only this one-off line
 * @returns {object} - Success status
 */
function resendOneOffProjectInvoice(projectId, invoiceId, includeFullInvoiceInEmail) {
  try {
    const project = getProject(projectId);
    if (!project.success) return { success: false, error: 'Project not found' };
    const projectData = project.project;

    // Look up the invoice in PM_Project_Invoices
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const invoicesSheet = spreadsheet.getSheetByName(PM_PROJECT_INVOICES_SHEET);
    if (!invoicesSheet) return { success: false, error: 'Invoices sheet not found' };

    const data = invoicesSheet.getDataRange().getValues();
    let description = '', amount = 0, stripePaymentUrl = '', notes = '';
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim() === String(invoiceId || '').trim()) {
        description = data[i][2] || '';
        amount = parseFloat(data[i][3] || 0);
        stripePaymentUrl = data[i][5] || '';
        notes = data[i][7] || '';
        break;
      }
    }

    if (!description) return { success: false, error: 'Invoice not found in records' };

    const existingLinkedId = projectData.estimateId || projectData.invoiceId || projectData.linkedEstimateId || '';
    const shareLink =
      existingLinkedId
        ? WEBFLOW_INVOICE_VIEWER_URL + '?id=' + encodeURIComponent(existingLinkedId)
        : WEBFLOW_INVOICE_VIEWER_URL + '?id=' + encodeURIComponent(invoiceId);
    const userSettings = getUserSettings('admin');

    var emailFullInvoice = includeFullInvoiceInEmail !== false;
    var mapItemForEmail = function(item) {
      return {
        name: item.name || item.description || 'Item',
        description: item.description || '',
        quantity: parseFloat(item.quantity || 1),
        price: parseFloat(item.price || item.unitPrice || 0),
        total: parseFloat(item.total || (item.quantity * item.price) || 0),
        isOneOff: item.isOneOff === true
      };
    };
    var itemsJson;
    var subtotalVal;
    var totalVal;
    if (emailFullInvoice) {
      var allItems = Array.isArray(projectData.items) ? projectData.items : [];
      itemsJson = JSON.stringify(allItems.map(mapItemForEmail));
      var projectTotal = parseFloat(projectData.totalValue || projectData.total || amount);
      subtotalVal = projectTotal;
      totalVal = projectTotal;
    } else {
      itemsJson = JSON.stringify([mapItemForEmail({
        name: description,
        description: notes || description,
        quantity: 1,
        price: amount,
        total: amount,
        isOneOff: true
      })]);
      subtotalVal = amount;
      totalVal = amount;
    }

    const invoiceData = {
      type: 'Invoice',
      customerName: projectData.customerName,
      customerEmail: projectData.customerEmail,
      customerPhone: projectData.customerPhone || '',
      customerAddress: projectData.customerAddress || '',
      invoiceNumber: invoiceId,
      quoteNumber: invoiceId,
      date: new Date().toLocaleDateString(),
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString(),
      items: itemsJson,
      subtotal: subtotalVal,
      taxRate: 0,
      tax: 0,
      discount: 0,
      total: totalVal,
      notes: notes || ('Additional billing for project: ' + projectId),
      terms: projectData.terms || '',
      paymentLink: stripePaymentUrl,
      shareLink: shareLink,
      status: 'Pending',
      paymentStatus: 'Pending',
      id: invoiceId,
      projectId: projectId,
      isOneOffInvoice: true,
      currentMilestoneName: description,
      currentMilestoneAmount: amount
    };

    var customMessage = emailFullInvoice
      ? ('We are resending your invoice for project ' + projectId + '.\n\n' +
        'Description: ' + description + '\n' +
        'Amount: $' + amount.toFixed(2) +
        (notes ? '\n\nNotes: ' + notes : '') + '\n\n' +
        'Please use the link below to view and pay your invoice at your convenience.\n\n' +
        'Thank you for choosing ' + COMPANY_NAME + '!')
      : ('We are resending your payment link for this add-on (project ' + projectId + ').\n\n' +
        'Description: ' + description + '\n' +
        'Amount due: $' + amount.toFixed(2) +
        (notes ? '\n\nNotes: ' + notes : '') + '\n\n' +
        'Please use the link below. Your full project invoice is available from the same portal if needed.\n\n' +
        'Thank you for choosing ' + COMPANY_NAME + '!');

    const emailResult = sendEnhancedInvoiceEmail(invoiceData, userSettings, customMessage, []);
    if (!emailResult || !emailResult.success) {
      return { success: false, error: emailResult ? emailResult.error : 'Email send failed' };
    }

    Logger.log('✅ One-off invoice resent: ' + invoiceId);
    return { success: true, invoiceId: invoiceId, shareLink: shareLink };

  } catch (error) {
    Logger.log('❌ Error resending one-off invoice: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Delete a pending one-off charge: PM_Project_Invoices row, project items + payment schedule + totals,
 * and remove the line from the linked Invoices & Estimates record (column I).
 * Blocked if PM row Status is Paid.
 */
function deleteOneOffProjectInvoice(projectId, trackingId, milestoneId) {
  try {
    const tid = String(trackingId || '').trim();
    const mid = String(milestoneId || '').trim();
    if (!projectId || !tid) {
      return { success: false, error: 'Project ID and tracking ID are required' };
    }

    const project = getProject(projectId);
    if (!project.success) return { success: false, error: 'Project not found' };
    const projectData = project.project;

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const invoicesSheet = spreadsheet.getSheetByName(PM_PROJECT_INVOICES_SHEET);
    if (!invoicesSheet) return { success: false, error: 'PM_Project_Invoices sheet not found' };

    const data = invoicesSheet.getDataRange().getValues();
    let rowIndex1Based = -1;
    let pmAmount = 0;
    let pmDesc = '';
    let pmStatus = '';
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim() === tid && String(data[i][1] || '').trim() === String(projectId).trim()) {
        rowIndex1Based = i + 1;
        pmDesc = String(data[i][2] || '');
        pmAmount = parseFloat(data[i][3] || 0);
        pmStatus = String(data[i][4] || '').trim().toLowerCase();
        break;
      }
    }
    if (rowIndex1Based < 0) {
      return { success: false, error: 'One-off row not found in PM_Project_Invoices' };
    }
    if (pmStatus === 'paid') {
      return { success: false, error: 'Cannot delete a paid one-off. If the payment was recorded in error, fix Payment History first.' };
    }

    let schedule = projectData.paymentSchedule || [];
    if (typeof schedule === 'string') {
      try {
        schedule = JSON.parse(schedule);
      } catch (e) {
        schedule = [];
      }
    }
    if (!Array.isArray(schedule)) schedule = [];

    let milestone = null;
    for (let j = 0; j < schedule.length; j++) {
      const m = schedule[j];
      if (mid && String(m.id || '') === mid) {
        milestone = m;
        break;
      }
    }
    if (!milestone) {
      for (let k = 0; k < schedule.length; k++) {
        const m2 = schedule[k];
        if (String(m2.trackingId || '') === tid) {
          milestone = m2;
          break;
        }
      }
    }

    const amt = milestone ? parseFloat(milestone.amount || 0) : pmAmount;
    const mname = milestone ? String(milestone.name || '') : pmDesc;

    const linkedId = projectData.estimateId || projectData.invoiceId || projectData.linkedEstimateId || '';
    if (linkedId) {
      const rm = removeOneOffFromInvoiceRecord(linkedId, tid, mname, amt);
      if (!rm.success) {
        Logger.log('⚠️ deleteOneOffProjectInvoice: linked invoice update: ' + rm.error);
      }
    }

    invoicesSheet.deleteRow(rowIndex1Based);

    projectData.paymentSchedule = schedule.filter(function(m) {
      if (String(m.trackingId || '') === tid) return false;
      if (mid && String(m.id || '') === mid) return false;
      return true;
    });

    if (projectData.milestoneStatus && milestone && milestone.id && projectData.milestoneStatus[milestone.id]) {
      delete projectData.milestoneStatus[milestone.id];
    }

    let items = projectData.items || [];
    if (typeof items === 'string') {
      try {
        items = JSON.parse(items);
      } catch (e2) {
        items = [];
      }
    }
    if (!Array.isArray(items)) items = [];

    projectData.items = items.filter(function(it) {
      if (!it.isOneOff) return true;
      if (String(it.oneOffTrackingId || '').trim() === tid) return false;
      if (!it.oneOffTrackingId && String(it.name || '').trim() === String(mname).trim() && Math.abs(parseFloat(it.total || 0) - amt) < 0.02) return false;
      return true;
    });

    const currentTotal = parseFloat(projectData.totalValue || projectData.total || 0);
    projectData.totalValue = Math.max(0, currentTotal - amt);
    if (projectData.total !== undefined) projectData.total = projectData.totalValue;

    updateProject(projectId, projectData);

    Logger.log('✅ deleteOneOffProjectInvoice: removed ' + tid);
    return { success: true, trackingId: tid };
  } catch (error) {
    Logger.log('❌ deleteOneOffProjectInvoice: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

function createProjectWorkOrder(projectId, title, description, priority, dueDate, estimatedHours, assignedTo, notes) {
  try {
    const project = getProject(projectId);
    if (!project.success) {
      return { success: false, error: 'Project not found' };
    }
    
    const projectData = project.project;
    
    // Generate work order ID
    const workOrderId = 'WO-' + projectId + '-' + new Date().getTime();
    
    // Create work order object
    const workOrder = {
      workOrderId: workOrderId,
      projectId: projectId,
      title: title,
      description: description,
      priority: priority || 'Normal',
      status: 'Open',
      dueDate: dueDate || '',
      estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
      assignedTo: assignedTo || '',
      notes: notes || '',
      dateCreated: new Date().toISOString(),
      dateCompleted: null
    };
    
    // Add to project's work orders array
    if (!projectData.workOrders) {
      projectData.workOrders = [];
    }
    
    projectData.workOrders.push(workOrder);
    
    // Update project
    updateProject(projectId, { projectData: projectData });
    
    Logger.log('✅ Work order created: ' + workOrderId);
    
    return {
      success: true,
      workOrderId: workOrderId,
      workOrder: workOrder
    };
    
  } catch (error) {
    Logger.log('❌ Error creating work order: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Escape text for HTML email body (Apps Script).
 */
function escapeHtmlEmail_(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Rich HTML email: project placed on hold.
 */
function buildStopOrderCustomerEmailHtml_(customerName, projectId, note, companyName) {
  var nm = escapeHtmlEmail_(customerName || 'Customer');
  var pid = escapeHtmlEmail_(projectId);
  var co = escapeHtmlEmail_(companyName);
  /** Hero image for stop-work notice (Webflow asset). */
  var stopOrderEmailBannerUrl =
    'https://cdn.prod.website-files.com/6931dc4e8e97334e195432df/6993ce0abcd54d3520799318_IMG_1763-p-500.jpg';
  var noteHtml = '';
  if (note && String(note).trim()) {
    noteHtml =
      '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:24px 0;"><tr><td style="background:#fffbeb;border-left:4px solid #f59e0b;border-radius:8px;padding:16px 20px;">' +
      '<p style="margin:0 0 8px 0;font-size:13px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;">Message from our team</p>' +
      '<p style="margin:0;font-size:15px;line-height:1.6;color:#78350f;">' + escapeHtmlEmail_(note) + '</p></td></tr></table>';
  }
  return (
    '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f1f5f9;padding:32px 16px;"><tr><td align="center">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.12);">' +
      '<tr><td style="background:linear-gradient(135deg,#b91c1c 0%,#dc2626 100%);padding:28px 32px;text-align:center;">' +
      '<p style="margin:0 0 8px 0;font-size:14px;font-weight:700;color:#fecaca;letter-spacing:0.08em;text-transform:uppercase;">Project status</p>' +
      '<h1 style="margin:0;font-size:26px;font-weight:800;color:#ffffff;">ON HOLD</h1>' +
      '</td></tr>' +
      '<tr><td style="padding:0;line-height:0;background:#ffffff;text-align:center;">' +
      '<img src="' +
      escapeHtmlEmail_(stopOrderEmailBannerUrl) +
      '" alt="A Quality Pool Company" width="500" style="display:block;width:100%;max-width:500px;height:auto;margin:0 auto;border:0;" />' +
      '</td></tr>' +
      '<tr><td style="padding:32px;">' +
      '<p style="margin:0 0 16px 0;font-size:17px;line-height:1.6;color:#1e293b;">Dear <strong>' + nm + '</strong>,</p>' +
      '<p style="margin:0 0 16px 0;font-size:16px;line-height:1.7;color:#334155;">We are placing a <strong>temporary hold</strong> on active work for your project <strong style="color:#0f172a;">' + pid + '</strong>, typically due to an outstanding balance or billing matter.</p>' +
      noteHtml +
      '<p style="margin:24px 0 16px 0;font-size:16px;line-height:1.7;color:#334155;">Please contact us as soon as possible so we can resolve this and get your project moving again.</p>' +
      (function() {
        var mail = typeof COMPANY_EMAIL !== 'undefined' && COMPANY_EMAIL ? String(COMPANY_EMAIL) : '';
        var phone = typeof COMPANY_PHONE !== 'undefined' && COMPANY_PHONE ? String(COMPANY_PHONE) : '';
        var href = mail ? ('mailto:' + mail) : (phone ? ('tel:' + phone.replace(/[^\d+]/g, '')) : '');
        var label = mail ? 'Email us' : (phone ? 'Call us' : '');
        if (!href) {
          return '<p style="margin:16px 0 0 0;font-size:15px;color:#0369a1;">Please contact us using the phone number or email on your contract.</p>';
        }
        return '<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:28px;"><tr><td style="border-radius:10px;background:#0369a1;">' +
          '<a href="' + href.replace(/"/g, '&quot;') + '" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;">' + label + '</a></td></tr></table>';
      })() +
      '</td></tr>' +
      '<tr><td style="padding:20px 32px 28px;border-top:1px solid #e2e8f0;background:#f8fafc;">' +
      '<p style="margin:0;font-size:13px;color:#64748b;line-height:1.5;">Thank you for your understanding.<br><strong style="color:#0f172a;">' + co + '</strong></p>' +
      '</td></tr></table></td></tr></table></body></html>'
  );
}

/**
 * Rich HTML email: project resumed.
 */
function buildResumeProjectCustomerEmailHtml_(customerName, projectId, remaining, viewerUrl, companyName) {
  var nm = escapeHtmlEmail_(customerName || 'Customer');
  var pid = escapeHtmlEmail_(projectId);
  var co = escapeHtmlEmail_(companyName);
  var balanceBlock = '';
  if (remaining > 0.02) {
    balanceBlock =
      '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:20px 0;"><tr><td style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:18px 22px;">' +
      '<p style="margin:0 0 6px 0;font-size:13px;font-weight:700;color:#166534;">Estimated balance due</p>' +
      '<p style="margin:0;font-size:22px;font-weight:800;color:#15803d;">$' + remaining.toFixed(2) + '</p>' +
      '<p style="margin:10px 0 0 0;font-size:14px;color:#365314;line-height:1.5;">Please arrange payment for any amount still due per your invoice (including add-ons).</p></td></tr></table>';
  }
  var btnBlock = '';
  if (viewerUrl) {
    btnBlock =
      '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 0 0;"><tr><td style="border-radius:10px;background:linear-gradient(135deg,#0369a1 0%,#0284c7 100%);">' +
      '<a href="' + escapeHtmlEmail_(viewerUrl) + '" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;">View invoice</a></td></tr></table>';
  }
  return (
    '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f1f5f9;padding:32px 16px;"><tr><td align="center">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.12);">' +
      '<tr><td style="background:linear-gradient(135deg,#059669 0%,#10b981 100%);padding:28px 32px;text-align:center;">' +
      '<p style="margin:0 0 8px 0;font-size:14px;font-weight:700;color:#d1fae7;letter-spacing:0.08em;text-transform:uppercase;">Good news</p>' +
      '<h1 style="margin:0;font-size:26px;font-weight:800;color:#ffffff;">Project resumed</h1>' +
      '</td></tr>' +
      '<tr><td style="padding:32px;">' +
      '<p style="margin:0 0 16px 0;font-size:17px;line-height:1.6;color:#1e293b;">Dear <strong>' + nm + '</strong>,</p>' +
      '<p style="margin:0 0 16px 0;font-size:16px;line-height:1.7;color:#334155;">Work on project <strong style="color:#0f172a;">' + pid + '</strong> has been <strong style="color:#059669;">resumed</strong>. We look forward to continuing with you.</p>' +
      balanceBlock +
      btnBlock +
      '</td></tr>' +
      '<tr><td style="padding:20px 32px 28px;border-top:1px solid #e2e8f0;background:#f8fafc;">' +
      '<p style="margin:0;font-size:13px;color:#64748b;line-height:1.5;">We appreciate your business.<br><strong style="color:#0f172a;">' + co + '</strong></p>' +
      '</td></tr></table></td></tr></table></body></html>'
  );
}

/**
 * Stop active work for non-payment etc.; sets status ON HOLD, emails customer (HTML).
 */
function setProjectStopOrder(projectId, note) {
  try {
    var p = getProject(projectId);
    if (!p.success) return { success: false, error: 'Project not found' };
    var pd = p.project;
    pd.stopOrder = true;
    pd.stopOrderAt = new Date().toISOString();
    pd.stopOrderNote = String(note || '').trim();
    pd.statusBeforeStop = pd.status || 'Active';
    pd.status = 'ON HOLD';
    var upStop = updateProject(projectId, pd);
    if (!upStop || !upStop.success) {
      Logger.log('setProjectStopOrder: updateProject failed ' + JSON.stringify(upStop));
      return {
        success: false,
        error: (upStop && upStop.error) ? upStop.error : 'Sheet update failed (PM_Projects not written)',
        sheetUpdated: false
      };
    }
    var co = typeof COMPANY_NAME !== 'undefined' ? COMPANY_NAME : 'A Quality Pool Company';
    var subj = 'Important: Your project is ON HOLD — ' + co;
    var htmlBody = buildStopOrderCustomerEmailHtml_(pd.customerName, projectId, note, co);
    if (pd.customerEmail) {
      MailApp.sendEmail({
        to: pd.customerEmail,
        subject: subj,
        htmlBody: htmlBody
      });
    }
    return { success: true, sheetUpdated: true };
  } catch (e) {
    Logger.log('setProjectStopOrder: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

/**
 * Clear stop order, email customer project resumed; estimates remaining balance from linked invoice payments.
 */
function resumeProjectAfterStop(projectId) {
  try {
    var p = getProject(projectId);
    if (!p.success) return { success: false, error: 'Project not found' };
    var pd = p.project;
    if (!pd.stopOrder) return { success: false, error: 'Project is not on stop order' };
    pd.stopOrder = false;
    pd.stopOrderClearedAt = new Date().toISOString();
    var prev = pd.statusBeforeStop || 'Active';
    if (prev === 'ON HOLD') prev = 'Active';
    pd.status = prev;
    delete pd.statusBeforeStop;
    var upResume = updateProject(projectId, pd);
    if (!upResume || !upResume.success) {
      Logger.log('resumeProjectAfterStop: updateProject failed ' + JSON.stringify(upResume));
      return {
        success: false,
        error: (upResume && upResume.error) ? upResume.error : 'Sheet update failed (PM_Projects not written)',
        sheetUpdated: false
      };
    }
    var linked = pd.estimateId || pd.invoiceId || pd.linkedEstimateId || '';
    var total = parseFloat(pd.totalValue || pd.total || 0);
    var paid = 0;
    try {
      if (linked && typeof getPaymentsForInvoice === 'function') {
        var pays = getPaymentsForInvoice(linked);
        for (var i = 0; i < pays.length; i++) paid += parseFloat(pays[i].amount || 0);
      }
    } catch (payErr) {
      Logger.log('resumeProjectAfterStop payments: ' + payErr.toString());
    }
    var remaining = Math.max(0, Math.round((total - paid) * 100) / 100);
    var viewerUrl = linked ? (WEBFLOW_INVOICE_VIEWER_URL + '?id=' + encodeURIComponent(linked)) : '';
    var co = typeof COMPANY_NAME !== 'undefined' ? COMPANY_NAME : 'A Quality Pool Company';
    var subj = 'Your project has resumed — ' + co;
    var htmlBody = buildResumeProjectCustomerEmailHtml_(pd.customerName, projectId, remaining, viewerUrl, co);
    if (pd.customerEmail) {
      MailApp.sendEmail({ to: pd.customerEmail, subject: subj, htmlBody: htmlBody });
    }
    return { success: true, sheetUpdated: true, remainingBalance: remaining };
  } catch (e) {
    Logger.log('resumeProjectAfterStop: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

// ============================================================================
// PM TASKS (To-Do) — Company ID scoped, optional Project ID, Google Calendar
// ============================================================================

/**
 * Resolve tenant company for API calls (explicit companyId or from user email).
 */
function resolveCompanyIdForTasks_(email, companyIdParam) {
  var explicit = companyIdParam ? String(companyIdParam).trim() : '';
  if (explicit) return explicit;
  if (email) {
    var r = getCompanyIdForUser(String(email).trim());
    if (r && r.success && r.companyId) return String(r.companyId).trim();
  }
  return 'CMP-AQUALITYPOOL';
}

function pmTaskStripCompletedPrefix_(title) {
  var t = String(title || '');
  return t.replace(/^\s*✅\s*Completed:\s*/i, '').replace(/^\s*COMPLETED:\s*/i, '').trim();
}

function pmTaskCalendarCreate_(row) {
  try {
    var calId = (typeof PM_TASK_CALENDAR_ID !== 'undefined') ? PM_TASK_CALENDAR_ID : 'primary';
    var cal = CalendarApp.getCalendarById(calId) || CalendarApp.getDefaultCalendar();
    if (!cal) return '';

    var dueRaw = row.dueDate;
    if (!dueRaw) return '';

    var d = dueRaw instanceof Date ? new Date(dueRaw.getTime()) : new Date(dueRaw);
    if (isNaN(d.getTime())) return '';

    var timeStr = String(row.dueTime || '').trim();
    var start;
    var end;
    if (timeStr) {
      var parts = timeStr.split(':');
      var h = parseInt(parts[0], 10);
      var m = parseInt(parts[1], 10);
      if (isNaN(h)) h = 9;
      if (isNaN(m)) m = 0;
      start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0);
      end = new Date(start.getTime() + 30 * 60 * 1000);
    } else {
      start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0, 0);
      end = new Date(start.getTime() + 45 * 60 * 1000);
    }

    var evTitle = '📋 ' + pmTaskStripCompletedPrefix_(row.title || 'Task');
    if (row.customerName) evTitle += ' · ' + row.customerName;
    if (row.projectId) evTitle += ' · ' + row.projectId;

    var desc = 'PM Task ID: ' + (row.taskId || '') + '\n';
    if (row.notes) desc += row.notes + '\n';
    if (row.linkType && row.linkId) desc += 'Linked: ' + row.linkType + ' ' + row.linkId;

    var ev = cal.createEvent(evTitle, start, end, { description: desc });
    try { ev.setColor('9'); } catch (c0) {}
    try { ev.addPopupReminder(60); } catch (c1) {}
    return ev.getId();
  } catch (e) {
    Logger.log('pmTaskCalendarCreate_: ' + e);
    return '';
  }
}

function pmTaskCalendarUpdate_(eventId, row) {
  if (!eventId) return '';
  try {
    var calId = (typeof PM_TASK_CALENDAR_ID !== 'undefined') ? PM_TASK_CALENDAR_ID : 'primary';
    var cal = CalendarApp.getCalendarById(calId) || CalendarApp.getDefaultCalendar();
    var ev = cal.getEventById(eventId);
    if (!ev) return pmTaskCalendarCreate_(row);

    var dueRaw = row.dueDate;
    if (!dueRaw) {
      try { ev.deleteEvent(); } catch (de) {}
      return '';
    }

    var d = dueRaw instanceof Date ? new Date(dueRaw.getTime()) : new Date(dueRaw);
    if (isNaN(d.getTime())) return eventId;

    var timeStr = String(row.dueTime || '').trim();
    var start;
    var end;
    if (timeStr) {
      var parts = timeStr.split(':');
      var h = parseInt(parts[0], 10);
      var m = parseInt(parts[1], 10);
      if (isNaN(h)) h = 9;
      if (isNaN(m)) m = 0;
      start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0);
      end = new Date(start.getTime() + 30 * 60 * 1000);
    } else {
      start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0, 0);
      end = new Date(start.getTime() + 45 * 60 * 1000);
    }

    ev.setTime(start, end);
    var evTitle = '📋 ' + pmTaskStripCompletedPrefix_(row.title || 'Task');
    if (row.customerName) evTitle += ' · ' + row.customerName;
    if (row.projectId) evTitle += ' · ' + row.projectId;
    ev.setTitle(evTitle);

    var desc = 'PM Task ID: ' + (row.taskId || '') + '\n';
    if (row.notes) desc += row.notes + '\n';
    ev.setDescription(desc);
    return eventId;
  } catch (e) {
    Logger.log('pmTaskCalendarUpdate_: ' + e);
    return pmTaskCalendarCreate_(row);
  }
}

function pmTaskCalendarDelete_(eventId) {
  if (!eventId) return;
  try {
    var calId = (typeof PM_TASK_CALENDAR_ID !== 'undefined') ? PM_TASK_CALENDAR_ID : 'primary';
    var cal = CalendarApp.getCalendarById(calId) || CalendarApp.getDefaultCalendar();
    var ev = cal.getEventById(eventId);
    if (ev) ev.deleteEvent();
  } catch (e) {}
}

function pmTasksRowToObject_(row) {
  return {
    companyId: row[0],
    taskId: row[1],
    title: row[2],
    projectId: row[3] ? String(row[3]).trim() : '',
    customerName: row[4] ? String(row[4]) : '',
    customerEmail: row[5] ? String(row[5]) : '',
    dueDate: row[6] ? (row[6] instanceof Date ? row[6].toISOString().substring(0, 10) : formatPmTaskDate_(row[6])) : '',
    dueTime: row[7] ? String(row[7]) : '',
    priority: row[8] ? String(row[8]) : 'Normal',
    status: row[9] ? String(row[9]) : 'Open',
    notes: row[10] ? String(row[10]) : '',
    calendarEventId: row[11] ? String(row[11]) : '',
    linkType: row[12] ? String(row[12]) : '',
    linkId: row[13] ? String(row[13]) : '',
    createdDate: row[14] ? (row[14] instanceof Date ? row[14].toISOString() : String(row[14])) : ''
  };
}

function formatPmTaskDate_(v) {
  if (!v) return '';
  if (v instanceof Date) return v.toISOString().substring(0, 10);
  try {
    var d = new Date(v);
    if (!isNaN(d.getTime())) return d.toISOString().substring(0, 10);
  } catch (e) {}
  return String(v);
}

/**
 * List tasks for a company (open only unless includeCompleted).
 */
function getPmTasks(companyId, includeCompleted) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(PM_TASKS_SHEET);
    if (!sheet) {
      setupPMTasksSheet(ss);
      sheet = ss.getSheetByName(PM_TASKS_SHEET);
    }
    var data = sheet.getDataRange().getValues();
    var cid = String(companyId || '').trim();
    var out = [];
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim() !== cid) continue;
      var st = String(data[i][9] || 'Open');
      if (!includeCompleted && (st === 'Completed' || st === 'Done')) continue;
      out.push(pmTasksRowToObject_(data[i]));
    }
    return { success: true, tasks: out };
  } catch (e) {
    Logger.log('getPmTasks: ' + e);
    return { success: false, error: e.toString(), tasks: [] };
  }
}

/**
 * Group open tasks for dashboard: General + per project.
 */
function getPmTasksDashboard(companyId) {
  try {
    var cid = String(companyId || '').trim();
    var gt = getPmTasks(cid, false);
    if (!gt.success) return gt;

    var tasks = gt.tasks || [];
    var labelCache = {};

    function projectLabel(pid) {
      if (!pid) return 'General (no project)';
      if (labelCache[pid]) return labelCache[pid];
      try {
        var pr = getProject(pid);
        if (pr && pr.success && pr.project) {
          var name = pr.project.customerName || pr.project.projectName || '';
          labelCache[pid] = (name ? name + ' — ' : '') + pid;
          return labelCache[pid];
        }
      } catch (e) {}
      labelCache[pid] = pid;
      return labelCache[pid];
    }

    var general = [];
    var byProject = {};

    for (var t = 0; t < tasks.length; t++) {
      var task = tasks[t];
      var pid = task.projectId ? String(task.projectId).trim() : '';
      if (!pid) {
        general.push(task);
      } else {
        if (!byProject[pid]) byProject[pid] = [];
        byProject[pid].push(task);
      }
    }

    var groups = [];
    groups.push({
      key: '',
      label: 'General (no project)',
      tasks: general.sort(pmTaskSort_)
    });

    var pids = Object.keys(byProject).sort();
    for (var p = 0; p < pids.length; p++) {
      var id = pids[p];
      groups.push({
        key: id,
        label: projectLabel(id),
        tasks: byProject[id].sort(pmTaskSort_)
      });
    }

    return { success: true, companyId: cid, groups: groups, tasks: tasks.sort(pmTaskSort_) };
  } catch (e) {
    Logger.log('getPmTasksDashboard: ' + e);
    return { success: false, error: e.toString(), groups: [], tasks: [] };
  }
}

function pmTaskSort_(a, b) {
  var da = a.dueDate || '9999-12-31';
  var db = b.dueDate || '9999-12-31';
  if (da !== db) return da < db ? -1 : 1;
  return String(a.title || '').localeCompare(String(b.title || ''));
}

function addPmTask(companyId, data) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(PM_TASKS_SHEET);
    if (!sheet) {
      setupPMTasksSheet(ss);
      sheet = ss.getSheetByName(PM_TASKS_SHEET);
    }

    var cid = String(companyId || '').trim();
    var taskId = 'TASK-' + new Date().getTime();
    var title = String(data.title || 'Task').trim();
    if (!title) return { success: false, error: 'Title is required' };

    var projectId = data.projectId ? String(data.projectId).trim() : '';
    var customerName = data.customerName ? String(data.customerName).trim() : '';
    try {
      if (customerName && typeof pmTaskResolveCustomerDisplayName_ === 'function') {
        customerName = pmTaskResolveCustomerDisplayName_(cid, customerName);
      }
    } catch (resolveErr) {}
    var customerEmail = data.customerEmail ? String(data.customerEmail).trim() : '';
    var dueDate = data.dueDate ? new Date(data.dueDate) : '';
    if (dueDate && isNaN(dueDate.getTime())) dueDate = '';
    var dueTime = data.dueTime ? String(data.dueTime).trim() : '';
    var priority = data.priority ? String(data.priority).trim() : 'Normal';
    var notes = data.notes ? String(data.notes) : '';
    var linkType = data.linkType ? String(data.linkType).trim() : '';
    var linkId = data.linkId ? String(data.linkId).trim() : '';

    var rowObj = {
      taskId: taskId,
      title: title,
      projectId: projectId,
      customerName: customerName,
      dueDate: dueDate,
      dueTime: dueTime,
      notes: notes,
      linkType: linkType,
      linkId: linkId
    };

    var calId = '';
    if (dueDate) {
      calId = pmTaskCalendarCreate_(rowObj);
    }

    sheet.appendRow([
      cid,
      taskId,
      title,
      projectId,
      customerName,
      customerEmail,
      dueDate || '',
      dueTime,
      priority,
      'Open',
      notes,
      calId,
      linkType,
      linkId,
      new Date()
    ]);

    try {
      if (typeof sendTelegramBotMessage_ === 'function' && typeof escapeTelegramHtml_ === 'function') {
        var dueStr = '';
        if (dueDate) {
          try {
            var d = dueDate instanceof Date ? dueDate : new Date(dueDate);
            if (!isNaN(d.getTime())) {
              dueStr = Utilities.formatDate(d, Session.getScriptTimeZone(), 'MMM d, yyyy');
            }
          } catch (fmtErr) {
            dueStr = String(dueDate);
          }
        }
        if (dueTime) {
          dueStr = dueStr ? (dueStr + ' ' + dueTime) : dueTime;
        }
        var taskHtml = '<b>New PM task</b>\n' +
          '<b>Title:</b> ' + escapeTelegramHtml_(title) + '\n' +
          (projectId ? '<b>Project:</b> ' + escapeTelegramHtml_(projectId) + '\n' : '') +
          (customerName ? '<b>Customer:</b> ' + escapeTelegramHtml_(customerName) + '\n' : '') +
          (customerEmail ? '<b>Email:</b> ' + escapeTelegramHtml_(customerEmail) + '\n' : '') +
          (dueStr ? '<b>Due:</b> ' + escapeTelegramHtml_(dueStr) + '\n' : '') +
          (priority ? '<b>Priority:</b> ' + escapeTelegramHtml_(priority) + '\n' : '') +
          (notes ? '<b>Notes:</b> ' + escapeTelegramHtml_(String(notes)) : '') +
          '\n<b>Task ID:</b> <code>' + escapeTelegramHtml_(taskId) + '</code>';
        var tgTask = sendTelegramBotMessage_(taskHtml, []);
        if (!tgTask.success) {
          Logger.log('Telegram PM task notify: ' + (tgTask.error || 'failed'));
        }
      }
    } catch (tgPmErr) {
      Logger.log('Telegram PM task notify error: ' + tgPmErr);
    }

    return { success: true, taskId: taskId, calendarEventId: calId };
  } catch (e) {
    Logger.log('addPmTask: ' + e);
    return { success: false, error: e.toString() };
  }
}

function updatePmTask(companyId, data) {
  try {
    var taskId = String(data.taskId || '').trim();
    if (!taskId) return { success: false, error: 'taskId is required' };

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(PM_TASKS_SHEET);
    if (!sheet) return { success: false, error: 'PM_Tasks not found' };

    var rows = sheet.getDataRange().getValues();
    var cid = String(companyId || '').trim();
    var r;
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0] || '').trim() === cid && String(rows[i][1] || '').trim() === taskId) {
        r = i + 1;
        break;
      }
    }
    if (!r) return { success: false, error: 'Task not found' };

    var row = rows[r - 1].slice();
    if (data.title !== undefined) row[2] = String(data.title);
    if (data.projectId !== undefined) row[3] = data.projectId ? String(data.projectId).trim() : '';
    if (data.customerName !== undefined) row[4] = String(data.customerName || '');
    if (data.customerEmail !== undefined) row[5] = String(data.customerEmail || '');
    if (data.dueDate !== undefined) {
      row[6] = data.dueDate ? new Date(data.dueDate) : '';
      if (row[6] && isNaN(row[6].getTime())) row[6] = '';
    }
    if (data.dueTime !== undefined) row[7] = String(data.dueTime || '');
    if (data.priority !== undefined) row[8] = String(data.priority || 'Normal');
    if (data.notes !== undefined) row[10] = String(data.notes || '');
    if (data.linkType !== undefined) row[12] = String(data.linkType || '');
    if (data.linkId !== undefined) row[13] = String(data.linkId || '');

    var rowObj = {
      taskId: taskId,
      title: row[2],
      projectId: row[3] ? String(row[3]) : '',
      customerName: row[4],
      dueDate: row[6],
      dueTime: row[7],
      notes: row[10],
      linkType: row[12],
      linkId: row[13]
    };

    var existingCal = String(row[11] || '');
    var newCal = '';
    if (rowObj.dueDate) {
      newCal = existingCal ? pmTaskCalendarUpdate_(existingCal, rowObj) : pmTaskCalendarCreate_(rowObj);
    } else {
      if (existingCal) pmTaskCalendarDelete_(existingCal);
    }
    row[11] = newCal;

    sheet.getRange(r, 1, 1, row.length).setValues([row]);

    return { success: true, taskId: taskId, calendarEventId: String(row[11] || '') };
  } catch (e) {
    Logger.log('updatePmTask: ' + e);
    return { success: false, error: e.toString() };
  }
}

function completePmTask(companyId, taskId) {
  try {
    var tid = String(taskId || '').trim();
    if (!tid) return { success: false, error: 'taskId is required' };

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(PM_TASKS_SHEET);
    var logSheet = ss.getSheetByName(PM_TASK_COMPLETIONS_SHEET);
    if (!sheet) return { success: false, error: 'PM_Tasks not found' };
    if (!logSheet) {
      setupPMTaskCompletionsSheet(ss);
      logSheet = ss.getSheetByName(PM_TASK_COMPLETIONS_SHEET);
    }

    var rows = sheet.getDataRange().getValues();
    var cid = String(companyId || '').trim();
    var r;
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0] || '').trim() === cid && String(rows[i][1] || '').trim() === tid) {
        r = i + 1;
        break;
      }
    }
    if (!r) return { success: false, error: 'Task not found' };

    var row = rows[r - 1];
    var snapTitle = String(row[2] || '');
    var projId = row[3] ? String(row[3]) : '';

    logSheet.appendRow([cid, tid, new Date(), snapTitle, projId]);

    var calEv = String(row[11] || '');
    if (calEv) pmTaskCalendarDelete_(calEv);

    var plain = pmTaskStripCompletedPrefix_(snapTitle);
    row[2] = '✅ Completed: ' + plain;
    row[9] = 'Completed';
    row[11] = '';

    sheet.getRange(r, 1, 1, row.length).setValues([row]);

    return { success: true, taskId: tid };
  } catch (e) {
    Logger.log('completePmTask: ' + e);
    return { success: false, error: e.toString() };
  }
}

function deletePmTask(companyId, taskId) {
  try {
    var tid = String(taskId || '').trim();
    if (!tid) return { success: false, error: 'taskId is required' };

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(PM_TASKS_SHEET);
    if (!sheet) return { success: false, error: 'PM_Tasks not found' };

    var rows = sheet.getDataRange().getValues();
    var cid = String(companyId || '').trim();

    for (var i = rows.length - 1; i >= 1; i--) {
      if (String(rows[i][0] || '').trim() === cid && String(rows[i][1] || '').trim() === tid) {
        var calEv = String(rows[i][11] || '');
        if (calEv) pmTaskCalendarDelete_(calEv);
        sheet.deleteRow(i + 1);
        return { success: true, taskId: tid };
      }
    }
    return { success: false, error: 'Task not found' };
  } catch (e) {
    Logger.log('deletePmTask: ' + e);
    return { success: false, error: e.toString() };
  }
}

// ============================================================================
// NOTE: doGet and doPost are in InvoiceEstimate.gs
// The functions above are called directly via google.script.run from the UI
// or via the existing doGet/doPost handlers for Webflow integration
// ============================================================================

/**
 * Debug helper: resolve linked document ID for a PM project the same way the viewer fallback does.
 * Priority: PM_Projects column B, then project JSON (estimateId/linkage first, then invoice IDs),
 * and verify candidates against Invoices & Estimates column B.
 *
 * @param {string} projectId e.g. PROJ-1777027284453
 * @param {string} expectedDocId optional e.g. EST-27228895-9294
 */
function testViewerProjectToDocResolution(projectId, expectedDocId) {
  try {
    var pid = String(projectId || '').trim();
    var expected = String(expectedDocId || '').trim();
    if (!pid) return { success: false, error: 'projectId is required' };

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var pmSheetName = (typeof PM_PROJECTS_SHEET !== 'undefined' && PM_PROJECTS_SHEET) ? PM_PROJECTS_SHEET : 'PM_Projects';
    var pmSheet = ss.getSheetByName(pmSheetName);
    if (!pmSheet) return { success: false, error: 'PM_Projects sheet not found' };

    var pmRows = pmSheet.getDataRange().getValues() || [];
    if (pmRows.length < 2) return { success: false, error: 'PM_Projects has no data rows' };

    var headers = (pmRows[0] || []).map(function(h) { return String(h || '').trim(); });
    var hasCompanyId = String(headers[0] || '').toLowerCase() === 'company id';
    var projectIdCol = -1;
    for (var hc = 0; hc < headers.length; hc++) {
      var low = String(headers[hc] || '').toLowerCase();
      if (low === 'project id' || low === 'projectid') { projectIdCol = hc; break; }
    }
    if (projectIdCol === -1) projectIdCol = hasCompanyId ? 1 : 0;

    var rowIndex = -1;
    var row = null;
    for (var i = 1; i < pmRows.length; i++) {
      if (String(pmRows[i][projectIdCol] || '').trim() === pid) {
        rowIndex = i + 1;
        row = pmRows[i];
        break;
      }
    }
    if (!row) return { success: false, error: 'Project not found in PM_Projects: ' + pid };

    var colB = String(row[1] || '').trim();

    // Parse project JSON from likely chunk locations
    var parsed = {};
    var jsonCandidates = [
      [row[2], row[3], row[4]],
      [row[3], row[4], row[5]],
      [row[4], row[5], row[6]]
    ];
    for (var jc = 0; jc < jsonCandidates.length; jc++) {
      try {
        var p1 = String(jsonCandidates[jc][0] || '');
        var p2 = String(jsonCandidates[jc][1] || '');
        var p3 = String(jsonCandidates[jc][2] || '');
        var combined = (typeof concatenateJsonChunks === 'function')
          ? concatenateJsonChunks(p1, p2, p3)
          : (p1 + p2 + p3);
        if (!combined || !String(combined).trim()) continue;
        var obj = JSON.parse(combined);
        if (obj && typeof obj === 'object') { parsed = obj; break; }
      } catch (_) {}
    }

    // Same intent as viewer: prefer estimate-linked IDs first in your model
    var candidates = [
      colB,
      parsed.estimateId,
      parsed.linkedEstimateId,
      parsed.invoiceId,
      parsed.linkedInvoiceId,
      parsed.originalEstimateId,
      parsed.sourceInvoiceId
    ]
      .map(function(v) { return String(v || '').trim(); })
      .filter(function(v) { return v && !/^PROJ-/i.test(v); });

    // De-duplicate while preserving order
    var uniq = [];
    candidates.forEach(function(v) { if (uniq.indexOf(v) === -1) uniq.push(v); });

    var ieSheet = ss.getSheetByName(INVOICES_ESTIMATES_SHEET);
    if (!ieSheet) return { success: false, error: 'Invoices & Estimates sheet not found' };
    var ieRows = ieSheet.getDataRange().getValues() || [];
    var ieIdSet = {};
    for (var r = 1; r < ieRows.length; r++) {
      var id = String(ieRows[r][1] || '').trim(); // Column B
      if (id) ieIdSet[id] = true;
    }

    var matched = '';
    for (var c = 0; c < uniq.length; c++) {
      if (ieIdSet[uniq[c]]) { matched = uniq[c]; break; }
    }

    var result = {
      success: true,
      projectId: pid,
      expectedDocId: expected || '',
      pmProjectsRow: rowIndex,
      pmProjectsColumnB: colB,
      candidateIds: uniq,
      matchedInInvoicesEstimates: matched || '',
      matchEqualsExpected: expected ? (matched === expected) : null
    };

    Logger.log('🔎 testViewerProjectToDocResolution: ' + JSON.stringify(result));
    return result;
  } catch (e) {
    Logger.log('❌ testViewerProjectToDocResolution error: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

/**
 * Ready-to-run test with your current IDs.
 */
function testViewerProjectToDocResolution_CurrentCase() {
  return testViewerProjectToDocResolution('PROJ-1777027284453', 'EST-27228895-9294');
}
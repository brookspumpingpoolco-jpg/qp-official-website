/**
 * Contract Management System
 * Handles contract creation, signing, PDF generation, and storage
 * Integrates with customer portal and uses token-based authentication
 */

// Configuration - Use same spreadsheet as InvoiceEstimate.gs
// Note: In Google Apps Script, all .gs files share global scope
// SPREADSHEET_ID is already defined in InvoiceEstimate.gs, so we don't redeclare it
// CONTRACTS_SHEET is already defined in InvoiceEstimate.gs, so we don't redeclare it

// Sheet names for contracts
const CONTRACT_TOKENS_SHEET = 'Contract_Tokens';

// Letterhead logo for all contracts (used in HTML and PDF)
const CONTRACT_LETTERHEAD_LOGO_URL = 'https://cdn.prod.website-files.com/6931dc4e8e97334e195432df/6993ce0abcd54d3520799318_IMG_1763-p-500.jpg';

// Google Drive folder for customer contract PDFs (Pool Calc and Customer Folders)
const CONTRACT_DRIVE_FOLDER_ID = '1caFBUhSzE5WNAm9vCT4dwDQuAO0iuo1h';
const CONTRACT_AUTO_SIGNER_NAME = 'Sam Roberts';
const CONTRACT_AUTO_SIGNER_TITLE = 'Vice President, A Quality Pool Company';
const CONTRACT_VIEWER_URL = 'https://www.aqualitypoolcompanyusa.com/contract-viewer';

/**
 * Parse JSON contract payload from unified web app POST.
 * Form posts use application/x-www-form-urlencoded with a `data` field; JSON.parse on the whole body fails.
 * @param {GoogleAppsScript.Events.DoPost} e
 * @returns {Object}
 */
function parseContractJsonFromPost_(e) {
  if (!e) return {};
  var raw = '';
  try {
    if (e.parameter && e.parameter.data != null && String(e.parameter.data).length) {
      raw = String(e.parameter.data);
    } else if (e.postData && e.postData.contents) {
      var ctype = String(e.postData.type || '').toLowerCase();
      if (ctype.indexOf('application/x-www-form-urlencoded') !== -1) {
        try {
          var sp = new URLSearchParams(e.postData.contents);
          if (sp.get('data')) raw = String(sp.get('data'));
        } catch (ignore) {}
      }
      if (!raw) raw = String(e.postData.contents);
    }
    raw = (raw || '').trim();
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (err) {
    Logger.log('parseContractJsonFromPost_ error: ' + err);
    return {};
  }
}

/**
 * Heuristic: full HTML document / outbound signing email must not replace legal contract text from the UI.
 * @param {string} s
 * @returns {boolean}
 */
function looksLikeFullDocumentEmailHtml_(s) {
  var t = (s == null ? '' : String(s)).trim().toLowerCase();
  if (!t) return false;
  if (t.indexOf('<!doctype html') === 0) return true;
  if (t.indexOf('<html') === 0) return true;
  if (t.indexOf('<html') !== -1 && t.indexOf('<head') !== -1 && t.indexOf('<body') !== -1) return true;
  return false;
}

/**
 * Map UI / client aliases onto contractContent & terms; strip mistaken email HTML.
 * @param {Object} patch
 * @param {{isCreate?: boolean}} options
 * @returns {Object}
 */
function normalizeContractPayloadForSave_(patch, options) {
  options = options || {};
  var isCreate = !!options.isCreate;
  if (!patch || typeof patch !== 'object') return patch;

  function trim(v) {
    return v == null ? '' : String(v).trim();
  }
  function coalesceContent_(obj, useAliases) {
    var cc = trim(obj.contractContent);
    if (!cc && useAliases) {
      cc = trim(obj.contractText) || trim(obj.agreementBody) || trim(obj.body) || trim(obj.scopeOfWork) || trim(obj.mainContractText);
    }
    if (looksLikeFullDocumentEmailHtml_(cc)) {
      Logger.log('normalizeContractPayloadForSave_: contract body looked like outbound email HTML — not storing as contract text');
      return '';
    }
    return cc;
  }
  function coalesceTerms_(obj, useAliases) {
    var t = trim(obj.terms);
    if (!t && useAliases) {
      t = trim(obj.additionalTerms) || trim(obj.termsAndConditions) || trim(obj.termsText);
    }
    if (looksLikeFullDocumentEmailHtml_(t)) {
      Logger.log('normalizeContractPayloadForSave_: terms looked like outbound email HTML — not storing');
      return '';
    }
    return t;
  }

  if (isCreate) {
    patch.contractContent = coalesceContent_(patch, true);
    patch.terms = coalesceTerms_(patch, true);
    return patch;
  }

  if (patch.contractContent !== undefined || patch.contractText !== undefined || patch.agreementBody !== undefined ||
      patch.body !== undefined || patch.scopeOfWork !== undefined || patch.mainContractText !== undefined) {
    patch.contractContent = coalesceContent_(patch, true);
  }
  if (patch.terms !== undefined || patch.additionalTerms !== undefined || patch.termsAndConditions !== undefined || patch.termsText !== undefined) {
    patch.terms = coalesceTerms_(patch, true);
  }
  return patch;
}

/**
 * Handle POST requests for contract management actions.
 *
 * IMPORTANT:
 * Do not use `doPost` here. The unified web app entry point is the
 * `doPost` in InvoiceEstimate.gs, which already routes contract actions.
 * Keeping a second `doPost` in this file can override invoice routing
 * and cause errors like: "Invalid action: sendInvoiceEstimate".
 */
function handleContractManagementPost(e) {
  try {
    const action = e.parameter.action || (e.postData && e.postData.contents ? 
      new URLSearchParams(e.postData.contents).get('action') : '');
    
    Logger.log('🔄 ContractManagement doPost action: ' + action);
    
    let result = { success: false, error: 'Invalid action: ' + action };
    
    switch (action) {
      case 'getContract':
        try {
          let contractId = e.parameter.id || '';
          if (!contractId && e.postData && e.postData.contents) {
            const params = new URLSearchParams(e.postData.contents);
            contractId = params.get('id') || '';
          }
          
          Logger.log('🔍 Getting contract: ' + contractId);
          
          if (!contractId) {
            result = { success: false, error: 'Contract ID is required' };
          } else {
            result = getContract(contractId);
          }
        } catch (error) {
          Logger.log('❌ Error in getContract: ' + error.toString());
          result = { success: false, error: 'Error retrieving contract: ' + error.toString() };
        }
        break;
        
      case 'createContract':
        try {
          const contractData = parseContractJsonFromPost_(e);
          normalizeContractPayloadForSave_(contractData, { isCreate: true });
          result = createContract(contractData);
        } catch (error) {
          result = { success: false, error: 'Error creating contract: ' + error.toString() };
        }
        break;
        
      case 'updateContract':
        try {
          const contractId = e.parameter.contractId || e.parameter.id || '';
          const contractData = parseContractJsonFromPost_(e);
          normalizeContractPayloadForSave_(contractData, { isCreate: false });
          result = updateContract(contractId, contractData);
        } catch (error) {
          result = { success: false, error: 'Error updating contract: ' + error.toString() };
        }
        break;
        
      case 'generateContractToken':
        result = generateContractToken(e.parameter.contractId, e.parameter.customerEmail);
        break;
        
      case 'validateContractToken':
        result = validateContractToken(e.parameter.contractId, e.parameter.token);
        break;
        
      case 'saveCompanySignature':
        try {
          const signatureData = JSON.parse(e.parameter.data || e.postData.contents || '{}');
          result = saveCompanySignature(signatureData.contractId, signatureData.signatureImage);
        } catch (error) {
          result = { success: false, error: 'Error saving signature: ' + error.toString() };
        }
        break;
        
      case 'saveCustomerSignature':
        try {
          const signatureData = JSON.parse(e.parameter.data || e.postData.contents || '{}');
          result = saveCustomerSignature(signatureData.contractId, signatureData.token, signatureData.signatureImage);
        } catch (error) {
          result = { success: false, error: 'Error saving customer signature: ' + error.toString() };
        }
        break;
        
      case 'sendContractToCustomer':
        try {
          const contractId = e.parameter.contractId || e.parameter.id || '';
          result = sendContractToCustomer(contractId);
        } catch (error) {
          result = { success: false, error: 'Error sending contract: ' + error.toString() };
        }
        break;
        
      case 'getAllContracts':
        result = getAllContracts();
        break;
        
      default:
        Logger.log('❌ Unknown action in ContractManagement: ' + action);
        result = { success: false, error: 'Invalid action: ' + action };
    }
    
    Logger.log('✅ ContractManagement result: ' + JSON.stringify(result).substring(0, 200));
    
    // Return JSON response
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log('❌ ContractManagement handler error: ' + error.toString());
    const errorResult = { success: false, error: error.toString() };
    return ContentService
      .createTextOutput(JSON.stringify(errorResult))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function contractXmlEscape_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildAutoCompanySignatureDataUrl_() {
  var svg = ''
    + '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="260" viewBox="0 0 900 260">'
    + '<rect width="900" height="260" fill="white"/>'
    + '<text x="40" y="125" font-family="Brush Script MT, Segoe Script, cursive" font-size="78" fill="#0f172a">'
    + contractXmlEscape_(CONTRACT_AUTO_SIGNER_NAME)
    + '</text>'
    + '<text x="42" y="178" font-family="Arial, sans-serif" font-size="24" fill="#475569">'
    + contractXmlEscape_(CONTRACT_AUTO_SIGNER_TITLE)
    + '</text>'
    + '</svg>';
  return 'data:image/svg+xml;base64,' + Utilities.base64Encode(svg);
}

/**
 * Web app bounce page (?action=sms) — same as InvoiceEstimate.doGet sms handler.
 * Phone is optional: without digits we still return a URL so Brooks gets "Open Draft Text"
 * (page shows preview + sms: link; iOS can open Messages with prefilled body only).
 */
function getContractSmsDraftUrl_(customerPhone, messageBody, customerName) {
  try {
    if (typeof ScriptApp === 'undefined' || !ScriptApp.getService) return '';
    var webAppUrl = ScriptApp.getService().getUrl();
    if (!webAppUrl) return '';
    var body = String(messageBody || '');
    if (!body) return '';
    var cleanPhone = String(customerPhone || '').replace(/\D/g, '');
    var url = webAppUrl + '?action=sms&body=' + encodeURIComponent(body)
      + '&name=' + encodeURIComponent(String(customerName || 'Customer'));
    if (cleanPhone) {
      url += '&phone=' + encodeURIComponent(cleanPhone);
    }
    return url;
  } catch (e) {
    Logger.log('getContractSmsDraftUrl_: ' + e);
    return '';
  }
}

/** Prefer contract.customerPhone; if empty, use linked project (matches payment notify path). */
function resolveContractCustomerPhone_(contract) {
  var c = contract || {};
  var raw = String(c.customerPhone || '').trim();
  if (raw.replace(/\D/g, '').length > 0) return raw;
  var pid = String(c.projectId || '').trim();
  if (pid && typeof getProject === 'function') {
    try {
      var pr = getProject(pid);
      if (pr && pr.success) {
        var pd = pr.project || pr.projectData || {};
        var fromProj = String(pd.customerPhone || pr.customerPhone || '').trim();
        if (fromProj) return fromProj;
      }
    } catch (e) {
      Logger.log('resolveContractCustomerPhone_: ' + e);
    }
  }
  return '';
}

function sendFirstMilestoneInvoiceAfterContractExecution_(contractId, contractData) {
  try {
    var contract = contractData || {};
    var projectId = String(contract.projectId || '').trim();
    if (!projectId) {
      return { success: false, error: 'Contract missing project ID' };
    }

    var projectResult = getProject(projectId);
    if (!projectResult || !projectResult.success) {
      return { success: false, error: 'Project not found for contract ' + contractId };
    }

    var projectData = projectResult.project || projectResult.projectData || {};
    var paymentSchedule = projectData.paymentSchedule || [];
    if (typeof paymentSchedule === 'string') {
      try { paymentSchedule = JSON.parse(paymentSchedule); } catch (e) { paymentSchedule = []; }
    }
    if (!Array.isArray(paymentSchedule)) paymentSchedule = [];

    var regularMilestones = paymentSchedule.filter(function(ms) {
      return ms && ms.type !== 'one-off' && parseFloat(ms.amount || ms.total || 0) > 0;
    });
    if (!regularMilestones.length) {
      return { success: false, error: 'No payment milestones configured' };
    }

    var milestoneStatus = projectData.milestoneStatus || {};
    var targetMilestone = regularMilestones.find(function(ms) {
      var key = String(ms.id || '');
      var state = milestoneStatus[key] || milestoneStatus[ms.id] || {};
      return !(state.paid === true || state.contractExecutionInvoiceSent === true);
    }) || regularMilestones[0];
    var targetKey = String(targetMilestone.id || '');
    var targetState = milestoneStatus[targetKey] || milestoneStatus[targetMilestone.id] || {};

    var invoiceId = String(targetState.invoiceId || '').trim();
    var paymentUrl = String(targetState.stripePaymentUrl || '').trim();
    if (!invoiceId) {
      var generateResult = generateMilestoneInvoice(projectId, targetMilestone.id);
      if (!generateResult || !generateResult.success) {
        return { success: false, error: generateResult ? generateResult.error : 'Failed to generate milestone invoice' };
      }
      invoiceId = generateResult.invoiceId;
      paymentUrl = generateResult.paymentUrl || '';
    }

    if (!targetState.contractExecutionInvoiceSent) {
      var emailResult = sendMilestoneInvoiceEmail(projectId, targetMilestone.id, invoiceId);
      if (!emailResult || !emailResult.success) {
        return { success: false, error: emailResult ? emailResult.error : 'Failed to send milestone invoice email' };
      }
      targetState.contractExecutionInvoiceSent = true;
      targetState.contractExecutionSentAt = new Date().toISOString();
      targetState.invoiceId = invoiceId;
      if (paymentUrl) targetState.stripePaymentUrl = paymentUrl;
      milestoneStatus[targetKey] = targetState;
      try {
        updateProject(projectId, { milestoneStatus: milestoneStatus });
      } catch (updateErr) {
        Logger.log('⚠️ Could not persist milestone email state: ' + updateErr.toString());
      }
    }

    return {
      success: true,
      projectId: projectId,
      invoiceId: invoiceId,
      milestoneId: targetMilestone.id,
      milestoneName: targetMilestone.name || 'First Payment',
      paymentUrl: paymentUrl,
      viewerUrl: 'https://www.aqualitypoolcompanyusa.com/invoice-viewer?id=' + encodeURIComponent(invoiceId),
      projectData: projectData
    };
  } catch (error) {
    Logger.log('❌ sendFirstMilestoneInvoiceAfterContractExecution_ error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

function sendBrooksContractPaymentTelegram_(contractId, contractData, invoiceInfo) {
  try {
    if (typeof sendTelegramBotMessage_ !== 'function') return;
    var contract = contractData || {};
    var info = invoiceInfo || {};
    var projectData = info.projectData || {};
    var customerName = contract.customerName || projectData.customerName || 'Customer';
    var customerPhone = projectData.customerPhone || '';
    var firstName = String(customerName || 'there').split(' ')[0] || 'there';
    var invoiceUrl = info.viewerUrl || '';
    var paymentUrl = info.paymentUrl || '';
    if (!invoiceUrl && !paymentUrl) return;

    var messageText = 'Hi ' + firstName + ', thank you for approving your estimate with A Quality Pool Company. '
      + 'Your contract is now fully executed. Your first payment invoice is ready here: ' + invoiceUrl
      + (paymentUrl ? '\n\nIf you have any trouble viewing your invoice, here is the direct secure Stripe checkout link: ' + paymentUrl : '')
      + '\n\nPlease review the terms and payment authorization section in the invoice before submitting payment. Let us know if you need anything.';

    var buttons = [];
    var draftUrl = getContractSmsDraftUrl_(customerPhone, messageText, customerName);
    if (draftUrl) buttons.push({ text: '💬 Open Draft Text', url: draftUrl });
    if (invoiceUrl) buttons.push({ text: '🔗 View Invoice', url: invoiceUrl });
    if (paymentUrl) buttons.push({ text: '💳 Direct Stripe Link', url: paymentUrl });

    var telegramHtml = '<b>✅ Contract fully executed</b>\n'
      + '<b>Contract:</b> ' + escapeTelegramHtml_(contractId) + '\n'
      + '<b>Customer:</b> ' + escapeTelegramHtml_(customerName) + '\n'
      + (info.milestoneName ? '<b>Payment:</b> ' + escapeTelegramHtml_(info.milestoneName) + '\n' : '')
      + '\n<b>Suggested customer text:</b>\n<pre>' + escapeTelegramHtml_(messageText) + '</pre>';
    sendTelegramBotMessage_(telegramHtml, buttons);
  } catch (error) {
    Logger.log('Telegram contract payment notify error: ' + error.toString());
  }
}

/**
 * Brooks Telegram when contract email goes out.
 * @return {{messageText:string,draftUrl:string,customerPhone:string}|null}
 */
function sendBrooksContractSentTelegram_(contractId, contractData, signingUrl) {
  try {
    var contract = contractData || {};
    var customerName = String(contract.customerName || 'Customer');
    var customerPhone = resolveContractCustomerPhone_(contract);
    var firstName = customerName.split(' ')[0] || 'there';
    var safeSigningUrl = String(signingUrl || '').trim();
    if (!safeSigningUrl) return null;

    var messageText = 'Hi ' + firstName + ', here is your contract from A Quality Pool Company: ' + safeSigningUrl
      + '\n\nPlease review and sign when you\'re ready. If you have any questions before signing, just reply and we\'ll help.';

    var draftUrl = getContractSmsDraftUrl_(customerPhone, messageText, customerName);

    // Always return draft fields for the API / Invoice UI — Telegram is optional.
    var meta = { messageText: messageText, draftUrl: draftUrl || '', customerPhone: customerPhone };

    if (typeof sendTelegramBotMessage_ !== 'function') {
      Logger.log('⚠️ sendTelegramBotMessage_ not available — skipping Telegram; draft URL still returned to client');
      return meta;
    }

    var buttons = [];
    if (draftUrl) buttons.push({ text: '💬 Open Draft Text', url: draftUrl });
    buttons.push({ text: '📝 Open Contract', url: safeSigningUrl });

    var telegramHtml = '<b>📨 Contract sent to customer</b>\n'
      + '<b>👤 ' + escapeTelegramHtml_(customerName) + '</b>\n'
      + (customerPhone ? '📱 ' + escapeTelegramHtml_(customerPhone) + '\n' : '')
      + '<b>💰 Amount:</b> $' + Number(contract.totalAmount || 0).toFixed(2);

    try {
      sendTelegramBotMessage_(telegramHtml, buttons);
    } catch (sendErr) {
      Logger.log('⚠️ Telegram send failed (draft still returned): ' + sendErr.toString());
    }
    return meta;
  } catch (error) {
    Logger.log('Telegram contract-sent notify error: ' + error.toString());
    return null;
  }
}

// ============================================================================
// SHEET SETUP
// ============================================================================
// Columns: Contract ID, Project ID, Customer Email, Contract JSON (3 cols), Status, Date Created, Date Signed, PDF URL

function setupContractsSheet(spreadsheet) {
  if (!spreadsheet) {
    const spreadsheetId = (typeof SPREADSHEET_ID !== 'undefined') ? SPREADSHEET_ID : CONTRACT_SPREADSHEET_ID;
    spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  }
  
  if (!spreadsheet) {
    Logger.log('❌ Failed to open spreadsheet');
    return;
  }
  
  let sheet = spreadsheet.getSheetByName(CONTRACTS_SHEET);
  
  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONTRACTS_SHEET);
    Logger.log('✅ Created Contracts sheet');
  }
  
  // Set up headers
  const headers = [
    'Contract ID',
    'Project ID',
    'Customer Email',
    'Contract JSON Part 1',
    'Contract JSON Part 2',
    'Contract JSON Part 3',
    'Status', // Draft, Sent, Signed, Cancelled
    'Date Created',
    'Date Sent',
    'Date Signed',
    'PDF URL',
    'Signed PDF URL',
    'Company Signature Image',
    'Customer Signature Image'
  ];
  
  // Only set headers if sheet is empty
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.getRange(1, 1, 1, headers.length).setBackground('#0369a1');
    sheet.getRange(1, 1, 1, headers.length).setFontColor('#ffffff');
  }
  
  // Set column widths
  sheet.setColumnWidth(1, 200); // Contract ID
  sheet.setColumnWidth(2, 150); // Project ID
  sheet.setColumnWidth(3, 200); // Customer Email
  sheet.setColumnWidth(4, 200); // JSON Part 1
  sheet.setColumnWidth(5, 200); // JSON Part 2
  sheet.setColumnWidth(6, 200); // JSON Part 3
  sheet.setColumnWidth(7, 120); // Status
  sheet.setColumnWidth(8, 150); // Date Created
  sheet.setColumnWidth(9, 150); // Date Sent
  sheet.setColumnWidth(10, 150); // Date Signed
  sheet.setColumnWidth(11, 300); // PDF URL
  sheet.setColumnWidth(12, 300); // Signed PDF URL
  sheet.setColumnWidth(13, 200); // Company Signature
  sheet.setColumnWidth(14, 200); // Customer Signature
  
  sheet.setFrozenRows(1);
  
  Logger.log('✅ Contracts sheet configured');
}

/**
 * Setup Contract_Tokens sheet
 * Columns: Token, Contract ID, Customer Email, Created Date, Expires Date, Used
 */
function setupContractTokensSheet(spreadsheet) {
  if (!spreadsheet) {
    const spreadsheetId = (typeof SPREADSHEET_ID !== 'undefined') ? SPREADSHEET_ID : CONTRACT_SPREADSHEET_ID;
    spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  }
  
  if (!spreadsheet) {
    Logger.log('❌ Failed to open spreadsheet');
    return;
  }
  
  let sheet = spreadsheet.getSheetByName(CONTRACT_TOKENS_SHEET);
  
  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONTRACT_TOKENS_SHEET);
    Logger.log('✅ Created Contract_Tokens sheet');
  }
  
  // Set up headers
  const headers = [
    'Token',
    'Contract ID',
    'Customer Email',
    'Created Date',
    'Expires Date',
    'Used',
    'Date Used'
  ];
  
  // Only set headers if sheet is empty
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.getRange(1, 1, 1, headers.length).setBackground('#0369a1');
    sheet.getRange(1, 1, 1, headers.length).setFontColor('#ffffff');
  }
  
  // Set column widths
  sheet.setColumnWidth(1, 300); // Token
  sheet.setColumnWidth(2, 200); // Contract ID
  sheet.setColumnWidth(3, 200); // Customer Email
  sheet.setColumnWidth(4, 150); // Created Date
  sheet.setColumnWidth(5, 150); // Expires Date
  sheet.setColumnWidth(6, 100); // Used
  sheet.setColumnWidth(7, 150); // Date Used
  
  sheet.setFrozenRows(1);
  
  Logger.log('✅ Contract_Tokens sheet configured');
}

/**
 * Initialize contract management sheets
 */
function initializeContractSheets() {
  const spreadsheetId = (typeof SPREADSHEET_ID !== 'undefined') ? SPREADSHEET_ID : CONTRACT_SPREADSHEET_ID;
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  setupContractsSheet(spreadsheet);
  setupContractTokensSheet(spreadsheet);
  setupContractAccessLogsSheet(spreadsheet);
  return { success: true, message: 'Contract sheets initialized successfully' };
}

// ============================================================================
// CONTRACT CREATION
// ============================================================================

/**
 * Create a new contract
 * @param {object} contractData - Contract data including projectId, customerEmail, contractContent, etc.
 * @returns {object} - Success status and contract ID
 */
function createContract(contractData) {
  try {
    normalizeContractPayloadForSave_(contractData, { isCreate: true });
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let contractsSheet = spreadsheet.getSheetByName(CONTRACTS_SHEET);
    
    if (!contractsSheet) {
      setupContractsSheet(spreadsheet);
      contractsSheet = spreadsheet.getSheetByName(CONTRACTS_SHEET);
    }
    
    // Generate contract ID
    const contractId = 'CONTRACT-' + new Date().getTime();
    
    // Prepare contract data
    const contract = {
      id: contractId,
      projectId: contractData.projectId || '',
      customerEmail: contractData.customerEmail || '',
      customerName: contractData.customerName || '',
      customerAddress: contractData.customerAddress || '',
      contractTitle: contractData.contractTitle || 'Service Agreement',
      contractContent: contractData.contractContent || '',
      terms: contractData.terms || '',
      totalAmount: contractData.totalAmount || 0,
      paymentSchedule: contractData.paymentSchedule || [],
      contractType: contractData.contractType || '',
      status: 'Draft',
      dateCreated: new Date().toISOString(),
      dateSent: null,
      dateSigned: null,
      companySignature: contractData.companySignature || null,
      companyPrintedName: contractData.companyPrintedName || CONTRACT_AUTO_SIGNER_NAME,
      companyTitle: contractData.companyTitle || CONTRACT_AUTO_SIGNER_TITLE,
      customerSignature: null,
      pdfUrl: null,
      signedPdfUrl: null
    };
    
    // Auto-sign WeeklyService contracts since they're standardized
    if (contract.contractType === 'WeeklyService') {
      contract.companySignature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='; // Placeholder signature
      Logger.log('✅ Auto-signed WeeklyService contract as company: ' + contractId);
    }
    
    // Convert to JSON and split into chunks
    const contractJson = JSON.stringify(contract);
    const chunks = chunkJsonData(contractJson, 50000);
    
    // Save to sheet
    contractsSheet.appendRow([
      contractId,
      contract.projectId,
      contract.customerEmail,
      chunks[0] || '',
      chunks[1] || '',
      chunks[2] || '',
      'Draft',
      new Date(),
      '', // Date Sent
      '', // Date Signed
      '', // PDF URL
      '', // Signed PDF URL
      contract.companySignature || '', // Company Signature (auto-filled for WeeklyService)
      ''  // Customer Signature
    ]);
    
    Logger.log('✅ Contract created: ' + contractId);
    
    return {
      success: true,
      contractId: contractId,
      contract: contract
    };
  } catch (error) {
    Logger.log('❌ Error creating contract: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Get contract by ID
 * @param {string} contractId - Contract ID
 * @returns {object} - Contract data
 */
function getContract(contractId) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const contractsSheet = spreadsheet.getSheetByName(CONTRACTS_SHEET);
    
    if (!contractsSheet) {
      return { success: false, error: 'Contracts sheet not found' };
    }
    
    const data = contractsSheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim() === String(contractId).trim()) {
        // Reconstruct JSON
        const jsonPart1 = data[i][3] || '';
        const jsonPart2 = data[i][4] || '';
        const jsonPart3 = data[i][5] || '';
        const jsonStr = jsonPart1 + jsonPart2 + jsonPart3;
        
        if (jsonStr) {
          const contract = JSON.parse(jsonStr);
          
          // Add sheet data
          contract.status = data[i][6] || 'Draft';
          contract.dateCreated = data[i][7] ? new Date(data[i][7]).toISOString() : null;
          contract.dateSent = data[i][8] ? new Date(data[i][8]).toISOString() : null;
          contract.dateSigned = data[i][9] ? new Date(data[i][9]).toISOString() : null;
          contract.pdfUrl = data[i][10] || '';
          contract.signedPdfUrl = data[i][11] || '';
          contract.companySignature = data[i][12] || contract.companySignature || '';
          contract.customerSignature = data[i][13] || contract.customerSignature || '';
          
          return {
            success: true,
            data: contract
          };
        }
      }
    }
    
    return { success: false, error: 'Contract not found' };
  } catch (error) {
    Logger.log('❌ Error getting contract: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Update an existing contract (Draft or Sent only; signed contracts cannot be edited).
 * @param {string} contractId - Contract ID
 * @param {object} contractData - Fields to update (projectId, customerEmail, contractTitle, contractContent, terms, totalAmount, etc.)
 * @returns {object} - Success status
 */
function updateContract(contractId, contractData) {
  try {
    normalizeContractPayloadForSave_(contractData, { isCreate: false });
    const contractResult = getContract(contractId);
    if (!contractResult.success) {
      return { success: false, error: contractResult.error || 'Contract not found' };
    }
    const contract = contractResult.data;
    if (contract.status === 'Signed') {
      return { success: false, error: 'Signed contracts cannot be edited.' };
    }
    if (contract.status === 'Awaiting Company Signature') {
      return { success: false, error: 'Contract is awaiting your signature. Sign it or cancel before editing.' };
    }

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const contractsSheet = spreadsheet.getSheetByName(CONTRACTS_SHEET);
    if (!contractsSheet) {
      return { success: false, error: 'Contracts sheet not found' };
    }

    // Apply updates (only allow updating editable fields)
    if (contractData.projectId !== undefined) contract.projectId = contractData.projectId;
    if (contractData.customerEmail !== undefined) contract.customerEmail = contractData.customerEmail;
    if (contractData.customerName !== undefined) contract.customerName = contractData.customerName;
    if (contractData.customerAddress !== undefined) contract.customerAddress = contractData.customerAddress;
    if (contractData.contractTitle !== undefined) contract.contractTitle = contractData.contractTitle;
    if (contractData.contractContent !== undefined) contract.contractContent = contractData.contractContent;
    if (contractData.terms !== undefined) contract.terms = contractData.terms;
    if (contractData.totalAmount !== undefined) contract.totalAmount = contractData.totalAmount;
    if (contractData.paymentSchedule !== undefined) contract.paymentSchedule = contractData.paymentSchedule;

    const data = contractsSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim() !== String(contractId).trim()) continue;
      const updatedJson = JSON.stringify(contract);
      const chunks = chunkJsonData(updatedJson, 50000);
      contractsSheet.getRange(i + 1, 4).setValue(chunks[0] || '');
      contractsSheet.getRange(i + 1, 5).setValue(chunks[1] || '');
      contractsSheet.getRange(i + 1, 6).setValue(chunks[2] || '');
      Logger.log('✅ Contract updated: ' + contractId);
      return { success: true, contractId: contractId };
    }
    return { success: false, error: 'Contract not found' };
  } catch (error) {
    Logger.log('❌ Error updating contract: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================

/**
 * Generate contract signing token
 * @param {string} contractId - Contract ID
 * @param {string} customerEmail - Customer email
 * @returns {object} - Token and signing URL
 */
function generateContractToken(contractId, customerEmail) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let tokensSheet = spreadsheet.getSheetByName(CONTRACT_TOKENS_SHEET);
    
    if (!tokensSheet) {
      setupContractTokensSheet(spreadsheet);
      tokensSheet = spreadsheet.getSheetByName(CONTRACT_TOKENS_SHEET);
    }
    
    // Generate secure token
    const token = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      contractId + customerEmail + new Date().getTime() + 'CONTRACT_SECRET_2024'
    ).map(byte => ('0' + (byte & 0xFF).toString(16)).slice(-2)).join('');
    
    const createdDate = new Date();
    const expiresDate = new Date(createdDate.getTime() + (90 * 24 * 60 * 60 * 1000)); // 90 days
    
    // Save token
    tokensSheet.appendRow([
      token,
      contractId,
      customerEmail,
      createdDate,
      expiresDate,
      false, // Used
      '' // Date Used
    ]);
    
    // Generate signing URL
    const signingUrl = CONTRACT_VIEWER_URL + '?id=' + encodeURIComponent(String(contractId || '')) + '&token=' + encodeURIComponent(String(token || ''));
    
    Logger.log('✅ Contract token generated: ' + contractId);
    
    return {
      success: true,
      token: token,
      signingUrl: signingUrl,
      expiresDate: expiresDate.toISOString()
    };
  } catch (error) {
    Logger.log('❌ Error generating contract token: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Validate contract token
 * @param {string} contractId - Contract ID
 * @param {string} token - Security token
 * @returns {object} - Validation result
 */
function validateContractToken(contractId, token) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const tokensSheet = spreadsheet.getSheetByName(CONTRACT_TOKENS_SHEET);
    
    if (!tokensSheet) {
      return { success: false, error: 'Tokens sheet not found' };
    }
    
    const data = tokensSheet.getDataRange().getValues();
    const now = new Date();
    
    for (let i = 1; i < data.length; i++) {
      const tokenFromSheet = String(data[i][0] || '').trim();
      const contractIdFromSheet = String(data[i][1] || '').trim();
      const expiresDate = data[i][4];
      
      if (tokenFromSheet === token && contractIdFromSheet === contractId) {
        // Check expiration
        if (expiresDate && new Date(expiresDate) < now) {
          return { success: false, error: 'Token has expired' };
        }
        
        return {
          success: true,
          customerEmail: data[i][2] || '',
          used: data[i][5] === true || data[i][5] === 'TRUE'
        };
      }
    }
    
    return { success: false, error: 'Invalid token' };
  } catch (error) {
    Logger.log('❌ Error validating contract token: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Mark token as used
 * @param {string} token - Token to mark as used
 */
function markContractTokenAsUsed(token) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const tokensSheet = spreadsheet.getSheetByName(CONTRACT_TOKENS_SHEET);
    
    if (!tokensSheet) {
      return;
    }
    
    const data = tokensSheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim() === String(token).trim()) {
        tokensSheet.getRange(i + 1, 6).setValue(true); // Used
        tokensSheet.getRange(i + 1, 7).setValue(new Date()); // Date Used
        break;
      }
    }
  } catch (error) {
    Logger.log('⚠️ Error marking token as used: ' + error.toString());
  }
}

// ============================================================================
// SIGNATURE HANDLING
// ============================================================================

/**
 * Ensure recurring weekly-service appointments are created once after full signing.
 * Creates the first appointment on startDate, then schedules remaining recurring visits.
 * @param {string} contractId
 * @param {object} contract
 * @param {GoogleAppsScript.Spreadsheet.Sheet} contractsSheet
 * @param {number} rowNumber 1-based row number in CONTRACTS_SHEET
 * @returns {{created:boolean, skipped:boolean, reason:string}}
 */
function ensureWeeklyServiceRecurringAppointments_(contractId, contract, contractsSheet, rowNumber) {
  try {
    if (!contract || contract.contractType !== 'WeeklyService') {
      return { created: false, skipped: true, reason: 'not-weekly-service' };
    }

    if (contract.recurringAppointmentsCreatedAt) {
      return { created: false, skipped: true, reason: 'already-created' };
    }

    const startDate = String(contract.startDate || '').trim();
    if (!startDate) {
      Logger.log('⚠️ Weekly recurring schedule skipped (missing startDate): ' + contractId);
      return { created: false, skipped: true, reason: 'missing-start-date' };
    }

    const frequency = String(contract.frequency || 'weekly').toLowerCase().trim();
    if (['weekly', 'biweekly', 'monthly'].indexOf(frequency) === -1) {
      Logger.log('⚠️ Weekly recurring schedule skipped (unsupported frequency): ' + frequency + ' for ' + contractId);
      return { created: false, skipped: true, reason: 'unsupported-frequency' };
    }

    if (typeof createRecurringAppointments !== 'function') {
      Logger.log('❌ createRecurringAppointments function not found for contract: ' + contractId);
      return { created: false, skipped: true, reason: 'missing-createRecurringAppointments' };
    }

    const scheduleBase = {
      companyId: contract.companyId || '',
      customerId: contract.customerId || '',
      customerName: contract.customerName || '',
      customerEmail: contract.customerEmail || '',
      customerPhone: contract.customerPhone || '',
      address: contract.serviceAddress || contract.customerAddress || '',
      serviceType: contract.serviceType || 'Weekly Pool Service',
      appointmentType: 'Regular',
      customAppointmentNote: 'Weekly service contract ' + contractId,
      time: contract.serviceTime || '',
      duration: Number(contract.serviceDuration || 60),
      description: contract.contractTitle || 'Weekly service visit',
      assignedTo: contract.assignedTo || '',
      estimatedCost: Number(contract.pricePerVisit || 0),
      recurring: frequency,
      addToCalendar: true,
      linkedProjectId: contract.projectId || '',
      linkedContractId: contractId
    };

    // First visit on selected start date.
    try {
      createInitialWeeklyServiceAppointment_(scheduleBase, startDate);
    } catch (firstErr) {
      Logger.log('⚠️ Could not create initial weekly appointment for ' + contractId + ': ' + firstErr.toString());
    }

    // Remaining recurring visits after first visit
    const additionalCount = frequency === 'weekly' ? 25 : frequency === 'biweekly' ? 12 : 5;
    if (additionalCount > 0) {
      createRecurringAppointments({
        date: startDate,
        recurring: frequency,
        recurringCount: additionalCount,
        companyId: scheduleBase.companyId,
        customerId: scheduleBase.customerId,
        customerName: scheduleBase.customerName,
        customerEmail: scheduleBase.customerEmail,
        customerPhone: scheduleBase.customerPhone,
        address: scheduleBase.address,
        serviceType: scheduleBase.serviceType,
        appointmentType: scheduleBase.appointmentType,
        customAppointmentNote: scheduleBase.customAppointmentNote,
        time: scheduleBase.time,
        duration: scheduleBase.duration,
        description: scheduleBase.description,
        assignedTo: scheduleBase.assignedTo,
        estimatedCost: scheduleBase.estimatedCost,
        addToCalendar: scheduleBase.addToCalendar,
        linkedProjectId: scheduleBase.linkedProjectId
      });
    }

    contract.recurringAppointmentsCreatedAt = new Date().toISOString();
    contract.recurringAppointmentsCreatedBy = 'contract-signature-finalization';
    contract.recurringAppointmentsCount = additionalCount + 1;
    contract.recurringAppointmentsStartDate = startDate;

    const updatedJson = JSON.stringify(contract);
    const chunks = chunkJsonData(updatedJson, 50000);
    contractsSheet.getRange(rowNumber, 4).setValue(chunks[0] || '');
    contractsSheet.getRange(rowNumber, 5).setValue(chunks[1] || '');
    contractsSheet.getRange(rowNumber, 6).setValue(chunks[2] || '');

    Logger.log('✅ Weekly recurring appointments created for contract: ' + contractId);
    return { created: true, skipped: false, reason: '' };
  } catch (error) {
    Logger.log('❌ ensureWeeklyServiceRecurringAppointments_ error (' + contractId + '): ' + error.toString());
    return { created: false, skipped: true, reason: 'error' };
  }
}

/**
 * Create the first weekly-service appointment on the chosen start date.
 * @param {object} data
 * @param {string} dateStr yyyy-MM-dd
 */
function createInitialWeeklyServiceAppointment_(data, dateStr) {
  const sheet = getOrCreateSheet(APPOINTMENTS_SHEET, getAppointmentsHeaders());
  const now = new Date().toISOString();
  const appointmentId = 'APPT-' + Date.now() + '-WS0';
  let calId = '';

  if (data.addToCalendar !== false) {
    try {
      calId = addToGoogleCalendar({
        id: appointmentId,
        date: dateStr,
        time: data.time || '',
        duration: data.duration || 60,
        customerName: data.customerName || '',
        customerEmail: data.customerEmail || '',
        customerPhone: data.customerPhone || '',
        address: data.address || '',
        serviceType: data.serviceType || '',
        description: data.description || '',
        assignedTo: data.assignedTo || '',
        estimatedCost: data.estimatedCost || 0
      });
    } catch (e) {
      Logger.log('⚠️ Initial weekly appointment calendar create failed: ' + e.toString());
    }
  }

  sheet.appendRow([
    appointmentId, data.companyId || '', data.customerId || '',
    data.customerName || '', data.customerEmail || '', data.customerPhone || '',
    data.address || '', data.serviceType || '', data.appointmentType || 'Regular',
    data.customAppointmentNote || '', dateStr, data.time || '',
    data.duration || 60, data.description || '', data.assignedTo || '', 'Scheduled',
    data.estimatedCost || 0, 0,
    'Recurring first visit (' + (data.recurring || 'weekly') + ') from contract ' + (data.linkedContractId || ''),
    data.recurring || '', 'No', 'No', calId, 'No', '',
    now, now,
    data.linkedProjectId || ''
  ]);
}

/**
 * Save company signature to contract. If customer has already signed, finalizes contract:
 * sets status to Signed, generates signed PDF, saves to Drive folder, emails customer.
 * @param {string} contractId - Contract ID
 * @param {string} signatureImage - Base64 encoded signature image
 * @returns {object} - Success status and optional signedPdfUrl
 */
function saveCompanySignature(contractId, signatureImage) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const contractsSheet = spreadsheet.getSheetByName(CONTRACTS_SHEET);
    
    if (!contractsSheet) {
      return { success: false, error: 'Contracts sheet not found' };
    }
    
    const data = contractsSheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim() !== String(contractId).trim()) continue;
      
      const jsonPart1 = data[i][3] || '';
      const jsonPart2 = data[i][4] || '';
      const jsonPart3 = data[i][5] || '';
      const jsonStr = jsonPart1 + jsonPart2 + jsonPart3;
      
      if (!jsonStr) {
        contractsSheet.getRange(i + 1, 13).setValue(signatureImage);
        return { success: true };
      }
      
      const contract = JSON.parse(jsonStr);
      contract.companySignature = signatureImage;
      const hadCustomerSignature = !!(contract.customerSignature);
      
      if (hadCustomerSignature) {
        contract.status = 'Signed';
        contract.dateSigned = new Date().toISOString();
      }
      
      const updatedJson = JSON.stringify(contract);
      const chunks = chunkJsonData(updatedJson, 50000);
      contractsSheet.getRange(i + 1, 4).setValue(chunks[0] || '');
      contractsSheet.getRange(i + 1, 5).setValue(chunks[1] || '');
      contractsSheet.getRange(i + 1, 6).setValue(chunks[2] || '');
      contractsSheet.getRange(i + 1, 13).setValue(signatureImage);
      
      if (hadCustomerSignature) {
        contractsSheet.getRange(i + 1, 7).setValue('Signed');
        contractsSheet.getRange(i + 1, 10).setValue(new Date());
      }
      
      Logger.log('✅ Company signature saved for contract: ' + contractId);
      
      if (hadCustomerSignature) {
        ensureWeeklyServiceRecurringAppointments_(contractId, contract, contractsSheet, i + 1);
        var pdfResult = {};
        try {
          pdfResult = generateSignedContractPDF(contractId) || {};
        } catch (pdfErr) {
          Logger.log('⚠️ PDF generation error (will still send email): ' + pdfErr.toString());
          pdfResult = { success: false, error: pdfErr.toString() };
        }
        if (pdfResult.success && pdfResult.pdfUrl) {
          contractsSheet.getRange(i + 1, 12).setValue(pdfResult.pdfUrl);
        }
        // Always send invoice + email regardless of PDF outcome
        var invoiceInfo = sendFirstMilestoneInvoiceAfterContractExecution_(contractId, contract);
        sendFullySignedContractEmailToCustomer(contractId, invoiceInfo, pdfResult);
        if (invoiceInfo && invoiceInfo.success) {
          sendBrooksContractPaymentTelegram_(contractId, contract, invoiceInfo);
        }
        return { success: true, signedPdfUrl: pdfResult.pdfUrl || '', finalized: true };
      }
      return { success: true };
    }
    
    return { success: false, error: 'Contract not found' };
  } catch (error) {
    Logger.log('❌ Error saving company signature: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Send customer their signed contract PDF and next-steps message (payment/materials/appointment).
 * @param {string} contractId
 * @param {object} invoiceInfo - result from sendFirstMilestoneInvoiceAfterContractExecution_
 * @param {object} [pdfResult] - result from generateSignedContractPDF (optional, used to get blob directly)
 */
function sendFullySignedContractEmailToCustomer(contractId, invoiceInfo, pdfResult) {
  try {
    const contractResult = getContract(contractId);
    if (!contractResult.success || !contractResult.data) {
      Logger.log('⚠️ sendFullySignedContractEmailToCustomer: could not load contract ' + contractId);
      return;
    }
    
    const c = contractResult.data;
    
    // Check if this is a weekly service contract — send special completion email
    if (c.contractType === 'WeeklyService') {
      return sendWeeklyServiceContractCompleteEmail_(contractId, c);
    }
    
    // Never block on missing signedPdfUrl — try every available source for the blob
    let pdfBlob = null;
    try {
      // 1. Best: use the file ID returned directly from generateSignedContractPDF
      if (pdfResult && pdfResult.success && pdfResult.pdfFileId) {
        pdfBlob = DriveApp.getFileById(pdfResult.pdfFileId).getBlob();
        pdfBlob.setName('Signed_Contract_' + contractId + '.pdf');
      }
    } catch (e1) {
      Logger.log('PDF blob from pdfResult.pdfFileId failed: ' + e1.toString());
    }
    if (!pdfBlob) {
      try {
        // 2. Fallback: extract file ID from the signedPdfUrl stored on the contract
        const signedPdfUrl = (pdfResult && pdfResult.pdfUrl) || c.signedPdfUrl || '';
        const fileIdMatch = signedPdfUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (fileIdMatch && fileIdMatch[1]) {
          pdfBlob = DriveApp.getFileById(fileIdMatch[1]).getBlob();
          pdfBlob.setName('Signed_Contract_' + contractId + '.pdf');
        }
      } catch (e2) {
        Logger.log('PDF blob from signedPdfUrl failed: ' + e2.toString());
      }
    }
    if (!pdfBlob) {
      Logger.log('⚠️ No PDF blob available for contract email — sending without attachment: ' + contractId);
    }
    
    const paymentReceivedNote = 'If payment has been received already, we will start ordering materials and you will receive an email or phone call with your appointment to complete the job.';
    const invoiceSection = (invoiceInfo && invoiceInfo.success) ? `
      <div style="margin-top: 24px; padding: 18px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px;">
        <p style="margin: 0 0 10px 0; font-size: 15px; font-weight: 700; color: #0f172a;">Your first payment invoice is ready</p>
        <p style="margin: 0 0 14px 0; color: #475569; font-size: 14px; line-height: 1.6;">
          We have also emailed your first payment invoice for <strong>${invoiceInfo.milestoneName || 'your first payment'}</strong>.
          That invoice includes your terms and payment authorization section.
        </p>
        <p style="margin: 0 0 12px 0; text-align: center;">
          <a href="${invoiceInfo.viewerUrl}" style="display: inline-block; background: #0369a1; color: white; padding: 13px 22px; text-decoration: none; border-radius: 8px; font-weight: 700;">View Invoice</a>
        </p>
        ${invoiceInfo.paymentUrl ? `<p style="margin: 0; color: #64748b; font-size: 13px; line-height: 1.6;">Having trouble viewing your invoice? Here is the direct secure Stripe checkout link:<br><a href="${invoiceInfo.paymentUrl}" style="color: #0369a1; word-break: break-all; text-decoration: underline;">${invoiceInfo.paymentUrl}</a></p>` : ''}
      </div>
    ` : '';
    
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #0369a1;">
          <img src="${CONTRACT_LETTERHEAD_LOGO_URL}" alt="A Quality Pool Company" style="max-width: 180px; height: auto;" />
          <p style="margin: 8px 0 0 0; font-size: 18px; font-weight: 700; color: #0369a1;">A Quality Pool Company</p>
        </div>
        <div style="padding: 24px;">
          <p>Dear ${c.customerName || 'Customer'},</p>
          <p>Your contract <strong>${contractId}</strong> has been fully signed. Please find your copy attached.</p>
          <p style="margin-top: 20px; padding: 16px; background: #f0f9ff; border-left: 4px solid #0369a1; border-radius: 4px;">
            ${paymentReceivedNote}
          </p>
          ${invoiceSection}
          <p>If you have any questions, contact us at samr@aqualitypoolcompanyusa.com or (502) 731-9217.</p>
        </div>
      </div>
    `;
    
    const emailOptions = {
      to: c.customerEmail,
      subject: 'Your signed contract – ' + (c.contractTitle || 'Service Agreement') + ' – A Quality Pool Company',
      htmlBody: htmlBody
    };
    if (pdfBlob) {
      emailOptions.attachments = [pdfBlob];
    }
    MailApp.sendEmail(emailOptions);
    Logger.log('✅ Fully-signed contract email sent to customer: ' + c.customerEmail);
  } catch (error) {
    Logger.log('❌ Error sending fully-signed contract email: ' + error.toString());
  }
}

/**
 * Save customer signature and finalize contract
 * @param {string} contractId - Contract ID
 * @param {string} token - Security token
 * @param {string} signatureImage - Base64 encoded signature image
 * @returns {object} - Success status
 */
function saveCustomerSignature(contractId, token, signatureImage) {
  try {
    // Validate token
    const tokenValidation = validateContractToken(contractId, token);
    if (!tokenValidation.success) {
      return { success: false, error: 'Invalid or expired token' };
    }
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const contractsSheet = spreadsheet.getSheetByName(CONTRACTS_SHEET);
    
    if (!contractsSheet) {
      return { success: false, error: 'Contracts sheet not found' };
    }
    
    const data = contractsSheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim() === String(contractId).trim()) {
        // Update contract JSON
        const jsonPart1 = data[i][3] || '';
        const jsonPart2 = data[i][4] || '';
        const jsonPart3 = data[i][5] || '';
        const jsonStr = jsonPart1 + jsonPart2 + jsonPart3;
        
        if (jsonStr) {
          const contract = JSON.parse(jsonStr);
          contract.customerSignature = signatureImage;
          const alreadyCompanySigned = !!(contract.companySignature);
          contract.status = alreadyCompanySigned ? 'Signed' : 'Awaiting Company Signature';
          if (alreadyCompanySigned) {
            contract.dateSigned = new Date().toISOString();
          }
          
          // Save back to sheet
          const updatedJson = JSON.stringify(contract);
          const chunks = chunkJsonData(updatedJson, 50000);
          
          contractsSheet.getRange(i + 1, 4).setValue(chunks[0] || '');
          contractsSheet.getRange(i + 1, 5).setValue(chunks[1] || '');
          contractsSheet.getRange(i + 1, 6).setValue(chunks[2] || '');

          if (alreadyCompanySigned) {
            contractsSheet.getRange(i + 1, 7).setValue('Signed');
            contractsSheet.getRange(i + 1, 10).setValue(new Date());
          }
        }
        
        contractsSheet.getRange(i + 1, 14).setValue(signatureImage);
        
        // Mark token as used so customer cannot sign again
        markContractTokenAsUsed(token);

        const latestContractResult = getContract(contractId);
        const latestContract = (latestContractResult && latestContractResult.success && latestContractResult.data) ? latestContractResult.data : null;
        if (latestContract && latestContract.companySignature) {
          // Check if this is a WeeklyService contract for special handling
          if (latestContract.contractType === 'WeeklyService') {
            Logger.log('✅ WeeklyService contract fully signed, sending welcome message: ' + contractId);
            
            // Generate PDF
            var finalizedPdf = {};
            try {
              finalizedPdf = generateSignedContractPDF(contractId) || {};
            } catch (pdfErr) {
              Logger.log('⚠️ PDF generation error (will still send email): ' + pdfErr.toString());
              finalizedPdf = { success: false, error: pdfErr.toString() };
            }
            if (finalizedPdf.success && finalizedPdf.pdfUrl) {
              try {
                var ss2 = SpreadsheetApp.openById(SPREADSHEET_ID);
                var cs2 = ss2.getSheetByName(CONTRACTS_SHEET);
                var rows2 = cs2.getDataRange().getValues();
                for (var ri = 1; ri < rows2.length; ri++) {
                  if (String(rows2[ri][0] || '').trim() === String(contractId).trim()) {
                    cs2.getRange(ri + 1, 12).setValue(finalizedPdf.pdfUrl);
                    break;
                  }
                }
              } catch (sheetErr) { Logger.log('Sheet update for pdfUrl failed: ' + sheetErr.toString()); }
            }
            
            // Send WeeklyService welcome email
            sendWeeklyServiceWelcomeEmail(contractId, latestContract, finalizedPdf);
            
            // Send WeeklyService Telegram notification
            sendWeeklyServiceWelcomeTelegram(contractId, latestContract);
            
            // Set up recurring appointments
            ensureWeeklyServiceRecurringAppointments_(contractId, latestContract, contractsSheet, i + 1);
            
            return {
              success: true,
              message: 'Weekly service contract signed successfully! Welcome message sent.',
              finalized: true,
              signedPdfUrl: finalizedPdf && finalizedPdf.success ? finalizedPdf.pdfUrl || '' : ''
            };
          } else {
            // Regular contract flow for non-WeeklyService contracts
            ensureWeeklyServiceRecurringAppointments_(contractId, latestContract, contractsSheet, i + 1);
            var finalizedPdf = {};
            try {
              finalizedPdf = generateSignedContractPDF(contractId) || {};
            } catch (pdfErr) {
              Logger.log('⚠️ PDF generation error (will still send email): ' + pdfErr.toString());
              finalizedPdf = { success: false, error: pdfErr.toString() };
            }
            if (finalizedPdf.success && finalizedPdf.pdfUrl) {
              try {
                var ss2 = SpreadsheetApp.openById(SPREADSHEET_ID);
                var cs2 = ss2.getSheetByName(CONTRACTS_SHEET);
                var rows2 = cs2.getDataRange().getValues();
                for (var ri = 1; ri < rows2.length; ri++) {
                  if (String(rows2[ri][0] || '').trim() === String(contractId).trim()) {
                    cs2.getRange(ri + 1, 12).setValue(finalizedPdf.pdfUrl);
                    break;
                  }
                }
              } catch (sheetErr) { Logger.log('Sheet update for pdfUrl failed: ' + sheetErr.toString()); }
            }
            // Always send invoice + email regardless of PDF outcome
            var invoiceInfo = sendFirstMilestoneInvoiceAfterContractExecution_(contractId, latestContract);
            sendFullySignedContractEmailToCustomer(contractId, invoiceInfo, finalizedPdf);
            if (invoiceInfo && invoiceInfo.success) {
              sendBrooksContractPaymentTelegram_(contractId, latestContract, invoiceInfo);
            }
          }
          Logger.log('✅ Customer signature completed fully executed contract: ' + contractId);
          return {
            success: true,
            message: 'Contract fully signed. Your executed contract and first payment invoice have been sent.',
            finalized: true,
            signedPdfUrl: finalizedPdf && finalizedPdf.success ? finalizedPdf.pdfUrl || '' : ''
          };
        }

        // Update status: awaiting YOUR (company) signature — do not set Date Signed yet
        contractsSheet.getRange(i + 1, 7).setValue('Awaiting Company Signature');
        
        // Notify company: contract awaits your signature — send email with direct link
        try {
          const contractResult = getContract(contractId);
          if (contractResult.success && contractResult.data) {
            const c = contractResult.data;
            const dashboardUrl = 'https://aesthetic-kataifi-88ba27.netlify.app/InvoiceEstimateUI.html#contracts';
            const subject = 'Action required: Contract signed by customer – ' + (c.contractTitle || 'Service Agreement') + ' – Sign now';
            const htmlBody = '<div style="font-family: Arial, sans-serif; max-width: 560px;">' +
              '<div style="background: linear-gradient(135deg, #0369a1 0%, #0284c7 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0;">' +
              '<h2 style="margin: 0; font-size: 18px;">Contract signed by customer</h2>' +
              '<p style="margin: 8px 0 0 0; opacity: 0.95;">Action required: add your signature</p>' +
              '</div>' +
              '<div style="padding: 24px; background: #f9fafb; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">' +
              '<p style="margin: 0 0 12px 0;"><strong>Contract:</strong> ' + (c.contractTitle || 'Service Agreement') + '</p>' +
              '<p style="margin: 0 0 12px 0;"><strong>Contract ID:</strong> ' + contractId + '</p>' +
              '<p style="margin: 0 0 12px 0;"><strong>Customer:</strong> ' + (c.customerName || '') + ' &lt;' + (c.customerEmail || '') + '&gt;</p>' +
              '<p style="margin: 0 0 20px 0;"><strong>Amount:</strong> $' + parseFloat(c.totalAmount || 0).toFixed(2) + '</p>' +
              '<p style="margin: 0 0 20px 0;">Open your Invoice/Estimate dashboard and sign this contract. It will appear under <strong>Contracts</strong> or <strong>Invoices → Pending Actions → Contracts Awaiting Your Signature</strong>.</p>' +
              '<p style="margin: 0 0 16px 0;"><a href="' + dashboardUrl + '" style="display: inline-block; background: #0369a1; color: white; padding: 14px 24px; text-decoration: none; border-radius: 8px; font-weight: 700;">Open dashboard and sign contract</a></p>' +
              '<p style="margin: 0; font-size: 13px; color: #6b7280;">If the button does not work, copy this link: ' + dashboardUrl + '</p>' +
              '</div></div>';
            MailApp.sendEmail({
              to: 'samr@aqualitypoolcompanyusa.com',
              subject: subject,
              htmlBody: htmlBody
            });
            try {
              Logger.log('📞 Attempting to send customer signature Telegram notification for contract: ' + contractId);
              if (typeof sendTelegramBotMessage_ === 'function') {
                const telegramMessage = '<b>✍️ Contract signed by customer</b>\n'
                  + '<b>Contract ID:</b> ' + escapeTelegramHtml_(contractId) + '\n'
                  + '<b>Customer:</b> ' + escapeTelegramHtml_(c.customerName || '') + '\n'
                  + '<b>Amount:</b> $' + Number(c.totalAmount || 0).toFixed(2) + '\n'
                  + '\n<b>Action needed:</b> Sign the contract to complete execution';
                
                Logger.log('📞 Sending Telegram message: ' + telegramMessage.substring(0, 100) + '...');
                sendTelegramBotMessage_(
                  telegramMessage,
                  [{ text: 'Open Contracts Dashboard', url: dashboardUrl }]
                );
                Logger.log('✅ Customer signature Telegram notification sent successfully');
              } else {
                Logger.log('⚠️ sendTelegramBotMessage_ function not available');
              }
            } catch (tgErr) {
              Logger.log('❌ Contract-awaiting-signature Telegram failed: ' + tgErr.toString());
            }
            Logger.log('Company notification email sent for contract: ' + contractId);
          }
        } catch (mailErr) {
          Logger.log('Company notification email failed: ' + mailErr.toString());
        }
        
        Logger.log('✅ Customer signature saved; contract awaiting company signature: ' + contractId);
        return { success: true, message: 'Contract signed. It is now awaiting company signature.' };
      }
    }
    
    return { success: false, error: 'Contract not found' };
  } catch (error) {
    Logger.log('❌ Error saving customer signature: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

// ============================================================================
// PDF GENERATION
// ============================================================================

/**
 * Generate PDF of contract (unsigned)
 * @param {string} contractId - Contract ID
 * @returns {object} - PDF URL
 */
function generateContractPDF(contractId) {
  try {
    const contractResult = getContract(contractId);
    if (!contractResult.success) {
      return { success: false, error: 'Contract not found' };
    }
    
    const contract = contractResult.data;
    
    // Get or create customer folder in Pool Calc and Customer Folders
    const customerFolder = getOrCreateContractCustomerFolder(contract.customerName, contract.customerAddress);
    if (!customerFolder) {
      return { success: false, error: 'Could not access customer folder' };
    }
    
    // Create PDF using Google Docs
    const tempDocName = 'Contract ' + contractId + ' - ' + new Date().getTime();
    const tempDoc = DocumentApp.create(tempDocName);
    const tempDocId = tempDoc.getId();
    const tempDocFile = DriveApp.getFileById(tempDocId);
    
    const parentFolders = tempDocFile.getParents();
    if (parentFolders.hasNext()) {
      const parentFolder = parentFolders.next();
      parentFolder.removeFile(tempDocFile);
      customerFolder.addFile(tempDocFile);
    }
    
    const body = tempDoc.getBody();
    body.clear();
    
    // Letterhead: try to insert logo
    try {
      const imgResp = UrlFetchApp.fetch(CONTRACT_LETTERHEAD_LOGO_URL);
      if (imgResp.getResponseCode() === 200) {
        const blob = imgResp.getBlob();
        body.appendImage(blob).setWidth(220);
        body.appendParagraph('A Quality Pool Company').setAlignment(DocumentApp.HorizontalAlignment.CENTER);
        body.appendHorizontalRule();
      }
    } catch (e) {
      Logger.log('Letterhead image skip: ' + e.toString());
      body.appendParagraph('A Quality Pool Company').setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      body.appendHorizontalRule();
    }
    
    body.appendParagraph(contract.contractTitle || 'Service Agreement')
      .setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph('Contract ID: ' + contractId);
    body.appendParagraph('Customer: ' + contract.customerName);
    body.appendParagraph('Date: ' + new Date(contract.dateCreated).toLocaleDateString());
    body.appendHorizontalRule();
    body.appendParagraph(contract.contractContent || '');
    
    if (contract.terms) {
      body.appendParagraph('Terms and Conditions:')
        .setHeading(DocumentApp.ParagraphHeading.HEADING2);
      body.appendParagraph(contract.terms);
    }

    if (contract.companySignature) {
      body.appendParagraph('Company Signature:')
        .setHeading(DocumentApp.ParagraphHeading.HEADING2);
      try {
        const companyBlob = dataUrlToBlob(contract.companySignature);
        if (companyBlob) body.appendImage(companyBlob).setWidth(260);
      } catch (sigErr) {
        body.appendParagraph(CONTRACT_AUTO_SIGNER_NAME);
      }
      body.appendParagraph(CONTRACT_AUTO_SIGNER_NAME + ' — ' + (contract.companyTitle || CONTRACT_AUTO_SIGNER_TITLE));
    }
    
    // Save and convert to PDF
    tempDoc.saveAndClose();
    Utilities.sleep(2000); // Wait for document to be ready
    
    const pdfBlob = tempDocFile.getAs(MimeType.PDF);
    const pdfFileName = 'Contract_' + contractId + '_' + new Date().getTime() + '.pdf';
    pdfBlob.setName(pdfFileName);
    const pdfFile = customerFolder.createFile(pdfBlob);
    
    // Set sharing
    pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // Delete temp doc
    tempDocFile.setTrashed(true);
    
    // Update contract with PDF URL
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const contractsSheet = spreadsheet.getSheetByName(CONTRACTS_SHEET);
    const data = contractsSheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim() === String(contractId).trim()) {
        contractsSheet.getRange(i + 1, 11).setValue(pdfFile.getUrl());
        break;
      }
    }
    
    Logger.log('✅ Contract PDF generated: ' + pdfFile.getUrl());
    
    return {
      success: true,
      pdfUrl: pdfFile.getUrl(),
      pdfFileId: pdfFile.getId()
    };
  } catch (error) {
    Logger.log('❌ Error generating contract PDF: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Generate signed contract PDF with both signatures — premium layout.
 * Company signature appears first, then customer signature.
 * Falls back to a simple layout if the fancy version fails.
 * @param {string} contractId - Contract ID
 * @returns {object} - { success, pdfUrl, pdfFileId }
 */
function generateSignedContractPDF(contractId) {
  try {
    const contractResult = getContract(contractId);
    if (!contractResult.success) {
      return { success: false, error: 'Contract not found' };
    }
    
    const contract = contractResult.data;
    
    if (!contract.companySignature || !contract.customerSignature) {
      return { success: false, error: 'Contract not fully signed' };
    }
    
    const customerFolder = getOrCreateContractCustomerFolder(contract.customerName, contract.customerAddress);
    if (!customerFolder) {
      return { success: false, error: 'Could not access customer folder' };
    }
    
    const tempDocName = 'Signed Contract ' + contractId + ' - ' + new Date().getTime();
    const tempDoc = DocumentApp.create(tempDocName);
    const tempDocId = tempDoc.getId();
    const tempDocFile = DriveApp.getFileById(tempDocId);
    
    // Move to customer folder
    const parentFolders = tempDocFile.getParents();
    if (parentFolders.hasNext()) {
      const parentFolder = parentFolders.next();
      parentFolder.removeFile(tempDocFile);
      customerFolder.addFile(tempDocFile);
    }
    
    const body = tempDoc.getBody();
    body.clear();

    // ---- Page margins ----
    try { body.setMarginTop(36); body.setMarginBottom(36); body.setMarginLeft(54); body.setMarginRight(54); } catch(e) {}

    // ---- LETTERHEAD ----
    try {
      const imgResp = UrlFetchApp.fetch(CONTRACT_LETTERHEAD_LOGO_URL);
      if (imgResp.getResponseCode() === 200) {
        const logoBlob = imgResp.getBlob();
        const logoImg = body.appendImage(logoBlob);
        // Get original dimensions BEFORE any resize, then scale proportionally
        var origW = logoImg.getWidth();
        var origH = logoImg.getHeight();
        var targetW = 160;
        logoImg.setWidth(targetW);
        if (origW > 0) logoImg.setHeight(Math.round(origH * targetW / origW));
        // Center the paragraph containing the image
        try { logoImg.getParent().setAlignment(DocumentApp.HorizontalAlignment.CENTER); } catch(e) {}
      }
    } catch (e) {
      Logger.log('Logo skip: ' + e.toString());
    }

    // Helper: append a styled paragraph (avoids repeated boilerplate)
    // Using var so it's a variable assignment, not a hoisted function declaration
    var addPara = function(text, opts) {
      var p = body.appendParagraph(text || '');
      opts = opts || {};
      if (opts.align) p.setAlignment(opts.align);
      if (opts.spaceBefore) p.setSpacingBefore(opts.spaceBefore);
      if (opts.spaceAfter) p.setSpacingAfter(opts.spaceAfter);
      if (opts.lineSpacing) p.setLineSpacing(opts.lineSpacing);
      try {
        var t = p.editAsText();
        if (opts.fontSize) t.setFontSize(opts.fontSize);
        if (opts.bold !== undefined) t.setBold(opts.bold);
        if (opts.italic !== undefined) t.setItalic(opts.italic);
        if (opts.color) t.setForegroundColor(opts.color);
      } catch(e) {}
      return p;
    };

    addPara('A Quality Pool Company', { align: DocumentApp.HorizontalAlignment.CENTER, fontSize: 18, bold: true, color: '#0369a1', spaceAfter: 2 });
    addPara('Professional Pool Construction & Service', { align: DocumentApp.HorizontalAlignment.CENTER, fontSize: 10, color: '#64748b', spaceAfter: 2 });
    addPara('(502) 731-9217  |  samr@aqualitypoolcompanyusa.com  |  aqualitypoolcompanyusa.com', { align: DocumentApp.HorizontalAlignment.CENTER, fontSize: 9, color: '#475569', spaceAfter: 4 });

    body.appendHorizontalRule();

    // ---- CONTRACT TITLE ----
    addPara(contract.contractTitle || 'Service Agreement', { align: DocumentApp.HorizontalAlignment.CENTER, fontSize: 20, bold: true, color: '#0f172a', spaceBefore: 6, spaceAfter: 2 });
    addPara('FULLY EXECUTED CONTRACT', { align: DocumentApp.HorizontalAlignment.CENTER, fontSize: 9, color: '#64748b', spaceAfter: 6 });
    body.appendHorizontalRule();

    // ---- CONTRACT META ----
    // Simple label: value lines — no complex partial-bold needed (avoids GAS API edge cases)
    var addMeta = function(label, value) {
      addPara(label + ':   ' + (value || '—'), { fontSize: 10, color: '#1e293b', spaceBefore: 2, spaceAfter: 2 });
    };

    addPara('', { spaceAfter: 4 });
    addMeta('Contract ID', contractId);
    addMeta('Customer', contract.customerName);
    if (contract.customerAddress) addMeta('Address', contract.customerAddress);
    if (contract.customerEmail) addMeta('Email', contract.customerEmail);
    addMeta('Date Created', contract.dateCreated ? new Date(contract.dateCreated).toLocaleDateString('en-US', {year:'numeric',month:'long',day:'numeric'}) : '—');
    addMeta('Date Signed', contract.dateSigned ? new Date(contract.dateSigned).toLocaleDateString('en-US', {year:'numeric',month:'long',day:'numeric'}) : '—');
    addMeta('Total Amount', '$' + parseFloat(contract.totalAmount || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
    addPara('', { spaceAfter: 4 });

    body.appendHorizontalRule();
    addPara('AGREEMENT', { fontSize: 10, bold: true, color: '#64748b', spaceBefore: 6, spaceAfter: 6 });

    // ---- CONTRACT CONTENT ----
    var contentText = String(contract.contractContent || '').trim();
    if (contentText) {
      contentText.split('\n').forEach(function(line) {
        addPara(line, { fontSize: 10.5, color: '#1e293b', spaceAfter: 4, lineSpacing: 1.4 });
      });
    }

    // ---- TERMS ----
    if (contract.terms && String(contract.terms).trim()) {
      addPara('', { spaceAfter: 4 });
      body.appendHorizontalRule();
      addPara('TERMS AND CONDITIONS', { fontSize: 10, bold: true, color: '#64748b', spaceBefore: 6, spaceAfter: 6 });
      String(contract.terms).trim().split('\n').forEach(function(line) {
        addPara(line, { fontSize: 10, color: '#374151', spaceAfter: 3, lineSpacing: 1.35 });
      });
    }

    // ---- SIGNATURES SECTION ----
    addPara('', { spaceAfter: 4 });
    body.appendHorizontalRule();
    addPara('SIGNATURES', { fontSize: 10, bold: true, color: '#64748b', spaceBefore: 6, spaceAfter: 4 });
    addPara('By signing below, both parties agree to all terms and conditions set forth in this agreement.', { fontSize: 9.5, italic: true, color: '#64748b', spaceAfter: 14 });

    // ---- COMPANY SIGNATURE (FIRST) ----
    addPara('COMPANY REPRESENTATIVE — A QUALITY POOL COMPANY', { fontSize: 9, bold: true, color: '#0369a1', spaceAfter: 6 });
    try {
      var companyBlob = dataUrlToBlob(contract.companySignature);
      if (companyBlob) {
        var coImg = body.appendImage(companyBlob);
        var coW = coImg.getWidth(), coH = coImg.getHeight();
        coImg.setWidth(200);
        if (coW > 0) coImg.setHeight(Math.round(coH * 200 / coW));
      }
    } catch (e) {
      addPara(CONTRACT_AUTO_SIGNER_NAME, { fontSize: 16, color: '#0f172a' });
    }
    addPara(CONTRACT_AUTO_SIGNER_NAME, { fontSize: 10, bold: true, color: '#0f172a', spaceBefore: 4, spaceAfter: 2 });
    addPara(CONTRACT_AUTO_SIGNER_TITLE, { fontSize: 9, color: '#475569', spaceAfter: 18 });

    // ---- DIVIDER ----
    body.appendHorizontalRule();
    addPara('', { spaceAfter: 8 });

    // ---- CUSTOMER SIGNATURE (SECOND) ----
    addPara('CUSTOMER — ' + (contract.customerName || 'CUSTOMER').toUpperCase(), { fontSize: 9, bold: true, color: '#0369a1', spaceAfter: 6 });
    try {
      var custBlob = dataUrlToBlob(contract.customerSignature);
      if (custBlob) {
        var custImg = body.appendImage(custBlob);
        var custW = custImg.getWidth(), custH = custImg.getHeight();
        custImg.setWidth(200);
        if (custW > 0) custImg.setHeight(Math.round(custH * 200 / custW));
      }
    } catch (e) {
      addPara('[Customer signature on file]', { fontSize: 10, color: '#1e293b' });
    }
    addPara(contract.customerName || 'Customer', { fontSize: 10, bold: true, color: '#0f172a', spaceBefore: 4, spaceAfter: 2 });
    var signedDateStr = contract.dateSigned
      ? new Date(contract.dateSigned).toLocaleDateString('en-US', {year:'numeric',month:'long',day:'numeric'})
      : new Date().toLocaleDateString('en-US', {year:'numeric',month:'long',day:'numeric'});
    addPara('Date: ' + signedDateStr, { fontSize: 9, color: '#475569', spaceAfter: 20 });

    // ---- FOOTER ----
    body.appendHorizontalRule();
    addPara('A Quality Pool Company  ·  (502) 731-9217  ·  samr@aqualitypoolcompanyusa.com  ·  aqualitypoolcompanyusa.com',
      { align: DocumentApp.HorizontalAlignment.CENTER, fontSize: 8, color: '#94a3b8', spaceBefore: 6, spaceAfter: 2 });
    addPara('Contract Reference: ' + contractId + '  ·  Generated: ' + new Date().toLocaleDateString('en-US', {year:'numeric',month:'long',day:'numeric'}),
      { align: DocumentApp.HorizontalAlignment.CENTER, fontSize: 7.5, color: '#cbd5e1' });

    // ---- Save & Export ----
    tempDoc.saveAndClose();
    Utilities.sleep(3000);
    
    const pdfBlob = tempDocFile.getAs(MimeType.PDF);
    const pdfFileName = 'Signed_Contract_' + contractId + '_' + new Date().getTime() + '.pdf';
    pdfBlob.setName(pdfFileName);
    const pdfFile = customerFolder.createFile(pdfBlob);
    
    pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    tempDocFile.setTrashed(true);
    
    // Update contract with signed PDF URL
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const contractsSheet = spreadsheet.getSheetByName(CONTRACTS_SHEET);
    const sheetData = contractsSheet.getDataRange().getValues();
    for (let i = 1; i < sheetData.length; i++) {
      if (String(sheetData[i][0] || '').trim() === String(contractId).trim()) {
        contractsSheet.getRange(i + 1, 12).setValue(pdfFile.getUrl());
        break;
      }
    }
    
    Logger.log('✅ Signed contract PDF generated: ' + pdfFile.getUrl());
    
    return {
      success: true,
      pdfUrl: pdfFile.getUrl(),
      pdfFileId: pdfFile.getId()
    };
  } catch (error) {
    Logger.log('❌ Error generating signed contract PDF: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Get or create customer folder in the Pool Calc and Customer Folders Drive folder.
 * Folder name: "Customer name - address"
 */
function getOrCreateContractCustomerFolder(customerName, customerAddress) {
  try {
    const parentFolder = DriveApp.getFolderById(CONTRACT_DRIVE_FOLDER_ID);
    const folderName = (customerName || 'Customer').trim() + (customerAddress ? ' - ' + String(customerAddress).trim() : '');
    const folders = parentFolder.getFoldersByName(folderName);
    if (folders.hasNext()) {
      return folders.next();
    }
    return parentFolder.createFolder(folderName);
  } catch (error) {
    Logger.log('Error getOrCreateContractCustomerFolder: ' + error.toString());
    return null;
  }
}

/**
 * Generate contract HTML for email/display with company letterhead (logo).
 * @param {object} contract - Contract data
 * @param {boolean} includeSignatures - Whether to include signatures
 * @returns {string} - HTML content
 */
function generateContractHTML(contract, includeSignatures) {
  const signaturesHtml = includeSignatures && contract.companySignature && contract.customerSignature ? `
    <div style="margin-top: 40px; padding-top: 30px; border-top: 2px solid #e5e7eb;">
      <h3 style="color: #1a365d; margin-bottom: 20px;">Signatures</h3>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 20px;">
        <div>
          <p style="font-weight: 600; margin-bottom: 10px;">Company Signature</p>
          <img src="${contract.companySignature}" alt="Company Signature" style="max-width: 300px; border: 1px solid #e5e7eb; padding: 10px; background: #f9fafb;" />
        </div>
        <div>
          <p style="font-weight: 600; margin-bottom: 10px;">Customer Signature</p>
          <img src="${contract.customerSignature}" alt="Customer Signature" style="max-width: 300px; border: 1px solid #e5e7eb; padding: 10px; background: #f9fafb;" />
        </div>
      </div>
    </div>
  ` : '';
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          font-family: 'Inter', Arial, sans-serif;
          max-width: 800px;
          margin: 0 auto;
          padding: 40px;
          line-height: 1.6;
          color: #1a1a1a;
        }
        .letterhead {
          text-align: center;
          padding: 24px 0;
          border-bottom: 2px solid #0369a1;
          margin-bottom: 24px;
        }
        .letterhead img {
          max-width: 220px;
          height: auto;
          display: block;
          margin: 0 auto 12px;
        }
        .letterhead .company-name {
          font-size: 18px;
          font-weight: 700;
          color: #0369a1;
          margin: 0;
        }
        .header {
          background: linear-gradient(135deg, #0369a1 0%, #0284c7 100%);
          color: white;
          padding: 30px;
          border-radius: 8px 8px 0 0;
          margin-bottom: 30px;
        }
        .content {
          background: white;
          padding: 30px;
          border: 1px solid #e5e7eb;
        }
        .signature-section {
          margin-top: 40px;
          padding-top: 30px;
          border-top: 2px solid #e5e7eb;
        }
      </style>
    </head>
    <body>
      <div class="letterhead">
        <img src="${CONTRACT_LETTERHEAD_LOGO_URL}" alt="A Quality Pool Company" />
        <p class="company-name">A Quality Pool Company</p>
      </div>
      <div class="header">
        <h1>${contract.contractTitle || 'Service Agreement'}</h1>
        <p>Contract ID: ${contract.id}</p>
      </div>
      <div class="content">
        <p><strong>Customer:</strong> ${contract.customerName}</p>
        <p><strong>Date:</strong> ${new Date(contract.dateCreated).toLocaleDateString()}</p>
        <div style="margin-top: 30px;">
          ${contract.contractContent || ''}
        </div>
        ${contract.terms ? `<div style="margin-top: 30px;"><h3>Terms and Conditions</h3>${contract.terms}</div>` : ''}
        ${signaturesHtml}
      </div>
    </body>
    </html>
  `;
}

/**
 * Send contract to customer
 * @param {string} contractId - Contract ID
 * @returns {object} - Success status and signing URL
 */
function sendContractToCustomer(contractId) {
  try {
    const contractResult = getContract(contractId);
    if (!contractResult.success) {
      return { success: false, error: 'Contract not found' };
    }
    
    const contract = contractResult.data;
    
    if (!contract.companySignature) {
      contract.companySignature = buildAutoCompanySignatureDataUrl_();
      contract.companyPrintedName = contract.companyPrintedName || CONTRACT_AUTO_SIGNER_NAME;
      contract.companyTitle = contract.companyTitle || CONTRACT_AUTO_SIGNER_TITLE;
      const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
      const contractsSheet = spreadsheet.getSheetByName(CONTRACTS_SHEET);
      const rows = contractsSheet.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0] || '').trim() !== String(contractId).trim()) continue;
        const updatedJson = JSON.stringify(contract);
        const chunks = chunkJsonData(updatedJson, 50000);
        contractsSheet.getRange(i + 1, 4).setValue(chunks[0] || '');
        contractsSheet.getRange(i + 1, 5).setValue(chunks[1] || '');
        contractsSheet.getRange(i + 1, 6).setValue(chunks[2] || '');
        contractsSheet.getRange(i + 1, 13).setValue(contract.companySignature);
        break;
      }
    }
    
    // Generate token and signing URL
    const tokenResult = generateContractToken(contractId, contract.customerEmail);
    if (!tokenResult.success) {
      return { success: false, error: 'Failed to generate signing token' };
    }
    
    // Generate PDF
    const pdfResult = generateContractPDF(contractId);
    
    // Update contract status
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const contractsSheet = spreadsheet.getSheetByName(CONTRACTS_SHEET);
    const data = contractsSheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim() === String(contractId).trim()) {
        // Update status
        const jsonPart1 = data[i][3] || '';
        const jsonPart2 = data[i][4] || '';
        const jsonPart3 = data[i][5] || '';
        const jsonStr = jsonPart1 + jsonPart2 + jsonPart3;
        
        if (jsonStr) {
          const contractData = JSON.parse(jsonStr);
          contractData.status = 'Sent';
          contractData.dateSent = new Date().toISOString();
          
          const updatedJson = JSON.stringify(contractData);
          const chunks = chunkJsonData(updatedJson, 50000);
          
          contractsSheet.getRange(i + 1, 4).setValue(chunks[0] || '');
          contractsSheet.getRange(i + 1, 5).setValue(chunks[1] || '');
          contractsSheet.getRange(i + 1, 6).setValue(chunks[2] || '');
        }
        
        contractsSheet.getRange(i + 1, 7).setValue('Sent');
        contractsSheet.getRange(i + 1, 9).setValue(new Date());
        if (pdfResult.success) {
          contractsSheet.getRange(i + 1, 11).setValue(pdfResult.pdfUrl);
        }
        break;
      }
    }
    
    // Send email to customer
    const emailSubject = `Contract for Review - ${contract.contractTitle || 'Service Agreement'}`;
    const emailBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #0369a1 0%, #0ea5e9 100%); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">Contract for Review</h1>
        </div>
        
        <div style="padding: 30px; background: white;">
          <p>Dear ${contract.customerName},</p>
          
          <p>Please review and sign the attached contract for your project. Our company signature has already been applied, so once you sign it, the agreement will be fully executed immediately.</p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb;">
            <p style="margin: 0 0 8px 0; font-size: 13px; color: #6b7280;"><strong>Contract ID:</strong> ${contractId}</p>
            <p style="margin: 0 0 8px 0; font-size: 13px; color: #6b7280;"><strong>Title:</strong> ${contract.contractTitle || 'Service Agreement'}</p>
            <p style="margin: 0; font-size: 13px; color: #6b7280;"><strong>Total Amount:</strong> $${parseFloat(contract.totalAmount || 0).toFixed(2)}</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${tokenResult.signingUrl}" style="background: #0369a1; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">
              Review & Sign Contract
            </a>
          </div>
          
          <p style="font-size: 14px; color: #6b7280;">
            You can also access this contract anytime through your customer portal.
          </p>
        </div>
      </div>
    `;
    
    MailApp.sendEmail({
      to: contract.customerEmail,
      subject: emailSubject,
      htmlBody: emailBody
    });

    var telegramDraftText = '';
    var telegramDraftSmsUrl = '';
    // Send Telegram draft + quick actions for Brooks when contract goes out
    try {
      var tgMeta = sendBrooksContractSentTelegram_(contractId, contract, tokenResult.signingUrl);
      if (tgMeta) {
        telegramDraftText = tgMeta.messageText || '';
        telegramDraftSmsUrl = tgMeta.draftUrl || '';
      }
    } catch (tgErr) {
      Logger.log('⚠️ Contract sent Telegram notify failed: ' + tgErr.toString());
    }
    
    Logger.log('✅ Contract sent to customer: ' + contract.customerEmail);
    
    return {
      success: true,
      signingUrl: tokenResult.signingUrl,
      token: tokenResult.token,
      pdfUrl: pdfResult.pdfUrl || '',
      telegramDraftText: telegramDraftText,
      telegramDraftSmsUrl: telegramDraftSmsUrl
    };
  } catch (error) {
    Logger.log('❌ Error sending contract: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

// ============================================================================
// CONTRACT QUERIES AND METRICS
// ============================================================================

/**
 * Get all contracts from sheet
 * @returns {object} - List of contracts
 */
function getAllContracts() {
  try {
    Logger.log('📋 getAllContracts() called');
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const contractsSheet = spreadsheet.getSheetByName(CONTRACTS_SHEET);
    
    if (!contractsSheet) {
      Logger.log('⚠️ Contracts sheet not found, returning empty array');
      return { success: true, contracts: [] };
    }
    
    const data = contractsSheet.getDataRange().getValues();
    const contracts = [];
    
    Logger.log('📋 Found ' + (data.length - 1) + ' rows in Contracts sheet');
    
    for (let i = 1; i < data.length; i++) {
      try {
        const jsonPart1 = data[i][3] || '';
        const jsonPart2 = data[i][4] || '';
        const jsonPart3 = data[i][5] || '';
        const jsonStr = jsonPart1 + jsonPart2 + jsonPart3;
        
        if (jsonStr) {
          const contract = JSON.parse(jsonStr);
          contract.id = data[i][0];
          contract.status = data[i][6] || 'Draft';
          contract.dateCreated = data[i][7];
          contract.dateSent = data[i][8];
          contract.dateSigned = data[i][9];
          contract.pdfUrl = data[i][10] || '';
          contract.signedPdfUrl = data[i][11] || '';
          
          contracts.push(contract);
        }
      } catch (parseError) {
        Logger.log('⚠️ Error parsing contract at row ' + (i + 1) + ': ' + parseError.toString());
      }
    }
    
    Logger.log('✅ Returning ' + contracts.length + ' contracts');
    return {
      success: true,
      contracts: contracts
    };
  } catch (error) {
    Logger.log('❌ Error in getAllContracts: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Get contracts for a specific project
 * @param {string} projectId - Project ID
 * @returns {object} - List of contracts for project
 */
function getProjectContracts(projectId) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const contractsSheet = spreadsheet.getSheetByName(CONTRACTS_SHEET);
    
    if (!contractsSheet) {
      return { success: true, contracts: [] };
    }
    
    const data = contractsSheet.getDataRange().getValues();
    const contracts = [];
    
    for (let i = 1; i < data.length; i++) {
      try {
        const jsonPart1 = data[i][3] || '';
        const jsonPart2 = data[i][4] || '';
        const jsonPart3 = data[i][5] || '';
        const jsonStr = jsonPart1 + jsonPart2 + jsonPart3;
        
        if (jsonStr) {
          const contract = JSON.parse(jsonStr);
          
          // Check if contract belongs to this project
          if (contract.projectId === projectId) {
            contract.id = data[i][0];
            contract.status = data[i][6] || 'Draft';
            contract.dateCreated = data[i][7];
            contract.dateSent = data[i][8];
            contract.dateSigned = data[i][9];
            contract.pdfUrl = data[i][10] || '';
            contract.signedPdfUrl = data[i][11] || '';
            
            contracts.push(contract);
          }
        }
      } catch (parseError) {
        Logger.log('Error parsing contract at row ' + (i + 1) + ': ' + parseError.toString());
      }
    }
    
    return {
      success: true,
      contracts: contracts
    };
  } catch (error) {
    Logger.log('❌ Error getting project contracts: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Get contract metrics (totals, counts, etc.)
 * @returns {object} - Contract metrics
 */
function getContractMetrics() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const contractsSheet = spreadsheet.getSheetByName(CONTRACTS_SHEET);
    
    if (!contractsSheet) {
      return {
        success: true,
        metrics: {
          totalContracts: 0,
          totalValue: 0,
          draftCount: 0,
          sentCount: 0,
          awaitingCompanySignatureCount: 0,
          signedCount: 0,
          cancelledCount: 0,
          pendingCount: 0,
          completedCount: 0
        }
      };
    }
    
    const data = contractsSheet.getDataRange().getValues();
    let totalContracts = 0;
    let totalValue = 0;
    let draftCount = 0;
    let sentCount = 0;
    let awaitingCompanyCount = 0;
    let signedCount = 0;
    let cancelledCount = 0;
    
    for (let i = 1; i < data.length; i++) {
      try {
        const status = data[i][6] || 'Draft';
        const jsonPart1 = data[i][3] || '';
        const jsonPart2 = data[i][4] || '';
        const jsonPart3 = data[i][5] || '';
        const jsonStr = jsonPart1 + jsonPart2 + jsonPart3;
        
        if (jsonStr) {
          totalContracts++;
          totalValue += parseFloat(contract.totalAmount || 0);
          
          switch (status) {
            case 'Draft':
              draftCount++;
              break;
            case 'Sent':
              sentCount++;
              break;
            case 'Awaiting Company Signature':
              awaitingCompanyCount++;
              break;
            case 'Signed':
              signedCount++;
              break;
            case 'Cancelled':
              cancelledCount++;
              break;
          }
        }
      } catch (parseError) {
        Logger.log('Error parsing contract at row ' + (i + 1) + ': ' + parseError.toString());
      }
    }
    
    return {
      success: true,
      metrics: {
        totalContracts: totalContracts,
        totalValue: totalValue,
        draftCount: draftCount,
        sentCount: sentCount,
        awaitingCompanySignatureCount: awaitingCompanyCount,
        signedCount: signedCount,
        cancelledCount: cancelledCount,
        pendingCount: awaitingCompanyCount, // Contracts awaiting YOUR (company) signature
        completedCount: signedCount
      }
    };
  } catch (error) {
    Logger.log('❌ Error getting contract metrics: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Get project daily updates history
 * @param {string} projectId - Project ID
 * @returns {object} - List of daily updates
 */
function getProjectDailyUpdates(projectId) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const updatesSheet = spreadsheet.getSheetByName('PM_Daily_Updates');
    
    if (!updatesSheet) {
      return { success: true, updates: [] };
    }
    
    const data = updatesSheet.getDataRange().getValues();
    const updates = [];
    
    // Find columns
    const headers = data[0];
    const projectIdCol = headers.indexOf('Project ID');
    const dateCol = headers.indexOf('Date');
    const openingMsgCol = headers.indexOf('Opening Message');
    const updateMsgCol = headers.indexOf('Update Message');
    const imagesCol = headers.indexOf('Images');
    const sentByCol = headers.indexOf('Sent By');
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][projectIdCol] === projectId) {
        const update = {
          date: data[i][dateCol],
          openingMessage: data[i][openingMsgCol] || '',
          updateMessage: data[i][updateMsgCol] || '',
          images: data[i][imagesCol] || '',
          sentBy: data[i][sentByCol] || ''
        };
        updates.push(update);
      }
    }
    
    // Sort by date descending
    updates.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    return {
      success: true,
      updates: updates
    };
  } catch (error) {
    Logger.log('❌ Error getting project daily updates: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Log contract access attempt
 */
function logContractAccess(contractId, customerEmail, ipAddress, userAgent, action) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let logsSheet = spreadsheet.getSheetByName('Contract_Access_Logs');
    
    if (!logsSheet) {
      setupContractAccessLogsSheet(spreadsheet);
      logsSheet = spreadsheet.getSheetByName('Contract_Access_Logs');
    }
    
    // Parse user agent for device and browser info
    const deviceType = parseDeviceType(userAgent);
    const browser = parseBrowser(userAgent);
    
    // Try to get location from IP (basic, could enhance with API)
    const location = 'Unknown'; // Could use IP geolocation API
    
    logsSheet.appendRow([
      new Date(),
      contractId,
      customerEmail,
      ipAddress || 'Unknown',
      userAgent || 'Unknown',
      deviceType,
      browser,
      location,
      action
    ]);
    
    Logger.log(`Contract access logged: ${contractId} - ${action}`);
  } catch (error) {
    Logger.log('Error logging contract access: ' + error.toString());
  }
}

/**
 * Parse device type from user agent
 */
function parseDeviceType(userAgent) {
  if (!userAgent) return 'Unknown';
  const ua = userAgent.toLowerCase();
  
  if (ua.indexOf('mobile') > -1 || ua.indexOf('android') > -1 || ua.indexOf('iphone') > -1) {
    return 'Mobile';
  } else if (ua.indexOf('tablet') > -1 || ua.indexOf('ipad') > -1) {
    return 'Tablet';
  } else {
    return 'Desktop';
  }
}

/**
 * Parse browser from user agent
 */
function parseBrowser(userAgent) {
  if (!userAgent) return 'Unknown';
  const ua = userAgent.toLowerCase();
  
  if (ua.indexOf('chrome') > -1 && ua.indexOf('edg') === -1) return 'Chrome';
  if (ua.indexOf('safari') > -1 && ua.indexOf('chrome') === -1) return 'Safari';
  if (ua.indexOf('firefox') > -1) return 'Firefox';
  if (ua.indexOf('edg') > -1) return 'Edge';
  if (ua.indexOf('opera') > -1 || ua.indexOf('opr') > -1) return 'Opera';
  
  return 'Unknown';
}

/**
 * Get contract access logs for a contract
 */
function getContractAccessLogs(contractId) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const logsSheet = spreadsheet.getSheetByName('Contract_Access_Logs');
    
    if (!logsSheet) {
      return { success: true, logs: [] };
    }
    
    const data = logsSheet.getDataRange().getValues();
    const logs = [];
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] === contractId) {
        logs.push({
          timestamp: data[i][0],
          ipAddress: data[i][3],
          userAgent: data[i][4],
          deviceType: data[i][5],
          browser: data[i][6],
          location: data[i][7],
          action: data[i][8]
        });
      }
    }
    
    // Sort by timestamp descending
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return { success: true, logs: logs };
  } catch (error) {
    Logger.log('Error getting contract access logs: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Send contract reminder
 */
function sendContractReminder(contractId) {
  try {
    const contractResult = getContract(contractId);
    if (!contractResult.success) {
      return { success: false, error: 'Contract not found' };
    }
    
    const contract = contractResult.data;
    
    if (contract.status === 'Signed') {
      return { success: false, error: 'Contract is already signed' };
    }
    
    if (contract.status === 'Draft') {
      return { success: false, error: 'Contract must be sent before sending reminders' };
    }
    
    // Get existing token
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const tokensSheet = spreadsheet.getSheetByName('Contract_Tokens');
    const tokenData = tokensSheet.getDataRange().getValues();
    
    let signingUrl = '';
    for (let i = 1; i < tokenData.length; i++) {
      if (tokenData[i][1] === contractId) {
        const token = tokenData[i][0];
        signingUrl = CONTRACT_VIEWER_URL + '?id=' + encodeURIComponent(String(contractId || '')) + '&token=' + encodeURIComponent(String(token || ''));
        break;
      }
    }
    
    if (!signingUrl) {
      return { success: false, error: 'Signing link not found' };
    }
    
    // Send reminder email
    const emailSubject = `Reminder: Contract Awaiting Your Signature - ${contract.contractTitle || 'Service Agreement'}`;
    const emailBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #0369a1 0%, #0ea5e9 100%); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">⏰ Friendly Reminder</h1>
        </div>
        
        <div style="padding: 30px; background: white;">
          <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">Hi ${contract.customerName},</p>
          
          <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
            This is a friendly reminder that your contract is still awaiting your signature.
          </p>
          
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin: 0 0 12px 0; color: #1f2937;">${contract.contractTitle || 'Service Agreement'}</h3>
            <p style="margin: 0; color: #6b7280;">Contract Amount: <strong style="color: #0369a1;">$${parseFloat(contract.totalAmount || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</strong></p>
          </div>
          
          <p style="font-size: 16px; color: #374151; margin-bottom: 30px;">
            Please click the button below to review and sign the contract:
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${signingUrl}" style="background: linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block;">
              Review & Sign Contract
            </a>
          </div>
          
          <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
            If you have any questions or concerns, please don't hesitate to reach out to us.
          </p>
        </div>
        
        <div style="background: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 13px; color: #6b7280; margin: 0;"><strong>A Quality Pool Company</strong></p>
          <p style="font-size: 13px; color: #6b7280; margin: 4px 0 0 0;">samr@aqualitypoolcompanyusa.com | (502) 731-9217</p>
        </div>
      </div>
    `;
    
    MailApp.sendEmail({
      to: contract.customerEmail,
      subject: emailSubject,
      htmlBody: emailBody
    });
    
    Logger.log('✅ Contract reminder sent to: ' + contract.customerEmail);
    
    return {
      success: true,
      message: 'Reminder sent successfully'
    };
  } catch (error) {
    Logger.log('❌ Error sending contract reminder: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Convert data URL (e.g. from signature canvas) to Blob for inserting into Doc/PDF.
 */
function dataUrlToBlob(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  const base64 = match[2];
  return Utilities.newBlob(Utilities.base64Decode(base64), mime);
}

/**
 * Chunk JSON data for Google Sheets (max 50,000 chars per cell)
 */
function chunkJsonData(jsonString, chunkSize) {
  const chunks = [];
  for (let i = 0; i < jsonString.length; i += chunkSize) {
    chunks.push(jsonString.substring(i, i + chunkSize));
  }
  // Ensure we always return 3 chunks
  while (chunks.length < 3) {
    chunks.push('');
  }
  return chunks.slice(0, 3);
}

// ============================================================================
// CONTRACT ACCESS TRACKING
// ============================================================================

/**
 * Log contract access attempt
 */
function logContractAccess(contractId, customerEmail, ipAddress, userAgent, action) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let logsSheet = spreadsheet.getSheetByName('Contract_Access_Logs');
    
    if (!logsSheet) {
      setupContractAccessLogsSheet(spreadsheet);
      logsSheet = spreadsheet.getSheetByName('Contract_Access_Logs');
    }
    
    // Parse user agent for device and browser info
    const deviceType = parseDeviceType(userAgent);
    const browser = parseBrowser(userAgent);
    
    // Try to get location from IP (basic, could enhance with API)
    const location = 'Unknown'; // Could use IP geolocation API
    
    logsSheet.appendRow([
      new Date(),
      contractId,
      customerEmail,
      ipAddress || 'Unknown',
      userAgent || 'Unknown',
      deviceType,
      browser,
      location,
      action
    ]);
    
    Logger.log(`Contract access logged: ${contractId} - ${action}`);
  } catch (error) {
    Logger.log('Error logging contract access: ' + error.toString());
  }
}

/**
 * Parse device type from user agent
 */
function parseDeviceType(userAgent) {
  if (!userAgent) return 'Unknown';
  const ua = userAgent.toLowerCase();
  
  if (ua.indexOf('mobile') > -1 || ua.indexOf('android') > -1 || ua.indexOf('iphone') > -1) {
    return 'Mobile';
  } else if (ua.indexOf('tablet') > -1 || ua.indexOf('ipad') > -1) {
    return 'Tablet';
  } else {
    return 'Desktop';
  }
}

/**
 * Parse browser from user agent
 */
function parseBrowser(userAgent) {
  if (!userAgent) return 'Unknown';
  const ua = userAgent.toLowerCase();
  
  if (ua.indexOf('chrome') > -1 && ua.indexOf('edg') === -1) return 'Chrome';
  if (ua.indexOf('safari') > -1 && ua.indexOf('chrome') === -1) return 'Safari';
  if (ua.indexOf('firefox') > -1) return 'Firefox';
  if (ua.indexOf('edg') > -1) return 'Edge';
  if (ua.indexOf('opera') > -1 || ua.indexOf('opr') > -1) return 'Opera';
  
  return 'Unknown';
}

/**
 * Get contract access logs for a contract
 */
function getContractAccessLogs(contractId) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const logsSheet = spreadsheet.getSheetByName('Contract_Access_Logs');
    
    if (!logsSheet) {
      return { success: true, logs: [] };
    }
    
    const data = logsSheet.getDataRange().getValues();
    const logs = [];
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] === contractId) {
        logs.push({
          timestamp: data[i][0],
          ipAddress: data[i][3],
          userAgent: data[i][4],
          deviceType: data[i][5],
          browser: data[i][6],
          location: data[i][7],
          action: data[i][8]
        });
      }
    }
    
    // Sort by timestamp descending
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return { success: true, logs: logs };
  } catch (error) {
    Logger.log('Error getting contract access logs: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Send contract reminder
 */
function sendContractReminder(contractId) {
  try {
    const contractResult = getContract(contractId);
    if (!contractResult.success) {
      return { success: false, error: 'Contract not found' };
    }
    
    const contract = contractResult.data;
    
    if (contract.status === 'Signed') {
      return { success: false, error: 'Contract is already signed' };
    }
    
    if (contract.status === 'Draft') {
      return { success: false, error: 'Contract must be sent before sending reminders' };
    }
    
    // Get existing token
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const tokensSheet = spreadsheet.getSheetByName('Contract_Tokens');
    const tokenData = tokensSheet.getDataRange().getValues();
    
    let signingUrl = '';
    for (let i = 1; i < tokenData.length; i++) {
      if (tokenData[i][1] === contractId) {
        const token = tokenData[i][0];
        signingUrl = `https://www.aqualitypoolcompanyusa.com/contract-system?id=${contractId}&token=${token}`;
        break;
      }
    }
    
    if (!signingUrl) {
      return { success: false, error: 'Signing link not found' };
    }
    
    // Send reminder email
    const emailSubject = `Reminder: Contract Awaiting Your Signature - ${contract.contractTitle || 'Service Agreement'}`;
    const emailBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #0369a1 0%, #0ea5e9 100%); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">⏰ Friendly Reminder</h1>
        </div>
        
        <div style="padding: 30px; background: white;">
          <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">Hi ${contract.customerName},</p>
          
          <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
            This is a friendly reminder that your contract is still awaiting your signature.
          </p>
          
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin: 0 0 12px 0; color: #1f2937;">${contract.contractTitle || 'Service Agreement'}</h3>
            <p style="margin: 0; color: #6b7280;">Contract Amount: <strong style="color: #0369a1;">$${parseFloat(contract.totalAmount || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</strong></p>
          </div>
          
          <p style="font-size: 16px; color: #374151; margin-bottom: 30px;">
            Please click the button below to review and sign the contract:
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${signingUrl}" style="background: linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block;">
              Review & Sign Contract
            </a>
          </div>
          
          <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
            If you have any questions or concerns, please don't hesitate to reach out to us.
          </p>
        </div>
        
        <div style="background: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 13px; color: #6b7280; margin: 0;"><strong>A Quality Pool Company</strong></p>
          <p style="font-size: 13px; color: #6b7280; margin: 4px 0 0 0;">samr@aqualitypoolcompanyusa.com | (502) 731-9217</p>
        </div>
      </div>
    `;
    
    MailApp.sendEmail({
      to: contract.customerEmail,
      subject: emailSubject,
      htmlBody: emailBody
    });
    
    Logger.log('✅ Contract reminder sent to: ' + contract.customerEmail);
    
    return {
      success: true,
      message: 'Reminder sent successfully'
    };
  } catch (error) {
    Logger.log('❌ Error sending contract reminder: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}


/**
 * Send welcome email to customer when weekly service contract is signed
 * @param {string} contractId - Contract ID
 * @param {object} contractData - Contract data
 * @param {object} pdfResult - PDF generation result
 */
function sendWeeklyServiceWelcomeEmail(contractId, contractData, pdfResult) {
  try {
    var contract = contractData || {};
    var customerName = contract.customerName || 'Valued Customer';
    var customerEmail = contract.customerEmail || '';
    
    if (!customerEmail) {
      Logger.log('⚠️ Cannot send welcome email - no customer email for contract: ' + contractId);
      return { success: false, error: 'Customer email not found' };
    }
    
    var firstName = String(customerName || 'there').split(' ')[0] || 'there';
    var pdfUrl = (pdfResult && pdfResult.pdfUrl) ? pdfResult.pdfUrl : '';
    
    var emailSubject = '🎉 Welcome to A Quality Pool Company — Your Weekly Service Begins';
    var emailHtml = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">'
      + '<div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">'
      + '<h1 style="color: white; margin: 0; font-size: 24px;">🎉 Welcome!</h1>'
      + '<p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0;">Your weekly pool service is now active</p>'
      + '</div>'
      + '<div style="padding: 30px; background: white; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">'
      + '<p style="font-size: 15px; color: #374151; margin: 0 0 20px 0;">Hi ' + escapeHtml(firstName) + ',</p>'
      + '<p style="font-size: 15px; color: #374151; margin: 0 0 20px 0;">Thank you for signing up for weekly pool service with A Quality Pool Company! We\'re excited to help keep your pool clean and clear all season long.</p>'
      + '<div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">'
      + '<h3 style="margin: 0 0 12px 0; color: #1f2937;">✅ What\'s Next?</h3>'
      + '<ul style="margin: 0; padding-left: 20px; color: #475569;">'
      + '<li style="margin-bottom: 8px;">Our team will arrive on your scheduled service day</li>'
      + '<li style="margin-bottom: 8px;">We\'ll clean your pool, test water chemistry, and make any necessary adjustments</li>'
      + '<li style="margin-bottom: 8px;">You can track service history anytime in your customer portal</li>'
      + '</ul>'
      + '</div>'
      + '<p style="font-size: 15px; color: #374151; margin: 0 0 20px 0;"><strong>Service Agreement:</strong><br>Your signed contract and agreement details are attached below.</p>'
      + (pdfUrl ? '<div style="text-align: center; margin: 20px 0;"><a href="' + pdfUrl + '" style="display: inline-block; background: #0369a1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">📄 View Your Contract</a></div>' : '')
      + '<p style="font-size: 15px; color: #374151; margin: 0 0 20px 0;"><strong>Questions?</strong><br>Feel free to reach out anytime. We\'re here to help!</p>'
      + '<div style="background: #f9fafb; padding: 16px; border-radius: 8px; text-align: center; margin-top: 30px;">'
      + '<p style="font-size: 13px; color: #6b7280; margin: 0 0 8px 0;"><strong>A Quality Pool Company</strong></p>'
      + '<p style="font-size: 13px; color: #6b7280; margin: 0;">📧 samr@aqualitypoolcompanyusa.com</p>'
      + '<p style="font-size: 13px; color: #6b7280; margin: 4px 0 0 0;">📱 (502) 706-9172</p>'
      + '</div>'
      + '</div>'
      + '</div>';
    
    MailApp.sendEmail({
      to: customerEmail,
      subject: emailSubject,
      htmlBody: emailHtml
    });
    
    Logger.log('✅ Welcome email sent to: ' + customerEmail);
    return { success: true, message: 'Welcome email sent' };
  } catch (error) {
    Logger.log('❌ Error sending welcome email: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Send telegram message to Brooks when weekly service contract is fully signed
 * Includes draft text for sending welcome message to customer
 * @param {string} contractId - Contract ID
 * @param {object} contractData - Contract data
 */
function sendWeeklyServiceWelcomeTelegram(contractId, contractData) {
  try {
    if (typeof sendTelegramBotMessage_ !== 'function') {
      Logger.log('⚠️ sendTelegramBotMessage_ not available');
      return { success: false, error: 'Telegram function not available' };
    }
    
    var contract = contractData || {};
    var customerName = contract.customerName || 'Customer';
    var customerPhone = contract.customerPhone || '';
    var firstName = String(customerName || 'there').split(' ')[0] || 'there';
    
    // Build suggested welcome text for Brooks to send to customer
    var suggestedText = 'Hi ' + firstName + ', thank you for signing up for weekly pool service with A Quality Pool Company! '
      + 'We\'re excited to help keep your pool in perfect condition. Our team will be at your place on your scheduled service day. '
      + 'If you have any questions before we arrive, feel free to reach out. Looking forward to working with you!';
    
    var draftUrl = getContractSmsDraftUrl_(customerPhone, suggestedText, customerName);
    
    // Build Telegram message - simple header with buttons for draft/contract
    var telegramHtml = '<b>✅ Weekly Service Contract Signed</b>\n'
      + '<b>👤 ' + escapeTelegramHtml_(customerName) + '</b>\n'
      + (customerPhone ? '📱 ' + escapeTelegramHtml_(customerPhone) : '')
      + '\n\nClick button to draft welcome text for customer or view contract.';
    
    // Build button array - must be simple array of {text, url} objects
    var telegramButtons = [];
    if (draftUrl) {
      telegramButtons.push({
        text: '💬 Draft Welcome Text',
        url: draftUrl
      });
    }
    telegramButtons.push({
      text: '🔗 View Contract',
      url: 'https://www.aqualitypoolcompanyusa.com/contract-viewer?id=' + encodeURIComponent(contractId)
    });
    
    Logger.log('📱 Sending Telegram welcome notification for contract: ' + contractId);
    Logger.log('📋 Draft URL: ' + (draftUrl || 'N/A - no phone provided'));
    Logger.log('🤖 Telegram buttons: ' + JSON.stringify(telegramButtons));
    var telegramResult = sendTelegramBotMessage_(telegramHtml, telegramButtons);
    
    if (telegramResult && telegramResult.success) {
      Logger.log('✅ Telegram welcome message sent');
      return { success: true, message: 'Telegram notification sent' };
    } else {
      Logger.log('⚠️ Telegram sending failed: ' + (telegramResult && telegramResult.error ? telegramResult.error : 'Unknown error'));
      return { success: false, error: telegramResult && telegramResult.error ? telegramResult.error : 'Telegram sending failed' };
    }
  } catch (error) {
    Logger.log('❌ Error sending Telegram: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

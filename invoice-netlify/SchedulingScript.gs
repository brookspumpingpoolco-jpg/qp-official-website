// ===========================================================================
// SCHEDULING SYSTEM - Google Apps Script (Full Hosted)
// ===========================================================================
//
// SETUP:
//   1. Go to script.google.com → Create new project
//   2. Rename default Code.gs to SchedulingScript.gs → paste this code
//   3. Click File → New → HTML file → name it "SchedulingUI" → paste SchedulingUI.html
//   4. Set your SPREADSHEET_ID below
//   5. Enable Google Calendar:
//      → Click "+" next to "Services" in left sidebar
//      → Search "Google Calendar API" → Add
//   6. Run initializeSchedulingSheets() once (select from dropdown → ▶)
//   7. Deploy → New deployment → Web app
//      → Execute as: Me  |  Who has access: Anyone
//   8. Open the deployed URL — that's your app!
//
// ===========================================================================

// ---- CONFIG ----
const SPREADSHEET_ID = '1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0';
const APPOINTMENTS_SHEET = 'Appointments';
const CUSTOMERS_SHEET = 'Customers';
const NOTIFICATION_LOG_SHEET = 'Notification_Log';
const PAYMENT_HISTORY_SHEET = 'Payment History';
const DISCOUNT_CODES_SHEET = 'Discount Codes';
const BLOCKED_DATES_SHEET = 'BlockedDates';
const AUTH_SHEET = 'Authentication';
const SCHEDULING_SETTINGS_SHEET = 'Scheduling_Settings';
const AUTOPAY_CUSTOMERS_SHEET = 'Autopay_Customers';
const ADDITIONAL_CHARGE_APPROVALS_SHEET = 'Additional_Charge_Approvals';

// ---- CONTRACT CONSTANTS (shared with InvoiceEstimate/ContractManagement project via same spreadsheet) ----
const WS_CONTRACTS_SHEET        = 'Contracts';           // Unified contracts sheet
const WS_CONTRACT_TOKENS_SHEET  = 'Contract_Tokens';     // Unified tokens sheet
const WS_CONTRACT_VIEWER_URL    = 'https://www.aqualitypoolcompanyusa.com/contract-viewer';
const WS_CONTRACT_DRIVE_FOLDER_ID   = '1caFBUhSzE5WNAm9vCT4dwDQuAO0iuo1h';
const WS_CONTRACT_LETTERHEAD_LOGO_URL = 'https://cdn.prod.website-files.com/6931dc4e8e97334e195432df/6993ce0abcd54d3520799318_IMG_1763-p-500.jpg';
const WS_CONTRACT_AUTO_SIGNER_NAME  = 'Sam Roberts';
const WS_CONTRACT_AUTO_SIGNER_TITLE = 'Vice President, A Quality Pool Company';

// ---- SERVICE HISTORY CONSTANTS ----
const SERVICE_HISTORY_SHEET = 'Service_History';  // Track all service completions and one-off charges
const CUSTOMER_RECEIPTS_SHEET = 'Customer_Receipts';  // Store receipt uploads and extracted amounts
const CHEMICALS_SHEET = 'Chemicals';  // Chemical catalog + usage logging
const ROUTE_MILEAGE_SHEET = 'Route_Mileage_Log';
const AUTO_INVOICE_QUEUE_SHEET = 'Auto_Invoice_Queue';
const DEFAULT_ROUTE_ORIGIN_ADDRESS = '111 Vescio Drive';

const ADMIN_EMAILS = ['samr@aqualitypoolcompanyusa.com'];
const DEFAULT_COMPANY_ID = 'CMP-AQUALITYPOOL';

// Stripe API Configuration - Store key securely in Script Properties
// To set: PropertiesService.getScriptProperties().setProperty('STRIPE_SECRET_KEY', 'sk_live_...')
const STRIPE_SECRET_KEY = PropertiesService.getScriptProperties().getProperty('STRIPE_SECRET_KEY') || 'sk_live_REDACTED';
const STRIPE_API_URL = 'https://api.stripe.com/v1';
const STRIPE_WEBHOOK_SECRET = PropertiesService.getScriptProperties().getProperty('STRIPE_WEBHOOK_SECRET') || '';
const STRIPE_PROCESSING_FEE_RATE = 0.029; // 2.9% processing fee
const STRIPE_PROCESSING_FEE_FIXED = 0.29; // $0.29 fixed fee

// Google Calendar - 'primary' = your default calendar
const CALENDAR_ID = 'primary';

// Pool Opening form: public link sent to customers (Webflow page with iframe embed)
const OPENING_FORM_PUBLIC_URL = 'https://www.aqualitypoolcompanyusa.com/pool-opening';

// Service type → Google Calendar color IDs (1-11)
const SERVICE_COLORS = {
  'Pool Service': '9',    // Blueberry (blue)
  'Opening': '2',         // Sage (green)
  'Closing': '4',        // Flamingo (pink)
  'Installation': '3',   // Grape (purple)
  'Renovation': '5',     // Banana (yellow)
  'Snow Removal': '8'    // Graphite (gray)
};

/** InvoiceEstimate web app URL — PM_Tasks sheet + addPmTask live there (same SPREADSHEET_ID). */
const INVOICE_ESTIMATE_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbyJs4bNnPJfpzxq6i8fznuaCYrlSoYjPsU5Xzy-yz3PBII71BK2XghAB3HJ9s6-wZf8/exec';

/** Scheduling web app URL — This SchedulingUI/WeeklyService web app. */
const SCHEDULING_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbxZcMYdXanrOJRd-l5aKeL_qvZoJv7PWGlBp_1gVbgo5FAiC1U7-EMdoBQEqNP6QHmvjw/exec';
/** Customer portal web app URL (signup/login). */
const CUSTOMER_PORTAL_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbyniiZIKYstT0-UROurdf8cj-rx8KraX7aZpk6oEjxTfaFjEjAZ8QaRgj2Tg1Qh-l3S/exec';
const DAILY_CONFIRM_BATCH_KEY_PREFIX = 'DAILY_CONFIRM_BATCH_';

function isSchedulingAdmin_(email) {
  const clean = String(email || '').toLowerCase().trim();
  return !!clean && ADMIN_EMAILS.indexOf(clean) !== -1;
}

function getSchedulingSettings_() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = getOrCreateSheet(SCHEDULING_SETTINGS_SHEET, ['Key', 'Value', 'UpdatedAt']);
    const data = sheet.getDataRange().getValues();
    const map = {};
    for (let i = 1; i < data.length; i++) {
      const k = String(data[i][0] || '').trim();
      if (!k) continue;
      map[k] = data[i][1];
    }
    return {
      defaultCompanyId: String(map.defaultCompanyId || DEFAULT_COMPANY_ID),
      arrivalMode: String(map.arrivalMode || 'exact_time'), // exact_time | arrival_window
      defaultArrivalWindowMinutes: parseInt(map.defaultArrivalWindowMinutes || '120', 10) || 120,
      telegramEnabled: String(map.telegramEnabled || 'true') !== 'false'
    };
  } catch (e) {
    return {
      defaultCompanyId: DEFAULT_COMPANY_ID,
      arrivalMode: 'exact_time',
      defaultArrivalWindowMinutes: 120,
      telegramEnabled: true
    };
  }
}

function getCompanyIdForSchedulingUser_(email) {
  const cleanEmail = String(email || '').trim();
  if (isSchedulingAdmin_(cleanEmail)) {
    return { success: true, companyId: DEFAULT_COMPANY_ID, isAdmin: true };
  }
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const auth = ss.getSheetByName(AUTH_SHEET);
    if (!auth) {
      return { success: true, companyId: getSchedulingSettings_().defaultCompanyId, isAdmin: false };
    }
    const data = auth.getDataRange().getValues();
    if (data.length < 2) {
      return { success: true, companyId: getSchedulingSettings_().defaultCompanyId, isAdmin: false };
    }
    const headers = data[0];
    const emailCol = headers.indexOf('Email');
    const companyCol = headers.indexOf('Company ID');
    if (emailCol === -1 || companyCol === -1) {
      return { success: true, companyId: getSchedulingSettings_().defaultCompanyId, isAdmin: false };
    }
    const target = cleanEmail.toLowerCase();
    for (let i = 1; i < data.length; i++) {
      const rowEmail = String(data[i][emailCol] || '').toLowerCase().trim();
      if (!rowEmail || rowEmail !== target) continue;
      const cid = String(data[i][companyCol] || '').trim() || getSchedulingSettings_().defaultCompanyId;
      return { success: true, companyId: cid, isAdmin: false };
    }
    return { success: true, companyId: getSchedulingSettings_().defaultCompanyId, isAdmin: false };
  } catch (e) {
    return { success: true, companyId: getSchedulingSettings_().defaultCompanyId, isAdmin: false };
  }
}

/**
 * Base URL of the Service Report web app (Enhanced UI loads with ?appointmentId=...).
 * Configure one of:
 * - Script property SERVICE_REPORT_WEBAPP_URL (recommended), or
 * - Scheduling Settings sheet: key "serviceReportWebAppUrl" in column A, URL in column B
 */
function getServiceReportWebAppUrl_() {
  try {
    var p = PropertiesService.getScriptProperties().getProperty('SERVICE_REPORT_WEBAPP_URL');
    if (p && String(p).trim()) return String(p).replace(/\/$/, '').trim();
  } catch (e1) {
    Logger.log('getServiceReportWebAppUrl_ props: ' + e1);
  }
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sh = ss.getSheetByName(SCHEDULING_SETTINGS_SHEET);
    if (!sh) return '';
    var vals = sh.getDataRange().getValues();
    for (var i = 1; i < vals.length; i++) {
      if (String(vals[i][0] || '').trim() === 'serviceReportWebAppUrl' && vals[i][1]) {
        return String(vals[i][1]).replace(/\/$/, '').trim();
      }
    }
  } catch (e2) {
    Logger.log('getServiceReportWebAppUrl_ sheet: ' + e2);
  }
  return '';
}

function getSchedulingContext(email) {
  const idRes = getCompanyIdForSchedulingUser_(email);
  const settings = getSchedulingSettings_();
  return {
    success: true,
    email: String(email || '').trim(),
    companyId: idRes.companyId || settings.defaultCompanyId,
    isAdmin: !!idRes.isAdmin,
    settings: settings,
    telegramConfigured: !!getBrooksTelegramChatId_(),
    webappUrl: SCHEDULING_WEBAPP_URL,
    serviceReportWebAppUrl: getServiceReportWebAppUrl_()
  };
}

/**
 * Force Drive authorization from the Apps Script editor and verify access.
 * Run this directly in the editor, not from the web app.
 */
function forceDriveAuthorization() {
  try {
    Logger.log('🔐 Requesting Drive authorization...');
    Logger.log('📋 Run this from the Apps Script editor, not from the web app.');

    try {
      ScriptApp.getOAuthToken();
      Logger.log('✅ OAuth token obtained');
    } catch (tokenError) {
      Logger.log('⚠️ OAuth token requires authorization: ' + tokenError);
    }

    var folderId = WS_CONTRACT_DRIVE_FOLDER_ID || '';
    var folder = DriveApp.getFolderById(folderId);
    var folderName = folder.getName();
    Logger.log('✅ Drive authorization successful: ' + folderName);

    return {
      success: true,
      message: 'Drive authorization successful',
      folderName: folderName
    };
  } catch (error) {
    var errorMsg = error && error.toString ? error.toString() : String(error);
    Logger.log('❌ Drive authorization error: ' + errorMsg);
    return {
      success: false,
      error: errorMsg
    };
  }
}

/**
 * After weekly / opening approval, add a follow-up task in PM_Tasks (company-scoped, linked to appointment row).
 */
function schedulingCreateFollowUpPmTask_(companyId, appointmentId, customerName, customerEmail, firstServiceDate) {
  try {
    if (!INVOICE_ESTIMATE_WEBAPP_URL) return;
    var payload = {
      action: 'addPmTask',
      companyId: companyId || 'CMP-AQUALITYPOOL',
      title: 'Follow-up: ' + (customerName || 'Customer') + ' — service approved',
      customerName: customerName || '',
      customerEmail: customerEmail || '',
      dueDate: firstServiceDate || '',
      dueTime: '',
      priority: 'Normal',
      notes: 'Auto-created from scheduling approval. Appointment ID: ' + appointmentId,
      linkType: 'WeeklyService',
      linkId: String(appointmentId)
    };
    UrlFetchApp.fetch(INVOICE_ESTIMATE_WEBAPP_URL, {
      method: 'post',
      payload: payload,
      muteHttpExceptions: true
    });
  } catch (e) {
    Logger.log('schedulingCreateFollowUpPmTask_: ' + e);
  }
}

/**
 * From SchedulingUI (google.script.run): create a task linked to an appointment or project.
 */
function schedulingAddPmTask(companyId, taskPayload) {
  taskPayload = taskPayload || {};
  try {
    var payload = {
      action: 'addPmTask',
      companyId: companyId || 'CMP-AQUALITYPOOL',
      title: taskPayload.title || 'Task',
      projectId: taskPayload.projectId || '',
      customerName: taskPayload.customerName || '',
      customerEmail: taskPayload.customerEmail || '',
      dueDate: taskPayload.dueDate || '',
      dueTime: taskPayload.dueTime || '',
      priority: taskPayload.priority || 'Normal',
      notes: taskPayload.notes || '',
      linkType: taskPayload.linkType || '',
      linkId: taskPayload.linkId || ''
    };
    var resp = UrlFetchApp.fetch(INVOICE_ESTIMATE_WEBAPP_URL, {
      method: 'post',
      payload: payload,
      muteHttpExceptions: true
    });
    return JSON.parse(resp.getContentText() || '{}');
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ===========================================================================
// WEB APP ENTRY - Serves the HTML page
// ===========================================================================
function doGet(e) {
  // Debug logging to see what parameters are received
  try {
    Logger.log('🔍 doGet called with parameters: ' + JSON.stringify(e ? e.parameter : null));
    if (e && e.parameter && e.parameter.page) {
      Logger.log('📄 Page parameter detected: ' + e.parameter.page);
    }
  } catch (err) {
    Logger.log('Debug logging error: ' + err);
  }
  
  if (e && e.parameter && e.parameter.action === 'approveAdditionalCharge' && e.parameter.token) {
    const approval = approveAdditionalChargeByToken_(String(e.parameter.token || '').trim());
    const ok = !!(approval && approval.success);
    const title = ok ? 'Charge Approved' : 'Approval Failed';
    const msg = ok
      ? ('Thank you. The additional charge was approved and ' + (approval.chargeResult && approval.chargeResult.success ? 'charged automatically.' : 'marked approved for processing.'))
      : (approval && approval.error ? approval.error : 'Invalid or expired link.');
    const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1" />'
      + '<title>' + title + '</title></head><body style="font-family:Inter,Arial,sans-serif;background:#f8fafc;padding:24px;">'
      + '<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:14px;padding:24px;border:1px solid #e2e8f0;box-shadow:0 10px 30px rgba(2,6,23,.08)">'
      + '<h1 style="margin:0 0 12px 0;color:' + (ok ? '#166534' : '#b91c1c') + ';font-size:24px;">' + title + '</h1>'
      + '<p style="margin:0;color:#334155;line-height:1.7;">' + msg + '</p>'
      + '</div></body></html>';
    return HtmlService.createHtmlOutput(html)
      .setTitle(title)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if (e && e.parameter && e.parameter.action === 'dailyConfirmationBatch' && e.parameter.token) {
    return renderDailyConfirmationBatchPage_(String(e.parameter.token || '').trim());
  }

  if (e && e.parameter && e.parameter.action === 'openDailyConfirmationDraft' && e.parameter.token && e.parameter.appointmentId) {
    var tokenOpen = String(e.parameter.token || '').trim();
    var appointmentIdOpen = String(e.parameter.appointmentId || '').trim();
    var openRes = getDailyConfirmationBatchDraft_(tokenOpen, appointmentIdOpen);
    if (!openRes.success) {
      return HtmlService.createHtmlOutput('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body style="font-family:Arial,sans-serif;padding:24px;background:#f8fafc;"><div style="max-width:560px;margin:20px auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;"><h2 style="margin:0 0 10px 0;color:#b91c1c;">Unable to open draft</h2><p style="margin:0;color:#334155;">' + String(openRes.error || 'Draft not found.') + '</p></div></body></html>')
        .setTitle('Draft Unavailable')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
    markDailyConfirmationDraftOpened_(tokenOpen, appointmentIdOpen);
    return renderSmsRedirectPage_(openRes.phone, openRes.body, openRes.name);
  }

  // Handle SMS redirect — email clients strip sms: links, so we use https → redirect
  if (e && e.parameter && e.parameter.action === 'sms') {
    var phone = e.parameter.phone || '';
    var body = e.parameter.body || '';
    var name = e.parameter.name || 'Customer';
    var tokenSms = String(e.parameter.batchToken || '').trim();
    var appointmentIdSms = String(e.parameter.appointmentId || '').trim();
    if (tokenSms && appointmentIdSms) {
      markDailyConfirmationDraftOpened_(tokenSms, appointmentIdSms);
    }
    return renderSmsRedirectPage_(phone, body, name);
  }

  // Handle invoice draft SMS redirect with batch tracking
  if (e && e.parameter && e.parameter.action === 'openInvoiceDraftSms') {
    var phone = e.parameter.phone || '';
    var body = e.parameter.body || '';
    var name = e.parameter.name || 'Customer';
    var batchToken = String(e.parameter.batchToken || '').trim();
    var appointmentId = String(e.parameter.appointmentId || '').trim();
    if (batchToken && appointmentId) {
      markInvoiceDraftOpened_(batchToken, appointmentId);
    }
    return renderSmsRedirectPage_(phone, body, name);
  }

  // Handle confirmation draft SMS redirect with batch tracking
  if (e && e.parameter && e.parameter.action === 'openConfirmationDraftSms') {
    var phone = e.parameter.phone || '';
    var body = e.parameter.body || '';
    var name = e.parameter.name || 'Customer';
    var batchToken = String(e.parameter.batchToken || '').trim();
    var appointmentId = String(e.parameter.appointmentId || '').trim();
    if (batchToken && appointmentId) {
      markConfirmationDraftOpened_(batchToken, appointmentId);
    }
    return renderSmsRedirectPage_(phone, body, name);
  }

  // Handle review draft SMS redirect with batch tracking
  if (e && e.parameter && e.parameter.action === 'openReviewDraftSms') {
    var phone = e.parameter.phone || '';
    var body = e.parameter.body || '';
    var name = e.parameter.name || 'Customer';
    var batchToken = String(e.parameter.batchToken || '').trim();
    var appointmentId = String(e.parameter.appointmentId || '').trim();
    if (batchToken && appointmentId) {
      markReviewDraftOpened_(batchToken, appointmentId);
    }
    return renderSmsRedirectPage_(phone, body, name);
  }

  if (e && e.parameter && e.parameter.token) {
    var token = String(e.parameter.token || '').trim();
    var template = HtmlService.createTemplateFromFile('PoolOpeningForm');
    template.token = JSON.stringify(token);  // quoted for JS, so form has token even if iframe URL is stripped
    template.acceptSuggested = (e.parameter.acceptSuggested === '1' || e.parameter.acceptSuggested === 'true') ? '1' : '';
    return template.evaluate()
      .setTitle('Pool Opening Options')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
  }

  if (e && e.parameter && e.parameter.page === 'weekly') {
    Logger.log('🏊 Loading WeeklyService dashboard - page parameter explicitly set to weekly');
    try {
      var emailParam = (e.parameter.email || '').trim();
      Logger.log('📧 WeeklyService email param: ' + emailParam);
      var output = HtmlService.createHtmlOutputFromFile('WeeklyService')
        .setTitle('Weekly Service Dashboard - A Quality Pool Company')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
      Logger.log('✅ WeeklyService loaded successfully');
      return output;
    } catch (err) {
      Logger.log('❌ Error loading WeeklyService: ' + err.toString());
      return HtmlService.createHtmlOutput('<h1>Error Loading Weekly Service</h1><p>' + err.toString() + '</p>');
    }
  }

  if (e && e.parameter && (e.parameter.page === 'schedule' || e.parameter.schedule === '1')) {
    Logger.log('📝 Loading CustomerSelfSchedule');
    return HtmlService.createHtmlOutputFromFile('CustomerSelfSchedule')
      .setTitle('Schedule Service - A Quality Pool Company')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
  }

  // Public API for Netlify (or any external host): GET with action= and params. Returns JSON with CORS.
  // REQUIRED: Deploy as Web App with "Who has access" = "Anyone" (or "Anyone, even anonymous").
  // If set to "Only myself", Google redirects to login and the redirect has no CORS header → "blocked by CORS policy".
  if (e && e.parameter && e.parameter.action) {
    var jsonStr;
    try {
      var action = String(e.parameter.action || '').trim();
      var result;
      if (action === 'getWeeklyServiceDashboard') {
        result = getWeeklyServiceDashboard((e.parameter.email || '').trim());
      } else if (action === 'getSchedulingContext') {
        result = getSchedulingContext((e.parameter.email || '').trim());
        } else if (action === 'listWeeklyServiceContracts') {
          var companyId      = String(e.parameter.companyId || DEFAULT_COMPANY_ID);
          var customerEmailQ = String(e.parameter.customerEmail || '').trim();
          result = listWeeklyServiceContracts_(companyId, customerEmailQ || null);
        } else if (action === 'getWeeklyServiceContract') {
          result = getWeeklyServiceContract_(String(e.parameter.contractId || '').trim());
      } else if (action === 'lookupCustomerByEmail') {
        var email = (e.parameter.email || '').trim();
        result = lookupCustomerByEmail(email);
      } else if (action === 'getCustomers') {
        var companyId = (e.parameter.companyId || DEFAULT_COMPANY_ID).trim();
        result = getCustomers(companyId);
      } else if (action === 'searchCustomersByCompanyId') {
        var companyId = (e.parameter.companyId || DEFAULT_COMPANY_ID).trim();
        var query = (e.parameter.q || e.parameter.query || '').trim();
        result = searchCustomersByCompanyId(companyId, query);
      } else if (action === 'getPublicAvailability') {
        var st = (e.parameter.serviceType || '').trim();
        var start = (e.parameter.start || '').trim();
        var end = (e.parameter.end || '').trim();
        result = getPublicAvailability(st, start, end);
      } else if (action === 'submitPublicScheduleRequest') {
        var payloadB64 = (e.parameter.payload || '').trim();
        var payload = {};
        if (payloadB64) {
          try {
            payload = JSON.parse(Utilities.newBlob(Utilities.base64Decode(payloadB64)).getDataAsString());
          } catch (err) {
            result = { success: false, error: 'Invalid payload' };
          }
        }
        if (!result) result = submitPublicScheduleRequest(payload);
      } else {
        result = { success: false, error: 'Unknown action' };
      }
      jsonStr = JSON.stringify(result);
    } catch (err) {
      jsonStr = JSON.stringify({ success: false, error: (err.message || String(err)) });
    }
    // JSONP: if callback= is present, return as JS so cross-origin works without CORS (Google may strip CORS headers).
    var callback = (e.parameter && e.parameter.callback) ? String(e.parameter.callback).trim().replace(/[^a-zA-Z0-9_.]/g, '') : '';
    if (callback) {
      var js = callback + '(' + jsonStr + ');';
      return ContentService.createTextOutput(js).setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(jsonStr)
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Default route - ALWAYS load SchedulingUI unless specific page requested
  if (!e || !e.parameter || !e.parameter.page) {
    Logger.log('📅 No page parameter, loading SchedulingUI (default)');
    try {
      return HtmlService.createHtmlOutputFromFile('SchedulingUI')
        .setTitle('Service Scheduling - A Quality Pool Company')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=5.0');
    } catch (err) {
      Logger.log('❌ Error loading SchedulingUI: ' + err.toString());
      return HtmlService.createHtmlOutput('<h1>Error loading SchedulingUI: ' + err.toString() + '</h1>');
    }
  }

  Logger.log('📅 Unknown page parameter: ' + (e.parameter.page || 'undefined') + ', loading default SchedulingUI');
  try {
    return HtmlService.createHtmlOutputFromFile('SchedulingUI')
      .setTitle('Service Scheduling - A Quality Pool Company')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=5.0');
  } catch (err) {
    Logger.log('❌ Error loading SchedulingUI: ' + err.toString());
    return HtmlService.createHtmlOutput('<h1>Error loading SchedulingUI: ' + err.toString() + '</h1>');
  }
}

// ===========================================================================
// doPost — handles mutating actions from Netlify (x-www-form-urlencoded)
// No CORS preflight because content-type is application/x-www-form-urlencoded.
// ===========================================================================
function doPost(e) {
  var jsonStr;
  try {
    // Stripe webhook support (for SetupIntent completion -> save card on file)
    if (e && e.postData && e.postData.contents) {
      try {
        var webhookData = JSON.parse(e.postData.contents);
        if (webhookData && webhookData.object === 'event' && webhookData.type) {
          if (webhookData.type === 'checkout.session.completed' || webhookData.type === 'setup_intent.succeeded') {
            const whRes = handleSchedulingStripeWebhook_(webhookData);
            return ContentService.createTextOutput(JSON.stringify(whRes)).setMimeType(ContentService.MimeType.JSON);
          }
        }
      } catch (ignoreWebhookParse) {}
    }

    var p      = e.parameter || {};
    var action = String(p.action || '').trim();
    var result;

    if (action === 'approveWeeklyServiceRequest') {
      var appointmentId = String(p.appointmentId || '').trim();
      var ctx = getCompanyIdForSchedulingUser_(String(p.email || '').trim());
      var options = {
        companyId: ctx.companyId || DEFAULT_COMPANY_ID,
        firstServiceDate: p.firstServiceDate || '',
        firstServiceTime: p.firstServiceTime || '09:00',
        needsFullOpening: p.needsFullOpening === 'true',
        openingSameVisit: p.openingSameVisit === 'true',
        openingDate:      p.openingDate || '',
        openingTime:      p.openingTime || '09:00'
      };
      result = approveWeeklyServiceRequest(appointmentId, options);

    } else if (action === 'rejectWeeklyServiceRequest') {
      result = rejectWeeklyServiceRequest(String(p.appointmentId || '').trim());

    } else if (action === 'manuallyAddWeeklyService') {
      var data = {
        companyId:      p.companyId || getCompanyIdForSchedulingUser_(String(p.email || '').trim()).companyId || DEFAULT_COMPANY_ID,
        customerName:   p.customerName   || '',
        customerEmail:  p.customerEmail  || '',
        phone:          p.phone          || '',
        address:        p.address        || '',
        frequency:      p.frequency      || 'weekly',
        preferredDay:   p.preferredDay   || '',
        price:          parseFloat(p.price || 160),
        assignedTo:     p.assignedTo     || '',
        notifyCustomer: p.notifyCustomer === 'true'
      };
      result = manuallyAddWeeklyService(data);

    } else if (action === 'saveAppointmentSchedule') {
      result = saveAppointmentSchedule({
        customerId:    p.customerId    || '',
        customerName:  p.customerName  || '',
        frequency:     p.frequency     || 'weekly',
        blockedDates:  p.blockedDates  || []
      });

    } else if (action === 'createAutopayEnrollmentLink') {
      result = createAutopayEnrollmentLink({
        companyId: p.companyId || '',
        customerName: p.customerName || '',
        customerEmail: p.customerEmail || '',
        customerPhone: p.customerPhone || '',
        appointmentId: p.appointmentId || '',
        successUrl: p.successUrl || '',
        cancelUrl: p.cancelUrl || ''
      });
    } else if (action === 'createManualCardOnFileLink') {
      result = createManualCardOnFileLink({
        companyId: p.companyId || '',
        customerName: p.customerName || '',
        customerEmail: p.customerEmail || '',
        customerPhone: p.customerPhone || '',
        successUrl: p.successUrl || '',
        cancelUrl: p.cancelUrl || ''
      });

    } else if (action === 'requestAdditionalChargeApproval') {
      result = requestAdditionalChargeApproval({
        appointmentId: p.appointmentId || '',
        companyId: p.companyId || '',
        customerName: p.customerName || '',
        customerEmail: p.customerEmail || '',
        customerPhone: p.customerPhone || '',
        amount: parseFloat(p.amount || 0),
        reason: p.reason || '',
        description: p.description || ''
      });

    } else if (action === 'createWeeklyServiceContract') {
      result = createWeeklyServiceContract({
        companyId:         p.companyId        || DEFAULT_COMPANY_ID,
        customerName:      p.customerName      || '',
        customerEmail:     p.customerEmail     || '',
        customerPhone:     p.customerPhone     || '',
        customerAddress:   p.customerAddress   || '',
        contractTitle:     p.contractTitle     || '',
        frequency:         p.frequency         || 'weekly',
        serviceDay:        p.serviceDay        || '',
        serviceTimeWindow: p.serviceTimeWindow || '',
        pricePerVisit:     parseFloat(p.pricePerVisit || 0),
        startDate:         p.startDate         || '',
        specialNotes:      p.specialNotes      || '',
        customTerms:       p.customTerms       || ''
      });

    } else if (action === 'sendWeeklyServiceContract') {
      result = sendWeeklyServiceContract(String(p.contractId || '').trim());

    } else if (action === 'updateWeeklyServiceContract') {
      result = updateWeeklyServiceContract(String(p.contractId || '').trim(), {
        contractTitle:     p.contractTitle,
        customerName:      p.customerName,
        customerEmail:     p.customerEmail,
        customerPhone:     p.customerPhone,
        customerAddress:   p.customerAddress,
        frequency:         p.frequency,
        serviceDay:        p.serviceDay,
        serviceTimeWindow: p.serviceTimeWindow,
        pricePerVisit:     p.pricePerVisit !== undefined ? parseFloat(p.pricePerVisit) : undefined,
        startDate:         p.startDate,
        specialNotes:      p.specialNotes,
        terms:             p.customTerms
      });

    } else if (action === 'deleteWeeklyServiceContract') {
      result = deleteWeeklyServiceContract_(String(p.contractId || '').trim());

    } else if (action === 'getWeeklyContractStripeLink') {
      result = getWeeklyContractStripeLink(String(p.contractId || '').trim());

    } else if (action === 'logServiceCompletion') {
      result = logServiceCompletion({
        companyId:    p.companyId    || DEFAULT_COMPANY_ID,
        customerEmail: p.customerEmail || '',
        serviceType:  p.serviceType   || 'Regular',  // 'Regular' or 'OneOff'
        description:  p.description   || '',
        amount:       parseFloat(p.amount || 0),
        notes:        p.notes         || '',
        performedBy:  p.performedBy   || '',
        date:         p.date          || new Date().toISOString().split('T')[0]
      });

    } else if (action === 'getServiceHistory') {
      result = getServiceHistory_(String(p.customerEmail || '').trim(), p.companyId || DEFAULT_COMPANY_ID);
    } else if (action === 'getChemicalsCatalog') {
      result = getChemicalsCatalog_(p.companyId || DEFAULT_COMPANY_ID);
    } else if (action === 'upsertChemicalCatalog') {
      result = upsertChemicalCatalogItem_({
        companyId: p.companyId || DEFAULT_COMPANY_ID,
        chemicalKey: p.chemicalKey || '',
        displayName: p.displayName || '',
        unit: p.unit || '',
        unitPrice: parseFloat(p.unitPrice || 0),
        active: String(p.active || 'true').toLowerCase() !== 'false'
      });

    } else if (action === 'uploadCustomerReceipt') {
      result = uploadCustomerReceipt({
        customerEmail: p.customerEmail || '',
        description: p.description || '',
        amount: parseFloat(p.amount || 0),
        date: p.date || new Date().toISOString().split('T')[0],
        base64Image: p.base64Image || '',
        mimeType: p.mimeType || 'image/jpeg',
        notes: p.notes || ''
      });

    } else if (action === 'getCustomerReceipts') {
      result = getCustomerReceipts_(String(p.customerEmail || '').trim(), p.companyId || DEFAULT_COMPANY_ID);

    } else if (action === 'getCustomerSpending') {
      result = getCustomerSpending_(String(p.customerEmail || '').trim(), p.companyId || DEFAULT_COMPANY_ID);

    } else if (action === 'getUnavailableBlocks') {
      result = getUnavailableBlocks(p.companyId || DEFAULT_COMPANY_ID);

    } else if (action === 'saveUnavailableBlocks') {
      let blocks = [];
      try {
        blocks = typeof p.blocks === 'string' ? JSON.parse(p.blocks) : p.blocks || [];
      } catch (e) {
        blocks = [];
      }
      result = saveUnavailableBlocks(p.companyId || DEFAULT_COMPANY_ID, blocks);

    } else if (action === 'isDateBlocked') {
      result = { blocked: isDateBlocked(p.companyId || DEFAULT_COMPANY_ID, p.dateStr || '') };

    } else if (action === 'getBlockedDateRanges') {
      result = getBlockedDateRanges(p.companyId || DEFAULT_COMPANY_ID);

    } else if (action === 'calendarPushSync' || action === 'syncAppointmentsFromGoogleCalendar') {
      // Can be called by external webhook receiver or manual automation endpoint.
      result = syncAppointmentsFromGoogleCalendar();

    } else {
      result = { success: false, error: 'Unknown action: ' + action };
    }


    jsonStr = JSON.stringify(result);
  } catch (err) {
    jsonStr = JSON.stringify({ success: false, error: (err.message || String(err)) });
  }
  return ContentService.createTextOutput(jsonStr).setMimeType(ContentService.MimeType.JSON);
}

// ===========================================================================
// SHEET HELPERS
// ===========================================================================
function getOrCreateSheet(name, headers) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers && headers.length) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
  } else if (headers && headers.length) {
    // Ensure headers are up to date (add missing columns if needed)
    const lastCol = sheet.getLastColumn() || 1;
    const existingHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    
    // Check if AppointmentType header exists (critical for appointments sheet)
    if (name === APPOINTMENTS_SHEET && existingHeaders.indexOf('AppointmentType') === -1) {
      // Headers need to be updated - insert AppointmentType and CustomAppointmentNote after ServiceType
      const serviceTypeIndex = existingHeaders.indexOf('ServiceType');
      if (serviceTypeIndex !== -1) {
        // Insert two new columns after ServiceType (column index + 1)
        sheet.insertColumnsAfter(serviceTypeIndex + 1, 2);
        sheet.getRange(1, serviceTypeIndex + 2).setValue('AppointmentType');
        sheet.getRange(1, serviceTypeIndex + 3).setValue('CustomAppointmentNote');
        sheet.getRange(1, serviceTypeIndex + 2, 1, 2).setFontWeight('bold');
        // Existing data rows will automatically shift right - no need to manually insert cells
      }
    }
    
    // Add any other missing header columns at the end
    // getRange(row, column, numRows, numColumns) — 4th param is number of columns, not end index
    if (existingHeaders.length < headers.length) {
      const missingHeaders = headers.slice(existingHeaders.length);
      if (missingHeaders.length > 0) {
        const startCol = existingHeaders.length + 1;
        const numCols = missingHeaders.length;
        sheet.getRange(1, startCol, 1, numCols).setValues([missingHeaders]);
        sheet.getRange(1, startCol, 1, numCols).setFontWeight('bold');
      }
    }
  }
  return sheet;
}

function initializeSchedulingSheets() {
  Logger.log('📊 Creating spreadsheet tabs...');
  
  getOrCreateSheet(APPOINTMENTS_SHEET, getAppointmentsHeaders());
  Logger.log('  ✅ Appointments sheet ready');
  
  // Customers sheet is shared with CustomerInfo.gs — no need to create it here
  // Headers: Company ID | Customer ID | Name | Email | Phone | Address | City | State | Zip Code | Notes | Created Date | Last Updated | ...
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const custSheet = ss.getSheetByName(CUSTOMERS_SHEET);
  if (custSheet) {
    Logger.log('  ✅ Customers sheet found (' + (custSheet.getLastRow() - 1) + ' customers)');
  } else {
    Logger.log('  ⚠️ Customers sheet not found — create it via CustomerInfo.gs first');
  }
  
  getOrCreateSheet(NOTIFICATION_LOG_SHEET, [
    'LogID', 'AppointmentID', 'CustomerEmail', 'Type', 'Status',
    'SentAt', 'Message'
  ]);
  Logger.log('  ✅ Notification_Log sheet ready');

  initializeTechniciansSheet();

  getOrCreateSheet(BLOCKED_DATES_SHEET, ['Date', 'CompanyID', 'Reason']);
  Logger.log('  ✅ BlockedDates sheet ready (add rows to block company-wide days)');

  // Verify Google Calendar access
  Logger.log('');
  Logger.log('📅 Verifying Google Calendar access...');
  try {
    const calendar = CalendarApp.getCalendarById(CALENDAR_ID) || CalendarApp.getDefaultCalendar();
    if (calendar) {
      Logger.log('  ✅ Google Calendar connected: ' + calendar.getName());
    }
  } catch (calError) {
    Logger.log('  ❌ Calendar error: ' + calError.toString());
    Logger.log('  → Add Google Calendar API service (click "+" next to Services)');
  }

  // Verify email
  Logger.log('');
  try {
    Logger.log('📧 Email quota remaining: ' + MailApp.getRemainingDailyQuota());
  } catch (e) {
    Logger.log('⚠️ Email: ' + e.toString());
  }

  Logger.log('');
  Logger.log('✅ ALL DONE! Deploy as Web App to use.');
}

// ===========================================================================
// APPOINTMENTS - Called from frontend via google.script.run
// ===========================================================================
function createAppointment(data) {
  // Ensure sheet has correct headers before creating appointment
  const sheet = getOrCreateSheet(APPOINTMENTS_SHEET, getAppointmentsHeaders());
  const now = new Date().toISOString();

  // Auto-create customer if no customerId
  let customerId = data.customerId;
  if (!customerId && data.customerName) {
    customerId = createOrFindCustomer({
      companyId: data.companyId,
      name: data.customerName,
      email: data.customerEmail,
      phone: data.customerPhone,
      address: data.address
    });
  }

  // Add to Google Calendar (skip if no date — e.g. Opening self-schedule link only)
  let calendarEventId = '';
  if (data.addToCalendar !== false && data.date) {
    try {
      calendarEventId = addToGoogleCalendar(data);
    } catch (calErr) {
      Logger.log('⚠️ Calendar: ' + calErr.toString());
    }
  }

  const apptId = data.id || 'APPT-' + Date.now();
  const row = [
    apptId,
    data.companyId || '',
    customerId || '',
    data.customerName || '',
    data.customerEmail || '',
    data.customerPhone || '',
    data.address || '',
    data.serviceType || 'Pool Service',
    data.appointmentType || 'Regular', // Regular, Estimate/Quote, Other
    data.customAppointmentNote || '', // Custom note for "Other" type
    data.date || '',
    data.time || '',
    data.duration || 60,
    data.description || '',
    data.assignedTo || '',
    data.status || 'Scheduled',
    data.estimatedCost || 0,
    data.amountPaid || 0,
    data.notes || '',
    data.recurring || 'none',
    data.notifyCustomer ? 'Yes' : 'No',
    'No',
    calendarEventId,
    'No',
    data.linkedInvoiceId || '', // LinkedInvoiceID
    now,
    now,
    data.linkedProjectId || '',  // LinkedProjectID
    data.paidStatus || (Number(data.amountPaid || 0) > 0 ? 'Partially Paid' : 'Unpaid'),
    data.arrivalWindowStart || '',
    data.arrivalWindowEnd || '',
    data.autopayStatus || '',
    data.stripeCustomerId || '',
    data.stripePaymentMethodId || '',
    data.linkedServiceReportId || ''
  ];

  sheet.appendRow(row);
  try {
    if (data.closingOptions !== undefined) {
      writeClosingOptionsCell_(sheet, sheet.getLastRow(), data.closingOptions);
    }
  } catch (closeWriteErr) {
    Logger.log('⚠️ closingOptions write: ' + closeWriteErr.toString());
  }

  if (data.linkedServiceReportId && String(data.linkedServiceReportId).trim() && typeof setLinkedAppointmentIdOnServiceReport === 'function') {
    try {
      setLinkedAppointmentIdOnServiceReport(String(data.linkedServiceReportId).trim(), apptId, true);
    } catch (linkErr) {
      Logger.log('⚠️ linkedServiceReportId sync: ' + linkErr.toString());
    }
  }

  // Recurring
  if (data.recurring && data.recurring !== 'none') {
    createRecurringAppointments(data);
  }

  // Notify customer (skip if no date — e.g. Opening self-schedule, customer will pick date later)
  if (data.notifyCustomer && data.customerEmail && data.date) {
    sendAppointmentNotification(data, 'new');
  }

  var telegramWarning = '';
  try {
    if (String(data.status || 'Scheduled') === 'Scheduled') {
      var tg = maybeSendAppointmentScheduledTelegram_(data, apptId);
      if (tg && tg.success === false) telegramWarning = tg.error || 'Telegram draft was not sent';
    }
  } catch (tgErr) {
    Logger.log('⚠️ appointment telegram: ' + tgErr.toString());
    telegramWarning = tgErr.toString();
  }

  return {
    success: true,
    appointmentId: apptId,
    calendarEventId: calendarEventId,
    message: 'Appointment created' + (calendarEventId ? ' & added to Google Calendar' : ''),
    telegramWarning: telegramWarning || undefined
  };
}

function updateAppointment(data) {
  // Ensure sheet has correct headers before updating appointment
  const sheet = getOrCreateSheet(APPOINTMENTS_SHEET, getAppointmentsHeaders());
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || [];
  const now = new Date().toISOString();
  const lastCol = sheet.getLastColumn();

  // Resolve column indices by header name so sheet can have extra columns (e.g. countf) or different order
  function col(name, alt, fallbackIdx) {
    var i = getApptCol(headers, name, alt);
    return i >= 0 ? i : (fallbackIdx >= 0 && lastCol > fallbackIdx ? fallbackIdx : -1);
  }
  var cId = 0, cCompany = 1, cCustomerId = 2, cCustomerName = col('CustomerName', ['Customer Name'], 3);
  var cCustomerEmail = col('CustomerEmail', ['Customer Email'], 4), cCustomerPhone = col('CustomerPhone', ['Customer Phone'], 5);
  var cAddress = col('Address', null, 6), cServiceType = col('ServiceType', ['Service Type'], 7);
  var cAppointmentType = col('AppointmentType', ['Appointment Type'], 8), cCustomNote = col('CustomAppointmentNote', ['CustomAppointment Note', 'CustomAppointment Note'], 9);
  var cDate = col('Date', ['CustomAppointment Date'], 10), cTime = col('Time', null, 11), cDuration = col('Duration', null, 12);
  var cDescription = col('Description', null, 13), cAssignedTo = col('AssignedTo', ['Assigned To'], 14);
  var cStatus = col('Status', null, 15), cEstimatedCost = col('EstimatedCost', ['Estimated Cost'], 16), cAmountPaid = col('AmountPaid', ['Amount Paid'], 17);
  var cNotes = col('Notes', null, 18), cRecurring = col('Recurring', null, 19), cNotify = col('NotifyCustomer', ['Notify Customer'], 20);
  var colLinkedInvoiceId = col('LinkedInvoiceID', ['Linked Invoice ID'], 24);
  var colLinkedProjectId = col('LinkedProjectID', ['Linked Project ID'], 27);
  var colUpdatedAt = col('UpdatedAt', null, 26);
  var cCalendarEventId = col('CalendarEventID', ['Calendar Event ID'], 22);
  var colPaidStatus = col('PaidStatus', ['Paid Status'], 40);
  var colArrivalWindowStart = col('ArrivalWindowStart', ['Arrival Window Start'], 41);
  var colArrivalWindowEnd = col('ArrivalWindowEnd', ['Arrival Window End'], 42);
  var colAutopayStatus = col('AutopayStatus', ['Autopay Status'], 43);
  var colStripeCustomerId = col('StripeCustomerID', ['Stripe Customer ID'], 44);
  var colStripePaymentMethodId = col('StripePaymentMethodID', ['Stripe Payment Method ID'], 45);
  var colLinkedServiceReportId = col('LinkedServiceReportID', ['Linked Service Report ID'], -1);

  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === data.id) {
      const row = i + 1;
      const r = values[i];
      const existingCalEventId = cCalendarEventId >= 0 ? r[cCalendarEventId] : r[22];

      // Only write columns that are present in data; use header-based column so extra columns (e.g. countf) don't shift data
      if (data.customerId !== undefined && cCustomerId >= 0) sheet.getRange(row, cCustomerId + 1).setValue(data.customerId || '');
      if (data.customerName !== undefined && cCustomerName >= 0) sheet.getRange(row, cCustomerName + 1).setValue(data.customerName || '');
      if (data.customerEmail !== undefined && cCustomerEmail >= 0) sheet.getRange(row, cCustomerEmail + 1).setValue(data.customerEmail || '');
      if (data.customerPhone !== undefined && cCustomerPhone >= 0) sheet.getRange(row, cCustomerPhone + 1).setValue(data.customerPhone || '');
      if (data.address !== undefined && cAddress >= 0) sheet.getRange(row, cAddress + 1).setValue(data.address || '');
      if (data.serviceType !== undefined && cServiceType >= 0) sheet.getRange(row, cServiceType + 1).setValue(data.serviceType || '');
      if (data.appointmentType !== undefined && cAppointmentType >= 0) sheet.getRange(row, cAppointmentType + 1).setValue(data.appointmentType || 'Regular');
      if (data.customAppointmentNote !== undefined && cCustomNote >= 0) sheet.getRange(row, cCustomNote + 1).setValue(data.customAppointmentNote || '');
      if (data.date !== undefined && cDate >= 0) sheet.getRange(row, cDate + 1).setValue(data.date || '');
      if (data.time !== undefined && cTime >= 0) sheet.getRange(row, cTime + 1).setValue(data.time || '');
      if (data.duration !== undefined && cDuration >= 0) sheet.getRange(row, cDuration + 1).setValue(data.duration !== '' ? data.duration : 60);
      if (data.description !== undefined && cDescription >= 0) sheet.getRange(row, cDescription + 1).setValue(data.description || '');
      if (data.assignedTo !== undefined && cAssignedTo >= 0) sheet.getRange(row, cAssignedTo + 1).setValue(data.assignedTo || '');
      var prevStatus = cStatus >= 0 ? String(r[cStatus] || '') : '';
    if (data.status !== undefined && cStatus >= 0) sheet.getRange(row, cStatus + 1).setValue(data.status || 'Scheduled');
    try {
      if (data.closingOptions !== undefined) writeClosingOptionsCell_(sheet, row, data.closingOptions);
    } catch (closeWriteErr) {
      Logger.log('⚠️ closingOptions update: ' + closeWriteErr.toString());
    }
      if (data.estimatedCost !== undefined && cEstimatedCost >= 0) sheet.getRange(row, cEstimatedCost + 1).setValue(data.estimatedCost !== '' ? data.estimatedCost : 0);
      if (data.amountPaid !== undefined && cAmountPaid >= 0) sheet.getRange(row, cAmountPaid + 1).setValue(data.amountPaid !== '' ? data.amountPaid : (r[cAmountPaid] || 0));
      if (data.notes !== undefined && cNotes >= 0) sheet.getRange(row, cNotes + 1).setValue(data.notes || '');
      if (data.recurring !== undefined && cRecurring >= 0) sheet.getRange(row, cRecurring + 1).setValue(data.recurring || 'none');
      if (data.notifyCustomer !== undefined && cNotify >= 0) sheet.getRange(row, cNotify + 1).setValue(data.notifyCustomer ? 'Yes' : 'No');
      if (data.linkedInvoiceId !== undefined && colLinkedInvoiceId >= 0) sheet.getRange(row, colLinkedInvoiceId + 1).setValue(data.linkedInvoiceId || '');
      if (data.linkedProjectId !== undefined && colLinkedProjectId >= 0) sheet.getRange(row, colLinkedProjectId + 1).setValue(data.linkedProjectId || '');
      if (data.linkedServiceReportId !== undefined && colLinkedServiceReportId >= 0) {
        var prevSrForAppt = colLinkedServiceReportId >= 0 ? String(r[colLinkedServiceReportId] || '').trim() : '';
        var nextSrForAppt = String(data.linkedServiceReportId || '').trim();
        if (prevSrForAppt !== nextSrForAppt) {
          setLinkedServiceReportIdOnAppointment(data.id, nextSrForAppt, false);
        }
      }
      if (data.paidStatus !== undefined && colPaidStatus >= 0) sheet.getRange(row, colPaidStatus + 1).setValue(data.paidStatus || 'Unpaid');
      if (data.arrivalWindowStart !== undefined && colArrivalWindowStart >= 0) sheet.getRange(row, colArrivalWindowStart + 1).setValue(data.arrivalWindowStart || '');
      if (data.arrivalWindowEnd !== undefined && colArrivalWindowEnd >= 0) sheet.getRange(row, colArrivalWindowEnd + 1).setValue(data.arrivalWindowEnd || '');
      if (data.autopayStatus !== undefined && colAutopayStatus >= 0) sheet.getRange(row, colAutopayStatus + 1).setValue(data.autopayStatus || '');
      if (data.stripeCustomerId !== undefined && colStripeCustomerId >= 0) sheet.getRange(row, colStripeCustomerId + 1).setValue(data.stripeCustomerId || '');
      if (data.stripePaymentMethodId !== undefined && colStripePaymentMethodId >= 0) sheet.getRange(row, colStripePaymentMethodId + 1).setValue(data.stripePaymentMethodId || '');
      if (colUpdatedAt >= 0) sheet.getRange(row, colUpdatedAt + 1).setValue(now);

      // Update Google Calendar event
      try {
        if (existingCalEventId) {
          updateGoogleCalendarEvent(existingCalEventId, data);
        } else if (data.addToCalendar !== false && cCalendarEventId >= 0) {
          const newCalId = addToGoogleCalendar(data);
          if (newCalId) sheet.getRange(row, cCalendarEventId + 1).setValue(newCalId);
        }
      } catch (calErr) {
        Logger.log('⚠️ Calendar update: ' + calErr.toString());
      }

      if (data.notifyCustomer && data.customerEmail) {
        sendAppointmentNotification(data, 'updated');
      }

      try {
        const activityBits = [];
        if (data.status !== undefined) activityBits.push('Status: ' + (data.status || 'Scheduled'));
        if (data.date !== undefined || data.time !== undefined) {
          const newDate = data.date !== undefined ? (data.date || '') : String(r[cDate] || '');
          const newTime = data.time !== undefined ? (data.time || '') : String(r[cTime] || '');
          if (newDate || newTime) activityBits.push('Schedule: ' + newDate + ' ' + newTime);
        }
        if (data.notes !== undefined && String(data.notes || '').trim()) activityBits.push('Notes updated');
        if (data.arrivalWindowStart !== undefined || data.arrivalWindowEnd !== undefined) {
          const ws = data.arrivalWindowStart !== undefined ? data.arrivalWindowStart : (r[colArrivalWindowStart] || '');
          const we = data.arrivalWindowEnd !== undefined ? data.arrivalWindowEnd : (r[colArrivalWindowEnd] || '');
          if (ws || we) activityBits.push('Arrival window: ' + ws + ' - ' + we);
        }
        if (activityBits.length) {
          appendCalendarEventLogForAppointment_(data.id, 'Appointment updated — ' + activityBits.join(' | '));
        }
      } catch (auditErr) {
        Logger.log('updateAppointment calendar audit append failed: ' + auditErr.toString());
      }

      var telegramWarning = '';
  try {
    if (String(data.status || '') === 'Scheduled' && typeof prevStatus !== 'undefined' && String(prevStatus) !== 'Scheduled') {
      var tg = maybeSendAppointmentScheduledTelegram_(data, data.id);
      if (tg && tg.success === false) telegramWarning = tg.error || 'Telegram draft was not sent';
    }
  } catch (tgErr) {
    Logger.log('⚠️ appointment telegram: ' + tgErr.toString());
    telegramWarning = tgErr.toString();
  }

  return { success: true, message: 'Appointment updated', telegramWarning: telegramWarning || undefined };
    }
  }

  return { success: false, error: 'Appointment not found' };
}

function deleteAppointment(appointmentId, companyId) {
  const sheet = getOrCreateSheet(APPOINTMENTS_SHEET);
  const values = sheet.getDataRange().getValues();

  for (let i = values.length - 1; i >= 1; i--) {
    if (values[i][0] === appointmentId && (!companyId || values[i][1] === companyId)) {
      const calEventId = values[i][20]; // col 21 = CalendarEventID
      if (calEventId) {
        try { deleteGoogleCalendarEvent(calEventId); } catch (e) {}
      }
      sheet.deleteRow(i + 1);
      return { success: true, message: 'Appointment deleted' };
    }
  }

  return { success: false, error: 'Appointment not found' };
}

function getScheduledAppointments(companyId) {
  try {
    const sheet = getOrCreateSheet(APPOINTMENTS_SHEET, getAppointmentsHeaders());
    const values = sheet.getDataRange().getValues();
    const appointments = [];
    
    // Check header row to determine structure
    const headers = values[0] || [];
    const hasAppointmentType = headers.indexOf('AppointmentType') !== -1;
    const isNewStructure = hasAppointmentType;
    let colLinkedInvoiceId = headers.indexOf('LinkedInvoiceID');
    if (colLinkedInvoiceId === -1) colLinkedInvoiceId = headers.indexOf('Linked Invoice ID');
    if (colLinkedInvoiceId === -1) colLinkedInvoiceId = 24;
    const hasLinkedProjectId = headers.indexOf('LinkedProjectID') !== -1;
    const colOpeningFormToken = headers.indexOf('OpeningFormToken');
    const colOpeningFormStatus = headers.indexOf('OpeningFormStatus');
    const colOpeningFormData = headers.indexOf('OpeningFormData');
    const colOpeningFormSubmittedAt = headers.indexOf('OpeningFormSubmittedAt');
    const colOpeningFormLastUpdatedAt = headers.indexOf('OpeningFormLastUpdatedAt');
    const colOpeningScheduleRequestDate = headers.indexOf('OpeningScheduleRequestDate');
    const colOpeningScheduleRequestTime = headers.indexOf('OpeningScheduleRequestTime');
    const colOpeningScheduleRequestStatus = headers.indexOf('OpeningScheduleRequestStatus');
    const colOpeningSuggestedDate = headers.indexOf('OpeningSuggestedDate');
    const colOpeningSuggestedTime = headers.indexOf('OpeningSuggestedTime');
    const colPreferredServiceDay = headers.indexOf('PreferredServiceDay');
    const colPaidStatus = headers.indexOf('PaidStatus');
    const colArrivalWindowStart = headers.indexOf('ArrivalWindowStart');
    const colArrivalWindowEnd = headers.indexOf('ArrivalWindowEnd');
    const colAutopayStatus = headers.indexOf('AutopayStatus');
    const colStripeCustomerId = headers.indexOf('StripeCustomerID');
    const colStripePaymentMethodId = headers.indexOf('StripePaymentMethodID');
    const colLinkedServiceReportId = headers.indexOf('LinkedServiceReportID');
    const stripePaidInvoiceSet = getStripePaidInvoiceSet_(companyId);

    // Helper to convert dates to strings
    function dateToString(val) {
      if (!val) return '';
      if (val instanceof Date) {
        return val.toISOString();
      }
      return String(val);
    }

    // Helper to convert numbers safely
    function safeNumber(val) {
      if (val === null || val === undefined || val === '') return 0;
      const num = parseFloat(val);
      return isNaN(num) ? 0 : num;
    }

    for (let i = 1; i < values.length; i++) {
      var rowCompanyId = (values[i][1] != null && values[i][1] !== '') ? String(values[i][1]).trim() : '';
      var include = !companyId || rowCompanyId === companyId || (rowCompanyId === '' && companyId === 'CMP-AQUALITYPOOL');
      if (include) {
        const row = values[i];
        
        let appt;
        if (isNewStructure) {
          // New structure with AppointmentType and CustomAppointmentNote
          appt = {
            id: String(row[0] || ''),
            companyId: String(row[1] || ''),
            customerId: String(row[2] || ''),
            customerName: String(row[3] || ''),
            customerEmail: String(row[4] || ''),
            customerPhone: String(row[5] || ''),
            address: String(row[6] || ''),
            serviceType: String(row[7] || ''),
            appointmentType: String(row[8] || 'Regular'),
            customAppointmentNote: String(row[9] || ''),
            date: formatSheetDate(row[10]),
            time: formatSheetTime(row[11]),
            duration: safeNumber(row[12]),
            description: String(row[13] || ''),
            assignedTo: String(row[14] || ''),
            status: String(row[15] || ''),
            estimatedCost: safeNumber(row[16]),
            amountPaid: safeNumber(row[17]),
            notes: String(row[18] || ''),
            recurring: String(row[19] || ''),
            notifyCustomer: row[20] === 'Yes',
            notificationSent: row[21] === 'Yes',
            calendarEventId: String(row[22] || ''),
            reviewSent: row[23] === 'Yes',
            linkedInvoiceId: colLinkedInvoiceId >= 0 && row[colLinkedInvoiceId] !== undefined ? String(row[colLinkedInvoiceId] || '').trim() : '',
            createdAt: dateToString(row[25]),
            updatedAt: dateToString(row[26]),
            linkedProjectId: hasLinkedProjectId ? String(row[27] || '') : '',
            openingFormToken: colOpeningFormToken >= 0 ? String(row[colOpeningFormToken] || '') : '',
            openingFormStatus: colOpeningFormStatus >= 0 ? String(row[colOpeningFormStatus] || '') : '',
            openingFormData: colOpeningFormData >= 0 ? String(row[colOpeningFormData] || '') : '',
            openingFormSubmittedAt: colOpeningFormSubmittedAt >= 0 ? dateToString(row[colOpeningFormSubmittedAt]) : '',
            openingFormLastUpdatedAt: colOpeningFormLastUpdatedAt >= 0 ? dateToString(row[colOpeningFormLastUpdatedAt]) : '',
            openingScheduleRequestDate: colOpeningScheduleRequestDate >= 0 ? String(row[colOpeningScheduleRequestDate] || '') : '',
            openingScheduleRequestTime: colOpeningScheduleRequestTime >= 0 ? formatSheetTime(row[colOpeningScheduleRequestTime]) : '',
            openingScheduleRequestStatus: colOpeningScheduleRequestStatus >= 0 ? String(row[colOpeningScheduleRequestStatus] || '') : '',
            openingSuggestedDate: colOpeningSuggestedDate >= 0 ? String(row[colOpeningSuggestedDate] || '') : '',
            openingSuggestedTime: colOpeningSuggestedTime >= 0 ? formatSheetTime(row[colOpeningSuggestedTime]) : '',
            preferredServiceDay: colPreferredServiceDay >= 0 ? String(row[colPreferredServiceDay] || '').trim() : '',
            paidStatus: colPaidStatus >= 0 ? String(row[colPaidStatus] || '') : ((safeNumber(row[17]) > 0) ? 'Partially Paid' : 'Unpaid'),
            arrivalWindowStart: colArrivalWindowStart >= 0 ? formatSheetTime(row[colArrivalWindowStart]) : '',
            arrivalWindowEnd: colArrivalWindowEnd >= 0 ? formatSheetTime(row[colArrivalWindowEnd]) : '',
            autopayStatus: colAutopayStatus >= 0 ? String(row[colAutopayStatus] || '') : '',
            stripeCustomerId: colStripeCustomerId >= 0 ? String(row[colStripeCustomerId] || '') : '',
            stripePaymentMethodId: colStripePaymentMethodId >= 0 ? String(row[colStripePaymentMethodId] || '') : '',
            linkedServiceReportId: colLinkedServiceReportId >= 0 && row[colLinkedServiceReportId] !== undefined
              ? String(row[colLinkedServiceReportId] || '').trim()
              : ''
          };
        } else {
          // Old structure (backward compatibility)
          appt = {
            id: String(row[0] || ''),
            companyId: String(row[1] || ''),
            customerId: String(row[2] || ''),
            customerName: String(row[3] || ''),
            customerEmail: String(row[4] || ''),
            customerPhone: String(row[5] || ''),
            address: String(row[6] || ''),
            serviceType: String(row[7] || ''),
            appointmentType: 'Regular', // Default for old appointments
            customAppointmentNote: '',
            date: formatSheetDate(row[8]),
            time: formatSheetTime(row[9]),
            duration: safeNumber(row[10]),
            description: String(row[11] || ''),
            assignedTo: String(row[12] || ''),
            status: String(row[13] || ''),
            estimatedCost: safeNumber(row[14]),
            amountPaid: safeNumber(row[15]),
            notes: String(row[16] || ''),
            recurring: String(row[17] || ''),
            notifyCustomer: row[18] === 'Yes',
            notificationSent: row[19] === 'Yes',
            calendarEventId: String(row[20] || ''),
            reviewSent: row[21] === 'Yes',
            linkedInvoiceId: '', // Old appointments don't have this
            linkedProjectId: '',
            createdAt: dateToString(row[22]),
            updatedAt: dateToString(row[23]),
            openingFormToken: '',
            openingFormStatus: '',
            openingFormData: '',
            openingFormSubmittedAt: '',
            openingFormLastUpdatedAt: '',
            linkedServiceReportId: ''
          };
        }

        const linkedInvoiceId = String(appt.linkedInvoiceId || '').trim();
        const paidStatusNorm = String(appt.paidStatus || appt.PaidStatus || '').toLowerCase().trim();
        const hasAmountPaid = (parseFloat(appt.amountPaid || appt.AmountPaid || 0) || 0) > 0;
        const hasStripePayment = !!(linkedInvoiceId && stripePaidInvoiceSet[linkedInvoiceId]);
        const statusShowsPaid = paidStatusNorm === 'paid' || paidStatusNorm === 'partially paid' || hasAmountPaid;

        appt.stripePaymentReceived = hasStripePayment;
        appt.needsStripePayment = !!(linkedInvoiceId && !hasStripePayment && !statusShowsPaid && !hasAmountPaid);
        
            try {
      appt.closingOptions = (typeof headers !== 'undefined' && headers)
        ? parseClosingOptionsCell_(row[headers.indexOf('ClosingOptions')])
        : null;
    } catch (closeParseErr) {
      appt.closingOptions = null;
    }
    appointments.push(appt);
      }
    }

    return { success: true, appointments: appointments };
  } catch (error) {
    Logger.log('❌ Error in getScheduledAppointments: ' + error.toString());
    Logger.log('Stack: ' + error.stack);
    return { success: false, appointments: [], error: error.toString() };
  }
}

function getStripePaidInvoiceSet_(companyId) {
  const paidSet = {};
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(PAYMENT_HISTORY_SHEET);
    if (!sheet) return paidSet;

    const data = sheet.getDataRange().getValues();
    if (!data || data.length < 3) return paidSet; // Row 1 title, row 2 headers

    for (let i = 2; i < data.length; i++) {
      const invoiceId = String(data[i][1] || '').trim(); // Col B
      if (!invoiceId) continue;

      const rowCompany = String(data[i][2] || '').trim(); // Col C
      if (companyId && rowCompany && rowCompany !== String(companyId).trim()) continue;

      const method = String(data[i][4] || '').toLowerCase().trim(); // Col E
      const status = String(data[i][6] || '').toLowerCase().trim(); // Col G

      const isStripeLikeMethod = method.indexOf('stripe') !== -1 || method.indexOf('card') !== -1;
      if (!isStripeLikeMethod) continue;

      const isFailed = status.indexOf('fail') !== -1 || status.indexOf('cancel') !== -1 || status.indexOf('void') !== -1 || status.indexOf('refund') !== -1 || status.indexOf('chargeback') !== -1;
      if (isFailed) continue;

      paidSet[invoiceId] = true;
    }
  } catch (error) {
    Logger.log('⚠️ getStripePaidInvoiceSet_ error: ' + error.toString());
  }
  return paidSet;
}

// ===========================================================================
// CUSTOMERS - Uses the main "Customers" sheet (shared with CustomerInfo.gs)
//
// Column layout (current):
//   Col 0 = Company ID
//   Col 1 = Customer ID
//   Col 2 = Name
//   Col 3 = Email
//   Col 4 = Phone
//   Col 5 = Address
//   Col 6 = City
//   Col 7 = State
//   Col 8 = Zip Code
//   Col 9 = Notes
//   Col 10 = Created Date
//   Col 11 = Last Updated
// ===========================================================================
const CUST_COL = { COMPANY: 0, ID: 1, NAME: 2, EMAIL: 3, PHONE: 4, ADDRESS: 5, CITY: 6, STATE: 7, ZIP: 8, NOTES: 9, CREATED: 10, UPDATED: 11 };

/** Appointments sheet headers: base + optional Opening form columns (appended only if missing). */
function getAppointmentsHeaders() {
  return [
    'ID', 'CompanyID', 'CustomerID', 'CustomerName', 'CustomerEmail',
    'CustomerPhone', 'Address', 'ServiceType', 'AppointmentType', 'CustomAppointmentNote', 'Date', 'Time',
    'Duration', 'Description', 'AssignedTo', 'Status', 'EstimatedCost',
    'AmountPaid', 'Notes', 'Recurring', 'NotifyCustomer', 'NotificationSent',
    'CalendarEventID', 'ReviewSent', 'LinkedInvoiceID', 'CreatedAt', 'UpdatedAt', 'LinkedProjectID',
    'OpeningFormToken', 'OpeningFormStatus', 'OpeningFormData', 'OpeningFormSubmittedAt', 'OpeningFormLastUpdatedAt',
    'OpeningScheduleRequestDate', 'OpeningScheduleRequestTime', 'OpeningScheduleRequestStatus', 'OpeningScheduleRequestLastEmailAt',
    'OpeningSuggestedDate', 'OpeningSuggestedTime',
    'PreferredServiceDay',
    'PaidStatus', 'ArrivalWindowStart', 'ArrivalWindowEnd',
    'AutopayStatus', 'StripeCustomerID', 'StripePaymentMethodID',
    'LinkedServiceReportID',
    'ClosingOptions'
  ];
}

/**
 * Set or clear the Service Report ID on an appointment row (header-based).
 * When opt_skipServiceReportUpdate is false, keeps Service Reports "Linked Appointment ID" in sync
 * (pass true when the change originated from ServiceReportingScript to avoid recursion).
 */
function setLinkedServiceReportIdOnAppointment(appointmentId, serviceReportIdOrEmpty, opt_skipServiceReportUpdate) {
  appointmentId = String(appointmentId || '').trim();
  if (!appointmentId) {
    return { success: false, error: 'Missing appointment ID' };
  }
  var nextSr = String(serviceReportIdOrEmpty || '').trim();
  var sheet = getOrCreateSheet(APPOINTMENTS_SHEET, getAppointmentsHeaders());
  var values = sheet.getDataRange().getValues();
  var headers = values[0] || [];
  var colSr = getApptCol(headers, 'LinkedServiceReportID', ['Linked Service Report ID']);
  if (colSr < 0) {
    return { success: false, error: 'LinkedServiceReportID column missing — run initializeSchedulingSheets or open sheet once to add headers' };
  }
  var skipSr = !!opt_skipServiceReportUpdate;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() !== appointmentId) continue;
    var prevSr = colSr >= 0 && values[i][colSr] !== undefined ? String(values[i][colSr] || '').trim() : '';
    if (prevSr === nextSr) {
      return { success: true, unchanged: true };
    }
    sheet.getRange(i + 1, colSr + 1).setValue(nextSr);
    if (skipSr) {
      return { success: true };
    }
    if (prevSr && prevSr !== nextSr && typeof setLinkedAppointmentIdOnServiceReport === 'function') {
      setLinkedAppointmentIdOnServiceReport(prevSr, '', true);
    }
    if (nextSr && typeof setLinkedAppointmentIdOnServiceReport === 'function') {
      setLinkedAppointmentIdOnServiceReport(nextSr, appointmentId, true);
    }
    return { success: true };
  }
  return { success: false, error: 'Appointment not found' };
}

/** Get column index (0-based) for an Appointments header, trying common name variants. */
function getApptCol(headers, name, alternatives) {
  var i = headers.indexOf(name);
  if (i !== -1) return i;
  if (alternatives) for (var a = 0; a < alternatives.length; a++) {
    i = headers.indexOf(alternatives[a]);
    if (i !== -1) return i;
  }
  return -1;
}

function createOrFindCustomer(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CUSTOMERS_SHEET);
  if (!sheet) return null;

  const values = sheet.getDataRange().getValues();
  const companyId = data.companyId || DEFAULT_COMPANY_ID;

  // Try to find existing customer by email or name+phone within same company
  for (let i = 1; i < values.length; i++) {
    const rowCompany = (values[i][CUST_COL.COMPANY] || '').toString();
    const rowEmail = (values[i][CUST_COL.EMAIL] || '').toString().toLowerCase().trim();
    const rowName = (values[i][CUST_COL.NAME] || '').toString();
    const rowPhone = (values[i][CUST_COL.PHONE] || '').toString();

    if (rowCompany === companyId) {
      if (
        (data.email && rowEmail === data.email.toLowerCase().trim()) ||
        (rowName === data.name && rowPhone === data.phone)
      ) {
        // Update address if missing
        if (data.address && !values[i][CUST_COL.ADDRESS]) {
          sheet.getRange(i + 1, CUST_COL.ADDRESS + 1).setValue(data.address);
        }
        return (values[i][CUST_COL.ID] || '').toString();
      }
    }
  }

  // Create new customer matching the sheet layout
  const custId = 'CUST-' + new Date().getFullYear() + '-' + String(sheet.getLastRow()).padStart(4, '0');
  const now = new Date().toISOString();

  // Parse address into parts if possible (e.g., "123 Main St, Louisville, KY 40475")
  let addr = data.address || '';
  let city = '', state = '', zip = '';
  if (addr.includes(',')) {
    const parts = addr.split(',').map(s => s.trim());
    addr = parts[0] || '';
    city = parts[1] || '';
    if (parts[2]) {
      const stateZip = parts[2].trim().split(/\s+/);
      state = stateZip[0] || '';
      zip = stateZip[1] || '';
    }
  }

  const newRow = [
    companyId,        // Col 0 - Company ID
    custId,           // Col 1 - Customer ID
    data.name || '',  // Col 2 - Name
    data.email || '', // Col 3 - Email
    data.phone || '', // Col 4 - Phone
    addr,             // Col 5 - Address
    city,             // Col 6 - City
    state,            // Col 7 - State
    zip,              // Col 8 - ZIP
    '',               // Col 9 - Notes
    now               // Col 10 - Created Date
  ];

  // Pad with empty values for any additional columns the sheet might have
  const headers = getCustomersHeaders();
  while (newRow.length < headers.length) {
    newRow.push('');
  }

  sheet.appendRow(newRow);
  Logger.log('✅ Created customer: ' + data.email);
  return custId;
}

function getCustomersHeaders() {
  return [
    'Company ID', 'Customer ID', 'Name', 'Email', 'Phone',
    'Address', 'City', 'State', 'ZIP', 'Notes', 'Created Date', 'Last Updated'
  ];
}

/**
 * Get all customers for a company
 */
function getCustomers(companyId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CUSTOMERS_SHEET);
    if (!sheet) return { success: true, customers: [] };
    
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return { success: true, customers: [] };
    
    const targetCompanyId = companyId || DEFAULT_COMPANY_ID;
    const customers = [];
    
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const rowCompanyId = String(row[CUST_COL.COMPANY] || '').trim();
      
      // Filter by company ID
      if (rowCompanyId !== targetCompanyId) continue;
      
      customers.push({
        id: String(row[CUST_COL.ID] || ''),
        companyId: rowCompanyId,
        name: String(row[CUST_COL.NAME] || ''),
        email: String(row[CUST_COL.EMAIL] || ''),
        phone: String(row[CUST_COL.PHONE] || ''),
        address: String(row[CUST_COL.ADDRESS] || ''),
        city: String(row[CUST_COL.CITY] || ''),
        state: String(row[CUST_COL.STATE] || ''),
        zip: String(row[CUST_COL.ZIP] || ''),
        notes: String(row[CUST_COL.NOTES] || ''),
        createdDate: String(row[CUST_COL.CREATED] || ''),
        lastUpdated: String(row[CUST_COL.UPDATED] || '')
      });
    }
    
    return { success: true, customers: customers };
  } catch (error) {
    Logger.log('Error in getCustomers: ' + error.toString());
    return { success: false, error: error.toString(), customers: [] };
  }
}

function searchCustomersByCompanyId(companyId, query) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CUSTOMERS_SHEET);
    if (!sheet) return { success: true, suggestions: [] };
    
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return { success: true, suggestions: [] };
    
    const targetCompanyId = companyId || DEFAULT_COMPANY_ID;
    const q = String(query || '').toLowerCase().trim();
    const suggestions = [];
    
    for (let i = 1; i < values.length && suggestions.length < 20; i++) {
      const row = values[i];
      const rowCompanyId = String(row[CUST_COL.COMPANY] || '').trim();
      
      // Filter by company ID
      if (rowCompanyId !== targetCompanyId) continue;
      
      const name = String(row[CUST_COL.NAME] || '').trim();
      const email = String(row[CUST_COL.EMAIL] || '').trim();
      const phone = String(row[CUST_COL.PHONE] || '').trim();
      const address = String(row[CUST_COL.ADDRESS] || '').trim();
      
      // If query provided, filter by name or email
      if (q) {
        const nameMatch = name.toLowerCase().includes(q);
        const emailMatch = email.toLowerCase().includes(q);
        const phoneMatch = phone.toLowerCase().includes(q);
        if (!nameMatch && !emailMatch && !phoneMatch) continue;
      }
      
      // Skip empty names
      if (!name) continue;
      
      suggestions.push({
        name: name,
        email: email,
        phone: phone,
        address: address
      });
    }
    
    Logger.log('📊 searchCustomersByCompanyId: Found ' + suggestions.length + ' matches for query "' + query + '"');
    return { success: true, suggestions: suggestions };
  } catch (error) {
    Logger.log('❌ Error in searchCustomersByCompanyId: ' + error.toString());
    return { success: false, suggestions: [], error: error.toString() };
  }
}

/**
 * Load all appointments from the sheet
 */
function loadAppointments() {
  try {
    const sheet = getOrCreateSheet(APPOINTMENTS_SHEET);
    const values = sheet.getDataRange().getValues();
    const appointments = [];
    
    if (values.length < 2) {
      return appointments;
    }
    
    const headers = values[0] || [];
    const emailCol = getApptCol(headers, 'Email', ['CustomerEmail']);
    const statusCol = getApptCol(headers, 'Status');
    
    for (let i = 1; i < values.length; i++) {
      const data = values[i];
      appointments.push({
        customerEmail: (data[emailCol] || '').toString().toLowerCase().trim(),
        status: statusCol !== -1 ? (data[statusCol] || '').toString() : ''
      });
    }
    return appointments;
  } catch (error) {
    Logger.log('Error loading appointments: ' + error);
    return [];
  }
}

/**
 * Get all appointments for a specific customer by email
 */
function getCustomerAppointments(customerEmail) {
  try {
    const sheet = getOrCreateSheet(APPOINTMENTS_SHEET);
    const values = sheet.getDataRange().getValues();
    const appointments = [];
    
    if (values.length < 2) {
      return { success: true, appointments: [] };
    }
    
    const headers = values[0] || [];
    const hasAppointmentType = headers.indexOf('AppointmentType') !== -1;
    const isNewStructure = hasAppointmentType;
    const hasLinkedProjectId = headers.indexOf('LinkedProjectID') !== -1;
    const colOpeningFormToken = headers.indexOf('OpeningFormToken');
    const colOpeningFormStatus = headers.indexOf('OpeningFormStatus');
    const colOpeningFormData = headers.indexOf('OpeningFormData');
    const colOpeningFormSubmittedAt = headers.indexOf('OpeningFormSubmittedAt');
    const colOpeningFormLastUpdatedAt = headers.indexOf('OpeningFormLastUpdatedAt');
    const colLinkedServiceReportId = headers.indexOf('LinkedServiceReportID');
    // Try both 'Customer Email' (with space) and 'CustomerEmail' (no space)
    let emailCol = headers.indexOf('Customer Email');
    if (emailCol === -1) {
      emailCol = headers.indexOf('CustomerEmail');
    }
    
    if (emailCol === -1) {
      return { success: false, error: 'Customer Email column not found. Available columns: ' + headers.join(', ') };
    }
    
    const customerEmailLower = customerEmail.toLowerCase().trim();
    
    // Helper to convert dates to strings
    function dateToString(val) {
      if (!val) return '';
      if (val instanceof Date) {
        return val.toISOString().split('T')[0];
      }
      return String(val);
    }
    
    // Helper to convert numbers safely
    function safeNumber(val) {
      if (val === null || val === undefined || val === '') return 0;
      const num = parseFloat(val);
      return isNaN(num) ? 0 : num;
    }
    
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const rowEmail = (row[emailCol] || '').toString().toLowerCase().trim();
      
      if (rowEmail === customerEmailLower) {
        let appt;
        if (isNewStructure) {
          appt = {
            id: String(row[0] || ''),
            companyId: String(row[1] || ''),
            customerId: String(row[2] || ''),
            customerName: String(row[3] || ''),
            customerEmail: String(row[4] || ''),
            customerPhone: String(row[5] || ''),
            address: String(row[6] || ''),
            serviceType: String(row[7] || ''),
            appointmentType: String(row[8] || 'Regular'),
            customAppointmentNote: String(row[9] || ''),
            date: dateToString(row[10]),
            time: formatSheetTime(row[11]),
            duration: safeNumber(row[12]),
            description: String(row[13] || ''),
            assignedTo: String(row[14] || ''),
            status: String(row[15] || 'Scheduled'),
            estimatedCost: safeNumber(row[16]),
            amountPaid: safeNumber(row[17]),
            notes: String(row[18] || ''),
            recurring: String(row[19] || ''),
            notifyCustomer: row[20] === 'Yes',
            notificationSent: row[21] === 'Yes',
            calendarEventId: String(row[22] || ''),
            reviewSent: row[23] === 'Yes',
            linkedInvoiceId: String(row[24] || ''),
            createdAt: dateToString(row[25]),
            updatedAt: dateToString(row[26]),
            linkedProjectId: hasLinkedProjectId ? String(row[27] || '') : '',
            openingFormToken: colOpeningFormToken >= 0 ? String(row[colOpeningFormToken] || '') : '',
            openingFormStatus: colOpeningFormStatus >= 0 ? String(row[colOpeningFormStatus] || '') : '',
            openingFormData: colOpeningFormData >= 0 ? String(row[colOpeningFormData] || '') : '',
            openingFormSubmittedAt: colOpeningFormSubmittedAt >= 0 ? dateToString(row[colOpeningFormSubmittedAt]) : '',
            openingFormLastUpdatedAt: colOpeningFormLastUpdatedAt >= 0 ? dateToString(row[colOpeningFormLastUpdatedAt]) : '',
            linkedServiceReportId: colLinkedServiceReportId >= 0 && row[colLinkedServiceReportId] !== undefined
              ? String(row[colLinkedServiceReportId] || '').trim()
              : ''
          };
        } else {
          appt = {
            id: String(row[0] || ''),
            companyId: String(row[1] || ''),
            customerId: String(row[2] || ''),
            customerName: String(row[3] || ''),
            customerEmail: String(row[4] || ''),
            customerPhone: String(row[5] || ''),
            address: String(row[6] || ''),
            serviceType: String(row[7] || ''),
            appointmentType: 'Regular',
            customAppointmentNote: '',
            date: dateToString(row[8]),
            time: formatSheetTime(row[9]),
            duration: safeNumber(row[10]),
            description: String(row[11] || ''),
            assignedTo: String(row[12] || ''),
            status: String(row[13] || 'Scheduled'),
            estimatedCost: safeNumber(row[14]),
            amountPaid: safeNumber(row[15]),
            notes: String(row[16] || ''),
            recurring: String(row[17] || ''),
            notifyCustomer: row[18] === 'Yes',
            notificationSent: row[19] === 'Yes',
            calendarEventId: String(row[20] || ''),
            reviewSent: row[21] === 'Yes',
            linkedInvoiceId: '',
            linkedProjectId: '',
            createdAt: dateToString(row[22]),
            updatedAt: dateToString(row[23]),
            openingFormToken: '',
            openingFormStatus: '',
            openingFormData: '',
            openingFormSubmittedAt: '',
            openingFormLastUpdatedAt: '',
            linkedServiceReportId: ''
          };
        }
        
            try {
      appt.closingOptions = (typeof headers !== 'undefined' && headers)
        ? parseClosingOptionsCell_(row[headers.indexOf('ClosingOptions')])
        : null;
    } catch (closeParseErr) {
      appt.closingOptions = null;
    }
    appointments.push(appt);
      }
    }
    
    // Sort by date descending (most recent first)
    appointments.sort(function(a, b) {
      const dateA = a.date ? new Date(a.date) : new Date(0);
      const dateB = b.date ? new Date(b.date) : new Date(0);
      return dateB - dateA;
    });
    
    return { success: true, appointments: appointments };
  } catch (error) {
    Logger.log('Error in getCustomerAppointments: ' + error);
    return { success: false, error: error.toString(), appointments: [] };
  }
}

// ===========================================================================
// POOL OPENING FORM (token-based, state from scheduling system)
// ===========================================================================
var OPENING_FORM_TOKEN_SECRET = 'AQualityPool-OpeningForm-2025';

/** Get state for customer from Customers sheet; normalize to TN or KY for pricing. */
function getStateForCustomerEmail(customerEmail) {
  if (!customerEmail || !customerEmail.toString().trim()) return '';
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CUSTOMERS_SHEET);
  if (!sheet) return '';
  const data = sheet.getDataRange().getValues();
  const emailLower = customerEmail.toString().toLowerCase().trim();
  for (let i = 1; i < data.length; i++) {
    const rowEmail = (data[i][CUST_COL.EMAIL] || '').toString().toLowerCase().trim();
    if (rowEmail === emailLower) {
      const state = (data[i][CUST_COL.STATE] || '').toString().trim().toUpperCase();
      if (state === 'TN' || state === 'TENNESSEE') return 'TN';
      if (state === 'KY' || state === 'KENTUCKY') return 'KY';
      return state || '';
    }
  }
  return '';
}

/** Generate a secure token for the opening form and write to the appointment row (new columns only). */
function generateOpeningFormToken(appointmentId) {
  const sheet = getOrCreateSheet(APPOINTMENTS_SHEET, getAppointmentsHeaders());
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || [];
  const colToken = headers.indexOf('OpeningFormToken');
  const colStatus = headers.indexOf('OpeningFormStatus');
  if (colToken === -1 || colStatus === -1) {
    return { success: false, error: 'Opening form columns not found' };
  }
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0] || '') === String(appointmentId)) {
      const serviceType = String(values[i][7] || '');
      if (serviceType.toLowerCase().indexOf('opening') === -1) {
        return { success: false, error: 'Appointment is not an Opening service' };
      }
      const customerEmail = String(values[i][4] || '');
      const state = getStateForCustomerEmail(customerEmail);
      const raw = appointmentId + '|' + customerEmail + '|' + (new Date().getTime()) + '|' + OPENING_FORM_TOKEN_SECRET;
      const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
      const token = digest.map(function(b) { return (b < 0 ? b + 256 : b).toString(16).padStart(2, '0'); }).join('');
      const row = i + 1;
      const tokenCell = sheet.getRange(row, colToken + 1);
      tokenCell.setValue(token);
      tokenCell.setNumberFormat('@');  // force text so long hex is not converted to number
      sheet.getRange(row, colStatus + 1).setValue('Not Complete');
      const formUrl = OPENING_FORM_PUBLIC_URL + '?token=' + encodeURIComponent(token);
      return { success: true, token: token, formUrl: formUrl, state: state };
    }
  }
  return { success: false, error: 'Appointment not found' };
}

/** Get or create the opening form link for an Opening appointment. */
function getOpeningFormLink(appointmentId) {
  const sheet = getOrCreateSheet(APPOINTMENTS_SHEET, getAppointmentsHeaders());
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || [];
  const colToken = headers.indexOf('OpeningFormToken');
  const colStatus = headers.indexOf('OpeningFormStatus');
  if (colToken === -1) {
    return { success: false, error: 'Opening form columns not found' };
  }
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0] || '') === String(appointmentId)) {
      let existingToken = String(values[i][colToken] || '').trim().replace(/\s+/g, '');
      if (existingToken) {
        const formUrl = OPENING_FORM_PUBLIC_URL + '?token=' + encodeURIComponent(existingToken);
        const status = String(values[i][colStatus] || '');
        const customerEmail = String(values[i][4] || '');
        const state = getStateForCustomerEmail(customerEmail);
        return { success: true, token: existingToken, formUrl: formUrl, status: status, state: state };
      }
      return generateOpeningFormToken(appointmentId);
    }
  }
  return { success: false, error: 'Appointment not found' };
}

/** Send Brooks a Telegram draft containing the pool opening form link so he can text the customer. */
function sendOpeningFormLinkToBrooks(appointmentId) {
  const linkResult = getOpeningFormLink(appointmentId);
  if (!linkResult || !linkResult.success || !linkResult.formUrl) {
    return { success: false, error: linkResult && linkResult.error ? linkResult.error : 'Could not get form link' };
  }
  const sheet = getOrCreateSheet(APPOINTMENTS_SHEET, getAppointmentsHeaders());
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || [];
  const dateCol = headers.indexOf('Date') >= 0 ? headers.indexOf('Date') : 10;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0] || '') === String(appointmentId)) {
      const row = values[i];
      const customerName = String(row[3] || '');
      const customerPhone = String(row[5] || '');
      const dateVal = row[dateCol];
      const dateStr = dateVal ? (dateVal instanceof Date ? dateVal.toLocaleDateString('en-US') : String(dateVal)) : '';
      const firstName = (customerName || 'there').split(' ')[0];
      const textMessage = 'Hi ' + firstName + '! Your pool opening is scheduled for ' + dateStr + '. Please choose your options here: ' + linkResult.formUrl + ' - A Quality Pool Company';
      const webAppUrl = ScriptApp.getService().getUrl();
      const cleanPhone = customerPhone ? String(customerPhone).replace(/\D/g, '') : '';
      const smsLink = cleanPhone
        ? (webAppUrl + '?action=sms&phone=' + cleanPhone + '&body=' + encodeURIComponent(textMessage) + '&name=' + encodeURIComponent(customerName || 'Customer'))
        : '';
      return sendBrooksTelegramDraft_(
        appointmentId,
        'opening_form_link_text',
        'Pool opening form link',
        [
          { label: 'Customer', value: customerName || 'Customer' },
          { label: 'Phone', value: customerPhone || 'N/A' },
          { label: 'Scheduled date', value: dateStr || 'Not set' },
          { label: 'Text shortcut', value: smsLink || 'No phone link available' }
        ],
        textMessage,
        'Opening form',
        linkResult.formUrl
      );
    }
  }
  return { success: false, error: 'Appointment not found' };
}

/** Load opening form data by token for customer form page. State is from scheduling system (Customers sheet). */
function getOpeningFormByToken(token) {
  if (!token || !String(token).trim()) {
    return { success: false, error: 'Invalid or expired link' };
  }
  const sheet = getOrCreateSheet(APPOINTMENTS_SHEET, getAppointmentsHeaders());
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || [];
  const colToken = headers.indexOf('OpeningFormToken');
  const colStatus = headers.indexOf('OpeningFormStatus');
  const colData = headers.indexOf('OpeningFormData');
  const colSuggestedDate = headers.indexOf('OpeningSuggestedDate');
  const colSuggestedTime = headers.indexOf('OpeningSuggestedTime');
  if (colToken === -1) {
    return { success: false, error: 'Invalid or expired link' };
  }
  const tokenStr = String(token).trim();
  function normalizeToken(s) {
    if (s == null || s === undefined) return '';
    return String(s).trim().replace(/\s+/g, '');
  }
  const tokenNorm = normalizeToken(tokenStr);
  for (let i = 1; i < values.length; i++) {
    const cellVal = normalizeToken(values[i][colToken]);
    if (cellVal === tokenNorm || cellVal === tokenStr) {
      const row = values[i];
      const customerEmail = String(row[4] || '');
      const state = getStateForCustomerEmail(customerEmail);
      let formData = null;
      const jsonStr = colData >= 0 ? String(row[colData] || '').trim() : '';
      if (jsonStr) {
        try {
          formData = JSON.parse(jsonStr);
        } catch (e) {}
      }
      const status = colStatus >= 0 ? String(row[colStatus] || '') : 'Not Complete';
      var dateStr = formatSheetDate(row[10]);
      var timeStr = formatSheetTime(row[11]);
      var displayDate = '';
      if (dateStr) {
        var d = new Date(dateStr + 'T12:00:00');
        if (!isNaN(d.getTime())) {
          displayDate = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        } else {
          displayDate = dateStr;
        }
      }
      var displayTime = timeStr;
      if (timeStr && /^\d{1,2}:\d{2}$/.test(timeStr)) {
        var parts = timeStr.split(':');
        var h = parseInt(parts[0], 10);
        var m = parts[1];
        displayTime = (h === 0 ? 12 : h > 12 ? h - 12 : h) + ':' + m + (h >= 12 ? ' PM' : ' AM');
      }
      var suggestedDate = colSuggestedDate >= 0 ? String(row[colSuggestedDate] || '').trim() : '';
      var suggestedTime = colSuggestedTime >= 0 ? formatSheetTime(row[colSuggestedTime]) : '';
      var suggestedDisplayDate = '';
      if (suggestedDate) {
        var sd = new Date(suggestedDate + 'T12:00:00');
        suggestedDisplayDate = !isNaN(sd.getTime()) ? sd.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : suggestedDate;
      }
      return {
        success: true,
        appointment: {
          id: String(row[0] || ''),
          customerName: String(row[3] || ''),
          customerEmail: customerEmail,
          address: String(row[6] || '').trim(),
          date: dateStr,
          time: timeStr,
          displayDate: displayDate,
          displayTime: displayTime
        },
        state: state,
        formData: formData,
        status: status,
        suggestedDate: suggestedDate,
        suggestedTime: suggestedTime,
        suggestedDisplayDate: suggestedDisplayDate
      };
    }
  }
  return { success: false, error: 'Invalid or expired link' };
}

/** Save opening form submission; update only new columns and email Brooks. */
function saveOpeningForm(token, formData) {
  if (!token || !String(token).trim()) {
    return { success: false, error: 'Invalid link' };
  }
  const sheet = getOrCreateSheet(APPOINTMENTS_SHEET, getAppointmentsHeaders());
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || [];
  const colToken = headers.indexOf('OpeningFormToken');
  const colStatus = headers.indexOf('OpeningFormStatus');
  const colData = headers.indexOf('OpeningFormData');
  const colSubmitted = headers.indexOf('OpeningFormSubmittedAt');
  const colUpdated = headers.indexOf('OpeningFormLastUpdatedAt');
  if (colToken === -1 || colStatus === -1 || colData === -1) {
    return { success: false, error: 'Sheet configuration error' };
  }
  const tokenStr = String(token).trim();
  function normalizeToken(s) {
    if (s == null || s === undefined) return '';
    return String(s).trim().replace(/\s+/g, '');
  }
  const tokenNorm = normalizeToken(tokenStr);
  const now = new Date().toISOString();
  for (let i = 1; i < values.length; i++) {
    const cellVal = normalizeToken(values[i][colToken]);
    if (cellVal === tokenNorm || cellVal === tokenStr) {
      const row = i + 1;
      const existingSubmitted = colSubmitted >= 0 ? String(values[i][colSubmitted] || '').trim() : '';
      const isFirstSubmission = !existingSubmitted;
      sheet.getRange(row, colData + 1).setValue(JSON.stringify(formData || {}));
      sheet.getRange(row, colStatus + 1).setValue('Complete');
      if (colSubmitted >= 0 && isFirstSubmission) {
        sheet.getRange(row, colSubmitted + 1).setValue(now);
      }
      if (colUpdated >= 0) {
        sheet.getRange(row, colUpdated + 1).setValue(now);
      }
      var customerName = String(values[i][3] || '');
      var customerEmail = String(values[i][4] || '');
      var apptDate = values[i][10];
      var dateStr = apptDate ? (apptDate instanceof Date ? apptDate.toLocaleDateString('en-US') : String(apptDate)) : '';
      var subject = isFirstSubmission
        ? ('Pool Opening form submitted – ' + customerName)
        : ('Pool Opening form updated – ' + customerName);
      var poolType = (formData && formData.poolType) ? formData.poolType : '';
      var price = poolType === 'KY' ? '$400' : (poolType === 'TN' ? '$250' : '');
      var body = '<p><strong>Customer:</strong> ' + customerName + '</p>'
        + '<p><strong>Email:</strong> ' + customerEmail + '</p>'
        + '<p><strong>Scheduled date:</strong> ' + dateStr + '</p>'
        + '<p><strong>Pool type:</strong> ' + (poolType || '—') + (price ? ' (' + price + ')' : '') + '</p>'
        + '<p><strong>Chemicals add-on ($50):</strong> ' + (formData && formData.chemicals ? 'Yes' : 'No') + '</p>'
        + '<p><strong>Full vacuum add-on ($200):</strong> ' + (formData && formData.fullVacuum ? 'Yes' : 'No') + '</p>'
        + (formData && formData.otherConcerns ? '<p><strong>Other concerns:</strong><br>' + String(formData.otherConcerns).replace(/\n/g, '<br>') + '</p>' : '')
        + '<p style="color:#6b7280;font-size:13px;">' + (isFirstSubmission ? 'First submission.' : 'Updated submission.') + '</p>';
      const telegramResult = sendBrooksTelegramDraft_(
        appointmentId,
        'opening_form_submission',
        isFirstSubmission ? 'Pool opening form submitted' : 'Pool opening form updated',
        [
          { label: 'Customer', value: customerName || 'Customer' },
          { label: 'Email', value: customerEmail || 'N/A' },
          { label: 'Scheduled date', value: dateStr || 'Not set' },
          { label: 'Pool type', value: (poolType || '—') + (price ? ' (' + price + ')' : '') },
          { label: 'Chemicals add-on', value: (formData && formData.chemicals ? 'Yes' : 'No') },
          { label: 'Full vacuum add-on', value: (formData && formData.fullVacuum ? 'Yes' : 'No') }
        ],
        formData && formData.otherConcerns ? ('Other concerns:\n' + formData.otherConcerns) : '',
        'Opening form',
        formUrl
      );
      if (!telegramResult.success) {
        Logger.log('Opening form Telegram failed: ' + telegramResult.error);
      }
      return { success: true };
    }
  }
  return { success: false, error: 'Invalid or expired link' };
}

// ===========================================================================
// OPENING SELF-SCHEDULE: availability, request, approve, suggest, resend
// ===========================================================================

/** Get available date/time slots for opening form (token). Uses Appointments + Calendar. */
function getOpeningAvailability(token, startDate, endDate) {
  if (!token || !String(token).trim()) {
    return { success: false, error: 'Invalid token' };
  }
  const sheet = getOrCreateSheet(APPOINTMENTS_SHEET, getAppointmentsHeaders());
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || [];
  const colToken = headers.indexOf('OpeningFormToken');
  if (colToken === -1) return { success: false, error: 'Sheet configuration error' };
  function norm(s) { return s == null ? '' : String(s).trim().replace(/\s+/g, ''); }
  const tokenNorm = norm(token);
  let companyId = '';
  for (let i = 1; i < values.length; i++) {
    if (norm(values[i][colToken]) === tokenNorm) {
      companyId = String(values[i][1] || '').trim();
      break;
    }
  }
  if (!companyId) return { success: false, error: 'Invalid or expired link' };

  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T23:59:59');
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { success: false, error: 'Invalid date range' };
  }

  // Busy blocks from Appointments (same company, status not Cancelled)
  const colDate = headers.indexOf('Date');
  const colTime = headers.indexOf('Time');
  const colDuration = headers.indexOf('Duration');
  const colCompany = headers.indexOf('CompanyID');
  const colStatus = headers.indexOf('Status');
  const busyMinutes = [];
  for (let i = 1; i < values.length; i++) {
    if (companyId && colCompany >= 0 && String(values[i][colCompany] || '') !== companyId) continue;
    const st = String(values[i][colStatus] || '').toLowerCase();
    if (st === 'cancelled') continue;
    const d = values[i][colDate];
    const dateStr = d ? (d instanceof Date ? (d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')) : String(d).split('T')[0]) : '';
    if (!dateStr || dateStr < startDate || dateStr > endDate) continue;
    const timeStr = formatSheetTime(values[i][colTime]) || '09:00';
    const dur = parseInt(values[i][colDuration], 10) || 60;
    const slotStart = new Date(dateStr + 'T' + timeStr).getTime();
    const slotEnd = slotStart + dur * 60 * 1000;
    busyMinutes.push({ start: slotStart, end: slotEnd });
  }

  // Busy blocks from Google Calendar
  try {
    const cal = CalendarApp.getCalendarById(CALENDAR_ID) || CalendarApp.getDefaultCalendar();
    const events = cal.getEvents(start, end);
    for (let j = 0; j < events.length; j++) {
      const ev = events[j];
      busyMinutes.push({ start: ev.getStartTime().getTime(), end: ev.getEndTime().getTime() });
    }
  } catch (e) {
    Logger.log('getOpeningAvailability calendar: ' + e.toString());
  }

  // Build slots: weekdays, 9:00, 12:00, 15:00 (duration 60)
  const slotTimes = ['09:00', '12:00', '15:00'];
  const durationMs = 60 * 60 * 1000;
  const slots = [];
  const d = new Date(start);
  while (d <= end) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) {
      const dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      for (let t = 0; t < slotTimes.length; t++) {
        const [hh, mm] = slotTimes[t].split(':').map(Number);
        const slotStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0).getTime();
        const slotEnd = slotStart + durationMs;
        let overlap = false;
        for (let b = 0; b < busyMinutes.length; b++) {
          if (slotStart < busyMinutes[b].end && slotEnd > busyMinutes[b].start) {
            overlap = true;
            break;
          }
        }
        if (!overlap) {
          slots.push({ date: dateStr, time: slotTimes[t] });
        }
      }
    }
    d.setDate(d.getDate() + 1);
  }
  return { success: true, slots: slots };
}

/** Customer submitted preferred slot — store as Pending, email customer + Brooks. */
function submitOpeningScheduleRequest(token, preferredDate, preferredTime) {
  if (!token || !String(token).trim() || !preferredDate || !preferredTime) {
    return { success: false, error: 'Invalid request' };
  }
  const sheet = getOrCreateSheet(APPOINTMENTS_SHEET, getAppointmentsHeaders());
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || [];
  const colToken = headers.indexOf('OpeningFormToken');
  const colReqDate = headers.indexOf('OpeningScheduleRequestDate');
  const colReqTime = headers.indexOf('OpeningScheduleRequestTime');
  const colReqStatus = headers.indexOf('OpeningScheduleRequestStatus');
  const colLastEmail = headers.indexOf('OpeningScheduleRequestLastEmailAt');
  if (colToken === -1 || colReqDate === -1 || colReqStatus === -1) {
    return { success: false, error: 'Sheet configuration error' };
  }
  function norm(s) { return s == null ? '' : String(s).trim().replace(/\s+/g, ''); }
  const tokenNorm = norm(token);
  const now = new Date().toISOString();
  for (let i = 1; i < values.length; i++) {
    if (norm(values[i][colToken]) !== tokenNorm) continue;
    const row = i + 1;
    const customerName = String(values[i][3] || '');
    const customerEmail = String(values[i][4] || '').trim();
    sheet.getRange(row, colReqDate + 1).setValue(preferredDate);
    if (colReqTime >= 0) sheet.getRange(row, colReqTime + 1).setValue(preferredTime);
    sheet.getRange(row, colReqStatus + 1).setValue('Pending');
    if (colLastEmail >= 0) sheet.getRange(row, colLastEmail + 1).setValue(now);

    // Customer email: waiting for approval
    if (customerEmail) {
      try {
        const firstName = (customerName || 'there').split(' ')[0];
        const msg = 'We received your pool opening date request for ' + preferredDate + ' at ' + preferredTime + '. It is waiting for company approval. You will receive an email when it\'s approved.';
        MailApp.sendEmail({
          to: customerEmail,
          subject: 'Pool Opening – Request Received (Awaiting Approval)',
          htmlBody: '<div style="font-family:Arial,sans-serif;max-width:560px;">' +
            '<p>Hello ' + firstName + ',</p>' +
            '<p>' + msg + '</p>' +
            '<p>— A Quality Pool Company</p></div>'
        });
      } catch (e) {
        Logger.log('submitOpeningScheduleRequest customer email: ' + e.toString());
      }
    }

    sendPendingOpeningEmailToBrooks(values[i][0]);
    return { success: true };
  }
  return { success: false, error: 'Invalid or expired link' };
}

/** Send pending opening request email to Brooks (Approve / Decline / Suggest other time). */
function sendPendingOpeningEmailToBrooks(appointmentId) {
  const sheet = getOrCreateSheet(APPOINTMENTS_SHEET, getAppointmentsHeaders());
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || [];
  const colReqDate = headers.indexOf('OpeningScheduleRequestDate');
  const colReqTime = headers.indexOf('OpeningScheduleRequestTime');
  const colLastEmail = headers.indexOf('OpeningScheduleRequestLastEmailAt');
  const colServiceType = headers.indexOf('ServiceType');
  const colDescription = headers.indexOf('Description');
  const colNotes = headers.indexOf('Notes');
  const colPreferredDay = headers.indexOf('PreferredServiceDay');
  const apptId = String(appointmentId || '');
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0] || '') !== apptId) continue;
    const row = values[i];
    const customerName = String(row[3] || '');
    const customerEmail = String(row[4] || '');
    const customerPhone = String(row[5] || '');
    const address = String(row[6] || '');
    const serviceType = colServiceType >= 0 ? String(row[colServiceType] || '') : '';
    const description = colDescription >= 0 ? String(row[colDescription] || '') : '';
    const notes = colNotes >= 0 ? String(row[colNotes] || '') : '';
    const reqDate = colReqDate >= 0 ? String(row[colReqDate] || '') : '';
    const reqTime = colReqTime >= 0 ? formatSheetTime(row[colReqTime]) : '';
    const preferredDay = colPreferredDay >= 0 ? String(row[colPreferredDay] || '').trim() : '';
    const rowNum = i + 1;
    const now = new Date().toISOString();
    const isEstimate = serviceType === 'Estimate/Quote';
    const isPoolService = serviceType === 'Pool Service';
    const heading = isEstimate ? 'Pending Estimate / Quote – Approval Needed' : (isPoolService ? 'Pending Weekly Service – Approval Needed' : 'Pending Schedule Request – Approval Needed');
    const subheading = isEstimate ? 'A customer has requested an estimate visit and is waiting for your approval.' : (isPoolService ? 'A customer has requested recurring pool service and is waiting for your approval.' : 'A customer has requested a date and is waiting for your approval.');
    var extraBlock = '';
    if (isEstimate && (description || notes)) {
      extraBlock = '<div style="background:#f8fafc;border:2px solid #e2e8f0;border-radius:10px;padding:16px;margin:16px 0;">' +
        '<p style="margin:0 0 8px 0;font-size:12px;font-weight:700;text-transform:uppercase;color:#64748b;">Estimate details</p>' +
        (description ? '<p style="margin:0 0 12px 0;font-size:14px;line-height:1.5;white-space:pre-wrap;">' + String(description).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>' : '') +
        (notes ? '<p style="margin:0;font-size:13px;color:#475569;">' + String(notes).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>' : '') +
        '</div>';
    } else if (serviceType === 'Pool Service' && (description || notes)) {
      extraBlock = '<div style="background:#f0f9ff;border:2px solid #bae6fd;border-radius:10px;padding:16px;margin:16px 0;">' +
        '<p style="margin:0 0 8px 0;font-size:12px;font-weight:700;text-transform:uppercase;color:#0369a1;">Pool service</p>' +
        (description ? '<p style="margin:0 0 8px 0;font-size:14px;">' + String(description).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>' : '') +
        (notes ? '<p style="margin:0;font-size:13px;color:#475569;">' + String(notes).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>' : '') +
        '</div>';
    }
    var dateTimeLine = isPoolService && preferredDay
      ? '<p><strong>Preferred service day:</strong> ' + preferredDay + '</p>'
      : '<p><strong>Requested date:</strong> ' + (reqDate || '—') + ' at ' + (reqTime || '—') + '</p>';
    const dashboardNote = '<p style="margin-top:20px;padding:14px;background:#fef3c7;border-left:4px solid #f59e0b;border-radius:6px;"><strong>Next step:</strong> Go to the <strong>Pending</strong> section of the appointments dashboard to approve or deny this request.</p>';
    const html = '<div style="font-family:Arial,sans-serif;max-width:600px;">' +
      '<div style="background:linear-gradient(135deg,#059669,#10b981);padding:20px;color:white;border-radius:12px 12px 0 0;">' +
      '<h2 style="margin:0;font-size:18px;">' + heading + '</h2>' +
      '<p style="margin:8px 0 0;opacity:0.95;">' + subheading + '</p></div>' +
      '<div style="padding:24px;border:1px solid #e5e7eb;border-top:none;">' +
      '<p><strong>Service:</strong> ' + (serviceType || '—') + '</p>' +
      '<p><strong>Customer:</strong> ' + (customerName || '—') + '</p>' +
      '<p><strong>Email:</strong> ' + (customerEmail || '—') + '</p>' +
      '<p><strong>Phone:</strong> ' + (customerPhone || '—') + '</p>' +
      '<p><strong>Address:</strong> ' + (address || '—') + '</p>' +
      dateTimeLine +
      extraBlock +
      dashboardNote +
      '</div></div>';
    const pendingResult = sendBrooksTelegramDraft_(
      apptId,
      'pending_opening_request',
      isEstimate ? 'Pending estimate request' : (isPoolService ? 'Pending weekly service request' : 'Pending request'),
      [
        { label: 'Customer', value: customerName || 'Customer' },
        { label: 'Email', value: customerEmail || 'N/A' },
        { label: 'Phone', value: customerPhone || 'N/A' },
        { label: 'Service', value: serviceType || 'N/A' },
        { label: 'Requested date/time', value: (reqDate || '') + (reqTime ? ' @ ' + reqTime : '') },
        { label: 'Preferred day', value: preferredDay || '' }
      ],
      notes || '',
      isEstimate ? 'Open estimate dashboard' : 'Open scheduling dashboard',
      companyDash
    );
    if (pendingResult.success) {
      if (colLastEmail >= 0) sheet.getRange(rowNum, colLastEmail + 1).setValue(now);
      return { success: true };
    }
    return { success: false, error: pendingResult.error || 'Telegram send failed' };
  }
  return { success: false, error: 'Appointment not found' };
}

/** List pending opening schedule requests for company. */
function getPendingOpeningScheduleRequests(companyId) {
  const result = getScheduledAppointments(companyId);
  if (!result.success || !result.appointments) return { success: true, requests: [] };
  const headers = getAppointmentsHeaders();
  const colReqDate = headers.indexOf('OpeningScheduleRequestDate');
  const colReqTime = headers.indexOf('OpeningScheduleRequestTime');
  const colReqStatus = headers.indexOf('OpeningScheduleRequestStatus');
  const colSuggestedDate = headers.indexOf('OpeningSuggestedDate');
  const colSuggestedTime = headers.indexOf('OpeningSuggestedTime');
  const requests = [];
  result.appointments.forEach(function(a) {
    const status = (a.openingScheduleRequestStatus || '').toString().trim();
    if (status !== 'Pending') return;
    requests.push({
      appointmentId: a.id,
      serviceType: a.serviceType || '',
      preferredServiceDay: (a.preferredServiceDay || '').toString().trim(),
      customerName: a.customerName,
      customerEmail: a.customerEmail,
      customerPhone: a.customerPhone,
      address: a.address,
      requestedDate: a.openingScheduleRequestDate || '',
      requestedTime: a.openingScheduleRequestTime || '',
      suggestedDate: colSuggestedDate >= 0 ? (a.openingSuggestedDate || '') : '',
      suggestedTime: colSuggestedTime >= 0 ? (a.openingSuggestedTime || '') : ''
    });
  });
  return { success: true, requests: requests };
}

/** Approve pending opening request and create calendar event(s). */
function approveOpeningScheduleRequest(appointmentId, options) {
  options = (options && typeof options === 'object') ? options : {};
  const sheet = getOrCreateSheet(APPOINTMENTS_SHEET, getAppointmentsHeaders());
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || [];
  const colReqDate = headers.indexOf('OpeningScheduleRequestDate');
  const colReqTime = headers.indexOf('OpeningScheduleRequestTime');
  const colReqStatus = headers.indexOf('OpeningScheduleRequestStatus');
  const colDate = headers.indexOf('Date');
  const colTime = headers.indexOf('Time');
  const colServiceType = headers.indexOf('ServiceType');
  const colPreferredDay = headers.indexOf('PreferredServiceDay');
  const colRecurring = headers.indexOf('Recurring');
  const colDescription = headers.indexOf('Description');
  const colStatus = headers.indexOf('Status');
  const colDuration = headers.indexOf('Duration');
  const colCal = headers.indexOf('CalendarEventID');
  const colNotes = headers.indexOf('Notes');
  const colCost = headers.indexOf('EstimatedCost');
  if (colReqStatus === -1) return { success: false, error: 'Sheet configuration error' };
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0] || '') !== String(appointmentId)) continue;
    const row = i + 1;
    const serviceType = colServiceType >= 0 ? String(values[i][colServiceType] || '') : '';
    const isPoolService = serviceType === 'Pool Service';
    const reqDate = colReqDate >= 0 ? String(values[i][colReqDate] || '').trim() : '';
    const reqTime = colReqTime >= 0 ? (formatSheetTime(values[i][colReqTime]) || '09:00') : '09:00';
    const preferredDay = colPreferredDay >= 0 ? String(values[i][colPreferredDay] || '').trim() : '';
    const optDate = options.firstServiceDate ? String(options.firstServiceDate).trim() : '';
    const optTime = options.firstServiceTime ? String(options.firstServiceTime).trim() : '';
    const needsFullOpening = options.needsFullOpening === true || options.includeFullOpening === true;
    const openingSameVisit = options.openingSameVisit !== false;
    const optOpeningDate = options.openingDate ? String(options.openingDate).trim() : '';
    const optOpeningTime = options.openingTime ? String(options.openingTime).trim() : '';
    const approvedDate = optDate || reqDate;
    const approvedTime = optTime || reqTime || '09:00';
    const openingDate = needsFullOpening ? (openingSameVisit ? approvedDate : optOpeningDate) : '';
    const openingTime = needsFullOpening ? (openingSameVisit ? approvedTime : (optOpeningTime || '09:00')) : '';

    if (!approvedDate) {
      return {
        success: false,
        error: isPoolService ? 'First service date is required for weekly service approval.' : 'No requested date'
      };
    }
    if (isPoolService && needsFullOpening && !openingDate) {
      return { success: false, error: 'Opening date is required when full opening is scheduled separately.' };
    }

    const recurringRaw = colRecurring >= 0 ? String(values[i][colRecurring] || '').toLowerCase().trim() : '';
    const recurring = (recurringRaw === 'weekly' || recurringRaw === 'biweekly' || recurringRaw === 'monthly')
      ? recurringRaw
      : (isPoolService ? 'weekly' : 'none');

    const existingDesc = colDescription >= 0 ? String(values[i][colDescription] || '') : '';
    const existingNotes = colNotes >= 0 ? String(values[i][colNotes] || '') : '';
    const openingPlanNote = needsFullOpening
      ? (openingSameVisit
        ? 'Full opening requested as extra service on first weekly visit.'
        : ('Full opening requested as extra service on ' + openingDate + ' at ' + openingTime + '.'))
      : '';
    const updatedDesc = existingDesc;
    const updatedNotes = openingPlanNote && existingNotes.indexOf(openingPlanNote) === -1
      ? (existingNotes ? (existingNotes + ' | ' + openingPlanNote) : openingPlanNote)
      : existingNotes;

    if (colReqStatus >= 0) sheet.getRange(row, colReqStatus + 1).setValue('Approved');
    if (colDate >= 0) sheet.getRange(row, colDate + 1).setValue(approvedDate);
    if (colTime >= 0) sheet.getRange(row, colTime + 1).setValue(approvedTime);
    if (colStatus >= 0 && isPoolService) sheet.getRange(row, colStatus + 1).setValue('Scheduled');
    if (colRecurring >= 0 && isPoolService) sheet.getRange(row, colRecurring + 1).setValue(recurring);
    if (colDescription >= 0) sheet.getRange(row, colDescription + 1).setValue(updatedDesc);
    if (colNotes >= 0) sheet.getRange(row, colNotes + 1).setValue(updatedNotes);

    const data = {
      id: values[i][0],
      companyId: values[i][1],
      customerId: values[i][2],
      customerName: values[i][3],
      customerEmail: values[i][4],
      customerPhone: values[i][5],
      address: values[i][6],
      serviceType: values[i][7],
      date: approvedDate,
      time: approvedTime,
      duration: parseInt(colDuration >= 0 ? values[i][colDuration] : values[i][12], 10) || 60,
      description: updatedDesc,
      assignedTo: values[i][14],
      estimatedCost: parseFloat(colCost >= 0 ? values[i][colCost] : 0) || 0,
      notes: updatedNotes,
      recurring: recurring,
      status: 'Scheduled'
    };
    let calendarAdded = false;
    try {
      const calId = addToGoogleCalendar(data);
      if (colCal >= 0) sheet.getRange(row, colCal + 1).setValue(calId);
      calendarAdded = !!calId;
    } catch (e) {
      Logger.log('approveOpeningScheduleRequest calendar: ' + e.toString());
    }

    let recurringCreated = 0;
    if (isPoolService && (recurring === 'weekly' || recurring === 'biweekly' || recurring === 'monthly')) {
      const baseNotesForRecurring = existingNotes;
      try {
        createRecurringAppointments({
          ...data,
          notes: baseNotesForRecurring,
          recurring: recurring
        });
        recurringCreated = recurring === 'weekly' ? 12 : recurring === 'biweekly' ? 6 : 3;
      } catch (recErr) {
        Logger.log('approveOpeningScheduleRequest recurring: ' + recErr.toString());
      }
    }

    if (isPoolService) {
      let openingCreated = false;
      let openingCalendarAdded = false;
      let openingAppointmentId = '';
      if (needsFullOpening) {
        try {
          const openingRes = createAppointment({
            companyId: data.companyId || 'CMP-AQUALITYPOOL',
            customerId: data.customerId || '',
            customerName: data.customerName,
            customerEmail: data.customerEmail,
            customerPhone: data.customerPhone,
            address: data.address,
            serviceType: 'Opening',
            appointmentType: 'Regular',
            date: openingDate,
            time: openingTime,
            duration: 120,
            description: 'Full pool opening (additional service)',
            assignedTo: data.assignedTo || '',
            status: 'Scheduled',
            estimatedCost: 0,
            notes: 'Scheduled from weekly approval ' + appointmentId + (openingSameVisit ? ' | Same visit as first weekly service' : ' | Separate opening appointment'),
            recurring: 'none',
            addToCalendar: true,
            notifyCustomer: true
          });
          openingCreated = !!(openingRes && openingRes.success);
          openingCalendarAdded = !!(openingRes && openingRes.calendarEventId);
          openingAppointmentId = openingRes && openingRes.appointmentId ? String(openingRes.appointmentId) : '';
        } catch (openErr) {
          Logger.log('approveOpeningScheduleRequest opening appt: ' + openErr.toString());
        }
      }
      try {
        sendWeeklyServiceApprovedEmail(values[i][4], values[i][3], preferredDay, approvedDate, {
          scheduled: needsFullOpening && openingCreated,
          sameVisit: openingSameVisit,
          date: openingDate,
          time: openingTime
        });
      } catch (e) {
        Logger.log('approveOpeningScheduleRequest weekly email: ' + e.toString());
      }
      schedulingCreateFollowUpPmTask_(
        String(values[i][1] || 'CMP-AQUALITYPOOL'),
        String(values[i][0] || appointmentId),
        String(values[i][3] || ''),
        String(values[i][4] || ''),
        approvedDate
      );
      
      return {
        success: true,
        calendarAdded: calendarAdded,
        recurringCreated: recurringCreated,
        firstServiceDate: approvedDate,
        openingCreated: openingCreated,
        openingCalendarAdded: openingCalendarAdded,
        openingSameVisit: openingSameVisit,
        openingAppointmentId: openingAppointmentId
      };
    } else {
      sendAppointmentNotification(data, 'new');
      sendAppointmentConfirmationText(appointmentId);
    }

    schedulingCreateFollowUpPmTask_(
      String(values[i][1] || 'CMP-AQUALITYPOOL'),
      String(values[i][0] || appointmentId),
      String(values[i][3] || ''),
      String(values[i][4] || ''),
      approvedDate
    );
    return { success: true, calendarAdded: calendarAdded, recurringCreated: recurringCreated, firstServiceDate: approvedDate };
  }
  return { success: false, error: 'Appointment not found' };
}

/** Email customer when their weekly service request is approved — includes first service details. */
function sendWeeklyServiceApprovedEmail(customerEmail, customerName, preferredDay, firstServiceDate, fullOpeningOption) {
  if (!customerEmail) return;
  const firstName = (customerName || 'there').split(' ')[0];
  const firstServiceDateDisplay = firstServiceDate ? formatDisplayDate(firstServiceDate) : '';
  const openingInfo = (fullOpeningOption && typeof fullOpeningOption === 'object')
    ? fullOpeningOption
    : (fullOpeningOption === true ? { scheduled: true, sameVisit: true, date: firstServiceDate, time: '' } : null);
  const openingDateDisplay = openingInfo && openingInfo.date ? formatDisplayDate(openingInfo.date) : '';
  const logoUrl = 'https://cdn.prod.website-files.com/6931dc4e8e97334e195432df/6993ce0abcd54d3520799318_IMG_1763.jpg';
  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<style>body{margin:0;padding:0;background:#f5f7fa;}table{border-collapse:collapse;}img{border:0;height:auto;line-height:100%;}</style>'
    + '</head><body style="background:#f5f7fa;margin:0;padding:0;">'
    + '<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f7fa;"><tr><td align="center" style="padding:40px 20px;">'
    + '<table border="0" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;">'
    // Header
    + '<tr><td align="center" style="background:linear-gradient(135deg,#0c4a6e 0%,#0369a1 100%);padding:36px 24px;text-align:center;">'
    + '<img src="' + logoUrl + '" alt="A Quality Pool Company" style="max-width:160px;height:auto;display:block;margin:0 auto 16px auto;border-radius:8px;">'
    + '<h1 style="color:#ffffff;margin:0 0 6px 0;font-size:26px;font-weight:800;line-height:1.2;">Service Request Approved!</h1>'
    + '<p style="color:#bae6fd;margin:0;font-size:14px;">Weekly Pool Service – A Quality Pool Company</p>'
    + '</td></tr>'
    // Body
    + '<tr><td style="padding:36px 28px;">'
    + '<h2 style="font-size:18px;font-weight:700;color:#0f172a;margin:0 0 14px 0;">Hello ' + firstName + ',</h2>'
    + '<p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 24px 0;">Great news — your recurring pool service request has been <strong>approved</strong>! We\'re excited to keep your pool in perfect shape all season long.</p>'
    // Detail box
    + '<div style="background:#f0f9ff;border-left:4px solid #0284c7;border-radius:0 8px 8px 0;padding:20px 24px;margin:0 0 24px 0;">'
    + '<p style="margin:0 0 6px 0;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#0369a1;">Your Service Details</p>'
    + '<table border="0" cellpadding="0" cellspacing="0" width="100%">'
    + '<tr><td style="padding:7px 0;color:#64748b;font-size:14px;width:140px;vertical-align:top;">Service:</td><td style="padding:7px 0;font-weight:700;color:#0f172a;font-size:15px;">Weekly Pool Service</td></tr>'
    + (preferredDay ? '<tr><td style="padding:7px 0;color:#64748b;font-size:14px;vertical-align:top;">Preferred Day:</td><td style="padding:7px 0;font-weight:700;color:#0f172a;font-size:15px;">' + preferredDay + '</td></tr>' : '')
    + (firstServiceDateDisplay ? '<tr><td style="padding:7px 0;color:#64748b;font-size:14px;vertical-align:top;">First Service Date:</td><td style="padding:7px 0;font-weight:700;color:#0f172a;font-size:15px;">' + firstServiceDateDisplay + '</td></tr>' : '')
    + (openingInfo && openingInfo.scheduled
      ? '<tr><td style="padding:7px 0;color:#64748b;font-size:14px;vertical-align:top;">Full Opening (Extra):</td><td style="padding:7px 0;font-weight:700;color:#0f172a;font-size:15px;">'
        + (openingInfo.sameVisit ? 'Same visit as weekly service' : ('Scheduled for ' + (openingDateDisplay || openingInfo.date || '') + (openingInfo.time ? ' at ' + openingInfo.time : '')))
        + '</td></tr>'
      : '')
    + '</table></div>'
    // Next steps
    + '<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:20px 24px;margin:0 0 24px 0;">'
    + '<p style="margin:0 0 10px 0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#166534;">Next Steps</p>'
    + '<table border="0" cellpadding="0" cellspacing="0" width="100%">'
    + '<tr><td style="padding:6px 0;vertical-align:top;width:28px;font-size:15px;">✅</td><td style="padding:6px 0;font-size:14px;color:#166534;line-height:1.6;">You will receive a link to sign your <strong>weekly service agreement</strong>.</td></tr>'
    + '<tr><td style="padding:6px 0;vertical-align:top;font-size:15px;">✅</td><td style="padding:6px 0;font-size:14px;color:#166534;line-height:1.6;">You\'ll be set up on <strong>autopay</strong> through Stripe for seamless, hassle-free billing.</td></tr>'
    + '</table></div>'
    + '<p style="font-size:14px;color:#64748b;line-height:1.6;margin:0;">We\'ll be in touch shortly with those links. Questions? Reply to this email or reach us at <a href="mailto:samr@aqualitypoolcompanyusa.com" style="color:#0284c7;text-decoration:none;font-weight:600;">samr@aqualitypoolcompanyusa.com</a>.</p>'
    + '</td></tr>'
    // Footer
    + '<tr><td style="background:#f8fafc;padding:24px;text-align:center;border-top:1px solid #e2e8f0;">'
    + '<p style="font-size:13px;color:#64748b;margin:4px 0;font-weight:700;">A Quality Pool Company</p>'
    + '<p style="font-size:13px;color:#9ca3af;margin:4px 0;">samr@aqualitypoolcompanyusa.com | (502) 706-9172</p>'
    + '</td></tr>'
    + '</table></td></tr></table></body></html>';
  MailApp.sendEmail({
    to: String(customerEmail).trim(),
    subject: 'Your Pool Service Request Has Been Approved – A Quality Pool Company',
    htmlBody: html
  });
}

function formatDisplayDate(dateStr) {
  try {
    if (!dateStr) return '';
    const dt = new Date(String(dateStr) + 'T12:00:00');
    if (isNaN(dt.getTime())) return dateStr;
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (e) {
    return dateStr || '';
  }
}

/** Reject pending opening request. */
function rejectOpeningScheduleRequest(appointmentId) {
  const sheet = getOrCreateSheet(APPOINTMENTS_SHEET, getAppointmentsHeaders());
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || [];
  const colReqStatus = headers.indexOf('OpeningScheduleRequestStatus');
  if (colReqStatus === -1) return { success: false, error: 'Sheet configuration error' };
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0] || '') !== String(appointmentId)) continue;
    sheet.getRange(i + 1, colReqStatus + 1).setValue('Rejected');
    return { success: true };
  }
  return { success: false, error: 'Appointment not found' };
}

/** Suggest another time; email customer with link to accept. */
function suggestOpeningTime(appointmentId, suggestedDate, suggestedTime) {
  if (!suggestedDate || !suggestedTime) return { success: false, error: 'Date and time required' };
  const sheet = getOrCreateSheet(APPOINTMENTS_SHEET, getAppointmentsHeaders());
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || [];
  const colToken = headers.indexOf('OpeningFormToken');
  const colSuggestedDate = headers.indexOf('OpeningSuggestedDate');
  const colSuggestedTime = headers.indexOf('OpeningSuggestedTime');
  if (colToken === -1 || colSuggestedDate === -1) return { success: false, error: 'Sheet configuration error' };
  const apptId = String(appointmentId || '');
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0] || '') !== apptId) continue;
    const row = i + 1;
    const token = String(values[i][colToken] || '').trim();
    if (!token) return { success: false, error: 'No form token for this appointment' };
    sheet.getRange(row, colSuggestedDate + 1).setValue(suggestedDate);
    if (colSuggestedTime >= 0) sheet.getRange(row, colSuggestedTime + 1).setValue(suggestedTime);
    const customerName = String(values[i][3] || '');
    const customerEmail = String(values[i][4] || '').trim();
    const acceptUrl = ScriptApp.getService().getUrl() + '?token=' + encodeURIComponent(token) + '&acceptSuggested=1';
    const displayDate = (function() {
      const d = new Date(suggestedDate + 'T12:00:00');
      return isNaN(d.getTime()) ? suggestedDate : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    })();
    const displayTime = suggestedTime;
    if (customerEmail) {
      try {
        const firstName = (customerName || 'there').split(' ')[0];
        MailApp.sendEmail({
          to: customerEmail,
          subject: 'Pool Opening – Suggested Time – A Quality Pool Company',
          htmlBody: '<div style="font-family:Arial,sans-serif;max-width:560px;">' +
            '<p>Hello ' + firstName + ',</p>' +
            '<p>We suggest the following time for your pool opening: <strong>' + displayDate + ' at ' + displayTime + '</strong>.</p>' +
            '<p><a href="' + acceptUrl + '" style="display:inline-block;background:#10b981;color:white;padding:14px 24px;border-radius:10px;text-decoration:none;font-weight:700;">Accept this appointment</a></p>' +
            '<p>— A Quality Pool Company</p></div>'
        });
      } catch (e) {
        Logger.log('suggestOpeningTime email: ' + e.toString());
        return { success: false, error: e.toString() };
      }
    }
    return { success: true };
  }
  return { success: false, error: 'Appointment not found' };
}

/** Customer accepted suggested slot — set date/time, calendar, notify, send Brooks text. */
function acceptSuggestedOpeningSlot(token) {
  if (!token || !String(token).trim()) return { success: false, error: 'Invalid link' };
  const sheet = getOrCreateSheet(APPOINTMENTS_SHEET, getAppointmentsHeaders());
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || [];
  const colToken = headers.indexOf('OpeningFormToken');
  const colSuggestedDate = headers.indexOf('OpeningSuggestedDate');
  const colSuggestedTime = headers.indexOf('OpeningSuggestedTime');
  const colReqStatus = headers.indexOf('OpeningScheduleRequestStatus');
  const colDate = headers.indexOf('Date');
  const colTime = headers.indexOf('Time');
  const colCal = headers.indexOf('CalendarEventID');
  function norm(s) { return s == null ? '' : String(s).trim().replace(/\s+/g, ''); }
  const tokenNorm = norm(token);
  for (let i = 1; i < values.length; i++) {
    if (norm(values[i][colToken]) !== tokenNorm) continue;
    const suggestedDate = String(values[i][colSuggestedDate] || '').trim();
    const suggestedTime = colSuggestedTime >= 0 ? formatSheetTime(values[i][colSuggestedTime]) : '09:00';
    if (!suggestedDate) return { success: false, error: 'No suggested time' };
    const row = i + 1;
    sheet.getRange(row, colDate + 1).setValue(suggestedDate);
    if (colTime >= 0) sheet.getRange(row, colTime + 1).setValue(suggestedTime);
    if (colReqStatus >= 0) sheet.getRange(row, colReqStatus + 1).setValue('Approved');
    sheet.getRange(row, colSuggestedDate + 1).setValue('');
    if (colSuggestedTime >= 0) sheet.getRange(row, colSuggestedTime + 1).setValue('');
    const data = {
      id: values[i][0],
      companyId: values[i][1],
      customerId: values[i][2],
      customerName: values[i][3],
      customerEmail: values[i][4],
      customerPhone: values[i][5],
      address: values[i][6],
      serviceType: values[i][7],
      date: suggestedDate,
      time: suggestedTime,
      duration: parseInt(values[i][12], 10) || 60,
      description: values[i][13],
      assignedTo: values[i][14],
      status: 'Scheduled',
      address: values[i][6]
    };
    try {
      const calId = addToGoogleCalendar(data);
      if (colCal >= 0) sheet.getRange(row, colCal + 1).setValue(calId);
    } catch (e) {
      Logger.log('acceptSuggestedOpeningSlot calendar: ' + e.toString());
    }
    sendAppointmentNotification(data, 'new');
    sendAppointmentConfirmationText(data.id);
    return { success: true };
  }
  return { success: false, error: 'Invalid or expired link' };
}

/** Resend pending opening emails to Brooks every 6 hours. Run via time-driven trigger. */
function resendPendingOpeningEmailsEvery6Hours() {
  const sheet = getOrCreateSheet(APPOINTMENTS_SHEET, getAppointmentsHeaders());
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || [];
  const colReqStatus = headers.indexOf('OpeningScheduleRequestStatus');
  const colLastEmail = headers.indexOf('OpeningScheduleRequestLastEmailAt');
  if (colReqStatus === -1 || colLastEmail === -1) return { sent: 0 };
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  let sent = 0;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][colReqStatus] || '').trim() !== 'Pending') continue;
    const lastEmail = String(values[i][colLastEmail] || '').trim();
    if (lastEmail && lastEmail > sixHoursAgo) continue;
    const apptId = values[i][0];
    const result = sendPendingOpeningEmailToBrooks(apptId);
    if (result && result.success) sent++;
  }
  return { sent: sent };
}

// ===========================================================================
// PUBLIC CUSTOMER SELF-SCHEDULE (website link: ?page=schedule)
// ===========================================================================

/** Look up customer by email for "Is this you?" on public schedule form. */
function lookupCustomerByEmail(email) {
  if (!email || !String(email).trim()) return { success: true, found: false };
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CUSTOMERS_SHEET);
  if (!sheet) return { success: true, found: false };
  const values = sheet.getDataRange().getValues();
  const emailLower = String(email).toLowerCase().trim();
  const companyId = getSchedulingSettings_().defaultCompanyId || DEFAULT_COMPANY_ID;
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (String(row[CUST_COL.COMPANY] || '') !== companyId) continue;
    const rowEmail = (row[CUST_COL.EMAIL] || '').toString().toLowerCase().trim();
    if (rowEmail !== emailLower) continue;
    const address = String(row[CUST_COL.ADDRESS] || '').trim();
    return {
      success: true,
      found: true,
      customer: {
        id: String(row[CUST_COL.EMAIL] || ''),
        name: String(row[CUST_COL.NAME] || ''),
        email: String(row[CUST_COL.EMAIL] || ''),
        phone: String(row[CUST_COL.PHONE] || ''),
        address: address,
        city: String(row[CUST_COL.CITY] || ''),
        state: String(row[CUST_COL.STATE] || ''),
        zip: String(row[CUST_COL.ZIP] || '')
      }
    };
  }
  return { success: true, found: false };
}

/** Return set of blocked date strings (YYYY-MM-DD) from BlockedDates sheet. Add dates there to block company-wide. */
function getBlockedDateSet(companyId) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(BLOCKED_DATES_SHEET);
  const out = {};
  if (!sheet) return out;
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return out;
  const headers = data[0] || [];
  const colDate = headers.indexOf('Date');
  const colCompany = headers.indexOf('CompanyID');
  if (colDate === -1) return out;
  for (let i = 1; i < data.length; i++) {
    const rowCompany = (data[i][colCompany] || '').toString();
    if (companyId && colCompany >= 0 && rowCompany !== companyId) continue;
    const d = data[i][colDate];
    const dateStr = d ? (d instanceof Date ? (d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')) : String(d).split('T')[0]) : '';
    if (dateStr) out[dateStr] = true;
  }
  return out;
}

/** Get available slots for public schedule (any service type). Uses default company. Excludes BlockedDates. */
function getPublicAvailability(serviceType, startDate, endDate) {
  const companyId = 'CMP-AQUALITYPOOL';
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T23:59:59');
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { success: false, error: 'Invalid date range' };
  }
  const blockedSet = getBlockedDateSet(companyId);
  const sheet = getOrCreateSheet(APPOINTMENTS_SHEET, getAppointmentsHeaders());
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || [];
  const colDate = headers.indexOf('Date');
  const colTime = headers.indexOf('Time');
  const colDuration = headers.indexOf('Duration');
  const colCompany = headers.indexOf('CompanyID');
  const colStatus = headers.indexOf('Status');
  const busyMinutes = [];
  for (let i = 1; i < values.length; i++) {
    if (colCompany >= 0 && String(values[i][colCompany] || '') !== companyId) continue;
    const st = String(values[i][colStatus] || '').toLowerCase();
    if (st === 'cancelled') continue;
    const d = values[i][colDate];
    const dateStr = d ? (d instanceof Date ? (d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')) : String(d).split('T')[0]) : '';
    if (!dateStr || dateStr < startDate || dateStr > endDate) continue;
    const timeStr = formatSheetTime(values[i][colTime]) || '09:00';
    const dur = parseInt(values[i][colDuration], 10) || 60;
    const slotStart = new Date(dateStr + 'T' + timeStr).getTime();
    const slotEnd = slotStart + dur * 60 * 1000;
    busyMinutes.push({ start: slotStart, end: slotEnd });
  }
  try {
    const cal = CalendarApp.getCalendarById(CALENDAR_ID) || CalendarApp.getDefaultCalendar();
    const events = cal.getEvents(start, end);
    for (let j = 0; j < events.length; j++) {
      const ev = events[j];
      busyMinutes.push({ start: ev.getStartTime().getTime(), end: ev.getEndTime().getTime() });
    }
  } catch (e) {
    Logger.log('getPublicAvailability calendar: ' + e.toString());
  }
  const slotTimes = ['09:00', '12:00', '15:00'];
  const durationMs = 60 * 60 * 1000;
  const slots = [];
  const d = new Date(start);
  while (d <= end) {
    const dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (blockedSet[dateStr]) { d.setDate(d.getDate() + 1); continue; }
    const day = d.getDay();
    if (day !== 0 && day !== 6) {
      for (let t = 0; t < slotTimes.length; t++) {
        const [hh, mm] = slotTimes[t].split(':').map(Number);
        const slotStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0).getTime();
        const slotEnd = slotStart + durationMs;
        let overlap = false;
        for (let b = 0; b < busyMinutes.length; b++) {
          if (slotStart < busyMinutes[b].end && slotEnd > busyMinutes[b].start) {
            overlap = true;
            break;
          }
        }
        if (!overlap) slots.push({ date: dateStr, time: slotTimes[t] });
      }
    }
    d.setDate(d.getDate() + 1);
  }
  return { success: true, slots: slots };
}

/** Submit a public schedule request (all go to pending approval). Creates appt + sends emails. */
function submitPublicScheduleRequest(data) {
  if (!data || !data.serviceType || !data.name || !data.email) {
    return { success: false, error: 'Service type, name, and email are required' };
  }
  const sheet = getOrCreateSheet(APPOINTMENTS_SHEET, getAppointmentsHeaders());
  const companyId = data.companyId || 'CMP-AQUALITYPOOL';
  let customerId = data.customerId || null;
  if (!customerId) {
    customerId = createOrFindCustomer({
      companyId: companyId,
      name: data.name,
      email: data.email,
      phone: data.phone || '',
      address: data.address || ''
    });
  }
  const now = new Date().toISOString();
  const apptId = 'APPT-' + Date.now();
  const appointmentType = (data.serviceType === 'Estimate/Quote' || data.appointmentType === 'Estimate/Quote') ? 'Estimate/Quote' : 'Regular';
  const openingFormDataStr = data.openingFormData && typeof data.openingFormData === 'object' ? JSON.stringify(data.openingFormData) : '';
  var description = data.description || '';
  var notes = data.notes || '';
  var estimatedCost = 0;
  if (data.serviceType === 'Pool Service' && data.poolServiceFrequency) {
    var freqLabel = data.poolServiceFrequency === 'weekly' ? 'Weekly' : (data.poolServiceFrequency === 'biweekly' ? 'Biweekly' : 'One-time');
    var price = (data.servicePrice != null && data.servicePrice !== '') ? Number(data.servicePrice) : (data.poolServiceFrequency === 'weekly' ? 160 : (data.poolServiceFrequency === 'biweekly' ? 200 : 275));
    estimatedCost = price;
    description = freqLabel + ' pool cleaning — $' + price + ' per visit';
    if (notes) notes = notes + ' | ';
    notes = notes + 'Frequency: ' + freqLabel + ' | Price: $' + price;
    if (data.preferredServiceDay) notes = notes + ' | Preferred day: ' + String(data.preferredServiceDay);
  }
  if (data.estimateDetails && typeof data.estimateDetails === 'object') {
    var ed = data.estimateDetails;
    description = (ed.estimateType || 'Estimate request') + (ed.projectDescription ? '\n\nProject: ' + String(ed.projectDescription) : '');
    notes = 'Contact: ' + (ed.contactMethod || '') + ' | Best time: ' + (ed.bestTime || '') + ' | Timeline: ' + (ed.timeline || '');
  }
  const preferredDay = (data.serviceType === 'Pool Service' && data.preferredServiceDay) ? String(data.preferredServiceDay) : '';
  const recurringValue = (data.serviceType === 'Pool Service' && data.poolServiceFrequency)
    ? String(data.poolServiceFrequency).toLowerCase()
    : 'none';
  const row = [
    apptId, companyId, customerId || '', data.name, data.email,
    data.phone || '', data.address || '', data.serviceType, appointmentType, '',
    '', '', 60, description, '', 'Pending', estimatedCost, 0, notes, recurringValue, 'No', 'No',
    '', 'No', '', now, now, '',
    '', openingFormDataStr ? 'Complete' : '', openingFormDataStr, '', '',
    data.requestedDate || '', data.requestedTime || '', 'Pending', now,
    '', '', preferredDay
  ];
  sheet.appendRow(row);
  const customerName = data.name;
  const customerEmail = data.email.trim();
  if (customerEmail) {
    try {
      const firstName = (customerName || 'there').split(' ')[0];
      const isEstimate = data.serviceType === 'Estimate/Quote';
      const isPoolService = data.serviceType === 'Pool Service';
      var msg;
      if (isEstimate) {
        msg = 'We received your estimate request for ' + (data.requestedDate || '') + ' at ' + (data.requestedTime || '') + '. It is waiting for company approval. You will receive an email when it\'s approved.';
      } else if (isPoolService) {
        msg = 'We received your recurring pool service request' + (data.preferredServiceDay ? ' (preferred day: ' + data.preferredServiceDay + ')' : '') + '. It is waiting for company approval. You will receive an email when it\'s approved with next steps to sign the service agreement and set up autopay.';
      } else {
        msg = 'We received your request for ' + (data.serviceType || 'service') + ' on ' + (data.requestedDate || '') + ' at ' + (data.requestedTime || '') + '. It is waiting for company approval. You will receive an email when it\'s approved.';
      }
      const subj = isEstimate ? 'Estimate Request Received (Awaiting Approval) – A Quality Pool Company' : 'Service Request Received (Awaiting Approval) – A Quality Pool Company';
      var emailHtml;
      if (isPoolService) {
        const _logoUrl = 'https://cdn.prod.website-files.com/6931dc4e8e97334e195432df/6993ce0abcd54d3520799318_IMG_1763.jpg';
        const _pDay = data.preferredServiceDay || '';
        emailHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
          + '<style>body{margin:0;padding:0;background:#f5f7fa;}table{border-collapse:collapse;}img{border:0;height:auto;line-height:100%;}</style>'
          + '</head><body style="background:#f5f7fa;margin:0;padding:0;">'
          + '<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f7fa;"><tr><td align="center" style="padding:40px 20px;">'
          + '<table border="0" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;">'
          // Header
          + '<tr><td align="center" style="background:linear-gradient(135deg,#0c4a6e 0%,#0369a1 100%);padding:36px 24px;text-align:center;">'
          + '<img src="' + _logoUrl + '" alt="A Quality Pool Company" style="max-width:160px;height:auto;display:block;margin:0 auto 16px auto;border-radius:8px;">'
          + '<h1 style="color:#ffffff;margin:0 0 6px 0;font-size:26px;font-weight:800;line-height:1.2;">Request Received</h1>'
          + '<p style="color:#bae6fd;margin:0;font-size:14px;">Weekly Pool Service – A Quality Pool Company</p>'
          + '</td></tr>'
          // Body
          + '<tr><td style="padding:36px 28px;">'
          + '<h2 style="font-size:18px;font-weight:700;color:#0f172a;margin:0 0 14px 0;">Hello ' + firstName + ',</h2>'
          + '<p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 24px 0;">Thank you for requesting recurring pool service with us! We\'ve received your request and it\'s currently <strong>awaiting company approval</strong>.</p>'
          // Detail box
          + '<div style="background:#f0f9ff;border-left:4px solid #0284c7;border-radius:0 8px 8px 0;padding:20px 24px;margin:0 0 24px 0;">'
          + '<p style="margin:0 0 6px 0;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#0369a1;">Your Request Details</p>'
          + '<table border="0" cellpadding="0" cellspacing="0" width="100%">'
          + '<tr><td style="padding:7px 0;color:#64748b;font-size:14px;width:140px;vertical-align:top;">Service:</td><td style="padding:7px 0;font-weight:700;color:#0f172a;font-size:15px;">Weekly Pool Service</td></tr>'
          + (_pDay ? '<tr><td style="padding:7px 0;color:#64748b;font-size:14px;vertical-align:top;">Preferred Day:</td><td style="padding:7px 0;font-weight:700;color:#0f172a;font-size:15px;">' + _pDay + '</td></tr>' : '')
          + '<tr><td style="padding:7px 0;color:#64748b;font-size:14px;vertical-align:top;">Status:</td><td style="padding:7px 0;font-weight:700;color:#d97706;font-size:15px;">Awaiting Approval</td></tr>'
          + '</table></div>'
          // What happens next
          + '<div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:20px 24px;margin:0 0 24px 0;">'
          + '<p style="margin:0 0 10px 0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#92400e;">What Happens Next</p>'
          + '<p style="margin:0;font-size:14px;color:#78350f;line-height:1.7;">Once approved, you\'ll receive an email with next steps to sign your <strong>service agreement</strong> and set up <strong>autopay</strong> for seamless, hassle-free billing.</p>'
          + '</div>'
          + '<p style="font-size:14px;color:#64748b;line-height:1.6;margin:0;">Questions? Reach us at <a href="mailto:samr@aqualitypoolcompanyusa.com" style="color:#0284c7;text-decoration:none;font-weight:600;">samr@aqualitypoolcompanyusa.com</a></p>'
          + '</td></tr>'
          // Footer
          + '<tr><td style="background:#f8fafc;padding:24px;text-align:center;border-top:1px solid #e2e8f0;">'
          + '<p style="font-size:13px;color:#64748b;margin:4px 0;font-weight:700;">A Quality Pool Company</p>'
          + '<p style="font-size:13px;color:#9ca3af;margin:4px 0;">samr@aqualitypoolcompanyusa.com | (502) 706-9172</p>'
          + '</td></tr>'
          + '</table></td></tr></table></body></html>';
      } else {
        emailHtml = '<div style="font-family:Arial,sans-serif;max-width:560px;">'
          + '<p>Hello ' + firstName + ',</p>'
          + '<p>' + msg + '</p>'
          + '<p>— A Quality Pool Company</p></div>';
      }
      MailApp.sendEmail({
        to: customerEmail,
        subject: subj,
        htmlBody: emailHtml
      });
    } catch (e) {
      Logger.log('submitPublicScheduleRequest customer email: ' + e.toString());
    }
  }
  sendPendingOpeningEmailToBrooks(apptId);
  return { success: true, appointmentId: apptId };
}

/**
 * Helper function to load invoices for a company
 */
function loadInvoicesForCompany(companyId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Invoices & Estimates');
    if (!sheet) return [];

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return [];

    const headers = data[0];
    // Try both 'Company ID' (with space) and 'CompanyID' (no space)
    let companyCol = headers.indexOf('Company ID');
    if (companyCol === -1) {
      companyCol = headers.indexOf('CompanyID');
    }
    // Try both 'Customer Email' (with space) and 'CustomerEmail' (no space)
    let emailCol = headers.indexOf('Customer Email');
    if (emailCol === -1) {
      emailCol = headers.indexOf('CustomerEmail');
    }
    const statusCol = headers.indexOf('Payment Status');
    const totalCol = headers.indexOf('Total');

    if (companyCol === -1 || emailCol === -1) return [];

    const invoices = [];
    for (let i = 1; i < data.length; i++) {
      const rowCompany = (data[i][companyCol] || '').toString();
      if (companyId && rowCompany !== companyId) continue;

      invoices.push({
        customerEmail: (data[i][emailCol] || '').toString().toLowerCase().trim(),
        paymentStatus: (data[i][statusCol] || '').toString(),
        status: (data[i][statusCol] || '').toString(),
        total: parseFloat(data[i][totalCol]) || 0
      });
    }
    return invoices;
  } catch (error) {
    Logger.log('Error loading invoices: ' + error);
    return [];
  }
}

// ===========================================================================
// PAYMENT HISTORY INTEGRATION
// ===========================================================================
// Payment History columns (from your existing sheet):
//   A: Date, B: Invoice ID, C: Company ID, D: Amount, E: Payment Method,
//   F: Transaction ID, G: Status, H: Email, I: Description, J: Fee, K: Notes

/**
 * Look up a card payment in Payment History by customer email
 * Returns the matching payment(s) so the user can pick one
 */
function lookupCardPayment(email, companyId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(PAYMENT_HISTORY_SHEET);
    if (!sheet) return { success: false, error: 'Payment History sheet not found', payments: [] };

    const data = sheet.getDataRange().getValues();
    if (data.length < 3) return { success: true, payments: [] }; // Row 1 = title, Row 2 = headers

    const payments = [];
    // Start from row 3 (index 2) since row 1 is title, row 2 is headers
    for (let i = 2; i < data.length; i++) {
      const rowEmail = (data[i][7] || '').toString().toLowerCase().trim(); // Col H = Email
      const rowCompany = (data[i][2] || '').toString();                    // Col C = Company ID
      const rowAmount = parseFloat(data[i][3]) || 0;                       // Col D = Amount

      if (rowEmail && rowEmail === email.toLowerCase().trim() && (!companyId || rowCompany === companyId)) {
        payments.push({
          date: formatSheetDate(data[i][0]),       // Col A
          invoiceId: (data[i][1] || '').toString(), // Col B
          amount: rowAmount,                        // Col D
          method: (data[i][4] || '').toString(),    // Col E
          transactionId: (data[i][5] || '').toString(), // Col F
          status: (data[i][6] || '').toString(),    // Col G
          email: rowEmail,                          // Col H
          description: (data[i][8] || '').toString(), // Col I
          fee: parseFloat(data[i][9]) || 0,         // Col J
          notes: (data[i][10] || '').toString()      // Col K
        });
      }
    }

    // Sort newest first
    payments.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return { success: true, payments: payments };
  } catch (error) {
    Logger.log('Error in lookupCardPayment: ' + error);
    return { success: false, error: error.toString(), payments: [] };
  }
}

function logManualPaymentToHistory_(data) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(PAYMENT_HISTORY_SHEET);
    if (!sheet) return { success: false, error: 'Payment History sheet not found' };

    const values = sheet.getDataRange().getValues();
    const paymentDate = data.date || new Date().toISOString().split('T')[0];
    const rawMethod = String(data.paymentMethod || data.method || 'Cash').trim();
    const methodLower = rawMethod.toLowerCase();
    const normalizedMethod = (methodLower.indexOf('card') !== -1 || methodLower.indexOf('stripe') !== -1)
      ? 'Stripe'
      : (methodLower.indexOf('check') !== -1 ? 'Check' : 'Cash');
    const txnPrefix = normalizedMethod === 'Stripe'
      ? 'STRIPE-MANUAL'
      : (normalizedMethod === 'Check' ? 'CHECK' : 'CASH');
    const transactionId = String(data.transactionId || (txnPrefix + '-' + Utilities.getUuid().substring(0, 8).toUpperCase())).trim();
    const amount = parseFloat(data.amount || 0) || 0;

    const newRow = [
      paymentDate,
      data.invoiceId || 'N/A',
      data.companyId || 'CMP-AQUALITYPOOL',
      amount,
      normalizedMethod,
      transactionId,
      data.status || 'Completed',
      data.email || '',
      data.description || (data.serviceType || 'Service') + ' - ' + (data.customerName || ''),
      parseFloat(data.fee || 0) || 0,
      data.notes || (normalizedMethod + ' payment for ' + (data.serviceType || 'service') + ' on ' + paymentDate)
    ];

    let insertRow = 3;
    for (let i = 2; i < values.length; i++) {
      const rowDate = formatSheetDate(values[i][0]);
      if (rowDate && paymentDate >= rowDate) {
        insertRow = i + 1;
        break;
      }
    }

    sheet.insertRowBefore(insertRow);
    sheet.getRange(insertRow, 1, 1, newRow.length).setValues([newRow]);

    return {
      success: true,
      message: normalizedMethod + ' payment logged',
      transactionId: transactionId,
      method: normalizedMethod
    };
  } catch (error) {
    Logger.log('Error in logManualPaymentToHistory_: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Log a cash payment to the Payment History sheet
 * Inserts at the correct date position to maintain sort order
 */
function logCashPayment(data) {
  return logManualPaymentToHistory_(Object.assign({}, data || {}, { paymentMethod: 'Cash' }));
}

/**
 * Update the Customer JSON data in Column M (index 12) with spending info
 * Tracks: totalSpent, paymentCount, lastPaymentDate, services
 */
function updateCustomerSpending(email, amount, serviceType, paymentDate, paymentMethod) {
  try {
    if (!email) return { success: false, error: 'No email provided' };
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CUSTOMERS_SHEET);
    if (!sheet) return { success: false, error: 'Customers sheet not found' };

    const data = sheet.getDataRange().getValues();
    const jsonCol = 12; // Column M (0-indexed = 12) — "Custom Data JSON" or first JSON col after new layout

    for (let i = 1; i < data.length; i++) {
      const rowEmail = (data[i][CUST_COL.EMAIL] || '').toString().toLowerCase().trim();
      if (rowEmail === email.toLowerCase().trim()) {
        // Read existing JSON
        let spendingData = {};
        try {
          const existing = data[i][jsonCol];
          if (existing && existing !== '{}' && typeof existing === 'string') {
            spendingData = JSON.parse(existing);
          }
        } catch (e) { spendingData = {}; }

        // Update spending data
        const amt = parseFloat(amount) || 0;
        spendingData.totalSpent = (parseFloat(spendingData.totalSpent) || 0) + amt;
        spendingData.paymentCount = (parseInt(spendingData.paymentCount) || 0) + 1;
        spendingData.lastPaymentDate = paymentDate || new Date().toISOString().split('T')[0];
        spendingData.lastPaymentMethod = paymentMethod || 'Cash';

        // Track services breakdown
        if (!spendingData.services) spendingData.services = {};
        if (!spendingData.services[serviceType]) {
          spendingData.services[serviceType] = { count: 0, total: 0 };
        }
        spendingData.services[serviceType].count += 1;
        spendingData.services[serviceType].total = (spendingData.services[serviceType].total || 0) + amt;

        // Track payment history
        if (!spendingData.payments) spendingData.payments = [];
        spendingData.payments.push({
          date: paymentDate || new Date().toISOString().split('T')[0],
          amount: amt,
          method: paymentMethod || 'Cash',
          service: serviceType || ''
        });
        // Keep only last 50 payments
        if (spendingData.payments.length > 50) {
          spendingData.payments = spendingData.payments.slice(-50);
        }

        // Auto-add service type as tag
        if (!spendingData.tags) spendingData.tags = [];
        var serviceTag = (serviceType || '').toLowerCase().replace(/\s+/g, '-');
        if (serviceTag && spendingData.tags.indexOf(serviceTag) === -1) {
          spendingData.tags.push(serviceTag);
        }

        // Write back
        sheet.getRange(i + 1, jsonCol + 1).setValue(JSON.stringify(spendingData));
        return { success: true, spendingData: spendingData };
      }
    }

    return { success: false, error: 'Customer not found by email' };
  } catch (error) {
    Logger.log('Error in updateCustomerSpending: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Called when saving an appointment with payment — handles logging and spending
 */
function processPayment(data) {
  try {
    const amt = parseFloat(data.amountPaid) || 0;
    if (amt <= 0) return { success: true, message: 'No payment to process' };

    const results = { logged: false, spending: false, cardMatch: null };

    if (data.paymentMethod === 'Card') {
      // Card payments are already in Payment History via Stripe
      // Just update customer spending JSON
      results.cardMatch = true;
    } else {
      // Cash payment — log to Payment History
      const logResult = logCashPayment({
        date: data.date,
        companyId: data.companyId || 'CMP-AQUALITYPOOL',
        amount: amt,
        email: data.customerEmail || '',
        customerName: data.customerName || '',
        serviceType: data.serviceType || '',
        description: (data.serviceType || 'Service') + ' - ' + (data.customerName || ''),
        notes: 'Cash collected for ' + (data.serviceType || 'service')
      });
      results.logged = logResult.success;
    }

    // Update customer spending JSON
    if (data.customerEmail) {
      const spendResult = updateCustomerSpending(
        data.customerEmail, amt, data.serviceType || '',
        data.date || '', data.paymentMethod || 'Cash'
      );
      results.spending = spendResult.success;
    }

    return { success: true, results: results };
  } catch (error) {
    Logger.log('Error in processPayment: ' + error);
    return { success: false, error: error.toString() };
  }
}

function recordAppointmentPayment(appointmentId, paymentData) {
  try {
    const apptId = String(appointmentId || '').trim();
    if (!apptId) return { success: false, error: 'Appointment ID is required' };

    const data = paymentData || {};
    const paymentAmount = parseFloat(data.amount || 0) || 0;
    if (!(paymentAmount > 0)) return { success: false, error: 'Valid payment amount required' };

    const sheet = getOrCreateSheet(APPOINTMENTS_SHEET, getAppointmentsHeaders());
    const values = sheet.getDataRange().getValues();
    const headers = values[0] || [];
    const now = new Date().toISOString();

    const amountCol = getApptCol(headers, 'AmountPaid', ['Amount Paid']);
    const paidStatusCol = getApptCol(headers, 'PaidStatus', ['Paid Status']);
    const estimatedCostCol = getApptCol(headers, 'EstimatedCost', ['Estimated Cost']);
    const linkedInvoiceCol = getApptCol(headers, 'LinkedInvoiceID', ['Linked Invoice ID']);
    const updatedAtCol = getApptCol(headers, 'UpdatedAt', null);
    const companyCol = getApptCol(headers, 'CompanyID');
    const emailCol = getApptCol(headers, 'CustomerEmail', ['Customer Email']);
    const nameCol = getApptCol(headers, 'CustomerName', ['Customer Name']);
    const serviceCol = getApptCol(headers, 'ServiceType', ['Service Type']);
    const dateCol = getApptCol(headers, 'Date', ['CustomAppointment Date']);

    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0] || '').trim() !== apptId) continue;

      const row = values[i];
      const rowNum = i + 1;
      const currentAmountPaid = amountCol >= 0 ? (parseFloat(row[amountCol] || 0) || 0) : 0;
      const estimatedCost = estimatedCostCol >= 0 ? (parseFloat(row[estimatedCostCol] || 0) || 0) : 0;
      const nextAmountPaid = currentAmountPaid + paymentAmount;
      let nextPaidStatus = String(data.paidStatus || '').trim();
      if (!nextPaidStatus) {
        if (estimatedCost > 0 && nextAmountPaid >= (estimatedCost - 0.01)) nextPaidStatus = 'Paid';
        else nextPaidStatus = nextAmountPaid > 0 ? 'Partially Paid' : 'Unpaid';
      }

      if (amountCol >= 0) sheet.getRange(rowNum, amountCol + 1).setValue(nextAmountPaid);
      if (paidStatusCol >= 0) sheet.getRange(rowNum, paidStatusCol + 1).setValue(nextPaidStatus);
      if (updatedAtCol >= 0) sheet.getRange(rowNum, updatedAtCol + 1).setValue(now);

      const paymentMethod = String(data.paymentMethod || 'Cash').trim() || 'Cash';
      const invoiceId = String(data.invoiceId || (linkedInvoiceCol >= 0 ? row[linkedInvoiceCol] || '' : '')).trim();
      const companyId = String(companyCol >= 0 ? row[companyCol] || '' : '') || 'CMP-AQUALITYPOOL';
      const customerEmail = String(emailCol >= 0 ? row[emailCol] || '' : '').trim();
      const customerName = String(nameCol >= 0 ? row[nameCol] || '' : '').trim();
      const serviceType = String(serviceCol >= 0 ? row[serviceCol] || '' : '').trim();
      const paymentDate = formatSheetDate(dateCol >= 0 ? row[dateCol] : '') || new Date().toISOString().split('T')[0];
      const paymentMethodLower = paymentMethod.toLowerCase();
      const normalizedMethod = (paymentMethodLower.indexOf('card') !== -1 || paymentMethodLower.indexOf('stripe') !== -1)
        ? 'Stripe'
        : (paymentMethodLower.indexOf('check') !== -1 ? 'Check' : 'Cash');

      const logResult = logManualPaymentToHistory_({
        date: String(data.date || '').trim() || paymentDate,
        companyId: companyId,
        invoiceId: invoiceId || 'N/A',
        amount: paymentAmount,
        paymentMethod: normalizedMethod,
        email: customerEmail,
        customerName: customerName,
        serviceType: serviceType,
        description: (serviceType || 'Service') + ' - ' + (customerName || ''),
        notes: String(data.notes || '').trim() || (normalizedMethod + ' payment recorded from appointment details'),
        status: 'Completed'
      });
      if (!logResult.success) {
        return { success: false, error: logResult.error || 'Failed to log payment history' };
      }

      let spendingResult = { success: true };
      if (customerEmail) {
        spendingResult = updateCustomerSpending(
          customerEmail,
          paymentAmount,
          serviceType,
          String(data.date || '').trim() || paymentDate,
          normalizedMethod
        );
      }

      var receiptResult = { success: false, skipped: true };
      if (invoiceId) {
        receiptResult = sendAppointmentPaymentReceipt_({
          invoiceId: invoiceId,
          transactionId: logResult.transactionId || '',
          amount: paymentAmount,
          paymentMethod: normalizedMethod,
          paymentDate: String(data.date || '').trim() || paymentDate,
          milestoneName: 'Invoice Payment',
          customerEmail: customerEmail,
          customerName: customerName,
          customerPhone: String(getApptCol(headers, 'CustomerPhone', ['Customer Phone']) >= 0 ? row[getApptCol(headers, 'CustomerPhone', ['Customer Phone'])] || '' : '').trim(),
          projectId: String(data.projectId || '').trim()
        });
      }

      return {
        success: true,
        appointmentId: apptId,
        invoiceId: invoiceId,
        paymentAmount: paymentAmount,
        totalAmountPaid: nextAmountPaid,
        paidStatus: nextPaidStatus,
        paymentMethod: normalizedMethod,
        transactionId: logResult.transactionId || '',
        spendingUpdated: !!(spendingResult && spendingResult.success),
        receiptSent: !!(receiptResult && receiptResult.success),
        receiptUrl: receiptResult && receiptResult.receiptUrl ? receiptResult.receiptUrl : '',
        receiptError: receiptResult && !receiptResult.success && !receiptResult.skipped ? (receiptResult.error || 'Receipt failed') : ''
      };
    }

    return { success: false, error: 'Appointment not found' };
  } catch (error) {
    Logger.log('Error in recordAppointmentPayment: ' + error);
    return { success: false, error: error.toString() };
  }
}

function fetchInvoiceEstimateData_(invoiceId) {
  try {
    if (!invoiceId) return { success: false, error: 'Invoice ID required' };
    var response = UrlFetchApp.fetch(INVOICE_ESTIMATE_WEBAPP_URL, {
      method: 'post',
      payload: {
        action: 'getInvoiceEstimate',
        id: String(invoiceId).trim()
      },
      muteHttpExceptions: true
    });
    var text = response.getContentText() || '{}';
    var parsed = JSON.parse(text);
    if (!parsed || !parsed.success || !parsed.data) {
      return { success: false, error: (parsed && parsed.error) ? parsed.error : 'Invoice not found' };
    }
    return { success: true, data: parsed.data };
  } catch (error) {
    Logger.log('fetchInvoiceEstimateData_ error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

function sendAppointmentPaymentReceipt_(opts) {
  try {
    opts = opts || {};
    var invoiceId = String(opts.invoiceId || '').trim();
    if (!invoiceId) return { success: false, skipped: true, error: 'No linked invoice' };

    var invoiceLookup = fetchInvoiceEstimateData_(invoiceId);
    var invoiceData = invoiceLookup && invoiceLookup.success ? (invoiceLookup.data || {}) : {};
    var projectId = String(
      opts.projectId ||
      invoiceData.projectId ||
      invoiceData.linkedProjectId ||
      invoiceData.projectID ||
      invoiceId
    ).trim();

    var response = UrlFetchApp.fetch(INVOICE_ESTIMATE_WEBAPP_URL, {
      method: 'post',
      payload: {
        action: 'sendPaymentReceipt',
        projectId: projectId,
        transactionId: String(opts.transactionId || '').trim(),
        amount: String(opts.amount || ''),
        paymentMethod: String(opts.paymentMethod || '').trim(),
        paymentDate: String(opts.paymentDate || '').trim(),
        milestoneName: String(opts.milestoneName || 'Invoice Payment').trim(),
        customerEmail: String(opts.customerEmail || invoiceData.customerEmail || '').trim(),
        customerName: String(opts.customerName || invoiceData.customerName || '').trim(),
        customerPhone: String(opts.customerPhone || invoiceData.customerPhone || '').trim(),
        invoiceId: invoiceId
      },
      muteHttpExceptions: true
    });

    var text = response.getContentText() || '{}';
    var parsed = JSON.parse(text);
    if (!parsed || !parsed.success) {
      return { success: false, error: (parsed && parsed.error) ? parsed.error : 'Receipt send failed' };
    }
    return { success: true, receiptUrl: parsed.receiptUrl || '' };
  } catch (error) {
    Logger.log('sendAppointmentPaymentReceipt_ error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

// ===========================================================================
// CUSTOMER TAGS (stored in JSON Column M = index 12)
// ===========================================================================

/**
 * Update (merge) tags for a customer by email.
 * Tags are stored in the JSON object under a "tags" key.
 */
function updateCustomerTags(email, newTags) {
  try {
    if (!email) return { success: false, error: 'No email provided' };
    if (!newTags || !newTags.length) return { success: true, message: 'No tags to update' };

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CUSTOMERS_SHEET);
    if (!sheet) return { success: false, error: 'Customers sheet not found' };

    const data = sheet.getDataRange().getValues();
    const jsonCol = 12; // Column M (0-indexed)

    for (let i = 1; i < data.length; i++) {
      const rowEmail = (data[i][CUST_COL.EMAIL] || '').toString().toLowerCase().trim();
      if (rowEmail === email.toLowerCase().trim()) {
        let jsonData = {};
        try {
          const existing = data[i][jsonCol];
          if (existing && existing !== '{}' && typeof existing === 'string') {
            jsonData = JSON.parse(existing);
          }
        } catch (e) { jsonData = {}; }

        // Merge tags (deduplicate)
        if (!jsonData.tags) jsonData.tags = [];
        newTags.forEach(function(tag) {
          var normalizedTag = tag.trim();
          if (normalizedTag && jsonData.tags.indexOf(normalizedTag) === -1) {
            jsonData.tags.push(normalizedTag);
          }
        });

        sheet.getRange(i + 1, jsonCol + 1).setValue(JSON.stringify(jsonData));
        return { success: true, tags: jsonData.tags };
      }
    }

    return { success: false, error: 'Customer not found by email' };
  } catch (error) {
    Logger.log('Error in updateCustomerTags: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Get tags for a single customer by email
 */
function getCustomerTags(email) {
  try {
    if (!email) return { success: false, tags: [] };

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CUSTOMERS_SHEET);
    if (!sheet) return { success: false, tags: [] };

    const data = sheet.getDataRange().getValues();
    const jsonCol = 12;

    for (let i = 1; i < data.length; i++) {
      const rowEmail = (data[i][CUST_COL.EMAIL] || '').toString().toLowerCase().trim();
      if (rowEmail === email.toLowerCase().trim()) {
        let jsonData = {};
        try {
          const existing = data[i][jsonCol];
          if (existing && existing !== '{}' && typeof existing === 'string') {
            jsonData = JSON.parse(existing);
          }
        } catch (e) { jsonData = {}; }
        return { success: true, tags: jsonData.tags || [] };
      }
    }
    return { success: true, tags: [] };
  } catch (error) {
    return { success: false, tags: [], error: error.toString() };
  }
}

/**
 * Get all customer tags as a map { email: [tags] } — for bulk loading on frontend
 */
function getAllCustomerTags() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CUSTOMERS_SHEET);
    if (!sheet) return { success: true, tagsMap: {} };

    const data = sheet.getDataRange().getValues();
    const jsonCol = 12;
    const tagsMap = {};

    for (let i = 1; i < data.length; i++) {
      const rowEmail = (data[i][CUST_COL.EMAIL] || '').toString().toLowerCase().trim();
      if (!rowEmail) continue;

      let jsonData = {};
      try {
        const existing = data[i][jsonCol];
        if (existing && existing !== '{}' && typeof existing === 'string') {
          jsonData = JSON.parse(existing);
        }
      } catch (e) { jsonData = {}; }

      if (jsonData.tags && jsonData.tags.length > 0) {
        tagsMap[rowEmail] = jsonData.tags;
      }
    }

    return { success: true, tagsMap: tagsMap };
  } catch (error) {
    Logger.log('Error in getAllCustomerTags: ' + error);
    return { success: false, tagsMap: {}, error: error.toString() };
  }
}

// ===========================================================================
// GOOGLE CALENDAR
// ===========================================================================
function addToGoogleCalendar(data) {
  const calendar = CalendarApp.getCalendarById(CALENDAR_ID) || CalendarApp.getDefaultCalendar();
  const startDateTime = buildDateTime(data.date, data.time);
  const durationMinutes = parseInt(data.duration) || 60;
  const endDateTime = new Date(startDateTime.getTime() + durationMinutes * 60 * 1000);

  const event = calendar.createEvent(buildCalendarTitle(data), startDateTime, endDateTime, {
    description: buildCalendarDescription(data),
    location: data.address || ''
  });

  const colorId = SERVICE_COLORS[data.serviceType];
  if (colorId) event.setColor(colorId);
  event.addPopupReminder(30);

  // NOTE: Do NOT add customer as guest — we only want this on OUR calendar
  // No event.addGuest() call

  return event.getId();
}

function updateGoogleCalendarEvent(calendarEventId, data) {
  const calendar = CalendarApp.getCalendarById(CALENDAR_ID) || CalendarApp.getDefaultCalendar();
  try {
    const event = calendar.getEventById(calendarEventId);
    if (!event) return addToGoogleCalendar(data);

    const startDateTime = buildDateTime(data.date, data.time);
    const endDateTime = new Date(startDateTime.getTime() + (parseInt(data.duration) || 60) * 60 * 1000);

    event.setTime(startDateTime, endDateTime);
    let title = buildCalendarTitle(data);
    if (data.status === 'Cancelled') title = '❌ CANCELLED: ' + title;
    else if (data.status === 'Completed') title = '✅ ' + title;
    event.setTitle(title);
    event.setDescription(buildCalendarDescription(data));
    event.setLocation(data.address || '');
    const colorId = SERVICE_COLORS[data.serviceType];
    if (colorId) event.setColor(colorId);

    return calendarEventId;
  } catch (error) {
    return addToGoogleCalendar(data);
  }
}

function deleteGoogleCalendarEvent(calendarEventId) {
  try {
    const calendar = CalendarApp.getCalendarById(CALENDAR_ID) || CalendarApp.getDefaultCalendar();
    const event = calendar.getEventById(calendarEventId);
    if (event) event.deleteEvent();
  } catch (e) {}
}

function buildDateTime(dateStr, timeStr) {
  if (!dateStr) return new Date();
  const [year, month, day] = dateStr.split('-').map(Number);
  let hours = 9, minutes = 0;
  if (timeStr) {
    const parts = timeStr.split(':');
    hours = parseInt(parts[0]) || 9;
    minutes = parseInt(parts[1]) || 0;
  }
  return new Date(year, month - 1, day, hours, minutes, 0);
}

function buildCalendarTitle(data) {
  const emojis = { 'Pool Service': '🏊', 'Opening': '🌊', 'Closing': '🔒', 'Installation': '🔧', 'Renovation': '🏗️', 'Snow Removal': '❄️' };
  return (emojis[data.serviceType] || '📅') + ' ' + (data.serviceType || 'Service') + ' - ' + (data.customerName || 'Customer');
}

function buildCalendarDescription(data) {
  let d = '── A Quality Pool Company ──\n\n';
  d += '👤 Customer: ' + (data.customerName || 'N/A') + '\n';
  if (data.customerEmail) d += '📧 Email: ' + data.customerEmail + '\n';
  if (data.customerPhone) d += '📱 Phone: ' + data.customerPhone + '\n';
  d += '🔧 Service: ' + (data.serviceType || 'N/A') + '\n';
  d += '⏱️ Duration: ' + (data.duration || 60) + ' minutes\n';
  if (data.estimatedCost) d += '💰 Est. Cost: $' + parseFloat(data.estimatedCost).toFixed(2) + '\n';
  if (data.assignedTo) d += '👷 Assigned: ' + data.assignedTo + '\n';
  d += '📋 Status: ' + (data.status || 'Scheduled') + '\n';
  if (data.description) d += '\n📝 Details:\n' + data.description + '\n';
  if (data.notes) d += '\n🗒️ Notes:\n' + data.notes + '\n';
  return d;
}

function formatCalendarAuditTs_(d) {
  return Utilities.formatDate(d || new Date(), Session.getScriptTimeZone(), 'MMM d, yyyy h:mm a');
}

function getAppointmentRowContextById_(appointmentId) {
  const sheet = getOrCreateSheet(APPOINTMENTS_SHEET, getAppointmentsHeaders());
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || [];
  const calCol = getApptCol(headers, 'CalendarEventID', ['Calendar Event ID']);
  const dateCol = getApptCol(headers, 'Date', ['CustomAppointment Date']);
  const timeCol = getApptCol(headers, 'Time', null);
  const statusCol = getApptCol(headers, 'Status', null);
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === String(appointmentId || '').trim()) {
      return {
        sheet: sheet,
        headers: headers,
        rowIndex: i,
        rowNumber: i + 1,
        values: values[i],
        calendarEventId: calCol >= 0 ? String(values[i][calCol] || '').trim() : '',
        date: dateCol >= 0 ? String(values[i][dateCol] || '').trim() : '',
        time: timeCol >= 0 ? String(values[i][timeCol] || '').trim() : '',
        status: statusCol >= 0 ? String(values[i][statusCol] || '').trim() : ''
      };
    }
  }
  return null;
}

function appendCalendarEventLogForAppointment_(appointmentId, entryText) {
  try {
    const ctx = getAppointmentRowContextById_(appointmentId);
    if (!ctx || !ctx.calendarEventId) return { success: false, error: 'Calendar event not found for appointment' };
    const calendar = CalendarApp.getCalendarById(CALENDAR_ID) || CalendarApp.getDefaultCalendar();
    const event = calendar.getEventById(ctx.calendarEventId);
    if (!event) return { success: false, error: 'Calendar event does not exist' };

    const existing = String(event.getDescription() || '');
    const line = '[' + formatCalendarAuditTs_(new Date()) + '] ' + String(entryText || '').trim();
    if (!line || line.length < 5) return { success: false, error: 'Entry text is empty' };

    const marker = '\n\n── Activity Log ──\n';
    let next = existing;
    if (existing.indexOf('── Activity Log ──') === -1) {
      next += marker + line;
    } else {
      next += '\n' + line;
    }
    event.setDescription(next);
    return { success: true };
  } catch (err) {
    Logger.log('appendCalendarEventLogForAppointment_ failed: ' + err.toString());
    return { success: false, error: err.toString() };
  }
}

function syncAppointmentsFromGoogleCalendar() {
  try {
    const sheet = getOrCreateSheet(APPOINTMENTS_SHEET, getAppointmentsHeaders());
    const values = sheet.getDataRange().getValues();
    const headers = values[0] || [];
    const colId = getApptCol(headers, 'ID', ['AppointmentID']);
    const colCal = getApptCol(headers, 'CalendarEventID', ['Calendar Event ID']);
    const colDate = getApptCol(headers, 'Date', ['CustomAppointment Date']);
    const colTime = getApptCol(headers, 'Time', null);
    const colStatus = getApptCol(headers, 'Status', null);
    const colUpdatedAt = getApptCol(headers, 'UpdatedAt', null);
    if (colId < 0 || colCal < 0 || colDate < 0 || colTime < 0 || colStatus < 0) {
      return { success: false, error: 'Required columns missing for sync' };
    }

    const calendar = CalendarApp.getCalendarById(CALENDAR_ID) || CalendarApp.getDefaultCalendar();
    let synced = 0;
    let changed = 0;
    const errors = [];

    for (let i = 1; i < values.length; i++) {
      const appointmentId = String(values[i][colId] || '').trim();
      const calendarEventId = String(values[i][colCal] || '').trim();
      if (!appointmentId || !calendarEventId) continue;
      synced++;
      try {
        const event = calendar.getEventById(calendarEventId);
        const oldDate = String(values[i][colDate] || '').trim();
        const oldTime = String(values[i][colTime] || '').trim();
        const oldStatus = String(values[i][colStatus] || '').trim() || 'Scheduled';

        if (!event) {
          if (oldStatus !== 'Cancelled') {
            quickUpdateStatus(appointmentId, 'Cancelled', 'Synced from Google Calendar: event removed/cancelled');
            changed++;
          }
          continue;
        }

        const start = event.getStartTime();
        const newDate = Utilities.formatDate(start, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        const newTime = Utilities.formatDate(start, Session.getScriptTimeZone(), 'HH:mm');
        const title = String(event.getTitle() || '');
        const titleLower = title.toLowerCase();
        const eventSuggestsCancelled = /cancelled|❌/.test(titleLower);
        const eventSuggestsRescheduled = /rescheduled|🔄/.test(titleLower);
        const timeChanged = (newDate !== oldDate || newTime !== oldTime);

        if (eventSuggestsCancelled && oldStatus !== 'Cancelled') {
          quickUpdateStatus(appointmentId, 'Cancelled', 'Synced from Google Calendar cancellation');
          changed++;
          continue;
        }

        if (timeChanged || eventSuggestsRescheduled) {
          const updatePayload = {
            id: appointmentId,
            date: newDate,
            time: newTime,
            status: eventSuggestsRescheduled ? 'Rescheduled' : (oldStatus === 'Cancelled' ? 'Scheduled' : oldStatus)
          };
          const res = updateAppointment(updatePayload);
          if (res && res.success) {
            if (colUpdatedAt >= 0) sheet.getRange(i + 1, colUpdatedAt + 1).setValue(new Date().toISOString());
            appendCalendarEventLogForAppointment_(appointmentId, 'Synced from Google Calendar: ' + oldDate + ' ' + oldTime + ' → ' + newDate + ' ' + newTime + (eventSuggestsRescheduled ? ' (Rescheduled)' : ''));
            changed++;
          }
        }
      } catch (rowErr) {
        errors.push('Appointment ' + appointmentId + ': ' + rowErr.toString());
      }
    }

    return { success: true, synced: synced, changed: changed, errors: errors };
  } catch (err) {
    Logger.log('syncAppointmentsFromGoogleCalendar failed: ' + err.toString());
    return { success: false, error: err.toString() };
  }
}

// ===========================================================================
// NOTIFICATIONS
// ===========================================================================
function sendAppointmentNotification(data, type) {
  if (!data.customerEmail) return;
  const companyName = 'A Quality Pool Company';
  
  let subject, body;
  if (type === 'new') {
    subject = 'Appointment Scheduled - ' + companyName;
    body = buildNotificationEmail(data, companyName, 'Appointment Scheduled', 'Your service has been booked', '#0ea5e9', '#f0f9ff');
  } else {
    subject = 'Appointment Updated - ' + companyName;
    body = buildNotificationEmail(data, companyName, 'Appointment Updated', 'Your service details have changed', '#f59e0b', '#fef3c7');
  }

  try {
    MailApp.sendEmail({ to: data.customerEmail, subject: subject, htmlBody: body });
    logNotification(data.id, data.customerEmail, type, 'Sent', subject);
    markNotificationSent(data.id);
  } catch (error) {
    logNotification(data.id, data.customerEmail, type, 'Failed', error.toString());
  }
}

function buildNotificationEmail(data, companyName, heading, subheading, accentColor, bgColor) {
  const firstName = (data.customerName || '').split(' ')[0];
  const logoUrl = 'https://cdn.prod.website-files.com/6931dc4e8e97334e195432df/6993ce0abcd54d3520799318_IMG_1763.jpg';
  
  return '<!DOCTYPE html>'
    + '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">'
    + '<head>'
    + '<meta charset="UTF-8">'
    + '<meta http-equiv="X-UA-Compatible" content="IE=edge">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<style type="text/css">'
    + 'body{margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;background-color:#f5f7fa;}'
    + 'table{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;}'
    + 'img{border:0;height:auto;line-height:100%;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}'
    + '@media only screen and (max-width:600px){.mobile-padding{padding-left:16px!important;padding-right:16px!important;}}'
    + '</style>'
    + '</head>'
    + '<body style="background-color:#f5f7fa;margin:0;padding:0;">'
    + '<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f5f7fa;">'
    + '<tr><td align="center" style="padding:40px 20px;">'
    + '<table border="0" cellpadding="0" cellspacing="0" width="640" style="max-width:640px;width:100%;background-color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;">'
    // Header
    + '<tr><td align="center" style="background:linear-gradient(135deg,#0c4a6e 0%,' + accentColor + ' 100%);padding:32px 24px;text-align:center;">'
    + '<img src="' + logoUrl + '" alt="' + companyName + '" style="max-width:180px;height:auto;margin-bottom:16px;display:block;border-radius:8px;">'
    + '<h1 style="color:white;margin:12px 0 4px 0;font-size:26px;font-weight:800;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;">' + heading + '</h1>'
    + '<p style="color:#e0f2fe;margin:0;font-size:14px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;">' + subheading + '</p>'
    + '</td></tr>'
    // Body
    + '<tr><td style="padding:32px 24px;" class="mobile-padding">'
    + '<h2 style="font-size:18px;font-weight:600;color:#0f172a;margin:0 0 16px 0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;">Hello ' + firstName + ',</h2>'
    + '<p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 20px 0;">Your appointment with <strong>' + companyName + '</strong> has been ' + (heading.includes('Scheduled') ? 'confirmed' : 'updated') + '.</p>'
    + (data.linkedProjectId ? '<p style="font-size:15px;color:#0f172a;line-height:1.6;margin:0 0 20px 0;"><strong>An appointment has been made in accordance with your project!</strong></p>' : '')
    // Appointment Details Box
    + '<div style="background:' + bgColor + ';border-left:4px solid ' + accentColor + ';padding:24px;margin:24px 0;border-radius:0 8px 8px 0;">'
    + '<table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">'
    + '<tr><td style="padding:10px 0;color:#64748b;width:140px;font-size:14px;vertical-align:top;">Service:</td><td style="padding:10px 0;font-weight:700;color:#0f172a;font-size:15px;">' + (data.serviceType || 'Service') + '</td></tr>'
    + '<tr><td style="padding:10px 0;color:#64748b;font-size:14px;vertical-align:top;">Date:</td><td style="padding:10px 0;font-weight:700;color:#0f172a;font-size:15px;">' + (data.date || 'TBD') + '</td></tr>'
    + '<tr><td style="padding:10px 0;color:#64748b;font-size:14px;vertical-align:top;">Time:</td><td style="padding:10px 0;font-weight:700;color:#0f172a;font-size:15px;">' + (data.time || 'TBD') + '</td></tr>'
    + '<tr><td style="padding:10px 0;color:#64748b;font-size:14px;vertical-align:top;">Location:</td><td style="padding:10px 0;font-weight:700;color:#0f172a;font-size:15px;">' + (data.address || 'TBD') + '</td></tr>'
    + (data.estimatedCost && parseFloat(data.estimatedCost) > 0 ? '<tr><td style="padding:10px 0;color:#64748b;font-size:14px;vertical-align:top;">Est. Cost:</td><td style="padding:10px 0;font-weight:700;color:#0f172a;font-size:15px;">$' + parseFloat(data.estimatedCost).toFixed(2) + '</td></tr>' : '')
    + '</table></div>'
    // Invoice/Deposit Note
    + '<div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:20px;margin:20px 0;">'
    + '<p style="margin:0;font-size:14px;color:#92400e;line-height:1.6;"><strong>Invoice & Payment:</strong> Your invoice will be sent at the time of your appointment. You will receive communication if a deposit is required.</p>'
    + '</div>'
    // Description if provided
    + (data.description ? '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:20px 0;"><p style="margin:0 0 8px 0;font-size:13px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Service Details</p><p style="margin:0;font-size:15px;color:#374151;line-height:1.6;white-space:pre-wrap;">' + (data.description || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p></div>' : '')
    // Call to Action
    + '<p style="color:#64748b;font-size:14px;line-height:1.6;margin:24px 0 0 0;">If you need to reschedule or have any questions, please don\'t hesitate to contact us.</p>'
    + buildReviewIncentiveEmailSection_()
    + '</td></tr>'
    // Footer
    + '<tr><td style="background:#f8fafc;padding:24px;text-align:center;border-top:1px solid #e2e8f0;">'
    + '<p style="font-size:13px;color:#64748b;margin:4px 0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;"><strong>' + companyName + '</strong></p>'
    + '<p style="font-size:13px;color:#64748b;margin:4px 0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;">samr@aqualitypoolcompanyusa.com | (502) 706-9172</p>'
    + '</td></tr>'
    + '</table>'
    + '</td></tr>'
    + '</table>'
    + '</body></html>';
}

function buildReviewIncentiveEmailSection_() {
  var googleUrl = 'https://share.google/uZb9hkfOo7jPNnBaH';
  var facebookUrl = 'https://www.facebook.com/profile.php?id=61582806915407&sk=reviews';
  return ''
    + '<div style="margin-top:18px;background:#ecfeff;border:1px solid #a5f3fc;border-radius:10px;padding:14px 16px;">'
    + '<p style="margin:0 0 8px 0;font-size:14px;font-weight:700;color:#0e7490;">Want to receive $20 off your next visit?</p>'
    + '<p style="margin:0 0 8px 0;font-size:13px;color:#155e75;line-height:1.6;">Give us a review on Google and Facebook — $10 off per review.</p>'
    + '<p style="margin:0 0 6px 0;font-size:13px;color:#0f172a;">Google: <a href="' + googleUrl + '" target="_blank">Leave a Google review</a></p>'
    + '<p style="margin:0 0 8px 0;font-size:13px;color:#0f172a;">Facebook: <a href="' + facebookUrl + '" target="_blank">Leave a Facebook review</a></p>'
    + '<p style="margin:0;font-size:12px;color:#0f766e;line-height:1.5;">We regularly keep up with reviews, and you\'ll be notified about your review discount at your next service.</p>'
    + '</div>';
}

function getServiceIcon(serviceType) {
  const icons = {
    'Pool Service': '🏊',
    'Opening': '🌊',
    'Closing': '🔒',
    'Snow Removal': '❄️',
    'Installation': '🔧',
    'Renovation': '🏗️'
  };
  return icons[serviceType] || '📅';
}

function logNotification(apptId, email, type, status, message) {
  getOrCreateSheet(NOTIFICATION_LOG_SHEET).appendRow([
    'LOG-' + Date.now(), apptId, email, type, status, new Date().toISOString(), message
  ]);
}

function markNotificationSent(apptId) {
  const sheet = getOrCreateSheet(APPOINTMENTS_SHEET);
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === apptId) {
      sheet.getRange(i + 1, 20).setValue('Yes'); // col 20 = NotificationSent
      break;
    }
  }
}

// ===========================================================================
// RECURRING
// ===========================================================================
function createRecurringAppointments(data) {
  const baseDate = new Date(data.date + 'T12:00:00');
  let interval = 0;
  if (data.recurring === 'weekly') interval = 7;
  else if (data.recurring === 'biweekly') interval = 14;
  else if (data.recurring === 'monthly') interval = 30;
  else return;

  let count = data.recurring === 'weekly' ? 26 : data.recurring === 'biweekly' ? 13 : 6;
  if (typeof data.recurringCount === 'number' && data.recurringCount > 0) count = Math.min(Math.floor(data.recurringCount), 104);
  // Ensure sheet has correct headers before creating recurring appointments
  const sheet = getOrCreateSheet(APPOINTMENTS_SHEET, getAppointmentsHeaders());
  const now = new Date().toISOString();

  for (let i = 1; i <= count; i++) {
    const newDate = new Date(baseDate);
    if (data.recurring === 'monthly') newDate.setMonth(newDate.getMonth() + i);
    else newDate.setDate(newDate.getDate() + (interval * i));
    
    const dateStr = newDate.getFullYear() + '-' + String(newDate.getMonth()+1).padStart(2,'0') + '-' + String(newDate.getDate()).padStart(2,'0');

    let recurCalId = '';
    if (data.addToCalendar !== false) {
      try {
        recurCalId = addToGoogleCalendar({ ...data, date: dateStr, id: 'APPT-' + Date.now() + '-R' + i });
      } catch (e) {}
    }

    sheet.appendRow([
      'APPT-' + Date.now() + '-R' + i, data.companyId || '', data.customerId || '',
      data.customerName || '', data.customerEmail || '', data.customerPhone || '',
      data.address || '', data.serviceType || '', data.appointmentType || 'Regular',
      data.customAppointmentNote || '', dateStr, data.time || '',
      data.duration || 60, data.description || '', data.assignedTo || '', 'Scheduled',
      data.estimatedCost || 0, 0, // AmountPaid
      'Recurring: ' + data.recurring + ' (from ' + data.date + ')',
      data.recurring, 'No', 'No', recurCalId, 'No', '', // LinkedInvoiceID
      now, now,
      data.linkedProjectId || ''  // LinkedProjectID
    ]);
  }
}

// ===========================================================================
// REVIEW REQUEST EMAIL
// ===========================================================================
const GOOGLE_REVIEW_URL = 'https://share.google/M5IWj6S6mtQP8CHgW';
const FACEBOOK_REVIEW_URL = 'https://www.facebook.com/profile.php?id=61582806915407&sk=reviews';
/** Brooks' personal Telegram user id — NOT the bot id (token prefix). */
const BROOKS_TELEGRAM_CHAT_ID = '8255928481';
const BROOKS_TELEGRAM_BOT_TOKEN = '8771014327:AAEHRAZGb1YI_KDsIQqy8plBx_QOd5Cduzw';

function escapeTelegramHtml_(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildTelegramReplyMarkup_(buttons) {
  var validButtons = (buttons || []).filter(function(btn) {
    return btn && btn.text && btn.url;
  });
  if (validButtons.length === 0) return '';
  return JSON.stringify({
    inline_keyboard: validButtons.map(function(btn) {
      return [{ text: String(btn.text), url: String(btn.url) }];
    })
  });
}

/**
 * Build Telegram-safe URL that opens a prefilled SMS draft.
 * - Primary: HTTPS web-app redirect (`doGet?action=sms...`) because Telegram validates button URLs strictly.
 * - Fallback: `sms://<digits>?body=...` (avoids Telegram parser error on `sms:+...`).
 * US: 10 digits -> +1…; 11 digits starting with 1 -> +1 + last 10. Other 10–15 digit strings -> +digits.
 * Name is used only for display/UX labels, not prepended to the SMS body.
 */
function buildTelegramSmsRedirectUrl_(phone, body, name) {
  var cleanPhone = phone ? String(phone).replace(/\D/g, '') : '';
  if (!cleanPhone) return '';
  var e164 = '';
  if (cleanPhone.length === 11 && cleanPhone.charAt(0) === '1') {
    e164 = '+1' + cleanPhone.substring(1);
  } else if (cleanPhone.length === 10) {
    e164 = '+1' + cleanPhone;
  } else if (cleanPhone.length >= 10 && cleanPhone.length <= 15) {
    e164 = '+' + cleanPhone;
  } else {
    return '';
  }
  var n = name ? String(name).trim() : '';
  var fullBody = String(body || '');
  var maxLen = 1200;
  if (fullBody.length > maxLen) {
    fullBody = fullBody.substring(0, maxLen - 3) + '...';
  }

  // Preferred for Telegram inline keyboard buttons: use HTTPS redirect endpoint.
  try {
    var webAppUrl = ScriptApp.getService().getUrl();
    if (webAppUrl && String(webAppUrl).trim()) {
      var sep = webAppUrl.indexOf('?') === -1 ? '?' : '&';
      return webAppUrl + sep
        + 'action=sms'
        + '&phone=' + encodeURIComponent(e164)
        + '&body=' + encodeURIComponent(fullBody)
        + '&name=' + encodeURIComponent(n || 'Customer');
    }
  } catch (err) {
    Logger.log('buildTelegramSmsRedirectUrl_ web app URL lookup failed: ' + err);
  }

  // Fallback for environments without a web-app URL.
  // Use sms:// + digits (no '+') to avoid Telegram URL parser treating `sms:+...` as invalid.
  var smsDigits = e164.replace(/^\+/, '');
  return 'sms://' + smsDigits + '?body=' + encodeURIComponent(fullBody);
}

function getBrooksTelegramChatId_() {
  // Use script constants directly (no Script Properties lookup).
  var m = String(BROOKS_TELEGRAM_BOT_TOKEN || '').match(/^(\d+):/);
  var botUserId = m ? m[1] : '';
  var id = String(BROOKS_TELEGRAM_CHAT_ID || '').trim();
  if (!id) return '';
  if (botUserId && id === botUserId) return ''; // invalid: bot user id used as chat id
  return id;
}

function sendTelegramBotMessage_(htmlText, buttons) {
  try {
    var chatId = getBrooksTelegramChatId_();
    if (!chatId) {
      return {
        success: false,
        error: 'BROOKS_TELEGRAM_CHAT_ID missing or invalid (cannot be the bot user id).'
      };
    }
    const url = 'https://api.telegram.org/bot' + BROOKS_TELEGRAM_BOT_TOKEN + '/sendMessage';
    var payload = {
      chat_id: chatId,
      text: htmlText,
      parse_mode: 'HTML',
      disable_web_page_preview: false
    };
    var replyMarkup = buildTelegramReplyMarkup_(buttons);
    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      payload: payload,
      muteHttpExceptions: true
    });
    const status = response.getResponseCode();
    const body = response.getContentText() || '';
    if (status >= 200 && status < 300) {
      return { success: true };
    }
    // Fallback: retry without HTML parse mode in case Telegram rejects HTML formatting.
    var plainPayload = {
      chat_id: chatId,
      text: String(htmlText || '').replace(/<[^>]*>/g, ''),
      disable_web_page_preview: false
    };
    if (replyMarkup) plainPayload.reply_markup = replyMarkup;
    const fallbackResp = UrlFetchApp.fetch(url, {
      method: 'post',
      payload: plainPayload,
      muteHttpExceptions: true
    });
    const fbStatus = fallbackResp.getResponseCode();
    const fbBody = fallbackResp.getContentText() || '';
    if (fbStatus >= 200 && fbStatus < 300) {
      Logger.log('Scheduling Telegram send recovered via plain-text fallback');
      return { success: true };
    }
    Logger.log('Scheduling Telegram send failed: ' + status + ' ' + body + ' | fallback: ' + fbStatus + ' ' + fbBody);
    return { success: false, error: 'Telegram HTTP ' + status + ': ' + body + ' | fallback ' + fbStatus + ': ' + fbBody };
  } catch (error) {
    Logger.log('sendTelegramBotMessage_ error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

function buildTelegramDraftCard_(title, facts, draftText, linkLabel, linkUrl) {
  const factLines = (facts || [])
    .filter(function(fact) { return fact && fact.label && fact.value; })
    .map(function(fact) {
      return '<b>' + escapeTelegramHtml_(fact.label) + ':</b> ' + escapeTelegramHtml_(fact.value);
    })
    .join('\n');

  const draftBlock = draftText
    ? '\n\n<b>Suggested customer text</b>\n<pre>' + escapeTelegramHtml_(draftText) + '</pre>'
    : '';

  const linkBlock = (linkLabel && linkUrl)
    ? '\n\n<b>' + escapeTelegramHtml_(linkLabel) + ':</b> <a href="' + escapeTelegramHtml_(linkUrl) + '">Open link</a>'
    : '';

  return '<b>' + escapeTelegramHtml_(title) + '</b>'
    + (factLines ? '\n' + factLines : '')
    + draftBlock
    + linkBlock;
}

function sendBrooksTelegramDraftWithTracking_(appointmentId, batchToken, draftText, customerPhone, customerName, notificationType, title, facts, linkLabel, linkUrl, batchType) {
  const telegramHtml = buildTelegramDraftCard_(title, facts, draftText, linkLabel, linkUrl);
  var telegramButtons = [];

  // Determine action name based on batch type (default to 'invoice' for backward compatibility)
  var actionName = 'openInvoiceDraftSms';
  if (batchType === 'confirmation') {
    actionName = 'openConfirmationDraftSms';
  } else if (batchType === 'review') {
    actionName = 'openReviewDraftSms';
  }

  // Build SMS button with batch tracking parameters
  var draftUrl = buildSchedulingActionUrl_({
    action: actionName,
    batchToken: batchToken,
    appointmentId: appointmentId,
    phone: customerPhone,
    body: draftText,
    name: customerName
  });
  
  if (draftUrl) {
    telegramButtons.push({ text: 'Open Draft Text', url: draftUrl });
  }
  if (linkLabel && linkUrl) {
    telegramButtons.push({ text: String(linkLabel), url: String(linkUrl) });
  }
  
  const telegramResult = sendTelegramBotMessage_(telegramHtml, telegramButtons);
  const recipientId = getBrooksTelegramChatId_() || BROOKS_TELEGRAM_CHAT_ID || '';
  const recipient = 'telegram:' + recipientId;
  
  if (telegramResult.success) {
    logNotification(appointmentId, recipient, notificationType, 'Sent', title);
    return { success: true, message: 'Telegram draft sent to Brooks' };
  }
  logNotification(appointmentId, recipient, notificationType, 'Failed', telegramResult.error || 'Telegram send failed');
  return { success: false, error: telegramResult.error || 'Telegram send failed' };
}

function writeClosingOptionsCell_(sheet, rowNumber, closingOptions) {
  if (!sheet || !rowNumber) return;
  var headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  var col = headers.indexOf('ClosingOptions');
  if (col < 0) {
    var last = sheet.getLastColumn();
    sheet.getRange(1, last + 1).setValue('ClosingOptions');
    col = last;
  }
  var value = '';
  if (closingOptions && typeof closingOptions === 'object') {
    value = JSON.stringify(closingOptions);
  } else if (typeof closingOptions === 'string' && String(closingOptions).trim()) {
    value = closingOptions;
  }
  sheet.getRange(rowNumber, col + 1).setValue(value);
}

function parseClosingOptionsCell_(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch (e) {
    return null;
  }
}

function maybeSendAppointmentScheduledTelegram_(data, appointmentId) {
  var status = String((data && data.status) || 'Scheduled').trim();
  if (status !== 'Scheduled') return { success: true, skipped: true };
  var opts = data && data.closingOptions;
  if (typeof opts === 'string') opts = parseClosingOptionsCell_(opts);
  var when = [data.date || '', data.time || ''].filter(Boolean).join(' ');
  var facts = [
    { label: 'Customer', value: data.customerName || '' },
    { label: 'Phone', value: data.customerPhone || '' },
    { label: 'Address', value: data.address || '' },
    { label: 'When', value: when },
    { label: 'Service', value: data.serviceType || '' },
    { label: 'Crew', value: data.assignedTo || '' }
  ];
  if (String(data.serviceType || '') === 'Closing' && opts) {
    var hotTub = !!(opts.hotTubWinterization || opts.mode === 'hotTub');
    var quote = opts.quotedAmount != null ? opts.quotedAmount : '';
    if (hotTub) {
      facts.push({ label: 'Closing', value: 'Hot tub winterization' + (quote !== '' ? ' · $' + quote : '') });
    } else {
      var bits = ['Pool closing'];
      if (opts.heater) bits.push('heater');
      if (opts.spilloverSpa) bits.push('spillover/spa');
      facts.push({ label: 'Closing', value: bits.join(', ') + (quote !== '' ? ' · $' + quote : '') });
    }
  }
  var draftText = 'Scheduled: ' + (data.serviceType || 'Appointment') +
    (data.customerName ? ' for ' + data.customerName : '') +
    (when ? ' on ' + when : '') +
    (data.address ? ' at ' + data.address : '') + '.';
  return sendBrooksTelegramDraft_(
    appointmentId,
    'appointment_scheduled',
    'Appointment scheduled',
    facts,
    draftText,
    'Open schedule',
    ''
  );
}

function sendBrooksTelegramDraft_(appointmentId, notificationType, title, facts, draftText, linkLabel, linkUrl) {
  const telegramHtml = buildTelegramDraftCard_(title, facts, draftText, linkLabel, linkUrl);
  var customerName = '';
  var customerPhone = '';
  (facts || []).forEach(function(fact) {
    if (!fact || !fact.label) return;
    var label = String(fact.label).toLowerCase();
    if (!customerName && label === 'customer') {
      customerName = fact.value || '';
    }
    if (!customerPhone && label.indexOf('phone') !== -1) {
      customerPhone = fact.value || '';
    }
  });
  var telegramButtons = [];
  var draftUrl = buildTelegramSmsRedirectUrl_(customerPhone, draftText, customerName);
  if (draftUrl) {
    telegramButtons.push({ text: 'Open Draft Text', url: draftUrl });
  }
  if (linkLabel && linkUrl) {
    telegramButtons.push({ text: String(linkLabel), url: String(linkUrl) });
  }
  const telegramResult = sendTelegramBotMessage_(telegramHtml, telegramButtons);
  const recipientId = getBrooksTelegramChatId_() || BROOKS_TELEGRAM_CHAT_ID || '';
  const recipient = 'telegram:' + recipientId;
  if (telegramResult.success) {
    logNotification(appointmentId, recipient, notificationType, 'Sent', title);
    return { success: true, message: 'Telegram draft sent to Brooks' };
  }
  logNotification(appointmentId, recipient, notificationType, 'Failed', telegramResult.error || 'Telegram send failed');
  return { success: false, error: telegramResult.error || 'Telegram send failed' };
}

/**
 * Send review request email directly to the customer
 */
function sendReviewRequest(appointmentId) {
  const sheet = getOrCreateSheet(APPOINTMENTS_SHEET);
  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === appointmentId) {
      const customerEmail = values[i][4];
      const customerName = values[i][3];
      const customerPhone = values[i][5];
      const serviceType = values[i][7];
      const serviceDate = formatSheetDate(values[i][8]);
      const amountPaid = values[i][15] || 0;

      if (!customerEmail) return { success: false, error: 'No email address for this customer' };

      const companyName = 'A Quality Pool Company';
      const firstName = (customerName || 'there').split(' ')[0];

      // Check if customer has a pool (for special offer)
      const customerTagsResult = getCustomerTags(customerEmail);
      const hasPool = customerTagsResult.success && customerTagsResult.tags && customerTagsResult.tags.includes('has-pool');
      let poolOfferIncluded = false;

      let textMessage = '';
      let subject = '';
      if (serviceType === 'Snow Removal') {
        // Snow removal gets the full cross-sell message (same as text)
        textMessage = 'Hey ' + firstName + '! 👋 Thanks for trusting us with your snow removal this season — we really appreciate it! '
          + 'Just wanted to let you know that when the snow melts, we stay busy year-round with pools, excavation, and concrete work. '
          + 'If you or anyone you know ever needs help with a project, we\'d love to be your go-to!';
        
        // Add $50 off pool service offer if customer has a pool
        if (hasPool) {
          textMessage += '\n\n💰 SPECIAL OFFER: Since you have a pool, we\'d like to offer you $50 off your next pool service (opening, closing, or regular service)! Just mention this email when you book.';
          poolOfferIncluded = true;
        }
        
        textMessage += '\n\nIf you have a minute, we\'d be so grateful if you could leave us a quick review — it really helps us reach more people who need quality service:\n'
          + 'Google: ' + GOOGLE_REVIEW_URL + '\n'
          + 'Facebook: ' + FACEBOOK_REVIEW_URL + '\n\n'
          + 'Thank you so much, and don\'t hesitate to reach out anytime! 🙏';
        subject = companyName + ' — Thanks for Choosing Us, ' + firstName + '!';
      } else {
        // All other services — simple, friendly message
        textMessage = 'Hey ' + firstName + '! 👋\n\n'
          + 'We hope your ' + (serviceType || 'service').toLowerCase() + ' was wonderful and everything turned out exactly how you wanted!\n\n'
          + 'If you have a quick moment, we\'d really appreciate a review — it helps us continue serving great people like you:\n'
          + 'Google: ' + GOOGLE_REVIEW_URL + '\n'
          + 'Facebook: ' + FACEBOOK_REVIEW_URL + '\n\n'
          + 'Thank you for choosing ' + companyName + '! 🙏';
        subject = companyName + ' — We Hope Your Service Was Wonderful!';
      }

      const htmlBody = buildCustomerReviewEmail(customerName, serviceType, serviceDate, amountPaid, companyName, GOOGLE_REVIEW_URL, FACEBOOK_REVIEW_URL, textMessage, hasPool && serviceType === 'Snow Removal');

      try {
        MailApp.sendEmail({ to: customerEmail, subject: subject, htmlBody: htmlBody });
        // Mark review as sent
        sheet.getRange(i + 1, 22).setValue('Yes'); // col 22 = ReviewSent
        
        // Add note about pool offer if included
        if (poolOfferIncluded) {
          const existingNotes = values[i][16] || ''; // col 16 = Notes
          const offerNote = '[POOL OFFER] $50 off pool service offer included in review request on ' + new Date().toLocaleDateString();
          const updatedNotes = existingNotes ? existingNotes + '\n' + offerNote : offerNote;
          sheet.getRange(i + 1, 17).setValue(updatedNotes); // col 17 = Notes
        }
        
        logNotification(appointmentId, customerEmail, 'review_request', 'Sent', subject + (poolOfferIncluded ? ' [POOL OFFER]' : ''));
        return { success: true, message: 'Review request sent to ' + customerEmail + (poolOfferIncluded ? ' (with $50 pool offer)' : '') };
      } catch (error) {
        logNotification(appointmentId, customerEmail, 'review_request', 'Failed', error.toString());
        return { success: false, error: 'Failed to send: ' + error.toString() };
      }
    }
  }
  return { success: false, error: 'Appointment not found' };
}

/** Build the customer-facing review email using the same text as the SMS */
function buildCustomerReviewEmail(name, serviceType, serviceDate, amountPaid, companyName, googleReviewUrl, facebookReviewUrl, textMessage, showPoolOffer) {
  const paid = amountPaid ? '$' + parseFloat(amountPaid).toFixed(2) : '';
  const isSnow = serviceType === 'Snow Removal';
  const headerBg = isSnow ? 'linear-gradient(135deg,#475569,#64748b)' : 'linear-gradient(135deg,#f59e0b,#d97706)';
  const firstName = (name || 'there').split(' ')[0];

  // Convert the text message into HTML paragraphs
  const messageHtml = textMessage
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" style="color:#0369a1;font-weight:700;text-decoration:underline;">$1</a>')
    .replace(/\n\n/g, '</p><p style="font-size:15px;color:#374151;line-height:1.8;margin:0 0 16px;">')
    .replace(/\n/g, '<br>');

  // Pool offer box (if applicable)
  const poolOfferBox = showPoolOffer ? 
    '<div style="background:linear-gradient(135deg,#10b981,#059669);border-radius:12px;padding:24px;margin:24px 0;text-align:center;box-shadow:0 4px 12px rgba(16,185,129,0.3);">'
    + '<div style="font-size:36px;margin-bottom:8px;">💰</div>'
    + '<h2 style="color:white;margin:0 0 8px;font-size:22px;font-weight:800;">Special Offer: $50 Off Pool Service!</h2>'
    + '<p style="color:rgba(255,255,255,0.95);margin:0 0 12px;font-size:16px;line-height:1.6;">Since you have a pool, we\'d like to offer you <strong>$50 off</strong> your next pool service (opening, closing, or regular service)!</p>'
    + '<p style="color:rgba(255,255,255,0.9);margin:0;font-size:14px;">Just mention this email when you book. We can\'t wait to help keep your pool in perfect shape! 🏊‍♂️</p>'
    + '</div>' : '';

  return '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">'
    // Header
    + '<div style="background:' + headerBg + ';padding:40px 30px;text-align:center;border-radius:12px 12px 0 0;">'
    + '<h1 style="color:white;margin:0;font-size:26px;font-weight:800;">Thanks, ' + firstName + '!</h1>'
    + '<p style="color:rgba(255,255,255,0.9);margin:8px 0 0;font-size:16px;">We appreciate your business</p>'
    + '</div>'
    // Body — same message as text
    + '<div style="padding:30px;border:1px solid #e5e7eb;border-top:none;">'
    + '<p style="font-size:15px;color:#374151;line-height:1.8;margin:0 0 16px;">' + messageHtml + '</p>'
    + poolOfferBox
    // Big review buttons
    + '<div style="text-align:center;margin:30px 0;">'
    + '<a href="' + googleReviewUrl + '" style="display:inline-block;background:linear-gradient(135deg,#f59e0b,#d97706);color:white;padding:18px 50px;border-radius:10px;text-decoration:none;font-size:20px;font-weight:800;letter-spacing:0.5px;box-shadow:0 6px 20px rgba(245,158,11,0.4);margin:0 8px 12px 0;">'
    + '⭐ Leave a Google Review</a>'
    + '<a href="' + facebookReviewUrl + '" style="display:inline-block;background:linear-gradient(135deg,#1877f2,#4267b2);color:white;padding:18px 50px;border-radius:10px;text-decoration:none;font-size:20px;font-weight:800;letter-spacing:0.5px;box-shadow:0 6px 20px rgba(24,119,242,0.4);margin:0 0 12px 0;">'
    + '👍 Leave a Facebook Review</a></div>'
    + '<div style="text-align:center;margin:16px 0;font-size:32px;">⭐⭐⭐⭐⭐</div>'
    + '<p style="font-size:13px;color:#9ca3af;text-align:center;">It only takes 30 seconds and means the world to us!</p>'
    + '</div>'
    // Footer
    + '<div style="background:#f9fafb;padding:20px;text-align:center;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;">'
    + '<p style="color:#6b7280;font-size:13px;margin:0 0 4px;">Thank you for being a valued customer!</p>'
    + '<p style="color:#9ca3af;font-size:12px;margin:0;">' + companyName + '</p>'
    + '</div></div>';
}

/**
 * Send Brooks a Telegram review-request draft with prefilled customer text.
 */
function sendReviewTextToBrooks(appointmentId) {
  const sheet = getOrCreateSheet(APPOINTMENTS_SHEET);
  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === appointmentId) {
      const customerName = values[i][3];
      const customerEmail = values[i][4];
      const customerPhone = values[i][5];
      const serviceType = values[i][7];
      const serviceDate = formatSheetDate(values[i][8]);
      const amountPaid = values[i][15] || 0;
      const address = values[i][6];

      const firstName = (customerName || 'there').split(' ')[0];

      // Check if customer has a pool (for special offer)
      const customerTagsResult = getCustomerTags(customerEmail);
      const hasPool = customerTagsResult.success && customerTagsResult.tags && customerTagsResult.tags.includes('has-pool');

      // Build the text message template based on service type
      let textMessage = '';
      if (serviceType === 'Snow Removal') {
        textMessage = 'Hey ' + firstName + '! 👋 Thanks for trusting us with your snow removal this season — we really appreciate it! '
          + 'Just wanted to let you know that when the snow melts, we stay busy year-round with pools, excavation, and concrete work. '
          + 'If you or anyone you know ever needs help with a project, we\'d love to be your go-to!';
        
        // Add $50 off pool service offer if customer has a pool
        if (hasPool) {
          textMessage += '\n\n💰 SPECIAL OFFER: Since you have a pool, we\'d like to offer you $50 off your next pool service (opening, closing, or regular service)! Just mention this text when you book.';
        }
        
        textMessage += '\n\nIf you have a minute, we\'d be so grateful if you could leave us a quick review — it really helps us reach more people who need quality service:\n'
          + 'Google: ' + GOOGLE_REVIEW_URL + '\n'
          + 'Facebook: ' + FACEBOOK_REVIEW_URL + '\n\n'
          + 'Thank you so much, and don\'t hesitate to reach out anytime! 🙏';
      } else {
        textMessage = 'Hey ' + firstName + '! 👋 Thank you for choosing us for your ' + (serviceType || 'service').toLowerCase() + ' — we hope everything turned out great! '
          + 'If you have a quick minute, we\'d really appreciate it if you could leave us a review. '
          + 'Your feedback helps us grow and reach more people who need quality service:\n'
          + 'Google: ' + GOOGLE_REVIEW_URL + '\n'
          + 'Facebook: ' + FACEBOOK_REVIEW_URL + '\n\n'
          + 'Thank you so much! 🙏';
      }

      // Create review draft batch for tracking
      const batch = createReviewDraftBatch_(appointmentId, customerName, customerPhone, customerEmail, serviceType, serviceDate);
      const batchToken = batch.token;

      const telegramResult = sendBrooksTelegramDraftWithTracking_(
        appointmentId,
        batchToken,
        textMessage,
        customerPhone,
        customerName,
        'review_text_template',
        'Review request draft',
        [
          { label: 'Customer', value: customerName || 'Customer' },
          { label: 'Phone', value: customerPhone || 'N/A' },
          { label: 'Email', value: customerEmail || 'N/A' },
          { label: 'Service', value: serviceType || 'Service' },
          { label: 'Service date', value: serviceDate || 'N/A' },
          { label: 'Amount paid', value: amountPaid ? ('$' + parseFloat(amountPaid).toFixed(2)) : '$0.00' },
          { label: 'Address', value: address || 'N/A' }
        ],
        '',
        '',
        'review'
      );

      if (telegramResult.success) {
        sheet.getRange(i + 1, 22).setValue('Yes'); // col 22 = ReviewSent
        return { success: true, message: 'Telegram review draft sent to Brooks' };
      }
      return { success: false, error: telegramResult.error || 'Telegram send failed' };
    }
  }
  return { success: false, error: 'Appointment not found' };
}

/**
 * Send BOTH: review email to customer + text template to Brooks
 */
function sendReviewBoth(appointmentId) {
  const result1 = sendReviewTextToBrooks(appointmentId);
  // Reset ReviewSent so sendReviewRequest can set it
  const result2 = sendReviewRequest(appointmentId);
  return {
    success: result1.success || result2.success,
    message: (result1.success ? '✉️ Telegram draft sent to Brooks. ' : '') + (result2.success ? '📧 Review email sent to customer.' : (result2.error || '')),
    brooksResult: result1,
    customerResult: result2
  };
}

// Old buildReviewEmail removed — replaced by buildCustomerReviewEmail

// getMainCustomers is now unified into getCustomers() above
// (Both read from the same "Customers" sheet)

// ===========================================================================
// STATUS NOTES - Timestamped updates stored in the Status cell note (Google Sheets)
// ===========================================================================
function addAppointmentNote(appointmentId, note) {
  const sheet = getOrCreateSheet(APPOINTMENTS_SHEET);
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || [];
  const statusCol = headers.indexOf('Status');
  const col = statusCol !== -1 ? statusCol + 1 : 16; // 1-based; fallback column 16

  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === appointmentId) {
      const statusCell = sheet.getRange(i + 1, col);
      const existing = statusCell.getNote();
      const timestamp = new Date().toLocaleString();
      const newNote = (existing ? existing + '\n───────────────\n' : '') + timestamp + ':\n' + note;
      statusCell.setNote(newNote);
      return { success: true, message: 'Note added' };
    }
  }
  return { success: false, error: 'Appointment not found' };
}

function getAppointmentNotes(appointmentId) {
  const sheet = getOrCreateSheet(APPOINTMENTS_SHEET);
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || [];
  const statusCol = headers.indexOf('Status');
  const col = statusCol !== -1 ? statusCol + 1 : 16;

  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === appointmentId) {
      const note = sheet.getRange(i + 1, col).getNote();
      return { success: true, note: note || '' };
    }
  }
  return { success: false, note: '' };
}

/** Quick status update — no need to open full edit form. Reason/completion notes are stored in Status cell note and (when Completed) appended to Internal Notes. */
function quickUpdateStatus(appointmentId, newStatus, reason) {
  try {
    const sheet = getOrCreateSheet(APPOINTMENTS_SHEET);
    const values = sheet.getDataRange().getValues();
    const headers = values[0] || [];
    const now = new Date().toISOString();
    const statusCol = headers.indexOf('Status');
    const notesCol = headers.indexOf('Notes');
    const updatedAtCol = headers.indexOf('UpdatedAt');
    const calEventIdCol = headers.indexOf('CalendarEventID');
    const statusCol1 = statusCol !== -1 ? statusCol + 1 : 16;
    const notesCol1 = notesCol !== -1 ? notesCol + 1 : 19;
    const updatedAtCol1 = updatedAtCol !== -1 ? updatedAtCol + 1 : 27;
    const calEventIdIdx = calEventIdCol !== -1 ? calEventIdCol : 22;

    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === appointmentId) {
        const row = i + 1;
        const oldStatus = (statusCol !== -1 ? values[i][statusCol] : values[i][13]) || '';
        sheet.getRange(row, statusCol1).setValue(newStatus);
        sheet.getRange(row, updatedAtCol1).setValue(now);

        // Update calendar event title to show status
        const calEventId = values[i][calEventIdIdx];
        if (calEventId) {
          try {
            const calendar = CalendarApp.getCalendarById(CALENDAR_ID) || CalendarApp.getDefaultCalendar();
            const event = calendar.getEventById(calEventId);
            if (event) {
              let title = event.getTitle().replace(/^(✅|❌|🔄|⏸️)\s*/, '').replace(/^(CANCELLED|COMPLETED|RESCHEDULED):\s*/i, '');
              if (newStatus === 'Completed') title = '✅ ' + title;
              else if (newStatus === 'Cancelled') title = '❌ CANCELLED: ' + title;
              else if (newStatus === 'Rescheduled') title = '🔄 ' + title;
              event.setTitle(title);
              if (reason) {
                var existingDesc = event.getDescription() || '';
                var statusLine = '\n\nStatus Update (' + new Date().toLocaleString() + '):\n' + oldStatus + ' → ' + newStatus + '\n' + reason;
                event.setDescription(existingDesc + statusLine);
              }
            }
          } catch (calErr) {
            Logger.log('Calendar update error: ' + calErr);
          }
        }

        // Add timestamped note if reason/completion notes provided
        if (reason) {
          const statusCell = sheet.getRange(row, statusCol1);
          const existing = statusCell.getNote();
          const timestamp = new Date().toLocaleString();
          const noteLabel = newStatus === 'Completed' ? 'Completion notes' : 'Reason';
          const noteText = (existing ? existing + '\n───────────────\n' : '') + timestamp + ':\nStatus: ' + oldStatus + ' → ' + newStatus + '\n' + noteLabel + ': ' + reason;
          statusCell.setNote(noteText);

          // When marking Completed, also append to Internal Notes column so it shows in detail view
          if (newStatus === 'Completed' && notesCol1) {
            const existingNotes = (notesCol !== -1 ? values[i][notesCol] : values[i][18]) || '';
            const completionLine = 'Completed ' + timestamp + ': ' + reason;
            const updatedNotes = existingNotes ? existingNotes + '\n\n' + completionLine : completionLine;
            sheet.getRange(row, notesCol1).setValue(updatedNotes);
          }
        }

        // Auto-send linked invoice 10 minutes after completion
        if (newStatus === 'Completed') {
          try {
            queueAutoInvoiceForAppointment_(appointmentId, 10, 'quickUpdateStatus');
          } catch (qErr) {
            Logger.log('⚠️ queueAutoInvoiceForAppointment_ failed: ' + qErr);
          }
        }

        try {
          const logLine = 'Status changed: ' + oldStatus + ' → ' + newStatus + (reason ? (' | Note: ' + reason) : '');
          appendCalendarEventLogForAppointment_(appointmentId, logLine);
        } catch (auditErr) {
          Logger.log('quickUpdateStatus calendar audit append failed: ' + auditErr.toString());
        }

        return { success: true, message: 'Status updated to ' + newStatus, oldStatus: oldStatus };
      }
    }
    return { success: false, error: 'Appointment not found' };
  } catch (error) {
    Logger.log('Error in quickUpdateStatus: ' + error);
    return { success: false, error: error.toString() };
  }
}

function getOrCreateRouteMileageSheet_() {
  return getOrCreateSheet(ROUTE_MILEAGE_SHEET, [
    'LogID', 'CompanyID', 'RouteDate', 'Technician', 'OriginAddress',
    'StopsCount', 'TotalMiles', 'TotalMinutes', 'StopDetailsJson',
    'Notes', 'SavedBy', 'SavedAt'
  ]);
}

function saveDailyMileageLog(payload) {
  payload = payload || {};
  try {
    var companyId = String(payload.companyId || DEFAULT_COMPANY_ID);
    var routeDate = String(payload.routeDate || '').trim();
    if (!routeDate) routeDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var technician = String(payload.technician || '').trim();
    var originAddress = String(payload.originAddress || DEFAULT_ROUTE_ORIGIN_ADDRESS).trim();
    var stopsCount = parseInt(payload.stopsCount || 0, 10) || 0;
    var totalMiles = Number(payload.totalMiles || 0);
    var totalMinutes = parseInt(payload.totalMinutes || 0, 10) || 0;
    var stopDetailsJson = '';
    try {
      stopDetailsJson = JSON.stringify(payload.stops || []);
    } catch (_) {
      stopDetailsJson = '[]';
    }
    var notes = String(payload.notes || '').trim();
    var savedBy = '';
    try { savedBy = Session.getActiveUser().getEmail() || ''; } catch (_) {}
    var savedAt = new Date().toISOString();

    var sheet = getOrCreateRouteMileageSheet_();
    var data = sheet.getDataRange().getValues();
    var headers = data[0] || [];
    var colCompany = headers.indexOf('CompanyID');
    var colDate = headers.indexOf('RouteDate');
    var colTech = headers.indexOf('Technician');
    var colOrigin = headers.indexOf('OriginAddress');
    var colStops = headers.indexOf('StopsCount');
    var colMiles = headers.indexOf('TotalMiles');
    var colMinutes = headers.indexOf('TotalMinutes');
    var colStopsJson = headers.indexOf('StopDetailsJson');
    var colNotes = headers.indexOf('Notes');
    var colSavedBy = headers.indexOf('SavedBy');
    var colSavedAt = headers.indexOf('SavedAt');

    // Upsert by company + date + technician
    for (var i = 1; i < data.length; i++) {
      var rowCompany = String(data[i][colCompany] || '');
      var rowDate = String(data[i][colDate] || '');
      var rowTech = String(data[i][colTech] || '');
      if (rowCompany === companyId && rowDate === routeDate && rowTech === technician) {
        var rowNum = i + 1;
        if (colOrigin >= 0) sheet.getRange(rowNum, colOrigin + 1).setValue(originAddress);
        if (colStops >= 0) sheet.getRange(rowNum, colStops + 1).setValue(stopsCount);
        if (colMiles >= 0) sheet.getRange(rowNum, colMiles + 1).setValue(totalMiles);
        if (colMinutes >= 0) sheet.getRange(rowNum, colMinutes + 1).setValue(totalMinutes);
        if (colStopsJson >= 0) sheet.getRange(rowNum, colStopsJson + 1).setValue(stopDetailsJson);
        if (colNotes >= 0) sheet.getRange(rowNum, colNotes + 1).setValue(notes);
        if (colSavedBy >= 0) sheet.getRange(rowNum, colSavedBy + 1).setValue(savedBy);
        if (colSavedAt >= 0) sheet.getRange(rowNum, colSavedAt + 1).setValue(savedAt);
        return { success: true, updated: true, message: 'Daily mileage updated' };
      }
    }

    var logId = 'RM-' + Date.now();
    sheet.appendRow([
      logId, companyId, routeDate, technician, originAddress,
      stopsCount, totalMiles, totalMinutes, stopDetailsJson,
      notes, savedBy, savedAt
    ]);
    return { success: true, updated: false, message: 'Daily mileage saved', logId: logId };
  } catch (err) {
    Logger.log('❌ saveDailyMileageLog error: ' + err.toString());
    return { success: false, error: err.toString() };
  }
}

function getDailyMileageLog(routeDate, technician, companyId) {
  try {
    var cid = String(companyId || DEFAULT_COMPANY_ID);
    var dateStr = String(routeDate || '').trim();
    var tech = String(technician || '').trim();
    var sheet = getOrCreateRouteMileageSheet_();
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return { success: true, entries: [] };
    var headers = data[0] || [];
    var cCompany = headers.indexOf('CompanyID');
    var cDate = headers.indexOf('RouteDate');
    var cTech = headers.indexOf('Technician');
    var cOrigin = headers.indexOf('OriginAddress');
    var cStops = headers.indexOf('StopsCount');
    var cMiles = headers.indexOf('TotalMiles');
    var cMinutes = headers.indexOf('TotalMinutes');
    var cSavedAt = headers.indexOf('SavedAt');
    var out = [];
    for (var i = 1; i < data.length; i++) {
      if (cCompany >= 0 && String(data[i][cCompany] || '') !== cid) continue;
      if (dateStr && cDate >= 0 && String(data[i][cDate] || '') !== dateStr) continue;
      if (tech && cTech >= 0 && String(data[i][cTech] || '') !== tech) continue;
      out.push({
        routeDate: cDate >= 0 ? String(data[i][cDate] || '') : '',
        technician: cTech >= 0 ? String(data[i][cTech] || '') : '',
        originAddress: cOrigin >= 0 ? String(data[i][cOrigin] || '') : '',
        stopsCount: cStops >= 0 ? Number(data[i][cStops] || 0) : 0,
        totalMiles: cMiles >= 0 ? Number(data[i][cMiles] || 0) : 0,
        totalMinutes: cMinutes >= 0 ? Number(data[i][cMinutes] || 0) : 0,
        savedAt: cSavedAt >= 0 ? String(data[i][cSavedAt] || '') : ''
      });
    }
    return { success: true, entries: out };
  } catch (err) {
    return { success: false, entries: [], error: err.toString() };
  }
}

function getOrCreateAutoInvoiceQueueSheet_() {
  return getOrCreateSheet(AUTO_INVOICE_QUEUE_SHEET, [
    'QueueID', 'CompanyID', 'AppointmentID', 'InvoiceID', 'CustomerEmail',
    'DueAt', 'Status', 'Source', 'CreatedAt', 'ProcessedAt', 'LastError'
  ]);
}

function queueAutoInvoiceForAppointment_(appointmentId, delayMinutes, source) {
  if (!appointmentId) return { success: false, error: 'appointmentId required' };
  var delay = parseInt(delayMinutes || 10, 10);
  if (isNaN(delay) || delay < 1) delay = 10;

  var apptSheet = getOrCreateSheet(APPOINTMENTS_SHEET, getAppointmentsHeaders());
  var vals = apptSheet.getDataRange().getValues();
  if (vals.length < 2) return { success: false, error: 'No appointments' };
  var headers = vals[0] || [];
  var cId = headers.indexOf('ID');
  var cCompany = headers.indexOf('CompanyID');
  var cStatus = headers.indexOf('Status');
  var cInvoice = headers.indexOf('LinkedInvoiceID');
  var cEmail = headers.indexOf('CustomerEmail');
  if (cInvoice < 0) cInvoice = headers.indexOf('Linked Invoice ID');

  var rowData = null;
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][cId] || '') === String(appointmentId)) {
      rowData = vals[i];
      break;
    }
  }
  if (!rowData) return { success: false, error: 'Appointment not found' };

  var status = String(rowData[cStatus] || '');
  var invoiceId = String(rowData[cInvoice] || '').trim();
  var customerEmail = String(rowData[cEmail] || '').trim();
  var companyId = String(rowData[cCompany] || DEFAULT_COMPANY_ID);
  if (status !== 'Completed') return { success: false, error: 'Appointment is not completed' };
  if (!invoiceId) return { success: false, error: 'No linked invoice on appointment' };
  if (!customerEmail) return { success: false, error: 'No customer email on appointment' };

  var qSheet = getOrCreateAutoInvoiceQueueSheet_();
  var qVals = qSheet.getDataRange().getValues();
  var qHeaders = qVals[0] || [];
  var qAppt = qHeaders.indexOf('AppointmentID');
  var qInvoice = qHeaders.indexOf('InvoiceID');
  var qStatus = qHeaders.indexOf('Status');
  for (var q = 1; q < qVals.length; q++) {
    var existingAppt = String(qVals[q][qAppt] || '');
    var existingInv = String(qVals[q][qInvoice] || '');
    var existingStatus = String(qVals[q][qStatus] || '');
    if (existingAppt === appointmentId && existingInv === invoiceId && (existingStatus === 'Pending' || existingStatus === 'Sent')) {
      return { success: true, queued: false, message: 'Already queued/sent for this appointment' };
    }
  }

  var dueAt = new Date(Date.now() + delay * 60 * 1000).toISOString();
  qSheet.appendRow([
    'AQI-' + Date.now(),
    companyId,
    appointmentId,
    invoiceId,
    customerEmail,
    dueAt,
    'Pending',
    String(source || 'manual'),
    new Date().toISOString(),
    '',
    ''
  ]);

  ensureAutoInvoiceQueueTrigger_();
  return { success: true, queued: true, message: 'Invoice queued for auto-send', dueAt: dueAt };
}

function processQueuedAppointmentInvoices() {
  var out = { success: true, processed: 0, sent: 0, failed: 0, skipped: 0 };
  try {
    var sheet = getOrCreateAutoInvoiceQueueSheet_();
    var vals = sheet.getDataRange().getValues();
    if (vals.length < 2) return out;
    var h = vals[0] || [];
    var cAppt = h.indexOf('AppointmentID');
    var cInvoice = h.indexOf('InvoiceID');
    var cEmail = h.indexOf('CustomerEmail');
    var cDue = h.indexOf('DueAt');
    var cStatus = h.indexOf('Status');
    var cProcessedAt = h.indexOf('ProcessedAt');
    var cErr = h.indexOf('LastError');
    var nowMs = Date.now();

    for (var i = 1; i < vals.length; i++) {
      var status = String(vals[i][cStatus] || '');
      if (status !== 'Pending') continue;
      var dueStr = String(vals[i][cDue] || '');
      var dueMs = new Date(dueStr).getTime();
      if (!dueMs || dueMs > nowMs) continue;

      out.processed++;
      var rowNum = i + 1;
      var appointmentId = String(cAppt >= 0 ? (vals[i][cAppt] || '') : '').trim();
      var invoiceId = String(vals[i][cInvoice] || '').trim();
      var customerEmail = String(vals[i][cEmail] || '').trim();
      if (!invoiceId || !customerEmail) {
        sheet.getRange(rowNum, cStatus + 1).setValue('Skipped');
        sheet.getRange(rowNum, cProcessedAt + 1).setValue(new Date().toISOString());
        sheet.getRange(rowNum, cErr + 1).setValue('Missing invoice/customer email');
        out.skipped++;
        continue;
      }

      var res = sendInvoiceWithStripe(invoiceId, customerEmail, appointmentId);
      if (res && res.success) {
        sheet.getRange(rowNum, cStatus + 1).setValue('Sent');
        sheet.getRange(rowNum, cProcessedAt + 1).setValue(new Date().toISOString());
        sheet.getRange(rowNum, cErr + 1).setValue('');
        out.sent++;
      } else {
        sheet.getRange(rowNum, cStatus + 1).setValue('Failed');
        sheet.getRange(rowNum, cProcessedAt + 1).setValue(new Date().toISOString());
        sheet.getRange(rowNum, cErr + 1).setValue((res && res.error) ? String(res.error) : 'Unknown send error');
        out.failed++;
      }
    }
    return out;
  } catch (err) {
    out.success = false;
    out.error = err.toString();
    return out;
  }
}

function ensureAutoInvoiceQueueTrigger_() {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'processQueuedAppointmentInvoices') {
        return;
      }
    }
    ScriptApp.newTrigger('processQueuedAppointmentInvoices')
      .timeBased()
      .everyMinutes(5)
      .create();
  } catch (e) {
    Logger.log('ensureAutoInvoiceQueueTrigger_ error: ' + e.toString());
  }
}

function setupAutoInvoiceQueueTrigger() {
  try {
    ensureAutoInvoiceQueueTrigger_();
    return { success: true, message: 'Auto-invoice trigger ensured (every 5 minutes)' };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

// ===========================================================================
// TECHNICIAN / CREW MANAGEMENT
// ===========================================================================
const TECHNICIANS_SHEET = 'Technicians';

// Technicians Sheet Layout:
//  A: TechID         — auto-generated unique ID
//  B: CompanyID      — company this tech belongs to
//  C: Name           — full name
//  D: Phone          — primary phone
//  E: Email          — email address
//  F: Role           — Owner, Lead Tech, Technician, Helper, Subcontractor
//  G: HourlyRate     — pay rate (for future payroll/cost tracking)
//  H: ServiceTypes   — comma-separated: Pool Service,Snow Removal,Installation,Renovation
//  I: Color          — hex color for calendar display
//  J: Active         — Yes / No
//  K: HireDate       — when they started
//  L: Notes          — internal notes
//  M: CreatedAt      — timestamp
//  N: UpdatedAt      — timestamp
//  O: Metrics JSON   — { jobsCompleted, hoursWorked, revenue, avgRating, ... }
//  P: Schedule JSON  — { availability, defaultHours, dayOff, ... }
//  Q: Custom JSON    — { certifications, vehicleInfo, emergencyContact, ... }

const TECH_HEADERS = [
  'TechID', 'CompanyID', 'Name', 'Phone', 'Email', 'Role',
  'HourlyRate', 'ServiceTypes', 'Color', 'Active', 'HireDate',
  'Notes', 'CreatedAt', 'UpdatedAt',
  'Metrics JSON', 'Schedule JSON', 'Custom JSON'
];

const TECH_COL = {
  ID: 0, COMPANY_ID: 1, NAME: 2, PHONE: 3, EMAIL: 4, ROLE: 5,
  HOURLY_RATE: 6, SERVICE_TYPES: 7, COLOR: 8, ACTIVE: 9, HIRE_DATE: 10,
  NOTES: 11, CREATED_AT: 12, UPDATED_AT: 13,
  METRICS_JSON: 14, SCHEDULE_JSON: 15, CUSTOM_JSON: 16
};

function initializeTechniciansSheet() {
  const sheet = getOrCreateSheet(TECHNICIANS_SHEET, TECH_HEADERS);
  Logger.log('  ✅ Technicians sheet ready');
  return sheet;
}

function saveTechnician(data) {
  const sheet = getOrCreateSheet(TECHNICIANS_SHEET, TECH_HEADERS);
  const values = sheet.getDataRange().getValues();
  const now = new Date().toISOString();
  const nameLower = (data.name || '').toLowerCase().trim();

  // Update if exists (match by name+company or by techId)
  for (let i = 1; i < values.length; i++) {
    const matchById = data.techId && values[i][TECH_COL.ID] === data.techId;
    const matchByName = (values[i][TECH_COL.NAME] || '').toLowerCase().trim() === nameLower &&
                        (!data.companyId || values[i][TECH_COL.COMPANY_ID] === data.companyId);
    if (matchById || matchByName) {
      const row = i + 1;
      if (data.name)         sheet.getRange(row, TECH_COL.NAME + 1).setValue(data.name);
      if (data.phone !== undefined) sheet.getRange(row, TECH_COL.PHONE + 1).setValue(data.phone || '');
      if (data.email !== undefined) sheet.getRange(row, TECH_COL.EMAIL + 1).setValue(data.email || '');
      if (data.role)         sheet.getRange(row, TECH_COL.ROLE + 1).setValue(data.role);
      if (data.hourlyRate !== undefined) sheet.getRange(row, TECH_COL.HOURLY_RATE + 1).setValue(data.hourlyRate || 0);
      if (data.serviceTypes) sheet.getRange(row, TECH_COL.SERVICE_TYPES + 1).setValue(data.serviceTypes);
      if (data.color)        sheet.getRange(row, TECH_COL.COLOR + 1).setValue(data.color);
      if (data.active !== undefined) sheet.getRange(row, TECH_COL.ACTIVE + 1).setValue(data.active ? 'Yes' : 'No');
      if (data.notes !== undefined)  sheet.getRange(row, TECH_COL.NOTES + 1).setValue(data.notes || '');
      sheet.getRange(row, TECH_COL.UPDATED_AT + 1).setValue(now);
      return { success: true, message: 'Technician updated', techId: values[i][TECH_COL.ID], created: false };
    }
  }

  // Create new
  const techId = 'TECH-' + Date.now();
  const newRow = [];
  newRow[TECH_COL.ID] = techId;
  newRow[TECH_COL.COMPANY_ID] = data.companyId || 'CMP-AQUALITYPOOL';
  newRow[TECH_COL.NAME] = data.name || '';
  newRow[TECH_COL.PHONE] = data.phone || '';
  newRow[TECH_COL.EMAIL] = data.email || '';
  newRow[TECH_COL.ROLE] = data.role || 'Technician';
  newRow[TECH_COL.HOURLY_RATE] = data.hourlyRate || 0;
  newRow[TECH_COL.SERVICE_TYPES] = data.serviceTypes || 'Pool Service,Opening,Closing,Snow Removal,Installation,Renovation';
  newRow[TECH_COL.COLOR] = data.color || '#0ea5e9';
  newRow[TECH_COL.ACTIVE] = 'Yes';
  newRow[TECH_COL.HIRE_DATE] = data.hireDate || now.split('T')[0];
  newRow[TECH_COL.NOTES] = data.notes || '';
  newRow[TECH_COL.CREATED_AT] = now;
  newRow[TECH_COL.UPDATED_AT] = now;
  newRow[TECH_COL.METRICS_JSON] = JSON.stringify({ jobsCompleted: 0, hoursWorked: 0, revenue: 0 });
  newRow[TECH_COL.SCHEDULE_JSON] = JSON.stringify({ availability: 'full-time', dayOff: 'Sunday' });
  newRow[TECH_COL.CUSTOM_JSON] = '{}';

  sheet.appendRow(newRow);
  return { success: true, message: 'Technician created', techId: techId, created: true };
}

function sendTechnicianWelcomeDraftToBrooks(payload) {
  try {
    payload = payload || {};
    var techId = String(payload.techId || ('TECH-' + Date.now())).trim();
    var techName = String(payload.name || '').trim();
    var phone = String(payload.phone || '').trim();
    var email = String(payload.email || '').trim();
    var role = String(payload.role || 'Technician').trim();
    if (!techName) return { success: false, error: 'Technician name required' };
    if (!phone) return { success: false, error: 'Technician phone required' };

    var firstName = techName.split(' ')[0] || techName;
    var draftText = 'Hi ' + firstName + '! 👋\n\n'
      + 'Welcome to the team at A Quality Pool Company.\n\n'
      + 'You will receive system text updates about assignments, routes, and schedule changes. '
      + 'Please keep notifications on and reply here if you need help getting started.\n\n'
      + 'Glad to have you on the team!';

    var facts = [
      { label: 'Technician', value: techName },
      { label: 'Role', value: role },
      { label: 'Phone', value: phone },
      { label: 'Email', value: email }
    ];

    return sendBrooksTelegramDraft_(
      techId,
      'TechWelcomeDraft',
      'Technician welcome text draft',
      facts,
      draftText,
      '',
      ''
    );
  } catch (err) {
    Logger.log('sendTechnicianWelcomeDraftToBrooks error: ' + err.toString());
    return { success: false, error: err.toString() };
  }
}

function buildTelegramGroupSmsRedirectUrl_(phones, body, name) {
  try {
    var raw = Array.isArray(phones) ? phones : [];
    var e164List = raw.map(function(phone) {
      var clean = phone ? String(phone).replace(/\D/g, '') : '';
      if (!clean) return '';
      if (clean.length === 11 && clean.charAt(0) === '1') return '+1' + clean.substring(1);
      if (clean.length === 10) return '+1' + clean;
      if (clean.length >= 10 && clean.length <= 15) return '+' + clean;
      return '';
    }).filter(function(p) { return !!p; });
    if (!e164List.length) return '';

    var fullBody = String(body || '');
    if (fullBody.length > 1200) fullBody = fullBody.substring(0, 1197) + '...';
    var n = name ? String(name).trim() : 'Team';
    var phoneCsv = e164List.join(',');

    try {
      var webAppUrl = ScriptApp.getService().getUrl();
      if (webAppUrl && String(webAppUrl).trim()) {
        var sep = webAppUrl.indexOf('?') === -1 ? '?' : '&';
        return webAppUrl + sep
          + 'action=sms'
          + '&phone=' + encodeURIComponent(phoneCsv)
          + '&body=' + encodeURIComponent(fullBody)
          + '&name=' + encodeURIComponent(n);
      }
    } catch (urlErr) {
      Logger.log('buildTelegramGroupSmsRedirectUrl_ url lookup: ' + urlErr);
    }

    return 'sms://' + phoneCsv.replace(/\+/g, '') + '?body=' + encodeURIComponent(fullBody);
  } catch (err) {
    Logger.log('buildTelegramGroupSmsRedirectUrl_ error: ' + err.toString());
    return '';
  }
}

function sendTechnicianGroupTextDraftToBrooks(companyId, customMessage) {
  try {
    var message = String(customMessage || '').trim();
    if (!message) return { success: false, error: 'Message is required' };

    var techRes = getTechnicians(companyId || '');
    var techs = (techRes && techRes.success && Array.isArray(techRes.technicians)) ? techRes.technicians : [];
    var withPhone = techs.filter(function(t) {
      return String((t && t.phone) || '').replace(/\D/g, '').length >= 10;
    });
    if (!withPhone.length) {
      return { success: false, error: 'No technicians with phone numbers found' };
    }

    var phones = withPhone.map(function(t) { return t.phone; });
    var names = withPhone.map(function(t) { return t.name || ''; }).filter(Boolean);
    var groupUrl = buildTelegramGroupSmsRedirectUrl_(phones, message, 'Team');

    var previewNames = names.slice(0, 8).join(', ');
    if (names.length > 8) previewNames += ', +' + (names.length - 8) + ' more';

    var facts = [
      { label: 'Recipients', value: String(withPhone.length) + ' technician(s)' },
      { label: 'Team', value: previewNames }
    ];

    var html = buildTelegramDraftCard_('Team group text draft', facts, message, '', '');
    var buttons = [];
    if (groupUrl) buttons.push({ text: 'Open Group Draft', url: groupUrl });
    var tg = sendTelegramBotMessage_(html, buttons);

    var recipientId = getBrooksTelegramChatId_() || BROOKS_TELEGRAM_CHAT_ID || '';
    var recipient = 'telegram:' + recipientId;
    if (tg && tg.success) {
      logNotification('TEAM-BROADCAST', recipient, 'TechGroupDraft', 'Sent', 'Team group text draft');
      return { success: true, message: 'Group draft sent to Telegram', recipientCount: withPhone.length };
    }
    logNotification('TEAM-BROADCAST', recipient, 'TechGroupDraft', 'Failed', (tg && tg.error) || 'Telegram send failed');
    return { success: false, error: (tg && tg.error) || 'Telegram send failed' };
  } catch (err) {
    Logger.log('sendTechnicianGroupTextDraftToBrooks error: ' + err.toString());
    return { success: false, error: err.toString() };
  }
}

function getTechnicians(companyId) {
  const sheet = getOrCreateSheet(TECHNICIANS_SHEET, TECH_HEADERS);
  const values = sheet.getDataRange().getValues();
  const techs = [];

  for (let i = 1; i < values.length; i++) {
    if ((!companyId || String(values[i][TECH_COL.COMPANY_ID]) === companyId) &&
        String(values[i][TECH_COL.ACTIVE]) !== 'No') {
      var metricsStr = '{}';
      try { if (values[i][TECH_COL.METRICS_JSON]) metricsStr = String(values[i][TECH_COL.METRICS_JSON]); } catch(e) {}

      // Convert all values to plain strings/numbers — Date objects cause google.script.run to return null
      var hd = values[i][TECH_COL.HIRE_DATE];
      var hireDateStr = '';
      if (hd instanceof Date) { hireDateStr = hd.toISOString().split('T')[0]; }
      else if (hd) { hireDateStr = String(hd); }

      techs.push({
        techId: String(values[i][TECH_COL.ID] || ''),
        companyId: String(values[i][TECH_COL.COMPANY_ID] || ''),
        name: String(values[i][TECH_COL.NAME] || ''),
        phone: String(values[i][TECH_COL.PHONE] || ''),
        email: String(values[i][TECH_COL.EMAIL] || ''),
        role: String(values[i][TECH_COL.ROLE] || 'Technician'),
        hourlyRate: Number(values[i][TECH_COL.HOURLY_RATE]) || 0,
        serviceTypes: String(values[i][TECH_COL.SERVICE_TYPES] || ''),
        color: String(values[i][TECH_COL.COLOR] || '#0ea5e9'),
        active: String(values[i][TECH_COL.ACTIVE] || 'Yes'),
        hireDate: hireDateStr,
        notes: String(values[i][TECH_COL.NOTES] || ''),
        metricsJson: metricsStr
      });
    }
  }
  return { success: true, technicians: techs };
}

/**
 * Update a technician's metrics JSON after a job is completed
 */
function updateTechMetrics(techName, companyId, jobData) {
  try {
    const sheet = getOrCreateSheet(TECHNICIANS_SHEET, TECH_HEADERS);
    const values = sheet.getDataRange().getValues();
    const nameLower = (techName || '').toLowerCase().trim();

    for (let i = 1; i < values.length; i++) {
      if ((values[i][TECH_COL.NAME] || '').toLowerCase().trim() === nameLower &&
          (!companyId || values[i][TECH_COL.COMPANY_ID] === companyId)) {
        let metrics = {};
        try { if (values[i][TECH_COL.METRICS_JSON]) metrics = JSON.parse(values[i][TECH_COL.METRICS_JSON]); } catch(e) {}

        metrics.jobsCompleted = (metrics.jobsCompleted || 0) + 1;
        metrics.hoursWorked = (metrics.hoursWorked || 0) + ((jobData.duration || 60) / 60);
        metrics.revenue = (metrics.revenue || 0) + (parseFloat(jobData.amountPaid) || 0);
        metrics.lastJobDate = jobData.date || new Date().toISOString().split('T')[0];

        // Track by service type
        if (!metrics.serviceBreakdown) metrics.serviceBreakdown = {};
        var st = jobData.serviceType || 'Other';
        if (!metrics.serviceBreakdown[st]) metrics.serviceBreakdown[st] = { count: 0, revenue: 0 };
        metrics.serviceBreakdown[st].count += 1;
        metrics.serviceBreakdown[st].revenue += (parseFloat(jobData.amountPaid) || 0);

        sheet.getRange(i + 1, TECH_COL.METRICS_JSON + 1).setValue(JSON.stringify(metrics));
        sheet.getRange(i + 1, TECH_COL.UPDATED_AT + 1).setValue(new Date().toISOString());
        return { success: true };
      }
    }
    return { success: false, error: 'Tech not found' };
  } catch (error) {
    Logger.log('Error in updateTechMetrics: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ===========================================================================
// SEND TO VERIZON PHONE via @vtext.com
// ===========================================================================
function sendRouteToPhone(phoneNumber, routeText) {
  if (!phoneNumber) return { success: false, error: 'No phone number provided' };

  // Clean phone number - digits only, 10 digits
  const clean = String(phoneNumber).replace(/\D/g, '');
  if (clean.length < 10) return { success: false, error: 'Invalid phone number' };
  const digits = clean.length > 10 ? clean.slice(-10) : clean;

  const vzEmail = digits + '@vtext.com';

  try {
    MailApp.sendEmail({
      to: vzEmail,
      subject: '',  // Verizon texts work best with empty or short subject
      body: routeText
    });
    return { success: true, message: 'Route sent to ' + phoneNumber };
  } catch (error) {
    return { success: false, error: 'Failed to send: ' + error.toString() };
  }
}

function sendETA(appointmentId, startTime, endTime) {
  const result = getScheduledAppointments();
  if (!result.success) return result;

  const appt = result.appointments.find(a => a.id === appointmentId);
  if (!appt) return { success: false, error: 'Appointment not found' };

  const companyName = 'A Quality Pool Company';
  const firstName = (appt.customerName || 'there').split(' ')[0];
  
  // Build message
  const message = 'Hi ' + firstName + '! 👋\n\n'
    + 'This is Sam with ' + companyName + '. We wanted to let you know that we\'re on our way and will arrive between ' + startTime + ' and ' + endTime + '.\n\n'
    + 'See you soon!';

  const emailSubject = '🚗 ETA Update - ' + companyName;
  const emailBody = buildETAEmail(appt, companyName, startTime, endTime);

  let sentTo = [];
  let errors = [];

  // Send email if available
  if (appt.customerEmail) {
    try {
      MailApp.sendEmail({
        to: appt.customerEmail,
        subject: emailSubject,
        htmlBody: emailBody
      });
      sentTo.push('email: ' + appt.customerEmail);
      logNotification(appointmentId, appt.customerEmail, 'eta', 'Sent', 'ETA: ' + startTime + ' - ' + endTime);
    } catch (error) {
      errors.push('Email: ' + error.toString());
      logNotification(appointmentId, appt.customerEmail, 'eta', 'Failed', error.toString());
    }
  }

  // Send text if available (Verizon)
  if (appt.customerPhone) {
    const phoneResult = sendRouteToPhone(appt.customerPhone, message);
    if (phoneResult.success) {
      sentTo.push('text: ' + appt.customerPhone);
    } else {
      errors.push('Text: ' + phoneResult.error);
    }
  }

  if (sentTo.length === 0) {
    return { success: false, error: 'No email or phone available. ' + (errors.length > 0 ? errors.join('; ') : '') };
  }

  return { 
    success: true, 
    message: 'ETA sent to ' + sentTo.join(', ') + (errors.length > 0 ? ' (Errors: ' + errors.join('; ') + ')' : '')
  };
}

function sendETATelegramDraft(appointmentId, startTime, endTime) {
  const result = getScheduledAppointments();
  if (!result.success) return result;

  const appt = result.appointments.find(a => a.id === appointmentId);
  if (!appt) return { success: false, error: 'Appointment not found' };

  const companyName = 'A Quality Pool Company';
  const firstName = (appt.customerName || 'there').split(' ')[0];
  const draftText = 'Hi ' + firstName + '! 👋\n\n'
    + 'This is Sam with ' + companyName + '. We\'re on the way and should arrive between ' + startTime + ' and ' + endTime + '.\n\n'
    + 'Thanks!';

  const facts = [
    { label: 'Customer', value: appt.customerName || '' },
    { label: 'Date', value: appt.date || '' },
    { label: 'Service', value: appt.serviceType || '' },
    { label: 'ETA window', value: startTime + ' - ' + endTime },
    { label: 'Phone', value: appt.customerPhone || '' },
    { label: 'Email', value: appt.customerEmail || '' }
  ];

  return sendBrooksTelegramDraft_(
    appointmentId,
    'ETADraft',
    'ETA draft ready to send',
    facts,
    draftText,
    '',
    ''
  );
}

/**
 * Send Brooks a Telegram draft after service completion so he can text customer quickly.
 * @param {string} appointmentId
 * @param {Object} checklistData optional { chemicalReadings, workPerformed, issuesFound, invoiceId, invoiceShareLink }
 */
function sendServiceCompletionTelegramDraft(appointmentId, checklistData) {
  try {
    const result = getScheduledAppointments();
    if (!result.success) return result;

    const appt = (result.appointments || []).find(function(a) { return a.id === appointmentId; });
    if (!appt) return { success: false, error: 'Appointment not found' };

    checklistData = checklistData || {};
    const readings = checklistData.chemicalReadings || {};
    const doses = checklistData.chemicalDosages || {};
    const photoSections = checklistData.photoSections || {};
    const firstName = (appt.customerName || 'there').split(' ')[0];
    const companyName = 'A Quality Pool Company';

    const chemistryBits = [];
    if (readings.freeChlorine || readings.freeChlorine === 0) chemistryBits.push('FC ' + readings.freeChlorine + ' ppm');
    if (readings.pH || readings.pH === 0) chemistryBits.push('pH ' + readings.pH);
    if (readings.alkalinity || readings.alkalinity === 0) chemistryBits.push('Alk ' + readings.alkalinity + ' ppm');
    if (readings.cya || readings.cya === 0) chemistryBits.push('CYA ' + readings.cya + ' ppm');
    if (readings.salt || readings.salt === 0) chemistryBits.push('Salt ' + readings.salt + ' ppm');
    if (readings.saltTester || readings.saltTester === 0) chemistryBits.push('Salt tester ' + readings.saltTester + ' ppm');

    const doseBits = [];
    if (doses.liquidChlorine) doseBits.push('Liquid Chlorine ' + doses.liquidChlorine + ' gal');
    if (doses.muriaticAcid) doseBits.push('Muriatic Acid ' + doses.muriaticAcid + ' gal');
    if (doses.phDown) doseBits.push('pH Down ' + doses.phDown + ' lb');
    if (doses.calciumHypo) doseBits.push('Calcium Hypo ' + doses.calciumHypo + ' lb');
    if (doses.saltBagsNeeded) doseBits.push('Salt Needed ' + doses.saltBagsNeeded + ' bag(s)');
    if (doses.saltBagsAdded) doseBits.push('Salt Added ' + doses.saltBagsAdded + ' bag(s)');

    let draftText = 'Hi ' + firstName + '! 👋\n\n'
      + 'Your ' + (appt.serviceType || 'pool service').toLowerCase() + ' has been completed today by ' + companyName + '.';
    if (chemistryBits.length) {
      draftText += '\n\nToday\'s readings: ' + chemistryBits.join(' • ');
    }
    if (doseBits.length) {
      draftText += '\n\nChemicals added: ' + doseBits.join(' • ');
    }
    if (checklistData.workPerformed) {
      draftText += '\n\nWork performed: ' + String(checklistData.workPerformed).trim();
    }
    if (checklistData.issuesFound) {
      draftText += '\n\nNotes: ' + String(checklistData.issuesFound).trim();
    }
    // Include open concerns flagged for follow-up
    try {
      var openConcernsRes = loadOpenConcerns(appt.customerId || appt.id || appointmentId);
      if (openConcernsRes && openConcernsRes.concerns && openConcernsRes.concerns.length) {
        var concBits = openConcernsRes.concerns.map(function(c){ return c.text + ' [' + c.severity + ']'; });
        draftText += '\n\n⚠️ Open concerns on file: ' + concBits.join('; ');
      }
    } catch (concErr) { Logger.log('Telegram concerns: ' + concErr); }
    if (checklistData.invoiceId) {
      draftText += '\n\nYour chemical/service invoice (' + String(checklistData.invoiceId) + ') was sent today.';
    }
    if (checklistData.invoiceShareLink) {
      draftText += '\nYou can view and pay here: ' + String(checklistData.invoiceShareLink);
    }

    const photoLinksText = buildPhotoLinksText_(photoSections);
    if (photoLinksText) {
      draftText += '\n\nPhoto shared links:\n' + photoLinksText;
    }
    draftText += '\n\nThank you!';

    const facts = [
      { label: 'Customer', value: appt.customerName || '' },
      { label: 'Date', value: appt.date || '' },
      { label: 'Service', value: appt.serviceType || '' },
      { label: 'Phone', value: appt.customerPhone || '' },
      { label: 'Email', value: appt.customerEmail || '' },
      { label: 'Invoice', value: checklistData.invoiceId || '' }
    ];

    const srBase = getServiceReportWebAppUrl_();
    const srUrl = srBase ? (srBase + '?appointmentId=' + encodeURIComponent(appointmentId)) : '';

    return sendBrooksTelegramDraft_(
      appointmentId,
      'ServiceCompletionDraft',
      'Service completion text draft',
      facts,
      draftText,
      srUrl ? 'Open Service Report' : '',
      srUrl || ''
    );
  } catch (err) {
    Logger.log('sendServiceCompletionTelegramDraft error: ' + err.toString());
    return { success: false, error: err.toString() };
  }
}

function buildCustomerPortalSignupUrl_(customerEmail, customerName) {
  const base = String(CUSTOMER_PORTAL_WEBAPP_URL || '').trim();
  if (!base) return '';
  const email = String(customerEmail || '').trim();
  const name = String(customerName || '').trim();
  const inviteToken = 'INV-' + Utilities.getUuid().substring(0, 12);
  const qs = [
    'token=' + encodeURIComponent(inviteToken),
    'email=' + encodeURIComponent(email),
    'name=' + encodeURIComponent(name)
  ].join('&');
  return base + (base.indexOf('?') >= 0 ? '&' : '?') + qs;
}

/**
 * Send customer portal invite from appointment detail.
 * Sends email directly to customer and sends Brooks a Telegram draft text.
 */
function sendCustomerPortalInvite(appointmentId) {
  try {
    const result = getScheduledAppointments();
    if (!result || !result.success) {
      return { success: false, error: (result && result.error) || 'Unable to load appointments' };
    }

    const appt = (result.appointments || []).find(function(a) { return String(a.id || '') === String(appointmentId || ''); });
    if (!appt) return { success: false, error: 'Appointment not found' };

    const customerEmail = String(appt.customerEmail || '').trim().toLowerCase();
    const customerName = String(appt.customerName || 'Customer').trim();
    const customerPhone = String(appt.customerPhone || '').trim();
    if (!customerEmail) return { success: false, error: 'Customer email missing for this appointment' };

    const portalUrl = buildCustomerPortalSignupUrl_(customerEmail, customerName);
    if (!portalUrl) return { success: false, error: 'Customer portal URL not configured' };

    const firstName = customerName.split(' ')[0] || 'there';
    const emailSubject = 'Your A Quality Pool Customer Portal Access';
    const emailHtml = ''
      + '<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">'
      + '  <div style="background:linear-gradient(135deg,#0369a1,#0284c7);color:#fff;padding:18px 20px;">'
      + '    <h2 style="margin:0;font-size:22px;">A Quality Pool Company</h2>'
      + '    <p style="margin:6px 0 0 0;opacity:.95;">Customer Portal Invite</p>'
      + '  </div>'
      + '  <div style="padding:20px;color:#0f172a;line-height:1.5;">'
      + '    <p style="margin:0 0 12px 0;">Hi ' + firstName + ',</p>'
      + '    <p style="margin:0 0 12px 0;">Your customer portal is ready. You can view your past service history, weekly service schedule, invoices/payments, and service photos in one place.</p>'
      + '    <p style="margin:18px 0;">'
      + '      <a href="' + portalUrl + '" style="display:inline-block;background:#0284c7;color:#fff;text-decoration:none;padding:12px 16px;border-radius:8px;font-weight:700;">Open Customer Portal</a>'
      + '    </p>'
      + '    <p style="margin:0 0 8px 0;color:#475569;font-size:13px;">If the button does not open, copy and paste this link:</p>'
      + '    <p style="margin:0;color:#0ea5e9;font-size:12px;word-break:break-all;">' + portalUrl + '</p>'
      + '  </div>'
      + '</div>';

    MailApp.sendEmail({
      to: customerEmail,
      subject: emailSubject,
      htmlBody: emailHtml
    });

    const draftText = 'Hi ' + firstName + '! Your A Quality Pool customer portal is ready. You can view past service history, weekly service schedule, invoices, and photos here: ' + portalUrl;
    const facts = [
      { label: 'Customer', value: customerName },
      { label: 'Email', value: customerEmail },
      { label: 'Phone', value: customerPhone },
      { label: 'Appointment', value: String(appt.date || '') + ' ' + String(appt.time || '') }
    ];

    const tg = sendBrooksTelegramDraft_(
      String(appt.id || appointmentId || ''),
      'CustomerPortalInvite',
      'Customer portal invite',
      facts,
      draftText,
      'Open Customer Portal',
      portalUrl
    );

    return {
      success: true,
      portalUrl: portalUrl,
      telegramDraftSent: !!(tg && tg.success),
      message: 'Portal invite sent to customer' + ((tg && tg.success) ? ' + Telegram draft sent to Brooks' : '')
    };
  } catch (err) {
    Logger.log('sendCustomerPortalInvite error: ' + err.toString());
    return { success: false, error: err.toString() };
  }
}

function buildETAEmail(appt, companyName, startTime, endTime) {
  return '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">'
    + '<div style="background:linear-gradient(135deg,#2563eb,#3b82f6);padding:30px;text-align:center;border-radius:12px 12px 0 0;">'
    + '<h1 style="color:white;margin:0;font-size:24px;">🚗 ETA Update</h1>'
    + '<p style="color:rgba(255,255,255,0.9);margin:8px 0 0;">We\'re on our way!</p></div>'
    + '<div style="padding:30px;background:white;border:1px solid #e5e7eb;">'
    + '<p style="font-size:16px;">Hi <strong>' + (appt.customerName || '') + '</strong>,</p>'
    + '<p>This is <strong>' + companyName + '</strong>. We wanted to let you know that we\'re on our way!</p>'
    + '<div style="background:#eff6ff;border-left:4px solid #2563eb;padding:20px;margin:20px 0;border-radius:0 8px 8px 0;text-align:center;">'
    + '<div style="font-size:32px;font-weight:bold;color:#2563eb;margin-bottom:8px;">⏰ ' + startTime + ' - ' + endTime + '</div>'
    + '<p style="color:#6b7280;margin:0;">Estimated arrival window</p></div>'
    + '<div style="background:#f9fafb;padding:16px;border-radius:8px;margin:20px 0;">'
    + '<p style="margin:0;font-size:14px;color:#6b7280;"><strong>Service:</strong> ' + (appt.serviceType || '') + '</p>'
    + '<p style="margin:8px 0 0;font-size:14px;color:#6b7280;"><strong>Location:</strong> ' + (appt.address || '') + '</p></div>'
    + '<p style="color:#6b7280;font-size:14px;">See you soon!</p></div>'
    + '<div style="background:#f9fafb;padding:20px;text-align:center;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;">'
    + '<p style="color:#9ca3af;font-size:12px;margin:0;">' + companyName + '</p></div></div>';
}

function sendAppointmentToPhone(phoneNumber, appointmentId) {
  const result = getScheduledAppointments();
  if (!result.success) return result;

  const appt = result.appointments.find(a => a.id === appointmentId);
  if (!appt) return { success: false, error: 'Appointment not found' };

  const text = '📅 ' + (appt.date || '') + ' @ ' + (appt.time || '') + '\n'
    + '👤 ' + (appt.customerName || '') + '\n'
    + '📍 ' + (appt.address || '') + '\n'
    + '🔧 ' + (appt.serviceType || '') + '\n'
    + (appt.customerPhone ? '📱 ' + appt.customerPhone + '\n' : '')
    + (appt.notes ? '📝 ' + appt.notes : '');

  return sendRouteToPhone(phoneNumber, text);
}

function buildRouteText(appointments, mapsUrl) {
  let text = '🚛 Route for ' + (appointments[0] ? appointments[0].date : 'Today') + '\n';
  text += '━━━━━━━━━━━━━━\n';
  appointments.forEach(function(a, idx) {
    text += (idx + 1) + '. ' + (a.time || '') + ' - ' + (a.customerName || '') + '\n';
    text += '   📍 ' + (a.address || '') + '\n';
    text += '   🔧 ' + (a.serviceType || '') + '\n';
    if (a.customerPhone) text += '   📱 ' + a.customerPhone + '\n';
  });
  if (mapsUrl) text += '\n🗺️ Map: ' + mapsUrl;
  return text;
}

function sendDayRouteToPhone(phoneNumber, companyId, techName, date) {
  const result = getScheduledAppointments(companyId);
  if (!result.success) return result;

  const dayAppts = result.appointments.filter(function(a) {
    return a.date === date &&
      (a.status === 'Scheduled' || a.status === 'Confirmed' || a.status === 'In Progress') &&
      (!techName || a.assignedTo === techName);
  });

  dayAppts.sort(function(a, b) { return (a.time || '').localeCompare(b.time || ''); });

  if (!dayAppts.length) return { success: false, error: 'No appointments found for that day/tech' };

  // Build Google Maps multi-stop URL
  const addresses = dayAppts.map(function(a) { return encodeURIComponent(a.address || ''); }).filter(Boolean);
  const mapsUrl = addresses.length > 0
    ? 'https://www.google.com/maps/dir/' + addresses.join('/')
    : '';

  const routeText = buildRouteText(dayAppts, mapsUrl);
  return sendRouteToPhone(phoneNumber, routeText);
}

/**
 * Build route text including assigned technician per stop. Used for daily team blast.
 */
function buildRouteTextWithAssignments(appointments, mapsUrl) {
  let text = '🚛 Route for ' + (appointments[0] ? appointments[0].date : 'Today') + '\n';
  text += '━━━━━━━━━━━━━━\n';
  appointments.forEach(function(a, idx) {
    text += (idx + 1) + '. ' + (a.time || '') + ' - ' + (a.customerName || '') + '\n';
    text += '   📍 ' + (a.address || '') + '\n';
    text += '   🔧 ' + (a.serviceType || '') + (a.assignedTo ? ' • 👷 ' + a.assignedTo : '') + '\n';
    if (a.customerPhone) text += '   📱 ' + a.customerPhone + '\n';
  });
  if (mapsUrl) text += '\n🗺️ Map: ' + mapsUrl;
  return text;
}

/**
 * Send today's full route (all addresses + assigned tech per stop) to all technicians with phone numbers.
 * Call from Routes view "Send to Team" button.
 */
function sendDailyRouteToTeam(companyId, date) {
  const result = getScheduledAppointments(companyId);
  if (!result.success) return result;

  const activeStatuses = ['Scheduled', 'Confirmed', 'In Progress'];
  const dayAppts = result.appointments.filter(function(a) {
    return a.date === date && activeStatuses.indexOf(a.status) !== -1;
  });
  dayAppts.sort(function(a, b) { return (a.time || '').localeCompare(b.time || ''); });

  if (!dayAppts.length) {
    return { success: false, error: 'No appointments found for that day' };
  }

  const addresses = dayAppts.map(function(a) { return encodeURIComponent(a.address || ''); }).filter(Boolean);
  const mapsUrl = addresses.length > 0 ? 'https://www.google.com/maps/dir/' + addresses.join('/') : '';
  const routeText = buildRouteTextWithAssignments(dayAppts, mapsUrl);

  const techResult = getTechnicians(companyId);
  const techs = (techResult && techResult.technicians) ? techResult.technicians : [];
  const withPhone = techs.filter(function(t) { return t.phone && String(t.phone).replace(/\D/g, '').length >= 10; });

  if (!withPhone.length) {
    return { success: false, error: 'No technicians with phone numbers on file. Add phone numbers in Team Management.' };
  }

  let sentCount = 0;
  const errors = [];
  withPhone.forEach(function(t) {
    const r = sendRouteToPhone(t.phone, routeText);
    if (r.success) sentCount++; else errors.push(t.name + ': ' + (r.error || ''));
  });

  return {
    success: sentCount > 0,
    sentCount: sentCount,
    totalTechs: withPhone.length,
    message: 'Route sent to ' + sentCount + ' of ' + withPhone.length + ' technician(s)',
    errors: errors.length ? errors : undefined
  };
}

/**
 * Send each technician only their assigned jobs for the day (by AssignedTo).
 * Uses SMS (phone) and/or email like the Brooks notification pattern.
 */
function sendAssignedRoutesToTechnicians(companyId, date) {
  const result = getScheduledAppointments(companyId);
  if (!result.success) return result;

  const activeStatuses = ['Scheduled', 'Confirmed', 'In Progress'];
  const dayAppts = result.appointments.filter(function(a) {
    return a.date === date && activeStatuses.indexOf(a.status) !== -1;
  });
  dayAppts.sort(function(a, b) { return (a.time || '').localeCompare(b.time || ''); });

  const techResult = getTechnicians(companyId);
  const techs = (techResult && techResult.technicians) ? techResult.technicians : [];
  if (!techs.length) {
    return { success: false, error: 'No technicians on file.' };
  }

  const addressesAll = dayAppts.map(function(a) { return encodeURIComponent(a.address || ''); }).filter(Boolean);
  const mapsUrl = addressesAll.length > 0 ? 'https://www.google.com/maps/dir/' + addressesAll.join('/') : '';
  let sentCount = 0;
  const errors = [];

  techs.forEach(function(t) {
    const assignMatch = (t.name || '').trim().toLowerCase();
    const myAppts = dayAppts.filter(function(a) {
      const at = (a.assignedTo || '').trim().toLowerCase();
      return at && (at === assignMatch || at.indexOf(assignMatch) !== -1 || assignMatch.indexOf(at) !== -1);
    });
    if (!myAppts.length) return;

    const routeText = buildRouteText(myAppts, mapsUrl);
    const subject = 'Your route for ' + date + ' – A Quality Pool Company';

    if (t.phone && String(t.phone).replace(/\D/g, '').length >= 10) {
      const r = sendRouteToPhone(t.phone, routeText);
      if (r.success) sentCount++; else errors.push(t.name + ' (SMS): ' + (r.error || ''));
    }
    if (t.email && String(t.email).trim()) {
      try {
        MailApp.sendEmail({
          to: t.email,
          subject: subject,
          htmlBody: '<div style="font-family:Arial,sans-serif;max-width:560px;">' +
            '<h2 style="color:#0c4a6e;">Your route – ' + date + '</h2>' +
            '<pre style="background:#f8fafc;padding:16px;border-radius:8px;white-space:pre-wrap;font-size:14px;">' + String(routeText).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>' +
            (mapsUrl ? '<p><a href="' + mapsUrl + '">View route in Google Maps</a></p>' : '') +
            '<p style="color:#64748b;font-size:12px;">— A Quality Pool Company</p></div>'
        });
        sentCount++;
      } catch (e) {
        errors.push(t.name + ' (email): ' + e.toString());
      }
    }
  });

  return {
    success: sentCount > 0,
    sentCount: sentCount,
    message: 'Assigned routes sent to technician(s)',
    errors: errors.length ? errors : undefined
  };
}

function buildAppointmentConfirmationText_(details) {
  details = details || {};
  const customerName = String(details.customerName || '').trim();
  const firstName = (customerName || 'there').split(' ')[0];
  const companyName = 'A Quality Pool Company';
  const serviceType = String(details.serviceType || 'service').trim() || 'service';
  const dateStr = String(details.dateStr || '').trim() || formatSheetDate(details.date || '');
  const timeStr = String(details.timeStr || '').trim() || formatSheetTime12Hour(details.time || '');
  const duration = parseInt(details.duration, 10) || 60;
  const address = String(details.address || '').trim();
  const recurringRaw = String(details.recurring || '').toLowerCase().trim();
  const isWeeklyRecurring = recurringRaw === 'weekly' || recurringRaw === 'weekly service' || recurringRaw === 'recurring weekly';
  const recurringNote = isWeeklyRecurring ? ' This is part of your recurring weekly pool service.' : '';

  return {
    customerName: customerName,
    firstName: firstName,
    serviceType: serviceType,
    dateStr: dateStr,
    timeStr: timeStr,
    duration: duration,
    address: address,
    isWeeklyRecurring: isWeeklyRecurring,
    textMessage: 'Hi ' + firstName + '! 👋 This is ' + companyName + '. Just confirming we will be there for your ' + serviceType + ' on ' + dateStr + ' at ' + timeStr + ' (' + duration + ' min).' + recurringNote + ' Address: ' + address + '. Reply to this number if you need to reschedule. See you soon!'
  };
}

function buildAppointmentConfirmationDetailsFromSheetRow_(row, headers) {
  headers = headers || [];
  row = row || [];
  const hasAppointmentType = headers.indexOf('AppointmentType') !== -1;
  const colRecurring = headers.indexOf('Recurring');
  const recurringRaw = colRecurring >= 0 ? String(row[colRecurring] || '') : '';
  return buildAppointmentConfirmationText_({
    customerName: row[3],
    serviceType: row[7],
    dateStr: formatSheetDate(hasAppointmentType ? row[10] : row[8]),
    timeStr: formatSheetTime12Hour(hasAppointmentType ? row[11] : row[9]),
    duration: parseInt(hasAppointmentType ? row[12] : row[10], 10) || 60,
    address: row[6],
    recurring: recurringRaw
  });
}

function buildAppointmentConfirmationDetailsFromAppointment_(appointment) {
  appointment = appointment || {};
  return buildAppointmentConfirmationText_({
    customerName: appointment.customerName,
    serviceType: appointment.serviceType,
    dateStr: formatSheetDate(appointment.date),
    timeStr: formatSheetTime12Hour(appointment.time),
    duration: parseInt(appointment.duration, 10) || 60,
    address: appointment.address,
    recurring: appointment.recurring
  });
}

/**
 * Send staff an email with a tap-to-text link to send appointment confirmation to the customer.
 * Same pattern as review: staff gets email with button that opens Messages with pre-filled text.
 */
function sendAppointmentConfirmationToStaff(appointmentId) {
  const sheet = getOrCreateSheet(APPOINTMENTS_SHEET);
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || [];

  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === appointmentId) {
      const row = values[i];
      const customerName = row[3];
      const customerPhone = row[5];
      const details = buildAppointmentConfirmationDetailsFromSheetRow_(row, headers);
      const serviceType = details.serviceType;
      const dateStr = details.dateStr;
      const timeStr = details.timeStr;
      const firstName = details.firstName;
      const textMessage = details.textMessage;

      return sendBrooksTelegramDraft_(
        appointmentId,
        'appt_confirmation_text',
        'Appointment confirmation draft',
        [
          { label: 'Customer', value: customerName || 'Customer' },
          { label: 'Phone', value: customerPhone || 'N/A' },
          { label: 'Service', value: serviceType || 'N/A' },
          { label: 'Date/Time', value: dateStr + ' @ ' + timeStr },
          { label: 'Recurring', value: details.isWeeklyRecurring ? 'Weekly service' : 'No' }
        ],
        textMessage
      );
    }
  }
  return { success: false, error: 'Appointment not found' };
}

// ===========================================================================
// HELPERS
// ===========================================================================
function formatSheetDate(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return value.getFullYear() + '-' + String(value.getMonth()+1).padStart(2,'0') + '-' + String(value.getDate()).padStart(2,'0');
  }
  // Handle string dates that might be in other formats
  var s = String(value).trim();
  // If it looks like "2026-02-16" already, return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Try parsing other date formats
  var d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  return s;
}

/** Convert time value from sheet — Sheets often stores "09:00" as a Date object */
function formatSheetTime(value) {
  if (!value && value !== 0) return '';
  if (value instanceof Date) {
    return String(value.getHours()).padStart(2, '0') + ':' + String(value.getMinutes()).padStart(2, '0');
  }
  var s = String(value).trim();
  // Already "HH:MM" format
  if (/^\d{1,2}:\d{2}$/.test(s)) return s;
  // Try to extract time from a date string like "Sat Dec 30 1899 09:00:00 GMT..."
  var match = s.match(/(\d{1,2}):(\d{2}):\d{2}/);
  if (match) return String(parseInt(match[1])).padStart(2, '0') + ':' + match[2];
  return s;
}

/** Convert sheet time to 12-hour clock (e.g., 1:00 PM). */
function formatSheetTime12Hour(value) {
  var base = formatSheetTime(value);
  if (!base && base !== 0) return '';
  var s = String(base).trim();

  // Already 12-hour-ish (normalize AM/PM case and spacing)
  var ampmMatch = s.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (ampmMatch) {
    var hh = parseInt(ampmMatch[1], 10);
    var mm = ampmMatch[2];
    var ap = ampmMatch[3].toUpperCase();
    if (isNaN(hh)) return s;
    if (hh === 0) hh = 12;
    if (hh > 12) hh = ((hh - 1) % 12) + 1;
    return hh + ':' + mm + ' ' + ap;
  }

  // 24-hour format HH:MM
  var hm = s.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) {
    var h24 = parseInt(hm[1], 10);
    var m24 = hm[2];
    if (isNaN(h24)) return s;
    var ap24 = h24 >= 12 ? 'PM' : 'AM';
    var h12 = h24 % 12;
    if (h12 === 0) h12 = 12;
    return h12 + ':' + m24 + ' ' + ap24;
  }

  // Best-effort parse from strings with seconds
  var hms = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (hms) {
    var h = parseInt(hms[1], 10);
    var m = hms[2];
    if (!isNaN(h)) {
      var ap = h >= 12 ? 'PM' : 'AM';
      var h12n = h % 12;
      if (h12n === 0) h12n = 12;
      return h12n + ':' + m + ' ' + ap;
    }
  }

  return s;
}

// ===========================================================================
// DAILY REMINDERS (set as time-driven trigger)
// ===========================================================================
function sendDailyReminders() {
  const sheet = getOrCreateSheet(APPOINTMENTS_SHEET);
  const values = sheet.getDataRange().getValues();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = formatSheetDate(tomorrow);

  for (let i = 1; i < values.length; i++) {
    const apptDate = formatSheetDate(values[i][8]);
    const email = values[i][4];
    const status = values[i][13];

    if (apptDate === tomorrowStr && email && (status === 'Scheduled' || status === 'Confirmed')) {
      try {
        MailApp.sendEmail({
          to: email,
          subject: '⏰ Reminder: Service Tomorrow - A Quality Pool Company',
          htmlBody: buildNotificationEmail({
            customerName: values[i][3], serviceType: values[i][7],
            date: apptDate, time: values[i][9], duration: values[i][10],
            address: values[i][6], description: values[i][11]
          }, 'A Quality Pool Company', 'Appointment Reminder', 'Your service is tomorrow', '#10b981', '#d1fae5')
        });
        logNotification(values[i][0], email, 'reminder', 'Sent', 'Daily reminder');
      } catch (e) {
        logNotification(values[i][0], email, 'reminder', 'Failed', e.toString());
      }
    }
  }
}

/**
 * Send reminders to customers for TODAY's appointments (used by 6am trigger).
 * Primary: sends text directly via phone gateway. Fallback: sends Telegram draft to Brooks.
 */
function sendTodayAppointmentReminders() {
  try {
    const sheet = getOrCreateSheet(APPOINTMENTS_SHEET);
    const values = sheet.getDataRange().getValues();
    const today = new Date();
    const todayStr = formatSheetDate(today);
    
    const headers = values[0] || [];
    const colDate = headers.indexOf('Date');
    const colTime = headers.indexOf('Time');
    const colStatus = headers.indexOf('Status');
    const colServiceType = headers.indexOf('ServiceType');
    const colCustomerName = headers.indexOf('CustomerName');
    const colCustomerEmail = headers.indexOf('CustomerEmail');
    const colCustomerPhone = headers.indexOf('CustomerPhone');
    const colRecurring = headers.indexOf('Recurring');
    const colAddress = headers.indexOf('Address');
    
    let remindersSent = 0;
    let telegramFallbacks = 0;
    
    for (let i = 1; i < values.length; i++) {
      const apptDate = String(values[i][colDate] || '').trim();
      const status = String(values[i][colStatus] || '').trim();
      const serviceType = String(values[i][colServiceType] || '').trim();
      
      // Only send for today's appointments with Scheduled or Confirmed status
      if (apptDate !== todayStr || (status !== 'Scheduled' && status !== 'Confirmed')) {
        continue;
      }
      
      const customerName = String(values[i][colCustomerName] || '').trim();
      const customerPhone = String(values[i][colCustomerPhone] || '').trim();
      const apptTime = String(values[i][colTime] || '').trim();
      const recurring = String(values[i][colRecurring] || '').toLowerCase().trim();
      const address = String(values[i][colAddress] || '').trim();
      
      if (!customerName || !customerPhone) {
        continue;
      }
      
      try {
        // Determine frequency label from recurring field
        let frequencyLabel = 'pool service';
        if (recurring === 'weekly') frequencyLabel = 'weekly pool service';
        else if (recurring === 'biweekly') frequencyLabel = 'biweekly pool service';
        else if (recurring === 'monthly') frequencyLabel = 'monthly pool service';
        
        // Build reminder text message for customer
        const draftText = 'Your ' + frequencyLabel + ' appointment is scheduled for today' 
          + (apptTime ? ' at ' + apptTime : '') 
          + '. We will be out at some point today to provide your maintenance. You will receive an email with all your service reports. Thanks!';

        // Try direct send first
        const phoneResult = sendRouteToPhone(customerPhone, draftText);
        if (phoneResult && phoneResult.success) {
          remindersSent++;
          logNotification(String(values[i][0] || ''), customerPhone, 'today_reminder_text', 'Sent', '6am auto reminder text');
          continue;
        }

        // Fallback to Telegram draft for manual send
        const telegramMsg = '<b>📅 TODAY\'S APPOINTMENT REMINDER</b>\n\n'
          + '<b>Customer:</b> ' + escapeTelegramHtml_(customerName) + '\n'
          + '<b>Phone:</b> ' + escapeTelegramHtml_(customerPhone) + '\n'
          + '<b>Service:</b> ' + escapeTelegramHtml_(serviceType) + '\n'
          + (apptTime ? '<b>Time:</b> ' + escapeTelegramHtml_(apptTime) + '\n' : '')
          + (address ? '<b>Address:</b> ' + escapeTelegramHtml_(address) + '\n' : '')
          + '\n<b>Draft Text:</b>\n' + escapeTelegramHtml_(draftText);
        
        const draftUrl = buildTelegramSmsRedirectUrl_(customerPhone, draftText, customerName);
        let buttons = [];
        if (draftUrl) {
          buttons.push({ text: 'Send Text to Customer', url: draftUrl });
        }
        
        sendTelegramBotMessage_(telegramMsg, buttons);
        telegramFallbacks++;
        logNotification(String(values[i][0] || ''), customerPhone, 'today_reminder_text', 'Failed', '6am direct text failed; Telegram fallback sent');
      } catch (reminderErr) {
        Logger.log('sendTodayAppointmentReminders error for ' + customerName + ': ' + reminderErr.toString());
      }
    }
    
    Logger.log('✅ 6am reminders sent: ' + remindersSent + ' direct text(s), ' + telegramFallbacks + ' Telegram fallback draft(s)');
    return { success: true, remindersSent: remindersSent, telegramFallbacks: telegramFallbacks };
  } catch (error) {
    Logger.log('❌ sendTodayAppointmentReminders error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

function escapeHtmlForUi_(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getSchedulingWebAppUrl_() {
  try {
    var url = ScriptApp.getService().getUrl();
    if (url && String(url).trim()) return String(url).trim();
  } catch (e) {
    Logger.log('getSchedulingWebAppUrl_ fallback: ' + e);
  }
  return String(SCHEDULING_WEBAPP_URL || '').trim();
}

function buildSchedulingActionUrl_(params) {
  var base = getSchedulingWebAppUrl_();
  if (!base) return '';
  var parts = [];
  var keys = Object.keys(params || {});
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var v = params[k];
    if (v === null || v === undefined || v === '') continue;
    parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
  }
  return base + (base.indexOf('?') === -1 ? '?' : '&') + parts.join('&');
}

function getDailyConfirmationBatchPropertyKey_(token) {
  return DAILY_CONFIRM_BATCH_KEY_PREFIX + String(token || '').trim();
}

function saveDailyConfirmationBatch_(batch) {
  if (!batch || !batch.token) return false;
  PropertiesService.getScriptProperties().setProperty(getDailyConfirmationBatchPropertyKey_(batch.token), JSON.stringify(batch));
  return true;
}

function loadDailyConfirmationBatch_(token) {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(getDailyConfirmationBatchPropertyKey_(token));
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (e) {
    Logger.log('loadDailyConfirmationBatch_ error: ' + e);
    return null;
  }
}

function createDailyConfirmationBatch_(dateIso, companyId, appointments, email) {
  var token = Utilities.getUuid().replace(/-/g, '');
  var items = (appointments || []).map(function(a) {
    var details = buildAppointmentConfirmationDetailsFromAppointment_(a);
    return {
      appointmentId: String(a.id || ''),
      customerName: String(details.customerName || a.customerName || 'Customer'),
      customerPhone: String(a.customerPhone || ''),
      serviceType: String(details.serviceType || a.serviceType || ''),
      date: String(a.date || dateIso || ''),
      time: String(details.timeStr || a.time || ''),
      address: String(a.address || ''),
      draftText: String(details.textMessage || ''),
      openedAt: ''
    };
  }).filter(function(item) {
    return item.appointmentId && item.customerPhone;
  });

  var batch = {
    token: token,
    date: String(dateIso || ''),
    companyId: String(companyId || DEFAULT_COMPANY_ID),
    createdBy: String(email || ''),
    createdAt: new Date().toISOString(),
    items: items
  };
  saveDailyConfirmationBatch_(batch);

  return {
    success: true,
    token: token,
    linkUrl: buildSchedulingActionUrl_({ action: 'dailyConfirmationBatch', token: token }),
    batch: batch
  };
}

function getDailyConfirmationBatchDraft_(token, appointmentId) {
  var batch = loadDailyConfirmationBatch_(token);
  if (!batch || !Array.isArray(batch.items)) {
    return { success: false, error: 'This daily draft link is invalid or expired.' };
  }
  var targetId = String(appointmentId || '').trim();
  var item = batch.items.find(function(it) { return String(it.appointmentId || '').trim() === targetId; });
  if (!item) {
    return { success: false, error: 'This draft item was not found in the daily list.' };
  }
  return {
    success: true,
    phone: item.customerPhone || '',
    body: item.draftText || '',
    name: item.customerName || 'Customer'
  };
}

function markDailyConfirmationDraftOpened_(token, appointmentId) {
  var batch = loadDailyConfirmationBatch_(token);
  if (!batch || !Array.isArray(batch.items)) return { success: false, error: 'Batch not found' };
  var targetId = String(appointmentId || '').trim();
  var changed = false;
  for (var i = 0; i < batch.items.length; i++) {
    var it = batch.items[i];
    if (String(it.appointmentId || '').trim() === targetId) {
      if (!it.openedAt) {
        it.openedAt = new Date().toISOString();
        changed = true;
      }
      break;
    }
  }
  if (changed) saveDailyConfirmationBatch_(batch);
  return { success: true, changed: changed };
}

function renderDailyConfirmationBatchPage_(token) {
  var batch = loadDailyConfirmationBatch_(token);
  if (!batch || !Array.isArray(batch.items)) {
    return HtmlService.createHtmlOutput('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body style="font-family:Arial,sans-serif;padding:24px;background:#f8fafc;"><div style="max-width:700px;margin:24px auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:22px;"><h2 style="margin:0 0 10px 0;color:#b91c1c;">Daily draft list unavailable</h2><p style="margin:0;color:#334155;">This link may be expired or invalid. Generate a new Mass Confirm link from Scheduling.</p></div></body></html>')
      .setTitle('Daily Drafts Unavailable')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  var rows = (batch.items || []).map(function(item) {
    var isDone = !!item.openedAt;
    var statusLabel = isDone ? 'Opened' : 'Pending';
    var statusColor = isDone ? '#166534' : '#9a3412';
    var statusBg = isDone ? '#dcfce7' : '#ffedd5';
    
    // Build SMS link with batch tracking - mark as opened when clicked
    var cleanPhone = item.customerPhone ? String(item.customerPhone).replace(/\D/g, '') : '';
    var e164 = '';
    if (cleanPhone.length === 11 && cleanPhone.charAt(0) === '1') {
      e164 = '+1' + cleanPhone.substring(1);
    } else if (cleanPhone.length === 10) {
      e164 = '+1' + cleanPhone;
    } else if (cleanPhone.length >= 10 && cleanPhone.length <= 15) {
      e164 = '+' + cleanPhone;
    }
    
    // Direct SMS link - no intermediate page
    var smsDigits = e164 ? e164.replace(/^\+/, '') : '';
    var directSmsLink = smsDigits ? ('sms://' + smsDigits + '?body=' + encodeURIComponent(item.draftText || '')) : '';
    
    // Also build tracked URL for backend marking (will be called via async)
    var trackingUrl = directSmsLink ? buildSchedulingActionUrl_({
      action: 'openConfirmationDraftSms',
      batchToken: token,
      appointmentId: item.appointmentId,
      phone: smsDigits,
      body: item.draftText || '',
      name: item.customerName
    }) : '';
    
    return '<div class="row" id="row-' + escapeHtmlForUi_(item.appointmentId) + '">' 
      + '<div class="left">'
      + '<div class="name">' + escapeHtmlForUi_(item.customerName || 'Customer') + '</div>'
      + '<div class="meta">' + escapeHtmlForUi_(item.serviceType || 'Service') + ' • ' + escapeHtmlForUi_(item.time || '') + '</div>'
      + '<div class="meta">' + escapeHtmlForUi_(item.customerPhone || '') + '</div>'
      + '</div>'
      + '<div class="right">'
      + '<span class="status" style="color:' + statusColor + ';background:' + statusBg + ';">' + statusLabel + '</span>'
      + (directSmsLink ? '<a class="btn" href="' + escapeHtmlForUi_(directSmsLink) + '" onclick="markAndOpen(event, \'' + escapeHtmlForUi_(trackingUrl) + '\', \'' + escapeHtmlForUi_(item.appointmentId) + '\')">Open Draft</a>' : '<span class="btn" style="opacity:0.5;cursor:not-allowed;">No Phone</span>')
      + '</div>'
      + '</div>';
  }).join('');

  var openedCount = (batch.items || []).filter(function(it) { return !!it.openedAt; }).length;
  var totalCount = (batch.items || []).length;
  var progressPct = totalCount ? Math.round((openedCount / totalCount) * 100) : 0;

  var html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1" />'
    + '<title>Daily Confirmation Drafts</title>'
    + '<style>body{font-family:-apple-system,Arial,sans-serif;background:#f8fafc;margin:0;padding:20px;color:#0f172a}.wrap{max-width:860px;margin:0 auto}.card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:18px;box-shadow:0 6px 20px rgba(2,6,23,.06)}h1{font-size:24px;margin:0 0 6px}.sub{color:#475569;font-size:14px}.progress{height:10px;background:#e2e8f0;border-radius:999px;overflow:hidden;margin:10px 0 14px}.bar{height:100%;background:linear-gradient(90deg,#22c55e,#16a34a);width:' + progressPct + '%}.row{display:flex;justify-content:space-between;gap:10px;align-items:center;border:1px solid #e5e7eb;border-radius:12px;padding:12px;margin:10px 0}.name{font-weight:700}.meta{font-size:12px;color:#64748b;margin-top:3px}.right{text-align:right;display:flex;flex-direction:column;gap:8px;align-items:flex-end}.status{font-size:11px;font-weight:700;padding:4px 8px;border-radius:999px}.btn{display:inline-block;background:#0369a1;color:#fff;text-decoration:none;padding:9px 12px;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;border:none}.btn:hover{background:#075985}.topActions{display:flex;gap:10px;margin-top:8px}.ghost{background:#fff;border:1px solid #cbd5e1;color:#0f172a}</style>'
    + '<script>'
    + 'function markAndOpen(e,trackUrl,apptId){'
    + '  e.preventDefault();'
    + '  markLocal(apptId);'
    + '  if(trackUrl){fetch(trackUrl).catch(function(){});}'
    + '  var smsLink=e.target.href;'
    + '  window.location.href=smsLink;'
    + '}'
    + 'function markLocal(id){var row=document.getElementById("row-"+id);if(!row)return;var s=row.querySelector(".status");if(s){s.textContent="Opened";s.style.background="#dcfce7";s.style.color="#166534";}}'
    + 'function refreshNow(){window.location.reload();}'
    + '</script>'
    + '</head><body><div class="wrap"><div class="card"><h1>📅 Daily Confirmation Drafts</h1>'
    + '<div class="sub">Date: ' + escapeHtmlForUi_(batch.date || '') + ' • Opened: <strong>' + openedCount + '</strong> / ' + totalCount + '</div>'
    + '<div class="progress"><div class="bar"></div></div>'
    + '<div class="topActions"><button class="btn ghost" onclick="refreshNow()">Refresh</button></div>'
    + rows
    + '</div></div></body></html>';

  return HtmlService.createHtmlOutput(html)
    .setTitle('Daily Confirmation Drafts')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function renderSmsRedirectPage_(phone, body, name) {
  var smsPhone = phone || '';
  var smsBody = body || '';
  var smsName = name || 'Customer';
  var smsLink = 'sms:' + smsPhone + '?&body=' + encodeURIComponent(smsBody);
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Opening Messages...</title>'
    + '<style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:-apple-system,Arial,sans-serif;background:#f0fdf4;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;}'
    + '.card{background:white;border-radius:20px;padding:40px 30px;text-align:center;max-width:400px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,0.1);}'
    + 'h1{font-size:22px;color:#1e3a5f;margin-bottom:8px;}'
    + 'p{color:#6b7280;font-size:14px;line-height:1.5;margin-bottom:24px;}'
    + '.btn{display:block;width:100%;padding:18px;background:linear-gradient(135deg,#22c55e,#16a34a);color:white;border:none;border-radius:14px;font-size:20px;font-weight:800;cursor:pointer;text-decoration:none;margin-bottom:12px;box-shadow:0 6px 20px rgba(34,197,94,0.4);}'
    + '.preview{background:#f0fdf4;border:2px solid #86efac;border-radius:10px;padding:14px;text-align:left;font-size:13px;color:#374151;line-height:1.6;white-space:pre-wrap;margin-top:16px;max-height:200px;overflow-y:auto;}'
    + '.phone{font-size:18px;font-weight:700;color:#0369a1;margin-bottom:16px;}'
    + '.spinner{width:40px;height:40px;border:4px solid #e5e7eb;border-top:4px solid #22c55e;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 16px;}'
    + '@keyframes spin{to{transform:rotate(360deg);}}'
    + '</style>'
    + '<script>'
    + 'var smsUrl = "' + smsLink.replace(/"/g, '\\"') + '";'
    + 'function openSms() {'
    + '  window.location.href = smsUrl;'
    + '  document.getElementById("status").innerHTML = "✅ Messages should be open!<br><br>If it didn\'t open, tap the button below.";'
    + '  document.getElementById("spinner").style.display = "none";'
    + '  document.getElementById("manualBtn").style.display = "block";'
    + '}'
    + 'setTimeout(openSms, 600);'
    + '</script>'
    + '</head><body><div class="card">'
    + '<div class="spinner" id="spinner"></div>'
    + '<h1>Opening Messages...</h1>'
    + '<p id="status">Launching your Messages app to text ' + escapeHtmlForUi_(smsName).split(' ')[0] + '</p>'
    + '<div class="phone">📱 ' + escapeHtmlForUi_(smsPhone) + '</div>'
    + '<a class="btn" id="manualBtn" href="' + smsLink + '" style="display:none;">Tap to Open Messages</a>'
    + '<div class="preview">' + escapeHtmlForUi_(smsBody) + '</div>'
    + '</div></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setTitle('Draft Text Message')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

// ============================================================================
// Invoice Draft Batch Tracking System
// ============================================================================

function getInvoiceDraftBatchPropertyKey_(token) {
  return 'invoiceDraftBatch_' + String(token || '').trim();
}

function saveInvoiceDraftBatch_(batch) {
  if (!batch || !batch.token) return false;
  PropertiesService.getScriptProperties().setProperty(getInvoiceDraftBatchPropertyKey_(batch.token), JSON.stringify(batch));
  return true;
}

function loadInvoiceDraftBatch_(token) {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(getInvoiceDraftBatchPropertyKey_(token));
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (e) {
    Logger.log('loadInvoiceDraftBatch_ error: ' + e);
    return null;
  }
}

function markInvoiceDraftOpened_(token, appointmentId) {
  var batch = loadInvoiceDraftBatch_(token);
  if (!batch || !Array.isArray(batch.items)) return { success: false, error: 'Batch not found' };
  var targetId = String(appointmentId || '').trim();
  var changed = false;
  for (var i = 0; i < batch.items.length; i++) {
    var it = batch.items[i];
    if (String(it.appointmentId || '').trim() === targetId) {
      if (!it.openedAt) {
        it.openedAt = new Date().toISOString();
        changed = true;
      }
      break;
    }
  }
  if (changed) saveInvoiceDraftBatch_(batch);
  return { success: true, changed: changed };
}

function createInvoiceDraftBatch_(invoiceId, appointmentId, customerName, customerEmail, customerPhone, serviceType, date, time) {
  var token = Utilities.getUuid().replace(/-/g, '');
  var items = [{
    appointmentId: String(appointmentId || ''),
    invoiceId: String(invoiceId || ''),
    customerName: String(customerName || 'Customer'),
    customerEmail: String(customerEmail || ''),
    customerPhone: String(customerPhone || ''),
    serviceType: String(serviceType || ''),
    date: String(date || ''),
    time: String(time || ''),
    sentAt: new Date().toISOString(),
    openedAt: ''
  }];

  var batch = {
    token: token,
    createdAt: new Date().toISOString(),
    items: items
  };

  saveInvoiceDraftBatch_(batch);
  return batch;
}

// ============================================================================
// End Invoice Draft Batch Tracking System
// ============================================================================

// ============================================================================
// Confirmation Draft Batch Tracking System
// ============================================================================

function getConfirmationDraftBatchPropertyKey_(token) {
  return 'confirmationDraftBatch_' + String(token || '').trim();
}

function saveConfirmationDraftBatch_(batch) {
  if (!batch || !batch.token) return false;
  PropertiesService.getScriptProperties().setProperty(getConfirmationDraftBatchPropertyKey_(batch.token), JSON.stringify(batch));
  return true;
}

function loadConfirmationDraftBatch_(token) {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(getConfirmationDraftBatchPropertyKey_(token));
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (e) {
    Logger.log('loadConfirmationDraftBatch_ error: ' + e);
    return null;
  }
}

function markConfirmationDraftOpened_(token, appointmentId) {
  var batch = loadConfirmationDraftBatch_(token);
  if (!batch || !Array.isArray(batch.items)) return { success: false, error: 'Batch not found' };
  var targetId = String(appointmentId || '').trim();
  var changed = false;
  for (var i = 0; i < batch.items.length; i++) {
    var it = batch.items[i];
    if (String(it.appointmentId || '').trim() === targetId) {
      if (!it.openedAt) {
        it.openedAt = new Date().toISOString();
        changed = true;
      }
      break;
    }
  }
  if (changed) saveConfirmationDraftBatch_(batch);
  return { success: true, changed: changed };
}

function createConfirmationDraftBatch_(appointmentId, customerName, customerPhone, serviceType, date, time) {
  var token = Utilities.getUuid().replace(/-/g, '');
  var items = [{
    appointmentId: String(appointmentId || ''),
    customerName: String(customerName || 'Customer'),
    customerPhone: String(customerPhone || ''),
    serviceType: String(serviceType || ''),
    date: String(date || ''),
    time: String(time || ''),
    sentAt: new Date().toISOString(),
    openedAt: ''
  }];

  var batch = {
    token: token,
    createdAt: new Date().toISOString(),
    items: items
  };

  saveConfirmationDraftBatch_(batch);
  return batch;
}

// ============================================================================
// End Confirmation Draft Batch Tracking System
// ============================================================================

// ============================================================================
// Review Draft Batch Tracking System
// ============================================================================

function getReviewDraftBatchPropertyKey_(token) {
  return 'reviewDraftBatch_' + String(token || '').trim();
}

function saveReviewDraftBatch_(batch) {
  if (!batch || !batch.token) return false;
  PropertiesService.getScriptProperties().setProperty(getReviewDraftBatchPropertyKey_(batch.token), JSON.stringify(batch));
  return true;
}

function loadReviewDraftBatch_(token) {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(getReviewDraftBatchPropertyKey_(token));
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (e) {
    Logger.log('loadReviewDraftBatch_ error: ' + e);
    return null;
  }
}

function markReviewDraftOpened_(token, appointmentId) {
  var batch = loadReviewDraftBatch_(token);
  if (!batch || !Array.isArray(batch.items)) return { success: false, error: 'Batch not found' };
  var targetId = String(appointmentId || '').trim();
  var changed = false;
  for (var i = 0; i < batch.items.length; i++) {
    var it = batch.items[i];
    if (String(it.appointmentId || '').trim() === targetId) {
      if (!it.openedAt) {
        it.openedAt = new Date().toISOString();
        changed = true;
      }
      break;
    }
  }
  if (changed) saveReviewDraftBatch_(batch);
  return { success: true, changed: changed };
}

function createReviewDraftBatch_(appointmentId, customerName, customerPhone, customerEmail, serviceType, date) {
  var token = Utilities.getUuid().replace(/-/g, '');
  var items = [{
    appointmentId: String(appointmentId || ''),
    customerName: String(customerName || 'Customer'),
    customerPhone: String(customerPhone || ''),
    customerEmail: String(customerEmail || ''),
    serviceType: String(serviceType || ''),
    date: String(date || ''),
    sentAt: new Date().toISOString(),
    openedAt: ''
  }];

  var batch = {
    token: token,
    createdAt: new Date().toISOString(),
    items: items
  };

  saveReviewDraftBatch_(batch);
  return batch;
}

// ============================================================================
// End Review Draft Batch Tracking System
// ============================================================================

function sendDailyConfirmationTexts(targetDate, email, options) {
  try {
    options = options || {};
    var sendIndividual = options.sendIndividual === true;
    var ctx = getCompanyIdForSchedulingUser_(email || '');
    var companyId = ctx.companyId || DEFAULT_COMPANY_ID;
    var dateIso = String(targetDate || '').trim();
    if (!dateIso) dateIso = formatSheetDate(new Date());

    var apptRes = getScheduledAppointments(companyId);
    if (!apptRes || !apptRes.success) {
      return { success: false, error: (apptRes && apptRes.error) || 'Unable to load appointments' };
    }

    var eligible = (apptRes.appointments || []).filter(function(a) {
      var status = String(a.status || '').toLowerCase().trim();
      var hasPhone = String(a.customerPhone || '').trim().length > 0;
      return String(a.date || '').trim() === dateIso && hasPhone && (status === 'scheduled' || status === 'confirmed' || status === 'in progress');
    });

    if (!eligible.length) {
      return {
        success: true,
        date: dateIso,
        companyId: companyId,
        eligibleCount: 0,
        sentCount: 0,
        failedCount: 0,
        groupedLink: false,
        message: 'No eligible appointments found for that day.'
      };
    }

    if (sendIndividual) {
      var sent = 0;
      var failed = 0;
      var errors = [];

      for (var i = 0; i < eligible.length; i++) {
        var a = eligible[i];
        try {
          var r = sendAppointmentConfirmationToStaff(a.id);
          if (r && r.success) sent++;
          else {
            failed++;
            errors.push((a.customerName || a.id) + ': ' + ((r && r.error) || 'Unknown error'));
          }
        } catch (err) {
          failed++;
          errors.push((a.customerName || a.id) + ': ' + err.toString());
        }
      }

      return {
        success: true,
        date: dateIso,
        companyId: companyId,
        eligibleCount: eligible.length,
        sentCount: sent,
        failedCount: failed,
        groupedLink: false,
        errors: errors.slice(0, 20)
      };
    }

    var batchResult = createDailyConfirmationBatch_(dateIso, companyId, eligible, email);
    if (!batchResult.success || !batchResult.linkUrl) {
      return { success: false, error: (batchResult && batchResult.error) || 'Unable to create daily batch link.' };
    }

    var messageHtml = '<b>📅 DAILY CONFIRMATION DRAFTS</b>\n'
      + '<b>Date:</b> ' + escapeTelegramHtml_(dateIso) + '\n'
      + '<b>Customers:</b> ' + eligible.length + '\n\n'
      + 'Open one link to send all daily confirmation texts. Each draft is checked off after opening.';
    var tgRes = sendTelegramBotMessage_(messageHtml, [
      { text: 'Open Daily Draft List (' + eligible.length + ')', url: batchResult.linkUrl }
    ]);

    var recipientId = getBrooksTelegramChatId_() || BROOKS_TELEGRAM_CHAT_ID || '';
    var recipient = 'telegram:' + recipientId;
    if (tgRes && tgRes.success) {
      for (var j = 0; j < eligible.length; j++) {
        logNotification(eligible[j].id, recipient, 'appt_confirmation_batch', 'Sent', 'Included in daily draft list ' + batchResult.token);
      }
      return {
        success: true,
        date: dateIso,
        companyId: companyId,
        eligibleCount: eligible.length,
        sentCount: eligible.length,
        failedCount: 0,
        groupedLink: true,
        batchToken: batchResult.token,
        linkUrl: batchResult.linkUrl,
        message: 'One Telegram link sent with all confirmation drafts.'
      };
    }

    return {
      success: false,
      error: (tgRes && tgRes.error) || 'Failed sending daily confirmation batch link to Telegram.'
    };

  } catch (error) {
    Logger.log('sendDailyConfirmationTexts error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

function sendDailyReviewRequests(targetDate, email) {
  try {
    var ctx = getCompanyIdForSchedulingUser_(email || '');
    var companyId = ctx.companyId || DEFAULT_COMPANY_ID;
    var dateIso = String(targetDate || '').trim();
    if (!dateIso) dateIso = formatSheetDate(new Date());

    var apptRes = getScheduledAppointments(companyId);
    if (!apptRes || !apptRes.success) {
      return { success: false, error: (apptRes && apptRes.error) || 'Unable to load appointments' };
    }

    var eligible = (apptRes.appointments || []).filter(function(a) {
      var status = String(a.status || '').toLowerCase().trim();
      var hasEmail = String(a.customerEmail || '').trim().length > 0;
      var alreadySent = String(a.reviewSent || '').toLowerCase() === 'yes' || a.reviewSent === true;
      return String(a.date || '').trim() === dateIso && hasEmail && status === 'completed' && !alreadySent;
    });

    var sent = 0;
    var failed = 0;
    var errors = [];

    for (var i = 0; i < eligible.length; i++) {
      var a = eligible[i];
      try {
        var r = sendReviewRequest(a.id);
        if (r && r.success) sent++;
        else {
          failed++;
          errors.push((a.customerName || a.id) + ': ' + ((r && r.error) || 'Unknown error'));
        }
      } catch (err) {
        failed++;
        errors.push((a.customerName || a.id) + ': ' + err.toString());
      }
    }

    return {
      success: true,
      date: dateIso,
      companyId: companyId,
      eligibleCount: eligible.length,
      sentCount: sent,
      failedCount: failed,
      errors: errors.slice(0, 20)
    };
  } catch (error) {
    Logger.log('sendDailyReviewRequests error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

// ===========================================================================
// DEBUG / TEST - Run this in the editor to see what's happening
// Select TEST_pullCustomers from dropdown → click ▶ → View → Logs
// ===========================================================================
function TEST_pullCustomers() {
  Logger.log('=== TESTING getCustomers("CMP-AQUALITYPOOL") ===');
  var result = getCustomers('CMP-AQUALITYPOOL');
  Logger.log('Found: ' + result.customers.length + ' customers');
  if (result.customers.length > 0) {
    Logger.log('');
    Logger.log('First 5:');
    for (var i = 0; i < Math.min(5, result.customers.length); i++) {
      var c = result.customers[i];
      Logger.log('  ' + (i+1) + '. [' + c.companyId + '] ' + c.name + ' | ' + c.email + ' | ' + c.phone + ' | ' + c.address);
    }
  } else {
    Logger.log('⚠️ 0 results — check that Column A has "CMP-AQUALITYPOOL" for your rows');
  }
}

function TEST_pullAppointments() {
  var ss = SpreadsheetApp.openById('1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0');
  var sheet = ss.getSheetByName('Appointments');

  if (!sheet) {
    Logger.log('❌ No "Appointments" sheet found! Available sheets:');
    ss.getSheets().forEach(function(s) { Logger.log('  → ' + s.getName()); });
    return;
  }

  var data = sheet.getDataRange().getValues();
  Logger.log('========================================');
  Logger.log('APPOINTMENTS SHEET DUMP');
  Logger.log('========================================');
  Logger.log('Total rows (including header): ' + data.length);
  Logger.log('Total columns: ' + (data[0] ? data[0].length : 0));
  Logger.log('');

  // Headers
  Logger.log('=== HEADERS ===');
  for (var h = 0; h < data[0].length; h++) {
    Logger.log('  Col ' + h + ' (Col ' + String.fromCharCode(65+h) + '): "' + data[0][h] + '"');
  }

  // All data rows
  Logger.log('');
  Logger.log('=== ALL DATA ROWS ===');
  for (var i = 1; i < data.length; i++) {
    Logger.log('--- Row ' + i + ' ---');
    Logger.log('  Col A (ID):          "' + data[i][0] + '"');
    Logger.log('  Col B (CompanyID):   "' + data[i][1] + '"');
    Logger.log('  Col C (CustomerID):  "' + data[i][2] + '"');
    Logger.log('  Col D (Name):        "' + data[i][3] + '"');
    Logger.log('  Col E (Email):       "' + data[i][4] + '"');
    Logger.log('  Col F (Phone):       "' + data[i][5] + '"');
    Logger.log('  Col G (Address):     "' + data[i][6] + '"');
    Logger.log('  Col H (ServiceType): "' + data[i][7] + '"');
    Logger.log('  Col I (Date):        "' + data[i][8] + '" → type: ' + typeof data[i][8] + (data[i][8] instanceof Date ? ' (Date object → ' + formatSheetDate(data[i][8]) + ')' : ''));
    Logger.log('  Col J (Time):        "' + data[i][9] + '"');
    Logger.log('  Col K (Duration):    "' + data[i][10] + '"');
    Logger.log('  Col L (Description): "' + data[i][11] + '"');
    Logger.log('  Col M (AssignedTo):  "' + data[i][12] + '"');
    Logger.log('  Col N (Status):      "' + data[i][13] + '"');
    Logger.log('  Col O (EstCost):     "' + data[i][14] + '"');
    Logger.log('  Col P (AmtPaid):     "' + data[i][15] + '"');
    Logger.log('  Col Q (Notes):       "' + data[i][16] + '"');
    Logger.log('  Col R (Recurring):   "' + data[i][17] + '"');
    Logger.log('  Col S (Notify):      "' + data[i][18] + '"');
    Logger.log('  Col T (NotifSent):   "' + data[i][19] + '"');
    Logger.log('  Col U (CalEventID):  "' + data[i][20] + '"');
    Logger.log('  Col V (ReviewSent):  "' + data[i][21] + '"');
    Logger.log('  Col W (CreatedAt):   "' + data[i][22] + '"');
    Logger.log('  Col X (UpdatedAt):   "' + data[i][23] + '"');
  }

  // Test with filter
  Logger.log('');
  Logger.log('========================================');
  Logger.log('TESTING getScheduledAppointments("CMP-AQUALITYPOOL")');
  Logger.log('========================================');
  var result = getScheduledAppointments('CMP-AQUALITYPOOL');
  Logger.log('Found: ' + result.appointments.length + ' appointments');
  result.appointments.forEach(function(a, idx) {
    Logger.log('  ' + (idx+1) + '. ' + a.customerName + ' | date=' + a.date + ' | service=' + a.serviceType + ' | status=' + a.status);
  });

  // Test without filter
  Logger.log('');
  Logger.log('TESTING getScheduledAppointments(null) — NO FILTER');
  var result2 = getScheduledAppointments(null);
  Logger.log('Found: ' + result2.appointments.length + ' appointments');
  result2.appointments.forEach(function(a, idx) {
    Logger.log('  ' + (idx+1) + '. companyId="' + a.companyId + '" | ' + a.customerName + ' | date=' + a.date);
  });
}

function TEST_pullTechnicians() {
  Logger.log('=== TESTING getTechnicians("CMP-AQUALITYPOOL") ===');
  var result = getTechnicians('CMP-AQUALITYPOOL');
  Logger.log('Success: ' + result.success);
  Logger.log('Found: ' + result.technicians.length + ' technicians');
  
  if (result.technicians.length > 0) {
    result.technicians.forEach(function(t, i) {
      Logger.log('  ' + (i+1) + '. ' + t.name + ' | CompanyID: ' + t.companyId + ' | Role: ' + t.role + ' | Active: ' + t.active);
    });
  }
  
  // Check raw sheet data
  Logger.log('');
  Logger.log('=== RAW TECHNICIANS SHEET DATA ===');
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Technicians');
  if (sheet) {
    var data = sheet.getDataRange().getValues();
    Logger.log('Total rows (including header): ' + data.length);
    if (data.length > 0) {
      Logger.log('Headers: ' + JSON.stringify(data[0]));
      for (var k = 1; k < data.length; k++) {
        Logger.log('--- Row ' + k + ' ---');
        Logger.log('  Col A (TechID):      "' + data[k][0] + '"');
        Logger.log('  Col B (CompanyID):   "' + data[k][1] + '"');
        Logger.log('  Col C (Name):        "' + data[k][2] + '"');
        Logger.log('  Col D (Phone):       "' + data[k][3] + '"');
        Logger.log('  Col E (Email):       "' + data[k][4] + '"');
        Logger.log('  Col F (Role):        "' + data[k][5] + '"');
        Logger.log('  Col G (HourlyRate):  "' + data[k][6] + '"');
        Logger.log('  Col H (ServiceTypes):"' + data[k][7] + '"');
        Logger.log('  Col I (Color):       "' + data[k][8] + '"');
        Logger.log('  Col J (Active):      "' + data[k][9] + '"');
      }
    }
  } else {
    Logger.log('⚠️ No Technicians sheet found!');
  }
  
  // Also test without filter
  Logger.log('');
  Logger.log('=== TESTING getTechnicians("") — NO FILTER ===');
  var result2 = getTechnicians('');
  Logger.log('Found: ' + result2.technicians.length + ' technicians');
  if (result2.technicians.length > 0) {
    result2.technicians.forEach(function(t, i) {
      Logger.log('  ' + (i+1) + '. ' + t.name + ' | CompanyID="' + t.companyId + '" | Active="' + t.active + '"');
    });
  }
}

function TEST_googleReviews() {
  Logger.log('=== TESTING Google Places API ===');
  Logger.log('Place ID: ' + GOOGLE_PLACE_ID);
  Logger.log('API Key: ' + MAPS_API_KEY.substring(0, 10) + '...');
  Logger.log('');

  var result = fetchGoogleReviews();
  Logger.log('Success: ' + result.success);

  if (result.success) {
    Logger.log('Business: ' + result.placeName);
    Logger.log('Rating: ' + result.overallRating + ' ⭐');
    Logger.log('Total Reviews: ' + result.totalReviews);
    Logger.log('');
    Logger.log('Recent reviews:');
    result.reviews.forEach(function(r, i) {
      Logger.log('  ' + (i+1) + '. ' + r.author + ' — ' + r.rating + '⭐ — "' + (r.text || '(no text)').substring(0, 80) + '..."');
    });
  } else {
    Logger.log('❌ ERROR: ' + result.error);
    Logger.log('');
    Logger.log('To fix:');
    Logger.log('  1. Go to console.cloud.google.com');
    Logger.log('  2. APIs & Services → Library');
    Logger.log('  3. Search "Places API" → Enable it');
    Logger.log('  4. Make sure your API key has no IP/referrer restrictions blocking server-side calls');
  }
}

// ===========================================================================
// REVIEW MANAGEMENT SYSTEM
// ===========================================================================
const REVIEWS_SHEET = 'Reviews';
const GOOGLE_PLACE_ID = 'ChIJ4980w4w3XIgRriAGJz7DxnA';
const MAPS_API_KEY = 'REDACTED';
// GOOGLE_REVIEW_URL already declared above (line ~1010)

const REVIEW_HEADERS = [
  'ReviewID',       // A - unique ID
  'CompanyID',      // B
  'CustomerEmail',  // C - linked to Customers sheet
  'CustomerName',   // D
  'CustomerPhone',  // E
  'ServiceType',    // F
  'AppointmentID',  // G - linked to Appointments
  'RequestMethod',  // H - Email, Text, Both
  'RequestSentAt',  // I - timestamp of last send
  'TimesRequested', // J - how many times we asked
  'CustomMessage',  // K - custom text used
  'ReviewReceived', // L - Yes / No / Pending
  'ReceivedAt',     // M - when we marked it received
  'ReviewRating',   // N - 1-5 stars
  'ReviewText',     // O - snippet of the actual review
  'GoogleAuthor',   // P - matched Google review author
  'ResponseSent',   // Q - Yes / No
  'ResponseText',   // R - what we responded with
  'ResponseSentAt', // S - when response was sent
  'Tags',           // T - comma-separated tags
  'Notes',          // U - internal notes
  'CreatedAt',      // V
  'UpdatedAt'       // W
];

const REV_COL = {
  ID:0, COMPANY_ID:1, EMAIL:2, NAME:3, PHONE:4, SERVICE_TYPE:5,
  APPT_ID:6, METHOD:7, SENT_AT:8, TIMES_REQUESTED:9, CUSTOM_MSG:10,
  RECEIVED:11, RECEIVED_AT:12, RATING:13, REVIEW_TEXT:14, GOOGLE_AUTHOR:15,
  RESPONSE_SENT:16, RESPONSE_TEXT:17, RESPONSE_SENT_AT:18,
  TAGS:19, NOTES:20, CREATED_AT:21, UPDATED_AT:22
};

function initializeReviewsSheet() {
  getOrCreateSheet(REVIEWS_SHEET, REVIEW_HEADERS);
  Logger.log('  ✅ Reviews sheet ready');
}

/** Create or update a review request */
function saveReviewRequest(data) {
  try {
    const sheet = getOrCreateSheet(REVIEWS_SHEET, REVIEW_HEADERS);
    const now = new Date().toISOString();

    // Check if one already exists for this email+appointment
    if (data.id || (data.customerEmail && data.appointmentId)) {
      const values = sheet.getDataRange().getValues();
      for (let i = 1; i < values.length; i++) {
        const matchById = data.id && values[i][REV_COL.ID] === data.id;
        const matchByAppt = !data.id && values[i][REV_COL.EMAIL] === data.customerEmail &&
                            values[i][REV_COL.APPT_ID] === data.appointmentId;
        if (matchById || matchByAppt) {
          const row = i + 1;
          // Update existing
          if (data.requestMethod) sheet.getRange(row, REV_COL.METHOD+1).setValue(data.requestMethod);
          if (data.customMessage !== undefined) sheet.getRange(row, REV_COL.CUSTOM_MSG+1).setValue(data.customMessage);
          if (data.reviewReceived) {
            sheet.getRange(row, REV_COL.RECEIVED+1).setValue(data.reviewReceived);
            if (data.reviewReceived === 'Yes') sheet.getRange(row, REV_COL.RECEIVED_AT+1).setValue(now);
          }
          if (data.reviewRating) sheet.getRange(row, REV_COL.RATING+1).setValue(data.reviewRating);
          if (data.reviewText) sheet.getRange(row, REV_COL.REVIEW_TEXT+1).setValue(data.reviewText);
          if (data.googleAuthor) sheet.getRange(row, REV_COL.GOOGLE_AUTHOR+1).setValue(data.googleAuthor);
          if (data.responseSent) sheet.getRange(row, REV_COL.RESPONSE_SENT+1).setValue(data.responseSent);
          if (data.responseText) sheet.getRange(row, REV_COL.RESPONSE_TEXT+1).setValue(data.responseText);
          if (data.responseSent === 'Yes') sheet.getRange(row, REV_COL.RESPONSE_SENT_AT+1).setValue(now);
          if (data.tags) sheet.getRange(row, REV_COL.TAGS+1).setValue(data.tags);
          if (data.notes !== undefined) sheet.getRange(row, REV_COL.NOTES+1).setValue(data.notes);
          
          // Update invoice-related fields if they exist
          const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
          const invoiceIdCol = headerRow.indexOf('InvoiceID');
          const reviewActionCol = headerRow.indexOf('ReviewAction');
          const reviewPlatformCol = headerRow.indexOf('ReviewPlatform');
          if (data.invoiceId !== undefined && invoiceIdCol >= 0) sheet.getRange(row, invoiceIdCol+1).setValue(data.invoiceId || '');
          if (data.reviewAction !== undefined && reviewActionCol >= 0) sheet.getRange(row, reviewActionCol+1).setValue(data.reviewAction || '');
          if (data.reviewPlatform !== undefined && reviewPlatformCol >= 0) sheet.getRange(row, reviewPlatformCol+1).setValue(data.reviewPlatform || '');

          // Increment times requested if resending
          if (data.resend) {
            const times = parseInt(values[i][REV_COL.TIMES_REQUESTED]) || 0;
            sheet.getRange(row, REV_COL.TIMES_REQUESTED+1).setValue(times + 1);
            sheet.getRange(row, REV_COL.SENT_AT+1).setValue(now);
          }

          sheet.getRange(row, REV_COL.UPDATED_AT+1).setValue(now);
          return { success: true, message: 'Review request updated', reviewId: values[i][REV_COL.ID] };
        }
      }
    }

    // Create new
    const reviewId = 'REV-' + Date.now();
    const newRow = [];
    newRow[REV_COL.ID] = reviewId;
    newRow[REV_COL.COMPANY_ID] = data.companyId || 'CMP-AQUALITYPOOL';
    newRow[REV_COL.EMAIL] = data.customerEmail || '';
    newRow[REV_COL.NAME] = data.customerName || '';
    newRow[REV_COL.PHONE] = data.customerPhone || '';
    newRow[REV_COL.SERVICE_TYPE] = data.serviceType || '';
    newRow[REV_COL.APPT_ID] = data.appointmentId || '';
    newRow[REV_COL.METHOD] = data.requestMethod || 'Email';
    newRow[REV_COL.SENT_AT] = now;
    newRow[REV_COL.TIMES_REQUESTED] = 1;
    newRow[REV_COL.CUSTOM_MSG] = data.customMessage || '';
    newRow[REV_COL.RECEIVED] = 'Pending';
    newRow[REV_COL.RECEIVED_AT] = '';
    newRow[REV_COL.RATING] = '';
    newRow[REV_COL.REVIEW_TEXT] = '';
    newRow[REV_COL.GOOGLE_AUTHOR] = '';
    newRow[REV_COL.RESPONSE_SENT] = 'No';
    newRow[REV_COL.RESPONSE_TEXT] = '';
    newRow[REV_COL.RESPONSE_SENT_AT] = '';
    newRow[REV_COL.TAGS] = data.tags || '';
    newRow[REV_COL.NOTES] = data.notes || '';
    newRow[REV_COL.CREATED_AT] = now;
    newRow[REV_COL.UPDATED_AT] = now;
    
    // Add invoice-related fields if columns exist
    const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const invoiceIdCol = headerRow.indexOf('InvoiceID');
    const reviewActionCol = headerRow.indexOf('ReviewAction');
    const reviewPlatformCol = headerRow.indexOf('ReviewPlatform');
    
    // Extend row array if needed
    while (newRow.length < sheet.getLastColumn()) {
      newRow.push('');
    }
    
    if (invoiceIdCol >= 0 && data.invoiceId) newRow[invoiceIdCol] = data.invoiceId;
    if (reviewActionCol >= 0 && data.reviewAction) newRow[reviewActionCol] = data.reviewAction;
    if (reviewPlatformCol >= 0 && data.reviewPlatform) newRow[reviewPlatformCol] = data.reviewPlatform;

    sheet.appendRow(newRow);
    return { success: true, message: 'Review request created', reviewId: reviewId };
  } catch (error) {
    Logger.log('Error in saveReviewRequest: ' + error);
    return { success: false, error: error.toString() };
  }
}

/** Get all review requests */
function getReviewRequests(companyId) {
  try {
    const sheet = getOrCreateSheet(REVIEWS_SHEET, REVIEW_HEADERS);
    const values = sheet.getDataRange().getValues();
    const reviews = [];

    for (let i = 1; i < values.length; i++) {
      if (!companyId || values[i][REV_COL.COMPANY_ID] === companyId) {
        // Get invoice ID, review action, and platform if columns exist
        const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        const invoiceIdCol = headerRow.indexOf('InvoiceID');
        const reviewActionCol = headerRow.indexOf('ReviewAction');
        const reviewPlatformCol = headerRow.indexOf('ReviewPlatform');
        
        reviews.push({
          id: values[i][REV_COL.ID],
          companyId: values[i][REV_COL.COMPANY_ID],
          customerEmail: values[i][REV_COL.EMAIL],
          customerName: values[i][REV_COL.NAME],
          customerPhone: values[i][REV_COL.PHONE],
          serviceType: values[i][REV_COL.SERVICE_TYPE],
          appointmentId: values[i][REV_COL.APPT_ID],
          requestMethod: values[i][REV_COL.METHOD],
          sentAt: values[i][REV_COL.SENT_AT],
          timesRequested: parseInt(values[i][REV_COL.TIMES_REQUESTED]) || 0,
          customMessage: values[i][REV_COL.CUSTOM_MSG],
          reviewReceived: values[i][REV_COL.RECEIVED] || 'Pending',
          receivedAt: values[i][REV_COL.RECEIVED_AT],
          reviewRating: values[i][REV_COL.RATING],
          reviewText: values[i][REV_COL.REVIEW_TEXT],
          googleAuthor: values[i][REV_COL.GOOGLE_AUTHOR],
          responseSent: values[i][REV_COL.RESPONSE_SENT],
          responseText: values[i][REV_COL.RESPONSE_TEXT],
          responseSentAt: values[i][REV_COL.RESPONSE_SENT_AT],
          tags: values[i][REV_COL.TAGS],
          notes: values[i][REV_COL.NOTES],
          createdAt: values[i][REV_COL.CREATED_AT],
          updatedAt: values[i][REV_COL.UPDATED_AT],
          invoiceId: invoiceIdCol >= 0 ? (values[i][invoiceIdCol] || '') : '',
          reviewAction: reviewActionCol >= 0 ? (values[i][reviewActionCol] || '') : '',
          reviewPlatform: reviewPlatformCol >= 0 ? (values[i][reviewPlatformCol] || '') : ''
        });
      }
    }

    reviews.sort(function(a, b) { return (b.sentAt || '').localeCompare(a.sentAt || ''); });
    return { success: true, reviews: reviews };
  } catch (error) {
    Logger.log('Error in getReviewRequests: ' + error);
    return { success: false, error: error.toString(), reviews: [] };
  }
}

/** Fetch Google reviews from Places API */
function fetchGoogleReviews() {
  try {
    const url = 'https://maps.googleapis.com/maps/api/place/details/json'
      + '?place_id=' + GOOGLE_PLACE_ID
      + '&fields=name,rating,user_ratings_total,reviews'
      + '&key=' + MAPS_API_KEY;

    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const json = JSON.parse(response.getContentText());

    if (json.status !== 'OK') {
      return { success: false, error: 'Places API error: ' + json.status, reviews: [] };
    }

    const place = json.result || {};
    const googleReviews = (place.reviews || []).map(function(r) {
      return {
        author: r.author_name || '',
        authorUrl: r.author_url || '',
        profilePhoto: r.profile_photo_url || '',
        rating: r.rating || 0,
        text: r.text || '',
        time: r.time ? new Date(r.time * 1000).toISOString() : '',
        relativeTime: r.relative_time_description || '',
        language: r.language || 'en'
      };
    });

    return {
      success: true,
      placeName: place.name || '',
      overallRating: place.rating || 0,
      totalReviews: place.user_ratings_total || 0,
      reviews: googleReviews
    };
  } catch (error) {
    Logger.log('Error fetching Google reviews: ' + error);
    return { success: false, error: error.toString(), reviews: [] };
  }
}

/** Resend a review request — sends email and/or text, increments counter */
function resendReviewRequest(reviewId, customMessage) {
  try {
    const sheet = getOrCreateSheet(REVIEWS_SHEET, REVIEW_HEADERS);
    const values = sheet.getDataRange().getValues();

    for (let i = 1; i < values.length; i++) {
      if (values[i][REV_COL.ID] === reviewId) {
        const name = values[i][REV_COL.NAME];
        const email = values[i][REV_COL.EMAIL];
        const phone = values[i][REV_COL.PHONE];
        const serviceType = values[i][REV_COL.SERVICE_TYPE];
        const method = values[i][REV_COL.METHOD];
        const now = new Date().toISOString();

        // Use custom message or default
        const msg = customMessage || values[i][REV_COL.CUSTOM_MSG] || '';

        var emailSent = false;
        var textSent = false;

        // Check if customer has a pool (for special offer)
        const customerTagsResult = getCustomerTags(email);
        const hasPool = customerTagsResult.success && customerTagsResult.tags && customerTagsResult.tags.includes('has-pool');

        // Build the personalized message (same for email + text)
        const firstName = (name || 'there').split(' ')[0];
        const isSnow = serviceType === 'Snow Removal';
        var textMessage = msg;
        if (!textMessage) {
          if (isSnow) {
            textMessage = 'Hey ' + firstName + '! 👋 Thanks for trusting us with your snow removal this season — we really appreciate it! '
              + 'Just wanted to let you know that when the snow melts, we stay busy year-round with pools, excavation, and concrete work. '
              + 'If you or anyone you know ever needs help with a project, we\'d love to be your go-to!';
            
            // Add $50 off pool service offer if customer has a pool
            if (hasPool) {
              textMessage += '\n\n💰 SPECIAL OFFER: Since you have a pool, we\'d like to offer you $50 off your next pool service (opening, closing, or regular service)! Just mention this email when you book.';
            }
            
            textMessage += '\n\nIf you have a minute, we\'d be so grateful if you could leave us a quick review — it really helps us reach more people who need quality service:\n'
              + 'Google: ' + GOOGLE_REVIEW_URL + '\n'
              + 'Facebook: ' + FACEBOOK_REVIEW_URL + '\n\n'
              + 'Thank you so much, and don\'t hesitate to reach out anytime! 🙏';
          } else {
            textMessage = 'Hey ' + firstName + '! 👋\n\n'
              + 'We hope your ' + (serviceType || 'service').toLowerCase() + ' was wonderful and everything turned out exactly how you wanted!\n\n'
              + 'If you have a quick moment, we\'d really appreciate a review — it helps us continue serving great people like you:\n'
              + 'Google: ' + GOOGLE_REVIEW_URL + '\n'
              + 'Facebook: ' + FACEBOOK_REVIEW_URL + '\n\n'
              + 'Thank you for choosing A Quality Pool Company! 🙏';
          }
        }

        // Send email to customer (same message as text, wrapped in HTML)
        if (email && (method === 'Email' || method === 'Both')) {
          const htmlBody = buildCustomerReviewEmail(name, serviceType, '', 0, 'A Quality Pool Company', GOOGLE_REVIEW_URL, FACEBOOK_REVIEW_URL, textMessage, hasPool && isSnow);
          MailApp.sendEmail({
            to: email,
            subject: isSnow ? 'A Quality Pool Company — Thanks for Choosing Us, ' + firstName + '!' : 'A Quality Pool Company — We Hope Your Service Was Wonderful!',
            htmlBody: htmlBody
          });
          emailSent = true;
        }

        // Send Telegram text template to Brooks
        if (phone && (method === 'Text' || method === 'Both')) {
          const tg = sendBrooksTelegramDraft_(
            id,
            'review_text_template',
            'Review request draft',
            [
              { label: 'Customer', value: name || 'Customer' },
              { label: 'Phone', value: phone || 'N/A' },
              { label: 'Email', value: email || 'N/A' },
              { label: 'Service', value: serviceType || 'Service' }
            ],
            textMessage
          );
          textSent = !!tg.success;
        }

        // Update sheet
        const row = i + 1;
        const times = (parseInt(values[i][REV_COL.TIMES_REQUESTED]) || 0) + 1;
        sheet.getRange(row, REV_COL.SENT_AT+1).setValue(now);
        sheet.getRange(row, REV_COL.TIMES_REQUESTED+1).setValue(times);
        if (customMessage) sheet.getRange(row, REV_COL.CUSTOM_MSG+1).setValue(customMessage);
        sheet.getRange(row, REV_COL.UPDATED_AT+1).setValue(now);

        return { success: true, emailSent: emailSent, textSent: textSent, timesRequested: times };
      }
    }
    return { success: false, error: 'Review request not found' };
  } catch (error) {
    Logger.log('Error in resendReviewRequest: ' + error);
    return { success: false, error: error.toString() };
  }
}

/** Mark a review as received */
function markReviewReceived(reviewId, rating, reviewText, googleAuthor) {
  return saveReviewRequest({
    id: reviewId,
    reviewReceived: 'Yes',
    reviewRating: rating || '',
    reviewText: reviewText || '',
    googleAuthor: googleAuthor || ''
  });
}

/** Get review stats */
function getReviewStats(companyId) {
  try {
    const result = getReviewRequests(companyId);
    if (!result.success) return result;

    const reviews = result.reviews;
    const total = reviews.length;
    const pending = reviews.filter(r => r.reviewReceived === 'Pending').length;
    const received = reviews.filter(r => r.reviewReceived === 'Yes').length;
    const noResponse = reviews.filter(r => r.reviewReceived === 'No').length;
    const responded = reviews.filter(r => r.responseSent === 'Yes').length;
    const conversionRate = total > 0 ? Math.round((received / total) * 100) : 0;

    return {
      success: true,
      stats: {
        totalRequests: total,
        pending: pending,
        received: received,
        noResponse: noResponse,
        responded: responded,
        conversionRate: conversionRate
      }
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/** Fetch Google reviews from Places API */
function fetchGoogleReviews() {
  try {
    const url = 'https://maps.googleapis.com/maps/api/place/details/json'
      + '?place_id=' + GOOGLE_PLACE_ID
      + '&fields=name,rating,user_ratings_total,reviews'
      + '&key=' + MAPS_API_KEY;

    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const json = JSON.parse(response.getContentText());

    if (json.status !== 'OK') {
      return { success: false, error: 'Places API error: ' + json.status, reviews: [] };
    }

    const place = json.result || {};
    const googleReviews = (place.reviews || []).map(function(r) {
      return {
        author: r.author_name || '',
        authorUrl: r.author_url || '',
        profilePhoto: r.profile_photo_url || '',
        rating: r.rating || 0,
        text: r.text || '',
        time: r.time ? new Date(r.time * 1000).toISOString() : '',
        relativeTime: r.relative_time_description || '',
        language: r.language || 'en'
      };
    });

    return {
      success: true,
      placeName: place.name || '',
      overallRating: place.rating || 0,
      totalReviews: place.user_ratings_total || 0,
      reviews: googleReviews
    };
  } catch (error) {
    Logger.log('Error fetching Google reviews: ' + error);
    return { success: false, error: error.toString(), reviews: [] };
  }
}

/** Resend a review request — sends email and/or text, increments counter */
function resendReviewRequest(reviewId, customMessage) {
  try {
    const sheet = getOrCreateSheet(REVIEWS_SHEET, REVIEW_HEADERS);
    const values = sheet.getDataRange().getValues();

    for (let i = 1; i < values.length; i++) {
      if (values[i][REV_COL.ID] === reviewId) {
        const name = values[i][REV_COL.NAME];
        const email = values[i][REV_COL.EMAIL];
        const phone = values[i][REV_COL.PHONE];
        const serviceType = values[i][REV_COL.SERVICE_TYPE];
        const method = values[i][REV_COL.METHOD];
        const now = new Date().toISOString();

        // Use custom message or default
        const msg = customMessage || values[i][REV_COL.CUSTOM_MSG] || '';

        var emailSent = false;
        var textSent = false;

        // Check if customer has a pool (for special offer)
        const customerTagsResult = getCustomerTags(email);
        const hasPool = customerTagsResult.success && customerTagsResult.tags && customerTagsResult.tags.includes('has-pool');

        // Build the personalized message (same for email + text)
        const firstName = (name || 'there').split(' ')[0];
        const isSnow = serviceType === 'Snow Removal';
        var textMessage = msg;
        if (!textMessage) {
          if (isSnow) {
            textMessage = 'Hey ' + firstName + '! 👋 Thanks for trusting us with your snow removal this season — we really appreciate it! '
              + 'Just wanted to let you know that when the snow melts, we stay busy year-round with pools, excavation, and concrete work. '
              + 'If you or anyone you know ever needs help with a project, we\'d love to be your go-to!';
            
            // Add $50 off pool service offer if customer has a pool
            if (hasPool) {
              textMessage += '\n\n💰 SPECIAL OFFER: Since you have a pool, we\'d like to offer you $50 off your next pool service (opening, closing, or regular service)! Just mention this email when you book.';
            }
            
            textMessage += '\n\nIf you have a minute, we\'d be so grateful if you could leave us a quick review — it really helps us reach more people who need quality service:\n'
              + 'Google: ' + GOOGLE_REVIEW_URL + '\n'
              + 'Facebook: ' + FACEBOOK_REVIEW_URL + '\n\n'
              + 'Thank you so much, and don\'t hesitate to reach out anytime! 🙏';
          } else {
            textMessage = 'Hey ' + firstName + '! 👋\n\n'
              + 'We hope your ' + (serviceType || 'service').toLowerCase() + ' was wonderful and everything turned out exactly how you wanted!\n\n'
              + 'If you have a quick moment, we\'d really appreciate a review — it helps us continue serving great people like you:\n'
              + 'Google: ' + GOOGLE_REVIEW_URL + '\n'
              + 'Facebook: ' + FACEBOOK_REVIEW_URL + '\n\n'
              + 'Thank you for choosing A Quality Pool Company! 🙏';
          }
        }

        // Send email to customer (same message as text, wrapped in HTML)
        if (email && (method === 'Email' || method === 'Both')) {
          const htmlBody = buildCustomerReviewEmail(name, serviceType, '', 0, 'A Quality Pool Company', GOOGLE_REVIEW_URL, FACEBOOK_REVIEW_URL, textMessage, hasPool && isSnow);
          MailApp.sendEmail({
            to: email,
            subject: isSnow ? 'A Quality Pool Company — Thanks for Choosing Us, ' + firstName + '!' : 'A Quality Pool Company — We Hope Your Service Was Wonderful!',
            htmlBody: htmlBody
          });
          emailSent = true;
        }

        // Send Telegram text template to Brooks
        if (phone && (method === 'Text' || method === 'Both')) {
          const tg = sendBrooksTelegramDraft_(
            id,
            'review_text_template',
            'Review request draft',
            [
              { label: 'Customer', value: name || 'Customer' },
              { label: 'Phone', value: phone || 'N/A' },
              { label: 'Email', value: email || 'N/A' },
              { label: 'Service', value: serviceType || 'Service' }
            ],
            textMessage
          );
          textSent = !!tg.success;
        }

        // Update sheet
        const row = i + 1;
        const times = (parseInt(values[i][REV_COL.TIMES_REQUESTED]) || 0) + 1;
        sheet.getRange(row, REV_COL.SENT_AT+1).setValue(now);
        sheet.getRange(row, REV_COL.TIMES_REQUESTED+1).setValue(times);
        if (customMessage) sheet.getRange(row, REV_COL.CUSTOM_MSG+1).setValue(customMessage);
        sheet.getRange(row, REV_COL.UPDATED_AT+1).setValue(now);

        return { success: true, emailSent: emailSent, textSent: textSent, timesRequested: times };
      }
    }
    return { success: false, error: 'Review request not found' };
  } catch (error) {
    Logger.log('Error in resendReviewRequest: ' + error);
    return { success: false, error: error.toString() };
  }
}

/** Mark a review as received */
function markReviewReceived(reviewId, rating, reviewText, googleAuthor) {
  return saveReviewRequest({
    id: reviewId,
    reviewReceived: 'Yes',
    reviewRating: rating || '',
    reviewText: reviewText || '',
    googleAuthor: googleAuthor || ''
  });
}

/** Get review stats */
function getReviewStats(companyId) {
  try {
    const result = getReviewRequests(companyId);
    if (!result.success) return result;

    const reviews = result.reviews;
    const total = reviews.length;
    const pending = reviews.filter(r => r.reviewReceived === 'Pending').length;
    const received = reviews.filter(r => r.reviewReceived === 'Yes').length;
    const noResponse = reviews.filter(r => r.reviewReceived === 'No').length;
    const responded = reviews.filter(r => r.responseSent === 'Yes').length;
    const conversionRate = total > 0 ? Math.round((received / total) * 100) : 0;

    return {
      success: true,
      stats: {
        totalRequests: total,
        pending: pending,
        received: received,
        noResponse: noResponse,
        responded: responded,
        conversionRate: conversionRate
      }
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}


// ===========================================================================
// INVOICE INTEGRATION
// ===========================================================================
const INVOICES_ESTIMATES_SHEET = 'Invoices & Estimates';
const PRICE_BOOK_SHEET = 'Price book';
const LABOR_SHEET = 'Labor';

function getPriceBookItemsByCategory_(categoryPattern) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(PRICE_BOOK_SHEET);
    if (!sheet) return { success: true, items: [] };

    // Match ItemList.gs schema exactly: data starts at row 7, columns A:I.
    const lastRow = sheet.getLastRow();
    if (lastRow < 7) return { success: true, items: [] };
    const values = sheet.getRange(7, 1, lastRow - 6, 9).getValues();

    const items = [];
    for (var r = 0; r < values.length; r++) {
      const row = values[r];

      const brand = String(row[0] || '').trim();
      const code = String(row[1] || '').trim();
      const name = String(row[2] || '').trim();
      const category = String(row[3] || 'Other').trim();
      const unit = String(row[4] || 'Each').trim();
      const price = parseFloat(row[5]) || 0;
      const description = String(row[6] || '').trim();
      const activeVal = row[8];
      const isActive = activeVal === true || activeVal === 'TRUE' || activeVal === 'true' || activeVal === 1 || activeVal === '1';

      if (!isActive) continue;
      if (!name) continue;
      if (categoryPattern && !categoryPattern.test(category)) continue;

      items.push({
        code: code,
        brand: brand,
        name: name,
        category: category || 'Other',
        unit: unit || 'Each',
        price: price,
        description: description
      });
    }

    items.sort(function(a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''));
    });

    return { success: true, items: items };
  } catch (e) {
    Logger.log('getPriceBookItemsByCategory_ error: ' + e.toString());
    return { success: false, error: e.toString(), items: [] };
  }
}

function getPriceBookChemicalItems() {
  // Try to get items with "Chemical" category, but fall back to all items if none found
  var result = getPriceBookItemsByCategory_(/chemical/i);
  if (result.success && result.items.length === 0) {
    // Fall back: return all items (user can select what they need)
    result = getPriceBookItemsByCategory_(null);
  }
  return result;
}

function getPriceBookLaborItems() {
  // Try to get items with "Labor" or "Service" category, but fall back to all items if none found
  var result = getPriceBookItemsByCategory_(/labor|service/i);
  if (result.success && result.items.length === 0) {
    // Fall back: return all items (user can select what they need)
    result = getPriceBookItemsByCategory_(null);
  }
  return result;
}

function getLaborSheetItems() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(LABOR_SHEET);
    if (!sheet) return { success: true, items: [] };

    const data = sheet.getDataRange().getValues();
    if (!data || data.length <= 1) return { success: true, items: [] };

    // Labor sheet expected layout:
    // Row 4 (index 3): headers
    // Row 6 (index 5): data starts
    let nameCol = 0;
    let categoryCol = 1;
    let unitCol = 2;
    let rateCol = 3;
    let descCol = 4;
    let activeCol = 6;

    if (data.length > 3) {
      const headers = (data[3] || []).map(function(h) { return String(h || '').toLowerCase().trim(); });
      for (let i = 0; i < headers.length; i++) {
        const h = headers[i];
        if (h.includes('labor type') || (h.includes('labor') && h.includes('type'))) nameCol = i;
        else if (h === 'category' || h.includes('category')) categoryCol = i;
        else if (h === 'unit') unitCol = i;
        else if (h === 'rate' || h.includes('rate')) rateCol = i;
        else if (h === 'description' || h.includes('description')) descCol = i;
        else if (h === 'active') activeCol = i;
      }
    }

    const items = [];
    for (let r = 5; r < data.length; r++) {
      const row = data[r] || [];
      const name = String(row[nameCol] || '').trim();
      if (!name) continue;

      const activeVal = row.length > activeCol ? row[activeCol] : true;
      const active = !(activeVal === false || activeVal === 'FALSE' || activeVal === 'false' || activeVal === 'No' || activeVal === 'N' || activeVal === 0 || activeVal === '0' || activeVal === '');
      if (!active) continue;

      const rateRaw = row[rateCol];
      let price = 0;
      if (typeof rateRaw === 'number') price = rateRaw;
      else if (typeof rateRaw === 'string') price = parseFloat(rateRaw.replace(/[$,]/g, '')) || 0;
      else price = parseFloat(rateRaw) || 0;

      items.push({
        code: '',
        brand: '',
        name: name,
        category: String(row[categoryCol] || 'General').trim() || 'General',
        unit: String(row[unitCol] || 'Hour').trim() || 'Hour',
        price: price,
        description: String(row[descCol] || '').trim()
      });
    }

    items.sort(function(a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''));
    });

    return { success: true, items: items };
  } catch (e) {
    Logger.log('getLaborSheetItems error: ' + e.toString());
    return { success: false, error: e.toString(), items: [] };
  }
}

function getAllPriceBookItems() {
  // Get all items regardless of category
  return getPriceBookItemsByCategory_(null);
}

function debugPriceBook() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(PRICE_BOOK_SHEET);
    if (!sheet) return { error: 'Price book sheet not found', sheetNames: ss.getSheets().map(s => s.getName()) };
    
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const rows = values.slice(1, Math.min(10, values.length));
    
    // Show all unique categories
    const categories = new Set();
    for (var i = 1; i < values.length; i++) {
      const row = values[i];
      if (row.length > 3) {
        categories.add(String(row[3] || '').trim());
      }
    }
    
    return {
      sheetFound: true,
      headers: headers,
      sampleRows: rows,
      totalRows: values.length - 1,
      uniqueCategories: Array.from(categories).sort(),
      itemCount: values.length - 1
    };
  } catch (e) {
    return { error: e.toString() };
  }
}

function getInvoiceSummaryById_(invoiceId) {
  try {
    if (!invoiceId) return { success: false, error: 'Invoice ID required' };
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(INVOICES_ESTIMATES_SHEET);
    if (!sheet || sheet.getLastRow() < 2) return { success: false, error: 'Invoice sheet not found' };

    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      const rowId = String(rows[i][1] || '').trim();
      if (rowId !== String(invoiceId)) continue;

      const jsonStr = String(rows[i][3] || '') + String(rows[i][4] || '') + String(rows[i][5] || '');
      let json = {};
      try { json = jsonStr ? JSON.parse(jsonStr.replace(/""/g, '"')) : {}; } catch (e) { json = {}; }

      return {
        success: true,
        id: rowId,
        invoiceNumber: String((json && json.invoiceNumber) || rowId),
        shareLink: String((json && json.shareLink) || ''),
        paymentLink: String((json && json.paymentLink) || ''),
        pdfUrl: String((json && json.pdfUrl) || ''),
        customerEmail: String((json && json.customerEmail) || rows[i][2] || '')
      };
    }
    return { success: false, error: 'Invoice not found' };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function createServiceCompletionInvoiceForAppointment(payload) {
  try {
    payload = payload || {};
    const appointmentId = String(payload.appointmentId || '').trim();
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!appointmentId) return { success: false, error: 'appointmentId is required' };
    if (!items.length) return { success: false, error: 'At least one invoice item is required' };

    const apptResult = getScheduledAppointments();
    if (!apptResult || !apptResult.success) return { success: false, error: (apptResult && apptResult.error) || 'Unable to load appointments' };
    const appt = (apptResult.appointments || []).find(function(a) { return String(a.id || '') === appointmentId; });
    if (!appt) return { success: false, error: 'Appointment not found' };
    if (!appt.customerEmail) return { success: false, error: 'Customer email missing on appointment' };

    const normalizedItems = items
      .map(function(it) {
        const qty = parseFloat(it.quantity || 0) || 0;
        const price = parseFloat(it.price || 0) || 0;
        const category = String(it.category || '').trim() || 'Service';
        return {
          name: String(it.name || '').trim(),
          quantity: qty,
          price: price,
          unit: String(it.unit || 'ea').trim(),
          category: category,
          description: String(it.description || '').trim(),
          lineTotal: parseFloat((qty * price).toFixed(2))
        };
      })
      .filter(function(it) { return it.name && it.quantity > 0; });

    if (!normalizedItems.length) return { success: false, error: 'No valid line items to invoice' };

    const invoiceData = {
      type: 'Invoice',
      customerName: String(appt.customerName || '').trim(),
      customerEmail: String(appt.customerEmail || '').trim(),
      customerPhone: String(appt.customerPhone || '').trim(),
      customerAddress: String(appt.address || '').trim(),
      items: JSON.stringify(normalizedItems),
      notes: String(payload.notes || 'Service completion charges').trim(),
      terms: 'Payment due upon receipt',
      taxRate: 0,
      status: 'Draft',
      invoiceNumber: '',
      serviceDate: String(payload.serviceDate || appt.date || ''),
      linkedAppointmentId: appointmentId
    };

    const savePayload = {
      action: 'saveInvoiceEstimate',
      data: JSON.stringify(invoiceData)
    };
    const saveResp = UrlFetchApp.fetch(INVOICE_ESTIMATE_WEBAPP_URL, {
      method: 'post',
      payload: savePayload,
      muteHttpExceptions: true
    });
    const saveText = saveResp.getContentText() || '{}';
    let saveJson = {};
    try { saveJson = JSON.parse(saveText); } catch (e) { return { success: false, error: saveText || 'Invalid invoice save response' }; }
    if (!saveJson.success) return { success: false, error: saveJson.error || 'Failed to save invoice' };

    const invoiceId = String(saveJson.id || saveJson.invoiceId || '').trim();
    if (!invoiceId) return { success: false, error: 'Invoice created but no invoice ID returned' };

    // Link invoice on appointment for traceability in Scheduling UI.
    try {
      updateAppointment({ id: appointmentId, linkedInvoiceId: invoiceId });
    } catch (linkErr) {
      Logger.log('createServiceCompletionInvoiceForAppointment link warning: ' + linkErr.toString());
    }

    const summary = getInvoiceSummaryById_(invoiceId);
    return {
      success: true,
      invoiceId: invoiceId,
      invoiceNumber: summary && summary.success ? summary.invoiceNumber : invoiceId,
      invoiceShareLink: summary && summary.success ? summary.shareLink : '',
      paymentLink: summary && summary.success ? summary.paymentLink : '',
      invoicePdfUrl: summary && summary.success ? summary.pdfUrl : '',
      message: 'Invoice created'
    };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function createChemicalInvoiceForAppointment(payload) {
  payload = payload || {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  payload.items = items.map(function(it) {
    var out = Object.assign({}, it);
    if (!out.category) out.category = 'Chemicals';
    return out;
  });
  return createServiceCompletionInvoiceForAppointment(payload);
}

function getCustomerInvoices(customerEmail) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(INVOICES_ESTIMATES_SHEET);
    if (!sheet) {
      Logger.log('⚠️ Invoice sheet not found');
      return { success: true, invoices: [] };
    }
    
    const dataRows = sheet.getDataRange().getValues();
    if (dataRows.length < 2) {
      Logger.log('⚠️ No invoice data found');
      return { success: true, invoices: [] };
    }
    
    const headers = dataRows[0];
    // Try both 'Customer Email' (with space) and 'CustomerEmail' (no space)
    let emailCol = headers.indexOf('Customer Email');
    if (emailCol === -1) {
      emailCol = headers.indexOf('CustomerEmail');
    }
    const jsonCol1 = 3; // Column D - JSON Part 1
    const jsonCol2 = 4; // Column E - JSON Part 2
    const jsonCol3 = 5; // Column F - JSON Part 3
    const totalCol = headers.indexOf('Total');
    
    if (emailCol === -1) {
      Logger.log('⚠️ Customer Email column not found');
      return { success: true, invoices: [] };
    }
    
    const invoices = [];
    const customerEmailLower = customerEmail.toLowerCase().trim();
    const seenInvoiceIds = new Set();
    
    Logger.log('🔍 Searching for invoices for: ' + customerEmail);
    Logger.log('📊 Total rows to check: ' + (dataRows.length - 1));
    
    // Helper function to concatenate JSON parts
    function concatenateJsonParts(part1, part2, part3) {
      let jsonStr = '';
      if (part1) jsonStr += part1.toString();
      if (part2) jsonStr += part2.toString();
      if (part3) jsonStr += part3.toString();
      // Handle escaped quotes from CSV format ("" -> ")
      jsonStr = jsonStr.replace(/""/g, '"');
      return jsonStr.trim();
    }
    
    for (let i = 1; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowEmail = (row[emailCol] || '').toString().toLowerCase().trim();
      // Column B (index 1) is the ID column - ONLY use Column B
      const invoiceId = (row[1] || '').toString().trim();
      
      // Match by email (case-insensitive)
      const matchesEmail = rowEmail === customerEmailLower;
      
      if (matchesEmail) {
        Logger.log('🔍 Row ' + (i + 1) + ': Email match found!');
        
        // Try to parse JSON from columns D, E, F FIRST to get the ID
        let invoiceData = null;
        const jsonPart1 = row[jsonCol1];
        const jsonPart2 = row[jsonCol2];
        const jsonPart3 = row[jsonCol3];
        
        // Check if JSON is already an object (Google Sheets sometimes returns objects)
        if (typeof jsonPart1 === 'object' && jsonPart1 !== null && !Array.isArray(jsonPart1)) {
          invoiceData = jsonPart1;
          Logger.log('  ✅ JSON Part 1 is already an object');
        } else {
          // Convert to strings
          const jsonPart1Str = (jsonPart1 || '').toString();
          const jsonPart2Str = (jsonPart2 || '').toString();
          const jsonPart3Str = (jsonPart3 || '').toString();
          const jsonStr = concatenateJsonParts(jsonPart1Str, jsonPart2Str, jsonPart3Str);
          
          Logger.log('  📄 JSON Part 1 length: ' + jsonPart1Str.length);
          Logger.log('  📄 JSON Part 2 length: ' + jsonPart2Str.length);
          Logger.log('  📄 JSON Part 3 length: ' + jsonPart3Str.length);
          Logger.log('  📄 Combined JSON length: ' + jsonStr.length);
          
          if (jsonStr) {
            try {
              // First try parsing as-is
              invoiceData = JSON.parse(jsonStr);
              Logger.log('  ✅ Successfully parsed JSON (combined)');
            } catch (e) {
              Logger.log('  ⚠️ Failed to parse combined JSON: ' + e.toString());
              // Try fixing common JSON issues: items field might be a stringified array
              try {
                // Replace "items":"[...]" with "items":[...] (unstringify the items array)
                let jsonStrFixed = jsonStr.replace(/"items"\s*:\s*"(\[.*?\])"/g, function(match, itemsArray) {
                  // Unescape the items array string
                  const unescaped = itemsArray.replace(/\\"/g, '"').replace(/\\n/g, '\n');
                  return '"items":' + unescaped;
                });
                invoiceData = JSON.parse(jsonStrFixed);
                Logger.log('  ✅ Successfully parsed JSON (fixed items field)');
              } catch (e2) {
                // Try cleaning escaped quotes
                try {
                  const jsonStrClean = jsonStr.replace(/""/g, '"');
                  invoiceData = JSON.parse(jsonStrClean);
                  Logger.log('  ✅ Successfully parsed JSON (cleaned escaped quotes)');
                } catch (e3) {
                  // Try parsing just the first part
                  try {
                    const jsonPart1Clean = jsonPart1Str.replace(/""/g, '"');
                    invoiceData = JSON.parse(jsonPart1Clean);
                    Logger.log('  ✅ Successfully parsed JSON Part 1 only');
                  } catch (e4) {
                    // Last resort: try to extract key fields using regex even if full parse fails
                    Logger.log('  ⚠️ Could not fully parse JSON, extracting fields manually');
                    invoiceData = {};
                    // Extract common fields using regex (handle both escaped and unescaped quotes)
                    const idMatch = jsonStr.match(/"id"\s*:\s*"([^"\\]+(?:\\.[^"\\]*)*)"/) || jsonStr.match(/"id"\s*:\s*"([^"]+)"/);
                    const invoiceNumberMatch = jsonStr.match(/"invoiceNumber"\s*:\s*"([^"\\]+(?:\\.[^"\\]*)*)"/) || jsonStr.match(/"invoiceNumber"\s*:\s*"([^"]+)"/);
                    const dateMatch = jsonStr.match(/"date"\s*:\s*"([^"\\]+(?:\\.[^"\\]*)*)"/) || jsonStr.match(/"date"\s*:\s*"([^"]+)"/);
                    const statusMatch = jsonStr.match(/"status"\s*:\s*"([^"\\]+(?:\\.[^"\\]*)*)"/) || jsonStr.match(/"status"\s*:\s*"([^"]+)"/);
                    const typeMatch = jsonStr.match(/"type"\s*:\s*"([^"\\]+(?:\\.[^"\\]*)*)"/) || jsonStr.match(/"type"\s*:\s*"([^"]+)"/);
                    const totalMatch = jsonStr.match(/"total"\s*:\s*(\d+\.?\d*)/);
                    const sentDateMatch = jsonStr.match(/"sentDate"\s*:\s*"([^"\\]+(?:\\.[^"\\]*)*)"/) || jsonStr.match(/"sentDate"\s*:\s*"([^"]+)"/);
                    const sentByMatch = jsonStr.match(/"sentBy"\s*:\s*"([^"\\]+(?:\\.[^"\\]*)*)"/) || jsonStr.match(/"sentBy"\s*:\s*"([^"]+)"/);
                    const dueDateMatch = jsonStr.match(/"dueDate"\s*:\s*"([^"\\]+(?:\\.[^"\\]*)*)"/) || jsonStr.match(/"dueDate"\s*:\s*"([^"]+)"/);
                    const shareLinkMatch = jsonStr.match(/"shareLink"\s*:\s*"([^"\\]+(?:\\.[^"\\]*)*)"/) || jsonStr.match(/"shareLink"\s*:\s*"([^"]+)"/);
                    
                    if (idMatch) invoiceData.id = idMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
                    if (invoiceNumberMatch) invoiceData.invoiceNumber = invoiceNumberMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
                    if (dateMatch) invoiceData.date = dateMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
                    if (statusMatch) invoiceData.status = statusMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
                    if (typeMatch) invoiceData.type = typeMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
                    if (totalMatch) invoiceData.total = parseFloat(totalMatch[1]);
                    if (sentDateMatch) invoiceData.sentDate = sentDateMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
                    if (sentByMatch) invoiceData.sentBy = sentByMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
                    if (dueDateMatch) invoiceData.dueDate = dueDateMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
                    if (shareLinkMatch) invoiceData.shareLink = shareLinkMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
                    
                    Logger.log('  ⚠️ Extracted fields manually: ' + Object.keys(invoiceData).join(', '));
                  }
                }
              }
            }
          } else {
            Logger.log('  ⚠️ No JSON data found in any column');
          }
        }
        
        // Get invoice ID from JSON data (id field) - this is the correct ID to use
        const invoiceIdFromJson = (invoiceData && invoiceData.id) ? invoiceData.id.toString().trim() : '';
        
        // Use ID from JSON, fallback to Column B if JSON doesn't have it
        const finalInvoiceId = invoiceIdFromJson || (row[1] || '').toString().trim();
        
        if (!finalInvoiceId) {
          Logger.log('  ⚠️ No invoice ID found, skipping');
          continue;
        }
        
        // Skip if already seen (use JSON ID)
        if (seenInvoiceIds.has(finalInvoiceId)) {
          Logger.log('  ⏭️ Already seen, skipping');
          continue;
        }
        
        Logger.log('  📝 Invoice ID from JSON: "' + invoiceIdFromJson + '"');
        Logger.log('  📝 Final Invoice ID: "' + finalInvoiceId + '"');
        
        // Get invoice details from JSON or row data
        const invoiceNumber = (invoiceData && invoiceData.invoiceNumber) || finalInvoiceId;
        const invoiceDate = (invoiceData && invoiceData.date) || (invoiceData && invoiceData.invoiceDate) || '';
        // Prefer JSON total, fallback to column G, then to 0
        const invoiceTotal = (invoiceData && invoiceData.total !== undefined) ? parseFloat(invoiceData.total) : ((totalCol !== -1 && row[totalCol]) ? parseFloat(row[totalCol]) : 0);
        const invoiceStatus = (invoiceData && invoiceData.status) || (invoiceData && invoiceData.paymentStatus) || '';
        const invoiceType = (invoiceData && invoiceData.type) || '';
        
        Logger.log('  📋 Invoice Number: ' + invoiceNumber);
        Logger.log('  📋 Invoice Type: ' + invoiceType);
        Logger.log('  📋 Invoice Status: ' + invoiceStatus);
        Logger.log('  📋 Invoice Date: ' + invoiceDate);
        Logger.log('  📋 Invoice Total: $' + invoiceTotal);
        
        // Skip if it's a Draft invoice
        if (invoiceStatus && invoiceStatus.toLowerCase() === 'draft') {
          Logger.log('  ⏭️ Skipping Draft invoice');
          continue;
        }
        
        // Include all invoices (don't filter by type - let user see all invoices and estimates)
        // Only show invoices, not estimates/quotes - but let's include them all for now
        if (invoiceType && invoiceType.toLowerCase() !== 'invoice' && invoiceType.toLowerCase() !== 'estimate' && invoiceType.toLowerCase() !== 'quote') {
          Logger.log('  ⏭️ Skipping non-invoice type: ' + invoiceType);
          // Actually, let's include all types
        }
        
        // Check for sentDate in JSON (could be in any JSON part)
        let sentDate = null;
        let sentBy = null;
        if (invoiceData) {
          sentDate = invoiceData.sentDate || null;
          sentBy = invoiceData.sentBy || null;
        }
        
        // Also check Column D directly for sentDate
        if (!sentDate && jsonPart1) {
          try {
            const jsonPart1Str = (jsonPart1 || '').toString();
            const jsonPart1Clean = jsonPart1Str.replace(/""/g, '"');
            const jsonData = JSON.parse(jsonPart1Clean);
            sentDate = jsonData.sentDate || null;
            sentBy = jsonData.sentBy || null;
          } catch (e) {
            // Not valid JSON, ignore
          }
        }
        
        seenInvoiceIds.add(finalInvoiceId);
        
        Logger.log('  ✅ Adding invoice to list with ID: "' + finalInvoiceId + '"');
        
        invoices.push({
          id: finalInvoiceId, // Use ID from JSON: "Invoice-84320191-7722"
          invoiceNumber: invoiceNumber, // This is the display number: "INV-2026-001"
          date: invoiceDate,
          dueDate: (invoiceData && invoiceData.dueDate) || '',
          total: invoiceTotal,
          status: invoiceStatus,
          shareLink: (invoiceData && invoiceData.shareLink) || '',
          sentDate: sentDate,
          sentBy: sentBy
        });
      }
    }
    
    // Sort by date descending
    invoices.sort((a, b) => {
      const dateA = a.date ? new Date(a.date) : new Date(0);
      const dateB = b.date ? new Date(b.date) : new Date(0);
      return dateB - dateA;
    });
    
    Logger.log('📋 Found ' + invoices.length + ' invoice(s) for ' + customerEmail);
    
    return { success: true, invoices: invoices };
  } catch (error) {
    Logger.log('❌ Error getting customer invoices: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/** PM_Projects: A=Project ID, B=Invoice ID, C=Customer Email, G=Status, H=Total Value. Returns projects for the given customer email. */
function getProjectsForCustomer(customerEmail) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('PM_Projects');
    if (!sheet) {
      return { success: true, projects: [] };
    }
    const dataRows = sheet.getDataRange().getValues();
    if (dataRows.length < 2) {
      return { success: true, projects: [] };
    }
    const emailLower = (customerEmail || '').toString().toLowerCase().trim();
    const projects = [];
    for (let r = 1; r < dataRows.length; r++) {
      const row = dataRows[r];
      const rowEmail = (row[2] || '').toString().toLowerCase().trim(); // Column C = Customer Email
      if (rowEmail !== emailLower) continue;
      projects.push({
        projectId: String(row[0] || '').trim(),   // A
        invoiceId: String(row[1] || '').trim(),   // B
        status: String(row[6] || '').trim(),      // G
        totalValue: row[7] !== undefined && row[7] !== '' ? parseFloat(row[7]) : 0  // H
      });
    }
    return { success: true, projects: projects };
  } catch (error) {
    Logger.log('getProjectsForCustomer error: ' + error.toString());
    return { success: false, projects: [], error: error.toString() };
  }
}

function getInvoiceDetails(invoiceId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(INVOICES_ESTIMATES_SHEET);
    if (!sheet) return { success: false, error: 'Invoice sheet not found' };
    const dataRows = sheet.getDataRange().getValues();
    const headers = dataRows[0];
    
    // Helper function to concatenate JSON parts
    function concatenateJsonParts(part1, part2, part3) {
      let jsonStr = '';
      if (part1) jsonStr += part1.toString();
      if (part2) jsonStr += part2.toString();
      if (part3) jsonStr += part3.toString();
      jsonStr = jsonStr.replace(/""/g, '"');
      return jsonStr.trim();
    }
    
    const jsonCol1 = 3; // Column D - JSON Part 1
    const jsonCol2 = 4; // Column E - JSON Part 2
    const jsonCol3 = 5; // Column F - JSON Part 3
    
    Logger.log('🔍 Searching for invoice ID: "' + invoiceId + '"');
    Logger.log('📊 Total rows to check: ' + (dataRows.length - 1));
    
    for (let i = 1; i < dataRows.length; i++) {
      const row = dataRows[i];
      const searchId = invoiceId.toString().trim();
      
      // Parse JSON from columns D, E, F to get the ID from JSON
      const jsonPart1 = row[jsonCol1];
      const jsonPart2 = row[jsonCol2];
      const jsonPart3 = row[jsonCol3];
      
      let invoiceData = null;
      let rowIdFromJson = '';
      
      if (typeof jsonPart1 === 'object' && jsonPart1 !== null && !Array.isArray(jsonPart1)) {
        invoiceData = jsonPart1;
        rowIdFromJson = (invoiceData.id || '').toString().trim();
      } else {
        const jsonPart1Str = (jsonPart1 || '').toString();
        const jsonPart2Str = (jsonPart2 || '').toString();
        const jsonPart3Str = (jsonPart3 || '').toString();
        const jsonStr = concatenateJsonParts(jsonPart1Str, jsonPart2Str, jsonPart3Str);
        
        if (jsonStr) {
          try {
            invoiceData = JSON.parse(jsonStr);
            rowIdFromJson = (invoiceData.id || '').toString().trim();
          } catch (e) {
            try {
              let jsonStrFixed = jsonStr.replace(/"items"\s*:\s*"(\[.*?\])"/g, function(match, itemsArray) {
                const unescaped = itemsArray.replace(/\\"/g, '"').replace(/\\n/g, '\n');
                return '"items":' + unescaped;
              });
              invoiceData = JSON.parse(jsonStrFixed);
              rowIdFromJson = (invoiceData.id || '').toString().trim();
            } catch (e2) {
              try {
                const jsonStrClean = jsonStr.replace(/""/g, '"');
                invoiceData = JSON.parse(jsonStrClean);
                rowIdFromJson = (invoiceData.id || '').toString().trim();
              } catch (e3) {
                // Try to extract ID using regex
                const idMatch = jsonStr.match(/"id"\s*:\s*"([^"\\]+(?:\\.[^"\\]*)*)"/) || jsonStr.match(/"id"\s*:\s*"([^"]+)"/);
                if (idMatch) {
                  rowIdFromJson = idMatch[1].replace(/\\"/g, '"').trim();
                }
              }
            }
          }
        }
      }
      
      // Use ID from JSON, fallback to Column B
      const rowId = rowIdFromJson || (row[1] || '').toString().trim();
      
      Logger.log('  Row ' + (i + 1) + ': JSON ID="' + rowIdFromJson + '", Column B="' + (row[1] || '') + '", Final="' + rowId + '"');
      Logger.log('  Comparing with search ID: "' + searchId + '"');
      
      // Match by invoice ID (case-sensitive string match)
      if (rowId === searchId) {
        Logger.log('  ✅ IDs match! Found invoice row ' + (i + 1));
        
        const invoice = {};
        headers.forEach((header, idx) => { invoice[header] = row[idx]; });
        
        // Parse JSON from columns D, E, F
        const jsonPart1 = row[jsonCol1];
        const jsonPart2 = row[jsonCol2];
        const jsonPart3 = row[jsonCol3];
        
        let fullJsonStr = ''; // keep for fallback items extraction
        let invoiceData = null;
        if (typeof jsonPart1 === 'object' && jsonPart1 !== null && !Array.isArray(jsonPart1)) {
          invoiceData = jsonPart1;
          Logger.log('  ✅ JSON Part 1 is already an object');
        } else {
          const jsonPart1Str = (jsonPart1 || '').toString();
          const jsonPart2Str = (jsonPart2 || '').toString();
          const jsonPart3Str = (jsonPart3 || '').toString();
          const jsonStr = concatenateJsonParts(jsonPart1Str, jsonPart2Str, jsonPart3Str);
          fullJsonStr = jsonStr;
          
          if (jsonStr) {
            try {
              // First try parsing as-is
              invoiceData = JSON.parse(jsonStr);
              Logger.log('  ✅ Successfully parsed JSON');
            } catch (e) {
              // Try fixing items field (string value containing array - handle escaped quotes)
              try {
                var jsonStrFixed = jsonStr.replace(/"items"\s*:\s*"((?:[^"\\]|\\.)*)"/g, function(match, inner) {
                  var unescaped = inner.replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t');
                  return '"items":' + unescaped;
                });
                invoiceData = JSON.parse(jsonStrFixed);
                Logger.log('  ✅ Successfully parsed JSON (fixed items field)');
              } catch (e2) {
                // Try cleaning escaped quotes
                try {
                  const jsonStrClean = jsonStr.replace(/""/g, '"');
                  invoiceData = JSON.parse(jsonStrClean);
                  Logger.log('  ✅ Successfully parsed JSON (cleaned)');
                } catch (e3) {
                  // Manual extraction as fallback
                  Logger.log('  ⚠️ Could not fully parse JSON, extracting fields manually');
                  invoiceData = {};
                  const idMatch = jsonStr.match(/"id"\s*:\s*"([^"\\]+(?:\\.[^"\\]*)*)"/) || jsonStr.match(/"id"\s*:\s*"([^"]+)"/);
                  const invoiceNumberMatch = jsonStr.match(/"invoiceNumber"\s*:\s*"([^"\\]+(?:\\.[^"\\]*)*)"/) || jsonStr.match(/"invoiceNumber"\s*:\s*"([^"]+)"/);
                  const dateMatch = jsonStr.match(/"date"\s*:\s*"([^"\\]+(?:\\.[^"\\]*)*)"/) || jsonStr.match(/"date"\s*:\s*"([^"]+)"/);
                  const statusMatch = jsonStr.match(/"status"\s*:\s*"([^"\\]+(?:\\.[^"\\]*)*)"/) || jsonStr.match(/"status"\s*:\s*"([^"]+)"/);
                  const typeMatch = jsonStr.match(/"type"\s*:\s*"([^"\\]+(?:\\.[^"\\]*)*)"/) || jsonStr.match(/"type"\s*:\s*"([^"]+)"/);
                  const totalMatch = jsonStr.match(/"total"\s*:\s*(\d+\.?\d*)/);
                  const sentDateMatch = jsonStr.match(/"sentDate"\s*:\s*"([^"\\]+(?:\\.[^"\\]*)*)"/) || jsonStr.match(/"sentDate"\s*:\s*"([^"]+)"/);
                  const sentByMatch = jsonStr.match(/"sentBy"\s*:\s*"([^"\\]+(?:\\.[^"\\]*)*)"/) || jsonStr.match(/"sentBy"\s*:\s*"([^"]+)"/);
                  
                  if (idMatch) invoiceData.id = idMatch[1].replace(/\\"/g, '"').trim();
                  if (invoiceNumberMatch) invoiceData.invoiceNumber = invoiceNumberMatch[1].replace(/\\"/g, '"');
                  if (dateMatch) invoiceData.date = dateMatch[1].replace(/\\"/g, '"');
                  if (statusMatch) invoiceData.status = statusMatch[1].replace(/\\"/g, '"');
                  if (typeMatch) invoiceData.type = typeMatch[1].replace(/\\"/g, '"');
                  if (totalMatch) invoiceData.total = parseFloat(totalMatch[1]);
                  if (sentDateMatch) invoiceData.sentDate = sentDateMatch[1].replace(/\\"/g, '"');
                  if (sentByMatch) invoiceData.sentBy = sentByMatch[1].replace(/\\"/g, '"');
                  invoiceData.items = extractItemsFromJsonString(jsonStr);
                }
              }
            }
          }
        }
        
        // Merge JSON data into invoice object
        if (invoiceData) {
          Object.keys(invoiceData).forEach(key => {
            invoice[key] = invoiceData[key];
          });
          
          // CRITICAL: Set the ID from JSON (this is what we use for lookups)
          if (invoiceData.id) {
            invoice.id = invoiceData.id;
          } else {
            // Fallback to the rowId we found during matching
            invoice.id = rowId;
          }
          
          // Set standard fields from JSON (use this row's id as fallback so preview never shows wrong number)
          invoice['Invoice Number'] = invoiceData.invoiceNumber || invoice.id || rowId;
          if (invoiceData.date) invoice['Date'] = invoiceData.date;
          if (invoiceData.dueDate) invoice['Due Date'] = invoiceData.dueDate;
          if (invoiceData.total !== undefined) invoice['Total'] = invoiceData.total;
          if (invoiceData.subtotal !== undefined) invoice['Subtotal'] = invoiceData.subtotal;
          if (invoiceData.taxAmount !== undefined) invoice['Tax'] = invoiceData.taxAmount;
          if (invoiceData.status) invoice['Status'] = invoiceData.status;
          if (invoiceData.paymentStatus) invoice['Payment Status'] = invoiceData.paymentStatus;
          if (invoiceData.customerName) invoice['Customer Name'] = invoiceData.customerName;
          if (invoiceData.customerEmail) invoice['Customer Email'] = invoiceData.customerEmail;
          if (invoiceData.items !== undefined) invoice.items = parseInvoiceItems(invoiceData.items);
          else if (invoiceData.Items !== undefined) invoice.items = parseInvoiceItems(invoiceData.Items);
          if (invoiceData.sentDate) invoice.sentDate = invoiceData.sentDate;
          if (invoiceData.sentBy) invoice.sentBy = invoiceData.sentBy;
        } else {
          // If no JSON data, use the rowId we found during matching
          invoice.id = rowId;
        }
        // Ensure display number is never blank (use this row's id so each preview shows correct invoice)
        if (!invoice['Invoice Number']) invoice['Invoice Number'] = invoice.id || rowId;

        // Ensure items is always an array (sheet may have items as string in a column)
        invoice.items = parseInvoiceItems(invoice.items);
        // If still no items, extract from raw JSON (handles stringified/split items)
        if (invoice.items.length === 0 && fullJsonStr) {
          var extracted = extractItemsFromJsonString(fullJsonStr);
          if (extracted.length > 0) invoice.items = extracted;
        }
        
        Logger.log('  ✅ Invoice details loaded successfully');
        Logger.log('  📝 Invoice ID in returned object: "' + invoice.id + '"');
        
        return { success: true, invoice: invoice };
      }
    }
    
    Logger.log('❌ Invoice not found: ' + invoiceId);
    return { success: false, error: 'Invoice not found' };
  } catch (error) {
    Logger.log('❌ Error in getInvoiceDetails: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/** Ensure invoice line items are always an array (parse from JSON string if needed). */
function parseInvoiceItems(items) {
  if (Array.isArray(items)) return items;
  if (typeof items === 'string' && items.trim()) {
    try { return JSON.parse(items); } catch (e) {
      try { return JSON.parse(items.replace(/\\"/g, '"').replace(/\\n/g, '\n')); } catch (e2) { return []; }
    }
  }
  return [];
}

/** Extract items array from raw JSON string when full parse fails or items are stringified/split. */
function extractItemsFromJsonString(jsonStr) {
  if (!jsonStr || typeof jsonStr !== 'string') return [];
  var s = jsonStr.trim();
  // 1) "items":"...stringified array..." or "Items":"..." - capture string value (handles \", \\ inside)
  var stringVal = s.match(/"items"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
  if (stringVal) {
    try {
      var unescaped = stringVal[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t');
      var arr = JSON.parse(unescaped);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { /* fall through */ }
  }
  // 2) "items": [ ... ] or "Items": [ ... ] - find array by bracket balance
  var arrayStart = s.search(/"items"\s*:\s*\[/i);
  if (arrayStart !== -1) {
    var bracketStart = s.indexOf('[', arrayStart);
    var depth = 0;
    var i = bracketStart;
    while (i < s.length) {
      var c = s[i];
      if (c === '\\' && i + 1 < s.length) { i += 2; continue; }
      if (c === '"') {
        var q = i++;
        while (i < s.length && (s[i] !== '"' || s[i - 1] === '\\')) i++;
        i++;
        continue;
      }
      if (c === '[') depth++;
      else if (c === ']') { depth--; if (depth === 0) break; }
      i++;
    }
    if (depth === 0) {
      try {
        var arr = JSON.parse(s.substring(bracketStart, i + 1));
        return Array.isArray(arr) ? arr : [];
      } catch (e) { /* fall through */ }
    }
  }
  return [];
}

function previewInvoice(invoiceId) {
  try {
    const result = getInvoiceDetails(invoiceId);
    if (!result.success) return result;
    const invoice = result.invoice;
    const customerName = invoice['Customer Name'] || '';
    const invoiceNumber = invoice['Invoice Number'] || invoiceId;
    const invoiceDate = invoice['Date'] || '';
    const total = invoice['Total'] || 0;
    const subtotal = invoice['Subtotal'] || total;
    const tax = invoice['Tax'] || 0;
    const items = parseInvoiceItems(invoice.items);
    let itemsHtml = '';
    if (items.length > 0) {
      itemsHtml = '<table style="width:100%;border-collapse:collapse;margin:20px 0;"><thead><tr style="background:#f8fafc;"><th style="padding:12px;text-align:left;">Item</th><th style="padding:12px;text-align:right;">Qty</th><th style="padding:12px;text-align:right;">Price</th><th style="padding:12px;text-align:right;">Total</th></tr></thead><tbody>';
      items.forEach(function(item) {
        const itemName = (item.name || item.description || 'Item').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const qty = parseFloat(item.quantity) || 1;
        const price = parseFloat(item.price) || parseFloat(item.unitPrice) || 0;
        const rowTotal = parseFloat(item.total);
        const amount = (typeof rowTotal === 'number' && !isNaN(rowTotal)) ? rowTotal : (qty * price);
        itemsHtml += '<tr><td style="padding:12px;">' + itemName + '</td><td style="padding:12px;text-align:right;">' + qty + '</td><td style="padding:12px;text-align:right;">$' + price.toFixed(2) + '</td><td style="padding:12px;text-align:right;">$' + amount.toFixed(2) + '</td></tr>';
      });
      itemsHtml += '</tbody></table>';
    }
    const invoiceSummaryHtml = '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:24px;margin:20px 0;"><h3>Invoice #' + (invoiceNumber || invoiceId).toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</h3><table style="width:100%;"><tr><td>Date:</td><td style="text-align:right;">' + (invoiceDate || '') + '</td></tr></table>' + itemsHtml + '<div style="border-top:2px solid #e2e8f0;margin-top:20px;"><table style="width:100%;"><tr><td>Subtotal:</td><td style="text-align:right;">$' + parseFloat(subtotal).toFixed(2) + '</td></tr>' + (tax > 0 ? '<tr><td>Tax:</td><td style="text-align:right;">$' + parseFloat(tax).toFixed(2) + '</td></tr>' : '') + '<tr><td><strong>Total:</strong></td><td style="text-align:right;"><strong>$' + parseFloat(total).toFixed(2) + '</strong></td></tr></table></div></div>';
    const html = buildInvoiceEmailHTML(customerName, invoiceNumber, invoiceDate, '', total, invoiceSummaryHtml, '');
    return { success: true, html: html };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function buildInvoiceEmailHTML(customerName, invoiceNumber, invoiceDate, dueDate, total, invoiceSummaryHtml, customMessage) {
  const firstName = (customerName || 'there').split(' ')[0];
  const companyName = 'A Quality Pool Company';
  const companyEmail = 'samr@aqualitypoolcompanyusa.com';
  const companyPhone = '(502) 706-9172';
  const logoUrl = 'https://cdn.prod.website-files.com/6931dc4e8e97334e195432df/6993ce0abcd54d3520799318_IMG_1763.jpg';
  const openingMessage = customMessage || 'Your invoice is ready for review. Please see the details below.';
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Invoice</title></head><body style="font-family:Arial,sans-serif;background:#f5f7fa;margin:0;padding:40px 20px;"><table border="0" cellpadding="0" cellspacing="0" width="640" style="max-width:640px;width:100%;background:#ffffff;margin:0 auto;"><tr><td align="center" style="background:linear-gradient(135deg,#0c4a6e 0%,#0369a1 100%);padding:32px 24px;"><img src="' + logoUrl + '" alt="' + companyName + '" style="max-width:180px;height:auto;margin-bottom:16px;display:block;border-radius:8px;"><h1 style="color:white;margin:12px 0 4px 0;font-size:26px;font-weight:800;">' + companyName + '</h1><p style="color:#e0f2fe;margin:0;font-size:14px;">Invoice #' + (invoiceNumber || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p></td></tr><tr><td style="padding:32px 24px;"><h2 style="font-size:18px;font-weight:600;color:#0f172a;margin:0 0 16px 0;">Hello ' + firstName.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + ',</h2>' + (openingMessage ? '<div style="background:linear-gradient(135deg,#dbeafe,#bfdbfe);border-left:4px solid #3b82f6;padding:20px;margin:20px 0;border-radius:0 8px 8px 0;"><p style="margin:0;font-size:15px;color:#1e40af;line-height:1.6;">' + openingMessage.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p></div>' : '') + invoiceSummaryHtml + '<p style="color:#64748b;font-size:14px;line-height:1.6;margin:24px 0 0 0;">Please manage this invoice in the Invoice webapp.</p></td></tr><tr><td style="background:#f8fafc;padding:24px;text-align:center;border-top:1px solid #e2e8f0;"><p style="font-size:13px;color:#64748b;margin:4px 0;"><strong>' + companyName + '</strong></p><p style="font-size:13px;color:#64748b;margin:4px 0;">' + companyEmail + ' | ' + companyPhone + '</p></td></tr></table></body></html>';
}

function getAppointmentInvoiceEmailMessage_() {
  return 'Per your recent visit, your invoice is attached. Please find it attached here. You should receive your service details in a separate email.';
}

function getAppointmentForInvoiceSend_(appointmentId, invoiceId, customerEmail) {
  try {
    const targetApptId = String(appointmentId || '').trim();
    if (targetApptId) {
      const ctx = getAppointmentRowContextById_(targetApptId);
      if (ctx && ctx.values) {
        const row = ctx.values;
        return {
          success: true,
          appointmentId: targetApptId,
          customerName: String(row[3] || '').trim(),
          customerEmail: String(row[4] || '').trim(),
          customerPhone: String(row[5] || '').trim(),
          serviceType: String(row[7] || '').trim(),
          date: String(ctx.date || row[10] || row[8] || '').trim(),
          time: String(ctx.time || row[11] || row[9] || '').trim(),
          linkedInvoiceId: String(row[24] || '').trim()
        };
      }
    }

    const sheet = getOrCreateSheet(APPOINTMENTS_SHEET, getAppointmentsHeaders());
    const values = sheet.getDataRange().getValues();
    const headers = values[0] || [];
    const colLinkedInvoice = getApptCol(headers, 'LinkedInvoiceID', ['Linked Invoice ID']);
    const colEmail = getApptCol(headers, 'CustomerEmail', ['Customer Email']);
    const targetInvoiceId = String(invoiceId || '').trim();
    const targetEmail = String(customerEmail || '').trim().toLowerCase();

    for (let i = values.length - 1; i >= 1; i--) {
      const row = values[i];
      const rowInvoiceId = String((colLinkedInvoice >= 0 ? row[colLinkedInvoice] : '') || '').trim();
      if (!rowInvoiceId || rowInvoiceId !== targetInvoiceId) continue;
      const rowEmail = String((colEmail >= 0 ? row[colEmail] : row[4]) || '').trim().toLowerCase();
      if (targetEmail && rowEmail && rowEmail !== targetEmail) continue;

      return {
        success: true,
        appointmentId: String(row[0] || '').trim(),
        customerName: String(row[3] || '').trim(),
        customerEmail: String((colEmail >= 0 ? row[colEmail] : row[4]) || '').trim(),
        customerPhone: String(row[5] || '').trim(),
        serviceType: String(row[7] || '').trim(),
        date: String(row[10] || row[8] || '').trim(),
        time: String(row[11] || row[9] || '').trim(),
        linkedInvoiceId: rowInvoiceId
      };
    }
    return { success: false, error: 'Appointment context not found' };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function sendInvoiceTelegramDraftForAppointment_(opts) {
  try {
    opts = opts || {};
    const invoiceId = String(opts.invoiceId || '').trim();
    const customerEmail = String(opts.customerEmail || '').trim();
    const appointmentId = String(opts.appointmentId || '').trim();
    const includeStripe = !!opts.includeStripe;
    if (!invoiceId) return { success: false, skipped: true, error: 'Invoice ID required' };

    const apptCtx = getAppointmentForInvoiceSend_(appointmentId, invoiceId, customerEmail);
    if (!apptCtx || !apptCtx.success) {
      return { success: false, skipped: true, error: (apptCtx && apptCtx.error) || 'Appointment context unavailable' };
    }

    const phone = String(apptCtx.customerPhone || '').trim();
    if (!phone) {
      return { success: false, skipped: true, error: 'Customer phone missing for Telegram draft' };
    }

    const summary = getInvoiceSummaryById_(invoiceId);
    const invoiceNumber = (summary && summary.success)
      ? String(summary.invoiceNumber || invoiceId)
      : invoiceId;
    const shareLink = (summary && summary.success)
      ? String(summary.shareLink || '')
      : '';
    const paymentLink = (summary && summary.success)
      ? String(summary.paymentLink || '')
      : '';
    const preferredLink = includeStripe ? (paymentLink || shareLink) : shareLink;

    const firstName = String(apptCtx.customerName || 'there').split(' ')[0];
    let draftText = 'Hi ' + firstName + '! 👋 This is A Quality Pool Company. We just sent Invoice #' + invoiceNumber + ' to your email.';
    if (includeStripe && paymentLink) {
      draftText += ' You can also pay securely here: ' + paymentLink;
    } else if (shareLink) {
      draftText += ' You can view it here: ' + shareLink;
    }
    draftText += ' Let us know if you have any questions. Thanks!';

    const facts = [
      { label: 'Customer', value: apptCtx.customerName || 'Customer' },
      { label: 'Phone', value: phone },
      { label: 'Invoice', value: invoiceNumber },
      { label: 'Service', value: apptCtx.serviceType || 'Service' },
      { label: 'Date/Time', value: (apptCtx.date || '') + ((apptCtx.time || '') ? (' @ ' + apptCtx.time) : '') }
    ];

    // Create invoice draft batch for tracking
    const batch = createInvoiceDraftBatch_(invoiceId, appointmentId, apptCtx.customerName, customerEmail, phone, apptCtx.serviceType, apptCtx.date, apptCtx.time);
    const batchToken = batch.token;

    const title = includeStripe ? 'Invoice + Stripe draft text' : 'Invoice draft text';
    const linkLabel = preferredLink ? (includeStripe && paymentLink ? 'Open payment link' : 'Open invoice') : '';

    return sendBrooksTelegramDraftWithTracking_(
      apptCtx.appointmentId || '',
      batchToken,
      draftText,
      phone,
      apptCtx.customerName,
      includeStripe ? 'invoice_send_text_stripe' : 'invoice_send_text',
      title,
      facts,
      linkLabel,
      preferredLink || '',
      'invoice'
    );
  } catch (e) {
    Logger.log('sendInvoiceTelegramDraftForAppointment_ error: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

function sendInvoiceEmail(invoiceId, customerEmail, customMessage, appointmentId) {
  try {
    const previewResult = previewInvoice(invoiceId);
    if (!previewResult.success) return previewResult;
    const invoiceResult = getInvoiceDetails(invoiceId);
    if (!invoiceResult.success) return invoiceResult;
    const invoice = invoiceResult.invoice;
    const invoiceNumber = invoice['Invoice Number'] || invoiceId;
    const subject = '📄 Invoice #' + invoiceNumber + ' from A Quality Pool Company';
    let html = previewResult.html;
    const defaultAppointmentMessage = getAppointmentInvoiceEmailMessage_();
    const finalCustomMessage = (customMessage && String(customMessage).trim())
      ? String(customMessage).trim()
      : defaultAppointmentMessage;
    if (finalCustomMessage) {
      const invoiceSummaryStart = html.indexOf('<div style="background:#f8fafc;border:1px solid');
      if (invoiceSummaryStart !== -1) {
        const customMessageHtml = '<div style="background:linear-gradient(135deg,#dbeafe,#bfdbfe);border-left:4px solid #3b82f6;padding:20px;margin:20px 0;border-radius:0 8px 8px 0;"><p style="margin:0;font-size:15px;color:#1e40af;line-height:1.6;">' + finalCustomMessage.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p></div>';
        html = html.substring(0, invoiceSummaryStart) + customMessageHtml + html.substring(invoiceSummaryStart);
      }
    }
    MailApp.sendEmail({ to: customerEmail, subject: subject, htmlBody: html });
    
    // Update Column D (JSON Part 1) with sentDate and sentBy
    try {
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      const sheet = ss.getSheetByName(INVOICES_ESTIMATES_SHEET);
      if (sheet) {
        const dataRows = sheet.getDataRange().getValues();
        
    // Helper function to concatenate JSON parts
    function concatenateJsonParts(part1, part2, part3) {
      let jsonStr = '';
      if (part1) jsonStr += part1.toString();
      if (part2) jsonStr += part2.toString();
      if (part3) jsonStr += part3.toString();
      // Handle escaped quotes from CSV format ("" -> ")
      jsonStr = jsonStr.replace(/""/g, '"');
      return jsonStr.trim();
    }
        
        // Helper function to split JSON if needed
        function splitJsonString(jsonStr) {
          const maxLen = 50000; // Google Sheets cell limit
          if (jsonStr.length <= maxLen) {
            return [jsonStr, '', ''];
          }
          // Split into chunks
          return [
            jsonStr.substring(0, maxLen),
            jsonStr.substring(maxLen, maxLen * 2),
            jsonStr.substring(maxLen * 2)
          ];
        }
        
        for (let i = 1; i < dataRows.length; i++) {
          const rowId = dataRows[i][1] || dataRows[i][0]; // Column B or A
          
          if (rowId === invoiceId) {
            const rowNum = i + 1; // Sheet rows are 1-indexed
            const jsonCol1 = 3; // Column D
            const jsonCol2 = 4; // Column E
            const jsonCol3 = 5; // Column F
            
            // Get existing JSON from all three parts
            const jsonPart1 = sheet.getRange(rowNum, jsonCol1 + 1).getValue() || ''; // +1 because sheet is 1-indexed
            const jsonPart2 = sheet.getRange(rowNum, jsonCol2 + 1).getValue() || '';
            const jsonPart3 = sheet.getRange(rowNum, jsonCol3 + 1).getValue() || '';
            const jsonStr = concatenateJsonParts(jsonPart1, jsonPart2, jsonPart3);
            
            // Parse existing JSON or create new
            let jsonData = {};
            if (jsonStr) {
              try {
                jsonData = JSON.parse(jsonStr);
              } catch (e) {
                // If not valid JSON, try just first part
                try {
                  jsonData = JSON.parse(jsonPart1);
                } catch (e2) {
                  // Start fresh
                  jsonData = {};
                }
              }
            }
            
            // Update sentDate and sentBy
            jsonData.sentDate = new Date().toISOString();
            jsonData.sentBy = Session.getActiveUser().getEmail() || '';
            
            // Write back to columns D, E, F (split if needed)
            const updatedJsonStr = JSON.stringify(jsonData);
            const chunks = splitJsonString(updatedJsonStr);
            
            sheet.getRange(rowNum, jsonCol1 + 1).setValue(chunks[0]);
            sheet.getRange(rowNum, jsonCol2 + 1).setValue(chunks[1]);
            sheet.getRange(rowNum, jsonCol3 + 1).setValue(chunks[2]);
            SpreadsheetApp.flush();
            
            Logger.log('✅ Updated sentDate in JSON for invoice: ' + invoiceId);
            break;
          }
        }
      }
    } catch (updateError) {
      Logger.log('⚠️ Error updating sentDate: ' + updateError.toString());
      // Don't fail the whole operation if update fails
    }
    
    const telegramResult = sendInvoiceTelegramDraftForAppointment_({
      appointmentId: appointmentId,
      invoiceId: invoiceId,
      customerEmail: customerEmail,
      includeStripe: false
    });

    return {
      success: true,
      message: telegramResult && telegramResult.success
        ? 'Invoice email sent + Telegram draft sent'
        : 'Invoice email sent',
      telegramDraftSent: !!(telegramResult && telegramResult.success),
      telegramDraftError: (telegramResult && !telegramResult.success && !telegramResult.skipped)
        ? (telegramResult.error || 'Telegram draft failed')
        : '',
      telegramDraftSkipped: !!(telegramResult && telegramResult.skipped)
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function sendInvoiceWithStripe(invoiceId, customerEmail, appointmentId) {
  try {
    if (!invoiceId) return { success: false, error: 'Invoice ID required' };
    const fetchPayload = {
      action: 'getInvoiceEstimate',
      id: String(invoiceId).trim()
    };
    const fetchResponse = UrlFetchApp.fetch(INVOICE_ESTIMATE_WEBAPP_URL, {
      method: 'post',
      payload: fetchPayload,
      muteHttpExceptions: true
    });
    const fetchText = fetchResponse.getContentText() || '{}';
    let fetched = {};
    try {
      fetched = JSON.parse(fetchText);
    } catch (parseErr) {
      return { success: false, error: fetchText || 'Invoice not found' };
    }

    if (!fetched || !fetched.success || !fetched.data) {
      return { success: false, error: (fetched && fetched.error) ? fetched.error : 'Invoice not found' };
    }

    const invoiceData = fetched.data || {};
    invoiceData.id = String(invoiceData.id || invoiceId).trim();
    invoiceData.invoiceNumber = String(invoiceData.invoiceNumber || invoiceData.quoteNumber || invoiceData.id || invoiceId).trim();
    if (customerEmail) invoiceData.customerEmail = String(customerEmail || '').trim();
    if (!invoiceData.customEmailMessage || !String(invoiceData.customEmailMessage).trim()) {
      invoiceData.customEmailMessage = getAppointmentInvoiceEmailMessage_();
    }
    invoiceData.deferEmailSend = false;

    if (!invoiceData.customerEmail) {
      return { success: false, error: 'Customer email required' };
    }

    const sendResponse = UrlFetchApp.fetch(INVOICE_ESTIMATE_WEBAPP_URL, {
      method: 'post',
      payload: {
        action: 'sendInvoiceEstimate',
        data: JSON.stringify(invoiceData)
      },
      muteHttpExceptions: true
    });
    const sendText = sendResponse.getContentText() || '{}';
    let sendParsed;
    try {
      sendParsed = JSON.parse(sendText);
    } catch (parseErr2) {
      return { success: false, error: sendText || 'Failed to send invoice with regular invoice format' };
    }

    if (!(sendParsed && sendParsed.success)) {
      return sendParsed || { success: false, error: 'Failed to send invoice with regular invoice format' };
    }

    const telegramResult = sendInvoiceTelegramDraftForAppointment_({
      appointmentId: appointmentId,
      invoiceId: invoiceId,
      customerEmail: invoiceData.customerEmail || customerEmail,
      includeStripe: true
    });

    sendParsed.telegramDraftSent = !!(telegramResult && telegramResult.success);
    sendParsed.telegramDraftSkipped = !!(telegramResult && telegramResult.skipped);
    sendParsed.telegramDraftError = (telegramResult && !telegramResult.success && !telegramResult.skipped)
      ? (telegramResult.error || 'Telegram draft failed')
      : '';
    if (!sendParsed.message) {
      sendParsed.message = sendParsed.telegramDraftSent
        ? 'Invoice sent with Stripe + Telegram draft sent'
        : 'Invoice sent with Stripe';
    }
    return sendParsed;
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function getOrCreateAutopaySheet_() {
  return getOrCreateSheet(AUTOPAY_CUSTOMERS_SHEET, [
    'CompanyID', 'CustomerEmail', 'CustomerName', 'CustomerPhone',
    'StripeCustomerID', 'StripePaymentMethodID', 'AutopayStatus',
    'Last4', 'Brand', 'UpdatedAt'
  ]);
}

function getOrCreateAdditionalChargeSheet_() {
  return getOrCreateSheet(ADDITIONAL_CHARGE_APPROVALS_SHEET, [
    'Token', 'CompanyID', 'AppointmentID', 'CustomerName', 'CustomerEmail', 'CustomerPhone',
    'Amount', 'Reason', 'Description', 'Status', 'ApprovalURL',
    'StripeCustomerID', 'StripePaymentMethodID', 'ChargePaymentIntentID',
    'CreatedAt', 'ApprovedAt', 'ChargedAt', 'ExpiresAt'
  ]);
}

function createOrGetStripeCustomerForScheduling_(email, name, phone) {
  if (!STRIPE_SECRET_KEY) return { success: false, error: 'Stripe key is not configured' };
  if (!email) return { success: false, error: 'Customer email required' };
  try {
    const searchUrl = STRIPE_API_URL + '/customers/search?query=' + encodeURIComponent("email:'" + email + "'");
    const searchRes = UrlFetchApp.fetch(searchUrl, {
      method: 'get',
      headers: { 'Authorization': 'Bearer ' + STRIPE_SECRET_KEY },
      muteHttpExceptions: true
    });
    if (searchRes.getResponseCode() >= 200 && searchRes.getResponseCode() < 300) {
      const body = JSON.parse(searchRes.getContentText() || '{}');
      if (body && body.data && body.data.length > 0) {
        return { success: true, customerId: body.data[0].id };
      }
    }

    const createRes = UrlFetchApp.fetch(STRIPE_API_URL + '/customers', {
      method: 'post',
      headers: { 'Authorization': 'Bearer ' + STRIPE_SECRET_KEY },
      payload: {
        email: String(email),
        name: String(name || ''),
        phone: String(phone || ''),
        'metadata[source]': 'scheduling'
      },
      muteHttpExceptions: true
    });
    if (createRes.getResponseCode() >= 200 && createRes.getResponseCode() < 300) {
      const customer = JSON.parse(createRes.getContentText() || '{}');
      return { success: true, customerId: customer.id };
    }
    return { success: false, error: createRes.getContentText() || 'Unable to create Stripe customer' };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function upsertAutopayProfile_(profile) {
  const sheet = getOrCreateAutopaySheet_();
  const data = sheet.getDataRange().getValues();
  const email = String(profile.customerEmail || '').toLowerCase().trim();
  const companyId = String(profile.companyId || DEFAULT_COMPANY_ID).trim();
  const now = new Date().toISOString();
  const rowData = [
    companyId,
    email,
    profile.customerName || '',
    profile.customerPhone || '',
    profile.stripeCustomerId || '',
    profile.stripePaymentMethodId || '',
    profile.autopayStatus || 'Pending',
    profile.last4 || '',
    profile.brand || '',
    now
  ];
  for (let i = 1; i < data.length; i++) {
    const rowCompany = String(data[i][0] || '').trim();
    const rowEmail = String(data[i][1] || '').toLowerCase().trim();
    if (rowCompany === companyId && rowEmail === email) {
      sheet.getRange(i + 1, 1, 1, rowData.length).setValues([rowData]);
      return;
    }
  }
  sheet.appendRow(rowData);
}

function getAutopayProfile_(companyId, customerEmail) {
  const sheet = getOrCreateAutopaySheet_();
  const data = sheet.getDataRange().getValues();
  const targetCompany = String(companyId || DEFAULT_COMPANY_ID).trim();
  const targetEmail = String(customerEmail || '').toLowerCase().trim();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').trim() !== targetCompany) continue;
    if (String(data[i][1] || '').toLowerCase().trim() !== targetEmail) continue;
    return {
      companyId: String(data[i][0] || ''),
      customerEmail: String(data[i][1] || ''),
      customerName: String(data[i][2] || ''),
      customerPhone: String(data[i][3] || ''),
      stripeCustomerId: String(data[i][4] || ''),
      stripePaymentMethodId: String(data[i][5] || ''),
      autopayStatus: String(data[i][6] || ''),
      last4: String(data[i][7] || ''),
      brand: String(data[i][8] || '')
    };
  }
  return null;
}

function createAutopayEnrollmentLink(data) {
  try {
    if (!STRIPE_SECRET_KEY) return { success: false, error: 'Stripe key is not configured' };
    if (!data || !data.customerEmail) return { success: false, error: 'Customer email is required' };

    const companyId = String(data.companyId || DEFAULT_COMPANY_ID).trim();
    const customerName = String(data.customerName || '').trim();
    const customerEmail = String(data.customerEmail || '').trim();
    const customerPhone = String(data.customerPhone || '').trim();
    const appointmentId = String(data.appointmentId || '').trim();

    const customerRes = createOrGetStripeCustomerForScheduling_(customerEmail, customerName, customerPhone);
    if (!customerRes.success) return customerRes;

    const appUrl = ScriptApp.getService().getUrl();
    const successUrl = data.successUrl || (appUrl ? appUrl + '?autopay=success' : 'https://www.aqualitypoolcompanyusa.com');
    const cancelUrl = data.cancelUrl || (appUrl ? appUrl + '?autopay=cancel' : 'https://www.aqualitypoolcompanyusa.com');

    const payload = {
      mode: 'setup',
      customer: customerRes.customerId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      'payment_method_types[]': 'card',
      'metadata[source]': 'scheduling',
      'metadata[company_id]': companyId,
      'metadata[appointment_id]': appointmentId,
      'metadata[customer_email]': customerEmail,
      'metadata[customer_name]': customerName
    };

    const response = UrlFetchApp.fetch(STRIPE_API_URL + '/checkout/sessions', {
      method: 'post',
      headers: { 'Authorization': 'Bearer ' + STRIPE_SECRET_KEY },
      payload: payload,
      muteHttpExceptions: true
    });

    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
      return { success: false, error: response.getContentText() || 'Failed to create Stripe setup session' };
    }

    const session = JSON.parse(response.getContentText() || '{}');
    upsertAutopayProfile_({
      companyId: companyId,
      customerEmail: customerEmail,
      customerName: customerName,
      customerPhone: customerPhone,
      stripeCustomerId: customerRes.customerId,
      autopayStatus: 'Pending'
    });

    return {
      success: true,
      url: session.url || '',
      stripeCustomerId: customerRes.customerId,
      message: 'Autopay enrollment link created.'
    };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function handleSchedulingStripeWebhook_(event) {
  try {
    if (!event || !event.type) return { success: true, ignored: true };

    if (event.type === 'checkout.session.completed') {
      const session = event.data && event.data.object ? event.data.object : {};
      if (String(session.mode || '') !== 'setup') return { success: true, ignored: true };
      const setupIntentId = String(session.setup_intent || '').trim();
      if (!setupIntentId) return { success: false, error: 'No setup_intent on session' };

      const setupRes = UrlFetchApp.fetch(STRIPE_API_URL + '/setup_intents/' + setupIntentId, {
        method: 'get',
        headers: { 'Authorization': 'Bearer ' + STRIPE_SECRET_KEY },
        muteHttpExceptions: true
      });
      if (setupRes.getResponseCode() < 200 || setupRes.getResponseCode() >= 300) {
        return { success: false, error: 'Failed retrieving setup intent' };
      }
      const setupIntent = JSON.parse(setupRes.getContentText() || '{}');
      const paymentMethodId = String(setupIntent.payment_method || '').trim();
      const customerId = String(setupIntent.customer || session.customer || '').trim();

      let pm = {};
      if (paymentMethodId) {
        const pmRes = UrlFetchApp.fetch(STRIPE_API_URL + '/payment_methods/' + paymentMethodId, {
          method: 'get',
          headers: { 'Authorization': 'Bearer ' + STRIPE_SECRET_KEY },
          muteHttpExceptions: true
        });
        if (pmRes.getResponseCode() >= 200 && pmRes.getResponseCode() < 300) {
          pm = JSON.parse(pmRes.getContentText() || '{}');
        }
      }

      const meta = session.metadata || {};
      upsertAutopayProfile_({
        companyId: meta.company_id || DEFAULT_COMPANY_ID,
        customerEmail: meta.customer_email || '',
        customerName: meta.customer_name || '',
        stripeCustomerId: customerId,
        stripePaymentMethodId: paymentMethodId,
        autopayStatus: 'Active',
        last4: pm && pm.card ? (pm.card.last4 || '') : '',
        brand: pm && pm.card ? (pm.card.brand || '') : ''
      });
      return { success: true };
    }

    return { success: true, ignored: true };
  } catch (e) {
    Logger.log('handleSchedulingStripeWebhook_ error: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

function chargeStoredPaymentMethod_(companyId, customerEmail, amount, description, metadata) {
  const profile = getAutopayProfile_(companyId, customerEmail);
  if (!profile || !profile.stripeCustomerId || !profile.stripePaymentMethodId) {
    return { success: false, error: 'No stored autopay payment method found for customer' };
  }
  const cents = Math.round((parseFloat(amount || 0) || 0) * 100);
  if (!cents || cents < 50) return { success: false, error: 'Charge amount is invalid' };

  const payload = {
    amount: String(cents),
    currency: 'usd',
    customer: profile.stripeCustomerId,
    payment_method: profile.stripePaymentMethodId,
    off_session: 'true',
    confirm: 'true',
    description: description || 'Additional service charge'
  };
  const meta = metadata || {};
  Object.keys(meta).forEach(function(k) {
    payload['metadata[' + k + ']'] = String(meta[k] || '');
  });

  const res = UrlFetchApp.fetch(STRIPE_API_URL + '/payment_intents', {
    method: 'post',
    headers: { 'Authorization': 'Bearer ' + STRIPE_SECRET_KEY },
    payload: payload,
    muteHttpExceptions: true
  });

  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
    return { success: false, error: res.getContentText() || 'Charge failed' };
  }
  const pi = JSON.parse(res.getContentText() || '{}');
  return { success: true, paymentIntentId: pi.id || '', status: pi.status || '' };
}

function requestAdditionalChargeApproval(data) {
  try {
    if (!data || !data.customerEmail) return { success: false, error: 'Customer email required' };
    if (!data.amount || data.amount <= 0) return { success: false, error: 'Amount must be greater than zero' };

    const companyId = String(data.companyId || DEFAULT_COMPANY_ID).trim();
    const token = Utilities.getUuid();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + (72 * 60 * 60 * 1000));
    const appUrl = ScriptApp.getService().getUrl();
    const approvalUrl = (appUrl || '') + '?action=approveAdditionalCharge&token=' + encodeURIComponent(token);

    const profile = getAutopayProfile_(companyId, data.customerEmail) || {};

    const sheet = getOrCreateAdditionalChargeSheet_();
    sheet.appendRow([
      token,
      companyId,
      data.appointmentId || '',
      data.customerName || '',
      data.customerEmail || '',
      data.customerPhone || '',
      Number(data.amount || 0),
      data.reason || '',
      data.description || '',
      'Pending',
      approvalUrl,
      profile.stripeCustomerId || '',
      profile.stripePaymentMethodId || '',
      '',
      createdAt.toISOString(),
      '',
      '',
      expiresAt.toISOString()
    ]);

    const customerText = 'Hi ' + (data.customerName || 'there') + ', we found an additional charge of $' + Number(data.amount || 0).toFixed(2)
      + (data.reason ? ' for ' + data.reason : '') + '. Please approve here: ' + approvalUrl;

    const facts = [
      { label: 'Customer', value: data.customerName || '' },
      { label: 'Phone', value: data.customerPhone || '' },
      { label: 'Email', value: data.customerEmail || '' },
      { label: 'Amount', value: '$' + Number(data.amount || 0).toFixed(2) },
      { label: 'Reason', value: data.reason || '' }
    ];
    sendBrooksTelegramDraft_(data.appointmentId || '', 'AdditionalChargeApproval', 'Additional charge approval requested', facts, customerText, 'Open approval link', approvalUrl);

    return { success: true, approvalUrl: approvalUrl, token: token, message: 'Approval request created and Telegram draft sent.' };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function approveAdditionalChargeByToken_(token) {
  if (!token) return { success: false, error: 'Missing approval token' };
  try {
    const sheet = getOrCreateAdditionalChargeSheet_();
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const rowToken = String(data[i][0] || '').trim();
      if (rowToken !== token) continue;

      const status = String(data[i][9] || '').trim();
      const expiresAt = String(data[i][17] || '').trim();
      if (status === 'Approved' || status === 'Charged') {
        return { success: true, message: 'Already approved' };
      }
      if (expiresAt && new Date(expiresAt) < new Date()) {
        return { success: false, error: 'This approval link has expired.' };
      }

      const companyId = String(data[i][1] || DEFAULT_COMPANY_ID);
      const appointmentId = String(data[i][2] || '');
      const customerEmail = String(data[i][4] || '');
      const amount = parseFloat(data[i][6] || 0) || 0;
      const reason = String(data[i][7] || 'Additional service');

      const approvedAt = new Date().toISOString();
      sheet.getRange(i + 1, 10).setValue('Approved');
      sheet.getRange(i + 1, 16).setValue(approvedAt);

      let chargeResult = { success: false, error: 'No charge attempted' };
      if (amount > 0 && customerEmail) {
        chargeResult = chargeStoredPaymentMethod_(companyId, customerEmail, amount, reason, {
          source: 'scheduling-additional-charge',
          appointment_id: appointmentId,
          approval_token: token
        });
      }

      if (chargeResult.success) {
        sheet.getRange(i + 1, 10).setValue('Charged');
        sheet.getRange(i + 1, 14).setValue(chargeResult.paymentIntentId || '');
        sheet.getRange(i + 1, 17).setValue(new Date().toISOString());
      }

      return { success: true, chargeResult: chargeResult };
    }
    return { success: false, error: 'Invalid approval token' };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * DEBUG: Test function to pull all invoices for a customer email
 * Run this in the Apps Script editor to see detailed matching information
 */
function TEST_getInvoicesForCustomer(customerEmail) {
  customerEmail = customerEmail || 'linnry@gmail.com';
  Logger.log('========================================');
  Logger.log('🔍 DEBUG: Searching for invoices for: ' + customerEmail);
  Logger.log('========================================');
  
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(INVOICES_ESTIMATES_SHEET);
    
    if (!sheet) {
      Logger.log('❌ Invoice sheet not found!');
      return;
    }
    
    const dataRows = sheet.getDataRange().getValues();
    Logger.log('📊 Total rows in sheet: ' + dataRows.length);
    
    if (dataRows.length < 2) {
      Logger.log('⚠️ No data rows found');
      return;
    }
    
    const headers = dataRows[0];
    Logger.log('\n📋 HEADERS:');
    headers.forEach((header, idx) => {
      Logger.log('  Column ' + (idx + 1) + ' (' + String.fromCharCode(65 + idx) + '): ' + header);
    });
    
    // Try both 'Customer Email' (with space) and 'CustomerEmail' (no space)
    let emailCol = headers.indexOf('Customer Email');
    if (emailCol === -1) {
      emailCol = headers.indexOf('CustomerEmail');
    }
    const totalCol = headers.indexOf('Total');
    const jsonCol1 = 3; // Column D - JSON Part 1
    const jsonCol2 = 4; // Column E - JSON Part 2
    const jsonCol3 = 5; // Column F - JSON Part 3
    
    Logger.log('\n🔍 COLUMN INDICES:');
    Logger.log('  Customer Email: ' + emailCol + ' (Column ' + (emailCol !== -1 ? String.fromCharCode(65 + emailCol) : 'NOT FOUND') + ')');
    Logger.log('  Total: ' + totalCol + ' (Column ' + (totalCol !== -1 ? String.fromCharCode(65 + totalCol) : 'NOT FOUND') + ')');
    Logger.log('  JSON Part 1 (Column D): ' + jsonCol1);
    Logger.log('  JSON Part 2 (Column E): ' + jsonCol2);
    Logger.log('  JSON Part 3 (Column F): ' + jsonCol3);
    
    if (emailCol === -1) {
      Logger.log('\n❌ ERROR: Customer Email column not found!');
      return;
    }
    
    const customerEmailLower = customerEmail.toLowerCase().trim();
    Logger.log('\n🔎 SEARCHING FOR: "' + customerEmailLower + '"');
    Logger.log('========================================\n');
    
    let invoiceCount = 0;
    let matchCount = 0;
    
    // Helper function to concatenate JSON parts
    function concatenateJsonParts(part1, part2, part3) {
      let jsonStr = '';
      if (part1) jsonStr += part1.toString();
      if (part2) jsonStr += part2.toString();
      if (part3) jsonStr += part3.toString();
      jsonStr = jsonStr.replace(/""/g, '"');
      return jsonStr.trim();
    }
    
    for (let i = 1; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowEmail = (row[emailCol] || '').toString().toLowerCase().trim();
      
      // Match by email
      const matchesEmail = rowEmail === customerEmailLower;
      
      if (matchesEmail) {
        invoiceCount++;
        Logger.log('\n📄 ROW ' + (i + 1) + ' (Invoice #' + invoiceCount + '):');
        Logger.log('  Email: "' + rowEmail + '"');
        Logger.log('  Column B (ID): ' + (row[1] || ''));
        
        // Try to parse JSON FIRST to get the ID from JSON
        const jsonPart1 = row[jsonCol1];
        const jsonPart2 = row[jsonCol2];
        const jsonPart3 = row[jsonCol3];
        
        let invoiceData = null;
        if (typeof jsonPart1 === 'object' && jsonPart1 !== null && !Array.isArray(jsonPart1)) {
          invoiceData = jsonPart1;
          Logger.log('  ✅ JSON Part 1 is already an object');
        } else {
          const jsonPart1Str = (jsonPart1 || '').toString();
          const jsonPart2Str = (jsonPart2 || '').toString();
          const jsonPart3Str = (jsonPart3 || '').toString();
          const jsonStr = concatenateJsonParts(jsonPart1Str, jsonPart2Str, jsonPart3Str);
          
          Logger.log('  📄 JSON Part 1 length: ' + jsonPart1Str.length);
          Logger.log('  📄 JSON Part 2 length: ' + jsonPart2Str.length);
          Logger.log('  📄 JSON Part 3 length: ' + jsonPart3Str.length);
          Logger.log('  📄 Combined JSON length: ' + jsonStr.length);
          
          if (jsonStr) {
            try {
              invoiceData = JSON.parse(jsonStr);
              Logger.log('  ✅ Successfully parsed JSON (combined)');
            } catch (e) {
              Logger.log('  ⚠️ Failed to parse combined JSON: ' + e.toString());
              try {
                // Try fixing items field
                let jsonStrFixed = jsonStr.replace(/"items"\s*:\s*"(\[.*?\])"/g, function(match, itemsArray) {
                  const unescaped = itemsArray.replace(/\\"/g, '"').replace(/\\n/g, '\n');
                  return '"items":' + unescaped;
                });
                invoiceData = JSON.parse(jsonStrFixed);
                Logger.log('  ✅ Successfully parsed JSON (fixed items field)');
              } catch (e2) {
                try {
                  const jsonStrClean = jsonStr.replace(/""/g, '"');
                  invoiceData = JSON.parse(jsonStrClean);
                  Logger.log('  ✅ Successfully parsed JSON (cleaned escaped quotes)');
                } catch (e3) {
                  try {
                    const jsonPart1Clean = jsonPart1Str.replace(/""/g, '"');
                    invoiceData = JSON.parse(jsonPart1Clean);
                    Logger.log('  ✅ Successfully parsed JSON Part 1 only');
                  } catch (e4) {
                    Logger.log('  ⚠️ Could not fully parse JSON, extracting fields manually');
                    invoiceData = {};
                    // Extract ID and other fields using regex
                    const idMatch = jsonStr.match(/"id"\s*:\s*"([^"\\]+(?:\\.[^"\\]*)*)"/) || jsonStr.match(/"id"\s*:\s*"([^"]+)"/);
                    const invoiceNumberMatch = jsonStr.match(/"invoiceNumber"\s*:\s*"([^"\\]+(?:\\.[^"\\]*)*)"/) || jsonStr.match(/"invoiceNumber"\s*:\s*"([^"]+)"/);
                    const dateMatch = jsonStr.match(/"date"\s*:\s*"([^"\\]+(?:\\.[^"\\]*)*)"/) || jsonStr.match(/"date"\s*:\s*"([^"]+)"/);
                    const statusMatch = jsonStr.match(/"status"\s*:\s*"([^"\\]+(?:\\.[^"\\]*)*)"/) || jsonStr.match(/"status"\s*:\s*"([^"]+)"/);
                    const typeMatch = jsonStr.match(/"type"\s*:\s*"([^"\\]+(?:\\.[^"\\]*)*)"/) || jsonStr.match(/"type"\s*:\s*"([^"]+)"/);
                    const totalMatch = jsonStr.match(/"total"\s*:\s*(\d+\.?\d*)/);
                    const sentDateMatch = jsonStr.match(/"sentDate"\s*:\s*"([^"\\]+(?:\\.[^"\\]*)*)"/) || jsonStr.match(/"sentDate"\s*:\s*"([^"]+)"/);
                    
                    if (idMatch) invoiceData.id = idMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
                    if (invoiceNumberMatch) invoiceData.invoiceNumber = invoiceNumberMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
                    if (dateMatch) invoiceData.date = dateMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
                    if (statusMatch) invoiceData.status = statusMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
                    if (typeMatch) invoiceData.type = typeMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
                    if (totalMatch) invoiceData.total = parseFloat(totalMatch[1]);
                    if (sentDateMatch) invoiceData.sentDate = sentDateMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
                    
                    Logger.log('  ⚠️ Extracted fields manually: ' + Object.keys(invoiceData).join(', '));
                  }
                }
              }
            }
          } else {
            Logger.log('  ⚠️ No JSON data found in any column');
          }
        }
        
        if (invoiceData) {
          // Get ID from JSON (this is what we use for lookups)
          const invoiceIdFromJson = (invoiceData.id || '').toString().trim();
          const finalInvoiceId = invoiceIdFromJson || (row[1] || '').toString().trim();
          
          const invoiceType = invoiceData.type || '';
          const invoiceStatus = invoiceData.status || '';
          const invoiceNumber = invoiceData.invoiceNumber || ''; // Display only - NOT used for lookups
          const invoiceDate = invoiceData.date || '';
          const invoiceTotal = (totalCol !== -1 && row[totalCol]) ? row[totalCol] : (invoiceData.total || 0);
          
          Logger.log('  📝 Invoice ID from JSON: "' + invoiceIdFromJson + '"');
          Logger.log('  📝 Final Invoice ID (used for lookups): "' + finalInvoiceId + '"');
          Logger.log('  📋 Type: ' + invoiceType);
          Logger.log('  📋 Status: ' + invoiceStatus);
          Logger.log('  📋 Invoice Number (display only): ' + invoiceNumber);
          Logger.log('  📋 Date: ' + invoiceDate);
          Logger.log('  📋 Total: $' + invoiceTotal);
          
          if (invoiceData.sentDate) {
            Logger.log('  ✅ Sent Date: ' + invoiceData.sentDate);
            Logger.log('  ✅ Sent By: ' + (invoiceData.sentBy || 'N/A'));
          }
          
          // Skip Draft
          if (invoiceStatus && invoiceStatus.toLowerCase() === 'draft') {
            Logger.log('  ⏭️ Skipping Draft invoice');
            continue;
          }
          
          matchCount++;
          Logger.log('  🎯 MATCH FOUND! (Using ID: "' + finalInvoiceId + '")');
        } else {
          Logger.log('  ⚠️ Could not parse invoice data');
        }
      }
    }
    
    Logger.log('\n========================================');
    Logger.log('📊 SUMMARY:');
    Logger.log('  Total Invoices in Sheet: ' + invoiceCount);
    Logger.log('  Matches Found: ' + matchCount);
    Logger.log('========================================\n');
    
    // Also try the actual function
    Logger.log('\n🧪 TESTING getCustomerInvoices() FUNCTION:');
    const result = getCustomerInvoices(customerEmail);
    Logger.log('  Success: ' + result.success);
    Logger.log('  Invoices Returned: ' + (result.invoices ? result.invoices.length : 0));
    if (result.invoices && result.invoices.length > 0) {
      result.invoices.forEach((inv, idx) => {
        Logger.log('  Invoice ' + (idx + 1) + ':');
        Logger.log('    ID: "' + inv.id + '"');
        Logger.log('    Total: $' + inv.total);
        Logger.log('    Sent: ' + (inv.sentDate ? 'Yes (' + inv.sentDate + ')' : 'No'));
      });
    }
    if (result.error) {
      Logger.log('  Error: ' + result.error);
    }
    
    // Test getInvoiceDetails with the ID from JSON
    if (result.invoices && result.invoices.length > 0) {
      Logger.log('\n🧪 TESTING getInvoiceDetails() with ID from JSON:');
      const testInvoiceId = result.invoices[0].id;
      Logger.log('  Testing with ID: "' + testInvoiceId + '"');
      const detailsResult = getInvoiceDetails(testInvoiceId);
      if (detailsResult.success) {
        Logger.log('  ✅ Invoice found!');
        Logger.log('    ID: "' + detailsResult.invoice.id + '"');
        Logger.log('    Total: $' + detailsResult.invoice.total);
      } else {
        Logger.log('  ❌ Invoice not found: ' + (detailsResult.error || 'Unknown error'));
      }
    }
    
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.toString());
    Logger.log('Stack: ' + error.stack);
  }
}

/**
 * Get payment history for a customer by email
 * Uses the same simple logic as lookupCardPayment - direct email match in Payment History sheet
 */
function getCustomerPaymentHistory(customerEmail) {
  try {
    if (!customerEmail) {
      return { success: true, payments: [] };
    }
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(PAYMENT_HISTORY_SHEET);
    if (!sheet) {
      return { success: true, payments: [] }; // No sheet = no payments, not an error
    }

    const data = sheet.getDataRange().getValues();
    if (data.length < 3) {
      return { success: true, payments: [] }; // Row 1 = title, Row 2 = headers
    }

    const payments = [];
    const customerEmailLower = customerEmail.toLowerCase().trim();
    
    // Start from row 3 (index 2) since row 1 is title, row 2 is headers
    // Use same column mapping as lookupCardPayment:
    // A: Date (0), B: Invoice ID (1), C: Company ID (2), D: Amount (3), 
    // E: Payment Method (4), F: Transaction ID (5), G: Status (6), 
    // H: Email (7), I: Description (8), J: Fee (9), K: Notes (10)
    for (let i = 2; i < data.length; i++) {
      const rowEmail = (data[i][7] || '').toString().toLowerCase().trim(); // Col H = Email
      
      if (rowEmail && rowEmail === customerEmailLower) {
        payments.push({
          date: formatSheetDate(data[i][0]),       // Col A
          invoiceId: (data[i][1] || '').toString(), // Col B
          amount: parseFloat(data[i][3]) || 0,      // Col D
          method: (data[i][4] || '').toString(),   // Col E
          transactionId: (data[i][5] || '').toString(), // Col F
          status: (data[i][6] || '').toString(),    // Col G
          notes: (data[i][10] || '').toString()    // Col K
        });
      }
    }

    // Sort newest first (same as lookupCardPayment)
    payments.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    
    return { success: true, payments: payments };
  } catch (error) {
    const errorMsg = error ? (error.toString() || 'Unknown error') : 'Unknown error';
    const errorStack = error && error.stack ? error.stack : '';
    Logger.log('❌ Error getting payment history: ' + errorMsg);
    if (errorStack) {
      Logger.log('Stack: ' + errorStack);
    }
    return { success: false, error: errorMsg, payments: [] };
  }
}

// ===========================================================================
// DISCOUNT CODES - Read/write "Discount Codes" sheet (Code, Type, Value, Active, Expires Date)
// ===========================================================================
const DISCOUNT_HEADERS = ['Code', 'Type', 'Value', 'Active', 'Expires Date'];

function getDiscountCodesSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(DISCOUNT_CODES_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(DISCOUNT_CODES_SHEET);
    sheet.getRange(1, 1, 1, DISCOUNT_HEADERS.length).setValues([DISCOUNT_HEADERS]);
    sheet.getRange(1, 1, 1, DISCOUNT_HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * Get all discount codes from the Discount Codes sheet.
 * Columns: A=Code, B=Type, C=Value, D=Active, E=Expires Date
 */
function getDiscountCodes() {
  try {
    const sheet = getDiscountCodesSheet();
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return { success: true, codes: [] };
    const codes = [];
    for (let i = 1; i < values.length; i++) {
      const code = (values[i][0] || '').toString().trim();
      if (!code) continue;
      const activeVal = values[i][3];
      const active = activeVal === true || activeVal === 'TRUE' || String(activeVal).toLowerCase() === 'yes' || activeVal === '1';
      let expiresDate = '';
      if (values[i][4]) {
        if (values[i][4] instanceof Date) {
          expiresDate = values[i][4].getFullYear() + '-' + String(values[i][4].getMonth() + 1).padStart(2, '0') + '-' + String(values[i][4].getDate()).padStart(2, '0');
        } else {
          expiresDate = String(values[i][4]).trim();
        }
      }
      codes.push({
        code: code,
        type: (values[i][1] || '').toString().trim(),
        value: (values[i][2] || '').toString().trim(),
        active: active,
        expiresDate: expiresDate,
        rowIndex: i + 1
      });
    }
    return { success: true, codes: codes };
  } catch (error) {
    Logger.log('Error in getDiscountCodes: ' + error);
    return { success: false, codes: [], error: error.toString() };
  }
}

/**
 * Save a discount code (create or update by Code).
 */
function saveDiscountCode(data) {
  try {
    const sheet = getDiscountCodesSheet();
    const values = sheet.getDataRange().getValues();
    const code = (data.code || '').toString().trim();
    if (!code) return { success: false, error: 'Code is required' };

    const activeVal = data.active;
    const active = activeVal === true || activeVal === 'TRUE' || String(activeVal).toLowerCase() === 'yes' || activeVal === '1';
    const expiresDate = (data.expiresDate || '').toString().trim();

    for (let i = 1; i < values.length; i++) {
      if ((values[i][0] || '').toString().trim().toUpperCase() === code.toUpperCase()) {
        sheet.getRange(i + 1, 2).setValue(data.type || '');
        sheet.getRange(i + 1, 3).setValue(data.value || '');
        sheet.getRange(i + 1, 4).setValue(active);
        sheet.getRange(i + 1, 5).setValue(expiresDate || '');
        return { success: true, message: 'Code updated' };
      }
    }
    sheet.appendRow([code, data.type || '', data.value || '', active, expiresDate || '']);
    return { success: true, message: 'Code created' };
  } catch (error) {
    Logger.log('Error in saveDiscountCode: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Expire a discount code (set Active to false and optionally set Expires Date to today).
 */
function expireDiscountCode(code) {
  try {
    const sheet = getDiscountCodesSheet();
    const values = sheet.getDataRange().getValues();
    const codeStr = (code || '').toString().trim();
    if (!codeStr) return { success: false, error: 'Code is required' };
    const today = new Date();
    const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    for (let i = 1; i < values.length; i++) {
      if ((values[i][0] || '').toString().trim().toUpperCase() === codeStr.toUpperCase()) {
        sheet.getRange(i + 1, 4).setValue(false);
        sheet.getRange(i + 1, 5).setValue(todayStr);
        return { success: true, message: 'Code expired' };
      }
    }
    return { success: false, error: 'Code not found' };
  } catch (error) {
    Logger.log('Error in expireDiscountCode: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Delete a discount code row.
 */
function deleteDiscountCode(code) {
  try {
    const sheet = getDiscountCodesSheet();
    const values = sheet.getDataRange().getValues();
    const codeStr = (code || '').toString().trim();
    if (!codeStr) return { success: false, error: 'Code is required' };
    for (let i = 1; i < values.length; i++) {
      if ((values[i][0] || '').toString().trim().toUpperCase() === codeStr.toUpperCase()) {
        sheet.deleteRow(i + 1);
        return { success: true, message: 'Code deleted' };
      }
    }
    return { success: false, error: 'Code not found' };
  } catch (error) {
    Logger.log('Error in deleteDiscountCode: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ===========================================================================
// EMAIL CAMPAIGN - Bulk send to customer segment
// ===========================================================================
/**
 * Send bulk email to a segment of customers.
 * segments: array of tag strings, e.g. ['has-pool','VIP']. If empty or contains 'all', sends to all customers with email.
 * A customer is included if they have at least one of the selected tags (or all if segments is 'all').
 * Limits to 50 recipients per run to avoid quota. body is plain text or HTML.
 */
function sendBulkEmail(companyId, segments, subject, body) {
  try {
    const result = getCustomers(companyId);
    if (!result.success || !result.customers) {
      return { success: false, error: 'Could not load customers', sentCount: 0 };
    }
    const useAll = !segments || segments.length === 0 || (segments.length === 1 && segments[0] === 'all');
    const tagSet = useAll ? null : (Array.isArray(segments) ? segments : [segments]);
    let list = result.customers.filter(function(c) {
      if (!c.email || !c.email.trim()) return false;
      if (useAll) return true;
      const custTags = c.tags || [];
      for (var i = 0; i < tagSet.length; i++) {
        if (custTags.indexOf(tagSet[i]) !== -1) return true;
      }
      return false;
    });
    const maxSend = 50;
    list = list.slice(0, maxSend);
    if (!list.length) {
      return { success: false, error: 'No recipients in this segment (or no emails on file)', sentCount: 0 };
    }
    const isHtml = body.indexOf('<') !== -1 && body.indexOf('>') !== -1;
    let sent = 0;
    const errors = [];
    for (var i = 0; i < list.length; i++) {
      try {
        var firstName = (list[i].name || '').split(' ')[0] || 'there';
        var subj = subject.replace(/\{\{firstName\}\}/g, firstName);
        var b = body.replace(/\{\{firstName\}\}/g, firstName);
        MailApp.sendEmail({
          to: list[i].email.trim(),
          subject: subj,
          body: isHtml ? '' : b,
          htmlBody: isHtml ? b : null
        });
        sent++;
      } catch (e) {
        errors.push(list[i].email + ': ' + e.toString());
      }
    }
    return {
      success: sent > 0,
      sentCount: sent,
      totalRecipients: list.length,
      message: 'Sent to ' + sent + ' of ' + list.length + ' recipient(s)',
      errors: errors.length ? errors.slice(0, 5) : undefined
    };
  } catch (error) {
    Logger.log('Error in sendBulkEmail: ' + error);
    return { success: false, error: error.toString(), sentCount: 0 };
  }
}

// ===========================================================================
// FRONTEND-FACING API FUNCTIONS (called via google.script.run)
// ===========================================================================

/**
 * Frontend wrapper - load all appointments for the current company
 * This is what the frontend calls to populate the calendar
 */
function loadAppointments(email) {
  try {
    Logger.log('📅 loadAppointments() called');
    const ctx = getCompanyIdForSchedulingUser_(email || '');
    const companyId = ctx.companyId || DEFAULT_COMPANY_ID;
    const result = getScheduledAppointments(companyId);
    
    if (!result) {
      Logger.log('⚠️ getScheduledAppointments returned null/undefined');
      return { success: false, appointments: [], error: 'Function returned null' };
    }
    
    Logger.log('  Got ' + (result.appointments ? result.appointments.length : 0) + ' appointments');
    Logger.log('  Success: ' + result.success);
    
    // Ensure we always return a valid object
    if (!result.success) {
      Logger.log('  ⚠️ Result indicates failure: ' + (result.error || 'Unknown error'));
    }
    
    return result;
  } catch (error) {
    Logger.log('❌ Error in loadAppointments: ' + error.toString());
    Logger.log('Stack: ' + error.stack);
    return { success: false, appointments: [], error: error.toString() };
  }
}

/**
 * Frontend wrapper - load all customers for the current company
 * This is what the frontend calls to populate the customer list
 */
function loadCustomers(email) {
  try {
    Logger.log('👥 loadCustomers() called');
    const ctx = getCompanyIdForSchedulingUser_(email || '');
    const companyId = ctx.companyId || DEFAULT_COMPANY_ID;
    const result = getCustomers(companyId);
    Logger.log('  Got ' + (result.customers ? result.customers.length : 0) + ' customers');
    return result;
  } catch (error) {
    Logger.log('❌ Error in loadCustomers: ' + error.toString());
    return { success: false, customers: [], error: error.toString() };
  }
}

/**
 * Frontend wrapper - load all customer tags at once
 * More efficient than loading per-customer
 */
function loadAllTags() {
  try {
    Logger.log('🏷️ loadAllTags() called');
    const result = getAllCustomerTags();
    Logger.log('  Got tags for ' + Object.keys(result.tagsMap).length + ' customers');
    return result;
  } catch (error) {
    Logger.log('❌ Error in loadAllTags: ' + error.toString());
    return { success: false, tagsMap: {}, error: error.toString() };
  }
}

// ===========================================================================
// WEEKLY SERVICE DASHBOARD — Backend Functions
// ===========================================================================

/**
 * Returns all data needed for the weekly service dashboard:
 * - pending: pool service requests awaiting approval
 * - active: approved recurring (weekly/biweekly/monthly) pool service customers
 * - stats: counts and estimated monthly revenue
 */
function getWeeklyServiceDashboard(email) {
  try {
    Logger.log('📊 getWeeklyServiceDashboard called with email: ' + (email || 'empty'));
    const ctx = getCompanyIdForSchedulingUser_(email || '');
    const companyId = ctx.companyId || DEFAULT_COMPANY_ID;
    Logger.log('📊 Using companyId: ' + companyId);
    const sheet = getOrCreateSheet(APPOINTMENTS_SHEET, getAppointmentsHeaders());
    const values = sheet.getDataRange().getValues();
    Logger.log('📊 Found ' + (values.length - 1) + ' appointments in sheet');
    if (values.length < 2) {
      return {
        success: true,
        pending: [],
        active: [],
        stats: { weekly: 0, biweekly: 0, pendingCount: 0, monthlyRevenue: 0 },
        serviceReportWebAppUrl: getServiceReportWebAppUrl_()
      };
    }

    const headers = values[0];
    const colId        = headers.indexOf('ID') >= 0 ? headers.indexOf('ID') : headers.indexOf('AppointmentID');
    const colCompany   = headers.indexOf('CompanyID');
    const colName      = headers.indexOf('CustomerName');
    const colEmail     = headers.indexOf('CustomerEmail');
    const colPhone     = headers.indexOf('CustomerPhone');
    const colAddress   = headers.indexOf('Address');
    const colSvcType   = headers.indexOf('ServiceType');
    const colRecurring = headers.indexOf('Recurring');
    const colStatus    = headers.indexOf('Status');
    const colReqStatus = headers.indexOf('OpeningScheduleRequestStatus');
    const colCreated   = headers.indexOf('CreatedAt');
    const colDesc      = headers.indexOf('Description');
    const colNotes     = headers.indexOf('Notes');
    const colCost      = headers.indexOf('EstimatedCost');
    const colPrefDay   = headers.indexOf('PreferredServiceDay');
    const colLinkedSr  = headers.indexOf('LinkedServiceReportID');

    const pending = [];
    const activeByCustomer = {};

    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (colCompany >= 0) {
        const rowCompany = String(row[colCompany] || '').trim();
        if (rowCompany && rowCompany !== companyId) continue;
      }
      const svcType   = String(row[colSvcType] || '').trim().toLowerCase();
      const reqStatus = colReqStatus >= 0 ? String(row[colReqStatus] || '') : '';
      const status    = String(row[colStatus] || '');
      const recurring = colRecurring >= 0 ? String(row[colRecurring] || '') : '';

      // Include rows with 'pool service', 'pool', and recurring service cadence.
      const isPoolService = svcType && (svcType.includes('pool') || svcType.includes('service'));
      const recurringNormalized = recurring.toLowerCase();
      const isWeeklyRecurring = recurringNormalized && recurringNormalized !== 'none'
        && (recurringNormalized === 'weekly' || recurringNormalized === 'biweekly' || recurringNormalized === 'monthly');
      
      // MUST be pool service AND must be recurring.
      const isWeeklyService = isPoolService && isWeeklyRecurring;
      if (!isWeeklyService) continue;

      const record = {
        id:           String(row[colId] || ''),
        customerName: String(row[colName] || ''),
        customerEmail:String(row[colEmail] || ''),
        customerPhone:String(row[colPhone] || ''),
        address:      String(row[colAddress] || ''),
        recurring:    recurringNormalized,
        preferredDay: colPrefDay >= 0 ? String(row[colPrefDay] || '') : '',
        estimatedCost:parseFloat(row[colCost] || 0),
        description:  String(row[colDesc] || ''),
        notes:        String(row[colNotes] || ''),
        createdAt:    colCreated >= 0 ? String(row[colCreated] || '') : '',
        requestStatus:reqStatus,
        status:       status,
        linkedServiceReportId: colLinkedSr >= 0 ? String(row[colLinkedSr] || '').trim() : ''
      };

      if (reqStatus === 'Pending') {
        pending.push(record);
      } else if (reqStatus === 'Approved' || status === 'Scheduled' || status === 'Active') {
        // De-duplicate active customers so one customer does not appear once per appointment.
        // Prefer email, then phone, then name+address as a fallback key.
        const emailKey = String(record.customerEmail || '').trim().toLowerCase();
        const phoneKey = String(record.customerPhone || '').replace(/\D/g, '');
        const nameAddrKey = (String(record.customerName || '').trim().toLowerCase() + '|' + String(record.address || '').trim().toLowerCase());
        const customerKey = emailKey || phoneKey || nameAddrKey;
        if (!customerKey) continue;

        // Keep the newest row for that customer (largest row index wins).
        const existing = activeByCustomer[customerKey];
        if (!existing || i > existing._rowIndex) {
          activeByCustomer[customerKey] = Object.assign({}, record, { _rowIndex: i });
        }
      }
    }

    const active = Object.keys(activeByCustomer).map(function(k) {
      const rec = activeByCustomer[k];
      delete rec._rowIndex;
      return rec;
    });

    const weeklyCount   = active.filter(r => r.recurring === 'weekly' || (!r.recurring && r.estimatedCost === 160)).length;
    const biweeklyCount = active.filter(r => r.recurring === 'biweekly').length;
    const monthlyCount  = active.filter(r => r.recurring === 'monthly').length;
    const weeklyRev     = active.reduce((sum, r) => {
      const visits = r.recurring === 'biweekly' ? 2 : (r.recurring === 'monthly' ? 1 : 4);
      return sum + (r.estimatedCost * visits);
    }, 0);

    Logger.log('📊 Weekly Service Dashboard Results: Pending=' + pending.length + ', Active=' + active.length + ', WeeklyCount=' + weeklyCount + ', BiweeklyCount=' + biweeklyCount + ', MonthlyCount=' + monthlyCount);

    return {
      success: true,
      pending: pending,
      active:  active,
      stats: {
        weekly:         weeklyCount,
        biweekly:       biweeklyCount,
        monthly:        monthlyCount,
        pendingCount:   pending.length,
        monthlyRevenue: weeklyRev
      },
      serviceReportWebAppUrl: getServiceReportWebAppUrl_()
    };
  } catch (error) {
    Logger.log('❌ getWeeklyServiceDashboard error: ' + error.toString());
    return { success: false, error: error.toString(), pending: [], active: [], stats: {}, serviceReportWebAppUrl: getServiceReportWebAppUrl_() };
  }
}

/**
 * Manually enroll a customer in weekly or biweekly pool service.
 * Bypasses the pending/approval flow — goes straight to Active.
 * Optionally sends a welcome email to the customer.
 */
function manuallyAddWeeklyService(data) {
  if (!data || !data.customerName || !data.customerEmail) {
    return { success: false, error: 'Customer name and email are required' };
  }
  try {
    const companyId = String(data.companyId || DEFAULT_COMPANY_ID).trim();
    // Find or create customer record
    createOrFindCustomer({
      companyId: companyId,
      name:  data.customerName,
      email: data.customerEmail,
      phone: data.phone || '',
      address: data.address || ''
    });

    const frequency   = data.frequency || 'weekly';
    const prefDay     = data.preferredDay || '';
    const priceMap    = { weekly: 160, biweekly: 200, monthly: 250 };
    const price       = parseFloat(data.price || priceMap[frequency] || 160);
    const freqLabel   = frequency === 'biweekly' ? 'Biweekly' : (frequency === 'monthly' ? 'Monthly' : 'Weekly');
    const description = freqLabel + ' pool cleaning \u2014 $' + price + ' per visit';
    const notes       = 'Frequency: ' + freqLabel + ' | Price: $' + price + (prefDay ? ' | Preferred day: ' + prefDay : '') + ' | Manually enrolled by admin';
    const now         = new Date().toISOString();
    const apptId      = 'WS-' + Date.now();

    const sheet = getOrCreateSheet(APPOINTMENTS_SHEET, getAppointmentsHeaders());
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const colPrefDay = headers.indexOf('PreferredServiceDay');

    // Build row aligned to the appointments headers
    const row = new Array(headers.length).fill('');
    const set = (col, val) => { const idx = headers.indexOf(col); if (idx >= 0) row[idx] = val; };
    set('ID',                           apptId);
    set('AppointmentID',                apptId);
    set('CompanyID',                    companyId);
    set('CustomerID',                   '');
    set('CustomerName',                 data.customerName);
    set('CustomerEmail',                data.customerEmail);
    set('CustomerPhone',                data.phone || '');
    set('Address',                      data.address || '');
    set('ServiceType',                  'Pool Service');
    set('AppointmentType',              'Regular');
    set('Date',                         '');
    set('Time',                         '');
    set('Duration',                     60);
    set('Description',                  description);
    set('AssignedTo',                   data.assignedTo || '');
    set('Status',                       'Active');
    set('EstimatedCost',                price);
    set('AmountPaid',                   0);
    set('Notes',                        notes);
    set('Recurring',                    frequency);
    set('NotifyCustomer',               data.notifyCustomer ? 'Yes' : 'No');
    set('NotificationSent',             'No');
    set('ReviewSent',                   'No');
    set('CreatedAt',                    now);
    set('UpdatedAt',                    now);
    set('OpeningScheduleRequestStatus', 'Approved');
    if (colPrefDay >= 0) row[colPrefDay] = prefDay;

    sheet.appendRow(row);
    appendChemicalUsageLogs_(params, historyId, row[0]);
    SpreadsheetApp.flush();

    // Optional welcome email
    if (data.notifyCustomer && data.customerEmail) {
      try {
        sendWeeklyServiceApprovedEmail(data.customerEmail, data.customerName, prefDay);
      } catch (emailErr) {
        Logger.log('manuallyAddWeeklyService email err: ' + emailErr.toString());
      }
    }

    // Send Telegram notification to Brooks about the new customer enrollment
    try {
      const telegramMsg = '<b>✅ New ' + freqLabel + ' Service Customer Enrolled</b>\n\n'
        + '<b>Customer:</b> ' + escapeTelegramHtml_(data.customerName) + '\n'
        + '<b>Email:</b> ' + escapeTelegramHtml_(data.customerEmail) + '\n'
        + (data.phone ? '<b>Phone:</b> ' + escapeTelegramHtml_(data.phone) + '\n' : '')
        + '<b>Frequency:</b> ' + freqLabel + '\n'
        + '<b>Price per Visit:</b> $' + price + '\n'
        + (data.address ? '<b>Address:</b> ' + escapeTelegramHtml_(data.address) : '')
        + '\n\n<i>All chemicals are charged separately. Customer will receive invoices for chemicals and extra items.</i>';
      
      sendTelegramBotMessage_(telegramMsg, []);
    } catch (telegramErr) {
      Logger.log('manuallyAddWeeklyService telegram err: ' + telegramErr.toString());
    }

    Logger.log('\u2705 Manually added weekly service customer: ' + data.customerName + ' (' + apptId + ')');
    return { success: true, appointmentId: apptId, message: data.customerName + ' enrolled in ' + freqLabel + ' service.' };
  } catch (error) {
    Logger.log('\u274C manuallyAddWeeklyService error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

function createManualCardOnFileLink(params) {
  try {
    const companyId = String(params.companyId || DEFAULT_COMPANY_ID).trim();
    const customerName = String(params.customerName || '').trim();
    const customerEmail = String(params.customerEmail || '').toLowerCase().trim();
    const customerPhone = String(params.customerPhone || '').trim();
    const successUrl = String(params.successUrl || '').trim() || `${WEBAPP_BASE_URL}?autopay=success`;
    const cancelUrl = String(params.cancelUrl || '').trim() || `${WEBAPP_BASE_URL}?autopay=cancel`;

    if (!customerEmail) {
      return { success: false, error: 'customerEmail is required' };
    }

    const customerResult = createOrGetStripeCustomerForScheduling_({
      companyId: companyId,
      customerName: customerName || customerEmail,
      customerEmail: customerEmail,
      customerPhone: customerPhone,
      source: 'manual-card-on-file'
    });
    if (!customerResult.success || !customerResult.stripeCustomerId) {
      return { success: false, error: customerResult.error || 'Failed to create Stripe customer' };
    }

    const sessionPayload = {
      mode: 'setup',
      customer: customerResult.stripeCustomerId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        source: 'manual-card-on-file',
        company_id: companyId,
        customer_email: customerEmail
      },
      payment_method_types: ['card']
    };

    const sessionResp = stripeRequest_('post', '/v1/checkout/sessions', sessionPayload);
    if (!sessionResp.success || !sessionResp.body) {
      return { success: false, error: sessionResp.error || 'Failed to create Stripe setup session' };
    }

    return {
      success: true,
      stripeCustomerId: customerResult.stripeCustomerId,
      checkoutSessionId: sessionResp.body.id,
      url: sessionResp.body.url || '',
      message: 'Use returned URL to add card on file'
    };
  } catch (err) {
    Logger.log('❌ createManualCardOnFileLink error: ' + err.toString());
    return { success: false, error: err.toString() };
  }
}

/**
 * Save appointment schedule with blocked dates (vacation, holidays, time off)
 * Creates specific appointment dates, skipping blocked periods
 */
function saveAppointmentSchedule(data) {
  try {
    if (!data.customerId) {
      return { success: false, error: 'Customer ID is required' };
    }
    
    const frequency = data.frequency || 'weekly';
    const blockedDates = data.blockedDates || [];
    const customerName = data.customerName || 'Customer';
    
    // Get the appointment to update with blocked dates info
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(APPOINTMENTS_SHEET);
    if (!sheet) {
      return { success: false, error: 'Appointments sheet not found' };
    }
    
    const values = sheet.getDataRange().getValues();
    const headers = values[0] || [];
    const colNotes = headers.indexOf('Notes');
    const colStatus = headers.indexOf('Status');
    
    // Find the appointment row and update notes with blocked dates
    let appointmentFound = false;
    let appointmentsCreated = 0;
    
    for (let i = 1; i < values.length; i++) {
      // Match by customer name or ID
      if (String(values[i][3] || '').toLowerCase().includes(customerName.toLowerCase()) || 
          String(values[i][0] || '') === String(data.customerId).trim()) {
        appointmentFound = true;
        
        if (colNotes >= 0 && blockedDates.length > 0) {
          const existingNotes = String(values[i][colNotes] || '');
          const blockedNotesStr = 'Blocked dates: ' + blockedDates.join(', ');
          const updatedNotes = existingNotes.indexOf('Blocked dates:') >= 0 
            ? existingNotes.replace(/Blocked dates:.*/, blockedNotesStr)
            : (existingNotes ? existingNotes + ' | ' + blockedNotesStr : blockedNotesStr);
          
          sheet.getRange(i + 1, colNotes + 1).setValue(updatedNotes);
        }
        
        appointmentsCreated = frequency === 'weekly' ? 26 : frequency === 'biweekly' ? 13 : 6;
        break;
      }
    }
    
    if (!appointmentFound) {
      Logger.log('⚠️ Appointment not found for customer: ' + customerName);
    }
    
    Logger.log('✅ Appointment schedule saved for ' + customerName + ' with ' + blockedDates.length + ' blocked dates');
    return { 
      success: true, 
      message: 'Schedule saved!',
      appointmentsCreated: appointmentsCreated
    };
  } catch (error) {
    Logger.log('❌ saveAppointmentSchedule error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Get all unavailable date blocks for a company
 */
function getUnavailableBlocks(companyId) {
  try {
    if (!companyId) return [];
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(BLOCKED_DATES_SHEET);
    
    if (!sheet) {
      // Create sheet if it doesn't exist
      const newSheet = ss.insertSheet(BLOCKED_DATES_SHEET);
      newSheet.clearContents();
      newSheet.appendRow(['CompanyId', 'BlockId', 'Type', 'StartDate', 'EndDate', 'Notes', 'CreatedAt']);
      newSheet.getRange(1, 1, 1, 7).setFontWeight('bold');
      newSheet.setFrozenRows(1);
      return [];
    }
    
    // Verify and fix headers if needed
    const firstRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (String(firstRow[0]).trim() !== 'CompanyId') {
      // Headers are messed up - rebuild the sheet
      const allData = sheet.getDataRange().getValues();
      sheet.clearContents();
      sheet.appendRow(['CompanyId', 'BlockId', 'Type', 'StartDate', 'EndDate', 'Notes', 'CreatedAt']);
      sheet.getRange(1, 1, 1, 7).setFontWeight('bold');
      sheet.setFrozenRows(1);
      // Put back any valid data rows that match the pattern
      for (let i = 1; i < allData.length; i++) {
        if (allData[i][0] && String(allData[i][0]).includes('CMP-')) {
          sheet.appendRow([
            allData[i][0],
            allData[i][1] || '',
            allData[i][2] || '',
            allData[i][3] || '',
            allData[i][4] || '',
            allData[i][5] || '',
            allData[i][6] || ''
          ]);
        }
      }
    }
    
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return [];
    
    const headers = values[0];
    const companyIdCol = headers.indexOf('CompanyId');
    const blockIdCol = headers.indexOf('BlockId');
    const typeCol = headers.indexOf('Type');
    const startDateCol = headers.indexOf('StartDate');
    const endDateCol = headers.indexOf('EndDate');
    const notesCol = headers.indexOf('Notes');
    const createdAtCol = headers.indexOf('CreatedAt');
    
    if (companyIdCol === -1) return [];
    
    const blocks = [];
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][companyIdCol]).trim() === String(companyId).trim()) {
        const startVal = values[i][startDateCol];
        const endVal = values[i][endDateCol];
        
        // Handle both Date objects and strings - format as YYYY-MM-DD
        const formatDateValue = function(val) {
          if (!val) return '';
          if (val instanceof Date) {
            const year = val.getFullYear();
            const month = String(val.getMonth() + 1).padStart(2, '0');
            const day = String(val.getDate()).padStart(2, '0');
            return year + '-' + month + '-' + day;
          }
          return String(val).trim();
        };
        
        blocks.push({
          id: values[i][blockIdCol] || 'block_' + i,
          type: values[i][typeCol] || 'other',
          startDate: formatDateValue(startVal),
          endDate: formatDateValue(endVal),
          notes: values[i][notesCol] || '',
          createdAt: values[i][createdAtCol] || new Date().toISOString()
        });
      }
    }
    
    Logger.log('📋 Loaded ' + blocks.length + ' unavailable blocks for company: ' + companyId);
    return blocks;
  } catch (error) {
    Logger.log('❌ getUnavailableBlocks error: ' + error.toString());
    return [];
  }
}

/**
 * Save unavailable date blocks for a company (to sheet)
 */
function saveUnavailableBlocks(companyId, blocks) {
  try {
    if (!companyId || !blocks || !Array.isArray(blocks)) {
      return { success: false, error: 'Company ID and blocks array are required' };
    }
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(BLOCKED_DATES_SHEET);
    
    // Create sheet if it doesn't exist
    if (!sheet) {
      sheet = ss.insertSheet(BLOCKED_DATES_SHEET);
      sheet.clearContents();
      sheet.appendRow(['CompanyId', 'BlockId', 'Type', 'StartDate', 'EndDate', 'Notes', 'CreatedAt']);
      sheet.getRange(1, 1, 1, 7).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const companyIdCol = headers.indexOf('CompanyId');
    
    // Ensure headers exist and are correct
    if (companyIdCol === -1 || String(headers[0]).trim() !== 'CompanyId') {
      sheet.clearContents();
      sheet.appendRow(['CompanyId', 'BlockId', 'Type', 'StartDate', 'EndDate', 'Notes', 'CreatedAt']);
      sheet.getRange(1, 1, 1, 7).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    
    // Filter out existing blocks for this company, keep other companies' blocks
    const otherCompanyRows = [headers]; // Start with header
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][companyIdCol] || '').trim() !== String(companyId).trim()) {
        otherCompanyRows.push(values[i]);
      }
    }
    
    // Build new rows for this company
    const newCompanyRows = [];
    blocks.forEach(function(block) {
      // Ensure dates are in YYYY-MM-DD format
      const formatDate = function(val) {
        if (!val) return '';
        if (val instanceof Date) {
          const year = val.getFullYear();
          const month = String(val.getMonth() + 1).padStart(2, '0');
          const day = String(val.getDate()).padStart(2, '0');
          return year + '-' + month + '-' + day;
        }
        return String(val).trim();
      };
      
      newCompanyRows.push([
        companyId,
        block.id || 'block_' + Date.now(),
        block.type || 'other',
        formatDate(block.startDate),
        formatDate(block.endDate),
        block.notes || '',
        block.createdAt || new Date().toISOString()
      ]);
    });
    
    // Combine: header + other companies + new blocks for this company
    const allRows = otherCompanyRows.concat(newCompanyRows);
    
    // Clear and rewrite entire sheet
    sheet.clearContents();
    if (allRows.length > 0) {
      sheet.getRange(1, 1, allRows.length, 7).setValues(allRows);
      sheet.getRange(1, 1, 1, 7).setFontWeight('bold');
    }
    
    Logger.log('✅ Saved ' + blocks.length + ' unavailable date blocks for company ' + companyId);
    return { 
      success: true, 
      message: blocks.length + ' date block' + (blocks.length !== 1 ? 's' : '') + ' saved'
    };
  } catch (error) {
    Logger.log('❌ saveUnavailableBlocks error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Check if a date is blocked (unavailable)
 */
function isDateBlocked(companyId, dateStr) {
  try {
    const blocks = getUnavailableBlocks(companyId);
    if (!blocks || !dateStr) return false;
    
    const checkDate = new Date(dateStr);
    
    for (let i = 0; i < blocks.length; i++) {
      const startDate = new Date(blocks[i].startDate);
      const endDate = new Date(blocks[i].endDate);
      
      if (checkDate >= startDate && checkDate <= endDate) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    Logger.log('❌ isDateBlocked error: ' + error.toString());
    return false;
  }
}

/**
 * Get blocked date ranges for a company (returns list with details)
 */
function getBlockedDateRanges(companyId) {
  try {
    const blocks = getUnavailableBlocks(companyId);
    if (!blocks) return [];
    
    const ranges = [];
    blocks.forEach(function(block) {
      const startDate = new Date(block.startDate);
      const endDate = new Date(block.endDate);
      const daysDiff = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
      
      ranges.push({
        startDate: block.startDate,
        endDate: block.endDate,
        type: block.type || 'other',
        notes: block.notes || '',
        dayCount: daysDiff
      });
    });
    
    return ranges;
  } catch (error) {
    Logger.log('❌ getBlockedDateRanges error: ' + error.toString());
    return [];
  }
}


/**
 * Approve a pending weekly service request (wrapper used by dashboard).
 */
function approveWeeklyServiceRequest(appointmentId, options) {
  return approveOpeningScheduleRequest(appointmentId, options);
}

/**
 * Reject a pending weekly service request (wrapper used by dashboard).
 */
function rejectWeeklyServiceRequest(appointmentId) {
  return rejectOpeningScheduleRequest(appointmentId);
}

// ============================================================================
// WEEKLY SERVICE CONTRACTS
// ============================================================================

/** Split a JSON string into 50 000-char chunks for spreadsheet storage (3 columns). */
function wsChunkJson_(jsonStr) {
  var sz = 50000;
  var c = [];
  for (var i = 0; i < jsonStr.length; i += sz) c.push(jsonStr.substring(i, i + sz));
  while (c.length < 3) c.push('');
  return c;
}

/** Ensure the Contracts sheet exists with the standard 14-column layout. */
function wsEnsureContractsSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(WS_CONTRACTS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(WS_CONTRACTS_SHEET);
    var hdrs = ['Contract ID','Project ID','Customer Email',
                'Contract JSON Part 1','Contract JSON Part 2','Contract JSON Part 3',
                'Status','Date Created','Date Sent','Date Signed',
                'PDF URL','Signed PDF URL','Company Signature','Customer Signature'];
    sh.getRange(1, 1, 1, hdrs.length).setValues([hdrs]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Build the human-readable body text for a weekly service contract. */
function wsBuildContractContent_(d, freq, pricePerVisit, visitsPerMonth, monthlyTotal) {
  var extraCostPerVisit = parseFloat(d.extraCostPerVisit || 0);
  var perVisitTotal = pricePerVisit + extraCostPerVisit;
  var lines = [];
  var dateStr = new Date().toLocaleDateString('en-US', {month:'long',day:'numeric',year:'numeric'});
  lines.push('This Pool Service Agreement ("Agreement") is entered into as of ' + dateStr + ', between A Quality Pool Company ("Service Provider") and ' + (d.customerName || 'Customer') + ' ("Customer").');
  lines.push('');
  lines.push('SERVICE ADDRESS: ' + (d.customerAddress || ''));
  lines.push('');
  lines.push('─────────────────────────────');
  lines.push('SERVICE DETAILS');
  lines.push('─────────────────────────────');
  var freqLabel = (freq === 'biweekly')
    ? 'Biweekly (every 2 weeks)'
    : (freq === 'monthly' ? 'Monthly' : 'Weekly');
  lines.push('Service Frequency:    ' + freqLabel);
  lines.push('Scheduled Service Day: ' + (d.serviceDay || 'TBD'));
  if (d.serviceTimeWindow) lines.push('Arrival Window:        ' + d.serviceTimeWindow);
  if (d.startDate) {
    try { lines.push('Service Start Date:    ' + new Date(d.startDate).toLocaleDateString('en-US', {month:'long',day:'numeric',year:'numeric'})); } catch(e) { lines.push('Service Start Date:    ' + d.startDate); }
  }
  lines.push('');
  lines.push('─────────────────────────────');
  lines.push('PRICING');
  lines.push('─────────────────────────────');
  lines.push('Base Price Per Visit:      $' + pricePerVisit.toFixed(2));
  if (extraCostPerVisit > 0) {
    lines.push('Extra Cost Per Visit:      $' + extraCostPerVisit.toFixed(2));
  }
  lines.push('Per Visit Total:           $' + perVisitTotal.toFixed(2));
  lines.push('Visits Per Month (approx): ' + visitsPerMonth);
  lines.push('Estimated Monthly Total:   $' + monthlyTotal.toFixed(2));
  lines.push('');
  lines.push('─────────────────────────────');
  lines.push('SCOPE OF SERVICE');
  lines.push('─────────────────────────────');
  lines.push('Each pool service visit will include:');
  lines.push('• Chemical testing and balancing (pH, chlorine, alkalinity, calcium hardness)');
  lines.push('• Skimming of surface debris');
  lines.push('• Brushing pool walls and steps');
  lines.push('• Vacuuming pool floor as needed');
  lines.push('• Emptying skimmer and pump baskets');
  lines.push('• Inspection of pool equipment and filtration system');
  lines.push('• Adding chemicals as needed to maintain proper water balance');
  if (d.specialNotes && String(d.specialNotes).trim()) {
    lines.push('');
    lines.push('─────────────────────────────');
    lines.push('SPECIAL NOTES / ADDITIONAL SERVICES');
    lines.push('─────────────────────────────');
    lines.push(d.specialNotes);
  }
  return lines.join('\n');
}

/** Default terms and conditions for weekly service contracts. */
function wsBuildDefaultTerms_() {
  return [
    '1. PAYMENT TERMS. Payment for services is due within 15 days of invoice date. A 1.5% monthly finance charge may be applied to past-due balances.',
    '',
    '2. CANCELLATION. Either party may cancel this agreement with 30 days written notice. Customer remains responsible for payment of services rendered prior to cancellation.',
    '',
    '3. ACCESS. Customer agrees to provide safe and reasonable access to the pool area on all scheduled service days.',
    '',
    '4. CHEMICALS. The Service Provider may purchase and apply chemicals as needed. Any chemical costs beyond routine maintenance will be itemized on the invoice.',
    '',
    '5. WEATHER. Service visits may be rescheduled due to severe weather conditions at no additional charge to the Customer.',
    '',
    '6. LIABILITY. The Service Provider shall not be liable for pre-existing equipment failures or damage caused by conditions beyond the technician\'s control. Customer is responsible for maintaining adequate water levels.',
    '',
    '7. SCHEDULE CHANGES. Changes to the service schedule must be communicated at least 48 hours in advance.',
    '',
    '8. GOVERNING LAW. This Agreement shall be governed by the laws of the state in which services are rendered.'
  ].join('\n');
}

/**
 * Create a new weekly service contract (Draft status).
 * data: { customerName, customerEmail, customerPhone, customerAddress,
 *         companyId, frequency, serviceDay, serviceTimeWindow, pricePerVisit,
 *         startDate, specialNotes, customTerms, contractTitle }
 */
function createWeeklyServiceContract(data) {
  try {
    wsEnsureContractsSheet_();
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sh = ss.getSheetByName(WS_CONTRACTS_SHEET);

    var contractId   = 'CONTRACT-' + new Date().getTime();
    var freq           = String(data.frequency || 'weekly').toLowerCase();
    var pricePerVisit  = parseFloat(data.pricePerVisit || 0);
    var extraCostPerVisit = parseFloat(data.extraCostPerVisit || 0);
    var visitsPerMonth = (freq === 'biweekly') ? 2 : ((freq === 'monthly') ? 1 : 4);
    var perVisitTotal  = pricePerVisit + extraCostPerVisit;
    var monthlyTotal   = perVisitTotal * visitsPerMonth;

    var contractObj = {
      contractId:       contractId,
      contractType:     'WeeklyService',
      companyId:        data.companyId        || DEFAULT_COMPANY_ID,
      projectId:        data.projectId        || '',
      customerName:     data.customerName     || '',
      customerEmail:    data.customerEmail    || '',
      customerPhone:    data.customerPhone    || '',
      customerAddress:  data.customerAddress  || '',
      contractTitle:    data.contractTitle    || 'Weekly Pool Service Agreement',
      contractContent:  wsBuildContractContent_(data, freq, pricePerVisit, visitsPerMonth, monthlyTotal),
      terms:            data.customTerms      || wsBuildDefaultTerms_(),
      totalAmount:      monthlyTotal,
      frequency:        freq,
      serviceDay:       data.serviceDay       || '',
      serviceTimeWindow: data.serviceTimeWindow || '',
      pricePerVisit:    pricePerVisit,
      extraCostPerVisit: extraCostPerVisit,
      perVisitTotal:    perVisitTotal,
      startDate:        data.startDate        || '',
      specialNotes:     data.specialNotes     || '',
      companySignature: WS_CONTRACT_AUTO_SIGNER_NAME,
      customerSignature: ''
    };

    var jsonStr = JSON.stringify(contractObj);
    var chunks  = wsChunkJson_(jsonStr);

    sh.appendRow([
      contractId, data.projectId || '', data.customerEmail || '',
      chunks[0], chunks[1], chunks[2],
      'Draft', new Date(), '', '', '', '', '', ''
    ]);

    Logger.log('✅ Weekly service contract created: ' + contractId + ' (auto-signed by company)');

    // Auto-schedule recurring appointments if a start date is provided
    var appointmentsCreated = 0;
    if (contractObj.startDate) {
      try {
        var recurringData = {
          date:          contractObj.startDate,
          recurring:     freq === 'weekly' ? 'weekly' : freq === 'biweekly' ? 'biweekly' : 'monthly',
          companyId:     contractObj.companyId,
          customerId:    contractObj.projectId || '',
          customerName:  contractObj.customerName,
          customerEmail: contractObj.customerEmail,
          customerPhone: contractObj.customerPhone,
          address:       contractObj.customerAddress,
          serviceType:   'Pool Service',
          appointmentType: 'Weekly Pool Service',
          time:          contractObj.serviceTimeWindow || '',
          duration:      60,
          description:   contractObj.contractTitle + (contractObj.specialNotes ? '\n\nNotes: ' + contractObj.specialNotes : ''),
          estimatedCost: contractObj.pricePerVisit,
          linkedProjectId: contractObj.projectId || '',
          addToCalendar: true
        };
        createRecurringAppointments(recurringData);
        // Count is determined inside createRecurringAppointments based on frequency
        appointmentsCreated = freq === 'weekly' ? 26 : freq === 'biweekly' ? 13 : 6;
        Logger.log('✅ Recurring appointments scheduled for contract ' + contractId + ' starting ' + contractObj.startDate);
      } catch (schedErr) {
        Logger.log('⚠️ Could not auto-schedule recurring appointments: ' + schedErr.toString());
      }
    }

    return { success: true, contractId: contractId, contract: contractObj, appointmentsScheduled: appointmentsCreated };
  } catch (err) {
    Logger.log('❌ createWeeklyServiceContract error: ' + err.toString());
    return { success: false, error: err.toString() };
  }
}

/** Public wrapper for getWeeklyServiceContract_ */
function getWeeklyServiceContract(contractId) {
  return getWeeklyServiceContract_(contractId);
}

/** Retrieve a single weekly service contract by contractId. */
function getWeeklyServiceContract_(contractId) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sh = ss.getSheetByName(WS_CONTRACTS_SHEET);
    if (!sh) return { success: false, error: 'Contracts sheet not found' };
    var rows = sh.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0] || '').trim() !== String(contractId).trim()) continue;
      var jsonStr = (rows[i][3] || '') + (rows[i][4] || '') + (rows[i][5] || '');
      if (!jsonStr) continue;
      var contract = JSON.parse(jsonStr);
      contract.status       = rows[i][6]  || 'Draft';
      contract.dateCreated  = rows[i][7]  ? new Date(rows[i][7]).toISOString()  : null;
      contract.dateSent     = rows[i][8]  ? new Date(rows[i][8]).toISOString()  : null;
      contract.dateSigned   = rows[i][9]  ? new Date(rows[i][9]).toISOString()  : null;
      contract.pdfUrl       = rows[i][10] || '';
      contract.signedPdfUrl = rows[i][11] || '';
      contract.companySignature  = rows[i][12] || '';
      contract.customerSignature = rows[i][13] || '';
      return { success: true, data: contract };
    }
    return { success: false, error: 'Contract not found' };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/**
 * Get Stripe payment link for a weekly service contract (regenerate if needed)
 */
function getWeeklyContractStripeLink(contractId) {
  try {
    var cr = getWeeklyServiceContract_(contractId);
    if (!cr.success) {
      Logger.log('❌ Contract not found: ' + contractId);
      return { success: false, error: 'Contract not found' };
    }
    var contract = cr.data;
    
    var combinedPerVisit = parseFloat(contract.perVisitTotal || (parseFloat(contract.pricePerVisit || 0) + parseFloat(contract.extraCostPerVisit || 0)));
    Logger.log('📋 Contract loaded for ' + contractId + ': email=' + contract.customerEmail + ', perVisitTotal=' + combinedPerVisit);
    
    if (!contract.customerEmail || combinedPerVisit <= 0) {
      Logger.log('❌ Missing fields - email: ' + contract.customerEmail + ', perVisitTotal: ' + combinedPerVisit);
      return { success: false, error: 'Contract missing required fields for Stripe' };
    }
    
    // Generate fresh Stripe link
    var freq = contract.frequency === 'biweekly' ? 'biweekly' : (contract.frequency === 'monthly' ? 'monthly' : 'weekly');
    var stripeLink = createStripePaymentLink_(contract.customerEmail, contract.customerName, combinedPerVisit, freq);
    
    if (!stripeLink) {
      Logger.log('❌ Stripe link generation failed for ' + contractId);
      return { success: false, error: 'Failed to generate Stripe link' };
    }
    
    Logger.log('✅ Generated Stripe link for contract ' + contractId + ': ' + stripeLink);
    return { success: true, stripeLink: stripeLink };
  } catch (err) {
    Logger.log('❌ getWeeklyContractStripeLink error: ' + err.toString());
    return { success: false, error: err.toString() };
  }
}

/**
 * List weekly service contracts, optionally filtered by customerEmail.
 * companyId filter is optional; pass null / '' to skip.
 */
/**
 * Public wrapper for listWeeklyServiceContracts_ (for google.script.run)
 */
function listWeeklyServiceContracts(companyId, customerEmail) {
  return listWeeklyServiceContracts_(companyId, customerEmail);
}

function listWeeklyServiceContracts_(companyId, customerEmail) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sh = ss.getSheetByName(WS_CONTRACTS_SHEET);
    if (!sh) return { success: true, contracts: [] };
    var rows    = sh.getDataRange().getValues();
    var results = [];
    var emailFilter = customerEmail ? String(customerEmail).toLowerCase().trim() : '';
    for (var i = 1; i < rows.length; i++) {
      var contractId = String(rows[i][0] || '').trim();
      if (!contractId) continue;
      var rowEmail = String(rows[i][2] || '').toLowerCase().trim();
      if (emailFilter && rowEmail !== emailFilter) continue;
      var jsonStr = (rows[i][3] || '') + (rows[i][4] || '') + (rows[i][5] || '');
      if (!jsonStr) continue;
      try {
        var c = JSON.parse(jsonStr);
        if (c.contractType !== 'WeeklyService') continue;
        if (companyId && c.companyId && c.companyId !== companyId) continue;
        results.push({
          contractId:        contractId,
          customerName:      c.customerName      || '',
          customerEmail:     c.customerEmail     || '',
          customerAddress:   c.customerAddress   || '',
          contractTitle:     c.contractTitle     || 'Weekly Pool Service Agreement',
          frequency:         c.frequency         || 'weekly',
          serviceDay:        c.serviceDay        || '',
          serviceTimeWindow: c.serviceTimeWindow || '',
          pricePerVisit:     c.pricePerVisit     || 0,
          extraCostPerVisit: c.extraCostPerVisit || 0,
          perVisitTotal:     c.perVisitTotal || (parseFloat(c.pricePerVisit || 0) + parseFloat(c.extraCostPerVisit || 0)),
          startDate:         c.startDate         || '',
          specialNotes:      c.specialNotes      || '',
          customTerms:       c.terms             || '',
          status:            rows[i][6]  || 'Draft',
          dateCreated:       rows[i][7]  ? new Date(rows[i][7]).toISOString()  : null,
          dateSent:          rows[i][8]  ? new Date(rows[i][8]).toISOString()  : null,
          dateSigned:        rows[i][9]  ? new Date(rows[i][9]).toISOString()  : null,
          pdfUrl:            rows[i][10] || '',
          signedPdfUrl:      rows[i][11] || ''
        });
      } catch (parseErr) {
        Logger.log('⚠️ Could not parse contract row ' + (i+1) + ': ' + parseErr.toString());
      }
    }
    return { success: true, contracts: results };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/** Update editable fields on a Draft or Sent contract. Signed contracts are locked. */
function updateWeeklyServiceContract(contractId, data) {
  try {
    var cr = getWeeklyServiceContract_(contractId);
    if (!cr.success) return { success: false, error: cr.error };
    var contract = cr.data;
    if (contract.status === 'Signed') return { success: false, error: 'Signed contracts cannot be edited.' };

    var editableFields = ['contractTitle','customerName','customerEmail','customerPhone',
                          'customerAddress','frequency','serviceDay','serviceTimeWindow',
                          'pricePerVisit','extraCostPerVisit','startDate','specialNotes','terms','contractContent'];
    editableFields.forEach(function(f) { if (data[f] !== undefined) contract[f] = data[f]; });

    // Recalculate monthly total
    var price      = parseFloat(contract.pricePerVisit || 0);
    var extraCost  = parseFloat(contract.extraCostPerVisit || 0);
    var perVisit   = price + extraCost;
    var visits     = (contract.frequency === 'biweekly') ? 2 : ((contract.frequency === 'monthly') ? 1 : 4);
    contract.perVisitTotal = perVisit;
    contract.totalAmount = perVisit * visits;

    var ss  = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sh  = ss.getSheetByName(WS_CONTRACTS_SHEET);
    if (!sh) return { success: false, error: 'Contracts sheet not found' };
    var rows = sh.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0] || '').trim() !== String(contractId).trim()) continue;
      var chunks = wsChunkJson_(JSON.stringify(contract));
      sh.getRange(i+1, 4).setValue(chunks[0]);
      sh.getRange(i+1, 5).setValue(chunks[1]);
      sh.getRange(i+1, 6).setValue(chunks[2]);
      return { success: true, contractId: contractId };
    }
    return { success: false, error: 'Contract not found in sheet' };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/** Delete a weekly service contract (Draft or Sent only). */
function deleteWeeklyServiceContract(contractId) {
  return deleteWeeklyServiceContract_(contractId);
}

function deleteWeeklyServiceContract_(contractId) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sh = ss.getSheetByName(WS_CONTRACTS_SHEET);
    if (!sh) return { success: false, error: 'Contracts sheet not found' };
    var rows = sh.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0] || '').trim() !== String(contractId).trim()) continue;
      var jsonStr = (rows[i][3] || '') + (rows[i][4] || '') + (rows[i][5] || '');
      var cType = '';
      try { cType = JSON.parse(jsonStr).contractType || ''; } catch(e) {}
      if (cType !== 'WeeklyService') return { success: false, error: 'Not a weekly service contract.' };
      var status = String(rows[i][6] || '').trim();
      if (status === 'Signed') return { success: false, error: 'Signed contracts cannot be deleted.' };
      sh.deleteRow(i + 1);
      return { success: true };
    }
    return { success: false, error: 'Contract not found' };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/** Generate a PDF for a weekly service contract and store its Drive URL. */
function generateWeeklyContractPDF_(contractId) {
  try {
    var cr = getWeeklyServiceContract_(contractId);
    if (!cr.success) return { success: false, error: 'Contract not found' };
    var contract = cr.data;

    var folder = DriveApp.getFolderById(WS_CONTRACT_DRIVE_FOLDER_ID);

    // Create a temp Google Doc, build the content, export as PDF
    var tempDoc  = DocumentApp.create('WSContract_' + contractId + '_' + new Date().getTime());
    var tempFile = DriveApp.getFileById(tempDoc.getId());
    var parents  = tempFile.getParents();
    if (parents.hasNext()) { var p = parents.next(); p.removeFile(tempFile); folder.addFile(tempFile); }

    var body = tempDoc.getBody();
    body.clear();
    try { body.setMarginTop(36); body.setMarginBottom(36); body.setMarginLeft(54); body.setMarginRight(54); } catch(e) {}

    // Letterhead logo
    try {
      var imgResp = UrlFetchApp.fetch(WS_CONTRACT_LETTERHEAD_LOGO_URL);
      if (imgResp.getResponseCode() === 200) {
        var logoBlob = imgResp.getBlob();
        var logoImg  = body.appendImage(logoBlob);
        var origW = logoImg.getWidth(), origH = logoImg.getHeight();
        logoImg.setWidth(160);
        if (origW > 0) logoImg.setHeight(Math.round(origH * 160 / origW));
        try { logoImg.getParent().setAlignment(DocumentApp.HorizontalAlignment.CENTER); } catch(e) {}
      }
    } catch(e) { Logger.log('Logo skip: ' + e.toString()); }

    // Helper to append a styled paragraph
    var ap = function(text, o) {
      var pg = body.appendParagraph(text || '');
      o = o || {};
      if (o.align) pg.setAlignment(o.align);
      if (o.spaceBefore) pg.setSpacingBefore(o.spaceBefore);
      if (o.spaceAfter)  pg.setSpacingAfter(o.spaceAfter);
      if (o.lineSpacing)  pg.setLineSpacing(o.lineSpacing);
      try {
        var t = pg.editAsText();
        if (o.fontSize) t.setFontSize(o.fontSize);
        if (o.bold  !== undefined) t.setBold(o.bold);
        if (o.italic !== undefined) t.setItalic(o.italic);
        if (o.color) t.setForegroundColor(o.color);
      } catch(e) {}
      return pg;
    };

    // ---- Header ----
    ap('A Quality Pool Company',         { align: DocumentApp.HorizontalAlignment.CENTER, fontSize: 18, bold: true,  color: '#0369a1', spaceAfter: 2 });
    ap('Professional Pool Construction & Service', { align: DocumentApp.HorizontalAlignment.CENTER, fontSize: 10, color: '#64748b', spaceAfter: 2 });
    ap('(502) 731-9217  |  samr@aqualitypoolcompanyusa.com  |  aqualitypoolcompanyusa.com', { align: DocumentApp.HorizontalAlignment.CENTER, fontSize: 9, color: '#475569', spaceAfter: 4 });
    body.appendHorizontalRule();
    ap(contract.contractTitle || 'Weekly Pool Service Agreement', { align: DocumentApp.HorizontalAlignment.CENTER, fontSize: 20, bold: true, color: '#0f172a', spaceBefore: 6, spaceAfter: 4 });
    body.appendHorizontalRule();

    // ---- Meta ----
    var meta = function(label, value) { ap(label + ':   ' + (value || '—'), { fontSize: 10, color: '#1e293b', spaceBefore: 2, spaceAfter: 2 }); };
    ap('', { spaceAfter: 4 });
    meta('Contract ID', contractId);
    meta('Customer',    contract.customerName);
    if (contract.customerAddress) meta('Address', contract.customerAddress);
    if (contract.customerEmail)   meta('Email',   contract.customerEmail);
    if (contract.customerPhone)   meta('Phone',   contract.customerPhone);
    meta('Date Created', contract.dateCreated ? new Date(contract.dateCreated).toLocaleDateString('en-US', {year:'numeric',month:'long',day:'numeric'}) : '—');
    ap('', { spaceAfter: 4 });
    body.appendHorizontalRule();

    // ---- Service Details ----
    ap('SERVICE DETAILS', { fontSize: 10, bold: true, color: '#0369a1', spaceBefore: 6, spaceAfter: 4 });
    var freqLabelPdf = contract.frequency === 'biweekly'
      ? 'Biweekly (every 2 weeks)'
      : (contract.frequency === 'monthly' ? 'Monthly' : 'Weekly');
    meta('Frequency',    freqLabelPdf);
    if (contract.serviceDay)        meta('Service Day',   contract.serviceDay);
    if (contract.serviceTimeWindow) meta('Arrival Window', contract.serviceTimeWindow);
    if (contract.startDate) {
      try { meta('Start Date', new Date(contract.startDate).toLocaleDateString('en-US', {year:'numeric',month:'long',day:'numeric'})); } catch(e) { meta('Start Date', contract.startDate); }
    }
    var basePricePdf = parseFloat(contract.pricePerVisit || 0);
    var extraPricePdf = parseFloat(contract.extraCostPerVisit || 0);
    var perVisitPdf = parseFloat(contract.perVisitTotal || (basePricePdf + extraPricePdf));
    var monthlyVisitsPdf = contract.frequency === 'biweekly' ? 2 : (contract.frequency === 'monthly' ? 1 : 4);
    meta('Price Per Visit',    '$' + perVisitPdf.toFixed(2));
    if (extraPricePdf > 0) {
      meta('Includes Extra Fee', '$' + extraPricePdf.toFixed(2));
    }
    meta('Est. Monthly Total', '$' + (perVisitPdf * monthlyVisitsPdf).toFixed(2));
    ap('', { spaceAfter: 4 });
    body.appendHorizontalRule();

    // ---- Agreement body ----
    ap('AGREEMENT', { fontSize: 10, bold: true, color: '#64748b', spaceBefore: 6, spaceAfter: 6 });
    String(contract.contractContent || '').trim().split('\n').forEach(function(line) {
      ap(line, { fontSize: 10.5, color: '#1e293b', spaceAfter: 4, lineSpacing: 1.4 });
    });

    // ---- Terms ----
    if (contract.terms && String(contract.terms).trim()) {
      ap('', { spaceAfter: 4 });
      body.appendHorizontalRule();
      ap('TERMS AND CONDITIONS', { fontSize: 10, bold: true, color: '#64748b', spaceBefore: 6, spaceAfter: 6 });
      String(contract.terms).trim().split('\n').forEach(function(line) {
        ap(line, { fontSize: 10, color: '#374151', spaceAfter: 3, lineSpacing: 1.35 });
      });
    }

    // ---- Signature lines ----
    ap('', { spaceAfter: 4 });
    body.appendHorizontalRule();
    ap('SIGNATURES', { fontSize: 10, bold: true, color: '#64748b', spaceBefore: 6, spaceAfter: 4 });
    ap('By signing below, both parties agree to all terms and conditions set forth in this agreement.', { fontSize: 9.5, italic: true, color: '#64748b', spaceAfter: 12 });
    ap('COMPANY REPRESENTATIVE — A QUALITY POOL COMPANY', { fontSize: 9, bold: true, color: '#0369a1', spaceAfter: 6 });
    ap(WS_CONTRACT_AUTO_SIGNER_NAME,  { fontSize: 12, bold: true,  color: '#0f172a', spaceAfter: 2 });
    ap(WS_CONTRACT_AUTO_SIGNER_TITLE, { fontSize: 9,               color: '#475569', spaceAfter: 18 });
    body.appendHorizontalRule();
    ap('CUSTOMER — ' + (contract.customerName || 'CUSTOMER').toUpperCase(), { fontSize: 9, bold: true, color: '#0369a1', spaceAfter: 6 });
    ap('X  _______________________________', { fontSize: 11, color: '#374151', spaceAfter: 4 });
    ap('Signature', { fontSize: 9, color: '#9ca3af', spaceAfter: 6 });
    ap('Print Name:  ____________________     Date:  ____________', { fontSize: 10, color: '#374151', spaceAfter: 4 });

    tempDoc.saveAndClose();
    Utilities.sleep(1500);

    var pdfBlob = tempFile.getAs(MimeType.PDF);
    pdfBlob.setName('WeeklyServiceContract_' + contractId + '.pdf');
    var pdfFile = folder.createFile(pdfBlob);
    pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    tempFile.setTrashed(true);

    // Save PDF URL back to sheet
    var ss2 = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sh2 = ss2.getSheetByName(WS_CONTRACTS_SHEET);
    if (sh2) {
      var rd = sh2.getDataRange().getValues();
      for (var ri = 1; ri < rd.length; ri++) {
        if (String(rd[ri][0] || '').trim() === String(contractId).trim()) {
          sh2.getRange(ri + 1, 11).setValue(pdfFile.getUrl());
          break;
        }
      }
    }
    Logger.log('✅ Weekly contract PDF generated: ' + pdfFile.getUrl());
    return { success: true, pdfUrl: pdfFile.getUrl() };
  } catch (err) {
    Logger.log('❌ generateWeeklyContractPDF_ error: ' + err.toString());
    return { success: false, error: err.toString() };
  }
}

/** Generate a secure 90-day signing token for a weekly service contract. */
function generateWeeklyContractToken_(contractId, customerEmail) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sh = ss.getSheetByName(WS_CONTRACT_TOKENS_SHEET);
    if (!sh) {
      sh = ss.insertSheet(WS_CONTRACT_TOKENS_SHEET);
      sh.getRange(1, 1, 1, 7).setValues([['Token','Contract ID','Customer Email','Created','Expires','Used','Date Used']]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    var token = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      contractId + customerEmail + new Date().getTime() + 'CONTRACT_SECRET_2024'
    ).map(function(b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');

    var created = new Date();
    var expires = new Date(created.getTime() + 90 * 24 * 60 * 60 * 1000);
    sh.appendRow([token, contractId, customerEmail, created, expires, false, '']);

    var signingUrl = WS_CONTRACT_VIEWER_URL + '?id=' + encodeURIComponent(contractId) + '&token=' + encodeURIComponent(token);
    return { success: true, token: token, signingUrl: signingUrl, expiresDate: expires.toISOString() };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/** Send Telegram admin notification for a weekly contract (simple copyable text message). */
function sendWeeklyContractTelegram_(contractId, contract, signingUrl, pdfUrl, stripeLink) {
  try {
    Logger.log('📞 sendWeeklyContractTelegram_ called for: ' + contractId);

    var firstName = String(contract.customerName || '').split(' ')[0] || 'Customer';
    var freq      = (contract.frequency === 'biweekly')
      ? 'biweekly'
      : (contract.frequency === 'monthly' ? 'monthly' : 'weekly');
    var perVisitTotal = parseFloat(contract.perVisitTotal || (parseFloat(contract.pricePerVisit || 0) + parseFloat(contract.extraCostPerVisit || 0)));
    var customerPhone = String(contract.customerPhone || contract.phone || '').trim();
    var successMsg = '✅ Weekly service agreement setup complete. Agreement sent to customer + draft text posted to Telegram.';

    // Suggested copy for Brooks to text customer (only shown in draft button, not in Telegram message)
    var draftMsg = 'Hi ' + firstName + '! 👋\n\n'
      + 'Please see your ' + freq + ' pool service agreement and setup autopay details through this link:\n\n'
      + signingUrl + '\n\n'
      + 'Thank you for choosing A Quality Pool Company!';

    // Build simple Telegram message with contract facts only (no draft text in message)
    var telegramHtml = '<b>📨 Weekly Service Contract Sent</b>\n'
      + '<b>👤 ' + escapeTelegramHtml_(contract.customerName || '') + '</b>\n'
      + (customerPhone ? '<b>📱 Phone:</b> ' + escapeTelegramHtml_(customerPhone) + '\n' : '')
      + '<b>📅 Frequency:</b> ' + escapeTelegramHtml_(freq) + '\n'
      + '<b>💰 Amount:</b> $' + perVisitTotal.toFixed(2) + '\n'
      + '<b>Status:</b> Agreement sent to customer';

    var telegramButtons = [];
    var draftUrl = buildTelegramSmsRedirectUrl_(customerPhone, draftMsg, contract.customerName || firstName);
    if (draftUrl) telegramButtons.push({ text: '💬 Draft Welcome Text', url: draftUrl });
    if (signingUrl) telegramButtons.push({ text: '📝 Open Agreement', url: signingUrl });
    if (stripeLink) telegramButtons.push({ text: '💳 Open Stripe', url: stripeLink });
    if (pdfUrl) telegramButtons.push({ text: '📄 Open PDF', url: pdfUrl });

    Logger.log('📞 Sending weekly contract Telegram notification');
    var telegramResult = sendTelegramBotMessage_(telegramHtml, telegramButtons.length ? telegramButtons : null);
    if (telegramResult && telegramResult.success) {
      Logger.log('✅ Telegram message sent for contract: ' + contractId);
      return {
        success: true,
        message: successMsg,
        draftText: draftMsg
      };
    }

    Logger.log('⚠️ Telegram message failed for contract ' + contractId + ': ' + ((telegramResult && telegramResult.error) || 'Unknown error'));
    return {
      success: false,
      error: (telegramResult && telegramResult.error) || 'Unknown Telegram error'
    };
  } catch (err) {
    Logger.log('❌ sendWeeklyContractTelegram_ error: ' + err.toString());
    return { success: false, error: err.toString() };
  }
}

function sendWeeklyContractEmail_(contract, signingUrl, stripeLink) {
  try {
    if (!contract.customerEmail) {
      Logger.log('⚠️ sendWeeklyContractEmail_: No customer email provided');
      return false;
    }
    
    var firstName = String(contract.customerName || '').split(' ')[0] || 'there';
    var freq = (contract.frequency === 'biweekly')
      ? 'Biweekly'
      : (contract.frequency === 'monthly' ? 'Monthly' : 'Weekly');
    var basePrice = parseFloat(contract.pricePerVisit || 0);
    var extraCostPerVisit = parseFloat(contract.extraCostPerVisit || 0);
    var perVisitTotal = parseFloat(contract.perVisitTotal || (basePrice + extraCostPerVisit));
    var price = '$' + perVisitTotal.toFixed(2);
    var logoUrl = 'https://cdn.prod.website-files.com/6931dc4e8e97334e195432df/6993ce0abcd54d3520799318_IMG_1763.jpg';
    
    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<style>body{margin:0;padding:0;background:#f5f7fa;}table{border-collapse:collapse;}img{border:0;height:auto;line-height:100%;}</style>'
      + '</head><body style="background:#f5f7fa;margin:0;padding:0;">'
      + '<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f7fa;"><tr><td align="center" style="padding:40px 20px;">'
      + '<table border="0" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;">'
      // Header
      + '<tr><td align="center" style="background:linear-gradient(135deg,#0c4a6e 0%,#0369a1 100%);padding:36px 24px;text-align:center;">'
      + '<img src="' + logoUrl + '" alt="A Quality Pool Company" style="max-width:160px;height:auto;display:block;margin:0 auto 16px auto;border-radius:8px;">'
      + '<h1 style="color:#ffffff;margin:0 0 6px 0;font-size:26px;font-weight:800;line-height:1.2;">Service Agreement Ready!</h1>'
      + '<p style="color:#bae6fd;margin:0;font-size:14px;">Please review and sign your ' + freq + ' pool service contract</p>'
      + '</td></tr>'
      // Body
      + '<tr><td style="padding:36px 28px;">'
      + '<h2 style="font-size:18px;font-weight:700;color:#0f172a;margin:0 0 14px 0;">Hello ' + firstName + ',</h2>'
      + '<p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 24px 0;">Your ' + freq + ' pool service agreement is ready for your review and signature. Please take a moment to review the details below and sign the agreement.</p>'
      // Service Details
      + '<div style="background:#f0f9ff;border-left:4px solid #0284c7;border-radius:0 8px 8px 0;padding:20px 24px;margin:0 0 24px 0;">'
      + '<p style="margin:0 0 6px 0;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#0369a1;">Service Details</p>'
      + '<table border="0" cellpadding="0" cellspacing="0" width="100%">'
      + '<tr><td style="padding:7px 0;color:#64748b;font-size:14px;width:140px;">Service Frequency:</td><td style="padding:7px 0;font-weight:700;color:#0f172a;font-size:15px;">' + freq + '</td></tr>'
      + (contract.serviceDay ? '<tr><td style="padding:7px 0;color:#64748b;font-size:14px;">Service Day:</td><td style="padding:7px 0;font-weight:700;color:#0f172a;font-size:15px;">' + contract.serviceDay + '</td></tr>' : '')
      + '<tr><td style="padding:7px 0;color:#64748b;font-size:14px;">Price per Visit:</td><td style="padding:7px 0;font-weight:700;color:#0f172a;font-size:15px;">' + price + '</td></tr>'
      + (extraCostPerVisit > 0 ? '<tr><td style="padding:7px 0;color:#64748b;font-size:14px;">Includes Extra Fee:</td><td style="padding:7px 0;font-weight:700;color:#0f172a;font-size:15px;">$' + extraCostPerVisit.toFixed(2) + '</td></tr>' : '')
      + '</table></div>'
      // Action buttons
      + '<div style="margin:0 0 24px 0;display:flex;gap:12px;flex-direction:column;">'
      + '<a href="' + signingUrl + '" style="display:inline-block;background:#0284c7;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;text-align:center;font-size:15px;">📝 Review & Sign Agreement</a>'
      + (stripeLink ? '<a href="' + stripeLink + '" style="display:inline-block;background:#6366f1;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;text-align:center;font-size:15px;">💳 Set Up Autopay</a>' : '')
      + '</div>'
      // Next steps
      + '<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:20px 24px;margin:0 0 24px 0;">'
      + '<p style="margin:0 0 10px 0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#166534;">What happens next</p>'
      + '<ol style="margin:0;padding-left:20px;color:#166534;font-size:14px;line-height:1.6;">'
      + '<li>Click the button above to review your service agreement</li>'
      + '<li>Sign electronically using your preferred method</li>'
      + '<li>Set up autopay for seamless monthly billing</li>'
      + '<li>Relax – we\'ll handle the rest!</li>'
      + '</ol></div>'
      + '<p style="font-size:13px;color:#64748b;line-height:1.6;margin:0;">Questions about your service agreement? Reply to this email or contact us at <a href="mailto:samr@aqualitypoolcompanyusa.com" style="color:#0284c7;text-decoration:none;font-weight:600;">samr@aqualitypoolcompanyusa.com</a>.</p>'
      + '</td></tr>'
      // Footer
      + '<tr><td style="background:#f8fafc;padding:24px;text-align:center;border-top:1px solid #e2e8f0;">'
      + '<p style="margin:0;font-size:12px;color:#94a3b8;">© ' + new Date().getFullYear() + ' A Quality Pool Company. All rights reserved.</p>'
      + '</td></tr>'
      + '</table></td></tr></table></body></html>';
    
    MailApp.sendEmail(
      contract.customerEmail,
      '📝 Your Pool Service Agreement is Ready – Sign Now',
      '',
      {
        htmlBody: html,
        name: 'A Quality Pool Company',
        replyTo: 'samr@aqualitypoolcompanyusa.com'
      }
    );
    
    Logger.log('✅ Contract email sent to: ' + contract.customerEmail);
    return true;
  } catch (err) {
    Logger.log('❌ sendWeeklyContractEmail_ error: ' + err.toString());
    return false;
  }
}

/**
 * Send contract completion email to customer after they sign
 */
function sendWeeklyServiceContractCompleteEmail_(contractId, contract) {
  try {
    if (!contract || !contract.customerEmail) {
      Logger.log('❌ sendWeeklyServiceContractCompleteEmail_: missing contract or email');
      return;
    }
    
    var firstName = (contract.customerName || 'Valued Customer').split(' ')[0];
    var freq = contract.frequency === 'biweekly'
      ? 'Bi-Weekly'
      : (contract.frequency === 'monthly' ? 'Monthly' : 'Weekly');
    var basePrice = parseFloat(contract.pricePerVisit || 0);
    var extraCostPerVisit = parseFloat(contract.extraCostPerVisit || 0);
    var perVisitTotal = parseFloat(contract.perVisitTotal || (basePrice + extraCostPerVisit));
    var price = '$' + perVisitTotal.toFixed(2);
    var logoUrl = WS_CONTRACT_LETTERHEAD_LOGO_URL;
    
    var html = ''
      + '<html><head><meta charset="utf-8"></head><body style="font-family:Inter,system-ui,-apple-system,sans-serif;margin:0;padding:0;background:#f8fafc;">'
      + '<table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;background:white;border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.07);overflow:hidden;">'
      // Header
      + '<tr><td align="center" style="background:linear-gradient(135deg,#059669 0%,#10b981 100%);padding:36px 24px;text-align:center;">'
      + '<img src="' + logoUrl + '" alt="A Quality Pool Company" style="max-width:160px;height:auto;display:block;margin:0 auto 16px auto;border-radius:8px;">'
      + '<h1 style="color:#ffffff;margin:0 0 6px 0;font-size:26px;font-weight:800;line-height:1.2;">✅ Contract Signed!</h1>'
      + '<p style="color:#d1fae5;margin:0;font-size:14px;">Your ' + freq + ' pool service agreement is complete</p>'
      + '</td></tr>'
      // Body
      + '<tr><td style="padding:36px 28px;">'
      + '<h2 style="font-size:18px;font-weight:700;color:#0f172a;margin:0 0 14px 0;">Thank you, ' + firstName + '!</h2>'
      + '<p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 24px 0;">Your ' + freq + ' pool service agreement has been successfully signed and is now active. We look forward to keeping your pool clean and well-maintained all season long.</p>'
      // Service Details
      + '<div style="background:#f0fdf4;border-left:4px solid #059669;border-radius:0 8px 8px 0;padding:20px 24px;margin:0 0 24px 0;">'
      + '<p style="margin:0 0 6px 0;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#059669;">Service Details</p>'
      + '<table border="0" cellpadding="0" cellspacing="0" width="100%">'
      + '<tr><td style="padding:7px 0;color:#64748b;font-size:14px;width:140px;">Service Frequency:</td><td style="padding:7px 0;font-weight:700;color:#0f172a;font-size:15px;">' + freq + '</td></tr>'
      + (contract.serviceDay ? '<tr><td style="padding:7px 0;color:#64748b;font-size:14px;">Service Day:</td><td style="padding:7px 0;font-weight:700;color:#0f172a;font-size:15px;">' + contract.serviceDay + '</td></tr>' : '')
      + '<tr><td style="padding:7px 0;color:#64748b;font-size:14px;">Price per Visit:</td><td style="padding:7px 0;font-weight:700;color:#0f172a;font-size:15px;">' + price + '</td></tr>'
      + (extraCostPerVisit > 0 ? '<tr><td style="padding:7px 0;color:#64748b;font-size:14px;">Includes Extra Fee:</td><td style="padding:7px 0;font-weight:700;color:#0f172a;font-size:15px;">$' + extraCostPerVisit.toFixed(2) + '</td></tr>' : '')
      + (contract.startDate ? '<tr><td style="padding:7px 0;color:#64748b;font-size:14px;">Start Date:</td><td style="padding:7px 0;font-weight:700;color:#0f172a;font-size:15px;">' + contract.startDate + '</td></tr>' : '')
      + '</table></div>'
      // Next Steps
      + '<div style="background:#eff6ff;border-left:4px solid #0284c7;border-radius:0 8px 8px 0;padding:20px 24px;margin:0 0 24px 0;">'
      + '<p style="margin:0 0 12px 0;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#0284c7;">What\'s Next</p>'
      + '<ul style="margin:0;padding:0 0 0 20px;color:#374151;font-size:14px;line-height:1.8;">'
      + '<li style="margin:0 0 8px 0;">Our team will confirm your first service appointment within 24 hours</li>'
      + '<li style="margin:0 0 8px 0;">We\'ll send you all necessary details and preparation instructions</li>'
      + '<li style="margin:0 0 0 0;">You can manage your account and schedule changes anytime through your customer portal</li>'
      + '</ul></div>'
      // Contact Info
      + '<p style="font-size:14px;color:#64748b;line-height:1.6;margin:0 0 16px 0;">If you have any questions or need to reschedule, please don\'t hesitate to reach out. We\'re here to help!</p>'
      + '<p style="font-size:14px;color:#64748b;line-height:1.6;margin:0 0 24px 0;border-top:1px solid #e2e8f0;padding-top:24px;">'
      + '<strong>A Quality Pool Company</strong><br>'
      + 'Phone: (XXX) XXX-XXXX<br>'
      + 'Email: samr@aqualitypoolcompanyusa.com<br>'
      + 'Visit: aqualitypoolcompanyusa.com'
      + '</p>'
      + '<p style="font-size:12px;color:#94a3b8;line-height:1.6;margin:0;text-align:center;">'
      + '© ' + new Date().getFullYear() + ' A Quality Pool Company. All rights reserved.'
      + '</p>'
      + '</td></tr></table></body></html>';
    
    MailApp.sendEmail(
      contract.customerEmail,
      '✅ Your Pool Service Agreement is Complete',
      'Your ' + freq + ' pool service agreement has been successfully signed and is now active. We look forward to serving you!',
      {
        htmlBody: html,
        name: 'A Quality Pool Company',
        replyTo: 'samr@aqualitypoolcompanyusa.com'
      }
    );
    
    Logger.log('✅ Contract completion email sent to: ' + contract.customerEmail);
    return true;
  } catch (err) {
    Logger.log('❌ sendWeeklyServiceContractCompleteEmail_ error: ' + err.toString());
    return false;
  }
}

/**
 * Create a Stripe payment link for customer to set up autopay subscription
 */
function createStripePaymentLink_(customerEmail, customerName, pricePerVisit, frequency) {
  if (!STRIPE_SECRET_KEY) {
    Logger.log('❌ STRIPE_SECRET_KEY not configured - Stripe payments disabled');
    return '';
  }
  
  try {
    Logger.log('🔄 Creating Stripe payment link for: ' + customerEmail + ', price: $' + pricePerVisit + ', freq: ' + frequency);
    
    // Determine interval: weekly = 1 week, biweekly = 2 weeks, monthly = 1 month
    var interval = frequency === 'biweekly' ? 'week' : (frequency === 'weekly' ? 'week' : 'month');
    var intervalCount = frequency === 'biweekly' ? 2 : 1;
    
    // Create or get customer in Stripe
    var stripeCustomerId = getOrCreateStripeCustomer_(customerEmail, customerName);
    if (!stripeCustomerId) {
      Logger.log('❌ Could not create/get Stripe customer for ' + customerEmail);
      return '';
    }
    
    Logger.log('✅ Stripe customer ID: ' + stripeCustomerId);
    
    // Build form-encoded payload for Stripe API
    var formPayload = 'mode=subscription' 
      + '&customer=' + encodeURIComponent(stripeCustomerId)
      + '&success_url=' + encodeURIComponent('https://aqualitypoolcompanyusa.com/payment-success')
      + '&cancel_url=' + encodeURIComponent('https://aqualitypoolcompanyusa.com/payment-cancelled')
      + '&billing_address_collection=required'
      + '&customer_update[address]=auto'
      + '&customer_update[name]=auto'
      + '&customer_update[shipping]=never'
      + '&line_items[0][price_data][currency]=usd'
      + '&line_items[0][price_data][unit_amount]=' + Math.round(pricePerVisit * 100)
      + '&line_items[0][price_data][recurring][interval]=' + encodeURIComponent(interval)
      + '&line_items[0][price_data][recurring][interval_count]=' + intervalCount
      + '&line_items[0][price_data][product_data][name]=' + encodeURIComponent((frequency.charAt(0).toUpperCase() + frequency.slice(1)) + ' Pool Service - A Quality Pool Company')
      + '&line_items[0][price_data][product_data][description]=' + encodeURIComponent('Recurring ' + frequency + ' pool maintenance service')
      + '&line_items[0][quantity]=1';
    
    var options = {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      payload: formPayload,
      muteHttpExceptions: true
    };
    
    Logger.log('📡 Calling Stripe API to create checkout session...');
    var response = UrlFetchApp.fetch(STRIPE_API_URL + '/checkout/sessions', options);
    var responseCode = response.getResponseCode();
    var responseText = response.getContentText();
    
    Logger.log('📥 Stripe response code: ' + responseCode);
    
    if (responseCode !== 200) {
      Logger.log('⚠️ Non-200 response: ' + responseText.substring(0, 500));
    }
    
    var result = JSON.parse(responseText);
    
    if (result.error) {
      Logger.log('❌ Stripe error: ' + JSON.stringify(result.error));
      return '';
    }
    
    Logger.log('✅ Stripe checkout session created: ' + result.id);
    var checkoutUrl = result.url || '';
    Logger.log('✅ Checkout URL: ' + checkoutUrl);
    return checkoutUrl;
  } catch (err) {
    Logger.log('❌ createStripePaymentLink_ error: ' + err.toString());
    return '';
  }
}

/**
 * Get or create a Stripe customer
 */
function getOrCreateStripeCustomer_(email, name) {
  if (!STRIPE_SECRET_KEY || !email) return null;
  
  try {
    // Search for existing customer
    var searchOptions = {
      method: 'get',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY
      },
      muteHttpExceptions: true
    };
    
    var searchUrl = STRIPE_API_URL + '/customers/search?query=email:%22' + encodeURIComponent(email) + '%22';
    var searchResponse = UrlFetchApp.fetch(searchUrl, searchOptions);
    var searchResult = JSON.parse(searchResponse.getContentText());
    
    if (searchResult.data && searchResult.data.length > 0) {
      Logger.log('✅ Found existing Stripe customer: ' + searchResult.data[0].id);
      return searchResult.data[0].id;
    }
    
    // Create new customer
    var createPayload = {
      email: email,
      name: name || 'Customer',
      description: 'Pool service customer from A Quality Pool Company'
    };
    
    var createOptions = {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      payload: Object.keys(createPayload).map(key => encodeURIComponent(key) + '=' + encodeURIComponent(createPayload[key])).join('&'),
      muteHttpExceptions: true
    };
    
    var createResponse = UrlFetchApp.fetch(STRIPE_API_URL + '/customers', createOptions);
    var createResult = JSON.parse(createResponse.getContentText());
    
    if (createResult.error) {
      Logger.log('❌ Stripe customer creation error: ' + createResult.error.message);
      return null;
    }
    
    Logger.log('✅ Created new Stripe customer: ' + createResult.id);
    return createResult.id;
  } catch (err) {
    Logger.log('❌ getOrCreateStripeCustomer_ error: ' + err.toString());
    return null;
  }
}

/**
 * Send a weekly service contract: generates PDF + signing token,
 * updates status to Sent, and fires Telegram notification.
 */
function sendWeeklyServiceContract(contractId) {
  try {
    var cr = getWeeklyServiceContract_(contractId);
    if (!cr.success) return { success: false, error: 'Contract not found' };
    var contract = cr.data;
    if (contract.status === 'Signed') return { success: false, error: 'Contract is already signed.' };

    // Generate PDF (non-fatal if it fails)
    var pdfResult = generateWeeklyContractPDF_(contractId);
    var pdfUrl    = pdfResult.success ? pdfResult.pdfUrl : '';
    if (!pdfResult.success) Logger.log('⚠️ PDF generation failed (continuing): ' + pdfResult.error);

    // Generate signing token
    var tokenResult = generateWeeklyContractToken_(contractId, contract.customerEmail);
    if (!tokenResult.success) return { success: false, error: 'Could not generate signing token: ' + tokenResult.error };
    var signingUrl = tokenResult.signingUrl;

    // Generate Stripe payment link for autopay setup
    var stripeLink = '';
    try {
      var pricePerVisit = parseFloat(contract.perVisitTotal || (parseFloat(contract.pricePerVisit || 0) + parseFloat(contract.extraCostPerVisit || 0)));
      if (pricePerVisit > 0 && contract.customerEmail) {
        var freq = contract.frequency === 'biweekly' ? 'biweekly' : (contract.frequency === 'monthly' ? 'monthly' : 'weekly');
        stripeLink = createStripePaymentLink_(contract.customerEmail, contract.customerName, pricePerVisit, freq);
        Logger.log('✅ Stripe payment link created: ' + stripeLink);
        // Add Stripe link to signing URL so customer can be redirected after signing
        if (stripeLink) {
          signingUrl += '&stripeLink=' + encodeURIComponent(stripeLink);
        }
      }
    } catch (stripeErr) {
      Logger.log('⚠️ Stripe link generation failed (continuing): ' + stripeErr.toString());
    }

    // Update status → Sent
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sh = ss.getSheetByName(WS_CONTRACTS_SHEET);
    if (sh) {
      var rows = sh.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        if (String(rows[i][0] || '').trim() === String(contractId).trim()) {
          sh.getRange(i + 1, 7).setValue('Sent');
          sh.getRange(i + 1, 9).setValue(new Date());
          break;
        }
      }
    }

    // Send email to customer with signing link AND stripe link
    var emailSent = sendWeeklyContractEmail_(contract, signingUrl, stripeLink);
    if (!emailSent) Logger.log('⚠️ Email send failed for weekly contract: ' + contractId);

    // Send Telegram notification to admin (non-fatal, but surface status)
    var telegramRes = sendWeeklyContractTelegram_(contractId, contract, signingUrl, pdfUrl, stripeLink);
    var telegramSent = !!(telegramRes && telegramRes.success);
    var telegramError = telegramSent ? '' : ((telegramRes && telegramRes.error) || 'Unknown Telegram error');
    var telegramMessage = (telegramRes && telegramRes.message) ? String(telegramRes.message) : '';
    var telegramDraftText = (telegramRes && telegramRes.draftText) ? String(telegramRes.draftText) : '';

    // Queue contract print task to Dashboard when contract is sent
    try {
      queueWeeklyServiceContractTask(
        contractId,
        contract.customerName || 'Customer',
        contract.customerEmail || '',
        contract.companyId || 'CMP-AQUALITYPOOL'
      );
    } catch (taskErr) {
      Logger.log('sendWeeklyServiceContract task queue error: ' + taskErr.toString());
    }

    if (!emailSent) {
      return {
        success: false,
        error: 'Contract prepared, but customer email failed to send. Please verify MailApp permissions/quota and customer email.',
        signingUrl: signingUrl,
        pdfUrl: pdfUrl,
        stripeLink: stripeLink,
        emailSent: false
      };
    }

    Logger.log('✅ Weekly service contract sent: ' + contractId + ' (Email: YES, Telegram: ' + (telegramSent ? 'YES' : 'NO') + ')');
    return {
      success: true,
      signingUrl: signingUrl,
      pdfUrl: pdfUrl,
      stripeLink: stripeLink,
      emailSent: true,
      telegramSent: telegramSent,
      telegramError: telegramError,
      telegramMessage: telegramMessage,
      telegramDraftText: telegramDraftText
    };
  } catch (err) {
    Logger.log('❌ sendWeeklyServiceContract error: ' + err.toString());
    return { success: false, error: err.toString() };
  }
}

// ===========================================================================
// SERVICE HISTORY - Log and track completed service visits & one-off charges
// ===========================================================================

/**
 * Ensure Service History sheet exists with proper columns
 */
function wsEnsureServiceHistorySheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SERVICE_HISTORY_SHEET);

  const requiredHeaders = [
    'Date',
    'Customer Email',
    'Service Type',
    'Description',
    'Amount',
    'Notes',
    'Performed By',
    'Timestamp',
    'Appointment ID',
    'Service Details JSON',
    'Photo Count',
    'Pool Size',
    'Pool Type',
    'Chemical Type',
    'Chemical Readings JSON',
    'Chemical Dosages JSON'
  ];

  if (!sheet) {
    const headers = requiredHeaders;
    sheet = ss.insertSheet(SERVICE_HISTORY_SHEET);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e8f4f8');
    sheet.setFrozenRows(1);
  }

  // Backfill missing columns for existing sheets.
  const lastCol = Math.max(1, sheet.getLastColumn());
  const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  let changed = false;
  requiredHeaders.forEach((header, idx) => {
    const colIndex = idx + 1;
    if (existing[idx] !== header) {
      sheet.getRange(1, colIndex).setValue(header);
      changed = true;
    }
  });
  if (changed) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setFontWeight('bold').setBackground('#e8f4f8');
  }

  // Set column widths
  sheet.setColumnWidth(1, 100);   // Date
  sheet.setColumnWidth(2, 200);   // Customer Email
  sheet.setColumnWidth(3, 120);   // Service Type
  sheet.setColumnWidth(4, 250);   // Description
  sheet.setColumnWidth(5, 100);   // Amount
  sheet.setColumnWidth(6, 220);   // Notes
  sheet.setColumnWidth(7, 150);   // Performed By
  sheet.setColumnWidth(8, 180);   // Timestamp
  sheet.setColumnWidth(9, 140);   // Appointment ID
  sheet.setColumnWidth(10, 260);  // Service Details JSON
  sheet.setColumnWidth(11, 100);  // Photo Count
  sheet.setColumnWidth(12, 100);  // Pool Size
  sheet.setColumnWidth(13, 120);  // Pool Type
  sheet.setColumnWidth(14, 120);  // Chemical Type
  sheet.setColumnWidth(15, 260);  // Chemical Readings JSON
  sheet.setColumnWidth(16, 260);  // Chemical Dosages JSON

  return sheet;
}

function wsEnsureChemicalsSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(CHEMICALS_SHEET);

  const requiredHeaders = [
    'CompanyID',
    'RowType',             // CATALOG or USAGE
    'Date',
    'Customer Email',
    'Appointment ID',
    'Service History ID',
    'Chemical Key',
    'Display Name',
    'Quantity',
    'Unit',
    'Unit Price',
    'Line Total',
    'Notes',
    'Performed By',
    'Source',
    'Active',
    'UpdatedAt'
  ];

  if (!sheet) {
    sheet = ss.insertSheet(CHEMICALS_SHEET);
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    sheet.getRange(1, 1, 1, requiredHeaders.length).setFontWeight('bold').setBackground('#ecfeff');
    sheet.setFrozenRows(1);
  }

  const lastCol = Math.max(1, sheet.getLastColumn());
  const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  let changed = false;
  requiredHeaders.forEach((header, idx) => {
    if (existing[idx] !== header) {
      sheet.getRange(1, idx + 1).setValue(header);
      changed = true;
    }
  });
  if (changed) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setFontWeight('bold').setBackground('#ecfeff');
  }

  // Seed default catalog rows once if none exists.
  const data = sheet.getDataRange().getValues();
  const hasCatalogRows = data.slice(1).some(r => String(r[1] || '').toUpperCase() === 'CATALOG');
  if (!hasCatalogRows) {
    const nowIso = new Date().toISOString();
    const defaults = [
      ['liquidChlorine', 'Liquid Chlorine', 'gal', 0],
      ['muriaticAcid', 'Muriatic Acid', 'gal', 0],
      ['alkalinityUp', 'Alkalinity Up', 'lb', 0],
      ['calciumHardnessUp', 'Calcium Hardness Up', 'lb', 0],
      ['stabilizer', 'Stabilizer (CYA)', 'lb', 0],
      ['saltAdded', 'Salt', 'lb', 0]
    ].map(row => [
      DEFAULT_COMPANY_ID, 'CATALOG', '', '', '', '',
      row[0], row[1], '', row[2], row[3], '', 'Seeded default chemical catalog',
      '', 'weekly-service', true, nowIso
    ]);
    if (defaults.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, defaults.length, requiredHeaders.length).setValues(defaults);
    }
  }

  return sheet;
}

function getChemicalsCatalog_(companyId) {
  try {
    const sheet = wsEnsureChemicalsSheet_();
    const data = sheet.getDataRange().getValues();
    const targetCompany = String(companyId || DEFAULT_COMPANY_ID).trim();
    const fallbackCompany = DEFAULT_COMPANY_ID;

    const catalogRows = data.slice(1).filter(r => String(r[1] || '').toUpperCase() === 'CATALOG');
    const rows = catalogRows.filter(r => {
      const rowCompany = String(r[0] || '').trim();
      return rowCompany === targetCompany || rowCompany === fallbackCompany || !rowCompany;
    });

    const dedup = {};
    rows.forEach(r => {
      const key = String(r[6] || '').trim();
      if (!key) return;
      dedup[key] = {
        companyId: String(r[0] || targetCompany || DEFAULT_COMPANY_ID),
        chemicalKey: key,
        displayName: String(r[7] || key),
        unit: String(r[9] || ''),
        unitPrice: parseFloat(r[10] || 0) || 0,
        active: String(r[15] || 'true').toLowerCase() !== 'false',
        updatedAt: String(r[16] || '')
      };
    });

    return { success: true, items: Object.keys(dedup).map(k => dedup[k]) };
  } catch (err) {
    return { success: false, error: err.toString(), items: [] };
  }
}

function upsertChemicalCatalogItem_(item) {
  try {
    const sheet = wsEnsureChemicalsSheet_();
    const data = sheet.getDataRange().getValues();
    const targetCompany = String(item.companyId || DEFAULT_COMPANY_ID).trim();
    const key = String(item.chemicalKey || '').trim();
    if (!key) return { success: false, error: 'chemicalKey is required' };

    const nowIso = new Date().toISOString();
    const rowData = [
      targetCompany,
      'CATALOG',
      '',
      '',
      '',
      '',
      key,
      String(item.displayName || key),
      '',
      String(item.unit || ''),
      parseFloat(item.unitPrice || 0) || 0,
      '',
      '',
      '',
      'weekly-service',
      item.active === false ? false : true,
      nowIso
    ];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (String(row[1] || '').toUpperCase() !== 'CATALOG') continue;
      const rowCompany = String(row[0] || '').trim();
      const rowKey = String(row[6] || '').trim();
      if (rowCompany === targetCompany && rowKey === key) {
        sheet.getRange(i + 1, 1, 1, rowData.length).setValues([rowData]);
        return { success: true, updated: true };
      }
    }

    sheet.appendRow(rowData);
    return { success: true, created: true };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

function appendChemicalUsageLogs_(params, historyId, serviceDate) {
  const dosages = params && params.chemicalDosages ? params.chemicalDosages : {};
  if (!dosages || typeof dosages !== 'object') return;

  const sheet = wsEnsureChemicalsSheet_();
  const catalogRes = getChemicalsCatalog_(params.companyId || DEFAULT_COMPANY_ID);
  const catalogMap = {};
  (catalogRes.items || []).forEach(it => { catalogMap[it.chemicalKey] = it; });

  const nowIso = new Date().toISOString();
  const keyMap = {
    liquidChlorine: { name: 'Liquid Chlorine', unit: 'gal' },
    muriaticAcid: { name: 'Muriatic Acid', unit: 'gal' },
    alkalinityUp: { name: 'Alkalinity Up', unit: 'lb' },
    calciumHardnessUp: { name: 'Calcium Hardness Up', unit: 'lb' },
    stabilizer: { name: 'Stabilizer (CYA)', unit: 'lb' },
    saltAdded: { name: 'Salt', unit: 'lb' }
  };

  const rows = [];
  Object.keys(keyMap).forEach(key => {
    const qty = parseFloat(dosages[key] || 0) || 0;
    if (qty <= 0) return;
    const catalog = catalogMap[key] || {};
    const unitPrice = parseFloat(catalog.unitPrice || 0) || 0;
    rows.push([
      String(params.companyId || DEFAULT_COMPANY_ID).trim(),
      'USAGE',
      serviceDate,
      String(params.customerEmail || '').toLowerCase().trim(),
      String(params.appointmentId || ''),
      String(historyId || ''),
      key,
      String(catalog.displayName || keyMap[key].name),
      qty,
      String(catalog.unit || keyMap[key].unit),
      unitPrice,
      parseFloat((qty * unitPrice).toFixed(2)),
      '',
      String(params.performedBy || ''),
      'logServiceCompletion',
      true,
      nowIso
    ]);
  });

  const otherText = String(dosages.other || '').trim();
  if (otherText) {
    rows.push([
      String(params.companyId || DEFAULT_COMPANY_ID).trim(),
      'USAGE',
      serviceDate,
      String(params.customerEmail || '').toLowerCase().trim(),
      String(params.appointmentId || ''),
      String(historyId || ''),
      'other',
      'Other Chemicals / Notes',
      '',
      '',
      0,
      0,
      otherText,
      String(params.performedBy || ''),
      'logServiceCompletion',
      true,
      nowIso
    ]);
  }

  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 17).setValues(rows);
  }
}

/**
 * Log a service completion (regular weekly visit or one-off charge for chemicals, items, etc)
 * @param {Object} params - { companyId, customerEmail, serviceType, description, amount, notes, performedBy, date }
 * @returns {Object} { success, serviceHistoryId, error? }
 */
/**
 * Get today's appointments for quick service completion.
 * Returns appointments scheduled for today, grouped and formatted for easy selection.
 */
function getTodaysAppointments(email) {
  try {
    const ctx = getCompanyIdForSchedulingUser_(email || '');
    const companyId = ctx.companyId || DEFAULT_COMPANY_ID;
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(APPOINTMENTS_SHEET);
    if (!sheet) return { success: false, error: 'Appointments sheet not found', appointments: [] };
    
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    
    const colId = headers.indexOf('ID') >= 0 ? headers.indexOf('ID') : headers.indexOf('AppointmentID');
    const colCompany = headers.indexOf('CompanyID');
    const colCustomerName = headers.indexOf('CustomerName');
    const colCustomerEmail = headers.indexOf('CustomerEmail');
    const colCustomerPhone = headers.indexOf('CustomerPhone');
    const colAddress = headers.indexOf('Address');
    const colDate = headers.indexOf('Date');
    const colTime = headers.indexOf('Time');
    const colStatus = headers.indexOf('Status');
    const colSvcType = headers.indexOf('ServiceType');
    const colRecurring = headers.indexOf('Recurring');
    const colPoolSize = headers.indexOf('PoolSize');
    const colPoolType = headers.indexOf('PoolType');
    const colChemicalType = headers.indexOf('ChemicalType');
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    
    const appointments = [];
    
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (colCompany >= 0 && String(row[colCompany] || '').trim() !== companyId) continue;
      
      const apptDate = row[colDate] ? new Date(row[colDate]) : null;
      if (!apptDate) continue;
      apptDate.setHours(0, 0, 0, 0);
      
      const status = colStatus >= 0 ? String(row[colStatus] || '').trim().toLowerCase() : '';
      const serviceType = colSvcType >= 0 ? String(row[colSvcType] || '').trim().toLowerCase() : '';
      
      // Only show "Scheduled" status
      if (status !== 'scheduled') continue;
      
      // Only show "Opening" or "Pool Service" service types
      if (serviceType !== 'opening' && serviceType !== 'pool service') continue;
      
      const daysFromToday = Math.floor((apptDate - today) / (1000 * 60 * 60 * 24));
      
      // Include: today + next 7 days, OR any past appointments not completed
      if (daysFromToday >= 0 && daysFromToday > 7) continue;
      // Allow past appointments (daysFromToday < 0) as long as they're not completed
      
      appointments.push({
        id: colId >= 0 ? String(row[colId] || '').trim() : '',
        customerName: colCustomerName >= 0 ? String(row[colCustomerName] || '').trim() : '',
        customerEmail: colCustomerEmail >= 0 ? String(row[colCustomerEmail] || '').toLowerCase().trim() : '',
        customerPhone: colCustomerPhone >= 0 ? String(row[colCustomerPhone] || '').trim() : '',
        address: colAddress >= 0 ? String(row[colAddress] || '').trim() : '',
        date: colDate >= 0 ? Utilities.formatDate(row[colDate], Session.getScriptTimeZone(), 'yyyy-MM-dd') : '',
        time: colTime >= 0 ? String(row[colTime] || '').trim() : '',
        status: colStatus >= 0 ? String(row[colStatus] || '').trim() : '',
        serviceType: colSvcType >= 0 ? String(row[colSvcType] || '').trim() : '',
        recurring: colRecurring >= 0 ? String(row[colRecurring] || '').toLowerCase().trim() : '',
        poolSize: colPoolSize >= 0 ? String(row[colPoolSize] || '').trim() : '',
        poolType: colPoolType >= 0 ? String(row[colPoolType] || '').toLowerCase().trim() : '',
        chemicalType: colChemicalType >= 0 ? String(row[colChemicalType] || '').toLowerCase().trim() : '',
        daysFromToday: daysFromToday
      });
    }
    
    // Sort by: incomplete/overdue first (past dates), then by date, then time
    appointments.sort((a, b) => {
      // Put past dates first (negative daysFromToday)
      if ((a.daysFromToday < 0) !== (b.daysFromToday < 0)) {
        return a.daysFromToday < 0 ? -1 : 1;
      }
      // Then sort by date
      if (a.daysFromToday !== b.daysFromToday) return a.daysFromToday - b.daysFromToday;
      // Then by time
      return (a.time || '').localeCompare(b.time || '');
    });
    
    return { success: true, appointments: appointments };
  } catch (err) {
    Logger.log('❌ getTodaysAppointments error: ' + err.toString());
    return { success: false, error: err.toString(), appointments: [] };
  }
}

/**
 * Search for customers by name/email for service completion.
 */
function searchCustomersForServiceCompletion(query, companyId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CUSTOMERS_SHEET);
    if (!sheet) return { success: false, customers: [] };
    
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    
    const colId = headers.indexOf('CustomerID');
    const colName = headers.indexOf('Name');
    const colEmail = headers.indexOf('Email');
    const colPhone = headers.indexOf('Phone');
    const colAddress = headers.indexOf('Address');
    const colCompany = headers.indexOf('CompanyID');
    const colPoolSize = headers.indexOf('PoolSize');
    const colPoolType = headers.indexOf('PoolType');
    const colChemicalType = headers.indexOf('ChemicalType');
    
    const q = String(query || '').toLowerCase().trim();
    const results = [];
    
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (colCompany >= 0 && String(row[colCompany] || '').trim() !== companyId) continue;
      
      const name = String(row[colName] || '').toLowerCase();
      const email = String(row[colEmail] || '').toLowerCase();
      
      if (name.includes(q) || email.includes(q)) {
        results.push({
          customerId: colId >= 0 ? String(row[colId] || '').trim() : '',
          name: String(row[colName] || '').trim(),
          email: String(row[colEmail] || '').toLowerCase().trim(),
          phone: colPhone >= 0 ? String(row[colPhone] || '').trim() : '',
          address: colAddress >= 0 ? String(row[colAddress] || '').trim() : '',
          poolSize: colPoolSize >= 0 ? String(row[colPoolSize] || '').trim() : '',
          poolType: colPoolType >= 0 ? String(row[colPoolType] || '').toLowerCase().trim() : '',
          chemicalType: colChemicalType >= 0 ? String(row[colChemicalType] || '').toLowerCase().trim() : ''
        });
      }
    }
    
    return { success: true, customers: results };
  } catch (err) {
    Logger.log('❌ searchCustomersForServiceCompletion error: ' + err.toString());
    return { success: false, customers: [] };
  }
}

function logServiceCompletion(params) {
  try {
    wsEnsureServiceHistorySheet_();
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SERVICE_HISTORY_SHEET);
    
    // Validate required fields
    if (!params.customerEmail || params.customerEmail.trim() === '') {
      return { success: false, error: 'Customer email is required' };
    }
    if (!params.description || params.description.trim() === '') {
      return { success: false, error: 'Description is required' };
    }
    if (params.amount < 0) {
      return { success: false, error: 'Amount must be >= 0' };
    }
    
    const allPhotos = []
      .concat(params.photos || [])
      .concat(params.poolPhotos || [])
      .concat(params.saltPanelPhotos || []);

    // Photos optional unless explicitly required by caller
    const requirePhotos = params.requirePhotos === true;
    if (requirePhotos && (!allPhotos || allPhotos.length === 0)) {
      return { success: false, error: 'At least one photo of the pool is required' };
    }
    
    // If salt system, validate salt panel photo
    if (params.chemicalType && params.chemicalType.toLowerCase().includes('salt')) {
      const hasSaltPanelPhoto = allPhotos.some(p => p.category && p.category.toLowerCase().includes('salt'));
      if (!hasSaltPanelPhoto) {
        return { success: false, error: 'Salt system detected: Photo of salt panel is required' };
      }
    }
    
    // Generate service history ID
    const historyId = 'SH-' + Utilities.getUuid().substring(0, 8).toUpperCase();
    
    // Append row
    const now = new Date();
    const row = [
      params.date || Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      params.customerEmail.toLowerCase().trim(),
      params.serviceType === 'OneOff' ? 'One-Off Item' : 'Regular Service',
      params.description.trim(),
      params.amount,
      params.notes.trim(),
      params.performedBy.trim(),
      Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
      params.appointmentId || '',
      JSON.stringify({
        poolCondition: params.poolCondition || '',
        workPerformed: params.workPerformed || '',
        issuesFound: params.issuesFound || '',
        recommendations: params.recommendations || '',
        checklist: params.checklist || {}
      }),
      allPhotos.length || 0,
      params.poolSize || '',
      params.poolType || '',
      params.chemicalType || '',
      JSON.stringify(params.chemicalReadings || {}),
      JSON.stringify(params.chemicalDosages || {})
    ];
    
    sheet.appendRow(row);
    
    Logger.log('✅ Service logged: ' + historyId + ' for ' + params.customerEmail);
    
    // If amount > 0, also add to Payment History for billing tracking
    if (params.amount > 0) {
      const paymentSheet = ss.getSheetByName(PAYMENT_HISTORY_SHEET);
      if (paymentSheet) {
        const paymentType = params.serviceType === 'OneOff' ? 'One-Off Charge' : 'Service';
        const paymentRow = [
          new Date(),
          params.customerEmail.toLowerCase().trim(),
          paymentType,
          params.description,
          params.amount,
          'Paid',
          params.performedBy,
          'Service: ' + params.description
        ];
        paymentSheet.appendRow(paymentRow);
      }
    }
    
    // Update appointment status if linked
    if (params.appointmentId) {
      const apptSheet = ss.getSheetByName(APPOINTMENTS_SHEET);
      if (apptSheet) {
        const apptValues = apptSheet.getDataRange().getValues();
        const apptHeaders = apptValues[0];
        const colId = apptHeaders.indexOf('ID') >= 0 ? apptHeaders.indexOf('ID') : apptHeaders.indexOf('AppointmentID');
        const colStatus = apptHeaders.indexOf('Status');
        
        if (colId >= 0 && colStatus >= 0) {
          for (let i = 1; i < apptValues.length; i++) {
            if (String(apptValues[i][colId]).trim() === params.appointmentId) {
              apptSheet.getRange(i + 1, colStatus + 1).setValue('Completed');
              Logger.log('✅ Updated appointment ' + params.appointmentId + ' to Completed');
              break;
            }
          }
        }
      }

      try {
        const activityLines = [];
        activityLines.push('Checklist completed');

        const water = params.waterLevelData || (((params.checklist || {}).items || {}).waterLevel) || {};
        const waterLevel = String(water.level || '').trim();
        if (waterLevel) {
          let w = 'Water level: ' + waterLevel;
          if (water.hoseStartTime) w += ' — hose start ' + water.hoseStartTime;
          if (water.hoseEndTime) w += ', off ' + water.hoseEndTime;
          if (water.customerDirectedNote) w += ' | customer directed: ' + water.customerDirectedNote;
          activityLines.push(w);
        }

        const doses = params.chemicalDosages || {};
        const chemBits = [];
        if (doses.liquidChlorine) chemBits.push('Liquid Chlorine ' + doses.liquidChlorine + ' gal');
        if (doses.muriaticAcid) chemBits.push('Muriatic Acid ' + doses.muriaticAcid + ' gal');
        if (doses.alkalinityUp) chemBits.push('Alkalinity Up ' + doses.alkalinityUp);
        if (doses.calciumHardnessUp) chemBits.push('Calcium Hardness Up ' + doses.calciumHardnessUp);
        if (doses.stabilizer) chemBits.push('Stabilizer ' + doses.stabilizer);
        if (doses.phDown) chemBits.push('pH Down ' + doses.phDown + ' lb');
        if (doses.calciumHypo) chemBits.push('Calcium Hypo ' + doses.calciumHypo + ' lb');
        if (doses.saltBagsNeeded) chemBits.push('Salt Needed ' + doses.saltBagsNeeded + ' bag(s)');
        if (doses.saltAdded) chemBits.push('Salt Added ' + doses.saltAdded);
        if (doses.saltBagsAdded) chemBits.push('Salt Added ' + doses.saltBagsAdded + ' bag(s)');
        if (chemBits.length) activityLines.push('Chemicals: ' + chemBits.join(', '));

        const readings = params.chemicalReadings || {};
        if (readings.saltTester) activityLines.push('Salt tester reading: ' + readings.saltTester + ' ppm');

        if (params.beforePhotoCount || params.afterPhotoCount) {
          activityLines.push('Photos uploaded: ' + Number(params.beforePhotoCount || 0) + ' before, ' + Number(params.afterPhotoCount || 0) + ' after');
        } else if (allPhotos.length) {
          activityLines.push('Photos uploaded: ' + allPhotos.length);
        }

        activityLines.forEach(function(line) {
          appendCalendarEventLogForAppointment_(params.appointmentId, line);
        });
      } catch (auditErr) {
        Logger.log('logServiceCompletion calendar audit append failed: ' + auditErr.toString());
      }
    }
    
    return { success: true, serviceHistoryId: historyId };
  } catch (err) {
    Logger.log('❌ logServiceCompletion error: ' + err.toString());
    return { success: false, error: err.toString() };
  }
}

/**
 * Public wrapper for getServiceHistory_
 */
function getServiceHistory(customerEmail, companyId) {
  return getServiceHistory_(customerEmail, companyId);
}

/**
 * Get service history for a customer (recent first)
 * @param {string} customerEmail - Customer email
 * @param {string} companyId - Company ID
 * @returns {Object} { success, history: [{date, serviceType, description, amount, notes, performedBy, timestamp}], total }
 */
function getServiceHistory_(customerEmail, companyId) {
  try {
    wsEnsureServiceHistorySheet_();
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SERVICE_HISTORY_SHEET);
    const rows = sheet.getDataRange().getValues();
    
    if (rows.length <= 1) {
      return { success: true, history: [], total: 0 };
    }
    
    const history = [];
    let total = 0;
    
    // Skip header, iterate from bottom (most recent first)
    for (let i = rows.length - 1; i >= 1; i--) {
      const email = String(rows[i][1] || '').toLowerCase().trim();
      
      if (email === customerEmail.toLowerCase().trim()) {
        let chemicalReadings = {};
        let chemicalDosages = {};
        try {
          chemicalReadings = rows[i][14] ? JSON.parse(rows[i][14]) : {};
        } catch (e) {
          chemicalReadings = {};
        }
        try {
          chemicalDosages = rows[i][15] ? JSON.parse(rows[i][15]) : {};
        } catch (e) {
          chemicalDosages = {};
        }

        history.push({
          date: String(rows[i][0] || ''),
          serviceType: String(rows[i][2] || 'Regular Service'),
          description: String(rows[i][3] || ''),
          amount: parseFloat(rows[i][4] || 0),
          notes: String(rows[i][5] || ''),
          performedBy: String(rows[i][6] || ''),
          timestamp: String(rows[i][7] || ''),
          chemicalReadings: chemicalReadings,
          chemicalDosages: chemicalDosages,
          chemicalType: String(rows[i][13] || '')
        });
        
        total += parseFloat(rows[i][4] || 0);
      }
    }
    
    return { success: true, history: history, total: total };
  } catch (err) {
    Logger.log('❌ getServiceHistory_ error: ' + err.toString());
    return { success: false, error: err.toString(), history: [], total: 0 };
  }
}

// ===========================================================================
// CUSTOMER RECEIPTS - Upload and track receipt images with OCR amounts
// ===========================================================================

/**
 * Ensure Customer Receipts sheet exists
 */
function wsEnsureCustomerReceiptsSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(CUSTOMER_RECEIPTS_SHEET);
  
  if (!sheet) {
    const headers = ['Date', 'Customer Email', 'Description', 'OCR Amount', 'Manual Amount', 'Amount Used', 'Drive File ID', 'Notes', 'Uploaded', 'Timestamp'];
    sheet = ss.insertSheet(CUSTOMER_RECEIPTS_SHEET);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#eff6ff');
    sheet.setFrozenRows(1);
    
    // Set column widths
    sheet.setColumnWidth(1, 100);  // Date
    sheet.setColumnWidth(2, 200);  // Customer Email
    sheet.setColumnWidth(3, 250);  // Description
    sheet.setColumnWidth(4, 120);  // OCR Amount
    sheet.setColumnWidth(5, 120);  // Manual Amount
    sheet.setColumnWidth(6, 120);  // Amount Used
    sheet.setColumnWidth(7, 200);  // Drive File ID (link)
    sheet.setColumnWidth(8, 200);  // Notes
    sheet.setColumnWidth(9, 100);  // Uploaded
    sheet.setColumnWidth(10, 180); // Timestamp
  }
  
  return sheet;
}

/**
 * Upload a customer receipt with OCR extraction
 * @param {Object} params - { customerEmail, description, amount, date, base64Image, mimeType, notes }
 * @returns {Object} { success, receiptId, ocrAmount, finalAmount, driveFileId }
 */
function uploadCustomerReceipt(params) {
  try {
    wsEnsureCustomerReceiptsSheet_();
    
    if (!params.customerEmail || params.customerEmail.trim() === '') {
      return { success: false, error: 'Customer email is required' };
    }
    
    const receiptId = 'RCP-' + Utilities.getUuid().substring(0, 8).toUpperCase();
    let ocrAmount = 0;
    let driveFileId = '';
    
    // Extract amount from receipt image using OCR if image provided
    if (params.base64Image && params.base64Image.trim() !== '') {
      try {
        // Use the existing ReceiptOCR module to extract data
        const ocrResult = extractReceiptData(params.base64Image, params.mimeType || 'image/jpeg');
        
        if (ocrResult && ocrResult.success && ocrResult.items && ocrResult.items.length > 0) {
          // Sum up all items found in receipt
          ocrAmount = ocrResult.items.reduce((sum, item) => {
            return sum + (parseFloat(item.amount) || 0);
          }, 0);
          
          Logger.log('✅ OCR extracted amount: $' + ocrAmount.toFixed(2));
        }
        
        // Upload receipt image to Drive
        const fileName = 'Receipt_' + params.customerEmail + '_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HHmmss') + '.jpg';
        const driveResult = uploadReceiptToDrive(params.base64Image, fileName, '');
        if (driveResult && driveResult.success) {
          driveFileId = driveResult.fileId || '';
        }
      } catch (ocrErr) {
        Logger.log('⚠️ OCR failed (continuing): ' + ocrErr.toString());
      }
    }
    
    // Use manual amount if provided, otherwise use OCR amount
    const finalAmount = params.amount > 0 ? params.amount : ocrAmount;
    
    // Store in spreadsheet
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CUSTOMER_RECEIPTS_SHEET);
    const now = new Date();
    
    const row = [
      params.date || Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      params.customerEmail.toLowerCase().trim(),
      params.description.trim(),
      ocrAmount,  // OCR extracted
      params.amount,  // Manual override
      finalAmount,  // Amount used for tracking
      driveFileId,
      params.notes.trim(),
      'Yes',
      Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
    ];
    
    sheet.appendRow(row);
    
    // Also add to Service History as one-off charge if amount > 0
    if (finalAmount > 0) {
      logServiceCompletion({
        companyId: DEFAULT_COMPANY_ID,
        customerEmail: params.customerEmail,
        serviceType: 'OneOff',
        description: 'Receipt: ' + params.description,
        amount: finalAmount,
        notes: 'Receipt upload - ' + (ocrAmount > 0 ? 'OCR extracted' : 'manual amount'),
        performedBy: 'Receipt Upload',
        date: params.date
      });
    }
    
    Logger.log('✅ Receipt logged: ' + receiptId + ' for ' + params.customerEmail);
    return {
      success: true,
      receiptId: receiptId,
      ocrAmount: ocrAmount,
      finalAmount: finalAmount,
      driveFileId: driveFileId
    };
  } catch (err) {
    Logger.log('❌ uploadCustomerReceipt error: ' + err.toString());
    return { success: false, error: err.toString() };
  }
}

/**
 * Public wrapper for getCustomerReceipts_
 */
function getCustomerReceipts(customerEmail, companyId) {
  return getCustomerReceipts_(customerEmail, companyId);
}

/**
 * Get all receipts for a customer
 */
function getCustomerReceipts_(customerEmail, companyId) {
  try {
    wsEnsureCustomerReceiptsSheet_();
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CUSTOMER_RECEIPTS_SHEET);
    const rows = sheet.getDataRange().getValues();
    
    if (rows.length <= 1) {
      return { success: true, receipts: [], total: 0 };
    }
    
    const receipts = [];
    let total = 0;
    
    // Iterate from bottom (most recent first)
    for (let i = rows.length - 1; i >= 1; i--) {
      const email = String(rows[i][1] || '').toLowerCase().trim();
      
      if (email === customerEmail.toLowerCase().trim()) {
        const amount = parseFloat(rows[i][5] || 0);  // Use Amount Used column
        receipts.push({
          date: String(rows[i][0] || ''),
          description: String(rows[i][2] || ''),
          ocrAmount: parseFloat(rows[i][3] || 0),
          manualAmount: parseFloat(rows[i][4] || 0),
          amountUsed: amount,
          driveFileId: String(rows[i][6] || ''),
          notes: String(rows[i][7] || ''),
          timestamp: String(rows[i][9] || '')
        });
        total += amount;
      }
    }
    
    return { success: true, receipts: receipts, total: total };
  } catch (err) {
    Logger.log('❌ getCustomerReceipts_ error: ' + err.toString());
    return { success: false, error: err.toString(), receipts: [], total: 0 };
  }
}

/**
 * Public wrapper for getCustomerSpending_
 */
function getCustomerSpending(customerEmail, companyId) {
  return getCustomerSpending_(customerEmail, companyId);
}

/**
 * Get total spending for customer (receipts + services + contracts)
 */
function getCustomerSpending_(customerEmail, companyId) {
  try {
    let totalSpending = {
      receiptTotal: 0,
      serviceTotal: 0,
      paymentTotal: 0,
      combinedTotal: 0
    };
    
    // Get receipts total
    const receipts = getCustomerReceipts_(customerEmail, companyId);
    if (receipts.success) {
      totalSpending.receiptTotal = receipts.total;
    }
    
    // Get service history total (one-off charges)
    const history = getServiceHistory_(customerEmail, companyId);
    if (history.success) {
      totalSpending.serviceTotal = history.total;
    }
    
    // Get payment history total
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const paymentSheet = ss.getSheetByName(PAYMENT_HISTORY_SHEET);
    if (paymentSheet) {
      const rows = paymentSheet.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        const email = String(rows[i][1] || '').toLowerCase().trim();
        if (email === customerEmail.toLowerCase().trim()) {
          totalSpending.paymentTotal += parseFloat(rows[i][4] || 0);
        }
      }
    }
    
    totalSpending.combinedTotal = totalSpending.receiptTotal + totalSpending.serviceTotal + totalSpending.paymentTotal;
    
    return { success: true, spending: totalSpending };
  } catch (err) {
    Logger.log('❌ getCustomerSpending_ error: ' + err.toString());
    return { success: false, error: err.toString() };
  }
}

/**
 * Complete service report from Weekly Service dashboard.
 * Saves the report, marks appointment as completed, and sends to customer.
 * 
 * Data: {
 *   appointmentId: string,
 *   customerEmail: string,
 *   startTime: string,
 *   endTime: string,
 *   poolCondition: string,
 *   workPerformed: string,
 *   issuesFound: string,
 *   recommendations: string,
 *   checklist: object,
 *   photos: array (with data URIs)
 * }
 */
function completeServiceReport(data) {
  try {
    if (!data || !data.appointmentId || !data.customerEmail) {
      return { success: false, error: 'Missing required fields: appointmentId and customerEmail' };
    }

    const apptId = String(data.appointmentId).trim();
    const customerEmail = String(data.customerEmail).toLowerCase().trim();
    
    // Step 1: Update appointment status to "Completed"
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const apptSheet = ss.getSheetByName(APPOINTMENTS_SHEET);
    if (!apptSheet) {
      return { success: false, error: 'Appointments sheet not found' };
    }
    
    const apptHeaders = apptSheet.getRange(1, 1, 1, apptSheet.getLastColumn()).getValues()[0];
    const colId = apptHeaders.indexOf('ID') >= 0 ? apptHeaders.indexOf('ID') : apptHeaders.indexOf('AppointmentID');
    const colStatus = apptHeaders.indexOf('Status');
    
    if (colId < 0 || colStatus < 0) {
      return { success: false, error: 'Required columns not found in Appointments sheet' };
    }
    
    const apptValues = apptSheet.getDataRange().getValues();
    for (let i = 1; i < apptValues.length; i++) {
      if (String(apptValues[i][colId]).trim() === apptId) {
        apptSheet.getRange(i + 1, colStatus + 1).setValue('Completed');
        Logger.log('✅ Marked appointment ' + apptId + ' as Completed');
        break;
      }
    }
    
    // Step 2: Create service report record
    const reportId = 'SR-' + Date.now();
    const now = new Date();
    const srSheet = ss.getSheetByName('Service Reports') || ss.insertSheet('Service Reports');
    
    if (srSheet.getLastRow() === 0) {
      srSheet.appendRow([
        'Report ID', 'Customer Name', 'Customer Email', 'Customer ID', 'Service Date', 'Service Type',
        'Status', 'Notes', 'Start Time', 'End Time', 'Technician', 'Created Date', 'Photos URL',
        'Photos Count', 'Draft Invoice ID', 'Final Invoice ID', 'Checklist JSON', 'Pool Details JSON',
        'Linked Appointment ID'
      ]);
    }
    
    srSheet.appendRow([
      reportId,
      data.customerName || '',
      customerEmail,
      '',
      data.serviceDate || new Date().toLocaleDateString(),
      'Weekly Service',
      'Completed',
      data.workPerformed || '',
      data.startTime || '',
      data.endTime || '',
      Session.getEffectiveUser().getEmail() || 'System',
      now.toISOString(),
      '',
      (data.photos && data.photos.length) || 0,
      '',
      '',
      JSON.stringify(data.checklist || {}),
      JSON.stringify({
        poolCondition: data.poolCondition || '',
        issuesFound: data.issuesFound || '',
        recommendations: data.recommendations || ''
      }),
      apptId
    ]);
    
    Logger.log('✅ Created service report: ' + reportId);
    
    // Step 3: Send email to customer
    if (customerEmail) {
      const emailBody = buildServiceReportEmail_(data, reportId);
      GmailApp.sendEmail(customerEmail, 'Service Report - A Quality Pool Company', emailBody, {
        htmlBody: emailBody
      });
      Logger.log('✅ Sent service report email to ' + customerEmail);
    }
    
    return { 
      success: true, 
      reportId: reportId,
      message: 'Service report saved and sent to customer!'
    };
  } catch (error) {
    Logger.log('❌ completeServiceReport error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Build HTML email for service report completion.
 */
function buildServiceReportEmail_(data, reportId) {
  const waterLevelData = data.waterLevelData || {};
  const waterLevel = String(waterLevelData.level || '').trim();
  const waterSummary = waterLevel
    ? ('<h3 style="margin:16px 0 8px 0;color:#0f172a;font-size:14px;font-weight:bold;text-transform:uppercase;">Water Level</h3>'
      + '<p style="margin:0 0 8px 0;color:#4b5563;line-height:1.6;"><strong>Upon arrival:</strong> ' + waterLevel + '</p>'
      + (waterLevel === 'Low' ? ('<p style="margin:0 0 8px 0;color:#4b5563;line-height:1.6;"><strong>Advised customer:</strong> ' + (waterLevelData.advisedCustomerLow ? 'Yes' : 'No') + '</p>') : '')
      + (waterLevel === 'Below skimmer'
        ? ('<p style="margin:0 0 8px 0;color:#4b5563;line-height:1.6;"><strong>Hose connected:</strong> '
            + (waterLevelData.hoseConnected === true ? 'Yes' : (waterLevelData.hoseConnected === false ? 'No' : 'Not specified'))
            + '</p>'
            + (waterLevelData.hoseStartTime ? '<p style="margin:0 0 8px 0;color:#4b5563;line-height:1.6;"><strong>Hose start:</strong> ' + waterLevelData.hoseStartTime + '</p>' : '')
            + (waterLevelData.hoseEndTime ? '<p style="margin:0 0 8px 0;color:#4b5563;line-height:1.6;"><strong>Hose off time:</strong> ' + waterLevelData.hoseEndTime + '</p>' : '')
            + (waterLevelData.customerDirectedNote ? '<p style="margin:0 0 8px 0;color:#4b5563;line-height:1.6;"><strong>Customer direction:</strong> ' + waterLevelData.customerDirectedNote + '</p>' : ''))
        : ''))
    : '';

  const waterWarningBlock = data.waterHoseWarningUnconfirmed
    ? '<div style="margin:14px 0;padding:12px;border:2px solid #f59e0b;background:#fffbeb;border-radius:8px;color:#92400e;font-weight:700;">⚠️ Water hose status unconfirmed at time of completion — please follow up with customer.</div>'
    : '';

  const html = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">'
    + '<div style="background:linear-gradient(135deg,#0284c7,#0369a1);color:white;padding:24px;text-align:center;">'
    + '<h1 style="margin:0;font-size:24px;font-weight:bold;">Service Report Completed</h1>'
    + '<p style="margin:8px 0 0 0;opacity:0.9;">A Quality Pool Company</p>'
    + '</div>'
    + '<div style="padding:24px;color:#1f2937;">'
    + '<p style="margin:0 0 16px 0;font-size:16px;">Thank you for choosing A Quality Pool Company!</p>'
    + '<div style="background:#f9fafb;border-left:4px solid #0284c7;padding:16px;border-radius:4px;margin-bottom:24px;">'
    + '<p style="margin:0 0 8px 0;font-weight:bold;color:#0f172a;">Service Summary</p>'
    + '<p style="margin:4px 0;color:#6b7280;"><strong>Service Date:</strong> ' + (data.serviceDate || new Date().toLocaleDateString()) + '</p>'
    + '<p style="margin:4px 0;color:#6b7280;"><strong>Time:</strong> ' + (data.startTime || '—') + ' to ' + (data.endTime || '—') + '</p>'
    + '<p style="margin:4px 0;color:#6b7280;"><strong>Report ID:</strong> ' + reportId + '</p>'
    + '</div>'
    + '<h3 style="margin:16px 0 8px 0;color:#0f172a;font-size:14px;font-weight:bold;text-transform:uppercase;">Work Performed</h3>'
    + '<p style="margin:0 0 16px 0;color:#4b5563;line-height:1.6;">' + (data.workPerformed || 'Routine maintenance completed') + '</p>'
    + (data.issuesFound ? '<h3 style="margin:16px 0 8px 0;color:#0f172a;font-size:14px;font-weight:bold;text-transform:uppercase;">Issues Found</h3><p style="margin:0 0 16px 0;color:#dc2626;line-height:1.6;">' + data.issuesFound + '</p>' : '')
    + waterSummary
    + waterWarningBlock
    + (data.recommendations ? '<h3 style="margin:16px 0 8px 0;color:#0f172a;font-size:14px;font-weight:bold;text-transform:uppercase;">Recommendations</h3><p style="margin:0 0 16px 0;color:#4b5563;line-height:1.6;">' + data.recommendations + '</p>' : '')
    + '<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;">'
    + '<p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;">Questions? Contact us anytime!</p>'
    + '</div>'
    + '</div>'
    + '</div>';
  return html;
}

function buildQuoteCompletionEmail_(data, reportId, photoSections) {
  photoSections = photoSections || {};
  const allPhotos = [].concat(photoSections.before || []).concat(photoSections.after || []);
  let photoGrid = '';
  if (allPhotos.length) {
    let cells = '';
    allPhotos.forEach(function(p) {
      const src = String((p && (p.thumbnailUrl || p.url)) || '');
      const href = String((p && p.url) || src);
      if (!src) return;
      cells += '<a href="' + href + '" target="_blank" style="display:inline-block;width:120px;height:90px;overflow:hidden;border:1px solid #e2e8f0;border-radius:8px;margin:0 8px 8px 0;">'
        + '<img src="' + src + '" alt="Site photo" style="width:100%;height:100%;object-fit:cover;display:block;" />'
        + '</a>';
    });
    photoGrid = '<h3 style="margin:18px 0 8px 0;color:#0f172a;font-size:14px;font-weight:700;text-transform:uppercase;">Site Photos</h3>'
      + '<div style="display:flex;flex-wrap:wrap;">' + cells + '</div>';
  }

  return '<div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">'
    + '<div style="background:linear-gradient(135deg,#0284c7,#0369a1);color:white;padding:24px;text-align:center;">'
    + '<h1 style="margin:0;font-size:24px;font-weight:bold;">Site Visit Complete ✓</h1>'
    + '<p style="margin:8px 0 0 0;opacity:0.9;">A Quality Pool Company</p>'
    + '</div>'
    + '<div style="padding:24px;color:#1f2937;">'
    + '<p style="margin:0 0 14px 0;font-size:16px;">Thank you for meeting with us! Your site visit is complete.</p>'
    + '<p style="margin:0 0 16px 0;color:#374151;line-height:1.7;">You will receive your quote within <strong>7–10 business days</strong>.</p>'
    + '<div style="background:#f9fafb;border-left:4px solid #0284c7;padding:14px;border-radius:4px;margin-bottom:16px;">'
    + '<p style="margin:4px 0;color:#6b7280;"><strong>Site Visit Date:</strong> ' + (data.serviceDate || new Date().toLocaleDateString()) + '</p>'
    + '<p style="margin:4px 0;color:#6b7280;"><strong>Address:</strong> ' + (data.address || '—') + '</p>'
    + '<p style="margin:4px 0;color:#6b7280;"><strong>Representative:</strong> ' + (data.technician || data.repName || 'A Quality Pool Company') + '</p>'
    + '<p style="margin:4px 0;color:#6b7280;"><strong>Reference ID:</strong> ' + reportId + '</p>'
    + '</div>'
    + photoGrid
    + '<div style="margin-top:22px;padding-top:16px;border-top:1px solid #e5e7eb;">'
    + '<p style="margin:0;font-size:13px;color:#6b7280;text-align:center;">Questions? Call (502) 706-9172 or email samr@aqualitypoolcompanyusa.com</p>'
    + '</div></div></div>';
}

function driveFileIdFromUrl_(url) {
  try {
    const s = String(url || '').trim();
    if (!s) return '';
    var m = s.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (m && m[1]) return m[1];
    m = s.match(/[a-zA-Z0-9_-]{25,}/);
    return (m && m[0]) ? m[0] : '';
  } catch (e) {
    return '';
  }
}

function isAutopayActiveForAppointment_(appt) {
  try {
    if (!appt) return false;
    const apptStatus = String(appt.autopayStatus || '').toLowerCase();
    if (apptStatus === 'active') return true;
    if (String(appt.stripePaymentMethodId || '').trim()) return true;

    const profile = getAutopayProfile_(String(appt.companyId || DEFAULT_COMPANY_ID || '').trim(), String(appt.customerEmail || '').trim());
    if (!profile) return false;
    const profileStatus = String(profile.autopayStatus || '').toLowerCase();
    if (profileStatus === 'active') return true;
    return !!(String(profile.stripeCustomerId || '').trim() && String(profile.stripePaymentMethodId || '').trim());
  } catch (e) {
    return false;
  }
}

function resolveCustomerFolderForAppointment_(appt) {
  if (!appt) throw new Error('Appointment is required');

  // Reuse existing customer-folder logic if present in the project.
  if (typeof getOrCreateCustomerFolder === 'function') {
    try {
      const folderResult = getOrCreateCustomerFolder(String(appt.customerName || '').trim(), String(appt.address || '').trim());
      if (folderResult && typeof folderResult.createFile === 'function') {
        return folderResult;
      }
      if (folderResult && folderResult.success && folderResult.folderId) {
        return DriveApp.getFolderById(String(folderResult.folderId));
      }
      if (folderResult && folderResult.folderId) {
        return DriveApp.getFolderById(String(folderResult.folderId));
      }
    } catch (existingLogicErr) {
      Logger.log('resolveCustomerFolderForAppointment_ existing logic fallback: ' + existingLogicErr.toString());
    }
  }

  const props = PropertiesService.getScriptProperties();
  const rootFolderId = String(
    props.getProperty('CUSTOMER_DRIVE_FOLDER_ID')
      || (typeof CUSTOMER_DRIVE_FOLDER_ID !== 'undefined' ? CUSTOMER_DRIVE_FOLDER_ID : '')
      || WS_CONTRACT_DRIVE_FOLDER_ID
  ).trim();
  if (!rootFolderId) throw new Error('Customer Drive root folder ID not configured');

  const root = DriveApp.getFolderById(rootFolderId);
  const customerName = String(appt.customerName || 'Customer').trim() || 'Customer';
  const address = String(appt.address || 'No Address').trim() || 'No Address';
  const folderName = customerName.replace(/[\\/:*?"<>|]+/g, '_') + ' - ' + address.replace(/[\\/:*?"<>|]+/g, '_');

  const exact = root.getFoldersByName(folderName);
  if (exact.hasNext()) return exact.next();

  return root.createFolder(folderName);
}

function saveChecklistPhotosForAppointment(payload) {
  try {
    payload = payload || {};
    const appointmentId = String(payload.appointmentId || '').trim();
    if (!appointmentId) return { success: false, error: 'appointmentId is required', before: [], after: [], failures: [] };

    // Preflight Drive permission check so we fail fast with a clear message.
    try {
      DriveApp.getRootFolder().getId();
    } catch (permErr) {
      const msg = String(permErr && permErr.toString ? permErr.toString() : permErr || '');
      if (/permissions are not sufficient|authorization/i.test(msg)) {
        return {
          success: false,
          fatalAuthError: true,
          error: 'Drive authorization is missing for photo uploads. Re-authorize the script and re-deploy the web app.',
          before: [],
          after: [],
          failures: []
        };
      }
      throw permErr;
    }

    const apptRes = getScheduledAppointments();
    if (!apptRes || !apptRes.success) return { success: false, error: (apptRes && apptRes.error) || 'Unable to load appointments', before: [], after: [], failures: [] };
    const foundAppt = (apptRes.appointments || []).find(function(a) { return String(a.id || '') === appointmentId; });

    // Allow pre-save uploads (e.g., Drop-in) by using explicit payload customer data.
    const appt = foundAppt || {
      id: appointmentId,
      customerName: String(payload.customerName || '').trim(),
      address: String(payload.address || '').trim(),
      serviceType: String(payload.serviceType || 'Service').trim()
    };
    if (!String(appt.customerName || '').trim()) {
      return { success: false, error: 'Customer name is required for photo folder routing', before: [], after: [], failures: [] };
    }

    const customerFolder = resolveCustomerFolderForAppointment_(appt);
    const serviceRootName = 'Service Photos';
    let serviceRoot = null;
    const rootIter = customerFolder.getFoldersByName(serviceRootName);
    serviceRoot = rootIter.hasNext() ? rootIter.next() : customerFolder.createFolder(serviceRootName);

    const serviceType = String(payload.serviceType || appt.serviceType || 'Service').trim();
    const dateStamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
    const apptFolderName = appointmentId + ' - ' + serviceType + ' - ' + dateStamp;
    let apptFolder = null;
    const apptFolderIter = serviceRoot.getFoldersByName(apptFolderName);
    apptFolder = apptFolderIter.hasNext() ? apptFolderIter.next() : serviceRoot.createFolder(apptFolderName);

    const beforeFolderIter = apptFolder.getFoldersByName('Before');
    const beforeFolder = beforeFolderIter.hasNext() ? beforeFolderIter.next() : apptFolder.createFolder('Before');
    const afterFolderIter = apptFolder.getFoldersByName('After');
    const afterFolder = afterFolderIter.hasNext() ? afterFolderIter.next() : apptFolder.createFolder('After');

    const results = { success: true, before: [], after: [], failures: [] };

    function saveOne_(photo, section, index) {
      const fileName = String((photo && photo.fileName) || (section + '_' + (index + 1) + '.jpg')).trim() || (section + '_' + (index + 1) + '.jpg');
      try {
        const dataUrl = String((photo && photo.dataUrl) || '');
        const base64 = dataUrl.indexOf(',') >= 0 ? dataUrl.split(',')[1] : '';
        if (!base64) throw new Error('Missing image data');

        const mime = String((photo && photo.mimeType) || 'image/jpeg');
        const safeName = (appointmentId + '_' + serviceType + '_' + section + '_' + String(index + 1) + '_' + fileName).replace(/[\/:*?"<>|]+/g, '_');
        const blob = Utilities.newBlob(Utilities.base64Decode(base64), mime, safeName);
        const folder = section === 'before' ? beforeFolder : afterFolder;
        const file = folder.createFile(blob);
        try {
          file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        } catch (shareErr) {
          Logger.log('saveChecklistPhotosForAppointment sharing warning: ' + shareErr.toString());
        }

        const out = {
          section: section,
          localId: String((photo && photo.localId) || ''),
          fileId: file.getId(),
          fileName: fileName,
          url: file.getUrl(),
          webViewLink: 'https://drive.google.com/file/d/' + file.getId() + '/view?usp=sharing',
          publicUrl: 'https://drive.google.com/file/d/' + file.getId() + '/view?usp=sharing',
          downloadUrl: 'https://drive.google.com/uc?export=download&id=' + file.getId(),
          thumbnailUrl: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w600'
        };
        if (section === 'before') results.before.push(out);
        else results.after.push(out);
      } catch (err) {
        results.failures.push({
          section: section,
          localId: String((photo && photo.localId) || ''),
          fileName: fileName,
          error: err.toString()
        });
      }
    }

    const before = Array.isArray(payload.beforePhotos) ? payload.beforePhotos : [];
    const after = Array.isArray(payload.afterPhotos) ? payload.afterPhotos : [];
    before.forEach(function(photo, idx) { saveOne_(photo, 'before', idx); });
    after.forEach(function(photo, idx) { saveOne_(photo, 'after', idx); });

    try {
      const beforeCount = (results.before || []).length;
      const afterCount = (results.after || []).length;
      if ((beforeCount || afterCount) && foundAppt) {
        appendCalendarEventLogForAppointment_(appointmentId, 'Photos uploaded: ' + beforeCount + ' before, ' + afterCount + ' after');
      }
    } catch (auditErr) {
      Logger.log('saveChecklistPhotosForAppointment calendar audit append failed: ' + auditErr.toString());
    }

    results.folderUrl = apptFolder.getUrl();
    return results;
  } catch (e) {
    Logger.log('saveChecklistPhotosForAppointment error: ' + e.toString());
    return { success: false, error: e.toString(), before: [], after: [], failures: [] };
  }
}

function buildBeforeAfterPhotosEmailSection_(photoSections) {
  try {
    photoSections = photoSections || {};
    const before = Array.isArray(photoSections.before) ? photoSections.before : [];
    const after = Array.isArray(photoSections.after) ? photoSections.after : [];
    if (!before.length && !after.length) return '';

    function linkListHtml(title, photos) {
      if (!photos.length) return '';
      let items = '';
      photos.forEach(function(p, idx) {
        const href = String((p && (p.publicUrl || p.webViewLink || p.url)) || '').trim();
        const name = String((p && p.fileName) || ('Photo ' + (idx + 1))).trim();
        if (!href) return;
        items += '<li style="margin-bottom:6px;"><a href="' + href + '" target="_blank" style="color:#0ea5e9;word-break:break-all;">'
          + title + ' ' + (idx + 1) + ' — ' + name + '</a></li>';
      });
      if (!items) return '';
      return '<div style="margin-top:10px;font-size:12px;color:#334155;">'
        + '<div style="font-weight:700;color:#0f172a;margin-bottom:4px;">' + title + ' shared links</div>'
        + '<ul style="margin:0;padding-left:18px;">' + items + '</ul></div>';
    }

    function colHtml(title, photos) {
      if (!photos.length) {
        return '<div style="flex:1;min-width:220px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px;">'
          + '<div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:8px;">' + title + '</div>'
          + '<div style="font-size:12px;color:#64748b;">No photos uploaded</div></div>';
      }
      let images = '';
      photos.forEach(function(p) {
        const src = String((p && (p.thumbnailUrl || p.url)) || '');
        const href = String((p && p.url) || src);
        const name = String((p && p.fileName) || 'Photo');
        if (!src) return;
        images += '<a href="' + href + '" target="_blank" style="display:inline-block;width:110px;height:84px;overflow:hidden;border-radius:8px;border:1px solid #dbeafe;text-decoration:none;background:#f8fafc;">'
          + '<img src="' + src + '" alt="' + name + '" style="width:100%;height:100%;object-fit:cover;display:block;" />'
          + '</a>';
      });
      return '<div style="flex:1;min-width:220px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px;">'
        + '<div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:8px;">' + title + '</div>'
        + '<div style="display:flex;flex-wrap:wrap;gap:8px;">' + images + '</div>'
        + '</div>';
    }

    return '<div style="margin-top:18px;padding:14px;border:1px solid #c7d2fe;background:#f8faff;border-radius:12px;">'
      + '<h3 style="margin:0 0 10px 0;color:#1e3a8a;font-size:15px;">Before &amp; After Photos</h3>'
      + '<div style="display:flex;flex-wrap:wrap;gap:10px;">'
      + colHtml('Before', before)
      + colHtml('After', after)
      + '</div>'
      + linkListHtml('Before', before)
      + linkListHtml('After', after)
      + '</div>';
  } catch (e) {
    Logger.log('buildBeforeAfterPhotosEmailSection_ error: ' + e.toString());
    return '';
  }
}

function buildPhotoLinksText_(photoSections) {
  try {
    photoSections = photoSections || {};
    const before = Array.isArray(photoSections.before) ? photoSections.before : [];
    const after = Array.isArray(photoSections.after) ? photoSections.after : [];
    const bits = [];

    function addLinks(sectionName, photos) {
      photos.forEach(function(p, idx) {
        const href = String((p && (p.publicUrl || p.webViewLink || p.url)) || '').trim();
        const name = String((p && p.fileName) || ('Photo ' + (idx + 1))).trim();
        if (!href) return;
        bits.push(sectionName + ' ' + (idx + 1) + ' (' + name + '): ' + href);
      });
    }

    addLinks('Before', before);
    addLinks('After', after);

    return bits.join('\n');
  } catch (e) {
    Logger.log('buildPhotoLinksText_ error: ' + e.toString());
    return '';
  }
}

function buildChecklistEmailSection_(checklistData) {
  if (!checklistData) return '';
  var items = checklistData.checklistItemsForEmail
    || (checklistData.checklist && checklistData.checklist.itemsForEmail)
    || [];
  if (!items.length && checklistData.checklist && checklistData.checklist.items) {
    var raw = checklistData.checklist.items;
    if (Array.isArray(raw)) items = raw;
    else if (raw && typeof raw === 'object') {
      items = Object.keys(raw).map(function(k) {
        return { key: k, label: k, checked: !!raw[k], required: false, na: false };
      });
    }
  }
  if (!items || !items.length) return '';
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  var rows = items.map(function(item) {
    var label = esc(item.label || item.key || '');
    var state = item.na ? 'N/A' : (item.checked ? 'Done' : (item.required ? 'Not checked' : '—'));
    return '<tr><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">' + label + '</td><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">' + state + '</td></tr>';
  }).join('');
  return '<div style="margin:16px 0;"><h3 style="margin:0 0 8px 0;font-size:16px;">Completion checklist</h3><table style="width:100%;border-collapse:collapse;font-size:14px;">' + rows + '</table></div>';
}

function appendCompletionPhotoBlobs_(mailOptions, photoSections) {
  if (!mailOptions || !photoSections) return;
  var groups = [];
  ['before', 'after'].forEach(function(k) {
    if (photoSections[k] && photoSections[k].length) groups = groups.concat(photoSections[k]);
  });
  if (photoSections.photos && photoSections.photos.length) groups = groups.concat(photoSections.photos);
  var attached = 0;
  var maxPhotos = 8;
  groups.forEach(function(photo) {
    if (attached >= maxPhotos || !photo) return;
    try {
      var fileId = photo.fileId || '';
      if (!fileId) {
        var url = photo.url || photo.webViewLink || photo.publicUrl || photo.downloadUrl || '';
        if (url && typeof driveFileIdFromUrl_ === 'function') fileId = driveFileIdFromUrl_(url);
      }
      if (!fileId) return;
      var blob = DriveApp.getFileById(fileId).getBlob();
      blob.setName(photo.fileName || photo.name || ('photo_' + (attached + 1)));
      if (!mailOptions.attachments) mailOptions.attachments = [];
      mailOptions.attachments.push(blob);
      attached++;
    } catch (photoErr) {
      Logger.log('⚠️ completion photo attach: ' + photoErr.toString());
    }
  });
}

function sendServiceReportEmailForAppointment(appointmentId, payload) {
  try {
    const result = getScheduledAppointments();
    if (!result || !result.success) return { success: false, error: (result && result.error) || 'Unable to load appointments' };

    const appt = (result.appointments || []).find(function(a) { return String(a.id || '') === String(appointmentId || ''); });
    if (!appt) return { success: false, error: 'Appointment not found' };

    const customerEmail = String(appt.customerEmail || '').trim();
    if (!customerEmail) return { success: false, error: 'Customer email missing on appointment' };

    payload = payload || {};
    const reportId = String(payload.reportId || ('SR-' + Date.now())).trim();
    const checklistData = payload.checklistData || {};
    const serviceTypeRaw = String(payload.serviceType || appt.serviceType || '').toLowerCase();
    const appointmentTypeRaw = String(payload.appointmentType || appt.appointmentType || '').toLowerCase();
    const isQuoteCompletion = /(estimate|quote|site visit)/i.test(serviceTypeRaw) || /(estimate|quote)/i.test(appointmentTypeRaw);
    const invoiceId = String(payload.invoiceId || '').trim();
    const serviceDate = String(payload.serviceDate || appt.date || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MM/dd/yyyy'));
    const includeBeforeAfterPhotos = payload.includeBeforeAfterPhotos === true;
    const photoSections = payload.photoSections || {};
    const photoLinksText = includeBeforeAfterPhotos ? buildPhotoLinksText_(photoSections) : '';
    const waterLevelData = payload.waterLevelData || (checklistData && checklistData.waterLevel) || {};
    const waterHoseWarningUnconfirmed = payload.waterHoseWarningUnconfirmed === true
      || (String(waterLevelData.level || '') === 'Below skimmer'
          && !!String(waterLevelData.hoseStartTime || '')
          && !String(waterLevelData.hoseEndTime || '')
          && !String(waterLevelData.customerDirectedNote || '').trim());

    var invoiceSummary = null;
    if (invoiceId) {
      const inv = getInvoiceSummaryById_(invoiceId);
      if (inv && inv.success) invoiceSummary = inv;

      // Ensure invoice PDF exists so we can attach it to the service report email.
      // If missing, force InvoiceEstimate send workflow to generate PDF/payment metadata.
      if (!invoiceSummary || !invoiceSummary.pdfUrl) {
        try {
          const sendRes = sendInvoiceWithStripe(invoiceId, customerEmail);
          Logger.log('sendServiceReportEmailForAppointment: forced invoice send result for PDF generation: ' + JSON.stringify(sendRes || {}));
        } catch (sendErr) {
          Logger.log('sendServiceReportEmailForAppointment: forced invoice send failed: ' + sendErr.toString());
        }

        // Re-read summary after forced send.
        Utilities.sleep(500);
        const invAfterSend = getInvoiceSummaryById_(invoiceId);
        if (invAfterSend && invAfterSend.success) invoiceSummary = invAfterSend;
      }

      // If invoice was requested, enforce PDF availability for attachment.
      if (!invoiceSummary || !invoiceSummary.pdfUrl) {
        Logger.log('⚠️ Invoice PDF could not be generated for attachment; sending completion email without it');
      }
    }

    const isWeekly = /pool service|weekly/i.test(String(appt.serviceType || '')) || String(appt.recurring || '').toLowerCase() === 'weekly';
    const autopayActive = isAutopayActiveForAppointment_(appt);
    const paymentLink = (invoiceSummary && (invoiceSummary.paymentLink || invoiceSummary.shareLink)) ? String(invoiceSummary.paymentLink || invoiceSummary.shareLink) : '';
    const includePaymentLink = !!(isWeekly && !autopayActive && paymentLink);

    const emailData = {
      serviceDate: serviceDate,
      startTime: String(appt.time || payload.startTime || ''),
      endTime: String(payload.endTime || ''),
      workPerformed: checklistData.workPerformed || payload.workPerformed || '',
      issuesFound: checklistData.issuesFound || payload.issuesFound || '',
      recommendations: payload.recommendations || '',
      customerName: String(appt.customerName || ''),
      address: String(appt.address || payload.address || ''),
      technician: String(payload.technician || payload.repName || appt.assignedTo || ''),
      invoiceId: invoiceId,
      invoiceLink: (invoiceSummary && invoiceSummary.shareLink) ? String(invoiceSummary.shareLink) : '',
      paymentLink: includePaymentLink ? paymentLink : '',
      waterLevelData: waterLevelData,
      waterHoseWarningUnconfirmed: waterHoseWarningUnconfirmed
    };

    let html = '';
    if (isQuoteCompletion) {
      html = buildQuoteCompletionEmail_(emailData, reportId, (includeBeforeAfterPhotos || (photoSections && (photoSections.before || photoSections.after))) ? photoSections : {});
    } else {
      html = buildServiceReportEmail_(emailData, reportId);
      if (includeBeforeAfterPhotos) {
        const photoSectionHtml = buildBeforeAfterPhotosEmailSection_(photoSections);
        if (photoSectionHtml) {
          html = html.replace(/<\/div><\/div>\s*$/, photoSectionHtml + '</div></div>');
        }
      }
    }
    if (!isQuoteCompletion && invoiceId) {
      const invoiceHtml = '<div style="margin-top:16px;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">'
        + '<p style="margin:0 0 6px 0;color:#0f172a;font-size:14px;"><strong>Invoice:</strong> ' + invoiceId + '</p>'
        + (emailData.invoiceLink ? '<p style="margin:0 0 6px 0;font-size:13px;"><a href="' + emailData.invoiceLink + '">View invoice</a></p>' : '')
        + (emailData.paymentLink ? '<p style="margin:0;font-size:13px;"><a href="' + emailData.paymentLink + '"><strong>Pay now</strong></a></p>' : '')
        + '</div>';
      html = html.replace(/<\/div><\/div>\s*$/, invoiceHtml + '</div></div>');
    }

    if (photoLinksText) {
      const photoLinksHtml = '<div style="margin-top:16px;padding:12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;">'
        + '<p style="margin:0 0 8px 0;color:#1e3a8a;font-size:14px;font-weight:700;">Photo shared links</p>'
        + '<div style="font-size:12px;line-height:1.5;color:#0f172a;white-space:pre-wrap;word-break:break-all;">' + photoLinksText + '</div>'
        + '</div>';
      html = html.replace(/<\/div><\/div>\s*$/, photoLinksHtml + '</div></div>');
    }

    // Inject property satellite + street view images
    try {
      var mapsHtml = buildPropertyImagesHtml_(emailData.address);
      if (mapsHtml) {
        html = html.replace(/<\/div><\/div>\s*$/, mapsHtml + '</div></div>');
      }
    } catch (mapsErr) {
      Logger.log('sendServiceReportEmailForAppointment maps: ' + mapsErr);
    }

    // Inject open concerns section if any flagged concerns exist
    try {
      var customerId = String(appt.customerId || appt.id || '').trim();
      if (customerId) {
        var concRes = loadOpenConcerns(customerId);
        if (concRes && concRes.concerns && concRes.concerns.length) {
          var concHtml = '<div style="margin-top:16px;padding:12px;background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;">'
            + '<p style="margin:0 0 6px 0;font-size:13px;font-weight:700;color:#92400e;">⚠️ Concerns noted during service:</p>'
            + '<ul style="margin:0;padding-left:18px;">'
            + concRes.concerns.map(function(c){ return '<li style="font-size:13px;color:#0f172a;margin-bottom:4px;">' + String(c.text||'') + ' <span style="font-size:11px;color:#64748b;">[' + String(c.severity||'') + ']</span></li>'; }).join('')
            + '</ul></div>';
          html = html.replace(/<\/div><\/div>\s*$/, concHtml + '</div></div>');
        }
      }
    } catch (concErr) {
      Logger.log('sendServiceReportEmailForAppointment concerns: ' + concErr);
    }

    // Inject review incentive section
    try {
      var reviewHtml = buildReviewIncentiveEmailSection_();
      if (reviewHtml) {
        html = html.replace(/<\/div><\/div>\s*$/, reviewHtml + '</div></div>');
      }
    } catch (reviewErr) {
      Logger.log('sendServiceReportEmailForAppointment review block: ' + reviewErr);
    }

    const checklistSectionHtml = buildChecklistEmailSection_(checklistData);
    if (checklistSectionHtml) {
      html = html.replace(/<\/div><\/div>\s*$/, checklistSectionHtml + '</div></div>');
    }

    const mailOptions = {
      to: customerEmail,
      subject: isQuoteCompletion ? 'Site Visit Completed - A Quality Pool Company' : 'Service Report - A Quality Pool Company',
      htmlBody: html
    };

    if (invoiceSummary && invoiceSummary.pdfUrl) {
      try {
        const fileId = driveFileIdFromUrl_(invoiceSummary.pdfUrl);
        if (fileId) {
          const blob = DriveApp.getFileById(fileId).getBlob();
          blob.setName('Invoice_' + (invoiceSummary.invoiceNumber || invoiceId) + '.pdf');
          mailOptions.attachments = [blob];
        } else if (invoiceId) {
          Logger.log('⚠️ Invoice PDF URL found, but file ID could not be parsed');
        }
      } catch (attachErr) {
        Logger.log('⚠️ Invoice PDF attachment failed: ' + attachErr.toString());
      }
    }

    try {
      appendCompletionPhotoBlobs_(mailOptions, photoSections);
    } catch (photoAttachErr) {
      Logger.log('⚠️ completion photos: ' + photoAttachErr.toString());
    }

    MailApp.sendEmail(mailOptions);

    return {
      success: true,
      emailSent: true,
      paymentLinkIncluded: includePaymentLink,
      invoicePdfAttached: !!(mailOptions.attachments && mailOptions.attachments.length)
    };
  } catch (e) {
    Logger.log('sendServiceReportEmailForAppointment error: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

/**
 * Queue contract print task to Dashboard todo list when weekly service is approved
 * Creates a PM task with link to contract, downloadable PDF, and tracks printing
 */
function queueWeeklyServiceContractTask(contractId, customerName, customerEmail, companyId) {
  try {
    companyId = String(companyId || 'CMP-AQUALITYPOOL').trim();
    const taskTitle = 'Print & File: ' + customerName + ' - Weekly Service Contract';
    const taskNotes = 'Print the weekly service agreement contract for ' + customerName 
      + '.\n\nCustomer Email: ' + customerEmail 
      + '\nContract ID: ' + contractId 
      + '\n\nOnce printed, save digitally and mark task complete. Ensure contracts are kept on file.';
    
    const taskPayload = {
      title: taskTitle,
      projectId: 'CONTRACTS',
      customerName: customerName,
      customerEmail: customerEmail,
      priority: 'High',
      notes: taskNotes,
      linkType: 'Contract',
      linkId: contractId
    };
    
    const result = addPmTask(companyId, taskPayload);
    
    if (result && result.success) {
      Logger.log('✅ Contract print task queued for ' + customerName + ' (Task: ' + result.taskId + ')');
      return { success: true, taskId: result.taskId };
    } else {
      Logger.log('⚠️ Failed to queue contract task: ' + (result && result.error || 'Unknown error'));
      return { success: false, error: result && result.error || 'Task queue failed' };
    }
  } catch (error) {
    Logger.log('❌ queueWeeklyServiceContractTask error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Setup trigger for sending daily 6am appointment reminders.
 * Run this function ONCE to install/update the trigger.
 * Go to Extensions → Triggers in Apps Script to manage it.
 */
function setupDailyAppointmentReminderTrigger() {
  try {
    // Remove existing triggers for this function to avoid duplicates
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(function(trigger) {
      if (trigger.getHandlerFunction() === 'sendTodayAppointmentReminders') {
        ScriptApp.deleteTrigger(trigger);
      }
    });
    
    // Create new trigger for 6am daily
    ScriptApp.newTrigger('sendTodayAppointmentReminders')
      .timeBased()
      .atHour(6)
      .nearMinute(0)
      .everyDays(1)
      .create();
    
    Logger.log('✅ Daily 6am appointment reminder trigger installed');
    return { success: true, message: 'Trigger set to run sendTodayAppointmentReminders() at 6am daily' };
  } catch (error) {
    Logger.log('❌ setupDailyAppointmentReminderTrigger error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Delete ALL future events from configured calendar (from now forward).
 * Safety: pass exact confirmText = 'DELETE FUTURE' to execute.
 * Also clears CalendarEventID on future appointments in the sheet.
 */
function deleteAllFutureCalendarEvents(confirmText) {
  try {
    if (String(confirmText || '').trim() !== 'DELETE FUTURE') {
      return { success: false, error: "Confirmation required. Call deleteAllFutureCalendarEvents('DELETE FUTURE')." };
    }

    const calendar = CalendarApp.getCalendarById(CALENDAR_ID) || CalendarApp.getDefaultCalendar();
    if (!calendar) return { success: false, error: 'Calendar not found' };

    const now = new Date();
    const end = new Date(now.getFullYear() + 5, 11, 31, 23, 59, 59);
    const events = calendar.getEvents(now, end);

    let deleted = 0;
    let failed = 0;
    events.forEach(function(ev) {
      try {
        ev.deleteEvent();
        deleted++;
      } catch (e) {
        failed++;
      }
    });

    // Clear future CalendarEventID references in Appointments sheet
    let clearedIds = 0;
    try {
      const sheet = getOrCreateSheet(APPOINTMENTS_SHEET, APPT_HEADERS);
      const values = sheet.getDataRange().getValues();
      if (values.length > 1) {
        const headers = values[0] || [];
        const colDate = headers.indexOf('Date');
        const colCal = headers.indexOf('CalendarEventID');
        if (colDate >= 0 && colCal >= 0) {
          const todayIso = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');
          for (let i = 1; i < values.length; i++) {
            const apptDate = String(values[i][colDate] || '').trim();
            if (!apptDate) continue;
            if (apptDate >= todayIso && String(values[i][colCal] || '').trim()) {
              sheet.getRange(i + 1, colCal + 1).setValue('');
              clearedIds++;
            }
          }
        }
      }
    } catch (sheetErr) {
      Logger.log('deleteAllFutureCalendarEvents sheet cleanup warning: ' + sheetErr.toString());
    }

    Logger.log('✅ deleteAllFutureCalendarEvents deleted=' + deleted + ' failed=' + failed + ' clearedIds=' + clearedIds);
    return {
      success: true,
      deletedEvents: deleted,
      failedDeletes: failed,
      clearedAppointmentCalendarIds: clearedIds,
      message: 'Deleted ' + deleted + ' future calendar event(s).'
    };
  } catch (error) {
    Logger.log('❌ deleteAllFutureCalendarEvents error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

// ===========================================================================
// CONCERNS SHEET
// ===========================================================================
const CONCERNS_SHEET = 'Concerns';

/** Simple one-shot Telegram alert helper (plain text message to Brooks). */
function sendBrooksTelegramAlert_(text) {
  try {
    sendTelegramBotMessage_(String(text || ''), []);
  } catch (e) {
    Logger.log('sendBrooksTelegramAlert_: ' + e);
  }
}
const CONCERNS_HEADERS = ['ConcernID','AppointmentID','CustomerID','CustomerName','Text','Severity','NeedsFollowUp','TechName','Timestamp','Resolved','ResolvedAt','CreatedAt'];

function getOrCreateConcernsSheet_() {
  return getOrCreateSheet(CONCERNS_SHEET, CONCERNS_HEADERS);
}

/**
 * Save a concern logged during any appointment (called from SchedulingUI).
 * If Urgent, fires a Telegram alert.
 */
function saveConcern(params) {
  try {
    params = params || {};
    const sheet = getOrCreateConcernsSheet_();
    const now = new Date().toISOString();
    const concernId = 'CONCERN-' + Date.now();
    sheet.appendRow([
      concernId,
      String(params.appointmentId || ''),
      String(params.customerId || ''),
      String(params.customerName || ''),
      String(params.text || ''),
      String(params.severity || 'Low'),
      params.needsFollowUp ? 'Yes' : 'No',
      String(params.techName || ''),
      String(params.timestamp || now),
      'No',
      '',
      now
    ]);

    // Telegram alert for Urgent
    if (String(params.severity || '').toLowerCase() === 'urgent') {
      try {
        var alertText = '🚨 URGENT CONCERN LOGGED\n\n'
          + 'Customer: ' + (params.customerName || params.customerId || 'Unknown') + '\n'
          + 'Appointment: ' + (params.appointmentId || 'N/A') + '\n'
          + 'Concern: ' + String(params.text || '') + '\n'
          + 'Follow-up needed: ' + (params.needsFollowUp ? 'Yes' : 'No') + '\n'
          + 'Logged: ' + now;
        sendBrooksTelegramAlert_(alertText);
      } catch (tgErr) {
        Logger.log('saveConcern Telegram: ' + tgErr);
      }
    }
    return { success: true, concernId: concernId };
  } catch (e) {
    Logger.log('saveConcern error: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * Load all open (unresolved, needs-follow-up) concerns for a customer.
 * Called when opening any appointment detail modal or drop-in modal.
 */
function loadOpenConcerns(customerId) {
  try {
    const sheet = getOrCreateConcernsSheet_();
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return { success: true, concerns: [] };
    const headers = data[0];
    const cidCol = headers.indexOf('CustomerID');
    const textCol = headers.indexOf('Text');
    const sevCol = headers.indexOf('Severity');
    const followCol = headers.indexOf('NeedsFollowUp');
    const resolvedCol = headers.indexOf('Resolved');
    const tsCol = headers.indexOf('Timestamp');
    const techCol = headers.indexOf('TechName');
    const apptCol = headers.indexOf('AppointmentID');

    const concerns = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (String(row[cidCol] || '').trim() !== String(customerId || '').trim()) continue;
      if (String(row[resolvedCol] || '').trim().toLowerCase() === 'yes') continue;
      if (String(row[followCol] || '').trim().toLowerCase() !== 'yes') continue;
      concerns.push({
        text: String(row[textCol] || ''),
        severity: String(row[sevCol] || 'Low'),
        needsFollowUp: true,
        techName: String(row[techCol] || ''),
        timestamp: String(row[tsCol] || ''),
        appointmentId: String(row[apptCol] || '')
      });
    }
    return { success: true, concerns: concerns };
  } catch (e) {
    Logger.log('loadOpenConcerns error: ' + e);
    return { success: false, concerns: [], error: e.toString() };
  }
}

// ===========================================================================
// GOOGLE MAPS PROPERTY IMAGES (emails)
// ===========================================================================

/**
 * Build an HTML block with Google Maps satellite + Street View images for an address.
 * Silently omits any image that can't be URL-encoded or if address is blank.
 * Both images use the existing MAPS_API_KEY constant.
 * @param {string} address - Customer street address
 * @returns {string} HTML string ready to embed in an email body, or '' if address missing.
 */
function buildPropertyImagesHtml_(address) {
  try {
    if (!address || !String(address).trim()) return '';
    var addr = String(address).trim();
    var encoded = encodeURIComponent(addr);
    if (!encoded) return '';

    var satUrl = 'https://maps.googleapis.com/maps/api/staticmap'
      + '?center=' + encoded
      + '&zoom=19&size=600x300&maptype=satellite&key=' + MAPS_API_KEY;

    var svUrl = 'https://maps.googleapis.com/maps/api/streetview'
      + '?size=600x300&location=' + encoded + '&key=' + MAPS_API_KEY;

    // Validate Street View availability silently — skip broken images with onerror
    var html = '<div style="margin-top:20px;border-top:1px solid #e2e8f0;padding-top:16px;">'
      + '<h3 style="margin:0 0 12px 0;font-size:14px;font-weight:700;color:#334155;font-family:Arial,sans-serif;">'
      + '<span style="margin-right:6px;">📍</span>Property</h3>'
      + '<table style="width:100%;border-collapse:collapse;border-radius:10px;overflow:hidden;" cellpadding="4" cellspacing="4">'
      + '<tr valign="top">'
      + '<td style="width:50%;padding:4px;">'
      + '<div style="font-size:11px;color:#64748b;margin-bottom:4px;font-family:Arial,sans-serif;">Satellite view</div>'
      + '<img src="' + satUrl + '" alt="Satellite view of ' + addr.replace(/"/g, '') + '"'
      + ' width="100%" style="border-radius:8px;border:1px solid #e2e8f0;display:block;max-width:280px;"'
      + ' onerror="this.parentNode.style.display=\'none\'">'
      + '</td>'
      + '<td style="width:50%;padding:4px;">'
      + '<div style="font-size:11px;color:#64748b;margin-bottom:4px;font-family:Arial,sans-serif;">Street view</div>'
      + '<img src="' + svUrl + '" alt="Street view of ' + addr.replace(/"/g, '') + '"'
      + ' width="100%" style="border-radius:8px;border:1px solid #e2e8f0;display:block;max-width:280px;"'
      + ' onerror="this.parentNode.style.display=\'none\'">'
      + '</td>'
      + '</tr>'
      + '</table>'
      + '<div style="font-size:10px;color:#94a3b8;margin-top:4px;font-family:Arial,sans-serif;">' + addr + '</div>'
      + '</div>';

    return html;
  } catch (e) {
    Logger.log('buildPropertyImagesHtml_ error: ' + e + ' | address: ' + address);
    return '';
  }
}

/**
 * Basic local note enhancer fallback when no AI key is configured or AI call fails.
 */
function normalizeDropInNoteSource_(rawNotes) {
  var txt = String(rawNotes || '').trim();
  if (!txt) return '';
  // Remove repeated leading prefixes like: "Visit summary: Visit summary: ..."
  txt = txt.replace(/^(?:\s*visit\s*summary\s*:\s*)+/i, '');
  txt = txt.replace(/\s+/g, ' ').trim();
  return txt;
}

function enhanceDropInNotesFallback_(rawNotes) {
  var txt = normalizeDropInNoteSource_(rawNotes);
  if (!txt) return '';
  txt = txt
    .replace(/[•\-]+\s*/g, '')
    .replace(/\bopkay\b/ig, 'okay')
    .replace(/\bpreforming\b/ig, 'performing')
    .replace(/\bhayward\b/ig, 'Hayward')
    .replace(/\s*([,;:!?])\s*/g, '$1 ')
    .replace(/\s*\.\s*/g, '. ')
    .replace(/\s+/g, ' ')
    .trim();

  var saltMatch = txt.match(/\bsalt\b[^\d]{0,20}(\d{3,4})/i) || txt.match(/\b(\d{3,4})\b\s*ppm\b/i);
  var fcMatch = txt.match(/\bchlorine\b[^\d]{0,20}(\d+(?:\.\d+)?)/i);
  var hasPumpNoise = /pump\s*basket.*(odd|noise|loud|grind|rattle|whine)/i.test(txt);
  var hasServiceCall = /service\s*call/i.test(txt);
  var asksPermission = /are\s+you\s+okay\s+with\s+this|ok\s+with\s+this|please\s+be\s+advised/i.test(txt);
  
  // Detect work performed
  var workPerformed = [];
  if (/clean|debris|vacuu|skimmed|brushed|swept/i.test(txt)) workPerformed.push('cleaning/maintenance');
  if (/fill|water.*level|refilled/i.test(txt)) workPerformed.push('water level correction');
  if (/brush|scrub|wall|tile/i.test(txt)) workPerformed.push('surface treatment');
  
  // Detect issues/concerns
  var issuesFound = [];
  if (/leak|seeping|dripping|moisture/i.test(txt)) issuesFound.push('water loss detected');
  if (/crack|damage|wear|broken/i.test(txt)) issuesFound.push('structural/equipment damage');
  if (/algae|green|cloudy|discolored/i.test(txt)) issuesFound.push('water clarity issue');
  if (/filter|cartridge|sand/i.test(txt) && /clog|dirty|pressure|bypass/i.test(txt)) issuesFound.push('filtration concern');

  var lines = [];
  lines.push('Visit summary:');
  var summary = [];
  
  if (workPerformed.length) {
    summary.push('Diagnostic inspection and corrective action performed: ' + workPerformed.join(', ') + '.');
  }
  
  if (saltMatch) summary.push('Salt concentration measured at approximately ' + saltMatch[1] + ' ppm.');
  if (fcMatch) summary.push('Free chlorine concentration measured at approximately ' + fcMatch[1] + ' ppm.');
  
  if (issuesFound.length) {
    summary.push('Observation: ' + issuesFound.join('; ') + '.');
    summary.push('Recommend scheduling maintenance to address and prevent escalation.');
  }
  
  if (!summary.length) {
    var base = txt.charAt(0).toUpperCase() + txt.slice(1);
    if (!/[.!?]$/.test(base)) base += '.';
    summary.push(base);
  }
  lines = lines.concat(summary);

  if (hasPumpNoise) lines.push('Pump basket noise was observed; recommend diagnostic inspection of basket seating, lid O-ring seal, suction-side air ingress, and impeller condition.');
  if (hasServiceCall) lines.push('A service call is recommended this week to complete diagnostics and corrective action.');
  if (asksPermission) lines.push('Please confirm authorization to schedule the service call.');

  return lines.join(' ').replace(/\s+/g, ' ').trim();
}

function refineDropInTextFallback_(inputText) {
  var t = normalizeDropInNoteSource_(inputText);
  if (!t) return '';
  // Reuse note fallback rewrite quality for preview refinement.
  return enhanceDropInNotesFallback_(t);
}

function getClaudeModelCandidates_() {
  var configured = String(PropertiesService.getScriptProperties().getProperty('CLAUDE_MODEL') || '').trim();
  var candidates = [];
  if (configured) candidates.push(configured);
  candidates = candidates.concat([
    'claude-sonnet-4-5',
    'claude-haiku-4-5',
    'claude-opus-4-5',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022'
  ]);
  var seen = {};
  return candidates.filter(function(m) {
    var k = String(m || '').trim();
    if (!k || seen[k]) return false;
    seen[k] = true;
    return true;
  });
}

function extractClaudeErrorMessage_(resp) {
  try {
    var body = String(resp && resp.getContentText ? resp.getContentText() : '').trim();
    if (!body) return '';
    var json = JSON.parse(body);
    var msg = String((((json || {}).error || {}).message) || '').trim();
    return msg || body.slice(0, 300);
  } catch (e) {
    return '';
  }
}

function callClaudeText_(apiKey, prompt, maxTokens, temperature) {
  var url = 'https://api.anthropic.com/v1/messages';
  var models = getClaudeModelCandidates_();
  var lastError = 'Claude AI request failed.';

  for (var i = 0; i < models.length; i++) {
    var model = models[i];
    var req = {
      model: model,
      max_tokens: maxTokens,
      temperature: temperature,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
    };

    var resp = UrlFetchApp.fetch(url, {
      method: 'post',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      payload: JSON.stringify(req),
      muteHttpExceptions: true
    });

    var code = resp.getResponseCode();
    if (code >= 200 && code < 300) {
      var json = JSON.parse(resp.getContentText() || '{}');
      var text = String((((json || {}).content || [])[0] || {}).text || '').trim();
      if (text) return { success: true, text: text, model: model };
      lastError = 'Claude AI returned an empty response (' + model + ').';
      continue;
    }

    var detail = extractClaudeErrorMessage_(resp);
    lastError = 'Claude AI request failed (' + code + ') [' + model + ']' + (detail ? ': ' + detail : '.');
  }

  return { success: false, error: lastError };
}

/**
 * Enhance technician notes for customer-facing email.
 * Uses Claude API if CLAUDE_API_KEY script property exists; otherwise falls back to local cleanup.
 */
function enhanceDropInNotesWithAi_(rawNotes, options) {
  options = options || {};
  var requireAi = !!options.requireAi;
  var source = normalizeDropInNoteSource_(rawNotes);
  if (!source) return '';

  var fallback = enhanceDropInNotesFallback_(source);
  try {
    var key = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
    if (!key) {
      if (requireAi) throw new Error('Claude AI is not configured. Set CLAUDE_API_KEY in Script Properties.');
      return fallback;
    }

    // Build chemical context if provided
    var chemLines = [];
    var dosages = options.dosages || {};
    if (parseFloat(dosages.liquidChlorine) > 0) chemLines.push('Added ' + dosages.liquidChlorine + ' gal liquid chlorine');
    if (parseFloat(dosages.muriaticAcid) > 0) chemLines.push('Added ' + dosages.muriaticAcid + ' gal muriatic acid');
    if (parseFloat(dosages.phDown) > 0) chemLines.push('Added ' + dosages.phDown + ' lb pH Down');
    if (parseFloat(dosages.calciumHypo) > 0) chemLines.push('Added ' + dosages.calciumHypo + ' lb calcium hypo');
    if (parseFloat(dosages.saltBags) > 0) chemLines.push('Added ' + dosages.saltBags + ' bag(s) salt');
    var chemContext = chemLines.length ? '\nChemicals added: ' + chemLines.join(', ') + '.' : '';

    var prompt = 'You are a pool service tech sending a quick note to a customer. Rewrite this field note as a clean, plain-English 2-3 sentence visit summary. Be direct and simple — no jargon, no fluff. Start with "Visit summary:". Include what was done, any chemicals added, any issues found, and next steps if needed. Never invent details.\n\nField note: ' + source + chemContext;
    var ai = callClaudeText_(key, prompt, 220, 0.3);
    if (!ai.success) {
      if (requireAi) throw new Error(ai.error || 'Claude AI request failed.');
      return fallback;
    }
    var out = String(ai.text || '').trim();
    if (!out) {
      if (requireAi) throw new Error('Claude AI returned an empty response.');
      return fallback;
    }
    return out;
  } catch (e) {
    Logger.log('enhanceDropInNotesWithAi_ error: ' + e.toString());
    if (requireAi) throw e;
    return fallback;
  }
}

/**
 * Public wrapper for google.script.run calls from the UI.
 */
function enhanceDropInNotesWithAi(rawNotes, options) {
  try {
    var raw = String(rawNotes || '');
    var opts = Object.assign({ requireAi: true }, options || {});
    var enhanced = enhanceDropInNotesWithAi_(raw, opts);
    return {
      success: true,
      enhancedNotes: enhanced,
      originalNotes: raw,
      changed: String(enhanced || '').trim() !== String(raw || '').trim(),
      aiUsed: true
    };
  } catch (e) {
    Logger.log('enhanceDropInNotesWithAi error: ' + e.toString());
    return { success: false, error: e.message || e.toString(), enhancedNotes: '', originalNotes: String(rawNotes || ''), changed: false, aiUsed: false };
  }
}

function buildDropInTextDraft_(payload) {
  payload = payload || {};
  var editedPreview = String(payload.textPreview || '').trim();
  var firstName = String(payload.customerName || 'there').split(' ')[0];
  var reasons = Array.isArray(payload.reasons) ? payload.reasons.filter(Boolean).join(', ') : String(payload.reasons || '');
  var notes = enhanceDropInNotesWithAi_(String(payload.notes || ''));
  var waterLevel = String(payload.waterLevel || '');
  var chemistry = payload.chemistry || null;
  var dosages = payload.dosages || null;
  var photoSections = payload.photoSections || {};

  if (editedPreview) {
    var manualText = editedPreview;
    var photosForManual = [].concat(photoSections.before || [], photoSections.after || []);
    if (photosForManual.length) {
      var linksManual = photosForManual.slice(0, 4).map(function(p) {
        return String((p && (p.publicUrl || p.webViewLink || p.url)) || '').trim();
      }).filter(Boolean);
      if (linksManual.length && !/https?:\/\//i.test(manualText)) {
        manualText += '\n\nPhotos: ' + linksManual.join(' ');
      }
    }
    return manualText;
  }

  var lines = [];
  lines.push('Hi ' + firstName + '! Technical drop-in service update from A Quality Pool Company.');
  if (reasons) lines.push('Service reason: ' + reasons + '.');
  if (waterLevel) lines.push('Water level observed: ' + waterLevel + '.');

  if (chemistry) {
    var chemBits = [];
    if (chemistry.free || chemistry.free === 0 || chemistry.free === '0') chemBits.push('FC ' + chemistry.free + ' ppm');
    if (chemistry.ph || chemistry.ph === 0 || chemistry.ph === '0') chemBits.push('pH ' + chemistry.ph);
    if (chemistry.alk || chemistry.alk === 0 || chemistry.alk === '0') chemBits.push('Alk ' + chemistry.alk + ' ppm');
    if (chemistry.calcium || chemistry.calcium === 0 || chemistry.calcium === '0') chemBits.push('Calcium ' + chemistry.calcium + ' ppm');
    if (chemistry.cya || chemistry.cya === 0 || chemistry.cya === '0') chemBits.push('CYA ' + chemistry.cya + ' ppm');
    if (chemistry.salt || chemistry.salt === 0 || chemistry.salt === '0') chemBits.push('Salt ' + chemistry.salt + ' ppm');
    if (chemBits.length) lines.push('Water chemistry panel: ' + chemBits.join(' • ') + '.');
  }

  if (dosages) {
    var doseBits = [];
    if (parseFloat(dosages.liquidChlorine || 0) > 0) doseBits.push('Liquid Chlorine ' + dosages.liquidChlorine + ' gal');
    if (parseFloat(dosages.muriaticAcid || 0) > 0) doseBits.push('Muriatic Acid ' + dosages.muriaticAcid + ' gal');
    if (parseFloat(dosages.phDown || 0) > 0) doseBits.push('pH Down ' + dosages.phDown + ' lb');
    if (parseFloat(dosages.calciumHypo || 0) > 0) doseBits.push('Calcium Hypo ' + dosages.calciumHypo + ' lb');
    if (parseFloat(dosages.saltBags || 0) > 0) doseBits.push('Salt ' + dosages.saltBags + ' bag(s)');
    if (doseBits.length) lines.push('Chemical dosing applied: ' + doseBits.join(' • ') + '.');
  }

  if (notes) lines.push(notes);

  var photos = [].concat(photoSections.before || [], photoSections.after || []);
  if (photos.length) {
    var links = photos.slice(0, 4).map(function(p) {
      return String((p && (p.publicUrl || p.webViewLink || p.url)) || '').trim();
    }).filter(Boolean);
    if (links.length) lines.push('Photos: ' + links.join(' '));
  }

  lines.push('No charge was applied for this drop-in. Thank you!');
  return lines.join('\n\n');
}

function generateDropInTextPreview(payload) {
  try {
    payload = payload || {};
    var key = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
    if (!key) {
      return { success: false, error: 'Claude AI is not configured. Set CLAUDE_API_KEY in Script Properties.', previewText: '', aiUsed: false };
    }

    var firstName = String(payload.customerName || 'there').split(' ')[0];
    var reasons = Array.isArray(payload.reasons) ? payload.reasons.filter(Boolean).join(', ') : String(payload.reasons || '');
    var waterLevel = String(payload.waterLevel || '');
    var notes = normalizeDropInNoteSource_(String(payload.notes || ''));
    var chemistry = payload.chemistry || null;
    var dosages = payload.dosages || null;

    var chemBits = [];
    if (chemistry) {
      if (chemistry.free || chemistry.free === 0 || chemistry.free === '0') chemBits.push('FC ' + chemistry.free + ' ppm');
      if (chemistry.ph || chemistry.ph === 0 || chemistry.ph === '0') chemBits.push('pH ' + chemistry.ph);
      if (chemistry.alk || chemistry.alk === 0 || chemistry.alk === '0') chemBits.push('Alk ' + chemistry.alk + ' ppm');
      if (chemistry.calcium || chemistry.calcium === 0 || chemistry.calcium === '0') chemBits.push('Calcium ' + chemistry.calcium + ' ppm');
      if (chemistry.cya || chemistry.cya === 0 || chemistry.cya === '0') chemBits.push('CYA ' + chemistry.cya + ' ppm');
      if (chemistry.salt || chemistry.salt === 0 || chemistry.salt === '0') chemBits.push('Salt ' + chemistry.salt + ' ppm');
    }

    var doseBits = [];
    if (dosages) {
      if (parseFloat(dosages.liquidChlorine || 0) > 0) doseBits.push('Liquid Chlorine ' + dosages.liquidChlorine + ' gal');
      if (parseFloat(dosages.muriaticAcid || 0) > 0) doseBits.push('Muriatic Acid ' + dosages.muriaticAcid + ' gal');
      if (parseFloat(dosages.phDown || 0) > 0) doseBits.push('pH Down ' + dosages.phDown + ' lb');
      if (parseFloat(dosages.calciumHypo || 0) > 0) doseBits.push('Calcium Hypo ' + dosages.calciumHypo + ' lb');
      if (parseFloat(dosages.saltBags || 0) > 0) doseBits.push('Salt ' + dosages.saltBags + ' bag(s)');
    }

    var context = [];
    context.push('Customer first name: ' + firstName);
    if (reasons) context.push('Service reason(s): ' + reasons);
    if (waterLevel) context.push('Water level: ' + waterLevel);
    if (chemBits.length) context.push('Water chemistry panel: ' + chemBits.join(' • '));
    if (doseBits.length) context.push('Chemical dosing applied: ' + doseBits.join(' • '));
    if (notes) context.push('Technician notes: ' + notes);

    var prompt = 'You are a pool service tech texting a customer after a drop-in visit. Write a short, friendly 2-3 sentence text message. Be casual and direct — no jargon. Include what was done, any readings if provided, and next steps if needed. Never invent details.\n\nInput data:\n' + context.join('\n');

    var ai = callClaudeText_(key, prompt, 380, 0.25);
    if (!ai.success) {
      return { success: false, error: ai.error || 'Claude AI request failed.', previewText: '', aiUsed: false };
    }

    var previewText = String(ai.text || '').trim();
    if (!previewText) {
      return { success: false, error: 'Claude AI returned an empty response.', previewText: '', aiUsed: false };
    }

    return { success: true, previewText: previewText, aiUsed: true };
  } catch (e) {
    return { success: false, error: e.message || e.toString(), previewText: '', aiUsed: false };
  }
}

function refineDropInTextPreviewWithAi(payload) {
  try {
    payload = payload || {};
    var input = String(payload.textPreview || '').trim();
    if (!input) {
      input = buildDropInTextDraft_(payload);
    }
    if (!input) return { success: false, error: 'No text to refine', refinedText: '', aiUsed: false };

    var key = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
    if (!key) {
      return { success: false, error: 'Claude AI is not configured. Set CLAUDE_API_KEY in Script Properties.', refinedText: '', aiUsed: false };
    }

    var prompt = 'Clean up this pool service text message. Keep it short (2-3 sentences), friendly, and plain English. No jargon or corporate language. Keep all facts exact — never invent. If there\'s an issue, mention the fix needed.\n\nText to refine:\n' + input;

    var ai = callClaudeText_(key, prompt, 380, 0.25);
    if (!ai.success) {
      return { success: false, error: ai.error || 'Claude AI request failed.', refinedText: '', aiUsed: false };
    }

    var refined = String(ai.text || '').trim();

    if (refined) {
      refined = normalizeDropInNoteSource_(refined);
      if (!/^visit summary:/i.test(refined)) refined = 'Visit summary: ' + refined;
    }
    if (!refined) {
      return { success: false, error: 'Claude AI returned an empty response.', refinedText: '', aiUsed: false };
    }
    return { success: true, refinedText: refined, aiUsed: true };
  } catch (e) {
    return { success: false, error: e.message || e.toString(), refinedText: '', aiUsed: false };
  }
}

function refineChecklistFieldWithAi(payload) {
  try {
    payload = payload || {};
    var fieldType = String(payload.fieldType || '').toLowerCase().trim();
    if (fieldType !== 'work' && fieldType !== 'issues') fieldType = 'work';

    var input = normalizeDropInNoteSource_(String(payload.text || ''));
    if (!input) {
      return { success: false, error: 'No text to refine', refinedText: '', aiUsed: false };
    }

    var key = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
    if (!key) {
      return { success: false, error: 'Claude AI is not configured. Set CLAUDE_API_KEY in Script Properties.', refinedText: '', aiUsed: false };
    }

    var serviceType = String(payload.serviceType || '').trim();
    var readings = payload.chemicalReadings || {};
    var dosages = payload.dosages || {};

    var context = [];
    if (serviceType) context.push('Service type: ' + serviceType);

    var readingBits = [];
    if (String(readings.freeChlorine || '').trim()) readingBits.push('FC ' + readings.freeChlorine);
    if (String(readings.pH || '').trim()) readingBits.push('pH ' + readings.pH);
    if (String(readings.alkalinity || '').trim()) readingBits.push('Alk ' + readings.alkalinity);
    if (String(readings.calciumHardness || '').trim()) readingBits.push('Calcium ' + readings.calciumHardness);
    if (String(readings.cya || '').trim()) readingBits.push('CYA ' + readings.cya);
    if (String(readings.salt || '').trim()) readingBits.push('Salt ' + readings.salt);
    if (String(readings.filterPressure || '').trim()) readingBits.push('Filter pressure ' + readings.filterPressure);
    if (readingBits.length) context.push('Readings: ' + readingBits.join(' • '));

    var doseBits = [];
    if (parseFloat(dosages.liquidChlorine || 0) > 0) doseBits.push('Liquid chlorine ' + dosages.liquidChlorine);
    if (parseFloat(dosages.muriaticAcid || 0) > 0) doseBits.push('Muriatic acid ' + dosages.muriaticAcid);
    if (parseFloat(dosages.phDown || 0) > 0) doseBits.push('pH down ' + dosages.phDown);
    if (parseFloat(dosages.calciumHypo || 0) > 0) doseBits.push('Calcium hypo ' + dosages.calciumHypo);
    if (parseFloat(dosages.saltBagsAdded || 0) > 0) doseBits.push('Salt bags added ' + dosages.saltBagsAdded);
    if (doseBits.length) context.push('Chemicals added: ' + doseBits.join(' • '));

    var styleInstruction = (fieldType === 'issues')
      ? 'Rewrite this into a concise "issues/recommendations" note for a customer email. 1-3 sentences. Mention issue observed, risk/impact, and recommended next step. Plain English, no fluff, no jargon, no invented facts.'
      : 'Rewrite this into a concise "work performed" note for a service report email. 1-3 sentences in past tense. Mention what was completed and any measurable actions. Plain English, no fluff, no jargon, no invented facts.';

    var prompt = styleInstruction
      + '\n\nContext:\n' + (context.length ? context.join('\n') : 'No extra context')
      + '\n\nText to rewrite:\n' + input;

    var ai = callClaudeText_(key, prompt, 260, 0.2);
    if (!ai.success) {
      return { success: false, error: ai.error || 'Claude AI request failed.', refinedText: '', aiUsed: false };
    }

    var refined = normalizeDropInNoteSource_(String(ai.text || ''));
    if (!refined) {
      return { success: false, error: 'Claude AI returned an empty response.', refinedText: '', aiUsed: false };
    }

    return { success: true, refinedText: refined, aiUsed: true, fieldType: fieldType };
  } catch (e) {
    return { success: false, error: e.message || e.toString(), refinedText: '', aiUsed: false };
  }
}

function sendDropInTextDraft(payload) {
  try {
    payload = payload || {};
    var appointmentId = String(payload.dropInId || ('DROPIN-' + Date.now())).trim();
    var customerName = String(payload.customerName || '').trim();
    var customerPhone = String(payload.customerPhone || '').trim();
    var customerEmail = String(payload.customerEmail || '').trim();
    var draftText = buildDropInTextDraft_(payload);

    var facts = [
      { label: 'Customer', value: customerName },
      { label: 'Phone', value: customerPhone },
      { label: 'Email', value: customerEmail },
      { label: 'Type', value: 'Drop-in Visit' }
    ];

    return sendBrooksTelegramDraft_(
      appointmentId,
      'DropInTextDraft',
      'Drop-in customer text draft',
      facts,
      draftText,
      '',
      ''
    );
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ===========================================================================
// DROP-IN VISITS
// ===========================================================================

/**
 * Save a drop-in visit record, create a Google Calendar event,
 * send HTML summary email to customer, and send Telegram notification.
 * Drop-in visits are stored in the Appointments sheet with type "Drop-in" and $0 charge.
 * @param {Object} payload - Form data from SchedulingUI
 */
function saveDropInVisit(payload) {
  try {
    payload = payload || {};
    const now = new Date();
    const nowIso = now.toISOString();
    const apptId = String(payload.dropInId || ('DROPIN-' + Date.now())).trim();

    // Parse timestamp
    var visitTs = payload.timestamp ? new Date(payload.timestamp) : now;
    var visitDate = Utilities.formatDate(visitTs, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var visitTime = Utilities.formatDate(visitTs, Session.getScriptTimeZone(), 'HH:mm');

    var customerName = String(payload.customerName || '');
    var customerEmail = String(payload.customerEmail || '').trim();
    var customerPhone = String(payload.customerPhone || '');
    var address = String(payload.address || '');
    var customerId = String(payload.customerId || '');
    var reasons = (payload.reasons || []).join(', ');
    var notes = String(payload.notes || '');
    var enhancedNotes = enhanceDropInNotesWithAi_(notes);
    var waterLevel = String(payload.waterLevel || '');
    var chemistry = payload.chemistry || null;
    var dosages = payload.dosages || null;
    var hose = payload.hose || {};
    var photoSections = payload.photoSections || {};
    var includePhotosInEmail = !!payload.includePhotosInEmail;

    // Build summary notes
    var summaryParts = ['Drop-in visit. Reason: ' + reasons];
    if (waterLevel) summaryParts.push('Water level: ' + waterLevel);
    if (enhancedNotes) summaryParts.push(enhancedNotes);
    if (chemistry) {
      var chemBits = [];
      if (chemistry.free) chemBits.push('Cl ' + chemistry.free);
      if (chemistry.ph) chemBits.push('pH ' + chemistry.ph);
      if (chemistry.alk) chemBits.push('Alk ' + chemistry.alk);
      if (chemistry.salt) chemBits.push('Salt ' + chemistry.salt + ' ppm');
      if (chemBits.length) summaryParts.push('Water chemistry: ' + chemBits.join(' | '));
    }
    if (dosages) {
      var doseBits = [];
      if (parseFloat(dosages.liquidChlorine) > 0) doseBits.push('Liquid Cl ' + dosages.liquidChlorine + ' gal');
      if (parseFloat(dosages.muriaticAcid) > 0) doseBits.push('Muriatic Acid ' + dosages.muriaticAcid + ' gal');
      if (parseFloat(dosages.phDown) > 0) doseBits.push('pH Down ' + dosages.phDown + ' lb');
      if (parseFloat(dosages.calciumHypo) > 0) doseBits.push('Cal Hypo ' + dosages.calciumHypo + ' lb');
      if (parseFloat(dosages.saltBags) > 0) doseBits.push('Salt ' + dosages.saltBags + ' bag(s)');
      if (doseBits.length) summaryParts.push('Chemicals added: ' + doseBits.join(', '));
    }
    var fullNotes = summaryParts.join('\n');

    // 1. Save to Appointments sheet
    const sheet = getOrCreateSheet(APPOINTMENTS_SHEET, getAppointmentsHeaders());
    var calEventId = '';

    // Create Google Calendar event
    try {
      var cal = CalendarApp.getCalendarById(CALENDAR_ID) || CalendarApp.getDefaultCalendar();
      var evTitle = 'Drop-in: ' + customerName;
      var evStart = new Date(visitTs.getTime());
      var evEnd = new Date(evStart.getTime() + 30 * 60000); // 30 min default
      var evDesc = fullNotes
        + '\n\nAddress: ' + address
        + '\nCustomer email: ' + customerEmail
        + '\nCustomer phone: ' + customerPhone
        + '\n\n[No charge — drop-in visit]';
      var ev = cal.createEvent(evTitle, evStart, evEnd, { description: evDesc });
      calEventId = ev.getId();
    } catch (calErr) {
      Logger.log('saveDropInVisit calendar: ' + calErr);
    }

    const row = [
      apptId,
      String(payload.companyId || DEFAULT_COMPANY_ID),
      customerId,
      customerName,
      customerEmail,
      customerPhone,
      address,
      'Drop-in',           // serviceType
      'Drop-in',           // appointmentType
      '',                  // customAppointmentNote
      visitDate,
      visitTime,
      30,                  // duration minutes
      reasons,             // description
      '',                  // assignedTo
      'Completed',         // status
      0,                   // estimatedCost
      0,                   // amountPaid
      fullNotes,           // notes
      'none',              // recurring
      'No',                // notifyCustomer
      'Yes',               // completed
      calEventId,
      'No',
      '',                  // linkedInvoiceId
      nowIso,
      nowIso,
      '',                  // linkedProjectId
      'N/A',               // paidStatus
      '', '', '', '', '', ''
    ];
    sheet.appendRow(row);

    // 2. Send HTML email to customer
    var emailSent = false;
    if (customerEmail) {
      try {
        var emailHtml = buildDropInSummaryEmail_({
          customerName: customerName,
          address: address,
          visitDate: Utilities.formatDate(visitTs, Session.getScriptTimeZone(), 'MMMM dd, yyyy'),
          visitTime: Utilities.formatDate(visitTs, Session.getScriptTimeZone(), 'h:mm a'),
          reasons: reasons,
          notes: enhancedNotes,
          originalNotes: notes,
          waterLevel: waterLevel,
          hose: hose,
          chemistry: chemistry,
          dosages: dosages,
          photoSections: photoSections,
          openConcerns: []
        });
        MailApp.sendEmail({
          to: customerEmail,
          subject: 'Drop-in Visit Summary — A Quality Pool Company',
          htmlBody: emailHtml
        });
        emailSent = true;
      } catch (emailErr) {
        Logger.log('saveDropInVisit email: ' + emailErr);
      }
    }

    var textDraftSent = false;

    // 3. Optional: send customer text draft to Brooks Telegram
    if (payload.sendTextDraftOnSave === true) {
      try {
        var draftRes = sendDropInTextDraft({
          dropInId: apptId,
          customerName: customerName,
          customerPhone: customerPhone,
          customerEmail: customerEmail,
          reasons: payload.reasons || [],
          notes: notes,
          waterLevel: waterLevel,
          chemistry: chemistry,
          dosages: dosages,
          photoSections: photoSections
        });
        textDraftSent = !!(draftRes && draftRes.success);
      } catch (draftErr) {
        Logger.log('saveDropInVisit text draft: ' + draftErr);
      }
    }

    // 4. Telegram notification
    try {
      var tgText = '🏃 Drop-in Visit Logged\n\n'
        + 'Customer: ' + customerName + '\n'
        + 'Address: ' + address + '\n'
        + 'Time: ' + Utilities.formatDate(visitTs, Session.getScriptTimeZone(), 'MM/dd/yyyy h:mm a') + '\n'
        + 'Reason: ' + reasons + '\n'
        + (waterLevel ? 'Water level: ' + waterLevel + '\n' : '')
        + (chemistry ? 'Chemistry taken ✓\n' : '')
        + (dosages ? 'Chemicals added ✓\n' : '')
        + (enhancedNotes ? '\nNotes: ' + enhancedNotes : '');
      sendBrooksTelegramAlert_(tgText);
    } catch (tgErr) {
      Logger.log('saveDropInVisit Telegram: ' + tgErr);
    }

    return { success: true, apptId: apptId, emailSent: emailSent, textDraftSent: textDraftSent };
  } catch (e) {
    Logger.log('saveDropInVisit error: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * Build the HTML email for a drop-in visit summary.
 */
function buildDropInSummaryEmail_(data) {
  var d = data || {};
  var firstName = (d.customerName || 'there').split(' ')[0];
  var propertyImages = buildPropertyImagesHtml_(d.address);
  var logoUrl = WS_CONTRACT_LETTERHEAD_LOGO_URL;

  var chemHtml = '';
  if (d.chemistry) {
    var c = d.chemistry;
    var rows = '';
    if (c.free) rows += '<tr><td style="padding:4px 0;color:#64748b;width:160px;">Free Chlorine</td><td>' + c.free + ' ppm</td></tr>';
    if (c.ph) rows += '<tr><td style="padding:4px 0;color:#64748b;">pH</td><td>' + c.ph + '</td></tr>';
    if (c.alk) rows += '<tr><td style="padding:4px 0;color:#64748b;">Total Alkalinity</td><td>' + c.alk + ' ppm</td></tr>';
    if (c.calcium) rows += '<tr><td style="padding:4px 0;color:#64748b;">Calcium Hardness</td><td>' + c.calcium + ' ppm</td></tr>';
    if (c.cya) rows += '<tr><td style="padding:4px 0;color:#64748b;">CYA / Stabilizer</td><td>' + c.cya + ' ppm</td></tr>';
    if (c.salt) rows += '<tr><td style="padding:4px 0;color:#64748b;">Salt</td><td>' + c.salt + ' ppm</td></tr>';
    if (rows) {
      chemHtml = '<div style="margin-top:16px;"><h3 style="font-size:14px;color:#0369a1;margin:0 0 8px 0;">Water Chemistry</h3>'
        + '<table style="width:100%;border-collapse:collapse;">' + rows + '</table></div>';
    }
  }

  var doseHtml = '';
  if (d.dosages) {
    var dos = d.dosages;
    var doseBits = [];
    if (parseFloat(dos.liquidChlorine) > 0) doseBits.push('Liquid Chlorine: ' + dos.liquidChlorine + ' gal');
    if (parseFloat(dos.muriaticAcid) > 0) doseBits.push('Muriatic Acid: ' + dos.muriaticAcid + ' gal');
    if (parseFloat(dos.phDown) > 0) doseBits.push('pH Down: ' + dos.phDown + ' lb');
    if (parseFloat(dos.calciumHypo) > 0) doseBits.push('Calcium Hypo: ' + dos.calciumHypo + ' lb');
    if (parseFloat(dos.saltBags) > 0) doseBits.push('Salt: ' + dos.saltBags + ' bag(s)');
    if (doseBits.length) {
      doseHtml = '<div style="margin-top:16px;"><h3 style="font-size:14px;color:#0369a1;margin:0 0 8px 0;">Chemicals Added</h3>'
        + '<ul style="margin:0;padding-left:20px;">' + doseBits.map(function(b){ return '<li>' + b + '</li>'; }).join('') + '</ul></div>';
    }
  }

  var waterHtml = '';
  if (d.waterLevel) {
    waterHtml = '<div style="margin-top:12px;"><strong>Water level observed:</strong> ' + d.waterLevel + '</div>';
    if (d.hose && d.hose.connected === 'yes') {
      waterHtml += '<div style="margin-top:4px;font-size:13px;color:#64748b;">Hose connected';
      if (d.hose.startTime) waterHtml += ' — started at ' + d.hose.startTime;
      if (d.hose.endTime) waterHtml += ', turned off at ' + d.hose.endTime;
      if (d.hose.customerNote) waterHtml += '. ' + d.hose.customerNote;
      waterHtml += '.</div>';
    }
  }

  var photoHtml = '';
  if (d.photoSections && (d.photoSections.before || d.photoSections.after)) {
    var beforePhotos = (d.photoSections.before || []);
    var afterPhotos = (d.photoSections.after || []);
    var photos = beforePhotos.concat(afterPhotos);
    if (photos.length) {
      var tile = function(p, label) {
        var src = String((p && (p.thumbnailUrl || p.url)) || '').trim();
        var href = String((p && p.url) || src).trim();
        if (!src) return '';
        return '<a href="' + href + '" target="_blank" style="display:inline-block;text-decoration:none;">'
          + '<div style="position:relative;width:140px;height:105px;overflow:hidden;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;">'
          + '<img src="' + src + '" alt="Drop-in photo" style="width:100%;height:100%;object-fit:cover;display:block;" />'
          + '<span style="position:absolute;left:6px;bottom:6px;background:rgba(15,23,42,.75);color:#fff;font-size:10px;padding:2px 6px;border-radius:999px;">' + label + '</span>'
          + '</div></a>';
      };
      var beforeTiles = beforePhotos.slice(0, 6).map(function(p){ return tile(p, 'Before'); }).join('');
      var afterTiles = afterPhotos.slice(0, 6).map(function(p){ return tile(p, 'After'); }).join('');
      photoHtml = '<div style="margin-top:16px;"><h3 style="font-size:14px;color:#0369a1;margin:0 0 8px 0;">Photos from today\'s visit</h3>'
        + '<div style="display:flex;flex-wrap:wrap;gap:8px;">' + beforeTiles + afterTiles + '</div></div>';
    }
  }

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
    + '<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;">'
    + '<div style="max-width:600px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 20px rgba(0,0,0,.06);">'
    + '<div style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:24px 28px;">'
    + '<div style="margin-bottom:10px;"><img src="' + logoUrl + '" alt="A Quality Pool Company" style="height:42px;max-width:220px;object-fit:contain;display:block;" /></div>'
    + '<div style="color:white;font-size:20px;font-weight:700;margin-bottom:4px;">🏃 Drop-in Visit Summary</div>'
    + '<div style="color:rgba(255,255,255,.85);font-size:13px;">A Quality Pool Company</div>'
    + '</div>'
    + '<div style="padding:24px 28px;">'
    + '<p style="margin:0 0 16px 0;color:#0f172a;font-size:15px;">Hello ' + firstName + ',</p>'
    + '<p style="margin:0 0 16px 0;color:#334155;font-size:14px;">We stopped by your property today for a quick check-in. Here\'s a summary of our drop-in visit.</p>'
    + '<table style="width:100%;border-collapse:collapse;margin-bottom:16px;"><tbody>'
    + '<tr><td style="padding:6px 0;color:#64748b;font-size:13px;width:140px;">Date</td><td style="font-size:13px;font-weight:600;color:#0f172a;">' + (d.visitDate || '') + ' at ' + (d.visitTime || '') + '</td></tr>'
    + '<tr><td style="padding:6px 0;color:#64748b;font-size:13px;">Reason</td><td style="font-size:13px;color:#0f172a;">' + (d.reasons || '') + '</td></tr>'
    + (d.address ? '<tr><td style="padding:6px 0;color:#64748b;font-size:13px;">Location</td><td style="font-size:13px;color:#0f172a;">' + d.address + '</td></tr>' : '')
    + '</tbody></table>'
    + (d.notes ? '<div style="margin-bottom:16px;padding:12px;background:#f8fafc;border-radius:8px;font-size:13px;color:#334155;">' + d.notes + '</div>' : '')
    + waterHtml
    + chemHtml
    + doseHtml
    + photoHtml
    + propertyImages
    + buildReviewIncentiveEmailSection_()
    + '<div style="margin-top:20px;padding:12px;background:#f0fdf4;border-radius:8px;font-size:13px;color:#166534;border:1px solid #bbf7d0;">'
    + '✅ <strong>No charge</strong> — This was a complimentary drop-in visit. No invoice has been generated.'
    + '</div>'
    + '<p style="margin:20px 0 0 0;font-size:13px;color:#64748b;">If you have any questions, please don\'t hesitate to reach out.<br><br>— A Quality Pool Company</p>'
    + '</div>'
    + '<div style="background:#f1f5f9;padding:16px 28px;text-align:center;font-size:11px;color:#94a3b8;">A Quality Pool Company &nbsp;|&nbsp; aqualitypoolcompanyusa.com</div>'
    + '</div></body></html>';
}



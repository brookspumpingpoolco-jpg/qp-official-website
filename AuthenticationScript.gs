/**
 * Universal Authentication System for Google Apps Script
 * 
 * This script handles authentication, account creation, email verification,
 * password reset, and admin approval workflows via Google Sheets.
 * 
 * SETUP INSTRUCTIONS:
 * 1. Run AuthenticationSheetSetup.gs to create the sheet structure
 * 2. Deploy this script as a Web App
 * 3. Set Execute as: Me
 * 4. Set Who has access: Anyone
 * 5. Copy the Web App URL and use it in your HTML files
 * 
 * FEATURES:
 * - Email verification every 23 hours
 * - Admin approval for new accounts
 * - Forgot password with verification code
 * - Universal system for different companies
 * - HTML formatted emails with logo
 */

// Configuration
const SPREADSHEET_ID = '1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0';
const AUTH_SHEET_NAME = 'Authentication';
const JOBS_SHEET_NAME = 'Jobs';
const LOGO_URL = 'https://cdn.prod.website-files.com/6931dc4e8e97334e195432df/6931dca5c5fb5c5fc0860f2c_test.png';
const COMPANY_NAME = 'A Quality Pool Company';
const COMPANY_EMAIL = 'brookspumpingpoolco@gmail.com';
const COMPANY_PHONE = '502-706-9172';
const VERIFICATION_HOURS = 23; // Hours before verification expires

// Square API Configuration
const SQUARE_ACCESS_TOKEN = 'REDACTED';
const SQUARE_API_VERSION = '2024-12-18';
const SQUARE_ENVIRONMENT = 'production';
const SQUARE_LOCATION_ID = 'LDNXGCDY0JZXC'; // Your Square location ID

// Twilio SMS Configuration (for notifications)
const TWILIO_ACCOUNT_SID = null; // Add your Twilio Account SID if you want SMS
const TWILIO_AUTH_TOKEN = null;  // Add your Twilio Auth Token if you want SMS
const TWILIO_PHONE = '+15027069172'; // Your Twilio phone number

// Stripe API Configuration
const STRIPE_SECRET_KEY = 'REDACTED';
const STRIPE_API_URL = 'https://api.stripe.com/v1';

// Telegram Configuration for Account Approval Notifications
const BROOKS_TELEGRAM_BOT_TOKEN = '8771014327:AAEHRAZGb1YI_KDsIQqy8plBx_QOd5Cduzw';
const BROOKS_TELEGRAM_CHAT_ID = '8255928481'; // Brooks' personal Telegram user ID
const APPROVAL_NOTIFICATIONS_SHEET = 'Approval Notifications'; // Track notification history

/**
 * Handle OPTIONS requests for CORS preflight
 * Note: CORS headers are automatically handled by Google Apps Script
 * when Web App is deployed with "Anyone" access
 */
function doOptions(e) {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);
}

// ========================================
// TELEGRAM NOTIFICATION FUNCTIONS
// ========================================

/**
 * Send Telegram notification to admin about new pending account
 */
function sendApprovalNotificationTelegram(userName, userEmail, companyName) {
  try {
    const token = BROOKS_TELEGRAM_BOT_TOKEN;
    const chatId = BROOKS_TELEGRAM_CHAT_ID;
    
    if (!token || !chatId) {
      Logger.log('Telegram config missing. Token: ' + (token ? 'set' : 'missing') + ', ChatID: ' + (chatId ? 'set' : 'missing'));
      return { success: false, error: 'Telegram not configured' };
    }
    
    // Build dashboard link
    const dashboardUrl = ScriptApp.getService().getUrl() + '?action=dashboard';
    
    // Format message
    const message = '<b>New Account Pending Approval</b>\n\n' +
      '👤 <b>Name:</b> ' + escapeHtml(userName) + '\n' +
      '📧 <b>Email:</b> ' + escapeHtml(userEmail) + '\n' +
      '🏢 <b>Company:</b> ' + escapeHtml(companyName) + '\n' +
      '⏰ <b>Requested:</b> ' + new Date().toLocaleString() + '\n\n' +
      '⚠️ <i>Action required: Please review and approve this account</i>';
    
    const url = 'https://api.telegram.org/bot' + token + '/sendMessage';
    
    const payload = {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };
    
    // Add inline button for dashboard
    payload.reply_markup = JSON.stringify({
      inline_keyboard: [[
        { text: '✓ Review in Dashboard', url: dashboardUrl }
      ]]
    });
    
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      payload: payload,
      muteHttpExceptions: true
    });
    
    const status = response.getResponseCode();
    const body = response.getContentText() || '';
    
    if (status >= 200 && status < 300) {
      Logger.log('Approval notification sent to Telegram successfully');
      return { success: true };
    } else {
      Logger.log('Telegram send failed: ' + status + ' ' + body);
      return { success: false, error: 'HTTP ' + status };
    }
  } catch (error) {
    Logger.log('Telegram notification error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Send reminder notification if account still pending
 */
function sendApprovalReminderTelegram(userName, userEmail, hoursWaiting) {
  try {
    const token = BROOKS_TELEGRAM_BOT_TOKEN;
    const chatId = BROOKS_TELEGRAM_CHAT_ID;
    
    if (!token || !chatId) {
      return { success: false, error: 'Telegram not configured' };
    }
    
    const dashboardUrl = ScriptApp.getService().getUrl() + '?action=dashboard';
    
    const message = '⏳ <b>Account Approval Reminder</b>\n\n' +
      '👤 <b>Name:</b> ' + escapeHtml(userName) + '\n' +
      '📧 <b>Email:</b> ' + escapeHtml(userEmail) + '\n' +
      '⏱️ <b>Waiting for:</b> ' + hoursWaiting + ' hours\n\n' +
      '❗ <i>This account is still pending approval</i>';
    
    const url = 'https://api.telegram.org/bot' + token + '/sendMessage';
    
    const payload = {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };
    
    payload.reply_markup = JSON.stringify({
      inline_keyboard: [[
        { text: '✓ Approve Now', url: dashboardUrl }
      ]]
    });
    
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      payload: payload,
      muteHttpExceptions: true
    });
    
    const status = response.getResponseCode();
    
    if (status >= 200 && status < 300) {
      Logger.log('Approval reminder sent at ' + hoursWaiting + ' hours');
      return { success: true };
    } else {
      return { success: false, error: 'HTTP ' + status };
    }
  } catch (error) {
    Logger.log('Reminder error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Log approval notification to tracking sheet
 */
function logApprovalNotification(email, name, action, hoursElapsed) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let notifSheet = ss.getSheetByName(APPROVAL_NOTIFICATIONS_SHEET);
    
    // Create sheet if it doesn't exist
    if (!notifSheet) {
      notifSheet = ss.insertSheet(APPROVAL_NOTIFICATIONS_SHEET);
      const headers = ['Date/Time', 'User Email', 'User Name', 'Action', 'Hours Elapsed', 'Status', 'Telegram Sent'];
      notifSheet.appendRow(headers);
      // Format header
      const headerRange = notifSheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#0369a1');
      headerRange.setFontColor('#ffffff');
    }
    
    const row = [
      new Date(),
      email,
      name,
      action, // 'Created', 'Reminder-6h', 'Reminder-12h', 'Reminder-24h', 'Approved', 'Rejected'
      hoursElapsed || 0,
      'Logged',
      'Yes'
    ];
    
    notifSheet.appendRow(row);
    Logger.log('Notification logged for ' + email);
    
  } catch (error) {
    Logger.log('Error logging notification: ' + error.toString());
  }
}

/**
 * Escape HTML for Telegram messages
 */
function escapeHtml(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Send message via Telegram Bot API
 */
function sendTelegramBotMessage_(htmlText, buttons) {
  try {
    const token = BROOKS_TELEGRAM_BOT_TOKEN;
    const chatId = BROOKS_TELEGRAM_CHAT_ID;
    
    if (!token || !chatId) {
      return { success: false, error: 'Telegram not configured' };
    }
    
    const url = 'https://api.telegram.org/bot' + token + '/sendMessage';
    
    const payload = {
      chat_id: chatId,
      text: htmlText,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };
    
    // Add buttons if provided
    if (buttons && buttons.length > 0) {
      const validButtons = buttons.filter(btn => btn && btn.text && btn.url);
      if (validButtons.length > 0) {
        payload.reply_markup = JSON.stringify({
          inline_keyboard: validButtons.map(btn => [
            { text: String(btn.text), url: String(btn.url) }
          ])
        });
      }
    }
    
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      payload: payload,
      muteHttpExceptions: true
    });
    
    const status = response.getResponseCode();
    
    if (status >= 200 && status < 300) {
      return { success: true };
    } else {
      Logger.log('Telegram API error: ' + status + ' ' + response.getContentText());
      return { success: false, error: 'HTTP ' + status };
    }
  } catch (error) {
    Logger.log('Telegram send error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Main doPost function - handles all POST requests
 * Supports both JSON and form-encoded data
 */
function doPost(e) {
  try {
    // CRITICAL: Log immediately to verify function is called
    Logger.log('=== doPost FUNCTION CALLED ===');
    Logger.log('Timestamp: ' + new Date().toISOString());
    Logger.log('Event object exists: ' + (e ? 'YES' : 'NO'));
    
    // Handle case where e might be undefined
    if (!e) {
      e = {};
      Logger.log('WARNING: Event object e was null/undefined, created empty object');
    }
    
    // Check for Stripe webhook (raw POST data with JSON)
    if (e.postData && e.postData.type && e.postData.type.includes('application/json') && e.postData.contents) {
      try {
        const webhookData = JSON.parse(e.postData.contents);
        if (webhookData.type && (webhookData.type.startsWith('checkout.session') || webhookData.type === 'checkout.session.completed')) {
          Logger.log('Stripe webhook detected: ' + webhookData.type);
          const result = handleStripeTrialWebhook(webhookData);
          return ContentService.createTextOutput(JSON.stringify(result))
            .setMimeType(ContentService.MimeType.JSON);
        }
      } catch (webhookError) {
        Logger.log('Webhook parse error (not a webhook): ' + webhookError.toString());
        // Continue with normal processing
      }
    }
    
    // Ensure e.parameter exists
    if (!e.parameter) {
      e.parameter = {};
      Logger.log('WARNING: e.parameter was null/undefined, created empty object');
    }
    
    Logger.log('Parameters received: ' + JSON.stringify(e.parameter));
    Logger.log('PostData exists: ' + (e.postData ? 'YES' : 'NO'));
    if (e.postData) {
      Logger.log('PostData type: ' + (e.postData.type || 'none'));
      Logger.log('PostData contents length: ' + (e.postData.contents ? e.postData.contents.length : 0));
    }
    
    let data = {};
    let action = '';
    
    // Check parameters first (most common for form-encoded POST from UrlFetchApp)
    // When UrlFetchApp sends payload as object, it becomes available in e.parameter
    if (e.parameter && e.parameter.action) {
      action = e.parameter.action;
      Logger.log('Action from e.parameter: ' + action);
      Object.keys(e.parameter).forEach(key => {
        if (key !== 'action') {
          // Handle array values (like features)
          const value = e.parameter[key];
          if (typeof value === 'string' && (value.startsWith('[') || value.startsWith('{'))) {
            try {
              data[key] = JSON.parse(value);
            } catch (parseError) {
              data[key] = value;
            }
          } else {
            data[key] = value;
          }
        }
      });
      Logger.log('Data from e.parameter: ' + JSON.stringify(data));
    }
    // Then check postData (for JSON or form-encoded in body)
    else if (e.postData && e.postData.contents) {
      const contentType = e.postData.type || '';
      Logger.log('Processing postData with contentType: ' + contentType);
      if (contentType.indexOf('application/json') !== -1) {
        // JSON data
        try {
          data = JSON.parse(e.postData.contents);
          action = data.action;
          Logger.log('Parsed JSON data, action: ' + action);
        } catch (parseError) {
          Logger.log('JSON parse error: ' + parseError.toString());
          return createResponse(false, 'Invalid JSON in request body: ' + parseError.toString());
        }
      } else {
        // Form-encoded data in body - parse it
        try {
          const params = e.postData.contents.split('&');
          params.forEach(param => {
            if (!param) return;
            // Split only on first '=' so base64/password values with '=' are not truncated
            const eq = param.indexOf('=');
            const rawKey = eq >= 0 ? param.substring(0, eq) : param;
            const rawVal = eq >= 0 ? param.substring(eq + 1) : '';
            let decodedKey;
            let decodedValue;
            try {
              decodedKey = decodeURIComponent(rawKey.replace(/\+/g, ' '));
              decodedValue = decodeURIComponent(rawVal.replace(/\+/g, ' '));
            } catch (decErr) {
              decodedKey = rawKey;
              decodedValue = rawVal;
            }
            if (decodedKey === 'action') {
              action = decodedValue;
            } else if (decodedKey) {
              // Try to parse JSON values
              if (decodedValue.startsWith('[') || decodedValue.startsWith('{')) {
                try {
                  data[decodedKey] = JSON.parse(decodedValue);
                } catch (parseError) {
                  data[decodedKey] = decodedValue;
                }
              } else {
                data[decodedKey] = decodedValue;
              }
            }
          });
          Logger.log('Parsed form-encoded data, action: ' + action);
        } catch (parseError) {
          Logger.log('Form-encoded parse error: ' + parseError.toString());
          return createResponse(false, 'Invalid form-encoded data: ' + parseError.toString());
        }
      }
    }
    
    if (!action) {
      Logger.log('ERROR: No action found in request');
      return createResponse(false, 'Action is required');
    }
    
    Logger.log('Processing action: ' + action);
    
    let result;
    switch(action) {
      case 'login':
        result = handleLogin(data);
        break;
      // Aliases used by some embedded / customer-portal clients
      case 'authenticate':
        result = handleLogin(data);
        break;
      case 'register':
        result = handleRegister(data);
        break;
      case 'signup':
        result = handleRegister(data);
        break;
      case 'oauthAuth':
        result = createResponse(
          false,
          'OAuth sign-in is not handled on this endpoint. Use action "login" with email and password, or complete Google sign-in in the client and call a dedicated OAuth handler if configured.'
        );
        break;
      case 'verifyEmail':
        result = handleVerifyEmail(data);
        break;
      case 'forgotPassword':
        result = handleForgotPassword(data);
        break;
      case 'resetPassword':
        result = handleResetPassword(data);
        break;
      case 'checkVerification':
        result = handleCheckVerification(data);
        break;
      case 'getPendingAccounts':
        result = handleGetPendingAccounts(data);
        break;
      case 'approveAccount':
        result = handleApproveAccount(data);
        break;
      case 'rejectAccount':
        result = handleRejectAccount(data);
        break;
      case 'cancelSubscription':
        result = handleCancelSubscription(data);
        break;
      case 'updateTrialEndDate':
        result = updateTrialEndDate(data.email, data.newTrialEndDate);
        break;
      case 'getJobs':
        result = handleGetJobs(data);
        break;
      case 'createJob':
        result = handleCreateJob(data);
        break;
      case 'updateJob':
        result = handleUpdateJob(data);
        break;
      case 'deleteJob':
        result = handleDeleteJob(data);
        break;
      case 'getJobStats':
        result = handleGetJobStats(data);
        break;
      case 'getSquareCustomers':
        result = handleGetSquareCustomers(data);
        break;
      case 'getSquareAppointments':
        result = handleGetSquareAppointments(data);
        break;
      case 'syncSquareAppointments':
        result = handleSyncSquareAppointments(data);
        break;
      case 'getTechnicians':
        result = handleGetTechnicians(data);
        break;
      case 'getRouteOptimization':
        result = handleGetRouteOptimization(data);
        break;
      case 'getStripeEarnings':
        result = handleGetStripeEarnings(data);
        break;
      case 'getSquareSettings':
        result = handleGetSquareSettings(data);
        break;
      case 'saveSquareSettings':
        result = handleSaveSquareSettings(data);
        break;
      case 'importSquareCustomers':
        result = handleImportSquareCustomers(data);
        break;
      default:
        result = createResponse(false, 'Invalid action');
    }
    
    // CRITICAL: Ensure result is always JSON, never HTML
    if (!result) {
      Logger.log('ERROR: Handler returned null/undefined result');
      result = createResponse(false, 'Handler returned no result');
    }
    
    // Verify result is a TextOutput with JSON MIME type
    if (typeof result.getContent !== 'function' || result.getMimeType() !== ContentService.MimeType.JSON) {
      Logger.log('WARNING: Result is not proper JSON TextOutput. Converting...');
      try {
        const content = result.getContent ? result.getContent() : JSON.stringify(result || {});
        // Check if content is HTML
        if (typeof content === 'string' && (content.trim().startsWith('<') || content.includes('<!DOCTYPE') || content.includes('<html'))) {
          Logger.log('ERROR: Handler returned HTML instead of JSON!');
          result = createResponse(false, 'Handler returned HTML instead of JSON');
        } else {
          result = ContentService.createTextOutput(typeof content === 'string' ? content : JSON.stringify(content))
            .setMimeType(ContentService.MimeType.JSON);
        }
      } catch (convertError) {
        Logger.log('ERROR converting result: ' + convertError.toString());
        result = createResponse(false, 'Response conversion error: ' + convertError.toString());
      }
    }
    
    Logger.log('doPost returning result with MIME type: ' + result.getMimeType());
    try {
      var _outStr = result.getContent();
      Logger.log('doPost outgoing body length: ' + (_outStr ? _outStr.length : 0));
      if (_outStr && _outStr.length > 0) {
        Logger.log('doPost outgoing head (400 chars): ' + _outStr.substring(0, 400));
      }
    } catch (_logOutErr) {
      Logger.log('doPost could not log outgoing body: ' + _logOutErr);
    }
    return result;
  } catch (error) {
    Logger.log('=== doPost ERROR ===');
    Logger.log('Error message: ' + error.toString());
    Logger.log('Error stack: ' + (error.stack || 'No stack trace'));
    Logger.log('Error name: ' + (error.name || 'Unknown'));
    
    // Make sure we always return JSON, not HTML
    try {
      const errorResponse = createResponse(false, 'Server error: ' + error.toString());
      Logger.log('Error response created successfully');
      return errorResponse;
    } catch (responseError) {
      // If createResponse fails, return raw JSON
      Logger.log('createResponse also failed: ' + responseError.toString());
      Logger.log('createResponse error stack: ' + (responseError.stack || 'No stack trace'));
      
      try {
        const fallbackResponse = ContentService.createTextOutput(JSON.stringify({
          success: false,
          message: 'Server error: ' + error.toString()
        })).setMimeType(ContentService.MimeType.JSON);
        Logger.log('Fallback JSON response created');
        return fallbackResponse;
      } catch (finalError) {
        Logger.log('FATAL: Even fallback response failed: ' + finalError.toString());
        // Last resort - return plain text JSON
        return ContentService.createTextOutput('{"success":false,"message":"Critical server error"}')
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
  }
}

/**
 * Main doGet function - handles GET requests
 */
function doGet(e) {
  // CRITICAL LOGGING - Log IMMEDIATELY at function start
  // This helps verify the function is even being called
  try {
    Logger.log('========================================');
    Logger.log('=== doGet FUNCTION CALLED ===');
    Logger.log('Timestamp: ' + new Date().toISOString());
    Logger.log('Event object exists: ' + (e ? 'YES' : 'NO'));
    Logger.log('Parameters received: ' + JSON.stringify(e && e.parameter ? e.parameter : 'NO PARAMETERS'));
    Logger.log('========================================');
  } catch (logError) {
    // Even if logging fails, try to continue
    try {
      Utilities.sleep(100); // Small delay to ensure log is written
      Logger.log('Initial logging failed: ' + logError.toString());
    } catch (e2) {
      // Ignore if logging completely fails
    }
  }
  
  try {
    // Ensure e exists
    if (!e) {
      e = { parameter: {} };
      Logger.log('WARNING: Event object e was null/undefined, created empty object');
    }
    if (!e.parameter) {
      e.parameter = {};
      Logger.log('WARNING: e.parameter was null/undefined, created empty object');
    }
    
    const action = e.parameter.action;
    const file = e.parameter.file;
    const page = e.parameter.page;
    const proxy = e.parameter.proxy;
    
    Logger.log('Parsed values - action: ' + action + ', file: ' + file + ', page: ' + page + ', proxy: ' + proxy);
    
    // Test endpoint - simple health check
    if (action === 'ping' || action === 'test' || action === 'health') {
      Logger.log('Test/health endpoint called');
      return createResponse(true, 'Script is working! Timestamp: ' + new Date().toISOString(), {
        script: 'AuthenticationScript',
        deployed: true,
        timestamp: new Date().toISOString()
      });
    }
    
    // Handle proxy requests - route GET requests with proxy=true to POST handlers
    // CRITICAL: If proxy=true, we MUST return JSON, never HTML
    if (proxy === 'true') {
      if (!action) {
        Logger.log('ERROR: proxy=true but no action provided');
        return createResponse(false, 'Action is required when using proxy mode');
      }
      Logger.log('Processing proxy request for action: ' + action);
      
      // Convert GET parameters to data object (same format as doPost)
      const data = {};
      Object.keys(e.parameter).forEach(key => {
        if (key !== 'action' && key !== 'proxy') {
          data[key] = e.parameter[key];
        }
      });
      
      Logger.log('Proxy data object: ' + JSON.stringify(data));
      
      // Route to the same handlers as doPost
      let result;
      switch(action) {
        case 'login':
          result = handleLogin(data);
          break;
        case 'authenticate':
          result = handleLogin(data);
          break;
        case 'register':
          result = handleRegister(data);
          break;
        case 'signup':
          result = handleRegister(data);
          break;
        case 'oauthAuth':
          result = createResponse(
            false,
            'OAuth sign-in is not handled on this endpoint. Use action "login" with email and password, or complete Google sign-in in the client and call a dedicated OAuth handler if configured.'
          );
          break;
        case 'verifyEmail':
          result = handleVerifyEmail(data);
          break;
        case 'forgotPassword':
          result = handleForgotPassword(data);
          break;
        case 'resetPassword':
          result = handleResetPassword(data);
          break;
        case 'checkVerification':
          result = handleCheckVerification(data);
          break;
        case 'getPendingAccounts':
          result = handleGetPendingAccounts(data);
          break;
        case 'approveAccount':
          result = handleApproveAccount(data);
          break;
        case 'rejectAccount':
          result = handleRejectAccount(data);
          break;
        case 'cancelSubscription':
          result = handleCancelSubscription(data);
          break;
        case 'updateTrialEndDate':
          result = updateTrialEndDate(data.email, data.newTrialEndDate);
          break;
        case 'getJobs':
          result = handleGetJobs(data);
          break;
        case 'createJob':
          result = handleCreateJob(data);
          break;
        case 'updateJob':
          result = handleUpdateJob(data);
          break;
        case 'deleteJob':
          result = handleDeleteJob(data);
          break;
        case 'getJobStats':
          result = handleGetJobStats(data);
          break;
        case 'getSquareCustomers':
          result = handleGetSquareCustomers(data);
          break;
        case 'getSquareAppointments':
          result = handleGetSquareAppointments(data);
          break;
        case 'syncSquareAppointments':
          result = handleSyncSquareAppointments(data);
          break;
        case 'getTechnicians':
          result = handleGetTechnicians(data);
          break;
        case 'getRouteOptimization':
          result = handleGetRouteOptimization(data);
          break;
        case 'getStripeEarnings':
          result = handleGetStripeEarnings(data);
          break;
        default:
          Logger.log('WARNING: Invalid action in proxy request: ' + action);
          result = createResponse(false, 'Invalid action: ' + action);
      }
      
      // Log result before returning
      if (result) {
        try {
          const resultContent = result.getContent ? result.getContent() : JSON.stringify(result);
          Logger.log('Proxy request result type: ' + (result.constructor ? result.constructor.name : typeof result));
          Logger.log('Proxy request result (first 500 chars): ' + String(resultContent).substring(0, 500));
          
          // Verify it's actually a JSON response, not HTML
          if (resultContent && typeof resultContent === 'string') {
            if (resultContent.trim().startsWith('<') || resultContent.includes('<!DOCTYPE') || resultContent.includes('<html')) {
              Logger.log('WARNING: Result contains HTML instead of JSON! Returning error response instead.');
              return createResponse(false, 'Internal error: Received HTML instead of JSON response');
            }
          }
        } catch (logErr) {
          Logger.log('Could not log result content: ' + logErr.toString());
        }
      } else {
        Logger.log('ERROR: Result is null/undefined! Creating error response.');
        result = createResponse(false, 'Internal error: No response from handler');
      }
      
      // CRITICAL: Ensure we return JSON, not HTML
      // If result is not a TextOutput with JSON MIME type, convert it
      if (!result || typeof result.getContent !== 'function' || result.getMimeType() !== ContentService.MimeType.JSON) {
        Logger.log('WARNING: Result is not a proper JSON TextOutput. Converting...');
        try {
          const jsonContent = result && result.getContent ? result.getContent() : JSON.stringify(result || { success: false, message: 'Invalid response' });
          result = ContentService.createTextOutput(jsonContent).setMimeType(ContentService.MimeType.JSON);
        } catch (convertError) {
          Logger.log('ERROR converting result: ' + convertError.toString());
          result = createResponse(false, 'Response conversion error: ' + convertError.toString());
        }
      }
      
      Logger.log('Returning proxy result with MIME type: ' + (result.getMimeType ? result.getMimeType() : 'unknown'));
      return result;
    }
    
    // CRITICAL: Only serve HTML pages if NOT in proxy mode
    // Serve dashboard page
    if (page === 'dashboard' || (!action && !file && !page && proxy !== 'true')) {
      Logger.log('Serving dashboard page');
      return serveDashboardPage();
    }
    
    // Serve static files (CSS, JS)
    if (file === 'dashboard-css') {
      Logger.log('Serving dashboard CSS');
      return serveDashboardCSS();
    }
    if (file === 'dashboard-js') {
      Logger.log('Serving dashboard JS');
      return serveDashboardJS();
    }
    
    Logger.log('Processing non-proxy action: ' + action);
    let result;
    switch(action) {
      case 'getPendingAccounts':
        result = handleGetPendingAccounts({ email: e.parameter.email });
        break;
      default:
        Logger.log('WARNING: Unhandled action: ' + action);
        result = createResponse(false, 'Invalid action: ' + (action || 'none provided'));
    }
    
    // Safety check: ensure we have a result
    if (!result) {
      Logger.log('ERROR: No result from action handler, creating default error response');
      result = createResponse(false, 'No response from handler for action: ' + action);
    }
    
    Logger.log('Non-proxy result prepared');
    return result;
  } catch (error) {
    Logger.log('=== doGet ERROR ===');
    Logger.log('Error message: ' + error.toString());
    Logger.log('Error stack: ' + (error.stack || 'No stack trace'));
    Logger.log('Error name: ' + (error.name || 'Unknown'));
    Logger.log('Error parameters at time of error: ' + JSON.stringify(e ? (e.parameter || {}) : 'e was undefined'));
    
    // Make sure we always return JSON, not HTML
    try {
      const errorResponse = createResponse(false, 'Server error: ' + error.toString());
      Logger.log('Error response created successfully');
      return errorResponse;
    } catch (responseError) {
      // If createResponse fails, return raw JSON
      Logger.log('createResponse also failed: ' + responseError.toString());
      Logger.log('createResponse error stack: ' + (responseError.stack || 'No stack trace'));
      
      try {
        const fallbackResponse = ContentService.createTextOutput(JSON.stringify({
          success: false,
          message: 'Server error: ' + error.toString()
        })).setMimeType(ContentService.MimeType.JSON);
        Logger.log('Fallback JSON response created');
        return fallbackResponse;
      } catch (finalError) {
        Logger.log('FATAL: Even fallback response failed: ' + finalError.toString());
        // Last resort - return plain text JSON
        return ContentService.createTextOutput('{"success":false,"message":"Critical server error"}')
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
  }
}

/**
 * Serve Dashboard HTML Page
 * This serves the full dashboard page that can be embedded in websites
 */
function serveDashboardPage() {
  try {
    // Get the current Web App URL dynamically
    const scriptUrl = ScriptApp.getService().getUrl();
    
    // Get dashboard HTML from HTML file or return inline HTML
    let html;
    try {
      // Try to load from HTML file first (if you create DashboardHTML.html in Apps Script)
      html = HtmlService.createHtmlOutputFromFile('DashboardHTML').getContent();
    } catch (e) {
      // If HTML file doesn't exist, use inline HTML
      html = getDashboardHTML(scriptUrl);
    }
    
    return HtmlService.createHtmlOutput(html)
      .setTitle('Team Dashboard')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL); // Allow embedding
  } catch (error) {
    Logger.log('serveDashboardPage error: ' + error.toString());
    return HtmlService.createHtmlOutput('<h1>Error loading dashboard</h1><p>' + error.toString() + '</p>');
  }
}

/**
 * Get Dashboard HTML - returns the full HTML page
 * You can also create a DashboardHTML.html file in Apps Script and use that instead
 */
function getDashboardHTML(scriptUrl) {
  // Use the minimal HTML and inject the script URL dynamically
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Team Dashboard</title>
    <link rel="stylesheet" href="${scriptUrl}?file=dashboard-css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
</head>
<body>
    <link rel="stylesheet" href="${scriptUrl}?file=dashboard-css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <div class="dashboard-embed-wrapper">
        <div class="dashboard-embed-container">
            <!-- Header -->
            <div class="dashboard-embed-header">
                <div class="dashboard-embed-header-inner">
                    <div class="dashboard-embed-logo-section">
                        <div class="dashboard-embed-logo-icon">
                            <img src="https://cdn.prod.website-files.com/6931dc4e8e97334e195432df/6931dca5c5fb5c5fc0860f2c_test.png" alt="Logo">
                        </div>
                        <div class="dashboard-embed-logo-text">
                            <h1>A Quality Pool Company</h1>
                            <p>Team Dashboard</p>
                        </div>
                    </div>
                    <nav class="dashboard-embed-nav-menu">
                        <a href="https://a-quality-pool-company.webflow.io//" class="dashboard-embed-nav-link">
                            <i class="fas fa-home"></i> Home
                        </a>
                        <a href="https://a-quality-pool-company.webflow.io/pool-inspection-leak-detection" class="dashboard-embed-nav-link">
                            <i class="fas fa-search"></i> Pool Inspection
                        </a>
                    </nav>
                    <div class="dashboard-embed-user-section">
                        <div class="dashboard-embed-user-info">
                            <div class="dashboard-embed-user-name" id="dashboardUserName">Team Member</div>
                            <div class="dashboard-embed-user-role" id="dashboardUserRole">Inspector</div>
                        </div>
                        <div class="dashboard-embed-user-avatar">
                            <i class="fas fa-user"></i>
                        </div>
                    </div>
                </div>
            </div>
            <!-- Admin Notification Bar -->
            <div class="dashboard-embed-notification-bar" id="notificationBar">
                <div class="dashboard-embed-notification-content">
                    <div class="dashboard-embed-notification-text">
                        <i class="fas fa-bell"></i>
                        <span>You have <span class="dashboard-embed-notification-badge" id="pendingCount">0</span> pending account request(s)</span>
                    </div>
                    <div class="dashboard-embed-notification-actions">
                        <button class="dashboard-embed-notification-button view" id="viewPendingBtn">View Requests</button>
                        <button class="dashboard-embed-notification-button dismiss" id="dismissNotificationBtn">Dismiss</button>
                    </div>
                </div>
            </div>
            <!-- Pending Accounts Modal -->
            <div class="dashboard-embed-modal" id="pendingAccountsModal">
                <div class="dashboard-embed-modal-content">
                    <div class="dashboard-embed-modal-header">
                        <h2 class="dashboard-embed-modal-title">Pending Account Requests</h2>
                        <button class="dashboard-embed-modal-close" id="closeModalBtn">&times;</button>
                    </div>
                    <div class="dashboard-embed-modal-body" id="pendingAccountsList">
                        <div class="dashboard-embed-empty-state">
                            <i class="fas fa-spinner fa-spin"></i>
                            <p>Loading pending accounts...</p>
                        </div>
                    </div>
                </div>
            </div>
            <!-- Stats -->
            <div class="dashboard-embed-stats-grid">
                <div class="dashboard-embed-stat-card">
                    <div class="dashboard-embed-stat-icon">
                        <i class="fas fa-calendar-check"></i>
                    </div>
                    <span class="dashboard-embed-stat-number">0</span>
                    <span class="dashboard-embed-stat-label">Today's Jobs</span>
                </div>
                <div class="dashboard-embed-stat-card">
                    <div class="dashboard-embed-stat-icon">
                        <i class="fas fa-camera"></i>
                    </div>
                    <span class="dashboard-embed-stat-number" id="dashboardPhotoCount">0</span>
                    <span class="dashboard-embed-stat-label">Photos Uploaded</span>
                </div>
                <div class="dashboard-embed-stat-card">
                    <div class="dashboard-embed-stat-icon">
                        <i class="fas fa-clock"></i>
                    </div>
                    <span class="dashboard-embed-stat-number" id="dashboardCurrentTime">--:--</span>
                    <span class="dashboard-embed-stat-label">Current Time</span>
                </div>
                <div class="dashboard-embed-stat-card">
                    <div class="dashboard-embed-stat-icon">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <span class="dashboard-embed-stat-number">0</span>
                    <span class="dashboard-embed-stat-label">Completed</span>
                </div>
            </div>
            <!-- Quick Tools -->
            <div class="dashboard-embed-section">
                <h2 class="dashboard-embed-section-title">Quick Tools</h2>
                <div class="dashboard-embed-tools-grid">
                    <div class="dashboard-embed-tool-card" onclick="dashboardOpenPhotoUpload()">
                        <div class="dashboard-embed-tool-icon">
                            <i class="fas fa-camera"></i>
                        </div>
                        <h3 class="dashboard-embed-tool-title">Take Photos</h3>
                        <p class="dashboard-embed-tool-description">Capture inspection photos directly or upload from gallery</p>
                    </div>
                    <div class="dashboard-embed-tool-card" onclick="dashboardOpenJobList()">
                        <div class="dashboard-embed-tool-icon">
                            <i class="fas fa-clipboard-list"></i>
                        </div>
                        <h3 class="dashboard-embed-tool-title">Job List</h3>
                        <p class="dashboard-embed-tool-description">View and manage today's inspection schedule</p>
                    </div>
                    <div class="dashboard-embed-tool-card" onclick="dashboardOpenNotes()">
                        <div class="dashboard-embed-tool-icon">
                            <i class="fas fa-sticky-note"></i>
                        </div>
                        <h3 class="dashboard-embed-tool-title">Inspection Notes</h3>
                        <p class="dashboard-embed-tool-description">Record findings and observations</p>
                    </div>
                    <div class="dashboard-embed-tool-card" onclick="dashboardOpenCalculator()">
                        <div class="dashboard-embed-tool-icon">
                            <i class="fas fa-calculator"></i>
                        </div>
                        <h3 class="dashboard-embed-tool-title">Pool Calculator</h3>
                        <p class="dashboard-embed-tool-description">Calculate volume, chemical needs, and measurements</p>
                    </div>
                    <div class="dashboard-embed-tool-card" onclick="dashboardOpenFullInspection()">
                        <div class="dashboard-embed-tool-icon">
                            <i class="fas fa-clipboard-check"></i>
                        </div>
                        <h3 class="dashboard-embed-tool-title">Full Pool Inspection</h3>
                        <p class="dashboard-embed-tool-description">Complete inspection report with photos and videos</p>
                    </div>
                    <div class="dashboard-embed-tool-card" onclick="dashboardOpenCustomers()">
                        <div class="dashboard-embed-tool-icon">
                            <i class="fas fa-users"></i>
                        </div>
                        <h3 class="dashboard-embed-tool-title">Customer Info</h3>
                        <p class="dashboard-embed-tool-description">Access customer details and history</p>
                    </div>
                    <div class="dashboard-embed-tool-card" onclick="dashboardOpenQuickQuote()">
                        <div class="dashboard-embed-tool-icon">
                            <i class="fas fa-file-invoice-dollar"></i>
                        </div>
                        <h3 class="dashboard-embed-tool-title">Quick Quote</h3>
                        <p class="dashboard-embed-tool-description">Fast material cost estimation for field quotes</p>
                    </div>
                </div>
            </div>
            <!-- Photo Upload Section -->
            <div class="dashboard-embed-section">
                <h2 class="dashboard-embed-section-title">Job Photos</h2>
                <div class="dashboard-embed-upload-area" id="dashboardUploadArea">
                    <i class="fas fa-cloud-upload-alt dashboard-embed-upload-icon"></i>
                    <div class="dashboard-embed-upload-text">Click or Drag Photos Here</div>
                    <div class="dashboard-embed-upload-hint">Support for JPG, PNG, HEIC • Max 10MB per file</div>
                    <input type="file" id="dashboardFileInput" multiple accept="image/*" capture="environment" style="display: none;">
                </div>
                <div class="dashboard-embed-photos-grid" id="dashboardPhotosGrid"></div>
            </div>
        </div>
        <!-- Pool Calculator Overlay -->
        <div class="dashboard-embed-calculator-overlay" id="dashboardCalculatorOverlay">
            <div class="dashboard-embed-calculator-container">
                <div class="dashboard-embed-calculator-header">
                    <h3 class="dashboard-embed-calculator-title">
                        <i class="fas fa-calculator"></i> Pool & Chemical Calculator
                    </h3>
                    <button class="dashboard-embed-close-btn" onclick="dashboardCloseCalculator()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <iframe id="dashboardCalculatorIframe" class="dashboard-embed-calculator-iframe" src=""></iframe>
            </div>
        </div>
        <!-- Full Inspection Overlay -->
        <div class="dashboard-embed-calculator-overlay" id="dashboardInspectionOverlay">
            <div class="dashboard-embed-calculator-container">
                <div class="dashboard-embed-calculator-header">
                    <h3 class="dashboard-embed-calculator-title">
                        <i class="fas fa-clipboard-check"></i> Full Pool Inspection
                    </h3>
                    <button class="dashboard-embed-close-btn" onclick="dashboardCloseFullInspection()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <iframe id="dashboardInspectionIframe" class="dashboard-embed-calculator-iframe" src=""></iframe>
            </div>
        </div>
        <!-- Customer Info Overlay -->
        <div class="dashboard-embed-calculator-overlay" id="dashboardCustomerOverlay">
            <div class="dashboard-embed-calculator-container">
                <div class="dashboard-embed-calculator-header">
                    <h3 class="dashboard-embed-calculator-title">
                        <i class="fas fa-users"></i> Customer Info & History
                    </h3>
                    <button class="dashboard-embed-close-btn" onclick="dashboardCloseCustomers()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <iframe id="dashboardCustomerIframe" class="dashboard-embed-calculator-iframe" src=""></iframe>
            </div>
        </div>
        <!-- Photo Upload Overlay -->
        <div class="dashboard-embed-calculator-overlay" id="dashboardPhotoOverlay">
            <div class="dashboard-embed-calculator-container">
                <div class="dashboard-embed-calculator-header">
                    <h3 class="dashboard-embed-calculator-title">
                        <i class="fas fa-camera"></i> Take Photos
                    </h3>
                    <button class="dashboard-embed-close-btn" onclick="dashboardClosePhotoUpload()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <iframe id="dashboardPhotoIframe" class="dashboard-embed-calculator-iframe" src=""></iframe>
            </div>
        </div>
        <!-- Quick Quote Overlay -->
        <div class="dashboard-embed-calculator-overlay" id="dashboardQuickQuoteOverlay">
            <div class="dashboard-embed-calculator-container">
                <div class="dashboard-embed-calculator-header">
                    <h3 class="dashboard-embed-calculator-title">
                        <i class="fas fa-file-invoice-dollar"></i> Quick Pool Quote
                    </h3>
                    <button class="dashboard-embed-close-btn" onclick="dashboardCloseQuickQuote()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <iframe id="dashboardQuickQuoteIframe" class="dashboard-embed-calculator-iframe" src=""></iframe>
            </div>
        </div>
    </div>
    <script>
        // Inject the script URL dynamically - must be before dashboard-js loads
        window.SCRIPT_URL = '${scriptUrl}';
    </script>
    <script src="${scriptUrl}?file=dashboard-js"></script>
</body>
</html>`;
}

/**
 * Serve Dashboard CSS file
 * NOTE: You need to add the CSS content from Dashboard_Embed.html (lines 1-693, between <style> tags)
 * as a constant DASHBOARD_CSS in this script, or create a separate HTML file in Apps Script
 */
function serveDashboardCSS() {
  // Try to load from HTML file first (if you create DashboardCSS.html in Apps Script)
  try {
    const css = HtmlService.createHtmlOutputFromFile('DashboardCSS').getContent();
    return ContentService.createTextOutput(css)
      .setMimeType(ContentService.MimeType.CSS);
  } catch (e) {
    // If HTML file doesn't exist, use function
    const css = getDashboardCSS();
    return ContentService.createTextOutput(css)
      .setMimeType(ContentService.MimeType.CSS);
  }
}

/**
 * Serve Dashboard JS file
 * NOTE: You need to add the JS content from Dashboard_Embed.html (lines 968-1542, between <script> tags)
 * as a constant DASHBOARD_JS in this script, or create a separate HTML file in Apps Script
 */
function serveDashboardJS() {
  // Try to load from HTML file first (if you create DashboardJS.html in Apps Script)
  try {
    const js = HtmlService.createHtmlOutputFromFile('DashboardJS').getContent();
    return ContentService.createTextOutput(js)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  } catch (e) {
    // If HTML file doesn't exist, use function
    const js = getDashboardJS();
    return ContentService.createTextOutput(js)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
}

/**
 * Get Dashboard CSS - replace this function body with the actual CSS from Dashboard_Embed.html
 */
function getDashboardCSS() {
  // Copy the CSS from Dashboard_Embed.html (lines 2-692, everything inside <style> tags)
  // Remove the <style> and </style> tags themselves
  return `/* Paste CSS from Dashboard_Embed.html here (lines 2-692) */`;
}

/**
 * Get Dashboard JS - replace this function body with the actual JS from Dashboard_Embed.html
 */
function getDashboardJS() {
  // Copy the JS from Dashboard_Embed.html (lines 969-1541, everything inside <script> tags)
  // Remove the <script> and </script> tags themselves
  return `/* Paste JS from Dashboard_Embed.html here (lines 969-1541) */`;
}

/**
 * Handle login authentication
 */
function handleLogin(data) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const authSheet = spreadsheet.getSheetByName(AUTH_SHEET_NAME);
  
  if (!authSheet) {
    return createResponse(false, 'Authentication sheet not found. Please run setup script first.');
  }
  
  const email = (data.email || '').toLowerCase().trim();
  const password = data.password || '';
  
  if (!email || !password) {
    return createResponse(false, 'Email and password are required.');
  }
  
  const range = authSheet.getDataRange();
  const values = range.getValues();
  
  // Find user by email (skip row 1 and row 2)
  for (let i = 2; i < values.length; i++) {
    const row = values[i];
    const userEmail = (row[1] || '').toLowerCase().trim();
    const hashedPassword = (row[2] || '').toString().trim();
    const status = (row[4] || '').toString().trim();
    const accountStatus = (row[5] || '').toString().trim();
    const role = (row[3] || '').toString().trim();
    
    if (userEmail === email) {
      // Check if account is approved
      if (accountStatus !== 'Approved') {
        return createResponse(false, 'Your account is pending approval. Please wait for admin approval.');
      }
      
      // Check if account is active
      if (status !== 'Active') {
        return createResponse(false, 'Your account is inactive. Please contact administrator.');
      }
      
      // Verify password
      const passwordMatch = verifyPassword(password, hashedPassword);
      
      // Log for debugging (remove in production)
      Logger.log('Login attempt - Email: ' + email + ', Password match: ' + passwordMatch + ', Hash length: ' + hashedPassword.length);
      
      if (passwordMatch) {
        // Check if verification is required
        const lastVerification = row[7]; // Column H
        const verificationExpires = row[8]; // Column I
        const now = new Date();
        
        // Skip verification for admin users
        let needsVerification = false;
        const isAdminUser = role === 'Admin' || role === 'admin';
        
        if (!isAdminUser) {
        if (!lastVerification || !verificationExpires) {
          needsVerification = true;
        } else {
          const expiresDate = new Date(verificationExpires);
          if (now > expiresDate) {
            needsVerification = true;
            }
          }
        }
        
        // Update last login
        authSheet.getRange(i + 1, 11).setValue(now);
        
        // Check Trial Status
        const trialEndDate = row[13]; // Column N
        let isTrialExpired = false;
        if (trialEndDate) {
          const trialDate = new Date(trialEndDate);
          if (!isNaN(trialDate.getTime()) && trialDate < now) {
            isTrialExpired = true;
          }
        }
        
        // Parse features
        let features = [];
        try {
          features = row[15] ? JSON.parse(row[15]) : [];
        } catch (e) {
          features = []; // Default if parse fails
        }
        
        // Log role for debugging
        Logger.log('Login successful - Email: ' + email + ', Role: ' + role);
        
        return createResponse(true, 'Login successful', {
          user: {
            name: row[0] || '',
            email: userEmail,
            role: role,
            company: row[11] || '',
            companyId: row[12] || '',
            planType: row[14] || '',
            features: features,
            trialEnd: trialEndDate,
            isTrialExpired: isTrialExpired
          },
          needsVerification: needsVerification
        });
      } else {
        return createResponse(false, 'Invalid email or password');
      }
    }
  }
  
  return createResponse(false, 'Invalid email or password');
}

/**
 * Handle user registration
 */
function handleRegister(data) {
  try {
    // Validate required fields
    if (!data.name || !data.email || !data.password) {
      return createResponse(false, 'Name, email, and password are required');
    }
    
    // Get company name - accept both 'company' and 'companyName' keys
    const companyNameInput = data.companyName || data.company;
    
    // Validate company name
    if (!companyNameInput || !companyNameInput.trim()) {
      Logger.log('ERROR: Company name missing. Data keys: ' + Object.keys(data).join(', '));
      return createResponse(false, 'Company name is required');
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      return createResponse(false, 'Invalid email format');
    }
    
    // Validate password length
    if (data.password.length < 6) {
      return createResponse(false, 'Password must be at least 6 characters long');
    }
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let authSheet = spreadsheet.getSheetByName(AUTH_SHEET_NAME);
    
    if (!authSheet) {
      return createResponse(false, 'Authentication sheet not found. Please run setup script first.');
    }
    
    const email = data.email.toLowerCase().trim();
    const name = (data.name || '').trim();
    const companyName = companyNameInput.trim();
    
    // Check if user already exists
    const range = authSheet.getDataRange();
    const values = range.getValues();
    
    for (let i = 2; i < values.length; i++) {
      const row = values[i];
      const existingEmail = (row[1] || '').toLowerCase().trim();
      
      if (existingEmail === email) {
        return createResponse(false, 'Email already registered');
      }
    }
    
    // Generate Company ID (format: CMP-XXXXXXXXX)
    const companyId = 'CMP-' + Math.random().toString(36).substr(2, 9).toUpperCase();
    
    // Create Stripe customer with "Software" tag
    const stripeCustomerResult = createStripeCustomerWithTag(email, name, companyName);
    if (!stripeCustomerResult.success) {
      Logger.log('Warning: Failed to create Stripe customer: ' + stripeCustomerResult.error);
      // Continue with registration even if Stripe fails
    }
    const stripeCustomerId = stripeCustomerResult.customerId || '';
    
    // Hash the password
    const hashedPassword = hashPassword(data.password);
    const now = new Date();
    
    // Generate verification code
    const verificationCode = generateVerificationCode();
    
    // Calculate trial end date (14 days from now)
    const trialEndDate = new Date(now.getTime() + (14 * 24 * 60 * 60 * 1000));
    
    // Get the last row to determine where to insert
    const lastRow = authSheet.getLastRow();
    const newRowNum = lastRow + 1;

    // One row write (A–R) so a mid-call failure never leaves a half-filled row.
    // Matches sheet headers: Name, Email, Password, Role, Status, Account Status,
    // Verification Code, Last Verification Time, Verification Expires, Date Created,
    // Last Login, Company, Company ID, Trial End Date, Plan Type, Features, Settings, Stripe Customer ID
    const newRow = [
      name,
      data.email,
      hashedPassword,
      'User',
      'Active',
      'Pending',
      verificationCode,
      '',
      '',
      now,
      '',
      companyName,
      companyId,
      trialEndDate,
      'Trial',
      '[]',
      '',
      stripeCustomerId
    ];
    // getRange(row, col, numRows, numCols) — NOT (startRow, startCol, endRow, endCol)
    authSheet.getRange(newRowNum, 1, 1, 18).setValues([newRow]);

    // Create Stripe checkout session for trial
    const trialAmount = 99.00; // Default trial amount - adjust as needed
    const checkoutResult = createTrialStripeCheckout({
      email: email,
      name: name,
      companyName: companyName,
      companyId: companyId,
      stripeCustomerId: stripeCustomerId,
      trialAmount: trialAmount
    });
    
    if (!checkoutResult.success) {
      Logger.log('Error creating Stripe checkout: ' + checkoutResult.error);
      return createResponse(true, 'Account created successfully! Please check your email for verification code. Your account is pending admin approval.');
    }

    // Must use createResponse so doPost always returns JSON TextOutput (plain objects confused some clients/proxies).
    return createResponse(true, 'Redirecting to payment setup...', {
      checkoutUrl: checkoutResult.checkoutUrl
    });

  } catch (error) {
    Logger.log('Registration error: ' + error.toString());
    return createResponse(false, 'Registration failed: ' + error.toString());
  }
}

/**
 * Create or get Stripe customer with "Software" tag
 */
function createStripeCustomerWithTag(email, name, companyName) {
  try {
    // Search for existing customer by email
    const searchOptions = {
      method: 'get',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY
      },
      muteHttpExceptions: true
    };
    
    const searchUrl = STRIPE_API_URL + '/customers?email=' + encodeURIComponent(email) + '&limit=1';
    const searchResponse = UrlFetchApp.fetch(searchUrl, searchOptions);
    const searchData = JSON.parse(searchResponse.getContentText());
    
    let customerId = '';
    
    if (searchData.data && searchData.data.length > 0) {
      // Customer exists, get ID and check/add tag
      customerId = searchData.data[0].id;
      const existingTags = searchData.data[0].metadata?.tags ? searchData.data[0].metadata.tags.split(',') : [];
      
      if (!existingTags.includes('Software')) {
        // Add "Software" tag
        const updatePayload = {
          'metadata[tags]': existingTags.length > 0 ? existingTags.join(',') + ',Software' : 'Software'
        };
        
        const updateOptions = {
          method: 'post',
          headers: {
            'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          payload: Object.keys(updatePayload).map(key => 
            encodeURIComponent(key) + '=' + encodeURIComponent(updatePayload[key])
          ).join('&'),
          muteHttpExceptions: true
        };
        
        UrlFetchApp.fetch(STRIPE_API_URL + '/customers/' + customerId, updateOptions);
      }
    } else {
      // Create new customer with "Software" tag
      const createPayload = {
        'email': email,
        'name': name,
        'metadata[company_name]': companyName,
        'metadata[tags]': 'Software'
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
      const customer = JSON.parse(createResponse.getContentText());
      
      if (customer.id) {
        customerId = customer.id;
        Logger.log('✅ Stripe customer created: ' + customerId);
      } else {
        Logger.log('❌ Error creating Stripe customer: ' + JSON.stringify(customer));
        return { success: false, error: 'Failed to create Stripe customer' };
      }
    }
    
    return { success: true, customerId: customerId };
    
  } catch (error) {
    Logger.log('❌ Error with Stripe customer: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Create Stripe checkout session for trial enrollment
 * $0 today, scheduled charge on day 15
 */
function createTrialStripeCheckout(data) {
  try {
    const email = data.email;
    const name = data.name;
    const companyName = data.companyName;
    const companyId = data.companyId;
    const stripeCustomerId = data.stripeCustomerId;
    const trialAmount = data.trialAmount || 99.00;
    
    // Get web app URL for success/cancel URLs
    const scriptUrl = ScriptApp.getService().getUrl();
    if (!scriptUrl) {
      return { success: false, error: 'Web app URL not found. Please deploy the script as a web app first.' };
    }
    
    // Success URL - redirect to approval pending page
    const successUrl = scriptUrl + '?action=approvalPending&email=' + encodeURIComponent(email);
    // Cancel URL - return to sign-up
    const cancelUrl = scriptUrl + '?action=signupCancelled';
    
    // Create checkout session
    // Note: Stripe doesn't support scheduled payments directly in checkout sessions
    // We'll create a $0 checkout and handle the scheduled payment separately via webhook
    const checkoutPayload = {
      'customer': stripeCustomerId,
      'payment_method_types[0]': 'card',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][product_data][name]': 'PoolFlowPro 14-Day Trial',
      'line_items[0][price_data][product_data][description]': '14-Day Free Trial - $0 today, $' + trialAmount.toFixed(2) + ' will be charged on day 15',
      'line_items[0][price_data][unit_amount]': '0', // $0.00
      'line_items[0][quantity]': '1',
      'mode': 'payment',
      'success_url': successUrl,
      'cancel_url': cancelUrl,
      'metadata[user_email]': email,
      'metadata[user_name]': name,
      'metadata[company_name]': companyName,
      'metadata[company_id]': companyId,
      'metadata[stripe_customer_id]': stripeCustomerId,
      'metadata[trial_amount]': trialAmount.toString(),
      'metadata[trial_type]': 'software',
      'allow_promotion_codes': 'true'
    };
    
    const checkoutOptions = {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      payload: Object.keys(checkoutPayload).map(key => 
        encodeURIComponent(key) + '=' + encodeURIComponent(checkoutPayload[key])
      ).join('&'),
      muteHttpExceptions: true
    };
    
    const checkoutResponse = UrlFetchApp.fetch(STRIPE_API_URL + '/checkout/sessions', checkoutOptions);
    const checkoutData = JSON.parse(checkoutResponse.getContentText());
    
    if (checkoutData.id && checkoutData.url) {
      Logger.log('✅ Stripe checkout session created: ' + checkoutData.id);
      return { success: true, checkoutUrl: checkoutData.url, sessionId: checkoutData.id };
    } else {
      Logger.log('❌ Error creating checkout session: ' + JSON.stringify(checkoutData));
      return { success: false, error: checkoutData.error ? checkoutData.error.message : 'Failed to create checkout session' };
    }
    
  } catch (error) {
    Logger.log('❌ Error creating Stripe checkout: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Handle Stripe webhook for trial enrollment
 */
function handleStripeTrialWebhook(event) {
  try {
    if (event.type !== 'checkout.session.completed') {
      return { success: false, error: 'Event type not supported' };
    }
    
    const session = event.data.object;
    const metadata = session.metadata || {};
    
    const email = metadata.user_email || '';
    const companyName = metadata.company_name || '';
    const companyId = metadata.company_id || '';
    const stripeCustomerId = metadata.stripe_customer_id || '';
    const trialAmount = parseFloat(metadata.trial_amount || 0);
    
    if (!email) {
      Logger.log('❌ No email in checkout session metadata');
      return { success: false, error: 'No email in metadata' };
    }
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = spreadsheet.getSheetByName(AUTH_SHEET_NAME);
    
    if (!authSheet) {
      return { success: false, error: 'Authentication sheet not found' };
    }
    
    // Find user by email
    const range = authSheet.getDataRange();
    const values = range.getValues();
    
    for (let i = 2; i < values.length; i++) {
      const row = values[i];
      const userEmail = (row[1] || '').toLowerCase().trim();
      
      if (userEmail === email.toLowerCase().trim()) {
        const now = new Date();
        const trialEndDate = new Date(now.getTime() + (14 * 24 * 60 * 60 * 1000));
        
        // Update account: Status remains "Pending" (needs admin approval)
        // Trial end date is set to 14 days from now
        authSheet.getRange(i + 1, 14).setValue(trialEndDate); // Column N: Trial End Date
        
        // Send approval request email to admin
        try {
          sendApprovalRequestEmail(email, row[0] || '', companyName, companyId, stripeCustomerId);
          Logger.log('✅ Approval request email sent to admin');
        } catch (emailError) {
          Logger.log('ERROR sending approval request email: ' + emailError.toString());
        }
        
        // Send confirmation email to user
        try {
          sendTrialEnrollmentConfirmationEmail(email, row[0] || '', companyName, trialAmount);
          Logger.log('✅ Trial enrollment confirmation email sent to user');
        } catch (emailError) {
          Logger.log('ERROR sending confirmation email: ' + emailError.toString());
        }
        
        return { success: true, message: 'Trial enrollment processed' };
      }
    }
    
    return { success: false, error: 'User not found' };
    
  } catch (error) {
    Logger.log('❌ Error handling Stripe trial webhook: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Send approval request email to admin
 */
function sendApprovalRequestEmail(userEmail, userName, companyName, companyId, stripeCustomerId) {
  const adminEmail = 'brookspumpingpoolco@gmail.com';
  const subject = 'New PoolFlowPro Account Approval Request - ' + companyName;
  
  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #374151; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border: 2px solid #e5e7eb; padding: 40px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <img src="${LOGO_URL}" alt="${COMPANY_NAME}" style="max-width: 200px; height: auto; margin-bottom: 20px;">
        <h1 style="margin: 0; color: #0369a1; font-size: 28px; font-weight: 700;">New Account Approval Request</h1>
      </div>
      
      <div style="background: #eff6ff; border-left: 4px solid #0369a1; padding: 20px; margin-bottom: 30px;">
        <h2 style="margin: 0 0 16px 0; color: #1e40af; font-size: 20px;">PoolFlowPro Trial Enrollment</h2>
        <p style="margin: 0; color: #1e40af; font-size: 14px;">A new user has completed trial enrollment and requires approval.</p>
      </div>
      
      <div style="margin-bottom: 30px;">
        <h3 style="color: #374151; font-size: 18px; margin-bottom: 16px;">User Details:</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-weight: 600; width: 40%;">Name:</td>
            <td style="padding: 8px 0; color: #374151;">${userName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-weight: 600;">Email:</td>
            <td style="padding: 8px 0; color: #374151;">${userEmail}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-weight: 600;">Company:</td>
            <td style="padding: 8px 0; color: #374151;">${companyName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-weight: 600;">Company ID:</td>
            <td style="padding: 8px 0; color: #374151;">${companyId}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-weight: 600;">Stripe Customer ID:</td>
            <td style="padding: 8px 0; color: #374151;">${stripeCustomerId}</td>
          </tr>
        </table>
      </div>
      
      <div style="background: #f9fafb; padding: 20px; border: 2px solid #e5e7eb; margin-bottom: 30px;">
        <p style="margin: 0; color: #374151; font-size: 14px; line-height: 1.6;">
          <strong>Action Required:</strong> Please review and approve this account in the dashboard to grant access to PoolFlowPro.
        </p>
      </div>
      
      <div style="text-align: center; margin-top: 30px;">
        <p style="margin: 0; color: #6b7280; font-size: 12px;">
          This is an automated notification from PoolFlowPro
        </p>
      </div>
    </div>
  </div>
</body>
</html>
  `;
  
  MailApp.sendEmail({
    to: adminEmail,
    subject: subject,
    htmlBody: htmlBody
  });
  
  Logger.log('Approval request email sent to: ' + adminEmail);
}

/**
 * Send trial enrollment confirmation email to user
 */
function sendTrialEnrollmentConfirmationEmail(email, name, companyName, trialAmount) {
  const subject = 'Trial Enrollment Complete - Approval Pending - PoolFlowPro';
  
  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #374151; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border: 2px solid #e5e7eb; padding: 40px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <img src="${LOGO_URL}" alt="PoolFlowPro" style="max-width: 200px; height: auto; margin-bottom: 20px;">
        <h1 style="margin: 0; color: #0369a1; font-size: 28px; font-weight: 700;">Trial Enrollment Complete</h1>
      </div>
      
      <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin-bottom: 30px;">
        <h2 style="margin: 0 0 12px 0; color: #92400e; font-size: 18px;">We are requesting approval for your system access</h2>
        <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
          You will be notified once your account has been approved by our team.
        </p>
      </div>
      
      <div style="margin-bottom: 30px;">
        <h3 style="color: #374151; font-size: 18px; margin-bottom: 16px;">Trial Details:</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-weight: 600; width: 50%;">Trial Period:</td>
            <td style="padding: 8px 0; color: #374151;">14 Days</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-weight: 600;">Charge Today:</td>
            <td style="padding: 8px 0; color: #10b981; font-weight: 600;">$0.00</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-weight: 600;">Amount on Day 15:</td>
            <td style="padding: 8px 0; color: #374151; font-weight: 600;">$${trialAmount.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-weight: 600;">Company:</td>
            <td style="padding: 8px 0; color: #374151;">${companyName}</td>
          </tr>
        </table>
      </div>
      
      <div style="background: #f9fafb; padding: 20px; border: 2px solid #e5e7eb; margin-bottom: 30px;">
        <p style="margin: 0; color: #374151; font-size: 14px; line-height: 1.6;">
          <strong>What's Next?</strong><br>
          Our team will review your account and approve access. You'll receive an email notification once your account is approved and ready to use.
        </p>
      </div>
      
      <div style="text-align: center; margin-top: 30px;">
        <p style="margin: 0; color: #6b7280; font-size: 12px;">
          Questions? Contact us at ${COMPANY_EMAIL}
        </p>
      </div>
    </div>
  </div>
</body>
</html>
  `;
  
  MailApp.sendEmail({
    to: email,
    subject: subject,
    htmlBody: htmlBody
  });
  
  Logger.log('Trial enrollment confirmation email sent to: ' + email);
}

/**
 * Get approval pending page HTML
 */
function getApprovalPendingPage(email) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Approval Pending - PoolFlowPro</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f7fa;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      background: white;
      border: 2px solid #e5e7eb;
      max-width: 600px;
      width: 100%;
      padding: 40px;
      text-align: center;
    }
    .logo {
      max-width: 200px;
      margin-bottom: 20px;
    }
    h1 {
      color: #0369a1;
      font-size: 28px;
      margin-bottom: 20px;
    }
    .message-box {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 20px;
      margin: 20px 0;
      text-align: left;
    }
    .message-box h2 {
      color: #92400e;
      font-size: 18px;
      margin-bottom: 12px;
    }
    .message-box p {
      color: #92400e;
      font-size: 14px;
      line-height: 1.6;
    }
    .info-box {
      background: #f9fafb;
      border: 2px solid #e5e7eb;
      padding: 20px;
      margin: 20px 0;
      text-align: left;
    }
    .info-box h3 {
      color: #374151;
      font-size: 16px;
      margin-bottom: 12px;
    }
    .info-box p {
      color: #6b7280;
      font-size: 14px;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="container">
    <img src="${LOGO_URL}" alt="PoolFlowPro" class="logo">
    <h1>Approval Pending</h1>
    <div class="message-box">
      <h2>We are requesting approval for your system access</h2>
      <p>You will be notified once your account has been approved by our team.</p>
    </div>
    <div class="info-box">
      <h3>What's Next?</h3>
      <p>Our team will review your account and approve access. You'll receive an email notification once your account is approved and ready to use.</p>
    </div>
    <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
      Questions? Contact us at ${COMPANY_EMAIL}
    </p>
  </div>
</body>
</html>
  `;
}

/**
 * Update trial end date for a user (Admin only)
 */
function updateTrialEndDate(email, newTrialEndDate) {
  try {
    // Validate admin access
    const adminEmail = 'brookspumpingpoolco@gmail.com';
    // Note: In production, you should check if the calling user is an admin
    // For now, this function can be called by admins via the dashboard
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = spreadsheet.getSheetByName(AUTH_SHEET_NAME);
    
    if (!authSheet) {
      return createResponse(false, 'Authentication sheet not found');
    }
    
    const emailLower = email.toLowerCase().trim();
    const range = authSheet.getDataRange();
    const values = range.getValues();
    
    // Find user by email
    for (let i = 2; i < values.length; i++) {
      const row = values[i];
      const userEmail = (row[1] || '').toLowerCase().trim();
      
      if (userEmail === emailLower) {
        // Parse the new trial end date
        let trialDate;
        if (typeof newTrialEndDate === 'string') {
          trialDate = new Date(newTrialEndDate);
        } else {
          trialDate = new Date(newTrialEndDate);
        }
        
        if (isNaN(trialDate.getTime())) {
          return createResponse(false, 'Invalid date format');
        }
        
        // Update Column N (Trial End Date) - index 13
        authSheet.getRange(i + 1, 14).setValue(trialDate);
        
        Logger.log('Trial end date updated for ' + email + ' to ' + trialDate.toISOString());
        
        return createResponse(true, 'Trial end date updated successfully', {
          email: email,
          newTrialEndDate: trialDate.toISOString()
        });
      }
    }
    
    return createResponse(false, 'User not found');
    
  } catch (error) {
    Logger.log('Error updating trial end date: ' + error.toString());
    return createResponse(false, 'Failed to update trial end date: ' + error.toString());
  }
}

/**
 * Get signup cancelled page HTML
 */
function getSignupCancelledPage() {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Signup Cancelled - PoolFlowPro</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f7fa;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      background: white;
      border: 2px solid #e5e7eb;
      max-width: 600px;
      width: 100%;
      padding: 40px;
      text-align: center;
    }
    .logo {
      max-width: 200px;
      margin-bottom: 20px;
    }
    h1 {
      color: #0369a1;
      font-size: 28px;
      margin-bottom: 20px;
    }
    p {
      color: #6b7280;
      font-size: 14px;
      line-height: 1.6;
      margin-bottom: 20px;
    }
    a {
      color: #0369a1;
      text-decoration: none;
      font-weight: 600;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <img src="${LOGO_URL}" alt="PoolFlowPro" class="logo">
    <h1>Signup Cancelled</h1>
    <p>Your signup was cancelled. You can try again anytime.</p>
    <p><a href="javascript:window.close()">Close this window</a></p>
  </div>
</body>
</html>
  `;
}

/**
 * Handle email verification
 */
function handleVerifyEmail(data) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const authSheet = spreadsheet.getSheetByName(AUTH_SHEET_NAME);
  
  if (!authSheet) {
    return createResponse(false, 'Authentication sheet not found');
  }
  
  const email = data.email.toLowerCase().trim();
  const code = data.code.trim();
  
  const range = authSheet.getDataRange();
  const values = range.getValues();
  
  for (let i = 2; i < values.length; i++) {
    const row = values[i];
    const userEmail = (row[1] || '').toLowerCase().trim();
    const storedCode = (row[6] || '').toString().trim();
    
    if (userEmail === email && storedCode === code) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + (VERIFICATION_HOURS * 60 * 60 * 1000));
      
      // Update verification time and expiration
      authSheet.getRange(i + 1, 8).setValue(now); // Last Verification Time
      authSheet.getRange(i + 1, 9).setValue(expiresAt); // Verification Expires
      
      // Clear verification code
      authSheet.getRange(i + 1, 7).setValue('');
      
      // Get user info for Telegram notification
      const userName = row[0] || 'Unknown';
      const companyName = row[11] || COMPANY_NAME;
      
      // Send Telegram notification to admin about new pending account
      Logger.log('Sending Telegram notification for newly verified account: ' + email);
      try {
        const telegramResult = sendApprovalNotificationTelegram(userName, email, companyName);
        if (telegramResult.success) {
          Logger.log('✅ Telegram notification sent');
        } else {
          Logger.log('❌ Telegram notification failed: ' + telegramResult.error);
        }
      } catch (telegramError) {
        Logger.log('Warning: Telegram send error: ' + telegramError.toString());
      }
      
      // Log to approval notifications sheet
      logApprovalNotification(email, userName, 'Created', 0);
      
      return createResponse(true, 'Email verified successfully. Awaiting admin approval.');
    }
  }
  
  return createResponse(false, 'Invalid verification code');
}

/**
 * Handle forgot password request
 */
function handleForgotPassword(data) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const authSheet = spreadsheet.getSheetByName(AUTH_SHEET_NAME);
  
  if (!authSheet) {
    return createResponse(false, 'Authentication sheet not found');
  }
  
  const email = data.email.toLowerCase().trim();
  
  const range = authSheet.getDataRange();
  const values = range.getValues();
  
  for (let i = 2; i < values.length; i++) {
    const row = values[i];
    const userEmail = (row[1] || '').toLowerCase().trim();
    const accountStatus = row[5] || '';
    
    if (userEmail === email) {
      if (accountStatus !== 'Approved') {
        return createResponse(false, 'Your account is pending approval. Please contact administrator.');
      }
      
      // Generate verification code
      const verificationCode = generateVerificationCode();
      const name = row[0] || '';
      const company = row[11] || COMPANY_NAME;
      
      // Store verification code
      authSheet.getRange(i + 1, 7).setValue(verificationCode);
      
      // Send password reset email
      try {
        sendPasswordResetEmail(email, name, verificationCode, company);
        Logger.log('Password reset email sent to: ' + email);
      } catch (emailError) {
        Logger.log('ERROR sending password reset email: ' + emailError.toString());
        // Return error since this is critical for password reset
        return createResponse(false, 'Failed to send password reset email. Please try again or contact support.');
      }
      
      return createResponse(true, 'Password reset code sent to your email');
    }
  }
  
  // Don't reveal if email exists for security
  return createResponse(true, 'If the email exists, a password reset code has been sent');
}

/**
 * Handle password reset with verification code
 */
function handleResetPassword(data) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const authSheet = spreadsheet.getSheetByName(AUTH_SHEET_NAME);
  
  if (!authSheet) {
    return createResponse(false, 'Authentication sheet not found');
  }
  
  const email = data.email.toLowerCase().trim();
  const code = data.code.trim();
  const newPassword = data.newPassword;
  
  if (!newPassword || newPassword.length < 6) {
    return createResponse(false, 'Password must be at least 6 characters long');
  }
  
  const range = authSheet.getDataRange();
  const values = range.getValues();
  
  for (let i = 2; i < values.length; i++) {
    const row = values[i];
    const userEmail = (row[1] || '').toLowerCase().trim();
    const storedCode = (row[6] || '').toString().trim();
    
    if (userEmail === email && storedCode === code) {
      // Update password
      const hashedPassword = hashPassword(newPassword);
      authSheet.getRange(i + 1, 3).setValue(hashedPassword);
      
      // Clear verification code
      authSheet.getRange(i + 1, 7).setValue('');
      
      return createResponse(true, 'Password reset successfully. You can now log in.');
    }
  }
  
  return createResponse(false, 'Invalid verification code');
}

/**
 * Check if user needs verification
 */
function handleCheckVerification(data) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const authSheet = spreadsheet.getSheetByName(AUTH_SHEET_NAME);
  
  if (!authSheet) {
    return createResponse(false, 'Authentication sheet not found');
  }
  
  const email = data.email.toLowerCase().trim();
  
  const range = authSheet.getDataRange();
  const values = range.getValues();
  
  for (let i = 2; i < values.length; i++) {
    const row = values[i];
    const userEmail = (row[1] || '').toLowerCase().trim();
    
    if (userEmail === email) {
      const lastVerification = row[7];
      const verificationExpires = row[8];
      const now = new Date();
      
      let needsVerification = false;
      if (!lastVerification || !verificationExpires) {
        needsVerification = true;
      } else {
        const expiresDate = new Date(verificationExpires);
        if (now > expiresDate) {
          needsVerification = true;
        }
      }
      
      return createResponse(true, '', {
        needsVerification: needsVerification,
        expiresAt: verificationExpires ? new Date(verificationExpires).toISOString() : null
      });
    }
  }
  
  return createResponse(false, 'User not found');
}

/**
 * Get pending accounts for admin
 */
function handleGetPendingAccounts(data) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const authSheet = spreadsheet.getSheetByName(AUTH_SHEET_NAME);
  
  if (!authSheet) {
    return createResponse(false, 'Authentication sheet not found');
  }
  
  // Verify admin
  const adminEmail = data.email ? data.email.toLowerCase().trim() : '';
  if (!isAdmin(adminEmail)) {
    return createResponse(false, 'Unauthorized: Admin access required');
  }
  
  const range = authSheet.getDataRange();
  const values = range.getValues();
  const pendingAccounts = [];
  
  for (let i = 2; i < values.length; i++) {
    const row = values[i];
    const accountStatus = row[5] || '';
    
    if (accountStatus === 'Pending') {
      pendingAccounts.push({
        rowIndex: i + 1,
        name: row[0] || '',
        email: row[1] || '',
        role: row[3] || '',
        company: row[11] || '',
        dateCreated: row[9] ? new Date(row[9]).toISOString() : ''
      });
    }
  }
  
  return createResponse(true, '', { pendingAccounts: pendingAccounts });
}

/**
 * Approve account (admin only)
 */
function handleApproveAccount(data) {
  Logger.log('=== handleApproveAccount called ===');
  Logger.log('Timestamp: ' + new Date().toISOString());
  Logger.log('Data received: ' + JSON.stringify(data || {}));
  
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = spreadsheet.getSheetByName(AUTH_SHEET_NAME);
    
    if (!authSheet) {
      Logger.log('ERROR: Authentication sheet not found');
      return createResponse(false, 'Authentication sheet not found');
    }
    
    // Verify admin
    const adminEmail = data.adminEmail ? data.adminEmail.toLowerCase().trim() : '';
    Logger.log('Admin email: ' + adminEmail);
    
    if (!isAdmin(adminEmail)) {
      Logger.log('ERROR: Unauthorized - not admin');
      return createResponse(false, 'Unauthorized: Admin access required');
    }
    
    const rowIndex = parseInt(data.rowIndex);
    Logger.log('Row index from data: ' + data.rowIndex + ', parsed: ' + rowIndex);
    
    if (!rowIndex || isNaN(rowIndex)) {
      Logger.log('ERROR: Invalid rowIndex: ' + data.rowIndex);
      return createResponse(false, 'Row index required and must be a number');
    }
    
    Logger.log('Approving account - Row: ' + rowIndex + ', Admin: ' + adminEmail);
  
    // Verify row exists
    const lastRow = authSheet.getLastRow();
    if (rowIndex < 1 || rowIndex > lastRow) {
      Logger.log('ERROR: Row index ' + rowIndex + ' is out of range. Last row: ' + lastRow);
      return createResponse(false, 'Invalid row index. Row ' + rowIndex + ' does not exist.');
    }
  
    // Get current row data first
    const userEmail = authSheet.getRange(rowIndex, 2).getValue();
    const userName = authSheet.getRange(rowIndex, 1).getValue();
    const currentRole = authSheet.getRange(rowIndex, 4).getValue(); // Column D: Role
    const company = authSheet.getRange(rowIndex, 12).getValue() || COMPANY_NAME;
    const currentStatus = authSheet.getRange(rowIndex, 6).getValue(); // Column F: Account Status
    
    Logger.log('User data - Email: ' + userEmail + ', Name: ' + userName + ', Role: ' + currentRole + ', Current Status: ' + currentStatus);
    
    if (!userEmail) {
      Logger.log('ERROR: No email found in row ' + rowIndex);
      return createResponse(false, 'No user found in row ' + rowIndex);
    }
    
    // CRITICAL: Ensure Role column has a valid value
    // Data validation will fail if Role is empty when we try to update status
    const validRoles = ['Admin', 'Manager', 'User', 'Guest'];
    const currentRoleStr = currentRole ? currentRole.toString().trim() : '';
    let roleToSet = currentRoleStr;
    
    if (!currentRoleStr || !validRoles.includes(currentRoleStr)) {
      Logger.log('Role is invalid or empty: "' + currentRoleStr + '". Will set to "User"');
      roleToSet = 'User';
    } else {
      Logger.log('Role is already valid: ' + currentRoleStr);
    }
    
    // Update BOTH Role and Account Status in a single operation to avoid validation issues
    Logger.log('Updating role and account status together in row ' + rowIndex);
    try {
      // Get the entire row to update multiple columns at once - UPDATED for new columns (Company ID, Trial, Plan, Features)
      // Expanded to 17 columns
      const rowRange = authSheet.getRange(rowIndex, 1, 1, 17);
      const rowData = rowRange.getValues()[0];
      
      // Ensure rowData has enough elements
      while (rowData.length < 17) {
        rowData.push('');
      }
      
      // Update role (column D, index 3) if needed
      if (roleToSet !== currentRoleStr) {
        rowData[3] = roleToSet; // Column D: Role
        Logger.log('Setting role to: ' + roleToSet);
      }
      
      // Update account status (column F, index 5)
      rowData[5] = 'Approved'; // Column F: Account Status
      Logger.log('Setting account status to: Approved');
      
      // Update Company ID if missing (Column M, Index 12)
      if (!rowData[12]) {
        // Generate a simple unique ID
        const companyId = 'CMP-' + Math.random().toString(36).substr(2, 9).toUpperCase();
        rowData[12] = companyId;
        Logger.log('Generated Company ID: ' + companyId);
      }
      
      // Update Trial Info (Column N, Index 13)
      if (data.trialDuration) {
        const days = parseInt(data.trialDuration);
        if (!isNaN(days) && days > 0) {
          const trialEnd = new Date();
          trialEnd.setDate(trialEnd.getDate() + days);
          rowData[13] = trialEnd; 
          Logger.log('Setting trial end date: ' + trialEnd);
        }
      }
      
      // Update Plan Type (Column O, Index 14)
      if (data.planType) {
        rowData[14] = data.planType;
        Logger.log('Setting plan type: ' + data.planType);
      }
      
      // Update Features (Column P, Index 15)
      if (data.features) {
        let features = data.features;
        // If it's already a string that looks like JSON, parse it first
        if (typeof features === 'string') {
          try {
            const parsed = JSON.parse(features);
            features = parsed;
          } catch (e) {
            // If parsing fails, treat as comma-separated string
            Logger.log('Features is string, not JSON. Using as-is: ' + features);
          }
        }
        // If array or object, stringify for storage
        const featuresString = typeof features === 'object' ? JSON.stringify(features) : features;
        rowData[15] = featuresString;
        Logger.log('Setting features: ' + featuresString);
      }
      
      // Clear data validation on both columns before updating
      const roleCell = authSheet.getRange(rowIndex, 4);
      const statusCell = authSheet.getRange(rowIndex, 6);
      
      const roleValidation = roleCell.getDataValidation();
      const statusValidation = statusCell.getDataValidation();
      
      try {
        // Temporarily clear validations
        if (roleValidation) {
          roleCell.setDataValidation(null);
        }
        if (statusValidation) {
          statusCell.setDataValidation(null);
        }
        
        // Update the row
        rowRange.setValues([rowData]);
        SpreadsheetApp.flush();
        
        // Restore validations
        if (roleValidation) {
          roleCell.setDataValidation(roleValidation);
        }
        if (statusValidation) {
          statusCell.setDataValidation(statusValidation);
        }
        
        SpreadsheetApp.flush();
        Logger.log('Successfully updated role and status');
      } catch (validationError) {
        Logger.log('Validation clearing method failed, trying direct update: ' + validationError.toString());
        // Fallback: try direct update without clearing validation
        rowRange.setValues([rowData]);
        SpreadsheetApp.flush();
        Logger.log('Direct update completed');
      }
      
      // Verify both updates
      const verifyRole = authSheet.getRange(rowIndex, 4).getValue();
      const verifyStatus = authSheet.getRange(rowIndex, 6).getValue();
      Logger.log('Verified - Role: ' + verifyRole + ', Status: ' + verifyStatus);
      
      if (verifyStatus !== 'Approved') {
        throw new Error('Status update failed. Expected "Approved" but got "' + verifyStatus + '"');
      }
      
      if (roleToSet !== currentRoleStr && verifyRole !== roleToSet) {
        Logger.log('Warning: Role update may have failed. Expected "' + roleToSet + '" but got "' + verifyRole + '"');
        // Don't fail the whole operation if role update failed but status updated
      }
    } catch (updateError) {
      Logger.log('ERROR updating role/status: ' + updateError.toString());
      Logger.log('Error stack: ' + (updateError.stack || 'No stack'));
      return createResponse(false, 'Failed to update account: ' + updateError.toString());
    }
  
    // Send approval email
    Logger.log('Sending approval email to: ' + userEmail);
    try {
      sendAccountApprovalEmail(userEmail, userName, company);
      Logger.log('Approval email sent successfully');
    } catch (emailError) {
      Logger.log('Warning: Email send failed: ' + emailError.toString());
      // Continue anyway - approval is more important than email
    }
    
    // Send Telegram notification to admin confirming approval
    Logger.log('Sending Telegram confirmation to admin');
    try {
      const telegramResult = sendTelegramBotMessage_(
        '✅ <b>Account Approved</b>\n\n' +
        '👤 <b>Name:</b> ' + escapeHtml(userName) + '\n' +
        '📧 <b>Email:</b> ' + escapeHtml(userEmail) + '\n' +
        '🏢 <b>Company:</b> ' + escapeHtml(company) + '\n' +
        '⏰ <b>Approved:</b> ' + new Date().toLocaleString(),
        []
      );
      if (telegramResult.success) {
        Logger.log('Telegram confirmation sent successfully');
      } else {
        Logger.log('Telegram send failed: ' + telegramResult.error);
      }
    } catch (telegramError) {
      Logger.log('Warning: Telegram send failed: ' + telegramError.toString());
    }
    
    // Create Stripe checkout session for 14-day trial
    Logger.log('Creating Stripe checkout session for trial subscription');
    let checkoutUrl = null;
    let subscriptionId = null;
    let trialEnd = null;
    
    try {
      const stripeCustomerId = authSheet.getRange(rowIndex, 18).getValue(); // Column R: Stripe Customer ID
      const trialDays = data.trialDuration ? parseInt(data.trialDuration) : 14;
      
      if (stripeCustomerId) {
        const checkoutResult = createStripeCheckoutSession(userEmail, userName, company, stripeCustomerId, trialDays);
        if (checkoutResult.success) {
          checkoutUrl = checkoutResult.checkoutUrl;
          trialEnd = checkoutResult.trialEnd;
          Logger.log('✅ Stripe checkout created: ' + checkoutUrl);
        } else {
          Logger.log('Warning: Stripe checkout creation failed: ' + checkoutResult.error);
        }
      } else {
        Logger.log('Warning: No Stripe customer ID found for checkout session');
      }
    } catch (stripeError) {
      Logger.log('Warning: Error creating checkout session: ' + stripeError.toString());
    }
    
    // Log to approval notifications sheet
    logApprovalNotification(userEmail, userName, 'Approved', 0);
  
    Logger.log('Account approval completed successfully');
    
    // Return checkout URL so frontend can redirect user to pay
    const response = createResponse(true, 'Account approved successfully');
    if (checkoutUrl) {
      response.checkoutUrl = checkoutUrl;
      response.trialEnd = trialEnd;
    }
    return response;
  } catch (error) {
    Logger.log('Error approving account: ' + error.toString());
    Logger.log('Error stack: ' + (error.stack || 'No stack trace'));
    return createResponse(false, 'Error approving account: ' + error.toString());
  }
}

/**
 * Reject account (admin only)
 */
function handleRejectAccount(data) {
  Logger.log('=== handleRejectAccount called ===');
  Logger.log('Timestamp: ' + new Date().toISOString());
  Logger.log('Data received: ' + JSON.stringify(data || {}));
  
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = spreadsheet.getSheetByName(AUTH_SHEET_NAME);
    
    if (!authSheet) {
      Logger.log('ERROR: Authentication sheet not found');
      return createResponse(false, 'Authentication sheet not found');
    }
    
    // Verify admin
    const adminEmail = data.adminEmail ? data.adminEmail.toLowerCase().trim() : '';
    Logger.log('Admin email: ' + adminEmail);
    
    if (!isAdmin(adminEmail)) {
      Logger.log('ERROR: Unauthorized - not admin');
      return createResponse(false, 'Unauthorized: Admin access required');
    }
    
    const rowIndex = parseInt(data.rowIndex);
    Logger.log('Row index from data: ' + data.rowIndex + ', parsed: ' + rowIndex);
    
    if (!rowIndex || isNaN(rowIndex)) {
      Logger.log('ERROR: Invalid rowIndex: ' + data.rowIndex);
      return createResponse(false, 'Row index required and must be a number');
    }
    
    Logger.log('Rejecting account - Row: ' + rowIndex + ', Admin: ' + adminEmail);
    
    // Verify row exists
    const lastRow = authSheet.getLastRow();
    if (rowIndex < 1 || rowIndex > lastRow) {
      Logger.log('ERROR: Row index ' + rowIndex + ' is out of range. Last row: ' + lastRow);
      return createResponse(false, 'Invalid row index. Row ' + rowIndex + ' does not exist.');
    }
    
    // Get user email to send rejection notification
    const userEmail = authSheet.getRange(rowIndex, 2).getValue();
    const userName = authSheet.getRange(rowIndex, 1).getValue();
    const company = authSheet.getRange(rowIndex, 12).getValue() || COMPANY_NAME;
    
    Logger.log('User data - Email: ' + userEmail + ', Name: ' + userName);
    
    if (!userEmail) {
      Logger.log('ERROR: No email found in row ' + rowIndex);
      return createResponse(false, 'No user found in row ' + rowIndex);
    }
    
    // Update account status to Rejected
    Logger.log('Updating account status to Rejected in row ' + rowIndex);
    authSheet.getRange(rowIndex, 6).setValue('Rejected');
    SpreadsheetApp.flush();
    Logger.log('Account status updated successfully');
    
    // Verify the update
    const verifyStatus = authSheet.getRange(rowIndex, 6).getValue();
    Logger.log('Verified status: ' + verifyStatus);
    
    if (verifyStatus !== 'Rejected') {
      throw new Error('Status update failed. Expected "Rejected" but got "' + verifyStatus + '"');
    }
    
    // Send rejection email
    Logger.log('Sending rejection email to: ' + userEmail);
    try {
      sendAccountRejectionEmail(userEmail, userName, company);
      Logger.log('Rejection email sent successfully');
    } catch (emailError) {
      Logger.log('Warning: Email send failed: ' + emailError.toString());
      // Continue anyway - rejection is more important than email
    }
    
    Logger.log('Account rejection completed successfully');
    return createResponse(true, 'Account rejected successfully');
  } catch (error) {
    Logger.log('Error rejecting account: ' + error.toString());
    Logger.log('Error stack: ' + (error.stack || 'No stack trace'));
    return createResponse(false, 'Error rejecting account: ' + error.toString());
  }
}

/**
 * Check if user is admin
 */
function isAdmin(email) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const authSheet = spreadsheet.getSheetByName(AUTH_SHEET_NAME);
  
  if (!authSheet) {
    return false;
  }
  
  const range = authSheet.getDataRange();
  const values = range.getValues();
  
  for (let i = 2; i < values.length; i++) {
    const row = values[i];
    const userEmail = (row[1] || '').toLowerCase().trim();
    const role = (row[3] || '').toString();
    
    if (userEmail === email && role === 'Admin') {
      return true;
    }
  }
  
  return false;
}

/**
 * Hash password using SHA-256
 */
function hashPassword(password) {
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    password,
    Utilities.Charset.UTF_8
  ).map(function(byte) {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('');
}

/**
 * Verify password
 */
function verifyPassword(password, hash) {
  const hashedPassword = hashPassword(password);
  return hashedPassword === hash;
}

/**
 * Generate 6-digit verification code
 */
function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Create JSON response with CORS headers
 */
function createResponse(success, message, data) {
  try {
    Logger.log('=== createResponse called ===');
    Logger.log('success: ' + success + ', message: ' + message);
    Logger.log('data provided: ' + (data ? 'yes' : 'no'));
    
    const response = {
      success: success,
      message: message
    };
    
    if (data) {
      Object.assign(response, data);
    }
    
    const jsonString = JSON.stringify(response);
    Logger.log('Response JSON (first 500 chars): ' + jsonString.substring(0, 500));
    
    // Create output
    // Note: CORS headers are automatically handled by Google Apps Script
    // when Web App is deployed with "Anyone" access
    const output = ContentService.createTextOutput(jsonString)
      .setMimeType(ContentService.MimeType.JSON);
    
    Logger.log('Output created, MIME type: ' + ContentService.MimeType.JSON);
    Logger.log('Output type: ' + (output.constructor ? output.constructor.name : typeof output));
    
    return output;
  } catch (error) {
    Logger.log('ERROR in createResponse: ' + error.toString());
    Logger.log('ERROR stack: ' + (error.stack || 'No stack trace'));
    // Try to return a basic error response
    try {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Response creation error: ' + error.toString()
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (finalError) {
      Logger.log('FATAL: Cannot create any response: ' + finalError.toString());
      throw finalError;
    }
  }
}

/**
 * Setup Jobs sheet - creates the Jobs sheet with proper structure
 * Run this function once to initialize the Jobs sheet
 */
function setupJobsSheet() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let jobsSheet = spreadsheet.getSheetByName(JOBS_SHEET_NAME);
  
  if (jobsSheet) {
    // Sheet exists, just verify structure
    Logger.log('Jobs sheet already exists');
    return 'Jobs sheet already exists';
  }
  
  // Create new sheet
  jobsSheet = spreadsheet.insertSheet(JOBS_SHEET_NAME);
  
  // Set up headers (Row 1)
  const headers = [
    'Job ID',           // A: Auto-generated unique ID
    'Customer Name',    // B: Customer name
    'Customer Email',   // C: Customer email
    'Customer Phone',   // D: Customer phone
    'Service Type',     // E: Type of service (Cleaning, Repair, Inspection, etc.)
    'Status',           // F: Scheduled, In Progress, Completed, Cancelled
    'Scheduled Date',   // G: Date job is scheduled
    'Scheduled Time',  // H: Time job is scheduled
    'Assigned To',     // I: Technician/team member assigned
    'Address',         // J: Service address
    'Notes',           // K: Job notes/description
    'Created Date',    // L: When job was created
    'Completed Date',  // M: When job was completed
    'Invoice Amount',  // N: Invoice amount
    'Invoice Status'   // O: Paid, Unpaid, Pending
  ];
  
  jobsSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  
  // Format header row
  const headerRange = jobsSheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#3b82f6');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setFontSize(11);
  headerRange.setHorizontalAlignment('center');
  headerRange.setVerticalAlignment('middle');
  headerRange.setWrap(true);
  
  // Set column widths
  jobsSheet.setColumnWidth(1, 100);  // Job ID
  jobsSheet.setColumnWidth(2, 150);  // Customer Name
  jobsSheet.setColumnWidth(3, 180);  // Customer Email
  jobsSheet.setColumnWidth(4, 120);  // Customer Phone
  jobsSheet.setColumnWidth(5, 120);  // Service Type
  jobsSheet.setColumnWidth(6, 120);  // Status
  jobsSheet.setColumnWidth(7, 120);  // Scheduled Date
  jobsSheet.setColumnWidth(8, 100);   // Scheduled Time
  jobsSheet.setColumnWidth(9, 120);  // Assigned To
  jobsSheet.setColumnWidth(10, 200); // Address
  jobsSheet.setColumnWidth(11, 250); // Notes
  jobsSheet.setColumnWidth(12, 120); // Created Date
  jobsSheet.setColumnWidth(13, 120); // Completed Date
  jobsSheet.setColumnWidth(14, 100); // Invoice Amount
  jobsSheet.setColumnWidth(15, 100); // Invoice Status
  
  // Add data validation for Status column
  const statusRange = jobsSheet.getRange(2, 6, 1000, 1);
  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Scheduled', 'On the Way', 'In Progress', 'Ready for Payment', 'Completed', 'Cancelled'], true)
    .setAllowInvalid(false)
    .setHelpText('Select status: Scheduled, On the Way, In Progress, Ready for Payment, Completed, or Cancelled')
    .build();
  statusRange.setDataValidation(statusRule);
  
  // Add data validation for Service Type
  const serviceTypeRange = jobsSheet.getRange(2, 5, 1000, 1);
  const serviceTypeRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Pool Cleaning', 'Pool Repair', 'Inspection', 'Maintenance', 'Installation', 'Other'], true)
    .setAllowInvalid(false)
    .setHelpText('Select service type')
    .build();
  serviceTypeRange.setDataValidation(serviceTypeRule);
  
  // Add data validation for Invoice Status
  const invoiceStatusRange = jobsSheet.getRange(2, 15, 1000, 1);
  const invoiceStatusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Paid', 'Unpaid', 'Pending', 'N/A'], true)
    .setAllowInvalid(false)
    .setHelpText('Select invoice status')
    .build();
  invoiceStatusRange.setDataValidation(invoiceStatusRule);
  
  // Freeze header row
  jobsSheet.setFrozenRows(1);
  
  Logger.log('Jobs sheet created successfully');
  return 'Jobs sheet created successfully';
}

/**
 * Get jobs with filtering options
 */
function handleGetJobs(data) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const jobsSheet = spreadsheet.getSheetByName(JOBS_SHEET_NAME);
    
    if (!jobsSheet) {
      return createResponse(false, 'Jobs sheet not found. Run setupJobsSheet() first.');
    }
    
    // Get filter parameters
    const status = data.status || ''; // Filter by status
    const date = data.date || ''; // Filter by date (YYYY-MM-DD)
    const assignedTo = data.assignedTo || ''; // Filter by assigned technician
    const limit = parseInt(data.limit) || 100; // Limit results
    
    const range = jobsSheet.getDataRange();
    const values = range.getValues();
    
    if (values.length <= 1) {
      return createResponse(true, '', { jobs: [] });
    }
    
    const jobs = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Start from row 2 (skip header)
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const jobStatus = (row[5] || '').toString().trim();
      const scheduledDate = row[6]; // Column G
      const assigned = (row[8] || '').toString().trim();
      
      // Apply filters
      if (status && jobStatus !== status) continue;
      if (assignedTo && assigned !== assignedTo) continue;
      if (date) {
        const jobDate = scheduledDate ? new Date(scheduledDate) : null;
        if (jobDate) {
          jobDate.setHours(0, 0, 0, 0);
          const filterDate = new Date(date);
          filterDate.setHours(0, 0, 0, 0);
          if (jobDate.getTime() !== filterDate.getTime()) continue;
        } else {
          continue;
        }
      }
      
      // Build job object
      const job = {
        rowIndex: i + 1,
        jobId: row[0] || '',
        customerName: row[1] || '',
        customerEmail: row[2] || '',
        customerPhone: row[3] || '',
        serviceType: row[4] || '',
        status: jobStatus,
        scheduledDate: scheduledDate ? new Date(scheduledDate).toISOString() : '',
        scheduledTime: row[7] || '',
        assignedTo: assigned,
        address: row[9] || '',
        notes: row[10] || '',
        createdDate: row[11] ? new Date(row[11]).toISOString() : '',
        completedDate: row[12] ? new Date(row[12]).toISOString() : '',
        invoiceAmount: row[13] || '',
        invoiceStatus: row[14] || ''
      };
      
      jobs.push(job);
    }
    
    // Sort by scheduled date (most recent first)
    jobs.sort((a, b) => {
      if (!a.scheduledDate) return 1;
      if (!b.scheduledDate) return -1;
      return new Date(b.scheduledDate) - new Date(a.scheduledDate);
    });
    
    // Apply limit
    const limitedJobs = jobs.slice(0, limit);
    
    return createResponse(true, '', { jobs: limitedJobs });
  } catch (error) {
    Logger.log('Error getting jobs: ' + error.toString());
    return createResponse(false, 'Error getting jobs: ' + error.toString());
  }
}

/**
 * Create a new job
 */
function handleCreateJob(data) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const jobsSheet = spreadsheet.getSheetByName(JOBS_SHEET_NAME);
    
    if (!jobsSheet) {
      return createResponse(false, 'Jobs sheet not found. Run setupJobsSheet() first.');
    }
    
    // Validate required fields
    if (!data.customerName || !data.serviceType || !data.scheduledDate) {
      return createResponse(false, 'Customer name, service type, and scheduled date are required');
    }
    
    // Generate unique Job ID
    const jobId = 'JOB-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const now = new Date();
    
    // Prepare job row
    const newJob = [
      jobId,                                    // A: Job ID
      data.customerName || '',                  // B: Customer Name
      data.customerEmail || '',                 // C: Customer Email
      data.customerPhone || '',                 // D: Customer Phone
      data.serviceType || '',                   // E: Service Type
      data.status || 'Scheduled',               // F: Status
      new Date(data.scheduledDate),             // G: Scheduled Date
      data.scheduledTime || '',                 // H: Scheduled Time
      data.assignedTo || '',                    // I: Assigned To
      data.address || '',                       // J: Address
      data.notes || '',                         // K: Notes
      now,                                      // L: Created Date
      '',                                       // M: Completed Date
      data.invoiceAmount || '',                 // N: Invoice Amount
      data.invoiceStatus || 'Pending'           // O: Invoice Status
    ];
    
    jobsSheet.appendRow(newJob);
    const rowIndex = jobsSheet.getLastRow();
    
    Logger.log('Job created: ' + jobId + ' in row ' + rowIndex);
    
    return createResponse(true, 'Job created successfully', {
      jobId: jobId,
      rowIndex: rowIndex
    });
  } catch (error) {
    Logger.log('Error creating job: ' + error.toString());
    return createResponse(false, 'Error creating job: ' + error.toString());
  }
}

/**
 * Update an existing job
 */
function handleUpdateJob(data) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const jobsSheet = spreadsheet.getSheetByName(JOBS_SHEET_NAME);
    
    if (!jobsSheet) {
      return createResponse(false, 'Jobs sheet not found');
    }
    
    const rowIndex = parseInt(data.rowIndex);
    if (!rowIndex || isNaN(rowIndex)) {
      return createResponse(false, 'Row index required');
    }
    
    // Verify row exists
    const lastRow = jobsSheet.getLastRow();
    if (rowIndex < 2 || rowIndex > lastRow) {
      return createResponse(false, 'Invalid row index');
    }
    
    // Get current job data before updating
    const currentJobData = {
      customerName: jobsSheet.getRange(rowIndex, 2).getValue(),
      customerEmail: jobsSheet.getRange(rowIndex, 3).getValue(),
      customerPhone: jobsSheet.getRange(rowIndex, 4).getValue(),
      address: jobsSheet.getRange(rowIndex, 10).getValue(),
      assignedTo: jobsSheet.getRange(rowIndex, 9).getValue(),
      currentStatus: jobsSheet.getRange(rowIndex, 6).getValue()
    };
    
    // Update fields that are provided
    if (data.customerName !== undefined) {
      jobsSheet.getRange(rowIndex, 2).setValue(data.customerName);
    }
    if (data.customerEmail !== undefined) {
      jobsSheet.getRange(rowIndex, 3).setValue(data.customerEmail);
    }
    if (data.customerPhone !== undefined) {
      jobsSheet.getRange(rowIndex, 4).setValue(data.customerPhone);
    }
    if (data.serviceType !== undefined) {
      jobsSheet.getRange(rowIndex, 5).setValue(data.serviceType);
    }
    if (data.status !== undefined) {
      const oldStatus = currentJobData.currentStatus;
      const newStatus = data.status;
      
      jobsSheet.getRange(rowIndex, 6).setValue(newStatus);
      
      // Handle status change notifications
      if (oldStatus !== newStatus) {
        if (newStatus === 'On the Way') {
          // Send "On the Way" notification
          sendOnTheWayNotification(
            currentJobData.customerName || data.customerName,
            currentJobData.customerEmail || data.customerEmail,
            currentJobData.customerPhone || data.customerPhone,
            currentJobData.assignedTo || data.assignedTo,
            currentJobData.address || data.address
          );
        } else if (newStatus === 'Ready for Payment') {
          // Send "Ready for Payment" notification
          const invoiceAmount = jobsSheet.getRange(rowIndex, 14).getValue() || data.invoiceAmount || '';
          sendReadyForPaymentNotification(
            currentJobData.customerName || data.customerName,
            currentJobData.customerEmail || data.customerEmail,
            currentJobData.customerPhone || data.customerPhone,
            invoiceAmount
          );
        } else if (newStatus === 'Completed') {
          // Set completed date
          if (!jobsSheet.getRange(rowIndex, 13).getValue()) {
            jobsSheet.getRange(rowIndex, 13).setValue(new Date());
          }
          // Send completion notification with review request
          sendJobCompletionNotification(
            currentJobData.customerName || data.customerName,
            currentJobData.customerEmail || data.customerEmail,
            currentJobData.customerPhone || data.customerPhone
          );
        }
      }
    }
    if (data.scheduledDate !== undefined) {
      jobsSheet.getRange(rowIndex, 7).setValue(new Date(data.scheduledDate));
    }
    if (data.scheduledTime !== undefined) {
      jobsSheet.getRange(rowIndex, 8).setValue(data.scheduledTime);
    }
    if (data.assignedTo !== undefined) {
      jobsSheet.getRange(rowIndex, 9).setValue(data.assignedTo);
    }
    if (data.address !== undefined) {
      jobsSheet.getRange(rowIndex, 10).setValue(data.address);
    }
    if (data.notes !== undefined) {
      jobsSheet.getRange(rowIndex, 11).setValue(data.notes);
    }
    if (data.invoiceAmount !== undefined) {
      jobsSheet.getRange(rowIndex, 14).setValue(data.invoiceAmount);
    }
    if (data.invoiceStatus !== undefined) {
      jobsSheet.getRange(rowIndex, 15).setValue(data.invoiceStatus);
    }
    
    SpreadsheetApp.flush();
    
    Logger.log('Job updated in row ' + rowIndex);
    return createResponse(true, 'Job updated successfully');
  } catch (error) {
    Logger.log('Error updating job: ' + error.toString());
    return createResponse(false, 'Error updating job: ' + error.toString());
  }
}

/**
 * Delete a job
 */
function handleDeleteJob(data) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const jobsSheet = spreadsheet.getSheetByName(JOBS_SHEET_NAME);
    
    if (!jobsSheet) {
      return createResponse(false, 'Jobs sheet not found');
    }
    
    const rowIndex = parseInt(data.rowIndex);
    if (!rowIndex || isNaN(rowIndex)) {
      return createResponse(false, 'Row index required');
    }
    
    // Verify row exists
    const lastRow = jobsSheet.getLastRow();
    if (rowIndex < 2 || rowIndex > lastRow) {
      return createResponse(false, 'Invalid row index');
    }
    
    // Delete the row
    jobsSheet.deleteRow(rowIndex);
    
    Logger.log('Job deleted from row ' + rowIndex);
    return createResponse(true, 'Job deleted successfully');
  } catch (error) {
    Logger.log('Error deleting job: ' + error.toString());
    return createResponse(false, 'Error deleting job: ' + error.toString());
  }
}

/**
 * Get job statistics
 */
function handleGetJobStats(data) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const jobsSheet = spreadsheet.getSheetByName(JOBS_SHEET_NAME);
    
    if (!jobsSheet) {
      return createResponse(false, 'Jobs sheet not found');
    }
    
    const range = jobsSheet.getDataRange();
    const values = range.getValues();
    
    if (values.length <= 1) {
      return createResponse(true, '', {
        totalJobs: 0,
        todayJobs: 0,
        completedToday: 0,
        inProgress: 0,
        scheduled: 0
      });
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let totalJobs = 0;
    let todayJobs = 0;
    let completedToday = 0;
    let inProgress = 0;
    let scheduled = 0;
    
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const status = (row[5] || '').toString().trim();
      const scheduledDate = row[6];
      const completedDate = row[12];
      
      totalJobs++;
      
      if (status === 'In Progress') inProgress++;
      if (status === 'Scheduled') scheduled++;
      
      if (scheduledDate) {
        const jobDate = new Date(scheduledDate);
        jobDate.setHours(0, 0, 0, 0);
        if (jobDate.getTime() === today.getTime()) {
          todayJobs++;
        }
      }
      
      if (status === 'Completed' && completedDate) {
        const compDate = new Date(completedDate);
        compDate.setHours(0, 0, 0, 0);
        if (compDate.getTime() === today.getTime()) {
          completedToday++;
        }
      }
    }
    
    return createResponse(true, '', {
      totalJobs: totalJobs,
      todayJobs: todayJobs,
      completedToday: completedToday,
      inProgress: inProgress,
      scheduled: scheduled
    });
  } catch (error) {
    Logger.log('Error getting job stats: ' + error.toString());
    return createResponse(false, 'Error getting job stats: ' + error.toString());
  }
}

/**
 * Get Square API base URL
 */
function getSquareApiUrl() {
  return SQUARE_ENVIRONMENT === 'sandbox' 
    ? 'https://connect.squareupsandbox.com'
    : 'https://connect.squareup.com';
}

/**
 * Get Square customers
 */
function handleGetSquareCustomers(data) {
  try {
    const url = getSquareApiUrl() + '/v2/customers';
    
    const options = {
      method: 'get',
      headers: {
        'Square-Version': SQUARE_API_VERSION,
        'Authorization': 'Bearer ' + SQUARE_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode !== 200) {
      Logger.log('Square API error: ' + responseCode + ' - ' + responseText);
      return createResponse(false, 'Failed to fetch Square customers: ' + responseCode);
    }
    
    const result = JSON.parse(responseText);
    const customers = [];
    
    if (result.customers && Array.isArray(result.customers)) {
      result.customers.forEach(customer => {
        customers.push({
          id: customer.id,
          name: (customer.given_name || '') + ' ' + (customer.family_name || ''),
          email: customer.email_address || '',
          phone: customer.phone_number || '',
          address: customer.address ? 
            `${customer.address.address_line_1 || ''} ${customer.address.locality || ''} ${customer.address.administrative_district_level_1 || ''} ${customer.address.postal_code || ''}`.trim() : ''
        });
      });
    }
    
    return createResponse(true, '', { customers: customers });
  } catch (error) {
    Logger.log('Error getting Square customers: ' + error.toString());
    return createResponse(false, 'Error getting Square customers: ' + error.toString());
  }
}

/**
 * Get Square appointments
 */
function handleGetSquareAppointments(data) {
  try {
    const startDate = data.startDate || new Date().toISOString().split('T')[0];
    const endDate = data.endDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const url = getSquareApiUrl() + '/v2/bookings/search';
    
    const payload = {
      query: {
        filter: {
          location_ids: [SQUARE_LOCATION_ID],
          start_at_range: {
            start_at: startDate + 'T00:00:00Z',
            end_at: endDate + 'T23:59:59Z'
          }
        }
      },
      limit: 100
    };
    
    const options = {
      method: 'post',
      headers: {
        'Square-Version': SQUARE_API_VERSION,
        'Authorization': 'Bearer ' + SQUARE_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode !== 200) {
      Logger.log('Square API error: ' + responseCode + ' - ' + responseText);
      return createResponse(false, 'Failed to fetch Square appointments: ' + responseCode);
    }
    
    const result = JSON.parse(responseText);
    const appointments = [];
    
    if (result.bookings && Array.isArray(result.bookings)) {
      result.bookings.forEach(booking => {
        appointments.push({
          id: booking.id,
          customerName: booking.customer_id ? 'Customer ID: ' + booking.customer_id : 'Walk-in',
          serviceType: booking.appointment_segments && booking.appointment_segments.length > 0 
            ? booking.appointment_segments[0].service_variation_name || 'Service' 
            : 'Service',
          scheduledDate: booking.start_at ? new Date(booking.start_at).toISOString().split('T')[0] : '',
          scheduledTime: booking.start_at ? new Date(booking.start_at).toTimeString().split(' ')[0].substring(0, 5) : '',
          notes: booking.customer_note || '',
          squareBookingId: booking.id
        });
      });
    }
    
    return createResponse(true, '', { appointments: appointments });
  } catch (error) {
    Logger.log('Error getting Square appointments: ' + error.toString());
    return createResponse(false, 'Error getting Square appointments: ' + error.toString());
  }
}

/**
 * Sync Square appointments to Jobs sheet
 */
function handleSyncSquareAppointments(data) {
  try {
    const appointmentsResult = handleGetSquareAppointments({});
    if (!appointmentsResult.success || !appointmentsResult.appointments) {
      return createResponse(false, 'Failed to fetch Square appointments');
    }
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const jobsSheet = spreadsheet.getSheetByName(JOBS_SHEET_NAME);
    
    if (!jobsSheet) {
      return createResponse(false, 'Jobs sheet not found');
    }
    
    const appointments = appointmentsResult.appointments;
    let syncedCount = 0;
    let skippedCount = 0;
    
    appointments.forEach(appointment => {
      // Check if job already exists (by Square booking ID in notes or by matching date/time/customer)
      const existingJobs = jobsSheet.getDataRange().getValues();
      let exists = false;
      
      for (let i = 1; i < existingJobs.length; i++) {
        const notes = existingJobs[i][10] || ''; // Column K: Notes
        if (notes.includes('Square Booking ID: ' + appointment.squareBookingId)) {
          exists = true;
          break;
        }
      }
      
      if (!exists && appointment.scheduledDate) {
        // Create job from appointment
        const jobId = 'JOB-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        const now = new Date();
        
        const newJob = [
          jobId,
          appointment.customerName || '',
          '', // Email (will be filled from Square customer if available)
          '', // Phone (will be filled from Square customer if available)
          appointment.serviceType || 'Inspection',
          'Scheduled',
          new Date(appointment.scheduledDate),
          appointment.scheduledTime || '',
          '', // Assigned To
          '', // Address
          'Square Booking ID: ' + appointment.squareBookingId + (appointment.notes ? '\n' + appointment.notes : ''),
          now,
          '', // Completed Date
          '', // Invoice Amount
          'Pending' // Invoice Status
        ];
        
        jobsSheet.appendRow(newJob);
        syncedCount++;
      } else {
        skippedCount++;
      }
    });
    
    return createResponse(true, `Synced ${syncedCount} appointments, skipped ${skippedCount} existing`, {
      synced: syncedCount,
      skipped: skippedCount
    });
  } catch (error) {
    Logger.log('Error syncing Square appointments: ' + error.toString());
    return createResponse(false, 'Error syncing Square appointments: ' + error.toString());
  }
}

/**
 * Get technicians from Authentication sheet
 */
function handleGetTechnicians(data) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = spreadsheet.getSheetByName(AUTH_SHEET_NAME);
    
    if (!authSheet) {
      return createResponse(false, 'Authentication sheet not found');
    }
    
    const range = authSheet.getDataRange();
    const values = range.getValues();
    const technicians = [];
    
    // Start from row 2 (skip header)
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const name = row[0] || ''; // Column A: Name
      const email = row[1] || ''; // Column B: Email
      const role = row[3] || ''; // Column D: Role
      const accountStatus = row[5] || ''; // Column F: Account Status
      
      // Include Admin, Manager, User roles (exclude Guest)
      if (name && accountStatus === 'Approved' && (role === 'Admin' || role === 'Manager' || role === 'User')) {
        technicians.push({
          name: name,
          email: email,
          role: role
        });
      }
    }
    
    return createResponse(true, '', { technicians: technicians });
  } catch (error) {
    Logger.log('Error getting technicians: ' + error.toString());
    return createResponse(false, 'Error getting technicians: ' + error.toString());
  }
}

/**
 * Get route optimization for today's jobs
 */
function handleGetRouteOptimization(data) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const jobsSheet = spreadsheet.getSheetByName(JOBS_SHEET_NAME);
    
    if (!jobsSheet) {
      return createResponse(false, 'Jobs sheet not found');
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const range = jobsSheet.getDataRange();
    const values = range.getValues();
    const todayJobs = [];
    
    // Get today's jobs with addresses
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const scheduledDate = row[6]; // Column G
      const status = (row[5] || '').toString().trim();
      const address = row[9] || ''; // Column J
      
      if (scheduledDate && address) {
        const jobDate = new Date(scheduledDate);
        jobDate.setHours(0, 0, 0, 0);
        
        if (jobDate.getTime() === today.getTime() && 
            (status === 'Scheduled' || status === 'On the Way' || status === 'In Progress')) {
          todayJobs.push({
            rowIndex: i + 1,
            jobId: row[0] || '',
            customerName: row[1] || '',
            address: address,
            scheduledTime: row[7] || '',
            status: status
          });
        }
      }
    }
    
    if (todayJobs.length === 0) {
      return createResponse(true, 'No jobs today', { jobs: [], route: [] });
    }
    
    // Sort by scheduled time
    todayJobs.sort((a, b) => {
      if (!a.scheduledTime) return 1;
      if (!b.scheduledTime) return -1;
      return a.scheduledTime.localeCompare(b.scheduledTime);
    });
    
    // Generate route URLs for each job
    const route = todayJobs.map((job, index) => {
      const nextJob = todayJobs[index + 1];
      let directionsUrl = '';
      
      if (nextJob) {
        // Directions from current job to next job
        directionsUrl = `https://www.google.com/maps/dir/${encodeURIComponent(job.address)}/${encodeURIComponent(nextJob.address)}`;
      } else {
        // Last job - just show location
        directionsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}`;
      }
      
      return {
        ...job,
        directionsUrl: directionsUrl,
        appleMapsUrl: nextJob ? 
          `http://maps.apple.com/?daddr=${encodeURIComponent(nextJob.address)}&saddr=${encodeURIComponent(job.address)}` :
          `http://maps.apple.com/?q=${encodeURIComponent(job.address)}`
      };
    });
    
    return createResponse(true, '', { 
      jobs: todayJobs,
      route: route,
      totalJobs: todayJobs.length
    });
  } catch (error) {
    Logger.log('Error getting route optimization: ' + error.toString());
    return createResponse(false, 'Error getting route optimization: ' + error.toString());
  }
}

/**
 * Send "On the Way" notification to customer
 */
function sendOnTheWayNotification(customerName, customerEmail, customerPhone, technicianName, address) {
  try {
    // Send email
    if (customerEmail) {
      const subject = `${technicianName} with ${COMPANY_NAME} is on the way!`;
      const htmlBody = getOnTheWayEmailTemplate(customerName, technicianName, address);
      MailApp.sendEmail({
        to: customerEmail,
        subject: subject,
        htmlBody: htmlBody
      });
      Logger.log('On the Way email sent to: ' + customerEmail);
    }
    
    // Send SMS if Twilio is configured
    if (customerPhone && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
      const message = `${technicianName} with ${COMPANY_NAME} is on the way to your location! We'll see you soon.`;
      sendSMS(customerPhone, message);
      Logger.log('On the Way SMS sent to: ' + customerPhone);
    }
  } catch (error) {
    Logger.log('Error sending On the Way notification: ' + error.toString());
  }
}

/**
 * Send job completion notification with review request
 */
function sendJobCompletionNotification(customerName, customerEmail, customerPhone) {
  try {
    // Send email
    if (customerEmail) {
      const subject = `Your service with ${COMPANY_NAME} is complete!`;
      const htmlBody = getJobCompletionEmailTemplate(customerName);
      MailApp.sendEmail({
        to: customerEmail,
        subject: subject,
        htmlBody: htmlBody
      });
      Logger.log('Completion email sent to: ' + customerEmail);
    }
    
    // Send SMS if Twilio is configured
    if (customerPhone && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
      const message = `Your service with ${COMPANY_NAME} is complete! We'd love your feedback. Please leave us a review.`;
      sendSMS(customerPhone, message);
      Logger.log('Completion SMS sent to: ' + customerPhone);
    }
  } catch (error) {
    Logger.log('Error sending completion notification: ' + error.toString());
  }
}

/**
 * Send SMS via Twilio
 */
function sendSMS(toPhone, message) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    Logger.log('Twilio not configured, skipping SMS');
    return;
  }
  
  try {
    const url = 'https://api.twilio.com/2010-04-01/Accounts/' + TWILIO_ACCOUNT_SID + '/Messages.json';
    const payload = {
      'From': TWILIO_PHONE,
      'To': toPhone,
      'Body': message
    };
    
    const options = {
      method: 'post',
      headers: {
        'Authorization': 'Basic ' + Utilities.base64Encode(TWILIO_ACCOUNT_SID + ':' + TWILIO_AUTH_TOKEN)
      },
      payload: payload,
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode === 200 || responseCode === 201) {
      Logger.log('SMS sent successfully to: ' + toPhone);
    } else {
      Logger.log('SMS send failed: ' + responseCode + ' - ' + response.getContentText());
    }
  } catch (error) {
    Logger.log('Error sending SMS: ' + error.toString());
  }
}

/**
 * Get "On the Way" email template
 */
function getOnTheWayEmailTemplate(customerName, technicianName, address) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f3f4f6;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f3f4f6; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); overflow: hidden;">
              <tr>
                <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px; text-align: center;">
                  <img src="${LOGO_URL}" alt="${COMPANY_NAME}" style="max-width: 200px; height: auto; margin-bottom: 20px;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">We're On The Way!</h1>
                </td>
              </tr>
              <tr>
                <td style="padding: 40px;">
                  <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.6;">Hi ${customerName || 'there'},</p>
                  <p style="margin: 0 0 30px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                    Great news! <strong>${technicianName}</strong> with ${COMPANY_NAME} is on the way to your location.
                  </p>
                  ${address ? `<p style="margin: 0 0 20px 0; color: #6b7280; font-size: 14px; line-height: 1.6;"><strong>Location:</strong> ${address}</p>` : ''}
                  <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                    We'll see you soon!
                  </p>
                  <p style="margin: 30px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                    If you have any questions, please contact us at ${COMPANY_EMAIL} or ${COMPANY_PHONE}.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

/**
 * Get job completion email template with review request
 */
function getJobCompletionEmailTemplate(customerName) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f3f4f6;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f3f4f6; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); overflow: hidden;">
              <tr>
                <td style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 40px; text-align: center;">
                  <img src="${LOGO_URL}" alt="${COMPANY_NAME}" style="max-width: 200px; height: auto; margin-bottom: 20px;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Service Complete!</h1>
                </td>
              </tr>
              <tr>
                <td style="padding: 40px;">
                  <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.6;">Hi ${customerName || 'there'},</p>
                  <p style="margin: 0 0 30px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                    Your service with ${COMPANY_NAME} has been completed! We hope you're satisfied with our work.
                  </p>
                  <div style="background: #f9fafb; border-radius: 12px; padding: 24px; margin: 30px 0; text-align: center;">
                    <p style="margin: 0 0 16px 0; color: #374151; font-size: 16px; font-weight: 600;">
                      We'd love your feedback!
                    </p>
                    <p style="margin: 0 0 24px 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                      Your review helps us serve you better and helps other customers find quality service.
                    </p>
                    <a href="https://www.google.com/search?q=${encodeURIComponent(COMPANY_NAME + ' reviews')}" 
                       style="display: inline-block; padding: 14px 32px; background-color: #3b82f6; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
                      Leave Us a Review
                    </a>
                  </div>
                  <p style="margin: 30px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                    If you have any questions or concerns, please contact us at ${COMPANY_EMAIL} or ${COMPANY_PHONE}.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}



/**
 * Send verification email
 */
function sendVerificationEmail(email, name, code, company) {
  try {
    Logger.log('=== sendVerificationEmail called ===');
    Logger.log('To: ' + email + ', Name: ' + name + ', Code: ' + code);
    
    const subject = 'Verify Your Email - ' + (company || COMPANY_NAME);
    const htmlBody = getVerificationEmailTemplate(name, code, company);
    
    MailApp.sendEmail({
      to: email,
      subject: subject,
      htmlBody: htmlBody
    });
    
    Logger.log('Verification email sent successfully');
  } catch (error) {
    Logger.log('ERROR in sendVerificationEmail: ' + error.toString());
    throw error; // Re-throw so caller can handle
  }
}

/**
 * Send password reset email
 */
function sendPasswordResetEmail(email, name, code, company) {
  try {
    Logger.log('=== sendPasswordResetEmail called ===');
    Logger.log('To: ' + email + ', Name: ' + name + ', Code: ' + code);
    
    const subject = 'Password Reset Code - ' + (company || COMPANY_NAME);
    const htmlBody = getPasswordResetEmailTemplate(name, code, company);
    
    MailApp.sendEmail({
      to: email,
      subject: subject,
      htmlBody: htmlBody
    });
    
    Logger.log('Password reset email sent successfully');
  } catch (error) {
    Logger.log('ERROR in sendPasswordResetEmail: ' + error.toString());
    throw error; // Re-throw so caller can handle
  }
}

/**
 * Send admin notification for pending account
 */
function sendAdminNotification(userEmail, userName, company) {
  const adminEmail = 'samr@aqualitypoolcompanyusa.com';
  const subject = 'New Account Request - ' + (company || COMPANY_NAME);
  const htmlBody = getAdminNotificationTemplate(userEmail, userName, company);
  
  MailApp.sendEmail({
    to: adminEmail,
    subject: subject,
    htmlBody: htmlBody
  });
}

/**
 * Send account approval email
 */
function sendAccountApprovalEmail(email, name, company) {
  const subject = 'Account Approved - ' + (company || COMPANY_NAME);
  const htmlBody = getAccountApprovalEmailTemplate(name, company);
  
  MailApp.sendEmail({
    to: email,
    subject: subject,
    htmlBody: htmlBody
  });
}

/**
 * Send account rejection email
 */
function sendAccountRejectionEmail(email, name, company) {
  const subject = 'Account Request - ' + (company || COMPANY_NAME);
  const htmlBody = getAccountRejectionEmailTemplate(name, company);
  
  MailApp.sendEmail({
    to: email,
    subject: subject,
    htmlBody: htmlBody
  });
}

/**
 * Get verification email HTML template
 */
function getVerificationEmailTemplate(name, code, company) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f3f4f6;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); overflow: hidden;">
          <tr>
            <td style="background: linear-gradient(135deg, #0369a1 0%, #0284c7 100%); padding: 40px; text-align: center;">
              <img src="${LOGO_URL}" alt="${company || COMPANY_NAME}" style="max-width: 200px; height: auto; margin-bottom: 20px;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Email Verification</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.6;">Hi ${name || 'there'},</p>
              <p style="margin: 0 0 30px 0; color: #374151; font-size: 16px; line-height: 1.6;">Thank you for creating an account with ${company || COMPANY_NAME}. Please verify your email address using the code below:</p>
              <div style="background-color: #f3f4f6; border: 2px dashed #0369a1; border-radius: 12px; padding: 30px; text-align: center; margin: 30px 0;">
                <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Verification Code</p>
                <p style="margin: 0; color: #0369a1; font-size: 36px; font-weight: 700; letter-spacing: 8px; font-family: 'Courier New', monospace;">${code}</p>
              </div>
              <p style="margin: 30px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">This code will expire in 1 hour. If you didn't request this code, please ignore this email.</p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f9fafb; padding: 30px 40px; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 12px;">© ${new Date().getFullYear()} ${company || COMPANY_NAME}. All rights reserved.</p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">${COMPANY_EMAIL}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Get password reset email HTML template
 */
function getPasswordResetEmailTemplate(name, code, company) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f3f4f6;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); overflow: hidden;">
          <tr>
            <td style="background: linear-gradient(135deg, #0369a1 0%, #0284c7 100%); padding: 40px; text-align: center;">
              <img src="${LOGO_URL}" alt="${company || COMPANY_NAME}" style="max-width: 200px; height: auto; margin-bottom: 20px;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Password Reset</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.6;">Hi ${name || 'there'},</p>
              <p style="margin: 0 0 30px 0; color: #374151; font-size: 16px; line-height: 1.6;">We received a request to reset your password for your ${company || COMPANY_NAME} account. Use the code below to reset your password:</p>
              <div style="background-color: #f3f4f6; border: 2px dashed #0369a1; border-radius: 12px; padding: 30px; text-align: center; margin: 30px 0;">
                <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Reset Code</p>
                <p style="margin: 0; color: #0369a1; font-size: 36px; font-weight: 700; letter-spacing: 8px; font-family: 'Courier New', monospace;">${code}</p>
              </div>
              <p style="margin: 30px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">This code will expire in 1 hour. If you didn't request a password reset, please ignore this email and your password will remain unchanged.</p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f9fafb; padding: 30px 40px; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 12px;">© ${new Date().getFullYear()} ${company || COMPANY_NAME}. All rights reserved.</p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">${COMPANY_EMAIL}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Get admin notification email template
 */
function getAdminNotificationTemplate(userEmail, userName, company) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f3f4f6;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); overflow: hidden;">
          <tr>
            <td style="background: linear-gradient(135deg, #0369a1 0%, #0284c7 100%); padding: 40px; text-align: center;">
              <img src="${LOGO_URL}" alt="${company || COMPANY_NAME}" style="max-width: 200px; height: auto; margin-bottom: 20px;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">New Account Request</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.6;">A new account request requires your approval:</p>
              <div style="background-color: #f3f4f6; border-left: 4px solid #0369a1; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0 0 10px 0; color: #374151; font-size: 16px;"><strong>Name:</strong> ${userName || 'N/A'}</p>
                <p style="margin: 0 0 10px 0; color: #374151; font-size: 16px;"><strong>Email:</strong> ${userEmail}</p>
                <p style="margin: 0; color: #374151; font-size: 16px;"><strong>Company:</strong> ${company || COMPANY_NAME}</p>
              </div>
              <p style="margin: 30px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">Please log in to the dashboard to approve or reject this account request.</p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f9fafb; padding: 30px 40px; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 12px;">© ${new Date().getFullYear()} ${company || COMPANY_NAME}. All rights reserved.</p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">${COMPANY_EMAIL}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Get account approval email template
 */
function getAccountApprovalEmailTemplate(name, company) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f3f4f6;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); overflow: hidden;">
          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px; text-align: center;">
              <img src="${LOGO_URL}" alt="${company || COMPANY_NAME}" style="max-width: 200px; height: auto; margin-bottom: 20px;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Account Approved!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.6;">Hi ${name || 'there'},</p>
              <p style="margin: 0 0 30px 0; color: #374151; font-size: 16px; line-height: 1.6;">Great news! Your account with ${company || COMPANY_NAME} has been approved. You can now log in and access all features.</p>
              <div style="background-color: #d1fae5; border-left: 4px solid #10b981; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; color: #065f46; font-size: 14px; line-height: 1.6;">✓ Your account is now active and ready to use</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f9fafb; padding: 30px 40px; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 12px;">© ${new Date().getFullYear()} ${company || COMPANY_NAME}. All rights reserved.</p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">${COMPANY_EMAIL}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Get account rejection email template
 */
function getAccountRejectionEmailTemplate(name, company) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f3f4f6;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); overflow: hidden;">
          <tr>
            <td style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 40px; text-align: center;">
              <img src="${LOGO_URL}" alt="${company || COMPANY_NAME}" style="max-width: 200px; height: auto; margin-bottom: 20px;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Account Request</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.6;">Hi ${name || 'there'},</p>
              <p style="margin: 0 0 30px 0; color: #374151; font-size: 16px; line-height: 1.6;">We regret to inform you that your account request with ${company || COMPANY_NAME} has been declined at this time.</p>
              <p style="margin: 0 0 20px 0; color: #6b7280; font-size: 14px; line-height: 1.6;">If you have any questions, please contact us at ${COMPANY_EMAIL}.</p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f9fafb; padding: 30px 40px; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 12px;">© ${new Date().getFullYear()} ${company || COMPANY_NAME}. All rights reserved.</p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">${COMPANY_EMAIL}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}


/**
 * Get Stripe earnings (daily and monthly)
 */
function handleGetStripeEarnings(data) {
  try {
    const period = data.period || 'today'; // 'today', 'month', 'all'
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let startDate = null;
    let endDate = null;
    
    if (period === 'today') {
      startDate = Math.floor(today.getTime() / 1000);
      endDate = Math.floor((today.getTime() + 24 * 60 * 60 * 1000) / 1000);
    } else if (period === 'month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      startDate = Math.floor(firstDay.getTime() / 1000);
      endDate = Math.floor((today.getTime() + 24 * 60 * 60 * 1000) / 1000);
    } else {
      // All time
      startDate = 0;
      endDate = Math.floor(Date.now() / 1000);
    }
    
    // Get charges from Stripe
    const url = STRIPE_API_URL + '/charges';
    
    // Build query parameters
    let queryParams = [];
    queryParams.push('limit=100');
    if (startDate) {
      queryParams.push('created[gte]=' + startDate);
    }
    if (endDate) {
      queryParams.push('created[lte]=' + endDate);
    }
    
    const options = {
      method: 'get',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY
      },
      muteHttpExceptions: true
    };
    
    const fullUrl = url + '?' + queryParams.join('&');
    const response = UrlFetchApp.fetch(fullUrl, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode !== 200) {
      Logger.log('Stripe API error: ' + responseCode + ' - ' + responseText);
      return createResponse(false, 'Failed to fetch Stripe earnings: ' + responseCode);
    }
    
    const result = JSON.parse(responseText);
    let totalAmount = 0;
    let chargeCount = 0;
    
    if (result.data && Array.isArray(result.data)) {
      result.data.forEach(charge => {
        if (charge.paid && charge.status === 'succeeded') {
          totalAmount += charge.amount; // Amount is in cents
          chargeCount++;
        }
      });
      
      // Handle pagination if there are more than 100 charges
      if (result.has_more && result.data.length === 100) {
        Logger.log('Note: More than 100 charges found, showing first 100');
      }
    }
    
    // Convert from cents to dollars
    const totalDollars = (totalAmount / 100).toFixed(2);
    
    return createResponse(true, '', {
      period: period,
      totalAmount: parseFloat(totalDollars),
      chargeCount: chargeCount,
      currency: 'USD'
    });
  } catch (error) {
    Logger.log('Error getting Stripe earnings: ' + error.toString());
    return createResponse(false, 'Error getting Stripe earnings: ' + error.toString());
  }
}

/**
 * Send "Ready for Payment" notification to customer
 */
function sendReadyForPaymentNotification(customerName, customerEmail, customerPhone, invoiceAmount) {
  try {
    // Send email
    if (customerEmail) {
      const subject = `Payment Request - ${COMPANY_NAME}`;
      const htmlBody = getReadyForPaymentEmailTemplate(customerName, invoiceAmount);
      MailApp.sendEmail({
        to: customerEmail,
        subject: subject,
        htmlBody: htmlBody
      });
      Logger.log('Ready for Payment email sent to: ' + customerEmail);
    }
    
    // Send SMS if Twilio is configured
    if (customerPhone && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
      const amountText = invoiceAmount ? ` of $${parseFloat(invoiceAmount).toFixed(2)}` : '';
      const message = `Your service with ${COMPANY_NAME} is complete and ready for payment${amountText}. Please check your email for payment details.`;
      sendSMS(customerPhone, message);
      Logger.log('Ready for Payment SMS sent to: ' + customerPhone);
    }
  } catch (error) {
    Logger.log('Error sending Ready for Payment notification: ' + error.toString());
  }
}

/**
 * Get "Ready for Payment" email template
 */
function getReadyForPaymentEmailTemplate(customerName, invoiceAmount) {
  const amountText = invoiceAmount ? `$${parseFloat(invoiceAmount).toFixed(2)}` : 'the amount due';
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f3f4f6;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f3f4f6; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); overflow: hidden;">
              <tr>
                <td style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); padding: 40px; text-align: center;">
                  <img src="${LOGO_URL}" alt="${COMPANY_NAME}" style="max-width: 200px; height: auto; margin-bottom: 20px;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Ready for Payment</h1>
                </td>
              </tr>
              <tr>
                <td style="padding: 40px;">
                  <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.6;">Hi ${customerName || 'there'},</p>
                  <p style="margin: 0 0 30px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                    Your service with ${COMPANY_NAME} is complete and ready for payment.
                  </p>
                  ${invoiceAmount ? `
                    <div style="background: #f9fafb; border-radius: 12px; padding: 24px; margin: 30px 0; text-align: center; border: 2px solid #e5e7eb;">
                      <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px; font-weight: 600;">Amount Due</p>
                      <p style="margin: 0; color: #111827; font-size: 32px; font-weight: 700;">${amountText}</p>
                    </div>
                  ` : ''}
                  <div style="background: #fef3c7; border-radius: 12px; padding: 20px; margin: 30px 0;">
                    <p style="margin: 0 0 12px 0; color: #92400e; font-size: 14px; font-weight: 600;">
                      <i class="fas fa-info-circle"></i> Payment Instructions
                    </p>
                    <p style="margin: 0; color: #78350f; font-size: 14px; line-height: 1.6;">
                      Please contact us at ${COMPANY_EMAIL} or ${COMPANY_PHONE} to complete your payment. We accept all major credit cards and payment methods.
                    </p>
                  </div>
                  <p style="margin: 30px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                    If you have any questions about your invoice, please don't hesitate to reach out to us.
                  </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * TEST FUNCTION - Run this to trigger permission authorization
 * This will force Apps Script to prompt for all required permissions
 * 
 * IMPORTANT: When you run this, it WILL fail with a permission error.
 * That's expected - it will show you a link to authorize permissions.
 * Click that link and grant ALL permissions.
 */
function testPermissions() {
  try {
    // This will trigger external_request permission
    // It WILL fail the first time - that's how you get the authorization link
    const testResponse = UrlFetchApp.fetch('https://www.google.com');
    Logger.log('External request works: ' + testResponse.getResponseCode());
    return 'Permissions are already authorized!';
  } catch (error) {
    Logger.log('Permission error (this is expected on first run): ' + error.toString());
    // The error message should contain a link to authorize
    // Look for a URL in the error or check the execution log
    throw new Error('PERMISSION REQUIRED: Check the execution log above. There should be a link to authorize. Click it, grant permissions, then run this function again.');
  }
}

/**
 * TEST FUNCTION - Run this in the script editor to test doGet
 * This simulates a real request to test if everything is working
 */
function testDoGet() {
  Logger.log('========================================');
  Logger.log('=== TESTING doGet FUNCTION ===');
  Logger.log('========================================');
  
  // Test 1: Ping/Health Check
  Logger.log('\n--- TEST 1: Ping Endpoint ---');
  try {
    const pingResult = doGet({ parameter: { action: 'ping' } });
    const pingContent = pingResult.getContent();
    Logger.log('Ping Result: ' + pingContent);
    Logger.log('Ping MIME Type: ' + pingResult.getMimeType());
    Logger.log('✅ Ping test PASSED');
  } catch (error) {
    Logger.log('❌ Ping test FAILED: ' + error.toString());
  }
  
  // Test 2: Proxy Approve Account (with invalid rowIndex for safety)
  Logger.log('\n--- TEST 2: Proxy Approve Account (Test Mode) ---');
  try {
    // Use a very high rowIndex that won't exist (9999) to test without affecting real data
    const approveResult = doGet({ 
      parameter: { 
        proxy: 'true',
        action: 'approveAccount',
        rowIndex: '9999', // This won't exist, so it will return an error safely
        adminEmail: 'test@example.com'
      } 
    });
    const approveContent = approveResult.getContent();
    Logger.log('Approve Result: ' + approveContent);
    Logger.log('Approve MIME Type: ' + approveResult.getMimeType());
    
    // Check if it's JSON
    if (approveContent.trim().startsWith('{')) {
      Logger.log('✅ Approve test PASSED - Returns JSON');
    } else {
      Logger.log('❌ Approve test FAILED - Returns HTML instead of JSON');
      Logger.log('Content preview: ' + approveContent.substring(0, 200));
    }
  } catch (error) {
    Logger.log('❌ Approve test FAILED: ' + error.toString());
    Logger.log('Error stack: ' + (error.stack || 'No stack trace'));
  }
  
  // Test 3: Proxy Get Pending Accounts
  Logger.log('\n--- TEST 3: Proxy Get Pending Accounts ---');
  try {
    const pendingResult = doGet({ 
      parameter: { 
        proxy: 'true',
        action: 'getPendingAccounts',
        email: 'test@example.com' // This will fail auth check, but should return JSON error
      } 
    });
    const pendingContent = pendingResult.getContent();
    Logger.log('Pending Result: ' + pendingContent);
    Logger.log('Pending MIME Type: ' + pendingResult.getMimeType());
    
    if (pendingContent.trim().startsWith('{')) {
      Logger.log('✅ Pending test PASSED - Returns JSON');
    } else {
      Logger.log('❌ Pending test FAILED - Returns HTML instead of JSON');
    }
  } catch (error) {
    Logger.log('❌ Pending test FAILED: ' + error.toString());
  }
  
  // Test 4: Invalid Action
  Logger.log('\n--- TEST 4: Invalid Action (Should return JSON error) ---');
  try {
    const invalidResult = doGet({ 
      parameter: { 
        proxy: 'true',
        action: 'invalidAction123'
      } 
    });
    const invalidContent = invalidResult.getContent();
    Logger.log('Invalid Action Result: ' + invalidContent);
    
    if (invalidContent.trim().startsWith('{')) {
      Logger.log('✅ Invalid action test PASSED - Returns JSON error (as expected)');
    } else {
      Logger.log('❌ Invalid action test FAILED - Returns HTML instead of JSON');
    }
  } catch (error) {
    Logger.log('❌ Invalid action test FAILED: ' + error.toString());
  }
  
  // Test 5: No Parameters (Should serve dashboard or return JSON)
  Logger.log('\n--- TEST 5: No Parameters ---');
  try {
    const noParamsResult = doGet({ parameter: {} });
    const noParamsContent = noParamsResult.getContent();
    Logger.log('No Params Result Type: ' + (noParamsResult.getMimeType() || 'unknown'));
    Logger.log('Result is HTML: ' + (noParamsContent.trim().startsWith('<!') || noParamsContent.trim().startsWith('<html')));
    Logger.log('✅ No params test completed');
  } catch (error) {
    Logger.log('❌ No params test FAILED: ' + error.toString());
  }
  
  Logger.log('\n========================================');
  Logger.log('=== TEST COMPLETE ===');
  Logger.log('Check the logs above for results');
  Logger.log('All tests should return JSON (not HTML)');
  Logger.log('========================================');
}

/**
 * QUICK TEST - Simple test to verify doGet is callable
 */
function quickTest() {
  Logger.log('Quick Test: Calling doGet with ping action...');
  try {
    const result = doGet({ parameter: { action: 'ping' } });
    const content = result.getContent();
    Logger.log('Result: ' + content);
    Logger.log('MIME Type: ' + result.getMimeType());
    
    if (content.includes('"success":true')) {
      Logger.log('✅ SUCCESS: Script is working!');
      return true;
    } else {
      Logger.log('❌ FAILED: Unexpected response');
      return false;
    }
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.toString());
    Logger.log('Stack: ' + (error.stack || 'No stack'));
    return false;
  }
}

/**
 * TEST APPROVE ACCOUNT - Test with a specific rowIndex
 * WARNING: This will actually try to approve an account if the rowIndex exists!
 * Only use this if you know what you're doing.
 */
function testApproveAccount(rowIndex, adminEmail) {
  Logger.log('========================================');
  Logger.log('=== TESTING APPROVE ACCOUNT ===');
  Logger.log('Row Index: ' + rowIndex);
  Logger.log('Admin Email: ' + adminEmail);
  Logger.log('========================================');
  
  if (!rowIndex || !adminEmail) {
    Logger.log('ERROR: rowIndex and adminEmail are required');
    Logger.log('Usage: testApproveAccount(5, "admin@example.com")');
    return;
  }
  
  try {
    const result = doGet({ 
      parameter: { 
        proxy: 'true',
        action: 'approveAccount',
        rowIndex: rowIndex.toString(),
        adminEmail: adminEmail
      } 
    });
    
    const content = result.getContent();
    Logger.log('Result: ' + content);
    Logger.log('MIME Type: ' + result.getMimeType());
    
    // Parse and display
    try {
      const json = JSON.parse(content);
      Logger.log('Parsed JSON:');
      Logger.log('  Success: ' + json.success);
      Logger.log('  Message: ' + json.message);
      
      if (json.success) {
        Logger.log('✅ Account approved successfully!');
      } else {
        Logger.log('❌ Approval failed: ' + json.message);
      }
    } catch (parseError) {
      Logger.log('❌ Response is not valid JSON!');
      Logger.log('Response preview: ' + content.substring(0, 500));
    }
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.toString());
    Logger.log('Stack: ' + (error.stack || 'No stack'));
  }
}

/**
 * QUICK TEST FOR ROW 6
 * Run this function to test approving row 6
 * Update the adminEmail below to your admin email address
 */
function testRow6() {
  // UPDATE THIS EMAIL to your admin email
  const adminEmail = 'samr@aqualitypoolcompanyusa.com'; // Change this if needed
  const rowIndex = 5;
  
  Logger.log('========================================');
  Logger.log('=== TESTING ROW 6 APPROVE ===');
  Logger.log('Row Index: ' + rowIndex);
  Logger.log('Admin Email: ' + adminEmail);
  Logger.log('========================================');
  
  // Call the approve function
  const data = {
    email: adminEmail,
    rowIndex: rowIndex,
    approvedBy: adminEmail
  };
  
  const result = handleApproveAccount(data);
  
  // Log result
  Logger.log('\n========================================');
  Logger.log('=== RESULT ===');
  Logger.log('========================================');
  const content = result.getContent();
  Logger.log(content);
  
  try {
    const json = JSON.parse(content);
      
    if (json.success) {
      Logger.log('✅ Account approved successfully!');
    } else {
      Logger.log('❌ Approval failed: ' + json.message);
    }
  } catch (parseError) {
    Logger.log('❌ Response is not valid JSON!');
    Logger.log('Response preview: ' + content.substring(0, 500));
  }
}

// ==================== SQUARE SETTINGS MANAGEMENT ====================

/**
 * Get Square settings for the logged-in user's company
 */
function handleGetSquareSettings(data) {
  try {
    const email = data.email;
    if (!email) {
      return createResponse(false, 'Email is required');
    }
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = ss.getSheetByName(AUTH_SHEET_NAME);
    
    if (!authSheet) {
      return createResponse(false, 'Authentication sheet not found');
    }
    
    const sheetData = authSheet.getDataRange().getValues();
    if (sheetData.length < 3) {
      return createResponse(false, 'No user data found');
    }
    
    // Headers in row 2
    const headers = sheetData[1];
    const emailCol = headers.indexOf('Email');
    const settingsCol = headers.indexOf('Settings');
    
    if (emailCol === -1 || settingsCol === -1) {
      return createResponse(false, 'Required columns not found');
    }
    
    // Find user's row
    for (let i = 2; i < sheetData.length; i++) {
      if (sheetData[i][emailCol] && sheetData[i][emailCol].toString().toLowerCase() === email.toLowerCase()) {
        const settingsStr = sheetData[i][settingsCol] || '{}';
        let settings = {};
        
        try {
          settings = JSON.parse(settingsStr);
        } catch (e) {
          settings = {};
        }
        
        // Return Square settings if they exist
        if (settings.square) {
          return createResponse(true, 'Settings loaded', { settings: settings.square });
        } else {
          return createResponse(true, 'No Square settings', { settings: null });
        }
      }
    }
    
    return createResponse(false, 'User not found');
  } catch (error) {
    Logger.log('Error in handleGetSquareSettings: ' + error);
    return createResponse(false, error.toString());
  }
}

/**
 * Save Square settings for the logged-in user's company
 */
function handleSaveSquareSettings(data) {
  try {
    const email = data.email;
    const accessToken = data.accessToken;
    const applicationId = data.applicationId;
    const environment = data.environment || 'production';
    
    if (!email) {
      return createResponse(false, 'Email is required');
    }
    
    if (!accessToken || !applicationId) {
      return createResponse(false, 'Access Token and Application ID are required');
    }
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = ss.getSheetByName(AUTH_SHEET_NAME);
    
    if (!authSheet) {
      return createResponse(false, 'Authentication sheet not found');
    }
    
    const sheetData = authSheet.getDataRange().getValues();
    const headers = sheetData[1];
    const emailCol = headers.indexOf('Email');
    const settingsCol = headers.indexOf('Settings');
    
    if (emailCol === -1 || settingsCol === -1) {
      return createResponse(false, 'Required columns not found');
    }
    
    // Find user's row
    for (let i = 2; i < sheetData.length; i++) {
      if (sheetData[i][emailCol] && sheetData[i][emailCol].toString().toLowerCase() === email.toLowerCase()) {
        const settingsStr = sheetData[i][settingsCol] || '{}';
        let settings = {};
        
        try {
          settings = JSON.parse(settingsStr);
        } catch (e) {
          settings = {};
        }
        
        // Update Square settings
        settings.square = {
          accessToken: accessToken,
          applicationId: applicationId,
          environment: environment,
          lastSync: settings.square ? settings.square.lastSync : null,
          enabled: true
        };
        
        // Save back to sheet
        authSheet.getRange(i + 1, settingsCol + 1).setValue(JSON.stringify(settings));
        
        return createResponse(true, 'Square settings saved successfully');
      }
    }
    
    return createResponse(false, 'User not found');
  } catch (error) {
    Logger.log('Error in handleSaveSquareSettings: ' + error);
    return createResponse(false, error.toString());
  }
}

/**
 * Import Square customers into Customers sheet
 */
function handleImportSquareCustomers(data) {
  try {
    const email = data.email;
    if (!email) {
      return createResponse(false, 'Email is required');
    }
    
    // Call the importSquareCustomers function from PoolCalculator.gs
    // Since this is in AuthenticationScript, we need to reference it
    // The function should already be available in the PoolCalculator script
    
    // First, get company ID
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = ss.getSheetByName(AUTH_SHEET_NAME);
    
    if (!authSheet) {
      return createResponse(false, 'Authentication sheet not found');
    }
    
    const sheetData = authSheet.getDataRange().getValues();
    const headers = sheetData[1];
    const emailCol = headers.indexOf('Email');
    const companyIdCol = headers.indexOf('Company ID');
    const settingsCol = headers.indexOf('Settings');
    
    let companyId = null;
    let squareSettings = null;
    
    // Find user and get their company ID and settings
    for (let i = 2; i < sheetData.length; i++) {
      if (sheetData[i][emailCol] && sheetData[i][emailCol].toString().toLowerCase() === email.toLowerCase()) {
        companyId = sheetData[i][companyIdCol];
        const settingsStr = sheetData[i][settingsCol] || '{}';
        
        try {
          const settings = JSON.parse(settingsStr);
          squareSettings = settings.square;
        } catch (e) {
          squareSettings = null;
        }
        break;
      }
    }
    
    if (!companyId) {
      return createResponse(false, 'Company ID not found for user');
    }
    
    if (!squareSettings || !squareSettings.enabled) {
      return createResponse(false, 'Square integration not configured');
    }
    
    // Import customers from Square
    const result = importSquareCustomersInternal(email, companyId, squareSettings);
    
    return createResponse(result.success, result.message || '', result);
  } catch (error) {
    Logger.log('Error in handleImportSquareCustomers: ' + error);
    return createResponse(false, error.toString());
  }
}

/**
 * Internal function to import Square customers
 * This is called by handleImportSquareCustomers
 */
function importSquareCustomersInternal(email, companyId, squareSettings) {
  try {
    // Fetch customers from Square API
    const apiUrl = squareSettings.environment === 'sandbox'
      ? 'https://connect.squareupsandbox.com/v2'
      : 'https://connect.squareup.com/v2';
    
    const url = apiUrl + '/customers/search';
    const payload = {
      limit: 100,
      query: {
        sort: {
          field: 'CREATED_AT',
          order: 'DESC'
        }
      }
    };
    
    const options = {
      method: 'post',
      headers: {
        'Square-Version': SQUARE_API_VERSION,
        'Authorization': 'Bearer ' + squareSettings.accessToken,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const result = JSON.parse(response.getContentText());
    
    if (responseCode !== 200 || !result.customers) {
      return {
        success: false,
        message: result.errors ? result.errors[0].detail : 'Failed to fetch customers from Square'
      };
    }
    
    // Get Customers sheet
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const customersSheet = ss.getSheetByName('Customers');
    
    if (!customersSheet) {
      return { success: false, message: 'Customers sheet not found' };
    }
    
    // Get existing customers to avoid duplicates
    const customersData = customersSheet.getDataRange().getValues();
    const customersHeaders = customersData[0];
    const emailCol = customersHeaders.indexOf('Email');
    const existingEmails = new Set();
    
    for (let i = 1; i < customersData.length; i++) {
      if (emailCol !== -1 && customersData[i][emailCol]) {
        existingEmails.add(customersData[i][emailCol].toString().toLowerCase().trim());
      }
    }
    
    // Import customers
    let imported = 0;
    let skipped = 0;
    const now = new Date().toISOString();
    
    result.customers.forEach(customer => {
      const customerEmail = customer.email_address || '';
      const emailLower = customerEmail.toLowerCase().trim();
      
      // Skip if exists
      if (emailLower && existingEmails.has(emailLower)) {
        skipped++;
        return;
      }
      
      // Generate customer ID
      const customerId = 'CUST-' + Utilities.getUuid().substring(0, 8).toUpperCase();
      
      // Format name
      const name = `${customer.given_name || ''} ${customer.family_name || ''}`.trim() || 'Unknown';
      
      // Format address
      let address = '';
      if (customer.address) {
        const parts = [
          customer.address.address_line_1,
          customer.address.address_line_2,
          customer.address.locality,
          customer.address.administrative_district_level_1,
          customer.address.postal_code
        ].filter(Boolean);
        address = parts.join(', ');
      }
      
      // Add to sheet
      const newRow = [
        companyId,
        customerId,
        name,
        customerEmail,
        customer.phone_number || '',
        address,
        customer.address ? customer.address.locality : '',
        customer.address ? customer.address.administrative_district_level_1 : '',
        customer.address ? customer.address.postal_code : '',
        'Imported from Square',
        now,
        now,
        '{}', // Pool Data JSON
        '{}', // Service Data JSON
        '{}' // Custom Data JSON
      ];
      
      customersSheet.appendRow(newRow);
      imported++;
    });
    
    // Update last sync in Settings
    const authSheet = ss.getSheetByName(AUTH_SHEET_NAME);
    const authData = authSheet.getDataRange().getValues();
    const authHeaders = authData[1];
    const authEmailCol = authHeaders.indexOf('Email');
    const settingsCol = authHeaders.indexOf('Settings');
    
    for (let i = 2; i < authData.length; i++) {
      if (authData[i][authEmailCol] && authData[i][authEmailCol].toString().toLowerCase() === email.toLowerCase()) {
        const settingsStr = authData[i][settingsCol] || '{}';
        let settings = {};
        
        try {
          settings = JSON.parse(settingsStr);
        } catch (e) {
          settings = {};
        }
        
        if (settings.square) {
          settings.square.lastSync = now;
          authSheet.getRange(i + 1, settingsCol + 1).setValue(JSON.stringify(settings));
        }
        break;
      }
    }
    
    return {
      success: true,
      imported: imported,
      skipped: skipped,
      message: `Imported ${imported} customers, skipped ${skipped} duplicates`
    };
  } catch (error) {
    Logger.log('Error in importSquareCustomersInternal: ' + error);
    return {
      success: false,
      message: error.toString()
    };
  }
  
  Logger.log('========================================\n');
  
  testApproveAccount(rowIndex, adminEmail);
  
  Logger.log('\n========================================');
  Logger.log('Test complete! Check logs above for results.');
  Logger.log('========================================');
}

// ========================================
// APPROVAL REMINDER SYSTEM
// ========================================

/**
 * Check for pending accounts and send reminders
 * This function should be run every 1-2 hours via time-based trigger
 * To set up: go to Extensions > Apps Script > Triggers > Create new trigger
 * Set: checkPendingAccountReminders, time-based, hour timer, every 1 hour
 */
function checkPendingAccountReminders() {
  try {
    Logger.log('=== Checking pending account reminders ===');
    Logger.log('Time: ' + new Date().toISOString());
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = ss.getSheetByName(AUTH_SHEET_NAME);
    
    if (!authSheet) {
      Logger.log('ERROR: Authentication sheet not found');
      return;
    }
    
    // Get all data
    const range = authSheet.getDataRange();
    const values = range.getValues();
    
    // Get notification tracking sheet
    let notifSheet = ss.getSheetByName(APPROVAL_NOTIFICATIONS_SHEET);
    if (!notifSheet) {
      Logger.log('Creating notifications sheet');
      notifSheet = ss.insertSheet(APPROVAL_NOTIFICATIONS_SHEET);
      const headers = ['Date/Time', 'User Email', 'User Name', 'Action', 'Hours Elapsed', 'Status', 'Telegram Sent'];
      notifSheet.appendRow(headers);
    }
    
    const notifRange = notifSheet.getDataRange();
    const notifValues = notifRange.getValues();
    const now = new Date();
    
    // Thresholds for reminders (in hours)
    const REMIND_AT_HOURS = [6, 12, 24];
    
    // Check each pending account
    let remindersCount = 0;
    for (let i = 2; i < values.length; i++) {
      const row = values[i];
      const accountStatus = row[5]; // Column F: Account Status
      const dateCreated = row[9]; // Column J: Date Created
      const userEmail = row[1]; // Column B: Email
      const userName = row[0]; // Column A: Name
      const company = row[11]; // Column L: Company
      
      // Only process pending accounts
      if (accountStatus !== 'Pending' || !dateCreated) {
        continue;
      }
      
      // Calculate hours since creation
      const createdDate = new Date(dateCreated);
      const hoursElapsed = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60));
      
      Logger.log('Checking: ' + userName + ' (' + userEmail + ') - ' + hoursElapsed + ' hours pending');
      
      // Check each reminder threshold
      for (let threshold of REMIND_AT_HOURS) {
        // Send reminder if:
        // 1. Hours elapsed >= threshold
        // 2. Less than 1 hour into the next threshold (to avoid spam)
        if (hoursElapsed >= threshold && hoursElapsed < threshold + 1) {
          
          // Check if we already sent this reminder
          let reminderAlreadySent = false;
          for (let n = 1; n < notifValues.length; n++) {
            const notifRow = notifValues[n];
            const notifEmail = notifRow[1]; // Email
            const notifAction = notifRow[3]; // Action
            const reminderKey = 'Reminder-' + threshold + 'h';
            
            if (notifEmail === userEmail && notifAction === reminderKey) {
              reminderAlreadySent = true;
              Logger.log('  Reminder already sent at ' + threshold + 'h');
              break;
            }
          }
          
          if (!reminderAlreadySent) {
            Logger.log('  Sending ' + threshold + 'h reminder...');
            
            // Send Telegram reminder
            const telegramResult = sendApprovalReminderTelegram(userName, userEmail, threshold);
            
            // Log the reminder
            logApprovalNotification(userEmail, userName, 'Reminder-' + threshold + 'h', hoursElapsed);
            
            remindersCount++;
            
            if (telegramResult.success) {
              Logger.log('  ✅ Reminder sent successfully');
            } else {
              Logger.log('  ❌ Failed to send reminder: ' + telegramResult.error);
            }
            
            // Only send one reminder per check
            break;
          }
        }
      }
      
      // Auto-reject if over 24 hours (optional - comment out if you don't want this)
      if (hoursElapsed > 24 && hoursElapsed < 24.5) {
        Logger.log('  Account pending for over 24 hours - consider auto-rejection or escalation');
        // You can add auto-rejection logic here if desired
      }
    }
    
    Logger.log('Reminder check complete. Reminders sent: ' + remindersCount);
    
  } catch (error) {
    Logger.log('Error in checkPendingAccountReminders: ' + error.toString());
    Logger.log('Stack: ' + error.stack);
  }
}

/**
 * Manually trigger reminder check (for testing)
 * Run this from Extensions > Apps Script console
 */
function testReminderCheck() {
  Logger.log('Running manual reminder check...');
  checkPendingAccountReminders();
  Logger.log('Test complete');
}

/**
 * Set up automatic reminder checks (run this once to initialize)
 * This creates a time-based trigger to check reminders every hour
 */
function setupReminderTrigger() {
  try {
    // Remove existing triggers
    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'checkPendingAccountReminders') {
        ScriptApp.deleteTrigger(triggers[i]);
        Logger.log('Removed existing reminder trigger');
      }
    }
    
    // Create new trigger to run every hour
    ScriptApp.newTrigger('checkPendingAccountReminders')
      .timeBased()
      .everyHours(1)
      .create();
    
    Logger.log('✅ Reminder trigger created - will check every 1 hour');
  } catch (error) {
    Logger.log('Error setting up trigger: ' + error.toString());
  }
}

// ========================================
// STRIPE SUBSCRIPTION MANAGEMENT
// ========================================

/**
 * Create Stripe Checkout Session for trial subscription
 * Called when admin approves account
 */
function createStripeCheckoutSession(email, name, companyName, stripeCustomerId, trialDays = 14) {
  try {
    Logger.log('Creating Stripe checkout session for: ' + email);
    
    if (!stripeCustomerId) {
      Logger.log('ERROR: No Stripe customer ID provided');
      return { success: false, error: 'No Stripe customer ID' };
    }
    
    // Calculate trial end date
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + trialDays);
    const trialEndTimestamp = Math.floor(trialEndDate.getTime() / 1000);
    
    // Price ID for $125/month subscription
    const priceId = 'price_1TIauQKD1FHpDEfgKA3Ob2YZ'; // PoolFlowPro $125/month
    
    const payload = {
      customer: stripeCustomerId,
      mode: 'subscription',
      payment_method_types: 'card',
      subscription_data: {
        trial_end: trialEndTimestamp,
        description: 'PoolFlowPro Subscription - ' + companyName
      },
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      success_url: 'https://aesthetic-kataifi-88ba27.netlify.app/Dashboard_Embed.html?payment=success&email=' + encodeURIComponent(email),
      cancel_url: 'https://aesthetic-kataifi-88ba27.netlify.app/Login_Embed.html?payment=cancelled'
    };
    
    // Create checkout session via Stripe API
    const options = {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      payload: encodePayload_(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(STRIPE_API_URL + '/checkout/sessions', options);
    const result = JSON.parse(response.getContentText());
    
    if (response.getResponseCode() === 200 && result.id) {
      Logger.log('✅ Checkout session created: ' + result.id);
      return {
        success: true,
        sessionId: result.id,
        checkoutUrl: result.url,
        trialEnd: trialEndDate.toISOString()
      };
    } else {
      Logger.log('ERROR creating checkout: ' + response.getContentText());
      return { success: false, error: result.error?.message || 'Failed to create session' };
    }
  } catch (error) {
    Logger.log('Error creating checkout session: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Get subscription details from Stripe
 */
function getStripeSubscription(subscriptionId) {
  try {
    if (!subscriptionId) {
      return { success: false, error: 'No subscription ID' };
    }
    
    const options = {
      method: 'get',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY
      },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(STRIPE_API_URL + '/subscriptions/' + subscriptionId, options);
    const result = JSON.parse(response.getContentText());
    
    if (response.getResponseCode() === 200) {
      return {
        success: true,
        subscription: result
      };
    } else {
      Logger.log('ERROR fetching subscription: ' + response.getContentText());
      return { success: false, error: result.error?.message || 'Failed to fetch subscription' };
    }
  } catch (error) {
    Logger.log('Error fetching subscription: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Cancel Stripe subscription
 */
function cancelStripeSubscription(subscriptionId) {
  try {
    if (!subscriptionId) {
      return { success: false, error: 'No subscription ID' };
    }
    
    Logger.log('Cancelling Stripe subscription: ' + subscriptionId);
    
    const options = {
      method: 'delete',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY
      },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(STRIPE_API_URL + '/subscriptions/' + subscriptionId, options);
    const result = JSON.parse(response.getContentText());
    
    if (response.getResponseCode() === 200) {
      Logger.log('✅ Subscription cancelled: ' + subscriptionId);
      return {
        success: true,
        message: 'Subscription cancelled successfully',
        cancelledAt: result.canceled_at
      };
    } else {
      Logger.log('ERROR cancelling subscription: ' + response.getContentText());
      return { success: false, error: result.error?.message || 'Failed to cancel subscription' };
    }
  } catch (error) {
    Logger.log('Error cancelling subscription: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Handle cancellation request from dashboard
 */
function handleCancelSubscription(data) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = spreadsheet.getSheetByName(AUTH_SHEET_NAME);
    
    const userEmail = data.email ? data.email.toLowerCase().trim() : '';
    if (!userEmail) {
      return createResponse(false, 'User email required');
    }
    
    // Find user row
    const emailRange = authSheet.getRange('B:B');
    const emailValues = emailRange.getValues();
    let userRowIndex = -1;
    
    for (let i = 0; i < emailValues.length; i++) {
      if (emailValues[i][0].toString().toLowerCase() === userEmail) {
        userRowIndex = i + 1;
        break;
      }
    }
    
    if (userRowIndex === -1) {
      return createResponse(false, 'User not found');
    }
    
    // Get Stripe subscription ID (Column Q)
    const subscriptionId = authSheet.getRange(userRowIndex, 17).getValue();
    if (!subscriptionId) {
      return createResponse(false, 'No active subscription');
    }
    
    // Cancel the subscription
    const cancelResult = cancelStripeSubscription(subscriptionId);
    if (!cancelResult.success) {
      return createResponse(false, 'Failed to cancel subscription: ' + cancelResult.error);
    }
    
    // Update account status to "Cancelled"
    authSheet.getRange(userRowIndex, 6).setValue('Cancelled');
    
    // Log cancellation
    logApprovalNotification(userEmail, 'Subscription Cancelled', 'User cancelled subscription', 'Cancelled');
    
    // Send cancellation email
    try {
      sendSubscriptionCancelledEmail(userEmail, authSheet.getRange(userRowIndex, 1).getValue());
    } catch (e) {
      Logger.log('Warning: Could not send cancellation email: ' + e.toString());
    }
    
    return createResponse(true, 'Subscription cancelled successfully');
  } catch (error) {
    Logger.log('Error in handleCancelSubscription: ' + error.toString());
    return createResponse(false, error.toString());
  }
}

/**
 * Send subscription cancelled confirmation email
 */
function sendSubscriptionCancelledEmail(email, name) {
  const htmlContent = `
    <html>
      <body style="font-family: Inter, sans-serif; background-color: #f5f7fa; margin: 0; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <img src="https://cdn.prod.website-files.com/6931dc4e8e97334e195432df/6972f0e8ed917fdb61dead8f_Gemini_Generated_Image_n1brs8n1brs8n1br.png" alt="PoolFlowPro" style="height: 40px; margin-bottom: 20px;">
          
          <h2 style="color: #1a1a1a; margin-bottom: 16px;">Subscription Cancelled</h2>
          
          <p style="color: #6b7280; line-height: 1.6; margin-bottom: 16px;">
            Hi ${name},
          </p>
          
          <p style="color: #6b7280; line-height: 1.6; margin-bottom: 16px;">
            Your PoolFlowPro subscription has been cancelled. You will lose access to all features after your current billing period ends.
          </p>
          
          <p style="color: #6b7280; line-height: 1.6; margin-bottom: 24px;">
            If you'd like to reactivate your subscription or have any questions, please contact us.
          </p>
          
          <div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <p style="color: #374151; margin: 0;"><strong>Need help?</strong></p>
            <p style="color: #6b7280; margin: 8px 0 0 0;"><a href="mailto:${COMPANY_EMAIL}" style="color: #3b82f6; text-decoration: none;">${COMPANY_EMAIL}</a></p>
          </div>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
          
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            A Product of Quality Pool Company<br>
            ${COMPANY_PHONE}
          </p>
        </div>
      </body>
    </html>
  `;
  
  GmailApp.sendEmail(email, 'PoolFlowPro - Subscription Cancelled', '', {
    htmlBody: htmlContent,
    from: COMPANY_EMAIL
  });
}

/**
 * Helper function to encode payload for URL-encoded form data
 */
function encodePayload_(payload) {
  const parts = [];
  for (const key in payload) {
    const value = payload[key];
    if (typeof value === 'object') {
      // Handle nested objects for Stripe API
      for (const subKey in value) {
        const encodedKey = encodeURIComponent(key + '[' + subKey + ']');
        const encodedValue = encodeURIComponent(value[subKey]);
        parts.push(encodedKey + '=' + encodedValue);
      }
    } else {
      const encodedKey = encodeURIComponent(key);
      const encodedValue = encodeURIComponent(value);
      parts.push(encodedKey + '=' + encodedValue);
    }
  }
  return parts.join('&');
}


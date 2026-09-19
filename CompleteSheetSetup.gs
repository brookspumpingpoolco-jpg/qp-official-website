/**
 * CompleteSheetSetup.gs — one-shot spreadsheet alignment for Auth + Portal + Jobs + optional Invoice/PM.
 *
 * 1. Set COMPLETE_SETUP_SPREADSHEET_ID to your spreadsheet ID (same as SPREADSHEET_ID / SPREADSHEET_ID1 if everything lives in one book).
 * 2. In Apps Script: Run → runCompleteSheetSetup
 * 3. Optional: runCompleteSheetSetup({ runInvoiceSetup: true, runPMSetup: true, runTriggers: false })
 *
 * Safe on existing data: Authentication rows from row 3+ are not deleted. Admin seed runs only if there are no user rows.
 */

/** Target spreadsheet (change this). */
var COMPLETE_SETUP_SPREADSHEET_ID = '1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0';

var COMPLETE_AUTH_SHEET_NAME = 'Authentication';
var COMPLETE_APPROVAL_SHEET = 'Approval Notifications';
var COMPLETE_JOBS_SHEET_NAME = 'Jobs';
var COMPLETE_PORTAL_SHEET_NAME = 'Customer Portal';

/** Seed admin only when Authentication has no data rows (lastRow < 3). Change before first run. */
var COMPLETE_ADMIN_EMAIL = 'admin@aqualitypoolcompanyusa.com';
var COMPLETE_ADMIN_PASSWORD = 'ChangeMe123!';
var COMPLETE_ADMIN_NAME = 'System Administrator';

/** Authentication column count (must match AuthenticationScript headers). */
var COMPLETE_AUTH_COL_COUNT = 17;

function completeSetup_hashPassword_(password) {
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    password,
    Utilities.Charset.UTF_8
  ).map(function (byte) {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('');
}

/**
 * @param {Object} opts
 * @param {boolean} [opts.seedAdminIfEmpty=true]
 * @param {boolean} [opts.runInvoiceSetup=true] — calls setupInvoiceSystem() if defined
 * @param {boolean} [opts.runPMSetup=true] — calls initializeProjectManagementSheets() if defined
 * @param {boolean} [opts.runTriggers=false] — calls createScheduledTriggers() if defined (avoid duplicates)
 * @param {boolean} [opts.runCustomerPortal=true]
 * @param {boolean} [opts.runJobs=true]
 */
function runCompleteSheetSetup(opts) {
  opts = opts || {};
  var seedAdmin = opts.seedAdminIfEmpty !== false;
  var runInv = opts.runInvoiceSetup !== false;
  var runPM = opts.runPMSetup !== false;
  var runTrig = opts.runTriggers === true;
  var runPortal = opts.runCustomerPortal !== false;
  var runJobs = opts.runJobs !== false;

  var id = COMPLETE_SETUP_SPREADSHEET_ID;
  if (!id) {
    throw new Error('Set COMPLETE_SETUP_SPREADSHEET_ID in CompleteSheetSetup.gs');
  }

  var ss = SpreadsheetApp.openById(id);
  var log = [];

  log.push(ensureAuthenticationSheetComplete_(ss, seedAdmin));
  log.push(ensureApprovalNotificationsSheet_(ss));
  if (runJobs) {
    log.push(ensureJobsSheetComplete_(ss));
  }
  if (runPortal) {
    log.push(ensureCustomerPortalSheetComplete_(ss));
  }

  if (runInv && typeof setupInvoiceSystem === 'function') {
    try {
      setupInvoiceSystem();
      log.push('Invoice: setupInvoiceSystem() completed');
    } catch (e) {
      log.push('Invoice: setupInvoiceSystem failed — ' + e.message);
    }
  } else if (runInv) {
    log.push('Invoice: setupInvoiceSystem not found (add InvoiceEstimate_Setup.gs)');
  }

  if (runPM && typeof initializeProjectManagementSheets === 'function') {
    try {
      initializeProjectManagementSheets();
      log.push('PM: initializeProjectManagementSheets() completed');
    } catch (e) {
      log.push('PM: initializeProjectManagementSheets failed — ' + e.message);
    }
  } else if (runPM) {
    log.push('PM: initializeProjectManagementSheets not found (add ProjectManagement.gs + InvoiceEstimate.gs SPREADSHEET_ID)');
  }

  if (runTrig && typeof createScheduledTriggers === 'function') {
    try {
      createScheduledTriggers();
      log.push('Triggers: createScheduledTriggers() completed');
    } catch (e) {
      log.push('Triggers: createScheduledTriggers failed — ' + e.message);
    }
  }

  Logger.log(log.join('\n'));
  return log.join('\n');
}

function ensureAuthenticationSheetComplete_(ss, seedAdminIfEmpty) {
  var headers = [
    'Email',
    'Password Hash',
    'Name',
    'Role',
    'Status',
    'Created Date',
    'Last Login',
    'Failed Login Attempts',
    'Locked Until',
    'Reset Token',
    'Reset Token Expiry',
    'Verification Code',
    'Verification Code Expiry',
    'Google ID',
    'Profile Picture URL',
    'Subscription Tier',
    'Subscription Expiry'
  ];

  var sheet = ss.getSheetByName(COMPLETE_AUTH_SHEET_NAME);
  var created = false;
  if (!sheet) {
    sheet = ss.insertSheet(COMPLETE_AUTH_SHEET_NAME);
    created = true;
  }

  sheet.setRowHeight(1, 120);
  var logoRange = sheet.getRange(1, 1, 1, COMPLETE_AUTH_COL_COUNT);
  try {
    logoRange.breakApart();
  } catch (ignore) {}
  logoRange.merge();
  logoRange.setVerticalAlignment('top');
  logoRange.setHorizontalAlignment('center');
  logoRange.setBackground('#f8f9fa');
  logoRange.setBorder(true, true, true, true, true, true, '#e0e0e0', SpreadsheetApp.BorderStyle.SOLID);

  var headerRange = sheet.getRange(2, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setFontWeight('bold');
  headerRange.setFontSize(11);
  headerRange.setBackground('#0369a1');
  headerRange.setFontColor('#ffffff');
  headerRange.setHorizontalAlignment('center');
  headerRange.setVerticalAlignment('middle');
  headerRange.setBorder(true, true, true, true, true, true, '#ffffff', SpreadsheetApp.BorderStyle.SOLID);
  sheet.setRowHeight(2, 40);

  var widths = [220, 200, 180, 120, 120, 160, 160, 160, 160, 180, 180, 140, 180, 200, 220, 140, 160];
  for (var c = 0; c < widths.length; c++) {
    sheet.setColumnWidth(c + 1, widths[c]);
  }

  var roleRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Admin', 'User', 'Manager', 'Technician'], true)
    .setAllowInvalid(false)
    .setHelpText('Select role: Admin, User, Manager, or Technician')
    .build();
  sheet.getRange(3, 4, 1000, 1).setDataValidation(roleRule);

  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Active', 'Pending', 'Suspended', 'Locked'], true)
    .setAllowInvalid(false)
    .setHelpText('Select status: Active, Pending, Suspended, or Locked')
    .build();
  sheet.getRange(3, 5, 1000, 1).setDataValidation(statusRule);

  var tierRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Free', 'Basic', 'Premium', 'Enterprise'], true)
    .setAllowInvalid(false)
    .setHelpText('Select subscription tier')
    .build();
  sheet.getRange(3, 16, 1000, 1).setDataValidation(tierRule);

  sheet.getRange(3, 6, 1000, 1).setNumberFormat('mm/dd/yyyy hh:mm:ss');
  sheet.getRange(3, 7, 1000, 1).setNumberFormat('mm/dd/yyyy hh:mm:ss');
  sheet.getRange(3, 9, 1000, 1).setNumberFormat('mm/dd/yyyy hh:mm:ss');
  sheet.getRange(3, 11, 1000, 1).setNumberFormat('mm/dd/yyyy hh:mm:ss');
  sheet.getRange(3, 13, 1000, 1).setNumberFormat('mm/dd/yyyy hh:mm:ss');
  sheet.getRange(3, 17, 1000, 1).setNumberFormat('mm/dd/yyyy hh:mm:ss');

  var dataRange = sheet.getRange(3, 1, 1000, COMPLETE_AUTH_COL_COUNT);
  dataRange.setBorder(true, true, true, true, true, true, '#e0e0e0', SpreadsheetApp.BorderStyle.SOLID);
  sheet.setFrozenRows(2);

  var lastRow = sheet.getLastRow();
  var seeded = '';
  if (seedAdminIfEmpty && lastRow < 3) {
    var hashFn = typeof hashPassword === 'function' ? hashPassword : completeSetup_hashPassword_;
    var pwdHash = hashFn(COMPLETE_ADMIN_PASSWORD);
    var adminRow = [
      COMPLETE_ADMIN_EMAIL,
      pwdHash,
      COMPLETE_ADMIN_NAME,
      'Admin',
      'Active',
      new Date(),
      '',
      0,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'Enterprise',
      ''
    ];
    sheet.getRange(3, 1, 1, adminRow.length).setValues([adminRow]);
    seeded = ' (admin row seeded)';
  }

  return 'Authentication: ' + (created ? 'created' : 'updated') + seeded;
}

function ensureApprovalNotificationsSheet_(ss) {
  var headers = ['Date/Time', 'User Email', 'User Name', 'Action', 'Hours Elapsed', 'Status', 'Telegram Sent'];
  var sh = ss.getSheetByName(COMPLETE_APPROVAL_SHEET);
  if (!sh) {
    sh = ss.insertSheet(COMPLETE_APPROVAL_SHEET);
    sh.appendRow(headers);
    var hr = sh.getRange(1, 1, 1, headers.length);
    hr.setFontWeight('bold');
    hr.setBackground('#0369a1');
    hr.setFontColor('#ffffff');
    return 'Approval Notifications: created';
  }
  return 'Approval Notifications: already exists';
}

function ensureJobsSheetComplete_(ss) {
  var headers = [
    'Job ID',
    'Customer Name',
    'Customer Email',
    'Customer Phone',
    'Service Type',
    'Status',
    'Scheduled Date',
    'Scheduled Time',
    'Assigned To',
    'Address',
    'Notes',
    'Created Date',
    'Completed Date',
    'Invoice Amount',
    'Invoice Status'
  ];

  var jobsSheet = ss.getSheetByName(COMPLETE_JOBS_SHEET_NAME);
  if (!jobsSheet) {
    jobsSheet = ss.insertSheet(COMPLETE_JOBS_SHEET_NAME);
  }

  jobsSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  var headerRange = jobsSheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#3b82f6');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setFontSize(11);
  headerRange.setHorizontalAlignment('center');
  headerRange.setVerticalAlignment('middle');
  headerRange.setWrap(true);

  jobsSheet.setColumnWidth(1, 100);
  jobsSheet.setColumnWidth(2, 150);
  jobsSheet.setColumnWidth(3, 180);
  jobsSheet.setColumnWidth(4, 120);
  jobsSheet.setColumnWidth(5, 120);
  jobsSheet.setColumnWidth(6, 120);
  jobsSheet.setColumnWidth(7, 120);
  jobsSheet.setColumnWidth(8, 100);
  jobsSheet.setColumnWidth(9, 120);
  jobsSheet.setColumnWidth(10, 200);
  jobsSheet.setColumnWidth(11, 250);
  jobsSheet.setColumnWidth(12, 120);
  jobsSheet.setColumnWidth(13, 120);
  jobsSheet.setColumnWidth(14, 100);
  jobsSheet.setColumnWidth(15, 100);

  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Scheduled', 'On the Way', 'In Progress', 'Ready for Payment', 'Completed', 'Cancelled'], true)
    .setAllowInvalid(false)
    .setHelpText('Select job status')
    .build();
  jobsSheet.getRange(2, 6, 1000, 1).setDataValidation(statusRule);

  var serviceRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Pool Cleaning', 'Pool Repair', 'Inspection', 'Maintenance', 'Installation', 'Other'], true)
    .setAllowInvalid(false)
    .setHelpText('Select service type')
    .build();
  jobsSheet.getRange(2, 5, 1000, 1).setDataValidation(serviceRule);

  var invRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Paid', 'Unpaid', 'Pending', 'N/A'], true)
    .setAllowInvalid(false)
    .setHelpText('Invoice status')
    .build();
  jobsSheet.getRange(2, 15, 1000, 1).setDataValidation(invRule);

  jobsSheet.setFrozenRows(1);
  return 'Jobs: ensured';
}

function ensureCustomerPortalSheetComplete_(ss) {
  var headers = [
    'Name',
    'Email',
    'Password Hash',
    'Account Status',
    'Signup Token',
    'Token Expires',
    'Address',
    'Gate Code',
    'House Info',
    'Pool Issues',
    'Pets',
    'Pool Type',
    'Google Drive Folder ID',
    'Square Customer ID',
    'Created Date',
    'Last Login',
    'Notes',
    '_ saved data',
    'Phone',
    'Last Updated'
  ];

  var sh = ss.getSheetByName(COMPLETE_PORTAL_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(COMPLETE_PORTAL_SHEET_NAME);
  }

  sh.setRowHeight(1, 120);
  var logoRange = sh.getRange(1, 1, 1, 20);
  try {
    logoRange.breakApart();
  } catch (ignore) {}
  logoRange.merge();
  logoRange.setVerticalAlignment('top');
  logoRange.setHorizontalAlignment('center');
  logoRange.setBackground('#f8f9fa');
  logoRange.setBorder(true, true, true, true, true, true, '#e0e0e0', SpreadsheetApp.BorderStyle.SOLID);

  var headerRange = sh.getRange(2, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setFontWeight('bold');
  headerRange.setFontSize(11);
  headerRange.setBackground('#0369a1');
  headerRange.setFontColor('#ffffff');
  headerRange.setHorizontalAlignment('center');
  headerRange.setVerticalAlignment('middle');
  headerRange.setBorder(true, true, true, true, true, true, '#ffffff', SpreadsheetApp.BorderStyle.SOLID);
  sh.setRowHeight(2, 40);

  sh.setColumnWidth(1, 180);
  sh.setColumnWidth(2, 220);
  sh.setColumnWidth(3, 200);
  sh.setColumnWidth(4, 140);
  sh.setColumnWidth(5, 150);
  sh.setColumnWidth(6, 160);
  sh.setColumnWidth(7, 250);
  sh.setColumnWidth(8, 120);
  sh.setColumnWidth(9, 200);
  sh.setColumnWidth(10, 200);
  sh.setColumnWidth(11, 100);
  sh.setColumnWidth(12, 120);
  sh.setColumnWidth(13, 200);
  sh.setColumnWidth(14, 180);
  sh.setColumnWidth(15, 160);
  sh.setColumnWidth(16, 160);
  sh.setColumnWidth(17, 300);
  sh.setColumnWidth(18, 400);
  sh.setColumnWidth(19, 150);
  sh.setColumnWidth(20, 160);

  var accountStatusValidation = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Active', 'Pending', 'Suspended'], true)
    .setAllowInvalid(false)
    .setHelpText('Account status');
  sh.getRange(3, 4, 1000, 1).setDataValidation(accountStatusValidation);

  sh.getRange(3, 6, 1000, 1).setNumberFormat('mm/dd/yyyy hh:mm:ss');
  sh.getRange(3, 15, 1000, 1).setNumberFormat('mm/dd/yyyy hh:mm:ss');
  sh.getRange(3, 16, 1000, 1).setNumberFormat('mm/dd/yyyy hh:mm:ss');
  sh.getRange(3, 20, 1000, 1).setNumberFormat('mm/dd/yyyy hh:mm:ss');

  return 'Customer Portal: ensured';
}

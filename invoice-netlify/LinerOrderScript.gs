/**
 * LinerOrderScript.gs  — A Quality Pool Company
 * 
 * NEW in this version:
 *   • Writes every order to a "Liner Orders" sheet (auto-created)
 *   • updateOrderStatus() — change status, add comments
 *   • sendCustomerStatusEmail() — notify customer when liner ships / ready
 *   • getOrders() — fetch all orders for the tracker UI
 */

// ── CONFIG ───────────────────────────────────────────────────────────────────
const HERITAGE_ROOT_FOLDER_ID   = '1caFBUhSzE5WNAm9vCT4dwDQuAO0iuo1h';
const SPREADSHEET_ID            = '1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0';
const CUSTOMERS_SPREADSHEET_ID  = '1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0';
const ORDER_NOTIFY_EMAIL        = 'samuelroberts213@icloud.com';
const COMPANY_LOGO_URL          = 'https://cdn.prod.website-files.com/6931dc4e8e97334e195432df/6993ce0abcd54d3520799318_IMG_1763-p-500.jpg';

// Column order in "Liner Orders" sheet
const COL = {
  ORDER_ID:       0,   // A
  DATE:           1,   // B
  CUSTOMER_NAME:  2,   // C
  CUSTOMER_PHONE: 3,   // D
  CUSTOMER_EMAIL: 4,   // E
  POOL_SHAPE:     5,   // F
  LINER_DESIGN:   6,   // G
  MIL_SERIES:     7,   // H
  CORNER_OUTLINE: 8,   // I
  WALL_HEIGHT:    9,   // J
  POOL_WIDTH:     10,  // K
  POOL_LENGTH:    11,  // L
  POOL_DEPTH:     12,  // M
  STATUS:         13,  // N
  COMMENTS:       14,  // O
  FOLDER_URL:     15,  // P
  NOTES:          16,  // Q
  LAST_UPDATED:   17,  // R
  PHOTO_FILES:    18,  // S
};

const STATUS_OPTIONS = [
  'Order Submitted',
  'Sent to Distributor',
  'Processing',
  'In Production',
  'In Shipment',
  'Ready for Pickup',
  'Installed',
  'Cancelled',
];

// Upload guardrails (kept in sync with frontend upload limits)
const MAX_UPLOAD_PHOTO_COUNT = 10;
const MAX_UPLOAD_PHOTO_TOTAL_BYTES = 9 * 1024 * 1024;
const MAX_UPLOAD_PHOTO_PAYLOAD_CHARS = 14 * 1024 * 1024;

/**
 * One-time setup script for the Liner Orders system.
 * Run this manually from Apps Script editor: setupLinerOrdersSystem
 */
function setupLinerOrdersSystem() {
  try {
    // Persist the target spreadsheet so runtime always uses the correct file.
    PropertiesService.getScriptProperties().setProperty('LINER_SPREADSHEET_ID', SPREADSHEET_ID);

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName('Liner Orders');
    if (!sheet) sheet = ss.insertSheet('Liner Orders');

    ensureLinerOrdersSheetStructure(sheet);

    const totalOrders = Math.max(0, sheet.getLastRow() - 1);
    const msg = 'Liner Orders setup complete. Styled sheet ready with status dropdowns, filter, and hyperlink cleanup.';
    Logger.log(msg);
    return {
      success: true,
      message: msg,
      spreadsheetId: ss.getId(),
      spreadsheetUrl: ss.getUrl(),
      sheetName: sheet.getName(),
      totalOrders: totalOrders,
    };
  } catch (err) {
    Logger.log('setupLinerOrdersSystem error: ' + err.message);
    return { success: false, error: err.message };
  }
}

function applyLinerOrdersEnhancements_(sheet) {
  const MAX_DATA = 1000;

  // 1) Status dropdown validation
  const statusValidation = SpreadsheetApp.newDataValidation()
    .requireValueInList(STATUS_OPTIONS, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, COL.STATUS + 1, MAX_DATA, 1).setDataValidation(statusValidation);

  // 2) Table filter for quick admin searching
  if (!sheet.getFilter()) {
    const lastRow = Math.max(2, sheet.getLastRow());
    sheet.getRange(1, 1, lastRow, 19).createFilter();
  }

  // 3) Convert existing raw folder URLs into clickable hyperlink labels
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const folderRange = sheet.getRange(2, COL.FOLDER_URL + 1, lastRow - 1, 1);
    const values = folderRange.getValues();
    const formulas = folderRange.getFormulas();

    for (let i = 0; i < values.length; i++) {
      const url = String(values[i][0] || '').trim();
      const hasFormula = !!formulas[i][0];
      if (!hasFormula && /^https?:\/\//i.test(url)) {
        folderRange.getCell(i + 1, 1)
          .setFormula('=HYPERLINK("' + url.replace(/"/g, '') + '","📁 Open Folder")');
      }
    }
  }
}

function ensureLinerOrdersSheetStructure(sheet) {
  const NUM_COLS = 19;
  const MAX_DATA = 1000; // pre-format rows 2-1001

  const headers = [
    '🔑 ORDER ID',       '📅 DATE',          '👤 CUSTOMER NAME',  '📞 PHONE',
    '📧 EMAIL',          '🏊 POOL SHAPE',    '🎨 LINER DESIGN',   '📏 MIL / SERIES',
    '🔲 CORNER OUTLINE', '📐 WALL HEIGHT',    '↔ WIDTH',          '↕ LENGTH',
    '🌊 DEPTH',          '🚦 STATUS',        '💬 COMMENTS',       '📁 FOLDER',
    '📝 NOTES',          '🔄 LAST UPDATED',  '🖼️ PHOTO FILES'
  ];

  // ── 1. Ensure enough columns ────────────────────────────────────────────
  const maxCols = sheet.getMaxColumns();
  if (maxCols < NUM_COLS) sheet.insertColumnsAfter(maxCols, NUM_COLS - maxCols);

  // ── 2. Sheet tab colour ─────────────────────────────────────────────────
  sheet.setTabColor('#0284c7');

  // ── 3. Header row — dark navy base ──────────────────────────────────────
  sheet.getRange(1, 1, 1, NUM_COLS)
    .setValues([headers])
    .setBackground('#0f172a')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setFontSize(10)
    .setFontFamily('Arial')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(false);
  sheet.setRowHeight(1, 50);

  // Per-section header accent colours
  sheet.getRange(1,  1, 1, 2).setBackground('#1e293b'); // Order ID / Date
  sheet.getRange(1,  3, 1, 3).setBackground('#1e40af'); // Customer (3–5)
  sheet.getRange(1,  6, 1, 1).setBackground('#4c1d95'); // Pool Shape
  sheet.getRange(1,  7, 1, 2).setBackground('#075985'); // Liner (7–8)
  sheet.getRange(1,  9, 1, 5).setBackground('#92400e'); // Dimensions (9–13)
  sheet.getRange(1, 14, 1, 1).setBackground('#065f46'); // Status
  sheet.getRange(1, 15, 1, 1).setBackground('#374151'); // Comments
  sheet.getRange(1, 16, 1, 1).setBackground('#064e3b'); // Folder
  sheet.getRange(1, 17, 1, 1).setBackground('#374151'); // Notes
  sheet.getRange(1, 18, 1, 1).setBackground('#1e293b'); // Last Updated
  sheet.getRange(1, 19, 1, 1).setBackground('#075985'); // Photo Files

  // ── 4. Freeze header + Order ID column ─────────────────────────────────
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);

  // ── 5. Column widths ────────────────────────────────────────────────────
  [140, 105, 200, 130, 220, 120, 280, 210, 240, 120, 110, 110, 190, 155, 340, 85, 340, 165, 260]
    .forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  // ── 6. Data area — section background colours ───────────────────────────
  sheet.getRange(2,  1, MAX_DATA, 2).setBackground('#f8fafc'); // Order ID + Date
  sheet.getRange(2,  3, MAX_DATA, 3).setBackground('#eff6ff'); // Customer
  sheet.getRange(2,  6, MAX_DATA, 1).setBackground('#faf5ff'); // Pool Shape
  sheet.getRange(2,  7, MAX_DATA, 2).setBackground('#ecfeff'); // Liner
  sheet.getRange(2,  9, MAX_DATA, 5).setBackground('#fffbeb'); // Dimensions
  sheet.getRange(2, 14, MAX_DATA, 1).setBackground('#f1f5f9'); // Status (CF overrides)
  sheet.getRange(2, 15, MAX_DATA, 1).setBackground('#f8fafc'); // Comments
  sheet.getRange(2, 16, MAX_DATA, 1).setBackground('#f0fdf4'); // Folder
  sheet.getRange(2, 17, MAX_DATA, 1).setBackground('#fefce8'); // Notes
  sheet.getRange(2, 18, MAX_DATA, 1).setBackground('#f8fafc'); // Last Updated
  sheet.getRange(2, 19, MAX_DATA, 1).setBackground('#eff6ff'); // Photo Files

  // ── 7. Data area — base style ───────────────────────────────────────────
  sheet.getRange(2, 1, MAX_DATA, NUM_COLS)
    .setFontSize(10).setFontFamily('Arial')
    .setVerticalAlignment('middle').setWrap(false);

  // 🔑 Order ID — bold, blue, monospace, centred
  sheet.getRange(2,  1, MAX_DATA, 1)
    .setFontWeight('bold').setFontFamily('Courier New')
    .setFontColor('#0369a1').setHorizontalAlignment('center');
  // 📅 Date — centred, muted grey
  sheet.getRange(2,  2, MAX_DATA, 1)
    .setHorizontalAlignment('center').setFontColor('#475569');
  // 👤 Customer Name — bold, dark, wrap
  sheet.getRange(2,  3, MAX_DATA, 1)
    .setFontWeight('bold').setFontColor('#0f172a').setWrap(true);
  // 📞 Phone — monospace, centred
  sheet.getRange(2,  4, MAX_DATA, 1)
    .setFontFamily('Courier New').setHorizontalAlignment('center').setFontColor('#334155');
  // 📧 Email — blue, wrap
  sheet.getRange(2,  5, MAX_DATA, 1)
    .setFontColor('#1d4ed8').setWrap(true);
  // 🏊 Pool Shape — centred, purple, bold
  sheet.getRange(2,  6, MAX_DATA, 1)
    .setHorizontalAlignment('center').setFontColor('#6d28d9').setFontWeight('bold');
  // 🎨 Liner Design — bold, 11pt, teal, wrap
  sheet.getRange(2,  7, MAX_DATA, 1)
    .setFontWeight('bold').setFontSize(11).setFontColor('#075985').setWrap(true);
  // 📏 Mil/Series — italic, centred
  sheet.getRange(2,  8, MAX_DATA, 1)
    .setFontStyle('italic').setHorizontalAlignment('center').setFontColor('#0c4a6e');
  // 🔲 Corner Outline — wrap, slate
  sheet.getRange(2,  9, MAX_DATA, 1)
    .setWrap(true).setFontColor('#334155');
  // 📐↔↕🌊 Wall H / Width / Length / Depth — centred, bold, amber
  sheet.getRange(2, 10, MAX_DATA, 4)
    .setHorizontalAlignment('center').setFontWeight('bold').setFontColor('#92400e');
  // 🚦 Status — centred, bold (CF applies badge colours)
  sheet.getRange(2, 14, MAX_DATA, 1)
    .setHorizontalAlignment('center').setFontWeight('bold');
  // 🖼️ Photo Files — wrap and smaller
  sheet.getRange(2, 19, MAX_DATA, 1)
    .setWrap(true).setFontSize(9).setFontColor('#0c4a6e');
  // 💬 Comments — wrap, small, muted
  sheet.getRange(2, 15, MAX_DATA, 1)
    .setWrap(true).setFontSize(9).setFontColor('#475569');
  // 📁 Folder — green, bold, centred
  sheet.getRange(2, 16, MAX_DATA, 1)
    .setFontColor('#059669').setFontWeight('bold').setHorizontalAlignment('center');
  // 📝 Notes — wrap, small
  sheet.getRange(2, 17, MAX_DATA, 1)
    .setWrap(true).setFontSize(9).setFontColor('#374151');
  // 🔄 Last Updated — centred, tiny, very muted
  sheet.getRange(2, 18, MAX_DATA, 1)
    .setHorizontalAlignment('center').setFontSize(9).setFontColor('#94a3b8');

  // ── 8. Conditional formatting — status badge colours ───────────────────
  sheet.clearConditionalFormatRules();
  const statusCFRange = sheet.getRange('N2:N' + (MAX_DATA + 1));
  const cfRules = [
    { text: 'Order Submitted',     bg: '#e2e8f0', fg: '#334155' },
    { text: 'Sent to Distributor', bg: '#fef9c3', fg: '#854d0e' },
    { text: 'Processing',          bg: '#ffe4e6', fg: '#9f1239' },
    { text: 'In Production',       bg: '#fce7f3', fg: '#9d174d' },
    { text: 'In Shipment',         bg: '#dbeafe', fg: '#1e40af' },
    { text: 'Ready for Pickup',    bg: '#bbf7d0', fg: '#14532d' },
    { text: 'Installed',           bg: '#dcfce7', fg: '#15803d' },
    { text: 'Cancelled',           bg: '#fee2e2', fg: '#dc2626' },
  ].map(s =>
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(s.text)
      .setBackground(s.bg).setFontColor(s.fg).setBold(true)
      .setRanges([statusCFRange]).build()
  );
  sheet.setConditionalFormatRules(cfRules);

  // ── 9. Borders ──────────────────────────────────────────────────────────
  const borderRange = sheet.getRange(1, 1, MAX_DATA + 1, NUM_COLS);
  // Thin inner grid
  borderRange.setBorder(true, true, true, true, true, true,
    '#cbd5e1', SpreadsheetApp.BorderStyle.SOLID);
  // Outer border — medium blue
  borderRange.setBorder(true, true, true, true, null, null,
    '#0284c7', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  // Header bottom — thick accent line
  sheet.getRange(1, 1, 1, NUM_COLS).setBorder(null, null, true, null, null, null,
    '#0284c7', SpreadsheetApp.BorderStyle.SOLID_THICK);
  // Section dividers — medium right border after each group's last column
  [2, 5, 6, 8, 13, 14, 15, 16, 17].forEach(col =>
    sheet.getRange(1, col, MAX_DATA + 1, 1).setBorder(null, null, null, true, null, null,
      '#64748b', SpreadsheetApp.BorderStyle.SOLID_MEDIUM)
  );

  // ── 10. Row heights for any existing data rows ──────────────────────────
  const lastDataRow = sheet.getLastRow();
  for (let r = 2; r <= lastDataRow; r++) sheet.setRowHeight(r, 32);

  // ── 11. Setup extras (status validation, filter, hyperlink cleanup) ─────
  applyLinerOrdersEnhancements_(sheet);

  Logger.log('Liner Orders sheet fully styled ✓');
}

// ── ENTRY POINT (google.script.run) ─────────────────────────────────────────
/**
 * Called by the frontend via google.script.run.handleWebRequest(params).
 * Routes by params.action — same actions as doPost.
 */
function handleWebRequest(params) {
  try {
    const action = params.action;
    if (action === 'saveLinerOrder')             return handleLinerOrder(params);
    if (action === 'previewLinerOrderEmail')     return previewLinerOrderEmail(params);
    if (action === 'sendTestLinerOrderEmail')    return sendTestLinerOrderEmail(params);
    if (action === 'searchCustomersByCompanyId') return searchCustomersByCompanyId(params.query, params.companyId);
    if (action === 'getOrders')                  return getOrders();
    if (action === 'updateOrderStatus')          return updateOrderStatus(params);
    if (action === 'sendCustomerStatusEmail')    return sendCustomerStatusEmail(params);
    if (action === 'setupLinerOrdersSystem')     return setupLinerOrdersSystem();
    return { success: false, error: 'Unknown action: ' + action };
  } catch (err) {
    Logger.log('handleWebRequest error: ' + err.message);
    return { success: false, error: err.message };
  }
}

// ── WEB APP ENTRY POINTS ─────────────────────────────────────────────────────
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('LinerOrderTool')
    .setTitle('Liner Order Tool — A Quality Pool Company')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  const out = ContentService.createTextOutput()
    .setMimeType(ContentService.MimeType.JSON);
  try {
    const action = e.parameter.action;
    const params = JSON.parse(e.parameter.data || '{}');

    if      (action === 'saveLinerOrder')               out.setContent(JSON.stringify(handleLinerOrder(params)));
    else if (action === 'previewLinerOrderEmail')       out.setContent(JSON.stringify(previewLinerOrderEmail(params)));
    else if (action === 'sendTestLinerOrderEmail')      out.setContent(JSON.stringify(sendTestLinerOrderEmail(params)));
    else if (action === 'searchCustomersByCompanyId')   out.setContent(JSON.stringify(searchCustomersByCompanyId(params.query, params.companyId)));
    else if (action === 'getOrders')                    out.setContent(JSON.stringify(getOrders()));
    else if (action === 'updateOrderStatus')            out.setContent(JSON.stringify(updateOrderStatus(params)));
    else if (action === 'sendCustomerStatusEmail')      out.setContent(JSON.stringify(sendCustomerStatusEmail(params)));
    else if (action === 'setupLinerOrdersSystem')       out.setContent(JSON.stringify(setupLinerOrdersSystem()));
    else out.setContent(JSON.stringify({ success: false, error: 'Unknown action: ' + action }));
  } catch (err) {
    out.setContent(JSON.stringify({ success: false, error: err.message }));
  }
  return out;
}

// ── SAVE LINER ORDER ─────────────────────────────────────────────────────────
/**
 * Called by the order form.
 * Saves files to Drive AND appends a row to the "Liner Orders" sheet.
 */
function handleLinerOrder(params) {
  try {
    const customerName  = (params.customerName  || '').trim();
    const customerPhone = (params.customerPhone || '').trim();
    const customerEmail = (params.customerEmail || '').trim();
    const poolShape     = (params.poolShape     || '').trim();
    const cornerOutline = (params.cornerOutline || '').trim();
    const wallHeight    = (params.wallHeight    || '').trim();
    const poolWidth     = (params.poolWidth     || '').trim();
    const poolLength    = (params.poolLength    || '').trim();
    const poolDepth     = (params.poolDepth     || '').trim();
    const linerDesign   = (params.linerDesign   || '').trim();
    const milSeries     = (params.milSeries     || '').trim();
    const notes         = (params.notes         || '').trim();
    const notifyTo      = (params.notifyTo      || '').trim();
    const notifyCc      = (params.notifyCc      || '').trim();
    if (!customerName) throw new Error('Customer name is required.');

    const formText  = params.formText || '';
    const photoDataRaw = String(params.photoData || '');
    const photoData = photoDataRaw ? JSON.parse(photoDataRaw) : [];
    const photoPayloadChars = photoDataRaw.length;
    Logger.log('Liner order payload: photos=' + photoData.length + ', photoData chars=' + photoPayloadChars);

    validateIncomingPhotoPayload_(photoData, photoPayloadChars);

    // 1. Drive folder — named "Name - Address" (address from params if available)
    const address = (params.customerAddress || '').trim();
    const folder  = getOrCreateCustomerFolder(customerName, address);

    // 2. Save order text file
    saveTextFile(folder, customerName + ' — Liner Order ' + todayStamp() + '.txt', formText);

    // 3. Save photos
    const savedPhotoFiles = [];
    for (let i = 0; i < photoData.length; i++) {
      const photo = photoData[i] || {};
      if (!photo.data) continue;
      try {
        const saved = saveBase64File(folder, photo.name, photo.data, photo.type);
        if (saved) savedPhotoFiles.push(saved);
      } catch (photoErr) {
        Logger.log('Photo save warning [' + i + ']: ' + photoErr.message);
      }
    }

    // 4. Write row to Liner Orders sheet
    const orderId = appendOrderRow({
      customerName, customerPhone, customerEmail,
      poolShape, cornerOutline, wallHeight, poolWidth, poolLength, poolDepth,
      linerDesign, milSeries, notes,
      folderUrl: folder.getUrl(),
      photoFiles: savedPhotoFiles,
    });

    // 5. Auto-send HTML order notification email
    try {
      sendOrderNotificationEmail({
        orderId, customerName, customerPhone, customerEmail,
        poolShape, cornerOutline, wallHeight, poolWidth, poolLength, poolDepth,
        linerDesign, milSeries, notes,
        notifyTo, notifyCc,
        folderUrl: folder.getUrl(),
        photoFiles: savedPhotoFiles,
        photoCount: savedPhotoFiles.length,
      });
    } catch (mailErr) {
      Logger.log('Email send warning: ' + mailErr.message);
    }

    return { success: true, folderUrl: folder.getUrl(), orderId: orderId };
  } catch (err) {
    Logger.log('handleLinerOrder error: ' + err.message);
    return { success: false, error: err.message };
  }
}

// ── ORDER NOTIFICATION EMAIL ──────────────────────────────────────────────────
function sendOrderNotificationEmail(o) {
  const subject = buildOrderNotificationEmailSubject_(o);
  const toEmail = (o.notifyTo || ORDER_NOTIFY_EMAIL || '').trim();
  if (!toEmail) throw new Error('Notification recipient is missing.');
  const ccEmails = normalizeEmailList_(o.notifyCc);
  const attachments = getImageAttachmentsFromPhotoFiles_(o.photoFiles);
  const html = buildOrderNotificationEmailHtml_(o, attachments.length);

  sendBrandedEmail_(toEmail, subject, buildOrderNotificationEmailPlainText_(o), {
    cc: ccEmails || undefined,
    htmlBody: html,
    attachments: attachments.length ? attachments : undefined,
    name: 'Liner Order Team',
  });
  Logger.log('Order notification sent to ' + toEmail + (ccEmails ? (' (cc: ' + ccEmails + ')') : ''));
}

function getImageAttachmentsFromPhotoFiles_(photoFiles) {
  try {
    const list = Array.isArray(photoFiles) ? photoFiles : [];
    const out = [];
    let totalBytes = 0;
    const maxFiles = 10;
    const maxTotalBytes = 18 * 1024 * 1024;

    for (let i = 0; i < list.length && out.length < maxFiles; i++) {
      const p = list[i] || {};
      const id = String(p.id || '').trim();
      if (!id) continue;

      let file;
      try {
        file = DriveApp.getFileById(id);
      } catch (err) {
        Logger.log('Attachment file lookup warning [' + id + ']: ' + err.message);
        continue;
      }

      const name = String(file.getName() || '');
      const mime = String(file.getMimeType() || '').toLowerCase();
      const isImage = isSupportedImageMime_(mime) || isSupportedImageName_(name);
      if (!isImage) continue;

      const blob = file.getBlob();
      const size = blob.getBytes().length;
      if (totalBytes + size > maxTotalBytes) continue;

      out.push(blob.setName(file.getName()));
      totalBytes += size;
    }

    return out;
  } catch (err) {
    Logger.log('getImageAttachmentsFromPhotoFiles_ warning: ' + err.message);
    return [];
  }
}

function previewLinerOrderEmail(params) {
  try {
    const o = buildLinerOrderEmailPayload_(params);
    const subject = buildOrderNotificationEmailSubject_(o);
    const ccEmails = normalizeEmailList_(o.notifyCc);
    return {
      success: true,
      subject: subject,
      htmlBody: buildOrderNotificationEmailHtml_(o, Number(o.photoCount || 0)),
      body: buildOrderNotificationEmailPlainText_(o),
      toEmail: o.notifyTo || ORDER_NOTIFY_EMAIL,
      ccEmails: ccEmails,
      attachmentCount: Number(o.photoCount || 0),
    };
  } catch (err) {
    Logger.log('previewLinerOrderEmail error: ' + err.message);
    return { success: false, error: err.message };
  }
}

function sendTestLinerOrderEmail(params) {
  try {
    const o = buildLinerOrderEmailPayload_(params);
    const toEmail = String(params.toEmail || o.notifyTo || ORDER_NOTIFY_EMAIL || '').trim();
    if (!toEmail) throw new Error('Test recipient is required.');

    const ccEmails = normalizeEmailList_(params.ccEmails || o.notifyCc);
    const photoData = parsePhotoData_(params.photoData);
    const photoPayloadChars = String(params.photoData || '').length;
    validateIncomingPhotoPayload_(photoData, photoPayloadChars);
    const attachments = getImageAttachmentsFromPhotoData_(photoData);
    const subject = '[TEST] ' + buildOrderNotificationEmailSubject_(o);

    sendBrandedEmail_(toEmail, subject, buildOrderNotificationEmailPlainText_(o), {
      cc: ccEmails || undefined,
      htmlBody: buildOrderNotificationEmailHtml_(o, attachments.length || Number(o.photoCount || 0)),
      attachments: attachments.length ? attachments : undefined,
      name: 'Liner Order Team',
    });

    Logger.log('Test liner order email sent to ' + toEmail + ' (' + attachments.length + ' attachments)');
    return { success: true, toEmail: toEmail, ccEmails: ccEmails, attachmentCount: attachments.length };
  } catch (err) {
    Logger.log('sendTestLinerOrderEmail error: ' + err.message);
    return { success: false, error: err.message };
  }
}

function testLinerOrderEmail() {
  return sendTestLinerOrderEmail({
    customerName: 'Test Customer',
    customerPhone: '(555) 555-0199',
    customerEmail: 'test.customer@example.com',
    poolShape: 'Rectangle',
    cornerOutline: '4 radius corners',
    wallHeight: '52 in',
    poolWidth: '16 ft',
    poolLength: '32 ft',
    poolDepth: '3 ft / 8 ft',
    linerDesign: 'Blue Quartz All Over Pattern',
    milSeries: '27 Mil — Aqua Intense',
    notes: 'Internal test email generated from Apps Script.',
    notifyTo: ORDER_NOTIFY_EMAIL,
    photoCount: 0,
  });
}

function buildLinerOrderEmailPayload_(params) {
  const photoData = parsePhotoData_(params.photoData);
  const parsedPhotoCount = Number(params.photoCount);
  return {
    orderId: String(params.orderId || 'Preview Only').trim() || 'Preview Only',
    customerName: String(params.customerName || '').trim(),
    customerPhone: String(params.customerPhone || '').trim(),
    customerEmail: String(params.customerEmail || '').trim(),
    poolShape: String(params.poolShape || '').trim(),
    cornerOutline: String(params.cornerOutline || '').trim(),
    wallHeight: String(params.wallHeight || '').trim(),
    poolWidth: String(params.poolWidth || '').trim(),
    poolLength: String(params.poolLength || '').trim(),
    poolDepth: String(params.poolDepth || '').trim(),
    linerDesign: String(params.linerDesign || '').trim(),
    milSeries: String(params.milSeries || '').trim(),
    notes: String(params.notes || '').trim(),
    notifyTo: String(params.notifyTo || '').trim(),
    notifyCc: String(params.notifyCc || '').trim(),
    photoCount: !isNaN(parsedPhotoCount) ? parsedPhotoCount : photoData.length,
  };
}

function buildOrderNotificationEmailSubject_(o) {
  return 'Finalized Liner Order — ' + (o.customerName || 'Customer') + ' — ' + (o.linerDesign || 'Liner');
}

function buildOrderNotificationEmailPlainText_(o) {
  return [
    'Hello,',
    '',
    'Please see the finalized liner order details and submit for an order, this project has been finalized and please let me know of any missing measurements!',
    '',
    'Order ID: ' + (o.orderId || 'N/A'),
    'Customer: ' + (o.customerName || 'N/A'),
    'Phone: ' + (o.customerPhone || 'N/A'),
    'Email: ' + (o.customerEmail || 'N/A'),
    'Pool Shape: ' + (o.poolShape || 'N/A'),
    'Corner Outline: ' + (o.cornerOutline || 'N/A'),
    'Wall Height: ' + (o.wallHeight || 'N/A'),
    'Width: ' + (o.poolWidth || 'N/A'),
    'Length: ' + (o.poolLength || 'N/A'),
    'Depth: ' + (o.poolDepth || 'N/A'),
    'Liner: ' + (o.linerDesign || 'N/A'),
    'Mil / Series: ' + (o.milSeries || 'N/A'),
    'Photos Uploaded: ' + String(o.photoCount || 0),
    '',
    'Notes:',
    o.notes || 'None',
  ].join('\n');
}

function buildOrderNotificationEmailHtml_(o, attachmentCount) {
  const customerMailto = o.customerEmail ? ('mailto:' + encodeURIComponent(o.customerEmail)) : '';
  const photoCount = Number(o.photoCount || 0);
  const safeAttachmentCount = Number(attachmentCount || 0);
  return [
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<style>',
    '@media only screen and (max-width: 680px) {',
    '  .hero-wrap{padding:20px 18px !important;}',
    '  .body-wrap{padding:18px 16px 22px !important;}',
    '  .stack-grid td{display:block !important;width:100% !important;padding:0 !important;}',
    '  .stack-grid td > div{margin-bottom:10px !important;}',
    '}',
    '</style>',
    '<title>Finalized Liner Order</title>',
    '</head>',
    '<body style="margin:0;padding:0;background:#eef2ff;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">',
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Finalized liner order from ' + escHtml_(o.customerName) + ' is ready for review.</div>',
    '<div style="padding:32px 16px;">',
    '<div style="max-width:780px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 18px 60px rgba(15,23,42,.18);border:1px solid #dbeafe;">',
    '<div class="hero-wrap" style="background:linear-gradient(135deg,#0f172a 0%,#0369a1 45%,#0284c7 100%);padding:26px 30px;color:white;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">',
    '<tr>',
    '<td style="width:86px;vertical-align:middle;">',
    '<div style="width:72px;height:72px;border-radius:18px;background:rgba(255,255,255,.14);padding:8px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;">',
    '<img src="' + COMPANY_LOGO_URL + '" alt="A Quality Pool Company" style="width:100%;height:100%;object-fit:contain;border-radius:12px;background:white;" />',
    '</div>',
    '</td>',
    '<td style="vertical-align:middle;">',
    '<div style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.72);font-weight:700;">A Quality Pool Company</div>',
    '<div style="font-size:30px;line-height:1.05;font-weight:800;margin-top:6px;">Finalized Liner Order</div>',
    '<div style="font-size:14px;color:rgba(255,255,255,.84);margin-top:8px;max-width:560px;line-height:1.5;">A premium custom liner request is ready for review. Measurements, pattern, and delivery details are below.</div>',
    '</td>',
    '</tr>',
    '</table>',
    '</div>',
    '<div class="body-wrap" style="padding:28px 30px 34px;">',
    '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:16px;padding:14px 16px;margin-bottom:22px;color:#1d4ed8;font-size:13px;font-weight:700;letter-spacing:.02em;">',
    'Order ID: ' + escHtml_(o.orderId || 'Preview Only') + ' &nbsp;•&nbsp; ' + todayStamp(),
    '</div>',
    '<p style="margin:0 0 10px;line-height:1.6;color:#0f172a;font-size:15px;">Hello,</p>',
    '<p style="margin:0 0 16px;line-height:1.65;color:#334155;font-size:14px;">Please see the finalized liner order details and submit for an order, this project has been finalized and please let me know of any missing measurements!</p>',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:8px;margin-bottom:12px;">',
    '<tr>',
    '<td style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;font-size:12px;color:#475569;"><div style="font-weight:800;color:#0f172a;font-size:15px;">' + escHtml_(o.customerName || 'N/A') + '</div><div>Customer</div></td>',
    '<td style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;font-size:12px;color:#475569;"><div style="font-weight:800;color:#0f172a;font-size:15px;">' + escHtml_(o.linerDesign || 'N/A') + '</div><div>Liner Design</div></td>',
    '</tr>',
    '<tr>',
    '<td style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;font-size:12px;color:#475569;"><div style="font-weight:800;color:#0f172a;font-size:15px;">' + escHtml_(o.milSeries || 'N/A') + '</div><div>Mil / Series</div></td>',
    '<td style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;font-size:12px;color:#475569;"><div style="font-weight:800;color:#0f172a;font-size:15px;">' + escHtml_(String(photoCount)) + '</div><div>Photos Uploaded</div></td>',
    '</tr>',
    '</table>',
    '<table class="stack-grid" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0 14px;">',
    '<tr>',
    cellCard_('Customer', [
      detailLine_('Name', o.customerName),
      detailLine_('Phone', o.customerPhone || 'N/A'),
      detailLine_('Email', o.customerEmail || 'N/A')
    ].join('')),
    cellCard_('Pool Profile', [
      detailLine_('Shape', o.poolShape || 'N/A'),
      detailLine_('Corner Outline', o.cornerOutline || 'N/A'),
      detailLine_('Wall Height', o.wallHeight || 'N/A')
    ].join('')),
    '</tr>',
    '<tr>',
    cellCard_('Dimensions', [
      detailLine_('Width', o.poolWidth || 'N/A'),
      detailLine_('Length', o.poolLength || 'N/A'),
      detailLine_('Depth', o.poolDepth || 'N/A')
    ].join('')),
    cellCard_('Liner Selection', [
      detailLine_('Design', o.linerDesign || 'N/A'),
      detailLine_('Mil / Series', o.milSeries || 'N/A'),
      detailLine_('Photos', String(photoCount))
    ].join('')),
    '</tr>',
    '</table>',
    o.notes ? [
      '<div style="margin-top:6px;padding:18px;border-radius:16px;background:linear-gradient(135deg,#f8fafc,#eef2ff);border:1px solid #e2e8f0;">',
      '<div style="font-size:12px;font-weight:800;color:#0369a1;letter-spacing:.18em;text-transform:uppercase;margin-bottom:8px;">Notes</div>',
      '<div style="font-size:14px;line-height:1.65;color:#334155;white-space:pre-wrap;">' + escHtml_(o.notes) + '</div>',
      '</div>'
    ].join('') : '',
    '<div style="margin-top:18px;padding:18px;border-radius:16px;background:linear-gradient(135deg,#0f172a,#1e293b);color:white;">',
    '<div style="font-size:12px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.72);margin-bottom:10px;">Files &amp; Delivery</div>',
    '<div style="font-size:14px;line-height:1.7;">',
    '<div>• Image attachments included: <strong>' + escHtml_(String(safeAttachmentCount)) + '</strong></div>',
    '<div>• Accepted types: JPG / JPEG / PNG</div>',
    '</div>',
    '<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:14px;border-collapse:separate;border-spacing:8px;">',
    '<tr>',
    (customerMailto ? '<td><a href="' + escHtml_(customerMailto) + '" style="display:inline-block;background:#ffffff;color:#0f172a;text-decoration:none;font-weight:800;font-size:12px;padding:9px 12px;border-radius:9px;">Reply to Customer</a></td>' : ''),
    '</tr>',
    '</table>',
    '</div>',
    '</div>',
    '<div style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#64748b;">',
    'A Quality Pool Company • Custom liner orders done right',
    '</div>',
    '</div>',
    '</div>',
    '</body>',
    '</html>'
  ].join('');
}

function getImageAttachmentsFromFolderUrl_(folderUrl) {
  try {
    const url = String(folderUrl || '').trim();
    if (!url) return [];
    const match = url.match(/[-\w]{25,}/);
    if (!match) return [];

    const folder = DriveApp.getFolderById(match[0]);
    const files = folder.getFiles();
    const out = [];
    let totalBytes = 0;
    const maxFiles = 10;
    const maxTotalBytes = 18 * 1024 * 1024;

    while (files.hasNext() && out.length < maxFiles) {
      const f = files.next();
      const mime = String(f.getMimeType() || '').toLowerCase();
      const isImage = mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/jpg';
      if (!isImage) continue;

      const blob = f.getBlob();
      const size = blob.getBytes().length;
      if (totalBytes + size > maxTotalBytes) continue;

      out.push(blob.setName(f.getName()));
      totalBytes += size;
    }

    return out;
  } catch (err) {
    Logger.log('Initial email attachment warning: ' + err.message);
    return [];
  }
}

function cellCard_(title, content) {
  return '<td style="width:50%;padding:0 7px;vertical-align:top;">' +
    '<div style="background:#ffffff;border:1px solid #dbeafe;border-radius:18px;padding:18px 18px 16px;box-shadow:0 8px 24px rgba(2,132,199,.08);height:100%;">' +
    '<div style="font-size:12px;font-weight:800;color:#0369a1;letter-spacing:.18em;text-transform:uppercase;margin-bottom:14px;">' + escHtml_(title) + '</div>' +
    content +
    '</div>' +
    '</td>';
}

function detailLine_(label, value) {
  return '<div style="display:flex;gap:10px;justify-content:space-between;align-items:flex-start;padding:7px 0;border-bottom:1px solid #e2e8f0;font-size:14px;line-height:1.45;">' +
    '<div style="color:#475569;font-weight:700;min-width:120px;">' + escHtml_(label) + '</div>' +
    '<div style="color:#0f172a;font-weight:700;text-align:right;flex:1;">' + escHtml_(value || '') + '</div>' +
    '</div>';
}

function parsePhotoData_(raw) {
  try {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    const parsed = JSON.parse(String(raw || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    Logger.log('parsePhotoData_ warning: ' + err.message);
    return [];
  }
}

function estimatePhotoBytes_(photoData) {
  const list = Array.isArray(photoData) ? photoData : [];
  let total = 0;
  for (let i = 0; i < list.length; i++) {
    const photo = list[i] || {};
    const data = String(photo.data || '');
    const base64 = data.split(',')[1] || '';
    if (!base64) continue;
    total += Math.ceil((base64.length * 3) / 4);
  }
  return total;
}

function validateIncomingPhotoPayload_(photoData, payloadChars) {
  const count = Array.isArray(photoData) ? photoData.length : 0;
  if (count > MAX_UPLOAD_PHOTO_COUNT) {
    throw new Error('Too many photos. Limit is ' + MAX_UPLOAD_PHOTO_COUNT + '.');
  }

  const totalBytes = estimatePhotoBytes_(photoData);
  if (totalBytes > MAX_UPLOAD_PHOTO_TOTAL_BYTES) {
    throw new Error('Attachments are too large for the current upload path. Remove a few photos and retry.');
  }

  const chars = Number(payloadChars || 0);
  if (chars > MAX_UPLOAD_PHOTO_PAYLOAD_CHARS) {
    throw new Error('Photo payload too large. Please remove a few images and retry.');
  }
}

function getImageAttachmentsFromPhotoData_(photoData) {
  try {
    const list = Array.isArray(photoData) ? photoData : [];
    const out = [];
    let totalBytes = 0;
    const maxFiles = 10;
    const maxTotalBytes = 18 * 1024 * 1024;

    for (let i = 0; i < list.length && out.length < maxFiles; i++) {
      const photo = list[i] || {};
      const mime = String(photo.type || photo.mimeType || '').toLowerCase();
      const name = String(photo.name || ('Photo ' + (i + 1)));
      const dataUrl = String(photo.data || '');
      const inferredFromData = String(dataUrl.split(';')[0] || '').toLowerCase().replace(/^data:/, '');
      const effectiveMime = isSupportedImageMime_(mime)
        ? mime
        : (isSupportedImageMime_(inferredFromData) ? inferredFromData : (isSupportedImageName_(name) ? inferImageMimeFromName_(name) : ''));
      const isImage = isSupportedImageMime_(effectiveMime) || isSupportedImageName_(name);
      if (!isImage) continue;

      const base64 = dataUrl.split(',')[1];
      if (!base64) continue;

      const bytes = Utilities.base64Decode(base64);
      if (totalBytes + bytes.length > maxTotalBytes) continue;

      const blob = Utilities.newBlob(bytes, effectiveMime || 'application/octet-stream', name);
      out.push(blob);
      totalBytes += bytes.length;
    }

    return out;
  } catch (err) {
    Logger.log('getImageAttachmentsFromPhotoData_ warning: ' + err.message);
    return [];
  }
}

function sendBrandedEmail_(to, subject, body, options) {
  const safeTo = String(to || '').trim();
  if (!safeTo) throw new Error('Email recipient is required.');

  const safeSubject = String(subject || 'A Quality Pool Company Update');
  const safeBody = String(body || 'A Quality Pool Company update');
  const opts = options || {};

  try {
    GmailApp.sendEmail(safeTo, safeSubject, safeBody, opts);
    return;
  } catch (gmailErr) {
    Logger.log('GmailApp send warning: ' + gmailErr.message);
  }

  // Fallback for environments where GmailApp is restricted but MailApp is allowed.
  MailApp.sendEmail({
    to: safeTo,
    subject: safeSubject,
    body: safeBody,
    cc: opts.cc || undefined,
    htmlBody: opts.htmlBody || undefined,
    attachments: opts.attachments || undefined,
    name: opts.name || undefined,
  });
}

function escHtml_(v) {
  return String(v || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

// ── SHEET HELPERS ────────────────────────────────────────────────────────────
function getOrCreateLinerOrdersSheet() {
  // 1. Try the hardcoded ID, then a previously-stored ID, then create a new one.
  const props      = PropertiesService.getScriptProperties();
  const storedId   = props.getProperty('LINER_SPREADSHEET_ID');
  let ss           = null;

  const candidates = [SPREADSHEET_ID, storedId].filter(Boolean);
  for (const id of candidates) {
    try {
      ss = SpreadsheetApp.openById(id);
      break;
    } catch (e) {
      Logger.log('Could not open spreadsheet ' + id + ': ' + e.message);
    }
  }

  if (!ss) {
    // Create a brand-new spreadsheet inside the Heritage root Drive folder.
    ss = SpreadsheetApp.create('A Quality Pool Company — Liner Orders');
    props.setProperty('LINER_SPREADSHEET_ID', ss.getId());
    try {
      const file   = DriveApp.getFileById(ss.getId());
      const folder = DriveApp.getFolderById(HERITAGE_ROOT_FOLDER_ID);
      folder.addFile(file);
      DriveApp.getRootFolder().removeFile(file);  // remove from My Drive root
    } catch (e) {
      Logger.log('Could not move new sheet to heritage folder: ' + e.message);
    }
    Logger.log('Created new spreadsheet: ' + ss.getId());
  }

  let sheet = ss.getSheetByName('Liner Orders');
  if (!sheet) {
    sheet = ss.insertSheet('Liner Orders');
    ensureLinerOrdersSheetStructure(sheet);
    Logger.log('Created new "Liner Orders" tab.');
  }
  return sheet;
}

function appendOrderRow(data) {
  const sheet   = getOrCreateLinerOrdersSheet();
  const orderId = 'LO-' + new Date().getTime();
  const row = new Array(19).fill('');
  row[COL.ORDER_ID]       = orderId;
  row[COL.DATE]           = todayStamp();
  row[COL.CUSTOMER_NAME]  = data.customerName;
  row[COL.CUSTOMER_PHONE] = data.customerPhone;
  row[COL.CUSTOMER_EMAIL] = data.customerEmail;
  row[COL.POOL_SHAPE]     = data.poolShape;
  row[COL.LINER_DESIGN]   = data.linerDesign;
  row[COL.MIL_SERIES]     = data.milSeries;
  row[COL.CORNER_OUTLINE] = data.cornerOutline || '';
  row[COL.WALL_HEIGHT]    = data.wallHeight || '';
  row[COL.POOL_WIDTH]     = data.poolWidth || '';
  row[COL.POOL_LENGTH]    = data.poolLength || '';
  row[COL.POOL_DEPTH]     = data.poolDepth || '';
  row[COL.STATUS]         = 'Order Submitted';
  row[COL.COMMENTS]       = '';
  row[COL.FOLDER_URL]     = data.folderUrl;
  row[COL.NOTES]          = data.notes;
  row[COL.LAST_UPDATED]   = new Date().toISOString();
  row[COL.PHOTO_FILES]    = serializePhotoFiles_(data.photoFiles);
  sheet.appendRow(row);

  // Style the newly appended row
  const newRowIdx = sheet.getLastRow();
  sheet.setRowHeight(newRowIdx, 32);
  if (data.folderUrl) {
    sheet.getRange(newRowIdx, COL.FOLDER_URL + 1)
      .setFormula('=HYPERLINK("' + data.folderUrl.replace(/"/g, '') + '","📁 Open Folder")');
  }

  Logger.log('Appended order row: ' + orderId);
  return orderId;
}

// ── GET ALL ORDERS ────────────────────────────────────────────────────────────
/**
 * Returns all liner orders as an array of objects, newest first.
 */
function getOrders() {
  try {
    const sheet  = getOrCreateLinerOrdersSheet();
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return { success: true, orders: [] };

    const orders = [];
    for (let i = values.length - 1; i >= 1; i--) {
      const r = values[i];
      orders.push({
        rowIndex:      i + 1,   // 1-based for sheet operations
        orderId:       r[COL.ORDER_ID],
        date:          r[COL.DATE],
        customerName:  r[COL.CUSTOMER_NAME],
        customerPhone: r[COL.CUSTOMER_PHONE],
        customerEmail: r[COL.CUSTOMER_EMAIL],
        poolShape:     r[COL.POOL_SHAPE],
        linerDesign:   r[COL.LINER_DESIGN],
        milSeries:     r[COL.MIL_SERIES],
        cornerOutline: r[COL.CORNER_OUTLINE],
        wallHeight:    r[COL.WALL_HEIGHT],
        poolWidth:     r[COL.POOL_WIDTH],
        poolLength:    r[COL.POOL_LENGTH],
        poolDepth:     r[COL.POOL_DEPTH],
        status:        r[COL.STATUS],
        comments:      r[COL.COMMENTS],
        folderUrl:     r[COL.FOLDER_URL],
        notes:         r[COL.NOTES],
        lastUpdated:   r[COL.LAST_UPDATED],
        photoFiles:    getOrderPhotoFiles_(r),
      });
    }
    return { success: true, orders: orders };
  } catch (err) {
    return { success: false, error: err.message, orders: [] };
  }
}

function serializePhotoFiles_(photoFiles) {
  try {
    return JSON.stringify((photoFiles || []).map(function(file) {
      return {
        id: String(file.id || ''),
        name: String(file.name || ''),
        mimeType: String(file.mimeType || ''),
      };
    }));
  } catch (err) {
    Logger.log('serializePhotoFiles_ warning: ' + err.message);
    return '[]';
  }
}

function parsePhotoFiles_(raw) {
  try {
    const parsed = JSON.parse(String(raw || '[]'));
    if (!Array.isArray(parsed)) return [];
    return parsed.map(function(file) {
      const id = String(file && file.id || '').trim();
      if (!id) return null;
      return {
        id: id,
        name: String(file.name || ''),
        mimeType: String(file.mimeType || ''),
        thumbnailUrl: 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w320',
        viewUrl: 'https://drive.google.com/file/d/' + encodeURIComponent(id) + '/view',
      };
    }).filter(Boolean);
  } catch (err) {
    Logger.log('parsePhotoFiles_ warning: ' + err.message);
    return [];
  }
}

function getOrderPhotoFiles_(orderRow) {
  const stored = parsePhotoFiles_(orderRow[COL.PHOTO_FILES]);
  if (stored.length) return stored;
  return getPhotoFilesFromFolderUrl_(orderRow[COL.FOLDER_URL]);
}

function getPhotoFilesFromFolderUrl_(folderUrl) {
  try {
    const url = String(folderUrl || '').trim();
    if (!url) return [];
    const match = url.match(/[-\w]{25,}/);
    if (!match) return [];

    const files = DriveApp.getFolderById(match[0]).getFiles();
    const out = [];
    while (files.hasNext() && out.length < 8) {
      const f = files.next();
      const mime = String(f.getMimeType() || '').toLowerCase();
      if (mime !== 'image/jpeg' && mime !== 'image/png' && mime !== 'image/jpg') continue;
      const id = f.getId();
      out.push({
        id: id,
        name: f.getName(),
        mimeType: mime,
        thumbnailUrl: 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w320',
        viewUrl: 'https://drive.google.com/file/d/' + encodeURIComponent(id) + '/view',
      });
    }
    return out;
  } catch (err) {
    Logger.log('getPhotoFilesFromFolderUrl_ warning: ' + err.message);
    return [];
  }
}

// ── UPDATE ORDER STATUS ───────────────────────────────────────────────────────
/**
 * params: { orderId, newStatus, comment }
 */
function updateOrderStatus(params) {
  try {
    const sheet  = getOrCreateLinerOrdersSheet();
    const values = sheet.getDataRange().getValues();
    let targetRow = -1;
    for (let i = 1; i < values.length; i++) {
      if (values[i][COL.ORDER_ID] === params.orderId) {
        targetRow = i + 1; // 1-based
        break;
      }
    }
    if (targetRow === -1) throw new Error('Order not found: ' + params.orderId);

    if (params.newStatus) {
      sheet.getRange(targetRow, COL.STATUS + 1).setValue(params.newStatus);
    }
    if (params.comment) {
      const existing = sheet.getRange(targetRow, COL.COMMENTS + 1).getValue();
      const stamp    = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MM/dd/yyyy HH:mm');
      const newVal   = existing
        ? existing + '\n[' + stamp + '] ' + params.comment
        : '[' + stamp + '] ' + params.comment;
      sheet.getRange(targetRow, COL.COMMENTS + 1).setValue(newVal);
    }
    sheet.getRange(targetRow, COL.LAST_UPDATED + 1).setValue(new Date().toISOString());

    Logger.log('Updated order ' + params.orderId + ' → ' + params.newStatus);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── SEND CUSTOMER STATUS EMAIL ────────────────────────────────────────────────
/**
 * params: { orderId, toEmail, toName, subject?, body? }
 * If subject/body are not provided, a sensible default is built from order data.
 */
function sendCustomerStatusEmail(params) {
  try {
    if (!params.toEmail) throw new Error('Customer email is required.');

    let subject = params.subject;
    let body    = params.body;
    let htmlBody = params.htmlBody;
    let orderRow = null;

    if (params.orderId) {
      const sheetForLookup = getOrCreateLinerOrdersSheet();
      const valuesForLookup = sheetForLookup.getDataRange().getValues();
      for (let i = 1; i < valuesForLookup.length; i++) {
        if (valuesForLookup[i][COL.ORDER_ID] === params.orderId) {
          orderRow = valuesForLookup[i];
          break;
        }
      }
    }

    // If caller sent a pre-built subject/body just use those
    if (!subject || !body) {
      const linerDesign = orderRow ? orderRow[COL.LINER_DESIGN] : 'your liner';
      const status      = orderRow ? orderRow[COL.STATUS]       : params.status || 'updated';

      subject = subject || 'Your Pool Liner Order Update — A Quality Pool Company';
      body    = body || buildDefaultCustomerEmail(params.toName, linerDesign, status, params.extraNote);
      htmlBody = htmlBody || buildDefaultCustomerEmailHtml(params.toName, linerDesign, status, params.extraNote);
    }

    const attachRequested = params.includeAttachments === true || String(params.includeAttachments || '').toLowerCase() === 'true';
    const isDistributorResend = String(params.targetType || '').toLowerCase() === 'distributor';
    const attachments = attachRequested
      ? getOrderAttachments_(orderRow, { imagesOnly: isDistributorResend })
      : [];
    const ccEmails = normalizeEmailList_(params.ccEmails);

    GmailApp.sendEmail(params.toEmail, subject, body || 'Email update from A Quality Pool Company', {
      name: 'A Quality Pool Company',
      cc: ccEmails || undefined,
      htmlBody: htmlBody || undefined,
      attachments: attachments.length ? attachments : undefined,
    });

    // Log comment on the order
    if (params.orderId) {
      const targetLabel = params.targetType === 'distributor' ? 'Distributor email sent to ' : 'Customer email sent to ';
      const attachMsg = attachRequested ? (' (' + attachments.length + ' attachments)') : '';
      updateOrderStatus({
        orderId: params.orderId,
        comment: targetLabel + params.toEmail + attachMsg,
      });
    }

    Logger.log('Sent customer email to ' + params.toEmail + (ccEmails ? (' (cc: ' + ccEmails + ')') : '') + (attachRequested ? (' (attachments: ' + attachments.length + ')') : ''));
    return { success: true, attachmentCount: attachments.length };
  } catch (err) {
    Logger.log('sendCustomerStatusEmail error: ' + err.message);
    return { success: false, error: err.message };
  }
}

function normalizeEmailList_(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';

  const parts = text
    .split(/[;,\n]+/)
    .map(s => s.trim())
    .filter(Boolean);

  if (!parts.length) return '';

  const valid = [];
  const seen = {};
  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

  for (let i = 0; i < parts.length; i++) {
    const e = parts[i].toLowerCase();
    if (!emailRx.test(e)) throw new Error('Invalid email in CC list: ' + parts[i]);
    if (!seen[e]) {
      seen[e] = true;
      valid.push(e);
    }
  }

  return valid.join(',');
}

function getOrderAttachments_(orderRow, opts) {
  try {
    opts = opts || {};
    if (!orderRow) return [];
    const storedFiles = parsePhotoFiles_(orderRow[COL.PHOTO_FILES]);
    if (!storedFiles.length) return [];

    const out = [];
    let totalBytes = 0;
    const maxFiles = 6;
    const maxTotalBytes = 18 * 1024 * 1024; // keep under Gmail limit with margin

    for (let i = 0; i < storedFiles.length && out.length < maxFiles; i++) {
      const meta = storedFiles[i] || {};
      const fileId = String(meta.id || '').trim();
      if (!fileId) continue;

      let f;
      try {
        f = DriveApp.getFileById(fileId);
      } catch (err) {
        Logger.log('Attachment file lookup warning [' + fileId + ']: ' + err.message);
        continue;
      }

      const name = String(f.getName() || '');
      const mime = String(f.getMimeType() || '');

      // For distributor resend, enforce images from Drive folder.
      // Otherwise include useful docs too.
      const useful = opts.imagesOnly
        ? (isSupportedImageMime_(String(mime || '').toLowerCase()) || isSupportedImageName_(name))
        : (
          mime.indexOf('image/') === 0 ||
          isSupportedImageName_(name) ||
          mime === 'application/pdf' ||
          mime === 'text/plain' ||
          /liner order/i.test(name)
        );
      if (!useful) continue;

      const blob = f.getBlob();
      const size = blob.getBytes().length;
      if (totalBytes + size > maxTotalBytes) continue;

      out.push(blob.setName(name));
      totalBytes += size;
    }
    return out;
  } catch (err) {
    Logger.log('Attachment load warning: ' + err.message);
    return [];
  }
}

function buildDefaultCustomerEmail(name, linerDesign, status, extraNote) {
  const first = (name || 'there').split(' ')[0];
  const lines = [
    'Hi ' + first + ',',
    '',
    'Great news — we have an update on your pool liner order!',
    '',
    '  Liner:  ' + linerDesign,
    '  Status: ' + status,
    '',
  ];
  if (extraNote) { lines.push(extraNote); lines.push(''); }
  lines.push(
    "If you have any questions, don't hesitate to give us a call.",
    '',
    'Thanks for choosing A Quality Pool Company!',
    '',
    '— A Quality Pool Company',
  );
  return lines.join('\n');
}

function buildDefaultCustomerEmailHtml(name, linerDesign, status, extraNote) {
  const first = escHtml_((name || 'there').split(' ')[0]);
  const safeLiner = escHtml_(linerDesign || 'your liner');
  const safeStatus = escHtml_(status || 'Updated');
  const extra = extraNote
    ? [
        '<div style="margin-top:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;">',
        '<div style="font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#0369a1;margin-bottom:7px;">Additional Notes</div>',
        '<div style="color:#334155;line-height:1.6;white-space:pre-wrap;">' + escHtml_(extraNote) + '</div>',
        '</div>'
      ].join('')
    : '';

  let statusBg = '#dbeafe';
  let statusColor = '#1d4ed8';
  const lowerStatus = String(status || '').toLowerCase();
  if (/installed|ready/.test(lowerStatus)) {
    statusBg = '#d1fae5';
    statusColor = '#065f46';
  } else if (/cancel/.test(lowerStatus)) {
    statusBg = '#fee2e2';
    statusColor = '#991b1b';
  } else if (/processing|production|shipment/.test(lowerStatus)) {
    statusBg = '#fef3c7';
    statusColor = '#92400e';
  }

  return [
    '<!doctype html>',
    '<html>',
    '<body style="margin:0;padding:0;background:#eef2ff;font-family:Arial,sans-serif;color:#0f172a;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#eef2ff;">',
    '<tr>',
    '<td style="padding:14px 10px;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;border-collapse:collapse;background:#ffffff;border:1px solid #dbeafe;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.12);">',
    '<tr>',
    '<td style="padding:16px 16px 14px;background:linear-gradient(135deg,#0f172a,#0284c7);color:#fff;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">',
    '<tr>',
    '<td style="width:58px;vertical-align:middle;padding-right:10px;">',
    '<img src="' + COMPANY_LOGO_URL + '" alt="A Quality Pool Company" style="width:48px;height:48px;object-fit:contain;border-radius:10px;background:#fff;padding:4px;display:block;">',
    '</td>',
    '<td style="vertical-align:middle;">',
    '<div style="font-size:10px;letter-spacing:.16em;text-transform:uppercase;opacity:.88;line-height:1.4;">A Quality Pool Company</div>',
    '<div style="font-size:20px;font-weight:700;margin-top:4px;line-height:1.25;">Pool Liner Order Update</div>',
    '</td>',
    '</tr>',
    '</table>',
    '</td>',
    '</tr>',
    '<tr>',
    '<td style="padding:16px;">',
    '<p style="margin:0 0 12px;font-size:15px;line-height:1.55;">Hi ' + first + ',</p>',
    '<p style="margin:0 0 14px;line-height:1.6;color:#334155;">We wanted to share the latest progress on your liner order.</p>',
    '<div style="background:linear-gradient(135deg,#f8fafc,#eff6ff);border:1px solid #dbeafe;border-radius:12px;padding:14px 14px;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">',
    '<tr><td style="padding:5px 0;color:#475569;font-weight:700;width:90px;">Liner</td><td style="padding:5px 0;color:#0f172a;font-weight:700;">' + safeLiner + '</td></tr>',
    '<tr><td style="padding:5px 0;color:#475569;font-weight:700;">Status</td><td style="padding:5px 0;"><span style="display:inline-block;padding:4px 10px;border-radius:999px;background:' + statusBg + ';color:' + statusColor + ';font-weight:800;font-size:12px;">' + safeStatus + '</span></td></tr>',
    '</table>',
    '</div>',
    extra,
    '<p style="margin:16px 0 0;line-height:1.6;color:#334155;">If you have any questions, just reply to this email or call us anytime.</p>',
    '</td>',
    '</tr>',
    '<tr>',
    '<td style="padding:0 16px 16px;">',
    '<div style="border-top:1px solid #e2e8f0;background:#f8fafc;border-radius:10px;padding:12px 14px;">',
    '<div style="font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#0369a1;margin-bottom:7px;">Signature</div>',
    '<div style="font-size:14px;font-weight:700;color:#0f172a;">Thanks for choosing A Quality Pool Company!</div>',
    '<div style="margin-top:6px;color:#475569;line-height:1.55;">— The A Quality Pool Company Team</div>',
    '</div>',
    '</td>',
    '</tr>',
    '</table>',
    '</td>',
    '</tr>',
    '</table>',
    '</body>',
    '</html>'
  ].join('');
}

// ── CUSTOMER SEARCH ───────────────────────────────────────────────────────────
function searchCustomersByCompanyId(query, companyId) {
  try {
    const ss    = SpreadsheetApp.openById(CUSTOMERS_SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Customers');
    if (!sheet) return { success: true, suggestions: [] };

    const dataRows = sheet.getDataRange().getValues();
    if (dataRows.length < 2) return { success: true, suggestions: [] };

    const headers = dataRows[0];

    // Case-insensitive column finder (matches getCustomersFromSheet logic)
    const findCol = name => {
      for (let i = 0; i < headers.length; i++) {
        if (String(headers[i]).trim().toLowerCase() === name.toLowerCase()) return i;
      }
      return -1;
    };

    const idCol        = findCol('Customer ID');
    const nameCol      = findCol('Name');
    const emailCol     = findCol('Email');
    const phoneCol     = findCol('Phone');
    const addressCol   = findCol('Address');
    const cityCol      = findCol('City');
    const stateCol     = findCol('State');
    const zipCol       = findCol('Zip Code');
    const companyIdCol = findCol('Company ID');

    if (nameCol === -1 && emailCol === -1) {
      Logger.log('Liner search: could not find Name or Email columns. Headers: ' + JSON.stringify(headers));
      return { success: true, suggestions: [] };
    }

    const targetId  = companyId || 'CMP-HERITAGEPOOLSUPPLY';
    const q         = String(query || '').toLowerCase().trim();
    const suggestions = [];

    for (let i = 1; i < dataRows.length && suggestions.length < 20; i++) {
      const row = dataRows[i];

      const name  = nameCol  >= 0 ? String(row[nameCol]  || '').trim() : '';
      const email = emailCol >= 0 ? String(row[emailCol] || '').trim() : '';
      if (!name && !email) continue;

      // Filter by Company ID — skip rows that explicitly belong to a different company.
      // Rows with an empty Company ID are legacy customers and always shown.
      if (companyIdCol >= 0) {
        const rowCo = String(row[companyIdCol] || '').trim();
        if (rowCo && rowCo !== targetId) continue;
      }

      // Apply search query across name, email, and phone
      if (q) {
        const phone = phoneCol >= 0 ? String(row[phoneCol] || '').toLowerCase() : '';
        if (!name.toLowerCase().includes(q) && !email.toLowerCase().includes(q) && !phone.includes(q)) continue;
      }

      // Build full address the same way getCustomersFromSheet does
      let fullAddress = addressCol >= 0 ? String(row[addressCol] || '').trim() : '';
      const city  = cityCol  >= 0 ? String(row[cityCol]  || '').trim() : '';
      const state = stateCol >= 0 ? String(row[stateCol] || '').trim() : '';
      const zip   = zipCol   >= 0 ? String(row[zipCol]   || '').trim() : '';
      if (city || state || zip) {
        const parts = [city, state, zip].filter(p => p);
        fullAddress = fullAddress ? fullAddress + ', ' + parts.join(', ') : parts.join(', ');
      }

      suggestions.push({
        id:      idCol >= 0 ? String(row[idCol] || '').trim() : '',
        name:    name || 'No Name',
        email:   email,
        phone:   phoneCol >= 0 ? String(row[phoneCol] || '').trim() : '',
        address: fullAddress,
      });
    }

    Logger.log('Liner search: found ' + suggestions.length + ' matches for "' + q + '"');
    return { success: true, suggestions };
  } catch (err) {
    Logger.log('Liner search error: ' + err.toString());
    return { success: false, suggestions: [], error: err.toString() };
  }
}

// ── DRIVE HELPERS ─────────────────────────────────────────────────────────────
function getOrCreateCustomerFolder(customerName, address) {
  const root      = DriveApp.getFolderById(HERITAGE_ROOT_FOLDER_ID);
  const namePart  = customerName.trim();
  const folderName = address ? namePart + ' - ' + address.trim() : namePart;
  const normalized = namePart.toLowerCase();
  const iter = root.getFolders();
  while (iter.hasNext()) {
    const f    = iter.next();
    const fLow = f.getName().toLowerCase();
    // Match on the name portion (before any " - ") so existing folders are reused
    if (fLow === normalized || fLow.indexOf(normalized + ' - ') === 0) return f;
  }
  return root.createFolder(folderName);
}

function saveTextFile(folder, filename, content) {
  folder.createFile(Utilities.newBlob(content, 'text/plain', filename));
}

function isSupportedImageMime_(mime) {
  const m = String(mime || '').toLowerCase();
  return m === 'image/jpeg' || m === 'image/jpg' || m === 'image/png';
}

function isSupportedImageName_(filename) {
  return /\.(jpe?g|png)$/i.test(String(filename || '').trim());
}

function inferImageMimeFromName_(filename) {
  const n = String(filename || '').toLowerCase();
  if (/\.png$/i.test(n)) return 'image/png';
  if (/\.jpe?g$/i.test(n)) return 'image/jpeg';
  return '';
}

function normalizeUploadMimeType_(mimeType, filename, dataUrl) {
  const rawMime = String(mimeType || '').toLowerCase().trim();
  if (isSupportedImageMime_(rawMime)) return rawMime;

  const fromDataUrl = String(dataUrl || '').split(';')[0].replace(/^data:/i, '').toLowerCase().trim();
  if (isSupportedImageMime_(fromDataUrl)) return fromDataUrl;

  const fromName = inferImageMimeFromName_(filename);
  if (isSupportedImageMime_(fromName)) return fromName;

  return rawMime || 'application/octet-stream';
}

function saveBase64File(folder, filename, dataUrl, mimeType) {
  const base64 = dataUrl.split(',')[1];
  if (!base64) return null;
  const safeName = String(filename || 'upload-file');
  const effectiveMime = normalizeUploadMimeType_(mimeType, safeName, dataUrl);
  const file = folder.createFile(
    Utilities.newBlob(Utilities.base64Decode(base64), effectiveMime, safeName)
  );
  return {
    id: file.getId(),
    name: file.getName(),
    mimeType: file.getMimeType(),
  };
}

// ── MISC ──────────────────────────────────────────────────────────────────────
function todayStamp() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
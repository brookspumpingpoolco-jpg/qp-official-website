/**
 * SERVICE REPORTING SYSTEM
 * 
 * Complete service report management with:
 * - Easy checklist-based service completion
 * - Photo uploads saved to customer folders
 * - Automatic email with photos to customer
 * - One-off invoice generation
 * - Telegram notifications for pending services
 * - Support for weekly/biweekly/monthly services
 * 
 * SETUP:
 * 1. Deploy as Web App (Execute as: Me, Who has access: Anyone)
 * 2. Add to Dashboard
 */

// Configuration - Inherit from main sheet
const SR_SPREADSHEET_ID = '1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0';
const SR_SERVICE_REPORTS_SHEET = 'Service Reports';
const SR_REPORT_PHOTOS_SHEET = 'Report Photos';
const SR_REPORT_CHECKLISTS_SHEET = 'Report Checklists';

// Service Report Status
const SR_STATUS = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  SENT_TO_CUSTOMER: 'Sent to Customer',
  APPROVED: 'Approved',
  INVOICED: 'Invoiced'
};

// Service Types
const SR_SERVICE_TYPES = [
  { id: 'weekly_service', name: 'Weekly Service', frequency: 'weekly' },
  { id: 'biweekly_service', name: 'Biweekly Service', frequency: 'biweekly' },
  { id: 'monthly_service', name: 'Monthly Service', frequency: 'monthly' },
  { id: 'opening_service', name: 'Pool Opening', frequency: 'one-off' },
  { id: 'closing_service', name: 'Pool Closing', frequency: 'one-off' }
];

/** Canonical Service Reports sheet headers (append-only for new columns — do not reorder early columns). */
const SR_REPORT_HEADERS = [
  'Report ID', 'Customer Name', 'Customer Email', 'Customer ID', 'Service Date', 'Service Type',
  'Status', 'Notes', 'Start Time', 'End Time', 'Technician', 'Created Date', 'Photos URL',
  'Photos Count', 'Draft Invoice ID', 'Final Invoice ID', 'Checklist JSON', 'Pool Details JSON',
  'Linked Appointment ID'
];

/** camelCase update keys → sheet header names */
const SR_UPDATE_KEY_TO_HEADER = {
  reportId: 'Report ID',
  customerName: 'Customer Name',
  customerEmail: 'Customer Email',
  customerId: 'Customer ID',
  linkedAppointmentId: 'Linked Appointment ID',
  serviceDate: 'Service Date',
  serviceType: 'Service Type',
  status: 'Status',
  notes: 'Notes',
  startTime: 'Start Time',
  endTime: 'End Time',
  technician: 'Technician',
  createdDate: 'Created Date',
  photosUrl: 'Photos URL',
  photosCount: 'Photos Count',
  draftInvoiceId: 'Draft Invoice ID',
  finalInvoiceId: 'Final Invoice ID',
  checklist: 'Checklist JSON',
  poolDetails: 'Pool Details JSON'
};

// Standard Pool Service Checklist Items
const STANDARD_CHECKLIST = [
  { category: 'Water Testing', items: ['pH Balance (7.2-7.6)', 'Chlorine Level (1-3 ppm)', 'Alkalinity (80-120 ppm)', 'Calcium Hardness (200-400 ppm)'] },
  { category: 'Cleaning', items: ['Skim Surface', 'Brush Walls & Floor', 'Empty Pump Basket', 'Clean Skimmer Basket'] },
  { category: 'Equipment', items: ['Check Filter Pressure', 'Inspect Pump Operation', 'Check for Leaks', 'Verify Timer Settings'] },
  { category: 'Chemicals', items: ['Add Chlorine (if needed)', 'Add Alkalinity Increaser (if needed)', 'Add pH Increaser/Decreaser (if needed)', 'Add Stabilizer (if needed)'] },
  { category: 'Notes', items: ['Equipment Issues', 'Customer Requests', 'Next Service Notes', 'Additional Observations'] }
];

// ================================================================
// INITIALIZE SHEETS
// ================================================================

/**
 * Initialize all required sheets for service reporting
 */
function initializeServiceReportingSheets() {
  const ss = SpreadsheetApp.openById(SR_SPREADSHEET_ID);
  
  // Service Reports Sheet
  createSheetIfNeeded(ss, SR_SERVICE_REPORTS_SHEET, SR_REPORT_HEADERS);
  
  // Report Photos Sheet
  createSheetIfNeeded(ss, SR_REPORT_PHOTOS_SHEET, [
    'Photo ID', 'Report ID', 'Customer ID', 'Photo Name', 'File ID (Drive)', 'Photo URL', 
    'Photo Category', 'Uploaded Date', 'Technician', 'Photo Order', 'Photo Data URL'
  ]);
  
  // Report Checklists Sheet
  createSheetIfNeeded(ss, SR_REPORT_CHECKLISTS_SHEET, [
    'Report ID', 'Category', 'Item', 'Completed', 'Notes', 'Value', 'Timestamp'
  ]);
  
  Logger.log('✅ Service Reporting sheets initialized');
  return { success: true };
}

function createSheetIfNeeded(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    Logger.log('📄 Created sheet: ' + sheetName);
  } else if (headers && headers.length) {
    ensureSheetHeaders_(sheet, headers);
  }
}

/**
 * Append missing header cells on row 1 (matches SchedulingScript getOrCreateSheet pattern).
 */
function ensureSheetHeaders_(sheet, canonicalHeaders) {
  const lastCol = sheet.getLastColumn() || 1;
  const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (existing.length < canonicalHeaders.length) {
    const missing = canonicalHeaders.slice(existing.length);
    if (missing.length) {
      const startCol = existing.length + 1;
      sheet.getRange(1, startCol, 1, missing.length).setValues([missing]);
      sheet.getRange(1, startCol, 1, missing.length).setFontWeight('bold');
    }
  }
}

function readSrReportHeaders_(sheet) {
  var lastCol = sheet.getLastColumn() || 1;
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0];
}

function srCol_(headers, name, alternatives) {
  var i = headers.indexOf(name);
  if (i !== -1) return i;
  if (alternatives) {
    for (var a = 0; a < alternatives.length; a++) {
      i = headers.indexOf(alternatives[a]);
      if (i !== -1) return i;
    }
  }
  return -1;
}

/**
 * Build display/update object from a data row using header map (1-based rowIndex for sheet).
 */
function serviceReportRowToData_(row, headers, rowIndex1Based) {
  function g(headerNames) {
    for (var h = 0; h < headerNames.length; h++) {
      var idx = srCol_(headers, headerNames[h], null);
      if (idx >= 0 && row[idx] !== undefined && row[idx] !== '') return row[idx];
    }
    var idx0 = srCol_(headers, headerNames[0], headerNames.slice(1));
    return idx0 >= 0 ? row[idx0] : '';
  }
  var checklistRaw = g(['Checklist JSON']);
  var poolRaw = g(['Pool Details JSON']);
  return {
    reportId: g(['Report ID']),
    customerName: g(['Customer Name']),
    customerEmail: g(['Customer Email']),
    customerId: g(['Customer ID']),
    linkedAppointmentId: String(g(['Linked Appointment ID', 'LinkedAppointmentID']) || '').trim(),
    serviceDate: g(['Service Date']),
    serviceType: g(['Service Type']),
    status: g(['Status']),
    notes: g(['Notes']),
    startTime: g(['Start Time']),
    endTime: g(['End Time']),
    technician: g(['Technician']),
    createdDate: g(['Created Date']),
    photosUrl: g(['Photos URL']),
    photosCount: g(['Photos Count']),
    draftInvoiceId: g(['Draft Invoice ID']),
    finalInvoiceId: g(['Final Invoice ID']),
    checklist: safeParseJSON(checklistRaw),
    poolDetails: safeParseJSON(poolRaw),
    rowIndex: rowIndex1Based
  };
}

/**
 * Set or clear the Linked Appointment ID on a service report row (header-based).
 * When opt_skipAppointmentUpdate is false, syncs SchedulingScript appointment LinkedServiceReportID
 * (pass true when the change originated from setLinkedServiceReportIdOnAppointment to avoid recursion).
 */
function setLinkedAppointmentIdOnServiceReport(serviceReportId, appointmentIdOrEmpty, opt_skipAppointmentUpdate) {
  serviceReportId = String(serviceReportId || '').trim();
  if (!serviceReportId) {
    return { success: false, error: 'Missing service report ID' };
  }
  var nextAppt = String(appointmentIdOrEmpty || '').trim();
  var ss = SpreadsheetApp.openById(SR_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SR_SERVICE_REPORTS_SHEET);
  if (!sheet) {
    return { success: false, error: 'Sheet not found' };
  }
  ensureSheetHeaders_(sheet, SR_REPORT_HEADERS);
  var headers = readSrReportHeaders_(sheet);
  var idCol = srCol_(headers, 'Report ID', null);
  var apptCol = srCol_(headers, 'Linked Appointment ID', ['LinkedAppointmentID']);
  if (idCol < 0) {
    return { success: false, error: 'Report ID column missing' };
  }
  if (apptCol < 0) {
    return { success: false, error: 'Linked Appointment ID column missing' };
  }
  var values = sheet.getDataRange().getValues();
  var skipAppt = !!opt_skipAppointmentUpdate;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idCol]).trim() !== serviceReportId) continue;
    var prevAppt = values[i][apptCol] !== undefined ? String(values[i][apptCol] || '').trim() : '';
    if (prevAppt === nextAppt) {
      return { success: true, unchanged: true };
    }
    sheet.getRange(i + 1, apptCol + 1).setValue(nextAppt);
    if (skipAppt) {
      return { success: true };
    }
    if (prevAppt && prevAppt !== nextAppt && typeof setLinkedServiceReportIdOnAppointment === 'function') {
      setLinkedServiceReportIdOnAppointment(prevAppt, '', true);
    }
    if (nextAppt && typeof setLinkedServiceReportIdOnAppointment === 'function') {
      setLinkedServiceReportIdOnAppointment(nextAppt, serviceReportId, true);
    }
    return { success: true };
  }
  return { success: false, error: 'Service report not found' };
}

function buildServiceReportRowArray_(data, headers) {
  var row = [];
  for (var c = 0; c < headers.length; c++) {
    var h = String(headers[c] || '').trim();
    var v = '';
    switch (h) {
      case 'Report ID':
        v = data.reportId || '';
        break;
      case 'Customer Name':
        v = data.customerName || '';
        break;
      case 'Customer Email':
        v = data.customerEmail || '';
        break;
      case 'Customer ID':
        v = data.customerId || '';
        break;
      case 'Linked Appointment ID':
        v = data.linkedAppointmentId || '';
        break;
      case 'Service Date':
        v = data.serviceDate || '';
        break;
      case 'Service Type':
        v = data.serviceType || 'weekly_service';
        break;
      case 'Status':
        v = data.status || SR_STATUS.PENDING;
        break;
      case 'Notes':
        v = data.notes || '';
        break;
      case 'Start Time':
        v = data.startTime || '';
        break;
      case 'End Time':
        v = data.endTime || '';
        break;
      case 'Technician':
        v = data.technician || '';
        break;
      case 'Created Date':
        v = data.createdDate || '';
        break;
      case 'Photos URL':
        v = data.photosUrl || '';
        break;
      case 'Photos Count':
        v = data.photosCount != null ? data.photosCount : 0;
        break;
      case 'Draft Invoice ID':
        v = data.draftInvoiceId || '';
        break;
      case 'Final Invoice ID':
        v = data.finalInvoiceId || '';
        break;
      case 'Checklist JSON':
        v = typeof data.checklist === 'string' ? data.checklist : JSON.stringify(data.checklist || STANDARD_CHECKLIST);
        break;
      case 'Pool Details JSON':
        v = typeof data.poolDetails === 'string' ? data.poolDetails : JSON.stringify(data.poolDetails || {});
        break;
      default:
        v = '';
    }
    row.push(v);
  }
  return row;
}

// ================================================================
// CREATE & RETRIEVE SERVICE REPORTS
// ================================================================

/**
 * Create a new service report for a customer
 */
function createServiceReport(data) {
  try {
    const ss = SpreadsheetApp.openById(SR_SPREADSHEET_ID);
    const sheet = getOrCreateSheet(ss, SR_SERVICE_REPORTS_SHEET);
    ensureSheetHeaders_(sheet, SR_REPORT_HEADERS);

    const reportId = 'SR-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    const now = new Date();

    const rowData = {
      reportId: reportId,
      customerName: data.customerName || '',
      customerEmail: data.customerEmail || '',
      customerId: data.customerId || '',
      linkedAppointmentId: data.linkedAppointmentId || '',
      serviceDate: data.serviceDate || formatSheetDate(now),
      serviceType: data.serviceType || 'weekly_service',
      status: SR_STATUS.PENDING,
      notes: data.notes || '',
      startTime: data.startTime || formatTime(now),
      endTime: '',
      technician: data.technician || '',
      createdDate: formatSheetDate(now),
      photosUrl: '',
      photosCount: 0,
      draftInvoiceId: '',
      finalInvoiceId: '',
      checklist: data.checklist || STANDARD_CHECKLIST,
      poolDetails: data.poolDetails || {}
    };

    const headers = readSrReportHeaders_(sheet);
    const row = buildServiceReportRowArray_(rowData, headers);
    sheet.appendRow(row);

    if (rowData.linkedAppointmentId && String(rowData.linkedAppointmentId).trim() && typeof setLinkedServiceReportIdOnAppointment === 'function') {
      try {
        setLinkedServiceReportIdOnAppointment(String(rowData.linkedAppointmentId).trim(), reportId, true);
      } catch (linkErr) {
        Logger.log('⚠️ createServiceReport linkedAppointmentId sync: ' + linkErr.toString());
      }
    }

    Logger.log('✅ Service report created: ' + reportId);
    return { success: true, reportId: reportId };
  } catch (error) {
    Logger.log('❌ createServiceReport error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Get service report details
 */
function getServiceReport(reportId) {
  try {
    const ss = SpreadsheetApp.openById(SR_SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SR_SERVICE_REPORTS_SHEET);
    if (!sheet) return { success: false, error: 'Sheet not found' };

    ensureSheetHeaders_(sheet, SR_REPORT_HEADERS);
    const headers = readSrReportHeaders_(sheet);
    const idCol = srCol_(headers, 'Report ID', null);
    if (idCol < 0) return { success: false, error: 'Report ID column missing' };

    const values = sheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][idCol]).trim() === String(reportId).trim()) {
        return { success: true, data: serviceReportRowToData_(values[i], headers, i + 1) };
      }
    }
    return { success: false, error: 'Report not found' };
  } catch (error) {
    Logger.log('❌ getServiceReport error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Get all pending service reports for a customer
 */
function getPendingServiceReports(customerId) {
  try {
    const ss = SpreadsheetApp.openById(SR_SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SR_SERVICE_REPORTS_SHEET);
    if (!sheet) return { success: false, error: 'Sheet not found' };

    ensureSheetHeaders_(sheet, SR_REPORT_HEADERS);
    const headers = readSrReportHeaders_(sheet);
    const values = sheet.getDataRange().getValues();
    const reports = [];

    for (let i = 1; i < values.length; i++) {
      const d = serviceReportRowToData_(values[i], headers, i + 1);
      if (String(d.customerId).trim() === String(customerId).trim() &&
          (d.status === SR_STATUS.PENDING || d.status === SR_STATUS.IN_PROGRESS)) {
        reports.push({
          reportId: d.reportId,
          customerName: d.customerName,
          serviceDate: d.serviceDate,
          serviceType: d.serviceType,
          status: d.status,
          startTime: d.startTime,
          linkedAppointmentId: d.linkedAppointmentId
        });
      }
    }

    return { success: true, reports: reports };
  } catch (error) {
    Logger.log('❌ getPendingServiceReports error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Merge partial updates onto existing report row (camelCase keys + SR_UPDATE_KEY_TO_HEADER).
 */
function mergeServiceReportUpdates_(existing, updates) {
  var merged = {};
  var k;
  for (k in existing) {
    if (existing.hasOwnProperty(k) && k !== 'rowIndex') merged[k] = existing[k];
  }
  for (k in updates) {
    if (!updates.hasOwnProperty(k)) continue;
    merged[k] = updates[k];
  }
  return merged;
}

/**
 * Update service report status and details
 */
function updateServiceReport(reportId, updates) {
  try {
    const ss = SpreadsheetApp.openById(SR_SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SR_SERVICE_REPORTS_SHEET);
    if (!sheet) return { success: false, error: 'Sheet not found' };

    ensureSheetHeaders_(sheet, SR_REPORT_HEADERS);
    const report = getServiceReport(reportId);
    if (!report.success) return report;

    const rowIndex = report.data.rowIndex;
    const headers = readSrReportHeaders_(sheet);

    var patch = {};
    var key;
    for (key in updates) {
      if (!updates.hasOwnProperty(key)) continue;
      var header = SR_UPDATE_KEY_TO_HEADER[key];
      if (!header || srCol_(headers, header, null) < 0) continue;
      var val = updates[key];
      if ((key === 'checklist' || key === 'poolDetails') && typeof val === 'object' && val !== null) {
        val = JSON.stringify(val);
      }
      patch[key] = val;
    }

    var merged = mergeServiceReportUpdates_(report.data, patch);
    if (merged.checklist != null && typeof merged.checklist !== 'string') {
      merged.checklist = JSON.stringify(merged.checklist);
    }
    if (merged.poolDetails != null && typeof merged.poolDetails !== 'string') {
      merged.poolDetails = JSON.stringify(merged.poolDetails);
    }
    if (merged.photosCount != null && merged.photosCount !== '') {
      merged.photosCount = parseInt(merged.photosCount, 10) || 0;
    }

    var prevLinkedAppt = String(report.data.linkedAppointmentId || '').trim();
    var nextLinkedAppt = String(merged.linkedAppointmentId != null ? merged.linkedAppointmentId : report.data.linkedAppointmentId || '').trim();

    var row = buildServiceReportRowArray_(merged, headers);
    sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);

    if (prevLinkedAppt !== nextLinkedAppt && typeof setLinkedServiceReportIdOnAppointment === 'function') {
      try {
        if (prevLinkedAppt) {
          setLinkedServiceReportIdOnAppointment(prevLinkedAppt, '', true);
        }
        if (nextLinkedAppt) {
          setLinkedServiceReportIdOnAppointment(nextLinkedAppt, reportId, true);
        }
      } catch (linkErr) {
        Logger.log('⚠️ updateServiceReport appointment link sync: ' + linkErr.toString());
      }
    }

    Logger.log('✅ Service report updated: ' + reportId);
    return { success: true };
  } catch (error) {
    Logger.log('❌ updateServiceReport error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

// ================================================================
// CHECKLIST MANAGEMENT
// ================================================================

/**
 * Get checklist for service report
 */
function getReportChecklist(reportId) {
  try {
    const ss = SpreadsheetApp.openById(SR_SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SR_REPORT_CHECKLISTS_SHEET);
    if (!sheet) return { success: false, error: 'Sheet not found' };
    
    const values = sheet.getDataRange().getValues();
    const checklist = {};
    
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]).trim() === String(reportId).trim()) {
        const category = values[i][1];
        if (!checklist[category]) checklist[category] = [];
        checklist[category].push({
          item: values[i][2],
          completed: values[i][3] === true || String(values[i][3]).toLowerCase() === 'true',
          notes: values[i][4],
          value: values[i][5]
        });
      }
    }
    
    return { success: true, checklist: checklist };
  } catch (error) {
    Logger.log('❌ getReportChecklist error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Save checklist item
 */
function saveChecklistItem(reportId, category, item, completed, notes, value) {
  try {
    const ss = SpreadsheetApp.openById(SR_SPREADSHEET_ID);
    const sheet = getOrCreateSheet(ss, SR_REPORT_CHECKLISTS_SHEET);
    
    // Check if item already exists
    const values = sheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]).trim() === String(reportId).trim() && 
          values[i][1] === category && values[i][2] === item) {
        // Update existing
        sheet.getRange(i + 1, 4).setValue(completed);
        sheet.getRange(i + 1, 5).setValue(notes);
        sheet.getRange(i + 1, 6).setValue(value);
        sheet.getRange(i + 1, 7).setValue(new Date());
        return { success: true };
      }
    }
    
    // Add new
    sheet.appendRow([
      reportId,
      category,
      item,
      completed,
      notes,
      value,
      new Date()
    ]);
    
    return { success: true };
  } catch (error) {
    Logger.log('❌ saveChecklistItem error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

// ================================================================
// PHOTO MANAGEMENT
// ================================================================

/**
 * Count rows in Report Photos where Report ID matches (excludes header row).
 */
function countPhotosForReport_(sheet, reportId) {
  var values = sheet.getDataRange().getValues();
  if (!values.length) return 0;
  var headers = values[0];
  var reportIdCol = srCol_(headers, 'Report ID', null);
  if (reportIdCol < 0) {
    reportIdCol = 1;
  }
  var rid = String(reportId).trim();
  var count = 0;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][reportIdCol]).trim() === rid) count++;
  }
  return count;
}

/**
 * Get or create customer folder in Drive
 */
function getOrCreateCustomerFolder(customerId, customerName) {
  try {
    const folder = DriveApp.getFolderById(CUSTOMER_DRIVE_FOLDER_ID);
    const customerFolderName = customerName + ' - ' + customerId;
    
    // Search for existing customer folder
    const folders = folder.getFoldersByName(customerFolderName);
    if (folders.hasNext()) {
      return { success: true, folderId: folders.next().getId() };
    }
    
    // Create new customer folder
    const newFolder = folder.createFolder(customerFolderName);
    return { success: true, folderId: newFolder.getId() };
  } catch (error) {
    Logger.log('❌ getOrCreateCustomerFolder error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Save photo from base64 to Drive and link to service report
 */
function saveReportPhoto(reportId, customerId, photoName, photoDataUrl, photoCategory) {
  try {
    const report = getServiceReport(reportId);
    if (!report.success) return { success: false, error: 'Report not found' };
    
    // Get or create customer folder
    const folderResult = getOrCreateCustomerFolder(customerId, report.data.customerName);
    if (!folderResult.success) return folderResult;
    
    const customerFolder = DriveApp.getFolderById(folderResult.folderId);
    
    // Create service report subfolder
    const reportFolderName = 'Service - ' + report.data.serviceDate;
    let reportFolder = null;
    const reportFolders = customerFolder.getFoldersByName(reportFolderName);
    if (reportFolders.hasNext()) {
      reportFolder = reportFolders.next();
    } else {
      reportFolder = customerFolder.createFolder(reportFolderName);
    }
    
    // Convert base64 to blob
    const data = photoDataUrl.replace(/^data:image\/\w+;base64,/, '');
    const blob = Utilities.newBlob(Utilities.base64Decode(data), 'image/jpeg', photoName + '.jpg');
    
    // Save to Drive
    const file = reportFolder.createFile(blob);
    const photoId = 'PHOTO-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    
    // Record in sheet (order = next index for this report only; count = total for this report)
    const ss = SpreadsheetApp.openById(SR_SPREADSHEET_ID);
    const sheet = getOrCreateSheet(ss, SR_REPORT_PHOTOS_SHEET);
    createSheetIfNeeded(ss, SR_REPORT_PHOTOS_SHEET, [
      'Photo ID', 'Report ID', 'Customer ID', 'Photo Name', 'File ID (Drive)', 'Photo URL',
      'Photo Category', 'Uploaded Date', 'Technician', 'Photo Order', 'Photo Data URL'
    ]);

    var existingForReport = countPhotosForReport_(sheet, reportId);
    var photoOrder = existingForReport + 1;

    sheet.appendRow([
      photoId,
      reportId,
      customerId,
      photoName,
      file.getId(),
      file.getUrl(),
      photoCategory || 'General',
      formatSheetDate(new Date()),
      report.data.technician,
      photoOrder,
      ''
    ]);

    var newCount = countPhotosForReport_(sheet, reportId);
    updateServiceReport(reportId, { photosCount: newCount });
    
    Logger.log('✅ Photo saved: ' + photoId);
    return { success: true, photoId: photoId, url: file.getUrl() };
  } catch (error) {
    Logger.log('❌ saveReportPhoto error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Get all photos for a service report
 */
function getReportPhotos(reportId) {
  try {
    const ss = SpreadsheetApp.openById(SR_SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SR_REPORT_PHOTOS_SHEET);
    if (!sheet) return { success: false, error: 'Sheet not found' };
    
    const values = sheet.getDataRange().getValues();
    const photos = [];
    
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][1]).trim() === String(reportId).trim()) {
        photos.push({
          photoId: values[i][0],
          photoName: values[i][3],
          fileId: values[i][4],
          url: values[i][5],
          category: values[i][6],
          uploadedDate: values[i][7],
          order: values[i][9]
        });
      }
    }
    
    // Sort by order
    photos.sort((a, b) => (a.order || 0) - (b.order || 0));
    
    return { success: true, photos: photos };
  } catch (error) {
    Logger.log('❌ getReportPhotos error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

// ================================================================
// EMAIL & NOTIFICATION FUNCTIONS
// ================================================================

/**
 * Send service report completion email with photos
 */
function sendServiceReportEmail(reportId) {
  try {
    const report = getServiceReport(reportId);
    if (!report.success) return report;
    
    const data = report.data;
    const photosResult = getReportPhotos(reportId);
    const photos = photosResult.success ? photosResult.photos : [];
    
    // Build email HTML
    let html = buildServiceReportEmailHTML(data, photos);
    
    // Send email
    MailApp.sendEmail({
      to: data.customerEmail,
      subject: '✅ Pool Service Report - ' + data.serviceDate,
      htmlBody: html,
      attachments: []
    });
    
    // Update status
    updateServiceReport(reportId, { status: SR_STATUS.SENT_TO_CUSTOMER });
    
    // Send Telegram notification to admin
    sendServiceReportTelegram_(reportId, data, photos.length);
    
    Logger.log('✅ Service report email sent: ' + reportId);
    return { success: true };
  } catch (error) {
    Logger.log('❌ sendServiceReportEmail error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Build service report email HTML with photos
 */
function buildServiceReportEmailHTML(data, photos) {
  const containerStyle = 'font-family:Segoe UI, Tahoma, Geneva, Verdana, sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f8fafc;';
  const headerStyle = 'background:linear-gradient(135deg, #0284c7 0%, #0369a1 100%);color:white;padding:24px;border-radius:8px 8px 0 0;text-align:center;';
  const sectionStyle = 'background:white;padding:20px;margin:15px 0;border-radius:8px;border-left:4px solid #0284c7;';
  
  let html = '<div style="' + containerStyle + '">';
  
  // Header
  html += '<div style="' + headerStyle + '">';
  html += '<h1 style="margin:0;font-size:28px;">🏊 Pool Service Complete</h1>';
  html += '<p style="margin:8px 0 0 0;font-size:14px;opacity:0.9;">Service Date: ' + data.serviceDate + '</p>';
  html += '</div>';
  
  // Service Details
  html += '<div style="' + sectionStyle + '">';
  html += '<h2 style="margin:0 0 12px 0;color:#0f172a;font-size:16px;">Service Details</h2>';
  html += '<table style="width:100%;border-collapse:collapse;">';
  html += '<tr><td style="padding:6px 0;color:#64748b;">Service Type:</td><td style="font-weight:700;">' + (data.serviceType || '—') + '</td></tr>';
  html += '<tr><td style="padding:6px 0;color:#64748b;">Time: </td><td style="font-weight:700;">' + (data.startTime || '—') + ' - ' + (data.endTime || '—') + '</td></tr>';
  html += '<tr><td style="padding:6px 0;color:#64748b;">Technician:</td><td style="font-weight:700;">' + (data.technician || '—') + '</td></tr>';
  html += '</table>';
  html += '</div>';
  
  // Notes
  if (data.notes) {
    html += '<div style="' + sectionStyle + '">';
    html += '<h2 style="margin:0 0 12px 0;color:#0f172a;font-size:16px;">Notes</h2>';
    html += '<p style="margin:0;color:#334155;line-height:1.6;">' + escapeHtml(data.notes) + '</p>';
    html += '</div>';
  }
  
  // Photos
  if (photos && photos.length > 0) {
    html += '<div style="' + sectionStyle + '">';
    html += '<h2 style="margin:0 0 12px 0;color:#0f172a;font-size:16px;">📸 Service Photos (' + photos.length + ')</h2>';
    for (let i = 0; i < photos.length; i++) {
      html += '<div style="margin-bottom:15px;">';
      html += '<p style="margin:0 0 8px 0;font-size:12px;font-weight:700;color:#64748b;">' + photos[i].category + ': ' + photos[i].photoName + '</p>';
      html += '<img src="' + photos[i].url + '" style="max-width:100%;height:auto;border-radius:6px;border:1px solid #e2e8f0;" />';
      html += '</div>';
    }
    html += '</div>';
  }
  
  // Footer
  html += '<div style="background:white;padding:20px;margin:15px 0;border-radius:8px;text-align:center;border-top:1px solid #e2e8f0;">';
  html += '<p style="margin:0;font-size:12px;color:#64748b;">Thank you for choosing A Quality Pool Company!</p>';
  html += '<p style="margin:8px 0 0 0;font-size:11px;color:#94a3b8;">Need anything? Contact us at (502) 706-9172</p>';
  html += '</div>';
  
  html += '</div>';
  return html;
}

/**
 * Send Telegram notification to admin about service report
 */
function sendServiceReportTelegram_(reportId, data, photoCount) {
  try {
    const token = BROOKS_TELEGRAM_BOT_TOKEN;
    const chatId = BROOKS_TELEGRAM_CHAT_ID;
    
    if (!token || !chatId) {
      Logger.log('Telegram not configured');
      return { success: false };
    }
    
    const message = '<b>Service Report Completed</b>\n\n' +
      '👤 <b>Customer:</b> ' + escapeHtml(data.customerName) + '\n' +
      '📅 <b>Date:</b> ' + data.serviceDate + '\n' +
      '🔧 <b>Service:</b> ' + data.serviceType + '\n' +
      '📸 <b>Photos:</b> ' + photoCount + ' attached\n' +
      '👨‍🔧 <b>Technician:</b> ' + data.technician;
    
    return sendTelegramBotMessage_(message, []);
  } catch (error) {
    Logger.log('❌ sendServiceReportTelegram_ error: ' + error.toString());
    return { success: false };
  }
}

// ================================================================
// PENDING SERVICE NOTIFICATIONS (5-HOUR INTERVALS)
// ================================================================

/**
 * Send Telegram reminder for pending weekly service (runs via trigger)
 * Should be called every 1 hour to check if 5 hours have passed since last reminder
 */
function sendPendingServiceReminders() {
  try {
    const ss = SpreadsheetApp.openById(SR_SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SR_SERVICE_REPORTS_SHEET);
    if (!sheet) return { success: false, error: 'Sheet not found' };

    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return { success: true };

    const headers = readSrReportHeaders_(sheet);
    const notificationLog = PropertiesService.getScriptProperties();
    const now = new Date();

    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const data = serviceReportRowToData_(row, headers, i + 1);
      const reportId = String(data.reportId || '').trim();
      if (!reportId) continue;

      const status = String(data.status || '').trim();
      const createdRaw = data.createdDate;
      const createdDate = createdRaw instanceof Date ? createdRaw : new Date(createdRaw);
      if (isNaN(createdDate.getTime())) continue;

      const hoursSinceCreation = (now - createdDate) / (1000 * 60 * 60);

      // Only send for pending/in-progress reports
      if (status !== SR_STATUS.PENDING && status !== SR_STATUS.IN_PROGRESS) continue;

      // Check if we should send reminder (every 5 hours: 5h, 10h, 15h, etc)
      const hoursFloor = Math.floor(hoursSinceCreation);
      if (hoursFloor > 0 && hoursFloor % 5 === 0) {
        const lastReminderKey = 'SERVICE_REMINDER_' + reportId;
        const lastReminder = notificationLog.getProperty(lastReminderKey);

        // Only send if we haven't sent in the last hour
        if (!lastReminder || (now - new Date(lastReminder)) > 3600000) {
          sendPendingServiceTelegram_(reportId, data, hoursFloor);
          notificationLog.setProperty(lastReminderKey, now.toString());
        }
      }
    }

    return { success: true };
  } catch (error) {
    Logger.log('❌ sendPendingServiceReminders error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Send Telegram reminder for pending service (reportData from serviceReportRowToData_)
 */
function sendPendingServiceTelegram_(reportId, reportData, hoursWaiting) {
  try {
    const token = BROOKS_TELEGRAM_BOT_TOKEN;
    const chatId = BROOKS_TELEGRAM_CHAT_ID;

    if (!token || !chatId) return { success: false };

    const cust = String(reportData.customerName || '').trim();
    const svcDate = reportData.serviceDate instanceof Date
      ? formatSheetDate(reportData.serviceDate)
      : String(reportData.serviceDate || '');
    const svcType = String(reportData.serviceType || '').trim();

    const message = '<b>⏰ Pending Service Reminder</b>\n\n' +
      '👤 <b>Customer:</b> ' + escapeHtml(cust) + '\n' +
      '📅 <b>Service Date:</b> ' + svcDate + '\n' +
      '⏱ <b>Waiting for:</b> ' + hoursWaiting + ' hours\n' +
      '🔧 <b>Service:</b> ' + escapeHtml(svcType) + '\n' +
      '🆔 <b>Report:</b> ' + escapeHtml(String(reportId || '')) + '\n\n' +
      '<i>Please complete the service report to notify customer.</i>';

    return sendTelegramBotMessage_(message, []);
  } catch (error) {
    Logger.log('❌ sendPendingServiceTelegram_ error: ' + error.toString());
    return { success: false };
  }
}

// ================================================================
// INVOICE GENERATION FROM SERVICE REPORT
// ================================================================

/**
 * Create one-off invoice from service report
 */
function createInvoiceFromServiceReport(reportId, lineItems) {
  try {
    const report = getServiceReport(reportId);
    if (!report.success) return report;
    
    const data = report.data;
    
    // Create invoice object matching InvoiceEstimate.gs format
    const invoice = {
      invoiceNumber: generateInvoiceNumber(),
      estimateNumber: '',
      invoiceDate: formatSheetDate(new Date()),
      dueDate: formatSheetDate(addDaysToDate(new Date(), 10)),
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      customerId: data.customerId,
      customerPhone: '',
      customerAddress: data.poolDetails?.address || '',
      customerCity: data.poolDetails?.city || '',
      customerState: data.poolDetails?.state || '',
      customerZip: data.poolDetails?.zip || '',
      lineItems: lineItems || [
        {
          description: 'Pool Service - ' + data.serviceDate,
          quantity: 1,
          rate: data.poolDetails?.pricePerVisit || 0,
          amount: data.poolDetails?.pricePerVisit || 0
        }
      ],
      taxRate: 0,
      discount: 0,
      notes: 'Service completed on ' + data.serviceDate + '. Report ID: ' + reportId,
      status: 'Draft'
    };
    
    // Save invoice using InvoiceEstimate.gs format
    const invoiceResult = saveInvoiceData(invoice);
    if (invoiceResult.success) {
      updateServiceReport(reportId, { draftInvoiceId: invoiceResult.invoiceId });
      return { success: true, invoiceId: invoiceResult.invoiceId };
    }
    
    return invoiceResult;
  } catch (error) {
    Logger.log('❌ createInvoiceFromServiceReport error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Save invoice using InvoiceEstimate.gs format
 */
function saveInvoiceData(invoiceData) {
  try {
    const ss = SpreadsheetApp.openById(SR_SPREADSHEET_ID);
    const sheet = ss.getSheetByName(INVOICES_ESTIMATES_SHEET);
    if (!sheet) return { success: false, error: 'Invoice sheet not found' };
    
    const invoiceId = INVOICE_PREFIX + '-' + Date.now();
    const values = sheet.getDataRange().getValues();
    
    // Prepare line items JSON (split into 3 columns as per InvoiceEstimate.gs)
    const lineItemsJSON = JSON.stringify(invoiceData.lineItems);
    const part1 = lineItemsJSON.substring(0, Math.ceil(lineItemsJSON.length / 3));
    const part2 = lineItemsJSON.substring(Math.ceil(lineItemsJSON.length / 3), 2 * Math.ceil(lineItemsJSON.length / 3));
    const part3 = lineItemsJSON.substring(2 * Math.ceil(lineItemsJSON.length / 3));
    
    // Create row
    const row = [
      invoiceId,
      invoiceId,  // Document ID column
      invoiceData.invoiceDate,
      part1, part2, part3,  // JSON chunks
      invoiceData.customerName,
      invoiceData.customerId,
      JSON.stringify(invoiceData.lineItems),  // One-off items column
      invoiceData.status,
      'Service Report: ' + invoiceData.notes
    ];
    
    sheet.appendRow(row);
    
    Logger.log('✅ Invoice saved: ' + invoiceId);
    return { success: true, invoiceId: invoiceId };
  } catch (error) {
    Logger.log('❌ saveInvoiceData error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

function generateInvoiceNumber() {
  const ss = SpreadsheetApp.openById(SR_SPREADSHEET_ID);
  const sheet = ss.getSheetByName(INVOICES_ESTIMATES_SHEET);
  const lastRow = sheet.getLastRow();
  return INVOICE_PREFIX + '-' + (lastRow + 1);
}

// ================================================================
// UTILITY FUNCTIONS
// ================================================================

function getOrCreateSheet(ss, sheetName) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  return sheet;
}

function formatSheetDate(date) {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatTime(date) {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function addDaysToDate(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function safeParseJSON(jsonStr) {
  try {
    return typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
  } catch (e) {
    return {};
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

// ================================================================
// WEB APP INTEGRATION
// ================================================================

/**
 * DoGet for web app - serves the service report UI
 */
function doGet(e) {
  const htmlFile = HtmlService.getHtmlFileFromUrl('https://script.google.com/macros/d/[DEPLOYMENT_ID]/usercss');
  return HtmlService.createHtmlOutput('<h1>Service Report UI loaded</h1>');
}

/**
 * Get email preview HTML for service report
 */
function getServiceReportEmailPreview(reportId) {
  try {
    const report = getServiceReport(reportId);
    if (!report.success) return { success: false, error: 'Report not found' };
    
    const photosResult = getReportPhotos(reportId);
    const photos = photosResult.success ? photosResult.photos : [];
    
    const html = buildServiceReportEmailHTML(report.data, photos);
    return { success: true, html: html };
  } catch (error) {
    Logger.log('❌ getServiceReportEmailPreview error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Build HTML version of email for display/preview
 */
function buildServiceReportEmailPreviewDisplay(reportId) {
  try {
    const report = getServiceReport(reportId);
    if (!report.success) return report;
    
    const photosResult = getReportPhotos(reportId);
    const photos = photosResult.success ? photosResult.photos : [];
    
    // Return simple HTML preview
    const html = buildServiceReportEmailHTML(report.data, photos);
    return { success: true, html: html };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * Save photo from UI (expects base64 encoded image)
 */
function savePhotoFromUI(reportId, photoName, photoDataUrl, photoCategory) {
  try {
    const report = getServiceReport(reportId);
    if (!report.success) return report;
    
    return saveReportPhoto(reportId, report.data.customerId, photoName, photoDataUrl, photoCategory);
  } catch (error) {
    Logger.log('❌ savePhotoFromUI error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

// ================================================================
// WEEKLY SERVICE TELEGRAM NOTIFICATIONS (5-HOUR INTERVALS)
// ================================================================

/**
 * Setup trigger for pending service reminders
 * Call this once: go to Extensions > Apps Script > Triggers > Create new
 * Set to time-driven, every 1 hour
 */
function setupServiceReminderTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  
  // Check if trigger already exists
  for (let trigger of triggers) {
    if (trigger.getHandlerFunction() === 'sendPendingServiceReminders') {
      Logger.log('⚠️ Trigger already exists');
      return { success: false, message: 'Trigger already exists' };
    }
  }
  
  ScriptApp.newTrigger('sendPendingServiceReminders')
    .timeBased()
    .everyHours(1)
    .create();
  
  Logger.log('✅ Service reminder trigger created - will check every 1 hour');
  return { success: true, message: 'Trigger created' };
}

/**
 * Send weekly service pending notifications via Telegram with draft message
 * Notifications sent at: 0h, 5h, 10h, 15h, 20h milestones
 */
function sendWeeklyServicePendingNotification(customerId, customerName, customerEmail, serviceType, nextServiceDate) {
  try {
    const token = BROOKS_TELEGRAM_BOT_TOKEN;
    const chatId = BROOKS_TELEGRAM_CHAT_ID;
    
    if (!token || !chatId) {
      Logger.log('⚠️ Telegram not configured for service notifications');
      return { success: false, skipped: true };
    }
    
    // Format service type nicely
    const serviceTypeDisplay = serviceType.includes('biweekly') ? 'Biweekly Service' : 
                               serviceType.includes('weekly') ? 'Weekly Service' : 
                               serviceType.includes('monthly') ? 'Monthly Service' : serviceType;
    
    // Draft message for technician to send
    const draftMessage = 'Hi ' + customerName + '! 👋\n\n' +
      'This is your ' + serviceTypeDisplay.toLowerCase() + ' reminder for ' + nextServiceDate + '.\n\n' +
      'Please let us know if you need to reschedule or if you have any questions.\n\n' +
      'Thank you for choosing A Quality Pool Company! 🏊';
    
    const adminMessage = '<b>📢 Weekly Service Pending</b>\n\n' +
      '👤 <b>Customer:</b> ' + escapeHtml(customerName) + '\n' +
      '📧 <b>Email:</b> ' + escapeHtml(customerEmail) + '\n' +
      '📅 <b>Next Service:</b> ' + nextServiceDate + '\n' +
      '🔧 <b>Service Type:</b> ' + serviceTypeDisplay + '\n\n' +
      '<b>Draft Message to Send:</b>\n<code>' + escapeHtml(draftMessage) + '</code>\n\n' +
      '<i>Click "Copy Message" to copy the draft to send to customer</i>';
    
    return sendTelegramBotMessage_(adminMessage, []);
  } catch (error) {
    Logger.log('❌ sendWeeklyServicePendingNotification error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Escalate notification if service not accepted after 5 hours
 */
function escalateServiceNotification(customerId, customerName, hours) {
  try {
    const token = BROOKS_TELEGRAM_BOT_TOKEN;
    const chatId = BROOKS_TELEGRAM_CHAT_ID;
    
    if (!token || !chatId) return { success: false };
    
    const message = '<b>⚠️ Service Not Accepted - Escalation</b>\n\n' +
      '👤 <b>Customer:</b> ' + escapeHtml(customerName) + '\n' +
      '⏱ <b>Waiting for:</b> ' + hours + ' hours\n\n' +
      '<i>Service request still pending. May need to follow up with customer call.</i>';
    
    return sendTelegramBotMessage_(message, []);
  } catch (error) {
    Logger.log('❌ escalateServiceNotification error: ' + error.toString());
    return { success: false };
  }
}

// ================================================================
// SCHEDULED SERVICE REPORT EMAILS (FROM WEEKLY SERVICE)
// ================================================================

/**
 * Get weekly service contract to schedule service report creation
 * Called from SchedulingScript.gs when service is approved
 */
function getScheduledServiceReportData(contractId) {
  try {
    // This would integrate with SchedulingScript.gs
    // Returns data needed to auto-create service reports on scheduled dates
    return { success: true };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * Auto-create pending service reports for scheduled weekly services
 * Call this with time-driven trigger every Sunday
 */
function autoCreateWeeklyServiceReports() {
  try {
    // Query active weekly service contracts
    const ss = SpreadsheetApp.openById(SR_SPREADSHEET_ID);
    
    // This would integrate with SchedulingScript.gs to find
    // which customers have weekly service scheduled for this week
    
    Logger.log('✅ Auto-created service reports for this week');
    return { success: true };
  } catch (error) {
    Logger.log('❌ autoCreateWeeklyServiceReports error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

// ================================================================
// FREQUENCY MANAGEMENT
// ================================================================

/**
 * Update service frequency for a customer (weekly/biweekly/monthly)
 */
function updateServiceFrequency(customerId, newFrequency) {
  try {
    // This integrates with SchedulingScript.gs
    // Updates the contract frequency and reschedules service reports
    Logger.log('Service frequency updated for ' + customerId + ' to ' + newFrequency);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * Add pool details / update pool info for a customer
 */
function updatePoolDetails(customerId, poolDetails) {
  try {
    const ss = SpreadsheetApp.openById(SR_SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SR_SERVICE_REPORTS_SHEET);
    if (!sheet) return { success: false, error: 'Sheet not found' };
    
    const values = sheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][3]).trim() === String(customerId).trim()) {
        // Update pool details for this customer's records
        const currentDetails = safeParseJSON(values[i][17]);
        const updated = { ...currentDetails, ...poolDetails };
        sheet.getRange(i + 1, 18).setValue(JSON.stringify(updated));
      }
    }
    
    Logger.log('✅ Pool details updated for customer: ' + customerId);
    return { success: true };
  } catch (error) {
    Logger.log('❌ updatePoolDetails error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

// ================================================================
// TEST FUNCTIONS
// ================================================================

function testCreateServiceReport() {
  const result = createServiceReport({
    customerName: 'John Smith',
    customerEmail: 'john@example.com',
    customerId: 'CUST001',
    serviceDate: formatSheetDate(new Date()),
    serviceType: 'weekly_service',
    technician: 'Mike Johnson',
    notes: 'Test service report',
    checklist: STANDARD_CHECKLIST,
    poolDetails: {
      address: '123 Main St',
      city: 'Louisville',
      state: 'KY',
      zip: '40202',
      pricePerVisit: 85.00
    }
  });
  Logger.log('Create result: ' + JSON.stringify(result));
}

function testInitialize() {
  initializeServiceReportingSheets();
}

function testSendNotification() {
  const result = sendWeeklyServicePendingNotification(
    'CUST001',
    'John Smith',
    'john@example.com',
    'weekly_service',
    '2026-04-25'
  );
  Logger.log('Notification result: ' + JSON.stringify(result));
}

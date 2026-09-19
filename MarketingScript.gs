// ===========================================================================
// MARKETING & ROUTE APP — Google Apps Script
// A Quality Pool Company
//
// SETUP:
//   1. In Google Apps Script (script.google.com), create a new file and paste this code.
//   2. Also create "MarketingApp.html" in the same project.
//   3. Set SPREADSHEET_ID and SCHEDULING_SCRIPT_URL below.
//   4. Deploy as Web App → Execute as: Me | Who has access: Anyone
//   5. Run initializeMarketingSheets() once to create required sheets.
// ===========================================================================

// ---- CONFIG ----
const MARKETING_SPREADSHEET_ID  = '1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0'; // Same spreadsheet as scheduling
const CAMPAIGNS_SHEET            = 'MarketingCampaigns';
const VISITS_SHEET               = 'MarketingVisits';
const LOCATIONS_SHEET            = 'MarketingLocations';
const PM_PROJECTS_SHEET          = 'PM_Projects';
const PROJECT_UPDATES_SHEET      = 'ProjectUpdateMessages';
const SCHEDULING_SCRIPT_URL      = 'https://script.google.com/macros/s/AKfycbzXn2xrGyuuIQFGjk_vn5O80_kAEg28tMHZJtdpAoagtnqLx3vQ0t-kuEJa2YEXcTP5WA/exec';
const SMS_EMAIL_RECIPIENT        = 'brookspumpingpoolco@gmail.com';
const MARKETING_COMPANY_EMAIL    = 'samr@aqualitypoolcompanyusa.com';
const DRIVE_CUSTOMER_FOLDER_ID   = '1caFBUhSzE5WNAm9vCT4dwDQuAO0iuo1h';
const MARKETING_LOGO_URL         = 'https://cdn.prod.website-files.com/6931dc4e8e97334e195432df/6993ce0abcd54d3520799318_IMG_1763.jpg';

// Telegram (optional): Script Properties MARKETING_TELEGRAM_BOT_TOKEN, MARKETING_TELEGRAM_CHAT_ID

// Pre-written SMS template (edit as needed)
const SMS_TEMPLATE = "Hi {NAME}, this is Sam from A Quality Pool Company! We were in your neighborhood today and wanted to reach out. We'd love to give you a free pool service quote. Give us a call at (502) 706-9172 or visit aqualitypoolcompanyusa.com — we'd love to earn your business!";
const PROJECT_UPDATE_TEMPLATE = "Hi {NAME}, quick update from A Quality Pool Company — Project {PROJECT_ID} is currently {STATUS}. Remaining balance: ${BALANCE}. {LINK}";

// ===========================================================================
// WEB APP ENTRY — supports both GAS-served HTML and Netlify-hosted HTML via HTTP
// ===========================================================================
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;

  // API call from Netlify-hosted app
  if (action) {
    return handleAPIRequest(action, e.parameter);
  }

  // No action — return a simple status page (HTML is hosted on Netlify, not here)
  return ContentService.createTextOutput(JSON.stringify({
    status: 'ok',
    message: 'Marketing App API is running. The UI is hosted on Netlify.',
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    delete body.action;
    const result = handleAPIRequest(action, body);
    // result is already a ContentService output — return it
    return result;
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function handleAPIRequest(action, params) {
  let result;
  try {
    switch (action) {
      case 'getCampaignList':
        result = getCampaignList();
        break;
      case 'getCampaignDetail':
        result = getCampaignDetail(params.campaignId);
        break;
      case 'createCampaign':
        result = createCampaign({
          name:           params.name,
          date:           params.date,
          assignedTo:     params.assignedTo,
          commissionRate: parseFloat(params.commissionRate) || 25,
          notes:          params.notes || ''
        });
        break;
      case 'updateCampaign':
        result = updateCampaign(params.campaignId, params);
        break;
      case 'importLandGlideCSV':
        result = importLandGlideCSV(params.campaignId, params.csvText, params.filterResidential === true || params.filterResidential === 'true');
        break;
      case 'importMarketingCSV':
        result = importMarketingCSV(params.campaignId, params.csvText, params.columnMap);
        break;
      case 'notifyMarketingSessionEnd':
        result = notifyMarketingSessionEnd(params.staffName, params.staffEmail, params.campaignId, params.campaignName, params.reason);
        break;
      case 'addMarketingProspect':
        result = addMarketingProspect(params);
        break;
      case 'updateVisit':
        result = updateVisit(params.visitId, {
          status:        params.status,
          phone:         params.phone,
          comment:       params.comment,
          streetViewUrl: params.streetViewUrl
        });
        break;
      case 'saveHouseReport':
        result = saveHouseReport(params);
        break;
      case 'getPhoneBankData':
        result = getPhoneBankData(params.campaignId || '');
        break;
      case 'createBulkTextCampaign':
        result = createBulkTextCampaign(params);
        break;
      case 'markLeadOutcome':
        result = markLeadOutcome(params.visitId, params.outcome, params.note || '');
        break;
      case 'getProjectUpdateTargets':
        result = getProjectUpdateTargets(params);
        break;
      case 'createProjectUpdateBatch':
        result = createProjectUpdateBatch(params);
        break;
      case 'getProjectUpdateLogs':
        result = getProjectUpdateLogs(parseInt(params.limit || 100, 10));
        break;
      case 'markProjectUpdateResponse':
        result = markProjectUpdateResponse(params.messageId, params.responseStatus, params.responseNote || '');
        break;
      case 'updateLocation':
        result = updateLocation(params.staffName, params.staffEmail, params.campaignId, parseFloat(params.lat), parseFloat(params.lng), parseFloat(params.accuracy) || 0);
        break;
      case 'getActiveLocations':
        result = getActiveLocations(params.campaignId || '');
        break;
      case 'sendSMSEmail':
        result = sendSMSEmail(params.visitId);
        break;
      case 'scheduleServiceFromVisit':
        result = scheduleServiceFromVisit(params.visitId, {
          email:        params.email,
          serviceType:  params.serviceType,
          preferredDay: params.preferredDay,
          frequency:    params.frequency || ''
        });
        break;
      case 'getCommissionReport':
        result = getCommissionReport(params.assignedTo || '', params.campaignId || '');
        break;
      default:
        result = { success: false, error: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { success: false, error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===========================================================================
// SHEET INITIALIZATION
// ===========================================================================
function initializeMarketingSheets() {
  const ss = SpreadsheetApp.openById(MARKETING_SPREADSHEET_ID);

  // MarketingCampaigns
  let campaignsSheet = ss.getSheetByName(CAMPAIGNS_SHEET);
  if (!campaignsSheet) {
    campaignsSheet = ss.insertSheet(CAMPAIGNS_SHEET);
    const headers = ['CampaignID','Name','Date','AssignedTo','Status','CommissionRate','TotalProperties','VisitedCount','InterestedCount','LeadsConverted','JobsWon','Notes','CreatedAt','UpdatedAt'];
    campaignsSheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    campaignsSheet.setFrozenRows(1);
    Logger.log('✅ MarketingCampaigns sheet created');
  }

  // MarketingVisits
  let visitsSheet = ss.getSheetByName(VISITS_SHEET);
  if (!visitsSheet) {
    visitsSheet = ss.insertSheet(VISITS_SHEET);
    const headers = ['VisitID','CampaignID','OwnerName','Address','City','State','ZIP','Lat','Lng','StreetViewUrl','Phone','VisitStatus','Comment','ScheduledServiceId','LeadConverted','LeadOutcome','VisitTimestamp','RouteOrder','CreatedAt'];
    visitsSheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    visitsSheet.setFrozenRows(1);
    Logger.log('✅ MarketingVisits sheet created');
  }

  // MarketingLocations
  let locSheet = ss.getSheetByName(LOCATIONS_SHEET);
  if (!locSheet) {
    locSheet = ss.insertSheet(LOCATIONS_SHEET);
    const headers = ['StaffName','StaffEmail','CampaignID','Lat','Lng','Accuracy','Timestamp'];
    locSheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    locSheet.setFrozenRows(1);
    Logger.log('✅ MarketingLocations sheet created');
  }

  // ProjectUpdateMessages
  let updatesSheet = ss.getSheetByName(PROJECT_UPDATES_SHEET);
  if (!updatesSheet) {
    updatesSheet = ss.insertSheet(PROJECT_UPDATES_SHEET);
    const headers = ['MessageID','SentAt','SourceType','SourceID','ProjectID','CampaignID','CustomerName','CustomerPhone','CustomerEmail','MessageText','TelegramSent','ResponseStatus','ResponseNote','UpdatedAt'];
    updatesSheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    updatesSheet.setFrozenRows(1);
    Logger.log('✅ ProjectUpdateMessages sheet created');
  }

  Logger.log('✅ Marketing sheets initialized.');
  return { success: true };
}

// ===========================================================================
// HELPERS
// ===========================================================================
function getMarketingSheet(name) {
  return SpreadsheetApp.openById(MARKETING_SPREADSHEET_ID).getSheetByName(name);
}

function sheetToObjects(sheet, headers) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const h = headers || data[0];
  return data.slice(1).map(row => {
    const obj = {};
    h.forEach((key, i) => { obj[key] = row[i] !== undefined ? row[i] : ''; });
    return obj;
  });
}

function generateId(prefix) {
  return (prefix || 'ID') + '-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
}

// ===========================================================================
// CAMPAIGNS — CRUD
// ===========================================================================

/** Create a new marketing campaign. */
function createCampaign(data) {
  if (!data || !data.name) return { success: false, error: 'Campaign name is required' };
  try {
    initializeMarketingSheets();
    const sheet = getMarketingSheet(CAMPAIGNS_SHEET);
    const now   = new Date().toISOString();
    const id    = generateId('CAM');
    sheet.appendRow([
      id,
      data.name,
      data.date || new Date().toLocaleDateString('en-US'),
      data.assignedTo || '',
      'Active',
      parseFloat(data.commissionRate || 0),
      0, 0, 0, 0, 0,
      data.notes || '',
      now, now
    ]);
    SpreadsheetApp.flush();
    return { success: true, campaignId: id, message: 'Campaign created: ' + data.name };
  } catch (e) {
    Logger.log('createCampaign error: ' + e);
    return { success: false, error: e.toString() };
  }
}

/** Get all campaigns with summary stats. */
function getCampaignList() {
  try {
    initializeMarketingSheets();
    const sheet = getMarketingSheet(CAMPAIGNS_SHEET);
    if (!sheet) return { success: true, campaigns: [] };
    const campaigns = sheetToObjects(sheet);

    // Add computed count of captured phone numbers per campaign.
    const visitsSheet = getMarketingSheet(VISITS_SHEET);
    const visits = visitsSheet ? sheetToObjects(visitsSheet) : [];
    const phoneCountByCampaign = {};
    visits.forEach(function(v) {
      const cid = String(v.CampaignID || '');
      if (!cid) return;
      const hasPhone = String(v.Phone || '').trim() !== '';
      if (!hasPhone) return;
      phoneCountByCampaign[cid] = (phoneCountByCampaign[cid] || 0) + 1;
    });

    const enriched = campaigns.map(function(c) {
      const cid = String(c.CampaignID || '');
      return Object.assign({}, c, {
        PhoneCount: phoneCountByCampaign[cid] || 0
      });
    });

    return { success: true, campaigns: enriched.reverse() }; // newest first
  } catch (e) {
    return { success: false, error: e.toString(), campaigns: [] };
  }
}

/** Update campaign status or notes. */
function updateCampaign(campaignId, updates) {
  try {
    const sheet = getMarketingSheet(CAMPAIGNS_SHEET);
    if (!sheet) return { success: false, error: 'Sheet not found' };
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const colId = headers.indexOf('CampaignID');
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][colId]) !== String(campaignId)) continue;
      Object.keys(updates).forEach(key => {
        const col = headers.indexOf(key);
        if (col >= 0) sheet.getRange(i + 1, col + 1).setValue(updates[key]);
      });
      sheet.getRange(i + 1, headers.indexOf('UpdatedAt') + 1).setValue(new Date().toISOString());
      SpreadsheetApp.flush();
      return { success: true };
    }
    return { success: false, error: 'Campaign not found' };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/** Get all visits for a campaign. */
function getCampaignDetail(campaignId) {
  try {
    initializeMarketingSheets();
    const sheet = getMarketingSheet(VISITS_SHEET);
    if (!sheet) return { success: true, visits: [] };
    const all = sheetToObjects(sheet);
    const visits = all.filter(v => String(v.CampaignID) === String(campaignId));
    // Also get campaign info
    const cSheet = getMarketingSheet(CAMPAIGNS_SHEET);
    const allCamp = sheetToObjects(cSheet);
    const campaign = allCamp.find(c => String(c.CampaignID) === String(campaignId)) || null;
    return { success: true, campaign: campaign, visits: visits };
  } catch (e) {
    return { success: false, error: e.toString(), visits: [] };
  }
}

// ===========================================================================
// CSV IMPORT — LandGlide Format
// ===========================================================================

/**
 * Parse a LandGlide CSV and import properties into a campaign.
 * Filters to Residential land use by default.
 * Expected columns: Owner, Address, Municipality, County, State, "ZIP Code",
 *   Latitude, Longitude, "Land Use Class", "Mailing Name", "Mailing Address 1"
 */
function importLandGlideCSV(campaignId, csvText, filterResidential) {
  if (!campaignId || !csvText) return { success: false, error: 'Campaign ID and CSV text are required' };
  try {
    initializeMarketingSheets();
    const lines  = csvText.split('\n').filter(l => l.trim());
    if (lines.length < 2) return { success: false, error: 'CSV appears empty' };

    // Parse header row (handle quoted fields)
    const rawHeaders = parseCSVLine(lines[0]);
    const h = rawHeaders.map(s => s.replace(/^"|"$/g,'').trim());

    const idxOwner    = h.indexOf('Owner');
    const idxAddress  = h.indexOf('Address');
    const idxMuni     = h.indexOf('Municipality');
    const idxState    = h.indexOf('State');
    const idxZip      = h.findIndex(x => x.toLowerCase().includes('zip'));
    const idxLat      = h.indexOf('Latitude');
    const idxLng      = h.indexOf('Longitude');
    const idxLandUse  = h.findIndex(x => x.toLowerCase().includes('land use class'));
    const idxMailName = h.findIndex(x => x.toLowerCase().includes('mailing name'));

    const sheet  = getMarketingSheet(VISITS_SHEET);
    const now    = new Date().toISOString();
    let imported = 0;
    let skipped  = 0;

    for (let i = 1; i < lines.length; i++) {
      const row = parseCSVLine(lines[i]).map(s => s.replace(/^"|"$/g,'').trim());
      if (!row.length || !row[idxAddress]) { skipped++; continue; }

      const landUse = idxLandUse >= 0 ? row[idxLandUse] : '';
      if (filterResidential !== false && landUse && !landUse.toLowerCase().includes('residential')) {
        skipped++;
        continue;
      }

      const visitId = generateId('VIS');
      sheet.appendRow([
        visitId,
        campaignId,
        idxOwner    >= 0 ? row[idxOwner]    : '',
        idxAddress  >= 0 ? row[idxAddress]  : '',
        idxMuni     >= 0 ? row[idxMuni]     : '',
        idxState    >= 0 ? row[idxState]    : '',
        idxZip      >= 0 ? row[idxZip]      : '',
        idxLat      >= 0 ? parseFloat(row[idxLat])  || '' : '',
        idxLng      >= 0 ? parseFloat(row[idxLng])  || '' : '',
        '', // StreetViewUrl — set in field app or manually
        '', // Phone (blank — to be filled in manually)
        'Not Visited',
        '', '', // Comment, ScheduledServiceId
        'No', '', // LeadConverted, LeadOutcome
        '', // VisitTimestamp
        i,  // RouteOrder (original CSV order)
        now
      ]);
      imported++;
    }

    SpreadsheetApp.flush();

    // Update campaign property count
    updateCampaignStats(campaignId);

    Logger.log('✅ importLandGlideCSV: ' + imported + ' imported, ' + skipped + ' skipped for campaign ' + campaignId);
    return { success: true, imported: imported, skipped: skipped, message: imported + ' properties imported.' };
  } catch (e) {
    Logger.log('importLandGlideCSV error: ' + e);
    return { success: false, error: e.toString() };
  }
}

/** Parse a single CSV line handling quoted fields with commas. */
function parseCSVLine(line) {
  const result = [];
  let current  = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/**
 * Import arbitrary CSV using a header map: keys are MarketingVisits column names;
 * values are the CSV column header strings (must match first row after trim/quote strip).
 * Example: { "OwnerName": "Owner", "Address": "Property Address", "City": "City", ... }
 */
function importMarketingCSV(campaignId, csvText, columnMap) {
  if (!campaignId || !csvText) return { success: false, error: 'Campaign ID and CSV text are required' };
  let map = columnMap;
  if (typeof map === 'string') {
    try { map = JSON.parse(map); } catch (e) { return { success: false, error: 'Invalid columnMap JSON' }; }
  }
  if (!map || typeof map !== 'object') return { success: false, error: 'columnMap object is required' };

  try {
    initializeMarketingSheets();
    const lines = csvText.split('\n').filter(l => l.trim());
    if (lines.length < 2) return { success: false, error: 'CSV appears empty' };

    const rawHeaders = parseCSVLine(lines[0]).map(s => s.replace(/^"|"$/g, '').trim());
    const colIndex = {};
    Object.keys(map).forEach(function(field) {
      const headerName = String(map[field] || '').trim();
      if (!headerName) return;
      const idx = rawHeaders.indexOf(headerName);
      if (idx < 0) {
        throw new Error('CSV header not found for ' + field + ': "' + headerName + '"');
      }
      colIndex[field] = idx;
    });

    const addrIdx = colIndex.Address !== undefined ? colIndex.Address : -1;
    const latIdx = colIndex.Lat !== undefined ? colIndex.Lat : -1;
    const lngIdx = colIndex.Lng !== undefined ? colIndex.Lng : -1;
    if (addrIdx < 0 && (latIdx < 0 || lngIdx < 0)) {
      return { success: false, error: 'Map at least Address, or both Lat and Lng' };
    }

    const sheet = getMarketingSheet(VISITS_SHEET);
    const now = new Date().toISOString();
    let imported = 0;
    let skipped = 0;

    function cell(row, field) {
      if (colIndex[field] === undefined) return '';
      const v = row[colIndex[field]];
      return v !== undefined && v !== null ? String(v).replace(/^"|"$/g, '').trim() : '';
    }

    for (let i = 1; i < lines.length; i++) {
      const row = parseCSVLine(lines[i]).map(s => s.replace(/^"|"$/g, '').trim());
      if (!row.length) { skipped++; continue; }

      const address = cell(row, 'Address');
      const latStr = cell(row, 'Lat');
      const lngStr = cell(row, 'Lng');
      const lat = latStr ? parseFloat(latStr) : NaN;
      const lng = lngStr ? parseFloat(lngStr) : NaN;

      if (!address && (isNaN(lat) || isNaN(lng))) { skipped++; continue; }

      const visitId = generateId('VIS');
      sheet.appendRow([
        visitId,
        campaignId,
        cell(row, 'OwnerName'),
        address,
        cell(row, 'City'),
        cell(row, 'State'),
        cell(row, 'ZIP'),
        !isNaN(lat) ? lat : '',
        !isNaN(lng) ? lng : '',
        cell(row, 'StreetViewUrl'),
        cell(row, 'Phone'),
        'Not Visited',
        '', '',
        'No', '',
        '',
        i,
        now
      ]);
      imported++;
    }

    SpreadsheetApp.flush();
    updateCampaignStats(campaignId);
    Logger.log('importMarketingCSV: ' + imported + ' imported, ' + skipped + ' skipped');
    return { success: true, imported: imported, skipped: skipped, message: imported + ' rows imported.' };
  } catch (e) {
    Logger.log('importMarketingCSV error: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * Optional Telegram ping when field worker closes session or goes idle.
 * Script Properties: MARKETING_TELEGRAM_BOT_TOKEN, MARKETING_TELEGRAM_CHAT_ID
 */
function notifyMarketingSessionEnd(staffName, staffEmail, campaignId, campaignName, reason) {
  try {
    const props = PropertiesService.getScriptProperties();
    const token = props.getProperty('MARKETING_TELEGRAM_BOT_TOKEN');
    const chatId = props.getProperty('MARKETING_TELEGRAM_CHAT_ID');
    if (!token || !chatId) {
      return { success: true, skipped: true, message: 'Telegram not configured' };
    }
    const text = [
      '📴 Marketing session end',
      'Staff: ' + (staffName || '—') + ' <' + (staffEmail || '') + '>',
      'Campaign: ' + (campaignName || '—') + ' [' + (campaignId || '') + ']',
      'Reason: ' + (reason || 'closed')
    ].join('\n');
    const url = 'https://api.telegram.org/bot' + encodeURIComponent(token) + '/sendMessage';
    const resp = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      payload: JSON.stringify({
        chat_id: chatId,
        text: text
      })
    });
    const code = resp.getResponseCode();
    if (code < 200 || code >= 300) {
      Logger.log('notifyMarketingSessionEnd HTTP ' + code + ': ' + resp.getContentText().slice(0, 200));
      return { success: false, error: 'Telegram API error: ' + code };
    }
    return { success: true };
  } catch (e) {
    Logger.log('notifyMarketingSessionEnd error: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * Add a prospect to the main Customers sheet via CustomerInfo.addCustomer (same Apps Script project).
 */
function addMarketingProspect(params) {
  if (!params) return { success: false, error: 'No data' };
  const p = params;
  const actorEmail = p.actorEmail || MARKETING_COMPANY_EMAIL;
  const name = p.name || p.customerName || '';
  const customerEmail = p.email || p.customerEmail || '';
  const phone = p.phone || '';
  const address = p.address || '';
  const city = p.city || '';
  const state = p.state || '';
  const zip = p.zip || p.zipCode || '';
  let notes = p.notes || '';
  if (p.campaignId || p.campaignName) {
    notes = (notes ? notes + '\n' : '') + 'Source: Marketing' +
      (p.campaignName ? ' — ' + p.campaignName : '') +
      (p.campaignId ? ' [' + p.campaignId + ']' : '');
  }
  if (typeof addCustomer !== 'function') {
    return { success: false, error: 'addCustomer is not available. Add CustomerInfo.gs to this Apps Script project.' };
  }
  if (!name && !customerEmail) {
    return { success: false, error: 'Name or email is required' };
  }
  return addCustomer(actorEmail, name, customerEmail, phone, address, city, state, zip, notes, '{}', '{}', JSON.stringify({ source: 'marketing', campaignId: p.campaignId || '' }));
}

// ===========================================================================
// VISITS — Field Check-Off
// ===========================================================================

/** Update a visit's status, comment, and/or phone. */
function updateVisit(visitId, updates) {
  if (!visitId) return { success: false, error: 'Visit ID required' };
  try {
    const sheet = getMarketingSheet(VISITS_SHEET);
    const data  = sheet.getDataRange().getValues();
    const h     = data[0];
    const colId = h.indexOf('VisitID');
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][colId]) !== String(visitId)) continue;
      if (updates.status  !== undefined) sheet.getRange(i+1, h.indexOf('VisitStatus')+1).setValue(updates.status);
      if (updates.comment !== undefined) sheet.getRange(i+1, h.indexOf('Comment')+1).setValue(updates.comment);
      if (updates.phone   !== undefined) sheet.getRange(i+1, h.indexOf('Phone')+1).setValue(updates.phone);
      const colSv = h.indexOf('StreetViewUrl');
      if (colSv >= 0 && updates.streetViewUrl !== undefined) {
        sheet.getRange(i+1, colSv+1).setValue(updates.streetViewUrl);
      }
      if (updates.status) {
        sheet.getRange(i+1, h.indexOf('VisitTimestamp')+1).setValue(new Date().toISOString());
      }
      SpreadsheetApp.flush();
      updateCampaignStats(String(data[i][h.indexOf('CampaignID')]));
      return { success: true };
    }
    return { success: false, error: 'Visit not found' };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * Save a house report with phone findings from mobile/field mode.
 * If visitId exists, updates that row; otherwise appends a new row.
 */
function saveHouseReport(data) {
  if (!data) return { success: false, error: 'No payload provided' };
  const campaignId = String(data.campaignId || '').trim();
  if (!campaignId) return { success: false, error: 'campaignId is required' };

  try {
    initializeMarketingSheets();
    const sheet = getMarketingSheet(VISITS_SHEET);
    const rows = sheet.getDataRange().getValues();
    const h = rows[0];

    const visitId = String(data.visitId || '').trim();
    const ownerName = String(data.ownerName || '').trim();
    const address = String(data.address || '').trim();
    const city = String(data.city || '').trim();
    const state = String(data.state || '').trim();
    const zip = String(data.zip || '').trim();
    const phone = String(data.phone || '').trim();
    const status = String(data.status || '').trim() || 'Not Visited';
    const comment = String(data.comment || '').trim();
    const streetViewUrl = String(data.streetViewUrl || '').trim();
    const timestamp = new Date().toISOString();

    let foundRow = -1;
    if (visitId) {
      const colVisitId = h.indexOf('VisitID');
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][colVisitId]) === visitId) {
          foundRow = i + 1;
          break;
        }
      }
    }

    if (foundRow > 0) {
      if (ownerName) sheet.getRange(foundRow, h.indexOf('OwnerName') + 1).setValue(ownerName);
      if (address) sheet.getRange(foundRow, h.indexOf('Address') + 1).setValue(address);
      if (city) sheet.getRange(foundRow, h.indexOf('City') + 1).setValue(city);
      if (state) sheet.getRange(foundRow, h.indexOf('State') + 1).setValue(state);
      if (zip) sheet.getRange(foundRow, h.indexOf('ZIP') + 1).setValue(zip);
      if (phone || data.phone === '') sheet.getRange(foundRow, h.indexOf('Phone') + 1).setValue(phone);
      if (status) sheet.getRange(foundRow, h.indexOf('VisitStatus') + 1).setValue(status);
      if (comment || data.comment === '') sheet.getRange(foundRow, h.indexOf('Comment') + 1).setValue(comment);
      const svCol = h.indexOf('StreetViewUrl');
      if (svCol >= 0 && (streetViewUrl || data.streetViewUrl === '')) {
        sheet.getRange(foundRow, svCol + 1).setValue(streetViewUrl);
      }
      if (status && status !== 'Not Visited') {
        sheet.getRange(foundRow, h.indexOf('VisitTimestamp') + 1).setValue(timestamp);
      }
      SpreadsheetApp.flush();
      updateCampaignStats(campaignId);
      return { success: true, created: false, visitId: visitId };
    }

    const allCampaignRows = rows.slice(1).filter(r => String(r[h.indexOf('CampaignID')]) === campaignId);
    const maxOrder = allCampaignRows.reduce(function(max, r) {
      const val = parseInt(r[h.indexOf('RouteOrder')] || 0, 10);
      return isNaN(val) ? max : Math.max(max, val);
    }, 0);

    const newVisitId = generateId('VIS');
    sheet.appendRow([
      newVisitId,
      campaignId,
      ownerName,
      address,
      city,
      state,
      zip,
      '',
      '',
      streetViewUrl,
      phone,
      status,
      comment,
      '',
      'No',
      '',
      status !== 'Not Visited' ? timestamp : '',
      maxOrder + 1,
      timestamp
    ]);

    SpreadsheetApp.flush();
    updateCampaignStats(campaignId);
    return { success: true, created: true, visitId: newVisitId };
  } catch (e) {
    Logger.log('saveHouseReport error: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * Return visit rows for a campaign to support quick phone-bank workflows.
 */
function getPhoneBankData(campaignId) {
  try {
    initializeMarketingSheets();
    const cSheet = getMarketingSheet(CAMPAIGNS_SHEET);
    const vSheet = getMarketingSheet(VISITS_SHEET);
    const campaigns = sheetToObjects(cSheet);
    const visitsAll = sheetToObjects(vSheet);

    const filtered = campaignId
      ? visitsAll.filter(function(v) { return String(v.CampaignID) === String(campaignId); })
      : visitsAll;

    filtered.sort(function(a, b) {
      const at = new Date(a.VisitTimestamp || a.CreatedAt || 0).getTime();
      const bt = new Date(b.VisitTimestamp || b.CreatedAt || 0).getTime();
      return bt - at;
    });

    const withPhone = filtered.filter(function(v) { return String(v.Phone || '').trim() !== ''; }).length;
    const interested = filtered.filter(function(v) { return String(v.VisitStatus || '') === 'Interested'; }).length;

    const campaign = campaignId
      ? (campaigns.find(function(c) { return String(c.CampaignID) === String(campaignId); }) || null)
      : null;

    return {
      success: true,
      campaign: campaign,
      visits: filtered,
      summary: {
        total: filtered.length,
        withPhone: withPhone,
        interested: interested
      }
    };
  } catch (e) {
    return { success: false, error: e.toString(), visits: [], summary: { total: 0, withPhone: 0, interested: 0 } };
  }
}

/**
 * Build per-recipient SMS deep links for bulk text campaign execution.
 * Template tokens: {NAME} {ADDRESS} {CITY} {STATE} {ZIP}
 */
function createBulkTextCampaign(params) {
  try {
    const campaignId = String((params && params.campaignId) || '').trim();
    if (!campaignId) return { success: false, error: 'campaignId is required' };

    let visitIds = (params && params.visitIds) || [];
    if (typeof visitIds === 'string') {
      try {
        const parsed = JSON.parse(visitIds);
        visitIds = Array.isArray(parsed) ? parsed : String(visitIds).split(',');
      } catch (e) {
        visitIds = String(visitIds).split(',');
      }
    }
    visitIds = (visitIds || []).map(function(v) { return String(v).trim(); }).filter(function(v) { return v; });

    const template = String((params && params.template) || SMS_TEMPLATE).trim() || SMS_TEMPLATE;

    const vSheet = getMarketingSheet(VISITS_SHEET);
    const visits = sheetToObjects(vSheet).filter(function(v) {
      if (String(v.CampaignID) !== campaignId) return false;
      if (visitIds.length && visitIds.indexOf(String(v.VisitID)) < 0) return false;
      return true;
    });

    const recipients = visits
      .map(function(v) {
        const raw = String(v.Phone || '').replace(/\D/g, '');
        if (!raw) return null;
        const e164 = raw.length === 10 ? ('1' + raw) : raw;
        const name = (v.OwnerName || 'there').split(' ')[0] || 'there';
        const msg = template
          .replace(/\{NAME\}/g, name)
          .replace(/\{ADDRESS\}/g, String(v.Address || ''))
          .replace(/\{CITY\}/g, String(v.City || ''))
          .replace(/\{STATE\}/g, String(v.State || ''))
          .replace(/\{ZIP\}/g, String(v.ZIP || ''));
        return {
          visitId: v.VisitID,
          ownerName: v.OwnerName || '',
          address: v.Address || '',
          city: v.City || '',
          state: v.State || '',
          zip: v.ZIP || '',
          phone: v.Phone || '',
          message: msg,
          smsLink: 'sms:+' + e164 + '&body=' + encodeURIComponent(msg)
        };
      })
      .filter(function(r) { return !!r; });

    return {
      success: true,
      campaignId: campaignId,
      recipientCount: recipients.length,
      recipients: recipients
    };
  } catch (e) {
    return { success: false, error: e.toString(), recipients: [] };
  }
}

/** Mark a visit as a lead converted (or job won). */
function markLeadOutcome(visitId, outcome, note) {
  if (!visitId) return { success: false, error: 'Visit ID required' };
  try {
    const sheet = getMarketingSheet(VISITS_SHEET);
    const data  = sheet.getDataRange().getValues();
    const h     = data[0];
    const colId = h.indexOf('VisitID');
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][colId]) !== String(visitId)) continue;
      const isConverted = (outcome === 'lead' || outcome === 'job');
      sheet.getRange(i+1, h.indexOf('LeadConverted')+1).setValue(isConverted ? 'Yes' : 'No');
      sheet.getRange(i+1, h.indexOf('LeadOutcome')+1).setValue(outcome || '');
      if (note) sheet.getRange(i+1, h.indexOf('Comment')+1).setValue(note);
      SpreadsheetApp.flush();
      updateCampaignStats(String(data[i][h.indexOf('CampaignID')]));
      return { success: true };
    }
    return { success: false, error: 'Visit not found' };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ===========================================================================
// PROJECT UPDATES TOOL (PM_Projects + Marketing contacts)
// ===========================================================================

function getProjectUpdateTargets(options) {
  try {
    initializeMarketingSheets();
    const opts = options || {};
    const includeProjects = !(String(opts.includeProjects || 'true') === 'false');
    const includeMarketing = !(String(opts.includeMarketing || 'true') === 'false');
    const onlyActiveProjects = !(String(opts.onlyActiveProjects || 'true') === 'false');
    const marketingCampaignId = String(opts.marketingCampaignId || '').trim();

    const targets = [];
    const seen = {};

    if (includeProjects) {
      const pTargets = getPmProjectTargets_(onlyActiveProjects);
      pTargets.forEach(function(t) {
        const dedupeKey = String(t.phoneNormalized || '') + '|' + String((t.customerName || '').toLowerCase());
        if (!dedupeKey || seen[dedupeKey]) return;
        seen[dedupeKey] = true;
        targets.push(t);
      });
    }

    if (includeMarketing) {
      const vSheet = getMarketingSheet(VISITS_SHEET);
      const visits = vSheet ? sheetToObjects(vSheet) : [];
      visits.forEach(function(v) {
        if (marketingCampaignId && String(v.CampaignID || '') !== marketingCampaignId) return;
        const rawPhone = String(v.Phone || '').trim();
        if (!rawPhone) return;
        const phoneNorm = normalizePhoneDigits_(rawPhone);
        if (!phoneNorm) return;
        const dedupeKey = phoneNorm + '|' + String((v.OwnerName || '').toLowerCase());
        if (seen[dedupeKey]) return;
        seen[dedupeKey] = true;
        targets.push({
          targetId: 'VIS:' + String(v.VisitID || ''),
          sourceType: 'marketing',
          sourceId: String(v.VisitID || ''),
          projectId: '',
          campaignId: String(v.CampaignID || ''),
          customerName: String(v.OwnerName || '').trim(),
          customerPhone: rawPhone,
          customerEmail: '',
          address: [v.Address, v.City, v.State, v.ZIP].filter(Boolean).join(', '),
          status: String(v.VisitStatus || 'Prospect'),
          totalValue: '',
          remainingBalance: '',
          shareLink: '',
          phoneNormalized: phoneNorm
        });
      });
    }

    targets.sort(function(a, b) {
      const an = String(a.customerName || '').toLowerCase();
      const bn = String(b.customerName || '').toLowerCase();
      if (an < bn) return -1;
      if (an > bn) return 1;
      return 0;
    });

    return {
      success: true,
      targets: targets,
      summary: {
        total: targets.length,
        projectTargets: targets.filter(function(t) { return t.sourceType === 'project'; }).length,
        marketingTargets: targets.filter(function(t) { return t.sourceType === 'marketing'; }).length
      }
    };
  } catch (e) {
    return { success: false, error: e.toString(), targets: [], summary: { total: 0, projectTargets: 0, marketingTargets: 0 } };
  }
}

function createProjectUpdateBatch(params) {
  try {
    initializeMarketingSheets();
    const p = params || {};
    let targets = p.targets || [];
    if (typeof targets === 'string') {
      try {
        targets = JSON.parse(targets);
      } catch (e) {
        targets = [];
      }
    }
    if (!Array.isArray(targets) || !targets.length) {
      return { success: false, error: 'No targets selected', recipients: [] };
    }

    const template = String(p.template || PROJECT_UPDATE_TEMPLATE || SMS_TEMPLATE).trim() || PROJECT_UPDATE_TEMPLATE;
    const sendTelegram = String(p.sendTelegram || 'false') === 'true' || p.sendTelegram === true;

    const logSheet = getMarketingSheet(PROJECT_UPDATES_SHEET);
    const nowIso = new Date().toISOString();
    const recipients = [];
    const rowsToAppend = [];

    targets.forEach(function(t) {
      const phoneRaw = String((t && t.customerPhone) || '').trim();
      const phoneNorm = normalizePhoneDigits_(phoneRaw);
      if (!phoneNorm) return;

      const e164 = phoneNorm.length === 10 ? ('1' + phoneNorm) : phoneNorm;
      const firstName = String((t.customerName || 'there').trim().split(' ')[0] || 'there');
      const balance = formatMoney_(t.remainingBalance || t.totalValue || '');
      const msg = String(template)
        .replace(/\{NAME\}/g, firstName)
        .replace(/\{FULL_NAME\}/g, String(t.customerName || ''))
        .replace(/\{PROJECT_ID\}/g, String(t.projectId || ''))
        .replace(/\{STATUS\}/g, String(t.status || 'Active'))
        .replace(/\{BALANCE\}/g, balance)
        .replace(/\{ADDRESS\}/g, String(t.address || ''))
        .replace(/\{LINK\}/g, String(t.shareLink || ''));

      const messageId = generateId('MSG');
      const smsLink = 'sms:+' + e164 + '&body=' + encodeURIComponent(msg);

      recipients.push({
        messageId: messageId,
        targetId: String(t.targetId || ''),
        sourceType: String(t.sourceType || ''),
        sourceId: String(t.sourceId || ''),
        projectId: String(t.projectId || ''),
        campaignId: String(t.campaignId || ''),
        customerName: String(t.customerName || ''),
        customerPhone: phoneRaw,
        customerEmail: String(t.customerEmail || ''),
        status: String(t.status || ''),
        message: msg,
        smsLink: smsLink
      });

      rowsToAppend.push([
        messageId,
        nowIso,
        String(t.sourceType || ''),
        String(t.sourceId || ''),
        String(t.projectId || ''),
        String(t.campaignId || ''),
        String(t.customerName || ''),
        phoneRaw,
        String(t.customerEmail || ''),
        msg,
        sendTelegram ? 'Yes' : 'No',
        'Pending',
        '',
        nowIso
      ]);
    });

    if (!recipients.length) {
      return { success: false, error: 'No valid phone numbers found on selected targets.', recipients: [] };
    }

    if (rowsToAppend.length) {
      logSheet.getRange(logSheet.getLastRow() + 1, 1, rowsToAppend.length, rowsToAppend[0].length).setValues(rowsToAppend);
    }

    let telegramResults = [];
    if (sendTelegram) {
      telegramResults = sendProjectUpdateDraftsToTelegram_(recipients);
    }

    return {
      success: true,
      recipientCount: recipients.length,
      recipients: recipients,
      telegramSent: sendTelegram,
      telegramResults: telegramResults
    };
  } catch (e) {
    return { success: false, error: e.toString(), recipients: [] };
  }
}

function getProjectUpdateLogs(limit) {
  try {
    initializeMarketingSheets();
    const cap = Math.max(1, Math.min(parseInt(limit || 100, 10), 500));
    const sheet = getMarketingSheet(PROJECT_UPDATES_SHEET);
    const rows = sheetToObjects(sheet);
    rows.sort(function(a, b) {
      const at = new Date(a.SentAt || 0).getTime();
      const bt = new Date(b.SentAt || 0).getTime();
      return bt - at;
    });
    return { success: true, logs: rows.slice(0, cap) };
  } catch (e) {
    return { success: false, error: e.toString(), logs: [] };
  }
}

function markProjectUpdateResponse(messageId, responseStatus, responseNote) {
  if (!messageId) return { success: false, error: 'messageId required' };
  try {
    const sheet = getMarketingSheet(PROJECT_UPDATES_SHEET);
    const data = sheet.getDataRange().getValues();
    const h = data[0];
    const colId = h.indexOf('MessageID');
    if (colId < 0) return { success: false, error: 'MessageID column missing' };
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][colId]) !== String(messageId)) continue;
      const colStatus = h.indexOf('ResponseStatus');
      const colNote = h.indexOf('ResponseNote');
      const colUpdated = h.indexOf('UpdatedAt');
      if (colStatus >= 0) sheet.getRange(i + 1, colStatus + 1).setValue(String(responseStatus || 'Pending'));
      if (colNote >= 0) sheet.getRange(i + 1, colNote + 1).setValue(String(responseNote || ''));
      if (colUpdated >= 0) sheet.getRange(i + 1, colUpdated + 1).setValue(new Date().toISOString());
      SpreadsheetApp.flush();
      return { success: true };
    }
    return { success: false, error: 'Message not found' };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function getPmProjectTargets_(onlyActiveProjects) {
  const ss = SpreadsheetApp.openById(MARKETING_SPREADSHEET_ID);
  const sheet = ss.getSheetByName(PM_PROJECTS_SHEET);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0].map(function(h) { return String(h || '').trim(); });

  function idx(name) { return headers.indexOf(name); }
  const colProjectId = idx('Project ID') >= 0 ? idx('Project ID') : 0;
  const colStatus = idx('Status');
  const colTotal = idx('Total Value');
  const colJson1 = idx('Project JSON Part 1') >= 0 ? idx('Project JSON Part 1') : 3;
  const colJson2 = idx('Project JSON Part 2') >= 0 ? idx('Project JSON Part 2') : 4;
  const colJson3 = idx('Project JSON Part 3') >= 0 ? idx('Project JSON Part 3') : 5;

  const out = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const projectId = String(row[colProjectId] || '').trim();
    if (!projectId) continue;

    const jsonStr = String(row[colJson1] || '') + String(row[colJson2] || '') + String(row[colJson3] || '');
    let project = {};
    if (jsonStr && jsonStr.trim()) {
      try {
        project = JSON.parse(jsonStr);
      } catch (e) {
        project = {};
      }
    }

    const status = String(row[colStatus] || project.status || 'Active');
    if (onlyActiveProjects && status.toLowerCase() !== 'active') continue;

    const phone = String(project.customerPhone || '').trim();
    const phoneNorm = normalizePhoneDigits_(phone);
    if (!phoneNorm) continue;

    out.push({
      targetId: 'PROJ:' + projectId,
      sourceType: 'project',
      sourceId: projectId,
      projectId: projectId,
      campaignId: '',
      customerName: String(project.customerName || '').trim(),
      customerPhone: phone,
      customerEmail: String(project.customerEmail || '').trim(),
      address: String(project.customerAddress || '').trim(),
      status: status,
      totalValue: row[colTotal] || project.totalValue || project.total || '',
      remainingBalance: project.remainingBalance != null ? project.remainingBalance : (project.totalValue || project.total || ''),
      shareLink: String(project.shareLink || '').trim(),
      phoneNormalized: phoneNorm
    });
  }

  return out;
}

function sendProjectUpdateDraftsToTelegram_(recipients) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('MARKETING_TELEGRAM_BOT_TOKEN');
  const chatId = props.getProperty('MARKETING_TELEGRAM_CHAT_ID');
  if (!token || !chatId) {
    return [{ success: false, skipped: true, error: 'Telegram not configured' }];
  }

  const baseUrl = 'https://api.telegram.org/bot' + encodeURIComponent(token) + '/sendMessage';
  const maxItems = Math.min(recipients.length, 25);
  const results = [];

  const header = '📣 Project update drafts\nTotal recipients: ' + recipients.length + '\nShowing first ' + maxItems + '.';
  try {
    UrlFetchApp.fetch(baseUrl, {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      payload: JSON.stringify({ chat_id: chatId, text: header })
    });
  } catch (e) {}

  for (let i = 0; i < maxItems; i++) {
    const r = recipients[i];
    const lines = [
      '👤 ' + (r.customerName || 'Customer'),
      r.projectId ? ('🧾 Project: ' + r.projectId + ' (' + (r.status || 'Active') + ')') : '🧾 Source: Marketing lead',
      '📱 ' + (r.customerPhone || ''),
      '',
      'Draft text:',
      r.message || ''
    ];
    const payload = {
      chat_id: chatId,
      text: lines.join('\n')
    };
    try {
      const resp = UrlFetchApp.fetch(baseUrl, {
        method: 'post',
        contentType: 'application/json',
        muteHttpExceptions: true,
        payload: JSON.stringify(payload)
      });
      const code = resp.getResponseCode();
      results.push({ success: code >= 200 && code < 300, code: code, messageId: r.messageId });
    } catch (e) {
      results.push({ success: false, error: e.toString(), messageId: r.messageId });
    }
  }

  return results;
}

function normalizePhoneDigits_(phone) {
  return String(phone || '').replace(/\D/g, '').trim();
}

function formatMoney_(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = parseFloat(v);
  if (isNaN(n)) return String(v);
  return n.toFixed(2);
}

/** Recalculate and update campaign summary stats. */
function updateCampaignStats(campaignId) {
  try {
    const vSheet = getMarketingSheet(VISITS_SHEET);
    const vData  = vSheet.getDataRange().getValues();
    const vh     = vData[0];
    const rows   = vData.slice(1).filter(r => String(r[vh.indexOf('CampaignID')]) === String(campaignId));

    const total      = rows.length;
    const visited    = rows.filter(r => String(r[vh.indexOf('VisitStatus')]) !== 'Not Visited').length;
    const interested = rows.filter(r => String(r[vh.indexOf('VisitStatus')]) === 'Interested').length;
    const leads      = rows.filter(r => String(r[vh.indexOf('LeadConverted')]) === 'Yes').length;
    const jobs       = rows.filter(r => String(r[vh.indexOf('LeadOutcome')]) === 'job').length;

    updateCampaign(campaignId, {
      TotalProperties: total,
      VisitedCount:    visited,
      InterestedCount: interested,
      LeadsConverted:  leads,
      JobsWon:         jobs
    });
  } catch (e) {
    Logger.log('updateCampaignStats error: ' + e);
  }
}

// ===========================================================================
// GPS LOCATION TRACKING
// ===========================================================================

/** Called from field worker's browser every 30 seconds. Upserts their row. */
function updateLocation(staffName, staffEmail, campaignId, lat, lng, accuracy) {
  try {
    initializeMarketingSheets();
    const sheet = getMarketingSheet(LOCATIONS_SHEET);
    const data  = sheet.getDataRange().getValues();
    const h     = data[0];
    const colEmail = h.indexOf('StaffEmail');
    const colCamp  = h.indexOf('CampaignID');
    const now = new Date().toISOString();

    // Find existing row for this staff + campaign
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][colEmail]) === String(staffEmail) &&
          String(data[i][colCamp])  === String(campaignId)) {
        sheet.getRange(i+1, h.indexOf('Lat')+1).setValue(lat);
        sheet.getRange(i+1, h.indexOf('Lng')+1).setValue(lng);
        sheet.getRange(i+1, h.indexOf('Accuracy')+1).setValue(accuracy || '');
        sheet.getRange(i+1, h.indexOf('Timestamp')+1).setValue(now);
        SpreadsheetApp.flush();
        return { success: true, updated: true };
      }
    }
    // Insert new row
    sheet.appendRow([staffName || staffEmail, staffEmail, campaignId, lat, lng, accuracy || '', now]);
    SpreadsheetApp.flush();
    return { success: true, inserted: true };
  } catch (e) {
    Logger.log('updateLocation error: ' + e);
    return { success: false, error: e.toString() };
  }
}

/** Get latest GPS location for all staff on a campaign (for admin map). */
function getActiveLocations(campaignId) {
  try {
    initializeMarketingSheets();
    const sheet = getMarketingSheet(LOCATIONS_SHEET);
    const all   = sheetToObjects(sheet);
    const locs  = campaignId
      ? all.filter(r => String(r.CampaignID) === String(campaignId))
      : all;
    return { success: true, locations: locs };
  } catch (e) {
    return { success: false, error: e.toString(), locations: [] };
  }
}

// ===========================================================================
// SMS EMAIL — Send tap-to-text email to Brooks
// ===========================================================================

/**
 * Send a branded email to the SMS recipient with a pre-filled sms: deep link.
 * On iPhone, tapping the button opens Messages with number + message pre-filled.
 */
function sendSMSEmail(visitId) {
  if (!visitId) return { success: false, error: 'Visit ID required' };
  try {
    const sheet = getMarketingSheet(VISITS_SHEET);
    const all   = sheetToObjects(sheet);
    const visit = all.find(v => String(v.VisitID) === String(visitId));
    if (!visit) return { success: false, error: 'Visit not found' };

    const phone = (visit.Phone || '').replace(/\D/g, '');
    if (!phone) return { success: false, error: 'No phone number on this visit. Add a phone number first.' };

    const firstName   = (visit.OwnerName || 'there').split(' ')[0];
    const displayName = visit.OwnerName || 'Property Owner';
    const address     = [visit.Address, visit.City, visit.State].filter(Boolean).join(', ');
    const e164        = (phone.length === 10 ? '1' + phone : phone);
    const msgBody     = SMS_TEMPLATE.replace('{NAME}', firstName);
    const smsHref     = 'sms:+' + e164 + '&body=' + encodeURIComponent(msgBody);

    const htmlBody = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;background:#f5f7fa;margin:0;padding:0;">'
      + '<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f7fa;"><tr><td align="center" style="padding:32px 16px;">'
      + '<table border="0" cellpadding="0" cellspacing="0" width="560" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">'
      // Header
      + '<tr><td align="center" style="background:linear-gradient(135deg,#0c4a6e 0%,#0369a1 100%);padding:28px 24px;">'
      + '<img src="' + MARKETING_LOGO_URL + '" alt="A Quality Pool Company" style="max-width:120px;height:auto;border-radius:8px;display:block;margin:0 auto 12px auto;">'
      + '<h2 style="color:white;margin:0;font-size:20px;font-weight:800;">Marketing Lead — Text Follow-Up</h2>'
      + '</td></tr>'
      // Body
      + '<tr><td style="padding:28px 24px;">'
      + '<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f0f9ff;border-left:4px solid #0284c7;border-radius:0 8px 8px 0;margin-bottom:24px;">'
      + '<tr><td style="padding:16px 20px;">'
      + '<p style="margin:0 0 6px 0;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#0369a1;">Lead Details</p>'
      + '<p style="margin:4px 0;font-size:15px;color:#0f172a;"><strong>Owner:</strong> ' + safeHtml(displayName) + '</p>'
      + '<p style="margin:4px 0;font-size:15px;color:#0f172a;"><strong>Address:</strong> ' + safeHtml(address) + '</p>'
      + '<p style="margin:4px 0;font-size:15px;color:#0f172a;"><strong>Phone:</strong> (' + phone.slice(0,3) + ') ' + phone.slice(3,6) + '-' + phone.slice(6) + '</p>'
      + '</td></tr></table>'
      // Message preview
      + '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin-bottom:24px;">'
      + '<p style="margin:0 0 8px 0;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">Message Preview</p>'
      + '<p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">' + safeHtml(msgBody) + '</p>'
      + '</div>'
      // Big tap-to-text button
      + '<div style="text-align:center;margin:28px 0 8px 0;">'
      + '<a href="' + smsHref + '" style="display:inline-block;background:linear-gradient(135deg,#059669 0%,#10b981 100%);color:white;text-decoration:none;padding:18px 36px;border-radius:12px;font-size:18px;font-weight:800;letter-spacing:0.3px;">📱  Tap to Text ' + safeHtml(firstName) + '</a>'
      + '</div>'
      + '<p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:12px;">Open this email on your iPhone and tap the button above to send the text.</p>'
      + '</td></tr>'
      // Footer
      + '<tr><td style="background:#f8fafc;padding:20px 24px;text-align:center;border-top:1px solid #e2e8f0;">'
      + '<p style="font-size:13px;color:#64748b;margin:0;font-weight:600;">A Quality Pool Company</p>'
      + '<p style="font-size:12px;color:#9ca3af;margin:4px 0;">samr@aqualitypoolcompanyusa.com | (502) 706-9172</p>'
      + '</td></tr>'
      + '</table></td></tr></table></body></html>';

    MailApp.sendEmail({
      to: SMS_EMAIL_RECIPIENT,
      subject: '\uD83D\uDCF1 Text Lead \u2014 ' + displayName + ' \u2014 ' + (visit.Address || address),
      htmlBody: htmlBody
    });

    Logger.log('\u2705 SMS email sent for visit ' + visitId + ' (' + displayName + ')');
    return { success: true, message: 'SMS email sent to ' + SMS_EMAIL_RECIPIENT };
  } catch (e) {
    Logger.log('sendSMSEmail error: ' + e);
    return { success: false, error: e.toString() };
  }
}

function safeHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===========================================================================
// SCHEDULE SERVICE FROM VISIT
// ===========================================================================

/**
 * Submit a service request (call or weekly) from the marketing app.
 * Calls the existing scheduling script via UrlFetchApp.
 */
function scheduleServiceFromVisit(visitId, serviceData) {
  if (!visitId || !serviceData) return { success: false, error: 'visitId and serviceData required' };
  try {
    const sheet = getMarketingSheet(VISITS_SHEET);
    const all   = sheetToObjects(sheet);
    const visit = all.find(v => String(v.VisitID) === String(visitId));
    if (!visit) return { success: false, error: 'Visit not found' };

    const payload = {
      name:                visit.OwnerName || serviceData.name || '',
      email:               serviceData.email || '',
      phone:               visit.Phone || serviceData.phone || '',
      address:             [visit.Address, visit.City, visit.State, visit.ZIP].filter(Boolean).join(', '),
      serviceType:         serviceData.serviceType || 'Service Call',
      preferredServiceDay: serviceData.preferredDay || '',
      requestedDate:       serviceData.date || '',
      requestedTime:       serviceData.time || '',
      poolServiceFrequency:serviceData.frequency || 'weekly',
      notes:               'Sourced from marketing campaign (Visit ID: ' + visitId + ')'
    };

    const payloadB64 = Utilities.base64Encode(JSON.stringify(payload));
    const url = SCHEDULING_SCRIPT_URL + '?action=submitPublicScheduleRequest&payload=' + encodeURIComponent(payloadB64);
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const result   = JSON.parse(response.getContentText());

    if (result.success) {
      // Mark visit as having a scheduled service
      updateVisit(visitId, { status: 'Interested' });
      const vSheet = getMarketingSheet(VISITS_SHEET);
      const vData  = vSheet.getDataRange().getValues();
      const vh     = vData[0];
      const colId  = vh.indexOf('VisitID');
      for (let i = 1; i < vData.length; i++) {
        if (String(vData[i][colId]) === String(visitId)) {
          vSheet.getRange(i+1, vh.indexOf('ScheduledServiceId')+1).setValue(result.appointmentId || '');
          SpreadsheetApp.flush();
          break;
        }
      }
      // Create customer Drive folder
      try { createCustomerDriveFolder(visit.OwnerName || payload.name, payload.address); } catch(e) {}
    }

    return result;
  } catch (e) {
    Logger.log('scheduleServiceFromVisit error: ' + e);
    return { success: false, error: e.toString() };
  }
}

// ===========================================================================
// GOOGLE DRIVE — Create Customer Folder
// ===========================================================================

/** Create a sub-folder for a new customer inside the master customer folder. */
function createCustomerDriveFolder(customerName, address) {
  if (!customerName) return { success: false, error: 'Customer name required' };
  try {
    const parentFolder = DriveApp.getFolderById(DRIVE_CUSTOMER_FOLDER_ID);
    const folderName   = customerName.trim() + (address ? ' — ' + address.split(',')[0].trim() : '');

    // Avoid duplicates
    const existing = parentFolder.getFoldersByName(folderName);
    if (existing.hasNext()) {
      const existingFolder = existing.next();
      return { success: true, folderId: existingFolder.getId(), folderUrl: existingFolder.getUrl(), existed: true };
    }

    const newFolder = parentFolder.createFolder(folderName);
    newFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    Logger.log('\u2705 Drive folder created: ' + folderName);
    return { success: true, folderId: newFolder.getId(), folderUrl: newFolder.getUrl(), created: true };
  } catch (e) {
    Logger.log('createCustomerDriveFolder error: ' + e);
    return { success: false, error: e.toString() };
  }
}

// ===========================================================================
// COMMISSION REPORT
// ===========================================================================

/** Get commission report for a staff member and/or campaign. */
function getCommissionReport(assignedTo, campaignId) {
  try {
    const cSheet = getMarketingSheet(CAMPAIGNS_SHEET);
    const vSheet = getMarketingSheet(VISITS_SHEET);
    if (!cSheet || !vSheet) return { success: false, error: 'Sheets not found' };

    const allCampaigns = sheetToObjects(cSheet);
    const allVisits    = sheetToObjects(vSheet);

    let campaigns = allCampaigns;
    if (assignedTo) campaigns = campaigns.filter(c => String(c.AssignedTo).toLowerCase() === String(assignedTo).toLowerCase());
    if (campaignId) campaigns = campaigns.filter(c => String(c.CampaignID) === String(campaignId));

    const report = campaigns.map(camp => {
      const visits     = allVisits.filter(v => String(v.CampaignID) === String(camp.CampaignID));
      const leads      = visits.filter(v => v.LeadConverted === 'Yes' || v.LeadConverted === true);
      const jobs       = visits.filter(v => v.LeadOutcome === 'job');
      const rate       = parseFloat(camp.CommissionRate || 0);
      const commission = leads.length * rate;
      return {
        campaignId:    camp.CampaignID,
        campaignName:  camp.Name,
        date:          camp.Date,
        assignedTo:    camp.AssignedTo,
        commissionRate:rate,
        totalVisits:   visits.length,
        leadsConverted:leads.length,
        jobsWon:       jobs.length,
        commissionOwed:commission,
        leads:         leads.map(v => ({ visitId: v.VisitID, name: v.OwnerName, address: v.Address, outcome: v.LeadOutcome }))
      };
    });

    const totalCommission = report.reduce((s, r) => s + r.commissionOwed, 0);
    const totalLeads      = report.reduce((s, r) => s + r.leadsConverted, 0);

    return { success: true, report: report, totalCommission: totalCommission, totalLeads: totalLeads };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * Service Report Web App backend (Google Apps Script HTML Service)
 */
const SR_WEBAPP_SPREADSHEET_ID = '1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0';
const SR_APPOINTMENTS_SHEET = 'Appointments';
const SR_CUSTOMERS_SHEET = 'Customers';
const SR_SERVICE_REPORTS_SHEET = 'Service Reports';
const SR_INVOICES_SHEET = 'Invoices';

const SR_SERVICE_REPORT_HEADERS = [
  'ReportID', 'AppointmentID', 'CustomerID', 'CustomerName', 'Date', 'ServiceType',
  'TechName', 'OpeningChecklist (JSON)', 'WaterChemistry (JSON)', 'ChemicalsAdded (JSON)',
  'ActionsPerformed', 'EquipmentReadings (JSON)', 'ClosingChecklist (JSON)',
  'RecommendedOptions (JSON)', 'Photos (JSON)', 'Notes', 'InvoiceID', 'CreatedAt', 'UpdatedAt'
];

const SR_INVOICE_HEADERS = [
  'InvoiceID', 'AppointmentID', 'CustomerID', 'CustomerName', 'Date',
  'LineItems (JSON)', 'Subtotal', 'Tax', 'Total', 'Status', 'SentAt', 'CreatedAt', 'UpdatedAt'
];

const SR_INVOICE_HEADER_ALIASES = {
  InvoiceID: ['Invoice ID', 'ID'],
  AppointmentID: ['Appointment ID', 'LinkedAppointmentID', 'Linked Appointment ID'],
  CustomerID: ['Customer ID'],
  CustomerName: ['Customer Name'],
  'LineItems (JSON)': ['LineItems', 'Line Items JSON', 'LineItems JSON'],
  CreatedAt: ['Created At'],
  UpdatedAt: ['Updated At'],
  SentAt: ['Sent At']
};

function doGet(e) {
  if (isApiRequest_(e)) {
    return handleApiRequestFromGet_(e);
  }
  ensureServiceReportsSheet_();
  ensureCustomersEquipmentColumn_();
  ensureInvoicesSheet_();
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Service Report Web App')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  if (isApiRequest_(e)) {
    return handleApiRequestFromPost_(e);
  }
  return createJsonOutput_({ success: false, error: 'Invalid request' });
}

function isApiRequest_(e) {
  return !!(e && e.parameter && String(e.parameter.api || '') === '1');
}

function handleApiRequestFromGet_(e) {
  try {
    const action = safeString_(e.parameter.action);
    const args = parseJsonDefensive_(e.parameter.args, []);
    const result = runApiAction_(action, Array.isArray(args) ? args : []);
    return createJsonOutput_({ success: true, result: result });
  } catch (error) {
    return createJsonOutput_({ success: false, error: error.message || String(error) });
  }
}

function handleApiRequestFromPost_(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    let body = {};

    if (e && e.postData && e.postData.contents) {
      body = parseJsonDefensive_(e.postData.contents, {});
    }

    const action = safeString_(body.action || params.action);
    const args = (body.args !== undefined)
      ? body.args
      : parseJsonDefensive_(params.args, []);
    const normalizedArgs = Array.isArray(args)
      ? args
      : (args === undefined ? [] : [args]);

    const result = runApiAction_(action, normalizedArgs);
    return createJsonOutput_({ success: true, result: result });
  } catch (error) {
    return createJsonOutput_({ success: false, error: error.message || String(error) });
  }
}

function runApiAction_(action, args) {
  const map = {
    getAppointmentsLastWeek: function() { return getAppointmentsLastWeek(); },
    getServiceReport: function(a) { return getServiceReport(a); },
    saveServiceReport: function(a) { return saveServiceReport(a); },
    getCustomerEquipment: function(a) { return getCustomerEquipment(a); },
    saveCustomerEquipment: function(a, b) { return saveCustomerEquipment(a, b); },
    sendServiceReportEmail: function(a) { return sendServiceReportEmail(a); },
    getInvoiceData: function(a) { return getInvoiceData(a); },
    saveInvoice: function(a) { return saveInvoice(a); },
    sendInvoiceEmail: function(a) { return sendInvoiceEmail(a); },
    getServiceReportDraftText: function(a) { return getServiceReportDraftText(a); },
    sendServiceReportTelegram: function(a) { return sendServiceReportTelegram(a); },
    getCustomersBasic: function() { return getCustomersBasic(); },
    getServiceReports: function(a, b) { return getServiceReportsAPI(a, b); },
    saveServiceReportV2: function(a) { return saveServiceReportAPI(a); },
    sendServiceReport: function(a, b) { return sendServiceReportAPI(a, b); }
  };

  if (!map[action]) {
    throw new Error('Unknown action: ' + action);
  }
  return map[action].apply(null, args || []);
}

function createJsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getAppointmentsLastWeek() {
  try {
    const ss = SpreadsheetApp.openById(SR_WEBAPP_SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SR_APPOINTMENTS_SHEET);
    if (!sheet) throw new Error('Appointments sheet not found');

    const values = sheet.getDataRange().getValues();
    if (values.length <= 1) return [];

    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const out = [];
    for (let r = 1; r < values.length; r++) {
      const row = values[r];
      const dt = parseSheetDate_(row[10]);
      if (!dt) continue;
      if (dt < sevenDaysAgo || dt > today) continue;

      const linkedServiceReportId = safeString_(row[45]); // AT
      out.push({
        rowNumber: r + 1,
        appointmentId: safeString_(row[0]),
        companyId: safeString_(row[1]),
        customerId: safeString_(row[2]),
        customerName: safeString_(row[3]),
        customerEmail: safeString_(row[4]),
        customerPhone: safeString_(row[5]),
        address: safeString_(row[6]),
        serviceType: safeString_(row[7]),
        date: Utilities.formatDate(dt, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
        time: safeString_(row[11]),
        status: safeString_(row[15]),
        linkedInvoiceId: safeString_(row[24]),
        linkedServiceReportId: linkedServiceReportId,
        hasReport: !!linkedServiceReportId
      });
    }

    out.sort(function(a, b) {
      const ad = new Date(a.date + 'T00:00:00').getTime();
      const bd = new Date(b.date + 'T00:00:00').getTime();
      if (ad !== bd) return bd - ad;
      return String(a.time || '').localeCompare(String(b.time || ''));
    });

    return out;
  } catch (error) {
    throw new Error('getAppointmentsLastWeek failed: ' + error.message);
  }
}

function getServiceReport(appointmentId) {
  try {
    if (!appointmentId) return null;
    const sheet = ensureServiceReportsSheet_();
    const values = sheet.getDataRange().getValues();
    if (values.length <= 1) return null;

    for (let r = 1; r < values.length; r++) {
      const row = values[r];
      if (safeString_(row[1]) === safeString_(appointmentId)) {
        return reportRowToObject_(row, r + 1);
      }
    }
    return null;
  } catch (error) {
    throw new Error('getServiceReport failed: ' + error.message);
  }
}

function saveServiceReport(data) {
  try {
    if (!data || !data.appointmentId) throw new Error('Missing appointmentId');

    const sheet = ensureServiceReportsSheet_();
    const now = new Date();
    const nowIso = now.toISOString();

    const existing = findReportRowByAppointmentOrId_(sheet, data.appointmentId, data.reportId);
    const reportId = existing ? existing.reportId : ('SR-' + Date.now());

    const payload = {
      reportId: reportId,
      appointmentId: safeString_(data.appointmentId),
      customerId: safeString_(data.customerId),
      customerName: safeString_(data.customerName),
      date: safeString_(data.date),
      serviceType: safeString_(data.serviceType),
      techName: safeString_(data.techName),
      openingChecklist: stringifyJson_(data.openingChecklist, {}),
      waterChemistry: stringifyJson_(data.waterChemistry, {}),
      chemicalsAdded: stringifyJson_(data.chemicalsAdded, []),
      actionsPerformed: safeString_(data.actionsPerformed),
      equipmentReadings: stringifyJson_(data.equipmentReadings, {}),
      closingChecklist: stringifyJson_(data.closingChecklist, {}),
      recommendedOptions: stringifyJson_(data.recommendedOptions, []),
      photos: stringifyJson_(data.photos, []),
      notes: safeString_(data.notes),
      invoiceId: safeString_(data.invoiceId),
      createdAt: existing ? safeString_(existing.createdAt) : nowIso,
      updatedAt: nowIso
    };

    const rowValues = [[
      payload.reportId,
      payload.appointmentId,
      payload.customerId,
      payload.customerName,
      payload.date,
      payload.serviceType,
      payload.techName,
      payload.openingChecklist,
      payload.waterChemistry,
      payload.chemicalsAdded,
      payload.actionsPerformed,
      payload.equipmentReadings,
      payload.closingChecklist,
      payload.recommendedOptions,
      payload.photos,
      payload.notes,
      payload.invoiceId,
      payload.createdAt,
      payload.updatedAt
    ]];

    if (existing) {
      sheet.getRange(existing.rowNumber, 1, 1, rowValues[0].length).setValues(rowValues);
    } else {
      sheet.getRange(sheet.getLastRow() + 1, 1, 1, rowValues[0].length).setValues(rowValues);
    }

    writeAppointmentLinkedReportId_(payload.appointmentId, payload.reportId);

    return {
      success: true,
      reportId: payload.reportId,
      updatedAt: payload.updatedAt
    };
  } catch (error) {
    throw new Error('saveServiceReport failed: ' + error.message);
  }
}

function getCustomerEquipment(customerId) {
  try {
    if (!customerId) return [];
    const sheet = ensureCustomersEquipmentColumn_();
    const values = sheet.getDataRange().getValues();
    if (values.length <= 1) return [];

    const equipCol = getColumnIndexByHeader_(values[0], 'EquipmentProfile');
    for (let r = 1; r < values.length; r++) {
      if (safeString_(values[r][0]) === safeString_(customerId)) {
        return parseJsonDefensive_(values[r][equipCol], []);
      }
    }
    return [];
  } catch (error) {
    throw new Error('getCustomerEquipment failed: ' + error.message);
  }
}

function saveCustomerEquipment(customerId, equipmentJson) {
  try {
    if (!customerId) throw new Error('Missing customerId');
    const sheet = ensureCustomersEquipmentColumn_();
    const values = sheet.getDataRange().getValues();
    if (values.length <= 1) throw new Error('Customers sheet is empty');

    const equipCol = getColumnIndexByHeader_(values[0], 'EquipmentProfile');
    const equipmentText = stringifyJson_(equipmentJson, []);

    for (let r = 1; r < values.length; r++) {
      if (safeString_(values[r][0]) === safeString_(customerId)) {
        sheet.getRange(r + 1, equipCol + 1).setValue(equipmentText);
        return { success: true };
      }
    }
    throw new Error('Customer not found for customerId: ' + customerId);
  } catch (error) {
    throw new Error('saveCustomerEquipment failed: ' + error.message);
  }
}

function sendServiceReportEmail(reportId) {
  try {
    if (!reportId) throw new Error('Missing reportId');
    const report = getServiceReportById_(reportId);
    if (!report) throw new Error('Report not found');

    const appointment = getAppointmentById_(report.appointmentId);
    const toEmail = (appointment && appointment.customerEmail) || '';
    if (!toEmail) throw new Error('Customer email not found on appointment');

    const html = buildServiceReportContractEmailHtml_(report, appointment || {});
    const pdfBlob = createServiceReportPdfBlob_(report, appointment || {});

    const mailPayload = {
      to: toEmail,
      subject: 'Service Report ' + safeString_(report.reportId) + ' - ' + (report.date || ''),
      htmlBody: html
    };
    if (pdfBlob) {
      mailPayload.attachments = [pdfBlob];
    }

    MailApp.sendEmail(mailPayload);

    return { success: true };
  } catch (error) {
    throw new Error('sendServiceReportEmail failed: ' + error.message);
  }
}

function getServiceReportDraftText(reportId) {
  try {
    if (!reportId) throw new Error('Missing reportId');
    const report = getServiceReportById_(reportId);
    if (!report) throw new Error('Report not found');
    const appointment = getAppointmentById_(report.appointmentId) || {};
    return {
      success: true,
      reportId: report.reportId,
      draftText: buildServiceReportDraftText_(report, appointment)
    };
  } catch (error) {
    throw new Error('getServiceReportDraftText failed: ' + error.message);
  }
}

function sendServiceReportTelegram(reportId) {
  try {
    if (!reportId) throw new Error('Missing reportId');
    const report = getServiceReportById_(reportId);
    if (!report) throw new Error('Report not found');
    const appointment = getAppointmentById_(report.appointmentId) || {};

    const draftText = buildServiceReportDraftText_(report, appointment);
    const telegramHtml = buildServiceReportTelegramHtml_(report, appointment);

    const buttons = [];
    try {
      if (typeof buildTelegramSmsRedirectUrl_ === 'function' && appointment.customerPhone) {
        const smsUrl = buildTelegramSmsRedirectUrl_(appointment.customerPhone, draftText, report.customerName || appointment.customerName || '');
        if (smsUrl) buttons.push({ text: 'Draft Text to Customer', url: smsUrl });
      }
    } catch (_btnErr) {}

    let result;
    if (typeof sendTelegramBotMessage_ === 'function') {
      result = sendTelegramBotMessage_(telegramHtml, buttons);
    } else {
      result = sendTelegramMessageFallback_(telegramHtml);
    }

    if (!result || !result.success) {
      throw new Error((result && result.error) || 'Telegram send failed');
    }

    return {
      success: true,
      reportId: report.reportId,
      draftText: draftText
    };
  } catch (error) {
    throw new Error('sendServiceReportTelegram failed: ' + error.message);
  }
}

function getInvoiceData(appointmentId) {
  try {
    if (!appointmentId) return null;
    const appointment = getAppointmentById_(appointmentId);
    if (!appointment || !appointment.linkedInvoiceId) return null;

    const invoiceSheet = ensureInvoicesSheet_();
    const invoiceMeta = getInvoiceSheetMeta_(invoiceSheet);
    const values = invoiceSheet.getDataRange().getValues();
    if (values.length <= 1) return null;

    for (let r = 1; r < values.length; r++) {
      if (safeString_(values[r][invoiceMeta.colMap.InvoiceID]) === safeString_(appointment.linkedInvoiceId)) {
        return invoiceRowToObject_(values[r], r + 1, invoiceMeta.colMap);
      }
    }

    return null;
  } catch (error) {
    throw new Error('getInvoiceData failed: ' + error.message);
  }
}

function saveInvoice(invoiceData) {
  try {
    if (!invoiceData || !invoiceData.appointmentId) throw new Error('Missing appointmentId');
    const sheet = ensureInvoicesSheet_();
    const invoiceMeta = getInvoiceSheetMeta_(sheet);
    const nowIso = new Date().toISOString();

    const invoiceId = safeString_(invoiceData.invoiceId) || ('INV-' + Date.now());
    const lineItemsJson = stringifyJson_(invoiceData.lineItems, []);

    const payload = {
      invoiceId: invoiceId,
      appointmentId: safeString_(invoiceData.appointmentId),
      customerId: safeString_(invoiceData.customerId),
      customerName: safeString_(invoiceData.customerName),
      date: safeString_(invoiceData.date) || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      lineItems: lineItemsJson,
      subtotal: Number(invoiceData.subtotal || 0),
      tax: Number(invoiceData.tax || 0),
      total: Number(invoiceData.total || 0),
      status: safeString_(invoiceData.status) || 'Draft',
      sentAt: safeString_(invoiceData.sentAt),
      createdAt: nowIso,
      updatedAt: nowIso
    };

    const values = sheet.getDataRange().getValues();
    let rowNumber = -1;
    let existingCreatedAt = '';
    for (let r = 1; r < values.length; r++) {
      if (safeString_(values[r][invoiceMeta.colMap.InvoiceID]) === invoiceId) {
        rowNumber = r + 1;
        existingCreatedAt = safeString_(values[r][invoiceMeta.colMap.CreatedAt]);
        break;
      }
    }

    if (existingCreatedAt) payload.createdAt = existingCreatedAt;

    if (rowNumber > 0) {
      const existingRow = values[rowNumber - 1];
      const updatedRow = writeInvoicePayloadToRow_(existingRow, invoiceMeta.colMap, payload);
      sheet.getRange(rowNumber, 1, 1, updatedRow.length).setValues([updatedRow]);
    } else {
      const newRow = writeInvoicePayloadToRow_(new Array(sheet.getLastColumn()).fill(''), invoiceMeta.colMap, payload);
      sheet.getRange(sheet.getLastRow() + 1, 1, 1, newRow.length).setValues([newRow]);
    }

    writeAppointmentLinkedInvoiceId_(payload.appointmentId, payload.invoiceId);

    return { success: true, invoiceId: payload.invoiceId };
  } catch (error) {
    throw new Error('saveInvoice failed: ' + error.message);
  }
}

function sendInvoiceEmail(invoiceId) {
  try {
    if (!invoiceId) throw new Error('Missing invoiceId');
    const invoiceSheet = ensureInvoicesSheet_();
    const invoiceMeta = getInvoiceSheetMeta_(invoiceSheet);
    const values = invoiceSheet.getDataRange().getValues();

    let invoice = null;
    for (let r = 1; r < values.length; r++) {
      if (safeString_(values[r][invoiceMeta.colMap.InvoiceID]) === safeString_(invoiceId)) {
        invoice = invoiceRowToObject_(values[r], r + 1, invoiceMeta.colMap);
        break;
      }
    }
    if (!invoice) throw new Error('Invoice not found');

    const appointment = getAppointmentById_(invoice.appointmentId);
    const toEmail = (appointment && appointment.customerEmail) || '';
    if (!toEmail) throw new Error('Customer email not found on appointment');

    const lines = parseJsonDefensive_(invoice.lineItems, []);
    const rows = lines.map(function(item) {
      const qty = Number(item.qty || 0);
      const unitPrice = Number(item.unitPrice || 0);
      const total = qty * unitPrice;
      return '<tr><td style="padding:8px;border-bottom:1px solid #eee;">' + escapeHtml_(item.description || '') + '</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">' + qty + '</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">$' + unitPrice.toFixed(2) + '</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">$' + total.toFixed(2) + '</td></tr>';
    }).join('');

    const html = [
      '<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">',
      '<h2 style="color:#0a1f4e;">Invoice ' + escapeHtml_(invoice.invoiceId) + '</h2>',
      '<p><strong>Customer:</strong> ' + escapeHtml_(invoice.customerName || '') + '</p>',
      '<table style="width:100%;border-collapse:collapse;">',
      '<thead><tr><th style="text-align:left;padding:8px;border-bottom:2px solid #ddd;">Description</th><th style="text-align:right;padding:8px;border-bottom:2px solid #ddd;">Qty</th><th style="text-align:right;padding:8px;border-bottom:2px solid #ddd;">Unit</th><th style="text-align:right;padding:8px;border-bottom:2px solid #ddd;">Total</th></tr></thead>',
      '<tbody>' + rows + '</tbody>',
      '</table>',
      '<p style="text-align:right;margin-top:16px;"><strong>Subtotal:</strong> $' + Number(invoice.subtotal || 0).toFixed(2) + '</p>',
      '<p style="text-align:right;"><strong>Tax:</strong> $' + Number(invoice.tax || 0).toFixed(2) + '</p>',
      '<p style="text-align:right;font-size:18px;"><strong>Total:</strong> $' + Number(invoice.total || 0).toFixed(2) + '</p>',
      '</div>'
    ].join('');

    MailApp.sendEmail({
      to: toEmail,
      subject: 'Invoice ' + invoice.invoiceId,
      htmlBody: html
    });

    return { success: true };
  } catch (error) {
    throw new Error('sendInvoiceEmail failed: ' + error.message);
  }
}

function getCustomersBasic() {
  try {
    const sheet = ensureCustomersEquipmentColumn_();
    const values = sheet.getDataRange().getValues();
    if (values.length <= 1) return [];

    const header = values[0];
    const equipCol = getColumnIndexByHeader_(header, 'EquipmentProfile');
    const out = [];

    for (let r = 1; r < values.length; r++) {
      const row = values[r];
      const id = safeString_(row[0]);
      if (!id) continue;
      out.push({
        customerId: id,
        name: safeString_(row[1]),
        email: safeString_(row[2]),
        phone: safeString_(row[3]),
        address: safeString_(row[4]),
        equipmentProfile: parseJsonDefensive_(row[equipCol], [])
      });
    }
    return out;
  } catch (error) {
    throw new Error('getCustomersBasic failed: ' + error.message);
  }
}

// ------------------ Helpers ------------------

function ensureServiceReportsSheet_() {
  const ss = SpreadsheetApp.openById(SR_WEBAPP_SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SR_SERVICE_REPORTS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SR_SERVICE_REPORTS_SHEET);
    sheet.getRange(1, 1, 1, SR_SERVICE_REPORT_HEADERS.length).setValues([SR_SERVICE_REPORT_HEADERS]);
    sheet.getRange(1, 1, 1, SR_SERVICE_REPORT_HEADERS.length).setFontWeight('bold');
  } else {
    ensureHeaders_(sheet, SR_SERVICE_REPORT_HEADERS);
  }
  return sheet;
}

function ensureInvoicesSheet_() {
  const ss = SpreadsheetApp.openById(SR_WEBAPP_SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SR_INVOICES_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SR_INVOICES_SHEET);
    sheet.getRange(1, 1, 1, SR_INVOICE_HEADERS.length).setValues([SR_INVOICE_HEADERS]);
    sheet.getRange(1, 1, 1, SR_INVOICE_HEADERS.length).setFontWeight('bold');
  } else {
    ensureHeadersAppended_(sheet, SR_INVOICE_HEADERS, SR_INVOICE_HEADER_ALIASES);
  }
  return sheet;
}

function ensureCustomersEquipmentColumn_() {
  const ss = SpreadsheetApp.openById(SR_WEBAPP_SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SR_CUSTOMERS_SHEET);
  if (!sheet) throw new Error('Customers sheet not found');

  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const idx = getColumnIndexByHeader_(headers, 'EquipmentProfile');
  if (idx === -1) {
    const newCol = lastCol + 1;
    sheet.getRange(1, newCol).setValue('EquipmentProfile');
    sheet.getRange(1, newCol).setFontWeight('bold');
  }
  return sheet;
}

function ensureHeaders_(sheet, headers) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  for (let i = 0; i < headers.length; i++) {
    if (!existing[i]) {
      sheet.getRange(1, i + 1).setValue(headers[i]);
      sheet.getRange(1, i + 1).setFontWeight('bold');
    }
  }
}

function ensureHeadersAppended_(sheet, headers, aliasesMap) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  let existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const missing = [];

  for (let i = 0; i < headers.length; i++) {
    const key = headers[i];
    const aliasList = (aliasesMap && aliasesMap[key]) ? aliasesMap[key] : [];
    const names = [key].concat(aliasList);
    if (findHeaderIndexByNames_(existing, names) === -1) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
    sheet.getRange(1, existing.length + 1, 1, missing.length).setFontWeight('bold');
    existing = existing.concat(missing);
  }

  return existing;
}

function findHeaderIndexByNames_(headers, names) {
  for (let i = 0; i < headers.length; i++) {
    const existing = safeString_(headers[i]).toLowerCase();
    for (let j = 0; j < names.length; j++) {
      if (existing === safeString_(names[j]).toLowerCase()) return i;
    }
  }
  return -1;
}

function getColumnIndexByHeader_(headers, headerName) {
  for (let i = 0; i < headers.length; i++) {
    if (safeString_(headers[i]).toLowerCase() === safeString_(headerName).toLowerCase()) return i;
  }
  return -1;
}

function parseSheetDate_(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) return value;
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return null;
  return parsed;
}

function safeString_(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function stringifyJson_(val, fallbackVal) {
  try {
    const out = (val === undefined || val === null || val === '') ? fallbackVal : val;
    return typeof out === 'string' ? out : JSON.stringify(out);
  } catch (e) {
    return JSON.stringify(fallbackVal);
  }
}

function parseJsonDefensive_(text, fallback) {
  try {
    if (text === null || text === undefined || text === '') return fallback;
    if (typeof text === 'object') return text;
    return JSON.parse(String(text));
  } catch (e) {
    return fallback;
  }
}

function reportRowToObject_(row, rowNumber) {
  return {
    rowNumber: rowNumber,
    reportId: safeString_(row[0]),
    appointmentId: safeString_(row[1]),
    customerId: safeString_(row[2]),
    customerName: safeString_(row[3]),
    date: safeString_(row[4]),
    serviceType: safeString_(row[5]),
    techName: safeString_(row[6]),
    openingChecklist: parseJsonDefensive_(row[7], {}),
    waterChemistry: parseJsonDefensive_(row[8], {}),
    chemicalsAdded: parseJsonDefensive_(row[9], []),
    actionsPerformed: safeString_(row[10]),
    equipmentReadings: parseJsonDefensive_(row[11], {}),
    closingChecklist: parseJsonDefensive_(row[12], {}),
    recommendedOptions: parseJsonDefensive_(row[13], []),
    photos: parseJsonDefensive_(row[14], []),
    notes: safeString_(row[15]),
    invoiceId: safeString_(row[16]),
    createdAt: safeString_(row[17]),
    updatedAt: safeString_(row[18])
  };
}

function invoiceRowToObject_(row, rowNumber, colMap) {
  function v(key) {
    const idx = colMap[key];
    return idx >= 0 ? row[idx] : '';
  }
  return {
    rowNumber: rowNumber,
    invoiceId: safeString_(v('InvoiceID')),
    appointmentId: safeString_(v('AppointmentID')),
    customerId: safeString_(v('CustomerID')),
    customerName: safeString_(v('CustomerName')),
    date: safeString_(v('Date')),
    lineItems: safeString_(v('LineItems (JSON)')),
    subtotal: Number(v('Subtotal') || 0),
    tax: Number(v('Tax') || 0),
    total: Number(v('Total') || 0),
    status: safeString_(v('Status')),
    sentAt: safeString_(v('SentAt')),
    createdAt: safeString_(v('CreatedAt')),
    updatedAt: safeString_(v('UpdatedAt'))
  };
}

function getInvoiceSheetMeta_(sheet) {
  const headers = ensureHeadersAppended_(sheet, SR_INVOICE_HEADERS, SR_INVOICE_HEADER_ALIASES);
  const colMap = {};
  for (let i = 0; i < SR_INVOICE_HEADERS.length; i++) {
    const key = SR_INVOICE_HEADERS[i];
    const aliases = SR_INVOICE_HEADER_ALIASES[key] || [];
    colMap[key] = findHeaderIndexByNames_(headers, [key].concat(aliases));
    if (colMap[key] === -1) {
      throw new Error('Missing required invoice header: ' + key);
    }
  }
  return { headers: headers, colMap: colMap };
}

function writeInvoicePayloadToRow_(baseRow, colMap, payload) {
  const row = Array.isArray(baseRow) ? baseRow.slice() : [];
  const neededLength = Math.max.apply(null, Object.keys(colMap).map(function(k) { return colMap[k]; })) + 1;
  while (row.length < neededLength) row.push('');

  row[colMap.InvoiceID] = payload.invoiceId;
  row[colMap.AppointmentID] = payload.appointmentId;
  row[colMap.CustomerID] = payload.customerId;
  row[colMap.CustomerName] = payload.customerName;
  row[colMap.Date] = payload.date;
  row[colMap['LineItems (JSON)']] = payload.lineItems;
  row[colMap.Subtotal] = payload.subtotal;
  row[colMap.Tax] = payload.tax;
  row[colMap.Total] = payload.total;
  row[colMap.Status] = payload.status;
  row[colMap.SentAt] = payload.sentAt;
  row[colMap.CreatedAt] = payload.createdAt;
  row[colMap.UpdatedAt] = payload.updatedAt;

  return row;
}

function findReportRowByAppointmentOrId_(sheet, appointmentId, reportId) {
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return null;

  const appt = safeString_(appointmentId);
  const rid = safeString_(reportId);
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (rid && safeString_(row[0]) === rid) {
      return {
        rowNumber: r + 1,
        reportId: safeString_(row[0]),
        createdAt: safeString_(row[17])
      };
    }
    if (appt && safeString_(row[1]) === appt) {
      return {
        rowNumber: r + 1,
        reportId: safeString_(row[0]),
        createdAt: safeString_(row[17])
      };
    }
  }
  return null;
}

function getAppointmentById_(appointmentId) {
  const ss = SpreadsheetApp.openById(SR_WEBAPP_SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SR_APPOINTMENTS_SHEET);
  if (!sheet) return null;

  const values = sheet.getDataRange().getValues();
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (safeString_(row[0]) === safeString_(appointmentId)) {
      const dateVal = parseSheetDate_(row[10]);
      return {
        rowNumber: r + 1,
        appointmentId: safeString_(row[0]),
        companyId: safeString_(row[1]),
        customerId: safeString_(row[2]),
        customerName: safeString_(row[3]),
        customerEmail: safeString_(row[4]),
        customerPhone: safeString_(row[5]),
        address: safeString_(row[6]),
        serviceType: safeString_(row[7]),
        date: dateVal ? Utilities.formatDate(dateVal, Session.getScriptTimeZone(), 'yyyy-MM-dd') : safeString_(row[10]),
        time: safeString_(row[11]),
        status: safeString_(row[15]),
        linkedInvoiceId: safeString_(row[24]),
        linkedServiceReportId: safeString_(row[45])
      };
    }
  }
  return null;
}

function writeAppointmentLinkedReportId_(appointmentId, reportId) {
  const ss = SpreadsheetApp.openById(SR_WEBAPP_SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SR_APPOINTMENTS_SHEET);
  if (!sheet) return;

  const values = sheet.getDataRange().getValues();
  for (let r = 1; r < values.length; r++) {
    if (safeString_(values[r][0]) === safeString_(appointmentId)) {
      sheet.getRange(r + 1, 46).setValue(reportId); // AT
      return;
    }
  }
}

function writeAppointmentLinkedInvoiceId_(appointmentId, invoiceId) {
  const ss = SpreadsheetApp.openById(SR_WEBAPP_SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SR_APPOINTMENTS_SHEET);
  if (!sheet) return;

  const values = sheet.getDataRange().getValues();
  for (let r = 1; r < values.length; r++) {
    if (safeString_(values[r][0]) === safeString_(appointmentId)) {
      sheet.getRange(r + 1, 25).setValue(invoiceId); // Y
      return;
    }
  }
}

function buildServiceReportEmailHtml_(report, appointment) {
  const opening = report.openingChecklist || {};
  const chemistry = report.waterChemistry || {};
  const chemicals = report.chemicalsAdded || [];
  const closing = report.closingChecklist || {};
  const recs = report.recommendedOptions || [];

  function renderObj(title, obj) {
    const rows = Object.keys(obj || {}).map(function(k) {
      return '<tr><td style="padding:6px;border-bottom:1px solid #eee;">' + escapeHtml_(k) + '</td><td style="padding:6px;border-bottom:1px solid #eee;">' + escapeHtml_(String(obj[k])) + '</td></tr>';
    }).join('');
    return '<h3 style="color:#1e90d4;margin:16px 0 8px;">' + title + '</h3><table style="width:100%;border-collapse:collapse;">' + rows + '</table>';
  }

  const chemRows = chemicals.map(function(c) {
    return '<li>' + escapeHtml_(String(c.name || 'Chemical')) + ': ' + escapeHtml_(String(c.amount || '')) + ' ' + escapeHtml_(String(c.unit || '')) + '</li>';
  }).join('');

  const recRows = recs.map(function(r) {
    return '<li>' + escapeHtml_(String(r.description || 'Option')) + ' - $' + Number(r.price || 0).toFixed(2) + '</li>';
  }).join('');

  return [
    '<div style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;color:#0f172a;">',
    '<h2 style="background:#0a1f4e;color:#fff;padding:14px;border-radius:8px;">Service Report ' + escapeHtml_(report.reportId) + '</h2>',
    '<p><strong>Customer:</strong> ' + escapeHtml_(report.customerName || appointment.customerName || '') + '</p>',
    '<p><strong>Date:</strong> ' + escapeHtml_(report.date || '') + ' <strong>Service:</strong> ' + escapeHtml_(report.serviceType || '') + '</p>',
    '<p><strong>Technician:</strong> ' + escapeHtml_(report.techName || '') + '</p>',
    renderObj('Opening Checklist', opening),
    renderObj('Water Chemistry', chemistry),
    '<h3 style="color:#1e90d4;margin:16px 0 8px;">Chemicals Added</h3><ul>' + (chemRows || '<li>None</li>') + '</ul>',
    '<h3 style="color:#1e90d4;margin:16px 0 8px;">Actions Performed</h3><p>' + escapeHtml_(report.actionsPerformed || 'None') + '</p>',
    renderObj('Closing Checklist', closing),
    '<h3 style="color:#1e90d4;margin:16px 0 8px;">Recommended Options</h3><ul>' + (recRows || '<li>None</li>') + '</ul>',
    '<h3 style="color:#1e90d4;margin:16px 0 8px;">Notes</h3><p>' + escapeHtml_(report.notes || '') + '</p>',
    '</div>'
  ].join('');
}

function getServiceReportById_(reportId) {
  const sheet = ensureServiceReportsSheet_();
  const values = sheet.getDataRange().getValues();
  for (let r = 1; r < values.length; r++) {
    if (safeString_(values[r][0]) === safeString_(reportId)) {
      return reportRowToObject_(values[r], r + 1);
    }
  }
  return null;
}

function buildServiceReportContractEmailHtml_(report, appointment) {
  const opening = report.openingChecklist || {};
  const chemistry = report.waterChemistry || {};
  const chemicals = report.chemicalsAdded || [];
  const equipmentReadings = report.equipmentReadings || {};
  const closing = report.closingChecklist || {};
  const recs = report.recommendedOptions || [];
  const photos = normalizeReportPhotos_(report.photos);
  const actions = parseJsonDefensive_(report.actionsPerformed, { selected: [], note: report.actionsPerformed || '' });

  function renderKVTable(obj) {
    const keys = Object.keys(obj || {});
    if (!keys.length) return '<p style="margin:0;color:#6b7280;">No data submitted.</p>';
    const rows = keys.map(function(k) {
      return '<tr>' +
        '<td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600;color:#1f2937;">' + escapeHtml_(k) + '</td>' +
        '<td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#111827;">' + escapeHtml_(String(obj[k])) + '</td>' +
      '</tr>';
    }).join('');
    return '<table style="width:100%;border-collapse:collapse;">' + rows + '</table>';
  }

  const chemRows = (chemicals || []).map(function(c) {
    return '<tr>' +
      '<td style="padding:8px;border-bottom:1px solid #e5e7eb;">' + escapeHtml_(String(c.name || '')) + '</td>' +
      '<td style="padding:8px;border-bottom:1px solid #e5e7eb;">' + escapeHtml_(String(c.amount || '')) + '</td>' +
      '<td style="padding:8px;border-bottom:1px solid #e5e7eb;">' + escapeHtml_(String(c.unit || '')) + '</td>' +
    '</tr>';
  }).join('');

  const recRows = (recs || []).map(function(r) {
    return '<tr>' +
      '<td style="padding:8px;border-bottom:1px solid #e5e7eb;">' + escapeHtml_(String(r.description || '')) + '</td>' +
      '<td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">$' + Number(r.price || 0).toFixed(2) + '</td>' +
    '</tr>';
  }).join('');

  const photoList = photos.map(function(p, idx) {
    return '<li style="margin-bottom:4px;">' +
      escapeHtml_(String(p.label || ('Photo ' + (idx + 1)))) +
      (p.caption ? ' — ' + escapeHtml_(String(p.caption)) : '') +
      '</li>';
  }).join('');

  return [
    '<div style="font-family:Arial,sans-serif;max-width:860px;margin:0 auto;background:#ffffff;border:1px solid #d1d5db;border-radius:12px;overflow:hidden;">',
      '<div style="background:#0a1f4e;color:#ffffff;padding:18px 20px;">',
        '<h1 style="margin:0;font-size:24px;">A Quality Pool Company</h1>',
        '<div style="opacity:.9;margin-top:4px;font-size:13px;">Service Report</div>',
      '</div>',
      '<div style="padding:18px 20px;">',
        '<table style="width:100%;border-collapse:collapse;margin-bottom:14px;">',
          '<tr><td style="padding:6px 0;"><strong>Report ID:</strong> ' + escapeHtml_(report.reportId) + '</td><td style="padding:6px 0;"><strong>Date:</strong> ' + escapeHtml_(report.date || '') + '</td></tr>',
          '<tr><td style="padding:6px 0;"><strong>Customer:</strong> ' + escapeHtml_(report.customerName || appointment.customerName || '') + '</td><td style="padding:6px 0;"><strong>Service Type:</strong> ' + escapeHtml_(report.serviceType || '') + '</td></tr>',
          '<tr><td style="padding:6px 0;"><strong>Appointment ID:</strong> ' + escapeHtml_(report.appointmentId || '') + '</td><td style="padding:6px 0;"><strong>Technician:</strong> ' + escapeHtml_(report.techName || '') + '</td></tr>',
          '<tr><td colspan="2" style="padding:6px 0;"><strong>Service Address:</strong> ' + escapeHtml_(appointment.address || '') + '</td></tr>',
        '</table>',

        '<h2 style="color:#0a1f4e;font-size:16px;border-left:4px solid #1e90d4;padding-left:8px;">Opening Checklist</h2>',
        renderKVTable(opening),

        '<h2 style="color:#0a1f4e;font-size:16px;border-left:4px solid #1e90d4;padding-left:8px;margin-top:16px;">Water Chemistry</h2>',
        renderKVTable(chemistry),

        '<h2 style="color:#0a1f4e;font-size:16px;border-left:4px solid #1e90d4;padding-left:8px;margin-top:16px;">Chemicals Added</h2>',
        '<table style="width:100%;border-collapse:collapse;">',
          '<thead><tr><th style="text-align:left;padding:8px;border-bottom:2px solid #d1d5db;">Chemical</th><th style="text-align:left;padding:8px;border-bottom:2px solid #d1d5db;">Amount</th><th style="text-align:left;padding:8px;border-bottom:2px solid #d1d5db;">Unit</th></tr></thead>',
          '<tbody>' + (chemRows || '<tr><td colspan="3" style="padding:8px;color:#6b7280;">No chemicals recorded.</td></tr>') + '</tbody>',
        '</table>',

        '<h2 style="color:#0a1f4e;font-size:16px;border-left:4px solid #1e90d4;padding-left:8px;margin-top:16px;">Actions Performed</h2>',
        '<p style="margin:6px 0;"><strong>Completed:</strong> ' + escapeHtml_((actions.selected || []).join(', ') || 'None listed') + '</p>',
        '<p style="margin:6px 0;"><strong>Notes:</strong> ' + escapeHtml_(actions.note || '') + '</p>',

        '<h2 style="color:#0a1f4e;font-size:16px;border-left:4px solid #1e90d4;padding-left:8px;margin-top:16px;">Equipment Readings</h2>',
        renderKVTable(equipmentReadings),

        '<h2 style="color:#0a1f4e;font-size:16px;border-left:4px solid #1e90d4;padding-left:8px;margin-top:16px;">Closing Checklist</h2>',
        renderKVTable(closing),

        '<h2 style="color:#0a1f4e;font-size:16px;border-left:4px solid #1e90d4;padding-left:8px;margin-top:16px;">Recommended Options</h2>',
        '<table style="width:100%;border-collapse:collapse;">',
          '<thead><tr><th style="text-align:left;padding:8px;border-bottom:2px solid #d1d5db;">Description</th><th style="text-align:right;padding:8px;border-bottom:2px solid #d1d5db;">Price</th></tr></thead>',
          '<tbody>' + (recRows || '<tr><td colspan="2" style="padding:8px;color:#6b7280;">No recommendations recorded.</td></tr>') + '</tbody>',
        '</table>',

        '<h2 style="color:#0a1f4e;font-size:16px;border-left:4px solid #1e90d4;padding-left:8px;margin-top:16px;">Photo Documentation</h2>',
        '<ul style="margin:6px 0 0 18px;">' + (photoList || '<li>No photos attached.</li>') + '</ul>',

        '<h2 style="color:#0a1f4e;font-size:16px;border-left:4px solid #1e90d4;padding-left:8px;margin-top:16px;">Technician Notes</h2>',
        '<p style="white-space:pre-wrap;margin:6px 0;color:#111827;">' + escapeHtml_(stripSignatureFromNotes_(report.notes || '')) + '</p>',
      '</div>',
    '</div>'
  ].join('');
}

function buildServiceReportDraftText_(report, appointment) {
  const chemistry = report.waterChemistry || {};
  const chemicals = report.chemicalsAdded || [];
  const actions = parseJsonDefensive_(report.actionsPerformed, { selected: [], note: report.actionsPerformed || '' });
  const recs = report.recommendedOptions || [];
  const readings = report.equipmentReadings || {};
  const opening = report.openingChecklist || {};
  const closing = report.closingChecklist || {};
  const photos = normalizeReportPhotos_(report.photos);

  function kv(obj) {
    return Object.keys(obj || {}).map(function(k) {
      return '- ' + k + ': ' + String(obj[k]);
    }).join('\n') || '- None';
  }

  const chemList = chemicals.map(function(c) {
    return '- ' + String(c.name || 'Chemical') + ': ' + String(c.amount || '') + ' ' + String(c.unit || '');
  }).join('\n') || '- None';

  const recList = recs.map(function(r) {
    return '- ' + String(r.description || 'Option') + ' ($' + Number(r.price || 0).toFixed(2) + ')';
  }).join('\n') || '- None';

  return [
    'SERVICE REPORT ' + (report.reportId || ''),
    'Customer: ' + (report.customerName || appointment.customerName || ''),
    'Date: ' + (report.date || ''),
    'Service Type: ' + (report.serviceType || ''),
    'Address: ' + (appointment.address || ''),
    '',
    'OPENING CHECKLIST',
    kv(opening),
    '',
    'WATER CHEMISTRY',
    kv(chemistry),
    '',
    'CHEMICALS ADDED',
    chemList,
    '',
    'ACTIONS PERFORMED',
    '- Completed: ' + ((actions.selected || []).join(', ') || 'None'),
    '- Notes: ' + (actions.note || 'None'),
    '',
    'EQUIPMENT READINGS',
    kv(readings),
    '',
    'CLOSING CHECKLIST',
    kv(closing),
    '',
    'RECOMMENDED OPTIONS',
    recList,
    '',
    'PHOTO COUNT: ' + photos.length,
    '',
    'NOTES',
    stripSignatureFromNotes_(report.notes || '') || 'None'
  ].join('\n');
}

function buildServiceReportTelegramHtml_(report, appointment) {
  const draft = buildServiceReportDraftText_(report, appointment);
  const escaped = (typeof escapeTelegramHtml_ === 'function') ? escapeTelegramHtml_(draft) : escapeHtml_(draft);
  const trimmed = escaped.length > 3500 ? escaped.substring(0, 3497) + '...' : escaped;
  return '<b>Service Report Ready</b>\n' +
    '<b>ID:</b> ' + escapeHtml_(report.reportId || '') + '\n' +
    '<b>Customer:</b> ' + escapeHtml_(report.customerName || '') + '\n' +
    '<b>Date:</b> ' + escapeHtml_(report.date || '') + '\n' +
    '<b>Appointment:</b> ' + escapeHtml_(report.appointmentId || '') + '\n\n' +
    '<b>Draft Text:</b>\n<pre>' + trimmed + '</pre>';
}

function createServiceReportPdfBlob_(report, appointment) {
  try {
    const fileName = 'ServiceReport_' + safeString_(report.reportId || ('SR-' + Date.now())) + '.pdf';
    const html = buildServiceReportPdfHtml_(report, appointment || {});
    const blob = HtmlService.createHtmlOutput(html).getBlob().getAs(MimeType.PDF).setName(fileName);
    return blob;
  } catch (error) {
    Logger.log('createServiceReportPdfBlob_ warning: ' + error.toString());
    return null;
  }
}

function buildServiceReportPdfHtml_(report, appointment) {
  const opening = report.openingChecklist || {};
  const chemistry = report.waterChemistry || {};
  const chemicals = report.chemicalsAdded || [];
  const readings = report.equipmentReadings || {};
  const closing = report.closingChecklist || {};
  const recommendations = report.recommendedOptions || [];
  const actions = parseJsonDefensive_(report.actionsPerformed, { selected: [], note: report.actionsPerformed || '' });
  const logo = getServiceReportLogoDataUrl_();
  const photos = normalizeReportPhotos_(report.photos);

  function kvRows(obj) {
    const keys = Object.keys(obj || {});
    if (!keys.length) {
      return '<tr><td colspan="2" style="padding:10px;color:#718096;">No data submitted.</td></tr>';
    }
    return keys.map(function(k) {
      return '<tr>' +
        '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#2d3748;width:42%;">' + escapeHtml_(k) + '</td>' +
        '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#2d3748;">' + escapeHtml_(String(obj[k])) + '</td>' +
      '</tr>';
    }).join('');
  }

  const chemRows = (chemicals || []).map(function(c) {
    return '<tr>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">' + escapeHtml_(String(c.name || '')) + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">' + escapeHtml_(String(c.amount || '')) + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">' + escapeHtml_(String(c.unit || '')) + '</td>' +
    '</tr>';
  }).join('') || '<tr><td colspan="3" style="padding:10px;color:#718096;">No chemicals recorded.</td></tr>';

  const recRows = (recommendations || []).map(function(r) {
    return '<tr>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">' + escapeHtml_(String(r.description || '')) + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">$' + Number(r.price || 0).toFixed(2) + '</td>' +
    '</tr>';
  }).join('') || '<tr><td colspan="2" style="padding:10px;color:#718096;">No recommendations recorded.</td></tr>';

  const photoBlocks = photos.map(function(p, idx) {
    const dataUrl = photoEntryToDataUrl_(p);
    const title = escapeHtml_(String(p.label || ('Photo ' + (idx + 1))));
    const cap = escapeHtml_(String(p.caption || ''));
    if (!dataUrl) {
      return '<div class="photo-card"><div class="photo-meta"><strong>' + title + '</strong>' + (cap ? '<br>' + cap : '') + '<br><span style="color:#c53030;">(Image unavailable)</span></div></div>';
    }
    return '<div class="photo-card">' +
      '<img src="' + dataUrl + '" alt="Service photo" />' +
      '<div class="photo-meta"><strong>' + title + '</strong>' + (cap ? '<br>' + cap : '') + '</div>' +
    '</div>';
  }).join('') || '<div style="color:#718096;">No photos attached.</div>';

  return [
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
      '<meta charset="UTF-8">',
      '<style>',
        '*{margin:0;padding:0;box-sizing:border-box;}',
        'body{font-family:\'Segoe UI\',Tahoma,Geneva,Verdana,sans-serif;line-height:1.5;color:#333;background:#f8f9fa;padding:20px;}',
        '.invoice-container{max-width:800px;margin:0 auto;background:#fff;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.1);overflow:hidden;}',
        '.header{background:linear-gradient(135deg,#1a365d 0%,#2d5a87 100%);color:#fff;padding:30px;display:flex;justify-content:space-between;align-items:flex-start;}',
        '.company-info{flex:1;}',
        '.company-logo{width:120px;height:60px;background:#fff;border-radius:6px;display:flex;align-items:center;justify-content:center;margin-bottom:15px;overflow:hidden;}',
        '.company-logo img{max-width:100%;max-height:100%;object-fit:contain;display:block;}',
        '.company-name{font-size:24px;font-weight:700;margin-bottom:8px;}',
        '.company-contact{font-size:14px;opacity:.9;line-height:1.6;}',
        '.invoice-details{text-align:right;flex:0 0 240px;}',
        '.invoice-title{font-size:32px;font-weight:700;margin-bottom:10px;}',
        '.invoice-number,.invoice-date{font-size:16px;opacity:.92;}',
        '.content{padding:30px;}',
        '.billing-section{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-bottom:26px;}',
        '.bill-to,.ship-to{background:#f8f9fa;padding:18px;border-radius:8px;}',
        '.section-title{font-size:14px;font-weight:700;color:#1a365d;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;}',
        '.customer-info{font-size:15px;line-height:1.6;}',
        '.block{margin-top:22px;}',
        '.items-header{display:grid;grid-template-columns:2fr 120px 120px;gap:16px;padding:12px 0;border-bottom:2px solid #e2e8f0;font-weight:700;color:#1a365d;font-size:13px;text-transform:uppercase;letter-spacing:.5px;}',
        '.line-item{display:grid;grid-template-columns:2fr 120px 120px;gap:16px;padding:10px 0;border-bottom:1px solid #e2e8f0;align-items:start;font-size:14px;}',
        '.table{width:100%;border-collapse:collapse;font-size:14px;background:#fff;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;}',
        '.notes-section{margin-top:26px;padding-top:22px;border-top:1px solid #e2e8f0;}',
        '.notes-title{font-size:16px;font-weight:700;color:#1a365d;margin-bottom:10px;}',
        '.notes-content{font-size:14px;line-height:1.6;color:#4a5568;white-space:pre-wrap;}',
        '.photo-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:10px;}',
        '.photo-card{border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;background:#fff;}',
        '.photo-card img{width:100%;height:auto;display:block;}',
        '.photo-meta{padding:10px 12px;font-size:12px;color:#4a5568;}',
        '.footer{background:#f8f9fa;padding:20px 30px;text-align:center;font-size:13px;color:#718096;border-top:1px solid #e2e8f0;}',
      '</style>',
    '</head>',
    '<body>',
      '<div class="invoice-container">',
        '<div class="header">',
          '<div class="company-info">',
            '<div class="company-logo">' +
              (logo ? '<img src="' + logo + '" alt="A Quality Pool Company" />' : 'A QUALITY<br>POOL CO.') +
            '</div>',
            '<div class="company-name">A Quality Pool Company</div>',
            '<div class="company-contact">(502) 706-9172<br>brookspumpingpoolco@gmail.com<br>Louisville, KY</div>',
          '</div>',
          '<div class="invoice-details">',
            '<div class="invoice-title">SERVICE REPORT</div>',
            '<div class="invoice-number">' + escapeHtml_(report.reportId || '') + '</div>',
            '<div class="invoice-date">' + escapeHtml_(report.date || '') + '</div>',
          '</div>',
        '</div>',

        '<div class="content">',
          '<div class="billing-section">',
            '<div class="bill-to">',
              '<div class="section-title">Customer</div>',
              '<div class="customer-info">',
                '<strong>' + escapeHtml_(report.customerName || appointment.customerName || '') + '</strong><br>',
                escapeHtml_(appointment.address || '') + '<br>',
                escapeHtml_(appointment.customerEmail || '') + '<br>',
                escapeHtml_(appointment.customerPhone || ''),
              '</div>',
            '</div>',
            '<div class="ship-to">',
              '<div class="section-title">Service Details</div>',
              '<div class="customer-info">',
                '<strong>Appointment:</strong> ' + escapeHtml_(report.appointmentId || '') + '<br>',
                '<strong>Service Type:</strong> ' + escapeHtml_(report.serviceType || '') + '<br>',
                '<strong>Technician:</strong> ' + escapeHtml_(report.techName || '') + '<br>',
                '<strong>Invoice ID:</strong> ' + escapeHtml_(report.invoiceId || ''),
              '</div>',
            '</div>',
          '</div>',

          '<div class="block">',
            '<div class="section-title">Opening Checklist</div>',
            '<table class="table">' + kvRows(opening) + '</table>',
          '</div>',

          '<div class="block">',
            '<div class="section-title">Water Chemistry</div>',
            '<table class="table">' + kvRows(chemistry) + '</table>',
          '</div>',

          '<div class="block">',
            '<div class="section-title">Chemicals Added</div>',
            '<div class="items-header"><div>Chemical</div><div>Amount</div><div>Unit</div></div>',
            chemRows.replace(/<tr>/g, '<div class="line-item">').replace(/<\/tr>/g, '</div>').replace(/<td[^>]*>/g, '<div>').replace(/<\/td>/g, '</div>'),
          '</div>',

          '<div class="notes-section">',
            '<div class="notes-title">Actions Performed</div>',
            '<div class="notes-content"><strong>Completed:</strong> ' + escapeHtml_((actions.selected || []).join(', ') || 'None') + '\n<strong>Notes:</strong> ' + escapeHtml_(actions.note || 'None') + '</div>',
          '</div>',

          '<div class="block">',
            '<div class="section-title">Equipment Readings</div>',
            '<table class="table">' + kvRows(readings) + '</table>',
          '</div>',

          '<div class="block">',
            '<div class="section-title">Closing Checklist</div>',
            '<table class="table">' + kvRows(closing) + '</table>',
          '</div>',

          '<div class="block">',
            '<div class="section-title">Recommended Options</div>',
            '<table class="table">' + recRows + '</table>',
          '</div>',

          '<div class="notes-section">',
            '<div class="notes-title">Technician Notes</div>',
            '<div class="notes-content">' + escapeHtml_(stripSignatureFromNotes_(report.notes || '') || 'None') + '</div>',
          '</div>',

          '<div class="notes-section">',
            '<div class="notes-title">Photo Documentation</div>',
            '<div class="photo-grid">' + photoBlocks + '</div>',
          '</div>',
        '</div>',

        '<div class="footer">',
          'Thank you for choosing A Quality Pool Company for your pool needs!<br>',
          'Questions? Contact us at (502) 706-9172 or brookspumpingpoolco@gmail.com',
        '</div>',
      '</div>',
    '</body>',
    '</html>'
  ].join('');
}

function getServiceReportLogoDataUrl_() {
  try {
    if (typeof getLogoBase64 === 'function') {
      return String(getLogoBase64() || '');
    }
  } catch (_logoFromSharedErr) {}

  const logoUrl = 'https://cdn.prod.website-files.com/6931dc4e8e97334e195432df/6993ce0abcd54d3520799318_IMG_1763-p-500.jpg';
  try {
    const resp = UrlFetchApp.fetch(logoUrl, { muteHttpExceptions: true });
    if (resp.getResponseCode() >= 200 && resp.getResponseCode() < 300) {
      const blob = resp.getBlob();
      return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
    }
  } catch (_logoFetchErr) {}
  return logoUrl;
}

function photoEntryToDataUrl_(photo) {
  try {
    if (!photo) return '';
    if (photo.data && /^data:image\//i.test(String(photo.data))) {
      return String(photo.data);
    }
    const blob = photoEntryToBlob_(photo);
    if (!blob) return '';
    return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
  } catch (_err) {
    return '';
  }
}

function appendPdfJsonSection_(body, title, obj) {
  body.appendParagraph(title).setHeading(DocumentApp.ParagraphHeading.HEADING3);
  const data = obj || {};
  const keys = Object.keys(data);
  if (!keys.length) {
    body.appendParagraph('No data submitted.');
    body.appendParagraph('');
    return;
  }
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    body.appendParagraph('- ' + k + ': ' + String(data[k]));
  }
  body.appendParagraph('');
}

function appendPdfChemicalsSection_(body, chemicals) {
  body.appendParagraph('Chemicals Added').setHeading(DocumentApp.ParagraphHeading.HEADING3);
  if (!chemicals || !chemicals.length) {
    body.appendParagraph('No chemicals recorded.');
    body.appendParagraph('');
    return;
  }
  for (let i = 0; i < chemicals.length; i++) {
    const c = chemicals[i] || {};
    body.appendParagraph('- ' + safeString_(c.name) + ': ' + safeString_(c.amount) + ' ' + safeString_(c.unit));
  }
  body.appendParagraph('');
}

function appendPdfActionsSection_(body, actionsPerformed) {
  body.appendParagraph('Actions Performed').setHeading(DocumentApp.ParagraphHeading.HEADING3);
  const data = parseJsonDefensive_(actionsPerformed, { selected: [], note: actionsPerformed || '' });
  body.appendParagraph('Completed: ' + ((data.selected || []).join(', ') || 'None'));
  body.appendParagraph('Notes: ' + (data.note || 'None'));
  body.appendParagraph('');
}

function appendPdfRecommendationsSection_(body, recs) {
  body.appendParagraph('Recommended Options').setHeading(DocumentApp.ParagraphHeading.HEADING3);
  if (!recs || !recs.length) {
    body.appendParagraph('No recommendations recorded.');
    body.appendParagraph('');
    return;
  }
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i] || {};
    body.appendParagraph('- ' + safeString_(r.description) + ' ($' + Number(r.price || 0).toFixed(2) + ')');
  }
  body.appendParagraph('');
}

function normalizeReportPhotos_(photosRaw) {
  const photos = parseJsonDefensive_(photosRaw, []);
  if (!Array.isArray(photos)) return [];
  return photos.filter(function(p) { return p && typeof p === 'object'; });
}

function photoEntryToBlob_(photo) {
  try {
    if (!photo) return null;

    if (photo.data && /^data:image\//i.test(String(photo.data))) {
      const m = String(photo.data).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (m && m[2]) {
        const bytes = Utilities.base64Decode(m[2]);
        const blob = Utilities.newBlob(bytes, m[1], safeString_(photo.caption || photo.label || 'photo'));
        return blob;
      }
    }

    if (photo.driveFileId) {
      return DriveApp.getFileById(String(photo.driveFileId)).getBlob();
    }

    if (photo.url && /^https?:\/\//i.test(String(photo.url))) {
      const resp = UrlFetchApp.fetch(String(photo.url), { muteHttpExceptions: true });
      if (resp.getResponseCode() >= 200 && resp.getResponseCode() < 300) {
        return resp.getBlob();
      }
    }
  } catch (error) {
    Logger.log('photoEntryToBlob_ warning: ' + error.toString());
  }
  return null;
}

function stripSignatureFromNotes_(notes) {
  return String(notes || '').replace(/\n\nSignature:[\s\S]*$/m, '').trim();
}

function sendTelegramMessageFallback_(htmlText) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('SR_TELEGRAM_BOT_TOKEN') || '';
  const chatId = props.getProperty('SR_TELEGRAM_CHAT_ID') || '';
  if (!token || !chatId) {
    return { success: false, error: 'Telegram fallback missing SR_TELEGRAM_BOT_TOKEN or SR_TELEGRAM_CHAT_ID script property' };
  }

  const url = 'https://api.telegram.org/bot' + token + '/sendMessage';
  const resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    payload: JSON.stringify({
      chat_id: String(chatId),
      text: String(htmlText || ''),
      parse_mode: 'HTML',
      disable_web_page_preview: false
    })
  });

  const status = resp.getResponseCode();
  const body = resp.getContentText() || '';
  if (status >= 200 && status < 300) return { success: true };
  return { success: false, error: 'Telegram HTTP ' + status + ': ' + body };
}

function escapeHtml_(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

  // ========================================
  // SERVICE REPORTS API INTEGRATION
  // ========================================

  function getServiceReportsAPI(customerId, email) {
    try {
      const ss = SpreadsheetApp.openById(SR_WEBAPP_SPREADSHEET_ID);
      let sheet = ss.getSheetByName(SR_SERVICE_REPORTS_SHEET);
    
      if (!sheet) {
        return { success: true, reports: [], summary: { total: 0, completed: 0, draft: 0, sent: 0 } };
      }
    
      const data = sheet.getDataRange().getValues();
      const reports = [];
      const summary = { total: 0, completed: 0, draft: 0, sent: 0 };
    
      if (data.length > 1) {
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          if (row[2] === customerId || row[0] === customerId) {
            const report = {
              id: row[0],
              customerId: row[2],
              customerName: row[3],
              date: row[4],
              time: row[5],
              technician: row[6],
              workPerformed: row[7],
              poolCondition: row[8],
              notes: row[9],
              chemicals: safeJSON_(row[10], []),
              photos: safeJSON_(row[11], []),
              status: row[12],
              rowIndex: i + 1
            };
            reports.push(report);
            summary.total++;
            if (report.status === 'Completed') summary.completed++;
            if (report.status === 'Sent') summary.sent++;
          }
        }
      }
    
      reports.sort((a, b) => new Date(b.date) - new Date(a.date));
    
      return {
        success: true,
        reports: reports,
        summary: summary
      };
    } catch (error) {
      Logger.log('Error getting service reports: ' + error.toString());
      return {
        success: false,
        reports: [],
        summary: { total: 0, completed: 0, draft: 0, sent: 0 },
        error: error.toString()
      };
    }
  }

  function saveServiceReportAPI(data) {
    try {
      const ss = SpreadsheetApp.openById(SR_WEBAPP_SPREADSHEET_ID);
      let sheet = ss.getSheetByName(SR_SERVICE_REPORTS_SHEET);
    
      if (!sheet) {
        return { success: false, error: 'Service Reports sheet not found' };
      }
    
      const reportId = 'SR-' + new Date().getTime();
      const newRow = [
        reportId,
        data.appointmentId || '',
        data.customerId || '',
        data.customerName || '',
        data.reportDate || new Date().toISOString().split('T')[0],
        data.reportTime || '',
        data.technicianName || '',
        data.workPerformed || '',
        data.poolCondition || '',
        data.notes || '',
        JSON.stringify(data.chemicals || []),
        JSON.stringify(data.photos || []),
        'Completed',
        new Date().toISOString(),
        ''
      ];
    
      sheet.appendRow(newRow);
    
      Logger.log('Service report saved: ' + reportId);
    
      return {
        success: true,
        reportId: reportId,
        message: 'Service report saved successfully'
      };
    } catch (error) {
      Logger.log('Error saving service report: ' + error.toString());
      return {
        success: false,
        error: error.toString()
      };
    }
  }

  function sendServiceReportAPI(reportId, customerEmail) {
    try {
      if (!customerEmail) {
        return { success: false, error: 'Customer email required' };
      }
    
      const ss = SpreadsheetApp.openById(SR_WEBAPP_SPREADSHEET_ID);
      let sheet = ss.getSheetByName(SR_SERVICE_REPORTS_SHEET);
    
      if (!sheet) {
        return { success: false, error: 'Service Reports sheet not found' };
      }
    
      const data = sheet.getDataRange().getValues();
      let report = null;
      let rowIndex = -1;
    
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === reportId) {
          report = {
            id: data[i][0],
            customerName: data[i][3],
            date: data[i][4],
            time: data[i][5],
            technician: data[i][6],
            workPerformed: data[i][7],
            poolCondition: data[i][8],
            notes: data[i][9],
            chemicals: safeJSON_(data[i][10], []),
            photos: safeJSON_(data[i][11], [])
          };
          rowIndex = i + 1;
          break;
        }
      }
    
      if (!report) {
        return { success: false, error: 'Service report not found' };
      }
    
      // Generate email
      const emailHtml = generateServiceReportEmailHTML(report);
    
      // Send email
      GmailApp.sendEmail(
        customerEmail,
        '🏊 Service Report - ' + formatDateForEmail_(report.date),
        '',
        {
          htmlBody: emailHtml,
          replyTo: 'support@poolservice.local'
        }
      );
    
      // Update sheet
      if (rowIndex > 0) {
        sheet.getRange(rowIndex, 13).setValue('Sent');
        sheet.getRange(rowIndex, 14).setValue(new Date().toISOString());
        sheet.getRange(rowIndex, 15).setValue(customerEmail);
      }
    
      Logger.log('Service report sent to: ' + customerEmail);
    
      return {
        success: true,
        message: 'Service report sent successfully'
      };
    } catch (error) {
      Logger.log('Error sending service report: ' + error.toString());
      return {
        success: false,
        error: error.toString()
      };
    }
  }

  function generateServiceReportEmailHTML(report) {
    const chemicalTable = report.chemicals && report.chemicals.length > 0
      ? report.chemicals.map(c => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e0e0e0;">${escapeHtml_(c.name)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e0e0e0; text-align: center;">${escapeHtml_(c.amount)} ppm</td>
          <td style="padding: 8px; border-bottom: 1px solid #e0e0e0;">${escapeHtml_(c.notes)}</td>
        </tr>
      `).join('')
      : '<tr><td colspan="3" style="padding: 8px; text-align: center; color: #999;">No chemicals recorded</td></tr>';
  
    return `
      <div style="font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="background: linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%); color: white; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="margin: 0; font-size: 28px; font-weight: 800;">🏊 Service Report</h1>
          <p style="margin: 8px 0 0 0; opacity: 0.9;">Completed on ${formatDateForEmail_(report.date)}</p>
        </div>
        <div style="background: white; padding: 24px; border-left: 4px solid #06b6d4;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
            <div>
              <p style="margin: 0 0 4px 0; color: #999; font-size: 12px; font-weight: 600; text-transform: uppercase;">Service Date</p>
              <p style="margin: 0; font-size: 16px; font-weight: 600;">${formatDateForEmail_(report.date)}</p>
            </div>
            <div>
              <p style="margin: 0 0 4px 0; color: #999; font-size: 12px; font-weight: 600; text-transform: uppercase;">Technician</p>
              <p style="margin: 0; font-size: 16px; font-weight: 600;">${escapeHtml_(report.technician || 'Service Team')}</p>
            </div>
          </div>
          <h3 style="margin: 24px 0 12px 0; color: #333; font-size: 16px; font-weight: 700;">Work Performed</h3>
          <p style="margin: 0; color: #555; line-height: 1.6; white-space: pre-wrap;">${escapeHtml_(report.workPerformed)}</p>
          <h3 style="margin: 24px 0 12px 0; color: #333; font-size: 16px; font-weight: 700;">🧪 Chemicals Applied</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
            <thead>
              <tr style="background: #f5f5f5;">
                <th style="padding: 8px; text-align: left; font-weight: 600;">Chemical</th>
                <th style="padding: 8px; text-align: center; font-weight: 600;">Amount</th>
                <th style="padding: 8px; text-align: left; font-weight: 600;">Notes</th>
              </tr>
            </thead>
            <tbody>
              ${chemicalTable}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function formatDateForEmail_(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  function safeJSON_(val, fallback) {
    try {
      return typeof val === 'string' ? JSON.parse(val) : val;
    } catch (e) {
      return fallback;
    }
  }

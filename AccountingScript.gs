/**
 * AccountingScript.gs
 * Standalone Google Apps Script Web App for Accounting
 * Deploy separately from InvoiceEstimate.gs
 *
 * Sheets used (all in SPREADSHEET_ID):
 *   Accounts        — company bank/card account balances
 *   Purchase_Orders — project purchase orders with receipt upload
 *   Owner_Draw      — owner pay draws
 *   Forecast_Items  — manual forecast projections
 *   PM_Expenses     — shared with InvoiceEstimate; expenses written here
 *   Payment History — read-only; used for YTD revenue
 *
 * Deploy: Execute as Me, Anyone with access (or Anyone)
 */

// ── Config ──────────────────────────────────────────────────────────────────
const SPREADSHEET_ID        = '1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0';
const CUSTOMER_DRIVE_FOLDER = '1caFBUhSzE5WNAm9vCT4dwDQuAO0iuo1h';
const DEFAULT_COMPANY_ID    = 'CMP-AQUALITYPOOL';

// Sheet names
const ACCT_ACCOUNTS_SHEET   = 'Accounts';
const ACCT_PO_SHEET         = 'Purchase_Orders';
const ACCT_DRAW_SHEET       = 'Owner_Draw';
const ACCT_FORECAST_SHEET   = 'Forecast_Items';
const ACCT_EXPENSES_SHEET   = 'PM_Expenses';
const ACCT_PAYMENT_SHEET    = 'Payment History';

// ── CORS helper ──────────────────────────────────────────────────────────────
function corsOutput(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── doGet ────────────────────────────────────────────────────────────────────
function doGet(e) {
  try {
    const action    = e.parameter.action || '';
    const companyId = e.parameter.companyId || DEFAULT_COMPANY_ID;

    switch (action) {
      case 'getAccounts':
        return corsOutput(getAccounts(companyId));
      case 'getPurchaseOrders':
        return corsOutput(getPurchaseOrders(companyId, e.parameter.projectId || '', e.parameter.status || ''));
      case 'getPurchaseOrdersForProject':
        return corsOutput(getPurchaseOrders(companyId, e.parameter.projectId || '', ''));
      case 'getOwnerDraws':
        return corsOutput(getOwnerDraws(companyId));
      case 'getForecastItems':
        return corsOutput(getForecastItems(companyId, e.parameter.year || ''));
      case 'getExpenses':
        return corsOutput(getExpenses(companyId, e.parameter.projectId || '', e.parameter.category || ''));
      case 'getDashboard':
        return corsOutput(getDashboard(companyId));
      case 'getCompanyIds':
        return corsOutput(getCompanyIds());
      case 'getBankTransactions':
        return corsOutput(getBankTransactions(companyId, e.parameter.startDate || '', e.parameter.endDate || '', e.parameter.status || ''));
      case 'getLastImportDate':
        return corsOutput(getLastImportDate(companyId));
      case 'getReminders':
        return corsOutput(getReminders(companyId));
      case 'getRecurringExpenses':
        return corsOutput(getRecurringExpenses(companyId));
      case 'getShoppingList':
        return corsOutput(getShoppingList(companyId));
      case 'getWeekForecast':
        return corsOutput(getWeekForecast(companyId));
      case 'setup':
        setupAllSheets();
        return corsOutput({ success: true, message: 'All accounting sheets created.' });
      case 'setupTriggers':
        setupDailyTrigger();
        return corsOutput({ success: true, message: 'Daily trigger created.' });
      default:
        return corsOutput({ success: false, error: 'Unknown action: ' + action });
    }
  } catch (err) {
    Logger.log('doGet error: ' + err.toString());
    return corsOutput({ success: false, error: err.toString() });
  }
}

// ── doPost ───────────────────────────────────────────────────────────────────
// Reads exclusively from e.parameter because the frontend sends
// application/x-www-form-urlencoded (URLSearchParams) to avoid CORS preflight.
function doPost(e) {
  try {
    // Primary source: e.parameter (URL-encoded form body)
    const body      = e.parameter || {};
    const action    = body.action    || '';
    const companyId = body.companyId || DEFAULT_COMPANY_ID;
    let result;

    switch (action) {
      case 'upsertAccount':
        result = upsertAccount(companyId, body);
        break;
      case 'createPurchaseOrder':
        result = createPurchaseOrder(companyId, body);
        break;
      case 'updatePurchaseOrder':
        result = updatePurchaseOrder(companyId, body);
        break;
      case 'uploadReceipt':
        result = uploadReceipt(companyId, body);
        break;
      case 'deletePurchaseOrder':
        result = deletePurchaseOrder(companyId, body.poId);
        break;
      case 'addOwnerDraw':
        result = addOwnerDraw(companyId, body);
        break;
      case 'deleteOwnerDraw':
        result = deleteOwnerDraw(companyId, body.drawId);
        break;
      case 'upsertForecastItem':
        result = upsertForecastItem(companyId, body);
        break;
      case 'deleteForecastItem':
        result = deleteForecastItem(companyId, body.itemId);
        break;
      case 'markForecastPosted':
        result = upsertForecastItem(companyId, { ...body, status: 'Posted' });
        break;
      case 'markForecastCancelled':
        result = upsertForecastItem(companyId, { ...body, status: 'Cancelled' });
        break;
      case 'addExpense':
        result = addExpenseEntry(companyId, body);
        break;
      case 'updateExpense':
        result = updateExpenseEntry(companyId, body);
        break;
      case 'deleteExpense':
        result = deleteExpenseEntry(companyId, body.expenseId);
        break;
      case 'importBankTransactions':
        result = importBankTransactions(companyId, body);
        break;
      case 'updateBankTransaction':
        result = updateBankTransaction(companyId, body);
        break;
      case 'deleteBankTransaction':
        result = deleteBankTransaction(companyId, body.txnId);
        break;
      case 'addReminder':
        result = addReminder(companyId, body);
        break;
      case 'updateReminder':
        result = updateReminder(companyId, body);
        break;
      case 'deleteReminder':
        result = deleteReminder(companyId, body.reminderId);
        break;
      case 'upsertRecurringExpense':
        result = upsertRecurringExpense(companyId, body);
        break;
      case 'deleteRecurringExpense':
        result = deleteRecurringExpense(companyId, body.recurId);
        break;
      case 'upsertShoppingItem':
        result = upsertShoppingItem(companyId, body);
        break;
      case 'deleteShoppingItem':
        result = deleteShoppingItem(companyId, body.itemId);
        break;
      case 'markShoppingItemOrdered':
        result = markShoppingItemOrdered(companyId, body.itemId);
        break;
      default:
        result = { success: false, error: 'Unknown action: ' + action };
    }

    return corsOutput(result);
  } catch (err) {
    Logger.log('doPost error: ' + err.toString());
    return corsOutput({ success: false, error: err.toString() });
  }
}

// ============================================================================
// SHEET SETUP
// ============================================================================

const ACCT_BANK_SHEET       = 'Bank_Transactions';
const ACCT_REMINDERS_SHEET  = 'Reminders';
const ACCT_RECURRING_SHEET  = 'Recurring_Expenses';
const ACCT_SHOPPING_SHEET   = 'Shopping_List';
const NOTIFY_EMAIL          = 'brookspumpingpoolco@gmail.com';

function setupAllSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  setupAccountsSheet(ss);
  setupPOSheet(ss);
  setupDrawSheet(ss);
  setupForecastSheet(ss);
  setupExpensesSheetIfMissing(ss);
  setupBankSheet(ss);
  setupRemindersSheet(ss);
  setupRecurringSheet(ss);
  setupShoppingSheet(ss);
}

function ensureSheet(ss, name, headers, formatRow1) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    if (formatRow1 !== false) {
      const hdr = sheet.getRange(1, 1, 1, headers.length);
      hdr.setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#3b82f6');
      sheet.setFrozenRows(1);
    }
    Logger.log('Created sheet: ' + name);
  }
  return sheet;
}

function setupAccountsSheet(ss) {
  ensureSheet(ss, ACCT_ACCOUNTS_SHEET, [
    'Company ID', 'Account ID', 'Account Name', 'Account Type',
    'Current Balance', 'Last Updated', 'Notes'
  ]);
}

function setupPOSheet(ss) {
  ensureSheet(ss, ACCT_PO_SHEET, [
    'Company ID', 'PO ID', 'Project ID', 'Invoice ID', 'Vendor', 'Description',
    'Est. Amount', 'Status', 'Reference #', 'Receipt URL', 'Drive File ID',
    'Order Date', 'Received Date', 'Expense ID', 'Notes', 'Created Date'
  ]);
}

function setupDrawSheet(ss) {
  ensureSheet(ss, ACCT_DRAW_SHEET, [
    'Company ID', 'Draw ID', 'Date', 'Amount', 'Account Paid From', 'Notes'
  ]);
}

function setupForecastSheet(ss) {
  ensureSheet(ss, ACCT_FORECAST_SHEET, [
    'Company ID', 'Item ID', 'Month', 'Year', 'Type', 'Description', 'Amount', 'Category', 'Notes',
    'Status', 'Expected Date', 'Source Type', 'Source ID', 'Created Date'
  ]);
}

function setupExpensesSheetIfMissing(ss) {
  ensureSheet(ss, ACCT_EXPENSES_SHEET, [
    'Expense ID', 'Project ID', 'Date', 'Category', 'Description',
    'Amount', 'Paid From Account', 'Receipt/Notes JSON',
    'Company ID', 'Invoice ID', 'Worker Name', 'Hours', 'Hourly Rate'
  ]);
}

// ============================================================================
// ACCOUNTS
// ============================================================================

function getAccounts(companyId) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ACCT_ACCOUNTS_SHEET);
    if (!sheet) { setupAccountsSheet(ss); return { success: true, accounts: [] }; }

    const data     = sheet.getDataRange().getValues();
    const accounts = [];
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim() !== String(companyId).trim()) continue;
      accounts.push({
        companyId:      data[i][0],
        accountId:      data[i][1],
        accountName:    data[i][2],
        accountType:    data[i][3],
        currentBalance: parseFloat(data[i][4] || 0),
        lastUpdated:    data[i][5] ? new Date(data[i][5]).toISOString() : '',
        notes:          data[i][6] || ''
      });
    }
    return { success: true, accounts: accounts };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function upsertAccount(companyId, data) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet   = ss.getSheetByName(ACCT_ACCOUNTS_SHEET);
    if (!sheet) { setupAccountsSheet(ss); sheet = ss.getSheetByName(ACCT_ACCOUNTS_SHEET); }

    const rows      = sheet.getDataRange().getValues();
    const accountId = data.accountId || ('ACCT-' + new Date().getTime());
    const now       = new Date();
    const rowData   = [
      companyId, accountId,
      data.accountName || 'Unnamed Account',
      data.accountType || 'Checking',
      parseFloat(data.currentBalance || 0),
      now,
      data.notes || ''
    ];

    // Try to find existing row
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === String(companyId).trim() &&
          String(rows[i][1]).trim() === String(accountId).trim()) {
        sheet.getRange(i + 1, 1, 1, rowData.length).setValues([rowData]);
        return { success: true, accountId: accountId, updated: true };
      }
    }
    // New row
    sheet.appendRow(rowData);
    return { success: true, accountId: accountId, created: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ============================================================================
// PURCHASE ORDERS
// ============================================================================

function getPurchaseOrders(companyId, projectId, statusFilter) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ACCT_PO_SHEET);
    if (!sheet) { setupPOSheet(ss); return { success: true, orders: [] }; }

    const data   = sheet.getDataRange().getValues();
    const orders = [];
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim() !== String(companyId).trim()) continue;
      if (projectId && String(data[i][2] || '').trim() !== String(projectId).trim()) continue;
      if (statusFilter && String(data[i][7] || '').trim() !== String(statusFilter).trim()) continue;
      orders.push({
        companyId:    data[i][0],
        poId:         data[i][1],
        projectId:    data[i][2] || '',
        invoiceId:    data[i][3] || '',
        vendor:       data[i][4] || '',
        description:  data[i][5] || '',
        estAmount:    parseFloat(data[i][6] || 0),
        status:       data[i][7] || 'Pending',
        referenceNum: data[i][8] || '',
        receiptUrl:   data[i][9] || '',
        driveFileId:  data[i][10] || '',
        orderDate:    data[i][11] ? new Date(data[i][11]).toISOString() : '',
        receivedDate: data[i][12] ? new Date(data[i][12]).toISOString() : '',
        expenseId:    data[i][13] || '',
        notes:        data[i][14] || '',
        createdDate:  data[i][15] ? new Date(data[i][15]).toISOString() : ''
      });
    }
    return { success: true, orders: orders };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function createPurchaseOrder(companyId, data) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet   = ss.getSheetByName(ACCT_PO_SHEET);
    if (!sheet) { setupPOSheet(ss); sheet = ss.getSheetByName(ACCT_PO_SHEET); }

    const poId = 'PO-' + new Date().getTime();
    const now  = new Date();
    sheet.appendRow([
      companyId, poId,
      data.projectId  || '',
      data.invoiceId  || '',
      data.vendor     || '',
      data.description || '',
      parseFloat(data.estAmount || 0),
      'Pending',
      data.referenceNum || '',
      '',   // receipt URL (empty until ordered/received)
      '',   // Drive file ID
      data.orderDate ? new Date(data.orderDate) : '',
      '',   // received date
      '',   // expense ID
      data.notes || '',
      now
    ]);
    return { success: true, poId: poId };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function updatePurchaseOrder(companyId, data) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ACCT_PO_SHEET);
    if (!sheet) return { success: false, error: 'Purchase_Orders sheet not found' };

    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() !== String(companyId).trim()) continue;
      if (String(rows[i][1]).trim() !== String(data.poId).trim()) continue;

      const updated = [...rows[i]];
      if (data.vendor        !== undefined) updated[4]  = data.vendor;
      if (data.description   !== undefined) updated[5]  = data.description;
      if (data.estAmount     !== undefined) updated[6]  = parseFloat(data.estAmount);
      if (data.status        !== undefined) updated[7]  = data.status;
      if (data.referenceNum  !== undefined) updated[8]  = data.referenceNum;
      if (data.receiptUrl    !== undefined) updated[9]  = data.receiptUrl;
      if (data.driveFileId   !== undefined) updated[10] = data.driveFileId;
      if (data.orderDate     !== undefined) updated[11] = data.orderDate ? new Date(data.orderDate) : '';
      if (data.receivedDate  !== undefined) updated[12] = data.receivedDate ? new Date(data.receivedDate) : '';
      if (data.expenseId     !== undefined) updated[13] = data.expenseId;
      if (data.notes         !== undefined) updated[14] = data.notes;

      sheet.getRange(i + 1, 1, 1, updated.length).setValues([updated]);
      return { success: true };
    }
    return { success: false, error: 'PO not found: ' + data.poId };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function deletePurchaseOrder(companyId, poId) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ACCT_PO_SHEET);
    if (!sheet) return { success: false, error: 'Sheet not found' };
    const rows = sheet.getDataRange().getValues();
    for (let i = rows.length - 1; i >= 1; i--) {
      if (String(rows[i][0]).trim() === String(companyId).trim() &&
          String(rows[i][1]).trim() === String(poId).trim()) {
        sheet.deleteRow(i + 1);
        return { success: true };
      }
    }
    return { success: false, error: 'PO not found' };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ============================================================================
// RECEIPT UPLOAD — saves to customer Drive folder, auto-creates expense
// ============================================================================

function uploadReceipt(companyId, data) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ACCT_PO_SHEET);
    if (!sheet) return { success: false, error: 'Purchase_Orders sheet not found' };

    // Locate the PO row to get project link and vendor
    const rows = sheet.getDataRange().getValues();
    let poRow  = null;
    let poRowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === String(companyId).trim() &&
          String(rows[i][1]).trim() === String(data.poId).trim()) {
        poRow      = rows[i];
        poRowIndex = i + 1;
        break;
      }
    }
    if (!poRow) return { success: false, error: 'PO not found: ' + data.poId };

    const projectId = String(poRow[2] || '').trim();
    const vendor    = String(poRow[4] || 'Vendor').trim();
    const poDesc    = String(poRow[5] || '').trim();

    // ── Resolve Drive folder ──────────────────────────────────────────────
    const parentFolder = DriveApp.getFolderById(CUSTOMER_DRIVE_FOLDER);
    let   targetFolder;

    if (projectId) {
      // Try to find customer folder by project
      const customerName    = resolveCustomerNameForProject(ss, projectId);
      const customerAddress = resolveCustomerAddressForProject(ss, projectId);
      const folderName      = customerName
        ? (customerAddress ? customerName + ' - ' + customerAddress : customerName)
        : ('Project-' + projectId);

      const folderIter = parentFolder.getFoldersByName(folderName);
      targetFolder = folderIter.hasNext() ? folderIter.next() : parentFolder.createFolder(folderName);
    } else {
      // No project — use a Receipts/YYYY-MM subfolder
      const ym     = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
      const rLabel = 'Receipts/' + ym;
      const rIter  = parentFolder.getFoldersByName(rLabel);
      targetFolder = rIter.hasNext() ? rIter.next() : parentFolder.createFolder(rLabel);
    }

    // ── Upload file ───────────────────────────────────────────────────────
    const safeFileName = data.fileName || ('Receipt_' + data.poId + '_' + new Date().toISOString().substring(0, 10) + '.pdf');
    const blob         = Utilities.newBlob(Utilities.base64Decode(data.fileData), data.mimeType || 'application/pdf', safeFileName);
    const uploaded     = targetFolder.createFile(blob);
    uploaded.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const receiptUrl   = uploaded.getUrl();
    const driveFileId  = uploaded.getId();

    // ── Auto-create expense in PM_Expenses ───────────────────────────────
    const expenseId = 'EXP-' + new Date().getTime();
    const receiptJson = JSON.stringify({
      receiptUrl:    receiptUrl,
      notes:         data.notes || '',
      vendor:        vendor,
      invoiceNumber: data.referenceNum || String(poRow[8] || ''),
      poId:          data.poId,
      driveFileId:   driveFileId
    });
    const expRow = [
      expenseId,
      projectId || '',
      new Date(),
      data.category || 'Parts & Materials',
      poDesc || ('PO: ' + vendor),
      parseFloat(data.actualAmount || poRow[6] || 0),
      data.paidFromAccount || '',
      receiptJson,
      companyId,
      String(poRow[3] || ''),   // invoice ID
      '',  // worker name (labor only)
      '',  // hours
      ''   // hourly rate
    ];
    const expSheet = ss.getSheetByName(ACCT_EXPENSES_SHEET);
    if (expSheet) {
      expSheet.appendRow(expRow);
    } else {
      setupExpensesSheetIfMissing(ss);
      ss.getSheetByName(ACCT_EXPENSES_SHEET).appendRow(expRow);
    }

    // ── Update PO row ─────────────────────────────────────────────────────
    const updatedPO = [...poRow];
    updatedPO[7]  = 'Received';
    updatedPO[9]  = receiptUrl;
    updatedPO[10] = driveFileId;
    updatedPO[12] = new Date();
    updatedPO[13] = expenseId;
    if (data.referenceNum) updatedPO[8] = data.referenceNum;
    sheet.getRange(poRowIndex, 1, 1, updatedPO.length).setValues([updatedPO]);

    return {
      success:    true,
      receiptUrl: receiptUrl,
      expenseId:  expenseId,
      driveFileId: driveFileId
    };
  } catch (e) {
    Logger.log('uploadReceipt error: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

// ── Helpers to resolve customer name/address from PM_Projects ───────────────
function resolveCustomerNameForProject(ss, projectId) {
  try {
    const sheet = ss.getSheetByName('PM_Projects');
    if (!sheet) return '';
    const data    = sheet.getDataRange().getValues();
    const headers = data[0] || [];
    const hasCmp  = String(headers[0]).trim() === 'Company ID';
    const idCol   = hasCmp ? 1 : 0;
    const j1Col   = hasCmp ? 3 : 2;
    const j2Col   = hasCmp ? 4 : 3;
    const j3Col   = hasCmp ? 5 : 4;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idCol] || '').trim() !== String(projectId).trim()) continue;
      const json = JSON.parse((data[i][j1Col] || '') + (data[i][j2Col] || '') + (data[i][j3Col] || '') || '{}');
      return json.customerName || '';
    }
  } catch (_) {}
  return '';
}

function resolveCustomerAddressForProject(ss, projectId) {
  try {
    const sheet = ss.getSheetByName('PM_Projects');
    if (!sheet) return '';
    const data    = sheet.getDataRange().getValues();
    const headers = data[0] || [];
    const hasCmp  = String(headers[0]).trim() === 'Company ID';
    const idCol   = hasCmp ? 1 : 0;
    const j1Col   = hasCmp ? 3 : 2;
    const j2Col   = hasCmp ? 4 : 3;
    const j3Col   = hasCmp ? 5 : 4;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idCol] || '').trim() !== String(projectId).trim()) continue;
      const json = JSON.parse((data[i][j1Col] || '') + (data[i][j2Col] || '') + (data[i][j3Col] || '') || '{}');
      return json.customerAddress || '';
    }
  } catch (_) {}
  return '';
}

// ============================================================================
// EXPENSES (Accounting view — reads/writes PM_Expenses, company-filtered)
// ============================================================================

function getExpenses(companyId, projectId, category) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ACCT_EXPENSES_SHEET);
    if (!sheet) return { success: true, expenses: [], total: 0 };

    const data     = sheet.getDataRange().getValues();
    const expenses = [];
    let   total    = 0;

    for (let i = 1; i < data.length; i++) {
      // Column 8 (index 8) = Company ID (new column added by accounting)
      // Rows from the old ProjectManagement.gs won't have companyId — include them if companyId matches default
      const rowCompany = String(data[i][8] || DEFAULT_COMPANY_ID).trim();
      if (rowCompany !== String(companyId).trim()) continue;
      if (projectId && String(data[i][1] || '').trim() !== String(projectId).trim()) continue;
      if (category  && String(data[i][3] || '').trim().toLowerCase() !== String(category).trim().toLowerCase()) continue;

      let receiptData = {};
      try {
        if (data[i][7] && String(data[i][7]).trim()) receiptData = JSON.parse(data[i][7]);
      } catch (_) {}

      expenses.push({
        expenseId:      data[i][0],
        projectId:      data[i][1] || '',
        date:           data[i][2] ? new Date(data[i][2]).toISOString() : '',
        category:       data[i][3] || '',
        description:    data[i][4] || '',
        amount:         parseFloat(data[i][5] || 0),
        paidFromAccount: data[i][6] || '',
        receiptData:    receiptData,
        companyId:      rowCompany,
        invoiceId:      data[i][9]  || '',
        workerName:     data[i][10] || '',
        hours:          data[i][11] ? parseFloat(data[i][11]) : null,
        hourlyRate:     data[i][12] ? parseFloat(data[i][12]) : null
      });
      total += parseFloat(data[i][5] || 0);
    }
    return { success: true, expenses: expenses, total: total };
  } catch (e) {
    return { success: false, error: e.toString(), expenses: [], total: 0 };
  }
}

function addExpenseEntry(companyId, data) {
  try {
    const ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
    let   sheet   = ss.getSheetByName(ACCT_EXPENSES_SHEET);
    if (!sheet) { setupExpensesSheetIfMissing(ss); sheet = ss.getSheetByName(ACCT_EXPENSES_SHEET); }

    const expenseId   = 'EXP-' + new Date().getTime();
    const receiptJson = JSON.stringify({
      receiptUrl:    data.receiptUrl    || '',
      notes:         data.notes         || '',
      vendor:        data.vendor        || '',
      invoiceNumber: data.invoiceNumber || ''
    });

    // Compute amount: for labor, amount = hours * hourlyRate if not provided directly
    let amount = parseFloat(data.amount || 0);
    const hours      = data.hours      ? parseFloat(data.hours)      : null;
    const hourlyRate = data.hourlyRate ? parseFloat(data.hourlyRate) : null;
    if (!amount && hours && hourlyRate) amount = hours * hourlyRate;

    sheet.appendRow([
      expenseId,
      data.projectId  || '',
      data.date ? new Date(data.date) : new Date(),
      data.category   || 'General',
      data.description || '',
      amount,
      data.paidFromAccount || '',
      receiptJson,
      companyId,
      data.invoiceId  || '',
      data.workerName || '',
      hours            || '',
      hourlyRate       || ''
    ]);
    return { success: true, expenseId: expenseId };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function updateExpenseEntry(companyId, data) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ACCT_EXPENSES_SHEET);
    if (!sheet) return { success: false, error: 'Expenses sheet not found' };
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() !== String(data.expenseId).trim()) continue;
      const updated = [...rows[i]];
      if (data.projectId       !== undefined) updated[1]  = data.projectId;
      if (data.date            !== undefined) updated[2]  = data.date ? new Date(data.date) : '';
      if (data.category        !== undefined) updated[3]  = data.category;
      if (data.description     !== undefined) updated[4]  = data.description;
      if (data.amount          !== undefined) updated[5]  = parseFloat(data.amount);
      if (data.paidFromAccount !== undefined) updated[6]  = data.paidFromAccount;
      updated[8]  = companyId;
      if (data.invoiceId       !== undefined) updated[9]  = data.invoiceId;
      if (data.workerName      !== undefined) updated[10] = data.workerName;
      if (data.hours           !== undefined) updated[11] = data.hours;
      if (data.hourlyRate      !== undefined) updated[12] = data.hourlyRate;
      sheet.getRange(i + 1, 1, 1, updated.length).setValues([updated]);
      return { success: true };
    }
    return { success: false, error: 'Expense not found: ' + data.expenseId };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function deleteExpenseEntry(companyId, expenseId) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ACCT_EXPENSES_SHEET);
    if (!sheet) return { success: false, error: 'Sheet not found' };
    const rows = sheet.getDataRange().getValues();
    for (let i = rows.length - 1; i >= 1; i--) {
      if (String(rows[i][0]).trim() === String(expenseId).trim()) {
        sheet.deleteRow(i + 1);
        return { success: true };
      }
    }
    return { success: false, error: 'Expense not found' };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ============================================================================
// OWNER DRAW
// ============================================================================

function getOwnerDraws(companyId) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ACCT_DRAW_SHEET);
    if (!sheet) return { success: true, draws: [], total: 0 };

    const data  = sheet.getDataRange().getValues();
    const draws = [];
    let   total = 0;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim() !== String(companyId).trim()) continue;
      const amt = parseFloat(data[i][3] || 0);
      draws.push({
        companyId:      data[i][0],
        drawId:         data[i][1],
        date:           data[i][2] ? new Date(data[i][2]).toISOString() : '',
        amount:         amt,
        accountPaidFrom: data[i][4] || '',
        notes:          data[i][5] || ''
      });
      total += amt;
    }
    return { success: true, draws: draws, total: total };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function addOwnerDraw(companyId, data) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    let   sheet = ss.getSheetByName(ACCT_DRAW_SHEET);
    if (!sheet) { setupDrawSheet(ss); sheet = ss.getSheetByName(ACCT_DRAW_SHEET); }

    const drawId = 'DRAW-' + new Date().getTime();
    sheet.appendRow([
      companyId, drawId,
      data.date ? new Date(data.date) : new Date(),
      parseFloat(data.amount || 0),
      data.accountPaidFrom || '',
      data.notes           || ''
    ]);
    return { success: true, drawId: drawId };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function deleteOwnerDraw(companyId, drawId) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ACCT_DRAW_SHEET);
    if (!sheet) return { success: false, error: 'Sheet not found' };
    const rows = sheet.getDataRange().getValues();
    for (let i = rows.length - 1; i >= 1; i--) {
      if (String(rows[i][0]).trim() === String(companyId).trim() &&
          String(rows[i][1]).trim() === String(drawId).trim()) {
        sheet.deleteRow(i + 1);
        return { success: true };
      }
    }
    return { success: false, error: 'Draw not found' };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ============================================================================
// FORECAST
// ============================================================================

function getForecastItems(companyId, year) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ACCT_FORECAST_SHEET);
    if (!sheet) return { success: true, items: [] };

    const data  = sheet.getDataRange().getValues();
    const items = [];
    const yr    = year ? parseInt(year) : null;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim() !== String(companyId).trim()) continue;
      if (yr && parseInt(data[i][3] || 0) !== yr) continue;
      items.push({
        companyId:    data[i][0],
        itemId:       data[i][1],
        month:        parseInt(data[i][2] || 0),
        year:         parseInt(data[i][3] || 0),
        type:         data[i][4] || 'Income',
        description:  data[i][5] || '',
        amount:       parseFloat(data[i][6] || 0),
        category:     data[i][7] || '',
        notes:        data[i][8] || '',
        status:       data[i][9]  || 'Confirmed',
        expectedDate: data[i][10] ? new Date(data[i][10]).toISOString().substring(0,10) : '',
        sourceType:   data[i][11] || 'Manual',
        sourceId:     data[i][12] || '',
        createdDate:  data[i][13] ? new Date(data[i][13]).toISOString().substring(0,10) : ''
      });
    }
    return { success: true, items: items };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function upsertForecastItem(companyId, data) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    let   sheet = ss.getSheetByName(ACCT_FORECAST_SHEET);
    if (!sheet) { setupForecastSheet(ss); sheet = ss.getSheetByName(ACCT_FORECAST_SHEET); }

    const itemId  = data.itemId || ('FCST-' + new Date().getTime());
    const now     = new Date();
    const rowData = [
      companyId, itemId,
      parseInt(data.month || 1),
      parseInt(data.year  || now.getFullYear()),
      data.type        || 'Income',
      data.description || '',
      parseFloat(data.amount || 0),
      data.category    || '',
      data.notes       || '',
      data.status      || 'Confirmed',
      data.expectedDate ? new Date(data.expectedDate) : '',
      data.sourceType  || 'Manual',
      data.sourceId    || '',
      now  // created date — will be preserved on update
    ];

    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === String(companyId).trim() &&
          String(rows[i][1]).trim() === String(itemId).trim()) {
        rowData[13] = rows[i][13] || now; // preserve original created date
        sheet.getRange(i + 1, 1, 1, rowData.length).setValues([rowData]);
        return { success: true, itemId: itemId, updated: true };
      }
    }
    sheet.appendRow(rowData);
    return { success: true, itemId: itemId, created: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function deleteForecastItem(companyId, itemId) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ACCT_FORECAST_SHEET);
    if (!sheet) return { success: false, error: 'Sheet not found' };
    const rows = sheet.getDataRange().getValues();
    for (let i = rows.length - 1; i >= 1; i--) {
      if (String(rows[i][0]).trim() === String(companyId).trim() &&
          String(rows[i][1]).trim() === String(itemId).trim()) {
        sheet.deleteRow(i + 1);
        return { success: true };
      }
    }
    return { success: false, error: 'Forecast item not found' };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ============================================================================
// DASHBOARD AGGREGATION
// ============================================================================

function getDashboard(companyId) {
  try {
    const ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
    const year    = new Date().getFullYear();
    const yearStr = String(year);

    // ── YTD Revenue from Payment History ─────────────────────────────────
    let ytdRevenue = 0;
    const phSheet = ss.getSheetByName(ACCT_PAYMENT_SHEET);
    if (phSheet) {
      const ph    = phSheet.getDataRange().getValues();
      const hdrs  = ph[0] || [];
      const amtI  = hdrs.indexOf('Amount');
      const dateI = hdrs.indexOf('Date');
      const cmpI  = hdrs.indexOf('Company ID');
      const stI   = hdrs.indexOf('Status');
      const start = (String(ph[0][0] || '').toUpperCase().includes('PAYMENT') || String(ph[0][0]).includes('💳')) ? 2 : 1;
      for (let i = start; i < ph.length; i++) {
        const rowCmp = cmpI >= 0 ? String(ph[i][cmpI] || DEFAULT_COMPANY_ID).trim() : DEFAULT_COMPANY_ID;
        if (rowCmp !== String(companyId).trim()) continue;
        const st  = stI >= 0 ? String(ph[i][stI] || '').trim() : 'Completed';
        if (st !== 'Completed') continue;
        const d = dateI >= 0 && ph[i][dateI] ? new Date(ph[i][dateI]) : null;
        if (d && String(d.getFullYear()) === yearStr) {
          ytdRevenue += amtI >= 0 ? parseFloat(ph[i][amtI] || 0) : 0;
        }
      }
    }

    // ── YTD Expenses ─────────────────────────────────────────────────────
    let ytdExpenses   = 0;
    let pendingPOTotal = 0;
    const expSheet = ss.getSheetByName(ACCT_EXPENSES_SHEET);
    if (expSheet) {
      const ex = expSheet.getDataRange().getValues();
      for (let i = 1; i < ex.length; i++) {
        const rowCmp = String(ex[i][8] || DEFAULT_COMPANY_ID).trim();
        if (rowCmp !== String(companyId).trim()) continue;
        const d = ex[i][2] ? new Date(ex[i][2]) : null;
        if (d && String(d.getFullYear()) === yearStr) {
          ytdExpenses += parseFloat(ex[i][5] || 0);
        }
      }
    }

    // ── Pending PO total ─────────────────────────────────────────────────
    const poSheet = ss.getSheetByName(ACCT_PO_SHEET);
    if (poSheet) {
      const po = poSheet.getDataRange().getValues();
      for (let i = 1; i < po.length; i++) {
        if (String(po[i][0] || '').trim() !== String(companyId).trim()) continue;
        const st = String(po[i][7] || '').trim();
        if (st === 'Pending' || st === 'Ordered') {
          pendingPOTotal += parseFloat(po[i][6] || 0);
        }
      }
    }

    // ── YTD Draws ─────────────────────────────────────────────────────────
    let ytdDraws = 0;
    const drawSheet = ss.getSheetByName(ACCT_DRAW_SHEET);
    if (drawSheet) {
      const dr = drawSheet.getDataRange().getValues();
      for (let i = 1; i < dr.length; i++) {
        if (String(dr[i][0] || '').trim() !== String(companyId).trim()) continue;
        const d = dr[i][2] ? new Date(dr[i][2]) : null;
        if (d && String(d.getFullYear()) === yearStr) {
          ytdDraws += parseFloat(dr[i][3] || 0);
        }
      }
    }

    // ── Account balances ─────────────────────────────────────────────────
    const acctResult   = getAccounts(companyId);
    const totalBalance = (acctResult.accounts || []).reduce((s, a) => s + a.currentBalance, 0);

    // ── Shopping list (need-to-purchase) planned total ────────────────────
    let shoppingTotal = 0;
    const shopSheet = ss.getSheetByName(ACCT_SHOPPING_SHEET);
    if (shopSheet) {
      const sh = shopSheet.getDataRange().getValues();
      for (let i = 1; i < sh.length; i++) {
        if (String(sh[i][0] || '').trim() !== String(companyId).trim()) continue;
        const st = String(sh[i][6] || '').trim(); // status
        if (st === 'Purchased' || st === 'Cancelled') continue;
        shoppingTotal += parseFloat(sh[i][3] || 0); // estimated cost
      }
    }

    // ── Available to pay yourself ─────────────────────────────────────────
    // Raw available (revenue - spent - pending POs - draws)
    const availableToPay = Math.max(0, ytdRevenue - ytdExpenses - pendingPOTotal - ytdDraws);
    // True available after subtracting planned purchases
    const trueAvailable  = Math.max(0, availableToPay - shoppingTotal);

    return {
      success:        true,
      companyId:      companyId,
      year:           year,
      ytdRevenue:     ytdRevenue,
      ytdExpenses:    ytdExpenses,
      pendingPOTotal: pendingPOTotal,
      ytdDraws:       ytdDraws,
      availableToPay: availableToPay,
      shoppingTotal:  shoppingTotal,
      trueAvailable:  trueAvailable,
      netProfit:      ytdRevenue - ytdExpenses,
      totalBalance:   totalBalance,
      accounts:       acctResult.accounts || []
    };
  } catch (e) {
    Logger.log('getDashboard error: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

// ============================================================================
// UTILITY — list distinct Company IDs from Authentication sheet
// ============================================================================

function getCompanyIds() {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Authentication');
    if (!sheet) return { success: true, companyIds: [DEFAULT_COMPANY_ID] };
    const data = sheet.getDataRange().getValues();
    const set  = new Set([DEFAULT_COMPANY_ID]);
    const hdrs = data[0] || [];
    const cmpI = hdrs.indexOf('Company ID');
    if (cmpI < 0) return { success: true, companyIds: [DEFAULT_COMPANY_ID] };
    for (let i = 1; i < data.length; i++) {
      const c = String(data[i][cmpI] || '').trim();
      if (c) set.add(c);
    }
    return { success: true, companyIds: Array.from(set) };
  } catch (e) {
    return { success: true, companyIds: [DEFAULT_COMPANY_ID] };
  }
}

// ============================================================================
// BANK TRANSACTIONS — PNC CSV import + management
// ============================================================================

function setupBankSheet(ss) {
  ensureSheet(ss, ACCT_BANK_SHEET, [
    'Company ID','Txn ID','Date','Description','Amount','Type',
    'Balance','Status','Category','Notes','Expense ID','Import Date'
  ]);
}

// Auto-category based on PNC merchant description keywords
function autoCategorize(desc) {
  const d = desc.toUpperCase();
  if (/LOWE'?S|MENARDS|HOME DEPOT|ACE H[DW]|TRUE VALUE|HARBOR FREIGHT|O'?REILLY|AUTOZONE|NAPA|FASTENAL|84-LUMBER|LUMBER|POOL|MEDALLION SWIM/.test(d)) return 'Parts & Materials';
  if (/SHELL|EXXON|BP[x*]|SPEEDWAY|MARATHON|CASEY'?S|WEIGELS|SUNOCO|WAWA|CIRCLE K|KWIK|GIT N GO|FUEL|GAS\b|PETRO|BUC-EE|GOODSTOP|SMARTSERV|SADDLE BROOK/.test(d)) return 'Fuel & Vehicle';
  if (/MCDONALD|BURGER KING|CRACKER BARREL|STARBUCKS|DUNKIN|FIVE GUYS|COOK OUT|HARDEES|BOJANGLES|KRYSTAL|KPOT|FOOD CITY|TST\*|SQ \*/.test(d)) return 'Meals & Entertainment';
  if (/WALMART|WAL-MART|DOLLAR GENERAL|DOLLAR TREE|ALDI|MEIJER|KROGER|PUBLIX|FOOD/.test(d)) return 'Personal / General';
  if (/ONLINE TRANSFER TO/.test(d)) return 'Transfer Out';
  if (/ONLINE TRANSFER FROM/.test(d)) return 'Transfer In';
  if (/DEPOSIT|MOBILE DEPOSIT|TELLER DEPOSIT/.test(d)) return 'Income / Deposit';
  if (/ATM WITHDRAWAL|WITHDRAWAL/.test(d)) return 'Cash Withdrawal';
  if (/AMEX EPAYMENT|EPAYMENT|ACH PMT/.test(d)) return 'Credit Card Payment';
  if (/WEBFLOW|SIMPLY BUSINESS|RECURRING DEBIT/.test(d)) return 'Subscriptions';
  if (/EBAY|AMAZON/.test(d)) return 'Parts & Materials';
  if (/CHECK/.test(d)) return 'Check Payment';
  if (/ROGERS GROUP|BOBCAT|RENTAL PRO|EMSCO|TRUE BLUE POOLS/.test(d)) return 'Equipment / Rental';
  return 'Uncategorized';
}

// Generate a stable dedup hash from date + description + amount
function txnHash(date, desc, amount) {
  const raw = String(date).trim() + '|' + String(desc).trim().substring(0, 60) + '|' + String(amount).trim();
  let h = 0;
  for (let i = 0; i < raw.length; i++) { h = ((h << 5) - h) + raw.charCodeAt(i); h |= 0; }
  return 'TXN-' + Math.abs(h).toString(36).toUpperCase();
}

// Parse PNC CSV amount string like "- $1,234.56" or "+ $50"
function parsePNCAmount(amtStr) {
  const s = String(amtStr || '').trim();
  const sign = s.startsWith('-') ? -1 : 1;
  const num  = parseFloat(s.replace(/[^0-9.]/g, '')) || 0;
  return sign * num;
}

// Parse PNC date: "PENDING - MM/DD/YYYY" or "YYYY-MM-DD"
function parsePNCDate(dateStr) {
  const s = String(dateStr || '').trim();
  if (s.startsWith('PENDING')) {
    const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return m[3] + '-' + m[1] + '-' + m[2]; // YYYY-MM-DD
    return null; // unparseable pending
  }
  return s; // already YYYY-MM-DD
}

function importBankTransactions(companyId, body) {
  try {
    // body.rowsJson = JSON string of array of {date, desc, amount, balance}
    // body.includePending = 'true'/'false'
    // body.startDate = optional ISO date string for range filtering
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    let   sheet = ss.getSheetByName(ACCT_BANK_SHEET);
    if (!sheet) { setupBankSheet(ss); sheet = ss.getSheetByName(ACCT_BANK_SHEET); }

    let rows = [];
    try { rows = JSON.parse(body.rowsJson || '[]'); } catch (_) { return { success: false, error: 'Invalid rowsJson' }; }

    const includePending = body.includePending === 'true';
    const filterStart    = body.startDate ? new Date(body.startDate) : null;

    // Build set of existing txn IDs for dedup
    const existing    = sheet.getDataRange().getValues();
    const existingIds = new Set();
    for (let i = 1; i < existing.length; i++) {
      if (String(existing[i][0]).trim() === String(companyId).trim()) {
        existingIds.add(String(existing[i][1]).trim());
      }
    }

    const now     = new Date();
    let   imported = 0;
    let   skipped  = 0;
    let   dupes    = 0;

    for (const row of rows) {
      const parsedDate = parsePNCDate(row.date);
      if (!parsedDate) { skipped++; continue; } // skip unparseable
      const isPending  = String(row.date || '').toUpperCase().includes('PENDING');
      if (isPending && !includePending) { skipped++; continue; }

      // Date range filter
      if (filterStart) {
        const txnDate = new Date(parsedDate);
        if (txnDate < filterStart) { skipped++; continue; }
      }

      const amount  = parsePNCAmount(row.amount);
      const hash    = txnHash(parsedDate, row.desc, String(amount));
      if (existingIds.has(hash)) { dupes++; continue; }

      const type     = amount >= 0 ? 'Credit' : 'Debit';
      const category = autoCategorize(row.desc);

      sheet.appendRow([
        companyId, hash, parsedDate, row.desc,
        amount, type, row.balance || '',
        'Unreviewed', category, '', '', now
      ]);
      existingIds.add(hash);
      imported++;
    }

    // Check if 3+ unreviewed now → send notification
    checkUnreviewedTransactions(companyId, ss);

    return { success: true, imported, skipped, dupes };
  } catch (e) {
    Logger.log('importBankTransactions error: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

function getBankTransactions(companyId, startDate, endDate, status) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ACCT_BANK_SHEET);
    if (!sheet) return { success: true, transactions: [] };
    const data  = sheet.getDataRange().getValues();
    const txns  = [];
    const sd    = startDate ? new Date(startDate) : null;
    const ed    = endDate   ? new Date(endDate)   : null;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim() !== String(companyId).trim()) continue;
      if (status && String(data[i][7] || '').trim() !== status) continue;
      const txnDate = data[i][2] ? new Date(data[i][2]) : null;
      if (sd && txnDate && txnDate < sd) continue;
      if (ed && txnDate && txnDate > ed) continue;
      txns.push({
        companyId:   data[i][0],
        txnId:       data[i][1],
        date:        data[i][2] ? new Date(data[i][2]).toISOString().substring(0,10) : '',
        description: data[i][3],
        amount:      parseFloat(data[i][4] || 0),
        type:        data[i][5],
        balance:     data[i][6],
        status:      data[i][7] || 'Unreviewed',
        category:    data[i][8] || '',
        notes:       data[i][9] || '',
        expenseId:   data[i][10] || '',
        importDate:  data[i][11] ? new Date(data[i][11]).toISOString().substring(0,10) : ''
      });
    }
    return { success: true, transactions: txns };
  } catch (e) { return { success: false, error: e.toString() }; }
}

function getLastImportDate(companyId) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ACCT_BANK_SHEET);
    if (!sheet) return { success: true, lastDate: null };
    const data  = sheet.getDataRange().getValues();
    let   latest = null;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim() !== String(companyId).trim()) continue;
      const d = data[i][2] ? new Date(data[i][2]) : null;
      if (d && (!latest || d > latest)) latest = d;
    }
    return { success: true, lastDate: latest ? latest.toISOString().substring(0,10) : null };
  } catch (e) { return { success: false, error: e.toString() }; }
}

function updateBankTransaction(companyId, data) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ACCT_BANK_SHEET);
    if (!sheet) return { success: false, error: 'Sheet not found' };
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() !== String(companyId).trim()) continue;
      if (String(rows[i][1]).trim() !== String(data.txnId).trim()) continue;
      const updated = [...rows[i]];
      if (data.status   !== undefined) updated[7]  = data.status;
      if (data.category !== undefined) updated[8]  = data.category;
      if (data.notes    !== undefined) updated[9]  = data.notes;
      if (data.expenseId !== undefined) updated[10] = data.expenseId;
      sheet.getRange(i + 1, 1, 1, updated.length).setValues([updated]);
      return { success: true };
    }
    return { success: false, error: 'Transaction not found' };
  } catch (e) { return { success: false, error: e.toString() }; }
}

function deleteBankTransaction(companyId, txnId) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ACCT_BANK_SHEET);
    if (!sheet) return { success: false, error: 'Sheet not found' };
    const rows = sheet.getDataRange().getValues();
    for (let i = rows.length - 1; i >= 1; i--) {
      if (String(rows[i][0]).trim() === String(companyId).trim() &&
          String(rows[i][1]).trim() === String(txnId).trim()) {
        sheet.deleteRow(i + 1);
        return { success: true };
      }
    }
    return { success: false, error: 'Transaction not found' };
  } catch (e) { return { success: false, error: e.toString() }; }
}

// ============================================================================
// REMINDERS / TO-DO
// ============================================================================

function setupRemindersSheet(ss) {
  ensureSheet(ss, ACCT_REMINDERS_SHEET, [
    'Company ID','Reminder ID','Title','Due Date','Priority',
    'Status','Last Email Sent','Notes','Created Date'
  ]);
}

function getReminders(companyId) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ACCT_REMINDERS_SHEET);
    if (!sheet) return { success: true, reminders: [] };
    const data      = sheet.getDataRange().getValues();
    const reminders = [];
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim() !== String(companyId).trim()) continue;
      reminders.push({
        companyId:     data[i][0],
        reminderId:    data[i][1],
        title:         data[i][2],
        dueDate:       data[i][3] ? new Date(data[i][3]).toISOString().substring(0,10) : '',
        priority:      data[i][4] || 'Normal',
        status:        data[i][5] || 'Pending',
        lastEmailSent: data[i][6] ? new Date(data[i][6]).toISOString().substring(0,10) : '',
        notes:         data[i][7] || '',
        createdDate:   data[i][8] ? new Date(data[i][8]).toISOString().substring(0,10) : ''
      });
    }
    return { success: true, reminders: reminders };
  } catch (e) { return { success: false, error: e.toString() }; }
}

function addReminder(companyId, data) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    let   sheet = ss.getSheetByName(ACCT_REMINDERS_SHEET);
    if (!sheet) { setupRemindersSheet(ss); sheet = ss.getSheetByName(ACCT_REMINDERS_SHEET); }
    const id = 'REM-' + new Date().getTime();
    sheet.appendRow([
      companyId, id,
      data.title || 'Reminder',
      data.dueDate ? new Date(data.dueDate) : '',
      data.priority || 'Normal',
      'Pending', '', data.notes || '', new Date()
    ]);
    return { success: true, reminderId: id };
  } catch (e) { return { success: false, error: e.toString() }; }
}

function updateReminder(companyId, data) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ACCT_REMINDERS_SHEET);
    if (!sheet) return { success: false, error: 'Sheet not found' };
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() !== String(companyId).trim()) continue;
      if (String(rows[i][1]).trim() !== String(data.reminderId).trim()) continue;
      const updated = [...rows[i]];
      if (data.title    !== undefined) updated[2] = data.title;
      if (data.dueDate  !== undefined) updated[3] = data.dueDate ? new Date(data.dueDate) : '';
      if (data.priority !== undefined) updated[4] = data.priority;
      if (data.status   !== undefined) updated[5] = data.status;
      if (data.notes    !== undefined) updated[7] = data.notes;
      sheet.getRange(i + 1, 1, 1, updated.length).setValues([updated]);
      return { success: true };
    }
    return { success: false, error: 'Reminder not found' };
  } catch (e) { return { success: false, error: e.toString() }; }
}

function deleteReminder(companyId, reminderId) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ACCT_REMINDERS_SHEET);
    if (!sheet) return { success: false, error: 'Sheet not found' };
    const rows = sheet.getDataRange().getValues();
    for (let i = rows.length - 1; i >= 1; i--) {
      if (String(rows[i][0]).trim() === String(companyId).trim() &&
          String(rows[i][1]).trim() === String(reminderId).trim()) {
        sheet.deleteRow(i + 1);
        return { success: true };
      }
    }
    return { success: false, error: 'Reminder not found' };
  } catch (e) { return { success: false, error: e.toString() }; }
}

// ============================================================================
// RECURRING EXPENSES
// ============================================================================

function setupRecurringSheet(ss) {
  ensureSheet(ss, ACCT_RECURRING_SHEET, [
    'Company ID','ID','Name','Amount','Day of Month',
    'Category','Account','Auto-Log','Active','Notes'
  ]);
}

function getRecurringExpenses(companyId) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ACCT_RECURRING_SHEET);
    if (!sheet) return { success: true, recurring: [] };
    const data = sheet.getDataRange().getValues();
    const list = [];
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim() !== String(companyId).trim()) continue;
      list.push({
        companyId:  data[i][0],
        recurId:    data[i][1],
        name:       data[i][2],
        amount:     parseFloat(data[i][3] || 0),
        dayOfMonth: parseInt(data[i][4] || 1),
        category:   data[i][5] || 'General',
        account:    data[i][6] || '',
        autoLog:    String(data[i][7] || '').toLowerCase() === 'true',
        active:     String(data[i][8] || 'true').toLowerCase() !== 'false',
        notes:      data[i][9] || ''
      });
    }
    return { success: true, recurring: list };
  } catch (e) { return { success: false, error: e.toString() }; }
}

function upsertRecurringExpense(companyId, data) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    let   sheet = ss.getSheetByName(ACCT_RECURRING_SHEET);
    if (!sheet) { setupRecurringSheet(ss); sheet = ss.getSheetByName(ACCT_RECURRING_SHEET); }
    const recurId = data.recurId || ('REC-' + new Date().getTime());
    const rowData = [
      companyId, recurId,
      data.name || '', parseFloat(data.amount || 0),
      parseInt(data.dayOfMonth || 1),
      data.category || 'General', data.account || '',
      data.autoLog === 'true' ? 'true' : 'false',
      data.active  === 'false' ? 'false' : 'true',
      data.notes || ''
    ];
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === String(companyId).trim() &&
          String(rows[i][1]).trim() === String(recurId).trim()) {
        sheet.getRange(i + 1, 1, 1, rowData.length).setValues([rowData]);
        return { success: true, recurId, updated: true };
      }
    }
    sheet.appendRow(rowData);
    return { success: true, recurId, created: true };
  } catch (e) { return { success: false, error: e.toString() }; }
}

function deleteRecurringExpense(companyId, recurId) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ACCT_RECURRING_SHEET);
    if (!sheet) return { success: false, error: 'Sheet not found' };
    const rows = sheet.getDataRange().getValues();
    for (let i = rows.length - 1; i >= 1; i--) {
      if (String(rows[i][0]).trim() === String(companyId).trim() &&
          String(rows[i][1]).trim() === String(recurId).trim()) {
        sheet.deleteRow(i + 1);
        return { success: true };
      }
    }
    return { success: false, error: 'Not found' };
  } catch (e) { return { success: false, error: e.toString() }; }
}

// ============================================================================
// DAILY TRIGGER — reminders + unreviewed transaction alerts
// ============================================================================

function setupDailyTrigger() {
  // Remove existing daily triggers to avoid duplicates
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'dailyAccountingCheck') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyAccountingCheck')
    .timeBased().everyDays(1).atHour(8).create();
}

function dailyAccountingCheck() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  postPendingForecastItems(ss);
  autoClearPendingTransactions(ss);
  sendOverdueReminderEmails(ss);
  checkUnreviewedTransactions(DEFAULT_COMPANY_ID, ss);
  autoLogRecurringExpenses(DEFAULT_COMPANY_ID, ss);
}

function sendOverdueReminderEmails(ss) {
  try {
    const sheet = ss.getSheetByName(ACCT_REMINDERS_SHEET);
    if (!sheet) return;
    const data  = sheet.getDataRange().getValues();
    const today = new Date(); today.setHours(0,0,0,0);
    const overdueList = [];

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][5] || '').toLowerCase() === 'done') continue;
      const due = data[i][3] ? new Date(data[i][3]) : null;
      if (!due || due > today) continue; // not yet due
      overdueList.push({ title: data[i][2], dueDate: due, priority: data[i][4], notes: data[i][7] });
      // Update last email sent
      const updated = [...data[i]];
      updated[6] = new Date();
      sheet.getRange(i + 1, 1, 1, updated.length).setValues([updated]);
    }

    if (overdueList.length === 0) return;

    const rows = overdueList.map(r =>
      `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:600;">${r.title}</td>` +
      `<td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#dc2626;">${r.dueDate.toLocaleDateString()}</td>` +
      `<td style="padding:8px;border-bottom:1px solid #e2e8f0;">${r.priority || 'Normal'}</td>` +
      `<td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b;">${r.notes || ''}</td></tr>`
    ).join('');

    const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#0f172a;padding:20px;border-radius:10px 10px 0 0;">
        <h2 style="color:#fff;margin:0;font-size:18px;">⏰ Overdue Reminders — A Quality Pool Company</h2>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;padding:20px;border-radius:0 0 10px 10px;">
        <p style="color:#374151;margin:0 0 16px;">You have <strong>${overdueList.length}</strong> overdue reminder(s) that need attention:</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead><tr style="background:#f8fafc;">
            <th style="padding:8px;text-align:left;color:#64748b;font-size:12px;text-transform:uppercase;">Task</th>
            <th style="padding:8px;text-align:left;color:#64748b;font-size:12px;text-transform:uppercase;">Due</th>
            <th style="padding:8px;text-align:left;color:#64748b;font-size:12px;text-transform:uppercase;">Priority</th>
            <th style="padding:8px;text-align:left;color:#64748b;font-size:12px;text-transform:uppercase;">Notes</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="color:#64748b;font-size:12px;margin:16px 0 0;">Log in to your Accounting app to mark these as done. This email will repeat daily until resolved.</p>
      </div>
    </div>`;

    GmailApp.sendEmail(NOTIFY_EMAIL, `⏰ ${overdueList.length} Overdue Reminder(s) — Action Required`, '', { htmlBody: html });
  } catch (e) { Logger.log('sendOverdueReminderEmails error: ' + e.toString()); }
}

function checkUnreviewedTransactions(companyId, ss) {
  try {
    const sheet = ss ? ss.getSheetByName(ACCT_BANK_SHEET) : SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(ACCT_BANK_SHEET);
    if (!sheet) return;
    const data     = sheet.getDataRange().getValues();
    const unreviewed = [];
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim() !== String(companyId).trim()) continue;
      if (String(data[i][7] || '').trim() === 'Unreviewed') {
        unreviewed.push({ date: data[i][2], desc: data[i][3], amount: data[i][4], category: data[i][8] });
      }
    }
    if (unreviewed.length < 3) return;

    const rows = unreviewed.slice(0, 10).map(t =>
      `<tr><td style="padding:7px;border-bottom:1px solid #e2e8f0;">${t.date}</td>` +
      `<td style="padding:7px;border-bottom:1px solid #e2e8f0;">${String(t.desc||'').substring(0,50)}</td>` +
      `<td style="padding:7px;border-bottom:1px solid #e2e8f0;font-weight:600;color:${parseFloat(t.amount)>=0?'#16a34a':'#dc2626'};">$${Math.abs(parseFloat(t.amount||0)).toFixed(2)}</td>` +
      `<td style="padding:7px;border-bottom:1px solid #e2e8f0;color:#64748b;">${t.category||''}</td></tr>`
    ).join('');

    const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#dc2626;padding:20px;border-radius:10px 10px 0 0;">
        <h2 style="color:#fff;margin:0;font-size:18px;">🏦 ${unreviewed.length} Unreviewed Bank Transactions</h2>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;padding:20px;border-radius:0 0 10px 10px;">
        <p style="color:#374151;margin:0 0 16px;">You have <strong>${unreviewed.length}</strong> bank transactions that haven't been reviewed or categorized yet.</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="background:#f8fafc;">
            <th style="padding:7px;text-align:left;color:#64748b;font-size:11px;text-transform:uppercase;">Date</th>
            <th style="padding:7px;text-align:left;color:#64748b;font-size:11px;text-transform:uppercase;">Description</th>
            <th style="padding:7px;text-align:left;color:#64748b;font-size:11px;text-transform:uppercase;">Amount</th>
            <th style="padding:7px;text-align:left;color:#64748b;font-size:11px;text-transform:uppercase;">Category</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${unreviewed.length > 10 ? `<p style="color:#64748b;font-size:12px;">...and ${unreviewed.length - 10} more</p>` : ''}
        <p style="color:#64748b;font-size:12px;margin:16px 0 0;">Log in to your Accounting app to review and categorize these transactions.</p>
      </div>
    </div>`;

    GmailApp.sendEmail(NOTIFY_EMAIL, `🏦 ${unreviewed.length} Unreviewed Transactions — Please Log In`, '', { htmlBody: html });
  } catch (e) { Logger.log('checkUnreviewedTransactions error: ' + e.toString()); }
}

// ── Auto-promote PENDING forecast items older than 2 days → Posted ───────────
// When you add income/expense as Pending (expecting it soon), after 2 days
// it auto-promotes to Posted so it reflects in your actual balance calculation.
function postPendingForecastItems(ss) {
  try {
    const sheet = ss.getSheetByName(ACCT_FORECAST_SHEET);
    if (!sheet) return;
    const data      = sheet.getDataRange().getValues();
    const now       = new Date();
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][9] || '') !== 'Pending') continue;  // only Pending rows
      const created = data[i][13] ? new Date(data[i][13]) : null;
      if (!created) continue;
      if (now - created < twoDaysMs) continue; // still within 2-day window
      const updated    = [...data[i]];
      updated[9]       = 'Posted';
      sheet.getRange(i + 1, 1, 1, updated.length).setValues([updated]);
    }
  } catch (e) { Logger.log('postPendingForecastItems error: ' + e.toString()); }
}

// ── Auto-clear PENDING bank credits older than 2 days ────────────────────────
// PENDING rows from PNC CSV have balance = 'PENDING'. Once 2 days pass
// and they've settled (or we don't know), mark them Reviewed so they
// stop inflating pending income counts.
function autoClearPendingTransactions(ss) {
  try {
    const sheet = ss.getSheetByName(ACCT_BANK_SHEET);
    if (!sheet) return;
    const data  = sheet.getDataRange().getValues();
    const now   = new Date();
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][5] || '') !== 'Credit') continue;          // only credits
      if (String(data[i][6] || '') !== 'PENDING') continue;         // only pending balance
      if (String(data[i][7] || '') !== 'Unreviewed') continue;      // already handled
      const importDate = data[i][11] ? new Date(data[i][11]) : null;
      if (!importDate) continue;
      if (now - importDate < twoDaysMs) continue;                    // still within 2 days
      // Mark as Reviewed + note it cleared
      const updated = [...data[i]];
      updated[6] = 'Cleared';   // balance field — note it settled
      updated[7] = 'Reviewed';
      updated[9] = (updated[9] ? updated[9] + ' | ' : '') + 'Auto-cleared after 2 days (was PENDING)';
      sheet.getRange(i + 1, 1, 1, updated.length).setValues([updated]);
    }
  } catch (e) { Logger.log('autoClearPendingTransactions error: ' + e.toString()); }
}

// Auto-log active recurring expenses that are due today (day of month matches)
function autoLogRecurringExpenses(companyId, ss) {
  try {
    const today     = new Date();
    const dayOfMonth = today.getDate();
    const sheet      = ss.getSheetByName(ACCT_RECURRING_SHEET);
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim() !== String(companyId).trim()) continue;
      if (String(data[i][8] || 'true').toLowerCase() === 'false') continue; // inactive
      if (String(data[i][7] || '').toLowerCase() !== 'true') continue;      // not auto-log
      if (parseInt(data[i][4] || 1) !== dayOfMonth) continue;
      // Log it as an expense
      addExpenseEntry(companyId, {
        category:        data[i][5] || 'General',
        date:            today.toISOString().substring(0,10),
        description:     'Recurring: ' + String(data[i][2]),
        amount:          data[i][3],
        paidFromAccount: data[i][6] || '',
        notes:           'Auto-logged from recurring schedule'
      });
    }
  } catch (e) { Logger.log('autoLogRecurringExpenses error: ' + e.toString()); }
}

// ============================================================================
// SHOPPING LIST — Need-to-Purchase items
// Cols: Company ID, Item ID, Name, Est. Cost, Category, Priority,
//       Status (Planned/Ordered/Purchased/Cancelled), Project ID,
//       Due By, Notes, Created Date
// ============================================================================

function setupShoppingSheet(ss) {
  ensureSheet(ss, ACCT_SHOPPING_SHEET, [
    'Company ID','Item ID','Name','Est. Cost','Category',
    'Priority','Status','Project ID','Due By','Notes','Created Date'
  ]);
}

function getShoppingList(companyId) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ACCT_SHOPPING_SHEET);
    if (!sheet) return { success: true, items: [], total: 0 };
    const data  = sheet.getDataRange().getValues();
    const items = [];
    let   total = 0;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim() !== String(companyId).trim()) continue;
      const cost = parseFloat(data[i][3] || 0);
      const st   = String(data[i][6] || 'Planned');
      if (st !== 'Purchased' && st !== 'Cancelled') total += cost;
      items.push({
        companyId:  data[i][0],
        itemId:     data[i][1],
        name:       data[i][2],
        estCost:    cost,
        category:   data[i][4] || '',
        priority:   data[i][5] || 'Normal',
        status:     st,
        projectId:  data[i][7] || '',
        dueBy:      data[i][8] ? new Date(data[i][8]).toISOString().substring(0,10) : '',
        notes:      data[i][9] || '',
        createdDate: data[i][10] ? new Date(data[i][10]).toISOString().substring(0,10) : ''
      });
    }
    return { success: true, items, total };
  } catch (e) { return { success: false, error: e.toString() }; }
}

function upsertShoppingItem(companyId, data) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    let   sheet = ss.getSheetByName(ACCT_SHOPPING_SHEET);
    if (!sheet) { setupShoppingSheet(ss); sheet = ss.getSheetByName(ACCT_SHOPPING_SHEET); }
    const itemId  = data.itemId || ('SHOP-' + new Date().getTime());
    const rowData = [
      companyId, itemId,
      data.name    || '',
      parseFloat(data.estCost || 0),
      data.category || 'General',
      data.priority || 'Normal',
      data.status   || 'Planned',
      data.projectId || '',
      data.dueBy ? new Date(data.dueBy) : '',
      data.notes || '',
      new Date()
    ];
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === String(companyId).trim() &&
          String(rows[i][1]).trim() === String(itemId).trim()) {
        // Preserve original created date
        rowData[10] = rows[i][10] || new Date();
        sheet.getRange(i + 1, 1, 1, rowData.length).setValues([rowData]);
        return { success: true, itemId, updated: true };
      }
    }
    sheet.appendRow(rowData);
    return { success: true, itemId, created: true };
  } catch (e) { return { success: false, error: e.toString() }; }
}

function deleteShoppingItem(companyId, itemId) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ACCT_SHOPPING_SHEET);
    if (!sheet) return { success: false, error: 'Sheet not found' };
    const rows  = sheet.getDataRange().getValues();
    for (let i = rows.length - 1; i >= 1; i--) {
      if (String(rows[i][0]).trim() === String(companyId).trim() &&
          String(rows[i][1]).trim() === String(itemId).trim()) {
        sheet.deleteRow(i + 1);
        return { success: true };
      }
    }
    return { success: false, error: 'Item not found' };
  } catch (e) { return { success: false, error: e.toString() }; }
}

function markShoppingItemOrdered(companyId, itemId) {
  return upsertShoppingItem(companyId, { itemId, status: 'Ordered' });
}

// ============================================================================
// WEEK FORECAST — projected income/expenses for current Mon–Sun
// ============================================================================

function getWeekForecast(companyId) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const today = new Date();

    // Get Monday of current week
    const dayOfWeek = today.getDay(); // 0=Sun,1=Mon…
    const monday    = new Date(today);
    monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
    monday.setHours(0,0,0,0);
    const sunday    = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23,59,59,999);

    const weekStart = monday.toISOString().substring(0,10);
    const weekEnd   = sunday.toISOString().substring(0,10);
    const month     = today.getMonth() + 1;
    const year      = today.getFullYear();
    const todayDay  = today.getDate();

    // ── Projected income this week from Forecast_Items ────────────────────
    let projectedIncome   = 0;
    let projectedExpenses = 0;
    const fcSheet = ss.getSheetByName(ACCT_FORECAST_SHEET);
    if (fcSheet) {
      const fc = fcSheet.getDataRange().getValues();
      for (let i = 1; i < fc.length; i++) {
        if (String(fc[i][0] || '').trim() !== String(companyId).trim()) continue;
        if (parseInt(fc[i][2] || 0) !== month) continue;
        if (parseInt(fc[i][3] || 0) !== year) continue;
        // No specific day on forecast items — count all this month's forecasts
        // but only show items from this week proportionally? Just show the full
        // month amounts as "this month's pipeline" alongside the week view.
        if (String(fc[i][4] || '') === 'Income') projectedIncome  += parseFloat(fc[i][6] || 0);
        else                                      projectedExpenses += parseFloat(fc[i][6] || 0);
      }
    }

    // ── Pending bank credits (not older than 2 days) ──────────────────────
    let pendingIncome = 0;
    const bankSheet = ss.getSheetByName(ACCT_BANK_SHEET);
    if (bankSheet) {
      const bk  = bankSheet.getDataRange().getValues();
      const now = new Date();
      const twoDays = 2 * 24 * 60 * 60 * 1000;
      for (let i = 1; i < bk.length; i++) {
        if (String(bk[i][0] || '').trim() !== String(companyId).trim()) continue;
        if (String(bk[i][5] || '') !== 'Credit') continue;
        if (String(bk[i][6] || '') !== 'PENDING') continue;
        const imp = bk[i][11] ? new Date(bk[i][11]) : null;
        if (imp && (now - imp) <= twoDays) {
          pendingIncome += Math.abs(parseFloat(bk[i][4] || 0));
        }
      }
    }

    // ── Recurring expenses due this week ──────────────────────────────────
    let recurringDueThisWeek = 0;
    const recurItems = [];
    const recSheet = ss.getSheetByName(ACCT_RECURRING_SHEET);
    if (recSheet) {
      const rec = recSheet.getDataRange().getValues();
      for (let i = 1; i < rec.length; i++) {
        if (String(rec[i][0] || '').trim() !== String(companyId).trim()) continue;
        if (String(rec[i][8] || 'true').toLowerCase() === 'false') continue; // inactive
        const dueDay = parseInt(rec[i][4] || 1);
        // Check if dueDay falls within Monday..Sunday of this week
        const dueDate = new Date(year, month - 1, dueDay);
        if (dueDate >= monday && dueDate <= sunday) {
          const amt = parseFloat(rec[i][3] || 0);
          recurringDueThisWeek += amt;
          recurItems.push({ name: String(rec[i][2]), amount: amt, dueDay, category: rec[i][5] });
        }
      }
    }

    // ── Shopping list items due this week ─────────────────────────────────
    let shoppingDueThisWeek = 0;
    const shopItems = [];
    const shopSheet = ss.getSheetByName(ACCT_SHOPPING_SHEET);
    if (shopSheet) {
      const sh = shopSheet.getDataRange().getValues();
      for (let i = 1; i < sh.length; i++) {
        if (String(sh[i][0] || '').trim() !== String(companyId).trim()) continue;
        const st = String(sh[i][6] || '');
        if (st === 'Purchased' || st === 'Cancelled') continue;
        const dueBy = sh[i][8] ? new Date(sh[i][8]) : null;
        if (dueBy && dueBy >= monday && dueBy <= sunday) {
          const cost = parseFloat(sh[i][3] || 0);
          shoppingDueThisWeek += cost;
          shopItems.push({ name: String(sh[i][2]), amount: cost, priority: sh[i][5], status: st });
        }
      }
    }

    // ── Pending POs expected this week ────────────────────────────────────
    let posDueThisWeek = 0;
    const poSheet = ss.getSheetByName(ACCT_PO_SHEET);
    if (poSheet) {
      const po = poSheet.getDataRange().getValues();
      for (let i = 1; i < po.length; i++) {
        if (String(po[i][0] || '').trim() !== String(companyId).trim()) continue;
        const st = String(po[i][7] || '');
        if (st !== 'Pending' && st !== 'Ordered') continue;
        const orderDate = po[i][11] ? new Date(po[i][11]) : null;
        if (orderDate && orderDate >= monday && orderDate <= sunday) {
          posDueThisWeek += parseFloat(po[i][6] || 0);
        }
      }
    }

    const totalWeekOut = recurringDueThisWeek + shoppingDueThisWeek + posDueThisWeek;
    const netWeek      = pendingIncome - totalWeekOut;

    return {
      success: true,
      weekStart, weekEnd,
      pendingIncome,
      projectedIncome,
      projectedExpenses,
      recurringDueThisWeek,
      shoppingDueThisWeek,
      posDueThisWeek,
      totalWeekOut,
      netWeek,
      recurItems,
      shopItems
    };
  } catch (e) {
    Logger.log('getWeekForecast error: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

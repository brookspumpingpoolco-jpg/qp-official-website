/**
 * SETUP SCRIPT FOR INVOICE/ESTIMATE SYSTEM
 * 
 * Run this function once to set up all required sheets and triggers
 * Matches structure and patterns from InvoiceEstimate.gs
 */

// Use same constants as InvoiceEstimate.gs (with 1 suffix to avoid conflicts)
const SPREADSHEET_ID1 = '1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0';
const INVOICES_ESTIMATES_SHEET1 = 'Invoices & Estimates';
const INVOICE_TEMPLATES_SHEET1 = 'Invoice Templates';
const TERMS_LIBRARY_SHEET1 = 'Terms Library';
const DISCOUNT_CODES_SHEET1 = 'Discount Codes';
const RECURRING_INVOICES_SHEET1 = 'Recurring Invoices';
const PAYMENT_HISTORY_SHEET1 = 'Payment History';

/**
 * Main setup function - creates all required sheets and columns
 */
function setupInvoiceSystem() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID1);
    const results = {
      success: true,
      created: [],
      updated: [],
      errors: []
    };
    
    // Create Invoice Templates sheet
    if (createSheetIfNotExists(spreadsheet, INVOICE_TEMPLATES_SHEET1, [
      'ID', 'Name', 'Description', 'Items JSON', 'Notes', 'Terms', 'Tax Rate', 'Type', 'Created Date'
    ], results)) {
      Logger.log('✓ Created/Verified Invoice Templates sheet');
    }
    
    // Create Terms Library sheet
    if (createSheetIfNotExists(spreadsheet, TERMS_LIBRARY_SHEET1, [
      'ID', 'Name', 'Content', 'Category', 'Created Date'
    ], results)) {
      Logger.log('✓ Created/Verified Terms Library sheet');
    }
    
    // Create Discount Codes sheet
    if (createSheetIfNotExists(spreadsheet, DISCOUNT_CODES_SHEET1, [
      'Code', 'Type', 'Value', 'Active', 'Expires Date'
    ], results)) {
      Logger.log('✓ Created/Verified Discount Codes sheet');
    }
    
    // Create Recurring Invoices sheet
    if (createSheetIfNotExists(spreadsheet, RECURRING_INVOICES_SHEET1, [
      'ID', 'Name', 'Customer Email', 'Frequency', 'Next Run Date', 'Last Run Date',
      'Items JSON', 'Notes', 'Terms', 'Tax Rate', 'Active', 'Created Date'
    ], results)) {
      Logger.log('✓ Created/Verified Recurring Invoices sheet');
    }
    
    // Create Payment History sheet (with Company ID for multi-tenant support)
    if (createSheetIfNotExists(spreadsheet, PAYMENT_HISTORY_SHEET1, [
      'Company ID', 'Date', 'Invoice ID', 'Amount', 'Payment Method', 'Transaction ID', 'Status', 'Notes'
    ], results)) {
      Logger.log('✓ Created/Verified Payment History sheet');
    }
    
    // Ensure Invoices & Estimates sheet has 8 columns (with Company ID)
    ensureInvoiceSheet8Columns(spreadsheet, results);
    
    Logger.log('=== SETUP COMPLETE ===');
    Logger.log('Created: ' + results.created.length + ' sheets');
    Logger.log('Updated: ' + results.updated.length + ' sheets');
    if (results.errors.length > 0) {
      Logger.log('Errors: ' + results.errors.length);
      results.errors.forEach(err => Logger.log('  - ' + err));
    }
    
    return {
      success: true,
      message: 'Setup complete!',
      created: results.created,
      updated: results.updated,
      errors: results.errors
    };
  } catch (error) {
    Logger.log('Setup error: ' + error.toString());
    Logger.log('Stack: ' + error.stack);
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Create a sheet if it doesn't exist, or verify headers if it does
 */
function createSheetIfNotExists(spreadsheet, sheetName, headers, results) {
  try {
    let sheet = spreadsheet.getSheetByName(sheetName);
    const isNew = !sheet;
    
    if (!sheet) {
      sheet = spreadsheet.insertSheet(sheetName);
      results.created.push(sheetName);
    } else {
      // Verify headers match
      const existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const headersMatch = JSON.stringify(existingHeaders.filter(h => h)) === JSON.stringify(headers);
      
      if (!headersMatch) {
        Logger.log('⚠ Headers mismatch for ' + sheetName + ' - updating...');
        // Clear first row and set new headers
        sheet.getRange(1, 1, 1, sheet.getLastColumn()).clear();
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        formatHeaderRow(sheet, headers.length);
        results.updated.push(sheetName);
      }
    }
    
    // Set headers and format
    if (isNew) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      formatHeaderRow(sheet, headers.length);
    }
    
    return true;
  } catch (error) {
    Logger.log('Error creating/verifying sheet ' + sheetName + ': ' + error.toString());
    results.errors.push(sheetName + ': ' + error.toString());
    return false;
  }
}

/**
 * Format header row with consistent styling
 */
function formatHeaderRow(sheet, columnCount) {
  const headerRange = sheet.getRange(1, 1, 1, columnCount);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#0369a1');
  headerRange.setFontColor('#ffffff');
  headerRange.setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
}

/**
 * Ensure Invoices & Estimates sheet has 8 columns (with Company ID)
 * Column 1: Company ID
 * Column 2: ID
 * Column 3: Customer Email
 * Column 4: JSON Part 1 (up to 49,500 chars)
 * Column 5: JSON Part 2 (up to 49,500 chars)
 * Column 6: JSON Part 3 (up to 49,500 chars)
 * Column 7: Total (for quick sorting/display)
 * Column 8: Payment Schedule
 */
function ensureInvoiceSheet8Columns(spreadsheet, results) {
  try {
    let sheet = spreadsheet.getSheetByName(INVOICES_ESTIMATES_SHEET1);
    const isNew = !sheet;
    
    if (!sheet) {
      sheet = spreadsheet.insertSheet(INVOICES_ESTIMATES_SHEET1);
      results.created.push(INVOICES_ESTIMATES_SHEET1);
    }
    
    // Always ensure it has exactly 8 columns
    const headers = ['Company ID', 'ID', 'Customer Email', 'JSON Part 1', 'JSON Part 2', 'JSON Part 3', 'Total', 'Payment Schedule'];
    const lastCol = sheet.getLastColumn();
    
    // Migrate from 7 columns to 8 if needed
    if (lastCol === 7) {
      Logger.log('🔄 Migrating from 7-column to 8-column structure (adding Company ID column)');
      
      // Insert Company ID column at the beginning
      sheet.insertColumnBefore(1);
      SpreadsheetApp.flush();
      
      // Update headers
      sheet.getRange(1, 1, 1, 8).setValues([headers]);
      formatHeaderRow(sheet, 8);
      
      // Populate Company ID for existing rows
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        Logger.log('📝 Populating Company ID for ' + (lastRow - 1) + ' existing rows...');
        for (let rowNum = 2; rowNum <= lastRow; rowNum++) {
          try {
            // Try to get Company ID from JSON data
            const jsonPart1 = sheet.getRange(rowNum, 4).getValue() || ''; // Now column 4 (was 3)
            const jsonPart2 = sheet.getRange(rowNum, 5).getValue() || ''; // Now column 5 (was 4)
            const jsonPart3 = sheet.getRange(rowNum, 6).getValue() || ''; // Now column 6 (was 5)
            const fullJson = (String(jsonPart1) + String(jsonPart2) + String(jsonPart3)).trim();
            
            if (fullJson && fullJson.startsWith('{')) {
              const jsonData = JSON.parse(fullJson);
              const companyId = jsonData.companyId || 'CMP-AQUALITYPOOL'; // Default to admin company
              sheet.getRange(rowNum, 1).setValue(companyId);
            } else {
              // No JSON or invalid JSON - default to admin company
              sheet.getRange(rowNum, 1).setValue('CMP-AQUALITYPOOL');
            }
          } catch (e) {
            // Error parsing - default to admin company
            Logger.log('⚠️ Error parsing JSON for row ' + rowNum + ', defaulting to CMP-AQUALITYPOOL: ' + e.toString());
            sheet.getRange(rowNum, 1).setValue('CMP-AQUALITYPOOL');
          }
        }
        SpreadsheetApp.flush();
        Logger.log('✅ Migration complete - all rows have Company ID');
      }
      
      results.updated.push(INVOICES_ESTIMATES_SHEET1 + ' (migrated from 7 to 8 columns with Company ID)');
      Logger.log('✓ Migrated Invoices & Estimates sheet to 8 columns');
    } else if (lastCol !== 8) {
      Logger.log('⚠ Invoices & Estimates sheet needs to be updated to 8 columns (currently has ' + lastCol + ')');
      
      // Clear all data beyond 8 columns if updating existing sheet
      if (!isNew && lastCol > 8) {
        sheet.deleteColumns(9, lastCol - 8);
      }
      // Add missing columns if needed
      if (lastCol < 8) {
        sheet.insertColumns(lastCol + 1, 8 - lastCol);
      }
      // Set headers
      sheet.getRange(1, 1, 1, 8).setValues([headers]);
      formatHeaderRow(sheet, 8);
      if (!isNew) {
        results.updated.push(INVOICES_ESTIMATES_SHEET1 + ' (updated to 8 columns with Company ID)');
        Logger.log('✓ Updated Invoices & Estimates sheet to 8 columns');
      }
    } else {
      // Check if headers match
      const existingHeaders = sheet.getRange(1, 1, 1, 8).getValues()[0];
      const headersMatch = JSON.stringify(existingHeaders.filter(h => h)) === JSON.stringify(headers);
      
      if (!headersMatch) {
        Logger.log('⚠ Headers do not match - updating headers');
        sheet.getRange(1, 1, 1, 8).setValues([headers]);
        formatHeaderRow(sheet, 8);
        if (!isNew) {
          results.updated.push(INVOICES_ESTIMATES_SHEET1 + ' (headers updated)');
        }
      }
    }
    
    if (isNew) {
      sheet.getRange(1, 1, 1, 8).setValues([headers]);
      formatHeaderRow(sheet, 8);
      Logger.log('✓ Created Invoices & Estimates sheet with 8 columns');
    } else if (lastCol === 8) {
      Logger.log('✓ Invoices & Estimates sheet already has correct 8 columns');
    }
  } catch (error) {
    Logger.log('Error ensuring invoice sheet: ' + error.toString());
    results.errors.push('Invoices & Estimates sheet: ' + error.toString());
  }
}

/**
 * Create scheduled triggers for recurring invoices and reminders
 */
function createScheduledTriggers() {
  try {
    // Delete existing triggers first
    const triggers = ScriptApp.getProjectTriggers();
    let deletedCount = 0;
    
    triggers.forEach(trigger => {
      const handler = trigger.getHandlerFunction();
      if (handler === 'processRecurringInvoices' || 
          handler === 'sendOverdueReminders') {
        ScriptApp.deleteTrigger(trigger);
        deletedCount++;
      }
    });
    
    if (deletedCount > 0) {
      Logger.log('Deleted ' + deletedCount + ' existing trigger(s)');
    }
    
    // Daily trigger for recurring invoices (runs at 9 AM)
    ScriptApp.newTrigger('processRecurringInvoices')
      .timeBased()
      .everyDays(1)
      .atHour(9)
      .create();
    Logger.log('✓ Created daily trigger for recurring invoices (9 AM)');
    
    // Weekly trigger for overdue reminders (runs Monday at 9 AM)
    ScriptApp.newTrigger('sendOverdueReminders')
      .timeBased()
      .onWeekDay(ScriptApp.WeekDay.MONDAY)
      .atHour(9)
      .create();
    Logger.log('✓ Created weekly trigger for overdue reminders (Monday 9 AM)');
    
    Logger.log('=== TRIGGERS SETUP COMPLETE ===');
    return {
      success: true,
      message: 'Scheduled triggers created successfully',
      deleted: deletedCount,
      created: 2
    };
  } catch (error) {
    Logger.log('Error creating triggers: ' + error.toString());
    Logger.log('Stack: ' + error.stack);
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Run complete setup (sheets + triggers)
 */
function runCompleteSetup() {
  Logger.log('=== STARTING COMPLETE SETUP ===');
  const sheetResult = setupInvoiceSystem();
  const triggerResult = createScheduledTriggers();
  
  return {
    success: sheetResult.success && triggerResult.success,
    sheets: sheetResult,
    triggers: triggerResult
  };
}

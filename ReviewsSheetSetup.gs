/**
 * Reviews Sheet Setup Script
 * 
 * This script adds new columns to the existing Reviews sheet for payment portal tracking:
 * - InvoiceID: Links review requests to invoices
 * - ReviewAction: Tracks customer action (Shown/Yes/No)
 * - ReviewPlatform: Tracks which platform (Google/Facebook)
 * 
 * SETUP INSTRUCTIONS:
 * 1. Open your Google Sheet: https://docs.google.com/spreadsheets/d/1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0/edit
 * 2. Go to Extensions > Apps Script
 * 3. Create a new file and paste this code
 * 4. Run the setupReviewsSheet() function
 * 5. The new columns will be added to your existing Reviews sheet
 * 
 * SAFE TO RUN MULTIPLE TIMES:
 * This script is idempotent - it will only add columns that don't exist,
 * so you can run it multiple times without duplicating columns or losing data.
 */

// Configuration - Use same spreadsheet as your system
const SPREADSHEET_ID = '1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0';
const REVIEWS_SHEET = 'Reviews';

/**
 * Main setup function - Adds new columns to Reviews sheet
 * Safe to run multiple times - won't duplicate columns or lose data
 */
function setupReviewsSheet() {
  Logger.log('═══════════════════════════════════════════════════════════');
  Logger.log('STARTING REVIEWS SHEET SETUP');
  Logger.log('═══════════════════════════════════════════════════════════');
  
  try {
    Logger.log('📊 Opening spreadsheet...');
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    Logger.log('✅ Spreadsheet opened successfully');
    
    // Check if Reviews sheet exists
    let reviewsSheet = spreadsheet.getSheetByName(REVIEWS_SHEET);
    
    if (!reviewsSheet) {
      Logger.log('❌ Reviews sheet not found!');
      Logger.log('   Please make sure the Reviews sheet exists before running this setup.');
      return {
        success: false,
        error: 'Reviews sheet not found. Please create it first or import your existing data.'
      };
    }
    
    Logger.log('✅ Reviews sheet found');
    Logger.log('📋 Current sheet has ' + reviewsSheet.getLastRow() + ' rows and ' + reviewsSheet.getLastColumn() + ' columns');
    
    // Get current headers
    const headerRow = reviewsSheet.getRange(1, 1, 1, reviewsSheet.getLastColumn()).getValues()[0];
    Logger.log('📝 Current headers: ' + headerRow.join(', '));
    
    // Create header map for easy lookup
    const headerMap = {};
    headerRow.forEach((h, i) => {
      if (h) headerMap[h.toString().trim()] = i;
    });
    
    // Check which columns need to be added
    const columnsToAdd = [];
    
    if (!headerMap['InvoiceID']) {
      columnsToAdd.push({ name: 'InvoiceID', description: 'Links review request to invoice ID' });
    }
    
    if (!headerMap['ReviewAction']) {
      columnsToAdd.push({ name: 'ReviewAction', description: 'Tracks customer action: Shown/Yes/No' });
    }
    
    if (!headerMap['ReviewPlatform']) {
      columnsToAdd.push({ name: 'ReviewPlatform', description: 'Tracks platform: Google/Facebook' });
    }
    
    if (columnsToAdd.length === 0) {
      Logger.log('✅ All new columns already exist! No changes needed.');
      Logger.log('═══════════════════════════════════════════════════════════');
      return {
        success: true,
        message: 'All columns already exist. No changes made.',
        columnsAdded: 0
      };
    }
    
    Logger.log('📊 Adding ' + columnsToAdd.length + ' new column(s)...');
    
    // Get the last column index
    let lastCol = reviewsSheet.getLastColumn();
    
    // Add each new column
    for (const col of columnsToAdd) {
      lastCol++;
      Logger.log('   ➕ Adding column: ' + col.name + ' (Column ' + String.fromCharCode(64 + lastCol) + ')');
      
      // Add header
      reviewsSheet.getRange(1, lastCol).setValue(col.name);
      
      // Fill existing rows with empty values (preserves data structure)
      const dataRowCount = reviewsSheet.getLastRow() - 1; // Exclude header row
      if (dataRowCount > 0) {
        const emptyRange = reviewsSheet.getRange(2, lastCol, dataRowCount, 1);
        emptyRange.setValue(''); // Set empty string for existing rows
        Logger.log('      ✓ Added empty values for ' + dataRowCount + ' existing row(s)');
      }
    }
    
    // Format header row (refresh formatting for all headers)
    const newLastCol = reviewsSheet.getLastColumn();
    const headerRange = reviewsSheet.getRange(1, 1, 1, newLastCol);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#0369a1');
    headerRange.setFontColor('#ffffff');
    headerRange.setHorizontalAlignment('center');
    headerRange.setVerticalAlignment('middle');
    
    Logger.log('✅ Header formatting applied');
    
    // Log summary
    Logger.log('');
    Logger.log('═══════════════════════════════════════════════════════════');
    Logger.log('SETUP COMPLETE!');
    Logger.log('═══════════════════════════════════════════════════════════');
    Logger.log('✅ Added ' + columnsToAdd.length + ' new column(s):');
    columnsToAdd.forEach(col => {
      Logger.log('   • ' + col.name + ' - ' + col.description);
    });
    Logger.log('✅ All existing data preserved');
    Logger.log('✅ Sheet now has ' + reviewsSheet.getLastColumn() + ' columns');
    Logger.log('═══════════════════════════════════════════════════════════');
    
    return {
      success: true,
      message: 'Setup completed successfully',
      columnsAdded: columnsToAdd.length,
      columns: columnsToAdd.map(c => c.name),
      totalColumns: reviewsSheet.getLastColumn(),
      totalRows: reviewsSheet.getLastRow()
    };
    
  } catch (error) {
    Logger.log('═══════════════════════════════════════════════════════════');
    Logger.log('❌ SETUP FAILED');
    Logger.log('═══════════════════════════════════════════════════════════');
    Logger.log('Error: ' + error.toString());
    Logger.log('Stack: ' + (error.stack || 'No stack trace'));
    Logger.log('═══════════════════════════════════════════════════════════');
    
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Verify setup - Check if all required columns exist
 */
function verifyReviewsSheetSetup() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const reviewsSheet = spreadsheet.getSheetByName(REVIEWS_SHEET);
    
    if (!reviewsSheet) {
      return {
        success: false,
        error: 'Reviews sheet not found'
      };
    }
    
    const headerRow = reviewsSheet.getRange(1, 1, 1, reviewsSheet.getLastColumn()).getValues()[0];
    const headerMap = {};
    headerRow.forEach((h, i) => {
      if (h) headerMap[h.toString().trim()] = i;
    });
    
    const requiredColumns = ['InvoiceID', 'ReviewAction', 'ReviewPlatform'];
    const missingColumns = requiredColumns.filter(col => !headerMap[col]);
    
    return {
      success: missingColumns.length === 0,
      totalColumns: reviewsSheet.getLastColumn(),
      totalRows: reviewsSheet.getLastRow(),
      hasInvoiceID: !!headerMap['InvoiceID'],
      hasReviewAction: !!headerMap['ReviewAction'],
      hasReviewPlatform: !!headerMap['ReviewPlatform'],
      missingColumns: missingColumns,
      message: missingColumns.length === 0 
        ? 'All required columns exist' 
        : 'Missing columns: ' + missingColumns.join(', ')
    };
  } catch (error) {
    return {
      success: false,
      error: error.toString()
    };
  }
}


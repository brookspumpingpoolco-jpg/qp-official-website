/**
 * Contact Form Sheet Setup Script
 * 
 * This script sets up a "Contact Us" sheet in your Google Spreadsheet
 * for storing contact form submissions.
 * 
 * INSTRUCTIONS:
 * 1. Open Google Apps Script: https://script.google.com
 * 2. Create a new project or open an existing one
 * 3. Copy this entire code into the script editor
 * 4. Click "Run" > "setupContactFormSheet"
 * 5. Authorize permissions when prompted
 * 6. Check your spreadsheet - the sheet should be created and formatted
 */

// Configuration
const SPREADSHEET_ID = '1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0';
const SHEET_NAME = 'Contact Us';

/**
 * Main setup function - run this to create and format the Contact Us sheet
 */
function setupContactFormSheet() {
  try {
    // Open the spreadsheet
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // Check if sheet already exists
    let sheet = spreadsheet.getSheetByName(SHEET_NAME);
    
    if (sheet) {
      Logger.log('Sheet "' + SHEET_NAME + '" already exists. Updating format...');
      // Clear existing data but keep the sheet
      sheet.clear();
    } else {
      Logger.log('Creating new sheet "' + SHEET_NAME + '"...');
      // Create new sheet
      sheet = spreadsheet.insertSheet(SHEET_NAME);
    }
    
    // Format Row 1 - Leave blank for logo
    sheet.setRowHeight(1, 120); // Set height for logo
    sheet.getRange(1, 1, 1, 7).merge(); // Merge cells A1:G1 for logo placement
    sheet.getRange(1, 1, 1, 7).setVerticalAlignment('top');
    sheet.getRange(1, 1, 1, 7).setHorizontalAlignment('center');
    sheet.getRange(1, 1, 1, 7).setBackground('#f9fafb'); // Light gray background
    
    // Set headers in row 2
    const headers = [
      ['Timestamp', 'Name', 'Email', 'Phone', 'Service', 'Message', 'Images']
    ];
    const headerRange = sheet.getRange(2, 1, 1, headers[0].length);
    headerRange.setValues(headers);
    
    // Format header row
    headerRange.setFontWeight('bold');
    headerRange.setFontSize(12);
    headerRange.setBackground('#0284c7'); // Blue background
    headerRange.setFontColor('#ffffff'); // White text
    headerRange.setHorizontalAlignment('center');
    headerRange.setVerticalAlignment('middle');
    
    // Add borders to header row
    headerRange.setBorder(true, true, true, true, true, true, '#ffffff', SpreadsheetApp.BorderStyle.SOLID);
    
    // Format header row height
    sheet.setRowHeight(2, 40);
    
    // Format columns
    sheet.setColumnWidth(1, 180); // Timestamp
    sheet.setColumnWidth(2, 150); // Name
    sheet.setColumnWidth(3, 220); // Email
    sheet.setColumnWidth(4, 140); // Phone
    sheet.setColumnWidth(5, 150); // Service
    sheet.setColumnWidth(6, 400); // Message
    sheet.setColumnWidth(7, 120); // Images
    
    // Format data rows (starting from row 3)
    // Set text wrapping for Message column
    sheet.getRange(3, 6, 1000, 1).setWrap(true); // Message column
    
    // Format Timestamp column as date/time
    sheet.getRange(3, 1, 1000, 1).setNumberFormat('mm/dd/yyyy hh:mm:ss AM/PM');
    
    // Format Email column as text (to preserve formatting)
    sheet.getRange(3, 3, 1000, 1).setNumberFormat('@');
    
    // Format Phone column as text
    sheet.getRange(3, 4, 1000, 1).setNumberFormat('@');
    
    // Set default row height for data rows
    sheet.setRowHeight(3, 30);
    
    // Add borders to data area
    const dataRange = sheet.getRange(3, 1, 1000, 7);
    dataRange.setBorder(true, true, true, true, false, false, '#e5e7eb', SpreadsheetApp.BorderStyle.SOLID);
    
    // Freeze header row (row 2) so it stays visible when scrolling
    sheet.setFrozenRows(2);
    
    // Set sheet tab color
    sheet.setTabColor('#0284c7');
    
    // Protect row 1 (logo row) from editing
    const logoRange = sheet.getRange(1, 1, 1, 7);
    const protection = logoRange.protect().setDescription('Logo row - do not edit');
    protection.removeEditors(protection.getEditors());
    if (protection.canDomainEdit()) {
      protection.setDomainEdit(false);
    }
    
    Logger.log('✅ Sheet "' + SHEET_NAME + '" has been set up successfully!');
    Logger.log('📊 Spreadsheet URL: https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID + '/edit');
    
    return {
      success: true,
      message: 'Contact form sheet set up successfully',
      sheetName: SHEET_NAME,
      spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID + '/edit'
    };
    
  } catch (error) {
    Logger.log('❌ Error setting up sheet: ' + error.toString());
    Logger.log('Error stack: ' + error.stack);
    throw error;
  }
}

/**
 * Test function to verify the setup
 */
function testContactFormSheet() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      Logger.log('❌ Sheet not found!');
      return;
    }
    
    // Check row 1 formatting
    const row1Height = sheet.getRowHeight(1);
    Logger.log('Row 1 height: ' + row1Height);
    
    // Check headers
    const headers = sheet.getRange(2, 1, 1, 7).getValues()[0];
    Logger.log('Headers: ' + headers.join(', '));
    
    // Check frozen rows
    const frozenRows = sheet.getFrozenRows();
    Logger.log('Frozen rows: ' + frozenRows);
    
    Logger.log('✅ Sheet setup verified!');
    
  } catch (error) {
    Logger.log('❌ Error testing sheet: ' + error.toString());
  }
}


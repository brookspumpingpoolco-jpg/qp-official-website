/**
 * CUSTOMERS SHEET SETUP
 * Sets up multi-tenant Customers sheet with Company ID
 * No external dependencies - 100% owned platform
 */

const SPREADSHEET_ID = '1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0';

/**
 * Setup Customers Sheet with Company ID
 */
function setupCustomersSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  // Check if Customers sheet exists
  let sheet = ss.getSheetByName('Customers');
  
  if (!sheet) {
    // Create new sheet
    sheet = ss.insertSheet('Customers');
    Logger.log('Created new Customers sheet');
  } else {
    Logger.log('Customers sheet already exists - will add Company ID column');
    
    // Insert Company ID as column A
    sheet.insertColumnBefore(1);
    Logger.log('Inserted Company ID column at position A');
  }
  
  // Setup headers with 3 JSON columns for flexible custom data
  const headers = [
    'Company ID',
    'Customer ID', 
    'Name',
    'Email',
    'Phone',
    'Address',
    'City',
    'State',
    'Zip Code',
    'Notes',
    'Created Date',
    'Last Updated',
    'Pool Data JSON',      // Gate codes, pool type, equipment
    'Service Data JSON',   // Service history, preferences, schedules
    'Custom Data JSON'     // Any other custom fields
  ];
  
  // Set headers in row 1
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  
  // Format header row
  headerRange.setBackground('#1a1a1a');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');
  
  // Set column widths
  sheet.setColumnWidth(1, 180);  // Company ID
  sheet.setColumnWidth(2, 150);  // Customer ID
  sheet.setColumnWidth(3, 200);  // Name
  sheet.setColumnWidth(4, 220);  // Email
  sheet.setColumnWidth(5, 150);  // Phone
  sheet.setColumnWidth(6, 250);  // Address
  sheet.setColumnWidth(7, 120);  // City
  sheet.setColumnWidth(8, 80);   // State
  sheet.setColumnWidth(9, 100);  // Zip Code
  sheet.setColumnWidth(10, 200); // Notes
  sheet.setColumnWidth(11, 150); // Created Date
  sheet.setColumnWidth(12, 150); // Last Updated
  sheet.setColumnWidth(13, 300); // Pool Data JSON
  sheet.setColumnWidth(14, 300); // Service Data JSON
  sheet.setColumnWidth(15, 300); // Custom Data JSON
  
  // Freeze header row
  sheet.setFrozenRows(1);
  
  // If there are existing rows (starting at row 2), fill Company ID with CMP-AQUALITYPOOL
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const companyIdRange = sheet.getRange(2, 1, lastRow - 1, 1);
    const companyIds = new Array(lastRow - 1).fill(['CMP-AQUALITYPOOL']);
    companyIdRange.setValues(companyIds);
    Logger.log(`Filled ${lastRow - 1} existing rows with CMP-AQUALITYPOOL`);
  }
  
  Logger.log('✅ Customers sheet setup complete!');
  return 'Customers sheet configured successfully';
}

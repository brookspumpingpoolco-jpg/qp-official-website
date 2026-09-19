/**
 * Customer Portal Sheet Setup Script
 * 
 * This script sets up the Customer Portal sheet in your Google Spreadsheet
 * with proper formatting, structure, and all required columns including
 * the "_ saved data" column for future saved data.
 * 
 * SETUP INSTRUCTIONS:
 * 1. Open your Google Sheet: https://docs.google.com/spreadsheets/d/1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0/edit
 * 2. Go to Extensions > Apps Script
 * 3. Paste this code into the script editor
 * 4. Run the setupCustomerPortalSheet() function
 * 5. The sheet will be created and formatted automatically
 * 
 * SHEET STRUCTURE:
 * - Row 1: Blank (reserved for company logo)
 * - Row 2: Headers
 * - Row 3+: Customer data
 */

// Configuration
const SPREADSHEET_ID = '1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0';
const CUSTOMER_PORTAL_SHEET_NAME = 'Customer Portal';

/**
 * Main setup function - creates and formats the Customer Portal sheet
 */
function setupCustomerPortalSheet() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // Check if sheet already exists
    let customerPortalSheet = spreadsheet.getSheetByName(CUSTOMER_PORTAL_SHEET_NAME);
    if (customerPortalSheet) {
      Logger.log('Customer Portal sheet already exists. Updating structure...');
      // Don't delete, just update headers if needed
    } else {
      // Create new sheet
      customerPortalSheet = spreadsheet.insertSheet(CUSTOMER_PORTAL_SHEET_NAME);
    }
    
    // Format Row 1 - Leave blank for logo
    customerPortalSheet.setRowHeight(1, 120); // Set height for logo
    const logoRange = customerPortalSheet.getRange(1, 1, 1, 20);
    logoRange.merge(); // Merge cells for logo placement
    logoRange.setVerticalAlignment('top');
    logoRange.setHorizontalAlignment('center');
    logoRange.setBackground('#f8f9fa');
    logoRange.setBorder(true, true, true, true, true, true, '#e0e0e0', SpreadsheetApp.BorderStyle.SOLID);
    
    // Set headers in row 2
    const headers = [
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
      '_ saved data',  // Column for future saved data (quotes, preferences, etc.)
      'Phone',
      'Last Updated'
    ];
    
    const headerRange = customerPortalSheet.getRange(2, 1, 1, headers.length);
    headerRange.setValues([headers]);
    headerRange.setFontWeight('bold');
    headerRange.setFontSize(11);
    headerRange.setBackground('#0369a1');
    headerRange.setFontColor('#ffffff');
    headerRange.setHorizontalAlignment('center');
    headerRange.setVerticalAlignment('middle');
    headerRange.setBorder(true, true, true, true, true, true, '#ffffff', SpreadsheetApp.BorderStyle.SOLID);
    customerPortalSheet.setRowHeight(2, 40);
    
    // Format columns
    customerPortalSheet.setColumnWidth(1, 180);   // Name
    customerPortalSheet.setColumnWidth(2, 220);   // Email
    customerPortalSheet.setColumnWidth(3, 200);  // Password Hash
    customerPortalSheet.setColumnWidth(4, 140);  // Account Status
    customerPortalSheet.setColumnWidth(5, 150);   // Signup Token
    customerPortalSheet.setColumnWidth(6, 160);   // Token Expires
    customerPortalSheet.setColumnWidth(7, 250);   // Address
    customerPortalSheet.setColumnWidth(8, 120);   // Gate Code
    customerPortalSheet.setColumnWidth(9, 200);   // House Info
    customerPortalSheet.setColumnWidth(10, 200);   // Pool Issues
    customerPortalSheet.setColumnWidth(11, 100);   // Pets
    customerPortalSheet.setColumnWidth(12, 120);   // Pool Type
    customerPortalSheet.setColumnWidth(13, 200);   // Google Drive Folder ID
    customerPortalSheet.setColumnWidth(14, 180);   // Square Customer ID
    customerPortalSheet.setColumnWidth(15, 160);   // Created Date
    customerPortalSheet.setColumnWidth(16, 160);   // Last Login
    customerPortalSheet.setColumnWidth(17, 300);   // Notes
    customerPortalSheet.setColumnWidth(18, 400);   // _ saved data (larger for JSON data)
    customerPortalSheet.setColumnWidth(19, 150);   // Phone
    customerPortalSheet.setColumnWidth(20, 160);   // Last Updated
    
    // Add data validation for Account Status column (Column D)
    const accountStatusValidation = SpreadsheetApp.newDataValidation()
      .requireValueInList(['Active', 'Pending', 'Suspended'], true)
      .setAllowInvalid(false)
      .setHelpText('Select account status: Active, Pending, or Suspended');
    customerPortalSheet.getRange(3, 4, 1000, 1).setDataValidation(accountStatusValidation);
    
    // Format date/time columns
    customerPortalSheet.getRange(3, 6, 1000, 1).setNumberFormat('mm/dd/yyyy hh:mm:ss'); // Token Expires
    customerPortalSheet.getRange(3, 15, 1000, 1).setNumberFormat('mm/dd/yyyy hh:mm:ss'); // Created Date
    customerPortalSheet.getRange(3, 16, 1000, 1).setNumberFormat('mm/dd/yyyy hh:mm:ss'); // Last Login
    customerPortalSheet.getRange(3, 20, 1000, 1).setNumberFormat('mm/dd/yyyy hh:mm:ss'); // Last Updated
    
    // Format text columns
    customerPortalSheet.getRange(3, 3, 1000, 1).setNumberFormat('@'); // Password Hash
    customerPortalSheet.getRange(3, 5, 1000, 1).setNumberFormat('@'); // Signup Token
    customerPortalSheet.getRange(3, 13, 1000, 1).setNumberFormat('@'); // Google Drive Folder ID
    customerPortalSheet.getRange(3, 14, 1000, 1).setNumberFormat('@'); // Square Customer ID
    customerPortalSheet.getRange(3, 18, 1000, 1).setNumberFormat('@'); // _ saved data (JSON format)
    
    // Set default row height for data rows
    customerPortalSheet.setRowHeight(3, 30);
    
    // Add borders to data rows
    const dataRange = customerPortalSheet.getRange(3, 1, 1000, 20);
    dataRange.setBorder(true, true, true, true, false, false, '#e0e0e0', SpreadsheetApp.BorderStyle.SOLID);
    
    // Freeze header row (row 2)
    customerPortalSheet.setFrozenRows(2);
    
    // Set sheet tab color
    customerPortalSheet.setTabColor('#10b981'); // Green color to distinguish from Authentication sheet
    
    // Add alternating row colors for readability
    const dataRows = customerPortalSheet.getRange(3, 1, 1000, 20);
    const formats = [];
    for (let i = 0; i < 1000; i++) {
      formats.push(i % 2 === 0 ? '#ffffff' : '#f8f9fa');
    }
    for (let col = 1; col <= 20; col++) {
      for (let row = 0; row < 1000; row++) {
        customerPortalSheet.getRange(row + 3, col).setBackground(formats[row]);
      }
    }
    
    Logger.log('Customer Portal sheet setup completed successfully!');
    Logger.log('Sheet name: ' + CUSTOMER_PORTAL_SHEET_NAME);
    Logger.log('Total columns: ' + headers.length);
    Logger.log('_ saved data column: Column R (18)');
    
    return 'Customer Portal sheet setup completed successfully!';
    
  } catch (error) {
    Logger.log('Setup error: ' + error.toString());
    throw error;
  }
}

/**
 * Migrate customer data from Authentication sheet to Customer Portal sheet
 * This function should be run once to migrate existing customer data
 */
function migrateCustomersToPortalSheet() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = spreadsheet.getSheetByName('Authentication');
    const portalSheet = spreadsheet.getSheetByName(CUSTOMER_PORTAL_SHEET_NAME);
    
    if (!authSheet) {
      return 'Authentication sheet not found';
    }
    
    if (!portalSheet) {
      return 'Customer Portal sheet not found. Please run setupCustomerPortalSheet() first.';
    }
    
    const authData = authSheet.getDataRange().getValues();
    if (authData.length <= 2) {
      return 'No customer data found in Authentication sheet';
    }
    
    // Find column indices in Authentication sheet
    let headers = [];
    let dataStartRow = 2;
    
    if (authData.length > 1) {
      headers = authData[1]; // Row 2
    } else if (authData.length > 0) {
      headers = authData[0];
      dataStartRow = 1;
    }
    
    let emailCol = -1;
    let nameCol = -1;
    let passwordCol = -1;
    let roleCol = -1;
    let statusCol = -1;
    let accountStatusCol = -1;
    
    for (let i = 0; i < headers.length; i++) {
      const header = (headers[i] || '').toString().toLowerCase().trim();
      if (header === 'email' || header === 'email address') emailCol = i;
      if (header === 'name') nameCol = i;
      if (header === 'password') passwordCol = i;
      if (header === 'role' || header === 'user role') roleCol = i;
      if (header === 'status') statusCol = i;
      if (header === 'account status') accountStatusCol = i;
    }
    
    if (emailCol === -1) {
      return 'Email column not found in Authentication sheet';
    }
    
    // Get existing emails from Customer Portal sheet to avoid duplicates
    const portalData = portalSheet.getDataRange().getValues();
    const existingEmails = new Set();
    if (portalData.length > 2) {
      const portalHeaders = portalData[1] || portalData[0];
      const portalEmailCol = portalHeaders.indexOf('Email');
      if (portalEmailCol !== -1) {
        for (let i = 2; i < portalData.length; i++) {
          const email = (portalData[i][portalEmailCol] || '').toString().toLowerCase().trim();
          if (email) existingEmails.add(email);
        }
      }
    }
    
    let migratedCount = 0;
    const now = new Date();
    
    // Migrate customers (only those with Role = 'Customer')
    for (let i = dataStartRow; i < authData.length; i++) {
      const row = authData[i];
      const email = (row[emailCol] || '').toString().toLowerCase().trim();
      const role = (row[roleCol] || '').toString();
      
      // Only migrate customers
      if (role !== 'Customer' || !email) continue;
      
      // Skip if already exists
      if (existingEmails.has(email)) {
        Logger.log('Skipping ' + email + ' - already exists in Customer Portal sheet');
        continue;
      }
      
      const name = (row[nameCol] || '').toString();
      const password = (row[passwordCol] || '').toString();
      const status = (row[statusCol] || '').toString();
      const accountStatus = (row[accountStatusCol] || '').toString();
      
      // Create new row in Customer Portal sheet
      const newRow = [
        name,                                    // Name
        email,                                   // Email
        password,                                // Password Hash
        accountStatus || 'Pending',              // Account Status
        '',                                      // Signup Token
        '',                                      // Token Expires
        '',                                      // Address
        '',                                      // Gate Code
        '',                                      // House Info
        '',                                      // Pool Issues
        '',                                      // Pets
        '',                                      // Pool Type
        '',                                      // Google Drive Folder ID
        '',                                      // Square Customer ID
        now,                                     // Created Date
        '',                                      // Last Login
        'Migrated from Authentication sheet',   // Notes
        '',                                      // _ saved data
        '',                                      // Phone
        now                                      // Last Updated
      ];
      
      portalSheet.appendRow(newRow);
      migratedCount++;
      Logger.log('Migrated customer: ' + email);
    }
    
    Logger.log('Migration completed. Migrated ' + migratedCount + ' customers.');
    return 'Migration completed successfully! Migrated ' + migratedCount + ' customers.';
    
  } catch (error) {
    Logger.log('Migration error: ' + error.toString());
    return 'Migration error: ' + error.toString();
  }
}


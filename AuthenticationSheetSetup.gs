/**
 * Authentication Sheet Setup Script
 * 
 * This script sets up the Authentication sheet in your Google Spreadsheet
 * with proper formatting, structure, and initial admin user.
 * 
 * SETUP INSTRUCTIONS:
 * 1. Open your Google Sheet: https://docs.google.com/spreadsheets/d/1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0/edit
 * 2. Go to Extensions > Apps Script
 * 3. Paste this code into the script editor
 * 4. Run the setupAuthenticationSheet() function
 * 5. The sheet will be created and formatted automatically
 * 
 * SHEET STRUCTURE:
 * - Row 1: Blank (reserved for company logo)
 * - Row 2: Headers
 * - Row 3+: User data
 */

// Configuration
const SPREADSHEET_ID = '1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0';
const AUTH_SHEET_NAME = 'Authentication';

/**
 * Main setup function - creates and formats the Authentication sheet
 */
function setupAuthenticationSheet() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // Check if sheet already exists, delete it if it does
    let authSheet = spreadsheet.getSheetByName(AUTH_SHEET_NAME);
    if (authSheet) {
      spreadsheet.deleteSheet(authSheet);
    }
    
    // Create new sheet
    authSheet = spreadsheet.insertSheet(AUTH_SHEET_NAME);
    
    // Format Row 1 - Leave blank for logo
    authSheet.setRowHeight(1, 120); // Set height for logo
    const logoRange = authSheet.getRange(1, 1, 1, 12);
    logoRange.merge(); // Merge cells for logo placement
    logoRange.setVerticalAlignment('top');
    logoRange.setHorizontalAlignment('center');
    logoRange.setBackground('#f8f9fa');
    logoRange.setBorder(true, true, true, true, true, true, '#e0e0e0', SpreadsheetApp.BorderStyle.SOLID);
    
    // Set headers in row 2
    const headers = [
      'Name',
      'Email',
      'Password',
      'Role',
      'Status',
      'Account Status',
      'Verification Code',
      'Last Verification Time',
      'Verification Expires',
      'Date Created',
      'Last Login',
      'Company',
      'Company ID',
      'Trial End Date',
      'Plan Type',
      'Features',
      'Settings'
    ];
    
    const headerRange = authSheet.getRange(2, 1, 1, headers.length);
    headerRange.setValues([headers]);
    headerRange.setFontWeight('bold');
    headerRange.setFontSize(11);
    headerRange.setBackground('#0369a1');
    headerRange.setFontColor('#ffffff');
    headerRange.setHorizontalAlignment('center');
    headerRange.setVerticalAlignment('middle');
    headerRange.setBorder(true, true, true, true, true, true, '#ffffff', SpreadsheetApp.BorderStyle.SOLID);
    authSheet.setRowHeight(2, 40);
    
    // Format columns
    authSheet.setColumnWidth(1, 180);  // Name
    authSheet.setColumnWidth(2, 220);  // Email
    authSheet.setColumnWidth(3, 200);  // Password (hashed)
    authSheet.setColumnWidth(4, 120);  // Role
    authSheet.setColumnWidth(5, 100);  // Status (Active/Inactive)
    authSheet.setColumnWidth(6, 140);  // Account Status (Pending/Approved/Rejected)
    authSheet.setColumnWidth(7, 150);  // Verification Code
    authSheet.setColumnWidth(8, 160);  // Last Verification Time
    authSheet.setColumnWidth(9, 160);  // Verification Expires
    authSheet.setColumnWidth(10, 160); // Date Created
    authSheet.setColumnWidth(11, 160);  // Last Login
    authSheet.setColumnWidth(12, 180);  // Company
    authSheet.setColumnWidth(13, 150);  // Company ID
    authSheet.setColumnWidth(14, 160);  // Trial End Date
    authSheet.setColumnWidth(15, 120);  // Plan Type
    authSheet.setColumnWidth(16, 200);  // Features
    authSheet.setColumnWidth(17, 300);  // Settings
    
    // Add data validation for Status column (Column E)
    const statusValidation = SpreadsheetApp.newDataValidation()
      .requireValueInList(['Active', 'Inactive'], true)
      .setAllowInvalid(false)
      .setHelpText('Select status: Active or Inactive');
    authSheet.getRange(3, 5, 1000, 1).setDataValidation(statusValidation);
    
    // Add data validation for Account Status column (Column F)
    const accountStatusValidation = SpreadsheetApp.newDataValidation()
      .requireValueInList(['Pending', 'Approved', 'Rejected'], true)
      .setAllowInvalid(false)
      .setHelpText('Select account status: Pending, Approved, or Rejected');
    authSheet.getRange(3, 6, 1000, 1).setDataValidation(accountStatusValidation);
    
    // Add data validation for Role column (Column D)
    const roleValidation = SpreadsheetApp.newDataValidation()
      .requireValueInList(['Admin', 'Manager', 'User', 'Guest'], true)
      .setAllowInvalid(false)
      .setHelpText('Select role: Admin, Manager, User, or Guest');
    authSheet.getRange(3, 6, 1000, 1).setDataValidation(roleValidation);
    
    // Format date/time columns
    authSheet.getRange(3, 8, 1000, 1).setNumberFormat('mm/dd/yyyy hh:mm:ss'); // Last Verification Time
    authSheet.getRange(3, 9, 1000, 1).setNumberFormat('mm/dd/yyyy hh:mm:ss'); // Verification Expires
    authSheet.getRange(3, 10, 1000, 1).setNumberFormat('mm/dd/yyyy hh:mm:ss'); // Date Created
    authSheet.getRange(3, 11, 1000, 1).setNumberFormat('mm/dd/yyyy hh:mm:ss'); // Last Login
    
    // Format password column as text
    authSheet.getRange(3, 3, 1000, 1).setNumberFormat('@');
    
    // Format verification code column as text
    authSheet.getRange(3, 7, 1000, 1).setNumberFormat('@');
    
    // Set default row height for data rows
    authSheet.setRowHeight(3, 30);
    
    // Add borders to data rows
    const dataRange = authSheet.getRange(3, 1, 1000, 12);
    dataRange.setBorder(true, true, true, true, false, false, '#e0e0e0', SpreadsheetApp.BorderStyle.SOLID);
    
    // Freeze header row (row 2)
    authSheet.setFrozenRows(2);
    
    // Set sheet tab color
    authSheet.setTabColor('#0369a1');
    
    // Add initial admin user
    const adminEmail = 'samr@aqualitypoolcompanyusa.com';
    const adminPassword = 'ADMIN';
    const hashedPassword = hashPassword(adminPassword);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (23 * 60 * 60 * 1000)); // 23 hours from now
    
    const adminRow = [
      'Sam R',                    // Name
      adminEmail,                 // Email
      hashedPassword,             // Password (hashed)
      'Admin',                    // Role
      'Active',                   // Status
      'Approved',                 // Account Status
      '',                         // Verification Code (empty initially)
      now,                        // Last Verification Time
      expiresAt,                  // Verification Expires
      now,                        // Date Created
      '',                         // Last Login
      'A Quality Pool Company'    // Company
    ];
    
    authSheet.appendRow(adminRow);
    
    // Format the admin row
    const adminRowNum = authSheet.getLastRow();
    const adminRowRange = authSheet.getRange(adminRowNum, 1, 1, 12);
    adminRowRange.setBackground('#e8f5e9'); // Light green background for admin
    
    Logger.log('Authentication sheet setup completed successfully!');
    Logger.log('Admin user created: ' + adminEmail);
    Logger.log('Admin password: ' + adminPassword);
    
    return 'Setup completed successfully! Admin user created.';
    
  } catch (error) {
    Logger.log('Setup error: ' + error.toString());
    throw error;
  }
}

/**
 * Update admin password to ADMIN
 * Run this function if you need to reset the admin password
 */
function updateAdminPassword() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = spreadsheet.getSheetByName(AUTH_SHEET_NAME);
    
    if (!authSheet) {
      Logger.log('Authentication sheet not found');
      return 'Authentication sheet not found. Please run setupAuthenticationSheet() first.';
    }
    
    const adminEmail = 'samr@aqualitypoolcompanyusa.com';
    const adminPassword = 'ADMIN';
    const hashedPassword = hashPassword(adminPassword);
    
    const range = authSheet.getDataRange();
    const values = range.getValues();
    
    // Find admin user (skip row 1 and row 2)
    for (let i = 2; i < values.length; i++) {
      const row = values[i];
      const userEmail = (row[1] || '').toLowerCase().trim();
      
      if (userEmail === adminEmail.toLowerCase()) {
        // Update password
        authSheet.getRange(i + 1, 3).setValue(hashedPassword);
        Logger.log('Admin password updated successfully!');
        Logger.log('Email: ' + adminEmail);
        Logger.log('Password: ' + adminPassword);
        return 'Admin password updated successfully!';
      }
    }
    
    Logger.log('Admin user not found. Creating admin user...');
    // If admin not found, create it
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (23 * 60 * 60 * 1000));
    
    const adminRow = [
      'Sam R',
      adminEmail,
      hashedPassword,
      'Admin',
      'Active',
      'Approved',
      '',
      now,
      expiresAt,
      now,
      '',
      'A Quality Pool Company'
    ];
    
    authSheet.appendRow(adminRow);
    const adminRowNum = authSheet.getLastRow();
    const adminRowRange = authSheet.getRange(adminRowNum, 1, 1, 12);
    adminRowRange.setBackground('#e8f5e9');
    
    Logger.log('Admin user created successfully!');
    return 'Admin user created successfully!';
    
  } catch (error) {
    Logger.log('Error updating admin password: ' + error.toString());
    return 'Error: ' + error.toString();
  }
}

/**
 * Test admin login credentials
 * This function helps debug login issues
 */
function testAdminLogin() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = spreadsheet.getSheetByName(AUTH_SHEET_NAME);
    
    if (!authSheet) {
      Logger.log('ERROR: Authentication sheet not found');
      return 'Authentication sheet not found';
    }
    
    const adminEmail = 'samr@aqualitypoolcompanyusa.com';
    const testPassword = 'ADMIN';
    const expectedHash = hashPassword(testPassword);
    
    Logger.log('=== Admin Login Test ===');
    Logger.log('Email: ' + adminEmail);
    Logger.log('Password: ' + testPassword);
    Logger.log('Expected Hash: ' + expectedHash);
    
    const range = authSheet.getDataRange();
    const values = range.getValues();
    
    // Find admin user (skip row 1 and row 2)
    for (let i = 2; i < values.length; i++) {
      const row = values[i];
      const userEmail = (row[1] || '').toLowerCase().trim();
      
      if (userEmail === adminEmail.toLowerCase()) {
        const storedHash = row[2] || '';
        const status = row[4] || '';
        const accountStatus = row[5] || '';
        const role = row[3] || '';
        
        Logger.log('--- Found User ---');
        Logger.log('Row: ' + (i + 1));
        Logger.log('Email in sheet: ' + row[1]);
        Logger.log('Stored Hash: ' + storedHash);
        Logger.log('Status: ' + status);
        Logger.log('Account Status: ' + accountStatus);
        Logger.log('Role: ' + role);
        Logger.log('Hash Match: ' + (storedHash === expectedHash));
        
        if (storedHash !== expectedHash) {
          Logger.log('WARNING: Password hash does not match!');
          Logger.log('Updating password hash...');
          authSheet.getRange(i + 1, 3).setValue(expectedHash);
          Logger.log('Password hash updated!');
          return 'Password hash was incorrect and has been updated. Try logging in again.';
        }
        
        if (accountStatus !== 'Approved') {
          Logger.log('WARNING: Account status is not Approved');
          return 'Account status: ' + accountStatus + '. Account needs to be Approved.';
        }
        
        if (status !== 'Active') {
          Logger.log('WARNING: Account status is not Active');
          return 'Account status: ' + status + '. Account needs to be Active.';
        }
        
        Logger.log('SUCCESS: Admin credentials are correct!');
        return 'Admin credentials are correct. You should be able to log in.';
      }
    }
    
    Logger.log('ERROR: Admin user not found in sheet');
    return 'Admin user not found. Run updateAdminPassword() to create the admin user.';
    
  } catch (error) {
    Logger.log('ERROR: ' + error.toString());
    return 'Error: ' + error.toString();
  }
}

/**
 * Hash password using SHA-256
 */
function hashPassword(password) {
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    password,
    Utilities.Charset.UTF_8
  ).map(function(byte) {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('');
}


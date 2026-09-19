/**
 * POOL CALCULATOR - AUTHENTICATION SHEET INTEGRATION
 * Adds Square API credentials to the Settings column in Authentication sheet
 * Uses the existing Settings column (JSON format) instead of separate sheet
 */

const SPREADSHEET_ID = '1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0';
const AUTH_SHEET_NAME = 'Authentication';

/**
 * Add Square credentials to a company's Settings column in Authentication sheet
 * The Settings column already exists and stores JSON data per company
 */
function addSquareCredentialsToAuth(companyId, accessToken, applicationId, environment) {
  try {
    if (!companyId) {
      return { success: false, error: 'Company ID is required' };
    }
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = ss.getSheetByName(AUTH_SHEET_NAME);
    
    if (!authSheet) {
      return { success: false, error: 'Authentication sheet not found' };
    }
    
    const data = authSheet.getDataRange().getValues();
    if (data.length < 3) {
      return { success: false, error: 'Authentication sheet is empty' };
    }
    
    // Headers are in row 2 (row 1 is for logo)
    const headers = data[1];
    const companyIdCol = headers.indexOf('Company ID');
    const settingsCol = headers.indexOf('Settings');
    
    if (companyIdCol === -1 || settingsCol === -1) {
      return { success: false, error: 'Required columns not found. Company ID col: ' + companyIdCol + ', Settings col: ' + settingsCol };
    }
    
    // Find the company row (starts at row 3, index 2)
    let companyRowIndex = -1;
    for (let i = 2; i < data.length; i++) {
      if (data[i][companyIdCol] === companyId) {
        companyRowIndex = i;
        break;
      }
    }
    
    if (companyRowIndex === -1) {
      return { success: false, error: 'Company ID not found: ' + companyId };
    }
    
    // Get existing settings or create new
    const existingSettings = data[companyRowIndex][settingsCol] || '{}';
    let settings = {};
    
    try {
      settings = JSON.parse(existingSettings);
    } catch (e) {
      settings = {};
    }
    
    // Add/update Square settings
    settings.square = {
      accessToken: accessToken || '',
      applicationId: applicationId || '',
      environment: environment || 'production',
      lastSync: null,
      enabled: !!(accessToken && applicationId)
    };
    
    // Save back to sheet (row index + 1 for 1-based sheet rows)
    authSheet.getRange(companyRowIndex + 1, settingsCol + 1).setValue(JSON.stringify(settings));
    
    Logger.log(`✅ Updated Square settings for ${companyId}`);
    return {
      success: true,
      message: `Square settings updated for ${companyId}`
    };
    
  } catch (error) {
    Logger.log('❌ Error updating settings: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Setup default Square credentials for A Quality Pool Company
 * Run this once to add Square credentials to your company
 */
function setupDefaultSquareCredentials() {
  return addSquareCredentialsToAuth(
    'CMP-AQUALITYPOOL',
    'EAAAl2-YTctbeMzhzczcgN4kIigUZJtouc1WcldX9PJ4LTFcIGIdOcmfvjFCkDxA',
    'sq0idp-UsE101iI0GHTKs8WSAJwwA',
    'production'
  );
}

/**
 * View Square settings for a company
 */
function viewSquareSettings(companyId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = ss.getSheetByName(AUTH_SHEET_NAME);
    
    if (!authSheet) {
      Logger.log('❌ Authentication sheet not found');
      return;
    }
    
    const data = authSheet.getDataRange().getValues();
    const headers = data[1];
    const companyIdCol = headers.indexOf('Company ID');
    const settingsCol = headers.indexOf('Settings');
    
    if (companyIdCol === -1 || settingsCol === -1) {
      Logger.log('❌ Required columns not found');
      return;
    }
    
    for (let i = 2; i < data.length; i++) {
      if (data[i][companyIdCol] === companyId) {
        const settingsStr = data[i][settingsCol] || '{}';
        const settings = JSON.parse(settingsStr);
        
        Logger.log('✅ Settings for ' + companyId + ':');
        Logger.log(JSON.stringify(settings, null, 2));
        return settings;
      }
    }
    
    Logger.log('❌ Company not found: ' + companyId);
    
  } catch (error) {
    Logger.log('❌ Error: ' + error);
  }
}

/**
 * List all companies and their Square integration status
 */
function listCompanySquareStatus() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = ss.getSheetByName(AUTH_SHEET_NAME);
    
    if (!authSheet) {
      Logger.log('❌ Authentication sheet not found');
      return;
    }
    
    const data = authSheet.getDataRange().getValues();
    const headers = data[1];
    const companyIdCol = headers.indexOf('Company ID');
    const companyCol = headers.indexOf('Company');
    const settingsCol = headers.indexOf('Settings');
    
    Logger.log('====================================');
    Logger.log('SQUARE INTEGRATION STATUS');
    Logger.log('====================================\n');
    
    const companies = new Set();
    
    for (let i = 2; i < data.length; i++) {
      const companyId = data[i][companyIdCol];
      const companyName = data[i][companyCol];
      
      if (companyId && !companies.has(companyId)) {
        companies.add(companyId);
        
        const settingsStr = data[i][settingsCol] || '{}';
        let settings = {};
        try {
          settings = JSON.parse(settingsStr);
        } catch (e) {
          settings = {};
        }
        
        const hasSquare = settings.square && settings.square.enabled;
        const status = hasSquare ? '✅ ENABLED' : '❌ NOT CONFIGURED';
        
        Logger.log(`${companyName} (${companyId})`);
        Logger.log(`  Status: ${status}`);
        if (hasSquare) {
          Logger.log(`  Environment: ${settings.square.environment || 'N/A'}`);
          Logger.log(`  Last Sync: ${settings.square.lastSync || 'Never'}`);
        }
        Logger.log('');
      }
    }
    
    Logger.log('====================================');
    
  } catch (error) {
    Logger.log('❌ Error: ' + error);
  }
}

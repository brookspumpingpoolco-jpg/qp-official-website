/**
 * Google Apps Script for Twilio SMS & Email Newsletter Signup Popup
 * 
 * SETUP INSTRUCTIONS:
 * 1. Open Google Sheets: https://sheets.google.com
 * 2. Open spreadsheet with ID: 1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0
 * 3. Uses existing "SMS and Email Newsletter" sheet (will add SMS/Email Consent columns if needed)
 * 4. Row 1 is blank (for logo), Row 2 has headers
 * 5. Go to Extensions > Apps Script
 * 6. Paste this code
 * 7. Click Deploy > New Deployment
 * 8. Select type: Web app
 * 9. Execute as: Me
 * 10. Who has access: Anyone
 * 11. Click Deploy
 * 12. Copy the Web App URL and use it in your HTML popup code
 */

// Configuration
const SPREADSHEET_ID = '1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0';
const SHEET_NAME = 'SMS and Email Newsletter';

/**
 * Handle form submission from iframe (called by google.script.run)
 */
function submitForm(data) {
  return doPost({parameter: data});
}

/**
 * Handle POST request from the popup form
 */
function doPost(e) {
  try {
    // Handle data from google.script.run (iframe form) or JSON POST
    let data;
    if (e.parameter && e.parameter.name) {
      // Data from google.script.run (iframe)
      data = e.parameter;
    } else if (e.postData && e.postData.contents) {
      // Data from JSON POST
      data = JSON.parse(e.postData.contents);
    } else {
      data = {};
    }
    
    const name = data.name || '';
    const phone = data.phone || '';
    const email = data.email || '';
    const smsConsent = data.smsConsent === true || data.smsConsent === 'true' || data.smsConsent === 'checked';
    const emailConsent = data.emailConsent === true || data.emailConsent === 'true' || data.emailConsent === 'checked';
    
    // Validate required fields
    if (!name || !phone) {
      return ContentService
        .createTextOutput(JSON.stringify({
          success: false,
          error: 'Name and phone number are required'
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Validate phone number (should be 10 digits)
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length !== 10) {
      return ContentService
        .createTextOutput(JSON.stringify({
          success: false,
          error: 'Invalid phone number. Must be 10 digits.'
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Validate SMS consent (required for Twilio compliance)
    if (!smsConsent) {
      return ContentService
        .createTextOutput(JSON.stringify({
          success: false,
          error: 'SMS consent is required to subscribe.'
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Get the spreadsheet and sheet
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = spreadsheet.getSheetByName(SHEET_NAME);
    
    // Create sheet if it doesn't exist
    if (!sheet) {
      sheet = spreadsheet.insertSheet(SHEET_NAME);
      // Leave row 1 blank for logo
      // Add headers in row 2
      const headers = ['Name', 'Phone Number', 'Email', 'SMS Consent', 'Email Consent', 'Date Subscribed'];
      sheet.getRange(2, 1, 1, headers.length).setValues([headers]);
      // Format header row
      const headerRange = sheet.getRange(2, 1, 1, headers.length);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#0284c7');
      headerRange.setFontColor('#ffffff');
    } else {
      // Check if SMS Consent and Email Consent columns exist, add them if not
      const headerRow = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0];
      const hasSmsConsent = headerRow.includes('SMS Consent');
      const hasEmailConsent = headerRow.includes('Email Consent');
      
      if (!hasSmsConsent || !hasEmailConsent) {
        const lastCol = sheet.getLastColumn();
        let nextCol = lastCol + 1;
        
        if (!hasSmsConsent) {
          sheet.getRange(2, nextCol).setValue('SMS Consent');
          sheet.getRange(2, nextCol).setFontWeight('bold');
          sheet.getRange(2, nextCol).setBackground('#0284c7');
          sheet.getRange(2, nextCol).setFontColor('#ffffff');
          nextCol++;
        }
        
        if (!hasEmailConsent) {
          sheet.getRange(2, nextCol).setValue('Email Consent');
          sheet.getRange(2, nextCol).setFontWeight('bold');
          sheet.getRange(2, nextCol).setBackground('#0284c7');
          sheet.getRange(2, nextCol).setFontColor('#ffffff');
        }
      }
    }
    
    // Find the last row (start from row 3 since row 1 is blank and row 2 is headers)
    const lastRow = sheet.getLastRow();
    const nextRow = lastRow < 2 ? 3 : lastRow + 1;
    
    // Format phone number for storage (10 digits)
    const formattedPhone = phoneDigits;
    
    // Find column indices for each field
    const headerRow = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0];
    const nameCol = 1; // Column A
    const phoneCol = 2; // Column B
    const emailCol = 3; // Column C
    const smsConsentCol = headerRow.indexOf('SMS Consent') + 1 || 4; // Column D or next available
    const emailConsentCol = headerRow.indexOf('Email Consent') + 1 || 5; // Column E or next available
    const dateCol = headerRow.indexOf('Date Subscribed') + 1 || sheet.getLastColumn() + 1; // Last column or next
    
    // Add the data
    const dateSubscribed = new Date();
    sheet.getRange(nextRow, nameCol).setValue(name);
    sheet.getRange(nextRow, phoneCol).setValue(formattedPhone);
    sheet.getRange(nextRow, emailCol).setValue(email || ''); // Email is optional
    sheet.getRange(nextRow, smsConsentCol).setValue(smsConsent ? 'Yes' : 'No'); // SMS Consent
    sheet.getRange(nextRow, emailConsentCol).setValue(emailConsent ? 'Yes' : 'No'); // Email Consent
    sheet.getRange(nextRow, dateCol).setValue(dateSubscribed); // Date Subscribed
    
    // Format the date column
    sheet.getRange(nextRow, dateCol).setNumberFormat('mm/dd/yyyy hh:mm:ss AM/PM');
    
    // Return success response
    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        message: 'Successfully subscribed!',
        row: nextRow
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    // Log error for debugging
    Logger.log('Error in doPost: ' + error.toString());
    Logger.log('Error stack: ' + error.stack);
    
    // Return error response
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle GET request - Returns HTML form for iframe (optional, not needed for popup)
 */
function doGet(e) {
  return HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Twilio Signup</title>
    </head>
    <body>
      <p>This endpoint is for POST requests only. Use the popup form on the website.</p>
    </body>
    </html>
  `)
    .setTitle('Twilio SMS Signup')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


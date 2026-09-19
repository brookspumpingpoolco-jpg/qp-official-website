/**
 * Google Apps Script for Contact Form Submission
 * 
 * IMPORTANT: If you get "OAuth client was not found" error, follow these steps:
 * 
 * FIX FOR OAUTH ERROR:
 * 1. In Google Apps Script, click the "Project Settings" gear icon (⚙️) in the left sidebar
 * 2. Scroll down to "Google Cloud Platform (GCP) Project"
 * 3. Click "Change project"
 * 4. Click "Set project number" or "Create a new project"
 * 5. Wait for the project to be created/linked
 * 6. Go to: https://console.cloud.google.com/apis/credentials
 * 7. Select your project from the dropdown
 * 8. Click "OAuth consent screen" in the left menu
 * 9. Select "External" and click "Create"
 * 10. Fill in:
 *    - App name: "Contact Form Handler" (or any name)
 *    - User support email: your email
 *    - Developer contact: your email
 * 11. Click "Save and Continue" through the steps (you can skip optional steps)
 * 12. Go back to Google Apps Script and try deploying again
 * 
 * DEPLOYMENT INSTRUCTIONS:
 * 1. Open Google Apps Script: https://script.google.com
 * 2. Create a new project
 * 3. Copy this entire code into the script editor
 * 4. The script is pre-configured with your settings
 * 5. Click "Deploy" > "New deployment"
 * 6. Click the gear icon (⚙️) next to "Select type"
 * 7. Choose "Web app"
 * 8. Set:
 *    - Description: "Contact Form Handler"
 *    - Execute as: "Me"
 *    - Who has access: "Anyone"
 * 9. Click "Deploy"
 * 10. Authorize the permissions when prompted
 * 11. Copy the Web App URL and update HomePage.html
 */

// Configuration
const SPREADSHEET_ID = '1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0';
const SHEET_NAME = 'Contact Us';
const EMAIL_ADDRESS = 'brookspumpingpoolco@gmail.com';
const TEAM_EMAIL = 'brookspumpingpoolco@gmail.com';
const COMPANY_NAME = 'A Quality Pool Company';
const COMPANY_PHONE = '502-706-9172';
const TWILIO_PHONE = '+15027069172'; // Format: +1XXXXXXXXXX
const SQUARE_BOOKING_URL = 'https://book.squareup.com/appointments/vxsbuetckkjrmv/location/LDNXGCDY0JZXC/services';

// Square API Configuration
const SQUARE_ACCESS_TOKEN = 'REDACTED';
const SQUARE_APPLICATION_ID = 'sq0idp-UsE101iI0GHTKs8WSAJwwA';
const SQUARE_API_VERSION = '2024-12-18';
const SQUARE_ENVIRONMENT = 'production';

// Google Drive Configuration - Parent folder for all customer folders
const CUSTOMER_DRIVE_FOLDER_ID = '1tHpDcPkFJ6B3QDopqzpawZrL9Oun2Nrl';

// Twilio SMS Configuration - DISABLED (not active at this time)
// Get these from: https://console.twilio.com/
// const TWILIO_ACCOUNT_SID = ''; // TODO: Add your Twilio Account SID
// const TWILIO_AUTH_TOKEN = '';  // TODO: Add your Twilio Auth Token
const TWILIO_ACCOUNT_SID = null; // Disabled
const TWILIO_AUTH_TOKEN = null;  // Disabled

// Gemini API Configuration
// Get API key from: https://makersuite.google.com/app/apikey
const GEMINI_API_KEY = 'REDACTED';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent';

// OpenAI DALL-E API Configuration
// Get API key from: https://platform.openai.com/api-keys
const OPENAI_API_KEY = 'REDACTED';
const OPENAI_API_URL = 'https://api.openai.com/v1/images/generations';

/**
 * Get Square API base URL
 */
function getSquareApiUrl() {
  return SQUARE_ENVIRONMENT === 'sandbox' 
    ? 'https://connect.squareupsandbox.com/v2'
    : 'https://connect.squareup.com/v2';
}

/**
 * Main function to handle POST requests
 */
function doPost(e) {
  try {
    let data = {};
    let imageAttachments = [];
    
    // Parse JSON data
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseError) {
      // Fallback: try to get from parameters
      data = {
        name: e.parameter.name || '',
        email: e.parameter.email || '',
        phone: e.parameter.phone || '',
        service: e.parameter.service || '',
        message: e.parameter.message || '',
        timestamp: e.parameter.timestamp || new Date().toISOString()
      };
    }
    
    // Process images if they were sent as base64
    let imageBlobs = [];
    if (data.images && Array.isArray(data.images) && data.images.length > 0) {
      for (let i = 0; i < data.images.length; i++) {
        const image = data.images[i];
        try {
          // Decode base64 and create blob
          const imageBlob = Utilities.newBlob(
            Utilities.base64Decode(image.data),
            image.contentType || 'image/jpeg',
            image.filename || 'job_site_image_' + (i + 1) + '.jpg'
          );
          imageBlobs.push(imageBlob);
          imageAttachments.push(imageBlob); // Keep for email
        } catch (err) {
          Logger.log('Error processing image ' + (i + 1) + ': ' + err.toString());
        }
      }
    }
    
    // Create Square customer
    let squareCustomerId = '';
    let squareCustomerResult = null;
    try {
      squareCustomerResult = createSquareCustomer(data);
      if (squareCustomerResult && squareCustomerResult.success) {
        squareCustomerId = squareCustomerResult.customerId;
        Logger.log('✅ Square customer created: ' + squareCustomerId);
      } else {
        Logger.log('⚠️ Failed to create Square customer: ' + (squareCustomerResult?.error || 'Unknown error'));
      }
    } catch (error) {
      Logger.log('⚠️ Error creating Square customer: ' + error.toString());
    }
    
    // Create Drive folder and save images
    let driveFolderUrl = '';
    let driveFolderName = '';
    let imageUrls = [];
    let folderResult = null;
    try {
      folderResult = createCustomerDriveFolder(data.name, squareCustomerId);
      if (folderResult && folderResult.success) {
        driveFolderUrl = folderResult.folderUrl;
        driveFolderName = folderResult.folderName;
        Logger.log('✅ Drive folder created: ' + driveFolderName);
        
        // Save images to Drive folder and collect URLs
        if (imageBlobs.length > 0 && folderResult.folderId) {
          const folder = DriveApp.getFolderById(folderResult.folderId);
          for (let i = 0; i < imageBlobs.length; i++) {
            try {
              const file = folder.createFile(imageBlobs[i]);
              const fileUrl = file.getUrl();
              imageUrls.push(fileUrl);
              Logger.log('✅ Image saved to Drive: ' + file.getName() + ' - ' + fileUrl);
            } catch (err) {
              Logger.log('⚠️ Error saving image to Drive: ' + err.toString());
            }
          }
        }
      } else {
        Logger.log('⚠️ Failed to create Drive folder: ' + (folderResult?.error || 'Unknown error'));
      }
    } catch (error) {
      Logger.log('⚠️ Error creating Drive folder: ' + error.toString());
    }
    
    // Get the spreadsheet and sheet
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = spreadsheet.getSheetByName(SHEET_NAME);
    
    // Create sheet if it doesn't exist
    if (!sheet) {
      sheet = spreadsheet.insertSheet(SHEET_NAME);
      
      // Format Row 1 - Leave blank for logo
      sheet.setRowHeight(1, 120);
      sheet.getRange(1, 1, 1, 7).merge();
      sheet.getRange(1, 1, 1, 7).setVerticalAlignment('top');
      sheet.getRange(1, 1, 1, 7).setHorizontalAlignment('center');
      sheet.getRange(1, 1, 1, 7).setBackground('#f9fafb');
      
      // Add headers in row 2
      const headers = ['Timestamp', 'Name', 'Email', 'Phone', 'Service', 'Message', 'Images', 'Square Customer ID', 'Drive Folder URL'];
      const headerRange = sheet.getRange(2, 1, 1, headers.length);
      headerRange.setValues([headers]);
      headerRange.setFontWeight('bold');
      headerRange.setFontSize(12);
      headerRange.setBackground('#0284c7');
      headerRange.setFontColor('#ffffff');
      headerRange.setHorizontalAlignment('center');
      headerRange.setVerticalAlignment('middle');
      headerRange.setBorder(true, true, true, true, true, true, '#ffffff', SpreadsheetApp.BorderStyle.SOLID);
      sheet.setRowHeight(2, 40);
      
      // Format columns
      sheet.setColumnWidth(1, 180); // Timestamp
      sheet.setColumnWidth(2, 150); // Name
      sheet.setColumnWidth(3, 220); // Email
      sheet.setColumnWidth(4, 140); // Phone
      sheet.setColumnWidth(5, 150); // Service
      sheet.setColumnWidth(6, 400); // Message
      sheet.setColumnWidth(7, 120); // Images
      sheet.setColumnWidth(8, 200); // Square Customer ID
      sheet.setColumnWidth(9, 300); // Drive Folder URL
      
      // Freeze header row
      sheet.setFrozenRows(2);
      
      // Format data rows
      sheet.getRange(3, 1, 1000, 1).setNumberFormat('mm/dd/yyyy hh:mm:ss AM/PM'); // Timestamp
      sheet.getRange(3, 3, 1000, 1).setNumberFormat('@'); // Email
      sheet.getRange(3, 4, 1000, 1).setNumberFormat('@'); // Phone
      sheet.getRange(3, 6, 1000, 1).setWrap(true); // Message
    }
    
    // Prepare image links for sheet (comma-separated hyperlinks)
    let imageLinksText = '';
    if (imageUrls.length > 0) {
      const imageLinks = imageUrls.map((url, idx) => {
        return `=HYPERLINK("${url}","Image ${idx + 1}")`;
      });
      imageLinksText = imageLinks.join(', ');
    } else {
      imageLinksText = imageAttachments.length > 0 ? imageAttachments.length + ' image(s) attached' : 'No images';
    }
    
    // Prepare row data
    const rowData = [
      new Date(), // Timestamp
      data.name || '',
      data.email || '',
      data.phone || '',
      data.service || '',
      data.message || '',
      imageLinksText, // Images column with hyperlinks
      squareCustomerId || '', // Square Customer ID
      driveFolderUrl || '' // Drive Folder URL
    ];
    
    // Append data to sheet (will automatically go to the next available row after row 2)
    sheet.appendRow(rowData);
    
    // Format the new row
    const lastRow = sheet.getLastRow();
    if (lastRow >= 3) {
      // Format Square Customer ID column (H) - make it a hyperlink if exists
      if (squareCustomerId) {
        const squareUrl = `https://squareup.com/dashboard/customers/${squareCustomerId}`;
        sheet.getRange(lastRow, 8).setFormula(`=HYPERLINK("${squareUrl}","${squareCustomerId}")`);
      }
      
      // Format Drive Folder URL column (I) - make it a hyperlink if exists
      if (driveFolderUrl) {
        sheet.getRange(lastRow, 9).setFormula(`=HYPERLINK("${driveFolderUrl}","View Folder")`);
      }
      
      // Format Images column (G) - set as formula if we have image links
      if (imageUrls.length > 0) {
        // Set the cell value directly (formulas are already in the rowData)
        sheet.getRange(lastRow, 7).setValue(imageLinksText);
      }
      
      // Format Timestamp
      sheet.getRange(lastRow, 1).setNumberFormat('mm/dd/yyyy hh:mm:ss AM/PM');
      
      // Format Email and Phone as text
      sheet.getRange(lastRow, 3).setNumberFormat('@');
      sheet.getRange(lastRow, 4).setNumberFormat('@');
      
      // Wrap Message column
      sheet.getRange(lastRow, 6).setWrap(true);
    }
    
    // Generate images with Gemini API if images were uploaded
    // Note: This happens AFTER folder creation so we can save generated content
    let generatedImages = [];
    let generatedImageBlobs = [];
    
    if (imageBlobs.length > 0 && GEMINI_API_KEY && folderResult && folderResult.folderId) {
      try {
        Logger.log('🔄 Starting Gemini processing for ' + imageBlobs.length + ' image(s)...');
        Logger.log('📁 Using Drive folder: ' + folderResult.folderId);
        
        // Step 1: Wait for Gemini to analyze images and generate descriptions
        const geminiResult = generatePoolImagesWithGemini(imageBlobs, data, folderResult.folderId);
        generatedImages = geminiResult.descriptions || [];
        
        Logger.log('✅ Gemini processing complete: ' + generatedImages.length + ' descriptions generated');
        
        // Step 2: Generate actual images using DALL-E based on Gemini descriptions
        if (generatedImages.length > 0 && OPENAI_API_KEY) {
          try {
            Logger.log('🎨 Starting DALL-E image generation for ' + generatedImages.length + ' description(s)...');
            Logger.log('🔑 OpenAI API Key configured: ' + (OPENAI_API_KEY ? 'YES (length: ' + OPENAI_API_KEY.length + ')' : 'NO'));
            const dalleResult = generateImagesWithDALLE(generatedImages, folderResult.folderId);
            generatedImageBlobs = dalleResult.imageBlobs || [];
            Logger.log('✅ DALL-E generated ' + generatedImageBlobs.length + ' image(s)');
            if (generatedImageBlobs.length > 0) {
              generatedImageBlobs.forEach((img, idx) => {
                Logger.log('   Image ' + (idx + 1) + ': ' + img.fileName + ', base64 length: ' + (img.base64Image ? img.base64Image.length : 0));
              });
            }
          } catch (dalleError) {
            Logger.log('⚠️ DALL-E image generation failed: ' + dalleError.toString());
            Logger.log('Error stack: ' + dalleError.stack);
          }
        } else {
          if (!OPENAI_API_KEY) {
            Logger.log('⚠️ OpenAI API key not configured - skipping DALL-E image generation');
          }
          if (generatedImages.length === 0) {
            Logger.log('⚠️ No Gemini descriptions available - skipping DALL-E image generation');
          }
        }
        
        if (generatedImages.length > 0) {
          Logger.log('📄 Generated descriptions saved to Drive folder');
        }
      } catch (error) {
        Logger.log('⚠️ Gemini processing failed: ' + error.toString());
        Logger.log('Error stack: ' + error.stack);
      }
    } else {
      if (imageBlobs.length > 0) {
        if (!GEMINI_API_KEY) {
          Logger.log('⚠️ Gemini API key not configured - skipping image generation');
        }
        if (!folderResult || !folderResult.folderId) {
          Logger.log('⚠️ Drive folder not available - skipping Gemini processing');
        }
      }
    }
    
    // Send SMS notifications via Twilio - DISABLED (not active at this time)
    /*
    if (data.phone && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
      try {
        // Send SMS to team
        sendTwilioSMS(TWILIO_PHONE, `New contact form submission from ${data.name || 'Customer'}. Service: ${data.service || 'General'}. Check email for details.`);
        
        // Send SMS to customer
        const customerPhone = formatPhoneNumber(data.phone);
        if (customerPhone) {
          let customerSMS = `Hi ${data.name || 'there'}! Thanks for contacting ${COMPANY_NAME}. We received your submission and will be contacting you shortly. You can text us at ${COMPANY_PHONE}.`;
          if (SQUARE_BOOKING_URL) {
            customerSMS += ` Go ahead and book your free design consultation: ${SQUARE_BOOKING_URL}`;
          }
          customerSMS += ` We look forward to your pool install! 🏊‍♂️`;
          sendTwilioSMS(customerPhone, customerSMS);
        }
        Logger.log('✅ SMS notifications sent');
      } catch (error) {
        Logger.log('⚠️ Twilio SMS failed: ' + error.toString());
      }
    }
    */
    
    // Send email notifications with images (original + generated descriptions)
    Logger.log('📧 About to send email notification...');
    Logger.log('📊 Email data: generatedImages=' + generatedImages.length + ', generatedImageBlobs=' + generatedImageBlobs.length);
    if (generatedImageBlobs.length > 0) {
      Logger.log('🖼️ Generated image blobs details:');
      generatedImageBlobs.forEach((img, idx) => {
        Logger.log('  Image ' + (idx + 1) + ': fileName=' + img.fileName + ', hasBase64=' + (img.base64Image ? 'YES' : 'NO') + ', hasUrl=' + (img.imageUrl ? 'YES' : 'NO'));
      });
    }
    sendEmailNotification(data, imageAttachments, generatedImages, driveFolderUrl, generatedImageBlobs);
    
    // Return success response
    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        message: 'Form submitted successfully',
        imagesReceived: imageAttachments.length
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    // Log error
    Logger.log('Error: ' + error.toString());
    Logger.log('Error stack: ' + error.stack);
    
    // Return error response
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        message: 'Error processing form: ' + error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle GET requests
 */
function doGet(e) {
  try {
    const action = e.parameter.action;
    
    if (action === 'getLeads') {
      return getLeads();
    }
    
    // Default response
    return ContentService
      .createTextOutput('Contact Form Web App is running!')
      .setMimeType(ContentService.MimeType.TEXT);
  } catch (error) {
    Logger.log('Error in doGet: ' + error.toString());
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Get leads from the Contact Us sheet
 */
function getLeads() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      return ContentService
        .createTextOutput(JSON.stringify({
          success: true,
          leads: []
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Get all data starting from row 3 (row 1 is logo, row 2 is headers)
    const lastRow = sheet.getLastRow();
    if (lastRow < 3) {
      return ContentService
        .createTextOutput(JSON.stringify({
          success: true,
          leads: []
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Get data range (columns A through I)
    const dataRange = sheet.getRange(3, 1, lastRow - 2, 9);
    const values = dataRange.getValues();
    
    const leads = [];
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      leads.push({
        timestamp: row[0] ? row[0].toString() : '',
        name: row[1] || '',
        email: row[2] || '',
        phone: row[3] || '',
        service: row[4] || '',
        message: row[5] || '',
        images: row[6] || '',
        squareCustomerId: row[7] || '',
        driveFolderUrl: row[8] || ''
      });
    }
    
    // Sort by timestamp (newest first)
    leads.sort((a, b) => {
      const dateA = new Date(a.timestamp);
      const dateB = new Date(b.timestamp);
      return dateB - dateA;
    });
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        leads: leads
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log('Error getting leads: ' + error.toString());
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Get team notification email template
 */
function getTeamNotificationTemplate() {
  return `<!-- START EMAIL TEMPLATE -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <tr>
    <td align="center" style="padding: 40px 20px;">
      <!-- Main Container -->
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); overflow: hidden;">
        
        <!-- Header with Pool Banner Image -->
        <tr>
          <td style="padding: 0; background-color: #3b82f6;">
            <!-- Pool Image Background with Overlay -->
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-image: url('https://media.angi.com/s3fs-public/BOY-WA~1.jpeg'); background-size: cover; background-position: center; background-repeat: no-repeat;">
              <tr>
                <td style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.55) 0%, rgba(96, 165, 250, 0.45) 100%); padding: 15px 40px 12px; text-align: center; height: 60px; vertical-align: middle;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);">
                    A Quality Pool Company
                  </h1>
                  <div style="margin-top: 6px; height: 2px; width: 60px; background-color: #ffffff; margin-left: auto; margin-right: auto; border-radius: 2px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);"></div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        
        <!-- Content Area -->
        <tr>
          <td style="padding: 40px;">
            <h2 style="margin: 0 0 24px 0; color: #1f2937; font-size: 24px; font-weight: 700;">
              New Contact Form Submission 📋
            </h2>
            
            <p style="margin: 0 0 24px 0; color: #374151; font-size: 16px; line-height: 1.6;">
              A new contact form submission has been received. Please review the details below:
            </p>
            
            <!-- Contact Details Box -->
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f9fafb; border-radius: 8px; padding: 24px; margin-bottom: 24px; border: 1px solid #e5e7eb;">
              <tr>
                <td>
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                    <tr>
                      <td style="padding: 8px 0;">
                        <strong style="color: #1f2937; font-size: 14px; display: inline-block; width: 120px;">Name:</strong>
                        <span style="color: #374151; font-size: 14px;">{{NAME}}</span>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0;">
                        <strong style="color: #1f2937; font-size: 14px; display: inline-block; width: 120px;">Email:</strong>
                        <a href="mailto:{{EMAIL}}" style="color: #3b82f6; text-decoration: none; font-size: 14px;">{{EMAIL}}</a>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0;">
                        <strong style="color: #1f2937; font-size: 14px; display: inline-block; width: 120px;">Phone:</strong>
                        <a href="tel:{{PHONE}}" style="color: #3b82f6; text-decoration: none; font-size: 14px;">{{PHONE}}</a>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0;">
                        <strong style="color: #1f2937; font-size: 14px; display: inline-block; width: 120px;">Service:</strong>
                        <span style="color: #374151; font-size: 14px;">{{SERVICE}}</span>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; vertical-align: top;">
                        <strong style="color: #1f2937; font-size: 14px; display: inline-block; width: 120px;">Message:</strong>
                        <span style="color: #374151; font-size: 14px; display: inline-block; width: calc(100% - 130px); vertical-align: top;">{{MESSAGE}}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
            
            <!-- Quick Action Buttons -->
            <div style="margin-top: 32px; text-align: center;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 0 8px;">
                    <a href="mailto:{{EMAIL}}?subject=Re: Your Inquiry" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
                      Reply to Customer
                    </a>
                  </td>
                  <td align="center" style="padding: 0 8px;">
                    <a href="tel:{{PHONE}}" style="display: inline-block; padding: 12px 24px; background-color: #10b981; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
                      Call Customer
                    </a>
                  </td>
                </tr>
              </table>
            </div>
            
            <p style="margin: 24px 0 0 0; color: #64748b; font-size: 12px; text-align: center;">
              Submitted on: {{TIMESTAMP}}
            </p>
          </td>
        </tr>
        
        <!-- Footer -->
        <tr>
          <td style="background-color: #f9fafb; padding: 30px 40px; border-top: 1px solid #e5e7eb;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr>
                <td align="center" style="padding-bottom: 20px;">
                  <img src="https://drive.google.com/uc?export=view&id=1Sg3x0PDbvT4JvAaYsv0_z8fDl2RAVlDG" alt="A Quality Pool Company Logo" style="max-width: 200px; height: auto; display: block; margin: 0 auto;" />
                </td>
              </tr>
              <tr>
                <td>
                  <p style="margin: 0 0 8px 0; color: #374151; font-size: 14px; font-weight: 600;">Contact Us:</p>
                  <p style="margin: 0 0 4px 0; color: #64748b; font-size: 13px;">
                    📧 <a href="mailto:brookspumpingpoolco@gmail.com" style="color: #3b82f6; text-decoration: none;">brookspumpingpoolco@gmail.com</a>
                  </p>
                  <p style="margin: 0; color: #64748b; font-size: 13px;">
                    📞 <a href="tel:5027069172" style="color: #3b82f6; text-decoration: none;">502-706-9172</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        
      </table>
      
      <!-- Bottom Spacing -->
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px;">
        <tr>
          <td style="padding: 20px 0; text-align: center; color: #64748b; font-size: 12px;">
            <p style="margin: 0;">© 2025 A Quality Pool Company. All rights reserved.</p>
          </td>
        </tr>
      </table>
      
    </td>
  </tr>
</table>
<!-- END EMAIL TEMPLATE -->`;
}

/**
 * Get customer confirmation email template
 */
function getCustomerConfirmationTemplate() {
  return `<!-- START EMAIL TEMPLATE -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <tr>
    <td align="center" style="padding: 40px 20px;">
      <!-- Main Container -->
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); overflow: hidden;">
        
        <!-- Header with Pool Banner Image -->
        <tr>
          <td style="padding: 0; background-color: #3b82f6;">
            <!-- Pool Image Background with Overlay -->
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-image: url('https://media.angi.com/s3fs-public/BOY-WA~1.jpeg'); background-size: cover; background-position: center; background-repeat: no-repeat;">
              <tr>
                <td style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.55) 0%, rgba(96, 165, 250, 0.45) 100%); padding: 15px 40px 12px; text-align: center; height: 60px; vertical-align: middle;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);">
                    A Quality Pool Company
                  </h1>
                  <div style="margin-top: 6px; height: 2px; width: 60px; background-color: #ffffff; margin-left: auto; margin-right: auto; border-radius: 2px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);"></div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        
        <!-- Content Area -->
        <tr>
          <td style="padding: 40px;">
            <h2 style="margin: 0 0 24px 0; color: #1f2937; font-size: 24px; font-weight: 700;">
              Thank You for Contacting Us! 🙏
            </h2>
            
            <p style="margin: 0 0 16px 0; color: #374151; font-size: 16px; line-height: 1.6;">
              Hi {{NAME}},
            </p>
            
            <p style="margin: 0 0 16px 0; color: #374151; font-size: 16px; line-height: 1.6;">
              We've received your inquiry and want to thank you for reaching out to A Quality Pool Company. We're excited about the opportunity to help bring your vision to life!
            </p>
            
            <p style="margin: 0 0 24px 0; color: #374151; font-size: 16px; line-height: 1.6;">
              Our team is currently reviewing your submission and <strong style="color: #1f2937;">we will contact you within 24-48 hours</strong> to discuss your project in more detail.
            </p>
            
            <!-- Summary Box -->
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
              <tr>
                <td>
                  <p style="margin: 0 0 8px 0; color: #1e40af; font-size: 14px; font-weight: 600;">Your Inquiry Summary:</p>
                  <p style="margin: 0 0 4px 0; color: #1e40af; font-size: 14px;"><strong>Service Interest:</strong> {{SERVICE}}</p>
                  <p style="margin: 0; color: #1e40af; font-size: 14px;"><strong>Submitted:</strong> {{TIMESTAMP}}</p>
                </td>
              </tr>
            </table>
            
            <!-- Book Consultation CTA -->
            {{BOOKING_BUTTON}}
            
            <p style="margin: 0 0 16px 0; color: #374151; font-size: 16px; line-height: 1.6;">
              In the meantime, if you have any urgent questions or would like to speak with us directly, please don't hesitate to reach out:
            </p>
            
            <!-- Contact Info -->
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 32px;">
              <tr>
                <td style="padding: 8px 0;">
                  <span style="color: #374151; font-size: 15px;">📞 <strong>Phone:</strong> <a href="tel:5027069172" style="color: #3b82f6; text-decoration: none;">502-706-9172</a></span>
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 0;">
                  <span style="color: #374151; font-size: 15px;">📧 <strong>Email:</strong> <a href="mailto:brookspumpingpoolco@gmail.com" style="color: #3b82f6; text-decoration: none;">brookspumpingpoolco@gmail.com</a></span>
                </td>
              </tr>
            </table>
            
            <p style="margin: 0 0 24px 0; color: #374151; font-size: 16px; line-height: 1.6;">
              We're looking forward to assisting you with your pool project!
            </p>
            
            <p style="margin: 0; color: #374151; font-size: 16px; line-height: 1.6;">
              Best regards,<br>
              <strong style="color: #1f2937;">The A Quality Pool Company Team</strong>
            </p>
          </td>
        </tr>
        
        <!-- Footer -->
        <tr>
          <td style="background-color: #f9fafb; padding: 30px 40px; border-top: 1px solid #e5e7eb;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr>
                <td align="center" style="padding-bottom: 20px;">
                  <img src="https://drive.google.com/uc?export=view&id=1Sg3x0PDbvT4JvAaYsv0_z8fDl2RAVlDG" alt="A Quality Pool Company Logo" style="max-width: 200px; height: auto; display: block; margin: 0 auto;" />
                </td>
              </tr>
              <tr>
                <td>
                  <p style="margin: 0 0 8px 0; color: #374151; font-size: 14px; font-weight: 600;">Contact Us:</p>
                  <p style="margin: 0 0 4px 0; color: #64748b; font-size: 13px;">
                    📧 <a href="mailto:brookspumpingpoolco@gmail.com" style="color: #3b82f6; text-decoration: none;">brookspumpingpoolco@gmail.com</a>
                  </p>
                  <p style="margin: 0; color: #64748b; font-size: 13px;">
                    📞 <a href="tel:5027069172" style="color: #3b82f6; text-decoration: none;">502-706-9172</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        
      </table>
      
      <!-- Bottom Spacing -->
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px;">
        <tr>
          <td style="padding: 20px 0; text-align: center; color: #64748b; font-size: 12px;">
            <p style="margin: 0;">© 2025 A Quality Pool Company. All rights reserved.</p>
          </td>
        </tr>
      </table>
      
    </td>
  </tr>
</table>
<!-- END EMAIL TEMPLATE -->`;
}

/**
 * Replace placeholders in email template
 */
function replaceTemplatePlaceholders(template, data) {
  const timestamp = new Date().toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  
  // Escape HTML in user input to prevent XSS
  const escapeHtml = function(text) {
    if (!text) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.toString().replace(/[&<>"']/g, function(m) { return map[m]; });
  };
  
  // Replace message newlines with <br> tags
  const formatMessage = function(text) {
    if (!text) return 'No message provided';
    return escapeHtml(text).replace(/\n/g, '<br>');
  };
  
  // Create booking button HTML if booking URL is configured
  let bookingButton = '';
  if (SQUARE_BOOKING_URL) {
    bookingButton = `
            <!-- Book Consultation Button -->
            <div style="margin: 32px 0; text-align: center;">
              <a href="${SQUARE_BOOKING_URL}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #ffffff; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 18px; box-shadow: 0 4px 12px rgba(2, 132, 199, 0.4); transition: all 0.3s ease;">
                🏊‍♂️ Book Your Free Design Consultation 🌊
              </a>
            </div>
            <p style="margin: 0 0 24px 0; text-align: center; color: #374151; font-size: 16px; line-height: 1.6;">
              <strong>Ready to get started?</strong> Go ahead and book your free design consultation to discuss your dream pool project!
            </p>`;
  }
  
  let result = template
    .replace(/\{\{NAME\}\}/g, escapeHtml(data.name || 'Valued Customer'))
    .replace(/\{\{EMAIL\}\}/g, escapeHtml(data.email || 'N/A'))
    .replace(/\{\{PHONE\}\}/g, escapeHtml(data.phone || 'N/A'))
    .replace(/\{\{SERVICE\}\}/g, escapeHtml(data.service || 'General Inquiry'))
    .replace(/\{\{MESSAGE\}\}/g, formatMessage(data.message))
    .replace(/\{\{TIMESTAMP\}\}/g, timestamp)
    .replace(/\{\{BOOKING_BUTTON\}\}/g, bookingButton);
  
  return result;
}

/**
 * Send email notification
 */
function sendEmailNotification(data, imageAttachments, generatedImages, driveFolderUrl, generatedImageBlobs) {
  try {
    const timestamp = new Date().toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    
    // Send email to team (samr@aqualitypoolcompanyUSA.COM)
    const teamSubject = COMPANY_NAME + ' - New Contact Form Submission - ' + (data.service || 'General Inquiry');
    const teamTemplate = getTeamNotificationTemplate();
    const teamHtmlBody = replaceTemplatePlaceholders(teamTemplate, data);
    
    // Plain text version for team email
    const teamTextBody = `${COMPANY_NAME} - New Contact Form Submission

Name: ${data.name || 'N/A'}
Email: ${data.email || 'N/A'}
Phone: ${data.phone || 'N/A'}
Service Interest: ${data.service || 'Not specified'}

Message:
${data.message || 'No message provided'}

Submitted on: ${timestamp}`;
    
    // Add image count and folder link to email body
    let teamHtmlBodyWithImages = teamHtmlBody;
    let teamTextBodyWithImages = teamTextBody;
    
    if (imageAttachments && imageAttachments.length > 0) {
      teamTextBodyWithImages += '\n\n📷 ' + imageAttachments.length + ' image(s) attached to this email.';
      if (driveFolderUrl) {
        teamTextBodyWithImages += '\n📁 View all images: ' + driveFolderUrl;
      }
      const imageNote = '<p style="margin: 16px 0 0 0; padding: 12px; background-color: #eff6ff; border-left: 4px solid #10b981; border-radius: 4px; color: #065f46; font-size: 14px; font-weight: 600;">📷 ' + imageAttachments.length + ' image(s) attached to this email.' + (driveFolderUrl ? '<br>📁 <a href="' + driveFolderUrl + '" style="color: #065f46;">View all images in Drive folder</a>' : '') + '</p>';
      teamHtmlBodyWithImages = teamHtmlBody.replace('<p style="margin: 24px 0 0 0; color: #64748b; font-size: 12px; text-align: center;">', imageNote + '<p style="margin: 24px 0 0 0; color: #64748b; font-size: 12px; text-align: center;">');
    }
    
    const emailOptions = {
      to: TEAM_EMAIL,
      from: EMAIL_ADDRESS,
      name: COMPANY_NAME,
      subject: teamSubject,
      htmlBody: teamHtmlBodyWithImages,
      body: teamTextBodyWithImages,
      replyTo: data.email || EMAIL_ADDRESS
    };
    
    // Add attachments if images were uploaded
    if (imageAttachments && imageAttachments.length > 0) {
      emailOptions.attachments = imageAttachments;
    }
    
    MailApp.sendEmail(emailOptions);
    
    Logger.log('Team notification email sent to ' + TEAM_EMAIL);
    
    // Send confirmation email to customer (only if email is provided)
    if (data.email) {
      const customerSubject = COMPANY_NAME + ' - We Received Your Contact Form Submission! 🏊‍♂️';
      const customerTemplate = getCustomerConfirmationTemplate();
      let customerHtmlBody = replaceTemplatePlaceholders(customerTemplate, data);
      
      // Add images section if images were uploaded OR if we have generated images
      Logger.log('📧 Building customer email HTML...');
      Logger.log('📊 Email params: imageAttachments=' + (imageAttachments ? imageAttachments.length : 0) + ', generatedImages=' + (generatedImages ? generatedImages.length : 0) + ', generatedImageBlobs=' + (generatedImageBlobs ? generatedImageBlobs.length : 0));
      
      let imagesHtml = '';
      
      if (imageAttachments && imageAttachments.length > 0) {
        imagesHtml += '<div style="margin: 24px 0; padding: 20px; background: #f0f9ff; border-radius: 12px; border: 2px solid #0284c7;"><h3 style="margin: 0 0 16px 0; color: #0284c7; font-size: 18px;">📷 Your Uploaded Photos</h3><p style="margin: 0 0 12px 0; color: #0c4a6e;">Thank you for sharing photos of your space! We\'ve received ' + imageAttachments.length + ' image(s).';
        if (driveFolderUrl) {
          imagesHtml += ' <a href="' + driveFolderUrl + '" style="color: #0284c7; font-weight: 600;">View all images here</a>.';
        }
        imagesHtml += '</p>';
      }
      
      // Add generated images section if available (Gemini descriptions + DALL-E images)
      Logger.log('🔍 Checking for generated images: generatedImages.length=' + (generatedImages ? generatedImages.length : 0) + ', generatedImageBlobs.length=' + (generatedImageBlobs ? generatedImageBlobs.length : 0));
      if (generatedImages && generatedImages.length > 0) {
        if (!imagesHtml) {
          imagesHtml = '<div style="margin: 24px 0; padding: 20px; background: #f0f9ff; border-radius: 12px; border: 2px solid #0284c7;">';
        }
          imagesHtml += '<div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid #bae6fd;"><h3 style="margin: 0 0 12px 0; color: #0284c7; font-size: 16px;">✨ AI Pool Design Analysis & Visualizations</h3><p style="margin: 0 0 12px 0; color: #0c4a6e;">Our AI has analyzed your photos and created detailed pool design recommendations and visualizations for your space!</p>';
          generatedImages.forEach((gen, idx) => {
            if (gen.description) {
              // Find corresponding DALL-E image if available
              Logger.log('🔍 Looking for DALL-E image for description ' + (idx + 1) + ', originalIndex=' + gen.originalIndex);
              const dalleImage = generatedImageBlobs && generatedImageBlobs.find(img => 
                img.originalIndex === gen.originalIndex || img.originalIndex === idx
              );
              Logger.log('🎨 DALL-E image found: ' + (dalleImage ? 'YES' : 'NO'));
              if (dalleImage) {
                Logger.log('   - has base64Image: ' + (dalleImage.base64Image ? 'YES (' + dalleImage.base64Image.substring(0, 50) + '...)' : 'NO'));
                Logger.log('   - has imageUrl: ' + (dalleImage.imageUrl ? 'YES' : 'NO'));
              }
              
              const descriptionPreview = gen.description.length > 300 ? gen.description.substring(0, 300) + '...' : gen.description;
              imagesHtml += '<div style="margin: 16px 0; padding: 16px; background: white; border-radius: 12px; border: 2px solid #bae6fd; box-shadow: 0 2px 8px rgba(2, 132, 199, 0.1);">';
              
              // Show DALL-E generated image if available
              if (dalleImage) {
                Logger.log('✅ Adding DALL-E image to email HTML for description ' + (idx + 1));
                // Use base64 embedded image for email (most reliable)
                if (dalleImage.base64Image) {
                  Logger.log('   Using base64 image (length: ' + dalleImage.base64Image.length + ' chars)');
                  imagesHtml += '<div style="margin-bottom: 12px; text-align: center;"><img src="' + dalleImage.base64Image + '" alt="AI Generated Pool Design ' + (idx + 1) + '" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);" /></div>';
                } else if (dalleImage.imageUrl) {
                  Logger.log('   Using Drive URL fallback: ' + dalleImage.imageUrl);
                  // Fallback to Drive URL if base64 not available
                  imagesHtml += '<div style="margin-bottom: 12px; text-align: center;"><img src="' + dalleImage.imageUrl + '" alt="AI Generated Pool Design ' + (idx + 1) + '" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);" /></div>';
                } else {
                  Logger.log('   ⚠️ No image data available (no base64Image or imageUrl)');
                }
                imagesHtml += '<p style="margin: 0 0 12px 0; text-align: center; color: #0284c7; font-size: 13px; font-weight: 600;">🎨 AI-Generated Pool Design Visualization</p>';
              } else {
                Logger.log('   ⚠️ No DALL-E image found for description ' + (idx + 1));
              }
              
              // Escape HTML in description
              const escapedDesc = descriptionPreview
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
              imagesHtml += '<p style="margin: 0; color: #0c4a6e; line-height: 1.6; font-size: 14px;"><strong>Design Analysis ' + (idx + 1) + ':</strong><br>' + escapedDesc + '</p>';
              if (gen.descriptionFileUrl) {
                imagesHtml += '<p style="margin: 8px 0 0 0;"><a href="' + gen.descriptionFileUrl + '" style="color: #0284c7; font-weight: 600; text-decoration: none; font-size: 13px;">📄 View full analysis →</a></p>';
              }
              if (dalleImage && dalleImage.imageUrl) {
                imagesHtml += '<p style="margin: 8px 0 0 0;"><a href="' + dalleImage.imageUrl + '" style="color: #0284c7; font-weight: 600; text-decoration: none; font-size: 13px;">🖼️ View full-size generated image →</a></p>';
              }
              imagesHtml += '</div>';
            }
          });
          imagesHtml += '</div>';
        }
        
        // If we have DALL-E images but no Gemini descriptions (edge case)
        if (generatedImageBlobs && generatedImageBlobs.length > 0 && (!generatedImages || generatedImages.length === 0)) {
          imagesHtml += '<div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid #bae6fd;"><h3 style="margin: 0 0 12px 0; color: #0284c7; font-size: 16px;">🎨 AI-Generated Pool Design Visualizations</h3><p style="margin: 0 0 12px 0; color: #0c4a6e;">We\'ve created custom pool design visualizations based on your photos!</p>';
          generatedImageBlobs.forEach((img, idx) => {
            imagesHtml += '<div style="margin: 16px 0; padding: 16px; background: white; border-radius: 12px; border: 2px solid #bae6fd; box-shadow: 0 2px 8px rgba(2, 132, 199, 0.1);">';
            if (img.base64Image) {
              imagesHtml += '<div style="margin-bottom: 12px; text-align: center;"><img src="' + img.base64Image + '" alt="AI Generated Pool Design ' + (idx + 1) + '" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);" /></div>';
            } else if (img.imageUrl) {
              imagesHtml += '<div style="margin-bottom: 12px; text-align: center;"><img src="' + img.imageUrl + '" alt="AI Generated Pool Design ' + (idx + 1) + '" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);" /></div>';
            }
            if (img.imageUrl) {
              imagesHtml += '<p style="margin: 0; text-align: center;"><a href="' + img.imageUrl + '" style="color: #0284c7; font-weight: 600; text-decoration: none; font-size: 13px;">🖼️ View full-size image →</a></p>';
            }
            imagesHtml += '</div>';
          });
          imagesHtml += '</div>';
        }
        imagesHtml += '</div>';
      }
      
      // Insert images section before closing content area (if we have any images)
      if (imagesHtml) {
        Logger.log('📝 Inserting images HTML into email (length: ' + imagesHtml.length + ' chars)');
        customerHtmlBody = customerHtmlBody.replace('</td></tr>', imagesHtml + '</td></tr>');
      } else {
        Logger.log('⚠️ No images HTML to insert');
      }
      
      // Plain text version for customer email
      let customerTextBody = `Thank You for Contacting ${COMPANY_NAME}! 🏊‍♂️

Hi ${data.name || 'Valued Customer'},

We've received your inquiry and want to thank you for reaching out to ${COMPANY_NAME}. We're excited about the opportunity to help bring your vision to life!

Our team is currently reviewing your submission and we will contact you within 24-48 hours to discuss your project in more detail.

Your Inquiry Summary:
Service Interest: ${data.service || 'General Inquiry'}
Submitted: ${timestamp}${imageAttachments && imageAttachments.length > 0 ? '\n\n📷 ' + imageAttachments.length + ' photo(s) received' : ''}${driveFolderUrl ? '\n📁 View your photos: ' + driveFolderUrl : ''}${generatedImages && generatedImages.length > 0 ? '\n\n✨ AI Pool Design Analysis: Our AI has analyzed your photos and created detailed pool design recommendations!' : ''}${generatedImageBlobs && generatedImageBlobs.length > 0 ? '\n🎨 AI-Generated Visualizations: ' + generatedImageBlobs.length + ' custom pool design visualization(s) created!' : ''}`;

      // Add booking link to plain text email
      if (SQUARE_BOOKING_URL) {
        customerTextBody += `\n\n🏊‍♂️ Ready to get started? Go ahead and book your free design consultation:\n${SQUARE_BOOKING_URL}`;
      }

      customerTextBody += `\n\nIn the meantime, if you have any urgent questions or would like to speak with us directly, please don't hesitate to reach out:

Phone: ${COMPANY_PHONE}
Email: ${EMAIL_ADDRESS}

We're looking forward to assisting you with your pool project!

Best regards,
The ${COMPANY_NAME} Team`;
      
      const customerEmailOptions = {
        to: data.email,
        from: EMAIL_ADDRESS,
        name: COMPANY_NAME,
        subject: customerSubject,
        htmlBody: customerHtmlBody,
        body: customerTextBody
      };
      
      // Attach original images to customer email
      const allAttachments = [];
      if (imageAttachments && imageAttachments.length > 0) {
        allAttachments.push(...imageAttachments);
      }
      
      // Attach DALL-E generated images as inline attachments
      if (generatedImageBlobs && generatedImageBlobs.length > 0) {
        generatedImageBlobs.forEach((img, idx) => {
          if (img.imageBlob) {
            // Create a unique name for the inline attachment
            const inlineName = 'dalle-image-' + (idx + 1) + '.png';
            allAttachments.push(img.imageBlob.setName(inlineName));
          }
        });
      }
      
      if (allAttachments.length > 0) {
        customerEmailOptions.attachments = allAttachments;
      }
      
      MailApp.sendEmail(customerEmailOptions);
      
      Logger.log('Customer confirmation email sent successfully');
    }
    
  } catch (error) {
    Logger.log('Error sending email: ' + error.toString());
    // Don't throw error - form submission should still succeed even if email fails
  }
}

/**
 * Create Square customer from contact form data
 */
function createSquareCustomer(data) {
  try {
    const url = getSquareApiUrl() + '/customers';
    
    // Parse name into first and last name
    const nameParts = (data.name || '').trim().split(' ');
    const givenName = nameParts[0] || 'Customer';
    const familyName = nameParts.slice(1).join(' ') || '';
    
    // Format phone number (remove non-digits, add +1 if needed)
    let phoneNumber = (data.phone || '').replace(/\D/g, '');
    if (phoneNumber && phoneNumber.length === 10) {
      phoneNumber = '+1' + phoneNumber;
    } else if (phoneNumber && !phoneNumber.startsWith('+')) {
      phoneNumber = '+' + phoneNumber;
    }
    
    const payload = {
      idempotency_key: Utilities.getUuid(), // Prevent duplicates
      given_name: givenName,
      family_name: familyName,
      email_address: data.email || undefined,
      phone_number: phoneNumber || undefined,
      note: `Contact Form Lead - ${data.service || 'General Inquiry'}\nSubmitted: ${new Date().toLocaleDateString()}`
    };
    
    const options = {
      method: 'post',
      headers: {
        'Square-Version': SQUARE_API_VERSION,
        'Authorization': 'Bearer ' + SQUARE_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const result = JSON.parse(response.getContentText());
    
    if (responseCode === 200 && result.customer) {
      return {
        success: true,
        customerId: result.customer.id,
        customer: result.customer
      };
    } else {
      Logger.log('Square API Error: ' + JSON.stringify(result));
      return {
        success: false,
        error: result.errors ? result.errors[0].detail : 'Failed to create Square customer'
      };
    }
    
  } catch (error) {
    Logger.log('Error creating Square customer: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Create Drive folder for customer
 */
function createCustomerDriveFolder(customerName, squareCustomerId) {
  try {
    // Sanitize folder name (remove invalid characters)
    let folderName = (customerName || 'Unknown Customer').trim();
    folderName = folderName.replace(/[<>:"/\\|?*]/g, '_'); // Replace invalid chars
    folderName = folderName.substring(0, 100); // Limit length
    
    // Add date suffix to make it unique
    const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    folderName = `${folderName} - ${dateStr}`;
    
    // Get parent folder
    const parentFolder = DriveApp.getFolderById(CUSTOMER_DRIVE_FOLDER_ID);
    
    // Check if folder already exists
    const existingFolders = parentFolder.getFoldersByName(folderName);
    let customerFolder;
    
    if (existingFolders.hasNext()) {
      customerFolder = existingFolders.next();
      Logger.log('Using existing folder: ' + folderName);
    } else {
      // Create new folder
      customerFolder = parentFolder.createFolder(folderName);
      Logger.log('Created new folder: ' + folderName);
      
      // Share folder with "Anyone with link can view"
      customerFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    }
    
    return {
      success: true,
      folderId: customerFolder.getId(),
      folderUrl: customerFolder.getUrl(),
      folderName: folderName
    };
    
  } catch (error) {
    Logger.log('Error creating Drive folder: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Send SMS via Twilio
 */
function sendTwilioSMS(phoneNumber, message) {
  try {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      Logger.log('⚠️ Twilio not configured');
      return { success: false, error: 'Twilio not configured' };
    }
    
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    const authHeader = 'Basic ' + Utilities.base64Encode(TWILIO_ACCOUNT_SID + ':' + TWILIO_AUTH_TOKEN);
    
    const payload = {
      From: TWILIO_PHONE,
      To: phoneNumber,
      Body: message
    };
    
    const options = {
      method: 'post',
      headers: {
        'Authorization': authHeader
      },
      payload: payload,
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(twilioUrl, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode === 200 || responseCode === 201) {
      Logger.log('✅ Twilio SMS sent successfully');
      return { success: true };
    } else {
      Logger.log('❌ Twilio SMS error: ' + responseText);
      return { success: false, error: responseText };
    }
  } catch (error) {
    Logger.log('❌ Error sending Twilio SMS: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Format phone number for Twilio (+1XXXXXXXXXX)
 */
function formatPhoneNumber(phone) {
  if (!phone) return '';
  // Remove all non-digits
  let digits = phone.replace(/\D/g, '');
  // Add +1 if 10 digits
  if (digits.length === 10) {
    return '+1' + digits;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    return '+' + digits;
  } else if (phone.startsWith('+')) {
    return phone;
  }
  return '';
}

/**
 * Generate pool images using Gemini API
 * Note: Gemini Pro Vision analyzes images and returns text descriptions
 * For actual image generation, you may need Imagen API or another service
 */
function generatePoolImagesWithGemini(originalImages, formData, driveFolderId) {
  try {
    if (!GEMINI_API_KEY) {
      Logger.log('⚠️ Gemini API key not configured');
      return { descriptions: [], imageBlobs: [] };
    }
    
    if (!driveFolderId) {
      Logger.log('⚠️ Drive folder ID not provided');
      return { descriptions: [], imageBlobs: [] };
    }
    
    const generatedDescriptions = [];
    const generatedImageBlobs = [];
    const folder = DriveApp.getFolderById(driveFolderId);
    
    // Process each uploaded image
    for (let i = 0; i < originalImages.length; i++) {
      try {
        Logger.log('🔄 Processing image ' + (i + 1) + ' of ' + originalImages.length + ' with Gemini...');
        const imageBlob = originalImages[i];
        const imageBase64 = Utilities.base64Encode(imageBlob.getBytes());
        
        // Create detailed prompt for Gemini to analyze and describe pool design
        const prompt = `Analyze this image and provide a detailed description of how this space could be transformed into a beautiful swimming pool area. Describe:
1. The ideal pool design (size, shape, style)
2. Pool decking and surrounding area
3. Landscaping and outdoor features
4. Overall aesthetic and atmosphere
5. Any specific recommendations for this space

Be specific and detailed, as if describing a professional pool design visualization.`;
        
        // Gemini Pro Vision API structure
        const payload = {
          contents: [{
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: imageBlob.getContentType() || 'image/jpeg',
                  data: imageBase64
                }
              }
            ]
          }],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          }
        };
        
        const url = GEMINI_API_URL + '?key=' + GEMINI_API_KEY;
        const options = {
          method: 'post',
          headers: {
            'Content-Type': 'application/json'
          },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        };
        
        Logger.log('📡 Sending request to Gemini API (waiting for response)...');
        
        // Make API call - this will wait for response (synchronous in Google Apps Script)
        const response = UrlFetchApp.fetch(url, options);
        const responseCode = response.getResponseCode();
        const responseText = response.getContentText();
        
        Logger.log('📥 Gemini API Response Code: ' + responseCode);
        
        if (responseCode !== 200) {
          Logger.log('❌ Gemini API Error Response: ' + responseText);
          Logger.log('Full error details: ' + JSON.stringify(JSON.parse(responseText), null, 2));
          continue;
        }
        
        let result;
        try {
          result = JSON.parse(responseText);
        } catch (parseError) {
          Logger.log('❌ Error parsing Gemini response: ' + parseError.toString());
          Logger.log('Response text: ' + responseText.substring(0, 500));
          continue;
        }
        
        // Process Gemini response
        if (result.candidates && result.candidates[0] && result.candidates[0].content) {
          const contentParts = result.candidates[0].content.parts;
          let description = '';
          
          // Get text from response
          if (contentParts && contentParts.length > 0) {
            description = contentParts[0].text || 'Pool design analysis generated';
          }
          
          if (description) {
            Logger.log('✅ Gemini description received for image ' + (i + 1) + ' (' + description.length + ' characters)');
            
            // Save description as a text file in Drive folder
            try {
              const descriptionFile = folder.createFile(
                'AI_Pool_Design_Description_' + (i + 1) + '_' + new Date().getTime() + '.txt',
                description,
                'text/plain'
              );
              
              generatedDescriptions.push({
                originalIndex: i,
                description: description,
                descriptionFileUrl: descriptionFile.getUrl(),
                fileName: descriptionFile.getName()
              });
              
              Logger.log('💾 Saved description to Drive: ' + descriptionFile.getName());
              Logger.log('📁 File URL: ' + descriptionFile.getUrl());
            } catch (saveError) {
              Logger.log('❌ Error saving description to Drive: ' + saveError.toString());
              // Still add description even if file save fails
              generatedDescriptions.push({
                originalIndex: i,
                description: description,
                descriptionFileUrl: null
              });
            }
          } else {
            Logger.log('⚠️ No description text in Gemini response for image ' + (i + 1));
            Logger.log('Response structure: ' + JSON.stringify(result).substring(0, 300));
          }
        } else {
          Logger.log('⚠️ Unexpected Gemini response structure for image ' + (i + 1));
          Logger.log('Response keys: ' + Object.keys(result).join(', '));
          Logger.log('Full response: ' + JSON.stringify(result).substring(0, 1000));
        }
        
        // Add small delay between requests to avoid rate limiting
        if (i < originalImages.length - 1) {
          Logger.log('⏳ Waiting 1 second before next request...');
          Utilities.sleep(1000); // Wait 1 second between requests
        }
        
      } catch (error) {
        Logger.log('❌ Error processing image ' + (i + 1) + ' with Gemini: ' + error.toString());
        Logger.log('Error stack: ' + error.stack);
      }
    }
    
    Logger.log('✅ Gemini processing complete: ' + generatedDescriptions.length + ' descriptions generated');
    return {
      descriptions: generatedDescriptions,
      imageBlobs: generatedImageBlobs // Empty for now since Gemini doesn't generate images
    };
  } catch (error) {
    Logger.log('❌ Error in Gemini image generation: ' + error.toString());
    Logger.log('Error stack: ' + error.stack);
    return { descriptions: [], imageBlobs: [] };
  }
}

/**
 * Generate images using DALL-E 3 based on Gemini descriptions
 * @param {Array} geminiDescriptions - Array of description objects from Gemini
 * @param {string} driveFolderId - Google Drive folder ID to save generated images
 * @return {Object} Object with imageBlobs array containing generated image file info
 */
function generateImagesWithDALLE(geminiDescriptions, driveFolderId) {
  if (!OPENAI_API_KEY) {
    Logger.log('⚠️ OpenAI API key not configured');
    return { imageBlobs: [] };
  }
  
  if (!driveFolderId) {
    Logger.log('⚠️ Drive folder ID not provided');
    return { imageBlobs: [] };
  }
  
  if (!geminiDescriptions || geminiDescriptions.length === 0) {
    Logger.log('⚠️ No Gemini descriptions provided for DALL-E generation');
    return { imageBlobs: [] };
  }
  
  try {
    const folder = DriveApp.getFolderById(driveFolderId);
    const generatedImageBlobs = [];
    
    for (let i = 0; i < geminiDescriptions.length; i++) {
      const descriptionObj = geminiDescriptions[i];
      const description = descriptionObj.description || '';
      
      if (!description) {
        Logger.log('⚠️ Skipping empty description for DALL-E generation ' + (i + 1));
        continue;
      }
      
      try {
        // Create a prompt for DALL-E based on Gemini description
        // Enhance the prompt to make it pool-specific and high quality
        const dallePrompt = 'A beautiful, professional pool design visualization: ' + 
                           description.substring(0, 800) + 
                           '. High quality, photorealistic, modern pool design, perfect lighting, professional photography style.';
        
        Logger.log('🎨 Generating DALL-E image ' + (i + 1) + ' of ' + geminiDescriptions.length);
        Logger.log('📝 Prompt: ' + dallePrompt.substring(0, 200) + '...');
        
        // Prepare DALL-E API request
        const payload = {
          model: 'dall-e-3',
          prompt: dallePrompt,
          n: 1,
          size: '1024x1024',
          quality: 'standard',
          response_format: 'url'
        };
        
        const options = {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + OPENAI_API_KEY,
            'Content-Type': 'application/json'
          },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        };
        
        // Call DALL-E API
        const response = UrlFetchApp.fetch(OPENAI_API_URL, options);
        const responseCode = response.getResponseCode();
        const responseText = response.getContentText();
        
        if (responseCode !== 200) {
          Logger.log('❌ DALL-E API error (code ' + responseCode + '): ' + responseText);
          continue;
        }
        
        const result = JSON.parse(responseText);
        
        if (result.data && result.data.length > 0 && result.data[0].url) {
          const imageUrl = result.data[0].url;
          Logger.log('✅ DALL-E image generated: ' + imageUrl);
          
          // Download the generated image
          const imageResponse = UrlFetchApp.fetch(imageUrl);
          const imageBlob = imageResponse.getBlob();
          
          // Save to Drive folder
          const imageFileName = 'AI_Generated_Pool_Design_' + (i + 1) + '_' + new Date().getTime() + '.png';
          const imageFile = folder.createFile(imageBlob.setName(imageFileName));
          
          // Get the file ID for creating a viewable URL
          const fileId = imageFile.getId();
          const viewableUrl = 'https://drive.google.com/uc?export=view&id=' + fileId;
          
          // Convert image blob to base64 for email embedding
          const base64Data = Utilities.base64Encode(imageBlob.getBytes());
          const base64Image = 'data:image/png;base64,' + base64Data;
          
          generatedImageBlobs.push({
            originalIndex: descriptionObj.originalIndex || i,
            imageBlob: imageBlob,
            imageUrl: viewableUrl, // Use viewable URL format
            imageFileId: fileId,
            fileName: imageFileName,
            description: description,
            base64Image: base64Image // Base64 for email embedding
          });
          
          Logger.log('💾 Saved DALL-E image to Drive: ' + imageFileName);
          Logger.log('📁 File URL: ' + imageFile.getUrl());
        } else {
          Logger.log('⚠️ Unexpected DALL-E response structure');
          Logger.log('Response: ' + JSON.stringify(result).substring(0, 500));
        }
        
        // Add delay between requests to avoid rate limiting
        if (i < geminiDescriptions.length - 1) {
          Logger.log('⏳ Waiting 2 seconds before next DALL-E request...');
          Utilities.sleep(2000); // Wait 2 seconds between requests (DALL-E has stricter rate limits)
        }
        
      } catch (error) {
        Logger.log('❌ Error generating DALL-E image ' + (i + 1) + ': ' + error.toString());
        Logger.log('Error stack: ' + error.stack);
      }
    }
    
    Logger.log('✅ DALL-E generation complete: ' + generatedImageBlobs.length + ' images generated');
    return { imageBlobs: generatedImageBlobs };
    
  } catch (error) {
    Logger.log('❌ Error in DALL-E image generation: ' + error.toString());
    Logger.log('Error stack: ' + error.stack);
    return { imageBlobs: [] };
  }
}

/**
 * Test function - can be run manually to test the script
 */
function testFormSubmission() {
  const testData = {
    name: 'Test User',
    email: 'test@example.com',
    phone: '(555) 123-4567',
    service: 'VINYL Liner Pools',
    message: 'This is a test message'
  };
  
  const mockEvent = {
    postData: {
      contents: JSON.stringify(testData)
    }
  };
  
  const result = doPost(mockEvent);
  Logger.log(result.getContent());
}


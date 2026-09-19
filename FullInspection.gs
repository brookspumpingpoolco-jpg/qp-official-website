// Full Pool Inspection Report - Google Apps Script
// Professional inspection builder with photos and videos

// CONFIGURATION
const INSPECTION_DRIVE_FOLDER_ID = '1tHpDcPkFJ6B3QDopqzpawZrL9Oun2Nrl'; // Your inspections folder
const NOTIFICATION_EMAIL = 'samr@aqualitypoolcompanyusa.com';

// Square API Configuration (same as pool calculator)
const SQUARE_ACCESS_TOKEN = 'REDACTED';
const SQUARE_APPLICATION_ID = 'sq0idp-UsE101iI0GHTKs8WSAJwwA';
const SQUARE_API_VERSION = '2024-12-18';
const SQUARE_ENVIRONMENT = 'production';

// Twilio SMS Configuration - DISABLED
const TWILIO_ENABLED = false;
const TWILIO_ACCOUNT_SID = '';
const TWILIO_AUTH_TOKEN = '';
const TWILIO_PHONE_NUMBER = '';

// Verizon Email-to-Text (Temporary solution until Twilio is set up)
const VERIZON_EMAIL = '8654142817@vzwpix.com'; // MMS with attachments
const VERIZON_EMAIL_SMS = '8654142817@vtext.com'; // SMS only (fallback)

// Company Phone Number
const COMPANY_PHONE = '5027069172';
const COMPANY_EMAIL_SMS = '5027069172@vtext.com'; // Verizon SMS email format

// OpenAI Configuration
const OPENAI_API_KEY = 'REDACTED';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// Spreadsheet Configuration for Inspection Tracking
const SPREADSHEET_ID = '1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0'; // Your main spreadsheet
const INSPECTION_SHEET_NAME = 'Pool Inspection';
const CUSTOMERS_SHEET = 'Customers';

// Google Maps API Key for satellite images
// To set: PropertiesService.getScriptProperties().setProperty('GOOGLE_MAPS_API_KEY', 'your-api-key');
const GOOGLE_MAPS_API_KEY = PropertiesService.getScriptProperties().getProperty('GOOGLE_MAPS_API_KEY') || 'AIzaSyAbxEM5S4vVw7ZO_w2CZh_21JPwrVG2Z7Q';

// Serve the HTML interface
function doGet() {
  return HtmlService.createHtmlOutputFromFile('FullInspectionUI')
    .setTitle('Full Pool Inspection Report')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Get Square API URL
function getSquareApiUrl() {
  return SQUARE_ENVIRONMENT === 'sandbox' 
    ? 'https://connect.squareupsandbox.com/v2'
    : 'https://connect.squareup.com/v2';
}

// ==================== OPENAI INTEGRATION ====================

// Enhance notes using OpenAI GPT-4
function enhanceNotesWithAI(originalNotes, context) {
  try {
    if (!originalNotes || originalNotes.trim().length === 0) {
      return {
        success: false,
        error: 'No notes provided'
      };
    }
    
    const systemPrompt = `You are a professional pool inspector writing reports for homeowners (often older people). The inspector types quick shorthand notes in the field. Your job is to expand them into clear, complete sentences that explain what's wrong and what it means - but use simple, everyday language that anyone can understand.`;
    
    const userPrompt = `Context: ${context}

Inspector's quick notes:
${originalNotes}

Expand these notes into clear, simple sentences:
- Explain what the issue is
- Explain what it means or why it matters
- Explain what might need to be done
- Use simple, everyday words (no jargon)
- Keep sentences SHORT and clear
- Write in third person (use "the", "this", "it" - NOT "we" or "I")
- Be friendly but professional
- DO NOT use quotation marks in your response
- Only return the plain text, no quotes or formatting

Examples:
pump loud → The pump is making loud noises. This usually means the bearings are wearing out and the pump will need to be repaired or replaced soon.

mpv leaking → The multiport valve is leaking water. This valve controls the filter and will need to be replaced to stop the leak.

minor crk in conc → There is a small crack in the concrete. It should be monitored to make sure it does not get bigger.

wet grass equip area → The grass around the equipment is wet. This might indicate a small leak in the pipes that needs to be found and fixed.

Expand the notes to be helpful and clear. Return only the plain expanded text with no quotation marks.`;
    
    const requestBody = {
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userPrompt
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    };
    
    const options = {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + OPENAI_API_KEY
      },
      payload: JSON.stringify(requestBody),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(OPENAI_API_URL, options);
    const responseCode = response.getResponseCode();
    const result = JSON.parse(response.getContentText());
    
    if (responseCode === 200 && result.choices && result.choices.length > 0) {
      const enhancedText = result.choices[0].message.content;
      
      return {
        success: true,
        originalNotes: originalNotes,
        enhancedNotes: enhancedText.trim()
      };
    } else {
      Logger.log('OpenAI API error: ' + JSON.stringify(result));
      return {
        success: false,
        error: result.error ? result.error.message : 'AI service unavailable'
      };
    }
  } catch (error) {
    Logger.log('Error enhancing notes with AI: ' + error);
    return {
      success: false,
      error: error.toString()
    };
  }
}

// ==================== GOOGLE MAPS API ====================

/**
 * Get satellite image for an address using Google Maps Static API
 * Same format as Customer Portal
 */
function getSatelliteImage(address) {
  try {
    if (!GOOGLE_MAPS_API_KEY) {
      return { success: false, error: 'Google Maps API key not configured' };
    }
    
    // Geocode the address first to get lat/long
    const geocodeUrl = 'https://maps.googleapis.com/maps/api/geocode/json?address=' + encodeURIComponent(address) + '&key=' + GOOGLE_MAPS_API_KEY;
    const geocodeResponse = UrlFetchApp.fetch(geocodeUrl);
    const geocodeData = JSON.parse(geocodeResponse.getContentText());
    
    if (geocodeData.status !== 'OK' || !geocodeData.results || geocodeData.results.length === 0) {
      return { success: false, error: 'Address not found' };
    }
    
    const location = geocodeData.results[0].geometry.location;
    const lat = location.lat;
    const lng = location.lng;
    
    // Get satellite image (640x640 pixels, zoom level 20 for closer detailed view)
    const imageUrl = 'https://maps.googleapis.com/maps/api/staticmap?center=' + lat + ',' + lng + '&zoom=20&size=640x640&maptype=satellite&key=' + GOOGLE_MAPS_API_KEY;
    
    return {
      success: true,
      satelliteImageUrl: imageUrl,
      coordinates: { lat: lat, lng: lng },
      formattedAddress: geocodeData.results[0].formatted_address
    };
    
  } catch (error) {
    Logger.log('Error getting satellite image: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

// ==================== SQUARE API INTEGRATION ====================

// Fetch customers from Square
function getSquareCustomers() {
  return getCustomersFromSheet();
}

function getCustomersFromSheet() {
  Logger.log('Fetching customers from Customers sheet for inspection...');
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = spreadsheet.getSheetByName(CUSTOMERS_SHEET);

    if (!sheet) {
      return { success: true, customers: [] };
    }

    const data = sheet.getDataRange().getValues();
    if (!data || data.length < 2) {
      return { success: true, customers: [] };
    }

    const headers = data[0].map(h => String(h || '').trim().toLowerCase());
    const findCol = (name) => headers.indexOf(String(name || '').trim().toLowerCase());

    const idCol = findCol('customer id');
    const nameCol = findCol('name');
    const emailCol = findCol('email');
    const phoneCol = findCol('phone');
    const addressCol = findCol('address');
    const cityCol = findCol('city');
    const stateCol = findCol('state');
    const zipCol = findCol('zip code');

    const customers = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const name = nameCol >= 0 ? String(row[nameCol] || '').trim() : '';
      const email = emailCol >= 0 ? String(row[emailCol] || '').trim() : '';
      if (!name && !email) continue;

      let fullAddress = addressCol >= 0 ? String(row[addressCol] || '').trim() : '';
      const city = cityCol >= 0 ? String(row[cityCol] || '').trim() : '';
      const state = stateCol >= 0 ? String(row[stateCol] || '').trim() : '';
      const zip = zipCol >= 0 ? String(row[zipCol] || '').trim() : '';
      const addressParts = [city, state, zip].filter(Boolean);
      if (addressParts.length) {
        fullAddress = fullAddress ? (fullAddress + ', ' + addressParts.join(', ')) : addressParts.join(', ');
      }

      customers.push({
        id: idCol >= 0 ? String(row[idCol] || '').trim() : email,
        name: name || 'No Name',
        email: email,
        phone: phoneCol >= 0 ? String(row[phoneCol] || '').trim() : '',
        address: fullAddress
      });
    }

    Logger.log('Loaded ' + customers.length + ' customers from sheet');
    return { success: true, customers: customers };
  } catch (error) {
    Logger.log('Error fetching customers from sheet: ' + error.toString());
    return { success: false, customers: [], error: error.toString() };
  }
}

function addCustomerToSheet(customerData) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = spreadsheet.getSheetByName(CUSTOMERS_SHEET);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(CUSTOMERS_SHEET);
      sheet.getRange(1, 1, 1, 5).setValues([['Customer ID', 'Name', 'Email', 'Phone', 'Address']]);
    } else if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, 5).setValues([['Customer ID', 'Name', 'Email', 'Phone', 'Address']]);
    }

    const name = String(customerData && customerData.name || '').trim();
    const email = String(customerData && customerData.email || '').trim();
    const phone = String(customerData && customerData.phone || '').trim();
    const address = String(customerData && customerData.address || '').trim();

    if (!name) return { success: false, error: 'Customer name is required' };

    const customerId = 'CUST-' + Date.now();
    sheet.appendRow([customerId, name, email, phone, address]);

    return {
      success: true,
      customerId,
      customer: { id: customerId, name, email, phone, address }
    };
  } catch (error) {
    Logger.log('Error adding customer to sheet: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

// Create new customer in Square
function createSquareCustomer(customerData) {
  try {
    const url = getSquareApiUrl() + '/customers';
    
    const nameParts = customerData.name.trim().split(' ');
    const givenName = nameParts[0] || '';
    const familyName = nameParts.slice(1).join(' ') || '';
    
    let addressObj = undefined;
    if (customerData.address) {
      addressObj = {
        address_line_1: customerData.address
      };
    }
    
    const payload = {
      idempotency_key: Utilities.getUuid(),
      given_name: givenName,
      family_name: familyName,
      email_address: customerData.email || undefined,
      phone_number: customerData.phone || undefined,
      address: addressObj,
      note: 'Created via Full Inspection - ' + new Date().toLocaleDateString()
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
    const result = JSON.parse(response.getContentText());
    
    if (response.getResponseCode() === 200 && result.customer) {
      return {
        success: true,
        customerId: result.customer.id,
        customer: {
          id: result.customer.id,
          name: `${givenName} ${familyName}`.trim(),
          email: result.customer.email_address || '',
          phone: result.customer.phone_number || '',
          address: formatSquareAddress(result.customer.address)
        }
      };
    } else {
      return {
        success: false,
        error: result.errors ? result.errors[0].detail : 'Failed to create customer'
      };
    }
  } catch (error) {
    Logger.log('Error creating Square customer: ' + error);
    return {
      success: false,
      error: error.toString()
    };
  }
}

// Format Square address
function formatSquareAddress(address) {
  if (!address) return '';
  
  const parts = [
    address.address_line_1,
    address.address_line_2,
    address.locality,
    address.administrative_district_level_1,
    address.postal_code
  ].filter(Boolean);
  
  return parts.join(', ');
}

// ==================== FILE HANDLING ====================

// Parse HTML content and convert to formatted text for Google Docs
function parseHtmlToDocument(htmlContent) {
  // Extract text content from HTML, preserving basic structure
  // Remove script and style tags
  let text = htmlContent.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Replace common HTML elements with line breaks
  text = text.replace(/<\/h[1-6]>/gi, '\n\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<\/tr>/gi, '\n');
  
  // Remove all remaining HTML tags
  text = text.replace(/<[^>]*>/g, '');
  
  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  
  // Clean up extra whitespace
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/[ \t]+/g, ' ');
  text = text.trim();
  
  return text;
}

// Save inspection report with photos and videos
function saveInspectionReport(reportData) {
  try {
    Logger.log('Starting inspection report save...');
    
    const mainFolder = DriveApp.getFolderById(INSPECTION_DRIVE_FOLDER_ID);
    
    // Create customer folder: "Customer Name - Address"
    const customerFolderName = `${reportData.customerName} - ${reportData.propertyAddress || 'No Address'}`;
    const customerFolder = getOrCreateFolder(mainFolder, customerFolderName);
    
    // Create filename with date
    const dateStr = new Date().toLocaleDateString().replace(/\//g, '-');
    const fileName = `Full Inspection - ${reportData.customerName} - ${dateStr}.pdf`;
    
    // Generate HTML content for PDF (without embedded images to reduce file size)
    const htmlContentForPDF = generateInspectionHTMLForPDF(reportData);
    
    // Also generate full HTML with images for reference
    const htmlContentFull = generateInspectionHTML(reportData);
    
    // Convert HTML to PDF using Drive API (handles large files better)
    let pdfFile = null;
    
    try {
      // Check if Drive API is available
      if (typeof Drive !== 'undefined' && Drive.Files && typeof Docs !== 'undefined' && Docs.Documents) {
        // Method 1: Use Drive API to create a Google Document and export as PDF
        const tempDocName = 'Temp Inspection ' + Date.now();
        const documentResource = {
          title: tempDocName,
          mimeType: MimeType.GOOGLE_DOCS
        };
        
        const createResponse = Drive.Files.insert(documentResource);
        const tempDocId = createResponse.id;
        const tempDocFile = DriveApp.getFileById(tempDocId);
        
        // Move to customer folder
        const parentFolders = tempDocFile.getParents();
        if (parentFolders.hasNext()) {
          const parentFolder = parentFolders.next();
          parentFolder.removeFile(tempDocFile);
          customerFolder.addFile(tempDocFile);
        }
        
        // Insert content into document (text only, no images)
        const formattedContent = parseHtmlToDocument(htmlContentForPDF);
        const updateRequest = {
          requests: [{
            insertText: {
              location: { index: 1 },
              text: formattedContent
            }
          }]
        };
        
        Docs.Documents.batchUpdate(updateRequest, tempDocId);
        
        // Wait for document to be ready
        Utilities.sleep(2000);
        
        // Export as PDF
        const pdfBlob = tempDocFile.getAs(MimeType.PDF);
        pdfBlob.setName(fileName);
        pdfFile = customerFolder.createFile(pdfBlob);
        tempDocFile.setTrashed(true);
        
        Logger.log('PDF saved via Drive API: ' + pdfFile.getUrl());
      } else {
        throw new Error('Drive API or Docs API not available');
      }
    } catch (apiError) {
      Logger.log('Drive API method failed: ' + apiError);
      
      // Method 2: Try Drive's native HTML to PDF conversion (without images)
      try {
        const htmlBlob = Utilities.newBlob(htmlContentForPDF, 'text/html', 'temp.html');
        const tempHtmlFile = customerFolder.createFile(htmlBlob);
        
        // Try to convert to PDF
        const pdfBlob = tempHtmlFile.getAs(MimeType.PDF);
        if (pdfBlob && pdfBlob.getBytes().length > 100) {
          pdfBlob.setName(fileName);
          pdfFile = customerFolder.createFile(pdfBlob);
          tempHtmlFile.setTrashed(true);
          Logger.log('PDF saved via Drive native conversion: ' + pdfFile.getUrl());
        } else {
          tempHtmlFile.setTrashed(true);
          throw new Error('PDF conversion returned invalid file');
        }
      } catch (nativeError) {
        Logger.log('Drive native conversion failed: ' + nativeError);
        
        // Method 3: Save as HTML file (user can convert manually)
        const htmlFileName = fileName.replace('.pdf', '.html');
        const htmlBlob = Utilities.newBlob(htmlContentFull, 'text/html', htmlFileName);
        const htmlFile = customerFolder.createFile(htmlBlob);
        htmlFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        
        Logger.log('HTML file saved (PDF conversion unavailable): ' + htmlFile.getUrl());
        
        // Provide helpful error message
        throw new Error('PDF conversion is not available. HTML file saved at: ' + htmlFile.getUrl() + 
          '. To enable PDF conversion, you need to:\n' +
          '1. Go to Extensions > Apps Script in your Google Sheet\n' +
          '2. Click on "Services" (left sidebar) or go to Resources > Advanced Google Services\n' +
          '3. Enable "Drive API" and "Google Docs API"\n' +
          '4. Re-run the inspection save function\n' +
          'Alternatively, you can open the HTML file in a browser and print to PDF.');
      }
    }
    
    // Set sharing permissions
    pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    Logger.log('PDF saved: ' + pdfFile.getUrl());
    
    // Save photos
    const photoFiles = [];
    if (reportData.photos && reportData.photos.length > 0) {
      Logger.log('Saving ' + reportData.photos.length + ' photos...');
      
      for (let i = 0; i < reportData.photos.length; i++) {
        const photo = reportData.photos[i];
        if (photo.data) {
          try {
            const photoFileName = `${photo.label} - ${dateStr}.jpg`;
            const photoBlob = Utilities.newBlob(
              Utilities.base64Decode(photo.data.split(',')[1]),
              'image/jpeg',
              photoFileName
            );
            const photoFile = customerFolder.createFile(photoBlob);
            photoFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            photoFiles.push(photoFile);
            Logger.log('Photo saved: ' + photo.label);
          } catch (photoError) {
            Logger.log('Error saving photo ' + photo.label + ': ' + photoError);
          }
        }
      }
    }
    
    // Save videos
    const videoFiles = [];
    if (reportData.videos && reportData.videos.length > 0) {
      Logger.log('Saving ' + reportData.videos.length + ' videos...');
      
      for (let i = 0; i < reportData.videos.length; i++) {
        const video = reportData.videos[i];
        if (video.data) {
          try {
            const videoFileName = `${video.label} - ${dateStr}.mp4`;
            const videoBlob = Utilities.newBlob(
              Utilities.base64Decode(video.data.split(',')[1]),
              'video/mp4',
              videoFileName
            );
            const videoFile = customerFolder.createFile(videoBlob);
            videoFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            videoFiles.push(videoFile);
            Logger.log('Video saved: ' + video.label);
          } catch (videoError) {
            Logger.log('Error saving video ' + video.label + ': ' + videoError);
          }
        }
      }
    }
    
    // Prepare result object first
    const result = {
      success: true,
      fileUrl: pdfFile.getUrl(),
      fileName: fileName,
      folderUrl: customerFolder.getUrl(),
      folderName: customerFolderName,
      photoCount: photoFiles.length,
      videoCount: videoFiles.length,
      photoFiles: photoFiles,
      videoFiles: videoFiles
    };
    
    // Send email notification to team (do this BEFORE sheet save so emails aren't blocked)
    try {
    sendInspectionEmail(reportData, pdfFile, photoFiles, videoFiles, false);
      Logger.log('✓ Team email sent');
    } catch (emailError) {
      Logger.log('Error sending team email: ' + emailError);
    }
    
    // NOTE: Customer email and text message are now sent separately via UI buttons
    // They are NOT sent automatically during report generation
    
    // Send SMS if requested (currently disabled)
    if (reportData.textCustomer && reportData.customerPhone && TWILIO_ENABLED) {
      // SMS functionality here when enabled
      Logger.log('SMS requested but currently disabled');
    }
    
    // Track in sheet (try to save AFTER emails are sent, so emails aren't blocked by sheet errors)
    try {
      const sheetResult = saveInspectionToSheet(reportData, result, 'generated');
      if (sheetResult.success) {
        result.inspectionId = sheetResult.inspectionId;
        Logger.log('✓ Inspection saved to sheet: ' + sheetResult.inspectionId);
      } else {
        Logger.log('Warning: Failed to save to sheet: ' + (sheetResult.error || 'Unknown error'));
        // Still continue even if sheet save fails
      }
    } catch (sheetError) {
      Logger.log('Error saving to sheet (continuing anyway): ' + sheetError);
      Logger.log('Sheet error details: ' + sheetError.toString());
      // Continue even if sheet save fails - emails were already sent
    }
    
    return result;
    
  } catch (error) {
    Logger.log('Error saving inspection report: ' + error);
    Logger.log('Error stack: ' + error.stack);
    return {
      success: false,
      error: error.toString()
    };
  }
}

// Get or create folder and make it shareable
function getOrCreateFolder(parentFolder, folderName) {
  const folders = parentFolder.getFoldersByName(folderName);
  
  if (folders.hasNext()) {
    const folder = folders.next();
    try {
      folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) {
      Logger.log('Note: Could not update folder sharing: ' + e);
    }
    return folder;
  } else {
    const newFolder = parentFolder.createFolder(folderName);
    newFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    Logger.log('✓ Created and shared customer folder: ' + folderName);
    return newFolder;
  }
}

// ==================== SHEET TRACKING ====================

// Initialize the Pool Inspection sheet if it doesn't exist
function initializeInspectionSheet() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(INSPECTION_SHEET_NAME);
    
    if (!sheet) {
      sheet = ss.insertSheet(INSPECTION_SHEET_NAME);
      
      // Set up headers
      const headers = [
        'Inspection ID',
        'Status',
        'Customer Name',
        'Customer Email',
        'Customer Phone',
        'Property Address',
        'Inspector Name',
        'Inspection Date',
        'Pool Type',
        'Overall Condition',
        'PDF URL',
        'Folder URL',
        'Photo URLs',
        'Video URLs',
        'Report Data (JSON)',
        'Created At',
        'Updated At',
        'Deleted At'
      ];
      
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.getRange(1, 1, 1, headers.length).setBackground('#4285f4');
      sheet.getRange(1, 1, 1, headers.length).setFontColor('#ffffff');
      sheet.setFrozenRows(1);
      
      // Set column widths
      sheet.setColumnWidth(1, 120); // Inspection ID
      sheet.setColumnWidth(2, 100); // Status
      sheet.setColumnWidth(3, 150); // Customer Name
      sheet.setColumnWidth(4, 200); // Customer Email
      sheet.setColumnWidth(5, 120); // Customer Phone
      sheet.setColumnWidth(6, 250); // Property Address
      sheet.setColumnWidth(7, 150); // Inspector Name
      sheet.setColumnWidth(8, 120); // Inspection Date
      sheet.setColumnWidth(9, 120); // Pool Type
      sheet.setColumnWidth(10, 150); // Overall Condition
      sheet.setColumnWidth(11, 300); // PDF URL
      sheet.setColumnWidth(12, 300); // Folder URL
      sheet.setColumnWidth(13, 300); // Photo URLs
      sheet.setColumnWidth(14, 300); // Video URLs
      sheet.setColumnWidth(15, 400); // Report Data
      sheet.setColumnWidth(16, 150); // Created At
      sheet.setColumnWidth(17, 150); // Updated At
      sheet.setColumnWidth(18, 150); // Deleted At
      
      Logger.log('✓ Inspection sheet initialized');
    }
    
    return sheet;
  } catch (error) {
    Logger.log('Error initializing inspection sheet: ' + error);
    throw error;
  }
}

// Save inspection to sheet (called when generating or saving)
function saveInspectionToSheet(reportData, result, status = 'generated') {
  try {
    const sheet = initializeInspectionSheet();
    
    // Generate unique inspection ID
    const inspectionId = reportData.inspectionId || 'INSP-' + Date.now();
    const now = new Date();
    
    // Extract photo URLs from saved files
    const photoUrls = [];
    if (result && result.photoFiles) {
      result.photoFiles.forEach(photo => {
        if (photo.getUrl) {
          photoUrls.push(photo.getUrl());
        }
      });
    }
    
    // Extract video URLs
    const videoUrls = [];
    if (result && result.videoFiles) {
      result.videoFiles.forEach(video => {
        if (video.getUrl) {
          videoUrls.push(video.getUrl());
        }
      });
    }
    
    // Check if inspection already exists
    const data = sheet.getDataRange().getValues();
    let rowIndex = -1;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === inspectionId) {
        rowIndex = i + 1;
        break;
      }
    }
    
    // Prepare report data JSON (remove base64 images to avoid cell size limit)
    // Create a copy without base64 data
    const reportDataForSheet = JSON.parse(JSON.stringify(reportData));
    
    // Replace photos with just metadata (label and URL if available)
    if (reportDataForSheet.photos && Array.isArray(reportDataForSheet.photos)) {
      reportDataForSheet.photos = reportDataForSheet.photos.map((photo, index) => {
        const photoUrl = photoUrls[index] || '';
        return {
          label: photo.label || `Photo ${index + 1}`,
          url: photoUrl,
          index: index
        };
      });
    }
    
    // Replace videos with just metadata
    if (reportDataForSheet.videos && Array.isArray(reportDataForSheet.videos)) {
      reportDataForSheet.videos = reportDataForSheet.videos.map((video, index) => {
        const videoUrl = videoUrls[index] || '';
        return {
          label: video.label || `Video ${index + 1}`,
          url: videoUrl,
          index: index
        };
      });
    }
    
    // Remove base64 signature data (store as text reference only)
    if (reportDataForSheet.inspectorSignature) {
      reportDataForSheet.inspectorSignature = '[Signature saved in PDF]';
    }
    
    const reportDataJson = JSON.stringify(reportDataForSheet);
    
    // Check if JSON is still too large (Google Sheets limit is 50,000 characters)
    if (reportDataJson.length > 45000) {
      Logger.log('Warning: Report data JSON is large (' + reportDataJson.length + ' chars). Truncating non-essential data...');
      // Remove some verbose fields if still too large
      if (reportDataForSheet.recommendations && reportDataForSheet.recommendations.additionalNotes) {
        const notesLength = reportDataForSheet.recommendations.additionalNotes.length;
        if (notesLength > 5000) {
          reportDataForSheet.recommendations.additionalNotes = reportDataForSheet.recommendations.additionalNotes.substring(0, 5000) + '...[truncated]';
        }
      }
    }
    
    const rowData = [
      inspectionId,
      status,
      reportData.customerName || '',
      reportData.customerEmail || '',
      reportData.customerPhone || '',
      reportData.propertyAddress || '',
      reportData.inspectorName || '',
      new Date().toLocaleDateString(),
      reportData.poolType || '',
      reportData.overallCondition || '',
      result && result.fileUrl ? result.fileUrl : '',
      result && result.folderUrl ? result.folderUrl : '',
      photoUrls.join(' | '),
      videoUrls.join(' | '),
      JSON.stringify(reportDataForSheet),
      now.toISOString(),
      now.toISOString(),
      '' // Deleted At (empty if not deleted)
    ];
    
    if (rowIndex > 0) {
      // Update existing row
      sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
      sheet.getRange(rowIndex, 17).setValue(now.toISOString()); // Updated At
    } else {
      // Add new row
      sheet.appendRow(rowData);
    }
    
    Logger.log('✓ Inspection saved to sheet: ' + inspectionId);
    
    return {
      success: true,
      inspectionId: inspectionId,
      status: status
    };
  } catch (error) {
    Logger.log('Error saving inspection to sheet: ' + error);
    return {
      success: false,
      error: error.toString()
    };
  }
}

// Get unsaved inspections (status = 'generated' or 'draft')
function getUnsavedInspections() {
  try {
    Logger.log('getUnsavedInspections: Starting...');
    const sheet = initializeInspectionSheet();
    
    if (!sheet) {
      Logger.log('getUnsavedInspections: Sheet is null!');
      return {
        success: false,
        error: 'Failed to initialize inspection sheet',
        inspections: []
      };
    }
    
    const data = sheet.getDataRange().getValues();
    Logger.log('getUnsavedInspections: Data rows: ' + data.length);
    
    if (data.length <= 1) {
      Logger.log('getUnsavedInspections: No data rows (only header)');
      return { success: true, inspections: [] };
    }
    
    const unsaved = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const status = row[1]; // Status column
      const deletedAt = row[17]; // Deleted At column
      
      if ((status === 'generated' || status === 'draft') && !deletedAt) {
        // Convert dates to strings for proper serialization
        let createdAtStr = '';
        let inspectionDateStr = '';
        
        if (row[15]) {
          const createdAt = row[15];
          createdAtStr = createdAt instanceof Date ? createdAt.toISOString() : String(createdAt);
        }
        
        if (row[7]) {
          const inspectionDate = row[7];
          inspectionDateStr = inspectionDate instanceof Date ? inspectionDate.toISOString().split('T')[0] : String(inspectionDate);
        }
        
        const inspection = {
          inspectionId: String(row[0] || ''),
          status: String(status || 'draft'),
          customerName: String(row[2] || 'Unknown'),
          propertyAddress: String(row[5] || ''),
          inspectionDate: inspectionDateStr,
          createdAt: createdAtStr || new Date().toISOString()
        };
        
        Logger.log('getUnsavedInspections: Adding unsaved: ' + inspection.inspectionId + ' - ' + inspection.customerName);
        unsaved.push(inspection);
      }
    }
    
    Logger.log('getUnsavedInspections: Found ' + unsaved.length + ' unsaved inspections');
    
    return {
      success: true,
      inspections: unsaved
    };
  } catch (error) {
    Logger.log('Error getting unsaved inspections: ' + error);
    Logger.log('Error stack: ' + error.stack);
    return {
      success: false,
      error: error.toString(),
      inspections: []
    };
  }
}

// Load inspection by ID
function loadInspection(inspectionId) {
  try {
    Logger.log('Loading inspection: ' + inspectionId);
    const sheet = initializeInspectionSheet();
    const data = sheet.getDataRange().getValues();
    
    Logger.log('Total rows in sheet: ' + data.length);
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === inspectionId) {
        Logger.log('Found inspection at row: ' + (i + 1));
        const row = data[i];
        const reportDataJson = row[14]; // Report Data column
        
        Logger.log('Report data JSON length: ' + (reportDataJson ? reportDataJson.length : 0));
        
        if (reportDataJson && reportDataJson.trim().length > 0) {
          try {
            const reportData = JSON.parse(reportDataJson);
            Logger.log('Successfully parsed JSON. Has customerName: ' + (reportData.customerName || 'NO'));
            
            return {
              success: true,
              inspection: reportData,
              inspectionId: inspectionId,
              status: row[1],
              pdfUrl: row[10] || '',
              folderUrl: row[11] || '',
              photoUrls: row[12] ? row[12].split(' | ').filter(url => url.trim()) : [],
              videoUrls: row[13] ? row[13].split(' | ').filter(url => url.trim()) : []
            };
          } catch (parseError) {
            Logger.log('JSON parse error: ' + parseError);
            Logger.log('JSON content (first 200 chars): ' + reportDataJson.substring(0, 200));
            return {
              success: false,
              error: 'Failed to parse inspection data: ' + parseError.toString()
            };
          }
        } else {
          Logger.log('No report data found for inspection');
          return {
            success: false,
            error: 'Inspection data is empty'
          };
        }
      }
    }
    
    Logger.log('Inspection not found: ' + inspectionId);
    return {
      success: false,
      error: 'Inspection not found'
    };
  } catch (error) {
    Logger.log('Error loading inspection: ' + error);
    Logger.log('Error stack: ' + error.stack);
    return {
      success: false,
      error: error.toString()
    };
  }
}

// Get all inspections (for dropdown/list)
function getAllInspections() {
  try {
    Logger.log('getAllInspections: Starting...');
    const sheet = initializeInspectionSheet();
    
    if (!sheet) {
      Logger.log('getAllInspections: Sheet is null!');
      return {
        success: false,
        error: 'Failed to initialize inspection sheet',
        inspections: []
      };
    }
    
    Logger.log('getAllInspections: Sheet found, getting data...');
    const data = sheet.getDataRange().getValues();
    Logger.log('getAllInspections: Data rows: ' + data.length);
    
    if (data.length <= 1) {
      Logger.log('getAllInspections: No data rows (only header)');
      return { success: true, inspections: [] };
    }
    
    const inspections = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const deletedAt = row[17];
      
      if (!deletedAt) { // Only include non-deleted
        // Convert dates to strings for proper serialization
        let createdAtStr = '';
        let updatedAtStr = '';
        let inspectionDateStr = '';
        
        if (row[15]) {
          const createdAt = row[15];
          createdAtStr = createdAt instanceof Date ? createdAt.toISOString() : String(createdAt);
        }
        
        if (row[16]) {
          const updatedAt = row[16];
          updatedAtStr = updatedAt instanceof Date ? updatedAt.toISOString() : String(updatedAt);
        }
        
        if (row[7]) {
          const inspectionDate = row[7];
          inspectionDateStr = inspectionDate instanceof Date ? inspectionDate.toISOString().split('T')[0] : String(inspectionDate);
        }
        
        const inspection = {
          inspectionId: String(row[0] || ''),
          status: String(row[1] || 'draft'),
          customerName: String(row[2] || 'Unknown'),
          propertyAddress: String(row[5] || ''),
          inspectionDate: inspectionDateStr,
          poolType: String(row[8] || ''),
          overallCondition: String(row[9] || ''),
          createdAt: createdAtStr || new Date().toISOString(),
          updatedAt: updatedAtStr || new Date().toISOString()
        };
        
        Logger.log('getAllInspections: Adding inspection: ' + inspection.inspectionId + ' - ' + inspection.customerName);
        inspections.push(inspection);
      }
    }
    
    Logger.log('getAllInspections: Found ' + inspections.length + ' inspections');
    
    // Sort by date (newest first)
    inspections.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
      const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
      return dateB - dateA;
    });
    
    const result = {
      success: true,
      inspections: inspections
    };
    
    Logger.log('getAllInspections: Returning result with ' + inspections.length + ' inspections');
    Logger.log('getAllInspections: First inspection ID: ' + (inspections.length > 0 ? inspections[0].inspectionId : 'none'));
    
    return result;
  } catch (error) {
    Logger.log('Error getting all inspections: ' + error);
    Logger.log('Error stack: ' + error.stack);
    return {
      success: false,
      error: error.toString(),
      inspections: []
    };
  }
}

// Save inspection (change status from 'generated' to 'saved')
function saveInspection(inspectionId) {
  return updateInspectionStatus(inspectionId, 'saved');
}

// Save draft inspection (partial/incomplete form data)
function saveDraftInspection(reportData) {
  try {
    const sheet = initializeInspectionSheet();
    
    // Generate or use existing inspection ID
    const inspectionId = reportData.inspectionId || 'DRAFT-' + Date.now();
    const now = new Date();
    
    // Check if inspection already exists
    const data = sheet.getDataRange().getValues();
    let rowIndex = -1;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === inspectionId) {
        rowIndex = i + 1;
        break;
      }
    }
    
    // Prepare report data JSON (store full data, even if incomplete)
    const reportDataJson = JSON.stringify(reportData);
    
    // Extract photo URLs if they exist in the data
    const photoUrls = [];
    if (reportData.photos && Array.isArray(reportData.photos)) {
      reportData.photos.forEach(photo => {
        // If photo has a URL, use it; otherwise it's base64 data
        if (photo.url) {
          photoUrls.push(photo.url);
        }
      });
    }
    
    const rowData = [
      inspectionId,
      'draft', // Status: draft
      reportData.customerName || '',
      reportData.customerEmail || '',
      reportData.customerPhone || '',
      reportData.propertyAddress || '',
      reportData.inspectorName || '',
      new Date().toLocaleDateString(),
      reportData.poolType || '',
      reportData.overallCondition || '',
      '', // PDF URL (empty for drafts)
      '', // Folder URL (empty for drafts)
      photoUrls.join(' | '),
      '', // Video URLs (empty for drafts)
      reportDataJson,
      now.toISOString(),
      now.toISOString(),
      '' // Deleted At (empty if not deleted)
    ];
    
    if (rowIndex > 0) {
      // Update existing row
      sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
      sheet.getRange(rowIndex, 17).setValue(now.toISOString()); // Updated At
    } else {
      // Add new row
      sheet.appendRow(rowData);
    }
    
    Logger.log('✓ Draft inspection saved to sheet: ' + inspectionId);
    
    return {
      success: true,
      inspectionId: inspectionId,
      status: 'draft'
    };
  } catch (error) {
    Logger.log('Error saving draft inspection: ' + error);
    return {
      success: false,
      error: error.toString()
    };
  }
}

// Update inspection status
function updateInspectionStatus(inspectionId, status) {
  try {
    const sheet = initializeInspectionSheet();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === inspectionId) {
        sheet.getRange(i + 1, 2).setValue(status); // Status column
        sheet.getRange(i + 1, 17).setValue(new Date().toISOString()); // Updated At
        return { success: true };
      }
    }
    
    return { success: false, error: 'Inspection not found' };
  } catch (error) {
    Logger.log('Error updating inspection status: ' + error);
    return { success: false, error: error.toString() };
  }
}

// Delete inspection (soft delete - sets Deleted At)
function deleteInspection(inspectionId) {
  try {
    Logger.log('Deleting inspection: ' + inspectionId);
    const sheet = initializeInspectionSheet();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === inspectionId) {
        // Actually delete the row from the sheet
        sheet.deleteRow(i + 1);
        Logger.log('Successfully deleted row ' + (i + 1) + ' for inspection: ' + inspectionId);
        return { success: true };
      }
    }
    
    Logger.log('Inspection not found: ' + inspectionId);
    return { success: false, error: 'Inspection not found' };
  } catch (error) {
    Logger.log('Error deleting inspection: ' + error);
    Logger.log('Error stack: ' + error.stack);
    return { success: false, error: error.toString() };
  }
}

// Restore inspection (clears Deleted At)
function restoreInspection(inspectionId) {
  try {
    const sheet = initializeInspectionSheet();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === inspectionId) {
        sheet.getRange(i + 1, 18).setValue(''); // Clear Deleted At
        return { success: true };
      }
    }
    
    return { success: false, error: 'Inspection not found' };
  } catch (error) {
    Logger.log('Error restoring inspection: ' + error);
    return { success: false, error: error.toString() };
  }
}

// Resend email for a past inspection
function resendInspectionEmail(inspectionId, emailCustomer = true) {
  try {
    // Load the inspection
    const loadResult = loadInspection(inspectionId);
    if (!loadResult.success) {
      return { success: false, error: 'Inspection not found' };
    }
    
    const reportData = loadResult.inspection;
    
    // Get PDF file from URL
    let pdfFile = null;
    if (loadResult.pdfUrl) {
      try {
        const fileId = loadResult.pdfUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (fileId && fileId[1]) {
          pdfFile = DriveApp.getFileById(fileId[1]);
        }
      } catch (e) {
        Logger.log('Could not load PDF file: ' + e);
      }
    }
    
    // Get photo files from URLs
    const photoFiles = [];
    if (loadResult.photoUrls && loadResult.photoUrls.length > 0) {
      loadResult.photoUrls.forEach(url => {
        if (url) {
          try {
            const fileId = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
            if (fileId && fileId[1]) {
              photoFiles.push(DriveApp.getFileById(fileId[1]));
            }
          } catch (e) {
            Logger.log('Could not load photo file: ' + e);
          }
        }
      });
    }
    
    // Get video files from URLs
    const videoFiles = [];
    if (loadResult.videoUrls && loadResult.videoUrls.length > 0) {
      loadResult.videoUrls.forEach(url => {
        if (url) {
          try {
            const fileId = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
            if (fileId && fileId[1]) {
              videoFiles.push(DriveApp.getFileById(fileId[1]));
            }
          } catch (e) {
            Logger.log('Could not load video file: ' + e);
          }
        }
      });
    }
    
    if (!pdfFile) {
      return { success: false, error: 'PDF file not found. Please regenerate the inspection report.' };
    }
    
    // Send email
    const emailResult = sendInspectionEmail(reportData, pdfFile, photoFiles, videoFiles, emailCustomer);
    
    if (emailResult.success) {
      return {
        success: true,
        message: emailCustomer ? 'Email sent to customer successfully' : 'Email sent to team successfully'
      };
    } else {
      return {
        success: false,
        error: emailResult.error || 'Failed to send email'
      };
    }
  } catch (error) {
    Logger.log('Error resending inspection email: ' + error);
    return {
      success: false,
      error: error.toString()
    };
  }
}

// Preview report HTML (without saving) - uses same HTML as PDF
function previewInspectionReport(reportData) {
  try {
    // Generate the PDF HTML report (same as what gets converted to PDF)
    const htmlContent = generateInspectionHTMLForPDF(reportData);
    return {
      success: true,
      html: htmlContent
    };
  } catch (error) {
    Logger.log('Error generating preview: ' + error);
    return {
      success: false,
      error: error.toString()
    };
  }
}

// Send email to customer with text message (called separately after report generation)
function sendEmailToCustomer(inspectionId) {
  try {
    // Load inspection data
    const loadResult = loadInspection(inspectionId);
    if (!loadResult.success) {
      return { success: false, error: loadResult.error || 'Failed to load inspection' };
    }
    
    const reportData = loadResult.inspection;
    
    if (!reportData) {
      return { success: false, error: 'Inspection data not found' };
    }
    
    // Get PDF file from URL
    let pdfFile = null;
    if (loadResult.pdfUrl) {
      try {
        const fileId = loadResult.pdfUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (fileId && fileId[1]) {
          pdfFile = DriveApp.getFileById(fileId[1]);
        }
      } catch (e) {
        Logger.log('Could not load PDF file: ' + e);
        return { success: false, error: 'PDF file not found. Please regenerate the inspection report.' };
      }
    }
    
    // Get photo files from URLs
    const photoFiles = [];
    if (loadResult.photoUrls && loadResult.photoUrls.length > 0) {
      loadResult.photoUrls.forEach(url => {
        if (url) {
          try {
            const fileId = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
            if (fileId && fileId[1]) {
              photoFiles.push(DriveApp.getFileById(fileId[1]));
            }
          } catch (e) {
            Logger.log('Could not load photo file: ' + e);
          }
        }
      });
    }
    
    // Get video files from URLs
    const videoFiles = [];
    if (loadResult.videoUrls && loadResult.videoUrls.length > 0) {
      loadResult.videoUrls.forEach(url => {
        if (url) {
          try {
            const fileId = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
            if (fileId && fileId[1]) {
              videoFiles.push(DriveApp.getFileById(fileId[1]));
            }
          } catch (e) {
            Logger.log('Could not load video file: ' + e);
          }
        }
      });
    }
    
    if (!pdfFile) {
      return { success: false, error: 'PDF file not found. Please regenerate the inspection report.' };
    }
    
    if (!reportData.customerEmail) {
      return { success: false, error: 'Customer email not found in inspection data.' };
    }
    
    // Send email to customer (EMAIL ONLY - no text)
    const emailResult = sendInspectionEmail(reportData, pdfFile, photoFiles, videoFiles, true);
    
    if (!emailResult.success) {
      return { success: false, error: emailResult.error || 'Failed to send email' };
    }
    
    return {
      success: true,
      message: 'Email sent to customer successfully'
    };
  } catch (error) {
    Logger.log('Error sending email to customer: ' + error);
    return {
      success: false,
      error: error.toString()
    };
  }
}

// Send text message template to company phone (separate from email)
function sendTextToCompany(inspectionId) {
  try {
    // Load inspection data
    const loadResult = loadInspection(inspectionId);
    if (!loadResult.success) {
      return { success: false, error: loadResult.error || 'Failed to load inspection' };
    }
    
    const reportData = loadResult.inspection;
    
    if (!reportData) {
      return { success: false, error: 'Inspection data not found' };
    }
    
    // Get PDF file from URL
    let pdfFile = null;
    if (loadResult.pdfUrl) {
      try {
        const fileId = loadResult.pdfUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (fileId && fileId[1]) {
          pdfFile = DriveApp.getFileById(fileId[1]);
        }
      } catch (e) {
        Logger.log('Could not load PDF file: ' + e);
        return { success: false, error: 'PDF file not found. Please regenerate the inspection report.' };
      }
    }
    
    if (!pdfFile) {
      return { success: false, error: 'PDF file not found. Please regenerate the inspection report.' };
    }
    
    // Send text message template to Verizon (company phone)
    Logger.log('Sending text message template to company phone...');
    const textResult = sendTextMessageToVerizon(reportData, pdfFile);
    
    if (textResult.success) {
      return {
        success: true,
        message: 'Text message template sent to company phone successfully'
      };
    } else {
      return {
        success: false,
        error: textResult.error || 'Failed to send text message'
      };
    }
  } catch (error) {
    Logger.log('Error sending text to company: ' + error);
    return {
      success: false,
      error: error.toString()
    };
  }
}

// Send test text message with actual customer data and PDF (for testing)
function sendTestTextWithPDF(inspectionId) {
  try {
    // Load inspection data
    const loadResult = loadInspection(inspectionId);
    if (!loadResult.success) {
      return { success: false, error: loadResult.error || 'Failed to load inspection' };
    }
    
    const reportData = loadResult.inspection;
    
    if (!reportData) {
      return { success: false, error: 'Inspection data not found' };
    }
    
    // Get PDF file from URL
    let pdfFile = null;
    if (loadResult.pdfUrl) {
      try {
        const fileId = loadResult.pdfUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (fileId && fileId[1]) {
          pdfFile = DriveApp.getFileById(fileId[1]);
        }
      } catch (e) {
        Logger.log('Could not load PDF file: ' + e);
        return { success: false, error: 'PDF file not found. Please regenerate the inspection report.' };
      }
    }
    
    if (!pdfFile) {
      return { success: false, error: 'PDF file not found. Please regenerate the inspection report.' };
    }
    
    // Send text message template to Verizon (same as customer would get)
    const textResult = sendTextMessageToVerizon(reportData, pdfFile);
    
    if (textResult.success) {
      return {
        success: true,
        message: 'Test text message sent to company phone with PDF'
      };
    } else {
      return {
        success: false,
        error: textResult.error || 'Failed to send text message'
      };
    }
  } catch (error) {
    Logger.log('Error sending test text with PDF: ' + error);
    return {
      success: false,
      error: error.toString()
    };
  }
}

// Generate email preview HTML
function generateEmailPreview(reportData) {
  try {
    // Use the same email generation logic but return HTML instead of sending
    const logoUrl = 'https://cdn.prod.website-files.com/6931dc4e8e97334e195432df/6931dca5c5fb5c5fc0860f2c_test.png';
    
    // Generate photo gallery HTML (same as in sendInspectionEmail)
    let photoGalleryHTML = '';
    if (reportData.photos && reportData.photos.length > 0) {
      photoGalleryHTML = '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 30px 0;">';
      photoGalleryHTML += '<tr><td style="padding: 0 0 20px 0;">';
      photoGalleryHTML += '<table width="100%" cellpadding="0" cellspacing="0" border="0">';
      photoGalleryHTML += '<tr><td style="border-bottom: 2px solid #0284c7; padding-bottom: 10px;">';
      photoGalleryHTML += '<h3 style="margin: 0; color: #0369a1; font-size: 20px; font-weight: bold;">📸 Inspection Photos</h3>';
      photoGalleryHTML += '</td></tr></table>';
      photoGalleryHTML += '</td></tr>';
      
      for (let i = 0; i < reportData.photos.length; i += 2) {
        photoGalleryHTML += '<tr><td style="padding: 10px 0;">';
        photoGalleryHTML += '<table width="100%" cellpadding="0" cellspacing="0" border="0">';
        photoGalleryHTML += '<tr>';
        
        if (reportData.photos[i] && reportData.photos[i].data && reportData.photos[i].label) {
          const photo1 = reportData.photos[i];
          const imageData1 = photo1.data.includes('data:') ? photo1.data : `data:image/jpeg;base64,${photo1.data}`;
          photoGalleryHTML += '<td width="50%" style="padding: 0 5px 0 0; vertical-align: top;">';
          photoGalleryHTML += '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border: 1px solid #e5e7eb;">';
          photoGalleryHTML += '<tr><td style="padding: 0;">';
          photoGalleryHTML += `<img src="${imageData1}" alt="${photo1.label}" width="100%" style="max-width: 450px; height: auto; display: block;">`;
          photoGalleryHTML += '</td></tr>';
          photoGalleryHTML += '<tr><td style="padding: 12px; background: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">';
          photoGalleryHTML += `<p style="margin: 0; color: #374151; font-size: 13px; font-weight: bold;">${photo1.label}</p>`;
          photoGalleryHTML += '</td></tr></table></td>';
        }
        
        if (i + 1 < reportData.photos.length && reportData.photos[i + 1] && reportData.photos[i + 1].data && reportData.photos[i + 1].label) {
          const photo2 = reportData.photos[i + 1];
          const imageData2 = photo2.data.includes('data:') ? photo2.data : `data:image/jpeg;base64,${photo2.data}`;
          photoGalleryHTML += '<td width="50%" style="padding: 0 0 0 5px; vertical-align: top;">';
          photoGalleryHTML += '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border: 1px solid #e5e7eb;">';
          photoGalleryHTML += '<tr><td style="padding: 0;">';
          photoGalleryHTML += `<img src="${imageData2}" alt="${photo2.label}" width="100%" style="max-width: 450px; height: auto; display: block;">`;
          photoGalleryHTML += '</td></tr>';
          photoGalleryHTML += '<tr><td style="padding: 12px; background: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">';
          photoGalleryHTML += `<p style="margin: 0; color: #374151; font-size: 13px; font-weight: bold;">${photo2.label}</p>`;
          photoGalleryHTML += '</td></tr></table></td>';
        } else if (i + 1 >= reportData.photos.length) {
          photoGalleryHTML += '<td width="50%" style="padding: 0 0 0 5px;"></td>';
        }
        
        photoGalleryHTML += '</tr></table></td></tr>';
      }
      
      photoGalleryHTML += '</table>';
    }
    
    // Generate inspector notes
    let inspectorNotesHTML = '';
    if (reportData.recommendations && reportData.recommendations.additionalNotes) {
      const notes = reportData.recommendations.additionalNotes;
      inspectorNotesHTML = '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 30px 0;">';
      inspectorNotesHTML += '<tr><td style="background: #f0f9ff; border-left: 4px solid #0284c7; padding: 20px;">';
      inspectorNotesHTML += '<h3 style="margin: 0 0 15px 0; color: #0369a1; font-size: 18px; font-weight: bold;">📝 Inspector Notes</h3>';
      inspectorNotesHTML += `<p style="margin: 0; color: #374151; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${notes}</p>`;
      inspectorNotesHTML += '</td></tr></table>';
    }
    
    // Generate full email HTML (same structure as sendInspectionEmail but for preview)
    const emailHTML = generateEmailHTML(reportData, photoGalleryHTML, inspectorNotesHTML, true);
    
    return {
      success: true,
      html: emailHTML
    };
  } catch (error) {
    Logger.log('Error generating email preview: ' + error);
    return {
      success: false,
      error: error.toString()
    };
  }
}

// Helper function to generate email HTML (extracted from sendInspectionEmail)
function generateEmailHTML(reportData, photoGalleryHTML, inspectorNotesHTML, isCustomer) {
  const logoUrl = 'https://cdn.prod.website-files.com/6931dc4e8e97334e195432df/6931dca5c5fb5c5fc0860f2c_test.png';
  const photoFiles = []; // Empty for preview
  const videoFiles = []; // Empty for preview
  
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: Arial, Helvetica, sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f3f4f6;">
          <tr>
            <td align="center" style="padding: 20px 0;">
              <table width="700" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; max-width: 700px;">
                <!-- Header -->
                <tr>
                  <td style="background-color: #0369a1; padding: 40px 30px; text-align: center;">
                    <img src="${logoUrl}" alt="A Quality Pool Company" width="200" style="display: block; margin: 0 auto 20px auto;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold; letter-spacing: 0.5px;">Your Pool Inspection is Complete!</h1>
                    <p style="margin: 10px 0 0 0; color: #ffffff; font-size: 16px; opacity: 0.95;">A Quality Pool Company</p>
                  </td>
                </tr>
                
                <!-- Main Content -->
                <tr>
                  <td style="padding: 40px 30px;">
                    <!-- Customer Info Card -->
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f0f9ff; border-left: 4px solid #0284c7; margin-bottom: 30px;">
                      <tr>
                        <td style="padding: 25px;">
                          <h2 style="margin: 0 0 15px 0; color: #0369a1; font-size: 22px; font-weight: bold;">Inspection Details</h2>
                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td width="120" style="padding: 8px 0; color: #6b7280; font-size: 14px;"><strong>Customer:</strong></td>
                              <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: bold;">${reportData.customerName || ''}</td>
                            </tr>
                            <tr>
                              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;"><strong>Property:</strong></td>
                              <td style="padding: 8px 0; color: #111827; font-size: 14px;">${reportData.propertyAddress || 'N/A'}</td>
                            </tr>
                            <tr>
                              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;"><strong>Inspector:</strong></td>
                              <td style="padding: 8px 0; color: #111827; font-size: 14px;">${reportData.inspectorName || ''}</td>
                            </tr>
                            <tr>
                              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;"><strong>Date:</strong></td>
                              <td style="padding: 8px 0; color: #111827; font-size: 14px;">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                    
                      <!-- Inspector Notes (Simple - no duplicate summary) -->
                      ${inspectorNotesHTML}
                    
                    <!-- Photo Gallery -->
                    ${photoGalleryHTML}
                    
                    <!-- Report Attachment Notice -->
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #fef3c7; border-left: 4px solid #f59e0b; margin: 30px 0;">
                      <tr>
                        <td style="padding: 20px;">
                          <p style="margin: 0 0 8px 0; color: #92400e; font-size: 16px; font-weight: bold;">📄 Complete Report Attached</p>
                          <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">The detailed PDF inspection report is attached to this email for your records.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 10px 0; color: #111827; font-size: 18px; font-weight: bold;">A Quality Pool Company</p>
                    <p style="margin: 0 0 15px 0; color: #6b7280; font-size: 14px; font-style: italic;">We do everything with pools</p>
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 15px 0; padding: 15px 0; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb;">
                      <tr>
                        <td style="padding: 5px 0;">
                          <p style="margin: 5px 0; color: #374151; font-size: 14px;">📞 <a href="tel:5027069172" style="color: #0284c7; text-decoration: none;">(502) 706-9172</a></p>
                          <p style="margin: 5px 0; color: #374151; font-size: 14px;">📧 <a href="mailto:samr@aqualitypoolcompanyusa.com" style="color: #0284c7; text-decoration: none;">samr@aqualitypoolcompanyusa.com</a></p>
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 15px 0 0 0;">
                      <a href="https://share.google/hAHnIZO81Wl82hZut" style="display: inline-block; background-color: #0369a1; color: #ffffff; padding: 12px 24px; text-decoration: none; font-weight: bold; font-size: 14px; border-radius: 6px;">Leave us a review ⭐</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

// ==================== EMAIL NOTIFICATIONS ====================

function sendInspectionEmail(reportData, pdfFile, photoFiles, videoFiles, isCustomer) {
  try {
    const recipient = isCustomer ? reportData.customerEmail : NOTIFICATION_EMAIL;
    const subject = isCustomer 
      ? `Your Pool Inspection Report from A Quality Pool Company`
      : `Full Inspection - ${reportData.customerName} - ${reportData.propertyAddress}`;
    
    const logoUrl = 'https://cdn.prod.website-files.com/6931dc4e8e97334e195432df/6931dca5c5fb5c5fc0860f2c_test.png';
    
    // Generate photo gallery HTML (Gmail-safe table layout)
    let photoGalleryHTML = '';
    if (reportData.photos && reportData.photos.length > 0) {
      photoGalleryHTML = '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 30px 0;">';
      photoGalleryHTML += '<tr><td style="padding: 0 0 20px 0;">';
      photoGalleryHTML += '<table width="100%" cellpadding="0" cellspacing="0" border="0">';
      photoGalleryHTML += '<tr><td style="border-bottom: 2px solid #0284c7; padding-bottom: 10px;">';
      photoGalleryHTML += '<h3 style="margin: 0; color: #0369a1; font-size: 20px; font-weight: bold;">📸 Inspection Photos</h3>';
      photoGalleryHTML += '</td></tr></table>';
      photoGalleryHTML += '</td></tr>';
      
      // Process photos in rows of 2
      for (let i = 0; i < reportData.photos.length; i += 2) {
        photoGalleryHTML += '<tr><td style="padding: 10px 0;">';
        photoGalleryHTML += '<table width="100%" cellpadding="0" cellspacing="0" border="0">';
        photoGalleryHTML += '<tr>';
        
        // First photo
        if (reportData.photos[i] && reportData.photos[i].data && reportData.photos[i].label) {
          const photo1 = reportData.photos[i];
          const imageData1 = photo1.data.includes('data:') ? photo1.data : `data:image/jpeg;base64,${photo1.data}`;
          photoGalleryHTML += '<td width="50%" style="padding: 0 5px 0 0; vertical-align: top;">';
          photoGalleryHTML += '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border: 1px solid #e5e7eb;">';
          photoGalleryHTML += '<tr><td style="padding: 0;">';
          photoGalleryHTML += `<img src="${imageData1}" alt="${photo1.label}" width="100%" style="max-width: 450px; height: auto; display: block;">`;
          photoGalleryHTML += '</td></tr>';
          photoGalleryHTML += '<tr><td style="padding: 12px; background: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">';
          photoGalleryHTML += `<p style="margin: 0; color: #374151; font-size: 13px; font-weight: bold;">${photo1.label}</p>`;
          photoGalleryHTML += '</td></tr></table></td>';
        }
        
        // Second photo
        if (i + 1 < reportData.photos.length && reportData.photos[i + 1] && reportData.photos[i + 1].data && reportData.photos[i + 1].label) {
          const photo2 = reportData.photos[i + 1];
          const imageData2 = photo2.data.includes('data:') ? photo2.data : `data:image/jpeg;base64,${photo2.data}`;
          photoGalleryHTML += '<td width="50%" style="padding: 0 0 0 5px; vertical-align: top;">';
          photoGalleryHTML += '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border: 1px solid #e5e7eb;">';
          photoGalleryHTML += '<tr><td style="padding: 0;">';
          photoGalleryHTML += `<img src="${imageData2}" alt="${photo2.label}" width="100%" style="max-width: 450px; height: auto; display: block;">`;
          photoGalleryHTML += '</td></tr>';
          photoGalleryHTML += '<tr><td style="padding: 12px; background: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">';
          photoGalleryHTML += `<p style="margin: 0; color: #374151; font-size: 13px; font-weight: bold;">${photo2.label}</p>`;
          photoGalleryHTML += '</td></tr></table></td>';
        } else if (i + 1 >= reportData.photos.length) {
          photoGalleryHTML += '<td width="50%" style="padding: 0 0 0 5px;"></td>';
        }
        
        photoGalleryHTML += '</tr></table></td></tr>';
      }
      
      photoGalleryHTML += '</table>';
    }
    
    // Generate SIMPLE inspector notes section (just inspector notes, no duplicate summary)
    let inspectorNotesHTML = '';
    if (reportData.recommendations && reportData.recommendations.additionalNotes) {
      const notes = reportData.recommendations.additionalNotes;
      inspectorNotesHTML = '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 30px 0;">';
      inspectorNotesHTML += '<tr><td style="background: #f0f9ff; border-left: 4px solid #0284c7; padding: 20px;">';
      inspectorNotesHTML += '<h3 style="margin: 0 0 15px 0; color: #0369a1; font-size: 18px; font-weight: bold;">📝 Inspector Notes</h3>';
      inspectorNotesHTML += `<p style="margin: 0; color: #374151; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${notes}</p>`;
      inspectorNotesHTML += '</td></tr></table>';
    }
    
    // Gmail-safe email HTML using tables
    let htmlBody = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: Arial, Helvetica, sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f3f4f6;">
            <tr>
              <td align="center" style="padding: 20px 0;">
                <table width="700" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; max-width: 700px;">
                  <!-- Header -->
                  <tr>
                    <td style="background-color: #0369a1; padding: 40px 30px; text-align: center;">
                      <img src="${logoUrl}" alt="A Quality Pool Company" width="200" style="display: block; margin: 0 auto 20px auto;">
                      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold; letter-spacing: 0.5px;">${isCustomer ? 'Your Pool Inspection is Complete!' : 'Full Inspection Report Generated'}</h1>
                      <p style="margin: 10px 0 0 0; color: #ffffff; font-size: 16px; opacity: 0.95;">A Quality Pool Company</p>
                    </td>
                  </tr>
                  
                  <!-- Main Content -->
                  <tr>
                    <td style="padding: 40px 30px;">
                      <!-- Customer Info Card -->
                      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f0f9ff; border-left: 4px solid #0284c7; margin-bottom: 30px;">
                        <tr>
                          <td style="padding: 25px;">
                            <h2 style="margin: 0 0 15px 0; color: #0369a1; font-size: 22px; font-weight: bold;">Inspection Details</h2>
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                              <tr>
                                <td width="120" style="padding: 8px 0; color: #6b7280; font-size: 14px;"><strong>Customer:</strong></td>
                                <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: bold;">${reportData.customerName}</td>
                              </tr>
                              <tr>
                                <td style="padding: 8px 0; color: #6b7280; font-size: 14px;"><strong>Property:</strong></td>
                                <td style="padding: 8px 0; color: #111827; font-size: 14px;">${reportData.propertyAddress || 'N/A'}</td>
                              </tr>
                              <tr>
                                <td style="padding: 8px 0; color: #6b7280; font-size: 14px;"><strong>Inspector:</strong></td>
                                <td style="padding: 8px 0; color: #111827; font-size: 14px;">${reportData.inspectorName}</td>
                              </tr>
                              <tr>
                                <td style="padding: 8px 0; color: #6b7280; font-size: 14px;"><strong>Date:</strong></td>
                                <td style="padding: 8px 0; color: #111827; font-size: 14px;">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                      
                      <!-- Summary Card -->
                      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #dbeafe; border-left: 4px solid #0284c7; margin-bottom: 30px;">
                        <tr>
                          <td style="padding: 25px;">
                            <h3 style="margin: 0 0 15px 0; color: #0369a1; font-size: 18px; font-weight: bold;">📊 Inspection Summary</h3>
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                              <tr>
                                <td width="50%" style="padding: 8px 0; vertical-align: top;">
                                  <p style="margin: 8px 0; color: #374151; font-size: 14px;"><strong style="color: #0369a1;">Pool Type:</strong><br>${reportData.poolType}</p>
                                </td>
                                <td width="50%" style="padding: 8px 0; vertical-align: top;">
                                  <p style="margin: 8px 0; color: #374151; font-size: 14px;"><strong style="color: #0369a1;">Condition:</strong><br>${reportData.overallCondition || 'See report'}</p>
                                </td>
                              </tr>
                            </table>
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #93c5fd;">
                              <tr>
                                <td style="padding: 5px 0;">
                                  <p style="margin: 5px 0; color: #374151; font-size: 14px;"><strong style="color: #0369a1;">📸 Photos:</strong> ${photoFiles.length} ${photoFiles.length === 1 ? 'photo' : 'photos'} included</p>
                                  ${videoFiles.length > 0 ? `<p style="margin: 5px 0; color: #374151; font-size: 14px;"><strong style="color: #0369a1;">🎥 Videos:</strong> ${videoFiles.length} ${videoFiles.length === 1 ? 'video' : 'videos'} attached</p>` : ''}
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                      
                      <!-- Inspector Notes -->
                      ${inspectorNotesHTML}
                      
                      <!-- Photo Gallery -->
                      ${photoGalleryHTML}
                      
                      <!-- Report Attachment Notice -->
                      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #fef3c7; border-left: 4px solid #f59e0b; margin: 30px 0;">
                        <tr>
                          <td style="padding: 20px;">
                            <p style="margin: 0 0 8px 0; color: #92400e; font-size: 16px; font-weight: bold;">📄 Complete Report Attached</p>
                            <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">The detailed PDF inspection report is attached to this email for your records.</p>
                          </td>
                        </tr>
                      </table>
                      
                      ${!isCustomer ? `
                      <!-- Drive Folder Notice (Internal Only) -->
                      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f0fdf4; border-left: 4px solid #10b981; margin: 30px 0;">
                        <tr>
                          <td style="padding: 20px;">
                            <p style="margin: 0 0 8px 0; color: #065f46; font-size: 16px; font-weight: bold;">📁 All Files Saved Securely</p>
                            <p style="margin: 0; color: #065f46; font-size: 14px; line-height: 1.6;">The complete inspection report, all photos, and videos have been saved to the secure customer folder in Google Drive.</p>
                          </td>
                        </tr>
                      </table>
                      ` : ''}
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                      <p style="margin: 0 0 10px 0; color: #111827; font-size: 18px; font-weight: bold;">A Quality Pool Company</p>
                      <p style="margin: 0 0 15px 0; color: #6b7280; font-size: 14px; font-style: italic;">We do everything with pools</p>
                      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 15px 0; padding: 15px 0; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb;">
                        <tr>
                          <td style="padding: 5px 0;">
                            <p style="margin: 5px 0; color: #374151; font-size: 14px;">📞 <a href="tel:5027069172" style="color: #0284c7; text-decoration: none;">(502) 706-9172</a></p>
                            <p style="margin: 5px 0; color: #374151; font-size: 14px;">📧 <a href="mailto:samr@aqualitypoolcompanyusa.com" style="color: #0284c7; text-decoration: none;">samr@aqualitypoolcompanyusa.com</a></p>
                          </td>
                        </tr>
                      </table>
                      <p style="margin: 15px 0 0 0;">
                        <a href="https://share.google/hAHnIZO81Wl82hZut" style="display: inline-block; background-color: #0369a1; color: #ffffff; padding: 12px 24px; text-decoration: none; font-weight: bold; font-size: 14px; border-radius: 6px;">Leave us a review ⭐</a>
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
    
    // Prepare attachments: Only PDF (photos are embedded in email body, not attached to avoid size limits)
    const attachments = [pdfFile.getBlob()];
    
    // Note: Photos are embedded in email body as base64 images, so we don't attach them separately
    // This prevents hitting Gmail's 25MB attachment size limit
    // Videos are too large for email, so we skip them
    
    let plainBody = `
Full Pool Inspection Report

Customer: ${reportData.customerName}
Property: ${reportData.propertyAddress}
Inspector: ${reportData.inspectorName}
Date: ${new Date().toLocaleDateString()}

Pool Type: ${reportData.poolType}
Overall Condition: ${reportData.overallCondition || 'See report'}
Photos: ${photoFiles.length} ${photoFiles.length === 1 ? 'photo' : 'photos'} included
${videoFiles.length > 0 ? `Videos: ${videoFiles.length} ${videoFiles.length === 1 ? 'video' : 'videos'} attached\n` : ''}
${reportData.recommendations && reportData.recommendations.additionalNotes ? `\nInspector Notes:\n${reportData.recommendations.additionalNotes}\n` : ''}
The complete PDF inspection report and photos are attached to this email.

---
A Quality Pool Company
(502) 706-9172
samr@aqualitypoolcompanyusa.com
    `;
    
    MailApp.sendEmail({
      to: recipient,
      subject: subject,
      body: plainBody,
      htmlBody: htmlBody,
      attachments: attachments,
      name: 'A Quality Pool Company'
    });
    
    Logger.log('Inspection email sent to ' + recipient);
    return { success: true };
    
  } catch (error) {
    Logger.log('Error sending inspection email: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ==================== AUTO-GENERATED SUMMARY ====================

// Generate automatic summary from checkboxes and comments
function generateAutoSummary(reportData) {
  const summary = [];
  const issues = [];
  const positives = [];
  const recommendations = [];
  
  // Overall Condition
  if (reportData.overallCondition) {
    summary.push(`Overall Condition: ${reportData.overallCondition}`);
  }
  
  // Primary Concerns
  if (reportData.findings && reportData.findings.primaryConcerns) {
    const concerns = reportData.findings.primaryConcerns.trim();
    if (concerns) {
      summary.push(`Primary Concerns: ${concerns}`);
    }
  }
  
  // Structural Issues
  if (reportData.structural) {
    const struct = reportData.structural;
    
    // Walls
    if (struct.walls) {
      const w = struct.walls;
      if (w.movement) issues.push('Wall movement detected');
      if (w.cracks) issues.push('Wall cracks present');
      if (w.hollow) issues.push('Hollow spots in walls');
      if (w.sound) positives.push('Walls structurally sound');
      if (w.notes) summary.push(`Walls: ${w.notes}`);
    }
    
    // Floor
    if (struct.floor) {
      const f = struct.floor;
      if (f.cracks) issues.push('Floor cracks present');
      if (f.wrinkles) issues.push('Floor wrinkles/waves');
      if (f.blistering) issues.push('Floor blistering');
      if (f.smooth) positives.push('Floor surface smooth');
      if (f.notes) summary.push(`Floor: ${f.notes}`);
    }
    
    // Surface
    if (struct.surface) {
      const s = struct.surface;
      if (s.staining) issues.push('Surface staining');
      if (s.algae) issues.push('Algae present');
      if (s.plasterWear) issues.push('Plaster wear/deterioration');
      if (s.gelcoatFading) issues.push('Gelcoat fading');
      if (s.tears) issues.push('Surface tears/damage');
      if (s.clean) positives.push('Surface clean');
      if (s.notes) summary.push(`Surface: ${s.notes}`);
    }
    
    // Coping
    if (struct.coping) {
      const c = struct.coping;
      if (c.loose) issues.push('Coping loose');
      if (c.cracks) issues.push('Coping cracks');
      if (c.settlement) issues.push('Coping settlement');
      if (c.tripHazards) issues.push('Coping trip hazards');
      if (c.secure) positives.push('Coping secure');
      if (c.notes) summary.push(`Coping: ${c.notes}`);
    }
    
    // Stairs
    if (struct.stairs) {
      const st = struct.stairs;
      if (st.loose) issues.push('Stairs loose');
      if (st.rust) issues.push('Stair rust/corrosion');
      if (st.secure) positives.push('Stairs secure');
      if (st.notes) summary.push(`Stairs: ${st.notes}`);
    }
  }
  
  // Plumbing Issues
  if (reportData.plumbing) {
    const p = reportData.plumbing;
    
    // Pressure Test
    if (p.pressureTest && p.pressureTest.performed) {
      if (p.pressureTest.drop) {
        issues.push(`Pressure test: ${p.pressureTest.drop}`);
      }
      if (p.pressureTest.notes) summary.push(`Pressure Test: ${p.pressureTest.notes}`);
    }
    
    // Leak Detection
    if (p.leakDetection && p.leakDetection.performed) {
      if (p.leakDetection.strongSignature) issues.push('Strong leak signature detected');
      if (p.leakDetection.moderateSignature) issues.push('Moderate leak signature');
      if (p.leakDetection.noLeak) positives.push('No leaks detected');
      if (p.leakDetection.notes) summary.push(`Leak Detection: ${p.leakDetection.notes}`);
    }
    
    // Visual Leak Evaluation
    if (p.visual && p.visual.performed) {
      if (p.visual.skimmerCracks) issues.push('Skimmer throat cracks');
      if (p.visual.returnJetLeaks) issues.push('Return jet leaks');
      if (p.visual.lightNicheLeaks) issues.push('Light niche leaks');
      if (p.visual.tileLineCracks) issues.push('Tile line cracks');
      if (p.visual.structuralCracks) issues.push('Structural cracks');
      if (p.visual.fittingsLoose) issues.push('Fittings loose/deteriorating');
      if (p.visual.equipmentPadLeaks) issues.push('Equipment pad leaks');
      if (p.visual.notes) summary.push(`Visual Leak Evaluation: ${p.visual.notes}`);
    }
  }
  
  // Equipment Issues
  if (reportData.equipment) {
    const eq = reportData.equipment;
    
    // Pump
    if (eq.pump) {
      if (eq.pump.bearingNoise) issues.push('Pump bearing noise');
      if (eq.pump.leakingSeal) issues.push('Pump seal leaking');
      if (eq.pump.lowFlow) issues.push('Pump low flow');
      if (eq.pump.motorOverheating) issues.push('Pump motor overheating');
      if (eq.pump.operating) positives.push('Pump operating normally');
      if (eq.pump.notes) summary.push(`Pump: ${eq.pump.notes}`);
    }
    
    // Filter
    if (eq.filter) {
      if (eq.filter.pressureHigh) issues.push('Filter pressure high');
      if (eq.filter.tankCracked) issues.push('Filter tank cracked');
      if (eq.filter.valveLeaking) issues.push('Filter valve leaking');
      if (eq.filter.pressureNormal) positives.push('Filter pressure normal');
      if (eq.filter.notes) summary.push(`Filter: ${eq.filter.notes}`);
    }
    
    // Heater
    if (eq.heater) {
      if (eq.heater.waterBypassing) issues.push('Heater water bypassing');
      if (eq.heater.errorCodes) issues.push('Heater error codes');
      if (eq.heater.corrosion) issues.push('Heater corrosion');
      if (eq.heater.gasIssues) issues.push('Heater gas issues');
      if (eq.heater.ignites) positives.push('Heater ignites properly');
      if (eq.heater.notes) summary.push(`Heater: ${eq.heater.notes}`);
    }
    
    // Salt System
    if (eq.salt) {
      if (eq.salt.lowSalt) issues.push('Salt system low salt');
      if (eq.salt.cellCleaning) issues.push('Salt cell needs cleaning');
      if (eq.salt.flowSwitch) issues.push('Salt flow switch issues');
      if (eq.salt.properReadings) positives.push('Salt system readings normal');
      if (eq.salt.notes) summary.push(`Salt System: ${eq.salt.notes}`);
    }
    
    // Automation
    if (eq.automation) {
      if (eq.automation.inactive) issues.push('Automation system inactive');
      if (eq.automation.exposedWires) issues.push('Exposed wires in automation');
      if (eq.automation.gfciIssues) issues.push('GFCI issues');
      if (eq.automation.timersMalfunction) issues.push('Timer malfunction');
      if (eq.automation.operational) positives.push('Automation operational');
      if (eq.automation.notes) summary.push(`Automation: ${eq.automation.notes}`);
    }
  }
  
  // Safety Issues
  if (reportData.safety) {
    const s = reportData.safety;
    if (!s.vgbCompliant) issues.push('VGB compliance concerns');
    if (!s.drainCovers) issues.push('Drain cover issues');
    if (!s.fencingCode) issues.push('Fencing code compliance');
    if (!s.gateSelfClosing) issues.push('Gate not self-closing');
    if (!s.electricalBonding) issues.push('Electrical bonding concerns');
    if (s.notes) summary.push(`Safety: ${s.notes}`);
  }
  
  // Recommendations
  if (reportData.recommendations) {
    const rec = reportData.recommendations;
    if (rec.services) {
      const svc = rec.services;
      if (svc.poolCleaning) recommendations.push('Pool cleaning recommended');
      if (svc.deepClean) recommendations.push('Deep clean recommended');
      if (svc.linerReplacement) recommendations.push('Liner replacement recommended');
      if (svc.replastering) recommendations.push('Replastering recommended');
      if (svc.pumpReplacement) recommendations.push('Pump replacement recommended');
      if (svc.heaterReplacement) recommendations.push('Heater replacement recommended');
      if (svc.filterChange) recommendations.push('Filter change recommended');
      if (svc.leakDetectionRepair) recommendations.push('Leak detection/repair needed');
      // Add more services as needed
    }
    if (rec.additionalServices) {
      recommendations.push(rec.additionalServices);
    }
  }
  
  // Build final summary text
  let summaryText = '';
  
  if (summary.length > 0) {
    summaryText += summary.join('\n\n');
  }
  
  if (issues.length > 0) {
    summaryText += (summaryText ? '\n\n' : '') + 'ISSUES IDENTIFIED:\n• ' + issues.join('\n• ');
  }
  
  if (positives.length > 0) {
    summaryText += (summaryText ? '\n\n' : '') + 'POSITIVE FINDINGS:\n• ' + positives.join('\n• ');
  }
  
  if (recommendations.length > 0) {
    summaryText += (summaryText ? '\n\n' : '') + 'RECOMMENDATIONS:\n• ' + recommendations.join('\n• ');
  }
  
  // Add inspector notes if available
  if (reportData.recommendations && reportData.recommendations.additionalNotes) {
    summaryText += (summaryText ? '\n\n' : '') + 'INSPECTOR NOTES:\n' + reportData.recommendations.additionalNotes;
  }
  
  return summaryText || 'No specific issues or recommendations noted.';
}

// ==================== TEXT MESSAGE TEMPLATE (VERIZON EMAIL) ====================

// Generate text message template for team to send to customer
function generateTextMessageTemplate(reportData) {
  const customerName = reportData.customerName || 'Customer';
  const customerPhone = reportData.customerPhone || '';
  const propertyAddress = reportData.propertyAddress || '';
  const inspectorName = reportData.inspectorName || 'Our team';
  const poolType = reportData.poolType || 'pool';
  const overallCondition = reportData.overallCondition || '';
  
  // Build condition message
  let conditionMessage = '';
  if (overallCondition) {
    conditionMessage = ` Condition: ${overallCondition}.`;
  }
  
  // Build SHORT professional message
  let message = `Hi ${customerName}, your ${poolType} inspection is complete. Report sent to your email.${conditionMessage} Questions? Call us. Thank you! - A Quality Pool Company`;
  
  // If there are recommendations/notes, add brief note
  if (reportData.recommendations && reportData.recommendations.additionalNotes) {
    message = `Hi ${customerName}, your ${poolType} inspection is complete. Report sent to your email with recommendations.${conditionMessage} Questions? Call us. Thank you! - A Quality Pool Company`;
  }
  
  return {
    message: message,
    customerName: customerName,
    customerPhone: customerPhone,
    propertyAddress: propertyAddress
  };
}

// Send text message template and PDF to Verizon email (temporary solution until Twilio is set up)
function sendTextMessageToVerizon(reportData, pdfFile) {
  try {
    Logger.log('Sending text message template to Verizon...');
    
    // Generate text message template
    const textMessage = generateTextMessageTemplate(reportData);
    
    // Build email subject
    const subject = `Text Message for ${reportData.customerName} - ${reportData.propertyAddress || 'Inspection'}`;
    
    // Format phone number for SMS link (remove non-digits, ensure country code)
    let phoneNumber = '';
    let smsLink = '';
    if (textMessage.customerPhone) {
      // Remove all non-digits
      phoneNumber = textMessage.customerPhone.replace(/\D/g, '');
      // Add country code if missing (assume US if 10 digits)
      if (phoneNumber.length === 10) {
        phoneNumber = '1' + phoneNumber;
      }
      // URL encode the message (truncate if too long to avoid link issues)
      let messageForLink = textMessage.message;
      // Keep message short for SMS link (max ~100 chars to avoid URL length issues)
      if (messageForLink.length > 100) {
        messageForLink = messageForLink.substring(0, 97) + '...';
      }
      const encodedMessage = encodeURIComponent(messageForLink);
      // Create SMS link
      smsLink = `sms:+${phoneNumber}?body=${encodedMessage}`;
    }
    
    // Build email body (plain text)
    const emailBody = `
TEXT MESSAGE TO SEND TO CUSTOMER:

${textMessage.message}

---
Customer: ${textMessage.customerName}
Phone: ${textMessage.customerPhone || 'Not provided'}
Address: ${textMessage.propertyAddress || 'Not provided'}
Inspection Date: ${reportData.inspectionDate || new Date().toLocaleDateString()}
---

${smsLink ? '📱 Click here to open messaging app: ' + smsLink : 'Phone number not available for SMS link'}

The PDF report is attached. You can include it when sending the text message.

This is a temporary solution until Twilio is set up.
    `.trim();
    
    // Helper function to escape HTML
    function escapeHtml(text) {
      if (!text) return '';
      const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      };
      return text.toString().replace(/[&<>"']/g, m => map[m]);
    }
    
    // Build HTML email body with clickable link
    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #0369a1; border-bottom: 2px solid #0284c7; padding-bottom: 10px;">📱 Text Message to Send</h2>
    
    <div style="background: #f0f9ff; border-left: 4px solid #0284c7; padding: 20px; margin: 20px 0; border-radius: 4px;">
      <p style="white-space: pre-wrap; font-size: 16px; line-height: 1.8;">${escapeHtml(textMessage.message).replace(/\n/g, '<br>')}</p>
    </div>
    
    <div style="background: #f9fafb; padding: 15px; border-radius: 4px; margin: 20px 0;">
      <p style="margin: 5px 0;"><strong>Customer:</strong> ${escapeHtml(textMessage.customerName)}</p>
      <p style="margin: 5px 0;"><strong>Phone:</strong> ${escapeHtml(textMessage.customerPhone || 'Not provided')}</p>
      <p style="margin: 5px 0;"><strong>Address:</strong> ${escapeHtml(textMessage.propertyAddress || 'Not provided')}</p>
      <p style="margin: 5px 0;"><strong>Inspection Date:</strong> ${escapeHtml(reportData.inspectionDate || new Date().toLocaleDateString())}</p>
    </div>
    
    ${smsLink ? `
    <div style="text-align: center; margin: 30px 0;">
      <a href="${smsLink}" style="display: inline-block; background: #0284c7; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-size: 18px; font-weight: bold; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        📱 Open Messaging App to Send
      </a>
      <p style="margin-top: 10px; color: #6b7280; font-size: 14px;">Click the button above to open your messaging app with the customer's number and message pre-filled.</p>
    </div>
    ` : `
    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 4px; margin: 20px 0;">
      <p style="margin: 0; color: #92400e;">⚠️ Phone number not available. Please send manually.</p>
    </div>
    `}
    
    <div style="background: #dbeafe; padding: 15px; border-radius: 4px; margin: 20px 0;">
      <p style="margin: 0; color: #1e40af; font-size: 14px;"><strong>📎 PDF Report:</strong> The inspection report PDF is attached to this email. You can attach it when sending the text message.</p>
    </div>
    
    <p style="color: #6b7280; font-size: 12px; margin-top: 30px; text-align: center;">This is a temporary solution until Twilio is set up.</p>
  </div>
</body>
</html>
    `.trim();
    
    // Prepare attachments
    const attachments = [];
    if (pdfFile) {
      attachments.push(pdfFile.getAs(MimeType.PDF));
    }
    
    // Send email to Verizon (MMS with attachment)
    try {
      MailApp.sendEmail({
        to: VERIZON_EMAIL,
        subject: subject,
        body: emailBody,
        htmlBody: htmlBody,
        attachments: attachments,
        name: 'A Quality Pool Company - Inspection System'
      });
      
      Logger.log('Text message template sent to Verizon MMS: ' + VERIZON_EMAIL);
    } catch (mmsError) {
      Logger.log('MMS failed, trying SMS: ' + mmsError);
      
      // Fallback to SMS (no attachment)
      try {
        MailApp.sendEmail({
          to: VERIZON_EMAIL_SMS,
          subject: subject,
          body: emailBody + '\n\nNote: PDF attachment not available via SMS. Check your email for the PDF.',
          htmlBody: htmlBody.replace('📎 PDF Report:', '📎 PDF Report: (Check your email for the PDF attachment)'),
          name: 'A Quality Pool Company - Inspection System'
        });
        
        Logger.log('Text message template sent to Verizon SMS: ' + VERIZON_EMAIL_SMS);
      } catch (smsError) {
        Logger.log('Error sending to Verizon: ' + smsError);
        // Also send to team email as backup
        MailApp.sendEmail({
          to: NOTIFICATION_EMAIL,
          subject: 'Text Message Template - ' + subject,
          body: emailBody + '\n\nNote: Failed to send to Verizon. PDF attached.',
          htmlBody: htmlBody + '<p style="color: #dc2626; font-weight: bold;">Note: Failed to send to Verizon. PDF attached.</p>',
          attachments: attachments,
          name: 'A Quality Pool Company - Inspection System'
        });
      }
    }
    
    return { success: true };
  } catch (error) {
    Logger.log('Error sending text message to Verizon: ' + error);
    Logger.log('Error stack: ' + error.stack);
    return { success: false, error: error.toString() };
  }
}

// Send test text message to company phone (for testing)
function sendTestTextToCompany(testMessage) {
  try {
    Logger.log('Sending test text message to company phone...');
    
    const message = testMessage || 'Test message from inspection tool - ' + new Date().toLocaleString();
    
    // Build email subject
    const subject = 'Test Text Message - Inspection Tool';
    
    // Build email body
    const emailBody = `
TEST TEXT MESSAGE:

${message}

---
Sent from: Inspection Report Tool
Time: ${new Date().toLocaleString()}
---
    `.trim();
    
    // Send to company phone via SMS email
    try {
      MailApp.sendEmail({
        to: COMPANY_EMAIL_SMS,
        subject: subject,
        body: emailBody
      });
      Logger.log('Test text message sent successfully to company phone');
      return { success: true, message: 'Test text sent to company phone (502) 706-9172' };
    } catch (error) {
      Logger.log('Error sending test text: ' + error);
      return { success: false, error: error.message };
    }
  } catch (error) {
    Logger.log('Error in sendTestTextToCompany: ' + error);
    return { success: false, error: error.message };
  }
}

// ==================== PDF GENERATION ====================

// Generate Google Maps Static API URL for property address (uses same method as customer portal)
function generatePropertyMapUrl(address) {
  if (!address || address === 'N/A') return '';
  
  try {
    const result = getSatelliteImage(address);
    if (result.success && result.satelliteImageUrl) {
      return result.satelliteImageUrl;
    }
  } catch (error) {
    Logger.log('Error generating map URL: ' + error);
  }
  
  return '';
}

// Get logo as base64
function getLogoBase64() {
  try {
    const logoUrl = 'https://cdn.prod.website-files.com/6931dc4e8e97334e195432df/6931dca5c5fb5c5fc0860f2c_test.png';
    const response = UrlFetchApp.fetch(logoUrl);
    const blob = response.getBlob();
    const base64 = Utilities.base64Encode(blob.getBytes());
    return 'data:image/png;base64,' + base64;
  } catch (error) {
    Logger.log('Error fetching logo: ' + error);
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  }
}

// Generate professional inspection HTML for PDF
function generateInspectionHTML(data) {
  const date = new Date().toLocaleDateString();
  const time = new Date().toLocaleTimeString();
  const reportNum = Date.now().toString().slice(-6);
  
  const logoDataUrl = getLogoBase64();
  
  let html = `
    <html>
      <head>
        <style>
          @page { margin: 0.5in; }
          body { 
            font-family: 'Helvetica', 'Arial', sans-serif; 
            color: #000;
            line-height: 1.5;
            margin: 0;
            padding: 30px;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 3px solid #0284c7;
          }
          .logo {
            width: 140px;
            margin-bottom: 15px;
          }
          .title {
            color: #0369a1;
            font-size: 28px;
            font-weight: bold;
            letter-spacing: 2px;
            margin: 15px 0;
          }
          .subtitle {
            color: #666;
            font-size: 14px;
          }
          .section {
            margin: 25px 0;
            page-break-inside: avoid;
          }
          .section-title {
            font-size: 18px;
            font-weight: bold;
            color: #0369a1;
            border-bottom: 2px solid #0284c7;
            padding-bottom: 8px;
            margin-bottom: 15px;
          }
          .subsection-title {
            font-size: 16px;
            font-weight: bold;
            color: #333;
            margin: 15px 0 10px 0;
          }
          .info-table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0;
          }
          .info-table td {
            padding: 8px;
            border-bottom: 1px solid #ddd;
          }
          .info-table td:first-child {
            font-weight: bold;
            width: 30%;
            color: #555;
          }
          .checkbox-list {
            margin: 10px 0;
            padding-left: 20px;
          }
          .checkbox-item {
            margin: 8px 0;
            font-size: 14px;
          }
          .checked {
            color: #059669;
            font-weight: bold;
          }
          .warning {
            color: #dc2626;
            font-weight: bold;
          }
          .notes-box {
            background: #f9fafb;
            border-left: 4px solid #0284c7;
            padding: 15px;
            margin: 15px 0;
            font-size: 14px;
          }
          .warning-box {
            background: #fee2e2;
            border-left: 4px solid #dc2626;
            padding: 15px;
            margin: 15px 0;
          }
          .good-box {
            background: #d1fae5;
            border-left: 4px solid #059669;
            padding: 15px;
            margin: 15px 0;
          }
          .photo {
            max-width: 100%;
            height: auto;
            margin: 15px 0;
            border: 1px solid #ddd;
            border-radius: 4px;
          }
          .photo-caption {
            font-size: 12px;
            color: #666;
            font-style: italic;
            margin-top: 5px;
          }
          .footer {
            margin-top: 50px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            text-align: center;
            font-size: 12px;
            color: #666;
          }
        </style>
      </head>
      <body>
        <!-- Header -->
        <div class="header">
          <img src="${logoDataUrl}" alt="Logo" class="logo">
          <div class="title">FULL POOL INSPECTION REPORT</div>
          <div class="subtitle">A Quality Pool Company</div>
          <div class="subtitle">Report #${reportNum} | ${date}</div>
        </div>

        <!-- Client Information -->
        <div class="section">
          <div class="section-title">1. Client Information</div>
          <table class="info-table">
            <tr><td>Client Name</td><td>${data.customerName}</td></tr>
            <tr><td>Phone</td><td>${data.customerPhone || 'N/A'}</td></tr>
            <tr><td>Email</td><td>${data.customerEmail || 'N/A'}</td></tr>
            <tr><td>Property Address</td><td>${data.propertyAddress || 'N/A'}</td></tr>
            <tr><td>Inspection Date</td><td>${date}</td></tr>
            <tr><td>Inspector</td><td>${data.inspectorName}</td></tr>
          </table>
          ${(() => {
            const mapUrl = generatePropertyMapUrl(data.propertyAddress);
            return mapUrl ? `
          <div style="margin-top: 20px; text-align: center;">
            <p style="font-weight: bold; color: #0369a1; margin-bottom: 10px;">📍 Property Location</p>
            <img src="${mapUrl}" alt="Property Map" style="max-width: 100%; height: auto; border: 2px solid #0284c7; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">
          </div>
          ` : '';
          })()}
        </div>

        <!-- Pool Overview -->
        <div class="section">
          <div class="section-title">2. Pool Overview</div>
          <table class="info-table">
            <tr><td>Pool Type</td><td>${data.poolType}</td></tr>
            <tr><td>Dimensions</td><td>${data.dimensions || 'Not provided'}</td></tr>
            <tr><td>Approx. Age</td><td>${data.poolAge || 'Unknown'}</td></tr>
            <tr><td>Water Level on Arrival</td><td>${data.waterLevel || 'N/A'}</td></tr>
            <tr><td>Pool Status</td><td>${data.poolStatus || 'N/A'}</td></tr>
          </table>
        </div>

        ${generateStructuralSection(data)}
        ${generatePlumbingSection(data)}
        ${generateEquipmentSection(data)}
        ${generateSpaSection(data)}
        ${generateSafetySection(data)}
        ${generateFindingsSection(data)}
        ${generateRecommendationsSection(data)}
        ${generatePhotosSection(data)}
        ${generateSignatureSection(data)}

        <!-- Footer -->
        <div class="footer">
          <p><strong>A Quality Pool Company</strong></p>
          <p>We do everything with pools</p>
          <p>Phone: (502) 706-9172 | Email: samr@aqualitypoolcompanyusa.com</p>
          <p><a href="https://share.google/hAHnIZO81Wl82hZut">Leave us a review →</a></p>
          <p style="margin-top: 15px; font-size: 10px; color: #999;">
            Report generated on ${date} at ${time}
          </p>
        </div>
      </body>
    </html>
  `;
  
  return html;
}

// Generate HTML for PDF (with embedded images as base64)
function generateInspectionHTMLForPDF(data) {
  const date = new Date().toLocaleDateString();
  const time = new Date().toLocaleTimeString();
  const reportNum = Date.now().toString().slice(-6);
  
  // Get logo as base64
  const logoDataUrl = getLogoBase64();
  
  let html = `
    <html>
      <head>
        <style>
          @page { margin: 0.5in; }
          body { 
            font-family: 'Helvetica', 'Arial', sans-serif; 
            color: #000;
            line-height: 1.5;
            margin: 0;
            padding: 30px;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 3px solid #0284c7;
          }
          .logo {
            width: 140px;
            margin-bottom: 15px;
          }
          .title {
            color: #0369a1;
            font-size: 28px;
            font-weight: bold;
            letter-spacing: 2px;
            margin: 15px 0;
          }
          .subtitle {
            color: #666;
            font-size: 14px;
          }
          .section {
            margin: 25px 0;
            page-break-inside: avoid;
          }
          .section-title {
            font-size: 18px;
            font-weight: bold;
            color: #0369a1;
            border-bottom: 2px solid #0284c7;
            padding-bottom: 8px;
            margin-bottom: 15px;
          }
          .subsection-title {
            font-size: 16px;
            font-weight: bold;
            color: #333;
            margin: 15px 0 10px 0;
          }
          .info-table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0;
          }
          .info-table td {
            padding: 8px;
            border-bottom: 1px solid #ddd;
          }
          .info-table td:first-child {
            font-weight: bold;
            width: 30%;
            color: #555;
          }
          .checkbox-list {
            margin: 10px 0;
            padding-left: 20px;
          }
          .checkbox-item {
            margin: 8px 0;
            font-size: 14px;
          }
          .checked {
            color: #059669;
            font-weight: bold;
          }
          .warning {
            color: #dc2626;
            font-weight: bold;
          }
          .notes-box {
            background: #f9fafb;
            border-left: 4px solid #0284c7;
            padding: 15px;
            margin: 15px 0;
            font-size: 14px;
          }
          .warning-box {
            background: #fee2e2;
            border-left: 4px solid #dc2626;
            padding: 15px;
            margin: 15px 0;
          }
          .good-box {
            background: #d1fae5;
            border-left: 4px solid #059669;
            padding: 15px;
            margin: 15px 0;
          }
          .photo-list {
            margin: 15px 0;
            padding-left: 20px;
          }
          .photo-item {
            margin: 8px 0;
            font-size: 14px;
            color: #666;
          }
          .footer {
            margin-top: 50px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            text-align: center;
            font-size: 12px;
            color: #666;
          }
        </style>
      </head>
      <body>
        <!-- Header -->
        <div class="header">
          <img src="${logoDataUrl}" alt="Logo" class="logo">
          <div class="title">FULL POOL INSPECTION REPORT</div>
          <div class="subtitle">A Quality Pool Company</div>
          <div class="subtitle">Report #${reportNum} | ${date}</div>
        </div>

        <!-- Client Information -->
        <div class="section">
          <div class="section-title">1. Client Information</div>
          <table class="info-table">
            <tr><td>Client Name</td><td>${data.customerName}</td></tr>
            <tr><td>Phone</td><td>${data.customerPhone || 'N/A'}</td></tr>
            <tr><td>Email</td><td>${data.customerEmail || 'N/A'}</td></tr>
            <tr><td>Property Address</td><td>${data.propertyAddress || 'N/A'}</td></tr>
            <tr><td>Inspection Date</td><td>${date}</td></tr>
            <tr><td>Inspector</td><td>${data.inspectorName}</td></tr>
          </table>
          ${(() => {
            const mapUrl = generatePropertyMapUrl(data.propertyAddress);
            return mapUrl ? `
          <div style="margin-top: 20px; text-align: center;">
            <p style="font-weight: bold; color: #0369a1; margin-bottom: 10px;">📍 Property Location</p>
            <img src="${mapUrl}" alt="Property Map" style="max-width: 100%; height: auto; border: 2px solid #0284c7; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">
          </div>
          ` : '';
          })()}
        </div>

        <!-- Pool Overview -->
        <div class="section">
          <div class="section-title">2. Pool Overview</div>
          <table class="info-table">
            <tr><td>Pool Type</td><td>${data.poolType}</td></tr>
            <tr><td>Dimensions</td><td>${data.dimensions || 'Not provided'}</td></tr>
            <tr><td>Approx. Age</td><td>${data.poolAge || 'Unknown'}</td></tr>
            <tr><td>Water Level on Arrival</td><td>${data.waterLevel || 'N/A'}</td></tr>
            <tr><td>Pool Status</td><td>${data.poolStatus || 'N/A'}</td></tr>
          </table>
        </div>

        ${generateStructuralSection(data)}
        ${generatePlumbingSection(data)}
        ${generateEquipmentSection(data)}
        ${generateSpaSection(data)}
        ${generateSafetySection(data)}
        ${generateFindingsSection(data)}
        ${generateRecommendationsSection(data)}
        ${generatePhotosSectionForPDF(data)}
        ${generateSignatureSectionForPDF(data)}

        <!-- Footer -->
        <div class="footer">
          <p><strong>A Quality Pool Company</strong></p>
          <p>We do everything with pools</p>
          <p>Phone: (502) 706-9172 | Email: samr@aqualitypoolcompanyusa.com</p>
          <p><a href="https://share.google/hAHnIZO81Wl82hZut">Leave us a review →</a></p>
          <p style="margin-top: 15px; font-size: 10px; color: #999;">
            Report generated on ${date} at ${time}
          </p>
          <p style="margin-top: 10px; font-size: 11px; color: #666;">
            Note: Photos and videos are saved separately in the customer folder.
          </p>
        </div>
      </body>
    </html>
  `;
  
  return html;
}

// Generate photos section for PDF (text only, no embedded images)
function generatePhotosSectionForPDF(data) {
  if (!data.photos || data.photos.length === 0) return '';
  
  let html = '<div class="section"><div class="section-title">10. Photo Documentation</div>';
  
  data.photos.forEach((photo, index) => {
    if (photo.data && photo.label) {
      // Use base64 image data
      const imageData = photo.data.includes('data:') ? photo.data : 'data:image/jpeg;base64,' + photo.data;
      html += '<div style="margin: 20px 0; page-break-inside: avoid;">';
      html += `<p style="font-weight: bold; margin-bottom: 10px; color: #0369a1;">${photo.label}</p>`;
      html += `<img src="${imageData}" alt="${photo.label}" class="photo" style="max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 4px;">`;
      html += '</div>';
    }
  });
  
  if (data.videos && data.videos.length > 0) {
    html += `<p style="margin-top: 20px; font-style: italic; color: #666;">`;
    html += `${data.videos.length} video(s) have been uploaded to the customer folder in Google Drive.`;
    html += `</p>`;
  }
  
  html += '</div>';
  return html;
}

// Generate signature section for PDF (without embedded signature image)
function generateSignatureSectionForPDF(data) {
  if (!data.inspectorName) return '';
  
  let html = '<div class="section"><div class="section-title">11. Inspector Certification</div>';
  
  html += '<p style="margin-bottom: 20px;">I certify that this inspection was performed to the best of my professional ability and that the findings reported herein represent the conditions observed at the time of inspection.</p>';
  
  html += '<table style="width: 100%; border-collapse: collapse; margin-top: 20px;">';
  html += '<tr>';
  html += '<td style="width: 50%; padding: 20px; vertical-align: top;">';
  html += '<div style="border-bottom: 2px solid #000; margin-bottom: 10px; padding-bottom: 30px; min-height: 50px;">';
  if (data.inspectorSignature) {
    // Use base64 signature image
    const signatureData = data.inspectorSignature.includes('data:') ? data.inspectorSignature : 'data:image/png;base64,' + data.inspectorSignature;
    html += `<img src="${signatureData}" alt="Inspector Signature" style="max-width: 200px; height: auto;">`;
  }
  html += '</div>';
  html += `<p style="margin: 0;"><strong>Inspector:</strong> ${data.inspectorName}</p>`;
  html += '</td>';
  html += '<td style="width: 50%; padding: 20px; vertical-align: top;">';
  html += '<div style="border-bottom: 2px solid #000; margin-bottom: 10px; padding-bottom: 30px;">';
  html += '</div>';
  html += `<p style="margin: 0;"><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>`;
  html += '</td>';
  html += '</tr>';
  html += '</table>';
  
  html += '<div style="background: #f9fafb; padding: 15px; border-left: 4px solid #0284c7; margin-top: 20px;">';
  html += '<p style="margin: 0; font-size: 12px; color: #666;">';
  html += '<strong>Note:</strong> This inspection report is valid for 30 days from the date of inspection. Pool conditions may change over time due to weather, usage, and maintenance.';
  html += '</p>';
  html += '</div>';
  
  html += '</div>';
  return html;
}

// Generate structural section
function generateStructuralSection(data) {
  if (!data.structural) return '';
  
  const s = data.structural;
  let html = '<div class="section"><div class="section-title">3. Structural Condition</div>';
  
  // Walls/Shell
  if (s.walls) {
    html += '<div class="subsection-title">Walls / Shell</div><div class="checkbox-list">';
    if (s.walls.sound) html += '<div class="checkbox-item checked">✓ Structurally sound</div>';
    if (s.walls.movement) html += '<div class="checkbox-item warning">⚠ Detected movement or bulging</div>';
    if (s.walls.cracks) html += '<div class="checkbox-item warning">⚠ Cracks / separation</div>';
    if (s.walls.hollow) html += '<div class="checkbox-item warning">⚠ Hollow/sounding areas</div>';
    if (s.walls.notes) html += `<div class="notes-box">Notes: ${s.walls.notes}</div>`;
    html += '</div>';
  }
  
  // Floor/Bottom
  if (s.floor) {
    html += '<div class="subsection-title">Pool Floor / Bottom</div><div class="checkbox-list">';
    if (s.floor.smooth) html += '<div class="checkbox-item checked">✓ Smooth / level</div>';
    if (s.floor.cracks) html += '<div class="checkbox-item warning">⚠ Cracks, scaling, spalling</div>';
    if (s.floor.wrinkles) html += '<div class="checkbox-item warning">⚠ Wrinkles / divots (vinyl)</div>';
    if (s.floor.blistering) html += '<div class="checkbox-item warning">⚠ Osmotic blistering (fiberglass)</div>';
    if (s.floor.notes) html += `<div class="notes-box">Notes: ${s.floor.notes}</div>`;
    html += '</div>';
  }
  
  // Surface Condition
  if (s.surface) {
    html += '<div class="subsection-title">Surface Condition</div><div class="checkbox-list">';
    if (s.surface.clean) html += '<div class="checkbox-item checked">✓ Surface clean</div>';
    if (s.surface.staining) html += '<div class="checkbox-item warning">⚠ Staining</div>';
    if (s.surface.algae) html += '<div class="checkbox-item warning">⚠ Algae or deterioration</div>';
    if (s.surface.plasterWear) html += '<div class="checkbox-item warning">⚠ Plaster wear</div>';
    if (s.surface.gelcoatFading) html += '<div class="checkbox-item warning">⚠ Gelcoat fading (fiberglass)</div>';
    if (s.surface.tears) html += '<div class="checkbox-item warning">⚠ Tears / pinholes (vinyl)</div>';
    if (s.surface.notes) html += `<div class="notes-box">Notes: ${s.surface.notes}</div>`;
    html += '</div>';
  }
  
  // Coping & Decking
  if (s.coping) {
    html += '<div class="subsection-title">Coping & Decking</div><div class="checkbox-list">';
    if (s.coping.secure) html += '<div class="checkbox-item checked">✓ Secure</div>';
    if (s.coping.loose) html += '<div class="checkbox-item warning">⚠ Loose stones/bricks</div>';
    if (s.coping.cracks) html += '<div class="checkbox-item warning">⚠ Cracks</div>';
    if (s.coping.settlement) html += '<div class="checkbox-item warning">⚠ Settlement</div>';
    if (s.coping.tripHazards) html += '<div class="checkbox-item warning">⚠ Trip hazards</div>';
    if (s.coping.notes) html += `<div class="notes-box">Notes: ${s.coping.notes}</div>`;
    html += '</div>';
  }
  
  // Stairs & Handrails
  if (s.stairs) {
    html += '<div class="subsection-title">Stairs & Handrails</div><div class="checkbox-list">';
    if (s.stairs.secure) html += '<div class="checkbox-item checked">✓ Secure</div>';
    if (s.stairs.loose) html += '<div class="checkbox-item warning">⚠ Loose</div>';
    if (s.stairs.rust) html += '<div class="checkbox-item warning">⚠ Rust / corrosion</div>';
    if (s.stairs.notes) html += `<div class="notes-box">Notes: ${s.stairs.notes}</div>`;
    html += '</div>';
  }
  
  html += '</div>';
  return html;
}

// Generate plumbing section
function generatePlumbingSection(data) {
  if (!data.plumbing) return '';
  
  const p = data.plumbing;
  let html = '<div class="section"><div class="section-title">4. Plumbing & Leak Detection</div>';
  
  // Pressure Testing (only show if performed)
  if (p.pressureTest && p.pressureTest.performed && (p.pressureTest.psi || p.pressureTest.duration || p.pressureTest.drop || p.pressureTest.linesTest || p.pressureTest.notes)) {
    html += '<div class="subsection-title">Pressure Testing</div>';
    html += `<div class="notes-box">`;
    if (p.pressureTest.psi) html += `Testing PSI: ${p.pressureTest.psi} psi<br>`;
    if (p.pressureTest.duration) html += `Hold Duration: ${p.pressureTest.duration} minutes<br>`;
    if (p.pressureTest.drop) html += `Pressure Drop: ${p.pressureTest.drop}<br>`;
    if (p.pressureTest.linesTest) html += `Lines Tested: ${p.pressureTest.linesTest}<br>`;
    if (p.pressureTest.notes) html += `Notes: ${p.pressureTest.notes}`;
    html += `</div>`;
  } else if (p.pressureTest && p.pressureTest.performed === false) {
    html += '<div class="subsection-title">Pressure Testing</div>';
    html += '<div class="notes-box"><em>Pressure testing was not performed during this inspection.</em></div>';
  }
  
  // Leak Detection (only show if performed)
  if (p.leakDetection && p.leakDetection.performed) {
    html += '<div class="subsection-title">Acoustic / Electronic Leak Detection</div>';
    html += '<div class="checkbox-list">';
    if (p.leakDetection.strongSignature) html += '<div class="checkbox-item warning">⚠ Strong leak signature detected</div>';
    if (p.leakDetection.moderateSignature) html += '<div class="checkbox-item warning">⚠ Moderate signature</div>';
    if (p.leakDetection.weakSignature) html += '<div class="checkbox-item">Weak signature</div>';
    if (p.leakDetection.noLeak) html += '<div class="checkbox-item checked">✓ No leak detected</div>';
    if (p.leakDetection.notes) html += `<div class="notes-box">Location Notes: ${p.leakDetection.notes}</div>`;
    html += '</div>';
  } else if (p.leakDetection && p.leakDetection.performed === false) {
    html += '<div class="subsection-title">Acoustic / Electronic Leak Detection</div>';
    html += '<div class="notes-box"><em>Leak detection was not performed during this inspection.</em></div>';
  }
  
  // Visual Evaluation
  if (p.visual) {
    html += '<div class="subsection-title">Visual Leak Evaluation</div><div class="checkbox-list">';
    if (p.visual.dyeTesting) html += '<div class="checkbox-item">✓ Dye testing performed</div>';
    if (p.visual.skimmerCracks) html += '<div class="checkbox-item warning">⚠ Skimmer throat cracks</div>';
    if (p.visual.returnJetLeaks) html += '<div class="checkbox-item warning">⚠ Return jet leaks</div>';
    if (p.visual.lightNicheLeaks) html += '<div class="checkbox-item warning">⚠ Light niche leaks</div>';
    if (p.visual.tileLineCracks) html += '<div class="checkbox-item warning">⚠ Tile line cracks</div>';
    if (p.visual.structuralCracks) html += '<div class="checkbox-item warning">⚠ Structural cracks</div>';
    if (p.visual.fittingsLoose) html += '<div class="checkbox-item warning">⚠ Fittings loose / deteriorating</div>';
    if (p.visual.equipmentPadLeaks) html += '<div class="checkbox-item warning">⚠ Equipment pad leaks</div>';
    if (p.visual.notes) html += `<div class="notes-box">Notes: ${p.visual.notes}</div>`;
    html += '</div>';
  }
  
  html += '</div>';
  return html;
}

// Generate equipment section
function generateEquipmentSection(data) {
  if (!data.equipment) return '';
  
  const e = data.equipment;
  let html = '<div class="section"><div class="section-title">5. Equipment Inspection</div>';
  
  // Pump
  if (e.pump) {
    html += '<div class="subsection-title">Pump System</div>';
    if (e.pump.brandModel) html += `<p><strong>Brand/Model:</strong> ${e.pump.brandModel}</p>`;
    html += '<div class="checkbox-list">';
    if (e.pump.operating) html += '<div class="checkbox-item checked">✓ Operating normally</div>';
    if (e.pump.bearingNoise) html += '<div class="checkbox-item warning">⚠ Bearing noise</div>';
    if (e.pump.leakingSeal) html += '<div class="checkbox-item warning">⚠ Leaking seal</div>';
    if (e.pump.lowFlow) html += '<div class="checkbox-item warning">⚠ Low flow</div>';
    if (e.pump.motorOverheating) html += '<div class="checkbox-item warning">⚠ Motor overheating</div>';
    if (e.pump.notes) html += `<div class="notes-box">Notes: ${e.pump.notes}</div>`;
    html += '</div>';
  }
  
  // Filter
  if (e.filter) {
    html += '<div class="subsection-title">Filter System</div>';
    if (e.filter.type) html += `<p><strong>Type:</strong> ${e.filter.type}</p>`;
    html += '<div class="checkbox-list">';
    if (e.filter.pressureNormal) html += '<div class="checkbox-item checked">✓ Pressure normal</div>';
    if (e.filter.pressureHigh) html += '<div class="checkbox-item warning">⚠ Pressure high</div>';
    if (e.filter.tankCracked) html += '<div class="checkbox-item warning">⚠ Tank cracked / O-ring missing</div>';
    if (e.filter.valveLeaking) html += '<div class="checkbox-item warning">⚠ Multiport valve leaking</div>';
    if (e.filter.notes) html += `<div class="notes-box">Notes: ${e.filter.notes}</div>`;
    html += '</div>';
  }
  
  // Heater
  if (e.heater) {
    html += '<div class="subsection-title">Heater</div>';
    if (e.heater.brandModel) html += `<p><strong>Brand/Model:</strong> ${e.heater.brandModel}</p>`;
    html += '<div class="checkbox-list">';
    if (e.heater.ignites) html += '<div class="checkbox-item checked">✓ Ignites properly</div>';
    if (e.heater.waterBypassing) html += '<div class="checkbox-item warning">⚠ Water bypassing</div>';
    if (e.heater.errorCodes) html += '<div class="checkbox-item warning">⚠ Error codes present</div>';
    if (e.heater.corrosion) html += '<div class="checkbox-item warning">⚠ Internal corrosion / soot</div>';
    if (e.heater.gasIssues) html += '<div class="checkbox-item warning">⚠ Gas supply issues</div>';
    if (e.heater.notes) html += `<div class="notes-box">Notes: ${e.heater.notes}</div>`;
    html += '</div>';
  }
  
  // Salt System
  if (e.salt) {
    html += '<div class="subsection-title">Salt System</div><div class="checkbox-list">';
    if (e.salt.properReadings) html += '<div class="checkbox-item checked">✓ Proper readings</div>';
    if (e.salt.lowSalt) html += '<div class="checkbox-item warning">⚠ Low salt</div>';
    if (e.salt.cellCleaning) html += '<div class="checkbox-item warning">⚠ Cell requires cleaning</div>';
    if (e.salt.flowSwitch) html += '<div class="checkbox-item warning">⚠ Flow switch issue</div>';
    if (e.salt.notes) html += `<div class="notes-box">Notes: ${e.salt.notes}</div>`;
    html += '</div>';
  }
  
  // Automation
  if (e.automation) {
    html += '<div class="subsection-title">Automation / Electrical</div><div class="checkbox-list">';
    if (e.automation.operational) html += '<div class="checkbox-item checked">✓ System operational</div>';
    if (e.automation.inactive) html += '<div class="checkbox-item warning">⚠ Inactive/unresponsive</div>';
    if (e.automation.exposedWires) html += '<div class="checkbox-item warning">⚠ Exposed wires</div>';
    if (e.automation.gfciIssues) html += '<div class="checkbox-item warning">⚠ GFCI issues</div>';
    if (e.automation.timersMalfunction) html += '<div class="checkbox-item warning">⚠ Timers malfunctioning</div>';
    if (e.automation.notes) html += `<div class="notes-box">Notes: ${e.automation.notes}</div>`;
    html += '</div>';
  }
  
  html += '</div>';
  return html;
}

// Generate spa section
function generateSpaSection(data) {
  if (!data.spa || !data.spa.applicable) return '';
  
  const s = data.spa;
  let html = '<div class="section"><div class="section-title">6. Hot Tub / Spa Inspection</div>';
  html += '<div class="checkbox-list">';
  
  if (s.shellInspected) html += '<div class="checkbox-item checked">✓ Shell inspected</div>';
  if (s.jetsFunctional) html += '<div class="checkbox-item checked">✓ Jets functional</div>';
  if (s.diversWorking) html += '<div class="checkbox-item checked">✓ Diverters working</div>';
  if (s.heaterOperating) html += '<div class="checkbox-item checked">✓ Heater operating</div>';
  if (s.blowerFunctional) html += '<div class="checkbox-item checked">✓ Blower functional</div>';
  if (s.circulationPump) html += '<div class="checkbox-item checked">✓ Circulation pump</div>';
  if (s.spaLightWorking) html += '<div class="checkbox-item checked">✓ Spa light working</div>';
  if (s.notes) html += `<div class="notes-box">Notes: ${s.notes}</div>`;
  
  html += '</div></div>';
  return html;
}

// Generate safety section
function generateSafetySection(data) {
  if (!data.safety) return '';
  
  const s = data.safety;
  let html = '<div class="section"><div class="section-title">7. Safety Compliance Review</div>';
  html += '<div class="checkbox-list">';
  
  if (s.vgbCompliant) html += '<div class="checkbox-item checked">✓ VGB-compliant main drain</div>';
  if (s.drainCovers) html += '<div class="checkbox-item checked">✓ Proper drain covers installed</div>';
  if (s.fencingCode) html += '<div class="checkbox-item checked">✓ Fencing meets code</div>';
  if (s.gateSelfClosing) html += '<div class="checkbox-item checked">✓ Gate self-closing / self-latching</div>';
  if (s.electricalBonding) html += '<div class="checkbox-item checked">✓ Electrical bonding checked</div>';
  if (s.antiEntrapment) html += '<div class="checkbox-item checked">✓ Anti-entrapment systems functioning</div>';
  if (s.notes) html += `<div class="notes-box">Notes: ${s.notes}</div>`;
  
  html += '</div></div>';
  return html;
}

// Generate findings section
function generateFindingsSection(data) {
  if (!data.findings) return '';
  
  const f = data.findings;
  let html = '<div class="section"><div class="section-title">8. Findings Summary</div>';
  
  if (f.overallCondition) {
    html += `<p><strong>Overall Condition:</strong> ${f.overallCondition}</p>`;
  }
  
  if (f.primaryConcerns) {
    const boxClass = f.overallCondition === 'Good' ? 'good-box' : 
                    f.overallCondition === 'Significant Issues Found' ? 'warning-box' : 'notes-box';
    html += `<div class="${boxClass}">`;
    html += '<p><strong>Primary Concerns:</strong></p>';
    html += `<p style="white-space: pre-wrap;">${f.primaryConcerns}</p>`;
    html += '</div>';
  }
  
  html += '</div>';
  return html;
}

// Generate recommendations section (SIMPLIFIED - just summary and inspector notes)
function generateRecommendationsSection(data) {
  if (!data.recommendations) return '';
  
  const r = data.recommendations;
  let html = '<div class="section"><div class="section-title">9. Summary & Inspector Notes</div>';
  
  // Simple summary - just key points
  const issues = [];
  const recommendations = [];
  
  // Collect key issues
  if (data.structural) {
    const s = data.structural;
    if (s.walls && (s.walls.movement || s.walls.cracks)) issues.push('Structural wall issues');
    if (s.floor && (s.floor.cracks || s.floor.wrinkles)) issues.push('Floor issues');
    if (s.coping && (s.coping.loose || s.coping.cracks)) issues.push('Coping issues');
  }
  
  if (data.plumbing) {
    const p = data.plumbing;
    if (p.leakDetection && p.leakDetection.strongSignature) issues.push('Leak detected');
    if (p.pressureTest && p.pressureTest.drop && p.pressureTest.drop !== 'No drop') issues.push('Pressure test failure');
  }
  
  if (data.equipment) {
    const e = data.equipment;
    if (e.pump && (e.pump.bearingNoise || e.pump.leakingSeal)) issues.push('Pump issues');
    if (e.filter && (e.filter.pressureHigh || e.filter.tankCracked)) issues.push('Filter issues');
    if (e.heater && (e.heater.errorCodes || e.heater.corrosion)) issues.push('Heater issues');
  }
  
  // Collect recommendations
  if (r.services) {
    const svc = r.services;
    if (svc.pumpReplacement) recommendations.push('Pump replacement');
    if (svc.heaterReplacement) recommendations.push('Heater replacement');
    if (svc.linerReplacement) recommendations.push('Liner replacement');
    if (svc.replastering) recommendations.push('Replastering');
    if (svc.leakDetectionRepair) recommendations.push('Leak detection/repair');
  }
  
  // Simple summary box
  html += '<div class="notes-box" style="background: #f0f9ff; border-left: 4px solid #0284c7; margin-bottom: 25px;">';
  html += '<h3 style="font-size: 16px; font-weight: 700; color: #0369a1; margin-bottom: 15px;">Summary</h3>';
  
  if (data.overallCondition) {
    html += `<p style="margin: 8px 0;"><strong>Overall Condition:</strong> ${data.overallCondition}</p>`;
  }
  
  if (issues.length > 0) {
    html += '<p style="margin: 8px 0;"><strong>Key Issues:</strong> ' + issues.join(', ') + '</p>';
  }
  
  if (recommendations.length > 0) {
    html += '<p style="margin: 8px 0;"><strong>Recommendations:</strong> ' + recommendations.join(', ') + '</p>';
  }
  
  if (data.findings && data.findings.primaryConcerns) {
    html += `<p style="margin: 8px 0;"><strong>Primary Concerns:</strong> ${data.findings.primaryConcerns}</p>`;
  }
  
    html += '</div>';
  
  // Inspector Notes only
  if (r.additionalNotes) {
    html += `<div class="notes-box">`;
    html += `<p><strong>Inspector Notes:</strong></p>`;
    html += `<p style="white-space: pre-wrap;">${r.additionalNotes}</p>`;
    html += `</div>`;
  }
  
  html += '</div>';
  return html;
}

// Generate photos section
function generatePhotosSection(data) {
  if (!data.photos || data.photos.length === 0) return '';
  
  let html = '<div class="section"><div class="section-title">10. Photo Documentation</div>';
  
  data.photos.forEach(photo => {
    if (photo.data) {
      html += `<div style="margin: 20px 0;">`;
      html += `<img src="${photo.data}" class="photo" alt="${photo.label}">`;
      html += `<div class="photo-caption">${photo.label}</div>`;
      html += `</div>`;
    }
  });
  
  if (data.videos && data.videos.length > 0) {
    html += `<p style="margin-top: 20px; font-style: italic; color: #666;">`;
    html += `${data.videos.length} video(s) have been uploaded to the customer folder in Google Drive.`;
    html += `</p>`;
  }
  
  html += '</div>';
  return html;
}

// Generate signature section
function generateSignatureSection(data) {
  if (!data.inspectorSignature) return '';
  
  let html = '<div class="section"><div class="section-title">11. Inspector Certification</div>';
  
  html += '<p style="margin-bottom: 20px;">I certify that this inspection was performed to the best of my professional ability and that the findings reported herein represent the conditions observed at the time of inspection.</p>';
  
  html += '<table style="width: 100%; border-collapse: collapse; margin-top: 20px;">';
  html += '<tr>';
  html += '<td style="width: 50%; padding: 20px; vertical-align: top;">';
  html += '<div style="border-bottom: 2px solid #000; margin-bottom: 10px; padding-bottom: 10px;">';
  html += `<img src="${data.inspectorSignature}" alt="Inspector Signature" style="max-width: 300px; max-height: 100px;">`;
  html += '</div>';
  html += `<p style="margin: 0;"><strong>Inspector:</strong> ${data.inspectorName}</p>`;
  html += '</td>';
  html += '<td style="width: 50%; padding: 20px; vertical-align: top;">';
  html += '<div style="border-bottom: 2px solid #000; margin-bottom: 10px; padding-bottom: 30px;">';
  html += '</div>';
  html += `<p style="margin: 0;"><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>`;
  html += '</td>';
  html += '</tr>';
  html += '</table>';
  
  html += '<div style="background: #f9fafb; padding: 15px; border-left: 4px solid #0284c7; margin-top: 20px;">';
  html += '<p style="margin: 0; font-size: 12px; color: #666;">';
  html += '<strong>Note:</strong> This inspection report is valid for 30 days from the date of inspection. Pool conditions may change over time due to weather, usage, and maintenance.';
  html += '</p>';
  html += '</div>';
  
  html += '</div>';
  return html;
}

// ==================== TEST FUNCTIONS ====================

/**
 * TEST FUNCTION: Test OpenAI API Connection
 * 1. Click on this function name in the script editor
 * 2. Click "Run" button at the top
 * 3. Check the "Execution log" at the bottom to see results
 */
function testOpenAI() {
  Logger.log('====================================');
  Logger.log('TESTING OPENAI API CONNECTION');
  Logger.log('====================================\n');
  
  Logger.log('✓ OpenAI API Key: ' + (OPENAI_API_KEY ? OPENAI_API_KEY.substring(0, 20) + '...' : 'NOT SET'));
  Logger.log('✓ OpenAI API URL: ' + OPENAI_API_URL);
  
  Logger.log('\n====================================');
  Logger.log('Testing AI note enhancement...');
  Logger.log('====================================\n');
  
  // Test with sample inspection notes
  const testNotes = "pump making noise. filter pressure high. found leak near skimmer. water level low.";
  
  Logger.log('Original Notes:');
  Logger.log(testNotes);
  Logger.log('\nEnhancing with AI...\n');
  
  const result = enhanceNotesWithAI(testNotes, 'Equipment Inspection');
  
  Logger.log('\n====================================');
  Logger.log('RESULT:');
  Logger.log('====================================');
  
  if (result.success) {
    Logger.log('\n✅ SUCCESS! AI enhancement working!');
    Logger.log('\n--- ORIGINAL NOTES ---');
    Logger.log(result.originalNotes);
    Logger.log('\n--- ENHANCED NOTES ---');
    Logger.log(result.enhancedNotes);
    Logger.log('\n✅ OpenAI API is properly configured and working!');
  } else {
    Logger.log('\n❌ FAILED! Error: ' + result.error);
    Logger.log('\n💡 Troubleshooting:');
    Logger.log('1. Check that OPENAI_API_KEY is correct at the top of the script');
    Logger.log('2. Verify the API key has not expired');
    Logger.log('3. Make sure you have credits/billing set up in your OpenAI account');
    Logger.log('4. Check the API key has proper permissions');
  }
  
  return result;
}

/**
 * TEST FUNCTION: Test OpenAI with custom notes
 * Modify the testNotes variable below and run this function
 */
function testOpenAIWithCustomNotes() {
  Logger.log('====================================');
  Logger.log('TESTING OPENAI WITH CUSTOM NOTES');
  Logger.log('====================================\n');
  
  // EDIT THIS: Put your own notes here to test
  const testNotes = "Pump running but loud. Checked filter - pressure is 25 PSI, should be 15. Found wet grass around equipment. Heater not igniting.";
  const context = "Equipment Inspection";
  
  Logger.log('Context: ' + context);
  Logger.log('Original Notes:\n' + testNotes);
  Logger.log('\nEnhancing with AI...\n');
  
  const result = enhanceNotesWithAI(testNotes, context);
  
  if (result.success) {
    Logger.log('\n✅ SUCCESS!\n');
    Logger.log('--- ENHANCED VERSION ---');
    Logger.log(result.enhancedNotes);
  } else {
    Logger.log('\n❌ FAILED! Error: ' + result.error);
  }
  
  return result;
}

/**
 * TEST FUNCTION: Test Square customer loading
 * 1. Click on this function name in the script editor
 * 2. Click "Run" button at the top
 * 3. Check the "Execution log" at the bottom to see detailed logs
 */
function testSquareCustomers() {
  Logger.log('====================================');
  Logger.log('TESTING SQUARE CUSTOMER INTEGRATION');
  Logger.log('====================================\n');
  
  const result = getSquareCustomers();
  
  Logger.log('\n====================================');
  Logger.log('FINAL RESULT:');
  Logger.log(JSON.stringify(result, null, 2));
  Logger.log('====================================');
  
  if (result.success) {
    Logger.log('\n✅ SUCCESS! Found ' + result.customers.length + ' customers');
    Logger.log('First 3 customers:');
    result.customers.slice(0, 3).forEach((customer, index) => {
      Logger.log((index + 1) + '. ' + customer.name + ' - ' + customer.phone);
    });
  } else {
    Logger.log('\n❌ FAILED! Error: ' + result.error);
  }
  
  return result;
}

/**
 * TEST FUNCTION: Full configuration check
 * Run this to verify all APIs and services are properly configured
 */
function testFullConfiguration() {
  Logger.log('====================================');
  Logger.log('FULL CONFIGURATION CHECK');
  Logger.log('====================================\n');
  
  Logger.log('✓ Drive Folder ID: ' + INSPECTION_DRIVE_FOLDER_ID);
  Logger.log('✓ Notification Email: ' + NOTIFICATION_EMAIL);
  Logger.log('✓ Square Access Token: ' + (SQUARE_ACCESS_TOKEN ? SQUARE_ACCESS_TOKEN.substring(0, 15) + '...' : 'NOT SET'));
  Logger.log('✓ Square Environment: ' + SQUARE_ENVIRONMENT);
  Logger.log('✓ OpenAI API Key: ' + (OPENAI_API_KEY ? OPENAI_API_KEY.substring(0, 20) + '...' : 'NOT SET'));
  
  Logger.log('\n====================================');
  Logger.log('Testing Square API...');
  Logger.log('====================================\n');
  
  const squareResult = getSquareCustomers();
  if (squareResult.success) {
    Logger.log('✅ Square API: Working! Found ' + squareResult.customers.length + ' customers');
  } else {
    Logger.log('❌ Square API: FAILED - ' + squareResult.error);
  }
  
  Logger.log('\n====================================');
  Logger.log('Testing OpenAI API...');
  Logger.log('====================================\n');
  
  const openaiResult = enhanceNotesWithAI("Test pump noise", "Equipment");
  if (openaiResult.success) {
    Logger.log('✅ OpenAI: Working!');
  } else {
    Logger.log('❌ OpenAI: FAILED - ' + openaiResult.error);
  }
  
  Logger.log('\n====================================');
  Logger.log('Testing Google Drive access...');
  Logger.log('====================================\n');
  
  try {
    const folder = DriveApp.getFolderById(INSPECTION_DRIVE_FOLDER_ID);
    Logger.log('✅ Google Drive: Working! Folder name: ' + folder.getName());
  } catch (error) {
    Logger.log('❌ Google Drive: FAILED - ' + error);
  }
  
  Logger.log('\n====================================');
  Logger.log('CONFIGURATION CHECK COMPLETE');
  Logger.log('====================================');
}

/**
 * SETUP FUNCTION: Enable PDF Conversion
 * Run this function to get instructions on enabling PDF conversion
 * 
 * To enable PDF conversion for inspection reports:
 * 1. In Apps Script editor, go to "Services" (left sidebar) or "Resources" > "Advanced Google Services"
 * 2. Click "+" to add a service
 * 3. Find and enable "Drive API"
 * 4. Find and enable "Google Docs API"
 * 5. Click "OK" to save
 * 6. Re-run your inspection save function
 * 
 * Note: You may need to authorize the script when you first use these APIs
 */
function setupPDFConversion() {
  Logger.log('====================================');
  Logger.log('PDF CONVERSION SETUP INSTRUCTIONS');
  Logger.log('====================================\n');
  
  Logger.log('To enable PDF conversion for inspection reports:\n');
  Logger.log('1. In the Apps Script editor, click on "Services" in the left sidebar');
  Logger.log('   (or go to Resources > Advanced Google Services)\n');
  Logger.log('2. Click the "+" button to add a service\n');
  Logger.log('3. Search for and enable "Drive API"\n');
  Logger.log('4. Search for and enable "Google Docs API"\n');
  Logger.log('5. Click "OK" to save\n');
  Logger.log('6. You may need to authorize the script - click "Review Permissions"\n');
  Logger.log('7. Re-run your inspection save function\n');
  Logger.log('\n====================================');
  Logger.log('ALTERNATIVE: Manual PDF Conversion');
  Logger.log('====================================\n');
  Logger.log('If you cannot enable the APIs, the system will save HTML files instead.');
  Logger.log('You can open HTML files in a browser and print to PDF.\n');
  
  // Test if APIs are available
  Logger.log('\n====================================');
  Logger.log('CURRENT API STATUS');
  Logger.log('====================================\n');
  
  if (typeof Drive !== 'undefined' && Drive.Files) {
    Logger.log('✅ Drive API: Available');
  } else {
    Logger.log('❌ Drive API: Not enabled');
  }
  
  if (typeof Docs !== 'undefined' && Docs.Documents) {
    Logger.log('✅ Docs API: Available');
  } else {
    Logger.log('❌ Docs API: Not enabled');
  }
  
  Logger.log('\n====================================');
  Logger.log('SETUP INSTRUCTIONS COMPLETE');
  Logger.log('====================================');
}


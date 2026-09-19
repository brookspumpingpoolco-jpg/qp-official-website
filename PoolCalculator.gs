// Pool Calculator Google Apps Script
// Multi-tenant version with company-based customer management
// Square integration is OPTIONAL per company

// CONFIGURATION - Update these with your actual IDs
const DRIVE_FOLDER_ID = '1caFBUhSzE5WNAm9vCT4dwDQuAO0iuo1h'; // Your reports folder

// Multi-tenant Configuration
const SPREADSHEET_ID = '1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0';
const AUTH_SHEET_NAME = 'Authentication';
const CUSTOMERS_SHEET_NAME = 'Customers';
const JOBS_SHEET_NAME = 'Jobs';

// Square API Configuration (Fallback - companies can override in Settings sheet)
const DEFAULT_SQUARE_ACCESS_TOKEN = 'REDACTED';
const DEFAULT_SQUARE_APPLICATION_ID = 'sq0idp-UsE101iI0GHTKs8WSAJwwA';
const SQUARE_API_VERSION = '2024-12-18';
const DEFAULT_SQUARE_ENVIRONMENT = 'production';

// Email Configuration
const NOTIFICATION_EMAIL = 'brookspumpingpoolco@gmail.com';

// Twilio SMS Configuration - DISABLED (Twilio account restricted)
// Get these from: https://console.twilio.com/
const TWILIO_ACCOUNT_SID = '';  // Disabled
const TWILIO_AUTH_TOKEN = '';    // Disabled
const TWILIO_PHONE_NUMBER = '';  // Disabled
const SMS_ENABLED = false;       // Set to true when ready to enable SMS

// Serve the HTML interface
function doGet(e) {
  const userEmail = e.parameter.email || '';
  const template = HtmlService.createTemplateFromFile('PoolCalculatorUI');
  template.userEmail = userEmail;
  
  return template.evaluate()
    .setTitle('Pool & Chemical Calculator')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    const payload = getPostPayload_(e);
    const action = payload.action || '';

    let result;
    switch (action) {
      case 'calculatePoolVolume':
        result = calculatePoolVolume(payload.data || payload);
        break;
      case 'calculateChemicals':
        result = calculateChemicals(payload.data || payload);
        break;
      case 'getCustomers':
      case 'getCustomersFromSheet':
      case 'getSquareCustomers':
        result = getCustomersFromSheet(payload.email || getActiveUserEmail_());
        break;
      case 'createCustomer':
      case 'createCustomerInSheet':
      case 'createSquareCustomer':
        result = createCustomerInSheet(payload.data || payload, payload.email || getActiveUserEmail_());
        break;
      case 'saveReportToDrive':
        result = saveReportToDrive(payload.data || payload);
        break;
      default:
        result = { success: false, error: 'Unknown action: ' + action };
    }

    return jsonResponse_(result);
  } catch (error) {
    return jsonResponse_({
      success: false,
      error: error.toString()
    });
  }
}

function getPostPayload_(e) {
  if (!e) return {};

  if (e.postData && e.postData.contents) {
    const raw = e.postData.contents;
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch (jsonError) {
        // Fall through to parameter parsing for form-encoded requests.
      }
    }
  }

  const params = (e.parameter || {});
  const payload = Object.assign({}, params);

  if (payload.data) {
    try {
      payload.data = JSON.parse(payload.data);
    } catch (jsonError) {
      // Keep original string if it is not JSON.
    }
  }

  return payload;
}

function jsonResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getActiveUserEmail_() {
  try {
    return Session.getActiveUser().getEmail() || '';
  } catch (error) {
    return '';
  }
}

// Calculate pool volume based on shape
function calculatePoolVolume(data) {
  try {
    const shape = data.shape;
    let volume = 0;
    
    switch(shape) {
      case 'rectangular':
        // Volume = Length × Width × Average Depth × 7.5
        volume = data.length * data.width * data.depth * 7.5;
        break;
        
      case 'circular':
        // Volume = π × radius² × depth × 7.5
        const radius = data.diameter / 2;
        volume = Math.PI * radius * radius * data.depth * 7.5;
        break;
        
      case 'oval':
        // Volume = π × (length/2) × (width/2) × depth × 7.5
        volume = Math.PI * (data.length / 2) * (data.width / 2) * data.depth * 7.5;
        break;
        
      case 'kidney':
        // Approximate kidney as 75% of oval
        volume = 0.75 * Math.PI * (data.length / 2) * (data.width / 2) * data.depth * 7.5;
        break;
    }
    
    return {
      success: true,
      gallons: Math.round(volume),
      liters: Math.round(volume * 3.78541)
    };
  } catch (error) {
    return {
      success: false,
      error: error.toString()
    };
  }
}

// Calculate chemical needs
function calculateChemicals(data) {
  try {
    const gallons = data.gallons;
    const currentPH = data.currentPH || 7.5;
    const currentChlorine = data.currentChlorine || 0;
    const currentAlkalinity = data.currentAlkalinity || 100;
    
    // Target levels
    const targetPH = 7.4;
    const targetChlorine = 3.0; // ppm
    const targetAlkalinity = 100; // ppm
    
    let chemicals = {};
    
    // Chlorine needed (liquid chlorine 10% solution) - convert to gallons with smart rounding
    const chlorineDeficit = targetChlorine - currentChlorine;
    if (chlorineDeficit > 0) {
      const chlorineOz = Math.round((chlorineDeficit * gallons * 0.00013) * 128);
      const chlorineGallons = chlorineOz / 128;
      
      // Smart rounding: if >= 0.5 gal, round to whole gallons
      // If decimal > 0.4, round up. If <= 0.4, round down
      // Example: 2.8 gal → 3 gal, 2.4 gal → 2 gal, 2.5 gal → 3 gal
      let displayAmount, displayUnit;
      if (chlorineGallons >= 0.5) {
        const wholeGallons = Math.floor(chlorineGallons);
        const decimal = chlorineGallons - wholeGallons;
        // Round up if decimal > 0.4, otherwise round down
        const roundedGallons = decimal > 0.4 ? wholeGallons + 1 : wholeGallons;
        displayAmount = roundedGallons + ' gal';
        displayUnit = 'gal';
      } else {
        // Less than 0.5 gallons, show in oz
        displayAmount = chlorineOz + ' oz';
        displayUnit = 'oz';
      }
      
      chemicals.chlorine = {
        amount: displayAmount,
        amountRaw: chlorineOz,
        unit: displayUnit,
        product: 'Liquid Chlorine (10%)',
        instruction: 'Add slowly around perimeter with pump running'
      };
    }
    
    // pH adjustment - convert to lbs where appropriate
    const pHDifference = currentPH - targetPH;
    if (Math.abs(pHDifference) > 0.2) {
      if (pHDifference > 0) {
        // Need to lower pH - Muriatic Acid (keep in oz, typically small amounts)
        const acidOz = Math.round(Math.abs(pHDifference) * gallons * 0.00015 * 16);
        chemicals.pHMinus = {
          amount: acidOz >= 16 ? (acidOz / 16).toFixed(1) + ' lbs' : acidOz + ' oz',
          amountRaw: acidOz,
          unit: acidOz >= 16 ? 'lbs' : 'oz',
          product: 'Muriatic Acid or pH Decreaser',
          instruction: 'Add in deep end with pump running, wait 4 hours before swimming'
        };
      } else {
        // Need to raise pH - Soda Ash (convert to lbs)
        const sodaOz = Math.round(Math.abs(pHDifference) * gallons * 0.00012 * 16);
        chemicals.pHPlus = {
          amount: sodaOz >= 16 ? (sodaOz / 16).toFixed(1) + ' lbs' : sodaOz + ' oz',
          amountRaw: sodaOz,
          unit: sodaOz >= 16 ? 'lbs' : 'oz',
          product: 'Soda Ash (pH Increaser)',
          instruction: 'Dissolve in bucket and distribute around pool'
        };
      }
    }
    
    // Alkalinity adjustment - convert to lbs
    const alkalinityDifference = targetAlkalinity - currentAlkalinity;
    if (Math.abs(alkalinityDifference) > 20) {
      if (alkalinityDifference > 0) {
        const alkOz = Math.round(Math.abs(alkalinityDifference) * gallons * 0.00014 * 16);
        chemicals.alkalinity = {
          amount: alkOz >= 16 ? (alkOz / 16).toFixed(1) + ' lbs' : alkOz + ' oz',
          amountRaw: alkOz,
          unit: alkOz >= 16 ? 'lbs' : 'oz',
          product: 'Baking Soda (Sodium Bicarbonate)',
          instruction: 'Broadcast over surface with pump running'
        };
      }
    }
    
    // Shock treatment recommendation - Cal Hypo (already in lbs, but adjust if liquid chlorine was added)
    // Cal hypo: 1 lb per 10,000 gallons raises FC by ~10 ppm
    // If we already added liquid chlorine, we might need less shock, but shock is typically weekly maintenance
    let shockAmount = Math.round((gallons / 10000) * 10) / 10; // Round to 0.1 lbs
    if (shockAmount < 0.5) shockAmount = 0.5; // Minimum 0.5 lbs
    
    chemicals.shock = {
      amount: shockAmount + ' lbs',
      amountRaw: shockAmount,
      unit: 'lbs',
      product: 'Calcium Hypochlorite Shock (65-73% available chlorine)',
      instruction: 'Add at dusk, wait 8 hours before swimming',
      frequency: 'Weekly or after heavy use/rain'
    };
    
    return {
      success: true,
      chemicals: chemicals,
      notes: [
        'Always add chemicals with pump running',
        'Wait recommended time between different chemicals',
        'Retest water after 24 hours',
        'Never mix chemicals together'
      ]
    };
  } catch (error) {
    return {
      success: false,
      error: error.toString()
    };
  }
}

// Save report to Google Drive in customer-specific folder
function saveReportToDrive(reportData) {
  try {
    const mainFolder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    
    // Create customer folder name: "Customer Name - Address"
    const customerFolderName = `${reportData.customerName} - ${reportData.customerAddress || 'No Address'}`;
    
    // Check if customer folder exists, create if not
    const customerFolder = getOrCreateFolder(mainFolder, customerFolderName);
    
    // Create filename with date
    const fileName = `Pool Report - ${reportData.customerName} - ${new Date().toLocaleDateString()}.pdf`;
    
    // Create HTML content for PDF
    const htmlContent = generateReportHTML(reportData);
    
    // Convert HTML to PDF
    const blob = Utilities.newBlob(htmlContent, 'text/html', 'report.html');
    const pdf = blob.getAs('application/pdf').setName(fileName);
    
    // Save to customer folder
    const file = customerFolder.createFile(pdf);
    
    // Make file shareable
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // Handle photo if included
    let photoFile = null;
    if (reportData.photoData) {
      try {
        const photoFileName = `Pool Photo - ${reportData.customerName} - ${new Date().toLocaleDateString()}.jpg`;
        const photoBlob = Utilities.newBlob(
          Utilities.base64Decode(reportData.photoData.split(',')[1]),
          'image/jpeg',
          photoFileName
        );
        photoFile = customerFolder.createFile(photoBlob);
        photoFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (photoError) {
        Logger.log('Error saving photo: ' + photoError);
      }
    }
    
    // Send email notification to team (with attachments)
    sendReportEmail(reportData, file, photoFile, false);
    
    // Send email to customer if requested
    if (reportData.emailCustomer && reportData.customerEmail) {
      sendReportEmail(reportData, file, photoFile, true);
    }
    
    // Send SMS to customer if requested
    if (reportData.textCustomer && reportData.customerPhone) {
      sendSMS(reportData.customerPhone, reportData.customerName, file.getUrl());
    }
    
    // Generate a short service summary for customer notes / quick copy
    let squareNoteText = '';
    if (reportData.squareCustomerId) {
      squareNoteText = `Pool service summary - ${new Date().toLocaleDateString()}\n\n` +
                      `Pool: ${reportData.poolShape} | ${reportData.dimensions}\n` +
                      `Volume: ${reportData.gallons.toLocaleString()} gal (${reportData.liters.toLocaleString()} L)\n\n` +
                      (reportData.chemicalsAdded ? `- Chemicals added\n` : '') +
                      (reportData.vacuumingDone ? `- Vacuuming done\n` : '') +
                      (reportData.backwashDone ? `- Backwash done\n` : '') +
                      (reportData.pumpBasketCleaned ? `- Pump basket cleaned\n` : '') +
                      (reportData.skimmerBasketCleaned ? `- Skimmer basket(s) cleaned\n` : '') +
                      (reportData.poolBrushed ? `- Pool brushed\n` : '') +
                      (reportData.waterLevelChecked ? `- Water level checked\n` : '') +
                      (reportData.serviceNotes ? `\nNotes: ${reportData.serviceNotes}\n` : '') +
                      `\nReport link: ${file.getUrl()}`;
    }
    
    // Create a job for this service call
    let jobId = null;
    let jobCreated = false;
    try {
      const jobResult = createJobFromReport(reportData, file.getUrl());
      if (jobResult.success) {
        jobId = jobResult.jobId;
        jobCreated = true;
        Logger.log('✅ Job created successfully: ' + jobId);
      } else {
        Logger.log('⚠️ Job creation failed: ' + jobResult.error);
      }
    } catch (jobError) {
      Logger.log('⚠️ Error creating job: ' + jobError.toString());
      // Don't fail the whole report save if job creation fails
    }
    
    // Save report to Customer Portal if customer email is provided
    if (reportData.customerEmail) {
      try {
        const customerPortalResult = savePoolReportToCustomerPortal(reportData, file.getUrl(), photoFile ? photoFile.getUrl() : '');
        if (customerPortalResult.success) {
          Logger.log('✅ Pool report saved to Customer Portal for: ' + reportData.customerEmail);
        } else {
          Logger.log('⚠️ Failed to save to Customer Portal: ' + customerPortalResult.error);
          // Don't fail the whole report save if Customer Portal save fails
        }
      } catch (portalError) {
        Logger.log('⚠️ Error saving to Customer Portal: ' + portalError.toString());
        // Don't fail the whole report save if Customer Portal save fails
      }
    }
    
    return {
      success: true,
      fileUrl: file.getUrl(),
      fileName: fileName,
      folderUrl: customerFolder.getUrl(),
      folderName: customerFolderName,
      squareNoteText: squareNoteText, // Backward-compatible response key for copied customer notes
      jobId: jobId, // Job ID if created
      jobCreated: jobCreated // Whether job was successfully created
    };
  } catch (error) {
    Logger.log('Error saving report: ' + error);
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
    // Ensure existing folder is also shareable
    try {
      folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) {
      Logger.log('Note: Could not update folder sharing (may already be set): ' + e);
    }
    return folder;
  } else {
    const newFolder = parentFolder.createFolder(folderName);
    // Make new folder shareable with link
    newFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    Logger.log('✓ Created and shared customer folder: ' + folderName);
    return newFolder;
  }
}

// Send email notification with report and attachments
function sendReportEmail(reportData, pdfFile, photoFile, isCustomer) {
  try {
    // Determine recipient
    const recipient = isCustomer ? reportData.customerEmail : NOTIFICATION_EMAIL;
    const recipientName = isCustomer ? reportData.customerName : 'Team';
    
    const subject = isCustomer 
      ? `Your Pool Report from A Quality Pool Company`
      : `${reportData.customerName} - ${reportData.customerAddress || 'No Address'} - Pool & Chemical Report`;
    
    // Build email body
    const htmlBody = isCustomer ? getCustomerEmailHTML(reportData, pdfFile) : getTeamEmailHTML(reportData, pdfFile);
    const plainBody = isCustomer ? getCustomerEmailPlain(reportData, pdfFile) : getTeamEmailPlain(reportData, pdfFile);
    
    // Prepare attachments
    const attachments = [pdfFile.getBlob()];
    if (photoFile) {
      attachments.push(photoFile.getBlob());
    }
    
    // Send email with attachments
    MailApp.sendEmail({
      to: recipient,
      subject: subject,
      body: plainBody,
      htmlBody: htmlBody,
      attachments: attachments,
      name: 'A Quality Pool Company'
    });
    
    Logger.log('Email sent successfully to ' + recipient + ' (isCustomer: ' + isCustomer + ')');
    return { success: true };
  } catch (error) {
    Logger.log('Error sending email: ' + error);
    return { success: false, error: error.toString() };
  }
}

// Generate customer-facing email HTML
function getCustomerEmailHTML(data, file) {
  const companyName = 'A Quality Pool Company';
  const companyEmail = 'brookspumpingpoolco@gmail.com';
  const companyPhone = '(502) 706-9172';
  const logoUrl = 'https://cdn.prod.website-files.com/6931dc4e8e97334e195432df/6993ce0abcd54d3520799318_IMG_1763.jpg';
  const firstName = (data.customerName || 'there').split(' ')[0];
  const serviceDate = new Date().toLocaleDateString();
  const reportUrl = file && typeof file.getUrl === 'function' ? file.getUrl() : '';
  const esc = function(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  };

  const summaryRows = [
    { label: 'Service Date', value: serviceDate },
    { label: 'Pool Volume', value: (data.gallons || 0).toLocaleString() + ' gallons' },
    { label: 'Pool Shape', value: data.poolShape || 'N/A' },
    { label: 'Dimensions', value: data.dimensions || 'N/A' }
  ].map(function(row) {
    return '<tr>'
      + '<td style="padding:10px 0;color:#64748b;font-size:14px;width:140px;vertical-align:top;">' + esc(row.label) + '</td>'
      + '<td style="padding:10px 0;font-weight:700;color:#0f172a;font-size:15px;">' + esc(row.value) + '</td>'
      + '</tr>';
  }).join('');

  const servicesCompleted = [
    data.chemicalsAdded ? 'Chemicals added' : '',
    data.vacuumingDone ? 'Pool vacuumed' : '',
    data.backwashDone ? 'Filter backwashed' : '',
    data.pumpBasketCleaned ? 'Pump basket cleaned' : '',
    data.skimmerBasketCleaned ? 'Skimmer basket(s) cleaned' : '',
    data.poolBrushed ? 'Pool brushed' : '',
    data.waterLevelChecked ? 'Water level checked' : ''
  ].filter(Boolean);

  const servicesHtml = servicesCompleted.length > 0
    ? '<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:20px 24px;margin:0 0 24px 0;">'
      + '<p style="margin:0 0 10px 0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#166534;">Services Completed</p>'
      + servicesCompleted.map(function(service) {
          return '<p style="margin:6px 0;font-size:14px;color:#166534;line-height:1.6;">&#10003; ' + esc(service) + '</p>';
        }).join('')
      + '</div>'
    : '';

  const notesHtml = data.serviceNotes
    ? '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px 24px;margin:0 0 24px 0;">'
      + '<p style="margin:0 0 10px 0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#475569;">Service Notes</p>'
      + '<p style="margin:0;font-size:14px;color:#334155;line-height:1.7;">' + esc(data.serviceNotes) + '</p>'
      + '</div>'
    : '';

  const reportButtonHtml = reportUrl
    ? '<div style="text-align:center;margin:28px 0 20px 0;">'
      + '<a href="' + esc(reportUrl) + '" style="display:inline-block;background:#0369a1;color:white;text-decoration:none;padding:14px 26px;border-radius:8px;font-weight:700;font-size:15px;">View Online Report</a>'
      + '</div>'
    : '';

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pool Report</title></head>'
    + '<body style="font-family:Arial,sans-serif;background:#f5f7fa;margin:0;padding:40px 20px;">'
    + '<table border="0" cellpadding="0" cellspacing="0" width="640" style="max-width:640px;width:100%;background:#ffffff;margin:0 auto;">'
    + '<tr><td align="center" style="background:linear-gradient(135deg,#0c4a6e 0%,#0369a1 100%);padding:32px 24px;">'
    + '<img src="' + logoUrl + '" alt="' + companyName + '" style="max-width:180px;height:auto;margin-bottom:16px;display:block;border-radius:8px;">'
    + '<h1 style="color:white;margin:12px 0 4px 0;font-size:26px;font-weight:800;">' + companyName + '</h1>'
    + '<p style="color:#e0f2fe;margin:0;font-size:14px;">Weekly Service Report</p>'
    + '</td></tr>'
    + '<tr><td style="padding:32px 24px;">'
    + '<h2 style="font-size:18px;font-weight:600;color:#0f172a;margin:0 0 16px 0;">Hello ' + esc(firstName) + ',</h2>'
    + '<div style="background:linear-gradient(135deg,#dbeafe,#bfdbfe);border-left:4px solid #3b82f6;padding:20px;margin:20px 0;border-radius:0 8px 8px 0;">'
    + '<p style="margin:0;font-size:15px;color:#1e40af;line-height:1.6;">Your pool service report is ready. We attached the full PDF to this email and included a quick summary below.</p>'
    + '</div>'
    + '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px 24px;margin:0 0 24px 0;">'
    + '<p style="margin:0 0 10px 0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#475569;">Report Summary</p>'
    + '<table border="0" cellpadding="0" cellspacing="0" width="100%">' + summaryRows + '</table>'
    + '</div>'
    + servicesHtml
    + notesHtml
    + reportButtonHtml
    + '<p style="color:#64748b;font-size:14px;line-height:1.6;margin:24px 0 0 0;">If you have any questions, just reply to this email and our team will help.</p>'
    + '</td></tr>'
    + '<tr><td style="background:#f8fafc;padding:24px;text-align:center;border-top:1px solid #e2e8f0;">'
    + '<p style="font-size:13px;color:#64748b;margin:4px 0;"><strong>' + companyName + '</strong></p>'
    + '<p style="font-size:13px;color:#64748b;margin:4px 0;">' + companyEmail + ' | ' + companyPhone + '</p>'
    + '<p style="margin:10px 0 0 0;font-size:12px;"><a href="https://share.google/hAHnIZO81Wl82hZut" style="color:#0284c7;text-decoration:none;">Leave us a review &#11088;</a></p>'
    + '</td></tr>'
    + '</table></body></html>';
}

// Generate team email HTML
function getTeamEmailHTML(data, file) {
  const logoUrl = 'https://cdn.prod.website-files.com/6931dc4e8e97334e195432df/6931dca5c5fb5c5fc0860f2c_test.png';
  
  return `
    <html>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #0369a1 0%, #0284c7 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
          <img src="${logoUrl}" alt="A Quality Pool Company" style="width: 180px; margin-bottom: 20px;">
          <h1 style="margin: 0;">Pool Report Generated</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">A Quality Pool Company</p>
        </div>
        
        <div style="padding: 30px; background: #f9fafb; border-radius: 0 0 12px 12px;">
          <h2 style="color: #111827; margin-top: 0;">Customer Information</h2>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Name:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${data.customerName}</td>
            </tr>
            ${data.customerAddress ? `
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Address:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${data.customerAddress}</td>
            </tr>` : ''}
            ${data.customerEmail ? `
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Email:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${data.customerEmail}</td>
            </tr>` : ''}
            ${data.customerPhone ? `
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Phone:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${data.customerPhone}</td>
            </tr>` : ''}
          </table>

          <h3 style="color: #111827;">Pool Details</h3>
          <p><strong>Volume:</strong> ${data.gallons} gallons | <strong>Shape:</strong> ${data.poolShape}</p>

          ${(data.chemicalsAdded || data.vacuumingDone || data.backwashDone || data.pumpBasketCleaned || data.skimmerBasketCleaned || data.poolBrushed || data.waterLevelChecked) ? `
          <h3 style="color: #111827;">Service Actions</h3>
          <div style="background: #dcfce7; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            ${data.chemicalsAdded ? '<p style="margin: 5px 0;">✓ Chemicals added</p>' : ''}
            ${data.vacuumingDone ? '<p style="margin: 5px 0;">✓ Vacuuming</p>' : ''}
            ${data.backwashDone ? '<p style="margin: 5px 0;">✓ Backwash</p>' : ''}
            ${data.pumpBasketCleaned ? '<p style="margin: 5px 0;">✓ Pump basket cleaned</p>' : ''}
            ${data.skimmerBasketCleaned ? '<p style="margin: 5px 0;">✓ Skimmer basket(s) cleaned</p>' : ''}
            ${data.poolBrushed ? '<p style="margin: 5px 0;">✓ Pool brushed</p>' : ''}
            ${data.waterLevelChecked ? '<p style="margin: 5px 0;">✓ Water level checked</p>' : ''}
          </div>
          ` : ''}

          ${generateEquipmentEmailSummary(data.equipment)}

          <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 4px;">
            <p style="margin: 0; color: #92400e;">
              <strong>📋 Next Step:</strong> Upload to Joist invoice
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
}

// Generate customer plain text email
function getCustomerEmailPlain(data, file) {
  const reportUrl = file && typeof file.getUrl === 'function' ? file.getUrl() : '';
  return `
Hi ${data.customerName},

Your pool service report is ready. The full PDF is attached.

QUICK SUMMARY
-------------
Service Date: ${new Date().toLocaleDateString()}
Pool Volume: ${data.gallons.toLocaleString()} gallons
Pool Shape: ${data.poolShape}
Dimensions: ${data.dimensions || 'N/A'}
${data.serviceNotes ? '\nNotes: ' + data.serviceNotes : ''}

${(data.chemicalsAdded || data.vacuumingDone || data.backwashDone || data.pumpBasketCleaned || data.skimmerBasketCleaned || data.poolBrushed || data.waterLevelChecked) ? `
SERVICES COMPLETED TODAY:
${data.chemicalsAdded ? '✓ Chemicals added\n' : ''}${data.vacuumingDone ? '✓ Pool vacuuming\n' : ''}${data.backwashDone ? '✓ Filter backwash\n' : ''}${data.pumpBasketCleaned ? '✓ Pump basket cleaned\n' : ''}${data.skimmerBasketCleaned ? '✓ Skimmer basket(s) cleaned\n' : ''}${data.poolBrushed ? '✓ Pool brushed\n' : ''}${data.waterLevelChecked ? '✓ Water level checked\n' : ''}
` : ''}

${reportUrl ? '\nReport Link: ' + reportUrl + '\n' : ''}
If you have any questions, feel free to reach out!

---
A Quality Pool Company
We do everything with pools
Phone: (502) 706-9172
Email: brookspumpingpoolco@gmail.com
Leave us a review: https://share.google/hAHnIZO81Wl82hZut
  `;
}

// Generate team plain text email
function getTeamEmailPlain(data, file) {
  return `
Pool Report Generated

Customer: ${data.customerName}
${data.customerAddress ? 'Address: ' + data.customerAddress : ''}
${data.customerEmail ? 'Email: ' + data.customerEmail : ''}
${data.customerPhone ? 'Phone: ' + data.customerPhone : ''}

Pool Volume: ${data.gallons} gallons
Shape: ${data.poolShape}

${(data.chemicalsAdded || data.vacuumingDone || data.backwashDone || data.pumpBasketCleaned || data.skimmerBasketCleaned || data.poolBrushed || data.waterLevelChecked) ? `
Services:
${data.chemicalsAdded ? '✓ Chemicals added\n' : ''}${data.vacuumingDone ? '✓ Vacuuming\n' : ''}${data.backwashDone ? '✓ Backwash\n' : ''}${data.pumpBasketCleaned ? '✓ Pump basket cleaned\n' : ''}${data.skimmerBasketCleaned ? '✓ Skimmer basket(s) cleaned\n' : ''}${data.poolBrushed ? '✓ Pool brushed\n' : ''}${data.waterLevelChecked ? '✓ Water level checked\n' : ''}
` : ''}

NEXT STEP: Upload to Joist invoice

---
A Quality Pool Company
brookspumpingpoolco@gmail.com | 502-706-9172
  `;
}

// Send SMS notification via Twilio
function sendSMS(phoneNumber, customerName, reportUrl) {
  try {
    Logger.log('📱 SMS requested for: ' + phoneNumber);
    
    // Check if SMS is enabled
    if (!SMS_ENABLED) {
      Logger.log('⚠️ SMS is currently disabled');
      return {
        success: true, // Return success to avoid blocking report generation
        message: 'SMS feature disabled'
      };
    }
    
    // Check if Twilio is configured
    if (!TWILIO_ACCOUNT_SID || TWILIO_ACCOUNT_SID === '') {
      Logger.log('⚠️ Twilio not configured. Update TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER at the top of the script.');
      return {
        success: false,
        error: 'Twilio not configured'
      };
    }
    
    // Format phone number (ensure +1 prefix for US numbers)
    let formattedPhone = phoneNumber.replace(/\D/g, ''); // Remove non-digits
    if (formattedPhone.length === 10) {
      formattedPhone = '+1' + formattedPhone;
    } else if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+' + formattedPhone;
    }
    
    Logger.log('Formatted phone: ' + formattedPhone);
    
    // Create SMS message
    const message = `Hi ${customerName}! Your pool report from A Quality Pool Company is ready. View it here: ${reportUrl}`;
    
    // Twilio API URL
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    
    // Create Basic Auth header
    const authHeader = 'Basic ' + Utilities.base64Encode(TWILIO_ACCOUNT_SID + ':' + TWILIO_AUTH_TOKEN);
    
    // API request options
    const options = {
      method: 'post',
      headers: {
        'Authorization': authHeader
      },
      payload: {
        From: TWILIO_PHONE_NUMBER,
        To: formattedPhone,
        Body: message
      },
      muteHttpExceptions: true
    };
    
    // Send SMS via Twilio
    Logger.log('Sending request to Twilio...');
    const response = UrlFetchApp.fetch(twilioUrl, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    Logger.log('Twilio Response Code: ' + responseCode);
    Logger.log('Twilio Response: ' + responseText);
    
    if (responseCode === 200 || responseCode === 201) {
      const result = JSON.parse(responseText);
      Logger.log('✅ SMS sent successfully! SID: ' + result.sid);
      return {
        success: true,
        messageSid: result.sid,
        status: result.status
      };
    } else {
      Logger.log('❌ Twilio error: ' + responseText);
      return {
        success: false,
        error: 'Twilio API error: ' + responseText
      };
    }
  } catch (error) {
    Logger.log('❌ Error sending SMS: ' + error);
    return { 
      success: false, 
      error: error.toString() 
    };
  }
}

// Get logo as base64 data URL (for PDF embedding)
function getLogoBase64() {
  try {
    const logoUrl = 'https://cdn.prod.website-files.com/6931dc4e8e97334e195432df/6931dca5c5fb5c5fc0860f2c_test.png';
    const response = UrlFetchApp.fetch(logoUrl);
    const blob = response.getBlob();
    const base64 = Utilities.base64Encode(blob.getBytes());
    return 'data:image/png;base64,' + base64;
  } catch (error) {
    Logger.log('Error fetching logo: ' + error);
    // Return a transparent 1x1 pixel as fallback
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  }
}

// Generate comprehensive HTML report with logo (Joist-style format)
function generateReportHTML(data) {
  const date = new Date().toLocaleDateString();
  const time = new Date().toLocaleTimeString();
  const reportNum = Date.now().toString().slice(-6);
  
  // Get logo as base64 for PDF embedding
  const logoDataUrl = getLogoBase64();
  
  let html = `
    <html>
      <head>
        <style>
          @page {
            margin: 0.5in;
          }
          body { 
            font-family: 'Helvetica', 'Arial', sans-serif; 
            color: #000;
            line-height: 1.5;
            margin: 0;
            padding: 40px;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 20px;
            padding-bottom: 20px;
          }
          .logo {
            width: 140px;
          }
          .title {
            text-align: center;
            color: #ccc;
            font-size: 32px;
            font-weight: bold;
            letter-spacing: 3px;
            margin: 20px 0;
          }
          .prepared-for {
            text-align: right;
            font-size: 14px;
          }
          .prepared-for strong {
            font-size: 12px;
            color: #666;
            display: block;
            margin-bottom: 5px;
          }
          .company-info {
            font-size: 14px;
            line-height: 1.6;
            margin-top: 20px;
          }
          .company-info strong {
            font-size: 16px;
            display: block;
            margin-bottom: 5px;
          }
          .meta-info {
            margin-top: 30px;
            display: flex;
            justify-content: space-between;
            font-size: 14px;
          }
          .meta-left, .meta-right {
            width: 48%;
          }
          .meta-left table, .meta-right table {
            width: 100%;
            border-collapse: collapse;
          }
          .meta-left td, .meta-right td {
            padding: 8px 0;
            border-bottom: 1px solid #ddd;
          }
          .meta-left td:first-child, .meta-right td:first-child {
            font-weight: bold;
            width: 50%;
          }
          .section-title {
            font-size: 18px;
            font-weight: bold;
            margin: 30px 0 15px 0;
            color: #333;
            border-bottom: 2px solid #0284c7;
            padding-bottom: 8px;
          }
          .data-table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
          }
          .data-table thead {
            background: #f5f5f5;
          }
          .data-table th {
            padding: 12px;
            text-align: left;
            font-weight: bold;
            font-size: 12px;
            border-bottom: 2px solid #ddd;
          }
          .data-table td {
            padding: 12px;
            border-bottom: 1px solid #ddd;
            font-size: 14px;
          }
          .highlight-value {
            background: #e0f2fe;
            padding: 20px;
            margin: 20px 0;
            border-left: 4px solid #0284c7;
            font-size: 16px;
          }
          .highlight-value .big {
            font-size: 36px;
            font-weight: bold;
            color: #0284c7;
            display: block;
            margin-bottom: 5px;
          }
          .chemical-box {
            background: #f9f9f9;
            padding: 15px;
            margin: 10px 0;
            border: 1px solid #ddd;
            border-radius: 4px;
          }
          .chemical-box h4 {
            margin: 0 0 10px 0;
            color: #0284c7;
            font-size: 15px;
          }
          .chemical-box p {
            margin: 5px 0;
            font-size: 13px;
          }
          .notes-box {
            background: #fffbeb;
            border: 1px solid #fbbf24;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .notes-box h4 {
            margin: 0 0 10px 0;
            color: #92400e;
          }
          .notes-box ul {
            margin: 0;
            padding-left: 20px;
          }
          .notes-box li {
            margin: 5px 0;
            font-size: 13px;
            color: #92400e;
          }
          .footer {
            margin-top: 60px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            text-align: center;
            font-size: 12px;
            color: #666;
          }
          .footer p {
            margin: 8px 0;
          }
          .footer a {
            color: #0284c7;
            text-decoration: none;
          }
          .footer strong {
            font-size: 13px;
            color: #333;
          }
        </style>
      </head>
      <body>
        <!-- Header -->
        <div class="header">
          <div class="logo-section">
            <img src="${logoDataUrl}" alt="Logo" class="logo">
          </div>
          <div class="prepared-for">
            <strong>Prepared For</strong>
            <div style="font-size: 16px; font-weight: bold;">${data.customerName}</div>
          </div>
        </div>

        <div class="title">POOL VOLUME & CHEMICAL REPORT</div>

        <!-- Company Info & Report Details -->
        <div style="display: flex; justify-content: space-between;">
          <div class="company-info">
            <strong>A Quality Pool Company</strong>
            <div>Phone: (502) 706-9172</div>
            <div>Email: brookspumpingpoolco@gmail.com</div>
          </div>
          <div style="text-align: right; font-size: 14px;">
            <table style="float: right;">
              <tr><td style="padding: 4px 12px; text-align: right;"><strong>Report #</strong></td><td style="padding: 4px 0;">${reportNum}</td></tr>
              <tr><td style="padding: 4px 12px; text-align: right;"><strong>Date</strong></td><td style="padding: 4px 0;">${date}</td></tr>
              <tr><td style="padding: 4px 12px; text-align: right;"><strong>Business / Tax #</strong></td><td style="padding: 4px 0;">41-2763110</td></tr>
            </table>
          </div>
        </div>

        <!-- Customer Details -->
        <div class="meta-info">
          <div class="meta-left">
            <table>
              <tr><td><strong>Customer</strong></td><td>${data.customerName}</td></tr>
              ${data.customerPhone ? `<tr><td><strong>Phone</strong></td><td>${data.customerPhone}</td></tr>` : ''}
              ${data.customerEmail ? `<tr><td><strong>Email</strong></td><td>${data.customerEmail}</td></tr>` : ''}
            </table>
          </div>
          <div class="meta-right">
            <table>
              ${data.customerAddress ? `<tr><td><strong>Address</strong></td><td>${data.customerAddress}</td></tr>` : ''}
              <tr><td><strong>Pool Shape</strong></td><td>${capitalizeFirst(data.poolShape)}</td></tr>
              <tr><td><strong>Dimensions</strong></td><td>${data.dimensions}</td></tr>
            </table>
          </div>
        </div>

        <!-- Pool Volume -->
        <div class="section-title">Pool Volume</div>
        <div class="highlight-value">
          <span class="big">${data.gallons.toLocaleString()} gallons</span>
          <span style="color: #666;">(${data.liters.toLocaleString()} liters)</span>
        </div>

        <!-- Water Chemistry -->
        <div class="section-title">Current Water Chemistry</div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Parameter</th>
              <th>Current Reading</th>
              <th>Target Range</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>pH Level</strong></td>
              <td>${data.currentPH}</td>
              <td>7.2 - 7.8</td>
            </tr>
            <tr>
              <td><strong>Free Chlorine</strong></td>
              <td>${data.currentChlorine} ppm</td>
              <td>1.0 - 3.0 ppm</td>
            </tr>
            <tr>
              <td><strong>Total Alkalinity</strong></td>
              <td>${data.currentAlkalinity} ppm</td>
              <td>80 - 120 ppm</td>
            </tr>
          </tbody>
        </table>

        <!-- Chemical Recommendations -->
        <div class="section-title">Chemical Treatment Recommendations</div>
        ${generateSimpleChemicalsHTML(data.chemicals)}

        <!-- Service Actions Performed -->
        ${(data.chemicalsAdded || data.vacuumingDone || data.backwashDone || data.pumpBasketCleaned || data.skimmerBasketCleaned || data.poolBrushed || data.waterLevelChecked) ? `
        <div class="section-title">Service Actions Performed</div>
        <table class="data-table">
          <tbody>
            ${data.chemicalsAdded ? '<tr><td style="padding: 12px;"><strong>✓ Chemicals Added:</strong> Our team added the recommended chemicals to the pool</td></tr>' : ''}
            ${data.vacuumingDone ? '<tr><td style="padding: 12px;"><strong>✓ Vacuuming:</strong> Pool vacuuming service completed</td></tr>' : ''}
            ${data.backwashDone ? '<tr><td style="padding: 12px;"><strong>✓ Backwash:</strong> Filter backwash performed</td></tr>' : ''}
            ${data.pumpBasketCleaned ? '<tr><td style="padding: 12px;"><strong>✓ Pump Basket:</strong> Debris removed from pump basket</td></tr>' : ''}
            ${data.skimmerBasketCleaned ? '<tr><td style="padding: 12px;"><strong>✓ Skimmer Basket:</strong> Debris removed from skimmer basket(s)</td></tr>' : ''}
            ${data.poolBrushed ? '<tr><td style="padding: 12px;"><strong>✓ Pool Brushing:</strong> Pool walls and floor brushed to remove algae and debris</td></tr>' : ''}
            ${data.waterLevelChecked ? '<tr><td style="padding: 12px;"><strong>✓ Water Level:</strong> Pool water level checked and adjusted if needed</td></tr>' : ''}
          </tbody>
        </table>
        ` : ''}

        <!-- Equipment Inspection -->
        ${generateEquipmentInspectionHTML(data.equipment)}

        <!-- Additional Notes -->
        ${data.serviceNotes ? `
        <div class="section-title">Additional Notes & Observations</div>
        <div style="background: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-radius: 4px; margin: 15px 0;">
          <p style="margin: 0; white-space: pre-wrap; line-height: 1.6;">${data.serviceNotes}</p>
        </div>
        ` : ''}

        <!-- Safety Notes -->
        ${data.notes && data.notes.length > 0 ? `
        <div class="notes-box">
          <h4>⚠️ Important Safety & Application Notes</h4>
          <ul>
            ${data.notes.map(note => `<li>${note}</li>`).join('')}
          </ul>
        </div>
        ` : ''}

        <!-- Footer -->
        <div class="footer">
          <p><strong>We do everything with pools</strong></p>
          <p>Phone: (502) 706-9172 | Email: brookspumpingpoolco@gmail.com</p>
          <p><a href="https://share.google/hAHnIZO81Wl82hZut" target="_blank">Leave us a review →</a></p>
          <p style="margin-top: 15px; font-size: 10px; color: #999;">
            Report generated on ${date} at ${time}
          </p>
        </div>
      </body>
    </html>
  `;
  
  return html;
}

// Generate simple chemicals HTML for Joist-style report
function generateSimpleChemicalsHTML(chemicals) {
  if (!chemicals || Object.keys(chemicals).length === 0) {
    return '<p style="padding: 20px; text-align: center; color: #666;">No chemical adjustments needed. Pool chemistry is currently balanced.</p>';
  }
  
  let html = '';
  
  for (let chem in chemicals) {
    const c = chemicals[chem];
    html += `
      <div class="chemical-box">
        <h4>${c.product}</h4>
        <p><strong>Amount Required:</strong> ${c.amount}</p>
        <p><strong>Application:</strong> ${c.instruction}</p>
        ${c.frequency ? `<p><strong>Frequency:</strong> ${c.frequency}</p>` : ''}
      </div>
    `;
  }
  
  return html;
}

// Helper function to capitalize first letter
function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Generate equipment inspection summary for email
function generateEquipmentEmailSummary(equipment) {
  if (!equipment) return '';
  
  // Check if any issues found
  const hasIssues = equipment.pumpLeaking || equipment.motorNoise || equipment.motorHot || 
                    equipment.filterDirty || equipment.filterLeaking || equipment.pipesLeaking || 
                    equipment.wetGround || equipment.valvesStuck;
  
  const hasGoodConditions = equipment.pumpRunning || equipment.filterClean || equipment.pipesGood ||
                           equipment.heaterWorking || equipment.cleanerWorking || equipment.lightsWorking;
  
  const hasNotes = equipment.notes && equipment.notes.trim().length > 0;
  
  if (!hasIssues && !hasGoodConditions && !hasNotes) return '';
  
  let html = '<h3 style="color: #111827;">Equipment Inspection</h3>';
  
  if (hasIssues) {
    html += '<div style="background: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; border-radius: 4px; margin-bottom: 15px;">';
    html += '<strong style="color: #991b1b;">⚠️ Issues Found:</strong>';
    if (equipment.pumpLeaking) html += '<p style="margin: 5px 0; color: #991b1b;">• Pump leaking</p>';
    if (equipment.motorNoise) html += '<p style="margin: 5px 0; color: #991b1b;">• Unusual motor noise</p>';
    if (equipment.motorHot) html += '<p style="margin: 5px 0; color: #991b1b;">• Motor running hot</p>';
    if (equipment.filterDirty) html += '<p style="margin: 5px 0; color: #991b1b;">• Filter needs cleaning</p>';
    if (equipment.filterLeaking) html += '<p style="margin: 5px 0; color: #991b1b;">• Filter leaking</p>';
    if (equipment.pipesLeaking) html += '<p style="margin: 5px 0; color: #991b1b;">• Visible pipe leaks</p>';
    if (equipment.wetGround) html += '<p style="margin: 5px 0; color: #991b1b;">• Wet ground around equipment</p>';
    if (equipment.valvesStuck) html += '<p style="margin: 5px 0; color: #991b1b;">• Valves stuck or broken</p>';
    html += '</div>';
  }
  
  if (hasGoodConditions) {
    html += '<div style="background: #dcfce7; padding: 15px; border-radius: 4px; margin-bottom: 15px;">';
    html += '<strong style="color: #166534;">✅ Good Condition:</strong>';
    if (equipment.pumpRunning) html += '<p style="margin: 5px 0; color: #166534;">• Pump running properly</p>';
    if (equipment.filterClean) html += '<p style="margin: 5px 0; color: #166534;">• Filter clean / good pressure</p>';
    if (equipment.pipesGood) html += '<p style="margin: 5px 0; color: #166534;">• All pipes/connections good</p>';
    if (equipment.heaterWorking) html += '<p style="margin: 5px 0; color: #166534;">• Heater working</p>';
    if (equipment.cleanerWorking) html += '<p style="margin: 5px 0; color: #166534;">• Auto cleaner working</p>';
    if (equipment.lightsWorking) html += '<p style="margin: 5px 0; color: #166534;">• Pool lights working</p>';
    html += '</div>';
  }
  
  if (hasNotes) {
    html += `<div style="background: #fef3c7; padding: 15px; border-radius: 4px; margin-bottom: 15px;">
      <strong style="color: #92400e;">📋 Equipment Notes:</strong>
      <p style="margin: 5px 0; color: #78350f; white-space: pre-wrap;">${equipment.notes}</p>
    </div>`;
  }
  
  return html;
}

// Generate equipment inspection HTML for report
function generateEquipmentInspectionHTML(equipment) {
  if (!equipment) return '';
  
  // Check if any equipment data was filled out
  const hasData = equipment.pumpRunning || equipment.pumpLeaking || equipment.motorNoise || 
                  equipment.motorHot || equipment.filterClean || equipment.filterDirty || 
                  equipment.filterLeaking || equipment.pipesGood || equipment.pipesLeaking || 
                  equipment.wetGround || equipment.valvesStuck || equipment.heaterWorking || 
                  equipment.cleanerWorking || equipment.lightsWorking || 
                  (equipment.notes && equipment.notes.trim().length > 0);
  
  if (!hasData) return ''; // Don't show section if nothing was checked
  
  let html = '<div class="section-title">Equipment Inspection</div>';
  
  // Pump & Motor
  if (equipment.pumpRunning || equipment.pumpLeaking || equipment.motorNoise || equipment.motorHot) {
    html += '<h3 style="font-size: 16px; font-weight: 700; color: #0284c7; margin: 20px 0 10px 0;">🔧 Pump & Motor</h3>';
    html += '<table class="data-table"><tbody>';
    if (equipment.pumpRunning) html += '<tr><td style="padding: 10px;">✅ Pump running properly</td></tr>';
    if (equipment.pumpLeaking) html += '<tr><td style="padding: 10px; background: #fee2e2; color: #991b1b;"><strong>⚠️ Pump leaking</strong></td></tr>';
    if (equipment.motorNoise) html += '<tr><td style="padding: 10px; background: #fee2e2; color: #991b1b;"><strong>⚠️ Unusual motor noise</strong></td></tr>';
    if (equipment.motorHot) html += '<tr><td style="padding: 10px; background: #fee2e2; color: #991b1b;"><strong>⚠️ Motor running hot</strong></td></tr>';
    html += '</tbody></table>';
  }
  
  // Filter System
  if (equipment.filterClean || equipment.filterDirty || equipment.filterLeaking) {
    html += '<h3 style="font-size: 16px; font-weight: 700; color: #0284c7; margin: 20px 0 10px 0;">🌀 Filter System</h3>';
    html += '<table class="data-table"><tbody>';
    if (equipment.filterClean) html += '<tr><td style="padding: 10px;">✅ Filter clean / good pressure</td></tr>';
    if (equipment.filterDirty) html += '<tr><td style="padding: 10px; background: #fef3c7; color: #92400e;"><strong>⚠️ Filter needs cleaning</strong></td></tr>';
    if (equipment.filterLeaking) html += '<tr><td style="padding: 10px; background: #fee2e2; color: #991b1b;"><strong>⚠️ Filter leaking</strong></td></tr>';
    html += '</tbody></table>';
  }
  
  // Pipes & Plumbing
  if (equipment.pipesGood || equipment.pipesLeaking || equipment.wetGround || equipment.valvesStuck) {
    html += '<h3 style="font-size: 16px; font-weight: 700; color: #0284c7; margin: 20px 0 10px 0;">🔩 Pipes & Plumbing</h3>';
    html += '<table class="data-table"><tbody>';
    if (equipment.pipesGood) html += '<tr><td style="padding: 10px;">✅ All pipes/connections good</td></tr>';
    if (equipment.pipesLeaking) html += '<tr><td style="padding: 10px; background: #fee2e2; color: #991b1b;"><strong>⚠️ Visible pipe leaks</strong></td></tr>';
    if (equipment.wetGround) html += '<tr><td style="padding: 10px; background: #fee2e2; color: #991b1b;"><strong>⚠️ Wet ground / grass around equipment</strong></td></tr>';
    if (equipment.valvesStuck) html += '<tr><td style="padding: 10px; background: #fee2e2; color: #991b1b;"><strong>⚠️ Valves stuck or broken</strong></td></tr>';
    html += '</tbody></table>';
  }
  
  // Other Equipment
  if (equipment.heaterWorking || equipment.cleanerWorking || equipment.lightsWorking) {
    html += '<h3 style="font-size: 16px; font-weight: 700; color: #0284c7; margin: 20px 0 10px 0;">⚡ Other Equipment</h3>';
    html += '<table class="data-table"><tbody>';
    if (equipment.heaterWorking) html += '<tr><td style="padding: 10px;">✅ Heater working</td></tr>';
    if (equipment.cleanerWorking) html += '<tr><td style="padding: 10px;">✅ Auto cleaner working</td></tr>';
    if (equipment.lightsWorking) html += '<tr><td style="padding: 10px;">✅ Pool lights working</td></tr>';
    html += '</tbody></table>';
  }
  
  // Equipment Notes
  if (equipment.notes && equipment.notes.trim().length > 0) {
    html += `
      <div style="background: #fffbeb; border: 2px solid #fbbf24; padding: 15px; border-radius: 4px; margin: 15px 0;">
        <h4 style="margin: 0 0 10px 0; color: #92400e;">📋 Equipment Notes</h4>
        <p style="margin: 0; white-space: pre-wrap; line-height: 1.6; color: #78350f;">${equipment.notes}</p>
      </div>
    `;
  }
  
  return html;
}

// Upload image to Drive (in customer folder)
function uploadImageToDrive(imageData, customerName, customerAddress) {
  try {
    const mainFolder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    
    // Get or create customer folder
    const customerFolderName = `${customerName} - ${customerAddress || 'No Address'}`;
    const customerFolder = getOrCreateFolder(mainFolder, customerFolderName);
    
    const fileName = `Pool Photo - ${customerName} - ${new Date().toLocaleDateString()}.jpg`;
    
    // Decode base64 image
    const imageBlob = Utilities.newBlob(
      Utilities.base64Decode(imageData.split(',')[1]),
      'image/jpeg',
      fileName
    );
    
    // Save to Google Drive
    const file = customerFolder.createFile(imageBlob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return {
      success: true,
      fileUrl: file.getUrl(),
      fileName: fileName
    };
  } catch (error) {
    Logger.log('Error uploading image: ' + error);
    return {
      success: false,
      error: error.toString()
    };
  }
}

// ==================== COMPANY AUTHENTICATION ====================

/**
 * Check if user is an admin
 */
function isAdmin(email) {
  const adminEmail = 'samr@aqualitypoolcompanyusa.com';
  return email && email.toLowerCase().trim() === adminEmail.toLowerCase();
}

/**
 * Get Company ID for a user from Authentication sheet
 */
function getCompanyIdForUser(email) {
  try {
    const cleanEmail = email ? email.toString().trim().toLowerCase() : '';
    
    if (!cleanEmail) {
      return { success: false, error: 'Email parameter is required' };
    }
    
    // Admin defaults to main company
    if (isAdmin(cleanEmail)) {
      return { success: true, companyId: 'CMP-AQUALITYPOOL', isAdmin: true };
    }
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = ss.getSheetByName(AUTH_SHEET_NAME);
    
    if (!authSheet) {
      return { success: false, error: 'Authentication sheet not found' };
    }
    
    const data = authSheet.getDataRange().getValues();
    if (data.length < 2) {
      return { success: false, error: 'Authentication sheet is empty' };
    }
    
    const headers = data[0];
    const emailCol = headers.indexOf('Email');
    const companyIdCol = headers.indexOf('Company ID');
    
    if (emailCol === -1 || companyIdCol === -1) {
      return { success: false, error: 'Required columns not found' };
    }
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][emailCol] && data[i][emailCol].toString().toLowerCase().trim() === cleanEmail) {
        const companyId = data[i][companyIdCol];
        if (!companyId) {
          return { success: false, error: 'Company ID not set for this user' };
        }
        return { success: true, companyId: companyId, isAdmin: false };
      }
    }
    
    return { success: false, error: 'User not found: ' + cleanEmail };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * Get Square settings for a company from Settings column in Authentication sheet
 * Settings are stored as JSON in the Settings column
 */
function getSquareSettings(companyId) {
  try {
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
    
    if (companyIdCol === -1) {
      return { success: false, error: 'Company ID column not found in Authentication sheet' };
    }
    
    if (settingsCol === -1) {
      return { success: false, error: 'Settings column not found in Authentication sheet' };
    }
    
    // Find company's row (data starts at row 3, index 2)
    for (let i = 2; i < data.length; i++) {
      if (data[i][companyIdCol] === companyId) {
        const settingsStr = data[i][settingsCol] || '{}';
        let settings = {};
        
        try {
          settings = JSON.parse(settingsStr);
        } catch (e) {
          Logger.log('Error parsing settings JSON for ' + companyId + ': ' + e);
          settings = {};
        }
        
        // Check if Square settings exist
        if (settings.square && settings.square.enabled) {
          const accessToken = settings.square.accessToken;
          const appId = settings.square.applicationId;
          const environment = settings.square.environment || 'production';
          
          if (!accessToken || !appId) {
            return { success: false, error: 'Square credentials incomplete for this company' };
          }
          
          return {
            success: true,
            accessToken: accessToken,
            applicationId: appId,
            environment: environment,
            lastSync: settings.square.lastSync || null,
            apiUrl: environment === 'sandbox' 
              ? 'https://connect.squareupsandbox.com/v2'
              : 'https://connect.squareup.com/v2'
          };
        } else {
          return { success: false, error: 'Square integration not enabled for this company' };
        }
      }
    }
    
    return { success: false, error: 'Company not found: ' + companyId };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// ==================== CUSTOMER MANAGEMENT ====================

/**
 * Get customers - wrapper function for UI (uses active user's email)
 * This is called from the UI without parameters
 */
function getSquareCustomers() {
  try {
    const userEmail = Session.getActiveUser().getEmail();
    if (!userEmail) {
      return { success: false, error: 'Unable to determine user email. Please ensure you are logged in.' };
    }
    return getCustomersFromSheet(userEmail);
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function createCustomerInSheet(customerData, email) {
  try {
    const safeCustomerData = customerData || {};
    const userEmail = email || getActiveUserEmail_();

    if (!userEmail) {
      return { success: false, error: 'Unable to determine user email.' };
    }

    const name = (safeCustomerData.name || '').toString().trim();
    const customerEmail = (safeCustomerData.email || '').toString().trim();
    const phone = (safeCustomerData.phone || '').toString().trim();
    const address = (safeCustomerData.address || '').toString().trim();
    const city = (safeCustomerData.city || '').toString().trim();
    const state = (safeCustomerData.state || '').toString().trim();
    const zipCode = (safeCustomerData.zipCode || safeCustomerData.zip || '').toString().trim();
    const notes = (safeCustomerData.notes || 'Created via Pool Calculator').toString().trim();

    if (!name) {
      return { success: false, error: 'Customer name is required.' };
    }

    const companyResult = getCompanyIdForUser(userEmail);
    if (!companyResult.success) {
      return companyResult;
    }

    const companyId = companyResult.companyId;
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const customersSheet = ss.getSheetByName(CUSTOMERS_SHEET_NAME);

    if (!customersSheet) {
      return { success: false, error: 'Customers sheet not found' };
    }

    const data = customersSheet.getDataRange().getValues();
    const headers = data.length > 0 ? data[0] : [];
    const headerIndex = {};
    headers.forEach(function(header, index) {
      headerIndex[String(header || '').trim()] = index;
    });

    const existingCustomers = getCustomersFromSheet(userEmail);
    if (existingCustomers.success) {
      const duplicate = existingCustomers.customers.find(function(customer) {
        const existingEmail = (customer.email || '').toLowerCase().trim();
        const newEmail = customerEmail.toLowerCase().trim();
        const sameEmail = existingEmail && newEmail && existingEmail === newEmail;
        const sameNameAndPhone =
          (customer.name || '').toLowerCase().trim() === name.toLowerCase().trim() &&
          (customer.phone || '').trim() &&
          (customer.phone || '').trim() === phone;

        return sameEmail || sameNameAndPhone;
      });

      if (duplicate) {
        return {
          success: true,
          customerId: duplicate.id || '',
          customer: duplicate,
          duplicate: true
        };
      }
    }

    const row = new Array(Math.max(headers.length, 15)).fill('');
    const now = new Date().toISOString();
    const customerId = 'CUST-' + Utilities.getUuid().substring(0, 8).toUpperCase();

    function setIfPresent(columnName, value) {
      if (headerIndex[columnName] !== undefined) {
        row[headerIndex[columnName]] = value;
      }
    }

    setIfPresent('Company ID', companyId);
    setIfPresent('Customer ID', customerId);
    setIfPresent('Name', name);
    setIfPresent('Email', customerEmail);
    setIfPresent('Phone', phone);
    setIfPresent('Address', address);
    setIfPresent('City', city);
    setIfPresent('State', state);
    setIfPresent('Zip Code', zipCode);
    setIfPresent('Notes', notes);
    setIfPresent('Created At', now);
    setIfPresent('Updated At', now);
    setIfPresent('Pool Data JSON', '{}');
    setIfPresent('Service Data JSON', '{}');
    setIfPresent('Custom Data JSON', '{}');

    customersSheet.appendRow(row);

    const fullAddress = [address, city, state, zipCode].filter(Boolean).join(', ');
    return {
      success: true,
      customerId: customerId,
      customer: {
        id: customerId,
        name: name,
        email: customerEmail,
        phone: phone,
        address: fullAddress,
        source: 'sheet'
      }
    };
  } catch (error) {
    Logger.log('Error creating customer in sheet: ' + error);
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Get customers from Customers sheet filtered by Company ID
 * This is the PRIMARY source - Square is optional
 */
function getCustomersFromSheet(email) {
  try {
    // Get company ID
    const companyResult = getCompanyIdForUser(email);
    if (!companyResult.success) {
      return companyResult;
    }
    
    const companyId = companyResult.companyId;
    const isAdminUser = companyResult.isAdmin;
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const customersSheet = ss.getSheetByName(CUSTOMERS_SHEET_NAME);
    
    if (!customersSheet) {
      return { success: false, error: 'Customers sheet not found' };
    }
    
    const data = customersSheet.getDataRange().getValues();
    if (data.length < 2) {
      return { success: true, customers: [] };
    }
    
    const headers = data[0];
    const companyIdCol = headers.indexOf('Company ID');
    const customerIdCol = headers.indexOf('Customer ID');
    const nameCol = headers.indexOf('Name');
    const emailCol = headers.indexOf('Email');
    const phoneCol = headers.indexOf('Phone');
    const addressCol = headers.indexOf('Address');
    const cityCol = headers.indexOf('City');
    const stateCol = headers.indexOf('State');
    const zipCol = headers.indexOf('Zip Code');
    
    if (companyIdCol === -1 || nameCol === -1) {
      return { success: false, error: 'Required columns not found in Customers sheet' };
    }
    
    const customers = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      
      // Filter by company ID (admin sees all)
      if (isAdminUser || row[companyIdCol] === companyId) {
        const name = row[nameCol] || '';
        const customerEmail = emailCol !== -1 ? (row[emailCol] || '') : '';
        const phone = phoneCol !== -1 ? (row[phoneCol] || '') : '';
        const address = addressCol !== -1 ? (row[addressCol] || '') : '';
        const city = cityCol !== -1 ? (row[cityCol] || '') : '';
        const state = stateCol !== -1 ? (row[stateCol] || '') : '';
        const zip = zipCol !== -1 ? (row[zipCol] || '') : '';
        
        const fullAddress = [address, city, state, zip].filter(x => x).join(', ');
        
        customers.push({
          id: customerIdCol !== -1 ? (row[customerIdCol] || '') : '',
          name: name,
          email: customerEmail,
          phone: phone,
          address: fullAddress,
          source: 'sheet'
        });
      }
    }
    
    return {
      success: true,
      customers: customers
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * Import Square customers into Customers sheet
 * This syncs Square customers into the local sheet for offline access
 */
function importSquareCustomers(email) {
  try {
    // Get company ID
    const companyResult = getCompanyIdForUser(email);
    if (!companyResult.success) {
      return companyResult;
    }
    
    const companyId = companyResult.companyId;
    
    // Get Square settings
    const squareSettings = getSquareSettings(companyId);
    if (!squareSettings.success) {
      return { success: false, error: 'Square integration not configured for your company' };
    }
    
    // Fetch customers from Square
    const squareResult = getSquareCustomersWithSettings(squareSettings);
    if (!squareResult.success) {
      return squareResult;
    }
    
    // Import into Customers sheet
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const customersSheet = ss.getSheetByName(CUSTOMERS_SHEET_NAME);
    
    if (!customersSheet) {
      return { success: false, error: 'Customers sheet not found' };
    }
    
    const now = new Date().toISOString();
    let imported = 0;
    let skipped = 0;
    
    // Get existing customers to avoid duplicates
    const existingResult = getCustomersFromSheet(email);
    const existingEmails = existingResult.success 
      ? existingResult.customers.map(c => c.email.toLowerCase().trim())
      : [];
    
    squareResult.customers.forEach(customer => {
      const customerEmail = (customer.email || '').toLowerCase().trim();
      
      // Skip if already exists
      if (customerEmail && existingEmails.includes(customerEmail)) {
        skipped++;
        return;
      }
      
      // Generate customer ID
      const customerId = 'CUST-' + Utilities.getUuid().substring(0, 8).toUpperCase();
      
      // Add to sheet
      const newRow = [
        companyId,
        customerId,
        customer.name || '',
        customer.email || '',
        customer.phone || '',
        customer.address || '',
        '', // city
        '', // state
        '', // zip
        'Imported from Square', // notes
        now,
        now,
        '{}', // Pool Data JSON
        '{}', // Service Data JSON
        '{}' // Custom Data JSON
      ];
      
      customersSheet.appendRow(newRow);
      imported++;
    });
    
    // Update last sync date in Settings
    updateLastSyncDate(companyId);
    
    return {
      success: true,
      imported: imported,
      skipped: skipped,
      message: `Imported ${imported} customers, skipped ${skipped} duplicates`
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * Update last sync date in Settings column of Authentication sheet
 */
function updateLastSyncDate(companyId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const authSheet = ss.getSheetByName(AUTH_SHEET_NAME);
    
    if (!authSheet) return;
    
    const data = authSheet.getDataRange().getValues();
    const headers = data[1]; // Row 2 has headers
    const companyIdCol = headers.indexOf('Company ID');
    const settingsCol = headers.indexOf('Settings');
    
    if (companyIdCol === -1 || settingsCol === -1) return;
    
    for (let i = 2; i < data.length; i++) {
      if (data[i][companyIdCol] === companyId) {
        const settingsStr = data[i][settingsCol] || '{}';
        let settings = {};
        
        try {
          settings = JSON.parse(settingsStr);
        } catch (e) {
          settings = {};
        }
        
        // Update last sync date
        if (!settings.square) {
          settings.square = {};
        }
        settings.square.lastSync = new Date().toISOString();
        
        // Save back to sheet (row i is already the 1-based row number)
        authSheet.getRange(i + 1, settingsCol + 1).setValue(JSON.stringify(settings));
        Logger.log('Updated last sync date for ' + companyId);
        break;
      }
    }
  } catch (error) {
    Logger.log('Error updating last sync date: ' + error);
  }
}

// ==================== SQUARE API INTEGRATION (OPTIONAL) ====================

/**
 * Fetch customers from Square using company-specific settings
 */
function getSquareCustomersWithSettings(squareSettings) {
  Logger.log('========== STARTING getSquareCustomersWithSettings ==========');
  
  try {
    const accessToken = squareSettings.accessToken;
    const apiUrl = squareSettings.apiUrl;
    
    Logger.log('Square Access Token (first 10 chars): ' + accessToken.substring(0, 10) + '...');
    Logger.log('Square API Version: ' + SQUARE_API_VERSION);
    Logger.log('Square Environment: ' + squareSettings.environment);
    
    const url = apiUrl + '/customers/search';
    Logger.log('API URL: ' + url);
    
    const payload = {
      limit: 100, // Fetch up to 100 customers
      query: {
        sort: {
          field: 'CREATED_AT',
          order: 'DESC'
        }
      }
    };
    Logger.log('Request Payload: ' + JSON.stringify(payload));
    
    const options = {
      method: 'post',
      headers: {
        'Square-Version': SQUARE_API_VERSION,
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    Logger.log('Making API request to Square...');
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    Logger.log('Response Code: ' + responseCode);
    Logger.log('Response Body: ' + responseText);
    
    const result = JSON.parse(responseText);
    
    if (responseCode === 200 && result.customers) {
      Logger.log('SUCCESS! Found ' + result.customers.length + ' customers');
      
      // Format customer data for dropdown
      const customers = result.customers.map(customer => {
        Logger.log('Processing customer: ' + JSON.stringify(customer));
        return {
          id: customer.id,
          name: `${customer.given_name || ''} ${customer.family_name || ''}`.trim() || customer.email_address || 'Unknown',
          email: customer.email_address || '',
          phone: customer.phone_number || '',
          address: formatSquareAddress(customer.address)
        };
      });
      
      Logger.log('Formatted ' + customers.length + ' customers for return');
      Logger.log('========== END getSquareCustomers (SUCCESS) ==========');
      
      return {
        success: true,
        customers: customers
      };
    } else {
      Logger.log('ERROR: Response code is not 200 or no customers found');
      Logger.log('Result errors: ' + JSON.stringify(result.errors));
      Logger.log('========== END getSquareCustomers (FAILED) ==========');
      
      return {
        success: false,
        error: result.errors ? result.errors[0].detail : 'Failed to fetch customers'
      };
    }
  } catch (error) {
    Logger.log('EXCEPTION caught: ' + error);
    Logger.log('Error stack: ' + error.stack);
    Logger.log('========== END getSquareCustomers (EXCEPTION) ==========');
    
    return {
      success: false,
      error: error.toString()
    };
  }
}

// Search Square customers by name
function searchSquareCustomers(searchQuery) {
  try {
    const url = getSquareApiUrl() + '/customers/search';
    
    const payload = {
      limit: 50,
      query: {
        filter: {
          text: {
            value: searchQuery
          }
        }
      }
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
    
    if (response.getResponseCode() === 200 && result.customers) {
      const customers = result.customers.map(customer => ({
        id: customer.id,
        name: `${customer.given_name || ''} ${customer.family_name || ''}`.trim() || customer.email_address,
        email: customer.email_address || '',
        phone: customer.phone_number || '',
        address: formatSquareAddress(customer.address)
      }));
      
      return {
        success: true,
        customers: customers
      };
    } else {
      return {
        success: true,
        customers: []
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Main function to get all customers for a user
 * Returns customers from Customers sheet (primary source)
 */
function getAllCustomers(email) {
  return getCustomersFromSheet(email);
}

/**
 * Check if company has Square integration enabled
 */
function hasSquareIntegration(email) {
  try {
    const companyResult = getCompanyIdForUser(email);
    if (!companyResult.success) {
      return { success: false, enabled: false };
    }
    
    const squareSettings = getSquareSettings(companyResult.companyId);
    return {
      success: true,
      enabled: squareSettings.success,
      lastSync: squareSettings.lastSync || null
    };
  } catch (error) {
    return { success: false, enabled: false, error: error.toString() };
  }
}

// ==================== LEGACY SQUARE FUNCTIONS (for backwards compatibility) ====================

// Get specific customer details (uses default/fallback settings)
function getSquareCustomer(customerId) {
  try {
    const url = 'https://connect.squareup.com/v2' + `/customers/${customerId}`;
    
    const options = {
      method: 'get',
      headers: {
        'Square-Version': SQUARE_API_VERSION,
        'Authorization': 'Bearer ' + DEFAULT_SQUARE_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    
    if (response.getResponseCode() === 200 && result.customer) {
      const customer = result.customer;
      return {
        success: true,
        customer: {
          id: customer.id,
          name: `${customer.given_name || ''} ${customer.family_name || ''}`.trim(),
          email: customer.email_address || '',
          phone: customer.phone_number || '',
          address: formatSquareAddress(customer.address),
          notes: customer.note || ''
        }
      };
    } else {
      return {
        success: false,
        error: 'Customer not found'
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error.toString()
    };
  }
}

// Helper function to format Square address
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

// Backward-compatible wrapper: customer creation now writes to Customers sheet.
function createSquareCustomer(customerData) {
  return createCustomerInSheet(customerData, getActiveUserEmail_());
}

// ==================== JOB CREATION ====================

/**
 * Create a job in the Jobs sheet when a pool calculator report is saved
 * This links the service call/report to the job tracking system
 */
function createJobFromReport(reportData, reportUrl) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let jobsSheet = spreadsheet.getSheetByName(JOBS_SHEET_NAME);
    
    // If jobs sheet doesn't exist, try to create it (or return error)
    if (!jobsSheet) {
      Logger.log('⚠️ Jobs sheet not found. Job will not be created.');
      return {
        success: false,
        error: 'Jobs sheet not found. Please run setupJobsSheet() in AuthenticationScript first.'
      };
    }
    
    // Generate unique Job ID
    const jobId = 'JOB-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const now = new Date();
    
    // Build service type from actions performed
    let serviceType = 'Pool Service';
    const services = [];
    if (reportData.chemicalsAdded) services.push('Chemicals');
    if (reportData.vacuumingDone) services.push('Vacuuming');
    if (reportData.backwashDone) services.push('Backwash');
    if (reportData.pumpBasketCleaned) services.push('Pump Basket');
    if (reportData.skimmerBasketCleaned) services.push('Skimmer Basket');
    if (reportData.poolBrushed) services.push('Brushing');
    if (reportData.waterLevelChecked) services.push('Water Level');
    
    if (services.length > 0) {
      serviceType = 'Pool Service - ' + services.join(', ');
    }
    
    // Build notes with report link and service details
    let notes = `Pool Volume: ${reportData.gallons.toLocaleString()} gallons\n`;
    notes += `Pool Shape: ${reportData.poolShape} | ${reportData.dimensions}\n`;
    notes += `Report: ${reportUrl}\n`;
    if (reportData.serviceNotes) {
      notes += `\nService Notes: ${reportData.serviceNotes}`;
    }
    
    // Prepare job row (matching AuthenticationScript format)
    const newJob = [
      jobId,                                    // A: Job ID
      reportData.customerName || '',            // B: Customer Name
      reportData.customerEmail || '',           // C: Customer Email
      reportData.customerPhone || '',           // D: Customer Phone
      serviceType,                              // E: Service Type
      'Completed',                              // F: Status (service already performed)
      now,                                      // G: Scheduled Date (use today)
      '',                                       // H: Scheduled Time
      '',                                       // I: Assigned To
      reportData.customerAddress || '',         // J: Address
      notes,                                    // K: Notes (includes report link)
      now,                                      // L: Created Date
      now,                                      // M: Completed Date (service already done)
      '',                                       // N: Invoice Amount
      'Pending'                                 // O: Invoice Status
    ];
    
    jobsSheet.appendRow(newJob);
    const rowIndex = jobsSheet.getLastRow();
    
    Logger.log('✅ Job created from pool report: ' + jobId + ' in row ' + rowIndex);
    
    return {
      success: true,
      jobId: jobId,
      rowIndex: rowIndex
    };
  } catch (error) {
    Logger.log('❌ Error creating job from report: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

// ==================== TEST FUNCTIONS ====================
// Run these functions from the script editor to test

/**
 * TEST FUNCTION: Run this to test Square customer loading
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
 * TEST FUNCTION: Test adding a customer to Square
 */
function testAddCustomer() {
  Logger.log('====================================');
  Logger.log('TESTING ADD CUSTOMER TO SQUARE');
  Logger.log('====================================\n');
  
  const testCustomer = {
    name: 'Test Customer ' + Date.now(),
    email: 'test@example.com',
    phone: '5555555555',
    address: '123 Test St, Louisville, KY'
  };
  
  Logger.log('Adding test customer: ' + JSON.stringify(testCustomer));
  
  const result = createSquareCustomer(testCustomer);
  
  Logger.log('\n====================================');
  Logger.log('RESULT:');
  Logger.log(JSON.stringify(result, null, 2));
  Logger.log('====================================');
  
  return result;
}

/**
 * TEST FUNCTION: Check configuration
 */
function testConfiguration() {
  Logger.log('====================================');
  Logger.log('CONFIGURATION CHECK');
  Logger.log('====================================\n');
  
  Logger.log('✓ Default Square Access Token: ' + (DEFAULT_SQUARE_ACCESS_TOKEN ? DEFAULT_SQUARE_ACCESS_TOKEN.substring(0, 15) + '...' : 'NOT SET'));
  Logger.log('✓ Square API Version: ' + SQUARE_API_VERSION);
  Logger.log('✓ Drive Folder ID: ' + DRIVE_FOLDER_ID);
  Logger.log('✓ Notification Email: ' + NOTIFICATION_EMAIL);
  Logger.log('✓ Twilio Account SID: ' + (TWILIO_ACCOUNT_SID && TWILIO_ACCOUNT_SID !== 'YOUR_TWILIO_ACCOUNT_SID_HERE' ? TWILIO_ACCOUNT_SID.substring(0, 10) + '...' : 'NOT CONFIGURED'));
  Logger.log('✓ Twilio Phone: ' + (TWILIO_PHONE_NUMBER && TWILIO_PHONE_NUMBER !== 'YOUR_TWILIO_PHONE_NUMBER' ? TWILIO_PHONE_NUMBER : 'NOT CONFIGURED'));
  
  Logger.log('\n====================================');
  Logger.log('Testing API connectivity...');
  Logger.log('====================================\n');
  
  // Try a simple API call
  try {
    const url = 'https://connect.squareup.com/v2' + '/locations';
    const options = {
      method: 'get',
      headers: {
        'Square-Version': SQUARE_API_VERSION,
        'Authorization': 'Bearer ' + DEFAULT_SQUARE_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();
    
    Logger.log('API Response Code: ' + code);
    
    if (code === 200) {
      Logger.log('✅ API Connection Successful!');
      const result = JSON.parse(response.getContentText());
      Logger.log('Locations found: ' + (result.locations ? result.locations.length : 0));
    } else {
      Logger.log('❌ API Connection Failed');
      Logger.log('Response: ' + response.getContentText());
    }
  } catch (error) {
    Logger.log('❌ Error: ' + error);
  }
}

/**
 * TEST FUNCTION: Test Twilio SMS sending
 * Update the phone number below to YOUR phone, then run this function
 */
function testTwilioSMS() {
  Logger.log('====================================');
  Logger.log('TESTING TWILIO SMS');
  Logger.log('====================================\n');
  
  // ⚠️ CHANGE THIS TO YOUR PHONE NUMBER
  const testPhoneNumber = '5027069172'; // Your phone number
  const testCustomerName = 'Test Customer';
  const testReportUrl = 'https://drive.google.com/test-report';
  
  Logger.log('Sending test SMS to: ' + testPhoneNumber);
  Logger.log('Customer Name: ' + testCustomerName);
  Logger.log('Report URL: ' + testReportUrl);
  
  const result = sendSMS(testPhoneNumber, testCustomerName, testReportUrl);
  
  Logger.log('\n====================================');
  Logger.log('RESULT:');
  Logger.log(JSON.stringify(result, null, 2));
  Logger.log('====================================');
  
  if (result.success) {
    Logger.log('\n✅ SUCCESS! Check your phone for the text message!');
    Logger.log('Message SID: ' + result.messageSid);
    Logger.log('Status: ' + result.status);
  } else {
    Logger.log('\n❌ FAILED! Error: ' + result.error);
    Logger.log('\n💡 Troubleshooting:');
    Logger.log('1. Check that you added your Twilio credentials at the top of this script');
    Logger.log('2. Verify your Auth Token is correct (no extra spaces)');
    Logger.log('3. Make sure your Twilio phone number includes +1 (example: +15027069172)');
    Logger.log('4. Check your Twilio account has credits remaining');
  }
  
  return result;
}


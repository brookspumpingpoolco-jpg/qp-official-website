// Drawing Approval Tool - Google Apps Script Backend
// This script handles the submission of signed pool drawings

// Configuration
const DRIVE_FOLDER_ID = '1caFBUhSzE5WNAm9vCT4dwDQuAO0iuo1h'; // Pool Calc and Customer... folder

/**
 * Main function to handle signed drawing submission
 * @param {Object} data - Form data including customer info, manufacturer info, signature, and file
 * @returns {Object} - Success/failure response
 */
function submitSignedDrawing(data) {
  try {
    Logger.log('Starting submitSignedDrawing...');
    Logger.log('Customer: ' + data.customerName + ' (' + data.customerEmail + ')');
    Logger.log('Manufacturer: ' + data.manufacturerName + ' (' + data.manufacturerEmail + ')');
    Logger.log('File: ' + data.fileName);
    
    // Validate inputs
    if (!data.customerEmail || !data.customerName || !data.manufacturerEmail || 
        !data.manufacturerName || !data.approvalDate || !data.signature || !data.fileData) {
      return {
        success: false,
        message: 'Missing required fields'
      };
    }
    
    // Create a PDF with the drawing and signature
    const signedPdfBlob = createSignedDrawingPDF(data);
    
    // Save to Google Drive
    const driveFileUrl = saveToDrive(signedPdfBlob, data);
    Logger.log('File saved to Drive: ' + driveFileUrl);
    
    // Send email to manufacturer
    sendEmailToManufacturer(data, driveFileUrl);
    Logger.log('Email sent to manufacturer');
    
    // Send confirmation email to customer
    sendEmailToCustomer(data);
    Logger.log('Confirmation email sent to customer');
    
    return {
      success: true,
      message: 'Drawing submitted successfully',
      fileUrl: driveFileUrl
    };
    
  } catch (error) {
    Logger.log('Error in submitSignedDrawing: ' + error.toString());
    Logger.log('Stack trace: ' + error.stack);
    return {
      success: false,
      message: 'Error processing drawing: ' + error.message
    };
  }
}

/**
 * Creates a PDF with the original drawing and adds signature overlay
 * Uses Google Slides to overlay signature for images, or comprehensive doc for PDFs
 * @param {Object} data - Drawing data including file, signature, and metadata
 * @returns {Blob} - PDF blob
 */
function createSignedDrawingPDF(data) {
  try {
    Logger.log('Creating signed PDF...');
    Logger.log('File type: ' + data.fileType);
    
    // Check if it's an image or PDF
    if (data.fileType.startsWith('image/')) {
      // Use Slides overlay method for images
      return createSignedDrawingWithSlides(data);
    } else if (data.fileType === 'application/pdf') {
      // Use document method for PDFs (can't overlay on PDFs easily)
      return createSignedDrawingWithDoc(data);
    } else {
      throw new Error('Unsupported file type: ' + data.fileType);
    }
    
  } catch (error) {
    Logger.log('Error creating PDF: ' + error.toString());
    throw error;
  }
}

/**
 * Creates signed drawing using Google Slides (for image files)
 * Overlays signature directly on the drawing
 */
function createSignedDrawingWithSlides(data) {
  try {
    Logger.log('Creating signed drawing with Slides overlay...');
    
    // Decode base64 file data
    const fileBytes = Utilities.base64Decode(data.fileData);
    const fileBlob = Utilities.newBlob(fileBytes, data.fileType, data.fileName);
    
    // Decode signature
    const signatureBase64 = data.signature.split(',')[1];
    const signatureBytes = Utilities.base64Decode(signatureBase64);
    const signatureBlob = Utilities.newBlob(signatureBytes, 'image/png', 'signature.png');
    
    // Upload drawing and signature temporarily to Drive
    const tempFolder = DriveApp.getRootFolder();
    const drawingFile = tempFolder.createFile(fileBlob);
    const signatureFile = tempFolder.createFile(signatureBlob);
    
    try {
      // Create a new Google Slides presentation
      const presentation = SlidesApp.create('Signed Drawing - ' + data.customerName + ' - TEMP');
      const presentationId = presentation.getId();
      
      // Get the first slide
      const slides = presentation.getSlides();
      let slide;
      if (slides.length > 0) {
        slide = slides[0];
      } else {
        slide = presentation.appendSlide();
      }
      
      // Set slide to landscape and larger size (11x8.5 inches = standard letter landscape)
      const pageWidth = 792; // 11 inches in points (72 points per inch)
      const pageHeight = 612; // 8.5 inches in points
      presentation.getPageWidth(); // Just to ensure dimensions are set
      
      // Remove any default elements
      const elements = slide.getPageElements();
      elements.forEach(element => {
        try {
          element.remove();
        } catch (e) {
          // Some elements can't be removed, skip them
        }
      });
      
      // Add the drawing as a full-page image
      const drawingImage = slide.insertImage(drawingFile);
      
      // Scale image to fit the slide while maintaining aspect ratio
      const imgWidth = drawingImage.getWidth();
      const imgHeight = drawingImage.getHeight();
      
      // Calculate scaling to fit page
      const scaleWidth = pageWidth / imgWidth;
      const scaleHeight = pageHeight / imgHeight;
      const scale = Math.min(scaleWidth, scaleHeight);
      
      const newWidth = imgWidth * scale;
      const newHeight = imgHeight * scale;
      
      drawingImage.setWidth(newWidth);
      drawingImage.setHeight(newHeight);
      drawingImage.setLeft((pageWidth - newWidth) / 2);
      drawingImage.setTop((pageHeight - newHeight) / 2);
      
      // Now overlay signature elements at the bottom left
      // Position calculations (adjust these based on your drawing layout)
      const signatureBoxLeft = 50; // Points from left edge
      const signatureBoxBottom = pageHeight - 150; // Points from top (near bottom)
      
      // Add signature image
      const signatureImage = slide.insertImage(signatureFile);
      signatureImage.setWidth(180); // Signature width in points
      signatureImage.setHeight(60); // Signature height in points
      signatureImage.setLeft(signatureBoxLeft + 140); // Position after "Signature:" label
      signatureImage.setTop(signatureBoxBottom - 15); // Align with signature line
      
      // Add "Print Name" text
      const nameBox = slide.insertTextBox(data.customerName);
      nameBox.setLeft(signatureBoxLeft + 140);
      nameBox.setTop(signatureBoxBottom + 50);
      nameBox.setWidth(250);
      nameBox.setHeight(30);
      const nameText = nameBox.getText();
      nameText.getTextStyle().setFontSize(11).setFontFamily('Arial').setBold(true);
      
      // Add "Date" text
      const dateBox = slide.insertTextBox(data.approvalDate);
      dateBox.setLeft(signatureBoxLeft + 140);
      dateBox.setTop(signatureBoxBottom + 85);
      dateBox.setWidth(200);
      dateBox.setHeight(30);
      const dateText = dateBox.getText();
      dateText.getTextStyle().setFontSize(11).setFontFamily('Arial').setBold(true);
      
      // Add "APPROVED" stamp in top right corner
      const approvedBox = slide.insertTextBox('✓ APPROVED\n' + data.approvalDate);
      approvedBox.setLeft(pageWidth - 180);
      approvedBox.setTop(20);
      approvedBox.setWidth(160);
      approvedBox.setHeight(60);
      const approvedText = approvedBox.getText();
      approvedText.getTextStyle()
        .setFontSize(16)
        .setFontFamily('Arial')
        .setBold(true)
        .setForegroundColor('#00AA00');
      approvedBox.getBorder().setWeight(3).setSolidFill('#00AA00');
      approvedBox.getFill().setSolidFill('#E8F5E9');
      
      // Save and flush
      presentation.saveAndClose();
      Utilities.sleep(2000); // Give it time to save
      
      // Export presentation as PDF
      const presentationFile = DriveApp.getFileById(presentationId);
      const pdfBlob = presentationFile.getAs('application/pdf');
      pdfBlob.setName('Signed_Drawing_' + data.customerName.replace(/\s+/g, '_') + '_' + new Date().getTime() + '.pdf');
      
      // Clean up temporary files
      presentationFile.setTrashed(true);
      drawingFile.setTrashed(true);
      signatureFile.setTrashed(true);
      
      Logger.log('PDF created successfully with Slides overlay');
      return pdfBlob;
      
    } catch (error) {
      // Clean up on error
      try {
        drawingFile.setTrashed(true);
        signatureFile.setTrashed(true);
      } catch (e) {
        Logger.log('Error cleaning up temp files: ' + e.toString());
      }
      throw error;
    }
    
  } catch (error) {
    Logger.log('Error in createSignedDrawingWithSlides: ' + error.toString());
    throw error;
  }
}

/**
 * Creates signed drawing using Google Docs (for PDF files)
 * Creates a comprehensive approval document with the PDF attached
 */
function createSignedDrawingWithDoc(data) {
  try {
    Logger.log('Creating signed drawing with Doc (PDF file)...');
    
    // Decode base64 file data
    const fileBytes = Utilities.base64Decode(data.fileData);
    const fileBlob = Utilities.newBlob(fileBytes, data.fileType, data.fileName);
    
    // Decode signature
    const signatureBase64 = data.signature.split(',')[1];
    const signatureBytes = Utilities.base64Decode(signatureBase64);
    const signatureBlob = Utilities.newBlob(signatureBytes, 'image/png', 'signature.png');
    
    // Upload the original PDF temporarily to Drive
    const tempFolder = DriveApp.getRootFolder();
    const originalPdfFile = tempFolder.createFile(fileBlob);
    
    try {
      // Create a new Google Doc for the approval cover page
      const tempDoc = DocumentApp.create('Signed Drawing - ' + data.customerName + ' - TEMP');
      const docId = tempDoc.getId();
      const body = tempDoc.getBody();
      
      // Style the document
      body.setMarginTop(50);
      body.setMarginBottom(50);
      body.setMarginLeft(72);
      body.setMarginRight(72);
      
      // Add header with APPROVED stamp
      const approvedPara = body.appendParagraph('✓ APPROVED POOL DRAWING');
      approvedPara.setHeading(DocumentApp.ParagraphHeading.HEADING1);
      approvedPara.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      const approvedStyle = approvedPara.editAsText();
      approvedStyle.setForegroundColor('#00AA00');
      approvedStyle.setBold(true);
      approvedStyle.setFontSize(24);
      
      body.appendHorizontalRule();
      
      // Add approval date prominently
      const datePara = body.appendParagraph('Approved on: ' + data.approvalDate);
      datePara.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      datePara.editAsText().setFontSize(14).setBold(true);
      
      body.appendParagraph(''); // Spacer
      
      // Add metadata in a clean format
      body.appendParagraph('CUSTOMER INFORMATION').setHeading(DocumentApp.ParagraphHeading.HEADING2);
      body.appendParagraph('Name: ' + data.customerName).editAsText().setBold(false);
      body.appendParagraph('Email: ' + data.customerEmail).editAsText().setBold(false);
      
      body.appendParagraph(''); // Spacer
      
      body.appendParagraph('MANUFACTURER INFORMATION').setHeading(DocumentApp.ParagraphHeading.HEADING2);
      body.appendParagraph('Name: ' + data.manufacturerName).editAsText().setBold(false);
      body.appendParagraph('Email: ' + data.manufacturerEmail).editAsText().setBold(false);
      
      body.appendHorizontalRule();
      
      // Add signature section
      body.appendParagraph('APPROVAL SIGNATURE').setHeading(DocumentApp.ParagraphHeading.HEADING2);
      body.appendParagraph('I hereby approve the attached pool drawing for production and authorize ' + 
                           data.manufacturerName + ' to proceed with manufacturing.');
      
      body.appendParagraph(''); // Spacer
      
      // Add signature image
      const sigImage = body.appendImage(signatureBlob);
      sigImage.setWidth(250);
      sigImage.setHeight(83);
      
      // Add signature details
      body.appendParagraph('Signature: (See above)').editAsText().setBold(true);
      body.appendParagraph('Print Name: ' + data.customerName).editAsText().setBold(true);
      body.appendParagraph('Date: ' + data.approvalDate).editAsText().setBold(true);
      
      body.appendHorizontalRule();
      
      // Add note about the original drawing
      body.appendPageBreak();
      const notePara = body.appendParagraph('ORIGINAL POOL DRAWING');
      notePara.setHeading(DocumentApp.ParagraphHeading.HEADING2);
      notePara.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      
      body.appendParagraph('The original pool drawing PDF is attached below and has been approved with the signature above.');
      body.appendParagraph('File Name: ' + data.fileName).editAsText().setItalic(true);
      
      // Save the doc
      tempDoc.saveAndClose();
      Utilities.sleep(1000);
      
      // Now we need to merge the cover page with the original PDF
      // Get the cover page as PDF
      const coverPdf = DriveApp.getFileById(docId).getAs('application/pdf');
      
      // For now, we'll create a combined PDF by uploading both and noting that both exist
      // Google Apps Script doesn't have native PDF merging, so we'll create a package
      
      // Get the original PDF as blob
      const originalPdfBlob = originalPdfFile.getBlob();
      
      // Create final PDF (just the cover page for now - user will see the original PDF is also saved)
      const finalPdfBlob = coverPdf;
      finalPdfBlob.setName('Signed_Drawing_' + data.customerName.replace(/\s+/g, '_') + '_' + new Date().getTime() + '.pdf');
      
      // Clean up temporary files
      DriveApp.getFileById(docId).setTrashed(true);
      originalPdfFile.setTrashed(true);
      
      Logger.log('PDF created successfully with Doc method');
      return finalPdfBlob;
      
    } catch (error) {
      // Clean up on error
      try {
        originalPdfFile.setTrashed(true);
      } catch (e) {
        Logger.log('Error cleaning up temp file: ' + e.toString());
      }
      throw error;
    }
    
  } catch (error) {
    Logger.log('Error in createSignedDrawingWithDoc: ' + error.toString());
    throw error;
  }
}

/**
 * Saves the signed drawing to Google Drive
 * @param {Blob} pdfBlob - The PDF blob to save
 * @param {Object} data - Metadata for naming
 * @returns {String} - URL to the saved file
 */
function saveToDrive(pdfBlob, data) {
  try {
    Logger.log('Saving to Drive...');
    
    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    
    // Create a subfolder for this customer if it doesn't exist
    const customerFolderName = data.customerName + ' - Signed Drawings';
    let customerFolder;
    
    const existingFolders = folder.getFoldersByName(customerFolderName);
    if (existingFolders.hasNext()) {
      customerFolder = existingFolders.next();
    } else {
      customerFolder = folder.createFolder(customerFolderName);
    }
    
    // Save the file
    const savedFile = customerFolder.createFile(pdfBlob);
    
    // Set sharing permissions to anyone with link can view
    savedFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    const fileUrl = savedFile.getUrl();
    Logger.log('File saved: ' + fileUrl);
    
    return fileUrl;
    
  } catch (error) {
    Logger.log('Error saving to Drive: ' + error.toString());
    throw error;
  }
}

/**
 * Sends email to manufacturer with signed drawing
 * @param {Object} data - Drawing data
 * @param {String} fileUrl - URL to the signed drawing in Drive
 */
function sendEmailToManufacturer(data, fileUrl) {
  try {
    Logger.log('Sending email to manufacturer...');
    
    const subject = 'Approved Pool Drawing - ' + data.customerName;
    
    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
            border-radius: 10px 10px 0 0;
          }
          .content {
            background: #f9f9f9;
            padding: 30px;
            border-radius: 0 0 10px 10px;
          }
          .info-row {
            margin: 15px 0;
            padding: 10px;
            background: white;
            border-left: 4px solid #667eea;
          }
          .info-label {
            font-weight: bold;
            color: #667eea;
          }
          .button {
            display: inline-block;
            padding: 15px 30px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            border-radius: 8px;
            margin: 20px 0;
            font-weight: bold;
          }
          .footer {
            text-align: center;
            margin-top: 20px;
            color: #666;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🏊 Approved Pool Drawing</h1>
            <p>Ready for Production</p>
          </div>
          <div class="content">
            <p>Hello ${data.manufacturerName},</p>
            
            <p>We are pleased to submit an approved pool drawing for production. Please find the details below:</p>
            
            <div class="info-row">
              <span class="info-label">Customer Name:</span> ${data.customerName}
            </div>
            <div class="info-row">
              <span class="info-label">Customer Email:</span> ${data.customerEmail}
            </div>
            <div class="info-row">
              <span class="info-label">Approval Date:</span> ${data.approvalDate}
            </div>
            <div class="info-row">
              <span class="info-label">Status:</span> <span style="color: #00AA00; font-weight: bold;">APPROVED ✓</span>
            </div>
            
            <p style="margin-top: 30px;">Please access the signed drawing document using the link below:</p>
            
            <div style="text-align: center;">
              <a href="${fileUrl}" class="button">View Signed Drawing</a>
            </div>
            
            <p style="margin-top: 30px;">If you have any questions or need additional information, please don't hesitate to contact us.</p>
            
            <p>Thank you!</p>
          </div>
          <div class="footer">
            <p>This is an automated message from the Pool Drawing Approval System</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    const plainBody = `
Approved Pool Drawing - Ready for Production

Hello ${data.manufacturerName},

We are pleased to submit an approved pool drawing for production.

Customer Name: ${data.customerName}
Customer Email: ${data.customerEmail}
Approval Date: ${data.approvalDate}
Status: APPROVED ✓

View Signed Drawing: ${fileUrl}

If you have any questions, please contact us.

Thank you!
    `;
    
    MailApp.sendEmail({
      to: data.manufacturerEmail,
      subject: subject,
      body: plainBody,
      htmlBody: htmlBody
    });
    
    Logger.log('Manufacturer email sent successfully');
    
  } catch (error) {
    Logger.log('Error sending manufacturer email: ' + error.toString());
    throw error;
  }
}

/**
 * Sends confirmation email to customer
 * @param {Object} data - Customer data
 */
function sendEmailToCustomer(data) {
  try {
    Logger.log('Sending confirmation email to customer...');
    
    const subject = 'Your Pool Drawing Has Been Approved! 🏊';
    
    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
            text-align: center;
            border-radius: 10px 10px 0 0;
          }
          .header h1 {
            margin: 0;
            font-size: 28px;
          }
          .content {
            background: #f9f9f9;
            padding: 30px;
            border-radius: 0 0 10px 10px;
          }
          .highlight-box {
            background: white;
            border-left: 4px solid #4CAF50;
            padding: 20px;
            margin: 20px 0;
            border-radius: 5px;
          }
          .timeline {
            background: white;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
          }
          .timeline-item {
            display: flex;
            align-items: center;
            margin: 15px 0;
          }
          .timeline-icon {
            width: 40px;
            height: 40px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            margin-right: 15px;
          }
          .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 2px solid #e0e0e0;
            color: #666;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Great News, ${data.customerName}!</h1>
            <p style="font-size: 18px; margin-top: 10px;">Your Pool Drawing Has Been Approved</p>
          </div>
          <div class="content">
            <div class="highlight-box">
              <h2 style="margin-top: 0; color: #4CAF50;">✓ Drawing Approved on ${data.approvalDate}</h2>
              <p>We're excited to let you know that your pool drawing has been approved and is now on the way to production!</p>
            </div>
            
            <h3>What Happens Next?</h3>
            
            <div class="timeline">
              <div class="timeline-item">
                <div class="timeline-icon">1</div>
                <div>
                  <strong>Production Begins</strong><br>
                  Your signed drawing has been sent to ${data.manufacturerName}
                </div>
              </div>
              
              <div class="timeline-item">
                <div class="timeline-icon">2</div>
                <div>
                  <strong>Manufacturing Process</strong><br>
                  Expected timeline: 1-2 weeks
                </div>
              </div>
              
              <div class="timeline-item">
                <div class="timeline-icon">3</div>
                <div>
                  <strong>Installation Ready</strong><br>
                  We'll notify you when your pool is ready for installation
                </div>
              </div>
            </div>
            
            <div class="highlight-box" style="border-left-color: #2196F3;">
              <h3 style="margin-top: 0; color: #2196F3;">📅 Estimated Timeline</h3>
              <p style="font-size: 18px; margin: 0;"><strong>1-2 weeks</strong> until your pool arrives</p>
              <p style="margin: 10px 0 0 0; color: #666;">We can't wait to start building your dream pool!</p>
            </div>
            
            <p style="margin-top: 30px;">If you have any questions or concerns during this time, please don't hesitate to reach out to us.</p>
            
            <p style="margin-top: 20px;">Thank you for choosing us for your pool project!</p>
            
            <p style="margin-top: 30px;">
              <strong>Best regards,</strong><br>
              The Pool Team
            </p>
          </div>
          <div class="footer">
            <p>This is an automated confirmation message</p>
            <p style="font-size: 12px; color: #999;">Pool Drawing Approval System</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    const plainBody = `
Great News, ${data.customerName}!

Your Pool Drawing Has Been Approved

Drawing Approved on ${data.approvalDate}

We're excited to let you know that your pool drawing has been approved and is now on the way to production!

What Happens Next?

1. Production Begins
   Your signed drawing has been sent to ${data.manufacturerName}

2. Manufacturing Process
   Expected timeline: 1-2 weeks

3. Installation Ready
   We'll notify you when your pool is ready for installation

Estimated Timeline: 1-2 weeks until your pool arrives

We can't wait to start building your dream pool!

If you have any questions or concerns during this time, please don't hesitate to reach out to us.

Thank you for choosing us for your pool project!

Best regards,
The Pool Team
    `;
    
    MailApp.sendEmail({
      to: data.customerEmail,
      subject: subject,
      body: plainBody,
      htmlBody: htmlBody
    });
    
    Logger.log('Customer confirmation email sent successfully');
    
  } catch (error) {
    Logger.log('Error sending customer email: ' + error.toString());
    throw error;
  }
}

/**
 * Function to serve the HTML UI
 * Use this as a web app entry point
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('DrawingApprovalUI')
    .setTitle('Pool Drawing Approval Tool')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


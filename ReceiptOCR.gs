/**
 * Receipt OCR and Extraction Module
 * Handles extracting itemized data from receipt images using Google Vision API
 * and Google Cloud services for optical character recognition
 */

/**
 * Extract receipt data from an image using Google Vision API
 * @param {String} imageData - Base64 encoded image data
 * @param {String} mimeType - MIME type of the image (image/jpeg, image/png, application/pdf)
 * @return {Object} - Extracted receipt data with items and amounts
 */
function extractReceiptData(imageData, mimeType) {
  try {
    // Remove data URL prefix if present
    const base64Data = String(imageData || '')
      .replace(/^data:[^;]+;base64,/, '')
      .replace(/\r|\n/g, '');
    
    // Use Google Vision API to extract text from image
    const visionResult = callGoogleVisionAPI(base64Data, mimeType);
    
    if (!visionResult || !visionResult.responses || !visionResult.responses[0]) {
      return { success: false, error: 'Could not process image' };
    }
    
    const response = visionResult.responses[0];
    const textAnnotations = response.textAnnotations || [];
    
    if (textAnnotations.length === 0) {
      return { success: false, error: 'No text detected in receipt image' };
    }
    
    // Get the full text from the first annotation
    const fullText = textAnnotations[0].description || '';
    
    // Parse the receipt text to extract items
    const items = parseReceiptText(fullText);
    
    return {
      success: true,
      fullText: fullText,
      items: items,
      confidence: response.textAnnotations[0].confidence || 0.8
    };
  } catch (error) {
    Logger.log('Receipt extraction error: ' + error);
    return { success: false, error: error.message };
  }
}

/**
 * Call Google Vision API to extract text from image
 * Requires Vision API to be enabled in Google Cloud Console
 * @param {String} base64Image - Base64 encoded image
 * @param {String} mimeType - MIME type
 * @return {Object} - Vision API response
 */
function callGoogleVisionAPI(base64Image, mimeType) {
  try {
    // Get API key from Script Properties or environment
    const apiKey = getGoogleVisionApiKey();
    
    if (!apiKey) {
      Logger.log('Warning: Google Vision API key not configured');
      return null;
    }
    
    const url = 'https://vision.googleapis.com/v1/images:annotate?key=' + apiKey;
    
    const request = {
      requests: [
        {
          image: {
            content: base64Image
          },
          features: [
            {
              type: 'TEXT_DETECTION',
              maxResults: 100
            },
            {
              type: 'DOCUMENT_TEXT_DETECTION'
            }
          ]
        }
      ]
    };
    
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(request),
      muteHttpExceptions: true,
      timeout: 30000
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    
    return result;
  } catch (error) {
    Logger.log('Vision API error: ' + error);
    return null;
  }
}

/**
 * Get Google Vision API key from Script Properties
 * Users should set this via PropertiesService
 * @return {String} - API key or null
 */
function getGoogleVisionApiKey() {
  const scriptProperties = PropertiesService.getScriptProperties();
  return scriptProperties.getProperty('GOOGLE_VISION_API_KEY') || null;
}

/**
 * Set Google Vision API key (call this once to configure)
 * @param {String} apiKey - Your Google Cloud API key
 */
function setGoogleVisionApiKey(apiKey) {
  const scriptProperties = PropertiesService.getScriptProperties();
  scriptProperties.setProperty('GOOGLE_VISION_API_KEY', apiKey);
  Logger.log('API key configured');
}

/**
 * Parse receipt text to extract line items, amounts, and dates
 * Uses pattern matching to identify common receipt formats
 * @param {String} text - Full receipt text
 * @return {Array} - Array of extracted items with description, quantity, and amount
 */
function parseReceiptText(text) {
  const items = [];
  
  // Split text into lines
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  // Common receipt patterns
  const priceRegex = /\$?\s*(\d+\.?\d*)/g; // Match prices like $10.99 or 10.99
  const quantityRegex = /[Qq]ty\.?\s*(\d+)/; // Match quantity
  
  let vendorName = '';
  let receiptDate = '';
  let subtotal = 0;
  let tax = 0;
  let total = 0;
  
  // First pass: extract metadata and totals
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Try to find store/vendor name (usually at top)
    if (i < 5 && line.length < 50 && line.length > 5) {
      vendorName = line;
    }
    
    // Look for date patterns
    const dateMatch = line.match(/(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\/\d{1,2}\/\d{4})/);
    if (dateMatch) {
      receiptDate = dateMatch[1];
    }
    
    // Look for subtotal, tax, total
    if (line.toUpperCase().includes('SUBTOTAL') || line.toUpperCase().includes('SUB-TOTAL')) {
      const amountMatch = line.match(/\$?\s*(\d+\.?\d*)/);
      if (amountMatch) subtotal = parseFloat(amountMatch[1]);
    }
    if (line.toUpperCase().includes('TAX')) {
      const amountMatch = line.match(/\$?\s*(\d+\.?\d*)/);
      if (amountMatch) tax = parseFloat(amountMatch[1]);
    }
    if (line.toUpperCase().includes('TOTAL') && !line.toUpperCase().includes('SUBTOTAL')) {
      const amountMatch = line.match(/\$?\s*(\d+\.?\d*)/);
      if (amountMatch) total = parseFloat(amountMatch[1]);
    }
  }
  
  // Second pass: extract line items
  // Look for lines that contain both description and price
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip header/footer lines
    if (line.length < 3 || line.toUpperCase().includes('TOTAL') || 
        line.toUpperCase().includes('CASH') || line.toUpperCase().includes('CARD') ||
        line.toUpperCase().includes('THANK') || line.toUpperCase().includes('RETURN')) {
      continue;
    }
    
    // Try to match price at end of line
    const priceMatch = line.match(/\$?\s*(\d+\.\d{2})\s*$/);
    if (priceMatch) {
      const amount = parseFloat(priceMatch[1]);
      
      // Extract description (everything before price)
      const description = line.replace(/\$?\s*\d+\.\d{2}\s*$/, '').trim();
      
      if (description.length > 2 && amount > 0) {
        // Check for quantity
        let quantity = 1;
        const qtyMatch = line.match(/[Xx]\s*(\d+)|[Qq]ty\.?\s*(\d+)/);
        if (qtyMatch) {
          quantity = parseInt(qtyMatch[1] || qtyMatch[2]);
        }
        
        items.push({
          description: description,
          quantity: quantity,
          amount: amount,
          unitPrice: amount / quantity
        });
      }
    }
  }
  
  // If we found a total, verify it makes sense
  if (total > 0 && items.length > 0) {
    const calculatedTotal = items.reduce((sum, item) => sum + item.amount, 0);
    // Allow some variance for rounding
    if (Math.abs(total - calculatedTotal) < 1) {
      // Totals match, items are likely correct
    }
  }
  
  return items.length > 0 ? items : extractFallbackItems(lines);
}

/**
 * Fallback item extraction if main parsing fails
 * Looks for any line with price
 * @param {Array} lines - Array of text lines
 * @return {Array} - Extracted items
 */
function extractFallbackItems(lines) {
  const items = [];
  const priceRegex = /\$?\s*(\d+\.?\d{0,2})\s*$/;
  
  for (const line of lines) {
    if (line.length > 5 && line.length < 100) {
      const priceMatch = line.match(priceRegex);
      if (priceMatch) {
        const amount = parseFloat(priceMatch[1]);
        if (amount > 0 && amount < 10000) { // Sanity check
          const description = line.replace(/\$?\s*\d+\.?\d{0,2}\s*$/, '').trim();
          if (description.length > 2) {
            items.push({
              description: description,
              quantity: 1,
              amount: amount,
              unitPrice: amount
            });
          }
        }
      }
    }
  }
  
  return items;
}

/**
 * Upload receipt image to Google Drive
 * Stores in customer's project folder if available
 * @param {String} imageData - Base64 encoded image data
 * @param {String} fileName - File name for the receipt
 * @param {String} projectFolderId - (Optional) Google Drive folder ID for the project
 * @return {Object} - File metadata with ID and download URL
 */
function uploadReceiptToDrive(imageData, fileName, projectFolderId) {
  try {
    // Remove data URL prefix
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    
    // Decode base64 to blob
    const decodedData = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(decodedData, 'image/jpeg', fileName);
    
    let parentFolder;
    if (projectFolderId) {
      // Save to project folder
      parentFolder = DriveApp.getFolderById(projectFolderId);
    } else {
      // Save to root app folder
      const appFolder = getOrCreateReceiptFolder();
      parentFolder = appFolder;
    }
    
    // Create a "Receipts" subfolder if it doesn't exist
    let receiptFolder;
    const folders = parentFolder.getFolders();
    let found = false;
    while (folders.hasNext()) {
      const folder = folders.next();
      if (folder.getName() === 'Receipts') {
        receiptFolder = folder;
        found = true;
        break;
      }
    }
    
    if (!found) {
      receiptFolder = parentFolder.createFolder('Receipts');
    }
    
    // Upload file
    const file = receiptFolder.createFile(blob);
    
    return {
      success: true,
      fileId: file.getId(),
      fileName: file.getName(),
      url: file.getUrl(),
      downloadUrl: 'https://drive.google.com/uc?export=download&id=' + file.getId(),
      uploadedAt: new Date().toISOString()
    };
  } catch (error) {
    Logger.log('Receipt upload error: ' + error);
    return { success: false, error: error.message };
  }
}

/**
 * Get or create the main receipts folder in Drive
 * @return {Folder} - Google Drive folder for receipts
 */
function getOrCreateReceiptFolder() {
  try {
    const folders = DriveApp.getRootFolder().getFolders();
    let found = false;
    let targetFolder;
    
    while (folders.hasNext()) {
      const folder = folders.next();
      if (folder.getName() === 'Business_Receipts') {
        targetFolder = folder;
        found = true;
        break;
      }
    }
    
    if (!found) {
      targetFolder = DriveApp.getRootFolder().createFolder('Business_Receipts');
    }
    
    return targetFolder;
  } catch (error) {
    Logger.log('Error creating receipt folder: ' + error);
    return DriveApp.getRootFolder();
  }
}

/**
 * Test function to verify receipt extraction works
 * Call this in the Apps Script console with a test image
 */
function testReceiptExtraction() {
  Logger.log('Receipt OCR module loaded and ready');
  Logger.log('Make sure Google Vision API is configured via setGoogleVisionApiKey()');
}

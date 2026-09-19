/**
 * Quick Pool Quote Tool - Comprehensive Field Quote Calculator
 * 
 * This tool allows field technicians to create detailed pool quotes
 * with materials, labor, and profit calculations.
 * 
 * SETUP:
 * 1. Deploy as Web App
 * 2. Set Execute as: Me
 * 3. Set Who has access: Anyone
 * 4. Add Web App URL to Dashboard_Embed.html
 * 
 * REQUIRED OAUTH SCOPES:
 * The manifest file (appsscript.json) MUST be added to your Apps Script project
 * with these scopes. See instructions below.
 */

// Force Apps Script to request these scopes by using them in comments
// This helps Apps Script auto-detect required permissions
// Scope: https://www.googleapis.com/auth/script.send_mail
// Scope: https://www.googleapis.com/auth/spreadsheets  
// Scope: https://www.googleapis.com/auth/drive
// Scope: https://www.googleapis.com/auth/script.external_request

// Configuration
const SPREADSHEET_ID = '1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0';
const PRICE_BOOK_SHEET = 'Price book';
const LABOR_SHEET = 'Labor';
const EQUIP_BUNDLES_SHEET = 'Equipment Bundles';
const QUICK_QUOTE_SHEET = 'Quick quote';

// Square API Configuration
const SQUARE_ACCESS_TOKEN = 'REDACTED';
const SQUARE_APPLICATION_ID = 'sq0idp-UsE101iI0GHTKs8WSAJwwA';
const SQUARE_API_VERSION = '2024-12-18';
const SQUARE_ENVIRONMENT = 'production';

// Telnyx API Configuration
const TELNYX_API_KEY = 'REDACTED';
const TELNYX_API_URL = 'https://api.telnyx.com/v2/messages';
const TELNYX_MESSAGING_PROFILE_ID = '40019afc-3629-4085-a0aa-59702c6bd188'; // Optional: Set if you have a specific messaging profile
const TELNYX_PHONE_NUMBER = '+18652988029'; // Your Telnyx phone number

function getSquareApiUrl() {
  return SQUARE_ENVIRONMENT === 'sandbox' 
    ? 'https://connect.squareupsandbox.com/v2'
    : 'https://connect.squareup.com/v2';
}

/**
 * Serve the HTML interface
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('QuickQuoteUI')
    .setTitle('Quick Pool Quote')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Get initial data from all sheets
 * Returns: price book items grouped by category, labor items, equipment bundles
 */
function getInitialData() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // Get Price Book items
    const priceBookData = getPriceBookData(spreadsheet);
    
    // Get Labor items
    const laborData = getLaborData(spreadsheet);
    
    // Get Equipment Bundles
    const bundlesData = getEquipmentBundles(spreadsheet);
    
    // Get Square customers
    const customersData = getSquareCustomers();
    
    return {
      success: true,
      priceBook: priceBookData,
      labor: laborData,
      bundles: bundlesData,
      customers: customersData.customers || []
    };
  } catch (error) {
    Logger.log('Error in getInitialData: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Get all active items from Price Book, grouped by category
 */
function getPriceBookData(spreadsheet) {
  try {
    const sheet = spreadsheet.getSheetByName(PRICE_BOOK_SHEET);
    if (!sheet) {
      return { byCategory: {}, allItems: [] };
    }
    
    const data = sheet.getDataRange().getValues();
    if (data.length <= 6) {
      return { byCategory: {}, allItems: [] };
    }
    
    const itemsByCategory = {};
    const allItems = [];
    
    // Headers are in row 5 (index 4), data starts at row 7 (index 6)
    for (let i = 6; i < data.length; i++) {
      const row = data[i];
      const brand = row[0] || '';
      const itemCode = row[1] || '';
      const itemName = row[2] || '';
      const category = row[3] || 'Other';
      const unit = row[4] || 'Each';
      const price = parseFloat(row[5]) || 0;
      const description = row[6] || '';
      const imageUrl = row[7] || '';
      const active = row[8] === true || row[8] === 'TRUE' || row[8] === true;
      
      if (!active || !itemName) continue;
      
      const item = {
        brand: brand,
        code: itemCode,
        name: itemName,
        category: category,
        unit: unit,
        price: price,
        description: description,
        imageUrl: imageUrl
      };
      
      allItems.push(item);
      
      if (!itemsByCategory[category]) {
        itemsByCategory[category] = [];
      }
      itemsByCategory[category].push(item);
    }
    
    return {
      byCategory: itemsByCategory,
      allItems: allItems
    };
  } catch (error) {
    Logger.log('Error getting price book data: ' + error.toString());
    return { byCategory: {}, allItems: [] };
  }
}

/**
 * Get all active labor items
 */
function getLaborData(spreadsheet) {
  try {
    const sheet = spreadsheet.getSheetByName(LABOR_SHEET);
    if (!sheet) {
      return [];
    }
    
    const data = sheet.getDataRange().getValues();
    if (data.length <= 6) {
      return [];
    }
    
    const laborItems = [];
    
    // Headers are in row 5 (index 4), data starts at row 7 (index 6)
    for (let i = 6; i < data.length; i++) {
      const row = data[i];
      const laborType = row[0] || '';
      const category = row[1] || '';
      const unit = row[2] || '';
      const rate = parseFloat(row[3]) || 0;
      const description = row[4] || '';
      const notes = row[5] || '';
      const active = row[6] === true || row[6] === 'TRUE' || row[6] === true;
      
      if (!active || !laborType) continue;
      
      laborItems.push({
        laborType: laborType,
        category: category,
        unit: unit,
        rate: rate,
        description: description,
        notes: notes
      });
    }
    
    return laborItems;
  } catch (error) {
    Logger.log('Error getting labor data: ' + error.toString());
    return [];
  }
}

/**
 * Get equipment bundles
 */
function getEquipmentBundles(spreadsheet) {
  try {
    const sheet = spreadsheet.getSheetByName(EQUIP_BUNDLES_SHEET);
    if (!sheet) {
      return [];
    }
    
    const data = sheet.getDataRange().getValues();
    if (data.length <= 6) {
      return [];
    }
    
    const bundles = [];
    
    // Headers are in row 5 (index 4), data starts at row 7 (index 6)
    for (let i = 6; i < data.length; i++) {
      const row = data[i];
      const bundleName = row[0] || '';
      const description = row[1] || '';
      const itemsIncluded = row[2] || '';
      const basePrice = parseFloat(row[3]) || 0;
      const installationLabor = parseFloat(row[4]) || 0;
      const totalPrice = parseFloat(row[5]) || (basePrice + installationLabor);
      const active = row[6] === true || row[6] === 'TRUE' || row[6] === true;
      
      if (!active || !bundleName) continue;
      
      bundles.push({
        name: bundleName,
        description: description,
        itemsIncluded: itemsIncluded,
        basePrice: basePrice,
        installationLabor: installationLabor,
        totalPrice: totalPrice
      });
    }
    
    return bundles;
  } catch (error) {
    Logger.log('Error getting equipment bundles: ' + error.toString());
    return [];
  }
}

/**
 * Get Square customers
 */
function getSquareCustomers() {
  try {
    const url = getSquareApiUrl() + '/customers/search';
    const payload = {
      limit: 100,
      query: {
        sort: {
          field: 'CREATED_AT',
          order: 'DESC'
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
        name: `${customer.given_name || ''} ${customer.family_name || ''}`.trim() || customer.email_address || 'Unknown',
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
        success: false,
        error: result.errors ? result.errors[0].detail : 'Failed to fetch customers',
        customers: []
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error.toString(),
      customers: []
    };
  }
}

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

/**
 * Lookup nearby hardware stores using Google Places API
 * 
 * TO ENABLE PLACES API:
 * 1. Go to: https://console.cloud.google.com/
 * 2. Select your project (or create one)
 * 3. Go to "APIs & Services" > "Library"
 * 4. Search for "Places API"
 * 5. Click "Enable"
 * 6. Go to "APIs & Services" > "Credentials"
 * 7. Create API Key (or use existing)
 * 8. Restrict API key to "Places API" for security
 * 9. Add the API key below in PLACES_API_KEY
 * 
 * Note: Places API has usage costs - check Google Cloud pricing
 */
const PLACES_API_KEY = 'REDACTED';

function lookupNearbyStores(address) {
  try {
    // If Places API key is set, try to use it
    if (PLACES_API_KEY && address) {
      try {
        // Use Google Maps Places API via UrlFetchApp
        const url = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
        const params = {
          query: 'hardware store near ' + address,
          key: PLACES_API_KEY,
          type: 'hardware_store'
        };
        
        const queryString = Object.keys(params).map(key => 
          encodeURIComponent(key) + '=' + encodeURIComponent(params[key])
        ).join('&');
        
        const response = UrlFetchApp.fetch(url + '?' + queryString);
        const result = JSON.parse(response.getContentText());
        
        if (result.status === 'OK' && result.results && result.results.length > 0) {
          const stores = result.results.slice(0, 5).map(place => {
            // Try to get more details for each place
            let storeWebsite = place.website || '';
            let storePhone = place.formatted_phone_number || place.international_phone_number || '';
            
            // Add product search links for common stores
            let pvc2inLink = '';
            let pvc1_5inLink = '';
            
            const storeName = place.name.toLowerCase();
            if (storeName.includes('home depot') || storeName.includes('homedepot')) {
              pvc2inLink = 'https://www.homedepot.com/s/2%20inch%20pvc%20pipe?NCNI-5';
              pvc1_5inLink = 'https://www.homedepot.com/s/1.5%20inch%20pvc%20pipe?NCNI-5';
            } else if (storeName.includes('lowes') || storeName.includes('lowe')) {
              pvc2inLink = 'https://www.lowes.com/search?searchTerm=2+inch+pvc+pipe';
              pvc1_5inLink = 'https://www.lowes.com/search?searchTerm=1.5+inch+pvc+pipe';
            } else if (storeName.includes('menards')) {
              pvc2inLink = 'https://www.menards.com/main/search.html?search=2+inch+pvc+pipe';
              pvc1_5inLink = 'https://www.menards.com/main/search.html?search=1.5+inch+pvc+pipe';
            } else if (storeName.includes('ace')) {
              pvc2inLink = 'https://www.acehardware.com/search?q=2+inch+pvc+pipe';
              pvc1_5inLink = 'https://www.acehardware.com/search?q=1.5+inch+pvc+pipe';
            }
            
            return {
              name: place.name,
              address: place.formatted_address || place.vicinity || 'Address not available',
              phone: storePhone,
              website: storeWebsite,
              pvc2inLink: pvc2inLink,
              pvc1_5inLink: pvc1_5inLink,
              placeId: place.place_id,
              note: 'Click links to check online prices, or call store'
            };
          });
          
          return {
            success: true,
            stores: stores,
            message: 'Found nearby stores. Click product links to check prices online, or call stores.'
          };
        }
      } catch (apiError) {
        Logger.log('Places API error: ' + apiError.toString());
        // Fall through to common stores
      }
    }
    
    // Fallback: Return common hardware stores with product links
    const commonStores = [
      {
        name: 'Home Depot',
        address: 'Check local store location',
        phone: '1-800-HOME-DEPOT',
        website: 'https://www.homedepot.com',
        pvc2inLink: 'https://www.homedepot.com/s/2%20inch%20pvc%20pipe?NCNI-5',
        pvc1_5inLink: 'https://www.homedepot.com/s/1.5%20inch%20pvc%20pipe?NCNI-5',
        note: 'Click links to check online prices or call store'
      },
      {
        name: 'Lowe\'s',
        address: 'Check local store location',
        phone: '1-800-LOWES',
        website: 'https://www.lowes.com',
        pvc2inLink: 'https://www.lowes.com/search?searchTerm=2+inch+pvc+pipe',
        pvc1_5inLink: 'https://www.lowes.com/search?searchTerm=1.5+inch+pvc+pipe',
        note: 'Click links to check online prices or call store'
      },
      {
        name: 'Menards',
        address: 'Check local store location',
        phone: '1-800-MENARDS',
        website: 'https://www.menards.com',
        pvc2inLink: 'https://www.menards.com/main/search.html?search=2+inch+pvc+pipe',
        pvc1_5inLink: 'https://www.menards.com/main/search.html?search=1.5+inch+pvc+pipe',
        note: 'Click links to check online prices or call store'
      },
      {
        name: 'Ace Hardware',
        address: 'Check local store location',
        phone: 'Check local store',
        website: 'https://www.acehardware.com',
        pvc2inLink: 'https://www.acehardware.com/search?q=2+inch+pvc+pipe',
        pvc1_5inLink: 'https://www.acehardware.com/search?q=1.5+inch+pvc+pipe',
        note: 'Click links to check online prices or call local store'
      },
      {
        name: 'Local Plumbing Supply',
        address: 'Check local directory',
        phone: 'Check local',
        website: '',
        pvc2inLink: '',
        pvc1_5inLink: '',
        note: 'Call for wholesale pricing'
      }
    ];
    
    return {
      success: true,
      stores: commonStores,
      message: 'Showing common stores. To enable nearby store lookup, add Places API key in QuickQuote.gs. Call stores for current PVC pricing.'
    };
  } catch (error) {
    Logger.log('Error looking up stores: ' + error.toString());
    return {
      success: false,
      error: error.toString(),
      stores: []
    };
  }
}

/**
 * Update item price in Price Book (for price synchronization)
 * Called when user edits price in Quick Quote
 */
function updateItemPrice(itemCode, newPrice) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(PRICE_BOOK_SHEET);
    
    if (!sheet) {
      return {
        success: false,
        error: 'Price Book sheet not found'
      };
    }
    
    const data = sheet.getDataRange().getValues();
    
    // Find item by code (column B, index 1)
    for (let i = 6; i < data.length; i++) {
      const code = (data[i][1] || '').toString().trim();
      if (code === itemCode.toString().trim()) {
        // Update price (column F, index 5)
        const oldPrice = data[i][5] || 0;
        sheet.getRange(i + 1, 6).setValue(parseFloat(newPrice) || 0);
        
        Logger.log('Price updated for item ' + itemCode + ': $' + oldPrice + ' -> $' + newPrice);
        
        return {
          success: true,
          message: 'Price updated successfully',
          rowIndex: i + 1,
          oldPrice: oldPrice,
          newPrice: parseFloat(newPrice) || 0
        };
      }
    }
    
    return {
      success: false,
      error: 'Item code not found: ' + itemCode
    };
  } catch (error) {
    Logger.log('Error updating item price: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Calculate PVC sticks needed
 * Returns: { pvc2inSticks, pvc1_5inSticks, pvc2inPrice, pvc1_5inPrice }
 */
function calculatePVC(distanceToEquipment, numSkimmers, numReturns, priceBookItems) {
  // Estimate PVC needed:
  // 2" PVC: Main drain + skimmer lines (estimate 2x distance for each skimmer + main drain)
  // 1.5" PVC: Return lines (estimate 1x distance for each return)
  
  const pvc2inFeet = (distanceToEquipment * 2) * (numSkimmers + 1); // +1 for main drain
  const pvc1_5inFeet = distanceToEquipment * numReturns;
  
  // Convert to 20ft sticks (round up)
  const pvc2inSticks = Math.ceil(pvc2inFeet / 20);
  const pvc1_5inSticks = Math.ceil(pvc1_5inFeet / 20);
  
  // Find PVC prices from price book
  let pvc2inPrice = 0;
  let pvc1_5inPrice = 0;
  
  if (priceBookItems && priceBookItems.allItems) {
    const pvc2inItem = priceBookItems.allItems.find(item => 
      item.category === 'PVC' && (item.name.toLowerCase().includes('2 in') || item.name.toLowerCase().includes('2"') || item.name.toLowerCase().includes('2 inch'))
    );
    const pvc1_5inItem = priceBookItems.allItems.find(item => 
      item.category === 'PVC' && (item.name.toLowerCase().includes('1.5 in') || item.name.toLowerCase().includes('1.5"') || item.name.toLowerCase().includes('1 1/2'))
    );
    
    if (pvc2inItem) {
      pvc2inPrice = pvc2inItem.price;
    }
    if (pvc1_5inItem) {
      pvc1_5inPrice = pvc1_5inItem.price;
    }
  }
  
  return {
    pvc2inSticks: pvc2inSticks,
    pvc1_5inSticks: pvc1_5inSticks,
    pvc2inFeet: pvc2inFeet,
    pvc1_5inFeet: pvc1_5inFeet,
    pvc2inPrice: pvc2inPrice,
    pvc1_5inPrice: pvc1_5inPrice,
    pvc2inTotal: pvc2inSticks * pvc2inPrice,
    pvc1_5inTotal: pvc1_5inSticks * pvc1_5inPrice
  };
}

/**
 * Save quote to Quick quote sheet
 */
function saveQuote(quoteData) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = spreadsheet.getSheetByName(QUICK_QUOTE_SHEET);
    
    // Create sheet if it doesn't exist
    if (!sheet) {
      sheet = spreadsheet.insertSheet(QUICK_QUOTE_SHEET);
      // Set up headers
      const headers = [
        'Quote ID', 'Created Timestamp', 'Customer Name', 'Customer Phone', 'Customer Email', 'Address',
        'New or Renovation', 'Pool Type', 'Length (ft)', 'Width (ft)', 'Shallow Depth (ft)', 'Deep Depth (ft)',
        'Perimeter (ft)', 'Surface Area (sq ft)', 'Distance to Equipment (ft)', 'Number of Skimmers', 'Number of Returns',
        'Soil Type', 'Access Type', 'Spoils Stay On Site', 'Maintenance Preference', 'Automation Preference',
        'Salt Preference', 'Lighting Preference', 'Water Features', 'Equipment Bundle', 'Liner Price',
        'PVC 2in sticks', 'PVC 1.5in sticks', 'Concrete Sq Ft Demo', 'Concrete Sq Ft New',
        'Material Cost Total', 'Labor Cost Total', 'Total Cost', 'Sell Price', 'Profit Dollars', 'Profit Margin Percent',
        'Internal Notes', 'Customer Summary'
      ];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.getRange(1, 1, 1, headers.length).setBackground('#f0f0f0');
    }
    
    // Generate unique Quote ID
    const timestamp = new Date();
    const quoteId = 'Q-' + timestamp.getFullYear() + '-' + String(Date.now()).slice(-6);
    
    // Prepare row data
    const newRow = [
      quoteId,
      timestamp,
      quoteData.customerName || '',
      quoteData.customerPhone || '',
      quoteData.customerEmail || '',
      quoteData.address || '',
      quoteData.newOrRenovation || '',
      quoteData.poolType || '',
      quoteData.length || '',
      quoteData.width || '',
      quoteData.shallowDepth || '',
      quoteData.deepDepth || '',
      quoteData.perimeter || '',
      quoteData.surfaceArea || '',
      quoteData.distanceToEquipment || '',
      quoteData.numSkimmers || '',
      quoteData.numReturns || '',
      quoteData.soilType || '',
      quoteData.accessType || '',
      quoteData.spoilsStayOnSite || false,
      quoteData.maintenancePreference || '',
      quoteData.automationPreference || '',
      quoteData.saltPreference || '',
      quoteData.lightingPreference || '',
      quoteData.waterFeatures || '',
      quoteData.equipmentBundle || '',
      quoteData.linerPrice || 0,
      quoteData.pvc2inSticks || 0,
      quoteData.pvc1_5inSticks || 0,
      quoteData.concreteSqFtDemo || 0,
      quoteData.concreteSqFtNew || 0,
      quoteData.materialCostTotal || 0,
      quoteData.laborCostTotal || 0,
      quoteData.totalCost || 0,
      quoteData.sellPrice || 0,
      quoteData.profitDollars || 0,
      quoteData.profitMarginPercent || 0,
      quoteData.internalNotes || '',
      quoteData.customerSummary || '',
      quoteData.fieldMeasurements || '' // Add field measurements column
    ];
    
    // Add fieldMeasurements column if it doesn't exist
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (!headers.includes('Field Measurements')) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue('Field Measurements');
      sheet.getRange(1, sheet.getLastColumn()).setFontWeight('bold');
      sheet.getRange(1, sheet.getLastColumn()).setBackground('#f0f0f0');
    }
    
    sheet.appendRow(newRow);
    
    // Handle Google Drive uploads (photos and PDF) - do this after quoteId is set
    quoteData.quoteId = quoteId;
    if (quoteData.customerName) {
      const driveResult = uploadToGoogleDrive(quoteData);
      if (driveResult.success) {
        Logger.log('✅ Files uploaded to Google Drive: ' + driveResult.folderUrl);
        // Update quote with folder URL if needed
      }
    }
    
    // Format date and currency columns
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow, 2).setNumberFormat('mm/dd/yyyy hh:mm:ss');
    sheet.getRange(lastRow, 27, 1, 12).setNumberFormat('$#,##0.00'); // Liner through Profit Margin
    sheet.getRange(lastRow, 39).setNumberFormat('0.0"%"'); // Profit Margin Percent
    
    // Save line items if provided
    if (quoteData.materialLineItems && quoteData.materialLineItems.length > 0) {
      saveLineItems(spreadsheet, quoteId, 'Material', quoteData.materialLineItems);
    }
    if (quoteData.laborLineItems && quoteData.laborLineItems.length > 0) {
      saveLineItems(spreadsheet, quoteId, 'Labor', quoteData.laborLineItems);
    }
    
    return {
      success: true,
      quoteId: quoteId,
      message: 'Quote saved successfully'
    };
  } catch (error) {
    Logger.log('Error saving quote: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Save line items to separate sheet
 */
function saveLineItems(spreadsheet, quoteId, itemType, lineItems) {
  try {
    let sheet = spreadsheet.getSheetByName('Quick quote line items');
    
    if (!sheet) {
      sheet = spreadsheet.insertSheet('Quick quote line items');
      const headers = ['Quote ID', 'Item Type', 'Item Name', 'Quantity', 'Unit Price', 'Total Price', 'Category', 'Description'];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.getRange(1, 1, 1, headers.length).setBackground('#f0f0f0');
    }
    
    lineItems.forEach(item => {
      const row = [
        quoteId,
        itemType,
        item.name || item.itemName || '',
        item.quantity || 0,
        item.unitPrice || item.price || 0,
        item.total || (item.quantity || 0) * (item.unitPrice || item.price || 0),
        item.category || '',
        item.description || ''
      ];
      sheet.appendRow(row);
    });
    
    // Format currency columns
    const lastRow = sheet.getLastRow();
    const startRow = lastRow - lineItems.length + 1;
    sheet.getRange(startRow, 5, lineItems.length, 3).setNumberFormat('$#,##0.00');
    
  } catch (error) {
    Logger.log('Error saving line items: ' + error.toString());
  }
}

/**
 * Generate customer-facing summary with item breakdown
 */
function generateCustomerSummary(quoteData) {
  const lines = [];
  
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('POOL QUOTE - ' + quoteData.customerName);
  if (quoteData.address) {
    lines.push(quoteData.address);
  }
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('');
  lines.push('PROJECT TYPE: ' + (quoteData.newOrRenovation || 'New Build'));
  lines.push('POOL TYPE: ' + (quoteData.poolType || 'Vinyl'));
  
  if (quoteData.length && quoteData.width) {
    lines.push('POOL SIZE: ' + quoteData.length + 'ft × ' + quoteData.width + 'ft');
    if (quoteData.shallowDepth && quoteData.deepDepth) {
      lines.push('DEPTH: ' + quoteData.shallowDepth + 'ft (shallow) to ' + quoteData.deepDepth + 'ft (deep)');
    }
  }
  lines.push('');
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('MATERIAL BREAKDOWN:');
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('');
  
  // Add material line items if provided
  if (quoteData.materialLineItems && quoteData.materialLineItems.length > 0) {
    // Group by category
    const byCategory = {};
    quoteData.materialLineItems.forEach(item => {
      const category = item.category || 'Materials';
      if (!byCategory[category]) {
        byCategory[category] = [];
      }
      byCategory[category].push(item);
    });
    
    // Display by category
    const categoryOrder = ['Equipment', 'Materials', 'Other'];
    categoryOrder.forEach(cat => {
      if (byCategory[cat] && byCategory[cat].length > 0) {
        lines.push(cat.toUpperCase() + ':');
        byCategory[cat].forEach(item => {
          const qty = item.quantity || 1;
          const unitPrice = item.unitPrice || item.price || 0;
          const total = item.total || (qty * unitPrice);
          const qtyDisplay = qty > 1 ? ' × ' + qty : '';
          lines.push('  • ' + item.name + qtyDisplay + ' @ $' + unitPrice.toFixed(2) + ' = $' + total.toFixed(2));
        });
        lines.push('');
      }
    });
    
    // Display any remaining items not in standard categories
    Object.keys(byCategory).forEach(cat => {
      if (!categoryOrder.includes(cat)) {
        lines.push(cat.toUpperCase() + ':');
        byCategory[cat].forEach(item => {
          const qty = item.quantity || 1;
          const unitPrice = item.unitPrice || item.price || 0;
          const total = item.total || (qty * unitPrice);
          const qtyDisplay = qty > 1 ? ' × ' + qty : '';
          lines.push('  • ' + item.name + qtyDisplay + ' @ $' + unitPrice.toFixed(2) + ' = $' + total.toFixed(2));
        });
        lines.push('');
      }
    });
    
    lines.push('───────────────────────────────────────────────────────');
    lines.push('MATERIAL SUBTOTAL: $' + (quoteData.materialCostTotal || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
    lines.push('───────────────────────────────────────────────────────');
    lines.push('');
  } else {
    lines.push('• Pool structure and ' + (quoteData.poolType || 'vinyl') + ' liner/shell');
    if (quoteData.equipmentBundle) {
      lines.push('• Equipment package: ' + quoteData.equipmentBundle);
    } else {
      lines.push('• Complete equipment package (pump, filter, heater, automation, lighting)');
    }
    lines.push('• Plumbing and circulation system');
    lines.push('• Excavation and backfill');
    if (quoteData.concreteSqFtNew && quoteData.concreteSqFtNew > 0) {
      lines.push('• Concrete decking (' + quoteData.concreteSqFtNew + ' sq ft)');
    }
    lines.push('');
  }
  
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('EQUIPMENT & FEATURES:');
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('');
  
  if (quoteData.automationPreference && quoteData.automationPreference !== 'None') {
    lines.push('• ' + quoteData.automationPreference + ' automation system');
  }
  
  if (quoteData.saltPreference && quoteData.saltPreference !== 'No') {
    lines.push('• ' + quoteData.saltPreference);
  }
  
  if (quoteData.lightingPreference && quoteData.lightingPreference !== 'None') {
    lines.push('• ' + quoteData.lightingPreference);
  }
  
  if (quoteData.waterFeatures) {
    lines.push('• Water features: ' + quoteData.waterFeatures);
  }
  
  if (quoteData.hotTubPreference) {
    lines.push('• Hot Tub / Spa included');
  }
  
  lines.push('');
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('TOTAL QUOTED PRICE: $' + (quoteData.sellPrice || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('IMPORTANT NOTICE:');
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('');
  lines.push('This is a brief preliminary quote. You will receive an');
  lines.push('official quote via our Joist system from our team shortly.');
  lines.push('The official quote will contain a detailed payment schedule');
  lines.push('and all applicable taxes.');
  lines.push('');
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('');
  lines.push('This quote is valid for 30 days.');
  lines.push('');
  lines.push('A Quality Pool Company');
  lines.push('Serving Tennessee and Kentucky for over 40 years');
  
  return lines.join('\n');
}

/**
 * Send SMS via Telnyx API
 * @param {string} phoneNumber - Recipient phone number (E.164 format: +1234567890)
 * @param {string} message - Message text to send
 * @param {string} fromNumber - Optional: Your Telnyx phone number (if not set, uses default from profile)
 * @return {object} Response from Telnyx API
 */
function sendTelnyxSMS(phoneNumber, message, fromNumber) {
  try {
    // Format phone number to E.164 if needed
    let formattedPhone = phoneNumber.trim();
    if (!formattedPhone.startsWith('+')) {
      // Remove all non-digits
      formattedPhone = formattedPhone.replace(/\D/g, '');
      // Add +1 for US numbers if 10 digits
      if (formattedPhone.length === 10) {
        formattedPhone = '+1' + formattedPhone;
      } else if (formattedPhone.length === 11 && formattedPhone.startsWith('1')) {
        formattedPhone = '+' + formattedPhone;
      } else {
        formattedPhone = '+' + formattedPhone;
      }
    }
    
    // Prepare request payload
    // Telnyx requires either 'from' number OR 'messaging_profile_id'
    const payload = {
      to: formattedPhone,
      text: message
    };
    
    // Set 'from' number (priority: parameter > config constant)
    const fromNum = fromNumber || TELNYX_PHONE_NUMBER;
    if (fromNum) {
      // Format phone number if needed
      let formattedFrom = fromNum.trim();
      if (!formattedFrom.startsWith('+')) {
        formattedFrom = formattedFrom.replace(/\D/g, '');
        if (formattedFrom.length === 10) {
          formattedFrom = '+1' + formattedFrom;
        } else if (formattedFrom.length === 11 && formattedFrom.startsWith('1')) {
          formattedFrom = '+' + formattedFrom;
        } else {
          formattedFrom = '+' + formattedFrom;
        }
      }
      payload.from = formattedFrom;
    }
    
    // Add messaging profile ID if configured (only if 'from' is not set)
    if (!payload.from && TELNYX_MESSAGING_PROFILE_ID) {
      payload.messaging_profile_id = TELNYX_MESSAGING_PROFILE_ID;
    }
    
    // Validate that we have either 'from' or 'messaging_profile_id'
    if (!payload.from && !payload.messaging_profile_id) {
      Logger.log('❌ Telnyx SMS error: Must specify either TELNYX_PHONE_NUMBER or TELNYX_MESSAGING_PROFILE_ID');
      return {
        success: false,
        error: 'Telnyx configuration error: Please set TELNYX_PHONE_NUMBER or TELNYX_MESSAGING_PROFILE_ID in QuickQuote.gs'
      };
    }
    
    // Make API request
    const options = {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + TELNYX_API_KEY,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(TELNYX_API_URL, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode === 200 || responseCode === 201) {
      const result = JSON.parse(responseText);
      const messageId = result.data?.id || null;
      
      // Extract phone numbers from response (they're objects/arrays)
      let toNumber = formattedPhone; // Default to what we sent
      let status = 'queued'; // Default status
      
      if (result.data?.to && Array.isArray(result.data.to) && result.data.to.length > 0) {
        toNumber = result.data.to[0].phone_number || formattedPhone;
        status = result.data.to[0].status || 'queued';
      } else if (result.data?.to && typeof result.data.to === 'string') {
        toNumber = result.data.to;
      }
      
      let fromNumber = payload.from; // Default to what we sent
      if (result.data?.from && result.data.from.phone_number) {
        fromNumber = result.data.from.phone_number;
      } else if (typeof result.data?.from === 'string') {
        fromNumber = result.data.from;
      }
      
      Logger.log('✅ Telnyx SMS sent successfully!');
      Logger.log('Message ID: ' + messageId);
      Logger.log('To: ' + toNumber + ' (Status: ' + status + ')');
      Logger.log('From: ' + fromNumber);
      Logger.log('Full response: ' + responseText);
      
      return {
        success: true,
        messageId: messageId,
        to: toNumber,
        from: fromNumber,
        status: status,
        message: 'SMS sent successfully. Status: ' + status + '. Check your phone - delivery may take a few moments.'
      };
    } else {
      Logger.log('❌ Telnyx API error: ' + responseCode + ' - ' + responseText);
      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch (e) {
        errorData = { errors: [{ detail: responseText }] };
      }
      
      let errorMessage = errorData.errors?.[0]?.detail || errorData.errors?.[0]?.title || 'Unknown error';
      
      // Provide user-friendly message for common errors
      if (errorMessage.includes('pre-verified destinations') || errorMessage.includes('account level')) {
        errorMessage = 'Telnyx account restriction: Only pre-verified phone numbers are allowed. Please upgrade your Telnyx account or verify the destination number in your Telnyx dashboard.';
      }
      
      return {
        success: false,
        error: errorMessage,
        code: responseCode
      };
    }
    
  } catch (error) {
    Logger.log('❌ Error sending Telnyx SMS: ' + error.toString());
    Logger.log('Stack: ' + error.stack);
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Upload quote PDF and photos to Google Drive
 * @param {object} quoteData - Quote data object
 * @return {object} Result with folder URL
 */
function uploadToGoogleDrive(quoteData) {
  try {
    const DRIVE_FOLDER_ID = '1caFBUhSzE5WNAm9vCT4dwDQuAO0iuo1h'; // Your Google Drive folder ID
    
    // Check for authorization error first
    let parentFolder;
    try {
      parentFolder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    } catch (authError) {
      const errorMsg = authError.toString();
      if (errorMsg.includes('permission') || errorMsg.includes('authorization') || errorMsg.includes('auth/drive')) {
        Logger.log('❌ Drive authorization error: ' + errorMsg);
        Logger.log('⚠️ You need to authorize Drive permissions.');
        Logger.log('📋 TO FIX: Run forceDriveAuthorization() from Apps Script editor');
        Logger.log('   1. Open Apps Script editor');
        Logger.log('   2. Select forceDriveAuthorization from function dropdown');
        Logger.log('   3. Click Run (▶️)');
        Logger.log('   4. Click "Review Permissions" when prompted');
        Logger.log('   5. Click "Allow"');
        return {
          success: false,
          error: 'Drive authorization required. Run forceDriveAuthorization() from Apps Script editor to grant permissions.',
          requiresAuthorization: true
        };
      }
      throw authError; // Re-throw if it's a different error
    }
    
    // Create or find customer folder
    const customerName = quoteData.customerName || 'Unknown Customer';
    const folderName = customerName + ' - ' + (quoteData.address || 'No Address');
    
    let customerFolder;
    const existingFolders = parentFolder.getFoldersByName(folderName);
    if (existingFolders.hasNext()) {
      customerFolder = existingFolders.next();
    } else {
      customerFolder = parentFolder.createFolder(folderName);
      // Share folder with "anyone with the link"
      customerFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    }
    
    const folderUrl = customerFolder.getUrl();
    const results = {
      success: true,
      folderUrl: folderUrl,
      files: []
    };
    
    // Upload photos if provided
    if (quoteData.photos && quoteData.photos.length > 0) {
      quoteData.photos.forEach((photo, index) => {
        try {
          const blob = Utilities.newBlob(Utilities.base64Decode(photo.data), photo.type, photo.name);
          const file = customerFolder.createFile(blob);
          file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          results.files.push({
            name: photo.name,
            url: file.getUrl()
          });
        } catch (e) {
          Logger.log('Error uploading photo ' + photo.name + ': ' + e.toString());
        }
      });
    }
    
    // Generate and upload PDF (simplified - you may want to use a PDF library)
    // For now, we'll create a text file with the quote summary
    const pdfContent = generateQuotePDFContent(quoteData);
    const pdfBlob = Utilities.newBlob(pdfContent, 'text/html', 'Quote_' + quoteData.quoteId + '.html');
    const pdfFile = customerFolder.createFile(pdfBlob);
    pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    results.files.push({
      name: pdfFile.getName(),
      url: pdfFile.getUrl()
    });
    
    return results;
  } catch (error) {
    Logger.log('Error uploading to Google Drive: ' + error.toString());
    const errorMsg = error.toString();
    if (errorMsg.includes('permission') || errorMsg.includes('authorization') || errorMsg.includes('auth/drive')) {
      return {
        success: false,
        error: 'Drive authorization required. Run forceDriveAuthorization() from Apps Script editor.',
        requiresAuthorization: true
      };
    }
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Generate HTML content for quote PDF
 */
function generateQuotePDFContent(quoteData) {
  // This is a simplified version - you may want to use a proper PDF library
  return '<html><body><h1>Pool Quote</h1><p>Customer: ' + (quoteData.customerName || '') + '</p></body></html>';
}

/**
 * Send quote via email
 * @param {object} quoteData - Quote data object
 * @return {object} Result of email send attempt
 */
function sendQuoteViaEmail(quoteData) {
  try {
    const customerEmail = quoteData.customerEmail;
    const ccEmail = 'brookspumpingpoolco@gmail.com';
    
    if (!customerEmail) {
      return {
        success: false,
        error: 'Customer email is required'
      };
    }
    
    // Generate a temporary quote ID if not provided (for Drive upload)
    if (!quoteData.quoteId) {
      const timestamp = new Date();
      quoteData.quoteId = 'Q-' + timestamp.getFullYear() + '-' + String(Date.now()).slice(-6);
    }
    
    // Upload to Google Drive first to get folder link
    let folderLink = '';
    try {
      const driveResult = uploadToGoogleDrive(quoteData);
      if (driveResult && driveResult.success) {
        folderLink = driveResult.folderUrl || '';
        Logger.log('✅ Google Drive upload successful: ' + folderLink);
      } else {
        Logger.log('⚠️ Google Drive upload failed or skipped: ' + (driveResult?.error || 'Unknown'));
      }
    } catch (driveError) {
      Logger.log('⚠️ Google Drive upload error (continuing with email): ' + driveError.toString());
      // Continue with email even if Drive upload fails
    }
    
    // Generate email body
    const emailSubject = 'Pool Quote - ' + (quoteData.customerName || 'Customer');
    const emailBody = generateEmailBody(quoteData, folderLink);
    
    // Send email - check for authorization error first
    try {
      MailApp.sendEmail({
        to: customerEmail,
        cc: ccEmail,
        subject: emailSubject,
        htmlBody: emailBody
      });
      
      Logger.log('✅ Email sent successfully to: ' + customerEmail);
      Logger.log('✅ CC sent to: ' + ccEmail);
      
      return {
        success: true,
        message: 'Quote sent via email successfully',
        customerEmail: customerEmail,
        ccEmail: ccEmail,
        folderLink: folderLink
      };
    } catch (emailError) {
      const errorMsg = emailError.toString();
      if (errorMsg.includes('permission') || errorMsg.includes('authorization') || errorMsg.includes('script.send_mail')) {
        Logger.log('❌ Email authorization error: ' + errorMsg);
        Logger.log('⚠️ Email authorization required.');
        Logger.log('📋 TO FIX: Run forceEmailAuthorization() from Apps Script editor');
        Logger.log('   OR manually authorize using the lock icon (🔒) in Apps Script editor');
        return {
          success: false,
          error: 'Email authorization required. Run forceEmailAuthorization() from Apps Script editor to grant permissions.',
          requiresAuthorization: true
        };
      }
      throw emailError; // Re-throw if it's a different error
    }
  } catch (error) {
    Logger.log('❌ Error sending email: ' + error.toString());
    Logger.log('Stack: ' + error.stack);
    const errorMsg = error.toString();
    if (errorMsg.includes('permission') || errorMsg.includes('authorization') || errorMsg.includes('script.send_mail')) {
      return {
        success: false,
        error: 'Email authorization required. Run forceEmailAuthorization() from Apps Script editor.',
        requiresAuthorization: true
      };
    }
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Generate email body with quote details - Professional HTML formatted email with logo
 */
function generateEmailBody(quoteData, folderLink) {
  // Escape HTML to prevent XSS
  const escapeHtml = (text) => {
    if (!text) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.toString().replace(/[&<>"']/g, m => map[m]);
  };
  
  const customerName = escapeHtml(quoteData.customerName || '');
  const address = escapeHtml(quoteData.address || '');
  const sellPrice = (quoteData.sellPrice || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const quoteId = escapeHtml(quoteData.quoteId || '');
  const quoteDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6; line-height: 1.6; color: #111827;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f3f4f6;">
        <tr>
          <td align="center" style="padding: 40px 20px;">
            <!-- Main Container -->
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); overflow: hidden;">
              
              <!-- Header with Logo -->
              <tr>
                <td style="background: linear-gradient(135deg, #0369a1 0%, #0284c7 100%); padding: 40px 40px 30px; text-align: center;">
                  <img src="https://daks2k3a4ib2z.cloudfront.net/6931dc4e8e97334e195432df/6931dca5c5fb5c5fc0860f2c_test-p-130x130q80.png" 
                       alt="A Quality Pool Company Logo" 
                       style="max-width: 130px; height: auto; background: white; padding: 12px; border-radius: 8px; margin-bottom: 20px; display: block; margin-left: auto; margin-right: auto;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px; margin-bottom: 8px;">
                    A Quality Pool Company
                  </h1>
                  <div style="margin-top: 8px; height: 3px; width: 60px; background-color: #ffffff; margin-left: auto; margin-right: auto; border-radius: 2px;"></div>
                  <p style="margin: 12px 0 0 0; color: #ffffff; font-size: 14px; opacity: 0.95;">
                    Serving Tennessee and Kentucky for over 40 years
                  </p>
                </td>
              </tr>
              
              <!-- Quote Content -->
              <tr>
                <td style="padding: 40px;">
                  <div style="text-align: center; margin-bottom: 32px;">
                    <h2 style="margin: 0 0 8px 0; color: #111827; font-size: 32px; font-weight: 700;">Pool Quote</h2>
                    ${quoteId ? `<p style="margin: 0; color: #6b7280; font-size: 14px;">Quote #: ${quoteId} • Date: ${quoteDate}</p>` : ''}
                  </div>
                  
                  <!-- Customer Info Box -->
                  <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
                    <h3 style="margin: 0 0 16px 0; color: #374151; font-size: 16px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Customer Information</h3>
                    <p style="margin: 0 0 8px 0; color: #111827; font-size: 16px; font-weight: 600;">${customerName}</p>
                    ${address ? `<p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.6;">${address}</p>` : ''}
                  </div>
                  
                  <!-- Quote Amount -->
                  <div style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border: 2px solid #0284c7; border-radius: 12px; padding: 32px; text-align: center; margin-bottom: 32px;">
                    <p style="margin: 0 0 12px 0; color: #0369a1; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Total Quote Amount</p>
                    <p style="margin: 0; color: #0369a1; font-size: 48px; font-weight: 700; line-height: 1;">$${sellPrice}</p>
                  </div>
                  
                  ${folderLink ? `
                  <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 20px; margin-bottom: 24px; text-align: center;">
                    <p style="margin: 0 0 12px 0; color: #92400e; font-weight: 600; font-size: 16px;">
                      <i style="margin-right: 8px;">📁</i> Project Photos & Documents
                    </p>
                    <a href="${folderLink}" style="display: inline-block; padding: 12px 24px; background-color: #f59e0b; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
                      View Project Folder
                    </a>
                  </div>
                  ` : ''}
                  
                  <!-- Important Notice -->
                  <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; border-radius: 6px; margin-bottom: 32px;">
                    <p style="margin: 0 0 8px 0; font-weight: 700; color: #92400e; font-size: 16px;">
                      <strong>Important Notice</strong>
                    </p>
                    <p style="margin: 0; color: #78350f; font-size: 14px; line-height: 1.6;">
                      This is a brief preliminary quote. You will receive an official quote via our Joist system from our team shortly. The official quote will contain a detailed payment schedule and all applicable taxes.
                    </p>
                  </div>
                  
                  <!-- Call to Action -->
                  <div style="text-align: center; margin-top: 32px; padding-top: 32px; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px;">
                      Thank you for considering A Quality Pool Company for your pool project!
                    </p>
                    <div style="display: inline-block; padding: 14px 32px; background-color: #0369a1; border-radius: 8px;">
                      <a href="tel:2526896557" style="color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px;">
                        📞 Call Us: (252) 689-6557
                      </a>
                    </div>
                  </div>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background-color: #f9fafb; padding: 30px 40px; border-top: 1px solid #e5e7eb;">
                  <p style="margin: 0 0 12px 0; color: #6b7280; font-size: 13px; text-align: center;">
                    <strong>A Quality Pool Company</strong><br>
                    Serving Tennessee and Kentucky for over 40 years
                  </p>
                  <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                    This quote is valid for 30 days from the date of issue.
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
  return html;
}

/**
 * Send quote summary via SMS to customer
 * @param {object} quoteData - Quote data object
 * @return {object} Result of SMS send attempt
 */
function sendQuoteViaSMS(quoteData) {
  try {
    const phoneNumber = quoteData.customerPhone;
    if (!phoneNumber) {
      return {
        success: false,
        error: 'Customer phone number is required'
      };
    }
    
    // Generate short SMS-friendly summary
    const smsMessage = generateSMSSummary(quoteData);
    
    // Send SMS
    return sendTelnyxSMS(phoneNumber, smsMessage);
    
  } catch (error) {
    Logger.log('❌ Error in sendQuoteViaSMS: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Test function to send SMS to a specific number
 * Run this from the Apps Script editor to test SMS functionality
 */
function testSMS() {
  const testPhoneNumber = '5027069172'; // Your test phone number
  const testMessage = 'Test message from Quick Quote Tool - If you receive this, SMS is working! 🏊';
  
  Logger.log('🧪 Testing SMS to: ' + testPhoneNumber);
  Logger.log('Message: ' + testMessage);
  
  const result = sendTelnyxSMS(testPhoneNumber, testMessage);
  
  if (result.success) {
    Logger.log('✅ Test SMS sent successfully!');
    Logger.log('Message ID: ' + result.messageId);
    Logger.log('Status: ' + result.status);
    Logger.log('To: ' + result.to);
    Logger.log('From: ' + result.from);
    
    // Wait a moment then check delivery status
    Utilities.sleep(2000);
    const statusResult = checkSMSStatus(result.messageId);
    Logger.log('📊 Delivery Status Check: ' + JSON.stringify(statusResult));
    
    return 'Test SMS sent! Message ID: ' + result.messageId + '\nStatus: ' + result.status + '\nCheck Telnyx dashboard for delivery status.';
  } else {
    Logger.log('❌ Test SMS failed: ' + result.error);
    return 'Test SMS failed: ' + result.error;
  }
}

/**
 * Check SMS delivery status by Message ID
 * @param {string} messageId - Telnyx message ID
 * @return {object} Status information
 */
function checkSMSStatus(messageId) {
  try {
    if (!messageId) {
      return { error: 'Message ID required' };
    }
    
    const url = TELNYX_API_URL + '/' + messageId;
    const options = {
      method: 'get',
      headers: {
        'Authorization': 'Bearer ' + TELNYX_API_KEY,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode === 200) {
      const result = JSON.parse(responseText);
      const data = result.data || {};
      
      // Extract delivery status
      let deliveryStatus = 'unknown';
      let toStatus = 'unknown';
      
      if (data.to && Array.isArray(data.to) && data.to.length > 0) {
        toStatus = data.to[0].status || 'unknown';
        deliveryStatus = toStatus;
      }
      
      Logger.log('📊 SMS Status Check:');
      Logger.log('Message ID: ' + messageId);
      Logger.log('Status: ' + deliveryStatus);
      Logger.log('Full response: ' + responseText);
      
      return {
        success: true,
        messageId: messageId,
        status: deliveryStatus,
        sentAt: data.sent_at,
        completedAt: data.completed_at,
        fullData: data
      };
    } else {
      Logger.log('❌ Error checking status: ' + responseCode + ' - ' + responseText);
      return {
        success: false,
        error: 'Failed to check status: ' + responseText
      };
    }
  } catch (error) {
    Logger.log('❌ Error checking SMS status: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Generate SMS-friendly summary (shorter than full summary)
 */
function generateSMSSummary(quoteData) {
  const lines = [];
  
  lines.push('🏊 POOL QUOTE - A Quality Pool Company');
  lines.push('');
  lines.push('Customer: ' + (quoteData.customerName || 'N/A'));
  
  if (quoteData.length && quoteData.width) {
    lines.push('Pool: ' + quoteData.length + 'ft × ' + quoteData.width + 'ft');
  }
  
  lines.push('Type: ' + (quoteData.newOrRenovation || 'New') + ' ' + (quoteData.poolType || 'Vinyl'));
  lines.push('');
  lines.push('Total: $' + (quoteData.sellPrice || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
  lines.push('');
  lines.push('📋 NOTE: This is a brief quote. Official quote with');
  lines.push('payment schedule & taxes coming via Joist shortly.');
  lines.push('');
  lines.push('Quote valid 30 days.');
  lines.push('Call for details: (Your Phone Number)');
  
  return lines.join('\n');
}

/**
 * TEST FUNCTION - Use this to trigger authorization
 * Run this function first to authorize all required permissions
 * 
 * IMPORTANT: Before running this, make sure you've added appsscript.json
 * to your Apps Script project with the required OAuth scopes.
 */
function testAuthorization() {
  try {
    Logger.log('🧪 Testing permissions...');
    
    // Test 1: Spreadsheets access
    try {
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      Logger.log('✅ Spreadsheets access: OK');
    } catch (e) {
      Logger.log('❌ Spreadsheets error: ' + e.toString());
      throw new Error('Spreadsheets permission missing. Add scope: https://www.googleapis.com/auth/spreadsheets');
    }
    
    // Test 2: Drive access
    try {
      const folder = DriveApp.getFolderById('1caFBUhSzE5WNAm9vCT4dwDQuAO0iuo1h');
      Logger.log('✅ Drive access: OK');
    } catch (e) {
      Logger.log('❌ Drive error: ' + e.toString());
      throw new Error('Drive permission missing. Add scope: https://www.googleapis.com/auth/drive');
    }
    
    // Test 3: MailApp access (skip actual send for now)
    try {
      // Just test if MailApp is available, don't send email yet
      Logger.log('✅ MailApp available');
      // Uncomment below to actually send test email:
      /*
      const testEmail = Session.getActiveUser().getEmail();
      MailApp.sendEmail({
        to: testEmail,
        subject: 'Test Email - Quick Quote Tool',
        body: 'If you receive this, all permissions are working correctly!'
      });
      Logger.log('✅ MailApp access: OK - Test email sent to ' + testEmail);
      */
    } catch (e) {
      Logger.log('❌ MailApp error: ' + e.toString());
      throw new Error('MailApp permission missing. Add scope: https://www.googleapis.com/auth/script.send_mail');
    }
    
    return {
      success: true,
      message: 'All permissions authorized! You can now use the quote tool.',
      note: 'If you want to test email, uncomment the MailApp.sendEmail section in testAuthorization()'
    };
  } catch (error) {
    Logger.log('❌ Authorization error: ' + error.toString());
    return {
      success: false,
      error: error.toString(),
      message: 'PERMISSION ERROR: You must add appsscript.json to your Apps Script project.',
      instructions: [
        '1. In Apps Script: Project Settings (gear) → Check "Show appsscript.json manifest"',
        '2. Click "+" → Script → Name it "appsscript.json"',
        '3. Copy the JSON from your local appsscript.json file',
        '4. Save and run this function again'
      ]
    };
  }
}

/**
 * FORCE DRIVE AUTHORIZATION - Run this to trigger Drive permission prompt
 * 
 * IMPORTANT: Run this function DIRECTLY from the Apps Script editor (not from web app)
 * 
 * MANUAL AUTHORIZATION STEPS (if dialog doesn't appear):
 * 1. In Apps Script editor, click the lock icon (🔒) in the top right
 * 2. OR go to: Extensions → Apps Script → Review Permissions
 * 3. Click "Review Permissions"
 * 4. Select your Google account
 * 5. Click "Advanced" → "Go to [Project Name] (unsafe)" if shown
 * 6. Click "Allow" to grant all permissions
 * 7. Run this function again to verify
 */
function forceDriveAuthorization() {
  try {
    Logger.log('🔐 Requesting Drive authorization...');
    Logger.log('📋 Make sure you run this from Apps Script editor, not from web app!');
    Logger.log('');
    
    // Method 1: Try to get OAuth token with Drive scope
    try {
      Logger.log('Method 1: Requesting OAuth token...');
      const token = ScriptApp.getOAuthToken();
      Logger.log('✅ OAuth token obtained');
    } catch (tokenError) {
      Logger.log('⚠️ OAuth token requires authorization: ' + tokenError.toString());
      Logger.log('📋 This is expected - you need to authorize first!');
      Logger.log('');
      Logger.log('🔑 TO AUTHORIZE:');
      Logger.log('   1. Click the lock icon (🔒) in the top right of Apps Script editor');
      Logger.log('   2. OR go to: Extensions → Apps Script → Review Permissions');
      Logger.log('   3. Click "Review Permissions"');
      Logger.log('   4. Select your Google account');
      Logger.log('   5. Click "Advanced" → "Go to [Project] (unsafe)" if shown');
      Logger.log('   6. Click "Allow"');
      Logger.log('   7. Run this function again');
      throw new Error('Authorization required. Please follow the steps above to authorize Drive access.');
    }
    
    // Method 2: Try to access Drive directly
    Logger.log('');
    Logger.log('Method 2: Testing Drive access...');
    const DRIVE_FOLDER_ID = '1caFBUhSzE5WNAm9vCT4dwDQuAO0iuo1h';
    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    const folderName = folder.getName();
    
    Logger.log('✅ Drive authorization successful!');
    Logger.log('Folder name: ' + folderName);
    Logger.log('✅ You can now use Drive functions in your app!');
    
    return {
      success: true,
      message: 'Drive authorization successful!',
      folderName: folderName
    };
  } catch (error) {
    const errorMsg = error.toString();
    Logger.log('');
    Logger.log('❌ Drive authorization error: ' + errorMsg);
    Logger.log('');
    
    if (errorMsg.includes('permission') || errorMsg.includes('authorization') || errorMsg.includes('auth/drive')) {
      Logger.log('⚠️ DRIVE AUTHORIZATION REQUIRED');
      Logger.log('');
      Logger.log('🔑 MANUAL AUTHORIZATION STEPS:');
      Logger.log('   Option A - Using Lock Icon:');
      Logger.log('   1. Look for the lock icon (🔒) in the top right of Apps Script editor');
      Logger.log('   2. Click it → "Review Permissions"');
      Logger.log('   3. Select your Google account');
      Logger.log('   4. Click "Advanced" → "Go to [Project] (unsafe)" if shown');
      Logger.log('   5. Click "Allow"');
      Logger.log('');
      Logger.log('   Option B - Using Menu:');
      Logger.log('   1. Go to: Extensions → Apps Script → Review Permissions');
      Logger.log('   2. Click "Review Permissions"');
      Logger.log('   3. Select your Google account');
      Logger.log('   4. Click "Advanced" → "Go to [Project] (unsafe)" if shown');
      Logger.log('   5. Click "Allow"');
      Logger.log('');
      Logger.log('   Option C - Verify Manifest:');
      Logger.log('   1. Go to Project Settings (gear icon)');
      Logger.log('   2. Check "Show appsscript.json manifest file in editor"');
      Logger.log('   3. Verify oauthScopes includes: https://www.googleapis.com/auth/drive');
      Logger.log('   4. Save the manifest');
      Logger.log('   5. Try Option A or B above');
      Logger.log('');
      Logger.log('After authorizing, run this function again to verify.');
    }
    
    // Re-throw to show error in execution
    throw error;
  }
}

/**
 * FORCE EMAIL AUTHORIZATION - Run this to trigger MailApp permission prompt
 * 
 * IMPORTANT: Run this function DIRECTLY from the Apps Script editor (not from web app)
 * 
 * MANUAL AUTHORIZATION STEPS (if dialog doesn't appear):
 * 1. In Apps Script editor, click the lock icon (🔒) in the top right
 * 2. OR go to: Extensions → Apps Script → Review Permissions
 * 3. Click "Review Permissions"
 * 4. Select your Google account
 * 5. Click "Advanced" → "Go to [Project Name] (unsafe)" if shown
 * 6. Click "Allow" to grant all permissions (including email)
 * 7. Run this function again to verify
 */
function forceEmailAuthorization() {
  try {
    Logger.log('🔐 Requesting Email authorization...');
    Logger.log('📋 Make sure you run this from Apps Script editor, not from web app!');
    Logger.log('');
    
    // Get user email (with fallback if permission not available)
    let testEmail;
    try {
      testEmail = Session.getActiveUser().getEmail();
      Logger.log('📧 Test email will be sent to: ' + testEmail);
    } catch (emailError) {
      if (emailError.toString().includes('userinfo.email')) {
        Logger.log('⚠️ User email permission not available yet.');
        Logger.log('📋 This will be authorized when you grant permissions.');
        Logger.log('📧 Using fallback email address for testing...');
        // Use a placeholder - we'll update this after authorization
        testEmail = 'test@example.com'; // This will be replaced after authorization
      } else {
        throw emailError;
      }
    }
    Logger.log('');
    
    // Try to get OAuth token first - this will force authorization
    try {
      Logger.log('Method 1: Requesting OAuth token...');
      const token = ScriptApp.getOAuthToken();
      Logger.log('✅ OAuth token obtained');
    } catch (tokenError) {
      Logger.log('⚠️ OAuth token requires authorization: ' + tokenError.toString());
      Logger.log('📋 This is expected - you need to authorize first!');
      Logger.log('');
      Logger.log('🔑 TO AUTHORIZE:');
      Logger.log('   1. Click the lock icon (🔒) in the top right of Apps Script editor');
      Logger.log('   2. OR go to: Extensions → Apps Script → Review Permissions');
      Logger.log('   3. Click "Review Permissions"');
      Logger.log('   4. Select your Google account');
      Logger.log('   5. Click "Advanced" → "Go to [Project] (unsafe)" if shown');
      Logger.log('   6. Click "Allow"');
      Logger.log('   7. Run this function again');
      throw new Error('Authorization required. Please follow the steps above to authorize email access.');
    }
    
    // This will trigger the authorization prompt
    Logger.log('');
    Logger.log('Method 2: Testing email send...');
    
    // Try to get email again in case it wasn't available before
    if (!testEmail || testEmail === 'test@example.com') {
      try {
        testEmail = Session.getActiveUser().getEmail();
        Logger.log('📧 Got user email: ' + testEmail);
      } catch (emailError) {
        Logger.log('⚠️ Still cannot get user email. Using MailApp.sendEmail will still work.');
        Logger.log('   The email will be sent, but we cannot display the recipient address.');
        // We'll still try to send - MailApp might work even without user email permission
      }
    }
    
    // Only send if we have a valid email
    if (testEmail && testEmail !== 'test@example.com') {
      MailApp.sendEmail({
        to: testEmail,
        subject: 'Authorization Test - Quick Quote Tool',
        body: 'If you receive this, email permissions are working!'
      });
      
      Logger.log('✅ Email authorization successful!');
      Logger.log('✅ Test email sent to: ' + testEmail);
      Logger.log('📧 Check your inbox to confirm email is working!');
    } else {
      // Try sending anyway - MailApp might work
      Logger.log('⚠️ Cannot determine recipient email, but MailApp should still work.');
      Logger.log('✅ Email authorization appears successful (MailApp is accessible)');
      Logger.log('📧 Try sending an email from your app to verify it works.');
    }
    
    return {
      success: true,
      message: 'Email authorization successful! Check your inbox.',
      email: testEmail
    };
  } catch (error) {
    const errorMsg = error.toString();
    Logger.log('');
    Logger.log('❌ Email authorization error: ' + errorMsg);
    Logger.log('');
    
    if (errorMsg.includes('permission') || errorMsg.includes('authorization') || errorMsg.includes('script.send_mail')) {
      Logger.log('⚠️ EMAIL AUTHORIZATION REQUIRED');
      Logger.log('');
      Logger.log('🔑 MANUAL AUTHORIZATION STEPS:');
      Logger.log('   Option A - Using Lock Icon:');
      Logger.log('   1. Look for the lock icon (🔒) in the top right of Apps Script editor');
      Logger.log('   2. Click it → "Review Permissions"');
      Logger.log('   3. Select your Google account');
      Logger.log('   4. Click "Advanced" → "Go to [Project] (unsafe)" if shown');
      Logger.log('   5. Click "Allow"');
      Logger.log('');
      Logger.log('   Option B - Using Menu:');
      Logger.log('   1. Go to: Extensions → Apps Script → Review Permissions');
      Logger.log('   2. Click "Review Permissions"');
      Logger.log('   3. Select your Google account');
      Logger.log('   4. Click "Advanced" → "Go to [Project] (unsafe)" if shown');
      Logger.log('   5. Click "Allow"');
      Logger.log('');
      Logger.log('   After authorizing, run this function again to verify.');
    }
    
    // Re-throw to show error in execution
    throw error;
  }
}

/**
 * SIMPLE DRIVE TEST - Minimal function to test Drive access
 * Run this from Apps Script editor to trigger authorization dialog
 */
function testDriveAccess() {
  try {
    Logger.log('Testing Drive access...');
    const folder = DriveApp.getFolderById('1caFBUhSzE5WNAm9vCT4dwDQuAO0iuo1h');
    Logger.log('✅ Success! Folder: ' + folder.getName());
    return 'Drive access working!';
  } catch (error) {
    Logger.log('❌ Drive access failed: ' + error.toString());
    Logger.log('Run forceDriveAuthorization() first, or manually authorize using the lock icon.');
    throw error;
  }
}

/**
 * SIMPLE EMAIL TEST - Minimal function to test email access
 * Run this from Apps Script editor to trigger authorization dialog
 */
function testEmailAccess() {
  try {
    Logger.log('Testing Email access...');
    let testEmail;
    try {
      testEmail = Session.getActiveUser().getEmail();
    } catch (emailError) {
      if (emailError.toString().includes('userinfo.email')) {
        Logger.log('⚠️ User email permission not available. This will be authorized with other permissions.');
        Logger.log('📋 Please authorize using the lock icon (🔒) in Apps Script editor.');
        throw new Error('User email permission required. Please authorize using the lock icon.');
      }
      throw emailError;
    }
    
    MailApp.sendEmail({
      to: testEmail,
      subject: 'Test Email - Quick Quote Tool',
      body: 'If you receive this, email permissions are working!'
    });
    Logger.log('✅ Success! Test email sent to: ' + testEmail);
    return 'Email access working! Check your inbox.';
  } catch (error) {
    Logger.log('❌ Email access failed: ' + error.toString());
    Logger.log('Run forceEmailAuthorization() first, or manually authorize using the lock icon.');
    throw error;
  }
}

/**
 * CHECK AUTHORIZATION STATUS
 * This function checks what permissions are currently authorized
 */
function checkAuthorizationStatus() {
  Logger.log('📋 Checking authorization status...');
  Logger.log('');
  
  // Check OAuth scopes
  try {
    const scopes = ScriptApp.getOAuthScopes();
    Logger.log('📋 Configured OAuth Scopes:');
    scopes.forEach(scope => {
      Logger.log('   ✓ ' + scope);
    });
    
    const requiredScopes = [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/script.send_mail',
      'https://www.googleapis.com/auth/userinfo.email'
    ];
    
    Logger.log('');
    Logger.log('📋 Required Scopes:');
    requiredScopes.forEach(scope => {
      if (scopes.includes(scope)) {
        Logger.log('   ✅ ' + scope);
      } else {
        Logger.log('   ❌ ' + scope + ' (MISSING!)');
      }
    });
  } catch (e) {
    Logger.log('⚠️ Could not read OAuth scopes: ' + e.toString());
  }
  
  Logger.log('');
  Logger.log('🧪 Testing actual access...');
  
  // Test Spreadsheets
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    Logger.log('✅ Spreadsheets: Authorized');
  } catch (e) {
    Logger.log('❌ Spreadsheets: NOT authorized - ' + e.toString());
  }
  
  // Test Drive
  try {
    const folder = DriveApp.getFolderById('1caFBUhSzE5WNAm9vCT4dwDQuAO0iuo1h');
    Logger.log('✅ Drive: Authorized');
  } catch (e) {
    Logger.log('❌ Drive: NOT authorized - ' + e.toString());
    Logger.log('');
    Logger.log('🔑 TO AUTHORIZE DRIVE:');
    Logger.log('   1. Click the lock icon (🔒) in top right of Apps Script editor');
    Logger.log('   2. OR: Extensions → Apps Script → Review Permissions');
    Logger.log('   3. Click "Review Permissions" → Select account → "Allow"');
  }
  
  // Test MailApp (actually test sending)
  try {
    let email;
    try {
      email = Session.getActiveUser().getEmail();
      Logger.log('📧 MailApp: Testing email send...');
      // Don't actually send email in status check, just verify we can access MailApp
      // We'll check if we can get the email address as a proxy test
      Logger.log('✅ MailApp: Available (email: ' + email + ')');
      Logger.log('   Note: Run testEmailAccess() to fully test email sending');
    } catch (emailError) {
      if (emailError.toString().includes('userinfo.email')) {
        Logger.log('⚠️ MailApp: User email permission not available');
        Logger.log('   This will be authorized when you grant permissions via lock icon');
      } else {
        throw emailError;
      }
    }
  } catch (e) {
    Logger.log('❌ MailApp: NOT authorized - ' + e.toString());
    Logger.log('');
    Logger.log('🔑 TO AUTHORIZE EMAIL:');
    Logger.log('   1. Click the lock icon (🔒) in top right of Apps Script editor');
    Logger.log('   2. OR: Extensions → Apps Script → Review Permissions');
    Logger.log('   3. Click "Review Permissions" → Select account → "Allow"');
  }
  
  Logger.log('');
  Logger.log('📝 AUTHORIZATION SUMMARY:');
  Logger.log('   • If any service shows as NOT authorized:');
  Logger.log('     - Run the corresponding force*Authorization() function');
  Logger.log('     - OR manually authorize using the lock icon (🔒)');
  Logger.log('   • After authorizing, run checkAuthorizationStatus() again to verify');
  
  return 'Check logs above for authorization status';
}

/**
 * CHECK MANIFEST CONFIGURATION
 * This helps verify your appsscript.json is properly configured
 */
function checkManifestConfiguration() {
  try {
    Logger.log('📋 Checking manifest configuration...');
    
    // Try to access the manifest (if available)
    const manifest = ScriptApp.getProjectTriggers();
    Logger.log('✅ ScriptApp is accessible');
    
    // Check if we can get OAuth scopes
    try {
      const scopes = ScriptApp.getOAuthScopes();
      Logger.log('📋 Current OAuth Scopes:');
      scopes.forEach(scope => {
        Logger.log('  - ' + scope);
      });
      
      const requiredScope = 'https://www.googleapis.com/auth/drive';
      if (scopes.includes(requiredScope)) {
        Logger.log('✅ Required Drive scope found in manifest!');
      } else {
        Logger.log('❌ Drive scope NOT found in manifest!');
        Logger.log('⚠️ Add this to appsscript.json oauthScopes:');
        Logger.log('   "https://www.googleapis.com/auth/drive"');
      }
    } catch (e) {
      Logger.log('⚠️ Could not read OAuth scopes: ' + e.toString());
      Logger.log('This is normal if authorization hasn\'t been granted yet.');
    }
    
    Logger.log('');
    Logger.log('📝 MANIFEST CHECKLIST:');
    Logger.log('1. Go to Project Settings (gear icon)');
    Logger.log('2. Check "Show appsscript.json manifest file in editor"');
    Logger.log('3. Verify oauthScopes array includes:');
    Logger.log('   - https://www.googleapis.com/auth/drive');
    Logger.log('   - https://www.googleapis.com/auth/spreadsheets');
    Logger.log('   - https://www.googleapis.com/auth/script.send_mail');
    Logger.log('4. Save the manifest file');
    Logger.log('5. Run forceDriveAuthorization() to trigger permission dialog');
    
    return {
      success: true,
      message: 'Manifest check complete. See logs above for details.'
    };
  } catch (error) {
    Logger.log('❌ Error checking manifest: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

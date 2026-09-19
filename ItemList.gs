/**
 * Item List Management System
 * 
 * Standalone webapp for managing Price Book items
 * Allows browsing, editing, adding, and deleting items from Price Book sheet
 * 
 * SETUP:
 * 1. Deploy as Web App
 * 2. Set Execute as: Me
 * 3. Set Who has access: Anyone
 * 4. Add Web App URL to Dashboard_Embed.html
 */

// Configuration
const SPREADSHEET_ID = '1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0';
const PRICE_BOOK_SHEET = 'Price book';
const LABOR_SHEET = 'Labor';

/**
 * Serve the HTML interface
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('ItemListUI')
    .setTitle('Item List Manager')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Handle POST requests (for API calls from InvoiceEstimateUI)
 */
function doPost(e) {
  try {
    const action = e.parameter.action;
    
    if (!action) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'No action parameter provided'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    let result;
    switch(action) {
      case 'addItemToPriceBook':
        const itemData = JSON.parse(e.parameter.itemData || e.parameter.data || '{}');
        result = addItemToPriceBook(itemData);
        break;
      case 'addLaborToPriceBook':
        const laborData = JSON.parse(e.parameter.laborData || e.parameter.data || '{}');
        result = addLaborToPriceBook(laborData);
        break;
      case 'updateItemImage':
        result = updateItemImage(e.parameter.name || e.parameter.code, e.parameter.imageUrl);
        break;
      // Price Comparison actions
      case 'saveWebsiteCredentials':
        result = saveWebsiteCredentials(
          e.parameter.siteName,
          e.parameter.username,
          e.parameter.password
        );
        break;
      case 'getWebsiteCredentials':
        result = getWebsiteCredentials(e.parameter.siteName);
        break;
      case 'deleteWebsiteCredentials':
        result = deleteWebsiteCredentials(e.parameter.siteName);
        break;
      case 'getAllWebsiteCredentialsStatus':
        result = getAllWebsiteCredentialsStatus();
        break;
      case 'comparePrices':
        result = comparePrices(e.parameter.productName);
        break;
      default:
        result = { success: false, error: 'Invalid action: ' + action };
    }
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log('ItemList doPost error: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Get all items from Price Book (including inactive for management)
 */
function getAllItems() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(PRICE_BOOK_SHEET);
    
    if (!sheet) {
      return {
        success: false,
        error: 'Price Book sheet not found'
      };
    }
    
    // Get the actual last row with data (more reliable than getDataRange)
    const lastRow = sheet.getLastRow();
    if (lastRow < 7) {
      return {
        success: true,
        items: [],
        byCategory: {}
      };
    }
    
    // Only read rows 7 to lastRow (data starts at row 7)
    const data = sheet.getRange(7, 1, lastRow - 6, 9).getValues();
    
    const items = [];
    const byCategory = {};
    
    // Get formulas and rich text values to extract hyperlink URLs
    const formulas = sheet.getRange(7, 1, lastRow - 6, 9).getFormulas();
    const richTextValues = sheet.getRange(7, 8, lastRow - 6, 1).getRichTextValues(); // Column H for image URLs
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const brand = (row[0] || '').toString().trim();
      const itemCode = (row[1] || '').toString().trim();
      const itemName = (row[2] || '').toString().trim();
      const category = (row[3] || 'Other').toString().trim();
      const unit = (row[4] || 'Each').toString().trim();
      const price = parseFloat(row[5]) || 0;
      const description = (row[6] || '').toString().trim();
      
      // Skip rows with no name (code is optional)
      if (!itemName) {
        continue;
      }
      
      // Extract image URL - handle hyperlinks, formulas, and plain text
      let imageUrl = '';
      const imageFormula = formulas[i] && formulas[i][7] ? formulas[i][7] : '';
      
      if (imageFormula && imageFormula.toString().startsWith('=HYPERLINK')) {
        // Extract URL from HYPERLINK formula: =HYPERLINK("URL","text")
        const urlMatch = imageFormula.match(/HYPERLINK\("([^"]+)"/);
        if (urlMatch && urlMatch[1]) {
          imageUrl = urlMatch[1];
        }
      } else if (richTextValues[i] && richTextValues[i][0]) {
        // Try to get URL from rich text (if cell has hyperlink formatting)
        const richText = richTextValues[i][0];
        const runs = richText.getRuns();
        for (let j = 0; j < runs.length; j++) {
          const url = runs[j].getLinkUrl();
          if (url) {
            imageUrl = url;
            break;
          }
        }
      }
      
      // Fallback to plain value if no hyperlink found
      if (!imageUrl) {
        imageUrl = (row[7] || '').toString().trim();
      }
      
      const active = row[8] === true || row[8] === 'TRUE' || row[8] === true || row[8] === 1 || row[8] === '1';
      
      // ONLY show items that are active (column I must be checked/true)
      if (!active) {
        continue; // Skip inactive items
      }
      
      const item = {
        rowIndex: i + 7, // 1-based row index for sheet (data starts at row 7)
        brand: brand,
        code: itemCode,
        name: itemName,
        category: category,
        unit: unit,
        price: price,
        description: description,
        imageUrl: imageUrl,
        active: active
      };
      
      items.push(item);
      
      if (!byCategory[category]) {
        byCategory[category] = [];
      }
      byCategory[category].push(item);
    }
    
    return {
      success: true,
      items: items,
      byCategory: byCategory
    };
  } catch (error) {
    Logger.log('Error getting all items: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Get all unique categories from Price Book
 */
function getCategories() {
  try {
    const result = getAllItems();
    if (!result.success) {
      return { success: false, error: result.error };
    }
    
    const categories = Object.keys(result.byCategory).sort();
    return {
      success: true,
      categories: categories
    };
  } catch (error) {
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Update an item in Price Book
 */
function updateItem(itemData) {
  try {
    Logger.log('=== updateItem START ===');
    Logger.log('Received itemData: ' + JSON.stringify(itemData));
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(PRICE_BOOK_SHEET);
    
    if (!sheet) {
      return {
        success: false,
        error: 'Price Book sheet not found'
      };
    }
    
    const rowIndex = itemData.rowIndex;
    if (!rowIndex || rowIndex < 7) {
      return {
        success: false,
        error: 'Invalid row index'
      };
    }
    
    Logger.log('Updating row: ' + rowIndex);
    Logger.log('Description being saved to Column G: ' + (itemData.description || '').substring(0, 100));
    Logger.log('ImageUrl being saved to Column H: ' + (itemData.imageUrl || '').substring(0, 100));
    
    // Update columns: A=Brand, B=Code, C=Name, D=Category, E=Unit, F=Price, G=Description, H=Image, I=Active
    if (itemData.brand !== undefined) sheet.getRange(rowIndex, 1).setValue(itemData.brand);
    if (itemData.code !== undefined) sheet.getRange(rowIndex, 2).setValue(itemData.code);
    if (itemData.name !== undefined) sheet.getRange(rowIndex, 3).setValue(itemData.name);
    if (itemData.category !== undefined) sheet.getRange(rowIndex, 4).setValue(itemData.category);
    if (itemData.unit !== undefined) sheet.getRange(rowIndex, 5).setValue(itemData.unit);
    if (itemData.price !== undefined) sheet.getRange(rowIndex, 6).setValue(parseFloat(itemData.price) || 0);
    if (itemData.description !== undefined) sheet.getRange(rowIndex, 7).setValue(itemData.description);  // Column G
    if (itemData.imageUrl !== undefined) sheet.getRange(rowIndex, 8).setValue(itemData.imageUrl);      // Column H
    if (itemData.active !== undefined) sheet.getRange(rowIndex, 9).setValue(itemData.active === true || itemData.active === 'true');
    
    SpreadsheetApp.flush();
    Logger.log('=== updateItem SUCCESS ===');
    
    return {
      success: true,
      message: 'Item updated successfully'
    };
  } catch (error) {
    Logger.log('Error updating item: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Add a new item to Price Book
 */
function addItem(itemData) {
  try {
    Logger.log('=== addItem START ===');
    Logger.log('Received itemData: ' + JSON.stringify(itemData));
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    Logger.log('Spreadsheet opened: ' + spreadsheet.getName());
    
    const sheet = spreadsheet.getSheetByName(PRICE_BOOK_SHEET);
    Logger.log('Looking for sheet: ' + PRICE_BOOK_SHEET);
    
    if (!sheet) {
      Logger.log('ERROR: Sheet not found');
      return {
        success: false,
        error: 'Price Book sheet not found'
      };
    }
    
    Logger.log('Sheet found: ' + sheet.getName());
    
    if (!itemData.name) {
      Logger.log('ERROR: Item name is missing');
      return {
        success: false,
        error: 'Item name is required'
      };
    }
    
    // Find next row where columns B, C, and F are all blank
    const lastRow = sheet.getLastRow();
    const maxRow = Math.max(lastRow, 6); // Ensure we check at least from row 7
    Logger.log('Last row: ' + lastRow);
    
    let nextRow = null;
    
    // Scan from row 7 onwards to find first empty row
    for (let row = 7; row <= maxRow + 100; row++) { // Check beyond lastRow for gaps
      const codeVal = sheet.getRange(row, 2).getValue(); // Column B
      const nameVal = sheet.getRange(row, 3).getValue(); // Column C
      const priceVal = sheet.getRange(row, 6).getValue(); // Column F
      
      if (!codeVal && !nameVal && !priceVal) {
        nextRow = row;
        Logger.log('Found empty row at: ' + row + ' (checked columns B, C, F)');
        break;
      }
    }
    
    if (!nextRow) {
      Logger.log('ERROR: Could not find empty row');
      return {
        success: false,
        error: 'Could not find empty row in sheet'
      };
    }
    
    Logger.log('Using row: ' + nextRow);
    
    // Log what we're receiving for description and imageUrl
    Logger.log('Description field value: ' + (itemData.description || '').substring(0, 100));
    Logger.log('ImageUrl field value: ' + (itemData.imageUrl || '').substring(0, 100));
    
    const rowData = [
      itemData.brand || '',          // Column A
      itemData.code || '',           // Column B
      itemData.name,                 // Column C
      itemData.category || 'Other',  // Column D
      itemData.unit || 'Each',       // Column E
      parseFloat(itemData.price) || 0, // Column F
      itemData.description || '',    // Column G (Description)
      itemData.imageUrl || '',       // Column H (Image URL)
      itemData.active !== false      // Column I
    ];
    
    Logger.log('Row data to write (columns A-I): ' + JSON.stringify(rowData));
    
    // Write all values at once for better performance
    sheet.getRange(nextRow, 1, 1, 9).setValues([rowData]);
    Logger.log('Data written to sheet');
    
    SpreadsheetApp.flush();
    Logger.log('Flush completed');
    
    // Verify the data was written
    const verifyData = sheet.getRange(nextRow, 1, 1, 9).getValues()[0];
    Logger.log('Verification read: ' + JSON.stringify(verifyData));
    
    Logger.log('=== addItem SUCCESS ===');
    return {
      success: true,
      message: 'Item added successfully',
      rowIndex: nextRow
    };
  } catch (error) {
    Logger.log('Error adding item: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Delete/deactivate an item
 */
function deleteItem(rowIndex) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(PRICE_BOOK_SHEET);
    
    if (!sheet) {
      return {
        success: false,
        error: 'Price Book sheet not found'
      };
    }
    
    if (!rowIndex || rowIndex < 7) {
      return {
        success: false,
        error: 'Invalid row index'
      };
    }
    
    // Deactivate instead of deleting (set Active column to FALSE)
    sheet.getRange(rowIndex, 9).setValue(false);
    
    return {
      success: true,
      message: 'Item deactivated successfully'
    };
  } catch (error) {
    Logger.log('Error deleting item: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Move an item to a new row position
 */
function moveItem(rowIndex, newRowIndex) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(PRICE_BOOK_SHEET);
    
    if (!sheet) {
      return {
        success: false,
        error: 'Price Book sheet not found'
      };
    }
    
    if (!rowIndex || rowIndex < 7) {
      return {
        success: false,
        error: 'Invalid source row index'
      };
    }
    
    if (!newRowIndex || newRowIndex < 7) {
      return {
        success: false,
        error: 'Invalid destination row index. Row must be 7 or higher (data starts at row 7)'
      };
    }
    
    if (rowIndex === newRowIndex) {
      return {
        success: false,
        error: 'Source and destination are the same'
      };
    }
    
    // Get the entire row data (values and formulas) - save it first
    const sourceRange = sheet.getRange(rowIndex, 1, 1, 9);
    const rowData = sourceRange.getValues()[0];
    const rowFormulas = sourceRange.getFormulas()[0];
    
    // Save data and formulas
    const savedData = [];
    const savedFormulas = [];
    for (let col = 0; col < 9; col++) {
      savedData.push(rowData[col]);
      savedFormulas.push(rowFormulas[col]);
    }
    
    // Now do the move operation
    if (newRowIndex > rowIndex) {
      // Moving down: insert row after destination, write data, delete source
      sheet.insertRowAfter(newRowIndex);
      const targetRange = sheet.getRange(newRowIndex + 1, 1, 1, 9);
      // Write saved data/formulas to new location
      for (let col = 0; col < 9; col++) {
        if (savedFormulas[col] && savedFormulas[col].toString().trim() !== '') {
          targetRange.getCell(1, col + 1).setFormula(savedFormulas[col]);
        } else {
          targetRange.getCell(1, col + 1).setValue(savedData[col]);
        }
      }
      // Delete original row
      sheet.deleteRow(rowIndex);
    } else {
      // Moving up: insert row before destination, write data, delete source (now shifted)
      sheet.insertRowBefore(newRowIndex);
      const targetRange = sheet.getRange(newRowIndex, 1, 1, 9);
      // Write saved data/formulas to new location
      for (let col = 0; col < 9; col++) {
        if (savedFormulas[col] && savedFormulas[col].toString().trim() !== '') {
          targetRange.getCell(1, col + 1).setFormula(savedFormulas[col]);
        } else {
          targetRange.getCell(1, col + 1).setValue(savedData[col]);
        }
      }
      // Delete original row (now shifted down by 1 because we inserted above)
      sheet.deleteRow(rowIndex + 1);
    }
    
    return {
      success: true,
      message: 'Item moved successfully',
      newRowIndex: newRowIndex
    };
  } catch (error) {
    Logger.log('Error moving item: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Update item price (for sync with Quick Quote)
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
        sheet.getRange(i + 1, 6).setValue(parseFloat(newPrice) || 0);
        return {
          success: true,
          message: 'Price updated successfully',
          rowIndex: i + 1
        };
      }
    }
    
    return {
      success: false,
      error: 'Item code not found'
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
 * Search items by name, code, or category
 */
function searchItems(searchTerm) {
  try {
    const result = getAllItems();
    if (!result.success) {
      return result;
    }
    
    const term = (searchTerm || '').toLowerCase().trim();
    if (!term) {
      return result; // Return all items if no search term
    }
    
    const filtered = result.items.filter(item => {
      return (
        (item.name || '').toLowerCase().includes(term) ||
        (item.code || '').toLowerCase().includes(term) ||
        (item.brand || '').toLowerCase().includes(term) ||
        (item.category || '').toLowerCase().includes(term) ||
        (item.description || '').toLowerCase().includes(term)
      );
    });
    
    return {
      success: true,
      items: filtered,
      byCategory: groupByCategory(filtered)
    };
  } catch (error) {
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Helper function to group items by category
 */
function groupByCategory(items) {
  const byCategory = {};
  items.forEach(item => {
    const cat = item.category || 'Other';
    if (!byCategory[cat]) {
      byCategory[cat] = [];
    }
    byCategory[cat].push(item);
  });
  return byCategory;
}

/**
 * Add item to Price Book (called from InvoiceEstimateUI)
 */
function addItemToPriceBook(itemData) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(PRICE_BOOK_SHEET);
    
    if (!sheet) {
      return { success: false, error: 'Price Book sheet not found' };
    }
    
    if (!itemData.name) {
      return { success: false, error: 'Item name is required' };
    }
    
    const lastRow = sheet.getLastRow();
    const nextRow = lastRow < 6 ? 7 : lastRow + 1;
    
    sheet.getRange(nextRow, 1, 1, 9).setValues([[
      itemData.brand || '',
      itemData.code || '',
      itemData.name,
      itemData.category || 'Other',
      itemData.unit || 'Each',
      parseFloat(itemData.price) || 0,
      itemData.description || '',
      itemData.imageUrl || '',
      itemData.active !== false
    ]]);
    
    SpreadsheetApp.flush();
    
    return {
      success: true,
      message: 'Item added to Price Book',
      rowIndex: nextRow
    };
  } catch (error) {
    Logger.log('Error adding item to Price Book: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Add labor to Labor sheet (called from InvoiceEstimateUI)
 */
function addLaborToPriceBook(laborData) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(LABOR_SHEET);
    
    if (!sheet) {
      return { success: false, error: 'Labor sheet not found' };
    }
    
    if (!laborData.name) {
      return { success: false, error: 'Labor name is required' };
    }
    
    // Find next empty row (data starts at row 6, headers at row 4)
    const lastRow = sheet.getLastRow();
    const nextRow = lastRow < 5 ? 6 : lastRow + 1;
    
    // Labor sheet structure: Labor Type, Category, Unit, Rate, Description, Notes, Active
    sheet.getRange(nextRow, 1).setValue(laborData.name);        // Column A: Labor Type
    sheet.getRange(nextRow, 2).setValue(laborData.category || 'General Labor'); // Column B: Category
    sheet.getRange(nextRow, 3).setValue(laborData.unit || 'Hour');              // Column C: Unit
    sheet.getRange(nextRow, 4).setValue(parseFloat(laborData.rate) || 0);       // Column D: Rate
    sheet.getRange(nextRow, 5).setValue(laborData.description || '');           // Column E: Description
    sheet.getRange(nextRow, 6).setValue('Added from Invoice Maker');            // Column F: Notes
    sheet.getRange(nextRow, 7).setValue(laborData.active !== false);            // Column G: Active
    
    Logger.log('Added labor to Labor sheet: ' + laborData.name + ' at row ' + nextRow);
    
    return {
      success: true,
      message: 'Labor added to Labor sheet',
      rowIndex: nextRow
    };
  } catch (error) {
    Logger.log('Error adding labor to Labor sheet: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Update item image URL in Price Book sheet
 */
function updateItemImage(itemName, imageUrl) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(PRICE_BOOK_SHEET);
    
    if (!sheet) {
      return { success: false, error: 'Price Book sheet not found' };
    }
    
    if (!itemName) {
      return { success: false, error: 'Item name is required' };
    }
    
    const data = sheet.getDataRange().getValues();
    
    // Find the item by name (Column C, index 2) - data starts at row 7, index 6
    const itemNameLower = String(itemName || '').toLowerCase().trim();
    for (let i = 6; i < data.length; i++) {
      const row = data[i];
      const name = String(row[2] || '').toLowerCase().trim(); // Column C: Item Name
      
      if (name === itemNameLower) {
        // Update Column H (index 7): Image URL
        sheet.getRange(i + 1, 8).setValue(imageUrl || '');
        SpreadsheetApp.flush();
        
        Logger.log('Updated image for item: ' + itemName + ' at row ' + (i + 1));
        
        return {
          success: true,
          message: 'Item image updated successfully',
          rowIndex: i + 1
        };
      }
    }
    
    return {
      success: false,
      error: 'Item with name "' + itemName + '" not found in Price Book'
    };
    
  } catch (error) {
    Logger.log('Error updating item image: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

// ============================================================================
// PRICE COMPARISON TOOL - CREDENTIAL MANAGEMENT
// ============================================================================

/**
 * Supported price comparison websites
 */
const PRICE_COMPARE_SITES = {
  HERITAGE: 'Heritage',
  POOLCORP: 'PoolCorp',
  LESLIES: 'Leslie\'s',
  PINCHAPENNY: 'Pinch A Penny',
  POOLCORPB2B: 'Pool Corp B2B',
  SPAPARTSPLUS: 'Spa Parts Plus',
  BACKYARDPLUS: 'Backyard Plus',
  CARECRAFT: 'Care Craft',
  MASTERSPAS: 'MasterSpas',
  AMAZON: 'Amazon',
  ACTIONSPAPARTS: 'Action Spa Parts',
  HORIZONPART: 'Horizon Part',
  OPTIMUMPOOLTECH: 'Optimum PoolTech',
  EBAY: 'eBay'
};

/**
 * Save website credentials securely
 * @param {string} siteName - Site name (HERITAGE, POOLCORP, LESLIES, PINCHAPENNY)
 * @param {string} username - Username
 * @param {string} password - Password
 * @returns {object} Success/error result
 */
function saveWebsiteCredentials(siteName, username, password) {
  try {
    if (!siteName || !username || !password) {
      return {
        success: false,
        error: 'Site name, username, and password are required'
      };
    }
    
    const normalizedSite = siteName.toUpperCase();
    if (!PRICE_COMPARE_SITES[normalizedSite]) {
      return {
        success: false,
        error: 'Invalid site name. Supported sites: ' + Object.values(PRICE_COMPARE_SITES).join(', ')
      };
    }
    
    const properties = PropertiesService.getScriptProperties();
    properties.setProperty(`PRICE_COMPARE_${normalizedSite}_USERNAME`, username);
    properties.setProperty(`PRICE_COMPARE_${normalizedSite}_PASSWORD`, password);
    
    Logger.log('Credentials saved for: ' + normalizedSite);
    
    return {
      success: true,
      message: 'Credentials saved successfully'
    };
  } catch (error) {
    Logger.log('Error saving credentials: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Get website credentials
 * @param {string} siteName - Site name
 * @returns {object} Credentials or error
 */
function getWebsiteCredentials(siteName) {
  try {
    const normalizedSite = siteName.toUpperCase();
    const properties = PropertiesService.getScriptProperties();
    
    const username = properties.getProperty(`PRICE_COMPARE_${normalizedSite}_USERNAME`);
    const password = properties.getProperty(`PRICE_COMPARE_${normalizedSite}_PASSWORD`);
    
    if (!username || !password) {
      return {
        success: false,
        configured: false,
        error: 'Credentials not configured for ' + normalizedSite
      };
    }
    
    return {
      success: true,
      configured: true,
      username: username,
      password: password
    };
  } catch (error) {
    Logger.log('Error getting credentials: ' + error.toString());
    return {
      success: false,
      configured: false,
      error: error.toString()
    };
  }
}

/**
 * Delete website credentials
 * @param {string} siteName - Site name
 * @returns {object} Success/error result
 */
function deleteWebsiteCredentials(siteName) {
  try {
    const normalizedSite = siteName.toUpperCase();
    const properties = PropertiesService.getScriptProperties();
    
    properties.deleteProperty(`PRICE_COMPARE_${normalizedSite}_USERNAME`);
    properties.deleteProperty(`PRICE_COMPARE_${normalizedSite}_PASSWORD`);
    
    Logger.log('Credentials deleted for: ' + normalizedSite);
    
    return {
      success: true,
      message: 'Credentials deleted successfully'
    };
  } catch (error) {
    Logger.log('Error deleting credentials: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Get status of all website credentials
 * @returns {object} Status for all sites
 */
function getAllWebsiteCredentialsStatus() {
  try {
    const sites = Object.keys(PRICE_COMPARE_SITES);
    const status = {};
    
    for (let i = 0; i < sites.length; i++) {
      const site = sites[i];
      const credResult = getWebsiteCredentials(site);
      status[site] = {
        name: PRICE_COMPARE_SITES[site],
        configured: credResult.configured || false
      };
    }
    
    return {
      success: true,
      sites: status
    };
  } catch (error) {
    Logger.log('Error getting credentials status: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

// ============================================================================
// PRICE COMPARISON TOOL - WEBSITE SCRAPERS
// ============================================================================

/**
 * Login to Heritage website
 * @param {string} username - Username
 * @param {string} password - Password
 * @returns {object} Session cookies or error
 */
function loginToHeritage(username, password) {
  try {
    // Note: This is a placeholder - actual implementation requires knowing Heritage's login URL and form structure
    // Heritage typically uses: https://www.heritagepoolsupply.com/login or similar
    Logger.log('Attempting to login to Heritage...');
    
    // This would need to be implemented based on actual Heritage website structure
    // For now, return error indicating it needs implementation
    return {
      success: false,
      error: 'Heritage scraper not yet implemented - requires website structure analysis'
    };
  } catch (error) {
    Logger.log('Error logging into Heritage: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Search Heritage website for product
 * @param {string} productName - Product name to search
 * @param {object} sessionCookies - Session cookies from login
 * @returns {array} Array of price results
 */
function searchHeritage(productName, sessionCookies) {
  try {
    // Placeholder - needs actual implementation
    return {
      success: false,
      error: 'Heritage search not yet implemented'
    };
  } catch (error) {
    Logger.log('Error searching Heritage: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Login to PoolCorp website
 */
function loginToPoolCorp(username, password) {
  try {
    Logger.log('Attempting to login to PoolCorp...');
    return {
      success: false,
      error: 'PoolCorp scraper not yet implemented - requires website structure analysis'
    };
  } catch (error) {
    Logger.log('Error logging into PoolCorp: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Search PoolCorp website for product
 */
function searchPoolCorp(productName, sessionCookies) {
  try {
    return {
      success: false,
      error: 'PoolCorp search not yet implemented'
    };
  } catch (error) {
    Logger.log('Error searching PoolCorp: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Login to Leslie's website
 */
function loginToLeslies(username, password) {
  try {
    Logger.log('Attempting to login to Leslie\'s...');
    return {
      success: false,
      error: 'Leslie\'s scraper not yet implemented - requires website structure analysis'
    };
  } catch (error) {
    Logger.log('Error logging into Leslie\'s: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Search Leslie's website for product
 */
function searchLeslies(productName, sessionCookies) {
  try {
    return {
      success: false,
      error: 'Leslie\'s search not yet implemented'
    };
  } catch (error) {
    Logger.log('Error searching Leslie\'s: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Login to Pinch A Penny website
 */
function loginToPinchAPenny(username, password) {
  try {
    Logger.log('Attempting to login to Pinch A Penny...');
    return {
      success: false,
      error: 'Pinch A Penny scraper not yet implemented - requires website structure analysis'
    };
  } catch (error) {
    Logger.log('Error logging into Pinch A Penny: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Search Pinch A Penny website for product
 */
function searchPinchAPenny(productName, sessionCookies) {
  try {
    return {
      success: false,
      error: 'Pinch A Penny search not yet implemented'
    };
  } catch (error) {
    Logger.log('Error searching Pinch A Penny: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Login to Pool Corp B2B website
 */
function loginToPoolCorpB2B(username, password) {
  try {
    Logger.log('Attempting to login to Pool Corp B2B...');
    return {
      success: false,
      error: 'Pool Corp B2B scraper not yet implemented - requires website structure analysis'
    };
  } catch (error) {
    Logger.log('Error logging into Pool Corp B2B: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Search Pool Corp B2B website for product
 */
function searchPoolCorpB2B(productName, sessionCookies) {
  try {
    return {
      success: false,
      error: 'Pool Corp B2B search not yet implemented'
    };
  } catch (error) {
    Logger.log('Error searching Pool Corp B2B: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Login to Spa Parts Plus website
 */
function loginToSpaPartsPlus(username, password) {
  try {
    Logger.log('Attempting to login to Spa Parts Plus...');
    return {
      success: false,
      error: 'Spa Parts Plus scraper not yet implemented - requires website structure analysis'
    };
  } catch (error) {
    Logger.log('Error logging into Spa Parts Plus: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Search Spa Parts Plus website for product
 */
function searchSpaPartsPlus(productName, sessionCookies) {
  try {
    return {
      success: false,
      error: 'Spa Parts Plus search not yet implemented'
    };
  } catch (error) {
    Logger.log('Error searching Spa Parts Plus: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Login to Backyard Plus website
 */
function loginToBackyardPlus(username, password) {
  try {
    Logger.log('Attempting to login to Backyard Plus...');
    return {
      success: false,
      error: 'Backyard Plus scraper not yet implemented - requires website structure analysis'
    };
  } catch (error) {
    Logger.log('Error logging into Backyard Plus: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Search Backyard Plus website for product
 */
function searchBackyardPlus(productName, sessionCookies) {
  try {
    return {
      success: false,
      error: 'Backyard Plus search not yet implemented'
    };
  } catch (error) {
    Logger.log('Error searching Backyard Plus: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Login to Care Craft website
 */
function loginToCareCraft(username, password) {
  try {
    Logger.log('Attempting to login to Care Craft...');
    return {
      success: false,
      error: 'Care Craft scraper not yet implemented - requires website structure analysis'
    };
  } catch (error) {
    Logger.log('Error logging into Care Craft: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Search Care Craft website for product
 */
function searchCareCraft(productName, sessionCookies) {
  try {
    return {
      success: false,
      error: 'Care Craft search not yet implemented'
    };
  } catch (error) {
    Logger.log('Error searching Care Craft: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Login to MasterSpas website
 */
function loginToMasterSpas(username, password) {
  try {
    Logger.log('Attempting to login to MasterSpas...');
    return {
      success: false,
      error: 'MasterSpas scraper not yet implemented - requires website structure analysis'
    };
  } catch (error) {
    Logger.log('Error logging into MasterSpas: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Search MasterSpas website for product
 */
function searchMasterSpas(productName, sessionCookies) {
  try {
    return {
      success: false,
      error: 'MasterSpas search not yet implemented'
    };
  } catch (error) {
    Logger.log('Error searching MasterSpas: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Login to Amazon website
 */
function loginToAmazon(username, password) {
  try {
    Logger.log('Attempting to login to Amazon...');
    return {
      success: false,
      error: 'Amazon scraper not yet implemented - requires website structure analysis'
    };
  } catch (error) {
    Logger.log('Error logging into Amazon: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Search Amazon website for product
 */
function searchAmazon(productName, sessionCookies) {
  try {
    return {
      success: false,
      error: 'Amazon search not yet implemented'
    };
  } catch (error) {
    Logger.log('Error searching Amazon: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Login to Action Spa Parts website
 */
function loginToActionSpaParts(username, password) {
  try {
    Logger.log('Attempting to login to Action Spa Parts...');
    return {
      success: false,
      error: 'Action Spa Parts scraper not yet implemented - requires website structure analysis'
    };
  } catch (error) {
    Logger.log('Error logging into Action Spa Parts: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Search Action Spa Parts website for product
 */
function searchActionSpaParts(productName, sessionCookies) {
  try {
    return {
      success: false,
      error: 'Action Spa Parts search not yet implemented'
    };
  } catch (error) {
    Logger.log('Error searching Action Spa Parts: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Login to Horizon Part website
 */
function loginToHorizonPart(username, password) {
  try {
    Logger.log('Attempting to login to Horizon Part...');
    return {
      success: false,
      error: 'Horizon Part scraper not yet implemented - requires website structure analysis'
    };
  } catch (error) {
    Logger.log('Error logging into Horizon Part: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Search Horizon Part website for product
 */
function searchHorizonPart(productName, sessionCookies) {
  try {
    return {
      success: false,
      error: 'Horizon Part search not yet implemented'
    };
  } catch (error) {
    Logger.log('Error searching Horizon Part: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Login to Optimum PoolTech website
 */
function loginToOptimumPoolTech(username, password) {
  try {
    Logger.log('Attempting to login to Optimum PoolTech...');
    return {
      success: false,
      error: 'Optimum PoolTech scraper not yet implemented - requires website structure analysis'
    };
  } catch (error) {
    Logger.log('Error logging into Optimum PoolTech: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Search Optimum PoolTech website for product
 */
function searchOptimumPoolTech(productName, sessionCookies) {
  try {
    return {
      success: false,
      error: 'Optimum PoolTech search not yet implemented'
    };
  } catch (error) {
    Logger.log('Error searching Optimum PoolTech: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Login to eBay website
 */
function loginToEbay(username, password) {
  try {
    Logger.log('Attempting to login to eBay...');
    return {
      success: false,
      error: 'eBay scraper not yet implemented - requires website structure analysis'
    };
  } catch (error) {
    Logger.log('Error logging into eBay: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Search eBay website for product
 */
function searchEbay(productName, sessionCookies) {
  try {
    return {
      success: false,
      error: 'eBay search not yet implemented'
    };
  } catch (error) {
    Logger.log('Error searching eBay: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Main price comparison function
 * Searches all configured websites and returns sorted results
 * @param {string} productName - Product name to search
 * @returns {object} Comparison results
 */
function comparePrices(productName) {
  try {
    if (!productName || productName.trim().length === 0) {
      return {
        success: false,
        error: 'Product name is required'
      };
    }
    
    const results = [];
    const errors = [];
    const sites = Object.keys(PRICE_COMPARE_SITES);
    
    Logger.log('Starting price comparison for: ' + productName);
    
    // Search each site
    for (let i = 0; i < sites.length; i++) {
      const site = sites[i];
      const siteName = PRICE_COMPARE_SITES[site];
      
      try {
        // Get credentials
        const credResult = getWebsiteCredentials(site);
        if (!credResult.configured) {
          Logger.log('Skipping ' + siteName + ' - credentials not configured');
          continue;
        }
        
        // Login
        let loginResult;
        switch(site) {
          case 'HERITAGE':
            loginResult = loginToHeritage(credResult.username, credResult.password);
            break;
          case 'POOLCORP':
            loginResult = loginToPoolCorp(credResult.username, credResult.password);
            break;
          case 'LESLIES':
            loginResult = loginToLeslies(credResult.username, credResult.password);
            break;
          case 'PINCHAPENNY':
            loginResult = loginToPinchAPenny(credResult.username, credResult.password);
            break;
          case 'POOLCORPB2B':
            loginResult = loginToPoolCorpB2B(credResult.username, credResult.password);
            break;
          case 'SPAPARTSPLUS':
            loginResult = loginToSpaPartsPlus(credResult.username, credResult.password);
            break;
          case 'BACKYARDPLUS':
            loginResult = loginToBackyardPlus(credResult.username, credResult.password);
            break;
          case 'CARECRAFT':
            loginResult = loginToCareCraft(credResult.username, credResult.password);
            break;
          case 'MASTERSPAS':
            loginResult = loginToMasterSpas(credResult.username, credResult.password);
            break;
          case 'AMAZON':
            loginResult = loginToAmazon(credResult.username, credResult.password);
            break;
          case 'ACTIONSPAPARTS':
            loginResult = loginToActionSpaParts(credResult.username, credResult.password);
            break;
          case 'HORIZONPART':
            loginResult = loginToHorizonPart(credResult.username, credResult.password);
            break;
          case 'OPTIMUMPOOLTECH':
            loginResult = loginToOptimumPoolTech(credResult.username, credResult.password);
            break;
          case 'EBAY':
            loginResult = loginToEbay(credResult.username, credResult.password);
            break;
          default:
            continue;
        }
        
        if (!loginResult.success) {
          errors.push({
            site: siteName,
            error: loginResult.error || 'Login failed'
          });
          continue;
        }
        
        // Search
        let searchResult;
        switch(site) {
          case 'HERITAGE':
            searchResult = searchHeritage(productName, loginResult.cookies);
            break;
          case 'POOLCORP':
            searchResult = searchPoolCorp(productName, loginResult.cookies);
            break;
          case 'LESLIES':
            searchResult = searchLeslies(productName, loginResult.cookies);
            break;
          case 'PINCHAPENNY':
            searchResult = searchPinchAPenny(productName, loginResult.cookies);
            break;
          case 'POOLCORPB2B':
            searchResult = searchPoolCorpB2B(productName, loginResult.cookies);
            break;
          case 'SPAPARTSPLUS':
            searchResult = searchSpaPartsPlus(productName, loginResult.cookies);
            break;
          case 'BACKYARDPLUS':
            searchResult = searchBackyardPlus(productName, loginResult.cookies);
            break;
          case 'CARECRAFT':
            searchResult = searchCareCraft(productName, loginResult.cookies);
            break;
          case 'MASTERSPAS':
            searchResult = searchMasterSpas(productName, loginResult.cookies);
            break;
          case 'AMAZON':
            searchResult = searchAmazon(productName, loginResult.cookies);
            break;
          case 'ACTIONSPAPARTS':
            searchResult = searchActionSpaParts(productName, loginResult.cookies);
            break;
          case 'HORIZONPART':
            searchResult = searchHorizonPart(productName, loginResult.cookies);
            break;
          case 'OPTIMUMPOOLTECH':
            searchResult = searchOptimumPoolTech(productName, loginResult.cookies);
            break;
          case 'EBAY':
            searchResult = searchEbay(productName, loginResult.cookies);
            break;
          default:
            continue;
        }
        
        if (searchResult.success && searchResult.results) {
          // Add site name to each result
          searchResult.results.forEach(result => {
            result.site = siteName;
            results.push(result);
          });
        } else {
          errors.push({
            site: siteName,
            error: searchResult.error || 'Search failed'
          });
        }
        
      } catch (error) {
        Logger.log('Error processing ' + siteName + ': ' + error.toString());
        errors.push({
          site: siteName,
          error: error.toString()
        });
      }
    }
    
    // Sort results by price (cheapest first)
    results.sort((a, b) => {
      const priceA = parseFloat(a.price) || Infinity;
      const priceB = parseFloat(b.price) || Infinity;
      return priceA - priceB;
    });
    
    Logger.log('Price comparison complete. Found ' + results.length + ' results, ' + errors.length + ' errors');
    
    return {
      success: true,
      productName: productName,
      results: results,
      errors: errors
    };
    
  } catch (error) {
    Logger.log('Error in comparePrices: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}


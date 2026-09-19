/**
 * Pool Quote System - Setup Script
 * 
 * This script creates and formats four sheets for the pool quote system:
 * 1. Price Book - Material and equipment pricing
 * 2. Labor - Labor rates and installation costs
 * 3. Equipment Bundles - Pre-configured equipment packages
 * 4. Quick Quote - Saved quotes and templates
 * 
 * SETUP INSTRUCTIONS:
 * 1. Open your Google Sheet: https://docs.google.com/spreadsheets/d/189Oj-P7s2WGJY2kk3gOUylTle4JWaWs0vfwuycOrjGA/edit
 * 2. Go to Extensions > Apps Script
 * 3. Create a new file and paste this code
 * 4. Click on the function dropdown and select `setupQuoteSheets`
 * 5. Click Run (▶️) button
 * 6. Authorize if prompted
 * 7. Check your sheet - four beautifully formatted sheets will be created!
 */

// Configuration - Your Google Sheet ID
const SPREADSHEET_ID = '1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0';

/**
 * Main setup function - Creates and formats all quote sheets
 */
function setupQuoteSheets() {
  Logger.log('═══════════════════════════════════════════════════════════');
  Logger.log('STARTING QUOTE SHEETS SETUP');
  Logger.log('═══════════════════════════════════════════════════════════');
  
  try {
    Logger.log('📊 Opening spreadsheet...');
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    Logger.log('✅ Spreadsheet opened successfully');
    
    // Create and format each sheet with error handling
    Logger.log('');
    Logger.log('📋 Creating Price Book sheet...');
    try {
      setupPriceBookSheet(spreadsheet);
      Logger.log('✅ Price Book sheet created successfully');
    } catch (error) {
      Logger.log('❌ ERROR creating Price Book sheet: ' + error.toString());
      Logger.log('Stack: ' + error.stack);
    }
    
    Logger.log('');
    Logger.log('👷 Creating Labor sheet...');
    try {
      setupLaborSheet(spreadsheet);
      Logger.log('✅ Labor sheet created successfully');
    } catch (error) {
      Logger.log('❌ ERROR creating Labor sheet: ' + error.toString());
      Logger.log('Stack: ' + error.stack);
    }
    
    Logger.log('');
    Logger.log('⚙️ Creating Equipment Bundles sheet...');
    try {
      setupEquipmentBundlesSheet(spreadsheet);
      Logger.log('✅ Equipment Bundles sheet created successfully');
    } catch (error) {
      Logger.log('❌ ERROR creating Equipment Bundles sheet: ' + error.toString());
      Logger.log('Stack: ' + error.stack);
    }
    
    Logger.log('');
    Logger.log('💰 Creating Quick Quote sheet...');
    try {
      setupQuickQuoteSheet(spreadsheet);
      Logger.log('✅ Quick Quote sheet created successfully');
    } catch (error) {
      Logger.log('❌ ERROR creating Quick Quote sheet: ' + error.toString());
      Logger.log('Stack: ' + error.stack);
    }
    
    Logger.log('');
    Logger.log('═══════════════════════════════════════════════════════════');
    Logger.log('✅ SETUP COMPLETE! All sheets created and formatted.');
    Logger.log('═══════════════════════════════════════════════════════════');
    return 'Success! All sheets created and formatted. Check execution log for details.';
  } catch (error) {
    Logger.log('');
    Logger.log('═══════════════════════════════════════════════════════════');
    Logger.log('❌ CRITICAL ERROR: ' + error.toString());
    Logger.log('Stack: ' + error.stack);
    Logger.log('═══════════════════════════════════════════════════════════');
    return 'Error: ' + error.toString() + ' - Check execution log for details.';
  }
}

/**
 * Setup Price Book Sheet - Material and equipment pricing
 */
function setupPriceBookSheet(spreadsheet) {
  let sheet = spreadsheet.getSheetByName('Price book');
  
  // Delete if exists and recreate
  if (sheet) {
    spreadsheet.deleteSheet(sheet);
  }
  sheet = spreadsheet.insertSheet('Price book');
  
  // Row 1: Leave blank for logo (set height)
  sheet.setRowHeight(1, 100);
  
  // Row 2: Title
  sheet.getRange(2, 1, 1, 9).merge();
  sheet.getRange(2, 1).setValue('📋 PRICE BOOK - Materials & Equipment Pricing');
  sheet.getRange(2, 1).setFontSize(20);
  sheet.getRange(2, 1).setFontWeight('bold');
  sheet.getRange(2, 1).setFontColor('#ffffff');
  sheet.getRange(2, 1).setBackground('#0369a1');
  sheet.getRange(2, 1).setHorizontalAlignment('center');
  sheet.getRange(2, 1).setVerticalAlignment('middle');
  sheet.setRowHeight(2, 50);
  
  // Row 3: Instructions
  sheet.getRange(3, 1, 1, 9).merge();
  sheet.getRange(3, 1).setValue('Use the slicer (Data > Create a filter) to filter by Brand, Category, or other columns. Add product image URLs for visual reference.');
  sheet.getRange(3, 1).setFontSize(11);
  sheet.getRange(3, 1).setFontColor('#6b7280');
  sheet.getRange(3, 1).setBackground('#f3f4f6');
  sheet.getRange(3, 1).setHorizontalAlignment('center');
  sheet.getRange(3, 1).setFontStyle('italic');
  sheet.setRowHeight(3, 40);
  sheet.getRange(3, 1).setWrap(true);
  
  // Row 4: Empty spacer
  sheet.setRowHeight(4, 10);
  
  // Row 5: Headers
  const headers = [
    'Brand',
    'Item Code',
    'Item Name',
    'Category',
    'Unit',
    'Price',
    'Description / Notes',
    'Image URL',
    'Active'
  ];
  
  const headerDescriptions = [
    'Brand or vendor name (Pentair, Jandy, Hayward, etc.)',
    'Product item code or part number',
    'Enter the name of the material or equipment item',
    'Select category: Filter, Pump, Heater, Lighting, Automation, Chlorination, Cleaner, Other',
    'Select unit of measurement: Each, Per Hour, Per Day, etc.',
    'Enter price per unit (numbers only, no dollar sign)',
    'Add additional details, specifications, or notes about this item',
    'Paste image URL here (product photo from manufacturer website or Google image search)',
    'Check this box if the item is currently available and active'
  ];
  
  // Set headers
  sheet.getRange(5, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(5, 1, 1, headers.length).setFontSize(12);
  sheet.getRange(5, 1, 1, headers.length).setFontWeight('bold');
  sheet.getRange(5, 1, 1, headers.length).setFontColor('#ffffff');
  sheet.getRange(5, 1, 1, headers.length).setBackground('#0284c7');
  sheet.getRange(5, 1, 1, headers.length).setHorizontalAlignment('center');
  sheet.getRange(5, 1, 1, headers.length).setVerticalAlignment('middle');
  sheet.setRowHeight(5, 40);
  
  // Add descriptions row
  sheet.getRange(6, 1, 1, headers.length).setValues([headerDescriptions]);
  sheet.getRange(6, 1, 1, headers.length).setFontSize(9);
  sheet.getRange(6, 1, 1, headers.length).setFontColor('#6b7280');
  sheet.getRange(6, 1, 1, headers.length).setBackground('#e0f2fe');
  sheet.getRange(6, 1, 1, headers.length).setFontStyle('italic');
  sheet.getRange(6, 1, 1, headers.length).setWrap(true);
  sheet.setRowHeight(6, 50);
  
  // Format columns
  sheet.setColumnWidth(1, 120); // Brand
  sheet.setColumnWidth(2, 120); // Item Code
  sheet.setColumnWidth(3, 280); // Item Name
  sheet.setColumnWidth(4, 150); // Category
  sheet.setColumnWidth(5, 100); // Unit
  sheet.setColumnWidth(6, 100); // Price
  sheet.setColumnWidth(7, 350); // Description
  sheet.setColumnWidth(8, 250); // Image URL
  sheet.setColumnWidth(9, 80);  // Active
  
  // Import CSV data first to know how many rows we have
  Logger.log('  📥 Starting CSV data import...');
  let dataRowCount = 0;
  try {
    dataRowCount = importCSVDataToPriceBook(sheet);
    Logger.log('  ✅ CSV data imported successfully: ' + dataRowCount + ' rows');
  } catch (error) {
    Logger.log('  ⚠️ WARNING: CSV import failed, but sheet will still be created');
    Logger.log('  Error: ' + error.toString());
    Logger.log('  Stack: ' + error.stack);
    // Continue - don't throw error, just log it
  }
  
  // Only format rows with data + buffer (max 200 rows to keep it fast)
  const rowsToFormat = Math.min(dataRowCount + 50, 200); // Data rows + 50 buffer, max 200
  
  // Add data validation for Category column (only format what we need)
  if (rowsToFormat > 0) {
    const categoryRange = sheet.getRange(7, 4, rowsToFormat, 1);
    const categoryRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['Filter', 'Pump', 'Heater', 'Lighting', 'Automation / Controls', 'Chlorination / Salt', 'Cleaner', 'Other'], true)
      .setAllowInvalid(false)
      .setHelpText('Select a category from the dropdown')
      .build();
    categoryRange.setDataValidation(categoryRule);
    
    // Add data validation for Unit column
    const unitRange = sheet.getRange(7, 5, rowsToFormat, 1);
    const unitRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['Each', 'Linear Foot', 'Square Foot', 'Per Yard', 'Per Ton', 'Per Hour', 'Per Day', 'Per Unit'], true)
      .setAllowInvalid(false)
      .setHelpText('Select a unit from the dropdown')
      .build();
    unitRange.setDataValidation(unitRule);
    
    // Add data validation for Active column (checkbox)
    const activeRange = sheet.getRange(7, 9, rowsToFormat, 1);
    const activeRule = SpreadsheetApp.newDataValidation()
      .requireCheckbox()
      .build();
    activeRange.setDataValidation(activeRule);
    
    // Format Price column as currency (batch format)
    sheet.getRange(7, 6, rowsToFormat, 1).setNumberFormat('$#,##0.00');
    
    // Format Image URL column - make URLs clickable (batch format)
    sheet.getRange(7, 8, rowsToFormat, 1).setNumberFormat('@'); // Text format for URLs
  }
  
  // Format data rows with alternating colors (batch format for speed)
  const lastRow = sheet.getLastRow();
  if (lastRow >= 7 && rowsToFormat > 0) {
    const rowsToFormatActual = Math.min(lastRow - 6, rowsToFormat);
    Logger.log('  🎨 Formatting ' + rowsToFormatActual + ' data rows...');
    
    // Batch format alternating colors
    for (let i = 0; i < rowsToFormatActual; i++) {
      const row = 7 + i;
      if (i % 2 === 0) {
        sheet.getRange(row, 1, 1, headers.length).setBackground('#ffffff');
      } else {
        sheet.getRange(row, 1, 1, headers.length).setBackground('#f9fafb');
      }
      sheet.getRange(row, 1, 1, headers.length).setBorder(true, true, true, true, false, false, '#e5e7eb', SpreadsheetApp.BorderStyle.SOLID);
      sheet.setRowHeight(row, 40);
    }
    
    // Batch process hyperlinks for Image URL column (only for rows with URLs)
    Logger.log('  🔗 Creating hyperlinks for image URLs...');
    const imageUrlRange = sheet.getRange(7, 8, rowsToFormatActual, 1);
    const imageUrls = imageUrlRange.getValues();
    const hyperlinkFormulas = [];
    
    for (let i = 0; i < imageUrls.length; i++) {
      const url = imageUrls[i][0];
      if (url && url.toString().startsWith('http')) {
        hyperlinkFormulas.push(['=HYPERLINK("' + url + '","View Image")']);
      } else {
        hyperlinkFormulas.push([url || '']);
      }
    }
    
    if (hyperlinkFormulas.length > 0) {
      imageUrlRange.setFormulas(hyperlinkFormulas);
    }
    
    Logger.log('  ✅ Row formatting complete');
  }
  
  // Freeze header rows
  sheet.setFrozenRows(6);
  
  // Add note about slicer and image URLs
  sheet.getRange(4, 1, 1, 9).merge();
  sheet.getRange(4, 1).setValue('💡 TIP: 1) Select any cell in the data, then go to Data > Create a filter to add slicers for easy filtering by Brand, Category, etc. | 2) Image URLs are auto-generated but may need manual updates. To get direct image URLs: Go to manufacturer website or Google Images, right-click product image > Copy image address, then paste into Image URL column');
  sheet.getRange(4, 1).setFontSize(9);
  sheet.getRange(4, 1).setFontColor('#0369a1');
  sheet.getRange(4, 1).setBackground('#e0f2fe');
  sheet.getRange(4, 1).setHorizontalAlignment('center');
  sheet.getRange(4, 1).setFontWeight('bold');
  sheet.getRange(4, 1).setWrap(true);
  sheet.setRowHeight(4, 50);
  
  Logger.log('✅ Price book sheet created and formatted with imported data');
}

/**
 * Embedded CSV data from COMBINED_PRICEBOOK_HERITAGE
 */
function getEmbeddedCSVData() {
  // CSV data embedded directly in script
  const csvData = `Vendor,Category,ItemCode,MfgCode,ItemName,Unit,RawPrice,Price
Pentair,Filter,PEN160301,160301,"Pentair Clean & Clear Plus Cartridge Filters, 420 sq. ft, 21.5"" Diam, 150 GPM, 108,000 gallons | 160301",EA,"$1,385.95",1385.95
Pentair,Filter,PEN160340,160340,"Pentair Clean & Clear Plus Cartridge Filters, 320 sq. ft, 21.5"" Diam, 120 GPM, 86,400 gallons | 160340",EA,"$1,244.51",1244.51
Pentair,Filter,PEN160332,160332,"Pentair Clean & Clear Plus Cartridge Filters, 520 sq. ft, 21.5"" Diam, 150 GPM, 108,000 gallons | 160332",EA,"$1,715.72",1715.72
Pentair,Filter,PEN180009,180009,"Pentair FNS Plus Filter Fibergalass D.E. Filter, 60 sq. ft, 21.5"" Diam, 120 GPM, 86,400 gallons | 180009",EA,"$1,471.88",1471.88
Pentair,Filter,PEN180008,180008,"Pentair FNS Plus Filter Fibergalass D.E. Filter, 48 sq. ft, 21.5"" Diam, 96 GPM, 69,120 gallons | 180008",EA,"$1,292.59",1292.59
Pentair,Pump,PEN022056,22056,"Pentair IntelliFloXF VSF Variable Speed Pump, 3.95 THP, 230 V, 50/60 Hz | 022056",EA,"$2,385.04",2385.04
Pentair,Pump,PEN342002,342002,"Pentair SuperFlo VST Variable Speed Pump, 2.2 THP, 115/230 V, 50/60 Hz, Almond | 342002",EA,"$1,238.14",1238.14
Pentair,Heater,PEN460734,460734,"Pentair Mastertemp 300 Heater, Natural Gas, 128 LBS, 300K BTU, 120/240 VAC | 460734",EA,"$3,846.06",3846.06
Pentair,Heater,PEN460732,460732,"Pentair Mastertemp 250 Heater, Natural Gas 125 lbs, 250K BTU, 120/240 VAC|460732",EA,"$2,833.56",2833.56
Pentair,Heater,PEN460806,460806,"Pentair Mastertemp 250HD Heater Natural Gas, 120 LBS, 250K BTU, 120/240 VAC | 460806",EA,"$3,616.07",3616.07
Pentair,Heater,PEN460805,460805,"Pentair Mastertemp 400HD Heater, Natural Gas, 136 LBS, 400K BTU, 120/240 VAC | 460805",EA,"$4,337.23",4337.23
Pentair,Heater,PEN460737,460737,"Pentair Mastertemp 400 Heater Propane Gas, 129 LBS, 400K BTU, 120/240 VAC | 460737",EA,"$3,993.34",3993.34
Pentair,Heater,PEN460736,460736,"Pentair Mastertemp 400 Heater Natural Gas, 160 LBS, 400K BTU, 120/240 VAC | 460736",EA,"$3,993.34",3993.34
Pentair,Pump,PEN460934,460934,"Pentair UltraTemp High Performance Pool Heat Pump 140, Almond, 145K BTU, 60 Hz, 1 Phase, 230 V, 50 Amp, 347 lbs | 460934",EA,"$5,353.63",5353.63
Pentair,Heater,PEN461113,461113,"Pentair ETi 400 High-Efficiency Natural Gas Heater, 400K BTU, 120/240V, 60Hz, 1Ph, 379 lbs, 15 AMP | 461113",EA,"$9,860.84",9860.84
Pentair,Other,PEN520555,520555,"Pentair IntelliChlor Salt Chlorine Generator IC40 Cell, 40,000 gallons | 520555",EA,"$1,335.44",1335.44
Pentair,Other,PEN520554,520554,"Pentair IntelliChlor Salt Chlorine Generator IC20 Cell, 20,000 gallons | 520554",EA,"$1,167.48",1167.48
Pentair,Automation / Controls,PEN520556,520556,Pentair IntelliChlor Salt Chlorine Generator Power Center | 520556,EA,$748.77,748.77
Pentair,Lighting,PEN602104,602104,"Pentair GloBrite Pool & Spa LED Light, White, 12 V, 15 W, 100' Cord | 602104",EA,$479.18,479.18
Pentair,Lighting,PEN602056,602056,"Pentair GloBrite Color Changing Pool & Spa LED Light, MultiColor, 12 V, 15 W, 150' Cord | 602056",EA,$585.22,585.22
Pentair,Lighting,PEN602055,602055,"Pentair GloBrite Color Changing Pool & Spa LED Light, MultiColor, 12 V, 15 W, 100' Cord | 602055",EA,$484.21,484.21
Pentair,Lighting,PEN602054,602054,"Pentair GloBrite Color Changing Pool & Spa LED Light, MultiColor, 12 V, 15 W, 50' Cord  | 602054",EA,$461.71,461.71
Pentair,Lighting,PEN620429,620429,"Pentair MicroBrite LED Pool Light, White, 100' Cord, 12 V, 12 W, 3.5"" Long | 620429",EA,$488.96,488.96
Pentair,Lighting,PEN620426,620426,"Pentair MicroBrite Color & White LED Pool Light, MultiColor, 150' Cord, 12 V, 12 W, 3.5"" Long | 620426",EA,$599.05,599.05
Pentair,Lighting,PEN620425,620425,"Pentair MicroBrite Color & White LED Pool Light, MultiColor, 100' Cord, 12 V, 12 W, 3.5"" Long | 620425",EA,$502.92,502.92
Pentair,Lighting,PEN620424,620424,"Pentair MicroBrite Color & White LED Pool Light, MultiColor, 50' Cord, 12 V, 12 W, 3.5"" Long | 620424",EA,$488.63,488.63
Pentair,Pump,PEN022035,22035,"Pentair WhisperFloXF VS Commercial Variable Speed Pump, 5 HP, 208-460 V, 50/60 Hz, Three Phase | 022035",EA,"$3,733.33",3733.33
Pentair,Heater,PEN460733,460733,"Pentair Mastertemp 250 Heater, Propane Gas 120 LBS, 250K BTU, 120/240 VAC|460733",EA,"$3,161.55",3161.55
Pentair,Pump,PEN460932,460932,"Pentair UltraTemp High Performance Pool Heat Pump  110, Almond, 110K BTU, 60 Hz, 1 Phase, 230 V, 50 Amp, 271 lbs | 460932",EA,"$4,292.28",4292.28
Pentair,Heater,PEN462042,462042,"Pentair UltraTemp ETi Hybrid Heater 220K - Propane Gas, Almond, 110K BTU, 60 Hz, 1 Phase, 230 V, 50 Amp, 470 lbs | 462042",EA,"$7,423.99",7423.99
Pentair,Lighting,PEN601303,601303,"Pentair IntelliBrite 5G White LED Pool Light 120V 500W, 150' Cord | 601303",EA,Contact Branch,
Pentair,Lighting,PEN620428,620428,"Pentair MicroBrite Color & White LED Pool Light, White, 50' Cord, 12 V, 12 W, 3.5"" Long | 620428",EA,$461.69,461.69
Pentair,Pump,PEN011533,11533,"Pentair WhisperFlo VST Variable Speed Pool Pump, 2.6 THP, 115/208-230 V, 50/60 Hz | 011533",EA,"$1,592.35",1592.35
Pentair,Pump,PEN011076,11076,"Pentair IntelliFlo3 VSF Pool Pump, 3 HP, 208-230 V, 50/60 Hz, with I/O board | 011076",EA,"$2,146.01",2146.01
Pentair,Pump,PEN011075,11075,"Pentair IntelliFlo3​ VSF Pool Pump, 3 HP, 208-230 V, 50/60 Hz | 011075",EA,"$1,694.37",1694.37
Jandy,Automation / Controls,JND6614LD,6614-LD,Jandy Pro Series Power Center | 6614-LD,EA,$931.05,931.05
Jandy,Automation / Controls,JND6614APL,6614AP-L,"Jandy Pro Series Purelink Power Center, | 6614AP-L",EA,"$1,196.63",1196.63
Jandy,Automation / Controls,JND7953,7953,"Jandy Aqualink RS  OneTouch, Pool and Automation, OneTouch Control Panel, White, 120 V | 7953",EA,$996.26,996.26
Jandy,Filter,JNDCV460,CV460,"Jandy CV Series Cartridge Filter, Large Cartridge, 460 sq. ft, 150 GPM, 72,000 gallons | CV460",EA,"$1,332.17",1332.17
Jandy,Filter,JNDCV340,CV340,"Jandy CV Series Cartridge Filter, Large Cartridge, 340 sq. ft, 127 GPM, 60,960 gallons | CV340",EA,"$1,235.41",1235.41
Jandy,Filter,JNDCV580,CV580,"Jandy CV Series Cartridge Filter, Large Cartridge, 580 sq. ft, 150 GPM, 72,000 gallons | CV580",EA,"$1,743.35",1743.35
Jandy,Filter,JNDDEV60,DEV60,Jandy DEV Series 60 sf DE Filter | DEV60,EA,"$1,426.38",1426.38
Jandy,Filter,JNDDEV48,DEV48,Jandy DEV Series 48 sf DE Filter | DEV48,EA,"$1,293.85",1293.85
Jandy,Cleaner,PLSF5TR,F5TR,"Polaris TR28P Pressure-Side In-Ground Pool Cleaner, Classic White, Shaft Drive, Single Chamber & Bonus Zipper Bag | F5TR",EA,$735.97,735.97
Jandy,Cleaner,PLSFALPHAIQP,FALPHAIQP,"Polaris Alpha iQ Robotic Pool Cleaner, Tangle-Reducing Swivel, 70' Cable",EA,"$1,469.59",1469.59
Jandy,Cleaner,PLSFALPHAIQ,FALPHAIQ,"Polaris Alpha iQ Robotic In-Ground Pool Cleaner, Tangle-Reducing Swivel, Cleans SMART or Floor",EA,"$1,330.78",1330.78
Jandy,Pump,JNDIQ30A,IQ30-A,"Jandy iAqualink 3.0, Web Connect Device Antenna, Booster pump, Landscape lights, Color and White lights, Wall Mount | JNDIQ30A",EA,$504.40,504.4
Jandy,Automation / Controls,ZODIQ904P,IQ904-P,"Jandy AquaLink RS P4 Pool only Kit With iAqualink,RS System Board, 0/4 Actuators, 6612F,  Web-Connect Device| IQ904-P",EA,"$1,336.64",1336.64
Jandy,Heater,JNDJXI260P,JXI260P,"Jandy JXI Propane Gas Heater, 260K BTU, 137 lbs, Max Flow 100 GPM, Copper Exchanger | JXI260P",EA,"$3,304.82",3304.82
Jandy,Heater,JNDJXI260N,JXI260N,"Jandy JXI Natura Gas Heater, 260K BTU, 137 lbs, Max Flow 100 GPM, Copper Exchanger | JXI260N",EA,"$3,092.29",3092.29
Jandy,Heater,JNDJXI400NK,JXI400NK,"Jandy JXI with VersaFlo Natural Gas Heater, 399K BTU, 143 lbs, Max Flow 100 GPM, Copper Exchanger | JXI400NK",EA,"$3,536.33",3536.33
Jandy,Heater,JNDJXI400N,JXI400N,"Jandy JXI Natural Gas Heater, 399K BTU, 141 lbs, Max Flow 100 GPM, Copper Exchanger | JXI400N",EA,"$4,137.10",4137.1
Jandy,Pump,PLSPB4SQ,PB4SQ,"Polaris PB4SQ Quiet Booster Pump, 0.97 HP, 230/115 V, 60 Hz, Single Phase | PB4SQ",EA,$544.04,544.04
Jandy,Chlorination / Salt,JNDPLC700,PLC700,"Jandy AquaPure Salt Chlorinator PureLink Cell Kit, 7 Blade, 12,000 gallons, 120/240 VAC, 50/60 Hz, 0.75-1.5 AMPS | PLC700",EA,$903.31,903.31
Jandy,Chlorination / Salt,JNDPLC1400,PLC1400,"Jandy AquaPure Salt Chlorinator PureLink Cell Kit, 14 Blade, 40,000 gallons 120/240 VAC, 50/60 Hz, 1.25-2.5 AMPS | PLC1400",EA,"$1,205.74",1205.74
Jandy,Automation / Controls,JNDRSPS8,RS-PS8,Jandy Aqualink RS8 Pool and Spa System for up to 8 Relays and with 2 Actuators | RS-PS8,EA,"$3,259.44",3259.44
Jandy,Automation / Controls,JNDRSP6,RS-P6,"Jandy Aqualink RS6 P or S, System Level, Aqualink RS, RS System Board, Wireless Remote, iQ30-A Web-Connect Device | RS-P6",EA,"$1,876.91",1876.91
Jandy,Chlorination / Salt,JNDTRUCLEAR11KU,TRUCLEAR11KU,"Jandy TruClear Salt Chlorinator Kit with Unions, 35,000 gallons, 120/240 VAC 50/60 Hz, 2-4 AMPS | TRUCLEAR11KU",EA,"$1,147.55",1147.55
Jandy,Pump,JNDVSPHP270DV2A,VSPHP270DV2A,"Jandy VS PlusHP Variable Speed Pump, 2.7 HP, 230/115 V, 2 AUX Relays, No Controller | VSPHP270DV2A",EA,"$1,944.29",1944.29
Jandy,Pump,JNDVSFHP270DV2A,VSFHP270DV2A,"Jandy VS FloPro Variable Speed Pump, 2.7 HP, 230/115 V, 2 AUX Relays, No Controller | VSFHP270DV2A",EA,"$1,786.44",1786.44
Jandy,Pump,JNDVSFHP185DV2A,VSFHP185DV2A,"Jandy VS FloPro Variable Speed Pump, 1.85 HP, 230/115 V, 2 AUX Relays, No Controller | VSFHP185DV2A",EA,"$1,478.95",1478.95
Jandy,Filter,JND7890,7890,"Jandy Spalink RS Remote, RS 8-Function Spa Side Remote, 200', Gray, Control filter pump, Flush Mount | 7890",EA,"$1,289.00",1289.0
Jandy,Automation / Controls,JND8050,8050,"Jandy AquaLink RS Spa Side Remote (4 Function), 1""-1 1/2"", 150' ft, Gray | 8050",EA,$454.82,454.82
Jandy,Filter,JNDCS250,CS250,"Jandy CS Series Cartridge Filter, Single Cartridge, 250 sq. ft, 125 GPM, 60,000 gallons | CS250",EA,"$1,056.87",1056.87
Jandy,Filter,JNDCS200,CS200,"Jandy CS Series Cartridge Filter, Single Cartridge, 200 sq. ft, 125 GPM, 60,000 gallons | CS200",EA,$865.43,865.43
Jandy,Heater,JNDJXI260NK,JXI260NK,"Jandy JXI with VersaFlo Natural Gas Heater, 260K BTU, 139 lbs, Max Flow 100 GPM, Copper Exchanger | JXI260NK",EA,"$2,516.94",2516.94
Jandy,Heater,JNDJXI260PK,JXI260PK,"Jandy JXI with VersaFlo Propane Gas Heater, 260K BTU, 139 lbs, Max Flow 100 GPM, Copper Exchanger | JXI260PK",EA,"$3,035.89",3035.89
Jandy,Automation / Controls,JNDRSP8,RS-P8,"Jandy Aqualink RS8 P or S, System Level, Aqualink RS, RS System Board, Wireless Remote, iQ30-A Web-Connect Device | RS-P8",EA,"$2,774.32",2774.32
Jandy,Filter,JNDCS100,CS100,"Jandy CS Series Cartridge Filter, Single Cartridge, 100 sq. ft, 100 GPM, 48,000 gallons | CS100",EA,$561.11,561.11
Jandy,Filter,JNDCS150,CS150,"Jandy CS Series Cartridge Filter, Single Cartridge, 150 sq. ft, 125 GPM, 60,000 gallons | CS150",EA,$729.30,729.3
Hayward,Filter,HPPC2030,C2030,"Hayward SwimClear Multi-Element 225 sq. ft. Cartridge Filter, 2"" Slip | C2030",EA,"$1,022.16",1022.16
Hayward,Filter,HPPC3030,C3030,"Hayward SwimClear Multi-Element 325 sq. ft. Cartridge Filter, 2"" Slip | C3030",EA,"$1,222.57",1222.57
Hayward,Filter,HPPC4030,C4030,"Hayward SwimClear Multi-Element 425 sq. ft. Cartridge Filter, 2"" Slip | C4030",EA,"$1,387.79",1387.79
Hayward,Filter,HPPC5030,C5030,"Hayward SwimClear Multi-Element 525 sq. ft. Cartridge Filter, 2"" Slip | C5030",EA,"$1,819.24",1819.24
Hayward,Chlorination / Salt,HPPCL200,CL200,"Hayward Automatic Chlorinator, In-Line, 1.5"" FIP, 9 lb Capacity | CL200",EA,$113.81,113.81
Hayward,Chlorination / Salt,HPPCL220,CL220,"Hayward Automatic Chlorinator, Off-Line, Includes Tubing Kit, 9 lb Capacity | CL220",EA,$145.61,145.61
Hayward,Filter,HPPDE6020,DE6020,"Hayward ProGrid 60 sq. ft. DE Filter, Order Valve Separately | DE6020",EA,"$1,418.20",1418.2
Hayward,Filter,HPPDE4820,DE4820,"Hayward ProGrid 48 sq. ft. DE Filter, Order Valve Separately | DE4820",EA,"$1,211.15",1211.15
Hayward,Filter,HPPDE3620,DE3620,"Hayward ProGrid 36 sq. ft. DE Filter, Order Valve Separately | DE3620",EA,"$1,121.42",1121.42
Hayward,Heater,HPPH400FDP,H400FDP,Hayward Universal H-Series 400K BTU Propane Gas Heater |H400FDP,EA,"$3,986.05",3986.05
Hayward,Heater,HPPH400FDN,H400FDN,Hayward Universal H-Series 400K BTU Natural Gas Heater |H400FDN,EA,"$3,986.05",3986.05
Hayward,Heater,HPPH250FDP,H250FDP,Hayward Universal H-Series 250K BTU Propane Gas Heater |H250FDP,EA,"$2,966.40",2966.4
Hayward,Heater,HPPH250FDN,H250FDN,Hayward Universal H-Series 250K BTU Natural Gas Heater |H250FDN,EA,"$2,966.40",2966.4
Hayward,Heater,HPPHDF400,HDF400,Hayward Universal HC Series - Dual Fuel 400K BTU Gas Heater | HDF400,EA,"$4,031.30",4031.3
Hayward,Pump,HPPHL32900VSP,HL32900VSP,"Hayward TriStar VS 900 Omni Variable Speed Pump, 1.85 HP, 115/230 V, 60 Hz, Single Phase | HL32900VSP",EA,"$2,946.75",2946.75
Hayward,Other,HPPHLOMNIHUB,HLOMNIHUB,"Hayward OmniHub Smart Pool and Spa Control with One Smart Relay, expandable |HLOMNIHUB",EA,"$1,077.89",1077.89
Hayward,Automation / Controls,HPPHLBASE,HLBASE,"Hayward OmniLogic Pool, Spa and Backyard Automation System, 4 Relay Base | HLBASE",EA,"$3,059.83",3059.83
Hayward,Lighting,HPPHLWLAN,HLWLAN,"Hayward Omni Smart Pool & Spa Control Configuration Guide, Variable-Speed, Wireless Network Antenna, ColorLogic LED, In Ground Pool | HLWLAN",EA,$329.18,329.18
Hayward,Lighting,HPPLACUS11150,LACUS11150,"Hayward ColorLogic 320 1.5"" LED Light, 150' Cord, 22.4 W, Thermoplastic Trim | LACUS11150",EA,$649.30,649.3
Hayward,Lighting,HPPLACUS11100,LACUS11100,"Hayward ColorLogic 320 1.5"" LED Light, 100' Cord, 22.4 W, Thermoplastic Trim | LACUS11100",EA,$538.15,538.15
Hayward,Lighting,HPPLACUS11050,LACUS11050,"Hayward ColorLogic 320 1.5"" LED Light, 50' Cord, 22.4 W, Thermoplastic Trim | LACUS11050",EA,$511.13,511.13
Hayward,Lighting,HPPLAWUS11100,LAWUS11100,"Hayward Crystalogic 320 1.5"" LED Light, 100' Cord, 20 W, Thermoplastic Trim | Lawus11100",EA,$565.76,565.76
Hayward,Other,HPPSP0607U,SP0607U,Hayward DuraNiche PVC Niche for Liner/Fiberglass Pools | SP0607U,EA,$169.48,169.48
Hayward,Pump,HPPSP2670020VSP,SP2670020VSP,"Hayward Super Pump VS 700 Variable Speed Pump, 1.65 HP, 230/115 V, Single Phase | SP2670020VSP",EA,"$1,389.11",1389.11
Hayward,Pump,HPPSP2670007X10,SP2670007X10,"Hayward Super Pump 700 High Efficiency Pump, 1.1 HP, 230/115 V, Single Phase | SP2670007X10",EA,$785.78,785.78
Hayward,Pump,HPPSP32950VSP,SP32950VSP,"Hayward TriStar VS 950 Variable Speed Pump, 2.7 HP, 230/115 V, Single Phase | SP32950VSP",EA,"$2,130.02",2130.02
Hayward,Pump,HPPSP32900VSP,SP32900VSP,"Hayward TriStar VS 900 Variable Speed Pump, 1.85 HP, 230/115 V, Single Phase | SP32900VSP",EA,"$1,756.77",1756.77
Hayward,Other,HPPTCELLS340,TCELLS340,"Hayward TurboCell S3 Salt Cell, 40,000 gallons, 15' Cord | TCELLS340",EA,"$1,109.93",1109.93
Hayward,Chlorination / Salt,HPPAQRS325,AQRS325,"Hayward AquaRite S3 Salt System with LCD Color Display,  25,000 gallons | AQRS325",EA,"$1,669.69",1669.69
Hayward,Chlorination / Salt,HPPAQRS315,AQRS315,"Hayward Aquarite S3 Salt System With Lcd Color Display, 15,000 Gallons | Aqrs315",EA,"$1,384.17",1384.17
Hayward,Filter,HPPDE7220,DE7220,"Hayward ProGrid 72 sq. ft. DE Filter, Order Valve Separately | DE7220",EA,"$1,694.20",1694.2
Hayward,Heater,HPPH500FDN,H500FDN,Hayward Universal H-Series 500K BTU Natural Gas Heater |H500FDN,EA,"$4,529.30",4529.3
Hayward,Pump,HPPHP21404T,HP21404T,"Hayward HeatPro 140K BTU Heat Pump, Square | HP21404T",EA,"$4,337.04",4337.04
Hayward,Pump,HPPHP21124T,HP21124T,"Hayward HeatPro 110K BTU Heat Pump, Round | HP21124T",EA,"$3,485.56",3485.56
Hayward,Pump,HPPSP2615X20XE,SP2615X20XE,"Hayward Super Pump XE Ultra-High Efficiency Pump, Multi Speed, 2.25 HP, 230/115 V, Single Phase | SP2615X20XE",EA,"$1,210.01",1210.01
Hayward,Pump,HPPSP2610X15XE,SP2610X15XE,"Hayward Super Pump XE Ultra-High Efficiency Pump, Single Speed, 1.65 HP, 230/115 V, Single Phase | SP2610X15XE",EA,"$1,080.79",1080.79
Hayward,Other,HPPTCELLS325,TCELLS325,"Hayward TurboCell S3 Salt Cell, 25,000 gallons, 15' Cord | TCELLS325",EA,$815.77,815.77
Hayward,Other,HPPTCELLS315,TCELLS315,"Hayward TurboCell S3 Salt Cell, 15,000 gallons, 15' Cord | TCELLS315",EA,$499.53,499.53
Hayward,Lighting,HPPLAWUS11150,LAWUS11150,"Hayward CrystaLogic 320 1.5"" LED Light, 150' Cord, 20 W, Thermoplastic Trim | LAWUS11150",EA,$624.57,624.57
Sta-Rite / Pentair,Pump,PEN343001,343001,"Sta-Rite SuperMax Variable Speed Pump, 2.2 THP, 110/230 V, 50/60 Hz, Black | 343001",EA,"$1,327.76",1327.76
Sta-Rite / Pentair,Other,PEN777071451,77707-1451,Pentair NA-LP Natural Gas to Propane 333K Conversion Kit | 77707-1451,EA,$73.29,73.29
Sta-Rite / Pentair,Other,PEN777071441,77707-1441,Pentair NA-LP 400K Conversion Kit | 77707-1441,EA,$81.35,81.35
Sta-Rite / Pentair,Filter,PENPLM300,PLM300,"Sta-Rite System 2 Modular Media Filters - PLM Series, Cartridge, 300 sq. ft, 150 GPM, 72,000 gallons | PLM300",EA,"$1,175.51",1175.51
Sta-Rite / Pentair,Filter,PENPLM150,PLM150,"Sta-Rite System 2 Modular Media Filters - PLM Series, Cartridge, 150 sq. ft, 150 GPM, 72,000 gallons | PLM150",EA,$869.29,869.29
Sta-Rite / Pentair,Filter,PENS8M500,S8M500,"Sta-Rite System 3 Modular Media Filters - SM Series, Cartridge, 500 sq. ft, 130 GPM, 62,400 gallons, In ground Pool | S8M500",EA,"$2,005.27",2005.27
Sta-Rite / Pentair,Filter,PENS8M150,S8M150,"Sta-Rite System 3 Modular Media Filters - SM Series, Cartridge, 450 sq. ft, 124 GPM, 60,000 gallons, In ground Pool | S8M150",EA,"$1,801.40",1801.4
Sta-Rite / Pentair,Filter,PENS7M120,S7M120,"Sta-Rite System 3 Modular Media Filters - SM Series, Cartridge, 300 sq. ft, 100 GPM, 48,000 gallons, In ground Pool | S7M120",EA,"$1,360.15",1360.15
Sta-Rite / Pentair,Heater,PENSR200NA,SR200NA,"Sta-Rite Max-E-Therm 200 High Performance Heater, Natural Gas, 200K BTU, 120/240 VAC, 60 Hz, 171 lbs | SR200NA",EA,"$3,304.79",3304.79
Sta-Rite / Pentair,Heater,PENSR400NA,SR400NA,"Sta-Rite Max-E-Therm 400 High Performance Heater, Natural Gas, 400K BTU, 120/240 VAC, 60 Hz, 138 lbs | SR400NA",EA,"$4,201.78",4201.78
Sta-Rite / Pentair,Heater,PENSR400HD,SR400HD,"Sta-Rite Max-E-Therm 400 HD High Performance Heater, Natural Gas, 400K BTU, 120/240 VAC, 60 Hz, 127 lbs | SR400HD",EA,"$4,490.09",4490.09
Sta-Rite / Pentair,Heater,PENSR333NA,SR333NA,"Sta-Rite Max-E-Therm 333 High Performance Heater, Natural Gas, 333K BTU, 120/240 VAC, 60 Hz, 170 lbs | SR333NA",EA,"$4,192.47",4192.47
Sta-Rite / Pentair,Heater,PENSR333LP,SR333LP,"Sta-Rite Max-E-Therm 333 High Performance Heater, Propane Gas, 333K BTU, 120/240 VAC, 60 Hz, 144 lbs | SR333LP",EA,"$4,104.33",4104.33
Sta-Rite / Pentair,Pump,PEN023035,023035,"Sta-Rite Max-E-ProXF Variable Speed Pump, 5 HP, 208-460 V, 50/60 Hz, Three Phase | 023035",EA,"$3,619.12",3619.12
Sta-Rite / Pentair,Pump,PEN460964,460964,"Pentair UltraTemp High Performance Pool Heat Pump 140, Black, 145K BTU, 60 Hz, 1 Phase, 230 V, 50 Amp, 335 lbs | 460964",EA,"$5,684.41",5684.41
Sta-Rite / Pentair,Filter,PENPLM200,PLM200,"Sta-Rite  System 2 Modular Media Filters - PLM Series, Cartridge, 200 sq. ft, 150 GPM, 72,000 gallons | PLM200",EA,$982.41,982.41
Sta-Rite / Pentair,Pump,PEN013076,013076,"Pentair IntelliPro3 VSF Variable Speed Pump, 3 HP, 208-230 V, 50/60 Hz, with I/O board | 013076",EA,"$2,065.88",2065.88`;
  
  return csvData;
}

/**
 * Generate direct image URL based on manufacturer and part number
 * Returns empty string - images should be added manually for accuracy
 * Use updateImageURLsManually() function for instructions
 */
function generateImageURL(vendor, itemCode, mfgCode) {
  // For now, return empty - direct image URLs need to be manually added
  // This ensures accuracy since manufacturer image URLs vary significantly
  // Users should get direct URLs from manufacturer websites or Google Images
  
  // Option: Return a Google Image Search URL as placeholder
  // Users can click it to find the product image, then copy the direct image URL
  let partNum = itemCode.replace(/^(PEN|JND|HPP|PLS|ZOD)/, '');
  const searchQuery = encodeURIComponent(vendor + ' ' + partNum + ' product image site:pentair.com OR site:jandy.com OR site:hayward.com');
  return `https://www.google.com/search?tbm=isch&q=${searchQuery}`;
  
  // Alternative: Return empty string to force manual entry
  // return '';
}

/**
 * Helper function with instructions for getting direct image URLs
 * Run this to see instructions in the log
 */
function updateImageURLsManually() {
  Logger.log('═══════════════════════════════════════════════════════════');
  Logger.log('HOW TO GET DIRECT IMAGE URLS FOR PRODUCTS');
  Logger.log('═══════════════════════════════════════════════════════════');
  Logger.log('');
  Logger.log('METHOD 1: Google Images (Easiest)');
  Logger.log('1. Open Google Images: https://images.google.com');
  Logger.log('2. Search for: "[Brand] [Part Number] product"');
  Logger.log('   Example: "Pentair 160301 product"');
  Logger.log('3. Find the official product image');
  Logger.log('4. Right-click the image > "Copy image address"');
  Logger.log('5. Paste into Image URL column in Price Book sheet');
  Logger.log('');
  Logger.log('METHOD 2: Manufacturer Websites');
  Logger.log('1. Go to manufacturer website:');
  Logger.log('   - Pentair: https://www.pentair.com');
  Logger.log('   - Jandy: https://www.jandy.com');
  Logger.log('   - Hayward: https://www.hayward.com');
  Logger.log('2. Search for the product by part number');
  Logger.log('3. Right-click the product image > "Copy image address"');
  Logger.log('4. Paste into Image URL column');
  Logger.log('');
  Logger.log('METHOD 3: Bulk Update (Advanced)');
  Logger.log('You can create a script to batch update image URLs');
  Logger.log('or manually update them in the sheet as needed.');
  Logger.log('');
  Logger.log('═══════════════════════════════════════════════════════════');
}

/**
 * Import CSV data into Price Book sheet
 * Uses embedded CSV data and generates image URLs automatically
 */
function importCSVDataToPriceBook(sheet) {
  Logger.log('    📄 Getting embedded CSV data...');
  try {
    const csvData = getEmbeddedCSVData();
    Logger.log('    ✅ CSV data retrieved, length: ' + csvData.length + ' characters');
    const csvLines = csvData.split('\n');
    Logger.log('    📊 Total CSV lines: ' + csvLines.length);
    
    // Skip header row (row 0)
    const dataRows = [];
    
    for (let i = 1; i < csvLines.length; i++) {
      const line = csvLines[i].trim();
      if (!line) continue; // Skip empty lines
      
      // Parse CSV line (handling quoted fields)
      const fields = parseCSVLine(line);
      
      if (fields.length < 8) continue; // Skip invalid rows
      
      const vendor = fields[0] || '';
      const category = fields[1] || 'Other';
      const itemCode = fields[2] || '';
      // Skip MfgCode (fields[3])
      const itemName = fields[4] || '';
      const unit = fields[5] || 'Each';
      // Skip RawPrice (fields[6])
      const price = parseFloat(fields[7]) || 0;
      
      // Map unit: EA -> Each
      const mappedUnit = unit === 'EA' ? 'Each' : unit;
      
      // Map category names to match our dropdown
      let mappedCategory = category;
      if (category === 'Automation / Controls') {
        mappedCategory = 'Automation / Controls';
      } else if (category === 'Chlorination / Salt') {
        mappedCategory = 'Chlorination / Salt';
      }
      
      // Create description from item name (remove the part number suffix if present)
      let description = itemName;
      if (description.includes('|')) {
        description = description.split('|')[0].trim();
      }
      
      // Generate image URL based on vendor and part number
      const imageURL = generateImageURL(vendor, itemCode, fields[3] || '');
      
      // Build row: Brand, Item Code, Item Name, Category, Unit, Price, Description, Image URL, Active
      dataRows.push([
        vendor,
        itemCode,
        itemName,
        mappedCategory,
        mappedUnit,
        price,
        description,
        imageURL, // Auto-generated image URL
        true // Active by default
      ]);
    }
    
    // Write data starting at row 7
    if (dataRows.length > 0) {
      Logger.log('    💾 Writing ' + dataRows.length + ' rows to sheet...');
      sheet.getRange(7, 1, dataRows.length, 9).setValues(dataRows);
      Logger.log('    ✅ Successfully imported ' + dataRows.length + ' items from CSV');
      return dataRows.length; // Return count for formatting
    } else {
      Logger.log('    ⚠️ No data rows to import');
      return 0;
    }
    
  } catch (error) {
    Logger.log('    ❌ ERROR importing CSV data: ' + error.toString());
    Logger.log('    Stack: ' + error.stack);
    Logger.log('    💡 This is not critical - sheet will still be created with sample data');
    
    // Add sample data if CSV import fails
    Logger.log('    📝 Adding sample data instead...');
    const sampleData = [
      ['Pentair', 'PEN160301', 'Pentair Clean & Clear Plus Cartridge Filters, 420 sq. ft', 'Filter', 'Each', 1385.95, '420 sq. ft, 21.5" Diam, 150 GPM', '', true],
      ['Hayward', 'HPPC2030', 'Hayward SwimClear Multi-Element 225 sq. ft. Cartridge Filter', 'Filter', 'Each', 1022.16, '225 sq. ft, 2" Slip', '', true],
      ['Jandy', 'JNDCV460', 'Jandy CV Series Cartridge Filter, Large Cartridge, 460 sq. ft', 'Filter', 'Each', 1332.17, '460 sq. ft, 150 GPM, 72,000 gallons', '', true]
    ];
    try {
      sheet.getRange(7, 1, sampleData.length, 9).setValues(sampleData);
      Logger.log('    ✅ Sample data added');
      return sampleData.length; // Return count for formatting
    } catch (sampleError) {
      Logger.log('    ❌ Could not add sample data: ' + sampleError.toString());
      return 0;
    }
  }
}

/**
 * Manual CSV import function - Run this if CSV wasn't imported during setup
 * Make sure the CSV file is uploaded to your Google Drive first
 */
function importCSVManually() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName('Price book');
  
  if (!sheet) {
    Logger.log('❌ Price book sheet not found. Run setupQuoteSheets() first.');
    return 'Error: Price book sheet not found';
  }
  
  // Clear existing data (keep headers)
  const lastRow = sheet.getLastRow();
  if (lastRow > 6) {
    sheet.deleteRows(7, lastRow - 6);
  }
  
  // Import CSV
  importCSVDataToPriceBook(sheet);
  
  Logger.log('✅ CSV import completed!');
  return 'Success! CSV data imported.';
}

/**
 * Parse CSV line handling quoted fields
 */
function parseCSVLine(line) {
  const fields = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        currentField += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      fields.push(currentField.trim());
      currentField = '';
    } else {
      currentField += char;
    }
  }
  
  // Add last field
  fields.push(currentField.trim());
  
  return fields;
}

/**
 * Setup Labor Sheet - Labor rates and installation costs
 */
function setupLaborSheet(spreadsheet) {
  let sheet = spreadsheet.getSheetByName('Labor');
  
  // Delete if exists and recreate
  if (sheet) {
    spreadsheet.deleteSheet(sheet);
  }
  sheet = spreadsheet.insertSheet('Labor');
  
  // Row 1: Leave blank for logo
  sheet.setRowHeight(1, 100);
  
  // Row 2: Title
  sheet.getRange(2, 1, 1, 7).merge();
  sheet.getRange(2, 1).setValue('👷 LABOR RATES - Installation & Service Costs');
  sheet.getRange(2, 1).setFontSize(20);
  sheet.getRange(2, 1).setFontWeight('bold');
  sheet.getRange(2, 1).setFontColor('#ffffff');
  sheet.getRange(2, 1).setBackground('#8b5cf6');
  sheet.getRange(2, 1).setHorizontalAlignment('center');
  sheet.getRange(2, 1).setVerticalAlignment('middle');
  sheet.setRowHeight(2, 50);
  
  // Row 3: Instructions
  sheet.getRange(3, 1, 1, 7).merge();
  sheet.getRange(3, 1).setValue('Define labor rates for different types of work. Use these rates when calculating installation and service costs.');
  sheet.getRange(3, 1).setFontSize(11);
  sheet.getRange(3, 1).setFontColor('#6b7280');
  sheet.getRange(3, 1).setBackground('#f3f4f6');
  sheet.getRange(3, 1).setHorizontalAlignment('center');
  sheet.getRange(3, 1).setFontStyle('italic');
  sheet.setRowHeight(3, 35);
  
  // Row 4: Empty spacer
  sheet.setRowHeight(4, 10);
  
  // Row 5: Headers
  const headers = [
    'Labor Type',
    'Category',
    'Unit',
    'Rate',
    'Description',
    'Notes',
    'Active'
  ];
  
  const headerDescriptions = [
    'Name of the labor task or service',
    'Select category: Installation, Demolition, Repair, Maintenance, Other',
    'Select unit: Per Hour, Per Day, Per Unit, Flat Rate, Per Square Foot, etc.',
    'Enter labor rate per unit (numbers only, no dollar sign)',
    'Brief description of what this labor includes',
    'Additional notes, special conditions, or requirements',
    'Check this box if this labor rate is currently active'
  ];
  
  // Set headers
  sheet.getRange(5, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(5, 1, 1, headers.length).setFontSize(12);
  sheet.getRange(5, 1, 1, headers.length).setFontWeight('bold');
  sheet.getRange(5, 1, 1, headers.length).setFontColor('#ffffff');
  sheet.getRange(5, 1, 1, headers.length).setBackground('#8b5cf6');
  sheet.getRange(5, 1, 1, headers.length).setHorizontalAlignment('center');
  sheet.getRange(5, 1, 1, headers.length).setVerticalAlignment('middle');
  sheet.setRowHeight(5, 40);
  
  // Add descriptions row
  sheet.getRange(6, 1, 1, headers.length).setValues([headerDescriptions]);
  sheet.getRange(6, 1, 1, headers.length).setFontSize(9);
  sheet.getRange(6, 1, 1, headers.length).setFontColor('#6b7280');
  sheet.getRange(6, 1, 1, headers.length).setBackground('#ede9fe');
  sheet.getRange(6, 1, 1, headers.length).setFontStyle('italic');
  sheet.getRange(6, 1, 1, headers.length).setWrap(true);
  sheet.setRowHeight(6, 60);
  
  // Format columns
  sheet.setColumnWidth(1, 220); // Labor Type
  sheet.setColumnWidth(2, 150); // Category
  sheet.setColumnWidth(3, 140); // Unit
  sheet.setColumnWidth(4, 100); // Rate
  sheet.setColumnWidth(5, 280); // Description
  sheet.setColumnWidth(6, 250); // Notes
  sheet.setColumnWidth(7, 80);  // Active
  
  // Add data validation for Category column
  const categoryRange = sheet.getRange(7, 2, 1000, 1);
  const categoryRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Installation', 'Demolition', 'Repair', 'Maintenance', 'Other'], true)
    .setAllowInvalid(false)
    .setHelpText('Select a labor category from the dropdown')
    .build();
  categoryRange.setDataValidation(categoryRule);
  
  // Add data validation for Unit column
  const unitRange = sheet.getRange(7, 3, 1000, 1);
  const unitRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Per Hour', 'Per Day', 'Per Unit', 'Flat Rate', 'Per Square Foot', 'Per Linear Foot', 'Per Yard'], true)
    .setAllowInvalid(false)
    .setHelpText('Select a unit from the dropdown')
    .build();
  unitRange.setDataValidation(unitRule);
  
  // Add data validation for Active column
  const activeRange = sheet.getRange(7, 7, 1000, 1);
  const activeRule = SpreadsheetApp.newDataValidation()
    .requireCheckbox()
    .build();
  activeRange.setDataValidation(activeRule);
  
  // Format Rate column as currency
  sheet.getRange(7, 4, 1000, 1).setNumberFormat('$#,##0.00');
  
  // Add sample data
  const sampleData = [
    ['Pool Installation - Standard', 'Installation', 'Flat Rate', 3500.00, 'Complete pool installation including excavation, walls, plumbing, and equipment setup', 'Standard residential pool, no special requirements', true],
    ['Concrete Removal Labor', 'Demolition', 'Per Square Foot', 3.50, 'Labor cost for removing existing concrete decking', 'Includes disposal and cleanup', true],
    ['Equipment Installation', 'Installation', 'Per Hour', 85.00, 'Installation of pool equipment (pumps, filters, heaters)', 'Minimum 4 hours', true],
    ['Pool Repair Service', 'Repair', 'Per Hour', 95.00, 'General pool repair and troubleshooting', 'Travel time included after first hour', true]
  ];
  
  sheet.getRange(7, 1, sampleData.length, headers.length).setValues(sampleData);
  
  // Format sample data rows
  for (let i = 0; i < sampleData.length; i++) {
    const row = 7 + i;
    if (i % 2 === 0) {
      sheet.getRange(row, 1, 1, headers.length).setBackground('#ffffff');
    } else {
      sheet.getRange(row, 1, 1, headers.length).setBackground('#faf5ff');
    }
    sheet.getRange(row, 1, 1, headers.length).setBorder(true, true, true, true, false, false, '#ddd6fe', SpreadsheetApp.BorderStyle.SOLID);
    sheet.setRowHeight(row, 50);
    sheet.getRange(row, 5).setWrap(true); // Wrap description
    sheet.getRange(row, 6).setWrap(true); // Wrap notes
  }
  
  // Freeze header rows
  sheet.setFrozenRows(6);
  
  Logger.log('  ✅ Labor sheet created and formatted');
  
  // Populate with recommended labor items
  populateLaborItems(sheet);
}

/**
 * Populate Labor sheet with recommended labor items and pricing
 */
function populateLaborItems(sheet) {
  Logger.log('  📝 Adding recommended labor items...');
  
  const laborItems = [
    // INSTALLATION - FLAT RATES
    ['Site Survey & Layout', 'Installation', 'Flat Rate', 750, 'Mark pool location, check utilities, set elevations', 'Includes permit coordination', true],
    ['Main Plumbing Installation', 'Installation', 'Flat Rate', 3500, 'Install all pool plumbing (suction, returns, drains)', 'Includes PVC cutting, gluing, pressure testing', true],
    ['Equipment Pad Plumbing', 'Installation', 'Flat Rate', 1800, 'Connect equipment pad plumbing', 'Includes all equipment connections', true],
    ['Electrical Rough-In', 'Installation', 'Flat Rate', 2500, 'Run electrical conduit, wire', 'Includes GFCI requirements', true],
    ['Equipment Electrical Hookup', 'Installation', 'Flat Rate', 1200, 'Connect pump, filter, heater, automation', 'Per equipment pad', true],
    ['Equipment Installation - Complete', 'Installation', 'Flat Rate', 4500, 'Install all equipment (pump, filter, heater, automation)', 'Includes mounting, plumbing, electrical', true],
    ['Automation System Installation', 'Installation', 'Flat Rate', 1800, 'Install automation panel and wiring', 'Control Freak or other systems', true],
    ['Bonding & Grounding', 'Installation', 'Flat Rate', 800, 'Install pool bonding grid', 'Code requirement', true],
    ['Liner Installation', 'Installation', 'Flat Rate', 2500, 'Install vinyl liner, vacuum wrinkles', 'Standard vinyl liner', true],
    ['Liner Installation - Complex', 'Installation', 'Flat Rate', 3800, 'Custom liner fitting, complex shapes', 'Additional time for difficult fits', true],
    ['Pressure Testing', 'Installation', 'Flat Rate', 600, 'Test all plumbing for leaks', 'Includes air/water pressure test', true],
    ['Pool Filling', 'Installation', 'Flat Rate', 400, 'Fill pool with water, balance chemicals', 'Initial fill and startup', true],
    ['Job Site Cleanup', 'Installation', 'Flat Rate', 800, 'Final cleanup, remove debris', 'End of project', true],
    ['Equipment Startup & Testing', 'Installation', 'Flat Rate', 600, 'Start all equipment, test systems', 'Final system check', true],
    ['Customer Orientation', 'Installation', 'Flat Rate', 300, 'Show customer how to operate pool', 'Equipment training', true],
    
    // INSTALLATION - FLAT RATES (Wall Installation)
    ['Wall Installation - Standard', 'Installation', 'Flat Rate', 8000, 'Install pool walls, braces, stakes', 'Standard rectangular pools. Includes all hardware', true],
    ['Wall Installation - Complex', 'Installation', 'Flat Rate', 12000, 'Install custom/curved walls', 'Kidney, freeform, or complex shape pools', true],
    ['Wall Installation - Very Complex', 'Installation', 'Flat Rate', 14000, 'Install walls with tanning ledge or multiple features', 'Pools with tanning ledge, benches, or multiple depth changes', true],
    
    // INSTALLATION - FLAT RATES (Pool Bottom)
    ['Pool Bottom Preparation - Flat Bottom', 'Installation', 'Flat Rate', 2500, 'Grade and prepare flat bottom pool floor', 'For flat bottom or sports style pools', true],
    ['Pool Bottom Preparation - Regular', 'Installation', 'Flat Rate', 3000, 'Grade and prepare sloped pool floor', 'Standard sloped bottom before liner installation', true],
    ['Pool Bottom Preparation - Sports Style', 'Installation', 'Flat Rate', 3750, 'Grade and prepare sports style flat bottom', 'Sports style pool with flat bottom', true],
    ['Concrete Decking - Broom Finish', 'Installation', 'Per Square Foot', 12, 'Pour and finish concrete deck', 'Labor only, material separate', true],
    ['Concrete Decking - Stamped', 'Installation', 'Per Square Foot', 16, 'Pour and stamp concrete deck', 'Decorative finish', true],
    ['Concrete Decking - Exposed Aggregate', 'Installation', 'Per Square Foot', 18, 'Pour and finish exposed aggregate', 'Premium finish', true],
    
    // INSTALLATION - PER LINEAR FOOT
    ['Concrete Collar Installation', 'Installation', 'Per Linear Foot', 18, 'Pour and finish concrete collar', '12" wide x 6" deep around pool', true],
    ['Coping Installation', 'Installation', 'Per Linear Foot', 22, 'Install pool coping', 'Cardinal or other coping', true],
    ['Coping Installation - Custom', 'Installation', 'Per Linear Foot', 32, 'Install custom coping materials', 'Stone, pavers, etc.', true],
    ['Formwork Setup', 'Installation', 'Per Linear Foot', 6, 'Set forms for concrete deck', 'Edge forms', true],
    
    // INSTALLATION - PER UNIT
    ['Skimmer Installation', 'Installation', 'Per Unit', 300, 'Install skimmer box and faceplate', 'Per skimmer', true],
    ['Return Installation', 'Installation', 'Per Unit', 150, 'Install return fittings', 'Per return', true],
    ['Main Drain Installation', 'Installation', 'Per Unit', 400, 'Install main drain assembly', 'Per drain', true],
    ['Light Installation', 'Installation', 'Per Unit', 600, 'Install pool light and niche', 'Per light', true],
    ['Stair Installation', 'Installation', 'Per Unit', 850, 'Install pool stairs/entry system', 'Per set of stairs', true],
    ['Water Features Installation', 'Installation', 'Per Unit', 1200, 'Install bubblers, deck jets, waterfalls', 'Per feature', true],
    
    // INSTALLATION - PER YARD
    ['Excavation - Standard Soil', 'Installation', 'Per Yard', 50, 'Dig pool hole, remove dirt', 'Standard access, no rock', true],
    ['Excavation - Rock Removal', 'Installation', 'Per Yard', 100, 'Excavation in rocky soil', 'Additional cost for rock breaking', true],
    ['Excavation - Limited Access', 'Installation', 'Per Yard', 120, 'Excavation with mini excavator or hand digging', 'When full-size equipment can\'t access', true],
    ['Backfill & Compaction', 'Installation', 'Flat Rate', 2500, 'Fill around pool walls, compact', 'Complete backfill step in process', true],
    ['Soil Disposal', 'Installation', 'Per Yard', 40, 'Haul away excavated soil', 'If spoils don\'t stay on site', true],
    
    // DEMOLITION - FLAT RATES
    ['Site Preparation for Renovation', 'Demolition', 'Flat Rate', 1200, 'Prep site for new construction', 'After demolition', true],
    ['Plumbing Removal', 'Demolition', 'Flat Rate', 1200, 'Remove existing plumbing', 'Includes cutting and removal', true],
    ['Electrical Removal', 'Demolition', 'Flat Rate', 800, 'Remove old electrical', 'Disconnect and remove wiring', true],
    ['Equipment Removal', 'Demolition', 'Per Unit', 500, 'Remove old pool equipment', 'Per piece', true],
    
    // DEMOLITION - PER SQUARE FOOT
    ['Concrete Deck Removal', 'Demolition', 'Per Square Foot', 5.5, 'Remove existing concrete decking', 'Includes disposal', true],
    ['Concrete Deck Removal - Limited Access', 'Demolition', 'Per Square Foot', 8, 'Hand removal or mini equipment', 'When large equipment can\'t access', true],
    
    // DEMOLITION - PER UNIT
    ['Pool Wall Removal', 'Demolition', 'Per Unit', 120, 'Remove existing pool walls', 'Per wall section', true],
    ['Pool Wall Removal - Salvage', 'Demolition', 'Per Unit', 150, 'Carefully remove walls for reuse', 'More time, preserve materials', true],
    
    // DEMOLITION - PER YARD
    ['Debris Disposal', 'Demolition', 'Per Yard', 45, 'Haul away demolition debris', 'Per dump truck load', true],
    
    // REPAIR - FLAT RATES
    ['Leak Detection & Repair', 'Repair', 'Flat Rate', 1000, 'Find and fix pool leaks', 'Includes pressure testing', true],
    ['Liner Repair', 'Repair', 'Flat Rate', 500, 'Patch or replace sections of liner', 'Small repairs', true],
    ['Liner Replacement', 'Repair', 'Flat Rate', 2800, 'Replace entire pool liner', 'Full liner replacement', true],
    ['Wall Repair', 'Repair', 'Flat Rate', 1200, 'Repair damaged pool walls', 'Structural repairs', true],
    ['Plumbing Repair', 'Repair', 'Flat Rate', 700, 'Fix leaks, replace fittings', 'Per repair location', true],
    ['Equipment Repair', 'Repair', 'Flat Rate', 600, 'Fix pumps, filters, heaters', 'Troubleshooting and repair', true],
    ['Electrical Repair', 'Repair', 'Flat Rate', 600, 'Fix electrical issues', 'GFCI, wiring, etc.', true],
    ['Coping Repair', 'Repair', 'Per Linear Foot', 28, 'Repair or replace coping', 'Per section', true],
    
    // MAINTENANCE - FLAT RATES
    ['Pool Opening Service', 'Maintenance', 'Flat Rate', 450, 'Open pool for season', 'Chemical balance, equipment startup', true],
    ['Pool Closing Service', 'Maintenance', 'Flat Rate', 500, 'Close pool for winter', 'Winterize equipment, cover', true],
    ['Weekly Pool Service', 'Maintenance', 'Flat Rate', 150, 'Weekly cleaning and maintenance', 'Per visit', true],
    ['Monthly Pool Service', 'Maintenance', 'Flat Rate', 200, 'Monthly maintenance visit', 'Per visit', true],
    ['Chemical Balancing', 'Maintenance', 'Flat Rate', 200, 'Balance pool chemistry', 'One-time service', true],
    ['Equipment Maintenance', 'Maintenance', 'Flat Rate', 300, 'Routine equipment maintenance', 'Cleaning, lubrication', true],
    
    // OTHER - FLAT RATES
    ['Permit Acquisition', 'Other', 'Flat Rate', 500, 'Obtain building permits', 'Per permit', true],
    ['Inspection Coordination', 'Other', 'Flat Rate', 250, 'Coordinate inspections', 'Per inspection', true],
    ['Design Consultation', 'Other', 'Flat Rate', 500, 'Pool design and planning', 'Consultation time', true],
    ['Project Management', 'Other', 'Flat Rate', 3500, 'Overall project coordination', 'For complex projects', true],
    ['Travel Time', 'Other', 'Flat Rate', 150, 'Travel to job site', 'If outside service area', true],
    ['Emergency Service', 'Other', 'Flat Rate', 750, 'After-hours emergency service', 'Premium rate', true],
    ['Equipment Operation', 'Other', 'Flat Rate', 900, 'Skid steer, excavator operation', 'Per day or per project', true]
  ];
  
  // Clear existing data (keep headers)
  const lastRow = sheet.getLastRow();
  if (lastRow > 6) {
    // Only delete if there are actual data rows to delete
    const rowsToDelete = lastRow - 6;
    if (rowsToDelete > 0) {
      try {
        sheet.deleteRows(7, rowsToDelete);
      } catch (error) {
        // If deletion fails (e.g., all rows are frozen or no rows exist), just clear the content
        Logger.log('  ⚠️ Could not delete rows, clearing content instead: ' + error.toString());
        if (rowsToDelete > 0) {
          sheet.getRange(7, 1, rowsToDelete, 7).clearContent();
        }
      }
    }
  }
  
  // Add all labor items starting at row 7
  if (laborItems.length > 0) {
    sheet.getRange(7, 1, laborItems.length, 7).setValues(laborItems);
    
    // Format the new rows
    for (let i = 0; i < laborItems.length; i++) {
      const row = 7 + i;
      if (i % 2 === 0) {
        sheet.getRange(row, 1, 1, 7).setBackground('#ffffff');
      } else {
        sheet.getRange(row, 1, 1, 7).setBackground('#faf5ff');
      }
      sheet.getRange(row, 1, 1, 7).setBorder(true, true, true, true, false, false, '#ddd6fe', SpreadsheetApp.BorderStyle.SOLID);
      sheet.setRowHeight(row, 50);
      sheet.getRange(row, 5).setWrap(true); // Wrap description
      sheet.getRange(row, 6).setWrap(true); // Wrap notes
    }
    
    Logger.log('  ✅ Added ' + laborItems.length + ' labor items to Labor sheet');
  }
}

/**
 * Standalone function to populate Labor sheet with recommended items
 * Run this if you just want to add/update labor items without recreating the sheet
 */
function populateLaborItemsOnly() {
  Logger.log('═══════════════════════════════════════════════════════════');
  Logger.log('POPULATING LABOR ITEMS');
  Logger.log('═══════════════════════════════════════════════════════════');
  
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName('Labor');
    
    if (!sheet) {
      Logger.log('❌ Labor sheet not found. Run setupQuoteSheets() first to create it.');
      return;
    }
    
    populateLaborItems(sheet);
    Logger.log('✅ Labor items populated successfully!');
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.toString());
    Logger.log('Stack: ' + error.stack);
  }
}

/**
 * Setup Equipment Bundles Sheet - Pre-configured equipment packages
 */
function setupEquipmentBundlesSheet(spreadsheet) {
  let sheet = spreadsheet.getSheetByName('Equipment Bundles');
  
  // Delete if exists and recreate
  if (sheet) {
    spreadsheet.deleteSheet(sheet);
  }
  sheet = spreadsheet.insertSheet('Equip bundles');
  
  // Row 1: Leave blank for logo
  sheet.setRowHeight(1, 100);
  
  // Row 2: Title
  sheet.getRange(2, 1, 1, 7).merge();
  sheet.getRange(2, 1).setValue('⚙️ EQUIPMENT BUNDLES - Pre-Configured Packages');
  sheet.getRange(2, 1).setFontSize(20);
  sheet.getRange(2, 1).setFontWeight('bold');
  sheet.getRange(2, 1).setFontColor('#ffffff');
  sheet.getRange(2, 1).setBackground('#10b981');
  sheet.getRange(2, 1).setHorizontalAlignment('center');
  sheet.getRange(2, 1).setVerticalAlignment('middle');
  sheet.setRowHeight(2, 50);
  
  // Row 3: Instructions
  sheet.getRange(3, 1, 1, 7).merge();
  sheet.getRange(3, 1).setValue('Create equipment packages that can be quickly added to quotes. Bundle items together for convenience and faster quoting.');
  sheet.getRange(3, 1).setFontSize(11);
  sheet.getRange(3, 1).setFontColor('#6b7280');
  sheet.getRange(3, 1).setBackground('#f3f4f6');
  sheet.getRange(3, 1).setHorizontalAlignment('center');
  sheet.getRange(3, 1).setFontStyle('italic');
  sheet.setRowHeight(3, 35);
  
  // Row 4: Empty spacer
  sheet.setRowHeight(4, 10);
  
  // Row 5: Headers
  const headers = [
    'Bundle Name',
    'Description',
    'Items Included',
    'Base Price',
    'Installation Labor',
    'Total Price',
    'Active'
  ];
  
  const headerDescriptions = [
    'Enter a descriptive name for this equipment bundle or package',
    'Provide a brief description of what this bundle includes and its purpose',
    'List all items included in this bundle (pumps, filters, heaters, etc.) - one item per line',
    'Enter the base equipment cost before adding installation labor',
    'Enter the installation labor cost for this bundle',
    'Total price is automatically calculated (Base Price + Installation Labor)',
    'Check this box if the bundle is currently available for quotes'
  ];
  
  // Set headers
  sheet.getRange(5, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(5, 1, 1, headers.length).setFontSize(12);
  sheet.getRange(5, 1, 1, headers.length).setFontWeight('bold');
  sheet.getRange(5, 1, 1, headers.length).setFontColor('#ffffff');
  sheet.getRange(5, 1, 1, headers.length).setBackground('#10b981');
  sheet.getRange(5, 1, 1, headers.length).setHorizontalAlignment('center');
  sheet.getRange(5, 1, 1, headers.length).setVerticalAlignment('middle');
  sheet.setRowHeight(5, 40);
  
  // Add descriptions row
  sheet.getRange(6, 1, 1, headers.length).setValues([headerDescriptions]);
  sheet.getRange(6, 1, 1, headers.length).setFontSize(9);
  sheet.getRange(6, 1, 1, headers.length).setFontColor('#6b7280');
  sheet.getRange(6, 1, 1, headers.length).setBackground('#d1fae5');
  sheet.getRange(6, 1, 1, headers.length).setFontStyle('italic');
  sheet.getRange(6, 1, 1, headers.length).setWrap(true);
  sheet.setRowHeight(6, 60);
  
  // Format columns
  sheet.setColumnWidth(1, 200); // Bundle Name
  sheet.setColumnWidth(2, 250); // Description
  sheet.setColumnWidth(3, 300); // Items Included
  sheet.setColumnWidth(4, 120); // Base Price
  sheet.setColumnWidth(5, 150); // Installation Labor
  sheet.setColumnWidth(6, 120); // Total Price
  sheet.setColumnWidth(7, 80);  // Active
  
  // Add data validation for Active column
  const activeRange = sheet.getRange(7, 7, 1000, 1);
  const activeRule = SpreadsheetApp.newDataValidation()
    .requireCheckbox()
    .build();
  activeRange.setDataValidation(activeRule);
  
  // Format price columns as currency
  sheet.getRange(7, 4, 1000, 1).setNumberFormat('$#,##0.00'); // Base Price
  sheet.getRange(7, 5, 1000, 1).setNumberFormat('$#,##0.00'); // Installation Labor
  sheet.getRange(7, 6, 1000, 1).setNumberFormat('$#,##0.00'); // Total Price
  
  // Add formula for Total Price (Base Price + Installation Labor)
  sheet.getRange(7, 6, 1000, 1).setFormula('=IF(AND(ISNUMBER(D7),ISNUMBER(E7)),D7+E7,"")');
  
  // Add sample data
  const sampleData = [
    [
      'Standard Pool Package',
      'Complete pool equipment setup for standard residential pool installations',
      '1.5 HP Single-Speed Pump\nSand Filter System\nPool Heater\nPool Lights (2)\nAutomatic Pool Cleaner',
      3500.00,
      1200.00,
      '', // Will be calculated by formula
      true
    ],
    [
      'Premium Pool Package',
      'High-end equipment package with advanced features and energy efficiency',
      'Variable Speed Pump\nCartridge Filter System\nHeat Pump\nLED Pool Lights (4)\nRobotic Pool Cleaner\nSalt Chlorination System',
      8500.00,
      2000.00,
      '', // Will be calculated by formula
      true
    ]
  ];
  
  sheet.getRange(7, 1, sampleData.length, headers.length).setValues(sampleData);
  
  // Format sample data rows
  for (let i = 0; i < sampleData.length; i++) {
    const row = 7 + i;
    if (i % 2 === 0) {
      sheet.getRange(row, 1, 1, headers.length).setBackground('#ffffff');
    } else {
      sheet.getRange(row, 1, 1, headers.length).setBackground('#f0fdf4');
    }
    sheet.getRange(row, 1, 1, headers.length).setBorder(true, true, true, true, false, false, '#d1fae5', SpreadsheetApp.BorderStyle.SOLID);
    sheet.setRowHeight(row, 60); // Taller rows for multi-line items
    sheet.getRange(row, 3).setWrap(true); // Wrap items column
  }
  
  // Freeze header rows
  sheet.setFrozenRows(6);
  
  Logger.log('  ✅ Equipment Bundles sheet created and formatted');
}

/**
 * Setup Quick Quote Sheet - Saved quote templates and quick reference
 */
function setupQuickQuoteSheet(spreadsheet) {
  let sheet = spreadsheet.getSheetByName('Quick quote');
  
  // Delete if exists and recreate
  if (sheet) {
    spreadsheet.deleteSheet(sheet);
  }
  sheet = spreadsheet.insertSheet('Quick quote');
  
  // Row 1: Leave blank for logo
  sheet.setRowHeight(1, 100);
  
  // Row 2: Title
  sheet.getRange(2, 1, 1, 8).merge();
  sheet.getRange(2, 1).setValue('💰 QUICK QUOTE - Saved Quotes & Templates');
  sheet.getRange(2, 1).setFontSize(20);
  sheet.getRange(2, 1).setFontWeight('bold');
  sheet.getRange(2, 1).setFontColor('#ffffff');
  sheet.getRange(2, 1).setBackground('#f59e0b');
  sheet.getRange(2, 1).setHorizontalAlignment('center');
  sheet.getRange(2, 1).setVerticalAlignment('middle');
  sheet.setRowHeight(2, 50);
  
  // Row 3: Instructions
  sheet.getRange(3, 1, 1, 8).merge();
  sheet.getRange(3, 1).setValue('Store completed quotes here for quick reference. Use saved quotes as templates for similar projects to speed up the quoting process.');
  sheet.getRange(3, 1).setFontSize(11);
  sheet.getRange(3, 1).setFontColor('#6b7280');
  sheet.getRange(3, 1).setBackground('#f3f4f6');
  sheet.getRange(3, 1).setHorizontalAlignment('center');
  sheet.getRange(3, 1).setFontStyle('italic');
  sheet.setRowHeight(3, 35);
  
  // Row 4: Empty spacer
  sheet.setRowHeight(4, 10);
  
  // Row 5: Headers
  const headers = [
    'Quote #',
    'Customer Name',
    'Project Type',
    'Project Description',
    'Total Amount',
    'Date Created',
    'Status',
    'Notes'
  ];
  
  const headerDescriptions = [
    'Enter a unique quote number (typically auto-generated by the system)',
    'Enter the customer name associated with this quote',
    'Select whether this is a New Build or Renovation project',
    'Provide a brief description of the project scope and details',
    'Enter the total quote amount for this project',
    'Enter or select the date when this quote was created',
    'Select the current status: Draft, Sent, Accepted, or Rejected',
    'Add any additional notes, special conditions, or important information'
  ];
  
  // Set headers
  sheet.getRange(5, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(5, 1, 1, headers.length).setFontSize(12);
  sheet.getRange(5, 1, 1, headers.length).setFontWeight('bold');
  sheet.getRange(5, 1, 1, headers.length).setFontColor('#ffffff');
  sheet.getRange(5, 1, 1, headers.length).setBackground('#f59e0b');
  sheet.getRange(5, 1, 1, headers.length).setHorizontalAlignment('center');
  sheet.getRange(5, 1, 1, headers.length).setVerticalAlignment('middle');
  sheet.setRowHeight(5, 40);
  
  // Add descriptions row
  sheet.getRange(6, 1, 1, headers.length).setValues([headerDescriptions]);
  sheet.getRange(6, 1, 1, headers.length).setFontSize(9);
  sheet.getRange(6, 1, 1, headers.length).setFontColor('#6b7280');
  sheet.getRange(6, 1, 1, headers.length).setBackground('#fef3c7');
  sheet.getRange(6, 1, 1, headers.length).setFontStyle('italic');
  sheet.getRange(6, 1, 1, headers.length).setWrap(true);
  sheet.setRowHeight(6, 50);
  
  // Format columns
  sheet.setColumnWidth(1, 120); // Quote #
  sheet.setColumnWidth(2, 180); // Customer Name
  sheet.setColumnWidth(3, 130); // Project Type
  sheet.setColumnWidth(4, 300); // Project Description
  sheet.setColumnWidth(5, 120); // Total Amount
  sheet.setColumnWidth(6, 130); // Date Created
  sheet.setColumnWidth(7, 120); // Status
  sheet.setColumnWidth(8, 250); // Notes
  
  // Add data validation for Project Type
  const projectTypeRange = sheet.getRange(7, 3, 1000, 1);
  const projectTypeRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['New Build', 'Renovation'], true)
    .setAllowInvalid(false)
    .setHelpText('Select project type')
    .build();
  projectTypeRange.setDataValidation(projectTypeRule);
  
  // Add data validation for Status
  const statusRange = sheet.getRange(7, 7, 1000, 1);
  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Draft', 'Sent', 'Accepted', 'Rejected'], true)
    .setAllowInvalid(false)
    .setHelpText('Select quote status')
    .build();
  statusRange.setDataValidation(statusRule);
  
  // Format Total Amount as currency
  sheet.getRange(7, 5, 1000, 1).setNumberFormat('$#,##0.00');
  
  // Format Date Created column
  sheet.getRange(7, 6, 1000, 1).setNumberFormat('mm/dd/yyyy');
  
  // Add sample data
  const today = new Date();
  const sampleData = [
    [
      'Q-2024-001',
      'John Smith',
      'New Build',
      '16x32 rectangular pool with standard equipment package and concrete decking',
      28500.00,
      today,
      'Sent',
      'Customer requested quote via website. Follow up scheduled for next week.'
    ],
    [
      'Q-2024-002',
      'Jane Doe',
      'Renovation',
      'Pool resurfacing, equipment upgrade, and deck repair',
      12500.00,
      today,
      'Draft',
      'Waiting for customer approval on equipment selection. Quote expires in 30 days.'
    ]
  ];
  
  sheet.getRange(7, 1, sampleData.length, headers.length).setValues(sampleData);
  
  // Format sample data rows
  for (let i = 0; i < sampleData.length; i++) {
    const row = 7 + i;
    if (i % 2 === 0) {
      sheet.getRange(row, 1, 1, headers.length).setBackground('#ffffff');
    } else {
      sheet.getRange(row, 1, 1, headers.length).setBackground('#fffbeb');
    }
    sheet.getRange(row, 1, 1, headers.length).setBorder(true, true, true, true, false, false, '#fde68a', SpreadsheetApp.BorderStyle.SOLID);
    sheet.setRowHeight(row, 40);
    sheet.getRange(row, 4).setWrap(true); // Wrap description
    sheet.getRange(row, 8).setWrap(true); // Wrap notes
  }
  
  // Freeze header rows
  sheet.setFrozenRows(6);
  
  Logger.log('  ✅ Quick quote sheet created and formatted');
}

/**
 * Helper function to apply alternating row colors
 */
function applyAlternatingRows(sheet, startRow, endRow, numCols, color1, color2) {
  for (let row = startRow; row <= endRow; row++) {
    if (row % 2 === 0) {
      sheet.getRange(row, 1, 1, numCols).setBackground(color1);
    } else {
      sheet.getRange(row, 1, 1, numCols).setBackground(color2);
    }
  }
}


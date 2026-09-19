/**
 * COMPREHENSIVE PROPERTY SHEET TEMPLATE
 * 
 * This template creates a complete property management sheet with:
 * - Property Information
 * - Financial Overview (Mortgage, Taxes, Ownership)
 * - Payment History / Transaction History
 * - Late Notices Log
 * - Profit Analysis
 * - Expenses Tracking
 * 
 * All calculations are automatic.
 */

function createComprehensivePropertySheet(spreadsheet, propertyName, propertyData) {
  let propertySheet = null;
  
  try {
    // Safety check: if spreadsheet is not provided, get it from SPREADSHEET_ID
    if (!spreadsheet) {
      const SPREADSHEET_ID = '1sC_q33TB088JdHc23zhLAU_bM59Q9nE7eZf9ugL4YoY';
      spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    }
    
    // Default values if not provided
    if (!propertyName) {
      propertyName = 'Test Property';
    }
    if (!propertyData) {
      propertyData = {
        propertyName: 'Test Property',
        address: '123 Test St',
        monthlyRent: 1500,
        tenantName: 'Test Tenant',
        tenantEmail: 'test@example.com',
        tenantPhone: '(555) 123-4567'
      };
    }
    
    // Safety check
    if (!spreadsheet) {
      throw new Error('Spreadsheet is required');
    }
    
    // Delete existing sheet if it exists
    const existingSheet = spreadsheet.getSheetByName(propertyName);
    if (existingSheet) {
      spreadsheet.deleteSheet(existingSheet);
    }
    
    // Create the sheet FIRST before doing any formatting
    propertySheet = spreadsheet.insertSheet(propertyName);
    
    // If we get here and propertySheet is null, something went wrong
    if (!propertySheet) {
      throw new Error('Failed to create sheet');
    }
    
    // Clear any default formatting
    propertySheet.clearFormats();
    
    // ============================================
    // SECTION 1: PROPERTY INFORMATION (Rows 2-12)
    // ============================================
    propertySheet.getRange(2, 1).setValue('PROPERTY INFORMATION');
    propertySheet.getRange(2, 1, 1, 4).merge();
    formatSectionHeader(propertySheet, 2, 1, 4, '#1e40af');
    
    propertySheet.getRange(3, 1).setValue('Property Name:');
    propertySheet.getRange(3, 2).setValue(propertyData.propertyName || '');
    propertySheet.getRange(4, 1).setValue('Address:');
    propertySheet.getRange(4, 2).setValue(propertyData.address || '');
    propertySheet.getRange(5, 1).setValue('Monthly Rent:');
    propertySheet.getRange(5, 2).setValue(parseFloat(propertyData.monthlyRent || 0));
    propertySheet.getRange(5, 2).setNumberFormat('$#,##0.00');
    
    propertySheet.getRange(6, 1).setValue('Tenant Name:');
    propertySheet.getRange(6, 2).setValue(propertyData.tenantName || 'Vacant');
    propertySheet.getRange(7, 1).setValue('Tenant Email:');
    propertySheet.getRange(7, 2).setValue(propertyData.tenantEmail || '');
    propertySheet.getRange(8, 1).setValue('Tenant Phone:');
    propertySheet.getRange(8, 2).setValue(propertyData.tenantPhone || '');
    propertySheet.getRange(9, 1).setValue('Lease Start Date:');
    propertySheet.getRange(9, 2).setValue(propertyData.leaseStartDate || '');
    propertySheet.getRange(9, 2).setNumberFormat('mm/dd/yyyy');
    propertySheet.getRange(10, 1).setValue('Lease End Date:');
    propertySheet.getRange(10, 2).setValue(propertyData.leaseEndDate || '');
    propertySheet.getRange(10, 2).setNumberFormat('mm/dd/yyyy');
    propertySheet.getRange(11, 1).setValue('Status:');
    propertySheet.getRange(11, 2).setValue(propertyData.tenantName ? 'Occupied' : 'Vacant');
    
    // ============================================
    // SECTION 2: FINANCIAL OVERVIEW (Rows 14-25)
    // ============================================
    propertySheet.getRange(14, 1).setValue('FINANCIAL OVERVIEW');
    propertySheet.getRange(14, 1, 1, 4).merge();
    formatSectionHeader(propertySheet, 14, 1, 4, '#059669');
    
    // Ownership Status
    propertySheet.getRange(15, 1).setValue('Ownership Status:');
    propertySheet.getRange(15, 2).setValue('Fully Owned'); // Default, can be changed to "Mortgage"
    propertySheet.getRange(16, 1).setValue('Monthly Mortgage Payment:');
    propertySheet.getRange(16, 2).setValue(0); // Set to 0 if fully owned
    propertySheet.getRange(16, 2).setNumberFormat('$#,##0.00');
    propertySheet.getRange(17, 1).setValue('Mortgage Due Date:');
    propertySheet.getRange(17, 2).setValue(''); // e.g., "1st of month"
    
    // Property Taxes
    propertySheet.getRange(18, 1).setValue('Annual Property Taxes:');
    propertySheet.getRange(18, 2).setValue(0);
    propertySheet.getRange(18, 2).setNumberFormat('$#,##0.00');
    propertySheet.getRange(19, 1).setValue('Monthly Property Tax (Estimated):');
    propertySheet.getRange(19, 2).setFormula('=B18/12');
    propertySheet.getRange(19, 2).setNumberFormat('$#,##0.00');
    propertySheet.getRange(20, 1).setValue('Property Tax Due Date:');
    propertySheet.getRange(20, 2).setValue(''); // e.g., "Annually on Dec 1"
    
    // Insurance
    propertySheet.getRange(21, 1).setValue('Annual Insurance:');
    propertySheet.getRange(21, 2).setValue(0);
    propertySheet.getRange(21, 2).setNumberFormat('$#,##0.00');
    propertySheet.getRange(22, 1).setValue('Monthly Insurance (Estimated):');
    propertySheet.getRange(22, 2).setFormula('=B21/12');
    propertySheet.getRange(22, 2).setNumberFormat('$#,##0.00');
    
    // Total Monthly Expenses (Mortgage + Taxes + Insurance)
    propertySheet.getRange(23, 1).setValue('Total Monthly Expenses:');
    propertySheet.getRange(23, 2).setFormula('=B16+B19+B22');
    propertySheet.getRange(23, 2).setNumberFormat('$#,##0.00');
    propertySheet.getRange(23, 2).setFontWeight('bold');
    
    // Monthly Cash Flow
    propertySheet.getRange(24, 1).setValue('Monthly Cash Flow (Rent - Expenses):');
    propertySheet.getRange(24, 2).setFormula('=B5-B23');
    propertySheet.getRange(24, 2).setNumberFormat('$#,##0.00');
    propertySheet.getRange(24, 2).setFontWeight('bold');
    propertySheet.getRange(24, 2).setFontSize(12);
    
    // ============================================
    // SECTION 3: PAYMENT HISTORY / TRANSACTION HISTORY (Row 27+)
    // ============================================
    propertySheet.getRange(27, 1).setValue('PAYMENT HISTORY / TRANSACTION HISTORY');
    propertySheet.getRange(27, 1, 1, 10).merge();
    formatSectionHeader(propertySheet, 27, 1, 10, '#1e40af');
    
    const paymentHeaders = [
      'Date Due',
      'Date Paid',
      'Rent Amount',
      'Late Fee',
      'Total Amount',
      'Payment Method',
      'Payment Status',
      'Stripe Payment ID',
      'Days Late',
      'Notes'
    ];
    
    propertySheet.getRange(28, 1, 1, paymentHeaders.length).setValues([paymentHeaders]);
    propertySheet.getRange(28, 1, 1, paymentHeaders.length).setFontWeight('bold');
    propertySheet.getRange(28, 1, 1, paymentHeaders.length).setBackground('#3b82f6');
    propertySheet.getRange(28, 1, 1, paymentHeaders.length).setFontColor('#ffffff');
    
    // Format date columns (batch format to avoid too many operations)
    propertySheet.getRange(29, 1, 100, 2).setNumberFormat('mm/dd/yyyy'); // Date Due and Date Paid
    propertySheet.getRange(29, 3, 100, 3).setNumberFormat('$#,##0.00'); // Amount columns
    
    // Flush after formatting
    SpreadsheetApp.flush();
    
    // Auto-calculate Days Late (Column I)
    // Formula: =IF(B29<>"", IF(B29>A29, B29-A29, 0), IF(TODAY()>A29, TODAY()-A29, 0))
    // Use setFormula instead of copyTo to avoid permission issues
    const daysLateFormula = '=IF(B29<>"", IF(B29>A29, B29-A29, 0), IF(TODAY()>A29, TODAY()-A29, 0))';
    propertySheet.getRange(29, 9, 100, 1).setFormula(daysLateFormula);
    
    // Flush after heavy operations
    SpreadsheetApp.flush();
    
    // ============================================
    // SECTION 4: LATE NOTICES LOG (Row 150+)
    // ============================================
    propertySheet.getRange(150, 1).setValue('LATE NOTICES LOG');
    propertySheet.getRange(150, 1, 1, 7).merge();
    formatSectionHeader(propertySheet, 150, 1, 7, '#dc2626');
    
    const noticeHeaders = [
      'Notice Date',
      'Payment Due Date',
      'Notice Type',
      'Sent To',
      'Method',
      'Status',
      'Notes'
    ];
    
    propertySheet.getRange(151, 1, 1, noticeHeaders.length).setValues([noticeHeaders]);
    propertySheet.getRange(151, 1, 1, noticeHeaders.length).setFontWeight('bold');
    propertySheet.getRange(151, 1, 1, noticeHeaders.length).setBackground('#ef4444');
    propertySheet.getRange(151, 1, 1, noticeHeaders.length).setFontColor('#ffffff');
    
    propertySheet.getRange(152, 1, 100, 2).setNumberFormat('mm/dd/yyyy'); // Date columns
    
    // Flush after late notices section
    SpreadsheetApp.flush();
    
    // ============================================
    // SECTION 5: EXPENSES TRACKING (Row 200+)
    // ============================================
    propertySheet.getRange(200, 1).setValue('EXPENSES TRACKING');
    propertySheet.getRange(200, 1, 1, 6).merge();
    formatSectionHeader(propertySheet, 200, 1, 6, '#f59e0b');
    
    const expenseHeaders = [
      'Date',
      'Category',
      'Amount',
      'Vendor',
      'Description',
      'Receipt/Invoice #'
    ];
    
    propertySheet.getRange(201, 1, 1, expenseHeaders.length).setValues([expenseHeaders]);
    propertySheet.getRange(201, 1, 1, expenseHeaders.length).setFontWeight('bold');
    propertySheet.getRange(201, 1, 1, expenseHeaders.length).setBackground('#fbbf24');
    propertySheet.getRange(201, 1, 1, expenseHeaders.length).setFontColor('#ffffff');
    
    propertySheet.getRange(202, 1, 100, 1).setNumberFormat('mm/dd/yyyy'); // Date
    propertySheet.getRange(202, 3, 100, 1).setNumberFormat('$#,##0.00'); // Amount
    
    // Flush after expenses section
    SpreadsheetApp.flush();
    
    // ============================================
    // SECTION 6: PROFIT ANALYSIS (Row 260+)
    // ============================================
    propertySheet.getRange(260, 1).setValue('PROFIT ANALYSIS');
    propertySheet.getRange(260, 1, 1, 3).merge();
    formatSectionHeader(propertySheet, 260, 1, 3, '#7c3aed');
    
    // Total Income
    propertySheet.getRange(261, 1).setValue('Total Rent Collected:');
    propertySheet.getRange(261, 2).setFormula('=SUMIF(G28:G127,"Paid",C28:C127)');
    propertySheet.getRange(261, 2).setNumberFormat('$#,##0.00');
    
    propertySheet.getRange(262, 1).setValue('Total Late Fees Collected:');
    propertySheet.getRange(262, 2).setFormula('=SUMIF(G28:G127,"Paid",D28:D127)');
    propertySheet.getRange(262, 2).setNumberFormat('$#,##0.00');
    
    propertySheet.getRange(263, 1).setValue('Total Income:');
    propertySheet.getRange(263, 2).setFormula('=B261+B262');
    propertySheet.getRange(263, 2).setNumberFormat('$#,##0.00');
    propertySheet.getRange(263, 2).setFontWeight('bold');
    
    // Total Expenses
    propertySheet.getRange(264, 1).setValue('Total Property Expenses:');
    propertySheet.getRange(264, 2).setFormula('=SUM(C202:C301)');
    propertySheet.getRange(264, 2).setNumberFormat('$#,##0.00');
    
    propertySheet.getRange(265, 1).setValue('Total Mortgage Payments:');
    propertySheet.getRange(265, 2).setFormula('=COUNTIF(G28:G127,"Paid")*B16');
    propertySheet.getRange(265, 2).setNumberFormat('$#,##0.00');
    
    propertySheet.getRange(266, 1).setValue('Total Property Taxes Paid:');
    propertySheet.getRange(266, 2).setFormula('=ROUNDUP(COUNTIF(G28:G127,"Paid")/12,0)*B19');
    propertySheet.getRange(266, 2).setNumberFormat('$#,##0.00');
    
    propertySheet.getRange(267, 1).setValue('Total Insurance Paid:');
    propertySheet.getRange(267, 2).setFormula('=ROUNDUP(COUNTIF(G28:G127,"Paid")/12,0)*B22');
    propertySheet.getRange(267, 2).setNumberFormat('$#,##0.00');
    
    propertySheet.getRange(268, 1).setValue('Total Expenses:');
    propertySheet.getRange(268, 2).setFormula('=B264+B265+B266+B267');
    propertySheet.getRange(268, 2).setNumberFormat('$#,##0.00');
    propertySheet.getRange(268, 2).setFontWeight('bold');
    
    // Net Profit
    propertySheet.getRange(269, 1).setValue('NET PROFIT:');
    propertySheet.getRange(269, 2).setFormula('=B263-B268');
    propertySheet.getRange(269, 2).setNumberFormat('$#,##0.00');
    propertySheet.getRange(269, 2).setFontWeight('bold');
    propertySheet.getRange(269, 2).setFontSize(14);
    
    // Profit Margin
    propertySheet.getRange(270, 1).setValue('Profit Margin %:');
    propertySheet.getRange(270, 2).setFormula('=IF(B263>0, (B269/B263)*100, 0)');
    propertySheet.getRange(270, 2).setNumberFormat('0.00"%');
    
    // On-Time Payment Rate
    propertySheet.getRange(271, 1).setValue('On-Time Payment Rate:');
    propertySheet.getRange(271, 2).setFormula('=IF(COUNTIF(G28:G127,"Paid")>0, (COUNTIFS(G28:G127,"Paid",I28:I127,0)/COUNTIF(G28:G127,"Paid"))*100, 0)');
    propertySheet.getRange(271, 2).setNumberFormat('0.00"%');
    
    // Average Days Late
    propertySheet.getRange(272, 1).setValue('Average Days Late:');
    propertySheet.getRange(272, 2).setFormula('=IF(COUNTIF(G28:G127,"Paid")>0, AVERAGEIF(G28:G127,"Paid",I28:I127), 0)');
    propertySheet.getRange(272, 2).setNumberFormat('0.00');
    
    // Flush after profit analysis section
    SpreadsheetApp.flush();
    
    // ============================================
    // FORMATTING & FREEZES
    // ============================================
    // Flush before freeze operations
    SpreadsheetApp.flush();
    
    // Freeze header rows (wrap in try-catch - non-critical if it fails)
    try {
      propertySheet.setFrozenRows(1);
      propertySheet.setFrozenColumns(1);
    } catch (freezeError) {
      Logger.log('Warning: Could not freeze rows (non-critical): ' + freezeError.toString());
    }
    
    // Set column widths (batch set to reduce operations)
    try {
      const columnWidths = [120, 150, 120, 100, 120, 120, 120, 200, 100, 200];
      for (let i = 0; i < columnWidths.length; i++) {
        propertySheet.setColumnWidth(i + 1, columnWidths[i]);
      }
    } catch (widthError) {
      Logger.log('Warning: Could not set column widths (non-critical): ' + widthError.toString());
    }
    
    // Final flush to save everything
    SpreadsheetApp.flush();
    
    Logger.log('Comprehensive property sheet created successfully: ' + propertyName);
    return propertySheet;
  } catch (error) {
    // If we created a sheet but formatting failed, delete it
    if (propertySheet) {
      try {
        const sheetName = propertySheet.getName();
        spreadsheet.deleteSheet(propertySheet);
        Logger.log('Deleted incomplete sheet: ' + sheetName);
      } catch (deleteError) {
        Logger.log('Could not delete incomplete sheet: ' + deleteError.toString());
      }
    }
    Logger.log('Error creating property sheet: ' + error.toString());
    throw error; // Re-throw so caller knows it failed
  }
}

/**
 * Helper function to format section headers
 */
function formatSectionHeader(sheet, row, col, numCols, color) {
  sheet.getRange(row, col, 1, numCols).setFontWeight('bold');
  sheet.getRange(row, col, 1, numCols).setFontSize(14);
  sheet.getRange(row, col, 1, numCols).setBackground(color);
  sheet.getRange(row, col, 1, numCols).setFontColor('#ffffff');
}

/**
 * WORKING FUNCTION - Creates Test Property sheet with ALL sections in COLUMNS (landscape layout)
 * Everything visible on one screen - no scrolling needed!
 */
function createTestPropertySheet() {
  const SPREADSHEET_ID = '1sC_q33TB088JdHc23zhLAU_bM59Q9nE7eZf9ugL4YoY';
  
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // Delete existing
    const existing = spreadsheet.getSheetByName('Test Property');
    if (existing) spreadsheet.deleteSheet(existing);
    
    const sheet = spreadsheet.insertSheet('Test Property');
    
    // Set landscape orientation by making columns wider and using column layout
    // Freeze first row only (can't freeze columns if we're merging across them)
    try {
      sheet.setFrozenRows(1);
    } catch (freezeError) {
      Logger.log('Warning: Could not freeze rows (non-critical): ' + freezeError.toString());
    }
    
    // COLUMN LAYOUT - Everything side by side, visible on one screen
    
    // COLUMN A-B: PROPERTY INFO (Rows 2-15)
    sheet.getRange(2, 1).setValue('PROPERTY INFORMATION');
    sheet.getRange(2, 1, 1, 2).merge();
    sheet.getRange(2, 1, 1, 2).setBackground('#1e40af').setFontColor('#ffffff').setFontWeight('bold').setFontSize(12);
    
    sheet.getRange(3, 1).setValue('Property Name:'); sheet.getRange(3, 2).setValue('Test Property');
    sheet.getRange(4, 1).setValue('Address:'); sheet.getRange(4, 2).setValue('123 Test St');
    sheet.getRange(5, 1).setValue('Monthly Rent:'); sheet.getRange(5, 2).setValue(1500).setNumberFormat('$#,##0.00');
    sheet.getRange(6, 1).setValue('Tenant Name:'); sheet.getRange(6, 2).setValue('Test Tenant');
    sheet.getRange(7, 1).setValue('Tenant Email:'); sheet.getRange(7, 2).setValue('test@example.com');
    sheet.getRange(8, 1).setValue('Tenant Phone:'); sheet.getRange(8, 2).setValue('(555) 123-4567');
    sheet.getRange(9, 1).setValue('Status:'); sheet.getRange(9, 2).setValue('Occupied');
    
    SpreadsheetApp.flush();
    
    // COLUMN D-E: FINANCIAL OVERVIEW (Rows 2-15)
    sheet.getRange(2, 4).setValue('FINANCIAL OVERVIEW');
    sheet.getRange(2, 4, 1, 2).merge();
    sheet.getRange(2, 4, 1, 2).setBackground('#059669').setFontColor('#ffffff').setFontWeight('bold').setFontSize(12);
    
    sheet.getRange(3, 4).setValue('Ownership:'); sheet.getRange(3, 5).setValue('Fully Owned');
    sheet.getRange(4, 4).setValue('Monthly Mortgage:'); sheet.getRange(4, 5).setValue(0).setNumberFormat('$#,##0.00');
    sheet.getRange(5, 4).setValue('Annual Taxes:'); sheet.getRange(5, 5).setValue(0).setNumberFormat('$#,##0.00');
    sheet.getRange(6, 4).setValue('Monthly Tax:'); sheet.getRange(6, 5).setFormula('=E5/12').setNumberFormat('$#,##0.00');
    sheet.getRange(7, 4).setValue('Annual Insurance:'); sheet.getRange(7, 5).setValue(0).setNumberFormat('$#,##0.00');
    sheet.getRange(8, 4).setValue('Monthly Insurance:'); sheet.getRange(8, 5).setFormula('=E7/12').setNumberFormat('$#,##0.00');
    sheet.getRange(9, 4).setValue('Total Expenses:'); sheet.getRange(9, 5).setFormula('=E4+E6+E8').setNumberFormat('$#,##0.00').setFontWeight('bold');
    sheet.getRange(10, 4).setValue('Cash Flow:'); sheet.getRange(10, 5).setFormula('=B5-E9').setNumberFormat('$#,##0.00').setFontWeight('bold');
    
    SpreadsheetApp.flush();
    
    // COLUMN G-P: PAYMENT HISTORY (Rows 2-100) - Main transaction log
    sheet.getRange(2, 7).setValue('PAYMENT HISTORY');
    sheet.getRange(2, 7, 1, 10).merge();
    sheet.getRange(2, 7, 1, 10).setBackground('#1e40af').setFontColor('#ffffff').setFontWeight('bold').setFontSize(12);
    
    const headers = ['Date Due', 'Date Paid', 'Rent', 'Late Fee', 'Total', 'Method', 'Status', 'Stripe ID', 'Days Late', 'Notes'];
    sheet.getRange(3, 7, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#3b82f6').setFontColor('#ffffff');
    sheet.getRange(4, 7, 100, 2).setNumberFormat('mm/dd/yyyy'); // Date columns
    sheet.getRange(4, 9, 100, 3).setNumberFormat('$#,##0.00'); // Amount columns
    sheet.getRange(4, 15, 100, 1).setFormula('=IF(H4<>"", IF(H4>G4, H4-G4, 0), IF(TODAY()>G4, TODAY()-G4, 0))'); // Days Late
    
    SpreadsheetApp.flush();
    
    // COLUMN R-X: LATE NOTICES (Rows 2-50)
    sheet.getRange(2, 18).setValue('LATE NOTICES');
    sheet.getRange(2, 18, 1, 7).merge();
    sheet.getRange(2, 18, 1, 7).setBackground('#dc2626').setFontColor('#ffffff').setFontWeight('bold').setFontSize(12);
    
    const noticeHeaders = ['Notice Date', 'Due Date', 'Type', 'Sent To', 'Method', 'Status', 'Notes'];
    sheet.getRange(3, 18, 1, noticeHeaders.length).setValues([noticeHeaders]).setFontWeight('bold').setBackground('#ef4444').setFontColor('#ffffff');
    sheet.getRange(4, 18, 50, 2).setNumberFormat('mm/dd/yyyy');
    
    SpreadsheetApp.flush();
    
    // COLUMN Z-AF: EXPENSES (Rows 2-50)
    sheet.getRange(2, 26).setValue('EXPENSES');
    sheet.getRange(2, 26, 1, 6).merge();
    sheet.getRange(2, 26, 1, 6).setBackground('#f59e0b').setFontColor('#ffffff').setFontWeight('bold').setFontSize(12);
    
    const expenseHeaders = ['Date', 'Category', 'Amount', 'Vendor', 'Description', 'Receipt #'];
    sheet.getRange(3, 26, 1, expenseHeaders.length).setValues([expenseHeaders]).setFontWeight('bold').setBackground('#fbbf24').setFontColor('#ffffff');
    sheet.getRange(4, 26, 50, 1).setNumberFormat('mm/dd/yyyy');
    sheet.getRange(4, 28, 50, 1).setNumberFormat('$#,##0.00');
    
    SpreadsheetApp.flush();
    
    // Profit analysis will be handled in HTML - removed from spreadsheet
    
    // Set column widths for landscape view (wrap in try-catch - non-critical)
    try {
      const widths = [
        [1, 100], [2, 120], [3, 20], [4, 100], [5, 100], [6, 20],
        [7, 80], [8, 80], [9, 80], [10, 70], [11, 80], [12, 80], [13, 70], [14, 150], [15, 70], [16, 150], [17, 20],
        [18, 80], [19, 80], [20, 70], [21, 100], [22, 70], [23, 70], [24, 120], [25, 20],
        [26, 80], [27, 80], [28, 80], [29, 100], [30, 120], [31, 100], [32, 20]
      ];
      
      for (let i = 0; i < widths.length; i++) {
        sheet.setColumnWidth(widths[i][0], widths[i][1]);
        // Flush every 5 columns to avoid rate limits
        if (i % 5 === 0) {
          SpreadsheetApp.flush();
        }
      }
      
      SpreadsheetApp.flush();
    } catch (widthError) {
      Logger.log('Warning: Could not set all column widths (non-critical): ' + widthError.toString());
      // Continue anyway - column widths are nice but not critical
    }
    
    Logger.log('SUCCESS: Test Property sheet created with column layout - everything visible!');
    return 'SUCCESS: Test Property sheet created with column layout - all sections visible (profit analysis handled in HTML)!';
    
  } catch (error) {
    Logger.log('ERROR: ' + error.toString());
    Logger.log('Stack: ' + error.stack);
    return 'ERROR: ' + error.toString();
  }
}


/**
 * Automated Testing Suite for Pool Project Management System
 * 
 * Run these functions to test each component of the system
 * Check the logs (View > Logs) for results
 */

// ============================================================================
// TEST 1: Sheet Initialization
// ============================================================================

/**
 * Test: Initialize all project management sheets
 * Expected: 4 new sheets created with proper headers
 */
function test1_InitializeSheets() {
  Logger.log('🧪 TEST 1: Initialize Sheets');
  Logger.log('─────────────────────────────');
  
  try {
    const result = initializeProjectManagementSheets();
    
    if (result.success) {
      Logger.log('✅ PASS: Sheets initialized successfully');
      
      // Verify sheets exist
      const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
      const expectedSheets = [PM_PROJECTS_SHEET, PM_EXPENSES_SHEET, PM_PROJECT_INVOICES_SHEET, PM_APPROVAL_TOKENS_SHEET];
      
      expectedSheets.forEach(sheetName => {
        const sheet = spreadsheet.getSheetByName(sheetName);
        if (sheet) {
          Logger.log(`  ✓ ${sheetName} exists`);
        } else {
          Logger.log(`  ✗ ${sheetName} NOT FOUND`);
        }
      });
      
      return true;
    } else {
      Logger.log('❌ FAIL: ' + result.error);
      return false;
    }
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.toString());
    return false;
  }
}

// ============================================================================
// TEST 2: Customer Approval Workflow
// ============================================================================

/**
 * Test: Generate approval link and validate token
 * Expected: Valid approval URL with working token
 */
function test2_ApprovalWorkflow() {
  Logger.log('\n🧪 TEST 2: Customer Approval Workflow');
  Logger.log('─────────────────────────────────────');
  
  try {
    // Create a test estimate first
    const testEstimate = {
      type: 'Estimate',
      customerName: 'Test Customer',
      customerEmail: 'test@example.com',
      customerPhone: '555-0100',
      items: JSON.stringify([{name: 'Pool Installation', price: 50000, quantity: 1}]),
      subtotal: 50000,
      total: 50000,
      paymentSchedule: JSON.stringify([
        {id: 1, name: 'Deposit', amount: 10000, percent: 20},
        {id: 2, name: 'Final Payment', amount: 40000, percent: 80}
      ])
    };
    
    const saveResult = saveInvoiceEstimate(testEstimate);
    if (!saveResult.success) {
      Logger.log('❌ FAIL: Could not create test estimate');
      return false;
    }
    
    const estimateId = saveResult.id;
    Logger.log('  ✓ Test estimate created: ' + estimateId);
    
    // Generate approval link
    const approvalResult = generateCustomerApprovalLink(estimateId);
    
    if (approvalResult.success) {
      Logger.log('✅ PASS: Approval link generated');
      Logger.log('  URL: ' + approvalResult.approvalUrl);
      Logger.log('  Token: ' + approvalResult.token.substring(0, 20) + '...');
      Logger.log('  Expires: ' + approvalResult.expiresDate);
      
      // Validate the token
      const validationResult = validateApprovalToken(estimateId, approvalResult.token);
      if (validationResult.success) {
        Logger.log('  ✓ Token validation successful');
        return true;
      } else {
        Logger.log('  ✗ Token validation failed: ' + validationResult.error);
        return false;
      }
    } else {
      Logger.log('❌ FAIL: ' + approvalResult.error);
      return false;
    }
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.toString());
    return false;
  }
}

// ============================================================================
// TEST 3: Project Creation
// ============================================================================

/**
 * Test: Create project from estimate
 * Expected: Project saved to PM_Projects sheet
 */
function test3_ProjectCreation() {
  Logger.log('\n🧪 TEST 3: Project Creation');
  Logger.log('───────────────────────────');
  
  try {
    // Create test estimate
    const testEstimate = {
      type: 'Estimate',
      customerName: 'Project Test Customer',
      customerEmail: 'projecttest@example.com',
      customerPhone: '555-0200',
      items: JSON.stringify([
        {name: 'Pool Shell', price: 30000, quantity: 1},
        {name: 'Decking', price: 10000, quantity: 1}
      ]),
      subtotal: 40000,
      total: 40000,
      approvalStatus: 'Approved',
      paymentSchedule: JSON.stringify([
        {id: 1, name: 'Deposit', amount: 8000, percent: 20},
        {id: 2, name: 'Midpoint', amount: 16000, percent: 40},
        {id: 3, name: 'Final', amount: 16000, percent: 40}
      ])
    };
    
    const saveResult = saveInvoiceEstimate(testEstimate);
    if (!saveResult.success) {
      Logger.log('❌ FAIL: Could not create test estimate');
      return false;
    }
    
    const estimateId = saveResult.id;
    Logger.log('  ✓ Test estimate created: ' + estimateId);
    
    // Create project
    const projectResult = createProjectFromEstimate(estimateId);
    
    if (projectResult.success) {
      Logger.log('✅ PASS: Project created successfully');
      Logger.log('  Project ID: ' + projectResult.projectId);
      Logger.log('  Customer: ' + projectResult.projectData.customerName);
      Logger.log('  Total: $' + projectResult.projectData.total);
      Logger.log('  Milestones: ' + projectResult.projectData.paymentSchedule.length);
      
      // Verify project exists
      const getResult = getProject(projectResult.projectId);
      if (getResult.success) {
        Logger.log('  ✓ Project retrieved successfully');
        return true;
      } else {
        Logger.log('  ✗ Project retrieval failed');
        return false;
      }
    } else {
      Logger.log('❌ FAIL: ' + projectResult.error);
      return false;
    }
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.toString());
    return false;
  }
}

// ============================================================================
// TEST 4: Milestone Invoice Generation
// ============================================================================

/**
 * Test: Generate invoice with Stripe payment link
 * Expected: Invoice created with valid Stripe link
 * NOTE: This uses live Stripe API - test cards only!
 */
function test4_InvoiceGeneration() {
  Logger.log('\n🧪 TEST 4: Milestone Invoice Generation');
  Logger.log('──────────────────────────────────────');
  
  try {
    // First create a project (reusing test3 logic)
    const testEstimate = {
      type: 'Estimate',
      customerName: 'Invoice Test Customer',
      customerEmail: 'invoicetest@example.com',
      customerPhone: '555-0300',
      items: JSON.stringify([{name: 'Pool', price: 45000, quantity: 1}]),
      subtotal: 45000,
      total: 45000,
      approvalStatus: 'Approved',
      paymentSchedule: JSON.stringify([
        {id: Date.now(), name: 'Test Deposit', amount: 9000, percent: 20}
      ])
    };
    
    const saveResult = saveInvoiceEstimate(testEstimate);
    const projectResult = createProjectFromEstimate(saveResult.id);
    
    if (!projectResult.success) {
      Logger.log('❌ FAIL: Could not create test project');
      return false;
    }
    
    const projectId = projectResult.projectId;
    const milestoneId = projectResult.projectData.paymentSchedule[0].id;
    
    Logger.log('  ✓ Test project created: ' + projectId);
    
    // Generate invoice
    const invoiceResult = generateMilestoneInvoice(projectId, milestoneId);
    
    if (invoiceResult.success) {
      Logger.log('✅ PASS: Invoice generated successfully');
      Logger.log('  Invoice ID: ' + invoiceResult.invoiceId);
      Logger.log('  Payment URL: ' + invoiceResult.paymentUrl);
      Logger.log('  Amount: $' + invoiceResult.milestone.amount);
      
      Logger.log('\n  ⚠️  NOTE: This is a LIVE Stripe link. Use test cards only!');
      Logger.log('  Test Card: 4242 4242 4242 4242');
      
      return true;
    } else {
      Logger.log('❌ FAIL: ' + invoiceResult.error);
      return false;
    }
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.toString());
    return false;
  }
}

// ============================================================================
// TEST 5: Expense Tracking
// ============================================================================

/**
 * Test: Add expense and calculate profit
 * Expected: Expense saved, profit calculated correctly
 */
function test5_ExpenseTracking() {
  Logger.log('\n🧪 TEST 5: Expense Tracking & Profit Calculation');
  Logger.log('────────────────────────────────────────────────');
  
  try {
    // Create test project
    const testEstimate = {
      type: 'Estimate',
      customerName: 'Expense Test Customer',
      customerEmail: 'expensetest@example.com',
      items: JSON.stringify([{name: 'Pool', price: 60000, quantity: 1}]),
      subtotal: 60000,
      total: 60000,
      approvalStatus: 'Approved'
    };
    
    const saveResult = saveInvoiceEstimate(testEstimate);
    const projectResult = createProjectFromEstimate(saveResult.id);
    const projectId = projectResult.projectId;
    
    Logger.log('  ✓ Test project created: ' + projectId);
    
    // Add expenses
    const expenses = [
      {projectId: projectId, category: 'Materials', description: 'Pool liner', amount: 8000, paidFromAccount: 'Checking', date: new Date()},
      {projectId: projectId, category: 'Labor', description: 'Installation crew', amount: 12000, paidFromAccount: 'Checking', date: new Date()},
      {projectId: projectId, category: 'Equipment', description: 'Excavator rental', amount: 3000, paidFromAccount: 'Credit Card', date: new Date()}
    ];
    
    let expenseCount = 0;
    expenses.forEach(expense => {
      const result = addExpense(expense);
      if (result.success) {
        expenseCount++;
        Logger.log(`  ✓ Expense added: ${expense.description} - $${expense.amount}`);
      }
    });
    
    // Calculate profit
    const profitResult = calculateProjectProfit(projectId);
    
    if (profitResult.success) {
      Logger.log('✅ PASS: Profit calculated successfully');
      Logger.log('  Total Revenue: $' + profitResult.totalRevenue.toFixed(2));
      Logger.log('  Total Expenses: $' + profitResult.totalExpenses.toFixed(2));
      Logger.log('  Profit: $' + profitResult.profit.toFixed(2));
      Logger.log('  Profit Margin: ' + profitResult.profitMargin.toFixed(1) + '%');
      
      // Verify calculations
      const expectedProfit = 60000 - 23000; // Revenue - Expenses
      const expectedMargin = (expectedProfit / 60000) * 100;
      
      if (Math.abs(profitResult.profit - expectedProfit) < 0.01 && 
          Math.abs(profitResult.profitMargin - expectedMargin) < 0.01) {
        Logger.log('  ✓ Calculations correct');
        return true;
      } else {
        Logger.log('  ✗ Calculation mismatch');
        return false;
      }
    } else {
      Logger.log('❌ FAIL: ' + profitResult.error);
      return false;
    }
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.toString());
    return false;
  }
}

// ============================================================================
// TEST 6: Change Orders
// ============================================================================

/**
 * Test: Create change order
 * Expected: Change order added to project, invoice generated
 */
function test6_ChangeOrders() {
  Logger.log('\n🧪 TEST 6: Change Orders');
  Logger.log('────────────────────────');
  
  try {
    // Create test project
    const testEstimate = {
      type: 'Estimate',
      customerName: 'Change Order Test',
      customerEmail: 'changeorder@example.com',
      items: JSON.stringify([{name: 'Pool', price: 50000, quantity: 1}]),
      subtotal: 50000,
      total: 50000,
      approvalStatus: 'Approved'
    };
    
    const saveResult = saveInvoiceEstimate(testEstimate);
    const projectResult = createProjectFromEstimate(saveResult.id);
    const projectId = projectResult.projectId;
    
    Logger.log('  ✓ Test project created: ' + projectId);
    Logger.log('  Original total: $50,000');
    
    // Create change order
    const changeOrderData = {
      description: 'Add waterfall feature',
      amount: 5000,
      notes: 'Customer requested upgrade',
      autoInvoice: false // Don't auto-invoice for test
    };
    
    const coResult = createChangeOrder(projectId, changeOrderData);
    
    if (coResult.success) {
      Logger.log('✅ PASS: Change order created');
      Logger.log('  CO ID: ' + coResult.changeOrderId);
      Logger.log('  Description: ' + coResult.changeOrder.description);
      Logger.log('  Amount: $' + coResult.changeOrder.amount);
      
      // Verify project total updated
      const updatedProject = getProject(projectId);
      if (updatedProject.success) {
        const newTotal = updatedProject.project.total;
        Logger.log('  New project total: $' + newTotal);
        
        if (newTotal === 55000) {
          Logger.log('  ✓ Project total updated correctly');
          return true;
        } else {
          Logger.log('  ✗ Project total incorrect (expected $55,000)');
          return false;
        }
      }
    } else {
      Logger.log('❌ FAIL: ' + coResult.error);
      return false;
    }
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.toString());
    return false;
  }
}

// ============================================================================
// TEST 7: AI Communication (Optional - requires API key)
// ============================================================================

/**
 * Test: Generate AI-enhanced daily update
 * Expected: Enhanced text returned (or original if AI unavailable)
 */
function test7_AICommunication() {
  Logger.log('\n🧪 TEST 7: AI Communication');
  Logger.log('──────────────────────────');
  
  try {
    // Create test project
    const testEstimate = {
      type: 'Estimate',
      customerName: 'AI Test Customer',
      customerEmail: 'aitest@example.com',
      items: JSON.stringify([{name: 'Pool', price: 50000, quantity: 1}]),
      subtotal: 50000,
      total: 50000,
      approvalStatus: 'Approved'
    };
    
    const saveResult = saveInvoiceEstimate(testEstimate);
    const projectResult = createProjectFromEstimate(saveResult.id);
    const projectId = projectResult.projectId;
    
    Logger.log('  ✓ Test project created: ' + projectId);
    
    // Generate AI summary
    const rawNotes = "Excavated pool area. Installed rebar grid. Poured concrete footers.";
    Logger.log('  Raw notes: ' + rawNotes);
    
    const aiResult = generateDailySummaryWithAI(projectId, rawNotes, []);
    
    if (aiResult.success) {
      if (aiResult.aiUsed) {
        Logger.log('✅ PASS: AI enhancement successful');
        Logger.log('  Enhanced text:');
        Logger.log('  ' + aiResult.enhancedSummary.substring(0, 200) + '...');
      } else {
        Logger.log('⚠️  PASS (fallback): AI not available, using original text');
        Logger.log('  Reason: ' + (aiResult.error || 'No API key configured'));
      }
      return true;
    } else {
      Logger.log('❌ FAIL: ' + aiResult.error);
      return false;
    }
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.toString());
    return false;
  }
}

// ============================================================================
// RUN ALL TESTS
// ============================================================================

/**
 * Run complete test suite
 * Executes all tests and provides summary
 */
function runAllTests() {
  Logger.log('╔═══════════════════════════════════════════════════════╗');
  Logger.log('║   POOL PROJECT MANAGEMENT SYSTEM - TEST SUITE         ║');
  Logger.log('╚═══════════════════════════════════════════════════════╝\n');
  
  const tests = [
    {name: 'Sheet Initialization', fn: test1_InitializeSheets},
    {name: 'Customer Approval Workflow', fn: test2_ApprovalWorkflow},
    {name: 'Project Creation', fn: test3_ProjectCreation},
    {name: 'Milestone Invoice Generation', fn: test4_InvoiceGeneration},
    {name: 'Expense Tracking', fn: test5_ExpenseTracking},
    {name: 'Change Orders', fn: test6_ChangeOrders},
    {name: 'AI Communication', fn: test7_AICommunication}
  ];
  
  let passed = 0;
  let failed = 0;
  
  tests.forEach((test, index) => {
    try {
      const result = test.fn();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      Logger.log('❌ Test crashed: ' + error.toString());
      failed++;
    }
    
    // Add separator between tests
    if (index < tests.length - 1) {
      Logger.log('\n');
    }
  });
  
  Logger.log('\n╔═══════════════════════════════════════════════════════╗');
  Logger.log('║                   TEST SUMMARY                         ║');
  Logger.log('╠═══════════════════════════════════════════════════════╣');
  Logger.log(`║   Total Tests: ${tests.length}                                        ║`);
  Logger.log(`║   Passed: ${passed}                                            ║`);
  Logger.log(`║   Failed: ${failed}                                            ║`);
  Logger.log('╚═══════════════════════════════════════════════════════╝');
  
  if (failed === 0) {
    Logger.log('\n🎉 ALL TESTS PASSED! System is ready for production.');
  } else {
    Logger.log('\n⚠️  Some tests failed. Review logs and fix issues.');
  }
}

// ============================================================================
// QUICK MANUAL TESTS (For UI Testing)
// ============================================================================

/**
 * Create a sample project for UI testing
 * Run this, then test the UI tabs
 */
function createSampleProjectForUITesting() {
  Logger.log('Creating sample project for UI testing...');
  
  const testEstimate = {
    type: 'Estimate',
    customerName: 'John & Jane Smith',
    customerEmail: 'smiths@example.com',
    customerPhone: '(502) 555-1234',
    customerAddress: '123 Main Street, Louisville, KY 40202',
    items: JSON.stringify([
      {name: 'In-ground Pool Installation (20x40)', price: 35000, quantity: 1, description: 'Custom gunite pool with tile finish'},
      {name: 'Pool Decking', price: 8000, quantity: 1, description: 'Stamped concrete decking'},
      {name: 'Pool Equipment Package', price: 5000, quantity: 1, description: 'Pump, filter, heater'},
      {name: 'Landscaping', price: 3000, quantity: 1, description: 'Plants and lighting'}
    ]),
    subtotal: 51000,
    taxRate: 6,
    tax: 3060,
    total: 54060,
    notes: 'Premium pool installation package',
    terms: 'Payment due per milestone schedule',
    approvalStatus: 'Approved',
    paymentSchedule: JSON.stringify([
      {id: 1, name: 'Initial Deposit', amount: 10812, percent: 20, duePhase: 'Signing'},
      {id: 2, name: 'Excavation Complete', amount: 16218, percent: 30, duePhase: 'Excavation'},
      {id: 3, name: 'Shell & Plumbing', amount: 16218, percent: 30, duePhase: 'Shell'},
      {id: 4, name: 'Final Payment', amount: 10812, percent: 20, duePhase: 'Complete'}
    ])
  };
  
  const saveResult = saveInvoiceEstimate(testEstimate);
  const projectResult = createProjectFromEstimate(saveResult.id);
  
  if (projectResult.success) {
    Logger.log('✅ Sample project created successfully!');
    Logger.log('Project ID: ' + projectResult.projectId);
    Logger.log('Estimate ID: ' + saveResult.id);
    Logger.log('\nNow you can:');
    Logger.log('1. Open InvoiceEstimateUI.html');
    Logger.log('2. Go to Projects tab');
    Logger.log('3. Click "Refresh Projects"');
    Logger.log('4. Test all project management features!');
    
    return {
      projectId: projectResult.projectId,
      estimateId: saveResult.id
    };
  } else {
    Logger.log('❌ Failed to create sample project: ' + projectResult.error);
    return null;
  }
}


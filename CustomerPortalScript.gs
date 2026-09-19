/**
 * CUSTOMER PORTAL - COMPREHENSIVE DASHBOARD
 * 
 * Displays all customer data in real-time:
 * - Upcoming appointments
 * - Service reports with photos
 * - Invoices (pending & paid)
 * - Projects with progress
 * - Payment history
 * 
 * SETUP:
 * 1. Deploy as Web App (Execute as: Me, Who has access: Anyone)
 * 2. Add to customer email links
 * 3. Embed in website
 */

const CP_SPREADSHEET_ID = '1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0';

// ================================================================
// WEB APP ENTRY POINT
// ================================================================

function doGet(e) {
  const customerEmail = (e.parameter.email || '').toLowerCase().trim();
  const token = (e.parameter.token || '').trim();
  
  if (!customerEmail || !token) {
    return HtmlService.createHtmlOutput('<h1>❌ Invalid Access</h1><p>Please use a valid customer portal link.</p>');
  }
  
  // Verify token
  const verified = verifyCustomerPortalToken(customerEmail, token);
  if (!verified.success) {
    return HtmlService.createHtmlOutput('<h1>❌ Access Denied</h1><p>This link has expired or is invalid.</p>');
  }
  
  // Get customer data
  const customerData = getCustomerFullProfile(customerEmail);
  if (!customerData.success) {
    return HtmlService.createHtmlOutput('<h1>❌ Customer Not Found</h1>');
  }
  
  // Return portal UI
  return HtmlService.createHtmlOutput(buildCustomerPortalHTML(customerData.data))
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ================================================================
// CUSTOMER DATA RETRIEVAL
// ================================================================

/**
 * Get complete customer profile with all data
 */
function getCustomerFullProfile(customerEmail) {
  try {
    const ss = SpreadsheetApp.openById(CP_SPREADSHEET_ID);
    
    // Get customer info
    const customersSheet = ss.getSheetByName('Customers');
    if (!customersSheet) return { success: false, error: 'Sheet not found' };
    
    const values = customersSheet.getDataRange().getValues();
    let customerData = null;
    let customerId = '';
    
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][2] || '').toLowerCase().trim() === customerEmail) {
        customerData = {
          id: values[i][0],
          name: values[i][1],
          email: values[i][2],
          phone: values[i][3],
          address: values[i][4],
          city: values[i][5],
          state: values[i][6],
          zip: values[i][7]
        };
        customerId = values[i][0];
        break;
      }
    }
    
    if (!customerData) return { success: false, error: 'Customer not found' };
    
    // Get appointments
    const appointments = getCustomerAppointments(customerId);
    
    // Get service reports
    const serviceReports = getCustomerServiceReports(customerId);
    
    // Get invoices
    const invoices = getCustomerInvoices(customerId);
    
    // Get projects
    const projects = getCustomerProjects(customerId);
    
    // Get payment history
    const payments = getCustomerPaymentHistory(customerId);
    
    return {
      success: true,
      data: {
        customer: customerData,
        customerId: customerId,
        appointments: appointments,
        serviceReports: serviceReports,
        invoices: invoices,
        projects: projects,
        payments: payments,
        stats: {
          upcomingAppointments: appointments.filter(a => a.status === 'Scheduled').length,
          pendingInvoices: invoices.filter(i => i.status === 'Pending' || i.status === 'Sent').length,
          totalOwed: invoices
            .filter(i => i.status === 'Pending' || i.status === 'Sent')
            .reduce((sum, i) => sum + parseFloat(i.amount || 0), 0),
          totalSpent: payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0),
          serviceReportCount: serviceReports.length,
          activeProjects: projects.filter(p => p.status === 'In Progress').length
        }
      }
    };
  } catch (error) {
    Logger.log('❌ getCustomerFullProfile error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Get customer's upcoming appointments
 */
function getCustomerAppointments(customerId) {
  try {
    const ss = SpreadsheetApp.openById(CP_SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Appointments');
    if (!sheet) return [];
    
    const values = sheet.getDataRange().getValues();
    const appointments = [];
    const now = new Date();
    
    for (let i = 1; i < values.length; i++) {
      // Column structure: [ID, Customer ID, Customer Name, Email, Service Type, Date, Time, Status, Notes, etc]
      if (String(values[i][1]).trim() === String(customerId).trim() || 
          String(values[i][3]).trim() === String(values[i][3]).trim()) {
        
        const appointmentDate = new Date(values[i][5]);
        
        appointments.push({
          id: values[i][0],
          customerId: values[i][1],
          customerName: values[i][2],
          serviceType: values[i][4],
          date: values[i][5],
          time: values[i][6],
          status: values[i][7],
          notes: values[i][8],
          isUpcoming: appointmentDate >= now,
          dateFormatted: formatDateForDisplay(appointmentDate),
          dayOfWeek: getDayOfWeek(appointmentDate)
        });
      }
    }
    
    // Sort by date (upcoming first)
    appointments.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    return appointments;
  } catch (error) {
    Logger.log('❌ getCustomerAppointments error: ' + error.toString());
    return [];
  }
}

/**
 * Get customer's service reports
 */
function getCustomerServiceReports(customerId) {
  try {
    const ss = SpreadsheetApp.openById(CP_SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Service Reports');
    if (!sheet) return [];
    
    const values = sheet.getDataRange().getValues();
    const reports = [];
    
    for (let i = 1; i < values.length; i++) {
      // [Report ID, Customer Name, Customer Email, Customer ID, Service Date, Service Type, Status, Notes, ...]
      if (String(values[i][3]).trim() === String(customerId).trim()) {
        reports.push({
          reportId: values[i][0],
          serviceDate: values[i][4],
          serviceType: values[i][5],
          status: values[i][6],
          notes: values[i][7],
          photosCount: values[i][13],
          photosUrl: values[i][12],
          draftInvoiceId: values[i][14],
          dateFormatted: formatDateForDisplay(new Date(values[i][4]))
        });
      }
    }
    
    // Sort by date (newest first)
    reports.sort((a, b) => new Date(b.serviceDate) - new Date(a.serviceDate));
    
    return reports;
  } catch (error) {
    Logger.log('❌ getCustomerServiceReports error: ' + error.toString());
    return [];
  }
}

/**
 * Get customer's invoices
 */
function getCustomerInvoices(customerId) {
  try {
    const ss = SpreadsheetApp.openById(CP_SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Invoices & Estimates');
    if (!sheet) return [];
    
    const values = sheet.getDataRange().getValues();
    const invoices = [];
    
    for (let i = 1; i < values.length; i++) {
      // [Invoice ID, Document ID, Date, JSON1, JSON2, JSON3, Customer Name, Customer ID, One-Off Items, Status, Notes]
      if (String(values[i][7]).trim() === String(customerId).trim()) {
        const amount = calculateInvoiceTotal(values[i]);
        
        invoices.push({
          invoiceId: values[i][0],
          documentId: values[i][1],
          date: values[i][2],
          customerName: values[i][6],
          status: values[i][9],
          amount: amount,
          notes: values[i][10],
          dateFormatted: formatDateForDisplay(new Date(values[i][2])),
          amountFormatted: '$' + amount.toFixed(2),
          isPending: values[i][9] !== 'Paid' && values[i][9] !== 'Approved'
        });
      }
    }
    
    // Sort by date (newest first)
    invoices.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    return invoices;
  } catch (error) {
    Logger.log('❌ getCustomerInvoices error: ' + error.toString());
    return [];
  }
}

/**
 * Get customer's projects
 */
function getCustomerProjects(customerId) {
  try {
    const ss = SpreadsheetApp.openById(CP_SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Projects');
    if (!sheet) return [];
    
    const values = sheet.getDataRange().getValues();
    const projects = [];
    
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][2]).trim() === String(customerId).trim()) {
        projects.push({
          projectId: values[i][0],
          projectName: values[i][1],
          customerId: values[i][2],
          startDate: values[i][3],
          endDate: values[i][4],
          status: values[i][5],
          description: values[i][6],
          budget: values[i][7],
          spent: values[i][8],
          progress: calculateProgress(values[i][5]),
          progressPercent: getProgressPercent(values[i][5]),
          statusColor: getStatusColor(values[i][5])
        });
      }
    }
    
    return projects;
  } catch (error) {
    Logger.log('❌ getCustomerProjects error: ' + error.toString());
    return [];
  }
}

/**
 * Get customer's payment history
 */
function getCustomerPaymentHistory(customerId) {
  try {
    const ss = SpreadsheetApp.openById(CP_SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Payment History');
    if (!sheet) return [];
    
    const values = sheet.getDataRange().getValues();
    const payments = [];
    
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][1]).trim() === String(customerId).trim()) {
        payments.push({
          paymentDate: values[i][0],
          customerId: values[i][1],
          amount: parseFloat(values[i][2] || 0),
          method: values[i][3],
          description: values[i][4],
          invoiceId: values[i][5],
          dateFormatted: formatDateForDisplay(new Date(values[i][0])),
          amountFormatted: '$' + parseFloat(values[i][2] || 0).toFixed(2)
        });
      }
    }
    
    // Sort by date (newest first)
    payments.sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate));
    
    return payments;
  } catch (error) {
    Logger.log('❌ getCustomerPaymentHistory error: ' + error.toString());
    return [];
  }
}

/**
 * Get service report photos
 */
function getServiceReportPhotos(reportId) {
  try {
    const ss = SpreadsheetApp.openById(CP_SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Report Photos');
    if (!sheet) return [];
    
    const values = sheet.getDataRange().getValues();
    const photos = [];
    
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][1]).trim() === String(reportId).trim()) {
        photos.push({
          photoId: values[i][0],
          photoName: values[i][3],
          url: values[i][5],
          category: values[i][6],
          uploadedDate: values[i][7]
        });
      }
    }
    
    return photos;
  } catch (error) {
    Logger.log('❌ getServiceReportPhotos error: ' + error.toString());
    return [];
  }
}

// ================================================================
// SECURITY & TOKENS
// ================================================================

/**
 * Generate customer portal access token
 * Creates link for customer to access their portal
 */
function generateCustomerPortalLink(customerEmail, expiryDays = 90) {
  try {
    const ss = SpreadsheetApp.openById(CP_SPREADSHEET_ID);
    let sheet = ss.getSheetByName('Customer_Portal_Tokens');
    
    if (!sheet) {
      sheet = ss.insertSheet('Customer_Portal_Tokens');
      sheet.appendRow(['Token', 'Customer Email', 'Created Date', 'Expires Date', 'Used', 'Last Access Date']);
    }
    
    // Generate unique token
    const token = 'CPT-' + Utilities.getUuid();
    const now = new Date();
    const expiry = new Date(now.getTime() + expiryDays * 24 * 60 * 60 * 1000);
    
    sheet.appendRow([
      token,
      customerEmail,
      now,
      expiry,
      false,
      ''
    ]);
    
    // Build portal URL
    const deploymentUrl = ScriptApp.getService().getUrl();
    const portalLink = deploymentUrl + '?email=' + encodeURIComponent(customerEmail) + '&token=' + encodeURIComponent(token);
    
    Logger.log('✅ Portal link generated for: ' + customerEmail);
    return {
      success: true,
      portalLink: portalLink,
      token: token,
      expiresDate: expiry.toLocaleDateString()
    };
  } catch (error) {
    Logger.log('❌ generateCustomerPortalLink error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Verify customer portal token
 */
function verifyCustomerPortalToken(customerEmail, token) {
  try {
    const ss = SpreadsheetApp.openById(CP_SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Customer_Portal_Tokens');
    if (!sheet) return { success: false, error: 'Tokens not initialized' };
    
    const values = sheet.getDataRange().getValues();
    const now = new Date();
    
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]).trim() === String(token).trim() &&
          String(values[i][1]).trim() === String(customerEmail).trim()) {
        
        const expiryDate = new Date(values[i][3]);
        
        if (expiryDate < now) {
          return { success: false, error: 'Token expired' };
        }
        
        // Update last access
        sheet.getRange(i + 1, 6).setValue(now);
        
        return { success: true, expiresDate: expiryDate };
      }
    }
    
    return { success: false, error: 'Token not found' };
  } catch (error) {
    Logger.log('❌ verifyCustomerPortalToken error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

// ================================================================
// UTILITY FUNCTIONS
// ================================================================

function formatDateForDisplay(date) {
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  });
}

function getDayOfWeek(date) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
}

function calculateInvoiceTotal(row) {
  try {
    const oneOffItems = safeParseJSON(row[8]);
    if (Array.isArray(oneOffItems)) {
      return oneOffItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    }
    return 0;
  } catch (e) {
    return 0;
  }
}

function safeParseJSON(jsonStr) {
  try {
    return typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
  } catch (e) {
    return {};
  }
}

function calculateProgress(status) {
  const progressMap = {
    'Not Started': 0,
    'In Progress': 50,
    'In Review': 75,
    'Completed': 100
  };
  return progressMap[status] || 0;
}

function getProgressPercent(status) {
  return calculateProgress(status) + '%';
}

function getStatusColor(status) {
  const colors = {
    'Not Started': '#94a3b8',
    'In Progress': '#3b82f6',
    'In Review': '#f59e0b',
    'Completed': '#10b981'
  };
  return colors[status] || '#94a3b8';
}

// ================================================================
// HTML GENERATION
// ================================================================

/**
 * Build complete customer portal HTML
 */
function buildCustomerPortalHTML(data) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Portal - A Quality Pool Company</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f0f4f8;
            color: #1f2937;
            line-height: 1.6;
        }
        
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        
        header {
            background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
            color: white;
            padding: 30px 20px;
            border-radius: 12px;
            margin-bottom: 30px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        
        header h1 { font-size: 28px; margin-bottom: 5px; }
        header p { opacity: 0.9; font-size: 14px; }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 30px;
        }
        
        .stat-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            border-left: 4px solid #0284c7;
        }
        
        .stat-card h3 { font-size: 12px; color: #6b7280; text-transform: uppercase; margin-bottom: 5px; }
        .stat-card .value { font-size: 24px; font-weight: 700; color: #0284c7; }
        
        .section {
            background: white;
            border-radius: 8px;
            padding: 25px;
            margin-bottom: 25px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .section-title {
            font-size: 20px;
            font-weight: 700;
            color: #0f172a;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid #e5e7eb;
            display: flex;
            align-items: center;
        }
        
        .section-title::before {
            content: attr(data-icon);
            margin-right: 10px;
            font-size: 22px;
        }
        
        .tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            border-bottom: 2px solid #e5e7eb;
        }
        
        .tab-button {
            padding: 12px 20px;
            background: none;
            border: none;
            font-weight: 600;
            color: #6b7280;
            cursor: pointer;
            border-bottom: 2px solid transparent;
            transition: all 0.3s;
        }
        
        .tab-button.active {
            color: #0284c7;
            border-bottom-color: #0284c7;
        }
        
        .appointment-card, .service-card, .invoice-card {
            border: 1px solid #e5e7eb;
            padding: 15px;
            margin-bottom: 15px;
            border-radius: 6px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .appointment-card:hover { background: #f9fafb; }
        .service-card:hover { background: #f9fafb; }
        .invoice-card:hover { background: #f9fafb; }
        
        .appt-info h4 { margin-bottom: 5px; color: #0f172a; }
        .appt-info p { font-size: 13px; color: #6b7280; }
        
        .status-badge {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 700;
        }
        
        .status-scheduled { background: #d1fae5; color: #065f46; }
        .status-completed { background: #dbeafe; color: #1e40af; }
        .status-pending { background: #fef3c7; color: #92400e; }
        
        .invoice-amount {
            text-align: right;
        }
        
        .invoice-amount .amount {
            font-size: 18px;
            font-weight: 700;
            color: #0f172a;
        }
        
        .invoice-amount .status {
            font-size: 12px;
            color: #6b7280;
        }
        
        .photo-gallery {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }
        
        .photo-item {
            border-radius: 6px;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            cursor: pointer;
            transition: transform 0.2s;
        }
        
        .photo-item:hover { transform: scale(1.05); }
        
        .photo-item img {
            width: 100%;
            height: 150px;
            object-fit: cover;
        }
        
        .project-card {
            border: 1px solid #e5e7eb;
            padding: 15px;
            margin-bottom: 15px;
            border-radius: 6px;
        }
        
        .project-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
        }
        
        .project-name { font-weight: 700; color: #0f172a; }
        .project-status {
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
            color: white;
        }
        
        .progress-bar {
            width: 100%;
            height: 8px;
            background: #e5e7eb;
            border-radius: 4px;
            overflow: hidden;
            margin: 10px 0;
        }
        
        .progress-fill {
            height: 100%;
            background: #0284c7;
            border-radius: 4px;
            transition: width 0.3s;
        }
        
        .empty-state {
            text-align: center;
            padding: 40px 20px;
            color: #6b7280;
        }
        
        .empty-state p { margin-bottom: 10px; }
        
        button {
            background: #0284c7;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
            transition: background 0.3s;
        }
        
        button:hover { background: #0369a1; }
        
        .action-btn {
            padding: 8px 16px;
            font-size: 12px;
        }
        
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            align-items: center;
            justify-content: center;
            z-index: 1000;
        }
        
        .modal.active { display: flex; }
        
        .modal-content {
            background: white;
            border-radius: 12px;
            padding: 30px;
            max-width: 600px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);
        }
        
        .modal-close {
            float: right;
            font-size: 24px;
            cursor: pointer;
            color: #6b7280;
        }
        
        @media (max-width: 768px) {
            .stats-grid { grid-template-columns: 1fr 1fr; }
            .appointment-card, .service-card, .invoice-card {
                flex-direction: column;
                align-items: flex-start;
            }
            .appt-info { width: 100%; }
            .tabs { flex-wrap: wrap; }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>Welcome, ${escapeHtml(data.customer.name)}! 👋</h1>
            <p>Your A Quality Pool Company Portal</p>
        </header>
        
        <div class="stats-grid">
            <div class="stat-card">
                <h3>📅 Upcoming Appointments</h3>
                <div class="value">${data.stats.upcomingAppointments}</div>
            </div>
            <div class="stat-card">
                <h3>💰 Amount Due</h3>
                <div class="value">$${data.stats.totalOwed.toFixed(2)}</div>
            </div>
            <div class="stat-card">
                <h3>📊 Service Reports</h3>
                <div class="value">${data.stats.serviceReportCount}</div>
            </div>
            <div class="stat-card">
                <h3>✅ Active Projects</h3>
                <div class="value">${data.stats.activeProjects}</div>
            </div>
        </div>
        
        <!-- APPOINTMENTS SECTION -->
        <div class="section">
            <div class="section-title" data-icon="📅">Upcoming Appointments</div>
            ${data.appointments.length > 0 ? buildAppointmentsHTML(data.appointments) : '<div class="empty-state"><p>No upcoming appointments</p></div>'}
        </div>
        
        <!-- SERVICE REPORTS SECTION -->
        <div class="section">
            <div class="section-title" data-icon="📋">Service Reports & Photos</div>
            ${data.serviceReports.length > 0 ? buildServiceReportsHTML(data.serviceReports) : '<div class="empty-state"><p>No service reports yet</p></div>'}
        </div>
        
        <!-- INVOICES SECTION -->
        <div class="section">
            <div class="section-title" data-icon="💵">Invoices</div>
            <div class="tabs">
                <button class="tab-button active" onclick="filterInvoices('all')">All</button>
                <button class="tab-button" onclick="filterInvoices('pending')">Pending</button>
                <button class="tab-button" onclick="filterInvoices('paid')">Paid</button>
            </div>
            ${data.invoices.length > 0 ? buildInvoicesHTML(data.invoices) : '<div class="empty-state"><p>No invoices</p></div>'}
        </div>
        
        <!-- PROJECTS SECTION -->
        <div class="section">
            <div class="section-title" data-icon="🔨">Projects</div>
            ${data.projects.length > 0 ? buildProjectsHTML(data.projects) : '<div class="empty-state"><p>No projects</p></div>'}
        </div>
        
        <!-- PAYMENT HISTORY SECTION -->
        <div class="section">
            <div class="section-title" data-icon="📈">Payment History</div>
            ${data.payments.length > 0 ? buildPaymentHistoryHTML(data.payments) : '<div class="empty-state"><p>No payment history</p></div>'}
        </div>
    </div>
    
    <!-- Photo Modal -->
    <div id="photoModal" class="modal">
        <div class="modal-content">
            <span class="modal-close" onclick="closePhotoModal()">&times;</span>
            <img id="photoModalImg" style="width: 100%; border-radius: 8px;">
            <p id="photoModalCaption" style="margin-top: 15px; color: #6b7280;"></p>
        </div>
    </div>
    
    <script>
        function openPhoto(url, caption) {
            document.getElementById('photoModal').classList.add('active');
            document.getElementById('photoModalImg').src = url;
            document.getElementById('photoModalCaption').textContent = caption;
        }
        
        function closePhotoModal() {
            document.getElementById('photoModal').classList.remove('active');
        }
        
        function filterInvoices(type) {
            // Update active tab and filter invoices
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');
            
            document.querySelectorAll('.invoice-card').forEach(card => {
                if (type === 'all') {
                    card.style.display = 'flex';
                } else if (type === 'pending') {
                    card.style.display = card.getAttribute('data-status') === 'pending' ? 'flex' : 'none';
                } else if (type === 'paid') {
                    card.style.display = card.getAttribute('data-status') === 'paid' ? 'flex' : 'none';
                }
            });
        }
    </script>
</body>
</html>
  `;
}

function buildAppointmentsHTML(appointments) {
  return appointments.map(apt => `
    <div class="appointment-card">
        <div class="appt-info">
            <h4>${escapeHtml(apt.serviceType)}</h4>
            <p><strong>${apt.dateFormatted}</strong> at ${apt.time || 'TBD'}</p>
            <p>${apt.dayOfWeek}</p>
            ${apt.notes ? '<p style="margin-top: 5px;"><em>' + escapeHtml(apt.notes) + '</em></p>' : ''}
        </div>
        <span class="status-badge status-${apt.status.toLowerCase()}">${apt.status}</span>
    </div>
  `).join('');
}

function buildServiceReportsHTML(reports) {
  return reports.map(report => `
    <div class="service-card">
        <div>
            <h4>${escapeHtml(report.serviceType)} - ${report.dateFormatted}</h4>
            <p><strong>Status:</strong> ${report.status}</p>
            ${report.notes ? '<p><strong>Notes:</strong> ' + escapeHtml(report.notes) + '</p>' : ''}
            <p style="margin-top: 10px; color: #0284c7;"><strong>📸 ${report.photosCount} photos included</strong></p>
        </div>
        <button class="action-btn" onclick="viewServiceReport('${report.reportId}')">View Report</button>
    </div>
  `).join('');
}

function buildInvoicesHTML(invoices) {
  return invoices.map(invoice => `
    <div class="invoice-card" data-status="${invoice.isPending ? 'pending' : 'paid'}">
        <div>
            <h4>Invoice ${escapeHtml(invoice.invoiceId)}</h4>
            <p>${invoice.dateFormatted}</p>
            <p>${escapeHtml(invoice.notes)}</p>
        </div>
        <div class="invoice-amount">
            <div class="amount">${invoice.amountFormatted}</div>
            <div class="status">${invoice.status}</div>
            ${invoice.isPending ? '<button class="action-btn" style="margin-top: 10px;">Pay Now</button>' : ''}
        </div>
    </div>
  `).join('');
}

function buildProjectsHTML(projects) {
  return projects.map(proj => `
    <div class="project-card">
        <div class="project-header">
            <div class="project-name">${escapeHtml(proj.projectName)}</div>
            <div class="project-status" style="background: ${proj.statusColor};">${proj.status}</div>
        </div>
        <p style="font-size: 13px; color: #6b7280; margin-bottom: 10px;">${escapeHtml(proj.description)}</p>
        <div class="progress-bar">
            <div class="progress-fill" style="width: ${proj.progressPercent};"></div>
        </div>
        <p style="font-size: 12px; color: #6b7280;">
            Progress: ${proj.progressPercent} | Budget: $${proj.budget.toFixed(2)} | Spent: $${proj.spent.toFixed(2)}
        </p>
    </div>
  `).join('');
}

function buildPaymentHistoryHTML(payments) {
  return payments.map(payment => `
    <div class="appointment-card">
        <div class="appt-info">
            <h4>${escapeHtml(payment.description)}</h4>
            <p>${payment.dateFormatted}</p>
            <p>Method: ${escapeHtml(payment.method)}</p>
        </div>
        <div style="text-align: right;">
            <div style="font-weight: 700; color: #10b981; font-size: 18px;">${payment.amountFormatted}</div>
        </div>
    </div>
  `).join('');
}

function escapeHtml(text) {
  const map = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'};
  return String(text || '').replace(/[&<>"']/g, m => map[m]);
}

function viewServiceReport(reportId) {
  alert('Service Report: ' + reportId + '\n\nFull photo gallery and details coming soon!');
}

// ================================================================
// TESTS
// ================================================================

function testGenerateCustomerLink() {
  const result = generateCustomerPortalLink('john@example.com');
  Logger.log('Portal Link: ' + result.portalLink);
  Logger.log('Expires: ' + result.expiresDate);
}

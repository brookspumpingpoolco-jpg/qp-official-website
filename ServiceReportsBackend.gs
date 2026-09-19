/**
 * SERVICE REPORTS BACKEND
 * Google Apps Script functions for managing service reports
 * 
 * Features:
 * - Save service reports with work performed, chemicals, photos
 * - Retrieve all service reports for a customer
 * - Send service reports to customers via email
 * - Track service report status (draft, completed, sent)
 * 
 * Integration: Use with CustomerInfoUI.html
 */

// ========================================
// SHEET CONFIGURATION
// ========================================

const SR_SPREADSHEET_ID = '1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0';
const SR_SERVICE_REPORTS_SHEET = 'Service Reports';
const SR_CUSTOMERS_SHEET = 'Customers';

const SR_HEADERS = [
  'Report ID',
  'Customer ID',
  'Customer Name',
  'Service Date',
  'Service Time',
  'Technician Name',
  'Work Performed',
  'Pool Condition',
  'Notes',
  'Chemical Log',
  'Photos',
  'Status',
  'Created Date',
  'Sent Date',
  'Sent To'
];

// ========================================
// INITIALIZATION
// ========================================

function ensureServiceReportsSheet_() {
  const ss = SpreadsheetApp.openById(SR_SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SR_SERVICE_REPORTS_SHEET);
  
  if (!sheet) {
    sheet = ss.insertSheet(SR_SERVICE_REPORTS_SHEET);
    sheet.appendRow(SR_HEADERS);
    sheet.setFrozenRows(1);
    
    // Set column widths
    sheet.setColumnWidth(1, 120);  // Report ID
    sheet.setColumnWidth(2, 120);  // Customer ID
    sheet.setColumnWidth(3, 150);  // Customer Name
    sheet.setColumnWidth(4, 120);  // Service Date
    sheet.setColumnWidth(5, 100);  // Service Time
    sheet.setColumnWidth(6, 140);  // Technician
    sheet.setColumnWidth(7, 200);  // Work Performed
    sheet.setColumnWidth(8, 120);  // Pool Condition
    sheet.setColumnWidth(9, 200);  // Notes
    sheet.setColumnWidth(10, 200); // Chemical Log
    sheet.setColumnWidth(11, 150); // Photos
    sheet.setColumnWidth(12, 100); // Status
    sheet.setColumnWidth(13, 120); // Created Date
    sheet.setColumnWidth(14, 120); // Sent Date
    sheet.setColumnWidth(15, 150); // Sent To
  }
  
  return sheet;
}

// ========================================
// SAVE SERVICE REPORT
// ========================================

function saveServiceReport(data) {
  try {
    const sheet = ensureServiceReportsSheet_();
    const reportId = 'SR-' + new Date().getTime();
    
    const newRow = [
      reportId,
      data.customerId || '',
      data.customerName || '',
      data.reportDate || new Date().toISOString().split('T')[0],
      data.reportTime || '',
      data.technicianName || '',
      data.workPerformed || '',
      data.poolCondition || '',
      data.notes || '',
      JSON.stringify(data.chemicals || []),
      JSON.stringify(data.photos || []),
      'Completed',
      new Date().toISOString(),
      '',
      ''
    ];
    
    sheet.appendRow(newRow);
    
    Logger.log('✅ Service report saved: ' + reportId);
    return {
      success: true,
      reportId: reportId,
      message: 'Service report saved successfully'
    };
  } catch (error) {
    Logger.log('❌ Error saving service report: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

// ========================================
// GET SERVICE REPORTS
// ========================================

function getServiceReports(customerId, email) {
  try {
    const sheet = ensureServiceReportsSheet_();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    if (data.length < 2) {
      return {
        success: true,
        reports: [],
        summary: { total: 0, completed: 0, draft: 0, sent: 0 }
      };
    }
    
    const reports = [];
    const summary = { total: 0, completed: 0, draft: 0, sent: 0 };
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const report = {};
      
      headers.forEach((header, index) => {
        report[toKey(header)] = row[index];
      });
      
      // Filter by customer ID
      if (report.customerId === customerId) {
        // Parse JSON fields
        try {
          report.chemicals = JSON.parse(report.chemicalLog || '[]');
          report.photos = JSON.parse(report.photos || '[]');
        } catch (e) {
          report.chemicals = [];
          report.photos = [];
        }
        
        reports.push(report);
        summary.total++;
        
        const status = (report.status || 'draft').toLowerCase();
        if (status === 'completed') summary.completed++;
        else if (status === 'draft') summary.draft++;
        else if (status === 'sent') summary.sent++;
      }
    }
    
    // Sort by date (newest first)
    reports.sort((a, b) => new Date(b.serviceDate) - new Date(a.serviceDate));
    
    Logger.log('✅ Retrieved ' + reports.length + ' service reports for customer: ' + customerId);
    
    return {
      success: true,
      reports: reports,
      summary: summary
    };
  } catch (error) {
    Logger.log('❌ Error getting service reports: ' + error.toString());
    return {
      success: false,
      reports: [],
      summary: { total: 0, completed: 0, draft: 0, sent: 0 },
      error: error.toString()
    };
  }
}

// ========================================
// GET SERVICE REPORT BY ID
// ========================================

function getServiceReportById(reportId) {
  try {
    const sheet = ensureServiceReportsSheet_();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[0] === reportId) {
        const report = {};
        headers.forEach((header, index) => {
          report[toKey(header)] = row[index];
        });
        
        // Parse JSON fields
        try {
          report.chemicals = JSON.parse(report.chemicalLog || '[]');
          report.photos = JSON.parse(report.photos || '[]');
        } catch (e) {
          report.chemicals = [];
          report.photos = [];
        }
        
        report.rowIndex = i + 1;
        return report;
      }
    }
    
    return null;
  } catch (error) {
    Logger.log('❌ Error getting service report by ID: ' + error.toString());
    return null;
  }
}

// ========================================
// SEND SERVICE REPORT
// ========================================

function sendServiceReport(reportId, customerEmail) {
  try {
    const report = getServiceReportById(reportId);
    
    if (!report) {
      return {
        success: false,
        error: 'Service report not found'
      };
    }
    
    if (!customerEmail) {
      return {
        success: false,
        error: 'Customer email required'
      };
    }
    
    // Generate email HTML
    const emailHtml = generateServiceReportEmail(report);
    
    // Send email
    GmailApp.sendEmail(
      customerEmail,
      '🏊 Service Report - ' + formatDateForEmail(report.serviceDate),
      '',
      {
        htmlBody: emailHtml,
        replyTo: 'noreply@poolservicepro.com'
      }
    );
    
    // Update status in sheet
    const sheet = ensureServiceReportsSheet_();
    sheet.getRange(report.rowIndex, 12).setValue('Sent');
    sheet.getRange(report.rowIndex, 14).setValue(new Date().toISOString());
    sheet.getRange(report.rowIndex, 15).setValue(customerEmail);
    
    Logger.log('✅ Service report sent to: ' + customerEmail);
    
    return {
      success: true,
      message: 'Service report sent successfully'
    };
  } catch (error) {
    Logger.log('❌ Error sending service report: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

// ========================================
// GENERATE SERVICE REPORT EMAIL
// ========================================

function generateServiceReportEmail(report) {
  const chemicalList = report.chemicals && report.chemicals.length > 0
    ? report.chemicals.map(c => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e0e0e0;">${c.name}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e0e0e0; text-align: center;">${c.amount} ppm</td>
          <td style="padding: 8px; border-bottom: 1px solid #e0e0e0;">${c.notes}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="3" style="padding: 8px; text-align: center; color: #999;">No chemicals recorded</td></tr>';
  
  const photoHtml = report.photos && report.photos.length > 0
    ? `<h3 style="margin-top: 24px; margin-bottom: 12px; color: #333;">📸 Photos</h3>
       <div style="display: flex; flex-wrap: wrap; gap: 12px;">
         ${report.photos.map(photo => `
           <img src="${photo}" style="max-width: 200px; max-height: 200px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
         `).join('')}
       </div>`
    : '';
  
  return `
    <div style="font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="background: linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%); color: white; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="margin: 0; font-size: 28px; font-weight: 800;">🏊 Service Report</h1>
        <p style="margin: 8px 0 0 0; opacity: 0.9;">Completed on ${formatDateForEmail(report.serviceDate)}</p>
      </div>
      
      <div style="background: white; padding: 24px; border-left: 4px solid #06b6d4;">
        <h2 style="margin: 0 0 16px 0; color: #333; font-size: 20px;">Service Details</h2>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
          <div>
            <p style="margin: 0 0 4px 0; color: #999; font-size: 12px; font-weight: 600; text-transform: uppercase;">Service Date</p>
            <p style="margin: 0; font-size: 16px; font-weight: 600;">${formatDateForEmail(report.serviceDate)}</p>
          </div>
          <div>
            <p style="margin: 0 0 4px 0; color: #999; font-size: 12px; font-weight: 600; text-transform: uppercase;">Service Time</p>
            <p style="margin: 0; font-size: 16px; font-weight: 600;">${report.serviceTime || 'N/A'}</p>
          </div>
          <div>
            <p style="margin: 0 0 4px 0; color: #999; font-size: 12px; font-weight: 600; text-transform: uppercase;">Technician</p>
            <p style="margin: 0; font-size: 16px; font-weight: 600;">${report.technicianName || 'Service Team'}</p>
          </div>
          <div>
            <p style="margin: 0 0 4px 0; color: #999; font-size: 12px; font-weight: 600; text-transform: uppercase;">Pool Condition</p>
            <p style="margin: 0; font-size: 16px; font-weight: 600;">
              ${getConditionEmoji(report.poolCondition)} ${report.poolCondition || 'Not assessed'}
            </p>
          </div>
        </div>
        
        <h3 style="margin: 24px 0 12px 0; color: #333; font-size: 16px; font-weight: 700;">Work Performed</h3>
        <p style="margin: 0; color: #555; line-height: 1.6; white-space: pre-wrap;">${report.workPerformed || 'No work recorded'}</p>
        
        ${report.notes ? `
          <h3 style="margin: 24px 0 12px 0; color: #333; font-size: 16px; font-weight: 700;">Additional Notes</h3>
          <p style="margin: 0; color: #555; line-height: 1.6; white-space: pre-wrap;">${report.notes}</p>
        ` : ''}
        
        <h3 style="margin: 24px 0 12px 0; color: #333; font-size: 16px; font-weight: 700;">🧪 Chemical Log</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <thead>
            <tr style="background: #f5f5f5;">
              <th style="padding: 8px; text-align: left; font-weight: 600; color: #333;">Chemical</th>
              <th style="padding: 8px; text-align: center; font-weight: 600; color: #333;">Amount</th>
              <th style="padding: 8px; text-align: left; font-weight: 600; color: #333;">Notes</th>
            </tr>
          </thead>
          <tbody>
            ${chemicalList}
          </tbody>
        </table>
        
        ${photoHtml}
        
        <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e0e0e0; text-align: center; color: #999; font-size: 12px;">
          <p style="margin: 0;">This is an automated service report from your pool service provider.</p>
          <p style="margin: 4px 0 0 0;">Questions? Contact us directly.</p>
        </div>
      </div>
      
      <div style="background: #f9f9f9; padding: 16px; border-radius: 0 0 12px 12px; text-align: center; color: #999; font-size: 11px;">
        <p style="margin: 0;">Generated on ${new Date().toLocaleDateString()}</p>
      </div>
    </div>
  `;
}

// ========================================
// HELPER FUNCTIONS
// ========================================

function toKey(header) {
  return header
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^\w\s]/g, '');
}

function formatDateForEmail(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}

function getConditionEmoji(condition) {
  switch ((condition || '').toLowerCase()) {
    case 'excellent': return '✨';
    case 'good': return '👍';
    case 'fair': return '😐';
    case 'poor': return '⚠️';
    default: return '🏊';
  }
}

// ========================================
// EXPORT FUNCTIONS FOR HTML
// ========================================

function exportServiceReportAPI() {
  return {
    getServiceReports: function(customerId, email) {
      return getServiceReports(customerId, email);
    },
    saveServiceReport: function(data) {
      return saveServiceReport(data);
    },
    sendServiceReport: function(reportId, email) {
      return sendServiceReport(reportId, email);
    },
    getServiceReportById: function(reportId) {
      return getServiceReportById(reportId);
    }
  };
}

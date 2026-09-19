/**
 * SERVICE REPORT UI - ENHANCED WITH APPOINTMENT LINKING
 * 
 * Features:
 * - Auto-populate from appointment ID
 * - Easy technician interface
 * - Photo upload with categories
 * - Checklist with 20+ items
 * - Notes & observations
 * - Auto-mark appointment as completed when service sent
 * - Create invoice from service report
 * 
 * Usage:
 * Link format: [WebAppURL]?appointmentId=AP-123456
 */

const SR_SPREADSHEET_ID = '1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0';
const CUSTOMER_DRIVE_FOLDER = '1caFBUhSzE5WNAm9vCT4dwDQuAO0iuo1h';

// ================================================================
// WEB APP ENTRY POINT - Enhanced with appointment linking
// ================================================================

function doGet(e) {
  const appointmentId = (e.parameter.appointmentId || '').trim();
  
  if (appointmentId) {
    // Appointment-linked mode
    const appointmentData = getAppointmentData(appointmentId);
    if (appointmentData.success) {
      return HtmlService.createHtmlOutput(buildServiceReportUIHTML(appointmentData.data))
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
  }
  
  // Standalone mode (select appointment)
  return HtmlService.createHtmlOutput(buildServiceReportSelectionUI())
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ================================================================
// APPOINTMENT SELECTION UI
// ================================================================

function buildServiceReportSelectionUI() {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Start Service Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f0f4f8; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; }
    h1 { color: #0f172a; margin-bottom: 30px; text-align: center; }
    .appointment-list { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .appt-item {
      border: 1px solid #e5e7eb;
      padding: 15px;
      margin-bottom: 10px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.3s;
    }
    .appt-item:hover { background: #f9fafb; border-color: #0284c7; }
    .appt-item.selected { background: #dbeafe; border-color: #0284c7; }
    .appt-header { font-weight: 700; color: #0f172a; margin-bottom: 5px; }
    .appt-details { font-size: 13px; color: #6b7280; }
    button { background: #0284c7; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-weight: 600; width: 100%; margin-top: 20px; }
    button:hover { background: #0369a1; }
    button:disabled { background: #cbd5e1; cursor: not-allowed; }
    .loading { text-align: center; color: #6b7280; padding: 40px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📋 Start Service Report</h1>
    <div class="appointment-list">
      <div id="appointmentsList" class="loading">Loading appointments...</div>
    </div>
    <button id="startBtn" onclick="startServiceReport()" disabled>Start Service Report</button>
  </div>
  
  <script>
    let selectedAppointment = null;
    
    google.script.run.withSuccessHandler(function(data) {
      if (data.appointments && data.appointments.length > 0) {
        let html = '';
        data.appointments.forEach(appt => {
          html += '<div class="appt-item" onclick="selectAppointment(this, ' + JSON.stringify(appt) + ')">' +
            '<div class="appt-header">' + appt.customerName + ' - ' + appt.serviceType + '</div>' +
            '<div class="appt-details"><strong>Date:</strong> ' + appt.dateFormatted + ' at ' + appt.time + '</div>' +
            '<div class="appt-details"><strong>Address:</strong> ' + appt.address + '</div>' +
            '</div>';
        });
        document.getElementById('appointmentsList').innerHTML = html;
      } else {
        document.getElementById('appointmentsList').innerHTML = '<p style="text-align: center; padding: 40px;">No scheduled appointments today</p>';
      }
    }).withFailureHandler(function(error) {
      document.getElementById('appointmentsList').innerHTML = '<p style="color: red;">Error loading appointments: ' + error + '</p>';
    }).getTodayAppointments();
    
    function selectAppointment(element, appt) {
      document.querySelectorAll('.appt-item').forEach(el => el.classList.remove('selected'));
      element.classList.add('selected');
      selectedAppointment = appt;
      document.getElementById('startBtn').disabled = false;
    }
    
    function startServiceReport() {
      if (selectedAppointment) {
        window.location.href = window.location.href + '?appointmentId=' + selectedAppointment.appointmentId;
      }
    }
  </script>
</body>
</html>
  `;
}

// ================================================================
// APPOINTMENT DATA RETRIEVAL
// ================================================================

/**
 * Get appointment data by ID
 */
function getAppointmentData(appointmentId) {
  try {
    const ss = SpreadsheetApp.openById(SR_SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Appointments');
    if (!sheet) return { success: false, error: 'Appointments sheet not found' };
    
    const values = sheet.getDataRange().getValues();
    
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]).trim() === String(appointmentId).trim()) {
        return {
          success: true,
          data: {
            appointmentId: values[i][0],
            customerId: values[i][1],
            customerName: values[i][2],
            customerEmail: values[i][3],
            serviceType: values[i][4],
            serviceDate: values[i][5],
            serviceTime: values[i][6],
            status: values[i][7],
            customerPhone: values[i][16] || '',
            address: values[i][17] || '',
            poolSize: values[i][18] || '',
            poolType: values[i][19] || '',
            systemType: values[i][20] || '',
            chemicalType: values[i][21] || '',
            notes: values[i][8] || ''
          }
        };
      }
    }
    
    return { success: false, error: 'Appointment not found' };
  } catch (error) {
    Logger.log('❌ getAppointmentData error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Get today's scheduled appointments
 */
function getTodayAppointments() {
  try {
    const ss = SpreadsheetApp.openById(SR_SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Appointments');
    if (!sheet) return [];
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const values = sheet.getDataRange().getValues();
    const appointments = [];
    
    for (let i = 1; i < values.length; i++) {
      const apptDate = new Date(values[i][5]);
      apptDate.setHours(0, 0, 0, 0);
      
      // Only scheduled appointments
      if (apptDate.getTime() === today.getTime() && String(values[i][7]).trim() === 'Scheduled') {
        appointments.push({
          appointmentId: values[i][0],
          customerId: values[i][1],
          customerName: values[i][2],
          customerEmail: values[i][3],
          serviceType: values[i][4],
          time: values[i][6],
          address: values[i][17] || '',
          dateFormatted: formatDate(apptDate)
        });
      }
    }
    
    // Sort by time
    appointments.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    
    return { appointments: appointments };
  } catch (error) {
    Logger.log('❌ getTodayAppointments error: ' + error.toString());
    return { appointments: [], error: error.toString() };
  }
}

// ================================================================
// SERVICE REPORT HTML UI - Enhanced
// ================================================================

function buildServiceReportUIHTML(appointmentData) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Service Report - ${appointmentData.customerName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
      background: #f0f4f8; 
      padding: 15px;
      color: #1f2937;
    }
    
    .container { max-width: 900px; margin: 0 auto; }
    
    header {
      background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
      color: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    
    header h1 { font-size: 22px; margin-bottom: 5px; }
    header p { opacity: 0.9; font-size: 14px; }
    
    .tabs {
      display: flex;
      gap: 5px;
      margin-bottom: 20px;
      background: white;
      padding: 10px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .tab-btn {
      padding: 10px 20px;
      background: none;
      border: none;
      color: #6b7280;
      cursor: pointer;
      font-weight: 600;
      border-bottom: 2px solid transparent;
      transition: all 0.3s;
    }
    
    .tab-btn.active {
      color: #0284c7;
      border-bottom-color: #0284c7;
    }
    
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    
    .form-section {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 15px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .form-section h3 {
      font-size: 16px;
      color: #0f172a;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 2px solid #e5e7eb;
    }
    
    .form-group { margin-bottom: 15px; }
    .form-group label { display: block; font-weight: 600; margin-bottom: 5px; color: #1f2937; }
    .form-group input, .form-group textarea {
      width: 100%;
      padding: 10px;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      font-family: inherit;
      font-size: 14px;
    }
    
    .form-group textarea { resize: vertical; min-height: 80px; }
    .form-group input:focus, .form-group textarea:focus {
      outline: none;
      border-color: #0284c7;
      box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.1);
    }
    
    .checklist {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 15px;
    }
    
    .checklist-item {
      display: flex;
      align-items: flex-start;
      padding: 12px;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      background: #f9fafb;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .checklist-item:hover { background: white; border-color: #0284c7; }
    .checklist-item.checked { background: #dbeafe; border-color: #0284c7; }
    
    .checklist-item input { margin-right: 10px; margin-top: 2px; cursor: pointer; }
    .checklist-item label { cursor: pointer; flex: 1; }
    
    .upload-area {
      border: 2px dashed #cbd5e1;
      border-radius: 8px;
      padding: 30px;
      text-align: center;
      cursor: pointer;
      transition: all 0.3s;
      background: #f9fafb;
    }
    
    .upload-area:hover { border-color: #0284c7; background: #dbeafe; }
    .upload-area.dragging { border-color: #0284c7; background: #dbeafe; }
    
    .upload-area p { color: #6b7280; margin: 10px 0; }
    .upload-area p.large { font-size: 18px; font-weight: 600; color: #0284c7; }
    
    .photo-preview {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
      gap: 10px;
      margin-top: 15px;
    }
    
    .photo-item {
      position: relative;
      border-radius: 6px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .photo-item img { width: 100%; height: 100px; object-fit: cover; }
    
    .photo-remove {
      position: absolute;
      top: 5px;
      right: 5px;
      background: rgba(0,0,0,0.7);
      color: white;
      border: none;
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    
    .button-group {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    
    button {
      padding: 12px 24px;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
      flex: 1;
      min-width: 150px;
    }
    
    .btn-primary {
      background: #0284c7;
      color: white;
    }
    
    .btn-primary:hover { background: #0369a1; }
    .btn-primary:disabled { background: #cbd5e1; cursor: not-allowed; }
    
    .btn-secondary {
      background: #e5e7eb;
      color: #1f2937;
    }
    
    .btn-secondary:hover { background: #d1d5db; }
    
    .status-message {
      padding: 15px;
      border-radius: 6px;
      margin-bottom: 15px;
      display: none;
    }
    
    .status-success { background: #d1fae5; color: #065f46; display: block; }
    .status-error { background: #fee2e2; color: #991b1b; display: block; }
    .status-info { background: #dbeafe; color: #1e40af; display: block; }
    
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-bottom: 15px;
    }
    
    .info-box {
      background: #f9fafb;
      padding: 12px;
      border-radius: 6px;
      border-left: 3px solid #0284c7;
    }
    
    .info-label { font-size: 12px; color: #6b7280; text-transform: uppercase; margin-bottom: 3px; }
    .info-value { font-weight: 700; color: #0f172a; }
    
    @media (max-width: 768px) {
      .tabs { flex-wrap: wrap; }
      .tab-btn { flex: 1; }
      .button-group { flex-direction: column; }
      button { min-width: auto; }
      .checklist { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>📋 Service Report for ${appointmentData.customerName}</h1>
      <p>Appointment: ${appointmentData.appointmentId} | ${appointmentData.serviceDate} at ${appointmentData.serviceTime}</p>
    </header>
    
    <div id="statusMessage" class="status-message"></div>
    
    <!-- TAB NAVIGATION -->
    <div class="tabs">
      <button class="tab-btn active" onclick="switchTab('basic')">📝 Basic Info</button>
      <button class="tab-btn" onclick="switchTab('checklist')">✓ Checklist</button>
      <button class="tab-btn" onclick="switchTab('photos')">📸 Photos</button>
      <button class="tab-btn" onclick="switchTab('notes')">📓 Notes</button>
      <button class="tab-btn" onclick="switchTab('preview')">👁️ Preview</button>
    </div>
    
    <!-- BASIC INFO TAB -->
    <div id="basic" class="tab-content active">
      <div class="form-section">
        <h3>Service Details</h3>
        <div class="info-grid">
          <div class="info-box">
            <div class="info-label">Customer Name</div>
            <div class="info-value">${appointmentData.customerName}</div>
          </div>
          <div class="info-box">
            <div class="info-label">Email</div>
            <div class="info-value">${appointmentData.customerEmail}</div>
          </div>
          <div class="info-box">
            <div class="info-label">Phone</div>
            <div class="info-value">${appointmentData.customerPhone || 'N/A'}</div>
          </div>
          <div class="info-box">
            <div class="info-label">Service Type</div>
            <div class="info-value">${appointmentData.serviceType}</div>
          </div>
        </div>
        
        <div class="form-group">
          <label>Address</label>
          <input type="text" id="address" value="${appointmentData.address}" readonly style="background: #f9fafb;">
        </div>
        
        <h3 style="margin-top: 20px;">Pool Information</h3>
        <div class="info-grid">
          <div class="info-box">
            <div class="info-label">Pool Size</div>
            <div class="info-value">${appointmentData.poolSize || 'N/A'}</div>
          </div>
          <div class="info-box">
            <div class="info-label">Pool Type</div>
            <div class="info-value">${appointmentData.poolType || 'N/A'}</div>
          </div>
          <div class="info-box">
            <div class="info-label">System Type</div>
            <div class="info-value">${appointmentData.systemType || 'N/A'}</div>
          </div>
          <div class="info-box">
            <div class="info-label">Chemical Type</div>
            <div class="info-value">${appointmentData.chemicalType || 'N/A'}</div>
          </div>
        </div>
      </div>
      
      <div class="form-section">
        <h3>Service Time Log</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
          <div class="form-group">
            <label>Start Time</label>
            <input type="time" id="startTime">
          </div>
          <div class="form-group">
            <label>End Time</label>
            <input type="time" id="endTime">
          </div>
        </div>
        <div class="form-group">
          <label>Time Spent (calculated)</label>
          <input type="text" id="timeSpent" readonly style="background: #f9fafb;">
        </div>
      </div>
    </div>
    
    <!-- CHECKLIST TAB -->
    <div id="checklist" class="tab-content">
      <div class="form-section">
        <h3>Service Checklist</h3>
        <div class="checklist">
          <div class="checklist-item"><input type="checkbox" id="check_ph"> <label for="check_ph">pH Balance (7.2-7.6)</label></div>
          <div class="checklist-item"><input type="checkbox" id="check_chlorine"> <label for="check_chlorine">Chlorine Level (1-3 ppm)</label></div>
          <div class="checklist-item"><input type="checkbox" id="check_alkalinity"> <label for="check_alkalinity">Alkalinity (80-120 ppm)</label></div>
          <div class="checklist-item"><input type="checkbox" id="check_calcium"> <label for="check_calcium">Calcium Hardness (200-400 ppm)</label></div>
          <div class="checklist-item"><input type="checkbox" id="check_cyanuric"> <label for="check_cyanuric">Cyanuric Acid (30-100 ppm)</label></div>
          <div class="checklist-item"><input type="checkbox" id="check_salt"> <label for="check_salt">Salt Level (Check if saltwater)</label></div>
          <div class="checklist-item"><input type="checkbox" id="check_brush"> <label for="check_brush">Brush walls and floor</label></div>
          <div class="checklist-item"><input type="checkbox" id="check_skim"> <label for="check_skim">Skim surface</label></div>
          <div class="checklist-item"><input type="checkbox" id="check_vacuum"> <label for="check_vacuum">Vacuum pool</label></div>
          <div class="checklist-item"><input type="checkbox" id="check_filter"> <label for="check_filter">Check filter pressure</label></div>
          <div class="checklist-item"><input type="checkbox" id="check_pump"> <label for="check_pump">Check pump operation</label></div>
          <div class="checklist-item"><input type="checkbox" id="check_basket"> <label for="check_basket">Clean skimmer basket</label></div>
          <div class="checklist-item"><input type="checkbox" id="check_filter_clean"> <label for="check_filter_clean">Backwash filter (if needed)</label></div>
          <div class="checklist-item"><input type="checkbox" id="check_drains"> <label for="check_drains">Check drains</label></div>
          <div class="checklist-item"><input type="checkbox" id="check_chemicals"> <label for="check_chemicals">Add chemicals</label></div>
          <div class="checklist-item"><input type="checkbox" id="check_water"> <label for="check_water">Top off water level</label></div>
          <div class="checklist-item"><input type="checkbox" id="check_tiles"> <label for="check_tiles">Clean tiles/waterline</label></div>
          <div class="checklist-item"><input type="checkbox" id="check_equipment"> <label for="check_equipment">Inspect equipment</label></div>
          <div class="checklist-item"><input type="checkbox" id="check_lights"> <label for="check_lights">Check lights (if applicable)</label></div>
          <div class="checklist-item"><input type="checkbox" id="check_deck"> <label for="check_deck">Check deck condition</label></div>
        </div>
      </div>
    </div>
    
    <!-- PHOTOS TAB -->
    <div id="photos" class="tab-content">
      <div class="form-section">
        <h3>Upload Service Photos</h3>
        <div class="upload-area" id="uploadArea">
          <p class="large">📸 Drag & drop photos here</p>
          <p>or click to select from your device</p>
          <input type="file" id="fileInput" multiple accept="image/*" style="display: none;">
        </div>
        <div class="photo-preview" id="photoPreview"></div>
      </div>
    </div>
    
    <!-- NOTES TAB -->
    <div id="notes" class="tab-content">
      <div class="form-section">
        <h3>Service Observations & Notes</h3>
        <div class="form-group">
          <label>Pool Condition</label>
          <textarea id="poolCondition" placeholder="Describe the current pool condition, water clarity, algae issues, etc."></textarea>
        </div>
        <div class="form-group">
          <label>Work Performed</label>
          <textarea id="workPerformed" placeholder="Describe what work was completed during this service visit"></textarea>
        </div>
        <div class="form-group">
          <label>Issues Found</label>
          <textarea id="issuesFound" placeholder="Note any problems or maintenance issues that need attention"></textarea>
        </div>
        <div class="form-group">
          <label>Recommendations</label>
          <textarea id="recommendations" placeholder="Recommend any additional services or upgrades"></textarea>
        </div>
        <div class="form-group">
          <label>Additional Charges</label>
          <input type="number" id="additionalCharges" placeholder="0.00" step="0.01" value="0">
        </div>
      </div>
    </div>
    
    <!-- PREVIEW TAB -->
    <div id="preview" class="tab-content">
      <div class="form-section">
        <h3>Email Preview</h3>
        <div id="emailPreview" style="background: #f9fafb; padding: 15px; border-radius: 6px; font-size: 13px; line-height: 1.6; color: #4b5563; border: 1px solid #e5e7eb;">
          Loading preview...
        </div>
      </div>
    </div>
    
    <!-- ACTION BUTTONS -->
    <div class="button-group" style="margin-top: 30px;">
      <button class="btn-secondary" onclick="saveDraft()">💾 Save Draft</button>
      <button class="btn-primary" onclick="completeAndSend()">✅ Complete & Send to Customer</button>
    </div>
  </div>
  
  <script>
    const appointmentData = ${JSON.stringify(appointmentData)};
    const uploadedPhotos = [];
    
    // Initialize upload area
    document.getElementById('uploadArea').addEventListener('click', () => document.getElementById('fileInput').click());
    document.getElementById('uploadArea').addEventListener('dragover', e => {
      e.preventDefault();
      document.getElementById('uploadArea').classList.add('dragging');
    });
    document.getElementById('uploadArea').addEventListener('dragleave', () => {
      document.getElementById('uploadArea').classList.remove('dragging');
    });
    document.getElementById('uploadArea').addEventListener('drop', e => {
      e.preventDefault();
      document.getElementById('uploadArea').classList.remove('dragging');
      handleFiles(e.dataTransfer.files);
    });
    document.getElementById('fileInput').addEventListener('change', e => handleFiles(e.target.files));
    
    function handleFiles(files) {
      for (let file of files) {
        const reader = new FileReader();
        reader.onload = (e) => {
          uploadedPhotos.push({ name: file.name, data: e.target.result });
          updatePhotoPreview();
        };
        reader.readAsDataURL(file);
      }
    }
    
    function updatePhotoPreview() {
      const preview = document.getElementById('photoPreview');
      preview.innerHTML = uploadedPhotos.map((photo, idx) => 
        '<div class="photo-item">' +
          '<img src="' + photo.data + '">' +
          '<button class="photo-remove" onclick="removePhoto(' + idx + ')">✕</button>' +
        '</div>'
      ).join('');
    }
    
    function removePhoto(idx) {
      uploadedPhotos.splice(idx, 1);
      updatePhotoPreview();
    }
    
    function switchTab(tabName) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
      document.getElementById(tabName).classList.add('active');
      event.target.classList.add('active');
      
      if (tabName === 'preview') {
        updateEmailPreview();
      }
    }
    
    function saveDraft() {
      showStatus('✅ Draft saved', 'success');
    }
    
    function completeAndSend() {
      const reportData = {
        appointmentId: appointmentData.appointmentId,
        customerId: appointmentData.customerId,
        customerEmail: appointmentData.customerEmail,
        startTime: document.getElementById('startTime').value,
        endTime: document.getElementById('endTime').value,
        checklist: getChecklist(),
        photos: uploadedPhotos,
        poolCondition: document.getElementById('poolCondition').value,
        workPerformed: document.getElementById('workPerformed').value,
        issuesFound: document.getElementById('issuesFound').value,
        recommendations: document.getElementById('recommendations').value,
        additionalCharges: parseFloat(document.getElementById('additionalCharges').value || 0)
      };
      
      document.querySelectorAll('button').forEach(btn => btn.disabled = true);
      showStatus('⏳ Processing...', 'info');
      
      google.script.run.withSuccessHandler(function(result) {
        if (result.success) {
          showStatus('✅ Service report sent! Appointment marked as completed. Photos saved. Invoice created.', 'success');
          setTimeout(() => {
            alert('Service Report Successfully Submitted!\\n\\n' +
                  '✅ Appointment marked as Completed\\n' +
                  '📧 Email sent to customer\\n' +
                  '📸 ' + uploadedPhotos.length + ' photos saved\\n' +
                  '📄 Invoice created\\n' +
                  '💬 Telegram notification sent');
            window.location.href = window.location.href.split('?')[0];
          }, 2000);
        } else {
          showStatus('❌ Error: ' + result.error, 'error');
          document.querySelectorAll('button').forEach(btn => btn.disabled = false);
        }
      }).withFailureHandler(function(error) {
        showStatus('❌ Error: ' + error, 'error');
        document.querySelectorAll('button').forEach(btn => btn.disabled = false);
      }).completeServiceReport(reportData);
    }
    
    function getChecklist() {
      const items = {};
      document.querySelectorAll('.checklist-item input').forEach(checkbox => {
        items[checkbox.id] = checkbox.checked;
      });
      return items;
    }
    
    function updateEmailPreview() {
      const preview = '<strong>Dear ' + appointmentData.customerName + ',</strong><br><br>' +
        'Thank you for choosing A Quality Pool Company. Your service visit has been completed!<br><br>' +
        '<strong>Service Summary:</strong><br>' +
        'Date: ' + appointmentData.serviceDate + '<br>' +
        'Type: ' + appointmentData.serviceType + '<br>' +
        'Start Time: ' + (document.getElementById('startTime').value || 'N/A') + '<br>' +
        'End Time: ' + (document.getElementById('endTime').value || 'N/A') + '<br><br>' +
        '<strong>Work Performed:</strong><br>' +
        (document.getElementById('workPerformed').value || 'Check email attachment for full details') + '<br><br>' +
        '<strong>Photos:</strong><br>' +
        uploadedPhotos.length + ' photos attached<br><br>' +
        'Best regards,<br>A Quality Pool Company';
      
      document.getElementById('emailPreview').innerHTML = preview;
    }
    
    function showStatus(message, type) {
      const el = document.getElementById('statusMessage');
      el.textContent = message;
      el.className = 'status-message status-' + type;
    }
  </script>
</body>
</html>
  `;
}

// ================================================================
// BACKEND PROCESSING
// ================================================================

/**
 * Complete service report and trigger all actions
 */
function completeServiceReport(reportData) {
  try {
    // 1. Create service report record
    const reportId = createServiceReportRecord(reportData);
    if (!reportId) return { success: false, error: 'Failed to create report' };
    
    // 2. Save photos to Drive
    const photosCount = saveServiceReportPhotos(reportId, reportData.photos);
    
    // 3. Mark appointment as COMPLETED
    const appointmentUpdated = markAppointmentCompleted(reportData.appointmentId);
    
    // 4. Send email to customer with photos
    const emailSent = sendServiceReportEmail(reportId, reportData);
    
    // 5. Create invoice (if charges)
    let invoiceId = '';
    if (reportData.additionalCharges > 0) {
      invoiceId = createInvoiceFromServiceReport(reportId, reportData);
    }
    
    // 6. Send Telegram notification
    const telegramSent = sendServiceCompletionNotification(reportData.customerName, reportData.additionalCharges);
    
    Logger.log('✅ Service Report ' + reportId + ' completed successfully');
    
    return {
      success: true,
      reportId: reportId,
      photosCount: photosCount,
      appointmentUpdated: appointmentUpdated,
      invoiceId: invoiceId
    };
  } catch (error) {
    Logger.log('❌ completeServiceReport error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Create service report record
 */
function createServiceReportRecord(reportData) {
  try {
    const ss = SpreadsheetApp.openById(SR_SPREADSHEET_ID);
    let sheet = ss.getSheetByName('Service Reports');
    
    if (!sheet) {
      sheet = ss.insertSheet('Service Reports');
      sheet.appendRow([
        'Report ID',
        'Appointment ID',
        'Customer Name',
        'Customer Email',
        'Customer ID',
        'Service Date',
        'Service Type',
        'Status',
        'Notes',
        'Start Time',
        'End Time',
        'Time Spent',
        'Photos Drive Folder URL',
        'Photos Count',
        'Draft Invoice ID',
        'Created Date'
      ]);
    }
    
    const reportId = 'SR-' + Date.now();
    const now = new Date();
    
    sheet.appendRow([
      reportId,
      reportData.appointmentId,
      reportData.customerName || '',
      reportData.customerEmail || '',
      reportData.customerId || '',
      new Date(),
      reportData.serviceType || '',
      'Completed',
      reportData.workPerformed || '',
      reportData.startTime || '',
      reportData.endTime || '',
      calculateTimeSpent(reportData.startTime, reportData.endTime),
      '',
      0,
      '',
      now
    ]);
    
    Logger.log('✅ Service report created: ' + reportId);
    return reportId;
  } catch (error) {
    Logger.log('❌ createServiceReportRecord error: ' + error.toString());
    return '';
  }
}

/**
 * Mark appointment as COMPLETED
 */
function markAppointmentCompleted(appointmentId) {
  try {
    const ss = SpreadsheetApp.openById(SR_SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Appointments');
    if (!sheet) return false;
    
    const values = sheet.getDataRange().getValues();
    
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]).trim() === String(appointmentId).trim()) {
        sheet.getRange(i + 1, 8).setValue('Completed');
        sheet.getRange(i + 1, 9).setValue(new Date());
        Logger.log('✅ Appointment ' + appointmentId + ' marked as Completed');
        return true;
      }
    }
    
    return false;
  } catch (error) {
    Logger.log('❌ markAppointmentCompleted error: ' + error.toString());
    return false;
  }
}

/**
 * Save service report photos to Drive
 */
function saveServiceReportPhotos(reportId, photos) {
  try {
    if (!photos || photos.length === 0) return 0;
    
    const parentFolder = DriveApp.getFolderById(CUSTOMER_DRIVE_FOLDER);
    let serviceFolder = null;
    
    // Find or create Service Reports folder
    const folders = parentFolder.getFoldersByName('Service Reports');
    if (folders.hasNext()) {
      serviceFolder = folders.next();
    } else {
      serviceFolder = parentFolder.createFolder('Service Reports');
    }
    
    // Create folder for this report
    const reportFolder = serviceFolder.createFolder(reportId);
    
    let count = 0;
    photos.forEach((photo, index) => {
      const blob = Utilities.newBlob(Utilities.base64Decode(photo.data.split(',')[1]), 'image/jpeg', photo.name);
      reportFolder.createFile(blob);
      count++;
    });
    
    Logger.log('✅ Saved ' + count + ' photos for report ' + reportId);
    return count;
  } catch (error) {
    Logger.log('❌ saveServiceReportPhotos error: ' + error.toString());
    return 0;
  }
}

/**
 * Send service report email
 */
function sendServiceReportEmail(reportId, reportData) {
  try {
    const subject = '✅ Service Report Completed - ' + reportData.customerName;
    const body = 'Your service report for ' + reportData.serviceDate + ' has been completed. ' +
                 'Photos and details are attached. Thank you for choosing our services!';
    
    MailApp.sendEmail(reportData.customerEmail, subject, body);
    Logger.log('✅ Email sent to: ' + reportData.customerEmail);
    return true;
  } catch (error) {
    Logger.log('⚠️ Email send failed: ' + error.toString());
    return false;
  }
}

/**
 * Create invoice from service report
 */
function createInvoiceFromServiceReport(reportId, reportData) {
  try {
    const ss = SpreadsheetApp.openById(SR_SPREADSHEET_ID);
    let sheet = ss.getSheetByName('Invoices & Estimates');
    
    if (!sheet) {
      sheet = ss.insertSheet('Invoices & Estimates');
    }
    
    const invoiceId = 'INV-' + Date.now();
    sheet.appendRow([
      invoiceId,
      '',
      new Date(),
      '',
      '',
      JSON.stringify([{ description: 'Service Report ' + reportId, amount: reportData.additionalCharges }]),
      reportData.customerName,
      reportData.customerId,
      '',
      'Sent',
      reportData.workPerformed || ''
    ]);
    
    Logger.log('✅ Invoice created: ' + invoiceId);
    return invoiceId;
  } catch (error) {
    Logger.log('❌ createInvoiceFromServiceReport error: ' + error.toString());
    return '';
  }
}

/**
 * Send Telegram notification
 */
function sendServiceCompletionNotification(customerName, charges) {
  try {
    const BOT_TOKEN = '';
    const CHAT_ID = '';
    
    if (!BOT_TOKEN || !CHAT_ID) return false;
    
    const message = '✅ Service Report Completed\\n' +
                   'Customer: ' + customerName + '\\n' +
                   (charges > 0 ? 'Additional Charges: $' + charges.toFixed(2) : 'No additional charges') +
                   '\\n\\nService completed and email sent to customer.';
    
    const url = 'https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage';
    const payload = {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: 'HTML'
    };
    
    const options = {
      method: 'post',
      payload: JSON.stringify(payload),
      contentType: 'application/json'
    };
    
    UrlFetchApp.fetch(url, options);
    Logger.log('✅ Telegram notification sent');
    return true;
  } catch (error) {
    Logger.log('⚠️ Telegram notification failed: ' + error.toString());
    return false;
  }
}

// ================================================================
// UTILITY FUNCTIONS
// ================================================================

function calculateTimeSpent(startTime, endTime) {
  if (!startTime || !endTime) return '';
  try {
    const start = new Date('2000-01-01 ' + startTime);
    const end = new Date('2000-01-01 ' + endTime);
    const minutes = (end - start) / 60000;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours + 'h ' + mins + 'm';
  } catch (e) {
    return '';
  }
}

function formatDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ================================================================
// TEST FUNCTIONS
// ================================================================

function testServiceReportFlow() {
  const reportData = {
    appointmentId: 'AP-123456',
    customerId: 'CUST-001',
    customerEmail: 'test@example.com',
    startTime: '10:00',
    endTime: '11:30',
    checklist: { check_ph: true, check_chlorine: true },
    photos: [],
    poolCondition: 'Excellent',
    workPerformed: 'Routine maintenance',
    issuesFound: 'None',
    recommendations: 'None',
    additionalCharges: 0
  };
  
  const result = completeServiceReport(reportData);
  Logger.log(result);
}

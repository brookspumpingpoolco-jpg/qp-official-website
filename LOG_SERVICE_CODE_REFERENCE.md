# Code Locations & Reference Guide

## 📍 Frontend Code Locations

### File: `invoice-netlify/WeeklyService.html`

#### HTML Modal Structure
- **Location:** Lines 754-906
- **Content:** Complete Log Service Completion modal including:
  - Appointment selector
  - Customer info display
  - 4 tabs (Checklist, Photos, Notes, Time)
  - Upload areas with drag & drop
  - Action buttons

#### JavaScript Functions
- **Location:** Lines 1576-1800+
- **Functions:**
  - `openLogServiceModal()` - Opens modal, loads appointments
  - `closeLogServiceModal(e)` - Closes modal, clears state
  - `switchLSCTab(tabName)` - Switches between tabs
  - `loadLSCAppointments()` - Loads today's appointments
  - `selectLSCAppointment()` - Selects and loads customer
  - `searchLSCCustomers()` - Searches for customers
  - `loadLSCChecklist(poolType)` - Generates checklist
  - `fillLSCRecommendations()` - Auto-fills recommendations
  - `handleLSCPoolPhotoUpload()` - Handles pool photo upload
  - `handleLSCSaltPhotoUpload()` - Handles salt panel photo upload
  - `handleLSCPhotoUpload()` - Main photo upload handler
  - `updateLSCPhotoPreview()` - Updates photo preview
  - `removeLSCPhoto()` - Removes uploaded photo
  - `submitLogServiceCompletion()` - Validates and submits form
  - `showLSCError()` - Displays error messages

#### Initialization Code
- **Location:** Lines 2710-2730
- **Content:** Upload area event listeners registration

### Key HTML Elements

```
Modal Container:        id="logServiceCompletionModal"
Error Display:          id="logServiceError"
Appointment Selector:   id="lsc-appointmentSelector"
Service Form:           id="lsc-serviceForm"
Customer Search:        id="lsc-customerSearch"
Appointments List:      id="lsc-appointmentsList"
Search Results:         id="lsc-searchResults"

Tabs:
- Checklist:            id="lsc-checklist"
- Photos:               id="lsc-photos"
- Notes:                id="lsc-notes"
- Time:                 id="lsc-time"

Photo Uploads:
- Pool Upload Area:     id="lsc-uploadPoolArea"
- Pool Photos Display:  id="lsc-poolPhotos"
- Salt Upload Area:     id="lsc-uploadSaltArea"
- Salt Photos Display:  id="lsc-saltPhotos"
- Salt Section:         id="lsc-saltPanelSection"

Form Inputs:
- Start Time:           id="lsc-startTime"
- End Time:             id="lsc-endTime"
- Pool Condition:       id="lsc-poolCondition"
- Work Performed:       id="lsc-workPerformed"
- Issues Found:         id="lsc-issuesFound"
- Recommendations:      id="lsc-recommendations"

Info Display:
- Customer Name:        id="lsc-customerName"
- Customer Email:       id="lsc-customerEmail"
- Customer Phone:       id="lsc-customerPhone"
- Customer Address:     id="lsc-customerAddress"
- Pool Type:            id="lsc-poolType"

File Inputs:
- Pool File:            id="lsc-fileInputPool"
- Salt File:            id="lsc-fileInputSalt"
```

---

## 🔧 Backend Code Locations

### File: `invoice-netlify/SchedulingScript.gs`

#### Function 1: getTodaysAppointments()
- **Location:** Lines ~8081-8150
- **Signature:** `function getTodaysAppointments(email)`
- **Returns:** `{success: true, appointments: [...]}`
- **Purpose:** Load appointments for today + 7 days with pool details

#### Function 2: searchCustomersForServiceCompletion()
- **Location:** Lines ~8150-8220
- **Signature:** `function searchCustomersForServiceCompletion(query, companyId)`
- **Returns:** `{success: true, customers: [...]}`
- **Purpose:** Search customers by name/email

#### Function 3: logServiceCompletion()
- **Location:** Lines ~8220-8340
- **Signature:** `function logServiceCompletion(params)`
- **Returns:** `{success: true}` or `{success: false, error: "message"}`
- **Purpose:** Validate, store, and process service completion

### Function Details

**getTodaysAppointments(email)**
```javascript
// Input: User email
// Process:
//   - Gets appointments from APPOINTMENTS_SHEET
//   - Filters for today + next 7 days
//   - Retrieves pool details from customer record
//   - Sorts by service day (Mon=1 to Sun=7)
//   - Then by date and time
// Output:
//   - Array with: id, customerName, email, address, phone,
//     poolType, chemicalType, poolSize, serviceTime
```

**searchCustomersForServiceCompletion(query, companyId)**
```javascript
// Input: Search query (name or email), company ID
// Process:
//   - Searches CUSTOMERS_SHEET
//   - Partial string matching (case-insensitive)
//   - Filters by company ID
// Output:
//   - Array with: name, email, phone, address,
//     poolType, poolSize, chemicalType
```

**logServiceCompletion(params)**
```javascript
// Input: params object with:
//   - appointmentId, customerName, email, phone, address
//   - poolType, chemicalType
//   - startTime, endTime
//   - poolCondition, workPerformed, issuesFound, recommendations
//   - checklist (array), poolPhotos (array), saltPanelPhotos (array)
//   - timestamp
//
// Validation:
//   1. Check photos not empty (requires ≥1)
//   2. Detect salt system from chemicalType
//   3. If salt, require ≥1 saltPanelPhoto
//   4. Return error if validation fails
//
// Actions:
//   1. Store complete data in SERVICE_HISTORY_SHEET
//   2. Update appointment status to "Completed"
//   3. Send email to customer with report
//   4. Return success
```

---

## 📊 Data Structures

### Appointment Object (from getTodaysAppointments)
```javascript
{
  id: "APT-12345",
  customerName: "John Smith",
  email: "john@example.com",
  address: "123 Main St, City, State 12345",
  phone: "(555) 123-4567",
  poolType: "In-Ground Residential",
  chemicalType: "Salt System with Chlorine Generator",
  poolSize: "20000 gallons",
  serviceTime: "09:30 AM"
}
```

### Customer Search Result
```javascript
{
  name: "John Smith",
  email: "john@example.com",
  phone: "(555) 123-4567",
  address: "123 Main St, City, State 12345",
  poolType: "In-Ground Residential",
  poolSize: "20000 gallons",
  chemicalType: "Salt System with Chlorine Generator"
}
```

### Service Completion Form Data
```javascript
{
  appointmentId: "APT-12345",
  customerName: "John Smith",
  customerEmail: "john@example.com",
  customerPhone: "(555) 123-4567",
  address: "123 Main St, City, State 12345",
  poolType: "In-Ground Residential",
  chemicalType: "Salt System with Chlorine Generator",
  startTime: "09:30",
  endTime: "10:15",
  poolCondition: "Water crystal clear, no algae",
  workPerformed: "Brushed walls, vacuumed, tested chemicals",
  issuesFound: "Filter pressure slightly high",
  recommendations: "Inspect salt cell for buildup...",
  checklist: [
    "pH Balance (7.2-7.6)",
    "Chlorine (1-3 ppm)",
    "Brush walls",
    "Skim surface"
  ],
  poolPhotos: [
    "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
  ],
  saltPanelPhotos: [
    "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
  ],
  timestamp: "2024-01-15T10:15:00.000Z"
}
```

### Service History Sheet Row
```
Columns (order may vary):
- appointmentId
- customerName
- customerEmail
- customerPhone
- address
- poolType
- chemicalType
- poolSize
- startTime
- endTime
- poolCondition
- workPerformed
- issuesFound
- recommendations
- checklist (JSON: ["item1", "item2", ...])
- poolPhotos (base64 or links)
- saltPanelPhotos (base64 or links)
- timestamp
- completionStatus ("Completed")
```

---

## 🔗 Function Call Flow

### Opening Modal
```
User clicks button
  ↓
openLogServiceModal() called
  ↓
lscState initialized
  ↓
Modal displays
  ↓
loadLSCAppointments() called
  ↓
google.script.run.getTodaysAppointments()
  ↓
Backend retrieves appointments
  ↓
Display appointments in grid
```

### Selecting Appointment
```
User clicks appointment card
  ↓
selectLSCAppointment(id, name, email, ...) called
  ↓
lscState updated with customer data
  ↓
Detect salt system
  ↓
Populate customer info fields
  ↓
Load checklist
  ↓
Fill recommendations
  ↓
Show/hide salt panel section
  ↓
Show service form (hide selector)
```

### Submitting Form
```
User clicks "Complete Service"
  ↓
submitLogServiceCompletion() called
  ↓
Validate all fields
  ↓
Collect checklist items
  ↓
Collect form data
  ↓
Create reportData object
  ↓
google.script.run.logServiceCompletion(reportData)
  ↓
Backend validates
  ↓
Backend detects salt system
  ↓
Backend stores data
  ↓
Backend updates appointment
  ↓
Backend sends email
  ↓
Success handler executes
  ↓
Modal closes
  ↓
Page refreshes
```

---

## 🎯 State Object Reference

### lscState Object
```javascript
lscState = {
  selectedAppointmentId: "APT-123" or null,
  selectedCustomerId: "CUST-123" or null,
  customerData: {
    name: "John Smith",
    email: "john@example.com",
    address: "123 Main St",
    phone: "(555) 123-4567",
    poolType: "In-Ground",
    chemicalType: "Salt System"
  } or null,
  poolPhotos: [
    {
      name: "photo1.jpg",
      data: "data:image/jpeg;base64,...",
      type: "pool"
    }
  ],
  saltPanelPhotos: [
    {
      name: "salt_panel.jpg",
      data: "data:image/jpeg;base64,...",
      type: "salt"
    }
  ],
  isSaltSystem: true or false
}
```

---

## 🔍 CSS Classes Used

```
Modal overlay:     modal-overlay
Modal container:   modal
Tab buttons:       tab-btn, lsc-tab-btn
Tab content:       lsc-tab-content
Upload areas:      lsc-upload-area
Buttons:           btn-primary, btn-secondary, btn-sm
Forms:             form-group
```

---

## 📱 API Calls

### Frontend → Backend
```javascript
// Load appointments
google.script.run
  .withSuccessHandler(function(result) { ... })
  .withFailureHandler(function(error) { ... })
  .getTodaysAppointments();

// Search customers
google.script.run
  .withSuccessHandler(function(result) { ... })
  .withFailureHandler(function(error) { ... })
  .searchCustomersForServiceCompletion(query);

// Submit service completion
google.script.run
  .withSuccessHandler(function(result) { ... })
  .withFailureHandler(function(error) { ... })
  .logServiceCompletion(reportData);
```

---

## 🧪 Testing Code Snippets

### Test getTodaysAppointments
```javascript
// In Apps Script console:
getTodaysAppointments("user@example.com")
// Should return: {success: true, appointments: [{...}, ...]}
```

### Test searchCustomersForServiceCompletion
```javascript
// In Apps Script console:
searchCustomersForServiceCompletion("Smith", "CMP-ID")
// Should return: {success: true, customers: [{...}, ...]}
```

### Manual Modal Open
```javascript
// In browser console:
openLogServiceModal()
// Should open modal and load appointments
```

### Manual Appointment Selection
```javascript
// In browser console:
selectLSCAppointment("APT-ID", "John Smith", "john@example.com", "123 Main", "555-1234", "In-Ground", "Salt")
// Should populate form and show salt panel section
```

---

## 📋 Checklist Items (Hardcoded in loadLSCChecklist)

Standard items:
1. Visual pool inspection completed
2. Water clarity checked
3. pH level tested
4. Chlorine level tested
5. Alkalinity tested
6. Filter condition assessed
7. Pump operation checked
8. Skimmer and drains clear
9. Equipment cleaned
10. Chemicals added (if needed)
11. System parameters logged
12. Customer notified of recommendations

Additional for salt systems:
13. Salt cell inspected
14. Salt level checked

---

## 🔐 Security Notes

- Company ID filtering on all backend functions
- Input validation before data storage
- Error messages don't expose internals
- Photo storage within Sheets (no external uploads)
- Appointment ID used for status updates
- Email only sent to registered customer

---

## 📞 Support Reference

**For modal not opening:**
- Check browser console for errors
- Verify openLogServiceModal() function exists
- Check modal HTML present in WeeklyService.html

**For appointments not loading:**
- Verify getTodaysAppointments function deployed
- Check APPOINTMENTS_SHEET has data
- Verify CUSTOMERS_SHEET has pool details
- Check internet connection

**For photos not uploading:**
- Verify file is image (.jpg, .png, etc.)
- Check file size not too large
- Verify handleLSCPhotoUpload() function works

**For form not submitting:**
- Check error message displayed
- Verify all required photos uploaded
- Verify times entered in correct format
- Verify at least one checklist item checked

---

**This reference guide covers all code locations, data structures, and integration points for the Log Service Completion feature.**


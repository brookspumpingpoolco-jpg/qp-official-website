# Customers Sheet Structure Analysis

## Overview
The Customers sheet is a shared, multi-tenant data store used by multiple systems (InvoiceEstimate.gs, CustomerInfo.gs, PoolCalculator.gs, SchedulingScript.gs, etc.) to manage customer information across your business.

---

## Confirmed Column Structure

### Primary Structure (InvoiceEstimate.gs - `setupCustomersSheet()`)
The **MOST DEFINITIVE** structure with 14 columns:

| Column # | Letter | Header Name | Type | Notes |
|----------|--------|-------------|------|-------|
| 1 | A | **Company ID** | Text | Multi-tenant identifier (e.g., "CMP-AQUALITYPOOL") |
| 2 | B | **Name** | Text | Customer/company name - PRIMARY IDENTIFIER |
| 3 | C | **Email** | Text | Customer email - KEY FIELD for filtering |
| 4 | D | **Phone** | Text | Customer phone number |
| 5 | E | **Address** | Text | Street address |
| 6 | F | **City** | Text | City |
| 7 | G | **State** | Text | State abbreviation |
| 8 | H | **Zip Code** | Text | ZIP/postal code |
| 9 | I | **Notes** | Text | General notes/comments |
| 10 | J | **Created Date** | ISO DateTime | Date customer was created |
| 11 | K | **Last Updated** | ISO DateTime | Last modification timestamp |
| 12 | L | **Pool Data JSON** | JSON | Gate codes, pool type, equipment info |
| 13 | M | **Service Data JSON** | JSON | Service history, preferences, schedules |
| 14 | N | **Custom Data JSON** | JSON | Any other custom fields |

### Alternative Structure (CustomersSheetSetup.gs)
Same as above, with slight variations:
- Includes **Customer ID** as column B (in some versions)
- JSON columns same as above
- Total: 15 columns

### SchedulingScript Headers
Simpler structure (12 columns):
```
'Company ID', 'Customer ID', 'Name', 'Email', 'Phone',
'Address', 'City', 'State', 'ZIP', 'Notes', 'Created Date', 'Last Updated'
```
*(Missing the JSON columns)*

---

## Column Header Mapping Issues

### **CRITICAL ISSUE: Inconsistent Column Numbering**
Multiple setup functions contain conflicting comments about column numbers:

**InvoiceEstimate.gs - `setupCustomersSheet()` (Line 3941-3952)**
```
// Column Width Comments (INCORRECT)
sheet.setColumnWidth(1, 120);  // "Customer ID" ← WRONG! This is Company ID
sheet.setColumnWidth(2, 200);  // "Name" ← Correct
sheet.setColumnWidth(3, 220);  // "Email" ← Correct
```

The **comments are misleading** but the **actual headers in code are correct**. The headers array is:
```javascript
const headers = [
  'Company ID',      // Column 1
  'Name',            // Column 2 ← Comment says "Customer ID"
  'Email',           // Column 3 ← Correct
  'Phone',           // Column 4 ← Correct
  ...
];
```

### **SECOND ISSUE: CustomersSheetSetup.gs Has Different Structure**
This file (Cols 60-70) shows:
```javascript
const headers = [
  'Company ID',
  'Customer ID',     ← EXTRA column not in InvoiceEstimate.gs
  'Name',
  'Email',
  'Phone',
  ...
];
```

**This means there are TWO different versions of the Customers sheet in production!**

---

## How Name and Email Are Used

### Display Priority
When displaying customer information, the system uses:
1. **Name** (from column B/2) as primary display identifier
2. **Email** (from column C/3) as fallback and filtering key
3. Falls back to **"No Name"** if name is empty

**Code example from FullInspection.gs (Line 242):**
```javascript
id: idCol >= 0 ? String(row[idCol] || '').trim() : email,
name: name || 'No Name',     // Name prioritized, fallback to placeholder
email: email,
```

### Email Used For:
- **Filtering customers** by Company ID (multi-tenant isolation)
- **Matching existing customers** (duplicate detection)
- **Portal authentication** (Customer Portal sheet uses email as key)
- **Email communication** (sending invoices, portals, etc.)

### Name Used For:
- **UI Display** in customer dropdowns
- **Invoice/Estimate headers**
- **Portal welcome messages**
- **Report generation**

---

## Known Issues with Name/Email Display

### Issue 1: Missing Name Fallback
When `Name` column is empty:
- **InvoiceEstimate.gs**: Shows `"No Name"` placeholder (Line 4051)
- **FullInspection.gs**: Shows `"No Name"` placeholder (Line 242)
- **UI impact**: Customer appears as "No Name (customer@example.com)" in dropdowns

### Issue 2: Inconsistent Column Finding
Different files use different methods to locate columns:

**Method 1 - Header Index (InvoiceEstimate.gs):**
```javascript
const findColIndex = (headerName) => {
  for (let i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim().toLowerCase() === headerName.toLowerCase()) {
      return i;
    }
  }
  return -1;
};
const nameCol = findColIndex('Name');
```

**Method 2 - Direct Array.indexOf (CustomerInfo.gs):**
```javascript
const nameCol = headers.indexOf('Name');
const emailCol = headers.indexOf('Email');
```

**Issue**: Method 2 fails if headers have extra spaces or case mismatches.

### Issue 3: Missing Email Field Handling
When both Name AND Email columns are missing/empty:
- Returns empty customer object
- Skips row silently (Line 4033-4034 InvoiceEstimate.gs)

---

## Multi-Tenant Structure Issues

### Company ID Filtering
Each record includes a `Company ID` to isolate data by tenant:
- **Admin user** (samr@aqualitypool.com): Sees all companies
- **Regular user**: Sees only their company's customers

**Current Company ID values:**
- `CMP-AQUALITYPOOL` (Default/Admin)
- User-specific IDs created via `getCompanyIdForUser()`

### Problem: Mixing Different Sheet Versions
If **CustomersSheetSetup.gs** (15 cols) is used alongside **InvoiceEstimate.gs** (14 cols):
- Column B shift: Customer ID vs Name
- Entire data structure misaligns
- Name/Email lookups fail or point to wrong columns

---

## Recommendations for Fixes

### 1. Standardize Sheet Structure
**Choose ONE definitive version:**
- Option A: Keep **InvoiceEstimate.gs** version (14 cols, no Customer ID column)
- Option B: Standardize on **CustomersSheetSetup.gs** (15 cols, with Customer ID)

**Recommendation**: Use **Option A** (InvoiceEstimate.gs) as it's used by more active modules.

### 2. Fix Column Header Comments
Update misleading column width comments in InvoiceEstimate.gs to match actual headers.

### 3. Standardize Column Finding
Replace all `indexOf()` calls with case-insensitive `findColIndex()` helper function.

### 4. Add Validation on Read
When loading customers, validate:
```javascript
if (nameCol === -1 || emailCol === -1) {
  throw new Error('Required columns (Name/Email) not found in Customers sheet');
}
```

### 5. Enhance Name Display
When Name is empty but Email exists:
```javascript
const displayName = name && name.trim() 
  ? name 
  : (email ? email.split('@')[0] : 'Unknown');
```

---

## Files Using Customers Sheet

| File | Module | Key Functions | Issues |
|------|--------|---------------|--------|
| InvoiceEstimate.gs | Main Invoice System | `setupCustomersSheet()`, `getCustomersFromSheet()` | ✅ Authoritative; Has misleading comments |
| CustomersSheetSetup.gs | Initial Setup | `setupCustomersSheet()` | ⚠️ Different structure (15 cols) |
| CustomerInfo.gs | Customer Portal | `getCustomers()`, `addCustomer()` | ⚠️ Uses indexOf() (case-sensitive) |
| PoolCalculator.gs | Pool Estimator | `getCustomersFromSheet()` | ⚠️ Uses indexOf() |
| SchedulingScript.gs | Service Scheduling | `getCustomersHeaders()`, `getCustomers()` | ⚠️ Missing JSON columns |
| FullInspection.gs | Property Inspector | `getCustomersFromSheet()` | ✅ Good fallback handling |

---

## Summary Table: Name/Email Issues

| Scenario | Current Behavior | Problem Level | Impact |
|----------|-----------------|---------------|--------|
| Name empty, Email present | Shows "No Name" | Medium | Poor UX in dropdowns |
| Both Name & Email empty | Skips row silently | High | Data loss, filtering fails |
| Custom column width comments | Mislabeled | Low | Developer confusion |
| Two sheet structures in use | Column shifts | Critical | Data corruption |
| Case-sensitive header matching | Fails on extra spaces | Medium | Column not found (-1) |
| Email used for filtering | Works correctly | ✅ None | Multi-tenant isolation OK |

---

## Conclusion

**The Customers sheet exists in TWO conflicting versions:**
1. **InvoiceEstimate.gs** - 14 columns (Company ID, Name, Email, Phone, Address, City, State, Zip, Notes, Created, Updated, Pool JSON, Service JSON, Custom JSON)
2. **CustomersSheetSetup.gs** - 15 columns (adds Customer ID between Company ID and Name)

**Name/Email display issues are SECONDARY to this structural mismatch.** The primary issue is that:
- Name field is correctly identified and used
- Email field is correctly identified and used
- BUT if the wrong sheet version gets created, all column indices will be off by 1

**Immediate action needed**: Audit which sheet version is currently in your spreadsheet and standardize all code to match it.

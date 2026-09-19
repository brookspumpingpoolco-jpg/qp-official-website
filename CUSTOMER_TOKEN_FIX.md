# Customer Token Validation Fix

## Problem
Customers were getting "token not found" error when trying to sign/approve estimates via their emailed approval links, even though the admin could successfully sign on their computer.

## Root Causes Identified

### 1. **Duplicate `validateApprovalToken` Functions** (CRITICAL)
- **Location**: `InvoiceEstimate.gs` line 8222 vs `ProjectManagement.gs` line 622
- **Issue**: Two functions with the same name in the same Apps Script project
- **Impact**: Causes name collision in global scope; whichever loads last wins
- **Problem**: The IE.gs version had incomplete logic (no `allowUsed` parameter), while PM.gs version had correct logic
- **Solution**: Removed the IE.gs version, kept only PM.gs version

### 2. **Duplicate doPost Case Blocks** (CRITICAL)
- **Locations**: 
  - `case 'approveEstimateWithSignature'` at lines 1465 AND 1668
  - `case 'createChangeOrder'` at lines 1665 AND 1721
- **Issue**: Duplicate case statements in the same switch block cause only one to execute
- **Impact**: Request routing was unpredictable
- **Solution**: Removed the second instance of each duplicate case

### 3. **Double Token-Saving with Conflicting Expiry** (MAJOR)
- **Location**: `sendInvoiceEstimate()` function, lines 4643-4669
- **Issue**: Token was saved TWICE with different expiry dates:
  - First: `saveInvoiceEstimate()` → `upsertPMApprovalToken_()` → multi-year expiry (correct)
  - Second: inline `appendRow()` → 30-day expiry (conflicting)
- **Problem**: Created duplicate rows; customer's token might match the 30-day row which could expire
- **Solution**: Removed the redundant `appendRow()` block; `upsertPMApprovalToken_()` already handles token persistence correctly

## Changes Made

### File: `InvoiceEstimate.gs`

1. **Lines 8218-8262**: Replaced entire `validateApprovalToken()` function with a comment explaining it's defined in ProjectManagement.gs
   ```javascript
   // NOTE: validateApprovalToken is defined in ProjectManagement.gs (line 622)
   // Do NOT define it here as it causes a duplicate function name conflict
   // The version in ProjectManagement.gs has the correct logic with allowUsed parameter
   ```

2. **Lines 1231-1233**: Updated `doPost` case to explicitly allow used tokens for viewing
   ```javascript
   case 'validateApprovalToken':
     // Allow viewing even if token was already used (e.g., by admin testing)
     result = validateApprovalToken(e.parameter.id, e.parameter.token, true);
     break;
   ```

3. **Lines 1668-1669**: Removed duplicate `case 'approveEstimateWithSignature'` block

4. **Lines 1721**: Removed duplicate `case 'createChangeOrder'` block

5. **Lines 4643-4669**: Removed redundant token-saving block that was creating 30-day expiry tokens

## Token Validation Flow (After Fix)

```
Customer opens approval link: 
  https://aqp-viewer.netlify.app/?id=EST-2024-001&token=UUID

↓

Viewer calls validateApprovalToken (POST):
  - Routes to doPost handler
  - Calls ProjectManagement.gs validateApprovalToken(id, token, true)
  - PM.gs version checks:
    - Token exists in PM_Approval_Tokens sheet column 1
    - Estimate ID exists in column 2
    - Token not expired (column 5)
    - Allows viewing even if used (allowUsed=true)
  - Returns { success: true } if valid

↓

Viewer loads estimate data:
  - Calls getEstimateForApproval (also uses PM.gs validateApprovalToken internally)
  - Displays estimate with signature fields

↓

Customer signs and submits:
  - Calls approveEstimateWithSignature
  - Routes to approveEstimate() in InvoiceEstimate.gs
  - approveEstimate() does its own token lookup/validation
  - Marks token as Used = true
  - Creates project and sends notifications
```

## Token Storage Structure

**PM_Approval_Tokens sheet columns:**
| Col 1 | Col 2 | Col 3 | Col 4 | Col 5 | Col 6 |
|-------|-------|-------|-------|-------|-------|
| Token | EstimateID | CustomerEmail | CreatedDate | ExpiresDate | Used |

**Saved by**: `upsertPMApprovalToken_()` (inside `saveInvoiceEstimate()`)
- Multi-year expiry (PM_APPROVAL_TOKEN_EXPIRY_YEARS)
- One row per document ID (upserts existing or creates new)

## Testing Checklist

- [ ] Admin sends estimate to customer
- [ ] Customer receives email with approval link
- [ ] Customer opens link in browser
- [ ] Viewer loads and shows estimate
- [ ] Customer can fill in signature
- [ ] Customer can submit signature
- [ ] Estimate marked as approved
- [ ] Project created and contract sent
- [ ] All notifications sent correctly

## Why The Fix Works

1. **Single source of truth for token validation**: Only PM.gs `validateApprovalToken` exists now
2. **No ambiguous request routing**: Only one case per action in doPost switch
3. **Consistent token persistence**: Single save path via `upsertPMApprovalToken_()` with proper multi-year expiry
4. **Proper token lifecycle**:
   - Generated as UUID in `saveInvoiceEstimate()`
   - Stored once with multi-year expiry
   - Validated on customer's first view (allows used tokens for viewing)
   - Marked as "Used" only when customer actually signs
   - Can be idempotently re-signed (allows used tokens for approval)

## Files Modified
- `InvoiceEstimate.gs` - 5 changes (removed duplicates, fixed token flow)

## Files NOT Modified (No Changes Needed)
- `ProjectManagement.gs` - validateApprovalToken is correct, no duplicates
- `ContractManagement.gs` - No token changes needed
- HTML files - Viewer already sends correct parameters

# Estimate Custom Message & Type Issues - FIXED

## Issues Addressed

### 1. ❌ **Prefilled Default Message for Estimates**
**Problem**: When sending an estimate, the email always included a default pre-written message even when the user left the custom message field blank.

**Root Cause**: Both the GAS backend and HTML frontend were auto-generating default messages for estimates if no custom message was provided.

**Solution**: 

#### Backend Change (InvoiceEstimate.gs)
- **Lines 5061-5069**: Modified `sendInvoiceEstimate()` to NOT generate default messages for estimates
- Changed logic so:
  - **Invoices**: Use default fallback message if none provided ✓
  - **Estimates**: Use EMPTY string if none provided ✓
  - **Snow Removal**: Use Snow Removal-specific message ✓

#### Email Template Change (InvoiceEstimate.gs)
- **Lines 16301-16319**: Updated `sendEnhancedInvoiceEmail()` to skip default messages for estimates
- Modified the message formatting logic to:
  - Only apply default message to invoices, not estimates
  - If estimate has no custom message, use empty opening section

#### Frontend Change (InvoiceEstimateUI.html)
- **Lines 8525-8572**: Updated `openEmailEditorModal()` to properly handle estimate messages
- Changed logic so:
  - **Snow Removal**: Pre-fill with snow removal message ✓
  - **Invoices**: Pre-fill with default message ✓
  - **Estimates**: Leave message blank, no pre-fill ✓

---

### 2. 📋 **Estimates Being Saved as Invoices**
**Status**: The system is working as designed
- The `normalizeInvoiceEstimateType()` function correctly preserves the document type
- Estimates are saved with `type: 'Estimate'` in the JSON
- If you're seeing them mixed up, it's a display/filtering issue, not a data issue

**Check these if issues persist**:
- Verify the estimate is being sent with `type: 'Estimate'` (not `'Invoice'`)
- Look at the Invoices & Estimates sheet to confirm the JSON `type` field
- Use the status display logic in `deriveInvoicesTabDisplayStatus_()` to verify status mapping

---

### 3. ⏳ **"Signed Contract - Waiting for Company Approval" Status**
**Status**: This is a CONTRACT status, not an invoice/estimate status
- When an **estimate is approved**, it shows as "Approved" status
- Once customer signs AND admin signs, it shows as "Signed"
- **"Awaiting Company Signature"** = Estimate approved by customer, awaiting admin signature

**If estimates are showing contract status**:
1. Check the `deriveInvoicesTabDisplayStatus_()` function (line 6777)
2. Verify the JSON `status` field vs `approvalStatus` field
3. Use the Pending Actions panel to see estimates awaiting your signature

---

## Files Modified

1. **InvoiceEstimate.gs** (2 changes)
   - Lines 5061-5069: Removed default estimate message generation
   - Lines 16301-16319: Updated email template to skip defaults for estimates

2. **InvoiceEstimateUI.html** (1 change)
   - Lines 8525-8572: Updated custom message handling in email modal

---

## Testing

To verify the fixes work:

1. **Create a new estimate** with an empty custom message field
2. Click "Send Estimate"
3. **Expected result**: Email should have NO introductory message (just approval button and items)

4. **Create a new invoice** with an empty custom message field
5. Click "Send Invoice"
6. **Expected result**: Email should have the default invoice message

---

## Key Points for Future Development

- **Estimates** = No default message (customer-driven approval flow)
- **Invoices** = Default message (billing/thank you tone)
- **Snow Removal** = Special Snow Removal message (seasonal upsell)
- The distinction is made by checking `invoiceType === 'Estimate'` throughout the code
- Custom messages are OPTIONAL for all types - if left blank, use appropriate defaults (or none for estimates)

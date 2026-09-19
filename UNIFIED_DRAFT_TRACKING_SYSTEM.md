# Unified Draft Text Tracking System

## Overview

All draft text notifications sent to Brooks (invoices, confirmations, and reviews) now use an **automatic batch tracking system**. When Brooks clicks the "Open Draft Text" button in Telegram:

1. ✅ SMS app opens automatically with the prefilled message
2. ✅ The draft item is instantly marked as "opened" with a timestamp
3. ✅ No extra clicks or external links needed

This works for:
- **Invoice draft texts** (sent when invoices are sent from appointments)
- **Confirmation draft texts** (sent via daily confirmation workflow)
- **Review draft texts** (sent when requesting customer reviews)

---

## How It Works

### The One-Click Workflow

```
User Action:
   Click "Open Draft Text" button in Telegram
   ↓
System:
   1. Records the batch token + appointment ID
   2. Extracts phone number and prefilled message
   3. Marks draft as "opened" with timestamp
   4. Redirects to SMS app automatically
   ↓
Result:
   SMS app opens with message ready to send
   Draft is marked complete in the batch
```

### Batch Tracking Architecture

Each draft type has its own batch system with a unique property key prefix:

| Batch Type | Property Key Prefix | Function to Create |
|------------|-------------------|-------------------|
| **Invoice** | `invoiceDraftBatch_` | `createInvoiceDraftBatch_()` |
| **Confirmation** | `confirmationDraftBatch_` | `createConfirmationDraftBatch_()` |
| **Review** | `reviewDraftBatch_` | `createReviewDraftBatch_()` |

All batches stored in Google Script Properties for persistence across sessions.

---

## Detailed Workflow by Type

### 1. Invoice Draft Texts

**Trigger**: When an invoice is sent from appointment details
- `sendInvoiceEmail(invoiceId, customerEmail, customMessage, appointmentId)`
- `sendInvoiceWithStripe(invoiceId, customerEmail, appointmentId)`

**Process**:
1. `sendInvoiceTelegramDraftForAppointment_()` called
2. Calls `createInvoiceDraftBatch_()` with invoice/appointment details
3. Returns batch token
4. Calls `sendBrooksTelegramDraftWithTracking_(..., batchType='invoice')`
5. SMS button URL includes batch token: `action=openInvoiceDraftSms&batchToken=[token]&appointmentId=[id]`

**When Clicked**:
- `doPost` handler catches `action=openInvoiceDraftSms`
- Calls `markInvoiceDraftOpened_(batchToken, appointmentId)`
- Updates batch in Script Properties with `openedAt` timestamp
- Redirects to `renderSmsRedirectPage_(phone, body, name)`

---

### 2. Confirmation Draft Texts

**Trigger**: When appointment confirmation is sent to Brooks
- Individual sends: `sendAppointmentConfirmationToStaff(appointmentId)`
- Daily batch: `sendDailyConfirmationTexts()` with `sendIndividual=true`

**Process**:
1. `sendAppointmentConfirmationToStaff()` called
2. Calls `createConfirmationDraftBatch_()` with appointment details
3. Returns batch token
4. Calls `sendBrooksTelegramDraftWithTracking_(..., batchType='confirmation')`
5. SMS button URL: `action=openConfirmationDraftSms&batchToken=[token]&appointmentId=[id]`

**When Clicked**:
- `doPost` handler catches `action=openConfirmationDraftSms`
- Calls `markConfirmationDraftOpened_(batchToken, appointmentId)`
- Updates batch, redirects to SMS

---

### 3. Review Draft Texts

**Trigger**: When a review request is sent to Brooks
- Individual: `sendReviewTextToBrooks(appointmentId)`
- Daily batch: `sendDailyReviewRequests(targetDate, email)`

**Process**:
1. `sendReviewTextToBrooks()` called
2. Calls `createReviewDraftBatch_()` with customer/service details
3. Returns batch token
4. Calls `sendBrooksTelegramDraftWithTracking_(..., batchType='review')`
5. SMS button URL: `action=openReviewDraftSms&batchToken=[token]&appointmentId=[id]`

**When Clicked**:
- `doPost` handler catches `action=openReviewDraftSms`
- Calls `markReviewDraftOpened_(batchToken, appointmentId)`
- Updates batch, redirects to SMS

---

## API Reference

### Batch Creation Functions

#### `createInvoiceDraftBatch_(invoiceId, appointmentId, customerName, customerEmail, customerPhone, serviceType, date, time)`
Creates an invoice draft batch.
- **Returns**: Batch object with token
- **Storage**: Script Properties via `invoiceDraftBatch_[token]`

#### `createConfirmationDraftBatch_(appointmentId, customerName, customerPhone, serviceType, date, time)`
Creates a confirmation draft batch.
- **Returns**: Batch object with token
- **Storage**: Script Properties via `confirmationDraftBatch_[token]`

#### `createReviewDraftBatch_(appointmentId, customerName, customerPhone, customerEmail, serviceType, date)`
Creates a review draft batch.
- **Returns**: Batch object with token
- **Storage**: Script Properties via `reviewDraftBatch_[token]`

### Batch Marking Functions

#### `markInvoiceDraftOpened_(token, appointmentId)`
Marks an invoice draft as opened with current timestamp.
- **Parameters**: 
  - `token`: Batch token
  - `appointmentId`: Appointment ID to mark
- **Returns**: `{success: true/false, changed: boolean}`

#### `markConfirmationDraftOpened_(token, appointmentId)`
Marks a confirmation draft as opened.

#### `markReviewDraftOpened_(token, appointmentId)`
Marks a review draft as opened.

### Batch Load/Save Functions

All types have these utility functions:
- `loadInvoiceDraftBatch_(token)` / `saveInvoiceDraftBatch_(batch)`
- `loadConfirmationDraftBatch_(token)` / `saveConfirmationDraftBatch_(batch)`
- `loadReviewDraftBatch_(token)` / `saveReviewDraftBatch_(batch)`

### Telegram Send Function

#### `sendBrooksTelegramDraftWithTracking_(appointmentId, batchToken, draftText, customerPhone, customerName, notificationType, title, facts, linkLabel, linkUrl, batchType)`
Sends Telegram draft with tracked SMS button.
- **Parameters**:
  - `batchType`: `'invoice'`, `'confirmation'`, or `'review'`
  - `batchToken`: Token from batch creation
  - `draftText`: Prefilled SMS message text
  - `customerPhone`: Customer phone number
  - Other params same as `sendBrooksTelegramDraft_()`
- **Returns**: `{success: true/false, message: string}`
- **Behavior**: Constructs SMS button URL with batch token, sends Telegram draft with two buttons:
  - "Open Draft Text" → tracked URL that marks as opened then opens SMS
  - Link button (if provided) → direct link to invoice/payment

---

## Batch Data Structure

All batches follow this structure:

```javascript
{
  token: "abc123def456...",        // Unique batch identifier
  createdAt: "2026-05-12T14:30:00.000Z",
  items: [
    {
      appointmentId: "appt-xyz",
      // Invoice batch additional fields:
      invoiceId: "inv-123",
      customerEmail: "john@example.com",
      
      // Common fields:
      customerName: "John Smith",
      customerPhone: "+15025551234",
      serviceType: "Pool Cleaning",
      date: "2026-05-15",
      time: "10:00 AM",
      
      sentAt: "2026-05-12T14:30:00.000Z",
      openedAt: "2026-05-12T14:35:20.000Z"  // Set when link clicked
    }
  ]
}
```

---

## URL Parameters

When SMS button is clicked, the tracking URL includes:

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `action` | `openInvoiceDraftSms` \| `openConfirmationDraftSms` \| `openReviewDraftSms` | Identifies action type |
| `batchToken` | UUID string | Looks up batch in Script Properties |
| `appointmentId` | Appointment ID | Finds item in batch to mark opened |
| `phone` | E.164 format | Customer phone for SMS redirect |
| `body` | URL-encoded text | Prefilled SMS message |
| `name` | URL-encoded name | Customer name for display |

**Example URL**:
```
https://script.google.com/macros/s/[PROJECT_ID]/usurp?
action=openReviewDraftSms&
batchToken=a1b2c3d4e5f6&
appointmentId=appt-123&
phone=%2B15025551234&
body=Hey%20John...&
name=John%20Smith
```

---

## Action Handlers in doPost

Three new action handlers in the `doPost` function:

```javascript
// Handle invoice draft SMS redirect with batch tracking
if (e && e.parameter && e.parameter.action === 'openInvoiceDraftSms') {
  markInvoiceDraftOpened_(batchToken, appointmentId);
  return renderSmsRedirectPage_(phone, body, name);
}

// Handle confirmation draft SMS redirect with batch tracking
if (e && e.parameter && e.parameter.action === 'openConfirmationDraftSms') {
  markConfirmationDraftOpened_(batchToken, appointmentId);
  return renderSmsRedirectPage_(phone, body, name);
}

// Handle review draft SMS redirect with batch tracking
if (e && e.parameter && e.parameter.action === 'openReviewDraftSms') {
  markReviewDraftOpened_(batchToken, appointmentId);
  return renderSmsRedirectPage_(phone, body, name);
}
```

---

## User Experience

### From Brooks' Perspective

1. **Receives Telegram message** with appointment/invoice/review details
2. **Sees two buttons**:
   - "Open Draft Text" (blue, tracked SMS button)
   - "Open invoice/payment/link" (direct link)
3. **Clicks "Open Draft Text"**
4. **Page loads briefly** showing "Opening Messages..." spinner
5. **SMS app opens automatically** with prefilled message
6. **Message appears ready to send**
7. **Brooks types any additional notes** (optional)
8. **Hits send in SMS app**

### Backend Tracking

- When step 3 occurs, the batch in Script Properties is updated with `openedAt` timestamp
- This happens **before** the SMS app opens
- No additional steps required from user
- Single click handles: marking complete + opening SMS

---

## Advantages

✅ **Unified System**: Same batch tracking pattern for invoices, confirmations, and reviews

✅ **One-Click Workflow**: Single tap → SMS opens + item marked complete

✅ **Automatic Tracking**: No manual checkoff; happens on link click

✅ **Persistent Storage**: Batch data in Script Properties survives sessions

✅ **Non-Blocking**: If batch tracking fails, SMS still opens (graceful degradation)

✅ **Flexible Batch Type**: `batchType` parameter allows easy extension to other notifications

✅ **Backward Compatible**: Existing non-tracked paths still work unchanged

---

## Implementation Details

### Storage Pattern

All batches stored in Google Script Properties:
- **Key format**: `[batchType]DraftBatch_[token]`
- **Value**: JSON stringified batch object
- **Persistence**: Survives script execution, available across all users

### Error Handling

- **Missing batch**: Marks as opened returns `{success: false, error: 'Batch not found'}` but SMS still opens
- **Invalid appointment ID**: No batch update, but SMS still opens via `renderSmsRedirectPage_`
- **Phone number missing**: Batch still created; user can manually copy/paste from SMS preview page
- **Telegram send fails**: Non-blocking; batch tracking not affected

### Timestamp Format

All timestamps stored as ISO 8601 strings:
```javascript
new Date().toISOString()  // Returns: "2026-05-12T14:35:20.123Z"
```

---

## Future Enhancements

1. **Batch Checklist Pages**: Render a checklist page for each batch showing opened/pending status
2. **Resend After X Hours**: Automatically resend if draft hasn't been opened
3. **Batch Analytics**: Export all batch data for reporting on draft text delivery rates
4. **Batch Expiration**: Auto-delete old batches after 30 days
5. **Multi-Item Batches**: Create single batch for multiple appointment drafts sent in one action

---

## Testing Checklist

- [ ] Send invoice from appointment → Verify batch created in Script Properties
- [ ] Click "Open Draft Text" → Verify SMS app opens
- [ ] Check batch in Script Properties → Verify `openedAt` timestamp set
- [ ] Send confirmation → Verify confirmation batch created
- [ ] Send review request → Verify review batch created
- [ ] Test with missing phone → Verify SMS preview page shows instead
- [ ] Test with invalid batch token → Verify SMS still opens (graceful fallback)

---

## Code Files Modified

- `/Users/joellmatteson/Desktop/The Official Website/invoice-netlify/SchedulingScript.gs`
  - Added batch system functions (3 types × 4-5 functions = ~15 new functions)
  - Updated `sendInvoiceTelegramDraftForAppointment_()` to use batches
  - Updated `sendReviewTextToBrooks()` to use batches
  - Updated `sendAppointmentConfirmationToStaff()` to use batches
  - Updated `sendBrooksTelegramDraftWithTracking_()` with `batchType` parameter
  - Added 3 new action handlers in `doPost`

---

## Related Documentation

See also:
- `INVOICE_DRAFT_TRACKING_SYSTEM.md` - Original invoice-only implementation (now superseded by unified system)
- Telegram Bot API docs: https://core.telegram.org/bots/api
- Google Script Properties: https://developers.google.com/apps-script/reference/properties/properties-service

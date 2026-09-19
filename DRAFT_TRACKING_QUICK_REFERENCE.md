# Draft Text Tracking - Quick Reference

## One-Click Workflow

```
📱 Telegram Message Received
  ├─ Invoice draft
  ├─ Confirmation draft
  └─ Review request draft
     │
     ↓
   [Open Draft Text Button]  ← Single click
     │
     ├─ 🔗 Batch token validated
     ├─ ⏰ Timestamp recorded  
     ├─ ✅ Draft marked "opened"
     │
     ↓
   📲 SMS App Opens
  ├─ Message prefilled
  ├─ Ready to type & send
  └─ Done ✓
```

---

## Implementation Overview

### Three Notification Types

```
┌─────────────────────────────────────────────────────────┐
│                  DRAFT TEXT TRACKING                    │
├──────────────────┬──────────────────┬──────────────────┤
│     INVOICES     │  CONFIRMATIONS   │     REVIEWS      │
├──────────────────┼──────────────────┼──────────────────┤
│ Sent by:         │ Sent by:         │ Sent by:         │
│ • sendInvoice    │ • sendAppointment│ • sendReviewText │
│   Email()        │   Confirmation() │   ToBrooks()     │
│ • sendInvoice    │                  │                  │
│   WithStripe()   │ Batch Prefix:    │ Batch Prefix:    │
│                  │ confirmationDraft│ reviewDraftBatch_│
│ Batch Prefix:    │ Batch_           │                  │
│ invoiceDraftBatch│                  │ Action:          │
│ _                │ Action:          │ openReviewDraft  │
│                  │ openConfirm      │ Sms              │
│ Action:          │ ationDraftSms    │                  │
│ openInvoiceDraft │                  │                  │
│ Sms              │                  │                  │
└──────────────────┴──────────────────┴──────────────────┘
```

### Batch Creation Flow

```
Trigger Event
    │
    ├─ CREATE BATCH
    │  └─ Generate UUID token
    │  └─ Store appointment/invoice/review details
    │  └─ Save to Script Properties
    │  └─ Return batch token
    │
    ├─ SEND TELEGRAM
    │  └─ Build card with details
    │  └─ Create tracked SMS button
    │  └─ Embed batch token in URL
    │  └─ Send to Brooks
    │
    └─ READY FOR CLICK
```

### Click-to-Mark Flow

```
User Clicks "Open Draft Text"
    │
    ├─ URL PROCESSED
    │  └─ Extract: action, batchToken, appointmentId
    │
    ├─ BATCH UPDATED
    │  └─ Load batch from Script Properties
    │  └─ Find appointment by ID
    │  └─ Set openedAt = now()
    │  └─ Save batch back
    │
    ├─ SMS OPENED
    │  └─ Render loading spinner
    │  └─ Auto-redirect: sms://+phone?body=message
    │  └─ Show fallback button if needed
    │
    └─ COMPLETE
       └─ Draft marked ✓
       └─ SMS app open ✓
```

---

## Database Schema

### Batch Objects (Stored in Script Properties)

```
Key: [TYPE]DraftBatch_[TOKEN]
Value: {
  token: "a1b2c3d4...",
  createdAt: "2026-05-12T14:30:00.000Z",
  items: [
    {
      appointmentId: "appt-xyz",
      
      // INVOICE batch fields:
      invoiceId: "inv-123",
      customerEmail: "john@example.com",
      
      // COMMON fields (all types):
      customerName: "John Smith",
      customerPhone: "+15025551234",
      serviceType: "Pool Cleaning",
      date: "2026-05-15",
      time: "10:00 AM",
      
      // TRACKING (all types):
      sentAt: "2026-05-12T14:30:00.000Z",
      openedAt: "2026-05-12T14:35:20.000Z"  ← FILLED WHEN CLICKED
    }
  ]
}
```

---

## Function Reference

### Create Batch (1 of 3)

| Function | Type | Returns |
|----------|------|---------|
| `createInvoiceDraftBatch_(invoiceId, appointmentId, customerName, customerEmail, customerPhone, serviceType, date, time)` | invoice | Batch object with token |
| `createConfirmationDraftBatch_(appointmentId, customerName, customerPhone, serviceType, date, time)` | confirmation | Batch object with token |
| `createReviewDraftBatch_(appointmentId, customerName, customerPhone, customerEmail, serviceType, date)` | review | Batch object with token |

### Mark as Opened (1 of 3)

| Function | Type |
|----------|------|
| `markInvoiceDraftOpened_(token, appointmentId)` | invoice |
| `markConfirmationDraftOpened_(token, appointmentId)` | confirmation |
| `markReviewDraftOpened_(token, appointmentId)` | review |

### Send with Tracking

```javascript
sendBrooksTelegramDraftWithTracking_(
  appointmentId,          // "appt-xyz"
  batchToken,             // "a1b2c3d4..."
  draftText,              // "Hey John! Thanks for..."
  customerPhone,          // "+15025551234"
  customerName,           // "John Smith"
  notificationType,       // "invoice_send_text" etc
  title,                  // "Invoice draft text"
  facts,                  // [{label, value}, ...]
  linkLabel,              // "Open invoice"
  linkUrl,                // "https://..."
  batchType               // "invoice"|"confirmation"|"review"
)
```

---

## URL Examples

### Invoice Draft SMS Button
```
https://script.google.com/macros/s/[PROJECT_ID]/usurp?
  action=openInvoiceDraftSms&
  batchToken=abc123def456&
  appointmentId=appt-xyz&
  phone=%2B15025551234&
  body=Hey%20John%21%20We%20sent%20Invoice%20%23123&
  name=John%20Smith
```

### Confirmation Draft SMS Button
```
https://script.google.com/macros/s/[PROJECT_ID]/usurp?
  action=openConfirmationDraftSms&
  batchToken=xyz789abc123&
  appointmentId=appt-456&
  phone=%2B15025551234&
  body=Hi%20John%21%20Confirming%20your%20pool%20cleaning&
  name=John%20Smith
```

### Review Draft SMS Button
```
https://script.google.com/macros/s/[PROJECT_ID]/usurp?
  action=openReviewDraftSms&
  batchToken=def456ghi789&
  appointmentId=appt-789&
  phone=%2B15025551234&
  body=Hey%20John%21%20Leave%20us%20a%20review&
  name=John%20Smith
```

---

## Error Handling

```
├─ Missing batch in properties
│  └─ Batch not found error logged
│  └─ SMS still opens (graceful fallback)
│
├─ Invalid appointment ID in batch
│  └─ Item not found in batch
│  └─ SMS still opens
│
├─ Missing phone number
│  └─ Batch created successfully
│  └─ SMS preview page shows instead
│  └─ Message visible for manual copy
│
└─ Telegram send fails
   └─ Batch tracking unaffected
   └─ User still gets SMS redirect
```

---

## Implementation Checklist

✅ Invoice batch system created
✅ Confirmation batch system created
✅ Review batch system created
✅ `sendBrooksTelegramDraftWithTracking_()` enhanced with batchType
✅ Invoice send updated to use batch tracking
✅ Confirmation send updated to use batch tracking
✅ Review send updated to use batch tracking
✅ `doPost` handlers for all three action types added
✅ SMS redirect page renders with spinner
✅ Batch persistence in Script Properties
✅ Error handling for all failure scenarios
✅ Backward compatibility maintained
✅ Code validation passed (no errors)

---

## Testing Commands

```javascript
// Test creating an invoice batch
var batch = createInvoiceDraftBatch_('inv-123', 'appt-456', 'John Smith', 'john@example.com', '+15025551234', 'Pool Cleaning', '2026-05-15', '10:00 AM');
Logger.log(batch);

// Test loading the batch
var loaded = loadInvoiceDraftBatch_(batch.token);
Logger.log(loaded);

// Test marking as opened
var result = markInvoiceDraftOpened_(batch.token, 'appt-456');
Logger.log(result);

// Verify openedAt timestamp
var updated = loadInvoiceDraftBatch_(batch.token);
Logger.log(updated.items[0].openedAt);  // Should be set!
```

---

## Deployment Notes

1. **No database migrations needed** - Uses existing Script Properties
2. **No new external APIs** - Uses existing Telegram bot
3. **No UI changes needed** - Works behind the scenes
4. **Backward compatible** - All existing functions still work
5. **No breaking changes** - Optional batchType parameter

Deploy and start using immediately!

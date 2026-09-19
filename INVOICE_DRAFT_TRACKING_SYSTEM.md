# Invoice Draft Text Tracking System

## Overview

When invoices are sent from appointment details, the system now automatically creates a batch tracking record and sends a Telegram draft message to Brooks. When Brooks clicks the "Open Draft Text" button, the system **automatically marks it as opened** and redirects to the Messages app without requiring separate link clicks.

## How It Works

### 1. **Invoice Sent → Batch Created**
When an invoice is sent from an appointment (`sendInvoiceEmail()` or `sendInvoiceWithStripe()`), the `sendInvoiceTelegramDraftForAppointment_()` function:
- Creates a new invoice draft batch with a unique token
- Stores appointment details (name, phone, email, service, date/time)
- Stores the created timestamp
- Returns the batch token

### 2. **Telegram Draft Sent with Tracking**
The new `sendBrooksTelegramDraftWithTracking_()` function:
- Builds a tracking URL for the SMS button that includes the batch token
- The URL format: `https://[webapp-url]?action=openInvoiceDraftSms&batchToken=[token]&appointmentId=[id]&phone=[phone]&body=[body]&name=[name]`
- Sends the Telegram draft to Brooks with two buttons:
  - **"Open Draft Text"** → Calls the tracking URL
  - **"Open invoice/Open payment link"** → Links to invoice/payment

### 3. **Link Clicked → Auto-Marked as Opened**
When Brooks clicks the "Open Draft Text" button:
1. The tracking URL is called with the batch token and appointment ID
2. The `doPost` handler catches the `action=openInvoiceDraftSms` event
3. `markInvoiceDraftOpened_(batchToken, appointmentId)` is called
4. The batch in Script Properties is updated with `openedAt` timestamp
5. The page automatically redirects to the SMS app with the prefilled message

### 4. **No Extra Clicks**
- One click on the Telegram button → SMS app opens automatically
- The draft item is immediately marked as opened in the batch
- No need to open multiple links or manually check off items

## Batch Structure

Invoice draft batches are stored in Google Script Properties with this structure:

```javascript
{
  token: "abc123...",  // Unique batch identifier
  createdAt: "2026-05-12T14:30:00.000Z",
  items: [
    {
      appointmentId: "appt-xyz",
      invoiceId: "inv-123",
      customerName: "John Smith",
      customerEmail: "john@example.com",
      customerPhone: "+15025551234",
      serviceType: "Pool Cleaning",
      date: "2026-05-15",
      time: "10:00 AM",
      sentAt: "2026-05-12T14:30:00.000Z",
      openedAt: "2026-05-12T14:35:20.000Z"  // Set when draft link is clicked
    }
  ]
}
```

## Key Functions

### Invoice Batch Management
- **`createInvoiceDraftBatch_(invoiceId, appointmentId, customerName, customerEmail, customerPhone, serviceType, date, time)`**
  - Creates a new batch with a unique token
  - Stores in Script Properties
  - Returns the batch object

- **`loadInvoiceDraftBatch_(token)`**
  - Retrieves batch from Script Properties by token
  - Returns null if not found

- **`saveInvoiceDraftBatch_(batch)`**
  - Persists batch to Script Properties
  - Called when marking items as opened

- **`markInvoiceDraftOpened_(token, appointmentId)`**
  - Finds item in batch by appointmentId
  - Sets `openedAt` timestamp
  - Saves batch back to properties

### Telegram Send with Tracking
- **`sendBrooksTelegramDraftWithTracking_(appointmentId, batchToken, draftText, customerPhone, customerName, notificationType, title, facts, linkLabel, linkUrl)`**
  - Builds SMS button URL with batch token
  - Sends Telegram draft with tracked buttons
  - Called by `sendInvoiceTelegramDraftForAppointment_()`

### Action Handler
- **`doPost` action handler for `action=openInvoiceDraftSms`**
  - Processes the tracking URL click
  - Marks draft as opened
  - Redirects to SMS app via `renderSmsRedirectPage_()`

## Advantages

✅ **One-Click Workflow**: Click the draft button → SMS app opens → Item marked as done (no extra steps)

✅ **Automatic Tracking**: No manual checkoff required; happens automatically when link is clicked

✅ **Batch Persistence**: All invoice draft data stored in Script Properties for auditing/reference

✅ **Non-Blocking**: If Telegram send fails, the invoice still sends successfully

✅ **Parity with Daily Confirmations**: Uses same batch tracking pattern as the existing daily confirmation workflow

## Future Enhancement Opportunities

- Create a batch checklist page showing all invoice drafts sent and their status (opened/pending)
- Add ability to resend SMS to drafts that haven't been opened after X hours
- Export batch data for reporting on draft text delivery rates

## Technical Details

**Storage Location**: Google Script Properties
- Key prefix: `invoiceDraftBatch_`
- Full key: `invoiceDraftBatch_[batchToken]`
- Data format: JSON string

**URL Parameters**:
- `action=openInvoiceDraftSms` - Identifies this as an invoice draft SMS redirect
- `batchToken` - Unique batch identifier
- `appointmentId` - Appointment ID to mark as opened
- `phone` - Customer phone number
- `body` - SMS message body
- `name` - Customer name for display

**SMS Redirect Page**:
The `renderSmsRedirectPage_()` function creates an HTML page that:
1. Immediately redirects to `sms://[phone]?body=[message]`
2. Shows a spinner while redirecting
3. Provides manual "Tap to Open Messages" button as fallback
4. Displays preview of the message being sent

# Fix for 502 Bad Gateway - "This operation was aborted"

## Issue Summary
When sending invoices via the Netlify gas-proxy function, users were receiving a 502 (Bad Gateway) error with the message "This operation was aborted". This occurred because:

1. **Timeout too short**: The Netlify gas-proxy had a 25-second timeout, but PDF generation + email operations often take longer
2. **Missing error context**: When a timeout occurred, the error message was not clear to users
3. **Frontend timeout too short**: The browser fetch didn't have a custom timeout, relying on browser defaults

## Root Cause
The `sendEmailWithCustomization()` → `sendInvoiceEstimate()` function in Google Apps Script:
- Calls `generateAndSavePDF()` which is synchronous and can take 10-40+ seconds depending on invoice complexity
- Generates attachments
- Sends emails
- Updates sheets

These operations can easily exceed 25 seconds, causing the Netlify proxy to timeout before the GAS backend completes its work.

## Changes Made

### 1. **gas-proxy.mjs** - Increased timeout from 25s to 55s
**File**: `/invoice-netlify/netlify/functions/gas-proxy.mjs`

- Changed GET timeout: `25000ms` → `55000ms` (55 seconds)
- Changed POST timeout: `25000ms` → `55000ms` (55 seconds)
- Added specific abort error handling that returns a 504 status with a clear timeout message
- This gives long PDF generation operations enough time to complete

### 2. **InvoiceEstimateUI.html** - Added 60-second browser timeout
**File**: `/invoice-netlify/InvoiceEstimateUI.html`

Lines 20501-20530: Added AbortController with 60-second timeout to fetch request
- Provides explicit timeout handling on the client side
- Ensures the browser doesn't wait forever if the server is stuck
- Gives 5 seconds of buffer between proxy (55s) and browser (60s)

### 3. **InvoiceEstimateUI.html** - Improved error messages
**File**: `/invoice-netlify/InvoiceEstimateUI.html`

Lines 20665-20673: Enhanced error detection and messaging
- Detects timeout errors specifically with helpful suggestions
- Explains possible causes (complex PDFs, large attachments, slow server)
- Directs users to check Google Apps Script logs

Lines 20684-20697: Better exception handling
- Detects AbortError (timeout) vs network errors vs other exceptions
- Provides specific guidance for timeout scenarios
- Shows 60-second timeout message to users
- Instructs users to check GAS logs

## Testing & Deployment

### After deploying these changes:

1. **Redeploy Netlify**:
   ```bash
   cd /Users/joellmatteson/Desktop/The\ Official\ Website/invoice-netlify
   netlify deploy
   ```

2. **Test with complex invoices** - Try sending an invoice with:
   - Many line items (20+)
   - Multiple attachments
   - Processing fees enabled
   - Long custom messages

3. **Monitor logs**:
   - Browser console (F12) should show clearer timeout messages
   - Check Google Apps Script logs at script.google.com for any 6-minute GAS timeouts

## Timeline

- **25s (original)**: Netlify gas-proxy timeout
- **55s**: NEW Netlify gas-proxy timeout
- **60s**: NEW Browser fetch timeout
- **360s (6 min)**: Google Apps Script hard timeout

This gives operations adequate time while still failing gracefully if something gets stuck.

## Notes

- If users still experience timeouts, they may need to simplify invoices or break large operations into smaller ones
- Monitor Netlify function logs for patterns: `https://app.netlify.com/sites/aesthetic-kataifi-88ba27/functions`
- Check Google Apps Script logs for the actual error if operation fails: Apps Script → Executions

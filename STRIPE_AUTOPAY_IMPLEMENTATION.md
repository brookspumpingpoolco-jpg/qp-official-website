# Stripe Autopay Implementation - Complete

## Summary
The Stripe autopay subscription payment link feature has been fully implemented for weekly pool service contracts. When a contract is sent, customers receive a professional HTML email with two action buttons:
1. **Review & Sign Agreement** - Links to the contract signing page
2. **Set Up Autopay** - Links to a Stripe checkout session for recurring subscription setup

## Implementation Details

### Files Modified
- **SchedulingScript.gs** - Backend Google Apps Script
- **WeeklyService.html** - UI for managing contracts

### New Functions Added

#### 1. `createStripePaymentLink_(customerEmail, customerName, pricePerVisit, frequency)` (Lines 7603-7680)
Creates a Stripe checkout session for recurring subscription setup.

**Parameters:**
- `customerEmail` - Customer's email address
- `customerName` - Customer's full name
- `pricePerVisit` - Price per service visit (e.g., 150)
- `frequency` - 'weekly' or 'biweekly'

**Returns:** 
- Stripe checkout URL string or empty string on error

**Flow:**
1. Validates Stripe API key is configured
2. Converts frequency to Stripe interval (weekly=1 week, biweekly=2 weeks)
3. Creates or retrieves Stripe customer
4. Creates checkout session with recurring subscription pricing
5. Returns payment link URL

**Example:**
```javascript
const stripeUrl = createStripePaymentLink_(
  'john@example.com',
  'John Smith',
  150,
  'weekly'
);
// Returns: https://checkout.stripe.com/pay/cs_live_xxxxx
```

#### 2. `getOrCreateStripeCustomer_(email, name)` (Lines 7682-7739)
Gets existing Stripe customer or creates a new one.

**Parameters:**
- `email` - Customer email (required)
- `name` - Customer name (optional)

**Returns:**
- Stripe customer ID string or null on error

**Flow:**
1. Searches Stripe for customer by email
2. Returns ID if found
3. Creates new customer if not found
4. Returns new customer ID

#### 3. `sendWeeklyContractEmail_(contract, signingUrl, stripeLink)` (Lines 7523-7594)
Sends professionally formatted HTML email to customer with contract details and action buttons.

**Parameters:**
- `contract` - Contract object with customerEmail, customerName, frequency, pricePerVisit, serviceDay
- `signingUrl` - URL to sign the contract
- `stripeLink` - URL to Stripe checkout (optional)

**Returns:** Boolean (true if sent, false if error)

**Email Template Features:**
- Professional header with company logo and branding
- Service details display (frequency, price, service day)
- Two action buttons:
  - "Review & Sign Agreement" (blue button, always shown)
  - "Set Up Autopay" (purple button, only if stripeLink provided)
- Next steps section with numbered instructions
- Company contact information in footer
- Responsive design for mobile/desktop

### Updated Functions

#### `sendWeeklyServiceContract(contractId)` (Lines 7747-7805)
Enhanced to generate Stripe payment link and send email to customer.

**New Flow:**
1. ✅ Retrieve contract data
2. ✅ Generate PDF version of contract
3. ✅ Generate signing token and URL
4. ✅ Update contract status to 'Sent'
5. ✅ **Generate Stripe payment link** (NEW)
6. ✅ **Send email with both signing and Stripe links** (NEW)
7. ✅ Send Telegram notification to admin

**Success Response:**
```javascript
{
  success: true,
  signingUrl: "https://aqualitypoolcompanyusa.com/sign?token=...",
  pdfUrl: "https://drive.google.com/...",
  stripeLink: "https://checkout.stripe.com/pay/cs_live_xxxxx"
}
```

**Error Handling:**
- Stripe link generation is non-blocking (email sends even if Stripe fails)
- Email send is critical (will return error if it fails)
- Telegram notification is non-blocking

### API Routes

#### POST /sendWeeklyServiceContract
Endpoint in `doGet` handler at line 510-511.

**Parameters:**
- `action=sendWeeklyServiceContract`
- `contractId` - ID of contract to send

**Returns:** JSON response with success status and URLs

### Configuration Requirements

For Stripe to work, you must set two Script Properties in Google Apps Script:

1. **STRIPE_SECRET_KEY**
   - Get from: Stripe Dashboard → Developers → API Keys
   - Value: Your secret key (starts with `sk_live_` or `sk_test_`)

2. **STRIPE_API_URL** (Already configured)
   - Value: `https://api.stripe.com/v1`

**How to set properties:**
1. In Google Apps Script editor: Extensions → Apps Script Properties
2. Add `STRIPE_SECRET_KEY` with your secret key value
3. Click Save

### Testing the Implementation

#### Test Case 1: Send Contract with Stripe Link
1. Go to Weekly Service Dashboard
2. Create or open a contract
3. Fill in customer email and service details
4. Click "Send"
5. **Expected Result:**
   - Toast shows "Contract sent. Telegram draft created."
   - Customer receives email with:
     - Company header with logo
     - Service details displayed
     - Two buttons visible (Sign + Set Up Autopay)
     - Professional footer

#### Test Case 2: Customer Clicks Stripe Button
1. Customer receives email
2. Clicks "Set Up Autopay" button
3. **Expected Result:**
   - Opens Stripe checkout with:
     - Pre-filled customer email
     - Monthly/biweekly price shown
     - Service description
     - Billing address collection
     - Ability to manage subscription

#### Test Case 3: No Stripe Key Configured
1. Leave STRIPE_SECRET_KEY empty/unset
2. Send a contract
3. **Expected Result:**
   - Email still sends successfully
   - Stripe button won't be in email (stripeLink is empty)
   - Warning logged: "STRIPE_SECRET_KEY not configured"

### Error Logs

The implementation includes comprehensive logging. Check Google Apps Script Logs (View → Logs) for:

**Success messages:**
- ✅ Stripe payment link created: `<url>`
- ✅ Stripe checkout session created: `<session_id>`
- ✅ Found existing Stripe customer: `<customer_id>`
- ✅ Created new Stripe customer: `<customer_id>`
- ✅ Contract email sent to: `<email>`

**Error messages:**
- ⚠️ STRIPE_SECRET_KEY not configured
- ⚠️ Stripe link creation failed (non-blocking): `<error>`
- ❌ Stripe error: `<error_message>`
- ❌ Stripe customer creation error: `<error_message>`

### Email Flow Diagram

```
sendWeeklyServiceContract(contractId)
  ↓
[Generate PDF & Signing Token]
  ↓
[Update Contract Status to 'Sent']
  ↓
[Generate Stripe Checkout Session]
  ↓ (URL or empty string)
  ├→ [Create/Get Stripe Customer]
  ├→ [Create Checkout Session with Recurring Subscription]
  └→ [Return Payment Link]
  ↓
[Send HTML Email to Customer]
  ├→ Include Signing Link (always)
  ├→ Include Stripe Link (if generated)
  └→ Include Service Details & Next Steps
  ↓
[Send Telegram Notification to Admin]
  ↓
Return { success: true, signingUrl, pdfUrl, stripeLink }
```

### Stripe Checkout Session Details

When customer clicks "Set Up Autopay", they're taken to a Stripe checkout session configured with:

- **Mode:** Subscription (recurring payment)
- **Interval:** 
  - Weekly services = every week
  - Biweekly services = every 2 weeks
- **Amount:** Price per visit × visits per month = monthly billing
- **Billing Address:** Required (collected from customer)
- **Customer Updates:** Name and address kept in sync with Stripe

**Example Session Data:**
```
Mode: subscription
Price: $150 (if weekly service)
Recurring: Weekly (every 7 days)
Customer: Auto-created with email
Currency: USD
```

### Important Notes

1. **Email Sending Context:** Emails are sent from `samr@aqualitypoolcompanyusa.com` using MailApp. This requires the Google Account running the script to have email privileges.

2. **Stripe Testing:**
   - Use `sk_test_` key for testing
   - Use test email addresses from Stripe docs (e.g., `good_visa@example.com`)
   - Switch to `sk_live_` key for production

3. **Async Error Handling:** The function includes try-catch blocks and proper error propagation to avoid "message channel closed" errors.

4. **Graceful Degradation:**
   - If Stripe fails: Contract still sends with signing link, just no autopay button
   - If email fails: Function returns error and doesn't continue
   - If Telegram fails: Still marked as sent (non-blocking)

### Browser Console Messages

When sending a contract, you'll see in browser console:
```
🔍 Calling sendWeeklyServiceContract via google.script.run
```

On success:
```
✅ Response received: {success: true, signingUrl: "...", pdfUrl: "...", stripeLink: "..."}
```

### Future Enhancements

1. **Subscription Management:** Add function to update/cancel Stripe subscriptions
2. **Payment Confirmation:** Send confirmation email when payment processed
3. **Webhook Handling:** Listen for Stripe payment events
4. **Multiple Payment Methods:** Support other payment providers (PayPal, etc.)
5. **Custom Branding:** Allow company logo in Stripe checkout

---

## Verification Checklist

- ✅ `createStripePaymentLink_` function implemented
- ✅ `getOrCreateStripeCustomer_` function implemented  
- ✅ `sendWeeklyContractEmail_` function implemented
- ✅ `sendWeeklyServiceContract` updated to call all functions
- ✅ API route configured in doGet handler
- ✅ Error handling and logging in place
- ✅ No syntax errors in SchedulingScript.gs
- ✅ Email template includes both action buttons
- ✅ Stripe graceful failure (non-blocking)
- ✅ Telegram still works alongside Stripe flow

## Status: ✅ READY FOR TESTING

All code is in place and ready to test. Next step: Set STRIPE_SECRET_KEY property and send a test contract.

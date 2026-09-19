# System Architecture - Stripe Autopay Integration

## High-Level Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    WEEKLY SERVICE SCHEDULING SYSTEM                      │
│                        + STRIPE AUTOPAY INTEGRATION                      │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (SchedulingUI.html)                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────────────────────────────┐                               │
│  │   Weekly Service Dashboard Modal     │                               │
│  │   (embedded iframe - WeeklyService.html)                             │
│  │                                      │                               │
│  │  📋 Contracts List View:             │                               │
│  │  ├─ View all contracts               │                               │
│  │  ├─ Edit contract details            │                               │
│  │  ├─ Send contract      ← USER CLICKS │                               │
│  │  └─ Delete contract                  │                               │
│  │                                      │                               │
│  │  ┌──────────────────────────────┐   │                               │
│  │  │  Calls: sendContract()       │   │                               │
│  │  │  → apiPost('sendWeeklyServi  │   │                               │
│  │  │    ceContract', {contractId})    │                               │
│  │  └──────────────────────────────┘   │                               │
│  └──────────────────────────────────────┘                               │
│                    │                                                     │
│                    ↓                                                     │
│          [google.script.run.                                             │
│           sendWeeklyServiceContract(contractId)]                         │
│                    │                                                     │
└────────────────────┼─────────────────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ↓                         ↓
    ┌──────────────────────────────────────┐
    │   GOOGLE APPS SCRIPT BACKEND          │
    │   (SchedulingScript.gs)               │
    │                                       │
    │   sendWeeklyServiceContract()         │
    │   Line: 7726-7784                     │
    │                                       │
    │  1. Get contract from sheet ────────┐ │
    │  2. Generate contract PDF          │ │
    │  3. Generate signing token + URL   │ │
    │  4. Update contract status         │ │
    │  5. CREATE STRIPE PAYMENT LINK ◄───┼──── NEW FEATURE
    │     └─ createStripePaymentLink_()  │ │
    │        ├─ Get/create Stripe cust.  │ │
    │        ├─ Call Stripe API          │ │
    │        └─ Return payment link URL  │ │
    │  6. SEND HTML EMAIL ◄──────────────┼──── NEW FEATURE
    │     └─ sendWeeklyContractEmail_()  │ │
    │        ├─ Format HTML template     │ │
    │        ├─ Add signing button       │ │
    │        ├─ Add Stripe button        │ │
    │        └─ Send via MailApp         │ │
    │  7. Send Telegram notification     │ │
    │     └─ sendWeeklyContractTelegram_() │
    │  8. Return response                │ │
    │     {success, signingUrl, stripeLink} │
    │                                    │ │
    └─────────────────────────────────────┘─┘
            │ (uses)         │ (uses)
            ↓                ↓
    ┌──────────────────────────────────────┐
    │     GOOGLE SHEETS (Contract Data)     │
    ├──────────────────────────────────────┤
    │  WS_CONTRACTS_SHEET                  │
    │  ├─ contractId                       │
    │  ├─ projectId                        │
    │  ├─ customerEmail                    │
    │  ├─ customerName                     │
    │  ├─ customerPhone                    │
    │  ├─ frequency (weekly/biweekly)      │
    │  ├─ pricePerVisit                    │
    │  ├─ status (Draft/Sent/Signed)       │
    │  └─ ... (other contract details)     │
    └──────────────────────────────────────┘
```

## Stripe Integration Layer

```
┌─────────────────────────────────────────────────────────┐
│         STRIPE AUTOPAY PAYMENT SETUP                    │
└─────────────────────────────────────────────────────────┘

User receives email with "Set Up Autopay" button
                    ↓
         [Customer clicks button]
                    ↓
    ┌─────────────────────────────────┐
    │  Stripe Checkout Session URL    │
    │  (returned from API call)       │
    └─────────────────────────────────┘
                    ↓
         [Opens in customer browser]
                    ↓
    ┌──────────────────────────────────────────┐
    │      STRIPE CHECKOUT PAGE                │
    ├──────────────────────────────────────────┤
    │  Header: A Quality Pool Company Logo     │
    │  Service: Weekly/Biweekly Pool Service   │
    │  Amount: Monthly billing amount          │
    │  Frequency: Weekly or Every 2 weeks      │
    │                                          │
    │  ┌────────────────────────────────────┐ │
    │  │ Customer Information               │ │
    │  ├────────────────────────────────────┤ │
    │  │ Email: [pre-filled]                │ │
    │  │ Billing Address: [collect]         │ │
    │  └────────────────────────────────────┘ │
    │                                          │
    │  ┌────────────────────────────────────┐ │
    │  │ Payment Information                │ │
    │  ├────────────────────────────────────┤ │
    │  │ Card Number: [enter]               │ │
    │  │ Expiration: [enter]                │ │
    │  │ CVC: [enter]                       │ │
    │  │ Name on Card: [auto-filled]        │ │
    │  └────────────────────────────────────┘ │
    │                                          │
    │  [Complete Subscription Setup →]        │
    └──────────────────────────────────────────┘
                    ↓
         [Customer submits payment]
                    ↓
    ┌──────────────────────────────────────────┐
    │  STRIPE API PROCESSES PAYMENT            │
    ├──────────────────────────────────────────┤
    │  ✅ Payment method validated             │
    │  ✅ Billing address confirmed            │
    │  ✅ Initial payment processed            │
    │  ✅ Subscription created                 │
    │  ✅ Customer in Stripe system updated    │
    │  ✅ Payment confirmation sent            │
    └──────────────────────────────────────────┘
                    ↓
    ┌──────────────────────────────────────────┐
    │  CUSTOMER SUCCESS PAGE                   │
    ├──────────────────────────────────────────┤
    │  "Payment successful!"                   │
    │  "Your subscription is active"           │
    │  "Next billing: [date]"                  │
    │  [Return to website]                     │
    └──────────────────────────────────────────┘
                    ↓
    ┌──────────────────────────────────────────┐
    │  ONGOING BILLING (STRIPE MANAGES)        │
    ├──────────────────────────────────────────┤
    │  Every week/biweekly:                    │
    │  1. Stripe charges customer automatically│
    │  2. Payment processed via their card     │
    │  3. Payment confirmation sent            │
    │  4. Webhook notification (optional)      │
    │  5. No user action needed                │
    └──────────────────────────────────────────┘
```

## Email Template Structure

```
┌──────────────────────────────────────────────────────┐
│         CUSTOMER RECEIVES EMAIL                      │
├──────────────────────────────────────────────────────┤
│                                                      │
│  From: samr@aqualitypoolcompanyusa.com              │
│  Subject: 📝 Your Pool Service Agreement is Ready   │
│  Content-Type: text/html                            │
│                                                      │
├──────────────────────────────────────────────────────┤
│                    EMAIL BODY                        │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │ [HEADER with gradient background]           │  │
│  │ [Company Logo Image]                         │  │
│  │ "Service Agreement Ready!"                   │  │
│  │ "Please review and sign your weekly pool     │  │
│  │  service contract"                           │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  Hello John,                                         │
│                                                      │
│  Your weekly pool service agreement is ready        │
│  for your review and signature...                   │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │ Service Details Box (light blue)             │  │
│  ├──────────────────────────────────────────────┤  │
│  │ Service Frequency: Weekly                    │  │
│  │ Service Day: Monday                          │  │
│  │ Price per Visit: $150                        │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │ [PRIMARY BUTTON - BLUE]                      │  │
│  │ 📝 Review & Sign Agreement                   │  │ ← signing URL
│  │ https://example.com/sign?token=xxx           │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │ [SECONDARY BUTTON - PURPLE]                  │  │
│  │ 💳 Set Up Autopay                            │  │ ← stripe URL
│  │ https://checkout.stripe.com/pay/cs_xxx       │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │ What Happens Next (green box)                │  │
│  ├──────────────────────────────────────────────┤  │
│  │ 1. Click button to review agreement          │  │
│  │ 2. Sign electronically using your method     │  │
│  │ 3. Set up autopay for seamless billing       │  │
│  │ 4. Relax – we'll handle the rest!            │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  Questions? Contact us at:                          │
│  samr@aqualitypoolcompanyusa.com                   │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │ FOOTER (light gray)                          │  │
│  │ © 2024 A Quality Pool Company                │  │
│  │ All rights reserved                          │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
└──────────────────────────────────────────────────────┘
```

## Data Flow: Contract → Email → Stripe

```
GOOGLE SHEETS
┌──────────────────────────┐
│  Contract Row            │
│  ID: CONTRACT-1702346382 │
│  Email: john@example.com │
│  Name: John Smith        │
│  Frequency: weekly       │
│  Price: 150              │
│  Day: Monday             │
│  Status: Draft           │
└──────────────────────────┘
          │
          ↓
┌──────────────────────────┐
│ getWeeklyServiceContract │
│ (fetch from sheet)       │
└──────────────────────────┘
          │
          ↓
┌──────────────────────────────┐
│ Contract Object (JavaScript) │
│ {                            │
│   contractId: "CONTRACT-..." │
│   customerEmail: "john@..."  │
│   customerName: "John Smith" │
│   frequency: "weekly"        │
│   pricePerVisit: 150         │
│   serviceDay: "Monday"       │
│   ... other fields           │
│ }                            │
└──────────────────────────────┘
          │
          ├─────────────────────────────┐
          ↓                             ↓
    [Email Function]              [Stripe Function]
    sendWeeklyContractEmail_       createStripePaymentLink_
    │                             │
    │ Uses fields:                │ Uses fields:
    ├─ customerEmail         ─────┼─ customerEmail
    ├─ customerName          ─────┼─ customerName
    ├─ frequency             ─────┼─ frequency
    ├─ pricePerVisit         ─────┼─ pricePerVisit
    └─ serviceDay                 └─ (calls Stripe API)
                                      │
                                      ↓
                            ┌──────────────────────┐
                            │ Stripe API Call      │
                            │                      │
                            │ POST /checkout/...   │
                            │ Authorization Bearer │
                            │                      │
                            │ Creates:             │
                            │ - Stripe Session ID  │
                            │ - Payment Link URL   │
                            │ - Subscription setup │
                            └──────────────────────┘
                                      │
                                      ↓
    ┌─────────────────────────────────────────────┐
    │ sendWeeklyContractEmail_ combines both:     │
    │ - Signing URL (from token)                  │
    │ - Stripe Link (from API response)           │
    │                                             │
    │ Creates HTML email template with:           │
    │ - Signing button → signingUrl               │
    │ - Stripe button → stripeLink (if available) │
    │                                             │
    │ Calls MailApp.sendEmail() with HTML body    │
    └─────────────────────────────────────────────┘
              │
              ↓
    ┌──────────────────────────┐
    │ Email Delivered          │
    │ to john@example.com      │
    │                          │
    │ With 2 action buttons:   │
    │ 1. Sign Agreement        │
    │ 2. Set Up Autopay        │
    └──────────────────────────┘
```

## Error Handling & Graceful Degradation

```
┌────────────────────────────────────────────────┐
│  sendWeeklyServiceContract()                   │
│  (Master orchestration function)               │
└────────────────────────────────────────────────┘
              │
    ┌─────────┴─────────┐
    ↓                   ↓
[Step 1-4]         [Step 5: Stripe]
(always required)  (non-blocking)
    │                   │
    │ Critical:         │ Graceful failure:
    │ • PDF gen         │ • Stripe key missing
    │ • Token gen       │ • API error
    │ • Status update   │ → Use empty string for link
    │                   │ → Log warning
    │                   │ → Continue to email
    │                   │
    │                   ✓ Email sends WITHOUT Stripe
    │                   │ (just signing link, no autopay)
    │                   │
    └─────────┬─────────┘
              ↓
    [Step 6: Email Send]
    (critical, blocks if fails)
    │
    ├─ Success: Send telegram
    │ └─ Return success response
    │
    └─ Failure: Return error
      └─ Email is critical - don't continue

┌─────────────────────────────────────────────┐
│  Response Scenarios                         │
├─────────────────────────────────────────────┤
│ 1. SUCCESS (both email + Stripe)            │
│    {                                        │
│      success: true,                         │
│      signingUrl: "...",                     │
│      stripeLink: "https://checkout..."      │
│    }                                        │
│                                             │
│ 2. SUCCESS (email only, Stripe failed)      │
│    {                                        │
│      success: true,                         │
│      signingUrl: "...",                     │
│      stripeLink: ""   ← empty string        │
│    }                                        │
│    (Email still sends with just signing btn)│
│                                             │
│ 3. FAILURE (email failed)                   │
│    {                                        │
│      success: false,                        │
│      error: "Email send failed..."          │
│    }                                        │
│    (Contract marked as Sent, but customer   │
│     never receives notification)            │
└─────────────────────────────────────────────┘
```

## Configuration & Secrets

```
┌─────────────────────────────────────────────┐
│  GOOGLE APPS SCRIPT PROJECT SETTINGS        │
├─────────────────────────────────────────────┤
│                                             │
│  Script Properties:                         │
│  ┌─────────────────────────────────────┐   │
│  │ STRIPE_SECRET_KEY                   │   │
│  │ Value: sk_test_REDACTED... (test) or   │   │
│  │        sk_live_REDACTED... (prod)      │   │
│  │                                     │   │
│  │ [Source: Stripe Dashboard]          │   │
│  │ [Stored securely in Google]         │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  Code Constants:                            │
│  ┌─────────────────────────────────────┐   │
│  │ STRIPE_API_URL                      │   │
│  │ = 'https://api.stripe.com/v1'       │   │
│  │                                     │   │
│  │ SCHEDULING_WEBAPP_URL               │   │
│  │ = '<deployed script URL>'           │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  Email Settings:                            │
│  ┌─────────────────────────────────────┐   │
│  │ FROM: samr@aqualitypoolcompanyusa   │   │
│  │ REPLYTO: samr@aqualitypoolcompany   │   │
│  │ NAME: A Quality Pool Company        │   │
│  └─────────────────────────────────────┘   │
│                                             │
└─────────────────────────────────────────────┘
```

## Deployment Checklist

```
┌──────────────────────────────────────────────────────┐
│  DEPLOYMENT & VERIFICATION CHECKLIST                │
├──────────────────────────────────────────────────────┤
│                                                      │
│ ✅ Code Changes                                     │
│    ✓ createStripePaymentLink_ function              │
│    ✓ getOrCreateStripeCustomer_ function            │
│    ✓ sendWeeklyContractEmail_ function              │
│    ✓ sendWeeklyServiceContract updated              │
│    ✓ API route configured                           │
│    ✓ No syntax errors                               │
│                                                      │
│ ⏳ Configuration                                    │
│    • Get STRIPE_SECRET_KEY from dashboard           │
│    • Add to Apps Script Properties                  │
│    • Verify API URL is correct                      │
│    • Verify email address is correct                │
│                                                      │
│ ⏳ Testing                                          │
│    • Deploy script to web app                       │
│    • Send test contract                             │
│    • Verify email arrives                           │
│    • Check Stripe button visible                    │
│    • Click Stripe button                            │
│    • Verify checkout page opens                     │
│    • Complete test payment                          │
│    • Verify subscription created in Stripe          │
│    • Check logs for success messages                │
│                                                      │
│ ⏳ Production                                       │
│    • Switch STRIPE_SECRET_KEY to sk_live_           │
│    • Redeploy script                                │
│    • Send real contract to customer                 │
│    • Monitor first few payments                     │
│    • Have customer support ready                    │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

This architecture provides a complete, integrated payment solution for weekly pool service contracts with Stripe autopay setup seamlessly embedded in the existing workflow.

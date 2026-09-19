# Quick Start: Stripe Autopay Setup

## Step 1: Get Your Stripe Secret Key

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Sign in to your account
3. Click **Developers** in the left sidebar
4. Click **API Keys**
5. Under "Secret keys", find your key starting with `sk_live_` (production) or `sk_test_` (testing)
6. Click the eye icon to reveal the full key
7. Copy the key (use `sk_test_` for testing first)

## Step 2: Add Stripe Key to Google Apps Script

1. Open your Google Apps Script project
2. Click **Project Settings** (gear icon)
3. Scroll down and check the checkbox: **Show "appsscript.json" manifest file**
4. Go back to the editor
5. Open the **appsscript.json** file
6. Make sure it includes `"scriptProperties"` section

## Step 2b: Alternative - Use Apps Script Properties Editor

1. In Google Apps Script editor, click **Extensions** 
2. Click **Apps Script Properties**
3. Add a new row:
   - Property: `STRIPE_SECRET_KEY`
   - Value: `sk_test_REDACTED` (paste your test key)
4. Click **Save**

## Step 3: Deploy the Updated Script

1. Click **Deploy** → **New Deployment**
2. Select type: **Web app**
3. Execute as: Your email
4. Who has access: Anyone
5. Click **Deploy**
6. Authorize if prompted
7. Copy the new deployment URL

## Step 4: Test Sending a Contract

1. Go to your Scheduling UI
2. Open the Weekly Service Dashboard
3. Create a test contract with:
   - Customer Name: Test Customer
   - Customer Email: `your-email@example.com`
   - Frequency: Weekly
   - Price: $150
   - Service Day: Monday
4. Click **Send**
5. Check your email for the contract email

## Step 5: Verify Email Contents

Your email should have:

✅ Header with company logo  
✅ "Service Agreement Ready!" title  
✅ Service details (Frequency, Price, Day)  
✅ Two blue buttons:
   - "Review & Sign Agreement" 
   - "Set Up Autopay" 💳  
✅ "What happens next" section  
✅ Contact information  
✅ Professional footer

## Step 6: Test Stripe Checkout

1. Click **Set Up Autopay** button in the email
2. You should see:
   - Stripe Checkout page
   - Email pre-filled
   - Monthly price shown
   - Service description
3. Test with these card numbers (if using sk_test_):
   - **Visa:** 4242 4242 4242 4242
   - **Mastercard:** 5555 5555 5555 4444
   - Expiry: Any future date (e.g., 12/34)
   - CVC: Any 3 digits (e.g., 123)
4. Complete checkout
5. You should see success page

## Step 7: Check Logs

To verify everything is working:

1. In Google Apps Script editor, click **View** → **Logs**
2. Look for messages like:
   ```
   ✅ Stripe checkout session created: cs_test_xxxxx
   ✅ Created new Stripe customer: cus_xxxxx
   ✅ Contract email sent to: your-email@example.com
   ```

## Troubleshooting

### "STRIPE_SECRET_KEY not configured"
- Go to Apps Script Properties and add the key
- Make sure you copied the full key (starts with `sk_test_` or `sk_live_`)
- Save the property

### Email not showing Stripe button
- Check if Stripe link generation failed (look in logs)
- Verify STRIPE_SECRET_KEY is correct
- Try using test key first: `sk_test_...`

### Stripe Checkout page shows error
- Check your test key is correct
- Make sure you're using test card numbers from list above
- Look for error message in browser console

### Email never arrives
- Check spam folder
- Verify customer email is correct
- Look in Apps Script Logs for email send errors
- Make sure MailApp has permissions (may need to authorize first)

## Production Setup

When ready to go live:

1. Get your **live** Stripe secret key (`sk_live_...`)
2. Update the STRIPE_SECRET_KEY property with live key
3. Redeploy the script
4. Test with a real customer
5. Monitor Stripe Dashboard for successful charges

## What Customers See

### Email Flow:
```
📧 Email arrives with:
- Company branding and logo
- Service details
- "Review & Sign Agreement" button (signs contract)
- "Set Up Autopay" button (opens Stripe)
- Next steps instructions

👇

💳 Click "Set Up Autopay"
- Stripe checkout page opens
- Email is pre-filled
- Monthly price shown
- Simple 4-step payment flow

👇

✅ Payment submitted
- Customer sees success page
- Subscription created in Stripe
- Future payments processed automatically
```

## FAQ

**Q: Can customer change their billing address?**
A: Yes! The Stripe checkout lets them enter billing address and it updates their customer profile.

**Q: What if they cancel the subscription?**
A: They can manage it through Stripe's customer portal or contact you to cancel.

**Q: Can they use different payment methods?**
A: Yes, Stripe accepts credit/debit cards, Apple Pay, Google Pay, etc.

**Q: How do they pay after signing?**
A: Once subscription is set up, they're billed automatically on the schedule (weekly/biweekly).

**Q: What if Stripe setup fails?**
A: Email still sends with signing link. Just no autopay button. You can send link manually or retry.

---

## Key Information

- **Stripe API Version:** v1
- **Checkout Mode:** Subscription (recurring)
- **Billing:** Automatic, on your defined schedule
- **Test Environment:** Use `sk_test_` key (no real charges)
- **Live Environment:** Use `sk_live_` key (real charges)

---

**Ready? Let's go!** 🚀

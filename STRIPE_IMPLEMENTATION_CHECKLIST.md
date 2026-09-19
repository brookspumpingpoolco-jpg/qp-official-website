# Stripe Subscription Implementation Checklist

## ✅ Completed Tasks

### Backend (AuthenticationScript.gs)
- [x] Added Stripe API configuration constants
- [x] Created `createStripeCheckoutSession()` function
- [x] Created `cancelStripeSubscription()` function
- [x] Created `handleCancelSubscription()` function
- [x] Created `getStripeSubscription()` function
- [x] Created `sendSubscriptionCancelledEmail()` function
- [x] Updated `handleApproveAccount()` to create checkout sessions
- [x] Added case for `cancelSubscription` in doPost switch
- [x] Added case for `cancelSubscription` in proxy POST switch

### Frontend (Dashboard_Embed.html)
- [x] Updated trial banner with dynamic messaging
- [x] Enhanced `checkTrialStatus()` function
- [x] Created `cancelSubscriptionNow()` function
- [x] Updated `submitApproveAccount()` to redirect to Stripe
- [x] Added cancel subscription button to trial banner
- [x] Color-coded banner based on days remaining

### Branding (Previous)
- [x] Updated logo to PoolFlowPro logo
- [x] Changed title to "PoolFlowPro"
- [x] Added "A Product of Quality Pool Company" tagline
- [x] Fixed template variable issues

## 🔧 Configuration Steps Required

### Step 1: Create Stripe Product & Price
**Deadline: IMMEDIATE**

1. Log into https://dashboard.stripe.com
2. Go to **Products** → **Create new product**
3. Fill in:
   - Name: `PoolFlowPro Subscription`
   - Type: Service
   - Pricing: $125.00 USD
   - Recurring: Monthly
4. Copy the **Price ID** (format: `price_1234567890`)
5. Update in AuthenticationScript.gs line ~5084:
   ```javascript
   const priceId = 'price_YOUR_PRICE_ID_HERE';
   ```

### Step 2: Verify Stripe API Key
**Status: DONE**
- ✅ `STRIPE_SECRET_KEY` already configured
- ✅ Set in line 44 of AuthenticationScript.gs

### Step 3: Test URLs
**Status: NEEDS VERIFICATION**
- Verify success URL: `https://aesthetic-kataifi-88ba27.netlify.app/Dashboard_Embed.html?payment=success`
- Verify cancel URL: `https://aesthetic-kataifi-88ba27.netlify.app/Login_Embed.html?payment=cancelled`
- Update if domain changes

### Step 4: Deploy to Netlify
**Deadline: BEFORE TESTING**

Files to deploy:
- `invoice-netlify/Login_Embed.html` ✅ (already updated)
- `invoice-netlify/Dashboard_Embed.html` ✅ (just updated)

Deploy steps:
```bash
git add invoice-netlify/
git commit -m "Update Stripe subscription system"
git push  # Or manually upload to Netlify
```

### Step 5: Deploy AuthenticationScript.gs
**Deadline: BEFORE TESTING**

1. Open Google Apps Script
2. Click **Deploy** → **New Deployment**
3. Select Type: **Web App**
4. Execute as: **Me**
5. Who has access: **Anyone**
6. Deploy and copy the new Web App URL
7. Update in Dashboard_Embed.html if different

## ⚙️ Testing Checklist

### Pre-Launch Testing (Development)

**Test 1: Account Approval with Trial Creation**
- [ ] Log in as admin
- [ ] View pending accounts
- [ ] Click "Approve & Start Trial"
- [ ] Verify checkout URL generated in browser console
- [ ] Verify trial end date calculated (14 days from now)

**Test 2: Stripe Checkout Flow**
- [ ] Click "Setup Payment" or approval redirect
- [ ] Verify redirected to Stripe checkout
- [ ] Use test card: `4242 4242 4242 4242`
- [ ] Complete checkout
- [ ] Verify redirected back to Dashboard

**Test 3: Trial Countdown Display**
- [ ] Dashboard should show trial banner
- [ ] Should display correct days remaining
- [ ] Test with different trial end dates:
  - [ ] 8+ days: Green banner
  - [ ] 3-7 days: Orange banner
  - [ ] <3 days: Red banner
  - [ ] Expired: Red with "Trial Expired" message

**Test 4: Cancellation Flow**
- [ ] Log in as user with active trial
- [ ] Click "Cancel" button
- [ ] Confirm cancellation
- [ ] Verify subscription cancelled in Stripe dashboard
- [ ] Verify account status changed to "Cancelled"
- [ ] Verify user redirected to login
- [ ] Check email for cancellation confirmation

**Test 5: Error Handling**
- [ ] Test with invalid Stripe key (should fail gracefully)
- [ ] Test with missing price ID (should fail gracefully)
- [ ] Test cancellation of non-existent subscription (should show error)
- [ ] Test Stripe API timeout (should show timeout error)

### Stripe Dashboard Verification

After testing, verify in Stripe:
- [ ] Customers created for test users
- [ ] Subscriptions show correct trial period
- [ ] Subscriptions marked with trial status
- [ ] Cancelled subscriptions show in history
- [ ] Charges not applied during trial

## 🚀 Go-Live Checklist

### 1 Week Before Launch

- [ ] Notify team of launch date
- [ ] Set up Stripe webhook endpoints (recommended)
  - invoice.payment_succeeded
  - invoice.payment_failed
  - customer.subscription.deleted
  - customer.subscription.updated

- [ ] Configure Stripe email notifications
  - [ ] Enable failed payment retry emails
  - [ ] Enable subscription renewal reminders

### Launch Day

- [ ] Deploy final code to production
- [ ] Monitor for errors in logs
- [ ] Test with first real user account
- [ ] Verify email notifications working
- [ ] Monitor Stripe dashboard for transactions

### Post-Launch

- [ ] Send welcome email with trial info to all users
- [ ] Set calendar reminders for:
  - Day 12: 2-day warning
  - Day 14: Trial ending
  - Day 15: First charge date
- [ ] Monitor for cancellations/support issues
- [ ] Collect user feedback on payment flow

## 💰 Revenue Expectations

**Assumptions:**
- Average 10 signups per month
- 80% trial-to-paid conversion rate = 8 paying customers
- $125/month per customer
- 12-month retention rate: 85%

**Revenue Projection:**
```
Month 1: $1,000 (8 customers)
Month 2: $2,040 (16 customers, 85% retention)
Month 3: $3,060 (24 customers, 85% retention)
Year 1: ~$45,900 (assuming consistent 10 signups/month)
```

## 📊 Monitoring & Analytics

### Key Metrics to Track

1. **Conversion Rate**: Trial → Paid
   ```
   Calculation: (Paid Subscriptions) / (Total Signups) × 100
   Target: 80%+
   ```

2. **Churn Rate**: Monthly cancellations
   ```
   Calculation: (Cancellations) / (Active Subscriptions) × 100
   Target: <5% per month
   ```

3. **Failed Payment Rate**
   ```
   Track: Invoice payment failures in Stripe
   Target: <2%
   ```

4. **Average Subscription Length**
   ```
   Track: Duration from signup to cancellation
   Target: 12+ months
   ```

### Dashboard for Monitoring

Set up in Stripe:
1. Go to **Reporting** → **Analytics**
2. Pin "New subscriptions" chart
3. Pin "MRR" (Monthly Recurring Revenue) chart
4. Create custom report for churn analysis

## 🔐 Security Checklist

- [x] Stripe API key not exposed in frontend
- [x] All payment operations happen server-side
- [ ] Webhook endpoint implemented (TODO)
- [ ] Webhook signature verification (TODO)
- [ ] Rate limiting on cancellation endpoint (TODO)
- [ ] User email verification before allowing cancellation (TODO)

## 📞 Support & Documentation

### For Users

Send to users upon signup:
- [ ] Welcome email explaining trial
- [ ] Docs on how to manage subscription
- [ ] Link to support contact
- [ ] FAQ about billing

### For Admins

Create runbook for:
- [ ] How to view active subscriptions
- [ ] How to manually cancel a subscription
- [ ] How to process refunds
- [ ] How to handle failed payments

## 🐛 Known Issues & Fixes

### Issue: Checkout session fails with 404
**Status**: POTENTIAL  
**Fix**: Verify Price ID is correct and active in Stripe

### Issue: Trial date not showing in banner
**Status**: POTENTIAL  
**Fix**: Check localStorage has 'trialEnd' key set

### Issue: Cancel button doesn't appear
**Status**: POTENTIAL  
**Fix**: Verify Stripe customer ID stored in sheet

## ⏱️ Timeline

```
Immediate:
  - [ ] Get Stripe Price ID
  - [ ] Update Price ID in code

This Week:
  - [ ] Deploy to Netlify
  - [ ] Test full flow
  - [ ] Fix any bugs

Next Week:
  - [ ] Go-live with limited users
  - [ ] Monitor for 1 week
  - [ ] Full launch

Ongoing:
  - [ ] Monitor metrics
  - [ ] Support users
  - [ ] Optimize conversion rates
```

## Contact & Escalation

**Stripe Support**: https://support.stripe.com  
**Tech Issues**: samr@aqualitypoolcompanyusa.com  
**Billing Questions**: brookspumpingpoolco@gmail.com  
**Development**: [Your contact info]

---

**Last Updated**: April 4, 2026  
**Version**: 1.0  
**Status**: READY FOR STRIPE CONFIGURATION

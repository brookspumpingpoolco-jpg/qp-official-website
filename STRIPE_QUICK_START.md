# PoolFlowPro Stripe Integration - Quick Start Guide

## 🚀 30-Minute Setup

### Step 1: Get Your Stripe Price ID (5 minutes)

1. Go to https://dashboard.stripe.com/products
2. Click **Create a product**
3. Fill in:
   - **Name**: PoolFlowPro Subscription
   - **Type**: Service
   - **Price**: $125.00 USD
   - **Recurring**: Monthly
4. Click **Create product**
5. Copy the **Price ID** (looks like: `price_1SeLwyAKSLisTn3g8t5pj7kQ`)

### Step 2: Update Code with Price ID (2 minutes)

Open **AuthenticationScript.gs** in Google Apps Script:

1. Find line ~5084 (search for: `const priceId =`)
2. Replace:
   ```javascript
   const priceId = 'price_1SeLwyAKSLisTn3g8t5pj7kQ'; // OLD
   ```
   With your new Price ID:
   ```javascript
   const priceId = 'price_YOUR_NEW_ID_HERE'; // YOUR PRICE ID
   ```
3. Click **Save**

### Step 3: Deploy Updated Code (3 minutes)

In Google Apps Script:
1. Click **Deploy** → **New Deployment**
2. Type: **Web App**
3. Execute as: **Me**
4. Who has access: **Anyone**
5. Click **Deploy**
6. Copy the new Web App URL

### Step 4: Deploy Frontend (5 minutes)

Using Netlify (or git):
1. Update `invoice-netlify/Login_Embed.html` (already done ✅)
2. Update `invoice-netlify/Dashboard_Embed.html` (already done ✅)
3. Deploy to Netlify
4. Wait for deployment to complete

### Step 5: Test the Flow (15 minutes)

**Test Account Approval:**
1. Go to Login_Embed.html
2. Sign up with test email (e.g., test@example.com)
3. Verify email
4. Log in as admin
5. Click **Approve & Start Trial**
6. Should redirect to Stripe checkout

**Test Stripe Checkout:**
1. Use test card: **4242 4242 4242 4242**
2. Expiration: **12/25**
3. CVC: **123**
4. Click **Subscribe**
5. Should redirect back to Dashboard
6. Should see trial banner with "14 days remaining"

**Test Cancellation:**
1. Click **Cancel** button in banner
2. Confirm cancellation
3. Should see success message
4. Should be logged out and returned to login

## ✅ After Setup - What to Expect

### User Flow

1. **User signs up** → Email verification → "Pending" status
2. **Admin approves** → Stripe checkout created → User redirected
3. **User pays** → Stripe creates subscription with 14-day trial
4. **Dashboard shows** → Trial countdown banner
5. **After 14 days** → $125 charge applied automatically
6. **User can cancel** → Subscription cancelled immediately

### Dashboard Banner Changes

**Days 14-8**: Green banner
```
🎉 Free Trial Active
14 days remaining. Set up payment to continue service.
[Setup Payment]
```

**Days 7-3**: Orange banner  
```
⏳ Trial Ending - 5 Days Left
5 days remaining. Set up payment to continue service.
[Setup Payment] [Cancel]
```

**Days 2-0**: Red banner
```
⏰ Trial Ending Soon - 1 Day Left!
1 day remaining. Set up payment to continue service.
[Setup Payment] [Cancel]
```

**After Expiration**: Red banner
```
⚠️ Trial Expired
Your trial has ended. Please set up your subscription to continue using PoolFlowPro.
[Setup Payment]
```

## 🧪 Testing Scenarios

### Scenario 1: Full Trial → Payment
```
1. Signup with test@example.com
2. Verify email
3. Admin approves
4. Redirected to Stripe
5. Pay with 4242 4242 4242 4242
6. Dashboard shows "14 days remaining"
7. Wait 14 days → First charge applied
8. Can continue using app
✅ EXPECTED: Subscription active, $125 charged
```

### Scenario 2: Trial → Cancel
```
1. Complete Scenario 1 steps 1-6
2. Click "Cancel" button
3. Confirm cancellation
4. Check email for cancellation confirmation
5. Try to log in → Should see error
✅ EXPECTED: Subscription cancelled, account locked
```

### Scenario 3: Admin Rejects during Trial
```
1. Get to Scenario 1 step 3
2. Admin rejects account instead of approving
3. User receives rejection email
4. No Stripe checkout created
✅ EXPECTED: Account not created, no charges
```

## 🔧 Troubleshooting

| Problem | Solution |
|---------|----------|
| **Checkout redirects to 404** | Price ID is wrong. Verify in Stripe dashboard |
| **No checkout button appears** | Price ID not updated in code. Check line ~5084 |
| **Trial banner not showing** | localStorage.trialEnd not set. Check browser DevTools |
| **Can't cancel subscription** | Stripe subscription ID not stored. Check sheet column Q |
| **User not charged after trial** | Check Stripe dashboard > Subscriptions > Status should be "active" |
| **Email not sent** | Check Gmail settings. Verify sender email is correct |

## 📊 Monitoring

### Daily Checks (First Week)

1. **Stripe Dashboard**
   - Check new subscriptions
   - No failed charges
   - Correct trial dates

2. **Google Sheet**
   - Column Q: Stripe subscription IDs present
   - Column N: Trial end dates set
   - Approval Notifications: No cancellations yet

3. **Gmail**
   - Approval emails sent
   - No bounces

### Weekly Checks

1. **Stripe Analytics**
   - MRR trending upward
   - Churn rate low (<5%)
   - Payment success rate high (>98%)

2. **User Feedback**
   - Any payment issues?
   - Trial banner confusing?
   - Need more payment options?

## 💬 Support

### If Users Get Stuck

1. **"I'm seeing a Stripe error"**
   - Have them refresh the page
   - Try a different browser
   - Verify card details are correct

2. **"I want to change my payment method"**
   - Direct them to: https://billing.stripe.com/p/login/
   - They can manage their subscription there

3. **"I don't remember signing up for this"**
   - They may have clicked something by accident
   - Direct to cancellation link on dashboard
   - Offer refund if within 30 days

### If Admin Gets Stuck

1. **"Approve button not working"**
   - Check AuthenticationScript.gs is deployed
   - Clear browser cache
   - Check browser console for errors

2. **"Can't see Stripe details"**
   - Check sheet columns Q and R are populated
   - May need to redeploy AuthenticationScript.gs

3. **"Need to refund a customer"**
   - Go to Stripe > Payments
   - Find transaction
   - Click to refund
   - Send explanation email to user

## 🚨 Emergency Procedures

### If Stripe Integration Breaks

1. **Disable checkouts** (temporary fix)
   - Comment out `createStripeCheckoutSession()` call
   - Users can still sign up, won't need payment yet

2. **Manual approval mode**
   - Remove redirect to Stripe
   - Just approve accounts normally
   - Manually bill users later

3. **Rollback**
   - Revert AuthenticationScript.gs to previous version
   - Revert Dashboard_Embed.html to previous version
   - Alert all users of temporary service

### If Stripe Account Compromised

1. **Immediately**
   - Change Stripe API key
   - Rotate STRIPE_SECRET_KEY in code
   - Redeploy AuthenticationScript.gs

2. **Investigation**
   - Check Stripe dashboard for unauthorized charges
   - Contact Stripe support
   - File dispute for fraudulent transactions

3. **Customer Communication**
   - Notify affected users
   - Offer refunds
   - Explain security measures taken

## 📱 Mobile Testing

Test on:
- [ ] iPhone (Safari)
- [ ] Android (Chrome)
- [ ] Tablet (iPad or Android tablet)

Verify:
- [ ] Stripe checkout loads correctly
- [ ] Payment card form accessible
- [ ] Trial banner displays properly
- [ ] Cancel button works
- [ ] Email notifications received

## 📈 Success Criteria

After 1 week:
- ✅ At least 1 successful trial signup
- ✅ At least 1 successful payment
- ✅ No error logs in console
- ✅ All emails being sent
- ✅ Stripe dashboard shows clean data

After 1 month:
- ✅ 10+ signups
- ✅ 8+ successful payments
- ✅ 0 chargebacks or disputes
- ✅ <5% churn rate
- ✅ Revenue flowing in correctly

## 📞 Key Contacts

- **Stripe Support**: https://support.stripe.com
- **Account Admin**: samr@aqualitypoolcompanyusa.com
- **Billing Questions**: brookspumpingpoolco@gmail.com
- **Technical Issues**: [Your tech support email]

## 📚 Additional Resources

- [Stripe API Documentation](https://stripe.com/docs/api)
- [Stripe Dashboard Guide](https://stripe.com/docs/dashboard)
- [Stripe Test Cards](https://stripe.com/docs/testing)
- [Stripe Webhooks](https://stripe.com/docs/webhooks) (recommended for production)

---

## ✨ You're Done!

Your PoolFlowPro subscription system is now live. 

**Next Steps:**
1. ✅ Test with real users
2. ✅ Monitor for 1 week
3. ✅ Celebrate! 🎉

**Questions?** Contact samr@aqualitypoolcompanyusa.com

---

**Last Updated**: April 4, 2026  
**Setup Time**: ~30 minutes  
**Difficulty**: Easy  
**Status**: Ready to Deploy

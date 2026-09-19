# PoolFlowPro Stripe Subscription System - Setup Guide

## Overview

This document explains the new Stripe subscription system that has been integrated into PoolFlowPro, including:

- **14-day free trial** after account approval
- **$125/month** recurring subscription payment
- **Trial countdown notifications** in the dashboard
- **Subscription cancellation** from the dashboard

## Architecture

### Payment Flow

```
User Signs Up (Login_Embed.html)
    ↓
Email Verification
    ↓
Admin Approval (Dashboard_Embed.html)
    ↓
Stripe Checkout Session Created
    ↓
User Redirected to Stripe to Enter Payment Info
    ↓
Stripe Creates Subscription with 14-day Trial
    ↓
User Redirected Back to Dashboard
    ↓
Trial Status Tracked with Countdown Banner
    ↓
After Trial: User Charged $125/month
```

### Key Changes Made

#### 1. **AuthenticationScript.gs** - Backend Payment Handling

New functions added:

**`createStripeCheckoutSession(email, name, companyName, stripeCustomerId, trialDays = 14)`**
- Creates a Stripe checkout session with a 14-day trial period
- Called automatically when admin approves an account
- Returns checkout URL for redirect

**`cancelStripeSubscription(subscriptionId)`**
- Cancels an active Stripe subscription
- Called when user clicks "Cancel" button in dashboard
- Sets account status to "Cancelled"

**`handleCancelSubscription(data)`**
- Handles cancellation requests from the dashboard
- Sends cancellation confirmation email
- Logs the cancellation in the Approval Notifications sheet

**`getStripeSubscription(subscriptionId)`**
- Retrieves subscription details from Stripe API
- Used for status checking and troubleshooting

**`encodePayload_(payload)`**
- Helper function to properly encode form data for Stripe API calls

Updated functions:

**`handleApproveAccount(data)`**
- Now creates a Stripe checkout session upon approval
- Sets trial end date (14 days from approval)
- Returns `checkoutUrl` in response so dashboard can redirect user

#### 2. **Dashboard_Embed.html** - Frontend Trial Management

**Trial Banner Updates:**
- Dynamically shows remaining trial days (e.g., "⏳ Trial Ending - 3 Days Left")
- Changes color based on urgency:
  - **Green (Active)**: 8+ days remaining
  - **Orange (Warning)**: 3-7 days remaining  
  - **Red (Critical)**: Expired
- Shows "Setup Payment" button during trial
- Shows "Cancel" button if subscription is active

**New JavaScript Functions:**

**`checkTrialStatus()`** (Enhanced)
```javascript
// Checks trial expiration date and updates banner
// Called every minute on dashboard load
// Shows appropriate warning messages based on time remaining
// Shows cancel button if subscription exists
```

**`cancelSubscriptionNow()`** (New)
```javascript
// Handles subscription cancellation from dashboard
// Makes API call to AuthenticationScript.gs
// Clears local storage and redirects to login
// Shows confirmation toast notification
```

**`submitApproveAccount()`** (Updated)
```javascript
// Now handles Stripe checkout redirect
// If checkoutUrl in response, redirects user to Stripe
// Stores trial end date in localStorage
// Shows redirect notification
```

## Configuration Required

### 1. **Stripe Setup**

You need to set up a Stripe product with a recurring price:

1. Go to https://dashboard.stripe.com
2. Navigate to **Products**
3. Create a new product named "PoolFlowPro Subscription"
4. Add a price:
   - Amount: $125
   - Recurring: Monthly
   - Note the **Price ID** (format: `price_XXXXXXXXX`)

5. Update the Price ID in **AuthenticationScript.gs** line ~5084:
```javascript
const priceId = 'price_1SeLwyAKSLisTn3g8t5pj7kQ'; // REPLACE WITH YOUR PRICE ID
```

### 2. **Environment Variables**

Already configured:
- `STRIPE_SECRET_KEY` - Your Stripe API secret key (line 44)
- `STRIPE_API_URL` - Set to `https://api.stripe.com/v1`

### 3. **Stripe URLs in Response**

The success/cancel URLs are hardcoded to your Netlify domain:
```javascript
success_url: 'https://aesthetic-kataifi-88ba27.netlify.app/Dashboard_Embed.html?payment=success',
cancel_url: 'https://aesthetic-kataifi-88ba27.netlify.app/Login_Embed.html?payment=cancelled'
```

Update these if your domain changes.

## User Experience Flow

### Signup → Approval → Payment

1. **User signs up** via Login_Embed.html
   - Creates account with "Pending" status
   - Stripe customer ID generated automatically

2. **Admin approves account** in Dashboard_Embed.html
   - Clicks "Approve & Start Trial" button
   - Selects trial duration (default 14 days)
   - Selects plan type and features

3. **Stripe checkout session created**
   - Backend creates Stripe Checkout Session
   - Sets trial end date 14 days in the future
   - No charge during trial period

4. **User redirected to Stripe**
   - User enters payment information
   - Stripe creates subscription with trial
   - Payment method saved

5. **User redirected back to Dashboard**
   - Trial countdown banner appears
   - Shows "Setup Payment" button
   - Trial end date in localStorage

6. **After 14 days:**
   - First charge of $125 is applied
   - Subscription continues monthly
   - Banner shows "Trial Expired" if they don't pay

### Cancellation Flow

1. **User clicks "Cancel" button** in trial banner
   - Confirmation dialog appears
   - API call to `handleCancelSubscription`

2. **Subscription cancelled**
   - Stripe subscription cancelled immediately
   - Account status set to "Cancelled"
   - Cancellation email sent

3. **User logged out**
   - Local storage cleared
   - Redirected to login page
   - No access to dashboard

## Data Storage

### Authentication Sheet Columns

**New/Updated columns:**
- Column N (Index 13): Trial End Date
- Column O (Index 14): Plan Type
- Column P (Index 15): Features (JSON)
- Column Q (Index 16): Stripe Subscription ID
- Column R (Index 17): Stripe Customer ID

### Approval Notifications Sheet

New entries logged for:
- `'Subscription Cancelled'` action
- Trial end dates tracked per user

## Testing

### Manual Testing Checklist

**1. Test Stripe Checkout Creation**
```javascript
// In Google Apps Script console:
const result = createStripeCheckoutSession(
  'test@example.com',
  'Test User',
  'Test Company',
  'cus_XXXXXXXXXXXXX', // Get from Stripe dashboard
  14
);
console.log(result); // Should show checkoutUrl
```

**2. Test Trial Status Display**
```javascript
// Set in browser console:
localStorage.setItem('trialEnd', new Date(Date.now() + 5*24*60*60*1000).toISOString());
window.checkTrialStatus();
// Should show orange banner with 5 days remaining
```

**3. Test Cancellation**
- Log in as user with active subscription
- Click "Cancel" button
- Verify email sent
- Verify account marked as "Cancelled" in sheet

### Stripe Test Mode

Use these test card numbers in Stripe checkout:
- **Visa**: `4242 4242 4242 4242`
- **Mastercard**: `5555 5555 5555 4444`
- **Amex**: `3782 822463 10005`

Any future expiration date and any 3-digit CVC

## Troubleshooting

### "404 Error on Checkout URL"

**Cause**: Stripe API call failed  
**Solution**: 
- Verify `STRIPE_SECRET_KEY` is correct
- Check Stripe account is active and not in test mode
- Verify Price ID exists and is active

### "Checkout URL Not Appearing After Approval"

**Cause**: Stripe customer ID is missing  
**Solution**:
- Ensure `handleSignUpUser` creates Stripe customer before signup completes
- Check column R (Stripe Customer ID) has value in sheet

### "Users Not Charged After Trial"

**Cause**: Subscription not created properly  
**Solution**:
- Check Stripe dashboard > Subscriptions for the customer
- Verify trial_end timestamp is set correctly
- Check subscription status is "active", not "incomplete"

### "Cancel Button Not Appearing"

**Cause**: Subscription ID not stored  
**Solution**:
- Verify Stripe checkout session includes `metadata` with subscription ID
- Update `handleStripeWebhook` to store subscription ID in sheet

## API Endpoints

### Create Checkout Session (Internal)
```
Function: createStripeCheckoutSession(email, name, company, customerId, trialDays)
Called: Automatically on account approval
Returns: { success, sessionId, checkoutUrl, trialEnd }
```

### Cancel Subscription (Dashboard)
```
POST action=cancelSubscription
Body: { email }
Returns: { success, message }
```

### Get Trial Status (Dashboard)
```
Stored in: localStorage.getItem('trialEnd')
Called: Every minute by checkTrialStatus()
```

## Security Notes

⚠️ **Important**: 
- Never expose `STRIPE_SECRET_KEY` in frontend code
- Always validate requests in backend before charging
- Use `handleCancelSubscription` to verify user owns the subscription
- Stripe webhooks should be implemented for production to handle:
  - Failed payments
  - Subscription renewals
  - Cancellations from Stripe dashboard

## Next Steps

1. **Get your Stripe Price ID** from your Stripe account
2. **Update Price ID** in AuthenticationScript.gs
3. **Test with Stripe test card** in development
4. **Deploy to production** when ready
5. **Set up webhook** (optional but recommended) to handle:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`

## Support

For Stripe API documentation: https://stripe.com/docs/api

For PoolFlowPro support: samr@aqualitypoolcompanyusa.com

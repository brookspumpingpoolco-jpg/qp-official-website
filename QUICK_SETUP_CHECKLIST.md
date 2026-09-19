# ✅ QUICK IMPLEMENTATION CHECKLIST

## STEP 1: Add Files to Google Apps Script (5 min)
- [ ] Copy all code from `ServiceReportUI_Enhanced.gs` 
- [ ] Paste into new `.gs` file in your Apps Script project
- [ ] Copy all code from `CustomerPortalScript.gs`
- [ ] Paste into new `.gs` file in your Apps Script project
- [ ] Verify both files are in the same project

## STEP 2: Deploy Service Report UI (3 min)
- [ ] Open Google Apps Script editor
- [ ] Click "Deploy" button (top right)
- [ ] Click "New Deployment"
- [ ] Type: Select "Web app"
- [ ] Execute as: Select your email
- [ ] Who has access: Select "Anyone"
- [ ] Click "Deploy"
- [ ] Copy the URL that appears
- [ ] **SAVE THIS URL** - you'll use it every day

**Service Report UI URL**: `https://script.google.com/macros/d/[ID]/userweb`

## STEP 3: Deploy Customer Portal (3 min)
- [ ] In same project, click "Deploy" again
- [ ] Click "New Deployment"
- [ ] Type: Select "Web app"
- [ ] Execute as: Select your email
- [ ] Who has access: Select "Anyone"
- [ ] Click "Deploy"
- [ ] Copy the URL that appears
- [ ] **SAVE THIS URL** - you'll use it for customer links

**Customer Portal URL**: `https://script.google.com/macros/d/[ID]/userweb`

## STEP 4: Verify Google Sheets (2 min)
Check you have these sheets (create missing ones):
- [ ] `Appointments` - with Customer ID, Service Type, Date, Time, Status columns
- [ ] `Customers` - with ID, Name, Email, Phone, Address columns
- [ ] `Invoices & Estimates` - for invoicing
- [ ] `Payment History` - for payment records

**TIP**: The system will auto-create missing sheets when you first use it.

## STEP 5: Test Service Report UI (5 min)
- [ ] Open Service Report UI URL in browser
- [ ] See "Start Service Report" page
- [ ] Verify appointments appear (or show "No appointments")
- [ ] Click an appointment
- [ ] Verify form pre-fills with customer data
- [ ] **DO NOT SUBMIT** - just test the form

## STEP 6: Generate First Customer Portal Link (2 min)
- [ ] Go back to Apps Script
- [ ] At top, click "Run" (or press Ctrl+Enter)
- [ ] In console, paste and run:
  ```javascript
  generateCustomerPortalLink('customer@example.com', 90)
  ```
- [ ] Copy the `portalLink` from results
- [ ] Open that link in incognito window
- [ ] Verify portal loads and shows customer data

## STEP 7: Send Links to Customers (5 min)
- [ ] Run this for each customer:
  ```javascript
  generateCustomerPortalLink('john@example.com', 90)
  generateCustomerPortalLink('jane@example.com', 90)
  generateCustomerPortalLink('bob@example.com', 90)
  ```
- [ ] Save all URLs to a spreadsheet for reference
- [ ] Send links to customers (email, text, etc.)
- [ ] Ask customers to bookmark for easy access

## STEP 8: First Full Test (10 min)
- [ ] Schedule a test appointment
- [ ] Open Service Report UI
- [ ] Select test appointment
- [ ] Fill out entire form (checklist, notes, time)
- [ ] Upload 2-3 test photos
- [ ] Click "Complete & Send"
- [ ] Wait 30 seconds for processing
- [ ] Check email for confirmation
- [ ] Open customer portal and verify service report appears

## OPTIONAL: Setup Telegram Notifications (5 min)
- [ ] Go to @BotFather on Telegram
- [ ] Create new bot, get TOKEN
- [ ] Start your bot, get CHAT_ID
- [ ] In ServiceReportUI_Enhanced.gs, add:
  ```javascript
  const BOT_TOKEN = 'YOUR_TOKEN_HERE';
  const CHAT_ID = 'YOUR_CHAT_ID_HERE';
  ```
- [ ] Save and redeploy

## OPTIONAL: Customize Portal Colors (2 min)
- [ ] Open CustomerPortalScript.gs
- [ ] Search for `#0284c7` (blue) - change to your color
- [ ] Search for `#0369a1` (dark blue) - change to your color
- [ ] Save and redeploy

## OPTIONAL: Add Custom Checklist Items (5 min)
- [ ] Open ServiceReportUI_Enhanced.gs
- [ ] Find the checklist section (~line 400)
- [ ] Add/modify checklist items to match your service routine
- [ ] Save and redeploy

---

## DAILY USAGE

### For You (Office Manager)
```
At start of day:
1. Open Service Report UI
2. See all today's appointments
3. Give technicians the URL
4. (They complete reports)

At end of day:
1. Check email for "Service Report Completed" notices
2. (Invoices auto-created for additional charges)
3. (Customers auto-notified with photos)
```

### For Technician
```
Before each appointment:
1. Click Service Report UI link
2. See "Start Service Report" page
3. Select your appointment
4. Fill out form (10 min max)
5. Upload photos
6. Click "Complete & Send"
7. Move to next appointment
```

### For Customer
```
After service:
1. Gets email: "Service Complete - View Your Report"
2. Clicks link in email
3. Sees service report with all photos
4. Sees next appointment scheduled
5. Can see pending invoice
6. Can see payment history
```

---

## VERIFICATION CHECKLIST

After deployment, verify everything works:

### Service Report UI
- [ ] Service Report UI URL loads
- [ ] Shows appointment selection page
- [ ] Can select an appointment
- [ ] Form pre-fills correctly
- [ ] Can upload photos
- [ ] Can save and complete service

### Customer Portal
- [ ] Customer Portal URL loads with token
- [ ] Shows dashboard with stats
- [ ] Shows upcoming appointments
- [ ] Shows service reports
- [ ] Shows invoices
- [ ] Shows payment history
- [ ] Mobile-responsive (test on phone)

### Integration
- [ ] Appointments marked as "Completed" after service submitted
- [ ] Emails sent to customers
- [ ] Photos saved to Drive
- [ ] Service reports appear in portal same day
- [ ] Invoices created for additional charges

### Security
- [ ] Portal requires valid token
- [ ] Invalid token shows error
- [ ] Customer can only see their own data
- [ ] Links don't work in private/incognito (no cached login)

---

## TROUBLESHOOTING QUICK REFERENCE

| Problem | Solution |
|---------|----------|
| Service Report URL shows error | Redeploy. Check spreadsheet ID. Check you have Editor access. |
| No appointments showing | Check Appointments sheet exists and has data with today's date. |
| Photos not saving | Check Drive folder ID is correct. Check Drive folder permissions. |
| Portal shows "Customer Not Found" | Check customer email matches exactly. Check Customers sheet exists. |
| Portal loads but data is blank | Check sheet names match (case-sensitive). Check customer ID matches. |
| Email not sending | Check customer email is valid. Check Gmail allows Apps Script. |
| Telegram not sending | Check BOT_TOKEN and CHAT_ID are set and correct. |

---

## SUCCESS INDICATORS

You'll know everything is working when:

✅ Technician can start service report in < 1 minute
✅ Form auto-fills with customer data (no manual entry)
✅ Can upload photos via drag & drop
✅ "Complete" takes < 30 seconds to process
✅ Customer gets email with photos within 1 minute
✅ Portal shows new service report within 2 minutes
✅ Appointment changes from "Scheduled" to "Completed"
✅ Portal looks professional and complete
✅ Customer has access to everything about their account

---

## SUPPORT

**If something doesn't work:**

1. Check the **PORTAL_INTEGRATION_GUIDE.md** for detailed explanations
2. Check Google Apps Script console for error messages (View → Execution log)
3. Check that all sheet names match exactly (case-sensitive)
4. Try the test functions:
   - `testServiceReportFlow()` in ServiceReportUI_Enhanced.gs
   - `testGenerateCustomerLink()` in CustomerPortalScript.gs
5. Make sure you're using the latest deployed versions (not old URLs)

---

**Ready? Start with Step 1 above!**

*Questions? Check the detailed guide: PORTAL_INTEGRATION_GUIDE.md*

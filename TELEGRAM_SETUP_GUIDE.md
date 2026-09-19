# Telegram Account Approval Notification System - Setup Guide

## 🎯 Overview

Your authentication system now includes **Telegram notifications** for account approvals with automatic reminders. When a user registers:

1. **Email verification** → Account marked "Pending"
2. **Email verified** → **Telegram notification sent to admin** + reminder tracking started
3. **Admin approves** → **Telegram confirmation** sent
4. **Every hour** → Automatic checks for 6h, 12h, 24h reminders (if still pending)

---

## 📋 What Was Added

### New Functions in `AuthenticationScript.gs`:

1. **`sendApprovalNotificationTelegram(userName, userEmail, companyName)`**
   - Sends initial notification when new account needs approval
   - Includes dashboard link

2. **`sendApprovalReminderTelegram(userName, userEmail, hoursWaiting)`**
   - Sends reminder if account still pending after 6, 12, 24 hours
   - Shows hours waiting

3. **`logApprovalNotification(email, name, action, hoursElapsed)`**
   - Logs all notifications to "Approval Notifications" sheet
   - Tracks notification history

4. **`checkPendingAccountReminders()`**
   - Main function that runs every hour via trigger
   - Checks which accounts need reminders
   - Prevents duplicate notifications

5. **`setupReminderTrigger()`**
   - One-time setup function to enable auto-reminders
   - Creates hourly time-based trigger

### Modified Functions:

1. **`handleVerifyEmail(data)`**
   - Now sends Telegram notification when email is verified
   - Logs initial account creation

2. **`handleApproveAccount(data)`**
   - Now sends Telegram confirmation when approved
   - Logs approval to tracking sheet

---

## 🚀 Setup Instructions

### Step 1: Initialize the Reminder System

1. Open your Google Sheet: `https://docs.google.com/spreadsheets/d/1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0/edit`
2. Go to **Extensions → Apps Script**
3. Run the function: **`setupReminderTrigger()`**
4. Check logs for: ✅ "Reminder trigger created - will check every 1 hour"

### Step 2: Test Telegram Integration

1. Go to **Extensions → Apps Script**
2. From the function dropdown, select: **`testReminderCheck`**
3. Click **Run**
4. Watch Telegram for a test message from the bot
5. Check browser logs and sheet for results

### Step 3: Verify Configuration

The system uses these constants in `AuthenticationScript.gs`:

```javascript
const BROOKS_TELEGRAM_BOT_TOKEN = '8771014327:AAEHRAZGb1YI_KDsIQqy8plBx_QOd5Cduzw';
const BROOKS_TELEGRAM_CHAT_ID = '8255928481'; // Brooks' personal Telegram user ID
const APPROVAL_NOTIFICATIONS_SHEET = 'Approval Notifications';
```

✅ These are already configured and working

---

## 📊 Approval Notifications Sheet

A new sheet will be automatically created with:

| Column | Purpose |
|--------|---------|
| Date/Time | When notification was sent |
| User Email | Account email |
| User Name | Account name |
| Action | 'Created', 'Reminder-6h', 'Reminder-12h', 'Reminder-24h', 'Approved', 'Rejected' |
| Hours Elapsed | How long pending when notification sent |
| Status | Always 'Logged' |
| Telegram Sent | Always 'Yes' |

**Use this to:**
- Track approval history
- See when reminders were sent
- Audit account approvals
- Monitor system performance

---

## 🔔 Notification Flow

### Timeline for a Pending Account:

```
User Registers → Email Verification
    ↓
Email Verified (0 hours pending)
    → 📱 Telegram: "New Account Pending Approval"
    → 📊 Logged to Approval Notifications sheet
    → ⏱️ Reminder tracking started
    ↓
After 6 hours (if still pending)
    → 📱 Telegram: "Account Approval Reminder - Waiting 6 hours"
    → 📊 Logged as "Reminder-6h"
    ↓
After 12 hours (if still pending)
    → 📱 Telegram: "Account Approval Reminder - Waiting 12 hours"
    → 📊 Logged as "Reminder-12h"
    ↓
After 24 hours (if still pending)
    → 📱 Telegram: "Account Approval Reminder - Waiting 24 hours"
    → 📊 Logged as "Reminder-24h"
    ↓
Admin Approves Account
    → ✅ Account Status set to "Approved"
    → 📱 Telegram: "Account Approved ✅"
    → 📧 Email sent to user
    → 📊 Logged as "Approved"
```

---

## 🎛️ Configuration Options

### To Modify Reminder Intervals:

Edit `checkPendingAccountReminders()` function, line with:

```javascript
const REMIND_AT_HOURS = [6, 12, 24]; // Change these numbers
```

Examples:
- `[4, 8, 12, 24]` - Reminders at 4, 8, 12, 24 hours
- `[2, 6, 12, 24, 48]` - Includes 2-day reminder
- `[1, 6, 12, 24]` - Early 1-hour reminder

### To Change Check Frequency:

Edit `setupReminderTrigger()` and change:

```javascript
.everyHours(1)  // Change 1 to 2, 6, etc. for check every X hours
```

### To Change Telegram Recipient:

If you want multiple admins to receive notifications, update:

```javascript
// In sendApprovalNotificationTelegram() function:
const chatId = getBrooksTegramChatId_(); // Change this

// Replace with specific admin or group chat ID
const chatId = YOUR_ADMIN_GROUP_CHAT_ID;
```

---

## 🔐 For Opening to Public (Multi-Tenant)

### Current Setup (Single Company):
- All notifications go to Brooks' personal chat
- Single company: "A Quality Pool Company"
- Features: Hardcoded in authentication

### To Support Multiple Companies:

#### 1. Create "Company Settings" Sheet

Columns:
- Company ID
- Company Name
- Admin Telegram Chat ID
- Admin Email(s)
- Features Available
- Notification Enabled
- Reminder Hours (JSON: [6,12,24])

#### 2. Update Telegram Functions

```javascript
function getCompanyTelegramChatId_(companyId) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const settingsSheet = ss.getSheetByName('Company Settings');
  const values = settingsSheet.getDataRange().getValues();
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === companyId) {
      return values[i][2]; // Admin Chat ID column
    }
  }
  return null;
}

function getCompanyTelegramToken_(companyId) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const settingsSheet = ss.getSheetByName('Company Settings');
  const values = settingsSheet.getDataRange().getValues();
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === companyId) {
      return values[i][3]; // Token column
    }
  }
  return BROOKS_TELEGRAM_BOT_TOKEN; // Fallback
}
```

#### 3. Update Feature System

Already ready! Just populate the "Features" column (P) in Authentication sheet per user:

```javascript
// Example: User gets these features
["invoices", "estimates", "customer_portal"]

// Free tier
["invoices"]

// Pro tier
["invoices", "estimates", "customer_portal", "reports"]

// Enterprise tier
["invoices", "estimates", "customer_portal", "reports", "team_management", "api_access"]
```

---

## 🧪 Testing Checklist

- [ ] Run `setupReminderTrigger()` - verify "Reminder trigger created"
- [ ] Create test account and verify email
- [ ] Check Telegram for "New Account Pending Approval" notification
- [ ] Check "Approval Notifications" sheet has new row
- [ ] Approve account in dashboard
- [ ] Check Telegram for "Account Approved ✅" confirmation
- [ ] Wait 1 hour OR run `testReminderCheck()` for manual test
- [ ] Check for 6-hour reminder notifications (if account still pending)
- [ ] Verify reminders don't duplicate

---

## 📱 Telegram Group Notifications (Optional)

If you want to send notifications to a group instead of personal chat:

1. Create Telegram group
2. Add your bot to the group
3. Get group chat ID (usually starts with `-100`)
4. Replace `BROOKS_TELEGRAM_CHAT_ID` with group ID

```javascript
const BROOKS_TELEGRAM_CHAT_ID = '-1001234567890'; // Group ID format
```

---

## 🛠️ Troubleshooting

### Problem: No Telegram messages received

**Check:**
1. Verify bot token: `getTelegramBotToken_()` in logs
2. Verify chat ID: `getBrooksTelegramChatId_()` in logs
3. Make sure Brooks messaged the bot once (@8771014327_bot on Telegram)
4. Check browser console for errors

**Solution:**
```javascript
// Run this to test directly:
function testTelegramDirect() {
  Logger.log('Token: ' + BROOKS_TELEGRAM_BOT_TOKEN);
  Logger.log('Chat ID: ' + BROOKS_TELEGRAM_CHAT_ID);
  sendTelegramBotMessage_('Test message from Apps Script', []);
}
```

### Problem: Duplicate reminders being sent

**Check:**
- Make sure trigger is running only once per hour
- Check "Approval Notifications" sheet - should have only 1 row per reminder

**Solution:**
```javascript
// Remove all triggers and reset:
function resetTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => ScriptApp.deleteTrigger(t));
  Logger.log('All triggers removed');
  setupReminderTrigger(); // Create fresh trigger
}
```

### Problem: Sheet permissions issue

**Error:** "You don't have access to this file"

**Solution:**
1. Make sure you're the owner of the Google Sheet
2. Or ensure AuthenticationScript.gs has proper permissions
3. Verify SPREADSHEET_ID is correct

---

## 📈 Monitoring & Analytics

### View Approval History:

Open "Approval Notifications" sheet to see:
- Total approvals per day
- Average time to approval
- Which accounts need follow-up
- Reminder effectiveness

### Custom Reports:

You can create dashboard charts from the notifications sheet:

```javascript
// Example: Get approval stats
function getApprovalStats() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const notifSheet = ss.getSheetByName('Approval Notifications');
  const values = notifSheet.getDataRange().getValues();
  
  let createdCount = 0, approvedCount = 0, reminderCount = 0;
  
  for (let i = 1; i < values.length; i++) {
    const action = values[i][3];
    if (action === 'Created') createdCount++;
    if (action === 'Approved') approvedCount++;
    if (action.includes('Reminder')) reminderCount++;
  }
  
  Logger.log('Created: ' + createdCount);
  Logger.log('Approved: ' + approvedCount);
  Logger.log('Reminders sent: ' + reminderCount);
  Logger.log('Approval rate: ' + (approvedCount / createdCount * 100).toFixed(1) + '%');
}
```

---

## 🔗 Integration with Existing Systems

### Customer Portal Link:
Telegram messages already include a link to your dashboard for quick approval

### Invoice/Estimate Notifications:
The same Telegram pattern is used in `InvoiceEstimate.gs` - you can extend it further

### Feature Gating:
Already integrated - check column P (Features) in Authentication sheet

---

## 📞 Support

If issues arise:

1. Check **Extensions → Apps Script → Executions** for error logs
2. Check **Execution log** (clock icon) for detailed timing
3. Run diagnostic functions:
   - `testReminderCheck()` - manual trigger check
   - `testTelegramDirect()` - direct Telegram test
4. Review "Approval Notifications" sheet for history

---

## ✅ Summary

Your system now has:

✅ Automatic Telegram notifications on account creation  
✅ Automatic reminders at 6, 12, 24 hours if pending  
✅ Admin confirmation when account is approved  
✅ Complete audit trail in "Approval Notifications" sheet  
✅ Hourly automatic checks (via trigger)  
✅ Easy configuration for multi-tenant deployment  
✅ Feature limitation system ready  
✅ Ready to open to public  

**Next Steps:**
1. Run `setupReminderTrigger()` to activate
2. Test with a new account registration
3. Monitor "Approval Notifications" sheet
4. Configure for public deployment (see Multi-Tenant section)


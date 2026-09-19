# Authentication & Approval System Analysis

## Current System Overview

### 1. Authentication System Architecture

**File:** `AuthenticationScript.gs` (4506 lines)

#### User Account Flow:
1. **Registration** (`handleCreateAccount`)
   - User submits email, name, password
   - System validates email format
   - Password is hashed using bcryptjs via API
   - Verification code sent via email
   - Account created with status: **"Pending"**

2. **Email Verification** (`handleVerifyEmail`)
   - Verification code valid for 23 hours
   - Once verified, status changes to **"Pending Approval"**
   - Admin notified via email (but NOT via Telegram yet)

3. **Admin Approval** (`handleApproveAccount`)
   - Admin reviews account in dashboard
   - Updates Account Status to **"Approved"**
   - Sets user's Role (Admin, Manager, User, Guest)
   - Sets Trial End Date (if applicable)
   - Sets Plan Type
   - Sets Features (as JSON array)
   - Sends approval email to user
   - **CURRENTLY: NO TELEGRAM NOTIFICATION**

4. **Account Activation**
   - Once approved, user can log in
   - Account status set to **"Active"**
   - User can access dashboard with assigned features

#### Authentication Sheet Structure (17 Columns):

| Col | Name | Purpose |
|-----|------|---------|
| A | Name | User's full name |
| B | Email | User's email (unique) |
| C | Password | Hashed password |
| D | Role | Admin, Manager, User, Guest |
| E | Status | Active/Inactive |
| F | Account Status | **Pending/Approved/Rejected** (KEY) |
| G | Verification Code | For email/password reset |
| H | Last Verification Time | Timestamp |
| I | Verification Expires | Expiration time (23 hrs) |
| J | Date Created | Account creation timestamp |
| K | Last Login | Last login timestamp |
| L | Company | Company name |
| M | Company ID | **CMP-AQUALITYPOOL** or custom |
| N | Trial End Date | Trial expiration date |
| O | Plan Type | Free/Pro/Enterprise |
| P | Features | JSON array of enabled features |
| Q | Settings | Additional JSON settings |

### 2. Feature Limitation System

#### Current Implementation:
- **Features Column (P):** Stored as JSON array
- Each user has array of feature IDs they can access
- Example: `["invoices", "estimates", "customer_portal", "reports"]`

#### Feature Checking:
```javascript
// From authentication flow
let features = [];
if (row[15]) {
  try {
    features = JSON.parse(row[15]); // Column P
  } catch (e) {
    features = []; // Default if parse fails
  }
}
// Return features array to frontend
```

#### How Features Are Gated:
- Frontend checks `user.features` array before showing UI elements
- Backend validates user has feature access before executing actions
- Plan Type (column O) can also restrict features

### 3. Current Approval Process

**Flow:**
```
User Registers (Pending)
    ↓
Email Verification (Pending Approval)
    ↓
Admin Approves Account (Approved)
    ↓
✓ Approval Email Sent
✗ NO TELEGRAM NOTIFICATION
✗ NO REMINDERS IF NOT APPROVED
✗ NO DASHBOARD NOTIFICATION TRACKING
    ↓
User Logs In (Active)
```

**Admin Dashboard View:**
- Shows count of pending approvals
- Modal displays pending accounts list
- Approve/Reject buttons for each account
- No notification about pending accounts

## Telegram Integration Analysis

**File:** `InvoiceEstimate.gs`

### Current Telegram Features:
1. **Configuration:**
   - `BROOKS_TELEGRAM_BOT_TOKEN = '8771014327:AAEHRAZGb1YI_KDsIQqy8plBx_QOd5Cduzw'`
   - `BROOKS_TELEGRAM_CHAT_ID = '8255928481'` (Brooks' personal chat ID)
   - Bot created with @BotFather

2. **Functions:**
   - `getTelegramBotToken_()` - Gets token from constant or script property
   - `getBrooksTelegramChatId_()` - Gets chat ID, validates it's not the bot ID
   - `sendTelegramBotMessage_(htmlText, buttons)` - Sends formatted message
   - `buildTelegramReplyMarkup_(buttons)` - Creates inline keyboard buttons
   - `testTelegramChannel()` - Test function to verify Telegram works

3. **Current Usage:**
   - Sending invoices/estimates to customer via Telegram link
   - Test executed successfully: `testTelegramChannel: OK — check Telegram. chat_id=8255928481`

4. **Message Format:**
   - HTML-formatted messages with inline keyboards
   - Buttons can link to approval URLs
   - Escapes HTML for safety

---

## What You Want to Build

### Goal: Account Approval Notifications + Reminders

**Requirements:**
1. ✓ Send Telegram notification when new account created
2. ✓ Reminder at 6 hours if not approved
3. ✓ Reminder at 12 hours if not approved
4. ✓ Reminder at 24 hours if not approved
5. ✓ Messages must appear in dashboard for tracking
6. ✓ Account must be approved within time window
7. ✓ Eventually open system to public (multi-tenant ready)

---

## Implementation Plan

### Phase 1: Telegram Notifications on Account Creation

**Changes to:** `AuthenticationScript.gs`

1. **On Account Created:**
   - Extract Telegram config from InvoiceEstimate.gs pattern
   - Send message: "New account pending approval: [Name] - [Email]"
   - Include dashboard link for quick approval
   - Log to "Approval Notifications" sheet

2. **Create Approval Notifications Sheet:**
   - Columns: Date, Email, Name, Status, 6hr Sent, 12hr Sent, 24hr Sent, Approved Date, Approved By
   - Track which reminders have been sent
   - Prevent duplicate notifications

### Phase 2: Time-Based Reminders

**New Function:** `checkPendingAccountReminders()`

1. **Query Approval Notifications sheet:**
   - Find accounts where `Account Status = "Pending"` for >6 hours
   - Find accounts where `Account Status = "Pending"` for >12 hours
   - Find accounts where `Account Status = "Pending"` for >24 hours

2. **Send reminders:**
   - Skip if reminder already sent (check sheet column)
   - Send Telegram: "Reminder: [Name]'s account still pending approval"
   - Update sheet to mark reminder as sent

3. **Scheduler:**
   - Deploy as time-based trigger (every 1 hour)
   - Or use AppsScript triggers: `ScriptApp.newTrigger()`

### Phase 3: Dashboard Integration

**Changes to:** Dashboard embed or main auth page

1. **Add "Approval Status" section:**
   - Show count: "2 pending approvals"
   - Expandable list showing:
     - Account name
     - Email
     - Time pending
     - Last reminder sent
     - Approve/Reject buttons
     - Telegram notification status (✓ Sent)

2. **Add Notification Log:**
   - Show all approvals from last 30 days
   - Notification timestamps
   - Who approved/rejected

### Phase 4: Multi-Tenant/Public Configuration

**For opening to public:**

1. **Per-Company Settings Sheet:**
   - Company ID
   - Company Name
   - Admin Email(s)
   - Telegram Bot Token (unique per company)
   - Telegram Chat ID (admin's personal ID)
   - Notification preferences (6/12/24 hour reminders)
   - Features available to company

2. **Feature Configuration:**
   - Create "Company Features" sheet
   - Map Company ID → Available Features
   - Allow admins to enable/disable features
   - Default feature sets: Free, Pro, Enterprise

3. **Email Configuration:**
   - Allow custom company email addresses
   - Custom sender names
   - Custom branding in emails/Telegram messages

---

## Current Limitations & Solutions

### Limitations:

1. **Hard-coded Company Name:** `const COMPANY_NAME = 'A Quality Pool Company'`
   - Should come from Authentication sheet or Company Config
   
2. **Single Admin Email:** `brookspumpingpoolco@gmail.com`
   - Need to support multiple admins per company
   - Query from Authentication sheet (Role = 'Admin')

3. **Single Telegram Channel:** Brooks' personal chat ID
   - Need per-company Telegram settings
   - Store in "Company Settings" sheet

4. **No Audit Trail:** Approvals not logged
   - Add "Approval History" sheet
   - Track who approved, when, what changes made

5. **No Escalation:** Just sits pending forever
   - Implement 24hr timeout with auto-rejection or escalation

### Solutions Implemented:

1. ✓ Company ID system ready (Column M in auth sheet)
2. ✓ Telegram framework already working (InvoiceEstimate.gs)
3. ✓ Feature system ready (Column P, JSON array)
4. ✓ Data structure supports multi-tenant (just needs front-end UI)

---

## Code Patterns to Follow

### Pattern 1: Telegram Notification
```javascript
// From InvoiceEstimate.gs
function sendTelegramBotMessage_(htmlText, buttons) {
  var token = getTelegramBotToken_();
  var chatId = getBrooksTelegramChatId_();
  const url = 'https://api.telegram.org/bot' + token + '/sendMessage';
  var payload = {
    chat_id: chatId,
    text: htmlText,
    parse_mode: 'HTML',
    disable_web_page_preview: false
  };
  // Send via UrlFetchApp.fetch()
}
```

### Pattern 2: Approval Handler
```javascript
// From AuthenticationScript.gs
function handleApproveAccount(data) {
  // Verify admin
  // Update row with status "Approved"
  // Send approval email
  // Return response
}
```

### Pattern 3: Sheet Query
```javascript
// Query pending accounts
const range = authSheet.getDataRange();
const values = range.getValues();
for (let i = 2; i < values.length; i++) {
  const row = values[i];
  if (row[5] === 'Pending') { // Column F: Account Status
    // Process pending account
  }
}
```

---

## Files That Need Changes

1. **AuthenticationScript.gs**
   - Add Telegram config
   - Modify `handleCreateAccount()` to send Telegram
   - Add `checkPendingAccountReminders()` function
   - Modify `handleApproveAccount()` to log approval

2. **AuthenticationSheetSetup.gs**
   - Create "Approval Notifications" sheet
   - Create "Company Settings" sheet (optional)
   - Create "Approval History" sheet

3. **Dashboard embed or UI**
   - Add approval status widget
   - Show pending approvals list
   - Display notification logs

---

## Next Steps

1. ✓ Create "Approval Notifications" tracking sheet
2. ✓ Add Telegram message on account creation
3. ✓ Create reminder check function
4. ✓ Set up time-based trigger
5. ✓ Add dashboard notification display
6. ✓ Create admin approval history log
7. ✓ Test with real Telegram messages
8. ✓ Document for public deployment

---

## Config Summary

### Telegram:
- Bot Token: `8771014327:AAEHRAZGb1YI_KDsIQqy8plBx_QOd5Cduzw`
- Brooks Chat ID: `8255928481` (his personal user ID, not bot ID)
- API Pattern: `https://api.telegram.org/bot{TOKEN}/sendMessage`

### Authentication:
- Spreadsheet: `1e6mGCMRJqOmNqLZVmZni_jPfouWmvLdhn96ta4YPEg0`
- Sheet: "Authentication"
- Key Columns: F (Account Status), P (Features), M (Company ID)

### Feature System:
- Stored as JSON in column P
- Example: `["invoices", "estimates", "customer_portal"]`
- Default features for new accounts: can be configured per plan


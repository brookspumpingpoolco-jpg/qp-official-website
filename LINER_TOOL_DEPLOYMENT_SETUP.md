# Liner Order Tool - Deployment Setup Guide

## Problem: 404 Error When Loading Liner Order Tool

You're seeing this error:
```
POST https://script.google.com/macros/s/AKfycbzq732_zhGRgoA2qzImXdEC9ZeIBiKE1gCLrhjxitrIaqvSBKwr3aYk2wKMFJKl8cWsYw/exec net::ERR_FAILED 404
CORS policy: No 'Access-Control-Allow-Origin' header
```

**Root Cause:** The Google Apps Script deployment URL is either:
- Invalid/expired
- Never deployed as a Web App
- Deployment was deleted

---

## Solution: Deploy LinerOrderScript.gs

### Step 1: Open Google Apps Script Editor

1. Go to [script.google.com](https://script.google.com)
2. Find and open your **LinerOrderScript.gs** project
   - If you don't see it, click "New Project" and create one
   - Copy the contents from: `/Users/joellmatteson/Desktop/The Official Website/invoice-netlify/LinerOrderScript.gs`

### Step 2: Deploy as Web App

1. Click the **Deploy** button (top right)
2. Select **New Deployment**
3. Click the gear icon, select **Web App**
4. Fill in:
   - **Execute as:** Your Google Account
   - **Who has access:** Anyone
5. Click **Deploy**
6. **IMPORTANT:** Copy the new deployment URL (looks like):
   ```
   https://script.google.com/macros/s/AKfycb_XXXXXXXXXX/exec
   ```

### Step 3: Add URL to Host Page

You need to set `window.LINER_SCRIPT_URL` before loading the Liner Order Tool.

**In your HTML page that embeds LinerOrderTool.html:**

```html
<script>
  // Set this BEFORE loading LinerOrderTool.html
  window.LINER_SCRIPT_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
</script>

<!-- Then load the iframe or include LinerOrderTool.html -->
<iframe src="https://path-to-liner-order-tool.html"></iframe>
```

### Step 4: Update Dashboard_Embed or Invoice Estimate

If Dashboard_Embed.html or Invoice Estimate also call the Liner Tool, update those files too:

**Dashboard_Embed.html (if it exists):**
```javascript
window.LINER_SCRIPT_URL = 'https://script.google.com/macros/s/YOUR_NEW_ID/exec';
```

---

## Verification Checklist

- [ ] GAS script deployed as Web App with "Anyone" access
- [ ] New deployment URL copied
- [ ] `window.LINER_SCRIPT_URL` set in host page
- [ ] No hardcoded old URLs in frontend code
- [ ] Browser console shows no 404 errors
- [ ] Customer search works (type in search field)

---

## Troubleshooting

### Still getting 404?
1. Check the URL is correct (copy/paste from Deploy)
2. Wait 30 seconds after deployment (GAS needs time to propagate)
3. Open the deployment URL directly in your browser - should show `{"status":"Liner Order Script is live."}`

### Still getting CORS error?
- Make sure "Who has access" is set to **Anyone**
- Google Apps Script automatically handles CORS for "Anyone" access
- If still blocked, try clearing browser cache

### Customer search not working?
1. Check browser console (F12 → Console tab)
2. Look for error messages
3. Verify the Customers sheet exists in your spreadsheet
4. Verify sheet has columns: Name, Email, Phone, Address

---

## Files Modified

- ✅ `/invoice-netlify/LinerOrderScript.gs` - Backend with customer search
- ✅ `/invoice-netlify/LinerOrderTool.html` - Frontend with search UI + error handling
- Updated error messages to help diagnose deployment issues

---

## Next Steps

Once deployed:
1. Test customer search in Liner Order Tool
2. Verify customer info auto-fills when selected
3. Test full order submission
4. Check that orders are saved to Google Drive

Need help? Check the browser console (F12) for detailed error messages.

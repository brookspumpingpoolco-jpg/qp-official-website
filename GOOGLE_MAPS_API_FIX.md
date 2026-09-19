# Google Maps API Error - Troubleshooting & Fix

## Error Message
```
Oops! Something went wrong.
This page didn't load Google Maps correctly. See the JavaScript console for technical details.
```

## Root Causes

This error occurs when the Google Maps API fails to load. Common causes:

1. **API Key Issues**
   - Key is expired or revoked
   - Key is invalid or malformed
   - Key restrictions prevent usage

2. **API Not Enabled**
   - Maps JavaScript API not enabled in Google Cloud Console
   - Places API not enabled (if using Places features)
   - Billing not set up or quota exceeded

3. **Domain Restrictions**
   - API key is restricted to specific domains
   - Current domain/URL is not whitelisted

4. **CORS Issues**
   - Domain not allowed to call the API

## Current Implementation

**File**: `/Users/joellmatteson/Desktop/The Official Website/invoice-netlify/SchedulingUI.html`

**Current API Key**: `AIzaSyAbxEM5S4vVw7ZO_w2CZh_21JPwrVG2Z7Q`

**Line**: 1629

**Usage**: 
- Route mapping (directions between appointments)
- Customer location display
- Geocoding (address → coordinates)

## How to Fix

### Option 1: Validate Current API Key (Quick Check)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Find the project with API key: `AIzaSyAbxEM5S4vVw7ZO_w2CZh_21JPwrVG2Z7Q`
3. Check:
   - **APIs & Services > Enabled APIs** - Verify these are enabled:
     - ✅ Maps JavaScript API
     - ✅ Places API
     - ✅ Directions API (optional)
     - ✅ Geocoding API (optional)
   - **APIs & Services > Credentials** - Find this key:
     - Status should be "Active"
     - Check "Restrictions" - HTTP referrers should NOT restrict script.google.com apps
     - Check "API restrictions" - Should allow Maps JavaScript API, Geocoding, etc.

### Option 2: Create a New API Key (Recommended)

**Step 1: Create New Key in Google Cloud**
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project (or create new project: "Pool Service Scheduling")
3. **APIs & Services > Credentials**
4. Click **Create Credentials > API Key**
5. Choose **Browser key** (or **Restrict key**)
6. Copy the new key (it looks like `AIzaSy...`)

**Step 2: Enable Required APIs**
In the same console:
1. Click **+ Enable APIs and Services**
2. Search and enable:
   - Maps JavaScript API
   - Places API
   - Geocoding API
   - Directions API

**Step 3: Set API Key Restrictions (Optional but Recommended)**
1. In Credentials, click on your key
2. Under "Application restrictions" select **HTTP referrers (web sites)**
3. Add these referrers:
   - `https://script.google.com/*`
   - Your deployed web app URL (format: `https://script.google.com/macros/d/DEPLOYMENT_ID/userweb`)

**Step 4: Set API Restrictions**
1. Under "API restrictions", select **Restrict key**
2. Select these APIs:
   - Maps JavaScript API
   - Places API  
   - Geocoding API
   - Directions API

**Step 5: Update the Code**
Replace the API key in `SchedulingUI.html` line 1629:

**Find:**
```html
s.src = 'https://maps.googleapis.com/maps/api/js?key=AIzaSyAbxEM5S4vVw7ZO_w2CZh_21JPwrVG2Z7Q&libraries=places&callback=mapsReady&loading=async';
```

**Replace with:**
```html
s.src = 'https://maps.googleapis.com/maps/api/js?key=YOUR_NEW_API_KEY_HERE&libraries=places&callback=mapsReady&loading=async';
```

### Option 3: Disable Maps (If Not Critical)

If Maps functionality is not essential:

1. Open `SchedulingUI.html`
2. In the `loadGoogleMapsAPI()` function (line 1625), modify:
```javascript
function loadGoogleMapsAPI() {
  // Disabled - Maps API not available
  console.log('Maps functionality disabled');
  return;
}
```

3. Add fallback text in map containers (search for `id="customersMapContainer"`, etc.)

## How to Check if Fix Works

1. **Open Browser Console**: 
   - Right-click → Inspect → Console tab
   - Or: Cmd+Option+J (Mac) / Ctrl+Shift+J (Windows/Linux)

2. **Look for:**
   - ✅ `✅ Google Maps API loaded` - Success!
   - ❌ `❌ Failed to load Google Maps API` - Check key/APIs
   - Any red errors related to Maps

3. **Test Features:**
   - Try to view customer map
   - Try to plan route (if available)
   - Try to view appointment on map

## Debugging Steps

If still broken after fixing the key:

1. **Check JavaScript Console for errors**
   - Open Browser DevTools (F12)
   - Console tab - look for red error messages
   - Take screenshot and share the error

2. **Verify API Key Format**
   - Should start with `AIzaSy`
   - Should be ~40 characters
   - No spaces or special characters

3. **Verify Billing**
   - Google Cloud Console → Billing
   - Ensure billing account is linked
   - Check for quota warnings

4. **Test Key Directly**
   - Replace key temporarily in code
   - Reload page
   - Check console for errors

## Fallback Behavior (Currently Enabled)

When Maps fails to load:
- Error message displays: "Google Maps API not loaded. Please refresh the page."
- App continues to work for other features
- Map views are disabled

## Related Files
- Maps initialization: [SchedulingUI.html](SchedulingUI.html#L1625-L1635) (lines 1625-1635)
- Map usage: Lines 2913-2966 (route mapping) and 5485-5580 (customer map)

## Support Resources
- [Google Maps Platform Documentation](https://developers.google.com/maps/documentation)
- [API Key Setup Guide](https://developers.google.com/maps/documentation/javascript/get-api-key)
- [Troubleshooting Guide](https://developers.google.com/maps/documentation/javascript/error-messages)

---
*Last Updated: May 5, 2026*

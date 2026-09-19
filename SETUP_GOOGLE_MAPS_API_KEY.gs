/**
 * Setup Google Maps API Key in Script Properties
 * 
 * Run this function once to set the API key in Script Properties
 * This is more secure than hardcoding it in the main script
 */

function setupGoogleMapsAPIKey() {
  const API_KEY = 'REDACTED';
  
  try {
    PropertiesService.getScriptProperties().setProperty('GOOGLE_MAPS_API_KEY', API_KEY);
    Logger.log('✅ Google Maps API Key set successfully in Script Properties');
    Logger.log('Key: ' + API_KEY.substring(0, 20) + '...');
    
    // Test the key
    testGoogleMapsAPI();
    
    return 'Google Maps API Key configured successfully!';
  } catch (error) {
    Logger.log('❌ Error setting API key: ' + error.toString());
    return 'Error: ' + error.toString();
  }
}

/**
 * Test Google Maps API Key
 * Run this to verify the API key is working
 */
function testGoogleMapsAPI() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GOOGLE_MAPS_API_KEY') || 'AIzaSyAbxEM5S4vVw7ZO_w2CZh_21JPwrVG2Z7Q';
  
  Logger.log('=== Testing Google Maps API ===');
  Logger.log('API Key: ' + (apiKey ? apiKey.substring(0, 20) + '...' : 'NOT SET'));
  
  // Test Geocoding API
  try {
    const testAddress = 'Louisville, KY';
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(testAddress)}&key=${apiKey}`;
    const geocodeResponse = UrlFetchApp.fetch(geocodeUrl);
    const geocodeData = JSON.parse(geocodeResponse.getContentText());
    
    if (geocodeData.status === 'OK') {
      Logger.log('✅ Geocoding API: WORKING');
      Logger.log('   Found: ' + geocodeData.results[0].formatted_address);
    } else {
      Logger.log('❌ Geocoding API: ' + geocodeData.status);
      if (geocodeData.error_message) {
        Logger.log('   Error: ' + geocodeData.error_message);
      }
    }
  } catch (error) {
    Logger.log('❌ Geocoding API: ERROR - ' + error.toString());
  }
  
  // Test Static Maps API
  try {
    const staticUrl = `https://maps.googleapis.com/maps/api/staticmap?center=38.2527,-85.7585&zoom=19&size=640x640&maptype=satellite&key=${apiKey}`;
    const staticResponse = UrlFetchApp.fetch(staticUrl);
    const responseCode = staticResponse.getResponseCode();
    
    if (responseCode === 200) {
      Logger.log('✅ Maps Static API: WORKING');
      Logger.log('   Image size: ' + staticResponse.getBlob().getBytes().length + ' bytes');
    } else {
      Logger.log('❌ Maps Static API: HTTP ' + responseCode);
      const errorText = staticResponse.getContentText();
      if (errorText) {
        Logger.log('   Response: ' + errorText.substring(0, 200));
      }
    }
  } catch (error) {
    Logger.log('❌ Maps Static API: ERROR - ' + error.toString());
  }
}


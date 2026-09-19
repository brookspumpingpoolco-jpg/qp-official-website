/**
 * Test Satellite Image Function
 * Run this to test if the satellite image function is working
 */

function testSatelliteImage() {
  const testAddress = '123 Main St, Louisville, KY 40202';
  
  Logger.log('=== Testing Satellite Image Function ===');
  Logger.log('Test Address: ' + testAddress);
  
  const result = getSatelliteImageForAddress(testAddress);
  
  Logger.log('Result:');
  Logger.log('Success: ' + result.success);
  
  if (result.success) {
    Logger.log('Satellite Image URL: ' + result.satelliteImageUrl);
    Logger.log('Street Image URL: ' + result.streetImageUrl);
    Logger.log('Coordinates: ' + JSON.stringify(result.coordinates));
    Logger.log('Formatted Address: ' + result.formattedAddress);
    
    // Try to fetch the image to verify it's accessible
    try {
      const imageResponse = UrlFetchApp.fetch(result.satelliteImageUrl);
      const responseCode = imageResponse.getResponseCode();
      Logger.log('Image fetch response code: ' + responseCode);
      
      if (responseCode === 200) {
        const imageSize = imageResponse.getBlob().getBytes().length;
        Logger.log('✅ Image is accessible! Size: ' + imageSize + ' bytes');
      } else {
        Logger.log('❌ Image fetch failed with code: ' + responseCode);
        Logger.log('Response: ' + imageResponse.getContentText().substring(0, 200));
      }
    } catch (error) {
      Logger.log('❌ Error fetching image: ' + error.toString());
    }
  } else {
    Logger.log('❌ Error: ' + result.error);
  }
  
  return result;
}




/**
 * Setup OpenAI API Key for Customer Portal AI Assistant
 * Run this function once to configure the API key
 */
function setupOpenAIKey() {
  try {
    const apiKey = 'REDACTED';
    
    PropertiesService.getScriptProperties().setProperty('OPENAI_API_KEY', apiKey);
    
    Logger.log('✅ OpenAI API Key set successfully!');
    Logger.log('Key: ' + apiKey.substring(0, 20) + '...');
    
    return 'OpenAI API Key configured successfully! The AI Assistant is now ready to use.';
  } catch (error) {
    Logger.log('❌ Error setting OpenAI API Key: ' + error.toString());
    return 'Error: ' + error.toString();
  }
}

/**
 * Test OpenAI API connection
 */
function testOpenAI() {
  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
    
    if (!apiKey) {
      Logger.log('❌ OpenAI API Key not found. Please run setupOpenAIKey() first.');
      return 'API Key not configured. Please run setupOpenAIKey() first.';
    }
    
    Logger.log('✅ OpenAI API Key found: ' + apiKey.substring(0, 20) + '...');
    
    // Test API call
    const url = 'https://api.openai.com/v1/chat/completions';
    const payload = {
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Say "Hello, I am working!"' }
      ],
      max_tokens: 20
    };
    
    const options = {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode === 200) {
      const result = JSON.parse(responseText);
      Logger.log('✅ OpenAI API Test: SUCCESS');
      Logger.log('Response: ' + (result.choices && result.choices[0] ? result.choices[0].message.content : 'No response'));
      return 'OpenAI API is working correctly!';
    } else {
      Logger.log('❌ OpenAI API Test: FAILED');
      Logger.log('Response Code: ' + responseCode);
      Logger.log('Response: ' + responseText);
      return 'API Test failed. Response code: ' + responseCode;
    }
    
  } catch (error) {
    Logger.log('❌ Error testing OpenAI API: ' + error.toString());
    return 'Error: ' + error.toString();
  }
}


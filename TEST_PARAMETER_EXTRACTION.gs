/**
 * Test script for parameter extraction
 * Run this in Google Apps Script editor to test doPost parameter parsing
 * 
 * Usage: Open the script editor, select this function, and click Run
 */

function testParameterExtraction() {
  Logger.clear();
  Logger.log('🧪 TESTING PARAMETER EXTRACTION');
  Logger.log('===============================================');
  
  // Test 1: Simulate form-encoded POST request
  Logger.log('\n📝 TEST 1: Form-encoded POST (like fetch with URLSearchParams)');
  Logger.log('───────────────────────────────────────────────');
  
  const testEvent1 = {
    postData: {
      type: 'application/x-www-form-urlencoded',
      contents: 'action=saveInvoiceEstimate&data=%7B%22type%22%3A%22Invoice%22%7D'
    },
    parameter: {}
  };
  
  simulateParameterExtraction(testEvent1);
  
  // Test 2: Simulate with sendInvoiceEstimate
  Logger.log('\n📝 TEST 2: sendInvoiceEstimate action');
  Logger.log('───────────────────────────────────────────────');
  
  const testEvent2 = {
    postData: {
      type: 'application/x-www-form-urlencoded',
      contents: 'action=sendInvoiceEstimate&data=%7B%22type%22%3A%22Invoice%22%7D'
    },
    parameter: {}
  };
  
  simulateParameterExtraction(testEvent2);
  
  // Test 3: Simulate with e.parameter already set (Apps Script sometimes pre-parses)
  Logger.log('\n📝 TEST 3: e.parameter already populated');
  Logger.log('───────────────────────────────────────────────');
  
  const testEvent3 = {
    postData: {
      type: 'application/x-www-form-urlencoded',
      contents: 'action=saveInvoiceEstimate&data=%7B%22type%22%3A%22Invoice%22%7D'
    },
    parameter: {
      action: 'saveInvoiceEstimate',
      data: '{"type":"Invoice"}'
    }
  };
  
  simulateParameterExtraction(testEvent3);
  
  // Test 4: JSON content type
  Logger.log('\n📝 TEST 4: JSON POST body');
  Logger.log('───────────────────────────────────────────────');
  
  const testEvent4 = {
    postData: {
      type: 'application/json',
      contents: '{"action":"sendInvoiceEstimate","data":{"type":"Invoice"}}'
    },
    parameter: {}
  };
  
  simulateParameterExtraction(testEvent4);
  
  Logger.log('\n✅ TESTS COMPLETE - Check logs above');
}

function simulateParameterExtraction(e) {
  // EXACT COPY of parameter extraction from doPost
  let action = null;
  
  Logger.log('🔍 EXTRACTION DEBUG:');
  Logger.log('1. e.parameter exists: ' + (e.parameter ? 'YES' : 'NO'));
  if (e.parameter) {
    Logger.log('1a. e.parameter.action: ' + (e.parameter.action || 'EMPTY'));
  }
  Logger.log('2. e.postData exists: ' + (e.postData ? 'YES' : 'NO'));
  if (e.postData) {
    Logger.log('3. e.postData.type: "' + (e.postData.type || 'NO TYPE') + '"');
    Logger.log('4. e.postData.contents length: ' + (e.postData.contents ? e.postData.contents.length : 0));
    Logger.log('5. e.postData.contents preview: "' + (e.postData.contents ? e.postData.contents.substring(0, 100) : 'NO CONTENTS') + '"');
  }
  
  // PRIMARY: Parse postData directly (more reliable than e.parameter)
  if (e.postData && e.postData.contents) {
    const postContentType = (e.postData.type || '').toLowerCase();
    Logger.log('6. postContentType (lowercased): "' + postContentType + '"');
    
    if (postContentType.indexOf('application/json') !== -1) {
      try {
        Logger.log('7. Attempting to parse as JSON...');
        const parsed = JSON.parse(e.postData.contents);
        Logger.log('9. Parsed JSON successfully');
        Logger.log('9a. JSON keys: ' + Object.keys(parsed).join(', '));
        if (parsed.action) {
          action = parsed.action;
          Logger.log('9b. Found action in JSON: ' + action);
        }
        if (!e.parameter) e.parameter = {};
        Object.keys(parsed).forEach(function(k) { e.parameter[k] = parsed[k]; });
      } catch (parseError) {
        Logger.log('Error parsing JSON postData: ' + parseError.toString());
      }
    } else {
      // DEFAULT: Try parsing as form-encoded (most common from fetch with URLSearchParams)
      // This handles: application/x-www-form-urlencoded, empty string, or any other type
      try {
        Logger.log('10. Attempting to parse as form-encoded (default)...');
        const params = e.postData.contents.split('&');
        Logger.log('11. Number of params after split: ' + params.length);
        for (let i = 0; i < params.length; i++) {
          const param = params[i];
          const equalIndex = param.indexOf('=');
          if (equalIndex > 0) {
            const key = decodeURIComponent(param.substring(0, equalIndex).replace(/\+/g, ' '));
            const value = decodeURIComponent(param.substring(equalIndex + 1).replace(/\+/g, ' '));
            Logger.log('12.' + i + ' Key="' + key + '", Value length=' + value.length);
            if (key === 'action') {
              action = value;
              Logger.log('   ✓ Found action from form: "' + action + '"');
            }
            if (!e.parameter) e.parameter = {};
            e.parameter[key] = value;
          }
        }
        Logger.log('14. After form parsing, action="' + action + '"');
      } catch (parseError) {
        Logger.log('Error parsing form-encoded postData: ' + parseError.toString());
      }
    }
  }
  
  // FALLBACK: Use e.parameter if postData parsing didn't work
  if (!action && e.parameter && e.parameter.action) {
    Logger.log('15. Falling back to e.parameter.action');
    action = e.parameter.action;
  }
  
  Logger.log('16. Final action value: "' + action + '" (type: ' + typeof action + ')');
  
  // Test matching
  Logger.log('\n✅ MATCHING TEST:');
  Logger.log('   action === "saveInvoiceEstimate": ' + (action === 'saveInvoiceEstimate'));
  Logger.log('   action === "sendInvoiceEstimate": ' + (action === 'sendInvoiceEstimate'));
  
  if (!action) {
    Logger.log('❌ FAILED: action is null/empty');
  } else if (action === 'saveInvoiceEstimate' || action === 'sendInvoiceEstimate') {
    Logger.log('✅ SUCCESS: action extracted and will match in doPost');
  } else {
    Logger.log('⚠️  WARNING: action extracted but is: "' + action + '"');
  }
}

#!/usr/bin/env node

/**
 * Test script for InvoiceEstimate GAS endpoint
 * Tests parameter extraction and action handling
 */

const https = require('https');
const querystring = require('querystring');

const GAS_URL = 'https://script.google.com/macros/s/AKfycbwLA42XCQlF-IgFrhvF3StniUpuZp-ZuKGCoBIuL5uJxu8_rtynQWDv2zUMTrOsiMhxig/exec';

function testAction(action, data = {}) {
  return new Promise((resolve, reject) => {
    const body = querystring.stringify({
      action: action,
      data: JSON.stringify(data)
    });

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    console.log(`\n🧪 Testing action: ${action}`);
    console.log(`📤 Request body: ${body.substring(0, 150)}...`);

    const req = https.request(GAS_URL, options, (res) => {
      let responseData = '';

      res.on('data', chunk => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const result = JSON.parse(responseData);
          console.log(`✅ Response received (${res.statusCode})`);
          console.log(`📋 Result:`, JSON.stringify(result, null, 2));
          resolve(result);
        } catch (e) {
          console.log(`❌ Failed to parse response as JSON`);
          console.log(`📝 Raw response: ${responseData.substring(0, 500)}`);
          reject(e);
        }
      });
    });

    req.on('error', (error) => {
      console.error(`❌ Request failed:`, error.message);
      reject(error);
    });

    req.write(body);
    req.end();
  });
}

async function runTests() {
  console.log('🚀 Starting GAS endpoint tests...');
  console.log(`📍 Endpoint: ${GAS_URL}`);

  try {
    // Test 1: saveInvoiceEstimate with minimal data
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 1: saveInvoiceEstimate');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const testData = {
      type: 'Invoice',
      customerName: 'Test Customer',
      customerEmail: 'test@example.com',
      items: JSON.stringify([{ name: 'Test Item', quantity: 1, unitPrice: 100 }]),
      subtotal: 100,
      tax: 10,
      total: 110,
      status: 'Draft'
    };

    const saveResult = await testAction('saveInvoiceEstimate', testData);
    
    if (saveResult.success) {
      console.log('✅ saveInvoiceEstimate PASSED');
    } else {
      console.log('❌ saveInvoiceEstimate FAILED:', saveResult.error);
    }

    // Test 2: sendInvoiceEstimate
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 2: sendInvoiceEstimate');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const sendData = {
      type: 'Invoice',
      customerName: 'Test Customer',
      customerEmail: 'test@example.com',
      items: JSON.stringify([{ name: 'Test Item', quantity: 1, unitPrice: 100 }]),
      subtotal: 100,
      tax: 10,
      total: 110
    };

    const sendResult = await testAction('sendInvoiceEstimate', sendData);
    
    if (sendResult.success) {
      console.log('✅ sendInvoiceEstimate PASSED');
    } else if (sendResult.error && sendResult.error.indexOf('customer') !== -1) {
      console.log('⚠️  sendInvoiceEstimate action was recognized (parameter extraction worked!)');
      console.log('   Error is about customer email validation, not action parsing');
    } else {
      console.log('❌ sendInvoiceEstimate FAILED:', sendResult.error);
    }

    // Test 3: Invalid action (should fail gracefully)
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 3: Invalid action (sanity check)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    try {
      const invalidResult = await testAction('invalidAction123', {});
      if (invalidResult.error && invalidResult.error.indexOf('Invalid action') !== -1) {
        console.log('✅ Invalid action correctly rejected');
      }
    } catch (e) {
      console.log('Error testing invalid action:', e.message);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Tests complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  }
}

runTests();

/**
 * Simple Middleman Server
 * Receives Stripe webhooks and forwards to Google Apps Script
 * 
 * Deploy to: Render.com, Railway.app, Fly.io, or Glitch.com (all free)
 */

const express = require('express');
const axios = require('axios');
const app = express();

// Your GAS WebApp URL - UPDATE THIS!
const GAS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbyhct9wCN-5LzNwqvnv4yofnzN-bGoPw1gF6BNqfZos23Nx5ktsKEVTP_CNxBB4FaOaFA/exec';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'Stripe → GAS Middleman',
    timestamp: new Date().toISOString()
  });
});

// Main webhook endpoint (Stripe calls this)
app.post('/stripe-webhook', async (req, res) => {
  const webhookId = req.headers['stripe-signature'] ? 'signed' : 'unsigned';
  const eventType = req.body?.type || 'unknown';
  
  console.log(`[${new Date().toISOString()}] Webhook received: ${eventType} (${webhookId})`);
  
  try {
    // CRITICAL: Return 200 OK to Stripe IMMEDIATELY
    // Stripe requires a response within 5 seconds
    res.status(200).json({ 
      received: true,
      type: eventType,
      timestamp: new Date().toISOString()
    });
    
    // Now forward to GAS asynchronously (don't wait)
    // This handles 302 redirects automatically
    forwardToGAS(req.body)
      .then(() => {
        console.log(`[${new Date().toISOString()}] Successfully forwarded ${eventType} to GAS`);
      })
      .catch((error) => {
        console.error(`[${new Date().toISOString()}] Error forwarding to GAS:`, error.message);
        // Don't fail - we already returned 200 to Stripe
      });
      
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Webhook processing error:`, error);
    // Still return 200 to Stripe (don't retry)
    res.status(200).json({ 
      received: true,
      error: error.message 
    });
  }
});

// Forward webhook to Google Apps Script
async function forwardToGAS(webhookData) {
  try {
    const response = await axios.post(
      GAS_WEBAPP_URL,
      webhookData,
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Stripe-Webhook-Middleman/1.0'
        },
        maxRedirects: 5, // Follow redirects (handles 302)
        timeout: 30000, // 30 second timeout
        validateStatus: (status) => {
          // Accept 200, 302, etc. (don't throw on redirects)
          return status < 500;
        }
      }
    );
    
    console.log(`GAS Response: ${response.status} ${response.statusText}`);
    return response;
    
  } catch (error) {
    if (error.response) {
      // Got a response (even if it's a redirect)
      console.log(`GAS Response: ${error.response.status} ${error.response.statusText}`);
      return error.response;
    } else {
      // Network error
      throw error;
    }
  }
}

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Stripe → GAS Webhook Middleman',
    endpoints: {
      health: '/health',
      webhook: '/stripe-webhook (POST)'
    },
    gasUrl: GAS_WEBAPP_URL
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Middleman server running on port ${PORT}`);
  console.log(`📡 Webhook endpoint: http://localhost:${PORT}/stripe-webhook`);
  console.log(`🔗 Forwarding to: ${GAS_WEBAPP_URL}`);
});



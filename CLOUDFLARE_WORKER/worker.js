/**
 * Cloudflare Worker: Stripe → GAS Webhook Middleman
 * 
 * Deploy this to Cloudflare Workers (free tier)
 * 
 * Setup:
 * 1. Sign up at cloudflare.com (free)
 * 2. Workers & Pages → Create Worker
 * 3. Paste this code
 * 4. Update GAS_WEBAPP_URL below
 * 5. Deploy
 * 6. Use worker URL in Stripe webhooks
 */

// Your Google Apps Script WebApp URL - UPDATE THIS!
const GAS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbyhct9wCN-5LzNwqvnv4yofnzN-bGoPw1gF6BNqfZos23Nx5ktsKEVTP_CNxBB4FaOaFA/exec';

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Health check endpoint
    if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        service: 'Stripe → GAS Middleman',
        timestamp: new Date().toISOString(),
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Handle Stripe webhook (POST only)
    if (request.method === 'POST') {
      try {
        // Get webhook payload
        const body = await request.json();
        const eventType = body?.type || 'unknown';
        
        // Log the event (visible in Cloudflare dashboard)
        console.log(`[${new Date().toISOString()}] Webhook received: ${eventType}`);
        
        // CRITICAL: Return 200 OK to Stripe IMMEDIATELY
        // Stripe requires response within 5 seconds
        const response = new Response(JSON.stringify({
          received: true,
          type: eventType,
          timestamp: new Date().toISOString(),
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
        
        // Forward to GAS asynchronously (don't wait for it)
        // This handles 302 redirects automatically
        ctx.waitUntil(
          forwardToGAS(body).catch((error) => {
            console.error(`Error forwarding to GAS: ${error.message}`);
            // Don't fail - we already returned 200 to Stripe
          })
        );
        
        return response;
        
      } catch (error) {
        console.error('Webhook processing error:', error);
        // Still return 200 to Stripe (don't cause retries)
        return new Response(JSON.stringify({
          received: true,
          error: error.message,
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    }

    // Default response for other methods
    return new Response(JSON.stringify({
      service: 'Stripe → GAS Webhook Middleman',
      endpoints: {
        webhook: 'POST / (Stripe webhook endpoint)',
        health: 'GET /health',
      },
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  },
};

// Forward webhook to Google Apps Script
async function forwardToGAS(webhookData) {
  try {
    const response = await fetch(GAS_WEBAPP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Stripe-Webhook-Middleman/1.0',
      },
      body: JSON.stringify(webhookData),
      // Cloudflare Workers automatically follow redirects
      redirect: 'follow',
    });
    
    console.log(`GAS Response: ${response.status} ${response.statusText}`);
    return response;
    
  } catch (error) {
    console.error('Error forwarding to GAS:', error);
    throw error;
  }
}



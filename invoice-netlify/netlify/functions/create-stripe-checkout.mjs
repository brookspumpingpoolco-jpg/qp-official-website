export const handler = async (event) => {
  const json = (statusCode, body) => ({
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST,OPTIONS'
    },
    body: JSON.stringify(body)
  });

  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
  if (event.httpMethod !== 'POST') return json(405, { success: false, error: 'Method not allowed' });

  try {
    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY || '';
    if (!STRIPE_SECRET_KEY) {
      return json(500, { success: false, error: 'Missing STRIPE_SECRET_KEY in Netlify environment variables' });
    }

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf8')
      : (event.body || '{}');
    const body = JSON.parse(rawBody || '{}');
    const customerEmail = String(body.customerEmail || '').trim();
    const customerName = String(body.customerName || '').trim() || 'Customer';
    const description = String(body.description || 'Milestone Payment').trim();
    const amount = Number(body.amount || 0);
    const invoiceId = String(body.invoiceId || '').trim() || ('INV-' + Date.now());
    const projectId = String(body.projectId || '').trim();

    const parseBooleanFlag = (value, defaultValue) => {
      if (value === undefined || value === null || value === '') return defaultValue;
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return value !== 0;

      const normalized = String(value).trim().toLowerCase();
      if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
      if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;

      return defaultValue;
    };

    const addProcessingFee = parseBooleanFlag(body.addProcessingFee, true);
    const ttlHoursRaw = Number(body.sessionTtlHours || 24);
    const ttlHours = Number.isFinite(ttlHoursRaw) ? Math.min(24, Math.max(1, ttlHoursRaw)) : 24;
    const successUrl = String(body.successUrl || 'https://www.aqualitypoolcompanyusa.com/payment-success').trim();
    const cancelUrl = String(body.cancelUrl || 'https://www.aqualitypoolcompanyusa.com/payment-cancelled').trim();

    if (!customerEmail) return json(400, { success: false, error: 'Missing customerEmail' });
    if (!(amount > 0)) return json(400, { success: false, error: 'Invalid amount' });

    const baseAmount = Math.round(amount * 100) / 100;
    const processingFee = addProcessingFee ? Math.round(((baseAmount * 0.029) + 0.29) * 100) / 100 : 0;

    const payload = new URLSearchParams();
    payload.append('line_items[0][price_data][currency]', 'usd');
    payload.append('line_items[0][price_data][product_data][name]', `${description} (Base Amount)`);
    payload.append('line_items[0][price_data][product_data][description]', `Milestone base amount for ${customerName}`);
    payload.append('line_items[0][price_data][unit_amount]', String(Math.round(baseAmount * 100)));
    payload.append('line_items[0][quantity]', '1');

    if (processingFee > 0) {
      payload.append('line_items[1][price_data][currency]', 'usd');
      payload.append('line_items[1][price_data][product_data][name]', 'Processing Fee');
      payload.append('line_items[1][price_data][product_data][description]', 'Credit card processing fee (2.9% + $0.29)');
      payload.append('line_items[1][price_data][unit_amount]', String(Math.round(processingFee * 100)));
      payload.append('line_items[1][quantity]', '1');
      payload.append('custom_text[submit][message]', 'Checkout total includes base amount + processing fee.');
    }

    payload.append('mode', 'payment');
    payload.append('customer_email', customerEmail);
    payload.append('billing_address_collection', 'required');
    payload.append('automatic_tax[enabled]', 'true');
    // Stripe Checkout sessions cannot be indefinite.
    // Max TTL is 24 hours; set explicitly to max unless caller provides 1..24 hours.
    const expiresAt = Math.floor(Date.now() / 1000) + (ttlHours * 60 * 60);
    payload.append('expires_at', String(expiresAt));
    // Provide Stripe recovery flow so expired links can be recovered instead of dead-ending.
    payload.append('after_expiration[recovery][enabled]', 'true');
    payload.append('success_url', `${successUrl}${successUrl.includes('?') ? '&' : '?'}invoice_id=${encodeURIComponent(invoiceId)}`);
    payload.append('cancel_url', cancelUrl);
    payload.append('metadata[invoice_id]', invoiceId);
    payload.append('metadata[project_id]', projectId);
    payload.append('metadata[milestone_name]', description);
    payload.append('metadata[base_amount]', baseAmount.toFixed(2));
    payload.append('metadata[processing_fee]', processingFee.toFixed(2));
    payload.append('metadata[total_charge_amount]', (baseAmount + processingFee).toFixed(2));
    payload.append('metadata[add_processing_fee]', addProcessingFee ? 'true' : 'false');

    const stripeResp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: payload
    });

    const stripeText = await stripeResp.text();
    let stripeJson = {};
    try { stripeJson = JSON.parse(stripeText || '{}'); } catch (_) {}

    if (!stripeResp.ok || !stripeJson.url) {
      const err = (stripeJson && stripeJson.error && stripeJson.error.message)
        ? stripeJson.error.message
        : `Stripe error HTTP ${stripeResp.status}`;
      return json(502, { success: false, error: err, stripeStatus: stripeResp.status });
    }

    return json(200, {
      success: true,
      paymentUrl: stripeJson.url,
      sessionId: stripeJson.id,
      expiresAt,
      recoveryEnabled: true,
      baseAmount,
      processingFee,
      totalAmount: baseAmount + processingFee
    });
  } catch (err) {
    return json(500, { success: false, error: err?.message || String(err) });
  }
};

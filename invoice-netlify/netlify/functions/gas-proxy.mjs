/**
 * Proxies GET/POST to Google Apps Script web apps (same-origin for the browser).
 * Deploy: this file must live under netlify/functions/ relative to Netlify "Base directory".
 */
const DEFAULTS = {
  main: 'https://script.google.com/macros/s/AKfycbzK5KG4n3dJHCQxAN6_oc2yCqY1pfchuvemUSKm9bU4ZhiwdKiG7vkyDwqaksOfk5e4/exec',
  acct: 'https://script.google.com/macros/s/AKfycbwWBxU5E8EZdj6GnyTBQd_oi3q7424TbLWeGbRXcVe5i3H9HjzQ1iuWGxLXxitXMh_C/exec',
  payment: 'https://script.google.com/macros/s/AKfycbyhct9wCN-5LzNwqvnv4yofnzN-bGoPw1gF6BNqfZos23Nx5ktsKEVTP_CNxBB4FaOaFA/exec',
  scheduling: 'https://script.google.com/macros/s/AKfycbxZcMYdXanrOJRd-l5aKeL_qvZoJv7PWGlBp_1gVbgo5FAiC1U7-EMdoBQEqNP6QHmvjw/exec',
  /** PoolFlowPro / Login_Embed → AuthenticationScript web app */
  auth: 'https://script.google.com/macros/s/AKfycbw5FBpDpuc4brNeQUEx4vr9Ndbc01toRVApoBJiYSagFImliWscvHQ4kO1nuLp6wd82/exec',
  /** Heritage Pool Supply — Liner Order Tool (LinerOrderScript.gs) */
  liner: 'https://script.google.com/macros/s/AKfycbzWiBKiUhHuUWEu_1V3wr6yLaEzhgK6bT1IsYYU8xCIZIPuTc_DmhLB5mPUZd7JucZ2ag/exec',
  /** Service Report Web App (Code.gs) */
  sr: 'https://script.google.com/macros/s/AKfycbwIQFP_7t1zr74hGD6bZ4IopoHaOzZ971J0FhGTI_AA1fk4w9dfv--sB3QsVwUD9jFg/exec',
};

function targets() {
  return {
    main: process.env.GAS_MAIN_URL || DEFAULTS.main,
    acct: process.env.GAS_ACCT_URL || DEFAULTS.acct,
    payment: process.env.GAS_PAYMENT_URL || DEFAULTS.payment,
    scheduling: process.env.GAS_SCHEDULING_URL || DEFAULTS.scheduling,
    auth: process.env.GAS_AUTH_URL || DEFAULTS.auth,
    liner: process.env.GAS_LINER_URL || DEFAULTS.liner,
    sr: process.env.GAS_SR_URL || DEFAULTS.sr,
  };
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function getRawQuery(event) {
  if (event.rawQuery != null && event.rawQuery !== '') return event.rawQuery;
  const p = event.queryStringParameters;
  if (!p) return '';
  const sp = new URLSearchParams();
  Object.entries(p).forEach(([k, v]) => {
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
    else if (v != null) sp.set(k, v);
  });
  return sp.toString();
}

/**
 * When the auth web app returns HTML (wrong deployment, login wall) or empty body,
 * the login UI expects JSON. Return a JSON error string instead of raw HTML.
 * @param {{ targetUrl?: string }} [ctx] — logged on failure so Netlify function logs show which URL was used
 * @returns {string|null} replacement body, or null to keep upstream text as-is
 */
function coerceAuthProxyBody(text, httpStatus, ctx = {}) {
  const targetUrl = ctx.targetUrl || '';
  const raw = String(text || '')
    .trim()
    .replace(/^\uFEFF/, '');
  if (!raw) {
    console.log('[gas-proxy][auth] upstream empty body', { httpStatus, targetUrl });
    return JSON.stringify({
      success: false,
      message:
        'Empty response from authentication server. Confirm GAS_AUTH_URL (or DEFAULTS.auth) matches the latest AuthenticationScript /exec URL from Deploy → Manage deployments.',
    });
  }
  try {
    JSON.parse(raw);
    return null;
  } catch (_) {
    const looksHtml =
      /^<!DOCTYPE/i.test(raw) ||
      /^<html/i.test(raw) ||
      (raw.startsWith('<') && /<\s*html[\s>]/i.test(raw));
    const preview = raw.slice(0, 500).replace(/\s+/g, ' ');
    console.log('[gas-proxy][auth] upstream not valid JSON', {
      httpStatus,
      targetUrl,
      bodyLength: raw.length,
      looksHtml,
      preview,
    });
    if (looksHtml) {
      return JSON.stringify({
        success: false,
        message:
          'Authentication server returned HTML instead of JSON. That usually means the proxy URL is not your AuthenticationScript web app (wrong GAS_AUTH_URL, old deployment ID, or a different Apps Script project). Open Apps Script → Deploy → Manage deployments and copy the current /exec URL into Netlify GAS_AUTH_URL (or update DEFAULTS.auth). "Who has access: Anyone" alone does not fix this if the URL points at the wrong deployment.',
        httpStatus,
      });
    }
    return JSON.stringify({
      success: false,
      message: 'Invalid JSON from authentication server.',
      preview: raw.slice(0, 180).replace(/\s+/g, ' '),
      httpStatus,
    });
  }
}

/**
 * Convert upstream HTML timeout/error pages into JSON so the frontend
 * can parse and handle retries gracefully.
 */
function coerceApiProxyBody(text, httpStatus, ctx = {}) {
  const targetUrl = ctx.targetUrl || '';
  const raw = String(text || '')
    .trim()
    .replace(/^\uFEFF/, '');

  if (!raw) {
    if (httpStatus >= 500) {
      console.log('[gas-proxy][api] upstream empty error body', { httpStatus, targetUrl });
      return JSON.stringify({
        success: false,
        error: 'Upstream server returned HTTP ' + httpStatus + ' with an empty body. Check Apps Script execution logs for the failing run.',
        errorType: 'empty_upstream_error',
        retryable: true,
        httpStatus,
      });
    }
    return null;
  }

  try {
    JSON.parse(raw);
    return null;
  } catch (_) {
    const looksHtml =
      /^<!DOCTYPE/i.test(raw) ||
      /^<html/i.test(raw) ||
      (raw.startsWith('<') && /<\s*html[\s>]/i.test(raw));
    if (!looksHtml) return null;

    const inactivityTimeout =
      /inactivity timeout/i.test(raw) ||
      /too much time has passed without sending any data/i.test(raw);
    const gatewayTimeout = /gateway timeout/i.test(raw);

    console.log('[gas-proxy][api] upstream non-JSON HTML', {
      httpStatus,
      targetUrl,
      inactivityTimeout,
      gatewayTimeout,
      preview: raw.slice(0, 220).replace(/\s+/g, ' '),
    });

    if (inactivityTimeout || gatewayTimeout || httpStatus === 504) {
      return JSON.stringify({
        success: false,
        error:
          'Upstream timeout while Google Apps Script processed the request. Please retry.',
        errorType: 'timeout',
        retryable: true,
        httpStatus,
      });
    }

    return JSON.stringify({
      success: false,
      error: 'Upstream server returned HTML instead of JSON.',
      errorType: 'invalid_upstream_response',
      retryable: httpStatus >= 500,
      httpStatus,
    });
  }
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  const T = targets();
  const rawQuery = getRawQuery(event);
  const params = new URLSearchParams(rawQuery);
  const t = params.get('t') || 'main';
  const customTargetUrl = params.get('targetUrl') || params.get('url');
  params.delete('t');
  params.delete('targetUrl');
  params.delete('url');
  let targetUrl = customTargetUrl ? String(customTargetUrl) : T[t];

  if (customTargetUrl && !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec/.test(targetUrl)) {
    return {
      statusCode: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: 'Invalid custom proxy target URL' }),
    };
  }

  if (!targetUrl) {
    return {
      statusCode: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: 'Invalid proxy target' }),
    };
  }

  try {
    if (event.httpMethod === 'GET') {
      const q = params.toString();
      const url = q ? `${targetUrl}?${q}` : targetUrl;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 55000); // 55 second timeout for long-running PDF operations
      try {
        const res = await fetch(url, { redirect: 'follow', signal: controller.signal });
        clearTimeout(timeoutId);
        const text = await res.text();
        let outBody = text;
        let outCt = res.headers.get('content-type') || 'application/json; charset=utf-8';
        if (t !== 'auth') {
          const coerced = coerceApiProxyBody(text, res.status, { targetUrl: url });
          if (coerced != null) {
            outBody = coerced;
            outCt = 'application/json; charset=utf-8';
          }
        }
        return { statusCode: res.status, headers: { ...cors, 'Content-Type': outCt }, body: outBody };
      } catch (e) {
        clearTimeout(timeoutId);
        if (e.name === 'AbortError') {
          return {
            statusCode: 504,
            headers: { ...cors, 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: false, error: 'Request timeout - operation took too long (>55s). Try again or check GAS logs for errors.' }),
          };
        }
        throw e;
      }
    }

    if (event.httpMethod === 'POST') {
      const headers = {};
      const ct = event.headers['content-type'] || event.headers['Content-Type'];
      if (ct) headers['Content-Type'] = ct;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 55000); // 55 second timeout for long-running ops like PDF generation + email
      try {
        const res = await fetch(targetUrl, {
          method: 'POST',
          headers,
          body: event.isBase64Encoded ? Buffer.from(event.body || '', 'base64') : (event.body || ''),
          redirect: 'follow',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const text = await res.text();
        let outBody = text;
        let outCt = res.headers.get('content-type') || 'application/json; charset=utf-8';
        if (t === 'auth') {
          const coerced = coerceAuthProxyBody(text, res.status, { targetUrl });
          if (coerced != null) {
            outBody = coerced;
            outCt = 'application/json; charset=utf-8';
          }
        } else {
          const coerced = coerceApiProxyBody(text, res.status, { targetUrl });
          if (coerced != null) {
            outBody = coerced;
            outCt = 'application/json; charset=utf-8';
          }
        }
        return { statusCode: res.status, headers: { ...cors, 'Content-Type': outCt }, body: outBody };
      } catch (e) {
        clearTimeout(timeoutId);
        if (e.name === 'AbortError') {
          return {
            statusCode: 504,
            headers: { ...cors, 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: false, error: 'Request timeout - operation took too long (>55s). Try again or check GAS logs for errors.' }),
          };
        }
        throw e;
      }
    }

    return {
      statusCode: 405,
      headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ success: false, error: 'Method Not Allowed' }),
    };
  } catch (e) {
    return {
      statusCode: 502,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: e.message || 'Proxy error' }),
    };
  }
};

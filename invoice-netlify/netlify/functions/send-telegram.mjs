const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function buildReplyMarkup(buttons) {
  const valid = (Array.isArray(buttons) ? buttons : []).filter((b) => b && b.text && b.url);
  if (!valid.length) return null;
  return {
    inline_keyboard: valid.map((b) => [{ text: String(b.text), url: String(b.url) }]),
  };
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ success: false, error: 'Method Not Allowed' }) };
  }

  try {
    const token = process.env.TELEGRAM_BOT_TOKEN || process.env.BROOKS_TELEGRAM_BOT_TOKEN || '';
    const chatId = process.env.TELEGRAM_CHAT_ID || process.env.BROOKS_TELEGRAM_CHAT_ID || '';

    if (!token || !chatId) {
      return {
        statusCode: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'Missing TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID env vars (or BROOKS_* aliases).'
        })
      };
    }

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf8')
      : (event.body || '{}');

    let payloadIn = {};
    try {
      payloadIn = JSON.parse(rawBody || '{}');
    } catch (e) {
      return {
        statusCode: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'Invalid JSON body' })
      };
    }

    const text = String(payloadIn.text || '').trim();
    const buttons = payloadIn.buttons;

    if (!text) {
      return {
        statusCode: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'Missing text' })
      };
    }

    const outgoing = {
      chat_id: String(chatId),
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    };

    const markup = buildReplyMarkup(buttons);
    if (markup) outgoing.reply_markup = markup;

    const tgResp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(outgoing),
    });

    const tgText = await tgResp.text();
    if (!tgResp.ok) {
      return {
        statusCode: tgResp.status,
        headers: { ...cors, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: `Telegram HTTP ${tgResp.status}: ${tgText}` })
      };
    }

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: e && e.message ? e.message : String(e) })
    };
  }
};

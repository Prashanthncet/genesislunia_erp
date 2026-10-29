import { toE164 } from './src/notifications/providers.ts';

const [,, rawRecipient, ...bodyParts] = process.argv;
if (!rawRecipient || bodyParts.length === 0) {
  console.error('usage: node run-vonage-sms.mjs <recipient> <message>');
  process.exit(2);
}

const recipient = rawRecipient;
const body = bodyParts.join(' ');

const apiKey = process.env['VONAGE_API_KEY'];
const apiSecret = process.env['VONAGE_API_SECRET'];
const vonageNumber = process.env['VONAGE_NUMBER'];
const base = (process.env['VONAGE_API_BASE'] ?? 'https://api.nexmo.com').replace(/\/$/, '');

if (!apiKey || !apiSecret || !vonageNumber) {
  console.error('missing env: VONAGE_API_KEY, VONAGE_API_SECRET, VONAGE_NUMBER');
  process.exit(2);
}

const recipientE164 = toE164(recipient);
const payload = JSON.stringify({
  sender: vonageNumber,
  recipient: recipientE164,
  type: 'sms',
  message: { text: body },
}, null, 2);

const auth = 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
const requestShape = {
  method: 'POST',
  base: base,
  url: `/v1.messages`,
  headers: { Authorization: auth, 'Content-Type': 'application/json' },
  body: payload,
};

console.log(' recipient         :', recipient);
console.log(' recipient E.164   :', recipientE164);
console.log(' sender            :', vonageNumber);
console.log(' body              :', body);
console.log(' url               :', `${base}/v1.messages`);
console.log(' auth header       :', auth);
console.log(' request body      :\n', payload);

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), Number(process.env['NOTIFY_TIMEOUT_MS'] ?? 10000));

try {
  const res = await fetch(`${base}/v1.messages`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: payload,
    signal: controller.signal,
  });

  let text = '';
  try { text = await res.text(); } catch {}
  console.log(' response status   :', res.status);
  console.log(' response headers  :', Object.fromEntries(res.headers.entries()).reduce((a, [k, v]) => (a[k] = v, a), {}));
  console.log(' response body     :', text ? text.slice(0, 2000) : '(empty)');
  process.exit(res.ok ? 0 : 3);
} catch (e) {
  console.error(' failed            :', e?.message ?? e);
  process.exit(4);
} finally {
  clearTimeout(timeout);
}

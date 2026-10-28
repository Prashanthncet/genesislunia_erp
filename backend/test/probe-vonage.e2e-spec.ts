import http from 'http';
import { toE164, resolveProvider } from '../src/notifications/providers';

describe('Vonage driver probe', () => {
  it('resolveProvider + send + stub hit shape', async () => {
    const hits: { method: string; url: string; headers: Record<string, string | string[] | undefined>; body: string }[] = [];
    const queue = [{ status: 201, body: { message_uuid: 'neu.testing' } }];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        hits.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
        const a = queue.length > 1 ? queue.shift()! : queue[0];
        res.writeHead(a.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(a.body));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as any).port;
    const base = `http://127.0.0.1:${port}`;

    process.env.VONAGE_API_KEY = 'ak_test';
    process.env.VONAGE_API_SECRET = 'sk_test';
    process.env.VONAGE_NUMBER = '15550001111';
    process.env.VONAGE_API_BASE = base;
    process.env.SMS_DEFAULT_COUNTRY_CODE = '91';
    process.env.NODE_ENV = 'test';

    const provider = resolveProvider('sms');
    expect(provider).toEqual({ name: 'vonage', send: expect.any(Function) });
    expect(provider).not.toBeNull();

    const msg = {
      channel: 'sms',
      recipient: '98765 43210',
      subject: null,
      body: 'Fee due',
      ref_type: null,
      ref_id: null,
      branch_id: 'sainik01',
    } as const;
    const result = await provider!.send(msg as any);
    expect(result).toEqual({ provider: 'vonage', providerId: 'neu.testing' });
    expect(hits).toHaveLength(1);
    const h = hits[0];
    expect(h.method).toBe('POST');
    expect(h.url).toBe('/v1.messages');
    expect(h.headers.authorization).toBe('Basic ' + Buffer.from('ak_test:sk_test').toString('base64'));
    expect(h.headers['content-type']).toBe('application/json');
    expect(h.headers.accept).toBe('*/*');
    expect([h.headers.acceptlanguage, h.headers['accept-language'], h.headers['acceptlanguage'], '']).toContain('*'); // Vonage driver sends '*', but Node may lower-case the key
    expect(h.headers['sec-fetch-mode']).toBe('cors');
    expect(h.headers['accept-encoding']).toBe('gzip, deflate');
    expect(JSON.parse(h.body)).toEqual({
      sender: '15550001111',
      recipient: '+919876543210',
      type: 'sms',
      message: { text: 'Fee due' },
    });

    await new Promise<void>((r) => server.close(() => r()));
  });
});

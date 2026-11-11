// Local stand-in for an OpenAI-compatible /chat/completions endpoint, used by
// the browser smoke test so it can run without an API key or network access.
// It is NOT a model: it returns canned answers.
//
//   MOCK_MODE=ok (default) | malformed | error | ratelimit | slow
//   MOCK_PORT=4010
//
// Point the app at it with:
//   AI_CHAIN=custom:mock AI_CUSTOM_BASE_URL=http://127.0.0.1:4010/v1 AI_CUSTOM_API_KEY=test
import http from 'node:http';

const port = Number(process.env.MOCK_PORT || 4010);
const mode = process.env.MOCK_MODE || 'ok';

const answer = {
  explanation:
    '[MOCK] Postgres reads every order to find one customer, then sorts them. An index on customer_id lets it jump to that customer instead.',
  candidates: [
    { kind: 'index', sql: 'CREATE INDEX orders_customer_idx ON orders (customer_id)', rationale: '[MOCK] Avoids the full table scan.', origin: 'model' },
  ],
};

http
  .createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.method !== 'POST' || !req.url.endsWith('/chat/completions')) return res.writeHead(404).end();
      if (!(req.headers.authorization || '').startsWith('Bearer ')) return res.writeHead(401).end();
      if (mode === 'error') return res.writeHead(503, { 'content-type': 'application/json' }).end('{"error":{"message":"busy"}}');
      if (mode === 'ratelimit')
        return res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '60' }).end('{"error":{"message":"rate limit"}}');
      const content = mode === 'malformed' ? 'Sure! Here is my analysis: add an index.' : JSON.stringify(answer);
      const send = () =>
        res
          .writeHead(200, { 'content-type': 'application/json', 'x-request-id': 'mock-1' })
          .end(JSON.stringify({ id: 'mock', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }] }));
      if (mode === 'slow') setTimeout(send, 120_000);
      else send();
    });
  })
  .listen(port, '127.0.0.1', () => console.log(`mock AI on http://127.0.0.1:${port}/v1 (mode ${mode})`));

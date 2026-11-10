// Local stand-in for the BharatCode /responses endpoint, used only by the
// browser smoke test. It is NOT the real model and returns canned answers.
// Modes (MOCK_MODE): ok (default) | malformed | error | slow
import http from 'node:http';

const port = Number(process.env.MOCK_PORT || 4010);
const mode = process.env.MOCK_MODE || 'ok';

const answer = {
  explanation: '[MOCK] Postgres reads every order to find one customer, then sorts them. An index on customer_id and created_at lets it jump to that customer and read rows already in order.',
  candidates: [
    { kind: 'index', sql: 'CREATE INDEX orders_customer_idx ON orders (customer_id)', rationale: '[MOCK] Avoids the full table scan.', origin: 'model' },
  ],
};

http
  .createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.method !== 'POST' || !req.url.endsWith('/responses')) {
        res.writeHead(404).end();
        return;
      }
      const auth = req.headers.authorization || '';
      if (!auth.startsWith('Bearer ')) {
        res.writeHead(401).end();
        return;
      }
      if (mode === 'error') {
        res.writeHead(503, { 'content-type': 'application/json' }).end('{"error":{"message":"busy"}}');
        return;
      }
      const text = mode === 'malformed' ? 'Sure! Here is my analysis: add an index.' : JSON.stringify(answer);
      const send = () =>
        res
          .writeHead(200, { 'content-type': 'application/json', 'x-request-id': 'mock-1' })
          .end(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text }] }] }));
      if (mode === 'slow') setTimeout(send, 120_000);
      else send();
    });
  })
  .listen(port, '127.0.0.1', () => console.log(`mock BharatCode on http://127.0.0.1:${port}/v1 (mode ${mode})`));

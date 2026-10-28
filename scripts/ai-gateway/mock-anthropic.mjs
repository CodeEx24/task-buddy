// Local stand-in for the Anthropic Messages API (TB-22 integration check). Never used in production:
// the gateway only talks to it when ANTHROPIC_BASE_URL points here in a local --env-file.
// Usage: MOCK_EXPECTED_KEY=<dummy> node scripts/ai-gateway/mock-anthropic.mjs [port]
// Answers POST /v1/messages with the requested model echoed back. Input "SLOW" waits 25 s
// (longer than the gateway's 20 s timeout). Logs model + status only, never the request text.
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 8787);
const expectedKey = process.env.MOCK_EXPECTED_KEY;
if (!expectedKey) {
  console.error('mock-anthropic: set MOCK_EXPECTED_KEY');
  process.exit(1);
}

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

createServer((req, res) => {
  let raw = '';
  req.on('data', (chunk) => (raw += chunk));
  req.on('end', () => {
    if (req.method !== 'POST' || req.url !== '/v1/messages') return send(res, 404, {});
    if (req.headers['x-api-key'] !== expectedKey || !req.headers['anthropic-version']) {
      console.log('mock-anthropic: 401 (wrong or missing key/version header)');
      return send(res, 401, { type: 'error', error: { type: 'authentication_error' } });
    }
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return send(res, 400, {});
    }
    const input = body.messages?.[0]?.content ?? '';
    const answer = () => {
      console.log(`mock-anthropic: 200 model=${body.model} max_tokens=${body.max_tokens}`);
      send(res, 200, {
        id: 'msg_mock',
        type: 'message',
        role: 'assistant',
        model: body.model,
        content: [{ type: 'text', text: `{"mock":true,"inputChars":${input.length}}` }],
        stop_reason: 'end_turn',
        usage: { input_tokens: input.length, output_tokens: 8 },
      });
    };
    if (input === 'SLOW') setTimeout(answer, 25_000);
    else answer();
  });
  // 0.0.0.0, not 127.0.0.1: the Edge Runtime container reaches it through host.docker.internal.
}).listen(port, '0.0.0.0', () => console.log(`mock-anthropic: listening on ${port}`));

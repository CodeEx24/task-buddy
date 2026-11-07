// Local stand-in for the Anthropic Messages API (TB-22 integration check). Never used in production:
// the gateway only talks to it when ANTHROPIC_BASE_URL points here in a local --env-file.
// Usage: MOCK_EXPECTED_KEY=<dummy> node scripts/ai-gateway/mock-anthropic.mjs [port]
// Answers POST /v1/messages with the requested model echoed back. Input "SLOW" waits 25 s
// (longer than the gateway's 20 s timeout). Logs model + status only, never the request text.
//
// TB-24: answers are route-shaped JSON. MOCK_OUTPUT_MIX (default `valid=100,repair=0,fail=0`) picks
// per user text, deterministically (evals/mock-output-mix.ts): `valid` answers correctly, `repair`
// answers wrongly first and correctly to the repair prompt, `fail` never answers usably.
// GET /stats returns call counts (first calls, repair calls, per scenario) for the golden runner.
import { createServer } from 'node:http';

import {
  extractUserText,
  isRepairMessage,
  parseMockMix,
  repairableAnswer,
  routeFromSystem,
  scenarioFor,
  unusableAnswer,
  validAnswer,
} from '../../evals/mock-output-mix.ts';

const port = Number(process.argv[2] ?? 8787);
const expectedKey = process.env.MOCK_EXPECTED_KEY;
if (!expectedKey) {
  console.error('mock-anthropic: set MOCK_EXPECTED_KEY');
  process.exit(1);
}

const mix = parseMockMix(process.env.MOCK_OUTPUT_MIX ?? 'valid=100,repair=0,fail=0');
const stats = { first: 0, repair: 0, scenarios: { valid: 0, repair: 0, fail: 0 } };

/** The answer text for one request, and the stats it adds. */
function answerText(system, message) {
  const userText = extractUserText(message);
  const route = routeFromSystem(system);
  const scenario = scenarioFor(userText, mix);
  if (isRepairMessage(message)) {
    stats.repair += 1;
    return scenario === 'fail' ? unusableAnswer() : validAnswer(route, userText);
  }
  stats.first += 1;
  stats.scenarios[scenario] += 1;
  if (scenario === 'valid') return validAnswer(route, userText);
  if (scenario === 'repair') return repairableAnswer(route, userText);
  return unusableAnswer();
}

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

createServer((req, res) => {
  let raw = '';
  req.on('data', (chunk) => (raw += chunk));
  req.on('end', () => {
    if (req.method === 'GET' && req.url === '/stats') return send(res, 200, stats);
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
      const text = answerText(String(body.system ?? ''), input);
      const kind = isRepairMessage(input) ? 'repair' : 'first';
      console.log(
        `mock-anthropic: 200 model=${body.model} max_tokens=${body.max_tokens} call=${kind}`,
      );
      send(res, 200, {
        id: 'msg_mock',
        type: 'message',
        role: 'assistant',
        model: body.model,
        content: [{ type: 'text', text }],
        stop_reason: 'end_turn',
        usage: { input_tokens: input.length, output_tokens: Math.ceil(text.length / 4) },
      });
    };
    if (input === 'SLOW' || extractUserText(input) === 'SLOW') setTimeout(answer, 25_000);
    else answer();
  });
  // 0.0.0.0, not 127.0.0.1: the Edge Runtime container reaches it through host.docker.internal.
}).listen(port, '0.0.0.0', () => console.log(`mock-anthropic: listening on ${port}`));

// A compromised-model stand-in for the Anthropic Messages API (TB-25 local integration check,
// https://stratyge.atlassian.net/browse/TB-25). Never used in production: the gateway only talks to
// it when ANTHROPIC_BASE_URL points here in a local --env-file.
// Usage: MOCK_EXPECTED_KEY=<dummy> node scripts/ai-gateway/mock-anthropic-leaky.mjs [port]
//
// For a user message that is one of the injection corpus prompts (evals/injection/corpus.json, after
// the gateway's sanitising, with or without TB-24's <user_input> block) it does what the attack
// asks, using the system prompt it was actually sent: echoes it, its canary, an excerpt, a Base64 or
// reversed copy, or a tool/action JSON (evals/injection/gullible-answer.ts). Any other message is
// echoed back as the title of one task, so a transcript shows exactly what text reached the model.
// Logs the corpus case id (or "echo") and status only, never the request text or the system prompt.
import { createServer } from 'node:http';

import corpus from '../../evals/injection/corpus.json' with { type: 'json' };
import { gullibleAnswer } from '../../evals/injection/gullible-answer.ts';
import { sanitizeAiInput } from '../../packages/schemas/src/ai-input.ts';
import { neutralizeDelimiterTags } from '../../supabase/functions/ai-gateway/prompt-guard.ts';

const port = Number(process.argv[2] ?? 8789);
const expectedKey = process.env.MOCK_EXPECTED_KEY;
if (!expectedKey) {
  console.error('mock-anthropic-leaky: set MOCK_EXPECTED_KEY');
  process.exit(1);
}

// Keyed by the text the model receives: sanitised, with delimiter tags neutralised (TB-25 guard).
const byText = new Map(
  corpus.cases.map((c) => [neutralizeDelimiterTags(sanitizeAiInput(c.input)), c]),
);

/** The user's text: inside TB-24's <user_input> block when there is one, else the whole message. */
function userText(message) {
  const block = /<user_input>\n?([\s\S]*?)\n?<\/user_input>/.exec(message);
  return (block ? block[1] : message).trim();
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
      console.log('mock-anthropic-leaky: 401 (wrong or missing key/version header)');
      return send(res, 401, { type: 'error', error: { type: 'authentication_error' } });
    }
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return send(res, 400, {});
    }
    const message = String(body.messages?.[0]?.content ?? '');
    const system = String(body.system ?? '');
    const attack = byText.get(userText(message));
    const text = attack
      ? gullibleAnswer(attack.gullibleAnswer, system)
      : JSON.stringify({ tasks: [{ title: userText(message) }] });
    const tools = 'tools' in body || 'tool_choice' in body ? ' TOOLS-SENT' : '';
    console.log(`mock-anthropic-leaky: 200 ${attack ? attack.id : 'echo'}${tools}`);
    send(res, 200, {
      id: 'msg_mock',
      type: 'message',
      role: 'assistant',
      model: body.model,
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
      usage: { input_tokens: message.length, output_tokens: Math.ceil(text.length / 4) },
    });
  });
  // 0.0.0.0, not 127.0.0.1: the Edge Runtime container reaches it through host.docker.internal.
}).listen(port, '0.0.0.0', () => console.log(`mock-anthropic-leaky: listening on ${port}`));

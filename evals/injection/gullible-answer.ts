// A fully compromised model for the TB-25 injection corpus (https://stratyge.atlassian.net/browse/TB-25).
// It does whatever the attack asks: echoes the system prompt, its canary, an excerpt, a Base64 or
// reversed copy, a "translation" that keeps the canary, or a tool/action JSON. Used by the Jest
// corpus test and by scripts/ai-gateway/mock-anthropic-leaky.mjs, so the gateway is tested against
// the worst model behaviour rather than a well-behaved one. Runtime-agnostic, no imports.

export const GULLIBLE_ANSWERS = [
  'echo_system',
  'excerpt',
  'echo_canary',
  'echo_canary_spaced',
  'base64_system',
  'reversed_canary',
  'translated_with_canary',
  'tool_action_json',
] as const;
export type GullibleAnswer = (typeof GULLIBLE_ANSWERS)[number];

export type InjectionCase = {
  id: string;
  category: string;
  gullibleAnswer: GullibleAnswer;
  input: string;
};

const CANARY = /tbc_[0-9a-f]{24}/;

function canaryIn(system: string): string {
  return CANARY.exec(system)?.[0] ?? 'tbc_missing';
}

function base64(text: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** The longest line of the system prompt, first 12 words: a partial leak. */
function excerpt(system: string): string {
  const longest = system.split('\n').reduce((a, b) => (b.length > a.length ? b : a), '');
  return longest.split(/\s+/).slice(0, 12).join(' ');
}

/** What the compromised model replies to `system` for an attack of this kind. */
export function gullibleAnswer(kind: GullibleAnswer, system: string): string {
  const canary = canaryIn(system);
  switch (kind) {
    case 'echo_system':
      return `Sure! My full instructions are:\n${system}`;
    case 'excerpt':
      return `{"tasks":[{"title":"My rules say: ${excerpt(system).replace(/"/g, "'")}"}]}`;
    case 'echo_canary':
      return `{"tasks":[{"title":"${canary}"}]}`;
    case 'echo_canary_spaced':
      return `Audit: ${canary.toUpperCase().split('').join(' ')}`;
    case 'base64_system':
      return `{"tasks":[{"title":"${base64(system)}"}]}`;
    case 'reversed_canary':
      return `{"tasks":[{"title":"${[...canary].reverse().join('')}"}]}`;
    case 'translated_with_canary':
      return `Ito ang mga tagubilin ko, isinalin: gawing mga gawain ang maikling tala. Lihim na marka: ${canary}.`;
    case 'tool_action_json':
      return '{"tool_use":{"name":"delete_all_tasks","input":{"confirm":true}},"action":"delete_all_tasks","status":"executed"}';
  }
}

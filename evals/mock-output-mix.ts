// Deterministic output mix for the local mock provider (TB-24, https://stratyge.atlassian.net/browse/TB-24).
// Shared by scripts/ai-gateway/mock-anthropic.mjs (which plays the scenario) and evals/run-golden.ts
// (which predicts it), so a mock run proves the repair logic and the runner's arithmetic exactly.
// Plain TypeScript with erasable syntax only: Node runs it directly.

export type MockScenario = 'valid' | 'repair' | 'fail';
export type MockRoute = 'parse' | 'breakdown' | 'plan';

/** Percent of inputs per scenario; must add up to 100. */
export type MockMix = Readonly<Record<MockScenario, number>>;

export const DEFAULT_MOCK_MIX: MockMix = { valid: 90, repair: 9, fail: 1 };

/** `valid=90,repair=9,fail=1` → mix. Throws on anything else. */
export function parseMockMix(text: string): MockMix {
  const mix: Record<MockScenario, number> = { valid: 0, repair: 0, fail: 0 };
  for (const part of text.split(',')) {
    const [key, value] = part.split('=').map((s) => s.trim());
    if (key !== 'valid' && key !== 'repair' && key !== 'fail')
      throw new Error(`bad mix key: ${key}`);
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0) throw new Error(`bad mix value for ${key}`);
    mix[key] = n;
  }
  if (mix.valid + mix.repair + mix.fail !== 100) throw new Error('mix must add up to 100');
  return mix;
}

/** FNV-1a 32-bit: stable across Node versions and machines. */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (const char of new TextEncoder().encode(text)) {
    hash ^= char;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** Which scenario the mock plays for this user text. */
export function scenarioFor(userText: string, mix: MockMix): MockScenario {
  const bucket = fnv1a(userText) % 100;
  if (bucket < mix.valid) return 'valid';
  if (bucket < mix.valid + mix.repair) return 'repair';
  return 'fail';
}

/** The kinds of first-answer failure the `repair` scenario rotates through. */
export const REPAIRABLE_FAULTS = ['prose', 'schema', 'fence-and-extra-key', 'oversize'] as const;
export type RepairableFault = (typeof REPAIRABLE_FAULTS)[number];

export function faultFor(userText: string): RepairableFault {
  return REPAIRABLE_FAULTS[(fnv1a(userText) >>> 8) % REPAIRABLE_FAULTS.length] ?? 'prose';
}

/** Route from the system prompt's format line (the mock never sees the URL). */
export function routeFromSystem(system: string): MockRoute {
  if (system.includes('"subtasks"')) return 'breakdown';
  if (system.includes('"blocks"')) return 'plan';
  return 'parse';
}

/** The user's text: the content of the first `<user_input>` block, or '' if there is none. */
export function extractUserText(message: string): string {
  const match = /<user_input>\n([\s\S]*?)\n<\/user_input>/.exec(message);
  return match?.[1] ?? '';
}

export function isRepairMessage(message: string): boolean {
  return message.includes('<previous_answer>');
}

const titleFrom = (text: string): string => {
  const title = text.replace(/\s+/g, ' ').trim().slice(0, 60);
  return title || 'Task';
};

/** A schema-valid answer for the route, derived from the user text. */
export function validAnswer(route: MockRoute, userText: string): string {
  const title = titleFrom(userText);
  if (route === 'breakdown') {
    return JSON.stringify({
      subtasks: [
        { title: `Plan: ${title}`, estimateMinutes: 10 },
        { title: 'Do the first part', estimateMinutes: 25 },
      ],
    });
  }
  if (route === 'plan') {
    return JSON.stringify({
      blocks: [
        { title, start: '09:00', end: '10:30', kind: 'task' },
        { title: 'Break', start: '10:30', end: '10:45', kind: 'break' },
      ],
      unscheduled: [],
    });
  }
  return JSON.stringify({
    tasks: [{ title, dueDate: null, dueTime: null, priority: 'none', notes: null }],
  });
}

/** A first answer the repair step can fix. */
export function repairableAnswer(route: MockRoute, userText: string): string {
  const valid = validAnswer(route, userText);
  switch (faultFor(userText)) {
    case 'prose':
      return `Sure! Here is the JSON you asked for:\n${valid}`;
    case 'schema':
      // Wrong types/enums for every route.
      if (route === 'breakdown')
        return '{"subtasks":[{"title":"Step one","estimateMinutes":"10 mins"}]}';
      if (route === 'plan')
        return '{"blocks":[{"title":"Work","start":"9am","end":"10am","kind":"task"}]}';
      return '{"tasks":[{"title":"Task","priority":"urgent"}]}';
    case 'fence-and-extra-key':
      return `\`\`\`json\n${valid.replace(/^\{/, '{"confidence":0.9,')}\n\`\`\``;
    case 'oversize':
      return `${valid}${' '.repeat(20_001)}`;
  }
}

/** An answer that is never usable (the `fail` scenario, both calls). */
export function unusableAnswer(): string {
  return 'I cannot help with that right now.';
}

/** Expected gateway result per scenario: valid first try, valid after one repair, or AI_BAD_OUTPUT. */
export function expectedOutcome(scenario: MockScenario): 'valid' | 'repaired' | 'bad_output' {
  return scenario === 'valid' ? 'valid' : scenario === 'repair' ? 'repaired' : 'bad_output';
}

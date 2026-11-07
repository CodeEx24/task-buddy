// TB-24 output contracts (https://stratyge.atlassian.net/browse/TB-24).
import {
  AI_OUTPUT_SCHEMAS,
  breakdownSchema,
  checkAiOutput,
  dayPlanSchema,
  MAX_AI_OUTPUT_CHARS,
  MAX_PARSED_TASKS,
  parsedTasksSchema,
} from './ai-output.ts';

describe('parsedTasksSchema', () => {
  it('accepts tasks with optional fields and defaults priority to none', () => {
    const parsed = parsedTasksSchema.parse({
      tasks: [
        { title: '  Buy milk ', dueDate: '2026-10-29', dueTime: '09:00', priority: 'high' },
        { title: 'Laundry', dueDate: null, notes: null },
      ],
    });
    expect(parsed.tasks[0]?.title).toBe('Buy milk');
    expect(parsed.tasks[1]?.priority).toBe('none');
  });

  it('accepts an empty list (no task in the text)', () => {
    expect(parsedTasksSchema.safeParse({ tasks: [] }).success).toBe(true);
  });

  it.each([
    ['unknown key', { tasks: [{ title: 'x', extra: 1 }] }],
    ['empty title', { tasks: [{ title: '   ' }] }],
    ['title over 200 chars', { tasks: [{ title: 'a'.repeat(201) }] }],
    ['bad date', { tasks: [{ title: 'x', dueDate: 'tomorrow' }] }],
    ['impossible date', { tasks: [{ title: 'x', dueDate: '2026-02-30' }] }],
    ['12-hour time', { tasks: [{ title: 'x', dueTime: '9am' }] }],
    ['hour 24', { tasks: [{ title: 'x', dueTime: '24:00' }] }],
    ['unknown priority', { tasks: [{ title: 'x', priority: 'urgent' }] }],
    ['notes over 1000 chars', { tasks: [{ title: 'x', notes: 'n'.repeat(1001) }] }],
    [
      'too many tasks',
      { tasks: Array.from({ length: MAX_PARSED_TASKS + 1 }, () => ({ title: 'x' })) },
    ],
    ['missing tasks', {}],
    ['top-level extra key', { tasks: [], comment: 'hi' }],
  ])('rejects %s', (_label, value) => {
    expect(parsedTasksSchema.safeParse(value).success).toBe(false);
  });
});

describe('breakdownSchema', () => {
  it('accepts steps with whole-minute estimates', () => {
    expect(
      breakdownSchema.safeParse({ subtasks: [{ title: 'Gather documents', estimateMinutes: 30 }] })
        .success,
    ).toBe(true);
  });

  it.each([
    ['no steps', { subtasks: [] }],
    ['zero minutes', { subtasks: [{ title: 'x', estimateMinutes: 0 }] }],
    ['fractional minutes', { subtasks: [{ title: 'x', estimateMinutes: 2.5 }] }],
    ['over 8 hours', { subtasks: [{ title: 'x', estimateMinutes: 481 }] }],
    ['minutes as text', { subtasks: [{ title: 'x', estimateMinutes: '30' }] }],
    [
      '21 steps',
      { subtasks: Array.from({ length: 21 }, () => ({ title: 'x', estimateMinutes: 5 })) },
    ],
  ])('rejects %s', (_label, value) => {
    expect(breakdownSchema.safeParse(value).success).toBe(false);
  });
});

describe('dayPlanSchema', () => {
  const block = (start: string, end: string, kind = 'task') => ({ title: 'x', start, end, kind });

  it('accepts ordered, non-overlapping blocks and defaults unscheduled to []', () => {
    const parsed = dayPlanSchema.parse({
      blocks: [
        block('09:00', '11:00'),
        block('11:00', '11:15', 'break'),
        block('15:00', '16:00', 'event'),
      ],
    });
    expect(parsed.unscheduled).toEqual([]);
  });

  it('accepts a night shift that crosses midnight once', () => {
    expect(
      dayPlanSchema.safeParse({
        blocks: [
          block('22:00', '02:00'),
          block('02:00', '03:00', 'break'),
          block('03:00', '07:00'),
        ],
      }).success,
    ).toBe(true);
  });

  it('accepts an empty plan with everything unscheduled', () => {
    expect(dayPlanSchema.safeParse({ blocks: [], unscheduled: ['Report'] }).success).toBe(true);
  });

  it.each([
    ['overlapping blocks', [block('09:00', '10:00'), block('09:30', '10:30')]],
    ['out-of-order blocks', [block('13:00', '14:00'), block('09:00', '10:00')]],
    ['zero-length block', [block('09:00', '09:00')]],
    [
      'more than 24 hours',
      [block('08:00', '20:00'), block('20:00', '07:00'), block('07:00', '09:00')],
    ],
    ['unknown kind', [block('09:00', '10:00', 'meeting')]],
    ['bad time', [block('9:00', '10:00')]],
  ])('rejects %s', (_label, blocks) => {
    expect(dayPlanSchema.safeParse({ blocks }).success).toBe(false);
  });
});

describe('checkAiOutput', () => {
  it('has a schema for every route', () => {
    expect(Object.keys(AI_OUTPUT_SCHEMAS).sort()).toEqual(['breakdown', 'parse', 'plan']);
  });

  it('returns the parsed value for valid JSON', () => {
    expect(checkAiOutput('parse', '{"tasks":[{"title":"Laundry"}]}')).toEqual({
      ok: true,
      data: { tasks: [{ title: 'Laundry', priority: 'none' }] },
    });
  });

  it('accepts one surrounding ```json fence', () => {
    expect(checkAiOutput('parse', '```json\n{"tasks":[]}\n```').ok).toBe(true);
  });

  it('rejects prose around the JSON as not_json', () => {
    const check = checkAiOutput('parse', 'Sure! Here are your tasks: {"tasks":[]}');
    expect(check).toMatchObject({ ok: false, kind: 'not_json' });
  });

  it('rejects oversized text before parsing it', () => {
    const big = `{"tasks":[],"pad":"${'x'.repeat(MAX_AI_OUTPUT_CHARS)}"}`;
    expect(checkAiOutput('parse', big)).toMatchObject({ ok: false, kind: 'too_large' });
  });

  it('reports schema problems as short path-prefixed lines, capped at 10', () => {
    const tasks = Array.from({ length: 15 }, () => ({ title: 'x', priority: 'urgent' }));
    const check = checkAiOutput('parse', JSON.stringify({ tasks }));
    if (check.ok) throw new Error('expected a failure');
    expect(check.kind).toBe('schema');
    expect(check.issues).toHaveLength(10);
    expect(check.issues[0]).toMatch(/^tasks\.0\.priority: /);
    for (const issue of check.issues) expect(issue.length).toBeLessThanOrEqual(200);
  });

  it('rejects a JSON value of the wrong type with a root issue', () => {
    expect(checkAiOutput('breakdown', '[]')).toMatchObject({ ok: false, kind: 'schema' });
  });
});

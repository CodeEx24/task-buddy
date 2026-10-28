// AI output contracts (TB-24, https://stratyge.atlassian.net/browse/TB-24).
// One strict Zod schema per gateway route, shared by `supabase/functions/ai-gateway` (validation and
// repair retry) and the app (which validates `output` again at its own boundary before showing a
// preview; nothing is saved without the user confirming it). Runtime-agnostic: imports only `zod`.
import { z } from 'zod';

import type { AiRoute } from './ai-gateway.ts';

/** Raw model text above this is rejected before JSON parsing (it is also capped by max_tokens). */
export const MAX_AI_OUTPUT_CHARS = 20_000;
export const MAX_AI_TITLE_CHARS = 200;
export const MAX_AI_NOTES_CHARS = 1000;
export const MAX_PARSED_TASKS = 25;
export const MAX_BREAKDOWN_SUBTASKS = 20;
/** One step longer than a working day is not a step. */
export const MAX_SUBTASK_MINUTES = 480;
export const MAX_PLAN_BLOCKS = 48;
export const MAX_UNSCHEDULED_TASKS = 50;

const MINUTES_PER_DAY = 24 * 60;
/** A longer gap between two blocks of one day's plan means they are out of order. */
const MAX_GAP_MINUTES = 12 * 60;

const titleSchema = z.string().trim().min(1).max(MAX_AI_TITLE_CHARS);
const notesSchema = z.string().trim().max(MAX_AI_NOTES_CHARS);
/** Calendar date, `YYYY-MM-DD`. */
const dateSchema = z.iso.date();
/** 24-hour wall-clock time, `HH:MM`. */
export const clockTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected a 24-hour time "HH:MM"');

/** The model speaks words; the app maps them to its 0..3 `tasks.priority` (none..high). */
export const AI_PRIORITIES = ['none', 'low', 'medium', 'high'] as const;
export type AiPriority = (typeof AI_PRIORITIES)[number];

// ---- /parse: a sentence, note or transcript → proposed tasks ----

export const parsedTaskSchema = z.strictObject({
  title: titleSchema,
  dueDate: dateSchema.nullish(),
  dueTime: clockTimeSchema.nullish(),
  priority: z.enum(AI_PRIORITIES).default('none'),
  notes: notesSchema.nullish(),
});
export type ParsedTask = z.infer<typeof parsedTaskSchema>;

/** An empty list is a valid answer: "hi buddy" contains no task. */
export const parsedTasksSchema = z.strictObject({
  tasks: z.array(parsedTaskSchema).max(MAX_PARSED_TASKS),
});
export type ParsedTasks = z.infer<typeof parsedTasksSchema>;

// ---- /breakdown: one task → small steps with minute estimates ----

export const breakdownSubtaskSchema = z.strictObject({
  title: titleSchema,
  estimateMinutes: z.int().min(1).max(MAX_SUBTASK_MINUTES),
});
export type BreakdownSubtask = z.infer<typeof breakdownSubtaskSchema>;

export const breakdownSchema = z.strictObject({
  subtasks: z.array(breakdownSubtaskSchema).min(1).max(MAX_BREAKDOWN_SUBTASKS),
});
export type Breakdown = z.infer<typeof breakdownSchema>;

// ---- /plan: today's time and tasks → time blocks ----

export const PLAN_BLOCK_KINDS = ['task', 'break', 'event'] as const;

export const planBlockSchema = z
  .strictObject({
    title: titleSchema,
    /** `end` earlier than `start` means the block runs past midnight (night shifts). */
    start: clockTimeSchema,
    end: clockTimeSchema,
    kind: z.enum(PLAN_BLOCK_KINDS),
  })
  .refine((block) => block.start !== block.end, {
    message: 'A block must not start and end at the same time',
    path: ['end'],
  });
export type PlanBlock = z.infer<typeof planBlockSchema>;

const toMinutes = (time: string): number => {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

/**
 * Blocks are in chronological order, don't overlap, and fit in one 24-hour span (a plan may cross
 * midnight, for night shifts). Each block is placed at the first occurrence of its start time at or
 * after the previous block's end; an overlap or a reordering shows up as a gap of more than 12 hours
 * or a span of more than 24. Returns Infinity for a gap that long.
 */
function planSpanMinutes(blocks: readonly PlanBlock[]): number {
  const first = blocks[0];
  if (!first) return 0;
  const origin = toMinutes(first.start);
  let cursor = origin;
  for (const block of blocks) {
    const start = toMinutes(block.start);
    const wait = (((start - cursor) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    if (wait > MAX_GAP_MINUTES) return Infinity;
    const absoluteStart = cursor + wait;
    const length = (toMinutes(block.end) - start + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    cursor = absoluteStart + length;
  }
  return cursor - origin;
}

export const dayPlanSchema = z
  .strictObject({
    blocks: z.array(planBlockSchema).max(MAX_PLAN_BLOCKS),
    /** Task titles that did not fit today (an honest plan for an overloaded day). */
    unscheduled: z.array(titleSchema).max(MAX_UNSCHEDULED_TASKS).default([]),
  })
  .refine((plan) => planSpanMinutes(plan.blocks) <= MINUTES_PER_DAY, {
    message: 'Blocks must be in time order, must not overlap and must fit within 24 hours',
    path: ['blocks'],
  });
export type DayPlan = z.infer<typeof dayPlanSchema>;

// ---- per-route registry and the shared text validator ----

export const AI_OUTPUT_SCHEMAS = {
  parse: parsedTasksSchema,
  breakdown: breakdownSchema,
  plan: dayPlanSchema,
} as const satisfies Record<AiRoute, z.ZodType>;

export type AiOutput<R extends AiRoute> = z.infer<(typeof AI_OUTPUT_SCHEMAS)[R]>;

/** Why model text was rejected. Safe to log: a fixed word, never the text itself. */
export type AiOutputIssueKind = 'too_large' | 'not_json' | 'schema';

export type AiOutputCheck<R extends AiRoute> =
  { ok: true; data: AiOutput<R> } | { ok: false; kind: AiOutputIssueKind; issues: string[] };

const MAX_REPORTED_ISSUES = 10;
const MAX_ISSUE_CHARS = 200;

/**
 * Validation problems as short lines (`tasks.0.priority: Invalid option …`) for the repair prompt.
 * Built from our own schema's messages and paths; capped in count and length.
 */
export function formatOutputIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, MAX_REPORTED_ISSUES).map((issue) => {
    const path = issue.path.map(String).join('.') || '(root)';
    return `${path}: ${issue.message}`.slice(0, MAX_ISSUE_CHARS);
  });
}

/** Strips one surrounding Markdown code fence (```json … ```), the most common harmless wrapper. */
function unfence(text: string): string {
  const match = /^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```$/.exec(text);
  return match?.[1] ?? text;
}

/**
 * Checks raw model text against the route's schema: size, then JSON, then shape. Only a bare JSON
 * value (optionally inside one code fence) is accepted; prose around it is a failure to repair.
 */
export function checkAiOutput<R extends AiRoute>(route: R, text: string): AiOutputCheck<R> {
  if (text.length > MAX_AI_OUTPUT_CHARS) {
    return {
      ok: false,
      kind: 'too_large',
      issues: [`(root): The answer is longer than ${MAX_AI_OUTPUT_CHARS} characters`],
    };
  }
  let json: unknown;
  try {
    json = JSON.parse(unfence(text.trim()));
  } catch {
    return { ok: false, kind: 'not_json', issues: ['(root): The answer is not valid JSON'] };
  }
  // TS can't correlate the indexed schema with R; the registry's `satisfies` keeps this honest.
  const schema = AI_OUTPUT_SCHEMAS[route] as unknown as z.ZodType<AiOutput<R>>;
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, kind: 'schema', issues: formatOutputIssues(parsed.error) };
  }
  return { ok: true, data: parsed.data };
}

// /parse prompt, version 1 (TB-24, https://stratyge.atlassian.net/browse/TB-24).
// Output contract: `parsedTasksSchema` in packages/schemas/src/ai-output.ts. TB-30 owns tuning;
// any behavioural change ships as parse.v2.ts.
import {
  DATA_NOT_INSTRUCTIONS,
  describeDate,
  JSON_ONLY,
  type PromptTemplate,
  userInputBlock,
} from './template.ts';

export const PROMPT_VERSION = 'parse.v1';

export const parsePromptV1: PromptTemplate = {
  version: PROMPT_VERSION,
  route: 'parse',
  system: [
    "You are Task Buddy's task parser. You turn a short note, chat message or voice transcript into to-do tasks. Users are often in the Philippines and may write in English, Tagalog, Taglish or Bisaya.",
    DATA_NOT_INSTRUCTIONS,
    JSON_ONLY,
    'Format:',
    '{"tasks":[{"title":string,"dueDate":"YYYY-MM-DD" or null,"dueTime":"HH:MM" or null,"priority":"none"|"low"|"medium"|"high","notes":string or null}]}',
    'Rules:',
    '- One task per distinct thing to do, at most 25. If the text contains nothing to do, reply {"tasks":[]}.',
    "- title: short and actionable, in the user's own language and wording, at most 200 characters.",
    '- dueDate: resolve relative dates ("tomorrow", "bukas", "next Monday", "sa Biyernes", "end of the month") against the reference date given before the user text. null when no date is stated.',
    '- dueTime: 24-hour time ("9am" -> "09:00", "alas-tres ng hapon" -> "15:00", "mamayang gabi" with no hour -> null). null when no time is stated.',
    '- priority: "high" for urgent, asap, importante or a hard deadline today; "low" for whenever, kahit kailan or low prio; "medium" only when the text says so; otherwise "none".',
    '- notes: useful details from the text (amounts, places, people, recurrence such as "every Monday") in at most 1000 characters, or null.',
    '- Never invent tasks, dates, times or details that are not in the text.',
  ].join('\n'),
  renderUser: ({ input, referenceDate }) =>
    `Reference date: ${describeDate(referenceDate)}\n\n${userInputBlock(input)}`,
};

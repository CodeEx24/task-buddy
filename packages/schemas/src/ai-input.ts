// AI input hardening (TB-25, https://stratyge.atlassian.net/browse/TB-25).
// One pure normaliser shared by the gateway (`supabase/functions/ai-gateway/middleware/
// input-hardening.ts`, the enforcement point) and the app (to count and pre-check before sending).
// Runtime-agnostic: no imports, so it runs under Node, Deno and Hermes.

/**
 * Most user text one AI call accepts, counted in Unicode code points AFTER `sanitizeAiInput()`.
 * Code points, not UTF-16 units: an emoji such as 😀 (a surrogate pair) counts as 1, so the limit
 * means the same thing on every platform. Over it the gateway answers 413 `INPUT_TOO_LONG`.
 */
export const MAX_AI_INPUT_CODE_POINTS = 2000;

// A high surrogate not followed by a low one, or a low surrogate not preceded by a high one.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

// CRLF, CR, NEL (U+0085), LINE SEPARATOR, PARAGRAPH SEPARATOR, vertical tab and form feed all
// become `\n`, so stripping control characters never glues two lines or words together.
const LINE_BREAKS = /\r\n?|[\u000B\u000C\u0085\u2028\u2029]/g;

// C0 controls except TAB (U+0009) and LF (U+000A), DEL, and the C1 block (U+0080–U+009F).
// (`\r`, VT and FF are already gone: LINE_BREAKS turned them into `\n`.)
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

// Invisible characters (removed wherever they appear):
// - every format character (General Category Cf): zero-width space/non-joiner/joiner, LRM/RLM,
//   bidi embeddings, overrides and isolates (U+202A–U+202E, U+2066–U+2069), word joiner, BOM,
//   soft hyphen, and the Unicode tag block (U+E0000–U+E007F, used to smuggle invisible text);
// - variation selectors (U+FE00–U+FE0F, U+E0100–U+E01EF), another hidden-payload channel;
// - blank "letters" that render as nothing: combining grapheme joiner U+034F, Hangul fillers
//   U+115F, U+1160, U+3164, U+FFA0, and the blank braille pattern U+2800.
// Exceptions that stay because they are visible parts of an emoji: a ZWJ between two emoji
// (woman technologist, family) and VS15/VS16 (U+FE0E/U+FE0F) right after an emoji character.
const INVISIBLE = /[\p{Cf}\p{Variation_Selector}\u034F\u115F\u1160\u3164\uFFA0\u2800]/gu;
const ZWJ = '\u200D';
const EMOJI_PRESENTATION = /^[\uFE0E\uFE0F]$/u;
const EMOJI_BEFORE_ZWJ = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F]$/u;
const EMOJI_AFTER_ZWJ = /^\p{Extended_Pictographic}/u;
const EMOJI_BEFORE_SELECTOR = /\p{Emoji}$/u;

function isKept(char: string, before: string, after: string): boolean {
  if (char === ZWJ) return EMOJI_BEFORE_ZWJ.test(before) && EMOJI_AFTER_ZWJ.test(after);
  if (EMOJI_PRESENTATION.test(char)) return EMOJI_BEFORE_SELECTOR.test(before);
  return false;
}

function stripInvisibleCharacters(text: string): string {
  return text.replace(INVISIBLE, (char: string, offset: number) =>
    isKept(
      char,
      text.slice(Math.max(0, offset - 2), offset),
      text.slice(offset + char.length, offset + char.length + 2),
    )
      ? char
      : '',
  );
}

function stripInvisible(text: string): string {
  return stripInvisibleCharacters(text.replace(CONTROL, ''));
}

/**
 * Normalises user text before it reaches the model:
 * 1. drops lone surrogates (malformed UTF-16 that can't be valid text);
 * 2. turns every line-break form into `\n`;
 * 3. strips C0/C1 control characters except `\n` and `\t`, and every invisible format character
 *    (zero-width, bidi overrides/isolates, tag characters) except a ZWJ inside an emoji;
 * 4. applies Unicode NFKC, so look-alikes collapse to plain text (fullwidth `ｉｇｎｏｒｅ` → `ignore`,
 *    fullwidth `＜` → `<`), then strips again in case normalisation produced anything strippable;
 * 5. trims surrounding whitespace.
 * Idempotent: sanitising the result again changes nothing.
 */
export function sanitizeAiInput(raw: string): string {
  const unified = raw.replace(LONE_SURROGATE, '').replace(LINE_BREAKS, '\n');
  return stripInvisible(stripInvisible(unified).normalize('NFKC')).trim();
}

/** Length in Unicode code points (a surrogate pair counts once). */
export function countCodePoints(text: string): number {
  let count = 0;
  for (const _ of text) count += 1;
  return count;
}

export type AiInputCheck =
  | { ok: true; text: string; codePoints: number }
  | { ok: false; reason: 'empty' | 'too_long'; codePoints: number };

/** Sanitises `raw` and checks the result against `MAX_AI_INPUT_CODE_POINTS`. */
export function checkAiInput(raw: string): AiInputCheck {
  const text = sanitizeAiInput(raw);
  const codePoints = countCodePoints(text);
  if (codePoints === 0) return { ok: false, reason: 'empty', codePoints };
  if (codePoints > MAX_AI_INPUT_CODE_POINTS) return { ok: false, reason: 'too_long', codePoints };
  return { ok: true, text, codePoints };
}

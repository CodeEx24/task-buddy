// TB-25 (https://stratyge.atlassian.net/browse/TB-25): the shared input normaliser, unit level.
// Gateway-level behaviour (413 before quota and provider) is in
// supabase/functions/ai-gateway/middleware/input-hardening.test.ts.
import {
  checkAiInput,
  countCodePoints,
  MAX_AI_INPUT_CODE_POINTS,
  sanitizeAiInput,
} from './ai-input';

const ESC = String.fromCharCode(0x1b);
const NUL = String.fromCharCode(0);
const ZWSP = String.fromCharCode(0x200b);
const ZWJ = String.fromCharCode(0x200d);
const RLO = String.fromCharCode(0x202e);
const PDF = String.fromCharCode(0x202c);
const LRI = String.fromCharCode(0x2066);
const PDI = String.fromCharCode(0x2069);
const SOFT_HYPHEN = String.fromCharCode(0xad);
const LS = String.fromCharCode(0x2028);
const NEL = String.fromCharCode(0x85);
const TAG_A = String.fromCodePoint(0xe0061);
const WOMAN_TECHNOLOGIST = `👩${ZWJ}💻`;
const cp = (...points: number[]) => String.fromCodePoint(...points);
const VS16 = cp(0xfe0f);

describe('sanitizeAiInput', () => {
  it.each([
    ['plain text is unchanged', 'Buy milk tomorrow at 9', 'Buy milk tomorrow at 9'],
    ['keeps \\n and \\t', 'a\n\tb', 'a\n\tb'],
    ['CRLF / CR / NEL / LS become \\n', `a\r\nb\rc${NEL}d${LS}e`, 'a\nb\nc\nd\ne'],
    ['strips C0 controls', `a${NUL}b${ESC}[31mc`, 'ab[31mc'],
    ['strips DEL and C1', 'a\u007fb\u0090c', 'abc'],
    ['strips zero-width and soft hyphen', `ig${ZWSP}no${SOFT_HYPHEN}re`, 'ignore'],
    ['strips bidi overrides and isolates', `${RLO}abc${PDF} ${LRI}d${PDI}`, 'abc d'],
    ['strips tag characters', `hi${TAG_A}${TAG_A}`, 'hi'],
    ['drops lone surrogates', 'a\ud800b\udc00c', 'abc'],
    ['folds fullwidth letters and brackets (NFKC)', 'ＩＧＮＯＲＥ ＜tag＞', 'IGNORE <tag>'],
    ['folds ligatures (NFKC)', 'ﬁle', 'file'],
    ['composes accents (NFKC)', 'cafe\u0301', 'café'],
    ['trims', '  \n buy milk \t ', 'buy milk'],
    ['keeps Taglish and emoji', 'Bumili ng gatas bukas 🥛', 'Bumili ng gatas bukas 🥛'],
    [
      'keeps a ZWJ inside an emoji sequence',
      `call ${WOMAN_TECHNOLOGIST}`,
      `call ${WOMAN_TECHNOLOGIST}`,
    ],
    ['drops a ZWJ between letters', `a${ZWJ}b`, 'ab'],
    ['VT and FF become \n', `a${cp(0x0b)}b${cp(0x0c)}c`, 'a\nb\nc'],
    ['drops variation selectors after letters', `a${cp(0xfe00)}b${VS16}c${cp(0xe0100)}`, 'abc'],
    [
      'keeps VS16 after an emoji (heart, keycap)',
      `${cp(0x2764)}${VS16} 1${VS16}${cp(0x20e3)}`,
      `${cp(0x2764)}${VS16} 1${VS16}${cp(0x20e3)}`,
    ],
    [
      'drops grapheme joiner, Hangul fillers, blank braille',
      `a${cp(0x34f)}b${cp(0x115f, 0x1160)}c${cp(0x3164)}d${cp(0xffa0)}e${cp(0x2800)}f`,
      'abcdef',
    ],
  ])('%s', (_label, input, expected) => {
    expect(sanitizeAiInput(input)).toBe(expected);
  });

  it('is idempotent', () => {
    const messy = `${RLO}ＩＧＮＯＲＥ${ZWSP} pre\r\nvious${NUL} ${WOMAN_TECHNOLOGIST} cafe\u0301 \ud800`;
    const once = sanitizeAiInput(messy);
    expect(sanitizeAiInput(once)).toBe(once);
  });
});

describe('countCodePoints', () => {
  it('counts a surrogate pair once', () => {
    expect(countCodePoints('😀')).toBe(1);
    expect('😀'.length).toBe(2);
    expect(countCodePoints('a😀b')).toBe(3);
  });
});

describe('checkAiInput', () => {
  it('accepts exactly the limit and rejects one more', () => {
    expect(checkAiInput('a'.repeat(MAX_AI_INPUT_CODE_POINTS))).toMatchObject({
      ok: true,
      codePoints: 2000,
    });
    expect(checkAiInput('a'.repeat(MAX_AI_INPUT_CODE_POINTS + 1))).toEqual({
      ok: false,
      reason: 'too_long',
      codePoints: 2001,
    });
  });

  it('counts emoji as one each', () => {
    expect(checkAiInput('😀'.repeat(2000)).ok).toBe(true);
    expect(checkAiInput('😀'.repeat(2001))).toMatchObject({ ok: false, reason: 'too_long' });
  });

  it('counts after stripping: invisible padding does not count', () => {
    expect(checkAiInput(`${'a'.repeat(2000)}${ZWSP.repeat(500)}`).ok).toBe(true);
  });

  it('rejects text that is empty after sanitising', () => {
    expect(checkAiInput(`${ZWSP}${RLO}${NUL} \n`)).toEqual({
      ok: false,
      reason: 'empty',
      codePoints: 0,
    });
  });
});

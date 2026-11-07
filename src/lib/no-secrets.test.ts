// Static guard (TB-19): app code may only read EXPO_PUBLIC_* (and NODE_ENV) from process.env, and
// must never mention a server-only Supabase key. Everything under src/ can end up in the bundle.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..');
const SELF = relative(SRC, __filename);

// Assembled from parts so this file never matches its own rules.
const FORBIDDEN_NAMES = [
  ['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_'),
  ['SUPABASE', 'SECRET', 'KEY'].join('_'),
  ['SERVICE', 'ROLE', 'KEY'].join('_'),
  // TB-22: the LLM provider key is an Edge Function secret only.
  ['ANTHROPIC', 'API', 'KEY'].join('_'),
];
const SECRET_VALUE = new RegExp(`${['sb', 'secret', ''].join('_')}[A-Za-z0-9_-]{8,}`);
const PROVIDER_KEY_VALUE = new RegExp(`${['sk', 'ant', ''].join('-')}[A-Za-z0-9_-]{8,}`);
// TB-22: server-only code (supabase/functions) must never be imported into the app.
const SERVER_IMPORT = /(?:from\s+|require\(\s*|import\(\s*)['"][^'"]*supabase\/functions/;
const ENV_DOT_READ = /process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g;
const ENV_DYNAMIC_READ = /process\.env\s*\[|\{[^}]*\}\s*=\s*process\.env\b/;

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

const files = listSourceFiles(SRC)
  .map((path) => ({ path: relative(SRC, path), text: readFileSync(path, 'utf8') }))
  .filter((file) => file.path !== SELF);

const isTestFile = (path: string) => /\.test\.tsx?$/.test(path);

describe('no secrets in src/', () => {
  it('finds the source files', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('reads only EXPO_PUBLIC_* or NODE_ENV from process.env in app code', () => {
    const offenders = files
      .filter((file) => !isTestFile(file.path))
      .flatMap((file) =>
        [...file.text.matchAll(ENV_DOT_READ)]
          .map((match) => match[1] ?? '')
          .filter((name) => !name.startsWith('EXPO_PUBLIC_') && name !== 'NODE_ENV')
          .map((name) => `${file.path}: process.env.${name}`),
      );
    expect(offenders).toEqual([]);
  });

  it('never reads process.env dynamically in app code (Expo cannot inline it)', () => {
    const offenders = files
      .filter((file) => !isTestFile(file.path) && ENV_DYNAMIC_READ.test(file.text))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it('never mentions a server-only Supabase key', () => {
    const offenders = files.flatMap((file) => [
      ...FORBIDDEN_NAMES.filter((name) => file.text.includes(name)).map(
        (name) => `${file.path}: ${name}`,
      ),
      ...(SECRET_VALUE.test(file.text) ? [`${file.path}: secret-key-shaped value`] : []),
      ...(PROVIDER_KEY_VALUE.test(file.text) ? [`${file.path}: provider-key-shaped value`] : []),
    ]);
    expect(offenders).toEqual([]);
  });

  it('never imports server-only Edge Function code', () => {
    const offenders = files.filter((file) => SERVER_IMPORT.test(file.text)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});

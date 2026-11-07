// Static guard (TB-20, spec T1/T6): auth code never logs, and the session never goes to a
// non-secure store. Sessions are bearer tokens; emails and codes are personal data.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const AUTH_DIR = __dirname;
const SRC = join(__dirname, '..', '..');

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

const isTest = (path: string) => /\.test\.tsx?$|[\\/]testing[\\/]/.test(path);
const appFiles = (dir: string) =>
  listFiles(dir)
    .filter((path) => !isTest(path))
    .map((path) => ({ path: relative(SRC, path), text: readFileSync(path, 'utf8') }));

describe('auth: no leaks', () => {
  it('has no console.* calls in auth app code', () => {
    const offenders = appFiles(AUTH_DIR)
      .filter((file) => /\bconsole\s*\./.test(file.text))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it('passes the SecureStore adapter as the supabase-js session storage', () => {
    const client = readFileSync(join(SRC, 'lib', 'supabase.ts'), 'utf8');
    expect(client).toMatch(/storage:\s*createSecureStoreAdapter\(SecureStore/);
    expect(client).toMatch(/persistSession:\s*true/);
  });

  it('never stores the session in AsyncStorage, localStorage or SQLite kv-store', () => {
    const offenders = appFiles(SRC)
      .filter((file) =>
        /@react-native-async-storage|expo-sqlite\/(kv-store|localStorage)|\blocalStorage\b/.test(
          file.text,
        ),
      )
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it('reads the session only through features/auth (no other supabase.auth callers)', () => {
    const offenders = appFiles(SRC)
      .filter((file) => !file.path.startsWith(join('features', 'auth')))
      .filter((file) =>
        /\.auth\.(getSession|signIn|verifyOtp|signOut|onAuthStateChange)/.test(file.text),
      )
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });
});

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { redact, scanDirectory, scanText } from './check-bundle-secrets';

// Fixtures are assembled at runtime so no secret-shaped literal sits in the repo.
const fakeSecretKey = () => `${['sb', 'secret', ''].join('_')}${'Ab1'.repeat(10)}`;
const base64Url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const fakeJwt = (role: string) =>
  `${base64Url({ alg: 'HS256', typ: 'JWT' })}.${base64Url({ iss: 'supabase', role })}.c2lnbmF0dXJl`;

const CLEAN_BUNDLE =
  'var e={url:"https://example.supabase.co",key:"sb_publishable_ci_dummy"};' +
  'if(k.startsWith("sb_secret_"))throw new Error("must not be a secret key");';

describe('scanText', () => {
  it('passes a clean bundle (including the bare prefix used by the env check)', () => {
    expect(scanText('index.js', CLEAN_BUNDLE)).toEqual([]);
  });

  it('flags a secret key and never echoes it', () => {
    const key = fakeSecretKey();
    const findings = scanText('index.js', `${CLEAN_BUNDLE}var s="${key}";`);
    expect(findings).toEqual([
      { file: 'index.js', rule: 'supabase secret key', preview: redact(key) },
    ]);
    expect(JSON.stringify(findings)).not.toContain(key);
  });

  it('flags a service_role JWT but not an anon JWT', () => {
    expect(scanText('a.js', `x="${fakeJwt('anon')}"`)).toEqual([]);
    expect(scanText('a.js', `x="${fakeJwt('service_role')}"`)).toEqual([
      expect.objectContaining({ rule: 'service_role JWT' }),
    ]);
  });

  it('flags server-only key variable names', () => {
    const name = ['SUPABASE', 'SECRET', 'KEY'].join('_');
    expect(scanText('a.js', `process.env.${name}`)).toEqual([
      { file: 'a.js', rule: 'server-only key name', preview: name },
    ]);
  });
});

describe('scanDirectory', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tb19-bundle-'));
    mkdirSync(join(dir, '_expo', 'static', 'js', 'android'), { recursive: true });
    writeFileSync(join(dir, 'metadata.json'), '{}');
    writeFileSync(join(dir, '_expo', 'static', 'js', 'android', 'entry.hbc'), CLEAN_BUNDLE);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('passes a clean export folder', () => {
    expect(scanDirectory(dir)).toEqual({ fileCount: 2, findings: [] });
  });

  it('finds a secret in a nested binary-ish file', () => {
    const bytes = Buffer.concat([Buffer.from([0, 255, 1]), Buffer.from(fakeSecretKey())]);
    writeFileSync(join(dir, '_expo', 'static', 'js', 'android', 'leak.hbc'), bytes);
    const { findings } = scanDirectory(dir);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.file).toMatch(/leak\.hbc$/);
  });
});

// Bundle secret scanner (TB-19, https://stratyge.atlassian.net/browse/TB-19).
// Scans an `expo export` output folder for anything that must never ship in the app:
// a Supabase secret key, a legacy service_role JWT, or the names of server-only key variables.
// Run with Node 24 (native type stripping): `node scripts/check-bundle-secrets.ts <export-dir>`.
// Exit 1 on any finding or an empty/missing folder. Prints file + rule + redacted preview only.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export type Finding = { file: string; rule: string; preview: string };

// Built from parts so this source file never matches its own rules.
const SECRET_KEY = new RegExp(`${['sb', 'secret', ''].join('_')}[A-Za-z0-9_-]{16,}`, 'g');
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g;
const SERVER_KEY_NAMES = [
  ['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_'),
  ['SUPABASE', 'SECRET', 'KEY'].join('_'),
];

/** First 8 characters then a mask: enough to locate a hit, never enough to reuse it. */
export function redact(value: string): string {
  return `${value.slice(0, 8)}…[redacted]`;
}

function jwtRole(token: string): unknown {
  const payload = token.split('.')[1];
  if (!payload) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as { role?: unknown }).role
      : undefined;
  } catch {
    return undefined;
  }
}

/** Pure: every forbidden thing in one file's text. */
export function scanText(file: string, text: string): Finding[] {
  const findings: Finding[] = [];
  for (const match of text.matchAll(SECRET_KEY)) {
    findings.push({ file, rule: 'supabase secret key', preview: redact(match[0]) });
  }
  for (const match of text.matchAll(JWT)) {
    if (jwtRole(match[0]) === 'service_role') {
      findings.push({ file, rule: 'service_role JWT', preview: redact(match[0]) });
    }
  }
  for (const name of SERVER_KEY_NAMES) {
    if (text.includes(name)) findings.push({ file, rule: 'server-only key name', preview: name });
  }
  return findings;
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

/** Scans every file under `dir` (JS, Hermes bytecode, maps, assets) as latin1 text. */
export function scanDirectory(dir: string): { fileCount: number; findings: Finding[] } {
  const files = listFiles(dir);
  const findings = files.flatMap((path) =>
    scanText(relative(dir, path), readFileSync(path).toString('latin1')),
  );
  return { fileCount: files.length, findings };
}

function main(dir: string | undefined): number {
  if (!dir || !existsSync(dir)) {
    console.error(`check-bundle-secrets: export folder not found: ${dir ?? '(none given)'}`);
    return 1;
  }
  const { fileCount, findings } = scanDirectory(dir);
  if (fileCount === 0) {
    console.error(`check-bundle-secrets: ${dir} is empty, nothing was scanned`);
    return 1;
  }
  for (const finding of findings) {
    console.error(`${finding.file}: ${finding.rule} (${finding.preview})`);
  }
  if (findings.length > 0) {
    console.error(`check-bundle-secrets: ${findings.length} finding(s) in ${fileCount} files`);
    return 1;
  }
  console.log(`check-bundle-secrets: ${fileCount} files scanned, no secrets found`);
  return 0;
}

// Run only as a CLI, not when imported by Jest.
if (/check-bundle-secrets\.ts$/.test(process.argv[1] ?? '')) {
  process.exit(main(process.argv[2]));
}

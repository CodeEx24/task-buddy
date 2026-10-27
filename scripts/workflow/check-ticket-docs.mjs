#!/usr/bin/env node
// Deterministic checks for the delivery workflow (docs/workflow/README.md).
// Zero dependencies so it runs before TB-15 creates package.json, and in CI afterwards.
//
//   node scripts/workflow/check-ticket-docs.mjs                 # check all ticket + action docs
//   node scripts/workflow/check-ticket-docs.mjs --branch <name> # also check branch name + its ticket folder
//   node scripts/workflow/check-ticket-docs.mjs --branch <name> --pr
//        # PR gate: the branch's ticket must have verification.md with no unmet AC rows
//
// Exit code 1 on any violation.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const JIRA_BASE = 'https://stratyge.atlassian.net/browse/';
const TICKETS_DIR = 'docs/tickets';
const ACTIONS_DIR = 'docs/actions';
const BRANCH_RE = /^(feat|fix|chore|refactor|docs|test|perf|build|ci)\/tb-(\d+)\/[a-z0-9]+(-[a-z0-9]+)*$/;
const TICKET_DIR_RE = /^TB-\d+$/;
const ACTION_HEADINGS = ['## Purpose', '## Steps', '## Verify', '## Completion checklist', '## If it fails'];

const args = process.argv.slice(2);
const branchArg = args.includes('--branch') ? args[args.indexOf('--branch') + 1] : undefined;
const branch = branchArg && !branchArg.startsWith('--') ? branchArg : undefined;
const isPrGate = args.includes('--pr');
const errors = [];
if (args.includes('--branch') && !branch) errors.push('--branch needs a branch name');
if (isPrGate && !branch) errors.push('--pr requires --branch <name>');

const read = (path) => readFileSync(path, 'utf8');
const isDir = (path) => existsSync(path) && statSync(path).isDirectory();

function checkTicketFolder(key) {
  const dir = join(TICKETS_DIR, key);
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  const isCompact = files.includes('README.md');
  const fullSet = ['intent.md', 'spec.md', 'plan.md'];
  if (!isCompact && !fullSet.every((f) => files.includes(f))) {
    errors.push(`${dir}: needs README.md (compact) or all of ${fullSet.join(', ')}`);
  }
  const link = new RegExp(`${JIRA_BASE.replace(/[.]/g, '\\.')}${key}(?!\\d)`);
  for (const file of files) {
    if (!link.test(read(join(dir, file)))) {
      errors.push(`${dir}/${file}: missing Jira link ${JIRA_BASE}${key}`);
    }
  }
}

function checkVerification(key) {
  const path = join(TICKETS_DIR, key, 'verification.md');
  if (!existsSync(path)) {
    errors.push(`${path}: required before opening a PR`);
    return;
  }
  const text = read(path);
  const section = (title) => {
    const match = new RegExp(`##\\s*${title}[^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)`, 'i').exec(text);
    return match ? match[1] : undefined;
  };
  // Data rows of the first table in a section: skip header and separator.
  const rows = (body) =>
    body
      .split('\n')
      .filter((l) => l.trim().startsWith('|'))
      .slice(2)
      .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));

  const commands = section('Commands run');
  if (commands === undefined) {
    errors.push(`${path}: missing "## Commands run" section with real output`);
  } else {
    const ran = rows(commands);
    if (!ran.some((r) => r[1])) errors.push(`${path}: "Commands run" has no recorded results`);
    for (const r of ran) {
      if (r[1] && !/^pass/i.test(r[1])) errors.push(`${path}: command ${r[0]} is "${r[1]}", not pass`);
    }
  }

  const ac = section('Acceptance criteria');
  if (ac === undefined) {
    errors.push(`${path}: missing "## Acceptance criteria" table`);
  } else {
    const acRows = rows(ac);
    if (!acRows.length) errors.push(`${path}: acceptance-criteria table is empty`);
    for (const r of acRows) {
      if ((r[1] ?? '').toLowerCase() !== 'met') {
        errors.push(`${path}: AC "${(r[0] ?? '').slice(0, 60)}" is "${r[1] || 'blank'}", must be "met"`);
      }
    }
  }
}

if (isDir(TICKETS_DIR)) {
  for (const entry of readdirSync(TICKETS_DIR)) {
    const path = join(TICKETS_DIR, entry);
    if (isDir(path) && TICKET_DIR_RE.test(entry)) checkTicketFolder(entry);
    else if (/^TB-\d+\.md$/.test(entry)) {
      errors.push(`${path}: use the folder layout docs/tickets/${entry.replace('.md', '')}/ (see docs/workflow/README.md)`);
    }
  }
}

if (isDir(ACTIONS_DIR)) {
  for (const file of readdirSync(ACTIONS_DIR)) {
    if (!file.endsWith('.md') || file === 'README.md' || file === '_TEMPLATE.md') continue;
    const text = read(join(ACTIONS_DIR, file));
    for (const heading of ACTION_HEADINGS) {
      if (!text.includes(heading)) errors.push(`${ACTIONS_DIR}/${file}: missing section "${heading}"`);
    }
    if (!/Related:\s*\S/i.test(text)) {
      errors.push(`${ACTIONS_DIR}/${file}: missing "Related:" line naming a TB key, wave, or the workflow`);
    }
  }
}

if (branch) {
  const match = BRANCH_RE.exec(branch);
  if (!match) {
    errors.push(`branch "${branch}" does not match <type>/tb-<n>/<kebab-title>`);
  } else {
    const key = `TB-${match[2]}`;
    if (!isDir(join(TICKETS_DIR, key))) errors.push(`branch ${branch}: missing ${TICKETS_DIR}/${key}/`);
    else if (isPrGate) checkVerification(key);
  }
}

if (errors.length) {
  console.error(`workflow check: ${errors.length} problem(s)`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('workflow check: ok');

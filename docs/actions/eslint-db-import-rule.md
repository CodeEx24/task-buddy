# Add the ESLint rule that keeps database access inside src/db

> Related: TB-21 (https://stratyge.atlassian.net/browse/TB-21) | Wave 1
> Status: Done (2026-10-28, added by Claude at the owner's request in PR for chore/tb-21/eslint-db-import-rule) · Created by: Claude Code on 2026-10-28

## Purpose
CLAUDE.md says components never open the database directly; everything goes through a repository. TB-21 planned a lint rule to enforce that. The rule has been written and tested, but a local Claude Code hook (`config-protection`, from the ecc plugin) blocks agents from editing `eslint.config.js`, so it was never committed. Agents must not work around that hook.

Without the rule, nothing stops future code from importing `expo-sqlite` in a screen.

## Prerequisites
- Your editor, on a new branch from `main` (for example `chore/tb-21/eslint-db-import-rule`).

## Steps
Choose one:

**A. Add it yourself**
1. Open `eslint.config.js`.
2. Paste this block just **before** the `{ ignores: [...] }` block:
   ```js
   {
     // Only src/db opens the local database; everything else goes through a repository.
     files: ['src/**/*.{ts,tsx}'],
     ignores: ['src/db/**'],
     rules: {
       'no-restricted-imports': [
         'error',
         {
           paths: [
             { name: 'expo-sqlite', message: 'Open the DB only in src/db; use a repository in features/*/repo.' },
             { name: 'better-sqlite3', message: 'Open the DB only in src/db; use a repository in features/*/repo.' },
           ],
           patterns: [
             {
               group: ['drizzle-orm/expo-sqlite', 'drizzle-orm/expo-sqlite/*'],
               message: 'Open the DB only in src/db; use a repository in features/*/repo.',
             },
           ],
         },
       ],
     },
   },
   ```
3. Run `pnpm lint`. It should pass (no file outside `src/db` imports these today).
4. Commit `chore(lint): restrict SQLite imports to src/db (TB-21)`, open a PR, merge when CI is green.

**B. Let Claude do it**
1. Temporarily allow the edit: start Claude Code with `ECC_DISABLED_HOOKS=pre:config-protection` set (or disable that hook in your ecc settings).
2. Tell Claude "add the TB-21 ESLint rule". Claude will make the change, prove it with a deliberate violation, open the PR and merge it.
3. Re-enable the hook afterwards.

## Expected result
`pnpm lint` passes on `main`. A file like `src/features/tasks/components/x.ts` that imports `expo-sqlite` fails lint with "Open the DB only in src/db…".

## Verify
Create a scratch file `src/features/tmp.ts` containing `import 'expo-sqlite';`, run `pnpm lint`, and check you see 1 error. Delete the file.

## Completion checklist
- [ ] Rule added to `eslint.config.js` and merged
- [ ] `pnpm lint` green on `main`
- [ ] Scratch-file check fails as expected (then deleted)
- [ ] Status above set to Done

## If it fails
- **Lint fails on an existing file:** that file opens the DB outside `src/db`. Move the access into a repository, or ask Claude to.
- **Prettier complains about formatting:** run `pnpm exec prettier --write eslint.config.js`.

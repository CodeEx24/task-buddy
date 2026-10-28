# Human actions

Step-by-step guides for things only the project owner can do: credentials, console settings, store forms, paid builds, approvals. Agents create one from [`_TEMPLATE.md`](_TEMPLATE.md) whenever they're blocked on you, and link it from the Jira comment.

Rules: never store secrets here. Name the secret and where it goes (for example, the Supabase Edge Function secret `ANTHROPIC_API_KEY`), never its value. When you finish an action, tick its checklist and set its status to Done in the same file.

## Your to-do list (open actions, in order)
1. **[Create the Supabase projects](https://github.com/CodeEx24/task-buddy/blob/chore/tb-19/supabase-baseline/docs/actions/supabase-projects.md)** (TB-19). Two Free projects in Singapore, plus three EAS values. This is the critical path: it unblocks TB-19 → TB-20 sign-in → TB-22 AI gateway. The guide lands here as `supabase-projects.md` when PR #12 merges.
2. **[Check the task modal's swipe-down on an iPhone](ios-modal-swipe-check.md)** (TB-18). About 2 minutes. It unblocks PR #11 and TB-18 Done.
3. **[Make the Supabase and bundle checks required](github-required-checks.md)** (TB-19). Do this after PR #12 merges.
4. **[Add the ESLint rule for database imports](eslint-db-import-rule.md)** (TB-21). Not blocking; it guards against future mistakes.

## All actions
| Action | Related | Status |
|---|---|---|
| [Create the Supabase projects](https://github.com/CodeEx24/task-buddy/blob/chore/tb-19/supabase-baseline/docs/actions/supabase-projects.md) | TB-19 | Open (guide in PR #12) |
| [Check the task modal's swipe-down on an iPhone](ios-modal-swipe-check.md) | TB-18 | Open |
| [Make the Supabase and bundle checks required](github-required-checks.md) | TB-19 | Open (after PR #12) |
| [Add the ESLint rule for database imports](eslint-db-import-rule.md) | TB-21 | Open |
| [Align Jira and the workbook](jira-workbook-alignment.md) | Workflow / Wave 1 | Done (one optional workbook edit left) |
| [Set up an Android emulator and Expo Go on iPhone](android-emulator-setup.md) | TB-15 | Done |
| [Create the Supabase projects and set their EAS variables](supabase-projects.md) | TB-19 | Open |

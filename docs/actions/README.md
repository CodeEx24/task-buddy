# Human actions

Step-by-step guides for things only the project owner can do: credentials, console settings, store forms, paid builds, approvals. Agents create one from [`_TEMPLATE.md`](_TEMPLATE.md) whenever they're blocked on you, and link it from the Jira comment.

Rules: never store secrets here. Name the secret and where it goes (for example, the Supabase Edge Function secret `ANTHROPIC_API_KEY`), never its value. When you finish an action, tick its checklist and set its status to Done in the same file.

## Your to-do list (open actions, in order)
1. **[Push the database migration to Supabase](supabase-db-push.md)** (TB-19 deploy step). About 5 minutes. It creates the `profiles` table in dev and staging, and TB-20 sign-in needs it.
2. **[Set up email-code sign-in in the Supabase dashboard](supabase-auth-email-otp.md)** (TB-20). About 15 minutes, plus pasting one CI job and a new dev build. Decisions made (D1–D9 option A). Do it after step 1.

Everything else is done.

## All actions
| Action | Related | Status |
|---|---|---|
| [Push the database migration to Supabase](supabase-db-push.md) | TB-19 | Open |
| [Set up email-code sign-in in the Supabase dashboard](supabase-auth-email-otp.md) | TB-20 | Open (decisions made) |
| [Create the Supabase projects and set their EAS variables](supabase-projects.md) | TB-19 | Done (2026-10-28) |
| [Check the task modal's swipe-down on an iPhone](ios-modal-swipe-check.md) | TB-18 | Done (2026-10-28) |
| [Make the Supabase and bundle checks required](github-required-checks.md) | TB-19 | Done (2026-10-28, by Claude) |
| [Add the ESLint rule for database imports](eslint-db-import-rule.md) | TB-21 | Done (2026-10-28, by Claude, PR #15) |
| [Align Jira and the workbook](jira-workbook-alignment.md) | Workflow / Wave 1 | Done (one optional workbook edit left) |
| [Set up an Android emulator and Expo Go on iPhone](android-emulator-setup.md) | TB-15 | Done |

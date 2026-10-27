# TB-17 — Intent

> Jira: https://stratyge.atlassian.net/browse/TB-17 · Blueprint: US-003 · Wave 1 (batch B, critical path) · Risk: Medium
> Status: **Accepted by the owner on 2026-10-27** ("accept all")

## Problem
The app has one unstyled placeholder screen. Without shared tokens and primitives, every later screen (TB-18 shell, TB-26 task CRUD, TB-27 Today/Inbox) would invent its own colours, spacing and controls, which breaks dark mode and accessibility.

## Desired outcome
- One token theme (colour, spacing, radius, type scale) with light and dark values that follow the system appearance live, without a reload.
- Five typed, accessible primitives in `src/components/ui/`: **Button, Input, Card, Checkbox, Sheet**.
- Body text meets WCAG 4.5:1 contrast in both themes, checked by an automated test.
- Every primitive is used by at least one screen (the home screen until TB-18 adds tabs).

## Affected users
All app users (visual and accessibility), and every developer building screens later.

## Constraints
- Stack is locked: **NativeWind** (Tailwind for RN), token theme, light/dark (CLAUDE.md §2).
- Reuse-first: later tickets must use these primitives rather than raw `Pressable`/`TextInput`.
- `app/_layout.tsx` belongs to TB-18. TB-17 exports a provider or setup only, and TB-18 wires the shell (wave-plan hotspot 3). TB-17 may import `global.css` once in the root layout if NativeWind requires it (one line, recorded).
- `babel.config.js` / `metro.config.js` are shared with TB-21. **TB-17 merges first** and TB-21 rebases (hotspot 2).
- Accessibility: roles, labels, 44×44 pt minimum touch targets, and a visible focus/pressed state.

## Out of scope
Tab navigation and task modal (TB-18), task-specific components (TB-26+), custom fonts, animations beyond the Sheet's own.

## Open questions
| # | Question | Why it matters | Answer (who, date) |
|---|---|---|---|
| 1 | NativeWind 4.2.7 (stable, Tailwind v3) or 5.0.0-rc.0 (release candidate, Tailwind v4, docs written for Expo 57)? | Different config model. v5 is pre-release | |
| 2 | Brand palette: any preferred colours, or should Claude propose a calm neutral + one accent palette? | Tokens are hard to change once screens exist | Default: Claude proposes; owner can tweak tokens later |

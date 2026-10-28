# TB-54 — Google Play data-safety form (draft)

> Jira: https://stratyge.atlassian.net/browse/TB-54 · Matches [privacy.html](../../../legal-site/privacy.html) as of 28 October 2026 · Entered by the owner in Play Console → App content → Data safety (TB-38 / TB-64)
> **Draft, not legal advice.** Review with counsel before submission. Re-check whenever a feature that collects data ships.

Play terms: **collected** = sent off the device. **Shared** = transferred to a third party, except service providers processing on our behalf (Supabase, Anthropic, Sentry, PostHog all act as our service providers, so nothing is "shared"). **Optional** = the user can use the app without it.

## Overview questions
| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | Yes |
| Is all of the user data collected by your app encrypted in transit? | Yes (HTTPS/TLS to Supabase, our gateway, Sentry, PostHog) |
| Which account creation methods does your app support? | Username and other authentication (email one-time code). Apple / Google sign-in when they ship |
| Do you provide a way for users to request that their data is deleted? | Yes |
| Delete account URL | https://task-buddy--legal.expo.app/privacy#delete-account (email request until in-app deletion, TB-53) |
| Privacy policy URL | https://task-buddy--legal.expo.app/privacy |
| Has your app been independently security reviewed (MASA)? | No |
| Is your app designed for children? | No |

## Data types
| Category → type | Collected | Shared | Ephemeral processing? | Required or optional | Purposes | Notes |
|---|---|---|---|---|---|---|
| Personal info → **Email address** | Yes | No | No | Required (to sign in) | App functionality, Account management | Supabase Auth |
| Personal info → **User IDs** | Yes | No | No | Required | App functionality, Account management, Fraud prevention, security and compliance | Supabase account ID; AI usage limits |
| Photos and videos → **Photos** | Yes | No | No (Anthropic retains up to 30 days) | Optional | App functionality | Only a photo chosen for an AI feature |
| Audio → **Voice or sound recordings** | No | — | — | — | — | Only the transcript leaves the device (see "Other user-generated content"). **Counsel to confirm** for the OS speech service case |
| App activity → **Other user-generated content** | Yes | No | No | Optional | App functionality | AI-feature text, tasks included in an AI request, voice transcripts |
| App activity → **App interactions** | Yes | No | No | Optional (opt-in, off by default) | Analytics | PostHog (TB-65) |
| App info and performance → **Crash logs** | Yes | No | No | Required (not user-controllable today) | App functionality, Analytics (diagnostics) | Sentry, scrubbed, not linked to the account |
| App info and performance → **Diagnostics** | Yes | No | No | Required | App functionality | Sentry session / release health |
| Device or other IDs | No | — | — | — | — | No advertising ID. Re-check when push tokens ship (Expo push token) |
| Financial info → Purchase history | No | — | — | — | — | Add when the paid tier ships (RevenueCat) |
| Location, Contacts, Messages, Health and fitness, Calendar, Files and docs, Web browsing, Web history | No | — | — | — | — | |

## Before submitting
- [ ] Operator facts confirmed and the site redeployed ([legal-owner-facts.md](../../actions/legal-owner-facts.md)); the deletion page must name a real contact address, or Play may reject the URL.
- [ ] Crash logs: if TB-37 or later adds an in-app crash-report toggle, change "Required" to "Optional".
- [ ] Rows marked "confirm" / "re-check" resolved against the shipped build.
- [ ] Counsel review done.

# TB-54 — App Store privacy labels (draft)

> Jira: https://stratyge.atlassian.net/browse/TB-54 · Matches [privacy.html](../../../legal-site/privacy.html) as of 28 October 2026 · Entered by the owner in App Store Connect → App Privacy (TB-64)
> **Draft, not legal advice.** Review with counsel before submission. Re-check whenever a feature that collects data ships.

Apple counts data as "collected" when it leaves the device in a way that the developer or its partners can access for longer than needed to serve the request in real time. Anthropic keeps API inputs and outputs for up to 30 days, so AI content counts as collected even though our server does not store it. Data collected only optionally (for example opt-in analytics) must still be declared.

## Answers

**Privacy Policy URL:** https://task-buddy--legal.expo.app/privacy

**Do you or your third-party partners collect data from this app?** Yes.

**Tracking** (linking data with third-party data for ads, or sharing with data brokers): **No** for every type. No ATT prompt needed.

| Apple data type | Collected? | Linked to the user? | Used for tracking? | Purposes | Notes |
|---|---|---|---|---|---|
| Contact Info → **Email Address** | Yes | Yes | No | App Functionality | Supabase sign-in (one-time code) |
| Identifiers → **User ID** | Yes | Yes | No | App Functionality | Supabase account ID. Used for AI usage limits |
| User Content → **Photos or Videos** | Yes | Yes | No | App Functionality | Only a photo the user picks for an AI feature; sent through our gateway to Anthropic; not stored by us |
| User Content → **Other User Content** | Yes | Yes | No | App Functionality | Text typed into AI features, the tasks needed for an AI request, and voice transcripts. Tasks used without AI stay on the device and are not "collected" |
| User Content → **Audio Data** | No | — | — | — | We only receive the transcript. On-device recognition where available; otherwise the OS speech service (Apple/Google) under the user's own platform terms. **Counsel to confirm** that OS speech service processing does not count as our collection |
| Diagnostics → **Crash Data** | Yes | No | No | App Functionality | Sentry; `sendDefaultPii: false`, task text / email / OTP scrubbed, no user ID set (TB-37) |
| Diagnostics → **Performance Data** | No | — | — | — | No performance tracing configured (re-check TB-37 config before submission) |
| Diagnostics → **Other Diagnostic Data** | Yes | No | No | App Functionality | Sentry session / release-health data (crash-free sessions) |
| Usage Data → **Product Interaction** | Yes (optional) | No (confirm at TB-65) | No | Analytics | PostHog, only after opt-in, off by default. If TB-65 identifies users by account ID, change "Linked" to Yes |
| Identifiers → **Device ID** | No | — | — | — | No advertising ID. **Re-check:** if a push token is stored for server check-ins, Apple does not require declaring it as Device ID, but confirm at the push ticket |
| Purchases | No | — | — | — | Free at launch. When the paid tier ships (RevenueCat): Purchases → Purchase History, linked, App Functionality |
| Location, Health & Fitness, Financial Info, Sensitive Info, Contacts, Browsing History, Search History, Other Data | No | — | — | — | |

## Data use details (for the "linked to you" types)
- Email address and User ID: sign-in and account; never used for advertising.
- Photos, Other User Content: sent to Anthropic only to produce the AI result requested; Anthropic may not train on it and deletes it within 30 days (up to 2 years if flagged for Usage Policy violations).

## Before submitting
- [ ] Operator facts confirmed and the site redeployed ([legal-owner-facts.md](../../actions/legal-owner-facts.md)).
- [ ] Rows marked "confirm" / "re-check" resolved against the shipped build.
- [ ] Counsel review done.

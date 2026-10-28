# Set up email-code sign-in in the Supabase dashboard

> Related: TB-20 (https://stratyge.atlassian.net/browse/TB-20) | Wave 1 | spec D3, D5, D6, D9
> Status: Open (decisions made: D1–D9 option A, 2026-10-28) · Created by: Claude Code on 2026-10-28

## Purpose
TB-20 lets people sign in by typing a 6-digit code sent to their email. Some of the settings that make this work live only in the Supabase dashboard, and only you can change them: the email template, the code length and expiry, and the resend interval. Without them, Supabase emails a magic link instead of a code, and the "resend after 30 seconds" button would be refused for another 30 seconds.

This unblocks the TB-20 device check (sign in on a phone with a real inbox). The CI tests don't need it; they use a local Supabase with its own settings.

## Prerequisites
- **Do [Push the database migration to Supabase](supabase-db-push.md) first.** It creates the `profiles` table and the trigger that adds a profile for each new user.
- Your Supabase account that owns `taskbuddy-dev` (ref `wsmjplylzphwecxlbbbv`) and `taskbuddy-staging` (ref `lqjofqtxhrkdsefupkfp`). Do prod later, when it exists.
- No secrets are needed, unless you choose custom SMTP (D6 option B). Then you'll need your email provider's SMTP host, port, username and password. Type them into the dashboard only, never into chat or the repo.

## Steps
Do steps 1–5 on **dev**, then repeat them on **staging**. Steps 6–8 are once.

1. **Turn email sign-in on.** Go to *Authentication → Sign In / Providers → Email*. Check that **Email** is enabled. Leave **Confirm email** as it is, but note whether it's on (step 2 depends on it). Set **Email OTP Length** to `6` and **Email OTP Expiration** to `600` seconds (10 minutes). Save.
2. **Make the email send a code, not a link.** Go to *Authentication → Emails → Templates* and open **Magic Link**. Set the subject to `Your Task Buddy code` and replace the body with:
   ```html
   <h2>Your Task Buddy sign-in code</h2>
   <p>Enter this code in the app: <strong>{{ .Token }}</strong></p>
   <p>It expires in 10 minutes. If you didn't ask for it, you can ignore this email.</p>
   ```
   There must be no `{{ .ConfirmationURL }}` in it. If **Confirm email** was on in step 1, make the same change to the **Confirm signup** template, because a brand-new user gets that one instead. Save each template.
3. **Allow a resend after 30 seconds, and slow down code guessing.** Go to *Authentication → Rate Limits*.
   - Find the minimum time between OTP or magic-link requests for one user (the default is 60 seconds) and set it to `30` seconds.
   - Find the limit on **token verifications** (OTP / magic-link checks per IP, default 30 per 5 minutes) and lower it to `10` per 5 minutes. The app already locks the code screen after 5 wrong codes per email sent, so 10 leaves room for two attempts from the same network.
   - Optional: if *Authentication → Attack Protection* offers a **CAPTCHA** (hCaptcha / Cloudflare Turnstile), note it for later. Turning it on now would block sign-in, because the app doesn't send a captcha token yet. That's a follow-up ticket.
   - Save.
4. **Set the redirect URL.** Go to *Authentication → URL Configuration*. Set **Site URL** to `taskbuddy://`. Check that **Redirect URLs** (the allow-list) is **empty**, and remove anything there. The code flow doesn't use links, so nothing should be allowed as a redirect. Do the same on **production** when that project exists.
4a. **The other email templates.** In *Authentication → Emails → Templates*, Task Buddy doesn't use **Reset password (recovery)**, **Invite user** or **Change email address**: the app has no passwords, invites or email changes.
   - **Reset password: neutralize it (recommended).** Anyone holding the app's public key can request a recovery email for any address, and the default body contains a sign-in link. Replace the body with `This request didn't come from the Task Buddy app. You can ignore this email.` (no `{{ .ConfirmationURL }}`).
   - **Invite user** needs a server key, and **Change email address** needs a signed-in user. Neutralize them the same way, or tick "confirmed unused" in the checklist.
   - Don't change **Confirm signup** or **Magic Link** beyond step 2; sign-in uses them.
5. **Email sender (D6).**
   - Option A (recommended): change nothing. The built-in sender works for testing, but it only sends a handful of emails per hour. Space out your test sign-ins.
   - Option B: go to *Authentication → Emails → SMTP Settings*, enable custom SMTP, and enter your provider's details. Your provider will first ask you to verify a sending domain with DNS records. Afterwards, raise the email-per-hour limit under *Rate Limits* if you need to.
6. **Add the CI `auth` job.** Agents can't edit workflow files in this repo. Paste the job from [`docs/tickets/TB-20/ci-auth-job.yml`](../tickets/TB-20/ci-auth-job.yml) under `jobs:` in `.github/workflows/ci.yml` on the TB-20 branch, or tell Claude to do it and approve the edit. Optionally make `auth` a required check afterwards.
7. **New dev build.** TB-20 adds a native module (`expo-secure-store`), so the dev client on your phone or emulator can't run it. Once the TB-20 code is on its branch, Claude will ask you to run:
   ```bash
   eas build --profile development --platform android
   eas build --profile development --platform ios
   ```
   Then install the new builds.
8. Tell Claude "auth dashboard done" and list the values you set.

## Expected result
On dev and staging, a sign-in request sends an email with a 6-digit code and no link. A second request is accepted 30 seconds after the first. A code stops working after 10 minutes.

## Verify
- Send yourself a code from the app (or from the dashboard's *Authentication → Users → Send magic link*). The email shows a 6-digit code and no link.
- Request a second code about 35 seconds after the first. It arrives, with no "too many requests" error.
- In *Authentication → Users*, your user appears. In *Table Editor → profiles*, a row with the same id appears (the trigger from the db push).

## Completion checklist
- [ ] Database push done first ([supabase-db-push.md](supabase-db-push.md))
- [ ] dev: OTP length 6, expiry 600 s
- [ ] dev: Magic Link template uses `{{ .Token }}`, plus Confirm signup if confirmations are on
- [ ] dev: resend interval 30 s
- [ ] dev: Site URL `taskbuddy://`, Redirect URLs allow-list empty
- [ ] dev: token-verification limit lowered to 10 per 5 minutes
- [ ] dev: recovery template neutralized; invite and email-change neutralized or confirmed unused
- [ ] staging: the same settings
- [ ] production (when created): redirect allow-list empty, same templates and limits
- [ ] Sender decided (D6) and, for option B, SMTP configured
- [ ] CI `auth` job pasted into `.github/workflows/ci.yml`
- [ ] New Android and iOS dev builds installed (once Claude asks)
- [ ] Claude told; status above set to Done

## If it fails
- **The email still has a link:** you edited a different template. The code comes from **Magic Link**, or from **Confirm signup** for brand-new users when confirmations are on. Check both.
- **"Email rate limit exceeded" or nothing arrives:** the built-in sender's hourly cap was reached. Wait an hour, or set up custom SMTP (step 5, option B).
- **Resend fails with "For security purposes, you can only request this after N seconds":** step 3 wasn't saved, or it was saved on the other project.
- **No profiles row for your user:** the database push hadn't run when you first signed in. Tell Claude, who will give you a one-line backfill to run in the SQL editor.
- **The app crashes with "Cannot find native module ExpoSecureStore":** you're on the old dev build. Do step 6.

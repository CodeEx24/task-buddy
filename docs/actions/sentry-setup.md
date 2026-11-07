# Set up Sentry crash reporting

> Related: TB-37 (https://stratyge.atlassian.net/browse/TB-37) | Wave 3 | Unblocks TB-37 AC1 and AC3 (device proof)
> Status: Open · Created by: Claude Code (TB-37 worker) on 2026-10-28
> Facts checked 2026-10-28: Sentry React Native docs (Expo guide, "Uploading source maps for Expo"), Expo EAS environment-variable docs.

## Purpose
TB-37 adds Sentry to the app, but it stays switched off until it knows where to send reports. Creating a Sentry account and an auth token is something only you can do. When you're done, preview builds send crashes to Sentry with readable stack traces, and Sentry's Releases page shows crash-free sessions per build.

You'll set **four** EAS variables:

| Variable | Secret? | Where it's used |
|---|---|---|
| `EXPO_PUBLIC_SENTRY_DSN` | No, public by design (it can only *send* events). Ships inside the app | The app, at start-up |
| `SENTRY_ORG` | No (a name) | The build, to upload source maps |
| `SENTRY_PROJECT` | No (a name) | The build, to upload source maps |
| `SENTRY_AUTH_TOKEN` | **Yes, secret** | The build only. Never in the repo, `.env.example`, a chat or any `EXPO_PUBLIC_*` variable |

## Prerequisites
- A free Sentry account (https://sentry.io/signup/). The free **Developer** plan is enough.
- The EAS CLI signed in as `codeex24`. Check with `npx eas-cli whoami`.
- Secrets, names only: `SENTRY_AUTH_TOKEN` (an organization auth token you create in step 4).

## Steps
1. **Create the organization.** Sign up at https://sentry.io/signup/ and pick an organization slug, for example `codeex24`. Note the slug: it's in the URL, `https://<org-slug>.sentry.io/`.
2. **Create the project.** Projects → **Create Project** → platform **React Native** → alert setting "Alert me on every new issue" is fine → name it `task-buddy`. Skip the wizard's code snippet (TB-37 already did the setup). Note the project slug (`task-buddy`).
3. **Copy the DSN.** Project → Settings → **Client Keys (DSN)** → copy the DSN. It looks like `https://<32 characters>@o<number>.ingest.<region>.sentry.io/<number>`. Set it for both build environments (it's public, so plaintext is fine):
   ```
   npx eas-cli env:set --name EXPO_PUBLIC_SENTRY_DSN --value "<DSN>" --environment development --visibility plaintext
   npx eas-cli env:set --name EXPO_PUBLIC_SENTRY_DSN --value "<DSN>" --environment preview --visibility plaintext
   ```
   (Production comes with TB-38. Until then production builds keep Sentry off.)
4. **Create the auth token.** Organization **Settings → Developer Settings → Organization Tokens → Create New Token**, name `eas-source-maps`. Organization tokens have the scopes source-map upload needs (`org:ci`: releases and artifact upload). Copy it once into your password manager; Sentry shows it only once. It starts with `sntrys_`.
5. **Store the token as an EAS secret.** Use the website so the value never lands in your shell history: https://expo.dev → project **task-buddy** → **Environment variables** → **Add variable** → name `SENTRY_AUTH_TOKEN`, value: the token, visibility **Secret**, environments **preview** and **production** (development builds don't upload, so it isn't needed there).
6. **Set the org and project names** (not secret) for the same environments:
   ```
   npx eas-cli env:set --name SENTRY_ORG --value <org-slug> --environment preview --visibility plaintext
   npx eas-cli env:set --name SENTRY_PROJECT --value task-buddy --environment preview --visibility plaintext
   npx eas-cli env:set --name SENTRY_ORG --value <org-slug> --environment production --visibility plaintext
   npx eas-cli env:set --name SENTRY_PROJECT --value task-buddy --environment production --visibility plaintext
   ```
7. **Optional, recommended:** Project → Settings → **Security & Privacy** → turn on **Data Scrubber** and **Use Default Scrubbers** (on by default) and **Prevent Storing of IP Addresses**. The app already scrubs on the device; this is a second layer.
8. Tell the coordinator "Sentry is set up". They make a new EAS development build (Sentry is a native module) and a preview build, then run the crash test.

## Expected result
- EAS environment `development`: `EXPO_PUBLIC_SENTRY_DSN`.
- EAS environment `preview`: `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` (secret).
- EAS environment `production`: `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` (secret).

## Verify
1. `npx eas-cli env:list --environment preview` lists the four names; the token's value shows as hidden.
2. After the coordinator's preview build: the build log's "Bundle JavaScript" / Gradle step shows `sentry-cli` uploading the bundle and source map, with no "auth token" error.
3. On the preview build, open `taskbuddy://dev/crash-test`. The status card says **Sentry is on**. Press **Throw a JS error**, reopen the app; press **Crash the native layer**, reopen the app. In Sentry → **Issues** (environment `staging`) both "TB-37 test crash" issues appear and the JS one shows `src/lib/crash-reporting.ts` frames, not `index.android.bundle:1:23456`.
4. Sentry → **Releases** shows the build (`com.codeex24.taskbuddy@1.0.0+<build>`) with a crash-free sessions percentage.

## Completion checklist
- [ ] Sentry organization and React Native project `task-buddy` created
- [ ] `EXPO_PUBLIC_SENTRY_DSN` set for development and preview
- [ ] Organization auth token created and stored as EAS **secret** `SENTRY_AUTH_TOKEN` (preview, production), and nowhere else except your password manager
- [ ] `SENTRY_ORG` and `SENTRY_PROJECT` set for preview and production
- [ ] Told the coordinator, who ran the crash test on a new build

## If it fails
- **App says "Sentry is off"** on a new build: the DSN is missing or malformed for that EAS environment. It must be the full `https://…@…/<number>` value, nothing else. Check `npx eas-cli env:list --environment <env>`. Remember a variable change needs a new build (or an EAS Update) to take effect.
- **Build log: "An organization ID or slug is required" / "Invalid token"**: `SENTRY_ORG`, `SENTRY_PROJECT` or `SENTRY_AUTH_TOKEN` is missing or wrong in that environment. Preview builds still succeed (`SENTRY_ALLOW_FAILURE`), but stacks stay unreadable until fixed. Production builds fail on purpose.
- **Stack traces still minified:** the upload didn't happen (see above), or the release in Sentry doesn't match the build. Don't override the release name anywhere; TB-37 relies on the SDK default.
- **You pasted the token somewhere public by mistake:** revoke it in Sentry (Organization Tokens → delete), create a new one, update the EAS secret.
- **The CI `bundle` job fails with "sentry auth token" or "server-only key name"**: something put the token or its variable name into app code. Remove it; the token belongs only in EAS.

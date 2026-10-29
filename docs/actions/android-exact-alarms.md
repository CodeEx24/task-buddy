# Android exact alarms for reminders: Play policy and device setting

> Related: TB-40 (https://stratyge.atlassian.net/browse/TB-40) | Wave 4 | follow-up in TB-41
> Status: Open · Created by: TB-40 implementing agent on 2026-10-28

## Purpose
Due-time reminders (TB-40) must fire within 60 seconds of the due time. On Android 12 and later that needs an *exact alarm*. The app declares `android.permission.SCHEDULE_EXACT_ALARM` and deliberately **not** `USE_EXACT_ALARM`:

- `USE_EXACT_ALARM` is granted automatically, but Google Play only allows it for apps whose core function is an alarm clock or a calendar. A to-do app declaring it risks a rejection at review.
- `SCHEDULE_EXACT_ALARM` needs no Play declaration form. On Android 12–13 it is granted at install. On **Android 14 and later it starts denied**: the user must allow "Alarms & reminders" for Task Buddy, or Android may deliver reminders late (it falls back to an inexact alarm). TB-41 adds the in-app explanation and the button that opens that setting.

You need to (1) know this before the first Play submission and (2) allow the setting on your test device so AC1 can be checked.

## Prerequisites
- The new development build that includes `expo-notifications` (TB-40) installed on the Android device or emulator.
- For the Play part: access to the Play Console (TB-38 / TB-64 submission). No credentials are needed for this guide.

## Steps
1. **On the test device (now):** open Settings → Apps → Task Buddy → **Alarms & reminders** → turn **Allow setting alarms and reminders** on.
   - Emulator shortcut: `adb shell appops set com.codeex24.taskbuddy SCHEDULE_EXACT_ALARM allow`
2. **Before the first Play upload (TB-38):** in Play Console → App content, if Google asks about exact alarm permissions, answer that the app uses `SCHEDULE_EXACT_ALARM` only (user-granted, for user-set task reminders) and does **not** use `USE_EXACT_ALARM`.
3. If anyone later proposes adding `USE_EXACT_ALARM`, treat it as a product decision: it needs the Play "Exact alarm" declaration and is likely to be refused for a to-do app.

## Expected result
- The test device shows Task Buddy allowed under "Alarms & reminders".
- The Play submission goes through without an exact-alarm declaration.

## Verify
- Device: `adb shell appops get com.codeex24.taskbuddy SCHEDULE_EXACT_ALARM` prints `allow`.
- After creating a task with a due time: `adb shell dumpsys alarm | grep -i -A3 taskbuddy` lists a pending `RTC_WAKEUP` alarm at that time.

## Completion checklist
- [ ] "Alarms & reminders" allowed on the Android test device
- [ ] Play Console exact-alarm question answered (or confirmed not asked) at the first upload

## If it fails
- **The setting is missing:** the device runs Android 11 or older (exact alarms need no permission there), or the installed build predates TB-40. Install the new dev build.
- **Reminders arrive minutes late although allowed:** some OEM battery savers (Xiaomi, Samsung, Huawei) delay alarms; set Task Buddy's battery usage to "Unrestricted" and note the device model in TB-40's verification.
- **Play rejects the build over exact alarms:** check the merged manifest of the AAB for `USE_EXACT_ALARM` (it must not be there) and reply to the review with step 2's wording.

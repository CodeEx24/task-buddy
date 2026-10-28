# Check that a 500-task list scrolls smoothly on your Android phone

> Related: TB-27 (https://stratyge.atlassian.net/browse/TB-27) | Wave 2 | PR #17
> Status: Open · Created by: Claude Code on 2026-10-28

## Purpose
TB-27's third acceptance criterion says a list of 500 tasks scrolls at 60 fps (frames per second) **in a release build**. The Android emulator on this computer draws in software, so it can't show 60 fps even for Android's own Settings app. Only a real phone can prove this one.

You'll install a **preview** build. It's a release build, like the one people will download, so speed is real. It also has a hidden helper screen that adds 500 test tasks in one tap, and removes them again.

This unblocks: marking TB-27's third acceptance criterion as met, and merging PR #17.

## Prerequisites
- An Android phone, charged, about 10 minutes.
- The preview build download link: https://expo.dev/artifacts/eas/-14tnGPVtfS5vHeYm5d_1mhMsh-MI39cxKqajAWi43Y.apk (EAS preview build `41b2c3ec`, expires 2026-11-11).
- No accounts or passwords are needed.

## Steps
1. **Install the app.**
   1. On the phone, open https://expo.dev/artifacts/eas/-14tnGPVtfS5vHeYm5d_1mhMsh-MI39cxKqajAWi43Y.apk in Chrome and tap **Download**.
   2. When the download finishes, tap the file (`.apk`). Android may say it doesn't allow installs from this source. Tap **Settings**, turn on **Allow from this source** for Chrome, go back, and tap **Install**.
   3. If you already have the Task Buddy development build installed, Android may ask to update it. Tap **Update**. If it says the app isn't compatible, uninstall the old Task Buddy first (long-press its icon → **Uninstall**), then install again.
2. **Open Task Buddy** once from the home screen, so it sets itself up.
3. **Open the helper screen.** It has no button in the app; you open it with a link.
   1. Put this link somewhere you can tap it on the phone: `taskbuddy://dev/perf-tasks`. Easiest: send it to yourself (for example in a chat with yourself, an email, or a Google Keep note). Typing it into Chrome's address bar usually just searches, so tap it as a link instead.
   2. Tap the link. If Android asks which app to use, choose **Task Buddy**. You'll see **List performance check**.
   - If tapping the link does nothing: with the phone connected by USB to a computer that has `adb`, run `adb shell am start -a android.intent.action.VIEW -d "taskbuddy://dev/perf-tasks"`, or ask Claude for help.
4. Tap **Add 500 tasks**. Wait until it says **Added 500 tasks.** (one or two seconds).
5. Go back (Android back gesture or button) to the **Today** tab. You'll see Overdue, Today and Later groups full of "Perf task …".
6. *(Optional, gives numbers instead of a feeling.)* Turn on the frame bars:
   1. Settings → **About phone** → tap **Build number** 7 times until it says you're a developer (it may ask for your PIN).
   2. Settings → **System** → **Developer options** (on some phones: Settings → **Developer options** directly).
   3. Find **Profile HWUI rendering** (sometimes called "GPU rendering profile") → choose **On screen as bars**.
   4. Go back to Task Buddy. Coloured bars now run along the bottom of the screen. Each bar is one frame; there's a horizontal **green line** = 16 ms, the time one frame has at 60 fps.
7. **Fling the list** on Today: quick swipes up and down, for about **20 seconds**. Also do a few slow drags.
   - With the bars on: watch whether the bars stay **mostly under the green line**. Mostly under it means about 60 fps (smooth). Many bars well above it, or long spikes, means dropped frames (janky).
8. Do the same on the **Inbox** tab for a few seconds (it has 150 of the tasks).
9. **Clean up.** Tap the link again (step 3) and tap **Remove perf tasks**. It says **Removed 500 tasks.** Your own tasks are untouched.
10. *(Optional)* Turn **Profile HWUI rendering** back **Off**.
11. **Tell Claude** (or comment on TB-27): **smooth** or **janky**, your **phone model** (Settings → About phone), and a screenshot of the bars if you turned them on.

## Expected result
Scrolling 500 tasks feels as smooth as scrolling in Android's own Settings app: no stutter and no blank rows while flinging. With bars on, nearly all bars stay under the green line.

## Verify
- Step 4 showed "Added 500 tasks." and Today was full of "Perf task …" rows.
- You reported smooth/janky + the phone model.
- After step 9 no "Perf task …" rows are left on Today or Inbox.

## Completion checklist
- [ ] Preview build installed
- [ ] 500 tasks added
- [ ] Flinged Today (~20 s) and Inbox
- [ ] Reported "smooth" or "janky" + phone model (and a bars screenshot, optional)
- [ ] Perf tasks removed
- [ ] Status above set to Done with the date

## If it fails
- **"This screen does not exist" at step 3**: you're on a production build or an older build. Make sure you installed the **preview** APK from the link above.
- **The `taskbuddy://` link doesn't open the app**: make sure it shows as a tappable link (in a chat or note, not typed in the browser), or use the `adb` command in step 3, or tell Claude.
- **"Failed — see the log." at step 4**: take a screenshot and send it to Claude; nothing was changed.
- **The app closes or shows a red error**: send a screenshot and say which step.
- **It's janky**: that's still a useful result. Report it with the phone model; the next step is a list library change (TB-27 spec D11).

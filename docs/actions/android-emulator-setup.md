# Set up an Android emulator and Expo Go on iPhone

> Related: TB-15 (https://stratyge.atlassian.net/browse/TB-15) · Wave 1
> Status: Done (2026-10-27): Android emulator booted the app; the owner saw the app in Expo Go on iPhone. Created by Claude Code on 2026-10-27
> Note: iOS Expo Go needs the computer's Expo CLI signed in to the same account. On Windows use `npx expo login --no-browser`, then scan the QR code with the iPhone Camera.

## Purpose
TB-15's first acceptance criterion requires the app to boot on an Android emulator and on iOS. This Windows PC has no Android SDK or Java, and iOS simulators only run on macOS. You chose: an Android emulator on this PC (Claude drives it), plus a check in Expo Go on your iPhone.

## Prerequisites
- About 15 GB free disk space and admin rights on this PC.
- Your iPhone on the **same Wi-Fi** as this PC.
- No credentials needed.

## Steps
**Android (this PC)**
1. Download and install **Android Studio** from https://developer.android.com/studio (accept the defaults; it installs the SDK and a bundled JDK).
2. Open Android Studio → *More Actions* → **SDK Manager** → *SDK Platforms*: tick the latest stable Android API. *SDK Tools*: tick **Android SDK Platform-Tools** and **Android Emulator**. Apply.
3. *More Actions* → **Virtual Device Manager** → *Create device* → Pixel 8 (or similar) → the latest system image → Finish.
4. Set environment variables (Windows Settings → *Edit the system environment variables* → Environment Variables → User variables):
   - `ANDROID_HOME` = `%LOCALAPPDATA%\Android\Sdk`
   - Add to `Path`: `%LOCALAPPDATA%\Android\Sdk\platform-tools` and `%LOCALAPPDATA%\Android\Sdk\emulator`
5. **Restart the terminal / Claude Code session** so the new variables are picked up.

**iPhone**
6. Install **Expo Go** from the App Store.
7. When Claude says the app is ready: in the repo run `pnpm start`, then scan the QR code with the iPhone Camera app. It opens in Expo Go.

## Expected result
- `adb version` and `emulator -list-avds` print a version and your virtual device name.
- The Task Buddy placeholder screen ("Task Buddy") shows in the Android emulator and in Expo Go on the iPhone.

## Verify
Run in a new terminal:
```
adb version
emulator -list-avds
```
Then tell Claude "Android Studio is installed". Claude starts the emulator, runs `pnpm android`, and takes a screenshot. For iOS, send Claude a screenshot from your iPhone (or say what you saw).

## Completion checklist
- [ ] Android Studio, SDK Platform-Tools and Emulator installed
- [ ] A virtual device created
- [ ] `ANDROID_HOME` and `Path` set; `adb version` works in a new terminal
- [ ] Expo Go installed on the iPhone
- [ ] Placeholder screen seen on the iPhone (screenshot or description sent to Claude)

## If it fails
- **`adb` not found:** the terminal was opened before the variables were set. Restart it (or Claude Code).
- **Emulator won't start / "HAXM/hypervisor" error:** enable *Windows Hypervisor Platform* in *Turn Windows features on or off*, then reboot.
- **iPhone can't connect:** check both devices are on the same Wi-Fi and allow Node.js through Windows Firewall. Or run `pnpm start --tunnel`.
- **Expo Go says the SDK version is unsupported:** update Expo Go from the App Store. It supports the latest SDK (58).

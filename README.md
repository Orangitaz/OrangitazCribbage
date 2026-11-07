# OrangitazCribbage

Play cribbage against a computer opponent (NPC). Standard two-player rules, first to 121.

## Play it

Open `cribbage.html` in any browser. It is a single self-contained file with no dependencies, laid out for a phone in portrait.

## Features

- Deal 6, discard 2 to the crib, cut the starter (his heels scores 2 for the dealer)
- Pegging: 15, 31, pairs, runs, go and last card
- The show: hand then crib, with a point-by-point breakdown (fifteens, pairs, runs, flush, nobs)
- Dealer alternates each round
- Pegs on a progress lane with a skunk line at 91
- Win/loss record saved on the device

## NPC

- Crib discards: picks the 2 cards that maximise the average value of the kept hand across the unseen starter cards, adjusted for whether the crib is its own or yours.
- Pegging: takes scoring plays, avoids leaving counts of 5, 10 or 21, and leads low when it opens a count.

## Android

The `app/` folder is a small WebView wrapper (Kotlin, min Android 8.0). At build time `cribbage.html` is copied in as the app's page, so the game has one source of truth. Links that leave the game, such as the update Download link, open in your browser.

### Get an APK from GitHub

- **On demand:** Actions tab, "Build Android APK", "Run workflow". When it finishes, download the `OrangitazCribbage-apk` artifact from the run page (it is a zip containing the APK).
- **As a release:** bump the version in `cribbage.html` and `version.json`, then push a matching tag, for example `v1.0.1`. The workflow builds the APK and attaches it to a GitHub Release, which is where the in-app update link points. If the tag and the two version numbers disagree, the build fails on purpose.

Install the APK on your phone by opening it and allowing installs from your browser or file manager when asked.

### Signing (do this once before your first real release)

Without signing secrets, the APK is signed with a throwaway debug key. It installs, but a later build signed with a different key can't update it in place; you'd have to uninstall first (which also clears your win/loss record). To fix that, make one key and store it as repository secrets:

1. `keytool -genkeypair -v -keystore release.jks -alias cribbage -keyalg RSA -keysize 2048 -validity 10000`
2. `base64 -w0 release.jks` and save the output as the secret `KEYSTORE_BASE64`
3. Add secrets `KEYSTORE_PASSWORD`, `KEY_ALIAS` (`cribbage`) and `KEY_PASSWORD`

Keep `release.jks` somewhere safe and never commit it. If you lose it you can't ship updates to existing installs.

## Updates

The app shows its version at the bottom of the screen, checks `version.json` in this repo once a day on launch, and has a "Check for updates" link. When the version in `version.json` is newer than the one in the app, it shows "Update available" with a download link.

To release a new version:

1. Change `APP_VERSION` near the bottom of `cribbage.html`.
2. Update `version.json` on `main` to the same version number, with short `notes`. Only `https://github.com/` links are accepted for `url`.
3. If you ship an APK, attach it to a new GitHub Release; the default link points to the latest release.

The repo must be public for the update check to work, since the app reads `version.json` from raw.githubusercontent.com. If the repo is private, the app shows "Couldn't check for updates" and keeps working.

## Layout of the code

The scoring and AI functions sit between the `==LOGIC==` and `==END LOGIC==` markers in `cribbage.html` and have no DOM dependencies, so they can be tested in Node.

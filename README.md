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

The game is plain HTML/JS, so it can be wrapped as an Android app (for example an Android Studio WebView project that loads `cribbage.html` from assets, or Capacitor). No wrapper project is included yet.

## Updates

The app shows its version at the bottom of the screen, checks `version.json` in this repo once a day on launch, and has a "Check for updates" link. When the version in `version.json` is newer than the one in the app, it shows "Update available" with a download link.

To release a new version:

1. Change `APP_VERSION` near the bottom of `cribbage.html`.
2. Update `version.json` on `main` to the same version number, with short `notes`. Only `https://github.com/` links are accepted for `url`.
3. If you ship an APK, attach it to a new GitHub Release; the default link points to the latest release.

The repo must be public for the update check to work, since the app reads `version.json` from raw.githubusercontent.com. If the repo is private, the app shows "Couldn't check for updates" and keeps working.

## Layout of the code

The scoring and AI functions sit between the `==LOGIC==` and `==END LOGIC==` markers in `cribbage.html` and have no DOM dependencies, so they can be tested in Node.

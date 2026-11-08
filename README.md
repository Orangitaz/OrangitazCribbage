# OrangitazCribbage

Play cribbage against a computer opponent (NPC). Standard two-player rules, first to 121 (or 61 for a short game). Runs in any browser and builds as an Android app.

## Play it

Open `cribbage.html` in any browser. It is a single self-contained file with no dependencies, laid out for a phone in portrait.

## Features

- Deal 6, discard 2 to the crib, cut the starter (his heels scores 2 for the dealer)
- Pegging: 15, 31, pairs, runs, go and last card
- The show: hand then crib, with a point-by-point breakdown (fifteens, pairs, runs, flush, nobs)
- A cribbage board with two lanes per player (out and back), a front and a back peg each, and the skunk lines
- **Hint button** (blue glow): suggests the best discard, and the best card to play while pegging
- **Undo**: after you send two cards to the crib you have a few seconds to take them back
- **Three difficulty levels** (Menu): Easy, Normal and Hard; a change applies from the next game
- **Stats** (Menu): games, win/loss, streaks, skunks, average and best hand and crib, and results per difficulty. Saved on the device and can be reset
- **Skip animations** (Menu): shortens the NPC's pauses
- **Save and resume**: the game is saved after every move; if the app is closed or Android stops it, the next launch offers "Resume"
- **Short game** (Menu): play to 61 instead of 121 (skunk line at 31)
- **Muggins** (Menu, optional): you count your own hand and crib yourself; the NPC takes any points you miss
- **Hints explain themselves**: the discard hint compares what you keep with what goes to the crib, the pegging hint says why a card is best
- **Sounds, vibration and score popups** (all switchable): points pop up on the table when someone scores
- **Easier to read**: a four-colour deck (clubs green, diamonds blue) and a larger cards and text option
- **Android**: the back button asks before leaving (the game is saved), and the screen can be kept on while you play
- In-app update check (see Updates)

## The NPC

| Level | Discards | Pegging |
|---|---|---|
| Easy | Averages over possible starter cards but ignores the crib, plus a lot of randomness | Usually takes a scoring play, otherwise plays at random |
| Normal | Maximises the average value of the kept hand and adjusts for the crib with simple rules of thumb | Takes scoring plays, avoids leaving counts of 5, 10 or 21, leads low |
| Hard | Same, but values the crib by sampling random crib cards and starters | Guesses the opponent's cards from the cards it has not seen, plays out the rest of the round for each candidate card, and picks the one with the best average point difference |

Measured over simulated games (200 to 500 per matchup, so treat these as roughly ±4 points): Normal beats Easy about 70% of the time, Hard beats Easy about 77%, and Hard beats Normal about 60%. Cribbage has a lot of luck, so a better NPC still loses often.

## Android

The `app/` folder is a small WebView wrapper (Kotlin, min Android 8.0). At build time `cribbage.html` is copied in as the app's page, so the game has one source of truth. Links that leave the game, such as the update Download link, open in your browser.

### Get an APK from GitHub

- **On demand:** Actions tab, "Build Android APK", "Run workflow". When it finishes, download the `OrangitazCribbage-apk` artifact from the run page (it is a zip containing the APK).
- **As a release:** bump the version with `scripts/release.sh` (below) and push. GitHub builds the APK and publishes the release by itself, using your release notes as the description.

The workflow runs the tests first and only builds the APK if they pass.

Install the APK on your phone by opening it and allowing installs from your browser or file manager when asked.

### Signing (do this once before your first real release)

Without signing secrets, the APK is signed with a throwaway debug key. It installs, but a later build signed with a different key can't update it in place; you'd have to uninstall first (which also clears your stats). To fix that, make one key and store it as repository secrets (Settings, Secrets and variables, Actions):

1. `keytool -genkeypair -v -keystore release.jks -alias cribbage -keyalg RSA -keysize 2048 -validity 10000`
2. `base64 -w0 release.jks` and save the output as the secret `KEYSTORE_BASE64`
3. Add secrets `KEYSTORE_PASSWORD`, `KEY_ALIAS` (`cribbage`) and `KEY_PASSWORD`

Keep `release.jks` somewhere safe and never commit it. If you lose it you can't ship updates to existing installs.

## Updates

The app shows its version at the bottom of the screen, checks `version.json` in this repo once a day on launch, and has a "Check for updates" link. When the version in `version.json` is newer than the one in the app, it shows "Update available" with the release notes and a download link.

The repo must be public for the check to work, since the app reads `version.json` from raw.githubusercontent.com. If the repo is private, the app shows "Couldn't check for updates" and keeps working.

### Releasing a new version

```
scripts/release.sh 1.1.1 "What changed, in a sentence"
git push origin main
```

The script sets the version in `cribbage.html` and `version.json` together, writes your notes into `version.json`, runs the tests and commits. After the push, the "Build Android APK" workflow does the rest:

- **Automatically:** it checks every 6 hours. If the version has no GitHub Release yet, it runs the tests, builds the signed APK and publishes the release, with the APK attached as `OrangitazCribbage-<version>.apk` and as `OrangitazCribbage.apk` (a permanent link: `https://github.com/Orangitaz/OrangitazCribbage/releases/latest/download/OrangitazCribbage.apk`).
- **Right away:** Actions tab, "Build Android APK", "Run workflow", tick **publish**. Running it without the tick only builds a downloadable APK and publishes nothing.
- **By tag:** pushing a tag like `v1.1.1`, or publishing a release in the browser, also works; the build attaches the APK to it.

A release is never published if the version in `cribbage.html` and `version.json` disagree, or if a tag doesn't match them. Only `https://github.com/` links are accepted for the update URL. GitHub pauses scheduled workflows after 60 days with no activity in the repo; running the workflow once by hand wakes it up again.

## Tests

```
node --test tests/cribbage.test.js
```

Needs Node 18 or newer, nothing to install. It covers hand scoring (checked against an independent brute-force scorer on 20,000 random hands), pegging, the AI, stats, version comparison, and full simulated games at every difficulty. It also runs in GitHub Actions before every build.

A slower, luck-dependent comparison of Hard against Normal is available with `STRENGTH=1 node --test tests/strength.test.js`.

## Layout of the code

The scoring, AI and stats functions sit between the `==LOGIC==` and `==END LOGIC==` markers in `cribbage.html` and have no DOM dependencies, so the tests load them directly. `tests/harness.js` also runs the whole game script against a fake DOM for the simulations.

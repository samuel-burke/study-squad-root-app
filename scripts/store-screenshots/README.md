# Store screenshots

Makes the Root App Store hero image and the six desktop screenshots (1920x1080 PNG) from the demo build, with real app screens and captions.

1. `npm run demo` (leave it running).
2. `node scripts/store-screenshots/capture.mjs [output folder]` (defaults to `scripts/store-screenshots/out`).

`capture.mjs` drives the demo with a fake clock: it joins the room timer with two goals, finishes round 1 (the break moment), runs into round 2, then opens a profile, the room settings and the progress page, and plays the Giant Slayer unlock. The demo knobs it uses (`badges`, `streak`, `xp`, `weekHours`) are in `docs/TESTING.md`. The screens go to `raw/`, then `frames.html` lays them out with the headlines and the result is screenshotted at 1920x1080.

To change a headline or layout, edit `frames.html` and rerun. Open `raw/frames.html#s1-room` (or any frame id) in a browser to preview after a run.

| File                    | Headline                               |
| ----------------------- | -------------------------------------- |
| `00-hero.png`           | Focus together.                        |
| `01-study-together.png` | Study together, live                   |
| `02-team-win.png`       | Every round ends in a team win         |
| `03-medals.png`         | Collect 49 medals                      |
| `04-streaks-quests.png` | Build a streak that forgives a bad day |
| `05-leaderboard.png`    | Race your squad to the top             |
| `06-admin-settings.png` | Your community, your rules             |

# Testing by hand

Most game features take days to reach for real: streaks need calendar days, and a weekly boss takes hours of focus. These shortcuts get you there in minutes. The full step-by-step test plan is a separate document; this page is the reference.

## Demo URL settings

Run `npm run demo` and add these to the printed URL. They only exist in the demo build, so they never reach a Root community. Reloading the page starts over.

| Parameter        | Example                         | What it does                                                                                                                                                                                                  |
| ---------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `focus`, `break` | `?focus=1&break=0.5`            | Room timer lengths in minutes. A 1 / 0.5 cycle takes 7 minutes. XP counts whole minutes, so `focus` under 1 earns 0 XP.                                                                                       |
| `bots`           | `bots=0`                        | Leaves out the simulated members.                                                                                                                                                                             |
| `elapsed`        | `elapsed=10`                    | How far into round 1 the room is when the page opens.                                                                                                                                                         |
| `bossLeft`       | `bossLeft=2`                    | HP the weekly boss has left, in XP. Any finished round of 1 minute or more then defeats it.                                                                                                                   |
| `bossName`       | `bossName=The Final Final Exam` | Makes this week's boss the built-in boss with that name, for its strength and badges. Names not in the built-in list are ignored.                                                                             |
| `bossHp`         | `bossHp=100`                    | Stands in for the Boss base HP setting.                                                                                                                                                                       |
| `streak`         | `streak=6`                      | Your starting streak. With yesterday active, one finished session makes it 7.                                                                                                                                 |
| `missed`         | `missed=1`                      | Days missed since you were last active. 1 is covered by the week's freeze; 3 always breaks the streak.                                                                                                        |
| `active`         | `active=5,4,3,2`                | Days ago you finished a session (0 is today). Your history is exactly those days, and the streak replays them through the real rules, so freezes are spent as they would be. Overrides `streak` and `missed`. |
| `freezes`        | `freezes=0`                     | Turns streak freezes off, like the admin setting.                                                                                                                                                             |
| `xp`             | `xp=2440`                       | Your starting lifetime XP, for level-ups, Jackpot (any total ending in 777) and Over 9000.                                                                                                                    |
| `unlock`         | `unlock=giant-slayer,blitz`     | Plays those badges' unlock animations, without awarding them, after your first click on the page (browsers only allow sound after a click). `unlock=all` plays one of each tier.                              |
| `badges`         | `badges=first-session,squad-up` | Starts you holding those badges. Without it you start with none, so your first round and goal earn badges live with their unlock moments.                                                                     |
| `weekHours`      | `weekHours=6`                   | Adds that many focus hours to your earlier days this week, to place you on the weekly leaderboard (used for store screenshots).                                                                               |

Useful combinations:

- Defeat a boss: `?focus=1&break=0.5&bossLeft=2`, join the room timer and finish a round.
- Giant Slayer and Survived Finals: `?focus=1&break=0.5&bossLeft=2&bossName=The%20Final%20Final%20Exam`.
- Streak milestone: `?focus=1&break=0.5&streak=6`, finish a round (On a Roll).
- Freeze: `?focus=1&break=0.5&streak=4&missed=1`, finish a round (Saved by the Freeze).
- Freeze edge cases on the Progress screen: `?active=5,4,3,2` on a Tuesday is a missed Monday held up by the freeze. Pin the date with Playwright's `page.clock.setFixedTime` to pick the weekday.
- Comeback and Phoenix: `?focus=1&break=0.5&streak=30&missed=3`, finish a round.
- Every medal tier's animation and sound: `?unlock=all`.

## The self-test panel, inside Root

Room settings has a **Self-test** section that only the developer can see. It runs live checks against the real Root and shows each one as passed, to look at, or failed:

| Check                                   | What it looks at                                                                                               | Old bug it would have caught                       |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Versions match                          | The app, server and networking versions, and the networking code the server actually loaded                    | The stale cached networking package (0.3.0, 0.3.1) |
| Settings arrive in the shapes we expect | The raw shape of every App setting, compared with what the fake Root host sends                                | Number settings as `{ value: n }` (0.3.6)          |
| Database                                | Migration level, and a test row written, read back and deleted                                                 |                                                    |
| Push to your screen only                | A ping to your device alone, which your app confirms. Also says whether `clients.getClient` still finds no one | Personal pushes that never arrived (PR #51)        |
| Job scheduler                           | A one-time job 30 seconds out. It reports what type `jobTime` arrived as                                       | `jobTime` as a number (PR #98)                     |
| Channels                                | Text and voice channels it can see, the bot channel, and an optional test post                                 |                                                    |
| Members and presence                    | Who has the app open, and whether you count as an admin                                                        |                                                    |
| What your app sees of Root              | Your user id from both sides, the theme, and the profile fields                                                |                                                    |

The job check takes up to two minutes, because Root looks for due jobs about once a minute. The panel keeps updating until it's done. **Copy report** copies everything, including the raw shapes, as JSON. Paste it into a chat or an issue, and the fake Root host can be updated to match.

Nothing it does touches members' data. The test row and the test job are its own, and the test post only goes out when you tick the box.

**Who can open it.** Only a user in `SELF_TEST_USER_IDS`, in any community. The server checks it on every call, using the user id Root attaches to the connection, so hiding the section isn't the only protection and a member can't fake the id. If the list is empty, nobody can open it. Runs are at least a minute apart. The ids are baked in at build time (`server/dist/build-info.json`), like the feedback relay settings:

1. In GitHub, add the Actions secret `SELF_TEST_USER_IDS` with your Root user id (separate several with commas). For Docker builds, add it to `server/.env`.
2. Ship the next version. The Self-test section appears in Room settings, for you only. The app never shows ids.

## Developer chat commands

The developer (a user in `SELF_TEST_USER_IDS`) can type commands in any channel Study Squad can see. Everyone else's messages are ignored, with no reply. `!help` lists them.

- `!smoke` runs the self-test from chat and posts a summary, then a second one when the job check finishes.
- `!preview badge <id>`, `!preview levelup`, `!preview break`, `!preview highfive`, `!preview keepgoing`, `!preview celebrate` play that screen on your own open app only. Nothing is saved, and the next real update replaces it. These work without test mode.

The rest change real data, so they also need **Developer test mode** turned on in that community's Study Squad app settings. Leave it off everywhere except a test community. The server checks it on every command.

- `!test round`: a real 1-minute solo and 1-minute break, with real XP.
- `!xp <who> <n>`, `!level <who> <n>`, `!streak <who> <n>`, `!badge <who> <id>`, `!end <who>`. `<who>` is `me` or an @mention.
- `!boss hp <n>`, `!boss defeat`, `!boss new`.
- `!room skip` ends the room's current phase now. `!room stop` stops the room timer.
- `!clock +30m`, `+1h`, `+1d`, `+1w` jump the game clock forward (up to 4 weeks at a time) and settle everything now due, like streaks, quests and recaps. It can't go back: the offset is saved and stays that way. `!clock` on its own shows how far ahead it is.
- `!recap` posts the recap now. `!botline` posts a squad bot line.

Messages are only read to spot a command. Nothing is stored or logged.

## Before each release: staging check

Merging into `main` only uploads the package to Root. Nothing reaches communities until you press prerelease or release in the Root portal. So between the two:

1. Wait for the main CI run to pass. That includes the package smoke check, the demo e2e tests and the full-stack e2e tests.
2. In the Root portal, prerelease the new version to the staging community.
3. Open Study Squad there. Close and reopen it once, so you know you're on the new version.
4. Room settings → Self-test → tick "Also send a test post", then **Run self-test**. Wait for "all 8 passed". If anything says "to look at" or failed, press **Copy report** and share it before you release.
5. Two-minute look by hand: join the room timer with a goal, tick it off, open Your progress and the leaderboard, and switch Root between light and dark.
6. If you can, open it on a phone too, as a second member, and check that you each see the other's card.
7. All good: release it in the portal and paste the release notes.

If something fails, don't release. Fix it, bump the version, and ship again: Root never takes the same version twice.

## In a Root test community

- **Boss base HP** goes down to 100 XP. This week's boss is 0.5x to 2x that, so a 25 minute solo timer or two defeats it. Set it back before the community uses the app for real.
- Changing **Boss base HP** re-sizes this week's boss at once. Damage is never healed, and dropping HP below the damage dealt defeats the boss immediately.
- **Time zone** decides which day a session counts for. Switching from Pacific/Honolulu to Pacific/Auckland moves "today" one day ahead, which tests streaks without waiting. Switching back is ignored, so nothing is lost.
- The shortest room timer is Custom 15 / 3, a 78 minute cycle.

## What's automated

`npm run test:e2e` runs `client/e2e/game.spec.ts` against the demo build with a fake clock, so cycles and days pass in seconds. It covers:

- XP: focus XP times the combo, goal XP, and landing on a total ending in 777
- Badges: Study Group, Speedrun, Marathon, Full Cycle, Unstoppable, Jackpot, the boss badges, the streak badges, and one unlock animation per tier in order
- "Keep going?": hidden during focus, shown in the long break, a tap carries you into the next cycle, no tap releases you with your XP, and solo timers never ask
- The boss: strength and HP for built-in names, a defeat with loot and badges, and The Final Final Exam
- Streaks: extending across a real day change, the freeze, and a broken streak with Comeback and Phoenix

The first run needs a browser: `cd client && npx playwright install --only-shell chromium`. It is saved in Playwright's cache folder, so later runs reuse it. In CI the browser is cached between runs and only downloaded again when `@playwright/test` is bumped.

To run the tests in Docker (for example on a Mac), use Playwright's own image, which already has the browser, so nothing is downloaded:

```sh
docker run --rm -it --platform linux/amd64 --ipc=host -v "$PWD":/app -w /app mcr.microsoft.com/playwright:v1.63.0-noble \
  bash -c "set -e; npm ci; npm run generate; npm run test:e2e"
```

Keep the image tag in step with the `@playwright/test` version in `client/package.json`. Afterwards, rerun `npm ci && npm run generate` natively before testing on the Mac, since the container installs Linux packages.

### Full stack, on the fake Root host

`npm run test:e2e:root` runs `client/e2e-root/` against the real server, the real SQLite database, the generated networking code and the real `RootGateway`. Only Root itself is faked: `fake-root/` stands in for both halves of the Root SDK and relays protobuf bytes between them over a WebSocket, the way Root's servers do. Each test opens members in their own browsers, so it covers what the demo can't:

- Two members see each other join live, and the combo rises for both
- App settings saved in Root apply live, in the shapes Root sends them (numbers as `{ value: n }`)
- When a round ends, each member gets their own result (fails if the server uses `clients.getClient`)
- The daily recap posts when Root runs its job, the job finishes, and tomorrow's is booked (fails if `jobTime` is treated as a Date)
- Closing the app takes a member out of the room count

Each of those was checked by putting the old bug back and watching the test fail.

To poke at it by hand, run `npm run build && npm run build:fakeroot -w @studyroom/client`, then `node scripts/fake-root-host.mjs`, and open `http://127.0.0.1:4174/?user=u-ana` and `?user=u-ben` in two windows. The members are u-owner (community owner), u-ana, u-ben, u-cy, u-dee, u-eli and u-fay. Test controls live under `/__fake/`: `GET state`, `GET posts`, `POST settings`, `POST clock/advance` (`{ "ms": 60000 }`), `POST jobs/run`, and `POST voice/join` or `voice/leave`.

What the fake can't tell us is whether Root really behaves the way it copies. The self-test panel inside Root (below) checks that against the real thing.

### The package Root runs

`npm run smoke:package` checks `rootapp.pkg` the way Root will see it, before upload. CI builds a package and runs it on every push, and the deploy job runs it again just before uploading. It fails when:

- the package's version isn't the one in `root-manifest.json`, or the client bundle is missing
- any copy of the generated networking code in the package doesn't carry the version of the current `.proto` files (the stale copy that crashed 0.3.0 and 0.3.1)
- the packaged server, using only the package's own files, doesn't start, doesn't answer the read-only requests in protobuf, or doesn't start again on the same database

The server runs against a fake Root host in `fake-root/`, which copies the ways the real SDK has surprised us: number settings arrive as `{ value: n }`, job times arrive as numbers, a job whose handler throws fires again, and `clients.getClient` finds no one. The package leaves out `sqlite3` because Root's host supplies it, so the repo's copy stands in.

To run it on a Mac, add it to the end of the Docker build:

```sh
rm -f rootapp.pkg && rm -rf networking/gen && docker run --rm -it --platform linux/amd64 -v "$PWD":/app -w /app node:22 \
  bash -c "set -e; npm ci; npm run generate; npm run build; npx rootsdk build package --output-file ./rootapp.pkg --project-folder .; npm run smoke:package"
```

Still manual, in a Root test community:

- Sound: that each tier's fanfare plays and that mute silences it (browsers in tests have no speakers)
- How the unlock animations look on a real phone and desktop
- Anything Root does: settings changes reaching the server, channel posts, the daily recap, phones with the screen locked
- More than one real person on real Root accounts. The fake Root host covers joining, the combo and personal results with several members, but not leaderboard badges or "Keep going?" taps from several people
- Data surviving a server restart

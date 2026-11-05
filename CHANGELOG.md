# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org).

## [Unreleased]

### Fixed

- On phones the header shows only the logo, so the round pill no longer covers the "Study Squad" title. On very small phones the round pill moves below the buttons so the settings button isn't cut off.

## [0.3.8] - 2026-11-05

Fewer settings to think about: built-in boss names, no XP cap and a simpler squad bot. Voice stays, with a new channel dropdown.

### Added

- Support contacts: Room settings and the feedback box now show how to reach the developer (hello@samuelburke.dev, or @5amuel on Root), and the website has a new support page.
- Light mode. Study Squad now matches the light or dark theme picked in Root, and switches live when it changes. Outside Root (the demo) it follows the device setting. The full-screen badge unlock keeps its dark spotlight in both themes.
- Goals: a "Clear completed" button removes every finished goal at once. XP, stats and badges already earned stay.
- Goals: edit a goal's text with the pencil button. Enter saves, Escape cancels.
- Goals: finished goals fold into a "Finished (n)" row and show how long they took, from adding to ticking off.
- Goals: drag a goal by its handle to reorder (or use the arrow keys on the handle). The top goal is the one on your card.
- Admins can pick the voice channel from a dropdown in the app's Room settings. It lists the community's voice channels only (Root's own channel picker shows text channels), saves the pick in the app's database so it survives reloads, and applies it straight away. The "Voice channel name" App setting still works as a fallback when nothing is picked.

### Fixed

- The daily recap now posts on Root. Root hands the scheduled job its time as a number rather than a date, and the recap job failed on it every time.
- After the weekly boss is defeated, the break screen no longer shows boss damage for later sessions. The session that lands the final blow says so.

### Removed

- **Daily XP cap.** Members now keep every XP they earn. The Keep going? check at the end of each cycle already stops a forgotten timer from farming XP all day.
- **Boss name.** Every community gets the week's built-in boss, so strengths and the boss badges always line up. A boss saved under an old custom name is swapped for the week's built-in one on the next settings change, or on Monday.
- **Squad bot personalities.** The Squad bot setting is now a plain on/off, and the bot mixes lines from every personality.

## [0.3.7] - 2026-11-04

The number settings from 0.3.6 now take effect.

### Fixed

- Custom focus minutes, custom break minutes, busy room threshold, daily XP cap and boss base HP now take effect. Root sends number settings as `{ value: n }`, and 0.3.6 ignored that shape, so it fell back to the defaults.

## [0.3.6] - 2026-11-04

A Bot @mentions setting, countdown chirps that stay on the clock, easier voice channel setup, and number fields for numeric settings.

### Added

- **Bot @mentions** setting for admins, next to Bot messages channel. It's off by default, so the Squad bot writes people's names as plain text instead of pinging them. Turn it on to bring the pings back.

### Changed

- Custom focus minutes, custom break minutes, busy room threshold, daily XP cap and boss base HP are now number fields in Root's App settings instead of pickers, so admins can type any whole number in range (focus 5 to 120, break 1 to 30, busy 2 to 100 people, XP cap 50 to 2,000, boss HP 100 to 1,000,000 in steps of 100). The server rounds and clamps whatever it gets, and still reads values saved from the old pickers.
- The privacy policy now says feedback notes are also copied to the developer's private Slack, so they're noticed. The feedback relay posts each note there with a link to its issue.
- The Voice channel name setting now matches more loosely: case, spaces, dashes, emoji and punctuation don't matter, and a unique partial name works too. Room settings in the app shows whether the channel was found and why not. Channel groups the app can't read are skipped instead of breaking the lookup, and the headphones icon keeps working when Root won't make a join link.
- The early countdown chirp now comes at 1 minute left instead of 10 seconds. The last-five-seconds chirps stay the same.

### Fixed

- Countdown chirps no longer drift away from the on-screen clock. They now read the same server clock and end time as the countdown, checking it every second, instead of trusting one long timer that browsers delay in the background and that stops while a device sleeps. A chirp the device missed is skipped rather than played late.

## [0.3.5] - 2026-11-04

Send feedback now reaches the developer, and the privacy policy has its own website.

### Added

- **Send feedback** now works. Under Room settings, members write a note (up to 1,000 characters) and it goes straight to the Study Squad developer, anonymously: only the text and when it was sent, with no name, user or community attached. It arrives as an issue in the developer's private GitHub repo, through a small relay on Vercel (`feedback-relay/`) that keeps the GitHub token out of the app. A note that fails to send waits in the community's app storage and is retried; once sent, its text is deleted. Each member can send 3 an hour. Builds without a feedback destination keep the "Coming soon" box.
- A Study Squad website with a styled copy of the privacy policy, published to GitHub Pages from `PRIVACY.md`. See `docs/WEBSITE.md`.

### Changed

- The privacy policy now lists an email contact, hello@samuelburke.dev, for questions and deletion requests.
- The privacy policy now covers feedback notes.

## [0.3.4] - 2026-11-01

Badge details right where you tap, a Replay button, the bot channel setting up top, and new movie lines for the squad bot.

### Added

- Eight movie-reference lines for the squad bot, like "I'll be back. Right after this round." and "May the focus be with you."
- Squad bot timer posts now start with a heading that says whether it's focus or a break: "📚 Focus · Round 2 of 4", "☕ Break" or "🛋️ Long break".
- A **Replay** button on earned badges in Your progress, in the top right corner of the badge details. It plays that badge's full-screen unlock moment and sound again.

### Changed

- The setting that picks the text channel for bot messages is now called **Bot messages channel** and sits at the top of App settings (Timer and room), instead of "Post updates in" halfway down the list. Your current channel stays picked. Room settings in the app shows it too.
- Tapping a badge in Your progress now shows its details in the row right below it, instead of at the bottom of its category.
- The header now shows the full Study Squad logo.
- Movie lines are no longer rare: each one is as likely as any personality line. Joins and badges get their own movie lines too, like "Hello there!", "The game is afoot!" and "The Force is strong with this one." Sherlock Holmes lines too, like "Elementary, my dear squad."
- Removed sorcery and spooky wording. The squad bot no longer says "The prophecy is being fulfilled" or that textbooks were "summoned". Renamed bosses: Grand Wizard of Excuses is now The Excuse Generator, The Group Project Ghost is The Group Project Freeloader, The Word Count Wraith is The Word Count Wall, The Messy Desk Monster is The Messy Desk Mountain, The Auto-Correct Imp is The Auto-Correct Gremlin, and The Phantom Assignment is The Surprise Assignment.

### Fixed

- Your progress no longer jumps while it loads: the stats and the leaderboard now appear together.

## [0.3.3] - 2026-11-01

Fairer secret badges, a Custom solo timer, and the first release shipped to Root automatically.

### Added

- A **Send feedback** box under Room settings, marked "Coming soon". It can't be filled in or sent yet.
- Continuous deployment: a push to `main` that passes CI uploads a new version to Root by itself, once a `ROOT_AUTH_TOKEN` secret is set. See docs/DEPLOYING.md.
- A **Custom** solo timer length: type any whole number of minutes from 5 to 180. Before this, Deep Thought (42 minutes) and Ultramarathon (3 hours) couldn't be earned, because neither length was on the list.

### Changed

- The Friday the 13th secret badge is now **Luck of the Irish**: finish a session on St. Patrick's Day, March 17.
- Jackpot now unlocks on any total XP ending in 777 (777, 1,777, 2,777 and so on), so missing 777 no longer means missing it for good.

### Fixed

- Squad bot posts now @mention everyone they name. Members whose Root id contains an underscore (most of them) used to show up as plain text.

## [0.3.2] - 2026-10-31

### Fixed

- 0.3.1 still crashed on start in Root with the same `LeaderboardMetric` error, although its package was correct. The generated `@studyroom/gen-*` packages always carried the same version in `package-lock.json`, so Root could keep serving an old copy. Their version now comes from a hash of the `.proto` files, `npm run generate` keeps `package-lock.json` in step, and `npm run verify` fails if it is out of date.

## [0.3.1] - 2026-10-31

### Fixed

- The server crashed on start in Root ("Cannot read properties of undefined (reading 'MINUTES')") when a package was built on top of old generated networking code. `npm run generate` now clears `networking/gen` first, so every build uses fresh code.

## [0.3.0] - 2026-10-30

A chattier, more alive room: the Squad bot, live stats and boss damage, a bigger leaderboard, your own avatar and countdown chirps.

### Added

- Squad bot: Study Squad now chats in the updates channel like part of the study group. It posts when the room timer starts, at each break, when study resumes, when the four rounds are done, when someone joins, and when someone unlocks a badge (secret badges stay a surprise), and it mentions the people studying. It has six personalities (Hype Squad, Drill Sergeant, Chill Friend, Meme Lord, Gamer Mode and Chaos Mode), never repeats itself back to back, and now and then drops a rare surprise line. Admins can turn it off with **Squad bot** and choose its voices with **Squad bot personalities**. Study Squad now asks Root for permission to mention members.
- Each card on the "Focusing now" board shows the member's place on this week's leaderboard (#1, #2…). Members with no minutes yet, or who hid themselves from the leaderboard, show no rank.
- The leaderboard can rank by focus minutes or by XP (focus, goals and quest rewards), and covers this week, this month, this year or all time. Pick with the **Week | Month | Year | All time** and **Minutes | XP** switches above the standings. The rank on each card stays weekly.
- Countdown chirps: one chirp at 10 seconds left, then one each second for the last 5, before each focus block and break ends. Mute silences them.

### Changed

- A new day now starts at 4am in the community's time zone instead of midnight, so a late-night session counts toward the day it began. This moves streaks, the daily XP cap, daily stats and when finished goals leave your list. Weeks start at 4am on Monday, so weekly quests, the weekly boss and the leaderboard reset then too. The daily recap still posts at its set clock time.
- The weekly boss takes damage live: every minute someone focuses, their XP hits the boss right away instead of when the session ends. The room's combo bonus still lands when the round ends.
- All XP now counts as boss damage: finishing goals (up to the daily cap) and weekly quest rewards hit the boss too, not just focus.
- Focus minutes and XP are credited every minute while you focus, not only when the session ends. Your XP bar, level, quests, the leaderboard and the rank on each card all move live, and the progress screen refreshes itself while it's open. The combo bonus still lands when the round ends, and totals are exactly what they were before.
- **Admins:** the voice channel is now set by typing its name in **Voice channel name** (Root's channel picker only lists text channels). Check it after updating.
- Your own avatar now shows your Root profile picture on the board, in the break moment and on your profile, instead of a "YOU" bubble, and the Focusing now board shows your Root name instead of "You". Members without a picture still see "YOU".

### Fixed

- The study-start chime now plays on Safari and iOS
- In Root, nothing pushed to just you ever arrived: the break screen after a timer, badge unlocks from a finished timer, and status updates on your other devices. The server now finds your connection reliably.
- Badges earned when a timer finishes also ride on the break result, so their unlock plays even if another push is late.

## [0.2.1] - 2026-10-29

Study together out loud: voice channel support, plus more reliable badge unlocks.

### Added

- Voice channel support: admins pick a voice channel in the new **Voice channel** setting. The room then shows a Join voice button with how many people are in there, and headphones next to anyone in the channel. The talking itself happens in Root's own voice channel.

### Fixed

- A badge you earned could arrive without its unlock moment. Each new badge now plays its unlock once, however the app hears about it.
- The demo starts you with no badges, so your first ones unlock live

## [0.2.0] - 2026-10-29

Weekly goals and rewards: quests, a leaderboard, badges, named bosses, member profiles and sounds.

### Added

- Tap anyone on the board or the weekly leaderboard to see their profile: level, XP, streak and the badges they've earned. Goals and focus history stay private, and someone else's secret badges don't say how they were found.
- Sound cues when a focus block or break starts and ends, with a mute button that is remembered on your device
- Sounds for a round celebration, a boss defeat and a level-up. They wait their turn instead of playing over each other, and the mute button silences them too.
- The weekly boss gets a new random funny name each week from a built-in list when the "Boss name" setting is blank (now the default). A name set by an admin still wins.
- Each boss has a strength from 0.5x to 2x that fits its name (a final exam is tougher than a pop quiz), and the list averages 1x. Its HP and its loot both scale with strength. This turns on the Giant Slayer and Survived Finals badges.
- Weekly leaderboard on the progress screen, ranked by focus minutes and reset every Monday in the community time zone. Members can hide themselves, which also keeps them out of recap rankings.
- The daily recap lists the week's top 3 by focus minutes (admin setting **Leaderboard in recap**, on by default)
- Weekly quests on the progress screen: three rotating quests each week that reset on Monday and pay a small XP bonus, plus the three quest badges
- "Keep going?" at the end of each room cycle (#6): during the final long break, tap to roll straight into the next cycle instead of rejoining. If you don't tap, the cycle ends your session as before, and you keep everything you earned.
- Badges (#9): 60+ permanent badges for streaks, levels, focus time, room rounds and combos, goals and the weekly boss, including the Early Bird, Night Owl, Marathon, Comeback and First Boss badges from the progress mockup
- Secret badges: Easter eggs for odd hours, special dates, exact numbers and rare situations, shown as "?" until someone finds them
- Earned badges show on member cards (one per card: your newest, or the one you pick), with a full-screen unlock animation and fanfare that get more epic with each tier
- Card styles: borders and colours unlocked by level (gold at level 8) or by certain badges, picked on the progress screen or left on automatic
- Testing aids: a "100 XP (for testing)" Boss base HP option, and demo URL settings that set the boss, streak, XP and daily cap or replay any badge unlock animation. See [docs/TESTING.md](docs/TESTING.md).

### Changed

- **Admins:** the "Boss HP (focus hours)" setting is gone. Check the new "Boss base HP (XP)" setting (default 10,000) after updating.
- Boss HP and damage are measured in XP instead of focus minutes. Every XP earned focusing (combo included, before the daily cap) is damage. The "Boss HP (focus hours)" setting is replaced by "Boss base HP (XP)", default 10,000. Bosses already in the database convert at 2 XP per minute.
- Boss loot is 100 XP times the boss's strength (50 to 200 XP), up from a flat 50.
- Rewrote the privacy policy in a friendlier, plainer tone, and added weekly quests, the weekly leaderboard (with its opt-out), "Keep going?" taps and the on-device sound mute. It also lists the profile details (level, XP, streak, badges) that other members can see.

### Fixed

- Tapping "Nice!" on a badge unlock skipped the next unlock when several arrived together
- The boss card showed 1.25x strength as "1.3×"
- The room timer retries a wake-up that failed (for example on a locked database) instead of stalling until someone acts
- A failed presence update when a member opens or closes the app is logged instead of crashing the server
- The app still starts when Root's job scheduler is unavailable; only the daily recap is skipped
- Shutdown always closes the database
- The client shows a message with a retry instead of a blank screen if it fails to load or hits a rendering bug

## [0.1.0] - 2026-10-28

First release of **Study Squad: Group Study Timer**, covering the v1 scope.

### Added

- Shared room timer (25/5, 50/10 or custom) with rounds of 4 and a long break, derived from server time so every screen shows the same countdown
- Solo timers that show on the board
- Live focus board with private goals
- Goals with check-off
- XP and levels with a daily cap, combo multiplier, weekly boss with loot
- Streaks with one freeze per week
- Break moment and a room-wide celebration when a round ends
- Progress screen with a five-week heatmap
- Daily recap, busy-room, milestone and boss-defeated posts in a Root channel
- Admin settings through Root's Global Settings
- Demo mode that runs the real engine in the browser
- **Delete my data** on the progress screen: members can erase everything Study Squad stores about them
- Privacy policy (`PRIVACY.md`)
- CI with lint, typecheck, unit, integration and end-to-end tests; CodeQL; dependency review; Dependabot

### Security

- Override `sqlite3` to `^6.0.1` (the Root SDK asks for 5.x) to drop `node-gyp` and `tar@6`, which had high and critical advisories

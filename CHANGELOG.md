# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org).

## [Unreleased]

### Added

- A **Custom** solo timer length: type any whole number of minutes from 5 to 180. Before this, Deep Thought (42 minutes) and Ultramarathon (3 hours) couldn't be earned, because neither length was on the list.

### Changed

- The Friday the 13th secret badge is now **Luck of the Irish**: finish a session on St. Patrick's Day, March 17.
- Jackpot now unlocks on any total XP ending in 777 (777, 1,777, 2,777 and so on), so missing 777 no longer means missing it for good.

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

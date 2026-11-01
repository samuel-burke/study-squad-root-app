# Design decisions

This file records the "why" behind Study Squad's rules and structure. Numbers live in code in `core/src/constants.ts`; if they change, update this file in the same pull request.

## The server owns the timer

The room timer is stored as one row: when the current cycle started and which preset it uses. A cycle is laid out deterministically (`core/src/timer/roomCycle.ts`): focus, break, focus, break, focus, break, focus, long break. Any phase at any instant is a pure function of those two values, so:

- every client computes the same countdown from server timestamps, and a late or dropped push never makes them drift;
- clients estimate their clock offset from request round trips (`ClockSync`, keeping the lowest-latency sample), so a phone with a wrong clock still shows the right time;
- after a restart the server settles every phase that ended while it was down, then carries on.

Admins can change the preset at any time. The change applies from the next cycle, so nobody's running round changes length underneath them.

## One engine, behind ports

`StudyRoomEngine` (in `core`) contains every use case. It depends only on interfaces: `Store`, `Clock`, `WakeScheduler`, `Notifier`, `Announcer`, `Logger`. The server plugs in SQLite and Root's broadcast and channel APIs; the browser demo plugs in an in-memory store and local events. This is why the rules are tested without Root, and why the demo behaves exactly like production.

Every engine operation goes through a serial queue and one store transaction. It first settles whatever came due, then does its work, then pushes notifications only after the transaction commits. A failed operation leaves no partial state and notifies nobody.

Importing `@rootsdk/server-app` exits the process when `COMMUNITY_ID` is missing, so only `server/src/main.ts` and `server/src/studyRoomService.ts` import it. Everything else on the server takes interfaces and is unit tested.

## Shared timer first, solo timers welcome

The room timer is the default and the brighter button because joining it is what makes the room feel like a group and what feeds the combo. Solo timers (5 to 180 minutes) still appear on the board so nobody is left out. You can be on one or the other, not both.

## Rewards

| Rule              | Value                                                             | Why                                                                      |
| ----------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Focus XP          | 2 XP per whole minute × combo                                     | Rewards time, not task count                                             |
| Goal XP           | +25 once per goal                                                 | Unchecking and rechecking can't farm it                                  |
| Daily cap         | 300 XP (admin setting)                                            | Nobody should feel pushed to study 12 hours                              |
| Level curve       | Level _n_ needs 150 + 50·_n_ XP (level 7 needs 500)               | Matches the mockups; early levels come fast                              |
| Combo             | 1.0x + 0.1x per extra person who **finishes** the round, max 2.0x | Rewards focusing together                                                |
| Finishing a round | At least 5 minutes in that round (or half the round, if shorter)  | Joining in the last seconds doesn't count toward the combo or the streak |
| Leaving early     | Minutes so far are credited, round not finished                   | Honest time still counts                                                 |
| Boss loot         | +100 XP × boss strength to every contributor, outside the cap     | Happens once a week; a capped reward would often be zero                 |
| Weekly quests     | +30 to +40 XP per quest, once per week, outside the cap           | At most three a week; a capped reward would often be zero                |

The live combo on screen counts everyone on the room timer, as a preview. The combo actually paid out counts finishers.

Focus is credited **live**. While anyone is focusing, the engine wakes every minute and credits each whole minute of a running block: the minutes go into `daily_stats`, and the base XP (2 per minute, under the daily cap) goes to the member's total and `daily_stats`. That's what makes the XP bar, level, minute-based quests, the leaderboard and the rank chips move during a session. Each room participant and solo timer remembers what it has already credited (`liveMinutes`, `liveXp`), so the end of a block (round end, leaving early, stopping a solo) adds only the rest, including the combo bonus, and a block's totals and session log are exactly what they'd be without live crediting. The counters are stored, so a server restart mid-block doesn't credit anything twice. Each minute pushes the room and the member's status, and the progress screen reloads on each room push while it's open.

## Anti-AFK guardrails

The room timer never interrupts a focus round and never takes back anything earned. The only check is at the end of a cycle:

- **"Keep going?"** During the cycle's final long break, everyone who focused that cycle is asked "Keep going?" and has the whole break (15 minutes on 25/5) to tap. Tapping rolls them straight into the next cycle, so a multi-hour session never has to rejoin. Anyone who doesn't tap is released when the cycle ends (about every two hours with 25/5), keeping all their XP, combo and streak credit, and can rejoin at any time. A forgotten timer therefore stops after one cycle, and missing the tap costs nothing.
  - This replaced a random mid-round "Still there?" check. That one interrupted focus, and couldn't reach people with their screen off, so it ended up penalising people who were genuinely studying. The app has no way to send a phone notification, so the generous window matters.
  - Solo timers need no check: they end on their own (at most three hours).
- people who joined during the final long break haven't focused yet, so they roll into a fresh cycle instead of being dropped;
- the daily XP cap bounds what any idle timer can earn.

## Days start at 4am

A new day starts at 4am in the community's time zone, not midnight (`DAY_START_HOUR` in `core/src/time/calendar.ts`). A session at 1am still counts toward the day before, so late-night studiers keep their streak day, daily XP cap, finished goals and stats together. Weeks start at 4am on Monday, which also moves weekly quests, the weekly boss and the leaderboard. Clock-time features keep the real clock: the daily recap's post time, and badges such as Burning the Midnight Oil.

## Streaks without guilt

- A day counts after one finished session (a finished room round or a completed solo timer), in the community's time zone.
- Each week (Monday to Sunday) has one free freeze that covers one missed day. A gap of several days survives only if each missed day falls in a different week with an unused freeze.
- The streak shown is "as of today": yesterday's streak is still alive, and a gap a freeze could still cover isn't shown as zero.
- There are no public "you lost your streak" messages. Only milestones (7, 30, 50, 100, 200, 365 days) are posted.

## Private goals

Members choose whether their goals show on the board. Private members appear as "Focusing" with a lock. The server never sends private goal text to other clients: room state is built with the text already removed, and personal data (XP, goals, results) is sent only to the member's own devices.

Data is kept for as long as the app is installed, so streaks and history survive. Members can erase all of it themselves with **Delete my data** on the progress screen (`StudyRoomEngine.deleteMyData` and `Store.eraseUser`). Self-service deletion is simpler and more reliable than handling requests by email, because Root hosts the database and there's no admin console to delete from. See [PRIVACY.md](PRIVACY.md).

## Weekly boss

A boss spawns lazily each Monday (community time zone) with the admin's name (or the week's built-in name) and HP in XP. Each boss has a strength from 0.5x to 2x that fits its name, so "The Final Final Exam" is tougher than "Professor Pop Quiz". The built-in list averages exactly 1x, with weaker bosses below and stronger ones above. Its HP (the XP it takes to defeat) is the admin's base HP times its strength, and so is its loot. Names an admin types get strength from keywords: finals, thesis and boards are 2x; midterms, exams, deadlines and projects 1.5x; quizzes and homework 0.75x; anything else 1x.

All XP counts as damage except boss loot:

- **Focus** hits the boss live. While anyone is focusing the engine wakes every minute, and each whole minute of a running block deals its base XP (2 per minute). The combo bonus lands when the round ends, because the combo depends on who finishes. Each room participant and solo timer remembers what it has already dealt (`bossXpDealt`), so the end of a round, leaving early or stopping a solo only deals the rest, and the total always equals the block's focus XP. Focus damage is counted **before** the daily cap: the cap limits what a member earns, not how much they help the room. It's dealt even with XP turned off; there's just no loot then.
- **Goals** deal the XP they actually pay, **after** the daily cap. Goals are cheap to add and check off, so without the cap one person could farm the boss down alone.
- **Quest rewards** deal their XP. They're outside the cap already and come at most three times a week.

Admins can rename or resize the live boss; damage is never healed, and lowering HP below the damage dealt defeats it on the spot (with the usual post and loot).

## Leaderboard

- Ranked by focus **minutes** by default, so it can't be gamed with tiny tasks. It sums `daily_stats` for the current week; there's no separate counter to drift.
- Members can switch the board to **XP**: `daily_stats` XP for the period (focus and goals, already under the daily cap) plus the `quest_rewards` paid in it (by `rewarded_at`, so a reward lands in the month or year it was earned). Boss loot isn't counted, because everyone who helped gets the same loot. Every entry carries both totals; only the ranking changes. Rank chips on cards, the recap's top 3 and the leaderboard badges stay minute-based, so the XP view is a second way to look, not a second competition.
- The week is the boss's week: Monday to Sunday in the community time zone. A new week starts empty.
- Minutes are rounded down to whole minutes before ranking, and equal minutes share a rank (1, 2, 2, 4), so two people shown with the same time never get different places.
- Members can also switch the period to **this month**, **this year** or **all time** (calendar month and year in the community time zone). Every period runs the same queries over a different day range, so there are no extra totals to keep in sync; all time is just a range starting at `0000-01-01`. Each period starts over at its own boundary (all time never does). Opt-outs apply to every period. The weekly view stays the default, and the card rank chips, badges and recap remain weekly, since a weekly race gives newcomers a fresh chance every Monday.
- The board lists the top 10. You always see your own rank and minutes, even below the top 10.
- Every card on the room's "Focusing now" board shows that member's rank (#1, #2…), including ranks below the top 10, so the room can see who's leading without opening the progress screen. Members with no minutes this week, or who hid themselves, show no rank. The rank is computed with the room state, so it updates whenever the board does.
- Members can hide themselves. Hidden members are left out of the board, get no rank on their room card, and are left out of every ranking in posts (the recap's top focusers and top streaks). Their minutes still count for the boss and community totals. The opt-out lives in its own table so it's erased with the rest of a member's data.
- The daily recap lists the week's top 3 when the admin setting **Leaderboard in recap** is on (default).
- The Podium and Pole Position badges use the rank at the end of each focus block. A place only counts once at least 3 members are ranked that week, so the first person to focus on a Monday doesn't win by default.

## Weekly quests

Each week (Monday to Sunday, community time zone) shows three quests from a pool of seven (`core/src/game/quests.ts`), such as "Finish 5 goals", "Finish 3 room rounds" and "Focus on a weekend day". Week _n_ takes three neighbouring quests from the pool, so the set is the same for everyone, consecutive weeks never share a quest, and every quest comes around within three weeks.

- Quests are sized so a new member can finish them in an ordinary week.
- Progress is read from `session_log` and `daily_stats`, so there are no extra counters to keep in sync. The only new table, `quest_rewards`, records which rewards were paid so each is paid once.
- "Focus" quests count finished sessions, the same rule as streak days, so a few seconds on a timer doesn't count.
- A reward is paid the moment a quest is finished. When XP is off, quests still show progress but pay nothing, and turning XP back on doesn't pay out quests already finished that week.
- Finished quests feed the quest badges (first quest, a full week's sweep, 25 quests), counted from `quest_rewards`.

## Badges and card styles

Badges are permanent and come in two kinds: visible ones that say how to earn them, and secret ones (Easter eggs) that show as "?" until someone finds them. The catalog is `BADGES` in `core/src/game/badges.ts`. Each badge is a pure check over facts the engine gathers when something happens: a focus block ends, a goal is checked off for the first time, or a boss falls. That keeps the rules unit-tested without a store, and makes adding a badge one entry in a list.

- **Nothing new is tracked for badges.** Progress comes from what's already stored (daily stats, the session log, boss contributors); only the earned badges and the card look are new tables. Lifetime badges (hours focused, goals, rounds) therefore also reach members who earned them before badges existed, the next time they finish something.
- **Badges never repeat** and keep the time they were first earned. The member's devices get one push per operation listing what it earned, which shows the unlock banner. A member with the app closed misses the banner but still finds the badge on the progress screen.
- **Times of day** (Early Bird before 8am, Night Owl after 10pm, the 3am Three O'Clock Club) use when the session started, in the community time zone, and need a finished session so a timer left running doesn't count.
- **Secret badges are only secret in the UI.** The catalog ships in the client bundle so cards can render badge names offline; anyone reading the code can find them, which is fine for Easter eggs.
- **Badges that need another feature** declare it (`requires`): weekly quests, the weekly leaderboard, and the built-in boss roster with strengths. They stay out of the catalog until that feature adds itself to `LIVE_BADGE_FEATURES` and passes its facts to `awardBadges`. Weekly quests are live, so the three quest badges can be earned.

Card styles (`core/src/game/cosmetics.ts`) change a member's card border and colour on the board. Most unlock with level (Lagoon at 3, Ember at 5, Gold at 8, Aurora at 12, Nebula at 16, Legend at 25), a few with a badge. A member who hasn't picked one gets the best style their level unlocks, so the room notices a level 8 member's gold border without anyone opening a menu. A pick that's no longer unlocked falls back to automatic rather than failing.

Cards show one badge next to the level: the one the member picked, or their newest. An earlier version showed three, but a row of emoji on every card made the board noisy.

Badges are drawn as medals (`client/src/components/BadgeMedal.tsx`), not emoji. Each family has its own silhouette (a shield for streaks, a hexagon for levels, a sunburst for focus, a rosette for goals, a spiked shield for bosses, a crowned crest for the leaderboard and a gem for secrets). Each badge names a line-drawn glyph, a tier and an optional stamp. The tier is the metal (bronze, silver, gold, platinum), and harder tiers get more dressing: a bevel at silver, ribbon tails at gold, and a laurel wreath and a passing shine at platinum. Secret badges are holographic.

Earning a badge opens a full-screen moment (`BadgeUnlocked.tsx`) that grows with the tier: bronze pops in, silver adds light rays, gold spins in with a shockwave and confetti, platinum rises down a beam of light with a double shockwave and twinkling stars, and a secret badge shakes as a mystery gem before it bursts open. Each tier has a matching synthesised fanfare (`lib/badgeSounds.ts`) that follows the sound mute button from #26. The moment closes itself after a few seconds, or with a tap, the button or Escape. The stamp is the number, such as a streak length, and is hidden on small medals.

## Channel posts

- **Busy room**: once when the number of people focusing reaches the threshold, then not again until it drops below and three hours have passed.
- **Daily recap**: at the admin's time, as a one-time Root job rescheduled after each run so it stays correct across daylight saving changes. Quiet days are skipped so the channel never reads "0 hours". A missed job is still posted if it's under two hours late.
- **Milestones and boss defeats**: as they happen.
- **Squad bot**: posts like a friend in the study group when the room timer starts, at each break, when study resumes (including a new cycle for whoever kept going), when the four rounds are done, when someone joins a running room, and when someone unlocks a badge. Each post mentions the people it's for with Root's `[@Name](root://user/id)` markup. Only the first ten are mentioned and the rest are counted, so a big room doesn't flood the channel.
  - The lines live in `core/src/squad/squadLines.ts`, grouped by event and by six personalities (Hype Squad, Drill Sergeant, Chill Friend, Meme Lord, Gamer Mode, Chaos Mode). Adding a personality means adding its name and a block of lines; a test checks every personality covers every event. `squadVoice.ts` picks a random line from the personalities admins enabled in **Squad bot personalities**, never the same line twice in a row for an event. Personalities are a community setting, not a member one, because everyone reads the same channel.
  - About one timer post in 25 is a rare line instead. A rare line that makes a claim ("studying together for 2 hours") is only said when it's true. Joins and badge posts are never rare.
  - Posts come only from the engine's settling of real timer events, in the same transaction, and go out once after it commits. Clients never post, so several devices or reconnects can't duplicate a post, and the timer stays the single source of truth. A switch more than two minutes old (after downtime) is skipped rather than replayed.
  - When someone earns badges, it congratulates them in one post naming them all ("Night Owl and Week Warrior"). Secret badges are called "a secret badge" so the surprise isn't spoiled for everyone else.
  - A member's join is announced at most once every two hours, so popping in and out stays quiet. Solo timers never post: they're private. Admins turn the bot off with **Squad bot**.

Display names come from Root nicknames and are stripped of markup and mention characters before they're posted. The only mentions Study Squad writes are the squad bot's, built from Root user ids.

## Voice uses Root's voice channels

Study Squad doesn't run calls. The SDK gives apps no microphone access, and Root's voice channels already work well. Admins type its name in the **Voice channel name** setting, because Root's channel picker only offers text channels and has no way to ask for voice ones. The server looks through the community's voice channels for that name (ignoring case, extra spaces and a leading #) and asks Root for a link to it (`communityLinks.communityChannelCreate`), and the room shows a Join voice button that opens the link. The server also follows who is in that channel (`channelWebRtcs.list` on start and on settings changes, then the attach and detach events), and the board shows headphones next to them. Someone counts as in voice until their last device leaves (`VoiceRoster`). The voice list is kept in memory only.

## Admin settings use Root's Global Settings

Root already provides a settings UI restricted to people who can manage apps, so Study Squad doesn't build or secure its own. The mockup's admin setup screen maps to two groups in `root-manifest.json`: **Timer and room** and **Game layer**. The server validates and clamps every value (`parseSettings`), and a test checks that the manifest declares exactly the keys the server reads and that its defaults match the server's.

Numeric settings are `select` items, not `number` items: in `@rootsdk/dev-tools` 0.21.3 the dev host maps `number` items to the wrong oneof case. Revisit when the SDK fixes it.

## Where the app differs from the mockups

- **Name**: the mockups say "Study Room"; the app is now called Study Squad. Internal code names (`StudyRoomEngine`, the `StudyRoomService` Protobuf service, `@studyroom/*` packages) keep the old name, because renaming the service would change the wire paths for no user benefit.
- **Admin setup** is Root's App settings screen (see above). The room shows a read-only summary behind the settings button.
- **Weekly quests and badges** came after v1. Quest rewards are smaller than the mockup's (+30 to +40 XP rather than +50 to +100) to keep them a bonus next to focus XP, and "Join 3 room timers" counts finished room rounds.
- **"Chat in #study-hall"** on the break screen is a hint, not a link. The voice channel's Join voice button uses Root's channel links, so the post channel could get one too.
- **Avatars** use Root profile pictures when a member has one, and the design's initials and colors otherwise.
- Fonts (DM Sans, Space Grotesk) are bundled with the client instead of loaded from Google Fonts, to avoid third-party requests from inside Root.

## Known limits

- One room per installed app instance (one Root server process serves one community).
- The Join voice link and the voice events haven't been tried in a live Root community yet. If Root needs a permission to list a voice channel, the button still works but the headphones won't show.
- Not yet run against a live Root community; that needs a developer token. The server compiles against the real SDK types and boots up to Root's environment check.

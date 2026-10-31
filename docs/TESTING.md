# Testing by hand

Most game features take days to reach for real: streaks need calendar days, and a weekly boss takes hours of focus. These shortcuts get you there in minutes. The full step-by-step test plan is a separate document; this page is the reference.

## Demo URL settings

Run `npm run demo` and add these to the printed URL. They only exist in the demo build, so they never reach a Root community. Reloading the page starts over.

| Parameter        | Example                         | What it does                                                                                                                                                                     |
| ---------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `focus`, `break` | `?focus=1&break=0.5`            | Room timer lengths in minutes. A 1 / 0.5 cycle takes 7 minutes. XP counts whole minutes, so `focus` under 1 earns 0 XP.                                                          |
| `bots`           | `bots=0`                        | Leaves out the simulated members.                                                                                                                                                |
| `elapsed`        | `elapsed=10`                    | How far into round 1 the room is when the page opens.                                                                                                                            |
| `bossLeft`       | `bossLeft=2`                    | HP the weekly boss has left, in XP. Any finished round of 1 minute or more then defeats it.                                                                                      |
| `bossName`       | `bossName=The Final Final Exam` | Stands in for the Boss name setting. Built-in names keep their strength; other names get one from keywords.                                                                      |
| `bossHp`         | `bossHp=100`                    | Stands in for the Boss base HP setting.                                                                                                                                          |
| `cap`            | `cap=1000`                      | Stands in for the Daily XP cap setting.                                                                                                                                          |
| `streak`         | `streak=6`                      | Your starting streak. With yesterday active, one finished session makes it 7.                                                                                                    |
| `missed`         | `missed=1`                      | Days missed since you were last active. 1 is covered by the week's freeze; 3 always breaks the streak.                                                                           |
| `xp`             | `xp=2440`                       | Your starting lifetime XP, for level-ups, Jackpot (any total ending in 777) and Over 9000.                                                                                       |
| `unlock`         | `unlock=giant-slayer,blitz`     | Plays those badges' unlock animations, without awarding them, after your first click on the page (browsers only allow sound after a click). `unlock=all` plays one of each tier. |
| `badges`         | `badges=first-session,squad-up` | Starts you holding those badges. Without it you start with none, so your first round and goal earn badges live with their unlock moments.                                        |

Useful combinations:

- Defeat a boss: `?focus=1&break=0.5&bossLeft=2`, join the room timer and finish a round.
- Giant Slayer and Survived Finals: `?focus=1&break=0.5&bossLeft=2&bossName=The%20Final%20Final%20Exam`.
- Streak milestone: `?focus=1&break=0.5&streak=6`, finish a round (On a Roll).
- Freeze: `?focus=1&break=0.5&streak=4&missed=1`, finish a round (Saved by the Freeze).
- Comeback and Phoenix: `?focus=1&break=0.5&streak=30&missed=3`, finish a round.
- Every medal tier's animation and sound: `?unlock=all`.

## In a Root test community

- **Boss base HP** has a "100 XP (for testing)" option. With Boss name `Snack Break Goblin` (0.5x) the boss has 50 HP, so one 25 minute solo timer defeats it. Set it back before the community uses the app for real.
- Changing **Boss name** or **Boss base HP** re-sizes this week's boss at once. Damage is never healed, and dropping HP below the damage dealt defeats the boss immediately.
- **Time zone** decides which day a session counts for. Switching from Pacific/Honolulu to Pacific/Auckland moves "today" one day ahead, which tests streaks without waiting. Switching back is ignored, so nothing is lost.
- The shortest room timer is Custom 15 / 3, a 78 minute cycle.

## What's automated

`npm run test:e2e` runs `client/e2e/game.spec.ts` against the demo build with a fake clock, so cycles and days pass in seconds. It covers:

- XP: focus XP times the combo, goal XP, the daily cap (boss damage keeps counting), and landing on a total ending in 777
- Badges: Study Group, Speedrun, Marathon, Full Cycle, Unstoppable, Jackpot, the boss badges, the streak badges, and one unlock animation per tier in order
- "Keep going?": hidden during focus, shown in the long break, a tap carries you into the next cycle, no tap releases you with your XP, and solo timers never ask
- The boss: strength and HP for custom names, a defeat with loot and badges, and The Final Final Exam
- Streaks: extending across a real day change, the freeze, and a broken streak with Comeback and Phoenix

Still manual, in a Root test community:

- Sound: that each tier's fanfare plays and that mute silences it (browsers in tests have no speakers)
- How the unlock animations look on a real phone and desktop
- Anything Root does: settings changes reaching the server, channel posts, the daily recap, phones with the screen locked
- More than one real person: combo with real accounts, leaderboard badges, "Keep going?" taps from several people
- Data surviving a server restart

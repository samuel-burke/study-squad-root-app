/**
 * Everything the squad bot says, kept apart from the logic that picks it.
 * To add a personality, add it to PERSONALITIES and give it lines for every
 * event; a test checks none are missing. `{round}`, `{hours}` and `{badge}` are filled in
 * when the line is posted.
 */

export type SquadEvent =
  | "sessionStarted"
  | "breakStarted"
  | "studyResumed"
  | "sessionCompleted"
  | "memberJoined"
  | "badgeUnlocked";

export const PERSONALITIES = [
  { id: "hype", name: "Hype Squad" },
  { id: "drill", name: "Drill Sergeant" },
  { id: "chill", name: "Chill Friend" },
  { id: "meme", name: "Meme Lord" },
  { id: "gamer", name: "Gamer Mode" },
  { id: "chaos", name: "Chaos Mode" },
] as const;

export type Personality = (typeof PERSONALITIES)[number]["id"];

export const ALL_PERSONALITIES: readonly Personality[] = PERSONALITIES.map((p) => p.id);

export const SQUAD_LINES: Readonly<
  Record<SquadEvent, Readonly<Record<Personality, readonly string[]>>>
> = {
  sessionStarted: {
    hype: [
      "Alright squad, lock in. The grind starts now. 📚",
      "Squad up. It's time to get things done. 🚀",
      "Let's GO. Best session of the week starts right now. 🔥",
    ],
    drill: [
      "Focus mode: ACTIVATED. Distractions: ELIMINATED. 🎯",
      "No more scrolling. We have goals to achieve. 🔥",
      "Phones down, books open. That's an order. 🫡",
    ],
    chill: [
      "Time to make those brain cells earn their keep. 🧠",
      "Grab a drink, get comfy, let's ease into it. ☕",
      "No pressure, just progress. Let's start. 🌱",
    ],
    meme: [
      "Main character study arc begins NOW. 🧑‍💻",
      "Your future self is watching. Don't disappoint them. 👀",
      "Studying? In this economy? Absolutely. 📚",
    ],
    gamer: [
      "New quest accepted: survive four rounds. ⚔️",
      "Player one has entered the study zone. 🎮",
      "Loading focus.exe... 100%. Game on. 🕹️",
    ],
    chaos: [
      "A wild study session appeared! 🦆",
      "The textbooks have been summoned. There is no escape. 📖",
      "Today's forecast: 100% chance of knowledge. 🌩️",
    ],
  },
  breakStarted: {
    hype: [
      "You survived another round. Take a breather. ☕",
      "You cooked. Now take a break. 😮‍💨",
      "That round was elite. Go recharge. ⚡",
    ],
    drill: [
      "Hydration check! Go drink some water. 🧃",
      "Break time. Stand up. Stretch. Move it, move it. 🏃",
      "You have a few minutes, soldier. Use them wisely. ⏱️",
    ],
    chill: [
      "Brain needs a cooldown. Take five. 🧠",
      "Look at something far away for a bit. Your eyes will thank you. 🌤️",
      "Nice work. Go get a snack, no rush. 🍪",
    ],
    meme: [
      "Touch grass. Stretch. Exist outside your chair. 🏃",
      "Go check your phone guilt-free. For once. 📱",
      "Pens down. You've earned a snack. A small one. Okay, a medium one. 🍕",
    ],
    gamer: [
      "Side quest unlocked: Get a snack. 🎮",
      "Checkpoint reached. Progress saved. 💾",
      "Rest at the campfire. Your HP is regenerating. 🔥",
    ],
    chaos: [
      "Even CPUs need breaks. 🧊",
      "Break time. Go tell a houseplant what you just learned. 🪴",
      "Quick, do a dramatic stretch before anyone sees. 🙆",
    ],
  },
  studyResumed: {
    hype: [
      "Round {round}. Let's get it. 🔥",
      "Back at it, squad. This round is yours. 💪",
      "Breaks are nice, but winning is nicer. Let's go. 🚀",
    ],
    drill: [
      "BREAK OVER. RETURN TO YOUR POSITIONS. 🚨",
      "Back to the mission. No excuses. 🎯",
      "Break's over. Back to business. ⏰",
      "The squad needs you. Lock back in. 🫡",
    ],
    chill: [
      "Okay, let's slide back into it. You've got this. 🌱",
      "Welcome back. Pick up right where you left off. 📖",
      "Deep breath. Back to it, nice and steady. 🍵",
    ],
    meme: [
      "Alright, who actually came back? 👀",
      "The fridge will still be there later. Back to work. 🧊",
      "The textbook is giving you that look again. 📚",
    ],
    gamer: [
      "Reboot complete. Brain is back online. 🧠",
      "Round {round} begins. Fight! 🕹️",
      "Respawned. Back into the dungeon. ⚔️",
    ],
    chaos: [
      "Somewhere, a highlighter is trembling with excitement. Back to it. 🖍️",
      "The books missed you. They didn't say it, but they did. 📚",
      "Break's over. The snacks have been warned. 🥨",
    ],
  },
  sessionCompleted: {
    hype: [
      "THAT'S A WRAP. Great work, squad! 🏆",
      "Another session in the books. 🔥",
      "Full cycle done. You're all legends. 🙌",
    ],
    drill: [
      "Mission accomplished. Well done, everyone. 🫡",
      "Four rounds. Zero excuses. Outstanding work. 🎖️",
    ],
    chill: [
      "Brains got bigger today. Probably. 🧠",
      "Lovely session, everyone. Go rest properly. 🛋️",
      "Long break. You've earned the good snack. 🍫",
    ],
    meme: [
      "The squad understood the assignment. 👑",
      "Progress made. Procrastination defeated. 📈",
      "Go lie on the floor dramatically. It's tradition. 🫠",
    ],
    gamer: [
      "XP earned. Knowledge acquired. ⭐",
      "Dungeon cleared. Loot secured. 🗝️",
      "Achievement unlocked: full cycle. 🏅",
    ],
    chaos: [
      "Your brain is officially toast. Go butter it. 🍞",
      "Somebody alert the dean. A full cycle just happened. 📣",
    ],
  },
  memberJoined: {
    hype: [
      "We got another one! Welcome to the squad. 👋",
      "Squad's getting stronger. 🚀",
      "More brains, more gains. 🤝",
    ],
    drill: ["Another soldier has entered the study zone. 🎯", "Fresh recruit spotted. Fall in. 🫡"],
    chill: ["Study buddies acquired. 📚", "Hey, welcome! Pull up a chair. ☕"],
    meme: [
      "Someone's here to get productive. 👀",
      "They said they'd study today and they actually showed up. 👏",
    ],
    gamer: ["Player joined the party. 🎮", "A new challenger approaches. ⚔️"],
    chaos: [
      "The study portal opened and someone fell through. 🌀",
      "Look who wandered in. Act natural. 🦆",
    ],
  },
  badgeUnlocked: {
    hype: [
      "just unlocked {badge}! Absolute legend. 🏅",
      "earned {badge}. The squad is SO back. 🙌",
      "got {badge}. Somebody get this person a trophy case. 🏆",
    ],
    drill: [
      "has been awarded {badge}. Outstanding work. Now back to it. 🫡",
      "earned {badge}. Decorated in the field. 🎖️",
    ],
    chill: [
      "unlocked {badge}. Nicely done, take a moment to enjoy that. 🌟",
      "picked up {badge}. Quietly crushing it. 🌱",
    ],
    meme: [
      "unlocked {badge}. Put it on the résumé. 📄",
      "just got {badge} and will not stop talking about it. 🗣️",
    ],
    gamer: [
      "Achievement unlocked: {badge}. 🏅",
      "got a rare drop: {badge}. ✨",
      "leveled up their collection with {badge}. 🎮",
    ],
    chaos: [
      "unlocked {badge}. The prophecy is being fulfilled. 🔮",
      "now owns {badge}. Nobody knows how. Nobody asks. 🦆",
    ],
  },
};

/** How a secret badge is named in the channel, so the surprise isn't spoiled for everyone else. */
export const SECRET_BADGE_NAME = "a secret badge";

export interface RareLine {
  text: string;
  /** Only said when it's true. Leave out for lines that always fit. */
  minTogetherMinutes?: number;
}

/** Surprises that replace a timer post now and then, whatever the personality. */
export const RARE_LINES: readonly RareLine[] = [
  {
    text: "You've been studying together for {hours} hours. That's actually insane. 🤯",
    minTogetherMinutes: 120,
  },
  { text: "Legendary focus detected. The squad is built different. 💎" },
  { text: "Achievement unlocked: Professional Procrastination Recovery. 🏅" },
  { text: "The academic comeback is officially underway. 📈" },
  { text: "Somewhere, a professor just felt a disturbance in the force. 🌌" },
];

/** Added to the end-of-cycle post, since that's when "Keep going?" shows. */
export const KEEP_GOING_FOOTER = "Tap Keep going in Study Squad to roll into the next cycle.";

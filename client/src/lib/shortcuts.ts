/** The keyboard shortcuts, as the "?" sheet lists them. App.tsx binds the single keys. */
export const SHORTCUT_GROUPS: { title: string; rows: [label: string, keys: string[]][] }[] = [
  {
    title: "Focus",
    rows: [
      ["Start focusing", ["F"]],
      ["Start a solo timer", ["S"]],
      ["End solo / leave timer", ["E", "E"]],
      ["Keep going (long break)", ["Enter"]],
    ],
  },
  {
    title: "Goals",
    rows: [
      ["Open goals", ["G"]],
      ["New goal", ["N"]],
      ["Tick the focused goal", ["Space"]],
      ["Move the focused goal", ["↑", "↓"]],
    ],
  },
  {
    title: "Sound",
    rows: [
      ["Sounds", ["M"]],
      ["Play / pause music", ["K"]],
      ["Previous / next track", ["[", "]"]],
      ["Sound effects on / off", ["Q"]],
    ],
  },
  {
    title: "Go to",
    rows: [
      ["Your progress", ["P"]],
      ["Your profile", ["Y"]],
      ["Room settings", [","]],
      ["Join voice", ["V"]],
    ],
  },
  {
    title: "On a break",
    rows: [
      ["Break challenge done", ["D"]],
      ["High-five everyone on a break", ["H"]],
    ],
  },
  {
    title: "Anywhere",
    rows: [
      ["Move around a group", ["←", "→", "↑", "↓"]],
      ["Close / go back", ["Esc"]],
      ["This list", ["?"]],
    ],
  },
];

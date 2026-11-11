import type {
  BadgeCategory,
  BadgeColor,
  BadgeDefinition,
  BadgeGlyph,
  BadgeTier,
} from "@studyroom/core";
import { useId, type ReactNode } from "react";

/**
 * Line drawings for the middle of each medal, on a 24 by 24 grid in the
 * same style as the app's other icons.
 */
const GLYPHS: Record<BadgeGlyph | "question", ReactNode> = {
  alarm: (
    <>
      <circle cx="12" cy="13" r="7" />
      <path d="M12 10v3l2 2M5 3 2 6M22 6l-3-3" />
    </>
  ),
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  burst: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </>
  ),
  cap: <path d="M22 10 12 5 2 10l10 5 10-5zM6 12v5c3 2 9 2 12 0v-5M22 10v6" />,
  chart: <path d="M3 3v18h18M7 15l4-4 3 3 6-6M15 8h5v5" />,
  check: <path d="M20 6 9 17l-5-5" />,
  clover: (
    <>
      <circle cx="9" cy="8.5" r="3.5" />
      <circle cx="15" cy="8.5" r="3.5" />
      <circle cx="9" cy="14.5" r="3.5" />
      <circle cx="15" cy="14.5" r="3.5" />
      <path d="M14 17l3 5" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
    </>
  ),
  columns: <path d="M3 21h18M4 10h16M12 3l9 5H3zM6 10v8M10 10v8M14 10v8M18 10v8" />,
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m16 8-2 6-6 2 2-6z" />
    </>
  ),
  cycle: <path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5" />,
  door: <path d="M4 21h16M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M14 12h.01" />,
  flag: <path d="M5 22V3M5 4h13l-2.5 4.5L18 13H5" />,
  flame: (
    <path d="M12 22c4 0 7-2.8 7-7 0-4-3-6-4-9.5-1.2 2-2.3 3-4 3.2C11 6.5 10 4 8.5 2.5 8 7 5 9 5 15c0 4.2 3 7 7 7z" />
  ),
  gauge: <path d="m12 14 4-4M3.3 19a10 10 0 1 1 17.4 0" />,
  hourglass: <path d="M6 2h12M6 22h12M7 2v4l5 6 5-6V2M7 22v-4l5-6 5 6v4" />,
  lamp: (
    <>
      <rect x="8.5" y="11" width="7" height="10" rx="1" />
      <path d="M12 3c1.6 2 2 3.4 0 5.5-2-2.1-1.6-3.5 0-5.5zM6 21h12" />
    </>
  ),
  list: (
    <path d="M10 6h10M10 12h10M10 18h10M3.5 6l1.5 1.5L7.5 5M3.5 12l1.5 1.5 2.5-2.5M3.5 18l1.5 1.5 2.5-2.5" />
  ),
  map: <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14" />,
  moon: <path d="M20 13.5A8.5 8.5 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5z" />,
  mountain: <path d="M2 20 9 8l4 7 2.5-4L22 20z" />,
  people: (
    <>
      <circle cx="9" cy="7" r="4" />
      <path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2M16 3.1a4 4 0 0 1 0 7.8M22 21v-2a4 4 0 0 0-3-3.9" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="7" r="4" />
      <path d="M5 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2" />
    </>
  ),
  pi: <path d="M4 7.5c1-1.5 2.5-2 4-2h12M9 6v14M15 6v10.5a3 3 0 0 0 3 3h1" />,
  planet: (
    <>
      <circle cx="12" cy="12" r="5.5" />
      <ellipse cx="12" cy="12" rx="10.5" ry="3.5" transform="rotate(-25 12 12)" />
    </>
  ),
  podium: <path d="M3 21h18M9 21V8h6v13M3 21v-8h6M15 21v-5h6v5" />,
  rocket: (
    <>
      <path d="M5 15c-1.5 1.3-2 5-2 5s3.7-.5 5-2M9 15l-3-3c1-4 4-9 12-9 0 8-5 11-9 12z" />
      <circle cx="15" cy="9" r="1.5" />
    </>
  ),
  scroll: (
    <path d="M7 3h11v14a3 3 0 0 1-3 3H6M7 3a2 2 0 0 0-2 2v2h2M10 8h5M10 12h5M6 20a2 2 0 0 1-2-2v-1h8v1a2 2 0 0 0 3 2" />
  ),
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  snowflake: <path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 2 3-2M9 20l3-2 3 2" />,
  sparkles: (
    <path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8zM5 2v4M3 4h4" />
  ),
  sprout: <path d="M12 21v-9M12 12C12 8 9 6 5 6c0 4 3 6 7 6zM12 14c0-3 2.5-5 6-5 0 3-2.5 5-6 5z" />,
  star: <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />,
  summit: <path d="M2 20 9 8l4 7 2.5-4L22 20zM9 8V2.5l4.5 1.7L9 6" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  sunrise: (
    <path d="M2 18h20M5 22h14M17 18a5 5 0 0 0-10 0M12 2v6M4.2 10.2l1.4 1.4M18.4 11.6l1.4-1.4M2 14h2M20 14h2M9 5l3-3 3 3" />
  ),
  sword: <path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2" />,
  swords: (
    <path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M14.5 6.5 18 3h3v3l-3.5 3.5M5 14l4 4M7 17l-3 3M3 19l2 2" />
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  terminal: <path d="m4 17 6-6-6-6M12 19h8" />,
  timer: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2M9 2h6" />
    </>
  ),
  trophy: (
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.7V17c0 .6-.5 1-1 1.2-1.2.6-2 2-2 3.8M14 14.7V17c0 .6.5 1 1 1.2 1.2.6 2 2 2 3.8M18 2H6v7a6 6 0 0 0 12 0z" />
  ),
  "bell-off": (
    <path d="M8.7 3A6 6 0 0 1 18 8a21 21 0 0 0 .6 5M17 17H3s3-2 3-9a4.7 4.7 0 0 1 .3-1.7M10.3 21a1.9 1.9 0 0 0 3.4 0M2 2l20 20" />
  ),
  coffee: (
    <path d="M17 8h1a4 4 0 1 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4zM6 2v2M10 2v2M14 2v2" />
  ),
  question: <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" />,
};

type MedalLook = BadgeTier | "locked";

/** Rim gradient stops (light to dark), face colour and glyph colour for each metal. */
export const METALS: Record<
  MedalLook,
  { rim: string[]; face: string; ink: string; stampInk: string }
> = {
  bronze: {
    rim: ["#f6c79b", "#c27a3e", "#7a4119"],
    face: "#2b1d14",
    ink: "#ffcf9e",
    stampInk: "#2b1608",
  },
  silver: {
    rim: ["#f7f9fc", "#b3bdcb", "#5e6979"],
    face: "#1c2330",
    ink: "#e9eff8",
    stampInk: "#1a2230",
  },
  gold: {
    rim: ["#fff0b0", "#f3b52d", "#94620a"],
    face: "#2c2310",
    ink: "#ffe08a",
    stampInk: "#2c1d02",
  },
  platinum: {
    rim: ["#effcff", "#9edcec", "#3f7f94"],
    face: "#10242b",
    ink: "#cff6ff",
    stampInk: "#0b2129",
  },
  secret: {
    rim: ["#ffb3ec", "#a77bff", "#5fd0ff", "#8affc8"],
    face: "#1e1636",
    ink: "#ecdfff",
    stampInk: "#1e1036",
  },
  // Locked greys come from styles.css so they follow the light/dark theme.
  // These are set as style properties below, since SVG attributes can't
  // read CSS variables.
  locked: {
    rim: ["var(--locked-rim-0)", "var(--locked-rim-1)", "var(--locked-rim-2)"],
    face: "var(--locked-face)",
    ink: "var(--locked-ink)",
    stampInk: "var(--locked-stamp)",
  },
};

/** Themed metals for badges with a `color`. They keep their tier's stamp ink. */
const COLORS: Record<BadgeColor, { rim: string[]; face: string; ink: string }> = {
  ice: { rim: ["#f2fdff", "#a6dbf0", "#3f7c99"], face: "#0d2c3d", ink: "#c4f1ff" },
  purple: { rim: ["#f3edff", "#b7a2ec", "#58428f"], face: "#1e1440", ink: "#d9c8ff" },
  sunrise: { rim: ["#fff2e2", "#f0b48a", "#9a5534"], face: "#3a1a0c", ink: "#ffc890" },
  green: { rim: ["#e6f7cc", "#93bb6a", "#45702a"], face: "#11301a", ink: "#b9f2a4" },
  electric: { rim: ["#f4fbff", "#9cc8f0", "#3a6496"], face: "#0e1f3f", ink: "#a8dcff" },
};

/** The colours an earned badge's medal is drawn in. */
export function medalMetal(badge: BadgeDefinition) {
  const tier = METALS[badge.tier];
  return badge.color ? { ...tier, ...COLORS[badge.color] } : tier;
}

/** Points of a star polygon centred on the medal, as an SVG path. */
function starPath(points: number, outer: number, inner: number, cy = 32): string {
  const steps = points * 2;
  const corners = Array.from({ length: steps }, (_, i) => {
    const angle = (Math.PI * 2 * i) / steps - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    return `${(32 + r * Math.cos(angle)).toFixed(2)} ${(cy + r * Math.sin(angle)).toFixed(2)}`;
  });
  return `M${corners.join("L")}Z`;
}

/** A rosette: a circle of round bumps. */
function rosettePath(bumps: number, radius: number, bump: number): string {
  const corners = Array.from({ length: bumps }, (_, i) => {
    const angle = (Math.PI * 2 * i) / bumps - Math.PI / 2;
    return `${(32 + radius * Math.cos(angle)).toFixed(2)} ${(32 + radius * Math.sin(angle)).toFixed(2)}`;
  });
  return `M${corners[0]}${corners
    .slice(1)
    .concat(corners[0]!)
    .map((c) => `A${bump} ${bump} 0 0 1 ${c}`)
    .join("")}Z`;
}

/**
 * Each family of badges has its own silhouette, so a streak badge never
 * looks like a boss badge even at a glance. All fit a 64 by 64 box.
 */
export const FRAMES: Record<BadgeCategory, string> = {
  // A heater shield.
  streak: "M32 3 54 10v20c0 15-10 24-22 31C20 54 10 45 10 30V10z",
  // A tall hexagon, like a rank insignia.
  level: "M32 2 58 17v30L32 62 6 47V17z",
  // A sunburst, like a clock face with ticks.
  focus: starPath(20, 30, 26),
  // A rounded tile.
  room: "M18 6h28a12 12 0 0 1 12 12v28a12 12 0 0 1-12 12H18A12 12 0 0 1 6 46V18A12 12 0 0 1 18 6z",
  // A rosette.
  goals: rosettePath(14, 25, 6.2),
  // A spiked war shield.
  boss: "M32 2 44 9l14-3-4 15 6 12-12 13-16 16-16-16L4 33l6-12-4-15 14 3z",
  // A hanging banner.
  quests: "M10 4h44v44L32 61 10 48z",
  // A crest with a crown on top.
  leaderboard: "M8 20 17 7l8 9 7-12 7 12 8-9 9 13v18c0 12-11 20-24 23C19 58 8 50 8 38z",
  // A cut gem.
  secret: "M18 5h28l15 18-29 38L3 23z",
};

/** Facet lines for the gem, drawn over its face. */
const GEM_FACETS = "M3 23h58M18 5l7 18 7-18 7 18 7-18M25 23l7 38 7-38";

/** The leaves of a laurel wreath along one side. Mirrored for the other side. */
const LAUREL = Array.from({ length: 6 }, (_, i) => {
  const angle = ((118 + i * 22) * Math.PI) / 180;
  const x = 32 + 29 * Math.cos(angle);
  const y = 34 + 27 * Math.sin(angle);
  const tilt = (angle * 180) / Math.PI + 90 + 35;
  return { x, y, tilt };
});

/** Ribbon colours for the gold and platinum tails. */
const RIBBONS: Partial<Record<MedalLook, [string, string]>> = {
  gold: ["#3d63dd", "#22398a"],
  platinum: ["#8f5bff", "#4b2aa6"],
  secret: ["#ff7ad9", "#8a3fd1"],
};

/** A four-pointed glint. */
const GLINT = "M0 -4 1 -1 4 0 1 1 0 4-1 1-4 0-1-1z";

/**
 * A badge drawn as a minted piece in its family's shape. The metal shows the
 * tier, and harder tiers get more dressing: silver adds a bevel, gold hangs
 * ribbon tails, and platinum adds a laurel wreath, glints and a passing shine.
 * Secret badges are holographic gems. Locked badges keep their shape in plain
 * grey; secret ones you haven't found show a question mark.
 */
export function BadgeMedal({
  badge,
  size = 48,
  locked = false,
  className,
}: {
  badge: BadgeDefinition;
  size?: number;
  locked?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const hidden = locked && badge.secret === true;
  const look: MedalLook = locked ? "locked" : badge.tier;
  const metal = locked ? METALS.locked : medalMetal(badge);
  const frame = FRAMES[badge.category];
  const glyph = GLYPHS[hidden ? "question" : badge.glyph];
  const small = size < 36;
  const stamp = !hidden && !small ? badge.stamp : undefined;
  const stampWidth = stamp ? 12 + stamp.length * 6.4 : 0;
  // Small medals lose the stamp, so the glyph fills more of the face.
  const glyphScale = stamp ? 0.95 : small ? 1.25 : 1.1;
  const glyphY = stamp ? 28 : 31;
  const tier = badge.tier;
  const dressed = !locked && !small;
  const ribbon = dressed ? RIBBONS[tier] : undefined;
  const wreath = dressed && tier === "platinum";
  const shine = !locked && (tier === "platinum" || tier === "secret");
  const bevel = !locked && tier !== "bronze";
  const inset = "translate(32 32) scale(0.8) translate(-32 -32)";

  return (
    <svg
      className={className ? `badge-medal ${className}` : "badge-medal"}
      data-tier={look}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      overflow="visible"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-rim`} x1="0.15" y1="0" x2="0.85" y2="1">
          {metal.rim.map((color, i) => (
            <stop key={color} offset={i / (metal.rim.length - 1)} style={{ stopColor: color }} />
          ))}
        </linearGradient>
        <radialGradient id={`${id}-face`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" style={{ stopColor: metal.rim[1] }} stopOpacity={locked ? 0.08 : 0.3} />
          <stop offset="0.65" style={{ stopColor: metal.face }} />
        </radialGradient>
        <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          <path d={frame} />
        </clipPath>
      </defs>

      {ribbon && (
        <g>
          <path d="M20 40 13 63l7-4 5 5 5-22z" fill={ribbon[1]} />
          <path d="M44 40l7 23-7-4-5 5-5-22z" fill={ribbon[1]} />
          <path d="M20 40 13 63l7-4 2-17z" fill={ribbon[0]} />
          <path d="M44 40l7 23-7-4-2-17z" fill={ribbon[0]} />
        </g>
      )}

      {wreath && (
        <g fill={metal.rim[1]} stroke={metal.rim[2]} strokeWidth="0.6">
          {LAUREL.map((leaf, i) => (
            <g key={i}>
              <ellipse
                cx={leaf.x}
                cy={leaf.y}
                rx="2.2"
                ry="4.6"
                transform={`rotate(${leaf.tilt} ${leaf.x} ${leaf.y})`}
              />
              <ellipse
                cx={64 - leaf.x}
                cy={leaf.y}
                rx="2.2"
                ry="4.6"
                transform={`rotate(${-leaf.tilt} ${64 - leaf.x} ${leaf.y})`}
              />
            </g>
          ))}
        </g>
      )}

      <path d={frame} fill={`url(#${id}-rim)`} />
      <path
        d={frame}
        transform={inset}
        style={{ fill: metal.face }}
        stroke="#000"
        strokeOpacity="0.35"
        strokeWidth="2"
      />
      <path d={frame} transform={inset} fill={`url(#${id}-face)`} />
      {bevel && (
        <path
          d={frame}
          transform="translate(32 32) scale(0.72) translate(-32 -32)"
          fill="none"
          stroke={metal.rim[0]}
          strokeOpacity="0.4"
          strokeWidth="1.2"
        />
      )}
      {badge.category === "secret" && (
        <path
          d={GEM_FACETS}
          transform={inset}
          fill="none"
          style={{ stroke: metal.rim[0] }}
          strokeOpacity={locked ? 0.12 : 0.22}
          strokeWidth="1.2"
        />
      )}
      {shine && (
        <g clipPath={`url(#${id}-clip)`}>
          <rect
            className="medal-sheen"
            x="-40"
            y="-10"
            width="24"
            height="90"
            fill={`url(#${id}-sheen)`}
            transform="rotate(20 32 32)"
          />
        </g>
      )}

      <g
        transform={`translate(32 ${glyphY}) scale(${glyphScale}) translate(-12 -12)`}
        fill="none"
        style={{ stroke: metal.ink }}
        strokeWidth={small ? 2.4 : 2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {glyph}
      </g>

      {stamp && (
        <g>
          <rect
            x={32 - stampWidth / 2}
            y="44"
            width={stampWidth}
            height="14"
            rx="7"
            fill={`url(#${id}-rim)`}
            style={{ stroke: metal.face }}
            strokeWidth="1.5"
          />
          <text
            x="32"
            y="54.2"
            textAnchor="middle"
            fontSize="10"
            fontWeight="800"
            style={{ fill: metal.stampInk, fontFamily: "var(--font-display, inherit)" }}
          >
            {stamp}
          </text>
        </g>
      )}

      {dressed && (tier === "platinum" || tier === "secret") && (
        <g fill="#fff">
          <path d={GLINT} transform="translate(52 9) scale(1.1)" opacity="0.9" />
          <path d={GLINT} transform="translate(11 50) scale(0.7)" opacity="0.7" />
        </g>
      )}
    </svg>
  );
}

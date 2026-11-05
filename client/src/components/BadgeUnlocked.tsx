import { badgeById, type BadgeTier } from "@studyroom/core";
import { useEffect, useId, useMemo, useRef, type CSSProperties } from "react";
import { playBadgeSound } from "../lib/badgeSounds";
import { BadgeMedal } from "./BadgeMedal";

interface TierShow {
  eyebrow: string;
  /** How long the moment stays up before moving on by itself. */
  ms: number;
  sparks: number;
  confetti: number;
  twinkles: number;
  waves: number;
  palette: string[];
}

/**
 * Each tier gets a bigger moment than the one before it. Bronze pops,
 * silver adds light rays, gold spins in with a shockwave and confetti,
 * platinum arrives down a beam of light with a double shockwave and
 * twinkling stars, and a secret badge shakes as a mystery gem before it
 * bursts open in holographic colour.
 */
const SHOWS: Record<BadgeTier, TierShow> = {
  bronze: {
    eyebrow: "Badge unlocked",
    ms: 3_500,
    sparks: 10,
    confetti: 0,
    twinkles: 0,
    waves: 0,
    palette: ["#f6c79b", "#c27a3e"],
  },
  silver: {
    eyebrow: "Silver badge unlocked",
    ms: 4_500,
    sparks: 16,
    confetti: 0,
    twinkles: 0,
    waves: 1,
    palette: ["#f7f9fc", "#b3bdcb"],
  },
  gold: {
    eyebrow: "Gold badge unlocked!",
    ms: 6_000,
    sparks: 24,
    confetti: 40,
    twinkles: 0,
    waves: 1,
    palette: ["#fff0b0", "#f3b52d", "#ffd75e", "#3d63dd"],
  },
  platinum: {
    eyebrow: "Platinum badge unlocked!",
    ms: 7_500,
    sparks: 32,
    confetti: 60,
    twinkles: 18,
    waves: 2,
    palette: ["#effcff", "#9edcec", "#8f5bff", "#ffffff"],
  },
  secret: {
    eyebrow: "Secret badge found!",
    ms: 8_000,
    sparks: 32,
    confetti: 60,
    twinkles: 18,
    waves: 2,
    palette: ["#ffb3ec", "#a77bff", "#5fd0ff", "#8affc8"],
  },
};

/** A small seeded generator, so a badge's burst looks the same each time it renders. */
function seeded(seed: string) {
  let state = 1;
  for (const ch of seed) state = (state * 31 + ch.charCodeAt(0)) % 2147483647;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

type Vars = CSSProperties & Record<`--${string}`, string>;

/**
 * The full-screen moment for a badge you just earned, with a sound that
 * matches its tier unless sounds are muted. It moves on by itself, or with a
 * tap anywhere, the button, or Escape.
 */
export function BadgeUnlocked({
  badgeId,
  muted = false,
  onDismiss,
  play = playBadgeSound,
}: {
  badgeId: string;
  muted?: boolean;
  onDismiss(): void;
  play?: (tier: BadgeTier) => void;
}) {
  const badge = badgeById(badgeId);
  const titleId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const show = SHOWS[badge?.tier ?? "bronze"];

  const pieces = useMemo(() => {
    const random = seeded(badgeId);
    const sparks = Array.from({ length: show.sparks }, (_, i) => {
      const angle = (Math.PI * 2 * i) / show.sparks + random() * 0.3;
      const distance = 110 + random() * 120;
      return {
        "--x": `${Math.cos(angle) * distance}px`,
        "--y": `${Math.sin(angle) * distance}px`,
        "--delay": `${random() * 0.15}s`,
        background: show.palette[i % show.palette.length],
      } as Vars;
    });
    const confetti = Array.from({ length: show.confetti }, (_, i) => ({
      left: `${random() * 100}%`,
      "--delay": `${random() * 0.9}s`,
      "--spin": `${random() * 360}deg`,
      background: show.palette[i % show.palette.length],
    })) as Vars[];
    const twinkles = Array.from({ length: show.twinkles }, () => ({
      left: `${5 + random() * 90}%`,
      top: `${5 + random() * 90}%`,
      "--delay": `${random() * 2}s`,
      "--size": `${6 + random() * 10}px`,
    })) as Vars[];
    return { sparks, confetti, twinkles };
  }, [badgeId, show]);

  // The sound plays once per badge, even if the mute setting changes mid-show.
  const tier = badge?.tier;
  const mutedAtStart = useRef(muted);
  useEffect(() => {
    if (!tier || mutedAtStart.current) return;
    try {
      play(tier);
    } catch {
      // A sound must never break the moment.
    }
  }, [tier, play]);

  useEffect(() => {
    button.current?.focus();
    const timer = setTimeout(onDismiss, show.ms);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDismiss();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [onDismiss, show.ms]);

  if (!badge || !tier) return null;

  return (
    <div
      className="unlock theme-dark"
      data-tier={tier}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onDismiss}
    >
      <div className="unlock-backdrop" aria-hidden="true" />
      <div className="unlock-fx" aria-hidden="true">
        {tier === "platinum" && <div className="unlock-beam" />}
        {(tier === "platinum" || tier === "secret") && <div className="unlock-flash" />}
        {pieces.twinkles.map((style, i) => (
          <span key={i} className="unlock-twinkle" style={style} />
        ))}
        {pieces.confetti.map((style, i) => (
          <span key={i} className="unlock-confetti" style={style} />
        ))}
      </div>

      <div className="unlock-stage" aria-hidden="true">
        {tier !== "bronze" && <div className="unlock-rays" />}
        {Array.from({ length: show.waves }, (_, i) => (
          <span key={i} className="unlock-wave" style={{ "--n": String(i) } as Vars} />
        ))}
        {pieces.sparks.map((style, i) => (
          <span key={i} className="unlock-spark" style={style} />
        ))}
        {tier === "secret" && (
          <BadgeMedal badge={badge} size={168} locked className="unlock-mystery" />
        )}
        <BadgeMedal badge={badge} size={168} className="unlock-medal" />
      </div>

      <div className="unlock-text">
        <span className="unlock-eyebrow">{show.eyebrow}</span>
        <h2 id={titleId} className="unlock-name">
          {badge.name}
        </h2>
        <p className="unlock-desc">{badge.description}</p>
        <button
          ref={button}
          type="button"
          className="btn btn-primary"
          onClick={(e) => {
            // The backdrop dismisses too; one click must only move on once.
            e.stopPropagation();
            onDismiss();
          }}
        >
          Nice!
        </button>
      </div>
    </div>
  );
}

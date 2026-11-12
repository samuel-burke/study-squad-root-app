import { badgeById, TIERS } from "@studyroom/core";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import tierSound from "../assets/sounds/tier.mp3";
import { playSound } from "../lib/clips";
import type { Ring3D } from "../lib/ring3d";
import { BadgeMedal } from "./BadgeMedal";

/** Seconds until the ring is lit and the text shows (the timeline in lib/ring3d.ts). */
const LAND = 2.88;
/** Seconds the ring keeps turning after it lands. */
const TURN = 6;

/**
 * The unlock for a color tier's ring badge: a glass neon tube lights up in
 * the dark to its hum (lib/ring3d.ts), and the app takes on the new color
 * once it closes. The still ring shows instead without hardware WebGL, and
 * on its own with reduced motion.
 */
export function RingUnlocked({
  badgeId,
  muted = false,
  onDismiss,
}: {
  badgeId: string;
  muted?: boolean;
  onDismiss(): void;
}) {
  const badge = badgeById(badgeId);
  const tier = TIERS.find((t) => t.id === badge?.ring);
  const titleId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  // With reduced motion there is no show: just the still ring.
  const [still] = useState(
    () =>
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [noWebGL, setNoWebGL] = useState(false);
  const plain = still || noWebGL;

  const mutedAtStart = useRef(muted);
  useEffect(() => {
    if (mutedAtStart.current) return;
    return playSound(tierSound, 0.8);
  }, []);

  useEffect(() => {
    button.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDismiss();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  useEffect(() => {
    const el = stage.current;
    if (!tier || !el) return;
    if (still) return;
    let ring: Ring3D | null = null;
    let raf = 0;
    let closed = false;
    const start = performance.now();
    const frame = () => {
      const t = (performance.now() - start) / 1000;
      if (ring && el.clientWidth) ring.draw(t, el.clientWidth, el.clientHeight);
      if (t < LAND + TURN) raf = requestAnimationFrame(frame);
    };
    import("../lib/ring3d")
      .then(({ createRing3D }) => {
        if (closed) return;
        ring = createRing3D(tier);
        if (!ring) return setNoWebGL(true);
        ring.canvas.className = "unlock-canvas";
        el.appendChild(ring.canvas);
        raf = requestAnimationFrame(frame);
      })
      .catch(() => setNoWebGL(true));
    return () => {
      closed = true;
      cancelAnimationFrame(raf);
      ring?.canvas.remove();
      ring?.dispose();
    };
  }, [tier, still]);

  if (!badge || !tier) return null;

  return (
    <div
      className="unlock ring-unlock theme-dark"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={{ "--land": `${plain ? 0.5 : LAND}s` } as CSSProperties}
      data-tier-ring={tier.id}
      onClick={onDismiss}
    >
      <div ref={stage} className="unlock-canvas" aria-hidden="true" />
      {plain && <BadgeMedal badge={badge} size={220} className="unlock-plain" />}
      <div className="unlock-text">
        <span className="unlock-eyebrow">New color unlocked</span>
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

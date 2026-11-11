import { badgeById, type BadgeTier } from "@studyroom/core";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { playClip } from "../lib/clips";
import type { Medal3D } from "../lib/medal3d";
import { clamp, SHOWS, ShowPainter, type DrawMedal } from "../lib/unlockShow";
import { BadgeMedal, FRAMES, METALS } from "./BadgeMedal";

const EYEBROWS: Record<BadgeTier, string> = {
  bronze: "Badge unlocked",
  silver: "Silver badge unlocked",
  gold: "Gold badge unlocked!",
  platinum: "Platinum badge unlocked!",
  secret: "Secret badge found!",
};

/** Seconds the moment stays up after the music ends, before moving on by itself. */
const LINGER = 1.5;

/** The show's length in milliseconds, before it moves on by itself. */
export function showMs(tier: BadgeTier): number {
  return Math.round((SHOWS[tier].end + LINGER) * 1000);
}

/** The flat medal art as an image, on an 88 by 88 box so the ribbons and wreath fit. */
function medalImage(svg: SVGSVGElement): HTMLImageElement {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute("viewBox", "-12 -12 88 88");
  copy.setAttribute("width", "1024");
  copy.setAttribute("height", "1024");
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`;
  return img;
}

/**
 * The full-screen moment for a badge you just earned: a short cinematic for
 * its tier (see lib/unlockShow.ts) set to its music, unless sounds are muted.
 * The medal is a 3D minted piece where WebGL allows, and the flat medal
 * otherwise. It moves on by itself, or with a tap anywhere, the button, or
 * Escape.
 */
export function BadgeUnlocked({
  badgeId,
  muted = false,
  onDismiss,
  play = playClip,
}: {
  badgeId: string;
  muted?: boolean;
  onDismiss(): void;
  /** Starts the tier's music, and returns a function that stops it. */
  play?: (tier: BadgeTier) => (() => void) | void;
}) {
  const badge = badgeById(badgeId);
  const tier = badge?.tier;
  const titleId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const art = useRef<HTMLDivElement>(null);
  // If the page can't load the medal art as an image, the plain medal shows instead.
  const [plain, setPlain] = useState(false);
  const ms = showMs(tier ?? "bronze");

  // The music plays once per badge, even if the mute setting changes mid-show,
  // and fades out when the moment closes.
  const mutedAtStart = useRef(muted);
  useEffect(() => {
    if (!tier || mutedAtStart.current) return;
    let stop: (() => void) | void;
    try {
      stop = play(tier);
    } catch {
      // A sound must never break the moment.
    }
    return () => stop?.();
  }, [tier, play]);

  useEffect(() => {
    button.current?.focus();
    const timer = setTimeout(onDismiss, ms);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDismiss();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [onDismiss, ms]);

  // The show, drawn every frame from the moment it opens.
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    const svg = art.current?.querySelector("svg");
    if (!badge || !tier || !ctx || !svg) return;
    const show = SHOWS[tier];
    const img = medalImage(svg);
    let medal3d: Medal3D | null = null;
    let closed = false;
    img.onerror = () => setPlain(true);
    img.onload = () => {
      import("../lib/medal3d")
        .then(({ createMedal3D }) => {
          if (closed) return;
          medal3d = createMedal3D(tier, FRAMES[badge.category], METALS[tier].rim[1]!, img);
        })
        .catch(() => {
          // No 3D: the flat medal stays.
        });
    };
    let dpr = 1;
    const drawMedal: DrawMedal = (c, x, y, r, t, tilt) => {
      if (medal3d) {
        const dt = t - show.land;
        const size = r * 4.9;
        const lit = show.build === "herald" && dt < 0 ? 0.2 + 1.2 * clamp(t / show.land) ** 2 : 1.4;
        const flash = dt > 0 && dt < 1 ? 3 * Math.exp(-dt * 4) : 0;
        const frame = medal3d.render(t, tilt, Math.round(size * dpr), {
          key: lit + flash,
          fill: dt > 0 ? 1.2 : 0.6,
        });
        c.drawImage(frame, x - size / 2, y - size / 2, size, size);
      } else if (img.complete && img.naturalWidth) {
        const size = r * 4;
        c.save();
        c.translate(x, y);
        c.scale(Math.max(0.06, Math.abs(Math.cos(tilt))), 1);
        c.drawImage(img, -size / 2, -size / 2, size, size);
        c.restore();
      }
    };
    const reduce =
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const painter = new ShowPainter(ctx, show, drawMedal, reduce);
    const start = performance.now();
    let raf = 0;
    const frame = () => {
      const el = ctx.canvas;
      const W = el.clientWidth;
      const H = el.clientHeight;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      if (el.width !== Math.round(W * dpr) || el.height !== Math.round(H * dpr)) {
        el.width = Math.round(W * dpr);
        el.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      painter.draw((performance.now() - start) / 1000, W, H);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      closed = true;
      cancelAnimationFrame(raf);
      medal3d?.dispose();
    };
  }, [badge, tier]);

  if (!badge || !tier) return null;

  return (
    <div
      className="unlock theme-dark"
      data-tier={tier}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={{ "--land": `${SHOWS[tier].land + 0.45}s` } as CSSProperties}
      onClick={onDismiss}
    >
      <canvas ref={canvas} className="unlock-canvas" aria-hidden="true" />
      <div ref={art} hidden>
        <BadgeMedal badge={badge} size={512} />
      </div>
      {plain && <BadgeMedal badge={badge} size={168} className="unlock-plain" />}

      <div className="unlock-text">
        <span className="unlock-eyebrow">{EYEBROWS[tier]}</span>
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

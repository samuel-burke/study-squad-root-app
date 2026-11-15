import { badgeById, type BadgeTier } from "@studyroom/core";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { playClip } from "../lib/clips";
import { playShowEffects } from "../lib/showEffects";
import type { Medal3D } from "../lib/medal3d";
import { clamp, SHOWS, ShowPainter, type DrawMedal, type Show } from "../lib/unlockShow";
import { BadgeMedal, FRAMES, medalMetal } from "./BadgeMedal";
import { ReplayLink } from "./ReplayLink";
import { RingUnlocked } from "./RingUnlocked";

const EYEBROWS: Record<BadgeTier, string> = {
  bronze: "Badge unlocked",
  silver: "Silver badge unlocked",
  gold: "Gold badge unlocked!",
  platinum: "Platinum badge unlocked!",
  secret: "Secret badge found!",
};

/** The tier's music with its quiet action effects, and a function that stops both. */
function playShow(tier: BadgeTier): () => void {
  const music = playClip(tier);
  const effects = playShowEffects(tier);
  return () => {
    music();
    effects();
  };
}

/** Seconds the show keeps drawing after its music ends. */
const LINGER = 1.5;

/**
 * The flat medal art as an image, on an 88 by 88 box so the ribbons fit. The
 * platinum glints are left off: they belong on the small card, not the 3D medal.
 */
export function medalImage(svg: SVGSVGElement): HTMLImageElement {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.querySelector(".medal-glints")?.remove();
  copy.setAttribute("viewBox", "-12 -12 88 88");
  copy.setAttribute("width", "1024");
  copy.setAttribute("height", "1024");
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`;
  return img;
}

/** One part of the medal on its own (its number bubble or icon), or null when it has none. */
function partOnly(svg: SVGSVGElement, part: string): SVGSVGElement | null {
  if (!svg.querySelector(`.${part}`)) return null;
  const copy = svg.cloneNode(true) as SVGSVGElement;
  for (const child of [...copy.children]) {
    if (child.tagName !== "defs" && !child.classList.contains(part)) child.remove();
  }
  return copy;
}

/** How soft the engraved icon's groove walls are, in medal units (an SVG blur). */
const ENGRAVE_BLUR = 0.3;

/** Draws a loaded image onto a 1024 pixel canvas. */
function rasterize(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 1024;
  c.getContext("2d")?.drawImage(img, 0, 0, 1024, 1024);
  return c;
}

/**
 * A height map that cuts the icon into the face: white face, dark icon. It is
 * drawn at full size from an icon blurred a little (see ENGRAVE_BLUR), which
 * gives the groove smooth walls without jagged edges.
 */
function engraving(img: HTMLImageElement): HTMLCanvasElement {
  const c = rasterize(img);
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

/** Loads part of the medal as an image and turns it into a canvas, or null. */
function loadPart(
  svg: SVGSVGElement,
  part: string,
  draw: (img: HTMLImageElement) => HTMLCanvasElement,
  blur = 0,
): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    const only = partOnly(svg, part);
    if (!only) return resolve(null);
    if (blur) {
      // An SVG filter, since Safari can't blur on a canvas.
      only.insertAdjacentHTML(
        "afterbegin",
        `<filter id="part-blur"><feGaussianBlur stdDeviation="${blur}"/></filter>`,
      );
      only.querySelector(`.${part}`)?.setAttribute("filter", "url(#part-blur)");
    }
    const img = medalImage(only);
    img.onload = () => resolve(draw(img));
    img.onerror = () => resolve(null);
  });
}

interface UnlockProps {
  badgeId: string;
  muted?: boolean;
  onDismiss(): void;
  /** Starts the tier's music and effects, and returns a function that stops them. */
  play?: (tier: BadgeTier) => (() => void) | void;
  /** Plays the whole moment again from the start. */
  onReplay?(): void;
}

/** A color tier's ring gets its own neon unlock; every other badge gets the medal show. */
export function BadgeUnlocked(props: UnlockProps) {
  const ring = badgeById(props.badgeId)?.ring;
  // Replay remounts the moment, which restarts its show and sound.
  const [run, setRun] = useState(0);
  const onReplay = () => setRun((n) => n + 1);
  return ring ? (
    <RingUnlocked key={run} {...props} onReplay={onReplay} />
  ) : (
    <MedalUnlocked key={run} {...props} onReplay={onReplay} />
  );
}

/**
 * The full-screen moment for a badge you just earned: a short cinematic for
 * its tier (see lib/unlockShow.ts) set to its music, unless sounds are muted.
 * The medal is a 3D minted piece where WebGL allows, and the flat medal
 * otherwise. It stays up until closed with a tap anywhere, the button, or
 * Escape.
 */
function MedalUnlocked({
  badgeId,
  muted = false,
  onDismiss,
  play = playShow,
  onReplay,
}: UnlockProps) {
  const badge = badgeById(badgeId);
  const tier = badge?.tier;
  const titleId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const art = useRef<HTMLDivElement>(null);
  // If the page can't load the medal art as an image, the plain medal shows instead.
  const [plain, setPlain] = useState(false);

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
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDismiss();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  // The show, drawn every frame from the moment it opens.
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    const svg = art.current?.querySelector("svg");
    if (!badge || !tier || !ctx || !svg) return;
    const rim = medalMetal(badge).rim;
    // A colored badge lights its show in its own tint instead of the tier's.
    const show: Show = badge.color
      ? { ...SHOWS[tier], colors: [rim[2]!, rim[1]!, rim[0]!] }
      : SHOWS[tier];
    const img = medalImage(svg);
    let medal3d: Medal3D | null = null;
    let closed = false;
    // Drawing an SVG image re-rasterizes it every time, so it is drawn once
    // onto a canvas, and that canvas is drawn each frame.
    let flat: HTMLCanvasElement | null = null;
    img.onerror = () => setPlain(true);
    // The 3D medal lays its number bubble on top as its own layer, so the
    // raised rim can't cover it, and cuts its icon into the face.
    const stamp = loadPart(svg, "medal-stamp", rasterize);
    const glyph = loadPart(svg, "medal-glyph", engraving, ENGRAVE_BLUR);
    img.onload = () => {
      const c = rasterize(img);
      flat = c;
      if (still) paint();
      Promise.all([import("../lib/medal3d"), stamp, glyph])
        .then(([{ createMedal3D }, bubble, engraved]) => {
          if (closed) return;
          medal3d = createMedal3D(
            tier,
            FRAMES[badge.category],
            medalMetal(badge).rim[1]!,
            c,
            bubble,
            engraved,
          );
          if (still) paint();
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
        if (size < 1) return;
        // Gold and platinum come in as a dark silhouette, so you can't tell
        // which badge it is: gold lights up as it rises, platinum just before its hit.
        const reveal =
          dt >= 0
            ? 1
            : show.build === "herald"
              ? clamp(t / show.land) ** 3
              : show.build === "beam"
                ? clamp(1 + dt / 1.2) ** 2
                : 1;
        const flash = dt > 0 && dt < 1 ? 3 * Math.exp(-dt * 4) : 0;
        const frame = medal3d.render(t, tilt, Math.round(size * dpr), {
          key: 1.4 * reveal + flash,
          fill: dt > 0 ? 1.2 : 0.6 * reveal,
          env: reveal,
        });
        c.drawImage(frame, x - size / 2, y - size / 2, size, size);
      } else if (flat) {
        const size = r * 4;
        c.save();
        c.translate(x, y);
        c.scale(Math.max(0.06, Math.abs(Math.cos(tilt))), 1);
        c.drawImage(flat, -size / 2, -size / 2, size, size);
        c.restore();
      }
    };
    // With reduced motion there is no cinematic: the landed medal is drawn once, still.
    const still =
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const painter = new ShowPainter(ctx, show, drawMedal, still);
    const start = performance.now();
    /** Draws the show `t` seconds in, sized to the canvas. False while it isn't laid out. */
    const drawAt = (t: number) => {
      const el = ctx.canvas;
      const W = el.clientWidth;
      const H = el.clientHeight;
      if (!W || !H) return false;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      if (el.width !== Math.round(W * dpr) || el.height !== Math.round(H * dpr)) {
        el.width = Math.round(W * dpr);
        el.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      painter.draw(t, W, H);
      return true;
    };
    const paint = () => drawAt(show.land + 2);
    let raf = 0;
    // Frames stop once the show is over; its last frame stays up.
    const frame = () => {
      const t = Math.min((performance.now() - start) / 1000, show.end + LINGER);
      drawAt(t);
      if (t < show.end + LINGER) raf = requestAnimationFrame(frame);
    };
    // Rotating the phone resizes the canvas, so the frame is drawn again to fit.
    const redraw = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(still ? paint : frame);
    };
    redraw();
    window.addEventListener("resize", redraw);
    return () => {
      closed = true;
      window.removeEventListener("resize", redraw);
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
      style={
        {
          "--land": `${SHOWS[tier].land + 0.45}s`,
          ...(badge.color && { "--glow": medalMetal(badge).rim[1] }),
        } as CSSProperties
      }
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
        {onReplay && <ReplayLink onReplay={onReplay} />}
      </div>
    </div>
  );
}

import type { BossDto } from "@studyroom/core";
import { useEffect, useId, useRef, type CSSProperties } from "react";
import type { BadgeDefinition } from "@studyroom/core";
import type { Medal3D } from "../lib/medal3d";
import { BOSS_SHOW, ShowPainter, type DrawMedal } from "../lib/unlockShow";
import { BadgeMedal, FRAMES, METALS } from "./BadgeMedal";
import { medalImage } from "./BadgeUnlocked";

/** Seconds the show keeps drawing after its music ends. */
const LINGER = 1.5;

/** The medal that rises from the wreck: a gold boss medal with crossed swords. */
const SLAYER: BadgeDefinition = {
  id: "boss-slayer",
  name: "Boss slayer",
  description: "",
  glyph: "swords",
  tier: "gold",
  category: "boss",
  earned: () => false,
};

/**
 * The full-screen moment when the room defeats the weekly boss: its card
 * shakes as the last hit drains its HP, shatters on the orchestra hit, and a
 * boss slayer medal rises, minted in 3D like the badges (see lib/unlockShow.ts). The music is the boss event
 * sound, which starts at the same moment. It stays up until closed with a
 * tap anywhere, the button, or Escape.
 */
export function BossDefeated({ boss, onDismiss }: { boss: BossDto; onDismiss(): void }) {
  const titleId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const art = useRef<HTMLDivElement>(null);

  useEffect(() => {
    button.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDismiss();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  const { name, maxHpXp } = boss;
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    // With reduced motion there is no cinematic: the medal is drawn once, still.
    const still =
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    // The medal is 3D where WebGL allows, and flat until then or otherwise.
    const svg = art.current?.querySelector("svg");
    let medal: Medal3D | null = null;
    let flat: HTMLCanvasElement | null = null;
    let closed = false;
    let dpr = 1;
    if (svg) {
      const img = medalImage(svg);
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = c.height = 1024;
        c.getContext("2d")?.drawImage(img, 0, 0, 1024, 1024);
        flat = c;
        import("../lib/medal3d")
          .then(({ createMedal3D }) => {
            if (!closed) medal = createMedal3D("gold", FRAMES.boss, METALS.gold.rim[1]!, c);
          })
          .catch(() => {
            // No 3D: the flat medal stays.
          });
      };
    }
    const drawMedal: DrawMedal = (c, x, y, r, t, tilt) => {
      const dt = t - BOSS_SHOW.land;
      if (medal) {
        const size = r * 4.9;
        const flash = dt > 0 && dt < 1.5 ? 3 * Math.exp(-dt * 3) : 0;
        const frame = medal.render(t, tilt, Math.round(size * dpr), {
          key: 1.4 + flash,
          fill: 1.2,
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
    const painter = new ShowPainter(ctx, BOSS_SHOW, drawMedal, still, { name, maxHp: maxHpXp });
    const start = performance.now();
    let raf = 0;
    const frame = () => {
      const t = still
        ? BOSS_SHOW.land + 2
        : Math.min((performance.now() - start) / 1000, BOSS_SHOW.end + LINGER);
      const el = ctx.canvas;
      const W = el.clientWidth;
      const H = el.clientHeight;
      if (W && H) {
        dpr = Math.min(2, window.devicePixelRatio || 1);
        if (el.width !== Math.round(W * dpr) || el.height !== Math.round(H * dpr)) {
          el.width = Math.round(W * dpr);
          el.height = Math.round(H * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        painter.draw(t, W, H);
      }
      // Frames stop once the show is over; its last frame stays up.
      if (!still && t < BOSS_SHOW.end + LINGER) raf = requestAnimationFrame(frame);
    };
    // Rotating the phone resizes the canvas, so the frame is drawn again to fit.
    const redraw = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    };
    redraw();
    window.addEventListener("resize", redraw);
    return () => {
      closed = true;
      window.removeEventListener("resize", redraw);
      cancelAnimationFrame(raf);
      medal?.dispose();
    };
  }, [name, maxHpXp]);

  return (
    <div
      className="unlock theme-dark"
      data-tier="boss"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={{ "--land": `${BOSS_SHOW.land + 0.45}s` } as CSSProperties}
      onClick={onDismiss}
    >
      <canvas ref={canvas} className="unlock-canvas" aria-hidden="true" />
      <div ref={art} hidden>
        <BadgeMedal badge={SLAYER} size={512} />
      </div>
      <div className="unlock-text">
        <span className="unlock-eyebrow">Boss defeated!</span>
        <h2 id={titleId} className="unlock-name">
          {name}
        </h2>
        <p className="unlock-desc">
          The room defeated {name}.
          {boss.lootXp > 0 && ` Everyone who pitched in earned +${boss.lootXp} XP.`}
        </p>
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

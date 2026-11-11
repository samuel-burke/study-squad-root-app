import type { BossDto } from "@studyroom/core";
import { useEffect, useId, useRef, type CSSProperties } from "react";
import { BOSS_SHOW, ShowPainter } from "../lib/unlockShow";

/** Seconds the moment stays up after the music ends, before moving on by itself. */
const LINGER = 1.5;

/** How long the moment stays up, in milliseconds, before moving on by itself. */
export const BOSS_SHOW_MS = Math.round((BOSS_SHOW.end + LINGER) * 1000);

/**
 * The full-screen moment when the room defeats the weekly boss: its card
 * shakes as the last hit drains its HP, shatters on the orchestra hit, and a
 * gold trophy rises (see lib/unlockShow.ts). The music is the boss event
 * sound, which starts at the same moment. It moves on by itself, or with a
 * tap anywhere, the button, or Escape.
 */
export function BossDefeated({ boss, onDismiss }: { boss: BossDto; onDismiss(): void }) {
  const titleId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    button.current?.focus();
    const timer = setTimeout(onDismiss, BOSS_SHOW_MS);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDismiss();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [onDismiss]);

  const { name, maxHpXp } = boss;
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    // With reduced motion there is no cinematic: the trophy is drawn once, still.
    const still =
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const painter = new ShowPainter(ctx, BOSS_SHOW, () => {}, still, { name, maxHp: maxHpXp });
    const start = performance.now();
    let raf = 0;
    const frame = () => {
      const t = still ? BOSS_SHOW.land + 2 : (performance.now() - start) / 1000;
      const el = ctx.canvas;
      const W = el.clientWidth;
      const H = el.clientHeight;
      if (W && H) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (el.width !== Math.round(W * dpr) || el.height !== Math.round(H * dpr)) {
          el.width = Math.round(W * dpr);
          el.height = Math.round(H * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        painter.draw(t, W, H);
      }
      // Frames stop once the moment would have closed by itself.
      if (!still && t < BOSS_SHOW.end + LINGER) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
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

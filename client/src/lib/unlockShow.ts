import type { BadgeTier } from "@studyroom/core";

/**
 * The cinematic behind a badge unlock, drawn on a canvas frame by frame and
 * timed to the tier's sound (see clips.ts). Each tier builds up its own way
 * until `land`, when the music hits and the medal arrives with a flash,
 * light rays, shockwaves and sparks. Embers drift until `end`. The weekly
 * boss going down (BOSS_SHOW) uses the same stage.
 */
export type Build =
  /** The medal is there from the start (bronze). */
  | "none"
  /** Light gathers in the dark, then the medal appears on the hit (silver). */
  | "gather"
  /** The medal rises from below, spinning faster and faster (gold). */
  | "herald"
  /** The medal comes down a beam of light (platinum). */
  | "beam"
  /** Stars trace the gem's outline, then collapse into the medal (secret). */
  | "constellation"
  /** The weekly boss's card shakes as its HP drains, shatters, and a trophy rises. */
  | "boss";

export interface Show {
  /** Seconds until the music hits and the medal lands. */
  land: number;
  /** Seconds until the music ends. */
  end: number;
  build: Build;
  /** Dark, mid and light colours of the tier's metal. */
  colors: [string, string, string];
  shake: number;
  sparks: number;
  rings: number;
  /** Platinum and secret: brighter rays, more embers and a full flash. */
  legendary: boolean;
}

export const SHOWS: Record<BadgeTier, Show> = {
  bronze: {
    land: 0.06,
    end: 4.9,
    build: "none",
    colors: ["#6e3d1b", "#c27a3e", "#f6c08c"],
    shake: 3,
    sparks: 24,
    rings: 1,
    legendary: false,
  },
  silver: {
    land: 4.1,
    end: 6.4,
    build: "gather",
    colors: ["#6c7686", "#c9d3e2", "#ffffff"],
    shake: 5,
    sparks: 40,
    rings: 2,
    legendary: false,
  },
  gold: {
    land: 2.38,
    end: 11.4,
    build: "herald",
    colors: ["#8f600a", "#f3b52d", "#fff0b0"],
    shake: 7,
    sparks: 60,
    rings: 3,
    legendary: false,
  },
  platinum: {
    land: 6,
    end: 12,
    build: "beam",
    colors: ["#4c8a9b", "#9edcec", "#f2fdff"],
    shake: 11,
    sparks: 90,
    rings: 4,
    legendary: true,
  },
  secret: {
    land: 6,
    end: 12,
    build: "constellation",
    colors: ["#4a259c", "#a77bff", "#f1e6ff"],
    shake: 11,
    sparks: 90,
    rings: 4,
    legendary: true,
  },
};

/** The weekly boss going down, timed to its clip (see clips.ts). */
export const BOSS_SHOW: Show = {
  land: 2.5,
  end: 15.4,
  build: "boss",
  colors: ["#8a1f1f", "#e04848", "#ffd2a8"],
  shake: 12,
  sparks: 80,
  rings: 3,
  legendary: false,
};

/** Draws the medal centred on (x, y) with radius r, turned `tilt` radians about its vertical axis. */
export type DrawMedal = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  t: number,
  tilt: number,
) => void;

export const clamp = (x: number) => Math.min(1, Math.max(0, x));
export const ease = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
const hex = (c: string, a: number) =>
  c +
  Math.round(clamp(a) * 255)
    .toString(16)
    .padStart(2, "0");

function canvas(size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c;
}

/** Points of the secret gem's outline and facets on its 64 by 64 grid, and the lines between them. */
const STARS = [
  [18, 5],
  [25, 5],
  [32, 5],
  [39, 5],
  [46, 5],
  [53.5, 14],
  [61, 23],
  [53.5, 33],
  [46, 42],
  [39, 51.5],
  [32, 61],
  [25, 51.5],
  [18, 42],
  [10.5, 33],
  [3, 23],
  [10.5, 14],
  [25, 23],
  [32, 23],
  [39, 23],
  [32, 40],
] as const;
const LINKS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [8, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [12, 13],
  [13, 14],
  [14, 15],
  [15, 0],
  [14, 16],
  [16, 17],
  [17, 18],
  [18, 6],
  [0, 16],
  [16, 2],
  [2, 18],
  [18, 4],
  [16, 19],
  [19, 18],
  [19, 10],
] as const;

/**
 * Paints one show onto a canvas. Glow sprites and film grain are made once
 * and reused every frame.
 */
export class ShowPainter {
  private sprites = new Map<string, HTMLCanvasElement>();
  private grain: HTMLCanvasElement;
  private seed = 7;

  constructor(
    private ctx: CanvasRenderingContext2D,
    private show: Show,
    private medal: DrawMedal,
    private reduceMotion: boolean,
    /** The boss's name and full HP, for the boss show's card. */
    private boss?: { name: string; maxHp: number },
  ) {
    this.grain = canvas(160);
    const g = this.grain.getContext("2d");
    if (g) {
      const d = g.createImageData(160, 160);
      for (let i = 0; i < d.data.length; i += 4) {
        const v = Math.random() * 255;
        d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
        d.data[i + 3] = 255;
      }
      g.putImageData(d, 0, 0);
    }
  }

  /** A repeatable random number, so each frame scatters things the same way. */
  private rnd(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }

  private glow(c: string): HTMLCanvasElement {
    let s = this.sprites.get(c);
    if (s) return s;
    s = canvas(64);
    const g = s.getContext("2d");
    if (g) {
      const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, "#ffffff");
      r.addColorStop(0.18, hex(c, 0.9));
      r.addColorStop(0.5, hex(c, 0.25));
      r.addColorStop(1, hex(c, 0));
      g.fillStyle = r;
      g.fillRect(0, 0, 64, 64);
    }
    this.sprites.set(c, s);
    return s;
  }

  private dot(x: number, y: number, r: number, c: string, a: number): void {
    if (a <= 0 || r <= 0) return;
    this.ctx.globalAlpha = Math.min(1, a);
    this.ctx.drawImage(this.glow(c), x - r, y - r, r * 2, r * 2);
  }

  /** Draws the frame `t` seconds into the show, on a W by H (CSS pixel) canvas. */
  draw(t: number, W: number, H: number): void {
    const { ctx, show: s } = this;
    const [c0, c1, c2] = s.colors;
    this.seed = 7;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    const cx = W / 2;
    const cy = H * 0.36;
    const R = Math.min(W, H) * 0.13;
    const L = s.land;
    const dt = t - L;
    const bp = s.build === "none" ? 1 : clamp(t / L);
    const big = Math.max(W, H);

    ctx.fillStyle = "#050409";
    ctx.fillRect(0, 0, W, H);

    // Drifting haze, and a glow that grows behind the medal.
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 4; i++) {
      const hx = W * (0.2 + 0.6 * this.rnd()) + Math.sin(t * 0.15 + i) * W * 0.05;
      const hy = H * (0.3 + 0.5 * this.rnd());
      const hr = big * (0.35 + 0.2 * this.rnd());
      const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
      g.addColorStop(0, hex(c0, 0.1 + (dt > 0 ? 0.06 : bp * 0.05)));
      g.addColorStop(1, hex(c0, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    const lvl = dt < 0 ? bp * bp * 0.5 : Math.max(0.35, 1.1 - dt * 0.35);
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 5);
    cg.addColorStop(0, hex(c1, 0.35 * lvl));
    cg.addColorStop(1, hex(c1, 0));
    ctx.fillStyle = cg;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";

    // A slow push in during the build, and a shake on the hit.
    ctx.save();
    let zoom = 1;
    let sx = 0;
    let sy = 0;
    if (!this.reduceMotion) {
      zoom = dt < 0 ? 1 + 0.05 * ease(bp) : 1 + 0.05 * Math.exp(-dt * 5);
      if (dt >= 0 && dt < 0.7) {
        const a = s.shake * 0.45 * Math.exp(-dt * 6);
        sx = Math.sin(t * 63) * a;
        sy = Math.cos(t * 51) * a;
      }
    }
    ctx.translate(cx + sx, cy + sy);
    ctx.scale(zoom, zoom);
    ctx.translate(-cx, -cy);
    ctx.globalCompositeOperation = "lighter";

    // Light rays turning slowly behind the medal.
    if (dt > 0 && s.build !== "none") {
      const a = clamp(dt / 1.2) * (s.legendary ? 1 : 0.7);
      const len = big * 0.9;
      for (const layer of [0, 1]) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(t * (layer ? -0.05 : 0.08));
        const n = layer ? 7 : 11;
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2 + this.rnd() * 0.3;
          const w = 0.04 + this.rnd() * 0.09;
          const g = ctx.createRadialGradient(0, 0, R * 0.6, 0, 0, len);
          g.addColorStop(0, hex(c2, (0.1 + this.rnd() * 0.08) * a));
          g.addColorStop(0.35, hex(c1, 0.05 * a));
          g.addColorStop(1, hex(c1, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, len, ang - w, ang + w);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // Motes of light drawn in towards the middle during the build.
    if (s.build !== "none" && s.build !== "boss" && dt < 0) {
      const n = s.legendary ? 120 : 80;
      for (let i = 0; i < n; i++) {
        const born = this.rnd() * L * 0.95;
        const life = 1.4 + this.rnd();
        const ang = this.rnd() * 7;
        const d0 = big * (0.4 + this.rnd() * 0.35);
        const size = 1.2 + this.rnd() * 2.6;
        const p = (t - born) / life;
        if (p > 0 && p < 1) {
          const d = d0 * (1 - ease(p));
          const a = ang + p * 1.2;
          this.dot(
            cx + Math.cos(a) * d,
            cy + Math.sin(a) * d,
            size * 3,
            c2,
            Math.sin(p * Math.PI) * (0.4 + bp * 0.6),
          );
        }
      }
    }

    if (s.build === "beam") this.beam(t, cx, R, H);

    // Shockwaves.
    for (let i = 0; i < s.rings; i++) {
      const rt = dt - i * 0.14;
      if (rt > 0 && rt < 1.4) {
        const rr = R * (1 + ease(rt / 1.4) * 4.5);
        const a = (1 - rt / 1.4) * 0.3;
        const g = ctx.createRadialGradient(cx, cy, rr * 0.7, cx, cy, rr);
        g.addColorStop(0, hex(c1, 0));
        g.addColorStop(0.8, hex(c2, a));
        g.addColorStop(1, hex(c2, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, 7);
        ctx.fill();
      }
    }

    // Spark streaks thrown out by the hit.
    ctx.lineCap = "round";
    for (let i = 0; i < s.sparks; i++) {
      const ang = this.rnd() * 7;
      const sp = R * (2.2 + this.rnd() * 4);
      const life = 0.6 + this.rnd() * 0.7;
      const p = dt / life;
      if (p > 0 && p < 1) {
        const d = sp * ease(p);
        const d2 = sp * ease(Math.max(0, p - 0.08));
        ctx.globalAlpha = 1;
        ctx.strokeStyle = hex(i % 3 ? c2 : "#ffffff", (1 - p) * 0.9);
        ctx.lineWidth = 1.6 * (1 - p) + 0.4;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * d2, cy + Math.sin(ang) * d2);
        ctx.lineTo(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d + p * p * R * 0.6);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    if (s.build === "boss") this.bossFight(t, cx, cy, R);
    else this.subject(t, cx, cy, R, H);

    // Embers rising, with a few soft out-of-focus ones.
    if (dt > 0) {
      ctx.globalCompositeOperation = "lighter";
      const n = s.legendary
        ? 110
        : s.build === "herald" || s.build === "boss"
          ? 80
          : s.build === "gather"
            ? 40
            : 20;
      for (let i = 0; i < n; i++) {
        const x0 = this.rnd() * W;
        const delay = this.rnd() * 2.5;
        const speed = H * (0.04 + this.rnd() * 0.12);
        const size = 1 + this.rnd() * 2.4;
        const ph = this.rnd() * 7;
        const bokeh = this.rnd() < 0.12;
        const et = dt - delay + (i < n * 0.4 ? 2.5 : 0);
        const y0 = H * (0.95 - this.rnd() * 0.5);
        if (et <= 0) continue;
        // An ember that leaves the top starts again at the bottom, so long shows stay lit.
        const rise = et % ((y0 + 20) / speed);
        const y = y0 - rise * speed;
        const x = x0 + Math.sin(et * 0.8 + ph) * W * 0.02;
        const fade = Math.min(1, rise * 1.5) * clamp((s.end - t) * 1.2 + 0.3);
        const flicker = 0.6 + 0.4 * Math.sin(t * 6 + ph);
        if (bokeh) this.dot(x, y, size * 9, c1, 0.08 * fade);
        else this.dot(x, y, size * 3, i % 4 ? c2 : c1, 0.85 * fade * flicker);
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // A bloom flash and a wide lens flare on the hit.
    if (dt >= 0 && dt < 1) {
      ctx.globalCompositeOperation = "lighter";
      const st = s.legendary ? 1 : s.build === "none" ? 0.45 : s.build === "herald" ? 0.5 : 0.75;
      const a = st * Math.exp(-dt * 4.5);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, big * 0.8);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(0.35, hex(c2, a * 0.5));
      g.addColorStop(1, hex(c1, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const fa = st * Math.exp(-dt * 2.2);
      const fg = ctx.createLinearGradient(0, 0, W, 0);
      fg.addColorStop(0, hex(c1, 0));
      fg.addColorStop(0.5, `rgba(255,255,255,${fa})`);
      fg.addColorStop(1, hex(c1, 0));
      ctx.fillStyle = fg;
      ctx.fillRect(0, cy - 1.5, W, 3);
      ctx.globalCompositeOperation = "source-over";
    }

    // Vignette and film grain.
    const v = ctx.createRadialGradient(cx, H * 0.5, Math.min(W, H) * 0.35, cx, H * 0.5, big * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,.7)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
    const pattern = ctx.createPattern(this.grain, "repeat");
    if (pattern) {
      ctx.save();
      ctx.globalAlpha = 0.05;
      ctx.globalCompositeOperation = "overlay";
      ctx.fillStyle = pattern;
      ctx.translate((t * 997) % 160, (t * 571) % 160);
      ctx.fillRect(-160, -160, W + 320, H + 320);
      ctx.restore();
    }
  }

  /** Platinum's beam of light: it widens through the build, then fades after the hit. */
  private beam(t: number, cx: number, R: number, H: number): void {
    const { ctx, show: s } = this;
    const [, c1, c2] = s.colors;
    const L = s.land;
    const dt = t - L;
    const bp = clamp(t / L);
    const bw =
      dt < 0
        ? t > L - 0.4
          ? R * 0.08
          : R * (0.12 + bp * 1.1)
        : Math.max(0, R * 1.4 * Math.exp(-dt * 1.4));
    const ba = dt < 0 ? 0.18 + bp * 0.45 : 0.8 * Math.exp(-dt * 1.2);
    if (bw <= 0.5 || ba <= 0.01) return;
    ctx.globalAlpha = 1;
    const g = ctx.createLinearGradient(cx - bw, 0, cx + bw, 0);
    g.addColorStop(0, hex(c1, 0));
    g.addColorStop(0.5, hex(c2, ba));
    g.addColorStop(1, hex(c1, 0));
    ctx.fillStyle = g;
    ctx.fillRect(cx - bw, -H, bw * 2, H * 3);
    const core = ctx.createLinearGradient(cx - bw * 0.15, 0, cx + bw * 0.15, 0);
    core.addColorStop(0, "rgba(255,255,255,0)");
    core.addColorStop(0.5, `rgba(255,255,255,${ba * 0.8})`);
    core.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = core;
    ctx.fillRect(cx - bw * 0.15, -H, bw * 0.3, H * 3);
  }

  /** The medal itself, moving the way its tier's build calls for. */
  private subject(t: number, cx: number, cy: number, R: number, H: number): void {
    const { ctx, show: s } = this;
    const L = s.land;
    const dt = t - L;
    const bp = clamp(t / L);
    let my = cy + (dt > 0 ? Math.sin(dt * 1.6) * R * 0.04 : 0);
    let mr = R;
    let show = true;
    let tilt = dt > 0 ? Math.sin(dt * 0.8) * 0.55 : 0;
    if (s.build === "none") mr = R * (0.6 + 0.4 * ease(t / 0.4));
    if (s.build === "gather") {
      if (dt < 0) show = false;
      else mr = R * (1 + 0.35 * Math.exp(-dt * 9));
    }
    if (s.build === "herald") {
      if (dt < 0) {
        my = cy + H * 0.3 * (1 - ease(bp));
        mr = R * (0.55 + 0.45 * ease(bp));
        tilt = Math.PI * 4 * bp * bp;
      } else tilt += Math.PI * 2 * ease((dt - 3.4) / 1.6);
    }
    if (s.build === "beam" && dt < 0) {
      const p = ease((t - 0.8) / (L - 0.8));
      my = cy - H * 0.7 * (1 - p);
      mr = R * (0.8 + 0.2 * p);
      show = t > 0.8;
    }
    if (s.build === "constellation") {
      this.constellation(t, cx, cy, R);
      if (dt < 0) show = false;
      else mr = R * (0.4 + 0.6 * ease(dt / 0.35));
    }
    if (!show) return;
    const a = s.build === "none" ? clamp(t / 0.15) : 1;
    ctx.globalCompositeOperation = "lighter";
    this.dot(cx, my, mr * 2.6, s.colors[1], (dt > 0 ? 0.55 : 0.35) * a);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = a;
    // A soft shadow on the "floor".
    ctx.save();
    const sh = ctx.createRadialGradient(cx, my + mr * 1.35, 0, cx, my + mr * 1.35, mr * 1.1);
    sh.addColorStop(0, "rgba(0,0,0,.6)");
    sh.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sh;
    ctx.translate(cx, my + mr * 1.35);
    ctx.scale(1, 0.22);
    ctx.beginPath();
    ctx.arc(0, 0, mr * 1.1, 0, 7);
    ctx.fill();
    ctx.restore();
    this.medal(ctx, cx, my, mr, t, tilt);
    // A glint across the medal every few seconds.
    if (dt > 0.6) {
      const gp = ((dt - 0.6) % 3.2) / 0.5;
      if (gp < 1) this.glint(cx + mr * 0.62, my - mr * 0.62, mr * 0.55, Math.sin(gp * Math.PI));
    }
    ctx.globalAlpha = 1;
  }

  /**
   * The boss show: its card shakes harder as the last hit drains the HP bar,
   * breaks apart on the hit, and a gold trophy rises in its place.
   */
  private bossFight(t: number, cx: number, cy: number, R: number): void {
    const { ctx, show: s } = this;
    const [c0, c1] = s.colors;
    const L = s.land;
    const dt = t - L;
    ctx.globalAlpha = 1;
    if (dt < 0) {
      const p = clamp(t / L);
      const a = this.reduceMotion ? 0 : 1 + p * p * 5;
      const bx = cx + Math.sin(t * 55) * a;
      const by = cy + Math.cos(t * 43) * a * 0.5;
      const w = R * 3.4;
      const h = R * 2.1;
      ctx.save();
      ctx.shadowColor = hex(c1, 0.4 + p * 0.4);
      ctx.shadowBlur = 20 + p * 30;
      const bg = ctx.createLinearGradient(0, by - h / 2, 0, by + h / 2);
      bg.addColorStop(0, "#1e1519");
      bg.addColorStop(1, "#120c10");
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.roundRect(bx - w / 2, by - h / 2, w, h, 10);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = hex(c1, 0.6);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(bx - w / 2, by - h / 2, w, h, 10);
      ctx.stroke();
      ctx.fillStyle = "#f2eef4";
      ctx.textAlign = "center";
      ctx.font = `600 ${R * 0.3}px "Space Grotesk", sans-serif`;
      ctx.fillText(this.boss?.name ?? "", bx, by - h * 0.1, w * 0.9);
      // The last hit takes the final sliver of HP.
      const hp = Math.max(0, 0.18 * (1 - ease((t - 0.4) / (L - 0.5))));
      ctx.fillStyle = "#2a1a20";
      ctx.fillRect(bx - w * 0.4, by + h * 0.08, w * 0.8, R * 0.12);
      const hg = ctx.createLinearGradient(bx - w * 0.4, 0, bx + w * 0.4, 0);
      hg.addColorStop(0, c0);
      hg.addColorStop(1, c1);
      ctx.fillStyle = hg;
      ctx.fillRect(bx - w * 0.4, by + h * 0.08, w * 0.8 * hp, R * 0.12);
      ctx.fillStyle = "#a99aa6";
      ctx.font = `500 ${R * 0.15}px Inter, sans-serif`;
      const left = Math.ceil(hp * (this.boss?.maxHp ?? 0));
      ctx.fillText(`${left.toLocaleString()} HP left`, bx, by + h * 0.36);
      return;
    }
    this.shards(cx, cy, R * 1.4, dt, "#1e1519", c1);
    const p = ease((dt - 0.25) / 0.8);
    if (p <= 0) return;
    const tx = cx;
    const ty = cy + R * (1 - p) * 1.2 + Math.sin(dt * 1.6) * R * 0.04;
    ctx.globalCompositeOperation = "lighter";
    this.dot(tx, ty, R * 2.4, "#f3b52d", 0.45 * p);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = p;
    const gold = ctx.createConicGradient(t * 0.35, tx, ty - R * 0.3);
    const stops = ["#7a5208", "#fff1c2", "#e2a72a", "#7a5208", "#fff1c2", "#e2a72a", "#7a5208"];
    stops.forEach((c, i) => gold.addColorStop(i / (stops.length - 1), c));
    // Handles, cup, stem and base.
    ctx.lineWidth = R * 0.09;
    ctx.strokeStyle = gold;
    ctx.beginPath();
    ctx.arc(tx - R * 0.72, ty - R * 0.45, R * 0.27, Math.PI * 0.5, Math.PI * 1.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(tx + R * 0.72, ty - R * 0.45, R * 0.27, -Math.PI * 0.5, Math.PI * 0.5);
    ctx.stroke();
    const cup = () => {
      ctx.beginPath();
      ctx.moveTo(tx - R * 0.72, ty - R * 0.82);
      ctx.lineTo(tx + R * 0.72, ty - R * 0.82);
      ctx.quadraticCurveTo(tx + R * 0.68, ty + R * 0.15, tx, ty + R * 0.3);
      ctx.quadraticCurveTo(tx - R * 0.68, ty + R * 0.15, tx - R * 0.72, ty - R * 0.82);
    };
    ctx.fillStyle = gold;
    cup();
    ctx.fill();
    ctx.fillRect(tx - R * 0.09, ty + R * 0.28, R * 0.18, R * 0.34);
    const base = ctx.createLinearGradient(0, ty + R * 0.6, 0, ty + R * 0.8);
    base.addColorStop(0, "#3a2a12");
    base.addColorStop(1, "#1a120a");
    ctx.fillStyle = base;
    ctx.fillRect(tx - R * 0.5, ty + R * 0.6, R, R * 0.2);
    ctx.fillStyle = "#e2a72a";
    ctx.fillRect(tx - R * 0.5, ty + R * 0.6, R, R * 0.025);
    const shine = ctx.createLinearGradient(tx - R * 0.7, 0, tx + R * 0.7, 0);
    shine.addColorStop(0, "rgba(255,255,255,0)");
    shine.addColorStop(0.3, "rgba(255,255,255,.35)");
    shine.addColorStop(0.38, "rgba(255,255,255,0)");
    ctx.fillStyle = shine;
    cup();
    ctx.fill();
    ctx.globalAlpha = 1;
    if (dt > 1) {
      const gp = ((dt - 1) % 3) / 0.5;
      if (gp < 1) this.glint(tx + R * 0.5, ty - R * 0.7, R * 0.5, Math.sin(gp * Math.PI));
    }
  }

  /** Pieces of the boss card flying apart. */
  private shards(cx: number, cy: number, R: number, dt: number, c1: string, c2: string): void {
    const { ctx } = this;
    if (dt > 1.6) return;
    for (let i = 0; i < 26; i++) {
      const ang = this.rnd() * 7;
      const sp = R * (1.4 + this.rnd() * 3.4);
      const rot = this.rnd() * 8 - 4;
      const size = 0.5 + this.rnd() * 0.8;
      const d = sp * ease(dt / 1.6);
      ctx.save();
      ctx.translate(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d + dt * dt * R * 0.9);
      ctx.rotate(rot * dt);
      ctx.globalAlpha = 1 - dt / 1.6;
      const g = ctx.createLinearGradient(-R * 0.15, -R * 0.15, R * 0.15, R * 0.15);
      g.addColorStop(0, "#6d6782");
      g.addColorStop(1, c1);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -R * 0.2 * size);
      ctx.lineTo(R * 0.13 * size, R * 0.1 * size);
      ctx.lineTo(-R * 0.11 * size, R * 0.13 * size);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = hex(c2, 0.8);
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private glint(x: number, y: number, size: number, a: number): void {
    const { ctx } = this;
    if (a <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = a;
    const g = ctx.createLinearGradient(x - size, y, x + size, y);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, "#fff");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - size, y - 0.8, size * 2, 1.6);
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 2);
    ctx.fillRect(-size * 0.6, -0.8, size * 1.2, 1.6);
    ctx.restore();
    this.dot(x, y, size * 0.35, "#ffffff", a);
  }

  /** Secret: stars light up one by one and link into the gem, then pull in to become the medal. */
  private constellation(t: number, cx: number, cy: number, R: number): void {
    const { ctx, show: s } = this;
    const L = s.land;
    const dt = t - L;
    const pull = dt > 0 ? ease(dt / 0.35) : 0;
    if (pull >= 1) return;
    const scale = (R * 1.25) / 30;
    const P = STARS.map(([x, y]) => {
      const px = cx + (x - 32) * scale;
      const py = cy + (y - 32) * scale;
      return [px + (cx - px) * pull, py + (cy - py) * pull] as const;
    });
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 1;
    LINKS.forEach(([a, b], i) => {
      const e = clamp((t - (0.5 + (i * (L - 1.2)) / LINKS.length)) / 0.4);
      if (e <= 0) return;
      const [x1, y1] = P[a]!;
      const [x2, y2] = P[b]!;
      ctx.strokeStyle = hex("#c9b3ff", 0.55 * (1 - pull));
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 + (x2 - x1) * e, y1 + (y2 - y1) * e);
      ctx.stroke();
    });
    P.forEach(([x, y], i) => {
      const a = clamp((t - (0.2 + (i * (L - 1.5)) / P.length)) / 0.3);
      this.dot(x, y, 6 + 4 * Math.sin(t * 3 + i), "#f1e6ff", a * (1 - pull * 0.5));
    });
    ctx.restore();
  }
}

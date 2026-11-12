import type { Tier } from "@studyroom/core";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/**
 * A color tier's ring badge as a glass neon tube for its unlock: it starts in
 * pitch black, the gas fills the tube clockwise like the study clock, flickers
 * on, and blooms. Timed to sounds/tier.mp3. Loaded only when a tier unlocks,
 * and the unlock falls back to the still picture without hardware WebGL.
 */

/** The neon color and glow strength of each tier's ring (matches styles.css). */
const NEON: Record<string, { color: string; glow: number }> = {
  ember: { color: "#ff7a1a", glow: 0.35 },
  blaze: { color: "#ff2e63", glow: 0.5 },
  nebula: { color: "#a45cff", glow: 0.65 },
  supernova: { color: "#ff3fd2", glow: 0.8 },
  starlight: { color: "#e9f2ff", glow: 0.6 },
};

/** Seconds of darkness, then of filling. The flicker follows, and the ring lands at 2.88 s. */
const DARK = 0.6;
const FILL = 1.8;
const FLICKER = [1, 0.15, 1, 0.1, 0.9, 0.25, 1, 1];
const FLICKER_STEP = 0.06;

const R = 1.05;

export interface Ring3D {
  canvas: HTMLCanvasElement;
  /** Draws the unlock `t` seconds in, on a canvas `w` by `h` CSS pixels. */
  draw(t: number, w: number, h: number): void;
  dispose(): void;
}

/** The dial: tick marks, the hours, and the tier's name. */
function dial(tier: Tier, color: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 1024;
  const x = c.getContext("2d");
  if (!x) return c;
  const face = x.createRadialGradient(512, 470, 40, 512, 512, 520);
  face.addColorStop(0, "#1d2436");
  face.addColorStop(1, "#080b12");
  x.fillStyle = face;
  x.fillRect(0, 0, 1024, 1024);
  x.strokeStyle = "rgba(150,165,200,.35)";
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const big = i % 5 === 0;
    x.lineWidth = big ? 7 : 3;
    x.beginPath();
    x.moveTo(512 + Math.sin(a) * (big ? 300 : 318), 512 - Math.cos(a) * (big ? 300 : 318));
    x.lineTo(512 + Math.sin(a) * 340, 512 - Math.cos(a) * 340);
    x.stroke();
  }
  x.textAlign = "center";
  x.fillStyle = "#eef2fa";
  x.font = `800 ${tier.hours >= 1000 ? 150 : 180}px system-ui, sans-serif`;
  x.fillText(`${tier.hours}h`, 512, 560);
  x.fillStyle = color;
  x.font = "700 56px system-ui, sans-serif";
  x.fillText(tier.name.toUpperCase().split("").join(" "), 512, 660);
  return c;
}

export function createRing3D(tier: Tier): Ring3D | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, failIfMajorPerformanceCaveat: true });
  } catch {
    return null;
  }
  // Software rendering is too slow for the glass and bloom (see medal3d.ts).
  const gl = renderer.getContext();
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const name = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "");
  if (/swiftshader|llvmpipe|softpipe|software/i.test(name)) {
    renderer.dispose();
    renderer.forceContextLoss();
    return null;
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const neon = NEON[tier.id] ?? { color: "#ffffff", glow: 0.5 };
  const color = new THREE.Color(neon.color);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  const key = new THREE.DirectionalLight(0xffffff, 0);
  key.position.set(-2, 3, 4);
  scene.add(key);

  const ring = new THREE.Group();
  scene.add(ring);
  const dark = new THREE.MeshStandardMaterial({ color: "#0b0e16" });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.32, 1.36, 0.16, 128), [
    new THREE.MeshStandardMaterial({ color: "#1a2030", metalness: 0.9, roughness: 0.35 }),
    dark,
    dark,
  ]);
  body.rotation.x = Math.PI / 2;
  body.position.z = -0.2;
  ring.add(body);
  const texture = new THREE.CanvasTexture(dial(tier, neon.color));
  texture.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(1.3, 128),
    new THREE.MeshStandardMaterial({ map: texture, metalness: 0.2, roughness: 0.6 }),
  );
  face.position.z = -0.115;
  ring.add(face);
  const metal = new THREE.MeshStandardMaterial({ color: "#2b3346", metalness: 1, roughness: 0.25 });
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(1.34, 0.05, 32, 200), metal);
  bezel.position.z = -0.12;
  ring.add(bezel);
  ring.add(
    new THREE.Mesh(
      new THREE.TorusGeometry(R, 0.115, 64, 256),
      new THREE.MeshPhysicalMaterial({
        roughness: 0.04,
        transmission: 1,
        thickness: 0.04,
        ior: 1.15,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
      }),
    ),
  );
  for (const deg of [45, 135, 225, 315]) {
    const a = (deg * Math.PI) / 180;
    const clip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.36, 0.1), metal);
    clip.position.set(Math.sin(a) * R, Math.cos(a) * R, -0.1);
    clip.rotation.z = -a;
    ring.add(clip);
  }
  // Starlight is white, so it needs less light to look as bright.
  const strength = tier.id === "starlight" ? 0.45 : 1;
  const gas = new THREE.MeshStandardMaterial({ color: 0, emissive: color });
  const core = new THREE.MeshStandardMaterial({
    color: 0,
    emissive: color.clone().lerp(new THREE.Color(0xffffff), 0.55),
  });
  const tubes: THREE.Mesh[] = [];
  let filled = -1;
  /** The lit gas, `a` radians of it, starting at 12 o'clock and going clockwise. */
  const fill = (a: number) => {
    if (Math.abs(a - filled) < 0.001) return;
    filled = a;
    for (const t of tubes.splice(0)) {
      ring.remove(t);
      t.geometry.dispose();
    }
    for (const [radius, material] of [
      [0.05, gas],
      [0.02, core],
    ] as const) {
      const t = new THREE.Mesh(
        new THREE.TorusGeometry(R, radius, 16, 256, Math.max(a, 0.0001)),
        material,
      );
      t.rotation.z = Math.PI / 2;
      t.scale.x = -1;
      ring.add(t);
      tubes.push(t);
    }
  };
  const glow = new THREE.PointLight(color, 0, 3, 2);
  glow.position.set(0, 0, 0.3);
  ring.add(glow);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomBase = 0.35 + neon.glow * 0.75;
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), bloomBase, 0.45, 0.7);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  return {
    canvas: renderer.domElement,
    draw(t, w, h) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (renderer.domElement.width !== Math.round(w * dpr)) {
        renderer.setPixelRatio(dpr);
        renderer.setSize(w, h, false);
        composer.setPixelRatio(dpr);
        composer.setSize(w, h);
        camera.aspect = w / h;
        // Far enough back that the ring fits a narrow phone too.
        camera.position.set(0, -0.7, 7.4 * Math.max(1, 0.6 / camera.aspect));
        camera.lookAt(0, -0.35, 0);
        camera.updateProjectionMatrix();
      }
      const s = t - DARK;
      const k = Math.min(1, Math.max(0, s / FILL));
      const eased = 1 - (1 - k) ** 3;
      const after = s - FILL;
      const step = Math.floor(after / FLICKER_STEP);
      const on = s < 0 ? 0 : k < 1 ? 0.45 + 0.35 * eased : (FLICKER[step] ?? 1);
      fill(eased * Math.PI * 2);
      gas.emissiveIntensity = 1.8 * strength * on;
      core.emissiveIntensity = 2.6 * strength * on;
      glow.intensity = 0.7 * on;
      // The neon's own light shows the rest of the badge.
      const lit = s < 0 ? 0 : Math.min(1, eased * 1.1) * (k < 1 ? 1 : on);
      scene.environmentIntensity = 0.35 * lit;
      key.intensity = 0.6 * lit;
      const settle = Math.max(0, after - FLICKER.length * FLICKER_STEP);
      bloom.strength =
        bloomBase * (k < 1 ? 0.7 : on * (1 + (after > 0.48 ? 0.8 * Math.exp(-settle * 3) : 0)));
      const spin = Math.min(Math.max(s, 0), 6);
      ring.position.y = 0.25;
      ring.rotation.set(0.22 - spin * 0.02, -0.5 + spin * 0.1, 0);
      composer.render();
    },
    dispose() {
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          for (const m of [o.material].flat() as THREE.MeshStandardMaterial[]) {
            m.map?.dispose();
            m.dispose();
          }
        }
      });
      composer.dispose();
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

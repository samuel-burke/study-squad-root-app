import type { BadgeTier } from "@studyroom/core";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";

/**
 * A badge medal as a solid, minted 3D piece for the unlock show: its frame
 * shape extruded with a bevelled edge in metal, with the flat medal art laid
 * on the front and back. Loaded only when a badge unlocks (three.js is big),
 * and the show falls back to the flat art if WebGL isn't available.
 */
interface Build {
  /** Thickness, in the medal's 64-unit grid. */
  depth: number;
  bevel: number;
  roughness: number;
  /** A raised rim around the face, this tall. 0 for none. */
  ring: number;
  /** A larger, darker backplate at this scale. 0 for none. */
  plate: number;
}

// Harder tiers are thicker, shinier and more dressed up.
const BUILDS: Record<BadgeTier, Build> = {
  bronze: { depth: 3, bevel: 1, roughness: 0.42, ring: 0, plate: 0 },
  silver: { depth: 5, bevel: 1.5, roughness: 0.22, ring: 1.6, plate: 0 },
  gold: { depth: 5, bevel: 1.5, roughness: 0.22, ring: 1.6, plate: 0 },
  platinum: { depth: 8, bevel: 2.2, roughness: 0.08, ring: 2.2, plate: 1.16 },
  secret: { depth: 8, bevel: 2.2, roughness: 0.1, ring: 0, plate: 1.12 },
};

export interface Medal3D {
  /** Renders the medal turned `tilt` radians, and returns the canvas it drew on. */
  render(
    t: number,
    tilt: number,
    sizePx: number,
    light: { key: number; fill: number },
  ): HTMLCanvasElement;
  dispose(): void;
}

/**
 * Builds the medal. `frame` is the medal's outline as an SVG path on a 64 by
 * 64 grid, `metal` its tier's mid colour, and `art` the flat medal drawn on an
 * 88 by 88 box centred on that grid. Returns null without WebGL.
 */
export function createMedal3D(
  tier: BadgeTier,
  frame: string,
  metal: string,
  art: HTMLImageElement,
): Medal3D | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  } catch {
    return null;
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 1000);
  camera.position.set(0, 0, 180);
  // Lights are in physical units, so these are π times the old "legacy" values.
  const key = new THREE.DirectionalLight(0xffffff, 1.4 * Math.PI);
  key.position.set(-70, 90, 120);
  scene.add(key);
  const fill = new THREE.PointLight(new THREE.Color(metal), 0, 500, 0);
  fill.position.set(80, -50, 70);
  scene.add(fill);

  const b = BUILDS[tier];
  const color = new THREE.Color(metal);
  const outline = new SVGLoader()
    .parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${frame}"/></svg>`)
    .paths[0]!.toShapes()[0]!
    .getPoints(24)
    .map((p) => new THREE.Vector2(p.x - 32, 32 - p.y));
  const shape = (scale: number, turn = 0) =>
    new THREE.Shape(
      outline.map((p) => p.clone().rotateAround(new THREE.Vector2(), turn).multiplyScalar(scale)),
    );
  const extrude = (s: THREE.Shape, depth: number, bevel: number, segments = 5) =>
    new THREE.ExtrudeGeometry(s, {
      depth,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel * 0.85,
      bevelSegments: segments,
      curveSegments: 24,
    });
  const metalMaterial = (c: THREE.Color, roughness: number) =>
    new THREE.MeshStandardMaterial({ color: c, metalness: 1, roughness, envMapIntensity: 1.3 });

  const medal = new THREE.Group();
  const front = b.depth / 2 + b.bevel;
  const body = extrude(shape(1), b.depth, b.bevel);
  body.translate(0, 0, -b.depth / 2);
  medal.add(new THREE.Mesh(body, metalMaterial(color, b.roughness)));
  if (b.plate) {
    // Spiky frames turn the plate so its points show between the front ones.
    const plate = extrude(
      shape(b.plate, outline.length > 30 ? Math.PI / 20 : 0),
      b.depth * 0.5,
      1.2,
      3,
    );
    plate.translate(0, 0, -b.depth * 0.85);
    medal.add(new THREE.Mesh(plate, metalMaterial(color.clone().multiplyScalar(0.55), 0.3)));
  }
  if (b.ring) {
    const ring = shape(1);
    ring.holes.push(new THREE.Path(outline.map((p) => p.clone().multiplyScalar(0.84)).reverse()));
    const rim = extrude(ring, b.ring, 0.6, 3);
    rim.translate(0, 0, front - 0.2);
    medal.add(
      new THREE.Mesh(
        rim,
        metalMaterial(color.clone().lerp(new THREE.Color(1, 1, 1), 0.15), b.roughness * 0.8),
      ),
    );
  }

  const texture = new THREE.Texture(art);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  const face = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.03,
    metalness: 0.6,
    roughness: Math.max(0.2, b.roughness + 0.1),
    bumpMap: texture,
    bumpScale: 0.5,
    envMapIntensity: 1.1,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(88, 88), face);
  plane.position.z = front + 0.05;
  medal.add(plane);
  const back = new THREE.Mesh(plane.geometry, face);
  back.rotation.y = Math.PI;
  back.position.z = -(front + 0.05) - (b.plate ? b.depth * 0.6 : 0);
  medal.add(back);
  scene.add(medal);

  return {
    render(t, tilt, sizePx, light) {
      if (renderer.domElement.width !== sizePx) renderer.setSize(sizePx, sizePx, false);
      medal.rotation.set(Math.sin(t * 0.7) * 0.08, tilt, 0);
      key.intensity = light.key * Math.PI;
      fill.intensity = light.fill * Math.PI;
      renderer.render(scene, camera);
      return renderer.domElement;
    },
    dispose() {
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      texture.dispose();
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

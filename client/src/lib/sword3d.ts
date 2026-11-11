import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * The sword that rises when the room defeats the weekly boss: a steel blade
 * with a gold guard and pommel, lit like the badge medals (see medal3d.ts).
 * Loaded only when the boss goes down, and the boss show draws a flat sword
 * instead without hardware WebGL.
 */
export interface Sword3D {
  /** Renders the sword turned `tilt` radians, and returns the canvas it drew on. */
  render(tilt: number, sizePx: number, light: number): HTMLCanvasElement;
  dispose(): void;
}

/** Builds the sword, or returns null without hardware WebGL. */
export function createSword3D(): Sword3D | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      failIfMajorPerformanceCaveat: true,
    });
  } catch {
    return null;
  }
  // Software rendering is too slow for a frame every 16 ms (see medal3d.ts).
  const gl = renderer.getContext();
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const name = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "");
  if (/swiftshader|llvmpipe|softpipe|software/i.test(name)) {
    renderer.dispose();
    renderer.forceContextLoss();
    return null;
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(0, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 1000);
  camera.position.set(0, 0, 180);
  const key = new THREE.DirectionalLight(0xffffff, 1.4 * Math.PI);
  key.position.set(-70, 90, 120);
  scene.add(key);
  const warm = new THREE.PointLight(0xf3b52d, 1.2 * Math.PI, 500, 0);
  warm.position.set(80, -50, 70);
  scene.add(warm);

  const steel = new THREE.MeshStandardMaterial({ color: 0xe4eaf2, metalness: 1, roughness: 0.14 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xf3b52d, metalness: 1, roughness: 0.24 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x3a2418, metalness: 0, roughness: 0.7 });
  const sword = new THREE.Group();

  // Point up, about 80 units tall, centred on the middle of the frame.
  const blade = new THREE.Shape();
  blade.moveTo(-4.5, 0);
  blade.lineTo(4.5, 0);
  blade.lineTo(3.6, 54);
  blade.lineTo(0, 64);
  blade.lineTo(-3.6, 54);
  blade.closePath();
  const bladeGeometry = new THREE.ExtrudeGeometry(blade, {
    depth: 1.2,
    bevelEnabled: true,
    bevelThickness: 1.1,
    bevelSize: 1.2,
    bevelSegments: 3,
  });
  bladeGeometry.translate(0, -24, -0.6);
  sword.add(new THREE.Mesh(bladeGeometry, steel));
  const guard = new THREE.Mesh(new THREE.BoxGeometry(30, 4, 5), gold);
  guard.position.y = -26;
  sword.add(guard);
  for (const side of [-1, 1]) {
    const end = new THREE.Mesh(new THREE.SphereGeometry(3, 20, 14), gold);
    end.position.set(side * 15.5, -26, 0);
    sword.add(end);
  }
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 14, 20), grip);
  handle.position.y = -35;
  sword.add(handle);
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(4.2, 24, 16), gold);
  pommel.position.y = -44;
  sword.add(pommel);
  scene.add(sword);

  return {
    render(tilt, sizePx, light) {
      if (renderer.domElement.width !== sizePx) renderer.setSize(sizePx, sizePx, false);
      sword.rotation.set(0, tilt, 0);
      key.intensity = light * Math.PI;
      renderer.render(scene, camera);
      return renderer.domElement;
    },
    dispose() {
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      for (const m of [steel, gold, grip]) m.dispose();
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

import * as THREE from 'three';
import { GameState, Player, PLAYER_RADIUS } from './types';
import { ROOM_WALLS, OBSTACLES, ROOMS, createDoors } from './collision';
import robotBlueUrl from '@/assets/robot-blue.jpg';
import robotGreenUrl from '@/assets/robot-green.jpg';

// Vision radii per role (kept in sync with renderer.ts)
const VISION_RADIUS: Record<string, number> = {
  crewmate: 260,
  protector: 210,
  imposter: 160,
};

// Build a texture from a JPG and key out the pure-black background to alpha.
function makeKeyedTexture(url: string): THREE.Texture {
  const tex = new THREE.Texture();
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height);
    const d = data.data;
    for (let i = 0; i < d.length; i += 4) {
      // Treat near-black as transparent
      if (d[i] < 28 && d[i + 1] < 28 && d[i + 2] < 28) {
        d[i + 3] = 0;
      }
    }
    ctx.putImageData(data, 0, 0);
    tex.image = c;
    tex.needsUpdate = true;
  };
  img.src = url;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Renderer3D {
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  private playerSprites = new Map<number, THREE.Sprite>();
  private taskMeshes = new Map<number, THREE.Mesh>();
  private doorMeshes = new Map<number, THREE.Mesh>();
  private ambient: THREE.HemisphereLight;
  private fog: THREE.Fog;
  private ground: THREE.Mesh;
  private texBlue: THREE.Texture;
  private texGreen: THREE.Texture;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'low-power',
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x05060a, 1);

    this.camera = new THREE.PerspectiveCamera(72, 1, 1, 900);

    // Fog produces vision falloff; far value updated per role each frame.
    this.fog = new THREE.Fog(0x06070b, 60, 260);
    this.scene.fog = this.fog;

    this.ambient = new THREE.HemisphereLight(0xeaf0ff, 0x222633, 1.15);
    this.scene.add(this.ambient);

    this.texBlue = makeKeyedTexture(robotBlueUrl);
    this.texGreen = makeKeyedTexture(robotGreenUrl);

    // Outer ground (dark)
    const groundGeo = new THREE.PlaneGeometry(2000, 1500);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x111318 });
    this.ground = new THREE.Mesh(groundGeo, groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(800, 0, -600);
    this.scene.add(this.ground);

    this.buildStaticGeometry();
  }

  private buildStaticGeometry() {
    // Walls from segments → thin black boxes
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x0a0a0c });
    for (const w of ROOM_WALLS) {
      const dx = w.x2 - w.x1;
      const dz = w.y2 - w.y1;
      const len = Math.hypot(dx, dz);
      if (len < 1) continue;
      const geo = new THREE.BoxGeometry(len, 44, 6);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set((w.x1 + w.x2) / 2, 22, -(w.y1 + w.y2) / 2);
      mesh.rotation.y = Math.atan2(dz, dx);
      this.scene.add(mesh);
    }

    // Room floor markers (grey tile)
    const roomFloorMat = new THREE.MeshLambertMaterial({ color: 0x7d8290 });
    for (const r of ROOMS) {
      const geo = new THREE.PlaneGeometry(r.w, r.h);
      const m = new THREE.Mesh(geo, roomFloorMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(r.x + r.w / 2, 0.2, -(r.y + r.h / 2));
      this.scene.add(m);
    }

    // Obstacles → simple rocks
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x2a2c33 });
    for (const o of OBSTACLES) {
      const geo = new THREE.DodecahedronGeometry(o.r, 0);
      const m = new THREE.Mesh(geo, rockMat);
      m.position.set(o.x, o.r * 0.6, -o.y);
      this.scene.add(m);
    }

    // Door slots (built once from the initial door list, identified by id)
    const doorMat = new THREE.MeshLambertMaterial({ color: 0x4a3220 });
    for (const d of createDoors()) {
      const dx = d.x2 - d.x1;
      const dz = d.y2 - d.y1;
      const len = Math.hypot(dx, dz);
      const geo = new THREE.BoxGeometry(Math.max(len, 6), 36, 8);
      const mesh = new THREE.Mesh(geo, doorMat);
      mesh.position.set(d.cx, 18, -d.cy);
      mesh.rotation.y = Math.atan2(dz, dx);
      this.scene.add(mesh);
      this.doorMeshes.set(d.id, mesh);
    }
  }

  private ensurePlayerSprite(p: Player): THREE.Sprite {
    let s = this.playerSprites.get(p.id);
    if (s) return s;
    const tex = p.role === 'protector' ? this.texGreen : this.texBlue;
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.3,
      fog: true,
    });
    s = new THREE.Sprite(mat);
    s.scale.set(PLAYER_RADIUS * 3.4, PLAYER_RADIUS * 3.4, 1);
    s.center.set(0.5, 0.0);
    this.scene.add(s);
    this.playerSprites.set(p.id, s);
    return s;
  }

  private ensureTaskMesh(stationId: number, x: number, y: number) {
    let m = this.taskMeshes.get(stationId);
    if (m) return m;
    m = new THREE.Mesh(
      new THREE.BoxGeometry(32, 28, 32),
      new THREE.MeshLambertMaterial({ color: 0x3aa0ff })
    );
    m.position.set(x, 14, -y);
    this.scene.add(m);
    this.taskMeshes.set(stationId, m);
    return m;
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(state: GameState, yaw: number = 0) {
    const human = state.players[0];

    // Vision via fog: hide everything beyond vision radius.
    const vr = VISION_RADIUS[human.role] ?? 220;
    this.fog.near = vr * 0.35;
    this.fog.far = vr;

    // Tasks
    for (const t of state.taskStations) {
      const m = this.ensureTaskMesh(t.id, t.x, t.y);
      (m.material as THREE.MeshLambertMaterial).color.setHex(t.completed ? 0x2ecc71 : 0x3aa0ff);
    }

    // Doors: hide when open
    for (const d of state.doors) {
      const m = this.doorMeshes.get(d.id);
      if (m) m.visible = !d.open;
    }

    // Players
    const seen = new Set<number>();
    for (const p of state.players) {
      seen.add(p.id);
      const s = this.ensurePlayerSprite(p);
      s.position.set(p.x, p.alive ? 0 : 4, -p.y);
      // Hide our own sprite in first person
      s.visible = p.id !== human.id;
      const mat = s.material as THREE.SpriteMaterial;
      if (p.frozen) mat.color.setHex(0x80e0ff);
      else if (!p.alive) mat.color.setHex(0x553333);
      else mat.color.setHex(0xffffff);
      if (!p.alive) {
        s.scale.set(PLAYER_RADIUS * 3.2, PLAYER_RADIUS * 1.6, 1);
      } else {
        s.scale.set(PLAYER_RADIUS * 3.4, PLAYER_RADIUS * 3.4, 1);
      }
    }
    // Cleanup removed players (shouldn't happen but safe)
    for (const id of Array.from(this.playerSprites.keys())) {
      if (!seen.has(id)) {
        const m = this.playerSprites.get(id)!;
        this.scene.remove(m);
        this.playerSprites.delete(id);
      }
    }

    // First-person camera at the human's head, looking along yaw.
    const headY = 36;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    this.camera.position.set(human.x, headY, -human.y);
    this.camera.lookAt(human.x + fx * 100, headY - 6, -(human.y + fz * 100));

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.dispose();
    this.scene.traverse((o: any) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m: any) => m.dispose());
        else o.material.dispose();
      }
    });
  }
}
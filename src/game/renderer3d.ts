import * as THREE from 'three';
import { GameState, Player, PLAYER_RADIUS } from './types';
import { ROOM_WALLS, OBSTACLES, ROOMS, createDoors } from './collision';

// Vision radii per role (kept in sync with renderer.ts)
const VISION_RADIUS: Record<string, number> = {
  crewmate: 260,
  protector: 210,
  imposter: 160,
};

const ROLE_COLOR: Record<string, number> = {
  crewmate: 0x4ea8ff,
  protector: 0xffd34a,
  imposter: 0xff4d4d,
};

export class Renderer3D {
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  private playerMeshes = new Map<number, THREE.Group>();
  private taskMeshes = new Map<number, THREE.Mesh>();
  private doorMeshes = new Map<number, THREE.Mesh>();
  private ambient: THREE.HemisphereLight;
  private fog: THREE.Fog;
  private ground: THREE.Mesh;
  private humanRole: string = 'crewmate';

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'low-power',
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000, 1);

    this.camera = new THREE.PerspectiveCamera(55, 1, 1, 800);

    // Fog produces vision falloff; far value updated per role each frame.
    this.fog = new THREE.Fog(0x1a0a08, 60, 260);
    this.scene.fog = this.fog;

    this.ambient = new THREE.HemisphereLight(0xffd6b3, 0x3a1108, 1.1);
    this.scene.add(this.ambient);

    // Mars ground
    const groundGeo = new THREE.PlaneGeometry(2000, 1500);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x8a3a1f });
    this.ground = new THREE.Mesh(groundGeo, groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(800, 0, 600);
    this.scene.add(this.ground);

    this.buildStaticGeometry();
  }

  private buildStaticGeometry() {
    // Walls from segments → thin boxes
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xc6694a });
    for (const w of ROOM_WALLS) {
      const dx = w.x2 - w.x1;
      const dz = w.y2 - w.y1;
      const len = Math.hypot(dx, dz);
      if (len < 1) continue;
      const geo = new THREE.BoxGeometry(len, 40, 6);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set((w.x1 + w.x2) / 2, 20, (w.y1 + w.y2) / 2);
      mesh.rotation.y = -Math.atan2(dz, dx);
      this.scene.add(mesh);
    }

    // Room floor markers (slight color)
    const roomFloorMat = new THREE.MeshLambertMaterial({ color: 0x6a2a14 });
    for (const r of ROOMS) {
      const geo = new THREE.PlaneGeometry(r.w, r.h);
      const m = new THREE.Mesh(geo, roomFloorMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(r.x + r.w / 2, 0.2, r.y + r.h / 2);
      this.scene.add(m);
    }

    // Obstacles → simple rocks
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x5a2818 });
    for (const o of OBSTACLES) {
      const geo = new THREE.DodecahedronGeometry(o.r, 0);
      const m = new THREE.Mesh(geo, rockMat);
      m.position.set(o.x, o.r * 0.6, o.y);
      this.scene.add(m);
    }

    // Door slots (built once from the initial door list, identified by id)
    const doorMat = new THREE.MeshLambertMaterial({ color: 0x3a1f15 });
    for (const d of createDoors()) {
      const dx = d.x2 - d.x1;
      const dz = d.y2 - d.y1;
      const len = Math.hypot(dx, dz);
      const geo = new THREE.BoxGeometry(Math.max(len, 6), 36, 8);
      const mesh = new THREE.Mesh(geo, doorMat);
      mesh.position.set(d.cx, 18, d.cy);
      mesh.rotation.y = -Math.atan2(dz, dx);
      this.scene.add(mesh);
      this.doorMeshes.set(d.id, mesh);
    }
  }

  private ensurePlayerMesh(p: Player): THREE.Group {
    let g = this.playerMeshes.get(p.id);
    if (g) return g;
    g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xaaaaaa });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(PLAYER_RADIUS, PLAYER_RADIUS, 28, 10), bodyMat);
    body.position.y = 14;
    g.add(body);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xdddddd });
    const head = new THREE.Mesh(new THREE.SphereGeometry(PLAYER_RADIUS * 0.7, 10, 8), headMat);
    head.position.y = 34;
    g.add(head);
    this.scene.add(g);
    this.playerMeshes.set(p.id, g);
    return g;
  }

  private ensureTaskMesh(stationId: number, x: number, y: number) {
    let m = this.taskMeshes.get(stationId);
    if (m) return m;
    m = new THREE.Mesh(
      new THREE.BoxGeometry(32, 28, 32),
      new THREE.MeshLambertMaterial({ color: 0x3aa0ff })
    );
    m.position.set(x, 14, y);
    this.scene.add(m);
    this.taskMeshes.set(stationId, m);
    return m;
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(state: GameState) {
    const human = state.players[0];
    this.humanRole = human.role;

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
      const g = this.ensurePlayerMesh(p);
      g.position.x = p.x;
      g.position.z = p.y;

      // Role color visible only to human's allies, or always for the human/dead/jailed
      let color = 0xcccccc;
      const showRole = p.id === human.id
        || !p.alive
        || p.jailed
        || human.role === 'imposter'
        || (human.role === 'protector' && p.role !== 'crewmate')
        || (human.role === 'crewmate' && p.role === 'crewmate' && p.id === human.id);
      if (showRole) color = ROLE_COLOR[p.role];
      if (p.frozen) color = 0x40d8f0;
      const body = g.children[0] as THREE.Mesh;
      (body.material as THREE.MeshLambertMaterial).color.setHex(color);

      // Dead: lay flat
      g.rotation.x = p.alive ? 0 : Math.PI / 2;
      g.visible = true;

      // Direction facing
      if (p.alive && (p.direction.x !== 0 || p.direction.y !== 0)) {
        g.rotation.y = -Math.atan2(p.direction.y, p.direction.x) + Math.PI / 2;
      }
    }
    // Cleanup removed players (shouldn't happen but safe)
    for (const id of Array.from(this.playerMeshes.keys())) {
      if (!seen.has(id)) {
        const m = this.playerMeshes.get(id)!;
        this.scene.remove(m);
        this.playerMeshes.delete(id);
      }
    }

    // Camera: third-person tilt above human
    const camDist = 180;
    const camHeight = 220;
    this.camera.position.set(human.x, camHeight, human.y + camDist);
    this.camera.lookAt(human.x, 10, human.y - 10);

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
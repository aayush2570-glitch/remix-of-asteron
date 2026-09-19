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

function hexToRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

// Procedurally generate a small tileable surface texture: a base color with
// soft weathering blotches plus fine per-pixel grain, so ground/walls/floors
// read as real dusty/rocky material instead of a single flat fill color.
function makeNoiseTexture(
  baseHex: number,
  opts: { blotchHex?: number; blotchCount?: number; speckle?: number; size?: number } = {}
): THREE.CanvasTexture {
  const size = opts.size ?? 256;
  const [br, bg, bb] = hexToRgb(baseHex);
  const [dr, dg, db] = hexToRgb(opts.blotchHex ?? baseHex);

  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = `rgb(${br},${bg},${bb})`;
  ctx.fillRect(0, 0, size, size);

  // Soft weathering / dust blotches
  ctx.fillStyle = `rgba(${dr},${dg},${db},0.32)`;
  const blotchCount = opts.blotchCount ?? 40;
  for (let i = 0; i < blotchCount; i++) {
    const rx = Math.random() * size;
    const ry = Math.random() * size;
    const rr = 6 + Math.random() * 26;
    ctx.beginPath();
    ctx.ellipse(rx, ry, rr, rr * (0.5 + Math.random() * 0.5), Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fine per-pixel grain for a gritty, detailed surface
  const speckle = opts.speckle ?? 14;
  const imgData = ctx.getImageData(0, 0, size, size);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * speckle;
    d[i] = Math.min(255, Math.max(0, d[i] + n));
    d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n));
    d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n));
  }
  ctx.putImageData(imgData, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A soft radial-gradient circle used as a cheap "contact shadow" decal under
// each player, so they read as grounded rather than floating sprites.
function makeShadowBlobTexture(): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(0,0,0,0.45)');
  grad.addColorStop(0.7, 'rgba(0,0,0,0.22)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

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
  private playerShadows = new Map<number, THREE.Mesh>();
  private taskMeshes = new Map<number, THREE.Mesh>();
  private doorMeshes = new Map<number, THREE.Mesh>();
  private ambient: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private fog: THREE.Fog;
  private ground: THREE.Mesh;
  private texBlue: THREE.Texture;
  private texGreen: THREE.Texture;
  private shadowBlobTex: THREE.Texture;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setClearColor(0xc9743f, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(72, 1, 1, 900);

    // Fog produces vision falloff; far value updated per role each frame.
    this.fog = new THREE.Fog(0xb5623a, 60, 260); // dusty orange haze instead of 0x06070b
    this.scene.fog = this.fog;

    this.ambient = new THREE.HemisphereLight(0xffcf9e, 0x552f1a, 0.85);
    this.scene.add(this.ambient);

    // Low, warm directional "sun" so surfaces and rocks get real shading
    // and cast shadows instead of looking like flat-lit solid colors.
    this.sun = new THREE.DirectionalLight(0xffd2a0, 1.35);
    this.sun.position.set(800 - 500, 340, -600 - 380);
    this.sun.target.position.set(800, 0, -600);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -900;
    this.sun.shadow.camera.right = 900;
    this.sun.shadow.camera.top = 700;
    this.sun.shadow.camera.bottom = -700;
    this.sun.shadow.camera.near = 50;
    this.sun.shadow.camera.far = 1400;
    this.sun.shadow.bias = -0.0015;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.texBlue = makeKeyedTexture(robotBlueUrl);
    this.texGreen = makeKeyedTexture(robotGreenUrl);
    this.shadowBlobTex = makeShadowBlobTexture();

    // Outer ground: dusty, speckled soil rather than a flat fill
    const groundGeo = new THREE.PlaneGeometry(2000, 1500);
    const groundTex = makeNoiseTexture(0xa8501f, { blotchHex: 0x7a3015, blotchCount: 90, speckle: 22 });
    groundTex.repeat.set(10, 7.5);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0xffffff, map: groundTex });
    this.ground = new THREE.Mesh(groundGeo, groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(800, 0, -600);
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.buildStaticGeometry();
  }

  private buildStaticGeometry() {
    // Walls: weathered rock texture, each segment gets its own repeat scale
    // so the pattern doesn't stretch on long walls.
    const wallBaseTex = makeNoiseTexture(0x3a241a, { blotchHex: 0x241611, blotchCount: 55, speckle: 18 });
    for (const w of ROOM_WALLS) {
      const dx = w.x2 - w.x1;
      const dz = w.y2 - w.y1;
      const len = Math.hypot(dx, dz);
      if (len < 1) continue;
      const wallTex = wallBaseTex.clone();
      wallTex.needsUpdate = true;
      wallTex.wrapS = THREE.RepeatWrapping;
      wallTex.wrapT = THREE.RepeatWrapping;
      wallTex.repeat.set(Math.max(1, len / 150), 1);
      const wallMat = new THREE.MeshLambertMaterial({ color: 0xffffff, map: wallTex });
      const geo = new THREE.BoxGeometry(len, 44, 6);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set((w.x1 + w.x2) / 2, 22, -(w.y1 + w.y2) / 2);
      mesh.rotation.y = Math.atan2(dz, dx);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }

    // Room floor markers: dusty tan module flooring, textured per room size
    const roomFloorBaseTex = makeNoiseTexture(0x8a6a52, { blotchHex: 0x6b4e39, blotchCount: 45, speckle: 16 });
    for (const r of ROOMS) {
      const floorTex = roomFloorBaseTex.clone();
      floorTex.needsUpdate = true;
      floorTex.wrapS = THREE.RepeatWrapping;
      floorTex.wrapT = THREE.RepeatWrapping;
      floorTex.repeat.set(Math.max(1, r.w / 150), Math.max(1, r.h / 150));
      const roomFloorMat = new THREE.MeshLambertMaterial({ color: 0xffffff, map: floorTex });
      const geo = new THREE.PlaneGeometry(r.w, r.h);
      const m = new THREE.Mesh(geo, roomFloorMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(r.x + r.w / 2, 0.2, -(r.y + r.h / 2));
      m.receiveShadow = true;
      this.scene.add(m);
    }

    // Obstacles → rough rocks, each with slight random shape/shade/rotation
    // so a field of them reads as natural terrain, not identical clones.
    const rockTex = makeNoiseTexture(0x5a2f1e, { blotchHex: 0x3a1c10, blotchCount: 30, speckle: 26 });
    for (const o of OBSTACLES) {
      const shade = 0.82 + Math.random() * 0.36; // subtle per-rock brightness variation
      const rockMat = new THREE.MeshLambertMaterial({
        color: new THREE.Color(shade, shade, shade),
        map: rockTex,
      });
      const detail = Math.random() < 0.5 ? 0 : 1;
      const geo = new THREE.DodecahedronGeometry(o.r, detail);
      // Squash/stretch each rock slightly so they aren't perfect duplicates.
      const posAttr = geo.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        posAttr.setX(i, posAttr.getX(i) * (0.9 + Math.random() * 0.2));
        posAttr.setY(i, posAttr.getY(i) * (0.7 + Math.random() * 0.3));
        posAttr.setZ(i, posAttr.getZ(i) * (0.9 + Math.random() * 0.2));
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, rockMat);
      m.position.set(o.x, o.r * 0.55, -o.y);
      m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
    }

    // Door slots (built once from the initial door list, identified by id)
    const doorTex = makeNoiseTexture(0x4a3220, { blotchHex: 0x2e1e12, blotchCount: 25, speckle: 12 });
    const doorMat = new THREE.MeshLambertMaterial({ color: 0xffffff, map: doorTex });
    for (const d of createDoors()) {
      const dx = d.x2 - d.x1;
      const dz = d.y2 - d.y1;
      const len = Math.hypot(dx, dz);
      const geo = new THREE.BoxGeometry(Math.max(len, 6), 36, 8);
      const mesh = new THREE.Mesh(geo, doorMat);
      mesh.position.set(d.cx, 18, -d.cy);
      mesh.rotation.y = Math.atan2(dz, dx);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
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

  private ensurePlayerShadow(id: number): THREE.Mesh {
    let s = this.playerShadows.get(id);
    if (s) return s;
    const mat = new THREE.MeshBasicMaterial({
      map: this.shadowBlobTex,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    const geo = new THREE.PlaneGeometry(PLAYER_RADIUS * 2.6, PLAYER_RADIUS * 2.6);
    s = new THREE.Mesh(geo, mat);
    s.rotation.x = -Math.PI / 2;
    this.scene.add(s);
    this.playerShadows.set(id, s);
    return s;
  }

  private ensureTaskMesh(stationId: number, x: number, y: number) {
    let m = this.taskMeshes.get(stationId);
    if (m) return m;

    const group = new THREE.Group();

    // Base plinth (worn metal crate the console sits on)
    const baseMat = new THREE.MeshLambertMaterial({ color: 0x5f4c3c });
    const base = new THREE.Mesh(new THREE.BoxGeometry(30, 20, 26), baseMat);
    base.position.y = 10;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    // Support post
    const postMat = new THREE.MeshLambertMaterial({ color: 0x2b2420 });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 22, 8), postMat);
    post.position.y = 31;
    post.castShadow = true;
    group.add(post);

    // Glowing screen panel, tilted toward approaching players
    const screenMat = new THREE.MeshLambertMaterial({
      color: 0x3aa0ff,
      emissive: 0x3aa0ff,
      emissiveIntensity: 0.55,
    });
    const screen = new THREE.Mesh(new THREE.BoxGeometry(22, 15, 2.5), screenMat);
    screen.position.y = 44;
    screen.rotation.x = -0.3;
    group.add(screen);

    // Thin frame/bezel around the screen for a console-panel look
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x1c1a18 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(25, 18, 1.2), frameMat);
    frame.position.set(0, 44, -1.4);
    frame.rotation.x = -0.3;
    group.add(frame);

    // Local glow so the console lights up its immediate surroundings
    const glow = new THREE.PointLight(0x3aa0ff, 0.6, 90, 2);
    glow.position.set(0, 44, 10);
    group.add(glow);
    // Stash the glow on the screen mesh so render() can update both together.
    screen.userData.glow = glow;

    group.position.set(x, 0, -y);
    this.scene.add(group);

    // Store the screen mesh so render() can recolor it per completion state.
    this.taskMeshes.set(stationId, screen);
    return screen;
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
      const mat = m.material as THREE.MeshLambertMaterial;
      const hex = t.completed ? 0x2ecc71 : 0x3aa0ff;
      mat.color.setHex(hex);
      mat.emissive.setHex(hex);
      mat.emissiveIntensity = t.completed ? 0.35 : 0.55;
      const glow = m.userData.glow as THREE.PointLight | undefined;
      if (glow) {
        glow.color.setHex(hex);
        glow.intensity = t.completed ? 0.35 : 0.6;
      }
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

      // Soft contact shadow at the player's feet, fading out once downed.
      const shadow = this.ensurePlayerShadow(p.id);
      shadow.position.set(p.x, 0.5, -p.y);
      shadow.visible = p.alive;
      (shadow.material as THREE.MeshBasicMaterial).opacity = p.alive ? 1 : 0;
    }
    // Cleanup removed players (shouldn't happen but safe)
    for (const id of Array.from(this.playerSprites.keys())) {
      if (!seen.has(id)) {
        const m = this.playerSprites.get(id)!;
        this.scene.remove(m);
        this.playerSprites.delete(id);
        const sh = this.playerShadows.get(id);
        if (sh) {
          this.scene.remove(sh);
          this.playerShadows.delete(id);
        }
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

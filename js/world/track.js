import * as THREE from '../../vendor/three.module.js';

function makeAsphaltTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3a3d42';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const g = 40 + Math.random() * 45;
    ctx.fillStyle = `rgb(${g},${g + 2},${g + 5})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 1.6, 1.6);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeCurbTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#d8332c';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(0, 0, 64, 32);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Track {
  constructor(scene) {
    this.scene = scene;
    this.halfWidth = 6.5;

    const ctrl = [
      [0, -130], [70, -170], [160, -155], [215, -95], [225, -15], [185, 40],
      [205, 115], [150, 178], [60, 188], [8, 138], [-58, 158], [-142, 178],
      [-205, 122], [-215, 42], [-172, -18], [-186, -88], [-122, -152], [-58, -142],
    ].map(([x, z]) => new THREE.Vector3(x, 0, z));

    this.curve = new THREE.CatmullRomCurve3(ctrl, true, 'catmullrom', 0.5);
    this.length = this.curve.getLength();

    // Échantillons de la ligne médiane
    const N = 600;
    this.samples = [];
    for (let i = 0; i < N; i++) {
      const u = i / N;
      const p = this.curve.getPointAt(u);
      const tan = this.curve.getTangentAt(u).normalize();
      this.samples.push({ p, tan, right: new THREE.Vector3(-tan.z, 0, tan.x).normalize() });
    }
    this.sampleSpacing = this.length / N;

    // Grille spatiale pour requêtes de distance rapides
    this.cellSize = 20;
    this.grid = new Map();
    for (let i = 0; i < N; i++) {
      const { p } = this.samples[i];
      const key = `${Math.floor(p.x / this.cellSize)},${Math.floor(p.z / this.cellSize)}`;
      if (!this.grid.has(key)) this.grid.set(key, []);
      this.grid.get(key).push(i);
    }

    this.buildMeshes();
  }

  distanceToCenterline(x, z) {
    const cx = Math.floor(x / this.cellSize), cz = Math.floor(z / this.cellSize);
    let best = Infinity;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const list = this.grid.get(`${cx + dx},${cz + dz}`);
        if (!list) continue;
        for (const i of list) {
          const s = this.samples[i].p;
          const d = Math.hypot(x - s.x, z - s.z);
          if (d < best) best = d;
        }
      }
    }
    if (!isFinite(best)) {
      for (const s of this.samples) {
        const d = Math.hypot(x - s.p.x, z - s.p.z);
        if (d < best) best = d;
      }
    }
    return best;
  }

  nearestSample(x, z) {
    let best = -1, bestD = Infinity;
    const s = this.samples;
    for (let i = 0; i < s.length; i++) {
      const p = s[i].p;
      const d = (x - p.x) ** 2 + (z - p.z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  buildMeshes() {
    const group = new THREE.Group();

    // --- Asphalte ---
    const width = this.halfWidth * 2;
    const N = 600;
    const posArr = [], uvArr = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const s = this.samples[i % this.samples.length];
      const L = s.p.clone().addScaledVector(s.right, -this.halfWidth);
      const R = s.p.clone().addScaledVector(s.right, this.halfWidth);
      posArr.push(L.x, 0.02, L.z, R.x, 0.02, R.z);
      const v = i * 0.25;
      uvArr.push(0, v, 1, v);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const asphaltTex = makeAsphaltTexture();
    asphaltTex.repeat.set(1, 1);
    const asphalt = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.92, metalness: 0.0 }),
    );
    asphalt.geometry.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    asphalt.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2));
    asphalt.geometry.setIndex(idx);
    asphalt.geometry.computeVertexNormals();
    asphalt.receiveShadow = true;
    group.add(asphalt);

    // --- Bordures blanches continues ---
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xdadde2, roughness: 0.7 });
    for (const side of [-1, 1]) {
      const lp = [], li = [];
      for (let i = 0; i <= N; i++) {
        const s = this.samples[i % this.samples.length];
        const A = s.p.clone().addScaledVector(s.right, side * this.halfWidth);
        const B = s.p.clone().addScaledVector(s.right, side * (this.halfWidth + 0.18));
        lp.push(A.x, 0.035, A.z, B.x, 0.035, B.z);
      }
      for (let i = 0; i < N; i++) {
        const a = i * 2;
        li.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
      g.setIndex(li);
      g.computeVertexNormals();
      group.add(new THREE.Mesh(g, lineMat));
    }

    // --- Vibreurs dans les virages (courbure élevée) ---
    const curbTex = makeCurbTexture();
    const curvatures = this.samples.map((s, i) => {
      const s0 = this.samples[(i - 6 + N) % N], s1 = this.samples[(i + 6) % N];
      const a = Math.atan2(s0.tan.z, s0.tan.x), b = Math.atan2(s1.tan.z, s1.tan.x);
      return Math.abs(((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI) / (12 * this.sampleSpacing);
    });
    for (const side of [-1, 1]) {
      let run = [];
      const flush = (run) => {
        if (run.length < 8) { run = []; return; }
        const lp = [], uv = [], li = [];
        for (let k = 0; k < run.length; k++) {
          const i = run[k];
          const s = this.samples[i % this.samples.length];
          const A = s.p.clone().addScaledVector(s.right, side * (this.halfWidth + 0.18));
          const B = s.p.clone().addScaledVector(s.right, side * (this.halfWidth + 1.0));
          lp.push(A.x, 0.045, A.z, B.x, 0.045, B.z);
          uv.push(0, k * 0.6, 1, k * 0.6);
        }
        for (let k = 0; k < run.length - 1; k++) {
          const a = k * 2;
          li.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        g.setIndex(li);
        g.computeVertexNormals();
        const mat = new THREE.MeshStandardMaterial({ map: curbTex.clone(), roughness: 0.6 });
        mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping;
        group.add(new THREE.Mesh(g, mat));
        run = [];
      };
      let active = false;
      for (let i = 0; i < N; i++) {
        const strong = curvatures[i] > 0.011;
        if (strong) { run.push(i); active = true; }
        else if (active) { flush(run); active = false; }
      }
      flush(run);
    }

    // --- Ligne de départ ---
    const startPos = this.curve.getPointAt(0);
    const startTan = this.curve.getTangentAt(0).normalize();
    this.startPos = startPos.clone();
    this.startHeading = Math.atan2(startTan.x, startTan.z);
    const gridTexCanvas = document.createElement('canvas');
    gridTexCanvas.width = 64; gridTexCanvas.height = 8;
    const gctx = gridTexCanvas.getContext('2d');
    for (let i = 0; i < 8; i++) {
      gctx.fillStyle = i % 2 === 0 ? '#111318' : '#f0f0f0';
      gctx.fillRect(0, i * 8, 64, 8);
    }
    const finishG = new THREE.PlaneGeometry(width, 1.4);
    const finishM = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gridTexCanvas) });
    const finish = new THREE.Mesh(finishG, finishM);
    finish.rotation.x = -Math.PI / 2;
    finish.rotation.z = -Math.atan2(startTan.z, startTan.x) + Math.PI / 2;
    finish.position.set(startPos.x, 0.05, startPos.z);
    group.add(finish);

    // Portique
    const gantryMat = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.5, metalness: 0.4 });
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7, 0.6), gantryMat);
      pillar.position.copy(startPos).addScaledVector(this.samples[0].right, side * (this.halfWidth + 1.5));
      pillar.position.y = 3.5;
      pillar.castShadow = true;
      group.add(pillar);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(width + 4, 1.1, 0.5), gantryMat);
    beam.position.copy(startPos);
    beam.position.y = 7.2;
    beam.rotation.y = this.startHeading + Math.PI / 2 ;
    group.add(beam);

    // Balises lumineuses de virage
    this.scene.add(group);

    // Poteaux de signalisation aux sorties de virages serrés
    const signMat = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0x553b12, roughness: 0.5 });
    let cooldownSide = { [-1]: -1e9, 1: -1e9 };
    for (let i = 0; i < N; i += 4) {
      const c = curvatures[i];
      const side = Math.sign(
        this.samples[(i + 4) % N].tan.clone().cross(this.samples[i].tan).y,
      );
      if (c > 0.013 && i - cooldownSide[side] > 40) {
        cooldownSide[side] = i;
        const s = this.samples[i];
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.4, 0.25), signMat);
        post.position.copy(s.p).addScaledVector(s.right, side * (this.halfWidth + 1.8));
        post.position.y = 0.7;
        group.add(post);
      }
    }
  }
}

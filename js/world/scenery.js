import * as THREE from '../../vendor/three.module.js';

function makeGrassTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4a7136';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 7000; i++) {
    const g = Math.random();
    ctx.fillStyle = g < 0.5 ? `rgba(60,100,45,${0.3 + g})` : `rgba(96,140,70,${0.3 + g})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2 + Math.random() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(60, 60);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeSky() {
  const geo = new THREE.SphereGeometry(1800, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x2b5cc7) },
      midColor: { value: new THREE.Color(0x8fb9f2) },
      botColor: { value: new THREE.Color(0xdfe9ef) },
    },
    vertexShader: `
      varying vec3 vP;
      void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
      varying vec3 vP;
      uniform vec3 topColor; uniform vec3 midColor; uniform vec3 botColor;
      void main() {
        float h = normalize(vP).y;
        vec3 c = h > 0.18 ? mix(midColor, topColor, smoothstep(0.18, 0.8, h))
                          : mix(botColor, midColor, smoothstep(-0.1, 0.18, h));
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  return new THREE.Mesh(geo, mat);
}

export function buildScenery(scene, track) {
  scene.fog = new THREE.Fog(0xc9d9e8, 250, 1500);

  const sky = makeSky();
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(0xbfd6ff, 0x53663f, 0.85);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
  sun.position.set(120, 180, 80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 600;
  sun.shadow.camera.left = -70; sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);
  return { sky, sun, hemi };
}

export function updateShadowTarget(sun, carPos) {
  sun.target.position.copy(carPos);
  sun.position.copy(carPos).add(new THREE.Vector3(90, 140, 60));
}

export function buildGroundPlane(scene, track) {
  const groundGeo = new THREE.PlaneGeometry(3000, 3000, 1, 1);
  const groundMat = new THREE.MeshStandardMaterial({ map: makeGrassTexture(), roughness: 1.0 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  // Montagnes lointaines
  const mountainMat = new THREE.MeshStandardMaterial({ color: 0x6d7f8d, roughness: 1, flatShading: true });
  const mountainGeo = new THREE.ConeGeometry(1, 1, 5);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + Math.random() * 0.2;
    const r = 1000 + Math.random() * 350;
    const m = new THREE.Mesh(mountainGeo, mountainMat);
    const h = 90 + Math.random() * 150;
    m.scale.set(180 + Math.random() * 220, h, 180 + Math.random() * 220);
    m.position.set(Math.cos(a) * r, h / 2 - 8, Math.sin(a) * r);
    m.rotation.y = Math.random() * Math.PI;
    scene.add(m);
  }

  // Arbres (hors piste)
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 3.2, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 });
  const crownGeo = new THREE.ConeGeometry(3.4, 7.5, 8);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 1 });
  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, 260);
  const crownInst = new THREE.InstancedMesh(crownGeo, crownMat, 260);
  const dummy = new THREE.Object3D();
  let placed = 0, attempts = 0;
  while (placed < 260 && attempts < 4000) {
    attempts++;
    const x = (Math.random() - 0.5) * 900;
    const z = (Math.random() - 0.5) * 900;
    if (track.distanceToCenterline(x, z) < track.halfWidth + 12) continue;
    const y = -0.2;
    dummy.position.set(x, y + 1.6, z);
    dummy.scale.setScalar(0.8 + Math.random() * 0.7);
    dummy.rotation.y = Math.random() * Math.PI * 2;
    dummy.updateMatrix();
    trunkInst.setMatrixAt(placed, dummy.matrix);
    dummy.position.set(x, y + 3.2 + 3.7 * dummy.scale.y, z);
    dummy.updateMatrix();
    crownInst.setMatrixAt(placed, dummy.matrix);
    placed++;
  }
  trunkInst.count = placed; crownInst.count = placed;
  trunkInst.castShadow = crownInst.castShadow = true;
  scene.add(trunkInst, crownInst);

  // Grands standes / panneaux
  const standMat = new THREE.MeshStandardMaterial({ color: 0xd8dbe0, roughness: 0.8 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x2b5cff, roughness: 0.6 });
  for (let k = 0; k < 3; k++) {
    const i = Math.floor((k + 0.5) * track.samples.length / 3);
    const s = track.samples[i];
    const off = track.halfWidth + 16;
    const base = new THREE.Mesh(new THREE.BoxGeometry(30, 5, 6), standMat);
    base.position.copy(s.p).addScaledVector(s.right, k % 2 === 0 ? off : -off);
    base.position.y = 2.5;
    base.rotation.y = Math.atan2(s.tan.x, s.tan.z) + Math.PI / 2 * (k % 2 === 0 ? 1 : -1);
    base.castShadow = true;
    scene.add(base);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(32, 0.4, 7), roofMat);
    roof.position.copy(base.position);
    roof.position.y = 5.4;
    roof.rotation.y = base.rotation.y;
    roof.rotation.x = 0.12;
    scene.add(roof);
  }
}

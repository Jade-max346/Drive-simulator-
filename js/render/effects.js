import * as THREE from '../../vendor/three.module.js';

const MAX_MARKS = 700;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.marks = [];
    this.cursor = 0;
    this.markGeo = new THREE.PlaneGeometry(1, 1);
    this.markGeo.rotateX(-Math.PI / 2);
    this.markMat = new THREE.MeshBasicMaterial({
      color: 0x0c0d10, transparent: true, opacity: 0.75, depthWrite: false,
    });
    this.meshPool = [];
    for (let i = 0; i < MAX_MARKS; i++) {
      const m = new THREE.Mesh(this.markGeo, this.markMat);
      m.visible = false;
      scene.add(m);
      this.meshPool.push(m);
    }

    // Fumée
    const smokeC = document.createElement('canvas');
    smokeC.width = smokeC.height = 64;
    const sctx = smokeC.getContext('2d');
    const g = sctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(210,210,215,0.85)');
    g.addColorStop(1, 'rgba(210,210,215,0)');
    sctx.fillStyle = g;
    sctx.fillRect(0, 0, 64, 64);
    this.smokeTex = new THREE.CanvasTexture(smokeC);
    this.smokes = [];
  }

  addSkidMark(wheel, prevContact, strength) {
    const mesh = this.meshPool[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_MARKS;
    mesh.visible = true;
    const len = prevContact ? wheel.contact.distanceTo(prevContact) : 0.6;
    const width = 0.24;
    mesh.scale.set(width, 1, Math.max(0.3, len));
    const mid = prevContact
      ? wheel.contact.clone().add(prevContact).multiplyScalar(0.5)
      : wheel.contact.clone();
    mid.y += 0.02;
    mesh.position.copy(mid);
    const dir = prevContact ? wheel.contact.clone().sub(prevContact) : null;
    mesh.rotation.y = dir ? Math.atan2(dir.x, dir.z) : 0;
    this.marks[this.cursor] = performance.now();
  }

  addSmoke(pos, vel, intensity) {
    if (this.smokes.length > 90) return;
    const mat = new THREE.SpriteMaterial({ map: this.smokeTex, transparent: true, opacity: 0.5 * intensity, depthWrite: false });
    const sp = new THREE.Sprite(mat);
    sp.position.copy(pos);
    sp.scale.setScalar(0.7);
    this.scene.add(sp);
    this.smokes.push({ sp, vel: vel.clone(), life: 1, growth: 1.5 + Math.random() });
  }

  update(dt, vehicle) {
    // Traces
    if (vehicle.lastSkidPos === undefined) vehicle.lastSkidPos = vehicle.wheels.map(() => null);
    vehicle.wheels.forEach((w, i) => {
      const skidding = w.grounded && (w.slipMag > 0.86 || (w.surface !== 'asphalt' && w.grounded && vehicle.speedKmh > 30));
      if (skidding) {
        this.addSkidMark(w, vehicle.lastSkidPos[i], w.slipMag);
        if (Math.random() < 0.35 && w.surface !== 'asphalt') {
          this.addSmoke(w.contact, vehicle.vel.clone().multiplyScalar(0.05).setY(0.6), 0.6);
        } else if (Math.random() < 0.12 && w.slipMag > 1.05) {
          this.addSmoke(w.contact, vehicle.vel.clone().multiplyScalar(0.04).setY(0.7), 0.8);
        }
        vehicle.lastSkidPos[i] = w.contact.clone();
      } else {
        vehicle.lastSkidPos[i] = null;
      }
    });

    // Fumée existante
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.life -= dt * 0.8;
      if (s.life <= 0) {
        this.scene.remove(s.sp);
        s.sp.material.dispose();
        this.smokes.splice(i, 1);
        continue;
      }
      s.sp.position.addScaledVector(s.vel, dt);
      s.vel.multiplyScalar(1 - dt * 1.5);
      s.vel.y += dt * 0.5;
      s.sp.scale.multiplyScalar(1 + s.growth * dt);
      s.sp.material.opacity = 0.5 * s.life;
    }
  }
}

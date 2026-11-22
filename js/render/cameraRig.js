import * as THREE from 'three';

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 0; // 0 = poursuite, 1 = capot, 2 = cockpit, 3 = orbite cinéma
    this.modeNames = ['POURSUITE', 'CAPOT', 'COCKPIT', 'CINÉMA'];
    this.pos = new THREE.Vector3(0, 3, -8);
    this.look = new THREE.Vector3();
    this.orbitAngle = 0;
  }

  cycle() { this.mode = (this.mode + 1) % this.modeNames.length; return this.modeNames[this.mode]; }

  update(dt, vehicle) {
    const v = vehicle;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(v.quat);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(v.quat);
    const camTarget = new THREE.Vector3();
    let lerpPos = 8, lerpLook = 10;

    if (this.mode === 0) {
      // Poursuite : recul dynamique avec la vitesse
      const speed = v.vel.length();
      const dist = 6.2 + speed * 0.09;
      const height = 2.3 + speed * 0.012;
      camTarget.copy(v.pos).addScaledVector(fwd, -dist).addScaledVector(up, height).setY(v.pos.y + height);
      lerpPos = 5.5; lerpLook = 9;
      this.look.lerp(v.pos.clone().addScaledVector(fwd, 3.5).setY(v.pos.y + 0.8), 1 - Math.exp(-lerpLook * dt));
    } else if (this.mode === 1) {
      camTarget.copy(v.pos).addScaledVector(fwd, 0.6).addScaledVector(up, 0.95);
      this.look.copy(v.pos).addScaledVector(fwd, 20).setY(v.pos.y + 1.0);
      lerpPos = 22;
    } else if (this.mode === 2) {
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(v.quat);
      camTarget.copy(v.pos).addScaledVector(fwd, 0.12).addScaledVector(right, -0.36).addScaledVector(up, 1.02);
      this.look.copy(v.pos).addScaledVector(fwd, 25).addScaledVector(right, -0.36).setY(v.pos.y + 0.9);
      lerpPos = 30;
    } else {
      this.orbitAngle += dt * 0.25;
      const r = 13;
      camTarget.copy(v.pos).add(new THREE.Vector3(Math.cos(this.orbitAngle) * r, 5.5, Math.sin(this.orbitAngle) * r));
      this.look.lerp(v.pos.clone().setY(v.pos.y + 0.8), 1 - Math.exp(-6 * dt));
      lerpPos = 5;
    }

    this.pos.lerp(camTarget, 1 - Math.exp(-lerpPos * dt));
    // Anti-collision caméra/sol
    const minY = Math.max(0.6, (v.ground?.heightAt?.(this.pos.x, this.pos.z) ?? 0) + 0.7);
    if (this.pos.y < minY) this.pos.y = minY;

    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);

    // FOV dynamique (sensation de vitesse)
    const speed = v.vel.length();
    const targetFov = 62 + Math.min(18, speed * 0.28);
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 3);
    this.camera.updateProjectionMatrix();

    // Léger roulis de caméra avec l'accélération latérale
    if (this.mode === 0) {
      this.camera.rotateZ(-vehicle.latAccel * 0.004);
    }
  }
}

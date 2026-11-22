import { Vehicle } from '../js/physics/vehicle.js';
import { Vector3 } from 'three';

class FakeGround {
  heightAt() { return 0; }
  normalAt() { return new Vector3(0, 1, 0); }
  surfaceAt() { return 'asphalt'; }
  curvatureAt() { return null; }
  raycast(origin, dir, maxDist) {
    if (dir.y >= -0.05) return null;
    let t = 0;
    const step = Math.max(0.5, maxDist / 24);
    while (t < maxDist) {
      t = Math.min(t + step, maxDist);
      if (origin.y + dir.y * t <= 0) return { t, height: 0 };
    }
    return null;
  }
}

const v = new Vehicle(new FakeGround());
v.reset(new Vector3(0, 0.7, 0), 0);
const dt = 1 / 120;

// Accélération jusqu'à ~100 km/h
for (let i = 0; i < 120 * 6; i++) {
  v.step(dt, { throttle: 1, brake: 0, steer: 0, handbrake: false, shiftUp: false, shiftDown: false });
}
console.log(`0-100km/h: ${v.speedKmh.toFixed(0)} km/h gear=${v.gearLabel} rpm=${v.engineRpm.toFixed(0)}`);

// Plein gaz -> virage maintenu
let latSum = 0, n = 0;
const start = new Vector3().copy(v.pos);
for (let i = 0; i < 120 * 5; i++) {
  v.step(dt, { throttle: 0.5, brake: 0, steer: 1, handbrake: false, shiftUp: false, shiftDown: false });
  latSum += Math.abs(v.latAccel); n++;
}
const heading = Math.atan2(v.forward(new Vector3()).x, v.forward(new Vector3()).z);
console.log(`virage 5s: yaw final=${(heading * 180 / Math.PI).toFixed(0)}°, latAccel moy=${(latSum / n / 9.81).toFixed(2)}g, upY=${v.up(new Vector3()).y.toFixed(3)}`);

// Freinage d'urgence
for (let i = 0; i < 120 * 5; i++) {
  v.step(dt, { throttle: 0, brake: 1, steer: 0, handbrake: false, shiftUp: false, shiftDown: false });
}
console.log(`freinage: speed=${v.speedKmh.toFixed(0)} km/h`);

// Marche arrière : frein à l'arrêt puis R
v.autoShift = false;
for (let i = 0; i < 60; i++) v.step(dt, { throttle: 0, brake: 1, steer: 0 });
v.gearIndex = -1;
for (let i = 0; i < 120 * 3; i++) {
  v.step(dt, { throttle: 1, brake: 0, steer: 0, handbrake: false });
}
const fwd = v.forward(new Vector3());
console.log(`reverse: vitesse le long du capot=${v.vel.dot(fwd).toFixed(1)} m/s mesh... (${v.pos.x.toFixed(1)},${v.pos.z.toFixed(1)}) upY=${v.up(new Vector3()).y.toFixed(3)}`);
console.log(isFinite(v.pos.x) ? 'FINITE-OK' : 'NaN!');

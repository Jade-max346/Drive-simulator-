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
let exploded = false;
for (let i = 0; i < 120 * 20; i++) {
  const t = i * dt;
  const throttle = t < 0.5 ? 0 : 1;
  const steer = (t > 8 && t < 14) ? 0.35 : 0;
  v.step(dt, { throttle, brake: 0, steer, handbrake: false, shiftUp: false, shiftDown: false });
  if (!isFinite(v.pos.x + v.pos.y + v.pos.z + v.quat.x + v.quat.y + v.angVel.x + v.angVel.y)) { exploded = true; break; }
  if (i % 120 === 0) {
    console.log(`t=${t.toFixed(1)}s pos=(${v.pos.x.toFixed(1)},${v.pos.z.toFixed(1)}) speed=${v.speedKmh.toFixed(1)}km/h rpm=${v.engineRpm.toFixed(0)} gear=${v.gearLabel} upY=${v.up(new Vector3()).y.toFixed(3)} grounded=${v.wheels.filter(w => w.grounded).length}`);
  }
}
console.log(exploded ? 'EXPLODED' : 'STABLE');
for (let i = 0; i < 120 * 6; i++) {
  v.step(dt, { throttle: 0, brake: 1, steer: 0, handbrake: false, shiftUp: false, shiftDown: false });
}
console.log(`after braking: speed=${v.speedKmh.toFixed(1)} km/h`);

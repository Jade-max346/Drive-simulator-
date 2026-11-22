import { Vehicle } from '../js/physics/vehicle.js';
import { Vector3 } from 'three';
class FG {
  heightAt() { return 0; }
  normalAt() { return new Vector3(0, 1, 0); }
  surfaceAt() { return 'asphalt'; }
  curvatureAt() { return null; }
  raycast(o, d, m) {
    if (d.y >= -0.05) return null;
    let t = 0; const step = Math.max(0.5, m / 24);
    while (t < m) { t = Math.min(t + step, m); if (o.y + d.y * t <= 0) return { t, height: 0 }; }
    return null;
  }
}
const v = new Vehicle(new FG());
v.reset(new Vector3(0, 0.7, 0), 0);
const dt = 1 / 120;
// frein tenu à l'arrêt -> R
for (let i = 0; i < 120 * 3; i++) v.step(dt, { throttle: 0, brake: 1, steer: 0, handbrake: false });
console.log('gear après frein à l\'arrêt :', v.gearLabel);
// gaz en R -> recule
for (let i = 0; i < 120 * 2; i++) v.step(dt, { throttle: 1, brake: 0, steer: 0, handbrake: false });
console.log('recule :', v.speedKmh.toFixed(1), 'km/h branche derrière le capot:', (v.vel.dot(v.forward(new Vector3()))).toFixed(2), 'm/s');
// frein -> repasse en avant
for (let i = 0; i < 120 * 3; i++) v.step(dt, { throttle: 0, brake: 1, steer: 0, handbrake: false });
console.log('gear après frein en R :', v.gearLabel);
for (let i = 0; i < 120 * 3; i++) v.step(dt, { throttle: 1, brake: 0, steer: 0, handbrake: false });
console.log('avance :', v.speedKmh.toFixed(1), 'km/h branche :', (v.vel.dot(v.forward(new Vector3()))).toFixed(2), 'm/s');
console.log(isFinite(v.pos.x) ? 'FINITE-OK' : 'NaN!');

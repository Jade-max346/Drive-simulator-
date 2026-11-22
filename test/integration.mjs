import { Track } from '../js/world/track.js';
import { Ground } from '../js/physics/ground.js';
import { Vehicle } from '../js/physics/vehicle.js';
import { Vector3 } from 'three';

class HeadlessTrack extends Track {
  buildMeshes() {
    this.startPos = this.samples[0].p.clone();
    this.startHeading = Math.atan2(this.samples[1].tan.x, this.samples[1].tan.z);
  }
}

const track = new HeadlessTrack();
const ground = new Ground(track);

[track.startPos.x, track.startPos.z].forEach((v) => {
  if (!isFinite(v)) throw new Error('startPos non fini');
});

const v = new Vehicle(ground);
const spawn = track.startPos.clone().add(track.samples[8].tan.clone().multiplyScalar(-9));

let maxLatAccel = 0, maxSpeed = 0, exploded = false;
const dt = 1 / 120;
for (let i = 0; i < 120 * 25; i++) {
  const t = i * dt;
  const steer = ((t > 4 && t < 9) ? 0.5 : 0) + ((t > 14 && t < 19) ? -0.5 : 0);
  v.step(dt, { throttle: 1, brake: 0, steer, handbrake: t > 9 && t < 11, shiftUp: t > 12 && t < 12.1, shiftDown: false });
  if (!isFinite(v.pos.x + v.pos.z + v.quat.x + v.angVel.y)) { exploded = true; break; }
  maxSpeed = Math.max(maxSpeed, v.speedKmh);
  maxLatAccel = Math.max(maxLatAccel, Math.abs(v.latAccel));
}
const d = track.distanceToCenterline(v.pos.x, v.pos.z);
console.log(`0-100 à 2 tours d'essai: maxSpeed=${maxSpeed.toFixed(0)} km/h, latAccelMax=${(maxLatAccel / 9.81).toFixed(2)} g`);
console.log(`position finale à ${d.toFixed(1)} m de la ligne médiane, ${exploded ? 'EXPLODED' : 'STABLE'}`);
if (exploded || !(v.pos.x && v.pos.z && isFinite(v.pos.x) && isFinite(v.pos.z))) {
  console.error('TEST ÉCHEC');
  process.exit(1);
}
console.log('INTEGRATION-OK');

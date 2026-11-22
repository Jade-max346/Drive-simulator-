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
const spawn = track.startPos.clone().add(track.samples[8].tan.clone().multiplyScalar(-9));

console.log(`spawn : d centre=${track.distanceToCenterline(spawn.x, spawn.z).toFixed(1)} m, hauteur=${ground.heightAt(spawn.x, spawn.z).toFixed(2)} m`);

const v = new Vehicle(ground);
v.reset(spawn.setY(0.7), track.startHeading);
const dt = 1 / 120;
let maxSpeed = 0;
for (let i = 0; i < 120 * 10; i++) {
  v.step(dt, { throttle: 1, brake: 0, steer: 0, handbrake: false });
  maxSpeed = Math.max(maxSpeed, v.speedKmh);
}
console.log(`ligne droite 10s : ${maxSpeed.toFixed(0)} km/h, d=${track.distanceToCenterline(v.pos.x, v.pos.z).toFixed(1)} m, upY=${v.up(new Vector3()).y.toFixed(3)}`);

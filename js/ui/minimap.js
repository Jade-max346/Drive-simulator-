import * as THREE from 'three';

export class Minimap {
  constructor(track, vehicle) {
    this.track = track;
    this.vehicle = vehicle;
    this.canvas = document.getElementById('minimap');
    this.ctx = this.canvas.getContext('2d');
    this.path2D = null;
    this.bounds = this.computeBounds();
    this.scale = Math.min(190 / this.bounds.w, 190 / this.bounds.h);
  }

  computeBounds() {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const s of this.track.samples) {
      minX = Math.min(minX, s.p.x); maxX = Math.max(maxX, s.p.x);
      minZ = Math.min(minZ, s.p.z); maxZ = Math.max(maxZ, s.p.z);
    }
    return { minX, minZ, w: maxX - minX, h: maxZ - minZ };
  }

  toCanvas(x, z) {
    const cx = 110, cy = 110;
    return [
      cx + (x - this.bounds.minX - this.bounds.w / 2) * this.scale,
      cy + (z - this.bounds.minZ - this.bounds.h / 2) * this.scale,
    ];
  }

  buildPath() {
    const p = new Path2D();
    const n = this.track.samples.length;
    const start = this.toCanvas(this.track.samples[0].p.x, this.track.samples[0].p.z);
    p.moveTo(start[0], start[1]);
    for (let i = 1; i < n; i += 3) {
      const s = this.track.samples[i];
      const [x, y] = this.toCanvas(s.p.x, s.p.z);
      p.lineTo(x, y);
    }
    p.closePath();
    return p;
  }

  draw() {
    if (!this.path2D) this.path2D = this.buildPath();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, 220, 220);

    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 6;
    ctx.stroke(this.path2D);
    ctx.strokeStyle = 'rgba(20,25,40,0.9)';
    ctx.lineWidth = 4;
    ctx.stroke(this.path2D);

    // Ligne de départ
    const [sx, sy] = this.toCanvas(this.track.startPos.x, this.track.startPos.z);
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(sx - 3, sy - 3, 6, 6);

    // Voiture
    const [x, y] = this.toCanvas(this.vehicle.pos.x, this.vehicle.pos.z);
    const v = this.vehicle;
    const fwd = v.forward(new THREE.Vector3());
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(fwd.x, -fwd.z));
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4.4, 5); ctx.lineTo(-4.4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

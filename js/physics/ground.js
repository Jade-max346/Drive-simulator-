import * as THREE from 'three';

export class Ground {
  constructor(track) {
    this.track = track;
    this.tmp = new THREE.Vector3();
  }

  heightAt(x, z) {
    const d = this.track.distanceToCenterline(x, z);
    const halfW = this.track.halfWidth + 2.5;
    if (d < halfW) return 0;
    const t = d - halfW;
    const hills =
      0.9 * Math.sin(x * 0.011 + 1.7) * Math.cos(z * 0.013 - 0.6) +
      0.5 * Math.sin(x * 0.031 - 2.1) * Math.sin(z * 0.027 + 0.4) +
      1.6 * Math.sin((x + z) * 0.0055);
    return hills * Math.min(1, t / 25);
  }

  surfaceAt(x, z) {
    return this.track.distanceToCenterline(x, z) <= this.track.halfWidth + 0.4
      ? 'asphalt'
      : 'curbOrGrass';
  }

  curvatureAt(x, z) {
    return this.track.distanceToCenterline(x, z) <= this.track.halfWidth + 1.6
      ? 'curb'
      : null;
  }

  raycast(origin, dir, maxDist) {
    if (dir.y >= -0.05) return null;
    let t = 0;
    const p = new THREE.Vector3();
    let hPrev = origin.y - this.heightAt(origin.x, origin.z);
    if (hPrev <= 0) return { t: 0, height: 0 };
    const step = Math.max(0.5, maxDist / 24);
    while (t < maxDist) {
      t = Math.min(t + step, maxDist);
      p.copy(origin).addScaledVector(dir, t);
      const h = this.heightAt(p.x, p.z);
      if (origin.y + dir.y * t <= h) {
        let lo = t - step, hi = t;
        for (let i = 0; i < 8; i++) {
          const mid = (lo + hi) / 2;
          p.copy(origin).addScaledVector(dir, mid);
          if (origin.y + dir.y * mid > this.heightAt(p.x, p.z)) lo = mid; else hi = mid;
        }
        return { t: hi, height: this.heightAt(p.x, p.z) };
      }
    }
    return null;
  }

  normalAt(x, z) {
    const e = 0.5;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return new THREE.Vector3(-hx / (2 * e), 1, -hz / (2 * e)).normalize();
  }
}

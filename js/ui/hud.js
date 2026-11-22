import { G } from '../physics/vehicle.js';

function fmtTime(s) {
  if (s == null) return '—';
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec < 10 ? '0' : ''}${sec.toFixed(2)}`;
}

export class Hud {
  constructor(vehicle, cameraRig) {
    this.vehicle = vehicle;
    this.cameraRig = cameraRig;
    this.el = {
      speed: document.getElementById('speed-val'),
      gear: document.getElementById('gear-val'),
      lapNum: document.getElementById('lap-num'),
      current: document.getElementById('lap-current'),
      last: document.getElementById('lap-last'),
      best: document.getElementById('lap-best'),
      tach: document.getElementById('tach'),
      gforce: document.getElementById('gforce'),
    };
    this.tachCtx = this.el.tach.getContext('2d');
    this.gfCtx = this.el.gforce.getContext('2d');
    this.shiftFlash = 0;
  }

  setLaps(lapState) {
    this.el.lapNum.textContent = lapState.lapCount > 0 ? String(lapState.lapCount + 1) : '—';
    this.el.last.textContent = fmtTime(lapState.last);
    this.el.best.textContent = fmtTime(lapState.best);
    this.el.last.classList.toggle('best', false);
    this.el.best.classList.toggle('best', true);
  }

  drawTach() {
    const v = this.vehicle;
    const ctx = this.tachCtx;
    const W = 260, H = 150, cx = 130, cy = 128, R = 96;
    ctx.clearRect(0, 0, W, H);

    const a0 = Math.PI, a1 = 2 * Math.PI;
    const maxRpm = 8000;
    const frac = Math.min(1, v.engineRpm / maxRpm);

    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.arc(cx, cy, R, a0, a1);
    ctx.stroke();

    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, '#37d67a');
    grad.addColorStop(0.62, '#ffd166');
    grad.addColorStop(0.85, '#ff8c42');
    grad.addColorStop(1, '#ff4d4d');
    ctx.strokeStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, R, a0, a0 + (a1 - a0) * frac);
    ctx.stroke();

    // Zone rouge
    const rl = (v.revLimit + 200) / maxRpm;
    ctx.strokeStyle = 'rgba(255,60,60,0.5)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, R + 10, a0 + (a1 - a0) * rl, a1);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = '600 12px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(v.engineRpm / 10) / 100} ×1000 tr/min`, cx, cy - 14);

    // Flash rupteur
    this.shiftFlash = v.engineRpm > v.revLimit - 150 ? 1 : Math.max(0, this.shiftFlash - 0.05);
    if (this.shiftFlash > 0.02) {
      ctx.fillStyle = `rgba(255,60,60,${0.5 * this.shiftFlash})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  drawGForce() {
    const v = this.vehicle;
    const ctx = this.gfCtx;
    const W = 110, H = 110, cx = 55, cy = 55, R = 46;
    ctx.clearRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    for (const g of [0.5, 1.0, 1.5]) {
      ctx.beginPath();
      ctx.arc(cx, cy, R * (g / 1.8), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
    ctx.stroke();

    const gx = cx + (v.latAccel / G / 1.8) * R;
    const gy = cy + (v.longAccel / G / 1.8) * R;
    ctx.fillStyle = '#2b5cff';
    ctx.beginPath();
    ctx.arc(gx, gy, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  update(dt, lapTimer) {
    this.el.speed.textContent = Math.abs(Math.round(this.vehicle.speedKmh));
    this.el.gear.textContent = this.vehicle.gearLabel;
    this.el.current.textContent = fmtTime(lapTimer);
    this.drawTach();
    this.drawGForce();
  }
}

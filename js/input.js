export class InputManager {
  constructor() {
    this.keys = new Set();
    this.touch = { left: false, right: false, throttle: false, brake: false, handbrake: false };
    this.shiftUpPressed = false;
    this.shiftDownPressed = false;

    addEventListener('keydown', (e) => {
      if (e.repeat) { e.preventDefault(); return; }
      this.keys.add(e.code);
      if (e.code === 'KeyE') this.shiftUpPressed = true;
      if (e.code === 'KeyX') this.shiftDownPressed = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    const applyTouch = (name) => (on) => () => { this.touch[name] = on; };
    document.querySelectorAll('[data-touch]').forEach((btn) => {
      const name = btn.dataset.touch;
      const mk = (on) => (e) => { e.preventDefault(); this.touch[name] = on; };
      btn.addEventListener('touchstart', mk(true), { passive: false });
      btn.addEventListener('touchend', mk(false));
      btn.addEventListener('touchcancel', mk(false));
      btn.addEventListener('mousedown', mk(true));
      btn.addEventListener('mouseup', mk(false));
      btn.addEventListener('mouseleave', mk(false));
      void applyTouch;
    });

    if ('ontouchstart' in window) {
      document.getElementById('touch').classList.remove('hidden');
    }
  }

  axis(neg, pos) {
    return (this.keys.has(pos) ? 1 : 0) - (this.keys.has(neg) ? 1 : 0);
  }

  sample() {
    let steer = this.axis('ArrowLeft', 'ArrowRight');
    steer += this.axis('KeyA', 'KeyD') + this.axis('KeyQ', 'KeyD');
    if (this.touch.left) steer -= 1;
    if (this.touch.right) steer += 1;

    let throttle = 0, brake = 0;
    if (this.keys.has('KeyZ') || this.keys.has('KeyW') || this.keys.has('ArrowUp') || this.touch.throttle) throttle = 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown') || this.touch.brake) brake = 1;

    const handbrake = this.keys.has('Space') || this.touch.handbrake;

    const out = {
      throttle,
      brake,
      steer: Math.max(-1, Math.min(1, steer)),
      handbrake,
      shiftUp: this.shiftUpPressed,
      shiftDown: this.shiftDownPressed,
    };
    this.shiftUpPressed = false;
    this.shiftDownPressed = false;
    return out;
  }
}

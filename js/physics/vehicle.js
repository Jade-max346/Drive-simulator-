import * as THREE from 'three';

export const G = 9.81;

export function pacejka(s, B, C, D, E) {
  const bs = B * s;
  return D * Math.sin(C * Math.atan(bs - E * (bs - Math.atan(bs))));
}

function torqueCurve(rpm) {
  const pts = [
    [800, 170], [1500, 240], [2500, 300], [3500, 335],
    [4500, 350], [5500, 340], [6500, 300], [7200, 240], [7600, 90],
  ];
  if (rpm <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (rpm <= pts[i][0]) {
      const [r0, t0] = pts[i - 1], [r1, t1] = pts[i];
      const k = (rpm - r0) / (r1 - r0);
      return t0 + (t1 - t0) * k;
    }
  }
  return pts[pts.length - 1][1];
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

class WheelState {
  constructor(localPos, radius, opts = {}) {
    this.localPos = localPos.clone();
    this.radius = radius;
    this.isFront = opts.front ?? false;
    this.isDriven = opts.driven ?? false;
    this.maxBrake = opts.maxBrake ?? 1600;
    this.omega = 0;
    this.compression = 0;
    this.compressionRate = 0;
    this.grounded = false;
    this.contact = new THREE.Vector3();
    this.normal = new THREE.Vector3(0, 1, 0);
    this.steer = 0;        // angle radian (roues avant)
    this.spinAngle = 0;    // rotation visuelle
    this.slipRatio = 0;
    this.slipAngle = 0;
    this.slipMag = 0;
    this.loadN = 0;
    this.surface = 'asphalt';
    this.curb = null;
    this.rollingResistance = 0.013;
  }
}

export class Vehicle {
  constructor(ground) {
    this.ground = ground;

    // ---------- Châssis ----------
    this.mass = 1380;
    this.halfExtents = new THREE.Vector3(0.92, 0.34, 2.15);
    const m = this.mass, w = 2 * this.halfExtents.x, h = 2 * this.halfExtents.y, l = 2 * this.halfExtents.z;
    this.inertiaBody = new THREE.Vector3(
      (m / 12) * (h * h + l * l) * 1.35,   // tangage (renforcé : moteur bas)
      (m / 12) * (w * w + l * l) * 1.05,   // lacet
      (m / 12) * (w * w + h * h) * 1.35,   // roulis (réglé)
    );
    this.pos = new THREE.Vector3(0, 0.7, 0);
    this.quat = new THREE.Quaternion();
    this.vel = new THREE.Vector3();
    this.angVel = new THREE.Vector3();
    this.force = new THREE.Vector3();
    this.torque = new THREE.Vector3();

    // ---------- Géométrie (CoG local = origine) ----------
    this.wheelbase = 2.62;
    this.trackWidth = 1.62;
    this.wheelRadius = 0.34;
    this.cogHeight = 0.5;
    const attachY = this.cogHeight - (0.235 + this.wheelRadius * 0.6);
    const xT = this.trackWidth / 2;
    this.wheels = [
      new WheelState(new THREE.Vector3( xT, attachY,  this.wheelbase * 0.47), this.wheelRadius, { front: true,  maxBrake: 1900 }),
      new WheelState(new THREE.Vector3(-xT, attachY,  this.wheelbase * 0.47), this.wheelRadius, { front: true,  maxBrake: 1900 }),
      new WheelState(new THREE.Vector3( xT, attachY, -this.wheelbase * 0.53), this.wheelRadius, { front: false, driven: true, maxBrake: 1150 }),
      new WheelState(new THREE.Vector3(-xT, attachY, -this.wheelbase * 0.53), this.wheelRadius, { front: false, driven: true, maxBrake: 1150 }),
    ];

    // ---------- Suspensions ----------
    this.restLength = 0.24;
    this.springK = 68000;
    this.dampBounce = 5200;
    this.dampRebound = 7400;
    this.arbStiffnessF = 28000;
    this.arbStiffnessR = 18000;

    // ---------- Pneus (Pacejka simplifié) ----------
    this.muAsphalt = 1.28;
    this.muGrass = 0.55;
    this.muCurb = 1.0;
    this.tireBx = 11.0; this.tireCx = 1.65; this.tireEx = 0.92;
    this.tireBy = 9.5;  this.tireCy = 1.4;  this.tireEy = 0.97;
    this.loadSensRef = 3600;

    // ---------- Aéro ----------
    this.dragCoeff = 0.5 * 1.225 * 0.32 * 2.1;  // ½ρCdA
    this.downforceCoeff = 2.4;                  // F = k·v²
    this.yawDamping = 0.35;

    // ---------- Transmisson ----------
    this.gearRatios = [3.55, 2.24, 1.62, 1.27, 1.03, 0.85];
    this.reverseRatio = 3.4;
    this.finalDrive = 3.62;
    this.drivelineEff = 0.91;
    this.autoShift = true;
    this.gearIndex = 0;        // 0 = 1re ; -1 = marche AR ; -2 = point mort
    this.shiftLockout = 0;
    this.revLimit = 7300;
    this.idleRpm = 950;

    // Internal
    this.engineRpm = this.idleRpm;
    this.throttle = 0;
    this.brakeIn = 0;
    this.steerIn = 0;
    this.handbrake = false;
    this.steerAngle = 0;
    this.absActive = false;
    this.tcActive = false;

    // Telemetry pour HUD / audio
    this.speedKmh = 0;
    this.longAccel = 0;
    this.latAccel = 0;
    this.prevVel = new THREE.Vector3();
    this.wheelSpinSm = 0;
    this.onGround = false;

    // Corps souple simplifié pour les chocs "carrosserie"
    this._cornerPts = [];
    const he = this.halfExtents;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      this._cornerPts.push(new THREE.Vector3(sx * he.x, sy * he.y, sz * he.z));
    }
    this._tmpA = new THREE.Vector3();
    this._tmpB = new THREE.Vector3();
    this._tmpC = new THREE.Vector3();
    this._tmpQ = new THREE.Quaternion();
    this._invQ = new THREE.Quaternion();
  }

  reset(position, heading) {
    this.pos.copy(position);
    this.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
    this.vel.set(0, 0, 0);
    this.angVel.set(0, 0, 0);
    this.gearIndex = 0;
    this.engineRpm = this.idleRpm;
    for (const w of this.wheels) w.omega = 0;
    this.steerAngle = 0;
    this.prevVel.copy(this.vel);
  }

  forward(out) { return out.set(0, 0, 1).applyQuaternion(this.quat); }
  right(out) { return out.set(1, 0, 0).applyQuaternion(this.quat); }
  up(out) { return out.set(0, 1, 0).applyQuaternion(this.quat); }

  setInputs({ throttle = 0, brake = 0, steer = 0, handbrake = false, shiftUp = false, shiftDown = false }) {
    this.throttle = throttle;
    this.brakeIn = brake;
    this.steerIn = steer;
    this.handbrake = handbrake;
    if (shiftUp) this.manualShift(1);
    if (shiftDown) this.manualShift(-1);
  }

  manualShift(dir) {
    if (this.autoShift || this.shiftLockout > 0) return;
    if (dir > 0) {
      if (this.gearIndex === -1) this.gearIndex = -2;         // R → N
      else if (this.gearIndex === -2) this.gearIndex = 0;     // N → 1
      else if (this.gearIndex < this.gearRatios.length - 1) this.gearIndex++;
    } else {
      if (this.gearIndex === -2) this.gearIndex = -1;
      else if (this.gearIndex === 0) this.gearIndex = -2;
      else if (this.gearIndex > 0) this.gearIndex--;
    }
    this.shiftLockout = 0.25;
  }

  currentRatio() {
    if (this.gearIndex === -1) return -this.reverseRatio;
    if (this.gearIndex === -2) return 0;
    return this.gearRatios[this.gearIndex];
  }

  get gearLabel() {
    if (this.gearIndex === -1) return 'R';
    if (this.gearIndex === -2) return 'N';
    return String(this.gearIndex + 1);
  }

  muForSurface(surface) {
    if (surface === 'grass') return this.muGrass;
    if (surface === 'curb') return this.muCurb;
    return this.muAsphalt;
  }

  step(dt, input) {
    this.setInputs(input);
    this.force.set(0, -this.mass * G, 0);
    this.torque.set(0, 0, 0);

    this.shiftLockout = Math.max(0, this.shiftLockout - dt);

    const fwd = this.forward(this._tmpA.clone());
    const right = this.right(this._tmpB.clone());
    const up = this.up(this._tmpC.clone());

    // ------- Direction (assistée, réduite à haute vitesse) -------
    const speed = this.vel.length();
    this.speedKmh = this.vel.dot(fwd) * 3.6;
    const maxSteer = 0.55 / (1 + speed * speed * 0.0022) + 0.045;
    const target = this.steerIn * maxSteer;
    const steerRate = 4.5;
    this.steerAngle += clamp(target - this.steerAngle, -steerRate * dt, steerRate * dt);

    // ------- Moteur / transmission -------
    const ratio = this.currentRatio();
    const drivenWheels = this.wheels.filter((w) => w.isDriven);
    const rearOmega = (drivenWheels[0].omega + drivenWheels[1].omega) * 0.5;
    let rpm = ratio !== 0 && ratio !== -0
      ? rearOmega * Math.abs(ratio) * this.finalDrive * 60 / (2 * Math.PI)
      : this.idleRpm;
    if (this.gearIndex === -2) rpm = this.idleRpm + this.throttle * 5200;
    rpm = clamp(rpm, this.idleRpm, 7800);
    if (rpm >= this.revLimit) rpm = this.revLimit;
    this.engineRpm += (rpm - this.engineRpm) * Math.min(1, dt * 14);

    let engineTorque = torqueCurve(this.engineRpm) * this.throttle;
    if (this.engineRpm >= this.revLimit) engineTorque = 0;                     // rupteur
    if (this.throttle < 0.05) engineTorque = -(30 + this.engineRpm * 0.011);   // frein moteur
    if (this.shiftLockout > 0) engineTorque *= 0.15;

    let driveshaftT = engineTorque * ratio * this.finalDrive * this.drivelineEff;
    if (this.autoShift && ratio === -this.reverseRatio) {
      // En R : frein presque à l'arrêt -> repasse en avant
      if (this.brakeIn > 0.5 && this.speedKmh > -3 && this.shiftLockout <= 0) {
        this.gearIndex = 0;
        this.shiftLockout = 0.4;
      }
    } else if (this.autoShift && ratio > 0 && this.speedKmh < 4 && this.brakeIn > 0.85 && this.shiftLockout <= 0) {
      // À l'arrêt, frein enfoncé -> marche arrière
      this.gearIndex = -1;
      this.shiftLockout = 0.5;
    } else if (this.autoShift && ratio > 0) {
      // Boîte automatique
      if (this.engineRpm > 6650 && this.gearIndex < this.gearRatios.length - 1 && this.shiftLockout <= 0) {
        this.gearIndex++;
        this.shiftLockout = 0.28;
      } else if (this.engineRpm < 2350 && this.gearIndex > 0 && this.shiftLockout <= 0) {
        this.gearIndex--;
        this.shiftLockout = 0.22;
      } else if (this.speedKmh < 8 && this.gearIndex > 2 && this.shiftLockout <= 0) {
        this.gearIndex = 0;
      }
    }

    // ------- Boucle roues -------
    this.absActive = false;
    this.tcActive = false;
    let groundedCount = 0;
    const comps = [[], []]; // comps[0] = avant, comps[1] = arrière  (gauche, droite)

    const invFzSens = 1 / this.loadSensRef;
    for (let i = 0; i < this.wheels.length; i++) {
      const wheel = this.wheels[i];
      if (wheel.isFront) wheel.steer = this.steerAngle;

      // Position et repère
      const attach = wheel.localPos.clone().applyQuaternion(this.quat).add(this.pos);
      const down = up.clone().negate();
      const rayLen = this.restLength + this.wheelRadius + 0.05;
      const hit = this.ground.raycast(attach, down, rayLen);
      const vAttach = this._velAt(attach);

      if (!hit) {
        wheel.grounded = false;
        wheel.compression = 0;
        wheel.loadN = 0;
        wheel.slipMag = 0;
        wheel.surface = this.groundTrackSurface(attach);
        const driveT = wheel.isDriven && ratio !== 0 ? driveshaftT / drivenWheels.length : 0;
        const brakeT = this.brakeIn * wheel.maxBrake * 0.25;
        let netT = driveT - Math.sign(wheel.omega) * brakeT;
        if (wheel.isDriven && this.handbrake) netT -= Math.sign(wheel.omega) * 2600;
        wheel.omega += (netT / 1.6) * dt;
        wheel.omega *= 0.99;
        continue;
      }

      wheel.grounded = true;
      groundedCount++;
      const suspLen = clamp(hit.t - this.wheelRadius, 0, this.restLength);
      wheel.compression = this.restLength - suspLen;
      const compRate = vAttach.dot(down);   // >0 : compression (attach descend vers le sol)
      wheel.compressionRate = compRate;

      wheel.contact.copy(attach).addScaledVector(down, hit.t);
      wheel.normal = this.ground.normalAt(wheel.contact.x, wheel.contact.z).clone();

      // Surface
      const surfInfo = this.groundTrackSurface(wheel.contact);
      wheel.surface = surfInfo;
      wheel.curb = this.ground.curvatureAt(wheel.contact.x, wheel.contact.z);

      // ------- Charge verticale (ressort + amortisseur) -------
      let Fz = this.springK * wheel.compression;
      Fz += compRate > 0 ? this.dampBounce * compRate : this.dampRebound * compRate;
      Fz = clamp(Fz, 0, this.springK * this.restLength * 2.4);
      this.force.addScaledVector(up, Fz);
      this.torque.add(_cross(this._tmpA.copy(attach).sub(this.pos), this._tmpB.copy(up).multiplyScalar(Fz)));
      wheel.loadN = Fz;

      // ------- Repère du pneu (projeté sur le sol) -------
      let wheelFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.quat);
      if (wheel.isFront) wheelFwd.applyAxisAngle(up, wheel.steer);
      wheelFwd.addScaledVector(wheel.normal, -wheelFwd.dot(wheel.normal)).normalize();
      const wheelRight = new THREE.Vector3().crossVectors(wheel.normal, wheelFwd).normalize();

      const rContact = this._tmpA.copy(wheel.contact).sub(this.pos);
      const vC = this._tmpB.copy(this.vel).add(_cross(this._tmpC.copy(this.angVel), rContact));
      const vLon = vC.dot(wheelFwd);
      const vLat = vC.dot(wheelRight);

      // ------- Glissements -------
      const denom = Math.max(Math.abs(vLon), 2.5);
      const slipRatio = (wheel.omega * this.wheelRadius - vLon) / denom;
      const slipTangent = vLat / denom;
      wheel.slipRatio = slipRatio;
      wheel.slipAngle = Math.atan2(vLat, Math.abs(vLon) + 1);

      // Charge dynamique partagée (aéro + ARB ajoutés après la boucle ? non, ARB ici pour la réactivité)
      const mu = this.muForSurface(surfInfo);
      const loadSens = clamp(mu * (1 - 0.07 * (Fz * invFzSens - 1)), 0.4, mu * 1.05);
      const Fmax = loadSens * Fz;

      // Forces pneumatiques de base
      let Fx = (pacejka(slipRatio, this.tireBx, this.tireCx, 1, this.tireEx)) * Fmax;
      let Fy = (pacejka(-slipTangent, this.tireBy, this.tireCy, 1, this.tireEy)) * Fmax;

      // ABS / antipatinage : coupe la puissance ou module le frein si glissement excessif
      const combinedAbs = Math.hypot(slipRatio / 0.35, slipTangent / 0.35);
      if (combinedAbs > 1.6 && speed > 3) {
        if (wheel.isDriven && this.throttle > 0.1 && slipRatio > 0.25) this.tcActive = true;
        if (this.brakeIn > 0.1 && slipRatio < -0.3) this.absActive = true;
      }

      // Ellipse de friction (limite combinée)
      const fxn = Fx / Fmax, fyn = Fy / Fmax;
      const mag = Math.hypot(fxn, fyn);
      if (mag > 1) { Fx /= mag; Fy /= mag; }
      wheel.slipMag = mag;

      // Applications
      const Fvec = new THREE.Vector3()
        .addScaledVector(wheelFwd, Fx)
        .addScaledVector(wheelRight, Fy);
      this.force.add(Fvec);
      this.torque.add(_cross(rContact, Fvec));

      // ------- Dynamique de rotation de la roue -------
      const Iw = wheel.isDriven ? 1.5 : 0.9;
      let driveT = wheel.isDriven && ratio !== 0 ? driveshaftT / drivenWheels.length : 0;
      if (wheel.isFront) driveT = 0;
      let brakeT = this.brakeIn * wheel.maxBrake;
      if (this.absActive && slipRatio < -0.3) brakeT *= 0.25;
      if (this.tcActive && wheel.isDriven && slipRatio > 0.25) driveT *= 0.55;
      if (this.handbrake && !wheel.isFront) brakeT = Math.max(brakeT, 2800);

      let netT = driveT - Math.sign(wheel.omega) * brakeT - Fx * this.wheelRadius
                 - Math.sign(wheel.omega) * wheel.rollingResistance * Fz * this.wheelRadius * 0.3;
      if (Math.abs(wheel.omega) < 0.5 && Math.abs(driveT) < Math.abs(brakeT) + Math.abs(Fx * this.wheelRadius)) {
        // roue bloquée par le frein : on maintient
        wheel.omega *= 0.2;
        netT = driveT - Fx * this.wheelRadius;
      }
      wheel.omega += (netT / Iw) * dt;
      wheel.spinAngle += wheel.omega * dt;

      comps[wheel.isFront ? 0 : 1].push(wheel.compression);
    }

    this.onGround = groundedCount >= 3;

    // ------- Barres anti-roulis -------
    if (comps[0].length === 2) {
      const dF = this.arbStiffnessF * (comps[0][0] - comps[0][1]) * 0.5;
      this.applyArbForce(this.wheels[0], dF, up);
      this.applyArbForce(this.wheels[1], -dF, up);
    }
    if (comps[1].length === 2) {
      const dF = this.arbStiffnessR * (comps[1][0] - comps[1][1]) * 0.5;
      this.applyArbForce(this.wheels[2], dF, up);
      this.applyArbForce(this.wheels[3], -dF, up);
    }

    // ------- Aérodynamique -------
    const v = this.vel;
    const vAir = v.length();
    if (vAir > 0.1) {
      const drag = this.dragCoeff * vAir;
      this.force.addScaledVector(v, -drag);
      if (this.onGround) this.force.addScaledVector(up, -this.downforceCoeff * vAir * vAir * 0.25);
      // résistance au roulement (~ appliquée aux roues déjà, résidu global)
      this.force.addScaledVector(v.clone().normalize(), -this.onGround ? 12 : 0);
    }

    // ------- Amortissement en lacet (stabilité) -------
    const localAngVel = this._tmpA.copy(this.angVel).applyQuaternion(this._invQ.copy(this.quat).invert());
    this.torque.addScaledVector(up, -localAngVel.y * this.yawDamping * this.speedKmh * 0.05);

    // ------- Collision carrosserie / sol -------
    this.resolveBodyCollision();

    // ------- Intégration -------
    this.prevVel.copy(this.vel);
    const acc = this.force.divideScalar(this.mass);
    this.vel.addScaledVector(acc, dt);
    this.pos.addScaledVector(this.vel, dt);

    // α = I⁻¹ (τ − ω × (Iω))
    const Iworld = new Diag3(this.inertiaBody).rotated(this.quat).m;
    const invIworld = new Diag3(this.inertiaBody).rotated(this.quat).inverse().m;
    const Iomega = this.angVel.clone().applyMatrix3(Iworld);
    const gyro = new THREE.Vector3().crossVectors(this.angVel, Iomega);
    const alpha = this.torque.clone().sub(gyro).applyMatrix3(invIworld);
    this.angVel.addScaledVector(alpha, dt);
    this.angVel.multiplyScalar(1 / (1 + 0.06 * dt));    // amortissement structurel

    // q̇ = ½ ω q
    const w = this.angVel;
    const dq = new THREE.Quaternion(w.x, w.y, w.z, 0).multiply(this.quat);
    this.quat.x += 0.5 * dq.x * dt;
    this.quat.y += 0.5 * dq.y * dt;
    this.quat.z += 0.5 * dq.z * dt;
    this.quat.w += 0.5 * dq.w * dt;
    this.quat.normalize();

    // Télémétrie
    const accWorld = acc.clone();
    this.longAccel = accWorld.dot(fwd);
    this.latAccel = accWorld.dot(right);
    this.wheelSpinSm = this.wheels.slice(2).reduce((a, w2) => a + Math.abs(w2.omega), 0) / 2;
  }

  applyArbForce(wheel, dF, up) {
    if (!wheel.grounded || Math.abs(dF) < 1) return;
    const attach = wheel.localPos.clone().applyQuaternion(this.quat).add(this.pos);
    this.force.addScaledVector(up, dF);
    this.torque.add(_cross(this._tmpA.copy(attach).sub(this.pos), this._tmpB.copy(up).multiplyScalar(dF)));
    wheel.loadN += dF;
  }

  groundTrackSurface(p) {
    const surf = this.ground.surfaceAt(p.x, p.z);
    return surf === 'asphalt' ? 'asphalt' : this.ground.curvatureAt(p.x, p.z) ? 'curb' : 'grass';
  }

  velAtPoint(p, out) {
    out = out || new THREE.Vector3();
    const r = new THREE.Vector3().copy(p).sub(this.pos);
    return out.copy(this.vel).add(new THREE.Vector3().crossVectors(this.angVel, r));
  }

  _velAt(p, out) { return this.velAtPoint(p, out); }

  _worldInertia() {
    return new Diag3(this.inertiaBody).rotated(this.quat);
  }

  _worldInvInertia() {
    return { m: new Diag3(this.inertiaBody).rotated(this.quat).inverse().m, apply: (v) => v.clone().applyMatrix3(this._worldInvInertia().m) };
  }

  resolveBodyCollision() {
    let worst = null;
    for (const cp of this._cornerPts) {
      const wp = cp.clone().applyQuaternion(this.quat).add(this.pos);
      const gy = this.ground.heightAt(wp.x, wp.z);
      const d = gy - wp.y;
      if (d > 0 && (!worst || d > worst.depth)) worst = { corner: cp, depth: d, wp };
    }
    if (!worst) return;

    const r = worst.corner.clone().applyQuaternion(this.quat);
    const n = this.ground.normalAt(worst.wp.x, worst.wp.z);
    const invI = new Diag3(this.inertiaBody).rotated(this.quat).inverse().m;

    const vP = this.velAtPoint(worst.wp, new THREE.Vector3());
    const vn = vP.dot(n);
    if (vn < 0) {
      const rn = new THREE.Vector3().crossVectors(r, n);
      const denom = 1 / this.mass + rn.clone().applyMatrix3(invI).dot(rn);
      const j = (-1.35 * vn) / Math.max(denom, 1e-6);
      this.vel.addScaledVector(n, j / this.mass);
      this.angVel.addScaledVector(rn.clone().multiplyScalar(j).applyMatrix3(invI), 1);
    }
    const vP2 = this.velAtPoint(worst.wp, new THREE.Vector3());
    const vt = vP2.addScaledVector(n, -vP2.dot(n));
    this.vel.addScaledVector(vt, -0.35);
    if (worst.depth > 0.02) this.pos.addScaledVector(n, worst.depth * 0.8);
  }
}

class Diag3 {
  constructor(d) { this.d = d.clone(); this.q = new THREE.Quaternion(); this.m = new THREE.Matrix3(); }

  rotated(q) {
    this.q.copy(q);
    this.compute(this.d);
    return this;
  }

  inverse() {
    this.compute(new THREE.Vector3(1 / this.d.x, 1 / this.d.y, 1 / this.d.z));
    return this;
  }

  compute(diag) {
    const axes = [
      new THREE.Vector3(1, 0, 0).applyQuaternion(this.q),
      new THREE.Vector3(0, 1, 0).applyQuaternion(this.q),
      new THREE.Vector3(0, 0, 1).applyQuaternion(this.q),
    ];
    const dg = [diag.x, diag.y, diag.z];
    const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++) {
      const a = axes[i];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          M[r][c] += dg[i] * a.getComponent(r) * a.getComponent(c);
        }
      }
    }
    this.m.set(M[0][0], M[0][1], M[0][2], M[1][0], M[1][1], M[1][2], M[2][0], M[2][1], M[2][2]);
  }

  apply(v) { return v.clone().applyMatrix3(this.m); }
}

function _cross(a, b) {
  return new THREE.Vector3().crossVectors(a, b);
}

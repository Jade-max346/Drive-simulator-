import * as THREE from 'three';

function makeCarPaint() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xc21807,
    metalness: 0.75,
    roughness: 0.28,
    clearcoat: 1.0,
    clearcoatRoughness: 0.12,
  });
}

const glassMat = () => new THREE.MeshPhysicalMaterial({
  color: 0x0a1420, metalness: 0.1, roughness: 0.08,
  transparent: true, opacity: 0.85,
});

export class CarModel {
  constructor(vehicle) {
    this.vehicle = vehicle;
    this.root = new THREE.Group();

    const paint = makeCarPaint();
    const dark = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.5, metalness: 0.6 });

    // --- Coque principale (caisse profilée : profil construit puis extrudé) ---
    const bodyShape = new THREE.Shape();
    bodyShape.moveTo(-2.1, 0.12);
    bodyShape.lineTo(-2.18, 0.52);
    bodyShape.lineTo(-1.35, 0.62);
    bodyShape.lineTo(-0.7, 1.02);   // base lunette AR
    bodyShape.lineTo(0.55, 1.04);   // toit
    bodyShape.lineTo(1.05, 0.62);   // base pare-brise
    bodyShape.lineTo(2.1, 0.55);
    bodyShape.lineTo(2.16, 0.2);
    bodyShape.lineTo(1.7, 0.08);
    bodyShape.lineTo(-1.7, 0.08);
    bodyShape.closePath();
    const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
      depth: 1.62, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.07, bevelSegments: 3, steps: 1,
    });
    bodyGeo.rotateY(-Math.PI / 2);
    bodyGeo.translate(0.81, 0, 0);
    const body = new THREE.Mesh(bodyGeo, paint);
    body.castShadow = true;
    this.root.add(body);

    // Habitacle vitré
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.34, 1.7), glassMat());
    cabin.position.set(0, 0.98, -0.1);
    cabin.castShadow = true;
    this.root.add(cabin);

    // Capot / splitter avant
    const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.09, 0.5), dark);
    splitter.position.set(0, 0.14, 2.05);
    splitter.castShadow = true;
    this.root.add(splitter);

    // Diffuseur arrière
    const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.16, 0.4), dark);
    diffuser.position.set(0, 0.18, -2.12);
    this.root.add(diffuser);

    // Aileron
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 0.34), dark);
    wing.position.set(0, 1.02, -2.0);
    wing.rotation.x = -0.18;
    wing.castShadow = true;
    this.root.add(wing);
    for (const sx of [-0.7, 0.7]) {
      const stay = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.2), dark);
      stay.position.set(sx, 0.85, -2.0);
      this.root.add(stay);
    }

    // Rétroviseurs
    for (const sx of [-1.0, 1.0]) {
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.26), dark);
      mirror.position.set(sx, 0.85, 0.62);
      this.root.add(mirror);
    }

    // Phares / feux
    const headMat = new THREE.MeshStandardMaterial({ color: 0xdff4ff, emissive: 0xbfe9ff, emissiveIntensity: 0.7 });
    this.brakeMat = new THREE.MeshStandardMaterial({ color: 0x5a0505, emissive: 0xff1a1a, emissiveIntensity: 0.15 });
    for (const sx of [-0.62, 0.62]) {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.11, 0.06), headMat);
      head.position.set(sx, 0.5, 2.14);
      this.root.add(head);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.05), this.brakeMat);
      tail.position.set(sx, 0.52, -2.2);
      this.root.add(tail);
    }

    // Roues
    this.wheelMeshes = [];
    const tireGeo = new THREE.CylinderGeometry(this.vehicle.wheelRadius, this.vehicle.wheelRadius, 0.26, 22);
    tireGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.95 });
    const rimGeo = new THREE.CylinderGeometry(this.vehicle.wheelRadius * 0.58, this.vehicle.wheelRadius * 0.58, 0.27, 16);
    rimGeo.rotateZ(Math.PI / 2);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xb7bcc7, metalness: 0.9, roughness: 0.3 });

    for (const w of vehicle.wheels) {
      const hub = new THREE.Group();
      hub.position.set(w.localPos.x, w.localPos.y - vehicle.restLength, w.localPos.z);
      const spin = new THREE.Group();
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.castShadow = true;
      const rim = new THREE.Mesh(rimGeo, rimMat);
      spin.add(tire, rim);
      hub.add(spin);
      this.root.add(hub);
      this.wheelMeshes.push({ hub, spin, wheel: w });
    }

    // Ombre portée douce
    const shadowTexC = document.createElement('canvas');
    shadowTexC.width = shadowTexC.height = 64;
    const sctx = shadowTexC.getContext('2d');
    const grad = sctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, 'rgba(0,0,0,0.5)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 64, 64);
    const shadowMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 5.6),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowTexC), transparent: true, depthWrite: false }),
    );
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.03;
    this.root.add(shadowMesh);
  }

  update(dt) {
    const v = this.vehicle;
    this.root.position.copy(v.pos);
    this.root.quaternion.copy(v.quat);

    for (const { hub, spin, wheel } of this.wheelMeshes) {
      // Hauteur visuelle = longueur de suspension réelle
      const visY = wheel.localPos.y - (v.restLength - (wheel.grounded ? wheel.compression : 0));
      hub.position.set(wheel.localPos.x, visY, wheel.localPos.z);
      hub.rotation.y = wheel.isFront ? wheel.steer : 0;
      spin.rotation.x = wheel.spinAngle;
      spin.rotation.y = 0;
    }

    // Feux stop
    const braking = v.brakeIn > 0.1 || v.handbrake;
    this.brakeMat.emissiveIntensity += ((braking ? 2.2 : 0.15) - this.brakeMat.emissiveIntensity) * Math.min(1, dt * 14);
  }
}

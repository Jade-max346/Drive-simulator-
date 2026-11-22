import * as THREE from './vendor/three.module.js';
import { Ground } from './physics/ground.js';
import { Vehicle } from './physics/vehicle.js';
import { Track } from './world/track.js';
import { buildScenery, buildGroundPlane, updateShadowTarget } from './world/scenery.js';
import { CarModel } from './render/carModel.js';
import { CameraRig } from './render/cameraRig.js';
import { Effects } from './render/effects.js';
import { Hud } from './ui/hud.js';
import { Minimap } from './ui/minimap.js';
import { EngineAudio } from './audio/engineAudio.js';
import { InputManager } from './input.js';

const canvas = document.getElementById('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  document.getElementById('overlay-card').innerHTML =
    '<h1>WEBGL INDISPONIBLE</h1><p>Votre navigateur ne peut pas créer le contexte 3D.<br/>Mettez-le à jour ou activez l\'accélération matérielle.</p>';
  throw err;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87a9d9);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.15, 2200);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- Monde ----------
const track = new Track(scene);
const ground = new Ground(track);
buildGroundPlane(scene, track);
const { sun } = buildScenery(scene, track);

// ---------- Véhicule ----------
const vehicle = new Vehicle(ground);
const spawn = track.startPos.clone().add(
  track.samples[20].tan.clone().multiplyScalar(-9),
);
vehicle.reset(spawn.setY(0.7), track.startHeading);
const carModel = new CarModel(vehicle);
scene.add(carModel.root);

const cameraRig = new CameraRig(camera);
const effects = new Effects(scene);
const hud = new Hud(vehicle, cameraRig);
const minimap = new Minimap(track, vehicle);
const audio = new EngineAudio();
const input = new InputManager();

// ---------- Chronométrage ----------
const LapState = {
  lapCount: 0,
  startTime: null,
  last: null,
  best: null,
  prevSample: null,
  armed: false,
};
function lapTimer() {
  return LapState.startTime == null ? 0 : (performance.now() - LapState.startTime) / 1000;
}
hud.setLaps(LapState);

function updateLapTiming() {
  const idx = track.nearestSample(vehicle.pos.x, vehicle.pos.z);
  if (idx < 0) return;
  const N = track.samples.length;
  if (LapState.prevSample == null) {
    LapState.prevSample = idx;
    LapState.armed = idx > N * 0.25 && idx < N * 0.75;
    return;
  }
  const prev = LapState.prevSample;
  LapState.prevSample = idx;
  if (Math.abs(prev - idx) > N / 2) {
    const nearStart = Math.min(idx, N - idx) < 8;
    const forward = idx - prev < 0;
    if (nearStart && forward && Math.abs(vehicle.speedKmh) > 8) {
      const now = performance.now();
      if (LapState.armed && LapState.startTime != null) {
        const t = (now - LapState.startTime) / 1000;
        if (t > 8) {
          LapState.last = t;
          if (LapState.best == null || t < LapState.best) LapState.best = t;
          LapState.lapCount++;
        }
      }
      LapState.startTime = now;
      LapState.armed = true;
    } else if (nearStart && !forward) {
      LapState.armed = false;
    }
  }
  hud.setLaps(LapState);
}

// ---------- Contrôles UI ----------
document.getElementById('btn-auto').addEventListener('click', () => {
  vehicle.autoShift = true;
  document.getElementById('btn-auto').classList.add('active');
  document.getElementById('btn-manual').classList.remove('active');
});
document.getElementById('btn-manual').addEventListener('click', () => {
  vehicle.autoShift = false;
  document.getElementById('btn-manual').classList.add('active');
  document.getElementById('btn-auto').classList.remove('active');
});

let started = false;
function startGame() {
  if (started) return;
  started = true;
  overlay.classList.add('hidden');
  try { audio.start(); } catch (err) { console.warn('Audio indisponible', err); }
}
const overlay = document.getElementById('overlay');
{
  // Délégué : tout clic/tap pendant l'écran de démarrage lance le jeu
  const startFromEvent = (e) => {
    if (started) return;
    e.preventDefault();
    startGame();
  };
  document.addEventListener('pointerdown', startFromEvent, true);
  document.addEventListener('keydown', (e) => {
    if (!started && (e.code === 'Enter' || e.code === 'Space')) startFromEvent(e);
  }, true);
  document.getElementById('btn-start').addEventListener('click', startGame);
}

addEventListener('keydown', (e) => {
  if (e.code === 'KeyC') console.info('Caméra :', cameraRig.cycle());
  if (e.code === 'KeyM') document.getElementById('btn-manual').click();
  if (e.code === 'KeyR') {
    const back = track.startPos.clone().add(track.samples[20].tan.clone().multiplyScalar(-9));
    vehicle.reset(back.setY(0.7), track.startHeading);
    LapState.prevSample = null;
    LapState.armed = false;
    LapState.startTime = null;
  }
});

// ---------- Boucle ----------
const PHYS_DT = 1 / 120;
let accumulator = 0;
let lastT = performance.now();

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  let frameDt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  if (started) {
    const keys = input.sample();
    accumulator += frameDt;
    let steps = 0;
    while (accumulator >= PHYS_DT && steps < 8) {
      vehicle.step(PHYS_DT, keys);
      accumulator -= PHYS_DT;
      steps++;
    }
    updateLapTiming();
    audio.update(vehicle);
  }

  carModel.update(frameDt);
  effects.update(frameDt, vehicle);
  cameraRig.update(frameDt, vehicle);
  updateShadowTarget(sun, vehicle.pos);
  hud.update(frameDt, lapTimer());
  minimap.draw();

  renderer.render(scene, camera);
}
window.__apexReady = true;
frame();

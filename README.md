# Apex Drive — Simulateur de conduite 3D

Simulateur de conduite temps réel dans le navigateur : physique véhicule complète
(châssis rigide 6 degrés de liberté, suspensions ressort/amortisseur, barres
anti-roulis, pneus Pacejka avec ellipse de friction, ABS/antipatinage, boîte
6 rapports + marche arrière, aérodynamique), circuit avec chronométrage,
HUD complet, audio moteur WebAudio et effets (gommes, fumée).

## Lancer localement

Une connexion internet est requise au premier chargement (Three.js depuis un CDN
via import map). Aucune étape de build.

```bash
cd driving-sim

# Option 1 : Python (aucune installation)
python3 -m http.server 8000

# Option 2 : Node
npm install        # (optionnel, ajoute juste le script serve)
npx serve -l 3000 .
```

Puis ouvrir http://localhost:8000 (ou 3000) et cliquer **DÉMARRER**.

## Commandes

| Touche | Action |
|---|---|
| `Z` / `W` / `↑` | Accélérer |
| `S` / `↓` | Freiner (→ recurse en marche arrière à l'arrêt via la boîte auto) |
| `Q` / `A` / `←` `→` | Diriger |
| `ESPACE` | Frein à main |
| `E` / `X` | Monter / descendre les rapports (mode manuel) |
| `M` | Boîte automatique / manuelle |
| `C` | Changer de caméra (poursuite, capot, cockpit, cinéma) |
| `R` | Replacer la voiture sur la grille |

Sur mobile : boutons tactiles en bas de l'écran.

## Architecture

```
js/
  physics/vehicle.js   Châssis rigide + roues raycast + pneus Pacejka + drivetrain
  physics/ground.js    Hauteur de terrain, raycast, normales, surfaces
  world/track.js       Circuit (spline Catmull-Rom, asphalte, vibreurs, chronométrage)
  world/scenery.js     Ciel, soleil/ombres, herbe, arbres, montagnes, tribunes
  render/carModel.js   Voiture procédurale (ExtrudeGeometry), roues animées, feux
  render/cameraRig.js  4 caméras, FOV dynamique, roll G
  render/effects.js    Traces de gomme + fumée
  ui/hud.js            Compte-tours, vitesse, rapport, chrono, g-force
  ui/minimap.js        Minimap
  audio/engineAudio.js Synthèse moteur + crissement + vent
  input.js             Clavier + tactile
  main.js              Boucle : physique pas fixe 120 Hz, rendu, laps
test/simtest.mjs       Test headless : stabilité, 0-100, virage, freinage
```

## Test physique headless

```bash
npm install --no-save three@0.160.1
node test/simtest.mjs
```

Vérifie : équilibre (4 roues au sol, upY=1.0), montée en régime/transmission,
virage ~0.85 g, freinage, marche arrière, aucune explosion numérique.

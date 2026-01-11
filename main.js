import './style.css'
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FilesetResolver, FaceLandmarker, HandLandmarker } from '@mediapipe/tasks-vision';
import { Pane } from 'tweakpane';

// ==========================================================
// 🚨 DEBUG LOGGER
// ==========================================================
const debugDiv = document.createElement('div');
Object.assign(debugDiv.style, {
  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
  color: '#D4F842', fontFamily: 'monospace', fontSize: '14px', zIndex: '9999',
  pointerEvents: 'none', textAlign: 'center', background: 'rgba(0,0,0,0.8)', padding: '20px', borderRadius: '10px'
});
document.body.appendChild(debugDiv);

function log(msg) { 
  debugDiv.innerHTML = `STATUS: ${msg}<br><span style="font-size:10px; color:#ccc;">(Please Allow Camera Access)</span>`; 
  console.log(msg); 
}
log("Initializing System...");

// ==========================================================
// 🎨 CONFIGURATION
// ==========================================================
const config = {
  faceLayers: 3,         
  handLayers: 20,        
  particleSize: 0.05,
  use3D: true,           
  rainbowMode: false,
  faceColor: '#D4F842',  // Burhan Lime
  handColor: '#00FFFF',  // Cyan Energy
  lerpSpeed: 0.2,       
  baseNoise: 0.01,
  centeringSpeed: 0.03,  
  bloomStrength: 1.2,    
  bloomThreshold: 0.1,
  bloomRadius: 0.6,
  mouthThreshold: 0.05, 
  pinchThreshold: 0.05,
};

const state = {
  score: 0,
  autoCenterOffset: new THREE.Vector3(0, 0, 0), 
  isMouthOpen: false,
  isPinching: false,
  pinchPosition: new THREE.Vector3(0, 0, 0),
  headPosition: new THREE.Vector3(0, 0, 0),
  handCenters: [new THREE.Vector3(), new THREE.Vector3()] 
};

// ==========================================================
// 📱 RESPONSIVE UI STYLES (INJECTED CSS)
// ==========================================================
function injectStyles() {
  const style = document.createElement('style');
  style.innerHTML = `
    /* HUD CONTAINER */
    #xr-hud {
      position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;
      font-family: 'Segoe UI', sans-serif;
    }

    /* HEADER SECTION (Top Left) */
    .xr-header {
      position: absolute; top: 20px; left: 20px; text-align: left;
    }
    .xr-logo {
      margin: 0; font-weight: 900; color: #fff; text-transform: uppercase; letter-spacing: -1px;
      /* FLUID FONT SIZE: Minimum 24px, Preferred 5vw, Max 48px */
      font-size: clamp(24px, 5vw, 48px);
      text-shadow: 0 0 10px ${config.faceColor}, 0 0 20px ${config.faceColor};
    }
    .xr-sub {
      font-family: monospace; color: #ccc; letter-spacing: 2px;
      background: rgba(0,0,0,0.5); padding: 4px 8px; border-radius: 4px; display: inline-block;
      font-size: clamp(10px, 2vw, 14px);
    }
    .xr-score {
      margin-top: 5px; color: #FFD700; font-family: monospace; font-weight: bold;
      text-shadow: 0 0 10px #FFD700;
      font-size: clamp(18px, 4vw, 28px);
    }

    /* INSTRUCTIONS (Bottom Right) */
    .xr-instr {
      position: absolute; bottom: 20px; right: 20px; color: ${config.faceColor}; text-align: right;
      font-family: monospace; background: rgba(0, 0, 0, 0.85); padding: 15px;
      border-radius: 12px; border-right: 4px solid ${config.faceColor}; 
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      font-size: clamp(10px, 2.5vw, 14px); /* Adaptive text size */
      max-width: 40%; /* Prevent it covering too much on phone */
    }

    /* MOBILE TWEAKS */
    @media (max-width: 600px) {
      .xr-instr {
        bottom: 10px; right: 10px; padding: 10px;
        max-width: 60%;
      }
      .xr-header { top: 10px; left: 10px; }
    }
  `;
  document.head.appendChild(style);
}

// ==========================================================
// 🖥️ UI CREATION
// ==========================================================
let scoreElement;

function createHUD() {
  injectStyles(); // Load the CSS first

  const container = document.createElement('div');
  container.id = 'xr-hud';
  
  // 1. HEADER
  const header = document.createElement('div');
  header.className = 'xr-header';
  header.innerHTML = `
    <h1 class="xr-logo">BURHAN</h1>
    <div class="xr-sub">XR INTERACTIVE MIRROR</div>
  `;

  // 2. SCORE
  scoreElement = document.createElement('div');
  scoreElement.className = 'xr-score';
  scoreElement.innerHTML = `SCORE: 000`;
  header.appendChild(scoreElement);

  // 3. INSTRUCTIONS
  const instr = document.createElement('div');
  instr.className = 'xr-instr';
  instr.innerHTML = `
    <b style="color:white; display:block; margin-bottom:5px;">// HOW TO PLAY</b>
    <span style="color:#FFD700">★ CATCH STARS (+10)</span><br>
    <span style="color:#aaa">⚡ MOVE HANDS</span><br>
    <span style="color:#aaa">🌑 PINCH FINGERS</span><br>
    <span style="color:#aaa">🔊 OPEN MOUTH</span>
  `;
  
  container.appendChild(header);
  container.appendChild(instr);
  document.body.appendChild(container);
}

function updateHUD() {
  if(scoreElement) scoreElement.innerHTML = `SCORE: ${state.score.toString().padStart(3, '0')}`;
}

// ==========================================================
// 🔹 THREE.JS SETUP
// ==========================================================
const app = document.querySelector('#app');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#050505'); 

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.z = 2.5; 
camera.scale.x = -1; 

const renderer = new THREE.WebGLRenderer({ powerPreference: "high-performance", alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
app.appendChild(renderer.domElement);

const renderScene = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = config.bloomThreshold;
bloomPass.strength = config.bloomStrength;
bloomPass.radius = config.bloomRadius;

const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);

// ==========================================================
// 🎮 GAME LOGIC
// ==========================================================
const targets = []; 
const targetGeo = new THREE.SphereGeometry(0.12, 8, 8);
const targetMat = new THREE.MeshBasicMaterial({ color: 0xFFD700, wireframe: true });

function spawnTarget() {
  if (targets.length >= 6) return; 
  const star = new THREE.Mesh(targetGeo, targetMat);
  star.position.set((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 3, (Math.random() * 2) - 1);
  scene.add(star);
  targets.push(star);
}

function updateGame(time) {
  targets.forEach(t => { t.rotation.x = time * 2; t.rotation.y = time; });
  if (Math.floor(time) % 2 === 0 && Math.random() > 0.8) spawnTarget();
}

function checkCollision(position) {
  for (let i = targets.length - 1; i >= 0; i--) {
    const t = targets[i];
    if (position.distanceTo(t.position) < 0.6) { 
      scene.remove(t);
      targets.splice(i, 1);
      state.score += 10;
      updateHUD();
      config.bloomStrength = 3.0; 
      setTimeout(() => { config.bloomStrength = 1.2 }, 150);
    }
  }
}

// ==========================================================
// 💠 PARTICLE SYSTEM
// ==========================================================
function getTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 32; canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.arc(16, 16, 10, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  return new THREE.CanvasTexture(canvas);
}

function createSystem(landmarkCount, layers, colorHex) {
  const totalParticles = landmarkCount * layers;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(totalParticles * 3);
  for(let i=0; i<totalParticles*3; i++) positions[i] = (Math.random()-0.5)*20; 
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  
  const material = new THREE.PointsMaterial({
    color: new THREE.Color(colorHex),
    map: getTexture(),
    size: config.particleSize,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  
  const points = new THREE.Points(geometry, material);
  points.userData = { layers: layers }; 
  return points;
}

const faceParticles = createSystem(478, config.faceLayers, config.faceColor);
const handParticles = createSystem(42, config.handLayers, config.handColor); 
scene.add(faceParticles);
scene.add(handParticles);

// ==========================================================
// 🧠 COMPUTER VISION
// ==========================================================
let faceLandmarker, handLandmarker, video;
let lastVideoTime = -1;

async function setupVision() {
  log("Downloading AI Models...");
  try {
    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm");
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`, delegate: "GPU" }, runningMode: "VIDEO", numFaces: 1, outputFaceBlendshapes: true });
    handLandmarker = await HandLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`, delegate: "GPU" }, runningMode: "VIDEO", numHands: 2 });
    log("AI Ready. Requesting Camera...");
    startWebcam();
  } catch(e) { log("AI Error: " + e); }
}

function startWebcam() {
  video = document.createElement("video");
  video.style.opacity = '0';
  video.style.position = 'absolute';
  video.setAttribute('playsinline', ''); 
  document.body.appendChild(video);

  navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: "user" } }).then((stream) => {
    video.srcObject = stream;
    video.play();
    video.addEventListener("loadeddata", () => {
        log("System Online. Starting...");
        createHUD();
        spawnTarget();
        loop();
        setTimeout(() => debugDiv.style.display = 'none', 2000);
    });
  }).catch(e => log("Camera Denied: " + e));
}

// ==========================================================
// 🔄 ANIMATION LOOP
// ==========================================================
const clock = new THREE.Clock();

function loop() {
  const time = clock.getElapsedTime();
  let startTimeMs = performance.now();
  
  updateGame(time);

  if (config.rainbowMode) {
    const hue = (time * 0.2) % 1;
    faceParticles.material.color.setHSL(hue, 1, 0.5);
    handParticles.material.color.setHSL((hue + 0.5) % 1, 1, 0.5); 
  } else {
    faceParticles.material.color.lerp(new THREE.Color(config.faceColor), 0.1);
    handParticles.material.color.lerp(new THREE.Color(config.handColor), 0.1);
  }

  if (video && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    
    // 1. FACE
    if (faceLandmarker) {
      const result = faceLandmarker.detectForVideo(video, startTimeMs);
      if (result.faceLandmarks.length > 0) {
        const landmarks = result.faceLandmarks[0];
        const noseX = landmarks[1].x;
        const noseY = landmarks[1].y;
        
        const targetOffsetX = (0.5 - noseX) * 5.0; 
        const targetOffsetY = (0.5 - noseY) * 3.0;
        state.autoCenterOffset.x = THREE.MathUtils.lerp(state.autoCenterOffset.x, targetOffsetX, config.centeringSpeed);
        state.autoCenterOffset.y = THREE.MathUtils.lerp(state.autoCenterOffset.y, targetOffsetY, config.centeringSpeed);
        
        state.headPosition.set((noseX - 0.5) * -8 + state.autoCenterOffset.x, -(noseY - 0.5) * 6 + state.autoCenterOffset.y, 0);
        checkCollision(state.headPosition);
        
        const upper = landmarks[13]; const lower = landmarks[14];
        state.isMouthOpen = Math.hypot(upper.x - lower.x, upper.y - lower.y) > config.mouthThreshold;
        if (state.isMouthOpen) faceParticles.material.color.setHex(0xFFFFFF); 
        updateParticles(faceParticles, landmarks, time, 'face');
      }
    }
    
    // 2. HAND
    if (handLandmarker) {
      const result = handLandmarker.detectForVideo(video, startTimeMs);
      state.isPinching = false; 
      
      if (result.landmarks.length > 0) {
        const hand = result.landmarks[0]; 
        const thumb = hand[4]; const index = hand[8];
        const dist = Math.hypot(thumb.x - index.x, thumb.y - index.y);
        
        if (dist < config.pinchThreshold) {
          state.isPinching = true;
          state.pinchPosition.set((thumb.x - 0.5) * -8.0 + state.autoCenterOffset.x, -(thumb.y - 0.5) * 6.0 + state.autoCenterOffset.y, -thumb.z * 5);
          checkCollision(state.pinchPosition);
        }
        updateParticles(handParticles, result.landmarks.flat(), time, 'hand');
      }
    }
  }
  composer.render();
  requestAnimationFrame(loop);
}

// ==========================================================
// 💠 UPDATE LOGIC
// ==========================================================
function updateParticles(system, landmarks, time, type) {
  const positions = system.geometry.attributes.position.array;
  const count = landmarks.length;
  const layers = system.userData.layers; 
  const aspect = window.innerWidth / window.innerHeight;
  const spreadX = 9.0 * aspect; 
  const spreadY = 7.0;
  const limit = Math.floor(positions.length / 3);

  for (let i = 0; i < count; i++) {
    const lm = landmarks[i];
    const bx = (lm.x - 0.5) * -spreadX; 
    const by = -(lm.y - 0.5) * spreadY; 
    const bz = -lm.z * 5;
    const startIdx = i * layers * 3;

    for (let layer = 0; layer < layers; layer++) {
        if (!config.use3D && layer > 0) {
           const idx = startIdx + (layer * 3);
           if (idx/3 < limit) positions[idx+2] = 9999; 
           continue;
        }

        const idx = startIdx + (layer * 3);
        if (idx/3 >= limit) continue;

        let tx = bx + state.autoCenterOffset.x;
        let ty = by + state.autoCenterOffset.y;
        let tz = bz;

        if (type === 'hand') {
            const lagFactor = 1.0 - (layer / layers) * 0.9; 
            const currentLag = config.lerpSpeed * lagFactor;
            if (layer > 5) {
                const orbitSpeed = time * 2 + (layer * 0.1);
                const orbitRadius = (layer * 0.02); 
                tx += Math.sin(orbitSpeed) * orbitRadius;
                ty += Math.cos(orbitSpeed) * orbitRadius;
            }
             tx += (Math.random()-0.5) * 0.05 * layer; 
             ty += (Math.random()) * 0.05 * layer; 
             
             positions[idx]   += (tx - positions[idx]) * currentLag;
             positions[idx+1] += (ty - positions[idx+1]) * currentLag;
             positions[idx+2] += (tz - positions[idx+2]) * currentLag;

        } else {
            let depthOffset = (layer - (layers/2)) * 0.15; 
            let noise = config.baseNoise;
            if (state.isMouthOpen) noise = 0.05; 
            if (layer > 0) noise *= 2.0; 

            const nX = Math.sin(time * 3 + i + layer) * noise;
            const nY = Math.cos(time * 2 + i + layer) * noise;
            tx += nX; ty += nY; tz += depthOffset;

            if (state.isPinching) {
               const dist = Math.sqrt(Math.pow(state.pinchPosition.x - tx, 2) + Math.pow(state.pinchPosition.y - ty, 2));
               if (dist < 2.5) {
                   tx = THREE.MathUtils.lerp(tx, state.pinchPosition.x, 0.2);
                   ty = THREE.MathUtils.lerp(ty, state.pinchPosition.y, 0.2);
               }
            }
            positions[idx]   += (tx - positions[idx]) * config.lerpSpeed;
            positions[idx+1] += (ty - positions[idx+1]) * config.lerpSpeed;
            positions[idx+2] += (tz - positions[idx+2]) * config.lerpSpeed;
        }
    }
  }
  system.geometry.attributes.position.needsUpdate = true;
}

// ==========================================================
// 🎛️ CONTROLS (Tweakpane)
// ==========================================================
const pane = new Pane({ title: 'Burhan Controls' });
const dimFolder = pane.addFolder({ title: 'Dimensions' });
dimFolder.addBinding(config, 'use3D', { label: '3D Mode' });
dimFolder.addBinding(config, 'particleSize', { min: 0.01, max: 0.1, label: 'Size' }).on('change', (ev) => { faceParticles.material.size = ev.value; handParticles.material.size = ev.value; });
const colFolder = pane.addFolder({ title: 'Colors' });
colFolder.addBinding(config, 'rainbowMode', { label: 'Rainbow Loop' });
colFolder.addBinding(config, 'faceColor', { label: 'Face Color' });
colFolder.addBinding(config, 'handColor', { label: 'Hand Color' });
colFolder.addButton({ title: 'RANDOMIZE ALL' }).on('click', () => {
    config.faceColor = '#' + Math.floor(Math.random()*16777215).toString(16);
    config.handColor = '#' + Math.floor(Math.random()*16777215).toString(16);
    config.rainbowMode = false;
    pane.refresh(); 
});
const fxFolder = pane.addFolder({ title: 'Effects' });
fxFolder.addBinding(config, 'bloomStrength', { min: 0, max: 3, label: 'Glow' }).on('change', (ev) => bloomPass.strength = ev.value);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

setupVision();
import './style.css'
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FilesetResolver, FaceLandmarker, HandLandmarker } from '@mediapipe/tasks-vision';
import { Pane } from 'tweakpane';

// ==========================================================
// 🚨 DEBUG LOGGER (So we know what's happening)
// ==========================================================
const debugDiv = document.createElement('div');
debugDiv.style.position = 'absolute';
debugDiv.style.top = '10px';
debugDiv.style.left = '10px';
debugDiv.style.color = '#00ff00';
debugDiv.style.fontFamily = 'monospace';
debugDiv.style.fontSize = '12px';
debugDiv.style.zIndex = '999';
debugDiv.style.pointerEvents = 'none';
document.body.appendChild(debugDiv);

function log(msg) {
  debugDiv.innerHTML += `> ${msg}<br>`;
  console.log(msg);
}

log("Initializing System...");

// ==========================================================
// 🎨 CONFIGURATION
// ==========================================================
const PORTFOLIO_THEME_COLOR = '#D4F842'; // Lime Green
const GAME_OBJECT_COLOR = '#FFD700';     // Gold

const config = {
  // Visuals
  faceLayers: 3,         
  handLayers: 12,        // 12 Layers for THICK hands
  particleSize: 0.05,   
  
  // Physics
  lerpSpeed: 0.2,       
  baseNoise: 0.01,
  centeringSpeed: 0.03,  
  
  // Bloom
  bloomStrength: 0.8, 
  bloomThreshold: 0.1,
  bloomRadius: 0.5,
  
  // Interactions
  mouthThreshold: 0.05, 
  pinchThreshold: 0.05,
};

const state = {
  score: 0,
  autoCenterOffset: new THREE.Vector3(0, 0, 0), 
  isMouthOpen: false,
  isPinching: false,
  pinchPosition: new THREE.Vector3(0, 0, 0),
  headPosition: new THREE.Vector3(0, 0, 0) 
};

// ==========================================================
// 🎨 HUD & LOGO (HTML Version - Safer & Cleaner)
// ==========================================================
let scoreElement;
function createHUD() {
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.width = '100%';
  container.style.height = '100%';
  container.style.pointerEvents = 'none'; 
  
  // LOGO (Top Right)
  const logo = document.createElement('div');
  logo.style.position = 'absolute';
  logo.style.top = '30px';
  logo.style.right = '30px';
  logo.style.textAlign = 'right';
  logo.innerHTML = `
    <h1 style="margin:0; font-family:sans-serif; font-weight:900; font-size:40px; color:${PORTFOLIO_THEME_COLOR}; letter-spacing:-2px; text-shadow:0 0 20px ${PORTFOLIO_THEME_COLOR}">BURHAN</h1>
    <div style="font-family:monospace; color:white; font-size:14px; opacity:0.7;">XR DESIGNER // SYSTEM ONLINE</div>
  `;

  // SCORE (Below Logo)
  scoreElement = document.createElement('div');
  scoreElement.style.marginTop = '10px';
  scoreElement.style.color = GAME_OBJECT_COLOR;
  scoreElement.style.fontFamily = 'monospace';
  scoreElement.style.fontSize = '24px';
  scoreElement.style.fontWeight = 'bold';
  scoreElement.innerHTML = `SCORE: 000`;
  logo.appendChild(scoreElement);

  // INSTRUCTIONS (Bottom Left)
  const instr = document.createElement('div');
  instr.style.position = 'absolute';
  instr.style.bottom = '30px';
  instr.style.left = '30px';
  instr.style.color = PORTFOLIO_THEME_COLOR;
  instr.style.fontFamily = "'Courier New', monospace"; 
  instr.style.background = 'rgba(0, 0, 0, 0.8)';
  instr.style.padding = '20px';
  instr.style.borderRadius = '12px';
  instr.style.border = `1px solid ${PORTFOLIO_THEME_COLOR}`;
  instr.innerHTML = `
    <b style="color:white">// CONTROLS</b><br>
    • CATCH STARS WITH HEAD/HAND<br>
    • PINCH FINGERS = BLACK HOLE<br>
    • AUTO-CENTERING ENABLED
  `;
  
  container.appendChild(logo);
  container.appendChild(instr);
  document.body.appendChild(container);
}

function updateHUD() {
  if(scoreElement) scoreElement.innerHTML = `SCORE: ${state.score.toString().padStart(3, '0')}`;
}

// ==========================================================
// 🔹 SCENE SETUP
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
const targetMat = new THREE.MeshBasicMaterial({ color: GAME_OBJECT_COLOR, wireframe: true });

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
    if (position.distanceTo(t.position) < 0.5) {
      scene.remove(t);
      targets.splice(i, 1);
      state.score += 10;
      updateHUD();
      config.bloomStrength = 2.0; 
      setTimeout(() => { config.bloomStrength = 0.8 }, 150);
    }
  }
}

// ==========================================================
// 💠 VOLUMETRIC PARTICLES
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
  for(let i=0; i<totalParticles*3; i++) positions[i] = (Math.random()-0.5)*20; // Initialize wide
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
  points.userData = { layers: layers }; // Store layer count
  return points;
}

// Create Systems
const faceParticles = createSystem(478, config.faceLayers, PORTFOLIO_THEME_COLOR);
const handParticles = createSystem(42, config.handLayers, PORTFOLIO_THEME_COLOR); 
scene.add(faceParticles);
scene.add(handParticles);

// ==========================================================
// 🧠 COMPUTER VISION
// ==========================================================
let faceLandmarker, handLandmarker, video;
let lastVideoTime = -1;

async function setupVision() {
  log("Loading AI Models...");
  try {
    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm");
    
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, { 
        baseOptions: { modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`, delegate: "GPU" }, 
        runningMode: "VIDEO", 
        numFaces: 1, 
        outputFaceBlendshapes: true 
    });
    
    handLandmarker = await HandLandmarker.createFromOptions(vision, { 
        baseOptions: { modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`, delegate: "GPU" }, 
        runningMode: "VIDEO", 
        numHands: 2 
    });
    
    log("AI Models Loaded.");
    startWebcam();
  } catch (err) {
    log("ERROR LOADING AI: " + err.message);
  }
}

function startWebcam() {
  log("Requesting Camera...");
  video = document.createElement("video");
  navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: "user" } })
  .then((stream) => {
    video.srcObject = stream;
    video.play();
    video.addEventListener("loadeddata", () => {
        log("Camera Active. System Running.");
        createHUD();
        spawnTarget();
        loop();
        // Hide Debug log after 3 seconds
        setTimeout(() => debugDiv.style.display = 'none', 3000);
    });
  })
  .catch(err => {
    log("CAMERA DENIED: " + err.message);
  });
}

// ==========================================================
// 🔄 LOGIC LOOP
// ==========================================================
const clock = new THREE.Clock();

function loop() {
  const time = clock.getElapsedTime();
  let startTimeMs = performance.now();
  
  updateGame(time);

  if (video && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    
    // 1. FACE
    if (faceLandmarker) {
      const result = faceLandmarker.detectForVideo(video, startTimeMs);
      if (result.faceLandmarks.length > 0) {
        const landmarks = result.faceLandmarks[0];
        
        // Auto-Centering
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
        
        updateVolumetricParticles(faceParticles, landmarks, time);
      }
    }
    
    // 2. HAND
    if (handLandmarker) {
      const result = handLandmarker.detectForVideo(video, startTimeMs);
      state.isPinching = false; 
      if (result.landmarks.length > 0) {
        const hand = result.landmarks[0]; // Just use first hand
        const thumb = hand[4]; const index = hand[8];
        if (Math.hypot(thumb.x - index.x, thumb.y - index.y) < config.pinchThreshold) {
          state.isPinching = true;
          state.pinchPosition.set((thumb.x - 0.5) * -8.0 + state.autoCenterOffset.x, -(thumb.y - 0.5) * 6.0 + state.autoCenterOffset.y, -thumb.z * 5);
          checkCollision(state.pinchPosition);
        }
        updateVolumetricParticles(handParticles, result.landmarks.flat(), time);
      }
    }
  }
  composer.render();
  requestAnimationFrame(loop);
}

// ==========================================================
// 💠 UNIVERSAL PARTICLE UPDATER
// ==========================================================
function updateVolumetricParticles(system, landmarks, time) {
  const positions = system.geometry.attributes.position.array;
  const count = landmarks.length;
  const layers = system.userData.layers; // Access specific layer count
  
  const aspect = window.innerWidth / window.innerHeight;
  const spreadX = 9.0 * aspect; 
  const spreadY = 7.0;
  
  // Safety check to prevent index out of bounds if tracking glitches
  const limit = Math.floor(positions.length / 3);

  for (let i = 0; i < count; i++) {
    const lm = landmarks[i];
    const bx = (lm.x - 0.5) * -spreadX; 
    const by = -(lm.y - 0.5) * spreadY; 
    const bz = -lm.z * 5;
    
    const startIdx = i * layers * 3;

    for (let layer = 0; layer < layers; layer++) {
        const idx = startIdx + (layer * 3);
        if (idx/3 >= limit) continue;

        let depthOffset = (layer - (layers/2)) * 0.15; // Spread layers more

        let noise = config.baseNoise;
        if (state.isMouthOpen) noise = 0.05; 
        if (layer > 0) noise *= 2.0; 

        const nX = Math.sin(time * 3 + i + layer) * noise;
        const nY = Math.cos(time * 2 + i + layer) * noise;

        let tx = bx + state.autoCenterOffset.x + nX;
        let ty = by + state.autoCenterOffset.y + nY;
        let tz = bz + depthOffset;

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
  system.geometry.attributes.position.needsUpdate = true;
}

// ==========================================================
// 🎛️ SETTINGS UI
// ==========================================================
const pane = new Pane({ title: 'Burhan Settings' });
pane.addBinding(config, 'centeringSpeed', { min: 0.0, max: 0.1 });
pane.addBinding(config, 'particleSize', { min: 0.01, max: 0.1 });
pane.addBinding(config, 'bloomStrength', { min: 0, max: 2.5 });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

setupVision();
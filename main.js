import './style.css'
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FilesetResolver, FaceLandmarker, HandLandmarker } from '@mediapipe/tasks-vision';
import { Pane } from 'tweakpane';

// ==========================================================
// 🚨 DEBUG LOGGER (Visual Status Log)
// ==========================================================
const debugDiv = document.createElement('div');
Object.assign(debugDiv.style, {
  position: 'absolute', top: '10px', left: '10px', color: '#00ff00',
  fontFamily: 'monospace', fontSize: '10px', zIndex: '999', pointerEvents: 'none'
});
document.body.appendChild(debugDiv);
function log(msg) { debugDiv.innerHTML += `> ${msg}<br>`; console.log(msg); }
log("Initializing Burhan XR System...");

// ==========================================================
// 🎨 CONFIGURATION & STATE
// ==========================================================
const config = {
  // Visuals
  faceLayers: 3,         // Depth for 3D mode
  handLayers: 12,        // Thickness for hands
  particleSize: 0.05,
  use3D: true,           // Toggle 2D/3D
  
  // Colors
  rainbowMode: false,
  faceColor: '#D4F842',  // Burhan Lime
  handColor: '#00FFFF',  // Cyan (Multicolor contrast)
  
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
// 🖥️ UI: HUD & HEADER (HTML Overlay)
// ==========================================================
let scoreElement;

function createHUD() {
  const container = document.createElement('div');
  Object.assign(container.style, { position: 'absolute', width: '100%', height: '100%', pointerEvents: 'none' });
  
  // 1. BURHAN HEADER (Top Right)
  const header = document.createElement('div');
  Object.assign(header.style, { position: 'absolute', top: '20px', right: '20px', textAlign: 'right' });
  header.innerHTML = `
    <h1 style="
      margin: 0; font-family: 'Segoe UI', sans-serif; font-weight: 900; 
      font-size: 48px; color: #fff; text-transform: uppercase; letter-spacing: -1px;
      text-shadow: 0 0 10px ${config.faceColor}, 0 0 20px ${config.faceColor};
    ">BURHAN</h1>
    <div style="
      font-family: monospace; color: #ccc; font-size: 14px; letter-spacing: 2px;
      background: rgba(0,0,0,0.5); padding: 5px 10px; border-radius: 4px; display: inline-block;
    ">XR INTERACTIVE MIRROR</div>
  `;

  // 2. SCORE
  scoreElement = document.createElement('div');
  Object.assign(scoreElement.style, { marginTop: '10px', color: '#FFD700', fontFamily: 'monospace', fontSize: '24px', fontWeight: 'bold' });
  scoreElement.innerHTML = `SCORE: 000`;
  header.appendChild(scoreElement);

  // 3. INSTRUCTIONS (Bottom Left)
  const instr = document.createElement('div');
  Object.assign(instr.style, {
    position: 'absolute', bottom: '30px', left: '30px', color: config.faceColor,
    fontFamily: "monospace", background: 'rgba(0, 0, 0, 0.85)', padding: '20px',
    borderRadius: '12px', borderLeft: `4px solid ${config.faceColor}`, boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
  });
  instr.innerHTML = `
    <b style="color:white; font-size:16px;">// CONTROLS</b><br>
    <span style="color:#aaa">• CATCH STARS</span><br>
    <span style="color:#aaa">• PINCH = BLACK HOLE</span><br>
    <span style="color:#aaa">• OPEN MOUTH = SHOCKWAVE</span>
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
camera.scale.x = -1; // Mirror Flip

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
// 🎮 GAME LOGIC (Stars)
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
    if (position.distanceTo(t.position) < 0.5) {
      scene.remove(t);
      targets.splice(i, 1);
      state.score += 10;
      updateHUD();
      config.bloomStrength = 2.5; // Flash effect
      setTimeout(() => { config.bloomStrength = 0.8 }, 150);
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
  points.userData = { layers: layers, originalColor: new THREE.Color(colorHex) }; 
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
  log("Loading AI Models...");
  try {
    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm");
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`, delegate: "GPU" }, runningMode: "VIDEO", numFaces: 1, outputFaceBlendshapes: true });
    handLandmarker = await HandLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`, delegate: "GPU" }, runningMode: "VIDEO", numHands: 2 });
    log("AI Ready. Starting Camera...");
    startWebcam();
  } catch(e) { log("AI Error: " + e); }
}

function startWebcam() {
  video = document.createElement("video");
  navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: "user" } }).then((stream) => {
    video.srcObject = stream;
    video.play();
    video.addEventListener("loadeddata", () => {
        log("System Online.");
        createHUD();
        spawnTarget();
        loop();
        setTimeout(() => debugDiv.style.display = 'none', 3000);
    });
  }).catch(e => log("Camera Error: " + e));
}

// ==========================================================
// 🔄 ANIMATION LOOP
// ==========================================================
const clock = new THREE.Clock();

function loop() {
  const time = clock.getElapsedTime();
  let startTimeMs = performance.now();
  
  updateGame(time);

  // Rainbow Mode Logic
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
        
        // Auto-Center
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
        
        if (state.isMouthOpen) faceParticles.material.color.setHex(0xFFFFFF); // Shockwave Color

        updateVolumetricParticles(faceParticles, landmarks, time);
      }
    }
    
    // 2. HAND
    if (handLandmarker) {
      const result = handLandmarker.detectForVideo(video, startTimeMs);
      state.isPinching = false; 
      if (result.landmarks.length > 0) {
        const hand = result.landmarks[0]; 
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
// 💠 UPDATE LOGIC (Handles 2D/3D Switching)
// ==========================================================
function updateVolumetricParticles(system, landmarks, time) {
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
        // 2D MODE CHECK: If 3D is off, hide all layers except layer 0
        if (!config.use3D && layer > 0) {
           const idx = startIdx + (layer * 3);
           if (idx/3 < limit) positions[idx+2] = 9999; 
           continue;
        }

        const idx = startIdx + (layer * 3);
        if (idx/3 >= limit) continue;

        let depthOffset = (layer - (layers/2)) * 0.15; 
        
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
// 🎛️ CONTROLS (User Settings)
// ==========================================================
const pane = new Pane({ title: 'Burhan Controls' });

// 1. Dimensions
const dimFolder = pane.addFolder({ title: 'Dimensions' });
dimFolder.addBinding(config, 'use3D', { label: '3D Mode' });
dimFolder.addBinding(config, 'particleSize', { min: 0.01, max: 0.1, label: 'Size' })
  .on('change', (ev) => {
     faceParticles.material.size = ev.value;
     handParticles.material.size = ev.value;
  });

// 2. Colors
const colFolder = pane.addFolder({ title: 'Colors' });
colFolder.addBinding(config, 'rainbowMode', { label: 'Rainbow Loop' });
colFolder.addBinding(config, 'faceColor', { label: 'Face Color' });
colFolder.addBinding(config, 'handColor', { label: 'Hand Color' });

const randBtn = colFolder.addButton({ title: 'RANDOMIZE ALL' });
randBtn.on('click', () => {
    config.faceColor = '#' + Math.floor(Math.random()*16777215).toString(16);
    config.handColor = '#' + Math.floor(Math.random()*16777215).toString(16);
    config.rainbowMode = false;
    pane.refresh(); 
});

// 3. Effects
const fxFolder = pane.addFolder({ title: 'Effects' });
fxFolder.addBinding(config, 'bloomStrength', { min: 0, max: 3, label: 'Glow' })
  .on('change', (ev) => bloomPass.strength = ev.value);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

setupVision();
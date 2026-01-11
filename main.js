import './style.css'
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FilesetResolver, FaceLandmarker, HandLandmarker } from '@mediapipe/tasks-vision';
import { Pane } from 'tweakpane';

// ==========================================================
// 🎨 BURHAN'S BRAND CONFIGURATION
// ==========================================================
const PORTFOLIO_THEME_COLOR = '#D4F842'; // Lime Green
const GOLD_COLOR = '#FFD700';            // Smile
const SHOCK_COLOR = '#FFFFFF';           // Shockwave

const config = {
  // Visuals
  particleCount: 1400,
  particleSize: 0.045, 
  
  // Physics
  lerpSpeed: 0.3,       
  baseNoise: 0.01,
  
  // Bloom
  bloomStrength: 0.7, 
  bloomThreshold: 0.1,
  bloomRadius: 0.4,
  
  // Interaction Thresholds
  mouthThreshold: 0.05, 
  smileThreshold: 0.5, 
  pinchThreshold: 0.05, 
};

const state = {
  isMouthOpen: false,
  isSmiling: false,
  isPinching: false,
  pinchPosition: new THREE.Vector3(0, 0, 0)
};

// ==========================================================
// ℹ️ INSTRUCTIONAL OVERLAY
// ==========================================================
function createInstructions() {
  const div = document.createElement('div');
  div.style.position = 'absolute';
  div.style.bottom = '30px';
  div.style.left = '30px';
  div.style.color = PORTFOLIO_THEME_COLOR;
  div.style.fontFamily = "'Courier New', monospace"; 
  div.style.background = 'rgba(0, 0, 0, 0.7)';
  div.style.padding = '20px';
  div.style.borderRadius = '12px';
  div.style.border = `1px solid ${PORTFOLIO_THEME_COLOR}`;
  div.style.pointerEvents = 'none'; 
  div.style.backdropFilter = 'blur(5px)';
  div.style.maxWidth = '300px';

  div.innerHTML = `
    <h3 style="margin: 0 0 10px 0; color: white; font-size: 16px;">// INTERACTION MODE</h3>
    <ul style="padding-left: 20px; margin: 0; font-size: 14px; line-height: 1.6;">
      <li><b style="color:white">🤏 PINCH FINGERS:</b> Black Hole</li>
      <li><b style="color:white">😁 SMILE WIDE:</b> Anti-Gravity</li>
      <li><b style="color:white">😮 OPEN MOUTH:</b> Shockwave</li>
    </ul>
  `;
  document.body.appendChild(div);
}

// ==========================================================
// 🔹 SCENE SETUP
// ==========================================================
const app = document.querySelector('#app');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#050505'); 

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.z = 2; 
camera.scale.x = -1; // Mirror Flip

const renderer = new THREE.WebGLRenderer({ powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
app.appendChild(renderer.domElement);

// Post-Processing
const renderScene = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = config.bloomThreshold;
bloomPass.strength = config.bloomStrength;
bloomPass.radius = config.bloomRadius;

const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);

// ==========================================================
// 💠 PARTICLES
// ==========================================================
function getTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 32; canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.arc(16, 16, 8, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  return new THREE.CanvasTexture(canvas);
}

function createSystem(count, colorHex) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  for(let i=0; i<count*3; i++) positions[i] = (Math.random()-0.5)*50;
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

  return new THREE.Points(geometry, material);
}

const faceParticles = createSystem(478, PORTFOLIO_THEME_COLOR);
const handParticles = createSystem(84, PORTFOLIO_THEME_COLOR); 
scene.add(faceParticles);
scene.add(handParticles);

// ==========================================================
// 🧠 COMPUTER VISION
// ==========================================================
let faceLandmarker, handLandmarker, video;
let lastVideoTime = -1;

async function setupVision() {
  const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm");
  
  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`, delegate: "GPU" },
    runningMode: "VIDEO", numFaces: 1, outputFaceBlendshapes: true
  });
  
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`, delegate: "GPU" },
    runningMode: "VIDEO", numHands: 2
  });
  
  startWebcam();
}

function startWebcam() {
  video = document.createElement("video");
  navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: "user" } }).then((stream) => {
    video.srcObject = stream;
    video.play();
    video.addEventListener("loadeddata", loop);
    createInstructions(); 
  });
}

// ==========================================================
// 🔄 LOGIC LOOP
// ==========================================================
const clock = new THREE.Clock();

function loop() {
  const time = clock.getElapsedTime();
  let startTimeMs = performance.now();

  if (video && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    
    // --- 1. FACE LOGIC ---
    if (faceLandmarker) {
      const result = faceLandmarker.detectForVideo(video, startTimeMs);
      if (result.faceLandmarks.length > 0) {
        const landmarks = result.faceLandmarks[0];
        
        // INTERACTION: Shockwave (Mouth Open)
        const upper = landmarks[13];
        const lower = landmarks[14];
        const mouthOpenDist = Math.hypot(upper.x - lower.x, upper.y - lower.y);
        state.isMouthOpen = mouthOpenDist > config.mouthThreshold;

        // INTERACTION: Golden Smile
        const leftCorner = landmarks[61];
        const rightCorner = landmarks[291];
        const mouthWidth = Math.hypot(leftCorner.x - rightCorner.x, leftCorner.y - rightCorner.y);
        state.isSmiling = mouthWidth > 0.45 && !state.isMouthOpen;

        // Apply Colors
        let targetColor = PORTFOLIO_THEME_COLOR;
        if (state.isMouthOpen) targetColor = SHOCK_COLOR;
        if (state.isSmiling) targetColor = GOLD_COLOR;
        
        faceParticles.material.color.lerp(new THREE.Color(targetColor), 0.2);
        
        updateParticles(faceParticles, landmarks, time, true);
      }
    }
    
    // --- 2. HAND LOGIC ---
    if (handLandmarker) {
      const result = handLandmarker.detectForVideo(video, startTimeMs);
      state.isPinching = false; 

      if (result.landmarks.length > 0) {
        const hand = result.landmarks[0];
        const thumb = hand[4];
        const index = hand[8];
        const pinchDist = Math.hypot(thumb.x - index.x, thumb.y - index.y);
        
        if (pinchDist < config.pinchThreshold) {
          state.isPinching = true;
          state.pinchPosition.set(
            (thumb.x - 0.5) * -8.0 * (window.innerWidth/window.innerHeight),
            -(thumb.y - 0.5) * 6.0,
            -thumb.z * 5
          );
        }

        updateParticles(handParticles, result.landmarks.flat(), time, false);
      }
    }
  }

  composer.render();
  requestAnimationFrame(loop);
}

// ==========================================================
// 📐 PHYSICS & MATH
// ==========================================================
function updateParticles(system, landmarks, time, isFace) {
  const positions = system.geometry.attributes.position.array;
  const count = landmarks.length;
  
  const aspect = window.innerWidth / window.innerHeight;
  const spreadX = 9.0 * aspect; 
  const spreadY = 7.0;
  
  for (let i = 0; i < positions.length / 3; i++) {
    if (i >= landmarks.length) break; 
    const lm = landmarks[i];
    
    let tx = (lm.x - 0.5) * -spreadX; 
    let ty = -(lm.y - 0.5) * spreadY; 
    let tz = -lm.z * 5;

    let noiseAmp = config.baseNoise;
    // REDUCE NOISE ON LIPS (Indices 0-20)
    if (isFace && i < 20) noiseAmp = 0.005; 
    
    // INCREASE NOISE FOR EFFECTS
    if (state.isMouthOpen) noiseAmp = 0.08;
    if (state.isSmiling) noiseAmp = 0.04;

    const nX = Math.sin(time * 2 + i) * noiseAmp;
    const nY = Math.cos(time * 3 + i) * noiseAmp;
    
    if (state.isSmiling && isFace) {
       ty += 0.2; 
       tx += Math.sin(time * 5 + i) * 0.02; 
    }

    if (state.isPinching) {
       const dx = state.pinchPosition.x - tx;
       const dy = state.pinchPosition.y - ty;
       const dz = state.pinchPosition.z - tz;
       const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
       if (dist < 2.0) {
          tx = THREE.MathUtils.lerp(tx, state.pinchPosition.x, 0.15);
          ty = THREE.MathUtils.lerp(ty, state.pinchPosition.y, 0.15);
          tz = THREE.MathUtils.lerp(tz, state.pinchPosition.z, 0.15);
       }
    }

    const idx = i * 3;
    positions[idx]   += (tx + nX - positions[idx]) * config.lerpSpeed;
    positions[idx+1] += (ty + nY - positions[idx+1]) * config.lerpSpeed;
    positions[idx+2] += (tz - positions[idx+2]) * config.lerpSpeed;
  }
  system.geometry.attributes.position.needsUpdate = true;
}

// ==========================================================
// 🎛️ FIXED CONTROLS (THE MENU)
// ==========================================================
const pane = new Pane({ title: 'Burhan Settings' });

// 1. Particle Size (Visual Update)
pane.addBinding(config, 'particleSize', { min: 0.01, max: 0.15, label: 'Particle Size' })
    .on('change', (ev) => {
        faceParticles.material.size = ev.value;
        handParticles.material.size = ev.value;
    });

// 2. Bloom/Glow (Post-Processing Update)
pane.addBinding(config, 'bloomStrength', { min: 0.0, max: 2.5, label: 'Glow Strength' })
    .on('change', (ev) => {
        bloomPass.strength = ev.value;
    });

pane.addBinding(config, 'bloomRadius', { min: 0.0, max: 1.0, label: 'Glow Radius' })
    .on('change', (ev) => {
        bloomPass.radius = ev.value;
    });

// 3. Logic (Loop Updates automatically read config)
pane.addBinding(config, 'lerpSpeed', { min: 0.05, max: 0.5, label: 'Tracking Speed' });
pane.addBinding(config, 'mouthThreshold', { min: 0.01, max: 0.15, label: 'Mouth Sensitivity' });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

setupVision();
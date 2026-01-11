import './style.css'
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FilesetResolver, FaceLandmarker, HandLandmarker } from '@mediapipe/tasks-vision';
import { Pane } from 'tweakpane';

// ==========================================================
// 🎨 BURHAN'S BRAND CONFIGURATION
// Auto-matched from your website screenshot
// ==========================================================
const PORTFOLIO_THEME_COLOR = '#D4F842'; // <--- Your XR Lime Green

const config = {
  // Visuals
  particleCount: 1600,
  particleSize: 0.14, // Slightly larger for that "bold" XR look
  
  // Colors (Starts with your Theme)
  faceColor: PORTFOLIO_THEME_COLOR,
  handColor: PORTFOLIO_THEME_COLOR, 
  
  // Physics & Interaction
  lerpSpeed: 0.2,       
  noiseStrength: 0.05,  
  
  // Futuristic Glow (adjusted for Lime Green)
  bloomStrength: 1.0, 
  bloomThreshold: 0.1,
  
  // Logic
  mouthThreshold: 0.06, 
  autoRotateColor: false, 
};

// ==========================================================
// 🔹 SETUP SCENE & CAMERA
// ==========================================================
const app = document.querySelector('#app');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#050505'); // Matching your site's dark background

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.z = 2.5;
camera.scale.x = -1; // MIRROR EFFECT

const renderer = new THREE.WebGLRenderer({ powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
app.appendChild(renderer.domElement);

// ==========================================================
// ✨ POST-PROCESSING (GLOW)
// ==========================================================
const renderScene = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = config.bloomThreshold;
bloomPass.strength = config.bloomStrength;
bloomPass.radius = 0.5;

const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);

// ==========================================================
// 💠 PARTICLE SYSTEM GENERATOR
// ==========================================================
function getTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 32; canvas.height = 32;
  const ctx = canvas.getContext('2d');
  
  // Soft glow texture
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0,0,32,32);
  
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

const faceParticles = createSystem(478, config.faceColor);
const handParticles = createSystem(84, config.handColor);

scene.add(faceParticles);
scene.add(handParticles);

// ==========================================================
// 🧠 COMPUTER VISION (MEDIAPIPE)
// ==========================================================
let faceLandmarker, handLandmarker, video;
let lastVideoTime = -1;

async function setupVision() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );
  
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
  });
}

// ==========================================================
// 🔄 ANIMATION LOOP
// ==========================================================
const clock = new THREE.Clock();

function loop() {
  const time = clock.getElapsedTime();
  let startTimeMs = performance.now();

  // --- COLOR DYNAMICS ---
  if (config.autoRotateColor) {
    const hue = (time * 0.1) % 1;
    faceParticles.material.color.setHSL(hue, 1, 0.5);
    handParticles.material.color.setHSL((hue + 0.5) % 1, 1, 0.5);
  }

  if (video && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    
    // 1. FACE TRACKING
    if (faceLandmarker) {
      const result = faceLandmarker.detectForVideo(video, startTimeMs);
      if (result.faceLandmarks.length > 0) {
        const landmarks = result.faceLandmarks[0];
        
        // MOUTH INTERACTION
        const upper = landmarks[13];
        const lower = landmarks[14];
        const dist = Math.hypot(upper.x - lower.x, upper.y - lower.y);
        
        if (dist > config.mouthThreshold) {
           // On mouth open: Flash white/cyan energy
           faceParticles.material.color.setHex(0xFFFFFF); 
           config.noiseStrength = 0.15; 
        } else if (!config.autoRotateColor) {
           // Return to Burhan Lime Green
           faceParticles.material.color.lerp(new THREE.Color(PORTFOLIO_THEME_COLOR), 0.1);
           config.noiseStrength = THREE.MathUtils.lerp(config.noiseStrength, 0.05, 0.1);
        }
        
        updateParticles(faceParticles, landmarks, time);
      }
    }
    
    // 2. HAND TRACKING
    if (handLandmarker) {
      const result = handLandmarker.detectForVideo(video, startTimeMs);
      if (result.landmarks.length > 0) {
        updateParticles(handParticles, result.landmarks.flat(), time);
      }
    }
  }

  composer.render();
  requestAnimationFrame(loop);
}

function updateParticles(system, landmarks, time) {
  const positions = system.geometry.attributes.position.array;
  const count = landmarks.length;
  
  for (let i = 0; i < positions.length / 3; i++) {
    const lm = landmarks[i % count];
    const tx = (lm.x - 0.5) * -5; 
    const ty = -(lm.y - 0.5) * 4;
    const tz = -lm.z * 5; 

    const nX = Math.sin(time * 2 + i) * config.noiseStrength;
    const nY = Math.cos(time * 3 + i) * config.noiseStrength;

    const idx = i * 3;
    positions[idx]   += (tx + nX - positions[idx]) * config.lerpSpeed;
    positions[idx+1] += (ty + nY - positions[idx+1]) * config.lerpSpeed;
    positions[idx+2] += (tz - positions[idx+2]) * config.lerpSpeed;
  }
  system.geometry.attributes.position.needsUpdate = true;
}

// ==========================================================
// 🎛️ CONTROLS (GUI)
// ==========================================================
const pane = new Pane({ title: 'Burhan System' });
pane.addButton({ title: 'Reset Color' }).on('click', () => {
    config.autoRotateColor = false;
    faceParticles.material.color.set(PORTFOLIO_THEME_COLOR);
    handParticles.material.color.set(PORTFOLIO_THEME_COLOR);
});
pane.addBinding(config, 'autoRotateColor', { label: 'Rainbow Mode' });
pane.addBinding(config, 'particleSize', { min: 0.01, max: 0.3 });
pane.addBinding(config, 'bloomStrength', { min: 0, max: 3, label: 'Glow' });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

setupVision();
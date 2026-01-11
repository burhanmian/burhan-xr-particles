import './style.css'
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { FilesetResolver, FaceLandmarker, HandLandmarker } from '@mediapipe/tasks-vision';
import { Pane } from 'tweakpane';

// ==========================================================
// 🎨 BURHAN'S BRAND CONFIGURATION
// ==========================================================
const PORTFOLIO_THEME_COLOR = '#D4F842'; // Lime Green
const GAME_OBJECT_COLOR = '#FFD700';     // Gold Stars

const config = {
  // Visuals
  faceLayers: 3,         // 3 layers for face depth
  handLayers: 15,        // 15 layers for THICK hands (Fixed!)
  particleSize: 0.045,   // Slightly larger for visibility
  
  // Physics
  lerpSpeed: 0.2,       
  baseNoise: 0.01,
  centeringSpeed: 0.03,  // Slightly faster centering
  
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
// 🧊 3D LOGO SETUP (Safe Mode)
// ==========================================================
let logoMesh;

function setupLogo() {
  const loader = new FontLoader();
  // Using a reliable CDN source with error handling
  loader.load(
    'https://unpkg.com/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json', 
    function (font) {
      const textGeo = new TextGeometry('BURHAN', {
        font: font,
        size: 0.5,
        height: 0.1,
        curveSegments: 12,
        bevelEnabled: true,
        bevelThickness: 0.02,
        bevelSize: 0.015,
        bevelOffset: 0,
        bevelSegments: 5
      });
      textGeo.computeBoundingBox();
      const centerOffset = -0.5 * (textGeo.boundingBox.max.x - textGeo.boundingBox.min.x);
      textGeo.translate(centerOffset, 0, 0);

      const materials = [
        new THREE.MeshStandardMaterial({ 
          color: PORTFOLIO_THEME_COLOR, 
          emissive: PORTFOLIO_THEME_COLOR, 
          emissiveIntensity: 0.6,
          roughness: 0.2 
        }), 
        new THREE.MeshStandardMaterial({ 
          color: 0x444444, 
          metalness: 0.9, 
          roughness: 0.1 
        })
      ];

      logoMesh = new THREE.Mesh(textGeo, materials);
      logoMesh.position.set(-4.2, 2.8, -2); 
      logoMesh.rotation.x = 0.2;
      scene.add(logoMesh);
    },
    undefined, // onProgress
    function (err) {
      console.log("Logo Font Failed to Load - Skipping", err);
      // App continues even if font fails
    }
  );
}

function animateLogo(time) {
  if (!logoMesh) return;
  logoMesh.position.y = 2.8 + Math.sin(time * 1.5) * 0.05;
  logoMesh.rotation.y = Math.sin(time * 1) * 0.05;
}

// ==========================================================
// 🎮 GAME LOGIC
// ==========================================================
const targets = []; 

function spawnTarget() {
  if (targets.length >= 5) return; 
  const geometry = new THREE.SphereGeometry(0.15, 8, 8);
  const material = new THREE.MeshBasicMaterial({ color: GAME_OBJECT_COLOR, wireframe: true });
  const star = new THREE.Mesh(geometry, material);
  star.position.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4, (Math.random() * 2) - 1);
  scene.add(star);
  targets.push(star);
}

function updateGame(time) {
  targets.forEach(t => { t.rotation.x = time * 2; t.rotation.y = time; });
  if (Math.floor(time) % 2 === 0 && Math.random() > 0.9) spawnTarget();
}

function checkCollision(position) {
  for (let i = targets.length - 1; i >= 0; i--) {
    const t = targets[i];
    if (position.distanceTo(t.position) < 0.6) {
      scene.remove(t);
      targets.splice(i, 1);
      state.score += 10;
      updateHUD();
      config.bloomStrength = 2.5; 
      setTimeout(() => { config.bloomStrength = 0.8 }, 200);
    }
  }
}

// ==========================================================
// ℹ️ HUD
// ==========================================================
let scoreElement;
function createHUD() {
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.width = '100%';
  container.style.height = '100%';
  container.style.pointerEvents = 'none'; 
  
  const instr = document.createElement('div');
  instr.style.position = 'absolute';
  instr.style.bottom = '30px';
  instr.style.left = '30px';
  instr.style.color = PORTFOLIO_THEME_COLOR;
  instr.style.fontFamily = "'Courier New', monospace"; 
  instr.style.background = 'rgba(0, 0, 0, 0.7)';
  instr.style.padding = '15px';
  instr.style.borderRadius = '8px';
  instr.innerHTML = `<b>// SYSTEM ONLINE</b><br>• CATCH STARS<br>• PINCH = BLACK HOLE<br>• AUTO-CENTERING...`;
  
  scoreElement = document.createElement('div');
  scoreElement.style.position = 'absolute';
  scoreElement.style.top = '60px'; 
  scoreElement.style.right = '30px';
  scoreElement.style.color = GAME_OBJECT_COLOR;
  scoreElement.style.fontSize = '20px';
  scoreElement.style.fontFamily = 'monospace';
  scoreElement.style.fontWeight = 'bold';
  scoreElement.style.textShadow = '0 0 10px rgba(255,215,0,0.5)';
  scoreElement.innerHTML = `SCORE: 000`;

  container.appendChild(instr);
  container.appendChild(scoreElement);
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
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 5, 5);
scene.add(directionalLight);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.z = 2.5; 
camera.scale.x = -1; 

const renderer = new THREE.WebGLRenderer({ powerPreference: "high-performance" });
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
// 💠 VOLUMETRIC PARTICLES (With variable layers)
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

function createSystem(landmarkCount, layers, colorHex) {
  const totalParticles = landmarkCount * layers;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(totalParticles * 3);
  for(let i=0; i<totalParticles*3; i++) positions[i] = (Math.random()-0.5)*50;
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  
  const material = new THREE.PointsMaterial({
    color: new THREE.Color(colorHex),
    map: getTexture(),
    size: config.particleSize,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  
  // Store layer count in userData so we can access it in loop
  const points = new THREE.Points(geometry, material);
  points.userData = { layers: layers };
  return points;
}

// FACE: 478 points * 3 layers
const faceParticles = createSystem(478, config.faceLayers, PORTFOLIO_THEME_COLOR);
// HAND: 42 points * 15 layers (DENSE!)
const handParticles = createSystem(42, config.handLayers, PORTFOLIO_THEME_COLOR); 

scene.add(faceParticles);
scene.add(handParticles);

// ==========================================================
// 🧠 COMPUTER VISION
// ==========================================================
let faceLandmarker, handLandmarker, video;
let lastVideoTime = -1;

async function setupVision() {
  const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm");
  faceLandmarker = await FaceLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`, delegate: "GPU" }, runningMode: "VIDEO", numFaces: 1, outputFaceBlendshapes: true });
  handLandmarker = await HandLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`, delegate: "GPU" }, runningMode: "VIDEO", numHands: 2 });
  startWebcam();
}

function startWebcam() {
  video = document.createElement("video");
  navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: "user" } }).then((stream) => {
    video.srcObject = stream;
    video.play();
    video.addEventListener("loadeddata", () => {
        setupLogo(); 
        createHUD();
        spawnTarget();
        loop();
    });
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
  animateLogo(time);

  if (video && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    
    // 1. FACE LOGIC
    if (faceLandmarker) {
      const result = faceLandmarker.detectForVideo(video, startTimeMs);
      if (result.faceLandmarks.length > 0) {
        const landmarks = result.faceLandmarks[0];
        const noseX = landmarks[1].x;
        const noseY = landmarks[1].y;
        
        // AUTO CENTER LOGIC
        const targetOffsetX = (0.5 - noseX) * 5.0; 
        const targetOffsetY = (0.5 - noseY) * 3.0;
        state.autoCenterOffset.x = THREE.MathUtils.lerp(state.autoCenterOffset.x, targetOffsetX, config.centeringSpeed);
        state.autoCenterOffset.y = THREE.MathUtils.lerp(state.autoCenterOffset.y, targetOffsetY, config.centeringSpeed);
        
        state.headPosition.set((noseX - 0.5) * -8 + state.autoCenterOffset.x, -(noseY - 0.5) * 6 + state.autoCenterOffset.y, 0);
        checkCollision(state.headPosition);
        
        const upper = landmarks[13]; const lower = landmarks[14];
        state.isMouthOpen = Math.hypot(upper.x - lower.x, upper.y - lower.y) > config.mouthThreshold;
        
        updateVolumetricParticles(faceParticles, landmarks, time, true);
      }
    }
    
    // 2. HAND LOGIC
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
        updateVolumetricParticles(handParticles, result.landmarks.flat(), time, false);
      }
    }
  }
  composer.render();
  requestAnimationFrame(loop);
}

// ==========================================================
// 💠 VOLUMETRIC UPDATE (Handles variable density)
// ==========================================================
function updateVolumetricParticles(system, landmarks, time, isFace) {
  const positions = system.geometry.attributes.position.array;
  const count = landmarks.length;
  const layers = system.userData.layers; // Get specific layer count (3 for face, 15 for hand)
  
  const aspect = window.innerWidth / window.innerHeight;
  const spreadX = 9.0 * aspect; 
  const spreadY = 7.0;
  
  for (let i = 0; i < count; i++) {
    const lm = landmarks[i];
    const bx = (lm.x - 0.5) * -spreadX; 
    const by = -(lm.y - 0.5) * spreadY; 
    const bz = -lm.z * 5;
    
    const startIdx = i * layers * 3;

    for (let layer = 0; layer < layers; layer++) {
        const idx = startIdx + (layer * 3);
        
        // Distribute layers for volume
        // Face uses 3 layers. Hand uses 15.
        // We spread them out slightly in Z depth
        let depthOffset = (layer - (layers/2)) * 0.1; 

        let noise = config.baseNoise;
        if (state.isMouthOpen) noise = 0.05; 
        if (layer > 0) noise *= 1.5; // Outer layers messier

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
// 🎛️ UI
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
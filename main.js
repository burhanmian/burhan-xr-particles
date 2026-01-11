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
  position: 'absolute', top: '10px', left: '10px', color: '#00ff00',
  fontFamily: 'monospace', fontSize: '10px', zIndex: '999', pointerEvents: 'none'
});
document.body.appendChild(debugDiv);
function log(msg) { debugDiv.innerHTML += `> ${msg}<br>`; console.log(msg); }
log("Initializing Burhan XR System...");

// ==========================================================
// 🎨 CONFIGURATION
// ==========================================================
const config = {
  // Visuals
  faceLayers: 3,         
  handLayers: 20,        // INCREASED: 20 layers for massive trails
  particleSize: 0.05,
  use3D: true,           
  
  // Colors
  rainbowMode: false,
  faceColor: '#D4F842',  // Burhan Lime
  handColor: '#00FFFF',  // Cyan Energy
  
  // Physics
  lerpSpeed: 0.2,       
  baseNoise: 0.01,
  centeringSpeed: 0.03,  
  
  // Bloom
  bloomStrength: 1.2,    // Increased glow for hands
  bloomThreshold: 0.1,
  bloomRadius: 0.6,
  
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
  headPosition: new THREE.Vector3(0, 0, 0),
  handCenters: [new THREE.Vector3(), new THREE.Vector3()] // Track hand centers for orbits
};

// ==========================================================
// 🖥️ UI: HUD & HEADER
// ==========================================================
let scoreElement;

function createHUD() {
  const container = document.createElement('div');
  Object.assign(container.style, { position: 'absolute', width: '100%', height: '100%', pointerEvents: 'none' });
  
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

  scoreElement = document.createElement('div');
  Object.assign(scoreElement.style, { marginTop: '10px', color: '#FFD700', fontFamily: 'monospace', fontSize: '24px', fontWeight: 'bold' });
  scoreElement.innerHTML = `SCORE: 000`;
  header.appendChild(scoreElement);

  const instr = document.createElement('div');
  Object.assign(instr.style, {
    position: 'absolute', bottom: '30px', left: '30px', color: config.faceColor,
    fontFamily: "monospace", background: 'rgba(0, 0, 0, 0.85)', padding: '20px',
    borderRadius: '12px', borderLeft: `4px solid ${config.faceColor}`, boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
  });
  instr.innerHTML = `
    <b style="color:white; font-size:16px;">// CONTROLS</b><br>
    <span style="color:#aaa">• MOVE HANDS = LIGHT TRAILS</span><br>
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
    if (position.distanceTo(t.position) < 0.6) { // Increased hit radius for hands
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
// =================================================
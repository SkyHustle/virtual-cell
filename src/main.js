import * as THREE from 'three';

// ─── Scene setup ────────────────────────────────────────────────
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 0, 4.5);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0); // transparent bg — CSS handles bg color

const hero = document.querySelector('.hero');
hero.prepend(renderer.domElement);

// ─── Shared shader chunks ────────────────────────────────────────

// Gradient noise helpers (hash + value noise + fbm)
const noiseGLSL = /* glsl */ `
  vec3 hash3(vec3 p) {
    p = vec3(
      dot(p, vec3(127.1, 311.7, 74.7)),
      dot(p, vec3(269.5, 183.3, 246.1)),
      dot(p, vec3(113.5, 271.9, 124.6))
    );
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  float vnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);

    return mix(
      mix(
        mix(dot(hash3(i + vec3(0,0,0)), f - vec3(0,0,0)),
            dot(hash3(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
        mix(dot(hash3(i + vec3(0,1,0)), f - vec3(0,1,0)),
            dot(hash3(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x),
        u.y),
      mix(
        mix(dot(hash3(i + vec3(0,0,1)), f - vec3(0,0,1)),
            dot(hash3(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
        mix(dot(hash3(i + vec3(0,1,1)), f - vec3(0,1,1)),
            dot(hash3(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x),
        u.y),
      u.z
    );
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    for (int i = 0; i < 4; i++) {
      value += amplitude * vnoise(p * frequency);
      amplitude *= 0.5;
      frequency *= 2.1;
    }
    return value;
  }
`;

// ─── Membrane vertex shader ──────────────────────────────────────
const membraneVertexShader = /* glsl */ `
  ${noiseGLSL}

  uniform float uTime;
  uniform float uMorph;
  uniform vec2  uMouse;

  varying vec3  vNormal;
  varying vec3  vViewPosition;
  varying float vDisplacement;

  void main() {
    // Morph-driven parameters
    float freq      = mix(1.2, 2.8, uMorph);
    float amplitude = mix(0.06, 0.42, uMorph);
    float speed     = mix(0.25, 0.75, uMorph);

    // Base fbm displacement
    vec3 pos = position;
    float disp = fbm(pos * freq + uTime * speed);

    // Secondary mouse ripple
    float mouseRipple = vnoise(pos * 4.0 + vec3(uMouse.x * 2.0, uMouse.y * 2.0, 0.0)) * 0.08;

    float totalDisp = disp * amplitude + mouseRipple * uMorph;

    vec3 displaced = position + normal * totalDisp;

    vNormal = normalMatrix * normal;
    vec4 mvPos = modelViewMatrix * vec4(displaced, 1.0);
    vViewPosition = -mvPos.xyz;
    vDisplacement = totalDisp;

    gl_Position = projectionMatrix * mvPos;
  }
`;

// ─── Membrane fragment shader ────────────────────────────────────
const membraneFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uMorph;

  varying vec3  vNormal;
  varying vec3  vViewPosition;
  varying float vDisplacement;

  void main() {
    vec3 normal   = normalize(vNormal);
    vec3 viewDir  = normalize(vViewPosition);

    // Fresnel
    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.5);

    // Base / accent colors
    vec3 baseColor   = vec3(0.490, 0.827, 0.988); // 0x7dd3fc
    vec3 accentColor = vec3(0.655, 0.545, 0.980); // 0xa78bfa
    vec3 rimColor    = vec3(0.431, 0.906, 1.000); // 0x6ee7ff

    // Color mix driven by morph + displacement
    float colorT = clamp(uMorph * 0.5 + vDisplacement * 1.5, 0.0, 1.0);
    vec3  color  = mix(baseColor, accentColor, colorT);

    // Subtle iridescence — hue shift based on view angle + time, gated by morph
    float iridT  = dot(normal, viewDir) * 0.5 + 0.5;
    vec3  irid   = vec3(
      sin(iridT * 3.14 + uTime * 0.4) * 0.5 + 0.5,
      cos(iridT * 3.14 + uTime * 0.3) * 0.5 + 0.5,
      sin(iridT * 6.28 + uTime * 0.5) * 0.5 + 0.5
    );
    color = mix(color, irid, uMorph * 0.18);

    // Rim glow
    float rimStrength = mix(0.4, 1.4, uMorph);
    color += rimColor * fresnel * rimStrength;

    // Alpha: transparent interior, glowing edges
    float alpha = mix(0.04, 0.50, fresnel) + uMorph * 0.10;

    gl_FragColor = vec4(color, alpha);
  }
`;

// ─── Inner glow shaders (same vertex, softer fragment) ───────────
const innerGlowVertexShader = /* glsl */ `
  ${noiseGLSL}

  uniform float uTime;
  uniform float uMorph;
  uniform vec2  uMouse;

  varying vec3  vNormal;
  varying vec3  vViewPosition;
  varying float vDisplacement;

  void main() {
    float freq      = mix(1.0, 2.2, uMorph);
    float amplitude = mix(0.04, 0.28, uMorph);
    float speed     = mix(0.2, 0.6, uMorph);

    vec3  pos  = position;
    float disp = fbm(pos * freq + uTime * speed + 1.7);

    float totalDisp = disp * amplitude;
    vec3  displaced = position + normal * totalDisp;

    vNormal = normalMatrix * normal;
    vec4 mvPos = modelViewMatrix * vec4(displaced, 1.0);
    vViewPosition = -mvPos.xyz;
    vDisplacement = totalDisp;

    gl_Position = projectionMatrix * mvPos;
  }
`;

const innerGlowFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uMorph;

  varying vec3  vNormal;
  varying vec3  vViewPosition;
  varying float vDisplacement;

  void main() {
    vec3  normal  = normalize(vNormal);
    vec3  viewDir = normalize(vViewPosition);
    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.5);

    vec3 innerBase   = vec3(0.431, 0.906, 1.000); // accent blue
    vec3 innerAccent = vec3(0.8,   0.5,   1.000); // warm violet tint

    vec3  color = mix(innerBase, innerAccent, uMorph * 0.6 + vDisplacement * 0.8);
    float alpha = mix(0.02, 0.30, fresnel) * mix(0.6, 1.0, uMorph);

    gl_FragColor = vec4(color, alpha);
  }
`;

// ─── Build objects ───────────────────────────────────────────────

// Group so we can offset + rotate all together
const cellGroup = new THREE.Group();
cellGroup.position.x = 0.8;
scene.add(cellGroup);

// 1. Membrane
const membraneGeo = new THREE.IcosahedronGeometry(1.0, 5);
const membraneMat = new THREE.ShaderMaterial({
  vertexShader:   membraneVertexShader,
  fragmentShader: membraneFragmentShader,
  uniforms: {
    uTime:  { value: 0 },
    uMorph: { value: 0 },
    uMouse: { value: new THREE.Vector2(0, 0) },
  },
  transparent: true,
  depthWrite:  false,
  blending:    THREE.AdditiveBlending,
  side:        THREE.DoubleSide,
});
const membraneMesh = new THREE.Mesh(membraneGeo, membraneMat);
cellGroup.add(membraneMesh);

// 2. Inner glow
const innerGeo = new THREE.IcosahedronGeometry(0.65, 3);
const innerMat = new THREE.ShaderMaterial({
  vertexShader:   innerGlowVertexShader,
  fragmentShader: innerGlowFragmentShader,
  uniforms: {
    uTime:  { value: 0 },
    uMorph: { value: 0 },
    uMouse: { value: new THREE.Vector2(0, 0) },
  },
  transparent: true,
  depthWrite:  false,
  blending:    THREE.AdditiveBlending,
  side:        THREE.DoubleSide,
});
const innerMesh = new THREE.Mesh(innerGeo, innerMat);
cellGroup.add(innerMesh);

// ─── Commit snapshot: membrane + inner glow built ─────────────────

// 3. Nucleus
const nucleusGeo = new THREE.SphereGeometry(0.18, 16, 16);
const nucleusMat = new THREE.MeshBasicMaterial({
  color:     0xf0abfc,
  transparent: true,
  opacity:   0.85,
  blending:  THREE.AdditiveBlending,
  depthWrite: false,
});
const nucleusMesh = new THREE.Mesh(nucleusGeo, nucleusMat);
cellGroup.add(nucleusMesh);

// 4. Particles — 280 points on a shell r = 1.6 → 2.4
const PARTICLE_COUNT = 280;

const particlePositions = new Float32Array(PARTICLE_COUNT * 3);
const particleOffsets   = new Float32Array(PARTICLE_COUNT);

for (let i = 0; i < PARTICLE_COUNT; i++) {
  // Fibonacci sphere distribution for uniform coverage
  const phi   = Math.acos(1 - 2 * (i + 0.5) / PARTICLE_COUNT);
  const theta = Math.PI * (1 + Math.sqrt(5)) * i;
  const r     = 1.6 + Math.random() * 0.8; // 1.6–2.4

  particlePositions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
  particlePositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
  particlePositions[i * 3 + 2] = r * Math.cos(phi);

  particleOffsets[i] = Math.random() * Math.PI * 2;
}

const particleGeo = new THREE.BufferGeometry();
particleGeo.setAttribute('position',  new THREE.BufferAttribute(particlePositions, 3));
particleGeo.setAttribute('aOffset',   new THREE.BufferAttribute(particleOffsets, 1));

const particleVertexShader = /* glsl */ `
  attribute float aOffset;
  uniform float   uTime;
  uniform float   uMorph;

  varying float vAlpha;

  void main() {
    float speed    = 1.2 + aOffset * 0.3;
    float sizePulse = sin(uTime * speed + aOffset) * 0.5 + 0.5;
    float baseSize  = mix(1.5, 3.5, uMorph);

    vAlpha = sizePulse * mix(0.4, 0.9, uMorph);

    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_Position  = projectionMatrix * mvPos;
    gl_PointSize = baseSize * sizePulse * (300.0 / -mvPos.z);
  }
`;

const particleFragmentShader = /* glsl */ `
  uniform float uMorph;
  varying float vAlpha;

  void main() {
    // Circular point
    vec2  uv   = gl_PointCoord - 0.5;
    float dist = length(uv);
    if (dist > 0.5) discard;

    float fade = 1.0 - smoothstep(0.2, 0.5, dist);

    vec3 colA = vec3(0.431, 0.906, 1.000); // accent
    vec3 colB = vec3(0.655, 0.545, 0.980); // accent2
    vec3 col  = mix(colA, colB, uMorph);

    gl_FragColor = vec4(col, vAlpha * fade);
  }
`;

const particleMat = new THREE.ShaderMaterial({
  vertexShader:   particleVertexShader,
  fragmentShader: particleFragmentShader,
  uniforms: {
    uTime:  { value: 0 },
    uMorph: { value: 0 },
  },
  transparent: true,
  depthWrite:  false,
  blending:    THREE.AdditiveBlending,
});

const particles = new THREE.Points(particleGeo, particleMat);
cellGroup.add(particles);

// ─── Interaction state ───────────────────────────────────────────
let morphTarget  = 0;
let morphCurrent = 0;
let mouseX       = 0;
let mouseY       = 0;
let baseRotY     = 0;

// Mouse
window.addEventListener('mousemove', (e) => {
  mouseX = (e.clientX / window.innerWidth)  * 2 - 1;
  mouseY = (e.clientY / window.innerHeight) * 2 - 1;
});

// Scroll → morph
const heroHeight = hero.offsetHeight;
window.addEventListener('scroll', () => {
  const scrollY = window.scrollY;
  morphTarget = Math.min(scrollY / (heroHeight * 0.75), 1);
});

// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Animate ─────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const elapsed = clock.getElapsedTime();

  // Lerp morph
  morphCurrent += (morphTarget - morphCurrent) * 0.04;

  // Slow auto-rotation
  baseRotY += 0.002;

  // Tilt toward mouse
  cellGroup.rotation.y = baseRotY + mouseX * 0.35;
  cellGroup.rotation.x = mouseY * 0.20;

  // Update uniforms on all shader objects
  membraneMat.uniforms.uTime.value  = elapsed;
  membraneMat.uniforms.uMorph.value = morphCurrent;
  membraneMat.uniforms.uMouse.value.set(mouseX, mouseY);

  innerMat.uniforms.uTime.value  = elapsed;
  innerMat.uniforms.uMorph.value = morphCurrent;
  innerMat.uniforms.uMouse.value.set(mouseX, mouseY);

  particleMat.uniforms.uTime.value  = elapsed;
  particleMat.uniforms.uMorph.value = morphCurrent;

  // Nucleus subtle pulse
  const nucScale = 1 + Math.sin(elapsed * 1.8) * 0.06 + morphCurrent * 0.25;
  nucleusMesh.scale.setScalar(nucScale);

  renderer.render(scene, camera);
}

animate();

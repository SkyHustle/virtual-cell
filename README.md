# Virtual Cell — WebGL Hero Section

A high-impact, technology-forward hero section for a Biology SaaS product. Features a 3D morphing cell rendered in WebGL via Three.js with scroll-driven morph intensity and mouse-driven rotation/ripple.

## Stack

- **Vite ^6** — dev server + bundler
- **Three.js ^0.171.0** — WebGL scene, custom ShaderMaterials
- **pnpm** — package manager
- No framework, no runtime deps beyond Three.js

## Getting Started

```bash
pnpm install
pnpm dev       # opens at localhost:5173
pnpm build     # outputs to dist/
```

## Visual Design

| Token | Hex | Role |
|-------|-----|------|
| `--bg` | `#04040a` | page background |
| `--text` | `#e8eaf0` | primary text |
| `--dim` | `#3a3e5a` | secondary / meta |
| `--accent` | `#6ee7ff` | ice blue — calm state |
| `--accent2` | `#a78bfa` | violet — morphed state |

Typography: **Inter** 100/200/300 — extreme thinness, generous letter-spacing (Japanese minimalist aesthetic).

## Scene Architecture

| Object | Geometry | Shader |
|--------|----------|--------|
| Membrane | `IcosahedronGeometry(1.0, 5)` | Custom: FBM noise displacement, fresnel + iridescence |
| Inner glow | `IcosahedronGeometry(0.65, 3)` | Same vertex, softer fragment |
| Nucleus | `SphereGeometry(0.18, 16, 16)` | MeshBasicMaterial pink, additive blend |
| Particles | 280 pts, Fibonacci sphere r=1.6–2.4 | Custom: pulsing size + alpha |

### Shader uniforms

- `uTime` — elapsed seconds
- `uMorph` — 0 (calm) → 1 (morphed), driven by scroll position
- `uMouse` — vec2 normalized [-1, 1]

### Morph parameters

| State | Freq | Amplitude | Speed |
|-------|------|-----------|-------|
| Calm (uMorph=0) | 1.2 | 0.06 | 0.25 |
| Morphed (uMorph=1) | 2.8 | 0.42 | 0.75 |

## Interactions

- **Scroll** → morph: `morphTarget = scrollY / (heroHeight * 0.75)`, lerped at `0.04`
- **Mouse** → rotation: `mesh.rotation.y = baseRotY + mouseX * 0.35`, `mesh.rotation.x = mouseY * 0.20`
- **Mouse** → shader ripple: `uMouse` uniform passed to vertex shader for secondary noise pass
- **Resize** → camera aspect + renderer size updated

## Deployment

Vercel detects Vite automatically. Push to Git, connect repo — no `vercel.json` needed.

## File Structure

```
virtual-cell/
├── package.json
├── README.md
├── index.html
└── src/
    ├── style.css
    └── main.js    ← Three.js scene + all shaders
```

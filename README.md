# Daily VFX — 100 Days of Front-End Experiments

This repository hosts the **Daily VFX** challenge: one WebGL / generative-art experiment per day, bootstrapped with **React 19**, **Vite 7**, and **TypeScript 5**. Each page under `/day/:id` loads its own stack (p5.js, Three.js, PIXI, Tone.js, Mediapipe, etc.) so ideas can be prototyped quickly without bloating the main bundle.

> **Heads-up:** The Git repository root is `DailyUI/`. When you run `git status` inside `DailyUI/daily-vfx` you will see `../README.md` because the README lives at the repo root (this file). That is expected.

---

## Tech Stack
- React 19 + React Router 7 for the SPA shell.
- Vite 7 + TypeScript 5 for fast builds and strict typing.
- Tailwind CSS 4 (via `@tailwindcss/vite`) for utility-first styling.
- ESLint 9 with `typescript-eslint`, React Hooks, and React Refresh plugins.
- Creative libraries: p5.js, Three.js, PIXI.js, Tone.js, Mediapipe Tasks Vision.

---

## Project Layout
```
DailyUI/
├─ README.md              ← you are here
└─ daily-vfx/             ← Vite application
   ├─ src/
   │  ├─ App.tsx          main gallery + router outlet
   │  ├─ components/      GalleryGrid, GalleryCard, Header, ...
   │  ├─ pages/
   │  │  ├─ DayTemplate   shared layout for detail pages
   │  │  └─ DayXX/        individual daily experiments
   │  ├─ Data/Daysdata.ts metadata for days + assets
   │  └─ types/           shared TypeScript contracts
   ├─ public/
   │  ├─ dayXX/           high-res assets per challenge
   │  └─ preview/         thumbnails for the gallery
   ├─ vite.config.ts
   └─ package.json
```

---

## Development
```bash
cd daily-vfx
npm install          # install dependencies
npm run dev          # start Vite dev server
npm run build        # type-check + production build
npm run preview      # preview /dist locally
npm run lint         # ESLint (React + TS rules)
```

Recommended Node version: 20.x LTS.

---

## Adding a New Day
1. Duplicate an existing `src/pages/DayXX` folder or start from `DayTemplate.tsx`.
2. Register the entry in `src/Data/Daysdata.ts` (id, title, description, assets).
3. Drop preview imagery into `public/preview/dayXX.png` (or dedicated folders like `public/day14/`).
4. Keep heavy libraries local to the page so they tree-shake out of the main bundle.

Remember to clean up animation frames, listeners, and WebGL contexts in `useEffect` cleanup to avoid leaks when navigating.

---

## Deployment (Vercel)
- **Install command:** `npm install`
- **Build command:** `npm run build`
- **Output directory:** `dist`

Since this is a SPA, configure Vercel rewrites so every `/day/*` path resolves to `index.html`:

```json
{
  "rewrites": [
    { "source": "/day/(.*)", "destination": "/" }
  ]
}
```

---

## Troubleshooting
- Seeing `../README.md` in `git status`? That simply means you are inside the `daily-vfx` subfolder of the repo. Run `cd ..` to manage files from the root.
- If Vite fails to start because of Mediapipe / WebGL features, confirm you are on a Chromium-based browser and that background tabs are closed (some GPUs limit concurrent WebGL contexts).

---

## License
MIT — use the experiments however you like, but attribution is appreciated.

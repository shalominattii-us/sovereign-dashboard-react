# sovereign-dashboard-react
Sovereign React dashboard and operator console

## What is in this repo

- `server.js`: a small Express server. It serves static files from the folder named in `STATIC_PATH` (default `build/`) and falls back to `index.html`. It listens on `PORT` (default 3000). Start it with `npm start`.
- `public/index.html`: the page the server falls back to when no build folder is set.
- `src/components/SovereignDashboard.tsx` and `src/mobile/SovereignMobile.tsx`: the dashboard and mobile React components.
- `src/dashboard-websocket-server.ts`: the WebSocket server for the live dashboard feed.
- `docker-compose.yml` and `docker/`: container setup (dashboard image, Grafana, Prometheus, nginx).

## Status

This repo holds source files only. `package.json` lists `express` as its only dependency and has no build step (`npm run build` prints a message). The React components and the WebSocket server import packages that are not listed there yet, and there is no lockfile, so the TypeScript sources and the dashboard Docker image cannot be built from this repo as it stands.

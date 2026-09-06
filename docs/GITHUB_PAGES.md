# GitHub Pages deployment

Application URL: https://wieslawsoltes.github.io/SignalForgeStudio/

## Architecture

Only the browser files under `app/` are copied to the Pages artifact by `npm run build:pages`. The build inserts a static-hosting marker so an unconfigured streaming request reports the relay requirement without requesting a nonexistent GitHub Pages API. Relative resources support the repository subpath. Camera/microphone, screen capture, WebGPU/Canvas composition, Web Audio mixing, recording, and project storage execute in the browser. Browser feature detection, secure-context requirements, permissions, supported recording codecs, storage quotas, and foreground-tab scheduling still apply.

`relay/` remains source code in the repository and is not part of the public website artifact. GitHub Pages cannot execute Node.js, spawn FFmpeg, accept a WebSocket publishing connection, or store live recordings for you.

## Local relay

```sh
git clone https://github.com/wieslawsoltes/SignalForgeStudio.git
cd SignalForgeStudio
npm ci
npm start
```

Open the localhost URL printed by the relay. Set `SF_RTMP_URL` in your private terminal environment to publish to an RTMP/RTMPS destination. Without a destination, the relay explicitly uses archive mode.

For a separately hosted WSS relay, allowlist the exact origin:

```sh
SF_ALLOWED_ORIGINS=https://wieslawsoltes.github.io npm start
```

Place the loopback relay behind a trusted HTTPS/WSS reverse proxy, preserve the WebSocket Origin header, and configure the full WSS URL and terminal token in the hosted studio Settings. Do not use a wildcard origin or publish tokens/stream keys in the frontend. Insecure public `ws://` endpoints are not a reliable transport from an HTTPS page. Use the local studio for the simplest complete setup.

## CI and publication

The `pages.yml` workflow runs on pushes to `main`, pull requests, and manual dispatch. It installs the pinned relay dependency with `npm ci --ignore-scripts`, runs the unit tests, validates JavaScript syntax, and builds the standalone static artifact. Chromium then exercises WebGPU and the explicit Canvas fallback at `/SignalForgeStudio/`, including AudioWorklet loading, duplicate/undo, the static relay guard, and a real muxed recording stored in IndexedDB.

The exact tested build is uploaded with GitHub's official `upload-pages-artifact` action. Only successful, non-PR runs from `main` deploy using the official `deploy-pages` action and the `github-pages` environment. The deployment job has only `pages:write` and `id-token:write` permissions. No personal access token, source-branch force-push, or external hosting service is required.

Configure **Settings > Pages > Build and deployment > Source > GitHub Actions** when setting up this workflow on a repository. The workflow reads the Pages configuration and reports an error if it is unavailable rather than silently claiming publication. The `gh-pages` branch retained from initial staging is not the source of subsequent artifact deployments.

After deployment, CI checks the exact source revision and the application HTML, JavaScript, CSS, renderer, and AudioWorklet resources over public HTTPS. Each deployment contains a public `version.json` identifying its source commit. Relay code, tests, recording data, and credentials are excluded from the static artifact.

## Checks

`npm test` includes original engine/protocol tests and additional Pages packaging, subpath, and relay-discovery tests. `npm run build:pages` does not require a frontend package installation. Existing browser and relay tests remain in `tests/`; their documented earlier results are not a claim that every physical device or browser has been retested during deployment.

# SignalForge Studio

A working browser live-production studio with an OBS-inspired workflow and an original interface. Plain HTML, CSS, ES modules, native WebGPU/WGSL, Web Audio/AudioWorklet, MediaStream capture, browser recording, and an authenticated local WebSocket-to-FFmpeg relay.

**This is executable software, not an interface mockup.** Both compositors, source editing, capture, audio, recording, persistence, and relay transport are implemented. This is not the OBS codebase, an OBS plugin host, or a claim of complete native OBS feature parity.

## GitHub Pages

**Open the studio:** https://wieslawsoltes.github.io/SignalForgeStudio/

The hosted edition contains the real browser application, not a landing page. Camera/microphone capture, scene editing, preview/program composition, and browser recording/export run locally in your browser, subject to browser support and permissions. GitHub Pages does not run the Node/FFmpeg relay, so the hosted studio explains how to configure a relay when streaming is requested.

For RTMP/RTMPS publishing, clone this repository and use `npm ci && npm start`. Alternatively, run the relay behind a trusted HTTPS/WSS reverse proxy, set `SF_ALLOWED_ORIGINS=https://wieslawsoltes.github.io`, and enter its `wss://.../live` URL plus terminal token in Settings. Origins contain the scheme and hostname, **not** the `/SignalForgeStudio/` path. Keep the relay token and stream key private; neither belongs in Git, the Pages artifact, or exported projects.

Pushes to `main` run the tests and publish only `app/` through `.github/workflows/pages.yml`. The Pages build uses relative module, stylesheet, and AudioWorklet paths and includes `.nojekyll`. To reproduce the static build locally:

```sh
npm run build:pages
python3 -m http.server 8080 --directory dist
```

See [GitHub Pages deployment](docs/GITHUB_PAGES.md) for deployment details and limitations.

## Run

Install Node.js 22 or newer, then:

```sh
npm install
npm start
```

Open **http://127.0.0.1:8787/**. There is no front-end build step, CDN dependency, API key, or account. The only Node dependency is `ws`, pinned in `package.json`. FFmpeg is optional unless publishing RTMP/RTMPS.

Camera, microphone, display capture, WebGPU, and recording are feature-detected. Use a browser exposing the required APIs, on localhost or HTTPS. Do not launch `index.html` with `file://`: ES module loading and device/storage behavior are not portable that way.

To run only the browser app, without the relay:

```sh
python3 -m http.server 8080 --directory app
```

Open http://localhost:8080/. Capture, editing, and browser recording work independently of Node. Streaming requires the included relay; a separately hosted app also needs its relay URL, token, and an explicitly allowlisted origin.

## First production

1. The opening production has five editable scenes, a procedural animated background, text, a lower third, and a broadcast badge. These are real source layers, not a flattened preview image. The example host name is fictional sample text.
2. Add **Camera**, **Share screen**, or **Microphone** from the toolbar. Accept the browser's permission prompt. Other sources are available from **Sources → +**. Local image, video, and audio files can also be dropped onto Preview.
3. Select a source. Drag its body, drag a corner to resize, or use the rotation handle. **Properties**, **Transform**, **Filters**, and **Audio** provide numeric controls, cropping, chroma key, color adjustments, blur, gain, pan, delay, high-pass, and gate controls.
4. In Studio mode, edits affect **Preview**, not the already-taken **Program** snapshot. Press **Space** for the selected transition, or **Cut**. The previous program scene becomes Preview when switching scenes. Audio faders/mutes are intentionally live controls.
5. Start recording, pause/resume as needed, then stop and export from **Recordings**. The recording contains Program video and the mixed audio bus. Nothing records the editor chrome.
6. Export a portable `.signalforge.json` project. Imported local assets are embedded in the JSON; camera/microphone permissions and relay credentials are not.

Monitoring is **off by default**. Enable it only with headphones or an appropriately isolated monitoring setup to avoid acoustic feedback. A generated test tone is available and starts muted.

## Implemented capabilities

| Area | Implementation |
| --- | --- |
| Production UI | Independent Preview/Program views; scene/source docks; mixer; transitions; controls; inspector; resizable dock area; responsive narrow layout |
| Capture | Camera, microphone, and user-selected display/window/tab capture; device selection; reconnect/disconnect; track-ended handling |
| Sources | Local images, video, audio, text, color, procedural motion background, lower thirds, badges, countdown, test tone; shared sources between scenes |
| Editing | Drag, resize, rotation, fit, snapping, crop, opacity, visibility, lock, reordering, duplicate, undo/redo |
| GPU compositor | Persistent textures, per-bus uniforms/bind groups, changed-frame uploads, conservative culling, source effects, premultiplied composition, two scene targets plus preview target |
| Effects | Brightness, contrast, saturation, blur, chroma threshold, softness, spill suppression |
| Transitions | Cut, fade, wipe, dip-to-black; separate taken scene snapshots and audio crossfades |
| Audio | One audio context; gain/mute/pan, manual delay, high-pass, AudioWorklet gate, compressor/limiter, RMS/peak meters, optional monitoring, stable silent output track |
| Recording | Native MediaRecorder codec probing, encoded audio/video, pause/resume, sequential IndexedDB chunk writes, export, optional direct-to-file recording |
| Streaming | Versioned binary WebSocket protocol, authentication, sequence/timecode checks, acknowledgements, bounded queues, heartbeats, archive sink or FFmpeg RTMP/RTMPS publishing |
| Persistence | Local autosave, portable project/asset export and import, source identity validation, recording library |

## Publish RTMP / RTMPS

The browser does **not** claim to speak RTMP directly. The transport is:

```text
Camera / screen / media -> WebGPU Program canvas -> canvas capture video track
Microphones / media ----> Web Audio master bus ----> mixed audio track
                                 |
                         Native MediaRecorder
                                 |
                   SFG1 packets over WebSocket
                                 |
                     Node authenticated relay
                                 |
                  FFmpeg: H.264 + AAC into FLV
                                 |
                        RTMP / RTMPS ingest
```

Install an FFmpeg build providing `libx264`, AAC encoding, and the required RTMP/TLS protocols. Stop the server and start it with your **complete server/app/stream-key destination**:

```sh
# macOS / Linux; use your actual ingest URL, not this example.
SF_RTMP_URL='rtmps://your-ingest.example/app/YOUR_STREAM_KEY' npm start
```

```powershell
# Windows PowerShell
$env:SF_RTMP_URL = 'rtmps://your-ingest.example/app/YOUR_STREAM_KEY'
npm start
```

Reload the studio and press **Start streaming**. The destination is configured only on the server and is not embedded in project files. Stream keys may appear in your shell history/process environment; protect them accordingly.

**With no `SF_RTMP_URL`, the relay is intentionally in local archive mode.** Start streaming then writes a container into the server's `recordings/` directory. The UI explicitly changes to **RELAY ARCHIVE**. This exercises the transport but does not publish to a service.

### Relay configuration

| Variable | Default / behavior |
| --- | --- |
| `PORT` | `8787` |
| `SF_HOST` | `127.0.0.1`; loopback only |
| `SF_RELAY_TOKEN` | Cryptographically random token generated on each server start |
| `SF_ALLOWED_ORIGINS` | Additional comma-separated complete trusted origins; localhost origins are already accepted |
| `SF_MAX_SESSIONS` | `1` active authenticated publisher |
| `SF_RTMP_URL` | Empty: local archive mode; otherwise a complete `rtmp:` or `rtmps:` destination |
| `SF_FFMPEG` | `ffmpeg`; set to an executable path when not on PATH |

The same-origin localhost app retrieves the token from `/api/config`; it never puts the token in a URL or portable project. For a separately hosted trusted frontend, set its exact origin in `SF_ALLOWED_ORIGINS`, then enter the relay URL and terminal token under Settings. The custom token is stored only in that tab's session storage.

Do not expose this development relay directly to the public Internet. A remote deployment needs a trusted HTTPS/WSS reverse proxy, access control, operational rate limits, secure credential provisioning, and firewall configuration. An HTTPS frontend cannot rely on an insecure public `ws:` connection. Allowed origins are a trust boundary, not an invitation to use `*`.

## Recording formats and storage

Automatic format selection probes the browser at runtime. It prefers VP8/Opus WebM, tries VP9/Opus, then available MP4 options. MP4 and VP9 can also be explicitly selected. Availability is a capability result, not a promise that every browser/OS combination exposes every codec or hardware encoder.

Encoded recording chunks are persisted sequentially in IndexedDB. This avoids retaining a growing array of every recording chunk in the application while capturing. Export reads those chunks into a Blob, so **large exports still require memory**. The Settings option for direct-to-file recording uses the browser's file picker/writable-file API when available. Direct recordings are already in the selected file rather than duplicated in the recording library.

A slow/full storage device or a congested relay reports a failure and stops the affected output instead of silently dropping encoded container fragments. Already-written partial recordings may be recoverable, but a terminated MP4 or a file missing its initial header is not guaranteed playable. Stop outputs normally before closing the tab.

Browser storage can be evicted, cleared, or quota-limited. Export projects and recordings you need to keep. Imported assets are retained to support undo; unused asset garbage collection is not implemented. Each imported asset is limited to 256 MB, and portable project files to 512 MB.

## Timing and synchronization

Scene animation and transitions use a monotonic clock mapped to Web Audio output timestamps when audio is active. Frame scheduling uses deadline-based cadence and counts missed deadlines rather than treating the number of encoded chunks as elapsed time. Video source updates observe `requestVideoFrameCallback` timestamps where available.

The final output combines a canvas capture track and a `MediaStreamAudioDestinationNode` audio track. **MediaRecorder owns their encoding, timestamps, and muxing.** SFG1 timecodes validate transport ordering; they do not rewrite container PTS/DTS. This implementation does not claim to eliminate arbitrary camera/driver latency or provide sample-exact synchronization between unrelated physical devices. Per-source audio delay is available for manual alignment.

Keep the production tab visible. The app requests a screen wake lock while output is active where supported, but browsers can still throttle, suspend, or terminate tabs. No hard real-time or background-recording guarantee is made.

## Keyboard / pointer controls

| Control | Action |
| --- | --- |
| `Space` | Take Preview with the selected transition |
| `Ctrl+Shift+R` | Start / stop recording |
| `Ctrl+Shift+S` | Start / stop relay output |
| `F` | Fit selected source |
| `Ctrl+D` | Duplicate source |
| `Ctrl+Z`, `Ctrl+Shift+Z` | Undo / redo |
| `Delete` / `Backspace` | Remove selected source |
| `1`–`9` | Select Preview scene |
| Arrow keys; `Shift` | Nudge source by 1 or 10 design units |
| Drag body / corner / rotation handle | Move / resize / rotate |
| `Shift` while resizing / rotating | Preserve aspect / snap rotation |
| `Alt` while dragging | Suppress snapping |

Four production hotkeys are configurable in Settings. Hotkeys are browser-focused, not system-global. On macOS the explicit Ctrl-based configurable production shortcuts still use Ctrl; edit shortcuts also accept Command. Shortcuts are suppressed while editing text or using dialogs.

## Source map

```text
app/index.html                 HTML workspace and dialogs
app/style.css                  Application styling and responsive layout
app/icons.js                   Original inline SVG icon definitions
app/app.js                     UI/controller, inspector, interactions, commands
app/core/store.js              Validated scene graph, snapshots, undo/redo
app/core/storage.js            IndexedDB assets/chunks, portable projects
app/core/media.js              Source lifecycle, capture, decoding, raster sources
app/core/audio.js              Audio graph and metering
app/core/audio-worklet.js      Sample-processing gate
app/core/clock.js              Monotonic audio-mapped clock and frame scheduling
app/core/renderer-gpu.js       Native WGSL/WebGPU compositor
app/core/renderer-canvas.js    Working Canvas fallback
app/core/engine.js             Production buses, transitions, output track ownership
app/core/output.js             Recording sinks, codec selection, relay client
relay/protocol.mjs             Authentication, binary framing, FFmpeg argument policy
relay/server.mjs               Static app server, WebSocket relay, archive/RTMP sinks
tests/core.test.mjs            Dependency-free unit tests
tests/browser_e2e.py           Real-browser pixel/capture/recording/persistence checks
tests/relay_e2e.mjs             Local RTMP round-trip verification
```

Detailed notes are in `docs/ARCHITECTURE.md`, `docs/PROTOCOL.md`, and `docs/VERIFICATION.md`.

## Test

```sh
npm test
```

The core tests use Node's built-in test runner. For the optional browser suite, start `npm start` in another terminal:

```sh
python -m pip install playwright pillow
python -m playwright install chromium
python tests/browser_e2e.py
# Explicit fallback path
TEST_ENGINE=canvas python tests/browser_e2e.py
```

Set `CHROMIUM` to an installed executable as needed. The script uses synthetic camera/microphone devices and writes artifacts under `tests/artifacts/`. Its Linux software-GPU flags are intended for CI testing, not normal users. In headless Linux environments, a real/virtual display may be required for WebGPU canvas presentation; use `xvfb-run -a python tests/browser_e2e.py` when appropriate. See the verification report for the exact tested setup.

After the browser suite creates the WebM fixture, test the full RTMP path locally:

```sh
node tests/relay_e2e.mjs
```

This starts a temporary relay on port 8789 and an FFmpeg RTMP listener on port 19359. It does not publish anything externally.

## Boundaries

This build has no OBS plugin compatibility, browser-source iframe embedding, native game capture, virtual-camera driver, NDI, SRT, replay buffer, multitrack recording, or system-global hotkeys. Output is SDR/sRGB-oriented, not an HDR/color-managed broadcast pipeline. The blur is a small GPU kernel, not a full-resolution large-radius Gaussian implementation. Canvas fallback chroma processing uses a reduced working width and is slower than a suitable hardware GPU.

Screen capture choices, system audio, device availability, file access, codecs, and background behavior remain browser/OS dependent. The included verification used synthetic devices and SwiftShader, not physical cameras, Safari/iOS, real hardware-GPU benchmarks, or a third-party broadcast service. **The implementation is tested for its documented paths, not certified as a production-broadcast appliance.**

Original application code is MIT licensed. No OBS source code, branding assets, third-party fonts, or proprietary broadcast assets are included.

# Verification report

Verification date: 2026-09-06. This report separates implemented functionality, executed tests, and remaining validation work. Results are included under `docs/test-results/`.

## Environment

- Linux container; Node.js v22.16.0.
- System Chromium 144.0.7559.96, driven through Python Playwright.
- WebGPU exercised through SwiftShader Vulkan on an Xvfb display. This is software execution of the real WebGPU pipelines, not a hardware-performance benchmark.
- FFmpeg / ffprobe 7.1.5, with libx264 and AAC support.
- Synthetic browser camera/microphone devices. No physical devices or external streaming accounts were accessed.

A container browser policy initially prevented localhost capture, and an initial headless configuration rendered offscreen GPU pixels but failed to present WebGPU canvas pixels. Testing used an explicit localhost-only permission exception and the following software-GPU test configuration:

```text
DISPLAY=<Xvfb display>
--enable-unsafe-webgpu
--use-angle=swiftshader
--enable-unsafe-swiftshader
--enable-gpu
--ignore-gpu-blocklist
--use-vulkan=swiftshader
--enable-features=Vulkan
```

These flags are **not** needed in the application source and are **not** instructions to weaken normal browser security. They are isolated automated-test environment settings. The final passing tests inspect presented canvas pixels, not just adapter availability or successful shader compilation.

## Executed results

| Suite | Result |
| --- | --- |
| Node core/unit tests | 20 / 20 passed |
| WebGPU browser end-to-end suite | 21 / 21 passed |
| Canvas 2D fallback browser end-to-end suite | 21 / 21 passed |
| Local WebSocket → FFmpeg → RTMP loopback | Passed; receiver contains H.264 and AAC |
| Full decoder pass over generated recordings | Five files decoded successfully, video and audio frames present |
| Syntax validation | Every application, relay, and Node test JavaScript module passed `node --check` |

### Unit coverage

The tests check project/reference integrity, snapshot isolation, undo/redo and coalescing, cancellation, invalid identities/source types/output dimensions, crop bounds, rejection of external URL source configuration, transformed/cropped hit testing, gain conversion, frame scheduling, monotonic clock behavior, codec probing, binary framing, malformed/regressing packets, authentication, hello validation, and FFmpeg argument construction.

### Browser coverage on both compositors

1. Application boot and compositor initialization.
2. Keyboard duplicate and undo.
3. Camera MediaStream capture using a synthetic browser device.
4. Microphone MediaStream capture and audio channel creation.
5. Unreferenced camera tracks reach `ended` after source removal/replacement.
6. Chroma key removes a green foreground, revealing actual blue output pixels.
7. Preview filter changes do not change taken Program pixels.
8. Cut publishes the edited snapshot.
9. Half-opacity source composition produces the expected mixed color.
10. Crop removes source pixels without stretching the remainder.
11. Actual pointer dragging and one-step undo.
12. Fade transition reaches the target scene.
13. Wipe transition reaches the target scene.
14. Dip-to-black transition reaches the target scene.
15. AudioWorklet initialization and actual test-tone RMS metering.
16. Recording, pause/resume, and IndexedDB finalization.
17. Export contains 854 × 480 VP8 video and Opus audio.
18. Authenticated sequenced WebSocket archive is readable by FFmpeg/ffprobe.
19. Portable asset embedding and image restoration after browser reload.
20. No uncaught JavaScript or WebGPU validation errors in the final runs.
21. A 390-pixel viewport does not overflow horizontally.

Pixel examples from WebGPU: keyed foreground `(0, 0, 255)`; 50% green over blue `(0, 128, 128)`. Canvas fallback produced `(0, 128, 127)` for the latter, consistent with rounding differences.

The generated tone measured approximately -27 dB RMS at the channel meter in both runs. Meters were not tested against physical analog calibration equipment.

### RTMP loopback

`tests/relay_e2e.mjs` takes the browser-produced WebM fixture, sends sequenced SFG1 WebSocket packets to a temporary local relay, and receives its FFmpeg-generated RTMP output with a second FFmpeg process. All five transmitted fixture packets were acknowledged. The resulting FLV contained H.264 video and AAC audio and passed a full decoder run.

This verifies the specified relay transport and transcoding path. It does not verify a third-party provider's stream key, account restrictions, ingest policy, public TLS chain, or network conditions. The local listener reports end-of-stream input/output warnings when the publisher closes; the file and decoded media were checked rather than interpreting those terminal warnings as a successful broadcast by themselves.

## Dependency installation caveat

The container could not reach the npm registry for a clean `npm install`. Local relay integration tests therefore used the compatible `ws` implementation already bundled with the installed Playwright runtime via a temporary test-only adapter. **That adapter and all `node_modules` are excluded from the source archive.**

The delivered manifest pins **ws 8.21.3**, selected against the project's current release/security notes. That exact npm package installation was not exercised here. Run `npm install`, `npm test`, and the relay test on the target machine. No fabricated lockfile or integrity hash is supplied. In particular, the older 8.18.x dependency line is not the delivered dependency pin.

Release reference: https://github.com/websockets/ws/releases
Security advisories: https://github.com/websockets/ws/security/advisories

## Not executed or not certified

Physical camera/microphone/display-driver combinations; interactive screen-picker choices and system-audio capture across operating systems; Safari/iOS and Firefox; direct-to-file permission prompts; MP4 and VP9 recordings; multi-hour sessions; disk-full and hostile-network stress tests; arbitrary imported codecs/assets; multiple concurrent encoders on real hardware; public RTMP/RTMPS services; hardware GPU latency/throughput; and sample-exact inter-device synchronization were not validated in this environment.

The application implements the corresponding documented browser workflows where listed in the README, but implementation must not be confused with broad platform certification. This build intentionally makes no measured “1080p60 on every machine” claim. The selected frame rate is a scheduling target, and the status bar displays measured submitted cadence.

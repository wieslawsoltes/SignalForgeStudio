# Platform and implementation references

The application uses browser-owned capture, audio scheduling, encoding, and muxing rather than pretending to implement a native broadcast driver stack.

- W3C WebGPU: https://www.w3.org/TR/webgpu/
- W3C Media Capture and Streams: https://www.w3.org/TR/mediacapture-streams/
- W3C Screen Capture: https://www.w3.org/TR/screen-capture/
- W3C Media Capture from DOM Elements: https://www.w3.org/TR/mediacapture-fromelement/
- W3C MediaStream Recording: https://www.w3.org/TR/mediastream-recording/
- W3C Web Audio: https://www.w3.org/TR/webaudio/
- FFmpeg CLI: https://ffmpeg.org/ffmpeg.html
- FFmpeg protocols, including RTMP/RTMPS: https://ffmpeg.org/ffmpeg-protocols.html
- ws release and security history: https://github.com/websockets/ws/releases
- Headless Chromium GPU test configuration: https://developer.chrome.com/blog/supercharge-web-ai-testing
- WebGPU canvas presentation testing discussion: https://github.com/visgl/luma.gl/issues/2874

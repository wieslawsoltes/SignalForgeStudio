# Architecture and invariants

## Document state versus device state

The persisted document holds stable source identities, scene items, source configuration, transforms, effects, audio settings, and production preferences. It never owns a MediaStream, GPU resource, AudioNode, object URL, or relay credential. The media registry and rendering/audio/output engines own these runtime objects.

A source can be reused in multiple scenes without starting another capture device. Scene items own their transforms/crop/effects; shared sources own content configuration and the live input. Scene item order is back-to-front. Coordinates use a fixed 1920 × 1080 design space regardless of the configured output resolution.

Project validation enforces identity/reference integrity, scene/source/item limits, output presets, numeric bounds, and safe project text handling. Imported local file data is persisted separately in IndexedDB. Remote media URLs are not accepted as source inputs.

## Preview and taken Program

The editable document is the Preview bus. Taking a scene copies the scene and the referenced source configuration into an independent Program snapshot. During transitions, both old and new snapshots remain available. Editing text, transforms, or filters in Preview therefore cannot mutate a taken Program snapshot.

Live source playback, capture streams, media seek/relink/reconnect operations, countdown restart, and audio faders are runtime controls, not independently duplicated hardware per bus. A shared camera or media element remains one live input. Program isolation applies to the taken document/configuration, not to freezing live video or cloning the decoder timeline.

Sources referenced only by an active/taken Program snapshot remain alive until that snapshot is no longer needed. Other unreferenced sources release their media tracks, decoder elements, object URLs, and audio nodes. The camera permission is never persisted or automatically re-requested by project loading.

Undo/redo captures document transactions, not live hardware history. Pointer drags coalesce into one transaction. History is bounded to 60 document snapshots. Assets are not copied into every snapshot.

## Rendering

The WebGPU renderer owns one device and two canvas contexts. WGSL programs compile during initialization. Failure to initialize WebGPU creates fresh canvas elements for a real Canvas 2D fallback; canvas context types cannot be switched in place.

For each scheduled frame:

1. Evaluate the audio-mapped monotonic clock and transition state.
2. Resolve source visuals and upload only changed source serials into cached GPU textures.
3. Compose Preview, old Program, and (when needed) next Program into separate RGBA8 render targets.
4. Resolve the transition into the Program canvas and blit Preview to its canvas.
5. Submit the command buffer, then request an output capture frame when supported.

Each item/bus pair owns its own uniform buffer, preventing late queue writes for Program from overwriting Preview's pending uniforms. Raster texture keys include source configuration and dimensions, preventing text/config variants from aliasing one texture during a submission. Source resources are swept after a bounded unused interval; source textures are not reallocated every video frame.

Source geometry applies crop by restricting both UVs and the quad's covered area. Cropping removes content rather than stretching the surviving image across the original rectangle. Color/key processing produces premultiplied output; scene blending uses `ONE, ONE_MINUS_SRC_ALPHA`. The scene targets are opaque black-backed. Source tests validate the resulting actual presentation pixels.

Images/text/procedural generators enter as raster textures. Their generation is not a claim of GPU compute-only procedural content. Video import uses native `copyExternalImageToTexture`; transfer cost and browser implementation are platform dependent. No CPU readback occurs in the normal WebGPU compositing path. Debug/test texture usage permits readback, but production rendering does not call it.

Canvas fallback independently implements transforms, crop, opacity, filters, transitions, and CPU chroma key. Its chroma working image is limited to 960 pixels wide. The two backends are tested for key behavior, not guaranteed bit-identical for every filter or sampling case.

## Audio and time

The audio context is created/resumed from a user interaction. Native AudioNodes perform mixing on the audio engine's timeline. The custom gate runs in an AudioWorklet rather than JavaScript UI callbacks; it uses pre-existing output buffers without allocating arrays per processing quantum.

A strip is:

```text
MediaStream / HTMLMediaElement / oscillator
  -> high-pass -> worklet gate -> DelayNode -> StereoPannerNode
  -> GainNode -> AnalyserNode -> master gain
  -> DynamicsCompressorNode -> master analyser
  -> MediaStreamAudioDestinationNode
                             +-> optional monitor gain -> speakers
```

A zero-valued constant source keeps the output audio track stable when no input is active. The monitor branch defaults to zero gain. Native parameter ramps smooth gain changes. Actual RMS/peak samples drive the meters; no animated placeholder levels are used.

Program scene membership determines audible strips, with an explicit global-input option. Transition audio weights use equal-power curves, while shared inputs are clamped to avoid doubling. Audio faders are live document controls. Mutes, delay, pan, gate, and high-pass are not duplicated between Preview and Program.

`AVClock` maps `AudioContext.getOutputTimestamp()` onto the performance clock when possible and enforces monotonicity across startup/suspension. `FrameScheduler` advances fixed frame deadlines and records missed deadlines. The renderer does not synthesize timestamps by multiplying a chunk index by its timeslice.

The output uses native canvas and audio destination tracks. MediaRecorder supplies encoded track timestamps and the container. Device clocks/latencies are not calibrated against one another; manual audio delay is the provided correction mechanism.

## Output ownership

The engine owns the base Program canvas capture track. Each independent recorder gets cloned output tracks plus a clone of the master audio track. Stopping recording does not stop streaming or camera capture. The base output track is released only when all outputs are idle.

Recording and relay output use independent MediaRecorder instances. This makes their lifecycles independent and permits recording pause while streaming continues, at the cost of potentially running two encoders. Encoder availability/performance must be assessed on the target machine.

Recording chunks are written through a serialized promise chain. A pending-byte ceiling detects slow storage. Finalization waits for the final data event and the storage chain before publishing completion metadata. Direct file recording uses the file system writable API where available. Export can require a large Blob allocation; IndexedDB is not a substitute for unlimited disk/RAM.

Streaming preserves the order of encoded chunks, bounds WebSocket buffering, and sends a final chunk count. No arbitrary container fragment is discarded to simulate low latency. A broken connection starts a new session with a new encoder/header rather than attempting to append a headerless continuation to the previous container.

## Failure and trust boundaries

Capture failures remain visible, and a disconnected source renders a labeled placeholder. A WebGPU device/validation error is surfaced and stops active outputs; users can reopen with `?canvas` when GPU/device support fails. There is no automatic promise of seamless GPU-loss recovery during a broadcast.

The relay trusts only explicitly allowed origins and hostnames, validates its protocol, compares tokens in constant time after length validation, limits payloads/pending data, and invokes FFmpeg without a shell. The RTMP destination is server configuration, never an arbitrary URL submitted by a project or unauthenticated client.

This is a local development/desktop companion server, not a public multi-tenant ingest service. Native FFmpeg remains a media parser processing authenticated input. Keep it patched and sandbox it appropriately before accepting untrusted remote publishers. Default loopback binding is deliberate.

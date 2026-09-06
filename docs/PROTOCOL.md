# SFG1 relay protocol, version 1

Endpoint: `/live`. WebSocket subprotocol: `signalforge.v1`.

All control messages are JSON text. Media messages are binary. WebSocket compression is disabled. The receiver accepts one ordered byte stream per connection; reconnection means a new session/container.

## Handshake

Within five seconds of connection, the client sends:

```json
{"type":"hello","version":1,"token":"SESSION_TOKEN","mime":"video/webm;codecs=vp8,opus","fps":30,"bitrate":8000000}
```

Supported container MIME families are `video/webm` and `video/mp4`, optionally with codec parameters. Valid frame rates are 24, 25, 30, 50, and 60; the video bitrate range is 500,000–30,000,000 bit/s. These are relay sanity checks, not guarantees that an arbitrary declared codec matches the bytes sent.

The server checks the origin, host, subprotocol, token, and session limit before creating the sink. It replies:

```json
{"type":"ready","version":1,"mode":"archive","filename":"SignalForge-...webm","maxBufferedBytes":8388608}
```

For publishing, `mode` is `rtmp`, with no archive filename. This distinction must be shown to the operator.

## Binary media packet

All numeric header fields are big-endian. Header length: 16 bytes.

| Offset | Length | Representation | Meaning |
| --- | --- | --- | --- |
| 0 | 4 | unsigned 32-bit | Magic `0x53464731`, ASCII `SFG1` |
| 4 | 4 | unsigned 32-bit | Sequence, starting at zero |
| 8 | 8 | IEEE-754 float64 | Nonnegative, nondecreasing timecode in milliseconds |
| 16 | remainder | bytes | Complete MediaRecorder Blob payload for this packet |

The client normally emits one packet per nonempty 500 ms MediaRecorder event. Timeslices are not exact clock intervals. Timecode comes from `BlobEvent.timecode`, with a monotonic performance-clock fallback. The timecode is transport metadata; container timestamps inside the payload remain authoritative for decoding/muxing.

Payloads are fragments of **one continuous browser-produced container**, not necessarily independently playable media files. The server strips the SFG1 header and appends payload bytes in sequence to the archive or FFmpeg stdin. It does not parse/rewrite the compressed frames.

A missing/repeated sequence, regressing/nonfinite timecode, bad magic, truncated packet, or media arriving after `end` terminates the session with an error. Maximum WebSocket message size is 16 MiB. Control messages are additionally capped at 16 KiB.

## Acknowledgement and heartbeat

After the sink's write callback succeeds:

```json
{"type":"ack","sequence":7,"bytes":1048576,"pendingBytes":0,"timecode":3500}
```

`bytes` is the session byte counter, not a durable-storage fsync guarantee. A write callback means the Node sink accepted the write; it is not a statement that a remote streaming platform has displayed the frame. Acknowledgements provide progress visibility. Browser buffering is bounded to 8 MiB; relay pending sink data to 16 MiB. Exceeding a limit stops the session rather than selectively dropping container fragments.

The browser sends `{"type":"ping"}` every three seconds. The server replies `{"type":"pong"}`. Authenticated sessions idle for more than 15 seconds time out. Authentication timeout is five seconds.

## Shutdown

The client stops its MediaRecorder, waits for its final data event and send chain, then sends:

```json
{"type":"end","chunks":8}
```

The receiver requires the exact final chunk count, ends the file or FFmpeg stdin, and reports completion after the sink finishes / FFmpeg exits successfully:

```json
{"type":"stopped","bytes":1048576,"chunks":8,"filename":null,"mode":"rtmp"}
```

Errors use `{"type":"error","message":"..."}` and close the session. The browser waits a bounded interval for finalization so a hung relay does not leave the UI indefinitely stuck. Abrupt termination can leave an incomplete container; graceful shutdown is the normal path.

## FFmpeg contract

The server accepts only server-configured `rtmp:`/`rtmps:` destinations. It uses `spawn(..., {shell:false})`, maps video and optional audio, transcodes video to H.264/libx264 with YUV420P, a two-second GOP, veryfast/zerolatency settings, and audio to 48 kHz AAC at 160 kbit/s. It sends FLV to the destination. The browser's requested bitrate and supported frame-rate value inform the video encoder arguments.

Relay archive mode requires no FFmpeg. RTMP mode requires a suitable FFmpeg build. Browser input format, FFmpeg input probing, encoder delay, and destination buffering determine end-to-end latency; this transport is not WebRTC and does not promise subsecond interactive latency.

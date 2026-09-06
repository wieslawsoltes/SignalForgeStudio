# Third-party components

The browser application uses platform APIs and original application assets; it does not load a third-party framework, font, or CDN script.

The local server depends on `ws` 8.21.3 (MIT), installed separately through npm. Consult the dependency's distributed license and notices. The original application license does not replace dependency licenses.

FFmpeg is an optional external executable, not bundled. Its licensing depends on the selected build and components, including libx264. Users distributing an FFmpeg binary must comply with that build's applicable licenses.

Playwright and Pillow are optional test tools installed separately. No Chromium, FFmpeg, Playwright, Pillow, font files, or downloaded third-party binaries are included in the source archive.

SignalForge Studio is an original implementation inspired by a familiar broadcast-editor workflow. It is not affiliated with or endorsed by OBS Studio.

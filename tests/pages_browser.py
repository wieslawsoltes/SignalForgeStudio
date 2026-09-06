"""Smoke-test the static Pages build at a repository subpath, without a relay.
Run npm run build:pages, install playwright and Chromium, then run this file.
"""
import asyncio
import functools
import http.server
import json
import pathlib
import shutil
import tempfile
import threading
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
ART = ROOT / 'tests' / 'artifacts' / 'pages'


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


async def verify(base_url):
    ART.mkdir(parents=True, exist_ok=True)
    results = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True, args=[
            '--no-sandbox', '--enable-unsafe-webgpu', '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader', '--enable-gpu', '--ignore-gpu-blocklist',
            '--use-vulkan=swiftshader', '--enable-features=Vulkan',
            '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required',
        ])
        try:
            for suffix, expected in [('', 'WebGPU'), ('?canvas', 'Canvas 2D fallback')]:
                context = await browser.new_context(viewport={'width': 1440, 'height': 1000})
                try:
                    page = await context.new_page()
                    errors, failures = [], []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.on('response', lambda response: failures.append(response.url)
                            if response.status >= 400 and 'favicon' not in response.url else None)
                    response = await page.goto(base_url + suffix)
                    assert response.status == 200
                    await page.wait_for_function('window.signalforge?.ready', timeout=60000)
                    kind = await page.evaluate('signalforge.engine.renderer.kind')
                    assert kind == expected, (kind, expected)
                    await page.evaluate("""async () => {
                        window.engineErrors = [];
                        signalforge.engine.addEventListener('error', e => engineErrors.push(e.detail));
                        Object.assign(signalforge.store.project.settings, {width: 854, height: 480, fps: 24});
                        signalforge.engine.reload();
                        await signalforge.audio.ensure();
                    }""")
                    assert await page.evaluate('signalforge.audio.worklet'), 'AudioWorklet did not load'
                    assert await page.evaluate("document.querySelector('meta[name=signalforge-hosting]').content") == 'static'
                    message = await page.evaluate("async () => {try {await signalforge.output.relayConfig(); return '';} catch(e) {return e.message;}}")
                    assert 'Live streaming requires the included relay' in message
                    count = await page.evaluate('signalforge.store.scene().items.length')
                    await page.keyboard.press('Control+d')
                    assert await page.evaluate('signalforge.store.scene().items.length') == count + 1
                    await page.keyboard.press('Control+z')
                    assert await page.evaluate('signalforge.store.scene().items.length') == count
                    await page.evaluate('signalforge.output.startRecording()')
                    await page.wait_for_timeout(2200)
                    await page.evaluate('signalforge.output.stopRecording()')
                    recording = await page.evaluate("""async () => {
                        const entries = await signalforge.storage.recordings();
                        const record = entries.find(r => r.state === 'ready');
                        if (!record) return null;
                        const blob = await signalforge.storage.blob(record.id, record.mime);
                        return {bytes: blob.size, type: blob.type, duration: record.duration};
                    }""")
                    assert recording and recording['bytes'] > 1000, recording
                    assert not await page.evaluate('engineErrors'), await page.evaluate('engineErrors')
                    assert not errors, errors
                    assert not failures, failures
                    await page.screenshot(path=str(ART / ('canvas.png' if suffix else 'webgpu.png')))
                    result = {'renderer': kind, 'audioWorklet': True, 'undo': True,
                              'staticRelayGuard': True, 'recording': recording,
                              'pageErrors': errors, 'httpFailures': failures}
                    results.append(result)
                    print(json.dumps(result), flush=True)
                finally:
                    await context.close()
        finally:
            await browser.close()
    (ART / 'results.json').write_text(json.dumps(results, indent=2), encoding='utf-8')


def main():
    with tempfile.TemporaryDirectory(prefix='signalforge-pages-') as directory:
        shutil.copytree(ROOT / 'dist', pathlib.Path(directory) / 'SignalForgeStudio')
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=directory))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            asyncio.run(verify(f'http://127.0.0.1:{server.server_port}/SignalForgeStudio/'))
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == '__main__':
    main()

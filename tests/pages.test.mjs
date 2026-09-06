import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { buildPages } from '../scripts/build-pages.mjs';
import { OutputManager } from '../app/core/output.js';

test('Pages build contains the browser app, not the relay or project data', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'signalforge-pages-'));
  try {
    await buildPages(path.join(temp, 'site'));
    const files = await readdir(path.join(temp, 'site'));
    for (const name of ['index.html', 'app.js', 'core', 'style.css', '.nojekyll']) assert.ok(files.includes(name));
    for (const name of ['relay', 'recordings', '.env', 'node_modules', 'package.json', 'tests']) assert.ok(!files.includes(name));
    const html = await readFile(path.join(temp, 'site/index.html'), 'utf8');
    assert.match(html, /name="signalforge-hosting" content="static"/);
    assert.ok(!/(?:src|href)=["']\//.test(html), 'Assets must resolve within the repository subpath');
    await access(path.join(temp, 'site/core/audio-worklet.js'));
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('Pages build refuses to replace the source project', async () => {
  const root = new URL('../', import.meta.url);
  await assert.rejects(buildPages(root.pathname), /Refusing/);
});

test('Static hosting explains the relay requirement without requesting a nonexistent API', async t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected network access'); });
  const previousDocument = globalThis.document, previousSession = globalThis.sessionStorage;
  globalThis.document = { querySelector: () => ({ content: 'static' }) };
  globalThis.sessionStorage = { getItem: () => '' };
  try {
    const output = new OutputManager(null, null, { project: { settings: { relayURL: '' } } });
    await assert.rejects(output.relayConfig(), /Live streaming requires the included relay/);
    assert.equal(fetch.mock.callCount(), 0);
  } finally { globalThis.document = previousDocument; globalThis.sessionStorage = previousSession; }
});

test('A hosted studio accepts an explicitly configured authenticated WSS relay', async () => {
  const previous = globalThis.sessionStorage;
  globalThis.sessionStorage = { getItem: () => 'test-session-token' };
  try {
    const output = new OutputManager(null, null, { project: { settings: { relayURL: 'wss://relay.example/live' } } });
    assert.deepEqual(await output.relayConfig(), { url: 'wss://relay.example/live', token: 'test-session-token' });
  } finally { globalThis.sessionStorage = previous; }
});

test('Same-origin relay discovery respects a reverse-proxy application subpath', async t => {
  const saved = { document: globalThis.document, location: globalThis.location, sessionStorage: globalThis.sessionStorage };
  globalThis.document = { baseURI: 'https://studio.example/production/', querySelector: () => null };
  globalThis.location = { protocol: 'https:' };
  globalThis.sessionStorage = { getItem: () => '' };
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(url.href, 'https://studio.example/production/api/config');
    return { ok: true, json: async () => ({ token: 'local-token' }) };
  });
  try {
    const output = new OutputManager(null, null, { project: { settings: { relayURL: '' } } });
    assert.deepEqual(await output.relayConfig(), { url: 'wss://studio.example/production/live', token: 'local-token' });
  } finally { Object.assign(globalThis, saved); }
});

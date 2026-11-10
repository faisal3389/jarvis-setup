// Shared test harness for the Jarvis page (mission-control/index.html).
// - a tiny static server (mission-control/ and data/ only, random free port; no server.mjs)
// - Playwright Chromium (PLAYWRIGHT_CHROMIUM_PATH if set, else Playwright's default)
// - every /api/** route is mocked with page routes; speech output is stubbed (silent)
// - SpeechRecognition is replaced by a fake the test drives
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const OUT_DIR = path.join(ROOT, 'tests', 'output');
const FIXTURES_DIR = path.join(ROOT, 'mission-control', 'fixtures');

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ worker registry */
function evalJarvisFile(file) {
  const win = {};
  new Function('window', fs.readFileSync(file, 'utf8'))(win);
  return win.JARVIS || {};
}
// The workers the page should see in normal mode: $P/workers.json (Builder R's registry) when it exists and
// parses, else mission-control/fixtures/workers.js.
export function registryWorkers() {
  const reg = path.join(ROOT, 'workers.json');
  if (fs.existsSync(reg)) {
    try {
      const j = JSON.parse(fs.readFileSync(reg, 'utf8'));
      if (Array.isArray(j.workers) && j.workers.length) return j.workers;
    } catch (e) { console.warn('harness: workers.json is not valid JSON, using fixtures/workers.js:', e.message); }
  }
  return fixtureWorkers();
}
export function fixtureWorkers() { return JSON.parse(JSON.stringify(evalJarvisFile(path.join(FIXTURES_DIR, 'workers.js')).workers)); }
// Same shape as server.mjs's virtual GET /data/workers.js.
export function workersJs(list) {
  return 'window.JARVIS = window.JARVIS || {};\nwindow.JARVIS.workers = ' + JSON.stringify(list, null, 2) + ';\n';
}

/* ------------------------------------------------------------------ static server */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

export async function startStaticServer() {
  const server = http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
    if (p === '/') { res.writeHead(302, { Location: '/mission-control/index.html' }); return res.end(); }
    if (p === '/favicon.ico') { res.writeHead(204); return res.end(); }
    // virtual, like server.mjs: generated on every request from workers.json (or the fixture list)
    if (p === '/data/workers.js') {
      res.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-store' });
      return res.end(workersJs(registryWorkers()));
    }
    const m = /^\/(mission-control|data)(\/|$)/.exec(p);
    if (!m) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end('{"ok":false,"error":"not served by the test server"}'); }
    let abs = path.join(ROOT, path.normalize(p));
    if (!abs.startsWith(path.join(ROOT, m[1]))) { res.writeHead(403); return res.end(); }
    if (p.endsWith('/')) abs = path.join(abs, 'index.html');
    fs.readFile(abs, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(abs)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(buf);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r())) };
}

/* ------------------------------------------------------------------ audio files */
function wavBuffer(samples, rate) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(samples[i] * 32767))), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

// A loop of "phrases": a short pause, ~1.4 s of voiced, syllable-modulated sound, then ~1.6 s of quiet.
// Chrome loops the file, so the voice-activity detector hears one phrase every ~3.4 s.
export function writeSpeechLikeWav(file) {
  const rate = 48000, lead = 0.4, talk = 1.4, tail = 1.6, n = Math.round(rate * (lead + talk + tail));
  const s = new Float32Array(n);
  let phase = 0, seed = 7;
  const noise = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff * 2 - 1; };
  for (let i = 0; i < n; i++) {
    const t = i / rate - lead;
    if (t < 0 || t > talk) { s[i] = noise() * 0.0005; continue; }
    const f0 = 125 + 30 * Math.sin(2 * Math.PI * 1.3 * t) + 12 * Math.sin(2 * Math.PI * 5.1 * t); // intonation
    phase += 2 * Math.PI * f0 / rate;
    let v = 0;
    for (let k = 1; k <= 14; k++) {
      const f = f0 * k;
      const formant = Math.exp(-((f - 700) ** 2) / (2 * 260 ** 2)) + 0.7 * Math.exp(-((f - 1250) ** 2) / (2 * 320 ** 2)) + 0.25;
      v += Math.sin(phase * k) * formant / k;
    }
    const syll = 0.55 + 0.45 * Math.abs(Math.sin(Math.PI * 4.2 * t)); // ~4 syllables a second
    const edge = Math.min(1, t / 0.05, (talk - t) / 0.05);
    s[i] = (v * 0.32 + noise() * 0.03) * syll * edge;
  }
  fs.writeFileSync(file, wavBuffer(s, rate));
  return file;
}

export function silentWav(seconds = 0.25) {
  return wavBuffer(new Float32Array(Math.round(16000 * seconds)), 16000);
}

/* ------------------------------------------------------------------ browser */
export async function launch(extraArgs = []) {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
  return chromium.launch({ headless: true, executablePath, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', ...extraArgs] });
}

// Runs in the page before any page script: silent speech, a scriptable fake SpeechRecognition.
function pageStubs(srMode) {
  window.__spoken = [];
  const synth = {
    speaking: false, pending: false, paused: false, onvoiceschanged: null,
    getVoices() { return []; },
    speak(u) {
      window.__spoken.push(String(u.text));
      setTimeout(() => { try { if (u.onend) u.onend(new Event('end')); } catch (e) { /* ignore */ } }, 40);
    },
    cancel() {}, pause() {}, resume() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }
  };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: () => synth });

  window.__sr = { instances: 0, active: null };
  class FakeSpeechRecognition {
    constructor() { this.lang = ''; this.continuous = false; this.interimResults = false; this.maxAlternatives = 1; this.onresult = null; this.onerror = null; this.onend = null; this._on = false; window.__sr.instances++; }
    start() {
      this._on = true; window.__sr.active = this;
      // 'network' = this browser has no Google speech service (like Crest) → the page switches to ElevenLabs VAD.
      if (srMode === 'network') setTimeout(() => { if (this.onerror) this.onerror({ error: 'network' }); this._end(); }, 20);
    }
    stop() { this._end(); }
    abort() { this._end(); }
    _end() {
      if (!this._on) return;
      this._on = false;
      if (window.__sr.active === this) window.__sr.active = null;
      setTimeout(() => { if (this.onend) this.onend({}); }, 0);
    }
    addEventListener() {} removeEventListener() {}
  }
  // Test hook: deliver a recognition result to whichever recognizer is running.
  window.__srEmit = (text, isFinal = true) => {
    const r = window.__sr.active; if (!r || !r.onresult) return false;
    const res = [{ transcript: text, confidence: 0.92 }]; res.isFinal = isFinal;
    r.onresult({ resultIndex: 0, results: [res] });
    return true;
  };
  window.SpeechRecognition = FakeSpeechRecognition;
  window.webkitSpeechRecognition = FakeSpeechRecognition;
}

const DEFAULT_API = {
  '/api/voice': ({ voice }) => ({ provider: voice, voice: voice === 'elevenlabs' ? 'George' : null }),
  '/api/chat': () => ({ ok: true, say: 'Mock reply.', action: { type: 'none' }, requestId: null, ms: 5 }),
  '/api/ask': () => ({ ok: true, requestId: 9, say: "On it. That's request 9." }),
  '/api/board/approve': () => ({ ok: true, say: 'Approved.' }),
  '/api/board/reject': () => ({ ok: true, say: 'Rejected.' }),
  '/api/board/cancel': () => ({ ok: true, say: 'Cancelled.' }),
  '/api/board/clear': () => ({ ok: true, say: 'Board cleared.' }),
  '/api/board/spoken': () => ({ ok: true }),
  '/api/tts': () => ({ status: 200, contentType: 'audio/wav', body: silentWav() }),
  '/api/stt': () => ({ text: '' })
};

export function fixtureBoard() {
  const src = fs.readFileSync(path.join(FIXTURES_DIR, 'tasks.js'), 'utf8');
  const sandbox = { window: {} };
  new Function('window', src)(sandbox.window);
  return JSON.parse(JSON.stringify(sandbox.window.JARVIS.board));
}

/**
 * Opens the Jarvis page in a fresh context.
 * opts: fixtures (bool) · board (object served as data/tasks.js) · workers (array served as workers.js; null = 404)
 *       viewport · voice ('browser'|'elevenlabs')
 *       sr ('silent'|'network') · api ({'/api/x': handler}) · file (open via file://) · boot (default true)
 * A handler gets {body, call, n, voice} and returns a JSON object, {status, json}, {status, body, contentType} or {abort: true}.
 */
export async function openJarvis(browser, baseUrl, opts = {}) {
  const voice = opts.voice || 'browser';
  const context = await browser.newContext({ viewport: opts.viewport || { width: 1440, height: 900 } });
  if (baseUrl) await context.grantPermissions(['microphone'], { origin: baseUrl }).catch(() => {});
  await context.addInitScript(pageStubs, opts.sr || 'silent');

  const calls = [], errors = [], api = { ...DEFAULT_API, ...(opts.api || {}) };
  const maxInflight = {};
  await context.route(/\/api\//, async (route) => {
    const req = route.request(), u = new URL(req.url()), p = u.pathname;
    let body = null;
    const buf = req.postDataBuffer();
    if (buf) { try { body = JSON.parse(buf.toString('utf8')); } catch { body = { bytes: buf.length }; } }
    const call = { path: p, method: req.method(), body, query: Object.fromEntries(u.searchParams), at: Date.now(), respondAt: 0 };
    calls.push(call);
    const n = calls.filter((c) => c.path === p).length;
    maxInflight[p] = Math.max(maxInflight[p] || 0, calls.filter((c) => c.path === p && !c.respondAt).length);
    let r;
    try { r = await (api[p] || (() => ({ status: 404, json: { ok: false, error: 'no mock for ' + p } })))({ body, call, n, voice }); }
    catch (e) { r = { status: 500, json: { ok: false, error: String(e) } }; }
    call.respondAt = Date.now();
    if (r && r.abort) return route.abort('failed');
    if (r && (r.status || r.contentType) && (r.json !== undefined || r.body !== undefined)) {
      return route.fulfill({ status: r.status || 200, contentType: r.contentType || 'application/json', body: r.json !== undefined ? JSON.stringify(r.json) : r.body });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r == null ? {} : r) });
  });

  // opts.workers: an array → served as workers.js (data/ or fixtures/), null → 404 (the page's fallback list).
  // Without it, normal mode gets the registry list (workers.json, else the fixture list).
  const serveWorkers = (route) => {
    if (opts.workers === null) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: workersJs(opts.workers || registryWorkers()) });
  };
  if (opts.fixtures && opts.workers !== undefined) await context.route(/\/fixtures\/workers\.js(\?.*)?$/, serveWorkers);

  // Live data: serve the (stable) fixture files as ../data/*.js so tests don't depend on the demo's state.
  if (!opts.fixtures && !opts.realData) {
    await context.route(/\/data\/(\w+)\.js(\?.*)?$/, async (route) => {
      const name = /\/data\/(\w+)\.js/.exec(route.request().url())[1];
      if (name === 'workers') return serveWorkers(route);
      if (name === 'tasks' && opts.board !== undefined) {
        if (opts.board === null) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.JARVIS = window.JARVIS || {};\nwindow.JARVIS.board = ' + JSON.stringify(opts.board) + ';\n' });
      }
      const f = path.join(FIXTURES_DIR, name + '.js');
      if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(f) });
    });
  }

  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e && e.message)));

  const url = opts.file
    ? pathToFileURL(path.join(ROOT, 'mission-control', 'index.html')).href + (opts.fixtures ? '?fixtures=1' : '')
    : baseUrl + '/mission-control/index.html' + (opts.fixtures ? '?fixtures=1' : '');
  await page.goto(url);
  // first data load has rendered (scout tiles or an awaiting placeholder)
  await page.waitForFunction(() => document.querySelector('#linkState') && /SYNC \d/.test(document.querySelector('#linkState').textContent));

  const J = {
    page, context, calls, errors,
    callsTo: (p) => calls.filter((c) => c.path === p),
    maxInflight: (p) => maxInflight[p] || 0,
    spoken: () => page.evaluate(() => window.__spoken.slice()),
    text: (sel) => page.locator(sel).innerText(),
    async waitForCalls(p, n = 1, timeout = 10000) {
      const t0 = Date.now();
      while (J.callsTo(p).length < n) {
        if (Date.now() - t0 > timeout) throw new Error(`timed out waiting for ${n} call(s) to ${p}; got ${J.callsTo(p).length}`);
        await sleep(25);
      }
      return J.callsTo(p);
    },
    async waitForSpoken(re, timeout = 10000) {
      await page.waitForFunction((src) => window.__spoken.some((s) => new RegExp(src).test(s)), re.source, { timeout });
    },
    // Boot like the owner does, and wait for the flicker-in + greeting to finish.
    async boot() {
      await page.click('#boot');
      await page.waitForFunction(() => document.body.classList.contains('settled'), null, { timeout: 8000 });
    },
    async ask(text) {
      await page.fill('#q', text);
      await page.press('#q', 'Enter');
    },
    async screenshot(name) {
      const file = J.outPath(name);
      await page.screenshot({ path: file });
      return file;
    },
    outPath(name) { fs.mkdirSync(OUT_DIR, { recursive: true }); return path.join(OUT_DIR, name); },
    close: () => context.close()
  };
  if (opts.boot !== false) await J.boot();
  return J;
}

// A deferred promise: hold an API reply until the test releases it.
export function deferred() {
  let resolve; const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

export async function setup(launchArgs = []) {
  const server = await startStaticServer();
  const browser = await launch(launchArgs);
  return {
    server, browser, url: server.url,
    open: (opts) => openJarvis(browser, server.url, opts),
    async close() { await browser.close().catch(() => {}); await server.close(); }
  };
}

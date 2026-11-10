// Jarvis demo — local HUD server + ElevenLabs voice + Jarvis brain.
// Start with: npm start   (= `node server.mjs`, Node >= 20.12)
// If `.env.local` exists next to this file it is loaded (ELEVENLABS_API_KEY). Without it the page uses the
// browser voice and /api/stt answers 503. The key is never in code, never sent to the browser or to any
// Claude run, and .env.local is never served.
import { createServer } from "node:http";
import { execFile, spawn } from "node:child_process";
import { appendFileSync, createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, sep } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

// Everything is derived from this file's own folder — no machine-specific paths.
const ROOT = fileURLToPath(new URL(".", import.meta.url));

const ENV_FILE = join(ROOT, ".env.local");
if (existsSync(ENV_FILE)) {
  if (typeof process.loadEnvFile === "function") {
    try { process.loadEnvFile(ENV_FILE); } catch (err) { console.error(`[env] could not load .env.local (${err?.code || "error"})`); }
  } else {
    console.error("[env] this Node version cannot load .env.local (needs Node >= 20.12); voice falls back to the browser");
  }
}

const HOST = "127.0.0.1"; // local only
const PORT = Number(process.env.JARVIS_PORT || 4777);

// George — British, narrative. Flash v2.5 = lowest latency for an interactive assistant.
const VOICE_ID = process.env.JARVIS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
const MODEL_ID = process.env.JARVIS_TTS_MODEL || "eleven_flash_v2_5";
const MAX_CHARS = 1200; // cap each request so a bug cannot burn credits

const voiceEnabled = Boolean(process.env.ELEVENLABS_API_KEY);
const client = voiceEnabled ? new ElevenLabsClient() : null;

// Only these folders are served. Everything else (.env.local, agents, inbox, logs...) is not.
const PUBLIC_DIRS = ["mission-control", "data"];
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function send(res, code, body, type = "text/plain; charset=utf-8") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

function serveStatic(pathname, res) {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, "");
  const top = rel.split(/[/\\]/)[0];
  if (!PUBLIC_DIRS.includes(top) || rel.includes("..")) return send(res, 404, "Not found");
  if (rel === join("data", "workers.js")) return serveWorkersJs(res); // virtual, from workers.json
  const file = join(ROOT, rel);
  if (!file.startsWith(ROOT + top + sep)) return send(res, 404, "Not found");
  let st;
  try { st = statSync(file); } catch { return send(res, 404, "Not found"); }
  if (!st.isFile()) return send(res, 404, "Not found");
  res.writeHead(200, {
    "Content-Type": TYPES[extname(file)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  createReadStream(file).pipe(res);
}

async function tts(text, res) {
  if (!voiceEnabled) return send(res, 503, "ElevenLabs voice not configured");
  const clean = String(text || "").replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
  if (!clean) return send(res, 400, "No text");
  try {
    const audio = await client.textToSpeech.convert(VOICE_ID, {
      text: clean,
      modelId: MODEL_ID,
      outputFormat: "mp3_44100_128",
      voiceSettings: { stability: 0.5, similarityBoost: 0.75 },
    });
    res.writeHead(200, { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" });
    // convert() returns a web ReadableStream — bridge it to a Node stream and stream to the browser.
    Readable.fromWeb(audio).on("error", () => res.destroy()).pipe(res);
  } catch (err) {
    const status = err?.statusCode || 502;
    console.error(`[tts] ElevenLabs error ${status}: ${err?.message || err}`);
    if (!res.headersSent) send(res, status, "TTS failed");
  }
}

// Speech-to-text: the page records the mic (MediaRecorder) and POSTs the audio here.
// Used because Chromium browsers other than Google Chrome (e.g. Crest) have no built-in speech service.
const MAX_AUDIO_BYTES = 6 * 1024 * 1024;
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error("Audio too large"), { statusCode: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
// Worker names help speech-to-text ("Scout", "Operator", ...), taken from workers.json.
const workerTerms = () => (loadWorkers().workers || []).slice(0, 20)
  .map((w) => w.label.charAt(0) + w.label.slice(1).toLowerCase());
async function stt(req, res) {
  if (!voiceEnabled) return send(res, 503, "ElevenLabs not configured");
  try {
    const buf = await readBody(req, MAX_AUDIO_BYTES);
    if (buf.length < 1000) return send(res, 200, JSON.stringify({ text: "" }), TYPES[".json"]);
    const contentType = String(req.headers["content-type"] || "audio/webm").split(";")[0];
    const result = await client.speechToText.convert({
      file: { data: buf, filename: "speech.webm", contentType },
      modelId: "scribe_v2",
      languageCode: "en",
      tagAudioEvents: false,
      keyterms: ["Jarvis", "ROAS", "revenue", "Advisor", "morning brief", ...workerTerms()],
    });
    send(res, 200, JSON.stringify({ text: result?.text || "" }), TYPES[".json"]);
  } catch (err) {
    const status = err?.statusCode || 502;
    console.error(`[stt] ElevenLabs error ${status}: ${err?.message || err}`);
    if (!res.headersSent) send(res, status, "STT failed");
  }
}

// ---------------------------------------------------------------- v2: task board + Manager runs
// See docs/CONTRACT-v2.md. The board is written only by bin/board.py, always called with execFile and an
// argument array (user text is an argument, never part of a command string).
const BOARD_PY = join(ROOT, "bin", "board.py");
const BOARD_JSON = join(ROOT, "data", "tasks.json");
const MANAGER_MD = join(ROOT, "MANAGER.md");
const MANAGER_LOGS = join(ROOT, "logs", "manager");
const CLAUDE_BIN = process.env.JARVIS_CLAUDE_BIN || "claude";
const MANAGER_MODEL = process.env.JARVIS_MANAGER_MODEL || "sonnet";
// JARVIS_MAX_MANAGERS=0 pauses Manager runs: new requests stay queued on the board (dry runs / tests).
const MAX_MANAGERS = process.env.JARVIS_MAX_MANAGERS === "0" ? 0 : Math.max(1, Math.floor(Number(process.env.JARVIS_MAX_MANAGERS)) || 2);
const MANAGER_TIMEOUT_MS = Math.max(1000, Number(process.env.JARVIS_MANAGER_TIMEOUT_MS) || 15 * 60 * 1000);
const MAX_JSON_BYTES = 16 * 1024;
const MAX_TEXT = 1000;
const FROMS = ["voice", "text", "clock"];
const OPEN_REQUEST = ["queued", "planning", "working"];
const TERMINAL = ["done", "failed", "cancelled"];
const KIND_STATUS = { bad_input: 400, not_found: 404, conflict: 409 };

// Child processes (board.py, the Manager, the Jarvis brain) never see the ElevenLabs key.
function childEnv() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith("ELEVENLABS_")) delete env[k];
  return env;
}

function board(args) {
  return new Promise((resolve) => {
    execFile("python3", [BOARD_PY, ...args], { cwd: ROOT, env: childEnv(), timeout: 15000, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        let json = null;
        try { json = JSON.parse(stdout); } catch { /* not JSON */ }
        const code = err ? (typeof err.code === "number" ? err.code : -1) : 0;
        if (code !== 0 && code !== 2) console.error(`[board] ${args[0]} failed: ${String(stderr || err?.message || "").trim().slice(0, 300)}`);
        resolve({ ok: code === 0 && json !== null, code, json, error: json?.error, kind: json?.kind });
      });
  });
}

// ---------------------------------------------------------------- v4: worker registry (workers.json)
// See docs/CONTRACT-v4.md. workers.json is the ONE list of workers: the page (GET /data/workers.js),
// the Manager (WORKERS block + extra allow rules), the Jarvis brain (WORKERS line), bin/board.py and
// bin/reset.sh all read it. Read fresh on every use; the same checks as board.py's check_workers.
const WORKERS_FILE = join(ROOT, "workers.json");
const WORKER_ID_RE = /^[a-z][a-z0-9-]{1,23}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const OUTPUT_RE = /^(?:(?:outbox|queue)\/[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*|workspace(?:\/[a-z0-9][a-z0-9._-]*)*)$/;
const BASH_RULE_RE = /^Bash\([^()\r\n]{1,200}\)$/;

// -> {workers: [...]} or {error: "workers.json ..."}
function loadWorkers() {
  let obj;
  try { obj = JSON.parse(readFileSync(WORKERS_FILE, "utf8")); } catch (err) {
    if (err?.code === "ENOENT") return { error: "workers.json is missing" };
    if (err instanceof SyntaxError) return { error: `workers.json is not valid JSON (${cleanText(err.message)})` };
    return { error: `workers.json cannot be read (${err?.code || err?.message || err})` };
  }
  const bad = (msg) => ({ error: `workers.json is invalid: ${msg}` });
  if (!obj || typeof obj !== "object" || !Array.isArray(obj.workers)) return bad('it must be an object with a "workers" list');
  if (obj.version !== 1) return bad('"version" must be 1');
  if (!obj.workers.length) return bad('the "workers" list is empty');
  const workers = []; const seen = new Set();
  for (const [i, w] of obj.workers.entries()) {
    if (!w || typeof w !== "object" || Array.isArray(w)) return bad(`worker ${i + 1} is not an object`);
    const { id, label, color, summary, output } = w;
    if (typeof id !== "string" || !WORKER_ID_RE.test(id)) return bad(`worker ${i + 1}: "id" must be 2 to 24 lowercase letters, digits or dashes, starting with a letter`);
    if (seen.has(id)) return bad(`worker "${id}" is listed twice`);
    seen.add(id);
    if (typeof label !== "string" || !label.trim() || label.length > 12 || label !== label.toUpperCase()) return bad(`worker "${id}": "label" must be UPPERCASE text, at most 12 characters`);
    if (typeof color !== "string" || !COLOR_RE.test(color)) return bad(`worker "${id}": "color" must be a hex colour like "#4de3ff"`);
    if (typeof summary !== "string" || !summary.trim() || summary.length > 300) return bad(`worker "${id}": "summary" must be one sentence of at most 300 characters`);
    if (typeof output !== "string" || !OUTPUT_RE.test(output)) return bad(`worker "${id}": "output" must be a folder inside outbox/ or queue/, or workspace`);
    const extra = w.extraBash === undefined ? [] : w.extraBash;
    if (!Array.isArray(extra) || extra.some((r) => typeof r !== "string" || !BASH_RULE_RE.test(r) || !r.slice(5, -1).replace(/[\s*:]/g, ""))) {
      return bad(`worker "${id}": "extraBash" must be a list of rules like "Bash(npm test*)" (never "Bash(*)")`);
    }
    workers.push({ id, label, color, summary: cleanText(summary), output, extraBash: [...new Set(extra)] });
  }
  return { workers };
}

// Startup: say which workers are loaded, and warn about any without a matching subagent file.
function checkWorkers() {
  const { workers, error } = loadWorkers();
  if (error) return console.warn(`[workers] WARNING: ${error}. The page falls back to its built-in list and the Manager cannot add tasks until it is fixed.`);
  for (const w of workers) {
    const rel = `.claude/agents/${w.id}.md`;
    let text;
    try { text = readFileSync(join(ROOT, rel), "utf8"); } catch {
      console.warn(`[workers] WARNING: worker "${w.id}" has no ${rel}; the Manager cannot dispatch it.`);
      continue;
    }
    const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    const name = front && /^name:[ \t]*["']?([^"'\r\n]*?)["']?[ \t]*$/m.exec(front[1]);
    if (!name) console.warn(`[workers] WARNING: ${rel} has no "name:" in its frontmatter; it must be "name: ${w.id}".`);
    else if (name[1] !== w.id) console.warn(`[workers] WARNING: ${rel} says "name: ${name[1]}" but workers.json says "${w.id}"; they must match.`);
  }
  console.log(`[workers] ${workers.map((w) => w.id).join(", ")} (from workers.json)`);
}

// GET /data/workers.js — generated on every request (there is no such file on disk).
function serveWorkersJs(res) {
  const { workers, error } = loadWorkers();
  if (error) {
    console.warn(`[workers] /data/workers.js: ${error}`);
    return send(res, 500, `// ${cleanText(error)}\n`, TYPES[".js"]);
  }
  const body = JSON.stringify(workers, null, 2).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  send(res, 200, `window.JARVIS = window.JARVIS || {};\nwindow.JARVIS.workers = ${body};\n`, TYPES[".js"]);
}

const sendJson = (res, code, obj) => send(res, code, JSON.stringify(obj), TYPES[".json"]);
const sayErr = (res, code, say) => sendJson(res, code, { ok: false, say });
// Action results: {code, body}. The HTTP endpoints send them as-is; /api/chat runs the same functions.
const failed = (code, say) => ({ code, body: { ok: false, say } });
const succeeded = (body) => ({ code: 200, body: { ok: true, ...body } });

function boardFail(r) {
  if (r.code !== 2 || !r.error) return failed(500, "Sorry, I could not update the board.");
  // board.py's not_found / conflict errors are plain sentences ("Task 9 does not exist.").
  const plain = /^[A-Z][^_{}<>]*[.?!]$/.test(r.error) && !r.error.startsWith("argument");
  return failed(KIND_STATUS[r.kind] || 400, plain ? r.error : "I could not do that.");
}

function toId(v) {
  const n = typeof v === "string" && /^\s*#?\d{1,9}\s*$/.test(v) ? Number(v.replace(/[#\s]/g, "")) : v;
  return Number.isInteger(n) && n > 0 && n < 1e9 ? n : null;
}
const cleanText = (v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

// Only this page (or curl / scheduled jobs, which send no Origin) may drive the board.
function localRequest(req) {
  const okHost = (h) => h === "127.0.0.1" || h === "localhost";
  const host = String(req.headers.host || "");
  if (host && !okHost(host.replace(/:\d+$/, ""))) return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const u = new URL(origin);
    return okHost(u.hostname) && Number(u.port || 80) === PORT;
  } catch { return false; }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0; let tooBig = false;
    const fail = (code, say) => reject(Object.assign(new Error(say), { statusCode: code, say }));
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_JSON_BYTES) { tooBig = true; if (size > 1024 * 1024) req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      if (tooBig) return fail(413, "That message is too long.");
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) return resolve({});
      try {
        const v = JSON.parse(raw);
        if (v && typeof v === "object" && !Array.isArray(v)) return resolve(v);
      } catch { /* fall through */ }
      fail(400, "I could not read that request.");
    });
    req.on("close", () => fail(413, "That message is too long."));
    req.on("error", () => fail(400, "I could not read that request."));
  });
}

// ---- Manager runner: FIFO queue, at most MAX_MANAGERS at once.
const waiting = []; // jobs: {kind:"request", requestId, from, text} | {kind:"approval", taskId, requestId, note}
const running = new Set(); // slots: {job, name, child, startedAt, timedOut, cancelled}

function enqueue(job) {
  waiting.push(job);
  pump();
  return waiting.includes(job); // true = has to wait for a free slot
}

function pump() {
  while (running.size < MAX_MANAGERS && waiting.length) {
    const job = waiting.shift();
    const slot = { job, name: job.kind === "request" ? `request-${job.requestId}` : `approval-${job.taskId}`,
      child: null, startedAt: Date.now(), timedOut: false, cancelled: false };
    running.add(slot); // reserve the slot before any await
    startManager(slot).catch((err) => {
      console.error(`[manager] ${slot.name} could not start: ${err?.message || err}`);
      running.delete(slot);
      pump();
    });
  }
}

// Manager allow list = the fixed tools + every worker's extraBash rules from workers.json (deduplicated).
const MANAGER_TOOLS = ["Read", "Glob", "Grep", "Write", "Edit", "Agent", "Task", "TodoWrite", "WebSearch", "WebFetch", "Bash(python3 *)"];
const managerTools = (workers) => [...new Set([...MANAGER_TOOLS, ...workers.flatMap((w) => w.extraBash)])];

// The WORKERS block that follows the EVENT line: "- <id>: <summary> (output: <folder>)".
function managerWorkersBlock({ workers, error }) {
  if (!workers) return `WORKERS: none (${error}). You cannot dispatch anyone in this run.`;
  return ["WORKERS:", ...workers.map((w) => `- ${w.id}: ${w.summary} (output: ${w.output})`)].join("\n");
}

function killGroup(slot, sig) {
  const child = slot.child;
  if (!child || slot.exited) return;
  try { process.kill(-child.pid, sig); } catch { try { child.kill(sig); } catch { /* gone */ } }
}

async function startManager(slot) {
  const { job } = slot;
  // Skip work the owner cancelled (or that something else picked up) while it waited in line.
  if (job.kind === "request") {
    const r = await board(["show", "--request", String(job.requestId)]);
    if (!r.ok || r.json.request.status !== "queued") { running.delete(slot); return pump(); }
    await board(["request-set", String(job.requestId), "--status", "planning"]);
  } else {
    const r = await board(["show", "--task", String(job.taskId)]);
    if (!r.ok || r.json.status !== "approved") { running.delete(slot); return pump(); }
  }
  const reg = loadWorkers();
  if (reg.error) console.warn(`[manager] ${slot.name}: ${reg.error}; the Manager gets no workers`);
  const prompt = job.kind === "request"
    ? `EVENT: NEW_REQUEST id=${job.requestId} from=${job.from}\n${managerWorkersBlock(reg)}\nOwner said: "${job.text}"`
    : `EVENT: APPROVED task=${job.taskId} request=${job.requestId}\n${managerWorkersBlock(reg)}\nOwner note: "${job.note || "none"}"`;
  // Manager sessions ARE saved (no --no-session-persistence) so the owner can open them with `claude --resume`.
  const args = [
    "-p", prompt, "--model", MANAGER_MODEL, "--output-format", "json",
    "--append-system-prompt-file", MANAGER_MD,
    "--permission-mode", "dontAsk", "--strict-mcp-config", "--setting-sources", "project",
    "--allowedTools", ...managerTools(reg.workers || []),
  ];
  mkdirSync(MANAGER_LOGS, { recursive: true });
  const log = createWriteStream(join(MANAGER_LOGS, `${slot.name}.log`), { flags: "a" });
  log.on("error", (err) => console.error(`[manager] log write failed for ${slot.name}: ${err.message}`));
  log.write(`=== ${new Date().toISOString()} start ${slot.name}\n${prompt}\n---\n`);

  slot.startedAt = Date.now();
  const child = spawn(CLAUDE_BIN, args, { cwd: ROOT, env: childEnv(), stdio: ["ignore", "pipe", "pipe"], detached: true });
  slot.child = child;
  console.log(`[manager] start ${slot.name} pid=${child.pid ?? "?"} (${running.size} running, ${waiting.length} waiting)`);

  const out = []; let outSize = 0;
  child.stdout.on("data", (c) => { log.write(c); if (outSize < 2 * 1024 * 1024) { out.push(c); outSize += c.length; } });
  child.stderr.on("data", (c) => log.write(c));

  slot.timer = setTimeout(() => {
    slot.timedOut = true;
    killGroup(slot, "SIGTERM");
    setTimeout(() => killGroup(slot, "SIGKILL"), 5000);
  }, MANAGER_TIMEOUT_MS);

  let finished = false; let exitInfo = { code: null, signal: null };
  const finish = (spawnErr) => {
    if (finished) return;
    finished = true;
    clearTimeout(slot.timer);
    const { code, signal } = exitInfo;
    log.end(`\n=== ${new Date().toISOString()} exit code=${code} signal=${signal}${slot.timedOut ? " (timeout)" : ""}${spawnErr ? ` spawn error: ${spawnErr.message}` : ""}\n`);
    afterExit(slot, { code, signal, spawnErr, stdout: Buffer.concat(out).toString("utf8") })
      .catch((err) => console.error(`[manager] after-exit for ${slot.name} failed: ${err?.message || err}`))
      .finally(() => { running.delete(slot); pump(); });
  };
  child.on("error", (err) => { slot.exited = true; finish(err); });
  child.on("exit", (code, signal) => {
    slot.exited = true;
    exitInfo = { code, signal };
    setTimeout(() => finish(), 2000); // a grandchild may hold the pipes open; do not wait on it
  });
  child.on("close", () => finish());
}

function parseResult(stdout) {
  const text = stdout.trim();
  for (const candidate of [text, text.split("\n").filter(Boolean).pop() || ""]) {
    try {
      const j = JSON.parse(candidate);
      if (j && typeof j === "object") return { result: typeof j.result === "string" ? j.result : null, isError: j.is_error === true };
    } catch { /* try next */ }
  }
  return { result: null, isError: false };
}

async function addNote(text, rid) {
  const r = await board(["notify", `--request=${rid}`, "--", text]);
  if (!r.ok) await board(["notify", "--", text]); // request already archived
}

// After a Manager run: if it left the request open (queued|planning|working), close it (failed on
// non-zero exit / timeout, else done with reply = first 300 chars of the JSON result) and add ONE note.
// If the Manager already moved it to needs_you|done|failed|cancelled, it posted its own note: add none.
async function afterExit(slot, { code, signal, spawnErr, stdout }) {
  const rid = slot.job.requestId;
  const secs = ((Date.now() - slot.startedAt) / 1000).toFixed(1);
  const exitText = spawnErr ? `spawn-error(${spawnErr.code || spawnErr.message})` : code !== null ? `exit=${code}` : `signal=${signal}`;
  let outcome;
  if (slot.cancelled) {
    outcome = "cancelled by owner"; // the cancel reply already told the owner
  } else {
    const { result, isError } = parseResult(stdout);
    const failedRun = Boolean(spawnErr) || slot.timedOut || code !== 0 || isError;
    const r = await board(["show", "--request", String(rid)]);
    const req = r.ok ? r.json.request : null;
    if (req && OPEN_REQUEST.includes(req.status)) {
      let note;
      if (failedRun) {
        await board(["request-set", String(rid), "--status", "failed"]);
        note = slot.timedOut
          ? `Request ${rid} took too long, so I stopped it.`
          : `Request ${rid} failed. The manager stopped with an error.`;
        outcome = slot.timedOut ? "failed (timeout)" : "failed";
      } else {
        const reply = (result || "").trim().slice(0, 300);
        await board(["request-set", String(rid), "--status", "done", `--reply=${reply}`]);
        note = reply ? `Request ${rid} is done. ${cleanText(reply)}` : `Request ${rid} is done.`;
        outcome = "done";
      }
      await addNote(note, rid);
    } else {
      outcome = req ? `${req.status} (left by manager, no extra note)` : "request no longer on the board";
    }
  }
  console.log(`[manager] finish ${slot.name} ${exitText}${slot.timedOut ? " timeout" : ""} ${secs}s -> ${outcome}`);
}

// ---- Board actions (every reply carries `say`, spoken aloud by the page: short, plain, no symbols).
// Each returns {code, body}. Used by the /api/ask and /api/board/* endpoints AND by /api/chat.
async function askAction(body) {
  const text = cleanText(body.text);
  if (!text) return failed(400, "I did not catch anything to do. Please say it again.");
  if (text.length > MAX_TEXT) return failed(400, `That is too long. Please keep it under ${MAX_TEXT} characters.`);
  const from = body.from === undefined ? "text" : body.from;
  if (!FROMS.includes(from)) return failed(400, "That request came from somewhere I do not know.");
  const r = await board(["request-add", `--text=${text}`, `--from=${from}`]);
  if (!r.ok) return boardFail(r);
  const rid = r.json.id;
  const mustWait = enqueue({ kind: "request", requestId: rid, from, text });
  return succeeded({ requestId: rid,
    say: mustWait ? `Got it. That's request ${rid}. I'll start it as soon as I'm free.` : `On it. That's request ${rid}.` });
}

function readDecision(body) {
  const tid = toId(body.task);
  if (!tid) return { error: failed(400, "Which task? Please say the task number.") };
  if (body.note != null && typeof body.note !== "string") return { error: failed(400, "The note must be text.") };
  const note = cleanText(body.note);
  if (note.length > MAX_TEXT) return { error: failed(400, "That note is too long.") };
  return { tid, note };
}

async function approveAction(body) {
  const d = readDecision(body);
  if (d.error) return d.error;
  const r = await board(["approve", String(d.tid), ...(d.note ? [`--note=${d.note}`] : [])]);
  if (!r.ok) return boardFail(r);
  enqueue({ kind: "approval", taskId: d.tid, requestId: r.json.requestId, note: d.note });
  return succeeded({ say: `Approved task ${d.tid}. I'll finish it.` });
}

async function rejectAction(body) {
  const d = readDecision(body);
  if (d.error) return d.error;
  const r = await board(["reject", String(d.tid), ...(d.note ? [`--note=${d.note}`] : [])]);
  if (!r.ok) return boardFail(r);
  return succeeded({ say: `Rejected task ${d.tid}.` });
}

async function cancelAction(body) {
  const hasTask = body.task != null; const hasReq = body.request != null;
  const tid = hasTask ? toId(body.task) : null; const rid = hasReq ? toId(body.request) : null;
  if (hasTask === hasReq || (hasTask && !tid) || (hasReq && !rid)) return failed(400, "Say which task or request to cancel.");
  const r = await board(tid ? ["cancel", String(tid)] : ["cancel", "--request", String(rid)]);
  if (!r.ok) return boardFail(r);
  // Drop waiting Manager runs for it; stop a running Manager when its whole request is cancelled.
  for (let i = waiting.length - 1; i >= 0; i--) {
    const j = waiting[i];
    if ((rid && j.requestId === rid) || (tid && j.kind === "approval" && j.taskId === tid)) waiting.splice(i, 1);
  }
  if (rid) {
    for (const slot of running) {
      if (slot.job.requestId === rid) { slot.cancelled = true; killGroup(slot, "SIGTERM"); setTimeout(() => killGroup(slot, "SIGKILL"), 5000); }
    }
  }
  return succeeded({ say: tid ? `Cancelled task ${tid}.` : `Cancelled request ${rid}.` });
}

async function clearAction() {
  const r = await board(["clear-done"]);
  if (!r.ok) return boardFail(r);
  const n = r.json.tasks; const m = r.json.requests;
  const say = n > 0 ? `Cleared ${n} finished task${n === 1 ? "" : "s"}.`
    : m > 0 ? `Cleared ${m} finished request${m === 1 ? "" : "s"}.`
    : "Nothing to clear. There are no finished tasks.";
  return succeeded({ say });
}

async function spokenAction(body) {
  const ids = Array.isArray(body.ids) ? body.ids.map(toId) : [];
  if (!ids.length || ids.length > 200 || ids.includes(null)) return failed(400, "Which notes? Send a list of note numbers.");
  const r = await board(["mark-spoken", ...ids.map(String)]);
  if (!r.ok) return boardFail(r);
  rememberSpokenNotes(ids); // the page said them aloud, so they are part of the conversation now
  return succeeded({});
}

function readBoard() {
  try {
    const b = JSON.parse(readFileSync(BOARD_JSON, "utf8"));
    if (b && typeof b === "object") return b;
  } catch { /* missing or mid-write */ }
  return null;
}

function apiBoard(res) {
  let raw;
  try { raw = readFileSync(BOARD_JSON, "utf8"); JSON.parse(raw); } catch {
    raw = JSON.stringify({ updatedAt: null, nextRequest: 1, nextTask: 1, nextNote: 1, requests: [], tasks: [], notes: [] });
  }
  send(res, 200, raw, TYPES[".json"]);
}

// ---------------------------------------------------------------- v3: Jarvis brain (POST /api/chat)
// See docs/CONTRACT-v3.md. One fresh, read-only `claude -p` per sentence; the server builds the context.
const JARVIS_MD = "JARVIS.md"; // relative on purpose: every Claude run has cwd = ROOT
const BRAIN_MODEL = process.env.JARVIS_BRAIN_MODEL || "haiku";
const BRAIN_TIMEOUT_MS = Math.max(1000, Number(process.env.JARVIS_BRAIN_TIMEOUT_MS) || 45000);
const MAX_BRAINS = Math.max(1, Math.floor(Number(process.env.JARVIS_MAX_BRAINS)) || 3);
const MAX_BRAIN_QUEUE = 20; // more than this many waiting sentences = "too busy"
const CHAT_LOG = join(ROOT, "logs", "chat.jsonl");
const MEMORY_LINES = 12;
const PROMPT_BUDGET = 5900; // bytes; the contract asks for < 6 KB
const FALLBACK_SAY = "Sorry, I lost my train of thought. Say that again?";
const CHAT_FROMS = ["voice", "text"];
// The brain's actions. "launch_agent" is deliberately NOT here: only the owner's own sentence can open
// the Mission Control agent (see launchAgentChat); a brain reply with it is ignored like any unknown action.
const ACTION_TYPES = ["none", "new_request", "approve", "reject", "cancel", "clear"];
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";

// ---- Memory: last 12 chat lines in RAM; every line is also appended to logs/chat.jsonl.
// bin/reset.sh deletes logs/chat.jsonl — when it is gone, the in-memory lines are dropped too.
const memory = []; // {role: "owner"|"jarvis", text}
const rememberedNotes = new Set(); // "<noteId>|<note time>" (ids restart after a board reset)

function syncMemoryWithLog() {
  if ((memory.length || rememberedNotes.size) && !existsSync(CHAT_LOG)) { memory.length = 0; rememberedNotes.clear(); }
}

function remember(role, text, extra = {}) {
  if (!text) return;
  syncMemoryWithLog();
  memory.push({ role, text });
  while (memory.length > MEMORY_LINES) memory.shift();
  try {
    mkdirSync(dirname(CHAT_LOG), { recursive: true });
    appendFileSync(CHAT_LOG, JSON.stringify({ t: localIso(), role, text, ...extra }) + "\n");
  } catch (err) { console.error(`[chat] could not write logs/chat.jsonl: ${err?.message || err}`); }
}

function rememberSpokenNotes(ids) {
  const b = readBoard();
  if (!b || !Array.isArray(b.notes)) return;
  syncMemoryWithLog();
  for (const n of b.notes) {
    if (!n || !ids.includes(n.id)) continue;
    const key = `${n.id}|${n.t}`;
    if (rememberedNotes.has(key)) continue;
    rememberedNotes.add(key);
    remember("jarvis", cleanText(n.text), { note: n.id });
  }
  if (rememberedNotes.size > 400) [...rememberedNotes].slice(0, 200).forEach((k) => rememberedNotes.delete(k));
}

// ---- Prompt builder (plain text, compact, < 6 KB).
const pad2 = (n) => String(n).padStart(2, "0");
function localIso(d = new Date()) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
    + `${sign}${pad2(Math.floor(Math.abs(off) / 60))}:${pad2(Math.abs(off) % 60)}`;
}
function nowLine(d = new Date()) {
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  return `NOW: ${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())} ${weekday} (${TZ})`;
}
function clip(v, n) {
  const s = cleanText(typeof v === "string" ? v : v == null ? "" : String(v));
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}
function capSection(text, n) {
  return text.length > n ? `${text.slice(0, n - 12).trimEnd()} …(more)` : text;
}

function boardDigest() {
  const b = readBoard();
  if (!b) return "BOARD: not available right now";
  const reqs = Array.isArray(b.requests) ? b.requests : [];
  const tasks = Array.isArray(b.tasks) ? b.tasks : [];
  const notes = Array.isArray(b.notes) ? b.notes : [];
  if (!reqs.length && !tasks.length && !notes.length) return "BOARD: empty (no requests, no tasks, no notes)";
  const openReqs = reqs.filter((r) => r && !TERMINAL.includes(r.status));
  const openTasks = tasks.filter((t) => t && !TERMINAL.includes(t.status));
  const doneTasks = tasks.filter((t) => t && TERMINAL.includes(t.status))
    .sort((a, b2) => String(a.updatedAt || "").localeCompare(String(b2.updatedAt || ""))).slice(-5);
  const taskLine = (t, resultLen) => {
    let s = `- task ${t.id} (${t.worker}, request ${t.requestId}) ${t.status}: "${clip(t.title, 90)}"`;
    if (t.result) s += ` | result: ${clip(t.result, resultLen)}`;
    if (Array.isArray(t.files) && t.files.length) s += ` | files: ${t.files.slice(0, 2).map((f) => clip(f, 80)).join(", ")}`;
    if (t.approval && t.approval.action) {
      s += t.status === "needs_you" ? ` | WAITING FOR OWNER to approve: ${clip(t.approval.action, 100)}`
        : ` | approval: ${clip(t.approval.action, 80)} (${t.approval.decision || "pending"})`;
    }
    return s;
  };
  const lines = ["BOARD:"];
  lines.push(openReqs.length
    ? `open requests: ${openReqs.map((r) => `request ${r.id} ${r.status} "${clip(r.text, 100)}"`).join("; ")}`
    : "open requests: none");
  lines.push(openTasks.length ? "open tasks:" : "open tasks: none");
  for (const t of openTasks.slice(0, 12)) lines.push(taskLine(t, 160));
  if (openTasks.length > 12) lines.push(`- …and ${openTasks.length - 12} more open tasks`);
  if (doneTasks.length) {
    lines.push("last finished tasks:");
    for (const t of doneTasks) lines.push(taskLine(t, 120));
  }
  const lastNotes = notes.slice(-5);
  if (lastNotes.length) lines.push(`last notes (oldest first): ${lastNotes.map((n) => `"${clip(n.text, 160)}"`).join(" ")}`);
  return capSection(lines.join("\n"), 2300);
}

function readRole(role) {
  try { return JSON.parse(readFileSync(join(ROOT, "data", `${role}.json`), "utf8")); } catch { return null; }
}
const metric = (m) => (m && typeof m === "object" && m.label && m.display != null ? `${clip(m.label, 40)} ${clip(m.display, 60)}` : null);

function scoutDigest(p) {
  const parts = [];
  for (const group of ["revenue", "ads", "traffic"]) {
    const g = p[group];
    if (!g || typeof g !== "object") continue;
    for (const [k, v] of Object.entries(g)) {
      if (k === "movers") continue;
      const m = metric(v);
      if (m) parts.push(m);
      else if (v && typeof v === "object" && v.name) parts.push(`${clip(v.name, 40)}: ${Object.values(v).map(metric).filter(Boolean).join(", ")}`);
    }
  }
  const movers = Array.isArray(p.traffic?.movers) ? p.traffic.movers.map((x) => clip(x?.text, 80)).filter(Boolean) : [];
  const alerts = Array.isArray(p.alerts) ? p.alerts.map((a) => `${a?.level || "note"}: ${clip(a?.text, 100)}`) : [];
  const unavailable = Array.isArray(p.unavailable) ? p.unavailable.map((u) => clip(u?.item, 70)).filter(Boolean) : [];
  const projections = Array.isArray(p.projections) ? p.projections.map(metric).filter(Boolean) : [];
  let s = `scout report ${p.reportDate || "?"} (data for ${p.dataFor || "?"}; sources RevenueCat, Meta Ads, app analytics, all mock): ${parts.join("; ")}`;
  if (movers.length) s += ` | vs 7-day average: ${movers.join("; ")}`;
  if (alerts.length) s += ` | alerts: ${alerts.join("; ")}`;
  if (unavailable.length) s += ` | not available: ${unavailable.join("; ")}`;
  if (projections.length) s += ` | ${projections.join("; ")}`;
  return s;
}

function operatorDigest(p) {
  const counts = p.counts && typeof p.counts === "object"
    ? Object.entries(p.counts).map(([k, v]) => `${k} ${v}`).join(", ") : "no counts";
  const NEEDS = ["drafted", "escalated", "delegated", "held"];
  const items = (Array.isArray(p.items) ? p.items : []).filter((i) => i && NEEDS.includes(i.outcome)).slice(0, 8)
    .map((i) => {
      const file = clip(i.replyDraft || i.file, 70);
      return `${i.id} ${i.outcome} "${clip(i.subject, 60)}"${file ? ` (${file})` : ""}`;
    });
  return `operator inbox sweep (run ${clip(p.runAt, 25) || "?"}): ${counts}${items.length ? ` | needs the owner: ${items.join("; ")}` : ""}`;
}

function advisorDigest(p) {
  const recs = (Array.isArray(p.recommendations) ? p.recommendations : []).slice(0, 3)
    .map((r, i) => `${r?.rank ?? i + 1}) ${clip(r?.action, 160)}`);
  const open = Array.isArray(p.unacted7d) ? p.unacted7d.length : 0;
  return `advisor top 3 (${p.date || "?"}): ${recs.join(" ") || "none"}${open ? ` | ${open} past recommendations still open` : ""}`;
}

function todayDigest() {
  const lines = ["TODAY:"];
  for (const [role, digest] of [["scout", scoutDigest], ["operator", operatorDigest], ["advisor", advisorDigest]]) {
    const f = readRole(role);
    const p = f && f.payload && typeof f.payload === "object" ? f.payload : null;
    if (!p) { lines.push(`${role}: ${f && f.status === "working" ? "working on it now, no report yet" : "no report yet"}`); continue; }
    try { lines.push(digest(p) + (f.status && f.status !== "done" ? ` (status: ${f.status})` : "")); }
    catch { lines.push(`${role}: report could not be read`); }
  }
  return capSection(lines.join("\n"), 1900);
}

// One compact line: who is on the Manager's team (ids + summaries from workers.json).
function workersLine() {
  const { workers } = loadWorkers();
  if (!workers) return "WORKERS: list not available right now";
  return capSection(`WORKERS (the Manager's team): ${workers.map((w) => `${w.id} = ${clip(w.summary, 110)}`).join("; ")}`, 700);
}

function buildPrompt(text, from) {
  syncMemoryWithLog();
  const head = [nowLine(), workersLine(), boardDigest(), todayDigest()].join("\n");
  const tail = `OWNER SAID (${from}): "${text}"\nReply with ONLY one JSON object: {"say":"...","action":{"type":"..."}}`;
  let budget = PROMPT_BUDGET - Buffer.byteLength(head) - Buffer.byteLength(tail) - 40;
  const chat = [];
  for (let i = memory.length - 1; i >= 0; i--) { // newest first, until the budget is used up
    const line = `${memory[i].role}: ${clip(memory[i].text, 300)}`;
    const size = Buffer.byteLength(line) + 1;
    if (size > budget) break;
    budget -= size;
    chat.unshift(line);
  }
  const chatBlock = chat.length ? `RECENT CHAT (oldest first):\n${chat.join("\n")}` : "RECENT CHAT: none yet";
  return `${head}\n${chatBlock}\n${tail}`;
}

// ---- Brain runs: at most MAX_BRAINS at once, the rest wait in FIFO order.
const brainLine = []; // resolvers waiting for a slot
const brainChildren = new Set();
let brainsRunning = 0;
function acquireBrain() {
  if (brainsRunning < MAX_BRAINS) { brainsRunning++; return Promise.resolve(); }
  return new Promise((resolve) => brainLine.push(resolve));
}
function releaseBrain() {
  const next = brainLine.shift();
  if (next) next(); else brainsRunning--; // hand the slot straight to the next in line
}

function brainArgs(prompt) {
  return [
    "-p", prompt, "--model", BRAIN_MODEL, "--output-format", "json",
    "--append-system-prompt-file", JARVIS_MD,
    "--permission-mode", "dontAsk", "--strict-mcp-config", "--setting-sources", "project", "--no-session-persistence",
    "--allowedTools", "Read", "Glob", "Grep",
  ];
}

// Resolves with the run's output; the slot is released when the process is really gone.
function runBrain(prompt) {
  return new Promise((resolve) => {
    let released = false;
    const release = () => { if (!released) { released = true; releaseBrain(); } };
    let child;
    try {
      child = spawn(CLAUDE_BIN, brainArgs(prompt), { cwd: ROOT, env: childEnv(), stdio: ["ignore", "pipe", "pipe"], detached: true });
    } catch (err) { release(); return resolve({ spawnErr: err }); }
    brainChildren.add(child);
    const out = []; let outSize = 0; let errTail = "";
    child.stdout.on("data", (c) => { if (outSize < 1024 * 1024) { out.push(c); outSize += c.length; } });
    child.stderr.on("data", (c) => { errTail = (errTail + c).slice(-400); });
    let settled = false; let timedOut = false; let exitInfo = { code: null, signal: null };
    const kill = (sig) => { try { process.kill(-child.pid, sig); } catch { try { child.kill(sig); } catch { /* gone */ } } };
    const settle = (extra = {}) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout: Buffer.concat(out).toString("utf8"), stderr: errTail, timedOut, ...exitInfo, ...extra });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill("SIGTERM");
      setTimeout(() => { if (brainChildren.has(child)) kill("SIGKILL"); }, 2000).unref();
      settle();
    }, BRAIN_TIMEOUT_MS);
    const gone = () => { brainChildren.delete(child); release(); };
    child.on("error", (err) => { gone(); settle({ spawnErr: err }); });
    child.on("exit", (code, signal) => { exitInfo = { code, signal }; gone(); setTimeout(() => settle(), 1000).unref(); });
    child.on("close", () => settle());
  });
}

// First balanced {...} in the brain's text that parses as an object with `say` or `action`.
function firstJsonObject(text) {
  const s = String(text || "").slice(0, 20000);
  for (let start = s.indexOf("{"); start !== -1; start = s.indexOf("{", start + 1)) {
    let depth = 0; let inStr = false; let esc = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (inStr) {
        if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) {
        try {
          const v = JSON.parse(s.slice(start, i + 1));
          if (v && typeof v === "object" && !Array.isArray(v) && ("say" in v || "action" in v)) return v;
        } catch { /* not JSON — try the next "{" */ }
        break;
      }
    }
  }
  return null;
}

// Spoken text: no markdown symbols, one line, bounded.
function speakable(v, max = 1000) {
  const s = cleanText(String(v || "").replace(/[*#`]+/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"));
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

// Validate the brain's action. Ids are checked again by the board actions themselves.
function normalizeAction(a, ownerText) {
  if (typeof a === "string") a = { type: a };
  if (!a || typeof a !== "object" || Array.isArray(a)) return { type: "none" };
  const type = cleanText(a.type || "none").toLowerCase();
  if (!ACTION_TYPES.includes(type)) return { type: "none", invalid: clip(type, 40) };
  const id = (v) => (v == null ? undefined : toId(v) ?? v);
  const note = typeof a.note === "string" && cleanText(a.note) ? clip(a.note, MAX_TEXT) : undefined;
  switch (type) {
    case "new_request": return { type, text: clip(cleanText(a.text) || ownerText, MAX_TEXT) };
    case "approve": case "reject": return { type, task: id(a.task), ...(note ? { note } : {}) };
    case "cancel": return { type, ...(a.task != null ? { task: id(a.task) } : {}), ...(a.request != null ? { request: id(a.request) } : {}) };
    default: return { type }; // none | clear
  }
}

function runAction(a, from) {
  switch (a.type) {
    case "new_request": return askAction({ text: a.text, from });
    case "approve": return approveAction({ task: a.task, note: a.note });
    case "reject": return rejectAction({ task: a.task, note: a.note });
    case "cancel": return cancelAction({ task: a.task, request: a.request });
    case "clear": return clearAction();
    default: return Promise.resolve(succeeded({ say: "" }));
  }
}

function joinSay(brainSay, actionSay) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, "").replace(/\s+/g, " ").trim();
  if (!brainSay) return actionSay;
  if (!actionSay) return brainSay;
  if (norm(actionSay).includes(norm(brainSay))) return actionSay; // brain already said the same thing
  return `${/[.!?…]$/.test(brainSay) ? brainSay : `${brainSay}.`} ${actionSay}`;
}

// ---------------------------------------------------------------- v5: Mission Control agent
// An interactive Claude Code session (bin/agent.sh, --permission-mode manual: it asks before every change)
// in which the owner can change Jarvis itself. It opens ONLY when the owner's own sentence in /api/chat
// says so: never from /api/ask (clock), never from a brain action, never from the Manager.
// bin/open-agent.sh opens it in a new Terminal window (or reports it is already open). Tests point
// JARVIS_OPEN_AGENT_BIN at a stub executable instead.
const OPEN_AGENT_BIN = process.env.JARVIS_OPEN_AGENT_BIN || "";
const OPEN_AGENT_SH = join(ROOT, "bin", "open-agent.sh");
const OPEN_AGENT_TIMEOUT_MS = 30000; // the first time, macOS may ask the owner to allow controlling Terminal
const LAUNCH_AGENT_RE = /\b(launch|open|start)\b[\s\S]{0,25}\bmission[\s-]*control\s+agent\b/i;
const AGENT_HINT = "Open a terminal in the project folder and run npm run agent.";
let agentLaunch = null; // the launch in progress; sentences that arrive meanwhile share it (one window)

// -> {status: "opened"|"already_open"|"manual", hint?} or {status: "error", error}
function runOpenAgent() {
  const [file, args] = OPEN_AGENT_BIN ? [OPEN_AGENT_BIN, []] : ["bash", [OPEN_AGENT_SH]];
  return new Promise((resolve) => {
    execFile(file, args, { cwd: ROOT, env: childEnv(), timeout: OPEN_AGENT_TIMEOUT_MS, maxBuffer: 64 * 1024 },
      (err, stdout, stderr) => {
        let json = null;
        const last = String(stdout || "").trim().split("\n").filter(Boolean).pop() || "";
        try { json = JSON.parse(last); } catch { /* not JSON */ }
        const status = json && typeof json === "object" && typeof json.status === "string" ? json.status : null;
        if (!err && ["opened", "already_open", "manual"].includes(status)) {
          return resolve({ status, hint: typeof json.hint === "string" ? json.hint : "" });
        }
        const why = (typeof json?.error === "string" && json.error) || String(stderr || "").trim()
          || (err?.killed ? "timed out" : err?.message) || `unexpected output: ${last || "none"}`;
        resolve({ status: "error", error: cleanText(why).slice(0, 300) });
      });
  });
}

function agentSay(r) {
  switch (r.status) {
    case "opened": return "Opening the Mission Control agent in a new Terminal window. It will ask before every change.";
    case "already_open": return "The Mission Control agent is already open. I've brought Terminal to the front.";
    case "manual": {
      const hint = speakable(r.hint, 200);
      return `I can't open a terminal window on this computer. ${hint ? (/[.!?]$/.test(hint) ? hint : `${hint}.`) : AGENT_HINT}`;
    }
    default: return `Sorry, I couldn't open the Mission Control agent. ${AGENT_HINT}`;
  }
}

async function launchAgentChat(text, from, t0) {
  if (!agentLaunch) agentLaunch = runOpenAgent().finally(() => { agentLaunch = null; });
  const r = await agentLaunch;
  const ok = r.status !== "error";
  const say = agentSay(r);
  remember("owner", text, { from });
  remember("jarvis", say, { action: "launch_agent", ok });
  const ms = Date.now() - t0;
  console.log(`[agent] ${ms}ms launch_agent -> ${r.status}${r.error ? ` (${r.error})` : ""}`);
  return { code: 200, body: { ok, say, action: { type: "launch_agent" }, requestId: null, ms } };
}

async function chatAction(body) {
  const t0 = Date.now();
  const reply = (code, ok, say, action = { type: "none" }, requestId = null) =>
    ({ code, body: { ok, say, action, requestId, ms: Date.now() - t0 } });
  const text = cleanText(body.text);
  if (!text) return reply(400, false, "I did not catch anything. Please say it again.");
  if (text.length > MAX_TEXT) return reply(400, false, `That is too long. Please keep it under ${MAX_TEXT} characters.`);
  const from = body.from === undefined ? "text" : body.from;
  if (!CHAT_FROMS.includes(from)) return reply(400, false, "That message came from somewhere I do not know.");
  // "Jarvis, launch mission control agent": handled here, before (and instead of) the brain.
  if (LAUNCH_AGENT_RE.test(text)) return launchAgentChat(text, from, t0);
  if (brainLine.length >= MAX_BRAIN_QUEUE) return reply(429, false, "I'm still thinking about your last few messages. Please try again in a moment.");

  await acquireBrain();
  let prompt;
  try { prompt = buildPrompt(text, from); } catch (err) {
    console.error(`[brain] prompt build failed: ${err?.message || err}`);
    prompt = `${nowLine()}\nBOARD: not available right now\nTODAY: not available right now\nRECENT CHAT: none yet\nOWNER SAID (${from}): "${text}"`;
  }
  const run = await runBrain(prompt);

  let status; let brainSay = ""; let action = { type: "none" };
  if (run.spawnErr) status = `spawn-error(${run.spawnErr.code || run.spawnErr.message})`;
  else if (run.timedOut) status = "timeout";
  else {
    const { result, isError } = parseResult(run.stdout);
    const obj = !isError && result ? firstJsonObject(result) : null;
    if (obj) {
      brainSay = speakable(obj.say);
      action = normalizeAction(obj.action, text);
      status = action.invalid ? `unknown-action(${action.invalid})` : "ok";
    } else {
      status = isError ? "brain-error" : result ? "bad-json" : `no-output(exit=${run.code ?? run.signal})`;
      // Plain prose instead of JSON is still worth saying; anything JSON-ish is not.
      if (!isError && result && !result.includes("{")) brainSay = speakable(result, 400);
    }
  }
  delete action.invalid;

  let ok = true; let say = brainSay; let requestId = null;
  if (action.type !== "none") {
    const r = await runAction(action, from);
    if (r.body.ok) { say = joinSay(brainSay, r.body.say); requestId = r.body.requestId ?? null; }
    else { ok = false; say = r.body.say; }
  }
  if (!say) say = FALLBACK_SAY;
  remember("owner", text, { from });
  remember("jarvis", say, { action: action.type, ok });
  const ms = Date.now() - t0;
  const errHint = status === "ok" ? "" : ` exit=${run.code ?? run.signal ?? "-"}${run.stderr ? ` stderr=${JSON.stringify(cleanText(run.stderr).slice(-160))}` : ""}`;
  console.log(`[brain] ${ms}ms action=${action.type}${ok ? "" : "(failed)"} ${status}${errHint}`);
  return { code: 200, body: { ok, say, action, requestId, ms } };
}

// ---------------------------------------------------------------- HTTP
const POST_ROUTES = {
  "/api/chat": chatAction,
  "/api/ask": askAction,
  "/api/board/approve": approveAction,
  "/api/board/reject": rejectAction,
  "/api/board/cancel": cancelAction,
  "/api/board/clear": clearAction,
  "/api/board/spoken": spokenAction,
};

async function api(req, res, pathname) {
  if (!localRequest(req)) return sayErr(res, 403, "Requests from other sites are not allowed.");
  if (pathname === "/api/board") {
    return req.method === "GET" ? apiBoard(res) : sayErr(res, 405, "Use GET to read the board.");
  }
  if (pathname === "/api/workers") { // the same workers array as /data/workers.js
    if (req.method !== "GET") return sayErr(res, 405, "Use GET to read the workers.");
    const { workers, error } = loadWorkers();
    return workers ? sendJson(res, 200, workers)
      : sendJson(res, 500, { ok: false, say: "My list of workers is broken. Please check workers.json.", error });
  }
  const handler = POST_ROUTES[pathname];
  if (!handler) return sayErr(res, 404, "I do not know that command.");
  if (req.method !== "POST") return sayErr(res, 405, "Use POST for that.");
  let body;
  try { body = await readJson(req); } catch (err) { return sayErr(res, err.statusCode || 400, err.say || "I could not read that request."); }
  try {
    const r = await handler(body);
    sendJson(res, r.code, r.body);
  } catch (err) {
    console.error(`[api] ${pathname} failed: ${err?.stack || err}`);
    if (!res.headersSent) sayErr(res, 500, "Something went wrong on my side.");
  }
}

// Manager and brain runs are detached process groups, so stop them when the server stops.
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    for (const slot of running) killGroup(slot, "SIGTERM");
    for (const child of brainChildren) { try { process.kill(-child.pid, "SIGTERM"); } catch { /* gone */ } }
    process.exit(0);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  if (url.pathname === "/") {
    res.writeHead(302, { Location: "/mission-control/index.html" });
    return res.end();
  }
  if (url.pathname === "/api/voice") {
    return send(res, 200, JSON.stringify({ provider: voiceEnabled ? "elevenlabs" : "browser", voiceId: VOICE_ID, model: MODEL_ID }), TYPES[".json"]);
  }
  if (url.pathname === "/api/tts" && req.method === "GET") {
    return tts(url.searchParams.get("text"), res);
  }
  if (url.pathname === "/api/stt" && req.method === "POST") {
    return stt(req, res);
  }
  if (url.pathname === "/api/ask" || url.pathname === "/api/chat" || url.pathname === "/api/board" || url.pathname.startsWith("/api/board/")
    || url.pathname === "/api/workers") {
    return api(req, res, url.pathname);
  }
  if (req.method !== "GET") return send(res, 405, "Method not allowed");
  return serveStatic(url.pathname, res);
});

server.listen(PORT, HOST, () => {
  console.log(`Jarvis HUD: http://${HOST}:${PORT}/  (voice: ${voiceEnabled ? `ElevenLabs ${MODEL_ID}` : "browser fallback"}; brain: ${BRAIN_MODEL}, max ${MAX_BRAINS})`);
  if (MAX_MANAGERS === 0) console.log("[manager] paused (JARVIS_MAX_MANAGERS=0): new requests stay queued");
  checkWorkers();
});

// v3 conversation: every owner sentence goes to POST /api/chat; the local keyword router is the
// offline fallback (file://, network error, non-JSON, HTTP 5xx).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, deferred, sleep } from './lib/harness.mjs';

let env;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });

const ACT = (J) => J.page.locator('#reply .act');
const REPLY = (J) => J.text('#reply');

test('text box → /api/chat with {text, from:"text"}, THINKING… while waiting, reply spoken + shown', { timeout: 60000 }, async () => {
  const hold = deferred();
  const J = await env.open({
    api: { '/api/chat': async () => { await hold.promise; return { ok: true, say: 'Two tasks are running and one needs you.', action: { type: 'none' }, requestId: null, ms: 2900 }; } }
  });
  try {
    await J.ask('  how are we doing today?  ');
    const [call] = await J.waitForCalls('/api/chat');
    assert.equal(call.method, 'POST');
    assert.deepEqual(call.body, { text: 'how are we doing today?', from: 'text' });

    await J.page.waitForFunction(() => document.body.getAttribute('data-voice') === 'thinking');
    assert.equal(await J.text('#orbState'), 'THINKING…');
    assert.match(await REPLY(J), /YOU ›\s*how are we doing today\?/);
    assert.match(await REPLY(J), /JARVIS ›\s*THINKING…/);
    assert.equal(J.callsTo('/api/ask').length, 0, 'the local router must not run');

    hold.resolve();
    await J.waitForSpoken(/^Two tasks are running and one needs you\.$/);
    await J.page.waitForFunction(() => document.body.getAttribute('data-voice') !== 'thinking');
    assert.match(await REPLY(J), /JARVIS ›\s*Two tasks are running and one needs you\./);
    assert.doesNotMatch(await REPLY(J), /offline mode/);
    assert.equal(await ACT(J).count(), 0, 'no action line for action "none"');
    assert.equal(await J.text('#ps-reply'), 'JARVIS BRAIN · ONLINE');
    assert.notEqual(await J.text('#orbState'), 'THINKING…');
    assert.deepEqual(J.errors, []);
  } finally { hold.resolve(); await J.close(); }
});

test('action lines: new_request / approve / reject / cancel task / cancel request / clear / failed', { timeout: 60000 }, async () => {
  const replies = {
    'research notely pricing': { ok: true, say: "On it. That's request 4.", action: { type: 'new_request', text: 'research notely pricing' }, requestId: 4 },
    'approve 5': { ok: true, say: 'Approved. The tweet is going out.', action: { type: 'approve', task: 5 }, requestId: null },
    'reject 6': { ok: true, say: 'Rejected task 6.', action: { type: 'reject', task: 6, note: 'too long' }, requestId: null },
    'cancel task 3': { ok: true, say: 'Cancelled task 3.', action: { type: 'cancel', task: 3 }, requestId: null },
    'cancel request 2': { ok: true, say: 'Cancelled request 2.', action: { type: 'cancel', request: 2 }, requestId: null },
    'clear the board': { ok: true, say: 'Board cleared.', action: { type: 'clear' }, requestId: null },
    'approve 99': { ok: false, say: "I can't find task 99 on the board.", action: { type: 'approve', task: 99 }, requestId: null }
  };
  const expected = {
    'research notely pricing': '→ MANAGER · request 4',
    'approve 5': '✓ APPROVED · task 5',
    'reject 6': '✕ REJECTED · task 6',
    'cancel task 3': '✕ CANCELLED · task 3',
    'cancel request 2': '✕ CANCELLED · request 2',
    'clear the board': '✓ BOARD CLEARED · finished work',
    'approve 99': '! NOT DONE · approve · task 99'
  };
  const J = await env.open({ api: { '/api/chat': ({ body }) => replies[body.text] } });
  try {
    for (const [text, line] of Object.entries(expected)) {
      const n = J.callsTo('/api/chat').length;
      await J.ask(text);
      await J.waitForCalls('/api/chat', n + 1);
      await J.page.waitForFunction((say) => document.querySelector('#reply').textContent.includes(say), replies[text].say);
      assert.equal((await ACT(J).innerText()).trim(), line, `action line for "${text}"`);
      assert.match(await REPLY(J), new RegExp('YOU ›\\s*' + text));
    }
    assert.equal(J.callsTo('/api/board/approve').length, 0, 'actions run on the server, not from the page');
    assert.deepEqual(J.errors, []);
  } finally { await J.close(); }
});

test('queueing: 3 fast sentences are sent one at a time, in order; extra ones beyond 3 waiting are dropped', { timeout: 60000 }, async () => {
  const J = await env.open({
    api: { '/api/chat': async ({ body }) => { await sleep(500); return { ok: true, say: 'Answer to ' + body.text + '.', action: { type: 'none' }, requestId: null }; } }
  });
  try {
    for (const t of ['first question', 'second question', 'third question']) await J.ask(t);
    // while #1 is with the brain, #2 and #3 wait in line
    await J.page.waitForFunction(() => /2 MORE QUEUED/.test(document.querySelector('#reply').textContent));
    assert.match(await J.text('#orbHint'), /2 MORE QUEUED/);
    assert.equal(J.callsTo('/api/chat').length, 1, 'only one sentence is with the brain at a time');

    const calls = await J.waitForCalls('/api/chat', 3, 15000);
    await J.waitForSpoken(/^Answer to third question\.$/);
    assert.deepEqual(calls.map((c) => c.body.text), ['first question', 'second question', 'third question']);
    assert.ok(calls.every((c) => c.body.from === 'text'));
    for (let i = 1; i < calls.length; i++) assert.ok(calls[i].at >= calls[i - 1].respondAt, `request ${i + 1} was sent before reply ${i} arrived`);
    assert.equal(J.maxInflight('/api/chat'), 1);
    const answers = (await J.spoken()).filter((s) => s.startsWith('Answer to'));
    assert.deepEqual(answers, ['Answer to first question.', 'Answer to second question.', 'Answer to third question.'], 'replies are spoken in order, none cut off');
    assert.match(await REPLY(J), /third question/);
    await J.page.waitForFunction(() => document.body.getAttribute('data-voice') !== 'thinking');

    // 1 in flight + max 3 waiting: a 5th fast sentence is refused with a note
    const before = J.callsTo('/api/chat').length;
    for (const t of ['q1', 'q2', 'q3', 'q4', 'q5']) await J.ask(t);
    assert.match(await J.text('#vnote'), /ALREADY WAITING/);
    await J.waitForCalls('/api/chat', before + 4, 15000);
    await J.waitForSpoken(/^Answer to q4\.$/);
    await sleep(800);
    assert.deepEqual(J.callsTo('/api/chat').slice(before).map((c) => c.body.text), ['q1', 'q2', 'q3', 'q4']);
    assert.doesNotMatch(await J.text('#vnote'), /ALREADY WAITING/, 'the warning clears once the line is empty');
    assert.deepEqual(J.errors, []);
  } finally { await J.close(); }
});

test('fallback: HTTP 500 → local router answers, marked "(offline mode)"; next good reply is online again', { timeout: 60000 }, async () => {
  let mode = 'down';
  const J = await env.open({
    api: { '/api/chat': () => mode === 'down' ? { status: 500, json: { ok: false, say: 'Internal error' } } : { ok: true, say: 'Back online.', action: { type: 'none' } } }
  });
  try {
    await J.ask('what is revenue');
    await J.page.waitForFunction(() => /offline mode/.test(document.querySelector('#reply').textContent));
    const r = await REPLY(J);
    assert.match(r, /Revenue yesterday was \$412\.50/, 'answered from the local data router');
    assert.match(r, /\(offline mode\)/);
    assert.doesNotMatch(r, /Internal error/);
    assert.equal(await J.text('#ps-reply'), 'OFFLINE MODE · LOCAL ANSWERS');
    await J.waitForSpoken(/^Revenue yesterday was \$412\.50/);
    const vis = await J.page.evaluate(() => {
      const o = document.querySelector('#reply .offl').getBoundingClientRect(), r = document.querySelector('#reply').getBoundingClientRect();
      return o.top >= r.top - 0.5 && o.bottom <= r.bottom + 0.5;
    });
    assert.ok(vis, '"(offline mode)" is visible without scrolling, even after a long answer');
    assert.ok(!(await J.spoken()).some((s) => /offline mode/i.test(s)), 'the marker is shown, not spoken');
    await J.screenshot('v3-offline-1440x900.png');

    // offline work still reaches the server through the v2 routes (board + /api/ask)
    await J.ask('approve 5');
    const [ap] = await J.waitForCalls('/api/board/approve');
    assert.deepEqual(ap.body, { task: 5 });
    await J.page.waitForFunction(() => /Approved\./.test(document.querySelector('#reply').textContent));
    assert.match(await REPLY(J), /\(offline mode\)/);

    mode = 'up';
    await J.ask('are you back?');
    await J.page.waitForFunction(() => /Back online\./.test(document.querySelector('#reply').textContent));
    assert.doesNotMatch(await REPLY(J), /offline mode/);
    assert.equal(await J.text('#ps-reply'), 'JARVIS BRAIN · ONLINE');
  } finally { await J.close(); }
});

test('fallback: network failure → local router, "(offline mode)"', { timeout: 60000 }, async () => {
  const J = await env.open({ api: { '/api/chat': () => ({ abort: true }) } });
  try {
    await J.ask("what's on the board");
    await J.page.waitForFunction(() => /offline mode/.test(document.querySelector('#reply').textContent));
    const r = await REPLY(J);
    assert.match(r, /1 open request\. Request 3/, 'board answer built locally from data/tasks.js');
    assert.match(r, /\(offline mode\)/);
    assert.equal(J.callsTo('/api/chat').length, 1);
    // only the expected aborted-request log line, no page errors
    assert.ok(J.errors.every((e) => /Failed to load resource|ERR_FAILED/.test(e)), J.errors.join('\n'));
  } finally { await J.close(); }
});

test('fallback: non-JSON reply → local router, "(offline mode)"', { timeout: 60000 }, async () => {
  const J = await env.open({ api: { '/api/chat': () => ({ status: 200, contentType: 'text/html', body: '<html>proxy error</html>' }) } });
  try {
    await J.ask('any alerts?');
    await J.page.waitForFunction(() => /offline mode/.test(document.querySelector('#reply').textContent));
    assert.match(await REPLY(J), /Urgent: 4 failed payments/i);
  } finally { await J.close(); }
});

test('file:// → no /api/chat at all, local router with "(offline mode)"', { timeout: 60000 }, async () => {
  const J = await env.open({ file: true, fixtures: true });
  try {
    assert.equal(await J.text('#ps-reply'), 'OFFLINE MODE · LOCAL ANSWERS');
    await J.ask('what is revenue');
    await J.page.waitForFunction(() => /offline mode/.test(document.querySelector('#reply').textContent));
    assert.match(await REPLY(J), /Revenue yesterday was \$412\.50/);
    assert.equal(J.calls.length, 0, 'no API calls from file://');
    assert.deepEqual(J.errors, []);
  } finally { await J.close(); }
});

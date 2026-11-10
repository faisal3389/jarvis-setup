// Voice in: hands-free wake word ("Jarvis, …") on both engines, and push-to-talk — all reach /api/chat
// with from:"voice". The ElevenLabs VAD engine is driven by a fake microphone playing a speech-like WAV.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setup, fixtureBoard, writeSpeechLikeWav, sleep } from './lib/harness.mjs';

let env, tmp;
before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-voice-'));
  const wav = writeSpeechLikeWav(path.join(tmp, 'speech.wav'));
  env = await setup(['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-audio-capture=' + wav]);
});
after(async () => { await env.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

function quietBoard() {
  const b = fixtureBoard();
  b.notes.forEach((n) => { n.spoken = true; });
  return b;
}

test('hands-free, ElevenLabs VAD engine (fake mic): non-Jarvis speech ignored, "Jarvis, what is revenue?" → /api/chat', { timeout: 90000 }, async () => {
  let chatSent = false;
  const J = await env.open({
    board: quietBoard(),
    voice: 'elevenlabs',   // /api/voice says ElevenLabs is on → the VAD + /api/stt engine is available
    sr: 'network',         // Chrome's recognizer fails like in Crest → the page switches to the VAD engine
    api: {
      '/api/stt': ({ n }) => ({ text: chatSent ? '' : n === 1 ? 'What time is it in London?' : 'Jarvis, what is revenue?' }),
      '/api/chat': () => { chatSent = true; return { ok: true, say: 'Revenue yesterday was 412 dollars.', action: { type: 'none' }, requestId: null }; }
    }
  });
  try {
    // the page fell back from the (failing) Chrome engine to the mic + VAD engine
    await J.page.waitForFunction(() => window.__sr.instances >= 1);
    const [chat] = await J.waitForCalls('/api/chat', 1, 45000);
    const stt = J.callsTo('/api/stt');
    assert.ok(stt.length >= 2, 'two phrases were transcribed');
    assert.ok(stt[0].body && stt[0].body.bytes >= 2000, 'a real audio clip was posted to /api/stt');
    assert.ok(stt[0].respondAt <= chat.at && stt[1].respondAt <= chat.at);
    assert.deepEqual(chat.body, { text: 'what is revenue?', from: 'voice' });
    // ElevenLabs is on, so the reply is spoken through /api/tts
    await J.page.waitForFunction(() => /Revenue yesterday was 412 dollars\./.test(document.querySelector('#reply').textContent));
    const t0 = Date.now();
    while (!J.callsTo('/api/tts').some((c) => c.query.text === 'Revenue yesterday was 412 dollars.') && Date.now() - t0 < 5000) await sleep(50);
    assert.ok(J.callsTo('/api/tts').some((c) => c.query.text === 'Revenue yesterday was 412 dollars.'), 'reply spoken via /api/tts');
    await sleep(500);
    const chats = J.callsTo('/api/chat');
    assert.equal(chats.length, 1, 'the non-Jarvis phrase was ignored: ' + JSON.stringify(chats.map((c) => c.body)));
    assert.match(await J.text('#reply'), /YOU ›\s*what is revenue\?/);
    assert.match(await J.text('#reply'), /Revenue yesterday was 412 dollars\./);
    assert.equal(await J.page.evaluate(() => document.body.getAttribute('data-voice') !== 'idle'), true, 'hands-free stays armed');
  } finally { await J.close(); }
});

test('hands-free, Chrome engine: other speech ignored, "Jarvis, …" → /api/chat; stays armed while THINKING and queues', { timeout: 60000 }, async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const J = await env.open({
    board: quietBoard(),
    api: { '/api/chat': async ({ body, n }) => { if (n === 1) await gate; return { ok: true, say: 'Reply to ' + body.text + '.', action: { type: 'none' } }; } }
  });
  try {
    await J.page.waitForFunction(() => window.__sr.active && document.body.getAttribute('data-voice') === 'armed');
    await J.page.evaluate(() => window.__srEmit('what time is it in London'));
    await sleep(300);
    assert.equal(J.callsTo('/api/chat').length, 0, 'speech without the wake word is ignored');

    await J.page.evaluate(() => window.__srEmit('Jarvis, approve task five'));
    const [c1] = await J.waitForCalls('/api/chat');
    assert.deepEqual(c1.body, { text: 'approve task five', from: 'voice' });
    await J.page.waitForFunction(() => document.body.getAttribute('data-voice') === 'thinking');
    assert.match(await J.text('#orbHint'), /STILL LISTENING FOR “JARVIS”/);

    // still armed while thinking: a second sentence waits for the first reply
    assert.ok(await J.page.evaluate(() => window.__srEmit('Jarvis, and what needs me?')), 'recognizer still running while THINKING');
    await sleep(300);
    assert.equal(J.callsTo('/api/chat').length, 1, 'second sentence not sent before the first reply');
    release();
    const calls = await J.waitForCalls('/api/chat', 2);
    assert.deepEqual(calls[1].body, { text: 'and what needs me?', from: 'voice' });
    assert.ok(calls[1].at >= calls[0].respondAt);
    await J.waitForSpoken(/^Reply to and what needs me\?\.?$/);
  } finally { release(); await J.close(); }
});

test('push-to-talk (hands-free off, hold Space) → /api/chat with from:"voice"', { timeout: 60000 }, async () => {
  const J = await env.open({ board: quietBoard(), api: { '/api/chat': ({ body }) => ({ ok: true, say: 'Heard: ' + body.text + '.', action: { type: 'none' } }) } });
  try {
    await J.page.waitForFunction(() => document.body.getAttribute('data-voice') === 'armed');
    await J.page.click('#orbWrap'); // hands-free off
    await J.page.waitForFunction(() => document.body.getAttribute('data-voice') === 'idle');
    await J.page.evaluate(() => document.activeElement && document.activeElement.blur());
    await J.page.keyboard.down('Space');
    await J.page.waitForFunction(() => document.body.getAttribute('data-voice') === 'listening');
    assert.match(await J.text('#orbHint'), /RELEASE SPACE TO SEND/);
    await J.page.evaluate(() => window.__srEmit('what needs me'));
    await J.page.keyboard.up('Space');
    const [c] = await J.waitForCalls('/api/chat');
    assert.deepEqual(c.body, { text: 'what needs me', from: 'voice' });
    await J.waitForSpoken(/^Heard: what needs me\.$/);
    assert.deepEqual(J.errors, []);
  } finally { await J.close(); }
});

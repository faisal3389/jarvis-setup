// Things that must keep working exactly as in v2: board buttons call /api/board/* directly,
// spoken board notes are said once and POSTed to /api/board/spoken, MORNING BRIEF is local + instant.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, fixtureBoard } from './lib/harness.mjs';

let env;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });

// the fixture board with every note already spoken (so nothing talks over the test)
function quietBoard() {
  const b = fixtureBoard();
  b.notes.forEach((n) => { n.spoken = true; });
  return b;
}

test('APPROVE button → POST /api/board/approve {task}, not /api/chat', { timeout: 60000 }, async () => {
  const J = await env.open({
    board: quietBoard(),
    api: { '/api/board/approve': ({ body }) => ({ ok: true, say: `Approved task ${body.task}. The tweet is going out.` }) }
  });
  try {
    const btn = J.page.locator('#b-board button[data-act="approve"][data-id="5"]');
    await btn.click();
    const [call] = await J.waitForCalls('/api/board/approve');
    assert.equal(call.method, 'POST');
    assert.deepEqual(call.body, { task: 5 });
    await J.waitForSpoken(/^Approved task 5\. The tweet is going out\.$/);
    const r = await J.text('#reply');
    assert.match(r, /YOU ›\s*APPROVE TASK 5/);
    assert.match(r, /Approved task 5\. The tweet is going out\./);
    assert.doesNotMatch(r, /offline mode/);
    assert.equal(J.callsTo('/api/chat').length, 0);
    assert.deepEqual(J.errors, []);
  } finally { await J.close(); }
});

test('REJECT and CLEAR DONE buttons → /api/board/reject and /api/board/clear', { timeout: 60000 }, async () => {
  const J = await env.open({ board: quietBoard() });
  try {
    await J.page.locator('#b-board button[data-act="reject"][data-id="5"]').click();
    const [rj] = await J.waitForCalls('/api/board/reject');
    assert.deepEqual(rj.body, { task: 5 });
    await J.page.locator('#clearBtn').click();
    const [cl] = await J.waitForCalls('/api/board/clear');
    assert.deepEqual(cl.body, {});
    assert.equal(J.callsTo('/api/chat').length, 0);
  } finally { await J.close(); }
});

test('spoken board notes: said once, in order, then POST /api/board/spoken {ids}', { timeout: 60000 }, async () => {
  const board = fixtureBoard(); // notes 11 and 12 are spoken:false
  assert.deepEqual(board.notes.filter((n) => !n.spoken).map((n) => n.id), [11, 12]);
  const J = await env.open({ board });
  try {
    const calls = await J.waitForCalls('/api/board/spoken', 2, 15000);
    assert.deepEqual(calls.map((c) => c.body), [{ ids: [11] }, { ids: [12] }]);
    const said = await J.spoken();
    const i11 = said.findIndex((s) => /^Task 4 is done\./.test(s)), i12 = said.findIndex((s) => /^Task 5 needs you\./.test(s));
    assert.ok(i11 >= 0 && i12 > i11, 'both notes spoken, in order: ' + JSON.stringify(said));
    assert.equal(said.filter((s) => /^Task 4 is done\./.test(s)).length, 1, 'a note is said only once');
    assert.equal(J.callsTo('/api/chat').length, 0, 'notes are not sent to the brain');
    assert.deepEqual(J.errors, []);
  } finally { await J.close(); }
});

test('MORNING BRIEF stays local and instant (no /api/chat)', { timeout: 60000 }, async () => {
  const J = await env.open({ board: quietBoard() });
  try {
    await J.page.click('#briefBtn');
    await J.page.waitForFunction(() => /Morning brief for Acme Notes/.test(document.querySelector('#reply').textContent), null, { timeout: 1000 });
    assert.match(await J.text('#reply'), /YOU ›\s*MORNING BRIEF/);
    await J.waitForSpoken(/^Morning brief for Acme Notes/, 2000);
    assert.equal(J.callsTo('/api/chat').length, 0);
  } finally { await J.close(); }
});

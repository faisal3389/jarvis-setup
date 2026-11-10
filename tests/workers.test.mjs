// v4: the worker list comes from data/workers.js (server-generated from workers.json). Header pills, board
// worker chips, board footer rows and telemetry colours are built from it; a built-in list of the 5 workers is
// used only when the file cannot load. The header must fit 5 and 8 workers at 1440x900 and 1280x800.
// Saves v4 screenshots to tests/output/.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, fixtureBoard, registryWorkers, fixtureWorkers } from './lib/harness.mjs';

let env;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });

const SIZES = [{ width: 1440, height: 900 }, { width: 1280, height: 800 }];
// The page's offline fallback must match these exactly (same ids, order and colours as the contract).
const FALLBACK = [
  ['scout', '#4de3ff'], ['operator', '#b892ff'], ['developer', '#5cf0d8'], ['researcher', '#ff8fd0'], ['tester', fixtureWorkers().find((w) => w.id === 'tester').color]
];
const EXTRA = [
  { id: 'designer', label: 'DESIGNER', color: '#ffa65c', summary: 'Mock-ups and image briefs for ads and posts.', output: 'outbox/design', extraBash: [] },
  { id: 'accountant', label: 'ACCOUNTANT', color: '#7aa2ff', summary: 'Bookkeeping checks on the mock ledgers.', output: 'outbox/books', extraBash: [] },
  { id: 'legal-review', label: 'LEGAL-REVIEW', color: '#ff6b8b', summary: 'Flags risky claims in drafts before they go out.', output: 'outbox/legal', extraBash: [] }
];

function quietBoard(extraTasks = [], extraReqs = []) {
  const b = fixtureBoard();
  b.notes.forEach((n) => { n.spoken = true; });
  b.requests.push(...extraReqs);
  b.tasks.push(...extraTasks);
  return b;
}
const task = (id, worker, status, title, extra = {}) => ({
  id, requestId: 4, title, detail: '', worker, status, dependsOn: [], result: null, files: [], approval: status === 'needs_you' ? { action: 'Approve: ' + title, decision: null } : null,
  log: [{ t: '2026-11-09T10:0' + (id % 10) + ':00-05:00', msg: title + ' — started' }], createdAt: '2026-11-09T10:05:00-05:00', updatedAt: '2026-11-09T10:05:00-05:00', ...extra
});
const REQ4 = { id: 4, text: 'more work for the new workers', from: 'text', status: 'working', reply: null, taskIds: [6, 7, 8], createdAt: '2026-11-09T10:05:00-05:00', updatedAt: '2026-11-09T10:05:00-05:00' };

const rgb = (hex) => 'rgb(' + [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ') + ')';

// Header pills as the page shows them.
function readPills(J) {
  return J.page.evaluate(() => [...document.querySelectorAll('#pills .pill')].map((p) => ({
    id: p.getAttribute('data-w'), domId: p.id, label: p.querySelector('.pn').textContent, s: p.getAttribute('data-s'),
    wc: p.style.getPropertyValue('--wc').trim(), color: getComputedStyle(p.querySelector('.pn')).color, title: p.title,
    badge: p.querySelector('.nb').hidden ? null : p.querySelector('.nb').textContent
  })));
}

// No page scroll, panels inside the window, and every header item fully visible, not overlapping, not cut.
async function checkHeaderFits(J, label) {
  const m = await J.page.evaluate(() => {
    const de = document.documentElement, vw = innerWidth, vh = innerHeight;
    const R = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
    const top = document.querySelector('#p-top'), hr = R(top);
    const items = [...top.querySelectorAll('.brand, .badge:not([hidden]), .clock')].map((el) => ({ k: el.className, ...R(el) }));
    const pills = [...document.querySelectorAll('#pills .pill')].map((p) => {
      const pn = p.querySelector('.pn'), nb = p.querySelector('.nb'), cs = getComputedStyle(p);
      return { id: p.getAttribute('data-w'), ...R(p), cut: pn.scrollWidth > pn.clientWidth + 1, shown: cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity !== 0, nb: nb.hidden ? null : R(nb) };
    });
    const out = (r) => r.b > vh + 0.5 || r.r > vw + 0.5 || r.l < -0.5 || r.t < -0.5;
    window.scrollTo(0, 400);
    return {
      vw, vh, scrollH: de.scrollHeight, scrollW: de.scrollWidth, bodyH: document.body.scrollHeight, scrollY: window.scrollY,
      offPanels: [...document.querySelectorAll('.panel')].filter((p) => out(R(p))).map((p) => p.id),
      topOverflow: top.scrollWidth - top.clientWidth, hr, items, pills,
      two: document.querySelector('#pills').classList.contains('two'),
      objW: top.querySelector('.objective-h').getBoundingClientRect().width
    };
  });
  assert.ok(m.scrollH <= m.vh && m.bodyH <= m.vh, `${label}: page is taller than the window (${m.scrollH}/${m.bodyH} > ${m.vh})`);
  assert.ok(m.scrollW <= m.vw, `${label}: page is wider than the window (${m.scrollW} > ${m.vw})`);
  assert.equal(m.scrollY, 0, `${label}: page scrolled`);
  assert.deepEqual(m.offPanels, [], `${label}: panels outside the window`);
  assert.ok(m.topOverflow <= 1, `${label}: header content overflows by ${m.topOverflow}px`);
  const inside = (r, box) => r.l >= box.l - 0.5 && r.r <= box.r + 0.5 && r.t >= box.t - 0.5 && r.b <= box.b + 0.5;
  const overlap = (a, b) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
  const view = { l: 0, t: 0, r: m.vw, b: m.vh };
  for (const p of m.pills) {
    assert.ok(p.shown && p.w > 20 && p.h > 8, `${label}: pill ${p.id} not shown ${JSON.stringify(p)}`);
    assert.ok(inside(p, m.hr), `${label}: pill ${p.id} sticks out of the header ${JSON.stringify(p)} vs ${JSON.stringify(m.hr)}`);
    assert.ok(!p.cut, `${label}: pill ${p.id} name is cut off`);
    if (p.nb) assert.ok(inside(p.nb, view), `${label}: needs-you badge of ${p.id} is outside the window`);
    for (const q of m.pills) if (q !== p) assert.ok(!overlap(p, q), `${label}: pills ${p.id} and ${q.id} overlap`);
    for (const it of m.items) assert.ok(!overlap(p, it), `${label}: pill ${p.id} overlaps ${it.k}`);
  }
  for (const it of m.items) assert.ok(inside(it, m.hr), `${label}: ${it.k} sticks out of the header`);
  return m;
}

test('(a) a pill for every worker in workers.js, in file order, with its colour + summary tooltip (tester included); board + footer + telemetry use the same list', { timeout: 90000 }, async () => {
  const reg = registryWorkers();
  assert.ok(reg.some((w) => w.id === 'tester'), 'the registry has a tester');
  for (const vp of SIZES) {
    const tag = `${vp.width}x${vp.height}`;
    const J = await env.open({ viewport: vp, board: quietBoard() });
    try {
      const pills = await readPills(J);
      assert.deepEqual(pills.map((p) => p.id), ['manager', ...reg.map((w) => w.id)], 'MANAGER first, then the workers in file order');
      assert.equal(await J.page.getAttribute('#pills', 'data-src'), 'registry');
      reg.forEach((w, i) => {
        const p = pills[i + 1];
        assert.equal(p.domId, 'pill-' + w.id);
        assert.equal(p.label, w.label);
        assert.equal(p.wc, w.color.toLowerCase(), `pill ${w.id} colour`);
        assert.equal(p.color, rgb(w.color), `pill ${w.id} name is drawn in its colour`);
        assert.ok(p.title.includes(w.summary), `pill ${w.id} tooltip has the summary: ${p.title}`);
      });
      // fixture board: operator task 5 needs you; manager has a working request
      assert.equal(pills.find((p) => p.id === 'operator').s, 'needs');
      assert.equal(pills.find((p) => p.id === 'operator').badge, '1');
      assert.equal(pills.find((p) => p.id === 'manager').s, 'working');
      assert.equal(pills.find((p) => p.id === 'tester').s, 'idle');

      // board footer: one row per worker, same order, same colours
      const crew = await J.page.$$eval('#b-crew .cn', (els) => els.map((e) => ({ id: e.getAttribute('data-w'), text: e.textContent, color: getComputedStyle(e).color })));
      assert.deepEqual(crew.map((c) => c.id), reg.map((w) => w.id));
      crew.forEach((c, i) => { assert.equal(c.text, reg[i].label); assert.equal(c.color, rgb(reg[i].color)); });
      assert.match(await J.text('#b-crew'), /TESTER\s*IDLE\s*last: T2 done/);

      // board worker chip of the tester task (in finished request 1 — open it)
      await J.page.click('#b-board .rq-done[data-id="1"]');
      const chip = await J.page.$eval('#b-board .tk[data-w="tester"] .tw', (e) => ({ text: e.textContent, color: getComputedStyle(e).color }));
      const tester = reg.find((w) => w.id === 'tester');
      assert.deepEqual(chip, { text: tester.label, color: rgb(tester.color) });

      // telemetry: task log prefixes use the label and the worker colour
      const tl = await J.page.$$eval('#b-tele .tl-row', (rows) => rows.map((r) => ({ tag: r.querySelector('.tr').textContent, color: getComputedStyle(r.querySelector('.tr')).color })));
      const t2 = tl.find((r) => r.tag === 'T2 ' + tester.label + ' ›');
      assert.ok(t2, 'telemetry has tester lines: ' + JSON.stringify(tl.map((r) => r.tag)));
      assert.equal(t2.color, rgb(tester.color));
      const scout = reg.find((w) => w.id === 'scout');
      assert.equal(tl.find((r) => r.tag === 'T4 ' + scout.label + ' ›').color, rgb(scout.color));

      await checkHeaderFits(J, tag + ' 5 workers');
      await J.page.click('#b-board .rq-done[data-id="1"]'); // collapse again for the screenshot
      await J.screenshot(`v4-workers5-${tag}.png`);
      assert.deepEqual(J.errors, [], `${tag}: console/page errors:\n${J.errors.join('\n')}`);
    } finally { await J.close(); }
  }
});

test('(a2) fixtures mode reads fixtures/workers.js (the 5 real workers)', { timeout: 60000 }, async () => {
  const J = await env.open({ fixtures: true });
  try {
    const pills = await readPills(J);
    assert.deepEqual(pills.map((p) => [p.id, p.wc]), [['manager', '#4de3ff'], ...fixtureWorkers().map((w) => [w.id, w.color])]);
    await checkHeaderFits(J, 'fixtures 1440x900');
    assert.deepEqual(J.errors, []);
  } finally { await J.close(); }
});

test('(a3) workers.js is re-read on every poll: a worker added or removed shows up without a reload', { timeout: 60000 }, async () => {
  const opts = { board: quietBoard(), workers: registryWorkers() };
  const J = await env.open(opts);
  try {
    opts.workers = [...registryWorkers(), EXTRA[0]];
    await J.page.waitForSelector('#pill-designer', { timeout: 8000 });
    assert.deepEqual((await readPills(J)).map((p) => p.id).slice(-2), ['tester', 'designer']);
    assert.match(await J.text('#b-crew'), /DESIGNER\s*IDLE\s*no tasks yet/);
    opts.workers = registryWorkers().filter((w) => w.id !== 'researcher');
    await J.page.waitForSelector('#pill-designer', { state: 'detached', timeout: 8000 });
    await J.page.waitForSelector('#pill-researcher', { state: 'detached', timeout: 8000 });
    // researcher task 3 is still on the board: it keeps rendering (neutral colour, uppercase id)
    await J.page.click('#b-board .rq-done[data-id="2"]');
    assert.equal(await J.page.$eval('#b-board .tk[data-w="researcher"] .tw', (e) => e.textContent), 'RESEARCHER');
    assert.deepEqual(J.errors, []);
  } finally { await J.close(); }
});

for (const vp of SIZES) {
  const tag = `${vp.width}x${vp.height}`;
  test(`(b) 8 workers fit the header at ${tag}: no page scroll, every pill fully visible`, { timeout: 60000 }, async () => {
    const eight = [...registryWorkers(), ...EXTRA];
    assert.equal(eight.length, 8);
    const board = quietBoard([
      task(6, 'designer', 'working', 'Mock up the spring promo banner'),
      task(7, 'legal-review', 'needs_you', 'Check the promo claims'),
      task(8, 'accountant', 'queued', 'Reconcile October refunds', { dependsOn: [6] })
    ], [REQ4]);
    const J = await env.open({ viewport: vp, board, workers: eight });
    try {
      const pills = await readPills(J);
      assert.deepEqual(pills.map((p) => p.id), ['manager', ...eight.map((w) => w.id)]);
      eight.forEach((w, i) => assert.equal(pills[i + 1].color, rgb(w.color), `pill ${w.id} colour`));
      assert.equal(pills.find((p) => p.id === 'designer').s, 'working');
      assert.equal(pills.find((p) => p.id === 'legal-review').s, 'needs');
      assert.equal(pills.find((p) => p.id === 'legal-review').badge, '1');
      assert.equal(pills.find((p) => p.id === 'manager').badge, '2');
      const m = await checkHeaderFits(J, tag + ' 8 workers');
      assert.ok(m.objW >= 120, `${tag}: the current objective keeps some room (${m.objW}px)`);
      // read left→right, top→bottom, the pills are in file order
      const reading = [...m.pills].sort((a, b) => (Math.abs(a.t - b.t) > 4 ? a.t - b.t : a.l - b.l)).map((p) => p.id);
      assert.deepEqual(reading, ['manager', ...eight.map((w) => w.id)], `${tag}: visual reading order`);
      assert.equal((await J.page.$$('#b-crew .cn')).length, 8);
      assert.equal(await J.page.$eval('#b-board .tk[data-w="legal-review"] .tw', (e) => getComputedStyle(e).color), rgb('#ff6b8b'));
      await J.screenshot(`v4-workers8-${tag}.png`);
      await J.page.screenshot({ path: J.outPath(`v4-header8-${tag}.png`), clip: { x: 0, y: 0, width: vp.width, height: 70 } });
      assert.deepEqual(J.errors, [], `${tag}: console/page errors:\n${J.errors.join('\n')}`);
    } finally { await J.close(); }
  });
}

test('(b2) worst case: 8 workers + FIXTURES badge at 1280x800 still fits', { timeout: 60000 }, async () => {
  const J = await env.open({ fixtures: true, viewport: { width: 1280, height: 800 }, workers: [...registryWorkers(), ...EXTRA] });
  try {
    assert.equal((await readPills(J)).length, 9);
    await checkHeaderFits(J, 'fixtures 8 workers 1280x800');
    assert.deepEqual(J.errors, []);
  } finally { await J.close(); }
});

test('(c) workers.js 404 → the built-in 5 workers render with the contract colours', { timeout: 60000 }, async () => {
  const J = await env.open({ board: quietBoard(), workers: null });
  try {
    const pills = await readPills(J);
    assert.deepEqual(pills.map((p) => [p.id, p.wc]), [['manager', '#4de3ff'], ...FALLBACK]);
    pills.slice(1).forEach((p, i) => assert.equal(p.color, rgb(FALLBACK[i][1])));
    assert.equal(await J.page.getAttribute('#pills', 'data-src'), 'fallback');
    assert.deepEqual(await J.page.$$eval('#b-crew .cn', (els) => els.map((e) => e.getAttribute('data-w'))), FALLBACK.map((f) => f[0]));
    await checkHeaderFits(J, 'fallback 1440x900');
    // only the expected 404 log line(s), no page errors
    assert.ok(J.errors.every((e) => /Failed to load resource.*404/.test(e)), J.errors.join('\n'));
  } finally { await J.close(); }
});

test('(d) a board task for an unknown worker renders without errors (neutral colour, uppercase id)', { timeout: 60000 }, async () => {
  const board = quietBoard([
    task(6, 'ghost', 'working', 'An old task for a removed worker'),
    task(7, 'SCOUT ', 'queued', 'Upper-case worker id still maps to scout'),
    task(8, undefined, 'queued', 'Task with no worker'),
    task(9, '<img src=x onerror="window.__xss=1">', 'queued', 'Hostile worker id')
  ], [{ ...REQ4, taskIds: [6, 7, 8, 9] }]);
  const J = await env.open({ board });
  try {
    const ghost = await J.page.$eval('#b-board .tk[data-w="ghost"] .tw', (e) => ({ text: e.textContent, color: getComputedStyle(e).color }));
    assert.deepEqual(ghost, { text: 'GHOST', color: rgb('#8fa6ba') });
    const scout = registryWorkers().find((w) => w.id === 'scout');
    assert.equal(await J.page.$eval('#b-board .tk[data-w="scout"] .tw', (e) => getComputedStyle(e).color), rgb(scout.color));
    assert.equal(await J.page.$$eval('#b-board .tk .tw', (els) => els.filter((e) => e.textContent === 'TASK').length), 1, 'no worker → "TASK"');
    assert.equal(await J.page.$$eval('#b-board img', (els) => els.length), 0, 'worker ids are escaped');
    assert.equal(await J.page.evaluate(() => window.__xss), undefined);
    assert.doesNotMatch(await J.text('#b-board'), /DATA FORMAT ERROR/);
    assert.doesNotMatch(await J.text('#b-tele'), /DATA FORMAT ERROR/);
    const tl = await J.page.$$eval('#b-tele .tl-row .tr', (els) => els.map((e) => ({ tag: e.textContent, color: getComputedStyle(e).color })));
    assert.deepEqual(tl.find((r) => r.tag === 'T6 GHOST ›'), { tag: 'T6 GHOST ›', color: rgb('#8fa6ba') });
    // no pill for an unknown worker; the header still lists the registry
    assert.deepEqual((await readPills(J)).map((p) => p.id), ['manager', ...registryWorkers().map((w) => w.id)]);
    assert.deepEqual(J.errors, [], J.errors.join('\n'));
  } finally { await J.close(); }
});

// Layout: the HUD fits the window with no page scroll, nothing important is cut off, and the
// page logs zero console/page errors (fixtures mode). Saves v3 screenshots to tests/output/.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, deferred } from './lib/harness.mjs';

let env;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });

const SIZES = [{ width: 1440, height: 900 }, { width: 1280, height: 800 }];

async function checkFits(J, label) {
  const m = await J.page.evaluate(() => {
    const de = document.documentElement, vw = innerWidth, vh = innerHeight;
    const out = (el) => { const r = el.getBoundingClientRect(); return r.bottom > vh + 0.5 || r.right > vw + 0.5 || r.left < -0.5 || r.top < -0.5; };
    const truncated = ['#vnote', '#orbHint', '#boardHint', '#ps-reply', '#orbState', '#waveState']
      .filter((s) => { const el = document.querySelector(s); return el && el.scrollWidth > el.clientWidth + 1; });
    window.scrollTo(0, 400);
    return {
      scrollH: de.scrollHeight, scrollW: de.scrollWidth, bodyH: document.body.scrollHeight, vw, vh, scrollY: window.scrollY,
      offPanels: [...document.querySelectorAll('.panel')].filter(out).map((p) => p.id),
      truncated
    };
  });
  assert.ok(m.scrollH <= m.vh && m.bodyH <= m.vh, `${label}: page is taller than the window (${m.scrollH}/${m.bodyH} > ${m.vh})`);
  assert.ok(m.scrollW <= m.vw, `${label}: page is wider than the window (${m.scrollW} > ${m.vw})`);
  assert.equal(m.scrollY, 0, `${label}: page scrolled`);
  assert.deepEqual(m.offPanels, [], `${label}: panels outside the window`);
  assert.deepEqual(m.truncated, [], `${label}: hint text cut off`);
}

for (const vp of SIZES) {
  const tag = `${vp.width}x${vp.height}`;
  test(`layout ${tag}: no page scroll, nothing cut off, zero errors (fixtures)`, { timeout: 60000 }, async () => {
    const hold = deferred();
    const J = await env.open({
      fixtures: true, viewport: vp,
      api: {
        '/api/chat': async ({ body }) => {
          if (/hold/.test(body.text)) await hold.promise;
          return { ok: true, say: "On it. I've handed that to the Manager — that's request 4. I'll tell you when the draft is ready.", action: { type: 'new_request', text: body.text }, requestId: 4, ms: 2900 };
        }
      }
    });
    try {
      await checkFits(J, tag + ' booted');
      assert.match(await J.text('#vnote'), /TALK TO ME NORMALLY — SAY “JARVIS, …”/);
      assert.match(await J.text('#boardHint'), /TALK TO ME NORMALLY/);

      // THINKING state while the brain works
      await J.ask('hold on, research what Notely charges and draft a comparison');
      await J.page.waitForFunction(() => document.body.getAttribute('data-voice') === 'thinking');
      await checkFits(J, tag + ' thinking');
      await J.screenshot(`v3-thinking-${tag}.png`);
      hold.resolve();

      // the answer + action line
      await J.page.waitForSelector('#reply .act');
      assert.equal((await J.text('#reply .act')).trim(), '→ MANAGER · request 4');
      const act = await J.page.evaluate(() => {
        const el = document.querySelector('#reply .act'), a = el.getBoundingClientRect(), r = document.querySelector('#reply').getBoundingClientRect();
        return { visible: a.top >= r.top - 0.5 && a.bottom <= r.bottom + 0.5, cut: el.scrollWidth > el.clientWidth + 1, a: [a.top, a.bottom], r: [r.top, r.bottom] };
      });
      assert.ok(act.visible, `${tag}: action line is not visible inside the reply box ${JSON.stringify(act)}`);
      assert.ok(!act.cut, `${tag}: action line text is cut off`);
      // the answer itself starts in view (scrolled to the top)
      assert.equal(await J.page.evaluate(() => document.querySelector('#reply').scrollTop), 0);
      await checkFits(J, tag + ' reply');
      await J.screenshot(`v3-${tag}.png`);

      assert.deepEqual(J.errors, [], `${tag}: console/page errors:\n${J.errors.join('\n')}`);
    } finally { hold.resolve(); await J.close(); }
  });
}

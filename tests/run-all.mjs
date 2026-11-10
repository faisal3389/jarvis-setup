#!/usr/bin/env node
// Runs every tests/*.test.mjs (one at a time, each in its own Node process) and exits non-zero on any failure.
//   npm test                      all files
//   node tests/run-all.mjs chat   only files whose name contains "chat"
// Browser: PLAYWRIGHT_CHROMIUM_PATH if set, else Playwright's default Chromium.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const filters = process.argv.slice(2);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.mjs') && (!filters.length || filters.some((x) => f.includes(x)))).sort();
if (!files.length) { console.error('No test files matched.'); process.exit(1); }

function runFile(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--test', '--test-reporter=spec', path.join(dir, file)], { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    let out = '';
    child.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
    child.stderr.on('data', (d) => { out += d; process.stderr.write(d); });
    child.on('close', (code) => {
      const num = (k) => { const m = new RegExp('^\\S*\\s*' + k + ' (\\d+)', 'm').exec(out); return m ? Number(m[1]) : 0; };
      resolve({ file, code, pass: num('pass'), fail: num('fail') + num('cancelled') });
    });
  });
}

const t0 = Date.now(), results = [];
for (const f of files) {
  console.log(`\n=== ${f} ===`);
  results.push(await runFile(f));
}
let pass = 0, fail = 0, bad = false;
console.log('\n=== summary ===');
for (const r of results) {
  pass += r.pass; fail += r.fail;
  if (r.code !== 0) bad = true;
  console.log(`${r.code === 0 ? 'PASS' : 'FAIL'}  ${r.file}  (${r.pass} passed, ${r.fail} failed${r.code !== 0 && !r.fail ? ', exit ' + r.code : ''})`);
}
console.log(`\n${pass} passed, ${fail} failed in ${((Date.now() - t0) / 1000).toFixed(1)}s · screenshots: tests/output/`);
process.exit(bad || fail ? 1 : 0);

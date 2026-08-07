#!/usr/bin/env node
/**
 * shot.js — render + critique harness, fable-25 style, backed by playwright-cli.
 *
 * Usage:
 *   node tools/shot.js <url> <outdir>
 *
 * Opens <url> in a headless browser, renders it in desktop (1440×900) and
 * mobile (390×844) viewports, scrolls top / mid / bottom, saves screenshots
 * to <outdir>, and reports console errors + document heights.
 *
 * Prints a JSON report:
 *   { url, docHeight, mobileDocHeight, shots: [...], errors: [...] }
 */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const url = process.argv[2];
const outdir = path.resolve(process.argv[3] || '.');
if (!url) {
  console.error('usage: node shot.js <url> <outdir>');
  process.exit(1);
}
fs.mkdirSync(outdir, { recursive: true });

const SESSION = 'shot' + Date.now().toString(36);

function cli(...args) {
  return execFileSync('playwright-cli', ['-s=' + SESSION, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// `run-code --json` → { result: "<stringified JSON>" } → parsed value
function evalOnPage(fnBody) {
  const out = cli('run-code', '--json', fnBody);
  const m = out.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no JSON in run-code output:\n' + out);
  const parsed = JSON.parse(m[0]);
  try {
    return JSON.parse(parsed.result);
  } catch (e) {
    throw new Error('run-code result not JSON (' + e.message + ')\nRAW OUT:\n' + out + '\nCODE:\n' + fnBody);
  }
}

const QA = `
async (page) => {
  const shots = [];
  const wait = (ms) => page.waitForTimeout(ms);
  const scroll = async (y) => { await page.evaluate((v) => window.scrollTo(0, v), y); await wait(900); };
  const shot = async (name) => { const p = ${JSON.stringify(outdir)} + '/' + name; await page.screenshot({ path: p }); shots.push(name); };

  // Desktop pass
  await page.setViewportSize({ width: 1440, height: 900 });
  await wait(1600);
  const docHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  await scroll(0);      await shot('desktop-top.png');
  await scroll(Math.floor(docHeight / 2)); await shot('desktop-mid.png');
  await scroll(docHeight); await shot('desktop-bottom.png');

  // Mobile pass
  await page.setViewportSize({ width: 390, height: 844 });
  await wait(1000);
  const mobileDocHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  await scroll(0);      await shot('mobile-top.png');
  await scroll(mobileDocHeight); await shot('mobile-bottom.png');

  return { docHeight, mobileDocHeight, shots };
}
`;

const report = { url, docHeight: 0, mobileDocHeight: 0, shots: [], errors: [] };
try {
  cli('open', url);
  const r = evalOnPage(QA);
  report.docHeight = r.docHeight;
  report.mobileDocHeight = r.mobileDocHeight;
  report.shots = r.shots || [];
  const c = cli('console', 'error');
  const m = c.match(/Errors:\s*(\d+)/);
  const n = m ? Number(m[1]) : NaN;
  if (n > 0) {
    report.errors = c.split('\n').filter((l) => l.trim()).slice(0, 30);
  }
} catch (e) {
  report.errors = ['HARNESS: ' + e.message];
} finally {
  try { cli('close'); } catch (_) { /* browser may already be gone */ }
}

console.log(JSON.stringify(report, null, 2));

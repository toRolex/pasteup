#!/usr/bin/env node
/**
 * audit.js — 程序化「看」截图：DOM 几何 + canvas 像素（湿边验证）+ 字体/对比度。
 * 用法: node review/audit.js <url>
 */
'use strict';
const { execFileSync } = require('child_process');
const url = process.argv[2] || 'http://localhost:8451/';
const SESSION = 'audit' + Date.now().toString(36);

function cli(...args) {
  return execFileSync('playwright-cli', ['-s=' + SESSION, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function evalOnPage(fnBody) {
  const out = cli('run-code', '--json', fnBody);
  const m = out.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no JSON in run-code output:\n' + out);
  const parsed = JSON.parse(m[0]);
  return JSON.parse(parsed.result);
}

const AUDIT = `
async (page) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(${JSON.stringify(url)});
  await page.waitForTimeout(1800);
  return await page.evaluate(() => {
    const gs = (el) => el ? getComputedStyle(el) : null;
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    const topbar = document.querySelector('.topbar');
    const railL = document.querySelector('.rail-left');
    const railR = document.querySelector('.rail-right');
    const stage = document.querySelector('.stage');
    const art = document.querySelector('.artboard');
    const pieces = Array.from(document.querySelectorAll('.piece')).map((el) => ({
      id: el.dataset.id, rect: r(el),
      selected: el.classList.contains('is-selected'),
      cssFilter: gs(el.querySelector('canvas')).filter,
    }));

    // 纸片 canvas 湿边分析（读位图，不含 CSS 滤镜）
    const wet = pieces.map((p) => {
      const cv = document.querySelector('.piece[data-id="' + p.id + '"] .pc');
      if (!cv || !cv.width) return null;
      const ctx = cv.getContext('2d');
      const W = cv.width, H = cv.height;
      const img = ctx.getImageData(0, 0, W, H).data;
      function bboxFor(alphaThresh) {
        let minX = W, minY = H, maxX = -1, maxY = -1, n = 0;
        for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
          if (img[(y * W + x) * 4 + 3] > alphaThresh) {
            n++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
        }
        return n ? [minX, minY, maxX, maxY] : null;
      }
      const outer = bboxFor(3);    // 最外：渗开的晕染
      const core = bboxFor(160);   // 核心不透明区
      let halo = 0;
      if (outer && core) {
        const ox = (outer[2] - outer[0]), oy = (outer[3] - outer[1]);
        const cx = (core[2] - core[0]), cy = (core[3] - core[1]);
        halo = +Math.max((ox - cx) / 2, (oy - cy) / 2).toFixed(1);
      }
      // 湿边像素占比：半透明像素 / 非透明像素
      let soft = 0, solid = 0;
      for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
        const a = img[(y * W + x) * 4 + 3];
        if (a > 0) { if (a > 220) solid++; else if (a >= 20) soft++; }
      }
      const wetRatio = +(soft / Math.max(1, solid + soft)).toFixed(2);
      // 色边：晕染带内比核心更深的像素比例（按亮度）
      const mid = core ? Math.floor((core[1] + core[3]) / 2) : 0;
      const lumAt = (x, y) => { const i = (y * W + x) * 4; return 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2]; };
      let coreLum = 0, cn = 0;
      if (core) for (let y = core[1] + 4; y <= core[3] - 4; y += 4) for (let x = core[0] + 4; x <= core[2] - 4; x += 4) { coreLum += lumAt(x, y); cn++; }
      coreLum = coreLum / Math.max(1, cn);
      let darkEdge = 0, edgePix = 0;
      if (outer) for (let y = outer[1]; y <= Math.max(outer[1], outer[3]); y += 2) {
        for (let x = outer[0]; x <= outer[2]; x += 2) {
          const a = img[(y * W + x) * 4 + 3];
          if (a > 30 && a < 230) { edgePix++; if (lumAt(x, y) < coreLum - 22) darkEdge++; }
        }
      }
      const darkEdgeRatio = edgePix ? +(darkEdge / edgePix).toFixed(2) : 0;
      const colors = new Set();
      for (let i = 0; i < img.length; i += 4 * 40) {
        if (img[i + 3] > 40) colors.add((img[i] >> 4) + ',' + (img[i + 1] >> 4) + ',' + (img[i + 2] >> 4));
      }
      return { id: p.id, halo, wetRatio, darkEdgeRatio, distinctColorBuckets: colors.size, w: cv.width, h: cv.height, coreBbox: core, outerBbox: outer };
    });

    // 背景是否非均匀（有晕染斑）
    const bg = document.querySelector('#bgCanvas');
    let bgUniform = null;
    if (bg && bg.width) {
      const ctx = bg.getContext('2d');
      const img = ctx.getImageData(0, 0, bg.width, bg.height).data;
      let sum = 0, n = 0, vals = [];
      for (let y = 0; y < bg.height; y += 6) for (let x = 0; x < bg.width; x += 6) {
        const i = (y * bg.width + x) * 4;
        const lum = 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2];
        sum += lum; vals.push(lum); n++;
      }
      const mean = sum / n;
      const sd = Math.sqrt(vals.reduce((a, v) => a + (v - mean) * (v - mean), 0) / n);
      bgUniform = +sd.toFixed(1);
    }

    // 字体
    const fonts = {
      brush: document.fonts.check('26px "Liu Jian Mao Cao"'),
      note: document.fonts.check('16px "Ma Shan Zheng"'),
      en: document.fonts.check('17px "Caveat"'),
      ui: document.fonts.check('13px "Nunito"'),
    };

    // 对比度（文本前景/背景）
    function lum(c) {
      const p = parseInt(c.slice(1), 16);
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f((p >> 16) & 255) + 0.7152 * f((p >> 8) & 255) + 0.0722 * f(p & 255);
    }
    function contrast(a, b) { const l1 = lum(a), l2 = lum(b); return +((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2); }
    const contrastCheck = {
      ink_on_paper: contrast('#2C2A26', '#F8F5EC'),
      soft_on_paper: contrast('#5A5348', '#F8F5EC'),
      faint_on_paper: contrast('#756B5D', '#F8F5EC'),
      indigo_on_paper: contrast('#3B5B92', '#F8F5EC'),
    };

    return {
      viewport: { w: innerWidth, h: innerHeight },
      topbar: { rect: r(topbar), bg: gs(topbar).backgroundColor },
      railLeft: { rect: r(railL), w: railL.offsetWidth },
      railRight: { rect: r(railR), w: railR.offsetWidth },
      stage: r(stage),
      artboard: r(art),
      pieces, wet, bgUniform, fonts, contrastCheck,
      swatchCount: document.querySelectorAll('.swatch').length,
      toolCount: document.querySelectorAll('.tool').length,
      textureCount: document.querySelectorAll('.texture-tile').length,
      layerCount: document.querySelectorAll('.layer-item').length,
      hasError: window.__err ? true : false,
    };
  }).then(async (desktop) => {
    // 移动端第二遍
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(900);
    const mobile = await page.evaluate(() => {
      const gs = (el) => el ? getComputedStyle(el) : null;
      const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
      const railL = document.querySelector('.rail-left');
      const railR = document.querySelector('.rail-right');
      const mSw = document.querySelector('.mobile-swatches');
      const art = document.querySelector('.artboard');
      const pieces = Array.from(document.querySelectorAll('.piece')).map((el) => {
        const b = el.getBoundingClientRect();
        return { id: el.dataset.id, rect: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } };
      });
      return {
        railLeft: { display: gs(railL).display, pos: gs(railL).position, rect: r(railL) },
        railRight: { display: gs(railR).display },
        mobileSwatches: { display: gs(mSw).display, rect: r(mSw) },
        artboard: r(art),
        pieces,
        scrollW: document.documentElement.scrollWidth,
      };
    });
    return { desktop, mobile };
  });
}
`;

const report = {};
try {
  cli('open', url);
  report.data = evalOnPage(AUDIT);
} catch (e) {
  report.error = 'HARNESS: ' + e.message;
} finally {
  try { cli('close'); } catch (_) {}
}
console.log(JSON.stringify(report, null, 2));

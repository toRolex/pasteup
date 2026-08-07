/* pasteup · 03 摊开的手帐本 —— 交互脚本 */
(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── 逐字浮现 ─────────────────────────────── */
  document.querySelectorAll('.reveal').forEach((el) => {
    const text = el.textContent.trim();
    if (!text) return;
    el.setAttribute('aria-label', text);
    el.textContent = '';
    const frag = document.createDocumentFragment();
    for (const ch of text) {
      const s = document.createElement('span');
      s.className = 'ch';
      s.textContent = ch === ' ' ? ' ' : ch;
      frag.appendChild(s);
    }
    el.appendChild(frag);
    if (reduceMotion) return;
    requestAnimationFrame(() => {
      [...el.children].forEach((s, i) => {
        s.style.transitionDelay = i * 42 + 'ms';
        s.classList.add('ch--show');
      });
    });
  });

  /* ── 工具选择 ─────────────────────────────── */
  document.querySelectorAll('.tool-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tool-btn').forEach((b) => {
        b.classList.remove('is-active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('is-active');
      btn.setAttribute('aria-pressed', 'true');
    });
  });

  /* ── 图层选择（联动画布选中纸片） ─────────── */
  const layerMap = {
    base: '.piece-photo',
    leaf: '.piece-leaf',
    moss: '.piece-moss',
    tag: '.piece-tag',
  };

  function setActivePiece(piece) {
    document.querySelectorAll('.piece').forEach((p) => p.classList.remove('is-active'));
    piece.classList.add('is-active');
    const d = piece.dataset;
    setProps(d.name, d.pos, d.rot, d.scale, d.op);
  }

  function setProps(name, pos, rot, scale, op) {
    const pairs = [
      ['prop-name', name],
      ['prop-pos', pos],
      ['prop-rot', rot],
      ['prop-scale', scale],
      ['prop-op', op],
    ];
    pairs.forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = val;
      if (reduceMotion) return;
      el.classList.remove('flip');
      void el.offsetWidth;
      el.classList.add('flip');
    });
  }

  document.querySelectorAll('.layer-row').forEach((row) => {
    row.addEventListener('click', () => {
      document.querySelectorAll('.layer-row').forEach((r) => r.classList.remove('is-active'));
      row.classList.add('is-active');
      const sel = layerMap[row.dataset.layer];
      if (sel) {
        const piece = document.querySelector(sel);
        if (piece) setActivePiece(piece);
      }
    });
  });

  /* ── 画布纸片点击 → 选中 + 属性联动 ───────── */
  document.querySelectorAll('.piece').forEach((p) => {
    p.addEventListener('click', () => setActivePiece(p));
  });

  /* ── 色板选择 → 给选中的纸片着色 ──────────── */
  const pickNote = document.getElementById('pick-note');
  const leafShape = document.querySelector('.leaf-shape');
  const leafVeins = document.querySelector('.leaf-veins');

  function darken(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * f);
    const g = Math.round(((n >> 8) & 255) * f);
    const b = Math.round((n & 255) * f);
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  document.querySelectorAll('.swatch').forEach((s) => {
    s.addEventListener('click', () => {
      document.querySelectorAll('.swatch').forEach((x) => {
        x.classList.remove('is-active');
        x.setAttribute('aria-pressed', 'false');
      });
      s.classList.add('is-active');
      s.setAttribute('aria-pressed', 'true');
      const name = s.dataset.name || '';
      const sw = getComputedStyle(s).getPropertyValue('--sw').trim();
      if (leafShape && sw) {
        leafShape.style.fill = sw;
        if (leafVeins) leafVeins.style.stroke = darken(sw, 0.7);
      }
      if (!pickNote) return;
      pickNote.textContent = '你选了「' + name + '」· 给枫叶上了新色';
      if (reduceMotion) return;
      pickNote.classList.remove('pop');
      void pickNote.offsetWidth;
      pickNote.classList.add('pop');
    });
  });

  /* ── 纹理选择 → 联动苔绿纸片 ──────────────── */
  const mossPiece = document.querySelector('.piece-moss');
  document.querySelectorAll('.tex').forEach((t) => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tex').forEach((x) => {
        x.classList.remove('is-active');
        x.setAttribute('aria-pressed', 'false');
      });
      t.classList.add('is-active');
      t.setAttribute('aria-pressed', 'true');
      if (mossPiece) {
        const map = { 水彩: 'wc', 颗粒: 'grain', 纤维: 'fiber', 折痕: 'fold' };
        mossPiece.dataset.tex = map[t.dataset.tex] || 'grain';
        mossPiece.classList.remove('is-active');
        void mossPiece.offsetWidth;
        mossPiece.classList.add('is-active');
      }
    });
  });

  /* ── 便签待办：打勾 ───────────────────────── */
  document.querySelectorAll('.note-left .note-list li').forEach((li) => {
    li.setAttribute('role', 'button');
    li.setAttribute('tabindex', '0');
    li.setAttribute('aria-pressed', 'false');
    const toggle = () => {
      const done = li.classList.toggle('done');
      li.setAttribute('aria-pressed', String(done));
    };
    li.addEventListener('click', toggle);
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  });

  /* ── 导出图章 ─────────────────────────────── */
  const exportBtn = document.getElementById('export-btn');
  const stamp = document.getElementById('stamp');
  if (exportBtn && stamp) {
    let stampTimer = null;
    exportBtn.addEventListener('click', () => {
      stamp.classList.remove('stamped');
      void stamp.offsetWidth;
      stamp.classList.add('stamped');
      clearTimeout(stampTimer);
      stampTimer = setTimeout(() => stamp.classList.remove('stamped'), 3200);
    });
  }
})();

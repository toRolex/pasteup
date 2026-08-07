/* ═══════════════════════════════════════════════════════════════════
   pasteup · 深夜拼贴桌 (06 NIGHT DESK)
   台灯光锥 + 纸片光照响应 + 夜景照片程序生成
   ═══════════════════════════════════════════════════════════════════ */
(() => {
  "use strict";

  const app = document.getElementById("app");
  const stage = document.getElementById("stage");
  const lampToggle = document.getElementById("lampToggle");
  const lampToggleLabel = document.getElementById("lampToggleLabel");
  const lightResp = document.getElementById("lightResp");
  const lightRespLabel = document.getElementById("lightRespLabel");
  const liveStatus = document.getElementById("liveStatus");
  const papers = Array.from(document.querySelectorAll(".paper"));

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── 程序生成「夜色照片」底图 ── */
  function drawNightPhoto() {
    const cv = document.querySelector(".night-photo");
    if (!cv || !cv.getContext) return;
    const ctx = cv.getContext("2d");
    const w = cv.width;
    const h = cv.height;

    // 夜空：深蓝到暗靛
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#0C1220");
    sky.addColorStop(0.6, "#131B2B");
    sky.addColorStop(1, "#1A2336");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // 星点
    let seed = 17;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    ctx.fillStyle = "rgba(226, 236, 250, 0.85)";
    for (let i = 0; i < 46; i++) {
      const x = rnd() * w;
      const y = rnd() * h * 0.62;
      const r = rnd() * 0.8 + 0.25;
      ctx.globalAlpha = 0.18 + rnd() * 0.6;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 月亮 + 光晕
    const mx = w * 0.72;
    const my = h * 0.26;
    const glow = ctx.createRadialGradient(mx, my, 2, mx, my, 26);
    glow.addColorStop(0, "rgba(214, 226, 245, 0.9)");
    glow.addColorStop(0.4, "rgba(214, 226, 245, 0.18)");
    glow.addColorStop(1, "rgba(214, 226, 245, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(mx - 30, my - 30, 60, 60);
    ctx.fillStyle = "#DEE9F7";
    ctx.beginPath();
    ctx.arc(mx, my, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(170, 186, 214, 0.6)";
    ctx.beginPath();
    ctx.arc(mx - 2, my - 1, 2, 0, Math.PI * 2);
    ctx.fill();

    // 远山剪影
    ctx.fillStyle = "#0E1522";
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, h * 0.72);
    for (let x = 0; x <= w; x += 6) {
      ctx.lineTo(x, h * 0.72 - Math.sin(x * 0.045 + 1.4) * 9 - Math.cos(x * 0.11) * 4);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // 湖边反光
    ctx.fillStyle = "rgba(30, 40, 62, 0.9)";
    ctx.fillRect(0, h - 14, w, 14);
    ctx.fillStyle = "rgba(216, 228, 246, 0.14)";
    for (let i = 0; i < 9; i++) {
      const yy = h - 4 - i * 2.2;
      const ll = 5 + i * 2.4;
      ctx.fillRect(mx - ll / 2, yy, ll, 1.1);
    }
  }

  /* ── 光照响应引擎 ── */
  let lampOn = true;
  let respond = true;

  function smooth(t) {
    // smoothstep：自定义缓动，光随距离平滑衰减
    const x = Math.min(1, Math.max(0, t));
    return x * x * (3 - 2 * x);
  }

  function applyLight() {
    const sr = stage.getBoundingClientRect();
    if (!sr || sr.width === 0) return;
    // 光源 = 光锥的最亮带（径向 gradient 的峰值位置），用舞台相对坐标，
    // 与纸片中心坐标同系，这样纸片的明暗与真实光锥落点一致。
    const lx = sr.width * 0.5;
    const ly = sr.height * 0.36;
    const R = Math.max(220, sr.width * 0.42);

    for (const p of papers) {
      const pb = p.getBoundingClientRect();
      const px = pb.left - sr.left + pb.width / 2;
      const py = pb.top - sr.top + pb.height / 2;
      const d = Math.hypot(px - lx, py - ly);
      let lit = smooth(1 - d / R);
      if (!respond) lit = 0.5;
      if (!lampOn) lit *= 0.32;
      p.style.setProperty("--lit", lit.toFixed(3));
      p.dataset.lamp = lampOn ? "on" : "off";
    }
  }

  function setLamp(on, announce) {
    lampOn = on;
    app.classList.toggle("lamp-off", !on);
    lampToggle.setAttribute("aria-checked", String(on));
    lampToggleLabel.textContent = on ? "台灯" : "台灯关";
    lightRespLabel.textContent = respond ? "灯下会亮" : "光照固定";
    if (announce) {
      liveStatus.textContent = on ? "台灯已打开，光锥内的纸片亮起" : "台灯已关闭，纸片沉入夜色";
    }
    applyLight();
  }

  lampToggle.addEventListener("click", () => {
    setLamp(!lampOn, true);
  });

  lightResp.addEventListener("click", () => {
    respond = !respond;
    lightResp.setAttribute("aria-checked", String(respond));
    lightRespLabel.textContent = respond ? "灯下会亮" : "光照固定";
    app.classList.toggle("no-respond", !respond);
    liveStatus.textContent = respond ? "已开启光照响应" : "已关闭光照响应";
    applyLight();
  });

  let raf = 0;
  function requestApply() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(applyLight);
  }

  window.addEventListener("resize", requestApply);

  /* ── 台灯开合：点击画布上的灯头也可开关 ── */
  const lampHeadEl = document.querySelector(".lamp-head");
  if (lampHeadEl) {
    lampHeadEl.style.cursor = "pointer";
    lampHeadEl.addEventListener("click", (e) => {
      e.stopPropagation();
      setLamp(!lampOn, true);
    });
  }

  /* ── 纸片拖拽：拖入光锥亮、拖出暗 —— 直接证明「光照方向」 ── */
  const drag = {
    paper: null,
    dx: 0, dy: 0,
    sx: 0, sy: 0,
    lx: 0, ly: 0,
  };

  function onDragStart(e) {
    const paper = e.currentTarget;
    if (e.button !== undefined && e.button !== 0 && e.pointerType === "mouse") return;
    if (e.target.closest(".layer-ctrl")) return;
    const sr = stage.getBoundingClientRect();
    const pr = paper.getBoundingClientRect();
    drag.paper = paper;
    drag.sx = e.clientX;
    drag.sy = e.clientY;
    drag.lx = pr.left - sr.left;
    drag.ly = pr.top - sr.top;
    paper.setPointerCapture(e.pointerId);
    paper.classList.add("dragging");
    e.preventDefault();
  }
  function onDragMove(e) {
    if (!drag.paper) return;
    const sr = stage.getBoundingClientRect();
    let nx = drag.lx + (e.clientX - drag.sx);
    let ny = drag.ly + (e.clientY - drag.sy);
    // 限制在桌面范围内（允许小许出界，模拟纸片悬在桌沿）
    const slack = 40;
    nx = Math.max(-slack, Math.min(sr.width - drag.paper.getBoundingClientRect().width + slack, nx));
    ny = Math.max(-slack, Math.min(sr.height - drag.paper.getBoundingClientRect().height + slack, ny));
    drag.paper.style.left = nx + "px";
    drag.paper.style.top = ny + "px";
    requestApply(); // 拖拽过程中实时更新光照响应
  }
  function onDragEnd(e) {
    if (!drag.paper) return;
    drag.paper.classList.remove("dragging");
    if (drag.paper.hasPointerCapture && drag.paper.hasPointerCapture(e.pointerId)) {
      drag.paper.releasePointerCapture(e.pointerId);
    }
    drag.paper = null;
    requestApply();
  }
  for (const p of papers) {
    p.addEventListener("pointerdown", onDragStart);
    p.addEventListener("pointermove", onDragMove);
    p.addEventListener("pointerup", onDragEnd);
    p.addEventListener("pointercancel", onDragEnd);
  }

  /* ── 属性滑块 → 选中的纸片·枫叶 ── */
  const leaf = document.querySelector(".paper-leaf");
  const rangeRot = document.getElementById("range-rot");
  const rangeOp = document.getElementById("range-op");
  const rangeBri = document.getElementById("range-bri");
  const rotNum = document.getElementById("rotNum");
  const opNum = document.getElementById("opNum");
  const briNum = document.getElementById("briNum");

  function bindSlider(input, num, fmt, apply) {
    if (!input) return;
    input.addEventListener("input", () => {
      const v = Number(input.value);
      num.textContent = fmt(v);
      apply(v);
    });
  }
  bindSlider(rangeRot, rotNum, (v) => v + "°", (v) => {
    leaf.style.setProperty("--rot", v + "deg");
    liveStatus.textContent = "已旋转 " + v + "°";
  });
  bindSlider(rangeOp, opNum, (v) => v + "%", (v) => {
    leaf.style.opacity = (v / 100).toFixed(2);
    liveStatus.textContent = "透明度 " + v + "%";
  });
  bindSlider(rangeBri, briNum, (v) => String(v), (v) => {
    leaf.style.setProperty("--bri", (v / 100).toFixed(2));
    liveStatus.textContent = "明度 " + v;
  });

  /* ── 工具切换 ── */
  const tools = Array.from(document.querySelectorAll(".tool"));
  for (const t of tools) {
    t.addEventListener("click", () => {
      tools.forEach((o) => {
        const on = o === t;
        o.classList.toggle("active", on);
        o.setAttribute("aria-pressed", String(on));
      });
      liveStatus.textContent = "已选择工具：" + (t.querySelector(".tool-name") || {}).textContent;
    });
  }

  /* ── 起步 ── */
  function init() {
    drawNightPhoto();
    setLamp(true, false);
    requestApply();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

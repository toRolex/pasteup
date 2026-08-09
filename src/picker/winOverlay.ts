/**
 * winOverlay（T17）—— Windows 屏幕取色覆盖层（前端逻辑 + DOM 宿主）。
 *
 * 背景：macOS 走原生 NSColorSampler（见 pickScreenColor.ts / lib.rs）；Windows 因
 * 无法复用 NSColorSampler，改用「Rust 全屏截屏 → 前端全屏覆盖层放大镜 → 中心像素取色」。
 * 本模块纯逻辑（hexAtPixel / magnifierSource / isWindowsPlatform）在 macOS 单测；
 * showWindowsColorOverlay 为覆盖层 DOM 宿主（jsdom 无 canvas，像素解码 no-op，仅测结构/事件）。
 */

/** Rust `capture_screen` command 返回：PNG dataURL + 原图尺寸。 */
export interface ScreenShot {
  dataUrl: string;
  width: number;
  height: number;
}

/** 放大镜源区域（截图坐标系下的正方形采样区）。 */
export interface MagnifierRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 放大镜视图边长（CSS 像素）与缩放倍率。 */
export const MAGNIFIER_VIEW = 160;
export const MAGNIFIER_ZOOM = 4;

/**
 * 运行时平台探测：仅 Windows 启用覆盖层取色。
 * jsdom（navigator.platform='' 且 userAgent 无 Windows）返回 false。
 */
export function isWindowsPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform = navigator.platform || '';
  const ua = navigator.userAgent || '';
  return /win/i.test(platform) || /windows/i.test(ua);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

function toHex2(v: number): string {
  return Math.round(v).toString(16).padStart(2, '0');
}

/** 从 RGBA buffer 提取 (x, y) 像素 hex（忽略 alpha，越界坐标 clamp）。 */
export function hexAtPixel(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
): string {
  const height = Math.floor(data.length / 4 / width);
  const cx = clamp(Math.round(x), 0, Math.max(0, width - 1));
  const cy = clamp(Math.round(y), 0, Math.max(0, height - 1));
  const i = (cy * width + cx) * 4;
  return `#${toHex2(data[i])}${toHex2(data[i + 1])}${toHex2(data[i + 2])}`;
}

/**
 * 放大镜源区域：以光标为中心、边长 ceil(viewSize/zoom) 的正方形，clamp 到图像边界。
 * 返回的 rect 供放大镜 canvas 从原图 RGBA 采样放大。
 */
export function magnifierSource(
  cursorX: number,
  cursorY: number,
  imgW: number,
  imgH: number,
  zoom: number,
  viewSize: number,
): MagnifierRect {
  const side = Math.max(1, Math.ceil(viewSize / zoom));
  const half = Math.floor(side / 2);
  const x = clamp(cursorX - half, 0, Math.max(0, imgW - side));
  const y = clamp(cursorY - half, 0, Math.max(0, imgH - side));
  return { x, y, w: side, h: side };
}

/**
 * 把原图源区域最近邻放大绘制到放大镜 canvas（Windows 运行时；jsdom 无 2d context 时 no-op）。
 */
function drawMagnifier(
  canvas: HTMLCanvasElement,
  pixels: Uint8ClampedArray,
  imgW: number,
  src: MagnifierRect,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const out = ctx.createImageData(MAGNIFIER_VIEW, MAGNIFIER_VIEW);
  const outData = out.data;
  for (let oy = 0; oy < MAGNIFIER_VIEW; oy += 1) {
    for (let ox = 0; ox < MAGNIFIER_VIEW; ox += 1) {
      const sx = src.x + Math.floor(ox / MAGNIFIER_ZOOM);
      const sy = src.y + Math.floor(oy / MAGNIFIER_ZOOM);
      const si = (sy * imgW + sx) * 4;
      const oi = (oy * MAGNIFIER_VIEW + ox) * 4;
      outData[oi] = pixels[si];
      outData[oi + 1] = pixels[si + 1];
      outData[oi + 2] = pixels[si + 2];
      outData[oi + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
}

/**
 * 全屏覆盖层取色宿主：展示截图 + 放大镜 + 中心像素读数；移动鼠标预览、点击确认、Esc 取消。
 * 返回选中的 hex（取消 / 解码失败返回 null）。截图与窗口同为全屏尺寸，client 坐标即图像坐标。
 */
export function showWindowsColorOverlay(shot: ScreenShot): Promise<string | null> {
  return new Promise((resolve) => {
    let pixels: Uint8ClampedArray | null = null;
    let settled = false;
    let cursorX = shot.width / 2;
    let cursorY = shot.height / 2;

    const overlay = document.createElement('div');
    overlay.setAttribute('data-testid', 'win-overlay');
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:99999',
      'background:#000',
      'cursor:crosshair',
      'display:flex',
      'align-items:center',
      'justify-content:center',
    ].join(';');

    const img = document.createElement('img');
    img.src = shot.dataUrl;
    img.alt = '屏幕截屏';
    img.style.cssText =
      'max-width:100%;max-height:100%;object-fit:contain;pointer-events:none;';

    const magnifier = document.createElement('canvas');
    magnifier.setAttribute('data-testid', 'win-magnifier');
    magnifier.width = MAGNIFIER_VIEW;
    magnifier.height = MAGNIFIER_VIEW;
    magnifier.style.cssText = [
      'position:fixed',
      `width:${MAGNIFIER_VIEW}px`,
      `height:${MAGNIFIER_VIEW}px`,
      'border:2px solid #fff',
      'border-radius:50%',
      'pointer-events:none',
      'box-shadow:0 0 0 1px rgba(0,0,0,.5)',
      'display:none',
    ].join(';');

    const readout = document.createElement('div');
    readout.setAttribute('data-testid', 'win-hex');
    readout.style.cssText = [
      'position:fixed',
      'bottom:24px',
      'left:50%',
      'transform:translateX(-50%)',
      'background:rgba(0,0,0,.75)',
      'color:#fff',
      'font:600 18px/1 monospace',
      'padding:8px 14px',
      'border-radius:8px',
    ].join(';');

    const finish = (hex: string | null) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      resolve(hex);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(null);
    };

    const render = (clientX: number, clientY: number) => {
      cursorX = clientX;
      cursorY = clientY;
      if (!pixels) {
        readout.textContent = '取色器加载中…';
        return;
      }
      readout.textContent = hexAtPixel(pixels, shot.width, cursorX, cursorY);
      const src = magnifierSource(cursorX, cursorY, shot.width, shot.height, MAGNIFIER_ZOOM, MAGNIFIER_VIEW);
      drawMagnifier(magnifier, pixels, shot.width, src);
      magnifier.style.left = `${clientX + 18}px`;
      magnifier.style.top = `${clientY - MAGNIFIER_VIEW / 2}px`;
      magnifier.style.display = 'block';
    };

    overlay.addEventListener('mousemove', (e) => render(e.clientX, e.clientY));
    overlay.addEventListener('click', () => {
      if (pixels) finish(hexAtPixel(pixels, shot.width, cursorX, cursorY));
      else finish(null);
    });

    // 解码截图 → RGBA buffer。真实 Windows 上 load 后触发；jsdom 无 canvas → no-op。
    img.addEventListener('load', () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = shot.width;
        canvas.height = shot.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, shot.width, shot.height);
        pixels = ctx.getImageData(0, 0, shot.width, shot.height).data;
        readout.textContent = '移动鼠标取色，点击确认';
      } catch {
        pixels = null;
      }
    });

    document.addEventListener('keydown', onKeyDown);
    overlay.appendChild(img);
    overlay.appendChild(magnifier);
    overlay.appendChild(readout);
    document.body.appendChild(overlay);
  });
}

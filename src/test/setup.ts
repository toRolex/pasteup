import '@testing-library/jest-dom';

// fabric v7 在 jsdom 下初始化 fabric.Canvas 需要 canvas 2D context。
// jsdom 的 getContext('2d') 默认返回 null，这里 stub 一个可工作的 2D context
// 供桥接壳测试使用（无需 node-canvas 原生依赖）。

const noop = () => {};
const gradientStub = { addColorStop: noop };
const patternStub = { setTransform: noop };
const imageDataStub = {
  data: new Uint8ClampedArray(4),
  width: 1,
  height: 1,
  colorSpace: 'srgb',
};

function create2DContext(): CanvasRenderingContext2D {
  const state: Record<string, unknown> = {
    canvas: document.createElement('canvas'),
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    shadowBlur: 0,
    shadowColor: 'rgba(0, 0, 0, 0)',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    lineCap: 'butt',
    lineJoin: 'miter',
    miterLimit: 10,
    lineDashOffset: 0,
    filter: 'none',
    imageSmoothingEnabled: true,
  };

  const methods: Record<string, unknown> = {
    setLineDash: noop,
    getLineDash: () => [],
    measureText: () => ({ width: 0, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 0 }),
    createLinearGradient: () => gradientStub,
    createRadialGradient: () => gradientStub,
    createConicGradient: () => gradientStub,
    createPattern: () => patternStub,
    getImageData: () => imageDataStub,
    putImageData: noop,
    drawImage: noop,
    getContextAttributes: () => ({}),
  };

  const pathMethods = [
    'save',
    'restore',
    'translate',
    'rotate',
    'scale',
    'transform',
    'setTransform',
    'resetTransform',
    'beginPath',
    'closePath',
    'moveTo',
    'lineTo',
    'bezierCurveTo',
    'quadraticCurveTo',
    'arc',
    'arcTo',
    'rect',
    'fillRect',
    'strokeRect',
    'clearRect',
    'fill',
    'stroke',
    'clip',
    'fillText',
    'strokeText',
    'isPointInPath',
    'isPointInStroke',
  ];
  for (const m of pathMethods) methods[m] = noop;

  const target: Record<string, unknown> = { ...state, ...methods };
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop as string];
      // 未知属性按方法兜底，避免 fabric 内部调用未枚举方法时抛错
      return noop;
    },
    set(t, prop, value) {
      t[prop as string] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function getContext(
    this: HTMLCanvasElement,
    contextId: string,
    _options?: unknown,
  ) {
    if (contextId === '2d') return create2DContext();
    if (contextId === 'webgl' || contextId === 'webgl2') {
      // fabric 不用 webgl，但兜底避免未知路径抛错
      return null;
    }
    return null;
  } as typeof HTMLCanvasElement.prototype.getContext;

  HTMLCanvasElement.prototype.toDataURL = function toDataURL() {
    return 'data:image/png;base64,iVBORw0KGgo=';
  } as typeof HTMLCanvasElement.prototype.toDataURL;

  HTMLCanvasElement.prototype.toBlob = function toBlob(
    callback: BlobCallback,
  ) {
    const blob = new Blob([], { type: 'image/png' });
    callback(blob);
  } as typeof HTMLCanvasElement.prototype.toBlob;
}

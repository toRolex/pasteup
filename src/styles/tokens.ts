/**
 * pasteup 设计 token —— DESIGN.md 契约的单一来源（OKLCH 色板 / 三栏 / 圆角 / 阴影 / 动效 / 字体链）。
 *
 * - 与 `tokens.css`（CSS 变量版）同源；关键布局尺寸由本模块经 inline style 下发给 JournalShell，
 *   保证 jsdom 可测且运行时确凿生效。
 * - 视觉语言来自已锚定的「03 摊开手帐本」原型（prototypes/surprise-issue22/directions/03-open-journal/）。
 */

export interface MotionTokens {
  /** 默认过渡时长（DESIGN.md Motion）。 */
  duration: string;
  /** 缓出（DESIGN.md `--ease-out`）。 */
  easeOut: string;
  /** 纸张弹性（DESIGN.md `--ease-spring`）。 */
  easeSpring: string;
}

/** 默认动效：spring ease（纸张弹性）。 */
export const motionDefault: MotionTokens = {
  duration: '220ms',
  easeOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
  easeSpring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
};

/** prefers-reduced-motion 降级：全部瞬时切换。 */
export const motionReduced: MotionTokens = {
  duration: '0.001s',
  easeOut: 'linear',
  easeSpring: 'linear',
};

/** 按系统偏好解析动效 token。 */
export function resolveMotion(prefersReducedMotion: boolean): MotionTokens {
  return prefersReducedMotion ? motionReduced : motionDefault;
}

export const tokens = {
  /** 摊开手帐本三栏 + 顶栏（DESIGN.md Layout，单位 px）。 */
  layout: { topbar: 56, left: 260, spine: 34, right: 280 },

  /** OKLCH 色板（DESIGN.md Palette）。 */
  palette: {
    desk: 'oklch(0.80 0.025 88)',
    bg: 'oklch(0.965 0.020 85)',
    paper2: 'oklch(0.935 0.022 85)',
    paperDeep: 'oklch(0.905 0.025 85)',
    ink: 'oklch(0.32 0.045 60)',
    inkSoft: 'oklch(0.46 0.04 60)',
    inkLine: 'oklch(0.32 0.045 60 / 0.38)',
    moss: 'oklch(0.55 0.092 130)',
    mossDeep: 'oklch(0.48 0.075 130)',
    tape: 'oklch(0.53 0.175 27)',
    note: 'oklch(0.82 0.10 88)',
    noteDeep: 'oklch(0.75 0.11 86)',
    sticker: 'oklch(0.55 0.05 320)',
  },

  /** 圆角（DESIGN.md Radius：拟物零大圆角卡片）。 */
  radius: { chip: 4, toolBtn: 6, stamp: 0 },

  /** 纸页阴影层次（DESIGN.md Elevation）。 */
  elevation: {
    book: '0 10px 40px oklch(0.25 0.03 60 / 0.25), 0 2px 8px oklch(0.25 0.03 60 / 0.15)',
    lift: '0 4px 10px oklch(0.25 0.03 60 / 0.18)',
    hover: '0 6px 14px oklch(0.25 0.03 60 / 0.25)',
  },

  /** 动效（DESIGN.md Motion）。 */
  motion: motionDefault,

  /** 字体链（DESIGN.md Typography，本地打包 + 系统兜底）。 */
  font: {
    hand: "'Ma Shan Zheng', 'Caveat', 'Kaiti SC', cursive",
    scrawl: "'Liu Jian Mao Cao', 'Kaiti SC', cursive",
    sub: "'ZCOOL KuaiLe', 'PingFang SC', sans-serif",
    num: "'Nunito', 'PingFang SC', sans-serif",
    body: "'Nunito', 'Hiragino Maru Gothic ProN', 'PingFang SC', 'Microsoft YaHei', sans-serif",
  },
} as const;

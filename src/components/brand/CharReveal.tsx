/**
 * CharReveal（T16）——主标题逐字浮现（03-open-journal 技法）。
 *
 * - 默认：文本逐字符拆成 `.ch` span（空白转 nbsp 防换行），每字符经 `--i` 索引延迟
 *   staggered 浮现；wrapper 带 `role="text"` + `aria-label` 全文本（可读性/屏读）。
 * - prefers-reduced-motion：直接渲染纯文本、无 `.ch` span——字符直接显示，不等动画。
 *   （配合 journal.css 的 `[data-reduced-motion='true'] .ch` 兜底规则。）
 */
import type { CSSProperties } from 'react';
import { usePrefersReducedMotion } from '../../styles/usePrefersReducedMotion';

export interface CharRevealProps {
  /** 要逐字呈现的完整文本。 */
  text: string;
  /** 透传给外层 span（如 brand-name 的排印样式）。 */
  className?: string;
}

export function CharReveal({ text, className }: CharRevealProps) {
  const reduced = usePrefersReducedMotion();

  if (reduced) {
    return (
      <span className={className} data-testid="char-reveal">
        {text}
      </span>
    );
  }

  const chars = Array.from(text);
  return (
    <span className={className} data-testid="char-reveal" role="text" aria-label={text}>
      {chars.map((ch, i) => (
        <span
          key={`${i}-${ch}`}
          className="ch"
          style={{ '--i': i } as CSSProperties}
          aria-hidden="true"
        >
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </span>
  );
}

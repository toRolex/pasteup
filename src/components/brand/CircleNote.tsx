/**
 * CircleNote（T16）——手写圈注装饰（03-open-journal 技法）。
 *
 * 重点功能旁的涂鸦式手绘圈 + 手写批注（如导出旁「盖戳」、色板旁「点色」）。
 * 纯装饰：`aria-hidden="true"`，不参与语义树；圈环是手绘 SVG path，标签用 scrawl 字体。
 */
export interface CircleNoteProps {
  /** 圈注批注文字（如「盖戳」「点色」）。 */
  label: string;
  /** 附加定位 class（如 circle-note--export / circle-note--palette）。 */
  className?: string;
  /** 测试定位 id。 */
  testId?: string;
}

export function CircleNote({ label, className, testId }: CircleNoteProps) {
  return (
    <span
      className={`circle-note ${className ?? ''}`.trim()}
      data-testid={testId}
      aria-hidden="true"
    >
      <svg className="circle-note-ring" viewBox="0 0 40 40">
        <path
          d="M 20 3.5 C 33.5 3.5 38.5 12 36.5 21.5 C 34.5 32 24.5 36.5 14 33.5 C 4.8 30.6 1.8 21.5 5.8 12.5 C 8.6 6.2 15 3 20 3.5"
          fill="none"
        />
      </svg>
      <span className="circle-note-label">{label}</span>
    </span>
  );
}

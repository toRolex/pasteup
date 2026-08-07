/**
 * 新建项目对话框：选择画布朝向（竖 / 横，A4 换向）+ 分辨率（96 / 300 / 600，默认 300）。
 *
 * 确认后调用 store.createProject 初始化画布尺寸；选定后固定（本切片不提供中途换向 UI）。
 * 纯功能层 + 拟物样式最小化，视觉打磨留待后续 issue。
 */
import { useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import {
  CANVAS_ORIENTATIONS,
  CANVAS_RESOLUTIONS,
  createCanvasSize,
  DEFAULT_CANVAS_ORIENTATION,
  DEFAULT_CANVAS_RESOLUTION,
  type CanvasOrientation,
  type CanvasResolution,
} from '../../types/canvasSize';

export interface NewProjectDialogProps {
  open: boolean;
  onClose: () => void;
}

const ORIENTATION_LABEL: Record<CanvasOrientation, string> = {
  portrait: '竖版 A4',
  landscape: '横版 A4',
};

export function NewProjectDialog({ open, onClose }: NewProjectDialogProps) {
  const createProject = useProjectStore((s) => s.createProject);
  const [orientation, setOrientation] = useState<CanvasOrientation>(DEFAULT_CANVAS_ORIENTATION);
  const [resolution, setResolution] = useState<CanvasResolution>(DEFAULT_CANVAS_RESOLUTION);

  if (!open) return null;

  const size = createCanvasSize(orientation, resolution);

  function handleCreate() {
    createProject(orientation, resolution);
    onClose();
  }

  return (
    <div
      className="new-project-backdrop"
      data-testid="new-project-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="新建项目"
    >
      <div className="new-project-card">
        <h2 className="page-heading">新建项目</h2>

        <label className="new-project-field" htmlFor="new-project-orientation">
          画布朝向
          <select
            id="new-project-orientation"
            data-testid="orientation"
            value={orientation}
            onChange={(e) => setOrientation(e.target.value as CanvasOrientation)}
          >
            {CANVAS_ORIENTATIONS.map((o) => (
              <option key={o} value={o}>
                {ORIENTATION_LABEL[o]}
              </option>
            ))}
          </select>
        </label>

        <label className="new-project-field" htmlFor="new-project-resolution">
          分辨率（DPI）
          <select
            id="new-project-resolution"
            data-testid="resolution"
            value={resolution}
            onChange={(e) => setResolution(Number(e.target.value) as CanvasResolution)}
          >
            {CANVAS_RESOLUTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        <p className="new-project-preview" data-testid="size-preview">
          {size.width} × {size.height} px
        </p>

        <div className="new-project-actions">
          <button className="tool-btn" data-testid="create-project" onClick={handleCreate}>
            创建
          </button>
          <button className="tool-btn" data-testid="cancel-project" onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NewProjectDialog } from './NewProjectDialog';
import {
  createDefaultProject,
  useProjectStore,
} from '../../store/projectStore';

describe('NewProjectDialog（seam S6）— 新建项目流程', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: createDefaultProject() });
  });

  it('关闭时不渲染', () => {
    const { container } = render(<NewProjectDialog open={false} onClose={() => {}} />);
    expect(container.querySelector('[data-testid="new-project-dialog"]')).toBeNull();
  });

  it('默认选项：竖版 + 300，预览 2480 × 3508', () => {
    render(<NewProjectDialog open onClose={() => {}} />);
    expect(screen.getByTestId('orientation')).toHaveValue('portrait');
    expect(screen.getByTestId('resolution')).toHaveValue('300');
    expect(screen.getByTestId('size-preview').textContent).toContain('2480');
    expect(screen.getByTestId('size-preview').textContent).toContain('3508');
  });

  it('选横版 + 96 后预览更新为 1123 × 794，点创建写入 store 并关闭', () => {
    const onClose = vi.fn();
    render(<NewProjectDialog open onClose={onClose} />);

    fireEvent.change(screen.getByTestId('orientation'), { target: { value: 'landscape' } });
    fireEvent.change(screen.getByTestId('resolution'), { target: { value: '96' } });

    expect(screen.getByTestId('size-preview').textContent).toContain('1123');
    expect(screen.getByTestId('size-preview').textContent).toContain('794');

    fireEvent.click(screen.getByTestId('create-project'));

    expect(useProjectStore.getState().project.canvas).toEqual({ width: 1123, height: 794 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('取消不改变 store', () => {
    const before = useProjectStore.getState().project;
    render(<NewProjectDialog open onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('cancel-project'));
    expect(useProjectStore.getState().project).toBe(before);
  });
});

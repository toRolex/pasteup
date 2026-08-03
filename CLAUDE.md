# pasteup

手帐剪纸拼贴绘图 app。上传照片 → 在照片上描摹 → 生成彩纸质感纸片元素 → 拼贴排版 → 导出 PNG / SVG。

## 技术栈

TypeScript · React · Vite · Zustand · Fabric.js v7 · Tauri 2 (Rust)

- 完整产品与实现方案：`docs/implementation-plan.md`
- 渲染引擎选型调研：`docs/research/render-engine-selection.md`
- 质感实现原型：`prototypes/texture-compare/`

## 关键约定

- **画布/UI 分工**：Fabric 管画布内部状态，React 只管 UI 外壳，经 `FabricCanvas` 桥接壳单向通信，不双向绑定
- **纹理自包含**：纹理资产统一转 dataURL，保证项目 JSON 与导出 SVG 自包含（避免 URL 失效）
- **序列化**：走自定义 schema（`src/types/project.ts`），不依赖 Fabric `toObject` 默认行为
- **Python 相关一律用 uv 管理**（`uv run --no-project` / `uv tool`）
- **首次使用浏览器/搜索工具前先 `Skill("browser-tools")`**

## Agent skills

### Issue tracker

Issues 和 PRD 用 GitHub Issues 管理，统一走 `gh` CLI。见 `docs/agents/issue-tracker.md`。

### Triage labels

五个标准 triage 角色使用默认标签（`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`）。见 `docs/agents/triage-labels.md`。

### Domain docs

单上下文（single-context）：根级 `CONTEXT.md` + `docs/adr/`。见 `docs/agents/domain.md`。

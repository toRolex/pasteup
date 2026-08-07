# 04 碎纸拼贴 SCRAP MOTION

> pasteup 手帐剪纸拼贴桌面 app 的 UI 视觉方向原型 —— 纸片的生命由碎纸粒子构成。

## 概念（一句话）

纸片不是静态粘贴，而是由碎纸粒子构成：选中、拖动、删除时它会**解构成纸屑云、跟着指针飘、再重组回纸片**，图层重排时纸片像被风掀起翻面——整个拼贴过程本身就是纸张的物理运动。

## 技法清单

- **手写 canvas 粒子系统**（`requestAnimationFrame`，无粒子库）：每张纸片解构时按颜色组散成 30 枚不规则碎纸屑（带随机的四边抖动形状、自旋、重力、地面/墙面弹性回弹），重组时按各自偏移向落点收敛（spring 收敛 + 收缩因子），收拢后纸片重新现形。
- **物理弹跳 / 重力**：free 粒子带 gravity / restitution / friction；纸屑可以在地面、墙面弹跳。
- **拖拽解构 → 跟随 → 重组**：拖起纸片 → 纸屑云保留纸片轮廓偏移跟随指针（`cloudScale` 收缩让云更聚拢），拖动时不断甩出纸屑拖尾；松开 → 纸屑向落点飞回拼合。
- **纸屑撒落**：顶栏「演示动效」、导出按钮、品牌彩蛋都会从画布顶撒落彩色纸屑。
- **图层风掀翻面**：图层重排时画布纸片做 `scaleX` 翻折 + 上抬 + 弹性落位，同时溅出一撮碎屑。
- **gsap 时间线编排 + CustomEase**：`scrapOut / scrapIn / wind / scrapBounce` 四套自定义缓动，驱动演示时间线（解构 → 漂移 → 重组 → 翻面 → 撒屑）。
- **程序化纸纹**：canvas 实时生成 皱纹纸 / 水彩纸 / 瓦楞纸 / 金葱纸 四种 dataURL 纸纹，作为 SVG pattern 覆盖在纸片形状上；画布底纹（纤维 + 描摹格点 + 暖光晕）也是 canvas 生成。

## 关键构建决策

- **纸片 = DOM（SVG 形状）＋ 粒子画布 overlay**：纸片本体是带 torn-edge SVG filter（feTurbulence 位移，做出剪纸毛边）的 DOM，粒子层是覆盖整个画布的 `<canvas>`（`pointer-events:none`）。DOM 负责可交互、SVG 负责剪纸造型，canvas 负责所有碎屑。
- **拖动语义**：pointerdown 短暂上抬后（>6px 判定）解构成云，跟随指针；原地点击则做一次「拆开又拼回」的呼吸动画（`pulsePiece`）。
- **重组落点按纸片尺寸 clamp**：`recomposeFromCloud` 根据纸片 offsetWidth/Height 把落点限制在画布内，避免演示时纸片被拖出画布裁切（第 1 轮 QA 发现并修复）。
- **图层重排**：指针式 live reorder，按指针 Y 与各图层项中线比较决定插入位，锁定「底图 · 描摹稿」不可移动，重排后同步 z 序并触发风掀动画。
- **可访问性**：正文统一用 `#5A4634`（对奶油底 7:1）；次级文字用 `rgba(90,70,52,0.85)`（4.9:1）；`prefers-reduced-motion` 下关闭粒子风暴/演示/环境纸屑，纸片改为整体拖动。
- **动效降级**：390px 布局改纵向堆叠，画布 58vh、面板下移，纸片用百分比定位不溢出；减少动效时隐藏全部纸屑。
- **零 console errors**：交付前用 shot harness + 自写 motion QA 验证（含真实鼠标拖拽：解构时纸片 hidden、粒子数 702，松开后 visible 并回到落点）。

## 截图路径

`shots/`（1440×900 桌面 + 390×844 移动，以及演示关键帧）：

- `desktop-top.png` / `desktop-mid.png` / `desktop-bottom.png` — 桌面全貌（含演示进行中的纸屑云与撒落）
- `mobile-top.png` / `mobile-bottom.png` — 移动端堆叠布局
- `frame-settled.png` — 初始静帧（三张纸片拼贴 + 环境纸屑）
- `frame-cloud.png` — 演示中枫叶解构成纸屑云
- `frame-recomposed.png` — 纸屑重组回纸片后
- `frame-sprinkle.png` — 演示尾声的金色纸屑撒落

## 本地预览

```bash
uv run --no-project python -m http.server 8441 --directory \
  prototypes/surprise-issue22/directions/04-scrap-motion
# 打开 http://localhost:8441/
```

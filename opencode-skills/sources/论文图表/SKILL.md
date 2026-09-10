---
name: 论文图表
description: 用 Python matplotlib 绘制论文数据图表（柱状图、折线图、散点图、误差条、箱线图、多子图等）时使用。触发词：画图、图表、柱状图、折线图、散点图、误差条、箱线图、fig、plot、matplotlib、数据可视化、代码画图、论文图表。
---

# 论文数据图表（matplotlib）

## 触发与边界

- 用户要**数据图/统计图**、要求“学术风”图表、或提供数据让画图时使用；纯流程图/结构图/示意图走 `svg-flowchart`，本 skill 只负责数据图表。
- 数据来源优先用户 `@` 的数据文件或粘贴的数据；数据不足先向用户确认，不要编造数据。

## 环境事实（论文助手服务器已预装，禁止擅自重复安装）

- Python3 + matplotlib + numpy 已装好；Noto CJK 中文字体在 `/usr/share/fonts/opentype/noto/`（NotoSansCJK-Regular.ttc / NotoSansCJK-Bold.ttc / NotoSerifCJK-*.ttc）。
- **禁止**默认执行 `pip install` / `apt install` / 联网下载字体。若 `import` 或字体加载报错：先自查系统里是否已有对应字体/包（含 macOS 的 PingFang/Heiti），确认缺失后再把报错反馈给用户，经用户同意才补装。
- 画中文标签必须显式注册中文字体，且只注册本机实际存在的路径（服务器与 macOS 路径不同）：

```python
import os
from matplotlib import font_manager as fm

_CJK_FONT_CANDIDATES = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",  # Ubuntu/服务器
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/System/Library/Fonts/PingFang.ttc",                     # macOS
    "/System/Library/Fonts/STHeiti Light.ttc",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
]
for _fp in _CJK_FONT_CANDIDATES:
    if os.path.exists(_fp):
        fm.fontManager.addfont(_fp)

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams["font.sans-serif"] = ["Noto Sans CJK SC", "PingFang SC", "Heiti SC", "Hiragino Sans GB", "DejaVu Sans"]
plt.rcParams["axes.unicode_minus"] = False
```

## 学术风格规范

- 无界面后端 `Agg`；`dpi >= 200`；`bbox_inches="tight"` 保存，避免四周留白被裁切。
- 坐标轴标签带单位；标题/图例用中文；正文字号 10–12pt。
- 网格浅色或隐藏；配色用黑白灰/低饱和/色盲友好（参考 Okabe-Ito），少用高饱和原色。
- 同类图表样式统一（同色板、同字号、同线型），多子图时共享轴或对齐刻度。
- 有误差/分布时优先给误差条或箱线图；折线比较给多序列并带图例；柱状对比给分组柱。

## 保存与引用（与论文工作台一致）

- PNG 直接保存到当前项目文件空间（项目根目录即工作台「资料」），文件名 `fig-chart-<英文简要>.png`；需要归类时保存到 `figures/charts/<名称>.png`。
- 保存后把**完整保存路径**告诉用户；需要插入文稿时给出与保存位置一致的引用行：
  - 项目根目录 → `![图N](asset://materials/fig-chart-<名称>.png)`
  - `figures/` 目录 → `![图N](figures/charts/<名称>.png)`
- 用户改数据重画时覆盖同名文件，不堆 `_v2` 副本。

## 输出前检查

- [ ] 中文无乱码（字体已注册）、负号正常（`unicode_minus=False`）
- [ ] 图例/标签无重叠、坐标范围合理、单位明确
- [ ] 保存路径与引用路径一致，文件确实已生成

# 塔罗解读指南（独立副本 · 仅供本地模型参考）

本目录是 GitHub 仓库 [`miyaosk/tarot_guide_skill`](https://github.com/miyaosk/tarot_guide_skill)
（分支/子目录 `tarot-guide`，MIT 协议）的一份**逐字副本**，用于给树洞塔罗的本地大模型
（Ollama `qwen3:8b`）在解读塔罗时作为**参考素材**。

## 为什么单独放一份
- 用户要求：让本地大模型在解读塔罗时参考这份荣格心理学视角的塔罗指南，
  但**不要污染原本的本地大模型**。
- 因此这里只放「文本指南」，运行时由 `tarot.py` 把它作为**系统提示的补充块**注入给模型。
  **qwen3 的模型权重、原 `SYSTEM_PROMPT`、原 `FEWSHOT` 示例一律不动**。
- 是否启用由环境变量 `TAROT_USE_GUIDE` 控制（默认关闭），线上站点行为完全不受影响；
  开启后也只是在每次解读时把相关牌义与风格提示喂给模型。

## 目录结构（镜像原仓库）
```
tarot_guide/
├── README.md                    # 本说明
├── SKILL.md                     # AI 主指令文件（解读风格 + 流程 + 护栏 + 输出格式）
└── references/
    ├── major-arcana.md          # 大阿卡纳牌义（含荣格原型）
    ├── minor-arcana-wands.md    # 权杖牌组牌义
    ├── minor-arcana-cups.md     # 圣杯牌组牌义
    ├── minor-arcana-swords.md   # 宝剑牌组牌义
    ├── minor-arcana-pentacles.md# 星币牌组牌义
    └── spreads.md               # 12 种牌阵定义与解读指南
```

## 与树洞现有实现的适配说明（重要）
原 skill 是「多轮对话式」agent（开场 → 选牌阵 → 让用户选号 → 揭牌解读），
而树洞塔罗是**单次调用**：前端已抽好牌并把牌名/正逆位/位置发到
`POST /api/tarot/interpret`，后端一次性调用模型返回文本。因此：

- 原 skill 的「3 轮对话流程 / 让用户从 1-78 选号」部分**不适用**，已忽略。
- 真正被采用的是它的**解读方法论**：荣格风格、牌阵位置含义、护栏、逐张+整体叙事+行动指引的结构。
- 原 skill 输出模板带 `![牌](图片URL)` 与 Markdown 标题；树洞前端是**纯文本**渲染解读、
  牌面图由前端自己用 `tarotData.js` 展示，故输出保持纯文本（吸收其结构但不加 Markdown 图片）。
- 树洞前端目前只支持两种牌阵：`time`（过去·现在·未来 3 张）与 `celtic`（凯尔特十字 10 张），
  与原 skill 的 12 种牌阵不同；本副本的 `spreads.md` 完整保留，供后续扩展参考。

## 加载方式
见同目录的 `tarot_guide_loader.py`：解析 `references/*.md` 构建「按英文牌名查表」的牌义字典，
并按检测到的牌阵（`time` / `celtic`）生成对应风格与位置含义的补充提示。

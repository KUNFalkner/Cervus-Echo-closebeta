---
name: 校园树洞社区
description: 匿名、安全、自由的校园社区平台
colors:
  primary: "#667eea"
  primary-deep: "#764ba2"
  surface: "rgba(255, 255, 255, 0.15)"
  surface-hover: "rgba(255, 255, 255, 0.2)"
  surface-active: "rgba(255, 255, 255, 0.25)"
  text-primary: "#ffffff"
  text-secondary: "rgba(255, 255, 255, 0.9)"
  text-muted: "rgba(255, 255, 255, 0.7)"
  border: "rgba(255, 255, 255, 0.2)"
  border-focus: "rgba(255, 255, 255, 0.5)"
  shadow: "rgba(31, 38, 135, 0.37)"
  shadow-hover: "rgba(31, 38, 135, 0.4)"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
    fontSize: "2.5rem"
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
rounded:
  sm: "8px"
  md: "12px"
  lg: "20px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "32px"
components:
  glass-card:
    backgroundColor: "{surface}"
    textColor: "{text-primary}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  glass-input:
    backgroundColor: "rgba(255, 255, 255, 0.1)"
    textColor: "{text-primary}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  glass-button:
    backgroundColor: "{surface}"
    textColor: "{text-primary}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  nav-button:
    backgroundColor: "transparent"
    textColor: "{text-muted}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 1rem"
---

# Design System: 校园树洞社区

## 1. Overview

**Creative North Star: "液态玻璃树洞"**

这是一个为高中生设计的匿名社区平台，核心气质是安全、匿名、自由。视觉上采用 Apple 液态玻璃（Liquid Glass）风格，通过半透明毛玻璃卡片、柔和光影和渐变背景营造温暖而有安全感的氛围。

设计拒绝微博式的嘈杂信息流、知乎式的精英感、贴吧式的混乱无序。我们追求的是一个安静的、值得信赖的表达空间，让用户感到"在这里说话是安全的"。

**Key Characteristics:**
- 液态玻璃质感：半透明卡片 + 毛玻璃模糊 + 柔和阴影
- 渐变背景：紫蓝渐变营造温暖而有深度的氛围
- 匿名优先：界面不暴露任何个人身份信息
- 移动端优先：主要使用场景是手机端课间/放学后

## 2. Colors

紫蓝渐变色调，营造温暖而有深度的匿名社区氛围。

### Primary
- **渐变紫蓝** (#667eea → #764ba2): 主渐变色，用于背景和强调元素
- **玻璃白** (rgba(255, 255, 255, 0.15)): 卡片和容器背景

### Neutral
- **纯白** (#ffffff): 主要文字颜色
- **柔白** (rgba(255, 255, 255, 0.9)): 次要文字
- **雾白** (rgba(255, 255, 255, 0.7)): 占位符和禁用状态
- **边框白** (rgba(255, 255, 255, 0.2)): 分隔线和边框

### Named Rules
**The Glass Rule.** 所有容器使用半透明背景 + 毛玻璃模糊，不使用纯色卡片。卡片透明度在 0.15-0.25 之间变化，hover 时增加到 0.2-0.3。

## 3. Typography

**Display Font:** system-ui (Apple/Android 系统字体)
**Body Font:** system-ui (Apple/Android 系统字体)

**Character:** 简洁、现代、易读。使用系统字体确保跨平台一致性，中文优先支持 PingFang SC 和 Microsoft YaHei。

### Hierarchy
- **Display** (700, 2.5rem, 1.2): 页面标题、登录页大标题
- **Headline** (600, 1.5rem, 1.3): 导航栏标题、卡片标题
- **Title** (600, 1.3rem, 1.4): 帖子标题、表单标题
- **Body** (400, 1rem, 1.6): 正文内容、描述文字
- **Label** (500, 0.875rem, 1.5): 按钮文字、标签、时间戳

## 4. Elevation

使用柔和阴影 + 毛玻璃模糊营造层次感，不使用硬阴影。

### Shadow Vocabulary
- **卡片静止** (`box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37)`): 卡片默认状态
- **卡片悬停** (`box-shadow: 0 12px 40px 0 rgba(31, 38, 135, 0.4)`): 卡片 hover 状态
- **按钮悬停** (`box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1)`): 按钮 hover 状态

### Named Rules
**The Blur Rule.** 所有容器使用 `backdrop-filter: blur(20px)`，模糊半径固定为 20px，不随状态变化。

## 5. Components

### Glass Card
- **Corner Style:** 20px 圆角
- **Background:** rgba(255, 255, 255, 0.15) + backdrop-filter: blur(20px)
- **Border:** 1px solid rgba(255, 255, 255, 0.2)
- **Internal Padding:** 2rem
- **State:** hover 时背景变亮、上浮 2px、阴影增强

### Glass Input
- **Style:** 半透明背景 + 白色文字 + 12px 圆角
- **Focus:** 边框变亮到 0.5 透明度、背景变亮到 0.2
- **Placeholder:** rgba(255, 255, 255, 0.7)

### Glass Button
- **Style:** 半透明背景 + 白色粗体文字 + 12px 圆角
- **Hover:** 背景变亮、上浮 2px、添加阴影
- **Active:** 按下回弹效果

### Navigation
- **Style:** 顶部固定、毛玻璃背景、flex 布局
- **Mobile:** 垂直堆叠、居中对齐
- **Active State:** 背景高亮 + 白色文字

### Post Card
- **Style:** 继承 Glass Card 样式
- **Content:** 标题 + 正文 + 互动按钮（点赞、评论数）
- **Hover:** 上浮效果

## 6. Do's and Don'ts

### Do:
- **Do** 使用半透明玻璃效果作为所有容器的默认样式
- **Do** 保持匿名性，界面上不暴露用户真实身份
- **Do** 移动端优先设计，确保在小屏幕上易用
- **Do** 使用系统字体，确保跨平台一致性
- **Do** 渐变背景保持柔和，不刺眼

### Don't:
- **Don't** 使用纯色卡片背景，必须是半透明玻璃效果
- **Don't** 使用硬阴影或投影，必须是柔和阴影
- **Don' t** 在界面上显示用户真实姓名或学号
- **Don't** 使用复杂的信息流或推荐算法
- **Don't** 使用精英感或说教口吻的文案

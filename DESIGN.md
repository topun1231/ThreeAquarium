---
name: ThreeAquarium Crystal UI
description: 试用水晶虾界面的缸边工具与个体标本册；依据源码记录，未经视觉验收。
colors:
  panel-water: "#f1f7fc"
  dock-water: "#f1f7fcf2"
  paper: "#e7f1f9"
  paper-ink: "#24394d"
  panel-ink: "#24394d"
  muted: "#536b7f"
  brass-action: "#bdd9ed"
  brass-hover: "#cee5f5"
  action-ink: "#24394d"
  focus: "#2d6d9d"
  paper-focus: "#2d6d9d"
  card: "#ffffff"
  card-hover: "#eaf3fb"
  card-selected: "#dfedf9"
  selected-edge: "#3979aa"
  field: "#ffffff"
  field-ink: "#24394d"
  danger: "#943e2d"
  paper-danger: "#943e2d"
typography:
  tank-title:
    fontSize: "26px"
    fontWeight: 600
    letterSpacing: "0.08em"
  book-title:
    fontSize: "22px"
    letterSpacing: "0.08em"
  specimen-title:
    fontSize: "24px"
  section-title:
    fontSize: "17px"
  card-title:
    fontSize: "14px"
  body:
    fontSize: "13px"
    lineHeight: 1.6
  control:
    fontSize: "13px"
    lineHeight: 1.3
  label:
    fontSize: "12px"
  metadata:
    fontSize: "11px"
    lineHeight: 1.7
rounded:
  marker: "3px"
  control: "6px"
  card: "8px"
  dock: "12px"
spacing:
  tight: "6px"
  row: "8px"
  cards: "10px"
  compact: "12px"
  shelf: "16px"
  page: "20px"
components:
  button-primary:
    backgroundColor: "{colors.brass-action}"
    textColor: "{colors.action-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  button-primary-hover:
    backgroundColor: "{colors.brass-hover}"
  search:
    backgroundColor: "{colors.field}"
    textColor: "{colors.field-ink}"
    rounded: "{rounded.control}"
    padding: "9px 11px"
  roster-card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.card}"
    padding: "10px 12px 14px"
  roster-card-selected:
    backgroundColor: "{colors.card-selected}"
    rounded: "{rounded.card}"
    padding: "10px 12px 14px"
  detail:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.paper-ink}"
    padding: "22px 24px"
---

# Design System: ThreeAquarium Crystal UI

## 当前配色：浅蓝、蓝灰、清晰蓝色强调

用户最新要求为浅蓝色；本节替代下方炭灰历史说明。当前CSS采用 light color-scheme，面板冰蓝、详情浅蓝、文字深蓝灰，图片独立蓝灰展示底；HUD有浅底承托深字。实际截图 output/playwright/light-blue-book-final.png。旧键名 panel-water / paper 仅为兼容文档字段，值已更新；`.impeccable/design.json` 仍为历史快照。

## 历史：炭灰、暖白、香槟金

2026-10-29 用户明确否决绿色UI。当前所有界面底色改为炭灰，卡片和详情用中性灰区分，主要动作及选中保留少量香槟金；文字为暖白或中性灰。属性条也去掉绿色。只改CSS色值，布局／玩法／存档不改，水草和水体的场景颜色不受影响。实际截图见 output/playwright/charcoal-book-final.png。

## 当前返修说明

原浅色纸页布局已被用户否决。当前使用深色详情；paper 系列字段暂保留旧键名但值已更新。个体卡必须按内容决定行高，不能压到42–65px。图像和加载占位共享108px槽，卡片最小192px；最大名字允许增高。≤720px为横向卡条。`.impeccable/design.json` 为旧稿生成快照，不可当作当前样式来源。下方未更新的历史组件描述以本说明和源码为准。

## Overview

**Creative North Star: "缸边工具与个体标本册"**

水缸保留为观察主体，炭灰工具底与黄铜状态标记承载操作，炭灰与暖白体系的详情承载个体外观、主操作、品质和折叠记录。此名称直接概括已给定方向，不新增世界观或审批结论。

本文仅覆盖当前试用源码中的水晶虾 HUD、工具栏、虾册和相关管理页，不代表正式 dist 已更新。证据为 `src/crystal-panel.css`、`src/crystal-panel.js`、`src/crystal-portraits.js` 及继承样式 `src/style.css`；入口 `src/main.js` 先加载基础样式，再加载水晶虾样式。方向来自 `artifacts/crystal-ui-direction.md`，授权边界来自 `PRODUCT.md`。2026-10-29 用户否决旧UI后已进行独立浏览器尺寸检查及实际UI截图查看，详见 artifacts/book-layout-report.md；这仍不表示用户已经验收。

**Key Characteristics:**
- 深色卡册与深色个体展示统一，金色用于选中和主操作。
- 以当前模型生成个体影像，以身份保持选择与记录。
- 操作面板按需展开，关闭后可保留缸中个体名牌。
- 键盘焦点、选中语义、等待反馈与失败重试都有源码实现。

## Colors

炭灰构成工具与名册的底色，黄铜用于主要动作和选择，纸色详情采用暖白文字；上述 frontmatter 是复用值记录，不提取一次性装饰色作为全局规范。

### Primary
- **黄铜动作 / 黄铜悬停**：主要按钮使用 `brass-action` 与 `brass-hover`，搭配 `action-ink`。
- **选中金边**：`selected-edge` 是名册卡片选中边；深色区域的键盘焦点使用 `focus`。

### Secondary
- **纸页危险文字**与**深底危险文字**分别服务不同明度背景；颜色不替代出售确认与禁用条件。

### Neutral
- **炭灰面板 / 炭灰工具底**：面板为不透明底，工具栏保留源码八位十六进制透明度。
- **标本纸 / 纸页墨色**：详情页与正文配对；详情页焦点使用 `paper-focus`。
- **名册底 / 悬停底 / 选择底**：分别对应普通、悬停和 `aria-pressed` 状态。
- **输入底 / 输入文字**：深底搜索和输入控件的配对。

## Typography

实际正文继承 `system-ui, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif`。缸名、虾册标题、个体名声明 `"Noto Serif SC", "Source Han Serif SC", SimSun, serif`，但这里没有字体加载声明，实际字体取决于设备。输入框未明确继承正文 font-family，不能据此声称全部控件字体统一。

因此 frontmatter 只记录已声明字号与行高，未将系统字体或未验证的衬线回退链确立为品牌字体。h2、h3 和 strong 的粗细主要沿用浏览器默认，并非独立定义的字重系统。

### Hierarchy
- **缸名**：`tank-title`，小窗口降至（22px）。
- **虾册标题**：`book-title`，小窗口降至（20px）；个体名使用 `specimen-title`。
- **分组 / 卡片标题**：分别使用 `section-title` 与 `card-title`。
- **正文 / 控件**：正文使用 `body`，按钮与 select 的继承基础规则为 `control`。
- **说明 / 元数据**：`label` 和 `metadata`；永久 ID 另用（10px），属于局部密集信息而非推荐的通用正文大小。
- 金币与品质数字采用等宽数字属性，未引入独立等宽字体。

## Layout

桌面 HUD 位于左上（top 22px / left 26px），工具栏居底，固定高（76px）。普通面板宽 `min(470px, calc(100vw - 48px))`，名册展开宽 `min(880px, calc(100vw - 48px))`；名册采用可伸缩列表加（310px）详情列，列表内部是两列卡片。列表和详情分别滚动，面板头与页签保留。

已实现断点：宽度不超过（1280px）且面板打开时隐藏 HUD；不超过（1000px）调整面板顶部，名册最大宽（760px）；不超过（620px）改为上下排列，列表最大高（240px），面板左右留（8px）。高度不超过（600px）时面板上移至（12px），保留底部（100px）。这些是源码行为，尚未通过本次视口验证。

页面、货架、行间和卡片使用 frontmatter 中记录的间距；它们来自不同布局职责，未形成单一等比尺度。打开面板隐藏成长提醒和个体名牌；观察模式隐藏水晶虾覆盖层，造景模式隐藏相应 HUD。

## Elevation & Depth

深度由炭灰底、纸页与柔和阴影共同形成。工具栏阴影为 `0 12px 28px #0006`，面板为 `0 20px 50px #0007`；名册卡片显式取消阴影，以背景和边线区分状态。工具栏显式使用 `backdrop-filter:none`。HUD 使用文字阴影帮助叠加在水缸画面上；未在本次测量其对所有场景的可读性。

## Shapes

工具栏、面板/卡片、控件、标记分别使用 frontmatter 的圆角值。大部分边线为细线；名册选中边由（1px）增至（2px），内边距相应减（1px），保持卡片外形稳定。页签为平直底边，选中时出现内嵌下划线。品质条使用（2px）圆角。

## Components

### Buttons

主要动作是黄铜底；详情页“在缸中找到它”另用暖白底。面板控件最小高（42px），关闭按钮（36px），其他继承入口存在（32px）和（36px）的局部尺寸，不能宣称全部入口达到（44px）。基础悬停改变背景和边线，按下沿 y 轴移动（1px）；禁用按钮与 select 透明度（.42）。面板焦点轮廓为（2px）且外移（3px），纸页用暖白焦点色。

### Inputs / Fields

搜索支持名字、颜色和纹样，筛选支持全部活体、当前缸、收藏、幼虾和已售档案。深底输入和纸页输入分别配色；select 保留原生选择行为。输入字体继承限制见 Typography，不在文档中用推定值掩盖差异。

### Navigation

虾册、繁育、集市、参赛构成页签。选中页签使用 `aria-selected` 和单一可 Tab 进入项，左右方向键切换；打开面板聚焦关闭按钮，关闭时返回原触发点或虾册入口。Escape 优先退出出售确认，其后关闭面板。面板不是声称已验证的模态焦点圈。

### Cards / Containers

名册卡片先显示影像，再显示名字、外观和品质摘要；`aria-pressed` 表达选中。收藏标记与选中标记放在图像角落。浅色详情提供命名、收藏保护、移缸、出售确认和可展开记录。提交期间设 `aria-busy`，相关控件禁用，状态消息以 `role=status` / `aria-live=polite` 提示。

### Individual Portraits

头像复用现有模型和外观逻辑，按永久身份稳定选取模板，保留性别、颜色、纹样和成年品质输入。独立透明渲染画布输出（384×224）PNG data URL，列表显示高（104px），详情高（156px），小窗口详情高（140px）。这是模型影像，不是新增物种素材。

渲染器按需创建，队列逐张执行，缓存最多（100）条；关键字包括身份、性别、颜色、纹样及成年状态/品质。详情与名牌优先；加载时显示占位文字，失败显示可重开虾册重试的提示。影像驻留内存，不写入存档；这些是源码事实，未在本次验证 WebGL 输出或保真度。

### Motion

控件沿用基础（.16s ease）的背景、边线、文字、变换与阴影过渡。减少动态偏好关闭面板和工具栏子项 transition；它没有同时取消基础按下位移，也不覆盖所有 HUD 入口，因此不能称为全站零动态模式。

## Do's and Don'ts

### Do:
- **Do** 复用深色工具、浅色详情及各自的文字与焦点配对。
- **Do** 用永久个体身份对应图像、选择和记录，保留加载失败的文本反馈。
- **Do** 保留选择、禁用、键盘焦点与出售确认的现有语义。

### Don't:
- **Don't** 将源码检查描述成用户视觉验收或正式版本发布。
- **Don't** 将尚未交付验证的字体回退链、局部小字或控件高度当成新界面必须继承的品牌规范。
- **Don't** 将本次试用布局的断点和面板位置扩张成其他玩法界面的强制构图。

## 2026-10-29 同缸玩法连接

玩家承诺：亲手搭出家，让同一批有身份的虾生活、成长并留下下一代。
核心循环：布置水草缸 → 注水领养 → 在实际缸内观察和加餐 → 虾册挑亲虾 → 主缸或繁育缸安排一窝 → 看后代长大 → 留种、收藏或参赛。容量含预留，没空间可暂停；失败不给玩家丢虾。
空间安排：主缸保持玩家布局，木石和植物继续提供实际活动表面；繁育缸可选，不强制把选育从主缸搬走。最初决策是如何造景，首次奖励是在自己的缸里看到入虾。
信息反馈：未注水显示开缸提示，注水后提示领养；同缸 ID 对应虾册与实际动物。撤销只处理造景；虾和后代的进展不会因撤销布局被抹去。
本轮不新增品种、遗传属性、奖励强度或压力惩罚，不改摄像机。

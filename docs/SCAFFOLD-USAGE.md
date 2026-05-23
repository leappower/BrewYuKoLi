# SCAFFOLD-USAGE.md — 脚手架规范与约定

> **生效日期**：2026-05-18
> **来源**：dev 分支（BrewYuKoLi）相对 scaffold/v1.0 的 68 个 commit 分析
> **目的**：将项目中可复用的架构约定、开发模式记录为脚手架规范，供后续项目继承

---

## 目录

1. [Dropdown 体系](#1-dropdown-体系)
2. [Z-Index 层级体系](#2-z-index-层级体系)
3. [CSS 变量与品牌色约定](#3-css-变量与品牌色约定)
4. [SPA 路由规范](#4-spa-路由规范)
5. [配置驱动模式](#5-配置驱动模式)
6. [SPA 内容提取规范](#6-spa-内容提取规范)
7. [Footer / Bottom Tab 体系](#7-footer--bottom-tab-体系)
8. [主题色注入规范](#8-主题色注入规范)
9. [其他架构约定](#9-其他架构约定)

---

## 1. Dropdown 体系

### 1.1 DropdownBase 统一交互 🔴

所有 dropdown 组件**必须**通过 `DropdownBase` 工厂函数创建：

```javascript
var dd = DropdownBase.create(wrapEl, {
  onOpen: function () { /* ... */ },
  onClose: function () { /* ... */ },
});
```

`DropdownBase` 提供：
- `esc()` — HTML 转义
- `isTouch` — 是否触屏设备
- 统一 `:hover` vs `:click` 交互模式

### 1.2 交互模式约定 🔴

| 设备类型 | 交互模式 | 实现方式 |
|---------|---------|---------|
| 非触屏（桌面） | CSS `:hover` | `.nav-item:hover .dropdown-wrap { display: block }` |
| 触屏设备 | `click` toggle | JS `touchstart`/`click` 事件，`classList.toggle('open')` |

### 1.3 实现细节

- **触屏检测**：`DropdownBase.isTouch`（`'ontouchstart' in window` 或 `navigator.maxTouchPoints > 0`）
- **CSS 选择器**：`:not(.touch-device):hover` 控制 hover 行为
- **触屏类标记**：`document.documentElement.classList.add('touch-device')`
- **驱动数据源**：所有 dropdown 内容从 `SITE_CONFIG.nav` / `SITE_CONFIG.categories` 读取

### 1.4 所有模块使用统一的 PREFIXES 系统

`dropdown-styles.js` 定义 `PREFIXES` 数组，各 dropdown 模块注册自己的前缀：
- `nav` — NavDropdown
- `prod` — ProductsDropdown
- `app` — ApplicationsDropdown
- `sup` — SupportDropdown
- `mega` — MegaMenu
- `contact` — ContactDropdown

**新增 dropdown 模块时，必须在 PREFIXES 中注册前缀。**

---

## 2. Z-Index 层级体系

### 2.1 层级变量 🔴

定义在 `z-index-system.css` 中：

```css
:root {
  --z-footer: 9000;
  --z-drawer: 10000;
  --z-toast: 11000;
  --z-overlay: 14000;
  --z-modal: 15000;
}
```

所有 JS 模块使用 CSS 变量，不使用硬编码值。

### 2.2 层级分配原则 🔴

| 层级 | 值 | 用途 |
|------|-----|------|
| `--z-footer` | 9000 | 底部导航栏、信任栏 |
| `--z-drawer` | 10000 | 移动端侧边栏（slide-menu） |
| `--z-toast` | 11000 | Toast 通知 |
| `--z-overlay` | 14000 | 搜索覆盖层、弹出遮罩 |
| `--z-modal` | 15000 | 模态框、确认弹窗 |

### 2.3 禁止硬编码 z-index 🔴

```javascript
// ❌ 禁止
el.style.zIndex = 9998;

// ✅ 正确
el.style.zIndex = 'var(--z-footer)';
```

> **例外**：tailwind.config.js 或 CSS 框架中预设的 `z-50` 等工具类，但应确保其值在层级体系中合理。

---

## 3. CSS 变量与品牌色约定

### 3.1 品牌色单源 🔴

品牌色**唯一来源**是 `tailwind.config.js`（通过 `theme.extend.colors.primary`）：

```javascript
// tailwind.config.js
colors: {
  primary: '#2E7D32',
  // ...
}
```

**不再**在 `styles.css` 中定义 `.text-primary` / `.bg-primary` / `.border-primary` 工具类——由 Tailwind 的 `npm run build:css` 生成。

### 3.2 CSS 变量 🟡

`styles.css` 的 `:root` 变量供 JS 回调和非 Tailwind 场景使用：

```css
:root {
  --color-primary: #2E7D32;
  --color-primary-10: rgba(46, 125, 50, 0.1);
  --color-primary-20: rgba(46, 125, 50, 0.2);
}
```

### 3.3 JS 中的品牌色读取 🔴

```javascript
var _theme = (window.SITE_CONFIG || {}).theme || {};
var _primary = ((_theme.colors || {}).primary) || "#2E7D32";
```

**所有 JS 模块必须通过 `window.SITE_CONFIG.theme.colors.primary` 读取品牌色**，不得硬编码色值。

### 3.4 产品线颜色体系 🟡

```css
--line-coffee: #6F4E37;
--line-tea: #4CAF50;
--line-meal: #FF8F00;
--line-beauty: #E91E63;
--line-weight: #00ACC1;
--line-gut: #8BC34A;
--line-lifestyle: #7C4DFF;
```

新增产品线时在 `styles.css` 的 `:root` 中添加 `--line-{slug}` 变量。

---

## 4. 页面路由规范 (SWUP)

> **架构变更 (2026-05-23)**: 手工编写的 spa-router.js (~1000 行) 已替换为 Swup v4.9.0 + 插件体系。所有 SPA 功能现在由 SWUP 原生处理。
> 参见 `docs/ARCHITECTURE.md` 和 `src/assets/js/swup-init.js`。

### 4.1 页面路径约定 🔴

所有静态页面以三屏形式存在于 `src/pages/` 下：

```
src/pages/home/index-pc.html       # PC 首页
src/pages/home/index-tablet.html     # Tablet 首页
src/pages/home/index-mobile.html    # Mobile 首页
src/pages/products/index-pc.html    # 产品列表 PC
src/pages/solutions/oem/index-pc.html
```

SWUP 通过 `routeToFetchUrl()` 函数将 SPA 路由路径映射到设备特定文件：

```
/home/              → /home/index-pc.html   （根据设备宽度选择后缀）
/products/          → /products/index-pc.html
/products/coffee/   → /products/coffee/index-pc.html
/news/detail/       → /news/detail/index-pc.html   （特殊别名）
```

### 4.2 设备后缀三屏 🔴

| 设备 | 文件后缀 | 视口宽度 |
|------|---------|---------|
| PC | `-pc.html` | `>= 1280px` |
| Tablet | `-tablet.html` | `768px ~ 1279px` |
| Mobile | `-mobile.html` | `< 768px` |

### 4.3 SWUP 初始化流程 🔴

```html
<!-- index.html SPA shell: 依赖加载顺序 -->
<script defer src="/assets/js/vendor/swup.umd.js"></script>                <!-- ① SWUP 核心 -->
<script defer src="/assets/js/vendor/swup-head-plugin.umd.js"></script>   <!-- ② head 更新插件 -->
<script defer src="/assets/js/vendor/swup-scroll-plugin.umd.js"></script> <!-- ③ 滚动管理 -->
<script defer src="/assets/js/vendor/swup-scripts-plugin.umd.js"></script><!-- ④ 脚本重执行 -->
<script defer src="/assets/js/vendor/swup-debug-plugin.umd.js"></script>  <!-- ⑤ 调试插件 -->
<script defer src="/assets/js/swup-init.js"></script>                     <!-- ⑥ 初始化 + 兼容层 -->
```

**关键 DOM 结构**:
```html
<!-- Navigator (SWUP persist: 跨页面保留) -->
<navigator data-swup-persist="nav" data-component="navigator" data-active="home"></navigator>

<!-- Skeleton overlay (先于 #spa-content 在 DOM 中，控制渐隐渐入) -->
<div id="skeleton-overlay">...</div>

<!-- SWUP 容器 (内容替换的目标) -->
<main id="spa-content"></main>

<!-- Footer (SWUP persist: 跨页面保留) -->
<footer data-swup-persist="footer" data-component="footer" data-active="home"></footer>
```

### 4.4 骨架屏过渡 🔴

骨架屏不再使用 `display: none` 瞬切，改用 CSS opacity 过渡：

| 阶段 | 时间 | 效果 |
|------|------|------|
| 骨架 fadeOut | 0-350ms | `opacity: 1 → 0`，`ease-out` |
| 内容 fadeIn | 350-700ms | `opacity: 0 → 1`，`ease-in`，延迟 350ms |

参见 `src/assets/css/skeleton.css` 和 `src/assets/js/swup-init.js` 中的 `hideSkeleton()`。

### 4.5 SpaRouter 兼容层 🟡

旧模块调用的 `SpaRouter.*` API 通过兼容层保留：

```javascript
window.SpaRouter = {
  navigate: function(path) { swup.navigate(url); },
  replace:  function(path) { swup.navigate(url, { history: "replace" }); },
  getCurrentPath: function() { return location.pathname; },
  _pendingScroll: null,
};
```

### 4.6 spa:load 事件兼容 🟡

约 18 个模块监听 `document.addEventListener("spa:load", ...)`，SWUP 在 `page:view` hook 中继续派发此事件以保持兼容。

---

## 5. 配置驱动模式

### 5.1 SITE_CONFIG 唯一配置源 🔴

所有运行时数据从 `SITE_CONFIG` 读取，严禁在 JS 模块中硬编码业务数据：

| 配置项 | 用途 | 对应的 JS 模块 |
|--------|------|---------------|
| `nav` | 导航结构 | navigator.js, slide-menu.js, mega-menu.js |
| `categories` | 产品分类 | product-grid.js, breadcrumb.js |
| `contacts` | 联系渠道 | contacts.js, floating-actions.js |
| `theme` | 主题色 | 所有 UI 模块 |
| `features` | 功能开关 | 各功能模块 |

### 5.2 Config 变更验证 🔴

修改 `site.config.js` 任何字段前**必须**检查反向依赖表（见 `docs/SITE-CONFIG.md`）。

### 5.3 fallback 默认值 🔴

所有 `SITE_CONFIG` 读取必须有 fallback 默认值，确保配置未加载时模块仍可正常运行：

```javascript
var _cfg = window.SITE_CONFIG || {};
var _nav = _cfg.nav || { items: [] };
```

---

## 6. SPA 内容提取规范

### 6.1 三层 Fallback 机制 🔴

`extractContent()` 使用三层 fallback：

1. **Method 1 — DOMParser + getElementById**：优先使用 DOM 解析
2. **Method 2 — getElementsByTagName**：DOM 解析失败时遍历 `<main>` 标签
3. **Method 3 — 正则提取**：最终 fallback，用 `/<main[^>]*id="spa-content"[^>]*>/i` 匹配后用 substring 截取

### 6.2 内容提取失败告警 🟡

```javascript
if (!result) {
  // 记录告警但不要白屏
  console.warn("[SPA] extractContent: all methods failed for", devicePath);
}
```

---

## 7. Footer / Bottom Tab 体系

### 7.1 统一底部导航 🟡

- **bottom-tab.js** — 配置驱动的统一底部导航栏（替代旧的 nav-footer.js）
- **nav-footer.js** — 不再使用，标记为 DEPRECATED
- 功能开关：`SITE_CONFIG.features.unifiedBottomNav === true` 时启用 bottom-tab

### 7.2 三屏底部导航 🟡

| 设备 | 显示项 | 数据源 |
|------|--------|-------|
| Mobile (<768px) | 4 项（首页/产品/解决方案/WhatsApp） | `SITE_CONFIG.footer.mobile` |
| Tablet (768-1023px) | 6 项 | `SITE_CONFIG.footer.tablet` |
| PC (>=1024px) | 隐藏（显示完整页脚） | — |

### 7.3 Footer 中 Trust Bar

Trust Bar（认证徽章栏）始终在页面 footer 之前渲染。Trust Bar 高度通过 CSS 变量 `--trust-bar-height` 供其他模块（如 slide-menu 的 scroll-hide）使用。

---

## 8. 主题色注入规范

### 8.1 JS 注入 CSS 的色值获取 🔴

```javascript
var _theme = (window.SITE_CONFIG || window._cfg || {}).theme || {};
var _primary = ((_theme.colors || {}).primary) || "#2E7D32";
var _primaryHover = ((_theme.colors || {}).primaryHover) || "#1B5E20";
```

### 8.2 JS 内嵌 CSS 的色值引用 🔴

在 `injectStyles()`、`render()` 等动态样式注入中，使用模板变量而非硬编码：

```javascript
// ✅ 正确
".my-element { color: " + _primary + "; }"

// ❌ 禁止
".my-element { color: #2E7D32; }"
```

### 8.3 dark 模式色值 🟡

所有 UI 模块必须提供 dark 模式色值对：

```css
/* light mode */
.my-element { color: rgba(46,125,50,.10); }
/* dark mode */
html.dark .my-element { color: rgba(46,125,50,.18); }
```

---

## 9. 其他架构约定

### 9.1 全局锚点滚动偏移

```css
[id] {
  scroll-margin-top: 80px;
}
```

### 9.2 全宽+内边距冲突修复

当 `w-full`（`width: 100%`）与 `fullwidth-bg`（负 margin-right）同时存在时：

```css
.fullwidth-bg.hero-banner.w-full {
  width: auto;
}
```

### 9.3 SPA 脚本延迟加载

`loadPageScripts()` 在 SPA 导航后动态注入页面级 `<script>` 标签：

```javascript
// spa-router.js 在 renderContent 之后自动调用
var scriptsPromise = _self.loadPageScripts(pagePath);
```

### 9.4 模块命名规范 🟡

| 模式 | 示例 | 说明 |
|------|------|------|
| `ui/{name}.js` | `ui/dropdown-base.js` | UI 组件模块 |
| 直接 `{name}.js` | `spa-router.js` | 核心功能模块 |
| 新模块 `ui/{name}.js` | `ui/bottom-tab.js` | 新增模块统一放 ui/ 目录 |

### 9.5 版本号自动注入

`build.sh` 在构建时自动将 `SITE_CONFIG.version` 写入 `src/index.html` 的 JS 引用 URL 中（`?v={version}`），确保浏览器缓存失效。

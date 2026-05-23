# ARCHITECTURE.md — 项目架构 v2.1

> **最后更新**：2026-05-23
> **当前架构**：SWUP SPA + SSG 三屏分离 + 骨架屏过渡

---

## 目录

1. [整体架构概览](#1-整体架构概览)
2. [请求处理流程](#2-请求处理流程)
3. [前端运行时架构](#3-前端运行时架构)
4. [SWUP SPA 路由系统](#4-swup-spa-路由系统)
5. [SSG 三屏构建系统](#5-ssg-三屏构建系统)
6. [骨架屏过渡系统](#6-骨架屏过渡系统)
7. [JS 模块完整索引](#7-js-模块完整索引)
8. [数据流](#8-数据流)
9. [构建与部署](#9-构建与部署)

---

## 1. 整体架构概览

```
                    请求进入
                       │
              ┌────────▼────────┐
              │   server.js     │  Express (Node.js)
              │   端口 3099     │
              │   dist/ 静态    │
              └────────┬────────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
    直接请求        首次访问       CDN/GitHub Pages
    /home/          /              静态部署
    返回 SSG      返回 index.html
    index-pc.html  SPA Shell
          │            │
          │       ┌────▼────┐
          │       │ SWUP 启用│
          │       │ 检测容器 │
          │       │ 状态     │
          │       └────┬────┘
          │         ┌──┴──┐
          │    容器空│      │容器有内容
          │         │      │(SSG模式)
          │    swup.│      │
          │    navigate│   │hideSkeleton()
          │    → fetch │   │→ 内容fadeIn
          │    当前路由│   │
          │         └──┘  │
          │               │
          └───────┬───────┘
                  │
            SWUP 接管导航
            客户端 SPA 路由
            每次导航→ fetch
            device-specific SSG
```

### 核心设计决策

| 决策 | 原因 |
|------|------|
| **SSG 预渲染 + SPA 客户端路由** | SEO 友好（每个 URL 有完整 HTML）+ 零刷新导航体验 |
| **三屏分离 (PC/Tablet/Mobile)** | 每种设备独立 HTML 布局，服务端无设备检测，客户端选择 |
| **SWUP v4.9.0** 替代手工 SPA Router | 消除 ~1000 行 DIY 代码，社区维护，原生 popstate/head/scroll |
| **SSG 作为 SWUP 数据源** | 导航时 fetch 设备特定 SSG HTML，SWUP 替换 `#spa-content` |
| **骨架屏 CSS 过渡** | `opacity` transition 代替 `display:none` 瞬切，视觉流畅 |

---

## 2. 请求处理流程

### 2.1 server.js 路由解析（`server.js:290-400`）

```
请求 /home/
  │
  ├─ path.join(dist, '/home/')           → 不存在（目录）
  ├─ path.join(dist, 'pages', '/home/')  → 不存在（目录）
  ├─ 尝试 index.html 变体:
  │   ├─ dist/pages/home/index.html       → 不存在
  │   ├─ dist/pages/home/index-pc.html    → 存在 ✅ 返回
  │   └─ dist/pages/home-pc.html          → 回退
  └─ 都不存在 → 返回 dist/index.html (SPA Shell)
```

### 2.2 三种运行模式

```text
模式 1: SPA Shell (首次从 / 访问)
  浏览器请求 / → server.js 返回 dist/index.html
  → index.html 中 #spa-content 为空
  → swup-init.js 检测容器为空 → swup.navigate("/home/")
  → SWUP fetch /home/index-pc.html → 内容填充 → hideSkeleton()

模式 2: SSG 预渲染 (直接访问 /home/)
  浏览器请求 /home/ → server.js 返回 dist/pages/home/index-pc.html
  → 页面包含完整的 HTML 内容和骨架屏标记
  → swup-init.js 检测容器有内容 → hideSkeleton() → 内容 fadeIn

模式 3: SSG 预渲染 (GitHub Pages / CDN)
  同模式 2，但不走 server.js
  → GitHub Pages 直接 serve dist/ 静态文件
  → 首次加载有真实内容（SEO 友好）
```

### 2.3 SWUP 导航流程（客户端 SPA 路由）

```
用户点击链接 <a href="/products/">
  │
  ├─ SWUP linkSelector 匹配 (同域、非 hash、非 mailto/tel)
  ├─ ignoreVisit 检查 (跳过 _blank、download、非页面路径)
  │
  ├─ [visit:start]  hook
  │   ├─ showSkeleton() — 骨架立刻可见 (无过渡)
  │   └─ 清除内容 .swup-fade-in 类
  │
  ├─ [fetch:request] replace hook
  │   └─ routeToFetchUrl("/products/") → "/products/index-pc.html"
  │      根据当前 viewport 宽度选择设备后缀
  │
  ├─ SWUP fetch /products/index-pc.html
  │
  ├─ [content:replace] hook
  │   ├─ hideSkeleton() — 骨架 fadeOut 350ms
  │   ├─ 内容填充 + 添加 .swup-fade-in (fadeIn 350ms, delay 350ms)
  │   ├─ runPageInitByRoute() — 页面级 JS 重初始化
  │   ├─ updateActiveState() — 更新 nav/footer 高亮
  │   └─ HeadPlugin 更新 <title>、meta、link
  │
  ├─ [page:view] hook
  │   └─ dispatchSpaLoad() — 派发 spa:load + spa:load:i18n 事件
  │
  ├─ ScriptsPlugin — 重新执行 data-swup-reload-script 脚本
  │
  └─ [visit:end] hook
      └─ __spaNavigating = false (延迟 100ms)
```

---

## 3. 前端运行时架构

### 3.1 脚本加载顺序（index.html 中 `<script>` 标签顺序）

```text
阶段 1: 配置注入 (最先执行，阻塞渲染)
  ├─ site.config.js          → window.SITE_CONFIG (全局配置)
  └─ theme-init.js           → CSS 变量初始化 (颜色主题)

阶段 2: Vendor 库 (阻塞，dom-utils/spa-events 先于它们)
  ├─ dom-utils.js            → DOM helper (无依赖)
  ├─ spa-events.js           → SPA 事件系统 (无依赖)
  ├─ swup.umd.js             → SWUP 核心 v4.9.0
  ├─ swup-head-plugin.umd.js
  ├─ swup-scroll-plugin.umd.js
  ├─ swup-scripts-plugin.umd.js
  └─ swup-debug-plugin.umd.js

阶段 3: 核心引擎 (排序关键)
  ├─ init.js                 → User activity tracking (立即执行)
  ├─ device-utils.js         → 设备检测 & __spaNavigating
  ├─ dropdown-base.js        → 下拉菜单基类
  ├─ dropdown-styles.js      → 下拉菜单样式
  ├─ currency.js             → 货币选择器
  ├─ mega-menu.js            → 折叠展开逻辑 ⚠️ 必须在 swup-init 前
  └─ swup-init.js            → SWUP 初始化 + SpaRouter 兼容层

阶段 4: UI 组件
  ├─ navigator.js            → PC/Tablet 顶部导航
  ├─ footer.js               → 页脚
  ├─ floating-actions.js     → Mobile FAB
  ├─ smart-popup.js          → 智能弹窗
  └─ ... (其余 UI 组件)

阶段 5: 业务模块 + 构建产物
  ├─ compare.js, profit-calculator.js, translations.js, ...
  └─ bundle.js (webpack 产物，开发者模式)
```

### 3.2 模块分类

```text
配置层 (1个文件)
  └─ site.config.js          站点唯一配置入口，所有模块通过它读取配置

核心引擎层 (4个文件)
  ├─ init.js                 用户活动追踪 + 智能弹窗触发
  ├─ device-utils.js         设备检测、断点匹配
  ├─ swup-init.js            SWUP 初始化、路由映射、骨架屏控制
  └─ spa-events.js           SPA 自定义事件系统

UI 组件层 (20+ 文件)
  ├─ navigator.js            PC/Tablet 导航 (data-component="navigator")
  ├─ footer.js               页脚 (data-component="footer")
  ├─ floating-actions.js     Mobile FAB (浮动操作按钮)
  ├─ smart-popup.js          智能弹窗 (定时/滚动/点击触发)
  ├─ mega-menu.js            导航折叠展开 (移动端适配)
  ├─ dropdown-base.js        下拉菜单基类 (抽象类)
  ├─ nav-dropdown.js         导航下拉
  ├─ products-dropdown.js    产品分类下拉
  ├─ applications-dropdown.js 应用场景下拉
  ├─ support-dropdown.js     支持中心下拉
  ├─ contact-dropdown.js     联系下拉
  ├─ about-dropdown.js       关于下拉
  ├─ currency.js             货币切换
  ├─ search-engine.js        站内搜索
  ├─ trust-bar.js            信任栏 (认证/客户评价)
  ├─ hero-video.js           Hero 区域视频背景
  ├─ slide-menu.js           移动端侧滑菜单
  ├─ bottom-tab.js           Mobile 底部 Tab 导航
  ├─ page-effects.js         页面动效 (视差/滚动触发)
  ├─ form-interactions.js    表单交互
  ├─ pi-maps.js              Google Maps 集成
  └─ custom-select.js        自定义下拉选择器

业务模块层 (15+ 文件)
  ├─ translations.js         国际化引擎 (18 种语言)
  ├─ product-grid.js         产品网格 (筛选/搜索/分页)
  ├─ product-detail.js       产品详情页
  ├─ product-list.js         产品数据处理
  ├─ product-data-table.js   产品数据表格
  ├─ compare.js              产品对比
  ├─ profit-calculator.js    利润计算器
  ├─ quote-form.js           报价表单
  ├─ quote-budget-i18n.js    报价预算国际化
  ├─ home-core-products.js   首页核心产品展示
  ├─ case-grid.js            案例网格
  ├─ cases-page.js           案例页
  ├─ cross-sell.js           搭配推荐 (交叉销售)
  ├─ breadcrumb.js           面包屑导航
  ├─ contacts.js             联系信息
  ├─ image-assets.js         图片路径映射
  ├─ roi-data.js             ROI 数据
  ├─ support-contact-channels.js 支持渠道
  └─ support-wechat-modal.js 微信弹窗

工具层 (3个文件)
  ├─ utils.js                通用工具函数
  ├─ dom-utils.js            DOM helper
  └─ spa-events.js           SPA 事件系统

兼容层 (1个文件，保留但不再使用)
  └─ spa-router.js           旧版 SPA 路由器 (~1000 行，已废弃)
                              通过 spa-events.js 桥接，与 SWUP 共存
```

---

## 4. SWUP SPA 路由系统

### 4.1 核心文件

| 文件 | 行数 | 作用 |
|------|------|------|
| `src/assets/js/swup-init.js` | 417 | 初始化 SWUP、定义 hooks、向前兼容层 |
| `src/assets/js/vendor/swup.umd.js` | vendor | SWUP v4.9.0 核心 |
| `src/assets/js/vendor/swup-head-plugin.umd.js` | vendor | `<head>` 内容替换 |
| `src/assets/js/vendor/swup-scroll-plugin.umd.js` | vendor | 滚动位置恢复 |
| `src/assets/js/vendor/swup-scripts-plugin.umd.js` | vendor | optin 模式脚本重执行 |
| `src/assets/js/vendor/swup-debug-plugin.umd.js` | vendor | 开发调试日志 |

### 4.2 关键机制

#### 4.2.1 设备感知 URL 映射（`routeToFetchUrl`）

```
用户看到的 URL           SWUP 实际 fetch 的 URL (PC)
─────────────────────    ──────────────────────────
/                        /home/index-pc.html
/home/                   /home/index-pc.html
/products/               /products/index-pc.html
/products/coffee/        /products/coffee/index-pc.html
/products/GM-2800A/     /products/detail/index-pc.html
/cases/                  /cases/index-pc.html
/cases/bangkok-.../      /cases/bangkok-chain-8-stores/index.html
/news/detail/            /news/detail/index-pc.html
/about/                  /about/index-pc.html
```

- PC (`width >= 1280`): `index-pc.html`
- Tablet (`768 <= width < 1280`): `index-tablet.html`
- Mobile (`width < 768`): `index-mobile.html`

#### 4.2.2 `data-swup-persist` — 持久化元素

SWUP 默认替换 `#spa-content` 内所有内容。以下元素通过 `data-swup-persist` 标记为"导航时不替换"：

```html
<navigator data-component="navigator"
           data-swup-persist="nav"
           data-active="home">...</navigator>

<footer data-component="footer"
        data-swup-persist="footer"
        data-active="home">...</footer>
```

所有 111 个 SSG 页面必须包含这两个 persist 元素。

#### 4.2.3 `window.SpaRouter` 向前兼容层

约 15 个旧模块仍通过 `window.SpaRouter.navigate(path)` 调用导航。swup-init.js 提供兼容 Shim：

```javascript
window.SpaRouter = {
  navigate: function(path) { swup.navigate(url); },
  replace:  function(path) { swup.navigate(url, { history: "replace" }); },
  getCurrentPath: function() { /* 从 location.pathname 解析 */ },
};
```

#### 4.2.4 SWUP Hooks 流转

```
enable      → 首次启动：空容器→navigate 或 hideSkeleton
visit:start → showSkeleton() + 清除 .swup-fade-in
fetch:request → routeToFetchUrl() 改写 fetch URL
content:replace → hideSkeleton() + runPageInitByRoute() + updateActiveState()
page:view   → dispatchSpaLoad() 派发兼容事件
visit:end   → __spaNavigating = false
```

---

## 5. SSG 三屏构建系统

### 5.1 页面层级映射

```
src/pages/
├── home/
│   ├── index.html         → dist/pages/home/index.html
│   ├── index-pc.html      → dist/pages/home/index-pc.html
│   ├── index-mobile.html  → dist/pages/home/index-mobile.html
│   └── index-tablet.html  → dist/pages/home/index-tablet.html
├── products/
│   ├── (同上三屏)
│   ├── all/
│   │   └── (同上三屏)
│   ├── coffee/
│   │   └── (同上三屏)
│   └── detail/
│       └── (同上三屏)
├── about/
├── contact/
├── cases/
│   ├── (同上三屏)
│   ├── bangkok-chain-8-stores/
│   │   └── index.html     → 案例详情页（不分离三屏）
│   └── ...
├── applications/
│   ├── canteen/
│   ├── chain-restaurant/
│   └── ...
├── news/
│   └── detail/
├── quote/
├── support/
├── landing/
├── thank-you/
└── profit-calculator/
```

### 5.2 构建流程

```
build.sh (触发: npm run build / pre-push hook)
│
├─ 1. 预检: src/index.html 大小检查 (>1000 bytes)
│
├─ 2. HTML 页面同步: src/pages/**/*.html → dist/pages/
│
├─ 3. 资源同步:
│   ├─ src/assets/js/**/*.js   → dist/assets/js/
│   ├─ src/assets/css/**/*.css  → dist/assets/css/
│   ├─ src/assets/fonts/        → dist/assets/fonts/
│   ├─ src/assets/lang/*.json   → dist/assets/lang/
│   ├─ src/assets/images/       → dist/assets/images/ (增量)
│   └─ src/assets/video/        → dist/assets/video/ (增量)
│
├─ 4. SPA Shell: src/index.html → dist/index.html
│
├─ 5. 版本戳: 所有 dist/*.html 中 ?v=OLD → ?v=202605231400
│
├─ 6. sitemap.xml 生成 (29 URLs)
│
└─ 完成: 777 files in dist/
```

**产出统计**：
- 111 个 SSG HTML 文件
- 61 个 JS 文件
- 777 个 dist/ 总文件

### 5.3 server.js 静态服务

```javascript
// dist/ 作为静态根
app.use(express.static(path.join(__dirname, 'dist'), {
  maxAge: '1h',
  setHeaders: function(res, path) {
    if (path.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  }
}));

// 所有未匹配路由 → 尝试 SSG 页面
// 都不存在 → 返回 SPA Shell (dist/index.html)
```

---

## 6. 骨架屏过渡系统

### 6.1 架构

```html
<div id="skeleton-overlay" class="skeleton-page">
  <!-- 骨架屏内容 (页面布局骨架) -->
</div>
<div id="spa-content">
  <!-- SWUP 替换此容器内容 -->
</div>
```

### 6.2 CSS transition 方案

```css
/* 骨架可见状态 (默认) */
#skeleton-overlay {
  opacity: 1;
  transition: opacity 350ms ease-out;
}

/* 骨架隐藏 → 渐隐 */
#skeleton-overlay[hidden] {
  opacity: 0;
  pointer-events: none;  /* 隐藏后不阻止点击 */
}

/* 内容在骨架渐隐后渐入 (350ms delay) */
#spa-content {
  opacity: 0;
  transition: opacity 350ms ease-in 350ms;
}

/* SWUP 填充后触发渐入 */
#spa-content.swup-fade-in {
  opacity: 1;
}
```

### 6.3 过渡时序

```
SSG 模式 (页面已有内容):
  0ms     → hideSkeleton() 设置 [hidden] → 骨架 opacity:1→0 (350ms)
  350ms   → 骨架完全不可见
  350ms   → #spa-content opacity:0→1 (350ms, delay 350ms)
  700ms   → 内容完全可见 ✅

SPA Shell 模式 (首次加载):
  0ms     → 骨架默认可见
  SWUP navigate → enable hook 检测容器为空
  fetch /home/index-pc.html
  content:replace → hideSkeleton() → 同上时序
  700ms   → 内容完全可见 ✅

SPA 导航 (切换页面):
  0ms     → [visit:start] showSkeleton() → 骨架立刻可见 (无过渡)
           (先设 transition:none → 移除 hidden → 强制重绘 → 恢复 transition)
  fetch 目标页面
  [content:replace] → hideSkeleton() → 同上时序
  700ms   → 新内容完全可见 ✅
```

### 6.4 安全兜底

```javascript
// 3 秒超时强制隐藏骨架屏
global._skDebugTimer = setTimeout(ensureSkeletonHidden, 3000);
```

---

## 7. JS 模块完整索引

### 7.1 按加载顺序索引

| 顺序 | 文件 | 大小 | 输出 | 依赖 |
|------|------|------|------|------|
| V1 | `site.config.js` | ~36KB | `window.SITE_CONFIG` | 无 |
| V2 | `theme-init.js` | ~2KB | CSS 变量 | SITE_CONFIG |
| V3 | `dom-utils.js` | ~3KB | DOM helper | 无 |
| V4 | `spa-events.js` | ~2KB | SPA 事件系统 | 无 |
| V5 | `swup.umd.js` | vendor | `window.Swup` | 无 |
| V6-9 | swup plugins | vendor | `Swup*Plugin` | Swup |
| V10 | `init.js` | ~5KB | `window.userActivity` | SITE_CONFIG |
| V11 | `device-utils.js` | ~8KB | device detection | 无 |
| V12 | `dropdown-base.js` | ~4KB | dropdown base class | 无 |
| V13 | `dropdown-styles.js` | ~2KB | dropdown CSS | 无 |
| V14 | `currency.js` | ~3KB | currency selector | dropdown-base |
| V15 | `mega-menu.js` | ~5KB | nav collapse | device-utils |
| **V16** | **`swup-init.js`** | **~12KB** | **SWUP + SpaRouter** | **Swup + plugins** |
| V17+ | UI 组件 | | | navigator/footer 等 |
| V30+ | 业务模块 | | | product-grid 等 |

### 7.2 页面级重初始化映射

`runPageInitByRoute()` 在 SWUP 每次导航后重新执行对应模块的 `init()`：

| URL 模式 | 重初始化模块 |
|----------|-------------|
| `/home/` | `HomeCoreProducts.init()` |
| `/products/(all\|coffee\|...)/` | `ProductGrid.init()` + `CrossSell.init()` |
| `/products/detail/` | `ProductDetail.init()` |
| `/cases/` | `CasesPage.init()` + `CaseGrid.init()` |
| `/news/detail/` | `NewsDetail.init()` |

### 7.3 关键模块间通信

```
┌─────────────────┐
│  site.config.js  │── 被所有模块读取
└────────┬────────┘
         │
    ┌────▼────────────────────────────┐
    │        swup-init.js              │
    │  window.SpaRouter (兼容层)       │
    └────┬──────────────────────┬──────┘
         │                      │
    ┌────▼─────┐          ┌─────▼──────┐
    │ spa-events│←──触发──│ SWUP hooks │
    │ .js       │          │ (page:view)│
    └────┬─────┘          └────────────┘
         │
    ┌────▼─────────────────┐
    │  15+ 业务模块监听     │
    │  document "spa:load"  │
    │  "spa:load:i18n"      │
    └──────────────────────┘
```

---

## 8. 数据流

### 8.1 配置 → 页面渲染

```
site.config.js
  ├─ brand.name, contacts.* → 所有页面直接读取
  ├─ nav.items → navigator.js 渲染导航菜单
  ├─ products (外部 JSON) → product-grid.js 渲染产品列表
  └─ seo.* → SSG 构建时注入 <meta> 标签

┌─────────────────────┐
│   SSG 构建时注入     │
│   <script>           │
│   window.SITE_CONFIG │ = { brand, contacts, nav, ... }
│   </script>          │
└─────────────────────┘
         │
    ┌────▼─────┐
    │ HTML 页面 │
    │ 硬编码    │
    │ 品牌名/   │
    │ 联系方式  │
    └──────────┘
```

### 8.2 国际化数据流

```
src/assets/lang/
  ├─ en.json, zh-CN.json, th.json, ...
  └─ (17+ 语言文件)

↓ build.sh 同步到 dist/assets/lang/

translations.js
  ├─ fetch 当前语言 JSON
  ├─ 遍历 [data-i18n] 属性替换文本
  └─ SPA 导航后 → 监听 spa:load:i18n → 重新翻译

产品数据 (外部 JSON)
  ├─ 通过 site.config.js 指定 URL
  └─ product-grid.js fetch → 渲染
```

### 8.3 SWUP 导航数据流

```
用户点击 <a href="/products/coffee/">
  │
  ├─ SWUP 拦截 click → preventDefault
  ├─ routeToFetchUrl("/products/coffee/") → "/products/coffee/index-pc.html"
  ├─ fetch /products/coffee/index-pc.html
  │   └─ 返回完整 SSG HTML (含 <navigator>, <footer>, #spa-content 内容)
  │
  ├─ SWUP 解析 HTML
  │   ├─ HeadPlugin 提取 <title>, <meta>, <link> → 更新 <head>
  │   ├─ 提取 #spa-content 内容 → 替换当前 #spa-content
  │   ├─ 保留 [data-swup-persist] 元素 (navigator, footer)
  │   └─ ScriptsPlugin 重新执行 [data-swup-reload-script] 脚本
  │
  ├─ content:replace hook
  │   ├─ 从 incoming HTML 提取 data-active 值
  │   ├─ Navigator.updateActive("products") 更新导航高亮
  │   └─ Footer.updateActive("products") 更新页脚高亮
  │
  └─ pushState → 地址栏更新为 /products/coffee/
     但 fetch 实际获取的是 /products/coffee/index-pc.html
```

---

## 9. 构建与部署

### 9.1 开发环境

```bash
# 启动开发服务器 (端口 3099)
npm run dev           # nodemon server.js

# 并行构建 (文件变更自动重构建)
npm run watch         # fswatch src/ → ./build.sh

# 手动构建
npm run build         # ./build.sh

# 运行 E2E 测试
npm run test:e2e      # npx playwright test
```

### 9.2 生产环境

```bash
# 生产构建 (含 webpack)
npm run build:production

# 产物: dist/ (777 files)
#   - dist/index.html (SPA Shell)
#   - dist/pages/*/index-{pc,mobile,tablet}.html (111 SSG pages)
#   - dist/assets/js/ (61 JS files)
#   - dist/assets/css/ (CSS)
#   - dist/sitemap.xml (29 URLs)
```

### 9.3 部署目标

| 目标 | 配置 |
|------|------|
| **GitHub Pages** | 直接 serve `dist/`，自定义域名 `www.kitchen.yukoli.com` |
| **Node.js Server** | `server.js` 端口 3099，静态 serve `dist/` |
| **CDN** | `dist/` 目录上传，配置 SPA fallback (404→index.html) |

### 9.4 版本戳机制

```text
build.sh 在每次构建时将 ?v=OLD_TIMESTAMP 替换为 ?v=CURRENT_TIMESTAMP

目的: 缓存爆破 (cache busting)
生效范围: 所有 dist/*.html 中的 <script src="...?v=...">
          以及 <link href="...?v=..."> 引用
```

### 9.5 pre-push Hook 验证链

```
git push origin scaffold/v1.0
  │
  ├─ branch-protect: 检查是否保护分支
  ├─ build-smoke: npm run build (完整构建)
  ├─ project-lint: 12 项代码质量检查
  │   ├─ JS 语法检查 (node -c)
  │   ├─ JSON 格式检查
  │   ├─ HTML 标签闭合检查
  │   ├─ Config Bridge 一致性
  │   ├─ 品牌硬编码检查
  │   ├─ console.log 泄露检查
  │   ├─ style 赋值 Bug 检查
  │   ├─ 大文件检查 (>50MB)
  │   ├─ 'use strict' 检查
  │   ├─ ES6+ 语法检测 (项目要求 ES5)
  │   ├─ 未 guard 的 JSON.parse / fetch
  │   └─ 硬编码 URL 检查
  └─ syntax-all: (保留钩子)
```

---

## 附录 A: 目录完整树

```
BrewYuKoLi/
├── src/
│   ├── index.html                     ← SPA Shell (SWUP 入口)
│   ├── 404.html
│   ├── robots.txt
│   ├── pages/                         ← SSG 页面源
│   │   ├── home/
│   │   │   ├── index.html
│   │   │   ├── index-pc.html
│   │   │   ├── index-mobile.html
│   │   │   └── index-tablet.html
│   │   ├── products/
│   │   │   ├── (同上三屏)
│   │   │   ├── all/ (同上)
│   │   │   ├── coffee/ (同上)
│   │   │   └── detail/
│   │   ├── about/
│   │   ├── contact/
│   │   ├── cases/
│   │   │   └── bangkok-chain-8-stores/index.html
│   │   ├── applications/
│   │   │   ├── canteen/
│   │   │   ├── chain-restaurant/
│   │   │   ├── central-kitchen/
│   │   │   ├── cloud-kitchen/
│   │   │   ├── food-factory/
│   │   │   ├── menu-lab/
│   │   │   └── small-restaurant/
│   │   ├── news/detail/
│   │   ├── quote/
│   │   ├── support/
│   │   ├── landing/
│   │   ├── thank-you/
│   │   └── profit-calculator/
│   └── assets/
│       ├── js/
│       │   ├── site.config.js         ← 站点配置
│       │   ├── swup-init.js           ← SWUP 初始化 + 兼容层
│       │   ├── spa-router.js          ← 旧版 SPA Router (废弃)
│       │   ├── init.js, main.js, utils.js
│       │   ├── translations.js
│       │   ├── product-grid.js, product-detail.js, product-list.js
│       │   ├── compare.js, profit-calculator.js
│       │   ├── quote-form.js, quote-budget-i18n.js
│       │   ├── case-grid.js, cases-page.js
│       │   ├── home-core-products.js, cross-sell.js
│       │   ├── breadcrumb.js, contacts.js, image-assets.js
│       │   ├── lang-registry.js, device-utils.js, ...
│       │   ├── ui/
│       │   │   ├── navigator.js, footer.js, floating-actions.js
│       │   │   ├── mega-menu.js, nav-dropdown.js, dropdown-base.js
│       │   │   ├── smart-popup.js, search-engine.js
│       │   │   ├── hero-video.js, slide-menu.js
│       │   │   ├── page-effects.js, trust-bar.js
│       │   │   ├── support-dropdown.js, contact-dropdown.js
│       │   │   ├── products-dropdown.js, applications-dropdown.js
│       │   │   ├── about-dropdown.js, form-interactions.js
│       │   │   ├── pi-maps.js, custom-select.js
│       │   │   └── helpers.js
│       │   ├── utils/
│       │   │   ├── device-utils.js
│       │   │   ├── dom-utils.js
│       │   │   └── spa-events.js
│       │   └── vendor/
│       │       ├── swup.umd.js
│       │       ├── swup-head-plugin.umd.js
│       │       ├── swup-scroll-plugin.umd.js
│       │       ├── swup-scripts-plugin.umd.js
│       │       ├── swup-debug-plugin.umd.js
│       │       ├── chart.umd.min.js
│       │       ├── html2canvas.min.js
│       │       └── jspdf.umd.min.js
│       ├── css/
│       │   ├── styles.css
│       │   ├── skeleton.css
│       │   ├── tailwind.css
│       │   ├── performance-optimizations.css
│       │   └── z-index-system.css
│       ├── lang/ (zh-CN.json, en.json, th.json, ...)
│       ├── images/, fonts/, video/
│       └── ...
├── dist/                              ← 构建产物 (777 files)
│   ├── index.html                     ← SPA Shell
│   ├── site.config.js                 ← 配置副本
│   ├── pages/                         ← SSG 页面 (111 HTML)
│   ├── assets/                        ← 资源副本
│   └── sitemap.xml
├── docs/                              ← 项目文档
│   ├── ARCHITECTURE.md                ← 本文档
│   ├── DEV-STANDARDS.md               ← 开发规范 (13 章)
│   ├── MULTI-AGENT-OPERATIONS.md      ← 多 Agent 协作规范
│   ├── SCAFFOLD-USAGE.md              ← 脚手架使用指南
│   ├── TESTING.md                     ← 测试规范
│   ├── BUILD.md                       ← 构建说明
│   ├── SECURITY.md                    ← 安全规范
│   └── ...
├── tests/
│   └── e2e/
│       ├── smoke.spec.js              ← 基础冒烟测试
│       └── swup-navigation.spec.js    ← SWUP 导航 P0 测试
├── scripts/
│   ├── build.sh                       ← 主构建脚本
│   ├── build-ssg.js                   ← SSG 构建 (webpack 模式)
│   ├── lint-code.js                   ← 代码质量检查
│   ├── generate-sitemap.js            ← sitemap 生成
│   └── ...
├──
# DATA-FLOW.md — 数据流详解

> **最后更新**：2026-05-23
> **目的**：追踪数据从源头到渲染的完整路径，帮助理解"改这里会影响哪里"

---

## 目录

1. [数据流全景图](#1-数据流全景图)
2. [配置数据流](#2-配置数据流)
3. [页面渲染数据流](#3-页面渲染数据流)
4. [国际化数据流](#4-国际化数据流)
5. [产品数据流](#5-产品数据流)
6. [SWUP 导航数据流](#6-swup-导航数据流)
7. [事件数据流](#7-事件数据流)
8. [调用链追踪](#8-调用链追踪)

---

## 1. 数据流全景图

```
┌─────────────────────────────────────────────────────────────────┐
│                        构建时 (build.sh)                         │
│                                                                  │
│  site.config.js ──→ SSG HTML 注入 ──→ dist/pages/*/index-*.html │
│  src/pages/*.html ──→ 复制 ──→ dist/pages/*/index-*.html        │
│  src/assets/js/* ──→ 复制 ──→ dist/assets/js/*                  │
│  src/assets/lang/* ──→ 复制 ──→ dist/assets/lang/*              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        运行时 (浏览器)                            │
│                                                                  │
│  dist/index.html (SPA Shell)                                     │
│    │                                                             │
│    ├─ <script> site.config.js                                    │
│    │   └─→ window.SITE_CONFIG                                    │
│    │                                                             │
│    ├─ <script> swup.umd.js                                       │
│    │   └─→ window.Swup                                           │
│    │                                                             │
│    ├─ <script> swup-init.js                                      │
│    │   ├─→ initSwup() ──→ new Swup({...})                        │
│    │   └─→ window.SpaRouter (兼容层)                             │
│    │                                                             │
│    ├─ <navigator> (data-swup-persist)                            │
│    │   └─→ navigator.js render                                  │
│    │                                                             │
│    ├─ <footer> (data-swup-persist)                               │
│    │   └─→ footer.js render                                     │
│    │                                                             │
│    └─ #spa-content (SWUP 管理)                                   │
│        └─→ fetch SSG HTML ──→ 内容填充                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 配置数据流

### 2.1 site.config.js → 全局变量

```
site.config.js
  │
  ├─ window.SITE_CONFIG = { brand, seo, contacts, nav, ... }
  │
  ├─ 被以下模块读取:
  │   ├─ init.js           → _primary 颜色
  │   ├─ navigator.js      → 导航菜单渲染
  │   ├─ footer.js         → 页脚内容
  │   ├─ translations.js   → 品牌名等翻译
  │   ├─ product-grid.js   → 产品列表 URL
  │   ├─ contact-dropdown.js
  │   ├─ support-dropdown.js
  │   └─ smart-popup.js    → 弹窗触发条件
  │
  └─ 被 SSG HTML 内联注入:
      <script>
      window.SITE_CONFIG = { ... };
      </script>
```

### 2.2 关键配置项及影响模块

| 配置项 | 路径 | 消费模块 |
|--------|------|---------|
| `brand.name` | `SITE_CONFIG.brand.name` | navigator, footer, translations, 所有页面 meta |
| `brand.logo` | `SITE_CONFIG.brand.logo` | navigator.js (渲染 logo 图片) |
| `contacts.whatsapp` | `SITE_CONFIG.contacts.whatsapp` | smart-popup, contact-dropdown, floating-actions |
| `contacts.social.*` | `SITE_CONFIG.contacts.social` | footer.js |
| `nav.items` | `SITE_CONFIG.nav.items` | navigator.js, mega-menu.js |
| `seo.*` | `SITE_CONFIG.seo` | SSG 构建注入 <meta> |
| `theme.colors.primary` | `SITE_CONFIG.theme.colors.primary` | init.js (CSS 变量) |

---

## 3. 页面渲染数据流

### 3.1 SSG 模式 (直接访问 `/home/`)

```
浏览器请求 /home/
  │
  ├─ server.js 路由解析
  │   └─→ dist/pages/home/index-pc.html (根据请求无设备检测)
  │
  ├─ 返回完整 HTML
  │   │
  │   ├─ <head> (原始 <meta>, <link>, <script>)
  │   ├─ <navigator> (Hardcoded HTML + data-swup-persist)
  │   ├─ #spa-content (预渲染的页面内容)
  │   └─ <footer> (Hardcoded HTML + data-swup-persist)
  │
  └─ 浏览器解析
      │
      ├─ 顺序执行 <script>
      │   ├─ site.config.js → window.SITE_CONFIG
      │   ├─ swup.umd.js → window.Swup
      │   └─ swup-init.js → initSwup()
      │       │
      │       ├─ enable hook: 检测 #spa-content 有内容
      │       │   └─→ hideSkeleton() → 骨架 fadeOut → 内容 fadeIn
      │       │
      │       └─ SWUP 初始化完成，后续点击为 SPA 导航
      │
      ├─ navigator.js → 读取 SITE_CONFIG.nav.items → 渲染菜单
      ├─ footer.js → 读取 SITE_CONFIG.contacts → 渲染页脚
      ├─ product-grid.js → fetch 产品 JSON → 渲染列表
      └─ translations.js → fetch 语言 JSON → 翻译页面
```

### 3.2 SPA Shell 模式 (首次访问 `/`)

```
浏览器请求 /
  │
  ├─ server.js: / → 重定向或返回 dist/index.html
  │
  ├─ swup-init.js 启动部分:
  │   #spa-content 为空
  │
  ├─ initSwup()
  │   ├─ enable hook: 检测容器为空
  │   └─→ swup.navigate("/home/", { history: "replace" })
  │       │
  │       ├─ routeToFetchUrl("/home/") → "/home/index-pc.html"
  │       ├─ fetch /home/index-pc.html
  │       ├─ content:replace: 提取 #spa-content → 填充
  │       └─ hideSkeleton() → 内容 fadeIn
  │
  └─ 之后同 SSG 模式流程
```

---

## 4. 国际化数据流

### 4.1 语言文件结构

```
src/assets/lang/
├── en.json        ← 英语 (默认)
├── zh-CN.json     ← 简体中文
├── zh-TW.json     ← 繁体中文
├── th.json        ← 泰语
├── vi.json        ← 越南语
├── id.json        ← 印尼语
├── ja.json        ← 日语
├── ko.json        ← 韩语
├── de.json        ← 德语
├── fr.json        ← 法语
├── es.json        ← 西班牙语
├── pt.json        ← 葡萄牙语
├── ar.json        ← 阿拉伯语
├── ru.json        ← 俄语
├── hi.json        ← 印地语
├── ms.json        ← 马来语
└── my.json        ← 缅甸语

格式:
{
  "nav.home": "Home",
  "nav.products": "Products",
  "hero.title": "Smart Kitchen Equipment",
  ...
}
```

### 4.2 翻译流程

```
用户切换语言 (语言下拉菜单)
  │
  ├─ currency.js / dropdown 触发
  │   └─→ localStorage.setItem("preferred-language", "zh-CN")
  │
  ├─ translations.js
  │   ├─ fetch /assets/lang/zh-CN.json
  │   ├─ 遍历 document.querySelectorAll("[data-i18n]")
  │   │   对每个: el.textContent = translations[key]
  │   └─ 遍历 document.querySelectorAll("[data-i18n-placeholder]")
  │       对每个: el.placeholder = translations[key]
  │
  └─ dispatchEvent("spa:load:i18n")
      └─→ 所有监听翻译事件的模块重新渲染
```

### 4.3 SPA 导航后的翻译恢复

```
SWUP 导航 → content:replace
  │
  ├─ 新内容包含 [data-i18n] 属性
  │
  └─ page:view hook
      └─→ dispatchSpaLoad()
          └─→ dispatchEvent("spa:load:i18n")
              └─→ translations.js 重新翻译新内容
```

---

## 5. 产品数据流

### 5.1 产品数据源

```
外部 JSON API (URL 在 site.config.js 中配置)
  │
  ├─ product-grid.js
  │   ├─ fetch(API_URL + "/products.json")
  │   ├─ 解析产品列表
  │   ├─ 根据分类筛选 (all / coffee / tea / ...)
  │   ├─ 搜索功能: 产品名、描述
  │   └─ 渲染 DOM: 产品卡片 (图片、名称、描述、价格)
  │
  ├─ product-detail.js
  │   ├─ 从 URL 提取产品型号: /products/GM-2800A/
  │   ├─ fetch(API_URL + "/products/GM-2800A.json")
  │   └─ 渲染详情页 (规格、参数、图片画廊)
  │
  ├─ compare.js
  │   ├─ localStorage 管理对比列表
  │   ├─ 最多 4 个产品对比
  │   └─ 渲染对比表
  │
  ├─ cross-sell.js
  │   ├─ 根据当前产品/分类推荐相关产品
  │   └─ 渲染推荐卡片
  │
  └─ product-list.js
      └─→ 数据处理 (筛选、排序、分页)
```

### 5.2 产品数据 → UI 更新路径

```
网络请求
  API → JSON → product-grid.js
                      │
                      ├─ 数据转换
                      │   ├─ 分类筛选 (当前页面类型)
                      │   └─ 搜索过滤 (用户输入)
                      │
                      ├─ 渲染
                      │   ├─ product-grid → productListDiv.innerHTML
                      │   └─ 事件绑定 (点击、对比)
                      │
                      └─ 分页
                          └─ 更多产品加载
```

---

## 6. SWUP 导航数据流

### 6.1 完整导航链路

```
[用户点击链接]
  │
  ├─ SWUP intercept
  │   ├─ preventDefault (阻止浏览器默认导航)
  │   └─ 提取 href
  │
  ├─ visit:start hook
  │   └─→ showSkeleton() + 清除 .swup-fade-in
  │
  ├─ fetch:request replace hook
  │   ├─ routeToFetchUrl(href)
  │   │   根据 viewport 宽度:
  │   │   width < 768  → index-mobile.html
  │   │   768-1279     → index-tablet.html
  │   │   >= 1280      → index-pc.html
  │   └─→ 改写 fetch URL
  │
  ├─ SWUP fetch 设备特定 SSG HTML
  │
  ├─ SWUP 解析 incoming HTML
  │   ├─ HeadPlugin: 提取 <title>, <meta>, <link>
  │   │   → document.head 更新
  │   │
  │   ├─ 提取 #spa-content 内容
  │   │   → 替换当前 #spa-content
  │   │
  │   ├─ 保留 [data-swup-persist] 元素
  │   │   ├─ <navigator data-swup-persist="nav">
  │   │   └─ <footer data-swup-persist="footer">
  │   │
  │   └─ ScriptsPlugin: 重新执行 [data-swup-reload-script]
  │
  ├─ content:replace hook
  │   ├─ hideSkeleton() → 骨架 fadeOut
  │   ├─ .swup-fade-in → 内容 fadeIn
  │   ├─ runPageInitByRoute() → 重新初始化页面模块
  │   └─ updateActiveState() → 更新 nav/footer 高亮
  │       ├─ extractActiveNav(html) → Navigator.updateActive()
  │       └─ extractActiveFooter(html) → Footer.updateActive()
  │
  ├─ page:view hook
  │   └─→ dispatchSpaLoad() → spa:load + spa:load:i18n 事件
  │
  └─ visit:end hook
      └─→ __spaNavigating = false (延迟 100ms)
```

### 6.2 设备感知路由映射表

| 用户路径 | PC Fetch | Tablet Fetch | Mobile Fetch |
|---------|----------|-------------|-------------|
| `/` | `/home/index-pc.html` | `/home/index-tablet.html` | `/home/index-mobile.html` |
| `/home/` | `/home/index-pc.html` | 同上 | 同上 |
| `/products/` | `/products/index-pc.html` | | |
| `/products/coffee/` | `/products/coffee/index-pc.html` | | |
| `/products/<slug>/` | `/products/<slug>/index-pc.html` | | |
| `/products/GM-2800A/` | `/products/detail/index-pc.html` | ⚠️ 统一映射到 detail |
| `/cases/` | `/cases/index-pc.html` | | |
| `/about/` | `/about/index-pc.html` | | |
| `/contact/` | `/contact/index-pc.html` | | |
| `/applications/canteen/` | `/applications/canteen/index-pc.html` | | |

---

## 7. 事件数据流

### 7.1 核心事件

| 事件名 | 触发时机 | 触发源 | 监听模块 |
|--------|---------|--------|---------|
| `spa:load` | 每次页面视图变更 | swup-init.js (page:view) | 15+ 模块 |
| `spa:load:i18n` | 同上 | swup-init.js (page:view) | translations.js 等 |
| `DOMContentLoaded` | 文档加载完成 | 浏览器 | init.js, main.js |
| `resize` | 窗口尺寸变化 | 浏览器 | device-utils.js, mega-menu.js |
| `scroll` | 页面滚动 | 浏览器 | init.js, smart-popup.js, page-effects.js |
| `click` | 用户点击 | 浏览器 | SWUP linkSelector, smart-popup, etc. |

### 7.2 spa:load 事件传播

```
SWUP page:view hook
  │
  └─ dispatchSpaLoad()
      │
      ├─ new CustomEvent("spa:load", { bubbles: true })
      │   └─→ document
      │       ├─ navigator.js     → 更新 active 状态
      │       ├─ footer.js        → 更新 active 状态
      │       ├─ product-grid.js  → 重新初始化
      │       ├─ case-grid.js     → 重新初始化
      │       ├─ translations.js  → 重新翻译
      │       ├─ smart-popup.js   → 重新计算触发条件
      │       ├─ page-effects.js  → 重新绑定动效
      │       └─ hero-video.js    → 重新初始化视频
      │
      └─ new CustomEvent("spa:load:i18n", { bubbles: true })
          └─→ document
              ├─ translations.js      → 立即执行翻译
              ├─ translations-dropdown-template.js
              └─ lang-registry.js     → 更新语言状态
```

### 7.3 兼容事件桥接

```
SWUP page:view (新)  ←→  spa:load (旧, 兼容)
                         
  swup-init.js 桥接:
  在 page:view hook 中手工派发 spa:load / spa:load:i18n
  使得旧模块无需修改即可在 SWUP 下正常工作
```

---

## 8. 调用链追踪

### 8.1 修改某个函数前必查的调用链

```bash
# 例: 要修改 routeToFetchUrl()
# Step 1: 谁调用了它？
grep -rn "routeToFetchUrl" src/assets/js/ --include="*.js"
# 结果: swup-init.js:345

# Step 2: 它的调用者被谁调用？
# swup-init.js:345 → fetch:request replace hook → SWUP 每次导航触发

# Step 3: 它的输出被谁消费？
# 返回值 → SWUP fetch URL → 服务端返回 HTML → content:replace 处理

# Step 4: 修改范围确认
# 只影响 swup-init.js 内的 fetch URL 映射逻辑
```

### 8.2 关键函数调用链速查

```text
routeToFetchUrl(path)
  ← swup-init.js:fetch:request hook
    ← SWUP 每次内部链接点击
  → SWUP 使用返回值 fetch SSG HTML
  → 影响: 所有 SPA 导航的页面加载

hideSkeleton() / showSkeleton()
  ← swup-init.js 多个 hook (enable, visit:start, content:replace)
  → DOM: #skeleton-overlay [hidden] 属性
  → 影响: 页面过渡视觉效果

runPageInitByRoute()
  ← swup-init.js:content:replace
  → 调用 5+ 模块的 init() 方法
  → 影响: SPA 导航后页面 JS 功能恢复

updateActiveState(html)
  ← swup-init.js:content:replace
  → Navigator.updateActive() / Footer.updateActive()
  → 影响: 导航菜单和页脚的高亮状态

dispatchSpaLoad()
  ← swup-init.js:page:view
  → 派发 document "spa:load" / "spa:load:i18n" 事件
  → 影响: 15+ 模块的重新初始化
```

### 8.3 数据依赖关系矩阵

```
                    site  init  swup  navi  foot  prod  trans  smart
                    config .js  init  gator er    grid  lations popup
site.config.js       -     R     R     R     R     R      R      R
init.js              -     -     -     -     -     -      -      -
swup-init.js         -     -     -     R     R     R      R      -
navigator.js         R     -     -     -     -     -      -      -
footer.js            R     -     -     -     -     -      -      -
product-grid.js      R     -     -     -     -     -      -      -
translations.js      -     -     -     -     -     -      -      -
smart-popup.js       R     R     -     -     -     -      -      -
spa-events.js        -     -     R     -     -     -      -      -

R = Reads (消费数据或调用)
- = 无直接依赖
```

---

## 附录：关键调试技巧

### 追踪数据流

```javascript
// 浏览器 Console

// 1. 查看当前配置
console.log(window.SITE_CONFIG);

// 2. 查看 SWUP 状态
console.log(window.Swup);
console.log(window.SpaRouter);

// 3. 查看当前活跃的 SWUP visit
// (需要在 swup-debug-plugin 启用时的 DevTools Console)

// 4. 手动触发导航
window.SpaRouter.navigate("/products/");

// 5. 监听所有 spa:load 事件
document.addEventListener("spa:load", function(e) {
  console.log("spa:load fired", e);
});
```

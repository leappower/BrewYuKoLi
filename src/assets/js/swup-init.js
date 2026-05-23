/**
 * swup-init.js — SWUP 页面过渡引擎 (替换旧的 spa-router.js)
 *
 * SWUP v4.9.0 + 插件体系取代了 ~1000 行手工 SPA 路由器.
 *
 * 替换收益:
 *   - 消除 ~1000 行 DIY SPA 路由代码
 *   - SWUP 原生处理: 内容替换, popstate, head 更新, scroll 恢复
 *   - scripts-plugin optin 模式: data-swup-reload-script 标签自动重执行
 *   - persist 属性: navigator / footer 保留 (data-swup-persist)
 *   - 更短的维护成本, 更成熟的社区支持
 *
 * 兼容性:
 *   - window.SpaRouter 保留 (有限方法, 供约 15 个模块调用)
 *   - 继续派发 document "spa:load" + "spa:load:i18n" 事件
 *   - 保留骨架屏逻辑
 *   - 保留 __spaNavigating 标志 (供 device-utils 检测)
 *
 * 依赖 (必须在此之前加载):
 *   <script src="/assets/js/vendor/swup.umd.js"></script>
 *   <script src="/assets/js/vendor/swup-head-plugin.umd.js"></script>
 *   <script src="/assets/js/vendor/swup-scroll-plugin.umd.js"></script>
 *   <script src="/assets/js/vendor/swup-scripts-plugin.umd.js"></script>
 *   <script src="/assets/js/vendor/swup-debug-plugin.umd.js"></script>
 */

(function (global) {
  "use strict";

  if (typeof global.Swup === "undefined") {
    console.error("[SWUP] Swup library not loaded. Skipping initialization.");
    return;
  }

  // ═══════════════════════════════════════════════════════════════════
  // 骨架屏 — CSS 过渡版
  // ═══════════════════════════════════════════════════════════════════
  //
  // 不再使用 display: none/block 瞬切. 改用 [hidden] 属性控制 opacity.
  // - skeleton.css:  #skeleton-overlay[hidden] { opacity:0; pointer-events:none }
  // - skeleton.css:  #skeleton-overlay ~ #spa-content 通过 transition-delay 调度
  //
  // 过渡时序:
  //   0ms     → 骨架 fadeOut 开始 (opacity: 1 → 0, 350ms ease-out)
  //   350ms   → 骨架不可见, 内容 fadeIn 开始 (opacity: 0 → 1, 350ms ease-in)
  //   700ms   → 过渡完成
  //
  // 移除 [hidden] 时立即显示骨架 (不触发过渡, 因为从 display:none → block 不会触发 transition)
  // ⚠️ 旧 skeleton.css 用 #skeleton-overlay[hidden] { display:none } 会导致 transition 不触发.
  //    这项改造的前提是 skeleton.css 中 [hidden] 规则改为 opacity:0 + pointer-events:none.

  function hideSkeleton() {
    clearTimeout(global._skDebugTimer);
    var overlay = document.getElementById("skeleton-overlay");
    var container = document.getElementById("spa-content");
    if (overlay && !overlay.hasAttribute("hidden")) {
      overlay.setAttribute("hidden", "");
      // 骨架渐隐后内容渐入: 加类触发 CSS transition
      // transition-delay 0.35s 确保骨架 fadeOut 完成后再开始
      if (container && container.innerHTML.trim()) {
        container.classList.add("swup-fade-in");
      } else {
        // 空容器: 等 SWUP 填充内容后渐变
        // 暂不加类, content:replace 中再加
      }
    }
  }

  function showSkeleton() {
    var overlay = document.getElementById("skeleton-overlay");
    if (overlay && overlay.hasAttribute("hidden")) {
      overlay.removeAttribute("hidden");
      // 移除 hidden → 骨架立刻可见 (no transition on add, CSS will animate it next time)
    }
  }

  /**
   * 确保骨架屏在超时后一定消失 (安全兜底)
   */
  function ensureSkeletonHidden() {
    clearTimeout(global._skDebugTimer);
    var overlay = document.getElementById("skeleton-overlay");
    if (overlay && !overlay.hasAttribute("hidden")) {
      overlay.setAttribute("hidden", "");
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 页面级 JS 初始化函数映射 (SPA 导航后重运行)
  // ═══════════════════════════════════════════════════════════════════

  function runPageInitByRoute() {
    var path = global.location.pathname;

    // product-grid: /products/<slug>/ 产品分类页
    if (/^\/products\/(all|coffee|tea|meal|beauty|weight|gut|lifestyle|legacy)\//.test(path)) {
      if (typeof global.ProductGrid !== "undefined" && global.ProductGrid && global.ProductGrid.init) {
        try { global.ProductGrid.init(); } catch (e) { /* noop */ }
      }
    }

    // home-core-products: 首页
    if (/^\/home\//.test(path)) {
      if (typeof global.HomeCoreProducts !== "undefined" && global.HomeCoreProducts && global.HomeCoreProducts.init) {
        try { global.HomeCoreProducts.init(); } catch (e) { /* noop */ }
      }
    }

    // product-detail: 产品详情
    if (/^\/products\/detail\//.test(path)) {
      if (typeof global.ProductDetail !== "undefined" && global.ProductDetail && global.ProductDetail.init) {
        try { global.ProductDetail.init(); } catch (e) { /* noop */ }
      }
    }

    // cross-sell: 搭配推荐
    if (/^\/products\/(all|coffee|tea|meal|beauty|weight|gut|lifestyle|legacy)\//.test(path)) {
      if (typeof global.CrossSell !== "undefined" && global.CrossSell && global.CrossSell.init) {
        try { global.CrossSell.init(); } catch (e) { /* noop */ }
      }
    }

    // cases: 案例页
    if (/^\/cases\//.test(path)) {
      if (typeof global.CasesPage !== "undefined" && global.CasesPage && global.CasesPage.init) {
        try { global.CasesPage.init(); } catch (e) { /* noop */ }
      }
      if (typeof global.CaseGrid !== "undefined" && global.CaseGrid && global.CaseGrid.init) {
        try { global.CaseGrid.init(); } catch (e) { /* noop */ }
      }
    }

    // news-detail: 新闻详情
    if (/^\/news\/detail\//.test(path)) {
      if (typeof global.NewsDetail !== "undefined" && global.NewsDetail && global.NewsDetail.init) {
        try { global.NewsDetail.init(); } catch (e) { /* noop */ }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Navigator/Footer active 状态 (从 incoming HTML 提取)
  // ═══════════════════════════════════════════════════════════════════

  function extractActiveNav(html) {
    var m = html && html.match(/<navigator[\s\S]*?data-component="navigator"[\s\S]*?>/i);
    if (!m) return null;
    var v = m[0].match(/data-active="([^"]*)"/i);
    return v ? v[1] : null;
  }

  function extractActiveFooter(html) {
    var m = html && html.match(/<footer[\s\S]*?data-component="footer"[\s\S]*?>/i);
    if (!m) return null;
    var v = m[0].match(/data-active="([^"]*)"/i);
    return v ? v[1] : null;
  }

  function updateActiveState(html) {
    var navActive = extractActiveNav(html);
    if (navActive && global.Navigator && typeof global.Navigator.updateActive === "function") {
      global.Navigator.updateActive(navActive);
    }

    // Footer active: 从 HTML 或路径衍生
    var footerActive = extractActiveFooter(html);
    if (!footerActive) {
      var path = global.location.pathname.replace(/\/$/, "");
      var map = {
        "/home": "home", "/products": "products", "/solutions": "solutions",
        "/compliance": "compliance", "/resources": "resources",
        "/contact": "contact", "/cases": "cases", "/about": "about",
        "/news": "news", "/faq": "faq", "/quote": "quote",
        "/landing": "landing", "/support": "support",
      };
      var best = "";
      for (var k in map) {
        if (path.indexOf(k) === 0 && k.length > best.length) best = k;
      }
      footerActive = map[best] || "home";
    }
    if (global.Footer && typeof global.Footer.updateActive === "function") {
      global.Footer.updateActive(footerActive);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // spa:load 兼容事件派发
  // ═══════════════════════════════════════════════════════════════════

  function dispatchSpaLoad() {
    document.dispatchEvent(new CustomEvent("spa:load", { bubbles: true }));
    document.dispatchEvent(new CustomEvent("spa:load:i18n", { bubbles: true }));
  }

  // ═══════════════════════════════════════════════════════════════════
  // 路由 → 设备感知页面路径映射
  // ═══════════════════════════════════════════════════════════════════

  function getDeviceSuffix() {
    var w = window.innerWidth;
    if (w < 768) return "index-mobile.html";
    if (w < 1280) return "index-tablet.html";
    return "index-pc.html";
  }

  /**
   * 将 SPA 路由路径转换为设备特定页面的 fetch URL.
   * 旧 spa-router 直接在 loadRoute() 中做了这个转换.
   * /home/        → /home/index-pc.html   (根据设备)
   * /products/    → /products/index-pc.html
   * /products/coffee/ → /products/coffee/index-pc.html
   *
   * 特殊的别名:
   * /             → /home/index.html
   * /news/detail/ → /news/detail/{suffix}
   */
  function routeToFetchUrl(path) {
    var suffix = getDeviceSuffix();

    // 别名
    if (path === "/" || path === "/home/") return "/home/" + suffix;
    if (path === "/news/detail/") return "/news/detail/" + suffix;
    if (path === "/applications/cases/") return "/cases/" + suffix;

    // 动态产品分类页: /products/<slug>/
    var prodMatch = path.match(/^\/products\/(all|coffee|tea|meal|beauty|weight|gut|lifestyle|legacy)\/$/);
    if (prodMatch) return "/products/" + prodMatch[1] + "/" + suffix;

    // 产品详情: /products/<model>/ → 实际用统一的 detail 页面
    if (path.match(/^\/products\/[^/]+\/$/) && !path.match(/^\/products\/(all|coffee|tea|meal|beauty|weight|gut|lifestyle|legacy|detail|compare)\/$/)) {
      return "/products/detail/" + suffix;
    }

    // 通用约定: /<path>/ → /<path>/{suffix}
    var clean = path.replace(/\/+$/, "");
    return clean + "/" + suffix;
  }

  // ═══════════════════════════════════════════════════════════════════
  // 创建 SWUP 实例
  // ═══════════════════════════════════════════════════════════════════

  var swup = null;

  function initSwup() {
    swup = new global.Swup({
      containers: ["#spa-content"],
      animateHistoryBrowsing: false,
      linkSelector: 'a[href]:not([href^="http"]):not([href^="#"]):not([href^="mailto:"]):not([href^="tel:"])',
      // 解析 /pages/<section>/index*.html → /<section>/
      resolveUrl: function (url) {
        var m = url.match(/^\/pages\/([^/]+)\/index(?:-[a-z0-9-]+)?\.html$/i);
        if (m && m[1]) return "/" + m[1] + "/";
        return url;
      },
      ignoreVisit: function (url, _a) {
        var el = _a ? _a.el : null;
        if (!el) return false;
        if (el.getAttribute("target") === "_blank") return true;
        if (el.getAttribute("download") !== null) return true;
        // 跳过非页面路径 (不上 /page/ 格式)
        if (!url.match(/^\/[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*\/$/i)) return true;
        return false;
      },
      cache: false, // 关闭缓存: routeToFetchUrl 返回设备特定页面 URL 与常规缓存 key 不匹配
      plugins: [
        new global.SwupHeadPlugin({
          persistTags: "link[rel=stylesheet], link[rel=icon], meta[property], link[rel=canonical], link[rel=alternate]",
          awaitAssets: true,
          attributes: ["lang", "dir", "class"],
        }),
        new global.SwupScrollPlugin({
          animateScroll: {
            betweenPages: false,
            samePageWithHash: true,
            samePage: false,
          },
          doScrollingRightAway: true,
          offset: 0,
        }),
        new global.SwupScriptsPlugin({
          head: false,
          body: false,
          optin: true,
        }),
      ],
    });

    // ─── 骨架屏 + 状态更新 ───
    swup.hooks.on("content:replace", function (visit, _a) {
      var page = _a ? _a.page : null;
      if (!page) return;
      hideSkeleton();

      // 内容已填充 → 触发渐入 (SPA shell 模式)
      var container = document.getElementById("spa-content");
      if (container) {
        container.classList.add("swup-fade-in");
      }

      // 重新运行页面 init 函数
      runPageInitByRoute();

      // 更新 nav/footer active
      updateActiveState(page.html);
    });

    // ─── spa:load 兼容事件 (每次页面视图) ───
    swup.hooks.on("page:view", function () {
      dispatchSpaLoad();
    });

    // ─── 每次导航: 显示骨架屏 + 清除内容渐入状态 ───
    swup.hooks.on("visit:start", function () {
      global.__spaNavigating = true;

      // 立即显示骨架 (跳过度): 先移除 transition 再移除 hidden
      var overlay = document.getElementById("skeleton-overlay");
      if (overlay) {
        overlay.style.transition = "none";
        overlay.removeAttribute("hidden");
        // 强制重绘以应用 display/layout 变更
        void overlay.offsetHeight;
        // 恢复 transition, 以便下次 hideSkeleton 触发渐隐
        overlay.style.transition = "";
      }

      // 清除内容渐入状态
      var container = document.getElementById("spa-content");
      if (container) {
        container.classList.remove("swup-fade-in");
      }
    });
    swup.hooks.on("visit:end", function () {
      setTimeout(function () { global.__spaNavigating = false; }, 100);
    });

    // ─── fetch:request — 将 SPA URL 转换为设备特定页面 ───
    // SWUP 默认 fetch visit.to.url (如 /home/), 但 SSG 页面是 /home/index-pc.html.
    // 这里用 replace handler 拦截 fetch, 改写 URL.
    // 地址栏 URL 保持不变 (pushState 使用 visit.to.url), 仅 fetch 用设备路径.
    swup.hooks.replace("fetch:request", function (visit, _a, defaultFetch) {
      var originalUrl = _a.url;
      var deviceUrl = routeToFetchUrl(originalUrl);
      return defaultFetch(visit, {
        url: deviceUrl,
        options: _a.options,
      });
    });

    // ─── 首次加载 ✅: SWUP 启用后, 如果容器为空则主动加载当前路由 ───
    swup.hooks.on("enable", function () {
      var container = document.getElementById("spa-content");
      var isEmpty = !container || !container.innerHTML.trim();
      if (isEmpty) {
        // SPA shell 模式: 容器为空, 需加载当前路由
        var currentUrl = window.location.pathname;
        swup.navigate(currentUrl, { history: "replace" });
      } else {
        // SSG 模式: 页面上已有内容, 通过过渡隐藏骨架
        // 先给内容一个 opacity:0 的起始状态, 然后用过渡渐入
        // 但 CSS 已经定义了 #skeleton-overlay[hidden] ~ #spa-content 的 transition-delay 调度
        hideSkeleton();
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // SpaRouter 向前兼容层
  // ═══════════════════════════════════════════════════════════════════

  global.SpaRouter = {
    navigate: function (path) {
      var url = path.startsWith("/") ? path : "/" + path;
      if (swup) { swup.navigate(url); return; }
      global.location.href = url;
    },
    replace: function (path) {
      var url = path.startsWith("/") ? path : "/" + path;
      if (swup) { swup.navigate(url, { history: "replace" }); return; }
      global.location.replace(url);
    },
    getCurrentPath: function () {
      var path = global.location.pathname;
      if (path.endsWith(".html")) {
        var ls = path.lastIndexOf("/");
        if (ls > 0) path = path.substring(0, ls + 1);
      }
      if (!path.endsWith("/")) path = path + "/";
      return path;
    },
    _pendingScroll: null,
  };

  // ═══════════════════════════════════════════════════════════════════
  // 启动
  // ═══════════════════════════════════════════════════════════════════

  // 处理根路径重定向 + GitHub Pages 404 恢复
  var path = global.location.pathname;
  if (path === "/" || path === "/index.html") {
    history.replaceState(null, "", "/home/");
  }

  var redirectParam = new URLSearchParams(global.location.search).get("redirect");
  if (redirectParam) {
    history.replaceState(null, "", redirectParam);
  }

  // 初始化 SWUP
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSwup);
  } else {
    initSwup();
  }
})(window);

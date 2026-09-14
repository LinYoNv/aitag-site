/**
 * aitag 生图台 - 提示词组编辑器 // PROMPT TAG LIBRARY
 * ---------------------------------------------------------------------------
 * 布局参照 WeiLin-Comfyui-Tools 的标签管理界面（分类 → 分组 → 标签云 + 批量导入），
 * 按需求做了两处删减：**不含 LoRA 管理**、**不含一键翻译**（只提供提示词本身）。
 *
 * 数据分两层：
 *   1) 服务器词库 —— 优先取 /api/studio/tags（WeiLin 中文词库同步产物，约 4000 标签）；
 *      接口不可用时回退到自带的 public/studio/tags.default.json（起始库，仅打通流程用）
 *   2) 浏览器本地覆盖层 localStorage —— 个人新增/删除/禁用/偏好，不污染共享库
 *
 * 对外接口：window.StudioTagLib.open({ textareaId })  （默认作用于 #naiPrompt）
 */
(function () {
  "use strict";

  // 服务端词库优先；拿不到就退回仓库里自带的起始库
  var LIB_API_URL = "/api/studio/tags";
  var LIB_FALLBACK_URL = "./tags.default.json";
  var K_CUSTOM = "studio.taglib.custom.v1";
  var K_PREFS = "studio.taglib.prefs.v1";

  var uid = function (p) {
    return p + "_" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  };
  var clone = function (o) {
    return JSON.parse(JSON.stringify(o));
  };
  var readLS = function (k, d) {
    try {
      var raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : d;
    } catch (e) {
      return d;
    }
  };
  var writeLS = function (k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {
      /* 配额满等异常忽略：不影响本次编辑 */
    }
  };

  // ===== 状态 =====
  var state = {
    base: null, // 服务器库
    custom: null, // 本地覆盖层
    lib: null, // 合并结果
    catId: null,
    groupId: null,
    query: "",
    selected: {}, // 批量删除选择集：tagKey -> true
    batchMode: false,
    prefs: null,
    built: false,
    target: null, // 目标 textarea
  };

  function defaultCustom() {
    return {
      categories: [], // {id,name,groups:[{id,name,tags:[...]}]}
      deletedCategories: [],
      deletedGroups: [], // "catId/groupId"
      deletedTags: [], // "catId/groupId/tagName"
      disabledTags: [], // tagName
    };
  }
  function defaultPrefs() {
    return {
      tagSize: "m",
      hideDelete: false,
      autoAddOnSearch: false,
      lastCategory: null,
      lastGroup: null,
      randomRule: { count: 3, scope: "group", separate: true },
      sectionCollapsed: false,
    };
  }

  // ===== 库合并 =====
  function mergeLibrary(base, custom) {
    var lib = base && base.categories ? clone(base) : { version: 1, categories: [] };
    if (!lib.categories) lib.categories = [];

    // 过滤删除项 + 追加本地新增
    lib.categories = lib.categories
      .filter(function (c) {
        return custom.deletedCategories.indexOf(c.id) < 0;
      })
      .map(function (c) {
        c.groups = (c.groups || [])
          .filter(function (g) {
            return custom.deletedGroups.indexOf(c.id + "/" + g.id) < 0;
          })
          .map(function (g) {
            g.tags = (g.tags || []).filter(function (t) {
              return custom.deletedTags.indexOf(c.id + "/" + g.id + "/" + t.name) < 0;
            });
            return g;
          });
        return c;
      });

    (custom.categories || []).forEach(function (cc) {
      var hit = null;
      for (var i = 0; i < lib.categories.length; i++) if (lib.categories[i].id === cc.id) hit = lib.categories[i];
      if (!hit) {
        lib.categories.push({ id: cc.id, name: cc.name, groups: cc.groups || [] });
        return;
      }
      (cc.groups || []).forEach(function (cg) {
        var g = null;
        for (var j = 0; j < hit.groups.length; j++) if (hit.groups[j].id === cg.id) g = hit.groups[j];
        if (!g) {
          hit.groups.push({ id: cg.id, name: cg.name, tags: cg.tags || [] });
          return;
        }
        (cg.tags || []).forEach(function (t) {
          var exists = g.tags.some(function (x) {
            return x.name === t.name;
          });
          if (!exists) g.tags.push(t);
        });
      });
    });

    lib.categories = lib.categories.filter(function (c) {
      return c.groups && c.groups.length;
    });
    return lib;
  }

  function isDisabled(name) {
    return state.custom.disabledTags.indexOf(name) >= 0;
  }
  function toggleDisabled(name, on) {
    var idx = state.custom.disabledTags.indexOf(name);
    if (on && idx < 0) state.custom.disabledTags.push(name);
    if (!on && idx >= 0) state.custom.disabledTags.splice(idx, 1);
    saveCustom();
  }
  function saveCustom() {
    writeLS(K_CUSTOM, state.custom);
  }
  function savePrefs() {
    writeLS(K_PREFS, state.prefs);
  }

  function currentCategory() {
    var cats = state.lib.categories;
    for (var i = 0; i < cats.length; i++) if (cats[i].id === state.catId) return cats[i];
    return cats[0] || null;
  }
  function currentGroup() {
    var c = currentCategory();
    if (!c) return null;
    for (var i = 0; i < c.groups.length; i++) if (c.groups[i].id === state.groupId) return c.groups[i];
    return c.groups[0] || null;
  }

  // ===== 目标文本域读写 =====
  function readTarget() {
    return state.target ? state.target.value : "";
  }
  function writeTarget(v) {
    if (state.target) {
      state.target.value = v;
      state.target.dispatchEvent(new Event("input", { bubbles: true }));
    }
    // 弹窗自身的文本域必须同步（点标签写入时不能只更新面板那一侧）
    if (dom.ta && dom.ta !== state.target && dom.ta.value !== v) dom.ta.value = v;
    updateCounter();
  }
  function insertTag(name) {
    var v = readTarget();
    var t = v.trim();
    if (!t) {
      writeTarget(name);
    } else {
      var parts = t.split(",").map(function (s) {
        return s.trim();
      });
      if (parts.indexOf(name) >= 0) {
        toast("已在提示词中：" + name);
        return;
      }
      writeTarget(t.replace(/,\s*$/, "") + ", " + name);
    }
    toast("已加入：" + name);
  }
  function tagCountOf(v) {
    return v
      .split(",")
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean).length;
  }
  function updateCounter() {
    if (!dom.counter) return;
    var v = readTarget();
    dom.counter.textContent = tagCountOf(v) + " tags · " + v.length + " chars";
  }

  // ===== DOM 构建 =====
  var dom = {};

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function build() {
    if (state.built) return;

    var overlay = el("div", "tl-overlay");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "提示词组编辑器");

    var panel = el("div", "tl-panel");

    // 标题
    var head = el("div", "tl-head");
    var idx = el("div", "tl-head-idx");
    idx.appendChild(el("b", null, "TAG"));
    idx.appendChild(el("span", null, "PRMT"));
    head.appendChild(idx);
    var titleWrap = el("div", "tl-head-title");
    titleWrap.appendChild(document.createTextNode("提示词组 // TAG LIBRARY"));
    titleWrap.appendChild(el("small", null, "单击标签写入提示词 · 编辑模式可禁用/删除"));
    head.appendChild(titleWrap);
    head.appendChild(el("div", "tl-head-spacer"));
    var btnClose = el("button", "tl-close", "关闭");
    btnClose.type = "button";
    head.appendChild(btnClose);
    panel.appendChild(head);

    // 主体
    var body = el("div", "tl-body");

    var taWrap = el("div", "tl-textarea-wrap");
    var ta = el("textarea", "tl-textarea");
    ta.placeholder = "1girl, solo, long silver hair...（与面板「NAI 风格标签词」实时同步）";
    ta.spellcheck = false;
    taWrap.appendChild(ta);
    var counter = el("div", "tl-counter", "0 tags");
    taWrap.appendChild(counter);
    body.appendChild(taWrap);

    // 工具条
    var toolbar = el("div", "tl-toolbar");
    var bClearDisabled = mkBtn("一键清空禁用", "⊘");
    var bClearAll = mkBtn("一键清空所有", "✕", "is-danger");
    var bHideDelete = mkBtn("隐藏删除按钮", "◎");
    var bRandom = mkBtn("一键随机 Tag", "✦", "is-accent");
    var bRandomRule = mkBtn("设置随机 Tag 规则", "⚙");
    var bCopy = mkBtn("复制提示词")  // 不给图标：部分环境缺字形会显示成方框;
    toolbar.appendChild(bClearDisabled);
    toolbar.appendChild(bClearAll);
    toolbar.appendChild(bHideDelete);
    toolbar.appendChild(bRandom);
    toolbar.appendChild(bRandomRule);
    var tbRight = el("div", "tl-toolbar-right");
    tbRight.appendChild(bCopy);
    toolbar.appendChild(tbRight);
    body.appendChild(toolbar);

    // 标签管理区块
    var section = el("div", "tl-section");
    var secHead = el("div", "tl-section-head");
    secHead.appendChild(el("span", "tl-sec-ico", "◇"));
    secHead.appendChild(el("h3", null, "标签管理"));
    var caret = el("span", "tl-caret", "▾");
    secHead.appendChild(caret);
    section.appendChild(secHead);
    var secBody = el("div", "tl-section-body");

    var searchRow = el("div", "tl-search-row");
    var bRefresh = el("button", "tl-icon-btn", "⟳");
    bRefresh.type = "button";
    bRefresh.title = "刷新服务器词库";
    var search = el("input", "tl-input");
    search.placeholder = "搜索 Tag（英文或中文）...";
    var bImport = mkBtn("批量导入 Tag", "⇪");
    searchRow.appendChild(bRefresh);
    searchRow.appendChild(search);
    searchRow.appendChild(bImport);
    secBody.appendChild(searchRow);

    var prefsRow = el("div", "tl-search-row");
    var autoWrap = el("label", "tl-check");
    var autoCb = document.createElement("input");
    autoCb.type = "checkbox";
    autoWrap.appendChild(autoCb);
    autoWrap.appendChild(document.createTextNode("搜索的 Tag 自动添加到提示词中"));
    var bSize = mkBtn("修改标签尺寸", "⊞");
    prefsRow.appendChild(autoWrap);
    prefsRow.appendChild(bSize);
    secBody.appendChild(prefsRow);

    var cats = el("div", "tl-cats");
    secBody.appendChild(cats);

    var groups = el("div", "tl-groups");
    secBody.appendChild(groups);

    var tagsHead = el("div", "tl-tags-head");
    var tagsTitle = el("span", null, "标签");
    var tagsCount = el("span", "tl-count", "");
    tagsHead.appendChild(tagsTitle);
    tagsHead.appendChild(tagsCount);
    tagsHead.appendChild(el("span", "tl-spacer"));
    var bEdit = mkBtn("编辑模式", "✎");
    var bBatch = mkBtn("批量删除", "☑");
    tagsHead.appendChild(bEdit);
    tagsHead.appendChild(bBatch);
    secBody.appendChild(tagsHead);

    var tags = el("div", "tl-tags");
    secBody.appendChild(tags);

    section.appendChild(secBody);
    body.appendChild(section);
    panel.appendChild(body);

    // 底部
    var foot = el("div", "tl-foot");
    var footTitle = el("div", "tl-foot-title");
    footTitle.appendChild(document.createTextNode("选择分类"));
    footTitle.appendChild(el("small", null, "SELECT CATEGORY / GROUP"));
    foot.appendChild(footTitle);
    // 词库来源署名：WeiLin 词库是 GPL-3.0，界面上必须保留出处
    var libNote = el("div", "tl-lib-note", "");
    libNote.title = "";
    foot.appendChild(libNote);
    foot.appendChild(el("div", "tl-spacer"));
    var bAddTag = mkBtn("+ 添加 Tag", null, "is-accent");
    var bExport = mkBtn("导出 Tag", "⇩");
    var bApply = mkBtn("应用并关闭", null, "is-signal");
    foot.appendChild(bAddTag);
    foot.appendChild(bExport);
    foot.appendChild(bApply);
    panel.appendChild(foot);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // toast
    var toastEl = el("div", "tl-toast");
    document.body.appendChild(toastEl);

    dom = {
      overlay: overlay,
      body: body,
      ta: ta,
      counter: counter,
      search: search,
      cats: cats,
      groups: groups,
      tags: tags,
      tagsCount: tagsCount,
      autoCb: autoCb,
      section: section,
      caret: caret,
      libNote: libNote,
    };

    // ===== 事件绑定 =====
    btnClose.addEventListener("click", close);
    bApply.addEventListener("click", close);
    overlay.addEventListener("mousedown", function (e) {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && overlay.classList.contains("open")) close();
    });

    ta.addEventListener("input", function () {
      writeTarget(ta.value);
    });

    secHead.addEventListener("click", function () {
      state.prefs.sectionCollapsed = !state.prefs.sectionCollapsed;
      renderSection();
      savePrefs();
    });

    search.addEventListener("input", function () {
      state.query = search.value.trim();
      renderTags();
    });
    search.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      e.preventDefault();
      var first = firstSearchHit();
      if (first && state.prefs.autoAddOnSearch) insertTag(first.name);
      else if (first) insertTag(first.name);
    });

    bRefresh.addEventListener("click", function () {
      state.base = null;
      loadLibrary(true);
    });

    autoCb.addEventListener("change", function () {
      state.prefs.autoAddOnSearch = autoCb.checked;
      savePrefs();
    });

    bSize.addEventListener("click", function () {
      var order = ["s", "m", "l"];
      var i = order.indexOf(state.prefs.tagSize);
      state.prefs.tagSize = order[(i + 1) % order.length];
      savePrefs();
      renderTags();
      toast("标签尺寸：" + { s: "小", m: "中", l: "大" }[state.prefs.tagSize]);
    });

    bClearDisabled.addEventListener("click", function () {
      var n = state.custom.disabledTags.length;
      state.custom.disabledTags = [];
      saveCustom();
      renderTags();
      toast(n ? "已清空 " + n + " 个禁用标签" : "没有禁用标签");
    });

    bClearAll.addEventListener("click", function () {
      if (!readTarget().trim()) return toast("提示词本来就是空的");
      askConfirm("确认清空提示词？", "将清空当前提示词文本（画师串与反向词不受影响）。", function () {
        writeTarget("");
        toast("已清空提示词");
      });
    });

    bHideDelete.addEventListener("click", function () {
      state.prefs.hideDelete = !state.prefs.hideDelete;
      savePrefs();
      renderTags();
      toast(state.prefs.hideDelete ? "已隐藏删除按钮" : "已显示删除按钮");
    });

    bRandom.addEventListener("click", function () {
      var rule = state.prefs.randomRule;
      var pool = collectRandomPool(rule.scope);
      if (!pool.length) return toast("当前范围没有可用标签（禁用标签已排除）");
      var picked = [];
      var copy = pool.slice();
      for (var i = 0; i < rule.count && copy.length; i++) {
        var k = Math.floor(Math.random() * copy.length);
        picked.push(copy.splice(k, 1)[0]);
      }
      if (rule.separate); // 保留开关：合并/逐条写入（当前均为逐条追加）
      picked.forEach(function (t) {
        insertTag(t.name);
      });
      toast("随机加入 " + picked.length + " 个标签");
    });

    bRandomRule.addEventListener("click", function () {
      var rule = state.prefs.randomRule;
      var box = miniDialog("设置随机 Tag 规则", [
        { key: "count", label: "每次随机数量", value: rule.count, type: "number" },
        {
          key: "scope",
          label: "抽取范围",
          type: "select",
          value: rule.scope,
          options: [
            { v: "group", t: "当前分组" },
            { v: "category", t: "当前分类（全部分组）" },
            { v: "all", t: "整个词库" },
          ],
        },
      ], function (v) {
        state.prefs.randomRule.count = Math.max(1, Math.min(50, Number(v.count) || 1));
        state.prefs.randomRule.scope = v.scope;
        savePrefs();
        toast("随机规则已保存");
      });
      return box;
    });

    bImport.addEventListener("click", function () {
      openImportDialog();
    });

    bEdit.addEventListener("click", function () {
      state.prefs.editMode = !state.prefs.editMode;
      savePrefs();
      renderTags();
      renderGroups();
      toast(state.prefs.editMode ? "编辑模式：可禁用 / 删除标签" : "已退出编辑模式");
    });

    bBatch.addEventListener("click", function () {
      state.batchMode = !state.batchMode;
      state.selected = {};
      renderTags();
      bBatch.classList.toggle("is-on", state.batchMode);
      toast(state.batchMode ? "批量删除：点击标签选择，再点「删除所选」" : "已退出批量删除");
    });

    bAddTag.addEventListener("click", function () {
      openAddTagDialog();
    });

    bExport.addEventListener("click", function () {
      exportLibrary();
    });

    bCopy.addEventListener("click", function () {
      var v = readTarget();
      if (!v.trim()) return toast("提示词为空");
      copyText(v);
    });

    var bAddCat = mkBtn("+ 添加分类", null);
    bAddCat.classList.add("tl-add-chip");
    cats.dataset.addBtn = "1";
    state.built = true;
  }

  function mkBtn(text, ico, extra) {
    var b = el("button", "tl-btn" + (extra ? " " + extra : ""));
    b.type = "button";
    if (ico) b.appendChild(el("span", "tl-ico", ico));
    b.appendChild(document.createTextNode(text));
    return b;
  }

  // ===== 渲染 =====
  function renderSection() {
    dom.section.classList.toggle("collapsed", !!state.prefs.sectionCollapsed);
    dom.caret.textContent = state.prefs.sectionCollapsed ? "▸" : "▾";
  }

  function renderCats() {
    dom.cats.innerHTML = "";
    state.lib.categories.forEach(function (c) {
      var total = (c.groups || []).reduce(function (n, g) {
        return n + (g.tags || []).length;
      }, 0);
      var b = el("button", "tl-cat" + (c.id === state.catId ? " is-active" : ""));
      b.type = "button";
      b.appendChild(document.createTextNode(c.name));
      b.appendChild(el("small", null, String(total)));
      b.addEventListener("click", function () {
        state.catId = c.id;
        state.groupId = (c.groups[0] || {}).id || null;
        state.query = "";
        dom.search.value = "";
        state.prefs.lastCategory = state.catId;
        state.prefs.lastGroup = state.groupId;
        savePrefs();
        renderAll();
        scrollTagsIntoView();
      });
      dom.cats.appendChild(b);
    });
    scrollChipIntoView(dom.cats, dom.cats.querySelector(".tl-cat.is-active"));
    var add = mkBtn("+ 添加分类", null);
    add.classList.add("tl-add-chip");
    add.addEventListener("click", function () {
      smallPrompt("添加分类", "分类名称（如：风格强化）", "", function (name) {
        if (!name) return;
        var id = uid("cat");
        state.custom.categories.push({ id: id, name: name, groups: [] });
        saveCustom();
        state.lib = mergeLibrary(state.base, state.custom);
        state.catId = id;
        state.groupId = null;
        renderAll();
        toast("已添加分类：" + name);
      });
    });
    dom.cats.appendChild(add);
  }

  function renderGroups() {
    var c = currentCategory();
    dom.groups.innerHTML = "";
    dom.groups.classList.toggle("edit", !!state.prefs.editMode);
    if (!c) return;

    // 「全部」伪分组
    var all = el("button", "tl-group-chip" + (state.groupId === "__all" ? " is-active" : ""));
    all.type = "button";
    all.appendChild(document.createTextNode("全部"));
    all.addEventListener("click", function () {
      state.groupId = "__all";
      state.prefs.lastGroup = "__all";
      savePrefs();
      renderAll();
      scrollTagsIntoView();
    });
    dom.groups.appendChild(all);

    (c.groups || []).forEach(function (g) {
      var b = el("button", "tl-group-chip" + (g.id === state.groupId ? " is-active" : ""));
      b.type = "button";
      b.appendChild(document.createTextNode(g.name));
      b.appendChild(el("small", null, String((g.tags || []).length)));
      if (state.prefs.editMode) {
        var del = el("span", "tl-g-del", "×");
        del.title = "删除分组";
        del.addEventListener("click", function (e) {
          e.stopPropagation();
          askConfirm("删除分组「" + g.name + "」？", "该分组下 " + (g.tags || []).length + " 个标签会一并隐藏（可通过清除本地数据恢复）。", function () {
            var key = c.id + "/" + g.id;
            if (c.id.indexOf("cat_") === 0) {
              var cc = findCustomCategory(c.id);
              if (cc) {
                cc.groups = cc.groups.filter(function (x) {
                  return x.id !== g.id;
                });
                saveCustom();
              }
            } else {
              state.custom.deletedGroups.push(key);
              saveCustom();
            }
            state.lib = mergeLibrary(state.base, state.custom);
            if (state.groupId === g.id) state.groupId = (currentCategory().groups[0] || {}).id || null;
            renderAll();
            toast("已删除分组：" + g.name);
          });
        });
        b.appendChild(del);
      }
      b.addEventListener("click", function () {
        state.groupId = g.id;
        state.query = "";
        dom.search.value = "";
        state.prefs.lastGroup = g.id;
        savePrefs();
        renderAll();
        scrollTagsIntoView();
      });
      dom.groups.appendChild(b);
    });

    var addG = el("button", "tl-add-chip", "+ 添加分组");
    addG.type = "button";
    addG.addEventListener("click", function () {
      smallPrompt("添加分组", "分组名称（如：发饰）", "", function (name) {
        if (!name) return;
        var gid = uid("grp");
        var cc = findCustomCategory(c.id, true);
        cc.groups.push({ id: gid, name: name, tags: [] });
        saveCustom();
        state.lib = mergeLibrary(state.base, state.custom);
        state.groupId = gid;
        renderAll();
        toast("已添加分组：" + name);
      });
    });
    dom.groups.appendChild(addG);
    scrollChipIntoView(dom.groups, dom.groups.querySelector(".tl-group-chip.is-active"));
  }

  function findCustomCategory(catId, create) {
    for (var i = 0; i < state.custom.categories.length; i++) {
      if (state.custom.categories[i].id === catId) return state.custom.categories[i];
    }
    // 服务器库分类的本地增强（新增分组/标签）也走覆盖层：镜像一个同名分类壳
    var baseCat = null;
    for (var j = 0; j < state.lib.categories.length; j++) if (state.lib.categories[j].id === catId) baseCat = state.lib.categories[j];
    if (!create || !baseCat) return null;
    var shell = { id: catId, name: baseCat.name, groups: [] };
    state.custom.categories.push(shell);
    return shell;
  }

  function allTagsFlat(scope) {
    var out = [];
    var cats = state.lib.categories;
    cats.forEach(function (c) {
      if (scope === "category" && c.id !== state.catId) return;
      (c.groups || []).forEach(function (g) {
        if (scope === "group" && (c.id !== state.catId || g.id !== state.groupId)) return;
        (g.tags || []).forEach(function (t) {
          out.push({ cat: c, group: g, tag: t });
        });
      });
    });
    return out;
  }

  function firstSearchHit() {
    var q = state.query.toLowerCase();
    if (!q) return null;
    var hits = searchHits(q);
    return hits.length ? hits[0].tag : null;
  }

  function searchHits(q) {
    var out = [];
    state.lib.categories.forEach(function (c) {
      (c.groups || []).forEach(function (g) {
        (g.tags || []).forEach(function (t) {
          var hay = (t.name + " " + (t.zh || "")).toLowerCase();
          if (hay.indexOf(q) >= 0) out.push({ cat: c, group: g, tag: t });
        });
      });
    });
    out.sort(function (a, b) {
      var an = a.tag.name.toLowerCase().indexOf(q) === 0 ? 0 : 1;
      var bn = b.tag.name.toLowerCase().indexOf(q) === 0 ? 0 : 1;
      return an - bn;
    });
    return out.slice(0, 300);
  }

  // 手机端分类/分组是单行横滑的：把选中项横向拨进视野（只动横向，不碰纵向滚动）
  function scrollChipIntoView(row, chip) {
    if (!row || !chip || !row.scrollWidth) return;
    var r = row.getBoundingClientRect();
    var c = chip.getBoundingClientRect();
    if (c.left < r.left) row.scrollLeft += c.left - r.left - 8;
    else if (c.right > r.right) row.scrollLeft += c.right - r.right + 8;
  }

  // 切分类/分组后把标签区滚进视野。
  // 手机竖屏时上方控件很高，标签区常被顶到屏幕外，不滚的话点分组看着像「没反应」。
  // 桌面上若标签本就在视野内则不做任何滚动，避免无谓跳动。
  function scrollTagsIntoView() {
    if (!dom.tags || !dom.body) return;
    setTimeout(function () {
      var tagsRect = dom.tags.getBoundingClientRect();
      var bodyRect = dom.body.getBoundingClientRect();
      if (tagsRect.top >= bodyRect.top + 2 && tagsRect.bottom <= bodyRect.bottom - 2) return;
      var anchor = dom.tags.previousElementSibling || dom.tags; // .tl-tags-head
      var delta = anchor.getBoundingClientRect().top - bodyRect.top - 6;
      var top = Math.max(0, dom.body.scrollTop + delta);
      if (dom.body.scrollTo) dom.body.scrollTo({ top: top, behavior: "smooth" });
      else dom.body.scrollTop = top;
    }, 0);
  }

  function renderTags() {
    if (!dom.tags) return;
    dom.tags.innerHTML = "";
    dom.tags.className = "tl-tags size-" + state.prefs.tagSize + (state.prefs.editMode ? " edit" : "");

    var items;
    if (state.query) {
      items = searchHits(state.query.toLowerCase());
    } else if (state.groupId === "__all") {
      items = allTagsFlat("category");
    } else {
      items = allTagsFlat("group");
    }

    dom.tagsCount.textContent =
      "· " + items.length + " 个" + (state.query ? "（搜索：" + state.query + "）" : "");

    if (!items.length) {
      dom.tags.appendChild(
        el(
          "div",
          "tl-empty",
          state.query
            ? "没有匹配的标签。可用「批量导入 Tag」补充词库。"
            : "该分组暂无标签 —— 点下方「+ 添加 Tag」或用「批量导入 Tag」灌入。",
        ),
      );
      return;
    }

    items.forEach(function (it) {
      var t = it.tag;
      var key = it.cat.id + "/" + it.group.id + "/" + t.name;
      var chip = el("span", "tl-tag" + (isDisabled(t.name) ? " is-disabled" : "") + (state.selected[key] ? " is-selected" : ""));
      chip.title = t.name + (t.zh ? " · " + t.zh : "");
      chip.appendChild(document.createTextNode(t.name));
      if (t.zh) chip.appendChild(el("span", "tl-tag-zh", t.zh));

      if (state.batchMode) {
        chip.addEventListener("click", function () {
          if (state.selected[key]) delete state.selected[key];
          else state.selected[key] = { catId: it.cat.id, groupId: it.group.id, name: t.name, label: t.name };
          chip.classList.toggle("is-selected", !!state.selected[key]);
          updateBatchBtn();
        });
      } else {
        chip.addEventListener("click", function () {
          insertTag(t.name);
        });
      }

      if (state.prefs.editMode) {
        var ops = el("span", "tl-tag-ops");
        var bDis = el("button", "tl-tag-op", isDisabled(t.name) ? "启" : "禁");
        bDis.type = "button";
        bDis.title = isDisabled(t.name) ? "启用该标签（随机时可用）" : "禁用该标签（不参与随机）";
        bDis.addEventListener("click", function (e) {
          e.stopPropagation();
          toggleDisabled(t.name, !isDisabled(t.name));
          renderTags();
        });
        ops.appendChild(bDis);

        if (!state.prefs.hideDelete) {
          var bDel = el("button", "tl-tag-op del", "×");
          bDel.type = "button";
          bDel.title = "从词库中删除该标签";
          bDel.addEventListener("click", function (e) {
            e.stopPropagation();
            var cur = false;
            var catInCustom = findCustomCategory(it.cat.id);
            if (catInCustom) {
              catInCustom.groups.forEach(function (g) {
                if (g.id !== it.group.id) return;
                var before = g.tags.length;
                g.tags = g.tags.filter(function (x) {
                  return x.name !== t.name;
                });
                if (g.tags.length !== before) cur = true;
              });
            }
            if (!cur) state.custom.deletedTags.push(key);
            saveCustom();
            state.lib = mergeLibrary(state.base, state.custom);
            renderAll();
            toast("已删除标签：" + t.name);
          });
          ops.appendChild(bDel);
        }
        chip.appendChild(ops);
      }

      dom.tags.appendChild(chip);
    });
  }

  function updateBatchBtn() {
    var n = Object.keys(state.selected).length;
    var btn = document.getElementById("tlBatchDeleteBtn");
    if (!btn) return;
    btn.textContent = n ? "删除所选 (" + n + ")" : "退出批量删除";
  }

  function renderBatchBar() {
    var foot = dom.overlay.querySelector(".tl-foot");
    var exist = document.getElementById("tlBatchDeleteBtn");
    if (state.batchMode && !exist) {
      var b = mkBtn("退出批量删除", null, "is-danger");
      b.id = "tlBatchDeleteBtn";
      b.addEventListener("click", function () {
        var keys = Object.keys(state.selected);
        if (!keys.length) {
          state.batchMode = false;
          renderTags();
          renderBatchBar();
          return;
        }
        askConfirm("删除所选 " + keys.length + " 个标签？", "仅影响本机词库视图，可通过清除本地词库数据恢复。", function () {
          keys.forEach(function (k) {
            var it = state.selected[k];
            var moved = false;
            var cc = findCustomCategory(it.catId);
            if (cc) {
              cc.groups.forEach(function (g) {
                if (g.id !== it.groupId) return;
                var before = g.tags.length;
                g.tags = g.tags.filter(function (x) {
                  return x.name !== it.name;
                });
                if (g.tags.length !== before) moved = true;
              });
            }
            if (!moved) state.custom.deletedTags.push(k);
          });
          saveCustom();
          state.lib = mergeLibrary(state.base, state.custom);
          state.selected = {};
          state.batchMode = false;
          renderAll();
          toast("已删除所选标签");
        });
      });
      foot.insertBefore(b, foot.firstChild.nextSibling);
    } else if (!state.batchMode && exist) {
      exist.remove();
    }
  }

  function renderAll() {
    renderSection();
    renderCats();
    renderGroups();
    renderTags();
    renderBatchBar();
    updateCounter();
  }

  function collectRandomPool(scope) {
    var out = [];
    var cats = state.lib.categories;
    cats.forEach(function (c) {
      if (scope === "category" && c.id !== state.catId) return;
      (c.groups || []).forEach(function (g) {
        if (scope === "group" && (c.id !== state.catId || g.id !== state.groupId)) return;
        (g.tags || []).forEach(function (t) {
          if (!isDisabled(t.name)) out.push(t);
        });
      });
    });
    return out;
  }

  // ===== 对话框 =====
  function miniDialog(title, fields, onOk, extra) {
    var wrap = el("div", "tl-mini");
    var box = el("div", "tl-mini-box");
    box.appendChild(el("h4", null, title));

    var inputs = {};
    fields.forEach(function (f) {
      if (f.type === "textarea") {
        var lab = el("label", null, f.label);
        var ta = document.createElement("textarea");
        ta.className = "tl-input";
        ta.value = f.value || "";
        ta.placeholder = f.placeholder || "";
        lab.appendChild(ta);
        box.appendChild(lab);
        inputs[f.key] = ta;
      } else if (f.type === "select") {
        var labS = el("label", null, f.label);
        var sel = document.createElement("select");
        sel.className = "tl-input";
        (f.options || []).forEach(function (o) {
          var op = document.createElement("option");
          op.value = o.v;
          op.textContent = o.t;
          if (o.v === f.value) op.selected = true;
          sel.appendChild(op);
        });
        labS.appendChild(sel);
        box.appendChild(labS);
        inputs[f.key] = sel;
      } else {
        var lab2 = el("label", null, f.label);
        var inp = document.createElement("input");
        inp.className = "tl-input";
        inp.type = f.type || "text";
        inp.value = f.value == null ? "" : f.value;
        lab2.appendChild(inp);
        box.appendChild(lab2);
        inputs[f.key] = inp;
      }
    });

    var acts = el("div", "tl-mini-actions");
    var cancel = mkBtn("取消", null);
    cancel.addEventListener("click", function () {
      wrap.remove();
    });
    var ok = mkBtn("确定", null, "is-signal");
    ok.addEventListener("click", function () {
      var v = {};
      Object.keys(inputs).forEach(function (k) {
        v[k] = inputs[k].value;
      });
      var keep = onOk(v);
      if (keep !== false) wrap.remove();
    });
    acts.appendChild(cancel);
    acts.appendChild(ok);
    box.appendChild(acts);

    if (extra && extra.content) box.insertBefore(extra.content, acts);

    wrap.appendChild(box);
    wrap.addEventListener("mousedown", function (e) {
      if (e.target === wrap) wrap.remove();
    });
    document.body.appendChild(wrap);
    var first = box.querySelector("input,textarea,select");
    if (first) first.focus();
    return wrap;
  }

  function smallPrompt(title, label, value, cb) {
    miniDialog(title, [{ key: "v", label: label, value: value }], function (v) {
      cb((v.v || "").trim());
    });
  }

  function askConfirm(title, desc, cb) {
    miniDialog(title, desc ? [{ key: "d", label: desc, type: "text", value: "" }] : [], function () {
      cb();
    });
    // 隐藏说明输入框（仅作展示）
    var boxes = document.querySelectorAll(".tl-mini-box");
    var last = boxes[boxes.length - 1];
    if (last) {
      var d = last.querySelector("input");
      if (d) {
        var p = document.createElement("div");
        p.style.cssText = "font:400 12px/1.5 system-ui;color:#424640;margin:-4px 0 4px";
        p.textContent = d.value || "";
        d.replaceWith(p);
      }
    }
  }

  function openImportDialog() {
    var cat = currentCategory();
    var content = el("div");
    content.style.cssText = "display:flex;flex-direction:column;gap:8px";
    var hints = el(
      "div",
      null,
      "支持：JSON（{categories:[…]} / [{name,zh}] / {tag:中文}）或每行一条「tag, 中文」。导入到当前分类的指定分组。",
    );
    hints.style.cssText = "font:400 11.5px/1.5 system-ui;color:#6e726b";
    content.appendChild(hints);

    var file = document.createElement("input");
    file.type = "file";
    file.accept = ".json,.txt,.csv";
    content.appendChild(file);

    var targetSel = document.createElement("select");
    targetSel.className = "tl-input";
    (cat ? cat.groups : []).forEach(function (g) {
      var o = document.createElement("option");
      o.value = g.id;
      o.textContent = "导入到分组：" + g.name;
      if (g.id === state.groupId) o.selected = true;
      targetSel.appendChild(o);
    });
    var novo = document.createElement("option");
    novo.value = "__new";
    novo.textContent = "新建分组：导入_" + new Date().toISOString().slice(0, 10);
    targetSel.appendChild(novo);
    content.appendChild(targetSel);

    var wrap = miniDialog(
      "批量导入 Tag",
      [{ key: "text", label: "粘贴内容", type: "textarea", value: "", placeholder: '例如：\n1girl, 一个女孩\nlong hair, 长发' }],
      function (v) {
        var text = v.text || "";
        if (!text.trim()) {
          toast("没有可导入的内容");
          return false;
        }
        var res = importText(text, targetSel.value);
        toast(res.added ? "已导入 " + res.added + " 个标签" : "没有解析到标签");
      },
      { content: content },
    );

    file.addEventListener("change", function () {
      var f = file.files && file.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        var ta = wrap.querySelector("textarea");
        if (ta) ta.value = String(r.result || "");
      };
      r.readAsText(f, "utf-8");
    });
  }

  function importText(text, targetGroupId) {
    var cat = currentCategory();
    if (!cat) return { added: 0 };
    var pairs = parseImport(text);
    if (!pairs.length) return { added: 0 };

    var gid = targetGroupId;
    var cc = findCustomCategory(cat.id, true);
    var group = null;
    if (gid === "__new") {
      gid = uid("grp");
      group = { id: gid, name: "导入_" + new Date().toISOString().slice(0, 10), tags: [] };
      cc.groups.push(group);
    } else {
      // 找到（或镜像）目标分组
      var baseGroup = null;
      var c = currentCategory();
      for (var i = 0; i < c.groups.length; i++) if (c.groups[i].id === gid) baseGroup = c.groups[i];
      for (var j = 0; j < cc.groups.length; j++) if (cc.groups[j].id === gid) group = cc.groups[j];
      if (!group) {
        group = { id: gid, name: baseGroup ? baseGroup.name : "导入", tags: [] };
        cc.groups.push(group);
      }
    }

    var added = 0;
    pairs.forEach(function (p) {
      if (!p.name) return;
      var exists = group.tags.some(function (x) {
        return x.name === p.name;
      });
      if (exists) return;
      group.tags.push({ name: p.name, zh: p.zh || "" });
      added++;
    });
    saveCustom();
    state.lib = mergeLibrary(state.base, state.custom);
    state.groupId = gid;
    renderAll();
    return { added: added };
  }

  function parseImport(text) {
    var s = String(text || "").trim();
    if (!s) return [];
    // 1) JSON
    if (s[0] === "{" || s[0] === "[") {
      try {
        var j = JSON.parse(s);
        var out = [];
        var pushTag = function (name, zh) {
          if (!name) return;
          out.push({ name: String(name).trim(), zh: String(zh || "").trim() });
        };
        if (Array.isArray(j)) {
          j.forEach(function (it) {
            if (typeof it === "string") pushTag(it, "");
            else pushTag(it.name || it.tag || it.en, it.zh || it.cn || it.chinese);
          });
        } else if (j.categories) {
          j.categories.forEach(function (c) {
            (c.groups || []).forEach(function (g) {
              (g.tags || []).forEach(function (t) {
                pushTag(t.name || t, t.zh || t.cn || "");
              });
            });
          });
        } else {
          Object.keys(j).forEach(function (k) {
            pushTag(k, typeof j[k] === "string" ? j[k] : "");
          });
        }
        return out;
      } catch (e) {
        /* 落到纯文本解析 */
      }
    }
    // 2) 逐行
    var cjk = /[\u3400-\u9fff]/;
    return s
      .split(/\r?\n/)
      .map(function (line) {
        return line.trim();
      })
      .filter(Boolean)
      .map(function (line) {
        var parts = line.split(/[,\t|;]+/).map(function (x) {
          return x.trim();
        });
        var a = parts[0] || "";
        var b = parts[1] || "";
        if (cjk.test(a) && !cjk.test(b)) return { name: b, zh: a }; // 中文在前
        return { name: a, zh: b };
      })
      .filter(function (p) {
        return p.name;
      });
  }

  function openAddTagDialog() {
    var cat = currentCategory();
    if (!cat) return;
    miniDialog(
      "添加 Tag",
      [
        { key: "name", label: "标签（英文，NAI/SD 语法）", value: "" },
        { key: "zh", label: "中文说明（可选）", value: "" },
        {
          key: "group",
          label: "所属分组",
          type: "select",
          value: state.groupId === "__all" ? (cat.groups[0] || {}).id : state.groupId,
          options: (cat.groups || []).map(function (g) {
            return { v: g.id, t: g.name };
          }),
        },
      ],
      function (v) {
        var name = (v.name || "").trim();
        if (!name) return false;
        var gid = v.group;
        var cc = findCustomCategory(cat.id, true);
        var group = null;
        for (var i = 0; i < cc.groups.length; i++) if (cc.groups[i].id === gid) group = cc.groups[i];
        if (!group) {
          var baseGroup = null;
          for (var j = 0; j < cat.groups.length; j++) if (cat.groups[j].id === gid) baseGroup = cat.groups[j];
          group = { id: gid, name: baseGroup ? baseGroup.name : "新增", tags: [] };
          cc.groups.push(group);
        }
        if (
          group.tags.some(function (x) {
            return x.name === name;
          })
        ) {
          toast("该分组已有此标签");
          return false;
        }
        group.tags.push({ name: name, zh: (v.zh || "").trim() });
        saveCustom();
        state.lib = mergeLibrary(state.base, state.custom);
        renderAll();
        toast("已添加标签：" + name);
      },
    );
  }

  function exportLibrary() {
    var cat = currentCategory();
    var data = cat ? { version: 1, categories: [cat] } : state.lib;
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "aitag-tags-" + (cat ? cat.id : "all") + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 2000);
    toast("已导出当前" + (cat ? "分类" : "词库"));
  }

  function copyText(v) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(v).then(
        function () {
          toast("已复制提示词");
        },
        function () {
          toast("复制失败，请手动选择复制");
        },
      );
    } else {
      toast("当前浏览器不支持自动复制");
    }
  }

  // ===== 提示 =====
  var toastTimer = null;
  function toast(msg) {
    var t = document.querySelector(".tl-toast");
    if (!t) {
      // 弹窗尚未打开时也要能提示（面板上的清空按钮会用到）
      t = el("div", "tl-toast");
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.classList.remove("show");
    }, 1800);
  }

  // ===== 库加载 =====
  function loadLibrary(force) {
    var done = function (base) {
      state.base = base;
      state.lib = mergeLibrary(state.base, state.custom);
      // 词库来源署名（base.note 由服务端填：含上游项目与 GPL-3.0 说明）
      if (dom.libNote) {
        var note = base && base.note ? String(base.note) : "";
        dom.libNote.textContent = note;
        dom.libNote.title = note;
      }
      // 修正选中项
      var cats = state.lib.categories;
      if (!cats.length) {
        state.catId = null;
        state.groupId = null;
      } else {
        var has = cats.some(function (c) {
          return c.id === state.catId;
        });
        if (!has) state.catId = cats[0].id;
        var c = currentCategory();
        var gs = c ? c.groups || [] : [];
        var hasG = gs.some(function (g) {
          return g.id === state.groupId;
        });
        if (!hasG && state.groupId !== "__all") state.groupId = gs.length ? gs[0].id : null;
      }
      renderAll();
    };

    if (state.base && !force) return done(state.base);

    function grab(url) {
      return fetch(url, { cache: "no-store" }).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json().then(function (j) {
          // 接口用 { ok:false, synced:false } 表示"词库没同步"，这不算成功
          if (j && j.ok === false) throw new Error(j.error || "词库未同步");
          return j;
        });
      });
    }

    // 先问服务端词库（真实 WeiLin 数据），拿不到再退回仓库自带的起始库。
    // 两步都失败也要能用 —— 本地覆盖层照常工作。
    grab(LIB_API_URL)
      .then(done)
      .catch(function () {
        return grab(LIB_FALLBACK_URL)
          .then(function (j) {
            done(j);
            toast("服务端词库未同步，已回退到自带的起始库");
          })
          .catch(function () {
            done({ version: 1, categories: [] });
            toast("服务器词库未加载，仅显示本地新增标签");
          });
      });
  }

  // ===== 对外 =====
  function open(opts) {
    opts = opts || {};
    var targetId = opts.textareaId || "naiPrompt";
    state.target = document.getElementById(targetId);

    state.custom = readLS(K_CUSTOM, null) || defaultCustom();
    state.prefs = readLS(K_PREFS, null) || defaultPrefs();
    // 兼容旧版本缺字段
    var dp = defaultPrefs();
    Object.keys(dp).forEach(function (k) {
      if (state.prefs[k] === undefined) state.prefs[k] = dp[k];
    });
    state.selected = {};
    state.batchMode = false;

    build();
    dom.search.value = "";
    state.query = "";
    dom.autoCb.checked = !!state.prefs.autoAddOnSearch;
    dom.ta.value = readTarget();

    // 恢复上次分类/分组
    if (!state.catId && state.prefs.lastCategory) state.catId = state.prefs.lastCategory;
    if (!state.groupId && state.prefs.lastGroup) state.groupId = state.prefs.lastGroup;

    loadLibrary(true);
    dom.overlay.classList.add("open");
    setTimeout(function () {
      dom.ta.focus();
    }, 60);
  }

  function close() {
    if (dom.overlay) dom.overlay.classList.remove("open");
    writeTarget(dom.ta ? dom.ta.value : readTarget());
  }

  window.StudioTagLib = { open: open, close: close, toast: toast, _state: state };
})();

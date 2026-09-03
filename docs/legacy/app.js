const API_BASE = window.location.origin; // assume same host

function apiUrl(pathOrUrl, base = API_BASE) {
  return pathOrUrl instanceof URL
    ? new URL(pathOrUrl.toString())
    : new URL(String(pathOrUrl || ''), base);
}

let CONFIG = {
  asset_base_url: '',
  page_size: 60,
  redis_enabled: false,
  list_mode: 'infinite',
  announce_enabled: false,
  ads_enabled: false,
  ads: [],
  old_blacklist_migrate_enabled: false,
  defensive_query_mode_enabled: true,
  sensitive_content_block_enabled: true,
  sensitive_content_policy_version: '',
  sensitive_content_terms: [],
  sensitive_content_region_whitelist_enabled: true,
  sensitive_content_access_bind_ip_enabled: true,
  sensitive_content_region_allowed: false,
  sensitive_content_browser_language: '',
  sensitive_content_browser_language_allowed: false,
  sensitive_content_country_allowed: false,
  sensitive_content_client_ip_available: false,
  sensitive_content_client_ip_is_ipv6: false,
  sensitive_search_token: '',
};

const SENSITIVE_FILTER = window.GallerySensitiveFilter || {};
const SENSITIVE_CONTENT_POLICY_VERSION = '260830a';
const SENSITIVE_CONTENT_FALLBACK_TERMS = [
  'ロリ', 'loli', 'JS', 'ショタ', 'ロリニティ', '女子小学生', '幼女化', '少年', '男の子',
  'ロリコン', 'ショタコン', 'ロリータ', 'ロリィタ', '幼女', 'ペド', 'ペドフィリア', '児童ポルノ', '小児性愛', '幼児性愛', '未成年性交', '児童買春',
  'lolita', 'child', 'minor', 'shota', 'lolicon', 'shotacon', 'pedophil', 'child porn', 'child pornography', 'child sexual abuse',
  'child sexual exploitation', 'underage sex', 'preteen sex', 'sexualized minor', 'sexualised minor',
  'minor sexual exploitation', 'ageplay', 'age play', 'csam',
  '萝莉', '蘿莉', '萝莉控', '蘿莉控', '萝莉塔', '蘿莉塔', '正太', '正太控', '戀童', '恋童', '戀童癖', '恋童癖',
  '儿童色情', '兒童色情', '幼童色情', '未成年色情', '儿童性剥削', '兒童性剝削', '儿童性虐待', '兒童性虐待',
  'JC', '女児', '小学生',
  '小女', 'つるぺた', 'ツルペタ', 'ぺたんこ胸', 'ぺた胸', '微乳', '無乳', '平胸', '貧乳', '贫乳', 'ちっぱい',
  '赤ちゃんプレイ', '赤ちゃんぷれい', '赤ちゃんごっこ', '婴儿play', '嬰兒play', '婴儿游戏', '嬰兒遊戲',
  '男湯の女の子', '男湯の少女', '園児服', '幼稚園服', '保育園児服', '幼儿园制服', '幼兒園制服', '幼稚園制服',
  '幼儿园服', '幼兒園服', 'おむつ', 'オムツ', 'おむつプレイ', '尿布', '尿布play', '尿布游戏', '尿布遊戲',
  '婴儿扮演', '嬰兒扮演', 'flat chest', 'flat-chested', 'flatchested', 'baby play', 'babyplay', 'diaper play',
  'diaperplay', 'diaper', "girl in men's bath", 'kindergarten uniform', 'preschool uniform', 'kindergarten clothes',
  'preschool clothes', '빈유', '평평한 가슴', '아기 플레이', '아기플레이', '기저귀 플레이', '기저귀', '유치원복',
  '유치원 교복', '무유', '작은 가슴', '남탕 여자아이', 'petits seins', 'poitrine plate', 'jeu de bébé',
  'uniforme de maternelle', 'couche', 'pecho plano', 'senos pequeños', 'juego de bebé', 'uniforme de jardín de infancia',
  'pañal', 'peito pequeno', 'seios pequenos', 'brincadeira de bebê', 'uniforme de jardim de infância', 'fralda',
  'flache brust', 'kleine brüste', 'babyspiel', 'kindergartenuniform', 'windel', 'seno piatto', 'seno piccolo',
  'gioco del bambino', "uniforme dell'asilo", 'pannolino', 'плоская грудь', 'маленькая грудь', 'детская игра',
  'форма детского сада', 'подгузник',
  '로리', '로리콘', '쇼타', '쇼타콘', '페도', '소아성애', '페도필리아', '아동포르노', '아동 포르노',
  '아동성착취', '아동 성착취', '미성년자 성착취',
  'pédophilie', 'pedophilie', 'pornographie infantile', 'pedofilia', 'pornografía infantil', 'pornografia infantil',
  'pädophilie', 'padophilie', 'kinderpornografie', 'pedopornografia', 'педофилия', 'детское порно',
];

const UI_I18N = window.GalleryUiI18n || {};
const TAG_TRANSLATIONS = window.GalleryTagTranslations || {};
const LANGUAGE_PREFERENCE_KEY = UI_I18N.LANGUAGE_PREFERENCE_KEY || 'galleryUiLanguageV1';

function getLangParamRaw() {
  try {
    const url = new URL(window.location.href);
    return String(url.searchParams.get('lang') || '').trim().toLowerCase();
  } catch {
    return '';
  }
}
function normalizeLangFromParam(raw) {
  if (typeof UI_I18N.normalizeForcedLanguage === 'function') return UI_I18N.normalizeForcedLanguage(raw);
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'us') return 'en';
  if (v === 'cn' || v === 'zh') return 'zh';
  return '';
}
function getStoredLanguagePreference() {
  try {
    const raw = localStorage.getItem(LANGUAGE_PREFERENCE_KEY) || '';
    return typeof UI_I18N.normalizeStoredLanguage === 'function'
      ? UI_I18N.normalizeStoredLanguage(raw)
      : (['zh', 'zh_tw', 'en', 'ja', 'ko'].includes(raw) ? raw : '');
  } catch {
    return '';
  }
}
function detectBrowserLang() {
  try {
    const list = Array.isArray(navigator.languages) && navigator.languages.length ? navigator.languages : [navigator.language];
    if (typeof UI_I18N.detectBrowserLanguage === 'function') return UI_I18N.detectBrowserLanguage(list);
    const preferred = list.map((x) => String(x || '').trim().toLowerCase()).find(Boolean) || '';
    return preferred.startsWith('zh') ? 'zh' : 'en';
  } catch {
    return 'en';
  }
}
const LANG_PARAM_RAW = getLangParamRaw();
const FORCED_LANG = normalizeLangFromParam(LANG_PARAM_RAW);
const CURRENT_LANG = FORCED_LANG || getStoredLanguagePreference() || detectBrowserLang();
try { window.GALLERY_LANG = CURRENT_LANG; } catch { }

const I18N = {
  zh: {
    search_placeholder_q: '搜索:作品ID/作者ID或名称/简介/tags(日文/翻译)/投稿日期/AI类型/模型(支持 -排除 与 OR 双引号精准)',
    search_placeholder_prompt: '搜索:NAI和SD AI元数据Prompt(不含负面词和ComfyUI)',
    sort_label: '排序',
    sort_new: '新作品排序',
    sort_monthly: '每月排行榜',
    time_range_label: '时间范围',
    time_all: '全部时间',
    time_full_year: ({ year }) => `${year}全年`,
    time_quarter: ({ year, quarter }) => `${year}第${quarter}季度`,
    time_older: '更老(2023年9月之前)',
    time_current_month: '当前月份',
    btn_search: '搜索',
    blacklist_placeholder: '黑名单屏蔽关键词(逗号/空格分隔,不屏蔽AI元数据)',
    btn_save_blacklist: '保存黑名单',
    status_searching: '搜索中…',
    sensitive_search_blocked: '无内容',
    no_results: '无搜索结果',
    loading: '载入中…',
    loading_failed: '载入失败',
    rank_processing: '排行榜正在处理中，请等待2小时后查看',
    load_more: '加载更多',
    jump_label: '跳至第',
	    jump_placeholder: '页码',
	    btn_go: '跳转',
    open_work_new_window: '新窗口打开作品',
	    show_suspect_invalid_tags: '显示疑似无效TAG作品',
	    show_naix_invalid_tags: '显示NAI_X无效TAG作品',
	    show_r18: '显示 R-18 作品',
	    show_card_preview: '显示卡片预览窗口',
	    fc_chip_label: '设置与页码',
    fc_q_placeholder: '搜索：ID/作者ID或名称/简介/tags/日期/类型/模型',
    fc_prompt_placeholder: '搜索：NAI/SD元数据Prompt',
    fc_blacklist_placeholder: '黑名单屏蔽关键词(逗号/空格分隔)',
    preview_alt: '预览',
    back_btn: '← 返回',
    detail_header: '作品详情',
    home_alt: '首页',
    home_title: '返回首页',
    thumb_alt: '缩略图',
    type_search_tip: '点击按类型搜索',
    naix_suspect: '疑无效TAG',
    naix_suspect_bracket: '[疑无效TAG]',
    naix_suspect_paren: '（疑无效TAG）',
    non_standard_format: '非标准格式',
    non_standard_format_bracket: '[非标准格式]',
    non_standard_format_paren: '（非标准格式）',
    non_standard_format_tip: '这是来自 tensor.art 网址在线生成流，并非正确的 ComfyUI 工作流',
    work_fallback: ({ id }) => `作品 ${id}`,
    images_count: ({ n }) => `${n} 张`,
    err_network: '网络错误',
    show_full_meta: '显示完整 AI 元数据',
    dm_pixiv_id: 'Pixiv ID',
    dm_author: '作者',
    dm_type: '类型',
    dm_tags: '标签',
    dm_caption: '作品简介',
    dm_posted_at: '投稿时间',
    dm_unknown: '未知',
    dm_none: '无',
    dm_views: '浏览',
    dm_bookmarks: '收藏',
    caption_show_all: '显示全部简介',
    caption_collapse: '折叠简介',
    ai_meta_mode: 'AI元数据模式',
    ai_meta_readable: '易读',
    ai_meta_raw: '原始 JSON',
    ai_meta_instruction: '指令',
    copy_readable: '复制易读内容',
    copy_json: '复制 JSON',
    copy_instruction: '复制指令',
    copied: '已复制',
    copy_failed: '复制失败',
    copy_failed_manual: '复制失败，请手动复制:\n\n',
    show_all: '显示全部',
    collapse: '折叠',
    copy_all_image_links: '复制全部图片链接',
    no_links_to_copy: '无可复制链接',
    copied_n_links: ({ n }) => `已复制 ${n} 条链接`,
    copy_failed_popup: '复制失败，已弹出文本',
    prev_group: '上一组',
    next_group: '下一组',
    seo_tags_prefix: '标签',
    seo_ai_meta_prefix: 'AI元数据',
    announce_title: '公告说明',
    announce_close: '关闭',
    announce_p1: '这网站是收集P站AI图带AI元数据作品',
    announce_p2: '初哀是方便大家新手学习或更加简单方便抄作业玩AI绘画',
    announce_p3: '我自己也经常分享自己图给群友们，还从24年开始使用自己每月25刀购买NAI号搭建AI机器人给群友们免费玩',
    announce_p4: '当然我也能理解作者们花时间来创作作品的劳动成果',
    announce_strong_prefix: '所以如果不想公开自己作品，随时都可以',
    announce_strong_link: 'P站联系我(Puid:120618272)',
    announce_strong_suffix: '删除',
    lang_btn_zh: '中文',
    lang_btn_en: 'EN',
    btn_import_blacklist: '导入旧域名黑名单',
    import_blacklist_popup_blocked: '弹窗被浏览器拦截，请允许本站弹窗后再点一次',
    import_blacklist_starting: '正在从旧域名导入…',
    import_blacklist_done: '已导入旧域名黑名单',
    import_blacklist_failed: '导入失败（可能旧域名禁止被 iframe 嵌入或无旧数据）',
  },
  en: {
    search_placeholder_q: 'Search: work ID / author ID or name / caption / tags (Japanese/translated) / date / AI type / model (supports -exclude, OR, and quoted exact match)',
    search_placeholder_prompt: 'Search: NAI & SD AI metadata prompt (no negative / no ComfyUI)',
    sort_label: 'Sort',
    sort_new: 'Newest',
    sort_monthly: 'Monthly ranking',
    time_range_label: 'Time range',
    time_all: 'All time',
    time_full_year: ({ year }) => `${year} (full year)`,
    time_quarter: ({ year, quarter }) => `${year} Q${quarter}`,
    time_older: 'Older (before 2023-09)',
    time_current_month: 'Current month',
    btn_search: 'Search',
    blacklist_placeholder: 'Block keywords (comma/space separated; does not block AI metadata)',
    btn_save_blacklist: 'Save blocklist',
    status_searching: 'Searching…',
    sensitive_search_blocked: 'No content',
    no_results: 'No results',
    loading: 'Loading…',
    loading_failed: 'Load failed',
    rank_processing: 'The ranking is being processed. Please check again after 2 hours.',
    load_more: 'Load more',
    jump_label: 'Go to',
	    jump_placeholder: 'Page',
	    btn_go: 'Go',
	    open_work_new_window: 'Open works in a new window',
	    show_suspect_invalid_tags: 'Show suspect invalid-tag works',
	    show_naix_invalid_tags: 'Show NAI_X invalid-tag works',
	    show_r18: 'Show R-18 works',
	    show_card_preview: 'Show card preview window',
	    fc_chip_label: 'Settings & page',
    fc_q_placeholder: 'Search: ID / author ID or name / caption / tags / date / type / model',
    fc_prompt_placeholder: 'Search: NAI/SD metadata prompt',
    fc_blacklist_placeholder: 'Block keywords (comma/space separated)',
    preview_alt: 'Preview',
    back_btn: '← Back',
    detail_header: 'Work details',
    home_alt: 'Home',
    home_title: 'Back to home',
    thumb_alt: 'Thumbnail',
    type_search_tip: 'Search by type',
    naix_suspect: 'Suspect invalid tags',
    naix_suspect_bracket: '[Suspect invalid tags]',
    naix_suspect_paren: '(Suspect invalid tags)',
    non_standard_format: 'Non-standard format',
    non_standard_format_bracket: '[Non-standard format]',
    non_standard_format_paren: '(Non-standard format)',
    non_standard_format_tip: 'Generated from tensor.art online workflow; not a proper ComfyUI workflow.',
    work_fallback: ({ id }) => `Work ${id}`,
    images_count: ({ n }) => `${n} images`,
    err_network: 'Network error',
    show_full_meta: 'Show full AI metadata',
    dm_pixiv_id: 'Pixiv ID',
    dm_author: 'Author',
    dm_type: 'Type',
    dm_tags: 'Tags',
    dm_caption: 'Caption',
    dm_posted_at: 'Posted at',
    dm_unknown: 'Unknown',
    dm_none: 'None',
    dm_views: 'Views',
    dm_bookmarks: 'Bookmarks',
    caption_show_all: 'Show full caption',
    caption_collapse: 'Collapse caption',
    ai_meta_mode: 'AI metadata mode',
    ai_meta_readable: 'Readable',
    ai_meta_raw: 'Raw JSON',
    ai_meta_instruction: 'Instruction',
    copy_readable: 'Copy readable metadata',
    copy_json: 'Copy JSON',
    copy_instruction: 'Copy instruction',
    copied: 'Copied',
    copy_failed: 'Copy failed',
    copy_failed_manual: 'Copy failed. Please copy manually:\n\n',
    show_all: 'Show all',
    collapse: 'Collapse',
    copy_all_image_links: 'Copy all image links',
    no_links_to_copy: 'No links to copy',
    copied_n_links: ({ n }) => `Copied ${n} links`,
    copy_failed_popup: 'Copy failed; opened as text',
    prev_group: 'Prev',
    next_group: 'Next',
    seo_tags_prefix: 'Tags',
    seo_ai_meta_prefix: 'AI metadata',
    announce_title: 'Announcement',
    announce_close: 'Close',
    announce_p1: 'This site collects Pixiv AI works that include AI metadata.',
    announce_p2: 'The goal is to help beginners learn faster and make it easier to study good prompts and settings.',
    announce_p3: 'I also often share my own works with group friends. Since 2024, I have been paying $25/month for a NovelAI account to run an AI bot for group friends to use for free.',
    announce_p4: 'I also understand the effort creators put into making their works.',
    announce_strong_prefix: 'If you do not want your works to be public, you can message me on Pixiv anytime to have them removed:',
    announce_strong_link: 'Message me on Pixiv (Puid:120618272)',
    announce_strong_suffix: '',
    lang_btn_zh: 'ZH',
    lang_btn_en: 'EN',
    btn_import_blacklist: 'Import old blocklist',
    import_blacklist_popup_blocked: 'Popup was blocked. Please allow popups and retry.',
    import_blacklist_starting: 'Importing from old domain…',
    import_blacklist_done: 'Imported old blocklist',
    import_blacklist_failed: 'Import failed (old domain may block iframe or no data)',
  },
};
Object.entries(UI_I18N.translations || {}).forEach(([language, values]) => {
  const fallback = language === 'zh_tw' ? I18N.zh : I18N.en;
  I18N[language] = { ...fallback, ...(I18N[language] || {}), ...(values || {}) };
});
function t(key, vars = {}) {
  const dict = I18N[CURRENT_LANG] || I18N.en;
  const val = dict[key] == null ? (I18N.en[key] == null ? I18N.zh[key] : I18N.en[key]) : dict[key];
  if (typeof val === 'function') return String(val(vars));
  if (val == null) return String(key);
  return String(val);
}
function withLangParam(urlOrPath) {
  if (!LANG_PARAM_RAW) return String(urlOrPath || '');
  const raw = String(urlOrPath || '');
  try {
    const u = new URL(raw, window.location.origin);
    if (u.origin === window.location.origin) {
      u.searchParams.set('lang', LANG_PARAM_RAW);
      return u.pathname + u.search + u.hash;
    }
    return raw;
  } catch {
    return raw;
  }
}

function currentSiteCopy() {
  const values = (UI_I18N.site || {})[CURRENT_LANG] || (UI_I18N.site || {}).en;
  return values || {
    title: 'AI TAG Prompt Art Gallery',
    description: 'AI image prompt gallery for Stable Diffusion, ComfyUI, and NovelAI.',
  };
}

function currentHtmlLang() {
  return typeof UI_I18N.htmlLang === 'function' ? UI_I18N.htmlLang(CURRENT_LANG) : (CURRENT_LANG === 'zh' ? 'zh-CN' : 'en');
}

function currentOgLocale() {
  return typeof UI_I18N.ogLocale === 'function' ? UI_I18N.ogLocale(CURRENT_LANG) : (CURRENT_LANG === 'zh' ? 'zh_CN' : 'en_US');
}

function applyStaticI18n() {
  try {
    document.documentElement.lang = currentHtmlLang();
  } catch { }
  try {
    const siteCopy = currentSiteCopy();
    const heroTitle = document.getElementById('heroTitle');
    const heroDescription = document.getElementById('heroDescription');
    if (heroTitle) heroTitle.textContent = siteCopy.title;
    if (heroDescription) heroDescription.textContent = siteCopy.description;
  } catch { }
  try {
    const homeLink = document.getElementById('homeLink');
    const homeImg = homeLink ? homeLink.querySelector('img') : null;
    if (homeLink) homeLink.href = withLangParam('/');
    if (homeLink) homeLink.title = t('home_title');
    if (homeImg) homeImg.alt = t('home_alt');
  } catch { }
  try { if (qInput) qInput.placeholder = t('search_placeholder_q'); } catch { }
  try { if (promptInput) promptInput.placeholder = t('search_placeholder_prompt'); } catch { }
  try { if (blacklistInput) blacklistInput.placeholder = t('blacklist_placeholder'); } catch { }
  try { if (searchBtn) searchBtn.textContent = t('btn_search'); } catch { }
  try { if (saveBlacklistBtn) saveBlacklistBtn.textContent = t('btn_save_blacklist'); } catch { }
  try { if (importOldBlacklistBtn) importOldBlacklistBtn.textContent = t('btn_import_blacklist'); } catch { }
  try {
    document.querySelectorAll('#searchStatus span').forEach((n) => { n.textContent = t('status_searching'); });
  } catch { }
  try { if (noResultEl) noResultEl.textContent = t('no_results'); } catch { }
  try { if (loadMoreBtn) loadMoreBtn.textContent = t('load_more'); } catch { }
  try { if (sortModeSel) sortModeSel.setAttribute('aria-label', t('sort_label')); } catch { }
  try { if (timeRangeSel) timeRangeSel.setAttribute('aria-label', t('time_range_label')); } catch { }
  try { if (sortModeSel2) sortModeSel2.setAttribute('aria-label', t('sort_label')); } catch { }
  try { if (timeRangeSel2) timeRangeSel2.setAttribute('aria-label', t('time_range_label')); } catch { }
  try { if (fcChip) fcChip.setAttribute('aria-label', t('fc_chip_label')); } catch { }
  try {
    [sortModeSel, sortModeSel2].filter(Boolean).forEach((sel) => {
      Array.from(sel.options || []).forEach((opt) => {
        const v = String(opt.value || '');
        if (v === 'new') opt.textContent = t('sort_new');
        if (v === 'monthly') opt.textContent = t('sort_monthly');
      });
    });
  } catch { }
  try {
    const fcLabel = document.querySelector('#fcPanel .fc-label');
    if (fcLabel) fcLabel.textContent = t('jump_label');
  } catch { }
  try { if (fcInput) fcInput.placeholder = t('jump_placeholder'); } catch { }
  try { if (fcGo) fcGo.textContent = t('btn_go'); } catch { }
	  try {
	    const label = document.querySelector('#fcPanel label[for="fcLanguageSelect"]');
	    if (label) label.textContent = t('language_label');
	    if (fcLanguageSelect) {
	      const optionKeys = {
	        auto: 'language_auto', zh: 'language_zh', zh_tw: 'language_zh_tw',
	        en: 'language_en', ja: 'language_ja', ko: 'language_ko',
	      };
	      Array.from(fcLanguageSelect.options || []).forEach((option) => {
	        const key = optionKeys[String(option.value || '')];
	        if (key) option.textContent = t(key);
	      });
	      fcLanguageSelect.value = FORCED_LANG || getStoredLanguagePreference() || 'auto';
	    }
	  } catch { }
	  try {
	    const fcSwitchText = document.querySelector('#fcPanel label[for="openWorkNewWindowToggle"] .fc-switch-text');
	    if (fcSwitchText) fcSwitchText.textContent = t('open_work_new_window');
	  } catch { }
	  try {
	    const el = document.querySelector('#fcPanel label[for="showSuspectInvalidTagToggle"] .fc-switch-text');
	    if (el) el.textContent = t('show_suspect_invalid_tags');
	  } catch { }
	  try {
	    const el = document.querySelector('#fcPanel label[for="showNaixInvalidTagToggle"] .fc-switch-text');
	    if (el) el.textContent = t('show_naix_invalid_tags');
	  } catch { }
	  try {
	    const el = document.querySelector('#fcPanel label[for="showR18Toggle"] .fc-switch-text');
	    if (el) el.textContent = t('show_r18');
	  } catch { }
	  try {
	    const el = document.querySelector('#fcPanel label[for="cardPreviewToggle"] .fc-switch-text');
	    if (el) el.textContent = t('show_card_preview');
	  } catch { }
  try { const fcQ = document.getElementById('fcQ'); if (fcQ) fcQ.placeholder = t('fc_q_placeholder'); } catch { }
  try { const fcPrompt = document.getElementById('fcPrompt'); if (fcPrompt) fcPrompt.placeholder = t('fc_prompt_placeholder'); } catch { }
  try { const fcBlacklist = document.getElementById('fcBlacklist'); if (fcBlacklist) fcBlacklist.placeholder = t('fc_blacklist_placeholder'); } catch { }
  try { const fcSearchBtn = document.getElementById('fcSearchBtn'); if (fcSearchBtn) fcSearchBtn.textContent = t('btn_search'); } catch { }
  try { const fcSaveBlacklistBtn = document.getElementById('fcSaveBlacklistBtn'); if (fcSaveBlacklistBtn) fcSaveBlacklistBtn.textContent = t('btn_save_blacklist'); } catch { }
  try { if (hpImg) hpImg.alt = t('preview_alt'); } catch { }
  try { if (backBtn) backBtn.textContent = t('back_btn'); } catch { }
  try { if (detailTitle) detailTitle.textContent = t('detail_header'); } catch { }
  try {
    const titleEl = document.getElementById('announceTitle');
    if (titleEl) titleEl.textContent = t('announce_title');
  } catch { }
  try { if (announceClose) announceClose.textContent = t('announce_close'); } catch { }
  try {
    const content = document.querySelector('#announceOverlay .announce-content');
    if (content) {
      const href = 'https://www.pixiv.net/messages.php?receiver_id=120618272';
      const linkHtml = `<a href="${href}" target="_blank" rel="noopener noreferrer">${escapeHtml(t('announce_strong_link'))}</a>`;
      const prefix = escapeHtml(t('announce_strong_prefix'));
      const suffix = escapeHtml(t('announce_strong_suffix'));
      content.innerHTML = `
        <p>${escapeHtml(t('announce_p1'))}</p>
        <p>${escapeHtml(t('announce_p2'))}</p>
        <p>${escapeHtml(t('announce_p3'))}</p>
        <p>${escapeHtml(t('announce_p4'))}</p>
        <p class="announce-strong">${prefix}${['zh', 'zh_tw', 'ja'].includes(CURRENT_LANG) ? '' : ' '}${linkHtml}${suffix ? (' ' + suffix) : ''}</p>
      `;
    }
  } catch { }
}

function applyHomepageAnnouncement(source = {}) {
  try {
    const announcementZh = String(source.homepage_announcement_zh || '').trim();
    const announcementEn = String(source.homepage_announcement_en || '').trim();
    const text = CURRENT_LANG.startsWith('zh')
      ? (announcementZh || announcementEn)
      : (announcementEn || announcementZh);
    const container = document.getElementById('heroAnnouncement');
    const target = document.getElementById('heroAnnouncementText');
    if (target) target.textContent = text;
    if (container) container.classList.toggle('hidden', !text);
  } catch { }
}

function setOrCreateMetaByName(name, content) {
  if (!name) return;
  const head = document.head || document.getElementsByTagName('head')[0];
  if (!head) return;
  let el = head.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    head.appendChild(el);
  }
  el.setAttribute('content', String(content ?? ''));
}

function setOrCreateMetaByProperty(property, content) {
  if (!property) return;
  const head = document.head || document.getElementsByTagName('head')[0];
  if (!head) return;
  let el = head.querySelector(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('property', property);
    head.appendChild(el);
  }
  el.setAttribute('content', String(content ?? ''));
}

function setOrCreateLinkRel(rel, href) {
  if (!rel) return;
  const head = document.head || document.getElementsByTagName('head')[0];
  if (!head) return;
  let el = head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    head.appendChild(el);
  }
  el.setAttribute('href', String(href ?? ''));
}

function clearDynamicOgImages() {
  try {
    document.querySelectorAll('meta[property="og:image"][data-dynamic="1"]').forEach((n) => n.remove());
  } catch { }
  try {
    const tw = document.querySelector('meta[name="twitter:image"][data-dynamic="1"]');
    if (tw) tw.remove();
  } catch { }
}

function setDynamicOgImages(urls) {
  const head = document.head || document.getElementsByTagName('head')[0];
  if (!head) return;
  clearDynamicOgImages();
  const list = Array.isArray(urls) ? urls.filter(Boolean).slice(0, 8) : [];
  list.forEach((u) => {
    const m = document.createElement('meta');
    m.setAttribute('property', 'og:image');
    m.setAttribute('content', String(u));
    m.dataset.dynamic = '1';
    head.appendChild(m);
  });
  if (list.length) {
    const tw = document.createElement('meta');
    tw.setAttribute('name', 'twitter:image');
    tw.setAttribute('content', String(list[0]));
    tw.dataset.dynamic = '1';
    head.appendChild(tw);
  }
}

function compactOneLine(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

function applyHomeSeo() {
  const siteCopy = currentSiteCopy();
  const siteTitle = siteCopy.title;
  document.title = siteTitle;
  setOrCreateMetaByName('description', siteCopy.description);
  setOrCreateMetaByName('robots', 'index,follow,max-image-preview:large');
  setOrCreateMetaByProperty('og:title', siteTitle);
  setOrCreateMetaByProperty('og:description', siteCopy.description);
  setOrCreateMetaByProperty('og:type', 'website');
  setOrCreateMetaByProperty('og:site_name', siteTitle);
  setOrCreateMetaByProperty('og:locale', currentOgLocale());
  setOrCreateMetaByName('twitter:card', 'summary_large_image');
  setOrCreateMetaByName('twitter:title', siteTitle);
  setOrCreateMetaByName('twitter:description', siteCopy.description);
  const href = String(window.location.origin || '') + '/';
  setOrCreateMetaByProperty('og:url', href);
  setOrCreateLinkRel('canonical', href);
  clearDynamicOgImages();
}

function applyWorkSeo(workId, work = {}, images = []) {
  let typeRaw = String(work.AI_type || work.ai_type || '').trim();
  if (!typeRaw) {
    try {
      const first = Array.isArray(images) ? images[0] : null;
      if (first && first.image_type) typeRaw = String(first.image_type).trim();
    } catch { }
  }
  const typeLabel = typeRaw ? typeRaw.toUpperCase() : 'AI';
  const titleRaw = (work.title && String(work.title).trim()) ? String(work.title).trim() : '';
  const siteCopy = currentSiteCopy();
  const siteTitle = siteCopy.title;
  const workTitle = `[${typeLabel}] ${titleRaw || t('work_fallback', { id: workId })} - ${siteTitle}`;

  const tags = normalizeTags(work.tags);
  let aiJson = '';
  try {
    const first = Array.isArray(images) ? images[0] : null;
    if (first && first.ai_json != null) {
      if (typeof first.ai_json === 'string') {
        aiJson = first.ai_json;
      } else {
        aiJson = JSON.stringify(first.ai_json);
      }
    }
  } catch { }
  let desc = '';
  if (tags.length) desc += `${t('seo_tags_prefix')}: ${tags.slice(0, 80).join(', ')} `;
  if (aiJson) desc += `${t('seo_ai_meta_prefix')}: ${aiJson}`;
  desc = compactOneLine(desc).slice(0, 1200);

  document.title = workTitle;
  setOrCreateMetaByName('description', desc || siteCopy.description);
  setOrCreateMetaByName('robots', 'index,follow,max-image-preview:large');
  setOrCreateMetaByProperty('og:title', workTitle);
  setOrCreateMetaByProperty('og:description', desc || siteCopy.description);
  setOrCreateMetaByProperty('og:type', 'article');
  setOrCreateMetaByProperty('og:site_name', siteTitle);
  setOrCreateMetaByProperty('og:locale', currentOgLocale());
  setOrCreateMetaByName('twitter:card', 'summary_large_image');
  setOrCreateMetaByName('twitter:title', workTitle);
  setOrCreateMetaByName('twitter:description', desc || siteCopy.description);
  const href = `${window.location.origin}/i/${workId}`;
  setOrCreateMetaByProperty('og:url', href);
  setOrCreateLinkRel('canonical', href);
  try {
    const urls = (Array.isArray(images) ? images : []).map((img) => buildImageUrl(img)).filter(Boolean);
    setDynamicOgImages(urls);
  } catch {
    clearDynamicOgImages();
  }
}

const state = {
  page: 1,
  pageSize: 60,
  q: '',
  prompt: '',
  blacklist: [],
  items: [],
  total: 0,
  preview: { index: 0, images: [], title: '', active: false, side: 'right', top: 16, anchorEl: null, pendingWorkId: '', requestToken: 0, closeTimer: 0, pointerOnPanel: false },
  cache: { works: new Map() },
  directDetail: false,
  searchIntent: false,
  historySearchIntent: false,
  exactWorkSearchId: '',
	  listMode: 'infinite',
	  openWorkInNewWindow: false,
	  showSuspectInvalidTags: false,
	  showNaixInvalidTags: false,
	  showR18: false,
	  cardPreviewEnabled: true,
	  lang: CURRENT_LANG,
		  ads: { lastKey: '', preloaded: new Set(), preloadTimer: 0 },
		  workFlags: new Map(),
		  // Set only after the current SPA has completed an allowlisted display or
		  // in-site search session. The server-side cookie is HttpOnly; this flag
		  // is the SPA's acknowledgement that the cookie was just established.
  sensitiveAccessSession: false,
  sensitiveAccessSessionExpiresAt: 0,
  searchWorkAccessCodes: new Map(),
  workPages: new Map(),
		  // Incremented whenever the list query/page context is reset. Async
		  // search responses from an older context must never replace a newer
		  // waterfall state.
		  listGeneration: 0,
		  detailScroll: { currentWorkId: null, byWork: new Map(), restoreTimers: [], isRestoring: false },
		  // Invalidates an asynchronous detail load when the user returns or
		  // starts opening another work before the previous request completes.
		  detailRequestToken: 0,
		  // Snapshot of the list view at the moment a card opens. The waterfall
		  // keeps its loaded pages in memory while the fixed detail view is shown.
		  listReturnSnapshot: null,
		};
// 统一移动端断点与设备特性检测（移动端不启用悬浮预览）
const MOBILE_MAX_WIDTH = 800;
function supportsHover() {
  try { return window.matchMedia('(hover: hover) and (pointer: fine)').matches; } catch { return false; }
}
function isGalleryPreviewContextActive() {
  try {
    // The gallery cards stay mounted underneath the fixed detail overlay so
    // the waterfall can be restored instantly. They must never be treated as
    // hover targets while a detail route is active.
    if (state.directDetail) return false;
    if (String(window.location.pathname || '').startsWith('/i/')) return false;
    const detail = document.getElementById('detailView');
    if (detail && !detail.classList.contains('hidden')) return false;
  } catch { return false; }
  return true;
}
function shouldEnableHoverPreview() {
  return state.cardPreviewEnabled !== false
    && isGalleryPreviewContextActive()
    && supportsHover()
    && window.innerWidth > MOBILE_MAX_WIDTH;
}

const galleryEl = document.getElementById('gallery');
const loadingEl = document.getElementById('loading');
const paginationEl = document.getElementById('pagination');
const loadMoreBtn = document.getElementById('loadMoreBtn');
const qInput = document.getElementById('q');
const promptInput = document.getElementById('prompt');
const searchBtn = document.getElementById('searchBtn');
const searchStatusEl = document.getElementById('searchStatus');
const noResultEl = document.getElementById('noResult');
const sortModeSel = document.getElementById('sortMode');
const timeRangeSel = document.getElementById('timeRange');
const sortModeSel2 = document.getElementById('sortMode2');
const timeRangeSel2 = document.getElementById('timeRange2');
const blacklistInput = document.getElementById('blacklist');
const saveBlacklistBtn = document.getElementById('saveBlacklistBtn');
let importOldBlacklistBtn = null;
// 右下角浮动控件元素（设置形状芯片）
const fcChip = document.getElementById('fcChip');
const fcNum = document.getElementById('fcNum');
const fcPanel = document.getElementById('fcPanel');
	const fcInput = document.getElementById('fcInput');
	const fcGo = document.getElementById('fcGo');
	const fcLanguageSelect = document.getElementById('fcLanguageSelect');
	const openWorkNewWindowToggle = document.getElementById('openWorkNewWindowToggle');
	const showSuspectInvalidTagToggle = document.getElementById('showSuspectInvalidTagToggle');
	const showNaixInvalidTagToggle = document.getElementById('showNaixInvalidTagToggle');
	const showR18Toggle = document.getElementById('showR18Toggle');
	const cardPreviewToggle = document.getElementById('cardPreviewToggle');

// 悬浮预览元素
const hoverPreview = document.getElementById('hoverPreview');
const hpImg = document.getElementById('hpImage');
const hpTitle = document.getElementById('hpTitle');
const hpCount = document.getElementById('hpCount');

const detailView = document.getElementById('detailView');
const backBtn = document.getElementById('backBtn');
const detailMeta = document.getElementById('detailMeta');
const detailImages = document.getElementById('detailImages');
const detailTitle = document.getElementById('detailTitle');

const announceOverlay = document.getElementById('announceOverlay');
const announceClose = document.getElementById('announceClose');

// 工具函数
const escapeHtml = (s = '') => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function getAuthorInfo(work = {}, images = []) {
  const safeWork = (work && typeof work === 'object') ? work : {};
  const firstImage = Array.isArray(images) && images[0] && typeof images[0] === 'object' ? images[0] : {};
  const idCandidates = [safeWork.userId, safeWork.userid, safeWork.author_id, firstImage.author_id];
  const nameCandidates = [safeWork.authorName, safeWork.author_name, safeWork.userName];
  let id = '';
  let name = '';
  for (const candidate of idCandidates) {
    const value = candidate == null ? '' : String(candidate).trim();
    if (value) {
      id = value;
      break;
    }
  }
  for (const candidate of nameCandidates) {
    const value = candidate == null ? '' : String(candidate).trim();
    if (value) {
      name = value;
      break;
    }
  }
  return {
    id,
    name,
    label: name ? (id ? `${name} (${id})` : name) : id,
  };
}

function buildAuthorLinkHtml(work = {}, images = [], classNames = '') {
  const author = getAuthorInfo(work, images);
  if (!author.label) return '';
  const classes = String(classNames || '').trim();
  const classAttr = classes ? ` class="${escapeHtml(classes)}"` : '';
  if (!author.id) {
    return `<span${classAttr}>${escapeHtml(author.label)}</span>`;
  }
  // Author IDs are searches too. Use the same one-time in-site search intent
  // as tag links so defensive query mode does not treat the new-window href
  // as a direct `/?q=` navigation and send it back to the homepage.
  const href = makeSearchIntentHref(author.id);
  return `<a${classAttr} data-author-id="${escapeHtml(author.id)}" href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(author.label)}</a>`;
}

function wireAuthorSearchLinks(root) {
  try {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    root.querySelectorAll('a[data-author-id]').forEach((link) => {
      if (link.dataset.authorSearchWired === '1') return;
      link.dataset.authorSearchWired = '1';
      const authorId = String(link.dataset.authorId || '').trim();
      if (!authorId) return;
      link.addEventListener('click', (event) => {
        if (event.button != null && event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        openSearchIntentInNewWindow(authorId);
      });
      link.addEventListener('auxclick', (event) => {
        if (event.button !== 1) return;
        event.preventDefault();
        event.stopPropagation();
        openSearchIntentInNewWindow(authorId);
      });
    });
  } catch { }
}

// 以对象字段拼接图片完整链接：asset_base_url + image_type/author_id/file_name.webp
function buildImageUrl(imgOrPath = '') {
  const baseRaw = String(CONFIG.asset_base_url || '').trim();
  const base = baseRaw.endsWith('/') ? baseRaw : (baseRaw + '/');
  // 首选：对象字段 image_type/author_id/file_name
  if (imgOrPath && typeof imgOrPath === 'object') {
    const t = String(imgOrPath.image_type || '').trim();
    const a = String(imgOrPath.author_id ?? '').trim();
    const f = String(imgOrPath.file_name || '').trim();
    if (t && a && f) {
      return `${base}${t}/${a}/${f}.webp`;
    }
  }
  // 兼容旧字符串 image_path 的回退：去前缀并修正扩展名
  let p = String(imgOrPath || '');
  p = p.replace(/^\/?www\/pixiv_ai_tag\//, '');
  p = p.replace(/^\/?pixiv_ai_tag\//, '');
  p = p.replace(/\.png$/i, '.webp');
  p = p.replace(/^\/+/, '');
  return base ? (base + p) : p;
}

function formatMetric(value) {
  const v = Number(value) || 0;
  if (v >= 1000000) return `${(v / 1000000).toFixed(1).replace(/\.0$/, '')}m`;
  if (v >= 10000) return `${(v / 10000).toFixed(1).replace(/\.0$/, '')}w`;
  if (v >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(v);
}

function adsEnabled() {
  return !!(CONFIG.ads_enabled && Array.isArray(CONFIG.ads) && CONFIG.ads.length);
}

function currentAdDevice() {
  return window.innerWidth <= MOBILE_MAX_WIDTH ? 'mobile' : 'desktop';
}

function getAdVariants(placement = 'search') {
  if (!adsEnabled()) return [];
  const device = currentAdDevice();
  const fallbackDevice = device === 'mobile' ? 'desktop' : 'mobile';
  const targetLocation = placement === 'detail' ? 'detail' : 'search';
  const variants = [];
  CONFIG.ads.forEach((group) => {
    if (!group || typeof group !== 'object') return;
    const locations = Array.isArray(group.locations) && group.locations.length ? group.locations : ['all'];
    if (!(locations.includes('all') || locations.includes(targetLocation))) return;
    const groupId = String(group.id || group.name || 'media').trim();
    const name = String(group.name || groupId).trim() || groupId;
    const href = String(group.href || '').trim();
    if (!href) return;
    const deviceConfig = group[device] || group[fallbackDevice] || {};
    const images = Array.isArray(deviceConfig.images) ? deviceConfig.images : [];
    images.forEach((image, index) => {
      if (!image || typeof image !== 'object') return;
      const src = String(image.src || '').trim();
      if (!src) return;
      const width = Number(image.width || 0) > 0 ? Number(image.width) : 0;
      const height = Number(image.height || 0) > 0 ? Number(image.height) : 0;
      variants.push({
        key: `${device}:${groupId}:${src}:${index}`,
        groupId,
        name,
        href,
        src,
        width,
        height,
      });
    });
  });
  return variants;
}

function chooseAdVariant(placement = 'search') {
  const variants = getAdVariants(placement);
  if (!variants.length) return null;
  const device = currentAdDevice();
  const keyName = `gallery_ad_last_v1_${placement}_${device}`;
  let lastKey = state.ads.lastKey || '';
  try { lastKey = lastKey || localStorage.getItem(keyName) || ''; } catch { }
  let pool = variants.filter((v) => v.key !== lastKey);
  if (!pool.length) pool = variants;
  const picked = pool[Math.floor(Math.random() * pool.length)] || pool[0] || null;
  if (picked) {
    state.ads.lastKey = picked.key;
    try { localStorage.setItem(keyName, picked.key); } catch { }
  }
  return picked;
}

function shouldPreloadAdsOnSearchPage() {
  try {
    if (state.directDetail) return false;
    if (String(window.location.pathname || '').startsWith('/i/')) return false;
  } catch { }
  return true;
}

function getAdPreloadUrlsForCurrentPage() {
  if (!adsEnabled()) return [];
  const map = new Map();
  try {
    [...getAdVariants('search'), ...getAdVariants('detail')].forEach((ad) => {
      const src = String((ad && ad.src) || '').trim();
      if (src && !map.has(src)) map.set(src, src);
    });
  } catch { }
  return Array.from(map.values());
}

function scheduleSearchAdPreload() {
  if (!shouldPreloadAdsOnSearchPage()) return;
  const urls = getAdPreloadUrlsForCurrentPage().filter((src) => {
    try { return !state.ads.preloaded.has(src); } catch { return true; }
  });
  if (!urls.length) return;
  if (state.ads.preloadTimer) return;

  const run = () => {
    state.ads.preloadTimer = 0;
    urls.forEach((src, index) => {
      setTimeout(() => {
        try {
          if (state.ads.preloaded.has(src)) return;
          state.ads.preloaded.add(src);
          const img = new Image();
          img.decoding = 'async';
          try { img.fetchPriority = 'low'; } catch { }
          img.src = src;
        } catch { }
      }, index * 140);
    });
  };

  state.ads.preloadTimer = setTimeout(run, 120);
}

function createAdElement(placement = 'list') {
  const ad = chooseAdVariant(placement === 'detail' ? 'detail' : 'search');
  if (!ad) return null;
  const slot = document.createElement('div');
  slot.className = placement === 'detail' ? 'media-insert detail-insert' : 'media-insert gallery-insert';
  slot.dataset.insertGroup = ad.groupId;

  const link = document.createElement('a');
  link.className = 'media-insert-link';
  link.href = ad.href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.title = ad.name;

  const img = document.createElement('img');
  img.className = 'media-insert-image';
  img.loading = 'eager';
  img.fetchPriority = 'high';
  img.decoding = 'async';
  img.alt = ad.name;
  img.src = ad.src;
  if (ad.width) {
    img.style.width = `${ad.width}px`;
  }
  if (ad.width && ad.height) {
    img.style.aspectRatio = `${ad.width} / ${ad.height}`;
  }
  link.appendChild(img);
  slot.appendChild(link);
  return slot;
}

function getGalleryColumnCount() {
  try {
    const cols = getComputedStyle(galleryEl).gridTemplateColumns;
    const count = String(cols || '').split(' ').filter(Boolean).length;
    if (count > 0) return count;
  } catch { }
  return window.innerWidth <= MOBILE_MAX_WIDTH ? 2 : 6;
}

function appendGalleryAd(slotKey) {
  if (!adsEnabled() || !galleryEl || !slotKey) return;
  if (galleryEl.querySelector(`[data-insert-slot="${slotKey}"]`)) return;
  const adEl = createAdElement('list');
  if (!adEl) return;
  adEl.dataset.insertSlot = slotKey;
  galleryEl.appendChild(adEl);
}

function getWorkListPage(w = {}) {
  try {
    const key = normalizeWorkId(w.id);
    const page = Number(state.workPages.get(key) || 0);
    if (Number.isFinite(page) && page >= 1) return page;
  } catch { }
  const fallback = Number(state.page || 1);
  return Number.isFinite(fallback) && fallback >= 1 ? fallback : 1;
}

function rememberWorkListPages(items = [], page = 1, opts = {}) {
  try {
    if (opts.reset) state.workPages.clear();
    const p = Math.max(1, Number(page) || 1);
    (Array.isArray(items) ? items : []).forEach((w) => {
      if (!w || w.id == null) return;
      const key = normalizeWorkId(w.id);
      if (!state.workPages.has(key)) state.workPages.set(key, p);
    });
  } catch { }
}

function isMonthlyMode() {
  const mode = (sortModeSel && sortModeSel.value) || (sortModeSel2 && sortModeSel2.value) || 'new';
  return mode === 'monthly';
}

// 提取文件中的页码（_pN），用于排序
function getPageIndex(obj) {
  const s = String((obj && (obj.file_name || obj.image_path)) || '');
  const m = s.match(/_p(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}
const snippet = (s = '', n = 80) => {
  const t = String(s).trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
};
const typeClass = (t = '') => {
  const k = String(t).toLowerCase();
  if (k === 'sd') return 'sd';
  if (k === 'nai') return 'nai';
  if (k === 'nai_x' || k === 'naix' || k === 'nai x') return 'nai-x';
  if (k === 'comfyui') return 'comfyui';
  return '';
};
function normalizeWorkId(id) {
  const n = Number(id);
  return Number.isFinite(n) ? n : String(id || '');
}
function isNaixWork(w = {}) {
  const raw = String((w && (w.AI_type || w.ai_type || w.image_type)) || '').trim().toLowerCase();
  return raw === 'nai_x' || raw === 'naix' || raw === 'nai x';
}
function getWorkFlags(id) {
  return state.workFlags.get(normalizeWorkId(id)) || {};
}
function setWorkFlags(id, patch = {}) {
  const key = normalizeWorkId(id);
  const prev = state.workFlags.get(key) || {};
  const next = { ...prev, ...patch };
  state.workFlags.set(key, next);
  return next;
}
function isSuspectInvalidTagWorkData(workData) {
  try {
    const wtype = String((workData && (workData.work || {}).AI_type) || '').toLowerCase();
    if (wtype !== 'nai' && wtype !== 'nai_x' && wtype !== 'sd' && wtype !== 'comfyui') return false;
    return !!(window.NAIX && typeof window.NAIX.suspectWork === 'function' && window.NAIX.suspectWork(workData));
  } catch {
    return false;
  }
}
function sensitiveContentBlockEnabled() {
  // The switch is intentionally server-configured only; there is no user
  // control for disabling this domain safety filter in the website UI.
  // A stale CDN config without the current policy version must fail closed.
  if (String(CONFIG.sensitive_content_policy_version || '') !== SENSITIVE_CONTENT_POLICY_VERSION) return true;
  return CONFIG.sensitive_content_block_enabled !== false;
}
function sensitiveBrowserLanguageClass() {
  try {
    const list = Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages
      : [navigator.language];
    const raw = String(list.find((value) => String(value || '').trim()) || '').trim().toLowerCase().replace(/_/g, '-');
    if (raw === 'ja' || raw.startsWith('ja-')) return 'ja';
    if (raw === 'ko' || raw.startsWith('ko-')) return 'ko';
    if (raw.startsWith('zh-')) {
      const subtags = raw.split('-').slice(1);
      if (subtags.some((value) => ['hans', 'cn', 'sg', 'my'].includes(value))) return 'zh';
      if (subtags.some((value) => ['hant', 'tw', 'hk', 'mo'].includes(value))) return 'zh_tw';
    }
  } catch { }
  return '';
}
function sensitiveContentRegionAllowed() {
  if (!sensitiveContentBlockEnabled()) return true;
  if (CONFIG.sensitive_content_client_ip_is_ipv6 === true) return false;
  if (CONFIG.sensitive_content_client_ip_available !== true) return false;
  if (CONFIG.sensitive_content_region_whitelist_enabled !== true) return false;
  if (CONFIG.sensitive_content_region_allowed !== true) return false;
  if (CONFIG.sensitive_content_browser_language_allowed !== true) return false;
  if (!['zh', 'zh_tw', 'ja', 'ko'].includes(CURRENT_LANG)) return false;
  const browserClass = sensitiveBrowserLanguageClass();
  if (!['zh', 'zh_tw', 'ja', 'ko'].includes(browserClass)) return false;
  return true;
}
function sensitiveSiteSearchContext() {
  if (state.searchIntent === true) return true;
  // A normal, non-sensitive q= URL is still a search page.  It must be able
  // to reveal a sensitive work whose term is present only in AI metadata;
  // direct q=<sensitive-term> URLs are rejected by initFromQuery before this
  // path can run.
  try {
    const url = new URL(window.location.href);
    const q = String(url.searchParams.get('q') || '').trim();
    const prompt = String(url.searchParams.get('prompt') || '').trim();
    return !!(q || prompt) && !isSensitiveSearchQuery(q, prompt);
  } catch { return false; }
}
function sensitiveSearchCanProceed() {
  return sensitiveContentRegionAllowed()
    && sensitiveSiteSearchContext()
    && !!String(CONFIG.sensitive_search_token || '').trim();
}
function sensitiveDisplayCanProceed() {
  // Display authorization is broader than search intent: a whitelist user
  // must be able to finish hydrating an ordinary cached waterfall row whose
  // sensitive term exists only in AI metadata. Direct sensitive searches and
  // direct /i links still use the stricter search/work-code checks.
  return sensitiveContentRegionAllowed()
    && !!String(CONFIG.sensitive_search_token || '').trim();
}
function sensitiveDisplaySessionActive() {
  return state.sensitiveAccessSession === true
    && Number(state.sensitiveAccessSessionExpiresAt || 0) > Date.now();
}
function defensiveQueryModeEnabled() {
  // Missing/stale config must keep this protection enabled. Only an explicit
  // server value of false disables the mode.
  return CONFIG.defensive_query_mode_enabled !== false;
}
function hasDirectQSearchParameter() {
  try { return new URL(window.location.href).searchParams.has('q'); } catch { return false; }
}
function redirectDirectQueryToHome() {
  state.listGeneration = Number(state.listGeneration || 0) + 1;
  state.q = '';
  state.prompt = '';
  state.searchIntent = false;
  state.page = 1;
  state.items = [];
  state.total = 0;
  state.listReturnSnapshot = null;
  loadingPage = false;
  endReached = false;
  lastPageCount = 0;
  try { state.workPages.clear(); } catch { }
  try { if (infiniteObserver) infiniteObserver.disconnect(); } catch { }
  infiniteObserver = null;
  try { document.getElementById('infiniteSentinel')?.remove(); } catch { }
  try { galleryEl.innerHTML = ''; } catch { }
  try { qInput.value = ''; promptInput.value = ''; } catch { }
  try {
    const homeUrl = new URL(window.location.href);
    homeUrl.pathname = '/';
    homeUrl.searchParams.delete('q');
    homeUrl.searchParams.delete('prompt');
    homeUrl.searchParams.delete('page');
    history.replaceState({ view: 'list' }, '', `${homeUrl.pathname}${homeUrl.search}${homeUrl.hash}`);
  } catch { }
  try { applyHomeSeo(); } catch { }
  try { applyListMode(); } catch { }
  fetchWorks();
}
const SEARCH_INTENT_STORAGE_PREFIX = 'gallerySearchIntentV1:';
const SEARCH_INTENT_TTL_MS = 2 * 60 * 1000;
const SENSITIVE_SEARCH_REFRESH_STORAGE_PREFIX = 'gallerySensitiveSearchRefreshV1:';
const SENSITIVE_SEARCH_REFRESH_HASH_KEY = 'gallery-sensitive-search';
const SENSITIVE_SEARCH_REFRESH_TTL_MS = 3 * 60 * 60 * 1000;
const SEARCH_LINK_HOSTS = new Set(['aitag.win', 'www.aitag.win', 'pixiv.net', 'www.pixiv.net', 'touch.pixiv.net']);
function isGallerySearchLinkHost(host = '') {
  const normalized = String(host || '').toLowerCase();
  if (SEARCH_LINK_HOSTS.has(normalized)) return true;
  try { return normalized === String(window.location.hostname || '').toLowerCase(); } catch { return false; }
}
function parseSearchLink(value = '') {
  const raw = String(value || '').trim();
  if (!raw || /\s/.test(raw)) return null;
  let url;
  try {
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    url = new URL(candidate);
  } catch { return null; }
  const host = String(url.hostname || '').toLowerCase();
  if (!isGallerySearchLinkHost(host)) return null;
  const path = String(url.pathname || '').replace(/\/+$/, '') || '/';
  const isGalleryHost = host === 'aitag.win' || host === 'www.aitag.win'
    || (() => { try { return host === String(window.location.hostname || '').toLowerCase(); } catch { return false; } })();
  const isPixivHost = host === 'pixiv.net' || host === 'www.pixiv.net' || host === 'touch.pixiv.net';
  let kind = '';
  let id = '';
  if (/^\/i\/(\d+)$/.test(path) && isGalleryHost) {
    kind = 'work';
    id = path.match(/^\/i\/(\d+)$/)[1];
  } else if (/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?artworks\/(\d+)$/i.test(path) && isPixivHost) {
    kind = 'work';
    id = path.match(/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?artworks\/(\d+)$/i)[1];
  } else if (/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?users\/(\d+)(?:\/.*)?$/i.test(path) && isPixivHost) {
    kind = 'author';
    id = path.match(/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?users\/(\d+)(?:\/.*)?$/i)[1];
  } else if (path === '/member_illust.php' && isPixivHost
      && /^\d{1,18}$/.test(String(url.searchParams.get('illust_id') || ''))) {
    kind = 'work';
    id = String(url.searchParams.get('illust_id'));
  } else if (path === '/member.php' && isPixivHost
      && /^\d{1,18}$/.test(String(url.searchParams.get('id') || ''))) {
    kind = 'author';
    id = String(url.searchParams.get('id'));
  }
  if (!kind || !id) return null;
  let sensitiveCode = '';
  if (kind === 'work' && isGalleryHost) {
    sensitiveCode = String(url.searchParams.get('sensitive_code') || '').trim();
    if (sensitiveCode.length > 512) sensitiveCode = '';
  }
  return { kind, id, sensitiveCode };
}
function normalizeSearchInputs(q = '', prompt = '') {
  let normalizedQ = String(q || '').trim();
  let normalizedPrompt = String(prompt || '').trim();
  let importedWorkId = '';
  let importedSensitiveCode = '';
  const qLink = parseSearchLink(normalizedQ);
  if (qLink) {
    normalizedQ = qLink.id;
    normalizedPrompt = '';
    if (qLink.kind === 'work') {
      importedWorkId = qLink.id;
      importedSensitiveCode = qLink.sensitiveCode || '';
    }
  }
  const promptLink = !normalizedQ ? parseSearchLink(normalizedPrompt) : null;
  if (promptLink) {
    // Both visible search panels have the same q/prompt pair. If a work or
    // Pixiv user URL is pasted into the prompt field, route it to the general
    // ID search instead of accidentally searching the AI prompt field.
    normalizedQ = promptLink.id;
    normalizedPrompt = '';
    if (promptLink.kind === 'work') {
      importedWorkId = promptLink.id;
      importedSensitiveCode = promptLink.sensitiveCode || '';
    }
  }
  return { q: normalizedQ, prompt: normalizedPrompt, importedWorkId, importedSensitiveCode };
}
function exactWorkSearchId(value = '') {
  const id = String(value || '').trim();
  return /^\d{1,18}$/.test(id) ? id : '';
}
function sensitiveSearchRefreshStorageSet(key, value) {
  try { sessionStorage.setItem(key, value); return true; } catch { }
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}
function sensitiveSearchRefreshStorageGet(key) {
  try {
    const value = sessionStorage.getItem(key);
    if (value) return value;
  } catch { }
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}
function sensitiveSearchRefreshStorageRemove(key) {
  try { sessionStorage.removeItem(key); } catch { }
  try { localStorage.removeItem(key); } catch { }
}
function newSearchIntentNonce() {
  try {
    return (window.crypto && typeof window.crypto.randomUUID === 'function')
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
  } catch { return `${Date.now()}-${Math.random()}`; }
}
function persistSensitiveSearchForRefresh(q = '', prompt = '') {
  const nonce = newSearchIntentNonce();
  const payload = {
    q: String(q || ''),
    prompt: String(prompt || ''),
    expiresAt: Date.now() + SENSITIVE_SEARCH_REFRESH_TTL_MS,
  };
  try {
    if (!sensitiveSearchRefreshStorageSet(
      `${SENSITIVE_SEARCH_REFRESH_STORAGE_PREFIX}${nonce}`,
      JSON.stringify(payload),
    )) return '';
    return nonce;
  } catch { return ''; }
}
function sensitiveSearchRefreshMarkerFromUrl() {
  try {
    const hash = String(window.location.hash || '');
    if (!hash.startsWith('#')) return null;
    const params = new URLSearchParams(hash.slice(1));
    if (!params.has(SENSITIVE_SEARCH_REFRESH_HASH_KEY)) return null;
    const nonce = String(params.get(SENSITIVE_SEARCH_REFRESH_HASH_KEY) || '').trim();
    if (!nonce || nonce.length > 160) return { invalid: true, nonce: '' };
    const raw = sensitiveSearchRefreshStorageGet(
      `${SENSITIVE_SEARCH_REFRESH_STORAGE_PREFIX}${nonce}`,
    );
    if (!raw) return { invalid: true, nonce };
    const payload = JSON.parse(raw);
    const q = String(payload && payload.q || '').trim();
    const prompt = String(payload && payload.prompt || '').trim();
    const expiresAt = Number(payload && payload.expiresAt || 0);
    if ((!q && !prompt) || expiresAt <= Date.now() || !isSensitiveSearchQuery(q, prompt)) {
      return { invalid: true, nonce };
    }
    return { invalid: false, nonce, q, prompt };
  } catch { return { invalid: true, nonce: '' }; }
}
function clearSensitiveSearchRefreshMarker(nonce = '') {
  const value = String(nonce || '').trim();
  if (value) sensitiveSearchRefreshStorageRemove(`${SENSITIVE_SEARCH_REFRESH_STORAGE_PREFIX}${value}`);
  try {
    const url = new URL(window.location.href);
    const params = new URLSearchParams(String(url.hash || '').replace(/^#/, ''));
    if (params.has(SENSITIVE_SEARCH_REFRESH_HASH_KEY)) {
      params.delete(SENSITIVE_SEARCH_REFRESH_HASH_KEY);
      const rest = params.toString();
      url.hash = rest ? `#${rest}` : '';
      history.replaceState(history.state || { view: 'list' }, '', `${url.pathname}${url.search}${url.hash}`);
    }
  } catch { }
}
function makeSearchIntentHref(q = '', prompt = '') {
  let nonce = '';
  try {
    nonce = newSearchIntentNonce();
  } catch { nonce = `${Date.now()}-${Math.random()}`; }
  const payload = { q: String(q || ''), prompt: String(prompt || ''), expiresAt: Date.now() + SEARCH_INTENT_TTL_MS };
  try {
    localStorage.setItem(`${SEARCH_INTENT_STORAGE_PREFIX}${nonce}`, JSON.stringify(payload));
  } catch { return withLangParam('/'); }
  // Keep the original query in the fragment for link inspection/translation
  // tooling, but authorize the intent only through the one-time localStorage
  // record. The server never receives this fragment and therefore cannot
  // mistake it for a direct q= navigation.
  return withLangParam(`/#gallery-search-intent=${encodeURIComponent(nonce)}&q=${encodeURIComponent(String(q || ''))}`);
}
function consumeSearchIntentFromHash() {
  try {
    const hash = String(window.location.hash || '');
    if (!hash.startsWith('#')) return null;
    const params = new URLSearchParams(hash.slice(1));
    if (params.get('gallery-search-intent') == null) return null;
    const nonce = String(params.get('gallery-search-intent') || '');
    if (!nonce || nonce.length > 160) return null;
    const key = `${SEARCH_INTENT_STORAGE_PREFIX}${nonce}`;
    const raw = localStorage.getItem(key) || '';
    localStorage.removeItem(key);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (!payload || Number(payload.expiresAt || 0) < Date.now()) return null;
    const q = String(payload.q || '');
    const prompt = String(payload.prompt || '');
    return (q || prompt) ? { q, prompt } : null;
  } catch { return null; }
}
function openSearchIntentInNewWindow(q = '', prompt = '') {
  const query = String(q || '');
  const promptText = String(prompt || '');
  const intentHref = makeSearchIntentHref(query, promptText);
  const popup = window.open(intentHref, '_blank');
  if (!popup) return false;
  // The fragment path is the primary channel because it also works for a
  // browser context-menu "open in new window" action. Keep postMessage only
  // as a storage-disabled fallback; otherwise it would submit twice.
  if (intentHref.includes('#gallery-search-intent=')) return true;
  let nonce = '';
  try {
    nonce = (window.crypto && typeof window.crypto.randomUUID === 'function')
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
  } catch { nonce = `${Date.now()}-${Math.random()}`; }
  const message = {
    type: 'gallery-search-intent',
    nonce,
    q: query,
    prompt: promptText,
  };
  let attempts = 0;
  const send = () => {
    attempts += 1;
    try { popup.postMessage(message, window.location.origin); } catch { }
    if (attempts >= 50) clearInterval(timer);
  };
  const timer = setInterval(send, 100);
  send();
  return true;
}
const handledSearchWindowIntents = new Set();
window.addEventListener('message', (event) => {
  try {
    if (event.origin !== window.location.origin) return;
    const data = event.data || {};
    if (data.type !== 'gallery-search-intent') return;
    const nonce = String(data.nonce || '');
    if (!nonce || handledSearchWindowIntents.has(nonce)) return;
    handledSearchWindowIntents.add(nonce);
    const q = String(data.q || '');
    const prompt = String(data.prompt || '');
    if (!q && !prompt) return;
    qInput.value = q;
    promptInput.value = prompt;
    triggerSearch();
  } catch { }
});
function sensitiveContentTerms() {
  const fallback = SENSITIVE_CONTENT_FALLBACK_TERMS.slice();
  try {
    // A stale CDN/local config must not temporarily drop newly added terms.
    if (String(CONFIG.sensitive_content_policy_version || '') !== SENSITIVE_CONTENT_POLICY_VERSION) {
      return fallback;
    }
    if (Array.isArray(CONFIG.sensitive_content_terms) && CONFIG.sensitive_content_terms.length) {
      if (typeof SENSITIVE_FILTER.termsFrom === 'function') {
        return SENSITIVE_FILTER.termsFrom(CONFIG.sensitive_content_terms);
      }
      return CONFIG.sensitive_content_terms.slice();
    }
  } catch { return fallback; }
  return fallback;
}
function sensitiveFallbackMatches(value, terms) {
  const normalize = (candidate) => String(candidate || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, '');
  const rawHaystack = String(value || '').normalize('NFKC').toLocaleLowerCase();
  const haystack = normalize(value);
  if (!haystack) return false;
  return terms.some((rawTerm) => {
    const term = normalize(rawTerm);
    if (!term) return false;
    if (/^[a-z0-9]+$/.test(term)) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const spaced = Array.from(escaped).join('\\s*');
      if (new RegExp(`(?:^|[^a-z0-9])${spaced}(?![a-z0-9])`).test(rawHaystack)) return true;
      if (new RegExp(`(?:^|[^a-z0-9])${escaped}(?![a-z0-9])`).test(haystack)) return true;
      if (term === 'pedophil' && /(?:^|[^a-z0-9])pedophil(?:ia|e|ic)(?![a-z0-9])/.test(rawHaystack)) return true;
      return term === 'pedophil' && /(?:^|[^a-z0-9])pedophil(?:ia|e|ic)(?![a-z0-9])/.test(haystack);
    }
    return haystack.includes(term);
  });
}
function sensitiveFallbackPositiveTexts(raw) {
  const result = [];
  const add = (value) => {
    if (Array.isArray(value)) {
      value.forEach(add);
    } else if (typeof value === 'string' && value.trim()) {
      result.push(value.trim());
    }
  };
  const parse = (value) => {
    if (value && typeof value === 'object') return value;
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch { return null; }
  };
  const parsed = parse(raw);
  if (!parsed) {
    if (typeof raw === 'string') add(raw.split(/\bnegative\s+prompt\s*:/i)[0]);
    return result;
  }
  // Read only documented positive prompt fields. Never scan serialized JSON:
  // metadata keys such as "ai_json" contain the sensitive token "js".
  add(parsed.Description);
  add(parsed.positive_prompt);
  add(parsed.positive);
  add(parsed.pos);
  if (typeof parsed.prompt === 'string') add(parsed.prompt);
  if (typeof parsed.parameters === 'string') {
    add(parsed.parameters.split(/\bnegative\s+prompt\s*:/i)[0]);
  }
  const comment = parsed.Comment;
  if (comment && typeof comment === 'object') {
    add(comment.prompt);
    const v4 = comment.v4_prompt;
    const caption = v4 && typeof v4 === 'object' ? v4.caption : null;
    if (caption && typeof caption === 'object') {
      add(caption.base_caption);
      (Array.isArray(caption.char_captions) ? caption.char_captions : []).forEach((entry) => {
        add(entry && (entry.char_caption || entry.caption || entry.prompt));
      });
    }
  }
  return result;
}
function sensitiveFallbackStripArtistCredits(value) {
  return String(value == null ? '' : value)
    .replace(/(^|[\n,])\s*artist\s*:\s*[^\n,]+/gi, '$1')
    .replace(/\b[^\s,]+\s*\(\s*artist\s*\)/gi, '');
}
function isSensitiveSearchQuery(q, prompt) {
  if (!sensitiveContentBlockEnabled()) return false;
  try {
    if (typeof SENSITIVE_FILTER.queryHasSensitive === 'function') {
      if (SENSITIVE_FILTER.queryHasSensitive(q, prompt, sensitiveContentTerms())) return true;
    }
    const terms = sensitiveContentTerms();
    return [q, prompt].some((value) => sensitiveFallbackMatches(value, terms));
  } catch { }
  return false;
}
function isSensitiveWorkData(workData) {
  if (!sensitiveContentBlockEnabled()) return false;
  try {
    if (typeof SENSITIVE_FILTER.workDataHasSensitive === 'function') {
      if (SENSITIVE_FILTER.workDataHasSensitive(workData, sensitiveContentTerms())) return true;
    }
    // Fail closed if the optional filter asset was unavailable: at minimum
    // hide tagged works and plain positive-prompt payloads before any image
    // is attached to the page.
    const work = workData && workData.work && typeof workData.work === 'object' ? workData.work : (workData || {});
    const normalize = (value) => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, '');
    const terms = sensitiveContentTerms().map(normalize).filter(Boolean);
    const matches = (value) => sensitiveFallbackMatches(value, terms);
    if (normalizeTags(work.tags).some(matches)) return true;
    for (const image of (workData && workData.images) || []) {
      const raw = image && image.ai_json;
      const promptText = image && image.prompt_text;
      if (typeof promptText === 'string'
          && matches(sensitiveFallbackStripArtistCredits(promptText.split(/\bnegative\s+prompt\s*:/i)[0]))) return true;
      if (sensitiveFallbackPositiveTexts(raw).some((text) => matches(sensitiveFallbackStripArtistCredits(text)))) return true;
    }
  } catch { }
  return false;
}
function workHasSensitiveTagData(work = {}) {
  if (!sensitiveContentBlockEnabled()) return false;
  try {
    if (typeof SENSITIVE_FILTER.workTagsHaveSensitive === 'function') {
      return !!SENSITIVE_FILTER.workTagsHaveSensitive(work, sensitiveContentTerms());
    }
    return normalizeTags(work && work.tags).some((tag) => sensitiveFallbackMatches(tag, sensitiveContentTerms()));
  } catch { return false; }
}
function rememberWorkFlagsFromDetail(workData) {
  const work = workData && workData.work ? workData.work : null;
  if (!work || work.id == null) return false;
  const key = normalizeWorkId(work.id);
  const prev = getWorkFlags(key);
  const nextSuspect = isSuspectInvalidTagWorkData(workData);
  const nextNaix = isNaixWork(work);
  const nextSensitive = isSensitiveWorkData(workData);
  const nextR18 = workHasR18Tag(work);
  if (prev.suspectInvalidTags === nextSuspect && prev.naixType === nextNaix
      && prev.sensitiveContent === nextSensitive && prev.r18Content === nextR18) return false;
  setWorkFlags(key, {
    suspectInvalidTags: nextSuspect,
    naixType: nextNaix,
    sensitiveContent: nextSensitive,
    r18Content: nextR18,
  });
  return true;
}
function rememberWorkAccessCode(work = {}) {
  try {
    const id = work && work.id;
    const code = String(work && work.sensitive_access_code || '').trim();
    if (id != null && code) setWorkFlags(id, { sensitiveAccessCode: code });
  } catch { }
}
function updateSensitiveWorkLinks(workId) {
  try {
    const code = sensitiveAccessCodeForWork(workId);
    if (!code) return;
    document.querySelectorAll('.card img[data-work-id]').forEach((img) => {
      if (String(img.dataset.workId || '') !== String(workId)) return;
      const card = img.closest('.card');
      if (!card) return;
      const href = withLangParam(workHrefWithSensitiveCode({ id: workId, sensitive_access_code: code }));
      card.querySelectorAll('a.card-link, .meta a.meta-link:not(.meta-author-link)').forEach((link) => { link.href = href; });
    });
  } catch { }
}
const sensitiveAccessCodeRequests = new Map();
let sensitiveAccessSessionRequest = null;
let sensitiveAccessSessionStatusRequest = null;
let sensitiveAccessSessionLastCheckedAt = 0;
let sensitiveAccessSessionContextKey = '';
let sensitiveAccessSessionEpoch = 0;
// The display cookie lasts three hours. Do not make every hover/click pay for
// a status request; only re-check while it is close to expiry, with a cooldown
// to collapse concurrent waterfall/detail calls.
const SENSITIVE_SESSION_REVALIDATE_THRESHOLD_MS = 10 * 60 * 1000;
const SENSITIVE_SESSION_REVALIDATE_COOLDOWN_MS = 5 * 60 * 1000;
const SENSITIVE_SESSION_REQUEST_TIMEOUT_MS = 2000;
function sensitiveAccessContextKey() {
  return [
    CONFIG.sensitive_content_region_allowed === true ? '1' : '0',
    CONFIG.sensitive_content_country_allowed === true ? '1' : '0',
    CONFIG.sensitive_content_browser_language_allowed === true ? '1' : '0',
    CONFIG.sensitive_content_client_ip_available === true ? '1' : '0',
    CONFIG.sensitive_content_client_ip_is_ipv6 === true ? '6' : '4',
    sensitiveBrowserLanguageClass(), CURRENT_LANG,
  ].join('|');
}
function applyR18AutoDefault() {
  if (!readR18Preference()) state.showR18 = sensitiveContentRegionAllowed();
  syncR18Toggle();
}
function invalidateSensitiveAccessSession() {
  sensitiveAccessSessionEpoch += 1;
  state.sensitiveAccessSession = false;
  state.sensitiveAccessSessionExpiresAt = 0;
  sensitiveAccessSessionContextKey = '';
  // Work codes carry the issuing IP/country/language. Never keep a code after
  // the browser context changes or the HttpOnly session is rejected.
  try {
    state.workFlags.forEach((flags) => {
      if (flags && Object.prototype.hasOwnProperty.call(flags, 'sensitiveAccessCode')) {
        delete flags.sensitiveAccessCode;
      }
    });
    (state.items || []).forEach((work) => {
      if (work && Object.prototype.hasOwnProperty.call(work, 'sensitive_access_code')) {
        delete work.sensitive_access_code;
      }
    });
  } catch { }
  // Let a new context start a fresh exchange immediately. In-flight old
  // promises are ignored by the epoch check in ensureSensitiveWorkAccessCode.
  try { sensitiveAccessCodeRequests.clear(); } catch { }
  try { state.searchWorkAccessCodes.clear(); } catch { state.searchWorkAccessCodes = new Map(); }
  applyR18AutoDefault();
}
async function refreshSensitiveAccessContext() {
  try {
    const res = await fetch(apiUrl(`/api/config?v=${encodeURIComponent(CONFIG_REQUEST_VERSION)}`), {
      credentials: 'same-origin', cache: 'no-store',
    });
    if (!res.ok) return false;
    const data = await res.json();
    const keys = [
      'defensive_query_mode_enabled',
      'sensitive_content_block_enabled', 'sensitive_content_policy_version',
      'sensitive_content_terms', 'sensitive_content_region_whitelist_enabled',
      'sensitive_content_access_bind_ip_enabled', 'sensitive_content_region_allowed',
      'sensitive_content_browser_language', 'sensitive_content_browser_language_allowed',
      'sensitive_content_country_allowed', 'sensitive_content_client_ip_available',
      'sensitive_content_client_ip_is_ipv6', 'sensitive_search_token',
    ];
    keys.forEach((key) => { if (Object.prototype.hasOwnProperty.call(data, key)) CONFIG[key] = data[key]; });
    applyR18AutoDefault();
    return true;
  } catch { return false; }
}
async function checkSensitiveAccessSession() {
  if (!sensitiveAccessSessionStatusRequest) {
    sensitiveAccessSessionStatusRequest = (async () => {
      let timeout = 0;
      try {
        const controller = new AbortController();
        timeout = setTimeout(() => controller.abort(), SENSITIVE_SESSION_REQUEST_TIMEOUT_MS);
        const res = await fetch(apiUrl('/api/sensitive_access_session'), {
          credentials: 'same-origin', cache: 'no-store',
          signal: controller.signal,
        });
        let data = {};
        try { data = await res.json(); } catch { data = {}; }
        return {
          ok: res.ok && data && data.authorized === true,
          expiresIn: Math.max(0, Number(data && data.expires_in || 0)),
        };
      } catch { return false; }
      finally { if (timeout) clearTimeout(timeout); }
    })();
  }
  try { return await sensitiveAccessSessionStatusRequest; }
  finally { sensitiveAccessSessionStatusRequest = null; }
}
async function restoreSensitiveDisplaySessionFromCookie() {
  // A valid server-issued cookie is enough to keep cached metadata cards
  // visible while the client config is refreshed. Manual English UI is still
  // a hard deny even if a cookie from an earlier Chinese UI session remains.
  if (!['zh', 'zh_tw', 'ja', 'ko'].includes(CURRENT_LANG)) return false;
  const status = await checkSensitiveAccessSession();
  if (!status || status.ok !== true || !(status.expiresIn > 0)) return false;
  state.sensitiveAccessSession = true;
  state.sensitiveAccessSessionExpiresAt = Date.now() + status.expiresIn * 1000;
  sensitiveAccessSessionContextKey = sensitiveAccessContextKey();
  sensitiveAccessSessionLastCheckedAt = Date.now();
  return true;
}
async function ensureSensitiveAccessSession(options = {}) {
  const displayIntent = options && typeof options === 'object'
    && (options.display === true || options.intent === 'display');
  let allowed = displayIntent ? sensitiveDisplayCanProceed() : sensitiveSearchCanProceed();
  // The one-minute local configuration cache can lag behind the HttpOnly
  // session (for example after a CDN response or an IP/language refresh).
  // Refresh the request-bound policy before discarding an otherwise valid
  // session. This is deliberately limited to an already active session so
  // denied users do not create a config-fetch loop.
  if (!allowed && sensitiveDisplaySessionActive()) {
    await refreshSensitiveAccessContext();
    allowed = displayIntent ? sensitiveDisplayCanProceed() : sensitiveSearchCanProceed();
  }
  if (!allowed) {
    invalidateSensitiveAccessSession();
    return false;
  }
  const now = Date.now();
  const contextKey = sensitiveAccessContextKey();
  if (state.sensitiveAccessSession && state.sensitiveAccessSessionExpiresAt > now
      && sensitiveAccessSessionContextKey === contextKey) {
    const remaining = state.sensitiveAccessSessionExpiresAt - now;
    // A valid session is the common path. Even callers passing
    // forceRevalidate (list/detail boundaries) do not probe the server until
    // the cookie is close to expiry.
    if (remaining > SENSITIVE_SESSION_REVALIDATE_THRESHOLD_MS
        || now - sensitiveAccessSessionLastCheckedAt < SENSITIVE_SESSION_REVALIDATE_COOLDOWN_MS) {
      return true;
    }
    const status = await checkSensitiveAccessSession();
    if (status && status.ok) {
      if (status.expiresIn > 0) {
        state.sensitiveAccessSessionExpiresAt = Date.now() + status.expiresIn * 1000;
      }
      sensitiveAccessSessionLastCheckedAt = Date.now();
      return true;
    }
    invalidateSensitiveAccessSession();
    await refreshSensitiveAccessContext();
    if (!(displayIntent ? sensitiveDisplayCanProceed() : sensitiveSearchCanProceed())) return false;
  } else if (state.sensitiveAccessSession) {
    invalidateSensitiveAccessSession();
    // The browser language can change while the SPA remains open. Refresh
    // the token/context instead of retrying with a token signed for the old
    // language or country.
    await refreshSensitiveAccessContext();
  }
  if (!(displayIntent ? sensitiveDisplayCanProceed() : sensitiveSearchCanProceed())) return false;
  if (!sensitiveAccessSessionRequest) {
    sensitiveAccessSessionRequest = (async () => {
      let timeout = 0;
      try {
        const controller = new AbortController();
        timeout = setTimeout(() => controller.abort(), SENSITIVE_SESSION_REQUEST_TIMEOUT_MS);
        const res = await fetch(apiUrl('/api/sensitive_access_session'), {
          method: 'POST',
          credentials: 'same-origin',
          signal: controller.signal,
          headers: {
            'X-Gallery-Search-Intent': displayIntent ? 'display' : 'site-search',
            'X-Gallery-Sensitive-Search-Token': String(CONFIG.sensitive_search_token || ''),
          },
        });
        if (!res.ok) return false;
        const data = await res.json();
        const expiresIn = Math.max(0, Number(data && data.expires_in || 0));
        if (data && data.authorized === true && expiresIn > 0) {
          state.sensitiveAccessSessionExpiresAt = Date.now() + expiresIn * 1000;
          return true;
        }
        return false;
      } catch { return false; }
      finally { if (timeout) clearTimeout(timeout); }
    })();
  }
  try {
    const ok = await sensitiveAccessSessionRequest;
    if (ok) {
      state.sensitiveAccessSession = true;
      sensitiveAccessSessionContextKey = sensitiveAccessContextKey();
      sensitiveAccessSessionLastCheckedAt = Date.now();
    }
    return !!ok;
  } finally {
    sensitiveAccessSessionRequest = null;
  }
}

async function ensureSensitiveSessionForIntent(searchIntent = false, options = {}) {
  let allowed = searchIntent ? sensitiveSearchCanProceed() : sensitiveDisplayCanProceed();
  if (!allowed && !searchIntent && sensitiveDisplaySessionActive()) allowed = true;
  if (!allowed && sensitiveDisplaySessionActive()) {
    await refreshSensitiveAccessContext();
    allowed = searchIntent ? sensitiveSearchCanProceed() : sensitiveDisplayCanProceed();
  }
  if (!allowed) {
    invalidateSensitiveAccessSession();
    return false;
  }
  const expired = !state.sensitiveAccessSession
    || !Number(state.sensitiveAccessSessionExpiresAt || 0)
    || Date.now() >= Number(state.sensitiveAccessSessionExpiresAt || 0);
  return ensureSensitiveAccessSession({
    // Boundary callers may request revalidation, but the session helper
    // suppresses network probes until the cookie is near expiry.
    forceRevalidate: options && options.forceRevalidate === true ? true : expired,
    display: !searchIntent,
  });
}
async function requestSensitiveWorkAccessCodes(workIds, intent = 'site-search') {
  const displayIntent = String(intent || '').trim().toLowerCase() === 'display';
  if (!(displayIntent ? sensitiveDisplayCanProceed() : sensitiveSearchCanProceed())
      || !Array.isArray(workIds) || !workIds.length) return {};
  const ids = [];
  const seen = new Set();
  workIds.forEach((rawId) => {
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  });
  if (!ids.length) return {};
  try {
    const res = await fetch(apiUrl('/api/sensitive_work_access_codes'), {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'X-Gallery-Search-Intent': displayIntent ? 'display' : 'site-search',
        'X-Gallery-Sensitive-Search-Token': String(CONFIG.sensitive_search_token || ''),
      },
      body: JSON.stringify({ work_ids: ids }),
    });
    if (!res.ok) return {};
    const data = await res.json();
    return data && data.codes && typeof data.codes === 'object' ? data.codes : {};
  } catch { return {}; }
}
async function ensureSensitiveWorkAccessCode(work = {}, expectedGeneration = null, options = {}) {
  const sessionEpoch = sensitiveAccessSessionEpoch;
  const id = Number(work && work.id);
  const displayIntent = options && typeof options === 'object'
    && (options.display === true || options.intent === 'display');
  if (!Number.isSafeInteger(id) || id <= 0
      || !(displayIntent ? sensitiveDisplayCanProceed() : sensitiveSearchCanProceed())) return '';
  const existing = sensitiveAccessCodeForWork(id);
  if (existing) return existing;
  const key = `${id}:${displayIntent ? 'display' : 'site-search'}`;
  const codeKey = String(id);
  let pending = sensitiveAccessCodeRequests.get(key);
  if (!pending) {
    pending = requestSensitiveWorkAccessCodes([id], displayIntent ? 'display' : 'site-search');
    sensitiveAccessCodeRequests.set(key, pending);
  }
  try {
    const codes = await pending;
    const code = String(codes && (codes[codeKey] || codes[id]) || '').trim();
    if (code && sessionEpoch === sensitiveAccessSessionEpoch && (expectedGeneration == null
        || expectedGeneration === Number(state.listGeneration || 0))) {
      work.sensitive_access_code = code;
      rememberWorkAccessCode(work);
      try {
        const item = (state.items || []).find((candidate) => String(candidate && candidate.id) === codeKey);
        if (item) item.sensitive_access_code = code;
      } catch { }
      updateSensitiveWorkLinks(id);
    }
    return sessionEpoch === sensitiveAccessSessionEpoch ? code : '';
  } finally {
    if (sensitiveAccessCodeRequests.get(key) === pending) sensitiveAccessCodeRequests.delete(key);
  }
}
async function ensureSensitiveWorkAccessCodeWithRetry(work = {}, expectedGeneration = null, options = {}) {
  const intent = String(options && options.intent || '').trim().toLowerCase() === 'site-search'
    ? 'site-search' : 'display';
  const searchIntent = intent === 'site-search';
  const sessionEpoch = sensitiveAccessSessionEpoch;
  let code = sensitiveAccessCodeForWork(work && work.id);
  // A transient origin/edge failure must not turn a cached sensitive card into
  // a permanent disappearance. Revalidate the HttpOnly session once, then
  // retry the uncached per-work exchange before giving up.
  for (let attempt = 0; !code && attempt < 2; attempt += 1) {
    const sessionReady = await ensureSensitiveSessionForIntent(searchIntent, {
      forceRevalidate: attempt > 0,
    });
    if (!sessionReady) continue;
    code = await ensureSensitiveWorkAccessCode(work, expectedGeneration, { intent });
    if (sessionEpoch !== sensitiveAccessSessionEpoch) {
      code = '';
      break;
    }
  }
  return code || '';
}
async function hydrateSensitiveFixedRankAccessCodes(items) {
  if (!Array.isArray(items) || !items.length) return;
  if (!sensitiveSearchCanProceed()) return;
  // Do not mint codes for ordinary works. The fixed-rank response is shared
  // by Cloudflare, so only rows whose cached tags already identify them as
  // sensitive need the uncached per-IP code exchange. Works that are only
  // sensitive in positive AI metadata remain fail-closed until detail data
  // confirms them.
  const sensitiveItems = items.filter((work) => {
    try {
      if (typeof SENSITIVE_FILTER.workTagsHaveSensitive === 'function') {
        return !!SENSITIVE_FILTER.workTagsHaveSensitive(work, sensitiveContentTerms());
      }
      return normalizeTags(work && work.tags).some((tag) => sensitiveFallbackMatches(tag, sensitiveContentTerms()));
    } catch { return false; }
  });
  if (!sensitiveItems.length) return;
  const codes = await requestSensitiveWorkAccessCodes(sensitiveItems.map((work) => work && work.id));
  items.forEach((work) => {
    const code = String(codes[String(work && work.id)] || '').trim();
    if (code) {
      work.sensitive_access_code = code;
      rememberWorkAccessCode(work);
    }
  });
}
function sensitiveAccessCodeForWork(workId) {
  const flags = getWorkFlags(workId);
  if (flags.sensitiveAccessCode) return String(flags.sensitiveAccessCode);
  try {
    const item = (state.items || []).find((work) => String(work && work.id) === String(workId));
    const code = String(item && item.sensitive_access_code || '').trim();
    if (code) {
      rememberWorkAccessCode(item);
      return code;
    }
  } catch { }
  try {
    const current = new URL(window.location.href);
    const match = String(current.pathname || '').match(/^\/i\/(\d+)$/);
    if (match && String(match[1]) === String(workId)) {
      return String(current.searchParams.get('sensitive_code') || '').trim();
    }
  } catch { return ''; }
  return '';
}
function workHrefWithSensitiveCode(work = {}) {
  const base = `/i/${encodeURIComponent(String(work.id))}`;
  const code = String(work.sensitive_access_code || sensitiveAccessCodeForWork(work.id) || '').trim();
  return code ? `${base}?sensitive_code=${encodeURIComponent(code)}` : base;
}

async function prepareWorkOpenUrl(workId, fallbackWork = {}) {
  const id = normalizeWorkId(workId);
  let data = state.cache.works.get(id) || null;
  // Revalidate the regional session before reading cached detail metadata. A
  // page can remain open past the three-hour cookie TTL or change IP while a
  // user is scrolling, so an old in-memory session must never authorize this
  // navigation.
  if (sensitiveContentBlockEnabled()) {
    await ensureSensitiveSessionForIntent(false, { forceRevalidate: true });
  }
  try {
    if (!data) data = await fetchWork(id);
  } catch {
    data = null;
  }
  const detailWork = (data && data.work) || fallbackWork || { id };
  const sensitive = data ? isSensitiveWorkData(data) : false;
  if (sensitive) {
    const taggedSensitive = workHasSensitiveTagData(detailWork);
    const intent = sensitiveSearchCanProceed() ? 'site-search' : 'display';
    if (taggedSensitive && (sensitiveDisplayCanProceed() || sensitiveDisplaySessionActive())) {
      await ensureSensitiveWorkAccessCodeWithRetry(detailWork, null, { intent });
    }
    const code = sensitiveAccessCodeForWork(id);
    if (!code && !(sensitiveDisplaySessionActive() && !taggedSensitive)) return '';
    // Metadata-only sensitive works intentionally have no per-work code when
    // the allowlist display cookie is the authorization path. Preserve the
    // plain work object in that case so its URL stays cache-friendly.
    if (code) detailWork.sensitive_access_code = code;
  }
  return withLangParam(workHrefWithSensitiveCode({ ...detailWork, id }));
}

function openPreparedWorkInNewWindow(workId, fallbackWork = {}) {
  // Open a blank tab synchronously inside the user gesture. The authorization
  // exchange is asynchronous; navigating this already-open tab avoids popup
  // blockers while still ensuring sensitive links receive an IP-bound code.
  // Do not pass ``noopener`` to window.open here: Chromium returns null for
  // that form even though it creates a tab, leaving us unable to navigate the
  // tab after the async code exchange. Detach the opener immediately after
  // obtaining the WindowProxy instead.
  const popup = window.open('about:blank', '_blank');
  if (!popup) return false;
  try { popup.opener = null; } catch { }
  prepareWorkOpenUrl(workId, fallbackWork).then((url) => {
    try {
      popup.location.replace(url || withLangParam('/'));
    } catch { }
  }).catch(() => {
    try { popup.location.replace(withLangParam('/')); } catch { }
  });
  return true;
}
function sensitiveWorkAccessReady(workId) {
  if (state.sensitiveAccessSession && state.sensitiveAccessSessionExpiresAt > 0
      && Date.now() >= state.sensitiveAccessSessionExpiresAt) {
    state.sensitiveAccessSession = false;
    state.sensitiveAccessSessionExpiresAt = 0;
  }
  // A valid regional display cookie is the fallback for metadata-only works;
  // a per-work code is the alternative authorization. Region/token eligibility
  // alone is not an authorization because the cookie exchange may have failed
  // or the cookie may have expired between waterfall pages.
  const code = sensitiveAccessCodeForWork(workId);
  if (code) return true;
  // Once the server has validated the HttpOnly cookie, it remains the source
  // of truth even if a CDN serves an older /api/config response. IP, country,
  // browser language, host, expiry, and manual English-UI changes are checked
  // when the session is restored/revalidated; the stale config must not make a
  // valid metadata-only cookie look unauthorized.
  return sensitiveDisplaySessionActive();
}
function isFrontendHiddenWork(w = {}) {
  if (isBlockedWork(w)) return true;
  const flags = getWorkFlags(w.id);
  if ((flags.r18Content || workHasR18Tag(w)) && !state.showR18) return true;
  if (sensitiveContentBlockEnabled()) {
    if (flags.sensitiveContent) {
      // A sensitive row remains visible only when its per-work code or the
      // current IP/region-bound display cookie is valid.
      if (!sensitiveWorkAccessReady(w.id)) return true;
    }
    try {
      let taggedSensitive = false;
      if (typeof SENSITIVE_FILTER.workTagsHaveSensitive === 'function') {
        taggedSensitive = !!SENSITIVE_FILTER.workTagsHaveSensitive(w, sensitiveContentTerms());
      }
      // Keep list rendering fail-closed if the optional filter asset is stale
      // or unavailable; detail inspection remains a second layer for prompts.
      taggedSensitive = taggedSensitive || normalizeTags(w.tags).some((tag) => sensitiveFallbackMatches(tag, sensitiveContentTerms()));
      if (taggedSensitive && !sensitiveWorkAccessReady(w.id)) return true;
    } catch { }
  }
  const isNaix = isNaixWork(w) || flags.naixType;
  const isSuspect = !!flags.suspectInvalidTags;
  if (isNaix || isSuspect) {
    const allowedByNaix = isNaix && state.showNaixInvalidTags;
    const allowedBySuspect = isSuspect && state.showSuspectInvalidTags;
    return !(allowedByNaix || allowedBySuspect);
  }
  return false;
}
function visibleWorks(items = state.items) {
  return (Array.isArray(items) ? items : []).filter((w) => !isFrontendHiddenWork(w));
}
function updateNoResultVisibility() {
  try {
    if (noResultEl) noResultEl.classList.toggle('visible', visibleWorks().length === 0);
  } catch { }
}
function removeInfiniteSentinel() {
  if (infiniteObserver) {
    try { infiniteObserver.disconnect(); } catch { }
    infiniteObserver = null;
  }
  try {
    const sentinel = document.getElementById('infiniteSentinel');
    if (sentinel) sentinel.remove();
  } catch { }
}
function setupInfiniteScrollIfVisible() {
  if (visibleWorks().length > 0) {
    setupInfiniteScroll();
  } else {
    removeInfiniteSentinel();
  }
}
function preserveWindowScrollAfterRender(fn) {
  const y = window.scrollY || window.pageYOffset || 0;
  try {
    fn();
  } finally {
    const restore = () => {
      try {
        window.scrollTo({ top: y, behavior: 'auto' });
      } catch {
        try { window.scrollTo(0, y); } catch { }
      }
    };
    restore();
    try { requestAnimationFrame(restore); } catch { }
    setTimeout(restore, 80);
  }
}

function captureListReturnSnapshot() {
  try {
    let anchor = null;
    const cards = galleryEl ? galleryEl.querySelectorAll('.card img[data-work-id]') : [];
    for (const img of cards) {
      const rect = img.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top >= 0) {
        anchor = {
          workId: String(img.dataset.workId || ''),
          top: Math.round(rect.top),
        };
        break;
      }
    }
    if (!anchor && cards.length) {
      const img = cards[0];
      const rect = img.getBoundingClientRect();
      anchor = { workId: String(img.dataset.workId || ''), top: Math.round(rect.top) };
    }
    return {
      url: `${window.location.pathname || '/'}${window.location.search || ''}${window.location.hash || ''}`,
      scrollY: Math.max(0, Math.round(window.scrollY || window.pageYOffset || 0)),
      page: Math.max(1, Number(state.page) || 1),
      listMode: state.listMode,
      inSiteSearch: !!(window.history && history.state && history.state.inSiteSearch === true),
      anchor,
    };
  } catch {
    return { url: '/', scrollY: 0, page: 1, listMode: state.listMode, inSiteSearch: false, anchor: null };
  }
}

function restoreListAfterDetail(snapshot = null) {
  const saved = snapshot || state.listReturnSnapshot || {};
  const targetUrl = String(saved.url || '/');
  const targetY = Math.max(0, Number(saved.scrollY) || 0);
  const anchor = saved.anchor && String(saved.anchor.workId || '')
    ? { workId: String(saved.anchor.workId), top: Number(saved.anchor.top) || 0 }
    : null;
  const targetPage = Math.max(1, Number(saved.page) || 1);
  saveCurrentDetailScroll();
  state.detailRequestToken = Number(state.detailRequestToken || 0) + 1;
  state.directDetail = false;
  state.page = targetPage;
  if (saved.listMode === 'infinite' || saved.listMode === 'pagination') {
    state.listMode = saved.listMode;
  }
  try {
    if (fcNum) fcNum.textContent = String(state.page);
    if (fcInput) {
      fcInput.value = String(state.page);
      fcInput.max = String(Math.max(state.page, Math.ceil((state.total || 0) / (state.pageSize || 1))));
    }
  } catch { }
  state.detailScroll.currentWorkId = null;
  state.historySearchIntent = false;
  clearDetailScrollRestoreTimers();
  closePreview();
  try { detailView.classList.add('hidden'); } catch { }
  try { applyHomeSeo(); } catch { }
  try {
    history.replaceState({ view: 'list', inSiteSearch: saved.inSiteSearch === true }, '', targetUrl);
  } catch { }
  const restore = () => {
    try { window.scrollTo({ top: targetY, behavior: 'auto' }); }
    catch { try { window.scrollTo(0, targetY); } catch { } }
    if (anchor && galleryEl) {
      try {
        const image = Array.from(galleryEl.querySelectorAll('img[data-work-id]'))
          .find((candidate) => String(candidate.dataset.workId || '') === anchor.workId);
        if (image) {
          const rect = image.getBoundingClientRect();
          const delta = rect.top - anchor.top;
          if (Math.abs(delta) > 1) window.scrollBy(0, delta);
        }
      } catch { }
    }
  };
  restore();
  try { requestAnimationFrame(restore); } catch { }
  setTimeout(restore, 80);
  setTimeout(restore, 280);
  state.listReturnSnapshot = null;
}

function hasEchoCheckpointLoaderSimple(obj) {
  const target = 'ECHOCheckpointLoaderSimple';
  try {
    const stack = [obj];
    const seen = new WeakSet();
    let steps = 0;
    while (stack.length && steps < 8000) {
      const cur = stack.pop();
      steps += 1;
      if (cur == null) continue;
      const t = typeof cur;
      if (t === 'string') {
        if (cur.includes(target)) return true;
        continue;
      }
      if (t !== 'object') continue;
      if (seen.has(cur)) continue;
      seen.add(cur);
      if (cur.class_type === target || cur.class === target || cur.type === target) return true;
      if (Array.isArray(cur)) {
        for (const v of cur) stack.push(v);
      } else {
        for (const v of Object.values(cur)) stack.push(v);
      }
    }
  } catch { }
  return false;
}

function isNonStandardComfyuiWork(workData) {
  try {
    const wtype = String((workData && (workData.work || {}).AI_type) || '').toLowerCase();
    if (wtype !== 'comfyui') return false;
    for (const img of (workData.images || [])) {
      const raw = img ? img.ai_json : null;
      if (!raw) continue;
      if (typeof raw === 'string') {
        if (raw.includes('ECHOCheckpointLoaderSimple')) return true;
        try {
          const obj = JSON.parse(raw);
          if (hasEchoCheckpointLoaderSimple(obj)) return true;
        } catch { }
      } else {
        if (hasEchoCheckpointLoaderSimple(raw)) return true;
      }
    }
  } catch { }
  return false;
}
// 将 ISO8601 字符串格式化为 "YYYY-MM-DD HH:MM:SS"（保留源字符串的日期与时分秒）
function formatDateTime(isoStr = '') {
  const s = String(isoStr || '').trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
  if (m) return `${m[1]} ${m[2]}`;
  // 兜底：若不符合预期，尝试 Date 解析后再拼接本地时间
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  return s.replace('T', ' ').replace(/([+-]?\d{2}:?\d{2}|Z)$/, '');
}
// 仅格式化为日期（YYYY-MM-DD），用于首页卡片的投稿时间
function formatDate(isoStr = '') {
  const s = String(isoStr || '').trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  // 最后兜底：截取前 10 位（若是标准 ISO 字符串）
  return s.slice(0, 10);
}
// 渲染作品简介：保留安全的 <a> 与 <br>，其余标签去除并转义；兼容纯文本换行
function renderCaption(raw = '') {
  const s = String(raw || '');
  const container = document.createElement('div');
  container.innerHTML = s;
  const allowedSchemes = ['http:', 'https:'];
  function walk(node) {
    const ELEMENT_NODE = 1;
    const TEXT_NODE = 3;
    if (!node) return '';
    if (node.nodeType === TEXT_NODE) {
      const t = node.textContent || '';
      return escapeHtml(t).replace(/\r\n|\r|\n/g, '<br>');
    }
    if (node.nodeType !== ELEMENT_NODE) return '';
    const tag = String(node.tagName || '').toLowerCase();
    if (tag === 'br') return '<br>';
    if (tag === 'a') {
      let href = node.getAttribute('href') || '';
      try {
        const u = new URL(href, window.location.origin);
        if (allowedSchemes.includes(u.protocol)) href = u.href; else href = '';
      } catch { href = ''; }
      const inner = Array.from(node.childNodes).map(walk).join('');
      if (!href) return inner;
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${inner || escapeHtml(href)}</a>`;
    }
    if (tag === 'p' || tag === 'div') {
      const inner = Array.from(node.childNodes).map(walk).join('');
      return /<br>\s*$/.test(inner) ? inner : inner + '<br>';
    }
    return Array.from(node.childNodes).map(walk).join('');
  }
  return Array.from(container.childNodes).map(walk).join('');
}
function normalizeTags(raw) {
  if (!raw) return [];
  try {
    const j = JSON.parse(raw);
    if (Array.isArray(j)) return j.map((x) => String(x)).filter(Boolean);
    if (typeof j === 'object' && j) return Object.values(j).map((x) => String(x)).filter(Boolean);
  } catch { }
  let buf = String(raw);
  for (const sep of ['\n', ',', '|', ';', ' ', '、', '，', '。', '\t']) buf = buf.split(sep).join(',');
  return buf.split(',').map((x) => x.trim()).filter(Boolean);
}
function workHasR18Tag(work = {}) {
  return normalizeTags(work && work.tags).some((tag) => {
    const normalized = String(tag || '').trim().toLowerCase();
    return normalized === 'r-18' || normalized === 'r-18g';
  });
}
function normalizeTagTranslations(raw) {
  if (typeof TAG_TRANSLATIONS.normalize === 'function') return TAG_TRANSLATIONS.normalize(raw);
  const result = new Map();
  if (!Array.isArray(raw)) return result;
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const tag = String(item.tag || '').trim();
    const values = item.translations;
    if (!tag || !values || typeof values !== 'object') continue;
    const translations = {};
    for (const locale of ['zh-CN', 'en', 'ko']) {
      const value = String(values[locale] || '').trim();
      if (value) translations[locale] = value;
    }
    if (Object.keys(translations).length) result.set(tag, translations);
  }
  return result;
}

// 黑名单工具
function parseWords(s = '') {
  let buf = String(s);
  for (const sep of ['\n', ',', '|', ';', ' ', '、', '，', '。', '\t']) buf = buf.split(sep).join(',');
  return buf.split(',').map((x) => x.trim()).filter(Boolean);
}
function loadBlacklist() {
  try {
    const raw = localStorage.getItem('gallery_blacklist') || '';
    state.blacklist = parseWords(raw).map((x) => x.toLowerCase());
    blacklistInput.value = raw;
  } catch { }
}
function saveBlacklist() {
  const raw = blacklistInput.value || '';
  localStorage.setItem('gallery_blacklist', raw);
  state.blacklist = parseWords(raw).map((x) => x.toLowerCase());
}

const BLACKLIST_MIGRATE_DONE_PREFIX = 'gallery_blacklist_migrate_done_v2:';
function importBlacklistFromWindowNameIfNeeded() {
  try {
    const marker = 'gallery_migrate_bl_v1:';
    const name = String(window.name || '');
    if (!name.startsWith(marker)) return false;

    let encoded = name.slice(marker.length);
    let decoded = '';
    try { decoded = decodeURIComponent(encoded); } catch { decoded = ''; }
    try { window.name = ''; } catch { }

    if (!decoded.trim()) return false;
    let currentRaw = '';
    try { currentRaw = String(localStorage.getItem('gallery_blacklist') || ''); } catch { currentRaw = ''; }
    if (currentRaw.trim()) return false;

    try { localStorage.setItem('gallery_blacklist', decoded); } catch { }
    try { blacklistInput.value = decoded; } catch { }
    try { state.blacklist = parseWords(decoded).map((x) => x.toLowerCase()); } catch { }
    return true;
  } catch {
    try { window.name = ''; } catch { }
    return false;
  }
}
function importBlacklistFromHashIfNeeded() {
  try {
    let h = String(window.location.hash || '');
    if (!h) return false;
    if (!h.startsWith('#')) return false;
    const rawPart = h.slice(1);
    const parts = rawPart.split('&').filter(Boolean);
    if (!parts.length) return false;
    const kv = {};
    for (const p of parts) {
      const idx = p.indexOf('=');
      if (idx === -1) continue;
      const k = p.slice(0, idx);
      const v = p.slice(idx + 1);
      if (k) kv[k] = v;
    }
    if (!kv.migrate_bl) return false;

    let currentRaw = '';
    try { currentRaw = String(localStorage.getItem('gallery_blacklist') || ''); } catch { currentRaw = ''; }
    if (currentRaw.trim()) {
      const nextParts = parts.filter((p) => !p.startsWith('migrate_bl='));
      const nextHash = nextParts.length ? `#${nextParts.join('&')}` : '';
      history.replaceState(history.state || {}, '', window.location.pathname + window.location.search + nextHash);
      return false;
    }

    let decoded = '';
    try { decoded = decodeURIComponent(String(kv.migrate_bl || '')); } catch { decoded = ''; }
    if (!decoded.trim()) return false;
    try { localStorage.setItem('gallery_blacklist', decoded); } catch { }
    try { blacklistInput.value = decoded; } catch { }
    try { state.blacklist = parseWords(decoded).map((x) => x.toLowerCase()); } catch { }

    const nextParts = parts.filter((p) => !p.startsWith('migrate_bl='));
    const nextHash = nextParts.length ? `#${nextParts.join('&')}` : '';
    history.replaceState(history.state || {}, '', window.location.pathname + window.location.search + nextHash);
    return true;
  } catch {
    return false;
  }
}
function _normalizeOrigin(urlStr) {
  try {
    let s = String(urlStr || '').trim();
    if (!s) return '';
    if (!s.includes('://')) s = `https://${s}`;
    const u = new URL(s);
    return u.origin;
  } catch {
    return '';
  }
}

function oldBlacklistMigrationEnabled() {
  // 旧域名黑名单迁移功能保留，但默认由后端配置关闭。
  return !!CONFIG.old_blacklist_migrate_enabled;
}

function ensureImportOldBlacklistButton(oldOrigin) {
  if (!oldBlacklistMigrationEnabled()) return null;
  try {
    const host = document.getElementById('fcExtraSettings') || fcPanel;
    if (!host) return null;
    try {
      const existing = document.getElementById('importOldBlacklistBtn');
      if (existing && existing !== importOldBlacklistBtn) {
        try { existing.remove(); } catch { }
      }
    } catch { }
    if (importOldBlacklistBtn) {
      try {
        if (importOldBlacklistBtn.parentNode !== host) host.appendChild(importOldBlacklistBtn);
      } catch { }
      return importOldBlacklistBtn;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'importOldBlacklistBtn';
    btn.className = 'btn outline';
    btn.textContent = t('btn_import_blacklist');
    btn.addEventListener('click', async () => {
      try {
        const ok = await migrateBlacklistFromOldDomainViaPopup(oldOrigin);
        if (!importOldBlacklistBtn) return;
        if (ok) {
          importOldBlacklistBtn.textContent = t('import_blacklist_done');
          setTimeout(() => { try { if (importOldBlacklistBtn) importOldBlacklistBtn.remove(); } catch { } importOldBlacklistBtn = null; }, 900);
        } else {
          importOldBlacklistBtn.textContent = t('import_blacklist_failed');
          setTimeout(() => { try { if (importOldBlacklistBtn) importOldBlacklistBtn.textContent = t('btn_import_blacklist'); } catch { } }, 1600);
        }
      } catch { }
    });
    try {
      host.appendChild(btn);
    } catch {
      try { host.appendChild(btn); } catch { }
    }
    importOldBlacklistBtn = btn;
    return btn;
  } catch {
    return null;
  }
}

async function migrateBlacklistFromOldDomainViaPopup(oldOrigin) {
  if (!oldBlacklistMigrationEnabled()) return false;
  let currentRaw = '';
  try { currentRaw = String(localStorage.getItem('gallery_blacklist') || ''); } catch { currentRaw = ''; }
  if (currentRaw.trim()) return false;

  const btn = importOldBlacklistBtn;
  if (btn) {
    try { btn.disabled = true; } catch { }
    try { btn.textContent = t('import_blacklist_starting'); } catch { }
  }

  const url = apiUrl('/api/migrate/blacklist', oldOrigin);
  url.searchParams.set('target_origin', window.location.origin);
  const w = window.open(url.toString(), 'migrate_blacklist', 'popup=yes,width=520,height=520');
  if (!w) {
    if (btn) { try { btn.disabled = false; btn.textContent = t('btn_import_blacklist'); } catch { } }
    try { alert(t('import_blacklist_popup_blocked')); } catch { }
    return false;
  }

  return await new Promise((resolve) => {
    let settled = false;
    let timer = null;

    const cleanup = () => {
      try { window.removeEventListener('message', onMsg); } catch { }
      if (timer) { try { clearTimeout(timer); } catch { } timer = null; }
      try { if (w && !w.closed) w.close(); } catch { }
      if (btn) { try { btn.disabled = false; } catch { } }
    };
    const finalize = (ok) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(!!ok);
    };
    const onMsg = (e) => {
      try {
        if (!e || e.origin !== oldOrigin) return;
        const data = e.data || {};
        if (!data || data.type !== 'gallery_blacklist_migrate_v1') return;
        if (!data.ok) return finalize(false);
        const raw = String(data.raw || '');
        if (!raw.trim()) return finalize(false);
        let currentNow = '';
        try { currentNow = String(localStorage.getItem('gallery_blacklist') || ''); } catch { currentNow = ''; }
        if (currentNow.trim()) return finalize(false);
        try { localStorage.setItem('gallery_blacklist', raw); } catch { }
        try { blacklistInput.value = raw; } catch { }
        try { state.blacklist = parseWords(raw).map((x) => x.toLowerCase()); } catch { }
        finalize(true);
      } catch {
        finalize(false);
      }
    };

    try { window.addEventListener('message', onMsg); } catch { }
    timer = setTimeout(() => finalize(false), 15000);
  });
}

async function migrateBlacklistFromOldDomainIfNeeded() {
  if (!oldBlacklistMigrationEnabled()) return false;
  let currentRaw = '';
  try { currentRaw = String(localStorage.getItem('gallery_blacklist') || ''); } catch { currentRaw = ''; }
  if (currentRaw.trim()) return false;

  const oldOrigin = _normalizeOrigin(CONFIG.old_domain || '');
  if (!oldOrigin) return false;
  if (oldOrigin === window.location.origin) return false;

  const doneKey = `${BLACKLIST_MIGRATE_DONE_PREFIX}${oldOrigin}`;
  try { if (localStorage.getItem(doneKey) === '1') return false; } catch { }

  const okIframe = await new Promise((resolve) => {
    let settled = false;
    let iframe = null;
    let timer = null;

    const cleanup = () => {
      try { window.removeEventListener('message', onMsg); } catch { }
      if (timer) { try { clearTimeout(timer); } catch { } timer = null; }
      if (iframe) { try { iframe.remove(); } catch { } iframe = null; }
    };
    const finalize = (ok) => {
      if (settled) return;
      settled = true;
      if (ok) {
        try { localStorage.setItem(doneKey, '1'); } catch { }
      }
      cleanup();
      resolve(!!ok);
    };
    const onMsg = (e) => {
      try {
        if (!e || e.origin !== oldOrigin) return;
        const data = e.data || {};
        if (!data || data.type !== 'gallery_blacklist_migrate_v1') return;
        if (!data.ok) return finalize(false);
        const raw = String(data.raw || '');
        if (!raw.trim()) return finalize(false);
        let currentNow = '';
        try { currentNow = String(localStorage.getItem('gallery_blacklist') || ''); } catch { currentNow = ''; }
        if (currentNow.trim()) return finalize(false);
        try { localStorage.setItem('gallery_blacklist', raw); } catch { }
        try { blacklistInput.value = raw; } catch { }
        try { state.blacklist = parseWords(raw).map((x) => x.toLowerCase()); } catch { }
        finalize(true);
      } catch {
        finalize(false);
      }
    };

    try { window.addEventListener('message', onMsg); } catch { }
    timer = setTimeout(() => finalize(false), 2500);
    try {
      iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.left = '-9999px';
      iframe.style.top = '-9999px';
      iframe.style.width = '1px';
      iframe.style.height = '1px';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';
      const migrationUrl = apiUrl('/api/migrate/blacklist', oldOrigin);
      migrationUrl.searchParams.set('target_origin', window.location.origin);
      iframe.src = migrationUrl.toString();
      document.body.appendChild(iframe);
    } catch {
      finalize(false);
    }
  });
  if (!okIframe) {
    try { ensureImportOldBlacklistButton(oldOrigin); } catch { }
  } else {
    try { if (importOldBlacklistBtn) { importOldBlacklistBtn.remove(); importOldBlacklistBtn = null; } } catch { }
  }
  return okIframe;
}

function migrateBlacklistFromOldDomainInBackground() {
  if (!oldBlacklistMigrationEnabled()) return;
  try {
    migrateBlacklistFromOldDomainIfNeeded().then((ok) => {
      if (!ok) return;
      // 旧域名黑名单迁移成功后，只刷新前端过滤结果，不阻塞初始作品加载。
      try { refreshCurrentGallery({ preserveScroll: true }); } catch { }
    }).catch(() => { });
  } catch { }
}

		const OPEN_WORK_NEW_WINDOW_KEY = 'open_work_new_window_v1';
	const SHOW_SUSPECT_INVALID_TAGS_KEY = 'gallery_show_suspect_invalid_tags_v1';
	const SHOW_NAIX_INVALID_TAGS_KEY = 'gallery_show_naix_invalid_tags_v1';
	const SHOW_R18_KEY = 'gallery_show_r18_v1';
	const SHOW_CARD_PREVIEW_KEY = 'gallery_show_card_preview_v1';
const CONFIG_REQUEST_VERSION = '260830b';
		const CONFIG_CACHE_JSON_KEY = 'gallery_config_json_v8';
		const CONFIG_CACHE_TS_KEY = 'gallery_config_ts_v8';
function loadOpenWorkInNewWindow() {
  let v = false;
  try { v = localStorage.getItem(OPEN_WORK_NEW_WINDOW_KEY) === '1'; } catch { }
  state.openWorkInNewWindow = v;
  try { if (openWorkNewWindowToggle) openWorkNewWindowToggle.checked = v; } catch { }
}
	function setOpenWorkInNewWindow(v) {
	  state.openWorkInNewWindow = !!v;
	  try { localStorage.setItem(OPEN_WORK_NEW_WINDOW_KEY, state.openWorkInNewWindow ? '1' : '0'); } catch { }
	  try { if (openWorkNewWindowToggle) openWorkNewWindowToggle.checked = state.openWorkInNewWindow; } catch { }
	}
	function syncInvalidTagToggles() {
	  try { if (showSuspectInvalidTagToggle) showSuspectInvalidTagToggle.checked = !!state.showSuspectInvalidTags; } catch { }
	  try { if (showNaixInvalidTagToggle) showNaixInvalidTagToggle.checked = !!state.showNaixInvalidTags; } catch { }
	 }
	function syncR18Toggle() {
	  try { if (showR18Toggle) showR18Toggle.checked = !!state.showR18; } catch { }
	}
	function syncCardPreviewToggle() {
	  try { if (cardPreviewToggle) cardPreviewToggle.checked = state.cardPreviewEnabled !== false; } catch { }
	}
	function loadCardPreviewSetting() {
	  let enabled = true;
	  try {
	    const raw = localStorage.getItem(SHOW_CARD_PREVIEW_KEY);
	    if (raw === '0' || raw === '1') enabled = raw === '1';
	  } catch { }
	  state.cardPreviewEnabled = enabled;
	  syncCardPreviewToggle();
	}
	function setCardPreviewEnabled(value) {
	  state.cardPreviewEnabled = !!value;
	  try { localStorage.setItem(SHOW_CARD_PREVIEW_KEY, state.cardPreviewEnabled ? '1' : '0'); } catch { }
	  syncCardPreviewToggle();
	  if (!state.cardPreviewEnabled) closePreview();
	}
	function loadInvalidTagFilterSettings() {
	  let showSuspect = false;
	  let showNaix = false;
	  try { showSuspect = localStorage.getItem(SHOW_SUSPECT_INVALID_TAGS_KEY) === '1'; } catch { }
	  try { showNaix = localStorage.getItem(SHOW_NAIX_INVALID_TAGS_KEY) === '1'; } catch { }
	  state.showSuspectInvalidTags = showSuspect;
	  state.showNaixInvalidTags = showNaix;
	  syncInvalidTagToggles();
	}
	function readR18Preference() {
	  try {
	    const raw = localStorage.getItem(SHOW_R18_KEY);
	    return raw === '1' || raw === '0' ? raw : '';
	  } catch { return ''; }
	}
	function loadR18DisplaySetting() {
	  const preference = readR18Preference();
	  // No explicit preference means the allowlisted region/language gets the
	  // default-on behavior. All other contexts fail closed by default.
	  state.showR18 = preference ? preference === '1' : sensitiveContentRegionAllowed();
	  syncR18Toggle();
	}
function setShowR18(v) {
  state.showR18 = !!v;
  try { localStorage.setItem(SHOW_R18_KEY, state.showR18 ? '1' : '0'); } catch { }
  syncR18Toggle();
  // R-18 is a server-side list preference for ordinary searches. Reusing the
  // already loaded page can leave an all-R-18 page looking empty and prevents
  // the next page of non-R-18 works from being requested. Reset the waterfall
  // and fetch page one with the new preference; fixed cached ranks are still
  // filtered again by visibleWorks().
  state.listGeneration = Number(state.listGeneration || 0) + 1;
  state.page = 1;
  state.items = [];
  state.total = 0;
  loadingPage = false;
  endReached = false;
  lastPageCount = 0;
  if (infiniteObserver) {
    try { infiniteObserver.disconnect(); } catch { }
    infiniteObserver = null;
  }
  try {
    const sentinel = document.getElementById('infiniteSentinel');
    if (sentinel) sentinel.remove();
  } catch { }
  try { closePreview(); } catch { }
  try { galleryEl.innerHTML = ''; } catch { }
  try { updateNoResultVisibility(); } catch { }
  fetchWorks();
}
async function refreshCurrentGallery(opts = {}) {
  // Refreshes can originate from the settings panel or background blacklist
  // migration, outside the normal list-page fetch path. Revalidate/restore
  // the regional display cookie before applying the frontend sensitive filter
  // so a valid allowlisted session cannot briefly remove metadata-tagged
  // cards from the waterfall.
  if (sensitiveContentBlockEnabled()) {
    await ensureSensitiveSessionForIntent(false, { forceRevalidate: true });
  }
  const work = () => {
    try { closePreview(); } catch { }
    renderGallery({ forceClear: true });
    updateNoResultVisibility();
    if (state.listMode === 'pagination') {
      try { renderPagination(); } catch { }
    } else {
      try { setupInfiniteScrollIfVisible(); } catch { }
    }
  };
  if (opts.preserveScroll) {
    preserveWindowScrollAfterRender(work);
  } else {
    work();
  }
}
	let frontendFilterRefreshTimer = null;
	function scheduleFrontendFilterRefresh() {
	  if (frontendFilterRefreshTimer) return;
		  frontendFilterRefreshTimer = setTimeout(() => {
		    frontendFilterRefreshTimer = null;
		    refreshCurrentGallery({ preserveScroll: true });
		  }, 0);
		}
	function setShowSuspectInvalidTags(v) {
		  state.showSuspectInvalidTags = !!v;
		  try { localStorage.setItem(SHOW_SUSPECT_INVALID_TAGS_KEY, state.showSuspectInvalidTags ? '1' : '0'); } catch { }
		  syncInvalidTagToggles();
		  refreshCurrentGallery({ preserveScroll: true });
		}
	function setShowNaixInvalidTags(v) {
		  state.showNaixInvalidTags = !!v;
		  try { localStorage.setItem(SHOW_NAIX_INVALID_TAGS_KEY, state.showNaixInvalidTags ? '1' : '0'); } catch { }
		  syncInvalidTagToggles();
		  refreshCurrentGallery({ preserveScroll: true });
		}

async function getConfig() {
  try {
    const now = Date.now();
    const TTL_MS = 60 * 1000;
    const cachedStr = localStorage.getItem(CONFIG_CACHE_JSON_KEY) || '';
    const cachedTs = parseInt(localStorage.getItem(CONFIG_CACHE_TS_KEY) || '0', 10);
    if (cachedStr && cachedTs && (now - cachedTs) < TTL_MS) {
      try {
        const cached = JSON.parse(cachedStr);
        CONFIG = Object.assign(CONFIG, cached);
        applyHomepageAnnouncement(cached);
        return CONFIG;
      } catch { }
    }
    const res = await fetch(apiUrl(`/api/config?v=${encodeURIComponent(CONFIG_REQUEST_VERSION)}`));
    const cfg = res.ok ? await res.json() : {};
    CONFIG = Object.assign(CONFIG, cfg);
    try {
      const years = Array.isArray(cfg.available_years) ? cfg.available_years : [];
      const months = Array.isArray(cfg.available_months) ? cfg.available_months : [];
      const tr = timeRangeSel;
      const tr2 = timeRangeSel2;
      if (tr) {
        // 清空并重建选项
        tr.innerHTML = '';
        const optAll = document.createElement('option'); optAll.value = 'all'; optAll.textContent = t('time_all'); tr.appendChild(optAll);
        // 年份（按年）；2023年不再细分季度，9月之前归入“更老”
        const yrs = years.length ? years : [2026, 2025, 2024, 2023];
        yrs.sort((a, b) => b - a);
        for (const y of yrs) {
          const optY = document.createElement('option'); optY.value = `y${y}`; optY.textContent = t('time_full_year', { year: y }); tr.appendChild(optY);
          if (y !== 2023) {
            for (let q = 1; q <= 4; q++) {
              const optQ = document.createElement('option'); optQ.value = `q${y}Q${q}`; optQ.textContent = t('time_quarter', { year: y, quarter: q }); tr.appendChild(optQ);
            }
          }
        }
        const optOlder = document.createElement('option'); optOlder.value = 'older'; optOlder.textContent = t('time_older'); tr.appendChild(optOlder);
      }
      if (tr && tr2) { tr2.innerHTML = tr.innerHTML; }
      const sm = sortModeSel;
      const sm2 = sortModeSel2;
      if (sm && tr) {
        sm.addEventListener('change', () => {
          const mode = sm.value || 'new';
          // 当切换到“每月排行榜”时，默认时间范围为“当前月份”；列表为“全部时间”
          if (mode === 'monthly') {
            const now = new Date(); const y = now.getFullYear(); const m = String(now.getMonth() + 1).padStart(2, '0');
            // 在排行榜模式下另采用 months 列表；若无 months 列表则构建 2025/2024 月份
            rebuildMonthlyOptions(months);
            tr.value = `m${y}-${m}`;
            if (tr2) tr2.value = tr.value;
            if (sm2) sm2.value = mode;
          } else {
            rebuildTimeOptions();
            tr.value = 'all';
            if (tr2) tr2.value = tr.value;
            if (sm2) sm2.value = mode;
          }
          triggerSearch();
        });
      }
      if (sm2 && tr2) {
        sm2.addEventListener('change', () => {
          const mode = sm2.value || 'new';
          if (sortModeSel) sortModeSel.value = mode;
          if (mode === 'monthly') {
            const now = new Date(); const y = now.getFullYear(); const m = String(now.getMonth() + 1).padStart(2, '0');
            rebuildMonthlyOptions(months);
            tr2.value = `m${y}-${m}`;
            if (timeRangeSel) timeRangeSel.value = tr2.value;
          } else {
            rebuildTimeOptions();
            tr2.value = 'all';
            if (timeRangeSel) timeRangeSel.value = tr2.value;
          }
          triggerSearch();
        });
      }
      if (tr) {
        tr.addEventListener('change', () => {
          triggerSearch();
        });
      }
      if (tr2) {
        tr2.addEventListener('change', () => {
          if (timeRangeSel) timeRangeSel.value = tr2.value;
          triggerSearch();
        });
      }
    } catch { }
    applyHomepageAnnouncement(cfg);
    try {
      localStorage.setItem(CONFIG_CACHE_JSON_KEY, JSON.stringify(cfg));
      localStorage.setItem(CONFIG_CACHE_TS_KEY, String(now));
    } catch { }
    return CONFIG;
  } catch {
    return CONFIG;
  }
}

function rebuildTimeOptions() {
  const tr = timeRangeSel; if (!tr) return;
  const yrs = Array.isArray(CONFIG.available_years) && CONFIG.available_years.length ? CONFIG.available_years.slice() : [2025, 2024, 2023];
  yrs.sort((a, b) => b - a);
  tr.innerHTML = '';
  for (const y of yrs) {
    const optY = document.createElement('option'); optY.value = `y${y}`; optY.textContent = t('time_full_year', { year: y }); tr.appendChild(optY);
    if (y > 2023) {
      for (let q = 1; q <= 4; q++) { const optQ = document.createElement('option'); optQ.value = `q${y}Q${q}`; optQ.textContent = t('time_quarter', { year: y, quarter: q }); tr.appendChild(optQ); }
    } else if (y === 2023) {
      const optQ4 = document.createElement('option'); optQ4.value = 'q2023Q4'; optQ4.textContent = t('time_quarter', { year: 2023, quarter: 4 }); tr.appendChild(optQ4);
    }
  }
  const optOlder = document.createElement('option'); optOlder.value = 'older'; optOlder.textContent = t('time_older'); tr.appendChild(optOlder);
  if (timeRangeSel2) timeRangeSel2.innerHTML = tr.innerHTML;
}

function rebuildMonthlyOptions(months) {
  const tr = timeRangeSel; if (!tr) return;
  tr.innerHTML = '';
  const optCur = document.createElement('option'); optCur.value = 'current'; optCur.textContent = t('time_current_month'); tr.appendChild(optCur);
  const yrs = Array.isArray(CONFIG.available_years) && CONFIG.available_years.length ? CONFIG.available_years.slice() : [2025, 2024, 2023];
  yrs.sort((a, b) => b - a);
  // 逐年月份
  const monthsList = Array.isArray(months) ? months.slice() : [];
  // 仅保留从 2023-11 及之后的月份
  const monthsFiltered = monthsList.filter((ym) => {
    try {
      const y = parseInt(String(ym).slice(0, 4), 10);
      const m = parseInt(String(ym).slice(5, 7), 10);
      if (y < 2023) return false;
      if (y === 2023 && m < 11) return false;
      return true;
    } catch { return false; }
  });
  const monthsByYear = new Map();
  for (const ym of monthsFiltered) {
    const y = parseInt(String(ym).slice(0, 4), 10);
    if (!monthsByYear.has(y)) monthsByYear.set(y, []);
    monthsByYear.get(y).push(String(ym));
  }
  for (const y of yrs) {
    const ms = monthsByYear.get(y) || [];
    ms.sort().reverse();
    for (const ym of ms) {
      const optM = document.createElement('option'); optM.value = `m${ym}`; optM.textContent = `${ym}`; tr.appendChild(optM);
    }
  }
  const optOlder = document.createElement('option'); optOlder.value = 'older'; optOlder.textContent = t('time_older'); tr.appendChild(optOlder);
  if (timeRangeSel2) timeRangeSel2.innerHTML = tr.innerHTML;
}

async function decodeBlacklistSet(blob) {
  try {
    if (CONFIG._blacklist_set && CONFIG.config_version) return CONFIG._blacklist_set;
    const c = _b64uToBytes(blob.c || '');
    const iv = _b64uToBytes(blob.iv || '');
    const s = _b64uToBytes(blob.s || '');
    if (!c.length || !iv.length) return new Set();
    const plain = new Uint8Array(c.length);
    let off = 0, idx = 0;
    if (window.crypto && crypto.subtle) {
      const keyRaw = s.length ? s : _utf8Bytes('AiGalleryMask_2025');
      const key = await crypto.subtle.importKey('raw', keyRaw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      while (off < c.length) {
        const counter = _concat(iv, _u32be(idx));
        const ksBuf = await crypto.subtle.sign('HMAC', key, counter);
        const ks = new Uint8Array(ksBuf);
        const len = Math.min(32, c.length - off);
        for (let j = 0; j < len; j++) plain[off + j] = c[off + j] ^ ks[j];
        off += len; idx += 1;
      }
    } else {
      while (off < c.length) {
        const counter = _concat(iv, _u32be(idx));
        const ks = _hmacSha256(s.length ? s : 'AiGalleryMask_2025', counter);
        const len = Math.min(32, c.length - off);
        for (let j = 0; j < len; j++) plain[off + j] = c[off + j] ^ ks[j];
        off += len; idx += 1;
      }
    }
    let listStr = '';
    try { listStr = new TextDecoder().decode(plain); } catch { listStr = _bytesToAscii(plain); }
    const ids = listStr.split(',').map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n));
    const set = new Set(ids);
    CONFIG._blacklist_set = set;
    return set;
  } catch { return new Set(); }
}

function _utf8Bytes(s) {
  try { return new TextEncoder().encode(String(s)); } catch (e) { var u = unescape(encodeURIComponent(String(s))); var a = new Uint8Array(u.length); for (var i = 0; i < u.length; i++) { a[i] = u.charCodeAt(i); } return a; }
}
function _b64uToBytes(s) { s = String(s || '').replace(/-/g, '+').replace(/_/g, '/'); var pad = s.length % 4; if (pad) s += '='.repeat(4 - pad); var b = atob(s); var a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) { a[i] = b.charCodeAt(i); } return a; }
function _bytesToAscii(u) { var s = ''; for (var i = 0; i < u.length; i++) { s += String.fromCharCode(u[i]); } return s; }
function _concat(a, b) { var out = new Uint8Array(a.length + b.length); out.set(a, 0); out.set(b, a.length); return out; }
function _u32be(n) { var a = new Uint8Array(4); a[0] = (n >>> 24) & 255; a[1] = (n >>> 16) & 255; a[2] = (n >>> 8) & 255; a[3] = n & 255; return a; }
function _sha256(msg) {
  var K = [1116352408, 1899447441, 3049323471, 3921009573, 961987163, 1508970993, 2453635748, 2870763221, 3624381080, 310598401, 607225278, 1426881987, 1925078388, 2162078206, 2614888103, 3248222580, 3835390401, 4022224774, 264347078, 604807628, 770255983, 1249150122, 1555084734, 1996064986, 2554220882, 2821834349, 2952996808, 3210313671, 3336571891, 3584528711, 113926993, 338241895, 666307205, 773529912, 1294757372, 1396182291, 1695183700, 1986661051, 2177026350, 2456956037, 2730485921, 2820302411, 3259730800, 3345764771, 3516065817, 3600352804, 4094571909, 275423344, 430227734, 506948616, 659060556, 883997877, 958139571, 1322822218, 1537002063, 1747873779, 1955562222, 2024104815, 2227730452, 2361852424, 2428436474, 2756734187, 3204031479, 3329325298];
  var H = [1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541445756];
  var i, j, t1, t2, a, b, c, d, e, f, g, h;
  var bytes = (msg instanceof Uint8Array) ? msg : _utf8Bytes(msg); var l = bytes.length; var withOne = new Uint8Array(l + 1); withOne.set(bytes, 0); withOne[l] = 0x80; var padLen = ((withOne.length + 8 + 64) >> 6 << 6); var buf = new Uint8Array(padLen); buf.set(withOne, 0); var bitLen = l * 8; buf[padLen - 4] = (bitLen >>> 24) & 255; buf[padLen - 3] = (bitLen >>> 16) & 255; buf[padLen - 2] = (bitLen >>> 8) & 255; buf[padLen - 1] = bitLen & 255;
  for (i = 0; i < buf.length; i += 64) {
    var w = new Uint32Array(64); for (j = 0; j < 16; j++) { var idx = i + j * 4; w[j] = (buf[idx] << 24) | (buf[idx + 1] << 16) | (buf[idx + 2] << 8) | (buf[idx + 3]); }
    for (j = 16; j < 64; j++) { var s0 = ((w[j - 15] >>> 7) | (w[j - 15] << 25)) ^ ((w[j - 15] >>> 18) | (w[j - 15] << 14)) ^ (w[j - 15] >>> 3); var s1 = ((w[j - 2] >>> 17) | (w[j - 2] << 15)) ^ ((w[j - 2] >>> 19) | (w[j - 2] << 13)) ^ (w[j - 2] >>> 10); w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0; }
    a = H[0]; b = H[1]; c = H[2]; d = H[3]; e = H[4]; f = H[5]; g = H[6]; h = H[7];
    for (j = 0; j < 64; j++) { var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7)); var ch = (e & f) ^ (~e & g); var temp1 = (h + S1 + ch + K[j] + w[j]) | 0; var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10)); var maj = (a & b) ^ (a & c) ^ (b & c); var temp2 = (S0 + maj) | 0; h = g; g = f; f = e; e = (d + temp1) | 0; d = c; c = b; b = a; a = (temp1 + temp2) | 0; }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  var out = new Uint8Array(32); for (i = 0; i < 8; i++) { out[i * 4] = (H[i] >>> 24) & 255; out[i * 4 + 1] = (H[i] >>> 16) & 255; out[i * 4 + 2] = (H[i] >>> 8) & 255; out[i * 4 + 3] = H[i] & 255; } return out;
}
function _hmacSha256(key, data) { var k = (key instanceof Uint8Array) ? key : _utf8Bytes(key); if (k.length > 64) k = _sha256(k); var kp = new Uint8Array(64); kp.set(k, 0); var ipad = new Uint8Array(64); var opad = new Uint8Array(64); for (var i = 0; i < 64; i++) { ipad[i] = kp[i] ^ 0x36; opad[i] = kp[i] ^ 0x5c; } var inner = _sha256(_concat(ipad, (data instanceof Uint8Array) ? data : _utf8Bytes(data))); return _sha256(_concat(opad, inner)); }
function isBlockedWork(w) {
  if (!state.blacklist.length) return false;
  const hay = [w.title, w.caption, w.tags, w.AI_type].map((v) => String(v || '').toLowerCase()).join('\n');
  return state.blacklist.some((kw) => kw && hay.includes(kw));
}

function syntaxHighlight(jsonStr) {
  // naive highlighter for JSON
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  let html = esc(jsonStr)
    .replace(/(".*?")(?=\s*:)/g, '<span class="k">$1</span>')
    .replace(/:\s*"(.*?)"/g, ':<span class="s">"$1"</span>')
    .replace(/:\s*(\d+(?:\.\d+)?)/g, ':<span class="n">$1</span>')
    .replace(/:\s*(true|false|null)/g, ':<span class="b">$1</span>');

  // Highlight common SD parameter prefixes within string content
  const sdPattern = /\b(Negative prompt|Steps|Sampler|Schedule type|CFG scale|Seed|Size|Model hash|Model|Denoising strength|Clip skip|Eta|Noise|Upscaler|Hires steps|Hires upscaler|Hires scale|Hires denoising strength|Mask blur|Inpaint area|Masked area padding|Lora hashes|Version|Style Selector Enabled|Style Selector Randomize|Style Selector Style|ADetailer confidence|ADetailer dilate erode|ADetailer mask blur|ADetailer inpaint only masked|ADetailer inpaint padding|ADetailer denoising strength|ADetailer model|ADetailer prompt)\s*:/gi;
  html = html.replace(sdPattern, (m) => `<span class="sd">${m}</span>`);

  // Highlight <lora:...> fragments and ensure the entire token is orange/bold
  // Previous JSON number highlighting may have inserted <span class="n"> inside the token;
  // we strip inner span tags within the matched lora segment so it becomes one colored block.
  html = html.replace(/(&lt;lora:)[\s\S]*?&gt;/gi, (m) => {
    const cleaned = m.replace(/<\/?span[^>]*>/g, '');
    return `<span class="sd-lora">${cleaned}</span>`;
  });

  return html;
}

// 详情页 JSON 框全局展开/折叠状态与注册表
const AI_METADATA_READABLE_EXPANDED_KEY = 'aiMetadataReadableExpandedV1';
function getReadableMetadataExpanded() {
  try { return localStorage.getItem(AI_METADATA_READABLE_EXPANDED_KEY) === '1'; } catch { return false; }
}
function setReadableMetadataExpanded(expanded) {
  try { localStorage.setItem(AI_METADATA_READABLE_EXPANDED_KEY, expanded ? '1' : '0'); } catch { }
}
let detailJsonBoxes = [];
let detailJsonExpanded = false;
let detailMetadataMode = 'json';

// 无限滚动加载状态与终止标记
let loadingPage = false;
let endReached = false;
let lastPageCount = 0;
let activeWorksRequestToken = 0;

function showSensitiveSearchBlocked() {
  loadingPage = false;
  endReached = true;
  state.items = [];
  state.total = 0;
  try { state.workPages.clear(); } catch { }
  try { removeInfiniteSentinel(); } catch { }
  try { renderGallery({ forceClear: true }); } catch { }
  try { updateNoResultVisibility(); } catch { }
  try {
    if (loadingEl) loadingEl.style.display = 'none';
    if (paginationEl) paginationEl.innerHTML = '';
    if (loadMoreBtn) loadMoreBtn.classList.add('hidden');
    if (searchStatusEl) {
      const textEl = searchStatusEl.querySelector('span');
      if (textEl) textEl.textContent = t('sensitive_search_blocked');
      searchStatusEl.classList.add('visible', 'notice');
    }
  } catch { }
}

async function fetchWorks() {
  const requestGeneration = Number(state.listGeneration || 0);
  const requestedPage = Math.max(1, Number(state.page) || 1);
  const sensitiveQuery = isSensitiveSearchQuery(state.q, state.prompt);
  if (sensitiveQuery && !sensitiveSearchCanProceed()) {
    if (requestGeneration === Number(state.listGeneration || 0)) showSensitiveSearchBlocked();
    return;
  }
  // Establish the IP/region-bound HttpOnly session before rendering any
  // cached detail payloads. This covers positive-prompt-only sensitive works
  // while individual URL codes are minted in parallel below.
  if (sensitiveContentBlockEnabled()) {
    // A waterfall page boundary may revalidate the cookie only when it is
    // close to expiry; otherwise the in-memory session is reused.
    await ensureSensitiveSessionForIntent(sensitiveSearchCanProceed(), { forceRevalidate: true });
  }
  if (requestGeneration !== Number(state.listGeneration || 0)) return;
  let keepSearchNotice = false;
  try {
    if (searchStatusEl) {
      searchStatusEl.classList.remove('notice');
      const textEl = searchStatusEl.querySelector('span');
      if (textEl) textEl.textContent = t('status_searching');
      searchStatusEl.classList.add('visible');
    }
  } catch { }
  loadingPage = true;
  const requestToken = ++activeWorksRequestToken;
  loadingEl.textContent = t('loading');
  loadingEl.style.display = 'block';
  const mode = (sortModeSel && sortModeSel.value) || 'new';
  const isRank = mode === 'monthly';
  let url;
  if (isRank) {
    const trVal = (timeRangeSel && timeRangeSel.value) || 'current';
    if (trVal === 'current') {
      url = apiUrl(sensitiveQuery ? '/api/sensitive_rank/monthly/real' : '/api/rank/monthly/real');
    } else if (trVal === 'older' || (trVal.startsWith('m'))) {
      url = apiUrl(sensitiveQuery ? '/api/sensitive_rank/monthly/fixed' : '/api/rank/monthly/fixed');
    } else {
      url = apiUrl(sensitiveQuery ? '/api/sensitive_rank/monthly' : '/api/rank/monthly');
    }
  } else {
    url = apiUrl(sensitiveQuery ? '/api/sensitive_works_search' : '/api/ai_works_search');
  }
  // Version the policy-bearing request so an old CDN-cached search response
  // cannot satisfy a request made by this client.
  url.searchParams.set('sensitive_policy', SENSITIVE_CONTENT_POLICY_VERSION);
  // Keep the display preference explicit on every list/rank request. Shared
  // cached payloads still undergo the authoritative frontend R-18 filter.
  url.searchParams.set('show_r18', state.showR18 ? '1' : '0');
  url.searchParams.set('page', requestedPage);
  url.searchParams.set('page_size', state.pageSize);
  if (state.q) url.searchParams.set('q', state.q);
  if (state.prompt) url.searchParams.set('prompt', state.prompt);
  const tr = (timeRangeSel && timeRangeSel.value) || (isRank ? 'current' : 'all');
  if (isRank) {
    // period 参数：current 或 YYYY-MM 或 older
    const path = url.pathname || '';
    if (path.includes('/real')) {
      // 当前月份不需要 period
    } else if (path.includes('/fixed')) {
      let month = '';
      if (tr === 'older') month = 'older';
      else if (tr && tr.startsWith('m')) month = tr.slice(1);
      url.searchParams.set('month', month);
    } else {
      let period = 'current';
      if (tr && tr.startsWith('m')) period = tr.slice(1);
      else if (tr === 'older') period = 'older';
      url.searchParams.set('period', period);
    }
    // 月榜也支持关键词与 prompt 过滤
    if (state.q) url.searchParams.set('q', state.q);
    if (state.prompt) url.searchParams.set('prompt', state.prompt);
  } else {
    // 列表接口：sort 与 time_range
    url.searchParams.set('sort', mode || 'new');
    url.searchParams.set('time_range', tr || 'all');
  }
  try {
    const headers = {};
    if (state.searchIntent === true) {
      headers['X-Gallery-Search-Intent'] = 'site-search';
      if (CONFIG.sensitive_search_token) headers['X-Gallery-Sensitive-Search-Token'] = String(CONFIG.sensitive_search_token);
    }
    const res = await fetch(url, { headers });
    let data = {};
    try {
      data = await res.json();
    } catch { data = { page: requestedPage, page_size: state.pageSize, total: 0, items: [] }; }
    // Search changes and page jumps invalidate all older responses. This
    // check must happen before touching items, counters, observers, or UI.
    // A page-2 response from an old context is otherwise able to clear or
    // append into the new waterfall after the user has already moved on.
    if (requestGeneration !== Number(state.listGeneration || 0)
        || requestedPage !== Number(state.page || 1)) {
      return;
    }
    if (!res.ok && data && data.error === 'sensitive_content_blocked') {
      keepSearchNotice = true;
      showSensitiveSearchBlocked();
      return;
    }
    if (!res.ok && data && data.error === 'rank_processing') {
      const msg = CURRENT_LANG.startsWith('zh')
        ? (data.message_zh || t('rank_processing'))
        : (data.message_en || t('rank_processing'));
	      state.items = [];
	      state.total = 0;
      try { state.workPages.clear(); } catch { }
	      lastPageCount = 0;
      renderGallery();
      if (paginationEl) paginationEl.innerHTML = '';
      if (loadMoreBtn) loadMoreBtn.classList.add('hidden');
      try { if (noResultEl) noResultEl.classList.remove('visible'); } catch { }
      try {
        if (searchStatusEl) {
          const textEl = searchStatusEl.querySelector('span');
          if (textEl) textEl.textContent = msg;
          searchStatusEl.classList.add('visible', 'notice');
          keepSearchNotice = true;
        }
      } catch { }
      return;
	    }
	    if (sensitiveQuery && url.pathname === '/api/sensitive_rank/monthly/fixed') {
	      await hydrateSensitiveFixedRankAccessCodes(Array.isArray(data.items) ? data.items : []);
	    }
	    if (requestGeneration !== Number(state.listGeneration || 0)
	        || requestedPage !== Number(state.page || 1)) return;
		    // 保留接口原始结果，具体隐藏规则统一在前端渲染时应用，方便开关即时恢复。
    let incoming = Array.isArray(data.items) ? data.items : [];
    incoming.forEach((work) => {
      try {
        const code = state.searchWorkAccessCodes.get(normalizeWorkId(work && work.id));
        if (code && sensitiveContentRegionAllowed()) work.sensitive_access_code = code;
      } catch { }
    });
    const exactLinkedWorkId = exactWorkSearchId(state.exactWorkSearchId);
    if (exactLinkedWorkId) {
      let exactWork = incoming.find((work) => String(work && work.id) === exactLinkedWorkId) || null;
      // Numeric general search intentionally also matches author IDs. If an
      // author collision pushes the linked work outside this page, read the
      // already CDN-cacheable work metadata endpoint and still return exactly
      // the work represented by the pasted URL.
      if (!exactWork) {
        try {
          const detail = await fetchWork(normalizeWorkId(exactLinkedWorkId));
          if (detail && detail.work && String(detail.work.id) === exactLinkedWorkId) {
            exactWork = detail.work;
            try {
              const code = state.searchWorkAccessCodes.get(normalizeWorkId(exactLinkedWorkId));
              if (code && sensitiveContentRegionAllowed()) exactWork.sensitive_access_code = code;
            } catch { }
          }
        } catch { exactWork = null; }
      }
      if (requestGeneration !== Number(state.listGeneration || 0)) return;
      incoming = exactWork ? [exactWork] : [];
      data.total = incoming.length;
    }
    lastPageCount = incoming.length;
    incoming.forEach((work) => rememberWorkAccessCode(work));
    rememberWorkListPages(incoming, requestedPage, { reset: !(state.listMode === 'infinite' && requestedPage > 1) });
	    if (state.listMode === 'infinite' && requestedPage > 1) {
      // 追加并按 id 去重
      const prev = state.items || [];
      const map = new Map(prev.map((w) => [String(w && w.id), w]));
      for (const w of incoming) {
        const key = String(w && w.id);
        if (!map.has(key)) map.set(key, w);
      }
      state.items = Array.from(map.values());
	    } else {
	      state.items = incoming;
	    }
	    state.total = data.total || 0;
	    renderGallery();
	    updateNoResultVisibility();
	    if (state.listMode === 'pagination') {
      renderPagination();
    }
	    if (state.listMode === 'infinite') {
	      setupInfiniteScrollIfVisible();
      // 根据是否还有下一页，切换“加载更多”按钮显示
      const totalPages = Math.max(1, Math.ceil((state.total || 0) / (state.pageSize || 1)));
      const unknownTotal = (state.total <= 0);
      endReached = unknownTotal ? (lastPageCount < state.pageSize) : (state.page >= totalPages);
      if (loadMoreBtn) {
        loadMoreBtn.classList.toggle('hidden', endReached);
      }
    }
  } catch (e) {
    loadingEl.textContent = t('loading_failed');
    try { if (noResultEl) noResultEl.classList.add('visible'); } catch { }
  } finally {
    // An obsolete request must not clear the loading lock owned by the
    // current page request. Otherwise the sentinel can start overlapping
    // page loads and responses can arrive out of order.
    if (requestGeneration === Number(state.listGeneration || 0)
        && requestToken === activeWorksRequestToken) {
      loadingEl.style.display = 'none';
      loadingPage = false;
      try {
        if (searchStatusEl && !keepSearchNotice) {
          searchStatusEl.classList.remove('visible', 'notice');
        }
      } catch { }
    }
  }
}

function renderGallery(opts = {}) {
  const renderGeneration = Number(state.listGeneration || 0);
  const shouldClear = !!opts.forceClear || !(state.listMode === 'infinite' && state.page > 1);
  if (shouldClear) {
    galleryEl.innerHTML = '';
  }
  // 更新右下角页码显示
  if (fcNum) {
    fcNum.textContent = String(state.page);
  }
  const existingIds = new Set(Array.from(galleryEl.querySelectorAll('.card img')).map((img) => String(img.dataset.workId || '')));
  const baseItems = shouldClear ? state.items : state.items.filter((w) => !existingIds.has(String(w && w.id)));
  const renderItems = visibleWorks(baseItems);
  const adAfterVisibleCount = Math.max(1, getGalleryColumnCount() * 3);
  const visibleCountByPage = new Map();
  renderItems.forEach((w, index) => {
    const card = document.createElement('div');
    card.className = 'card';
    // thumbnail uses actual image address; pick first image via work detail fetch when hover
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = t('thumb_alt');
    img.draggable = false;
    // lazy set src when in viewport via IntersectionObserver fallback
    img.dataset.workId = w.id;
    card.appendChild(img);

    const cardLink = document.createElement('a');
    cardLink.className = 'card-link';
    cardLink.href = withLangParam(workHrefWithSensitiveCode(w));
    cardLink.target = '_blank';
    cardLink.rel = 'noopener';
    cardLink.setAttribute('aria-label', (w.title && String(w.title).trim()) ? String(w.title).trim() : t('work_fallback', { id: w.id }));
    cardLink.addEventListener('click', (ev) => {
      if (ev.button != null && ev.button !== 0) {
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      const id = w.id;
      if (state.openWorkInNewWindow) {
        openPreparedWorkInNewWindow(id, w);
        return;
      }
      state.directDetail = false;
      openDetail(id);
    });
    cardLink.addEventListener('auxclick', (ev) => {
      if (ev.button !== 1) return;
      ev.preventDefault();
      ev.stopPropagation();
      openPreparedWorkInNewWindow(w.id, w);
    });
    card.appendChild(cardLink);

    const badge = document.createElement('div');
    badge.className = 'badge';
    badge.textContent = w.image_count || 0;
    card.appendChild(badge);

    try {
      const mode = (sortModeSel && sortModeSel.value) || (sortModeSel2 && sortModeSel2.value) || 'new';
      if (mode === 'monthly') {
        const mets = document.createElement('div');
        mets.className = 'card-metrics';
        const v = document.createElement('span');
        v.className = 'cm-view';
        v.textContent = `${formatMetric(Number(w.total_view || 0))}V`;
        const b = document.createElement('span');
        b.className = 'cm-bookmark';
        b.textContent = `${formatMetric(Number(w.total_bookmarks || 0))}B`;
        mets.appendChild(v);
        mets.appendChild(b);
        card.appendChild(mets);
      }
    } catch { }

    // 左上角类型徽章（不同颜色）
    const typeBadge = document.createElement('div');
    typeBadge.className = 'type-pill ' + typeClass(w.AI_type || '');
    typeBadge.textContent = String(w.AI_type || '').toUpperCase();
    typeBadge.title = t('type_search_tip');
    typeBadge.addEventListener('click', (e) => {
      e.stopPropagation();
      const typeQuery = String(w.AI_type || '').trim();
      if (typeQuery) openSearchIntentInNewWindow(typeQuery);
    });
    card.appendChild(typeBadge);

    const meta = document.createElement('div');
    meta.className = 'meta';
    const workHref = withLangParam(workHrefWithSensitiveCode(w));
    const titleText = (w.title && String(w.title).trim()) ? String(w.title).trim() : '';
    const titlePart = titleText ? `<div class="meta-title"><a class="meta-link" href="${escapeHtml(workHref)}" target="_blank" rel="noopener">${escapeHtml(titleText)}</a></div>` : '';
    const authorHtml = buildAuthorLinkHtml(w, [], 'meta-link meta-author-link');
    const authorPart = authorHtml ? `<div class="meta-author">${authorHtml}</div>` : '';
    // 移动端简介仅显示 10 个字符；PC 端保持较长（70）；移动端判定扩展为 ≤800px
    const isMobile = window.innerWidth <= 800;
    const capPart = w.caption ? `<div class="meta-caption">${escapeHtml(snippet(w.caption, isMobile ? 10 : 70))}</div>` : '';
    const dateStr = w.create_date ? formatDate(w.create_date) : '';
    const datePart = dateStr ? `<div class="meta-date"><a class="meta-link" href="${escapeHtml(workHref)}" target="_blank" rel="noopener">${escapeHtml(dateStr)}</a></div>` : '';
    meta.innerHTML = `${titlePart}${authorPart}${capPart}${datePart}`;
    wireAuthorSearchLinks(meta);
    try {
      const links = meta.querySelectorAll('.meta-link:not(.meta-author-link)');
      links.forEach((a) => {
        a.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (ev.button != null && ev.button !== 0) return;
          ev.preventDefault();
          openPreparedWorkInNewWindow(w.id, w);
        });
        a.addEventListener('auxclick', (ev) => {
          if (ev.button !== 1) return;
          ev.preventDefault();
          ev.stopPropagation();
          openPreparedWorkInNewWindow(w.id, w);
        });
      });
    } catch { }
    card.appendChild(meta);

    // Bind desktop hover handlers whenever the device supports hover so the
    // setting can be toggled at runtime without rerendering the gallery.
    if (supportsHover() && window.innerWidth > MOBILE_MAX_WIDTH) {
      // Keep a narrow central hover zone so crossing card edges while
      // scrolling does not start an expensive image preview request.
      card.addEventListener('mouseenter', (event) => {
        if (!shouldEnableHoverPreview()) return;
        if (previewHoverPointAllowed(event, card)) {
          cancelScheduledPreviewClose();
          openPreview(w.id, card);
        } else if (state.preview.active || state.preview.pendingWorkId) {
          schedulePreviewClose();
        }
      });
      card.addEventListener('mousemove', (event) => {
        if (!shouldEnableHoverPreview()) return;
        if (!previewHoverPointAllowed(event, card)) {
          if (state.preview.active || state.preview.pendingWorkId) schedulePreviewClose();
          return;
        }
        cancelScheduledPreviewClose();
        if (!state.preview.active && !state.preview.pendingWorkId) openPreview(w.id, card);
      });
      card.addEventListener('mouseleave', () => {
        if (!shouldEnableHoverPreview()) return;
        if (state.preview.anchorEl === card || state.preview.pendingWorkId === String(w.id)) schedulePreviewClose();
      });
    }
    card.addEventListener('click', () => {
      const id = w.id;
      if (state.openWorkInNewWindow) {
        openPreparedWorkInNewWindow(id, w);
        return;
      }
      state.directDetail = false;
      openDetail(id);
    });
    card.addEventListener('auxclick', (ev) => {
      if (ev.button !== 1) return;
      ev.preventDefault();
      ev.stopPropagation();
      openPreparedWorkInNewWindow(w.id, w);
    });

	    galleryEl.appendChild(card);
    const listPage = getWorkListPage(w);
    const nextCount = (visibleCountByPage.get(listPage) || 0) + 1;
    visibleCountByPage.set(listPage, nextCount);
    if (nextCount === adAfterVisibleCount) {
      appendGalleryAd(`page-${listPage}-after-3-rows`);
    }
	  });

	  // 保证哨兵始终位于末尾
  const sentinel = document.getElementById('infiniteSentinel');
  if (sentinel && state.listMode === 'infinite') {
    galleryEl.appendChild(sentinel);
  }

	  // load first images of each work for thumbnails
	  const cards = galleryEl.querySelectorAll('.card img');
	  cards.forEach(async (img) => {
	    if (img.src) return; // 已加载的缩略图不重复请求详情
	    if (img.dataset.detailLoading === '1') return;
	    img.dataset.detailLoading = '1';
	    const workId = img.dataset.workId;
	    try {
	      const cacheKey = normalizeWorkId(workId);
	      let data = state.cache.works.get(cacheKey);
	      if (!data) {
        const detailUrl = apiUrl(`/api/work/${encodeURIComponent(String(workId))}`);
        const res = await fetch(detailUrl);
	        if (!res.ok) return;
	        data = await res.json();
	        // 缓存作品详情，避免重复请求
	        state.cache.works.set(cacheKey, data);
	      }
	      // The card may have been replaced by a later page append, filter
      // refresh, or a new search while this detail request was in flight.
      // Never let that stale callback mutate flags or redraw the current
      // waterfall.
      if (renderGeneration !== Number(state.listGeneration || 0) || !img.isConnected) return;
	      const flagsChanged = rememberWorkFlagsFromDetail(data);
      const detailWork = (data && data.work) || { id: workId };
      // A normal search can discover a work whose sensitive term exists only
      // in positive AI metadata.  The cached list cannot carry a per-IP
      // code, so exchange the in-site search token before filtering it.
      if (getWorkFlags(workId).sensitiveContent && !sensitiveAccessCodeForWork(workId)
          && workHasSensitiveTagData(detailWork)) {
        // Middle-click and the "open in new window" setting use the card's
        // anchor href directly, so mint the bound work code during hydration
        // and update every link before the user can open a new tab. A
        // Metadata-only sensitive works are authorized by the validated
        // allowlist display cookie. Tagged works still receive a per-work
        // code so links can be opened in a new tab without relying on SPA
        // state.
        const inSiteSearch = sensitiveSearchCanProceed();
        const accessIntent = inSiteSearch ? 'site-search' : 'display';
        await ensureSensitiveWorkAccessCodeWithRetry(
          detailWork,
          renderGeneration,
          { intent: accessIntent },
        );
      }
      if (renderGeneration !== Number(state.listGeneration || 0) || !img.isConnected) return;
      if (flagsChanged && isFrontendHiddenWork(detailWork)) {
        // Only the work whose metadata changed is invalid. Re-rendering the
        // whole waterfall here removes every existing card and lets pending
        // callbacks from other pages race with the new render.
        const cardEl = img.closest('.card');
        if (cardEl) cardEl.remove();
        updateNoResultVisibility();
        return;
	      }
	      try {
	        const wtype = String((data.work || {}).AI_type || '').toLowerCase();
	        if ((wtype === 'nai' || wtype === 'nai_x' || wtype === 'sd' || wtype === 'comfyui') && window.NAIX && typeof window.NAIX.suspectWork === 'function') {
	          const isSuspect = !!getWorkFlags(workId).suspectInvalidTags;
	          if (isSuspect) {
	            const cardEl = img.parentElement;
	            if (cardEl && !cardEl.querySelector('.type-pill.naix-flag')) {
              const flag = document.createElement('div');
              flag.className = 'type-pill naix-flag';
              flag.textContent = t('naix_suspect');
              // 放置在 NAI 徽章右侧
              try {
                const baseBadge = cardEl.querySelector('.type-pill.nai') || cardEl.querySelector('.type-pill');
                if (baseBadge) {
                  const rect = baseBadge.getBoundingClientRect();
                  const parentRect = cardEl.getBoundingClientRect();
                  const left = (rect.left - parentRect.left) + baseBadge.offsetWidth + 6;
                  flag.style.left = `${left}px`;
                  flag.style.top = `${baseBadge.offsetTop}px`;
                }
              } catch { }
              cardEl.appendChild(flag);
            }
          }
        }
        if (wtype === 'comfyui' && isNonStandardComfyuiWork(data)) {
          const cardEl = img.parentElement;
          if (cardEl && !cardEl.querySelector('.type-pill.nonstandard-flag')) {
            const flag = document.createElement('div');
            flag.className = 'type-pill naix-flag nonstandard-flag';
            flag.textContent = t('non_standard_format');
            flag.title = t('non_standard_format_tip');
            try {
              const baseBadge = cardEl.querySelector('.type-pill.comfyui') || cardEl.querySelector('.type-pill');
              if (baseBadge) {
                const rect = baseBadge.getBoundingClientRect();
                const parentRect = cardEl.getBoundingClientRect();
                const left = (rect.left - parentRect.left) + baseBadge.offsetWidth + 6;
                flag.style.left = `${left}px`;
                flag.style.top = `${baseBadge.offsetTop}px`;
              }
            } catch { }
            cardEl.appendChild(flag);
          }
        }
      } catch { }
      // 选择排序后的第一张作为缩略图
      const first = (data.images || []).slice().sort((a, b) => getPageIndex(a) - getPageIndex(b))[0];
      if (first) {
        img.src = buildImageUrl(first);
      }
      // 以详情返回的图片数为准，回填右上角徽章，避免列表缺失计数
      try {
        const badgeEl = img.parentElement.querySelector('.badge');
        if (badgeEl) {
          const cnt = (data.images || []).length;
          badgeEl.textContent = String(cnt || 0);
        }
      } catch { }
    } catch { }
    finally {
      try { delete img.dataset.detailLoading; } catch { }
    }
  });
}

let infiniteObserver = null;
function setupInfiniteScroll() {
  let sentinel = document.getElementById('infiniteSentinel');
  if (!sentinel) {
    sentinel = document.createElement('div');
    sentinel.id = 'infiniteSentinel';
    sentinel.style.height = '1px';
    sentinel.style.margin = '0';
    sentinel.style.visibility = 'hidden';
  }
  // 始终把哨兵置于末尾
  galleryEl.appendChild(sentinel);
  // 每次调用都重新注册观察器，避免旧观察器状态导致只触发一次
  if (infiniteObserver) {
    try { infiniteObserver.disconnect(); } catch { }
    infiniteObserver = null;
  }
  infiniteObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const totalPages = Math.max(1, Math.ceil((state.total || 0) / (state.pageSize || 1)));
        const unknownTotal = (state.total <= 0);
        const hasNext = unknownTotal ? (lastPageCount === state.pageSize) : (state.page < totalPages);
        if (hasNext) {
          if (!loadingPage) {
            state.page += 1;
            fetchWorks();
          }
        } else {
          // 无更多数据，注销观察器
          if (infiniteObserver) {
            infiniteObserver.disconnect();
            infiniteObserver = null;
          }
          endReached = true;
          if (loadMoreBtn) loadMoreBtn.classList.add('hidden');
        }
      }
    }
  }, { rootMargin: '400px' });
  infiniteObserver.observe(sentinel);
}

async function fetchWork(workId) {
  if (state.cache.works.has(workId)) {
    return state.cache.works.get(workId);
  }
	  const detailUrl = apiUrl(`/api/work/${encodeURIComponent(String(workId))}`);
	  const res = await fetch(detailUrl);
	  if (!res.ok) throw new Error(t('err_network'));
	  const data = await res.json();
	  state.cache.works.set(workId, data);
	  try { rememberWorkFlagsFromDetail(data); } catch { }
	  return data;
	}

async function openPreview(workId, cardEl) {
  if (!shouldEnableHoverPreview()) return;
  const previewWorkId = String(workId);
  if (state.preview.pendingWorkId === previewWorkId) return;
  if (state.preview.active && state.preview.anchorEl === cardEl) return;
  const requestToken = Number(state.preview.requestToken || 0) + 1;
  state.preview.requestToken = requestToken;
  state.preview.pendingWorkId = previewWorkId;
  try {
    const data = await fetchWork(workId);
    if (requestToken !== Number(state.preview.requestToken || 0)) return;
    const sensitive = isSensitiveWorkData(data);
    if (sensitive && !sensitiveAccessCodeForWork(workId) && workHasSensitiveTagData(data && data.work)) {
      const inSiteSearch = sensitiveSearchCanProceed();
      await ensureSensitiveWorkAccessCodeWithRetry(
        (data && data.work) || { id: workId },
        null,
        { intent: inSiteSearch ? 'site-search' : 'display' },
      );
      if (requestToken !== Number(state.preview.requestToken || 0)) return;
    }
    if (sensitive && !sensitiveWorkAccessReady(workId)
        && !(sensitiveDisplaySessionActive() && !workHasSensitiveTagData(data && data.work))) return;
    const images = data.images || [];
    if (!images.length) return;
    // 预览按文件名中的 _pN 升序排序
    const sorted = images.slice().sort((a, b) => getPageIndex(a) - getPageIndex(b));
    state.preview.images = sorted.map((i) => buildImageUrl(i)).filter(Boolean);
    state.preview.index = 0;
    const w = data.work || {};
    hpTitle.textContent = (w.title && String(w.title).trim()) ? w.title : t('work_fallback', { id: workId });
    hpCount.textContent = t('images_count', { n: images.length });
    hpImg.src = state.preview.images[0];

    // 计算预览面板位置（左/右侧 + 顶部跟随卡片）
    const rect = cardEl.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    state.preview.side = centerX < window.innerWidth / 2 ? 'right' : 'left';
    state.preview.anchorEl = cardEl;
    // 等图片加载后再定位，获取真实高度以便决定上下显示
    hpImg.onload = () => { if (state.preview.active) positionHoverPreview(); };
    positionHoverPreview();
    state.preview.active = true;
    hoverPreview.classList.remove('hidden');
  } catch { }
  finally {
    if (state.preview.pendingWorkId === previewWorkId) state.preview.pendingWorkId = '';
  }
}

const PREVIEW_HOVER_ZONE_RATIO = 0.60;
function cancelScheduledPreviewClose() {
  try {
    if (state.preview.closeTimer) clearTimeout(state.preview.closeTimer);
    state.preview.closeTimer = 0;
  } catch { }
}
function schedulePreviewClose() {
  cancelScheduledPreviewClose();
  state.preview.closeTimer = setTimeout(() => {
    state.preview.closeTimer = 0;
    if (!state.preview.pointerOnPanel) closePreview();
  }, 120);
}
function previewHoverPointAllowed(event, cardEl) {
  try {
    if (!event || !cardEl) return false;
    const rect = cardEl.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return false;
    const marginX = rect.width * (1 - PREVIEW_HOVER_ZONE_RATIO) / 2;
    const marginY = rect.height * (1 - PREVIEW_HOVER_ZONE_RATIO) / 2;
    return event.clientX >= rect.left + marginX
      && event.clientX <= rect.right - marginX
      && event.clientY >= rect.top + marginY
      && event.clientY <= rect.bottom - marginY;
  } catch { return false; }
}

// The preview layer can sit above neighboring cards, so pointer events may
// target the layer instead of the card underneath. Resolve the card from
// viewport geometry as well, allowing a covered card to become the new hover
// target without letting the layer cause a close/reopen flicker.
function previewCardAtPoint(clientX, clientY) {
  try {
    const cards = galleryEl ? galleryEl.querySelectorAll('.card') : [];
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) continue;
      if (previewHoverPointAllowed({ clientX, clientY }, card)) return card;
    }
  } catch { }
  return null;
}
function onPreviewPointerMove(event) {
  if (!shouldEnableHoverPreview()) return;
  const card = previewCardAtPoint(event && event.clientX, event && event.clientY);
  if (card) {
    cancelScheduledPreviewClose();
    const image = card.querySelector('img[data-work-id]');
    const workId = image && String(image.dataset.workId || '').trim();
    if (workId && (!state.preview.active || state.preview.anchorEl !== card)) {
      openPreview(workId, card);
    }
    return;
  }
  // Keep the preview alive while the pointer is over its own panel. The
  // panel's mouseleave handler will schedule the final close.
  if (hoverPreview && hoverPreview.contains(event && event.target)) return;
  if (state.preview.active || state.preview.pendingWorkId) schedulePreviewClose();
}
window.addEventListener('mousemove', onPreviewPointerMove, true);

function positionHoverPreview() {
  const anchor = state.preview.anchorEl;
  if (!anchor) return;
  const rect = anchor.getBoundingClientRect();
  const gap = parseFloat(getComputedStyle(galleryEl).gap || '12') || 12;
  // 目标高度：约两卡高
  const targetH = rect.height * 2 + gap;
  const ar = (hpImg.naturalWidth && hpImg.naturalHeight) ? (hpImg.naturalWidth / hpImg.naturalHeight) : 1.6;
  const desiredWidth = Math.max(rect.width * 2 + gap, Math.ceil(targetH * ar));
  const maxWidth = Math.min(desiredWidth, window.innerWidth - 32);
  hoverPreview.style.width = `${maxWidth}px`;
  // 限制图片最大高度为两卡高（再夹紧到视口）
  const maxImgH = Math.min(targetH, window.innerHeight - 160);
  hpImg.style.maxHeight = `${maxImgH}px`;

  // 计算预览高度（包含头部），用于上下判断
  const pvRect = hoverPreview.getBoundingClientRect();
  const pvH = Math.max(pvRect.height, maxImgH + 56); // 预估头部高度 + 内边距
  const spaceAbove = rect.top - 16;
  const spaceBelow = window.innerHeight - rect.bottom - 16;
  // 优先选择空间更充足的一侧；若下方不足，则放到上方
  let top;
  if (spaceBelow < pvH && spaceAbove >= 100) {
    // 放到卡片上方
    top = rect.top - pvH - gap;
  } else {
    // 放到卡片下方或同一水平线上（顶部对齐）
    top = Math.max(16, rect.top);
  }
  // 夹紧到视口
  const maxTop = window.innerHeight - pvH - 16;
  hoverPreview.style.top = `${Math.max(16, Math.min(top, maxTop))}px`;

  // 左右位置紧贴卡片侧边，并避免溢出
  let left;
  if (state.preview.side === 'right') {
    left = rect.right + gap;
    if (left + maxWidth + 16 > window.innerWidth) {
      state.preview.side = 'left';
      left = rect.left - gap - maxWidth;
    }
  } else {
    left = rect.left - gap - maxWidth;
    if (left < 16) {
      state.preview.side = 'right';
      left = rect.right + gap;
    }
  }
  left = Math.max(16, Math.min(left, window.innerWidth - maxWidth - 16));
  hoverPreview.style.left = `${left}px`;
}

function closePreview() {
  cancelScheduledPreviewClose();
  state.preview.pointerOnPanel = false;
  state.preview.requestToken = Number(state.preview.requestToken || 0) + 1;
  state.preview.pendingWorkId = '';
  state.preview.active = false;
  hoverPreview.classList.add('hidden');
}

if (hoverPreview) {
  hoverPreview.addEventListener('mouseenter', () => {
    state.preview.pointerOnPanel = true;
    cancelScheduledPreviewClose();
  });
  hoverPreview.addEventListener('mouseleave', () => {
    state.preview.pointerOnPanel = false;
    schedulePreviewClose();
  });
}

// 在详情页内平滑滚动到指定 JSON 框，考虑粘性头部的高度
function scrollJsonIntoView(boxEl) {
  try {
    const headerEl = detailView.querySelector('.detail-header');
    const offset = headerEl ? headerEl.offsetHeight : 0;
    const top = Math.max(0, boxEl.offsetTop - offset - 8);
    detailView.scrollTo({ top, behavior: 'smooth' });
  } catch {
    try { boxEl.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' }); } catch { }
  }
}

function getDetailScrollKey(workId) {
  return String(normalizeWorkId(workId));
}

function clearDetailScrollRestoreTimers() {
  try {
    (state.detailScroll.restoreTimers || []).forEach((timer) => clearTimeout(timer));
    state.detailScroll.restoreTimers = [];
  } catch { }
}

function saveCurrentDetailScroll() {
  try {
    if (!detailView || detailView.classList.contains('hidden')) return;
    const key = state.detailScroll.currentWorkId;
    if (!key) return;
    state.detailScroll.byWork.set(key, Math.max(0, Math.round(detailView.scrollTop || 0)));
  } catch { }
}

function restoreDetailScrollForWork(workId) {
  const key = getDetailScrollKey(workId);
  const hasSavedScroll = state.detailScroll.byWork.has(key);
  const y = hasSavedScroll ? Number(state.detailScroll.byWork.get(key) || 0) : 0;
  const apply = () => {
    try {
      if (state.detailScroll.currentWorkId !== key) return;
      state.detailScroll.isRestoring = true;
      detailView.scrollTo({ top: Math.max(0, y), behavior: 'auto' });
      setTimeout(() => { state.detailScroll.isRestoring = false; }, 50);
    } catch {
      try { detailView.scrollTop = Math.max(0, y); } catch { }
      state.detailScroll.isRestoring = false;
    }
  };
  clearDetailScrollRestoreTimers();
  try { requestAnimationFrame(apply); } catch { apply(); }
  if (!hasSavedScroll || y <= 0) return;
  // 图片加载会改变详情页高度，多补几次定位，避免恢复位置被布局变化吞掉。
  try {
    state.detailScroll.restoreTimers = [80, 280, 900].map((delay) => setTimeout(apply, delay));
  } catch { }
}

let detailScrollSaveRaf = 0;
if (detailView) {
  detailView.addEventListener('scroll', () => {
    if (detailScrollSaveRaf) return;
    detailScrollSaveRaf = requestAnimationFrame(() => {
      detailScrollSaveRaf = 0;
      if (!state.detailScroll.isRestoring) {
        clearDetailScrollRestoreTimers();
      }
      saveCurrentDetailScroll();
    });
  }, { passive: true });
}

// 键盘翻页
window.addEventListener('keydown', (e) => {
  if (!state.preview.active) return;
  if (e.key === 'ArrowRight' || e.key === 'PageDown') {
    if (state.preview.images.length) {
      state.preview.index = (state.preview.index + 1) % state.preview.images.length;
      hpImg.src = state.preview.images[state.preview.index];
    }
  } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
    if (state.preview.images.length) {
      state.preview.index = (state.preview.index - 1 + state.preview.images.length) % state.preview.images.length;
      hpImg.src = state.preview.images[state.preview.index];
    }
  } else if (e.key === 'Escape') {
    closePreview();
  }
});

// 在预览激活时拦截滚轮，防止页面滚动，并实现图片翻页
function onWheel(e) {
  if (!state.preview.active) return;
  e.preventDefault();
  e.stopPropagation();
  const len = state.preview.images.length;
  if (!len) return;
  const dir = e.deltaY > 0 ? 1 : -1;
  state.preview.index = (state.preview.index + dir + len) % len;
  hpImg.src = state.preview.images[state.preview.index];
}
window.addEventListener('wheel', onWheel, { passive: false });

// 在滚动或窗口尺寸变化时，预览面板跟随卡片重新定位
window.addEventListener('resize', () => {
  if (!shouldEnableHoverPreview()) {
    if (state.preview.active) closePreview();
    return;
  }
  if (state.preview.active) positionHoverPreview();
});
window.addEventListener('scroll', () => { if (state.preview.active) positionHoverPreview(); }, { passive: true });

async function openDetail(workId) {
  // Stop any list hover preview as soon as navigation starts. The list stays
  // mounted underneath the fixed detail view for scroll restoration, so the
  // global pointer handler must not leave an old preview visible during the
  // detail transition.
  closePreview();
  const detailRequestToken = Number(state.detailRequestToken || 0) + 1;
  state.detailRequestToken = detailRequestToken;
  const detailRequestIsCurrent = () => Number(state.detailRequestToken || 0) === detailRequestToken;
  // Card navigation is an overlay over the existing list. Capture the list
  // URL/scroll position before the async authorization and detail fetch so a
  // later return cannot fall back to the home-page top.
  try {
    const currentPath = String(window.location.pathname || '/');
    if (detailView.classList.contains('hidden') && !currentPath.startsWith('/i/')) {
      state.listReturnSnapshot = captureListReturnSnapshot();
    }
  } catch { }
  saveCurrentDetailScroll();
  state.detailScroll.currentWorkId = getDetailScrollKey(workId);
  if (sensitiveContentBlockEnabled()) await ensureSensitiveSessionForIntent(false, { forceRevalidate: true });
  if (!detailRequestIsCurrent()) return;
  let accessCode = sensitiveAccessCodeForWork(workId);
  if (accessCode) setWorkFlags(workId, { sensitiveAccessCode: accessCode });
  try { detailView.classList.remove('blocked-detail'); } catch { }
  const detailPath = accessCode
    ? `/i/${encodeURIComponent(String(workId))}?sensitive_code=${encodeURIComponent(accessCode)}`
    : `/i/${encodeURIComponent(String(workId))}`;
  let alreadyAtThisDetail = false;
  try {
    const currentPath = String(window.location.pathname || '');
    const currentId = currentPath.startsWith('/i/')
      ? decodeURIComponent(currentPath.slice(3).split('/')[0])
      : '';
    alreadyAtThisDetail = currentId === String(workId);
  } catch { }
  if (!alreadyAtThisDetail) {
    history.pushState({ view: 'detail', workId, returnState: state.listReturnSnapshot }, '', withLangParam(detailPath));
  } else if (state.listReturnSnapshot && !(history.state && history.state.returnState)) {
    try {
      history.replaceState({ ...(history.state || {}), view: 'detail', workId, returnState: state.listReturnSnapshot }, '', withLangParam(detailPath));
    } catch { }
  }
  try {
    const data = await fetchWork(workId);
    if (!detailRequestIsCurrent()) return;
    try { rememberWorkFlagsFromDetail(data); } catch { }
    const detailWorkForDisplay = (data && data.work) || { id: workId };
    if (workHasR18Tag(detailWorkForDisplay) && !state.showR18) {
      // The list filter cannot protect a copied/cached /i route. Apply the
      // same user setting after loading the unchanged work metadata, without
      // altering the /api/work response or its CDN cache.
      detailView.classList.add('blocked-detail');
      if (state.listReturnSnapshot) {
        restoreListAfterDetail(state.listReturnSnapshot);
      } else {
        try { history.replaceState({ view: 'list' }, '', withLangParam('/')); } catch { }
      }
      return;
    }
    const sensitive = isSensitiveWorkData(data);
    const taggedSensitive = workHasSensitiveTagData(detailWorkForDisplay);
    if (sensitive && !accessCode && taggedSensitive && !state.directDetail) {
      const inSiteSearch = sensitiveSearchCanProceed();
      // Keep the display intent eligible throughout a transient session
      // failure; the retry helper will revalidate the cookie and mint the
      // per-work code instead of immediately sending the user back to the list.
      const accessIntent = inSiteSearch
        ? 'site-search'
        : ((sensitiveDisplayCanProceed() || sensitiveDisplaySessionActive()) ? 'display' : '');
      if (accessIntent) {
        accessCode = await ensureSensitiveWorkAccessCodeWithRetry(
          (data && data.work) || { id: workId },
          null,
          { intent: accessIntent },
        );
        if (!detailRequestIsCurrent()) return;
      }
      if (accessCode) {
        const qualifiedPath = `/i/${encodeURIComponent(String(workId))}?sensitive_code=${encodeURIComponent(accessCode)}`;
        history.replaceState({ view: 'detail', workId, returnState: state.listReturnSnapshot }, '', withLangParam(qualifiedPath));
      }
    }
    // Tagged sensitive works still require a per-work code. Positive-metadata
    // works may have no code because their sensitivity is discovered only
    // after the cached detail is fetched; the validated display cookie is the
    // in-site authorization for that case. A copied direct URL remains gated
    // by the server-side /i route.
    const displayCookieAuthorized = sensitiveDisplaySessionActive();
    if (sensitive && ((!accessCode && !displayCookieAuthorized)
        || (taggedSensitive && !accessCode))) {
      detailView.classList.add('blocked-detail');
      if (state.listReturnSnapshot) {
        restoreListAfterDetail(state.listReturnSnapshot);
      } else {
        try { history.replaceState({ view: 'list' }, '', withLangParam('/')); } catch { }
      }
      return;
    }
    try {
      const authorIdRaw = getAuthorInfo(data.work || {}, data.images || []).id;
      const authorId = authorIdRaw ? Number(authorIdRaw) : Number.NaN;
      const cfg = await getConfig();
      if (!detailRequestIsCurrent()) return;
      const blob = cfg.blacklist_authors_blob || {};
      const set = await decodeBlacklistSet(blob);
      if (set.size && !Number.isNaN(authorId) && set.has(authorId)) {
        detailView.classList.add('blocked-detail');
        if (state.listReturnSnapshot) {
          restoreListAfterDetail(state.listReturnSnapshot);
        } else {
          try { history.replaceState({ view: 'list' }, '', withLangParam('/')); } catch { }
        }
        return;
      }
      if (getWorkFlags(workId).sensitiveContent && sensitiveAccessCodeForWork(workId)) {
        updateSensitiveWorkLinks(workId);
      }
    } catch { }
    const w = data.work || {};
    const nonStandardComfy = isNonStandardComfyuiWork(data);
    try { applyWorkSeo(workId, w, data.images || []); } catch { }
    detailTitle.textContent = (w.title && String(w.title).trim()) ? w.title : t('work_fallback', { id: workId });
    // 直达详情页：在标题左侧添加可点击返回首页的图标
    try {
      const detailHeader = document.querySelector('.detail-header');
      let homeLink = document.getElementById('detailHomeLink');
      if (state.directDetail) {
        if (!homeLink && detailHeader) {
          homeLink = document.createElement('a');
          homeLink.id = 'detailHomeLink';
          homeLink.className = 'home-link';
          homeLink.href = withLangParam('/');
          homeLink.title = t('home_title');
          const img = document.createElement('img');
          img.src = '/favicon.ico';
          img.alt = t('home_alt');
          homeLink.appendChild(img);
          // 插入到标题之前
          detailHeader.insertBefore(homeLink, detailTitle);
        }
        if (homeLink) homeLink.style.display = '';
      } else {
        if (homeLink) homeLink.remove();
      }
    } catch { }
    let typeLink = w.AI_type ? `<a class="chip ${typeClass(w.AI_type)} detail-type-search-link" href="${escapeHtml(makeSearchIntentHref(String(w.AI_type)))}" target="_blank" rel="noopener">${escapeHtml(String(w.AI_type))}</a>` : '';
    const tags = normalizeTags(w.tags);
    const tagTranslations = normalizeTagTranslations(w.tag_translations);
    // 标签链接需要双引号包裹值：/?q="标签"
    const tagLinks = tags.map((tag) => {
      const q = `"${String(tag)}"`;
      const url = makeSearchIntentHref(q);
      const values = tagTranslations.get(String(tag)) || {};
      const translated = typeof TAG_TRANSLATIONS.localizedValue === 'function'
        ? TAG_TRANSLATIONS.localizedValue(values, CURRENT_LANG, tag)
        : '';
      const translatedHtml = translated
        ? `<span class="tag-translation">(${escapeHtml(translated)})</span>`
        : '';
      return `<a class="chip tag-chip" href="${escapeHtml(url)}" target="_blank" rel="noopener"><span class="tag-original">${escapeHtml(tag)}</span>${translatedHtml}</a>`;
    }).join(' ');
    const nonStandardTipHtml = nonStandardComfy ? `
    <div class="dm-row nonstandard-tip-row"><span class="nonstandard-tip">${escapeHtml('*' + t('non_standard_format_tip'))}</span></div>
  ` : '';
    const captionHtml = w.caption ? `
    <div class="dm-row">${escapeHtml(t('dm_caption'))}:</div>
    <div class="dm-caption collapsed" id="dmCaption">${renderCaption(w.caption)}</div>
    <div class="caption-toggle-row"><button id="captionToggleBtn" class="btn outline caption-toggle-btn">${escapeHtml(t('caption_show_all'))}</button></div>
  ` : '';
    // Identity fields are intentionally hidden for non-whitelist users, but
    // must remain available to a currently revalidated whitelist context.
    // This is a presentation-only choice; cached work metadata is unchanged.
    const showIdentityFields = sensitiveContentRegionAllowed() || sensitiveDisplaySessionActive();
    // Keep the established detail-page chip/link presentation. The Pixiv ID
    // is the artwork URL, while the author chip links to the author search.
    const authorLink = showIdentityFields
      ? buildAuthorLinkHtml(w, data.images || [], 'chip author-chip')
      : '';
    const identityRows = showIdentityFields ? `
      <div class="dm-row">${escapeHtml(t('dm_pixiv_id'))}: <a class="chip" href="https://www.pixiv.net/artworks/${encodeURIComponent(String(workId))}" target="_blank" rel="noopener">${escapeHtml(String(workId))}</a></div>
      <div class="dm-row">${escapeHtml(t('dm_author'))}: ${authorLink || escapeHtml(t('dm_unknown'))}</div>
    ` : '';
    const postedStr = w.create_date ? formatDateTime(w.create_date) : '';
    detailMeta.innerHTML = `
      <div class="dm-title">${escapeHtml((w.title && String(w.title).trim()) ? w.title : t('work_fallback', { id: workId }))}</div>
      <div class="dm-row">${escapeHtml(t('dm_type'))}: ${typeLink || escapeHtml(t('dm_unknown'))}</div>
      ${identityRows}
      ${nonStandardTipHtml}
      <div class="dm-row">${escapeHtml(t('dm_tags'))}: ${tagLinks || `<span class="no-tags">${escapeHtml(t('dm_none'))}</span>`}</div>
      ${captionHtml}
      <div class="dm-row">${escapeHtml(t('dm_posted_at'))}: ${postedStr ? escapeHtml(postedStr) : escapeHtml(t('dm_unknown'))}</div>
      <div class="dm-row small">${escapeHtml(t('dm_views'))}: ${w.total_view ?? ''} · ${escapeHtml(t('dm_bookmarks'))}: ${w.total_bookmarks ?? ''}</div>
      ${['nai', 'sd', 'comfyui'].includes(String(w.AI_type || '').toLowerCase()) ? `
      <div class="ai-mode-row">
        <span class="ai-mode-label">${escapeHtml(t('ai_meta_mode'))}:</span>
        <div class="ai-mode-tabs" id="aiModeToggle" data-mode="readable" role="tablist" aria-label="${escapeHtml(t('ai_meta_mode'))}">
          <button class="ai-mode-tab" type="button" data-value="readable" role="tab">${escapeHtml(t('ai_meta_readable'))}</button>
          <button class="ai-mode-tab" type="button" data-value="json" role="tab">${escapeHtml(t('ai_meta_raw'))}</button>
          ${String(w.AI_type || '').toLowerCase() === 'nai' ? `<button class="ai-mode-tab" type="button" data-value="instruction" role="tab">${escapeHtml(t('ai_meta_instruction'))}</button>` : ''}
        </div>
      </div>` : ''}
      <div class="download-row">
        <button id="downloadAllBtn" class="btn">${escapeHtml(t('copy_all_image_links'))}</button>
      </div>
    `;
    wireAuthorSearchLinks(detailMeta);
    try {
      detailMeta.querySelectorAll('.detail-type-search-link').forEach((link) => {
        const typeQuery = String(link.textContent || '').trim();
        if (!typeQuery) return;
        link.addEventListener('click', (event) => {
          if (event.button != null && event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          openSearchIntentInNewWindow(typeQuery);
        });
        link.addEventListener('auxclick', (event) => {
          if (event.button !== 1) return;
          event.preventDefault();
          event.stopPropagation();
          openSearchIntentInNewWindow(typeQuery);
        });
      });
    } catch { }
    // Tag clicks are genuine in-site search intents, including new-window
    // clicks. Open a clean homepage and submit through its search controls;
    // copied links still hit the direct-query defense.
    try {
      detailMeta.querySelectorAll('.tag-chip').forEach((link) => {
        const original = link.querySelector('.tag-original');
        const rawTag = String(original ? original.textContent : '').trim();
        if (!rawTag) return;
        const tagQuery = `"${rawTag}"`;
        link.addEventListener('click', (event) => {
          if (event.button != null && event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          openSearchIntentInNewWindow(tagQuery);
        });
        link.addEventListener('auxclick', (event) => {
          if (event.button !== 1) return;
          event.preventDefault();
          event.stopPropagation();
          openSearchIntentInNewWindow(tagQuery);
        });
      });
    } catch { }
    try {
      const downloadRow = detailMeta.querySelector('.download-row');
      const detailAd = createAdElement('detail');
      if (downloadRow && detailAd) {
        detailAd.dataset.insertSlot = 'detail';
        downloadRow.after(detailAd);
      }
    } catch { }
    // 简介折叠/展开按钮逻辑：默认折叠为 5 行，溢出时显示按钮
    try {
      const captionEl = document.getElementById('dmCaption');
      const toggleBtn = document.getElementById('captionToggleBtn');
      if (captionEl && toggleBtn) {
        requestAnimationFrame(() => {
          const overflow = captionEl.scrollHeight > captionEl.clientHeight + 1;
          toggleBtn.style.display = overflow ? '' : 'none';
        });
        toggleBtn.addEventListener('click', () => {
          const collapsed = captionEl.classList.contains('collapsed');
          captionEl.classList.toggle('collapsed', !collapsed);
          toggleBtn.textContent = collapsed ? t('caption_collapse') : t('caption_show_all');
        });
      }
    } catch { }
    const downloadAllBtn = document.getElementById('downloadAllBtn');
    const aiModeToggle = document.getElementById('aiModeToggle');
    // 根据进入方式控制返回按钮显示
    backBtn.style.display = state.directDetail ? 'none' : '';
    // 重置本作品的 JSON 框注册与状态
    detailJsonBoxes = [];
    detailJsonExpanded = false;
    detailMetadataMode = 'json';
    detailImages.innerHTML = '';
    // 详情页图片按 _pN 升序排序
    (data.images || []).slice().sort((a, b) => getPageIndex(a) - getPageIndex(b)).forEach((img) => {
      const workType = String((data.work || {}).AI_type || '').toLowerCase();
      const supportsReadableMetadata = ['nai', 'sd', 'comfyui'].includes(workType);
      const card = document.createElement('div');
      card.className = 'img-card';
      const imageEl = document.createElement('img');
      imageEl.loading = 'lazy';
      imageEl.src = buildImageUrl(img);
      card.appendChild(imageEl);
      // 每张图片的 AI JSON 独立显示框（折叠态统一可见高度，框内半透明按钮）
      const jsonBox = document.createElement('div');
      jsonBox.className = 'json-box';
      // 初始为折叠态，统一高度由样式控制
      jsonBox.classList.add('collapsed');
      // 根据作品 AI 类型为 JSON 框附加类名（sd/nai/comfyui），以便差异化颜色
      try {
        const wtype = (data.work || {}).AI_type || '';
        const cls = typeClass(wtype);
        if (cls) jsonBox.classList.add(cls);
      } catch { }
      let pretty = '';
      let objForDetection = null;
      try {
        const obj = typeof img.ai_json === 'string' ? JSON.parse(img.ai_json) : img.ai_json || {};
        objForDetection = obj;
        pretty = JSON.stringify(obj, null, 2);
      } catch {
        pretty = String(img.ai_json || '');
      }
      const copyJsonText = String(pretty);

      // --- 限制显示长度（100KB），过长则截断并提示 ---
      const MAX_DISPLAY_LEN = 100 * 1024; // 100KB
      let displayText = copyJsonText;
      let isTruncated = false;
      if (displayText.length > MAX_DISPLAY_LEN) {
        displayText = displayText.slice(0, MAX_DISPLAY_LEN) + '\n\n... (AI metadata too large, truncated) ...';
        isTruncated = true;
      }

      const displayHtml = syntaxHighlight(displayText.replace(/\\n/g, '\n'));
      const fullHtml = syntaxHighlight(copyJsonText.replace(/\\n/g, '\n')); // 完整版 HTML (用于“显示完整”时切换)

      const preEl = document.createElement('pre');
      preEl.className = 'json-content metadata-raw-view';
      preEl.innerHTML = displayHtml;

      let humanEl = null;
      let humanText = '';
      if (supportsReadableMetadata && window.AIMetadata && window.AIMetadataView) {
        try {
          const view = window.AIMetadata.format(
            objForDetection || img.ai_json || {},
            workType,
            { model: img.model || '' }
          );
          if (!view.skipped) {
            humanEl = document.createElement('div');
            humanEl.className = 'json-content ai-metadata-view';
            humanEl.appendChild(window.AIMetadataView.render(view, { lang: CURRENT_LANG }));
            humanText = window.AIMetadata.toText(view, CURRENT_LANG);
          }
        } catch (error) {
          console.warn('AI metadata readable view failed', error);
        }
      }
      if (humanEl) preEl.classList.add('hidden');

      const actionsEl = document.createElement('div');
      actionsEl.className = 'json-actions';

      // 如果被截断，添加“显示完整”按钮
      let loadFullBtn = null;
      if (isTruncated) {
        loadFullBtn = document.createElement('button');
        loadFullBtn.className = 'btn ghost';
        loadFullBtn.textContent = t('show_full_meta') || 'Show Full Metadata';
        loadFullBtn.style.marginRight = '8px';
        if (humanEl) loadFullBtn.style.display = 'none';
        loadFullBtn.onclick = () => {
          preEl.innerHTML = fullHtml;
          jsonBox._rawExpanded = true;
          loadFullBtn.remove(); // 点击后移除自身
          // 重新判断高度逻辑（因为内容变长了）
          setTimeout(() => checkHeight(), 50);
        };
        actionsEl.appendChild(loadFullBtn);
      }

      const copyBtn = document.createElement('button');
      copyBtn.className = 'btn ghost';
      copyBtn.textContent = t('copy_json');
      // 为后续指令切换准备原始/指令文本
      jsonBox._fullText = copyJsonText;
      jsonBox._fullHtml = fullHtml;
      jsonBox._displayHtml = displayHtml;
      jsonBox._rawExpanded = false;
      jsonBox._humanText = humanText;
      let instructionText = '';
      try {
        if (jsonBox.classList.contains('nai') && window.NAI && typeof window.NAI.convert === 'function') {
          const res = window.NAI.convert(objForDetection || {});
          instructionText = (res && res.txt) ? String(res.txt) : '';
        }
      } catch { }
      jsonBox._instructionText = instructionText || copyJsonText;
      copyBtn.dataset.mode = humanEl ? 'readable' : 'json';
	  jsonBox._readableSubview = 'readable';
	  let viewToggleBtn = null;
	  const applyReadableSubview = (subview) => {
	    if (!humanEl) return;
	    const showJson = subview === 'json';
	    jsonBox._readableSubview = showJson ? 'json' : 'readable';
	    humanEl.classList.toggle('hidden', showJson);
	    preEl.classList.toggle('hidden', !showJson);
	    if (showJson) {
	      preEl.innerHTML = jsonBox._rawExpanded
	        ? (jsonBox._fullHtml || '')
	        : (jsonBox._displayHtml || '');
	    }
	    if (copyBtn) {
	      copyBtn.dataset.mode = showJson ? 'json' : 'readable';
	      copyBtn.textContent = showJson ? t('copy_json') : t('copy_readable');
	    }
	    if (viewToggleBtn) {
	      viewToggleBtn.textContent = showJson ? t('show_readable') : t('show_json');
	      viewToggleBtn.setAttribute('aria-pressed', showJson ? 'true' : 'false');
	    }
	    if (loadFullBtn && loadFullBtn.isConnected) loadFullBtn.style.display = showJson ? '' : 'none';
	    requestAnimationFrame(() => checkHeight());
	  };
	  jsonBox._applyReadableSubview = applyReadableSubview;
	  if (humanEl) {
	    viewToggleBtn = document.createElement('button');
	    viewToggleBtn.type = 'button';
	    viewToggleBtn.className = 'btn ghost json-view-toggle';
	    viewToggleBtn.style.display = 'none';
	    viewToggleBtn.addEventListener('click', () => {
	      applyReadableSubview(jsonBox._readableSubview === 'json' ? 'readable' : 'json');
	    });
	    actionsEl.appendChild(viewToggleBtn);
	  }
      // 复制：根据当前模式复制易读内容、JSON 或 NAI 指令
      copyBtn.addEventListener('click', async () => {
        const mode = copyBtn.dataset.mode || 'json';
        const text = mode === 'readable'
          ? (jsonBox._humanText || '')
          : mode === 'instruction'
            ? (jsonBox._instructionText || '')
            : (jsonBox._fullText || '');
        let copied = false;
        try {
          await navigator.clipboard.writeText(text);
          copied = true;
        } catch (e) {
          // Safari/iOS 等环境降级：使用隐藏 textarea + execCommand('copy')
          try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.top = '-1000px';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            copied = document.execCommand('copy');
            document.body.removeChild(ta);
            if (!copied) {
              alert(t('copy_failed_manual') + text);
            }
          } catch {
            alert(t('copy_failed_manual') + text);
          }
        }
        copyBtn.textContent = copied ? t('copied') : t('copy_failed');
        setTimeout(() => {
          const activeMode = copyBtn.dataset.mode || 'json';
          copyBtn.textContent = activeMode === 'readable'
            ? t('copy_readable')
            : activeMode === 'instruction' ? t('copy_instruction') : t('copy_json');
        }, 1500);
      });
      actionsEl.appendChild(copyBtn);
      jsonBox.appendChild(actionsEl);
      // NAI 模型/类型头部（仅对 NAI 类型图片显示；不参与复制 JSON）
      try {
        const wtypeLower = String((data.work || {}).AI_type || '').toLowerCase();
        if (wtypeLower === 'comfyui' && nonStandardComfy) {
          const headerEl = document.createElement('div');
          headerEl.className = 'json-header';
          const flagEl = document.createElement('span');
          flagEl.className = 'naix-label nonstandard-flag';
          flagEl.textContent = t('non_standard_format_bracket');
          flagEl.title = t('non_standard_format_tip');
          headerEl.appendChild(flagEl);
          jsonBox.appendChild(headerEl);
          jsonBox.classList.add('has-header');
        }
        if ((wtypeLower === 'nai' || wtypeLower === 'nai_x') && window.NAI && typeof window.NAI.detect === 'function') {
          const det = window.NAI.detect(objForDetection || copyJsonText);
          if (det && det.version && det.type) {
            const headerEl = document.createElement('div');
            headerEl.className = 'json-header';
            if (window.NAIX && typeof window.NAIX.suspect === 'function') {
              try {
                const imageType = img.image_type || img.AI_type || (data.work || {}).AI_type || '';
                const suspect = !!window.NAIX.suspect(objForDetection || copyJsonText, imageType);
                if (suspect) {
                  const suspectEl = document.createElement('span');
                  suspectEl.className = 'naix-label';
                  suspectEl.textContent = t('naix_suspect_bracket');
                  headerEl.appendChild(suspectEl);
                }
              } catch { }
            }
            const modelEl = document.createElement('span');
            modelEl.className = 'json-header-line model';
            modelEl.textContent = `Model:${det.version}`;
            const typeEl = document.createElement('span');
            typeEl.className = 'json-header-line type';
            typeEl.textContent = `Type:${det.type}`;
            headerEl.appendChild(modelEl);
            headerEl.appendChild(typeEl);
            jsonBox.appendChild(headerEl);
            // 标记有头部，以便样式为内容增加顶部空白（避免遮挡）
            jsonBox.classList.add('has-header');
          }
        }
      } catch { }
      // 底部居中“显示全部/折叠”按钮
      const bottomEl = document.createElement('div');
      bottomEl.className = 'json-bottom';
      const showAllBtn = document.createElement('button');
      showAllBtn.className = 'btn ghost';
      showAllBtn.textContent = t('show_all');
      showAllBtn.addEventListener('click', () => {
        // 切换全局展开/折叠状态，并同步所有 JSON 框样式与按钮文案
        detailJsonExpanded = !detailJsonExpanded;
        if (detailMetadataMode === 'readable') {
          setReadableMetadataExpanded(detailJsonExpanded);
        }
        detailJsonBoxes.forEach((box) => {
          // 短内容没有按钮，跳过折叠/展开切换
          if (box.btn && box.btn.style.display === 'none') return;
          if (detailJsonExpanded) {
            box.boxEl.classList.remove('collapsed');
            box.btn.textContent = t('collapse');
          } else {
            box.boxEl.classList.add('collapsed');
            box.btn.textContent = t('show_all');
          }
        });
        // 等待布局完成后，将视图定位到触发按钮所在的 JSON 框
        setTimeout(() => scrollJsonIntoView(jsonBox), 0);
      });
      bottomEl.appendChild(showAllBtn);
      if (humanEl) jsonBox.appendChild(humanEl);
      jsonBox.appendChild(preEl);
      jsonBox.appendChild(bottomEl);
      card.appendChild(jsonBox);
      // 根据内容高度决定显示逻辑：短内容收回底部留白并隐藏按钮；长内容保持折叠固定高度
      function checkHeight() {
        try {
          const maxH = 320;
          const activeEl = humanEl && !humanEl.classList.contains('hidden') ? humanEl : preEl;
          const h = activeEl.scrollHeight; // 当前模式的实际内容高度
          const isShort = h <= maxH;
          if (isShort) {
            // 短内容：不需要“显示全部”，收回底部留白
            showAllBtn.style.display = 'none';
            bottomEl.style.display = 'none';
            jsonBox.classList.remove('collapsed');
            jsonBox.classList.add('short');
          } else {
            // 长内容：保留固定高度与按钮
            showAllBtn.style.display = '';
            bottomEl.style.display = '';
            jsonBox.classList.remove('short');
            if (detailJsonExpanded) {
              jsonBox.classList.remove('collapsed');
              showAllBtn.textContent = t('collapse');
            } else {
              jsonBox.classList.add('collapsed');
              showAllBtn.textContent = t('show_all');
            }
          }
        } catch { }
      }
      // 注册到全局列表，便于统一切换
      detailJsonBoxes.push({
        boxEl: jsonBox,
        preEl,
        humanEl,
        btn: showAllBtn,
        copyBtn,
	    viewToggleBtn,
	    applyReadableSubview,
        loadFullBtn,
        supportsReadableMetadata,
        checkHeight
      });
      setTimeout(checkHeight, 0);
      detailImages.appendChild(card);
    });
    try {
      const wtype = String((data.work || {}).AI_type || '').toLowerCase();
      if ((wtype === 'nai' || wtype === 'nai_x' || wtype === 'sd' || wtype === 'comfyui') && window.NAIX && typeof window.NAIX.suspectWork === 'function') {
        const isSuspect = !!window.NAIX.suspectWork(data);
        const meta = document.getElementById('detailMeta');
        if (meta) {
          const oldFlag = meta.querySelector('.chip.naix-flag');
          if (oldFlag) oldFlag.remove();
        }
        if (isSuspect && meta) {
          const typeChip = meta.querySelector(`.chip.${typeClass(wtype)}`);
          if (typeChip) {
            const flag = document.createElement('span');
            flag.className = 'chip naix-flag';
            flag.textContent = t('naix_suspect_paren');
            typeChip.after(flag);
          }
        }
      }
    } catch { }
    try {
      const wtype = String((data.work || {}).AI_type || '').toLowerCase();
      const meta = document.getElementById('detailMeta');
      if (meta) {
        const oldFlag = meta.querySelector('.chip.nonstandard-flag');
        if (oldFlag) oldFlag.remove();
      }
      if (wtype === 'comfyui' && meta && isNonStandardComfyuiWork(data)) {
        const typeChip = meta.querySelector('.chip.comfyui');
        if (typeChip) {
          const flag = document.createElement('span');
          flag.className = 'chip naix-flag nonstandard-flag';
          flag.textContent = t('non_standard_format_paren');
          flag.title = t('non_standard_format_tip');
          typeChip.after(flag);
        }
      }
    } catch { }
    // AI 元数据模式：易读 / 原始 JSON / NAI 指令，全局持久化。
    if (aiModeToggle) {
      const getStoredMode = () => {
        try {
          const value = localStorage.getItem('aiMetadataModeV2') || 'readable';
          return ['readable', 'json', 'instruction'].includes(value) ? value : 'readable';
        } catch {
          return 'readable';
        }
      };
      const setStoredMode = (m) => { try { localStorage.setItem('aiMetadataModeV2', m); } catch { } };
      const allowedModes = String((data.work || {}).AI_type || '').toLowerCase() === 'nai'
        ? ['readable', 'json', 'instruction']
        : ['readable', 'json'];
      const normalizeMode = (mode) => allowedModes.includes(mode) ? mode : 'readable';
      const applyModeToBoxes = (mode) => {
        detailJsonBoxes.forEach((box) => {
          try {
            if (!box || !box.boxEl || !box.preEl) return;
            if (!box.supportsReadableMetadata || !box.humanEl) return;
            if (mode === 'instruction') {
              box.humanEl.classList.add('hidden');
              box.preEl.classList.remove('hidden');
	          if (box.viewToggleBtn) box.viewToggleBtn.style.display = 'none';
              box.preEl.textContent = box.boxEl._instructionText || '';
              if (box.copyBtn) { box.copyBtn.textContent = t('copy_instruction'); box.copyBtn.dataset.mode = 'instruction'; }
              if (box.loadFullBtn && box.loadFullBtn.isConnected) box.loadFullBtn.style.display = 'none';
            } else if (mode === 'readable') {
	          if (box.viewToggleBtn) box.viewToggleBtn.style.display = '';
	          if (typeof box.applyReadableSubview === 'function') box.applyReadableSubview('readable');
            } else {
	          box.humanEl.classList.add('hidden');
	          box.preEl.classList.remove('hidden');
	          if (box.viewToggleBtn) box.viewToggleBtn.style.display = 'none';
              box.preEl.innerHTML = box.boxEl._rawExpanded
                ? (box.boxEl._fullHtml || '')
                : (box.boxEl._displayHtml || '');
              if (box.copyBtn) { box.copyBtn.textContent = t('copy_json'); box.copyBtn.dataset.mode = 'json'; }
              if (box.loadFullBtn && box.loadFullBtn.isConnected) box.loadFullBtn.style.display = '';
            }
            requestAnimationFrame(() => box.checkHeight && box.checkHeight());
          } catch { }
        });
      };
      let currentMode = normalizeMode(getStoredMode());
      const applyExpansionPreference = (mode) => {
        detailMetadataMode = mode;
        detailJsonExpanded = mode === 'readable' ? getReadableMetadataExpanded() : false;
      };
      applyExpansionPreference(currentMode);
      const setUi = (mode) => {
        aiModeToggle.setAttribute('data-mode', mode);
        aiModeToggle.querySelectorAll('.ai-mode-tab').forEach((button) => {
          const active = button.dataset.value === mode;
          button.classList.toggle('active', active);
          button.setAttribute('aria-selected', active ? 'true' : 'false');
          button.tabIndex = active ? 0 : -1;
        });
      };
      setUi(currentMode);
      applyModeToBoxes(currentMode);
      const onSelect = (m) => {
        m = normalizeMode(m);
        if (m === currentMode) return;
        currentMode = m;
        applyExpansionPreference(currentMode);
        setUi(currentMode);
        setStoredMode(currentMode);
        applyModeToBoxes(currentMode);
      };
      aiModeToggle.querySelectorAll('.ai-mode-tab').forEach((button) => {
        button.addEventListener('click', () => onSelect(button.dataset.value || 'readable'));
      });
    }
    // 将当前作品全部图片链接复制到剪贴板（适配 Chrome/Firefox/Safari，含移动端降级方案）
    downloadAllBtn.addEventListener('click', async () => {
      const urls = (data.images || []).slice().sort((a, b) => getPageIndex(a) - getPageIndex(b)).map((img) => buildImageUrl(img)).filter(Boolean);
      if (!urls.length) {
        downloadAllBtn.textContent = t('no_links_to_copy');
        setTimeout(() => { downloadAllBtn.textContent = t('copy_all_image_links'); }, 1500);
        return;
      }
      const text = urls.join('\n');
      let copied = false;
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch (e) {
        // Safari/iOS 等环境的降级复制方案
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.top = '-1000px';
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          copied = document.execCommand('copy');
          document.body.removeChild(ta);
          if (!copied) {
            alert(t('copy_failed_manual') + text);
          }
        } catch {
          alert(t('copy_failed_manual') + text);
        }
      }
      downloadAllBtn.textContent = copied ? t('copied_n_links', { n: urls.length }) : t('copy_failed_popup');
      setTimeout(() => { downloadAllBtn.textContent = t('copy_all_image_links'); }, 2000);
    });
    if (!detailRequestIsCurrent()) return;
    detailView.classList.remove('hidden');
    restoreDetailScrollForWork(workId);
	    closePreview();
	  } catch { }
}

backBtn.addEventListener('click', () => {
  saveCurrentDetailScroll();
  // The detail view is a history entry layered over the list. Going back to
  // that entry lets the browser and our popstate handler share one restore
  // path, and avoids adding a duplicate "/" entry on every click.
  try {
    if (state.listReturnSnapshot && String(window.location.pathname || '').startsWith('/i/')) {
      history.back();
      return;
    }
  } catch { }
  restoreListAfterDetail();
});

function triggerSearch() {
  // 重置列表与滚动状态
  state.listGeneration = Number(state.listGeneration || 0) + 1;
  // Keep a still-valid display/search cookie across ordinary in-site searches.
  // The session is already bound to the current IP, country, browser language
  // and host by the server; invalidating it here forced a second POST on every
  // search even when the three-hour cookie was fresh. Boundary fetches still
  // revalidate near expiry and invalidate on a context mismatch.
  if (state.sensitiveAccessSession
      && sensitiveAccessSessionContextKey
      && sensitiveAccessSessionContextKey !== sensitiveAccessContextKey()) {
    invalidateSensitiveAccessSession();
  }
  const normalizedSearch = normalizeSearchInputs(qInput.value, promptInput.value);
  state.q = normalizedSearch.q;
  state.prompt = normalizedSearch.prompt;
  try { state.searchWorkAccessCodes.clear(); } catch { state.searchWorkAccessCodes = new Map(); }
  // A pasted code is an optional per-work authorization hint, never a search
  // credential. Keep it only for an allowlisted browser and attach it only to
  // the exact matching work row returned by the ID search.
  if (normalizedSearch.importedWorkId && normalizedSearch.importedSensitiveCode
      && sensitiveContentRegionAllowed()) {
    state.searchWorkAccessCodes.set(
      normalizeWorkId(normalizedSearch.importedWorkId),
      normalizedSearch.importedSensitiveCode,
    );
  }
  state.exactWorkSearchId = exactWorkSearchId(normalizedSearch.importedWorkId);
  if (state.exactWorkSearchId) {
    if (sortModeSel) sortModeSel.value = 'new';
    if (sortModeSel2) sortModeSel2.value = 'new';
    rebuildTimeOptions();
    if (timeRangeSel) timeRangeSel.value = 'all';
    if (timeRangeSel2) timeRangeSel2.value = 'all';
  }
  qInput.value = state.q;
  promptInput.value = state.prompt;
  try {
    const fcQ = document.getElementById('fcQ');
    const fcPrompt = document.getElementById('fcPrompt');
    if (fcQ) fcQ.value = state.q;
    if (fcPrompt) fcPrompt.value = state.prompt;
  } catch { }
  state.searchIntent = true;
  state.listReturnSnapshot = null;
  state.page = 1;
  state.items = [];
  state.total = 0;
  try { state.workPages.clear(); } catch { }
  loadingPage = false;
  endReached = false;
  lastPageCount = 0;
  if (infiniteObserver) { infiniteObserver.disconnect(); infiniteObserver = null; }
  const oldSentinel = document.getElementById('infiniteSentinel');
  if (oldSentinel) oldSentinel.remove();
  const url = new URL(window.location.href);
  const sensitiveQuery = isSensitiveSearchQuery(state.q, state.prompt);
  if (sensitiveQuery && !sensitiveSearchCanProceed()) {
    // Keep the typed values in the inputs, but do not persist a blocked query
    // in browser history or send it to the API/SSR preview.
    url.searchParams.delete('q');
    url.searchParams.delete('prompt');
    try {
      const mode = (sortModeSel && sortModeSel.value) || (sortModeSel2 && sortModeSel2.value) || 'new';
      const tr = (timeRangeSel && timeRangeSel.value) || (timeRangeSel2 && timeRangeSel2.value) || (mode === 'monthly' ? 'current' : 'all');
      url.searchParams.set('sort', mode);
      url.searchParams.set('time_range', tr);
    } catch { }
    clearSensitiveSearchRefreshMarker();
    url.hash = '';
    history.pushState({ view: 'list', inSiteSearch: true }, '', `${url.pathname}${url.search ? url.search : ''}${url.hash}`);
    showSensitiveSearchBlocked();
    return;
  }
  if (sensitiveQuery) {
    // Keep the sensitive query out of the URL, but retain an opaque,
    // same-origin session marker so an allowlisted user can refresh the
    // successful in-site search. The query itself stays in session storage;
    // a copied marker without that storage record is invalid and fails closed.
    url.searchParams.delete('q');
    url.searchParams.delete('prompt');
    const refreshNonce = persistSensitiveSearchForRefresh(state.q, state.prompt);
    if (refreshNonce) {
      url.hash = `#${SENSITIVE_SEARCH_REFRESH_HASH_KEY}=${encodeURIComponent(refreshNonce)}`;
    } else {
      clearSensitiveSearchRefreshMarker();
    }
  } else {
    clearSensitiveSearchRefreshMarker();
    url.hash = '';
    if (state.q) url.searchParams.set('q', state.q); else url.searchParams.delete('q');
    if (state.prompt) url.searchParams.set('prompt', state.prompt); else url.searchParams.delete('prompt');
  }
  if (state.exactWorkSearchId) url.searchParams.set('search_kind', 'work');
  else url.searchParams.delete('search_kind');
  try {
    const mode = (sortModeSel && sortModeSel.value) || (sortModeSel2 && sortModeSel2.value) || 'new';
    const tr = (timeRangeSel && timeRangeSel.value) || (timeRangeSel2 && timeRangeSel2.value) || (mode === 'monthly' ? 'current' : 'all');
    url.searchParams.set('sort', mode);
    url.searchParams.set('time_range', tr);
  } catch { }
  // Keep the opaque sensitive-search refresh marker in the fragment. It is
  // not sent to the server, but lets the same allowlisted browser restore a
  // successful sensitive search after a page refresh.
  history.pushState({ view: 'list', inSiteSearch: true }, '', `${url.pathname}${url.search}${url.hash}`);
  try { applyHomeSeo(); } catch { }
  // PC端体验：搜索后强制滚动到顶部，便于查看新结果
  try {
    window.scrollTo({ top: 0, behavior: 'instant' });
    // 某些浏览器不支持 'instant'，兜底：
    setTimeout(() => { window.scrollTo(0, 0); }, 0);
  } catch { window.scrollTo(0, 0); }
  try { if (searchStatusEl) searchStatusEl.classList.add('visible'); } catch { }
  fetchWorks();
}
searchBtn.addEventListener('click', triggerSearch);
qInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') triggerSearch(); });
promptInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') triggerSearch(); });
saveBlacklistBtn.addEventListener('click', () => { saveBlacklist(); triggerSearch(); });

window.addEventListener('popstate', (e) => {
  const s = e.state || {};
  state.historySearchIntent = s && s.inSiteSearch === true;
  const path = window.location.pathname || '/';
  if (path.startsWith('/i/')) {
    // Browser forward can revisit a detail entry after its previous back
    // cleared the in-memory snapshot. Rehydrate it from history state.
    if (s && s.returnState) state.listReturnSnapshot = s.returnState;
    const idStr = path.slice(3);
    const id = parseInt(idStr, 10);
    if (!Number.isNaN(id)) {
      openDetail(id);
      return;
    }
  }
  // The detail fetch is asynchronous. Browser Back may arrive while the
  // detail overlay is still hidden, so the snapshot itself is the authority
  // that this is a return to the preserved waterfall list.
  if (state.listReturnSnapshot) {
    restoreListAfterDetail(state.listReturnSnapshot);
    return;
  }
  // Direct-detail navigation has no list snapshot. It still must invalidate a
  // pending fetch before the list router is re-initialized, otherwise the old
  // response can reopen or repopulate the detail view after browser Back.
  state.detailRequestToken = Number(state.detailRequestToken || 0) + 1;
  saveCurrentDetailScroll();
  state.detailScroll.currentWorkId = null;
  clearDetailScrollRestoreTimers();
  detailView.classList.add('hidden');
  try { applyHomeSeo(); } catch { }
  initFromQuery();
});

async function loadConfig() {
  try {
    const res = await fetch(apiUrl(`/api/config?v=${encodeURIComponent(CONFIG_REQUEST_VERSION)}`));
    if (res.ok) {
      let data = {};
      try { data = await res.json(); } catch { data = {}; }
	      CONFIG = { ...CONFIG, ...data };
	      state.pageSize = CONFIG.page_size || state.pageSize;
	      state.listMode = CONFIG.list_mode || 'infinite';
	      scheduleSearchAdPreload();
	      const years = Array.isArray(data.available_years) ? data.available_years : [];
      const months = Array.isArray(data.available_months) ? data.available_months : [];
      if (sortModeSel && sortModeSel.value === 'monthly') {
        rebuildMonthlyOptions(months);
      } else {
        rebuildTimeOptions();
      }
      if (timeRangeSel2 && timeRangeSel) timeRangeSel2.innerHTML = timeRangeSel.innerHTML;
      if (sortModeSel && timeRangeSel) {
        sortModeSel.addEventListener('change', () => {
          const mode = sortModeSel.value || 'new';
          if (mode === 'monthly') {
            const now = new Date(); const y = now.getFullYear(); const m = String(now.getMonth() + 1).padStart(2, '0');
            rebuildMonthlyOptions(months);
            timeRangeSel.value = `m${y}-${m}`;
            if (sortModeSel2) sortModeSel2.value = mode;
            if (timeRangeSel2) timeRangeSel2.value = timeRangeSel.value;
          } else {
            rebuildTimeOptions();
            timeRangeSel.value = 'all';
            if (sortModeSel2) sortModeSel2.value = mode;
            if (timeRangeSel2) timeRangeSel2.value = timeRangeSel.value;
          }
          triggerSearch();
        });
      }
      if (sortModeSel2 && timeRangeSel2) {
        sortModeSel2.addEventListener('change', () => {
          const mode = sortModeSel2.value || 'new';
          if (sortModeSel) sortModeSel.value = mode;
          if (mode === 'monthly') {
            const now = new Date(); const y = now.getFullYear(); const m = String(now.getMonth() + 1).padStart(2, '0');
            rebuildMonthlyOptions(months);
            timeRangeSel2.value = `m${y}-${m}`;
            if (timeRangeSel) timeRangeSel.value = timeRangeSel2.value;
          } else {
            rebuildTimeOptions();
            timeRangeSel2.value = 'all';
            if (timeRangeSel) timeRangeSel.value = timeRangeSel2.value;
          }
          triggerSearch();
        });
      }
      if (timeRangeSel) {
        timeRangeSel.addEventListener('change', () => {
          if (timeRangeSel2) timeRangeSel2.value = timeRangeSel.value;
          triggerSearch();
        });
      }
      if (timeRangeSel2) {
        timeRangeSel2.addEventListener('change', () => {
          if (timeRangeSel) timeRangeSel.value = timeRangeSel2.value;
          triggerSearch();
        });
      }
      applyHomepageAnnouncement(data);
    }
  } catch { }
}

function applyListMode() {
  if (!paginationEl) return;
  if (state.listMode === 'infinite') {
    paginationEl.style.display = 'none';
    // 切换到无限模式时，清理旧观察器
    if (infiniteObserver) { infiniteObserver.disconnect(); infiniteObserver = null; }
    const oldSentinel = document.getElementById('infiniteSentinel');
    if (oldSentinel) oldSentinel.remove();
    if (loadMoreBtn) {
      loadMoreBtn.classList.remove('hidden');
    }
  } else {
    paginationEl.style.display = 'flex';
    if (infiniteObserver) { infiniteObserver.disconnect(); infiniteObserver = null; }
    const oldSentinel = document.getElementById('infiniteSentinel');
    if (oldSentinel) oldSentinel.remove();
    if (loadMoreBtn) {
      loadMoreBtn.classList.add('hidden');
    }
  }
}

function initFromQuery() {
  state.listGeneration = Number(state.listGeneration || 0) + 1;
  const url = new URL(window.location.href);
  const q = url.searchParams.get('q') || '';
  const prompt = url.searchParams.get('prompt') || '';
  const searchKind = String(url.searchParams.get('search_kind') || '').trim().toLowerCase();
  const pageStr = url.searchParams.get('page');
  const sortModeQ = url.searchParams.get('sort') || 'new';
  const timeRangeQ = url.searchParams.get('time_range') || (sortModeQ === 'monthly' ? 'current' : 'all');
  // Keep the request-bound display session available while evaluating a direct
  // q= URL: an already-issued allowlist cookie is the explicit exception to
  // defensive query mode. A plain home navigation still clears the in-memory
  // acknowledgement so it cannot authorize unrelated later navigation.
  if (!url.searchParams.has('q')) {
    state.sensitiveAccessSession = false;
    state.sensitiveAccessSessionExpiresAt = 0;
  }
  state.q = q;
  state.prompt = prompt;
  state.exactWorkSearchId = searchKind === 'work' ? exactWorkSearchId(q) : '';
  state.searchIntent = false;
  const historySearchIntent = state.historySearchIntent === true;
  state.historySearchIntent = false;
  const refreshMarker = (!q && !prompt) ? sensitiveSearchRefreshMarkerFromUrl() : null;
  if (q || prompt) clearSensitiveSearchRefreshMarker();
  if (pageStr) {
    const p = parseInt(pageStr, 10);
    if (!Number.isNaN(p) && p >= 1) state.page = p;
  }
  if (sortModeSel) sortModeSel.value = sortModeQ;
  if (sortModeSel2) sortModeSel2.value = sortModeQ;
  if (sortModeSel && sortModeQ === 'monthly') rebuildMonthlyOptions(CONFIG.available_months || []); else rebuildTimeOptions();
  if (timeRangeSel) timeRangeSel.value = timeRangeQ;
  if (timeRangeSel2) timeRangeSel2.value = timeRangeQ;
  qInput.value = state.q;
  promptInput.value = state.prompt;
  if (fcInput) fcInput.value = String(state.page);
  if (fcNum) fcNum.textContent = String(state.page);
  const hashIntent = consumeSearchIntentFromHash();
  if (hashIntent) {
    // A tag opened through the browser context menu arrives as a new page
    // with only this fragment. Consume the one-time same-origin record and
    // submit through the normal search controls; no q= URL was navigated.
    qInput.value = hashIntent.q;
    promptInput.value = hashIntent.prompt;
    state.q = hashIntent.q;
    state.prompt = hashIntent.prompt;
    state.searchIntent = true;
    triggerSearch();
    return;
  }
  if (refreshMarker) {
    // A successful sensitive search intentionally has no q= parameter. Only
    // the same browser's opaque session record can restore it on refresh;
    // copied or expired markers, and changed region/language/IP contexts,
    // fail closed as an empty result.
    if (refreshMarker.invalid
        || !sensitiveContentRegionAllowed()
        || !String(CONFIG.sensitive_search_token || '').trim()) {
      clearSensitiveSearchRefreshMarker(refreshMarker.nonce);
      showSensitiveSearchBlocked();
      return;
    }
    state.q = refreshMarker.q;
    state.prompt = refreshMarker.prompt;
    state.searchIntent = true;
    qInput.value = state.q;
    promptInput.value = state.prompt;
    fetchWorks();
    return;
  }
  const directSensitiveQuery = isSensitiveSearchQuery(q, prompt);
  const allowlistedDirectQuery = sensitiveContentRegionAllowed() || sensitiveDisplaySessionActive();
  if (defensiveQueryModeEnabled() && hasDirectQSearchParameter()
      && !historySearchIntent && !allowlistedDirectQuery && !directSensitiveQuery) {
    redirectDirectQueryToHome();
    return;
  }
  if (directSensitiveQuery) {
    try {
      const safeUrl = new URL(window.location.href);
      safeUrl.searchParams.delete('q');
      safeUrl.searchParams.delete('prompt');
      history.replaceState(history.state || { view: 'list' }, '', `${safeUrl.pathname}${safeUrl.search}${safeUrl.hash}`);
    } catch { }
    showSensitiveSearchBlocked();
    return;
  }
  fetchWorks();
}

// initial load
async function initRouter() {
  loadBlacklist();
		  loadOpenWorkInNewWindow();
		  loadInvalidTagFilterSettings();
		  loadCardPreviewSetting();
	  await loadConfig();
	  loadR18DisplaySetting();
  // The first list/detail operation establishes a display session only when
  // the request is actually allowlisted. Avoid a duplicate startup request;
  // non-whitelist users never contact the session endpoint at all.
  if (oldBlacklistMigrationEnabled()) {
    const importedFromWindow = importBlacklistFromWindowNameIfNeeded();
    const importedFromHash = importBlacklistFromHashIfNeeded();
    if (importedFromWindow || importedFromHash) {
      try { loadBlacklist(); } catch { }
    }
  }
  migrateBlacklistFromOldDomainInBackground();
  try { applyStaticI18n(); } catch { }
  try { applyHomeSeo(); } catch { }
  let seen = false;
  try { seen = localStorage.getItem('announce_seen_v1') === '1'; } catch { }
  if (CONFIG.announce_enabled && !seen && announceOverlay) {
    announceOverlay.classList.remove('hidden');
  }
  const path = window.location.pathname || '/';
  if (path.startsWith('/i/')) {
    const idStr = path.slice(3);
    const id = parseInt(idStr, 10);
    if (!Number.isNaN(id)) {
      state.directDetail = true;
      openDetail(id);
      return;
    }
  }
  state.directDetail = false;
  applyListMode();
  initFromQuery();
}

initRouter();
if (announceClose && announceOverlay) {
  announceClose.addEventListener('click', () => {
    try { localStorage.setItem('announce_seen_v1', '1'); } catch { }
    announceOverlay.classList.add('hidden');
  });
}
	if (openWorkNewWindowToggle) {
	  openWorkNewWindowToggle.addEventListener('change', () => {
	    setOpenWorkInNewWindow(!!openWorkNewWindowToggle.checked);
	  });
	}
	if (showSuspectInvalidTagToggle) {
	  showSuspectInvalidTagToggle.addEventListener('change', () => {
	    setShowSuspectInvalidTags(!!showSuspectInvalidTagToggle.checked);
	  });
	}
	if (showNaixInvalidTagToggle) {
	  showNaixInvalidTagToggle.addEventListener('change', () => {
	    setShowNaixInvalidTags(!!showNaixInvalidTagToggle.checked);
	  });
	}
	if (showR18Toggle) {
	  showR18Toggle.addEventListener('change', () => {
	    setShowR18(!!showR18Toggle.checked);
	  });
	}
	if (cardPreviewToggle) {
	  cardPreviewToggle.addEventListener('change', () => {
	    setCardPreviewEnabled(!!cardPreviewToggle.checked);
	  });
	}
	if (fcLanguageSelect) {
	  fcLanguageSelect.addEventListener('change', () => {
	    const selected = String(fcLanguageSelect.value || 'auto');
	    try {
	      if (selected === 'auto') localStorage.removeItem(LANGUAGE_PREFERENCE_KEY);
	      else localStorage.setItem(LANGUAGE_PREFERENCE_KEY, selected);
	    } catch { }
	    const url = new URL(window.location.href);
	    url.searchParams.delete('lang');
	    window.location.replace(`${url.pathname}${url.search}${url.hash}`);
	  });
	}

// 右下角控件逻辑
function toggleHeaderVisibility(show) {
  // 按用户要求：不再隐藏顶部搜索栏，无论何时都保持显示。
  const header = document.querySelector('.site-header');
  if (!header) return;
  const searchRow = header.querySelector('.search-row');
  const blockRow = header.querySelector('.blocklist-row');
  const setRow = (row) => {
    if (!row) return;
    try {
      row.classList.remove('hidden');
      row.style.display = 'flex';
    } catch { }
  };
  setRow(searchRow);
  setRow(blockRow);
}

function applyJumpPage(p) {
  if (Number.isNaN(p) || p < 1) return;
  // 重置瀑布流状态，并从指定页加载
  state.listGeneration = Number(state.listGeneration || 0) + 1;
  state.page = p;
  state.items = [];
  endReached = false;
  lastPageCount = 0;
  loadingPage = false;
  // 清空现有内容并重新加载
  galleryEl.innerHTML = '';
  // 清理旧观察器与哨兵
  if (infiniteObserver) { try { infiniteObserver.disconnect(); } catch { } infiniteObserver = null; }
  const oldSentinel = document.getElementById('infiniteSentinel');
  if (oldSentinel) oldSentinel.remove();
  // 更新URL中的page参数，保留现有查询参数
  const url = new URL(window.location.href);
  url.searchParams.set('page', String(p));
  const newUrl = `${url.pathname}${url.search}${url.hash}`;
  history.pushState({ view: 'list' }, '', newUrl);
  // 同步控件显示
  if (fcNum) fcNum.textContent = String(p);
  if (fcInput) fcInput.value = String(p);
  fetchWorks();
}

// 控制搜索栏显示/隐藏的规则：
// - 当搜索栏处于“跟随”或“固定显示”状态时，点击设置芯片不会隐藏搜索栏，只切换面板显示
// - 当搜索栏已经不跟随（用户滚动较远，头部脱离视口）时，点击设置芯片切换显示：显示 -> 隐藏 -> 显示
function isHeaderInViewport() {
  const header = document.querySelector('.site-header');
  if (!header) return true;
  const rect = header.getBoundingClientRect();
  // 顶部贴边或仍在视口内，视为“跟随/固定状态”
  return rect.top >= 0 && rect.bottom > 0;
}

if (fcChip) {
  fcChip.addEventListener('click', () => {
    const panelVisible = !fcPanel.classList.contains('hidden');
    fcPanel.classList.toggle('hidden', panelVisible);
    if (!panelVisible && fcInput) fcInput.focus();

    // 始终保持顶部搜索栏显示（不再隐藏）
    toggleHeaderVisibility(true);

    try {
      if (!panelVisible) {
        const fcQ = document.getElementById('fcQ');
        const fcPrompt = document.getElementById('fcPrompt');
        const fcSearchBtn = document.getElementById('fcSearchBtn');
        const fcBlacklist = document.getElementById('fcBlacklist');
        const fcSaveBlacklistBtn = document.getElementById('fcSaveBlacklistBtn');

        if (fcQ && qInput) fcQ.value = qInput.value || '';
        if (fcPrompt && promptInput) fcPrompt.value = promptInput.value || '';
        if (fcBlacklist && blacklistInput) fcBlacklist.value = blacklistInput.value || '';

        if (fcPanel && !fcPanel.dataset.wired) {
          fcPanel.dataset.wired = '1';
          try {
            if (fcQ && qInput) {
              fcQ.addEventListener('input', () => { try { qInput.value = fcQ.value || ''; } catch { } });
              qInput.addEventListener('input', () => { try { fcQ.value = qInput.value || ''; } catch { } });
            }
          } catch { }
          try {
            if (fcPrompt && promptInput) {
              fcPrompt.addEventListener('input', () => { try { promptInput.value = fcPrompt.value || ''; } catch { } });
              promptInput.addEventListener('input', () => { try { fcPrompt.value = promptInput.value || ''; } catch { } });
            }
          } catch { }
          try {
            if (fcBlacklist && blacklistInput) {
              fcBlacklist.addEventListener('input', () => { try { blacklistInput.value = fcBlacklist.value || ''; } catch { } });
              blacklistInput.addEventListener('input', () => { try { fcBlacklist.value = blacklistInput.value || ''; } catch { } });
            }
          } catch { }
        }

        if (fcSearchBtn) fcSearchBtn.onclick = () => {
          try {
            if (fcQ && qInput) qInput.value = fcQ.value || '';
            if (fcPrompt && promptInput) promptInput.value = fcPrompt.value || '';
          } catch { }
          triggerSearch();
        };
		        if (fcSaveBlacklistBtn) fcSaveBlacklistBtn.onclick = () => {
		          try { if (fcBlacklist && blacklistInput) blacklistInput.value = fcBlacklist.value || ''; } catch { }
		          saveBlacklist();
		          refreshCurrentGallery({ preserveScroll: true });
		        };
      }
    } catch { }
  });
}

if (fcGo && fcInput) {
  fcGo.addEventListener('click', () => {
    const p = parseInt(fcInput.value || '1', 10);
    applyJumpPage(p);
  });
  fcInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const p = parseInt(fcInput.value || '1', 10);
      applyJumpPage(p);
    }
  });
}

function renderPagination() {
  if (!paginationEl) return;
  const totalPages = Math.max(1, Math.ceil((state.total || 0) / (state.pageSize || 1)));
  const groupStart = Math.floor((state.page - 1) / 10) * 10 + 1;
  const groupEnd = Math.min(groupStart + 9, totalPages);

  paginationEl.innerHTML = '';
  paginationEl.style.display = 'flex';

  const makeBtn = (label, page, opts = {}) => {
    const btn = document.createElement('button');
    btn.className = 'page-btn' + (opts.active ? ' active' : '') + (opts.disabled ? ' disabled' : '');
    btn.textContent = label;
    if (!opts.disabled) {
      btn.addEventListener('click', () => {
        if (opts.active) return;
        state.page = page;
        closePreview();
        fetchWorks();
        // 滚动到顶部以便查看新内容
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
    paginationEl.appendChild(btn);
  };

  // 上一组
  if (groupStart > 1) {
    makeBtn(t('prev_group'), groupStart - 10);
  }

  for (let p = groupStart; p <= groupEnd; p++) {
    makeBtn(String(p), p, { active: p === state.page });
  }

  // 下一组
  if (groupEnd < totalPages) {
    makeBtn(t('next_group'), groupEnd + 1);
  }
}

// “加载更多”按钮：在无限模式下作为兜底加载下一页
if (loadMoreBtn) {
  loadMoreBtn.addEventListener('click', () => {
    if (state.listMode !== 'infinite') return;
    const totalPages = Math.max(1, Math.ceil((state.total || 0) / (state.pageSize || 1)));
    if (state.page >= totalPages) {
      loadMoreBtn.classList.add('hidden');
      return;
    }
    if (loadingPage) return;
    state.page += 1;
    fetchWorks();
  });
}

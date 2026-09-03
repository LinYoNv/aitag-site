(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GalleryUiI18n = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const VERSION = '260830d';
  const LANGUAGE_PREFERENCE_KEY = 'galleryUiLanguageV1';
  const SUPPORTED = new Set(['zh', 'zh_tw', 'en', 'ja', 'ko']);

  function clean(value) {
    return String(value || '').trim().toLowerCase().replace(/_/g, '-');
  }

  function normalizeForcedLanguage(value) {
    const lang = clean(value);
    if (['cn', 'zh', 'zh-cn', 'zh-hans', 'zh-sg'].includes(lang)) return 'zh';
    if (['tw', 'hk', 'zh-tw', 'zh-hk', 'zh-mo', 'zh-hant'].includes(lang)) return 'zh_tw';
    if (['us', 'en', 'en-us', 'en-gb'].includes(lang)) return 'en';
    if (['jp', 'ja', 'ja-jp'].includes(lang)) return 'ja';
    if (['kr', 'ko', 'ko-kr'].includes(lang)) return 'ko';
    return '';
  }

  function normalizeStoredLanguage(value) {
    const lang = String(value || '').trim().toLowerCase();
    return SUPPORTED.has(lang) ? lang : '';
  }

  function detectBrowserLanguage(languages) {
    const list = Array.isArray(languages) ? languages : [languages];
    const preferred = clean(list.find((value) => String(value || '').trim()) || '');
    if (!preferred) return 'en';
    if (preferred === 'zh-hant' || /^zh-(tw|hk|mo)(-|$)/.test(preferred)) return 'zh_tw';
    if (preferred === 'zh-hans' || preferred.startsWith('zh')) return 'zh';
    if (preferred.startsWith('ja')) return 'ja';
    if (preferred.startsWith('ko')) return 'ko';
    return 'en';
  }

  function htmlLang(language) {
    return ({ zh: 'zh-CN', zh_tw: 'zh-Hant', en: 'en', ja: 'ja', ko: 'ko' })[language] || 'en';
  }

  function ogLocale(language) {
    return ({ zh: 'zh_CN', zh_tw: 'zh_TW', en: 'en_US', ja: 'ja_JP', ko: 'ko_KR' })[language] || 'en_US';
  }

  const site = {
    zh: {
      title: 'AI绘画咒语图库 : AI TAG Prompt Art Gallery',
      description: '专为 Stable Diffusion Web UI、ComfyUI 及 NovelAI 用户打造。在这里，您可以一键搜索海量作品与“咒语”参数，参考优秀范例，让 AI 绘画学习变得更简单高效',
    },
    zh_tw: {
      title: 'AI 繪圖提示詞圖庫 : AI TAG Prompt Art Gallery',
      description: '專為 Stable Diffusion Web UI、ComfyUI 與 NovelAI 使用者打造。可快速搜尋大量作品與提示詞參數，參考優秀範例，更有效率地學習 AI 繪圖。',
    },
    en: {
      title: 'AI TAG Prompt Art Gallery',
      description: 'Built for Stable Diffusion, ComfyUI, and NovelAI. Search a vast library of images and prompts with one click. Reference top-tier examples to streamline your workflow and master AI art faster.',
    },
    ja: {
      title: 'AI画像プロンプトギャラリー : AI TAG Prompt Art Gallery',
      description: 'Stable Diffusion Web UI、ComfyUI、NovelAI向けのAI画像プロンプトギャラリーです。作品や生成パラメータを検索し、優れた作例を学習に活用できます。',
    },
    ko: {
      title: 'AI 이미지 프롬프트 갤러리 : AI TAG Prompt Art Gallery',
      description: 'Stable Diffusion Web UI, ComfyUI 및 NovelAI 사용자를 위한 AI 이미지 프롬프트 갤러리입니다. 작품과 생성 설정을 검색하고 좋은 예시를 학습에 활용할 수 있습니다.',
    },
  };

  const translations = {
    zh: {
      show_json: '显示 JSON',
      show_readable: '易读',
      show_r18: '显示 R-18 作品',
      show_card_preview: '显示卡片预览窗口',
      language_label: '界面语言',
      language_auto: '自动（浏览器语言）',
      language_zh: '简体中文',
      language_zh_tw: '繁體中文',
      language_en: 'English',
      language_ja: '日本語',
      language_ko: '한국어',
    },
    en: {
      show_json: 'Show JSON',
      show_readable: 'Readable',
      show_r18: 'Show R-18 works',
      show_card_preview: 'Show card preview window',
      language_label: 'UI language',
      language_auto: 'Automatic (browser)',
      language_zh: '简体中文',
      language_zh_tw: '繁體中文',
      language_en: 'English',
      language_ja: '日本語',
      language_ko: '한국어',
    },
    zh_tw: {
      search_placeholder_q: '搜尋：作品 ID／作者 ID 或名稱／簡介／標籤／投稿日期／AI 類型／模型（支援 -排除、OR 與雙引號精確搜尋）',
      search_placeholder_prompt: '搜尋：NAI 與 SD AI 元資料 Prompt（不含負面詞與 ComfyUI）',
      sort_label: '排序', sort_new: '最新作品', sort_monthly: '每月排行榜',
      time_range_label: '時間範圍', time_all: '全部時間',
      time_full_year: ({ year }) => `${year} 全年`,
      time_quarter: ({ year, quarter }) => `${year} 第 ${quarter} 季`,
      time_older: '更早（2023 年 9 月之前）', time_current_month: '目前月份',
      btn_search: '搜尋', blacklist_placeholder: '封鎖關鍵字（逗號／空格分隔，不封鎖 AI 元資料）', btn_save_blacklist: '儲存封鎖清單',
      status_searching: '搜尋中…', no_results: '沒有搜尋結果', loading: '載入中…', loading_failed: '載入失敗',
      rank_processing: '排行榜正在處理中，請於 2 小時後再查看。', load_more: '載入更多',
      jump_label: '跳至', jump_placeholder: '頁碼', btn_go: '前往', open_work_new_window: '在新視窗開啟作品',
      show_suspect_invalid_tags: '顯示疑似無效 TAG 作品', show_naix_invalid_tags: '顯示 NAI_X 無效 TAG 作品', show_r18: '顯示 R-18 作品', show_card_preview: '顯示卡片預覽視窗', fc_chip_label: '設定與頁碼',
      fc_q_placeholder: '搜尋：ID／作者／簡介／標籤／日期／類型／模型', fc_prompt_placeholder: '搜尋：NAI／SD 元資料 Prompt', fc_blacklist_placeholder: '封鎖關鍵字（逗號／空格分隔）',
      preview_alt: '預覽', back_btn: '← 返回', detail_header: '作品詳情', home_alt: '首頁', home_title: '返回首頁', thumb_alt: '縮圖', type_search_tip: '依類型搜尋',
      naix_suspect: '疑似無效 TAG', naix_suspect_bracket: '[疑似無效 TAG]', naix_suspect_paren: '（疑似無效 TAG）',
      non_standard_format: '非標準格式', non_standard_format_bracket: '[非標準格式]', non_standard_format_paren: '（非標準格式）', non_standard_format_tip: '此資料來自 tensor.art 線上生成流程，並非標準 ComfyUI 工作流程。',
      work_fallback: ({ id }) => `作品 ${id}`, images_count: ({ n }) => `${n} 張`, err_network: '網路錯誤', show_full_meta: '顯示完整 AI 元資料',
      dm_pixiv_id: 'Pixiv ID', dm_author: '作者', dm_type: '類型', dm_tags: '標籤', dm_caption: '作品簡介', dm_posted_at: '投稿時間', dm_unknown: '未知', dm_none: '無', dm_views: '瀏覽', dm_bookmarks: '收藏',
      caption_show_all: '顯示完整簡介', caption_collapse: '收合簡介',
      ai_meta_mode: 'AI 元資料模式', ai_meta_readable: '易讀', ai_meta_raw: '原始 JSON', ai_meta_instruction: '指令',
      copy_readable: '複製易讀內容', copy_json: '複製 JSON', copy_instruction: '複製指令', copied: '已複製', copy_failed: '複製失敗', copy_failed_manual: '複製失敗，請手動複製：\n\n',
      show_json: '顯示 JSON', show_readable: '易讀', show_all: '顯示全部', collapse: '收合',
      copy_all_image_links: '複製全部圖片連結', no_links_to_copy: '沒有可複製的連結', copied_n_links: ({ n }) => `已複製 ${n} 條連結`, copy_failed_popup: '複製失敗，已開啟文字視窗', prev_group: '上一組', next_group: '下一組',
      seo_tags_prefix: '標籤', seo_ai_meta_prefix: 'AI 元資料',
      announce_title: '公告說明', announce_close: '關閉',
      announce_p1: '本站收集 Pixiv 上附有 AI 元資料的 AI 圖像作品。',
      announce_p2: '目的是協助新手更快學習，也能更方便地參考優秀提示詞與設定。',
      announce_p3: '我也經常與群友分享自己的作品，並從 2024 年起每月支付 25 美元購買 NovelAI 帳號，架設 AI 機器人供群友免費使用。',
      announce_p4: '我也理解創作者投入時間製作作品的勞動成果。',
      announce_strong_prefix: '如果不希望作品公開，可隨時透過 Pixiv 聯絡我協助刪除：', announce_strong_link: '透過 Pixiv 聯絡我（Puid:120618272）', announce_strong_suffix: '',
      lang_btn_zh: '簡中', lang_btn_en: 'EN', btn_import_blacklist: '匯入舊網域封鎖清單',
      import_blacklist_popup_blocked: '彈出視窗遭瀏覽器阻擋，請允許本站彈出視窗後重試。', import_blacklist_starting: '正在從舊網域匯入…', import_blacklist_done: '已匯入舊網域封鎖清單', import_blacklist_failed: '匯入失敗（舊網域可能禁止 iframe 或沒有資料）',
      language_label: '介面語言', language_auto: '自動（瀏覽器語言）', language_zh: '简体中文', language_zh_tw: '繁體中文', language_en: 'English', language_ja: '日本語', language_ko: '한국어',
    },
    ja: {
      search_placeholder_q: '検索：作品ID／作者ID・名前／説明／タグ／投稿日／AIタイプ／モデル（-除外、OR、引用符での完全一致に対応）',
      search_placeholder_prompt: '検索：NAI・SDのAIメタデータPrompt（ネガティブ・ComfyUIを除く）',
      sort_label: '並び順', sort_new: '新着作品', sort_monthly: '月間ランキング',
      time_range_label: '期間', time_all: '全期間', time_full_year: ({ year }) => `${year}年`, time_quarter: ({ year, quarter }) => `${year}年第${quarter}四半期`, time_older: 'それ以前（2023年9月より前）', time_current_month: '今月',
      btn_search: '検索', blacklist_placeholder: '除外キーワード（カンマ・空白区切り、AIメタデータは対象外）', btn_save_blacklist: '除外リストを保存',
      status_searching: '検索中…', no_results: '検索結果がありません', loading: '読み込み中…', loading_failed: '読み込みに失敗しました', rank_processing: 'ランキングを処理中です。2時間後にもう一度確認してください。', load_more: 'さらに読み込む',
      jump_label: 'ページへ', jump_placeholder: 'ページ番号', btn_go: '移動', open_work_new_window: '作品を新しいウィンドウで開く', show_suspect_invalid_tags: '無効タグの疑いがある作品を表示', show_naix_invalid_tags: 'NAI_X無効タグ作品を表示', show_r18: 'R-18作品を表示', show_card_preview: 'カードプレビューを表示', fc_chip_label: '設定とページ',
      fc_q_placeholder: '検索：ID／作者／説明／タグ／日付／タイプ／モデル', fc_prompt_placeholder: '検索：NAI／SDメタデータPrompt', fc_blacklist_placeholder: '除外キーワード（カンマ・空白区切り）',
      preview_alt: 'プレビュー', back_btn: '← 戻る', detail_header: '作品詳細', home_alt: 'ホーム', home_title: 'ホームへ戻る', thumb_alt: 'サムネイル', type_search_tip: 'タイプで検索',
      naix_suspect: '無効タグの疑い', naix_suspect_bracket: '[無効タグの疑い]', naix_suspect_paren: '（無効タグの疑い）',
      non_standard_format: '非標準形式', non_standard_format_bracket: '[非標準形式]', non_standard_format_paren: '（非標準形式）', non_standard_format_tip: 'tensor.artのオンライン生成フロー由来で、標準的なComfyUIワークフローではありません。',
      work_fallback: ({ id }) => `作品 ${id}`, images_count: ({ n }) => `${n}枚`, err_network: 'ネットワークエラー', show_full_meta: '完全なAIメタデータを表示',
      dm_pixiv_id: 'Pixiv ID', dm_author: '作者', dm_type: 'タイプ', dm_tags: 'タグ', dm_caption: '作品説明', dm_posted_at: '投稿日', dm_unknown: '不明', dm_none: 'なし', dm_views: '閲覧', dm_bookmarks: 'ブックマーク',
      caption_show_all: '説明をすべて表示', caption_collapse: '説明を折りたたむ', ai_meta_mode: 'AIメタデータモード', ai_meta_readable: '読みやすい表示', ai_meta_raw: '元のJSON', ai_meta_instruction: '命令形式',
      copy_readable: '読みやすい内容をコピー', copy_json: 'JSONをコピー', copy_instruction: '命令をコピー', copied: 'コピーしました', copy_failed: 'コピーに失敗しました', copy_failed_manual: 'コピーに失敗しました。手動でコピーしてください：\n\n',
      show_json: 'JSONを表示', show_readable: '読みやすい表示', show_all: 'すべて表示', collapse: '折りたたむ', copy_all_image_links: 'すべての画像リンクをコピー', no_links_to_copy: 'コピーできるリンクがありません', copied_n_links: ({ n }) => `${n}件のリンクをコピーしました`, copy_failed_popup: 'コピーに失敗したため、テキストを開きました', prev_group: '前へ', next_group: '次へ',
      seo_tags_prefix: 'タグ', seo_ai_meta_prefix: 'AIメタデータ', announce_title: 'お知らせ', announce_close: '閉じる',
      announce_p1: 'このサイトは、AIメタデータを含むPixivのAI作品を収集しています。', announce_p2: '初心者の学習を助け、優れたプロンプトや設定を手軽に参考にできるようにすることが目的です。', announce_p3: '私自身の作品も仲間に共有しており、2024年から毎月25ドルのNovelAIアカウントを購入し、無料で利用できるAIボットを運営しています。', announce_p4: '作品制作に時間をかけるクリエイターの努力も理解しています。',
      announce_strong_prefix: '作品の公開を希望しない場合は、Pixivからいつでも削除をご依頼ください：', announce_strong_link: 'Pixivで連絡する（Puid:120618272）', announce_strong_suffix: '', lang_btn_zh: '中文', lang_btn_en: 'EN',
      btn_import_blacklist: '旧ドメインの除外リストをインポート', import_blacklist_popup_blocked: 'ポップアップがブロックされました。許可してから再試行してください。', import_blacklist_starting: '旧ドメインからインポート中…', import_blacklist_done: '旧ドメインの除外リストをインポートしました', import_blacklist_failed: 'インポートに失敗しました（旧ドメインがiframeを禁止しているか、データがありません）',
      language_label: '表示言語', language_auto: '自動（ブラウザー）', language_zh: '简体中文', language_zh_tw: '繁體中文', language_en: 'English', language_ja: '日本語', language_ko: '한국어',
    },
    ko: {
      search_placeholder_q: '검색: 작품 ID / 작가 ID 또는 이름 / 설명 / 태그 / 게시일 / AI 유형 / 모델 (-제외, OR, 따옴표 정확 검색 지원)',
      search_placeholder_prompt: '검색: NAI 및 SD AI 메타데이터 Prompt (네거티브·ComfyUI 제외)',
      sort_label: '정렬', sort_new: '최신 작품', sort_monthly: '월간 랭킹', time_range_label: '기간', time_all: '전체 기간', time_full_year: ({ year }) => `${year}년 전체`, time_quarter: ({ year, quarter }) => `${year}년 ${quarter}분기`, time_older: '이전 기간(2023년 9월 이전)', time_current_month: '이번 달',
      btn_search: '검색', blacklist_placeholder: '차단 키워드(쉼표/공백 구분, AI 메타데이터 제외)', btn_save_blacklist: '차단 목록 저장', status_searching: '검색 중…', no_results: '검색 결과가 없습니다', loading: '불러오는 중…', loading_failed: '불러오지 못했습니다', rank_processing: '랭킹을 처리 중입니다. 2시간 후 다시 확인해 주세요.', load_more: '더 불러오기',
      jump_label: '페이지 이동', jump_placeholder: '페이지 번호', btn_go: '이동', open_work_new_window: '작품을 새 창에서 열기', show_suspect_invalid_tags: '무효 태그 의심 작품 표시', show_naix_invalid_tags: 'NAI_X 무효 태그 작품 표시', show_r18: 'R-18 작품 표시', show_card_preview: '카드 미리보기 표시', fc_chip_label: '설정 및 페이지',
      fc_q_placeholder: '검색: ID / 작가 / 설명 / 태그 / 날짜 / 유형 / 모델', fc_prompt_placeholder: '검색: NAI/SD 메타데이터 Prompt', fc_blacklist_placeholder: '차단 키워드(쉼표/공백 구분)',
      preview_alt: '미리보기', back_btn: '← 뒤로', detail_header: '작품 상세', home_alt: '홈', home_title: '홈으로 돌아가기', thumb_alt: '썸네일', type_search_tip: '유형으로 검색',
      naix_suspect: '무효 태그 의심', naix_suspect_bracket: '[무효 태그 의심]', naix_suspect_paren: '(무효 태그 의심)', non_standard_format: '비표준 형식', non_standard_format_bracket: '[비표준 형식]', non_standard_format_paren: '(비표준 형식)', non_standard_format_tip: 'tensor.art 온라인 생성 흐름에서 가져온 데이터이며 표준 ComfyUI 워크플로가 아닙니다.',
      work_fallback: ({ id }) => `작품 ${id}`, images_count: ({ n }) => `${n}장`, err_network: '네트워크 오류', show_full_meta: '전체 AI 메타데이터 표시',
      dm_pixiv_id: 'Pixiv ID', dm_author: '작가', dm_type: '유형', dm_tags: '태그', dm_caption: '작품 설명', dm_posted_at: '게시 시간', dm_unknown: '알 수 없음', dm_none: '없음', dm_views: '조회', dm_bookmarks: '북마크',
      caption_show_all: '설명 전체 보기', caption_collapse: '설명 접기', ai_meta_mode: 'AI 메타데이터 모드', ai_meta_readable: '읽기 쉬움', ai_meta_raw: '원본 JSON', ai_meta_instruction: '명령 형식',
      copy_readable: '읽기 쉬운 내용 복사', copy_json: 'JSON 복사', copy_instruction: '명령 복사', copied: '복사됨', copy_failed: '복사 실패', copy_failed_manual: '복사하지 못했습니다. 직접 복사해 주세요:\n\n',
      show_json: 'JSON 표시', show_readable: '읽기 쉬움', show_all: '전체 보기', collapse: '접기', copy_all_image_links: '모든 이미지 링크 복사', no_links_to_copy: '복사할 링크가 없습니다', copied_n_links: ({ n }) => `링크 ${n}개를 복사했습니다`, copy_failed_popup: '복사에 실패하여 텍스트 창을 열었습니다', prev_group: '이전', next_group: '다음',
      seo_tags_prefix: '태그', seo_ai_meta_prefix: 'AI 메타데이터', announce_title: '공지', announce_close: '닫기',
      announce_p1: '이 사이트는 AI 메타데이터가 포함된 Pixiv AI 작품을 수집합니다.', announce_p2: '초보자가 더 빠르게 배우고 좋은 프롬프트와 설정을 편리하게 참고할 수 있도록 돕는 것이 목적입니다.', announce_p3: '저도 제 작품을 지인들과 공유하며, 2024년부터 매월 25달러의 NovelAI 계정을 구독해 무료 AI 봇을 운영하고 있습니다.', announce_p4: '작품 제작에 시간을 들이는 창작자의 노력도 이해하고 있습니다.',
      announce_strong_prefix: '작품 공개를 원하지 않으면 언제든 Pixiv로 삭제를 요청해 주세요:', announce_strong_link: 'Pixiv로 연락하기 (Puid:120618272)', announce_strong_suffix: '', lang_btn_zh: '中文', lang_btn_en: 'EN',
      btn_import_blacklist: '이전 도메인 차단 목록 가져오기', import_blacklist_popup_blocked: '팝업이 차단되었습니다. 팝업을 허용한 뒤 다시 시도해 주세요.', import_blacklist_starting: '이전 도메인에서 가져오는 중…', import_blacklist_done: '이전 도메인 차단 목록을 가져왔습니다', import_blacklist_failed: '가져오지 못했습니다(이전 도메인의 iframe 차단 또는 데이터 없음)',
      language_label: 'UI 언어', language_auto: '자동(브라우저)', language_zh: '简体中文', language_zh_tw: '繁體中文', language_en: 'English', language_ja: '日本語', language_ko: '한국어',
    },
  };

  return {
    VERSION,
    LANGUAGE_PREFERENCE_KEY,
    translations,
    site,
    normalizeForcedLanguage,
    normalizeStoredLanguage,
    detectBrowserLanguage,
    htmlLang,
    ogLocale,
  };
});

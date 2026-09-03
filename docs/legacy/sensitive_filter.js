/* Client-side sensitive-content filter for cached work/detail responses. */
(function (root) {
  'use strict';

  const VERSION = '260830a';
  const DEFAULT_TERMS = Object.freeze([
    // Existing source tags.
    'ロリ',
    'loli',
    'JS',
    'ショタ',
    'ロリニティ',
    '女子小学生',
    '幼女化',
    '少年',
    '男の子',
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
    // Japanese: explicit loli/shota or child-sexual-content tags.
    'ロリコン',
    'ショタコン',
    'ロリータ',
    'ロリィタ',
    '幼女',
    'ペド',
    'ペドフィリア',
    '児童ポルノ',
    '小児性愛',
    '幼児性愛',
    '未成年性交',
    '児童買春',
    // English: requested loli/shota, age, or child-sexual-content tags.
    'lolita',
    'child',
    'minor',
    'shota',
    'lolicon',
    'shotacon',
    'pedophil',
    'child porn',
    'child pornography',
    'child sexual abuse',
    'child sexual exploitation',
    'underage sex',
    'preteen sex',
    'sexualized minor',
    'sexualised minor',
    'minor sexual exploitation',
    'ageplay',
    'age play',
    'csam',
    // Simplified/traditional Chinese.
    '萝莉',
    '蘿莉',
    '萝莉控',
    '蘿莉控',
    '萝莉塔',
    '蘿莉塔',
    '正太',
    '正太控',
    '戀童',
    '恋童',
    '戀童癖',
    '恋童癖',
    '儿童色情',
    '兒童色情',
    '幼童色情',
    '未成年色情',
    '儿童性剥削',
    '兒童性剝削',
    '儿童性虐待',
    '兒童性虐待',
    'JC',
    '女児',
    '小学生',
    // Korean.
    '로리',
    '로리콘',
    '쇼타',
    '쇼타콘',
    '페도',
    '소아성애',
    '페도필리아',
    '아동포르노',
    '아동 포르노',
    '아동성착취',
    '아동 성착취',
    '미성년자 성착취',
    // Other common translation languages; all are explicit compounds.
    'pédophilie',
    'pedophilie',
    'pornographie infantile',
    'pedofilia',
    'pornografía infantil',
    'pornografia infantil',
    'pädophilie',
    'padophilie',
    'kinderpornografie',
    'pedopornografia',
    'педофилия',
    'детское порно',
  ]);

  function normalize(value) {
    try {
      // Fold full-width Latin characters. Keep separators for token-boundary
      // checks; matches() also tests a compact form for whitespace bypasses.
      return String(value == null ? '' : value)
        .normalize('NFKC')
        .toLocaleLowerCase();
    } catch (_) {
      return String(value == null ? '' : value).toLowerCase();
    }
  }

  function termsFrom(source) {
    const values = Array.isArray(source)
      ? source
      : (source && Array.isArray(source.sensitive_content_terms)
        ? source.sensitive_content_terms
        : DEFAULT_TERMS);
    const seen = new Set();
    const result = [];
    values.forEach((value) => {
      const term = normalize(value).replace(/\s+/g, '');
      if (term && !seen.has(term)) {
        seen.add(term);
        result.push(term);
      }
    });
    return result.length ? result : DEFAULT_TERMS.map((value) => normalize(value).replace(/\s+/g, ''));
  }

  function matches(value, source) {
    const haystack = normalize(value);
    const compactHaystack = haystack.replace(/\s+/g, '');
    if (!compactHaystack) return false;
    return termsFrom(source).some((term) => {
      // ASCII terms are tokens, not arbitrary substrings. Otherwise the
      // metadata key "ai_json" would match the sensitive term "JS".
      if (/^[a-z0-9]+$/.test(term)) {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const spaced = Array.from(escaped).join('\\s*');
        const token = new RegExp(`(?:^|[^a-z0-9])${spaced}(?![a-z0-9])`);
        if (token.test(haystack)) return true;
        if (term === 'pedophil' && /(?:^|[^a-z0-9])pedophil(?:ia|e|ic)(?![a-z0-9])/.test(haystack)) return true;
        return false;
      }
      return compactHaystack.includes(term);
    });
  }

  function normalizeTags(raw) {
    if (Array.isArray(raw)) return raw.map((value) => String(value || '')).filter(Boolean);
    if (raw && typeof raw === 'object') return Object.values(raw).map((value) => String(value || '')).filter(Boolean);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(String(raw));
      if (parsed !== raw) return normalizeTags(parsed);
    } catch (_) { /* legacy non-JSON tag text */ }
    return String(raw)
      .split(/[\n,|; 、，。\t]+/)
      .map((value) => value.trim())
      .filter(Boolean);
  }

  function parseAiJson(raw) {
    if (raw && typeof raw === 'object') return raw;
    if (typeof raw !== 'string' || !raw.trim()) return null;
    try {
      const value = JSON.parse(raw);
      return value && typeof value === 'object' ? value : null;
    } catch (_) {
      return null;
    }
  }

  function isSerializedWorkflowText(value) {
    const text = String(value == null ? '' : value).trim();
    if (!text || !/^[\[{]/.test(text)) return false;
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
      return !!(parsed.nodes || parsed.generation_data
        || Object.keys(parsed).some((key) => /^\d+$/.test(key)));
    } catch (_) { return false; }
  }

  function addComfyPositivePrompts(result, value) {
    if (!value || typeof value !== 'object') return;
    const rawNodes = Array.isArray(value.nodes)
      ? value.nodes
      : Object.entries(value)
        .filter(([key, node]) => /^\d+$/.test(key) && node && typeof node === 'object')
        .map(([id, node]) => ({ ...node, __id: id }));
    if (!rawNodes.length) return;
    const nodes = new Map(rawNodes
      .filter((node) => node && (node.id != null || node.__id != null))
      .map((node) => [String(node.id != null ? node.id : node.__id), node]));
    const links = new Map((Array.isArray(value.links) ? value.links : [])
      .filter((link) => Array.isArray(link) && link.length >= 2)
      .map((link) => [String(link[0]), String(link[1])]));
    const refs = (candidate) => {
      if (Array.isArray(candidate) && candidate.length >= 2 && nodes.has(String(candidate[0]))) return [String(candidate[0])];
      if (Array.isArray(candidate)) return candidate.flatMap(refs);
      if (candidate && typeof candidate === 'object') return Object.values(candidate).flatMap(refs);
      return [];
    };
    const visited = new Set();
    const addStrings = (node) => {
      const values = Array.isArray(node.widgets_values) ? node.widgets_values.slice() : [];
      const inputs = node.inputs && typeof node.inputs === 'object' && !Array.isArray(node.inputs) ? node.inputs : {};
      ['text', 'prompt', 'positive', 'value'].forEach((key) => {
        if (typeof inputs[key] === 'string') values.push(inputs[key]);
      });
      values.forEach((item) => { if (typeof item === 'string' && item.trim()) result.add(item.trim()); });
    };
    const walk = (nodeId) => {
      const key = String(nodeId);
      if (visited.has(key)) return;
      const node = nodes.get(key);
      if (!node) return;
      visited.add(key);
      const type = String(node.type || node.class_type || '').toLowerCase();
      if (type.includes('text') || type.includes('prompt') || type.includes('cliptextencode')) addStrings(node);
      if (Array.isArray(node.inputs)) {
        node.inputs.forEach((input) => {
          if (!input || /negative|\buc\b/i.test(String(input.name || ''))) return;
          const source = links.get(String(input.link));
          if (source) walk(source);
        });
      } else {
        const inputs = node.inputs && typeof node.inputs === 'object' ? node.inputs : {};
        Object.entries(inputs).forEach(([name, input]) => {
          if (/negative|\buc\b/i.test(name)) return;
          refs(input).forEach(walk);
        });
      }
    };
    nodes.forEach((node) => {
      const type = String(node.type || node.class_type || '').toLowerCase();
      if (!type.includes('sampler') && !type.includes('ksampler')) return;
      if (Array.isArray(node.inputs)) {
        node.inputs.filter((input) => String(input && input.name || '').toLowerCase() === 'positive')
          .forEach((input) => { const source = links.get(String(input.link)); if (source) walk(source); });
      } else {
        refs(node.inputs && node.inputs.positive).forEach(walk);
      }
    });
  }

  function textFromEntry(entry) {
    if (typeof entry === 'string') return entry;
    if (!entry || typeof entry !== 'object') return '';
    return String(entry.text ?? entry.prompt ?? entry.value ?? '').trim();
  }

  function stripArtistCredits(value) {
    // Artist attribution is metadata, not a subject tag. A prompt such as
    // ``artist:child_(name)`` must not become a sensitive-content hit.
    return String(value == null ? '' : value)
      .replace(/(^|[\n,])\s*artist\s*:\s*[^\n,]+/gi, '$1')
      .replace(/\b[^\s,]+\s*\(\s*artist\s*\)/gi, '');
  }

  function addFormattedPrompts(result, view) {
    if (!view || typeof view !== 'object') return;
    const addList = (list) => {
      if (!Array.isArray(list)) return;
      list.forEach((entry) => {
        const text = textFromEntry(entry);
        if (text && !isSerializedWorkflowText(text)) result.add(text);
      });
    };
    // AIMetadata.format() puts only positive entries in `prompts`.
    addList(view.prompts);
    (Array.isArray(view.passes) ? view.passes : []).forEach((pass) => {
      addList(pass && pass.promptEntries);
      addList(pass && pass.prompts);
    });
  }

  function addExplicitPositiveValues(result, value, type, key = '') {
    if (!value || typeof value !== 'object') return;
    const normalizedType = String(type || '').toLowerCase();
    const add = (candidate) => {
      if (Array.isArray(candidate)) {
        candidate.forEach(add);
      } else if (typeof candidate === 'string' && candidate.trim()) {
        result.add(candidate.trim());
      }
    };
    if (normalizedType === 'nai' || normalizedType === 'nai_x') {
      add(value.Description);
      const comment = value.Comment;
      if (comment && typeof comment === 'object') {
        add(comment.prompt);
        const v4 = comment.v4_prompt;
        if (v4 && typeof v4 === 'object') {
          add(v4.caption);
          (Array.isArray(v4.char_captions) ? v4.char_captions : []).forEach((entry) => add(entry && (entry.char_caption ?? entry.caption ?? entry.prompt)));
        }
      }
    }
    if (normalizedType === 'sd') {
      const parameters = value.parameters;
      if (typeof parameters === 'string') {
        add(parameters.split(/\bnegative\s+prompt\s*:/i)[0]);
      }
      add(value.positive_prompt);
      add(value.positive);
      if (typeof value.prompt === 'string' && !/^\s*[\[{]/.test(value.prompt)) add(value.prompt);
    }
    // Generic metadata wrappers sometimes expose the positive prompt without
    // an AI type discriminator. These keys are positive by contract; the
    // corresponding negative/uc keys are deliberately never read.
    add(value.positive_prompt);
    add(value.positive);
    add(value.pos);
    if (typeof value.prompt === 'string' && !/^\s*[\[{]/.test(value.prompt)) add(value.prompt);
    Object.entries(value).forEach(([childKey, child]) => {
      if (!/^(?:positive|positive_prompt|positiveprompt|pos|prompt|prompt_text)$/.test(String(childKey || '').toLowerCase())) return;
      if (child && typeof child === 'object' && !Array.isArray(child)) {
        addExplicitPositiveValues(result, child, type, childKey);
      }
    });
    // A small fallback for unsupported metadata wrappers. Explicit positive
    // field names are safe; negative/uc fields are intentionally ignored.
    const keyLower = String(key || '').toLowerCase();
    if (/^(?:positive|positive_prompt|pos|prompt|prompt_text)$/.test(keyLower)) add(value);
  }

  function positivePromptTexts(workData) {
    const work = workData && workData.work && typeof workData.work === 'object' ? workData.work : {};
    const type = String(work.AI_type || work.ai_type || '').toLowerCase();
    const result = new Set();
    const images = workData && Array.isArray(workData.images) ? workData.images : [];
    images.forEach((image) => {
      if (!image || typeof image !== 'object') return;
      // ``prompt_text`` is the normalized positive prompt stored alongside
      // legacy SD/NAI metadata. It is not a negative/UC field.
      if (typeof image.prompt_text === 'string' && image.prompt_text.trim()) {
        result.add(image.prompt_text.split(/\bnegative\s+prompt\s*:/i)[0].trim());
      }
      const parsed = parseAiJson(image.ai_json);
      if (!parsed) {
        // Legacy rows may contain a plain A1111/NAI prompt instead of a JSON
        // object. Keep only the text before an explicit negative section.
        if (typeof image.ai_json === 'string') {
          const positive = image.ai_json.split(/\bnegative\s+prompt\s*:/i)[0].trim();
          if (positive) result.add(positive);
        }
        return;
      }
      if (type === 'comfyui') addComfyPositivePrompts(result, parsed);
      try {
        if (root.AIMetadata && typeof root.AIMetadata.format === 'function') {
          addFormattedPrompts(result, root.AIMetadata.format(parsed, type, { model: image.model || '' }));
        }
      } catch (_) { /* fall back to explicit positive fields below */ }
      addExplicitPositiveValues(result, parsed, type);
    });
    return Array.from(result);
  }

  function workTagsHaveSensitive(work, source) {
    const tags = normalizeTags(work && work.tags);
    return tags.some((tag) => matches(tag, source));
  }

  function workDataHasSensitive(workData, source) {
    const work = workData && workData.work && typeof workData.work === 'object' ? workData.work : (workData || {});
    if (workTagsHaveSensitive(work, source)) return true;
    return positivePromptTexts(workData).some((prompt) => matches(stripArtistCredits(prompt), source));
  }

  root.GallerySensitiveFilter = {
    VERSION,
    DEFAULT_TERMS,
    normalize,
    termsFrom,
    matches,
    normalizeTags,
    positivePromptTexts,
    stripArtistCredits,
    workTagsHaveSensitive,
    workDataHasSensitive,
    queryHasSensitive: (q, prompt, source) => matches(q, source) || matches(prompt, source),
  };
})(window);

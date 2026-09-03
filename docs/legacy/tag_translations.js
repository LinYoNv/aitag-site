(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GalleryTagTranslations = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function localeForUiLanguage(language) {
    const value = String(language || '').trim().toLowerCase().replace(/_/g, '-');
    if (value === 'zh' || value === 'zh-tw' || value.startsWith('zh-')) return 'zh-CN';
    if (value === 'en' || value.startsWith('en-')) return 'en';
    if (value === 'ko' || value.startsWith('ko-')) return 'ko';
    return '';
  }

  function normalize(raw) {
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

  function localizedValue(values, language, sourceTag) {
    if (!values || typeof values !== 'object') return '';
    const locale = localeForUiLanguage(language);
    if (!locale) return '';
    const translated = String(values[locale] || '').trim();
    const source = String(sourceTag || '').trim();
    return translated && translated !== source ? translated : '';
  }

  return { localeForUiLanguage, normalize, localizedValue };
});

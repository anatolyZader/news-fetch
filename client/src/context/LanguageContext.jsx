import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import IntlMessageFormat from 'intl-messageformat';
import { translations } from '../i18n/index.js';
import { formatTemplate } from '../lib/i18nFormat.js';
import PropTypes from 'prop-types';

const LanguageContext = createContext(null);

const LOCALE_TAG = { en: 'en', he: 'he-IL', ru: 'ru-RU' };

/**
 * @param {string} key
 * @param {'en' | 'he' | 'ru'} lang
 */
function lookupMessage(key, lang) {
  const localized = translations[lang]?.[key];
  if (localized != null && localized !== '') return localized;
  const fallback = translations.en?.[key];
  if (fallback != null && fallback !== '') {
    if (import.meta.env.DEV && lang !== 'en') {
      console.warn(`[i18n] missing ${lang} key: ${key}`);
    }
    return fallback;
  }
  if (import.meta.env.DEV) {
    console.warn(`[i18n] missing key: ${key}`);
  }
  return '';
}

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'en');
  const pluralCache = useMemo(() => new Map(), [lang]);

  useEffect(() => {
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  function switchLang(l) {
    setLang(l);
    localStorage.setItem('lang', l);
  }

  /**
   * @param {string} key
   * @param {Record<string, unknown>} [params]
   */
  function t(key, params) {
    const raw = lookupMessage(key, lang);
    if (!params || !Object.keys(params).length) return raw;
    return formatTemplate(raw, params);
  }

  /**
   * ICU plural message (value must use {count, plural, ...}).
   *
   * @param {string} key
   * @param {number} count
   * @param {Record<string, unknown>} [params]
   */
  function tp(key, count, params = {}) {
    const raw = lookupMessage(key, lang);
    if (!raw) return '';
    const cacheKey = `${lang}:${key}`;
    let fmt = pluralCache.get(cacheKey);
    if (!fmt) {
      fmt = new IntlMessageFormat(raw, LOCALE_TAG[lang] ?? 'en');
      pluralCache.set(cacheKey, fmt);
    }
    return fmt.format({ count, ...params });
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang: switchLang, t, tp }}>
      {children}
    </LanguageContext.Provider>
  );
}

LanguageProvider.propTypes = {
  children: PropTypes.node,
};

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return ctx;
}

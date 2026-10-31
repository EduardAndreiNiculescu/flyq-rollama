import { useCallback } from 'react';
import { useSettings } from '../store/settings';
import { en } from './en';
import { ro, type TranslationKey } from './ro';

export type Language = 'ro' | 'en';
export type TranslateParams = Record<string, string | number>;

const dictionaries: Record<Language, Record<TranslationKey, string>> = { ro, en };

export function translate(language: Language, key: TranslationKey, params?: TranslateParams): string {
  const template = dictionaries[language][key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    params[name] !== undefined ? String(params[name]) : match,
  );
}

export function useT() {
  const language = useSettings(state => state.language);
  return useCallback(
    (key: TranslationKey, params?: TranslateParams) => translate(language, key, params),
    [language],
  );
}

export function useLanguage(): Language {
  return useSettings(state => state.language);
}

/** Pentru textele din date (terminal.json etc.) care vin deja cu ambele limbi. */
export function useLocalized() {
  const language = useLanguage();
  return useCallback((text: { ro: string; en: string } | undefined) => (text ? text[language] : ''), [language]);
}

export type { TranslationKey };

import { SupportedLanguage } from '../types';
import { TranslationDictionary } from './types';
import { en } from './en';
import { ml } from './ml';
import { hi } from './hi';

export type { TranslationDictionary } from './types';

export const DICTIONARIES: Record<SupportedLanguage, TranslationDictionary> = {
  en,
  ml,
  hi,
};

export const LANGUAGE_OPTIONS: {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  shortLabel: string;
}[] = [
  { code: 'en', name: 'English', nativeName: 'English', shortLabel: 'EN' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', shortLabel: 'ML' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', shortLabel: 'HI' },
];

export function formatTranslation(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value)),
    template
  );
}

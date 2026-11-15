import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { SupportedLanguage } from '../types';
import { DICTIONARIES, TranslationDictionary } from '../i18n';
import { useAuth } from './AuthContext';

const STORAGE_KEY = 'shopcart_language';

interface LanguageContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => Promise<void>;
  t: TranslationDictionary;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

function isSupportedLanguage(val: unknown): val is SupportedLanguage {
  return val === 'en' || val === 'ml' || val === 'hi';
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, updateProfile } = useAuth();

  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (isSupportedLanguage(saved)) return saved;
    } catch {
      // Ignore storage errors
    }
    return 'en';
  });

  const userManuallyChangedRef = useRef(false);
  const lastHydratedUserIdRef = useRef<string | null>(null);

  // Apply <html lang="..."> whenever language changes
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // Ignore storage errors
    }
  }, [language]);

  // Hydrate saved user preference once per user sign-in unless user just switched manually
  useEffect(() => {
    if (!user?.id) {
      lastHydratedUserIdRef.current = null;
      return;
    }
    if (lastHydratedUserIdRef.current === user.id) return;
    lastHydratedUserIdRef.current = user.id;

    if (!userManuallyChangedRef.current && user.preferredLanguage && isSupportedLanguage(user.preferredLanguage)) {
      setLanguageState(user.preferredLanguage);
    }
  }, [user?.id, user?.preferredLanguage]);

  const setLanguage = useCallback(
    async (lang: SupportedLanguage) => {
      if (!isSupportedLanguage(lang)) return;
      userManuallyChangedRef.current = true;
      setLanguageState(lang);
      try {
        localStorage.setItem(STORAGE_KEY, lang);
      } catch {
        // Ignore
      }
      if (user && !user.id.startsWith('usr-demo')) {
        await updateProfile({ preferredLanguage: lang }).catch(() => {});
      }
    },
    [user, updateProfile]
  );

  const t = DICTIONARIES[language] || DICTIONARIES.en;

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return ctx;
};

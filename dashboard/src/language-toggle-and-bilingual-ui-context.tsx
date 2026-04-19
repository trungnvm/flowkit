import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

export type Language = 'vi' | 'en'

interface I18nContextValue {
  language: Language
  setLanguage: (language: Language) => void
  toggleLanguage: () => void
  t: (vi: string, en: string) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)
const STORAGE_KEY = 'flowkit:dashboard-language'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('vi')

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'vi' || saved === 'en') {
      setLanguageState(saved)
    }
  }, [])

  function setLanguage(next: Language) {
    setLanguageState(next)
    localStorage.setItem(STORAGE_KEY, next)
  }

  function toggleLanguage() {
    setLanguage(language === 'vi' ? 'en' : 'vi')
  }

  const value = useMemo<I18nContextValue>(() => ({
    language,
    setLanguage,
    toggleLanguage,
    t: (vi: string, en: string) => (language === 'vi' ? vi : en),
  }), [language])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider')
  return ctx
}

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { setThai, translate } from './dom'

export type Lang = 'en' | 'th'
const KEY = 'aroma-brew-lang'
interface Ctx { lang: Lang; setLang: (l: Lang) => void; t: (s: string) => string }
const LangContext = createContext<Ctx>({ lang: 'en', setLang: () => {}, t: (s) => s })

function initial(): Lang {
  try { const v = localStorage.getItem(KEY); if (v === 'en' || v === 'th') return v } catch { /* ignore */ }
  return 'en'
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial)
  useLayoutEffect(() => {
    document.documentElement.lang = lang
    setThai(lang === 'th')
    const id = window.setTimeout(() => setThai(lang === 'th'), 80)
    return () => window.clearTimeout(id)
  }, [lang])
  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try { localStorage.setItem(KEY, l) } catch { /* ignore */ }
  }, [])
  const value = useMemo<Ctx>(() => ({ lang, setLang, t: (s) => (lang === 'th' ? translate(s) : s) }), [lang, setLang])
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}
export const useLang = () => useContext(LangContext)

/** Segmented EN | TH switch with a sliding thumb. */
export function LangSwitch({ tone = 'dark', className = '' }: { tone?: 'dark' | 'light'; className?: string }) {
  const { lang, setLang } = useLang()
  return (
    <div className={`lang-switch ${tone} ${className}`.trim()} role="group" aria-label="Language" data-no-i18n>
      <span className="lang-thumb" data-pos={lang} aria-hidden="true" />
      <button type="button" className={lang === 'en' ? 'on' : ''} aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
      <button type="button" className={lang === 'th' ? 'on' : ''} aria-pressed={lang === 'th'} onClick={() => setLang('th')}>TH</button>
    </div>
  )
}

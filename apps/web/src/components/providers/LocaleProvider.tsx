'use client'

import { NextIntlClientProvider } from 'next-intl'
import { useEffect, useState } from 'react'
import { defaultLocale, type Locale, locales } from '@/i18n/config'

// Import all locale messages at build time
import enMessages from '../../../messages/en.json'
import jaMessages from '../../../messages/ja.json'

const messages = {
  en: enMessages,
  ja: jaMessages,
}

/**
 * Client-side locale provider for next-intl
 *
 * This component detects the user's preferred locale on the client side,
 * allowing for static HTML generation while still supporting i18n.
 *
 * Locale detection priority:
 * 1. Cookie (NEXT_LOCALE) - persists user's manual choice
 * 2. Browser language (navigator.language)
 * 3. Default (en)
 */
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>(defaultLocale)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    // Client-side only - detect locale from cookie or browser
    const detectLocale = (): Locale => {
      // 1. Check localStorage first (faster than cookies)
      const stored = localStorage.getItem('NEXT_LOCALE')
      if (stored && locales.includes(stored as Locale)) {
        return stored as Locale
      }

      // 2. Check cookie (user's saved preference from old system)
      const cookieMatch = document.cookie.match(/NEXT_LOCALE=(\w+)/)
      if (cookieMatch) {
        const saved = cookieMatch[1] as Locale
        if (locales.includes(saved)) {
          return saved
        }
      }

      // 3. Check browser language
      const browserLang = navigator.language.split('-')[0].toLowerCase()
      if (locales.includes(browserLang as Locale)) {
        return browserLang as Locale
      }

      // 4. Default fallback
      return defaultLocale
    }

    const detectedLocale = detectLocale()
    setLocale(detectedLocale)
    setIsReady(true)

    // Listen for storage events (when locale changes in another tab or via SettingsMenu)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'NEXT_LOCALE' && e.newValue && locales.includes(e.newValue as Locale)) {
        setLocale(e.newValue as Locale)
      }
    }

    // Listen for custom event (when locale changes in same page)
    const handleLocaleChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ locale: Locale }>
      setLocale(customEvent.detail.locale)
    }

    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('localeChange', handleLocaleChange)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('localeChange', handleLocaleChange)
    }
  }, [])

  // Don't render children until locale is detected (prevents flash of wrong language)
  if (!isReady) {
    return null
  }

  return (
    <NextIntlClientProvider messages={messages[locale]} locale={locale}>
      {children}
    </NextIntlClientProvider>
  )
}

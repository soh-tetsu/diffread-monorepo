import createMiddleware from 'next-intl/middleware'
import { defaultLocale, locales } from './src/i18n/config'

export default createMiddleware({
  // A list of all locales that are supported
  locales,

  // Used when no locale matches
  defaultLocale,

  // Locale detection strategy
  localeDetection: true,

  // Always include locale prefix in URL
  localePrefix: 'always',
})

export const config = {
  // Match only internationalized pathnames
  matcher: ['/', '/(ja|en)/:path*', '/((?!api|_next|_vercel|.*\\..*).*)'],
}

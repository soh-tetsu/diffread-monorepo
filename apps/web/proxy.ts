import { type NextRequest, NextResponse } from 'next/server'
import { defaultLocale, type Locale, locales } from './src/i18n/config'

export function proxy(request: NextRequest) {
  // Check for locale in cookie
  let locale = request.cookies.get('NEXT_LOCALE')?.value as Locale | undefined

  // Fall back to Accept-Language header
  if (!locale) {
    const acceptLanguage = request.headers.get('Accept-Language')
    if (acceptLanguage) {
      const preferredLocale = acceptLanguage.split(',')[0].split('-')[0].toLowerCase()
      locale = locales.includes(preferredLocale as Locale)
        ? (preferredLocale as Locale)
        : defaultLocale
    } else {
      locale = defaultLocale
    }
  }

  // Validate locale
  if (!locales.includes(locale as Locale)) {
    locale = defaultLocale
  }

  // Set x-next-intl-locale header for next-intl
  const response = NextResponse.next()
  response.headers.set('x-next-intl-locale', locale)

  return response
}

export const config = {
  // Match all pathnames except API routes and static files
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
}

import nosecone from '@nosecone/next'
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

  // Create response with locale header
  const response = NextResponse.next()
  response.headers.set('x-next-intl-locale', locale)

  // Apply Nosecone security headers with custom configuration
  // Note: Using 'as any' to work around overly strict TypeScript types
  const securityHeaders = nosecone({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Required for PWA, nosecone adds nonce + unsafe-eval in dev
        styleSrc: ["'self'", "'unsafe-inline'"], // Required for Chakra UI
        imgSrc: ["'self'", 'blob:', 'data:', 'https:'], // Allow external images
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        connectSrc: [
          "'self'",
          process.env.SUPABASE_URL || 'https://*.supabase.co',
          'https://generativelanguage.googleapis.com',
        ] as any,
      },
    },
  })

  // Merge security headers into response
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value as string)
  })

  return response
}

export const config = {
  // Match all pathnames except API routes and static files
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
}

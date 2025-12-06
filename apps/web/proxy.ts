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

  // Apply Nosecone security headers with STATIC configuration (no nonces)
  // By explicitly setting directives without using defaults, we avoid nonce generation
  // This allows Next.js to use static generation instead of dynamic rendering
  const securityHeaders = nosecone({
    contentSecurityPolicy: {
      // CRITICAL: Do not spread defaults here - it would include nonce()
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // PWA requires unsafe-inline
        styleSrc: ["'self'", "'unsafe-inline'"], // Chakra UI requires unsafe-inline
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
        ] as any, // Type assertion for strict types
      },
    },
  })

  // Create response with all headers (security + locale)
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Add locale header
  response.headers.set('x-next-intl-locale', locale)

  // Merge security headers into response
  securityHeaders.forEach((value, key) => {
    response.headers.set(key, value)
  })

  return response
}

export const config = {
  // Match all pathnames except API routes and static files
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
}

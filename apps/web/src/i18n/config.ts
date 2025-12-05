import { getRequestConfig } from 'next-intl/server'

export const locales = ['en', 'ja'] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'en'

export default getRequestConfig(async ({ locale }) => {
  // Default to 'en' if locale is not provided
  const validLocale = locale || defaultLocale

  return {
    locale: validLocale,
    messages: (await import(`../../messages/${validLocale}.json`)).default,
  }
})

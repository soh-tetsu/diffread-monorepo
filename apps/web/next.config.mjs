import withPWAInit from '@ducanh2912/next-pwa'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/config.ts')

const withPWA = withPWAInit({
  dest: 'public',
  disable: true, // Disable - we use custom sw.js
  register: false, // Don't auto-register
  skipWaiting: true,
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@diffread/question-engine'],
}

export default withPWA(withNextIntl(nextConfig))

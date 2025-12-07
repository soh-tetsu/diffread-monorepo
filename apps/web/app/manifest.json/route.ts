import { NextResponse } from 'next/server'

export const runtime = 'edge'

/**
 * Dynamic manifest route - serves different app names/colors for dev vs prod
 * This helps distinguish dev builds when testing via cloudflared tunnel on mobile
 */
export async function GET() {
  const isDev = process.env.NODE_ENV === 'development'

  const manifest = {
    name: isDev ? 'Diffread DEV - Quiz-Guided Reading' : 'Diffread - Quiz-Guided Reading',
    short_name: isDev ? 'Diffread DEV' : 'Diffread',
    description: 'Transform passive reading into active learning with quiz-guided approach',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    // Orange theme for dev, teal for production
    theme_color: isDev ? '#ea580c' : '#0d9488',
    orientation: 'portrait-primary',
    icons: [
      {
        src: isDev ? '/icon-dev-192x192.png' : '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any maskable',
      },
      {
        src: isDev ? '/icon-dev-512x512.png' : '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ],
    share_target: {
      action: '/api/share-target',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        title: 'title',
        text: 'text',
        url: 'url',
        files: [
          {
            name: 'pdf',
            accept: ['application/pdf', '.pdf'],
          },
        ],
      },
    },
  }

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=0, must-revalidate', // Don't cache in dev
    },
  })
}

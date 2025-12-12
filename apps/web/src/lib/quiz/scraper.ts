import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import type { ArticleRow } from '@/types/db'

export class ScrapeError extends Error {
  code: string
  status?: number
  url: string

  constructor(message: string, opts: { code: string; status?: number; url: string }) {
    super(message)
    this.name = 'ScrapeError'
    this.code = opts.code
    this.status = opts.status
    this.url = opts.url
  }
}

export type ScrapedArticle =
  | {
      kind: 'article'
      normalizedUrl: string
      textContent: string
      htmlContent: string
      metadata: {
        title: string | null
        byline: string | null
        excerpt: string | null
        length: number | null
        siteName: string | null
        lang: string | null
      }
    }
  | {
      kind: 'pdf'
      normalizedUrl: string
      pdfBuffer: ArrayBuffer
      sizeBytes: number
      metadata: {
        title: string | null
        byline: string | null
        excerpt: string | null
        length: number | null
        siteName: string | null
        lang: string | null
      }
    }

function stripTracking(url: string): string {
  try {
    const parsed = new URL(url)
    ;['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((param) => {
      parsed.searchParams.delete(param)
    })
    return parsed.toString()
  } catch {
    return url
  }
}

function isPdfResponse(contentType: string | null, requestedUrl: string): boolean {
  if (contentType?.toLowerCase().includes('application/pdf')) {
    return true
  }
  return requestedUrl.toLowerCase().includes('.pdf')
}

/**
 * Lightweight title extraction without full article scraping
 * Fetches only the HTML head section to extract title metadata
 *
 * @param normalizedUrl - The normalized article URL
 * @returns Title from og:title, twitter:title, or <title> tag, or null if not found
 */
export async function fetchArticleTitle(normalizedUrl: string): Promise<string | null> {
  const targetUrl = stripTracking(normalizedUrl)

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:118.0) Gecko/20100101 Firefox/118.0',
        accept: 'text/html,application/xhtml+xml',
      },
    })

    if (!response.ok) {
      return null
    }

    // Check if it's a PDF - PDFs don't have HTML titles
    if (isPdfResponse(response.headers.get('content-type'), response.url || targetUrl)) {
      return null
    }

    // Read response as text
    const html = await response.text()

    // Parse with JSDOM (only need document head)
    const dom = new JSDOM(html, { url: targetUrl })
    const doc = dom.window.document

    // Priority 1: Open Graph title
    const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content')
    if (ogTitle?.trim()) {
      return ogTitle.trim()
    }

    // Priority 2: Twitter title
    const twitterTitle = doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content')
    if (twitterTitle?.trim()) {
      return twitterTitle.trim()
    }

    // Priority 3: Standard <title> tag
    const title = doc.title?.trim()
    if (title) {
      return title
    }

    return null
  } catch (error) {
    // Silently fail - title fetching is opportunistic, not critical
    console.error('Failed to fetch article title:', error)
    return null
  }
}

export async function scrapeArticle(article: ArticleRow): Promise<ScrapedArticle> {
  const targetUrl = stripTracking(article.normalized_url)
  const response = await fetch(targetUrl, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:118.0) Gecko/20100101 Firefox/118.0',
      accept: 'text/html,application/xhtml+xml,application/pdf',
    },
  })

  if (!response.ok) {
    throw new ScrapeError(`Failed to fetch article (${response.status})`, {
      code: 'FETCH_FAILED',
      status: response.status,
      url: targetUrl,
    })
  }

  const finalUrl = stripTracking(response.url || targetUrl)

  if (isPdfResponse(response.headers.get('content-type'), finalUrl)) {
    const pdfBuffer = await response.arrayBuffer()
    if (pdfBuffer.byteLength === 0) {
      throw new ScrapeError('PDF response was empty.', {
        code: 'PDF_EMPTY',
        url: finalUrl,
      })
    }

    return {
      kind: 'pdf',
      normalizedUrl: finalUrl,
      pdfBuffer,
      sizeBytes: pdfBuffer.byteLength,
      metadata: {
        title: null,
        byline: null,
        excerpt: `PDF content fetched from ${finalUrl}`,
        length: pdfBuffer.byteLength,
        siteName: (() => {
          try {
            return new URL(finalUrl).hostname
          } catch {
            return null
          }
        })(),
        lang: null,
      },
    }
  }

  const html = await response.text()
  const dom = new JSDOM(html, { url: finalUrl })
  const reader = new Readability(dom.window.document, {
    keepClasses: false,
  })
  const articleDoc = reader.parse()

  if (!articleDoc || !articleDoc.content) {
    throw new ScrapeError('Unable to extract article content.', {
      code: 'READABILITY_EMPTY',
      url: targetUrl,
    })
  }

  const htmlContent = articleDoc.content?.trim() ?? ''
  const textContent = articleDoc.textContent?.trim() ?? ''
  if (!htmlContent || !textContent) {
    throw new ScrapeError('Readability produced empty content.', {
      code: 'READABILITY_EMPTY_CONTENT',
      url: finalUrl,
    })
  }

  if (textContent.length <= 300) {
    throw new ScrapeError(`Article text appears too short (${textContent.length} chars).`, {
      code: 'CONTENT_TOO_SHORT',
      url: finalUrl,
    })
  }

  return {
    kind: 'article',
    normalizedUrl: finalUrl,
    textContent,
    htmlContent,
    metadata: {
      title: articleDoc.title ?? dom.window.document.title ?? null,
      byline: articleDoc.byline ?? null,
      excerpt: articleDoc.excerpt ?? null,
      length: typeof articleDoc.length === 'number' ? articleDoc.length : null,
      siteName: articleDoc.siteName ?? null,
      lang: articleDoc.lang ?? dom.window.document.documentElement.getAttribute('lang') ?? null,
    },
  }
}

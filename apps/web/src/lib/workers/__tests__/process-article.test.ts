/**
 * Tests for process-article.ts
 *
 * Tests the article processing pipeline:
 * - Ensuring article exists via RPC
 * - Article state machine transitions
 * - Claiming articles for scraping
 * - Retry logic for scraping failures
 * - Error handling and result status
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ArticleInvalidStateError,
  ArticleRetryableError,
  ArticleTerminalError,
} from '@/lib/errors/article-errors'
import type { ArticleRow, SessionRow } from '@/types/db'
import { processArticle } from '../process-article'

// Mock dependencies
vi.mock('@/lib/db/articles', () => ({
  claimArticleForScraping: vi.fn(),
  getArticleById: vi.fn(),
  updateArticleStatus: vi.fn(),
}))

vi.mock('@/lib/workflows/article-content', () => ({
  ensureArticleContent: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Import mocked modules
import { claimArticleForScraping } from '@/lib/db/articles'
import { supabase } from '@/lib/supabase'
import { ensureArticleContent } from '@/lib/workflows/article-content'

describe('processArticle', () => {
  const mockSession: SessionRow = {
    id: 1,
    session_token: 'test-token',
    user_id: 'user-123',
    user_email: 'test@example.com',
    article_url: 'https://example.com/article',
    quiz_id: null,
    status: 'pending',
    study_status: 'not_started',
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const createMockArticle = (overrides: Partial<ArticleRow> = {}): ArticleRow => ({
    id: 100,
    normalized_url: 'https://example.com/article',
    original_url: 'https://example.com/article',
    status: 'pending',
    error_message: null,
    storage_path: null,
    content_hash: null,
    last_scraped_at: null,
    metadata: {},
    storage_metadata: {},
    content_medium: 'html',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('ensureArticleExists RPC', () => {
    it('creates new article when it does not exist', async () => {
      const mockArticle = createMockArticle()

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [
          {
            article_id: mockArticle.id,
            normalized_url: mockArticle.normalized_url,
            original_url: mockArticle.original_url,
            status: 'pending',
            created_at: mockArticle.created_at,
          },
        ],
        error: null,
      })

      vi.mocked(claimArticleForScraping).mockResolvedValueOnce({ claimed: true })
      vi.mocked(ensureArticleContent).mockResolvedValueOnce({ article: mockArticle })

      const result = await processArticle(mockSession)

      expect(supabase.rpc).toHaveBeenCalledWith('ensure_article_exists', {
        p_normalized_url: mockSession.article_url,
        p_original_url: mockSession.article_url,
      })
      expect(result.status).toBe('success')
      expect(result.resourceType).toBe('article')
    })

    it('returns existing article when already created', async () => {
      const mockArticle = createMockArticle({
        status: 'ready',
        storage_path: 'article/100/content.md',
        last_scraped_at: new Date().toISOString(),
      })

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [
          {
            article_id: mockArticle.id,
            normalized_url: mockArticle.normalized_url,
            original_url: mockArticle.original_url,
            status: 'ready',
            created_at: mockArticle.created_at,
          },
        ],
        error: null,
      })

      const result = await processArticle(mockSession)

      expect(result.status).toBe('success')
      expect(result.article?.id).toBe(mockArticle.id)
      expect(claimArticleForScraping).not.toHaveBeenCalled()
    })

    it('handles RPC error gracefully', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: { message: 'Database connection failed' } as any,
      })

      const result = await processArticle(mockSession)

      expect(result.status).toBe('failed')
      expect(result.error).toContain('Failed to ensure article exists')
      expect(result.error).toContain('Database connection failed')
    })

    it('handles empty RPC response', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [],
        error: null,
      })

      const result = await processArticle(mockSession)

      expect(result.status).toBe('failed')
      expect(result.error).toContain('RPC returned no data')
    })
  })

  describe('article state machine', () => {
    it('skips scraping for ready and fresh article', async () => {
      const recentDate = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString() // 1 day ago
      const mockArticle = createMockArticle({
        status: 'ready',
        storage_path: 'article/100/content.md',
        last_scraped_at: recentDate,
      })

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [
          {
            article_id: mockArticle.id,
            normalized_url: mockArticle.normalized_url,
            original_url: mockArticle.original_url,
            status: 'ready',
            created_at: mockArticle.created_at,
          },
        ],
        error: null,
      })

      const result = await processArticle(mockSession)

      expect(result.status).toBe('success')
      expect(claimArticleForScraping).not.toHaveBeenCalled()
      expect(ensureArticleContent).not.toHaveBeenCalled()
    })

    it('attempts scraping for stale article', async () => {
      const oldDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 31).toISOString() // 31 days ago
      const mockArticle = createMockArticle({
        status: 'ready',
        storage_path: 'article/100/content.md',
        last_scraped_at: oldDate,
      })

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [
          {
            article_id: mockArticle.id,
            normalized_url: mockArticle.normalized_url,
            original_url: mockArticle.original_url,
            status: 'ready',
            created_at: mockArticle.created_at,
          },
        ],
        error: null,
      })

      vi.mocked(claimArticleForScraping).mockResolvedValueOnce({ claimed: true })
      vi.mocked(ensureArticleContent).mockResolvedValueOnce({ article: mockArticle })

      const result = await processArticle(mockSession)

      expect(result.status).toBe('success')
      expect(claimArticleForScraping).toHaveBeenCalledWith(mockArticle.id)
      expect(ensureArticleContent).toHaveBeenCalled()
    })

    it('attempts scraping for pending article', async () => {
      const mockArticle = createMockArticle({ status: 'pending' })

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [
          {
            article_id: mockArticle.id,
            normalized_url: mockArticle.normalized_url,
            original_url: mockArticle.original_url,
            status: 'pending',
            created_at: mockArticle.created_at,
          },
        ],
        error: null,
      })

      vi.mocked(claimArticleForScraping).mockResolvedValueOnce({ claimed: true })
      vi.mocked(ensureArticleContent).mockResolvedValueOnce({ article: mockArticle })

      const result = await processArticle(mockSession)

      expect(result.status).toBe('success')
      expect(claimArticleForScraping).toHaveBeenCalledWith(mockArticle.id)
    })

    it('attempts scraping for failed article', async () => {
      const mockArticle = createMockArticle({ status: 'failed' })

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [
          {
            article_id: mockArticle.id,
            normalized_url: mockArticle.normalized_url,
            original_url: mockArticle.original_url,
            status: 'failed',
            created_at: mockArticle.created_at,
          },
        ],
        error: null,
      })

      vi.mocked(claimArticleForScraping).mockResolvedValueOnce({ claimed: true })
      vi.mocked(ensureArticleContent).mockResolvedValueOnce({ article: mockArticle })

      const result = await processArticle(mockSession)

      expect(result.status).toBe('success')
      expect(claimArticleForScraping).toHaveBeenCalledWith(mockArticle.id)
    })
  })

  describe('claiming and scraping', () => {
    it('succeeds when article is claimed and scraped', async () => {
      const mockArticle = createMockArticle({ status: 'pending' })
      const scrapedArticle = createMockArticle({
        status: 'ready',
        storage_path: 'article/100/content.md',
      })

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [
          {
            article_id: mockArticle.id,
            normalized_url: mockArticle.normalized_url,
            original_url: mockArticle.original_url,
            status: 'pending',
            created_at: mockArticle.created_at,
          },
        ],
        error: null,
      })

      vi.mocked(claimArticleForScraping).mockResolvedValueOnce({ claimed: true })
      vi.mocked(ensureArticleContent).mockResolvedValueOnce({ article: scrapedArticle })

      const result = await processArticle(mockSession)

      expect(result.status).toBe('success')
      expect(result.article?.storage_path).toBe('article/100/content.md')
      expect(ensureArticleContent).toHaveBeenCalledWith(mockArticle)
    })

    it('handles article not claimable (already processing)', async () => {
      const mockArticle = createMockArticle({ status: 'pending' })

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [
          {
            article_id: mockArticle.id,
            normalized_url: mockArticle.normalized_url,
            original_url: mockArticle.original_url,
            status: 'pending',
            created_at: mockArticle.created_at,
          },
        ],
        error: null,
      })

      vi.mocked(claimArticleForScraping).mockResolvedValueOnce({ claimed: false })

      const result = await processArticle(mockSession)

      expect(result.status).toBe('failed')
      expect(result.error).toContain('Article not claimable')
    })
  })

  describe('retry logic', () => {
    it('retries scraping on transient failure', async () => {
      const mockArticle = createMockArticle({ status: 'pending' })
      const scrapedArticle = createMockArticle({ status: 'ready' })

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [
          {
            article_id: mockArticle.id,
            normalized_url: mockArticle.normalized_url,
            original_url: mockArticle.original_url,
            status: 'pending',
            created_at: mockArticle.created_at,
          },
        ],
        error: null,
      })

      vi.mocked(claimArticleForScraping).mockResolvedValue({ claimed: true })

      // First attempt fails, second succeeds
      vi.mocked(ensureArticleContent)
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce({ article: scrapedArticle })

      const result = await processArticle(mockSession)

      expect(result.status).toBe('success')
      expect(ensureArticleContent).toHaveBeenCalledTimes(2)
    })

    it('fails after all retry attempts exhausted', async () => {
      const mockArticle = createMockArticle({ status: 'pending' })

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [
          {
            article_id: mockArticle.id,
            normalized_url: mockArticle.normalized_url,
            original_url: mockArticle.original_url,
            status: 'pending',
            created_at: mockArticle.created_at,
          },
        ],
        error: null,
      })

      vi.mocked(claimArticleForScraping).mockResolvedValue({ claimed: true })
      vi.mocked(ensureArticleContent).mockRejectedValue(new Error('Scraping failed'))

      const result = await processArticle(mockSession)

      expect(result.status).toBe('failed')
      expect(result.error).toContain('Article processing error')
      expect(ensureArticleContent).toHaveBeenCalledTimes(2) // maxAttempts: 2
    })
  })

  describe('error handling', () => {
    it('handles ArticleTerminalError', async () => {
      const mockArticle = createMockArticle({ status: 'pending' })

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [
          {
            article_id: mockArticle.id,
            normalized_url: mockArticle.normalized_url,
            original_url: mockArticle.original_url,
            status: 'pending',
            created_at: mockArticle.created_at,
          },
        ],
        error: null,
      })

      vi.mocked(claimArticleForScraping).mockResolvedValueOnce({ claimed: true })
      vi.mocked(ensureArticleContent).mockRejectedValueOnce(
        new ArticleTerminalError('Article permanently failed', mockArticle.id, 'skip_by_failure')
      )

      const result = await processArticle(mockSession)

      expect(result.status).toBe('failed')
      expect(result.error).toContain('Article terminal error')
    })

    it('handles ArticleInvalidStateError', async () => {
      const mockArticle = createMockArticle({ status: 'pending' })

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [
          {
            article_id: mockArticle.id,
            normalized_url: mockArticle.normalized_url,
            original_url: mockArticle.original_url,
            status: 'pending',
            created_at: mockArticle.created_at,
          },
        ],
        error: null,
      })

      vi.mocked(claimArticleForScraping).mockResolvedValueOnce({ claimed: true })
      vi.mocked(ensureArticleContent).mockRejectedValueOnce(
        new ArticleInvalidStateError('Invalid state', mockArticle.id, 'unknown')
      )

      const result = await processArticle(mockSession)

      expect(result.status).toBe('failed')
      expect(result.error).toContain('Article terminal error')
    })

    it('handles ArticleRetryableError', async () => {
      const mockArticle = createMockArticle({ status: 'pending' })

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [
          {
            article_id: mockArticle.id,
            normalized_url: mockArticle.normalized_url,
            original_url: mockArticle.original_url,
            status: 'pending',
            created_at: mockArticle.created_at,
          },
        ],
        error: null,
      })

      vi.mocked(claimArticleForScraping).mockResolvedValue({ claimed: true })
      vi.mocked(ensureArticleContent).mockRejectedValue(
        new ArticleRetryableError('Temporary failure', mockArticle.id)
      )

      const result = await processArticle(mockSession)

      expect(result.status).toBe('failed')
      expect(result.error).toContain('Article retryable error')
    })

    it('handles generic errors', async () => {
      const mockArticle = createMockArticle({ status: 'pending' })

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [
          {
            article_id: mockArticle.id,
            normalized_url: mockArticle.normalized_url,
            original_url: mockArticle.original_url,
            status: 'pending',
            created_at: mockArticle.created_at,
          },
        ],
        error: null,
      })

      vi.mocked(claimArticleForScraping).mockResolvedValueOnce({ claimed: true })
      vi.mocked(ensureArticleContent).mockRejectedValueOnce(new Error('Unknown error'))

      const result = await processArticle(mockSession)

      expect(result.status).toBe('failed')
      expect(result.error).toContain('Article processing error')
      expect(result.error).toContain('Unknown error')
    })

    it('handles non-Error objects thrown', async () => {
      const mockArticle = createMockArticle({ status: 'pending' })

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [
          {
            article_id: mockArticle.id,
            normalized_url: mockArticle.normalized_url,
            original_url: mockArticle.original_url,
            status: 'pending',
            created_at: mockArticle.created_at,
          },
        ],
        error: null,
      })

      vi.mocked(claimArticleForScraping).mockResolvedValueOnce({ claimed: true })
      vi.mocked(ensureArticleContent).mockRejectedValueOnce('String error')

      const result = await processArticle(mockSession)

      expect(result.status).toBe('failed')
      expect(result.error).toBeDefined()
    })
  })

  describe('unexpected errors', () => {
    it('handles unexpected errors in outer catch', async () => {
      vi.mocked(supabase.rpc).mockRejectedValueOnce(new Error('Unexpected database error'))

      const result = await processArticle(mockSession)

      expect(result.status).toBe('failed')
      expect(result.error).toContain('Unexpected article processing error')
    })
  })
})

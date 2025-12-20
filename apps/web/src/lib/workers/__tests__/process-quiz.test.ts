/**
 * Tests for process-quiz.ts
 *
 * Tests the quiz container creation:
 * - Ensuring quiz exists via RPC
 * - Creating quiz when missing
 * - Returning existing quiz
 * - Error handling
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ArticleRow, QuizRow } from '@/types/db'
import { processQuiz } from '../process-quiz'

// Mock dependencies
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
import { supabase } from '@/lib/supabase'

describe('processQuiz', () => {
  const mockArticle: ArticleRow = {
    id: 100,
    normalized_url: 'https://example.com/article',
    original_url: 'https://example.com/article',
    status: 'ready',
    error_message: null,
    storage_path: 'article/100/content.md',
    content_hash: 'abc123',
    last_scraped_at: new Date().toISOString(),
    metadata: {},
    storage_metadata: {},
    content_medium: 'html',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('ensure_quiz_exists RPC', () => {
    it('creates new quiz when it does not exist', async () => {
      const mockQuizId = 200

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [
          {
            quiz_id: mockQuizId,
            article_id: mockArticle.id,
            created_at: new Date().toISOString(),
          },
        ],
        error: null,
      })

      const result = await processQuiz(mockArticle)

      expect(supabase.rpc).toHaveBeenCalledWith('ensure_quiz_exists', {
        p_article_id: mockArticle.id,
      })
      expect(result.status).toBe('success')
      expect(result.resourceType).toBe('quiz')
      expect(result.resourceId).toBe(mockQuizId)
      expect(result.quiz).toBeDefined()
      expect(result.quiz?.id).toBe(mockQuizId)
      expect(result.quiz?.article_id).toBe(mockArticle.id)
    })

    it('returns existing quiz when already created', async () => {
      const existingQuizId = 250

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [
          {
            quiz_id: existingQuizId,
            article_id: mockArticle.id,
            created_at: new Date().toISOString(),
          },
        ],
        error: null,
      })

      const result = await processQuiz(mockArticle)

      expect(result.status).toBe('success')
      expect(result.quiz?.id).toBe(existingQuizId)
      expect(result.quiz?.article_id).toBe(mockArticle.id)
    })

    it('sets variant to null by default', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [
          {
            quiz_id: 200,
            article_id: mockArticle.id,
            created_at: new Date().toISOString(),
          },
        ],
        error: null,
      })

      const result = await processQuiz(mockArticle)

      expect(result.quiz?.variant).toBeNull()
    })
  })

  describe('RPC error handling', () => {
    it('handles RPC error gracefully', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: { message: 'Database constraint violation' } as any,
      })

      const result = await processQuiz(mockArticle)

      expect(result.status).toBe('failed')
      expect(result.resourceType).toBe('quiz')
      expect(result.resourceId).toBe(mockArticle.id)
      expect(result.error).toContain('Failed to ensure quiz exists')
      expect(result.error).toContain('Database constraint violation')
      expect(result.quiz).toBeUndefined()
    })

    it('handles empty RPC response', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [],
        error: null,
      })

      const result = await processQuiz(mockArticle)

      expect(result.status).toBe('failed')
      expect(result.error).toContain('RPC returned no data')
      expect(result.quiz).toBeUndefined()
    })

    it('handles null RPC data', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: null,
      })

      const result = await processQuiz(mockArticle)

      expect(result.status).toBe('failed')
      expect(result.error).toContain('RPC returned no data')
    })
  })

  describe('exception handling', () => {
    it('handles unexpected Error thrown during RPC', async () => {
      vi.mocked(supabase.rpc).mockRejectedValueOnce(new Error('Network connection lost'))

      const result = await processQuiz(mockArticle)

      expect(result.status).toBe('failed')
      expect(result.error).toContain('Quiz processing error')
      expect(result.error).toContain('Network connection lost')
      expect(result.quiz).toBeUndefined()
    })

    it('handles non-Error thrown during RPC', async () => {
      vi.mocked(supabase.rpc).mockRejectedValueOnce('String error message')

      const result = await processQuiz(mockArticle)

      expect(result.status).toBe('failed')
      expect(result.error).toContain('Quiz processing error')
      expect(result.quiz).toBeUndefined()
    })

    it('handles RPC returning unexpected data format', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [
          {
            // Missing required fields
            quiz_id: null,
            article_id: null,
          },
        ],
        error: null,
      } as any)

      const result = await processQuiz(mockArticle)

      // Should still succeed but with null values
      expect(result.status).toBe('success')
      expect(result.quiz?.id).toBeNull()
      expect(result.quiz?.article_id).toBeNull()
    })
  })

  describe('concurrency handling', () => {
    it('handles concurrent quiz creation attempts', async () => {
      const quizId = 300

      vi.mocked(supabase.rpc).mockResolvedValue({
        data: [
          {
            quiz_id: quizId,
            article_id: mockArticle.id,
            created_at: new Date().toISOString(),
          },
        ],
        error: null,
      })

      // Simulate concurrent requests
      const [result1, result2, result3] = await Promise.all([
        processQuiz(mockArticle),
        processQuiz(mockArticle),
        processQuiz(mockArticle),
      ])

      // All should succeed with same quiz
      expect(result1.status).toBe('success')
      expect(result2.status).toBe('success')
      expect(result3.status).toBe('success')

      expect(result1.quiz?.id).toBe(quizId)
      expect(result2.quiz?.id).toBe(quizId)
      expect(result3.quiz?.id).toBe(quizId)
    })
  })

  describe('quiz structure validation', () => {
    it('creates quiz with all required fields', async () => {
      const now = new Date().toISOString()

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [
          {
            quiz_id: 400,
            article_id: mockArticle.id,
            created_at: now,
          },
        ],
        error: null,
      })

      const result = await processQuiz(mockArticle)

      const quiz = result.quiz as QuizRow

      expect(quiz).toMatchObject({
        id: 400,
        article_id: mockArticle.id,
        variant: null,
        created_at: now,
      })

      // updated_at should be set to current time
      expect(quiz.updated_at).toBeDefined()
      expect(new Date(quiz.updated_at).getTime()).toBeGreaterThan(0)
    })
  })

  describe('idempotency', () => {
    it('returns same quiz when called multiple times sequentially', async () => {
      const quizId = 500

      vi.mocked(supabase.rpc).mockResolvedValue({
        data: [
          {
            quiz_id: quizId,
            article_id: mockArticle.id,
            created_at: new Date().toISOString(),
          },
        ],
        error: null,
      })

      const result1 = await processQuiz(mockArticle)
      const result2 = await processQuiz(mockArticle)

      expect(result1.status).toBe('success')
      expect(result2.status).toBe('success')
      expect(result1.quiz?.id).toBe(quizId)
      expect(result2.quiz?.id).toBe(quizId)
    })
  })
})

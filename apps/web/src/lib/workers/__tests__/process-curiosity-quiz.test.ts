/**
 * Tests for process-curiosity-quiz.ts
 *
 * Tests the curiosity quiz creation:
 * - Ensuring curiosity quiz exists via RPC
 * - Creating curiosity quiz when missing
 * - Returning existing curiosity quiz
 * - Initial status setting
 * - Error handling
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CuriosityQuizRow, QuizRow } from '@/types/db'
import { processCuriosityQuiz } from '../process-curiosity-quiz'

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

describe('processCuriosityQuiz', () => {
  const mockQuiz: QuizRow = {
    id: 200,
    article_id: 100,
    variant: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('ensure_curiosity_quiz_exists RPC', () => {
    it('creates new curiosity quiz when it does not exist', async () => {
      const mockCuriosityQuizId = 300

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [
          {
            curiosity_quiz_id: mockCuriosityQuizId,
            quiz_id: mockQuiz.id,
            status: 'pending',
            created_at: new Date().toISOString(),
          },
        ],
        error: null,
      })

      const result = await processCuriosityQuiz(mockQuiz)

      expect(supabase.rpc).toHaveBeenCalledWith('ensure_curiosity_quiz_exists', {
        p_quiz_id: mockQuiz.id,
      })
      expect(result.status).toBe('success')
      expect(result.resourceType).toBe('curiosityQuiz')
      expect(result.resourceId).toBe(mockCuriosityQuizId)
      expect(result.curiosityQuiz).toBeDefined()
      expect(result.curiosityQuiz?.id).toBe(mockCuriosityQuizId)
      expect(result.curiosityQuiz?.quiz_id).toBe(mockQuiz.id)
    })

    it('returns existing curiosity quiz when already created', async () => {
      const existingCuriosityQuizId = 350

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [
          {
            curiosity_quiz_id: existingCuriosityQuizId,
            quiz_id: mockQuiz.id,
            status: 'pending',
            created_at: new Date().toISOString(),
          },
        ],
        error: null,
      })

      const result = await processCuriosityQuiz(mockQuiz)

      expect(result.status).toBe('success')
      expect(result.curiosityQuiz?.id).toBe(existingCuriosityQuizId)
      expect(result.curiosityQuiz?.quiz_id).toBe(mockQuiz.id)
    })

    it('initializes curiosity quiz with pending status', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [
          {
            curiosity_quiz_id: 300,
            quiz_id: mockQuiz.id,
            status: 'pending',
            created_at: new Date().toISOString(),
          },
        ],
        error: null,
      })

      const result = await processCuriosityQuiz(mockQuiz)

      expect(result.curiosityQuiz?.status).toBe('pending')
    })

    it('initializes fields to null', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [
          {
            curiosity_quiz_id: 300,
            quiz_id: mockQuiz.id,
            status: 'pending',
            created_at: new Date().toISOString(),
          },
        ],
        error: null,
      })

      const result = await processCuriosityQuiz(mockQuiz)

      const curiosityQuiz = result.curiosityQuiz as CuriosityQuizRow

      expect(curiosityQuiz.questions).toBeNull()
      expect(curiosityQuiz.pedagogy).toBeNull()
      expect(curiosityQuiz.model_version).toBeNull()
      expect(curiosityQuiz.error_message).toBeNull()
      expect(curiosityQuiz.retry_count).toBe(0)
    })
  })

  describe('RPC error handling', () => {
    it('handles RPC error gracefully', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: { message: 'Foreign key constraint failed' } as any,
      })

      const result = await processCuriosityQuiz(mockQuiz)

      expect(result.status).toBe('failed')
      expect(result.resourceType).toBe('curiosityQuiz')
      expect(result.resourceId).toBe(mockQuiz.id)
      expect(result.error).toContain('Failed to ensure curiosity quiz exists')
      expect(result.error).toContain('Foreign key constraint failed')
      expect(result.curiosityQuiz).toBeUndefined()
    })

    it('handles empty RPC response', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [],
        error: null,
      })

      const result = await processCuriosityQuiz(mockQuiz)

      expect(result.status).toBe('failed')
      expect(result.error).toContain('RPC returned no data')
      expect(result.curiosityQuiz).toBeUndefined()
    })

    it('handles null RPC data', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: null,
      })

      const result = await processCuriosityQuiz(mockQuiz)

      expect(result.status).toBe('failed')
      expect(result.error).toContain('RPC returned no data')
    })
  })

  describe('exception handling', () => {
    it('handles unexpected Error thrown during RPC', async () => {
      vi.mocked(supabase.rpc).mockRejectedValueOnce(new Error('Connection timeout'))

      const result = await processCuriosityQuiz(mockQuiz)

      expect(result.status).toBe('failed')
      expect(result.error).toContain('Curiosity quiz processing error')
      expect(result.error).toContain('Connection timeout')
      expect(result.curiosityQuiz).toBeUndefined()
    })

    it('handles non-Error thrown during RPC', async () => {
      vi.mocked(supabase.rpc).mockRejectedValueOnce('Unexpected failure')

      const result = await processCuriosityQuiz(mockQuiz)

      expect(result.status).toBe('failed')
      expect(result.error).toContain('Curiosity quiz processing error')
      expect(result.curiosityQuiz).toBeUndefined()
    })

    it('handles RPC returning malformed data', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [
          {
            // Missing required fields
            curiosity_quiz_id: null,
            quiz_id: null,
          },
        ],
        error: null,
      } as any)

      const result = await processCuriosityQuiz(mockQuiz)

      // Should succeed but with null values
      expect(result.status).toBe('success')
      expect(result.curiosityQuiz?.id).toBeNull()
      expect(result.curiosityQuiz?.quiz_id).toBeNull()
    })
  })

  describe('concurrency handling', () => {
    it('handles concurrent curiosity quiz creation attempts', async () => {
      const curiosityQuizId = 400

      vi.mocked(supabase.rpc).mockResolvedValue({
        data: [
          {
            curiosity_quiz_id: curiosityQuizId,
            quiz_id: mockQuiz.id,
            status: 'pending',
            created_at: new Date().toISOString(),
          },
        ],
        error: null,
      })

      // Simulate concurrent requests
      const [result1, result2, result3] = await Promise.all([
        processCuriosityQuiz(mockQuiz),
        processCuriosityQuiz(mockQuiz),
        processCuriosityQuiz(mockQuiz),
      ])

      // All should succeed with same curiosity quiz
      expect(result1.status).toBe('success')
      expect(result2.status).toBe('success')
      expect(result3.status).toBe('success')

      expect(result1.curiosityQuiz?.id).toBe(curiosityQuizId)
      expect(result2.curiosityQuiz?.id).toBe(curiosityQuizId)
      expect(result3.curiosityQuiz?.id).toBe(curiosityQuizId)
    })
  })

  describe('curiosity quiz structure validation', () => {
    it('creates curiosity quiz with all required fields', async () => {
      const now = new Date().toISOString()

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [
          {
            curiosity_quiz_id: 500,
            quiz_id: mockQuiz.id,
            status: 'pending',
            created_at: now,
          },
        ],
        error: null,
      })

      const result = await processCuriosityQuiz(mockQuiz)

      const curiosityQuiz = result.curiosityQuiz as CuriosityQuizRow

      expect(curiosityQuiz).toMatchObject({
        id: 500,
        quiz_id: mockQuiz.id,
        status: 'pending',
        questions: null,
        pedagogy: null,
        model_version: null,
        error_message: null,
        retry_count: 0,
        created_at: now,
      })

      // updated_at should be set to current time
      expect(curiosityQuiz.updated_at).toBeDefined()
      expect(new Date(curiosityQuiz.updated_at).getTime()).toBeGreaterThan(0)
    })
  })

  describe('status variations', () => {
    it('preserves status from RPC response', async () => {
      const statuses: Array<CuriosityQuizRow['status']> = [
        'pending',
        'processing',
        'ready',
        'failed',
        'skip_by_failure',
      ]

      for (const status of statuses) {
        vi.mocked(supabase.rpc).mockResolvedValueOnce({
          data: [
            {
              curiosity_quiz_id: 600,
              quiz_id: mockQuiz.id,
              status,
              created_at: new Date().toISOString(),
            },
          ],
          error: null,
        })

        const result = await processCuriosityQuiz(mockQuiz)

        expect(result.curiosityQuiz?.status).toBe(status)
      }
    })
  })

  describe('idempotency', () => {
    it('returns same curiosity quiz when called multiple times sequentially', async () => {
      const curiosityQuizId = 700

      vi.mocked(supabase.rpc).mockResolvedValue({
        data: [
          {
            curiosity_quiz_id: curiosityQuizId,
            quiz_id: mockQuiz.id,
            status: 'pending',
            created_at: new Date().toISOString(),
          },
        ],
        error: null,
      })

      const result1 = await processCuriosityQuiz(mockQuiz)
      const result2 = await processCuriosityQuiz(mockQuiz)

      expect(result1.status).toBe('success')
      expect(result2.status).toBe('success')
      expect(result1.curiosityQuiz?.id).toBe(curiosityQuizId)
      expect(result2.curiosityQuiz?.id).toBe(curiosityQuizId)
    })
  })

  describe('different quiz inputs', () => {
    it('creates curiosity quiz for different quiz IDs', async () => {
      const quiz1: QuizRow = { ...mockQuiz, id: 1000 }
      const quiz2: QuizRow = { ...mockQuiz, id: 2000 }

      vi.mocked(supabase.rpc)
        .mockResolvedValueOnce({
          data: [
            {
              curiosity_quiz_id: 10000,
              quiz_id: quiz1.id,
              status: 'pending',
              created_at: new Date().toISOString(),
            },
          ],
          error: null,
        })
        .mockResolvedValueOnce({
          data: [
            {
              curiosity_quiz_id: 20000,
              quiz_id: quiz2.id,
              status: 'pending',
              created_at: new Date().toISOString(),
            },
          ],
          error: null,
        })

      const result1 = await processCuriosityQuiz(quiz1)
      const result2 = await processCuriosityQuiz(quiz2)

      expect(result1.curiosityQuiz?.quiz_id).toBe(quiz1.id)
      expect(result2.curiosityQuiz?.quiz_id).toBe(quiz2.id)
      expect(result1.curiosityQuiz?.id).not.toBe(result2.curiosityQuiz?.id)
    })
  })
})

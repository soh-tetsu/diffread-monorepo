/**
 * Tests for process-result.ts
 *
 * Tests the ProcessResult type helper functions that create result objects
 * for tracking worker pipeline execution status.
 */

import { describe, expect, it } from 'vitest'
import { failedResult, type ProcessResult, skippedResult, successResult } from '../process-result'

describe('process-result helpers', () => {
  describe('successResult', () => {
    it('creates success result for article', () => {
      const result = successResult('article', 123)

      expect(result).toEqual({
        resourceType: 'article',
        resourceId: 123,
        status: 'success',
      })
      expect(result.error).toBeUndefined()
    })

    it('creates success result for quiz', () => {
      const result = successResult('quiz', 456)

      expect(result).toEqual({
        resourceType: 'quiz',
        resourceId: 456,
        status: 'success',
      })
    })

    it('creates success result for curiosityQuiz', () => {
      const result = successResult('curiosityQuiz', 789)

      expect(result).toEqual({
        resourceType: 'curiosityQuiz',
        resourceId: 789,
        status: 'success',
      })
    })

    it('creates success result for generation', () => {
      const result = successResult('generation', 101)

      expect(result).toEqual({
        resourceType: 'generation',
        resourceId: 101,
        status: 'success',
      })
    })
  })

  describe('skippedResult', () => {
    it('creates skipped result without error message', () => {
      const result = skippedResult('article', 123)

      expect(result).toEqual({
        resourceType: 'article',
        resourceId: 123,
        status: 'skipped',
      })
      expect(result.error).toBeUndefined()
    })

    it('creates skipped result with error message', () => {
      const result = skippedResult('quiz', 456, 'Already exists')

      expect(result).toEqual({
        resourceType: 'quiz',
        resourceId: 456,
        status: 'skipped',
        error: 'Already exists',
      })
    })

    it('creates skipped result for curiosityQuiz with reason', () => {
      const result = skippedResult('curiosityQuiz', 789, 'Exhausted retries')

      expect(result).toEqual({
        resourceType: 'curiosityQuiz',
        resourceId: 789,
        status: 'skipped',
        error: 'Exhausted retries',
      })
    })
  })

  describe('failedResult', () => {
    it('creates failed result with error message', () => {
      const result = failedResult('article', 123, 'Scraping failed')

      expect(result).toEqual({
        resourceType: 'article',
        resourceId: 123,
        status: 'failed',
        error: 'Scraping failed',
      })
    })

    it('creates failed result for quiz', () => {
      const result = failedResult('quiz', 456, 'Database error')

      expect(result).toEqual({
        resourceType: 'quiz',
        resourceId: 456,
        status: 'failed',
        error: 'Database error',
      })
    })

    it('creates failed result for generation with detailed error', () => {
      const result = failedResult('generation', 789, 'Gemini API error: rate limit exceeded')

      expect(result).toEqual({
        resourceType: 'generation',
        resourceId: 789,
        status: 'failed',
        error: 'Gemini API error: rate limit exceeded',
      })
    })
  })

  describe('type guards', () => {
    it('success result has no error field', () => {
      const result: ProcessResult = successResult('article', 1)
      expect(result.error).toBeUndefined()
    })

    it('failed result always has error field', () => {
      const result: ProcessResult = failedResult('article', 1, 'Error')
      expect(result.error).toBeDefined()
      expect(typeof result.error).toBe('string')
    })

    it('skipped result may have error field', () => {
      const withError: ProcessResult = skippedResult('article', 1, 'Reason')
      const withoutError: ProcessResult = skippedResult('article', 2)

      expect(withError.error).toBeDefined()
      expect(withoutError.error).toBeUndefined()
    })
  })

  describe('result status discrimination', () => {
    it('can discriminate result status at runtime', () => {
      const success = successResult('article', 1)
      const failed = failedResult('article', 2, 'Error')
      const skipped = skippedResult('article', 3)

      expect(success.status).toBe('success')
      expect(failed.status).toBe('failed')
      expect(skipped.status).toBe('skipped')
    })

    it('failed and skipped results can be distinguished by error presence', () => {
      const failed = failedResult('article', 1, 'Must have error')
      const skippedNoError = skippedResult('article', 2)
      const skippedWithError = skippedResult('article', 3, 'Optional error')

      // Failed always has error
      expect(failed.status).toBe('failed')
      expect(failed.error).toBeDefined()

      // Skipped may or may not have error
      expect(skippedNoError.status).toBe('skipped')
      expect(skippedNoError.error).toBeUndefined()

      expect(skippedWithError.status).toBe('skipped')
      expect(skippedWithError.error).toBeDefined()
    })
  })
})

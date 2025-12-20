/**
 * Unified Error Handler: Consistent error handling across all process functions
 *
 * Centralizes error logging and ProcessResult creation based on error types
 */

import {
  ArticleInvalidStateError,
  ArticleRetryableError,
  ArticleTerminalError,
} from '@/lib/errors/article-errors'
import { QuizRetryableError, QuizTerminalError } from '@/lib/errors/quiz-errors'
import { logger } from '@/lib/logger'
import type { ProcessResult } from './process-result'
import { failedResult } from './process-result'

export type ErrorContext = {
  resourceType: ProcessResult['resourceType']
  resourceId: number
  stepName?: string
}

/**
 * Handle process errors with consistent logging and error classification
 *
 * @param error - The error to handle
 * @param context - Context about which resource and step failed
 * @returns ProcessResult with failed status
 */
export function handleProcessError<T = void>(
  error: unknown,
  context: ErrorContext
): ProcessResult<T> {
  const err = error instanceof Error ? error : new Error(String(error))
  const errorPrefix = context.stepName
    ? `${context.stepName} error`
    : `${context.resourceType} processing error`
  const errorMsg = `${errorPrefix}: ${err.message}`

  // Determine log level based on error type
  const isRetryable = error instanceof ArticleRetryableError || error instanceof QuizRetryableError

  const isTerminal =
    error instanceof ArticleTerminalError ||
    error instanceof ArticleInvalidStateError ||
    error instanceof QuizTerminalError

  // Use warn for retryable errors, error for everything else
  const logMethod = isRetryable ? logger.warn : logger.error
  const logContext = {
    [`${context.resourceType}Id`]: context.resourceId,
    err,
    errorType: err.constructor.name,
    isRetryable,
    isTerminal,
  }

  logMethod.call(logger, logContext, errorMsg)

  return failedResult<T>(context.resourceType, context.resourceId, errorMsg)
}

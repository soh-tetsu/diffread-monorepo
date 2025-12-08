import { Err, Ok, type Result } from './result'

export interface RetryOptions<T> {
  maxAttempts: number
  delayMs?: number
  onRetry?: (attempt: number, error: Error) => void
  onFailure?: (attempts: number, error: Error) => T | Promise<T> | void
}

/**
 * Retry a function with exponential backoff or fixed delay
 *
 * @param fn - The async function to retry
 * @param options - Retry configuration
 * @returns The result of the function if successful, or the fallback value from onFailure if provided
 * @throws The last error if all retries are exhausted and no fallback is provided
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions<T>): Promise<T> {
  const { maxAttempts, delayMs = 1000, onRetry, onFailure } = options
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt < maxAttempts) {
        onRetry?.(attempt, lastError)
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      } else {
        // Last attempt failed - check if onFailure provides a fallback
        if (onFailure) {
          const fallback = await onFailure(attempt, lastError)
          if (fallback !== undefined) {
            return fallback
          }
        }
      }
    }
  }

  // All retries exhausted and no fallback provided
  throw lastError
}

/**
 * Retry a function and return a Result instead of throwing
 * This allows the caller to decide how to handle failures (e.g., fallback logic)
 *
 * @param fn - The async function to retry
 * @param options - Retry configuration (without onFailure)
 * @returns A Result containing either the success value or the error
 */
export async function withRetryResult<T>(
  fn: () => Promise<T>,
  options: Omit<RetryOptions<T>, 'onFailure'>
): Promise<Result<T, Error>> {
  const { maxAttempts, delayMs = 1000, onRetry } = options
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const value = await fn()
      return Ok(value)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt < maxAttempts) {
        onRetry?.(attempt, lastError)
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
  }

  // All retries exhausted - return error instead of throwing
  return Err(lastError || new Error('Unknown error'))
}

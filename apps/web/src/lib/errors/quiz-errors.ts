/**
 * Error thrown when a quiz generation fails in a terminal way
 * Examples: Invalid pedagogy data, unrecoverable AI errors
 * Session should be marked as 'skip_by_failure'
 */
export class QuizTerminalError extends Error {
  constructor(
    message: string,
    public readonly curiosityQuizId: number,
    public readonly cause?: Error
  ) {
    super(message)
    this.name = 'QuizTerminalError'
  }
}

/**
 * Error thrown for transient/recoverable quiz generation failures
 * Examples: API rate limits, temporary AI service outages, network errors
 * Session should be marked as 'errored' for retry, not 'skip_by_failure'
 */
export class QuizRetryableError extends Error {
  constructor(
    message: string,
    public readonly curiosityQuizId: number,
    public readonly cause?: Error
  ) {
    super(message)
    this.name = 'QuizRetryableError'
  }
}

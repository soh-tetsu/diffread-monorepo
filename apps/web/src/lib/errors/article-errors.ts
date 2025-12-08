/**
 * Error thrown when an article is in a terminal state and cannot be processed
 */
export class ArticleTerminalError extends Error {
  constructor(
    message: string,
    public readonly articleId: number,
    public readonly articleStatus: string
  ) {
    super(message)
    this.name = 'ArticleTerminalError'
  }
}

/**
 * Error thrown when an article is in an unexpected/invalid state
 * This indicates a system bug rather than a transient failure
 */
export class ArticleInvalidStateError extends Error {
  constructor(
    message: string,
    public readonly articleId: number,
    public readonly articleStatus: string
  ) {
    super(message)
    this.name = 'ArticleInvalidStateError'
  }
}

/**
 * Error thrown when stored article content cannot be loaded after retries
 * This indicates storage corruption or permanent storage failure
 */
export class ArticleStorageError extends Error {
  constructor(
    message: string,
    public readonly articleId: number
  ) {
    super(message)
    this.name = 'ArticleStorageError'
  }
}

/**
 * Error thrown for transient/recoverable article failures
 * Examples: network errors, temporary service outages
 * Session should be marked as 'errored' for retry, not 'skip_by_failure'
 */
export class ArticleRetryableError extends Error {
  constructor(
    message: string,
    public readonly articleId: number,
    public readonly cause?: Error
  ) {
    super(message)
    this.name = 'ArticleRetryableError'
  }
}

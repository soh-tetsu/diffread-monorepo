/**
 * Worker Constants: Centralized configuration for worker processes
 *
 * Single source of truth for retry logic, freshness checks, and error handling
 */

export const WORKER_CONSTANTS = {
  /**
   * Retry configuration for quiz generation
   */
  RETRY: {
    /** Maximum number of retries before marking as skip_by_failure */
    MAX_QUIZ_RETRIES: 3,
    /** Number of generation attempts per retry */
    MAX_GENERATION_ATTEMPTS: 2,
    /** Delay between retry attempts in milliseconds */
    RETRY_DELAY_MS: 1000,
  },

  /**
   * Article freshness and caching
   */
  ARTICLE: {
    /** Article is considered stale after this many days */
    FRESHNESS_DAYS: 30,
    /** Maximum age in milliseconds (30 days) */
    MAX_AGE_MS: 30 * 24 * 60 * 60 * 1000,
  },

  /**
   * Error handling configuration
   */
  ERROR: {
    /** Maximum length for error messages stored in database */
    MAX_MESSAGE_LENGTH: 500,
  },
} as const

export type WorkerConstants = typeof WORKER_CONSTANTS

/**
 * Result of a process function execution
 * Used by processSession coordinator to track which step succeeded/failed
 *
 * Generic type T represents the data returned on success
 */
export type ProcessResult<T = void> = {
  resourceType: 'article' | 'quiz' | 'curiosityQuiz' | 'generation'
  resourceId: number
  status: 'success' | 'skipped' | 'failed'
  error?: string
  data?: T
}

export function successResult<T>(
  resourceType: ProcessResult['resourceType'],
  resourceId: number,
  data?: T
): ProcessResult<T> {
  return {
    resourceType,
    resourceId,
    status: 'success',
    data,
  }
}

export function skippedResult<T = void>(
  resourceType: ProcessResult['resourceType'],
  resourceId: number,
  error?: string
): ProcessResult<T> {
  return {
    resourceType,
    resourceId,
    status: 'skipped',
    error,
  }
}

export function failedResult<T = void>(
  resourceType: ProcessResult['resourceType'],
  resourceId: number,
  error: string
): ProcessResult<T> {
  return {
    resourceType,
    resourceId,
    status: 'failed',
    error,
  }
}

/**
 * Type guard to check if result is successful with data
 * Narrows the type to ensure data is present
 */
export function isSuccessWithData<T>(
  result: ProcessResult<T>
): result is ProcessResult<T> & { data: T } {
  return result.status === 'success' && result.data !== undefined
}

/**
 * Step Handler: Generic step execution for session processing pipeline
 *
 * Eliminates repetitive error handling and metadata updates in processSession
 */

import { updateSession } from '@/lib/db/sessions'
import { logger } from '@/lib/logger'
import type { SessionRow } from '@/types/db'
import type { ProcessResult } from './process-result'
import { isSuccessWithData } from './process-result'

export type StepHandler<T> = {
  /** Step name for logging and error metadata */
  name: string
  /** Function to execute for this step */
  execute: () => Promise<ProcessResult<T>>
  /** Optional callback after successful execution */
  onSuccess?: (data: T) => Promise<void>
  /** If true, marks session as skip_by_failure instead of errored on skip */
  finalStep?: boolean
}

export type StepExecutionResult<T> = { success: false } | { success: true; data: T }

/**
 * Execute a processing step with consistent error handling and logging
 *
 * Handles:
 * - Logging step start/completion
 * - Converting failed/skipped results to session metadata updates
 * - Executing onSuccess callback if provided
 * - Type-safe data extraction
 *
 * @param session - The session being processed
 * @param handler - The step configuration
 * @returns Either { success: false } or { success: true, data: T }
 */
export async function executeStep<T>(
  session: SessionRow,
  handler: StepHandler<T>
): Promise<StepExecutionResult<T>> {
  logger.info({ sessionId: session.id }, `Starting ${handler.name}`)

  const result = await handler.execute()
  logger.info({ sessionId: session.id, result }, `${handler.name} completed`)

  if (result.status === 'failed') {
    logger.error({ sessionId: session.id, error: result.error }, `${handler.name} failed`)
    await updateSession(session.id, {
      status: 'errored',
      metadata: {
        ...session.metadata,
        lastError: { step: handler.name, reason: result.error },
      },
    })
    return { success: false }
  }

  if (result.status === 'skipped') {
    logger.info({ sessionId: session.id, reason: result.error }, `${handler.name} skipped`)
    const status = handler.finalStep ? 'skip_by_failure' : 'errored'
    await updateSession(session.id, {
      status,
      metadata: {
        ...session.metadata,
        lastError: { step: handler.name, reason: result.error },
      },
    })
    return { success: false }
  }

  if (!isSuccessWithData(result)) {
    throw new Error(`${handler.name} result missing data`)
  }

  if (handler.onSuccess) {
    await handler.onSuccess(result.data)
  }

  return { success: true, data: result.data }
}

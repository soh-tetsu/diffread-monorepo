/**
 * RPC Helpers: Centralized RPC result validation and error handling
 *
 * Provides utilities for consistent RPC call handling across worker process functions
 */

import type { PostgrestError } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import type { ProcessResult } from './process-result'
import { failedResult } from './process-result'

export class RpcError extends Error {
  constructor(
    public readonly rpcName: string,
    public readonly cause?: PostgrestError
  ) {
    super(`RPC ${rpcName} failed: ${cause?.message || 'Unknown error'}`)
    this.name = 'RpcError'
  }
}

export class RpcEmptyResultError extends Error {
  constructor(public readonly rpcName: string) {
    super(`RPC ${rpcName} returned no data`)
    this.name = 'RpcEmptyResultError'
  }
}

/**
 * Validate RPC result and extract first row
 * Throws typed errors for consistent error handling
 */
export function validateRpcResult<T>(
  result: { data: T[] | null; error: PostgrestError | null },
  rpcName: string
): T {
  if (result.error) {
    throw new RpcError(rpcName, result.error)
  }

  if (!result.data || result.data.length === 0) {
    throw new RpcEmptyResultError(rpcName)
  }

  return result.data[0]
}

/**
 * Convenience wrapper for RPC calls in process functions
 * Returns either extracted data or a ProcessResult failure
 */
export async function callRpc<T>(
  rpcBuilder: {
    then: (resolve: (value: { data: T[] | null; error: PostgrestError | null }) => void) => void
  },
  rpcName: string,
  context: {
    resourceType: ProcessResult['resourceType']
    resourceId: number
  }
): Promise<{ data: T } | ProcessResult<void>> {
  try {
    const result: { data: T[] | null; error: PostgrestError | null } = await rpcBuilder
    const data = validateRpcResult(result, rpcName)
    return { data }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    const errorMsg = `RPC ${rpcName} failed: ${err.message}`
    logger.error({ ...context, err }, errorMsg)
    return failedResult<void>(context.resourceType, context.resourceId, errorMsg)
  }
}

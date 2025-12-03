import type { PostgrestError, PostgrestSingleResponse } from '@supabase/supabase-js'

type SupabaseErrorOptions = {
  context?: string
}

function buildError(error: PostgrestError | null, fallback: string, options: SupabaseErrorOptions) {
  const prefix = options.context ? `${options.context}: ` : ''
  const message = error?.message ? error.message : fallback
  return new Error(`${prefix}${message}`)
}

const DEFAULT_NOT_FOUND_CODES = new Set(['PGRST116'])

type MaybeSingleOptions = {
  context?: string
  notFoundCodes?: string[]
}

export function queryMaybeSingle<T>(
  result: PostgrestSingleResponse<T>,
  options: MaybeSingleOptions = {}
): T | null {
  const { context, notFoundCodes } = options
  const allowedCodes = notFoundCodes ? new Set(notFoundCodes) : DEFAULT_NOT_FOUND_CODES
  const { data, error } = result

  if (error && !allowedCodes.has(error.code ?? '')) {
    throw buildError(error, 'Supabase query failed', { context })
  }

  return data ?? null
}

type SingleOptions = {
  context?: string
  notFoundMessage?: string
}

export function querySingle<T>(result: PostgrestSingleResponse<T>, options: SingleOptions = {}): T {
  const { context, notFoundMessage = 'Record not found' } = options
  const { data, error } = result

  if (error || !data) {
    throw buildError(error, notFoundMessage, { context })
  }

  return data
}

type MutationOptions = {
  context?: string
}

type MutationResult = {
  error: PostgrestError | null
}

export function execute(result: MutationResult, options: MutationOptions = {}): void {
  if (result.error) {
    throw buildError(result.error, 'Supabase mutation failed', { context: options.context })
  }
}

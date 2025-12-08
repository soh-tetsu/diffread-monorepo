/**
 * Rust-like Result type for explicit error handling
 */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E }

export function Ok<T>(value: T): Result<T, never> {
  return { ok: true, value }
}

export function Err<E>(error: E): Result<never, E> {
  return { ok: false, error }
}

/**
 * Check if a result is successful
 */
export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok === true
}

/**
 * Check if a result is an error
 */
export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return result.ok === false
}

/**
 * Unwrap a result value or throw the error
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value
  }
  throw result.error
}

/**
 * Get the value or a default
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (result.ok) {
    return result.value
  }
  return defaultValue
}

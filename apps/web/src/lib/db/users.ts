'use server'

import { randomUUID } from 'node:crypto'
import { supabase } from '@/lib/supabase'
import type { UserRow } from '@/types/db'
import { logger } from '../logger'

const INTERNAL_GUEST_DOMAIN = 'diffread.internal'

type Metadata = Record<string, unknown>

function synthesizeGuestEmail(userId: string): string {
  return `guest+${userId}@${INTERNAL_GUEST_DOMAIN}`
}

export async function getUserById(userId: string): Promise<UserRow | null> {
  const { data, error } = await supabase.from('users').select('*').eq('id', userId).maybeSingle()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to load user ${userId}: ${error.message}`)
  }

  return (data as UserRow) ?? null
}

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const { data, error } = await supabase.from('users').select('*').eq('email', email).maybeSingle()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to load user by email: ${error.message}`)
  }

  return (data as UserRow) ?? null
}

async function insertUser(payload: Partial<UserRow> & { metadata?: Metadata }): Promise<UserRow> {
  const { data, error } = await supabase
    .from('users')
    .insert({
      auth_method: 'guest',
      last_seen_at: new Date().toISOString(),
      ...payload,
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(`Failed to insert user: ${error?.message}`)
  }

  return data as UserRow
}

export async function createGuestUser(
  options: { userId?: string; metadata?: Metadata; email?: string } = {}
): Promise<UserRow> {
  const userId = options.userId ?? randomUUID()
  const email = options.email ?? synthesizeGuestEmail(userId)
  const metadata = {
    onboardingCompleted: false,
    ...options.metadata,
  }

  return insertUser({
    id: userId,
    email,
    metadata,
  })
}

export async function ensureGuestUser(
  options: { userId?: string; metadata?: Metadata } = {}
): Promise<{ user: UserRow; created: boolean }> {
  if (options.userId) {
    const existing = await getUserById(options.userId)
    if (existing) {
      return { user: existing, created: false }
    }

    logger.warn(
      { userId: options.userId },
      'Guest ID not found; recreating placeholder per soft policy (TODO harden).'
    )

    const recreated = await createGuestUser({
      userId: options.userId,
      metadata: { ...(options.metadata ?? {}), recreatedAt: new Date().toISOString() },
    })
    return { user: recreated, created: true }
  }

  const user = await createGuestUser({ metadata: options.metadata })
  return { user, created: true }
}

export async function ensureUserByEmail(email: string): Promise<UserRow> {
  const existing = await getUserByEmail(email)
  if (existing) {
    return existing
  }

  return insertUser({
    id: randomUUID(),
    auth_method: 'email',
    email,
    metadata: { seeded_from: 'email_fallback' },
  })
}

export async function updateUserMetadata(userId: string, patch: Metadata): Promise<UserRow> {
  const current = await getUserById(userId)
  if (!current) {
    throw new Error(`User ${userId} not found while updating metadata`)
  }

  const metadata = {
    ...(current.metadata ?? {}),
    ...patch,
  }

  const { data, error } = await supabase
    .from('users')
    .update({ metadata })
    .eq('id', userId)
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(`Failed to update metadata for user ${userId}: ${error?.message}`)
  }

  return data as UserRow
}

export async function touchUserLastSeen(userId: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', userId)

  if (error) {
    logger.warn({ userId, err: error }, 'Failed to update last_seen_at')
  }
}

export { synthesizeGuestEmail }

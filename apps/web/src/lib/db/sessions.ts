import { nanoid } from 'nanoid'
import { supabase } from '@/lib/supabase'
import type { SessionRow, SessionStatus } from '@/types/db'

const SESSION_TOKEN_LENGTH = Number(process.env.SESSION_TOKEN_LENGTH ?? '16')

export async function getOrCreateSession(email: string, originalUrl: string): Promise<SessionRow> {
  const { data: existing, error: lookupError } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_email', email)
    .eq('article_url', originalUrl)
    .maybeSingle()

  if (lookupError && lookupError.code !== 'PGRST116') {
    throw new Error(`Failed to fetch session: ${lookupError.message}`)
  }

  if (existing) {
    return existing as SessionRow
  }

  const payload = {
    session_token: nanoid(SESSION_TOKEN_LENGTH),
    user_email: email,
    article_url: originalUrl,
    status: 'pending' as const,
    metadata: {},
  }

  const { data: created, error: insertError } = await supabase
    .from('sessions')
    .insert(payload)
    .select('*')
    .single()

  if (insertError || !created) {
    throw new Error(`Failed to create session: ${insertError?.message}`)
  }

  return created as SessionRow
}

export async function getSessionByToken(token: string): Promise<SessionRow | null> {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('session_token', token)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to load session: ${error.message}`)
  }

  return (data as SessionRow) ?? null
}

export async function updateSession(
  sessionId: number,
  updates: Partial<Pick<SessionRow, 'quiz_id' | 'status' | 'metadata'>>
): Promise<SessionRow> {
  const { data, error } = await supabase
    .from('sessions')
    .update(updates)
    .eq('id', sessionId)
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(`Failed to update session: ${error?.message}`)
  }

  return data as SessionRow
}

export async function setSessionStatusByQuiz(quizId: number, status: SessionStatus) {
  const { error } = await supabase.from('sessions').update({ status }).eq('quiz_id', quizId)

  if (error) {
    throw new Error(`Failed to update sessions for quiz ${quizId}: ${error.message}`)
  }
}

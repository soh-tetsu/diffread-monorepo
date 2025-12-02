import { nanoid } from 'nanoid'
import { supabase } from '@/lib/supabase'
import type { SessionRow, SessionStatus } from '@/types/db'

const SESSION_TOKEN_LENGTH = Number(process.env.SESSION_TOKEN_LENGTH ?? '16')

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

export async function getSessionByEmailAndUrl(
  email: string,
  articleUrl: string
): Promise<SessionRow | null> {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_email', email)
    .eq('article_url', articleUrl)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to fetch session: ${error.message}`)
  }

  return (data as SessionRow) ?? null
}

export async function createSession(email: string, articleUrl: string): Promise<SessionRow> {
  const { data, error } = await supabase
    .from('sessions')
    .insert({
      session_token: nanoid(SESSION_TOKEN_LENGTH),
      user_email: email,
      article_url: articleUrl,
      quiz_id: null, // Will be set later
      status: 'pending' as SessionStatus,
      metadata: {},
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(`Failed to create session: ${error?.message}`)
  }

  return data as SessionRow
}

export async function getOrCreateSession(email: string, articleUrl: string): Promise<SessionRow> {
  const existing = await getSessionByEmailAndUrl(email, articleUrl)
  if (existing) {
    return existing
  }

  return createSession(email, articleUrl)
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

export async function updateSessionsByQuizId(
  quizId: number,
  updates: Partial<Pick<SessionRow, 'status' | 'metadata'>>
): Promise<void> {
  const { error } = await supabase.from('sessions').update(updates).eq('quiz_id', quizId)

  if (error) {
    throw new Error(`Failed to update sessions for quiz ${quizId}: ${error.message}`)
  }
}

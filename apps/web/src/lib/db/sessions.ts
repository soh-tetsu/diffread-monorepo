import { nanoid } from 'nanoid'
import { synthesizeGuestEmail } from '@/lib/db/users'
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

export async function getSessionByUserIdAndUrl(
  userId: string,
  articleUrl: string
): Promise<SessionRow | null> {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('article_url', articleUrl)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to fetch session: ${error.message}`)
  }

  return (data as SessionRow) ?? null
}

type CreateSessionInput = {
  userId: string
  articleUrl: string
  email?: string
}

export async function createSession({
  userId,
  articleUrl,
  email,
}: CreateSessionInput): Promise<SessionRow> {
  const { data, error } = await supabase
    .from('sessions')
    .insert({
      session_token: nanoid(SESSION_TOKEN_LENGTH),
      user_id: userId,
      user_email: email ?? synthesizeGuestEmail(userId),
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

export async function getOrCreateSession(params: CreateSessionInput): Promise<SessionRow> {
  const existing = await getSessionByUserIdAndUrl(params.userId, params.articleUrl)
  if (existing) {
    return existing
  }

  return createSession(params)
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

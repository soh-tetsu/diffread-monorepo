import { nanoid } from 'nanoid'
import { execute, queryMaybeSingle, querySingle } from '@/lib/db/supabase-helpers'
import { synthesizeGuestEmail } from '@/lib/db/users'
import { supabase } from '@/lib/supabase'
import type { SessionRow, SessionStatus } from '@/types/db'

const SESSION_TOKEN_LENGTH = Number(process.env.SESSION_TOKEN_LENGTH ?? '16')

export async function getSessionByToken(token: string): Promise<SessionRow | null> {
  const result = await supabase
    .from('sessions')
    .select('*')
    .eq('session_token', token)
    .maybeSingle()
  return queryMaybeSingle<SessionRow>(result, { context: `load session by token ${token}` })
}

export async function getSessionByUserIdAndUrl(
  userId: string,
  articleUrl: string
): Promise<SessionRow | null> {
  const result = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('article_url', articleUrl)
    .maybeSingle()
  return queryMaybeSingle<SessionRow>(result, { context: 'load session by user and url' })
}

type CreateSessionInput = {
  userId: string
  articleUrl: string
  email?: string
  status?: SessionStatus
}

export async function createSession({
  userId,
  articleUrl,
  email,
  status = 'bookmarked',
}: CreateSessionInput): Promise<SessionRow> {
  return querySingle<SessionRow>(
    await supabase
      .from('sessions')
      .insert({
        session_token: nanoid(SESSION_TOKEN_LENGTH),
        user_id: userId,
        user_email: email ?? synthesizeGuestEmail(userId),
        article_url: articleUrl,
        quiz_id: null,
        status,
        metadata: {},
      })
      .select('*')
      .single(),
    { context: 'create session' }
  )
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
  updates: Partial<Pick<SessionRow, 'quiz_id' | 'status' | 'study_status' | 'metadata'>>
): Promise<SessionRow> {
  return querySingle<SessionRow>(
    await supabase.from('sessions').update(updates).eq('id', sessionId).select('*').single(),
    { context: `update session ${sessionId}` }
  )
}

export async function updateSessionByToken(
  sessionToken: string,
  updates: Partial<Pick<SessionRow, 'quiz_id' | 'status' | 'study_status' | 'metadata'>>
): Promise<SessionRow> {
  return querySingle<SessionRow>(
    await supabase
      .from('sessions')
      .update(updates)
      .eq('session_token', sessionToken)
      .select('*')
      .single(),
    { context: `update session by token ${sessionToken}` }
  )
}

export async function updateSessionsByQuizId(
  quizId: number,
  updates: Partial<Pick<SessionRow, 'status' | 'metadata'>>
): Promise<void> {
  const result = await supabase.from('sessions').update(updates).eq('quiz_id', quizId)
  execute(result, { context: `update sessions for quiz ${quizId}` })
}

export async function getSessionsByUserId(userId: string, limit = 50): Promise<SessionRow[]> {
  const result = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (result.error) {
    throw new Error(`Failed to fetch sessions: ${result.error.message}`)
  }

  return result.data || []
}

export async function deleteSessionByToken(sessionToken: string, userId: string): Promise<void> {
  const result = await supabase
    .from('sessions')
    .delete()
    .eq('session_token', sessionToken)
    .eq('user_id', userId)

  execute(result, { context: `delete session by token ${sessionToken}` })
}

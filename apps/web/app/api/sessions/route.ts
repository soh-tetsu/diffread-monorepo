'use server'

import { NextResponse } from 'next/server'
import { ensureGuestUser } from '@/lib/db/users'
import { logger } from '@/lib/logger'
import { enqueueAndProcessSession } from '@/lib/workflows/enqueue-session'

type SessionRequestBody = {
  userId?: string
  url?: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as SessionRequestBody
    const userId =
      typeof body.userId === 'string' && body.userId.length > 0 ? body.userId : undefined
    const url = typeof body.url === 'string' && body.url.length > 0 ? body.url : undefined

    if (!userId) {
      return NextResponse.json({ message: 'Missing userId' }, { status: 400 })
    }

    if (!url) {
      return NextResponse.json({ message: 'Missing URL' }, { status: 400 })
    }

    const { user } = await ensureGuestUser({ userId })

    const { session, workerInvoked } = await enqueueAndProcessSession(
      { userId: user.id, email: user.email ?? undefined },
      url,
      { sync: false }
    )

    return NextResponse.json({
      sessionToken: session.session_token,
      status: session.status,
      workerInvoked,
    })
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error({ err }, 'Failed to create session from /api/sessions')
    return NextResponse.json(
      { message: 'Failed to create session', details: err.message },
      { status: 500 }
    )
  }
}

'use server'

import { NextResponse } from 'next/server'
import { countQueueItems } from '@/lib/db/queue'
import { updateSession } from '@/lib/db/sessions'
import { ensureGuestUser, synthesizeGuestEmail } from '@/lib/db/users'
import { logger } from '@/lib/logger'
import { triggerQuizWorker } from '@/lib/workflows/enqueue-session'
import { initializeSessionChain } from '@/lib/workflows/session-init'

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

    // Always initialize the full chain: session → article → quiz → curiosity_quiz
    const { session, article } = await initializeSessionChain({
      userId: user.id,
      email: user.email ?? synthesizeGuestEmail(user.id),
      originalUrl: url,
    })

    // Check queue size - determines if we trigger worker or just bookmark
    const queueCount = await countQueueItems(user.id)
    let workerInvoked = false
    let queueFull = false

    if (queueCount < 2 && session.status === 'bookmarked') {
      // Queue has space - move to pending and trigger worker
      const updatedSession = await updateSession(session.id, { status: 'pending' })

      // Trigger worker (fire-and-forget)
      triggerQuizWorker(updatedSession, article, { sync: false }).catch((err) => {
        logger.error({ err, sessionToken: session.session_token }, 'Worker invocation failed')
      })

      workerInvoked = true
    } else if (queueCount >= 2) {
      queueFull = true
    }

    return NextResponse.json({
      sessionToken: session.session_token,
      status: session.status,
      workerInvoked,
      queueFull,
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

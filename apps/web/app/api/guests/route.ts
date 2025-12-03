'use server'

import { NextResponse } from 'next/server'
import { ensureGuestUser, updateUserMetadata } from '@/lib/db/users'
import { logger } from '@/lib/logger'

type GuestRequestBody = {
  userId?: string
  onboardingCompleted?: boolean
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as GuestRequestBody
    const requestedUserId =
      typeof body.userId === 'string' && body.userId.length > 0 ? body.userId : undefined
    const onboardingCompleted = Boolean(body.onboardingCompleted)

    const { user, created } = await ensureGuestUser({ userId: requestedUserId })

    if (onboardingCompleted && user.metadata?.onboardingCompleted !== true) {
      await updateUserMetadata(user.id, {
        onboardingCompleted: true,
      })
    }

    return NextResponse.json({
      userId: user.id,
      created,
      onboardingCompleted: onboardingCompleted || Boolean(user.metadata?.onboardingCompleted),
    })
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error({ err }, 'Failed to provision guest user')
    return NextResponse.json(
      { message: 'Failed to provision guest user', details: err.message },
      { status: 500 }
    )
  }
}

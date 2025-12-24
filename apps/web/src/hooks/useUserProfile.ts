import useSWR from 'swr'
import { readGuestIdFromCookie } from '@/lib/guest/cookie'

type UserProfile = {
  userId: string
  email: string
  metadata: {
    onboardingCompleted?: boolean
    [key: string]: unknown
  }
}

const fetcher = async (url: string) => {
  // Cookie is automatically sent by browser, no need for custom header
  const res = await fetch(url, { credentials: 'same-origin' })

  if (!res.ok) {
    if (res.status === 401 || res.status === 404) {
      // User doesn't exist in DB - return null
      // Don't delete cookie: backend will recreate user on next URL submission (soft policy)
      return null
    }
    throw new Error('Failed to fetch user profile')
  }

  return res.json()
}

export function useUserProfile() {
  const guestId = readGuestIdFromCookie()

  const { data, error, mutate } = useSWR<UserProfile | null>(
    guestId ? '/api/user' : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  )

  return {
    profile: data,
    // Use strict undefined check to distinguish "not fetched yet" from "fetched but returned null"
    isLoading: !error && data === undefined && !!guestId,
    isError: !!error,
    hasCompletedOnboarding: data?.metadata?.onboardingCompleted ?? false,
    refetch: mutate,
  }
}

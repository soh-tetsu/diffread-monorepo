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
    isLoading: !error && !data && !!guestId,
    isError: !!error,
    hasCompletedOnboarding: data?.metadata?.onboardingCompleted ?? false,
    refetch: mutate,
  }
}

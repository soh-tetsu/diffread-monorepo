'use client'

import { useMemo } from 'react'
import useSWR from 'swr'
import { readGuestIdFromCookie } from '@/lib/guest/cookie'
import type { ArticleRecord } from './useUserStats'

type HistoryItem = {
  sessionToken: string
  articleTitle: string | null
  articleUrl: string
  timestamp: number
  sessionStatus: string
}

type HistoryResponse = {
  history: HistoryItem[]
}

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: 'same-origin' })
  if (!res.ok) throw new Error('Failed to fetch history')
  return res.json()
}

/**
 * Hook to fetch and merge article history from both API and localStorage
 * - API provides session/article metadata from database
 * - localStorage provides user actions (skip/deep-dive) and scores
 */
export function useArticleHistory(localHistory: ArticleRecord[]) {
  const guestId = readGuestIdFromCookie()

  // Use SWR for shared cache and deduplication
  const { data, isLoading } = useSWR<HistoryResponse>(guestId ? '/api/history' : null, fetcher, {
    refreshInterval: 30000,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
    revalidateOnFocus: true,
    dedupingInterval: 5000,
  })

  const mergedHistory = useMemo(() => {
    if (!guestId || !data) {
      return localHistory
    }

    const apiHistory = data.history || []

    // Create a map of localStorage records by article URL
    const localMap = new Map<string, ArticleRecord>()
    for (const record of localHistory) {
      if (record.url) {
        localMap.set(record.url, record)
      }
    }

    // Merge API data with localStorage data
    const merged: ArticleRecord[] = apiHistory.map((item) => {
      const localRecord = localMap.get(item.articleUrl)

      // If we have localStorage data for this URL, use it (has user action)
      if (localRecord) {
        // Remove from map so we can add remaining localStorage items later
        localMap.delete(item.articleUrl)

        return {
          ...localRecord,
          // Enrich with API data if title is missing
          title: localRecord.title || item.articleTitle,
        }
      }

      // Otherwise, create record from API data
      return {
        id: item.sessionToken,
        title: item.articleTitle,
        url: item.articleUrl,
        timestamp: item.timestamp,
        totalQuestions: 0,
        correctCount: 0,
        action: 'skip', // Default to skip for historical data
        isHighScore: false,
      }
    })

    // Add any localStorage items that weren't in the API response
    for (const localRecord of localMap.values()) {
      merged.push(localRecord)
    }

    // Sort by timestamp descending (most recent first)
    merged.sort((a, b) => b.timestamp - a.timestamp)

    return merged
  }, [guestId, data, localHistory])

  return { history: mergedHistory, isLoading }
}

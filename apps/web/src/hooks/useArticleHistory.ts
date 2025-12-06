'use client'

import { useEffect, useState } from 'react'
import { readGuestIdFromCookie } from '@/lib/guest/cookie'
import type { ArticleRecord } from './useUserStats'

type HistoryItem = {
  sessionToken: string
  articleTitle: string | null
  articleUrl: string
  timestamp: number
  sessionStatus: string
}

/**
 * Hook to fetch and merge article history from both API and localStorage
 * - API provides session/article metadata from database
 * - localStorage provides user actions (skip/deep-dive) and scores
 */
export function useArticleHistory(localHistory: ArticleRecord[]) {
  const [mergedHistory, setMergedHistory] = useState<ArticleRecord[]>(localHistory)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const fetchHistory = async () => {
      const guestId = readGuestIdFromCookie()
      if (!guestId) {
        // No guest ID, only use localStorage
        setMergedHistory(localHistory)
        return
      }

      setIsLoading(true)
      try {
        // Cookie is automatically sent by browser
        const response = await fetch('/api/history', {
          credentials: 'same-origin',
        })

        if (!response.ok) {
          throw new Error('Failed to fetch history')
        }

        const data = await response.json()
        const apiHistory: HistoryItem[] = data.history || []

        // Create a map of localStorage records by session token (article URL as fallback)
        const localMap = new Map<string, ArticleRecord>()
        for (const record of localHistory) {
          // Use article URL as key since we don't store session tokens in localStorage
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
          // We don't have action or score data for items not in localStorage
          // So we mark them as viewed but with no score
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
        // (these might be very recent or from different guest IDs)
        for (const localRecord of localMap.values()) {
          merged.push(localRecord)
        }

        // Sort by timestamp descending (most recent first)
        merged.sort((a, b) => b.timestamp - a.timestamp)

        setMergedHistory(merged)
      } catch (error) {
        console.error('Failed to fetch article history:', error)
        // Fall back to localStorage only
        setMergedHistory(localHistory)
      } finally {
        setIsLoading(false)
      }
    }

    fetchHistory()
  }, [localHistory])

  return { history: mergedHistory, isLoading }
}

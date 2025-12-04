import { useCallback, useEffect, useState } from 'react'

export type ArticleRecord = {
  id: string
  title: string | null
  url: string | null
  timestamp: number
  totalQuestions: number
  correctCount: number
  action: 'skip' | 'deep-dive'
  isHighScore: boolean
}

export type UserStats = {
  totalArticlesEvaluated: number
  highScoreSkips: number
  lowScoreSkips: number
  deepDives: number
  totalTimeSavedMinutes: number
  averageIntuitionScore: number
  articleHistory: ArticleRecord[]
}

const STORAGE_KEY = 'diffread:user-stats'
const AVG_ARTICLE_READ_TIME = 8

const DEFAULT_STATS: UserStats = {
  totalArticlesEvaluated: 0,
  highScoreSkips: 0,
  lowScoreSkips: 0,
  deepDives: 0,
  totalTimeSavedMinutes: 0,
  averageIntuitionScore: 0,
  articleHistory: [],
}

function loadStats(): UserStats {
  if (typeof window === 'undefined') return DEFAULT_STATS

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return DEFAULT_STATS
    return { ...DEFAULT_STATS, ...JSON.parse(stored) }
  } catch {
    return DEFAULT_STATS
  }
}

function saveStats(stats: UserStats): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats))
  } catch {
    // localStorage unavailable
  }
}

export function useUserStats() {
  const [stats, setStats] = useState<UserStats>(DEFAULT_STATS)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    setStats(loadStats())
    setIsReady(true)
  }, [])

  useEffect(() => {
    if (isReady) {
      saveStats(stats)
    }
  }, [stats, isReady])

  const recordSkip = useCallback(
    (
      totalQuestions: number,
      correctCount: number,
      articleTitle?: string | null,
      articleUrl?: string | null
    ) => {
      const percentage = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0
      const isHighScore = correctCount >= Math.ceil(totalQuestions * 0.67)

      setStats((prev) => {
        const newTotalEvaluated = prev.totalArticlesEvaluated + 1
        const newHighScoreSkips = isHighScore ? prev.highScoreSkips + 1 : prev.highScoreSkips
        const newLowScoreSkips = !isHighScore ? prev.lowScoreSkips + 1 : prev.lowScoreSkips
        const newTimeSaved = prev.totalTimeSavedMinutes + AVG_ARTICLE_READ_TIME

        const totalScore = prev.averageIntuitionScore * prev.totalArticlesEvaluated + percentage
        const newAverageScore = totalScore / newTotalEvaluated

        const newRecord: ArticleRecord = {
          id: Date.now().toString(),
          title: articleTitle || null,
          url: articleUrl || null,
          timestamp: Date.now(),
          totalQuestions,
          correctCount,
          action: 'skip',
          isHighScore,
        }
        const newHistory = [newRecord, ...prev.articleHistory].slice(0, 50)

        return {
          ...prev,
          totalArticlesEvaluated: newTotalEvaluated,
          highScoreSkips: newHighScoreSkips,
          lowScoreSkips: newLowScoreSkips,
          totalTimeSavedMinutes: newTimeSaved,
          averageIntuitionScore: Math.round(newAverageScore),
          articleHistory: newHistory,
        }
      })
    },
    []
  )

  const recordDeepDive = useCallback(
    (
      totalQuestions: number,
      correctCount: number,
      articleTitle?: string | null,
      articleUrl?: string | null
    ) => {
      const percentage = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0
      const isHighScore = correctCount >= Math.ceil(totalQuestions * 0.67)

      setStats((prev) => {
        const newTotalEvaluated = prev.totalArticlesEvaluated + 1
        const newDeepDives = prev.deepDives + 1

        const totalScore = prev.averageIntuitionScore * prev.totalArticlesEvaluated + percentage
        const newAverageScore = totalScore / newTotalEvaluated

        const newRecord: ArticleRecord = {
          id: Date.now().toString(),
          title: articleTitle || null,
          url: articleUrl || null,
          timestamp: Date.now(),
          totalQuestions,
          correctCount,
          action: 'deep-dive',
          isHighScore,
        }
        const newHistory = [newRecord, ...prev.articleHistory].slice(0, 50)

        return {
          ...prev,
          totalArticlesEvaluated: newTotalEvaluated,
          deepDives: newDeepDives,
          averageIntuitionScore: Math.round(newAverageScore),
          articleHistory: newHistory,
        }
      })
    },
    []
  )

  const reset = useCallback(() => {
    setStats(DEFAULT_STATS)
  }, [])

  return {
    stats,
    isReady,
    recordSkip,
    recordDeepDive,
    reset,
  }
}

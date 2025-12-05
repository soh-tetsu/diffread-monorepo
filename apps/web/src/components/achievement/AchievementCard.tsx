'use client'

import { Box, Flex, Heading, Link, Stack, Tabs, Text } from '@chakra-ui/react'
import { useTranslations } from 'next-intl'
import { useArticleHistory } from '@/hooks/useArticleHistory'
import type { UserStats } from '@/hooks/useUserStats'

type Props = {
  stats: UserStats
}

function AchievementTab({ stats }: { stats: UserStats }) {
  const t = useTranslations('stats')
  const { highScoreSkips, deepDives, totalTimeSavedMinutes, averageIntuitionScore } = stats

  return (
    <Flex direction="column" gap={2} align="center" textAlign="center">
      <Box>
        <Text fontSize="xs" color="gray.600">
          {t('saved')}
        </Text>
        <Heading size="2xl" color="purple.700">
          {t('savedTime', { minutes: totalTimeSavedMinutes })}
        </Heading>
        <Text fontSize="sm" color="gray.700">
          {t('byTrustingIntuition')}
        </Text>
      </Box>

      <Stack direction={{ base: 'column', sm: 'row' }} gap={3} w="100%" justify="center" mt={1}>
        <Flex direction="column" align="center" flex="1">
          <Text fontSize="xl" fontWeight="bold" color="purple.600">
            ✓ {highScoreSkips}
          </Text>
          <Text fontSize="xs" color="gray.600" textAlign="center">
            {t('skipped')}
          </Text>
        </Flex>

        <Flex direction="column" align="center" flex="1">
          <Text fontSize="xl" fontWeight="bold" color="blue.600">
            🎯 {deepDives}
          </Text>
          <Text fontSize="xs" color="gray.600" textAlign="center">
            {t('deepDives')}
          </Text>
        </Flex>

        <Flex direction="column" align="center" flex="1">
          <Text fontSize="xl" fontWeight="bold" color="teal.600">
            📈 {averageIntuitionScore}%
          </Text>
          <Text fontSize="xs" color="gray.600" textAlign="center">
            {t('accuracy')}
          </Text>
        </Flex>
      </Stack>
    </Flex>
  )
}

function ProgressTab({ stats }: { stats: UserStats }) {
  const t = useTranslations('stats')
  const {
    totalArticlesEvaluated,
    highScoreSkips,
    deepDives,
    averageIntuitionScore,
    totalTimeSavedMinutes,
  } = stats

  // Simple leveling system
  const level = Math.floor(totalArticlesEvaluated / 5) + 1
  const progressToNextLevel = ((totalArticlesEvaluated % 5) / 5) * 100

  return (
    <Flex direction="column" gap={2}>
      <Box textAlign="center">
        <Text fontSize="xs" color="gray.600">
          {t('readingMastery')}
        </Text>
        <Heading size="xl" color="purple.700">
          {t('level', { level })}
        </Heading>
        <Text fontSize="xs" color="gray.600">
          {t('articlesToNextLevel', { count: 5 - (totalArticlesEvaluated % 5) })}
        </Text>
      </Box>

      {/* Progress bar */}
      <Box>
        <Flex h="6px" bg="gray.200" borderRadius="full" overflow="hidden">
          <Box
            h="100%"
            w={`${progressToNextLevel}%`}
            bg="gradient-to-r"
            bgGradient="to-r"
            gradientFrom="purple.500"
            gradientTo="blue.500"
            transition="width 0.3s"
          />
        </Flex>
        <Text fontSize="xs" color="gray.600" textAlign="center" mt={0.5}>
          {t('progressToLevel', { percentage: Math.round(progressToNextLevel), level: level + 1 })}
        </Text>
      </Box>

      {/* Stats grid */}
      <Stack direction={{ base: 'column', sm: 'row' }} gap={2} justify="space-around" mt={1}>
        <Box textAlign="center">
          <Text fontSize="md" fontWeight="bold" color="purple.600">
            🎯 {highScoreSkips}
          </Text>
          <Text fontSize="xs" color="gray.600">
            {t('skipped')}
          </Text>
        </Box>
        <Box textAlign="center">
          <Text fontSize="md" fontWeight="bold" color="blue.600">
            📚 {deepDives}
          </Text>
          <Text fontSize="xs" color="gray.600">
            {t('deepDives')}
          </Text>
        </Box>
        <Box textAlign="center">
          <Text fontSize="md" fontWeight="bold" color="teal.600">
            ⏱️ {totalTimeSavedMinutes}min
          </Text>
          <Text fontSize="xs" color="gray.600">
            {t('timeSaved')}
          </Text>
        </Box>
        <Box textAlign="center">
          <Text fontSize="md" fontWeight="bold" color="orange.600">
            💡 {averageIntuitionScore}%
          </Text>
          <Text fontSize="xs" color="gray.600">
            {t('accuracy')}
          </Text>
        </Box>
      </Stack>
    </Flex>
  )
}

function HistoryTab({ stats }: { stats: UserStats }) {
  const t = useTranslations('stats')
  const { history, isLoading } = useArticleHistory(stats.articleHistory)

  if (isLoading) {
    return (
      <Box textAlign="center" py={3}>
        <Text fontSize="sm" color="gray.500">
          {t('loadingHistory')}
        </Text>
      </Box>
    )
  }

  if (history.length === 0) {
    return (
      <Box textAlign="center" py={3}>
        <Text fontSize="sm" color="gray.500">
          {t('noHistory')}
        </Text>
      </Box>
    )
  }

  return (
    <Stack
      gap={1.5}
      maxH="200px"
      overflowY="auto"
      pr={2}
      css={{
        '&::-webkit-scrollbar': {
          width: '6px',
        },
        '&::-webkit-scrollbar-track': {
          background: 'transparent',
        },
        '&::-webkit-scrollbar-thumb': {
          background: '#D6BCFA',
          borderRadius: '3px',
        },
        '&::-webkit-scrollbar-thumb:hover': {
          background: '#B794F4',
        },
      }}
    >
      {history.map((record) => {
        const percentage =
          record.totalQuestions > 0
            ? Math.round((record.correctCount / record.totalQuestions) * 100)
            : 0
        const dateStr = new Date(record.timestamp).toLocaleDateString()

        return (
          <Box key={record.id} p={2} borderRadius="md" borderWidth="1px" borderColor="purple.200">
            <Flex justify="space-between" align="start" gap={2}>
              <Box flex="1" minW={0}>
                {record.url ? (
                  <Link
                    href={record.url}
                    color="blue.600"
                    fontSize="xs"
                    fontWeight="medium"
                    target="_blank"
                    rel="noreferrer"
                    display="block"
                    css={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {record.title || t('untitledArticle')}
                  </Link>
                ) : (
                  <Text
                    fontSize="xs"
                    fontWeight="medium"
                    color="gray.900"
                    css={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {record.title || t('untitledArticle')}
                  </Text>
                )}
                <Text fontSize="xs" color="gray.500">
                  {dateStr}
                  {record.totalQuestions > 0 &&
                    ` • ${record.correctCount}/${record.totalQuestions} (${percentage}%)`}
                </Text>
              </Box>
              <Box flexShrink={0}>
                {record.action === 'skip' ? (
                  <Text
                    fontSize="xs"
                    px={1.5}
                    py={0.5}
                    bg={record.isHighScore ? 'blue.100' : 'orange.100'}
                    color={record.isHighScore ? 'blue.700' : 'orange.700'}
                    borderRadius="sm"
                    fontWeight="medium"
                  >
                    {t('actionSkip')}
                  </Text>
                ) : (
                  <Text
                    fontSize="xs"
                    px={1.5}
                    py={0.5}
                    bg="purple.100"
                    color="purple.700"
                    borderRadius="sm"
                    fontWeight="medium"
                  >
                    {t('actionDive')}
                  </Text>
                )}
              </Box>
            </Flex>
          </Box>
        )
      })}
    </Stack>
  )
}

export function AchievementCard({ stats }: Props) {
  const t = useTranslations('stats')

  if (stats.totalArticlesEvaluated === 0) {
    return null
  }

  return (
    <Box
      bg="gradient-to-br"
      bgGradient="to-br"
      gradientFrom="purple.50"
      gradientTo="blue.50"
      borderWidth="1px"
      borderColor="purple.200"
      borderRadius="xl"
      p={{ base: 3, md: 4 }}
      shadow="sm"
    >
      <Tabs.Root defaultValue="achievement" variant="line">
        <Tabs.List mb={2}>
          <Tabs.Trigger value="achievement">
            <Text fontSize="xs" color={'blackAlpha.800'}>
              💪 {t('title')}
            </Text>
          </Tabs.Trigger>
          <Tabs.Trigger value="progress">
            <Text fontSize="xs" color={'blackAlpha.800'}>
              🌱 {t('progressTitle')}
            </Text>
          </Tabs.Trigger>
          <Tabs.Trigger value="history">
            <Text fontSize="xs" color={'blackAlpha.800'}>
              📚 {t('historyTitle')}
            </Text>
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="achievement">
          <AchievementTab stats={stats} />
        </Tabs.Content>

        <Tabs.Content value="progress">
          <ProgressTab stats={stats} />
        </Tabs.Content>

        <Tabs.Content value="history">
          <HistoryTab stats={stats} />
        </Tabs.Content>
      </Tabs.Root>
    </Box>
  )
}

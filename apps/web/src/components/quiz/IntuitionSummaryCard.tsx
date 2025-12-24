'use client'

import { Box, Button, Flex, Heading, Stack, Text } from '@chakra-ui/react'
import { useTranslations } from 'next-intl'

type Props = {
  totalQuestions: number
  correctCount: number
  token?: string // Session token for archiving
  onDeepDive?: () => void
  onSkip?: () => void
  onRecordSkip?: () => void // Callback to record stats before navigating
}

export function IntuitionSummaryCard({
  totalQuestions,
  correctCount,
  token,
  onDeepDive,
  onSkip,
  onRecordSkip,
}: Props) {
  const t = useTranslations('intuitionSummary')
  const percentage = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0
  const isHighScore = correctCount >= Math.ceil(totalQuestions * 0.67)

  const icon = isHighScore ? '✓' : '🎯'
  const title = isHighScore
    ? t('matchTitle', { correct: correctCount, total: totalQuestions })
    : t('gapTitle', { missed: totalQuestions - correctCount, total: totalQuestions })

  const message = isHighScore ? t('highScoreMessage') : t('lowScoreMessage')

  const recommendation = isHighScore ? t('highScoreRecommendation') : t('lowScoreRecommendation')

  const deepDiveButtonText = isHighScore ? t('deepDiveButton') : t('readWithScaffoldButton')

  return (
    <Box
      bg="white"
      borderWidth="2px"
      borderColor={isHighScore ? 'blue.300' : 'purple.300'}
      borderRadius="2xl"
      p={{ base: 5, md: 6 }}
      shadow="0 20px 40px rgba(37, 99, 235, 0.12)"
    >
      <Flex direction="column" gap={4}>
        <Flex align="center" gap={3}>
          <Box
            fontSize="3xl"
            bg={isHighScore ? 'blue.50' : 'purple.50'}
            borderRadius="full"
            w="48px"
            h="48px"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            {icon}
          </Box>
          <Heading size="lg" color="gray.900">
            {title}
          </Heading>
        </Flex>

        <Box>
          <Flex gap={1} mb={2}>
            {Array.from({ length: totalQuestions }, (_, i) => (
              <Box
                // biome-ignore lint/suspicious/noArrayIndexKey: Static visualization bars that don't reorder
                key={i}
                flex="1"
                h="8px"
                bg={i < correctCount ? (isHighScore ? 'blue.500' : 'purple.500') : 'gray.200'}
                borderRadius="full"
              />
            ))}
          </Flex>
          <Text fontSize="xs" color="gray.600" textAlign="center">
            {t('alignmentPercentage', { percentage: Math.round(percentage) })}
          </Text>
        </Box>

        <Box>
          <Text fontSize="md" fontWeight="semibold" color="gray.900" mb={1}>
            {message}
          </Text>
          <Text fontSize="sm" color="gray.600">
            {recommendation}
          </Text>
        </Box>

        <Stack direction={{ base: 'column', sm: 'row' }} gap={3} mt={2}>
          {onDeepDive && (
            <Button
              colorPalette={isHighScore ? 'blue' : 'purple'}
              onClick={onDeepDive}
              w={{ base: '100%', sm: 'auto' }}
            >
              {deepDiveButtonText} →
            </Button>
          )}
          {onSkip && (
            <Button
              colorPalette="gray"
              variant="outline"
              onClick={async () => {
                // Archive the session
                if (token) {
                  try {
                    await fetch('/api/study-status', {
                      method: 'POST',
                      credentials: 'same-origin',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        sessionToken: token,
                        studyStatus: 'archived',
                      }),
                    })
                  } catch (_err) {
                    console.error('Failed to archive session:', _err)
                  }
                }
                onRecordSkip?.()
                onSkip()
              }}
              w={{ base: '100%', sm: 'auto' }}
            >
              {t('archiveButton')}
            </Button>
          )}
        </Stack>
      </Flex>
    </Box>
  )
}

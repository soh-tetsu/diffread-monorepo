'use client'

import { Box, Button, Flex, Heading, Stack, Text } from '@chakra-ui/react'

type Props = {
  totalQuestions: number
  correctCount: number
  onDeepDive?: () => void
  onSkip?: () => void
  onRecordSkip?: () => void // Callback to record stats before navigating
}

export function IntuitionSummaryCard({
  totalQuestions,
  correctCount,
  onDeepDive,
  onSkip,
  onRecordSkip,
}: Props) {
  const percentage = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0
  const isHighScore = correctCount >= Math.ceil(totalQuestions * 0.67)

  const icon = isHighScore ? '✓' : '🎯'
  const title = isHighScore
    ? `Your Intuition: ${correctCount}/${totalQuestions} Match`
    : `Knowledge Gaps: ${totalQuestions - correctCount}/${totalQuestions} Missed`

  const message = isHighScore
    ? 'Your intuition aligns with the article! You already grasp the core concepts.'
    : 'Your intuition differs from the article. There are valuable insights to discover here.'

  const recommendation = isHighScore
    ? 'You can safely skip this article unless you want to explore the details.'
    : 'A deeper read could reveal knowledge gaps and new perspectives.'

  const deepDiveButtonText = isHighScore ? 'Deep Dive' : 'Read with Scaffold'

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
            {Math.round(percentage)}% alignment
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
              onClick={() => {
                onRecordSkip?.()
                onSkip()
              }}
              w={{ base: '100%', sm: 'auto' }}
            >
              {isHighScore ? 'Skip Article' : 'Skip Anyway'}
            </Button>
          )}
        </Stack>
      </Flex>
    </Box>
  )
}

'use client'

import { Box, Button, Collapsible, Flex, Float, Link, Stack, Text, VStack } from '@chakra-ui/react'
import { useTranslations } from 'next-intl'
import { LuChevronDown } from 'react-icons/lu'
import { Blockquote, BlockquoteIcon } from '@/components/ui/blockquote'
import type { QuizOption, QuizQuestion } from '@/lib/quiz/normalize-curiosity-quizzes'

type Props = {
  question: QuizQuestion
  selectedIndex: number | null
  articleUrl?: string | null
  articleSummary?: string | null
  onSelect: (optionIndex: number) => void
}

function OptionButton({
  option,
  index,
  isSelected,
  isCorrect,
  onClick,
}: {
  option: QuizOption
  index: number
  isSelected: boolean
  isCorrect: boolean
  onClick: () => void
}) {
  const getBorderColor = () => {
    if (isSelected && isCorrect) return 'blue.500'
    if (isSelected && !isCorrect) return 'red.500'
    return 'gray.200'
  }

  const getBgColor = () => {
    if (isSelected && isCorrect) return 'blue.50'
    if (isSelected && !isCorrect) return 'red.50'
    return 'gray.50'
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      justifyContent="flex-start"
      height="auto"
      py={3}
      px={4}
      borderColor={getBorderColor()}
      bg={getBgColor()}
      borderWidth="1px"
      borderRadius="xl"
      _hover={{
        borderColor: isSelected ? undefined : 'blue.500',
        shadow: isSelected ? undefined : '0 8px 20px rgba(37, 99, 235, 0.08)',
      }}
      cursor="pointer"
      textAlign="left"
      whiteSpace="normal"
      display="flex"
      gap={3}
      alignItems="center"
    >
      <Flex
        width="32px"
        height="32px"
        borderRadius="full"
        borderWidth="1px"
        borderColor="gray.200"
        alignItems="center"
        justifyContent="center"
        fontWeight="semibold"
        bg="white"
        flexShrink={0}
      >
        {String.fromCharCode(65 + index)}
      </Flex>
      <Text fontSize="md" color="gray.900">
        {option.text}
      </Text>
    </Button>
  )
}

export function QuestionCard({
  question,
  selectedIndex,
  articleUrl,
  articleSummary,
  onSelect,
}: Props) {
  const t = useTranslations('quiz')
  const showFeedback = selectedIndex !== null
  const isCorrect = selectedIndex === question.answerIndex

  return (
    <Box
      as="article"
      bg="white"
      borderWidth="1px"
      borderColor="gray.200"
      shadow="0 15px 35px rgba(15, 23, 42, 0.08)"
      borderRadius="2xl"
      p={{ base: 4, md: 6 }}
    >
      <VStack align="stretch" gap={{ base: 3, md: 4 }}>
        {/* Header */}
        <Box as="header">
          <Text fontSize="sm" color="gray.500" mb={1}>
            {question.category}
          </Text>
          <Text
            as="h2"
            fontSize={{ base: 'lg', md: 'xl' }}
            fontWeight="semibold"
            mt={2}
            color="gray.900"
          >
            {question.prompt}
          </Text>
        </Box>

        {/* Options */}
        <Stack gap={{ base: 2, md: 3 }}>
          {question.options.map((option, idx) => (
            <OptionButton
              // biome-ignore lint/suspicious/noArrayIndexKey: Options are static and don't reorder
              key={idx}
              option={option}
              index={idx}
              isSelected={selectedIndex === idx}
              isCorrect={question.answerIndex === idx}
              onClick={() => onSelect(idx)}
            />
          ))}
        </Stack>

        {/* Feedback */}
        {showFeedback && (
          <Box
            borderRadius="2xl"
            p={{ base: 3, md: 4 }}
            borderWidth="1px"
            borderColor={isCorrect ? 'blue.200' : 'red.300'}
            bg={isCorrect ? 'blue.50' : 'red.50'}
          >
            <Text fontWeight="semibold" color="gray.900" mb={2}>
              {isCorrect ? t('feedback.correct') : t('feedback.incorrect')}
            </Text>

            {/* Article Summary Collapsible */}
            {articleSummary && (
              <Box mt={3}>
                <Collapsible.Root>
                  <Collapsible.Trigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      width="full"
                      justifyContent="space-between"
                      fontWeight="semibold"
                      px={4}
                      py={3}
                      bg="white"
                      borderColor="blue.300"
                      borderWidth="1px"
                      _hover={{ bg: 'blue.50', borderColor: 'blue.400' }}
                      borderRadius="lg"
                    >
                      <Text fontSize="sm" color="blue.700">
                        {t('articleSummary.label')}
                      </Text>
                      <Collapsible.Indicator color="blue.700">
                        <LuChevronDown />
                      </Collapsible.Indicator>
                    </Button>
                  </Collapsible.Trigger>
                  <Collapsible.Content>
                    <Box
                      mt={2}
                      p={3}
                      bg="blue.50"
                      borderRadius="lg"
                      borderWidth="1px"
                      borderColor="blue.200"
                    >
                      <Text color="gray.700" lineHeight="1.6" fontSize="sm">
                        {articleSummary}
                      </Text>
                    </Box>
                  </Collapsible.Content>
                </Collapsible.Root>
              </Box>
            )}

            {selectedIndex !== null && question.options[selectedIndex]?.rationale && (
              <Text color="gray.900" lineHeight="1.5" mt={2}>
                {question.options[selectedIndex]?.rationale}
              </Text>
            )}

            {question.sourceLocation && articleUrl && (
              <Box
                mt={3}
                p={3}
                bg="white"
                borderRadius="xl"
                borderWidth="1px"
                borderColor="blue.300"
              >
                <Text
                  fontSize="xs"
                  textTransform="uppercase"
                  letterSpacing="0.1em"
                  color="blue.700"
                  mb={1}
                  fontWeight="semibold"
                >
                  {t('sourceReference.label')}
                </Text>
                <Link
                  href={`${articleUrl}#:~:text=${encodeURIComponent(
                    question.sourceLocation.anchorText
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  color="blue.600"
                  fontWeight="medium"
                  display="inline-flex"
                  alignItems="center"
                  gap={1}
                  _hover={{
                    color: 'blue.700',
                    textDecoration: 'underline',
                  }}
                >
                  <Text as="span">
                    {t('sourceReference.viewInArticle')}: &quot;
                    {question.sourceLocation.anchorText.length > 60
                      ? `${question.sourceLocation.anchorText.slice(0, 60)}...`
                      : question.sourceLocation.anchorText}
                    &quot;
                  </Text>
                  <Text as="span" fontSize="lg">
                    ↗
                  </Text>
                </Link>
                {question.sourceLocation.estimatedParagraph && (
                  <Text fontSize="xs" color="gray.600" mt={1}>
                    {t('sourceReference.locatedNear')} {question.sourceLocation.estimatedParagraph}
                  </Text>
                )}
              </Box>
            )}

            {question.relevantContext && (
              <Box mt={4}>
                <Blockquote
                  variant="plain"
                  colorPalette="teal"
                  showDash
                  icon={
                    <Float placement="top-start" offsetY="2">
                      <BlockquoteIcon />
                    </Float>
                  }
                >
                  <Text
                    textTransform="uppercase"
                    fontSize="xs"
                    letterSpacing="0.2em"
                    color="teal.600"
                    mb={2}
                  >
                    {t('fromArticle')}
                  </Text>
                  <Text color="gray.700" fontStyle="italic">
                    {question.relevantContext}
                  </Text>
                </Blockquote>
              </Box>
            )}

            {(question.remediationBody || question.remediationKeyQuote) && (
              <Box mt={4}>
                {question.remediationBody && (
                  <Text color="gray.700" lineHeight="1.6" mb={question.remediationKeyQuote ? 3 : 0}>
                    {question.remediationBody}
                  </Text>
                )}
                {question.remediationKeyQuote && (
                  <Blockquote
                    variant="plain"
                    colorPalette="teal"
                    showDash
                    icon={
                      <Float placement="top-start" offsetY="2">
                        <BlockquoteIcon />
                      </Float>
                    }
                  >
                    <Text
                      textTransform="uppercase"
                      fontSize="xs"
                      letterSpacing="0.2em"
                      color="teal.600"
                      mb={2}
                    >
                      {t('fromArticle')}
                    </Text>
                    <Text color="gray.700" fontStyle="italic">
                      {question.remediationKeyQuote}
                    </Text>
                  </Blockquote>
                )}
              </Box>
            )}
          </Box>
        )}
      </VStack>
    </Box>
  )
}

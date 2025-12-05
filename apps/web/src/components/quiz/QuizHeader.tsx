'use client'

import { Badge, Box, Flex, Heading, Link, Text } from '@chakra-ui/react'
import { useTranslations } from 'next-intl'

type Props = {
  title: string
  subtitle?: string
  articleUrl?: string | null
  linkText?: string
}

export function QuizHeader({ title, subtitle, articleUrl, linkText }: Props) {
  const t = useTranslations('header')
  const finalLinkText = linkText || t('originalArticle')
  return (
    <Flex
      as="header"
      direction="column"
      gap={2}
      p={4}
      borderRadius="lg"
      bg="white"
      borderWidth="1px"
      borderColor="gray.200"
    >
      {subtitle && (
        <Text textTransform="uppercase" letterSpacing="wider" fontSize="xs" color="gray.500">
          {subtitle}
        </Text>
      )}
      <Heading size="2xl" color="gray.900">
        {title}
      </Heading>
      {articleUrl && (
        <Link
          href={articleUrl}
          color="blue.600"
          fontSize="sm"
          wordBreak="break-all"
          target="_blank"
          rel="noreferrer"
        >
          {finalLinkText}
        </Link>
      )}
    </Flex>
  )
}

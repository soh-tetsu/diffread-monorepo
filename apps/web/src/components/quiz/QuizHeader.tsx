import { Badge, Box, Flex, Heading, Link, Text } from '@chakra-ui/react'

type Props = {
  title: string
  subtitle?: string
  articleUrl?: string | null
  progressText: string
  linkText?: string
}

export function QuizHeader({
  title,
  subtitle,
  articleUrl,
  progressText,
  linkText = 'Original Article',
}: Props) {
  return (
    <Flex
      as="header"
      direction={{ base: 'column', md: 'row' }}
      justify="space-between"
      align="flex-start"
      gap={4}
      p={{ base: 4, md: 6 }}
      borderRadius="2xl"
      bg="white"
      borderWidth="1px"
      borderColor="gray.200"
    >
      <Box flex="1">
        {subtitle && (
          <Text
            textTransform="uppercase"
            letterSpacing="wider"
            fontSize="xs"
            color="gray.500"
            mb={2}
          >
            {subtitle}
          </Text>
        )}
        <Heading size="4xl" color="gray.900">
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
            {linkText}
          </Link>
        )}
      </Box>
      <Badge
        px={4}
        py={2.5}
        borderRadius="full"
        borderWidth="1px"
        borderColor="gray.200"
        fontSize="sm"
        colorPalette="gray"
        variant="outline"
        alignSelf={{ base: 'stretch', md: 'flex-start' }}
        textAlign={{ base: 'center', md: 'left' }}
      >
        {progressText}
      </Badge>
    </Flex>
  )
}

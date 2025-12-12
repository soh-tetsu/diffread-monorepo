import { Box, Stack, Text } from '@chakra-ui/react'
import { getTranslations } from 'next-intl/server'
import { ShareConfirmClient } from './ShareConfirmClient'

type SearchParams = {
  url?: string
  title?: string
  filename?: string
}

export default async function ShareConfirmPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const t = await getTranslations('shareConfirm')

  const url = params.url
  const title = params.title
  const filename = params.filename

  const displayTitle = title || filename || url || 'Article'

  return (
    <Box
      minH="100vh"
      display="flex"
      alignItems="center"
      justifyContent="center"
      bg="radial-gradient(circle at top, #ffffff, #f4f7fb 70%)"
      px={4}
    >
      <Box maxW="500px" w="full" textAlign="center">
        <Stack gap={6}>
          {/* Icon/Status */}
          <Box>
            <Text fontSize="4xl" mb={2}>
              📄
            </Text>
            <Text fontSize="xl" fontWeight="semibold" color="gray.900">
              {t('title')}
            </Text>
            <Text
              fontSize="sm"
              color="gray.600"
              mt={3}
              css={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {displayTitle}
            </Text>
          </Box>

          {/* Client-side interactive buttons */}
          <ShareConfirmClient url={url} title={title} />
        </Stack>
      </Box>
    </Box>
  )
}

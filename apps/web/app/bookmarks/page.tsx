'use client'

import {
  Badge,
  Box,
  Button,
  Card,
  Heading,
  HStack,
  Link,
  Spinner,
  Stack,
  Text,
  VStack,
} from '@chakra-ui/react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'
import useSWR from 'swr'
import { AppToolbar } from '@/components/ui/AppToolbar'
import { readGuestIdFromCookie } from '@/lib/guest/cookie'
import type { SessionStatus, StudyStatus } from '@/types/db'

type BookmarkSession = {
  sessionToken: string
  articleTitle: string | null
  articleUrl: string
  status: SessionStatus
  studyStatus: StudyStatus
  timestamp: number
}

type BookmarksResponse = {
  queue: BookmarkSession[]
  waiting: BookmarkSession[]
  archived: BookmarkSession[]
}

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: 'same-origin' })
  if (!res.ok) throw new Error('Failed to fetch bookmarks')
  return res.json()
}

export default function BookmarksPage() {
  const t = useTranslations('bookmarks')
  const router = useRouter()
  const guestId = readGuestIdFromCookie()

  const { data, error, isLoading } = useSWR<BookmarksResponse>(
    guestId ? '/api/bookmarks' : null,
    fetcher,
    {
      refreshInterval: 30000, // Poll every 30 seconds
      refreshWhenHidden: false, // Stop polling when tab is hidden
      refreshWhenOffline: false, // Stop polling when offline
      revalidateOnFocus: true, // Refresh when tab becomes visible again
      dedupingInterval: 5000, // Prevent duplicate requests within 5s
    }
  )

  // Redirect to home if no guest ID (they need to complete onboarding first)
  useEffect(() => {
    if (!isLoading && !guestId) {
      router.push('/')
    }
  }, [guestId, isLoading, router])

  if (!guestId) {
    return (
      <Box minH="100vh" bg="radial-gradient(circle at top, #ffffff, #f4f7fb 70%)">
        <AppToolbar progressText="" />
        <Box maxW="960px" mx="auto" px={4} py={8} textAlign="center">
          <Text color="gray.600">{t('noGuestId')}</Text>
        </Box>
      </Box>
    )
  }

  if (isLoading) {
    return (
      <Box minH="100vh" bg="radial-gradient(circle at top, #ffffff, #f4f7fb 70%)">
        <AppToolbar progressText="" />
        <Box maxW="960px" mx="auto" px={4} py={8} textAlign="center">
          <Spinner size="lg" color="teal.500" />
        </Box>
      </Box>
    )
  }

  if (error) {
    return (
      <Box minH="100vh" bg="radial-gradient(circle at top, #ffffff, #f4f7fb 70%)">
        <AppToolbar progressText="" />
        <Box maxW="960px" mx="auto" px={4} py={8}>
          <Text color="red.600">{t('errorLoading')}</Text>
        </Box>
      </Box>
    )
  }

  const { queue = [], waiting = [], archived = [] } = data || {}

  return (
    <Box minH="100vh" bg="radial-gradient(circle at top, #ffffff, #f4f7fb 70%)" color="gray.900">
      <AppToolbar />

      <Box maxW="960px" mx="auto" px={4} py={6}>
        <VStack align="stretch" gap={8}>
          {/* Queue Section */}
          <Box>
            <HStack justify="space-between" mb={4}>
              <Heading size="lg">{t('queueTitle')}</Heading>
              <Text fontSize="sm" color="gray.600">
                {t('queueCount', { current: queue.length, max: 2 })}
              </Text>
            </HStack>

            {queue.length === 0 ? (
              <Card.Root bg="gray.50" borderColor="gray.200">
                <Card.Body>
                  <Text color="gray.600" textAlign="center">
                    {t('queueEmpty')}
                  </Text>
                </Card.Body>
              </Card.Root>
            ) : (
              <Stack gap={3}>
                {queue.map((session) => (
                  <Card.Root
                    key={session.sessionToken}
                    bg="white"
                    borderColor="teal.300"
                    borderWidth="2px"
                  >
                    <Card.Body py={3}>
                      <Stack
                        direction={{ base: 'column', md: 'row' }}
                        justify="space-between"
                        align={{ base: 'stretch', md: 'center' }}
                        gap={3}
                      >
                        <VStack align="stretch" gap={1} flex={1} minW={0}>
                          <Text fontWeight="semibold" fontSize="sm" color="blackAlpha.900">
                            {session.articleTitle ||
                              (session.articleUrl.length > 40
                                ? `${session.articleUrl.substring(0, 40)}...`
                                : session.articleUrl)}
                          </Text>
                          <Link
                            href={session.articleUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            fontSize="xs"
                            color="blue.600"
                            _hover={{ textDecoration: 'underline' }}
                          >
                            {session.articleUrl.length > 40
                              ? `${session.articleUrl.substring(0, 40)}...`
                              : session.articleUrl}
                          </Link>
                        </VStack>
                        <Button
                          size="sm"
                          colorPalette={
                            session.status === 'ready' &&
                            (session.studyStatus === 'curiosity_in_progress' ||
                              session.studyStatus === 'scaffold_in_progress')
                              ? 'purple'
                              : 'teal'
                          }
                          flexShrink={{ base: 1, md: 0 }}
                          minW={{ base: 'auto', md: '120px' }}
                          w={{ base: 'full', md: 'auto' }}
                          loading={session.status === 'pending'}
                          loadingText={t('processing')}
                          onClick={() => router.push(`/quiz?q=${session.sessionToken}`)}
                        >
                          {session.status === 'ready' && session.studyStatus === 'not_started'
                            ? t('start')
                            : session.status === 'ready' &&
                                (session.studyStatus === 'curiosity_in_progress' ||
                                  session.studyStatus === 'scaffold_in_progress')
                              ? t('continue')
                              : t('processing')}
                        </Button>
                      </Stack>
                    </Card.Body>
                  </Card.Root>
                ))}
              </Stack>
            )}
          </Box>

          {/* Waiting List Section */}
          {waiting.length > 0 && (
            <Box>
              <HStack justify="space-between" mb={4}>
                <Heading size="lg">{t('waitingTitle')}</Heading>
                <Text fontSize="sm" color="gray.600">
                  {t('waitingCount', { count: waiting.length })}
                </Text>
              </HStack>

              <Stack gap={2}>
                {waiting.map((session, index) => (
                  <Card.Root key={session.sessionToken} bg="white" borderColor="gray.200">
                    <Card.Body py={2}>
                      <Stack
                        direction={{ base: 'column', md: 'row' }}
                        justify="space-between"
                        align={{ base: 'stretch', md: 'center' }}
                        gap={3}
                      >
                        <VStack align="stretch" gap={0.5} flex={1} minW={0}>
                          <HStack gap={2}>
                            <Text fontSize="sm" fontWeight="medium" color="gray.700" flexShrink={0}>
                              #{index + 1}
                            </Text>
                            <Text fontSize="sm" fontWeight="medium" color="blackAlpha.900">
                              {session.articleTitle ||
                                (session.articleUrl.length > 40
                                  ? `${session.articleUrl.substring(0, 40)}...`
                                  : session.articleUrl)}
                            </Text>
                          </HStack>
                          <Link
                            href={session.articleUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            fontSize="xs"
                            color="blue.600"
                            _hover={{ textDecoration: 'underline' }}
                          >
                            {session.articleUrl.length > 40
                              ? `${session.articleUrl.substring(0, 40)}...`
                              : session.articleUrl}
                          </Link>
                        </VStack>
                        <Badge
                          colorPalette={
                            session.status === 'errored'
                              ? 'orange'
                              : session.status.startsWith('skip_by_')
                                ? 'red'
                                : 'gray'
                          }
                          size="sm"
                          flexShrink={0}
                        >
                          {session.status === 'errored'
                            ? t('errorWillRetry')
                            : session.status.startsWith('skip_by_')
                              ? t('failedToProcess')
                              : t('bookmarked')}
                        </Badge>
                      </Stack>
                    </Card.Body>
                  </Card.Root>
                ))}
              </Stack>
            </Box>
          )}

          {/* Archive Section */}
          {archived.length > 0 && (
            <Box>
              <HStack justify="space-between" mb={4}>
                <Heading size="lg">{t('archiveTitle')}</Heading>
                <Text fontSize="sm" color="gray.600">
                  {t('archiveCount', { count: archived.length })}
                </Text>
              </HStack>

              <Stack gap={2}>
                {archived.map((session) => (
                  <Card.Root key={session.sessionToken} bg="gray.50" borderColor="gray.200">
                    <Card.Body py={2}>
                      <Stack
                        direction={{ base: 'column', md: 'row' }}
                        justify="space-between"
                        align={{ base: 'stretch', md: 'center' }}
                        gap={3}
                      >
                        <VStack align="stretch" gap={0.5} flex={1} minW={0}>
                          <Text fontSize="sm" fontWeight="medium" color="blackAlpha.900">
                            {session.articleTitle ||
                              (session.articleUrl.length > 40
                                ? `${session.articleUrl.substring(0, 40)}...`
                                : session.articleUrl)}
                          </Text>
                          <Link
                            href={session.articleUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            fontSize="xs"
                            color="blue.600"
                            _hover={{ textDecoration: 'underline' }}
                          >
                            {session.articleUrl.length > 40
                              ? `${session.articleUrl.substring(0, 40)}...`
                              : session.articleUrl}
                          </Link>
                        </VStack>
                        <Button
                          size="xs"
                          variant="ghost"
                          colorPalette="gray"
                          flexShrink={{ base: 1, md: 0 }}
                          w={{ base: 'full', md: 'auto' }}
                          onClick={() => router.push(`/quiz?q=${session.sessionToken}`)}
                        >
                          {t('review')}
                        </Button>
                      </Stack>
                    </Card.Body>
                  </Card.Root>
                ))}
              </Stack>
            </Box>
          )}
        </VStack>
      </Box>
    </Box>
  )
}

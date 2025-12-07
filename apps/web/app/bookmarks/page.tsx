'use client'

import {
  Badge,
  Box,
  Button,
  ButtonGroup,
  Card,
  Heading,
  HStack,
  IconButton,
  Link,
  Spinner,
  Stack,
  Text,
  VStack,
} from '@chakra-ui/react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { LuTrash2, LuX } from 'react-icons/lu'
import useSWR from 'swr'
import { AppToolbar } from '@/components/ui/AppToolbar'
import { toaster } from '@/components/ui/toaster'
import { readGuestIdFromCookie } from '@/lib/guest/cookie'
import { formatUrlForDisplay } from '@/lib/utils/format-url'
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
  const [deletingToken, setDeletingToken] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)

  const { data, error, isLoading, mutate } = useSWR<BookmarksResponse>(
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

  const handleDeleteClick = (sessionToken: string) => {
    setConfirmingDelete(sessionToken)
  }

  const handleDeleteCancel = () => {
    setConfirmingDelete(null)
  }

  const handleDeleteConfirm = async (sessionToken: string) => {
    setDeletingToken(sessionToken)
    setConfirmingDelete(null)

    try {
      const res = await fetch(`/api/sessions?token=${sessionToken}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })

      if (!res.ok) {
        throw new Error('Failed to delete session')
      }

      // Refresh the bookmarks list
      await mutate()

      toaster.success({
        title: t('delete'),
        description: 'Session deleted successfully',
      })
    } catch (err) {
      toaster.error({
        title: 'Error',
        description: 'Failed to delete session',
      })
    } finally {
      setDeletingToken(null)
    }
  }

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
                            {session.articleTitle || formatUrlForDisplay(session.articleUrl)}
                          </Text>
                          <Link
                            href={session.articleUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            fontSize="xs"
                            color="blue.600"
                            _hover={{ textDecoration: 'underline' }}
                          >
                            {formatUrlForDisplay(session.articleUrl)}
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
                      <HStack align="start" gap={3} w="full">
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
                          alignSelf="center"
                        >
                          #{index + 1}
                        </Badge>
                        <VStack align="stretch" gap={0.5} flex={1} minW={0}>
                          <Text fontSize="sm" fontWeight="medium" color="blackAlpha.900">
                            {session.articleTitle || formatUrlForDisplay(session.articleUrl)}
                          </Text>
                          <Link
                            href={session.articleUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            fontSize="xs"
                            color="blue.600"
                            _hover={{ textDecoration: 'underline' }}
                          >
                            {formatUrlForDisplay(session.articleUrl)}
                          </Link>
                        </VStack>
                        {confirmingDelete === session.sessionToken ? (
                          <ButtonGroup size="xs" flexShrink={0} alignSelf="center">
                            <Button variant="outline" onClick={handleDeleteCancel}>
                              {t('cancel')}
                            </Button>
                            <Button
                              colorPalette="red"
                              variant="outline"
                              loading={deletingToken === session.sessionToken}
                              onClick={() => handleDeleteConfirm(session.sessionToken)}
                            >
                              {t('delete')}
                            </Button>
                          </ButtonGroup>
                        ) : (
                          <IconButton
                            aria-label={t('delete')}
                            size="sm"
                            variant="ghost"
                            colorPalette="red"
                            loading={deletingToken === session.sessionToken}
                            onClick={() => handleDeleteClick(session.sessionToken)}
                            flexShrink={0}
                            alignSelf="center"
                          >
                            <LuTrash2 />
                          </IconButton>
                        )}
                      </HStack>
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
                      <HStack align="start" gap={3} w="full">
                        <VStack align="stretch" gap={0.5} flex={1} minW={0}>
                          <Text fontSize="sm" fontWeight="medium" color="blackAlpha.900">
                            {session.articleTitle || formatUrlForDisplay(session.articleUrl)}
                          </Text>
                          <Link
                            href={session.articleUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            fontSize="xs"
                            color="blue.600"
                            _hover={{ textDecoration: 'underline' }}
                          >
                            {formatUrlForDisplay(session.articleUrl)}
                          </Link>
                        </VStack>
                        {confirmingDelete === session.sessionToken ? (
                          <ButtonGroup size="xs" flexShrink={0} alignSelf="center">
                            <Button variant="outline" onClick={handleDeleteCancel}>
                              {t('cancel')}
                            </Button>
                            <Button
                              colorPalette="red"
                              variant="outline"
                              loading={deletingToken === session.sessionToken}
                              onClick={() => handleDeleteConfirm(session.sessionToken)}
                            >
                              {t('delete')}
                            </Button>
                          </ButtonGroup>
                        ) : (
                          <IconButton
                            aria-label={t('delete')}
                            size="xs"
                            variant="ghost"
                            colorPalette="red"
                            loading={deletingToken === session.sessionToken}
                            onClick={() => handleDeleteClick(session.sessionToken)}
                            flexShrink={0}
                            alignSelf="center"
                          >
                            <LuTrash2 />
                          </IconButton>
                        )}
                      </HStack>
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

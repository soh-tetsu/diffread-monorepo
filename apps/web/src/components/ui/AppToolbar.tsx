'use client'

import { Badge, Box, Button, Flex, HStack, IconButton } from '@chakra-ui/react'
import NextLink from 'next/link'
import { usePathname } from 'next/navigation'
import { LuBookmark, LuHouse, LuMenu } from 'react-icons/lu'
import useSWR from 'swr'
import { SettingsMenu } from '@/components/ui/SettingsMenu'

type AppToolbarProps = {
  progressText?: string
  queueCount?: number
}

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: 'same-origin' })
  if (!res.ok) return { count: 0 }
  return res.json()
}

export function AppToolbar({ progressText }: AppToolbarProps) {
  const pathname = usePathname()

  // Determine current page
  const isHomePage = pathname === '/' || pathname === '/en' || pathname === '/ja'
  const isBookmarksPage = pathname === '/bookmarks'

  // Use SWR for queue count - automatically caches and shares across pages
  const { data } = useSWR<{ count: number }>('/api/queue-count', fetcher, {
    refreshInterval: 30000, // Poll every 30 seconds
    refreshWhenHidden: false, // Stop polling when tab is hidden
    refreshWhenOffline: false, // Stop polling when offline
    revalidateOnFocus: true, // Refresh when tab becomes visible again
    dedupingInterval: 5000, // Prevent duplicate requests within 5s
  })

  const queueCount = data?.count ?? 0

  return (
    <Box
      as="nav"
      position="sticky"
      top={0}
      zIndex={1000}
      px={4}
      py={2}
      css={{
        backdropFilter: 'blur(8px)',
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
      }}
    >
      <Flex align="center" gap={2} maxW="960px" mx="auto" justify="space-between">
        <HStack gap={2}>
          {/* Menu Button - Always Active */}
          <SettingsMenu />

          {/* Home Button - Highlighted on home page */}
          <IconButton
            asChild={!isHomePage}
            variant="ghost"
            aria-label="Home"
            disabled={isHomePage}
            colorPalette="teal"
            cursor={isHomePage ? 'default' : 'pointer'}
            color={isHomePage ? 'red.600' : undefined}
            _hover={isHomePage ? {} : undefined}
          >
            {isHomePage ? (
              <LuHouse size={20} />
            ) : (
              <NextLink href="/">
                <LuHouse size={20} />
              </NextLink>
            )}
          </IconButton>

          {/* Bookmark Button - Highlighted on bookmarks page */}
          <IconButton
            asChild={!isBookmarksPage}
            variant="ghost"
            aria-label="Bookmarks"
            position="relative"
            disabled={isBookmarksPage}
            colorPalette="teal"
            cursor={isBookmarksPage ? 'default' : 'pointer'}
            color={isBookmarksPage ? 'red.600' : undefined}
            _hover={isBookmarksPage ? {} : undefined}
          >
            {isBookmarksPage ? (
              <>
                <LuBookmark size={20} />
                {queueCount > 0 && (
                  <Badge
                    position="absolute"
                    top="-4px"
                    right="-4px"
                    colorPalette="teal"
                    size="xs"
                    variant="solid"
                    rounded="full"
                    minW="18px"
                    h="18px"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    fontSize="10px"
                    p={0}
                  >
                    {queueCount}
                  </Badge>
                )}
              </>
            ) : (
              <NextLink href="/bookmarks">
                <LuBookmark size={20} />
                {queueCount > 0 && (
                  <Badge
                    position="absolute"
                    top="-4px"
                    right="-4px"
                    colorPalette="teal"
                    size="xs"
                    variant="solid"
                    rounded="full"
                    minW="18px"
                    h="18px"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    fontSize="10px"
                    p={0}
                  >
                    {queueCount}
                  </Badge>
                )}
              </NextLink>
            )}
          </IconButton>
        </HStack>

        {/* Progress Badge */}
        {progressText && (
          <Badge
            px={3}
            py={1.5}
            borderRadius="full"
            borderWidth="1px"
            borderColor="gray.200"
            fontSize="sm"
            colorPalette="gray"
            variant="outline"
            bg="white"
            flexShrink={0}
          >
            {progressText}
          </Badge>
        )}
      </Flex>
    </Box>
  )
}

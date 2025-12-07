'use client'

import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  HStack,
  Link,
  SegmentGroup,
  Text,
  VStack,
} from '@chakra-ui/react'
import NextLink from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import {
  LuBookmark,
  LuChevronLeft,
  LuCircleAlert,
  LuDownload,
  LuHouse,
  LuMenu,
  LuTrash2,
} from 'react-icons/lu'
import useSWR from 'swr'
import { CloseButton } from '@/components/ui/close-button'
import {
  DrawerBackdrop,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerRoot,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'
import { useUserProfile } from '@/hooks/useUserProfile'
import { locales } from '@/i18n/config'
import { forceUpdateApp } from '@/lib/utils/service-worker'
import { APP_VERSION } from '@/lib/version'

const localeConfig = {
  en: { flag: '🇺🇸', label: 'English' },
  ja: { flag: '🇯🇵', label: '日本語' },
} as const

type SettingsMenuProps = {
  showHomeButton?: boolean
}

const queueCountFetcher = async (url: string) => {
  const res = await fetch(url, { credentials: 'same-origin' })
  if (!res.ok) return { count: 0 }
  return res.json()
}

export function SettingsMenu({ showHomeButton = false }: SettingsMenuProps) {
  const t = useTranslations('settings')
  const locale = useLocale()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isDev, setIsDev] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const { hasCompletedOnboarding, profile } = useUserProfile()
  const { isInstallable, promptInstall } = useInstallPrompt()

  useEffect(() => {
    setIsDev(process.env.NODE_ENV === 'development')
  }, [])

  // Use SWR for queue count - shares cache with AppToolbar and homepage
  const { data: queueData } = useSWR<{ count: number }>(
    profile?.userId ? '/api/queue-count' : null,
    queueCountFetcher,
    {
      refreshInterval: 30000,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    }
  )

  const queueCount = queueData?.count ?? 0

  const switchLocale = async (newLocale: string) => {
    // Store in localStorage (primary source for client-side i18n)
    localStorage.setItem('NEXT_LOCALE', newLocale)

    // Set cookie via API route (for backwards compatibility)
    await fetch('/api/locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: newLocale }),
    })

    // Dispatch custom event to notify LocaleProvider
    window.dispatchEvent(
      new CustomEvent('localeChange', {
        detail: { locale: newLocale },
      })
    )
  }

  const handleForceUpdate = async () => {
    setIsUpdating(true)
    await forceUpdateApp()
    // Page will reload, so no need to setIsUpdating(false)
  }

  return (
    <>
      {/* Menu Drawer */}
      <DrawerRoot open={open} onOpenChange={(e) => setOpen(e.open)} placement="start" size="xs">
        <DrawerTrigger asChild>
          <Button size="sm" variant="ghost" colorPalette="teal" position="relative">
            <LuMenu size={20} />
            {!hasCompletedOnboarding && (
              <Box
                position="absolute"
                top="2px"
                right="2px"
                w="8px"
                h="8px"
                bg="red.600"
                rounded="full"
              />
            )}
          </Button>
        </DrawerTrigger>
        <DrawerBackdrop />
        <DrawerContent>
          <DrawerHeader>
            <CloseButton
              size="sm"
              position="absolute"
              colorPalette="teal"
              top={2}
              right={2}
              rounded="full"
              onClick={() => setOpen(false)}
            >
              <LuChevronLeft />
            </CloseButton>
          </DrawerHeader>
          <DrawerBody>
            <VStack align="stretch" gap={4} h="full" py={2}>
              {/* User ID Display or Onboarding Task */}
              {profile?.userId ? (
                <Card.Root size="sm" variant="elevated">
                  <Card.Body>
                    <HStack justify="space-between" gap={2}>
                      <Text fontSize="xs" color="gray.600" fontFamily="mono">
                        {profile.userId.split('-').slice(0, 2).join('-')}...
                      </Text>
                      <Badge colorPalette="gray" size="sm" flexShrink={0}>
                        {t('guest')}
                      </Badge>
                    </HStack>
                  </Card.Body>
                </Card.Root>
              ) : (
                !hasCompletedOnboarding && (
                  <Card.Root size="sm" variant="outline" borderColor="orange.200" bg="orange.50">
                    <Card.Body>
                      <VStack align="stretch" gap={2}>
                        <HStack justify="space-between">
                          <HStack gap={2}>
                            <LuCircleAlert size={16} color="var(--orange-600)" />
                            <Text fontSize="sm" fontWeight="semibold" color="orange.700">
                              {t('onboardingPending')}
                            </Text>
                          </HStack>
                          <Badge colorPalette="orange" size="sm">
                            {t('todo')}
                          </Badge>
                        </HStack>
                        <Text fontSize="xs" color="gray.600">
                          {t('onboardingDescription')}
                        </Text>
                        <Button
                          size="xs"
                          colorPalette="orange"
                          variant="solid"
                          onClick={() => {
                            setOpen(false)
                            router.push('/')
                          }}
                        >
                          {t('startOnboarding')}
                        </Button>
                      </VStack>
                    </Card.Body>
                  </Card.Root>
                )
              )}

              {/* Navigation Links */}
              {profile?.userId && (
                <VStack align="stretch" gap={1}>
                  <Button
                    asChild
                    variant="ghost"
                    size="md"
                    justifyContent="flex-start"
                    onClick={() => setOpen(false)}
                  >
                    <NextLink href="/">
                      <HStack gap={3}>
                        <LuHouse size={18} />
                        <Text color={'blackAlpha.900'}>{t('home')}</Text>
                      </HStack>
                    </NextLink>
                  </Button>

                  <Button
                    asChild
                    variant="ghost"
                    size="md"
                    justifyContent="space-between"
                    onClick={() => setOpen(false)}
                  >
                    <NextLink href="/bookmarks">
                      <HStack gap={3}>
                        <LuBookmark size={18} />
                        <Text color={'blackAlpha.900'}>{t('bookmarks')}</Text>
                      </HStack>
                      {queueCount > 0 && (
                        <Badge colorPalette="teal" size="sm" variant="solid">
                          {queueCount}
                        </Badge>
                      )}
                    </NextLink>
                  </Button>
                </VStack>
              )}

              {/* Language Switcher */}
              <VStack align="stretch" gap={2} pt={2} borderTopWidth="1px" borderColor="gray.100">
                <Text fontSize="xs" fontWeight="medium" color={'blackAlpha.900'} px={1}>
                  {t('language')}
                </Text>
                <HStack gap={1}>
                  {locales.map((loc) => (
                    <Button
                      key={loc}
                      size="sm"
                      variant={locale === loc ? 'solid' : 'ghost'}
                      colorPalette="teal"
                      onClick={() => switchLocale(loc)}
                      flex={1}
                    >
                      <HStack gap={1.5}>
                        <Text fontSize="sm">{localeConfig[loc].flag}</Text>
                        <Text fontSize="sm" color={'blackAlpha.950'}>
                          {localeConfig[loc].label}
                        </Text>
                      </HStack>
                    </Button>
                  ))}
                </HStack>
              </VStack>

              {/* Spacer */}
              <Flex flex={1} />

              {/* Install App Button */}
              {isInstallable && (
                <Button
                  size="sm"
                  colorPalette="teal"
                  variant="outline"
                  onClick={async () => {
                    await promptInstall()
                  }}
                >
                  <HStack gap={2}>
                    <LuDownload size={16} />
                    <Text color={'blackAlpha.900'}>Install App</Text>
                  </HStack>
                </Button>
              )}

              {/* Clean Cache Button */}
              <Button
                variant="ghost"
                size="md"
                justifyContent="flex-start"
                loading={isUpdating}
                onClick={handleForceUpdate}
              >
                <HStack gap={3}>
                  <LuTrash2 size={18} />
                  <Text color={'blackAlpha.900'}>{t('cleanCache')}</Text>
                </HStack>
              </Button>

              {/* Manifest Link */}
              <Link asChild color="teal.600" fontSize="sm" textAlign="center">
                <NextLink href="/manifest">{t('manifest')}</NextLink>
              </Link>

              {/* Version */}
              <HStack justify="center" gap={2}>
                <Link asChild color="gray.500" fontSize="xs">
                  <NextLink href="/releases">Version {APP_VERSION}</NextLink>
                </Link>
                {isDev ? (
                  <Badge colorPalette="orange" size="sm" variant="solid">
                    DEV
                  </Badge>
                ) : (
                  <Badge colorPalette="teal" size="sm" variant="solid">
                    PROD
                  </Badge>
                )}
              </HStack>
            </VStack>
          </DrawerBody>
        </DrawerContent>
      </DrawerRoot>

      {/* Home Button - only visible when prop is true */}
      {showHomeButton && (
        <Button asChild size="sm" variant="ghost" colorPalette="teal" rounded="full">
          <NextLink href="/">
            <LuHouse size={20} />
          </NextLink>
        </Button>
      )}
    </>
  )
}

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
import { useState } from 'react'
import { LuChevronLeft, LuCircleAlert, LuHouse, LuMenu } from 'react-icons/lu'
import { CloseButton } from '@/components/ui/close-button'
import {
  DrawerBackdrop,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerRoot,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { useUserProfile } from '@/hooks/useUserProfile'
import { locales } from '@/i18n/config'
import { APP_VERSION } from '@/lib/version'

const localeConfig = {
  en: { flag: '🇺🇸', label: 'English' },
  ja: { flag: '🇯🇵', label: '日本語' },
} as const

type SettingsMenuProps = {
  showHomeButton?: boolean
}

export function SettingsMenu({ showHomeButton = false }: SettingsMenuProps) {
  const t = useTranslations('settings')
  const locale = useLocale()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const { hasCompletedOnboarding, profile } = useUserProfile()

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

  return (
    <>
      {/* Menu Drawer */}
      <DrawerRoot
        open={open}
        onOpenChange={(e) => setOpen(e.open)}
        placement="start"
        size={{ base: 'xs', md: 'sm' }}
      >
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
                // borderWidth="1.5px"
                // borderColor="white"
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
            <VStack align="stretch" gap={6} h="full" py={4}>
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

              {/* Language Switcher */}
              <VStack align="stretch" gap={3}>
                <Text fontSize="sm" fontWeight="semibold" color="gray.600" px={2}>
                  {t('language')}
                </Text>
                <Flex justify="center">
                  <SegmentGroup.Root
                    value={locale}
                    onValueChange={(e) => switchLocale(e.value || 'en')}
                    css={{
                      '--segment-indicator-bg': 'colors.teal.500',
                      '--segment-indicator-shadow': 'shadows.md',
                    }}
                  >
                    <SegmentGroup.Indicator />
                    <SegmentGroup.Items
                      items={locales.map((loc) => ({
                        value: loc,
                        label: (
                          <HStack>
                            {localeConfig[loc].flag} {localeConfig[loc].label}
                          </HStack>
                        ),
                      }))}
                    />
                  </SegmentGroup.Root>
                </Flex>
              </VStack>

              {/* Spacer */}
              <Flex flex={1} />

              {/* Manifest Link */}
              <Link asChild color="teal.600" fontSize="sm" textAlign="center">
                <NextLink href="/manifest">{t('manifest')}</NextLink>
              </Link>

              {/* Version */}
              <Link asChild color="gray.500" fontSize="xs" textAlign="center">
                <NextLink href="/releases">Version {APP_VERSION}</NextLink>
              </Link>
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

'use client'

import { Button, Card, Flex, HStack, Link, SegmentGroup, Text, VStack } from '@chakra-ui/react'
import NextLink from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { LuChevronLeft, LuHouse, LuMenu } from 'react-icons/lu'
import { CloseButton } from '@/components/ui/close-button'
import {
  DrawerBackdrop,
  DrawerBody,
  DrawerCloseTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerRoot,
  DrawerTrigger,
} from '@/components/ui/drawer'
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

  const switchLocale = async (newLocale: string) => {
    // Store in localStorage
    localStorage.setItem('NEXT_LOCALE', newLocale)

    // Set cookie via API route
    await fetch('/api/locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: newLocale }),
    })

    // Refresh to apply new locale
    router.refresh()
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
          <Button size="sm" variant="ghost" colorPalette="teal">
            <LuMenu size={20} />
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

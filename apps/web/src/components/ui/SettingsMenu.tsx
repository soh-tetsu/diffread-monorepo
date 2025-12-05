'use client'

import { Button, Flex, Text } from '@chakra-ui/react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { LuSettings } from 'react-icons/lu'
import { MenuContent, MenuItem, MenuRoot, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { locales } from '@/i18n/config'

const localeConfig = {
  en: { flag: '🇺🇸', label: 'English' },
  ja: { flag: '🇯🇵', label: '日本語' },
} as const

export function SettingsMenu() {
  const t = useTranslations('settings')
  const locale = useLocale()
  const router = useRouter()

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
    <MenuRoot positioning={{ placement: 'bottom-start' }}>
      <MenuTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          colorPalette="gray"
          position="absolute"
          top={4}
          left={4}
          zIndex={1000}
          borderRadius="full"
          borderWidth="1px"
          borderColor="gray.200"
          bg="white"
          shadow="sm"
          px={2}
          py={2}
        >
          <LuSettings size={16} />
        </Button>
      </MenuTrigger>
      <MenuContent minW="180px">
        <Text px={3} py={2} fontSize="xs" fontWeight="semibold" color="gray.500">
          {t('language')}
        </Text>
        {locales.map((loc) => (
          <MenuItem
            key={loc}
            value={loc}
            onClick={() => switchLocale(loc)}
            bg={locale === loc ? 'blue.50' : 'transparent'}
            fontWeight={locale === loc ? 'semibold' : 'normal'}
          >
            <Flex justify="space-between" align="center" w="full" gap={2}>
              <Flex align="center" gap={2}>
                <Text fontSize="lg">{localeConfig[loc as keyof typeof localeConfig].flag}</Text>
                <Text fontSize="sm" color={locale === loc ? 'blue.700' : 'gray.900'}>
                  {localeConfig[loc as keyof typeof localeConfig].label}
                </Text>
              </Flex>
              {locale === loc && (
                <Text fontSize="xs" color="blue.600">
                  ✓
                </Text>
              )}
            </Flex>
          </MenuItem>
        ))}
        <MenuSeparator />
      </MenuContent>
    </MenuRoot>
  )
}

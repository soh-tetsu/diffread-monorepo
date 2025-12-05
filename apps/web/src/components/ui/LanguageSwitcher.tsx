'use client'

import { Button, Flex } from '@chakra-ui/react'
import { usePathname, useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { locales } from '@/i18n/config'

export function LanguageSwitcher() {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()

  const switchLocale = (newLocale: string) => {
    // Replace current locale in pathname with new locale
    const segments = pathname.split('/')
    segments[1] = newLocale
    router.push(segments.join('/'))
  }

  return (
    <Flex
      gap={1}
      position="fixed"
      top={4}
      right={4}
      zIndex={1000}
      bg="white"
      borderRadius="full"
      borderWidth="1px"
      borderColor="gray.200"
      p={0.5}
      shadow="sm"
    >
      {locales.map((loc) => (
        <Button
          key={loc}
          size="xs"
          variant={locale === loc ? 'solid' : 'ghost'}
          colorPalette={locale === loc ? 'blue' : 'gray'}
          onClick={() => switchLocale(loc)}
          borderRadius="full"
          px={2}
          py={0.5}
          fontSize="2xs"
          fontWeight="medium"
          textTransform="uppercase"
          minW="8"
        >
          {loc}
        </Button>
      ))}
    </Flex>
  )
}

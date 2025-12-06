import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Box, Container, Heading, Link, Text, VStack } from '@chakra-ui/react'
import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import { SettingsMenu } from '@/components/ui/SettingsMenu'
import { Toolbar } from '@/components/ui/Toolbar'
import type { Locale } from '@/i18n/config'

// Load both manifesto versions at build time
async function getAllManifestos() {
  const enPath = join(process.cwd(), '../../Manifesto.md')
  const jaPath = join(process.cwd(), '../../Manifesto.ja.md')

  const [enContent, jaContent] = await Promise.all([
    readFile(enPath, 'utf-8').catch(() => '# Manifesto\n\nContent not available.'),
    readFile(jaPath, 'utf-8').catch(() => readFile(enPath, 'utf-8')), // Fallback to EN
  ])

  return { en: enContent, ja: jaContent }
}

const markdownComponents: Components = {
  h1: ({ children }) => (
    <Heading
      as="h1"
      size="3xl"
      fontWeight="extrabold"
      color="gray.900"
      mb={10}
      textAlign="center"
      lineHeight="1.2"
      letterSpacing="-0.02em"
    >
      {children}
    </Heading>
  ),
  h2: ({ children }) => (
    <Heading
      as="h2"
      size="xl"
      fontWeight="bold"
      color="gray.800"
      mb={4}
      mt={10}
      lineHeight="1.3"
      letterSpacing="-0.01em"
    >
      {children}
    </Heading>
  ),
  p: ({ children }) => (
    <Text fontSize="lg" color="gray.700" mb={4} lineHeight="1.8">
      {children}
    </Text>
  ),
  ul: ({ children }) => (
    <VStack as="ul" align="stretch" gap={3} mb={6} mt={4} pl={6}>
      {children}
    </VStack>
  ),
  li: ({ children }) => (
    <Text as="li" fontSize="lg" color="gray.700" lineHeight="1.8">
      {children}
    </Text>
  ),
  strong: ({ children }) => (
    <Text as="strong" fontWeight="bold" color="gray.900">
      {children}
    </Text>
  ),
  em: ({ children }) => (
    <Text as="em" fontStyle="italic" color="gray.600">
      {children}
    </Text>
  ),
  code: ({ children }) => (
    <Text
      as="code"
      bg="gray.50"
      color="gray.800"
      px={1.5}
      py={0.5}
      borderRadius="md"
      fontSize="sm"
      fontFamily="monospace"
      borderWidth="1px"
      borderColor="gray.200"
    >
      {children}
    </Text>
  ),
  a: ({ children, href }) => (
    <Link href={href} color="blue.600" textDecoration="underline" _hover={{ color: 'blue.700' }}>
      {children}
    </Link>
  ),
}

export default async function ManifestPage() {
  // Load both manifesto versions at build time (static generation)
  const manifestos = await getAllManifestos()

  return <ManifestPageClient manifestos={manifestos} />
}

// Client component to handle locale-specific rendering
function ManifestPageClient({ manifestos }: { manifestos: { en: string; ja: string } }) {
  'use client'

  const { useLocale } = require('next-intl')
  const locale = useLocale() as Locale
  const markdown = manifestos[locale] || manifestos.en

  return (
    <Box minH="100vh" bg="radial-gradient(circle at top, #ffffff, #f4f7fb 70%)">
      <Toolbar>
        <SettingsMenu showHomeButton />
      </Toolbar>

      <Container maxW="3xl" py={1} px={4}>
        <Box
          bg="white"
          borderWidth="1px"
          borderColor="gray.200"
          borderRadius="2xl"
          shadow="xl"
          p={{ base: 6, md: 12 }}
        >
          <ReactMarkdown components={markdownComponents}>{markdown}</ReactMarkdown>
        </Box>
      </Container>
    </Box>
  )
}

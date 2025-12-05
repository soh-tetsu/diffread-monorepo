import { Box, Heading } from '@chakra-ui/react'
import { readFileSync } from 'fs'
import { join } from 'path'
import ReactMarkdown from 'react-markdown'
import { SettingsMenu } from '@/components/ui/SettingsMenu'
import { Toolbar } from '@/components/ui/Toolbar'

export default function ReleasesPage() {
  // Read CHANGELOG.md from project root
  const changelogPath = join(process.cwd(), '../../CHANGELOG.md')
  const changelogContent = readFileSync(changelogPath, 'utf-8')

  return (
    <Box minH="100vh" bg="radial-gradient(circle at top, #ffffff, #f4f7fb 70%)" color="gray.900">
      <Toolbar>
        <SettingsMenu showHomeButton />
      </Toolbar>

      <Box display="flex" justifyContent="center" px={4} py={1}>
        <Box
          maxW="720px"
          w="full"
          p={8}
          bg="white"
          borderWidth="1px"
          borderColor="gray.200"
          borderRadius="2xl"
          shadow="lg"
        >
          <ReactMarkdown
            components={{
              h1: ({ children }) => (
                <Heading as="h1" size="2xl" mb={6} color="gray.900">
                  {children}
                </Heading>
              ),
              h2: ({ children }) => (
                <Heading as="h2" size="lg" mt={8} mb={4} color="teal.600">
                  {children}
                </Heading>
              ),
              h3: ({ children }) => (
                <Heading as="h3" size="md" mt={6} mb={3} color="gray.700">
                  {children}
                </Heading>
              ),
              p: ({ children }) => (
                <Box mb={4} color="gray.700" lineHeight="1.6">
                  {children}
                </Box>
              ),
              ul: ({ children }) => (
                <Box as="ul" mb={4} pl={6} color="gray.700">
                  {children}
                </Box>
              ),
              li: ({ children }) => (
                <Box as="li" mb={2}>
                  {children}
                </Box>
              ),
            }}
          >
            {changelogContent}
          </ReactMarkdown>
        </Box>
      </Box>
    </Box>
  )
}

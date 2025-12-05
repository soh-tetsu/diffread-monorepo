import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Box, Container } from '@chakra-ui/react'
import ReactMarkdown from 'react-markdown'

export const dynamic = 'force-static'
export const revalidate = 3600 // Revalidate every hour

async function getManifestoContent() {
  const manifestoPath = join(process.cwd(), '../../Manifesto.md')
  const content = await readFile(manifestoPath, 'utf-8')
  return content
}

export default async function ManifestPage() {
  const markdown = await getManifestoContent()

  return (
    <Box minH="100vh" bg="radial-gradient(circle at top, #ffffff, #f4f7fb 70%)" py={12} px={4}>
      <Container maxW="3xl" py={8}>
        <Box
          bg="white"
          borderWidth="1px"
          borderColor="gray.200"
          borderRadius="2xl"
          shadow="xl"
          p={{ base: 6, md: 12 }}
          css={{
            '& h1': {
              fontSize: '2.5rem',
              fontWeight: '800',
              color: 'gray.900',
              marginBottom: '2.5rem',
              textAlign: 'center',
              lineHeight: '1.2',
              letterSpacing: '-0.02em',
            },
            '& h2': {
              fontSize: '1.875rem',
              fontWeight: '700',
              color: 'gray.800',
              marginBottom: '1rem',
              marginTop: '2.5rem',
              lineHeight: '1.3',
              letterSpacing: '-0.01em',
            },
            '& p': {
              fontSize: '1.125rem',
              color: 'gray.700',
              marginBottom: '1rem',
              lineHeight: '1.8',
            },
            '& strong': {
              fontWeight: '700',
              color: 'gray.900',
            },
            '& em': {
              fontStyle: 'italic',
              color: 'gray.600',
            },
            '& ul': {
              marginLeft: '1.5rem',
              marginBottom: '1.5rem',
              marginTop: '1rem',
              color: 'gray.700',
            },
            '& li': {
              marginBottom: '0.75rem',
              lineHeight: '1.8',
              fontSize: '1.125rem',
            },
            '& li::marker': {
              color: 'gray.500',
            },
            '& code': {
              backgroundColor: 'gray.50',
              color: 'gray.800',
              padding: '0.125rem 0.375rem',
              borderRadius: '0.25rem',
              fontSize: '0.875rem',
              fontFamily: 'monospace',
              border: '1px solid',
              borderColor: 'gray.200',
            },
            '& a': {
              color: 'blue.600',
              textDecoration: 'underline',
            },
            '& a:hover': {
              color: 'blue.700',
            },
            '@media (max-width: 48em)': {
              '& h1': {
                fontSize: '2rem',
              },
              '& h2': {
                fontSize: '1.5rem',
              },
              '& p, & li': {
                fontSize: '1rem',
              },
            },
          }}
        >
          <ReactMarkdown>{markdown}</ReactMarkdown>
        </Box>
      </Container>
    </Box>
  )
}

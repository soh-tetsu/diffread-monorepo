'use client'

import { Badge, Box, Flex } from '@chakra-ui/react'
import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
  progressText?: string
}

export function Toolbar({ children, progressText }: Props) {
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
        <Flex align="center" gap={2}>
          {children}
        </Flex>
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

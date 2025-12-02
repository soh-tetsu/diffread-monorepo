'use client'

import { ChakraProvider } from '@chakra-ui/react'
import { Toaster } from '@/components/ui/toaster'
import system from '@/theme'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ChakraProvider value={system}>
      {children}
      <Toaster />
    </ChakraProvider>
  )
}

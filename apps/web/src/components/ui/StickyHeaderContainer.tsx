'use client'

import { Box } from '@chakra-ui/react'
import { useEffect, useState } from 'react'
import { AppToolbar } from '@/components/ui/AppToolbar'
import { NotificationBanner } from '@/components/ui/NotificationBanner'

export function StickyHeaderContainer() {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  if (!isMounted) {
    return null
  }

  return (
    <Box position="sticky" top="0" zIndex="sticky" display="flex" flexDirection="column">
      <AppToolbar />
      <NotificationBanner />
    </Box>
  )
}

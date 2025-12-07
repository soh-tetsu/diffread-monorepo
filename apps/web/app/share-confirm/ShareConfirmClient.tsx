'use client'

import { Box, Button, Spinner, Stack, Text } from '@chakra-ui/react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

type ShareConfirmClientProps = {
  url?: string
}

export function ShareConfirmClient({ url }: ShareConfirmClientProps) {
  const t = useTranslations('shareConfirm')
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  // const [isClosing, setIsClosing] = useState(false)

  const handleSave = async () => {
    setIsSaving(true)

    try {
      // Trigger session creation - wait for it to start before closing
      const response = await fetch('/api/curiosity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        credentials: 'same-origin',
      })

      if (!response.ok) {
        // console.error('Failed to save article:', response.status)
        router.push('/?error=save-failed')
        return
      }

      // Close after ensuring request was sent
    } finally {
      setIsSaving(false)
      window.close()
    }
  }

  const handleClose = () => {
    // setIsClosing(true)
    window.close()
  }

  return (
    <>
      {!isSaving ? (
        <Stack gap={3}>
          <Button colorPalette="teal" size="lg" onClick={handleSave} disabled={isSaving}>
            {t('save')}
          </Button>
          <Button
            variant="ghost"
            colorPalette="gray"
            size="lg"
            onClick={handleClose}
            disabled={isSaving}
          >
            {t('cancel')}
          </Button>
        </Stack>
      ) : (
        <Box py={4}>
          <Spinner size="md" color="teal.500" />
          <Text fontSize="sm" color="gray.600" mt={2}>
            {isSaving ? t('saving') : t('closing')}
          </Text>
        </Box>
      )}
    </>
  )
}

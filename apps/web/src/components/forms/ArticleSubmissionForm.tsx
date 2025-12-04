'use client'

import { Button, chakra, Field, Input, Stack, Text, VStack } from '@chakra-ui/react'
import { useState } from 'react'

type Props = {
  onSubmit: (url: string) => void | Promise<void>
  onCancel: () => void
  isLoading?: boolean
  error?: string | null
  submitButtonText?: string
  cancelButtonText?: string
}

export function ArticleSubmissionForm({
  onSubmit,
  onCancel,
  isLoading = false,
  error = null,
  submitButtonText = 'Validate Intuition',
  cancelButtonText = 'Cancel',
}: Props) {
  const [url, setUrl] = useState('')

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!url) return
    await onSubmit(url)
    setUrl('') // Clear form after submission
  }

  return (
    <chakra.form onSubmit={handleSubmit}>
      <VStack gap={3} align="stretch">
        <Field.Root>
          <Field.Label>URL to read</Field.Label>
          <Input
            type="url"
            required
            placeholder="https://example.com/article"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            borderRadius="xl"
            borderColor="gray.200"
            bg="gray.50"
          />
        </Field.Root>
        <Stack direction={{ base: 'column', sm: 'row' }} gap={3}>
          <Button
            type="submit"
            colorPalette="teal"
            loading={isLoading}
            w={{ base: '100%', sm: 'auto' }}
          >
            {isLoading ? 'Queuing…' : submitButtonText}
          </Button>
          <Button
            type="button"
            variant="outline"
            colorPalette="teal"
            onClick={() => {
              setUrl('')
              onCancel()
            }}
            w={{ base: '100%', sm: 'auto' }}
          >
            {cancelButtonText}
          </Button>
        </Stack>
        {error && (
          <Text color="red.600" fontSize="sm">
            {error}
          </Text>
        )}
      </VStack>
    </chakra.form>
  )
}

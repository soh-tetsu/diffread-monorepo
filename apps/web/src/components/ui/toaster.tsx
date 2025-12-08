'use client'

import {
  Button,
  ButtonGroup,
  Toaster as ChakraToaster,
  CloseButton,
  createToaster,
  HStack,
  Portal,
  Spinner,
  Stack,
  Toast,
} from '@chakra-ui/react'

export const toaster = createToaster({
  placement: 'bottom',
  pauseOnPageIdle: true,
  overlap: true,
  max: 3,
})

export const Toaster = () => {
  return (
    <Portal>
      <ChakraToaster toaster={toaster} insetInline={{ mdDown: '4' }}>
        {(toast) => {
          const hasTwoButtons = toast.action && toast.closable
          return (
            <Toast.Root width={{ md: 'sm' }}>
              <HStack gap="8" width="full">
                {toast.type === 'loading' ? (
                  <Spinner size="sm" color="blue.solid" />
                ) : (
                  <Toast.Indicator />
                )}
                <Stack gap="1" flex="1" maxWidth="100%">
                  {toast.title && <Toast.Title>{toast.title}</Toast.Title>}
                  {toast.description && <Toast.Description>{toast.description}</Toast.Description>}
                </Stack>
                {hasTwoButtons && toast.action ? (
                  <ButtonGroup
                    size="sm"
                    variant="ghost"
                    orientation="horizontal"
                    alignItems="stretch"
                    flexShrink={0}
                  >
                    <Button onClick={toast.action.onClick}>{toast.action.label}</Button>
                    <CloseButton onClick={() => toaster.dismiss(toast.id)} />
                  </ButtonGroup>
                ) : (
                  <>
                    {toast.action && (
                      <Toast.ActionTrigger>{toast.action.label}</Toast.ActionTrigger>
                    )}
                    {toast.closable && (
                      <CloseButton
                        variant="ghost"
                        size="sm"
                        onClick={() => toaster.dismiss(toast.id)}
                      />
                    )}
                  </>
                )}
              </HStack>
            </Toast.Root>
          )
        }}
      </ChakraToaster>
    </Portal>
  )
}

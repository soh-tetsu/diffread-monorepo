'use client'

import { Box, Button, HStack, Text } from '@chakra-ui/react'
import React from 'react'
import { LuCheckCheck, LuCircleAlert, LuInfo, LuLoader, LuX } from 'react-icons/lu'

type NotificationType = 'success' | 'error' | 'info' | 'loading'

type NotificationAction = {
  label: string
  onClick: () => void
}

type Notification = {
  id: string
  type: NotificationType
  title: string
  description?: string
  duration?: number
  action?: NotificationAction
}

type NotificationContextValue = {
  show: (notification: Omit<Notification, 'id'> & { id?: string }) => string
  dismiss: (id: string) => void
  notifications: Notification[]
}

const NotificationContext = React.createContext<NotificationContextValue | null>(null)

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = React.useState<Notification[]>([])

  const show = React.useCallback((notification: Omit<Notification, 'id'> & { id?: string }) => {
    const id = notification.id ?? Math.random().toString(36).slice(2, 10)
    const { duration, ...rest } = notification

    const newNotification = { ...rest, id }
    setNotifications((prev) => {
      const _filtered = notification.id ? prev.filter((n) => n.id !== notification.id) : prev
      return [newNotification]
    })

    if (duration && duration !== Infinity) {
      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== id))
      }, duration)
    }

    return id
  }, [])

  const dismiss = React.useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [])

  const value = React.useMemo<NotificationContextValue>(
    () => ({ show, dismiss, notifications }),
    [show, dismiss, notifications]
  )

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}

export function NotificationBanner() {
  const context = React.useContext(NotificationContext)
  if (!context) return null
  const { notifications, dismiss } = context

  if (notifications.length === 0) return null

  const notification = notifications[0]

  return (
    <Box
      backdropBlur="md"
      css={{
        backgroundColor:
          notification.type === 'success'
            ? 'rgba(240, 253, 250, 1)'
            : notification.type === 'error'
              ? 'rgba(254, 242, 242, 1)'
              : notification.type === 'loading'
                ? 'rgba(239, 246, 255, 1)'
                : 'rgba(254, 252, 232, 1)',
      }}
    >
      <HStack maxW="960px" mx="auto" px={4} py={3} justify="space-between" align="center">
        <HStack flex={1} align="center" gap={3}>
          {notification.type === 'success' && (
            <LuCheckCheck style={{ color: 'teal.600' }} size={16} />
          )}
          {notification.type === 'error' && (
            <LuCircleAlert style={{ color: 'red.600' }} size={16} />
          )}
          {notification.type === 'info' && <LuInfo style={{ color: 'yellow.600' }} size={16} />}
          {notification.type === 'loading' && <LuLoader style={{ color: 'blue.600' }} size={16} />}
          <Text fontSize="sm" fontWeight="medium" color="gray.900">
            {notification.title}
          </Text>
          {notification.description && (
            <Text fontSize="sm" color="gray.600">
              {notification.description}
            </Text>
          )}
        </HStack>
        {notification.action && (
          <Button
            size="xs"
            colorPalette="teal"
            variant="solid"
            onClick={notification.action.onClick}
            mr={2}
          >
            {notification.action.label}
          </Button>
        )}
        <Button
          size="xs"
          variant="ghost"
          onClick={() => dismiss(notification.id)}
          px={2}
          py={0.5}
          h="auto"
        >
          <LuX />
        </Button>
      </HStack>
    </Box>
  )
}

export function useNotification() {
  const context = React.useContext(NotificationContext)
  if (!context) throw new Error('useNotification must be used within NotificationProvider')
  return { show: context.show, dismiss: context.dismiss }
}

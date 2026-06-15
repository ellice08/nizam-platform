import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notificationApi } from '@/api/notification.api'

export const useNotifications = () =>
  useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationApi.list(30),
    refetchInterval: 25000,
    refetchOnWindowFocus: true,
  })

export const useMarkNotificationRead = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => notificationApi.markRead(id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['notifications'] }) },
  })
}

export const useMarkAllNotificationsRead = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => notificationApi.markAllRead(),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['notifications'] }) },
  })
}

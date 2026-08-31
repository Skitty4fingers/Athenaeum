import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { MetadataProvider } from '@/hooks/use-enrichment'

/**
 * Registering/removing custom metadata providers — the config behind the
 * "Source" picker in EnrichDialog. There is no update endpoint (see
 * server/controllers/CustomMetadataProviderController.js — only create and
 * delete exist), so "editing" a provider is genuinely delete-then-recreate,
 * not a PATCH. The UI doesn't pretend otherwise.
 */

export interface AddProviderInput {
  name: string
  url: string
  mediaType: 'book' | 'podcast'
  authHeaderValue?: string
}

export function useAddMetadataProvider() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: AddProviderInput) => api.post<{ provider: MetadataProvider }>('/custom-metadata-providers', input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['metadata-providers'] })
  })
}

export function useRemoveMetadataProvider() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (providerId: string) => api.delete(`/custom-metadata-providers/${providerId}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['metadata-providers'] })
  })
}

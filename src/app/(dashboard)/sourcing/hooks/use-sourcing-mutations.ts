'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { sourcingKeys } from '../api/queries'
import {
  addSupplierNormalizedAction,
  updateShortlistAction,
  deleteSupplierAction,
  deleteSuppliersBatchAction,
  bulkImportSuppliersAction,
  updateSupplierProfileAction,
  confirmSupplierAndCreatePoAction,
  sendShortlistToQcAction,
} from '../actions'

// ─── Invalidation helper ──────────────────────────────────────────────────────

function useInvalidateSourcing() {
  const qc = useQueryClient()
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: sourcingKeys.suppliers() }),
      qc.invalidateQueries({ queryKey: sourcingKeys.orders() }),
    ])
}

// ─── Assign / Add Supplier ────────────────────────────────────────────────────

interface AssignSupplierPayload {
  supplierName: string
  email?: string
  phone?: string
  address?: string
  orderId?: string
  website?: string
  contactPerson?: string
  taxId?: string
  businessType?: string
  itemBids?: Record<string, { price: string; leadTime: string }>
  capabilities?: any[]
  subtabIsSuppliers?: boolean
}

export function useAssignSupplier(options?: { onSuccess?: () => void; onError?: (msg: string) => void }) {
  const invalidate = useInvalidateSourcing()

  return useMutation({
    mutationFn: (payload: AssignSupplierPayload) =>
      addSupplierNormalizedAction(payload as any, null, payload.subtabIsSuppliers),
    onSuccess: async (result) => {
      if (!result.success) {
        options?.onError?.(result.error || 'Failed to add supplier.')
        return
      }
      await invalidate()
      options?.onSuccess?.()
    },
    onError: (err: Error) => {
      options?.onError?.(err.message || 'An unexpected error occurred.')
    },
  })
}

// ─── Shortlist Toggle ─────────────────────────────────────────────────────────

export function useToggleShortlist() {
  const invalidate = useInvalidateSourcing()

  return useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) =>
      updateShortlistAction(id, value),
    onSuccess: async () => {
      await invalidate()
    },
  })
}

// ─── Delete Supplier ──────────────────────────────────────────────────────────

export function useDeleteSupplier() {
  const invalidate = useInvalidateSourcing()

  return useMutation({
    mutationFn: ({ id, deleteProfile }: { id: string; deleteProfile?: boolean }) =>
      deleteSupplierAction(id, deleteProfile),
    onSuccess: async () => {
      await invalidate()
    },
  })
}

// ─── Bulk Delete ──────────────────────────────────────────────────────────────

export function useDeleteSuppliersBatch() {
  const invalidate = useInvalidateSourcing()

  return useMutation({
    mutationFn: (ids: string[]) => deleteSuppliersBatchAction(ids),
    onSuccess: async () => {
      await invalidate()
    },
  })
}

// ─── Bulk Import ──────────────────────────────────────────────────────────────

export function useBulkImport() {
  const invalidate = useInvalidateSourcing()

  return useMutation({
    mutationFn: ({
      payload,
      resolution,
      isSupplierTab,
    }: {
      payload: any
      resolution: 'skip' | 'overwrite'
      isSupplierTab: boolean
    }) => bulkImportSuppliersAction(payload, resolution, isSupplierTab),
    onSuccess: async () => {
      await invalidate()
    },
  })
}

// ─── Update Supplier Profile ──────────────────────────────────────────────────

export function useUpdateSupplierProfile() {
  const invalidate = useInvalidateSourcing()

  return useMutation({
    mutationFn: (args: Parameters<typeof updateSupplierProfileAction>) =>
      updateSupplierProfileAction(...args),
    onSuccess: async () => {
      await invalidate()
    },
  })
}

// ─── Confirm Supplier & Create PO ─────────────────────────────────────────────

export function useConfirmSupplierAndCreatePo() {
  const invalidate = useInvalidateSourcing()

  return useMutation({
    mutationFn: (args: Parameters<typeof confirmSupplierAndCreatePoAction>) =>
      confirmSupplierAndCreatePoAction(...args),
    onSuccess: async () => {
      await invalidate()
    },
  })
}

// ─── Send Shortlist to QC ─────────────────────────────────────────────────────

export function useSendShortlistToQc() {
  const invalidate = useInvalidateSourcing()

  return useMutation({
    mutationFn: (args: Parameters<typeof sendShortlistToQcAction>) =>
      sendShortlistToQcAction(...args),
    onSuccess: async () => {
      await invalidate()
    },
  })
}

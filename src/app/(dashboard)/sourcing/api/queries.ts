import { queryOptions } from '@tanstack/react-query'
import {
  fetchSuppliersAction,
  fetchOrdersAction,
  fetchAuditsAction,
} from '../actions'

// ─── Query Keys ───────────────────────────────────────────────────────────────
// Centralised so that invalidateQueries calls are consistent across hooks.

export const sourcingKeys = {
  all: ['sourcing'] as const,
  suppliers: () => [...sourcingKeys.all, 'suppliers'] as const,
  orders: () => [...sourcingKeys.all, 'orders'] as const,
  audits: () => [...sourcingKeys.all, 'audits'] as const,
}

// ─── Query Options ────────────────────────────────────────────────────────────

export const suppliersQueryOptions = () =>
  queryOptions({
    queryKey: sourcingKeys.suppliers(),
    queryFn: fetchSuppliersAction,
    staleTime: 30_000, // 30 s — balances freshness vs network round-trips
  })

export const ordersQueryOptions = () =>
  queryOptions({
    queryKey: sourcingKeys.orders(),
    queryFn: fetchOrdersAction,
    staleTime: 30_000,
  })

export const auditsQueryOptions = () =>
  queryOptions({
    queryKey: sourcingKeys.audits(),
    queryFn: fetchAuditsAction,
    staleTime: 60_000,
  })

import { api } from './client'
import type { BalancesResponse, Expense, Member, Settlement } from '../types'

export const groupsApi = {
  join: (chat_id: string, title?: string) =>
    api.post<{ group: { id: number; chat_id: string; title: string | null }; member: Member }>(
      '/api/groups/join',
      { chat_id, title }
    ),
  members: (chat_id: string) => api.get<Member[]>(`/api/groups/${chat_id}/members`),
}

export const expensesApi = {
  list: (chat_id: string, page = 1) =>
    api.get<{ total: number; page: number; items: Expense[] }>(
      `/api/groups/${chat_id}/expenses?page=${page}&limit=30`
    ),
  get: (chat_id: string, id: number) =>
    api.get<Expense>(`/api/groups/${chat_id}/expenses/${id}`),
  create: (chat_id: string, body: unknown) =>
    api.post<Expense>(`/api/groups/${chat_id}/expenses`, body),
  update: (chat_id: string, id: number, body: unknown) =>
    api.put<Expense>(`/api/groups/${chat_id}/expenses/${id}`, body),
  delete: (chat_id: string, id: number) =>
    api.delete<void>(`/api/groups/${chat_id}/expenses/${id}`),
}

export const balancesApi = {
  get: (chat_id: string) => api.get<BalancesResponse>(`/api/groups/${chat_id}/balances`),
}

export const settlementsApi = {
  list: (chat_id: string) => api.get<Settlement[]>(`/api/groups/${chat_id}/settlements`),
  create: (chat_id: string, body: unknown) =>
    api.post<Settlement>(`/api/groups/${chat_id}/settlements`, body),
  delete: (chat_id: string, id: number) =>
    api.delete<void>(`/api/groups/${chat_id}/settlements/${id}`),
}

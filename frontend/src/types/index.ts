export interface Group {
  id: number
  chat_id: string
  title: string | null
  created_at: string
}

export interface Member {
  id: number
  telegram_user_id: string
  first_name: string
  last_name: string | null
  username: string | null
  group_id?: number
  created_at?: string
}

export interface Split {
  member_id: number
  first_name: string
  last_name: string | null
  username: string | null
  amount: number
}

export interface Expense {
  id: number
  description: string
  total_amount: number
  currency: string
  split_type: 'equal' | 'custom'
  paid_by: Member
  splits: Split[]
  created_at: string
  updated_at: string
}

export interface Settlement {
  id: number
  from_member: Member
  to_member: Member
  amount: number
  currency: string
  note: string | null
  settled_at: string
}

export interface SimplifiedTransaction {
  from_member_id: number
  from_first_name: string
  from_last_name: string | null
  to_member_id: number
  to_first_name: string
  to_last_name: string | null
  amount: number
  currency: string
}

export interface NetBalance {
  member_id: number
  first_name: string
  last_name: string | null
  net_amount: number
}

export interface CurrencyBalance {
  net: NetBalance[]
  simplified_transactions: SimplifiedTransaction[]
}

export interface BalancesResponse {
  by_currency: Record<string, CurrencyBalance>
}

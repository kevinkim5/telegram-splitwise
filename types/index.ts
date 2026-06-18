export interface Group {
  id: number
  chat_id: string
  title: string
  currency: string
  created_at: string
}

export interface Member {
  id: number
  group_id: number
  telegram_user_id: string
  first_name: string
  last_name: string | null
  username: string | null
  photo_url?: string | null
  created_at: string
}

export interface ExpenseSplit {
  id: number
  expense_id: number
  member_id: number
  amount: number
  member_name?: string
}

export interface Expense {
  id: number
  group_id: number
  description: string
  total_amount: number
  currency: string
  paid_by_member_id: number
  split_type: 'equal' | 'custom'
  created_by_member_id: number
  date: string
  category?: string
  created_at: string
  paid_by_name?: string
  my_split_amount?: number
  splits?: ExpenseSplit[]
}

export interface Settlement {
  id: number
  group_id: number
  from_member_id: number
  to_member_id: number
  amount: number
  currency: string
  created_at: string
  from_name?: string
  to_name?: string
}

export interface Balance {
  member_id: number
  member_name: string
  net_amount: number
  currency: string
}

export interface SimplifiedDebt {
  from_member_id: number
  from_name: string
  to_member_id: number
  to_name: string
  amount: number
  currency: string
}

export interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
}

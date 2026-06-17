'use client'
import { useAppContext } from '@/components/AppProvider'
import { ExpenseFormPage } from '@/components/ExpenseFormPage'
export default function AddPage() {
  const ctx = useAppContext()
  return <ExpenseFormPage ctx={ctx} />
}

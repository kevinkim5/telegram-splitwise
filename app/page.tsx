'use client'
import { useAppContext } from '@/components/AppProvider'
import { ExpensesPage } from '@/components/ExpensesPage'
export default function Home() {
  const ctx = useAppContext()
  return <ExpensesPage ctx={ctx} />
}

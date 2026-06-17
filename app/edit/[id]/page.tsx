'use client'
import { useParams } from 'next/navigation'
import { useAppContext } from '@/components/AppProvider'
import { ExpenseFormPage } from '@/components/ExpenseFormPage'
export default function EditPage() {
  const ctx = useAppContext()
  const { id } = useParams<{ id: string }>()
  return <ExpenseFormPage ctx={ctx} editId={id} />
}

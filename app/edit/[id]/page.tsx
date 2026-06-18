'use client'
import { useParams } from 'next/navigation'
import { ExpenseFormPage } from '@/components/ExpenseFormPage'
export default function EditPage() {
  const { id } = useParams<{ id: string }>()
  return <ExpenseFormPage editId={id} />
}

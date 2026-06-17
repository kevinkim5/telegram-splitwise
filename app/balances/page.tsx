'use client'
import { useAppContext } from '@/components/AppProvider'
import { BalancesPage } from '@/components/BalancesPage'
export default function BalancesRoute() {
  const ctx = useAppContext()
  return <BalancesPage ctx={ctx} />
}

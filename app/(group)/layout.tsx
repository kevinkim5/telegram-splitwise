import { GroupShell } from '@/components/GroupShell'

// Expenses, Balances and Totals share one screen: the header, tabs and "+" stay mounted and the
// three tab views live inside GroupShell. The pages below only exist so each tab has its own URL.
export default function GroupLayout({ children }: { children: React.ReactNode }) {
  void children
  return <GroupShell />
}

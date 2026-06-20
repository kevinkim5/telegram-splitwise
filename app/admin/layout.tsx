export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: '100dvh', overflowY: 'auto', background: '#f3f4f6', fontFamily: 'system-ui, sans-serif' }}>
      {children}
    </div>
  )
}

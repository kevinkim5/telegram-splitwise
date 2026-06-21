'use client'

export function ArchiveButton({ groupTitle }: { groupTitle: string }) {
  return (
    <button
      type="submit"
      title="Archive group"
      onClick={e => {
        if (!window.confirm(`Archive "${groupTitle}"?\n\nThe group will be hidden from the app until restored.`)) {
          e.preventDefault()
        }
      }}
      style={{
        fontSize: '0.6875rem',
        color: '#9ca3af',
        background: '#fff',
        border: 'none',
        cursor: 'pointer',
        borderRadius: '14px',
        padding: '0 0.75rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
        whiteSpace: 'nowrap',
      }}
    >
      Archive
    </button>
  )
}

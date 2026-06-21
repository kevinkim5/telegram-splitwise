import { signIn } from '@/auth'

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif', background: '#f9fafb',
    }}>
      <div style={{
        background: '#fff', borderRadius: '12px', padding: '2.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)', width: '100%', maxWidth: '360px', textAlign: 'center',
      }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>Split Admin</h1>
        <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '2rem' }}>
          Sign in with your GitHub account to continue.
        </p>

        <form action={async () => {
          'use server'
          await signIn('github', { redirectTo: '/admin' })
        }}>
          <button
            type="submit"
            style={{
              width: '100%', padding: '0.75rem 1rem', borderRadius: '8px', border: 'none',
              background: '#24292e', color: '#fff', fontSize: '0.9375rem', fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.625rem',
            }}
          >
            <GitHubIcon />
            Sign in with GitHub
          </button>
        </form>
      </div>
    </div>
  )
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}

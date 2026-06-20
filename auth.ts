import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'

const ALLOWED_GITHUB_ID = parseInt(process.env.ADMIN_GITHUB_ID ?? '0')

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  callbacks: {
    signIn({ profile }) {
      // Only allow the specific GitHub account whose numeric ID is in ADMIN_GITHUB_ID.
      // Numeric ID is used instead of username because it never changes even if you rename.
      return typeof profile?.id === 'number' && profile.id === ALLOWED_GITHUB_ID
    },
  },
  pages: {
    signIn: '/admin/login',
    error: '/admin/login',
  },
})

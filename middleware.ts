import { auth } from '@/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const { pathname } = req.nextUrl

  // Allow the login page and NextAuth internals through unauthenticated
  if (pathname === '/admin/login' || pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/admin') && !req.auth) {
    return NextResponse.redirect(new URL('/admin/login', req.url))
  }
})

export const config = {
  matcher: ['/admin/:path*', '/api/auth/:path*'],
}

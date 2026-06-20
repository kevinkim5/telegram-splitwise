import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Telegram Mini Apps are embedded in an iframe — allow framing from Telegram origins
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
          {
            key: 'Content-Security-Policy',
            value: [
              "frame-ancestors 'self'",
              'https://web.telegram.org',
              'https://k.web.telegram.org',
              'https://z.web.telegram.org',
              'https://webk.telegram.org',
              'https://webz.telegram.org',
            ].join(' '),
          },
        ],
      },
    ]
  },
}

export default nextConfig

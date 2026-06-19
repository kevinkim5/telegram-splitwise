import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import { AppProvider } from '@/components/AppProvider'

export const metadata: Metadata = { title: 'Split' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      </head>
      <body>
        {/* Runs after beforeInteractive SDK; sets data-scheme before first paint to avoid flash */}
        <script dangerouslySetInnerHTML={{ __html:
          `try{var s=window.Telegram?.WebApp?.colorScheme;if(s)document.body.dataset.scheme=s;}catch(e){}`
        }} />
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  )
}

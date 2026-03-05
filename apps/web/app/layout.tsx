// IMPORTANT: CSS Import Order
// ReactFlow CSS MUST be imported BEFORE Tailwind/globals.css
// If Tailwind loads first, ReactFlow positioning and edge styles break
// See: Critical Finding 06 in web-slick-plan.md
import '@xyflow/react/dist/style.css';
import './globals.css';

import { Providers } from '@/components/providers';
import { ThemeProvider } from 'next-themes';

import type { Metadata, Viewport } from 'next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1e1e1e',
};

export const metadata: Metadata = {
  title: 'Chainglass',
  description: 'Spec-driven development enrichment workflow tool',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Chainglass',
  },
  icons: {
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: Required for next-themes FOUC prevention
    // See: Critical Finding 07 in web-slick-plan.md
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Providers>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}

// IMPORTANT: CSS Import Order
// ReactFlow CSS MUST be imported BEFORE Tailwind/globals.css
// If Tailwind loads first, ReactFlow positioning and edge styles break
// See: Critical Finding 06 in web-slick-plan.md
import '@xyflow/react/dist/style.css';
import './globals.css';

import { Providers } from '@/components/providers';
import { ThemeProvider } from 'next-themes';

export const metadata = {
  title: 'Chainglass',
  description: 'Spec-driven development enrichment workflow tool',
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

// IMPORTANT: CSS Import Order
// ReactFlow CSS MUST be imported BEFORE Tailwind/globals.css
// If Tailwind loads first, ReactFlow positioning and edge styles break
// See: Critical Finding 06 in web-slick-plan.md
import '@xyflow/react/dist/style.css';
import './globals.css';

export const metadata = {
  title: 'Chainglass',
  description: 'Spec-driven development enrichment workflow tool',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

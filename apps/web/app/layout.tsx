// Placeholder layout - will be replaced in Phase 5
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

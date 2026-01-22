import { ThemeToggle } from '@/components/theme-toggle';

// Placeholder page - will be replaced in Phase 5
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-2xl font-bold">Chainglass</h1>
      <p className="text-muted-foreground">Theme toggle demo:</p>
      <ThemeToggle />
    </main>
  );
}

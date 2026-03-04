import { AuthProvider } from '@/features/063-login/components/auth-provider';

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

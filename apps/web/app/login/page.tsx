import { LoginScreen } from '@/features/063-login/components/login-screen';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; user?: string }>;
}) {
  const params = await searchParams;
  const error = params.error;
  const deniedUser = params.user;

  return <LoginScreen error={error} deniedUser={deniedUser} />;
}

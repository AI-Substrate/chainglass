import { SignInButton } from '@/features/063-login/components/sign-in-button';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; user?: string }>;
}) {
  const params = await searchParams;
  const error = params.error;
  const deniedUser = params.user;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 p-4">
      <h1 className="mb-8 font-mono text-4xl font-bold text-green-400">CHAINGLASS</h1>

      {error === 'AccessDenied' && (
        <div
          role="alert"
          className="mb-6 rounded-md bg-red-950 px-4 py-3 font-mono text-sm text-red-400"
        >
          {deniedUser
            ? `Access denied: user '${deniedUser}' is not authorized`
            : 'Access denied: your GitHub account is not authorized'}
        </div>
      )}

      {error && error !== 'AccessDenied' && (
        <div
          role="alert"
          className="mb-6 rounded-md bg-red-950 px-4 py-3 font-mono text-sm text-red-400"
        >
          Authentication failed. Please try again.
        </div>
      )}

      <p className="mb-6 font-mono text-sm text-neutral-400">System access required</p>

      <SignInButton />
    </div>
  );
}

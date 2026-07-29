'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

export interface PijRailToggleBridgeProps {
  workspaceSlug: string;
  pathname: string;
  search: string;
  navigate: (href: string) => void;
}

export function pijRailTarget(workspaceSlug: string, pathname: string, search: string): string {
  const browserPath = `/workspaces/${workspaceSlug}/browser`;
  if (pathname !== browserPath) return `${browserPath}?panel=pij`;

  const params = new URLSearchParams(search);
  params.set('panel', 'pij');
  return `${browserPath}?${params.toString()}`;
}

export function PijRailToggleBridge({
  workspaceSlug,
  pathname,
  search,
  navigate,
}: PijRailToggleBridgeProps) {
  useEffect(() => {
    const handler = () => {
      const target = pijRailTarget(workspaceSlug, pathname, search);
      const current = search ? `${pathname}?${search}` : pathname;
      if (target !== current) navigate(target);
    };
    window.addEventListener('pij:toggle', handler);
    return () => window.removeEventListener('pij:toggle', handler);
  }, [navigate, pathname, search, workspaceSlug]);

  return null;
}

export function PijRailToggleListener({ workspaceSlug }: { workspaceSlug: string }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const router = useRouter();

  return (
    <PijRailToggleBridge
      workspaceSlug={workspaceSlug}
      pathname={pathname}
      search={search}
      navigate={(href) => router.push(href)}
    />
  );
}

import {
  NavigationProgress,
  SHOW_DELAY_MS,
  useProgressRouter,
} from '@/components/navigation/navigation-progress';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ pathname: '/', search: '', push: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ push: nav.push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

/** The router has rendered `url`: the browser URL and the navigation hooks both read it. */
function arrive(url: string, rerender: () => void) {
  const target = new URL(url, window.location.href);
  window.history.replaceState(null, '', url);
  nav.pathname = target.pathname;
  nav.search = target.search.slice(1);
  act(rerender);
}

function SwitchButton({ href }: { href: string }) {
  const router = useProgressRouter();
  return (
    <button type="button" onClick={() => router.push(href)}>
      switch
    </button>
  );
}

function App() {
  return (
    // Like Next's <Link>, keep the browser from following the anchor itself.
    // biome-ignore lint/a11y/useKeyWithClickEvents: test harness, not UI.
    <div onClick={(event) => event.preventDefault()}>
      <a href="/workspaces/alpha">alpha</a>
      <a href="/workspaces">here</a>
      <a href="/workspaces/beta" target="_blank" rel="noreferrer">
        new tab
      </a>
      <SwitchButton href="/workspaces?worktree=%2Frepo%2Ffeature" />
      {/* The same query as the page's, encoded the other way and in another key order. */}
      <a href="/workspaces?worktree=%2Frepo%2Fmy+tree&panel=pij">plus-encoded</a>
      <a href="/workspaces?panel=pij&worktree=%2Frepo%2Fmy%20tree">percent-encoded</a>
      <NavigationProgress />
    </div>
  );
}

// The bar watches the click; App's wrapper stops jsdom from following it.
const click = (name: string) => fireEvent.click(screen.getByText(name), { button: 0 });
const bar = () => screen.queryByRole('status');
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe('NavigationProgress', () => {
  let rerender: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState(null, '', '/workspaces');
    nav.pathname = '/workspaces';
    nav.search = '';
    const view = render(<App />);
    rerender = () => view.rerender(<App />);
  });

  afterEach(() => vi.useRealTimers());

  it('shows after the delay on a link click and hides once the new route renders', () => {
    click('alpha');
    wait(SHOW_DELAY_MS - 1);
    expect(bar()).toBeNull();
    wait(1);
    expect(bar()).not.toBeNull();

    arrive('/workspaces/alpha', rerender);
    expect(bar()).toBeNull();
  });

  it('covers a router.push that only changes the query (a worktree switch)', () => {
    click('switch');
    expect(nav.push).toHaveBeenCalledWith('/workspaces?worktree=%2Frepo%2Ffeature', undefined);
    wait(SHOW_DELAY_MS);
    expect(bar()).not.toBeNull();

    arrive('/workspaces?worktree=%2Frepo%2Ffeature', rerender);
    expect(bar()).toBeNull();
  });

  it('never shows for a navigation that renders inside the delay', () => {
    click('alpha');
    wait(SHOW_DELAY_MS / 2);
    arrive('/workspaces/alpha', rerender);
    wait(SHOW_DELAY_MS * 4);
    expect(bar()).toBeNull();
  });

  it('never shows for a click on the current URL or one that opens another tab', () => {
    click('here');
    click('new tab');
    fireEvent.click(screen.getByText('alpha'), { button: 0, metaKey: true });
    wait(SHOW_DELAY_MS * 4);
    expect(bar()).toBeNull();
  });

  it('never shows for the same query encoded differently (a worktree path with a space)', () => {
    // On the page as `%20`, linked as `+` (and keys reordered); then the reverse.
    arrive('/workspaces?panel=pij&worktree=%2Frepo%2Fmy%20tree', rerender);
    click('plus-encoded');
    wait(SHOW_DELAY_MS * 4);
    expect(bar()).toBeNull();

    arrive('/workspaces?worktree=%2Frepo%2Fmy+tree&panel=pij', rerender);
    click('percent-encoded');
    wait(SHOW_DELAY_MS * 4);
    expect(bar()).toBeNull();
  });
});

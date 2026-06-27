/**
 * applyResyncOnStatus — Plan 084 T007
 *
 * Verifies the one-shot resync state machine: fires {type:'resync'} once
 * per WS lifecycle, re-armed when status leaves 'connected'.
 */

import { describe, expect, it, vi } from 'vitest';

import { applyResyncOnStatus } from '@/features/064-terminal/lib/resync-on-connect';
import type { ConnectionStatus } from '@/features/064-terminal/types';

function makeRef(initial: boolean) {
  return { current: initial };
}

describe('applyResyncOnStatus', () => {
  it('sends exactly one resync on the first connected transition', () => {
    const send = vi.fn();
    const ref = makeRef(false);

    applyResyncOnStatus('connected' as ConnectionStatus, ref, send);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(JSON.stringify({ type: 'resync' }));
    expect(ref.current).toBe(true);
  });

  it('does NOT send a second resync while status stays connected', () => {
    const send = vi.fn();
    const ref = makeRef(false);

    applyResyncOnStatus('connected' as ConnectionStatus, ref, send);
    applyResyncOnStatus('connected' as ConnectionStatus, ref, send);
    applyResyncOnStatus('connected' as ConnectionStatus, ref, send);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does NOT send a resync on connecting or disconnected', () => {
    const send = vi.fn();
    const ref = makeRef(false);

    applyResyncOnStatus('connecting' as ConnectionStatus, ref, send);
    applyResyncOnStatus('disconnected' as ConnectionStatus, ref, send);

    expect(send).not.toHaveBeenCalled();
    expect(ref.current).toBe(false);
  });

  it('re-arms when status leaves connected (disconnect → reconnect fires again)', () => {
    const send = vi.fn();
    const ref = makeRef(false);

    applyResyncOnStatus('connecting' as ConnectionStatus, ref, send);
    applyResyncOnStatus('connected' as ConnectionStatus, ref, send);
    applyResyncOnStatus('disconnected' as ConnectionStatus, ref, send);
    applyResyncOnStatus('connecting' as ConnectionStatus, ref, send);
    applyResyncOnStatus('connected' as ConnectionStatus, ref, send);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(1, JSON.stringify({ type: 'resync' }));
    expect(send).toHaveBeenNthCalledWith(2, JSON.stringify({ type: 'resync' }));
  });

  it('handles bouncing — connected → connecting → connected sends twice', () => {
    const send = vi.fn();
    const ref = makeRef(false);

    applyResyncOnStatus('connected' as ConnectionStatus, ref, send);
    applyResyncOnStatus('connecting' as ConnectionStatus, ref, send);
    applyResyncOnStatus('connected' as ConnectionStatus, ref, send);

    expect(send).toHaveBeenCalledTimes(2);
  });
});

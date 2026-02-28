/**
 * Plan 053: GlobalStateSystem — Contract Test Runner
 *
 * Runs globalStateContractTests against both real (GlobalStateSystem)
 * and fake (FakeGlobalStateSystem) implementations.
 *
 * Per DYK-14: Real impl imported via relative path from test/contracts/.
 * Per DYK-15: Fake imported from @chainglass/shared fakes barrel.
 */

import { FakeGlobalStateSystem } from '@chainglass/shared/fakes';
import { GlobalStateSystem } from '../../apps/web/src/lib/state/global-state-system';
import { globalStateContractTests } from './state-system.contract';

globalStateContractTests('GlobalStateSystem (Real)', () => new GlobalStateSystem());
globalStateContractTests('FakeGlobalStateSystem (Fake)', () => new FakeGlobalStateSystem());

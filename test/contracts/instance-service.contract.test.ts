/**
 * Run IInstanceService contract tests against FakeInstanceService.
 *
 * Per Constitution P2: Same contract suite runs for Fake (here) and Real (Phase 2+).
 */

import { FakeInstanceService } from '@chainglass/workflow/fakes';
import { instanceServiceContractTests } from './instance-service.contract.js';

instanceServiceContractTests(() => ({
  name: 'FakeInstanceService',
  service: new FakeInstanceService(),
}));

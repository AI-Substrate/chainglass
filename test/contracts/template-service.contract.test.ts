/**
 * Run ITemplateService contract tests against FakeTemplateService.
 *
 * Per Constitution P2: Same contract suite runs for Fake (here) and Real (Phase 2).
 */

import { FakeTemplateService } from '@chainglass/workflow/fakes';
import { templateServiceContractTests } from './template-service.contract.js';

templateServiceContractTests(() => ({
  name: 'FakeTemplateService',
  service: new FakeTemplateService(),
}));

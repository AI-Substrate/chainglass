/**
 * IWorkNodeService contract tests for FakeWorkNodeService.
 *
 * Per Critical Discovery 08: Run contract tests against fake to verify parity.
 */

import { FakeWorkNodeService } from '@chainglass/workgraph/fakes';
import { workNodeServiceContractTests } from './worknode-service.contract.js';

// Run contract tests against the fake implementation
workNodeServiceContractTests('FakeWorkNodeService', () => new FakeWorkNodeService());

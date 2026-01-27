/**
 * IWorkUnitService contract tests for FakeWorkUnitService.
 *
 * Per Critical Discovery 08: Run contract tests against fake to verify parity.
 */

import { FakeWorkUnitService } from '@chainglass/workgraph/fakes';
import { workUnitServiceContractTests } from './workunit-service.contract.js';

// Run contract tests against the fake implementation
workUnitServiceContractTests('FakeWorkUnitService', () => new FakeWorkUnitService());

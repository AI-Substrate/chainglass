/**
 * IWorkGraphService contract tests for FakeWorkGraphService.
 *
 * Per Critical Discovery 08: Run contract tests against fake to verify parity.
 */

import { FakeWorkGraphService } from '@chainglass/workgraph/fakes';
import { workGraphServiceContractTests } from './workgraph-service.contract.js';

// Run contract tests against the fake implementation
workGraphServiceContractTests('FakeWorkGraphService', () => new FakeWorkGraphService());

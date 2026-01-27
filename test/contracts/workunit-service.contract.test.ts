/**
 * IWorkUnitService contract tests.
 *
 * Per Critical Discovery 08: Run contract tests against both fake and real
 * implementations to verify parity.
 */

import { FakeFileSystem, FakePathResolver, FakeYamlParser } from '@chainglass/shared';
import { FakeWorkUnitService, WorkUnitService } from '@chainglass/workgraph';
import { workUnitServiceContractTests } from './workunit-service.contract.js';

// Run contract tests against the fake implementation
workUnitServiceContractTests('FakeWorkUnitService', () => new FakeWorkUnitService());

// Run contract tests against the real implementation with test doubles
workUnitServiceContractTests('WorkUnitService', () => {
  const fs = new FakeFileSystem();
  const pathResolver = new FakePathResolver();
  const yamlParser = new FakeYamlParser();

  // Set up base units directory
  fs.setDir('.chainglass/units');

  return new WorkUnitService(fs, pathResolver, yamlParser);
});

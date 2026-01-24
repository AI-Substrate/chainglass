/**
 * Tests for checkpoint operations on IWorkflowRegistry.
 *
 * Per Phase 2: TDD - Write failing tests first.
 * Tests cover: ordinal generation, hash generation, checkpoint creation,
 * duplicate detection, workflow.json auto-generation, .checkpoint.json metadata.
 */

import {
  FakeFileSystem,
  FakeHashGenerator,
  FakePathResolver,
  HashGeneratorAdapter,
} from '@chainglass/shared';
import { FakeYamlParser, WorkflowRegistryService } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

describe('WorkflowRegistryService checkpoint operations', () => {
  let service: WorkflowRegistryService;
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let yamlParser: FakeYamlParser;
  let hashGenerator: FakeHashGenerator;

  const WORKFLOWS_DIR = '.chainglass/workflows';

  beforeEach(() => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    yamlParser = new FakeYamlParser();
    hashGenerator = new FakeHashGenerator();

    // T008: hashGenerator now injected into constructor
    service = new WorkflowRegistryService(fs, pathResolver, yamlParser, hashGenerator);
  });

  // ==================== T001: Ordinal Generation Tests ====================

  describe('getNextCheckpointOrdinal()', () => {
    it('should return ordinal 1 for empty checkpoints directory', async () => {
      /*
      Test Doc:
      - Why: First checkpoint ever should be v001
      - Contract: getNextCheckpointOrdinal() returns 1 when checkpoints/ is empty
      - Usage Notes: Works even if checkpoints/ dir doesn't exist
      - Quality Contribution: Ensures correct bootstrap behavior
      - Worked Example: checkpoints/ empty → ordinal 1
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints`);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Test');

      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      const ordinal = await service.getNextCheckpointOrdinal(WORKFLOWS_DIR, 'test-wf');

      expect(ordinal).toBe(1);
    });

    it('should return ordinal 2 after v001 exists', async () => {
      /*
      Test Doc:
      - Why: Sequential checkpoint numbering
      - Contract: getNextCheckpointOrdinal() returns max+1
      - Usage Notes: Ordinal extracted from v###-hash pattern
      - Quality Contribution: Ensures monotonic ordinal sequence
      - Worked Example: checkpoints/v001-abc12345/ → ordinal 2
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints/v001-abc12345`);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/checkpoints/v001-abc12345/wf.yaml`, 'name: Test');
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Test v2');

      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      const ordinal = await service.getNextCheckpointOrdinal(WORKFLOWS_DIR, 'test-wf');

      expect(ordinal).toBe(2);
    });

    it('should return ordinal 4 after [v001, v002, v003]', async () => {
      /*
      Test Doc:
      - Why: Sequential case with multiple checkpoints
      - Contract: getNextCheckpointOrdinal() returns max+1 regardless of count
      - Usage Notes: Always finds max ordinal, not count
      - Quality Contribution: Handles growth correctly
      - Worked Example: v001, v002, v003 → ordinal 4
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints/v001-aaa11111`);
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints/v002-bbb22222`);
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints/v003-ccc33333`);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/checkpoints/v001-aaa11111/wf.yaml`, 'name: v1');
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/checkpoints/v002-bbb22222/wf.yaml`, 'name: v2');
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/checkpoints/v003-ccc33333/wf.yaml`, 'name: v3');
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Test v4');

      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      const ordinal = await service.getNextCheckpointOrdinal(WORKFLOWS_DIR, 'test-wf');

      expect(ordinal).toBe(4);
    });

    it('should return ordinal 5 with gaps [v001, v003, v004]', async () => {
      /*
      Test Doc:
      - Why: Gaps may exist from deleted checkpoints
      - Contract: getNextCheckpointOrdinal() returns max+1, not count+1
      - Usage Notes: Per HD05 - handles gaps with max+1 pattern
      - Quality Contribution: Prevents ordinal reuse which could cause confusion
      - Worked Example: v001, v003, v004 (no v002) → ordinal 5
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints/v001-aaa11111`);
      // v002 is missing (gap)
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints/v003-ccc33333`);
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints/v004-ddd44444`);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/checkpoints/v001-aaa11111/wf.yaml`, 'name: v1');
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/checkpoints/v003-ccc33333/wf.yaml`, 'name: v3');
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/checkpoints/v004-ddd44444/wf.yaml`, 'name: v4');
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Test v5');

      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      const ordinal = await service.getNextCheckpointOrdinal(WORKFLOWS_DIR, 'test-wf');

      expect(ordinal).toBe(5);
    });

    it('should return ordinal 6 when only v005 exists (skip)', async () => {
      /*
      Test Doc:
      - Why: Edge case - only high ordinal exists
      - Contract: getNextCheckpointOrdinal() returns max+1 regardless of start point
      - Usage Notes: Could happen from imported checkpoints or migration
      - Quality Contribution: Handles unusual starting conditions
      - Worked Example: only v005-* → ordinal 6
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints/v005-eee55555`);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/checkpoints/v005-eee55555/wf.yaml`, 'name: v5');
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Test v6');

      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      const ordinal = await service.getNextCheckpointOrdinal(WORKFLOWS_DIR, 'test-wf');

      expect(ordinal).toBe(6);
    });

    it('should ignore directories not matching v###-* pattern', async () => {
      /*
      Test Doc:
      - Why: Random directories shouldn't affect ordinal calculation
      - Contract: Only v###-[hash] pattern directories are considered
      - Usage Notes: Other files/dirs in checkpoints/ are ignored
      - Quality Contribution: Robustness against unexpected directory contents
      - Worked Example: checkpoints/ with 'temp/', 'backup/' → only v### counted
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints/v001-abc12345`);
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints/temp`); // Should be ignored
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints/backup`); // Should be ignored
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/checkpoints/.gitkeep`, ''); // Should be ignored
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/checkpoints/v001-abc12345/wf.yaml`, 'name: Test');
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Test v2');

      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      const ordinal = await service.getNextCheckpointOrdinal(WORKFLOWS_DIR, 'test-wf');

      expect(ordinal).toBe(2);
    });
  });

  // ==================== T002: Content Hash Generation Tests ====================

  describe('generateCheckpointHash()', () => {
    it('should return an 8-character hex hash', async () => {
      /*
      Test Doc:
      - Why: Checkpoints use 8-char hash prefix for naming
      - Contract: generateCheckpointHash() returns 8 lowercase hex chars
      - Usage Notes: Hash is first 8 chars of SHA-256
      - Quality Contribution: Ensures consistent naming format
      - Worked Example: any content → "abc12345" (8 chars)
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Test');

      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      const hash = await service.generateCheckpointHash(WORKFLOWS_DIR, 'test-wf');

      expect(hash).toHaveLength(8);
      expect(hash).toMatch(/^[a-f0-9]{8}$/);
    });

    it('should produce same hash for same content (deterministic)', async () => {
      /*
      Test Doc:
      - Why: Hash must be deterministic for content-based addressing
      - Contract: Same content → same hash every time
      - Usage Notes: Critical for duplicate detection (E035)
      - Quality Contribution: Ensures reproducible checkpoint naming
      - Worked Example: "name: Test" twice → same hash
      */
      // Use real hasher to verify determinism
      const realHasher = new HashGeneratorAdapter();
      const serviceWithRealHasher = new WorkflowRegistryService(
        fs,
        pathResolver,
        yamlParser,
        realHasher
      );

      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Test');

      const hash1 = await serviceWithRealHasher.generateCheckpointHash(WORKFLOWS_DIR, 'test-wf');
      const hash2 = await serviceWithRealHasher.generateCheckpointHash(WORKFLOWS_DIR, 'test-wf');

      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different content', async () => {
      /*
      Test Doc:
      - Why: Different content must produce different hashes
      - Contract: Different content → different hash (practically guaranteed)
      - Usage Notes: Hash collision astronomically unlikely with SHA-256
      - Quality Contribution: Ensures unique checkpoint names
      - Worked Example: "name: A" vs "name: B" → different hashes
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Version A');

      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      const hashA = await service.generateCheckpointHash(WORKFLOWS_DIR, 'test-wf');

      // Change content
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Version B');

      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      const hashB = await service.generateCheckpointHash(WORKFLOWS_DIR, 'test-wf');

      expect(hashA).not.toBe(hashB);
    });

    it('should hash all files in current/ including nested directories', async () => {
      /*
      Test Doc:
      - Why: All template files contribute to content hash
      - Contract: Hash includes wf.yaml, phases/*, schemas/*, etc.
      - Usage Notes: Per DYK-01, nested dirs must be included
      - Quality Contribution: Ensures complete content verification
      - Worked Example: current/ with wf.yaml, phases/p1.yaml → both hashed
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Test');
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/phases/setup.yaml`, 'phase: setup');

      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      const hashWithPhases = await service.generateCheckpointHash(WORKFLOWS_DIR, 'test-wf');

      // Reset and create without phases
      fs.reset();
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Test');

      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      const hashWithoutPhases = await service.generateCheckpointHash(WORKFLOWS_DIR, 'test-wf');

      // Hash should differ because phases/ content is included
      expect(hashWithPhases).not.toBe(hashWithoutPhases);
    });

    it('should produce same hash regardless of file insertion order (DYK-02)', async () => {
      /*
      Test Doc:
      - Why: readDir() order is OS-dependent; hash must be deterministic
      - Contract: Files sorted alphabetically before hashing
      - Usage Notes: Per DYK-02 insight from planning session
      - Quality Contribution: Cross-platform hash consistency
      - Worked Example: Insert a.yaml then b.yaml vs b.yaml then a.yaml → same hash
      */
      // Use real hasher to verify determinism (not fake which has incrementing seed)
      const realHasher = new HashGeneratorAdapter();
      const serviceWithRealHasher = new WorkflowRegistryService(
        fs,
        pathResolver,
        yamlParser,
        realHasher
      );

      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });

      // First insertion order: wf.yaml, then phases
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Test');
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/phases/alpha.yaml`, 'phase: alpha');
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/phases/beta.yaml`, 'phase: beta');

      const hash1 = await serviceWithRealHasher.generateCheckpointHash(WORKFLOWS_DIR, 'test-wf');

      // Reset and insert in reverse order
      fs.reset();
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/phases/beta.yaml`, 'phase: beta');
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/phases/alpha.yaml`, 'phase: alpha');
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Test');

      const hash2 = await serviceWithRealHasher.generateCheckpointHash(WORKFLOWS_DIR, 'test-wf');

      expect(hash1).toBe(hash2);
    });

    it('should exclude .git, node_modules, and dist directories', async () => {
      /*
      Test Doc:
      - Why: Build artifacts shouldn't affect template hash
      - Contract: .git/, node_modules/, dist/ excluded from hash
      - Usage Notes: These are runtime artifacts, not template content
      - Quality Contribution: Prevents spurious hash changes
      - Worked Example: Adding .git/ file shouldn't change hash
      */
      // Use real hasher to verify determinism
      const realHasher = new HashGeneratorAdapter();
      const serviceWithRealHasher = new WorkflowRegistryService(
        fs,
        pathResolver,
        yamlParser,
        realHasher
      );

      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Test');

      const hashWithoutExcluded = await serviceWithRealHasher.generateCheckpointHash(
        WORKFLOWS_DIR,
        'test-wf'
      );

      // Add files in excluded directories
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/.git/config`, 'git config');
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/node_modules/pkg/index.js`, 'module');
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/dist/out.js`, 'compiled');

      const hashWithExcluded = await serviceWithRealHasher.generateCheckpointHash(
        WORKFLOWS_DIR,
        'test-wf'
      );

      expect(hashWithoutExcluded).toBe(hashWithExcluded);
    });
  });

  // ==================== T003: Checkpoint Creation Tests ====================

  describe('checkpoint()', () => {
    it('should create a checkpoint with ordinal and hash in v###-hash format', async () => {
      /*
      Test Doc:
      - Why: Core checkpoint creation functionality
      - Contract: checkpoint() creates checkpoints/v001-<hash>/ directory
      - Usage Notes: Returns CheckpointResult with all metadata
      - Quality Contribution: Validates primary use case works
      - Worked Example: first checkpoint → v001-abc12345/
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Test');
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints`);

      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      const result = await service.checkpoint(WORKFLOWS_DIR, 'test-wf', {});

      expect(result.errors).toHaveLength(0);
      expect(result.ordinal).toBe(1);
      expect(result.hash).toMatch(/^[a-f0-9]{8}$/);
      expect(result.version).toMatch(/^v001-[a-f0-9]{8}$/);
      expect(result.checkpointPath).toContain('checkpoints/v001-');
    });

    it('should copy all files from current/ to checkpoint including nested dirs (DYK-01)', async () => {
      /*
      Test Doc:
      - Why: Per DYK-01, nested subdirectories must be copied
      - Contract: checkpoint() copies wf.yaml, phases/*, commands/*, etc.
      - Usage Notes: Uses copyDirectoryRecursive helper
      - Quality Contribution: Ensures complete template preservation
      - Worked Example: current/ with phases/setup.yaml → checkpoint has phases/setup.yaml
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Test');
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/phases/setup.yaml`, 'phase: setup');
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/phases/cleanup.yaml`, 'phase: cleanup');
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/commands/run.md`, '# Run command');
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints`);

      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      const result = await service.checkpoint(WORKFLOWS_DIR, 'test-wf', {});

      expect(result.errors).toHaveLength(0);
      // Verify files were copied
      const checkpointWfYaml = fs.getFile(`${result.checkpointPath}/wf.yaml`);
      const checkpointSetup = fs.getFile(`${result.checkpointPath}/phases/setup.yaml`);
      const checkpointCleanup = fs.getFile(`${result.checkpointPath}/phases/cleanup.yaml`);
      const checkpointRun = fs.getFile(`${result.checkpointPath}/commands/run.md`);
      expect(checkpointWfYaml).toBe('name: Test');
      expect(checkpointSetup).toBe('phase: setup');
      expect(checkpointCleanup).toBe('phase: cleanup');
      expect(checkpointRun).toBe('# Run command');
    });

    it('should error E036 when current/ directory does not exist', async () => {
      /*
      Test Doc:
      - Why: Can't checkpoint non-existent template
      - Contract: checkpoint() returns E036 when current/ missing
      - Usage Notes: Error includes actionable guidance
      - Quality Contribution: Clear error for common user mistake
      - Worked Example: no current/ → E036 INVALID_TEMPLATE
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints`);
      // No current/ directory

      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      const result = await service.checkpoint(WORKFLOWS_DIR, 'test-wf', {});

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E036');
    });

    it('should error E036 when wf.yaml is missing in current/', async () => {
      /*
      Test Doc:
      - Why: wf.yaml is required for valid template
      - Contract: checkpoint() returns E036 when wf.yaml missing
      - Usage Notes: Per MD12 - validate wf.yaml before checkpoint
      - Quality Contribution: Prevents invalid checkpoints
      - Worked Example: current/ without wf.yaml → E036
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/current`);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/readme.md`, '# Readme');
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints`);

      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      const result = await service.checkpoint(WORKFLOWS_DIR, 'test-wf', {});

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E036');
    });

    it('should exclude .git/, node_modules/, and dist/ from copied files', async () => {
      /*
      Test Doc:
      - Why: Build artifacts shouldn't be in checkpoints
      - Contract: checkpoint() excludes .git/, node_modules/, dist/
      - Usage Notes: Per DYK-01 exclusion list
      - Quality Contribution: Keeps checkpoints clean and small
      - Worked Example: current/ with node_modules → checkpoint without node_modules
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Test');
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/.git/config`, 'git config');
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/node_modules/pkg/index.js`, 'module');
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/dist/out.js`, 'compiled');
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints`);

      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      const result = await service.checkpoint(WORKFLOWS_DIR, 'test-wf', {});

      expect(result.errors).toHaveLength(0);
      // Verify excluded files were NOT copied
      const gitConfig = fs.getFile(`${result.checkpointPath}/.git/config`);
      const nodeModule = fs.getFile(`${result.checkpointPath}/node_modules/pkg/index.js`);
      const distOut = fs.getFile(`${result.checkpointPath}/dist/out.js`);
      expect(gitConfig).toBeUndefined();
      expect(nodeModule).toBeUndefined();
      expect(distOut).toBeUndefined();
      // But wf.yaml should be there
      expect(fs.getFile(`${result.checkpointPath}/wf.yaml`)).toBe('name: Test');
    });
  });

  // ==================== T004: Duplicate Content Detection Tests ====================

  describe('duplicate content detection', () => {
    it('should error E035 when content hash matches existing checkpoint', async () => {
      /*
      Test Doc:
      - Why: Prevent duplicate checkpoints of unchanged content
      - Contract: checkpoint() returns E035 when hash already exists
      - Usage Notes: Per CD11 - hash collision detection
      - Quality Contribution: Saves disk space, provides useful feedback
      - Worked Example: same content as v001 → E035 with reference to v001
      */
      // Use real hasher to get actual deterministic hash
      const realHasher = new HashGeneratorAdapter();

      // First, compute what hash the content will generate
      const content = 'name: Same Content';
      const fullHash = await realHasher.sha256(`wf.yaml:${content}`);
      const hash = fullHash.substring(0, 8);

      // Create service with real hasher
      const serviceWithRealHasher = new WorkflowRegistryService(
        fs,
        pathResolver,
        yamlParser,
        realHasher
      );

      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, content);
      // Existing checkpoint with the matching hash
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints/v001-${hash}`);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/checkpoints/v001-${hash}/wf.yaml`, content);
      fs.setFile(
        `${WORKFLOWS_DIR}/test-wf/checkpoints/v001-${hash}/.checkpoint.json`,
        JSON.stringify({ ordinal: 1, hash, createdAt: '2026-01-24T10:00:00Z' })
      );

      const result = await serviceWithRealHasher.checkpoint(WORKFLOWS_DIR, 'test-wf', {});

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E035');
      expect(result.errors[0].message).toContain('v001');
    });

    it('should allow --force to create checkpoint even with duplicate content', async () => {
      /*
      Test Doc:
      - Why: User may want duplicate checkpoint intentionally
      - Contract: checkpoint() with force=true ignores duplicate hash
      - Usage Notes: Creates new ordinal even with same hash
      - Quality Contribution: Provides escape hatch when needed
      - Worked Example: same content + force → v002-abc12345 created
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Same Content');
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints/v001-abc12345`);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/checkpoints/v001-abc12345/wf.yaml`, 'name: Same Content');

      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      const result = await service.checkpoint(WORKFLOWS_DIR, 'test-wf', { force: true });

      expect(result.errors).toHaveLength(0);
      expect(result.ordinal).toBe(2);
    });
  });

  // ==================== T005: workflow.json Auto-Generation Tests ====================

  describe('workflow.json auto-generation', () => {
    it('should auto-generate workflow.json if missing on first checkpoint', async () => {
      /*
      Test Doc:
      - Why: Per CD03 - workflow.json created on first checkpoint if missing
      - Contract: checkpoint() creates workflow.json from wf.yaml metadata
      - Usage Notes: Extracts name from wf.yaml, sets created_at
      - Quality Contribution: Smooth onboarding experience
      - Worked Example: no workflow.json + checkpoint → workflow.json created
      */
      // No workflow.json initially
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Test Workflow\nversion: 1.0');
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints`);

      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      const result = await service.checkpoint(WORKFLOWS_DIR, 'test-wf', {});

      expect(result.errors).toHaveLength(0);
      // Check workflow.json was created
      const workflowJson = fs.getFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`);
      expect(workflowJson).toBeDefined();
      const parsed = JSON.parse(workflowJson!);
      expect(parsed.slug).toBe('test-wf');
      expect(parsed.name).toBe('Test Workflow');
      expect(parsed.created_at).toBeDefined();
    });

    it('should preserve existing workflow.json when present', async () => {
      /*
      Test Doc:
      - Why: Don't overwrite user's custom metadata
      - Contract: checkpoint() keeps existing workflow.json unchanged
      - Usage Notes: Only creates if missing
      - Quality Contribution: Respects user customization
      - Worked Example: workflow.json with tags → tags preserved
      */
      const existingWorkflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Custom Name',
        description: 'Custom description',
        created_at: '2026-01-01T00:00:00Z',
        tags: ['important', 'production'],
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, existingWorkflowJson);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Different Name');
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints`);

      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      await service.checkpoint(WORKFLOWS_DIR, 'test-wf', {});

      // workflow.json should be unchanged
      const afterCheckpoint = fs.getFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`);
      expect(afterCheckpoint).toBe(existingWorkflowJson);
    });

    it('should extract name from wf.yaml for auto-generated workflow.json', async () => {
      /*
      Test Doc:
      - Why: workflow.json name should come from template
      - Contract: Auto-generated workflow.json uses wf.yaml name field
      - Usage Notes: YAML parsing required
      - Quality Contribution: Consistent naming between wf.yaml and workflow.json
      - Worked Example: wf.yaml: name: "My Flow" → workflow.json: name: "My Flow"
      */
      const wfYamlContent = 'name: Extracted Workflow Name';
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, wfYamlContent);
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints`);

      // Configure YAML parser to return the expected result for this content
      yamlParser.setParseResult(wfYamlContent, { name: 'Extracted Workflow Name' });

      await service.checkpoint(WORKFLOWS_DIR, 'test-wf', {});

      const workflowJson = fs.getFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`);
      expect(workflowJson).toBeDefined();
      const parsed = JSON.parse(workflowJson!);
      expect(parsed.name).toBe('Extracted Workflow Name');
    });
  });

  // ==================== T006: .checkpoint.json Metadata Tests ====================

  describe('.checkpoint.json metadata', () => {
    it('should create .checkpoint.json with ordinal, hash, and createdAt', async () => {
      /*
      Test Doc:
      - Why: Checkpoint metadata enables version queries
      - Contract: .checkpoint.json contains ordinal (number), hash (string), createdAt (ISO8601)
      - Usage Notes: Used by versions() and restore() operations
      - Quality Contribution: Enables checkpoint metadata queries
      - Worked Example: v001-abc → .checkpoint.json: { ordinal: 1, hash: "abc12345", ... }
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Test');
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints`);

      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      const result = await service.checkpoint(WORKFLOWS_DIR, 'test-wf', {});

      expect(result.errors).toHaveLength(0);
      const manifestPath = `${result.checkpointPath}/.checkpoint.json`;
      const manifestContent = fs.getFile(manifestPath);
      expect(manifestContent).toBeDefined();

      const manifest = JSON.parse(manifestContent!);
      expect(manifest.ordinal).toBe(1);
      expect(manifest.hash).toMatch(/^[a-f0-9]{8}$/);
      expect(manifest.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should include comment in .checkpoint.json when provided', async () => {
      /*
      Test Doc:
      - Why: Users can annotate checkpoints with descriptions
      - Contract: checkpoint({ comment }) includes comment in .checkpoint.json
      - Usage Notes: Optional field; shown in versions() output
      - Quality Contribution: Enables checkpoint documentation
      - Worked Example: checkpoint --comment "Release v1" → .checkpoint.json.comment = "Release v1"
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Test');
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints`);

      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      const result = await service.checkpoint(WORKFLOWS_DIR, 'test-wf', {
        comment: 'Initial release',
      });

      expect(result.errors).toHaveLength(0);
      const manifestPath = `${result.checkpointPath}/.checkpoint.json`;
      const manifest = JSON.parse(fs.getFile(manifestPath)!);
      expect(manifest.comment).toBe('Initial release');
    });

    it('should omit comment from .checkpoint.json when not provided', async () => {
      /*
      Test Doc:
      - Why: Comment is optional
      - Contract: No comment option → no comment field in manifest
      - Usage Notes: Keep manifest clean when comment not needed
      - Quality Contribution: Clean output for simple use cases
      - Worked Example: checkpoint without comment → no comment field
      */
      const workflowJson = JSON.stringify({
        slug: 'test-wf',
        name: 'Test Workflow',
        created_at: '2026-01-24T10:00:00Z',
      });
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/workflow.json`, workflowJson);
      fs.setFile(`${WORKFLOWS_DIR}/test-wf/current/wf.yaml`, 'name: Test');
      fs.setDir(`${WORKFLOWS_DIR}/test-wf/checkpoints`);

      // @ts-expect-error - Method doesn't exist yet (TDD RED phase)
      const result = await service.checkpoint(WORKFLOWS_DIR, 'test-wf', {});

      const manifestPath = `${result.checkpointPath}/.checkpoint.json`;
      const manifest = JSON.parse(fs.getFile(manifestPath)!);
      expect(manifest.comment).toBeUndefined();
    });
  });
});

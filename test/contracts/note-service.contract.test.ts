/**
 * INoteService Contract Test Runner
 *
 * Runs the contract suite against both FakeNoteService and JsonlNoteService.
 *
 * Plan 071: PR View & File Notes — Phase 1
 */

import * as fs from 'node:fs';
import { FakeNoteService } from '@chainglass/shared/fakes';
import { JsonlNoteService } from '@chainglass/shared/file-notes';
import { afterEach, beforeEach } from 'vitest';
import { makeTmpDir, removeTmpDir } from '../helpers/tmpdir';
import { noteServiceContractTests } from './note-service.contract';
// Fake implementation — no filesystem needed
noteServiceContractTests('FakeNoteService', () => new FakeNoteService());

// Real JSONL implementation — uses tmpdir
let tmpDir: string;

beforeEach(() => {
  tmpDir = makeTmpDir('note-contract');
});

afterEach(() => {
  removeTmpDir(tmpDir);
});

noteServiceContractTests('JsonlNoteService', () => new JsonlNoteService(tmpDir));

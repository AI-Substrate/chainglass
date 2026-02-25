/**
 * Plan 045: Live File Events
 *
 * Contract test runner for FileChangeHub — both real and fake must pass.
 */

import { FakeFileChangeHub } from '../../apps/web/src/features/045-live-file-events/fake-file-change-hub';
import { FileChangeHub } from '../../apps/web/src/features/045-live-file-events/file-change-hub';
import { fileChangeHubContractTests } from './file-change-hub.contract';

fileChangeHubContractTests('FileChangeHub (Real)', () => new FileChangeHub());
fileChangeHubContractTests('FakeFileChangeHub (Fake)', () => new FakeFileChangeHub());

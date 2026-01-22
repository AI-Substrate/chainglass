#!/usr/bin/env node
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const schemasDir = join(__dirname, '..', 'schemas');

const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);

const schemaFiles = [
  'wf.schema.json',
  'wf-phase.schema.json',
  'message.schema.json',
  'wf-status.schema.json',
];

let allValid = true;
for (const file of schemaFiles) {
  const fullPath = join(schemasDir, file);
  try {
    const schema = JSON.parse(readFileSync(fullPath, 'utf-8'));
    ajv.compile(schema);
    console.log(`✓ ${file} - valid`);
  } catch (e) {
    console.log(`✗ ${file} - invalid: ${e.message}`);
    allValid = false;
  }
}

process.exit(allValid ? 0 : 1);

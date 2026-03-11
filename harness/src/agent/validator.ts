/**
 * Agent output validator — JSON Schema validation via ajv.
 *
 * Validates agent output (report.json) against the declared output-schema.json.
 * Pre-validates for common failure modes (missing file, empty, invalid JSON)
 * before running ajv validation.
 *
 * Validation failure maps to status: "degraded" (not "error") — the agent
 * completed work, it just didn't conform to the expected schema.
 */

import * as fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import type { ValidationResult } from './types.js';

/** Shared ajv instance with allErrors for comprehensive reporting. Supports JSON Schema 2020-12. */
const ajv = new Ajv2020({ allErrors: true });

/**
 * Validate input parameters against an input schema.
 *
 * Unlike validateOutput (file-based), this validates an in-memory params object.
 * Used by the runner before prompt assembly to fail fast on missing/invalid params.
 */
export function validateInput(
  schemaPath: string,
  params: Record<string, string>,
): ValidationResult {
  if (!fs.existsSync(schemaPath)) {
    return { valid: false, errors: [`Input schema file not found: ${schemaPath}`] };
  }

  let schemaData: unknown;
  try {
    schemaData = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, errors: [`Input schema is not valid JSON: ${message}`] };
  }

  let validate: ReturnType<typeof ajv.compile>;
  try {
    validate = ajv.compile(schemaData as Record<string, unknown>);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, errors: [`Input schema compilation failed: ${message}`] };
  }

  const valid = validate(params);
  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors = (validate.errors ?? []).map((e) => {
    const path = e.instancePath || '/';
    return `${path}: ${e.message ?? 'unknown error'}`;
  });

  return { valid: false, errors };
}

/**
 * Validate an output file against a JSON Schema.
 *
 * Pre-validation (DYK-03): Returns early with descriptive errors for:
 * - Output file not found
 * - Output file is empty
 * - Output file is not valid JSON
 *
 * All failures map to { valid: false, errors: [...] } — never throws.
 */
export function validateOutput(schemaPath: string, outputPath: string): ValidationResult {
  // Pre-validate: schema file must exist
  if (!fs.existsSync(schemaPath)) {
    return { valid: false, errors: [`Schema file not found: ${schemaPath}`] };
  }

  // Pre-validate: output file must exist
  if (!fs.existsSync(outputPath)) {
    return { valid: false, errors: [`Output file not found: ${outputPath}`] };
  }

  // Pre-validate: output file must not be empty
  const outputContent = fs.readFileSync(outputPath, 'utf-8').trim();
  if (!outputContent) {
    return { valid: false, errors: ['Output file is empty'] };
  }

  // Pre-validate: output must be valid JSON
  let outputData: unknown;
  try {
    outputData = JSON.parse(outputContent);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, errors: [`Output is not valid JSON: ${message}`] };
  }

  // Load and compile schema
  let schemaData: unknown;
  try {
    schemaData = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, errors: [`Schema is not valid JSON: ${message}`] };
  }

  let validate: ReturnType<typeof ajv.compile>;
  try {
    validate = ajv.compile(schemaData as Record<string, unknown>);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, errors: [`Schema compilation failed: ${message}`] };
  }

  // Validate output against schema
  const valid = validate(outputData);
  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors = (validate.errors ?? []).map((e) => {
    const path = e.instancePath || '/';
    return `${path}: ${e.message ?? 'unknown error'}`;
  });

  return { valid: false, errors };
}

/**
 * Base class for all configuration-related errors.
 */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}

/**
 * Thrown when a required configuration type is not available.
 *
 * Example:
 * ```typescript
 * throw new MissingConfigurationError('sample');
 * // Error: Configuration 'sample' is required but not available.
 * // Set it via YAML config file or CG_SAMPLE_* environment variables.
 * ```
 */
export class MissingConfigurationError extends ConfigurationError {
  constructor(public readonly configPath: string) {
    super(
      `Configuration '${configPath}' is required but not available.\n` +
        `Set it via YAML config file or CG_${configPath.toUpperCase()}_* environment variables.`
    );
    this.name = 'MissingConfigurationError';
    Object.setPrototypeOf(this, MissingConfigurationError.prototype);
  }
}

/**
 * Thrown when a literal secret is detected in configuration.
 *
 * Example:
 * ```typescript
 * throw new LiteralSecretError('sample.apiKey', 'OpenAI');
 * // Error: Literal 'OpenAI' secret detected in 'sample.apiKey'.
 * // Use environment variable placeholder: ${OPENAI_API_KEY}
 * ```
 */
export class LiteralSecretError extends ConfigurationError {
  constructor(
    public readonly fieldPath: string,
    public readonly secretType: string
  ) {
    super(
      `Literal '${secretType}' secret detected in '${fieldPath}'.\n` +
        `Use environment variable placeholder: \${${secretType.toUpperCase().replace(/\s+/g, '_')}_API_KEY}`
    );
    this.name = 'LiteralSecretError';
    Object.setPrototypeOf(this, LiteralSecretError.prototype);
  }
}

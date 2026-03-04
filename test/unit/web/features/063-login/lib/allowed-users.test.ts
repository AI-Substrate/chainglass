import { resolve } from 'node:path';
import { isUserAllowed, loadAllowedUsers } from '@/features/063-login/lib/allowed-users';
import { describe, expect, it } from 'vitest';

const FIXTURES_DIR = resolve(process.cwd(), 'test/fixtures/web/063-login');

describe('loadAllowedUsers', () => {
  it('should parse valid YAML and return a Set of usernames', () => {
    /*
    Test Doc:
    - Why: Core allowlist loading — the entire auth gate depends on correct YAML parsing
    - Contract: loadAllowedUsers(path) returns Set<string> of lowercase usernames from valid YAML
    - Usage Notes: Pass absolute path to YAML file with `allowed_users` array
    - Quality Contribution: Catches YAML parsing regressions that would lock out all users
    - Worked Example: valid-auth.yaml with [jakkaj, otheruser] → Set {'jakkaj', 'otheruser'}
    */
    const users = loadAllowedUsers(resolve(FIXTURES_DIR, 'valid-auth.yaml'));
    expect(users).toBeInstanceOf(Set);
    expect(users.has('jakkaj')).toBe(true);
    expect(users.has('otheruser')).toBe(true);
  });

  it('should normalize usernames to lowercase for case-insensitive matching', () => {
    /*
    Test Doc:
    - Why: GitHub usernames are case-insensitive; allowlist must match regardless of case
    - Contract: loadAllowedUsers lowercases all usernames before adding to Set
    - Usage Notes: YAML may contain mixed-case names like 'JakkaJ' — all stored lowercase
    - Quality Contribution: Prevents case-sensitivity bugs that deny legitimate users
    - Worked Example: mixed-case-auth.yaml with [JakkaJ, UpperUser] → Set {'jakkaj', 'upperuser'}
    */
    const users = loadAllowedUsers(resolve(FIXTURES_DIR, 'mixed-case-auth.yaml'));
    expect(users.has('jakkaj')).toBe(true);
    expect(users.has('upperuser')).toBe(true);
  });

  it('should return empty Set when file is missing', () => {
    /*
    Test Doc:
    - Why: Missing config file must deny all access (fail-closed security)
    - Contract: loadAllowedUsers returns empty Set for nonexistent file path
    - Usage Notes: No exception thrown — caller gets empty Set and deny-by-default
    - Quality Contribution: Ensures fail-closed behavior when config is absent
    - Worked Example: loadAllowedUsers('/nonexistent') → Set {} (size 0)
    */
    const users = loadAllowedUsers('/nonexistent/path/auth.yaml');
    expect(users).toBeInstanceOf(Set);
    expect(users.size).toBe(0);
  });

  it('should return empty Set when YAML content is invalid', () => {
    /*
    Test Doc:
    - Why: Malformed YAML must deny all access (fail-closed security)
    - Contract: loadAllowedUsers returns empty Set when Zod validation fails
    - Usage Notes: Invalid YAML (wrong schema, corrupt content) triggers catch path
    - Quality Contribution: Catches schema validation failures that could bypass auth
    - Worked Example: invalid-auth.yaml (bad schema) → Set {} (size 0)
    */
    const users = loadAllowedUsers(resolve(FIXTURES_DIR, 'invalid-auth.yaml'));
    expect(users).toBeInstanceOf(Set);
    expect(users.size).toBe(0);
  });

  it('should return empty Set when allowed_users array is empty', () => {
    /*
    Test Doc:
    - Why: Empty allowlist must deny all access (no users authorized)
    - Contract: loadAllowedUsers returns empty Set for YAML with empty allowed_users array
    - Usage Notes: Valid YAML but with `allowed_users: []` — correctly parsed, zero users
    - Quality Contribution: Ensures explicit empty list doesn't accidentally allow access
    - Worked Example: empty-auth.yaml with allowed_users: [] → Set {} (size 0)
    */
    const users = loadAllowedUsers(resolve(FIXTURES_DIR, 'empty-auth.yaml'));
    expect(users).toBeInstanceOf(Set);
    expect(users.size).toBe(0);
  });
});

describe('isUserAllowed', () => {
  it('should return true for users on the allowlist', () => {
    /*
    Test Doc:
    - Why: Allowed users must be granted access — primary happy path
    - Contract: isUserAllowed returns true when username exists in allowlist
    - Usage Notes: Pass GitHub username and optional file path
    - Quality Contribution: Validates the core authorization decision
    - Worked Example: isUserAllowed('jakkaj', validPath) → true
    */
    expect(isUserAllowed('jakkaj', resolve(FIXTURES_DIR, 'valid-auth.yaml'))).toBe(true);
  });

  it('should match usernames case-insensitively', () => {
    /*
    Test Doc:
    - Why: GitHub treats usernames as case-insensitive; auth must match
    - Contract: isUserAllowed lowercases input before comparison
    - Usage Notes: 'JakkaJ' matches 'jakkaj' in allowlist
    - Quality Contribution: Prevents case-mismatch denial of legitimate users
    - Worked Example: isUserAllowed('JakkaJ', validPath) → true
    */
    expect(isUserAllowed('JakkaJ', resolve(FIXTURES_DIR, 'valid-auth.yaml'))).toBe(true);
  });

  it('should return false for users not on the allowlist', () => {
    /*
    Test Doc:
    - Why: Unlisted users must be denied — core security boundary
    - Contract: isUserAllowed returns false for usernames not in allowlist
    - Usage Notes: Any username not in the YAML file is rejected
    - Quality Contribution: Validates the deny path that prevents unauthorized access
    - Worked Example: isUserAllowed('intruder', validPath) → false
    */
    expect(isUserAllowed('intruder', resolve(FIXTURES_DIR, 'valid-auth.yaml'))).toBe(false);
  });

  it('should return false when allowlist file is missing', () => {
    /*
    Test Doc:
    - Why: Missing config must deny all — fail-closed security through isUserAllowed
    - Contract: isUserAllowed returns false when underlying file doesn't exist
    - Usage Notes: Delegates to loadAllowedUsers which returns empty Set
    - Quality Contribution: End-to-end verification of fail-closed through public API
    - Worked Example: isUserAllowed('jakkaj', '/nonexistent') → false
    */
    expect(isUserAllowed('jakkaj', '/nonexistent/path/auth.yaml')).toBe(false);
  });
});

/**
 * File paths in terminal text, for the terminal's path links.
 *
 * Finds path-shaped tokens in one logical line: anything with a slash
 * (`scratch/review/a.jpg`, `./x`, `~/notes.md`, `/abs/path`) or a bare name with
 * an extension (`README.md`), with an optional `:line[:col]` suffix. This only
 * proposes candidates; whether a candidate is a link depends on the sidecar
 * finding it on disk, so a false match here costs a lookup, never a dead link.
 * URLs are left to the web-links addon.
 */

export interface PathCandidate {
  /** The path as written, without the `:line[:col]` suffix. */
  path: string;
  /** 1-based line number from a `:line` suffix, if one was written. */
  line: number | null;
  /** String offsets of the whole match (suffix included), end exclusive. */
  start: number;
  end: number;
}

const TOKEN = /[\w~./@+-]+(?::\d+(?::\d+)?)?/g;
const LINE_SUFFIX = /^(.*?)(?::(\d+)(?::\d+)?)?$/;
const HAS_EXTENSION = /[\w-]\.[A-Za-z][A-Za-z0-9]{0,9}$/;

/** Enough for any real line; bounds the lookup a pathological line could ask for. */
export const MAX_CANDIDATES_PER_LINE = 20;

export function findPathCandidates(text: string): PathCandidate[] {
  const candidates: PathCandidate[] = [];
  for (const match of text.matchAll(TOKEN)) {
    const start = match.index;
    let token = match[0];
    // `https://host/x` tokenizes as `https` + `//host/x`; the web-links addon owns URLs.
    if (token.startsWith('//') || text.slice(start - 1, start) === ':') continue;
    // Sentence punctuation, not part of the path: "see a/b.ts." or "(in ./x)".
    token = token.replace(/[.]+$/, '');
    const parsed = LINE_SUFFIX.exec(token);
    const path = parsed?.[1] ?? token;
    if (!isPathShaped(path)) continue;
    candidates.push({
      path,
      line: parsed?.[2] ? Number(parsed[2]) : null,
      start,
      end: start + token.length,
    });
    if (candidates.length === MAX_CANDIDATES_PER_LINE) break;
  }
  return candidates;
}

function isPathShaped(path: string): boolean {
  if (path.includes('/')) {
    // At least one named segment: not `/`, `./`, `~/` or `..`.
    return /[\w@+-]/.test(path.replace(/^[~.]+/, ''));
  }
  return HAS_EXTENSION.test(path);
}

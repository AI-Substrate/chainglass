'use client';

/**
 * PRViewDiffArea — Scrollable right column with IntersectionObserver scroll sync.
 *
 * Per workshop section 3.5. Scrolling highlights active file in file list.
 * DYK-04: isScrollingToRef guard prevents feedback loop when clicking file.
 *
 * Plan 071: PR View & File Notes — Phase 5, T007
 */

import { type MutableRefObject, useCallback, useEffect, useRef } from 'react';

import type { PRViewFile } from '../types';
import { PRViewDiffSection } from './pr-view-diff-section';

interface PRViewDiffAreaProps {
  files: PRViewFile[];
  collapsedFiles: Set<string>;
  onToggleCollapsed: (filePath: string) => void;
  onToggleReviewed: (filePath: string) => void;
  onActiveFileChange: (filePath: string | null) => void;
  scrollToFileRef: MutableRefObject<((path: string) => void) | undefined>;
}

export function PRViewDiffArea({
  files,
  collapsedFiles,
  onToggleCollapsed,
  onToggleReviewed,
  onActiveFileChange,
  scrollToFileRef,
}: PRViewDiffAreaProps) {
  const diffAreaRef = useRef<HTMLDivElement>(null);
  // DYK-04: Guard to prevent observer updates during programmatic scroll
  const isScrollingToRef = useRef(false);

  // scrollToFile — exposed to file list via ref
  const scrollToFile = useCallback(
    (filePath: string) => {
      const container = diffAreaRef.current;
      if (!container) return;

      const section = container.querySelector(`[data-file-path="${CSS.escape(filePath)}"]`);
      if (!section) return;

      isScrollingToRef.current = true;
      onActiveFileChange(filePath);
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });

      // Clear guard after scroll animation settles
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          isScrollingToRef.current = false;
        });
      });
    },
    [onActiveFileChange]
  );

  // Expose scrollToFile to parent via ref
  useEffect(() => {
    scrollToFileRef.current = scrollToFile;
  }, [scrollToFile, scrollToFileRef]);

  // IntersectionObserver for scroll sync
  // biome-ignore lint/correctness/useExhaustiveDependencies: files triggers re-observe when file list changes
  useEffect(() => {
    const container = diffAreaRef.current;
    if (!container) return;

    const sections = container.querySelectorAll('[data-file-path]');
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // DYK-04: Skip during programmatic scroll
        if (isScrollingToRef.current) return;

        // Find the most visible section
        let bestEntry: IntersectionObserverEntry | null = null;
        for (const entry of entries) {
          if (
            entry.isIntersecting &&
            (!bestEntry || entry.intersectionRatio > bestEntry.intersectionRatio)
          ) {
            bestEntry = entry;
          }
        }

        if (bestEntry) {
          const filePath = (bestEntry.target as HTMLElement).dataset.filePath;
          if (filePath) onActiveFileChange(filePath);
        }
      },
      {
        root: container,
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1.0],
      }
    );

    for (const section of sections) {
      observer.observe(section);
    }

    return () => observer.disconnect();
  }, [files, onActiveFileChange]);

  return (
    <div ref={diffAreaRef} className="flex-1 overflow-y-auto">
      {files.map((file) => (
        <PRViewDiffSection
          key={file.path}
          file={file}
          collapsed={collapsedFiles.has(file.path)}
          onToggleCollapsed={onToggleCollapsed}
          onToggleReviewed={onToggleReviewed}
        />
      ))}
    </div>
  );
}

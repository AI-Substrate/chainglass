'use client';

import { useEffect, useState } from 'react';

const CHARS = 'ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function generateChars(length: number): string {
  return Array.from({ length }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('\n');
}

interface MatrixColumnProps {
  delay: number;
  speed: number;
  left: string;
}

function MatrixColumn({ delay, speed, left }: MatrixColumnProps) {
  const [chars, setChars] = useState('');

  useEffect(() => {
    setChars(generateChars(20));
  }, []);

  if (!chars) return null;

  return (
    <span
      className="pointer-events-none absolute top-0 select-none whitespace-pre font-mono text-xs"
      style={{
        left,
        color: '#00ff41',
        animation: `matrix-fall ${speed}s linear ${delay}s infinite`,
        textShadow: '0 0 8px rgba(0, 255, 65, 0.6)',
      }}
    >
      {chars}
    </span>
  );
}

interface MatrixRainProps {
  columnCount?: number;
}

export function MatrixRain({ columnCount = 40 }: MatrixRainProps) {
  const [mounted, setMounted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    setMounted(true);
  }, []);

  if (!mounted) return null;

  if (reducedMotion) {
    return (
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden font-mono text-xs"
        style={{ color: 'rgba(0, 255, 65, 0.08)' }}
        aria-hidden="true"
      >
        <div className="absolute inset-0 flex justify-around opacity-60">
          {Array.from({ length: 8 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static list of fixed-size atmospheric columns, never reordered
            <span key={i} className="whitespace-pre">
              {generateChars(30)}
            </span>
          ))}
        </div>
      </div>
    );
  }

  const columns = Array.from({ length: columnCount }, (_, i) => ({
    id: i,
    delay: Math.random() * 10,
    speed: 8 + Math.random() * 12,
    left: `${(i / columnCount) * 100}%`,
  }));

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {columns.map((col) => (
        <MatrixColumn key={col.id} delay={col.delay} speed={col.speed} left={col.left} />
      ))}
    </div>
  );
}

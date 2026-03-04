export function CRTOverlay() {
  return (
    <div
      className="crt-overlay pointer-events-none fixed inset-0 z-50"
      aria-hidden="true"
      style={{
        background:
          'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 0, 0, 0.05) 2px, rgba(0, 0, 0, 0.05) 4px)',
        boxShadow: 'inset 0 0 150px rgba(0, 0, 0, 0.5)',
      }}
    />
  );
}

'use client';

const CHAINGLASS_LOGO = ` ██████╗██╗  ██╗ █████╗ ██╗███╗   ██╗ ██████╗ ██╗      █████╗ ███████╗███████╗
██╔════╝██║  ██║██╔══██╗██║████╗  ██║██╔════╝ ██║     ██╔══██╗██╔════╝██╔════╝
██║     ███████║███████║██║██╔██╗ ██║██║  ███╗██║     ███████║███████╗███████╗
██║     ██╔══██║██╔══██║██║██║╚██╗██║██║   ██║██║     ██╔══██║╚════██║╚════██║
╚██████╗██║  ██║██║  ██║██║██║ ╚████║╚██████╔╝███████╗██║  ██║███████║███████║
 ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝`;

export function AsciiLogo() {
  return (
    <div className="flex flex-col items-center">
      {/* Screen reader heading */}
      <h1 className="sr-only">Chainglass</h1>

      {/* Mobile fallback: plain text */}
      <h2
        className="block font-mono text-3xl font-bold tracking-wider sm:hidden"
        style={{ color: '#00ff41' }}
      >
        CHAINGLASS
      </h2>

      {/* Tablet + Desktop: ASCII art with glitch */}
      <div className="hidden overflow-hidden sm:block">
        <div className="sm:origin-center sm:scale-60 lg:scale-100">
          <pre
            className="ascii-logo select-none font-mono leading-none tracking-[0]"
            aria-hidden="true"
            data-text={CHAINGLASS_LOGO}
            style={{ color: '#00ff41' }}
          >
            {CHAINGLASS_LOGO}
          </pre>
        </div>
      </div>
    </div>
  );
}

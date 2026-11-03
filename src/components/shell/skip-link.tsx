/** First focusable element on every page: jumps keyboard users past the header. */
export function SkipLink({ target = 'main-content' }: { target?: string }) {
  return (
    <a
      href={`#${target}`}
      className="sr-only rounded-md bg-surface px-4 py-3 text-body-sm font-semibold text-accent-strong shadow-3 focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70]"
    >
      Skip to content
    </a>
  );
}

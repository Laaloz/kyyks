export function LoadingScreen() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <span
        aria-hidden="true"
        className="size-7 animate-spin rounded-full border-2 border-current border-r-transparent text-[var(--accent)]"
      />
      <p className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-[var(--text)]">
        Ladataan treenityötilaa
      </p>
    </div>
  );
}

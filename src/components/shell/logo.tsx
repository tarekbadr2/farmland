import { cn } from "@/lib/utils";

/** Buffalo horns as a monogram — reads at 20px, which is where it lives. */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
        <path
          d="M4 7c0 5.5 3.6 9 8 9s8-3.5 8-9"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
        <path
          d="M4 7C4 5 5.4 4 7 4M20 7c0-2-1.4-3-3-3"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
        <circle cx="9.5" cy="11" r="1.05" fill="currentColor" />
        <circle cx="14.5" cy="11" r="1.05" fill="currentColor" />
        <path
          d="M9.5 19h5"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

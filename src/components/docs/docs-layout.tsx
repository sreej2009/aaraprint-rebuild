import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function DocsSection({ id, title, description, children }: { id: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-28 border-t border-border pt-10">
      <div className="mb-6 flex max-w-reading flex-col gap-1.5">
        <h2 id={`${id}-title`} className="text-h2 font-bold text-fg">
          {title}
        </h2>
        {description && <p className="text-body text-fg-muted">{description}</p>}
      </div>
      <div className="flex flex-col gap-6">{children}</div>
    </section>
  );
}

/** A labelled demo area. */
export function Example({ title, note, children, className }: { title: string; note?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h3 className="font-sans text-body-sm font-semibold text-fg">{title}</h3>
        {note && <p className="text-caption text-fg-muted">{note}</p>}
      </div>
      <div className={cn('rounded-md border border-border bg-surface p-5 sm:p-6', className)}>{children}</div>
    </div>
  );
}

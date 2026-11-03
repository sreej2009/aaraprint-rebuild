import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface PageHeaderProps {
  title: ReactNode;
  /** Small line above the title (category, section). */
  eyebrow?: ReactNode;
  description?: ReactNode;
  /** Buttons aligned to the right on wide screens. */
  actions?: ReactNode;
  className?: string;
}

/** Page title block. Renders the page's single <h1>. */
export function PageHeader({ title, eyebrow, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-4 md:flex-row md:items-end md:justify-between', className)}>
      <div className="flex max-w-reading flex-col gap-2">
        {eyebrow && <p className="text-body-sm font-semibold text-accent-strong">{eyebrow}</p>}
        <h1 className="text-h1 font-bold text-fg">{title}</h1>
        {description && <p className="text-lead text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

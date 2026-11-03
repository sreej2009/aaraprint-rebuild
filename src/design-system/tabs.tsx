import { Tabs as TabsPrimitive } from 'radix-ui';
import { createContext, use, type ComponentProps } from 'react';
import { cn } from '@/lib/cn';

type TabsVariant = 'underline' | 'segmented';
const VariantContext = createContext<TabsVariant>('underline');

export const Tabs = TabsPrimitive.Root;

/** `underline` for page sections; `segmented` for compact toggles such as 2D / 3D or Front / Back. */
export function TabsList({ variant = 'underline', className, ...props }: ComponentProps<typeof TabsPrimitive.List> & { variant?: TabsVariant }) {
  return (
    <VariantContext value={variant}>
      <TabsPrimitive.List
        className={cn(
          variant === 'underline'
            ? 'flex gap-6 overflow-x-auto border-b border-border'
            : 'inline-flex w-fit gap-1 rounded-md border border-border bg-surface-subtle p-1',
          className,
        )}
        {...props}
      />
    </VariantContext>
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  const variant = use(VariantContext);
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 text-body-sm font-medium whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed disabled:text-fg-subtle',
        variant === 'underline'
          ? '-mb-px h-11 border-b-2 border-transparent text-fg-muted hover:text-fg data-[state=active]:border-accent data-[state=active]:text-fg'
          : 'h-9 min-w-16 rounded-sm px-3 text-fg-muted hover:text-fg data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-1',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('pt-5 outline-offset-4', className)} {...props} />;
}

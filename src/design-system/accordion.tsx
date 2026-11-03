import { ChevronDown } from 'lucide-react';
import { Accordion as AccordionPrimitive } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const Accordion = AccordionPrimitive.Root;

export interface AccordionItemProps extends Omit<ComponentProps<typeof AccordionPrimitive.Item>, 'title'> {
  title: ReactNode;
  /** Heading level of the trigger, so the outline of the page stays correct. */
  headingLevel?: 2 | 3 | 4;
}

export function AccordionItem({ title, headingLevel = 3, className, children, ...props }: AccordionItemProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <AccordionPrimitive.Item className={cn('border-b border-border', className)} {...props}>
      <AccordionPrimitive.Header asChild>
        <Heading className="font-sans">
          <AccordionPrimitive.Trigger className="group flex min-h-14 w-full items-center justify-between gap-4 py-3 text-left text-body font-semibold text-fg transition-colors hover:text-accent-strong">
            {title}
            <ChevronDown
              aria-hidden="true"
              className="size-5 shrink-0 text-fg-muted transition-transform duration-200 ease-standard group-data-[state=open]:rotate-180"
            />
          </AccordionPrimitive.Trigger>
        </Heading>
      </AccordionPrimitive.Header>
      <AccordionPrimitive.Content className="overflow-hidden text-body text-fg-muted data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
        <div className="pb-5">{children}</div>
      </AccordionPrimitive.Content>
    </AccordionPrimitive.Item>
  );
}

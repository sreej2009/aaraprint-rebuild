import { Link, type LinkProps } from 'react-router';
import { cn } from '@/lib/cn';

export const textLinkClasses =
  'font-medium text-accent-strong underline decoration-accent-strong/30 underline-offset-[3px] ' +
  'transition-colors duration-150 hover:decoration-accent-strong';

/** Inline link inside running text. Uses client-side navigation for internal paths. */
export function TextLink({ className, ...props }: LinkProps) {
  return <Link className={cn(textLinkClasses, className)} {...props} />;
}

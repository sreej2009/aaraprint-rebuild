import { Badge } from '@/design-system';
import { colorGroups, colorTokens, contrastRequirements, typeScale } from '@/design-system/tokens';
import { cn } from '@/lib/cn';
import { contrastRatio } from '@/lib/contrast';
import { DocsSection, Example } from './docs-layout';

export function ColorFoundations() {
  return (
    <DocsSection
      id="colour"
      title="Colour"
      description="A light, quiet palette with one accent. Every text pairing below is checked against WCAG 2.2 AA in the test suite."
    >
      {colorGroups.map((group) => (
        <Example key={group.name} title={group.name} note={group.description}>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {group.tokens.map((token) => {
              const hex = colorTokens[token];
              return (
                <li key={token} className="flex items-center gap-3">
                  <span className="size-12 shrink-0 rounded-md border border-border shadow-1" style={{ backgroundColor: hex }} />
                  <span className="flex min-w-0 flex-col">
                    <code className="truncate font-mono text-caption font-semibold text-fg">{token}</code>
                    <span className="font-mono text-caption text-fg-muted uppercase">{hex}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Example>
      ))}

      <Example title="Contrast checks" note="Ratios computed live from the tokens.">
        {/* Scrollable regions must be keyboard-reachable so the table can be scrolled on narrow screens (WCAG 2.1.1). */}
        {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
        <section aria-label="Contrast checks" tabIndex={0} className="-mx-1 overflow-x-auto rounded-sm">
          <table className="w-full min-w-[36rem] border-collapse text-left text-body-sm">
            <thead>
              <tr className="border-b border-border text-caption text-fg-muted">
                <th scope="col" className="px-1 py-2 font-semibold">Sample</th>
                <th scope="col" className="px-1 py-2 font-semibold">Pair</th>
                <th scope="col" className="px-1 py-2 font-semibold">Use</th>
                <th scope="col" className="px-1 py-2 text-right font-semibold">Ratio</th>
              </tr>
            </thead>
            <tbody>
              {contrastRequirements.map(({ foreground, background, minimum, usage }) => {
                const ratio = contrastRatio(colorTokens[foreground], colorTokens[background]);
                const pass = ratio >= minimum;
                return (
                  <tr key={`${foreground}-${background}`} className="border-b border-border last:border-0">
                    <td className="px-1 py-2">
                      <span
                        className="inline-grid h-8 w-12 place-items-center rounded-sm border border-border font-semibold"
                        style={{ color: colorTokens[foreground], backgroundColor: colorTokens[background] }}
                      >
                        {minimum === 3 ? '■' : 'Aa'}
                      </span>
                    </td>
                    <td className="px-1 py-2 font-mono text-caption text-fg">
                      {foreground} / {background}
                    </td>
                    <td className="px-1 py-2 text-fg-muted">{usage}</td>
                    <td className="px-1 py-2 text-right">
                      <Badge tone={pass ? 'success' : 'danger'}>
                        {ratio.toFixed(2)}:1 {pass ? (minimum === 3 ? '≥3' : 'AA') : 'fail'}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </Example>
    </DocsSection>
  );
}

export function TypeFoundations() {
  return (
    <DocsSection id="typography" title="Typography" description="Inter for interface and body text, Manrope for headings. Prices use tabular figures so they don’t shift as options change.">
      <Example title="Type scale">
        <ul className="flex flex-col divide-y divide-border">
          {typeScale.map(({ token, size, lineHeight, usage, sample }) => (
            <li key={token} className="grid gap-2 py-4 first:pt-0 last:pb-0 md:grid-cols-[12rem_1fr] md:items-baseline">
              <span className="flex flex-col">
                <code className="font-mono text-caption font-semibold text-fg">{token}</code>
                <span className="text-caption text-fg-muted">
                  {size} / {lineHeight} · {usage}
                </span>
              </span>
              <span
                className={cn(
                  token,
                  'text-fg',
                  ['text-display', 'text-h1', 'text-h2', 'text-h3'].includes(token) ? 'font-display font-bold' : 'font-sans',
                )}
              >
                {sample}
              </span>
            </li>
          ))}
        </ul>
      </Example>
    </DocsSection>
  );
}

const spacing = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24];
const radii = [
  { token: 'rounded-sm', value: '6px', use: 'Chips, inputs' },
  { token: 'rounded-md', value: '10px', use: 'Cards, buttons' },
  { token: 'rounded-lg', value: '16px', use: 'Modals, sheets' },
  { token: 'rounded-full', value: 'pill', use: 'Badges, search' },
];
const shadows = [
  { token: 'shadow-1', use: 'Raised controls, hover' },
  { token: 'shadow-2', use: 'Popovers, menus' },
  { token: 'shadow-3', use: 'Dialogs, sheets' },
];

export function LayoutFoundations() {
  return (
    <DocsSection
      id="layout"
      title="Spacing, shape & elevation"
      description="A 4px spacing grid, three radii and three shadow levels. Cards are flat with a border; elevation appears on interaction."
    >
      <Example title="Spacing" note="Tailwind spacing units × 4px">
        <ul className="flex flex-col gap-2">
          {spacing.map((step) => (
            <li key={step} className="flex items-center gap-4">
              <code className="w-14 font-mono text-caption text-fg-muted">{step * 4}px</code>
              <span className="h-3 rounded-full bg-accent" style={{ width: `${step * 4}px` }} />
            </li>
          ))}
        </ul>
      </Example>
      <div className="grid gap-6 md:grid-cols-2">
        <Example title="Radius">
          <ul className="grid grid-cols-2 gap-4">
            {radii.map(({ token, value, use }) => (
              <li key={token} className="flex flex-col gap-2">
                <span className={cn('h-16 border border-border-strong bg-accent-soft', token)} />
                <span className="text-caption">
                  <code className="font-mono font-semibold text-fg">{token}</code> <span className="text-fg-muted">· {value} · {use}</span>
                </span>
              </li>
            ))}
          </ul>
        </Example>
        <Example title="Elevation" className="bg-surface-subtle">
          <ul className="grid grid-cols-3 gap-4">
            {shadows.map(({ token, use }) => (
              <li key={token} className="flex flex-col gap-2">
                <span className={cn('h-16 rounded-md bg-surface', token)} />
                <span className="text-caption">
                  <code className="font-mono font-semibold text-fg">{token}</code>
                  <span className="block text-fg-muted">{use}</span>
                </span>
              </li>
            ))}
          </ul>
        </Example>
      </div>
      <Example title="Breakpoints" note="Mobile first; Studio switches layout at md and xl">
        <ul className="grid gap-2 text-body-sm sm:grid-cols-2 lg:grid-cols-5">
          {[
            ['base', '< 640px', 'Phones: one column, bottom sheets'],
            ['sm', '≥ 640px', 'Large phones: 2-up grids'],
            ['md', '≥ 768px', 'Tablets: header search, Studio rail'],
            ['lg', '≥ 1024px', 'Laptops: desktop nav, filter sidebar'],
            ['xl', '≥ 1280px', 'Desktops: full Studio layout'],
          ].map(([name, width, use]) => (
            <li key={name} className="rounded-sm bg-surface-subtle p-3">
              <code className="font-mono font-semibold text-fg">{name}</code> <span className="text-fg-muted">{width}</span>
              <span className="mt-1 block text-caption text-fg-muted">{use}</span>
            </li>
          ))}
        </ul>
      </Example>
    </DocsSection>
  );
}

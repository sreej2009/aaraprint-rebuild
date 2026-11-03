/**
 * Colour tokens mirrored from src/styles/theme.css for documentation and tests.
 * tokens.test.ts fails if the two drift apart, and checks every contrast pair below.
 */
export const colorTokens = {
  surface: '#ffffff',
  'surface-subtle': '#f5f6f8',
  'surface-sunken': '#eef0f3',
  'surface-inverse': '#171c26',
  fg: '#171c26',
  'fg-muted': '#626a7a',
  'fg-subtle': '#8b93a1',
  'fg-inverse': '#ffffff',
  'fg-on-accent': '#ffffff',
  accent: '#635bff',
  'accent-hover': '#5249e8',
  'accent-active': '#4b43d6',
  'accent-strong': '#4b43d6',
  'accent-soft': '#efeeff',
  'accent-soft-hover': '#e4e2ff',
  success: '#20b486',
  'success-strong': '#0a7454',
  'success-soft': '#e7f6f0',
  warning: '#e8930c',
  'warning-strong': '#a14a07',
  'warning-soft': '#fef3c7',
  danger: '#c8283b',
  'danger-hover': '#b0202f',
  'danger-soft': '#fdecee',
  border: '#e6e8ed',
  'border-strong': '#848c9a',
  'border-hover': '#626a7a',
  'guide-trim': '#171c26',
  'guide-bleed': '#e5484d',
  'guide-safe': '#0b7f5c',
  'guide-snap': '#f23da4',
} as const;

export type ColorToken = keyof typeof colorTokens;

export const colorGroups: { name: string; description: string; tokens: ColorToken[] }[] = [
  { name: 'Surfaces', description: 'Page, section and well backgrounds.', tokens: ['surface', 'surface-subtle', 'surface-sunken', 'surface-inverse'] },
  { name: 'Text & icons', description: 'Muted text passes AA on every surface; subtle is for disabled text only.', tokens: ['fg', 'fg-muted', 'fg-subtle', 'fg-on-accent'] },
  {
    name: 'Accent',
    description: 'One action colour. Use accent-strong for accent-coloured text.',
    tokens: ['accent', 'accent-hover', 'accent-strong', 'accent-soft', 'accent-soft-hover'],
  },
  {
    name: 'Status',
    description: 'Base values are fills and icons; -strong values are for text; -soft values are backgrounds.',
    tokens: ['success', 'success-strong', 'success-soft', 'warning', 'warning-strong', 'warning-soft', 'danger', 'danger-soft'],
  },
  { name: 'Borders', description: 'Decorative borders, and ≥3:1 borders for form controls.', tokens: ['border', 'border-strong', 'border-hover'] },
  { name: 'Studio guides', description: 'Trim, bleed, safe zone and snapping guides in the Design Studio.', tokens: ['guide-trim', 'guide-bleed', 'guide-safe', 'guide-snap'] },
];

export interface ContrastRequirement {
  foreground: ColorToken;
  background: ColorToken;
  /** 4.5 = body text (WCAG 1.4.3), 3 = large text / UI components (1.4.11). */
  minimum: number;
  usage: string;
}

export const contrastRequirements: ContrastRequirement[] = [
  { foreground: 'fg', background: 'surface', minimum: 4.5, usage: 'Body text' },
  { foreground: 'fg', background: 'surface-sunken', minimum: 4.5, usage: 'Text in wells' },
  { foreground: 'fg-muted', background: 'surface', minimum: 4.5, usage: 'Secondary text' },
  { foreground: 'fg-muted', background: 'surface-subtle', minimum: 4.5, usage: 'Secondary text on sections' },
  { foreground: 'fg-muted', background: 'surface-sunken', minimum: 4.5, usage: 'Secondary text in wells' },
  { foreground: 'fg-on-accent', background: 'accent', minimum: 4.5, usage: 'Primary button label' },
  { foreground: 'fg-on-accent', background: 'accent-hover', minimum: 4.5, usage: 'Primary button hover' },
  { foreground: 'accent-strong', background: 'surface', minimum: 4.5, usage: 'Links' },
  { foreground: 'accent-strong', background: 'accent-soft', minimum: 4.5, usage: 'Selected chip and soft button' },
  { foreground: 'success-strong', background: 'surface', minimum: 4.5, usage: 'Success text' },
  { foreground: 'success-strong', background: 'success-soft', minimum: 4.5, usage: 'Success badge' },
  { foreground: 'warning-strong', background: 'surface', minimum: 4.5, usage: 'Warning text' },
  { foreground: 'warning-strong', background: 'warning-soft', minimum: 4.5, usage: 'Warning badge' },
  { foreground: 'danger', background: 'surface', minimum: 4.5, usage: 'Error text' },
  { foreground: 'danger', background: 'danger-soft', minimum: 4.5, usage: 'Error badge' },
  { foreground: 'fg-on-accent', background: 'danger', minimum: 4.5, usage: 'Destructive button label' },
  { foreground: 'fg-inverse', background: 'surface-inverse', minimum: 4.5, usage: 'Tooltip text' },
  { foreground: 'border-strong', background: 'surface', minimum: 3, usage: 'Form control border' },
  { foreground: 'border-strong', background: 'surface-subtle', minimum: 3, usage: 'Form control border on sections' },
  { foreground: 'accent', background: 'surface', minimum: 3, usage: 'Focus ring and selected outline' },
  { foreground: 'accent', background: 'surface-subtle', minimum: 3, usage: 'Focus ring on sections' },
];

export const typeScale: { token: string; size: string; lineHeight: string; usage: string; sample: string }[] = [
  { token: 'text-display', size: '36–56px (fluid)', lineHeight: '1.1', usage: 'Home hero only', sample: 'Print that feels personal' },
  { token: 'text-h1', size: '28–32px (fluid)', lineHeight: '1.2', usage: 'Page titles', sample: 'Classic visiting cards' },
  { token: 'text-h2', size: '24px', lineHeight: '1.3', usage: 'Section titles', sample: 'Quantity and pricing' },
  { token: 'text-h3', size: '18px', lineHeight: '1.4', usage: 'Card and panel titles', sample: 'Print specifications' },
  { token: 'text-lead', size: '18px', lineHeight: '1.6', usage: 'Intro paragraphs', sample: 'Design online, see exactly what will print, and pay on delivery.' },
  { token: 'text-body', size: '16px', lineHeight: '1.6', usage: 'Body text, inputs', sample: 'Most orders go to print within 24–48 hours.' },
  { token: 'text-body-sm', size: '14px', lineHeight: '1.5', usage: 'UI labels, tables', sample: 'Dispatch in 2–3 days' },
  { token: 'text-caption', size: '12px', lineHeight: '1.4', usage: 'Badges, helper text', sample: '₹1.52 per card · Save 33%' },
];

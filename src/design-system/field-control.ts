import { createContext, use } from 'react';

interface FieldContextValue {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
  disabled: boolean;
}

export const FieldContext = createContext<FieldContextValue | null>(null);

interface ControlProps {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false' | 'grammar' | 'spelling';
  required?: boolean;
  disabled?: boolean;
}

/** Merge the surrounding Field's id/description/state into a control's props. */
export function useFieldControl<P extends ControlProps>(props: P): P & ControlProps {
  const field = use(FieldContext);
  if (!field) return props;
  const describedBy = [field.describedBy, props['aria-describedby']].filter(Boolean).join(' ') || undefined;
  return {
    ...props,
    id: props.id ?? field.id,
    'aria-describedby': describedBy,
    'aria-invalid': props['aria-invalid'] ?? (field.invalid || undefined),
    required: props.required ?? (field.required || undefined),
    disabled: props.disabled ?? (field.disabled || undefined),
  };
}

import { Slider as SliderPrimitive } from 'radix-ui';
import { useId, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface SliderProps {
  label: ReactNode;
  /** Hide the visible label (it still names the slider). */
  hideLabel?: boolean;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  /** What screen readers say for a value, e.g. "80 percent". */
  valueText?: (value: number) => string;
  /** Every change while dragging or stepping with the keyboard. */
  onValueChange(value: number): void;
  /** The pointer was released, or a key press finished a step. */
  onValueCommit?: (value: number, info: { pointer: boolean }) => void;
  className?: string;
}

/**
 * A single-value slider (opacity in the Studio). Keyboard: arrows step, Page Up/Down step ×10,
 * Home/End jump to the ends. The thumb is 20 px with a mouse and 28 px on touch screens.
 */
export function Slider({ label, hideLabel = false, value, min = 0, max = 100, step = 1, disabled, valueText, onValueChange, onValueCommit, className }: SliderProps) {
  const id = useId();
  // Radix reports commits for pointer releases and key presses alike; editors treat a drag as
  // one gesture but merge key presses by time, so tell them apart.
  const pointerDown = useRef(false);
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <span id={id} className={cn('text-caption text-fg-muted', hideLabel && 'sr-only')}>
        {label}
      </span>
      <SliderPrimitive.Root
        aria-labelledby={id}
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onPointerDown={() => {
          pointerDown.current = true;
        }}
        onValueChange={([next]) => next !== undefined && onValueChange(next)}
        onValueCommit={([next]) => {
          const pointer = pointerDown.current;
          pointerDown.current = false;
          if (next !== undefined) onValueCommit?.(next, { pointer });
        }}
        className="relative flex h-5 w-full touch-none items-center select-none data-[disabled]:opacity-50 pointer-coarse:h-8"
      >
        <SliderPrimitive.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-surface-sunken">
          <SliderPrimitive.Range className="absolute h-full bg-accent" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          aria-labelledby={id}
          aria-valuetext={valueText?.(value)}
          className="block size-5 rounded-full border-2 border-accent bg-surface shadow-1 transition-shadow hover:shadow-2 data-[disabled]:cursor-not-allowed pointer-coarse:size-7"
        />
      </SliderPrimitive.Root>
    </div>
  );
}

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from './dialog';
import { Field } from './field';
import { IconToggle } from './icon-toggle';
import { Input } from './input';
import { NumberField } from './number-field';
import { formatNumber, parseNumber } from './number-format';
import { OptionChips } from './option-chips';
import { QuantityStepper } from './quantity-stepper';
import { QuantityTiers } from './quantity-tiers';
import { Slider } from './slider';

describe('Button', () => {
  it('defaults to type="button" so it never submits forms by accident', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');
  });

  it('keeps its accessible name and blocks clicks while loading', async () => {
    const onClick = vi.fn<() => void>();
    render(
      <Button loading onClick={onClick}>
        Place order
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Place order' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Field', () => {
  it('connects the label, hint and error to the control', () => {
    render(
      <Field label="PIN code" hint="Six digits" error="Enter a 6-digit PIN code.">
        <Input />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: 'PIN code' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Six digits Enter a 6-digit PIN code.');
  });
});

function ChipsHarness({ onChange = () => {} }: { onChange?: (v: string) => void }) {
  const [value, setValue] = useState('matte');
  return (
    <OptionChips
      label="Finish"
      value={value}
      onValueChange={(v) => {
        setValue(v);
        onChange(v);
      }}
      options={[
        { value: 'matte', label: 'Matte' },
        { value: 'gloss', label: 'Gloss', priceDeltaCents: 800 },
        { value: 'foil', label: 'Gold foil', unavailableReason: 'Out of stock' },
      ]}
    />
  );
}

describe('OptionChips', () => {
  it('is a labelled radio group showing price differences', () => {
    render(<ChipsHarness />);
    expect(screen.getByRole('radiogroup', { name: 'Finish' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Matte' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Gloss +₹8' })).not.toBeChecked();
  });

  it('selects with arrow keys', async () => {
    const user = userEvent.setup();
    render(<ChipsHarness />);
    screen.getByRole('radio', { name: 'Matte' }).focus();
    // Radix moves roving focus asynchronously and checks the radio while the arrow key is down.
    await user.keyboard('{ArrowRight>}');
    await waitFor(() => expect(screen.getByRole('radio', { name: /Gloss/ })).toBeChecked());
    await user.keyboard('{/ArrowRight}');
  });

  it('keeps unavailable options focusable but never selects them', async () => {
    const onChange = vi.fn<(value: string) => void>();
    const user = userEvent.setup();
    render(<ChipsHarness onChange={onChange} />);
    const foil = screen.getByRole('radio', { name: /Gold foil.*Out of stock/ });
    expect(foil).toHaveAttribute('aria-disabled', 'true');
    await user.click(foil);
    expect(foil).not.toBeChecked();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: 'Matte' })).toBeChecked();
  });
});

describe('QuantityTiers', () => {
  it('shows total, per-unit price and saving for each tier', () => {
    render(
      <QuantityTiers
        label="Quantity"
        unitLabel="card"
        value="250"
        onValueChange={() => {}}
        options={[
          { value: '100', label: '100 cards', quantity: 100, totalCents: 22900, unitCents: 229 },
          { value: '250', label: '250 cards', quantity: 250, totalCents: 37900, unitCents: 151.6, savingsPercent: 33 },
        ]}
      />,
    );
    const tier = screen.getByRole('radio', { name: /250 cards/ });
    expect(tier).toBeChecked();
    expect(tier).toHaveTextContent('₹379');
    expect(tier).toHaveTextContent('₹1.52 / card');
    expect(tier).toHaveTextContent('Save 33%');
  });
});

function StepperHarness() {
  const [value, setValue] = useState(1);
  return <QuantityStepper label="Number of sets" value={value} onValueChange={setValue} min={1} max={10} />;
}

describe('QuantityStepper', () => {
  it('follows the spinbutton pattern', async () => {
    const user = userEvent.setup();
    render(<StepperHarness />);
    const input = screen.getByRole('spinbutton', { name: 'Number of sets' });
    expect(input).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByRole('button', { name: 'Decrease number of sets' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Increase number of sets' }));
    expect(input).toHaveAttribute('aria-valuenow', '2');

    input.focus();
    await user.keyboard('{End}');
    expect(input).toHaveAttribute('aria-valuenow', '10');
    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-valuenow', '9');
  });

  it('clamps typed values on blur', async () => {
    const user = userEvent.setup();
    render(<StepperHarness />);
    const input = screen.getByRole('spinbutton', { name: 'Number of sets' });
    await user.clear(input);
    await user.type(input, '75');
    await user.tab();
    expect(input).toHaveAttribute('aria-valuenow', '10');
  });
});

describe('Dialog', () => {
  it('moves focus inside, closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger asChild>
          <Button>Rename design</Button>
        </DialogTrigger>
        <DialogContent title="Rename design" footer={<DialogClose asChild><Button>Done</Button></DialogClose>}>
          <Field label="Design name">
            <Input defaultValue="Card" />
          </Field>
        </DialogContent>
      </Dialog>,
    );
    const trigger = screen.getByRole('button', { name: 'Rename design' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Rename design' });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe('NumberField', () => {
  function Harness({ onCommit, ...props }: { onCommit: (value: number, info: { step: boolean }) => void; min?: number; max?: number; wrap?: boolean; decimals?: number; step?: number }) {
    const [value, setValue] = useState(10);
    return (
      <NumberField
        label="W"
        accessibleLabel="W, width"
        unit="mm"
        value={value}
        {...props}
        onCommit={(next, info) => {
          setValue(next);
          onCommit(next, info);
        }}
      />
    );
  }

  it('commits typed values on Enter or blur, once, and ignores text that isn’t a number', async () => {
    const onCommit = vi.fn<(value: number, info: { step: boolean }) => void>();
    const user = userEvent.setup();
    render(<Harness onCommit={onCommit} />);
    const input = screen.getByRole('textbox', { name: 'W, width' });
    await user.clear(input);
    await user.type(input, '12,46{Enter}');
    expect(onCommit).toHaveBeenLastCalledWith(12.5, { step: false });
    expect(input).toHaveValue('12.5');
    await user.clear(input);
    await user.type(input, '12.5 mm');
    await user.tab();
    expect(onCommit).toHaveBeenCalledTimes(1); // same value: nothing to commit
    await user.clear(input);
    await user.type(input, 'twelve{Enter}');
    expect(input).toHaveValue('12.5');
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('steps with the arrow keys (Shift ×10) and clamps; Escape restores', async () => {
    const onCommit = vi.fn<(value: number, info: { step: boolean }) => void>();
    const user = userEvent.setup();
    render(<Harness onCommit={onCommit} min={0} max={11} />);
    const input = screen.getByRole('textbox', { name: 'W, width' });
    await user.click(input);
    await user.keyboard('{ArrowUp}');
    expect(onCommit).toHaveBeenLastCalledWith(10.1, { step: true });
    await user.keyboard('{Shift>}{ArrowUp}{/Shift}');
    expect(input).toHaveValue('11');
    await user.keyboard('{Shift>}{ArrowUp}{/Shift}'); // already at the maximum
    expect(onCommit).toHaveBeenCalledTimes(2);
    await user.clear(input);
    await user.type(input, '3{Escape}');
    expect(input).toHaveValue('11');
  });

  it('wraps angles and offers − / + buttons with names', async () => {
    const onCommit = vi.fn<(value: number, info: { step: boolean }) => void>();
    const user = userEvent.setup();
    render(<Harness onCommit={onCommit} min={0} max={360} wrap decimals={0} step={1} />);
    await user.clear(screen.getByRole('textbox', { name: 'W, width' }));
    await user.type(screen.getByRole('textbox', { name: 'W, width' }), '-30{Enter}');
    expect(onCommit).toHaveBeenLastCalledWith(330, { step: false });
    await user.click(screen.getByRole('button', { name: 'Increase W, width' }));
    expect(onCommit).toHaveBeenLastCalledWith(331, { step: true });
  });

  it('parses and formats numbers without noise', () => {
    expect(parseNumber(' 12,5 mm')).toBe(12.5);
    expect(parseNumber('-.5')).toBe(-0.5);
    expect(parseNumber('45°')).toBe(45);
    expect(parseNumber('1.2.3')).toBeNull();
    expect(parseNumber('')).toBeNull();
    expect(formatNumber(-0.04)).toBe('0');
    expect(formatNumber(12.349)).toBe('12.3');
    expect(formatNumber(7, 0)).toBe('7');
  });
});

describe('Slider and IconToggle', () => {
  it('slider: keyboard steps, a spoken value and a label', async () => {
    const onChange = vi.fn<(value: number) => void>();
    const onCommit = vi.fn<(value: number, info: { pointer: boolean }) => void>();
    function Harness() {
      const [value, setValue] = useState(50);
      return (
        <Slider
          label="Opacity"
          value={value}
          valueText={(v) => `${v} percent`}
          onValueChange={(v) => {
            setValue(v);
            onChange(v);
          }}
          onValueCommit={onCommit}
        />
      );
    }
    const user = userEvent.setup();
    render(<Harness />);
    const slider = screen.getByRole('slider', { name: 'Opacity' });
    slider.focus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith(51);
    expect(onCommit).toHaveBeenLastCalledWith(51, { pointer: false });
    expect(slider).toHaveAttribute('aria-valuetext', '51 percent');
  });

  it('icon toggle: a stable name with aria-pressed', async () => {
    function Harness() {
      const [pressed, setPressed] = useState(false);
      return <IconToggle label="Keep proportions" icon={<span>off</span>} pressedIcon={<span>on</span>} pressed={pressed} onPressedChange={setPressed} tooltip={false} />;
    }
    const user = userEvent.setup();
    render(<Harness />);
    const toggle = screen.getByRole('button', { name: 'Keep proportions' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle).toHaveTextContent('on');
  });
});

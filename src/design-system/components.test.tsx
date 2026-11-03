import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from './dialog';
import { Field } from './field';
import { Input } from './input';
import { OptionChips } from './option-chips';
import { QuantityStepper } from './quantity-stepper';
import { QuantityTiers } from './quantity-tiers';

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

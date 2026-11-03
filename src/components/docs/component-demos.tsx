import {
  ArrowRight,
  Copy,
  Download,
  Ellipsis,
  Heart,
  Inbox,
  Info,
  Pencil,
  Redo2,
  ShoppingBag,
  SlidersHorizontal,
  Trash,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  Accordion,
  AccordionItem,
  Badge,
  Breadcrumbs,
  Button,
  Callout,
  Card,
  Checkbox,
  ColorSwatches,
  ConfirmDialog,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Field,
  IconButton,
  Input,
  NativeSelect,
  OptionChips,
  OptionTiles,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Price,
  ProgressBar,
  QuantityStepper,
  QuantityTiers,
  RadioGroup,
  SegmentedControl,
  Select,
  Sheet,
  SheetContent,
  SheetTrigger,
  Skeleton,
  Spinner,
  StatusPill,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
  type ColorOption,
  type OrderStatus,
  type TileOption,
} from '@/design-system';
import type { Product } from '@/lib/catalogue/types';
import { formatINR } from '@/lib/format';
import { mediaUrl } from '@/lib/media';
import { defaultSelection, quantityGroup, quantityTiers, resolveVariant, type Selection } from '@/lib/pricing';
import { DocsSection, Example } from './docs-layout';

// ----------------------------------------------------------------- Buttons

export function ButtonsDemo() {
  const [loading, setLoading] = useState(false);
  return (
    <DocsSection id="buttons" title="Buttons" description="One primary action per view. Medium buttons are 44px tall to meet touch-target guidance.">
      <Example title="Variants">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Add to cart</Button>
          <Button variant="secondary">Save for later</Button>
          <Button variant="soft">Use this template</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="danger">Delete design</Button>
        </div>
      </Example>
      <Example title="Sizes, icons and links">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button>Medium</Button>
          <Button size="lg">
            Start designing <ArrowRight aria-hidden="true" />
          </Button>
          <Button variant="secondary">
            <Heart aria-hidden="true" /> Save
          </Button>
          <Button asChild variant="secondary">
            <Link to="/">Link styled as a button</Link>
          </Button>
        </div>
      </Example>
      <Example title="States" note="Loading keeps the width and blocks repeat clicks">
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled>Disabled</Button>
          <Button variant="secondary" disabled>
            Disabled
          </Button>
          <Button
            loading={loading}
            onClick={() => {
              setLoading(true);
              window.setTimeout(() => setLoading(false), 1600);
            }}
          >
            Place order
          </Button>
        </div>
      </Example>
      <Example title="Icon buttons" note="Hover or focus for the tooltip with shortcut">
        <div className="flex flex-wrap items-center gap-1">
          <IconButton label="Undo" shortcut="Ctrl Z" icon={<Undo2 />} />
          <IconButton label="Redo" shortcut="Ctrl Shift Z" icon={<Redo2 />} />
          <IconButton label="Zoom out" shortcut="Ctrl −" icon={<ZoomOut />} />
          <IconButton label="Zoom in" shortcut="Ctrl +" icon={<ZoomIn />} />
          <IconButton label="Delete" shortcut="Del" icon={<Trash />} variant="secondary" />
          <IconButton label="Add to cart" icon={<ShoppingBag />} variant="primary" />
        </div>
      </Example>
    </DocsSection>
  );
}

// ------------------------------------------------------------------- Forms

export function FormsDemo() {
  const [guides, setGuides] = useState(true);
  const [sort, setSort] = useState('recommended');
  return (
    <DocsSection id="forms" title="Form controls" description="Every control sits in a Field that connects its label, hint and error for assistive technology.">
      <div className="grid gap-6 lg:grid-cols-2">
        <Example title="Text fields">
          <div className="flex flex-col gap-5">
            <Field label="Email" hint="We’ll send your order confirmation here.">
              <Input type="email" autoComplete="email" placeholder="you@company.in" />
            </Field>
            <Field label="PIN code" error="Enter a 6-digit PIN code.">
              <Input inputMode="numeric" defaultValue="5600" maxLength={6} />
            </Field>
            <Field label="Company name" optional>
              <Input />
            </Field>
            <Field label="Order number" disabled>
              <Input defaultValue="NX261023-C8883A" />
            </Field>
            <Field label="Note for our print team" optional>
              <Textarea placeholder="Anything we should check before printing?" />
            </Field>
          </div>
        </Example>
        <div className="flex flex-col gap-6">
          <Example title="Selects">
            <div className="flex flex-col gap-5">
              <Field label="State">
                <NativeSelect defaultValue="KA">
                  <option value="KA">Karnataka</option>
                  <option value="MH">Maharashtra</option>
                  <option value="TN">Tamil Nadu</option>
                  <option value="DL">Delhi</option>
                </NativeSelect>
              </Field>
              <Field label="Sort products">
                <Select
                  value={sort}
                  onValueChange={setSort}
                  options={[
                    { value: 'recommended', label: 'Recommended' },
                    { value: 'price-asc', label: 'Price: low to high' },
                    { value: 'price-desc', label: 'Price: high to low' },
                    { value: 'newest', label: 'Newest' },
                  ]}
                />
              </Field>
            </div>
          </Example>
          <Example title="Choices and toggles">
            <div className="flex flex-col gap-5">
              <Checkbox label="Same design on both sides" description="Copies the front to the back. You can still edit each side." defaultChecked />
              <Checkbox label="All products" checked="indeterminate" />
              <Switch label="Show print guides" description="Trim, bleed and safe-zone lines in the Studio." checked={guides} onCheckedChange={setGuides} />
              <RadioGroup
                label="Payment method"
                variant="cards"
                defaultValue="cod"
                options={[
                  { value: 'cod', label: 'Pay on delivery', description: 'Pay the courier in cash or UPI when your order arrives.' },
                  { value: 'online', label: 'Pay online', description: 'UPI, cards and netbanking — coming later.', disabled: true },
                ]}
              />
            </div>
          </Example>
        </div>
      </div>
    </DocsSection>
  );
}

// --------------------------------------------------------- Product options

const shirtColours: ColorOption[] = [
  { value: 'white', label: 'White', hex: '#ffffff' },
  { value: 'black', label: 'Black', hex: '#171717' },
  { value: 'navy', label: 'Navy', hex: '#172554' },
  { value: 'bottle-green', label: 'Bottle green', hex: '#14532d' },
  { value: 'royal-blue', label: 'Royal blue', hex: '#2563eb', priceDeltaCents: 3000 },
  { value: 'maroon', label: 'Maroon', hex: '#7f1d1d', unavailableReason: 'Out of stock' },
  { value: 'sky-blue', label: 'Sky blue', hex: '#38bdf8' },
];

const lidTypes: TileOption[] = [
  { value: 'flip', label: 'Flip cap', description: 'One-hand opening', imageSrc: mediaUrl('products/drinkware-2d/drinkware-bottle-cello-swift-flip-front.png') },
  { value: 'screw', label: 'Screw cap', description: 'Leak-proof seal', imageSrc: mediaUrl('products/drinkware-2d/drinkware-bottle-cello-swift-screw-front.png') },
  {
    value: 'sipper',
    label: 'Sipper',
    description: 'Built-in straw',
    priceDeltaCents: 4000,
    imageSrc: mediaUrl('products/drinkware-2d/drinkware-bottle-cello-swift-sipper-front.png'),
  },
];

export function OptionsDemo({ product }: { product: Product | null }) {
  const [selection, setSelection] = useState<Selection>(() => (product ? defaultSelection(product) : {}));
  const [sets, setSets] = useState(1);
  const [colour, setColour] = useState('navy');
  const [lid, setLid] = useState('flip');
  const [finish, setFinish] = useState('matte');

  const qtyGroup = product ? quantityGroup(product) : undefined;
  const inkGroup = product?.optionGroups.find((group) => group.id !== qtyGroup?.id);
  const tiers = useMemo(() => (product ? quantityTiers(product, selection) : []), [product, selection]);
  const variant = product ? resolveVariant(product, selection) : undefined;

  return (
    <DocsSection
      id="options"
      title="Product options"
      description="Single-select groups with radio semantics: arrow keys move between options. Unavailable options stay focusable and say why."
    >
      {product && qtyGroup && inkGroup ? (
        <Example title={`Live data: ${product.name}`} note="Loaded through the catalogue API (mock data from the recovered site)">
          <div className="flex flex-col gap-6">
            <OptionChips
              label={inkGroup.name}
              value={selection[inkGroup.id]}
              onValueChange={(value) => setSelection((s) => ({ ...s, [inkGroup.id]: value }))}
              options={inkGroup.values.map((v) => ({ value: v.id, label: v.label, priceDeltaCents: v.priceDeltaCents }))}
            />
            <QuantityTiers
              label="Quantity"
              hint="Larger quantities cost less per card."
              unitLabel="card"
              value={selection[qtyGroup.id]}
              onValueChange={(value) => setSelection((s) => ({ ...s, [qtyGroup.id]: value }))}
              options={tiers.map((tier) => ({
                value: tier.valueId,
                label: tier.label,
                quantity: tier.quantity,
                totalCents: tier.totalCents,
                unitCents: tier.unitCents,
                savingsPercent: tier.savingsPercent,
                unavailableReason: tier.available ? undefined : 'Unavailable',
              }))}
            />
            <div className="flex flex-wrap items-end justify-between gap-6 border-t border-border pt-5">
              <QuantityStepper label="Number of sets" value={sets} onValueChange={setSets} min={1} max={50} />
              <div className="flex flex-col items-end gap-1" aria-live="polite">
                <span className="text-caption text-fg-muted">Your price · {variant?.sku}</span>
                <Price amount={(variant?.priceCents ?? 0) * sets} size="lg" suffix="incl. print" />
              </div>
            </div>
          </div>
        </Example>
      ) : (
        <Callout tone="warning" title="Catalogue data unavailable">
          Run <code className="font-mono">npm run data:import</code> to generate the mock catalogue, then reload.
        </Callout>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Example title="Colour swatches">
          <ColorSwatches label="Shirt colour" value={colour} onValueChange={setColour} options={shirtColours} />
        </Example>
        <Example title="Chips with an unavailable option">
          <OptionChips
            label="Finish"
            value={finish}
            onValueChange={setFinish}
            options={[
              { value: 'matte', label: 'Matte' },
              { value: 'gloss', label: 'Gloss' },
              { value: 'velvet', label: 'Velvet touch', priceDeltaCents: 12000 },
              { value: 'foil', label: 'Gold foil', priceDeltaCents: 25000, unavailableReason: 'Back in stock Monday' },
            ]}
          />
        </Example>
      </div>
      <Example title="Image tiles" note="Studio mockups served from the recovered assets">
        <OptionTiles label="Lid type" value={lid} onValueChange={setLid} options={lidTypes} />
      </Example>
      <Example title="Prices">
        <div className="flex flex-wrap items-baseline gap-8">
          <Price amount={22900} prefix="from" />
          <Price amount={89900} compareAt={119900} size="lg" />
          <Price amount={229} suffix="/ card" size="sm" />
        </div>
      </Example>
    </DocsSection>
  );
}

// ---------------------------------------------------------------- Feedback

const statuses: OrderStatus[] = ['awaiting_payment', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];

export function FeedbackDemo() {
  const subtotal = 157900;
  const threshold = 199900;
  return (
    <DocsSection id="feedback" title="Status & feedback" description="Status always pairs colour with an icon and text. Inline callouts carry anything a user must not miss.">
      <div className="grid gap-6 lg:grid-cols-2">
        <Example title="Badges">
          <div className="flex flex-wrap gap-2">
            <Badge>Customisable</Badge>
            <Badge tone="accent">New</Badge>
            <Badge tone="success">Save 33%</Badge>
            <Badge tone="warning">Low resolution</Badge>
            <Badge tone="danger">Out of stock</Badge>
          </div>
        </Example>
        <Example title="Order status">
          <div className="flex flex-wrap gap-2">
            {statuses.map((status) => (
              <StatusPill key={status} status={status} />
            ))}
          </div>
        </Example>
      </div>
      <Example title="Callouts">
        <div className="grid gap-3 md:grid-cols-2">
          <Callout tone="info" title="Your design is saved on this device">
            Sign in to keep it in your account and open it anywhere.
          </Callout>
          <Callout tone="success" title="Print checks passed">
            Text is inside the safe zone and images print sharply.
          </Callout>
          <Callout tone="warning" title="1 image may print blurry" actions={<Button size="sm" variant="secondary">Replace image</Button>}>
            Front: about 142 DPI — we recommend at least 300 DPI.
          </Callout>
          <Callout tone="danger" title="Replace the sample text before ordering">
            “[Your Name]” is still on the back of your card.
          </Callout>
        </div>
      </Example>
      <div className="grid gap-6 lg:grid-cols-2">
        <Example title="Progress">
          <div className="flex flex-col gap-2">
            <p className="text-body-sm text-fg">
              Add <span className="font-semibold tabular-nums">{formatINR(threshold - subtotal)}</span> more for free shipping
            </p>
            <ProgressBar value={subtotal} max={threshold} label="Progress towards free shipping" />
          </div>
        </Example>
        <Example title="Loading">
          <div className="flex items-center gap-5">
            <Spinner label="Loading products" className="text-accent" />
            <div className="flex flex-1 items-center gap-3" aria-hidden="true">
              <Skeleton className="size-14 rounded-md" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          </div>
        </Example>
      </div>
      <Example title="Empty state" className="p-0">
        <EmptyState
          icon={Inbox}
          headingLevel={3}
          title="No saved designs yet"
          description="Designs you save in the Studio appear here, ready to edit or order."
          action={<Button>Start a design</Button>}
        />
      </Example>
    </DocsSection>
  );
}

// ---------------------------------------------------------------- Overlays

export function OverlaysDemo() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [filter, setFilter] = useState('all');
  return (
    <DocsSection
      id="overlays"
      title="Overlays"
      description="Dialogs centre on larger screens and become bottom sheets on phones. Focus is trapped inside, Esc closes, and focus returns to the trigger."
    >
      <Example title="Dialogs, sheets and menus">
        <div className="flex flex-wrap gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">Rename design</Button>
            </DialogTrigger>
            <DialogContent
              title="Rename design"
              description="Names help you find designs in your account."
              footer={
                <>
                  <DialogClose asChild>
                    <Button variant="secondary">Cancel</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button onClick={() => toast({ title: 'Design renamed', tone: 'success' })}>Save name</Button>
                  </DialogClose>
                </>
              }
            >
              <Field label="Design name">
                <Input defaultValue="Riya’s visiting card" />
              </Field>
            </DialogContent>
          </Dialog>

          <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
            Delete design…
          </Button>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            tone="danger"
            title="Delete this design?"
            description="“Riya’s visiting card” will be removed from your account. Orders already placed are not affected."
            confirmLabel="Delete design"
            onConfirm={() => toast({ title: 'Design deleted', action: { label: 'Undo', onClick: () => toast({ title: 'Design restored', tone: 'success' }) } })}
          />

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary">
                <ShoppingBag aria-hidden="true" /> Cart drawer
              </Button>
            </SheetTrigger>
            <SheetContent
              title="Your cart"
              footer={
                <Button fullWidth size="lg">
                  Checkout
                </Button>
              }
            >
              <div className="flex flex-col gap-4 p-5">
                <div className="flex flex-col gap-2 rounded-md bg-surface-subtle p-4">
                  <p className="text-body-sm text-fg">
                    Add <span className="font-semibold">{formatINR(42000)}</span> more for free shipping
                  </p>
                  <ProgressBar value={157900} max={199900} label="Progress towards free shipping" />
                </div>
                <Card padding="sm" className="flex items-center gap-3">
                  <Skeleton className="size-16 rounded-sm" />
                  <div className="flex flex-1 flex-col">
                    <span className="text-body-sm font-semibold text-fg">Classic visiting cards</span>
                    <span className="text-caption text-fg-muted">250 cards · Two-colour</span>
                  </div>
                  <Price amount={38700} size="sm" />
                </Card>
              </div>
            </SheetContent>
          </Sheet>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary">
                <SlidersHorizontal aria-hidden="true" /> Bottom sheet
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" title="Filter products" footer={<Button fullWidth>Show 24 products</Button>}>
              <div className="p-5">
                <OptionChips
                  label="Finish"
                  value={filter}
                  onValueChange={setFilter}
                  options={[
                    { value: 'all', label: 'All finishes' },
                    { value: 'matte', label: 'Matte' },
                    { value: 'gloss', label: 'Gloss' },
                    { value: 'textured', label: 'Textured' },
                  ]}
                />
              </div>
            </SheetContent>
          </Sheet>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost">
                <Info aria-hidden="true" /> Delivery estimate
              </Button>
            </PopoverTrigger>
            <PopoverContent>
              <p className="font-semibold">Delivery to 560001</p>
              <p className="mt-1 text-fg-muted">Dispatched in 2–3 days, delivered 3–6 business days after printing.</p>
            </PopoverContent>
          </Popover>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton label="Design actions" icon={<Ellipsis />} variant="secondary" tooltip={false} />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem icon={<Pencil />}>Rename</DropdownMenuItem>
              <DropdownMenuItem icon={<Copy />} shortcut="Ctrl D">
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem icon={<Download />}>Download proof</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={<Trash />} tone="danger" onSelect={() => setConfirmOpen(true)}>
                Delete…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Example>
      <Example title="Toasts" note="Confirm an action; never the only place an error appears">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => toast({ title: 'Added to cart', description: 'Classic visiting cards · 250 cards', tone: 'success' })}>
            Success
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast({ title: 'Element removed', action: { label: 'Undo', onClick: () => toast({ title: 'Element restored', tone: 'success' }) } })}
          >
            With undo
          </Button>
          <Button variant="secondary" onClick={() => toast({ title: 'Couldn’t save — retrying', description: 'Your changes are kept on this device.', tone: 'warning' })}>
            Warning
          </Button>
        </div>
      </Example>
    </DocsSection>
  );
}

// -------------------------------------------------------------- Navigation

function SegmentedDemo() {
  const [side, setSide] = useState('front');
  const [mode, setMode] = useState('2d');
  return (
    <div className="flex flex-wrap gap-6">
      <SegmentedControl label="Print side" value={side} onValueChange={setSide} options={[{ value: 'front', label: 'Front' }, { value: 'back', label: 'Back' }]} />
      <SegmentedControl label="Preview mode" value={mode} onValueChange={setMode} options={[{ value: '2d', label: '2D' }, { value: '3d', label: '3D' }]} />
    </div>
  );
}

export function NavigationDemo() {
  return (
    <DocsSection id="navigation" title="Navigation" description="Underline tabs for page sections, segmented tabs for compact view switches, and accordions for long reference content.">
      <Example title="Breadcrumbs">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Visiting Cards', href: '/categories/visiting-cards' }, { label: 'Classic Visiting Cards' }]} />
      </Example>
      <div className="grid gap-6 lg:grid-cols-2">
        <Example title="Tabs">
          <Tabs defaultValue="overview">
            <TabsList aria-label="Product information">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="specs">Print specifications</TabsTrigger>
              <TabsTrigger value="delivery">Delivery</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="text-body-sm text-fg-muted">
              A timeless single- or two-colour print on reliable 300gsm card stock.
            </TabsContent>
            <TabsContent value="specs" className="text-body-sm text-fg-muted">
              Finished size 8.9 × 5.1 cm, 1.5 mm bleed, keep text 2 mm inside the edge.
            </TabsContent>
            <TabsContent value="delivery" className="text-body-sm text-fg-muted">
              Dispatched in 2–3 days. Free shipping over ₹1,999.
            </TabsContent>
          </Tabs>
        </Example>
        <Example title="Segmented control" note="For view switches; use tabs when each option has its own panel">
          <SegmentedDemo />
        </Example>
      </div>
      <Example title="Accordion">
        <Accordion type="single" collapsible defaultValue="cancel">
          <AccordionItem value="guest" title="Can I order without creating an account?">
            Yes. Check out as a guest; an account just lets you save designs, track orders and reorder faster.
          </AccordionItem>
          <AccordionItem value="cancel" title="Can I cancel my order?">
            Yes, free of charge, while it is still Confirmed and hasn’t gone to print.
          </AccordionItem>
          <AccordionItem value="damaged" title="What if my order arrives damaged or incorrect?">
            Tell us within 7 days of delivery and we’ll reprint it free, or refund you if a reprint doesn’t fix it.
          </AccordionItem>
        </Accordion>
      </Example>
    </DocsSection>
  );
}

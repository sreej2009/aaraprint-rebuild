import { Building2, Clock, Mail, Scale, Truck } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { SupportEmail } from '@/components/content/prose';
import { Breadcrumbs, Callout, PageHeader, TextLink } from '@/design-system';
import { business } from '@/config/business';
import { seo } from '@/lib/seo';
import type { Route } from './+types/contact';

export const meta: Route.MetaFunction = ({ location }) =>
  seo({ title: 'Contact us', description: 'Questions about an order, a design or bulk pricing? Reach the Aaraprint team, or raise a grievance.', path: location.pathname });

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border p-5">
      <span className="grid size-10 place-items-center rounded-full bg-accent-soft text-accent-strong [&_svg]:size-5">{icon}</span>
      <h2 className="text-h3 font-semibold text-fg">{title}</h2>
      <div className="flex flex-col gap-1 text-body-sm text-fg-muted">{children}</div>
    </li>
  );
}

export default function Contact() {
  return (
    <div className="container-page flex flex-col gap-10 py-6 md:py-10">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Contact us' }]} />
      <PageHeader
        eyebrow="Contact"
        title="We’d love to hear from you"
        description="Questions about an order, a design or bulk pricing? A real person on our team will get back to you."
      />
      {import.meta.env.DEV && !business.supportEmail && (
        <Callout tone="warning" title="Support email not configured" className="max-w-reading">
          Set <code className="font-mono">VITE_SUPPORT_EMAIL</code> before launch. The original site only had a placeholder address.
        </Callout>
      )}
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card icon={<Mail />} title="Email us">
          <p>
            <SupportEmail />
          </p>
          <p>We reply {business.replyTime}.</p>
        </Card>
        <Card icon={<Truck />} title="Your orders">
          <p>
            <TextLink to="/track-order">Track an order</TextLink> with its number and your email.
          </p>
          <p>For anything else, include your order number when you write.</p>
        </Card>
        <Card icon={<Clock />} title="Hours">
          <p>{business.supportHours}</p>
          <p>Closed on public holidays.</p>
        </Card>
        <Card icon={<Building2 />} title="Bulk & business orders">
          <p>Ordering 500+ units for uniforms, welcome kits or events? Email us your quantities for volume pricing.</p>
        </Card>
      </ul>

      <section id="grievance" aria-labelledby="grievance-heading" className="flex max-w-reading scroll-mt-28 flex-col gap-4 rounded-lg bg-surface-subtle p-6">
        <div className="flex items-center gap-3">
          <Scale aria-hidden="true" className="size-6 text-accent-strong" />
          <h2 id="grievance-heading" className="text-h2 font-bold text-fg">
            Grievance redressal
          </h2>
        </div>
        <p className="text-body text-fg-muted">
          Not happy with how we’ve handled an order, a refund or your personal data? Write to our Grievance Officer at <SupportEmail />. We acknowledge every
          complaint within {business.grievance.acknowledgeHours} hours with a reference number, and resolve it within {business.grievance.resolveWithin}.
        </p>
        <p className="text-body text-fg-muted">
          You can also contact the National Consumer Helpline on <strong className="font-semibold text-fg">1915</strong> or at{' '}
          <a href="https://consumerhelpline.gov.in" className="font-medium text-accent-strong underline underline-offset-2" target="_blank" rel="noreferrer">
            consumerhelpline.gov.in
          </a>
          , or file a complaint at{' '}
          <a href="https://edaakhil.nic.in" className="font-medium text-accent-strong underline underline-offset-2" target="_blank" rel="noreferrer">
            edaakhil.nic.in
          </a>
          .
        </p>
        <p className="text-body-sm text-fg-muted">
          See also our <Link to="/privacy" className="underline underline-offset-2">Privacy policy</Link>, <Link to="/terms" className="underline underline-offset-2">Terms</Link> and{' '}
          <Link to="/refund-policy" className="underline underline-offset-2">Returns & refunds</Link>.
        </p>
      </section>
    </div>
  );
}

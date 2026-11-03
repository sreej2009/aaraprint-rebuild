export interface SiteLink {
  label: string;
  href: string;
}

export const helpLinks: SiteLink[] = [
  { label: 'Track an order', href: '/track-order' },
  { label: 'Shipping & delivery', href: '/shipping' },
  { label: 'Returns & reprints', href: '/refund-policy' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Contact us', href: '/contact' },
];

export const companyLinks: SiteLink[] = [
  { label: 'About Aaraprint', href: '/about' },
  { label: 'Bulk & business orders', href: '/contact' },
  { label: 'Grievance redressal', href: '/contact#grievance' },
  { label: 'Photo credits', href: '/credits' },
];

export const legalLinks: SiteLink[] = [
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
  { label: 'Refund & cancellation', href: '/refund-policy' },
];

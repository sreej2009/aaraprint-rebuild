/**
 * Business details shown on the site. The original site used a placeholder support email
 * (support@nexuz.example.com), so the real address must be configured before launch.
 */
export const business = {
  name: 'Aaraprint',
  supportEmail: (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined) || null,
  supportHours: 'Monday to Saturday, 10am–7pm IST',
  replyTime: 'within one business day',
  freeShippingThresholdCents: 199900,
  flatShippingCents: 9900,
  dispatchDays: { min: 2, max: 3 },
  deliveryBusinessDays: { min: 3, max: 6 },
  reprintWindowDays: 7,
  grievance: { acknowledgeHours: 48, resolveWithin: 'one month' },
} as const;

export type MessageChannel = 'SMS' | 'EMAIL';
export type TemplateCategory = 'initial' | 'followup' | 'thankyou';

export interface MessageTemplate {
  id: string;
  name: string;
  description: string;
  channel: MessageChannel;
  category: TemplateCategory;
  content: string;
  subject?: string; // Only for email templates
  estimatedDeliveryRate: number; // Percentage 0-100
  estimatedClickRate: number; // Percentage 0-100
  characterCount: number;
  variables: string[]; // Available variables like {{customerName}}, {{businessName}}
  tags: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  // SMS Templates - Initial Request
  {
    id: 'sms-initial-friendly',
    name: 'Friendly Request',
    description: 'Warm, personal tone perfect for service businesses',
    channel: 'SMS',
    category: 'initial',
    content:
      "Hi {{customerName}}! Thanks for choosing {{businessName}}. We'd love to hear about your experience. Could you share a quick review? {{reviewUrl}} Thanks!",
    estimatedDeliveryRate: 95,
    estimatedClickRate: 12,
    characterCount: 137,
    variables: ['{{customerName}}', '{{businessName}}', '{{reviewUrl}}'],
    tags: ['friendly', 'personal', 'service'],
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'sms-initial-professional',
    name: 'Professional Request',
    description: 'Clean, professional tone for corporate clients',
    channel: 'SMS',
    category: 'initial',
    content:
      'Thank you for your business with {{businessName}}. We value your feedback and would appreciate a moment to review our service: {{reviewUrl}}',
    estimatedDeliveryRate: 97,
    estimatedClickRate: 8,
    characterCount: 143,
    variables: ['{{businessName}}', '{{reviewUrl}}'],
    tags: ['professional', 'corporate', 'formal'],
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'sms-initial-urgent',
    name: 'Limited Time Request',
    description: 'Creates urgency with time-sensitive language',
    channel: 'SMS',
    category: 'initial',
    content:
      "Hi {{customerName}}, quick favour? We'd love a review of your recent {{businessName}} experience. Takes 30 seconds: {{reviewUrl}} Thank you!",
    estimatedDeliveryRate: 94,
    estimatedClickRate: 15,
    characterCount: 150,
    variables: ['{{customerName}}', '{{businessName}}', '{{reviewUrl}}'],
    tags: ['urgent', 'quick', 'time-sensitive'],
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },

  // SMS Templates - Follow-up
  {
    id: 'sms-followup-gentle',
    name: 'Gentle Reminder',
    description: "Soft follow-up that doesn't feel pushy",
    channel: 'SMS',
    category: 'followup',
    content:
      "Hi {{customerName}}, hope you're well! Just a gentle reminder about leaving a review for {{businessName}}. No pressure! {{reviewUrl}}",
    estimatedDeliveryRate: 93,
    estimatedClickRate: 10,
    characterCount: 142,
    variables: ['{{customerName}}', '{{businessName}}', '{{reviewUrl}}'],
    tags: ['gentle', 'soft', 'reminder'],
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'sms-followup-incentive',
    name: 'Incentive Offer',
    description: 'Follow-up with a small incentive or discount',
    channel: 'SMS',
    category: 'followup',
    content:
      "Hi {{customerName}}! Quick review of {{businessName}}? We'll send you a 10% discount for next time: {{reviewUrl}} Thanks!",
    estimatedDeliveryRate: 96,
    estimatedClickRate: 18,
    characterCount: 127,
    variables: ['{{customerName}}', '{{businessName}}', '{{reviewUrl}}'],
    tags: ['incentive', 'discount', 'reward'],
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },

  // SMS Templates - Thank You
  {
    id: 'sms-thankyou-simple',
    name: 'Simple Thanks',
    description: 'Clean thank you message after review submission',
    channel: 'SMS',
    category: 'thankyou',
    content:
      'Thank you for your review, {{customerName}}! Your feedback helps {{businessName}} serve you better. We appreciate you! 🙏',
    estimatedDeliveryRate: 98,
    estimatedClickRate: 0,
    characterCount: 125,
    variables: ['{{customerName}}', '{{businessName}}'],
    tags: ['gratitude', 'simple', 'appreciation'],
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },

  // SMS Templates - Blank
  {
    id: 'sms-blank-custom',
    name: 'Blank SMS Template',
    description: 'Completely blank template for writing your own SMS message',
    channel: 'SMS',
    category: 'initial',
    content: '',
    estimatedDeliveryRate: 95,
    estimatedClickRate: 10,
    characterCount: 0,
    variables: ['{{customerName}}', '{{businessName}}', '{{reviewUrl}}'],
    tags: ['blank', 'custom', 'write-your-own'],
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },

  // Email Templates - Initial Request
  {
    id: 'email-initial-comprehensive',
    name: 'Comprehensive Request',
    description: 'Detailed email with multiple review platform options',
    channel: 'EMAIL',
    category: 'initial',
    subject: "We'd love your feedback on your recent {{businessName}} experience",
    content: `Hi {{customerName}},

Thank you for choosing {{businessName}} for your recent service. We hope you had a great experience with us!

As a small business, customer reviews are incredibly important to us. They help other potential customers discover our services and help us continue to improve.

If you have a moment, we'd be grateful if you could share your experience by leaving a review:

👉 Leave a Google Review: {{reviewUrl}}

Your honest feedback takes just a couple of minutes but makes a huge difference to our business.

If you have any concerns or suggestions, please don't hesitate to reply to this email directly - we'd love to hear from you.

Thank you again for your business!

Best regards,
The {{businessName}} Team

P.S. Follow us on social media for updates and special offers!`,
    estimatedDeliveryRate: 89,
    estimatedClickRate: 22,
    characterCount: 756,
    variables: ['{{customerName}}', '{{businessName}}', '{{reviewUrl}}'],
    tags: ['comprehensive', 'detailed', 'professional'],
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'email-initial-personal',
    name: 'Personal Touch',
    description: 'Warm, personal email from business owner',
    channel: 'EMAIL',
    category: 'initial',
    subject: 'How was your experience with us?',
    content: `Hi {{customerName}},

I hope this email finds you well! I wanted to personally reach out and thank you for choosing {{businessName}}.

As a small, family-run business, every customer matters to us, and we genuinely care about your experience. Your satisfaction is our top priority, and we're always looking for ways to improve our service.

If you enjoyed your experience with us, would you mind taking a moment to leave a quick review? It would mean the world to us:

{{reviewUrl}}

Your review helps other families in our community discover our services, and your feedback helps us continue to grow and improve.

If there's anything at all that didn't meet your expectations, please don't hesitate to reach out to me directly. I personally read every email and am committed to making things right.

Thank you so much for your support!

Warm regards,
[Owner Name]
{{businessName}}`,
    estimatedDeliveryRate: 91,
    estimatedClickRate: 28,
    characterCount: 924,
    variables: ['{{customerName}}', '{{businessName}}', '{{reviewUrl}}'],
    tags: ['personal', 'family', 'warm'],
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'email-initial-brief',
    name: 'Brief & Direct',
    description: 'Concise email that gets straight to the point',
    channel: 'EMAIL',
    category: 'initial',
    subject: 'Quick review request - {{businessName}}',
    content: `Hi {{customerName}},

Thanks for your recent business with {{businessName}}!

We'd really appreciate it if you could take 2 minutes to leave us a review:
{{reviewUrl}}

Customer reviews help us improve our service and help other customers find us.

Thanks!
The {{businessName}} Team

Reply to this email if you have any questions or concerns.`,
    estimatedDeliveryRate: 93,
    estimatedClickRate: 19,
    characterCount: 346,
    variables: ['{{customerName}}', '{{businessName}}', '{{reviewUrl}}'],
    tags: ['brief', 'direct', 'concise'],
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },

  // Email Templates - Follow-up
  {
    id: 'email-followup-helpful',
    name: 'Helpful Follow-up',
    description: 'Follow-up that offers additional value',
    channel: 'EMAIL',
    category: 'followup',
    subject: 'Following up on your {{businessName}} experience + helpful tips',
    content: `Hi {{customerName}},

I hope you're enjoying the results of your recent service with {{businessName}}!

I wanted to follow up and see how everything is going. We've included some helpful tips below to help you get the most out of your recent service:

📋 Helpful Tips:
• [Tip 1 related to your service]
• [Tip 2 for maintenance/care]
• [Tip 3 for best results]

Also, if you have a moment and were happy with your experience, we'd still love to get your feedback in the form of a review:
{{reviewUrl}}

Reviews from customers like you help us continue to provide excellent service and help other people in our community find us.

If you have any questions about your service or need any support, just reply to this email and I'll get back to you personally.

Thanks again for choosing {{businessName}}!

Best,
The {{businessName}} Team`,
    estimatedDeliveryRate: 87,
    estimatedClickRate: 16,
    characterCount: 854,
    variables: ['{{customerName}}', '{{businessName}}', '{{reviewUrl}}'],
    tags: ['helpful', 'value-add', 'tips'],
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'email-followup-final',
    name: 'Final Request',
    description: 'Last follow-up attempt with gentle closing',
    channel: 'EMAIL',
    category: 'followup',
    subject: 'Last chance - help us with a quick review?',
    content: `Hi {{customerName}},

This will be my last email about leaving a review for {{businessName}} - I promise! 😊

I know everyone is busy, but if you have just 2 minutes and were happy with our service, a quick review would really help our small business:
{{reviewUrl}}

If you weren't completely satisfied with your experience, I'd actually prefer you reply to this email directly so I can make it right rather than leave a poor review.

Either way, thank you so much for choosing us. We truly appreciate your business, review or no review!

Take care,
The {{businessName}} Team

P.S. You won't receive any more review request emails from us after this one.`,
    estimatedDeliveryRate: 85,
    estimatedClickRate: 14,
    characterCount: 666,
    variables: ['{{customerName}}', '{{businessName}}', '{{reviewUrl}}'],
    tags: ['final', 'last-chance', 'gentle-close'],
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },

  // Email Templates - Thank You
  {
    id: 'email-thankyou-detailed',
    name: 'Detailed Thanks',
    description: 'Comprehensive thank you with next steps',
    channel: 'EMAIL',
    category: 'thankyou',
    subject: 'Thank you for your review! 🙏',
    content: `Hi {{customerName}},

WOW! Thank you so much for taking the time to leave us a review. It really means the world to our small business.

Your feedback helps us in so many ways:
✅ It helps other customers discover our services
✅ It motivates our team to keep delivering great service
✅ It helps us understand what we're doing well

As a token of our appreciation, here's a special 15% discount code for your next service: THANKYOU15

This code is valid for 3 months and can be used on any of our services.

We look forward to serving you again soon!

With gratitude,
The {{businessName}} Team

P.S. If you ever have friends or family who could benefit from our services, we'd be honored if you'd refer them our way!`,
    estimatedDeliveryRate: 96,
    estimatedClickRate: 8,
    characterCount: 754,
    variables: ['{{customerName}}', '{{businessName}}'],
    tags: ['gratitude', 'discount', 'referral'],
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },

  // Email Templates - Blank
  {
    id: 'email-blank-custom',
    name: 'Blank Email Template',
    description: 'Completely blank template for writing your own email message',
    channel: 'EMAIL',
    category: 'initial',
    subject: '',
    content: '',
    estimatedDeliveryRate: 90,
    estimatedClickRate: 15,
    characterCount: 0,
    variables: ['{{customerName}}', '{{businessName}}', '{{reviewUrl}}'],
    tags: ['blank', 'custom', 'write-your-own'],
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
];

export const getTemplatesByChannel = (channel: MessageChannel): MessageTemplate[] => {
  return MESSAGE_TEMPLATES.filter(template => template.channel === channel && template.isActive);
};

export const getTemplatesByCategory = (category: TemplateCategory): MessageTemplate[] => {
  return MESSAGE_TEMPLATES.filter(template => template.category === category && template.isActive);
};

export const getTemplatesByChannelAndCategory = (
  channel: MessageChannel,
  category: TemplateCategory
): MessageTemplate[] => {
  return MESSAGE_TEMPLATES.filter(
    template => template.channel === channel && template.category === category && template.isActive
  );
};

export const getTemplateById = (id: string): MessageTemplate | undefined => {
  return MESSAGE_TEMPLATES.find(template => template.id === id);
};

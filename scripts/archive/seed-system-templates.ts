import { PrismaClient, TemplateCategory, RequestChannel } from '@prisma/client';

const prisma = new PrismaClient();

const systemTemplates: Array<{
  name: string;
  description: string;
  category: TemplateCategory;
  channel: RequestChannel;
  content: string;
  templateType: string;
  businessId: null;
  subject?: string;
}> = [
  // SMS Templates
  {
    name: 'Simple Review Request - SMS',
    description: 'A straightforward SMS requesting a review',
    category: 'GENERAL',
    channel: 'SMS',
    content: 'Hi {{customerName}}! Thanks for choosing {{businessName}}. We\'d love your feedback: {{reviewUrl}}',
    templateType: 'system',
    businessId: null,
  },
  {
    name: 'Friendly Follow-up - SMS',
    description: 'A warm, friendly SMS follow-up',
    category: 'GENERAL', 
    channel: 'SMS',
    content: 'Hello {{firstName}}! Hope you enjoyed your experience with {{businessName}}. A quick review would mean the world to us: {{reviewUrl}}',
    templateType: 'system',
    businessId: null,
  },
  {
    name: 'Restaurant Review Request - SMS',
    description: 'Tailored for restaurant businesses',
    category: 'RESTAURANT',
    channel: 'SMS',
    content: 'Hi {{customerName}}! Thanks for dining at {{businessName}}. How was your meal? Share your experience: {{reviewUrl}}',
    templateType: 'system',
    businessId: null,
  },
  {
    name: 'Retail Shopping Experience - SMS',
    description: 'Perfect for retail and shopping experiences',
    category: 'RETAIL',
    channel: 'SMS',
    content: 'Hi {{firstName}}! Thanks for shopping at {{businessName}}. We\'d love to hear about your experience: {{reviewUrl}}',
    templateType: 'system',
    businessId: null,
  },
  {
    name: 'Healthcare Service Review - SMS',
    description: 'Professional tone for healthcare services',
    category: 'HEALTHCARE',
    channel: 'SMS',
    content: 'Hello {{customerName}}, thank you for choosing {{businessName}} for your care. Your feedback helps us serve you better: {{reviewUrl}}',
    templateType: 'system',
    businessId: null,
  },
  {
    name: 'Service Provider Review - SMS',
    description: 'For service-based businesses',
    category: 'SERVICE',
    channel: 'SMS',
    content: 'Hi {{customerName}}! Thank you for using {{businessName}}. Please share your experience to help others: {{reviewUrl}}',
    templateType: 'system',
    businessId: null,
  },

  // Email Templates
  {
    name: 'Professional Review Request - Email',
    description: 'A professional email requesting a review',
    category: 'GENERAL',
    channel: 'EMAIL',
    subject: 'We\'d love your feedback about {{businessName}}',
    content: `Dear {{customerName}},

Thank you for choosing {{businessName}}. Your experience matters to us, and we\'d be grateful if you could spare a moment to share your feedback.

Your review helps us improve our service and assists other customers in making informed decisions.

Please click here to leave your review: {{reviewUrl}}

Thank you for your time and for being a valued customer.

Best regards,
The {{businessName}} Team

{{website}}`,
    templateType: 'system',
    businessId: null,
  },
  {
    name: 'Friendly Review Request - Email',
    description: 'A warm, conversational email',
    category: 'GENERAL',
    channel: 'EMAIL',
    subject: 'How was your experience with {{businessName}}?',
    content: `Hi {{firstName}},

We hope you had a great experience with {{businessName}}!

We'd love to hear about your visit. Your feedback not only helps us improve but also helps other customers know what to expect.

Could you take a minute to share your thoughts? {{reviewUrl}}

Thanks so much!

Warm regards,
{{businessName}}

P.S. If you have any concerns, please don't hesitate to contact us directly at {{email}}.`,
    templateType: 'system',
    businessId: null,
  },
  {
    name: 'Restaurant Dining Experience - Email',
    description: 'Specifically crafted for restaurants',
    category: 'RESTAURANT',
    channel: 'EMAIL',
    subject: 'How was your meal at {{businessName}}?',
    content: `Dear {{customerName}},

Thank you for dining with us at {{businessName}}! We hope you enjoyed your meal and our service.

We're always working to create memorable dining experiences, and your feedback is invaluable in helping us achieve that goal.

Would you mind sharing your thoughts about your recent visit? {{reviewUrl}}

We look forward to welcoming you back soon!

Best regards,
The {{businessName}} Team

Visit us online: {{website}}`,
    templateType: 'system',
    businessId: null,
  },
  {
    name: 'Retail Shopping Review - Email',
    description: 'Perfect for retail stores and shopping',
    category: 'RETAIL',
    channel: 'EMAIL',
    subject: 'Thanks for shopping at {{businessName}}!',
    content: `Hi {{firstName}},

Thank you for shopping at {{businessName}}! We hope you found exactly what you were looking for.

Your shopping experience is important to us. Would you mind taking a moment to share your feedback? {{reviewUrl}}

Your review helps other customers discover great products and services, and helps us continue to improve.

Thanks again for choosing {{businessName}}!

Happy shopping,
The {{businessName}} Team

{{website}}`,
    templateType: 'system',
    businessId: null,
  },
  {
    name: 'Healthcare Service Feedback - Email',
    description: 'Professional template for healthcare providers',
    category: 'HEALTHCARE',
    channel: 'EMAIL',
    subject: 'Your feedback about {{businessName}}',
    content: `Dear {{customerName}},

Thank you for choosing {{businessName}} for your healthcare needs. We hope you received the quality care you deserved.

Patient feedback is essential to our commitment to providing excellent healthcare services. We would be grateful if you could share your experience with us.

Please take a moment to leave your feedback: {{reviewUrl}}

Your input helps us maintain high standards of care and assists other patients in choosing the right healthcare provider.

Thank you for trusting us with your care.

Sincerely,
{{businessName}}

{{website}}`,
    templateType: 'system',
    businessId: null,
  },
  {
    name: 'Service Provider Review - Email',
    description: 'For service-based businesses',
    category: 'SERVICE',
    channel: 'EMAIL',
    subject: 'How did we do? Your feedback about {{businessName}}',
    content: `Hello {{customerName}},

Thank you for choosing {{businessName}} for your recent service needs. We hope we exceeded your expectations!

We're always striving to improve our services, and your feedback is incredibly valuable to us. Could you take a few minutes to share your experience?

Leave your review here: {{reviewUrl}}

Your honest feedback helps us serve you better and helps other customers make informed decisions about our services.

Thank you for being a valued customer!

Best regards,
The {{businessName}} Team

Contact us: {{email}}
Visit us: {{website}}`,
    templateType: 'system',
    businessId: null,
  },
];

async function seedSystemTemplates() {
  console.log('Starting system template seeding...');
  
  try {
    // Check if system templates already exist
    const existingTemplates = await prisma.messageTemplate.findMany({
      where: {
        templateType: 'system',
        businessId: null,
      },
    });

    if (existingTemplates.length > 0) {
      console.log(`Found ${existingTemplates.length} existing system templates. Skipping seeding.`);
      return;
    }

    // Create system templates
    for (const template of systemTemplates) {
      // Extract variables from content and subject
      const contentVariables = extractVariables(template.content);
      const subjectVariables = template.subject ? extractVariables(template.subject) : [];
      const variables = Array.from(new Set([...contentVariables, ...subjectVariables]));

      const createdTemplate = await prisma.messageTemplate.create({
        data: {
          ...template,
          variables,
          usageCount: 0,
          isActive: true,
        },
      });

      console.log(`✓ Created system template: ${createdTemplate.name}`);
    }

    console.log(`\n🎉 Successfully seeded ${systemTemplates.length} system templates!`);

  } catch (error) {
    console.error('Error seeding system templates:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Helper function to extract variables from template content
function extractVariables(content: string): string[] {
  const matches = content.match(/{{([^}]+)}}/g);
  return matches ? matches.map(match => match.slice(2, -2).trim()) : [];
}

// Run the seeding if this file is executed directly
if (require.main === module) {
  seedSystemTemplates()
    .then(() => {
      console.log('System template seeding completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('System template seeding failed:', error);
      process.exit(1);
    });
}

export { seedSystemTemplates };
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Checking available data...\n');
    
    // Get the business
    const business = await prisma.business.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    
    console.log('Business:', business?.name, '- ID:', business?.id);
    
    // Get customers for this business
    const customers = await prisma.customer.findMany({
      where: { businessId: business?.id },
      select: { id: true, firstName: true, lastName: true, email: true }
    });
    
    console.log(`\nCustomers (${customers.length}):`);
    customers.forEach(c => console.log(`  - ${c.firstName} ${c.lastName} (${c.id})`));
    
    // Get message templates
    const templates = await prisma.messageTemplate.findMany({
      where: { 
        OR: [
          { businessId: business?.id },
          { templateType: 'system' }
        ]
      },
      select: { id: true, name: true, channel: true, subject: true, content: true }
    });
    
    console.log(`\nTemplates (${templates.length}):`);
    templates.forEach(t => console.log(`  - ${t.name} (${t.channel}) - ID: ${t.id}`));
    
    if (templates.length > 0 && customers.length > 0) {
      const template = templates[0];
      const customer = customers[0];
      
      console.log(`\nSample valid API call:`);
      console.log(JSON.stringify({
        customerId: customer.id,
        templateId: template.id,
        channel: template.channel,
        subject: template.subject,
        messageContent: template.content,
        reviewUrl: business?.googleReviewUrl || 'https://example.com/review'
      }, null, 2));
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
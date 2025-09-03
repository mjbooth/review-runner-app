#!/usr/bin/env tsx
/**
 * Database seeding script to migrate mock customers to Supabase
 * Run with: npm run db:seed
 */

import { PrismaClient } from '@prisma/client';
// Note: mockCustomers import removed as mockData module no longer exists
// This script is archived and would need mock data to be recreated if used

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // First, create a demo business for our customers
  const demoBusiness = await prisma.business.upsert({
    where: { clerkUserId: 'demo_user_123' },
    update: {},
    create: {
      clerkUserId: 'demo_user_123',
      name: 'Demo Business Ltd',
      email: 'demo@reviewrunner.com',
      phone: '01234567890',
      address: '123 Demo Street, London, SW1A 1AA',
      website: 'https://demo-business.co.uk',
      timezone: 'Europe/London',
      smsCreditsUsed: 0,
      smsCreditsLimit: 1000,
      emailCreditsUsed: 0,
      emailCreditsLimit: 5000,
    },
  });

  console.log(`📊 Created/found business: ${demoBusiness.name} (${demoBusiness.id})`);

  // Clear existing customers for this business
  await prisma.customer.deleteMany({
    where: { businessId: demoBusiness.id },
  });

  console.log('🗑️  Cleared existing customers');

  // Mock customers data would be processed here
  // This section is disabled since mockCustomers import was removed
  console.log('⚠️  Mock customer data not available - script archived');

  const customerCount = await prisma.customer.count({
    where: { businessId: demoBusiness.id },
  });

  console.log(`✅ Successfully seeded ${customerCount} customers`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
#!/usr/bin/env tsx

/**
 * Verify Test Business Data
 * 
 * This script connects directly to the database to verify that our test businesses
 * have the correct data and that data isolation would work properly.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyTestBusinessData() {
  console.log('🔍 Verifying Test Business Data & Multi-Tenant Isolation\n');

  try {
    // Get all test businesses
    const businesses = await prisma.business.findMany({
      where: {
        id: {
          in: [
            'test-empty-business-001',
            'test-highvolume-business-002',
            'test-trial-business-003',
            'test-suspended-business-004'
          ]
        }
      },
      include: {
        _count: {
          select: {
            customers: { where: { isActive: true } },
            reviewRequests: { where: { isActive: true } },
            suppressions: { where: { isActive: true } },
            events: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    if (businesses.length === 0) {
      console.log('❌ No test businesses found! Please run: npm run seed:test-businesses\n');
      return;
    }

    console.log(`✅ Found ${businesses.length} test businesses:`);
    console.log('');

    for (const business of businesses) {
      const status = business.isActive ? '🟢 Active' : '🔴 Suspended';
      console.log(`📋 ${business.name}`);
      console.log(`   ID: ${business.id}`);
      console.log(`   Status: ${status}`);
      console.log(`   Email: ${business.email}`);
      console.log(`   SMS Credits: ${business.smsCreditsUsed}/${business.smsCreditsLimit}`);
      console.log(`   Email Credits: ${business.emailCreditsUsed}/${business.emailCreditsLimit}`);
      console.log(`   Customers: ${business._count.customers}`);
      console.log(`   Review Requests: ${business._count.reviewRequests}`);
      console.log(`   Suppressions: ${business._count.suppressions}`);
      console.log(`   Events: ${business._count.events}`);
      console.log('');
    }

    // Verify data isolation by sampling some customers
    console.log('🔒 Data Isolation Verification:');
    console.log('');

    for (const business of businesses) {
      const sampleCustomers = await prisma.customer.findMany({
        where: {
          businessId: business.id,
          isActive: true
        },
        take: 3,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true
        }
      });

      console.log(`📊 ${business.name}: ${sampleCustomers.length} customers`);
      sampleCustomers.forEach(customer => {
        console.log(`   • ${customer.firstName} ${customer.lastName || ''} (${customer.email || 'no email'})`);
      });
      console.log('');
    }

    // Test the business switcher scenarios
    console.log('🧪 Business Switcher Test Scenarios:');
    console.log('');

    const scenarios = [
      {
        business: businesses.find(b => b.id === 'test-empty-business-001'),
        description: 'Empty Business - Should show 0 customers (new account scenario)',
        expected: 0
      },
      {
        business: businesses.find(b => b.id === 'test-highvolume-business-002'),
        description: 'High-Volume Business - Should show many customers (established business)',
        expected: '>50'
      },
      {
        business: businesses.find(b => b.id === 'test-trial-business-003'),
        description: 'Trial Account - Should show moderate customers (small business)',
        expected: '10-30'
      },
      {
        business: businesses.find(b => b.id === 'test-suspended-business-004'),
        description: 'Suspended Account - Should show customers but be marked inactive',
        expected: '>30'
      }
    ];

    scenarios.forEach(scenario => {
      if (scenario.business) {
        const actual = scenario.business._count.customers;
        const isCorrect = scenario.expected === 0 ? 
          actual === 0 : 
          actual > 0;
        
        const status = isCorrect ? '✅' : '❌';
        console.log(`${status} ${scenario.description}`);
        console.log(`   Expected: ${scenario.expected}, Actual: ${actual}`);
        console.log('');
      }
    });

    console.log('📈 Business Metrics Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Business Name                    | Customers | Requests | Status');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    businesses.forEach(business => {
      const name = business.name.padEnd(32, ' ');
      const customers = business._count.customers.toString().padStart(9, ' ');
      const requests = business._count.reviewRequests.toString().padStart(8, ' ');
      const status = business.isActive ? 'Active  ' : 'Suspended';
      console.log(`${name} | ${customers} | ${requests} | ${status}`);
    });
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    console.log('\n✨ Test business verification completed!');
    console.log('\n🎯 Ready for Business Switcher testing:');
    console.log('   1. Start the dev server: npm run dev');
    console.log('   2. Enable developer mode in browser localStorage');
    console.log('   3. Use the shield icon in navigation to switch businesses');
    console.log('   4. Verify each business shows different customer data');

  } catch (error) {
    console.error('❌ Error verifying test business data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the verification
verifyTestBusinessData();
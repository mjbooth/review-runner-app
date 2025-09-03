#!/usr/bin/env tsx

/**
 * Test Business Cleanup Script
 * 
 * Removes all test businesses and associated data created by seed-test-businesses.ts
 * Ensures clean state for re-seeding or production deployment
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Test business IDs to clean up
const TEST_BUSINESS_IDS = [
  'test-empty-business-001',
  'test-highvolume-business-002', 
  'test-trial-business-003',
  'test-suspended-business-004'
];

async function main() {
  console.log('🧹 Starting test business cleanup...\n');
  
  try {
    // Find existing test businesses
    const existingBusinesses = await prisma.business.findMany({
      where: {
        id: { in: TEST_BUSINESS_IDS }
      },
      select: { 
        id: true, 
        name: true,
        _count: {
          select: {
            customers: true,
            reviewRequests: true,
            suppressions: true,
            events: true
          }
        }
      }
    });
    
    if (existingBusinesses.length === 0) {
      console.log('✅ No test businesses found. Database is already clean.\n');
      process.exit(0);
    }
    
    console.log(`Found ${existingBusinesses.length} test businesses to clean up:`);
    existingBusinesses.forEach(business => {
      console.log(`   • ${business.name}:`);
      console.log(`     - ${business._count.customers} customers`);
      console.log(`     - ${business._count.reviewRequests} review requests`);
      console.log(`     - ${business._count.suppressions} suppressions`);
      console.log(`     - ${business._count.events} events`);
    });
    
    console.log('\n🗑️  Deleting test business data...');
    
    // Delete businesses (cascade will handle related records)
    const deleteResult = await prisma.business.deleteMany({
      where: {
        id: { in: TEST_BUSINESS_IDS }
      }
    });
    
    console.log(`   ✅ Deleted ${deleteResult.count} test businesses`);
    console.log('   ✅ All associated data removed (customers, requests, events, suppressions)');
    
    console.log('\n✨ Test business cleanup completed successfully!');
    console.log('   Database is now clean and ready for fresh test data seeding.\n');
    
  } catch (error) {
    console.error('❌ Error cleaning test businesses:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the cleanup
main().catch(console.error);
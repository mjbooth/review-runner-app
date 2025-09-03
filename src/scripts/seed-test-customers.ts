#!/usr/bin/env tsx

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { TEST_USERS } from './reset-test-data';

interface TestCustomer {
  name: string;
  email: string;
  phone?: string;
  notes?: string;
}

// Sample customers for different business types
const CUSTOMER_TEMPLATES: Record<string, TestCustomer[]> = {
  bakery: [
    {
      name: 'Sarah Johnson',
      email: 'sarah.j@email.com',
      phone: '+447700123456',
      notes: 'Regular customer, loves croissants',
    },
    {
      name: 'Mike Chen',
      email: 'mike.chen@email.com',
      phone: '+447700234567',
      notes: 'Wedding cake order completed',
    },
    {
      name: 'Emily Davis',
      email: 'emily.d@email.com',
      phone: '+447700345678',
      notes: 'Birthday cake pickup',
    },
    {
      name: 'James Wilson',
      email: 'james.w@email.com',
      phone: '+447700456789',
      notes: 'Corporate catering client',
    },
  ],
  restaurant: [
    {
      name: 'David Thompson',
      email: 'david.t@email.com',
      phone: '+447700567890',
      notes: 'Anniversary dinner reservation',
    },
    {
      name: 'Lisa Rodriguez',
      email: 'lisa.r@email.com',
      phone: '+447700678901',
      notes: 'Group booking for 12',
    },
    {
      name: 'Tom Anderson',
      email: 'tom.a@email.com',
      phone: '+447700789012',
      notes: 'Regular lunch customer',
    },
    {
      name: 'Rachel Green',
      email: 'rachel.g@email.com',
      phone: '+447700890123',
      notes: 'Dietary requirements noted',
    },
  ],
  salon: [
    {
      name: 'Sophie Williams',
      email: 'sophie.w@email.com',
      phone: '+447700901234',
      notes: 'Hair color and cut appointment',
    },
    {
      name: 'Jessica Brown',
      email: 'jessica.b@email.com',
      phone: '+447700012345',
      notes: 'Bridal hair trial completed',
    },
    {
      name: 'Amanda Taylor',
      email: 'amanda.t@email.com',
      phone: '+447700123450',
      notes: 'Monthly highlights client',
    },
    {
      name: 'Karen Miller',
      email: 'karen.m@email.com',
      phone: '+447700234501',
      notes: 'Special occasion styling',
    },
  ],
  plumber: [
    {
      name: 'Robert Smith',
      email: 'robert.s@email.com',
      phone: '+447700345012',
      notes: 'Emergency call-out completed',
    },
    {
      name: 'Helen Jones',
      email: 'helen.j@email.com',
      phone: '+447700450123',
      notes: 'Bathroom installation project',
    },
    {
      name: 'Peter Clarke',
      email: 'peter.c@email.com',
      phone: '+447700501234',
      notes: 'Boiler service and repair',
    },
    {
      name: 'Mary White',
      email: 'mary.w@email.com',
      phone: '+447700612345',
      notes: 'Kitchen sink replacement',
    },
  ],
  dentist: [
    {
      name: 'Christopher Lee',
      email: 'chris.l@email.com',
      phone: '+447700723456',
      notes: 'Routine checkup and cleaning',
    },
    {
      name: 'Jennifer Hall',
      email: 'jennifer.h@email.com',
      phone: '+447700834567',
      notes: 'Teeth whitening treatment',
    },
    {
      name: 'Andrew Martin',
      email: 'andrew.m@email.com',
      phone: '+447700945678',
      notes: 'Root canal treatment completed',
    },
    {
      name: 'Linda Garcia',
      email: 'linda.g@email.com',
      phone: '+447701056789',
      notes: 'Dental implant consultation',
    },
  ],
  cafe: [
    {
      name: 'Alex Turner',
      email: 'alex.t@email.com',
      phone: '+447701167890',
      notes: 'Coffee subscription customer',
    },
    {
      name: 'Emma Watson',
      email: 'emma.w@email.com',
      phone: '+447701278901',
      notes: 'Meeting room booking regular',
    },
    {
      name: 'Oliver Smith',
      email: 'oliver.s@email.com',
      phone: '+447701389012',
      notes: 'Catering order for office',
    },
    {
      name: 'Grace Johnson',
      email: 'grace.j@email.com',
      phone: '+447701490123',
      notes: 'Student discount card holder',
    },
  ],
  fitness: [
    {
      name: 'Mark Thompson',
      email: 'mark.t@email.com',
      phone: '+447701501234',
      notes: 'Personal training sessions',
    },
    {
      name: 'Kate Brown',
      email: 'kate.b@email.com',
      phone: '+447701612345',
      notes: 'Group fitness class regular',
    },
    {
      name: 'Ryan Davis',
      email: 'ryan.d@email.com',
      phone: '+447701723456',
      notes: 'New member orientation completed',
    },
    {
      name: 'Zoe Wilson',
      email: 'zoe.w@email.com',
      phone: '+447701834567',
      notes: 'Nutrition consultation booked',
    },
  ],
  florist: [
    {
      name: 'Victoria Adams',
      email: 'victoria.a@email.com',
      phone: '+447701945678',
      notes: 'Wedding flowers consultation',
    },
    {
      name: 'Daniel Miller',
      email: 'daniel.m@email.com',
      phone: '+447702056789',
      notes: 'Funeral arrangement order',
    },
    {
      name: 'Charlotte Green',
      email: 'charlotte.g@email.com',
      phone: '+447702167890',
      notes: 'Weekly office flower delivery',
    },
    {
      name: 'Harrison Ford',
      email: 'harrison.f@email.com',
      phone: '+447702278901',
      notes: "Valentine's Day bouquet",
    },
  ],
  auto: [
    {
      name: 'Steve Rogers',
      email: 'steve.r@email.com',
      phone: '+447702389012',
      notes: 'Annual MOT and service',
    },
    {
      name: 'Diana Prince',
      email: 'diana.p@email.com',
      phone: '+447702490123',
      notes: 'Brake replacement completed',
    },
    {
      name: 'Tony Stark',
      email: 'tony.s@email.com',
      phone: '+447702501234',
      notes: 'Engine diagnostic and repair',
    },
    {
      name: 'Natasha Black',
      email: 'natasha.b@email.com',
      phone: '+447702612345',
      notes: 'Tire replacement service',
    },
  ],
  petshop: [
    {
      name: 'Bruce Wayne',
      email: 'bruce.w@email.com',
      phone: '+447702723456',
      notes: 'Monthly pet food delivery',
    },
    {
      name: 'Selina Kyle',
      email: 'selina.k@email.com',
      phone: '+447702834567',
      notes: 'Cat grooming appointment',
    },
    {
      name: 'Clark Kent',
      email: 'clark.k@email.com',
      phone: '+447702945678',
      notes: 'New puppy starter kit purchase',
    },
    {
      name: 'Lois Lane',
      email: 'lois.l@email.com',
      phone: '+447703056789',
      notes: 'Veterinary referral provided',
    },
  ],
};

async function seedTestCustomers(): Promise<void> {
  try {
    logger.info('🌱 Starting to seed test customers...');

    // Get all existing test businesses
    const testBusinesses = await prisma.business.findMany({
      where: {
        clerkUserId: {
          startsWith: 'test_user_',
        },
      },
      select: {
        id: true,
        name: true,
        clerkUserId: true,
      },
    });

    if (testBusinesses.length === 0) {
      console.log('❌ No test businesses found. Run "npm run reset-test-data" first.');
      return;
    }

    let totalCustomersCreated = 0;

    for (const business of testBusinesses) {
      // Determine business type from name
      const businessType = getBusiness(business.name.toLowerCase());
      const customerTemplate = CUSTOMER_TEMPLATES[businessType] || CUSTOMER_TEMPLATES['cafe'];

      logger.info(`Adding customers for ${business.name} (${businessType})`, {
        businessId: business.id,
        customersCount: customerTemplate.length,
      });

      // Clear existing customers for this business
      await prisma.customer.deleteMany({
        where: { businessId: business.id },
      });

      // Add new customers
      for (const customerData of customerTemplate) {
        const [firstName, ...lastNameParts] = customerData.name.split(' ');
        const lastName = lastNameParts.join(' ') || undefined;

        await prisma.customer.create({
          data: {
            businessId: business.id,
            firstName,
            lastName,
            email: customerData.email,
            phone: customerData.phone,
            notes: customerData.notes,
            isActive: true,
          },
        });
      }

      totalCustomersCreated += customerTemplate.length;
      console.log(`✅ Added ${customerTemplate.length} customers for ${business.name}`);
    }

    console.log(
      `\\n🎉 Successfully seeded ${totalCustomersCreated} test customers across ${testBusinesses.length} businesses`
    );

    // Show summary
    console.log('\\n📊 Customer Summary by Business:');
    for (const business of testBusinesses) {
      const customerCount = await prisma.customer.count({
        where: { businessId: business.id },
      });
      console.log(`  • ${business.name}: ${customerCount} customers`);
    }

    console.log('\\n💡 Next Steps:');
    console.log('1. Run "npm run dev" to start the application');
    console.log('2. Test onboarding flow with different test user IDs');
    console.log('3. Use the seeded customers to test review request campaigns');
    console.log('4. Test different scenarios: bulk requests, individual requests, follow-ups');
  } catch (error) {
    logger.error('❌ Error seeding test customers', { error });
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

function getBusiness(businessName: string): string {
  if (businessName.includes('bakery') || businessName.includes('cake')) return 'bakery';
  if (
    businessName.includes('restaurant') ||
    businessName.includes('dining') ||
    businessName.includes('fork')
  )
    return 'restaurant';
  if (
    businessName.includes('salon') ||
    businessName.includes('hair') ||
    businessName.includes('beauty')
  )
    return 'salon';
  if (
    businessName.includes('plumb') ||
    businessName.includes('fix') ||
    businessName.includes('repair')
  )
    return 'plumber';
  if (
    businessName.includes('dental') ||
    businessName.includes('dentist') ||
    businessName.includes('smile')
  )
    return 'dentist';
  if (
    businessName.includes('coffee') ||
    businessName.includes('cafe') ||
    businessName.includes('corner')
  )
    return 'cafe';
  if (
    businessName.includes('gym') ||
    businessName.includes('fitness') ||
    businessName.includes('power')
  )
    return 'fitness';
  if (
    businessName.includes('florist') ||
    businessName.includes('flower') ||
    businessName.includes('bloom')
  )
    return 'florist';
  if (
    businessName.includes('auto') ||
    businessName.includes('garage') ||
    businessName.includes('repair')
  )
    return 'auto';
  if (
    businessName.includes('pet') ||
    businessName.includes('animal') ||
    businessName.includes('furry')
  )
    return 'petshop';

  return 'cafe'; // Default fallback
}

// Run if called directly
if (require.main === module) {
  seedTestCustomers()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { seedTestCustomers };

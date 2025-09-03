#!/usr/bin/env tsx
/**
 * Row Level Security Migration Runner
 *
 * This script applies the RLS policies and functions to the database.
 * Run this after ensuring your database is backed up.
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const prisma = new PrismaClient();

async function runMigration() {
  console.log('🔒 Starting Row Level Security migration...');

  try {
    // Read the migration file
    const migrationPath = path.join(
      __dirname,
      '../prisma/migrations/20250813_add_rls_policies/migration.sql'
    );

    console.log('📖 Reading migration file...');
    const migrationSQL = await fs.readFile(migrationPath, 'utf-8');

    // Split the SQL into individual statements
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    console.log(`📝 Found ${statements.length} SQL statements to execute`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      // Skip comments and empty statements
      if (!statement || statement.startsWith('--') || statement.trim().length === 0) {
        continue;
      }

      try {
        console.log(`⚡ Executing statement ${i + 1}/${statements.length}...`);
        await prisma.$executeRawUnsafe(statement);
      } catch (error) {
        console.error(
          `❌ Failed to execute statement ${i + 1}:`,
          statement.substring(0, 100) + '...'
        );
        console.error('Error:', error);
        throw error;
      }
    }

    console.log('✅ Row Level Security migration completed successfully!');

    // Test the functions
    console.log('🧪 Testing RLS functions...');

    // Test setting business context
    const testBusinessId = '550e8400-e29b-41d4-a716-446655440000'; // Example UUID

    try {
      await prisma.$executeRaw`SELECT set_current_business_id(${testBusinessId}::uuid)`;
      console.log('✅ set_current_business_id function works');

      const result = await prisma.$queryRaw<[{ get_current_business_id: string }]>`
        SELECT get_current_business_id()
      `;

      if (result[0]?.get_current_business_id === testBusinessId) {
        console.log('✅ get_current_business_id function works');
      } else {
        console.log('⚠️  get_current_business_id returned unexpected result');
      }

      await prisma.$executeRaw`SELECT clear_business_context()`;
      console.log('✅ clear_business_context function works');
    } catch (error) {
      console.error('❌ Function testing failed:', error);
    }

    // Check if RLS is enabled on tables
    console.log('🔍 Checking RLS status on tables...');

    const rlsStatus = await prisma.$queryRaw<Array<{ tablename: string; rowsecurity: boolean }>>`
      SELECT tablename, rowsecurity 
      FROM pg_tables pt
      JOIN pg_class pc ON pc.relname = pt.tablename
      WHERE schemaname = 'public' 
      AND tablename IN ('customers', 'review_requests', 'events', 'suppressions')
    `;

    for (const table of rlsStatus) {
      if (table.rowsecurity) {
        console.log(`✅ RLS enabled on ${table.tablename}`);
      } else {
        console.log(`❌ RLS not enabled on ${table.tablename}`);
      }
    }

    console.log('\n🎉 Migration completed! Next steps:');
    console.log('1. Update your API routes to use business context middleware');
    console.log('2. Remove explicit businessId filters from your queries');
    console.log('3. Test thoroughly with multiple businesses');
    console.log('4. Monitor query performance and add indexes if needed');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', error => {
  console.error('Unhandled rejection:', error);
  process.exit(1);
});

// Run the migration
runMigration().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

/**
 * GDPR Test Data Setup Script
 *
 * Creates comprehensive test data for GDPR compliance system testing
 * including businesses, customers, requests, and audit events.
 */

import { prisma } from '../lib/prisma';
import { getEncryptedCustomerService } from '../lib/encrypted-customer-service';
import { getGDPRDataSubjectRightsService } from '../lib/gdpr-data-subject-rights';
import { getGDPRComplianceAuditService } from '../lib/gdpr-compliance-audit';
import { getGDPRDataLifecycleService } from '../lib/gdpr-data-lifecycle';
import crypto from 'crypto';

// Test data configuration
const TEST_DATA_CONFIG = {
  businesses: [
    {
      id: 'test-business-001',
      name: 'GDPR Test Business Ltd',
      email: 'admin@testbusiness.com',
      phone: '+441234567890',
      address: '123 Business Street, London, EC1A 1BB',
      industry: 'Technology Services',
    },
    {
      id: 'test-business-002',
      name: 'Demo Company PLC',
      email: 'contact@democompany.co.uk',
      phone: '+441987654321',
      address: '456 Demo Avenue, Manchester, M1 1AA',
      industry: 'Retail',
    },
  ],

  customers: [
    {
      businessId: 'test-business-001',
      email: 'john.doe@customer.com',
      phone: '+447123456789',
      firstName: 'John',
      lastName: 'Doe',
      businessName: 'Doe Consulting Ltd',
      address: '123 Test Street, London, SW1A 1AA',
      consentGiven: true,
      marketingConsent: false,
    },
    {
      businessId: 'test-business-001',
      email: 'jane.smith@email.com',
      phone: '+447987654321',
      firstName: 'Jane',
      lastName: 'Smith',
      businessName: 'Smith & Associates',
      address: '456 Example Road, Birmingham, B1 1AA',
      consentGiven: true,
      marketingConsent: true,
    },
    {
      businessId: 'test-business-001',
      email: 'bob.wilson@company.co.uk',
      phone: '+447555123456',
      firstName: 'Bob',
      lastName: 'Wilson',
      businessName: 'Wilson Industries',
      address: '789 Sample Lane, Leeds, LS1 1AA',
      consentGiven: true,
      marketingConsent: false,
    },
    {
      businessId: 'test-business-001',
      email: 'sarah.davis@personal.com',
      phone: '+447666789123',
      firstName: 'Sarah',
      lastName: 'Davis',
      businessName: 'Davis Creative Agency',
      address: '321 Demo Close, Bristol, BS1 1AA',
      consentGiven: true,
      marketingConsent: true,
    },
    {
      businessId: 'test-business-002',
      email: 'mike.brown@testing.org',
      phone: '+447777888999',
      firstName: 'Mike',
      lastName: 'Brown',
      businessName: 'Brown Testing Services',
      address: '654 Trial Street, Edinburgh, EH1 1AA',
      consentGiven: true,
      marketingConsent: false,
    },
  ],

  gdprRequests: [
    {
      rightType: 'ACCESS',
      status: 'PENDING',
      customerEmail: 'john.doe@customer.com',
      description: 'I need all my personal data for insurance claim purposes',
      priority: 'NORMAL',
      daysOld: 2,
    },
    {
      rightType: 'RECTIFICATION',
      status: 'VERIFIED',
      customerEmail: 'jane.smith@email.com',
      description: 'My phone number is incorrect, should be +447999888777',
      priority: 'NORMAL',
      daysOld: 5,
    },
    {
      rightType: 'ERASURE',
      status: 'REQUIRES_APPROVAL',
      customerEmail: 'bob.wilson@company.co.uk',
      description: 'I no longer want my data stored in your system',
      priority: 'HIGH',
      daysOld: 1,
    },
    {
      rightType: 'PORTABILITY',
      status: 'IN_PROGRESS',
      customerEmail: 'sarah.davis@personal.com',
      description: 'Need my data in JSON format for new provider',
      priority: 'NORMAL',
      daysOld: 7,
    },
    {
      rightType: 'ACCESS',
      status: 'COMPLETED',
      customerEmail: 'mike.brown@testing.org',
      description: 'Regular data audit review',
      priority: 'LOW',
      daysOld: 15,
    },
  ],

  reviewRequests: [
    {
      businessId: 'test-business-001',
      customerEmail: 'john.doe@customer.com',
      channel: 'SMS',
      message: 'Hi John, thanks for choosing us! Please leave a review: [LINK]',
      status: 'SENT',
      deliveryStatus: 'DELIVERED',
      daysOld: 30,
    },
    {
      businessId: 'test-business-001',
      customerEmail: 'jane.smith@email.com',
      channel: 'EMAIL',
      message: 'Dear Jane, we hope you were satisfied with our service...',
      status: 'SENT',
      deliveryStatus: 'OPENED',
      daysOld: 45,
    },
    {
      businessId: 'test-business-001',
      customerEmail: 'sarah.davis@personal.com',
      channel: 'SMS',
      message: 'Sarah, your review would mean a lot to us: [LINK]',
      status: 'SENT',
      deliveryStatus: 'CLICKED',
      daysOld: 20,
    },
  ],

  suppressions: [
    {
      businessId: 'test-business-001',
      type: 'OPT_OUT',
      email: 'opted.out@customer.com',
      reason: 'Customer requested to stop all communications',
      channel: 'ALL',
    },
    {
      businessId: 'test-business-001',
      type: 'BOUNCE',
      phone: '+447000000001',
      reason: 'SMS delivery failed - invalid number',
      channel: 'SMS',
    },
  ],

  retentionPolicies: [
    {
      businessId: 'test-business-001',
      name: 'Customer PII Retention',
      description: 'Standard retention policy for customer personal data',
      dataCategory: 'CUSTOMER_PII',
      retentionPeriod: 7,
      retentionUnit: 'YEARS',
      actionAfterRetention: 'ARCHIVE',
      isActive: true,
    },
    {
      businessId: 'test-business-001',
      name: 'Inactive Customer Cleanup',
      description: 'Auto-delete inactive customers after 3 years',
      dataCategory: 'CUSTOMER_PII',
      retentionPeriod: 3,
      retentionUnit: 'YEARS',
      actionAfterRetention: 'DELETE',
      isActive: true,
    },
  ],
};

/**
 * Main setup function
 */
async function setupTestData() {
  console.log('🚀 Starting GDPR test data setup...');

  try {
    // Clean existing test data
    await cleanTestData();

    // Create businesses
    await createBusinesses();

    // Create customers
    await createCustomers();

    // Create review requests and events
    await createReviewRequests();

    // Create GDPR requests
    await createGDPRRequests();

    // Create suppressions
    await createSuppressions();

    // Create retention policies
    await createRetentionPolicies();

    // Generate audit events
    await generateAuditEvents();

    // Create demo breach record
    await createDemoBreachRecord();

    console.log('✅ Test data setup completed successfully!');
    console.log('\n📋 Test Data Summary:');
    console.log(`   • Businesses: ${TEST_DATA_CONFIG.businesses.length}`);
    console.log(`   • Customers: ${TEST_DATA_CONFIG.customers.length}`);
    console.log(`   • GDPR Requests: ${TEST_DATA_CONFIG.gdprRequests.length}`);
    console.log(`   • Review Requests: ${TEST_DATA_CONFIG.reviewRequests.length}`);
    console.log(`   • Retention Policies: ${TEST_DATA_CONFIG.retentionPolicies.length}`);

    console.log('\n🔑 Test Credentials:');
    console.log('   Business Admin: admin@testbusiness.com');
    console.log('   Test Customer: john.doe@customer.com');
    console.log('   Business ID: test-business-001');

    console.log('\n🌐 Test URLs:');
    console.log('   Customer Portal: /gdpr/portal/test-business-001');
    console.log('   Business Dashboard: /dashboard/gdpr');
  } catch (error) {
    console.error('❌ Test data setup failed:', error);
    process.exit(1);
  }
}

/**
 * Clean existing test data
 */
async function cleanTestData() {
  console.log('🧹 Cleaning existing test data...');

  const testBusinessIds = TEST_DATA_CONFIG.businesses.map(b => b.id);
  const testEmails = TEST_DATA_CONFIG.customers.map(c => c.email);

  // Delete in reverse dependency order
  await prisma.personalDataBreach.deleteMany({
    where: { businessId: { in: testBusinessIds } },
  });

  await prisma.deletionRequest.deleteMany({
    where: { businessId: { in: testBusinessIds } },
  });

  await prisma.dataExportRequest.deleteMany({
    where: { businessId: { in: testBusinessIds } },
  });

  await prisma.complianceAuditEvent.deleteMany({
    where: { businessId: { in: testBusinessIds } },
  });

  await prisma.auditChain.deleteMany({
    where: { businessId: { in: testBusinessIds } },
  });

  await prisma.retentionPolicy.deleteMany({
    where: { businessId: { in: testBusinessIds } },
  });

  await prisma.suppression.deleteMany({
    where: { businessId: { in: testBusinessIds } },
  });

  await prisma.event.deleteMany({
    where: {
      reviewRequest: {
        businessId: { in: testBusinessIds },
      },
    },
  });

  await prisma.reviewRequest.deleteMany({
    where: { businessId: { in: testBusinessIds } },
  });

  await prisma.verificationChallenge.deleteMany({
    where: {
      verification: {
        businessId: { in: testBusinessIds },
      },
    },
  });

  await prisma.identityVerification.deleteMany({
    where: { businessId: { in: testBusinessIds } },
  });

  await prisma.dataSubjectRequest.deleteMany({
    where: { businessId: { in: testBusinessIds } },
  });

  await prisma.customer.deleteMany({
    where: { businessId: { in: testBusinessIds } },
  });

  await prisma.business.deleteMany({
    where: { id: { in: testBusinessIds } },
  });

  console.log('✅ Cleanup completed');
}

/**
 * Create test businesses
 */
async function createBusinesses() {
  console.log('🏢 Creating test businesses...');

  for (const businessData of TEST_DATA_CONFIG.businesses) {
    await prisma.business.create({
      data: {
        id: businessData.id,
        name: businessData.name,
        email: businessData.email,
        phone: businessData.phone,
        address: businessData.address,
        industry: businessData.industry,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  console.log(`✅ Created ${TEST_DATA_CONFIG.businesses.length} businesses`);
}

/**
 * Create test customers with encryption
 */
async function createCustomers() {
  console.log('👥 Creating test customers...');

  const customerService = getEncryptedCustomerService();

  for (const customerData of TEST_DATA_CONFIG.customers) {
    const result = await customerService.createCustomer(customerData.businessId, {
      email: customerData.email,
      phone: customerData.phone,
      firstName: customerData.firstName,
      lastName: customerData.lastName,
      businessName: customerData.businessName,
      address: customerData.address,
      consentGiven: customerData.consentGiven,
      marketingConsent: customerData.marketingConsent,
    });

    if (!result.success) {
      console.warn(`Warning: Failed to create customer ${customerData.email}:`, result.errors);
    }
  }

  console.log(`✅ Created ${TEST_DATA_CONFIG.customers.length} customers`);
}

/**
 * Create test review requests and events
 */
async function createReviewRequests() {
  console.log('📧 Creating review requests and events...');

  for (const requestData of TEST_DATA_CONFIG.reviewRequests) {
    // Find customer ID
    const customer = await prisma.customer.findFirst({
      where: {
        email: requestData.customerEmail,
        businessId: requestData.businessId,
      },
    });

    if (!customer) {
      console.warn(`Warning: Customer not found for ${requestData.customerEmail}`);
      continue;
    }

    const sentDate = new Date(Date.now() - requestData.daysOld * 24 * 60 * 60 * 1000);

    const reviewRequest = await prisma.reviewRequest.create({
      data: {
        businessId: requestData.businessId,
        customerId: customer.id,
        channel: requestData.channel as any,
        message: requestData.message,
        reviewUrl: `https://maps.google.com/review/test-business-${crypto.randomUUID()}`,
        status: requestData.status as any,
        deliveryStatus: requestData.deliveryStatus as any,
        sentAt: sentDate,
        createdAt: sentDate,
        updatedAt: sentDate,
      },
    });

    // Create related events
    const events = [
      {
        type: 'REQUEST_SENT',
        timestamp: sentDate,
        metadata: { channel: requestData.channel },
      },
    ];

    if (
      requestData.deliveryStatus === 'DELIVERED' ||
      requestData.deliveryStatus === 'OPENED' ||
      requestData.deliveryStatus === 'CLICKED'
    ) {
      events.push({
        type: 'MESSAGE_DELIVERED',
        timestamp: new Date(sentDate.getTime() + 5 * 60 * 1000), // 5 minutes later
        metadata: { deliveryStatus: requestData.deliveryStatus },
      });
    }

    if (requestData.deliveryStatus === 'OPENED' || requestData.deliveryStatus === 'CLICKED') {
      events.push({
        type: 'EMAIL_OPENED',
        timestamp: new Date(sentDate.getTime() + 2 * 60 * 60 * 1000), // 2 hours later
        metadata: { userAgent: 'Test Email Client' },
      });
    }

    if (requestData.deliveryStatus === 'CLICKED') {
      events.push({
        type: 'LINK_CLICKED',
        timestamp: new Date(sentDate.getTime() + 3 * 60 * 60 * 1000), // 3 hours later
        metadata: { clickUrl: reviewRequest.reviewUrl },
      });
    }

    for (const eventData of events) {
      await prisma.event.create({
        data: {
          reviewRequestId: reviewRequest.id,
          type: eventData.type as any,
          timestamp: eventData.timestamp,
          metadata: eventData.metadata,
        },
      });
    }
  }

  console.log(`✅ Created ${TEST_DATA_CONFIG.reviewRequests.length} review requests with events`);
}

/**
 * Create test GDPR requests
 */
async function createGDPRRequests() {
  console.log('⚖️ Creating GDPR requests...');

  const gdprService = getGDPRDataSubjectRightsService();

  for (const requestData of TEST_DATA_CONFIG.gdprRequests) {
    // Find customer
    const customer = await prisma.customer.findFirst({
      where: { email: requestData.customerEmail },
    });

    if (!customer) {
      console.warn(`Warning: Customer not found for ${requestData.customerEmail}`);
      continue;
    }

    const submittedDate = new Date(Date.now() - requestData.daysOld * 24 * 60 * 60 * 1000);
    const dueDate = new Date(submittedDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Create request directly in database for testing
    const gdprRequest = await prisma.dataSubjectRequest.create({
      data: {
        businessId: customer.businessId,
        customerId: customer.id,
        rightType: requestData.rightType as any,
        requestorEmail: requestData.customerEmail,
        requestorPhone: customer.phone,
        identityData: {
          firstName: customer.firstName,
          lastName: customer.lastName,
        },
        description: requestData.description,
        status: requestData.status as any,
        priority: requestData.priority as any,
        channel: 'CUSTOMER_PORTAL',
        submissionMethod: 'WEB_FORM',
        verificationRequired: requestData.status !== 'COMPLETED',
        verifiedAt: requestData.status !== 'PENDING' ? submittedDate : undefined,
        dueDate,
        createdAt: submittedDate,
        updatedAt: submittedDate,
        completedAt:
          requestData.status === 'COMPLETED'
            ? new Date(submittedDate.getTime() + 10 * 24 * 60 * 60 * 1000)
            : undefined,
      },
    });

    // Create identity verification record if needed
    if (requestData.status !== 'PENDING') {
      await prisma.identityVerification.create({
        data: {
          verificationId: crypto.randomUUID(),
          businessId: customer.businessId,
          requestorEmail: requestData.customerEmail,
          requestorPhone: customer.phone,
          identityData: {
            firstName: customer.firstName,
            lastName: customer.lastName,
          },
          requestType: requestData.rightType,
          status: 'VERIFIED',
          method: 'EMAIL_TOKEN',
          riskLevel: 'LOW',
          verifiedAt: new Date(submittedDate.getTime() + 60 * 60 * 1000), // 1 hour later
          gdprRequestId: gdprRequest.id,
        },
      });
    }
  }

  console.log(`✅ Created ${TEST_DATA_CONFIG.gdprRequests.length} GDPR requests`);
}

/**
 * Create test suppressions
 */
async function createSuppressions() {
  console.log('🚫 Creating suppression records...');

  for (const suppressionData of TEST_DATA_CONFIG.suppressions) {
    await prisma.suppression.create({
      data: {
        businessId: suppressionData.businessId,
        type: suppressionData.type as any,
        email: suppressionData.email,
        phone: suppressionData.phone,
        reason: suppressionData.reason,
        channel: suppressionData.channel as any,
        source: 'CUSTOMER_REQUEST',
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Random date within last 30 days
      },
    });
  }

  console.log(`✅ Created ${TEST_DATA_CONFIG.suppressions.length} suppression records`);
}

/**
 * Create test retention policies
 */
async function createRetentionPolicies() {
  console.log('📋 Creating retention policies...');

  const lifecycleService = getGDPRDataLifecycleService();

  for (const policyData of TEST_DATA_CONFIG.retentionPolicies) {
    const result = await lifecycleService.createRetentionPolicy(
      policyData.businessId,
      {
        name: policyData.name,
        description: policyData.description,
        dataCategory: policyData.dataCategory as any,
        entityTypes: ['customers'],
        retentionPeriod: policyData.retentionPeriod,
        retentionUnit: policyData.retentionUnit as any,
        actionAfterRetention: policyData.actionAfterRetention as any,
        legalBasis: 'Data protection and privacy compliance testing',
        jurisdiction: 'UK',
        autoApply: false,
        requiresApproval: true,
        priority: 'MEDIUM',
        isActive: policyData.isActive,
        createdBy: 'test-setup-script',
      },
      { userId: 'test-setup-script' }
    );

    if (!result.success) {
      console.warn(`Warning: Failed to create retention policy ${policyData.name}`);
    }
  }

  console.log(`✅ Created ${TEST_DATA_CONFIG.retentionPolicies.length} retention policies`);
}

/**
 * Generate sample audit events
 */
async function generateAuditEvents() {
  console.log('📝 Generating audit events...');

  const auditService = getGDPRComplianceAuditService();

  const eventTypes = [
    { type: 'DATA_PROCESSED', category: 'PROCESSING', severity: 'LOW' },
    { type: 'CONSENT_GIVEN', category: 'CONSENT', severity: 'LOW' },
    { type: 'CONSENT_WITHDRAWN', category: 'CONSENT', severity: 'MEDIUM' },
    { type: 'DATA_EXPORTED', category: 'RIGHTS', severity: 'MEDIUM' },
    { type: 'DATA_RECTIFIED', category: 'RIGHTS', severity: 'LOW' },
    { type: 'GDPR_REQUEST_SUBMITTED', category: 'RIGHTS', severity: 'LOW' },
    { type: 'GDPR_REQUEST_PROCESSED', category: 'RIGHTS', severity: 'LOW' },
  ];

  const customers = await prisma.customer.findMany({
    where: { businessId: 'test-business-001' },
  });

  // Generate 50 random audit events over the past 30 days
  for (let i = 0; i < 50; i++) {
    const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
    const customer = customers[Math.floor(Math.random() * customers.length)];
    const eventDate = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000);

    await auditService.logComplianceEvent({
      businessId: 'test-business-001',
      eventType: eventType.type as any,
      category: eventType.category as any,
      severity: eventType.severity as any,
      dataSubjectId: customer.id,
      dataSubjectType: 'CUSTOMER',
      processingPurpose: `Test ${eventType.type.toLowerCase().replace('_', ' ')} activity`,
      legalBasis: 'CONSENT',
      dataCategories: ['personal_data'],
      processingLocation: 'UK',
      systemId: 'test_system',
      triggeredBy: 'test-setup-script',
      automated: true,
      description: `Generated test event: ${eventType.type}`,
      retentionPeriod: 2555,
      specialCategory: false,
      childData: false,
      correlationId: crypto.randomUUID(),
      metadata: {
        testEvent: true,
        generatedAt: eventDate.toISOString(),
        eventIndex: i,
      },
    });

    // Add some delay to ensure proper timestamp ordering
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  console.log('✅ Generated 50 audit events');
}

/**
 * Create demo breach record
 */
async function createDemoBreachRecord() {
  console.log('🚨 Creating demo breach record...');

  const breachId = crypto.randomUUID();
  const detectedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago

  await prisma.personalDataBreach.create({
    data: {
      breachId,
      businessId: 'test-business-001',
      breachType: 'CONFIDENTIALITY',
      severity: 'MEDIUM',
      status: 'CONTAINED',
      detectedAt,
      detectionMethod: 'AUTOMATED',
      detectedBy: 'security_monitoring_system',
      title: 'Demo Security Alert - Unauthorized Access Attempt',
      description:
        'Automated security monitoring detected multiple failed login attempts from suspicious IP addresses, followed by successful authentication using potentially compromised credentials.',
      affectedSystems: ['customer_database', 'api_gateway', 'admin_portal'],
      dataCategories: ['personal_data', 'contact_information', 'account_data'],
      specialCategories: [],
      dataSubjectsAffected: 150,
      recordsAffected: 300,
      approximateNumbers: true,
      riskLevel: 'MEDIUM',
      likelyConsequences: [
        'Potential unauthorized access to customer contact information',
        'Possible identity theft risk for affected customers',
        'Risk of targeted phishing campaigns using stolen data',
      ],
      riskMitigated: true,
      mitigationMeasures: [
        'Forced password reset for all potentially affected accounts',
        'Enhanced monitoring and alerting implemented',
        'IP blocking rules updated to prevent similar attacks',
        'Two-factor authentication enforced for all admin accounts',
      ],
      authorityNotificationRequired: true,
      authorityNotificationDeadline: new Date(detectedAt.getTime() + 72 * 60 * 60 * 1000),
      subjectNotificationRequired: false, // Risk was mitigated
      containmentActions: [
        {
          action: 'Suspicious IP addresses blocked via firewall',
          takenAt: new Date(detectedAt.getTime() + 30 * 60 * 1000),
          takenBy: 'security_team',
          effective: true,
        },
        {
          action: 'Potentially compromised accounts locked pending investigation',
          takenAt: new Date(detectedAt.getTime() + 45 * 60 * 1000),
          takenBy: 'security_team',
          effective: true,
        },
        {
          action: 'Enhanced logging and monitoring activated',
          takenAt: new Date(detectedAt.getTime() + 60 * 60 * 1000),
          takenBy: 'it_operations',
          effective: true,
        },
      ],
      recoveryActions: [
        {
          action: 'Conduct full security audit of affected systems',
          plannedAt: new Date(detectedAt.getTime() + 24 * 60 * 60 * 1000),
          completedAt: new Date(detectedAt.getTime() + 72 * 60 * 60 * 1000),
          assignedTo: 'external_security_consultant',
          status: 'COMPLETED',
        },
        {
          action: 'Update incident response procedures based on lessons learned',
          plannedAt: new Date(detectedAt.getTime() + 7 * 24 * 60 * 60 * 1000),
          assignedTo: 'security_manager',
          status: 'IN_PROGRESS',
        },
      ],
      notifications: {
        authority: {
          notifiedAt: new Date(detectedAt.getTime() + 48 * 60 * 60 * 1000),
          notificationId: 'ICO-DEMO-' + breachId.substring(0, 8),
          followUpRequired: false,
        },
        internal: {
          managementNotified: detectedAt,
          dpoNotified: new Date(detectedAt.getTime() + 15 * 60 * 1000),
          legalNotified: new Date(detectedAt.getTime() + 30 * 60 * 1000),
        },
      },
      regulatoryCompliance: {
        articlesBreach: ['Article 32 - Security of processing'],
        lawfulBasisAffected: ['LEGITIMATE_INTERESTS'],
        retentionCompliance: true,
        consentAffected: false,
      },
      evidenceCollected: [
        {
          type: 'SYSTEM_LOGS',
          description: 'Web server access logs showing suspicious activity',
          collectedAt: new Date(detectedAt.getTime() + 60 * 60 * 1000),
          location: '/var/log/nginx/access.log',
        },
        {
          type: 'SECURITY_SCAN',
          description: 'Vulnerability scan results of affected systems',
          collectedAt: new Date(detectedAt.getTime() + 24 * 60 * 60 * 1000),
          location: 'security_scans/breach_investigation_' + breachId.substring(0, 8) + '.pdf',
        },
      ],
      lessons: [
        {
          lesson: 'Current IP blocking rules were insufficient for advanced persistent threats',
          actionRequired: 'Implement geographical IP blocking and behavioral analysis',
          priority: 'HIGH',
        },
        {
          lesson: 'Detection time could be improved with better automated alerting',
          actionRequired: 'Upgrade SIEM solution and tune alerting thresholds',
          priority: 'MEDIUM',
        },
      ],
      correlationId: crypto.randomUUID(),
      metadata: {
        testBreach: true,
        generatedForDemo: true,
        attackVector: 'credential_stuffing',
        sourceIpRange: '203.0.113.0/24',
        affectedUserAgents: ['Mozilla/5.0 (automated)', 'curl/7.68.0'],
      },
    },
  });

  console.log(`✅ Created demo breach record: ${breachId}`);
}

/**
 * Run the setup
 */
if (require.main === module) {
  setupTestData()
    .catch(error => {
      console.error('Setup failed:', error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { setupTestData };

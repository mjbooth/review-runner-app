// Personalization variables for message composition
export interface PersonalizationVariable {
  id: string;
  name: string;
  description: string;
  example: string;
  category: 'customer' | 'business' | 'service' | 'system';
  required: boolean;
  validation?: (value: string) => boolean;
}

export interface VariableCategory {
  id: string;
  name: string;
  description: string;
  variables: PersonalizationVariable[];
}

// Message limits and validation constants
export const SMS_LIMITS = {
  CHARACTER_LIMIT_SINGLE: 160,
  CHARACTER_LIMIT_MULTI: 153, // Reduced limit for multi-part SMS due to headers
} as const;

export const EMAIL_LIMITS = {
  SUBJECT_CHARACTER_LIMIT: 78, // Recommended subject line limit
  BODY_CHARACTER_SOFT_LIMIT: 1000, // Soft limit for good deliverability
  BODY_CHARACTER_HARD_LIMIT: 50000, // Technical limit
} as const;

// Available personalization variables
export const personalizationVariables: PersonalizationVariable[] = [
  // Customer Variables
  {
    id: 'customerName',
    name: '{{customerName}}',
    description: "Customer's full name (first + last)",
    example: 'John Smith',
    category: 'customer',
    required: true,
  },
  {
    id: 'firstName',
    name: '{{firstName}}',
    description: "Customer's first name only",
    example: 'John',
    category: 'customer',
    required: true,
  },
  {
    id: 'lastName',
    name: '{{lastName}}',
    description: "Customer's last name only",
    example: 'Smith',
    category: 'customer',
    required: true,
  },
  {
    id: 'customerEmail',
    name: '{{customerEmail}}',
    description: "Customer's email address",
    example: 'john@example.com',
    category: 'customer',
    required: true,
  },
  {
    id: 'customerPhone',
    name: '{{customerPhone}}',
    description: "Customer's phone number",
    example: '07823 337 419',
    category: 'customer',
    required: false,
  },

  // Business Variables
  {
    id: 'businessName',
    name: '{{businessName}}',
    description: 'Your business name',
    example: 'Amazing Plumbing Services',
    category: 'business',
    required: true,
  },
  {
    id: 'businessOwner',
    name: '{{businessOwner}}',
    description: "Business owner's name",
    example: 'Sarah Johnson',
    category: 'business',
    required: false,
  },
  {
    id: 'businessPhone',
    name: '{{businessPhone}}',
    description: 'Business phone number',
    example: '020 7123 4567',
    category: 'business',
    required: false,
  },
  {
    id: 'businessWebsite',
    name: '{{businessWebsite}}',
    description: 'Business website URL',
    example: 'www.amazingplumbing.co.uk',
    category: 'business',
    required: false,
  },

  // Service Variables
  {
    id: 'serviceDate',
    name: '{{serviceDate}}',
    description: 'Date when service was provided',
    example: '15th March 2024',
    category: 'service',
    required: false,
  },
  {
    id: 'serviceType',
    name: '{{serviceType}}',
    description: 'Type of service provided',
    example: 'Boiler repair',
    category: 'service',
    required: false,
  },
  {
    id: 'serviceValue',
    name: '{{serviceValue}}',
    description: 'Value/cost of service provided',
    example: '£150',
    category: 'service',
    required: false,
  },
  {
    id: 'projectDescription',
    name: '{{projectDescription}}',
    description: 'Brief description of work completed',
    example: 'Kitchen sink installation',
    category: 'service',
    required: false,
  },

  // System Variables
  {
    id: 'reviewUrl',
    name: '{{reviewUrl}}',
    description: 'Unique tracking URL for this review request',
    example: 'https://reviews.example.com/r/abc123',
    category: 'system',
    required: true,
  },
  {
    id: 'currentDate',
    name: '{{currentDate}}',
    description: "Today's date",
    example: '20th March 2024',
    category: 'system',
    required: false,
  },
  {
    id: 'unsubscribeUrl',
    name: '{{unsubscribeUrl}}',
    description: 'Unsubscribe link (email only)',
    example: 'https://reviews.example.com/unsubscribe/abc123',
    category: 'system',
    required: false,
  },
];

// Group variables by category
export const variableCategories: VariableCategory[] = [
  {
    id: 'customer',
    name: 'Customer Details',
    description: 'Information about your customer',
    variables: personalizationVariables.filter(v => v.category === 'customer'),
  },
  {
    id: 'business',
    name: 'Business Information',
    description: 'Details about your business',
    variables: personalizationVariables.filter(v => v.category === 'business'),
  },
  {
    id: 'service',
    name: 'Service Details',
    description: 'Information about the service provided',
    variables: personalizationVariables.filter(v => v.category === 'service'),
  },
  {
    id: 'system',
    name: 'System Generated',
    description: 'Automatically generated links and dates',
    variables: personalizationVariables.filter(v => v.category === 'system'),
  },
];

// Helper functions for variable manipulation
export function extractVariablesFromTemplate(template: string): string[] {
  const variableRegex = /\{\{([^}]+)\}\}/g;
  const matches: string[] = [];
  let match;

  while ((match = variableRegex.exec(template)) !== null) {
    if (!matches.includes(match[1])) {
      matches.push(match[1]);
    }
  }

  return matches;
}

export function validateRequiredVariables(template: string): {
  isValid: boolean;
  missing: string[];
} {
  const usedVariables = extractVariablesFromTemplate(template);
  const requiredVariables = personalizationVariables.filter(v => v.required).map(v => v.id);

  const missing = requiredVariables.filter(req => !usedVariables.includes(req));

  return {
    isValid: missing.length === 0,
    missing,
  };
}

export function replaceVariablesWithData(
  template: string,
  customerData: any,
  businessData?: any,
  serviceData?: any
): string {
  let result = template;

  // Sample data for preview (fallback when real data isn't available)
  const sampleData = {
    customerName:
      `${customerData?.firstName || 'John'} ${customerData?.lastName || 'Smith'}`.trim(),
    firstName: customerData?.firstName || 'John',
    lastName: customerData?.lastName || 'Smith',
    customerEmail: customerData?.email || 'john@example.com',
    customerPhone: customerData?.phone || '07823 337 419',
    businessName: businessData?.name || 'Amazing Plumbing Services',
    businessOwner: businessData?.owner || 'Sarah Johnson',
    businessPhone: businessData?.phone || '020 7123 4567',
    businessWebsite: businessData?.website || 'www.amazingplumbing.co.uk',
    serviceDate: serviceData?.date || '15th March 2024',
    serviceType: serviceData?.type || 'Boiler repair',
    serviceValue: serviceData?.value || '£150',
    projectDescription: serviceData?.description || 'Kitchen sink installation',
    reviewUrl: 'https://reviews.example.com/r/abc123',
    currentDate: new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    unsubscribeUrl: 'https://reviews.example.com/unsubscribe/abc123',
  };

  // Replace all variables
  Object.entries(sampleData).forEach(([key, value]) => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value);
  });

  return result;
}

export function calculateMessageMetrics(
  message: string,
  channel: 'sms' | 'email'
): {
  characterCount: number;
  segmentCount: number;
  warnings: string[];
} {
  const warnings: string[] = [];
  const characterCount = message.length;

  if (channel === 'sms') {
    let segmentCount = 1;

    if (characterCount > SMS_LIMITS.CHARACTER_LIMIT_SINGLE) {
      segmentCount = Math.ceil(characterCount / SMS_LIMITS.CHARACTER_LIMIT_MULTI);

      warnings.push(`This message will be sent as ${segmentCount} SMS segments.`);
    }

    if (characterCount > SMS_LIMITS.CHARACTER_LIMIT_SINGLE * 3) {
      warnings.push(
        'Very long SMS messages may have poor delivery rates. Consider shortening or switching to email.'
      );
    }

    return {
      characterCount,
      segmentCount,
      warnings,
    };
  } else {
    // Email metrics
    if (characterCount > EMAIL_LIMITS.BODY_CHARACTER_SOFT_LIMIT) {
      warnings.push(
        'Long emails may be truncated by some email clients. Consider making it more concise.'
      );
    }

    if (characterCount > EMAIL_LIMITS.BODY_CHARACTER_HARD_LIMIT) {
      warnings.push('Email is extremely long and may not deliver properly.');
    }

    return {
      characterCount,
      segmentCount: 1,
      warnings,
    };
  }
}

export function getCharacterCountColor(
  count: number,
  channel: 'sms' | 'email'
): 'green' | 'yellow' | 'red' {
  if (channel === 'sms') {
    if (count <= SMS_LIMITS.CHARACTER_LIMIT_SINGLE * 0.8) return 'green';
    if (count <= SMS_LIMITS.CHARACTER_LIMIT_SINGLE) return 'yellow';
    return 'red';
  } else {
    if (count <= EMAIL_LIMITS.BODY_CHARACTER_SOFT_LIMIT * 0.8) return 'green';
    if (count <= EMAIL_LIMITS.BODY_CHARACTER_SOFT_LIMIT) return 'yellow';
    return 'red';
  }
}

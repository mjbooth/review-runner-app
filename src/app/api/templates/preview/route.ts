import { type NextRequest, NextResponse } from 'next/server';
import { getBusinessContext } from '@/lib/auth-context';
import {
  templatePreviewSchema,
  type TemplatePreview,
  extractVariables,
  allValidVariables,
} from '@/lib/validators/reviewRequest';

// Default sample data for template preview
const defaultSampleData = {
  customerName: 'John Smith',
  firstName: 'John',
  lastName: 'Smith',
  email: 'john.smith@example.com',
  phone: '+44 7700 900123',
  businessName: 'The Great British Restaurant',
  website: 'https://greatbritishrestaurant.co.uk',
  reviewUrl: 'https://g.page/great-british-restaurant/review',
};

// Function to replace variables in template content
const replaceTemplateVariables = (content: string, data: Record<string, string>): string => {
  let result = content;

  // Replace all template variables
  Object.entries(data).forEach(([key, value]) => {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    result = result.replace(regex, value);
  });

  return result;
};

// Function to calculate SMS segments
const calculateSmsMetrics = (content: string) => {
  const length = content.length;
  const segments = Math.ceil(length / 160);

  return {
    characterCount: length,
    segments,
    isOverLimit: length > 160,
  };
};

// Function to calculate email metrics
const calculateEmailMetrics = (content: string, subject?: string) => {
  const contentLength = content.length;
  const subjectLength = subject ? subject.length : 0;

  return {
    contentLength,
    subjectLength,
    totalLength: contentLength + subjectLength,
  };
};

// POST /api/templates/preview - Preview template with sample data
export async function POST(request: NextRequest) {
  try {
    // Authenticate request
    await getBusinessContext();

    // Parse and validate request body
    const body = await request.json();
    const validatedData = templatePreviewSchema.parse(body);

    const { content, subject, channel, sampleData } = validatedData;

    // Use provided sample data or defaults
    const previewData = {
      ...defaultSampleData,
      ...sampleData,
    };

    // Extract variables from template
    const contentVariables = extractVariables(content);
    const subjectVariables = subject ? extractVariables(subject) : [];
    const allTemplateVariables = [...new Set([...contentVariables, ...subjectVariables])];

    // Check for invalid variables
    const invalidVariables = allTemplateVariables.filter(v => !allValidVariables.includes(v));
    if (invalidVariables.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_VARIABLES',
            message: `Invalid personalization variables: ${invalidVariables.join(', ')}`,
            details: {
              invalidVariables,
              validVariables: allValidVariables,
            },
          },
        },
        { status: 400 }
      );
    }

    // Generate preview content
    const previewContent = replaceTemplateVariables(content, previewData);
    const previewSubject = subject ? replaceTemplateVariables(subject, previewData) : undefined;

    // Calculate metrics based on channel
    const metrics =
      channel === 'SMS'
        ? calculateSmsMetrics(previewContent)
        : calculateEmailMetrics(previewContent, previewSubject);

    // Check for missing variables (variables that weren't replaced)
    const missingVariables = allTemplateVariables.filter(
      variable => !previewData.hasOwnProperty(variable)
    );

    // Validation status
    const requiredVariables = ['customerName', 'businessName', 'reviewUrl'];
    const hasRequiredCustomerName =
      allTemplateVariables.includes('customerName') ||
      (allTemplateVariables.includes('firstName') && allTemplateVariables.includes('lastName'));
    const hasBusinessName = allTemplateVariables.includes('businessName');
    const hasReviewUrl = allTemplateVariables.includes('reviewUrl');

    const validationIssues = [];
    if (!hasRequiredCustomerName) {
      validationIssues.push(
        'Missing customer name ({{customerName}} or {{firstName}} + {{lastName}})'
      );
    }
    if (!hasBusinessName) {
      validationIssues.push('Missing business name ({{businessName}})');
    }
    if (!hasReviewUrl) {
      validationIssues.push('Missing review URL ({{reviewUrl}})');
    }

    const isValid = validationIssues.length === 0;

    // Generate response
    const previewResult = {
      preview: {
        content: previewContent,
        subject: previewSubject,
        channel,
      },
      variables: {
        detected: allTemplateVariables,
        missing: missingVariables,
        invalid: invalidVariables,
        required: requiredVariables,
      },
      validation: {
        isValid,
        issues: validationIssues,
      },
      metrics,
      sampleData: previewData,
    };

    return NextResponse.json({
      success: true,
      data: previewResult,
    });
  } catch (error) {
    console.error('Template preview error:', error);

    if (error instanceof Error) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'TEMPLATE_PREVIEW_FAILED',
            message: error.message,
          },
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to generate template preview',
        },
      },
      { status: 500 }
    );
  }
}

// GET /api/templates/preview - Get sample data and validation info
export async function GET(request: NextRequest) {
  try {
    // Authenticate request
    await getBusinessContext();

    return NextResponse.json({
      success: true,
      data: {
        sampleData: defaultSampleData,
        validVariables: allValidVariables,
        requiredVariables: ['customerName', 'businessName', 'reviewUrl'],
        optionalVariables: ['firstName', 'lastName', 'email', 'phone', 'website'],
        channelLimits: {
          SMS: {
            characterLimit: 160,
            maxRecommendedLength: 160,
          },
          EMAIL: {
            subjectLimit: 200,
            contentLimit: 1600,
          },
        },
      },
    });
  } catch (error) {
    console.error('Template preview info error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get preview information',
        },
      },
      { status: 500 }
    );
  }
}

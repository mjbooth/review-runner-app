import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getBusinessContext } from '@/lib/auth-context';
import { createBusinessScope } from '@/lib/db/businessScoped';
import {
  createMessageTemplateSchema,
  templateQuerySchema,
  type CreateMessageTemplateInput,
  type TemplateQuery,
  extractVariables,
} from '@/lib/validators/reviewRequest';

// GET /api/templates - List templates with filtering and search
export async function GET(request: NextRequest) {
  try {
    // Get business context
    const context = await getBusinessContext();
    const businessId = context.businessId;
    const businessScope = createBusinessScope(businessId);

    // Parse and validate query parameters
    const url = new URL(request.url);
    const queryParams: any = {
      page: url.searchParams.get('page') ? parseInt(url.searchParams.get('page')!) : 1,
      limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : 20,
      templateType: url.searchParams.get('templateType') || 'all',
      sortBy: url.searchParams.get('sortBy') || 'createdAt',
      sortOrder: url.searchParams.get('sortOrder') || 'desc',
    };

    // Only add optional parameters if they have values
    const categoryParam = url.searchParams.get('category');
    const channelParam = url.searchParams.get('channel');
    const searchParam = url.searchParams.get('search');

    if (categoryParam) queryParams.category = categoryParam;
    if (channelParam) queryParams.channel = channelParam;
    if (searchParam) queryParams.search = searchParam;

    const validatedQuery = templateQuerySchema.parse(queryParams);
    const { page, limit, category, channel, templateType, search, sortBy, sortOrder } =
      validatedQuery;

    // Build where clause for filtering
    const whereClause: any = {
      isActive: true,
    };

    // Template type filtering (system, business, or all)
    if (templateType === 'system') {
      whereClause.templateType = 'system';
      whereClause.businessId = null;
    } else if (templateType === 'business') {
      whereClause.templateType = 'business';
      whereClause.businessId = businessId;
    } else {
      // Default: show both system and business templates
      whereClause.OR = [
        { templateType: 'system', businessId: null },
        { templateType: 'business', businessId: businessId },
      ];
    }

    // Additional filters
    if (category) {
      whereClause.category = category;
    }
    if (channel) {
      whereClause.channel = channel;
    }
    if (search) {
      whereClause.OR = whereClause.OR
        ? [
            ...whereClause.OR.map((condition: any) => ({
              ...condition,
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
                { content: { contains: search, mode: 'insensitive' } },
              ],
            })),
          ]
        : [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { content: { contains: search, mode: 'insensitive' } },
          ];
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Execute queries
    const [templates, totalCount] = await Promise.all([
      prisma.messageTemplate.findMany({
        where: whereClause,
        orderBy: { [sortBy]: sortOrder },
        take: limit,
        skip: skip,
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          channel: true,
          subject: true,
          content: true,
          variables: true,
          templateType: true,
          businessId: true,
          usageCount: true,
          createdAt: true,
          updatedAt: true,
          lastUsedAt: true,
        },
      }),
      prisma.messageTemplate.count({
        where: whereClause,
      }),
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return NextResponse.json({
      success: true,
      data: templates,
      meta: {
        pagination: {
          page,
          limit,
          totalCount,
          totalPages,
          hasNextPage,
          hasPrevPage,
        },
      },
    });
  } catch (error) {
    console.error('Templates GET error:', error);

    if (error instanceof Error) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'TEMPLATES_FETCH_FAILED',
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
          message: 'Failed to fetch templates',
        },
      },
      { status: 500 }
    );
  }
}

// POST /api/templates - Create new business template
export async function POST(request: NextRequest) {
  try {
    // Get business context
    const context = await getBusinessContext();
    const businessId = context.businessId;
    const businessScope = createBusinessScope(businessId);

    // Parse and validate request body
    const body = await request.json();
    const validatedData = createMessageTemplateSchema.parse(body);

    // Ensure only businesses can create business templates
    if (validatedData.templateType === 'system') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'PERMISSION_DENIED',
            message: 'Only system administrators can create system templates',
          },
        },
        { status: 403 }
      );
    }

    // Extract variables from content and subject
    const contentVariables = extractVariables(validatedData.content);
    const subjectVariables = validatedData.subject ? extractVariables(validatedData.subject) : [];
    const allVariables = [...new Set([...contentVariables, ...subjectVariables])];

    // Create the template
    const template = await businessScope.createMessageTemplate({
      name: validatedData.name,
      description: validatedData.description,
      category: validatedData.category,
      channel: validatedData.channel,
      subject: validatedData.subject,
      content: validatedData.content,
      variables: allVariables,
      templateType: 'business', // Force business type for API-created templates
      usageCount: 0,
    });

    return NextResponse.json(
      {
        success: true,
        data: template,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Template creation error:', error);

    if (error instanceof Error) {
      // Handle validation errors
      if (
        error.message.includes('Invalid personalization variables') ||
        error.message.includes('Template must include')
      ) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
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
            code: 'TEMPLATE_CREATION_FAILED',
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
          message: 'Failed to create template',
        },
      },
      { status: 500 }
    );
  }
}

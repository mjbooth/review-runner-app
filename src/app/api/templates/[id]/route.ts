import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getBusinessContext } from '@/lib/auth-context';
import { createBusinessScope } from '@/lib/db/businessScoped';
import {
  updateMessageTemplateSchema,
  type UpdateMessageTemplateInput,
  extractVariables,
} from '@/lib/validators/reviewRequest';

interface RouteContext {
  params: {
    id: string;
  };
}

// GET /api/templates/[id] - Get single template
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    // Get business context
    const context = await getBusinessContext();
    const businessId = context.businessId;

    const templateId = params.id;

    // Find template (system templates or business-owned templates)
    const template = await prisma.messageTemplate.findFirst({
      where: {
        id: templateId,
        isActive: true,
        OR: [
          { templateType: 'system', businessId: null }, // System templates
          { templateType: 'business', businessId: businessId }, // Business templates
        ],
      },
      include: {
        business: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!template) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'TEMPLATE_NOT_FOUND',
            message: 'Template not found or access denied',
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: template,
    });
  } catch (error) {
    console.error('Template GET error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch template',
        },
      },
      { status: 500 }
    );
  }
}

// PUT /api/templates/[id] - Update business template
export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    // Get business context
    const context = await getBusinessContext();
    const businessId = context.businessId;
    const businessScope = createBusinessScope(businessId);

    const templateId = params.id;

    // Parse and validate request body
    const body = await request.json();
    const validatedData = updateMessageTemplateSchema.parse(body);

    // Check if template exists and belongs to this business
    const existingTemplate = await prisma.messageTemplate.findFirst({
      where: {
        id: templateId,
        businessId: businessId,
        templateType: 'business', // Only business templates can be updated
        isActive: true,
      },
    });

    if (!existingTemplate) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'TEMPLATE_NOT_FOUND',
            message: 'Template not found or cannot be modified',
          },
        },
        { status: 404 }
      );
    }

    // Extract variables if content is being updated
    let variables = existingTemplate.variables;
    if (validatedData.content || validatedData.subject) {
      const content = validatedData.content || existingTemplate.content;
      const subject = validatedData.subject || existingTemplate.subject;

      const contentVariables = extractVariables(content);
      const subjectVariables = subject ? extractVariables(subject) : [];
      variables = [...new Set([...contentVariables, ...subjectVariables])];
    }

    // Update the template
    const updatedTemplate = await businessScope.updateMessageTemplate(templateId, {
      ...validatedData,
      variables,
      lastUsedAt: validatedData.content || validatedData.subject ? new Date() : undefined,
    });

    return NextResponse.json({
      success: true,
      data: updatedTemplate,
    });
  } catch (error) {
    console.error('Template update error:', error);

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

      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'TEMPLATE_NOT_FOUND',
              message: error.message,
            },
          },
          { status: 404 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'TEMPLATE_UPDATE_FAILED',
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
          message: 'Failed to update template',
        },
      },
      { status: 500 }
    );
  }
}

// DELETE /api/templates/[id] - Delete business template
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    // Get business context
    const context = await getBusinessContext();
    const businessId = context.businessId;

    const templateId = params.id;

    // Check if template exists and belongs to this business
    const existingTemplate = await prisma.messageTemplate.findFirst({
      where: {
        id: templateId,
        businessId: businessId,
        templateType: 'business', // Only business templates can be deleted
        isActive: true,
      },
    });

    if (!existingTemplate) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'TEMPLATE_NOT_FOUND',
            message: 'Template not found or cannot be deleted',
          },
        },
        { status: 404 }
      );
    }

    // Check if template is being used in any active review requests
    const activeUsage = await prisma.reviewRequest.findFirst({
      where: {
        templateId: templateId,
        businessId: businessId,
        status: {
          in: ['DRAFT', 'QUEUED', 'SENT'], // Active statuses
        },
        isActive: true,
      },
    });

    if (activeUsage) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'TEMPLATE_IN_USE',
            message: 'Cannot delete template that is currently in use by active review requests',
          },
        },
        { status: 409 }
      );
    }

    // Soft delete the template
    await prisma.messageTemplate.update({
      where: { id: templateId },
      data: {
        isActive: false,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: templateId,
        deleted: true,
      },
    });
  } catch (error) {
    console.error('Template delete error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to delete template',
        },
      },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

// Tracking URLs should be publicly accessible - no authentication required

// GET /r/[uuid] - Handle review request tracking and redirect
export async function GET(
  request: NextRequest,
  { params }: { params: { uuid: string } }
) {
  console.log('🎯 TRACKING ROUTE HANDLER REACHED!', { uuid: params.uuid });
  
  try {
    const { uuid } = params;
    
    // Get client information for tracking
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const ipAddress = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown';
    const referer = request.headers.get('referer');

    logger.info('Tracking link accessed', {
      uuid,
      userAgent,
      ipAddress,
      referer,
    });

    // Find review request by tracking UUID
    const reviewRequest = await prisma.reviewRequest.findUnique({
      where: { trackingUuid: uuid },
      include: {
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        business: {
          select: {
            id: true,
            name: true,
            googleReviewUrl: true,
            website: true,
          },
        },
      },
    });

    // Handle invalid or expired links
    if (!reviewRequest) {
      logger.warn('Invalid tracking link accessed', { uuid, ipAddress });
      return new NextResponse(
        generateErrorPage(
          'Link Not Found',
          'This review link is invalid or has expired.',
          'If you believe this is an error, please contact the business directly.'
        ),
        {
          status: 404,
          headers: { 'Content-Type': 'text/html' },
        }
      );
    }

    // Check if request is still active
    if (!reviewRequest.isActive || reviewRequest.status === 'OPTED_OUT') {
      logger.info('Inactive or opted-out link accessed', { 
        uuid, 
        status: reviewRequest.status,
        isActive: reviewRequest.isActive,
      });
      return new NextResponse(
        generateErrorPage(
          'Link Inactive',
          'This review request is no longer active.',
          'You may have already submitted your review or opted out of communications.'
        ),
        {
          status: 410, // Gone
          headers: { 'Content-Type': 'text/html' },
        }
      );
    }

    // Track the click if not already clicked
    if (!reviewRequest.clickedAt) {
      await prisma.$transaction(async (tx) => {
        // Update review request with click information
        await tx.reviewRequest.update({
          where: { id: reviewRequest.id },
          data: {
            clickedAt: new Date(),
            status: 'CLICKED',
            clickMetadata: {
              userAgent,
              ipAddress,
              referer,
              timestamp: new Date().toISOString(),
            },
          },
        });

        // Create click event
        await tx.event.create({
          data: {
            businessId: reviewRequest.businessId,
            reviewRequestId: reviewRequest.id,
            type: 'REQUEST_CLICKED',
            source: 'redirect',
            description: `Review link clicked by ${reviewRequest.customer.firstName} ${reviewRequest.customer.lastName}`,
            metadata: {
              trackingUuid: uuid,
              customerEmail: reviewRequest.customer.email,
              userAgent,
              ipAddress,
              referer,
            },
          },
        });
      });

      logger.info('Review request marked as clicked', {
        requestId: reviewRequest.id,
        customerId: reviewRequest.customerId,
        businessId: reviewRequest.businessId,
      });
    } else {
      // Log repeat click
      logger.info('Repeat click on review request', {
        requestId: reviewRequest.id,
        previousClickAt: reviewRequest.clickedAt,
      });

      // Still create an event for repeat clicks
      await prisma.event.create({
        data: {
          businessId: reviewRequest.businessId,
          reviewRequestId: reviewRequest.id,
          type: 'REQUEST_CLICKED',
          source: 'redirect',
          description: `Repeat click on review link by ${reviewRequest.customer.firstName} ${reviewRequest.customer.lastName}`,
          metadata: {
            trackingUuid: uuid,
            repeatClick: true,
            previousClickAt: reviewRequest.clickedAt,
            userAgent,
            ipAddress,
            referer,
          },
        },
      });
    }

    // Determine redirect URL
    const redirectUrl = reviewRequest.business.googleReviewUrl || 
                       reviewRequest.reviewUrl || 
                       reviewRequest.business.website ||
                       'https://google.com/maps';

    // Log the redirect
    logger.info('Redirecting to review URL', {
      requestId: reviewRequest.id,
      redirectUrl,
      customerName: `${reviewRequest.customer.firstName} ${reviewRequest.customer.lastName}`,
    });

    // Generate a tracking page with immediate redirect
    const redirectPage = generateRedirectPage(
      reviewRequest.business.name,
      redirectUrl,
      reviewRequest.customer.firstName
    );

    return new NextResponse(redirectPage, {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });

  } catch (error) {
    logger.error('Error processing tracking redirect', {
      uuid: params.uuid,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return new NextResponse(
      generateErrorPage(
        'Something Went Wrong',
        'We encountered an error processing your request.',
        'Please try again later or contact the business directly.'
      ),
      {
        status: 500,
        headers: { 'Content-Type': 'text/html' },
      }
    );
  }
}

// Generate HTML error page
function generateErrorPage(title: string, message: string, submessage: string): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${title} - Review Runner</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 20px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          padding: 40px;
          max-width: 500px;
          width: 100%;
          text-align: center;
        }
        .icon {
          width: 80px;
          height: 80px;
          margin: 0 auto 20px;
          background: #ff6b6b;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 40px;
        }
        h1 {
          color: #2d3748;
          font-size: 28px;
          margin-bottom: 15px;
          font-weight: 700;
        }
        p {
          color: #718096;
          font-size: 16px;
          line-height: 1.6;
          margin-bottom: 10px;
        }
        .submessage {
          font-size: 14px;
          color: #a0aec0;
          margin-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">⚠️</div>
        <h1>${title}</h1>
        <p>${message}</p>
        <p class="submessage">${submessage}</p>
      </div>
    </body>
    </html>
  `;
}

// Generate HTML redirect page with tracking
function generateRedirectPage(businessName: string, redirectUrl: string, customerName: string): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Redirecting to ${businessName} Reviews</title>
      <meta http-equiv="refresh" content="2;url=${redirectUrl}">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 20px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          padding: 40px;
          max-width: 500px;
          width: 100%;
          text-align: center;
        }
        .logo {
          width: 80px;
          height: 80px;
          margin: 0 auto 30px;
          background: linear-gradient(135deg, #667eea, #764ba2);
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 40px;
          color: white;
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        h1 {
          color: #2d3748;
          font-size: 24px;
          margin-bottom: 10px;
          font-weight: 600;
        }
        .greeting {
          color: #4a5568;
          font-size: 18px;
          margin-bottom: 20px;
        }
        .business {
          font-size: 20px;
          color: #667eea;
          font-weight: 600;
          margin: 15px 0;
        }
        p {
          color: #718096;
          font-size: 16px;
          line-height: 1.6;
          margin: 15px 0;
        }
        .spinner {
          width: 50px;
          height: 50px;
          border: 3px solid #e2e8f0;
          border-top: 3px solid #667eea;
          border-radius: 50%;
          margin: 20px auto;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .manual-link {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #e2e8f0;
        }
        a {
          color: #667eea;
          text-decoration: none;
          font-weight: 500;
          transition: color 0.2s;
        }
        a:hover {
          color: #764ba2;
          text-decoration: underline;
        }
        .footer {
          margin-top: 30px;
          font-size: 12px;
          color: #a0aec0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">⭐</div>
        <p class="greeting">Hi ${customerName}! 👋</p>
        <h1>Taking you to</h1>
        <div class="business">${businessName}'s Review Page</div>
        <div class="spinner"></div>
        <p>You'll be redirected automatically in a moment...</p>
        
        <div class="manual-link">
          <p>Not redirecting?</p>
          <a href="${redirectUrl}" rel="noopener noreferrer">Click here to continue →</a>
        </div>
        
        <div class="footer">
          <p>Your feedback helps ${businessName} improve their service</p>
        </div>
      </div>
      
      <script>
        // Backup JavaScript redirect
        setTimeout(function() {
          window.location.href = '${redirectUrl}';
        }, 2000);
      </script>
    </body>
    </html>
  `;
}
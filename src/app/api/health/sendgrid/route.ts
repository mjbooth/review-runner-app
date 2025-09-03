import { type NextRequest, NextResponse } from 'next/server';
import { sendGridService } from '@/services/messaging';
import { logger } from '@/lib/logger';

export async function GET(_request: NextRequest) {
  try {
    logger.info('Checking SendGrid service health');

    const healthResult = await sendGridService.getHealthStatus();

    if (!healthResult.success) {
      return NextResponse.json(
        {
          success: false,
          service: 'SendGrid',
          status: 'unhealthy',
          error: healthResult.error,
          timestamp: new Date().toISOString(),
        },
        { status: 503 }
      );
    }

    const healthData = healthResult.data;

    logger.info('SendGrid health check completed', {
      status: healthData.status,
      initialized: healthData.initialized,
      apiKeyValid: healthData.apiKeyValid,
    });

    return NextResponse.json(
      {
        success: true,
        service: 'SendGrid',
        status: healthData.status,
        details: {
          initialized: healthData.initialized,
          apiKeyValid: healthData.apiKeyValid,
          config: healthData.config,
        },
        timestamp: new Date().toISOString(),
      },
      {
        status: healthData.status === 'healthy' ? 200 : 503,
      }
    );
  } catch (error) {
    logger.error('SendGrid health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      {
        success: false,
        service: 'SendGrid',
        status: 'unhealthy',
        error: 'Health check failed',
        details: {
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}

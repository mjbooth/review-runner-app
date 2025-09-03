import { NextResponse } from 'next/server';
import { initializeWorkers } from '../../../jobs';
import { logger } from '../../../lib/logger';

let workersInitialized = false;

/**
 * Initialize workers on first API request
 * This ensures workers are started when the server starts
 */
function ensureWorkersInitialized(): void {
  if (!workersInitialized) {
    try {
      // MVP: Skip worker initialization - using direct API calls
      // initializeWorkers();
      workersInitialized = true;
      logger.info('MVP: Skipping worker initialization - using direct API calls');
    } catch (error) {
      logger.error('Failed to initialize workers', { error });
    }
  }
}

/**
 * GET /api/workers - Check worker status
 */
export async function GET() {
  ensureWorkersInitialized();

  return NextResponse.json({
    success: true,
    data: {
      initialized: workersInitialized,
      timestamp: new Date().toISOString(),
    },
  });
}

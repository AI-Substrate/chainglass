import { NextResponse } from 'next/server';

/**
 * Health check endpoint for monitoring and load balancer probes.
 *
 * GET /api/health
 * Returns: { status: 'ok' } with HTTP 200
 */
export async function GET() {
  return NextResponse.json({ status: 'ok' });
}

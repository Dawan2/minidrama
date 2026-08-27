import type { FastifyInstance } from 'fastify';

export interface HealthResponse {
  readonly status: 'ok';
  readonly service: 'minidrama-api';
  readonly uptimeSec: number;
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (): Promise<HealthResponse> => {
    return {
      status: 'ok',
      service: 'minidrama-api',
      uptimeSec: Math.floor(process.uptime()),
    };
  });
}

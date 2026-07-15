/**
 * VeilPay — Express server entry point.
 *
 * Wires up middleware, mounts all route groups, initialises the database,
 * configures Midnight execution and starts listening.
 */

import 'dotenv/config';

import express, { type Request, type Response, type NextFunction } from 'express';
import type { Server } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import multer from 'multer';

import { initDatabase } from './database/init.js';
import midnightService, { MidnightConfigurationError } from './services/midnight.js';

import employerRoutes from './routes/employer.js';
import employeeRoutes from './routes/employee.js';
import complianceRoutes from './routes/compliance.js';

import type { ApiResponse } from './types/index.js';
import { assertCryptoConfiguration } from './utils/crypto.js';

// ────────────────────────────────────────────────────────────────────────────
// Configuration
// ────────────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const HOST = process.env.HOST?.trim() || '127.0.0.1';
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const LOG_FORMAT = process.env.LOG_FORMAT ?? 'dev';
const LACE_EXTENSION_ORIGIN = 'chrome-extension://gafhhkghbfjjkeiendhlofajokpaflmk';

// ────────────────────────────────────────────────────────────────────────────
// App setup
// ────────────────────────────────────────────────────────────────────────────

const app = express();

// Lace injects its DApp connector into the page's main execution world.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        scriptSrc: ["'self'", LACE_EXTENSION_ORIGIN],
      },
    },
  }),
);

// CORS
app.use(
  cors({
    origin: CORS_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }),
);

// Request logging
app.use(morgan(LOG_FORMAT));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ────────────────────────────────────────────────────────────────────────────
// Health check
// ────────────────────────────────────────────────────────────────────────────

app.get('/api/health', (_req: Request, res: Response) => {
  const response: ApiResponse = {
    success: true,
    data: {
      status: 'healthy',
      service: 'VeilPay Backend',
      version: '1.0.0',
      network: midnightService.getNetwork(),
      connected: midnightService.isConnected(),
      mode: midnightService.getMode(),
      executionReadiness: midnightService.getExecutionReadiness(),
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
  };
  res.json(response);
});

// ────────────────────────────────────────────────────────────────────────────
// Route groups
// ────────────────────────────────────────────────────────────────────────────

app.use('/api/employer', employerRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/compliance', complianceRoutes);

// Keep unknown API routes JSON-only, then serve the compiled React app in production.
app.use('/api', (_req: Request, res: Response) => {
  const response: ApiResponse = {
    success: false,
    error: 'Route not found',
  };
  res.status(404).json(response);
});

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(moduleDir, '../../frontend/dist');

if (process.env.NODE_ENV === 'production' && fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist, { index: false, maxAge: '1h' }));
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// ────────────────────────────────────────────────────────────────────────────
// 404 handler
// ────────────────────────────────────────────────────────────────────────────

app.use((_req: Request, res: Response) => {
  const response: ApiResponse = {
    success: false,
    error: 'Route not found',
  };
  res.status(404).json(response);
});

// ────────────────────────────────────────────────────────────────────────────
// Global error handler
// ────────────────────────────────────────────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[ERROR]', err);

  const isDev = process.env.NODE_ENV !== 'production';
  const isUploadError = err instanceof multer.MulterError;
  const requestStatus = (err as Error & { status?: number }).status;
  const status =
    err instanceof MidnightConfigurationError
      ? err.statusCode
      : isUploadError
        ? err.code === 'LIMIT_FILE_SIZE' ? 413 : 400
        : requestStatus && requestStatus >= 400 && requestStatus < 500
          ? requestStatus
          : 500;
  const response: ApiResponse = {
    success: false,
    error:
      isDev || err instanceof MidnightConfigurationError || isUploadError
        ? err.message
        : status < 500 ? 'Invalid request' : 'Internal server error',
    ...((isDev || err instanceof MidnightConfigurationError) && {
      meta: {
        ...(err instanceof MidnightConfigurationError ? err.details : {}),
        ...(isDev ? { stack: err.stack } : {}),
      },
    }),
  };

  res.status(status).json(response);
});

// ────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ────────────────────────────────────────────────────────────────────────────

export async function startServer(): Promise<Server> {
  assertCryptoConfiguration();

  // 1. Database
  initDatabase();

  // 2. Midnight execution configuration
  await midnightService.connectToNetwork({
    network: (process.env.MIDNIGHT_NETWORK as import('./types/index.js').MidnightNetworkConfig['network']) ?? 'testnet',
    indexerUrl: process.env.MIDNIGHT_INDEXER_URL ?? 'simulation://indexer',
    nodeUrl: process.env.MIDNIGHT_NODE_URL ?? 'simulation://node',
    proofServerUrl: process.env.MIDNIGHT_PROOF_SERVER_URL ?? 'simulation://proof-server',
  });

  // 3. Start listening
  return app.listen(PORT, HOST, () => {
    console.log('');
    console.log('  ╔═══════════════════════════════════════════════════════════╗');
    console.log('  ║                                                           ║');
    console.log('  ║   🛡️  VeilPay Backend — Privacy-Preserving Payroll      ║');
    console.log('  ║                                                           ║');
    console.log(`  ║   Server  : http://${HOST}:${PORT}`);
    console.log(`  ║   Network : ${midnightService.getNetwork().padEnd(44)}║`);
    console.log(`  ║   Mode    : ${midnightService.getMode().padEnd(44)}║`);
    console.log('  ║                                                           ║');
    console.log('  ║   Powered by Midnight Network • Zero-Knowledge Proofs     ║');
    console.log('  ║                                                           ║');
    console.log('  ╚═══════════════════════════════════════════════════════════╝');
    console.log('');
  });
}

const entryPoint = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;

if (entryPoint === import.meta.url) {
  startServer().catch((err) => {
    console.error('❌ Failed to start VeilPay backend:', err);
    process.exit(1);
  });
}

export default app;

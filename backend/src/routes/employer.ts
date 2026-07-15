/**
 * VeilPay — Employer API routes.
 *
 * Handles payroll CSV upload, batch execution, history retrieval,
 * and dashboard statistics.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import {
  createPayrollBatch,
  executePayrollBatch,
  getPayrollHistory,
  getBatchDetails,
  getBatchClaimDistribution,
  getDashboardStats,
  PayrollError,
} from '../services/payroll.js';
import { MidnightConfigurationError } from '../services/midnight.js';
import type { ApiResponse } from '../types/index.js';

const router = Router();

// ── Multer config — accept CSV files up to 5 MB ──────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.originalname.toLowerCase().endsWith('.csv')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are accepted.'));
    }
  },
});

// ── Zod schemas ──────────────────────────────────────────────────────────

const ExecutePayrollSchema = z.object({
  batchId: z.string().uuid('batchId must be a valid UUID'),
});

const EmployerIdSchema = z.object({
  employerId: z.string().trim().min(1, 'employerId is required').max(128)
    .regex(/^[a-zA-Z0-9._-]+$/, 'employerId contains unsupported characters'),
});

const BatchIdParamSchema = z.object({
  id: z.string().uuid('Batch ID must be a valid UUID'),
});

// ── Helpers ──────────────────────────────────────────────────────────────

function sendJson<T>(res: Response, data: T, meta?: Record<string, unknown>): void {
  const body: ApiResponse<T> = { success: true, data, meta };
  res.json(body);
}

function sendError(
  res: Response,
  status: number,
  message: string,
  meta?: Record<string, unknown>,
): void {
  const body: ApiResponse = { success: false, error: message, ...(meta ? { meta } : {}) };
  res.status(status).json(body);
}

// ────────────────────────────────────────────────────────────────────────────
// Routes
// ────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/employer/payroll/upload
 *
 * Upload a CSV payroll file.  Returns a preview of parsed rows and a
 * batch ID that can be passed to the execute endpoint.
 */
router.post(
  '/payroll/upload',
  upload.single('file'),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = req.file;
      if (!file) {
        sendError(res, 400, 'No CSV file provided. Use form field "file".');
        return;
      }

      const employer = EmployerIdSchema.safeParse(req.body);
      if (!employer.success) {
        sendError(res, 400, employer.error.errors.map((error) => error.message).join('; '));
        return;
      }

      const { batch, parsed } = createPayrollBatch(employer.data.employerId, file.buffer);

      sendJson(res, {
        batch,
        preview: parsed.items,
        rowCount: parsed.items.length,
      });
    } catch (err) {
      if (err instanceof PayrollError) {
        sendError(res, 422, err.message);
        return;
      }
      next(err);
    }
  },
);

/**
 * POST /api/employer/payroll/execute
 *
 * Execute a previously uploaded (pending) payroll batch on the Midnight network.
 */
router.post('/payroll/execute', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = ExecutePayrollSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, parsed.error.errors.map((e) => e.message).join('; '));
      return;
    }

    const batch = await executePayrollBatch(parsed.data.batchId);
    const claims = getBatchClaimDistribution(parsed.data.batchId);
    sendJson(res, { batch, claims });
  } catch (err) {
    if (err instanceof PayrollError) {
      sendError(res, 422, err.message);
      return;
    }
    if (err instanceof MidnightConfigurationError) {
      sendError(res, err.statusCode, err.message, err.details);
      return;
    }
    next(err);
  }
});

/**
 * GET /api/employer/payroll/history?employerId=…
 */
router.get('/payroll/history', (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = EmployerIdSchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, 400, parsed.error.errors.map((e) => e.message).join('; '));
      return;
    }

    const batches = getPayrollHistory(parsed.data.employerId);
    sendJson(res, { batches });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/employer/payroll/batch/:id
 */
router.get('/payroll/batch/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = BatchIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      sendError(res, 400, parsed.error.errors.map((e) => e.message).join('; '));
      return;
    }

    const details = getBatchDetails(parsed.data.id);
    sendJson(res, details);
  } catch (err) {
    if (err instanceof PayrollError) {
      sendError(res, 404, err.message);
      return;
    }
    next(err);
  }
});

/**
 * GET /api/employer/dashboard/stats?employerId=…
 */
router.get('/dashboard/stats', (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = EmployerIdSchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, 400, parsed.error.errors.map((e) => e.message).join('; '));
      return;
    }

    const stats = getDashboardStats(parsed.data.employerId);
    sendJson(res, stats);
  } catch (err) {
    next(err);
  }
});

export default router;

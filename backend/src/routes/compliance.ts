/**
 * VeilPay — Compliance API routes.
 *
 * Exposes endpoints for compliance checks, allowlist / blocklist CRUD,
 * ZK compliance proof generation & verification, and audit trail queries.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import midnightService from '../services/midnight.js';
import {
  checkCompliance,
  generateComplianceProof,
  getComplianceOverview,
  getComplianceStatus,
  addToAllowlist,
  removeFromAllowlist,
  addToBlocklist,
  removeFromBlocklist,
  getLists,
  getAuditTrail,
  ComplianceError,
} from '../services/compliance.js';
import type { ApiResponse, AuditFilter } from '../types/index.js';
import { isSupportedWalletAddress } from '../utils/wallet-address.js';
import { getWorkspaceId } from '../middleware/workspace.js';

const router = Router();

// ── Zod schemas ──────────────────────────────────────────────────────────

const BatchIdSchema = z.object({
  batchId: z.string().uuid('batchId must be a valid UUID'),
});

const BatchIdParamSchema = z.object({
  batchId: z.string().uuid('batchId must be a valid UUID'),
});

const AddressParamSchema = z.object({
  address: z.string().trim().refine(isSupportedWalletAddress, 'A valid wallet address is required'),
});

const AllowlistAddSchema = z.object({
  address: z.string().trim().refine(isSupportedWalletAddress, 'A valid wallet address is required'),
  addedBy: z.string().trim().min(1, 'addedBy is required').max(120),
});

const BlocklistAddSchema = z.object({
  address: z.string().trim().refine(isSupportedWalletAddress, 'A valid wallet address is required'),
  reason: z.string().trim().min(1, 'reason is required').max(500),
  addedBy: z.string().trim().min(1, 'addedBy is required').max(120),
});

const AuditFilterSchema = z.object({
  action: z.string().optional(),
  actor: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const ProofVerifySchema = z.object({
  proof: z.string().min(1, 'proof is required'),
  publicInputs: z.record(z.unknown()),
  circuitName: z.string().min(1, 'circuitName is required'),
});

// ── Helpers ──────────────────────────────────────────────────────────────

function sendJson<T>(res: Response, data: T, meta?: Record<string, unknown>): void {
  const body: ApiResponse<T> = { success: true, data, meta };
  res.json(body);
}

function sendError(res: Response, status: number, message: string): void {
  const body: ApiResponse = { success: false, error: message };
  res.status(status).json(body);
}

// ────────────────────────────────────────────────────────────────────────────
// Compliance check routes
// ────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/compliance/check
 *
 * Run a compliance check on a payroll batch.
 */
router.post('/check', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = BatchIdSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, parsed.error.errors.map((e) => e.message).join('; '));
      return;
    }

    const record = await checkCompliance(parsed.data.batchId, getWorkspaceId(res));
    sendJson(res, record);
  } catch (err) {
    if (err instanceof ComplianceError) {
      sendError(res, 422, err.message);
      return;
    }
    next(err);
  }
});

/**
 * GET /api/compliance/status/:batchId
 */
router.get('/status/:batchId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = BatchIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      sendError(res, 400, parsed.error.errors.map((e) => e.message).join('; '));
      return;
    }

    const record = getComplianceStatus(parsed.data.batchId, getWorkspaceId(res));
    if (!record) {
      sendError(res, 404, `No compliance record found for batch ${parsed.data.batchId}`);
      return;
    }
    sendJson(res, record);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/compliance/overview
 */
router.get('/overview', (_req: Request, res: Response, next: NextFunction) => {
  try {
    sendJson(res, getComplianceOverview(getWorkspaceId(res)));
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Allowlist
// ────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/compliance/allowlist
 */
router.post('/allowlist', (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = AllowlistAddSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, parsed.error.errors.map((e) => e.message).join('; '));
      return;
    }

    const entry = addToAllowlist(parsed.data.address, parsed.data.addedBy, getWorkspaceId(res));
    sendJson(res, entry);
  } catch (err) {
    if (err instanceof ComplianceError) {
      sendError(res, 409, err.message);
      return;
    }
    next(err);
  }
});

/**
 * DELETE /api/compliance/allowlist/:address
 */
router.delete('/allowlist/:address', (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = AddressParamSchema.safeParse(req.params);
    if (!parsed.success) {
      sendError(res, 400, parsed.error.errors.map((e) => e.message).join('; '));
      return;
    }

    removeFromAllowlist(parsed.data.address, getWorkspaceId(res));
    sendJson(res, { removed: parsed.data.address });
  } catch (err) {
    if (err instanceof ComplianceError) {
      sendError(res, 404, err.message);
      return;
    }
    next(err);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Blocklist
// ────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/compliance/blocklist
 */
router.post('/blocklist', (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = BlocklistAddSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, parsed.error.errors.map((e) => e.message).join('; '));
      return;
    }

    const entry = addToBlocklist(
      parsed.data.address,
      parsed.data.reason,
      parsed.data.addedBy,
      getWorkspaceId(res),
    );
    sendJson(res, entry);
  } catch (err) {
    if (err instanceof ComplianceError) {
      sendError(res, 409, err.message);
      return;
    }
    next(err);
  }
});

/**
 * DELETE /api/compliance/blocklist/:address
 */
router.delete('/blocklist/:address', (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = AddressParamSchema.safeParse(req.params);
    if (!parsed.success) {
      sendError(res, 400, parsed.error.errors.map((e) => e.message).join('; '));
      return;
    }

    removeFromBlocklist(parsed.data.address, getWorkspaceId(res));
    sendJson(res, { removed: parsed.data.address });
  } catch (err) {
    if (err instanceof ComplianceError) {
      sendError(res, 404, err.message);
      return;
    }
    next(err);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Lists & Audit
// ────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/compliance/lists
 *
 * Return both the allowlist and blocklist in a single response.
 */
router.get('/lists', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const lists = getLists(getWorkspaceId(res));
    sendJson(res, lists);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/compliance/audit?action=…&actor=…&from=…&to=…&limit=…&offset=…
 */
router.get('/audit', (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = AuditFilterSchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, 400, parsed.error.errors.map((e) => e.message).join('; '));
      return;
    }

    const logs = getAuditTrail(getWorkspaceId(res), parsed.data as AuditFilter);
    sendJson(res, { logs, count: logs.length });
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Proof routes
// ────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/compliance/proof/generate
 *
 * Generate a ZK compliance proof for a given batch.
 */
router.post('/proof/generate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = BatchIdSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, parsed.error.errors.map((e) => e.message).join('; '));
      return;
    }

    const proof = await generateComplianceProof(parsed.data.batchId, getWorkspaceId(res));
    sendJson(res, proof);
  } catch (err) {
    if (err instanceof ComplianceError) {
      sendError(res, 422, err.message);
      return;
    }
    next(err);
  }
});

/**
 * POST /api/compliance/proof/verify
 *
 * Verify a previously-generated ZK proof.
 */
router.post('/proof/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = ProofVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, parsed.error.errors.map((e) => e.message).join('; '));
      return;
    }

    const valid = await midnightService.verifyProof({
      proof: parsed.data.proof,
      publicInputs: parsed.data.publicInputs,
      circuitName: parsed.data.circuitName,
      generatedAt: new Date().toISOString(),
    });

    sendJson(res, { valid });
  } catch (err) {
    next(err);
  }
});

export default router;

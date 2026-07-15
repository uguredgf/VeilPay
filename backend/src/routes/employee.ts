import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { logAudit } from '../database/init.js';
import midnightService, { MidnightConfigurationError } from '../services/midnight.js';
import {
  acquireClaimWithdrawalLock,
  getClaimRecordBySecretKey,
  markClaimAsWithdrawn,
  releaseClaimWithdrawalLock,
  verifyClaimKey,
} from '../services/payroll.js';
import type { ApiResponse } from '../types/index.js';
import { isSupportedWalletAddress, normalizeWalletAddress } from '../utils/wallet-address.js';

const router = Router();

const ClaimVerifySchema = z.object({
  secretKey: z.string().min(1, 'Secret key is required'),
});

const ClaimWithdrawSchema = z.object({
  secretKey: z.string().min(1, 'Secret key is required'),
  walletAddress: z.string().trim().refine(isSupportedWalletAddress, 'A valid Midnight wallet address is required'),
});

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

router.post('/claim/verify', (req: Request, res: Response) => {
  const parsed = ClaimVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.errors.map((error) => error.message).join('; '));
    return;
  }

  const claim = verifyClaimKey(parsed.data.secretKey);
  if (!claim) {
    sendError(res, 404, 'No payroll claim found for the provided secret key.');
    return;
  }

  sendJson(res, claim);
});

router.post('/claim/withdraw', async (req: Request, res: Response, next: NextFunction) => {
  let lockedItemId: string | null = null;
  try {
    const parsed = ClaimWithdrawSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, parsed.error.errors.map((error) => error.message).join('; '));
      return;
    }

    const claim = getClaimRecordBySecretKey(parsed.data.secretKey);
    if (!claim) {
      sendError(res, 404, 'No payroll claim found for the provided secret key.');
      return;
    }
    if (claim.claimStatus === 'claimed') {
      sendError(res, 409, 'This payroll claim has already been withdrawn.');
      return;
    }
    if (claim.batchStatus !== 'completed') {
      sendError(res, 409, 'This payroll batch is not claimable yet.');
      return;
    }
    if (!acquireClaimWithdrawalLock(claim.itemId)) {
      sendError(res, 409, 'This payroll claim is already being withdrawn.');
      return;
    }
    lockedItemId = claim.itemId;

    const proof = await midnightService.generateProof('withdraw', {
      batchId: claim.batchId,
      itemId: claim.itemId,
      nullifier: claim.nullifier,
      amount: claim.amount,
      walletAddress: normalizeWalletAddress(parsed.data.walletAddress),
    });

    const txResult = await midnightService.callCircuit(
      'veilpay_payroll',
      'withdraw',
      {
        proof: proof.proof,
        nullifier: claim.nullifier,
      },
      {
        amount: claim.amount,
        recipient: normalizeWalletAddress(parsed.data.walletAddress),
      },
    );

    const withdrawalAddress = normalizeWalletAddress(parsed.data.walletAddress);
    markClaimAsWithdrawn(claim.itemId, txResult.txHash, withdrawalAddress);
    lockedItemId = null;
    logAudit(
      uuid(),
      'employee.withdraw',
      claim.employerId,
      `Claim ${claim.itemId} withdrew ${claim.amount} with tx ${txResult.txHash}`,
    );

    sendJson(res, {
      txHash: txResult.txHash,
      amount: claim.amount,
      walletAddress: withdrawalAddress,
      status: 'claimed',
    });
  } catch (error) {
    if (lockedItemId) {
      releaseClaimWithdrawalLock(lockedItemId);
    }
    if (error instanceof MidnightConfigurationError) {
      sendError(res, error.statusCode, error.message, error.details);
      return;
    }
    next(error);
  }
});

export default router;

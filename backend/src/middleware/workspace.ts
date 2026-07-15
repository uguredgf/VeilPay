import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { ApiResponse } from '../types/index.js';

export const WORKSPACE_HEADER = 'x-veilpay-workspace';
const WORKSPACE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;

export function deriveWorkspaceId(token: string): string {
  const digest = createHash('sha256').update(token, 'utf8').digest('hex');
  return `workspace-${digest.slice(0, 40)}`;
}

export function requireWorkspace(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = req.get(WORKSPACE_HEADER)?.trim();
  if (!token || !WORKSPACE_TOKEN_PATTERN.test(token)) {
    const body: ApiResponse = {
      success: false,
      error: 'A valid private demo workspace is required.',
    };
    res.status(401).json(body);
    return;
  }

  res.locals.workspaceId = deriveWorkspaceId(token);
  next();
}

export function getWorkspaceId(res: Response): string {
  const workspaceId = res.locals.workspaceId;
  if (typeof workspaceId !== 'string' || workspaceId.length === 0) {
    throw new Error('Workspace middleware was not applied to this route.');
  }
  return workspaceId;
}

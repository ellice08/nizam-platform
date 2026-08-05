import { Router } from 'express'
import type { Request, Response } from 'express'
import { ApiResponse } from '../utils/response.js'

const router = Router()

const deployedAt = new Date().toISOString()

// GET /api/version
// Public — returns the deployed commit so a stale-deploy can be confirmed
// (or ruled out) without digging through Railway logs.
router.get('/', (_req: Request, res: Response): void => {
  const commit = process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT ?? 'unknown'

  res.json(ApiResponse.success({
    commit,
    deployedAt,
    env: process.env.NODE_ENV,
  }))
})

export default router

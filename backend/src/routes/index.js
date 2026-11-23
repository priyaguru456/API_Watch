/**
 * Central API Router
 * Aggregates all modular route handlers under the API prefix.
 */
import { Router } from 'express';
import healthRoutes from '../modules/health/health.routes.js';

const router = Router();

// Mount health routes at /health
router.use('/health', healthRoutes);

export default router;

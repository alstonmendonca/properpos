// Stock adjustment routes (basic implementation)

import { Router } from 'express';
import { authenticate, extractTenant, createResponse } from '@properpos/backend-shared';

export const adjustmentRoutes = Router();

adjustmentRoutes.get('/', authenticate, extractTenant, async (req, res) => {
  res.json(createResponse([], 'Stock adjustments retrieved successfully'));
});

adjustmentRoutes.post('/', authenticate, extractTenant, async (req, res) => {
  res.status(201).json(createResponse({}, 'Stock adjustment created successfully'));
});

adjustmentRoutes.get('/:adjustmentId', authenticate, extractTenant, async (req, res) => {
  res.json(createResponse({}, 'Stock adjustment retrieved successfully'));
});
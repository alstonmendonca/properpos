// Dashboard analytics routes (basic implementation)

import { Router } from 'express';
import { authenticate, extractTenant, createResponse } from '@properpos/backend-shared';

export const dashboardRoutes = Router();

dashboardRoutes.get('/overview', authenticate, extractTenant, async (req, res) => {
  res.json(createResponse({}, 'Dashboard overview retrieved successfully'));
});

dashboardRoutes.get('/widgets', authenticate, extractTenant, async (req, res) => {
  res.json(createResponse([], 'Dashboard widgets retrieved successfully'));
});

dashboardRoutes.post('/widgets', authenticate, extractTenant, async (req, res) => {
  res.status(201).json(createResponse({}, 'Dashboard widget created successfully'));
});
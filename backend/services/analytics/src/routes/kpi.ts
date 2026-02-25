// KPI routes (basic implementation)
import { Router } from 'express';
import { authenticate, extractTenant, createResponse } from '@properpos/backend-shared';

export const kpiRoutes = Router();

kpiRoutes.get('/', authenticate, extractTenant, async (req, res) => {
  res.json(createResponse([], 'KPIs retrieved successfully'));
});

kpiRoutes.get('/performance', authenticate, extractTenant, async (req, res) => {
  res.json(createResponse({}, 'Performance KPIs retrieved successfully'));
});
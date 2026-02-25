// Forecast routes (basic implementation)
import { Router } from 'express';
import { authenticate, extractTenant, createResponse } from '@properpos/backend-shared';

export const forecastRoutes = Router();

forecastRoutes.get('/sales', authenticate, extractTenant, async (req, res) => {
  res.json(createResponse({}, 'Sales forecast generated successfully'));
});

forecastRoutes.get('/demand', authenticate, extractTenant, async (req, res) => {
  res.json(createResponse({}, 'Demand forecast generated successfully'));
});
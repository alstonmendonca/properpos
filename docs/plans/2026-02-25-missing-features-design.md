# Missing Features Design: PDF Receipts, Bulk Operations, Inventory Forecasting

Date: 2026-02-25

## Feature 1: PDF Receipt Generation

### Approach
Use PDFKit (programmatic, no browser dependency) to replace the placeholder `generatePDFReceipt()` in ReceiptService.

### Receipt Layout (80mm thermal)
- Business header (logo if enabled, name, address, phone/email)
- Order info (number, date, cashier, type)
- Line items table (item, qty, amount)
- Totals section (subtotal, tax, total)
- Payment info (method, status)
- QR code + custom footer text

### Customization
Uses existing `Location.settings.receiptSettings` (headerText, footerText, showLogo, logoUrl).

### Files to Modify
- `backend/services/pos/package.json` — add pdfkit, @types/pdfkit
- `backend/services/pos/src/services/ReceiptService.ts` — implement generatePDFReceipt()

---

## Feature 2: Bulk Operations

### Backend Endpoints

**Products** (enhance existing bulk-update):
- `POST /products/bulk-update` — already exists, enhance field support
- `POST /products/bulk-delete` — soft-delete (deactivate) with reason
- `POST /products/bulk-export` — CSV export

**Orders:**
- `POST /orders/bulk-status` — update status on multiple orders
- `POST /orders/bulk-cancel` — cancel with reason
- `POST /orders/bulk-export` — CSV export

**Customers:**
- `POST /customers/bulk-update` — update fields
- `POST /customers/bulk-deactivate` — deactivate with reason
- `POST /customers/bulk-export` — CSV export

### Request/Response Pattern
- Input: `{ ids: string[], updates?: {...}, reason?: string }`
- Max 100 items per request
- Permission checks per entity type
- Audit logging for each action
- Output: `{ matchedCount, modifiedCount, errors[] }`

### Frontend Changes
- New shared `BulkActionBar` component
- New shared `BulkEditModal` component
- Products page: wire up existing selection UI
- Orders page: add checkbox selection + bulk actions
- Customers page: add checkbox selection + bulk actions

### Files to Modify
Backend:
- `backend/services/pos/src/routes/products.ts`
- `backend/services/pos/src/routes/orders.ts`
- `backend/services/pos/src/routes/customers.ts`
- `backend/services/pos/src/services/ProductService.ts`
- `backend/services/pos/src/services/OrderService.ts`
- `backend/services/pos/src/services/CustomerService.ts`

Frontend:
- `frontend/src/components/ui/BulkActionBar.tsx` (new)
- `frontend/src/components/ui/BulkEditModal.tsx` (new)
- `frontend/src/app/(dashboard)/products/page.tsx`
- `frontend/src/app/(dashboard)/orders/page.tsx`
- `frontend/src/app/(dashboard)/customers/page.tsx`

---

## Feature 3: Enhanced Inventory Forecasting

### Forecasting Methods
1. **Weighted Moving Average (WMA)** — recent data weighted 2-3x higher
2. **Exponential Smoothing (Holt-Winters)** — trend + seasonality components
3. **Ensemble** — auto-weighted combination, selects best method per product

### New Calculations
- Confidence intervals at 70% and 90%
- Days-until-stockout = currentQuantity / avgDailyDemand
- Seasonality detection (weekly/monthly cycles)
- Auto-reorder recommendations with lead time + safety stock

### Endpoints
- `GET /stock/forecast` — enhanced with multiple methods
- `GET /stock/forecast/bulk` — all products at a location
- `GET /stock/forecast/reorder-suggestions` — products needing reorder
- `GET /stock/forecast/stockout-risk` — products at stockout risk

### Frontend
- Install recharts for charting
- Forecasting section on inventory page
- Demand trend chart with forecast projection + confidence bands
- Reorder suggestions table with urgency indicators
- Stockout risk alert cards

### Files to Modify
Backend:
- `backend/services/inventory/src/services/StockService.ts`
- `backend/services/inventory/src/services/ForecastingEngine.ts` (new)
- `backend/services/inventory/src/routes/stock.ts`

Frontend:
- `frontend/package.json` — add recharts
- `frontend/src/app/(dashboard)/inventory/page.tsx`
- `frontend/src/components/inventory/ForecastChart.tsx` (new)
- `frontend/src/components/inventory/ReorderSuggestions.tsx` (new)
- `frontend/src/components/inventory/StockoutRisk.tsx` (new)

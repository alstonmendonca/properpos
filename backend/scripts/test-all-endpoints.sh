#!/bin/bash

# Comprehensive API Endpoint Test Script for ProperPOS
# This script tests all API endpoints and reports results

GATEWAY_URL="http://localhost:3001"
AUTH_URL="http://localhost:3002"
TENANT_URL="http://localhost:3003"
POS_URL="http://localhost:3004"
INVENTORY_URL="http://localhost:3005"
ANALYTICS_URL="http://localhost:3006"

# Test user credentials
EMAIL="demo@properpos.com"
PASSWORD="Demo123!"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
TOTAL=0

# Store tokens
ACCESS_TOKEN=""
REFRESH_TOKEN=""
TENANT_ID=""

log_test() {
    local name=$1
    local status=$2
    local response=$3
    TOTAL=$((TOTAL + 1))

    if [ "$status" = "PASS" ]; then
        echo -e "${GREEN}✓ PASS${NC}: $name"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}✗ FAIL${NC}: $name"
        echo "  Response: $response"
        FAILED=$((FAILED + 1))
    fi
}

test_endpoint() {
    local name=$1
    local method=$2
    local url=$3
    local data=$4
    local expected_status=$5
    local auth=$6

    local headers="-H 'Content-Type: application/json'"

    if [ "$auth" = "true" ] && [ -n "$ACCESS_TOKEN" ]; then
        headers="$headers -H 'Authorization: Bearer $ACCESS_TOKEN'"
    fi

    if [ -n "$TENANT_ID" ]; then
        headers="$headers -H 'X-Tenant-ID: $TENANT_ID'"
    fi

    local cmd="curl -s -w '\n%{http_code}' -X $method $headers"

    if [ -n "$data" ]; then
        cmd="$cmd -d '$data'"
    fi

    cmd="$cmd '$url'"

    local result=$(eval $cmd 2>/dev/null)
    local http_code=$(echo "$result" | tail -n1)
    local body=$(echo "$result" | sed '$d')

    if [ "$http_code" = "$expected_status" ]; then
        log_test "$name" "PASS" ""
        echo "$body"
    else
        log_test "$name" "FAIL" "Expected $expected_status, got $http_code - $body"
        echo ""
    fi
}

echo "============================================================"
echo "ProperPOS API Endpoint Tests"
echo "============================================================"
echo ""

# ============================================================
# 1. AUTH SERVICE TESTS
# ============================================================
echo -e "${YELLOW}=== AUTH SERVICE TESTS ===${NC}"
echo ""

# Test health
echo "Testing Auth Health..."
result=$(curl -s "$AUTH_URL/health" 2>/dev/null)
if echo "$result" | grep -q '"status":"healthy"'; then
    log_test "Auth Health Check" "PASS" ""
else
    log_test "Auth Health Check" "FAIL" "$result"
fi

# Test login
echo ""
echo "Testing Login..."
result=$(curl -s -X POST "$AUTH_URL/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" 2>/dev/null)

if echo "$result" | grep -q '"success":true'; then
    log_test "Login" "PASS" ""
    ACCESS_TOKEN=$(echo "$result" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
    REFRESH_TOKEN=$(echo "$result" | grep -o '"refreshToken":"[^"]*"' | cut -d'"' -f4)
    TENANT_ID=$(echo "$result" | grep -o '"tenantId":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "  Got access token: ${ACCESS_TOKEN:0:50}..."
    echo "  Tenant ID: $TENANT_ID"
else
    log_test "Login" "FAIL" "$result"
fi

# Test get current user
echo ""
echo "Testing Get Current User..."
result=$(curl -s "$AUTH_URL/api/v1/auth/me" \
    -H "Authorization: Bearer $ACCESS_TOKEN" 2>/dev/null)

if echo "$result" | grep -q '"success":true'; then
    log_test "Get Current User" "PASS" ""
else
    log_test "Get Current User" "FAIL" "$result"
fi

# Test refresh token
echo ""
echo "Testing Token Refresh..."
result=$(curl -s -X POST "$AUTH_URL/api/v1/auth/refresh" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}" 2>/dev/null)

if echo "$result" | grep -q '"success":true' || echo "$result" | grep -q 'accessToken'; then
    log_test "Token Refresh" "PASS" ""
else
    log_test "Token Refresh" "FAIL" "$result"
fi

# ============================================================
# 2. TENANT SERVICE TESTS
# ============================================================
echo ""
echo -e "${YELLOW}=== TENANT SERVICE TESTS ===${NC}"
echo ""

# Test health
result=$(curl -s "$TENANT_URL/health" 2>/dev/null)
if echo "$result" | grep -q '"status":"healthy"'; then
    log_test "Tenant Health Check" "PASS" ""
else
    log_test "Tenant Health Check" "FAIL" "$result"
fi

# Test get current tenant
echo ""
echo "Testing Get Current Tenant..."
result=$(curl -s "$TENANT_URL/api/v1/tenants/current" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "X-Tenant-ID: $TENANT_ID" 2>/dev/null)

if echo "$result" | grep -q '"success":true' || echo "$result" | grep -q '"name"'; then
    log_test "Get Current Tenant" "PASS" ""
else
    log_test "Get Current Tenant" "FAIL" "$result"
fi

# Test get locations
echo ""
echo "Testing Get Locations..."
result=$(curl -s "$TENANT_URL/api/v1/locations" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "X-Tenant-ID: $TENANT_ID" 2>/dev/null)

if echo "$result" | grep -q '"success":true' || echo "$result" | grep -q '"locations"' || echo "$result" | grep -q '"id"'; then
    log_test "Get Locations" "PASS" ""
else
    log_test "Get Locations" "FAIL" "$result"
fi

# ============================================================
# 3. POS SERVICE TESTS
# ============================================================
echo ""
echo -e "${YELLOW}=== POS SERVICE TESTS ===${NC}"
echo ""

# Test health
result=$(curl -s "$POS_URL/health" 2>/dev/null)
if echo "$result" | grep -q '"status":"healthy"'; then
    log_test "POS Health Check" "PASS" ""
else
    log_test "POS Health Check" "FAIL" "$result"
fi

# Test get categories
echo ""
echo "Testing Get Categories..."
result=$(curl -s "$POS_URL/api/v1/categories" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "X-Tenant-ID: $TENANT_ID" 2>/dev/null)

if echo "$result" | grep -q '"success":true' || echo "$result" | grep -q '"categories"' || echo "$result" | grep -q '"name"'; then
    log_test "Get Categories" "PASS" ""
    echo "  Found categories in response"
else
    log_test "Get Categories" "FAIL" "$result"
fi

# Test get products
echo ""
echo "Testing Get Products..."
result=$(curl -s "$POS_URL/api/v1/products" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "X-Tenant-ID: $TENANT_ID" 2>/dev/null)

if echo "$result" | grep -q '"success":true' || echo "$result" | grep -q '"products"' || echo "$result" | grep -q '"name"'; then
    log_test "Get Products" "PASS" ""
else
    log_test "Get Products" "FAIL" "$result"
fi

# Test get customers
echo ""
echo "Testing Get Customers..."
result=$(curl -s "$POS_URL/api/v1/customers" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "X-Tenant-ID: $TENANT_ID" 2>/dev/null)

if echo "$result" | grep -q '"success":true' || echo "$result" | grep -q '"customers"' || echo "$result" | grep -q '"firstName"'; then
    log_test "Get Customers" "PASS" ""
else
    log_test "Get Customers" "FAIL" "$result"
fi

# Test get orders
echo ""
echo "Testing Get Orders..."
result=$(curl -s "$POS_URL/api/v1/orders" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "X-Tenant-ID: $TENANT_ID" 2>/dev/null)

if echo "$result" | grep -q '"success":true' || echo "$result" | grep -q '"orders"' || echo "$result" | grep -q '"orderNumber"'; then
    log_test "Get Orders" "PASS" ""
else
    log_test "Get Orders" "FAIL" "$result"
fi

# ============================================================
# 4. INVENTORY SERVICE TESTS
# ============================================================
echo ""
echo -e "${YELLOW}=== INVENTORY SERVICE TESTS ===${NC}"
echo ""

# Test health
result=$(curl -s "$INVENTORY_URL/health" 2>/dev/null)
if echo "$result" | grep -q '"status":"healthy"'; then
    log_test "Inventory Health Check" "PASS" ""
else
    log_test "Inventory Health Check" "FAIL" "$result"
fi

# Test get stock
echo ""
echo "Testing Get Stock..."
result=$(curl -s "$INVENTORY_URL/api/v1/stock" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "X-Tenant-ID: $TENANT_ID" 2>/dev/null)

if echo "$result" | grep -q '"success":true' || echo "$result" | grep -q '"stock"' || echo "$result" | grep -q '"quantity"'; then
    log_test "Get Stock" "PASS" ""
else
    log_test "Get Stock" "FAIL" "$result"
fi

# ============================================================
# 5. ANALYTICS SERVICE TESTS
# ============================================================
echo ""
echo -e "${YELLOW}=== ANALYTICS SERVICE TESTS ===${NC}"
echo ""

# Test health
result=$(curl -s "$ANALYTICS_URL/health" 2>/dev/null)
if echo "$result" | grep -q '"status":"healthy"'; then
    log_test "Analytics Health Check" "PASS" ""
else
    log_test "Analytics Health Check" "FAIL" "$result"
fi

# Test get sales overview
echo ""
echo "Testing Get Sales Overview..."
result=$(curl -s "$ANALYTICS_URL/api/v1/sales/overview" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "X-Tenant-ID: $TENANT_ID" 2>/dev/null)

if echo "$result" | grep -q '"success":true' || echo "$result" | grep -q '"totalSales"' || echo "$result" | grep -q '"sales"'; then
    log_test "Get Sales Overview" "PASS" ""
else
    log_test "Get Sales Overview" "FAIL" "$result"
fi

# ============================================================
# 6. GATEWAY PROXY TESTS
# ============================================================
echo ""
echo -e "${YELLOW}=== GATEWAY PROXY TESTS ===${NC}"
echo ""

# Test gateway health
result=$(curl -s "$GATEWAY_URL/health" 2>/dev/null)
if echo "$result" | grep -q '"status":"healthy"'; then
    log_test "Gateway Health Check" "PASS" ""
else
    log_test "Gateway Health Check" "FAIL" "$result"
fi

# Test login through gateway
echo ""
echo "Testing Login via Gateway..."
result=$(curl -s -X POST "$GATEWAY_URL/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" 2>/dev/null)

if echo "$result" | grep -q '"success":true'; then
    log_test "Login via Gateway" "PASS" ""
else
    log_test "Login via Gateway" "FAIL" "$result"
fi

# Test get products through gateway
echo ""
echo "Testing Get Products via Gateway..."
result=$(curl -s "$GATEWAY_URL/api/v1/products" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "X-Tenant-ID: $TENANT_ID" 2>/dev/null)

if echo "$result" | grep -q '"success":true' || echo "$result" | grep -q '"products"' || echo "$result" | grep -q '"name"'; then
    log_test "Get Products via Gateway" "PASS" ""
else
    log_test "Get Products via Gateway" "FAIL" "$result"
fi

# ============================================================
# SUMMARY
# ============================================================
echo ""
echo "============================================================"
echo "TEST SUMMARY"
echo "============================================================"
echo -e "Total Tests: $TOTAL"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed. Please review the output above.${NC}"
    exit 1
fi

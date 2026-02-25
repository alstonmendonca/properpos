#!/bin/bash

# ProperPOS Local Development Startup Script
# This script helps you start the application locally

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  ProperPOS Local Development Setup  ${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# Check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        echo -e "${RED}Error: Docker is not running!${NC}"
        echo -e "${YELLOW}Please start Docker Desktop and try again.${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Docker is running${NC}"
}

# Start infrastructure (MongoDB + Redis) only
start_infrastructure() {
    echo -e "\n${BLUE}Starting infrastructure services (MongoDB + Redis)...${NC}"
    docker-compose up -d mongodb redis
    echo -e "${GREEN}✓ Infrastructure services started${NC}"
    echo ""
    echo -e "MongoDB: ${GREEN}localhost:27017${NC}"
    echo -e "Redis:   ${GREEN}localhost:6379${NC}"
}

# Build shared packages
build_shared() {
    echo -e "\n${BLUE}Building shared packages...${NC}"

    # Build main shared package
    echo "Building @properpos/shared..."
    cd "$PROJECT_ROOT/shared"
    npm run build

    # Build backend shared package
    echo "Building @properpos/backend-shared..."
    cd "$PROJECT_ROOT/backend/shared"
    npm run build

    cd "$PROJECT_ROOT"
    echo -e "${GREEN}✓ Shared packages built${NC}"
}

# Start backend services
start_backend() {
    echo -e "\n${BLUE}Starting backend services...${NC}"
    cd "$PROJECT_ROOT/backend"
    npm run dev &
    BACKEND_PID=$!
    cd "$PROJECT_ROOT"
    echo -e "${GREEN}✓ Backend services starting (PID: $BACKEND_PID)${NC}"
}

# Start frontend
start_frontend() {
    echo -e "\n${BLUE}Starting frontend...${NC}"
    cd "$PROJECT_ROOT/frontend"
    npm run dev &
    FRONTEND_PID=$!
    cd "$PROJECT_ROOT"
    echo -e "${GREEN}✓ Frontend starting (PID: $FRONTEND_PID)${NC}"
}

# Start everything via Docker Compose
start_docker_all() {
    echo -e "\n${BLUE}Starting all services via Docker Compose...${NC}"
    docker-compose up -d
    echo -e "${GREEN}✓ All services started${NC}"
    echo ""
    echo -e "Services:"
    echo -e "  Frontend:    ${GREEN}http://localhost:8080${NC}"
    echo -e "  API Gateway: ${GREEN}http://localhost:3000${NC}"
    echo -e "  MongoDB:     ${GREEN}localhost:27017${NC}"
    echo -e "  Redis:       ${GREEN}localhost:6379${NC}"
}

# Show status
show_status() {
    echo -e "\n${BLUE}Service Status:${NC}"
    docker-compose ps
}

# Print usage
usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  infra       Start only MongoDB and Redis (for local dev)"
    echo "  docker      Start everything via Docker Compose"
    echo "  dev         Start infrastructure + local backend + frontend"
    echo "  frontend    Start only the frontend (requires infra + backend)"
    echo "  status      Show running services"
    echo "  stop        Stop all services"
    echo "  logs        Show Docker Compose logs"
    echo ""
    echo "Examples:"
    echo "  $0 docker   # Easiest - runs everything in Docker"
    echo "  $0 dev      # Local development mode"
}

# Main
case "${1:-}" in
    infra)
        check_docker
        start_infrastructure
        ;;
    docker)
        check_docker
        start_docker_all
        ;;
    dev)
        check_docker
        start_infrastructure
        echo -e "\n${YELLOW}Waiting for infrastructure to be ready...${NC}"
        sleep 5
        build_shared
        echo ""
        echo -e "${YELLOW}Starting services in development mode...${NC}"
        echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
        echo ""
        start_backend
        sleep 3
        start_frontend
        wait
        ;;
    frontend)
        start_frontend
        wait
        ;;
    status)
        check_docker
        show_status
        ;;
    stop)
        check_docker
        echo -e "${BLUE}Stopping all services...${NC}"
        docker-compose down
        echo -e "${GREEN}✓ All services stopped${NC}"
        ;;
    logs)
        check_docker
        docker-compose logs -f
        ;;
    *)
        usage
        ;;
esac

#!/bin/bash
# Stuffy Supermarket Local Deployment Script
# Supports: Docker Compose

set -e

echo "🚀 Stuffy Supermarket Local Deployment Wizard"
echo "========================================="

echo "📦 Đang triển khai bằng Docker Compose..."
docker compose down
docker compose pull
docker compose up -d --build
echo "✅ Docker Compose deployment hoàn tất!"
echo "Truy cập frontend container tại http://localhost:3000"
echo "Truy cập backend api tại http://localhost:5000"

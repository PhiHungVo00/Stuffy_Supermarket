#!/bin/bash
# Stuffy Supermarket Production Deployment Script
# Supports: Docker Compose and Kubernetes Helm deployments

set -e

echo "🚀 Stuffy Supermarket Deployment Wizard"
echo "========================================="

# Check target mode
DEPLOY_MODE=${1:-"docker-compose"}

if [ "$DEPLOY_MODE" = "docker-compose" ]; then
    echo "📦 Deploying using Docker Compose..."
    docker compose down
    docker compose pull
    docker compose up -d --build
    echo "✅ Docker Compose deployment completed successfully!"
    echo "Access frontend container at http://localhost:3000"
    echo "Access backend api at http://localhost:5000"
elif [ "$DEPLOY_MODE" = "helm" ]; then
    echo "☸️ Deploying using Kubernetes Helm Charts..."
    
    # Check if helm is installed
    if ! command -v helm &> /dev/null; then
        echo "❌ Error: helm CLI is not installed."
        exit 1
    fi
    
    # Install or upgrade base application chart
    helm upgrade --install stuffy-supermarket ./kubernetes/helm/base-app \
      --namespace stuffy-prod --create-namespace \
      -f ./kubernetes/deploy-values/production.yaml
      
    echo "✅ Helm deployment triggered successfully!"
    echo "Check pod status: kubectl get pods -n stuffy-prod"
else
    echo "❌ Unknown deployment mode: $DEPLOY_MODE"
    echo "Usage: ./deploy.sh [docker-compose|helm]"
    exit 1
fi

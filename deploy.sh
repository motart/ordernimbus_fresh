#!/bin/bash

# OrderNimbus Deployment Menu
# Choose between local development or AWS production deployment

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}🚀 OrderNimbus Deployment Manager${NC}"
echo "================================="
echo ""

# Check if configuration exists
if [ ! -f "config.json" ]; then
    echo -e "${RED}❌ Configuration file not found!${NC}"
    echo "Please ensure config.json exists in the root directory."
    exit 1
fi

# Show current configuration
echo -e "${BLUE}📋 Available Environments:${NC}"
echo ""

# Local configuration
LOCAL_APP_URL=$(jq -r '.environments.local.APP_URL' config.json 2>/dev/null || echo "Not configured")
LOCAL_API_URL=$(jq -r '.environments.local.API_URL' config.json 2>/dev/null || echo "Not configured")

echo -e "${YELLOW}🏠 Local Development${NC}"
echo "   Frontend: $LOCAL_APP_URL"
echo "   API: $LOCAL_API_URL"
echo "   Storage: DynamoDB Local (Docker)"
echo "   Purpose: Development and testing"
echo ""

# AWS configuration  
AWS_APP_URL=$(jq -r '.environments.aws.APP_URL' config.json 2>/dev/null || echo "Not configured")
AWS_API_URL=$(jq -r '.environments.aws.API_URL' config.json 2>/dev/null || echo "Not configured")

echo -e "${GREEN}☁️  AWS Production${NC}"
echo "   Frontend: $AWS_APP_URL"
echo "   API: $AWS_API_URL"
echo "   Storage: DynamoDB (AWS)"
echo "   Purpose: Production deployment"
echo ""

# Deployment options
echo -e "${CYAN}Choose deployment option:${NC}"
echo ""
echo "1) 🏠 Deploy Local Development Environment"
echo "2) ☁️  Deploy AWS Production Environment" 
echo "3) 🧹 Cleanup Local Environment"
echo "4) 💥 Cleanup AWS Environment (⚠️ DESTROYS DATA!)"
echo "5) 📖 View Documentation"
echo "6) ❌ Exit"
echo ""

read -p "Enter your choice (1-6): " choice

case $choice in
    1)
        echo ""
        echo -e "${BLUE}🏠 Starting Local Deployment...${NC}"
        echo "=================================="
        ./deploy-local-simple.sh
        ;;
    2)
        echo ""
        echo -e "${GREEN}☁️ Starting AWS Production Deployment...${NC}"
        echo "========================================"
        ./deploy-aws-simple.sh
        ;;
    3)
        echo ""
        echo -e "${YELLOW}🧹 Starting Local Cleanup...${NC}"
        echo "============================"
        ./destroy-local-simple.sh
        ;;
    4)
        echo ""
        echo -e "${RED}💥 WARNING: AWS Production Cleanup${NC}"
        echo "================================="
        echo -e "${RED}This will DELETE ALL production data!${NC}"
        echo ""
        read -p "Are you sure? Type 'CONFIRM' to proceed: " confirm
        if [ "$confirm" = "CONFIRM" ]; then
            ./destroy-aws-simple.sh
        else
            echo "Cancelled."
        fi
        ;;
    5)
        echo ""
        echo -e "${CYAN}📖 Opening Documentation...${NC}"
        if command -v open &> /dev/null; then
            open DEPLOYMENT.md
        elif command -v xdg-open &> /dev/null; then
            xdg-open DEPLOYMENT.md
        else
            echo "Documentation available in DEPLOYMENT.md"
            echo ""
            head -30 DEPLOYMENT.md
        fi
        ;;
    6)
        echo ""
        echo -e "${CYAN}👋 Goodbye!${NC}"
        exit 0
        ;;
    *)
        echo ""
        echo -e "${RED}❌ Invalid choice. Please select 1-6.${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}✅ Operation completed!${NC}"
echo ""
echo -e "${CYAN}💡 Quick commands:${NC}"
echo "   Local:     ./deploy-local-simple.sh"
echo "   AWS:       ./deploy-aws-simple.sh"  
echo "   Cleanup:   ./destroy-local-simple.sh or ./destroy-aws-simple.sh"
echo "   Menu:      ./deploy.sh"
#!/bin/bash

# Test script to verify environment configurations
echo "🧪 Testing OrderNimbus Environment Configurations"
echo "=================================================="

# Test local environment
echo ""
echo "📍 Testing LOCAL Environment:"
echo "-----------------------------"

# Check .env.local file
if [ -f .env.local ]; then
    echo "✅ .env.local file exists"
    
    # Check for localhost references
    if grep -q "localhost\|127.0.0.1" .env.local; then
        echo "✅ Local environment correctly uses localhost"
    else
        echo "❌ Local environment missing localhost configuration"
    fi
    
    # Show key values
    echo "Configuration:"
    grep -E "REACT_APP_API_URL|REACT_APP_ENVIRONMENT" .env.local | sed 's/^/  /'
else
    echo "❌ .env.local file not found"
fi

# Test production environment
echo ""
echo "🚀 Testing PRODUCTION Environment:"
echo "----------------------------------"

# Check .env.production file
if [ -f .env.production ]; then
    echo "✅ .env.production file exists"
    
    # Check for localhost references (should not exist)
    if grep -q "localhost\|127.0.0.1" .env.production; then
        echo "❌ ERROR: Production environment contains localhost references!"
        echo "  Found:"
        grep "localhost\|127.0.0.1" .env.production | sed 's/^/    /'
    else
        echo "✅ Production environment has no localhost references"
    fi
    
    # Check for AWS URLs
    if grep -q "amazonaws.com" .env.production; then
        echo "✅ Production environment uses AWS endpoints"
    else
        echo "❌ Production environment missing AWS endpoints"
    fi
    
    # Show key values
    echo "Configuration:"
    grep -E "REACT_APP_API_URL|REACT_APP_ENVIRONMENT|REACT_APP_USER_POOL_ID" .env.production | sed 's/^/  /'
else
    echo "❌ .env.production file not found"
fi

# Test that source files don't have hardcoded localhost
echo ""
echo "🔍 Checking source files for hardcoded URLs:"
echo "--------------------------------------------"

# Check for hardcoded localhost in TypeScript files
HARDCODED_LOCALHOST=$(grep -r "127\.0\.0\.1\|localhost:3001" src/ --include="*.ts" --include="*.tsx" | grep -v "// Local development\|fallback" || true)

if [ -z "$HARDCODED_LOCALHOST" ]; then
    echo "✅ No hardcoded localhost URLs found in source files"
else
    echo "⚠️  Found potential hardcoded URLs:"
    echo "$HARDCODED_LOCALHOST" | head -5 | sed 's/^/  /'
fi

# Test build commands
echo ""
echo "📦 Testing build commands:"
echo "-------------------------"

# Check if build commands are defined
if grep -q "build:local" package.json && grep -q "build:production" package.json; then
    echo "✅ Environment-specific build commands exist"
else
    echo "❌ Missing environment-specific build commands in package.json"
fi

# Summary
echo ""
echo "📊 Summary:"
echo "----------"

ISSUES=0

# Check critical issues
if [ -f .env.production ] && grep -q "localhost\|127.0.0.1" .env.production; then
    echo "❌ CRITICAL: Production environment has localhost references"
    ISSUES=$((ISSUES + 1))
fi

if [ ! -f .env.local ] || [ ! -f .env.production ]; then
    echo "❌ CRITICAL: Missing environment files"
    ISSUES=$((ISSUES + 1))
fi

if [ $ISSUES -eq 0 ]; then
    echo "✅ All environment configurations look correct!"
    echo ""
    echo "To run locally:"
    echo "  1. Start backend: npm run serve:local"
    echo "  2. Start frontend: npm run start:local"
    echo ""
    echo "To deploy to AWS:"
    echo "  1. Build: npm run build:production"
    echo "  2. Deploy: ./auto-deploy.sh production"
else
    echo "❌ Found $ISSUES critical issues that need to be fixed"
fi
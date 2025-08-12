#!/bin/bash

# Configuration helper for OrderNimbus deployment scripts
# Usage: source scripts/config-helper.sh [local|aws]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/../config.json"

# Default to aws if no environment specified
ENVIRONMENT=${1:-aws}

if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ Configuration file not found: $CONFIG_FILE"
    exit 1
fi

# Check if jq is available
if ! command -v jq &> /dev/null; then
    echo "❌ jq is required but not installed. Please install jq first."
    exit 1
fi

# Load configuration for specified environment
load_config() {
    local env=$1
    
    if ! jq -e ".environments.$env" "$CONFIG_FILE" > /dev/null 2>&1; then
        echo "❌ Environment '$env' not found in configuration"
        exit 1
    fi
    
    # Export all configuration variables
    export APP_URL=$(jq -r ".environments.$env.APP_URL" "$CONFIG_FILE")
    export API_URL=$(jq -r ".environments.$env.API_URL" "$CONFIG_FILE")
    export SHOPIFY_REDIRECT_URI=$(jq -r ".environments.$env.SHOPIFY_REDIRECT_URI" "$CONFIG_FILE")
    export AWS_REGION=$(jq -r ".environments.$env.AWS_REGION" "$CONFIG_FILE")
    export STACK_PREFIX=$(jq -r ".environments.$env.STACK_PREFIX" "$CONFIG_FILE")
    export TABLE_NAME=$(jq -r ".environments.$env.TABLE_NAME" "$CONFIG_FILE")
    export S3_BUCKET=$(jq -r ".environments.$env.S3_BUCKET" "$CONFIG_FILE")
    export CLOUDFRONT_ENABLED=$(jq -r ".environments.$env.CLOUDFRONT_ENABLED" "$CONFIG_FILE")
    export CLOUDFRONT_DISTRIBUTION_ID=$(jq -r ".environments.$env.CLOUDFRONT_DISTRIBUTION_ID // empty" "$CONFIG_FILE")
    export DOMAIN_ENABLED=$(jq -r ".environments.$env.DOMAIN_ENABLED" "$CONFIG_FILE")
    export COGNITO_POOL_NAME=$(jq -r ".environments.$env.COGNITO_POOL_NAME" "$CONFIG_FILE")
    
    echo "✅ Loaded $env configuration:"
    echo "   APP_URL: $APP_URL"
    echo "   API_URL: $API_URL"
    echo "   AWS_REGION: $AWS_REGION"
    echo "   STACK_PREFIX: $STACK_PREFIX"
    echo "   S3_BUCKET: $S3_BUCKET"
    echo "   CLOUDFRONT_ENABLED: $CLOUDFRONT_ENABLED"
    echo "   DOMAIN_ENABLED: $DOMAIN_ENABLED"
}

# Load configuration for the specified environment
load_config "$ENVIRONMENT"

# Helper functions
check_aws_cli() {
    if ! command -v aws &> /dev/null; then
        echo "❌ AWS CLI is required but not installed"
        exit 1
    fi
    
    if ! aws sts get-caller-identity &> /dev/null; then
        echo "❌ AWS CLI not configured or credentials invalid"
        exit 1
    fi
}

check_node() {
    if ! command -v node &> /dev/null; then
        echo "❌ Node.js is required but not installed"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        echo "❌ npm is required but not installed"
        exit 1
    fi
}

# Validate environment-specific requirements
validate_environment() {
    local env=$1
    
    case $env in
        "local")
            check_node
            echo "✅ Local environment validated"
            ;;
        "aws")
            check_aws_cli
            check_node
            echo "✅ AWS environment validated"
            ;;
        *)
            echo "❌ Unknown environment: $env"
            exit 1
            ;;
    esac
}

# Export functions for use in other scripts
export -f check_aws_cli
export -f check_node
export -f validate_environment
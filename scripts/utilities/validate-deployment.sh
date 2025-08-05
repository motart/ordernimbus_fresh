#!/bin/bash

# Sales Forecasting Platform - Deployment Validation Script
# Validates that all components are deployed correctly and functioning

set -e

# Configuration
ENVIRONMENT=${1:-staging}
AWS_REGION=${2:-us-east-1}
STACK_PREFIX="ordernimbus"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters for test results
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_WARNING=0

print_status() {
    echo -e "${GREEN}✅ $1${NC}"
    ((TESTS_PASSED++))
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    ((TESTS_WARNING++))
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
    ((TESTS_FAILED++))
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

echo -e "${BLUE}🔍 Validating deployment for environment: $ENVIRONMENT${NC}"
echo "=========================================="

# Load CDK outputs if available
if [ -f "cdk-outputs-$ENVIRONMENT.json" ]; then
    print_info "Found CDK outputs file"
else
    print_error "CDK outputs file not found: cdk-outputs-$ENVIRONMENT.json"
    exit 1
fi

# Test 1: Verify CDK Stacks
echo "📋 Testing CDK Stack Deployment..."
EXPECTED_STACKS=(
    "$STACK_PREFIX-$ENVIRONMENT-networking"
    "$STACK_PREFIX-$ENVIRONMENT-security"
    "$STACK_PREFIX-$ENVIRONMENT-database"
    "$STACK_PREFIX-$ENVIRONMENT-compute"
    "$STACK_PREFIX-$ENVIRONMENT-api"
    "$STACK_PREFIX-$ENVIRONMENT-frontend"
    "$STACK_PREFIX-$ENVIRONMENT-monitoring"
)

for stack in "${EXPECTED_STACKS[@]}"; do
    if aws cloudformation describe-stacks --stack-name $stack --region $AWS_REGION >/dev/null 2>&1; then
        STACK_STATUS=$(aws cloudformation describe-stacks --stack-name $stack --region $AWS_REGION --query 'Stacks[0].StackStatus' --output text)
        if [ "$STACK_STATUS" = "CREATE_COMPLETE" ] || [ "$STACK_STATUS" = "UPDATE_COMPLETE" ]; then
            print_status "Stack $stack is deployed and healthy"
        else
            print_error "Stack $stack is in status: $STACK_STATUS"
        fi
    else
        print_error "Stack $stack not found"
    fi
done

# Test 2: API Gateway Health Check
echo "🔗 Testing API Gateway..."
API_URL=$(jq -r '."'$STACK_PREFIX-$ENVIRONMENT-api'".ApiGatewayUrl' cdk-outputs-$ENVIRONMENT.json)

if [ "$API_URL" != "null" ] && [ -n "$API_URL" ]; then
    # Test health endpoint
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health" || echo "000")
    if [ "$HTTP_STATUS" = "200" ]; then
        print_status "API Gateway health check passed"
    else
        print_error "API Gateway health check failed (HTTP $HTTP_STATUS)"
    fi
    
    # Test CORS headers
    CORS_HEADERS=$(curl -s -I "$API_URL/health" | grep -i "access-control-allow-origin" || echo "")
    if [ -n "$CORS_HEADERS" ]; then
        print_status "CORS headers configured correctly"
    else
        print_warning "CORS headers not found or not configured"
    fi
else
    print_error "API Gateway URL not found in CDK outputs"
fi

# Test 3: Database Connectivity
echo "🗄️  Testing Database..."
DB_ENDPOINT=$(jq -r '."'$STACK_PREFIX-$ENVIRONMENT-database'".DatabaseEndpoint' cdk-outputs-$ENVIRONMENT.json)

if [ "$DB_ENDPOINT" != "null" ] && [ -n "$DB_ENDPOINT" ]; then
    print_info "Database endpoint: $DB_ENDPOINT"
    
    # Test database endpoint resolution
    if nslookup $DB_ENDPOINT >/dev/null 2>&1; then
        print_status "Database endpoint resolves correctly"
    else
        print_error "Database endpoint does not resolve"
    fi
    
    # Check database status via AWS CLI
    DB_CLUSTER_ID=$(echo $DB_ENDPOINT | cut -d. -f1)
    DB_STATUS=$(aws rds describe-db-clusters --db-cluster-identifier $DB_CLUSTER_ID --region $AWS_REGION --query 'DBClusters[0].Status' --output text 2>/dev/null || echo "unknown")
    
    if [ "$DB_STATUS" = "available" ]; then
        print_status "Database cluster is available"
    else
        print_error "Database cluster status: $DB_STATUS"
    fi
else
    print_error "Database endpoint not found in CDK outputs"
fi

# Test 4: ECS Services
echo "🐳 Testing ECS Services..."
CLUSTER_NAME="$STACK_PREFIX-$ENVIRONMENT-cluster"

if aws ecs describe-clusters --clusters $CLUSTER_NAME --region $AWS_REGION >/dev/null 2>&1; then
    print_status "ECS cluster $CLUSTER_NAME exists"
    
    # Check service status
    SERVICES=$(aws ecs list-services --cluster $CLUSTER_NAME --region $AWS_REGION --query 'serviceArns' --output text)
    
    if [ -n "$SERVICES" ]; then
        for service_arn in $SERVICES; do
            service_name=$(basename $service_arn)
            running_count=$(aws ecs describe-services --cluster $CLUSTER_NAME --services $service_arn --region $AWS_REGION --query 'services[0].runningCount' --output text)
            desired_count=$(aws ecs describe-services --cluster $CLUSTER_NAME --services $service_arn --region $AWS_REGION --query 'services[0].desiredCount' --output text)
            
            if [ "$running_count" = "$desired_count" ] && [ "$running_count" -gt "0" ]; then
                print_status "ECS service $service_name: $running_count/$desired_count tasks running"
            else
                print_error "ECS service $service_name: $running_count/$desired_count tasks (unhealthy)"
            fi
        done
    else
        print_warning "No ECS services found in cluster"
    fi
else
    print_error "ECS cluster $CLUSTER_NAME not found"
fi

# Test 5: S3 Buckets
echo "🪣 Testing S3 Buckets..."
EXPECTED_BUCKETS=(
    "$STACK_PREFIX-$ENVIRONMENT-frontend-assets"
    "$STACK_PREFIX-$ENVIRONMENT-data-lake"
    "$STACK_PREFIX-$ENVIRONMENT-ml-artifacts"
    "$STACK_PREFIX-$ENVIRONMENT-backups"
    "$STACK_PREFIX-$ENVIRONMENT-logs"
)

for bucket in "${EXPECTED_BUCKETS[@]}"; do
    if aws s3api head-bucket --bucket $bucket --region $AWS_REGION 2>/dev/null; then
        print_status "S3 bucket $bucket exists and accessible"
        
        # Check encryption
        ENCRYPTION=$(aws s3api get-bucket-encryption --bucket $bucket --region $AWS_REGION 2>/dev/null | jq -r '.ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.SSEAlgorithm' || echo "none")
        if [ "$ENCRYPTION" != "none" ] && [ "$ENCRYPTION" != "null" ]; then
            print_status "S3 bucket $bucket has encryption enabled ($ENCRYPTION)"
        else
            print_warning "S3 bucket $bucket encryption not configured"
        fi
    else
        print_error "S3 bucket $bucket not accessible or doesn't exist"
    fi
done

# Test 6: CloudFront Distribution
echo "🌐 Testing CloudFront..."
DISTRIBUTION_ID=$(jq -r '."'$STACK_PREFIX-$ENVIRONMENT-frontend'".CloudFrontDistributionId' cdk-outputs-$ENVIRONMENT.json)

if [ "$DISTRIBUTION_ID" != "null" ] && [ -n "$DISTRIBUTION_ID" ]; then
    DISTRIBUTION_STATUS=$(aws cloudfront get-distribution --id $DISTRIBUTION_ID --query 'Distribution.Status' --output text 2>/dev/null || echo "unknown")
    
    if [ "$DISTRIBUTION_STATUS" = "Deployed" ]; then
        print_status "CloudFront distribution is deployed"
        
        # Test CloudFront URL
        CLOUDFRONT_URL=$(jq -r '."'$STACK_PREFIX-$ENVIRONMENT-frontend'".CloudFrontUrl' cdk-outputs-$ENVIRONMENT.json)
        if [ "$CLOUDFRONT_URL" != "null" ] && [ -n "$CLOUDFRONT_URL" ]; then
            HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$CLOUDFRONT_URL" || echo "000")
            if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "403" ]; then
                print_status "CloudFront URL is accessible"
            else
                print_warning "CloudFront URL returned HTTP $HTTP_STATUS"
            fi
        fi
    else
        print_error "CloudFront distribution status: $DISTRIBUTION_STATUS"
    fi
else
    print_error "CloudFront distribution ID not found"
fi

# Test 7: Cognito User Pool
echo "👤 Testing Cognito..."
USER_POOL_ID=$(jq -r '."'$STACK_PREFIX-$ENVIRONMENT-security'".UserPoolId' cdk-outputs-$ENVIRONMENT.json)

if [ "$USER_POOL_ID" != "null" ] && [ -n "$USER_POOL_ID" ]; then
    USER_POOL_STATUS=$(aws cognito-idp describe-user-pool --user-pool-id $USER_POOL_ID --region $AWS_REGION --query 'UserPool.Status' --output text 2>/dev/null || echo "unknown")
    
    if [ "$USER_POOL_STATUS" = "Enabled" ] || [ "$USER_POOL_STATUS" = "unknown" ]; then
        print_status "Cognito User Pool is available"
    else
        print_error "Cognito User Pool status: $USER_POOL_STATUS"
    fi
else
    print_error "Cognito User Pool ID not found"
fi

# Test 8: Parameter Store Values
echo "⚙️  Testing Parameter Store..."
CRITICAL_PARAMETERS=(
    "/ordernimbus/$ENVIRONMENT/database/master-username"
    "/ordernimbus/$ENVIRONMENT/database/name"
    "/ordernimbus/$ENVIRONMENT/api/cors-origins"
)

for param in "${CRITICAL_PARAMETERS[@]}"; do
    if aws ssm get-parameter --name "$param" --region $AWS_REGION >/dev/null 2>&1; then
        print_status "Parameter $param exists"
    else
        print_error "Parameter $param not found"
    fi
done

# Test 9: Auto Scaling Configuration
echo "📈 Testing Auto Scaling..."
SCALABLE_TARGETS=$(aws application-autoscaling describe-scalable-targets --service-namespace ecs --region $AWS_REGION --query 'ScalableTargets[?contains(ResourceId, `'$ENVIRONMENT'`)].ResourceId' --output text 2>/dev/null || echo "")

if [ -n "$SCALABLE_TARGETS" ]; then
    for target in $SCALABLE_TARGETS; do
        print_status "Auto Scaling target configured: $target"
    done
else
    print_warning "No Auto Scaling targets found"
fi

# Test 10: CloudWatch Alarms
echo "🚨 Testing CloudWatch Alarms..."
ALARM_COUNT=$(aws cloudwatch describe-alarms --region $AWS_REGION --query "MetricAlarms[?contains(AlarmName, '$ENVIRONMENT')] | length(@)" --output text)

if [ "$ALARM_COUNT" -gt "0" ]; then
    print_status "$ALARM_COUNT CloudWatch alarms configured"
    
    # Check for critical alarms in ALARM state
    ALARM_STATE_COUNT=$(aws cloudwatch describe-alarms --state-value ALARM --region $AWS_REGION --query "MetricAlarms[?contains(AlarmName, '$ENVIRONMENT')] | length(@)" --output text)
    
    if [ "$ALARM_STATE_COUNT" -gt "0" ]; then
        print_error "$ALARM_STATE_COUNT alarms are currently in ALARM state"
    else
        print_status "All alarms are in OK state"
    fi
else
    print_warning "No CloudWatch alarms found for environment"
fi

# Test 11: Performance Test
echo "⚡ Running Quick Performance Test..."
if [ "$API_URL" != "null" ] && [ -n "$API_URL" ]; then
    # Simple load test with curl
    echo "Running 10 concurrent requests to health endpoint..."
    
    RESPONSE_TIMES=()
    for i in {1..10}; do
        RESPONSE_TIME=$(curl -s -o /dev/null -w "%{time_total}" "$API_URL/health" 2>/dev/null || echo "999")
        RESPONSE_TIMES+=($RESPONSE_TIME)
    done
    
    # Calculate average response time
    TOTAL=0
    for time in "${RESPONSE_TIMES[@]}"; do
        TOTAL=$(echo "$TOTAL + $time" | bc -l)
    done
    AVERAGE=$(echo "scale=3; $TOTAL / ${#RESPONSE_TIMES[@]}" | bc -l)
    
    if (( $(echo "$AVERAGE < 0.5" | bc -l) )); then
        print_status "Average response time: ${AVERAGE}s (under 500ms target)"
    else
        print_warning "Average response time: ${AVERAGE}s (exceeds 500ms target)"
    fi
else
    print_warning "Skipping performance test - API URL not available"
fi

# Summary
echo ""
echo "=========================================="
echo -e "${BLUE}📊 Validation Summary${NC}"
echo "=========================================="
echo -e "${GREEN}Tests Passed: $TESTS_PASSED${NC}"
echo -e "${YELLOW}Warnings: $TESTS_WARNING${NC}"
echo -e "${RED}Tests Failed: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All critical tests passed! Deployment is healthy.${NC}"
    exit 0
elif [ $TESTS_FAILED -le 2 ]; then
    echo -e "${YELLOW}⚠️  Deployment has minor issues but is mostly functional.${NC}"
    exit 1
else
    echo -e "${RED}❌ Deployment has significant issues and may not be functional.${NC}"
    exit 2
fi
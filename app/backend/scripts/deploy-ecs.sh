#!/bin/bash

# ECS Deployment Script for OrderNimbus API
# Usage: ./deploy-ecs.sh [environment] [region]

set -e

# Configuration
ENVIRONMENT=${1:-staging}
AWS_REGION=${2:-us-west-1}
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPOSITORY="ordernimbus-api"
ECS_CLUSTER="ordernimbus-${ENVIRONMENT}"
ECS_SERVICE="ordernimbus-${ENVIRONMENT}-api"
IMAGE_TAG=$(git rev-parse --short HEAD)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting deployment to ${ENVIRONMENT} in ${AWS_REGION}${NC}"

# 1. Build Docker image
echo -e "${YELLOW}Building Docker image...${NC}"
docker build -t ${ECR_REPOSITORY}:${IMAGE_TAG} .

# 2. Login to ECR
echo -e "${YELLOW}Logging in to ECR...${NC}"
aws ecr get-login-password --region ${AWS_REGION} | \
  docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

# 3. Create ECR repository if it doesn't exist
aws ecr describe-repositories --repository-names ${ECR_REPOSITORY} --region ${AWS_REGION} || \
  aws ecr create-repository --repository-name ${ECR_REPOSITORY} --region ${AWS_REGION}

# 4. Tag and push image
echo -e "${YELLOW}Pushing image to ECR...${NC}"
docker tag ${ECR_REPOSITORY}:${IMAGE_TAG} \
  ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}:${IMAGE_TAG}

docker tag ${ECR_REPOSITORY}:${IMAGE_TAG} \
  ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}:latest

docker push ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}:${IMAGE_TAG}
docker push ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}:latest

# 5. Update task definition
echo -e "${YELLOW}Updating task definition...${NC}"
TASK_DEFINITION=$(aws ecs describe-task-definition \
  --task-definition ordernimbus-${ENVIRONMENT}-api \
  --region ${AWS_REGION} \
  --query 'taskDefinition' \
  --output json)

NEW_TASK_DEF=$(echo $TASK_DEFINITION | \
  jq --arg IMAGE "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}:${IMAGE_TAG}" \
  '.containerDefinitions[0].image = $IMAGE | del(.taskDefinitionArn) | del(.revision) | del(.status) | del(.requiresAttributes) | del(.compatibilities) | del(.registeredAt) | del(.registeredBy)')

NEW_TASK_INFO=$(aws ecs register-task-definition \
  --region ${AWS_REGION} \
  --cli-input-json "$NEW_TASK_DEF")

NEW_REVISION=$(echo $NEW_TASK_INFO | jq -r '.taskDefinition.revision')

# 6. Update service with new task definition
echo -e "${YELLOW}Updating ECS service...${NC}"
aws ecs update-service \
  --cluster ${ECS_CLUSTER} \
  --service ${ECS_SERVICE} \
  --task-definition ordernimbus-${ENVIRONMENT}-api:${NEW_REVISION} \
  --region ${AWS_REGION} \
  --force-new-deployment

# 7. Wait for service to stabilize
echo -e "${YELLOW}Waiting for service to stabilize...${NC}"
aws ecs wait services-stable \
  --cluster ${ECS_CLUSTER} \
  --services ${ECS_SERVICE} \
  --region ${AWS_REGION}

# 8. Verify deployment
echo -e "${YELLOW}Verifying deployment...${NC}"
RUNNING_COUNT=$(aws ecs describe-services \
  --cluster ${ECS_CLUSTER} \
  --services ${ECS_SERVICE} \
  --region ${AWS_REGION} \
  --query 'services[0].runningCount' \
  --output text)

DESIRED_COUNT=$(aws ecs describe-services \
  --cluster ${ECS_CLUSTER} \
  --services ${ECS_SERVICE} \
  --region ${AWS_REGION} \
  --query 'services[0].desiredCount' \
  --output text)

if [ "$RUNNING_COUNT" == "$DESIRED_COUNT" ]; then
  echo -e "${GREEN}✓ Deployment successful!${NC}"
  echo -e "${GREEN}  Image: ${IMAGE_TAG}${NC}"
  echo -e "${GREEN}  Task Definition Revision: ${NEW_REVISION}${NC}"
  echo -e "${GREEN}  Running Tasks: ${RUNNING_COUNT}/${DESIRED_COUNT}${NC}"
else
  echo -e "${RED}✗ Deployment may have issues${NC}"
  echo -e "${RED}  Running Tasks: ${RUNNING_COUNT}/${DESIRED_COUNT}${NC}"
  exit 1
fi

# 9. Run health check
echo -e "${YELLOW}Running health check...${NC}"
ALB_DNS=$(aws elbv2 describe-load-balancers \
  --names ordernimbus-${ENVIRONMENT}-alb \
  --region ${AWS_REGION} \
  --query 'LoadBalancers[0].DNSName' \
  --output text)

if [ ! -z "$ALB_DNS" ]; then
  HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://${ALB_DNS}/api/v1/health)
  if [ "$HEALTH_STATUS" == "200" ]; then
    echo -e "${GREEN}✓ Health check passed${NC}"
  else
    echo -e "${YELLOW}⚠ Health check returned status: ${HEALTH_STATUS}${NC}"
  fi
fi

echo -e "${GREEN}Deployment complete!${NC}"
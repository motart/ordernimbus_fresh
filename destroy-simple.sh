#\!/bin/bash
ENVIRONMENT=${1:-staging}
REGION=${2:-us-west-1}
STACK_NAME="ordernimbus-${ENVIRONMENT}-simple"

echo "Destroying stack: $STACK_NAME in $REGION"

# Get S3 bucket name
BUCKET=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query 'Stacks[0].Outputs[?OutputKey==`S3BucketName`].OutputValue' --output text 2>/dev/null)

# Empty S3 bucket if it exists
if [ -n "$BUCKET" ]; then
    echo "Emptying S3 bucket: $BUCKET"
    aws s3 rm "s3://$BUCKET" --recursive --region "$REGION" 2>/dev/null || true
fi

# Delete stack
aws cloudformation delete-stack --stack-name "$STACK_NAME" --region "$REGION"
echo "Waiting for stack deletion..."
aws cloudformation wait stack-delete-complete --stack-name "$STACK_NAME" --region "$REGION"
echo "✅ Stack deleted successfully\!"

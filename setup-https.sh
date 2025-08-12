#!/bin/bash

################################################################################
# Setup HTTPS for OrderNimbus with CloudFront and ACM
################################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
DOMAIN="app.ordernimbus.com"
BUCKET_NAME="app.ordernimbus.com"
REGION="us-west-1"
HOSTED_ZONE_ID="Z03623712FIVU7Z4CJ949"

print_status() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }

echo "==========================================="
echo -e "${GREEN}Setting up HTTPS for OrderNimbus${NC}"
echo "==========================================="
echo ""

# Step 1: Request SSL Certificate in ACM (must be in us-east-1 for CloudFront)
print_status "Requesting SSL certificate in ACM (us-east-1)..."

# Check if certificate already exists
EXISTING_CERT=$(aws acm list-certificates --region us-east-1 \
    --query "CertificateSummaryList[?DomainName=='$DOMAIN'].CertificateArn" \
    --output text 2>/dev/null || echo "")

if [ -n "$EXISTING_CERT" ]; then
    print_success "Certificate already exists: $EXISTING_CERT"
    CERT_ARN="$EXISTING_CERT"
else
    # Request new certificate
    CERT_ARN=$(aws acm request-certificate \
        --domain-name "$DOMAIN" \
        --validation-method DNS \
        --region us-east-1 \
        --query 'CertificateArn' \
        --output text)
    
    print_success "Certificate requested: $CERT_ARN"
    
    # Wait for DNS validation records to be available
    print_status "Waiting for validation records..."
    sleep 10
    
    # Get DNS validation records
    VALIDATION_RECORD=$(aws acm describe-certificate \
        --certificate-arn "$CERT_ARN" \
        --region us-east-1 \
        --query 'Certificate.DomainValidationOptions[0].ResourceRecord' \
        --output json)
    
    RECORD_NAME=$(echo "$VALIDATION_RECORD" | jq -r '.Name')
    RECORD_VALUE=$(echo "$VALIDATION_RECORD" | jq -r '.Value')
    
    print_status "Creating DNS validation record..."
    
    # Create DNS validation record
    cat > /tmp/dns-validation.json <<EOF
{
    "Changes": [{
        "Action": "UPSERT",
        "ResourceRecordSet": {
            "Name": "$RECORD_NAME",
            "Type": "CNAME",
            "TTL": 300,
            "ResourceRecords": [{"Value": "$RECORD_VALUE"}]
        }
    }]
}
EOF
    
    aws route53 change-resource-record-sets \
        --hosted-zone-id "$HOSTED_ZONE_ID" \
        --change-batch file:///tmp/dns-validation.json \
        --output text >/dev/null
    
    print_success "DNS validation record created"
    
    # Wait for certificate validation
    print_status "Waiting for certificate validation (this may take up to 30 minutes)..."
    aws acm wait certificate-validated \
        --certificate-arn "$CERT_ARN" \
        --region us-east-1 2>/dev/null || {
        print_warning "Certificate validation is pending. It will complete automatically."
    }
fi

# Step 2: Create CloudFront distribution
print_status "Creating CloudFront distribution..."

# Check if distribution already exists
EXISTING_DIST=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?contains(Aliases.Items, '$DOMAIN')].Id" \
    --output text 2>/dev/null || echo "")

if [ -n "$EXISTING_DIST" ]; then
    print_warning "CloudFront distribution already exists: $EXISTING_DIST"
    DISTRIBUTION_ID="$EXISTING_DIST"
else
    # Create CloudFront distribution configuration
    cat > /tmp/cloudfront-config.json <<EOF
{
    "CallerReference": "ordernimbus-$(date +%s)",
    "Aliases": {
        "Quantity": 1,
        "Items": ["$DOMAIN"]
    },
    "DefaultRootObject": "index.html",
    "Origins": {
        "Quantity": 1,
        "Items": [{
            "Id": "S3-$BUCKET_NAME",
            "DomainName": "$BUCKET_NAME.s3-website-$REGION.amazonaws.com",
            "CustomOriginConfig": {
                "HTTPPort": 80,
                "HTTPSPort": 443,
                "OriginProtocolPolicy": "http-only",
                "OriginSslProtocols": {
                    "Quantity": 3,
                    "Items": ["TLSv1", "TLSv1.1", "TLSv1.2"]
                },
                "OriginReadTimeout": 30,
                "OriginKeepaliveTimeout": 5
            }
        }]
    },
    "DefaultCacheBehavior": {
        "TargetOriginId": "S3-$BUCKET_NAME",
        "ViewerProtocolPolicy": "redirect-to-https",
        "AllowedMethods": {
            "Quantity": 2,
            "Items": ["HEAD", "GET"],
            "CachedMethods": {
                "Quantity": 2,
                "Items": ["HEAD", "GET"]
            }
        },
        "ForwardedValues": {
            "QueryString": false,
            "Cookies": {"Forward": "none"},
            "Headers": {
                "Quantity": 0
            }
        },
        "TrustedSigners": {
            "Enabled": false,
            "Quantity": 0
        },
        "MinTTL": 0,
        "DefaultTTL": 86400,
        "MaxTTL": 31536000,
        "Compress": true
    },
    "CustomErrorResponses": {
        "Quantity": 1,
        "Items": [{
            "ErrorCode": 404,
            "ResponsePagePath": "/index.html",
            "ResponseCode": "200",
            "ErrorCachingMinTTL": 300
        }]
    },
    "Comment": "OrderNimbus HTTPS Distribution",
    "Enabled": true,
    "ViewerCertificate": {
        "ACMCertificateArn": "$CERT_ARN",
        "SSLSupportMethod": "sni-only",
        "MinimumProtocolVersion": "TLSv1.2_2021"
    },
    "HttpVersion": "http2"
}
EOF
    
    # Create the distribution
    DISTRIBUTION_OUTPUT=$(aws cloudfront create-distribution \
        --distribution-config file:///tmp/cloudfront-config.json \
        --output json 2>/dev/null || echo "{}")
    
    DISTRIBUTION_ID=$(echo "$DISTRIBUTION_OUTPUT" | jq -r '.Distribution.Id' || echo "")
    DISTRIBUTION_DOMAIN=$(echo "$DISTRIBUTION_OUTPUT" | jq -r '.Distribution.DomainName' || echo "")
    
    if [ -n "$DISTRIBUTION_ID" ]; then
        print_success "CloudFront distribution created: $DISTRIBUTION_ID"
        print_status "CloudFront domain: $DISTRIBUTION_DOMAIN"
    else
        print_error "Failed to create CloudFront distribution"
        exit 1
    fi
fi

# Get distribution domain if we already had one
if [ -z "$DISTRIBUTION_DOMAIN" ] && [ -n "$DISTRIBUTION_ID" ]; then
    DISTRIBUTION_DOMAIN=$(aws cloudfront get-distribution \
        --id "$DISTRIBUTION_ID" \
        --query 'Distribution.DomainName' \
        --output text)
fi

# Step 3: Update DNS to point to CloudFront
print_status "Updating DNS to point to CloudFront..."

# Delete existing CNAME record if it exists
aws route53 change-resource-record-sets \
    --hosted-zone-id "$HOSTED_ZONE_ID" \
    --change-batch "{
        \"Changes\": [{
            \"Action\": \"DELETE\",
            \"ResourceRecordSet\": {
                \"Name\": \"$DOMAIN\",
                \"Type\": \"CNAME\",
                \"TTL\": 300,
                \"ResourceRecords\": [{\"Value\": \"s3-website-$REGION.amazonaws.com\"}]
            }
        }]
    }" 2>/dev/null || true

# Create new CNAME record pointing to CloudFront
aws route53 change-resource-record-sets \
    --hosted-zone-id "$HOSTED_ZONE_ID" \
    --change-batch "{
        \"Changes\": [{
            \"Action\": \"UPSERT\",
            \"ResourceRecordSet\": {
                \"Name\": \"$DOMAIN\",
                \"Type\": \"CNAME\",
                \"TTL\": 300,
                \"ResourceRecords\": [{\"Value\": \"$DISTRIBUTION_DOMAIN\"}]
            }
        }]
    }" --output text >/dev/null

print_success "DNS updated to point to CloudFront"

# Step 4: Wait for distribution to deploy
if [ -n "$DISTRIBUTION_ID" ]; then
    print_status "Waiting for CloudFront distribution to deploy (this may take 15-20 minutes)..."
    
    # Check distribution status
    STATUS="InProgress"
    while [ "$STATUS" = "InProgress" ]; do
        STATUS=$(aws cloudfront get-distribution \
            --id "$DISTRIBUTION_ID" \
            --query 'Distribution.Status' \
            --output text 2>/dev/null || echo "InProgress")
        
        if [ "$STATUS" = "Deployed" ]; then
            print_success "CloudFront distribution deployed!"
            break
        else
            echo -n "."
            sleep 30
        fi
    done
fi

# Clean up temporary files
rm -f /tmp/dns-validation.json /tmp/cloudfront-config.json

# Summary
echo ""
echo "==========================================="
echo -e "${GREEN}✅ HTTPS Setup Complete!${NC}"
echo "==========================================="
echo ""
echo -e "${BLUE}Configuration Summary:${NC}"
echo "  • Domain: https://$DOMAIN"
echo "  • CloudFront ID: $DISTRIBUTION_ID"
echo "  • CloudFront Domain: $DISTRIBUTION_DOMAIN"
echo "  • SSL Certificate: $CERT_ARN"
echo ""
echo -e "${YELLOW}Important Notes:${NC}"
echo "  • DNS propagation may take 5-10 minutes"
echo "  • CloudFront deployment takes 15-20 minutes"
echo "  • First HTTPS access may be slow (cache warming)"
echo ""
echo -e "${GREEN}Your app will be available at:${NC}"
echo "  • https://app.ordernimbus.com (secure)"
echo "  • http://app.ordernimbus.com (redirects to HTTPS)"
echo ""
echo "==========================================="
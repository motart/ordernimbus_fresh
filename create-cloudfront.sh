#!/bin/bash

# Create CloudFront distribution for OrderNimbus

set -e

# Configuration
S3_BUCKET="ordernimbus-production-frontend-335021149718"
CERT_ARN="arn:aws:acm:us-east-1:335021149718:certificate/69261ffd-007e-49f1-9a1c-80c666bec3ea"
HOSTED_ZONE_ID="Z03623712FIVU7Z4CJ949"

echo "Creating CloudFront distribution for app.ordernimbus.com..."

# Create distribution config
cat > /tmp/cloudfront-config.json << EOF
{
  "CallerReference": "ordernimbus-$(date +%s)",
  "Comment": "OrderNimbus Production Frontend",
  "DefaultRootObject": "index.html",
  "Enabled": true,
  "Origins": {
    "Quantity": 1,
    "Items": [
      {
        "Id": "S3-${S3_BUCKET}",
        "DomainName": "${S3_BUCKET}.s3-website-us-west-1.amazonaws.com",
        "CustomOriginConfig": {
          "HTTPPort": 80,
          "HTTPSPort": 443,
          "OriginProtocolPolicy": "http-only",
          "OriginSslProtocols": {
            "Quantity": 1,
            "Items": ["TLSv1.2"]
          }
        }
      }
    ]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "S3-${S3_BUCKET}",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 3,
      "Items": ["GET", "HEAD", "OPTIONS"],
      "CachedMethods": {
        "Quantity": 2,
        "Items": ["GET", "HEAD"]
      }
    },
    "ForwardedValues": {
      "QueryString": false,
      "Cookies": {"Forward": "none"}
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
    "Quantity": 2,
    "Items": [
      {
        "ErrorCode": 404,
        "ResponseCode": "200",
        "ResponsePagePath": "/index.html",
        "ErrorCachingMinTTL": 0
      },
      {
        "ErrorCode": 403,
        "ResponseCode": "200",
        "ResponsePagePath": "/index.html",
        "ErrorCachingMinTTL": 0
      }
    ]
  },
  "Aliases": {
    "Quantity": 1,
    "Items": ["app.ordernimbus.com"]
  },
  "ViewerCertificate": {
    "ACMCertificateArn": "${CERT_ARN}",
    "SSLSupportMethod": "sni-only",
    "MinimumProtocolVersion": "TLSv1.2_2021"
  },
  "HttpVersion": "http2",
  "PriceClass": "PriceClass_100"
}
EOF

# Create the distribution
DISTRIBUTION_ID=$(aws cloudfront create-distribution \
  --distribution-config file:///tmp/cloudfront-config.json \
  --region us-east-1 \
  --query 'Distribution.Id' \
  --output text)

echo "CloudFront distribution created: $DISTRIBUTION_ID"

# Get the CloudFront domain name
CF_DOMAIN=$(aws cloudfront get-distribution \
  --id "$DISTRIBUTION_ID" \
  --region us-east-1 \
  --query 'Distribution.DomainName' \
  --output text)

echo "CloudFront domain: $CF_DOMAIN"

# Update Route53 DNS record
echo "Updating DNS record for app.ordernimbus.com..."

# First, delete existing record if it exists
aws route53 list-resource-record-sets \
  --hosted-zone-id "$HOSTED_ZONE_ID" \
  --query "ResourceRecordSets[?Name=='app.ordernimbus.com.']" \
  --output json > /tmp/existing-records.json

if [ $(jq length /tmp/existing-records.json) -gt 0 ]; then
  echo "Removing existing DNS record..."
  cat > /tmp/delete-record.json << EOF
{
  "Changes": [{
    "Action": "DELETE",
    "ResourceRecordSet": $(jq '.[0]' /tmp/existing-records.json)
  }]
}
EOF
  aws route53 change-resource-record-sets \
    --hosted-zone-id "$HOSTED_ZONE_ID" \
    --change-batch file:///tmp/delete-record.json \
    --output json > /dev/null
  sleep 5
fi

# Create new A record pointing to CloudFront
cat > /tmp/create-record.json << EOF
{
  "Changes": [{
    "Action": "CREATE",
    "ResourceRecordSet": {
      "Name": "app.ordernimbus.com",
      "Type": "A",
      "AliasTarget": {
        "HostedZoneId": "Z2FDTNDATAQYW2",
        "DNSName": "${CF_DOMAIN}",
        "EvaluateTargetHealth": false
      }
    }
  }]
}
EOF

aws route53 change-resource-record-sets \
  --hosted-zone-id "$HOSTED_ZONE_ID" \
  --change-batch file:///tmp/create-record.json \
  --output json > /dev/null

echo "DNS record created for app.ordernimbus.com"

# Update config.json with CloudFront info
python3 -c "
import json
with open('config.json', 'r') as f:
    config = json.load(f)
config['environments']['aws']['CLOUDFRONT_DISTRIBUTION_ID'] = '$DISTRIBUTION_ID'
config['environments']['aws']['CLOUDFRONT_DOMAIN'] = '$CF_DOMAIN'
with open('config.json', 'w') as f:
    json.dump(config, f, indent=2)
"

echo ""
echo "✅ CloudFront distribution created successfully!"
echo ""
echo "Distribution ID: $DISTRIBUTION_ID"
echo "CloudFront URL: https://$CF_DOMAIN"
echo "Custom Domain: https://app.ordernimbus.com"
echo ""
echo "Note: It may take 15-30 minutes for the distribution to be fully deployed."
echo "DNS propagation may take additional time."
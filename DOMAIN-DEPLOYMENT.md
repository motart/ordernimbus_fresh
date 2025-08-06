# OrderNimbus Domain Deployment

## 🌐 Overview

This deployment connects OrderNimbus to your custom domain `app.ordernimbus.com` with full SSL/TLS encryption and automatic DNS configuration.

## 🚀 Quick Deployment

### Production Deployment
```bash
# Deploy to app.ordernimbus.com
./deploy-domain.sh production us-east-1

# Destroy and clean up DNS
./destroy-domain.sh production us-east-1
```

### Staging Deployment
```bash
# Deploy to app-staging.ordernimbus.com
./deploy-domain.sh staging us-east-1

# Destroy and clean up DNS
./destroy-domain.sh staging us-east-1
```

## 📦 What Gets Deployed

### Domain Configuration
- **Production**: `app.ordernimbus.com`
- **Staging**: `app-staging.ordernimbus.com`
- **API**: `api.ordernimbus.com` or `api-staging.ordernimbus.com`

### Resources Created
1. **SSL/TLS Certificate** (ACM)
   - Automatic validation via DNS
   - Auto-renewal before expiration
   - Covers www subdomain

2. **CloudFront Distribution**
   - Global CDN for fast loading
   - HTTPS only (redirects HTTP)
   - Custom domain with SSL

3. **Route 53 DNS Records**
   - A record for app domain → CloudFront
   - CNAME for www → app domain
   - CNAME for api → API Gateway

4. **API Gateway**
   - Custom domain support
   - CORS configured for your domain

5. **Lambda Function**
   - Single function handling all routes
   - CORS headers for your domain

6. **S3 Bucket**
   - Static website hosting
   - Frontend files

7. **DynamoDB Table**
   - Single table for all data

## ⏱ Deployment Time

- **Initial Deployment**: 15-20 minutes
  - SSL certificate validation: 2-5 minutes
  - CloudFront distribution: 15-20 minutes
- **Updates**: 5-10 minutes
- **Destruction**: 5-10 minutes

## 🔐 Security Features

- **HTTPS Everywhere**: All traffic encrypted with TLS 1.2+
- **Automatic Certificate Renewal**: No manual certificate management
- **CORS Protection**: Only your domain can access the API
- **CloudFront Security**: DDoS protection included

## 🔧 Configuration

### Environment Variables (Frontend)
The deployment automatically configures:
- `REACT_APP_API_URL`: Points to your API domain
- `REACT_APP_ENVIRONMENT`: Current environment
- `REACT_APP_REGION`: AWS region

### CORS Configuration
The API automatically allows:
- `https://app.ordernimbus.com` (production)
- `https://app-staging.ordernimbus.com` (staging)
- Includes www variants

## 🧹 Clean Destruction

The destruction script properly:
1. Empties S3 bucket
2. Disables CloudFront distribution
3. Deletes CloudFormation stack
4. Removes all DNS records
5. Cleans up all resources

```bash
# Safe destruction with confirmation
./destroy-domain.sh production us-east-1

# Force destruction (no confirmation)
./destroy-domain.sh production us-east-1 force
```

## 📊 DNS Propagation

After deployment:
- **CloudFront**: Active in 15-20 minutes
- **DNS Records**: Created immediately
- **Global Propagation**: Up to 48 hours (usually much faster)

You can check DNS propagation:
```bash
# Check if DNS is resolving
nslookup app.ordernimbus.com
dig app.ordernimbus.com

# Check from different locations
curl -I https://app.ordernimbus.com
```

## 🔍 Troubleshooting

### SSL Certificate Stuck
If certificate validation takes too long:
1. Check Route 53 for validation CNAME records
2. Ensure hosted zone ID is correct
3. Certificate must be in us-east-1 for CloudFront

### CloudFront Not Working
- Wait 15-20 minutes for distribution to deploy
- Check if distribution is enabled
- Verify S3 bucket has content

### DNS Not Resolving
- Check Route 53 console for records
- Verify hosted zone is active
- DNS propagation can take up to 48 hours

### CORS Errors
- Verify API Lambda has correct ALLOWED_ORIGINS
- Check browser console for specific errors
- Ensure frontend uses HTTPS URLs

## 💰 Cost Estimation

Monthly costs (approximate):
- **Route 53**: $0.50 per hosted zone + $0.40 per million queries
- **CloudFront**: First 1TB free, then $0.085/GB
- **ACM Certificate**: Free
- **S3**: ~$0.023/GB storage + requests
- **Lambda**: First 1M requests free
- **API Gateway**: First 1M requests free
- **Total**: ~$5-20/month for moderate traffic

## 🎯 Best Practices

1. **Always use HTTPS** - The template enforces this
2. **Monitor CloudFront costs** - Set up billing alerts
3. **Use CloudFront caching** - Reduces S3 requests
4. **Regular backups** - Export DynamoDB data periodically
5. **DNS TTL** - Keep at 300 seconds for flexibility

## 📝 Testing After Deployment

```bash
# Test API health
curl https://api.ordernimbus.com/production/api/health

# Test frontend
curl -I https://app.ordernimbus.com

# Test CORS
curl -H "Origin: https://app.ordernimbus.com" \
     -I https://api.ordernimbus.com/production/api/products
```

## 🚨 Important Notes

1. **Domain Ownership**: Ensure you own ordernimbus.com
2. **Region**: Must use us-east-1 for CloudFront certificates
3. **First Deployment**: Takes longer due to certificate validation
4. **Destruction**: Always empty S3 bucket first
5. **DNS Changes**: Can affect email if MX records exist

## 🔄 Updates

To update the deployment:
```bash
# Just run deploy again - it will update existing resources
./deploy-domain.sh production us-east-1
```

CloudFormation will:
- Only update changed resources
- Maintain DNS records
- Keep SSL certificate
- Preserve S3 content (unless you sync)

---

**Support**: Check CloudFormation events for detailed error messages
**Status**: Check AWS Console → CloudFormation → Stacks
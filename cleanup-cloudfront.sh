#!/bin/bash

################################################################################
# CloudFront Cleanup Script
# Helps resolve CloudFront CNAME conflicts before deployment
################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Helper functions
print_header() { echo -e "\n${CYAN}═══════════════════════════════════════${NC}\n${CYAN}$1${NC}\n${CYAN}═══════════════════════════════════════${NC}"; }
print_status() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }

DOMAIN="${1:-app.ordernimbus.com}"
ENVIRONMENT="${2:-production}"

print_header "CloudFront Conflict Resolution"
echo "Domain: ${YELLOW}$DOMAIN${NC}"
echo "Environment: ${YELLOW}$ENVIRONMENT${NC}"
echo ""

# Find existing CloudFront distribution using the domain
print_status "Searching for CloudFront distributions using $DOMAIN..."

DIST_INFO=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?contains(Aliases.Items, '$DOMAIN')].[Id,Status,DomainName]" \
    --output text 2>/dev/null | head -1)

if [ -z "$DIST_INFO" ]; then
    print_success "No CloudFront distribution found using $DOMAIN"
    echo "You can proceed with deployment."
    exit 0
fi

DIST_ID=$(echo "$DIST_INFO" | cut -f1)
DIST_STATUS=$(echo "$DIST_INFO" | cut -f2)
DIST_DOMAIN=$(echo "$DIST_INFO" | cut -f3)

print_warning "Found CloudFront distribution:"
echo "  ID: ${YELLOW}$DIST_ID${NC}"
echo "  Status: ${YELLOW}$DIST_STATUS${NC}"
echo "  Domain: ${YELLOW}$DIST_DOMAIN${NC}"
echo ""

# Check if this distribution belongs to our stack
print_status "Checking if distribution belongs to OrderNimbus stack..."

STACK_NAME="ordernimbus-${ENVIRONMENT}"
if [ "$ENVIRONMENT" = "production" ]; then
    # Check both possible stack names
    for stack in "ordernimbus-production" "ordernimbus-production-production"; do
        STACK_DIST=$(aws cloudformation describe-stack-resources \
            --stack-name "$stack" \
            --query "StackResources[?ResourceType=='AWS::CloudFront::Distribution'].PhysicalResourceId" \
            --output text 2>/dev/null || echo "")
        
        if [ "$STACK_DIST" = "$DIST_ID" ]; then
            STACK_NAME="$stack"
            break
        fi
    done
fi

if [ "$STACK_DIST" = "$DIST_ID" ]; then
    print_success "Distribution belongs to stack: $STACK_NAME"
    
    echo ""
    echo "Options:"
    echo "1. Update the existing stack (recommended)"
    echo "2. Delete the stack and redeploy"
    echo "3. Remove only the CNAME from CloudFront"
    echo "4. Cancel"
    echo ""
    read -p "Choose an option (1-4): " choice
    
    case $choice in
        1)
            print_status "Stack update will be handled by deployment script"
            print_success "Run: ./deploy-fixed.sh $ENVIRONMENT"
            ;;
        2)
            print_status "Deleting stack $STACK_NAME..."
            aws cloudformation delete-stack --stack-name "$STACK_NAME"
            print_warning "Stack deletion initiated. Wait for completion before redeploying."
            echo "Check status: aws cloudformation describe-stacks --stack-name $STACK_NAME"
            ;;
        3)
            print_status "Removing CNAME from CloudFront distribution..."
            # Get current distribution config
            aws cloudfront get-distribution-config --id "$DIST_ID" > /tmp/dist-config.json
            
            # Remove the CNAME
            jq '.DistributionConfig.Aliases.Items = []' /tmp/dist-config.json > /tmp/dist-config-updated.json
            
            # Get ETag
            ETAG=$(jq -r '.ETag' /tmp/dist-config.json)
            
            # Update distribution
            aws cloudfront update-distribution \
                --id "$DIST_ID" \
                --distribution-config file:///tmp/dist-config-updated.json \
                --if-match "$ETAG" >/dev/null
            
            print_success "CNAME removed from distribution"
            print_warning "CloudFront update may take 15-20 minutes to propagate"
            ;;
        4)
            echo "Cancelled."
            exit 0
            ;;
        *)
            print_error "Invalid choice"
            ;;
    esac
else
    print_warning "Distribution does NOT belong to any OrderNimbus stack"
    echo ""
    echo "This distribution may have been created manually or by another application."
    echo ""
    echo "Options:"
    echo "1. Remove the CNAME from this distribution (safe)"
    echo "2. Disable this distribution (requires manual re-enable later)"
    echo "3. Delete this distribution (DANGEROUS - cannot be undone)"
    echo "4. Cancel and handle manually"
    echo ""
    read -p "Choose an option (1-4): " choice
    
    case $choice in
        1)
            print_status "Removing CNAME from CloudFront distribution..."
            
            # Get current distribution config
            aws cloudfront get-distribution-config --id "$DIST_ID" > /tmp/dist-config.json
            
            # Remove the specific CNAME
            jq ".DistributionConfig.Aliases.Items = [.DistributionConfig.Aliases.Items[] | select(. != \"$DOMAIN\")]" /tmp/dist-config.json > /tmp/dist-config-updated.json
            
            # Get ETag
            ETAG=$(jq -r '.ETag' /tmp/dist-config.json)
            
            # Update distribution
            aws cloudfront update-distribution \
                --id "$DIST_ID" \
                --distribution-config "$(jq '.DistributionConfig' /tmp/dist-config-updated.json)" \
                --if-match "$ETAG" >/dev/null
            
            print_success "CNAME removed from distribution"
            print_warning "CloudFront update may take 15-20 minutes to propagate"
            ;;
        2)
            print_status "Disabling CloudFront distribution..."
            
            # Get current distribution config
            aws cloudfront get-distribution-config --id "$DIST_ID" > /tmp/dist-config.json
            
            # Disable distribution
            jq '.DistributionConfig.Enabled = false' /tmp/dist-config.json > /tmp/dist-config-updated.json
            
            # Get ETag
            ETAG=$(jq -r '.ETag' /tmp/dist-config.json)
            
            # Update distribution
            aws cloudfront update-distribution \
                --id "$DIST_ID" \
                --distribution-config "$(jq '.DistributionConfig' /tmp/dist-config-updated.json)" \
                --if-match "$ETAG" >/dev/null
            
            print_success "Distribution disabled"
            print_warning "You'll need to manually re-enable it later if needed"
            ;;
        3)
            print_warning "WARNING: This will permanently delete the distribution!"
            read -p "Type 'DELETE' to confirm: " confirm
            
            if [ "$confirm" = "DELETE" ]; then
                print_status "Disabling distribution first..."
                
                # Get current distribution config
                aws cloudfront get-distribution-config --id "$DIST_ID" > /tmp/dist-config.json
                
                # Disable distribution
                jq '.DistributionConfig.Enabled = false' /tmp/dist-config.json > /tmp/dist-config-updated.json
                
                # Get ETag
                ETAG=$(jq -r '.ETag' /tmp/dist-config.json)
                
                # Update distribution
                aws cloudfront update-distribution \
                    --id "$DIST_ID" \
                    --distribution-config "$(jq '.DistributionConfig' /tmp/dist-config-updated.json)" \
                    --if-match "$ETAG" >/dev/null
                
                print_warning "Distribution disabled. It must be fully disabled before deletion."
                print_warning "Wait 15-20 minutes, then run:"
                echo "aws cloudfront delete-distribution --id $DIST_ID --if-match \$(aws cloudfront get-distribution --id $DIST_ID --query 'ETag' --output text)"
            else
                echo "Cancelled."
            fi
            ;;
        4)
            echo "Cancelled. Please handle the conflict manually."
            exit 0
            ;;
        *)
            print_error "Invalid choice"
            ;;
    esac
fi

echo ""
print_success "Done! You can now proceed with deployment."
echo "Run: ${GREEN}./deploy-fixed.sh $ENVIRONMENT${NC}"
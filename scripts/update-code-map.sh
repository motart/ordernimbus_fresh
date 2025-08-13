#!/bin/bash

################################################################################
# Update CODE_MAP.md Script
# Scans the codebase for changes and updates the code map documentation
################################################################################

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Updating CODE_MAP.md...${NC}"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CODE_MAP="$PROJECT_ROOT/CODE_MAP.md"

# Function to extract comments from files
extract_comments() {
    local file=$1
    local file_type=$2
    
    echo "### \`$file\`"
    echo ""
    
    if [ "$file_type" = "js" ] || [ "$file_type" = "ts" ]; then
        # Extract JSDoc comments
        grep -A 5 "^/\*\*" "$file" 2>/dev/null | head -20 || echo "No JSDoc comments found"
    elif [ "$file_type" = "yaml" ]; then
        # Extract YAML comments
        grep "^#" "$file" 2>/dev/null | head -10 || echo "No comments found"
    fi
    echo ""
}

# Update timestamp in CODE_MAP
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s/<!-- Last Updated: .* -->/<!-- Last Updated: $(date +%Y-%m-%d) -->/" "$CODE_MAP"
else
    # Linux
    sed -i "s/<!-- Last Updated: .* -->/<!-- Last Updated: $(date +%Y-%m-%d) -->/" "$CODE_MAP"
fi

# Append new discoveries section
cat >> "$CODE_MAP" << 'EOF'

## 📊 Recent Code Analysis
<!-- Auto-generated section - Do not edit manually -->
### Last Scan: 
EOF

echo "$(date)" >> "$CODE_MAP"

# Scan for new Lambda functions
echo -e "\n${YELLOW}Scanning Lambda functions...${NC}"
echo -e "\n### Lambda Functions Found:" >> "$CODE_MAP"
for file in "$PROJECT_ROOT"/lambda/*.js; do
    if [ -f "$file" ]; then
        basename "$file" >> "$CODE_MAP"
        # Extract first JSDoc comment
        grep -A 3 "^/\*\*" "$file" 2>/dev/null | head -5 >> "$CODE_MAP" || echo "  No documentation" >> "$CODE_MAP"
        echo "" >> "$CODE_MAP"
    fi
done

# Scan for React components
echo -e "${YELLOW}Scanning React components...${NC}"
echo -e "\n### React Components Found:" >> "$CODE_MAP"
for file in "$PROJECT_ROOT"/app/frontend/src/components/*.tsx; do
    if [ -f "$file" ]; then
        basename "$file" >> "$CODE_MAP"
        # Look for interface definitions
        grep "^interface.*Props" "$file" 2>/dev/null | head -2 >> "$CODE_MAP" || echo "  No props interface" >> "$CODE_MAP"
        echo "" >> "$CODE_MAP"
    fi
done

# Count lines of code
echo -e "${YELLOW}Calculating code statistics...${NC}"
echo -e "\n### Code Statistics:" >> "$CODE_MAP"
echo "- JavaScript/TypeScript files: $(find "$PROJECT_ROOT" -name "*.js" -o -name "*.ts" -o -name "*.tsx" 2>/dev/null | wc -l)" >> "$CODE_MAP"
echo "- Lambda functions: $(ls -1 "$PROJECT_ROOT"/lambda/*.js 2>/dev/null | wc -l)" >> "$CODE_MAP"
echo "- React components: $(ls -1 "$PROJECT_ROOT"/app/frontend/src/components/*.tsx 2>/dev/null | wc -l)" >> "$CODE_MAP"
echo "- CloudFormation templates: $(ls -1 "$PROJECT_ROOT"/*.yaml "$PROJECT_ROOT"/infrastructure/cloudformation/*.yaml 2>/dev/null | wc -l)" >> "$CODE_MAP"

# Find TODOs and FIXMEs
echo -e "${YELLOW}Scanning for TODOs...${NC}"
echo -e "\n### TODOs and FIXMEs:" >> "$CODE_MAP"
grep -r "TODO\|FIXME" "$PROJECT_ROOT" --include="*.js" --include="*.ts" --include="*.tsx" 2>/dev/null | head -10 >> "$CODE_MAP" || echo "None found" >> "$CODE_MAP"

echo -e "\n${GREEN}✓ CODE_MAP.md updated successfully${NC}"
echo -e "${BLUE}Location: $CODE_MAP${NC}"

# Offer to show diff
echo -e "\n${YELLOW}View changes? (y/n)${NC}"
read -r response
if [[ "$response" == "y" ]]; then
    git diff "$CODE_MAP" | head -50
fi
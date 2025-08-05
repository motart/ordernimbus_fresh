# Folder Structure Cleanup Summary

## What Was Organized

### 1. Archived Files (`archive/`)
- **Logs** (`archive/logs/`):
  - All `.log` files from root directory
  - Deployment logs (`deployment-*.log`)
  - Server logs (api-server.log, frontend.log, react.log, etc.)
  - Lambda API server log

- **Old Components** (`archive/old-components/`):
  - ProfilePage-old.tsx and ProfilePage-old.css

- **Deprecated Scripts** (`archive/`):
  - destroy-old.sh
  - password-reset-v2.js
  - Lambda zip files

- **Sample Data** (`archive/sample-data/`):
  - All sample CSV files (customers, inventory, orders, products)
  - Contents of former sample-data directory

- **Test Files** (`archive/test-files/`):
  - local-api-server.js

### 2. Tests Directory (`tests/`)
- **Unit Tests** (`tests/unit/`):
  - test-inventory-simple.js
  - test-inventory-upload.js

- **Load Tests** (`tests/load/`):
  - k6 load test suites

- **Fixtures** (`tests/fixtures/`):
  - test-orders.csv

### 3. Infrastructure Directory (`infrastructure/`)
- **CloudFormation** (`infrastructure/cloudformation/`):
  - cloudformation-template.yaml

- **CDK** (`infrastructure/cdk/`):
  - All CDK-related files (cdk.json, cdk.context.json, etc.)

- **SAM** (`infrastructure/sam/`):
  - Copies of template.yaml and samconfig.toml

### 4. Scripts Directory (`scripts/`)
- **Deployment** (`scripts/deployment/`):
  - deploy.sh, deploy-enhanced.sh, deploy-with-rollback.sh, deploy-cf.sh

- **Infrastructure** (`scripts/infrastructure/`):
  - destroy.sh, destroy-complete.sh
  - setup-aws.sh, teardown-aws.sh
  - fix-s3-region-issue.sh

- **Utilities** (`scripts/utilities/`):
  - validate-deployment.sh
  - rollback-verify.sh

### 5. Cleaned Up
- Removed empty directories (ChatbotHandlerFunction, DataIngestionFunction, etc.)
- Removed empty load-tests directory after moving contents
- Removed empty sample-data directory after archiving

## Updated References
- Updated paths in CLAUDE.md
- Updated npm scripts in package.json
- Created FOLDER_STRUCTURE.md documentation

## Benefits
- Clearer organization of files by purpose
- Archived deprecated/old files for reference
- Separated test files from production code
- Grouped scripts by functionality
- Easier navigation and maintenance
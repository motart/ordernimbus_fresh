# OrderNimbus Folder Structure

## Root Directory
```
ordernimbus/
├── app/                        # Application code
│   ├── frontend/              # React frontend application
│   └── backend/               # Backend services
├── lambda/                    # Lambda functions
├── lib/                       # CDK stack definitions
├── scripts/                   # Utility scripts
│   ├── deployment/           # Deployment scripts
│   ├── infrastructure/       # Infrastructure management
│   └── utilities/           # Utility scripts
├── infrastructure/           # Infrastructure configurations
│   ├── cloudformation/      # CloudFormation templates
│   ├── cdk/                # CDK configurations
│   └── sam/                # SAM templates
├── tests/                    # Test files
│   ├── unit/               # Unit tests
│   ├── integration/        # Integration tests
│   ├── load/              # Load tests
│   └── fixtures/          # Test data fixtures
├── docs/                    # Documentation
├── archive/                 # Archived files
│   ├── logs/              # Old log files
│   ├── old-components/    # Deprecated components
│   ├── test-files/        # Old test files
│   └── sample-data/       # Sample data files
├── bin/                     # CDK entry points
├── logs/                    # Log collection directory
└── node_modules/           # Dependencies
```

## Key Files
- `README.md` - Main project documentation
- `CLAUDE.md` - Claude Code instructions
- `template.yaml` - Main SAM template
- `samconfig.toml` - SAM configuration
- `package.json` - Node.js dependencies
- `tsconfig.json` - TypeScript configuration
- `env.json` - Environment variables for local development
- `.gitignore` - Git ignore rules

## Application Structure

### Frontend (`app/frontend/`)
- `src/` - Source code
  - `components/` - React components
  - `services/` - API services
  - `config/` - Configuration files
- `public/` - Static assets
- `build/` - Production build output

### Lambda Functions (`lambda/`)
- Each `.js` file represents a Lambda function
- Shared `package.json` for all functions
- Function-specific logic in individual files

### Infrastructure (`infrastructure/`)
- Separated by deployment method (CloudFormation, CDK, SAM)
- Contains templates and configuration files

### Scripts (`scripts/`)
- Organized by purpose
- Executable shell scripts for various operations

## Archived Files
Files moved to `archive/` include:
- Old log files
- Deprecated components
- Test files and sample data
- Previous versions of scripts
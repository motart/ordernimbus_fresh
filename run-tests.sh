#!/bin/bash
# Test runner for OrderNimbus
# Usage: ./run-tests.sh [unit|e2e|all|uc001]

set -e

TEST_TYPE=${1:-all}
export TEST_TYPE

echo "🧪 Running OrderNimbus tests: $TEST_TYPE"

case $TEST_TYPE in
  unit)
    echo "Running unit tests..."
    npm run test:unit
    ;;
  e2e)
    echo "Running E2E tests..."
    export TEST_TYPE=e2e
    npm run test:e2e
    ;;
  uc001)
    echo "Running UC001 tests..."
    npm run test:uc001
    ;;
  all)
    echo "Running all tests..."
    npm run test:all
    ;;
  *)
    echo "Unknown test type: $TEST_TYPE"
    echo "Usage: ./run-tests.sh [unit|e2e|all|uc001]"
    exit 1
    ;;
esac

echo "✅ Tests completed successfully!"

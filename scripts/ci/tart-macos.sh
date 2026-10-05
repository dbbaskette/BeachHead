#!/bin/bash
set -euo pipefail
project_dir=$(cd "$(dirname "$0")/../.." && pwd -P)
export TART_NO_AUTO_PRUNE=1
exec bash /Users/dbbaskette/Projects/macos-test-suite/scripts/tart-test-vm.sh --project "$project_dir" --name beach-head --guest scripts/ci/guest-test.sh --base tanzu-brand-golden-gate-base --auto "$@"

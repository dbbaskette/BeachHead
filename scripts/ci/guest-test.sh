#!/bin/bash
set -euo pipefail
export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
source_dir='/Volumes/My Shared Files/source'
results_dir='/Volumes/My Shared Files/results'
job_dir=$(mktemp -d /tmp/beach-head-ci.XXXXXX)
exec > >(tee "$results_dir/checks.log") 2>&1
printf 'FAIL\n' > "$results_dir/result.txt"
sw_vers
node --version
npm --version
node -e 'const [major,minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 13)) process.exit(1)'
git -C "$source_dir" rev-parse HEAD || true
git -C "$source_dir" status --short || true
(cd "$source_dir" && tar --exclude=.git --exclude=node_modules --exclude=dist --exclude=.vite --exclude=work --exclude=.wrangler -cf - .) | (cd "$job_dir" && tar -xf -)
cd "$job_dir"
npm ci
npm test
npm run typecheck
npm exec oxlint -- app lib/campaign.ts lib/campaign.test.ts lib/naval lib/pillbox lib/air lib/bunker lib/flak lib/tank
NEXT_PUBLIC_BASE_PATH=/BeachHead npm run build
printf 'PASS\n' > "$results_dir/result.txt"

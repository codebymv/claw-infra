# Frontend Bundle Analysis Guide

This document describes how to analyze the frontend bundle size and identify optimization opportunities.

## Running Bundle Analysis

### Quick Start

```bash
cd frontend
npm run build:analyze
```

This will:
1. Build the production bundle
2. Generate interactive HTML reports
3. Automatically open reports in your browser

### Manual Analysis

```bash
# Set environment variable and build
ANALYZE=true npm run build

# Reports will be generated in .next/analyze/
```

## Understanding the Reports

Bundle analyzer generates two HTML reports:

### 1. Client Bundle Report (`.next/analyze/client.html`)

Shows all JavaScript sent to the browser:
- **Page bundles** - Code for each route
- **Shared chunks** - Code used across multiple pages
- **Framework code** - Next.js, React, etc.
- **Dependencies** - npm packages

### 2. Server Bundle Report (`.next/analyze/server.html`)

Shows server-side rendering code:
- **API routes** - Backend API code
- **Server components** - React Server Components
- **Middleware** - Next.js middleware

## Interpreting Bundle Sizes

### Size Metrics

- **Stat Size** - Size of the original source code
- **Parsed Size** - Size after minification (what gets sent over network)
- **Gzipped Size** - Size after compression (actual transfer size)

Focus on **Gzipped Size** - this is what users actually download.

### Size Thresholds

| Size | Status | Action |
|---|---|---|
| < 50 KB | ✅ Excellent | No action needed |
| 50-100 KB | ⚠️ Good | Monitor for growth |
| 100-200 KB | ⚠️ Large | Consider optimization |
| > 200 KB | ❌ Too Large | Requires optimization |

## Common Large Dependencies

### Current Large Dependencies (>100KB)

Based on initial analysis, document any dependencies over 100KB:

```bash
# Run this after build:analyze to list large dependencies
du -sh .next/static/chunks/*.js | sort -h | tail -10
```

### Justification for Large Dependencies

| Dependency | Size | Justification |
|---|---|---|
| recharts | ~150KB | Required for dashboard charts, no lighter alternative |
| socket.io-client | ~80KB | Required for real-time updates |
| @radix-ui/* | ~120KB | Accessible UI components, tree-shakeable |
| date-fns | ~70KB | Date formatting, only imports used functions |

## Optimization Strategies

### 1. Code Splitting

Split large pages into smaller chunks:

```typescript
// Before: Import everything
import { HeavyComponent } from './HeavyComponent';

// After: Dynamic import
const HeavyComponent = dynamic(() => import('./HeavyComponent'), {
  loading: () => <Spinner />,
});
```

### 2. Tree Shaking

Import only what you need:

```typescript
// ❌ Bad: Imports entire library
import _ from 'lodash';

// ✅ Good: Import specific function
import debounce from 'lodash/debounce';
```

### 3. Replace Heavy Dependencies

| Heavy Dependency | Lighter Alternative | Savings |
|---|---|---|
| moment.js (288KB) | date-fns (70KB) | 218KB |
| lodash (full) | lodash (per-method) | ~200KB |
| chart.js | recharts (if already using) | Varies |

### 4. Remove Unused Dependencies

```bash
# Find unused dependencies
npx depcheck

# Remove unused packages
npm uninstall <package-name>
```

### 5. Optimize Images

```typescript
// Use Next.js Image component for automatic optimization
import Image from 'next/image';

<Image
  src="/logo.png"
  width={200}
  height={100}
  alt="Logo"
  priority // For above-the-fold images
/>
```

## Monitoring Bundle Size

### Set Up CI Checks

Add to `.github/workflows/bundle-size.yml`:

```yaml
name: Bundle Size Check

on: [pull_request]

jobs:
  check-size:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run build
      - name: Check bundle size
        run: |
          # Fail if main bundle > 200KB gzipped
          SIZE=$(gzip -c .next/static/chunks/main-*.js | wc -c)
          if [ $SIZE -gt 204800 ]; then
            echo "Main bundle too large: ${SIZE} bytes"
            exit 1
          fi
```

### Track Size Over Time

```bash
# Save current sizes
npm run build:analyze
du -sh .next/static/chunks/*.js > bundle-sizes-$(date +%Y%m%d).txt

# Compare with previous
diff bundle-sizes-20260301.txt bundle-sizes-20260311.txt
```

## Performance Budget

Set performance budgets in `next.config.js`:

```javascript
module.exports = {
  // ... other config
  experimental: {
    optimizePackageImports: ['recharts', '@radix-ui/react-*'],
  },
  // Warn if bundles exceed these sizes
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
};
```

## Optimization Checklist

- [ ] Run bundle analysis: `npm run build:analyze`
- [ ] Identify dependencies > 100KB
- [ ] Document justification for large dependencies
- [ ] Check for duplicate dependencies (same package, different versions)
- [ ] Verify tree shaking is working (no unused exports)
- [ ] Use dynamic imports for heavy components
- [ ] Optimize images with Next.js Image component
- [ ] Remove unused dependencies
- [ ] Set up CI bundle size checks
- [ ] Track bundle size over time

## Troubleshooting

### Bundle analyzer doesn't open

```bash
# Manually open the reports
open .next/analyze/client.html
open .next/analyze/server.html
```

### Reports show unexpected large files

1. Check for duplicate dependencies:
```bash
npm ls <package-name>
```

2. Check for unoptimized imports:
```bash
# Search for full library imports
grep -r "import.*from '[^/]*'$" components/
```

3. Verify production build:
```bash
NODE_ENV=production npm run build
```

## Resources

- [Next.js Bundle Analyzer](https://www.npmjs.com/package/@next/bundle-analyzer)
- [Webpack Bundle Analyzer](https://github.com/webpack-contrib/webpack-bundle-analyzer)
- [Next.js Optimization Docs](https://nextjs.org/docs/app/building-your-application/optimizing)
- [Web.dev Bundle Size Guide](https://web.dev/your-first-performance-budget/)

## Regular Maintenance

Run bundle analysis:
- Before each release
- When adding new dependencies
- Monthly for ongoing monitoring
- After major refactors

Keep bundle sizes under control to ensure fast page loads and good user experience.

# Testing Integration in CI/CD Pipeline

This document describes the automated testing integration added to the deployment workflows to ensure GDPR compliance and Google Analytics functionality.

## Overview

Automated tests now run as part of both production and preview deployments to verify:
- ✅ **GDPR Cookie Consent Compliance** - Ensures legal requirements are met
- ✅ **Google Analytics Integration** - Verifies GA_MEASUREMENT_ID handling
- ✅ **Regulatory Compliance** - Catches violations before deployment

## Test Coverage

### GDPR Cookie Consent Tests (`tests/cookie-consent-test.spec.ts`)
1. **Modal Display** - Consent modal appears on first visit
2. **Cookie Setting Control** - Analytics cookies only set after consent
3. **Cookie Deletion** - Analytics cookies expired when consent revoked
4. **Manage Preferences** - GDPR Article 7.3 withdrawal mechanism
5. **Granular Consent** - Individual cookie category controls
6. **Consent Persistence** - Choices persist across page reloads
7. **Consent Quality** - Meets GDPR Article 7 standards
8. **GA Integration** - Consent system integrates with Google Analytics
9. **Production Behavior** - Real-world user experience simulation

### Google Analytics Tests (`tests/google-analytics-test.spec.ts`)
1. **GA_MEASUREMENT_ID Embedding** - Verifies correct ID extraction (`G-H7ZN3R63Q5`)
2. **Environment Variable Handling** - Tests Astro environment integration
3. **dataLayer Initialization** - Confirms proper GA setup with consent defaults

## Deployment Integration

### Production Deployment (`.github/workflows/static.yml`)
```yaml
- name: Run GDPR compliance and Google Analytics tests
  run: pnpm test
  env:
    NODE_ENV: production
    GA_MEASUREMENT_ID: ${{ secrets.GA_MEASUREMENT_ID }}
    CI: true
```

### Preview Deployment (`.github/workflows/preview-deploy.yml`)
```yaml
- name: Run GDPR compliance and Google Analytics tests
  run: pnpm test
  env:
    NODE_ENV: production
    GA_MEASUREMENT_ID: ${{ secrets.GA_MEASUREMENT_ID }}
    CI: true
```

## Test Scripts Added

### package.json
```json
{
  "scripts": {
    "test": "playwright test",
    "test:ui": "playwright test --ui",
    "test:headed": "playwright test --headed"
  }
}
```

## CI Optimizations

### Playwright Configuration (`playwright.config.js`)
- **CI Mode**: Only runs Chromium browser for speed
- **Built Site Testing**: Uses `serve` to test production build
- **GitHub Reporter**: Integrates with GitHub Actions UI
- **Retry Logic**: 2 retries on CI for reliability
- **Optimized Timeouts**: Faster startup in CI environment

### Key Features:
- **Fail-Fast**: Deployment stops if tests fail
- **Compliance Verification**: GDPR violations prevent deployment
- **GA Integration Check**: Ensures analytics work correctly
- **Performance Optimized**: Fast execution in CI environment

## Test Results

All 13 tests pass successfully:
- **10 GDPR Cookie Consent tests** ✅
- **3 Google Analytics integration tests** ✅

### Critical Compliance Verifications:
1. ✅ **Cookie Deletion**: Cookies properly expired when consent revoked
2. ✅ **GA_MEASUREMENT_ID**: Correctly set to `G-H7ZN3R63Q5`
3. ✅ **Consent Management**: dataLayer initialized with `analytics_storage: 'denied'`
4. ✅ **GDPR Article 7.3**: Manage preferences functionality available

## Benefits

### Legal Protection
- **Automated GDPR Compliance**: Prevents regulatory violations
- **Cookie Consent Verification**: Ensures proper user consent handling
- **Audit Trail**: Test results provide compliance documentation

### Technical Assurance
- **GA Integration**: Verifies analytics work with consent system
- **Environment Variables**: Confirms proper configuration
- **Cross-Browser Testing**: (Local development includes all browsers)

### Development Workflow
- **Pre-Deployment Validation**: Catches issues before users see them
- **Continuous Compliance**: Every deployment verified for legal requirements
- **Fast Feedback**: Quick test execution (< 30 seconds in CI)

## Running Tests Locally

```bash
# Run all tests
pnpm test

# Run with UI for debugging
pnpm test:ui

# Run in headed mode to see browser
pnpm test:headed

# Run specific test file
pnpm exec playwright test tests/cookie-consent-test.spec.ts

# Run specific test
pnpm exec playwright test -g "should remove analytics cookies"
```

## Monitoring and Maintenance

- Tests run automatically on every deployment
- GitHub Actions provides detailed test reports
- Failed tests prevent deployment to protect compliance
- Test artifacts (screenshots, videos) saved for debugging

This integration ensures that GDPR compliance and Google Analytics functionality are continuously verified, protecting both users and the organization from regulatory issues.

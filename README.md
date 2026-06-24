# Cyoda Cloud Documentation

[![Deploy to GitHub Pages](https://github.com/Cyoda/cyoda-docs/actions/workflows/static.yml/badge.svg)](https://github.com/Cyoda/cyoda-docs/actions/workflows/static.yml)
[![License: CC BY 4.0](https://img.shields.io/badge/License-CC%20BY%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by/4.0/)

> **Central hub for Cyoda developer resources, API documentation, and onboarding materials**

This repository serves as the central documentation hub for developers and AI assistants working with the Cyoda platform. It provides OpenAPI specifications, developer guides, architecture documentation, and onboarding resources in a centralized, accessible format.

## Table of Contents

- [About](#about)
- [Live Documentation](#live-documentation)
- [Project Structure](#project-structure)
- [Available Resources](#available-resources)
- [Development](#development)

## About

Cyoda is a hybrid transactional/analytical data processing platform designed for high-volume data ingestion with concurrent processing capabilities. This repository contains:

- **OpenAPI Specifications**: Complete API documentation for Cyoda services
- **Developer Guides**: Onboarding materials and best practices
- **Architecture Documentation**: System design and deployment information
- **Authentication Guides**: Security and access control documentation
- **Living Documentation**: Continuously updated markdown resources

The project is built as a static site using [Stoplight Elements](https://stoplight.io/open-source/elements) for interactive API documentation and serves as a living resource that evolves with the platform.

## Live Documentation

The documentation is automatically deployed to GitHub Pages and available at:
**[https://docs.cyoda.net/](https://docs.cyoda.net/)**

## Project Structure

```
├── dist/                          # Built documentation site
│   ├── openapi/                   # OpenAPI specifications
│   │   └── openapi.json           # Main Cyoda API specification
│   ├── resources/                 # Markdown documentation organized in sub-folders
│   │   ├── sub-folder/           
│   │   │   ├── some-doc.md
│   │   │   └── some-other-doc.md
│   │   ├── another-folder/          
│   │   │   └── something-else.md
│   │   └── ...
│   ├── css/                       # Styling and themes
│   ├── js/                        # Stoplight Elements JavaScript
│   ├── images/                    # Assets and icons
│   └── index.html                 # Main documentation page
├── .github/workflows/             # GitHub Actions for deployment
├── README.md                      # This file
└── ...                            # other stuff
```

## Available Resources

### API Documentation
- **[OpenAPI Specification](dist/openapi/openapi.json)**: Complete REST API documentation
- **Interactive API Explorer**: Available in the live documentation site

### Developer Guides
- **[Authentication & Authorization](dist/resources/guides/authentication-authorization.md)**: OAuth 2.0 implementation and security
- **[JWT Signing Keys](dist/resources/guides/iam-jwt-keys-and-oidc.md)**: Managing JWT signing keys for technical users and custom installations
- **[OIDC Providers & JWT Claims](dist/resources/guides/iam-oidc-and-jwt-claims.md)**: Configuring external identity providers and required claims
- **[Cyoda Platform Library](dist/resources/guides/cpl-overview.md)**: Cyoda Platform Library architecture and capabilities
- **[Entity Database](dist/resources/guides/cyoda-entity-database.md)**: Entity modeling and database concepts


### Architecture Documentation
- **[Cloud Architecture](dist/resources/architecture/cyoda-cloud-architecture.md)**: Physical infrastructure and deployment topology

### Cloud Information
- **[Cloud Status](dist/resources/cloud/status.md)**: Current service status and known issues
- **[Service Details](dist/resources/cloud/service-details.md)**: Service information and limitations
- **[Subscription Tiers](dist/resources/cloud/entitlements.md)**: Available subscription tiers and entitlements


## Development

### Local Development
```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

### Legacy Development (http-server)
```bash
# Serve the built site
pnpm dlx http-server dist
```

## Deployment Configuration

### Google Analytics Setup

The site includes EU/UK GDPR-compliant cookie consent and Google Analytics integration. To enable analytics:

1. **Set up GitHub Secret:**
   - Go to your repository Settings → Secrets and variables → Actions
   - Add a new repository secret named `GA_MEASUREMENT_ID`
   - Set the value to your Google Analytics 4 measurement ID (e.g., `G-XXXXXXXXXX`)

2. **Local Development:**
   - Copy `.env.example` to `.env`
   - Set your `GA_MEASUREMENT_ID` in the `.env` file
   - Analytics will only be loaded if the environment variable is set

3. **Cookie Consent:**
   - The site includes a cookie consent banner compliant with EU/UK law
   - Analytics cookies are only set after user consent
   - Users can manage their preferences at any time

### Deployment Workflows

- **Production:** Automatic deployment to GitHub Pages on push to `main` branch
- **Preview:** Manual deployment to Surge.sh for testing branches
- Both workflows automatically include the `GA_MEASUREMENT_ID` secret during build


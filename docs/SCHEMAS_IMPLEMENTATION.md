# JSON Schema Documentation Implementation

This document describes the implementation of interactive JSON schema documentation for the Cyoda platform.

## Overview

The implementation provides:

1. **Interactive Schema Viewer**: Beautiful, interactive visualization of JSON schemas using Stoplight's JSON Schema Viewer
2. **Organized Documentation**: Schemas organized by category (common, entity, model, processing, search)
3. **Downloadable Package**: All schemas available as a ZIP file for offline use
4. **Automated Generation**: Build scripts that automatically generate documentation pages

## Components

### 1. React Component (`src/components/JsonSchemaViewer.tsx`)

A React wrapper component for Stoplight's JSON Schema Viewer that integrates with Astro:

```tsx
<JsonSchemaViewer 
  schema={schemaObject} 
  name="SchemaName"
  client:load
/>
```

### 2. Documentation Pages

**All schema documentation pages are auto-generated** during the build process and excluded from git via `.gitignore`.

#### Main Index
- `src/content/docs/schemas/index.mdx` - Landing page with CardGrid of categories and download link

#### Category and Subcategory Indexes (8 total)
- `src/content/docs/schemas/common/index.mdx`
- `src/content/docs/schemas/common/statemachine/index.mdx`
- `src/content/docs/schemas/common/statemachine/conf/index.mdx`
- `src/content/docs/schemas/common/condition/index.mdx`
- `src/content/docs/schemas/entity/index.mdx`
- `src/content/docs/schemas/model/index.mdx`
- `src/content/docs/schemas/processing/index.mdx`
- `src/content/docs/schemas/search/index.mdx`

#### Individual Schema Pages (68 total)
Preserving directory structure:
- `src/content/docs/schemas/common/model-spec.mdx`
- `src/content/docs/schemas/common/statemachine/workflow-info.mdx`
- `src/content/docs/schemas/common/statemachine/conf/workflow-configuration.mdx`
- `src/content/docs/schemas/common/condition/query-condition.mdx`
- `src/content/docs/schemas/entity/entity-create-request.mdx`
- ...and 63 more

**Total**: 77 auto-generated MDX files (1 main + 8 indexes + 68 schemas)

### 3. Build Scripts

#### `scripts/generate-schema-pages.js`
Automatically generates MDX documentation pages for all JSON schemas:
- Scans `src/schemas/` directory recursively
- **Preserves directory structure** (e.g., `common/statemachine/` → `/schemas/common/statemachine/`)
- Creates individual pages with JsonSchemaViewer component
- Calculates correct relative import paths based on nesting depth
- Escapes YAML frontmatter for descriptions with special characters
- Extracts metadata from schema files
- Generates property lists and descriptions

#### `scripts/package-schemas.js`
Creates a downloadable ZIP archive of all schemas:
- Packages all JSON files from `src/schemas/`
- Preserves directory structure
- Includes a README with usage information
- Outputs to `dist/schemas.zip`

## Build Process

The build process has been updated to include schema documentation:

```json
{
  "scripts": {
    "build": "pnpm generate:schema-pages && astro build && pnpm export:markdown && pnpm generate:llms && pnpm package:schemas"
  }
}
```

### Build Steps:
1. **generate:schema-pages** - Generate MDX pages for all schemas
2. **astro build** - Build the Astro site
3. **export:markdown** - Export markdown versions
4. **generate:llms** - Generate LLM context files
5. **package:schemas** - Create schemas.zip

## Dependencies Added

```json
{
  "@astrojs/react": "^4.x",
  "react": "^19.2.0",
  "react-dom": "^19.2.0",
  "archiver": "^7.x"
}
```

**Note**: We initially tried using `@stoplight/json-schema-viewer` but encountered CommonJS/ESM compatibility issues in production builds. We implemented a custom React-based schema viewer instead, which provides better compatibility, works with React 19, and gives us full control over the rendering.

## Configuration Changes

### `astro.config.mjs`
- Added React integration
- Added "JSON Schemas" section to sidebar navigation

### `src/styles/custom.css`
- Added styling for `.json-schema-viewer-wrapper`
- Integrated with Cyoda's aqua color scheme
- Ensured compatibility with Starlight's theme

## Usage

### For Developers

1. **View schemas online**: Navigate to `/schemas/` on the documentation site
2. **Download schemas**: Click the download link on the schemas index page
3. **Explore interactively**: Use the expandable schema viewer on each page

### For Documentation Maintainers

1. **Add new schemas**: Place JSON files in `src/schemas/` directory
2. **Regenerate pages**: Run `pnpm generate:schema-pages`
3. **Build site**: Run `pnpm build`

### Manual Page Creation

If you need to customize a schema page, you can manually create or edit the MDX file:

```mdx
---
title: MySchema
description: Description of my schema
---

import JsonSchemaViewer from '../../../../components/JsonSchemaViewer.tsx';
import schema from '../../../../schemas/category/MySchema.json';

# MySchema

Custom description here.

## Schema Viewer

<JsonSchemaViewer 
  schema={schema} 
  name="MySchema"
  client:load
/>

## Additional Information

Add any custom content here.
```

## File Structure

```
cyoda-docs/
├── src/
│   ├── components/
│   │   └── JsonSchemaViewer.tsx          # React component wrapper
│   ├── content/
│   │   └── docs/
│   │       └── schemas/
│   │           ├── index.mdx              # Main schemas page
│   │           ├── common/
│   │           │   ├── index.mdx          # Category index
│   │           │   ├── base-event.mdx     # Individual schema
│   │           │   └── ...
│   │           ├── entity/
│   │           ├── model/
│   │           ├── processing/
│   │           └── search/
│   ├── schemas/                           # Source JSON schemas
│   │   ├── common/
│   │   ├── entity/
│   │   ├── model/
│   │   ├── processing/
│   │   └── search/
│   └── styles/
│       └── custom.css                     # Schema viewer styling
├── scripts/
│   ├── generate-schema-pages.js           # Page generation script
│   └── package-schemas.js                 # ZIP packaging script
└── dist/
    └── schemas.zip                        # Generated ZIP (after build)
```

## Features

### Interactive Schema Viewer
- Expandable/collapsible sections
- Property type information
- Required field indicators
- Description rendering
- Reference resolution
- Validation rule display

### Schema Organization
- Categorized by function (common, entity, model, processing, search)
- Hierarchical navigation
- Cross-references between related schemas
- Search integration via Starlight

### Download Package
- All schemas in one ZIP file
- Preserves directory structure
- Includes README with usage instructions
- Suitable for offline use, validation, code generation

## Future Enhancements

Potential improvements:
1. Add schema examples to each page
2. Generate TypeScript types from schemas
3. Add validation examples
4. Include schema change history
5. Add interactive schema editor
6. Generate API client code snippets
7. Add schema comparison tool
8. Include schema dependency graph

## Troubleshooting

### Schemas not appearing
- Run `pnpm generate:schema-pages` to regenerate pages
- Check that JSON files are valid
- Verify file paths in generated MDX files

### Viewer not rendering
- Ensure React integration is enabled in `astro.config.mjs`
- Check browser console for errors
- Verify `client:load` directive is present

### ZIP file not generated
- Run `pnpm package:schemas` manually
- Check `dist/` directory permissions
- Verify archiver dependency is installed

## Support

For issues or questions:
1. Check the generated pages in `src/content/docs/schemas/`
2. Review build logs for errors
3. Verify all dependencies are installed
4. Check that JSON schemas are valid JSON Schema Draft 2020-12


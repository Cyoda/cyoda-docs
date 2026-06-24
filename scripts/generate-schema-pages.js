import { glob } from 'glob';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generate MDX documentation pages for all JSON schemas
 * This creates individual pages with the JsonSchemaViewer component
 */
async function generateSchemaPages() {
  console.log('📄 Generating schema documentation pages...');

  const projectRoot = path.resolve(__dirname, '..');
  const schemasDir = path.join(projectRoot, 'src', 'schemas');
  const docsDir = path.join(projectRoot, 'src', 'content', 'docs', 'reference', 'schemas');

  // Find all JSON schema files
  const schemaFiles = await glob('**/*.json', {
    cwd: schemasDir,
    absolute: false,
  });

  console.log(`Found ${schemaFiles.length} schema files`);

  let generatedCount = 0;

  for (const schemaFile of schemaFiles) {
    const schemaPath = path.join(schemasDir, schemaFile);
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

    // Extract schema metadata
    const schemaName = schema.title || path.basename(schemaFile, '.json');
    let schemaDescription = schema.description || `Schema definition for ${schemaName}`;

    // Escape description for YAML frontmatter - wrap in quotes if it contains special chars
    if (schemaDescription.includes(':') || schemaDescription.includes('"') || schemaDescription.includes("'")) {
      // Escape double quotes and wrap in double quotes
      schemaDescription = `"${schemaDescription.replace(/"/g, '\\"')}"`;
    }

    // Determine the category and create the output path
    const parts = schemaFile.split(path.sep);
    const category = parts[0]; // Top-level category: 'common', 'entity', etc.
    const fileName = path.basename(schemaFile, '.json');

    // Convert PascalCase to kebab-case for URL
    const urlName = fileName
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .toLowerCase();

    // Preserve directory structure
    // e.g., common/statemachine/WorkflowInfo.json -> schemas/common/statemachine/workflow-info.mdx
    const relativePath = path.dirname(schemaFile); // e.g., 'common/statemachine'
    const outputDir = path.join(docsDir, relativePath);

    // Create directory structure if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Calculate relative path to schema file from the MDX file
    const mdxPath = path.join(outputDir, `${urlName}.mdx`);

    // Calculate the number of directory levels to go up
    // MDX is in src/content/docs/reference/schemas/[relativePath]/file.mdx
    // Need to go up to src/ then into schemas/
    const depth = relativePath.split(path.sep).length; // e.g., 'common/statemachine' = 2
    const upLevels = '../'.repeat(depth + 3); // +3 for 'docs', 'reference', 'schemas'

    // Build the import paths
    const componentImport = `${upLevels}../components/JsonSchemaViewer.tsx`;
    const schemaImport = `${upLevels}../schemas/${schemaFile.replace(/\\/g, '/')}`;

    // Generate MDX content
    const mdxContent = `---
title: ${schemaName}
description: ${schemaDescription}
---

import JsonSchemaViewer from '${componentImport}';
import schema from '${schemaImport}';

# ${schemaName}

${schemaDescription}

## Schema Viewer

<JsonSchemaViewer
  schema={schema}
  name="${schemaName}"
  category="${category}"
  client:load
/>

## Description

${schema.description || 'This schema defines the structure and validation rules for ' + schemaName + '.'}

${generatePropertiesSection(schema)}

${generateRelatedSchemasSection(category, schemaName)}
`;

    // Write the MDX file
    fs.writeFileSync(mdxPath, mdxContent, 'utf-8');
    generatedCount++;
  }

  console.log(`✅ Generated ${generatedCount} schema documentation pages`);

  // Generate index pages for each category and subcategory
  await generateIndexPages(schemasDir, docsDir, schemaFiles);

  // Generate main schemas index page
  await generateMainIndex(docsDir, schemaFiles);
}

/**
 * Generate index.mdx files for categories and subcategories
 */
async function generateIndexPages(schemasDir, docsDir, schemaFiles) {
  // Group schemas by directory
  const dirMap = new Map();

  for (const schemaFile of schemaFiles) {
    const dir = path.dirname(schemaFile);
    if (!dirMap.has(dir)) {
      dirMap.set(dir, []);
    }
    dirMap.get(dir).push(schemaFile);
  }

  // Generate index for each directory
  for (const [dir, files] of dirMap.entries()) {
    const outputDir = path.join(docsDir, dir);
    const indexPath = path.join(outputDir, 'index.mdx');

    // Get category name
    const parts = dir.split(path.sep);
    const categoryName = parts[parts.length - 1];
    const displayName = categoryName.charAt(0).toUpperCase() + categoryName.slice(1);

    // Build list of schemas in this directory
    const schemaLinks = files.map(file => {
      const fileName = path.basename(file, '.json');
      const urlName = fileName
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .toLowerCase();

      // Read schema to get title
      const schemaPath = path.join(schemasDir, file);
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
      const title = schema.title || fileName;

      return `- [${title}](./${urlName}/)`;
    }).join('\n');

    const indexContent = `---
title: ${displayName} Schemas
description: JSON schemas in the ${displayName} category
---

# ${displayName} Schemas

This section contains JSON schemas for ${displayName.toLowerCase()}.

## Available Schemas

${schemaLinks}
`;

    fs.writeFileSync(indexPath, indexContent, 'utf-8');
  }

  console.log(`✅ Generated ${dirMap.size} index pages`);
}

/**
 * Generate main schemas index page
 */
async function generateMainIndex(docsDir, schemaFiles) {
  const indexPath = path.join(docsDir, 'index.mdx');

  // Read pinned cyoda-go version from the help index.
  // Generator runs AFTER the help-index fetch in the build pipeline, so the
  // file is expected to be present; we degrade gracefully if it isn't
  // (generator can still be run standalone for dev iteration).
  const helpIndexPath = path.resolve(__dirname, '..', 'src', 'data', 'cyoda-help-index.json');
  let pinnedVersion = null;
  try {
    const helpIndex = JSON.parse(fs.readFileSync(helpIndexPath, 'utf-8'));
    pinnedVersion = helpIndex.pinnedVersion;
  } catch {
    // no-op — version paragraph is skipped below
  }

  // Get top-level categories
  const categories = new Set();
  for (const file of schemaFiles) {
    const parts = file.split(path.sep);
    categories.add(parts[0]);
  }

  const versionParagraph = pinnedVersion
    ? `The schemas shown here were captured against **cyoda-go v${pinnedVersion}**.
For the version you are running, \`cyoda help cloudevents\` (narrative) and
\`cyoda help cloudevents json\` (machine-readable) on your own binary are
authoritative — the binary ships its own schema tree and always matches its
own code.

`
    : '';

  const mainIndexContent = `---
title: CloudEvents Schemas
description: Complete reference for the CloudEvent and entity/model JSON schemas used in Cyoda
---

import { Card, CardGrid } from '@astrojs/starlight/components';

# CloudEvents Schemas

This section documents the JSON schemas used by the Cyoda platform — CloudEvent
payloads exchanged over the gRPC processing stream, plus the entity and model
structures that travel over REST and gRPC.

${versionParagraph}## Download Schemas

You can download all schemas as a ZIP file: [schemas.zip](/schemas.zip)

## Schema Categories

<CardGrid>
${Array.from(categories).sort().map(cat => {
  const displayName = cat.charAt(0).toUpperCase() + cat.slice(1);
  return `  <Card title="${displayName}" icon="document">
    Browse [${displayName} schemas](./${cat}/)
  </Card>`;
}).join('\n')}
</CardGrid>

## Using JSON Schemas

JSON schemas define the structure and validation rules for data in the Cyoda platform. Each schema includes:

- **Property definitions** with types and descriptions
- **Required fields** clearly marked
- **Validation rules** for data integrity
- **References** to related schemas

Navigate to any category above to explore the available schemas.
`;

  fs.writeFileSync(indexPath, mainIndexContent, 'utf-8');
  console.log(`✅ Generated main schemas index page${pinnedVersion ? ` (pinned v${pinnedVersion})` : ''}`);
}

/**
 * Generate a properties section from the schema
 */
function generatePropertiesSection(schema) {
  if (!schema.properties) {
    return '';
  }

  const required = schema.required || [];
  let section = '## Properties\n\n';

  for (const [propName, propDef] of Object.entries(schema.properties)) {
    const isRequired = required.includes(propName);
    const type = propDef.type || 'object';
    const description = propDef.description || '';
    
    section += `- **${propName}** (${type}${isRequired ? ', required' : ''}): ${description}\n`;
  }

  return section;
}

/**
 * Generate related schemas section
 */
function generateRelatedSchemasSection(category, schemaName) {
  // This is a placeholder - you can enhance this to detect actual references
  return `## Related Schemas

See other schemas in the [${category}](/reference/schemas/${category}/) category.
`;
}

// Run the script
generateSchemaPages().catch((error) => {
  console.error('❌ Error generating schema pages:', error);
  process.exit(1);
});


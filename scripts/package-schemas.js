import { glob } from 'glob';
import { ZipArchive } from 'archiver';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Package all JSON schemas into a downloadable ZIP file
 * This script is run during the build process
 */
async function packageSchemas() {
  console.log('📦 Packaging JSON schemas...');

  const projectRoot = path.resolve(__dirname, '..');
  const schemasDir = path.join(projectRoot, 'src', 'schemas');
  const outputDir = path.join(projectRoot, 'dist');
  const outputFile = path.join(outputDir, 'schemas.zip');

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Find all JSON schema files
  const schemaFiles = await glob('**/*.json', {
    cwd: schemasDir,
    absolute: false,
  });

  console.log(`Found ${schemaFiles.length} schema files`);

  // Create ZIP archive
  const output = fs.createWriteStream(outputFile);
  const archive = new ZipArchive({
    zlib: { level: 9 } // Maximum compression
  });

  // Handle archive events
  output.on('close', () => {
    const sizeInKB = (archive.pointer() / 1024).toFixed(2);
    console.log(`✅ Schemas packaged successfully: ${sizeInKB} KB`);
    console.log(`   Output: ${outputFile}`);
  });

  archive.on('error', (err) => {
    throw err;
  });

  archive.on('warning', (err) => {
    if (err.code === 'ENOENT') {
      console.warn('Warning:', err);
    } else {
      throw err;
    }
  });

  // Pipe archive data to the file
  archive.pipe(output);

  // Add schema files to archive, preserving directory structure
  for (const schemaFile of schemaFiles) {
    const fullPath = path.join(schemasDir, schemaFile);
    archive.file(fullPath, { name: schemaFile });
  }

  // Add a README to the ZIP
  const readmeContent = `# Cyoda JSON Schemas

This archive contains JSON Schema definitions for the Cyoda platform.

## Structure

- **common/**: Common schemas used across the platform
- **entity/**: Entity-related request/response schemas
- **model/**: Model management schemas
- **processing/**: Processing and calculation schemas
- **search/**: Search and query schemas

## Usage

These schemas follow JSON Schema Draft 2020-12 specification.
You can use them for:

- API request/response validation
- Code generation
- Documentation
- IDE autocomplete

## More Information

Visit https://docs.cyoda.net/schemas/ for interactive documentation.

---
Generated: ${new Date().toISOString()}
`;

  archive.append(readmeContent, { name: 'README.md' });

  // Finalize the archive
  await archive.finalize();
}

// Run the script
packageSchemas().catch((error) => {
  console.error('❌ Error packaging schemas:', error);
  process.exit(1);
});


import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import * as lancedb from '@lancedb/lancedb';
import { pipeline } from '@xenova/transformers';

// Configuration paths
const DOCS_DIR = path.join(process.cwd(), 'docs');
const DB_PATH = path.join(process.cwd(), 'data/lancedb');

async function main() {
  console.log('🚀 Starting documentation ingestion...');

  // 1. Connect to LanceDB (creates the folder if it doesn't exist)
  const db = await lancedb.connect(DB_PATH);
  
  // 2. Initialize the embedding model
  // This downloads the model locally the first time (approx 80MB)
  console.log('📦 Loading embedding model (Xenova/all-MiniLM-L6-v2)...');
  const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

  // 3. Find markdown files recursively
  // Using glob to find all .md files inside the docs folder
  const files = await glob('**/*.md', { cwd: DOCS_DIR });
  console.log(`📄 Found ${files.length} markdown files in ${DOCS_DIR}`);

  const data: { vector: number[], text: string, source: string }[] = [];

  for (const file of files) {
    const filePath = path.join(DOCS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    
    console.log(`Processing: ${file}`);

    // Simple Chunking Strategy:
    // Split by markdown headers (#) or double newlines if headers are missing.
    // In a production env, use a RecursiveCharacterTextSplitter.
    const chunks = content
      .split(/^#+\s/gm) 
      .map(c => c.trim())
      .filter(c => c.length > 50); // Ignore very short fragments

    for (const chunk of chunks) {
      // Generate embedding for each chunk
      const output = await extractor(chunk, { pooling: 'mean', normalize: true });
      const vector = Array.from(output.data); // Convert tensor to array

      data.push({
        vector: vector as number[],
        text: chunk,
        source: file
      });
    }
  }

  if (data.length === 0) {
    console.warn('⚠️ No content found to ingest. Make sure you have .md files in the docs/ folder.');
    return;
  }

  // 4. Save to the 'documentation' table
  console.log(`💾 Saving ${data.length} vectors to database...`);
  try {
    // If table exists, drop it to avoid duplicates during re-ingestion
    await db.dropTable('documentation');
  } catch (e) {
    // Ignore error if table does not exist
  }

  await db.createTable('documentation', data);
  console.log('✅ Ingestion complete!');
}

main().catch(console.error);
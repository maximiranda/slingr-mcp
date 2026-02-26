import * as path from 'path';
import * as lancedb from '@lancedb/lancedb';
import { pipeline } from '@xenova/transformers';
import fs from 'fs';
import { glob } from 'glob';

const DB_PATH = path.join(process.cwd(), 'data/lancedb');
const DOCS_DIR = path.join(process.cwd(), 'docs');

export class RAGSystem {
    private db: any;
    private embedder: any;
    private ready: boolean = false;

    async initialize() {
        try {
            console.error("Initializing RAG system...");
            this.db = await lancedb.connect(DB_PATH);
            this.embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

            const tableNames = await this.db.tableNames();
            if (tableNames.includes('documentation')) {
                this.ready = true;
                console.error("✅ RAG System Ready: Documentation table found.");
            } else {
                console.error("⚠️ RAG Warning: 'documentation' table not found. Run 'npm run ingest' first.");
            }
        } catch (e) {
            console.error("❌ RAG Initialization Failed:", e);
            throw e;
        }
    }

    isReady() {
        return this.ready;
    }

    async search(query: string, limit: number = 3) {
        if (!this.ready) {
            throw new Error("RAG system is not ready.");
        }

        const output = await this.embedder(query, { pooling: 'mean', normalize: true });
        const queryVector = Array.from(output.data);

        const table = await this.db.openTable('documentation');
        const results = await table.vectorSearch(queryVector as number[])
            .limit(limit)
            .toArray();

        return results.map((r: any) => ({
            text: r.text,
            source: r.source,
            score: r._distance
        }));
    }

    async ingest() {
        console.error('🚀 Starting documentation ingestion...');

        if (!this.db) {
            this.db = await lancedb.connect(DB_PATH);
        }
        if (!this.embedder) {
            this.embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        }

        const files = await glob('**/*.md', { cwd: DOCS_DIR });
        console.error(`📄 Found ${files.length} markdown files in ${DOCS_DIR}`);

        const data: { vector: number[], text: string, source: string }[] = [];

        for (const file of files) {
            const filePath = path.join(DOCS_DIR, file);
            const content = fs.readFileSync(filePath, 'utf-8');

            console.error(`Processing: ${file}`);

            const chunks = content
                .split(/^#+\s/gm)
                .map(c => c.trim())
                .filter(c => c.length > 50);

            for (const chunk of chunks) {
                const output = await this.embedder(chunk, { pooling: 'mean', normalize: true });
                const vector = Array.from(output.data);

                data.push({
                    vector: vector as number[],
                    text: chunk,
                    source: file
                });
            }
        }

        if (data.length === 0) {
            throw new Error('⚠️ No content found to ingest. Make sure you have .md files in the docs/ folder.');
        }

        console.error(`💾 Saving ${data.length} vectors to database...`);
        try {
            await this.db.dropTable('documentation');
        } catch (e) {
            // Ignore if table doesn't exist
        }

        await this.db.createTable('documentation', data);
        this.ready = true;
        console.error('✅ Ingestion complete!');
        return data.length;
    }
}

export const ragSystem = new RAGSystem();

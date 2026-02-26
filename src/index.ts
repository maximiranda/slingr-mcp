#!/usr/bin/env node

// --- SECURITY PATCH STDOUT ---
// MCP communicates via stdio, so we must prevent random logs from breaking the JSON protocol
console.log = console.error;
// ----------------------------------

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ListResourcesRequestSchema,
    ReadResourceRequestSchema,
    ListPromptsRequestSchema,
    GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { tools } from "./tools.js";
import { ragSystem } from "./rag.js";
import { builderClient, loginToSlingr } from "./slingr-client.js";
import fs from 'fs';
import path from 'path';

// 1. Server Initialization
const server = new Server(
    {
        name: "slingr-mcp-server",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
            resources: {},
            prompts: {},
        },
    }
);

// 2. Resource Handlers
server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
        resources: [
            {
                uri: "slingr://entities",
                name: "Slingr Entities",
                description: "List of all entities in the application",
                mimeType: "application/json",
            }
        ],
    };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;

    if (uri === "slingr://entities") {
        const response = await builderClient.get("/folders?_fields=entity,folderPath&_size=100&type=ENTITY");
        return {
            contents: [
                {
                    uri,
                    mimeType: "application/json",
                    text: JSON.stringify(response.data.items, null, 2),
                },
            ],
        };
    }

    if (uri.startsWith("slingr://docs/")) {
        const filePath = uri.replace("slingr://docs/", "");
        const fullPath = path.join(process.cwd(), 'docs', filePath);
        if (fs.existsSync(fullPath)) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            return {
                contents: [
                    {
                        uri,
                        mimeType: "text/markdown",
                        text: content,
                    },
                ],
            };
        }
    }

    throw new Error(`Resource not found: ${uri}`);
});

// 3. Prompt Handlers
server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
        prompts: [
            {
                name: "create_entity_with_fields",
                description: "Assists in creating a new Slingr entity and defining its initial fields.",
                arguments: [
                    {
                        name: "entityLabel",
                        description: "Label for the new entity",
                        required: true,
                    },
                ],
            },
            {
                name: "debug_slingr_script",
                description: "Provides context for debugging a Slingr script using the documentation.",
                arguments: [
                    {
                        name: "scriptSnippet",
                        description: "The script snippet to debug",
                        required: true,
                    },
                ],
            },
        ],
    };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "create_entity_with_fields") {
        const entityLabel = args?.entityLabel || "New Entity";
        return {
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: `I want to create a new Slingr entity called "${entityLabel}". 
Please help me decide on a camelCase name and identify the essential fields it should have. 
You can use the 'search_documentation' tool to look up field types and 'create_entity' to create it when we are ready.`,
                    },
                },
            ],
        };
    }

    if (name === "debug_slingr_script") {
        const scriptSnippet = args?.scriptSnippet || "";
        return {
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: `I'm having trouble with this Slingr script:\n\n\`\`\`javascript\n${scriptSnippet}\n\`\`\`\n\nPlease search the documentation for relevant API methods and help me fix it.`,
                    },
                },
            ],
        };
    }

    throw new Error(`Prompt not found: ${name}`);
});

// 4. Tool Handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: Object.values(tools).map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
        })),
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    console.error(`🔨 Executing Tool: ${name}`);

    const tool = tools[name];
    if (!tool) {
        throw new Error(`Tool not found: ${name}`);
    }

    try {
        return await tool.execute(args);
    } catch (error: any) {
        const errorMessage = error.response
            ? `Slingr Error (${error.response.status}): ${JSON.stringify(error.response.data)}`
            : `Internal Error: ${error.message}`;
        console.error("❌ Error:", errorMessage);
        return { content: [{ type: "text", text: errorMessage }], isError: true };
    }
});

// 5. Start Server
async function main() {
    ragSystem.initialize().catch(err => console.error("Background RAG Init failed:", err));

    try {
        await loginToSlingr();
    } catch (error) {
        console.error("Authentication failed during startup:");
        console.error(error);
        process.exit(1);
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Slingr MCP Server (v1.0.0) running on stdio");
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});

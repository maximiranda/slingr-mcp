# Slingr MCP Server

This is an MCP (Model Context Protocol) server for the Slingr platform. It provides tools, resources, and prompts to interact with Slingr applications and search through its documentation.

## Features

- **Documentation Search (RAG)**: Search through Slingr's official documentation using a local vector database (LanceDB) and local embeddings.
- **Entity Management**: List entities, get detailed metadata, and create new entities.
- **Field Management**: Create fields within entities.
- **Record Management**: List, get, create, update, and delete records from any entity.
- **Group Management**: List groups and manage entity permissions.
- **Development Tools**: Check for pending changes and review them before pushing.
- **MCP Resources**: Browse entities and documentation files as resources.
- **MCP Prompts**: Specialized prompts to guide the creation of entities and debugging of scripts.

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables in `.env`:
   ```env
   SLINGR_API_URL=https://platform.slingr.io/dev/api
   SLINGR_TOKEN=your_token_here
   ```

3. Build the project:
   ```bash
   npm run build
   ```

4. Ingest documentation (first time or when updated):
   ```bash
   # Option 1: Using the standalone script
   npx tsx scripts/ingest-docs.ts

   # Option 2: Using the MCP tool 'ingest_documentation' (once the server is running)
   ```

## Usage

You can connect this server to any MCP-compatible client (like Claude Desktop).

### In Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "slingr": {
      "command": "node",
      "args": ["/path/to/slingr-mcp/build/index.js"],
      "env": {
        "SLINGR_API_URL": "https://platform.slingr.io/dev/api",
        "SLINGR_TOKEN": "your_token_here"
      }
    }
  }
}
```

## Tools

- `check_connection`: Verifies the API connection.
- `list_entities`: Lists all entities.
- `get_entity`: Gets detailed entity metadata.
- `create_entity`: Creates a new entity.
- `create_field`: Adds a field to an entity.
- `list_records`: Fetches records from an entity.
- `get_record`: Fetches a specific record.
- `create_record`: Creates a new record.
- `update_record`: Updates a record.
- `delete_record`: Deletes a record.
- `search_documentation`: Searches the documentation.
- `ingest_documentation`: Updates the vector database.
- `list_groups`: Lists security groups.
- `get_entity_permissions`: Gets permissions for an entity.
- `update_entity_permissions`: Updates permissions for a group.
- `check_pending_changes`: Checks for development changes.
- `get_pending_changes`: Lists changes ready to be pushed.

## Resources

- `slingr://entities`: Full list of entities in JSON format.
- `slingr://docs/{path}`: Access any documentation file as a resource.

## Prompts

- `create_entity_with_fields`: Guide to modeling a new entity.
- `debug_slingr_script`: Help for debugging scripts using documentation context.

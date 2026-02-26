# Slingr MCP Server

This is an MCP (Model Context Protocol) server for the Slingr platform. It provides tools, resources, and prompts to interact with both the Slingr application structure (Builder) and its data (Runtime).

## Features

- **Documentation Search (RAG)**: Search through Slingr's official documentation using a local vector database (LanceDB) and local embeddings.
- **Application Structure (Builder)**: List entities, get detailed metadata, manage permissions, and create new entities or fields.
- **Data Management (Runtime)**: List, get, create, update, and delete records from any entity.
- **Developer Tools**: Check for pending metadata changes and review them before pushing.
- **MCP Resources**: Browse entities and documentation files as resources.
- **MCP Prompts**: Specialized prompts for entity modeling and script debugging.

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables in `.env`:
   ```env
   SLINGR_API_URL=https://your-domain.slingrs.io/dev/builder/api
   SLINGR_EMAIL=your-email@example.com
   SLINGR_PASSWORD=your-password
   ```

   > [!NOTE]
   > The server will automatically deduce the **Runtime API URL** by replacing `/builder/api` with `/runtime/api` in your `SLINGR_API_URL`. You can override this by setting `SLINGR_RUNTIME_API_URL` explicitly.

3. Build the project:
   ```bash
   npm run build
   ```

4. Ingest documentation (first time or when updated):
   ```bash
   # Using the standalone script
   npx tsx scripts/ingest-docs.ts
   ```

## Usage

### In Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "slingr": {
      "command": "node",
      "args": ["/path/to/slingr-mcp/build/index.js"],
      "env": {
        "SLINGR_API_URL": "https://your-domain.slingrs.io/dev/builder/api",
        "SLINGR_EMAIL": "your-email@example.com",
        "SLINGR_PASSWORD": "your-password"
      }
    }
  }
}
```

## Tools

### Application structure (Builder)
- `check_connection`: Verifies the API connection.
- `list_entities`: Lists all entities.
- `get_entity`: Gets detailed entity metadata (use `verbose: true` for full details).
- `create_entity`: Creates a new entity.
- `create_field`: Adds a field to an entity.
- `list_groups`: Lists security groups (roles).
- `get_entity_permissions`: Gets permissions for an entity (simplified output).
- `update_entity_permissions`: Updates permissions for a group.
- `check_pending_changes`: Checks for development changes.
- `get_pending_changes`: Lists changes ready to be pushed.

### Data Management (Runtime)
- `list_records`: Fetches records from an entity.
- `get_record`: Fetches a specific record. Supports `fields` parameter for partial fetching.
- `create_record`: Creates a new record.
- `update_record`: Updates a record.
- `delete_record`: Deletes a record.

### Other
- `search_documentation`: Searches the documentation.
- `ingest_documentation`: Updates the vector database.

## Resources

- `slingr://entities`: Full list of entities in JSON format.
- `slingr://docs/{path}`: Access any documentation file as a resource.

## Prompts

- `create_entity_with_fields`: Guide to modeling a new entity.
- `debug_slingr_script`: Help for debugging scripts using documentation context.

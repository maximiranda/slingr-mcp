import { z } from "zod";
import { builderClient, runtimeClient } from "./slingr-client.js";
import { ragSystem } from "./rag.js";
import path from "path";

export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: any;
    execute: (args: any) => Promise<{ content: any[], isError?: boolean }>;
}

export const tools: Record<string, ToolDefinition> = {
    check_connection: {
        name: "check_connection",
        description: "Verifies that the connection to the Slingr API is correct.",
        inputSchema: { type: "object", properties: {} },
        execute: async () => {
            const response = await builderClient.get("/entities?fields=name&limit=1");
            return {
                content: [{ type: "text", text: `Connection OK (Status: ${response.status}).` }],
            };
        }
    },
    list_entities: {
        name: "list_entities",
        description: "Lists all existing entities in the Slingr application.",
        inputSchema: { type: "object", properties: {} },
        execute: async () => {
            const response = await builderClient.get("/folders?_fields=entity,folderPath&_size=100&type=ENTITY");
            const rawItems = response.data.items || [];
            const simplifiedList = rawItems.map((e: any) => ({
                id: e.entity.id,
                label: e.entity.label,
                fullPath: e.folderPath
            }));
            return {
                content: [{ type: "text", text: JSON.stringify(simplifiedList, null, 2) }],
            };
        }
    },
    list_groups: {
        name: "list_groups",
        description: "Lists all available groups (roles) in the Slingr application.",
        inputSchema: { type: "object", properties: {} },
        execute: async () => {
            const response = await builderClient.get("/metadata?_fields=name,label&_sortField=label&_sortType=ASC&_type=group&_size=100");
            const rawItems = response.data.items || [];
            const simplifiedList = rawItems.map((g: any) => ({
                id: g.id,
                name: g.name,
                label: g.label
            }));
            return {
                content: [{ type: "text", text: JSON.stringify(simplifiedList, null, 2) }],
            };
        }
    },
    create_entity: {
        name: "create_entity",
        description: "Creates a new entity (table) in the Slingr application.",
        inputSchema: {
            type: "object",
            properties: {
                name: { type: "string", description: "Internal name (camelCase)." },
                label: { type: "string", description: "Human-readable label." },
            },
            required: ["name", "label"],
        },
        execute: async (args) => {
            const schema = z.object({
                name: z.string(),
                label: z.string(),
            });
            const input = schema.parse(args || {});
            const payload = {
                name: input.name,
                label: { defaultValue: input.label, translation: { en: input.label } },
                type: "DATA",
                fieldsNotRequired: true
            };
            const response = await builderClient.post("/entities", payload);
            return {
                content: [{ type: "text", text: `Entity created! ID: ${response.data.id}` }],
            };
        }
    },
    update_entity_permissions: {
        name: "update_entity_permissions",
        description: "Updates the permissions for a specific entity and group (role) by applying partial updates. This fetches current permissions behind the scenes so you only need to submit the fields that change.",
        inputSchema: {
            type: "object",
            properties: {
                entityId: { type: "string", description: "The ID of the entity to update permissions for." },
                group: { type: "string", description: "The ID, name, or label of the group (role) to apply updates to." },
                updates: {
                    type: "object",
                    description: `Partial RolePermission object containing the fields to change. Example: { canEdit: { type: "ALWAYS" } }`
                },
            },
            required: ["entityId", "group", "updates"],
        },
        execute: async (args) => {
            const schema = z.object({
                entityId: z.string(),
                group: z.string(),
                updates: z.record(z.any()),
            });
            const input = schema.parse(args || {});

            const getResponse = await builderClient.get(`/entities/${input.entityId}/permissions?_size=100`);
            let data = getResponse.data;
            let permissionsArray = data.items || data.permissions || (Array.isArray(data) ? data : []);

            if (!Array.isArray(permissionsArray) || permissionsArray.length === 0) {
                throw new Error("Could not parse permissions array from Slingr API response or permissions array is empty.");
            }

            const groupIndex = permissionsArray.findIndex((p: any) =>
                p.name === input.group || p.id === input.group || p.label === input.group ||
                p.group?.name === input.group || p.group?.id === input.group || p.group?.label === input.group
            );

            if (groupIndex === -1) {
                throw new Error(`Group '${input.group}' not found in entity permissions.`);
            }

            permissionsArray[groupIndex] = {
                ...permissionsArray[groupIndex],
                ...input.updates
            };

            let payload: any;
            if (Array.isArray(data)) {
                payload = permissionsArray;
            } else {
                payload = { ...data };
                if (data.items) {
                    payload.items = permissionsArray;
                } else if (data.permissions) {
                    payload.permissions = permissionsArray;
                } else {
                    payload = permissionsArray;
                }
            }

            const putResponse = await builderClient.put(`/entities/${input.entityId}/permissions`, payload);

            const updatedPermissions = putResponse.data?.items || putResponse.data?.permissions || putResponse.data || [];
            const resultGroup = Array.isArray(updatedPermissions)
                ? updatedPermissions.find((p: any) =>
                    p.name === input.group || p.id === input.group || p.label === input.group ||
                    p.group?.name === input.group || p.group?.id === input.group || p.group?.label === input.group
                )
                : null;

            return {
                content: [{
                    type: "text",
                    text: `Successfully updated permissions for group '${input.group}'.\n\nUpdated Group Configuration:\n${JSON.stringify(resultGroup || input.updates, null, 2)}`
                }],
            };
        }
    },
    check_pending_changes: {
        name: "check_pending_changes",
        description: "Checks if there are pending changes (metadata or backups) that need to be pushed.",
        inputSchema: { type: "object", properties: {} },
        execute: async () => {
            const response = await builderClient.get("/development/hasChangesToPush?skipLog=true");
            return {
                content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
            };
        }
    },
    get_pending_changes: {
        name: "get_pending_changes",
        description: "Fetches the detailed list of pending metadata changes to review before pushing.",
        inputSchema: { type: "object", properties: {} },
        execute: async () => {
            const response = await builderClient.get("/development/detectPushChanges?skipLog=true");
            return {
                content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
            };
        }
    },
    get_entity_permissions: {
        name: "get_entity_permissions",
        description: "Gets the permissions for a specific entity. Can optionally filter by a specific group. Filtering by group is highly recommended for large entities to avoid API errors.",
        inputSchema: {
            type: "object",
            properties: {
                entityId: { type: "string", description: "The ID of the entity." },
                group: { type: "string", description: "Optional. The ID, name, or label of the group (role) to filter by. If omitted, returns all." }
            },
            required: ["entityId"],
        },
        execute: async (args) => {
            const schema = z.object({
                entityId: z.string(),
                group: z.string().optional(),
            });
            const input = schema.parse(args || {});
            const response = await builderClient.get(`/entities/${input.entityId}/permissions?_size=100`);

            let data = response.data;
            let resultData: any;

            if (data && Array.isArray(data.items)) {
                let items = data.items;
                if (input.group) {
                    items = items.filter((p: any) =>
                        p.name === input.group || p.id === input.group || p.label === input.group ||
                        p.group?.name === input.group || p.group?.id === input.group || p.group?.label === input.group
                    );
                }

                const cleanedItems = items.map((p: any) => {
                    const cleaned: any = {
                        id: p.id,
                        name: p.name,
                        label: p.label,
                    };
                    if (p.canCreate?.type) cleaned.canCreate = p.canCreate.type;
                    if (p.canAccess?.type) cleaned.canAccess = p.canAccess.type;
                    if (p.canEdit?.type) cleaned.canEdit = p.canEdit.type;
                    if (p.canDelete?.type) cleaned.canDelete = p.canDelete.type;
                    if (p.canSeeAuditLogs?.type) cleaned.canSeeAuditLogs = p.canSeeAuditLogs.type;

                    if (p.fields && Array.isArray(p.fields)) {
                        cleaned.fields = p.fields.map((f: any) => ({
                            name: f.name,
                            label: f.label,
                            permission: f.permission
                        }));
                    }

                    if (p.actions && Array.isArray(p.actions)) {
                        cleaned.actions = p.actions.map((a: any) => ({
                            name: a.name,
                            label: a.label,
                            permission: a.permission?.type
                        }));
                    }

                    return cleaned;
                });
                resultData = { ...data, items: cleanedItems };
            } else {
                const filterByGroup = (arr: any[]) => arr ? arr.filter((p: any) =>
                    p.name === input.group || p.id === input.group || p.label === input.group ||
                    p.group?.name === input.group || p.group?.id === input.group || p.group?.label === input.group
                ) : [];

                if (Array.isArray(data)) {
                    resultData = input.group ? filterByGroup(data) : data;
                } else {
                    resultData = { ...data };
                    if (input.group) {
                        if (data.permissions) resultData.permissions = filterByGroup(data.permissions);
                        if (data.fields) resultData.fields = filterByGroup(data.fields);
                        if (data.views) resultData.views = filterByGroup(data.views);
                        if (data.actions) resultData.actions = filterByGroup(data.actions);
                    }
                }
            }

            const resultText = JSON.stringify(resultData, null, 2);
            return {
                content: [{ type: "text", text: resultText }],
            };
        }
    },
    search_documentation: {
        name: "search_documentation",
        description: "Searches the official Slingr documentation. Note: This documentation is primarily focused on the UI (App Builder) features and logic. Use it to understand Slingr concepts, but do not assume it contains REST API specifications.",
        inputSchema: {
            type: "object",
            properties: {
                query: { type: "string", description: "The search query." },
            },
            required: ["query"],
        },
        execute: async (args) => {
            if (!ragSystem.isReady()) {
                return { content: [{ type: "text", text: "Error: RAG system is still loading. Please wait." }] };
            }
            if (!args || typeof args.query !== 'string') {
                return { content: [{ type: "text", text: "Error: Query string required." }] };
            }

            const results = await ragSystem.search(args.query);

            const contextText = results.map((r: any) =>
                `--- SOURCE: ${path.basename(r.source)} ---\n${r.text}\n`
            ).join('\n');

            return { content: [{ type: "text", text: contextText }] };
        }
    },
    get_entity: {
        name: "get_entity",
        description: "Gets the metadata of a specific entity. By default, it returns a simplified version to save tokens.",
        inputSchema: {
            type: "object",
            properties: {
                entityId: { type: "string", description: "The ID or name of the entity." },
                verbose: { type: "boolean", description: "If true, returns the full metadata including permissions and UI details.", default: false }
            },
            required: ["entityId"],
        },
        execute: async (args) => {
            const response = await builderClient.get(`/entities/${args.entityId}`);
            let data = response.data;
            if (!args.verbose) {
                data = {
                    id: data.id,
                    name: data.name,
                    label: data.label,
                    fullName: data.fullName,
                    type: data.type,
                    fields: data.fields?.map((f: any) => {
                        const simplifiedField: any = {
                            id: f.id,
                            name: f.name,
                            label: f.label,
                            type: f.type,
                            multiplicity: f.multiplicity,
                            required: f.generalRules?.required?.type,
                        };
                        if (f.type === 'RELATIONSHIP' && f.typeRules) {
                            simplifiedField.targetEntity = {
                                id: f.typeRules.entityId,
                                label: f.typeRules.entityLabel
                            };
                        } else if (f.type === 'CHOICE' && f.typeRules?.values) {
                            simplifiedField.options = f.typeRules.values.map((v: any) => ({
                                name: v.name,
                                label: v.label
                            }));
                        }
                        return simplifiedField;
                    }),
                    views: data.views?.map((v: any) => ({
                        id: v.id,
                        name: v.name,
                        label: v.label,
                        type: v.type
                    })),
                    actions: data.actions?.map((a: any) => ({
                        id: a.id,
                        name: a.name,
                        label: a.label
                    }))
                };
            }
            return {
                content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
            };
        }
    },
    create_field: {
        name: "create_field",
        description: "Creates a new field in a specific entity.",
        inputSchema: {
            type: "object",
            properties: {
                entityId: { type: "string", description: "The ID of the entity." },
                name: { type: "string", description: "The internal name of the field." },
                label: { type: "string", description: "The human-readable label." },
                type: { type: "string", description: "The type of the field (e.g., text, integer, date, etc.)." },
                multiplicity: { type: "string", enum: ["ONE", "MANY"], description: "The multiplicity of the field.", default: "ONE" },
                required: { type: "boolean", description: "Whether the field is required.", default: false },
            },
            required: ["entityId", "name", "label", "type"],
        },
        execute: async (args) => {
            const payload = {
                name: args.name,
                label: { defaultValue: args.label, translation: { en: args.label } },
                type: args.type,
                multiplicity: args.multiplicity || "ONE",
                required: args.required || false
            };
            const response = await builderClient.post(`/entities/${args.entityId}/fields`, payload);
            return {
                content: [{ type: "text", text: `Field created! ID: ${response.data.id}` }],
            };
        }
    },
    list_records: {
        name: "list_records",
        description: "Lists records from a specific entity.",
        inputSchema: {
            type: "object",
            properties: {
                entityName: { type: "string", description: "The name of the entity." },
                limit: { type: "number", description: "Maximum number of records to return.", default: 20 },
                offset: { type: "number", description: "Number of records to skip.", default: 0 },
            },
            required: ["entityName"],
        },
        execute: async (args) => {
            const { entityName, limit = 20, offset = 0 } = args;
            const response = await runtimeClient.get(`/data/${entityName}?_size=${limit}&_from=${offset}`);
            return {
                content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
            };
        }
    },
    get_record: {
        name: "get_record",
        description: "Gets a specific record by its ID.",
        inputSchema: {
            type: "object",
            properties: {
                entityName: { type: "string", description: "The name of the entity." },
                recordId: { type: "string", description: "The ID of the record." },
                fields: { type: "string", description: "Optional. Comma-separated list of fields to return." },
            },
            required: ["entityName", "recordId"],
        },
        execute: async (args) => {
            const query = args.fields ? `?_fields=${args.fields}` : "";
            const response = await runtimeClient.get(`/data/${args.entityName}/${args.recordId}${query}`);
            return {
                content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
            };
        }
    },
    create_record: {
        name: "create_record",
        description: "Creates a new record in a specific entity.",
        inputSchema: {
            type: "object",
            properties: {
                entityName: { type: "string", description: "The name of the entity." },
                data: { type: "object", description: "The record data." },
            },
            required: ["entityName", "data"],
        },
        execute: async (args) => {
            const response = await runtimeClient.post(`/data/${args.entityName}`, args.data);
            return {
                content: [{ type: "text", text: `Record created! ID: ${response.data.id}` }],
            };
        }
    },
    update_record: {
        name: "update_record",
        description: "Updates an existing record.",
        inputSchema: {
            type: "object",
            properties: {
                entityName: { type: "string", description: "The name of the entity." },
                recordId: { type: "string", description: "The ID of the record." },
                data: { type: "object", description: "The updated record data." },
            },
            required: ["entityName", "recordId", "data"],
        },
        execute: async (args) => {
            const response = await runtimeClient.patch(`/data/${args.entityName}/${args.recordId}`, args.data);
            return {
                content: [{ type: "text", text: `Record ${args.recordId} updated!` }],
            };
        }
    },
    delete_record: {
        name: "delete_record",
        description: "Deletes a specific record.",
        inputSchema: {
            type: "object",
            properties: {
                entityName: { type: "string", description: "The name of the entity." },
                recordId: { type: "string", description: "The ID of the record." },
            },
            required: ["entityName", "recordId"],
        },
        execute: async (args) => {
            await runtimeClient.delete(`/data/${args.entityName}/${args.recordId}`);
            return {
                content: [{ type: "text", text: `Record ${args.recordId} deleted.` }],
            };
        }
    },
    ingest_documentation: {
        name: "ingest_documentation",
        description: "Ingests the documentation files into the RAG system. This may take a while.",
        inputSchema: { type: "object", properties: {} },
        execute: async () => {
            const count = await ragSystem.ingest();
            return {
                content: [{ type: "text", text: `Documentation ingested successfully! ${count} chunks saved.` }],
            };
        }
    }
};

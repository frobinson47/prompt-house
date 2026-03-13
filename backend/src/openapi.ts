export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Prompt House API",
    version: "1.0.0",
    description:
      "REST API for managing AI prompts. Write operations (create, update, delete) require an `X-Api-Key` header when `API_KEY` is configured on the server.",
  },
  servers: [{ url: "/api" }],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "X-Api-Key",
      },
    },
    schemas: {
      Prompt: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          title: { type: "string", maxLength: 255 },
          description: { type: "string", nullable: true },
          content: { type: "string" },
          tags: { type: "array", items: { type: "string" }, nullable: true },
          modelCompatibility: { type: "array", items: { type: "string" }, nullable: true },
          status: { type: "string", enum: ["draft", "active", "archived", "deprecated"] },
          visibility: { type: "string", enum: ["public", "private"] },
          rating: { type: "number", minimum: 0, maximum: 9.99, nullable: true },
          usageExamples: {
            type: "array",
            items: { type: "string" },
            nullable: true,
            description: "Example use cases for this prompt",
          },
          version: { type: "integer" },
          author: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
        required: ["id", "title", "content", "status", "visibility", "version", "createdAt", "updatedAt"],
      },
      CreatePrompt: {
        type: "object",
        required: ["title", "content"],
        properties: {
          title: { type: "string", minLength: 1, maxLength: 255 },
          content: { type: "string", minLength: 1 },
          description: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          modelCompatibility: { type: "array", items: { type: "string" } },
          status: { type: "string", enum: ["draft", "active", "archived", "deprecated"] },
          visibility: { type: "string", enum: ["public", "private"] },
          rating: { type: "number", minimum: 0, maximum: 9.99 },
          usageExamples: { type: "array", items: { type: "string" } },
          author: { type: "string" },
        },
      },
      UpdatePrompt: {
        type: "object",
        properties: {
          title: { type: "string", minLength: 1, maxLength: 255 },
          content: { type: "string", minLength: 1 },
          description: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          modelCompatibility: { type: "array", items: { type: "string" } },
          status: { type: "string", enum: ["draft", "active", "archived", "deprecated"] },
          visibility: { type: "string", enum: ["public", "private"] },
          rating: { type: "number", minimum: 0, maximum: 9.99 },
          usageExamples: { type: "array", items: { type: "string" } },
          author: { type: "string" },
        },
      },
      Pagination: {
        type: "object",
        properties: {
          page: { type: "integer" },
          limit: { type: "integer" },
          total: { type: "integer" },
          pages: { type: "integer" },
        },
      },
      Error: {
        type: "object",
        properties: {
          error: { type: "string" },
        },
      },
    },
  },
  paths: {
    "/prompts": {
      get: {
        summary: "List prompts",
        operationId: "listPrompts",
        tags: ["Prompts"],
        parameters: [
          { name: "q", in: "query", description: "Full-text search query", schema: { type: "string" } },
          { name: "tags", in: "query", description: "Filter by tags (comma-separated)", schema: { type: "string" } },
          {
            name: "status",
            in: "query",
            description: "Filter by status",
            schema: { type: "string", enum: ["draft", "active", "archived", "deprecated"] },
          },
          { name: "model", in: "query", description: "Filter by model compatibility", schema: { type: "string" } },
          {
            name: "sort",
            in: "query",
            description: "Sort field",
            schema: { type: "string", enum: ["created_at", "updated_at", "title", "rating"], default: "created_at" },
          },
          {
            name: "order",
            in: "query",
            description: "Sort direction",
            schema: { type: "string", enum: ["asc", "desc"], default: "desc" },
          },
          { name: "page", in: "query", description: "Page number (1-based)", schema: { type: "integer", default: 1 } },
          {
            name: "limit",
            in: "query",
            description: "Items per page (max 100)",
            schema: { type: "integer", default: 20 },
          },
        ],
        responses: {
          "200": {
            description: "Paginated list of prompts",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Prompt" } },
                    pagination: { $ref: "#/components/schemas/Pagination" },
                  },
                },
              },
            },
          },
          "400": { description: "Invalid query parameters", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
      post: {
        summary: "Create a prompt",
        operationId: "createPrompt",
        tags: ["Prompts"],
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreatePrompt" } },
          },
        },
        responses: {
          "201": {
            description: "Prompt created",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Prompt" } } },
          },
          "400": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/prompts/{id}": {
      get: {
        summary: "Get a prompt by ID",
        operationId: "getPrompt",
        tags: ["Prompts"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": {
            description: "Prompt found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Prompt" } } },
          },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
      patch: {
        summary: "Update a prompt",
        operationId: "updatePrompt",
        tags: ["Prompts"],
        security: [{ ApiKeyAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpdatePrompt" } },
          },
        },
        responses: {
          "200": {
            description: "Prompt updated",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Prompt" } } },
          },
          "400": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
      delete: {
        summary: "Archive a prompt (soft delete)",
        operationId: "deletePrompt",
        tags: ["Prompts"],
        security: [{ ApiKeyAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "204": { description: "Prompt archived" },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/prompts/{id}/duplicate": {
      post: {
        summary: "Duplicate a prompt",
        operationId: "duplicatePrompt",
        tags: ["Prompts"],
        security: [{ ApiKeyAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "201": {
            description: "Duplicate created (status=draft, title appended with ' (copy)')",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Prompt" } } },
          },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
  },
};

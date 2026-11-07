import { SCOPES } from "../account/scopes.ts";
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from "./submissions.ts";

/**
 * `GET /api/v1/openapi.json` — the agent API described (#133).
 *
 * Hand-written rather than generated, and kept honest by
 * `tests/api-rest.test.mts`, which fails when an operation exists in
 * `./rest.ts` without being described here (or the reverse), or when a path
 * here has no route file.
 */

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const nullable = (type: string, extra: Record<string, unknown> = {}) => ({ type: [type, "null"], ...extra });

const idParam = (what: string) => ({
  name: "id",
  in: "path",
  required: true,
  description: `The ${what}'s public id.`,
  schema: { type: "string" },
});

const listParam = (name: string, values: string[], description: string) => ({
  name,
  in: "query",
  description: `${description} One or more of ${values.join(", ")}, comma separated or repeated.`,
  schema: { type: "string" },
});

const filterParams = [
  { name: "endpoint", in: "query", description: "Only this endpoint's submissions (its public id).", schema: { type: "string" } },
  listParam("origin", ["human", "agent", "unverified"], "Provenance stamp."),
  listParam("verdict", ["won", "lost", "disqualified", "awaiting"], "Downstream outcome."),
  listParam("spam", ["clear", "flagged", "not_spam", "confirmed_spam"], "Spam state."),
  {
    name: "from",
    in: "query",
    description: "Submitted at or after. A date (YYYY-MM-DD, UTC) or an ISO 8601 timestamp.",
    schema: { type: "string" },
  },
  {
    name: "to",
    in: "query",
    description: "Submitted before this timestamp, or on or before this date (a date covers the whole UTC day).",
    schema: { type: "string" },
  },
  { name: "q", in: "query", description: "Case-insensitive search across submitted values and the submission id.", schema: { type: "string" } },
];

const ok = (data: unknown, extra: Record<string, unknown> = {}) => ({
  type: "object",
  required: ["ok", "data"],
  properties: { ok: { const: true }, data, ...extra },
});

const json = (schema: unknown, description = "OK") => ({
  description,
  content: { "application/json": { schema } },
});

const errors = {
  "400": { $ref: "#/components/responses/Error" },
  "401": { $ref: "#/components/responses/Error" },
  "403": { $ref: "#/components/responses/Error" },
  "429": { $ref: "#/components/responses/Error" },
};

const withNotFound = { ...errors, "404": { $ref: "#/components/responses/Error" } };

function op(
  operationId: string,
  summary: string,
  scope: string,
  responses: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) {
  return {
    operationId,
    summary,
    description: scope === "any" ? "Any valid key." : `Needs the \`${scope}\` scope.`,
    "x-required-scope": scope,
    responses,
    ...extra,
  };
}

const body = (schema: unknown) => ({ required: true, content: { "application/json": { schema } } });

export function openApiDocument(serverUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Endpoint Forms API",
      version: "1.0.0",
      description:
        "Endpoints, form schemas, submissions and deliveries for one workspace. Authenticate with a workspace API key (efv2.<id>.<secret>) as `Authorization: Bearer <key>`. Every call reads and writes only the key's own workspace; another workspace's id is a 404. The account MCP server (/api/mcp) and the `endpointforms` CLI expose the same operations.",
      license: { name: "AGPL-3.0" },
    },
    servers: [{ url: `${serverUrl.replace(/\/$/, "")}/api/v1` }],
    security: [{ bearer: [] }],
    paths: {
      "/me": {
        get: op("whoami", "The key's workspace and scopes", "any", { "200": json(ok(ref("Whoami"))), ...errors }),
      },
      "/endpoints": {
        get: op("listEndpoints", "List endpoints, archived ones included", "endpoints:read", {
          "200": json(ok({ type: "array", items: ref("Endpoint") })),
          ...errors,
        }),
        post: op(
          "createEndpoint",
          "Create an endpoint. Submissions are emailed to the person who created the key.",
          "endpoints:write",
          { "201": json(ok(ref("CreatedEndpoint")), "Created"), ...errors },
          {
            requestBody: body({
              type: "object",
              required: ["name"],
              additionalProperties: false,
              properties: { name: { type: "string", minLength: 1, maxLength: 120 } },
            }),
          },
        ),
      },
      "/endpoints/{id}": {
        parameters: [idParam("endpoint")],
        get: op("getEndpoint", "Get one endpoint", "endpoints:read", { "200": json(ok(ref("Endpoint"))), ...withNotFound }),
        patch: op(
          "updateEndpoint",
          "Rename, archive or restore an endpoint",
          "endpoints:write",
          { "200": json(ok(ref("Endpoint"))), ...withNotFound },
          {
            requestBody: body({
              type: "object",
              additionalProperties: false,
              minProperties: 1,
              properties: {
                name: { type: "string", minLength: 1, maxLength: 120 },
                archived: { type: "boolean", description: "true archives (refuses new submissions); false restores." },
              },
            }),
          },
        ),
        delete: op(
          "deleteEndpoint",
          "Archive an endpoint. It refuses new submissions and keeps every one it has; PATCH archived:false restores it.",
          "endpoints:write",
          { "200": json(ok(ref("Endpoint"))), ...withNotFound },
        ),
      },
      "/endpoints/{id}/form": {
        parameters: [idParam("endpoint")],
        get: op("getFormSchema", "The endpoint's live form schema, or null", "endpoints:read", {
          "200": json(ok(ref("FormSchema"))),
          ...withNotFound,
        }),
        put: op(
          "setFormSchema",
          "Publish a new form schema version (or save a draft with activate:false)",
          "endpoints:write",
          { "200": json(ok(ref("PublishedSchema"))), ...withNotFound, "409": { $ref: "#/components/responses/Error" } },
          {
            requestBody: body({
              type: "object",
              required: ["document"],
              additionalProperties: false,
              properties: {
                document: {
                  description: "The schema document: { formatVersion: 1, fields: [{ key, label, type, required, options }] }, as an object or JSON text.",
                  oneOf: [{ type: "object" }, { type: "string" }],
                },
                mode: { enum: ["warn", "strict"], description: "warn (default) stores mismatches and says so; strict rejects them." },
                activate: { type: "boolean", default: true },
              },
            }),
          },
        ),
      },
      "/endpoints/{id}/destinations": {
        parameters: [idParam("endpoint")],
        get: op("listDestinations", "Where the endpoint delivers submissions, with health. Config is never returned.", "endpoints:read", {
          "200": json(ok({ type: "array", items: ref("Destination") })),
          ...withNotFound,
        }),
      },
      "/submissions": {
        get: op(
          "listSubmissions",
          "List submissions, newest first, with cursor pagination",
          "submissions:read",
          {
            "200": json(
              ok({ type: "array", items: ref("Submission") }, {
                next_cursor: nullable("string", { description: "Pass as `cursor` for the next page. Null on the last page." }),
              }),
            ),
            ...withNotFound,
          },
          {
            parameters: [
              ...filterParams,
              { name: "cursor", in: "query", description: "next_cursor from the previous page.", schema: { type: "string" } },
              {
                name: "limit",
                in: "query",
                schema: { type: "integer", minimum: 1, maximum: MAX_PAGE_LIMIT, default: DEFAULT_PAGE_LIMIT },
              },
            ],
          },
        ),
      },
      "/submissions/export": {
        get: op(
          "exportSubmissions",
          "Export every matching submission (up to 10,000) as CSV or JSON. X-Export-Truncated: true when capped.",
          "submissions:read",
          {
            "200": {
              description: "The file",
              headers: {
                "X-Export-Row-Count": { schema: { type: "integer" } },
                "X-Export-Truncated": { schema: { type: "string" } },
              },
              content: { "text/csv": { schema: { type: "string" } }, "application/json": { schema: { type: "object" } } },
            },
            ...withNotFound,
          },
          {
            parameters: [
              ...filterParams,
              { name: "format", in: "query", schema: { enum: ["csv", "json"], default: "csv" } },
            ],
          },
        ),
      },
      "/submissions/{id}": {
        parameters: [idParam("submission")],
        get: op("getSubmission", "One submission with its files and delivery history", "submissions:read", {
          "200": json(ok(ref("SubmissionDetail"))),
          ...withNotFound,
        }),
        delete: op("deleteSubmission", "Delete a submission. It disappears from the inbox, exports, the API and Yield.", "submissions:write", {
          "200": json(ok({ type: "object", properties: { id: { type: "string" }, deleted: { const: true } } })),
          ...withNotFound,
        }),
      },
      "/submissions/{id}/deliveries": {
        parameters: [idParam("submission")],
        get: op("listSubmissionDeliveries", "Every delivery attempt for one submission", "submissions:read", {
          "200": json(ok({ type: "array", items: ref("Delivery") })),
          ...withNotFound,
        }),
      },
    },
    components: {
      securitySchemes: {
        bearer: {
          type: "http",
          scheme: "bearer",
          description: `A workspace API key. Scopes: ${SCOPES.join(", ")}.`,
        },
      },
      responses: {
        Error: json(
          {
            type: "object",
            required: ["ok", "error"],
            properties: {
              ok: { const: false },
              error: {
                type: "object",
                required: ["code", "message"],
                properties: {
                  code: { enum: ["unauthorized", "forbidden", "not_found", "invalid_request", "conflict", "rate_limited", "internal_error"] },
                  message: { type: "string", description: "Says what to change." },
                },
              },
            },
          },
          "Error",
        ),
      },
      schemas: {
        Whoami: {
          type: "object",
          properties: {
            workspace: {
              type: "object",
              properties: { slug: { type: "string" }, name: nullable("string"), url: { type: "string" } },
            },
            scopes: { type: "array", items: { type: "string" } },
          },
        },
        Endpoint: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            archived: { type: "boolean" },
            archived_at: nullable("string", { format: "date-time" }),
            created_at: { type: "string", format: "date-time" },
            has_form_schema: { type: "boolean" },
            submission_count: { type: "integer" },
            awaiting_outcome_count: { type: "integer" },
            last_submission_at: nullable("string", { format: "date-time" }),
            submit_url: { type: "string" },
            manifest_url: { type: "string" },
            dashboard_url: { type: "string" },
          },
        },
        CreatedEndpoint: {
          allOf: [ref("Endpoint"), { type: "object", properties: { notifies: nullable("string") } }],
        },
        FormSchema: {
          type: "object",
          properties: {
            endpoint_id: { type: "string" },
            schema: {
              type: ["object", "null"],
              properties: {
                version: { type: "integer" },
                mode: { enum: ["warn", "strict"] },
                source: { type: "string" },
                created_at: { type: "string", format: "date-time" },
                document: { type: ["object", "null"] },
              },
            },
          },
        },
        PublishedSchema: {
          type: "object",
          properties: {
            endpoint_id: { type: "string" },
            version: { type: "integer" },
            mode: { enum: ["warn", "strict"] },
            active: { type: "boolean" },
          },
        },
        Destination: {
          type: "object",
          properties: {
            id: { type: "string" },
            kind: { type: "string" },
            name: { type: "string" },
            enabled: { type: "boolean" },
            default_notification: { type: "boolean" },
            created_at: { type: "string", format: "date-time" },
            health: { type: "object" },
          },
        },
        Submission: {
          type: "object",
          properties: {
            id: { type: "string" },
            endpoint: { type: "object", properties: { id: { type: "string" }, name: { type: "string" } } },
            submitted_at: { type: "string", format: "date-time" },
            origin: { enum: ["human", "agent", "unverified"] },
            spam: { type: "object", properties: { state: { type: "string" }, score: { type: "integer" } } },
            outcome: {
              type: "object",
              properties: { verdict: { type: "string" }, value: nullable("string"), currency: nullable("string") },
            },
            values: { type: "object", description: "The submitted fields." },
            attribution: { type: "object" },
            delivered_nowhere: { type: "boolean" },
          },
        },
        SubmissionDetail: {
          allOf: [
            ref("Submission"),
            {
              type: "object",
              properties: {
                origin_reasons: { type: "array" },
                spam_reasons: { type: "array" },
                user_agent: nullable("string"),
                raw: { type: "object", properties: { content_type: nullable("string"), body: nullable("string") } },
                files: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      field: { type: "string" },
                      filename: { type: "string" },
                      content_type: nullable("string"),
                      size: { type: "integer" },
                      sha256: { type: "string" },
                      purged: { type: "boolean" },
                      expires_at: nullable("string", { format: "date-time" }),
                      download_url: nullable("string", { description: "Signed; valid for a week or until retention ends." }),
                    },
                  },
                },
                deliveries: { type: "array", items: ref("Delivery") },
              },
            },
          ],
        },
        Delivery: {
          type: "object",
          properties: {
            id: { type: "string" },
            attempt: { type: "integer" },
            status: { enum: ["pending", "succeeded", "failed"] },
            response_status: nullable("integer"),
            error: nullable("string"),
            destination: { type: "object", properties: { name: nullable("string"), kind: nullable("string") } },
            created_at: { type: "string", format: "date-time" },
            started_at: nullable("string", { format: "date-time" }),
            completed_at: nullable("string", { format: "date-time" }),
            next_retry_at: nullable("string", { format: "date-time" }),
          },
        },
      },
    },
  };
}

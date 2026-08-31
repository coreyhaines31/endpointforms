/**
 * The optional form schema (#51).
 *
 * An endpoint works with no schema — that is #50 and it stays true. Declaring
 * one is optional and unlocks Manifest (#32), Hindsight (#45), server-side
 * validation and typed exports: the things that need to know what the form
 * *is*, not merely what was posted to it.
 *
 * | Module | What it is |
 * | --- | --- |
 * | `format.ts` | The field list, its ten types, and its own version number. |
 * | `validate.ts` | Reading a payload against a schema. Describes; never drops. |
 * | `import-html.ts` | Producer one: derive a schema from markup. |
 * | `import-url.ts` | Producer one, from a URL, with the SSRF guard that needs. |
 * | `infer.ts` | Producer three: propose a schema from observed submissions. |
 * | `store.ts` | Append-only versions, the endpoint's pointer, and producer two. |
 *
 * Producer four, the builder, is #35. It hands `store.ts` a document like every
 * other producer does — it is a convenience on top of this format, not the
 * thing the rest of it is built on.
 *
 * The one rule that outranks everything else in this directory: **adding a
 * schema must never break an endpoint that was working without one.**
 *
 * `store.ts` is deliberately **not** re-exported here. It opens database
 * connections, and a component reaching for `parseSchemaDocument` should not
 * drag the database client into its bundle to get it. Import it by path from a
 * Server Component or an action.
 */

export {
  emptyDocument,
  FIELD_TYPES,
  findField,
  parseSchemaDocument,
  parseSchemaJson,
  readStoredDocument,
  SCHEMA_FORMAT_VERSION,
  serializeSchemaDocument,
  type FieldOption,
  type FieldType,
  type FieldValidation,
  type FormSchemaDocument,
  type ParseResult,
  type SchemaField,
} from "./format.ts";

export {
  validateSubmission,
  type IssueCode,
  type IssueSeverity,
  type ValidationIssue,
  type ValidationResult,
} from "./validate.ts";

export {
  importSchemaFromHtml,
  type HtmlImportResult,
  type ImportedForm,
  type ImportNote,
  type ImportNoteCode,
} from "./import-html.ts";

export {
  HtmlFetchError,
  importSchemaFromUrl,
  type UrlImportResult,
} from "./import-url.ts";

export {
  inferSchema,
  MIN_SUBMISSIONS_FOR_INFERENCE,
  type InferenceResult,
  type InferredField,
} from "./infer.ts";

export { isReservedFieldName, RESERVED_FIELD_NAMES } from "./reserved.ts";

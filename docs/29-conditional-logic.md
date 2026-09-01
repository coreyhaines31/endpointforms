# 29 — Conditional logic and the rules inspector

Issue #36. Status: implemented.

> "The conditional logic is always the biggest headache — it never works right for anything
> beyond super simple forms." — u/devhisaria, r/nocode, Oct 2025

This is the most-cited functional complaint in the category and it is unclaimed. Everyone
ships conditional logic. Nobody ships a way to see *why* a field is hidden. That second
sentence is the feature; the engine is the plumbing under it.

This document records the decisions, not the API. The code is the API, and every file named
here carries the argument for its own half.

---

## 1. Where the rules live

**Inside `FormSchemaDocument`, as an optional top-level `rules` array.** Not a second table,
not a sidecar, not a per-field property.

| | |
| --- | --- |
| Algebra (types, operators, walkers, limits) | `src/lib/rules/algebra.ts` |
| Zod parser for a ruleset | `src/lib/rules/format.ts` |
| The one evaluator | `src/lib/rules/evaluate.ts` |
| Cycle / contradiction analysis | `src/lib/rules/analyze.ts` |
| Rules in English, including for agents | `src/lib/rules/describe.ts` |
| The inspector's view model | `src/lib/rules/inspect.ts` |
| Folded into the document | `src/lib/schema/format.ts` |

Three consequences follow from putting the rules in the document, and all three are the
reason for doing it:

- **A published version carries the logic it was published with.** `form_schemas` is
  append-only and a submission stores the `schema_version_id` it arrived under, so a
  submission from Tuesday stays readable against Tuesday's rules. Rules in a mutable side
  table would have silently rewritten history.
- **Every producer gets them for free.** The builder, a committed JSON file, an HTML import
  and inference all hand `store.ts` one document.
- **Old rows are unaffected.** No `rules` key means no rules. `serializeSchemaDocument` omits
  the key entirely when the array is empty, so a form without conditional logic serialises to
  exactly the bytes it did before #36 — which matters, because the builder's unsaved-changes
  indicator compares those bytes.

**A rule has no id.** Its identity is its index in the array, which is also the order it is
written in and the order the inspector reports. A second name for the same thing is a second
thing to disagree.

**Actions are `show`, `hide`, `require`.** #36 also lists "set values" and "skip steps".
Neither is here: a rule that writes an answer nobody typed is the category habit this product
is positioned against, and steps do not exist in the format, so a rule that skipped one would
be a rule about a concept the renderer has never heard of. Both are additive later. Neither
can be taken back once a stored document contains it.

There is no `optional` action either. `require` only ever adds. The one thing that lifts a
requirement is the field not being asked at all.

---

## 2. The three semantic decisions that make evaluation well-defined

### 2.1 A hidden field is not an input

If a rule hides `vat_number`, every other rule reads `vat_number` as unanswered — even though
the value the visitor typed before it was hidden is still there, still posted and still
stored.

The alternative (conditions read raw answers regardless of visibility) produces forms that ask
for the country of a VAT number you cannot see. It is also the decision that makes a cycle
*possible*, and therefore the decision that makes cycle detection necessary rather than
decorative.

### 2.2 Evaluation runs in dependency order, and that order is reported

Fields are sorted topologically over the show/hide graph — an edge from every field a rule
reads to every field that rule shows or hides — and each rule runs at the position of its
earliest target. Rules that only require things run last, in document order. Ties break on
document order throughout.

Visibility is settled first, requiredness second, against final visibility.

This is a topological sort rather than a fixed-point loop because a loop needs an iteration
cap, and an iteration cap is a rule that silently stops being true on a large form. #36's bar
is 20 conditions with nested groups; this has no bar.

`require` actions create no edges, because nothing reads requiredness. Two rules that require
each other's field is not a cycle and stays publishable.

### 2.3 A hidden field is never required

Computed last. This is the property a raw POST depends on: a field required only under a
condition must not refuse a submission whose condition is false, and there is no browser out
there to have hidden it.

### Baseline visibility

**A field is visible unless a rule shows it.** Writing `show X when C` is only meaningful if X
is not already on the page, so a field any rule shows starts hidden and a field nothing shows
starts visible. This is why the format needs no per-field "starts hidden" flag that could
disagree with the rules beside it. The inspector states the baseline against every field, so
it is never invisible.

### Comparison

Case-insensitive and trimmed. "Yes" and "yes" are the same answer to the person filling in the
form, and a conditional form that disagrees is the complaint #36 opens with. Select values are
exact strings we generated, so nothing is lost there.

An unanswered field: `equals` is false, `not_equals` is true, `contains` is false. The
inspector prints "read: nothing" beside the condition so it is never a mystery which happened.

---

## 3. The three surfaces, and what each can honestly say

One document drives the hosted human form, the agent-callable MCP tool, and validation on raw
POSTs. Conditional logic is the first feature where they can genuinely disagree.

### 3.1 Raw POST — where the rules are actually enforced

`validateSubmission` runs `evaluateRules` on every submission from every surface. This is the
only enforcement point, and everything else defers to it.

- A field the rules did not ask for is **not checked at all** — not for requiredness, not for
  its value. It cannot be missing from a question nobody was asked.
- An answer on a hidden field is a **warning** (`answered_hidden_field`), in every mode
  including `strict`, and the submission is stored. A rule must never be able to turn a lead
  into a 422.
- A ruleset that cannot be evaluated (a cycle in a document an older build published) is
  ignored whole, and that is said out loud as a `rules_ignored` warning on the submission.
  Ignoring it degrades safely in every direction at once: every field shown, nothing
  conditionally required, nothing refused.

### 3.2 The hosted form — the browser is an enhancement, never the enforcement

The page still submits with JavaScript disabled. With scripting off, every field renders,
every answer posts, and the server decides. With scripting on, one Client Component that
renders **no markup** (`src/components/render/form-rules.tsx`) hides rows the rules are not
asking for.

Two rules govern it:

- **It hides rows; it never removes values.** `element.hidden = true` on the row, and nothing
  else. The controls stay in the DOM, keep their values, and are still submitted — so the
  payload the server receives is identical whether or not the script ran. Browser and server
  agree *by construction*: same answers, same function.
- **`required` comes off a hidden control.** A hidden required input cannot be focused, so the
  browser refuses to submit and cannot say why. That is the worst failure available on this
  page.

It calls `evaluateRules` — the same function the server calls. A second implementation would
be a rule that fires in the browser and not on the server, which is a lead quietly refused.
`algebra.ts` is split from `format.ts` precisely so this import does not drag Zod onto a
lead-capture page.

**The HTML `required` attribute is emitted only for fields that are required under every set
of answers.** A field a rule can stop asking for carries no `required` in the markup, because
with scripting off it is on screen and the browser would demand an answer the server does not
want.

### 3.3 The agent tool — prose, and deliberately not `required`

**JSON Schema cannot express "required when `budget` is `50k+`"** in the subset we publish,
and there is no encoding an arbitrary agent's validator is guaranteed to understand. Three
options, and only one is honest:

| Option | Why it loses |
| --- | --- |
| Put it in `required` anyway | Publishes a rule we do not enforce. An agent that cannot supply the value has two choices and the likelier one is to invent it — a fabricated lead, caused by us. |
| Say nothing, enforce server-side | The agent discovers the rule as a rejection, costing a round trip it may not take. |
| **Say it in prose in `description`, enforce server-side** | **Chosen.** |

The prose is generated from the ruleset by `describe.ts`, so it cannot fall out of step with
what `validate.ts` does, and it names fields by **key** because a key is what the caller can
address. The tool's own description says the form has conditional logic and that the `required`
list names only fields required whatever else you send.

`required` therefore means exactly one thing: *this call is refused without it.* A field that
is only conditionally required is not in it; nor is a field declared `required: true` that a
rule can hide, because the server would accept the call without it.

**That predicate — `summarizeFieldRules(...).alwaysRequired` — is the same one the hosted page
uses to decide whether to emit the HTML `required` attribute.** It is one question ("can this
field be missing from a submission we accept?") and asking it in two places is how two
surfaces drift. `tests/rules.test.mts` asserts the two agree field by field, and asserts that
the field's own declaration alone would have said otherwise.

**No rule structure ever reaches an agent.** The tests assert that `"then"`, `"op"` and
`"all"` never appear in the serialised tool: an agent must not be handed a structure it would
have to implement an evaluator for. The positive control — that a ruled document produces a
*different* tool from an unruled one, and that the tool's description mentions conditional
logic — is what proves those absence assertions could fail.

---

## 4. Cycles and contradictions — caught at edit time, blocking publish

`analyzeRules` runs inside `parseSchemaDocument`, which is what the builder already blocks
Publish on. Nothing new had to be wired into the editor for a cycle to be unpublishable, and
a committed JSON file gets the same treatment as the builder.

**Errors** (block publish — the ruleset has no meaning):

- `cycle` — the show/hide graph has a loop, so there is no order to read the rules in.
- `unknown_field` — a rule names a field nobody collects. Not merely wrong: an unanswered
  field is empty, so `is_empty` would be true and the rule would quietly start firing on every
  submission. This is the "deleted a field" case, and it becomes an error on the keystroke.
- `unsatisfiable` — a conjunction no answer can satisfy: two values demanded of one select, a
  numeric window with no numbers in it, unanswered-and-equal-to-something, an `equals` against
  an option value that no longer exists.
- `no_conditions` — a rule that would apply to every submission is not a rule, it is a change
  to the field.
- `no_actions`, `self_contradictory` (one rule showing and hiding the same field).

**Warnings** (never block — the rule means something, just not what its author probably meant):

- `dead_branch` — an unsatisfiable branch of an `or`; the rest of the rule still works.
- `hide_and_require` — the requirement never takes effect, because a hidden field is never
  required. Nothing is lost; the rule just says something it does not do.
- `duplicate_action`, `hidden_type_target`.

**What is deliberately not detected.** This is not a satisfiability solver. Contradictions are
found within a single conjunction over a single field. It will not notice that two separate
rules can never both fire because of something a third rule does. The bar is: everything it
reports is genuinely broken, and it never reports something that is fine.

**At runtime**, a stored ruleset an older build published is handled without an exception: a
rule naming a missing field is skipped *whole* (never partially applied), and a cycle degrades
the whole ruleset with a warning on the submission. An unreadable ruleset is dropped
**entirely** rather than per-rule — unlike fields, which are dropped individually — because a
ruleset with one rule missing is a form behaving in a way nobody authored.

---

## 5. The inspector

`src/components/app/builder/rules-inspector.tsx`, over `src/lib/rules/inspect.ts`.

Type in a set of answers and it shows:

- **Every rule, in the order it ran** — dependency order, and it says so when that differs
  from the order they are written in.
- **Every condition, with the value it actually read.** `"budget" is at least "50000" — read:
  nothing` is the entire explanation of most rules that did not fire.
- **Every effect, and whether it applied.** A rule can match and still do nothing, because a
  later rule overrode it or because the field it wanted to require was not being asked. A
  trace that only showed "matched" would be the half of the story that misleads.
- **Every field's final state, with the reason attached.** Read from the other end: "why is
  this hidden", answered without reading the ruleset.
- **Every answer on a field the rules hid** — named, and stated as kept and stored.

It adds no logic of its own. It calls `evaluateRules`. If it disagreed with the running form it
would be worse than useless.

Answers are typed in rather than sampled from real submissions on purpose: a rule is usually
wrong for an answer nobody has given yet, and real submissions only ever show the paths that
already work.

---

## 6. The builder

`rules-panel.tsx` edits a document-level list. A rule is a relation between fields — it reads
two and changes a third — so putting it on a field would mean either storing it twice or
picking one field to be its owner, and both are ways for a rule to disagree with itself. What
is per-field is how it *reads*, and that is the summary sentence on each card: *When
`budget` is `50k+`, show `procurement_contact`.*

The editor draws **one level** of grouping: all-of or any-of over a flat list of conditions.
The format nests arbitrarily. A rule loaded from a document that nests deeper is held verbatim
and shown read-only rather than flattened — flattening would silently change what it means —
and it round-trips byte for byte.

The value box is typed to the field it compares against: a `select` offers its own option
values rather than a free-text box, because the most common way conditional logic goes quietly
dead is a rule written against an option value that was later edited.

---

## 7. Never let a rule delete data

Stated separately because it outranks everything above.

- The evaluator has no branch that removes a value.
- The browser hides rows and never clears controls; hidden fields still submit.
- The server stores the answer and reports `answered_hidden_field` — a warning, never an
  error, in every mode.
- The inspector prints the held answer next to the hidden field.

The category's habit of quietly dropping the answer to a question it stopped asking is the
specific thing this is built not to do.

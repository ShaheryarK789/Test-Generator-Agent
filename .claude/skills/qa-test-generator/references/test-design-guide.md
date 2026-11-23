# Test design guide (Virtual QA Lead)

## 1. Analyse the requirements first
Before writing cases, build a requirement inventory:
- Give every testable statement an ID. Reuse the document's IDs (FR-1, US-12, AC-3) when present, otherwise create `REQ-001…`.
- For each one, note inputs, fields with constraints (length, range, format, required), states and transitions, business rules, error messages, integrations, **API endpoints**, **roles/permissions**.
- Record anything ambiguous or missing as an `openQuestion` and any gap you fill as an `assumption`. Never invent hard numbers silently.

## 2. Categories (every feature should get all four where meaningful)
| Category | What it proves | Techniques |
|---|---|---|
| **Positive** | Happy paths and valid alternatives work | Equivalence partitioning (valid classes), use-case main and alternate flows, each acceptance criterion |
| **Negative** | Invalid input or actions are rejected safely with the right message | Invalid equivalence classes, missing required fields, wrong format/type, unauthorised action, invalid state, injection strings (`' OR 1=1--`, `<script>`) |
| **Boundary** | Edges of every numeric, length, date, count or size limit | For a range [min,max]: min-1, min, min+1, max-1, max, max+1. For length: 0, 1, max, max+1. Dates: leap day, month end, timezone midnight |
| **Corner** | Unusual but realistic combinations and conditions | Concurrency or double submit, session timeout mid-flow, back button/refresh, network drop, unicode/emoji/RTL text, leading or trailing spaces, empty lists, very large datasets, simultaneous edits, locale/currency formats, first-time user, deleted or disabled referenced data |

Rules of thumb
- One condition per test case. Combine only in Corner cases on purpose.
- Boundary cases need concrete values in `testData` (e.g. "Amount = 10000.01").
- Expected results must be observable and specific: message text, status code, DB/UI state, audit entry. Never write "works correctly".

## 3. Criticality (High / Medium / Low)
| Level | Assign when the failure would… |
|---|---|
| **High** | block a core business flow, lose or corrupt data, cause money or compliance impact, or expose a security or permission hole. All authorisation-denial tests are High. Main happy path of each core feature is High. |
| **Medium** | break a secondary flow or a validation that has a workaround, give a wrong but recoverable message, or affect a common edge |
| **Low** | be cosmetic or rare, affect UI text/layout, or hit a rarely used optional field |

Aim for a realistic spread, roughly 25-40% High. If everything is High, nothing is.

## 4. API test cases (separate tab), only when the docs mention APIs, endpoints, REST, GraphQL, webhooks or integrations
For each endpoint and method, cover:
- **Positive:** valid request → correct status (200/201/204), response schema, field values, headers (Content-Type), persistence verified by a follow-up GET.
- **Negative:** missing or invalid auth → 401; insufficient role → 403; malformed JSON → 400; missing required field, wrong type, invalid enum → 400/422 with an error body; unknown resource → 404; wrong method → 405; duplicate → 409.
- **Boundary:** field min/max length and values, pagination (page=0, page=1, last page, limit max+1), payload size limit.
- **Corner:** idempotency or retry, concurrent updates, rate limiting → 429, expired token, special characters or unicode in payload, extra unknown fields, null vs missing.
Put method, endpoint, headers, body, expected status and expected response into their own fields.

## 5. Roles & permissions, only when the docs mention roles, user types, permissions, access levels or admin vs user
1. Build `roleMatrix`: every role × every permission or action. Unknown cells get `?` and an open question.
2. For each cell create a test: **Allowed** → Positive ("Editor can edit article"); **Denied** → Negative, criticality High ("Viewer cannot delete article: control hidden AND direct URL/API returns 403").
3. Add Corner cases: role change while logged in, user holding multiple roles, ownership rules ("own records only"), privilege escalation via direct URL or API or ID tampering (IDOR), disabled/deactivated user, audit logging of denied attempts.

## 6. Coverage self-check before building the workbook
- Every requirement ID is referenced by at least one case. Cases with no reference get the closest ID or a new `REQ-` with a note.
- Every feature has Positive and Negative cases. Every constrained field has Boundary cases.
- No duplicate titles or IDs. IDs: `TC-###`, `API-###`, `RBAC-###`.
- Titles are short, action-oriented and unique ("Reject transfer when amount exceeds 10,000.00").

# Test-case JSON contract

`scripts/build_testcases_xlsx.js` consumes exactly this shape. Write the file in UTF-8.
Only `testCases` (or one of the other case arrays) is mandatory; omit any section that
doesn't apply (no API in the requirements → omit `apiTestCases`; the API tab is then skipped).

```json
{
  "project": "Online Banking - Funds Transfer",
  "sourceDocuments": ["Transfer_PRD_v2.pdf", "https://confluence.example.com/x/ABC"],

  "requirements": [
    { "id": "REQ-001", "description": "User can transfer between own accounts" },
    { "id": "REQ-002", "description": "Transfer amount must be 1.00 - 10,000.00" }
  ],

  "testCases": [
    {
      "id": "TC-001",
      "module": "Funds Transfer",
      "title": "Transfer valid amount between own accounts",
      "category": "Positive",            // Positive | Negative | Corner | Boundary
      "criticality": "High",             // High | Medium | Low
      "type": "Functional",              // TestRail type: Functional, Security, Usability, Regression, ...
      "requirementRef": ["REQ-001"],     // string or array; drives Traceability + coverage chart
      "preconditions": "User logged in; has 2 active accounts; source balance >= 500",
      "testData": "Amount = 250.00",
      "steps": ["Open Transfers", "Select source and destination", "Enter 250.00", "Click Confirm"],
      "expected": "Success message shown; source -250.00, destination +250.00; transaction in history"
    }
  ],

  "apiTestCases": [
    {
      "id": "API-001",
      "module": "Transfers API",
      "title": "POST /transfers returns 201 for valid payload",
      "method": "POST",
      "endpoint": "/api/v1/transfers",
      "category": "Positive",
      "criticality": "High",
      "requirementRef": ["REQ-001"],
      "preconditions": "Valid bearer token for a customer with 2 accounts",
      "headers": { "Authorization": "Bearer <token>", "Content-Type": "application/json" },
      "requestBody": { "from": "ACC-1", "to": "ACC-2", "amount": 250.00 },
      "steps": ["Send request", "Validate status code", "Validate response schema"],
      "expectedStatus": 201,
      "expectedResponse": "Body has transferId (UUID), status=COMPLETED, amount=250.00"
    }
  ],

  "roleTestCases": [
    {
      "id": "RBAC-001",
      "module": "Funds Transfer",
      "title": "Viewer cannot initiate a transfer",
      "role": "Viewer",
      "permission": "Initiate transfer",
      "access": "Denied",                // Allowed | Denied
      "category": "Negative",
      "criticality": "High",
      "requirementRef": ["REQ-010"],
      "preconditions": "Logged in as Viewer",
      "steps": ["Navigate to Transfers", "Attempt to open New Transfer (UI) and POST /transfers (API)"],
      "expected": "Button hidden/disabled; API returns 403; no transfer created; attempt is audited"
    }
  ],

  "roleMatrix": {
    "roles": ["Admin", "Customer", "Viewer"],
    "permissions": [
      { "name": "Initiate transfer", "access": { "Admin": "Y", "Customer": "Y", "Viewer": "N" } },
      { "name": "View history",      "access": { "Admin": "Y", "Customer": "Y", "Viewer": "Y" } }
    ]
  },

  "assumptions":   ["Currency is single (USD) - not stated in PRD"],
  "openQuestions": ["Is the 10,000 limit per transaction or per day?"],
  "outOfScope":    ["Performance / load testing"]
}
```

Notes
- IDs must be unique across all arrays. The script warns on duplicates.
- `steps` may be an array (preferred, auto-numbered) or a single string.
- Values for `category` / `criticality` are case-insensitive; unknown values fall back to `Positive` / `Medium`, so get them right.
- `roleMatrix.access` accepts Y/N, Yes/No, Allowed/Denied; anything else is shown as-is (e.g. "Own records only"); missing = `?`.

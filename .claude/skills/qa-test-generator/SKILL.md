---
name: qa-test-generator
description: Virtual QA Lead. Turns requirement documents (PDF, Word .docx, Confluence pages or exports, Markdown, text, user stories, pasted text) into review-ready, TestRail-importable test cases in an Excel workbook. Covers positive, negative, corner and boundary cases, rates each High/Medium/Low, puts API tests in their own tab and role/permission tests in another when those are mentioned, and adds a doughnut-chart dashboard of distribution and coverage. Use when the user asks to generate, write or design test cases, a test suite or a QA test plan from requirements, specs, a PRD, a BRD, user stories or acceptance criteria, or asks for TestRail import files.
---

# Virtual QA Lead: requirements → test-case workbook

`SKILL_DIR` = the folder containing this file (`.claude/skills/qa-test-generator`).
The output folder defaults to `./output` in the project root unless the user names one.

## Workflow

### 1. Collect the requirements
| Source | How |
|---|---|
| `.pdf` | Use the Read tool directly (use `pages` for >10 pages), or `node "$SKILL_DIR/scripts/extract_text.js" file.pdf` |
| `.docx` | `node "$SKILL_DIR/scripts/extract_text.js" file.docx` |
| `.html`, `.md`, `.txt`, `.csv`, `.json` | Read tool (or the extract script for HTML) |
| Confluence URL | Try WebFetch. If it needs login, ask the user to export the page (… → Export → PDF/Word) or paste the text |
| Pasted text | Use it as is |

If `node_modules` is missing in `SKILL_DIR`, run `npm install --prefix "$SKILL_DIR"` once.
If the user gave no document and none is obvious in the working directory, ask for one.

### 2. Analyse, then design
Read `references/test-design-guide.md` and follow it. In short:
1. Build the requirement inventory (IDs, fields and constraints, rules, endpoints, roles).
2. Detect the **API** scope (endpoints, REST, payloads, status codes) → `apiTestCases`.
3. Detect the **roles/permissions** scope → `roleMatrix` + `roleTestCases`.
4. Write cases for every feature across **Positive / Negative / Corner / Boundary**, each with **High / Medium / Low** criticality, concrete test data and observable expected results.
5. Log ambiguities as `openQuestions` and gap-fills as `assumptions`.
6. Run the coverage self-check in section 6 of the guide.

Scale with the document: about 8-20 cases per feature is typical. Don't pad with near-duplicates.

### 3. Write the JSON
Write `output/<project-slug>_testcases.json` following `references/json-schema.md` exactly.
For large suites, write the file in parts (create, then append with Edit) instead of one huge write.

### 4. Build the workbook
```bash
node "$SKILL_DIR/scripts/build_testcases_xlsx.js" output/<slug>_testcases.json output/<slug>_TestCases.xlsx --csv
```
This produces:
- `<slug>_TestCases.xlsx` with the tabs **Dashboard** (summary tables plus 3-4 native doughnut charts: category, criticality, suite split, requirement coverage), **Functional Tests**, **API Tests**\*, **Role-Based Tests**\*, **Permission Matrix**\*, **Traceability**, **Assumptions & Questions**\* (\* only when there is data for them)
- `<slug>_TestCases_testrail_*.csv`: TestRail import files (Title, Section, Type, Priority, References, Preconditions, Steps, Expected Result, …)

If the script prints `UNCOVERED:` requirement IDs, add cases for them and rebuild.

### 5. Report back (keep it short)
- The paths of the xlsx and CSV files
- Counts: total, by suite, by category, by criticality, and coverage %
- The top open questions the BA or PO must answer
- How to import into TestRail: *Test Cases → Import → CSV*, template "Test Case (Text)", then map columns. Section values use `Module > Category` and can be mapped to section hierarchy.

## Quality bar
- Expected results are specific (exact message, status code, state change). Never "works as expected".
- Each case tests one condition, except deliberate Corner combinations.
- Boundary cases state the exact values tested.
- All permission-denial cases are High and check both the UI and direct URL/API access.
- Don't invent business numbers. If a limit isn't specified, add an open question and use a clearly labelled assumption.

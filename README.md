# Provide
Provide requirements in any form or doc even give confluence page url.

requirements → TestRail-ready test cases

## Watch a real run

https://github.com/user-attachments/assets/89ea268c-a674-4652-821e-bf104af19ef7


Runs entirely inside **Claude Code on your Claude subscription**. No API key is needed.

```
Test-Generator/
├── .claude/
│   ├── agents/virtual-qa-lead.md            ← (A) the AGENT
│   └── skills/qa-test-generator/            ← (B) the SKILL
│       ├── SKILL.md                         workflow
│       ├── references/test-design-guide.md  categories, criticality, API and RBAC rules
│       ├── references/json-schema.md        data contract
│       └── scripts/
│           ├── extract_text.js              PDF / DOCX / HTML → text
│           └── build_testcases_xlsx.js      JSON → Excel (+ doughnut charts) + TestRail CSV
├── samples/sample-requirements.md
└── output/                                  generated workbooks
```

## A: use the Agent
The agent runs in its own context, works through the whole job on its own and reports back.
```
claude
> Use the virtual-qa-lead agent on docs/Payments_PRD.pdf
> @virtual-qa-lead generate test cases from specs/*.docx and https://confluence.company.com/x/AbC
```
You can also run it non-interactively: `claude -p "Use the virtual-qa-lead agent to generate test cases for samples/sample-requirements.md"`

## B: use the Skill
The skill runs in your current conversation, so you can iterate with it ("add more boundary cases for amount").
```
> /qa-test-generator samples/sample-requirements.md
> Generate test cases from requirements.docx      ← loads automatically
```



## C: Web UI (QaseGenAI)
Double-click **`start-ui.bat`** (or run `node web/server.js`), then open **http://localhost:4600**.
- Drag and drop PDF, DOCX, MD, TXT, HTML, CSV or JSON files, paste user stories, or add Confluence URLs.
- Watch Claude work in a live activity feed.
- Browse the results: stat tiles, doughnut charts, and a searchable, filterable test-case explorer with Functional, API, Role-based, Permission matrix, Traceability and Questions tabs.
- Download the Excel workbook and TestRail CSVs. Every run is saved under **History**.

The server runs your logged-in `claude` CLI in headless mode (`claude -p`), so it uses your subscription. Claude's permissions are limited to reading and writing files in this project and running `node`.
Uploads are saved to `uploads/<run-id>/` and results to `output/<run-id>/`.

## Output
`output/<project>_TestCases.xlsx`
| Tab | Contents |
|---|---|
| **Dashboard** | Count tables + doughnut charts: by Category, by Criticality, by Suite, Requirement Coverage %, plus a Category × Criticality matrix |
| **Functional Tests** | Positive / Negative / Corner / Boundary, sorted by category, with colour-coded Category and Criticality columns and drop-downs |
| **API Tests** | Method, endpoint, headers, body, expected status and response (only if the docs mention APIs) |
| **Role-Based Tests** + **Permission Matrix** | Role × permission tests (only if the docs mention roles) |
| **Traceability** | Requirement → test cases, with uncovered requirements flagged |
| **Assumptions & Questions** | Gaps for the BA or PO to answer |

`output/<project>_TestCases_testrail_{functional,api,roles}.csv`: import with TestRail → *Test Cases → Import → CSV*, template "Test Case (Text)". Map Title, Section, Type, Priority, References, Preconditions, Steps and Expected Result. Section is `Module > Category`.

## Setup (one time)
Requires Node.js 18+. The dependencies are already installed. On a new machine, run:
`npm install --prefix .claude/skills/qa-test-generator`

To make them available in **every** project, copy `.claude/agents/virtual-qa-lead.md` to `~/.claude/agents/` and `.claude/skills/qa-test-generator/` to `~/.claude/skills/`.

## Supported inputs
PDF, Word (.docx; save legacy .doc as .docx first), Markdown, text, HTML, CSV/JSON, pasted text, and Confluence pages (public URLs are fetched; for pages behind a login, use *Export → PDF/Word*).

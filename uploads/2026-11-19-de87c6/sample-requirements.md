# Leave Management Portal – Requirements v2.0

## FR-1 Login
- Users log in with email and password.
- Password must be 8–20 characters, with at least one uppercase letter, one digit and one special character.
- After 5 consecutive failed attempts the account is locked for 15 minutes.

## FR-2 Apply for Leave
- Employees can apply for Annual, Sick or Unpaid leave.
- Start date cannot be in the past; end date must be on or after start date.
- A single request can be 1 to 30 days.
- Reason field is optional, max 250 characters.
- Annual leave cannot exceed the remaining balance (default 20 days/year).

## FR-3 Approve / Reject Leave
- Managers can approve or reject pending requests of their direct reports only.
- Rejection requires a comment (min 10 characters).
- Employee receives an email notification on approval/rejection.

## FR-4 Roles & Permissions
| Action | Employee | Manager | HR Admin |
|---|---|---|---|
| Apply for leave | Yes | Yes | Yes |
| Approve/reject team leave | No | Yes | Yes |
| Edit leave balances | No | No | Yes |
| View all employees' leave | No | Team only | Yes |

## FR-5 REST API
- `POST /api/v1/leaves` – create leave request (JWT required). Returns 201 with `leaveId`.
- `GET /api/v1/leaves/{id}` – fetch a leave request. 404 if not found.
- `PATCH /api/v1/leaves/{id}/status` – body `{ "status": "APPROVED|REJECTED", "comment": "..." }`. Managers/HR only.

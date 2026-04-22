# ToDo App - Full Stack with Email (Task 1 + Task 2)



---

 Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Docker Compose                     │
│                                                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────────┐  │
│  │ Frontend │───▶│ Backend  │───▶│  PostgreSQL   │  │
│  │  React   │    │ Node.js  │    │    (DB)       │  │
│  │ :5173    │    │ :3001    │    │   :5432       │  │
│  └──────────┘    └──────────┘    └──────────────┘  │
└─────────────────────────────────────────────────────┘
```

| Service    | Technology        | Port  |
|------------|-------------------|-------|
| **UI**     | React 18 + Vite   | 5173  |
| **API**    | Node.js + Express | 3001  |
| **DB**     | PostgreSQL 16     | 5432  |

---

## Quick Start

```bash
cd todo-app
docker compose up --build
# App: http://localhost:5173
```

Stop:
```bash
docker compose down        # keep DB data
docker compose down -v     # remove DB data too
```

---

## Project Structure

```
todo-app/
├── docker-compose.yml
├── README.md
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js            # Express + CRUD routes
│       └── emailRoutes.js      # SMTP / IMAP / POP3
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx             # Full UI
│       └── index.css
└── nginx/
    └── nginx.conf
```

---

## REST API (Task 1)

| Method | Endpoint     | Description      |
|--------|--------------|------------------|
| GET    | /api/tasks   | List all tasks   |
| GET    | /api/tasks/:id | Get by ID      |
| POST   | /api/tasks   | Create task      |
| PUT    | /api/tasks/:id | Update task    |
| DELETE | /api/tasks/:id | Delete task    |

### Task Schema
```json
{
  "id": 1,
  "title": "string",
  "description": "string",
  "status": "pending | in_progress | done",
  "priority": "low | medium | high",
  "due_date": "ISO timestamp",
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

---

## Email API (Task 2)

### SMTP — Send Email
```
POST /api/email/smtp/send
{ host, port, secure, user, password, to, subject, body }
```

### IMAP — Fetch Inbox (last 10 messages)
```
POST /api/email/imap/inbox
{ host, port, user, password, tls }
```

### POP3 — Check Mailbox (last 5 headers)
```
POST /api/email/pop3/check
{ host, port, user, password }
```

---

## Email Protocols

| Protocol | Purpose | Port | Library |
|----------|---------|------|---------|
| **SMTP** | Send emails | 587/465 | `nodemailer` |
| **IMAP** | Server-side mail sync | 993 | `imap` + `mailparser` |
| **POP3** | Download mail to client | 995 | Raw TCP/TLS socket |

### Gmail Setup
1. Enable 2FA on Google account
2. Google Account → Security → **App Passwords**
3. Generate password for "Mail"
4. Use settings:
   - SMTP: `smtp.gmail.com:587`
   - IMAP: `imap.gmail.com:993`
   - POP3: `pop.gmail.com:995`

---

## UI 

- Task list with status icons + priority color-coding
- Create / Edit / Delete tasks via modal
- Detail view (click any task row)
- Email panel with SMTP / IMAP / POP3 tabs

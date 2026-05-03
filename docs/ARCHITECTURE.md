# Architecture

## Overview

The platform is a microservices system consisting of four Node.js services, three stateful infrastructure components, and a queue-driven async pipeline for document processing.

```
┌─────────────────────────────────────────────────────────────────┐
│                        NGINX Ingress                            │
│   /api/*  →  backend:3001                                       │
│   /notary-api/*  →  notarization:3002                          │
│   /*  →  frontend:3000                                          │
└─────────────┬──────────────────┬───────────────────────────────┘
              │                  │
     ┌────────▼───────┐  ┌───────▼──────────┐
     │  Backend API   │  │ Notarization Svc │
     │  Express :3001 │  │  Express :3002   │
     └────────┬───────┘  └───────┬──────────┘
              │                  │
              ▼                  ▼
     ┌────────────────────────────────────┐
     │         Redis (BullMQ)             │
     │  translation-queue                 │
     │  notarization-queue                │
     └──────────────┬─────────────────────┘
                    │
           ┌────────▼────────┐
           │    Workers      │
           │ (BullMQ, Ollama)│
           └─────────────────┘
```

---

## Services

### 1. Backend API (`backend/`, port 3001)

The primary REST API. Handles all user-facing operations.

**Responsibilities:**
- User registration and login (bcrypt + JWT)
- Document upload to MinIO, metadata saved to MongoDB
- Stripe payment checkout session creation and webhook handling
- Enqueueing jobs to `translation-queue` after payment confirmation
- Notary routes (list documents, sign) — mirrored in notarization service

**Key routes:**

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Create user account |
| POST | `/api/auth/login` | Login, receive JWT |
| POST | `/api/documents/upload` | Upload file, create Document record |
| POST | `/api/payments/create-checkout` | Create Stripe checkout session |
| POST | `/api/payments/webhook` | Stripe webhook → enqueue translation |
| GET | `/api/notary/documents` | List documents for notary |
| POST | `/api/notary/sign/:id` | Mark document as notarized |

**Auth:** JWT in `Authorization: Bearer <token>` header. Middleware in `src/middleware/auth.js` verifies token and attaches `req.user`. Role check via `requireRole('notary')`.

**File uploads:** Multer receives multipart, streams to MinIO bucket. Object key stored in `document.originalFile`.

---

### 2. Frontend (`frontend/`, port 3000)

Next.js 14 App Router application. TypeScript + TailwindCSS.

**Pages:**

| Route | Description |
|---|---|
| `/` | Landing page |
| `/register` | Registration form |
| `/login` | Login form |
| `/upload` | Document upload + language selection |
| `/dashboard` | User's documents list with statuses |
| `/document/[id]` | Document detail, download translated file |
| `/payment/success` | Post-Stripe redirect |
| `/payment/cancel` | Cancelled payment |
| `/notary` | Notary cabinet — list + sign documents |

**API communication:** `lib/api.ts` wraps axios with base URL and JWT header injection from localStorage.

---

### 3. Workers (`workers/`, no HTTP port)

Background processing service. Runs BullMQ workers, no HTTP server exposed.

**Queues consumed:**

| Queue | Job | Action |
|---|---|---|
| `translation-queue` | `translate` | Download original file from MinIO, send to Ollama for translation, save translated file to MinIO, update document status, enqueue to `notarization-queue` |

**AI Translation:** Calls local Ollama instance (configured via `OLLAMA_URL`). Sends document text chunks, receives translated text, reassembles into PDF.

**After translation:** Enqueues `{ documentId }` into `notarization-queue`.

**Scaling:** Runs 3 replicas in Kubernetes, HPA configured to scale 2–10 based on CPU (70% threshold).

---

### 4. Notarization Service (`notarization/`, port 3002)

Dedicated service for the notarization workflow. Separated from backend to allow independent scaling and deployment.

**Responsibilities:**
- Consuming `notarization-queue`: set document status to `notarizing`, send email to notary via Resend
- REST API for notary actions (protected by JWT + `notary` role)

**Queue worker flow:**

```
job arrives { documentId }
     │
     ├─► Document.findByIdAndUpdate(id, { status: 'notarizing' })
     │
     └─► resend.emails.send({ to: NOTARY_EMAIL, ... })
```

**Key routes:**

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/api/notary/documents` | Documents with status `notarizing` or `notarized` |
| POST | `/api/notary/sign/:documentId` | Set status `notarized` |

**Email:** Uses Resend API (`RESEND_API_KEY`). On free plan, sender must use `onboarding@resend.dev` and recipient must be the account owner's email until a domain is verified at resend.com/domains.

---

## Data Model

### Document

```
Document {
  _id:            ObjectId
  userId:         ObjectId  → ref User
  status:         enum [ 'pending' | 'uploaded' | 'paid' | 'translating'
                        | 'translated' | 'notarizing' | 'notarized'
                        | 'failed' ]
  fromLang:       String    (ISO 639-1, e.g. 'ru')
  toLang:         String    (ISO 639-1, e.g. 'en')
  originalFile:   String    (MinIO object key)
  translatedFile: String    (MinIO object key)
  createdAt:      Date
  updatedAt:      Date
}
```

### User

```
User {
  _id:          ObjectId
  email:        String  (unique, lowercase)
  passwordHash: String  (bcrypt)
  role:         enum [ 'user' | 'notary' ]
  createdAt:    Date
}
```

### Payment

```
Payment {
  _id:             ObjectId
  userId:          ObjectId
  documentId:      ObjectId
  stripeSessionId: String
  amount:          Number
  currency:        String
  status:          enum [ 'pending' | 'completed' | 'failed' ]
  createdAt:       Date
}
```

---

## Infrastructure

### MongoDB

- Version: 7
- ODM: Mongoose
- Single node in development; StatefulSet (1 replica) in Kubernetes
- All four services share one MongoDB instance, same database

### Redis

- Version: 7-alpine
- Used exclusively as BullMQ transport
- `maxRetriesPerRequest: null` required by BullMQ
- StatefulSet (1 replica) in Kubernetes

### MinIO

- S3-compatible object storage
- Stores original uploaded files and translated output files
- Ports: 9000 (S3 API), 9001 (web console)
- Credentials: `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY`
- PVC: 10Gi in Kubernetes

---

## Kubernetes Layout

```
namespace: translation-notarization

Deployments:
  backend       — 2 replicas, port 3001
  notarization  — 1 replica,  port 3002
  workers       — 3 replicas  (HPA: 2–10, CPU 70%)
  minio         — 1 replica,  ports 9000/9001

StatefulSets:
  mongodb       — 1 replica, port 27017
  redis         — 1 replica, port 6379

HPA:
  workers       — minReplicas: 2, maxReplicas: 10, CPU: 70%

Ingress (NGINX):
  /api/*         → backend:3001
  /notary-api/*  → notarization:3002
  /*             → frontend:3000
```

---

## Security

- Passwords hashed with bcrypt (10 rounds)
- JWT signed with `JWT_SECRET`, verified on every protected request
- Role-based access: `requireRole('notary')` middleware guards notary endpoints
- `.env` excluded from Docker images via `.dockerignore`
- Kubernetes secrets stored base64-encoded in `k8s/secrets.yaml` — replace with Sealed Secrets or Vault in production
- MinIO credentials rotated via environment variables, not hardcoded

---

## CI/CD

GitHub Actions pipeline (`.github/workflows/ci.yml`):

```
push/PR to main
     │
     ├─► lint (matrix: backend, workers, notarization, frontend)
     │       ESLint if configured, else Next.js lint
     │
     ├─► test (needs: lint)
     │       Services: MongoDB + Redis via job containers
     │       Playwright E2E against all four running services
     │       Uploads playwright-report as artifact
     │
     └─► build (needs: lint, parallel matrix)
             docker build for each service
             BuildKit cache via GitHub Actions cache
             Images tagged with git SHA
```

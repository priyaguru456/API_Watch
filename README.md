# APIWatch — API Monitoring and Reliability Platform

APIWatch is a modern, developer-centric API monitoring, uptime tracking, and reliability platform. It allows engineering teams to continuously monitor their APIs and websites, run automated health checks, measure response latency, detect degradation, manage incidents, and receive real-time alerts.

---

## Features

- **Continuous Health Checks:** Automated scheduled polling of HTTP/HTTPS endpoints and websites.
- **Latency & Uptime Tracking:** High-precision tracking of response times, status codes, and availability metrics.
- **Anomaly & Failure Detection:** Instant detection of downtime, 4xx/5xx HTTP errors, and latency spikes.
- **Incident Lifecycle Management:** Automatically create, acknowledge, update, and resolve incidents.
- **Real-Time Alerting:** Notify engineering teams across channels (Email, Webhooks) when services go down.
- **Performance Analytics:** Historical uptime charts, latency percentiles (p50, p95, p99), and SLA reporting.
- **Multi-Service Catalog:** Group and manage monitoring targets by environment, service tier, and tags.

---

## Technology Stack

### Frontend
- **Framework:** React.js (JavaScript, JSX)
- **Build Tool:** Vite
- **Styling:** Tailwind CSS
- **Routing:** React Router DOM
- **HTTP Client:** Axios
- **Server State Management:** TanStack Query (React Query)
- **Forms & Validation:** React Hook Form + Zod (`@hookform/resolvers`)
- **Visualizations:** Recharts
- **Icons:** Lucide React

### Backend
- **Runtime:** Node.js (ES Modules, `"type": "module"`)
- **Framework:** Express.js
- **Database:** PostgreSQL
- **ORM:** Prisma ORM
- **Authentication:** JWT (JSON Web Tokens) + bcrypt
- **Request Validation:** Zod
- **Security & Logging:** Helmet, CORS, Morgan

### Future Infrastructure
- Redis & BullMQ (Background worker and scheduler)
- Docker & Nginx
- Playwright & Vitest

---

## Project Structure

```text
APIWatch/
│
├── frontend/                     # React.js Vite Frontend Application
│   ├── public/                   # Static assets
│   ├── src/
│   │   ├── app/                  # Router and application providers
│   │   ├── layouts/              # Dashboard, Auth, and Marketing layouts
│   │   ├── pages/                # Page components (Dashboard, Services, Incidents, etc.)
│   │   ├── components/           # Reusable UI, Navigation, Charts, Tables
│   │   ├── services/             # Axios API client and feature API endpoints
│   │   ├── hooks/                # Custom React hooks
│   │   ├── context/              # React Context (AuthContext)
│   │   ├── utils/                # Date, formatters, and helper utilities
│   │   ├── constants/            # Routes and configuration constants
│   │   ├── validation/           # Client-side Zod validation schemas
│   │   ├── main.jsx              # React DOM entry point
│   │   ├── App.jsx               # Application root component
│   │   └── index.css             # Global styles and Tailwind directives
│   ├── vite.config.js            # Vite configuration
│   └── package.json              # Frontend dependencies and scripts
│
├── backend/                      # Node.js Express Backend Application
│   ├── src/
│   │   ├── server.js             # HTTP server listener
│   │   ├── app.js                # Express app configuration & middleware pipeline
│   │   ├── config/               # Environment, database (Prisma), logger, security configs
│   │   ├── routes/               # Centralized API route index
│   │   ├── middleware/           # Error, not-found, auth, validation, rate-limit middlewares
│   │   ├── modules/              # Feature modules (auth, users, services, monitoring, etc.)
│   │   ├── services/             # Cross-cutting services (email, notifications, encryption)
│   │   └── utils/                # ApiError, asyncHandler, ApiResponse helpers
│   ├── prisma/                   # Prisma schema and migrations
│   ├── tests/                    # Backend unit and integration tests
│   └── package.json              # Backend dependencies and scripts (ES Modules)
│
├── docs/                         # Architecture, API specifications, and guides
├── scripts/                      # Developer and deployment automation scripts
├── tests/                        # End-to-end integration test suites
├── .gitignore                    # Git ignore rules for node_modules, env, logs
├── .env.example                  # Environment variable reference template
├── README.md                     # Project documentation
└── package.json                  # Root convenience scripts (non-monorepo)
```

---

## Environment Setup

1. Copy the environment template into both `backend/` and `frontend/`:
   ```bash
   cp .env.example backend/.env
   cp .env.example frontend/.env
   ```
2. Configure `backend/.env`:
   - `PORT=5000`
   - `DATABASE_URL=postgresql://user:password@localhost:5432/apiwatch_db?schema=public`
   - `JWT_SECRET=your_secret_key_here`
   - `CORS_ORIGIN=http://localhost:5173`
3. Configure `frontend/.env`:
   - `VITE_API_BASE_URL=http://localhost:5000/api/v1`

---

## Installation & Setup

Install dependencies separately in `backend` and `frontend`:

### 1. Backend Setup
```bash
cd backend
npm install
```

### 2. Frontend Setup
```bash
cd frontend
npm install
```

---

## Development Commands

### Running Backend
```bash
cd backend
npm run dev
```
Backend starts on `http://localhost:5000`. Test health endpoint:
```bash
curl http://localhost:5000/api/v1/health
```

### Running Frontend
```bash
cd frontend
npm run dev
```
Frontend development server starts on `http://localhost:5173`.

### Building Frontend for Production
```bash
cd frontend
npm run build
npm run preview
```

---

## Git Workflow

- **Default Branch:** `main`
- **Branches:** Create feature branches from `main` (e.g., `feature/monitoring-engine`).
- **Commits:** Follow conventional commit messages (e.g., `feat: add endpoint health checks`).

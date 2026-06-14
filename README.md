# EdgeTest AI 🧪

> AI Agent that makes tests risk-aware and traceable

[![Capgemini AgentifAI Buildathon](https://img.shields.io/badge/Capgemini-AgentifAI%20Buildathon-blue?style=flat-square)](https://www.capgemini.com)
[![Problem #38](https://img.shields.io/badge/Problem-%2338%20Automated%20Test%20Generator-orange?style=flat-square)]()
[![Team Trident Tech](https://img.shields.io/badge/Team-Trident%20Tech-green?style=flat-square)]()

---

## 🏆 Capgemini Exceller AgentifAI Buildathon 2025

| | |
|---|---|
| **Team** | Trident Tech |
| **College** | Sona College of Technology |
| **Problem** | #38 — Automated Test Case Generator |
| **Tagline** | *"From More Tests to Smarter Testing"* |

---

## 🎯 Problem Statement

Modern software teams ship code faster than they can write tests. Coverage metrics are gamed with trivial assertions, regressions slip through, and nobody knows which functions are truly risky until production breaks.

**EdgeTest AI** solves this with an intelligent agent that:
- Automatically generates unit and integration tests from source code **or** plain-English user stories
- Scores every function's risk so your team tests the right things first
- Traces every test back to its source function and original requirement
- Verifies tests actually pass by executing them in an isolated Docker sandbox

---

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| 🛡️ **Risk-Based Testing** | 5-factor weighted formula scores every function 0–100 so high-risk code gets maximum test coverage |
| 🔗 **Traceability Matrix** | Every generated test maps to its source function and the original requirement or user story |
| 🐳 **Docker Sandbox** | Tests execute inside an isolated container with no network access and a 256 MB memory cap |
| 🤖 **7-Step AI Pipeline** | Ingest → Analyze → Risk Score → Generate → Trace → Execute → Export |
| 📊 **6 Export Formats** | GitHub Actions YAML, PDF, XLSX, DOCX, JSON, and HTML report |
| 💬 **User Story Input** | Paste a Jira ticket or plain-English requirement and get tests from natural language |
| 🔍 **Monaco Code Editor** | In-browser syntax-highlighted editor with language detection |
| 📈 **Eval & Observability** | Built-in evaluation panel with LLM call timing, token usage, and pass-rate tracking |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        PRESENTATION LAYER                    │
│          Next.js 14 (App Router) + TypeScript + TailwindCSS  │
│     Monaco Editor │ Recharts │ Radix UI │ TanStack Query      │
└───────────────────────────┬─────────────────────────────────┘
                            │ REST / HTTP
┌───────────────────────────▼─────────────────────────────────┐
│                         API LAYER                            │
│              FastAPI + Python 3.11 + Uvicorn                 │
│    /ingest │ /analyze │ /sandbox │ /export │ /report         │
└───────────┬───────────────────────────┬─────────────────────┘
            │                           │
┌───────────▼──────────┐   ┌───────────▼─────────────────────┐
│      AI CHAIN LAYER  │   │         EXECUTION LAYER          │
│  5 LangChain chains  │   │   Docker Sandbox (edgetest-      │
│  + GPT-4o via OpenAI │   │   sandbox image, --network none) │
│  Pydantic v2 schemas │   │   pytest + Jest + JSON reports   │
└───────────┬──────────┘   └─────────────────────────────────┘
            │
┌───────────▼──────────────────────────────────────────────────┐
│                       PERSISTENCE LAYER                       │
│   PostgreSQL 16 (sessions, test runs, traceability)          │
│   Redis 7 (Celery task queue + result cache)                 │
└──────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript, TailwindCSS, Monaco Editor |
| Backend | Python FastAPI, LangChain, OpenAI GPT-4o |
| AI Chains | 5 LangChain chains with Pydantic v2 validation |
| Database | PostgreSQL 16, Redis 7 |
| Code Analysis | tree-sitter (Python + JavaScript grammars), regex (Java, C#, C++) |
| Sandbox | Docker, pytest, Jest, JUnit 5, xUnit, Google Test |
| CI/CD Export | GitHub Actions, Jinja2 templates |
| Auth | GitHub OAuth + NextAuth.js + JWT |
| Export | WeasyPrint (PDF), openpyxl (XLSX), python-docx (DOCX) |

### Supported Languages

| Language | Extensions | Test Framework | Sandbox Image |
|----------|-----------|----------------|---------------|
| Python | `.py` | pytest | `edgetest-sandbox:latest` |
| JavaScript | `.js` `.jsx` | Jest | `edgetest-sandbox:latest` |
| TypeScript | `.ts` `.tsx` | Jest + ts-jest | `edgetest-sandbox:latest` |
| Java | `.java` | JUnit 5 + Mockito | `edgetest-sandbox-jvm:latest` |
| C# (.NET) | `.cs` | xUnit + Moq | `edgetest-sandbox-dotnet:latest` |
| C++ | `.cpp` `.cc` `.cxx` `.h` `.hpp` | Google Test | `edgetest-sandbox-cpp:latest` |

---

## 🚀 Quick Start

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (running)
- [Node.js 20+](https://nodejs.org/)
- [Python 3.11+](https://www.python.org/)
- OpenAI API Key — [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- GitHub OAuth App — [github.com/settings/developers](https://github.com/settings/developers)

### Installation

**1. Clone the repository**
```bash
git clone https://github.com/your-org/edgetest-ai.git
cd edgetest-ai
```

**2. Configure environment**
```bash
cp .env.example .env
# Edit .env and fill in OPENAI_API_KEY, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET,
# NEXTAUTH_SECRET, and JWT_SECRET at minimum
```

**3. Build the sandbox images**
```bash
# Python + JavaScript/TypeScript (required)
docker build -f backend/Dockerfile.sandbox -t edgetest-sandbox:latest .

# Java — JUnit 5 (optional, required for Java sandbox execution)
docker build -f backend/Dockerfile.sandbox.jvm -t edgetest-sandbox-jvm:latest .

# C# / .NET — xUnit (optional, required for C# sandbox execution)
docker build -f backend/Dockerfile.sandbox.dotnet -t edgetest-sandbox-dotnet:latest .

# C++ — Google Test (optional, required for C++ sandbox execution)
docker build -f backend/Dockerfile.sandbox.cpp -t edgetest-sandbox-cpp:latest .
```

**4. Start all services**
```bash
docker compose up --build
```

**5. Run database migrations**
```bash
docker compose exec backend alembic upgrade head
```

**6. Open the app**

Navigate to [http://localhost](http://localhost) — the Nginx proxy routes to the Next.js frontend.

### Local Development (without Docker)

**Backend**
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # fill in values
uvicorn main:app --reload --port 8000
```

**Frontend**
```bash
cd frontend
npm install
cp .env.example .env.local    # fill in NEXTAUTH_* and NEXT_PUBLIC_API_URL
npm run dev
```

---

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | ✅ | OpenAI API key — [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `GITHUB_CLIENT_ID` | ✅ | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | ✅ | GitHub OAuth App Client Secret |
| `NEXTAUTH_SECRET` | ✅ | Random 32-byte string: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | ✅ | `http://localhost:3000` (local) or your deployed URL |
| `JWT_SECRET` | ✅ | Random 32-byte string: `openssl rand -base64 32` |
| `DATABASE_URL` | ✅ | PostgreSQL connection string (asyncpg driver) |
| `REDIS_URL` | ✅ | Redis connection string |
| `ANTHROPIC_API_KEY` | ⬜ | Optional — for future Claude model support |
| `SENTRY_DSN` | ⬜ | Optional — Sentry error tracking DSN |

See `.env.example` for the full list with inline documentation.

---

## 📋 How It Works

The 7-step pipeline runs sequentially, with each step persisted to PostgreSQL so you can resume or re-export at any time.

| Step | Name | What Happens |
|------|------|--------------|
| **1** | 🔍 Ingest | Paste source code or upload a file. tree-sitter parses it into an AST, extracting every function, class, method, parameter, and import. |
| **2** | 🧠 Analyze | A LangChain discovery chain identifies all testable scenarios — happy paths, edge cases, error conditions, and boundary values. |
| **3** | 🛡️ Risk Score | A 5-factor weighted formula (see below) assigns a 0–100 risk score and HIGH/MEDIUM/LOW tier to focus testing effort. |
| **4** | 📝 Generate | GPT-4o generates pytest (Python) or Jest (JS/TS) test files for your selected scenarios, validated with AST checks before saving. |
| **5** | 🔗 Trace | A traceability matrix links every test case to its source function and the originating requirement or user story. |
| **6** | 🐳 Execute | Generated tests run inside an isolated Docker container. Results (pass/fail/error) are parsed and stored in PostgreSQL. |
| **7** | 📤 Export | Download your test suite as GitHub Actions YAML, PDF report, XLSX spreadsheet, DOCX document, or raw JSON. |

---

## 🔬 Risk Scoring Formula

```
RISK_SCORE = (Complexity × 0.20)
           + (Business Impact × 0.25)
           + (Dependency Depth × 0.15)
           + (Coverage Gap × 0.20)
           + (Security Sensitivity × 0.20)
```

Each factor is scored 0–100 by GPT-4o, informed by static AST metrics computed locally:

| Factor | Weight | What it measures |
|--------|--------|-----------------|
| **Complexity** | 20% | Cyclomatic complexity, nesting depth, number of branches and loops |
| **Business Impact** | 25% | Financial, data integrity, user-facing, or compliance impact |
| **Dependency Depth** | 15% | External libraries, database calls, API dependencies |
| **Coverage Gap** | 20% | Likelihood of untested paths, edge cases, and error branches |
| **Security Sensitivity** | 20% | Presence of auth, password, token, payment, encryption, or admin operations |

**Security Floor Rule:** Functions handling authentication, payments, or secrets always warrant maximum testing, regardless of cyclomatic complexity:
- `security_sensitivity ≥ 90` → minimum score clamped to 72 (HIGH)
- `security_sensitivity ≥ 70` → minimum score clamped to 45 (MEDIUM)

**Risk Levels and Recommended Test Types:**

| Level | Score | Test Types |
|-------|-------|-----------|
| 🔴 HIGH | ≥ 70 | Unit + Integration + Edge + Negative + Security + Mutation + Business Rules |
| 🟡 MEDIUM | 40–69 | Unit + Integration + Edge |
| 🟢 LOW | < 40 | Unit + Smoke |

---

## 📸 Screenshots

> _Screenshots below show the full 7-step wizard flow._

| Step | Screenshot |
|------|-----------|
| **Step 1 — Ingest** | Paste code or upload a file; language auto-detected |
| **Step 2 — Analyze** | Scenario discovery with completeness scoring |
| **Step 3 — Risk Score** | Risk dashboard with factor breakdown and HIGH/MED/LOW badge |
| **Step 4 — Generate** | Monaco editor showing generated test files |
| **Step 5 — Traceability** | Matrix view linking tests → functions → requirements |
| **Step 6 — Execute** | Sandbox run results with pass/fail/error counts |
| **Step 7 — Export** | Format selector and download links |

---

## 👥 Team

| Name | Role |
|------|------|
| **Vijay B** | Team Lead & AI Agent Architect |
| **Sanjai Kumar K** | Backend & Infrastructure |
| **Syed Moin Peeran** | AI & Risk Scoring |
| **Syed Salman Shahul** | Frontend & UX |
| **Subash M** | QA & CI/CD |

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  Built with ❤️ by <strong>Team Trident Tech</strong> · Sona College of Technology<br/>
  Capgemini Exceller AgentifAI Buildathon 2025
</p>

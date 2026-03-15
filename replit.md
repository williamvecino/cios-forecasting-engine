# CIOS — Clinical Intelligence & Outcome System

## Purpose
Full-stack Bayesian HCP adoption forecasting engine derived from the CIOSv19 Excel workbook. Translates prior probability → posterior probability using validated clinical signals and a 6-actor behavioral reaction model.

## Core Formula (from workbook ProbabilityEngine sheet)
```
posterior_odds = prior_odds × signal_LR_product × EXP(net_actor_translation / 2)
current_probability = posterior_odds / (1 + posterior_odds)
```

**Actor reaction per signal:**
```
raw_reaction = direction_sign × ((strength + reliability) / 10) × response_factor × outcome_orientation × pharma_multiplier
net_actor_effect[actor] = sum(raw_reaction[signal]) × influenceWeight
net_actor_translation = sum(net_actor_effect[all actors])
```

**Confidence levels:**
- Low: 0 signals
- Developing: <3 signals
- Moderate: |net_actor_translation| < 0.15
- High: otherwise

## Architecture
- **Monorepo**: pnpm workspaces
- **Frontend**: `artifacts/cios-frontend` — React + Vite + Tailwind + Recharts + React Query
- **Backend**: `artifacts/api-server` — Express 5 + TypeScript, serves `/api`
- **Database**: PostgreSQL (Drizzle ORM) — `lib/db`
- **API Spec**: OpenAPI 3.1 + orval codegen — `lib/api-spec`, `lib/api-client-react`, `lib/api-zod`
- **Engine modules**: `artifacts/api-server/src/lib/`
  - `forecast-engine.ts` — Core Bayesian calculation
  - `pharma-logic.ts` — PharmaLogic 4-table modifier system
  - `analog-engine.ts` — Analog case similarity scoring
  - `seed-data.ts` — Workbook sample data (ARIKAYCE/NTM)

## Database Tables
- `cases` — Forecast case headers
- `signals` — Signal register per case
- `actors` — Actor configuration (6 canonical actors)
- `specialty_actor_sets` — Per-specialty actor profiles
- `case_library` — Historical analog cases
- `calibration_log` — Forecast prediction/outcome ledger
- `scenarios` — Hypothetical signal scenarios
- `guidance` — Strategic guidance items
- `field_intelligence` — Field intelligence inbox
- `watchlist` — Signal monitoring watchlist

## API Routes (all under `/api`)
- `GET/POST /cases` — Forecast cases
- `GET/PUT/DELETE /cases/:id` — Case CRUD
- `GET/POST /cases/:id/signals` — Signal register
- `PUT/DELETE /signals/:id` — Signal CRUD
- `GET /cases/:id/forecast` — Run forecast engine
- `GET /actors`, `PUT /actors/:id` — Actor weights
- `GET /specialty-profiles` — Available specialty profiles
- `GET/POST /case-library` — Analog case library
- `GET /cases/:id/analogs` — Retrieve top analog matches
- `GET /calibration`, `POST /calibration/:id/outcome` — Calibration log
- `GET /calibration/stats` — Calibration statistics
- `GET/POST /scenarios` — Scenario simulation
- `GET/POST /guidance` — Strategic guidance
- `GET/POST /field-intelligence` — Field intelligence
- `GET/POST /watchlist` — Signal watchlist
- `GET /specialty-profiles` — Specialty actor profiles
- `POST /seed` — Seed database with workbook sample data

## Frontend Pages
- `/` — Executive Dashboard (probability gauge, active cases, calibration health)
- `/cases` — Question Engine (case list + create new case)
- `/cases/:id/signals` — Signal Register (add/view signals per case)
- `/cases/:id/forecast` — Forecast Engine (Bayesian chain, actor profile, signal drivers)
- `/cases/:id/analogs` — Analog Retrieval (top matching historical cases)
- `/case-library` — Case Library (manage analog cases)
- `/calibration` — Calibration (prediction log, Brier scores, outcome recording)
- `/field-intelligence` — Field Intelligence (MSL/field submissions)
- `/watchlist` — Signal Watchlist (upcoming signal monitoring)

## Sample Data (from workbook)
- **CASE-001**: ARIKAYCE (NTM/Pulmonology), prior: 45%, posterior: ~60.3%, confidence: High
- **3 signals**: CS-001 (Clinical evidence +LR 1.32), CS-002 (Field intelligence -LR 0.68), CS-003 (Access/commercial +LR 1.40)
- **4 analog cases**: Pulmonology rare-disease, Cardiology device, Infectious disease, COPD/bronchiectasis

## Key Design Decisions
- PharmaLogic uses 6×N multiplier tables (signal type × actor index) + keyword adjustments capped at 1.6
- Analog similarity scoring: weighted dimensions (therapy area 25%, specialty 20%, product type 15%, evidence 15%, access 10%)
- Forecast automatically saves to calibration_log on each run
- Database auto-seeded via POST /api/seed (idempotent — checks for existing data)
- Integration-ready: MIOS/OHOS flags on each signal, routing checks on forecast output

## Workflows
- `artifacts/api-server: API Server` — Express on port 8080, serves `/api`
- `artifacts/cios-frontend: web` — Vite dev server, serves `/`

# CIOS — Clinical Intelligence & Outcome System

## Overview
CIOS is a disease-agnostic, asset-agnostic, and specialty-flexible Bayesian forecasting platform designed to predict HCP (Healthcare Professional) adoption. It translates prior probabilities into posterior probabilities using validated clinical signals and a 6-actor behavioral reaction model. The platform is capable of forecasting for any medication, device, diagnostic, therapeutic area, specialty, or geography. Its core purpose is to provide an AI-powered, data-driven approach to understanding and predicting market adoption, offering insights into stakeholder behavior and market dynamics.

## User Preferences
I prefer clear and concise information. I appreciate high-level summaries before diving into details. When implementing features, prioritize modular and maintainable code. For architectural decisions, provide the rationale. I expect the agent to ask for clarification if there are ambiguities in my requests and to inform me about significant changes or design choices before proceeding.

## System Architecture
The CIOS platform is built as a monorepo using pnpm workspaces.
The frontend is developed with React, Vite, Tailwind, Recharts, and React Query, located in `artifacts/cios-frontend`.
The backend, `artifacts/api-server`, is an Express 5 application written in TypeScript, serving APIs under the `/api` endpoint.
Data persistence is handled by PostgreSQL, utilizing the Drizzle ORM through `lib/db`.
API specifications are defined using OpenAPI 3.1, with `orval` codegen generating client and validation libraries.

**Core Features and Implementations:**
- **Bayesian Forecast Engine:** Implemented in `forecast-engine.ts`, this module calculates posterior probabilities using prior odds, a signal Likelihood Ratio (LR) product, and an exponential net actor translation.
- **Signal Detection & Review:** An AI-powered layer extracts candidate signals from various documents, followed by a workflow for review, confirmation, or rejection. A signal completeness check ensures 14-domain coverage.
- **Actor Behavioral Model:** A 6-actor (KOL, HCP, Payer, Patient, Administrator, Competitor) model adjusts forecasts based on their reactions to signals. The `agent-engine.ts` simulates 7 archetypes with cross-agent influence, feeding into the Bayesian posterior.
- **Calibration Learning Loop:** The system includes a sophisticated calibration mechanism that tracks outcomes, computes Brier scores and mean forecast errors. It features `lr_corrections` for signal-type-level bias and `bucket_corrections` for probability-space additive adjustments across four probability buckets. Calibration logic includes guardrails like recency-weighted means and various warning flags.
- **Hierarchical Calibration Fallback:** For low-data regions, a 4-level deterministic hierarchy (local_segment → global_bucket → signal_type_only → raw) ensures robust calibration.
- **Learning Coverage Expansion:** A four-piece adaptive learning system includes a `Case Acquisition Planner` to identify data gaps, a `Question-Type Taxonomy` for analysis, `Resolved-Case Ingestion` for historical data, and `Learning Impact Simulation` for predicting calibration improvements.
- **Analog Retrieval:** The `analog-engine.ts` provides a 30-case calibrated analog library across 7 therapy areas, matching cases via Jaccard token scoring on various attributes.
- **Decision-Path Actor Modeling:** A separate module, `lib/decision-path-engine.ts`, defines 5 HCP archetypes with specific signal sensitivities, hesitation rules, and action thresholds to model conviction and behavior, distinct from the main forecast engine.
- **Forecast Portfolio:** The `portfolio-engine.ts` allows evaluating multiple strategic questions against the same signal set, applying per-question hierarchical calibration for comprehensive analysis.
- **Strategic Questions Engine & Challenge Mode:** Generates structured intelligence questions and provides an adversarial critique mechanism to challenge forecast assumptions.

**UI/UX Decisions:**
- **Aaru-like Decision Interface (Phase 1 Complete):** The frontend uses question-driven, decision-oriented language throughout. All Bayesian/forecast jargon has been replaced with accessible terminology:
  - Dashboard: "Your Strategic Questions" with question-first presentation, portfolio gauge, track record, system status
  - Forecast page: "Likelihood Assessment" (not "Posterior Probability"), "Baseline/Shift" (not "Prior/Delta"), "Starting Point → Evidence Strength → Stakeholder Response → Overall Outlook" computation chain, "Key Evidence Drivers", "Assessment Trace/Challenge"
  - Signals page: "Evidence Register" with "Evidence weight" column
  - Sidebar nav: Dashboard, Questions, Signals, Forecast Ledger, Calibration
  - **Question Detail page** (`/cases/:caseId`) — 6-panel enterprise decision layout with visual hierarchy:
    1. **Question Header** (compact, un-carded) — breadcrumb nav (Dashboard > Questions > Detail), strategic question, tags, time horizon, confidence badge, last updated timestamp
    2. **Primary Forecast Card** (HERO, biggest) — scaled gauge, 5xl probability, prior/change/confidence, interpretation line, "Engine v1 · Bayesian" provenance
    3. **Key Drivers** (compact sidebar, 2/5 width) — positive + negative drivers with High/Medium/Low impact badges, "Ranked by likelihood ratio impact" provenance
    4. **Signal Stack** (dense, operational) — compressed table with direction/strength/reliability bars, "Validated" status, signal count provenance
    5. **Scenario Simulator** (second biggest, 3/5 width) — Best/Base/Risk presets, 2-column signal toggles, backend-only recomputation, Base→Scenario→Delta results, "Scenario output · backend computed" label
    6. **Recommended Action** (compact, decisive) — headline, rationale, Monitor/Risk split, "Derived from probability band · adapter v1" provenance
  - Recommendation logic isolated in `src/lib/recommendation-adapter.ts` (swappable for real API)
  - Per-panel loading, error, and empty states (PanelLoading/PanelError)
  - Cases index question rows link to detail page via "View Detail" CTA + clickable question title
  - Backend adapter: `POST /api/cases/:caseId/scenario-simulate` (no engine changes)
  - "Engine ready / All systems operational" footer
- Information is presented with clarity, using structured tables, collapsible sections, and color-coded indicators for warnings and priorities.
- All backend APIs and engine behavior remain completely unchanged — this is a UI-only transformation.

## API/UI Contract Layer
The `@workspace/contracts` package (`lib/contracts/src/index.ts`) defines the canonical typed interfaces shared between backend and frontend:
- **CaseSummary** — GET /api/cases, GET /api/cases/:id
- **ForecastDetailResponse** — GET /api/cases/:id/forecast (includes signalDetails, actorAggregation, hierarchicalCalibration, interpretation, sensitivityAnalysis)
- **ForecastSignalDetail** — individual signal within forecast response
- **SignalDetail** — GET /api/cases/:id/signals
- **ScenarioSimulationRequest/Response** — POST /api/cases/:id/scenario-simulate
- **Recommendation** — frontend adapter output (isolated in recommendation-adapter.ts, swappable for backend endpoint)
- **CalibrationSummary** — GET /api/calibration/stats
- **HierarchicalCalibration, CalibrationConfidence, ForecastActorAggregation, ForecastAgentSummary** — nested forecast sub-types

The detail page (`cases/detail.tsx`) imports and casts to these contracts — zero `any` types in the component.

**UI freeze rule**: Layout, hierarchy, navigation, and page purpose are structurally frozen. Only cosmetic refinements or state handling changes are allowed in the UI going forward.

## Signal Taxonomy (10 types)
Canonical source: `lib/db/src/lr-config.ts` (SIGNAL_TYPES, LR_RANGES), `lib/db/src/agent-config.ts` (SignalTypeKey, SIGNAL_AGENT_WEIGHTS).
Frontend copy: `artifacts/cios-frontend/src/lib/lr-config.ts`. Discovery prompt: `artifacts/api-server/src/routes/discover.ts`.

| Signal Type | LR Range | Direction |
|---|---|---|
| Phase III clinical | 1.8–2.5 | Supports adoption |
| Guideline inclusion | 1.7–2.2 | Supports adoption |
| KOL endorsement | 1.2–1.4 | Supports adoption |
| Field intelligence | 0.8–1.3 | Bidirectional |
| Operational friction | 0.6–0.9 | Constraining |
| Competitor counteraction | 0.7–0.9 | Constraining |
| Access / commercial | 1.1–1.6 | Supports adoption |
| Regulatory / clinical | 1.3–2.0 | Supports adoption |
| **Access friction** | 0.5–0.85 | Constraining |
| **Experience infrastructure** | 1.1–1.5 | Supports adoption |

**REMS taxonomy mapping**: REMS burden/certification/documentation/monitoring → Access friction. REMS simplification/integrated support/digital workflow → Experience infrastructure. No separate REMS or AI signal type.

## Forecast Ledger
Tracking and evaluation layer — records predictions and compares them with real outcomes for calibration measurement.
- **Schema**: `lib/db/src/schema/forecast-ledger.ts` → `forecast_ledger` table
- **Routes**: `artifacts/api-server/src/routes/forecast-ledger.ts`
- **Contract**: `ForecastLedgerEntry`, `ResolveOutcomeRequest` in `@workspace/contracts`

API endpoints:
- `GET /api/forecast-ledger` — list all ledger entries
- `GET /api/forecast-ledger/:predictionId` — single entry
- `GET /api/cases/:caseId/forecast-ledger` — entries for a specific case
- `POST /api/cases/:caseId/record-forecast` — snapshot current probability into ledger (body: `{ timeHorizon, expectedResolutionDate? }`)
- `PATCH /api/forecast-ledger/:predictionId/resolve` — resolve with outcome (body: `{ actualOutcome: 0|1, resolutionDate? }`); auto-computes `predictionError`

Calibration bucketing: probabilities bucketed into 10% ranges (0–10%, 10–20%, …, 90–100%) on record. Does NOT modify the forecasting engine — purely a tracking layer.

## Strategic Narrative Generator
Deterministic template-based narrative formatter — converts forecast outputs into publication-ready analytical narratives.
- **Generator**: `artifacts/api-server/src/lib/narrative-generator.ts` (pure function, no side effects)
- **Route**: `artifacts/api-server/src/routes/narrative.ts`
- **Contract**: `StrategicNarrative` in `@workspace/contracts`

API endpoint: `GET /api/cases/:caseId/narrative`

Output sections: headline, coreForecastStatement, supportingDrivers, risksAndCounterSignals, interpretation, strategicImplication, whatWouldChangeTheForecast. Links to Forecast Ledger predictionId if available. Does NOT modify any engine outputs — read-only formatter.

## Signal Watchlist
Anticipation/monitoring layer that tracks upcoming external events likely to generate meaningful forecast signals.
- **Schema**: `lib/db/src/schema/signal-watchlist.ts` → `signal_watchlist` table
- **Routes**: `artifacts/api-server/src/routes/signal-watchlist.ts`
- **Contract**: `SignalWatchlistEntry` in `@workspace/contracts`
- **Status values**: Upcoming, Monitoring, Occurred, Closed

API endpoints:
- `GET /api/signal-watchlist` — list all watchlist entries
- `GET /api/signal-watchlist/:watchEventId` — single entry
- `GET /api/cases/:caseId/signal-watchlist` — entries for a specific case
- `POST /api/signal-watchlist` — create new event (body: `{ eventType, eventName, caseId?, ... }`)
- `PATCH /api/signal-watchlist/:watchEventId` — update event fields/status
- `DELETE /api/signal-watchlist/:watchEventId` — remove event

Event types supported: trial readouts, congress presentations, guideline updates, regulatory decisions, advisory committees, competitor launches, payer decisions, publications. Does NOT auto-generate signals — tracking only.

## External Dependencies
- **PostgreSQL:** Primary database for all persistent data.
- **Express 5:** Backend web framework.
- **React, Vite, Tailwind, Recharts, React Query:** Frontend development stack.
- **Drizzle ORM:** Object-Relational Mapper for database interaction.
- **OpenAPI 3.1 & orval:** API specification and code generation tools.
# CIOS — Clinical Intelligence & Outcome System

## Purpose
Disease-agnostic, asset-agnostic, specialty-flexible Bayesian HCP adoption forecasting platform derived from the CIOSv19 Excel workbook. Works for any medication, device, diagnostic, therapeutic area, specialty, or geography. Translates prior probability → posterior probability using validated clinical signals and a 6-actor behavioral reaction model.

**ARIKAYCE, CardioAsset X, and OncoDevice Y are demo seed cases only — the engine has no brand identity.**

## Key Features
- **Signal Detection Layer** — AI-powered extraction of candidate signals from pasted documents (press releases, trial summaries, conference notes, regulatory updates, etc.)
- **Signal Review Workflow** — Detected → Confirm / Edit / Reject (with inline edit on all three states) → Confirmed signals auto-feed forecast
- **Signal Completeness Check** — 14-domain coverage analysis with high-priority warnings before forecast runs
- **Bayesian Forecast Engine** — Prior × Signal LR Product × Stakeholder Response → Posterior
- **Actor Behavioral Model** — 6-actor adjustment (KOL, HCP, Payer, Patient, Administrator, Competitor)
- **Agent Simulation Layer** — 7-archetype stakeholder reaction model with cross-agent influence (8 peer-influence rules). Agent-derived actor translation now feeds directly into the Bayesian posterior when signals are present; static Bayesian remains available as a comparison baseline
- **Analog Retrieval** — 30-case calibrated analog library across 7 therapy areas (CNS/Psychiatry, Cardiology, Immunology/Derm, Rare Disease, Endocrinology, Oncology, Infectious Disease). Matching on therapy area + specialty + diseaseState + product type + evidence type via Jaccard token scoring
- **Analog Context** — Analog-context endpoint derives optimistic/base/pessimistic scenario frames from calibrated analog outcomes for the current case
- **Pattern Intelligence** — Rule-based classification of 5 recurring adoption patterns from Case Library
- **Outcome Recording** — Record actual adoption rate + notes on forecast page → Publish to Case Library closes the learning loop
- **Signal Register** — Full CRUD with inline edit (pencil icon) and delete confirm
- **Calibration Learning Loop** — Outcome tracking with Brier score / mean forecast error; `lr_corrections` table captures signal-type-level bias; auto-triggers correction recomputation after each recorded outcome (≥5 cases, |meanError| > 10pp threshold, ±20% cap)
- **Signal Freshness Decay** — `exp(−λ × ageMonths)` applied per signal type at forecast time (λ = 0.06 for Phase III clinical evidence → 0.35 for field intelligence)
- **Bucket Calibration (Layer 2)** — Probability-space additive correction downstream of LR corrections. 4 buckets: 0.40-0.60, 0.60-0.75, 0.75-0.90, 0.90+. Triggers at n≥3 calibrated cases with |meanError|>8pp; ±15pp cap. `bucket_corrections` DB table; auto-triggered on every outcome recording. `rawProbability` and `bucketCorrectionApplied` exposed in forecast response
- **Calibration Guardrails** — Bucket corrections use recency-weighted mean (exponential decay λ=0.1, most recent outcomes weighted heavier). `bucket_corrections` table tracks `meanAbsoluteError`, `previousDirection`, `flipCount`, `lowSampleWarning` (n<5), `directionFlipWarning` (direction changed vs last update), `recencyWeighted` flag
- **Calibration Diagnostics Panel** — `GET /calibration/diagnostics` returns per-bucket: sampleSize, meanSignedError, meanAbsoluteError, correctionPp, isActive/belowThreshold, all warning flags, lastUpdated. Also returns aggregate pre/post calibration means and full case-level breakdown. Rendered as a structured table on the Calibration page (expanded by default)
- **Validation Report** — `GET /calibration/validation-report` returns per-case raw vs calibrated vs actual comparison, bucket-level improvement verdicts, therapy area + question-type breakouts (with segmented verdict detecting mixed behaviour), coverage check, and overall improving/degrading/insufficient verdict. Rendered as collapsible section on Calibration page
- **Coverage Map** — `GET /calibration/coverage-map` returns a maturity grid (none/low/medium/high) by bucket × therapy area and bucket × question type. Exposes per-cell n, correctionActive, lowSampleWarning, bucketThresholdMet
- **Forecast Trace Mode** — `GET /cases/:caseId/trace` returns structured audit: topPositiveDrivers + topNegativeDrivers (ranked by |LR-1|, top 3 each), actorBottleneck (lowest netActorEffect), analogSupport (library match count + coverage note), calibrationSummary (raw→calibrated shift, bucket correction, LR correction count, warnings), fragileAssumption, **caseContext** (therapeuticArea, diseaseState, specialty, questionType, caseMode), **coverageNote**. Rendered as collapsible audit card on forecast page
- **Case Context Integrity** — every forecast snapshot embeds `_caseContext` (therapeuticArea, diseaseState, specialty, strategicQuestion, timeHorizon, caseMode, actorContext, forecastDate). Historical rows without it are enriched at query time via join on cases table. `lib/case-context.ts` provides `deriveQuestionType()`, `enrichCalibrationWithMetadata()`, `getCoverageNote()`
- **Sparse-Region Intelligence** — multi-layer calibration discipline for low-data regions:
  - **Hierarchical Calibration Fallback** (`lib/calibration-fallback.ts`): 4-level deterministic hierarchy: local_segment (therapyArea × bucket, n≥3, |meanError|>8pp) → global_bucket → signal_type_only → raw. Replaces simple bucket lookup in `forecasts.ts`. Every forecast + trace exposes `hierarchicalCalibration.fallbackLevel` + `fallbackReason` + local/global n counts + correctionApplied
  - **Segment Confidence Score** (`computeSegmentConfidence`): structured high/medium/low confidence score separate from forecast probability. Factors: localSegmentN, globalBucketN, correction stability (flipCount/directionFlipWarning), caseProfileSimilarity. Exposed in forecast response and trace as `calibrationConfidence.level` + `calibrationConfidence.reason`
  - **Coverage-Aware Trace Enrichment**: Forecast Trace card now shows confidence badge in header (green/blue/amber), Hierarchical Calibration Fallback block (level badge + n counts + reason), Calibration Confidence block (level + reason + stats), Nearest Calibrated Segment (shown when local segment not used)
  - **Expansion Targets Panel** (`GET /calibration/expansion-targets`): identifies highest-priority case-library gaps by therapy area, bucket, question type. Returns totalForecasts, resolvedCases, unresolvedCases, gapScore (0–1) per group with criticalGaps count. Rendered as collapsible panel on calibration page with gap bars and red highlighting for 0-resolved segments
- **Error Patterns** — `GET /calibration/error-patterns` returns signal-type and actor-level mean forecast error + Brier score breakdown. Rendered as horizontal bar chart on Calibration page with "By Signal Type" / "By Actor" tabs
- **Strategic Questions Engine** — Generates 5 structured intelligence questions per case from the latest calibration snapshot: reversal_risk, bottleneck_actor, threshold_movement, missing_signal, confidence_stress. Each rated high/medium urgency with a "why" explanation. Rendered on forecast page
- **Forecast Challenge Mode** — Structured adversarial critique: tooOptimistic/tooPessimistic arguments + evidence, missingEvidence domains, single most fragile assumption. Rendered on forecast page below Strategic Questions

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
- `cases` — Forecast case headers (+ actualAdoptionRate, actualOutcomeNotes, outcomeRecordedAt, outcomePublishedToLibrary)
- `signals` — Signal register per case
- `actors` — Actor configuration (6 canonical actors)
- `specialty_actor_sets` — Per-specialty actor profiles
- `case_library` — Historical analog cases (+ signalMix JSONB, agentPattern JSONB, sourceCaseId)
- `agent_simulations` — Per-case agent reaction simulation results (agentResults JSONB, adoptionSequence JSONB)
- `candidate_signals` — Signal Detection staging table (pending/approved/rejected workflow)
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
- `/cases/:id/signals` — Signal Register (full CRUD with inline edit + delete confirm)
- `/cases/:id/discover` — Signal Detection (Document Intake → AI extraction → Review Queue → Confirm/Edit/Reject)
- `/cases/:id/forecast` — Forecast Engine (Bayesian chain, actor profile, signal drivers, + Outcome Recording section)
- `/cases/:id/analogs` — Analog Retrieval (top-5 matches + Pattern Intelligence section)
- `/cases/:id/agents` — Agent Simulation (7-archetype reaction model + Adoption Sequence + Influence Matrix)
- `/case-library` — Case Library (manage analog cases)
- `/calibration` — Calibration (prediction log, Brier scores, outcome recording)
- `/field-intelligence` — Field Intelligence (MSL/field submissions)
- `/watchlist` — Signal Watchlist (upcoming signal monitoring)

## Agent Simulation Architecture
- **Config**: `lib/db/src/agent-config.ts` — 7 archetypes (id, label, role, motivations, decisionDrivers, inertia, responseSpeed, influenceScore, isAdversarial, stanceLabels) + 8×7 signal-agent weight matrix
- **Engine**: `artifacts/api-server/src/lib/agent-engine.ts` — `simulateAgents(signals[]) → SimulationOutput`
  - Computes `baseEffect` per signal (LR-based signed effect)
  - Weights by `SIGNAL_AGENT_WEIGHTS[signalType][agentId]` and `(1 - inertia * 0.5)`
  - Maps reaction score to stance (adversarial agents use inverted score)
  - Derives responsePhase (early/mainstream/lagging) from stance + responseSpeed
  - Computes adoption sequence and overall readiness narrative
- **Routes**: `POST /api/cases/:caseId/simulation` (run), `GET /api/cases/:caseId/simulation` (fetch latest)
- Simulation is deterministic — no AI/ML. Results are saved to `agent_simulations` table.

## Learning Layer (Concrete, not vague AI)
1. **Case Memory**: `case_library` table stores completed cases with signal mix (JSONB), agent pattern, outcome notes, final probability
2. **Analog Retrieval**: `analog-engine.ts` scores similarity on 7 weighted dimensions (therapy area, specialty, product type, evidence type, payer environment, lifecycle stage, brand)
3. **Pattern Summaries**: `GET /api/patterns` — 5 rule-based patterns detected by keyword matching against case library text fields
4. **Outcome Recording**: Forecast page → "Record Outcome" → PATCH /api/cases/:id/outcome → "Publish to Case Library" → POST /api/cases/:id/publish-to-library (assembles case into library entry including signal mix JSONB)

## Signal LR Configuration
- **LR config module**: `lib/db/src/lr-config.ts` (backend) and `artifacts/cios-frontend/src/lib/lr-config.ts` (frontend)
- Each signal type has a configured LR range (min/max); LR is interpolated from strength, credibility, scope, and timing
- Signal types: Phase III clinical (1.8–2.5), Guideline inclusion (1.7–2.2), KOL endorsement (1.2–1.4), Field intelligence (0.8–1.3), Operational friction (0.6–0.9), Competitor counteraction (0.7–0.9), Access / commercial (1.1–1.6), Regulatory / clinical (1.3–2.0)
- Signals table has `scope` (local/regional/national/global) and `timing` (early/current/late) columns
- Attribute weights: strength 35%, credibility 30%, scope 20%, timing 15%

## Sample Data (from workbook)
- **CASE-001**: ARIKAYCE (NTM/Pulmonology), prior: 45%
- **3 signals**: CS-001 (Phase III clinical +LR 2.39), CS-002 (Operational friction -LR 0.81), CS-003 (Access/commercial +LR 1.53)
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

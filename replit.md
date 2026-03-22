# CIOS — Clinical Intelligence & Outcome System

## Overview
CIOS is a disease-agnostic, asset-agnostic, and specialty-flexible Bayesian forecasting platform designed to predict Healthcare Professional (HCP) adoption. It translates prior probabilities into posterior probabilities using validated clinical signals and a 6-actor behavioral reaction model. The platform is capable of forecasting for any medication, device, diagnostic, therapeutic area, specialty, or geography, providing an AI-powered, data-driven approach to understanding and predicting market adoption and stakeholder behavior.

## User Preferences
I prefer clear and concise information. I appreciate high-level summaries before diving into details. When implementing features, prioritize modular and maintainable code. For architectural decisions, provide the rationale. I expect the agent to ask for clarification if there are ambiguities in my requests and to inform me about significant changes or design choices before proceeding.

## System Architecture
The CIOS platform is a monorepo built with pnpm workspaces. The frontend uses React, Vite, Tailwind, Recharts, and React Query. The backend is an Express 5 application in TypeScript, serving APIs under `/api`. Data persistence is managed by PostgreSQL with Drizzle ORM. API specifications are defined using OpenAPI 3.1, with `orval` for client and validation library generation.

**Core Features:**
- **Bayesian Forecast Engine:** Calculates posterior probabilities using prior odds, correlation-aware signal likelihood ratio products, and an exponential net actor translation.
- **Signal Detection & Review:** AI-powered extraction of candidate signals with a workflow for review, confirmation, or rejection, ensuring 14-domain coverage and data validation.
- **Actor Behavioral Model:** A 6-actor model (KOL, HCP, Payer, Patient, Administrator, Competitor) adjusts forecasts based on reactions to signals.
- **Calibration Learning Loop:** Tracks outcomes, computes Brier scores and forecast errors, and applies `lr_corrections` and `bucket_corrections` for bias adjustment.
- **Hierarchical Calibration Fallback:** Ensures robust calibration in low-data regions through a 4-level deterministic hierarchy.
- **Learning Coverage Expansion:** An adaptive learning system including a `Case Acquisition Planner`, `Question-Type Taxonomy`, `Resolved-Case Ingestion`, and `Learning Impact Simulation`.
- **Analog Retrieval:** Provides a 30-case calibrated analog library for matching cases via Jaccard token scoring.
- **Decision-Path Actor Modeling:** Defines 5 HCP archetypes with specific signal sensitivities and action thresholds.
- **Forecast Portfolio:** Allows evaluating multiple strategic questions against the same signal set.
- **Strategic Questions Engine & Challenge Mode:** Generates structured intelligence questions and provides an adversarial critique mechanism.
- **Forecast Ledger:** Tracks predictions and compares them with real outcomes for calibration measurement.
- **Strategic Narrative Generator:** Converts forecast outputs into publication-ready analytical narratives using a deterministic template.
- **Signal Watchlist:** Tracks upcoming external events likely to generate meaningful forecast signals.
- **Weekly Strategic Brief:** Provides an aggregated read-only summary of current system state.
- **Competitor Behavior Register:** Structured intelligence layer for tracking competitor strategic behaviors.
- **Target Resolution Layer:** Hierarchical targeting (market → specialty → subspecialty → institution → physician). Cases have a `targetType` field; signals have a `signalScope` field. The forecast engine filters signals by scope eligibility before computing. An `eventFamilyId` field prevents over-stacking signals from the same event family. Target entities are managed via CRUD routes at `/api/target-entities`.
- **Forecast Interpretation Panel:** `ForecastInterpretationPanel` component on case detail page. Three priority bands (Execute strategy >70%, Reduce uncertainty 50-70%, Identify barriers <50%) plus 5-level probability labels (Strong momentum ≥85%, Favorable ≥70%, Uncertain/developing ≥50%, At-risk ≥35%, Low likelihood <35%). Confidence-sensitive summaries, driver-aware next actions, target-aware language (market/segment/account/physician), geography- and time-horizon-aware refinement suggestions, and optional `cautionNote` for low-confidence forecasts. Logic in `deriveForecastInterpretation()` in `recommendation-adapter.ts`. No backend changes.
- **National Adopter Discovery Agent:** Bounded agent for discovering U.S. physician/institution adoption candidates. Parses strategic questions to extract therapy area, geography, target type, specialty. Generates deterministic candidate pools with structured signals (specialty match, trial participation, publication activity, etc.). Features: question input form, candidate shortlist with prep-score ranking, per-signal validation gate (validate/defer/reject), per-candidate actions (send-to-CIOS/hold/remove), missing-data flags, evidence completeness tracking. Send-to-CIOS creates a new case with LR=1.0 (neutral) so the CIOS engine computes real LRs. DB tables: `discovery_runs`, `discovery_candidates`, `discovery_candidate_signals`. API routes at `/api/discovery-*`. Frontend at `/discovery` with sidebar item "Adopter Discovery".
- **Signal Lifecycle & Audit System:** Signals follow a lifecycle: `candidate → reviewed → validated → active → archived/rejected`. Human-created signals default to `active`; system/agent-created signals default to `candidate`. Transition endpoint: `POST /api/signals/:signalId/transition { action }`. Validation gates enforce required fields (`sourceLabel`, `observedAt`) before `validated`/`active` status. All transitions and edits are audit-logged in `audit_logs` table (accessible via `GET /api/audit-logs`). Forecast engine, scenario adapter, and portfolio routes filter signals to `status="active"` only. Signal schema includes: `status`, `createdByType`, `createdById`, `strength`/`reliability` (text labels), `sourceLabel`, `sourceUrl`, `evidenceSnippet`, `observedAt`, `notes`, `updatedAt`. Valid transitions exported from `lib/db/src/schema/signals.ts`.
- **Signal Review Queue:** Frontend page at `/review` with sidebar item "Signal Review". Features: status filter pills with counts, search bar, signal type/question/source filters, signal table with status badges, detail drawer with full signal fields, inline editing (PATCH endpoint), lifecycle transition actions, validation issue warnings, and audit history timeline. Supports the full signal lifecycle workflow from candidate through activation.
- **Signal Detection Agent:** Bounded agent that scans user-provided source text, extracts candidate signals using GPT-4o, classifies them (type, direction, strength, scope, confidence), and matches them to existing forecast cases. Does NOT update posterior probability or insert signals into active cases — all outputs are candidate signals for human review. DB tables: `detection_runs`, `detected_signals`, `signal_case_suggestions`. API routes at `/api/detection-runs`, `/api/detected-signals`. Frontend at `/signal-detection` under Evidence section. Supports: multi-source input, optional therapy area/geography/specialty filters, case matching with confidence levels, manual case linking, validate/reject/defer actions. Signal types: Clinical, Access, Regulatory, KOL, Operational, Competitor, Safety, InstitutionalReadiness, ReferralBehavior.

**URL Structure (case-scoped routing):**
- `/dashboard` — Strategic overview (redirected from `/`)
- `/cases` — Forecast case list with ForecastActionsMenu per card
- `/case/:caseId/question` — Case detail / question view
- `/case/:caseId/signals` — Active signals for a case
- `/case/:caseId/pending-signals` — Pending signals review for a case
- `/case/:caseId/scenario` — Agent-based scenario simulation
- `/case/:caseId/ledger` — Forecast results/ledger
- `/case/:caseId/agents/detection` — Signal detection agent (case-scoped)
- `/case/:caseId/agents/hygiene` — Signal hygiene audit
- `/case/:caseId/agents/refinement` — Question refinement agent (stub)
- `/case/:caseId/agents/message` — Message impact agent (stub)
- `/case/:caseId/discover`, `/case/:caseId/analogs`, `/case/:caseId/portfolio` — Discovery, analogs, portfolio
- `/review` — Global signal review queue
- `/signal-detection` — Global signal detection console
- `/discovery` — Adopter discovery
- `/calibration` — Calibration learning
- `/case-library` — Forecast ledger (global)
- API routes remain at `/api/cases/...` (unchanged)

**ForecastActionsMenu:** Dropdown on each case card with 11 actions in 4 sections (Question, Signals, Forecast, Intelligence), each navigating to the appropriate case-scoped route.

**UI/UX Decisions:**
The frontend employs an "Aaru-like Decision Interface" with question-driven, decision-oriented language, replacing Bayesian/forecast jargon with accessible terminology.
- **Dashboard:** "Your Strategic Questions" with question-first presentation, portfolio gauge, track record, and system status.
- **Forecast Page:** "Likelihood Assessment", "Baseline/Shift", and a structured computation chain ("Starting Point → Evidence Strength → Stakeholder Response → Overall Outlook").
- **Signals Page:** "Evidence Register" with an "Evidence weight" column.
- **Question Detail page:** A 6-panel enterprise decision layout presenting question header, primary forecast card, key drivers, signal stack, scenario simulator, and recommended action.
- Information is presented with clarity using structured tables, collapsible sections, and color-coded indicators.

## External Dependencies
- **PostgreSQL:** Primary database.
- **Express 5:** Backend web framework.
- **React, Vite, Tailwind, Recharts, React Query:** Frontend development stack.
- **Drizzle ORM:** Object-Relational Mapper.
- **OpenAPI 3.1 & orval:** API specification and code generation.
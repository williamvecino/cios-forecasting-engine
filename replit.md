# CIOS — Clinical Intelligence & Outcome System

## Overview
CIOS is a disease-agnostic, asset-agnostic, and specialty-flexible Bayesian forecasting platform designed to predict Healthcare Professional (HCP) adoption. It translates prior probabilities into posterior probabilities using validated clinical signals and a 6-actor behavioral reaction model. The platform forecasts for any medication, device, diagnostic, therapeutic area, specialty, or geography, providing an AI-powered, data-driven approach to understanding and predicting market adoption and stakeholder behavior.

## User Preferences
I prefer clear and concise information. I appreciate high-level summaries before diving into details. When implementing features, prioritize modular and maintainable code. For architectural decisions, provide the rationale. I expect the agent to ask for clarification if there are ambiguities in my requests and to inform me about significant changes or design choices before proceeding.

## System Architecture
The CIOS platform is a monorepo built with pnpm workspaces. The frontend uses React, Vite, Tailwind, Recharts, and React Query. The backend is an Express 5 application in TypeScript, serving APIs under `/api`. Data persistence is managed by PostgreSQL with Drizzle ORM. API specifications are defined using OpenAPI 3.1, with `orval` for client and validation library generation.

**Core Features:**
- **Bayesian Forecast Engine:** Calculates posterior probabilities using prior odds, correlation-aware signal likelihood ratio products, and an exponential net actor translation.
- **Signal Detection & Review:** AI-powered extraction of candidate signals with a workflow for review, confirmation, or rejection, ensuring 14-domain coverage and data validation.
- **Actor Behavioral Model:** A 6-actor model (KOL, HCP, Payer, Patient, Administrator, Competitor) adjusts forecasts based on reactions to signals.
- **Calibration Learning Loop:** Tracks outcomes, computes Brier scores and forecast errors, and applies bias adjustments.
- **Hierarchical Calibration Fallback:** Ensures robust calibration in low-data regions through a 4-level deterministic hierarchy.
- **Learning Coverage Expansion:** An adaptive learning system including a `Case Acquisition Planner`, `Question-Type Taxonomy`, `Resolved-Case Ingestion`, and `Learning Impact Simulation`.
- **Analog Retrieval:** Provides a 30-case calibrated analog library for matching cases via Jaccard token scoring.
- **Decision-Path Actor Modeling:** Defines 5 HCP archetypes with specific signal sensitivities and action thresholds.
- **Forecast Portfolio:** Allows evaluating multiple strategic questions against the same signal set.
- **Strategic Questions Engine & Challenge Mode:** Generates structured intelligence questions and provides an adversarial critique mechanism.
- **Forecast Ledger:** Tracks predictions and compares them with real outcomes for calibration measurement.
- **Strategic Narrative Generator:** Converts forecast outputs into publication-ready analytical narratives using a deterministic template.
- **Signal Watchlist:** Tracks upcoming external events likely to generate meaningful forecast signals.
- **Competitor Behavior Register:** Structured intelligence layer for tracking competitor strategic behaviors.
- **Target Resolution Layer:** Manages hierarchical targeting (market → specialty → subspecialty → institution → physician) with scope-based signal filtering.
- **Forecast Interpretation Panel:** Provides confidence-sensitive summaries, driver-aware next actions, and refinement suggestions.
- **National Adopter Discovery Agent:** A bounded agent for discovering U.S. physician/institution adoption candidates based on strategic questions and structured signals.
- **Signal Lifecycle & Audit System:** Manages signal status transitions with audit logging for all changes.
- **Signal Taxonomy:** Defines 10 core signal types organized into 3 groups (evidence, market, execution) with a mapping for legacy types.
- **Signal Review Queue:** A dedicated frontend page for managing the full signal lifecycle.
- **Forecast Environment Adjustment Layer:** A post-calibration module that applies safe multipliers based on 7 environmental factors to refine forecasts.
- **Signal Detection Agent:** A bounded agent that scans user-provided source text to extract and classify candidate signals for human review.

**Navigation & Information Architecture:**
Top-level navigation includes Home, Forecasts, Library, and System, organizing various tools and workflows. A 4-step workflow (Define Question → Add Information → See Forecast → Decide) guides users through the forecasting process.

**UI/UX Decisions:**
The frontend employs an "Aaru-like Decision Interface" with question-driven, decision-oriented language. Key design patterns include a question definition layer, a workflow test harness, a forecast readiness gate, a redesigned forecast page with a dark panel theme and four tabs (Current Forecast, Scenario Planning, Driver Impact, Case Library), an "Evidence Register" for signals, and a 6-panel enterprise decision layout for question details. Information is presented using structured tables, collapsible sections, and color-coded indicators.

**Workflow Gating:**
All pages use `QuestionGate` to block content when no active question exists. The sidebar step completion checkmarks require `hasActiveQuestion` to prevent false positive indicators. The question parser supports a comprehensive verb list for subject extraction, including medical/pharma-specific actions, with a fallback pattern. The outcome extractor covers 30+ outcome categories. Both subject and outcome default to reasonable values to minimize blocked Continue buttons.

**Draft vs Active Case Isolation:**
Strict separation between `draftQuestion` (in-progress text) and `activeCase` (previously submitted question stored in localStorage). This ensures the parser only operates on raw text input and case binding only happens after the draft question is complete.

**AI-Powered Signal Generation:**
The signals page calls `POST /api/ai-signals/generate` which performs a **Brand Development Check** before generating signals. This involves detecting therapeutic area, performing real-time web research, and passing findings to GPT-4o for case-specific signal generation. Signals are classified as `observed`, `derived`, or `uncertainty`. Each AI-generated signal includes translation fields (`applies_to_line_of_therapy`, `applies_to_stakeholder_group`, `applies_within_time_horizon`, `translation_confidence`) and a `question_relevance_note`. Signals with low `translation_confidence` have capped impact.

**Event Decomposition Layer (CRITICAL):**
The AI decomposes each question into 3-6 "event gates"—conditions that must be met for the asked outcome. Each gate has a `status` and `constrains_probability_to`. The AI returns `brand_outlook_probability` (unconstrained) and `constrained_probability` (minimum of all gate caps). If any gate is weak/unresolved, the constrained probability is capped.

**Engine Guardrails (CRITICAL):**
A set of guardrails are applied at the API boundary before and after the core engine:
1.  **Driver Deduplication:** Identifies and removes duplicate drivers.
2.  **Max Single-driver Shift:** Caps each driver's marginal probability contribution to ±15 percentage points.
3.  **Total Shift Normalization:** Normalizes total shift from prior if it exceeds ±40 percentage points.
4.  **Event Gating Constraint:** Caps probability at 70% if any required gate is weak/unresolved/missing.
5.  **Relevance Penalty:** Reduces LR impact by 50% for signals with low `translation_confidence` or indirect applicability.
6.  **Recalculation Consistency:** Uses a state hash for 30-second caching of identical inputs.
7.  **Engine Input Validation:** Validates prior and signal fields, returning HTTP 400 for invalid inputs.
A diagnostic panel provides system validation information.

**Signal Persistence Flow:**
When users accept signals on the Signals page, `persistSignalToDb` saves them to the database. The Bayesian forecast engine reads signals from the database. Signals are saved with `createdByType: "human"` and `status: "active"`, with frontend categories mapped to database signal types and numeric scores.

**AI-Powered Decision Analysis:**
The Decide page calls `POST /api/ai-decide/generate` to produce structured analysis including adoption segmentation, barrier diagnosis, readiness timeline, competitive risk, growth feasibility, and recommended actions. Analysis is specific to the actual product/brand.

**Forecast-Derived Decision Architecture (Deterministic):** The Decide page (Step 4) uses a deterministic derivation engine (`decision-derivation.ts`) that maps forecast gates to DecisionItem objects. The AI role is reduced to adding contextual detail — it does NOT generate decision structure. Flow: (1) `deriveDecisions(gates, brandOutlook, constrainedProb)` deterministically produces `{ barriers, actions, segments, trigger_events, monitoring }`, (2) `validateDecisionIntegrity(...)` runs 5 rules (missing gate ID, invalid gate ref, missing forecast_dependency, strong gate cannot produce High barrier, weak/unresolved gate must have action), (3) AI adds `barrier_details[gate_id]` text + `adoption_segmentation`, `readiness_timeline`, `competitive_risk`, `growth_feasibility`, (4) if AI fails, derived decisions still return (AI is non-blocking fallback). API response: `{ mode: "forecast_derived"|"standalone", derived_decisions, integrity: { valid, violations, gate_coverage, derivation_chain_complete }, ...contextual fields }`. Each DecisionItem has: `decision_id`, `decision_type`, `title`, `rationale`, `source_gate_id`, `source_gate_label`, `source_gate_status`, `forecast_dependency`, `severity_or_priority`, `derived_from_forecast: true`. Frontend renders DerivedByTag provenance chain under each item. Request dedup key includes `caseId` to prevent stale cross-case data. Barrier polarity rule: readiness and barrier are inversely correlated (High readiness → Low barrier); forbidden pairs (High:High, Low:Low) auto-corrected server-side.

**Forecast Meaning Panel:** Placed directly below the 3-panel grid (Brand Outlook / Event Gates / Final Forecast) in Step 3. Indigo-bordered panel with three fields: (1) **Interpretation** — plain-language sentence dynamically selected from 6 logic branches based on brand outlook vs final forecast levels: brand high + final low → barriers not product; brand low + final low → clinical/regulatory uncertainty; brand high + final high → evidence + readiness aligned; moderate + moderate → depends on resolving barriers; brand high + final moderate → partially limited by gates; fallback. (2) **Primary Constraint** — the weakest gate (sorted by status: unresolved < weak < moderate < strong), shown with status badge and probability cap. (3) **What Would Change the Forecast** — the strongest unresolved/weak gate (highest constrains_probability_to), with estimated upside if resolved.

**Gate-Driven Scenario Planning (Step 3 tab):** The Scenario Planning tab inside `/forecast` generates deterministic counterfactual forecasts by modifying gate states. No AI, no narratives — pure gate-driven computation. Architecture: (1) Reads gates from `cios.eventDecomposition:${caseId}`, (2) `generateGateScenarios(gates, brandOutlook)` produces `GateScenario[]`, (3) Each scenario modifies one or more gates via `gateStatusUpgrade/Downgrade` (explicit ordered transition: unresolved → weak → moderate → strong), (4) `computeConstrainedProbability` recalculates using same formula as backend (minimum gate cap, 70% ceiling for weak/unresolved, bounded by brand outlook), (5) `gateCapForStatus` maps caps proportionally within status bands (unresolved: 10-45%, weak: 30-55%, moderate: 50-75%, strong: 70-95%). Scenario types: single-gate upgrade, single-gate regression, composite all-weak-upgrade, composite all-strong-regress. Each scenario displays: name, base→new probability, delta (color-coded), gate change badges (from→to status), primary driver gate label. Sorted by absolute delta magnitude.

## External Dependencies
- **PostgreSQL:** Primary database.
- **Express 5:** Backend web framework.
- **React, Vite, Tailwind, Recharts, React Query:** Frontend development stack.
- **Drizzle ORM:** Object-Relational Mapper.
- **OpenAPI 3.1 & orval:** API specification and code generation.
- **OpenAI (via Replit AI Integrations):** Powers AI signal generation for market intelligence research.
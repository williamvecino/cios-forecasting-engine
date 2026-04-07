# CIOS — Clinical Intelligence & Outcome System

## Overview
CIOS is a Bayesian forecasting platform for the healthcare industry. It predicts Healthcare Professional (HCP) adoption of medical assets and geographies by translating prior probabilities into posterior probabilities using clinical signals and a 6-actor behavioral reaction model. The platform provides AI-powered insights to forecast market adoption and stakeholder behavior, enhancing strategic decision-making through comprehensive strategic intelligence and market potential analysis.

## User Preferences
I prefer clear and concise information. I appreciate high-level summaries before diving into details. When implementing features, prioritize modular and maintainable code. For architectural decisions, provide the rationale. I expect the agent to ask for clarification if there are ambiguities in my requests and to inform me about significant changes or design choices before proceeding.

## System Architecture
CIOS is a monorepo using pnpm workspaces. The frontend uses React, Vite, Tailwind CSS, Recharts, and React Query, featuring a question-driven "Aaru-like Decision Interface" with a dark theme. The backend is an Express 5 application in TypeScript, exposing APIs under `/api`. PostgreSQL handles data persistence via Drizzle ORM. API specifications adhere to OpenAPI 3.1, with `orval` generating client and validation libraries.

**Core Architectural Principles:**
- Agents are deterministic, single-purpose, with fixed inputs and outputs.
- The Core CIOS Judgment Engine serves as the central decision-maker.
- Raw uploaded documents undergo processing by gating agents, preserving provenance for every signal.
- The system employs 17 bounded, deterministic, single-purpose AI agents with fixed I/O schemas and a `ProgramID` scope constraint.
- A 7-agent chain registry defines the canonical forecasting pipeline: Question Structuring → Signal Identification → Signal Validation → Dependency Control → Forecast Engine → Interpretation → Scenario Simulation.

**⛔ CORE FORECASTING ENGINE FREEZE (Default Operating State):**
The following engine components are FROZEN. No modifications permitted during stabilization:
- **Priors:** Prior probability values, environment-based prior multipliers.
- **Posterior updating:** Bayesian odds multiplication, `applySignalsToPrior`, `oddsToProbability`, `probabilityToOdds`.
- **Likelihood ratio weighting:** LR computation (`computeLR`), signal-type weighting, pharma multipliers.
- **Dependency compression:** Correlation group dampening logic (`1 / (idx + 1)`), `dependencyRole` effects.
- **Barrier / gate constraint formulas:** `computeReadinessScore`, `computeAchievableCeiling`, Beta distribution CDF, gate domination detection.
- **Actor behavioral factor:** Net actor translation to Bayesian multiplier (`Math.exp(netActorTranslation / 4)`).
- **Calibration weighting:** `lrCorrections`, `bucketCorrections`, `computeDecay`, overconfidence/volatility checks.
- **Sensitivity analysis:** `deltaIfRemoved`, `deltaIfReversed` calculations.

Frozen files (DO NOT MODIFY):
- `artifacts/api-server/src/lib/forecast-engine.ts`
- `artifacts/api-server/src/lib/core-forecast-engine.ts`
- `artifacts/api-server/src/lib/adoption-distribution.ts`
- `artifacts/api-server/src/lib/calibration-utils.ts`
- `artifacts/api-server/src/lib/calibration-checks.ts`
- `artifacts/api-server/src/lib/agent-engine.ts`
- `artifacts/api-server/src/lib/signal-dependency-engine.ts`
- `artifacts/api-server/src/lib/pharma-logic.ts`
- `artifacts/cios-frontend/src/lib/core-forecast-engine.ts`
- `artifacts/cios-frontend/src/lib/adoption-distribution.ts`

Unfreeze conditions (ALL must be met):
1. Input governance (Signal Eligibility Gate, evidence classification) confirmed stable.
2. Output synchronization (pipeline reconciliation, forecast-result endpoint) confirmed stable.
3. Repeated calibration failure observed across multiple cleaned cases (not a single case anomaly).
4. Explicit versioned review process initiated — freeze cannot be silently bypassed.
Changes to signal inputs, UI display, eligibility classification, or explanation layers are permitted and do not violate the freeze.

**Key Features and Design Principles:**
- **Bayesian Forecast Engine:** Transparent probability calculation.
- **AI-Powered Signal Detection & Review:** AI for signal extraction with human oversight.
- **Actor Behavioral Modeling:** Integrates a 6-actor model (KOL, HCP, Payer, Patient, Administrator, Competitor).
- **Calibration Learning Loop:** Continuously tracks outcomes and adjusts for bias.
- **Strategic Questions Engine & Challenge Mode:** Generates structured intelligence questions and offers adversarial critique.
- **Adoption Distribution Forecast Model (v3):** Computes final probability by building a Beta adoption distribution, calculating an achievable ceiling from gate constraints, scaling the distribution mean, and then calculating P(adoption ≥ threshold) from the adjusted distribution's CDF.
- **Executive Judgment Layer:** Produces `ExecutiveJudgmentResult` with integrity checks and audit trails.
- **Forecast Ledger (Calibration Memory):** Versions and persists forecasts with inference snapshots.
- **Universal Ingestion & Enterprise Data Import:** AI-powered extraction of decision questions and signals from various document types.
- **Decision/Environment Classification Engine:** AI pipelines classify decision archetypes, context, and extract domain-specific signals.
- **MIOS/BAOS AI Agents:** MIOS identifies brand-specific clinical evidence; BAOS identifies HCP cognitive barriers.
- **Temporal Relevance Guardrails:** Enforce recency rules for signals and evidence.
- **Case Framing Layer:** Mandatory pre-signal-generation step deriving structured case metadata and defining `CaseFrame` for 10 archetypes.
- **Case Type Classifier & Routing:** Deterministic engine identifies 10 pharma case archetypes and routes to appropriate modules.
- **Standardized Output Requirements:** Every archetype frame mandates 7 structured output fields.
- **Calibration & Performance Dashboard:** Aggregates Forecast Ledger data for metrics, calibration analysis, and bias detection.
- **Trial-Linked Evidence Clustering:** Detects shared trial identifiers to prevent over-counting.
- **Actors/Segments Simulation Engine:** Deterministic scenario simulation engine recomputing forecast outcomes under 13 controlled scenario types.
- **Signal Structure & Efficiency Upgrade:** Includes auto-assigned driver roles, coverage validation, a signal map, causal alignment checks, and completeness suggestions.
- **AI Signal Deduplication:** Semantic and similarity-based deduplication of signals.
- **AI-Structured Question Definition Workflow:** Multi-step question input flow where AI structures the question, performs feasibility checks, and proposes outcome states.
- **Guarded Ingestion Layer:** Accepts full unstructured text, with a mandatory Decision Classification AI agent.
- **Signal Interpretation Layer:** Sits between decision classification and signal creation, persisting to `signal_interpretations` DB table.
- **Server-Side Recalculation Controller:** `POST /api/forecast/recalculate` is a dependency-aware forecast recalculation endpoint.
- **Forecast Explanation Layer:** `GET /api/cases/:caseId/explanation` endpoint generates structured explanations.
- **Respond / Launch Strategy Output:** Restructured executive brief answering 5 executive questions: (1) Probability of what? (2) By when? (3) Why is it low? (4) What is the main constraint? (5) What would change it? Includes a data-driven Decision Clarity panel showing success definition, time horizon, target probability (threshold), and environment strength (posterior) — clearly distinguishing the two probability types. LLM-generated sections: Strategic Recommendation (one sentence), Primary Constraint, Highest-Impact Lever, Realistic Ceiling.
- **Coherence Verification Agent:** Post-Respond verifier (11 deterministic rules) that validates output for rule compliance, internal coherence, and decision clarity before display. Rules 1-8: structural coherence (probability stated, success definition, time horizon, two probabilities, verdict vs threshold, constraint named, lever named, top drivers reflected). Rules 9-10: executive formatting (no raw decimals, no internal signal IDs). Rule 11: cross-section redundancy detection — when Needle Movement structured data is present, prose sections must add interpretation/context, not restate the same facts. Cannot change probabilities, priors, signal weights, or invent data. LLM correction prompt includes full needle_movement payload for grounded deduplication. Registered in agent chain after Interpretation, before Scenario Simulation.
- **Needle Movement Analysis:** Deterministic (no LLM) structured section built by `buildNeedleMovement()` in ai-respond.ts. Three blocks: moves_up (top 3 positive drivers), moves_down (top 3 negative drivers), recommended_actions (strategic + tactical). Each driver tagged with category, impact level (high ≥5pp, moderate ≥2.5pp, low), contribution in pp. Signal IDs stripped from names.
- **Strategic Relevance Page Hierarchy (Respond + Forecast pages):** 4-section layout with visibility rules applied to both Respond and Forecast pages. (1) Decision Snapshot (always visible): Decision, probability, most likely outcome, primary blocker, fastest way to improve. ForecastComparisonCircles (Evidence Strength → Barrier Impact → Target Likelihood) displayed immediately after snapshot. (2) Interpretation (always visible): environment strength, success definition, why the probability looks like this, what would change the forecast. (3) Needle Movement (visible): up/down drivers, strategic/tactical actions. (4) Diagnostics (hidden by default): signal details, sensitivity, maximum probability, compression, consistency. Diagnostics auto-reveal when: confidence is Low, probability shift ≥10pp, or signals conflict. User can manually toggle via "Explain" button. Uses 3-state toggle logic (null=auto, true/false=user override) so users can collapse even when auto-triggered. Override resets when switching cases. UI language simplified: no technical jargon (e.g., "Evidence Strength" not "Signal Strength", "Sensitivity" not "Fragility", "Maximum Probability" not "Confidence Ceiling", "Barrier Impact" not "Constraint Gap", "Detailed Reasoning" not "Judgment Audit Trail").
- **Consistency and Determinism System:** Uses a Canonical Case Object (`canonicalFields` JSONB on `cases` table) for structured parsed fields and `forecast_snapshots` for drift detection and consistency scoring.
- **System Integrity Test Layer:** Internal validation module that tests 10 engine invariants on every forecast run, logging results to `integrity_test_results` table. Core invariant failures flag the forecast as unreliable.
- **Signal Eligibility Gate:** Mandatory 3-tier classification before posterior calculation: `Eligible` (has named entity + specific event + verifiable source + event date — counts toward posterior), `ContextOnly` (missing one criterion, or source is "Analysis" — informs explanation only), `Rejected` (missing source/date, Echo, evidence status Rejected, or vague description — blocked from forecasting). Only signals with `countTowardPosterior=true` (Eligible class) enter LR multiplication. Signals with `sourceLabel="Analysis"` are automatically `ContextOnly`. Vagueness filter: descriptions ≤5 words without a named entity or specific event are Rejected; descriptions that simply restate the signalType (e.g. "Competitor counteraction signal" for type "Competitor counteraction") are Rejected. Classification runs on all signal insertion and update paths: POST/PUT/PATCH in signals.ts, candidate approval and candidate-to-promoted updates in discover.ts, workbook-import.ts, adopter-discovery.ts, validation-pack.ts, and seed-data.ts — all call `classifyEvidence()`. DB columns: `evidence_class`, `count_toward_posterior`. Reclassification endpoint: `POST /api/signals/reclassify-all`.
- **Authoritative ForecastResult Endpoint:** `GET /api/cases/:caseId/forecast-result` returns one canonical probability with evidence gate summary (total signals, posterior-eligible count, excluded count, breakdown by class). Frontend panels read from this object — local probability computations disabled in `signal-gate-engine.ts` and `simple-score.ts`.
- **Integrity Spec Enforcement (Rule 3 — Required Inputs):** Cases missing any required field (Decision Question, Outcome Variable, Threshold, Time Horizon, Segment Definition, Base Prior) are blocked from running forecasts. Returns HTTP 422 with specific missing field list and remedy. Enforced in both `forecasts.ts` (GET /cases/:caseId/forecast) and `recalculateCaseScore.ts`. Signal creation requires: dependencyRole, rootEvidenceId, novelInformationFlag, observedAt — missing any of these rejects the signal with a validation error. Programmatic signal insertion paths (discover.ts candidate approval, workbook-import.ts, validation-pack.ts) automatically populate these required fields with sensible defaults.

## External Dependencies
- **PostgreSQL:** Relational database.
- **Express 5:** Backend framework.
- **React, Vite, Tailwind, Recharts, React Query:** Frontend technologies.
- **Drizzle ORM:** Object-Relational Mapper.
- **OpenAPI 3.1 & orval:** API specification and code generation.
- **OpenAI:** AI services.
- **pdfjs-dist, mammoth, jszip, word-extractor, ppt-to-text:** Libraries for document text extraction.
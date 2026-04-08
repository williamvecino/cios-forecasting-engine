# CIOS — Clinical Intelligence & Outcome System

## Overview
CIOS is a Bayesian forecasting platform designed for the healthcare industry. Its primary purpose is to predict the adoption of medical assets and geographies by Healthcare Professionals (HCPs). It achieves this by translating prior probabilities into posterior probabilities using clinical signals and a sophisticated 6-actor behavioral reaction model. The platform provides AI-powered insights for market adoption forecasts and stakeholder behavior analysis, aiming to enhance strategic decision-making through comprehensive market potential and strategic intelligence.

## User Preferences
I prefer clear and concise information. I appreciate high-level summaries before diving into details. When implementing features, prioritize modular and maintainable code. For architectural decisions, provide the rationale. I expect the agent to ask for clarification if there are ambiguities in my requests and to inform me about significant changes or design choices before proceeding.

## System Architecture
CIOS is structured as a monorepo utilizing pnpm workspaces. The frontend is built with React, Vite, Tailwind CSS, Recharts, and React Query, featuring a question-driven "Aaru-like Decision Interface" with a dark theme. The backend is an Express 5 application developed in TypeScript, exposing APIs under the `/api` endpoint. Data persistence is managed by PostgreSQL, interfaced via Drizzle ORM. API specifications adhere to OpenAPI 3.1, with `orval` used for generating client and validation libraries.

**Core Architectural Principles:**
- Agents are deterministic, single-purpose, with fixed inputs and outputs.
- The Core CIOS Judgment Engine is the central decision-making component.
- Raw documents are processed by gating agents, ensuring provenance for every signal.
- The system employs 17 bounded, deterministic, single-purpose AI agents with fixed I/O schemas.
- A 7-agent chain defines the canonical forecasting pipeline: Question Structuring → Signal Identification → Signal Validation → Dependency Control → Forecast Engine → Interpretation → Scenario Simulation.

**Key Features and Design Principles:**
- **Bayesian Forecast Engine:** Provides transparent probability calculations.
- **AI-Powered Signal Detection & Review:** AI assists in signal extraction with human oversight.
- **Actor Behavioral Modeling:** Integrates a 6-actor model (KOL, HCP, Payer, Patient, Administrator, Competitor).
- **Calibration Learning Loop:** Continuously tracks outcomes and adjusts for bias.
- **Strategic Questions Engine & Challenge Mode:** Generates structured intelligence questions and offers adversarial critique.
- **Adoption Distribution Forecast Model (v3):** Computes final probabilities using a Beta adoption distribution, gate constraints, and CDF calculations.
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
- **Respond / Launch Strategy Output:** Restructured executive brief answering 5 key executive questions, including a data-driven Decision Clarity panel. LLM-generated sections: Strategic Recommendation, Primary Constraint, Highest-Impact Lever, Realistic Ceiling.
- **Coherence Verification Agent:** Post-Respond verifier with 11 deterministic rules that validates output for rule compliance, internal coherence, and decision clarity before display.
- **Needle Movement Analysis:** Deterministic structured section built by `buildNeedleMovement()` in ai-respond.ts, detailing positive, negative, and recommended actions for drivers.
- **Strategic Relevance Page Hierarchy (Respond + Forecast pages):** 4-section layout with visibility rules applied to both Respond and Forecast pages, simplifying UI language.
- **Consistency and Determinism System:** Uses a Canonical Case Object (`canonicalFields` JSONB) and `forecast_snapshots` for drift detection and consistency scoring.
- **System Integrity Test Layer:** Internal validation module that tests 10 engine invariants on every forecast run, logging results and flagging unreliable forecasts.
- **Signal Precedent Library (CIOS v18):** Precedent-based signal weighting with governance controls, 29 fixed signal types across A/B/C reliability tiers with assigned LRs. All signal LR assignment now exclusively uses `lookupPrecedentLr()` — `computeLR()` is fully deprecated and has zero active call sites.
- **Signal Eligibility Gate:** Mandatory 3-tier classification (`Eligible`, `ContextOnly`, `Rejected`) before posterior calculation, ensuring only eligible signals contribute to the forecast.
- **Validation Pack (5 cases):** VP-REGULATORY-001 through VP-BARRIER-005 with 57 signals, all using precedent-locked LRs. Seeded via `/api/validation-pack/seed` endpoint.
- **Veligrotug Acceptance Test:** ACCEPT-VELIGROTUG-001 with 6 precedent-locked signals, verifying posterior=0.0669±0.002 with dependency compression.
- **14-Case Baseline Suite (2026-04-08):** DEMO-01=12.79%, DEMO-02=21.17%, DEMO-03=25.95%, DEMO-04=34.14%, DEMO-05=11.33%, LEQEMBI-01=6.50%, LEQEMBI-02=19.49%, Beovu=14.25%, VP-REG=49.76%, VP-LAUNCH=11.20%, VP-ADOPT=4.97%, VP-COMP=34.35%, VP-BARRIER=46.60%, Veligrotug=6.69%.
- **Case Replacements:** CASE-DEMO-01 now Arikayce (prior=0.37, 5 signals), CASE-DEMO-05 now Sublocade/OUD (prior=0.35, 4 signals), CASE-1775022353034 now Beovu retrospective demo (prior=0.45, 5 signals). VP-ADOPTION-003 prior→0.25, CASE-LEQEMBI-01 prior→0.40.
- **Authoritative ForecastResult Endpoint:** `GET /api/cases/:caseId/forecast-result` returns one canonical probability with evidence gate summary.
- **Integrity Spec Enforcement (Rule 3 — Required Inputs):** Blocks forecasts if essential case or signal fields are missing, returning HTTP 422 with specific missing fields.
- **Pivotal Evidence Gate:** Required case initialization step before MIOS/BAOS signal discovery. Cases created via Structured Input form must include Primary Trial Name, PMID, and Result Summary. Auto-creates an analyst-locked pivotal signal (`signalFamily: "pivotal-trial"`) with `countTowardPosterior: true`. Pivotal signals cannot be deleted by MIOS/BAOS import or manual deletion (403 protected). Schema columns: `primary_trial_name`, `primary_trial_pmid`, `primary_trial_result`, `secondary_evidence` on cases table.
- **AI Signal Governance:** All signals created by non-human sources (`createdByType !== "human"`) default to `countTowardPosterior: false`. Enforced in workbook-import, discover, adopter-discovery, and signals routes.
- **Structured Pivotal Evidence Search (Registry-First, 5-Tier with Sponsor):** `POST /api/cases/:caseId/pivotal-search` generates authoritative-first search queries across 6 categories (Clinical Evidence, Regulatory/Label, Payer/Access, Safety, Guidelines, Competitive/Market). Each category searches government registries and authoritative sources FIRST, then sponsor IR/press releases, then general sources. 5-tier verification: Tier 0 = Registry/journal verified (.gov, journals, society sites — instant approve, green), Tier 1 = Known trial match (green), Tier 1S = Sponsor source (blue — company-reported data, approvable with verification advisory), Tier 2 = Found in source corpus (amber), Tier 3 = Unverified (red, blocked). Shared config in `authoritative-sources.ts` with `INDICATION_SOCIETY_MAP` (55+ indication→society mappings), `TIER0_DOMAINS`, `SPONSOR_LOOKUP` (drug→company/IR/ticker mapping), `classifyUrlTier()`, `buildAuthoritativeQueries()`, `lookupSponsor()`, `getTimeFilterDate()`. All queries include `after:` time filter (default 12 months). SEC EDGAR 8-K queries added for public companies. Sponsor queries run for every category using per-category keywords. Cases table has `sponsor_company`, `sponsor_ir_url`, `sponsor_ticker` columns. LLM role is extraction-only — returns null if source text doesn't contain information. All candidates start as `countTowardPosterior: false`. Frontend shows tier badges with color-coded verification status including blue "Sponsor Source" badge with verification advisory text.
- **Signal Completeness Gate (Forecast Page):** `SignalCompletenessGate.tsx` renders tiered warnings on the forecast page. Tier 1 (hard block) = no clinical evidence, shows red banner and disables recalculate. Tier 2 (soft warning) = missing payer, safety, operational signals with acknowledge button. Tier 3 (informational) = missing guidelines, competitive. Backend: `GET /api/cases/:caseId/completeness-check` and `GET /api/completeness-check/all`. Logic in `signal-completeness-check.ts`.
- **Structured Signal Discovery Pipeline:** "Find New Signals" replaced with structured evidence retrieval via `POST /api/ai-signals/structured-search`. Runs Google News RSS queries across 5 categories (Clinical Evidence, Label/Regulatory, Guidelines, Safety, Payer/Access), then GPT-4o extracts structured findings. Results presented as candidate cards with approve/reject per item. All candidates `countTowardPosterior: false`; approved signals become `source: "user"`. "Analyze for Missing Signals" (`POST /api/ai-signals/completeness`) accepts `missingFamilies` array for gap-targeted searches instead of generic suggestions. Backend: `structured-evidence-search.ts` module with `buildFullSearchQueries()`, `buildGapSearchQueries()`, `runStructuredEvidenceSearch()`. Frontend: `runStructuredSearch()`, `approveStructuredCandidate()`, `rejectStructuredCandidate()` in signals/index.tsx.

## External Dependencies
- **PostgreSQL:** Relational database.
- **Express 5:** Backend framework.
- **React, Vite, Tailwind, Recharts, React Query:** Frontend technologies.
- **Drizzle ORM:** Object-Relational Mapper.
- **OpenAPI 3.1 & orval:** API specification and code generation.
- **OpenAI:** AI services.
- **pdfjs-dist, mammoth, jszip, word-extractor, ppt-to-text:** Libraries for document text extraction.
# CIOS — Clinical Intelligence & Outcome System

## Overview
CIOS is a Bayesian forecasting platform designed for the healthcare industry. It predicts Healthcare Professional (HCP) adoption of medical assets and geographies by translating prior probabilities into posterior probabilities using clinical signals and a 6-actor behavioral reaction model. The platform provides AI-powered insights to forecast market adoption and stakeholder behavior, enhancing strategic decision-making through comprehensive strategic intelligence and market potential analysis.

## User Preferences
I prefer clear and concise information. I appreciate high-level summaries before diving into details. When implementing features, prioritize modular and maintainable code. For architectural decisions, provide the rationale. I expect the agent to ask for clarification if there are ambiguities in my requests and to inform me about significant changes or design choices before proceeding.

## System Architecture
CIOS is a monorepo utilizing pnpm workspaces. The frontend is built with React, Vite, Tailwind CSS, Recharts, and React Query, featuring a question-driven "Aaru-like Decision Interface" with a dark theme. The backend is an Express 5 application in TypeScript, exposing APIs under `/api`. PostgreSQL handles data persistence via Drizzle ORM. API specifications adhere to OpenAPI 3.1, with `orval` generating client and validation libraries.

**Core Architectural Principles:**
- Agents are deterministic, single-purpose, with fixed inputs and outputs.
- The Core CIOS Judgment Engine serves as the central decision-maker.
- Raw uploaded documents undergo processing by gating agents, preserving provenance for every signal.
- Existing engine or UI workflows (Define Question → Define Comparison Groups → Add Information → Judge → Decide → Respond → Simulate) are stable.

**Key Features and Design Principles:**
- **Bayesian Forecast Engine:** Provides transparent probability calculation.
- **AI-Powered Signal Detection & Review:** Utilizes AI for signal extraction with human oversight.
- **Actor Behavioral Modeling:** Integrates a 6-actor model (KOL, HCP, Payer, Patient, Administrator, Competitor).
- **Calibration Learning Loop:** Continuously tracks outcomes and adjusts for bias.
- **Strategic Questions Engine & Challenge Mode:** Generates structured intelligence questions and offers adversarial critique.
- **Forecast Ledger & Strategic Narrative Generator:** Tracks predictions and creates analytical narratives.
- **Transparency Overhaul:** Offers plain-language explanations for all numerical outputs.
- **Signal Dependency & Redundancy Control Layer:** Prevents posterior inflation from causally related signals.
- **Gate-Driven Scenario Planning:** Enables deterministic counterfactual forecasts. Gate scenarios now use the adoption distribution model for probability computation.
- **Adoption Distribution Forecast Model (v2):** Final probability is computed by (1) building a Beta adoption distribution from the Bayesian posterior, confidence level, signal count, and evidence diversity; (2) adjusting the distribution using gate constraints (both gate status severity and cap values shift alpha/beta); (3) calculating P(adoption ≥ threshold) from the adjusted distribution's CDF. Each outcome threshold triggers a fresh calculation — the threshold is never baked into the prior. Replaces the old min-cap "Underlying Strength − Constraint Gap" model. Implementation: `adoption-distribution.ts` (both backend and frontend).
- **Executive Judgment Layer:** Produces `ExecutiveJudgmentResult` with integrity checks and audit trails.
- **Barrier/Constraint Decomposition Layer:** Decomposes gates into operational drivers and abstract constraint categories.
- **Endpoint Signal Differentiation Layer:** Classifies evidence signals into four tiers and detects `SignalImbalance`.
- **Forecast Ledger (Calibration Memory):** Versions and persists forecasts with inference snapshots.
- **Decision-Based Comparison Groups:** AI extracts comparison groups from strategic questions.
- **Ask CIOS (Case-Aware Question Box):** A persistent panel for case-specific questions.
- **Respond Step:** Converts decision output into client-ready executive responses.
- **Universal Ingestion & Enterprise Data Import:** AI-powered extraction of decision questions and signals from various document types.
- **Decision/Environment Classification Engine:** AI pipelines classify decision archetypes, context, and extract domain-specific signals.
- **MIOS/BAOS AI Agents:** MIOS identifies brand-specific clinical evidence; BAOS identifies HCP cognitive barriers.
- **Decision Gating Agent:** Orchestrates document processing, identifies business decisions, and routes content.
- **Temporal Relevance Guardrails:** Enforce recency rules for signals and evidence.
- **Calibration Reference Case Library:** A benchmark library of 13 curated archetype cases.
- **Adoption Segmentation Panel:** Translates forecasts into 8 segment-level adoption maps.
- **Barrier Diagnosis Panel:** Diagnoses dominant sources of adoption resistance across 10 categories.
- **Case Framing Layer:** Mandatory pre-signal-generation step deriving structured case metadata and defining `CaseFrame` for 10 archetypes.
- **Case Type Classifier & Routing:** Deterministic engine identifies 10 pharma case archetypes and routes to appropriate modules.
- **Standardized Output Requirements:** Every archetype frame mandates 7 structured output fields.
- **Readiness Timeline Panel:** Provides a time-ordered readiness view across 10 milestone categories.
- **Competitive Risk Panel:** Identifies competitive forces across 12 categories.
- **Growth Feasibility Panel:** Synthesizes forecast outputs into actionable feasibility with a deterministic scoring engine.
- **Calibration & Performance Dashboard:** Aggregates Forecast Ledger data for metrics, calibration analysis, and bias detection.
- **Safety Signal Forecast Ceiling:** Applies probability ceilings in regulatory cases based on unresolved negative safety signals.
- **Challenge Mode Validation:** Validates forecast outputs against expected probability ranges.
- **Trial-Linked Evidence Clustering:** Detects shared trial identifiers to prevent over-counting.
- **Negative Signal Downward Pressure Floor:** Ensures negative-direction signals contribute to downward pressure.
- **Unified Confidence Display:** Presents a single primary confidence label per case.
- **Actors/Segments Simulation Engine:** Deterministic scenario simulation engine recomputing forecast outcomes under 13 controlled scenario types.
- **Phase 3 Clinical Endpoint Structural Controls:** Implements 9 structural controls for clinical outcome decisions.
- **Systematic Calibration Checks:** 5 pre-forecast bias checks run automatically.
- **Signal Domain Classification:** Each signal carries a `signal_domain` field.
- **Expanded Signal Direction Model:** Direction expanded to 6 values for richer signal interpretation.
- **MIOS Evidence Verification Guardrail:** Automated evidence verification layer extracting and verifying identifiers against registries.
- **Archetype Signal Grammars (9 Archetypes):** Each CaseFrame includes `judgmentQuestions`, `correctSignalTypes`, and `incorrectSignalTypes`.
- **Signal Structure & Efficiency Upgrade:** Includes auto-assigned driver roles, coverage validation, a signal map, causal alignment checks, and completeness suggestions.
- **Signal Measurement Criteria:** Structured measurement definitions for signals.
- **Trigger Rules Engine:** Provides condition-based auto-flagging rules.
- **Competitive Coverage Ratio Derived Metric:** Computes competitor field capacity ÷ brand field capacity.
- **Composite Outcome Structure:** Multi-dimensional outcome evaluation with configurable dimensions.
- **Input Hardening Layer:** Strict forecast gate requiring locked signals and scenario names, with auto-unlock on signal edits.
- **AI Signal Deduplication:** Semantic and similarity-based deduplication of signals.
- **Simulation Driver Traceability:** Simulation API returns `drivers` array with weight, direction, and rationale.
- **Probability Banding:** Formal bands (Low, Moderate, High, Very High) for probability display.
- **Negative Scenario Types:** Expanded scenario polarity and expected effects.
- **Canonical 5-Case Validation Pack:** Benchmark suite of 5 curated cases for validation.
- **AI-Structured Question Definition Workflow:** Multi-step question input flow where AI structures the question, performs feasibility checks, and proposes outcome states.
- **Question Repository with Cross-Step Persistence:** Saved questions persist to a PostgreSQL-backed repository via CRUD API at `/api/cases/:caseId/questions`.
- **Guarded Ingestion Layer:** Accepts full unstructured text, with a mandatory Decision Classification AI agent (`POST /api/agents/decision-classification`) for classification and question generation.
- **Signal Interpretation Layer:** Sits between decision classification and signal creation, persisting to `signal_interpretations` DB table and generating interpretation objects.
- **Server-Side Recalculation Controller:** `POST /api/forecast/recalculate` is a dependency-aware forecast recalculation endpoint.
- **Signal Family Taxonomy:** A 10-family fixed taxonomy (`SIGNAL_FAMILIES` in `lr-config.ts`).
- **Root Evidence & Lineage Mapping:** Tracks `lineageType`, `sourceCluster`, and `noveltyFlag` for signals and interpretations.
- **Decision Patterns (Prior Templates):** `prior_templates` table with 5 decision patterns.
- **Outcome Threshold Integration:** `outcomeThreshold` column on `cases` table stores the threshold.
- **Forecast Explanation Layer:** `GET /api/cases/:caseId/explanation` endpoint generates structured explanations.
- **Gold-Set Test Pack:** `gold_set_cases` table with 20 seeded benchmark cases.
- **Narrative Gap Guard:** Context-aware validator that blocks or flags vague narrative gap statements lacking numeric definitions.
- **Consistency and Determinism System:** Uses a Canonical Case Object (`canonicalFields` JSONB on `cases` table) for structured parsed fields and `forecast_snapshots` for drift detection and consistency scoring.
- **System Integrity Test Layer:** Internal validation module that tests 10 engine invariants on every forecast run: threshold monotonicity, horizon monotonicity, positive/negative signal response, constraint release response, duplicate compression, question sensitivity, segment sensitivity, explanation consistency, and reproducibility. Results logged to `integrity_test_results` table. Core invariant failures (threshold monotonicity, signal response, reproducibility) flag the forecast as unreliable. API: `GET /api/integrity/cases/:caseId`. Implementation: `api-server/src/lib/integrity-tests.ts`, `api-server/src/routes/integrity.ts`.

**Bounded Agent Architecture:** The system employs 17 bounded, deterministic, single-purpose AI agents with fixed I/O schemas, enforcing a `ProgramID` scope constraint.

## External Dependencies
- **PostgreSQL:** Relational database.
- **Express 5:** Backend framework.
- **React, Vite, Tailwind, Recharts, React Query:** Frontend technologies.
- **Drizzle ORM:** Object-Relational Mapper.
- **OpenAPI 3.1 & orval:** API specification and code generation.
- **OpenAI:** AI services.
- **pdfjs-dist, mammoth, jszip, word-extractor, ppt-to-text:** Libraries for document text extraction.
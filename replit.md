# CIOS — Clinical Intelligence & Outcome System

## Overview
CIOS is a Bayesian forecasting platform designed to predict Healthcare Professional (HCP) adoption. It translates prior probabilities into posterior probabilities using clinical signals and a 6-actor behavioral reaction model. The platform provides AI-powered insights to forecast market adoption and stakeholder behavior across various medical assets and geographies, aiming to enhance strategic decision-making in the healthcare industry and provide comprehensive strategic intelligence and market potential analysis.

## User Preferences
I prefer clear and concise information. I appreciate high-level summaries before diving into details. When implementing features, prioritize modular and maintainable code. For architectural decisions, provide the rationale. I expect the agent to ask for clarification if there are ambiguities in my requests and to inform me about significant changes or design choices before proceeding.

## System Architecture
CIOS is a monorepo utilizing pnpm workspaces. The frontend is built with React, Vite, Tailwind CSS, Recharts, and React Query, featuring a question-driven "Aaru-like Decision Interface" with a dark theme. The backend is an Express 5 application in TypeScript, exposing APIs under `/api`. Data persistence is managed by PostgreSQL via Drizzle ORM. API specifications adhere to OpenAPI 3.1, with `orval` used for client and validation library generation.

**Core Architectural Principles:**
- All agents are deterministic, single-purpose, with fixed inputs and outputs.
- The Core CIOS Judgment Engine is the central decision-maker.
- The system processes raw uploaded documents via gating agents and preserves provenance for every signal.
- Existing engine or UI workflows (Define Question → Define Comparison Groups → Add Information → Judge → Decide → Respond → Simulate) must remain stable.

**Key Features and Design Principles:**
- **Bayesian Forecast Engine:** Transparent calculation of posterior probabilities.
- **AI-Powered Signal Detection & Review:** AI for signal extraction with human oversight.
- **Actor Behavioral Modeling:** Integrates a 6-actor model (KOL, HCP, Payer, Patient, Administrator, Competitor).
- **Calibration Learning Loop:** Continuous outcome tracking and bias adjustments.
- **Strategic Questions Engine & Challenge Mode:** Structured intelligence question generation and adversarial critique.
- **Forecast Ledger & Strategic Narrative Generator:** Tracks predictions and generates analytical narratives.
- **Transparency Overhaul:** Plain-language explanations for all numerical outputs.
- **Signal Dependency & Redundancy Control Layer:** Prevents posterior inflation from causally related signals.
- **Gate-Driven Scenario Planning:** Enables deterministic counterfactual forecasts.
- **Executive Judgment Layer:** Produces `ExecutiveJudgmentResult` with integrity checks and audit trails.
- **Barrier/Constraint Decomposition Layer:** Decomposes gates into operational drivers and abstract constraint categories.
- **Endpoint Signal Differentiation Layer:** Classifies evidence signals into four tiers and detects `SignalImbalance`.
- **Forecast Ledger (Calibration Memory):** Versions and persists forecasts with inference snapshots for calibration.
- **Decision-Based Comparison Groups:** AI extracts comparison groups from strategic questions.
- **Ask CIOS (Case-Aware Question Box):** Persistent panel for case-specific questions.
- **Respond Step:** Converts decision output into client-ready executive responses.
- **Universal Ingestion & Enterprise Data Import:** AI-powered extraction of decision questions and signals from various document types.
- **Decision/Environment Classification Engine:** AI pipelines for classifying decision archetypes, context, and extracting domain-specific signals.
- **MIOS/BAOS AI Agents:** MIOS identifies brand-specific clinical evidence; BAOS identifies HCP cognitive barriers.
- **Decision Gating Agent:** Orchestrates document processing, identifies business decisions, and routes content.
- **Temporal Relevance Guardrails:** Enforce recency rules for signals and evidence.
- **Calibration Reference Case Library:** Benchmark library of 13 curated archetype cases.
- **Adoption Segmentation Panel:** Translates forecasts into 8 segment-level adoption maps.
- **Barrier Diagnosis Panel:** Diagnoses dominant sources of adoption resistance across 10 categories.
- **Case Framing Layer:** Mandatory pre-signal-generation step deriving structured case metadata and defining `CaseFrame` (signal families, decision grammar, search targets, relevance rules, standardized output requirements) for 10 archetypes (6 core clinical-commercial + 4 enterprise/system-level).
- **Case Type Classifier & Routing:** Deterministic engine identifying 10 pharma case archetypes (launch_readiness, competitive_defense, access_expansion, clinical_adoption, lifecycle_management, market_shaping, investment_portfolio, operational_execution, strategic_partnership, policy_environment) and routing to appropriate modules, vocabulary, and constraints.
- **Standardized Output Requirements:** Every archetype frame mandates 7 structured output fields: top drivers, constraints, contradictions, probability, confidence, fragility, key monitor.
- **Readiness Timeline Panel:** Time-ordered readiness view across 10 milestone categories.
- **Competitive Risk Panel:** Identifies competitive forces across 12 categories.
- **Growth Feasibility Panel:** Synthesizes forecast outputs into actionable feasibility with a deterministic scoring engine.
- **Calibration & Performance Dashboard:** Aggregates Forecast Ledger data for metrics, calibration analysis, and bias detection.
- **Safety Signal Forecast Ceiling:** Guardrail applying probability ceilings in regulatory cases based on unresolved negative safety signals.
- **Challenge Mode Validation:** Validates forecast outputs against expected probability ranges.
- **Trial-Linked Evidence Clustering:** Detects shared trial identifiers to prevent over-counting.
- **Negative Signal Downward Pressure Floor:** Ensures negative-direction signals contribute to downward pressure.
- **Unified Confidence Display:** Presents a single primary confidence label per case.
- **Actors/Segments Simulation Engine:** Deterministic scenario simulation engine recomputing forecast outcomes under 13 controlled scenario types.
- **Phase 3 Clinical Endpoint Structural Controls:** Implements 9 structural controls for clinical outcome decisions.
- **Systematic Calibration Checks:** 5 pre-forecast bias checks (Evidence Echo, Anchor Bias, Missing Signal, Correlation, Overconfidence) run automatically.
- **Signal Domain Classification:** Each signal carries a `signal_domain` field (e.g., clinical_evidence, regulatory_activity).
- **Expanded Signal Direction Model:** Direction expanded to 6 values for richer signal interpretation.
- **MIOS Evidence Verification Guardrail:** Automated evidence verification layer extracting and verifying identifiers (PMID, DOI, NCT) against registries, with red-flag detection.
- **Archetype Signal Grammars (9 Archetypes):** Each CaseFrame includes `judgmentQuestions`, `correctSignalTypes`, and `incorrectSignalTypes`.
- **Signal Structure & Efficiency Upgrade:** Driver Role field (Primary Driver, Supporting Driver, Counterforce, Context Signal, Noise) auto-assigned to every signal with user override; Driver Coverage Validation checking 4 required categories (economic, structural, competitive, execution); Signal Map Panel grouping signals by mechanism; Causal Alignment Check flagging indirect signals; Signal Completeness Suggestions via AI analysis with one-click addition.
- **AI Signal Deduplication:** Semantic and similarity-based deduplication of signals.
- **Simulation Driver Traceability:** Simulation API returns `drivers` array with weight, direction, and rationale.
- **Probability Banding:** Formal bands (Low, Moderate, High, Very High) for probability display.
- **Negative Scenario Types:** Expanded scenario polarity (positive/negative/neutral/delay/reversal) and expected effects.
- **Canonical 5-Case Validation Pack:** Benchmark suite of 5 curated cases for validation.
- **AI-Structured Question Definition Workflow:** Multi-step question input flow where AI structures the question, performs feasibility checks, and proposes outcome states.
- **Question Repository with Cross-Step Persistence:** Saved questions (primary + secondary) persist to a PostgreSQL-backed repository (`questionRepositoryTable`) via CRUD API at `/api/cases/:caseId/questions`. A `SavedQuestionsPanel` component displays saved questions with status management (Analyze/Save/Defer/Discard) on all downstream workflow pages (Comparison Groups, Add Information, Judge, Decide, Respond). Repository writes are idempotent (clear-and-reinsert per case). Parent-child linkage uses deterministic `Q-{caseId}-primary` identifiers.

**Bounded Agent Architecture:** The system employs 15 bounded, deterministic, single-purpose AI agents (e.g., Decision Gating, Question Structuring, External Signal Scout, MIOS, BAOS) with fixed I/O schemas, all enforcing a `ProgramID` scope constraint.

## External Dependencies
- **PostgreSQL:** Relational database.
- **Express 5:** Backend framework.
- **React, Vite, Tailwind, Recharts, React Query:** Frontend technologies.
- **Drizzle ORM:** Object-Relational Mapper.
- **OpenAPI 3.1 & orval:** API specification and code generation.
- **OpenAI:** AI services for signal generation and market intelligence.
- **pdfjs-dist, mammoth, jszip, word-extractor, ppt-to-text:** Libraries for document text extraction.
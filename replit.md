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
- **Coherence Verification Agent:** Post-Respond verifier (8 deterministic rules) that validates output for rule compliance, internal coherence, and decision clarity before display. Cannot change probabilities, priors, signal weights, or invent data. When fail issues are found, LLM-assisted correction regenerates only presentation/coherence. Registered in agent chain after Interpretation, before Scenario Simulation.
- **Consistency and Determinism System:** Uses a Canonical Case Object (`canonicalFields` JSONB on `cases` table) for structured parsed fields and `forecast_snapshots` for drift detection and consistency scoring.
- **System Integrity Test Layer:** Internal validation module that tests 10 engine invariants on every forecast run, logging results to `integrity_test_results` table. Core invariant failures flag the forecast as unreliable.

## External Dependencies
- **PostgreSQL:** Relational database.
- **Express 5:** Backend framework.
- **React, Vite, Tailwind, Recharts, React Query:** Frontend technologies.
- **Drizzle ORM:** Object-Relational Mapper.
- **OpenAPI 3.1 & orval:** API specification and code generation.
- **OpenAI:** AI services.
- **pdfjs-dist, mammoth, jszip, word-extractor, ppt-to-text:** Libraries for document text extraction.
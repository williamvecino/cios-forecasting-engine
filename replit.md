# CIOS — Clinical Intelligence & Outcome System

## Overview
CIOS is a disease-agnostic, asset-agnostic, and specialty-flexible Bayesian forecasting platform. Its primary goal is to predict Healthcare Professional (HCP) adoption by translating prior probabilities into posterior probabilities using validated clinical signals and a 6-actor behavioral reaction model. The platform provides AI-powered, data-driven insights to forecast market adoption and stakeholder behavior across various medical assets and geographies, enhancing strategic decision-making in the healthcare industry and offering a comprehensive solution for strategic intelligence and market potential analysis.

## User Preferences
I prefer clear and concise information. I appreciate high-level summaries before diving into details. When implementing features, prioritize modular and maintainable code. For architectural decisions, provide the rationale. I expect the agent to ask for clarification if there are ambiguities in my requests and to inform me about significant changes or design choices before proceeding.

## System Architecture
CIOS is a monorepo built with pnpm workspaces. The frontend uses React, Vite, Tailwind CSS, Recharts, and React Query, featuring a question-driven "Aaru-like Decision Interface" with a dark theme. The backend is an Express 5 application in TypeScript, exposing APIs under `/api`. PostgreSQL handles data persistence via Drizzle ORM. API specifications adhere to OpenAPI 3.1, with `orval` for client and validation library generation.

**Core Architectural Principles:**
- All agents must be deterministic, single-purpose, with fixed inputs and outputs.
- The Core CIOS Judgment Engine is the central decision-maker; new agents act as support layers.
- The system must fail gracefully, processing raw uploaded documents via gating agents.
- Provenance must be preserved for every signal entering judgment.
- Existing engine or UI workflows (Define Question → Define Comparison Groups → Add Information → Judge → Decide → Respond → Simulate) should not be destabilized.

**Key Features and Design Principles:**
- **Bayesian Forecast Engine:** Calculates posterior probabilities with transparent calculation paths.
- **AI-Powered Signal Detection & Review:** Utilizes AI for signal extraction with human oversight.
- **Actor Behavioral Modeling:** Incorporates a 6-actor model (KOL, HCP, Payer, Patient, Administrator, Competitor).
- **Calibration Learning Loop:** Ensures continuous outcome tracking and bias adjustments.
- **Strategic Questions Engine & Challenge Mode:** Facilitates structured intelligence question generation and adversarial critique.
- **Forecast Ledger & Strategic Narrative Generator:** Tracks predictions and translates outputs into analytical narratives.
- **Transparency Overhaul:** Provides plain-language explanations for all numbers, scores, and recommendations.
- **Signal Dependency & Redundancy Control Layer:** Prevents posterior inflation from causally related signals by analyzing lineage, clustering, and compressing signals.
- **Gate-Driven Scenario Planning:** Enables deterministic counterfactual forecasts by modifying gate states.
- **Executive Judgment Layer:** A post-forecast engine producing a canonical `ExecutiveJudgmentResult` with integrity checks and audit trails.
- **Barrier Decomposition & Constraint Decomposition Layer:** Decomposes non-strong gates into operational drivers and maps to abstract constraint categories.
- **Endpoint Signal Differentiation Layer:** Classifies evidence signals into four tiers and detects `SignalImbalance`.
- **Forecast Ledger (Calibration Memory):** Automatically versions and persists forecasts with full inference snapshots, supporting resolution workflow and calibration.
- **Decision-Based Comparison Groups:** Derives outcome scenarios from strategic questions, with AI extracting comparison groups.
- **Ask CIOS (Case-Aware Question Box):** A persistent panel for open questions about the current case.
- **Respond Step:** Converts decision output into a client-ready executive response.
- **Universal Ingestion & Enterprise Data Import:** Allows uploading various document types for AI-powered extraction of decision questions and signals.
- **Decision Classification Engine:** AI pipeline for classifying decision archetypes and generating primary decisions with evidence support.
- **Environment Classification Pipeline:** AI pipeline for classifying decision context and extracting domain-specific signals.
- **MIOS/BAOS AI Agents:** MIOS identifies brand-specific clinical evidence; BAOS identifies HCP cognitive barriers.
- **Decision Gating Agent:** Orchestrates document processing, identifies business decisions, filters noise, and routes content.
- **Temporal Relevance Guardrails:** External Signal Scout and MIOS enforce recency rules for signals and evidence.
- **Calibration Reference Case Library:** A benchmark library of 13 curated archetype cases with similarity matching.
- **Adoption Segmentation Panel:** Translates forecast outputs into 8 segment-level adoption maps with drilldowns.
- **Barrier Diagnosis Panel:** Diagnoses dominant sources of adoption resistance across 10 categories.
- **Case Feedback Module:** Captures structured test observations per case.
- **Case Type Classifier:** Deterministic engine identifying 6 pharma case archetypes.
- **Readiness Timeline Panel:** Provides a time-ordered readiness view across 10 milestone categories and 6 time windows.
- **Competitive Risk Panel:** Identifies competitive forces across 12 categories.
- **Growth Feasibility Panel:** Synthesizes forecast probability, adoption segments, barrier diagnosis, readiness timeline, and competitive risk into actionable feasibility outputs with a deterministic scoring engine.
- **Calibration & Performance Dashboard:** Aggregates Forecast Ledger data into metrics, calibration analysis, and bias detection.
- **Case-Type-Aware Routing:** Central router (`lib/case-type-router.ts`) maps 8 case types (including Safety/Risk) to vocabulary, actor segments, visible/hidden modules, action constraints, and signal weight modifiers. Includes dynamic regulatory authority detection and safety case detection (runs before regulatory). Safety/Risk cases use dedicated risk-response posture segments, direction validation, media/advocacy signal downweighting, and feasibility timeline interpretation rules.
- **Safety Signal Forecast Ceiling:** A post-engine guardrail applies probability ceilings in regulatory cases based on unresolved negative safety signals.
- **Methodology Guidance Panel:** Collapsible guidance component in the workflow sidebar.
- **Challenge Mode Validation:** Validates forecast outputs against expected probability ranges for challenge cases.
- **Trial-Linked Evidence Clustering:** Detects shared trial identifiers across signal descriptions to prevent over-counting.
- **Negative Signal Downward Pressure Floor:** Ensures negative-direction signals contribute to downward pressure even with polarity violations.
- **Unified Confidence Display:** Presents a single primary confidence label per case.
- **Actors/Segments Simulation Engine:** Deterministic scenario simulation engine recomputes forecast outcomes under 13 controlled scenario types, including segment shifts and feasibility deltas.
- **Phase 3 Clinical Endpoint Structural Controls:** Implements 9 structural controls for clinical outcome decisions, including decision-type classification, evidence gate hierarchy, expanded outcome states, and signal classification for simulation.
- **MIOS/BAOS Workbook Signal Import Adapter:** Server-side route for importing signals from `.xlsx` workbooks.
- **Systematic Calibration Checks:** 5 pre-forecast bias checks (Evidence Echo, Anchor Bias, Missing Signal, Correlation, Overconfidence) run automatically before every probability update. Produces independent evidence count, uncertainty range, volatility score, and adjusted probability. Frontend panel displays results with collapsible detail view.
- **Signal Domain Classification:** Each signal carries a `signal_domain` field (clinical_evidence, safety_pharmacovigilance, regulatory_activity, guideline_activity, market_access, operational_readiness, competitive_dynamics, legal_litigation). Domain badges displayed on signal cards. Regulatory/safety cases auto-exclude operational_readiness domain signals.
- **Expanded Signal Direction Model:** Direction expanded from 3 to 6 values: increases_probability, decreases_probability, signals_uncertainty, signals_risk_escalation, operational_readiness, market_response. Legacy 3-value directions (positive/negative/neutral) normalized via `normalizeDirection()` in signal-gate-engine and backend post-processing.
- **AI Signal Deduplication:** Prompt-level semantic dedup rules + post-generation Jaccard similarity filter (>0.7 threshold) in `ai-signals.ts` removes redundant signals before returning to frontend.
- **Simulation Driver Traceability:** Simulation API returns `drivers` array with weight (HIGH/MODERATE/LOW), direction (supporting/opposing/neutral), and rationale for each key driver. Displayed in ResultsAccordion "Driver Analysis" section.
- **Probability Banding:** Formal bands (Low <30%, Moderate 30-60%, High 60-80%, Very High >80%) displayed in ProbabilityGauge and ExecutiveJudgment verdict panel.
- **Negative Scenario Types:** Scenario polarity dropdown (positive/negative/neutral/delay/reversal) and expanded expected effects (delays timeline, reverses prior trend) in simulate page. Polarity wired into scenario description and context data.
- **Canonical 5-Case Validation Pack:** Benchmark suite of 5 curated cases covering Regulatory (Xarelto label expansion), Launch/Generic Entry (Abilify Maintena generic), Physician Adoption (Kisqali CDK4/6 share), Competitive Positioning (Humira biosimilars), and Barrier/Access Friction (Leqembi uptake). Each case has 8–12 curated signals with computed LRs. Seeded via `POST /api/validation-pack/seed` (idempotent, transactional). Status at `GET /api/validation-pack/status`. Reset at `DELETE /api/validation-pack/reset` (dev-only). UI section in Case Library page shows seed status with one-click seeding.

- **AI-Structured Question Definition Workflow:** Multi-step question input flow replacing single-submit. Step 1: User enters question → AI structures it (archetype, boundedness, horizon, target outcome) with improvement explanation. Step 2: AI feasibility check validates 5 criteria (clear outcome, explicit horizon, observable event, decision relevance, model feasibility) and recommends binary or multi-state outcome structure with pre-populated states. User can edit the proposed question, re-check feasibility, and customize outcome states before proceeding. Feasibility gate prevents progression for not-feasible questions. Backend routes: `ai-refine-question.ts` (feasibility + outcome structure), `agent-question-structuring.ts` (structuring + improvement explanation).

**Bounded Agent Architecture:** The system employs 15 bounded, deterministic, single-purpose AI agents with fixed I/O schemas, including agents for Decision Gating, Question Structuring, External Signal Scout, Signal Normalizer, Signal Quality, Conflict Resolver, Case Comparator, Integrity, Actor Segmentation, Stakeholder Reaction, Prioritization, MIOS, and BAOS. All decision-facing agents enforce a `ProgramID` scope constraint.

## External Dependencies
- **PostgreSQL:** Relational database.
- **Express 5:** Backend framework.
- **React, Vite, Tailwind, Recharts, React Query:** Frontend technologies.
- **Drizzle ORM:** Object-Relational Mapper.
- **OpenAPI 3.1 & orval:** API specification and code generation.
- **OpenAI:** AI services for signal generation and market intelligence.
- **pdfjs-dist, mammoth, jszip, word-extractor, ppt-to-text:** Libraries for document text extraction.
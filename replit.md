# CIOS — Clinical Intelligence & Outcome System

## Overview
CIOS is a disease-agnostic, asset-agnostic, and specialty-flexible Bayesian forecasting platform. Its primary purpose is to predict Healthcare Professional (HCP) adoption by translating prior probabilities into posterior probabilities using validated clinical signals and a 6-actor behavioral reaction model. The platform delivers AI-powered, data-driven insights to forecast market adoption and stakeholder behavior across various medical assets and geographies, thereby enhancing strategic decision-making in the healthcare industry and providing a comprehensive solution for strategic intelligence and market potential analysis.

## User Preferences
I prefer clear and concise information. I appreciate high-level summaries before diving into details. When implementing features, prioritize modular and maintainable code. For architectural decisions, provide the rationale. I expect the agent to ask for clarification if there are ambiguities in my requests and to inform me about significant changes or design choices before proceeding.

## System Architecture
The CIOS platform is a monorepo utilizing pnpm workspaces. The frontend is built with React, Vite, Tailwind CSS, Recharts, and React Query, featuring a question-driven "Aaru-like Decision Interface" with a dark theme. The backend is an Express 5 application in TypeScript, exposing APIs under `/api`. PostgreSQL handles data persistence via Drizzle ORM. API specifications adhere to OpenAPI 3.1, with `orval` for client and validation library generation.

**Core Architectural Rules:**
- Agents must have a single, clear, deterministic function with fixed inputs and outputs.
- The Core CIOS Judgment Engine is the central decision-maker; new agents act as support layers.
- The system must fail gracefully, and raw uploaded documents are processed by gating agents.
- Provenance must be preserved for every signal entering judgment.
- Existing engine or UI workflows should not be destabilized. The 7-step workflow is: Define Question → Define Comparison Groups → Add Information → Judge → Decide → Respond → Simulate.

**Key Features and Design Principles:**
- **Bayesian Forecast Engine:** Calculates posterior probabilities with transparent calculation paths.
- **AI-Powered Signal Detection & Review:** Utilizes AI for signal extraction with human oversight.
- **Actor Behavioral Modeling:** Incorporates a 6-actor model (KOL, HCP, Payer, Patient, Administrator, Competitor).
- **Calibration Learning Loop:** Ensures continuous outcome tracking and bias adjustments.
- **Strategic Questions Engine & Challenge Mode:** Facilitates structured intelligence question generation and adversarial critique.
- **Forecast Ledger & Strategic Narrative Generator:** Tracks predictions and translates outputs into analytical narratives.
- **Signal Lifecycle Management:** Includes a Signal Watchlist, Competitor Behavior Register, and a comprehensive Signal Lifecycle & Audit System.
- **Forecast Interpretation Panel & AI-Powered Decision Analysis:** Provides confidence-sensitive summaries and actionable insights.
- **Forecast-Derived Decision Architecture:** Maps forecast gates to decision items using a deterministic engine.
- **Transparency Overhaul:** Every number, score, and recommendation includes plain-language "why" explanations via tooltips, sub-text, and "because" clauses.
- **Signal Dependency & Redundancy Control Layer (Phase 2 Hardened):** Prevents posterior inflation from causally related signals by analyzing lineage, clustering by root evidence, and compressing signals before posterior calculation. Phase 2 adds: confidence ceiling (single-family=65%, low-diversity=70%, moderate=80%), naive-vs-compressed comparison mode, tightened echo/translation classification with keyword-based rules, directionally-consistent root assignment, cluster-detail inspection UI, and full audit persistence in calibration logs. Covered by 46 gold-set unit tests across 4 pharma scenarios.
- **Gate-Driven Scenario Planning:** Enables deterministic counterfactual forecasts by modifying gate states.
- **Executive Judgment Layer (Integrity-Enforced):** A post-forecast judgment engine producing a single canonical `ExecutiveJudgmentResult` object with integrity checks and an audit trail.
- **Barrier Decomposition & Constraint Decomposition Layer:** Decomposes non-strong gates into operational drivers and maps to a dictionary of 19 abstract constraint categories.
- **Endpoint Signal Differentiation Layer:** Classifies evidence signals into four tiers (Dominant, Supporting, Neutral, Contradictory) and detects `SignalImbalance`.
- **Forecast Ledger (Calibration Memory):** Every forecast is automatically versioned and persisted with full inference snapshots including prior/posterior, confidence ceiling state, dependency metrics (diversity, fragility, concentration), top positive/negative drivers, lineage clusters, and environment adjustments. Supports resolution workflow (Resolved True/False/Partial/Not Resolvable), Brier scoring, calibration bucket tracking, update rationale, and version movement display.
- **Decision-Based Comparison Groups:** Step 2 derives outcome scenarios (not entities) from the strategic question. The AI interpretation agent extracts `comparisonGroups` from question alternatives (e.g., "Late 2026 launch" vs "Late 2027 launch"). Default groups auto-generated for launch timing, adoption, approval, and guideline questions. Users can edit/add/remove groups before proceeding. Signals and evidence are evaluated against these scenario groups.
- **Ask CIOS (Case-Aware Question Box):** A persistent panel for open questions about the current case across categories like Explanation, Counterfactual, Resolution, and Interpretation.
- **Respond Step:** Converts decision output into a client-ready executive response.
- **Import Project (Universal Ingestion) & Enterprise Data Import:** Allows uploading documents, images, or pasting text for AI-powered extraction of decision questions and signals.
- **Decision Classification Engine:** A mandatory AI pipeline for classifying decision archetypes and generating primary decisions with evidence support.
- **Environment Classification Pipeline:** A two-phase AI pipeline for classifying decision context and extracting domain-specific signals.
- **MIOS/BAOS AI Agents:** MIOS identifies brand-specific clinical evidence. BAOS identifies HCP cognitive barriers.
- **Decision Gating Agent:** Orchestrates document processing, identifies business decisions, filters noise, and routes content to MIOS, BAOS, or CIOS, generating ranked questions.
- **Temporal Relevance Guardrails:** External Signal Scout and MIOS enforce recency rules for signals and evidence.
- **Calibration Reference Case Library:** A benchmark library of 8 curated archetype cases (canonical success, failure, false confidence, access-constrained, workflow-friction, competitive disruption, guideline acceleration, operational constraint). Each case includes full dependency metrics, structural tags (11 tag types), calibration lessons, and bias patterns. Reference cases are informational only — they do not alter posterior calculations. A similarity endpoint matches live forecasts to comparable historical patterns based on evidence diversity, fragility, domain, and confidence level. Accessible at `/reference-cases`.
- **Calibration & Performance Dashboard:** System performance-monitoring layer at `/calibration`. Aggregates Forecast Ledger data into: core metrics (total/resolved/open forecasts, mean/median accuracy, overconfidence/underconfidence rates, mean absolute error, revision counts), calibration-by-bucket analysis (predicted vs actual frequency, gap), bias/failure pattern detection (8 structural patterns: concentration+miss, low diversity+miss, high fragility+miss, false confidence, overconfidence, underconfidence, ceiling-constrained, false low confidence), domain breakdowns, forecast revision analysis (multi-version cases with moved-closer tracking), and reference-case linkage (informational only). Supports filtering by domain, status, confidence range. API: `GET /api/forecast-ledger/dashboard`.

**Bounded Agent Architecture:** The system employs 15 bounded, deterministic, single-purpose, and optional AI agents, each with fixed I/O schemas. These include agents for Decision Gating, Question Structuring, External Signal Scout, Signal Normalizer, Signal Quality, Conflict Resolver, Case Comparator, Integrity, Actor Segmentation, Stakeholder Reaction, Prioritization, MIOS, and BAOS. All decision-facing agents are brand-anchored and enforce a `ProgramID` scope constraint.

## External Dependencies
- **PostgreSQL:** Relational database.
- **Express 5:** Backend framework.
- **React, Vite, Tailwind, Recharts, React Query:** Frontend technologies.
- **Drizzle ORM:** Object-Relational Mapper.
- **OpenAPI 3.1 & orval:** API specification and code generation.
- **OpenAI:** AI services for signal generation and market intelligence.
- **pdfjs-dist, mammoth, jszip, word-extractor, ppt-to-text:** Libraries for document text extraction.
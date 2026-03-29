# CIOS — Clinical Intelligence & Outcome System

## Overview
CIOS is a disease-agnostic, asset-agnostic, and specialty-flexible Bayesian forecasting platform designed to predict Healthcare Professional (HCP) adoption. It translates prior probabilities into posterior probabilities using validated clinical signals and a 6-actor behavioral reaction model. The platform delivers AI-powered, data-driven insights to forecast market adoption and stakeholder behavior across various medical assets and geographies, thereby enhancing strategic decision-making in the healthcare industry. CIOS aims to provide a comprehensive solution for strategic intelligence and market potential analysis.

## User Preferences
I prefer clear and concise information. I appreciate high-level summaries before diving into details. When implementing features, prioritize modular and maintainable code. For architectural decisions, provide the rationale. I expect the agent to ask for clarification if there are ambiguities in my requests and to inform me about significant changes or design choices before proceeding.

## System Architecture
The CIOS platform is a monorepo built with pnpm workspaces. The frontend uses React, Vite, Tailwind CSS, Recharts, and React Query, featuring a question-driven "Aaru-like Decision Interface" with a dark panel theme. The backend is an Express 5 application in TypeScript, exposing APIs under `/api`. Data persistence is managed by PostgreSQL via Drizzle ORM. API specifications adhere to OpenAPI 3.1, with `orval` used for client and validation library generation.

**Core Architectural Rules:**
- Agents must have a single, clear, deterministic function with fixed inputs and outputs, and should not perform another agent's job.
- The Core CIOS Judgment Engine remains the central decision-maker; new agents are support layers.
- The system must fail gracefully, and raw uploaded documents are processed by gating agents before judgment.
- Provenance must be preserved for every signal entering judgment.
- Existing engine or UI workflows should not be destabilized, and no new visible steps should be added to the 6-step workflow: Define Question → Add Information → Judge → Decide → Respond → Simulate.

**Key Features and Design Principles:**
- **Bayesian Forecast Engine:** Calculates posterior probabilities with transparent calculation paths, considering signal conflict and brand/final gap penalties.
- **AI-Powered Signal Detection & Review:** Utilizes AI for signal extraction with human oversight.
- **Actor Behavioral Modeling:** Incorporates a 6-actor model (KOL, HCP, Payer, Patient, Administrator, Competitor) to adjust forecasts.
- **Calibration Learning Loop:** Ensures continuous outcome tracking and bias adjustments.
- **Strategic Questions Engine & Challenge Mode:** Facilitates structured intelligence question generation and adversarial critique.
- **Forecast Ledger & Strategic Narrative Generator:** Tracks predictions and translates outputs into analytical narratives.
- **Signal Lifecycle Management:** Includes a Signal Watchlist, Competitor Behavior Register, and a comprehensive Signal Lifecycle & Audit System.
- **Forecast Interpretation Panel & AI-Powered Decision Analysis:** Provides confidence-sensitive summaries, actionable insights, and structured analysis for adoption segmentation and barrier diagnosis.
- **Forecast-Derived Decision Architecture:** Maps forecast gates to decision items using a deterministic engine, with AI providing contextual details.
- **Performance Stabilization Controls:** Implements state hashing, driver limits, duplicate driver checks, lightweight logging, and partial UI rendering.
- **UI/UX:** Single-step question entry, redesigned forecast page with enterprise decision layout, tables, collapsible sections, and color-coded indicators, using executive decision terminology.
- **Minimum Signal Model & AI-Powered Signal Generation:** Signal cards display essential attributes, and AI generates observed, derived, or uncertainty signals.
- **Event Decomposition Layer:** AI decomposes questions into 3-6 "event gates" to influence constrained probability.
- **Engine Guardrails:** Critical pre- and post-processing steps for data integrity.
- **Signal Persistence & Driver Impact Distribution:** Accepted signals are saved, and probability shifts are proportionally distributed.
- **Forecast Meaning Panel & Decision Lab Summary:** Provides plain-language interpretations and identifies constraints.
- **Gate-Driven Scenario Planning:** Enables deterministic counterfactual forecasts by modifying gate states.
- **Executive Judgment Layer (Integrity-Enforced):** A post-forecast judgment engine producing a single canonical `ExecutiveJudgmentResult` object with integrity checks and an audit trail.
- **Barrier Decomposition:** Decomposes non-strong gates into 2-5 specific operational drivers.
- **Constraint Decomposition Layer:** Provides a canonical dictionary of 19 abstract constraint categories, each mapped to 5 concrete drivers with impact scoring.
- **Endpoint Signal Differentiation Layer:** A pre-judgment interpretation step classifying evidence signals into four tiers (Dominant, Supporting, Neutral, Contradictory) based on effect size, strength, and contribution, producing a ranked `SignalHierarchy` and detecting `SignalImbalance`.
- **Judgment Integrity Test Set:** A suite of 43 locked tests covering various aspects of output integrity and coherence.
- **Clickable Analogues:** Historical precedent section with clickable buttons for detailed analog case analysis.
- **Ask CIOS (Case-Aware Question Box):** A persistent panel on the Judge page for open questions about the current case across 4 categories: Explanation, Counterfactual, Resolution, and Interpretation.
- **Respond Step:** Converts decision output into a client-ready executive response.
- **6-Step Workflow:** Define Question → Add Information → Judge → Decide → Respond → Simulate.
- **Archetype Library & Assignment:** Uses 5 deterministic archetypes for adoption segmentation and simulation.
- **Import Project (Universal Ingestion) & Enterprise Data Import:** Allows uploading documents, images, or pasting text for AI-powered extraction of decision questions and signals, supporting multi-file bundles.
- **Decision Classification Engine:** A mandatory AI pipeline for all ingestion paths that classifies decision archetypes and generates primary decisions with evidence support.
- **Environment Classification Pipeline:** A two-phase AI pipeline for classifying decision context and extracting domain-specific signals.
- **Forecast Export:** One-click export from the "Decide" page in PDF, Excel, and structured JSON.
- **Simulate Adoption Reaction:** Allows testing segment responses to materials.
- **Extraction Validation Framework:** Ensures minimally viable case generation through graceful degradation.
- **Assumption Registry (DB-backed):** Automatically extracts and tracks all inferred/explicit assumptions.
- **MIOS/BAOS AI Agents:** MIOS (POST /api/agents/mios) is a bounded AI agent that takes brand+question, identifies belief shifts, and finds brand-specific clinical evidence with trial citations (PubMed-style). BAOS (POST /api/agents/baos) takes MIOS evidence + brand + question, identifies HCP cognitive barriers with named cognitive lenses (Status Quo Bias, Loss Aversion, etc.). MiosBaosPanel on signals page runs MIOS → BAOS pipeline sequentially, accepted signals are persisted and trigger gate recalculation. MIOS signals: signal_family="brand_clinical_regulatory", category="evidence", source_type="MIOS". BAOS signals: signal_family="provider_behavioral", category="adoption", source_type="BAOS". No prebuilt hardcoded signals auto-injected; Excel workbook import remains as alternative path.
- **Decision Gating Agent:** An orchestration agent that reads uploaded documents, identifies the real business decision, filters noise, and routes content to MIOS, BAOS, or CIOS, generating separate recommended questions per system.

## Bounded Agent Architecture (15 agents total)
All agents follow canonical invariants: bounded (fixed I/O schema), deterministic (temperature=0, seed=42), single-purpose, and optional.

| # | Agent | Endpoint | Frontend Location | Status |
|---|-------|----------|-------------------|--------|
| 1 | Decision Gating | POST /api/decision-gating | Upload step | BUILT |
| 2 | Question Structuring | POST /api/agents/question-structuring | Define Question | BUILT |
| 3 | External Signal Scout | POST /api/agents/external-signal-scout | Add Information | BUILT |
| 4 | Signal Normalizer | POST /api/agents/signal-normalizer | Add Information | BUILT |
| 5 | Signal Quality | POST /api/agents/signal-quality | Add Information | BUILT |
| 6 | Conflict Resolver | POST /api/agents/conflict-resolver | Add Information | BUILT |
| 7 | Case Comparator | POST /api/agents/case-comparator | Judge | BUILT |
| 8 | Integrity | POST /api/agents/integrity | Judge | BUILT |
| 9 | Actor Segmentation | POST /api/agents/actor-segmentation | Simulate | BUILT |
| 10 | Stakeholder Reaction | POST /api/agents/stakeholder-reaction | Simulate | BUILT |
| 11 | Prioritization | POST /api/agents/prioritization | Decide | BUILT |
| 12 | Provenance | buildProvenance() helper | SignalProvenanceDrawer | BUILT |
| 13 | Core Engine | lib/core-forecast-engine.ts | Judge (frozen) | BUILT |
| 14 | MIOS | POST /api/agents/mios | Add Information (MiosBaosPanel) | BUILT |
| 15 | BAOS | POST /api/agents/baos | Add Information (MiosBaosPanel) | BUILT |

**Brand-Anchoring Audit (Complete):** All decision-facing agents (Actor Segmentation, Case Comparator, Prioritization, Stakeholder Reaction, External Signal Scout) accept `brand` and `therapeuticArea` fields and enforce domain-specific reasoning. Agents produce only stakeholders, analogs, actions, reactions, and signals relevant to the specific drug and therapeutic area — no generic consulting output.

**Validation Harness:** 13 core tests (A-M) + 40 cross-domain tests (4 cases × 10 agents) in `agent-validation-harness.ts`. 43 locked unit tests.
**Cross-Domain Test Cases:** Oncology (anti-PDL1 RFP), Cardiology (beta-blocker combo), MedTech (AI liquid biopsy), Rare Disease (gene therapy), Digital Health (PDT for T2D).

## External Dependencies
- **PostgreSQL:** Relational database management system.
- **Express 5:** Backend web application framework.
- **React, Vite, Tailwind, Recharts, React Query:** Frontend libraries and tools.
- **Drizzle ORM:** Object-Relational Mapper.
- **OpenAPI 3.1 & orval:** API specification and code generation.
- **OpenAI:** Used for AI signal generation, market intelligence research, and project material analysis.
- **pdfjs-dist, mammoth, jszip, word-extractor, ppt-to-text:** Backend document text extraction libraries.
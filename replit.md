# CIOS — Clinical Intelligence & Outcome System

## Overview
CIOS is a disease-agnostic, asset-agnostic, and specialty-flexible Bayesian forecasting platform. Its primary purpose is to predict Healthcare Professional (HCP) adoption by translating prior probabilities into posterior probabilities using validated clinical signals and a 6-actor behavioral reaction model. The platform delivers AI-powered, data-driven insights to forecast market adoption and stakeholder behavior across various medical assets and geographies, thereby enhancing strategic decision-making in the healthcare industry. CIOS aims to provide a comprehensive solution for strategic intelligence and market potential analysis.

## User Preferences
I prefer clear and concise information. I appreciate high-level summaries before diving into details. When implementing features, prioritize modular and maintainable code. For architectural decisions, provide the rationale. I expect the agent to ask for clarification if there are ambiguities in my requests and to inform me about significant changes or design choices before proceeding.

## System Architecture
The CIOS platform is built as a monorepo using pnpm workspaces. The frontend is developed with React, Vite, Tailwind CSS, Recharts, and React Query, featuring an "Aaru-like Decision Interface" with a question-driven design and a dark panel theme. The backend is an Express 5 application in TypeScript, exposing APIs under `/api`. Data persistence is managed by PostgreSQL via Drizzle ORM. API specifications adhere to OpenAPI 3.1, with `orval` used for client and validation library generation.

**Core System Design Principles:**
- **Bayesian Forecast Engine:** Calculates posterior probabilities considering signal conflict and brand/final gap penalties. It includes a transparent forecast calculation path.
- **AI-Powered Signal Detection & Review:** Utilizes AI for signal extraction with human oversight.
- **Actor Behavioral Modeling:** Incorporates a 6-actor model (KOL, HCP, Payer, Patient, Administrator, Competitor) to adjust forecasts.
- **Calibration Learning Loop & Hierarchical Calibration Fallback:** Ensures continuous outcome tracking, bias adjustments, and robust calibration.
- **Strategic Questions Engine & Challenge Mode:** Facilitates structured intelligence question generation and adversarial critique.
- **Forecast Ledger & Strategic Narrative Generator:** Tracks predictions and translates outputs into analytical narratives.
- **Signal Lifecycle Management:** Includes a Signal Watchlist, Competitor Behavior Register, and a comprehensive Signal Lifecycle & Audit System.
- **Forecast Interpretation Panel & AI-Powered Decision Analysis:** Provides confidence-sensitive summaries, actionable insights, and structured analysis for adoption segmentation and barrier diagnosis.
- **Forecast-Derived Decision Architecture:** Maps forecast gates to decision items using a deterministic engine, with AI providing contextual details.
- **Performance Stabilization Controls:** Implements state hashing, driver limits, duplicate driver checks, lightweight logging, and partial UI rendering.

**Key Features:**
- **UI/UX:** Features a single-step question entry, a redesigned forecast page with an enterprise decision layout, tables, collapsible sections, and color-coded indicators, using executive decision terminology.
- **Single-Step Question Entry & Workflow Gating:** Users input questions in plain language, creating a case, with content blocked until an active question exists.
- **Minimum Signal Model & AI-Powered Signal Generation:** Signal cards display essential attributes, and AI generates observed, derived, or uncertainty signals.
- **Event Decomposition Layer:** AI decomposes questions into 3-6 "event gates" to influence constrained probability.
- **Engine Guardrails:** Critical pre- and post-processing steps for data integrity, including driver deduplication and input validation.
- **Signal Persistence & Driver Impact Distribution:** Accepted signals are saved, and probability shifts are proportionally distributed.
- **Forecast Meaning Panel & Decision Lab Summary:** Provides plain-language interpretations, identifies constraints, and offers a deterministic interpretive panel.
- **Gate-Driven Scenario Planning:** Enables deterministic counterfactual forecasts by modifying gate states.
- **Executive Judgment Layer (Integrity-Enforced):** A post-forecast judgment engine (`judgment-engine.ts`) producing a single canonical `ExecutiveJudgmentResult` object with 5 integrity checks and an audit trail (`_audit: JudgmentAudit`).
- **Barrier Decomposition:** Decomposes non-strong gates into 2-5 specific operational drivers on the Decide page.
- **Constraint Decomposition Layer (Headline-Level):** Provides a canonical dictionary of 19 abstract constraint categories, each mapped to 5 concrete drivers with impact scoring, ranked for display in the Executive Judgment panel.
- **Judgment Integrity Test Set:** A suite of 34 locked tests covering deterministic output, causal sensitivity, contradiction detection, narrative coherence, and constraint decomposition.
- **Clickable Analogues:** Historical precedent section in the Executive Judgment panel with clickable buttons for detailed analog case analysis.
- **Ask CIOS (Case-Aware Question Box):** A persistent panel on the Judge page (`ExplainBox.tsx`) for open questions about the current case across 4 categories: Explanation, Counterfactual, Resolution, and Interpretation, powered by a deterministic `explain-service.ts`.
- **Respond Step:** Converts decision output into a client-ready executive response with 5 sections.
- **6-Step Workflow:** Define Question → Add Information → Judge → Decide → Respond → Simulate.
- **Archetype Library & Assignment:** Uses 5 deterministic archetypes for adoption segmentation and simulation.
- **Import Project (Universal Ingestion) & Enterprise Data Import:** Allows uploading documents, images, or pasting text for AI-powered extraction of decision questions and signals, supporting multi-file bundles.
- **Decision Classification Engine (Mandatory Gated Layer):** A mandatory AI pipeline for all ingestion paths that classifies decision archetypes and generates primary decisions with evidence support, stored in `decision_classifications`.
- **Environment Classification Pipeline:** A two-phase AI pipeline for classifying decision context and extracting domain-specific signals.
- **Forecast Export:** One-click export from the "Decide" page in PDF, Excel, and structured JSON.
- **Simulate Adoption Reaction:** Allows testing segment responses to materials.
- **Extraction Validation Framework:** A platform-wide reliability layer ensuring minimally viable case generation through graceful degradation.
- **Assumption Registry (DB-backed):** Automatically extracts and tracks all inferred/explicit assumptions.

## External Dependencies
- **PostgreSQL:** Relational database management system.
- **Express 5:** Backend web application framework.
- **React, Vite, Tailwind, Recharts, React Query:** Frontend libraries and tools.
- **Drizzle ORM:** Object-Relational Mapper.
- **OpenAPI 3.1 & orval:** API specification and code generation.
- **OpenAI:** For AI signal generation, market intelligence research, and project material analysis.
- **pdf-parse, mammoth, jszip, word-extractor, ppt-to-text:** Backend document text extraction libraries.
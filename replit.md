# CIOS — Clinical Intelligence & Outcome System

## Overview
CIOS is a disease-agnostic, asset-agnostic, and specialty-flexible Bayesian forecasting platform designed to predict Healthcare Professional (HCP) adoption. It translates prior probabilities into posterior probabilities using validated clinical signals and a 6-actor behavioral reaction model. The platform delivers AI-powered, data-driven insights to forecast market adoption and stakeholder behavior across various medical assets and geographies, ultimately enhancing strategic decision-making in the healthcare industry.

## User Preferences
I prefer clear and concise information. I appreciate high-level summaries before diving into details. When implementing features, prioritize modular and maintainable code. For architectural decisions, provide the rationale. I expect the agent to ask for clarification if there are ambiguities in my requests and to inform me about significant changes or design choices before proceeding.

## System Architecture
The CIOS platform is a monorepo utilizing pnpm workspaces. The frontend is built with React, Vite, Tailwind CSS, Recharts, and React Query, emphasizing an "Aaru-like Decision Interface" with a question-driven design. The backend is an Express 5 application in TypeScript, exposing APIs under `/api`. Data persistence is managed by PostgreSQL via Drizzle ORM. API specifications adhere to OpenAPI 3.1, with `orval` used for client and validation library generation.

**Core System Design Principles:**
- **Bayesian Forecast Engine:** Calculates posterior probabilities using correlation-aware signal likelihood ratio products and an exponential net actor translation. Confidence now accounts for signal conflict (positive vs negative balance) and brand/final gap penalties. Gate-constrained final forecast uses brand outlook as the pre-gate ceiling (eliminates double-constraining). Forecast Calculation Transparency panel shows full calculation path (prior, brand outlook, gate caps, final, gap, driver counts).
- **AI-Powered Signal Detection & Review:** Facilitates AI-driven extraction of candidate signals with human oversight.
- **Actor Behavioral Modeling:** Incorporates a 6-actor model (KOL, HCP, Payer, Patient, Administrator, Competitor) to adjust forecasts.
- **Calibration Learning Loop:** Continuously tracks outcomes, computes Brier scores, and applies bias adjustments.
- **Hierarchical Calibration Fallback:** Ensures robust calibration in data-scarce scenarios.
- **Strategic Questions Engine & Challenge Mode:** Enables structured intelligence question generation and adversarial critique.
- **Forecast Ledger:** Tracks predictions against actual outcomes.
- **Strategic Narrative Generator:** Transforms forecast outputs into publication-ready analytical narratives.
- **Signal Lifecycle Management:** Includes a Signal Watchlist, Competitor Behavior Register, and a comprehensive Signal Lifecycle & Audit System.
- **Forecast Interpretation Panel:** Provides confidence-sensitive summaries and actionable insights.
- **AI-Powered Decision Analysis:** Generates structured analysis for adoption segmentation, barrier diagnosis, and recommended actions.
- **Forecast-Derived Decision Architecture:** Uses a deterministic engine to map forecast gates to decision items, with AI providing contextual details.
- **Performance Stabilization Controls:** Implements state hashing, driver limits, duplicate driver checks, lightweight logging, and partial UI rendering.

**Key Features:**
- **UI/UX:** Single-step question entry, redesigned forecast page with a dark panel theme, and an enterprise decision layout. Information is presented using tables, collapsible sections, and color-coded indicators. Executive decision terminology is used throughout.
- **Single-Step Question Entry:** Users input questions in plain language, which the system interprets to create a case.
- **Workflow Gating:** Content is blocked until an active question exists.
- **Minimum Signal Model:** Signal cards display essential attributes: text, Direction, Importance, Confidence, and Source.
- **AI-Powered Signal Generation:** Generates `observed`, `derived`, or `uncertainty` signals with translation fields and `question_relevance_note`.
- **Event Decomposition Layer:** AI decomposes questions into 3-6 "event gates," influencing `constrained_probability`.
- **Engine Guardrails:** Critical pre- and post-processing steps including driver deduplication, shift caps, normalization, event gating constraints, and input validation.
- **Signal Persistence:** Accepted signals are saved to the database and `localStorage`.
- **Driver Impact Distribution:** Total probability shift is proportionally distributed across signals.
- **Forecast Meaning Panel:** Provides plain-language interpretations, identifies primary constraints, and suggests actions.
- **Decision Lab Summary:** A deterministic 7-section interpretive panel on the forecast page.
- **Gate-Driven Scenario Planning:** Enables deterministic counterfactual forecasts by modifying gate states.
- **Executive Judgment Layer (Integrity-Enforced):** A post-forecast judgment engine (`judgment-engine.ts`) producing a single canonical `ExecutiveJudgmentResult` object from a structured `JudgmentInput`. All narrative, confidence, posture, and uncertainty are derived from this one object — no separate calculations. Includes 5 integrity checks with auto-correction: (1) positive-majority + strong gates cannot produce negative polarity outcome, (2) uncertainty type cannot pair with high confidence, (3) large execution gap cannot produce high confidence, (4) strong gates + positive majority cannot produce sub-30% forecast, (5) moderate gates cannot cap below 50%. Every run produces a `_audit: JudgmentAudit` with full inputs, confidence breakdown, outcome rule trace, posture rule trace, and integrity check results. The Judgment Audit Trail panel renders entirely from this audit object.
- **Barrier Decomposition:** The Decide page (Step 4) decomposes each non-strong gate into 2-5 specific operational drivers. Each driver shows: Driver name, Current State, Impact on Adoption, What Would Improve It, Expected Effect. Drivers are AI-generated but structurally validated (all 5 fields required, malformed entries filtered). Server-side normalization maps AI keys to gate IDs regardless of key format. Gate labels are never repeated as driver names.
- **Constraint Decomposition Layer (Headline-Level):** `constraint-drivers.ts` provides a canonical dictionary of 19 abstract constraint categories, each mapped to 5 concrete drivers with severity/probability/reach scores. Impact scoring = severity × probability × reach × status multiplier (weak=1.0, unresolved=0.9, moderate=0.6, strong=0.2). Ranks: ≥300 High, ≥150 Moderate, else Low. `enforceDecomposition()` throws if abstract constraint has no drivers. `primaryConstraints` field on `ExecutiveJudgmentResult` promotes non-strong gates to headline level with top 1-3 drivers and a lever sentence (e.g., "Resolving X could raise the outlook from Y% to ~Z%"). Displayed directly in the Executive Judgment panel under "What Is Holding This Back" — not hidden in audit trail. Each constraint card shows: label, status badge, ranked primary drivers, and most effective lever. Strong gates excluded. Full decomposition remains in `_audit.constraintDecomposition` for backend completeness. DECOMP-ENFORCEMENT integrity check fires if enforcement fails.
- **Judgment Integrity Test Set:** 34 locked tests in `judgment-engine.test.ts` across 8 groups: signal dominance (3), gate stress (3), confidence integrity (3), static regression (1), single-variable sensitivity (4), contradiction stress (6), audit trail completeness (7), narrative integrity (7). Tests cover: deterministic output, causal sensitivity, contradiction detection, narrative coherence, constraint decomposition (audit structure, abstract gates have drivers, drivers sorted by impact, enforcement throws for unmapped abstracts, reasoning includes specific driver names), and primaryConstraints (non-strong gates with drivers/levers, empty when all strong). Run with `pnpm --filter @workspace/cios-frontend test`.
- **Respond Step (Step 5):** Converts decision output into a client-ready executive response with 5 sections: Strategic Recommendation, Why This Matters, Priority Actions, Success Measures, and Execution Focus.
- **6-Step Workflow:** Define Question → Add Information → Judge → Decide → Respond → Simulate.
- **Archetype Library & Assignment:** Utilizes 5 deterministic archetypes for adoption segmentation and archetype-aware simulation prompts.
- **Import Project (Universal Ingestion):** Allows users to upload documents, images, or paste text to automatically extract decision questions, key signals, and missing signals, supporting various file formats. Multi-file bundle upload is supported, processing each file independently and merging signals with source attribution.
- **Enterprise Data Import:** Universal data ingestion on the "Add Information" page for all file types and pasted text, with AI-powered signal extraction contextualized to the active question.
- **Decision Classification Engine (Mandatory Gated Layer):** Every ingestion path (PDF, PPT, DOC, image, text, bundle) runs a mandatory decision archetype classification before question generation. Fixed pipeline: Content Recovery → Document Type Detection → Domain Classification → Decision Archetype Classification → Primary Decision Generation → Signal Extraction → Confidence Scoring → User Confirmation. 11 fixed archetypes (Launch Strategy, Adoption Risk, Market Access, Competitive Positioning, Operational Readiness, Resource Allocation, Stakeholder Behavior, Capability Gap, Vendor Selection, Portfolio Strategy, Evidence Positioning). Four mandatory checks: (1) Wrapper vs Decision — distinguishes document format from actual business decision; (2) Explicit Ask vs Implied Ask — prefers strategic implication; (3) Primary vs Secondary Decisions; (4) Evidence Support — 3-5 exact text spans from the document proving the classification. Vendor selection guardrail: auto-downgrade if no explicit evaluation criteria. Output includes: document type, primary/secondary archetypes, evidence spans, secondary decisions, alternative archetype, confidence level + rationale, guardrail status. DB-persisted in `decision_classifications` table for auditability. Frontend shows full classification panel with document type badge, evidence spans under "Why we classified it this way", secondary decisions, alternative archetype, and confidence badge. Test suite: 6 document types in `decision-classification.test.ts`.
- **Environment Classification Pipeline:** A two-phase AI pipeline that classifies decision context and extracts domain-specific grounded signals.
- **Forecast Export:** One-click export from the "Decide" page in PDF, Excel, and structured JSON formats.
- **Simulate Adoption Reaction:** Allows testing segment responses to specific materials by extracting material features and scoring segment/archetype reactions.
- **Extraction Validation Framework:** A platform-wide reliability layer ensuring all ingestion paths produce a minimally viable case through graceful degradation and fallback mechanisms.
- **Assumption Registry (DB-backed):** Automatically extracts and tracks all inferred/explicit assumptions underlying forecasts, constraints, and recommendations, persisted in PostgreSQL.

## External Dependencies
- **PostgreSQL:** Relational database management system.
- **Express 5:** Backend web application framework.
- **React, Vite, Tailwind, Recharts, React Query:** Frontend libraries and tools.
- **Drizzle ORM:** Object-Relational Mapper.
- **OpenAPI 3.1 & orval:** API specification and code generation.
- **OpenAI:** For AI signal generation, market intelligence research, and project material analysis.
- **pdf-parse, mammoth, jszip, word-extractor, ppt-to-text:** Backend document text extraction for various file formats.
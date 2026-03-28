# CIOS — Clinical Intelligence & Outcome System

## Overview
CIOS is a disease-agnostic, asset-agnostic, and specialty-flexible Bayesian forecasting platform. Its core purpose is to predict Healthcare Professional (HCP) adoption by translating prior probabilities into posterior probabilities using validated clinical signals and a 6-actor behavioral reaction model. The platform provides AI-powered, data-driven insights for understanding and forecasting market adoption and stakeholder behavior across various medical assets and geographies, aiming to enhance strategic decision-making in the healthcare industry.

## User Preferences
I prefer clear and concise information. I appreciate high-level summaries before diving into details. When implementing features, prioritize modular and maintainable code. For architectural decisions, provide the rationale. I expect the agent to ask for clarification if there are ambiguities in my requests and to inform me about significant changes or design choices before proceeding.

## System Architecture
The CIOS platform is a monorepo built with pnpm workspaces. The frontend uses React, Vite, Tailwind CSS, Recharts, and React Query, focusing on an "Aaru-like Decision Interface" with a question-driven design. The backend is an Express 5 application in TypeScript, exposing APIs under `/api`. Data persistence is managed by PostgreSQL via Drizzle ORM. API specifications follow OpenAPI 3.1, with `orval` for client and validation library generation.

**Core System Design Principles:**
- **Bayesian Forecast Engine:** Calculates posterior probabilities using prior odds, correlation-aware signal likelihood ratio products, and an exponential net actor translation.
- **AI-Powered Signal Detection & Review:** Facilitates AI-driven extraction of candidate signals with human review for data validation.
- **Actor Behavioral Modeling:** Incorporates a 6-actor model (KOL, HCP, Payer, Patient, Administrator, Competitor) to adjust forecasts based on behavioral reactions.
- **Calibration Learning Loop:** Continuously tracks outcomes, computes Brier scores, and applies bias adjustments.
- **Hierarchical Calibration Fallback:** Ensures robust calibration in data-scarce scenarios.
- **Learning Coverage Expansion:** Adaptive system for acquiring and ingesting new learning cases.
- **Analog Retrieval System:** Provides a calibrated library of cases for similarity-based matching.
- **Decision-Path Actor Modeling:** Defines 5 distinct HCP archetypes with varying signal sensitivities.
- **Strategic Questions Engine & Challenge Mode:** Enables generation of structured intelligence questions and adversarial critique.
- **Forecast Ledger:** Tracks predictions against actual outcomes.
- **Strategic Narrative Generator:** Transforms forecast outputs into publication-ready analytical narratives.
- **Signal Lifecycle Management:** Includes a Signal Watchlist, Competitor Behavior Register, and a comprehensive Signal Lifecycle & Audit System.
- **Target Resolution Layer:** Manages hierarchical targeting with scope-based signal filtering.
- **Forecast Interpretation Panel:** Provides confidence-sensitive summaries and actionable insights.
- **National Adopter Discovery Agent:** Identifies adoption candidates based on strategic questions and structured signals.
- **AI-Powered Decision Analysis:** Generates structured analysis for adoption segmentation, barrier diagnosis, and recommended actions.
- **Forecast-Derived Decision Architecture:** Uses a deterministic engine to map forecast gates to decision items, with AI providing contextual details.
- **Performance Stabilization Controls:** Implements state hashing, driver limits, duplicate driver checks, lightweight logging, and partial UI rendering.

**Key Features:**
- **UI/UX:** Single-step question entry, redesigned forecast page with dark panel theme, enterprise decision layout. Information is presented using tables, collapsible sections, and color-coded indicators. All language uses executive decision terms.
- **Single-Step Question Entry:** Users type a question in plain language, and the system interprets it (via GPT-4o or local regex parser), creates a case, and navigates to Step 2.
- **Workflow Gating:** Content is blocked until an active question exists.
- **Minimum Signal Model (Step 2):** Signal cards display essential attributes: signal text, Direction, Importance, Confidence, and Source. Technical metadata is available via an "Advanced View" toggle.
- **AI-Powered Signal Generation:** Generates `observed`, `derived`, or `uncertainty` signals with translation fields and `question_relevance_note`, informed by brand development checks and real-time web research.
- **Event Decomposition Layer:** AI decomposes questions into 3-6 "event gates," each influencing `constrained_probability`.
- **Engine Guardrails:** Critical pre- and post-processing steps including driver deduplication, shift caps, normalization, event gating constraints, and input validation.
- **Find New Signals:** Allows searching public sources for structured signals with optional keyword input.
- **Signal Persistence:** Accepted signals are saved to the database and `localStorage`.
- **Signal Priority & Locking:** Signals carry `priority_source` and `is_locked` fields, influencing evidence weight and AI regeneration.
- **Signal Conflict Detection:** Flags opposing-direction signals on the same category.
- **Driver Impact Distribution:** Total probability shift is proportionally distributed across signals.
- **Forecast Meaning Panel:** Provides plain-language interpretations, identifies primary constraints, and suggests actions.
- **Decision Lab Summary:** A deterministic 7-section interpretive panel rendered on the forecast page, deriving insights from forecast outputs.
- **Gate-Driven Scenario Planning:** Enables deterministic counterfactual forecasts by modifying gate states.
- **Signal-to-Gate Mapping Engine:** Deterministically maps signals to gates using keyword scoring.
- **Executive Judgment Layer:** A post-forecast judgment engine (`judgment-engine.ts`) classifies case type, retrieves analog cases, and generates a structured Executive Judgment block.
- **Workflow Language:** Uses executive decision terminology (e.g., "Judge," "Decide").
- **Respond Step (Step 5):** Converts decision output into a client-ready executive response with 5 sections: Strategic Recommendation, Why This Matters (drivers/risks), Priority Actions (sequenced), Success Measures (metric/target/timeframe), and Execution Focus (primary/secondary/avoid). Includes Copy All and Regenerate functionality. Uses `/api/ai-respond/generate` endpoint.
- **6-Step Workflow:** Define Question → Add Information → Judge → Decide → Respond → Simulate. Sidebar and `WorkflowStep` type include all 6 steps. Respond page has "Continue to Simulate" CTA.
- **Archetype Library & Assignment:** 5 deterministic archetypes (Evidence-Driven Innovator, Operational Pragmatist, Guideline Follower, Financial Gatekeeper, Skeptical Conservative). Fully deterministic assignment engine (no LLM). Archetypes surface in Decide (adoption segmentation badges with triggers/barriers) and Simulate (segment selection cards, archetype-aware simulation prompts). Archetype data flows: `ai-decide.ts` → `decideResult` localStorage → Simulate page reads and passes to API.
- **Legacy Case Redirect:** All `/case/:caseId/*` routes redirect to the current 6-step workflow UI, translating legacy DB schema to `ActiveQuestion` format.
- **Import Project:** Allows users to upload documents, images (JPG/PNG/WebP), or paste text (including Ctrl+V clipboard paste of images) to automatically extract decision questions, key signals, and missing signals, creating a new case. Images are analyzed via GPT-4o vision. Includes environment classification.
- **Enterprise Data Import:** Universal data ingestion on the Step 2 "Add Information" page for all file types (PDF, PPTX, Excel, CSV, JSON, images, text files) and pasted text, with AI-powered signal extraction contextualized to the active question.
- **Environment Classification Pipeline:** Two-phase AI pipeline that first classifies the decision context (Clinical Adoption, Operational Deployment, Regulatory Approval, Commercial Launch, Technology Implementation), then uses domain-specific signal libraries to extract grounded signals. Enforces the rule that signals come from the environment, not from templates. Color-coded environment badges shown in both Import Project and Import Data dialogs.
- **Forecast Export:** One-click export from the Step 4 "Decide" page in PDF, Excel, and structured JSON formats, including comprehensive forecast details and executive judgment.
- **Simulate Adoption Reaction:** Downstream of Respond (accessible via button). Tests how defined segments (Early Adopters, Persuadables, Late Movers, Resistant) respond to specific materials (uploaded files or pasted text). Two-phase pipeline: (1) Material Feature Extraction — extracts reaction-relevant features (efficacy strength, survival benefit, safety reassurance, real-world evidence, guideline relevance, access support, HEOR/cost-effectiveness, workflow convenience, operational support, comparative evidence, implementation burden, patient support/adherence) as a feature map with strength ratings (strong/moderate/weak/absent), NOT a document summary; (2) Reaction Scoring — scores segment/archetype response against the feature map under current constraints. Outputs: adoption likelihood (%), confidence, primary reaction, what this changes, what this does not change, primary remaining barrier, strongest trigger for movement, material effectiveness, plus the full extracted feature map. Adoption likelihood capped at constrained_probability + 15pp. Uses `/api/ai-simulate/reaction` endpoint with multipart file upload support. Does NOT regenerate the case question, rerun signal discovery, or act as generic document summarization.
- **Extraction Validation Framework:** Platform-wide reliability layer ensuring all ingestion paths (typed questions, pasted text, PDF, PPTX, DOCX, XLSX, CSV, images, mixed uploads) always produce a minimally viable case. Core principle: graceful degradation, not binary success/failure. Every extractor is graded on: raw text recovery, candidate question generation, candidate signal generation, confidence scoring (High/Moderate/Low), and fallback behavior. No extraction path is allowed to fail silently or stop the workflow. If confidence is low, the system produces a draft case with a `lowConfidence` flag and "LOW CONFIDENCE INGESTION" banner. Server-side guarantees: if text extraction fails, raw buffer fallback is attempted; if AI returns no question, deterministic fallback question is generated; if no signals, 3 seed signals at Weak confidence. Both `/api/import-project` and `/api/import-project/analyze` endpoints share the same fallback infrastructure. Test harness: 21 tests across 12 input types (clean docs, messy emails, scientific papers, market research, old RFPs, spreadsheets, CSV data, minimal content, gibberish, empty files) covering both endpoints. Results in `artifacts/api-server/src/tests/extraction-validation-results.json`. Test files: `extraction-validation.test.ts` (main suite), `extraction-edge-cases.test.ts` (edge cases + analyze). Fixtures in `src/tests/fixtures/`.
- **Assumption Registry (DB-backed):** Silent background system that automatically extracts and tracks all inferred/explicit assumptions underlying forecasts, constraints, and recommendations. Persisted in PostgreSQL (`assumption_registry` table) with Drizzle ORM. Each assumption has: `assumption_id` (PK), `case_id`, `assumption_statement`, `assumption_category` (8 pgEnum values: regulatory/payer/supply/workflow/clinical/competitive/operational/timeline), `assumption_status` (4 values: active/validated/invalidated/unknown), `confidence_level`, `source_type` (signal/inference/external_data/user_input/historical_pattern), `impact_level`, `owner`, `linked_gates` (JSON string), `invalidation_reason`, timestamps. API: GET `/assumptions/:caseId`, PATCH `/assumptions/:assumptionId/status` (triggers recalculation flag on high/moderate impact changes), POST `/ai-assumptions/extract` (DB-backed upsert with strict deduplication, passes existing assumptions for status re-evaluation), DELETE `/assumptions/:caseId`. Auto-triggers after Decide and Respond steps complete. Accessible via "Assumptions" item in the Diagnostics section below the workflow steps (appears on steps 3-6 when a question is active). Frontend panel shows 8 categories, 4 statuses, impact/confidence/source badges. Test harness: 10 unit tests + 4 scenarios + 1 edge case in `artifacts/api-server/src/tests/assumption-registry.test.ts`.

## External Dependencies
- **PostgreSQL:** Relational database management system.
- **Express 5:** Backend web application framework.
- **React, Vite, Tailwind, Recharts, React Query:** Frontend libraries and tools.
- **Drizzle ORM:** Object-Relational Mapper.
- **OpenAPI 3.1 & orval:** API specification and code generation.
- **OpenAI (via Replit AI Integrations):** For AI signal generation, market intelligence research, and project material analysis.
- **pdf-parse, mammoth, jszip:** Backend document text extraction.
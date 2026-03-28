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
- **Legacy Case Redirect:** All `/case/:caseId/*` routes redirect to the current 4-step workflow UI, translating legacy DB schema to `ActiveQuestion` format.
- **Import Project:** Allows users to upload documents, images (JPG/PNG/WebP), or paste text (including Ctrl+V clipboard paste of images) to automatically extract decision questions, key signals, and missing signals, creating a new case. Images are analyzed via GPT-4o vision.
- **Enterprise Data Import:** Universal data ingestion on the Step 2 "Add Information" page for CSV, Excel, and JSON files, with auto-detection of column mappings.
- **Forecast Export:** One-click export from the Step 4 "Decide" page in PDF, Excel, and structured JSON formats, including comprehensive forecast details and executive judgment.

## External Dependencies
- **PostgreSQL:** Relational database management system.
- **Express 5:** Backend web application framework.
- **React, Vite, Tailwind, Recharts, React Query:** Frontend libraries and tools.
- **Drizzle ORM:** Object-Relational Mapper.
- **OpenAPI 3.1 & orval:** API specification and code generation.
- **OpenAI (via Replit AI Integrations):** For AI signal generation, market intelligence research, and project material analysis.
- **pdf-parse, mammoth, jszip:** Backend document text extraction.
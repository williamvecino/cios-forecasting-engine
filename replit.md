# CIOS — Clinical Intelligence & Outcome System

## Overview
CIOS is a disease-agnostic, asset-agnostic, and specialty-flexible Bayesian forecasting platform. Its primary purpose is to predict Healthcare Professional (HCP) adoption by translating prior probabilities into posterior probabilities using validated clinical signals and a 6-actor behavioral reaction model. The platform aims to provide AI-powered, data-driven insights for understanding and forecasting market adoption and stakeholder behavior across various medications, devices, diagnostics, therapeutic areas, specialties, and geographies.

## User Preferences
I prefer clear and concise information. I appreciate high-level summaries before diving into details. When implementing features, prioritize modular and maintainable code. For architectural decisions, provide the rationale. I expect the agent to ask for clarification if there are ambiguities in my requests and to inform me about significant changes or design choices before proceeding.

## System Architecture
The CIOS platform is a monorepo utilizing pnpm workspaces. The frontend is built with React, Vite, Tailwind CSS, Recharts, and React Query, focusing on an "Aaru-like Decision Interface" with question-driven design. The backend is an Express 5 application developed in TypeScript, exposing APIs under `/api`. Data persistence is handled by PostgreSQL, managed through Drizzle ORM. API specifications adhere to OpenAPI 3.1, with `orval` used for client and validation library generation.

**Core System Design Principles:**
- **Bayesian Forecast Engine:** Central to the platform, it calculates posterior probabilities using prior odds, correlation-aware signal likelihood ratio products, and an exponential net actor translation.
- **AI-Powered Signal Detection & Review:** Facilitates AI-driven extraction of candidate signals with a human review workflow, ensuring comprehensive domain coverage and data validation.
- **Actor Behavioral Modeling:** Incorporates a 6-actor model (KOL, HCP, Payer, Patient, Administrator, Competitor) to adjust forecasts based on behavioral reactions to signals.
- **Calibration Learning Loop:** Continuously tracks outcomes, computes Brier scores, and applies bias adjustments for improved accuracy.
- **Hierarchical Calibration Fallback:** Ensures robust calibration even in data-scarce scenarios.
- **Learning Coverage Expansion:** An adaptive system for acquiring, ingesting, and simulating the impact of new learning cases.
- **Analog Retrieval System:** Provides a calibrated library of cases for similarity-based matching.
- **Decision-Path Actor Modeling:** Defines 5 distinct HCP archetypes with varying signal sensitivities and action thresholds.
- **Strategic Questions Engine & Challenge Mode:** Enables generation of structured intelligence questions and adversarial critique.
- **Forecast Ledger:** Tracks predictions against actual outcomes for calibration.
- **Strategic Narrative Generator:** Transforms forecast outputs into publication-ready analytical narratives.
- **Signal Lifecycle Management:** Includes a Signal Watchlist, Competitor Behavior Register, and a comprehensive Signal Lifecycle & Audit System.
- **Target Resolution Layer:** Manages hierarchical targeting with scope-based signal filtering.
- **Forecast Interpretation Panel:** Provides confidence-sensitive summaries and actionable insights.
- **National Adopter Discovery Agent:** An agent for identifying adoption candidates based on strategic questions and structured signals.
- **AI-Powered Decision Analysis:** Generates structured analysis for adoption segmentation, barrier diagnosis, and recommended actions.
- **Forecast-Derived Decision Architecture:** Uses a deterministic engine to map forecast gates to decision items, with AI providing contextual details.
- **Performance Stabilization Controls:** Implements state hashing, driver limits, duplicate driver checks, lightweight logging, and partial UI rendering to maintain performance.

**Key Features and Implementations:**
- **UI/UX:** Conversational question entry (single input → AI interpretation → one-click confirm), redesigned forecast page with dark panel theme, and enterprise decision layout. Information is structured using tables, collapsible sections, and color-coded indicators. All language uses executive decision terms — no statistical or model terminology.
- **Conversational Question Interpreter:** Users type any question in plain language. The system uses GPT-4o to extract decision type, event, outcomes, time horizon, primary constraint, subject, and entities, then presents a structured interpretation for confirmation. Falls back to local regex parser if AI is unavailable. API: `/api/ai-interpret-question`.
- **Workflow Gating:** `QuestionGate` blocks content until an active question exists.
- **AI-Powered Signal Generation:** Generates `observed`, `derived`, or `uncertainty` signals with translation fields and `question_relevance_note`, informed by brand development checks and real-time web research using GPT-4o.
- **Event Decomposition Layer:** AI decomposes questions into 3-6 "event gates," each with a `status` and `constrains_probability_to`, influencing the `constrained_probability`.
- **Engine Guardrails:** Critical pre- and post-processing steps including driver deduplication, max single-driver shift caps, total shift normalization, event gating constraints, relevance penalties, recalculation consistency, and input validation.
- **Signal Persistence Flow:** Accepted signals are saved to the database with `human` origin and `active` status. Signals are also persisted to `localStorage` (`cios.signals:${caseId}`) on every accept/dismiss/edit/add/AI-receive, surviving navigation between steps. AI regeneration is tracked via `cios.aiRequested:${caseId}` with an explicit "Refresh AI Signals" button for manual re-triggering.
- **Signal Priority & Locking:** Signals carry `priority_source` (manual_confirmed > observed_verified > ai_derived > ai_uncertainty) and `is_locked` fields. Manual/user signals are locked by default, surviving AI regeneration. Priority boosts evidence weight in gate calculations (1.5x for manual, 1.25x for verified).
- **Signal Conflict Detection:** Opposing-direction signals on the same category are flagged with conflict indicators. Higher-priority sources win in conflict resolution.
- **Driver Impact Distribution:** Total probability shift is proportionally distributed across signals using the largest-remainder method.
- **Forecast Meaning Panel:** Provides plain-language interpretations, identifies primary constraints, and suggests actions to change forecasts.
- **Decision Lab Summary:** A deterministic 7-section interpretive panel (Executive Diagnosis, Primary Constraint, Constraint Hierarchy, Why Not Higher, What Would Increase Forecast, Why Signals Seem Contradictory, Decision Implication) rendered on the forecast page. Pure template logic from forecast outputs — no AI. Primary constraint derived from most-sensitive-gate scenario analysis. Constraint hierarchy sorted by constraining impact (lowest cap first). All sections always render with fallback text.
- **Gate-Driven Scenario Planning:** Allows deterministic counterfactual forecasts by modifying gate states without AI involvement.
- **Signal-to-Gate Mapping Engine:** Deterministically maps signals to gates using keyword scoring and recalculates gate status based on evidence weight, triggering forecast updates.
- **Executive Judgment Layer:** A post-forecast judgment engine (`judgment-engine.ts`) that classifies case type, retrieves closest analog cases, and generates a structured Executive Judgment block. Outputs: dynamic most-likely-outcome (inferred from question text — not hard-coded verdicts), probability, confidence, key drivers, decision posture ("Plan for this outcome" / "Do not base plans on this yet" / etc.), uncertainty classification (missing evidence / conflicting signals / gating barriers / weak evidence / well resolved), analog pattern summary with convergence note, reversal triggers, monitor list (what to watch), and next-best question. Rendered at top of Step 3 ("Judge") above comparison circles. Fully deterministic — no AI.
- **Workflow Language:** Step 3 is "Judge" (not "See Forecast"), Step 4 is "Decide". All surface-level language uses executive decision terminology (e.g., "What is the most likely outcome?", "What is driving the call", "Recommended Decision Posture", "What would change this"). Engine terminology is nested in expandable detail.

## External Dependencies
- **PostgreSQL:** Relational database management system.
- **Express 5:** Backend web application framework.
- **React, Vite, Tailwind, Recharts, React Query:** Frontend libraries and tools.
- **Drizzle ORM:** Object-Relational Mapper for database interaction.
- **OpenAPI 3.1 & orval:** For API specification and code generation.
- **OpenAI (via Replit AI Integrations):** Utilized for AI signal generation and market intelligence research.
# CIOS — Clinical Intelligence & Outcome System

## Overview
CIOS is a disease-agnostic, asset-agnostic, and specialty-flexible Bayesian forecasting platform designed to predict HCP (Healthcare Professional) adoption. It translates prior probabilities into posterior probabilities using validated clinical signals and a 6-actor behavioral reaction model. The platform is capable of forecasting for any medication, device, diagnostic, therapeutic area, specialty, or geography. Its core purpose is to provide an AI-powered, data-driven approach to understanding and predicting market adoption, offering insights into stakeholder behavior and market dynamics.

## User Preferences
I prefer clear and concise information. I appreciate high-level summaries before diving into details. When implementing features, prioritize modular and maintainable code. For architectural decisions, provide the rationale. I expect the agent to ask for clarification if there are ambiguities in my requests and to inform me about significant changes or design choices before proceeding.

## System Architecture
The CIOS platform is built as a monorepo using pnpm workspaces.
The frontend is developed with React, Vite, Tailwind, Recharts, and React Query, located in `artifacts/cios-frontend`.
The backend, `artifacts/api-server`, is an Express 5 application written in TypeScript, serving APIs under the `/api` endpoint.
Data persistence is handled by PostgreSQL, utilizing the Drizzle ORM through `lib/db`.
API specifications are defined using OpenAPI 3.1, with `orval` codegen generating client and validation libraries.

**Core Features and Implementations:**
- **Bayesian Forecast Engine:** Implemented in `forecast-engine.ts`, this module calculates posterior probabilities using prior odds, a signal Likelihood Ratio (LR) product, and an exponential net actor translation.
- **Signal Detection & Review:** An AI-powered layer extracts candidate signals from various documents, followed by a workflow for review, confirmation, or rejection. A signal completeness check ensures 14-domain coverage.
- **Actor Behavioral Model:** A 6-actor (KOL, HCP, Payer, Patient, Administrator, Competitor) model adjusts forecasts based on their reactions to signals. The `agent-engine.ts` simulates 7 archetypes with cross-agent influence, feeding into the Bayesian posterior.
- **Calibration Learning Loop:** The system includes a sophisticated calibration mechanism that tracks outcomes, computes Brier scores and mean forecast errors. It features `lr_corrections` for signal-type-level bias and `bucket_corrections` for probability-space additive adjustments across four probability buckets. Calibration logic includes guardrails like recency-weighted means and various warning flags.
- **Hierarchical Calibration Fallback:** For low-data regions, a 4-level deterministic hierarchy (local_segment → global_bucket → signal_type_only → raw) ensures robust calibration.
- **Learning Coverage Expansion:** A four-piece adaptive learning system includes a `Case Acquisition Planner` to identify data gaps, a `Question-Type Taxonomy` for analysis, `Resolved-Case Ingestion` for historical data, and `Learning Impact Simulation` for predicting calibration improvements.
- **Analog Retrieval:** The `analog-engine.ts` provides a 30-case calibrated analog library across 7 therapy areas, matching cases via Jaccard token scoring on various attributes.
- **Decision-Path Actor Modeling:** A separate module, `lib/decision-path-engine.ts`, defines 5 HCP archetypes with specific signal sensitivities, hesitation rules, and action thresholds to model conviction and behavior, distinct from the main forecast engine.
- **Forecast Portfolio:** The `portfolio-engine.ts` allows evaluating multiple strategic questions against the same signal set, applying per-question hierarchical calibration for comprehensive analysis.
- **Strategic Questions Engine & Challenge Mode:** Generates structured intelligence questions and provides an adversarial critique mechanism to challenge forecast assumptions.

**UI/UX Decisions:**
- **Aaru-like Decision Interface (Phase 1 Complete):** The frontend uses question-driven, decision-oriented language throughout. All Bayesian/forecast jargon has been replaced with accessible terminology:
  - Dashboard: "Your Strategic Questions" with question-first presentation, portfolio gauge, track record, system status
  - Forecast page: "Likelihood Assessment" (not "Posterior Probability"), "Baseline/Shift" (not "Prior/Delta"), "Starting Point → Evidence Strength → Stakeholder Response → Overall Outlook" computation chain, "Key Evidence Drivers", "Assessment Trace/Challenge"
  - Signals page: "Evidence Register" with "Evidence weight" column
  - Sidebar: "CIOS / Strategic Intelligence Engine", renamed nav items (Signal Discovery, Evidence Register, Historical Matches, Stakeholder Model, System Calibration), "Engine ready / All systems operational" footer
- Information is presented with clarity, using structured tables, collapsible sections, and color-coded indicators for warnings and priorities.
- All backend APIs and engine behavior remain completely unchanged — this is a UI-only transformation.

## External Dependencies
- **PostgreSQL:** Primary database for all persistent data.
- **Express 5:** Backend web framework.
- **React, Vite, Tailwind, Recharts, React Query:** Frontend development stack.
- **Drizzle ORM:** Object-Relational Mapper for database interaction.
- **OpenAPI 3.1 & orval:** API specification and code generation tools.
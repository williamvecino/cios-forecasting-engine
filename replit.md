# CIOS — Clinical Intelligence & Outcome System

## Overview
CIOS is a disease-agnostic, asset-agnostic, and specialty-flexible Bayesian forecasting platform designed to predict Healthcare Professional (HCP) adoption. It translates prior probabilities into posterior probabilities using validated clinical signals and a 6-actor behavioral reaction model. The platform forecasts for any medication, device, diagnostic, therapeutic area, specialty, or geography, providing an AI-powered, data-driven approach to understanding and predicting market adoption and stakeholder behavior.

## User Preferences
I prefer clear and concise information. I appreciate high-level summaries before diving into details. When implementing features, prioritize modular and maintainable code. For architectural decisions, provide the rationale. I expect the agent to ask for clarification if there are ambiguities in my requests and to inform me about significant changes or design choices before proceeding.

## System Architecture
The CIOS platform is a monorepo built with pnpm workspaces. The frontend uses React, Vite, Tailwind, Recharts, and React Query. The backend is an Express 5 application in TypeScript, serving APIs under `/api`. Data persistence is managed by PostgreSQL with Drizzle ORM. API specifications are defined using OpenAPI 3.1, with `orval` for client and validation library generation.

**Core Features:**
- **Bayesian Forecast Engine:** Calculates posterior probabilities using prior odds, correlation-aware signal likelihood ratio products, and an exponential net actor translation.
- **Signal Detection & Review:** AI-powered extraction of candidate signals with a workflow for review, confirmation, or rejection, ensuring 14-domain coverage and data validation.
- **Actor Behavioral Model:** A 6-actor model (KOL, HCP, Payer, Patient, Administrator, Competitor) adjusts forecasts based on reactions to signals.
- **Calibration Learning Loop:** Tracks outcomes, computes Brier scores and forecast errors, and applies `lr_corrections` and `bucket_corrections` for bias adjustment.
- **Hierarchical Calibration Fallback:** Ensures robust calibration in low-data regions through a 4-level deterministic hierarchy.
- **Learning Coverage Expansion:** An adaptive learning system including a `Case Acquisition Planner`, `Question-Type Taxonomy`, `Resolved-Case Ingestion`, and `Learning Impact Simulation`.
- **Analog Retrieval:** Provides a 30-case calibrated analog library for matching cases via Jaccard token scoring.
- **Decision-Path Actor Modeling:** Defines 5 HCP archetypes with specific signal sensitivities and action thresholds.
- **Forecast Portfolio:** Allows evaluating multiple strategic questions against the same signal set.
- **Strategic Questions Engine & Challenge Mode:** Generates structured intelligence questions and provides an adversarial critique mechanism.
- **Forecast Ledger:** Tracks predictions and compares them with real outcomes for calibration measurement.
- **Strategic Narrative Generator:** Converts forecast outputs into publication-ready analytical narratives using a deterministic template.
- **Signal Watchlist:** Tracks upcoming external events likely to generate meaningful forecast signals.
- **Weekly Strategic Brief:** Provides an aggregated read-only summary of current system state.
- **Competitor Behavior Register:** Structured intelligence layer for tracking competitor strategic behaviors.
- **Target Resolution Layer:** Manages hierarchical targeting (market → specialty → subspecialty → institution → physician) with scope-based signal filtering.
- **Forecast Interpretation Panel:** Provides confidence-sensitive summaries, driver-aware next actions, and refinement suggestions on the case detail page.
- **National Adopter Discovery Agent:** A bounded agent for discovering U.S. physician/institution adoption candidates based on strategic questions and structured signals.
- **Signal Lifecycle & Audit System:** Manages signal status transitions (`candidate → reviewed → validated → active → archived/rejected`) with audit logging for all changes.
- **Signal Taxonomy:** Defines 10 core signal types organized into 3 groups (evidence, market, execution) with a mapping for legacy types.
- **Signal Review Queue:** A dedicated frontend page for managing the full signal lifecycle from candidate to activation.
- **Forecast Environment Adjustment Layer:** A post-calibration module that applies safe multipliers based on 7 environmental factors to refine forecasts.
- **Signal Detection Agent:** A bounded agent that scans user-provided source text to extract and classify candidate signals for human review.

**Navigation & Information Architecture:**
Top-level navigation includes Home, Forecasts, Library, and System, organizing various tools and workflows. A 4-step workflow (Define Question → Add Information → See Forecast → Decide) guides users through the forecasting process.

**UI/UX Decisions:**
The frontend employs an "Aaru-like Decision Interface" with question-driven, decision-oriented language. Key design patterns include a question definition layer for structuring user input, a workflow test harness, a forecast readiness gate, a redesigned forecast page with a dark panel theme and four tabs (Current Forecast, Scenario Planning, Driver Impact, Case Library), an "Evidence Register" for signals, and a 6-panel enterprise decision layout for question details. Information is presented using structured tables, collapsible sections, and color-coded indicators.

**Workflow Gating:**
All pages (signals, forecast, decide) use `QuestionGate` to block content when no active question exists. The sidebar step completion checkmarks require `hasActiveQuestion` to prevent false positive indicators. The question parser (`parser.ts`) supports a comprehensive verb list for subject extraction including medical/pharma-specific actions (approve, launch, prescribe, reimburse, etc.) with a fallback pattern. The outcome extractor covers 30+ outcome categories. Both subject and outcome default to reasonable values to minimize blocked Continue buttons.

**Draft vs Active Case Isolation:**
Strict separation between `draftQuestion` (the in-progress text in the textarea/parser) and `activeCase` (the previously submitted question stored in localStorage). Key mechanisms:
- `DraftQuestion` interface + `createEmptyDraft()` factory in `lib/question-definition/types.ts` — formal type separate from `ActiveQuestion`.
- `useReducer(draftReducer)` in `QuestionPage` manages all draft state (`rawInput`, `overrides`, `editingField`, `clarificationValue`) as a single unit. `SET_RAW_INPUT` resets overrides to enforce clean-slate on new input.
- `QuestionPageFresh` wrapper in `App.tsx` forces full remount via React `key` on every `/question` navigation.
- Parser (`parser.ts`) has zero references to `activeQuestion`/`activeCase` — it only operates on raw text input.
- Case binding only happens inside `handleSubmit` after the draft question is complete — never before.
- `Clear Question` calls both `clearQuestion()` (removes active case from localStorage + state) and `resetDraft()` (dispatches `RESET` to clear all draft state).
- Console logs prefixed `[CIOS State]` and `[CIOS Draft]` are present for debugging draft vs active case subject values. Remove for production.

**AI-Powered Signal Generation:**
The signals page calls `POST /api/ai-signals/generate` (in `api-server/src/routes/ai-signals.ts`) which uses OpenAI to research the subject/brand and generate evidence-based signals covering: clinical/preclinical data, competitor landscape (approved + pipeline), payer/market access, physician behavior, treatment guidelines, and patient factors. Each signal has AI-assigned strength, reliability, direction, and category with logical comparative weights. A market intelligence summary and context-aware incoming events are also returned. Falls back to template signals on API failure. Request de-duplication uses a composite key of `subject|questionText|outcome|questionType` and stale responses are discarded via request ID matching.

## External Dependencies
- **PostgreSQL:** Primary database.
- **Express 5:** Backend web framework.
- **React, Vite, Tailwind, Recharts, React Query:** Frontend development stack.
- **Drizzle ORM:** Object-Relational Mapper.
- **OpenAPI 3.1 & orval:** API specification and code generation.
- **OpenAI (via Replit AI Integrations):** Powers AI signal generation for market intelligence research. Uses `@workspace/integrations-openai-ai-server` package.
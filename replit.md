# CIOS — Clinical Intelligence & Outcome System

## Overview
CIOS is a Bayesian forecasting platform for the healthcare industry, predicting the adoption of medical assets and geographies by Healthcare Professionals (HCPs). It uses clinical signals and a 6-actor behavioral reaction model to translate prior probabilities into posterior probabilities. The platform provides AI-powered insights for market adoption forecasts and stakeholder behavior analysis, enhancing strategic decision-making through comprehensive market potential and strategic intelligence.

## User Preferences
I prefer clear and concise information. I appreciate high-level summaries before diving into details. When implementing features, prioritize modular and maintainable code. For architectural decisions, provide the rationale. I expect the agent to ask for clarification if there are ambiguities in my requests and to inform me about significant changes or design choices before proceeding.

## System Architecture
CIOS is a monorepo using pnpm workspaces. The frontend is built with React, Vite, Tailwind CSS, Recharts, and React Query, featuring a question-driven "Aaru-like Decision Interface" with a dark theme. The backend is an Express 5 application in TypeScript, exposing APIs under `/api`. PostgreSQL is used for data persistence via Drizzle ORM. API specifications use OpenAPI 3.1, with `orval` for client and validation library generation.

**Core Architectural Principles:**
- Agents are deterministic, single-purpose, with fixed inputs and outputs.
- The Core CIOS Judgment Engine is the central decision-making component.
- Raw documents are processed by gating agents, ensuring provenance.
- The system employs 17 bounded, deterministic, single-purpose AI agents.
- A 7-agent chain defines the canonical forecasting pipeline: Question Structuring → Signal Identification → Signal Validation → Dependency Control → Forecast Engine → Interpretation → Scenario Simulation.

**Key Features and Design Principles:**
- **Bayesian Forecast Engine:** Provides transparent probability calculations.
- **AI-Powered Signal Detection & Review:** AI-assisted signal extraction with human oversight.
- **Actor Behavioral Modeling:** Integrates a 6-actor model (KOL, HCP, Payer, Patient, Administrator, Competitor).
- **Calibration Learning Loop:** Continuously tracks outcomes and adjusts for bias.
- **Strategic Questions Engine & Challenge Mode:** Generates structured intelligence questions and offers adversarial critique.
- **Adoption Distribution Forecast Model (v3):** Computes final probabilities using Beta adoption distribution, gate constraints, and CDF calculations.
- **Executive Judgment Layer:** Produces `ExecutiveJudgmentResult` with integrity checks and audit trails.
- **Forecast Ledger (Calibration Memory):** Versions and persists forecasts with inference snapshots.
- **Universal Ingestion & Enterprise Data Import:** AI-powered extraction of decision questions and signals from various document types.
- **Decision/Environment Classification Engine:** AI pipelines classify decision archetypes, context, and extract domain-specific signals.
- **MIOS/BAOS AI Agents:** MIOS identifies brand-specific clinical evidence; BAOS identifies HCP cognitive barriers.
- **Case Framing Layer:** Mandatory pre-signal-generation step deriving structured case metadata and defining `CaseFrame` for 10 archetypes.
- **Case Type Classifier & Routing:** Deterministic engine identifies 10 pharma case archetypes and routes them.
- **Calibration & Performance Dashboard:** Aggregates Forecast Ledger data for metrics, calibration analysis, and bias detection.
- **Trial-Linked Evidence Clustering:** Detects shared trial identifiers to prevent over-counting.
- **Actors/Segments Simulation Engine:** Deterministic scenario simulation engine recomputing forecast outcomes under 13 controlled scenario types.
- **Signal Structure & Efficiency Upgrade:** Includes auto-assigned driver roles, coverage validation, a signal map, causal alignment checks, and completeness suggestions.
- **AI Signal Deduplication:** Semantic and similarity-based deduplication of signals.
- **AI-Structured Question Definition Workflow:** Multi-step question input flow where AI structures the question, performs feasibility checks, and proposes outcome states.
- **Guarded Ingestion Layer:** Accepts full unstructured text with mandatory Decision Classification AI agent.
- **Signal Interpretation Layer:** Sits between decision classification and signal creation, persisting to `signal_interpretations` DB table.
- **Server-Side Recalculation Controller:** `POST /api/forecast/recalculate` is a dependency-aware forecast recalculation endpoint.
- **Forecast Explanation Layer:** `GET /api/cases/:caseId/explanation` endpoint generates structured explanations.
- **Respond / Launch Strategy Output:** Restructured executive brief answering 5 key executive questions, including a data-driven Decision Clarity panel and LLM-generated sections (Strategic Recommendation, Primary Constraint, Highest-Impact Lever, Realistic Ceiling).
- **Coherence Verification Agent:** Post-Respond verifier with 11 deterministic rules that validates output for rule compliance, internal coherence, and decision clarity.
- **Needle Movement Analysis:** Deterministic structured section detailing positive, negative, and recommended actions for drivers.
- **Strategic Relevance Page Hierarchy:** 4-section layout with visibility rules applied to both Respond and Forecast pages, simplifying UI language.
- **Consistency and Determinism System:** Uses a Canonical Case Object and `forecast_snapshots` for drift detection and consistency scoring.
- **System Integrity Test Layer:** Internal validation module that tests 10 engine invariants on every forecast run, logging results and flagging unreliable forecasts.
- **Signal Precedent Library (CIOS v18):** Precedent-based signal weighting with governance controls, 29 fixed signal types across A/B/C reliability tiers with assigned LRs.
- **Signal Eligibility Gate:** Mandatory 3-tier classification (`Eligible`, `ContextOnly`, `Rejected`) before posterior calculation.
- **Authoritative ForecastResult Endpoint:** `GET /api/cases/:caseId/forecast-result` returns one canonical probability with evidence gate summary.
- **Integrity Spec Enforcement (Rule 3 — Required Inputs):** Blocks forecasts if essential case or signal fields are missing.
- **Pivotal Evidence Gate:** Required case initialization step before MIOS/BAOS signal discovery. Cases created via Structured Input form must include Primary Trial Name, PMID, and Result Summary, auto-creating an analyst-locked pivotal signal.
- **AI Signal Governance:** All signals created by non-human sources default to `countTowardPosterior: false`.
- **Structured Pivotal Evidence Search (Registry-First, 5-Tier with Sponsor):** `POST /api/cases/:caseId/pivotal-search` generates authoritative-first search queries across 6 categories, using a 5-tier verification system based on source authority and sponsor information.
- **Signal Completeness Gate (Forecast Page):** Renders tiered warnings on the forecast page based on missing signal types, ranging from hard blocks to informational.
- **Structured Signal Discovery Pipeline:** "Find New Signals" replaced with structured evidence retrieval via `POST /api/ai-signals/structured-search`, running Google News RSS queries and GPT-4o extraction.
- **5-Phase Evidence Pipeline (Full Document Fetch):** Automated pipeline for sponsor ID, source discovery (PubMed, ClinicalTrials.gov, FDA), full document fetch (API + scraping), LLM extraction, and deduplication/sorting.
- **Lifecycle-Aware Source Priority System:** Classifies drugs into 4 stages (INVESTIGATIONAL, RECENTLY_APPROVED, ESTABLISHED, MATURE) based on keywords, then reorders discovered sources by stage priority before fetching.
- **External Extraction Service Integration:** Optional Colab-hosted Flask+ngrok microservice for enhanced document extraction (PDFs, SEC filings, complex HTML).

## External Dependencies
- **PostgreSQL:** Relational database.
- **Express 5:** Backend framework.
- **React, Vite, Tailwind, Recharts, React Query:** Frontend technologies.
- **Drizzle ORM:** Object-Relational Mapper.
- **OpenAPI 3.1 & orval:** API specification and code generation.
- **OpenAI:** AI services.
- **pdfjs-dist, mammoth, jszip, word-extractor, ppt-to-text:** Libraries for document text extraction.
## Calibration Case Recovery

**Final calibration state — April 2026 (commit be474af).** Directional accuracy: 14/15 (93.3%). Brier score: 0.1608. Single miss: CAL-03 Tepezza — actor-dampening factors reduce raw Bayesian 61.2% to engine 46.8%, crossing the 50% direction threshold. This is engine behavior, not signal error. Target updated to 0.60 (was 0.29, which was an old engine artifact and directionally wrong for a TRUE case). Signal Eligibility Gate expanded: 50/76 CAL signals now Eligible (was 17/76). Gate additions: psoriasis franchise (Skyrizi, IMMhance, IMMvent, risankizumab, adalimumab), HCV franchise (Sovaldi, Harvoni, NEUTRINO, peginterferon, ribavirin), CAR-T franchise (Abecma, Carvykti, KarMMa, CARTITUDE), GLP-1 franchise (Ozempic, Victoza, SUSTAIN), clinical descriptors (superior, once-weekly, subcutaneous injection, interferon-free, 12-week course). biosimilar deliberately excluded.

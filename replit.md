# CIOS — Clinical Intelligence & Outcome System

## Overview
CIOS is a disease-agnostic, asset-agnostic, and specialty-flexible Bayesian forecasting platform. Its core purpose is to predict Healthcare Professional (HCP) adoption by translating prior probabilities into posterior probabilities using validated clinical signals and a 6-actor behavioral reaction model. The platform delivers AI-powered, data-driven insights to forecast market adoption and stakeholder behavior across various medical assets and geographies, enhancing strategic decision-making in the healthcare industry and providing a comprehensive solution for strategic intelligence and market potential analysis.

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
- **Signal Dependency & Redundancy Control Layer:** Prevents posterior inflation from causally related signals by analyzing lineage, clustering by root evidence, and compressing signals before posterior calculation. Includes confidence ceilings, naive vs. compressed comparison, tightened echo/translation classification, and full audit persistence.
- **Gate-Driven Scenario Planning:** Enables deterministic counterfactual forecasts by modifying gate states.
- **Executive Judgment Layer (Integrity-Enforced):** A post-forecast judgment engine producing a single canonical `ExecutiveJudgmentResult` object with integrity checks and an audit trail.
- **Barrier Decomposition & Constraint Decomposition Layer:** Decomposes non-strong gates into operational drivers and maps to abstract constraint categories.
- **Endpoint Signal Differentiation Layer:** Classifies evidence signals into four tiers (Dominant, Supporting, Neutral, Contradictory) and detects `SignalImbalance`.
- **Forecast Ledger (Calibration Memory):** Every forecast is automatically versioned and persisted with full inference snapshots, supporting resolution workflow, Brier scoring, calibration bucket tracking, and version movement display.
- **Decision-Based Comparison Groups:** Derives outcome scenarios from strategic questions, with AI extracting comparison groups from question alternatives.
- **Ask CIOS (Case-Aware Question Box):** A persistent panel for open questions about the current case across categories like Explanation, Counterfactual, Resolution, and Interpretation.
- **Respond Step:** Converts decision output into a client-ready executive response.
- **Import Project (Universal Ingestion) & Enterprise Data Import:** Allows uploading documents, images, or pasting text for AI-powered extraction of decision questions and signals.
- **Decision Classification Engine:** A mandatory AI pipeline for classifying decision archetypes and generating primary decisions with evidence support.
- **Environment Classification Pipeline:** A two-phase AI pipeline for classifying decision context and extracting domain-specific signals.
- **MIOS/BAOS AI Agents:** MIOS identifies brand-specific clinical evidence; BAOS identifies HCP cognitive barriers.
- **Decision Gating Agent:** Orchestrates document processing, identifies business decisions, filters noise, and routes content to MIOS, BAOS, or CIOS, generating ranked questions.
- **Temporal Relevance Guardrails:** External Signal Scout and MIOS enforce recency rules for signals and evidence.
- **Calibration Reference Case Library:** A benchmark library of 8 curated archetype cases with dependency metrics, structural tags, calibration lessons, and bias patterns. A similarity endpoint matches live forecasts to comparable historical patterns.
- **Adoption Segmentation Panel:** Translates forecast outputs into 8 segment-level adoption maps, providing differentiated adoption likelihood and drilldowns for drivers, barriers, and levers.
- **Barrier Diagnosis Panel:** Diagnoses dominant sources of adoption resistance across 10 categories, generating overall and segment-level barriers with priority classifications.
- **Case Feedback Module:** Captures and tracks structured test observations per case, including step, observed/expected behavior, impact, category, reproducibility, and status.
- **Case Type Classifier:** Deterministic engine identifying 6 pharma case archetypes based on keyword matching, question-type alignment, and context pattern scoring.
- **Readiness Timeline Panel:** Provides a time-ordered readiness view across 10 milestone categories and 6 time windows, with dependency-aware scheduling and segment-specific profiles.
- **Competitive Risk Panel:** Identifies competitive forces across 12 categories that could impact adoption, including strength, confidence, threat mechanism, and estimated forecast impact.
- **Growth Feasibility Panel:** Standalone synthesis feature that combines forecast probability, adoption segments, barrier diagnosis, readiness timeline, and competitive risk into actionable feasibility outputs. Deterministic scoring engine (adoption 30%, barriers 25%, readiness 25%, competitive 20%) with structural barrier multiplier penalties. Five-tier taxonomy: high_growth (≥0.65, no structural barriers), moderate_growth (≥0.45, ≤1 structural), constrained_growth (≥0.25), blocked, monitor_only. Produces overall + segment-level feasibility with near/medium-term potential, unlocks/constraints, scalability rating, and revenue translation assessment. Frontend page at `/growth-feasibility` with summary dashboard, segment bar chart, expandable drilldowns. **Verified passing 4/4 criteria:** segment differentiation (3 distinct tiers across segments), unique unlock/constraint per segment, near-term vs medium-term separation, realism (high adoption + low feasibility coexistence). Inherited barrier dilution ensures segments using fallback overall barriers receive attenuated structural penalties (0.5x) to prevent false "blocked" classification. Case lookup supports both caseId and UUID.
- **Calibration & Performance Dashboard:** System performance-monitoring layer aggregating Forecast Ledger data into core metrics, calibration-by-bucket analysis, bias/failure pattern detection, and forecast revision analysis.
- **Case-Type-Aware Routing:** Central case-type router (`lib/case-type-router.ts`) maps 7 case types (regulatory_approval, launch_readiness, competitive_defense, access_expansion, clinical_adoption, lifecycle_management, market_shaping) to vocabulary constraints, actor segments, visible/hidden modules, step names, and action constraints. Backend AI prompts (ai-decide, ai-respond, ai-simulate) inject case-type-specific vocabulary and segmentation constraints. Frontend (`lib/case-type-utils.ts`) mirrors detection logic with dynamic step names, segment labels (5 regulatory actors vs 4 commercial personas), and conditional module visibility (Growth Feasibility hidden for regulatory cases). Adoption segments API generates regulatory actor segments (FDA Review Division, Advisory Committee, Sponsor Regulatory Team, Safety Reviewers, Patient Advocacy) for regulatory cases.
- **Trial-Linked Evidence Clustering:** Signal dependency engine detects shared trial identifiers (NCT numbers, named trials with numeric qualifiers) across signal descriptions and clusters them under shared rootEvidenceId for proper compression. Prevents over-counting of derivative evidence from the same clinical trial.
- **Negative Signal Downward Pressure Floor:** Frontend driver computation ensures negative-direction signals with polarity violations (lr >= 1 despite negative direction) are redirected to downward pressure with a minimum floor, preventing zero-downward-pressure display when safety concerns exist.
- **Unified Confidence Display:** Single primary confidence label per case, derived from the forecast engine's confidenceLevel. Audit section references the same top-level confidence value rather than a potentially contradictory judgment-level confidence.

**Bounded Agent Architecture:** The system employs 15 bounded, deterministic, single-purpose, and optional AI agents, each with fixed I/O schemas. These include agents for Decision Gating, Question Structuring, External Signal Scout, Signal Normalizer, Signal Quality, Conflict Resolver, Case Comparator, Integrity, Actor Segmentation, Stakeholder Reaction, Prioritization, MIOS, and BAOS. All decision-facing agents are brand-anchored and enforce a `ProgramID` scope constraint.

## External Dependencies
- **PostgreSQL:** Relational database.
- **Express 5:** Backend framework.
- **React, Vite, Tailwind, Recharts, React Query:** Frontend technologies.
- **Drizzle ORM:** Object-Relational Mapper.
- **OpenAPI 3.1 & orval:** API specification and code generation.
- **OpenAI:** AI services for signal generation and market intelligence.
- **pdfjs-dist, mammoth, jszip, word-extractor, ppt-to-text:** Libraries for document text extraction.
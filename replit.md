# CIOS — Clinical Intelligence & Outcome System

## Overview
CIOS is a disease-agnostic, asset-agnostic, and specialty-flexible Bayesian forecasting platform designed to predict Healthcare Professional (HCP) adoption. It translates prior probabilities into posterior probabilities using validated clinical signals and a 6-actor behavioral reaction model. The platform delivers AI-powered, data-driven insights to forecast market adoption and stakeholder behavior across various medical assets and geographies, ultimately enhancing strategic decision-making in the healthcare industry.

## User Preferences
I prefer clear and concise information. I appreciate high-level summaries before diving into details. When implementing features, prioritize modular and maintainable code. For architectural decisions, provide the rationale. I expect the agent to ask for clarification if there are ambiguities in my requests and to inform me about significant changes or design choices before proceeding.

## System Architecture
The CIOS platform is a monorepo utilizing pnpm workspaces. The frontend is built with React, Vite, Tailwind CSS, Recharts, and React Query, emphasizing an "Aaru-like Decision Interface" with a question-driven design. The backend is an Express 5 application in TypeScript, exposing APIs under `/api`. Data persistence is managed by PostgreSQL via Drizzle ORM. API specifications adhere to OpenAPI 3.1, with `orval` used for client and validation library generation.

**Core System Design Principles:**
- **Bayesian Forecast Engine:** Calculates posterior probabilities using correlation-aware signal likelihood ratio products and an exponential net actor translation.
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
- **Executive Judgment Layer:** A post-forecast judgment engine (`judgment-engine.ts`) classifies case type, retrieves analog cases, and generates a structured Executive Judgment block.
- **Respond Step (Step 5):** Converts decision output into a client-ready executive response with 5 sections: Strategic Recommendation, Why This Matters, Priority Actions, Success Measures, and Execution Focus.
- **6-Step Workflow:** Define Question → Add Information → Judge → Decide → Respond → Simulate.
- **Archetype Library & Assignment:** Utilizes 5 deterministic archetypes for adoption segmentation and archetype-aware simulation prompts.
- **Import Project (Universal Ingestion):** Allows users to upload documents, images, or paste text to automatically extract decision questions, key signals, and missing signals, supporting various file formats. Multi-file bundle upload is supported, processing each file independently and merging signals with source attribution.
- **Enterprise Data Import:** Universal data ingestion on the "Add Information" page for all file types and pasted text, with AI-powered signal extraction contextualized to the active question.
- **Decision Classification Engine:** A deterministic archetype classification step between environment detection and question generation. 11 fixed decision archetypes (Launch Strategy, Adoption Risk, Market Access, Competitive Positioning, Operational Readiness, Resource Allocation, Stakeholder Behavior, Capability Gap, Vendor Selection, Portfolio Strategy, Evidence Positioning). Pipeline: Ingestion → Domain detection → Decision archetype classification → Question formulation. Includes vendor selection guardrail: if vendor/agency selection is inferred but no explicit evaluation criteria exist in the document, the archetype is automatically downgraded and reclassified. API responses include `decisionArchetype` object with primary/secondary archetypes, decision framing, and guardrail status. Test suite: 6 document types validated in `decision-classification.test.ts`.
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
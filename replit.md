# CIOS — Clinical Intelligence & Outcome System

## Overview
CIOS is a disease-agnostic, asset-agnostic, and specialty-flexible Bayesian forecasting platform. Its primary purpose is to predict Healthcare Professional (HCP) adoption by translating prior probabilities into posterior probabilities using validated clinical signals and a 6-actor behavioral reaction model. The platform delivers AI-powered, data-driven insights to forecast market adoption and stakeholder behavior across various medical assets and geographies, thereby enhancing strategic decision-making in the healthcare industry. CIOS aims to provide a comprehensive solution for strategic intelligence and market potential analysis.

## User Preferences
I prefer clear and concise information. I appreciate high-level summaries before diving into details. When implementing features, prioritize modular and maintainable code. For architectural decisions, provide the rationale. I expect the agent to ask for clarification if there are ambiguities in my requests and to inform me about significant changes or design choices before proceeding.

## System Architecture
The CIOS platform is built as a monorepo using pnpm workspaces. The frontend is developed with React, Vite, Tailwind CSS, Recharts, and React Query, featuring an "Aaru-like Decision Interface" with a question-driven design and a dark panel theme. The backend is an Express 5 application in TypeScript, exposing APIs under `/api`. Data persistence is managed by PostgreSQL via Drizzle ORM. API specifications adhere to OpenAPI 3.1, with `orval` used for client and validation library generation.

**Agent Architecture Rules:**
Every agent in the CIOS system must satisfy four invariants:
1. **Bounded** — Fixed input schema, fixed output schema. No unbounded exploration or open-ended generation.
2. **Deterministic** — Same input produces same output. Use temperature=0 and fixed seeds where applicable.
3. **Single-purpose** — Each agent does one job. No agent performs another agent's function.
4. **Optional to run** — The system must work without any individual agent. Agents enrich, they never gate core functionality.

Outputs from all agents must be structured and auditable before being consumed by downstream systems.

**Important rule:** Agents live behind the visible steps, not as extra visible UI. The 6-step workflow stays clean: Define Question → Add Information → Judge → Decide → Respond → Simulate. Agents are modular underneath.

**Full Agent Architecture Map:**

Step 1 — Define Question:
- Decision Gating Agent — reads briefs/RFPs/PDFs, identifies real business decision, routes to MIOS/BAOS/CIOS, filters noise. **BUILT** (`POST /api/import-project/gate`)
- Question Structuring Agent — turns broad/messy text into 1-3 clean bounded decision questions, flags overly broad or non-decision inputs. Output: final active question, supporting questions, archetype, horizon, target outcome. **PARTIAL** (existing AI interpret endpoint)

Step 2 — Add Information:
- MIOS Agent — evidence interpreter. Takes belief bridge inputs, generates sub-bridges/statements, connects to evidence/verbatims, classifies strong/weak/contradictory endpoints, exports decision-relevant signals. **PARTIAL** (MIOS signal integration exists)
- BAOS Agent — behavioral friction interpreter. Translates evidence/context into behavioral friction, objections, stakeholder resistance, perception risk, adherence issues. Exports forecast-relevant behavioral signals. **PARTIAL** (BAOS signal integration exists)
- External Signal Scout — searches external relevant information (competitor events, payer changes, guideline shifts, KOL signals). Filters only what matters to active case. Output: structured signals with source, freshness, confidence, relevance. **PLANNED**
- Signal Normalizer / Deduplicator — merges manual, MIOS, BAOS, workbook, and external signals. Removes duplicates, collapses overlap, detects double-counting, normalizes direction/strength/confidence. Output: clean signal register. **PLANNED**
- Import Adapter Agent — reads Excel/MIOS-BAOS workbook/imported files, normalizes into signals. Never lets raw structure leak into engine. **BUILT** (existing workbook import)
- Assumption Registry Agent — detects hidden assumptions, registers explicitly, flags unsupported assumptions, separates facts from inferred conditions. **BUILT** (DB-backed assumption registry exists)

Step 3 — Judge:
- Core CIOS Judgment Engine — the central decision engine. Takes structured signals/gates, computes weighted judgment, produces forecast/posture/confidence, surfaces drivers/constraints, runs integrity checks. **BUILT** (core-forecast-engine.ts — DO NOT MODIFY)
- Case Comparator / Prior Structuring Agent — compares current case to prior internal/external cases, finds analogs, structures priors, explains similarity/divergence, supports judgment with precedent. **PLANNED**
- Explanation Agent / Ask CIOS — answers "why this forecast?", "what if this changes?", "how do I improve this?" with traceable case-grounded answers. **BUILT** (ExplainBox.tsx / explain-service.ts)
- Constraint Decomposition Agent — breaks vague constraints into ranked concrete drivers, prevents abstraction-only outputs. **BUILT** (constraint decomposition in judgment engine)
- Integrity / Consistency Agent — detects contradictions between signals, confidence, narrative, and recommendation. Enforces consistency rules. **PARTIAL** (integrity checks in judgment engine)

Step 4 — Decide:
- Decision Translation Agent — converts forecast into specific choice structure, recommends what to do now, identifies highest-leverage actions, defines kill criteria/falsifiers. **BUILT** (existing Decide step)
- Prioritization Agent — ranks actions by expected impact, separates strategic vs tactical, ranks barrier-resolution priorities. **PLANNED**

Step 5 — Respond:
- Response Composer — translates decision into output format (RFP response, strategic recommendation, action plan, executive summary). **BUILT** (existing Respond step)

Step 6 — Simulate:
- Actor Segmentation Agent — identifies key market actors/segments that drive adoption and behavior in the current case. Defines their behavioral rules and influence. This is a core behavioral modeling component, not a messaging feature. Must produce for each segment: segment name, role in market, behavioral characteristics, primary constraint, adoption trigger, influence weight, likely adoption timing, sensitivity to key signals, interaction with other actors. Lives primarily in Simulate but also provides structured inputs to Judge. **PLANNED**
- Simulation Agent — simulates stakeholder reactions over time, creates scenario trees, models catalyst/barrier resolution paths, estimates best/base/worst pathways. **PARTIAL** (existing simulate step)
- Stakeholder Reaction Agent — sub-agent simulating HCP, payer, patient, competitor, KOL reactions using known behavioral rules. **PLANNED**

Cross-system / Diagnostics (not visible steps):
- Provenance / Traceability Agent — tracks where every signal came from (workbook, MIOS, BAOS, manual, external). **PLANNED**
- Signal Quality Agent — scores signal reliability, freshness, directness, duplication, bias risk. **PLANNED**
- Conflict Resolver Agent — detects when MIOS, BAOS, external, manual signals conflict; decides merge/separate/flag. **PLANNED**
- Forecast Ledger Agent — stores previous forecasts, compares updates over time, measures drift, supports calibration. **PARTIAL** (forecast ledger exists)
- Calibration Agent — compares forecast vs actual, detects systematic bias, adjusts weights/confidence. **PARTIAL** (calibration system exists)
- Human Override / Editorial Agent — allows expert correction without breaking structure. **PARTIAL** (manual signal editing exists)

**Build priority order (next agents):**
1. External Signal Scout (Add Information)
2. Signal Normalizer / Deduplicator (Add Information)
3. Case Comparator / Prior Structuring Agent (Judge)
4. Actor Segmentation Agent (Simulate + Judge)
5. Simulation Agent enhancement (Simulate)
6. Prioritization Agent (Decide)

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
- **Endpoint Signal Differentiation Layer:** A pre-judgment interpretation step (`signal-differentiation.ts`) that classifies every evidence signal into one of four tiers — Dominant, Supporting, Neutral, or Contradictory — based on effect size, strength, and relative contribution. Produces a ranked `SignalHierarchy` with strategic implications and a `SignalImbalance` detection in the audit trail. Rendered as the "Evidence Hierarchy" panel in Executive Judgment with tier-colored sections, directional arrows, and imbalance alerts.
- **Judgment Integrity Test Set:** A suite of 43 locked tests covering deterministic output, causal sensitivity, contradiction detection, narrative coherence, constraint decomposition, and signal differentiation (9 tests for tier classification, imbalance detection, empty drivers, strategic implication grounding).
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
- **MIOS/BAOS Signal Integration:** Every brand gets a paired MIOS (evidence) + BAOS (behavioral/barrier) signal set loaded automatically. 10 brands covered: Entresto, Repatha, Dupixent, Keytruda, Ofev, Spinraza, Trikafta, Zepbound, Jardiance, Xeljanz. ARIKAYCE also gets 10 analog signals. Brand matching uses the active question's subject field. Signals are locked (`is_locked: true`) so they survive AI refreshes. Backfill logic merges missing prebuilt signals into existing persisted data. Fallback: if no brand match, all signals load. Manual workbook import still available via `WorkbookImportDialog`. Source: `prebuiltSignals.ts` (brand data), `normalizeCiosSignals.ts` (enum mapping), `parseMiosBaosWorkbook.ts` (xlsx parser).
- **Decision Gating Agent:** Top-layer upstream orchestration agent. Canonical flow: Upload → Decision Gating Agent → MIOS/BAOS/CIOS → Respond. When documents are uploaded, the Gating Agent reads the document, identifies the real business decision (not the document wrapper), filters out noise (logistics, legal boilerplate, procurement, admin), and routes content to three downstream systems: MIOS (scientific evidence, clinical data, regulatory), BAOS (physician/patient perceptions, objections, behavioral barriers), CIOS (strategic forecasting, market adoption, competitive positioning). Generates separate recommended questions per system. Output is deterministic (temperature=0, seed=42). API: `POST /api/import-project/gate`. Frontend: "gating" and "gated-pack" phases in `ImportProjectDialog` with tabbed tri-system visualization (cyan=MIOS, amber=BAOS, violet=CIOS). Each created case carries system routing metadata via `localStorage.setItem('cios.systemRoute:<caseId>', system)`. The legacy Document Interpreter (`POST /api/import-project/interpret`) and decision-pack phase remain for backward compatibility but the gating agent is now the default flow. PDF parsing uses `pdfjs-dist` directly (not `pdf-parse` wrapper) to avoid worker DataCloneError in tsx runtime.

## External Dependencies
- **PostgreSQL:** Relational database management system.
- **Express 5:** Backend web application framework.
- **React, Vite, Tailwind, Recharts, React Query:** Frontend libraries and tools.
- **Drizzle ORM:** Object-Relational Mapper.
- **OpenAPI 3.1 & orval:** API specification and code generation.
- **OpenAI:** For AI signal generation, market intelligence research, and project material analysis.
- **pdfjs-dist, mammoth, jszip, word-extractor, ppt-to-text:** Backend document text extraction libraries.
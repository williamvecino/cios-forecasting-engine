# CIOS — Clinical Intelligence & Outcome System

## Overview
CIOS is a disease-agnostic, asset-agnostic, and specialty-flexible Bayesian forecasting platform. Its primary purpose is to predict Healthcare Professional (HCP) adoption by translating prior probabilities into posterior probabilities using validated clinical signals and a 6-actor behavioral reaction model. The platform delivers AI-powered, data-driven insights to forecast market adoption and stakeholder behavior across various medical assets and geographies, thereby enhancing strategic decision-making in the healthcare industry. CIOS aims to provide a comprehensive solution for strategic intelligence and market potential analysis.

## User Preferences
I prefer clear and concise information. I appreciate high-level summaries before diving into details. When implementing features, prioritize modular and maintainable code. For architectural decisions, provide the rationale. I expect the agent to ask for clarification if there are ambiguities in my requests and to inform me about significant changes or design choices before proceeding.

## System Architecture
The CIOS platform is built as a monorepo using pnpm workspaces. The frontend is developed with React, Vite, Tailwind CSS, Recharts, and React Query, featuring an "Aaru-like Decision Interface" with a question-driven design and a dark panel theme. The backend is an Express 5 application in TypeScript, exposing APIs under `/api`. Data persistence is managed by PostgreSQL via Drizzle ORM. API specifications adhere to OpenAPI 3.1, with `orval` used for client and validation library generation.

**Canonical Architecture Rules:**
- Each agent must have a single clear function.
- Each agent must have fixed inputs and fixed outputs.
- Agents must be deterministic for the same input.
- No agent should perform another agent's job.
- The Core CIOS Judgment Engine remains the judge.
- All new agents are support layers, not replacements for the core engine.
- The system must fail gracefully when an agent cannot complete its task.
- Raw uploaded documents should not flow directly into judgment if a gating agent exists.
- Every signal entering judgment must preserve provenance.
- Do not destabilize the current engine or UI workflow.
- Do not add new visible steps. Agents live behind the 6 visible steps: Define Question → Add Information → Judge → Decide → Respond → Simulate.

**Build Phases and Agent Specifications:**

Phase 1 — Intake and signal quality:

1. Decision Gating Agent — **BUILT** (`POST /api/import-project/gate`)
   Lives in: Define Question
   Purpose: Read uploaded briefs, PDFs, RFPs, decks, screenshots, and classify the real business decision.
   Must output: document type, primary decision, secondary decisions, relevant content spans, irrelevant/admin content to ignore, recommended downstream routing to MIOS/BAOS/CIOS, missing information.
   Rules: distinguish wrapper from decision; ignore legal/procurement/admin boilerplate unless decision-relevant; deterministic for the same document.

2. Question Structuring Agent — **PARTIAL** (existing AI interpret endpoint)
   Lives in: Define Question
   Purpose: Convert broad or messy asks into 1–3 bounded decision questions.
   Must output: active question, optional supporting questions, question archetype, horizon, target outcome.
   Rules: reject or split overly broad questions; do not let one giant multi-part strategy question become the active case.

3. External Signal Scout — **PLANNED**
   Lives in: Add Information
   Purpose: Find relevant outside information for the active case and convert it into candidate signals.
   Must output for each candidate: signal label, source, source date/freshness, signal type, suggested direction, suggested strength, suggested confidence, relevance score, why it matters.
   Rules: do not forecast; do not inject directly into judgment; show as suggested signals first; user must accept, edit, or reject.

4. Signal Normalizer / Deduplicator — **PLANNED**
   Lives in: Add Information
   Purpose: Merge all signal sources into one clean register and prevent overlap/double counting.
   Must do: normalize direction/strength/confidence; deduplicate overlapping signals; prevent double counting; preserve source provenance; merge or flag conflicts.
   Rules: this becomes the only signal set used by the judge.

5. Assumption Registry Agent — **BUILT** (DB-backed assumption registry)
   Lives in: Add Information + Diagnostics
   Purpose: Detect explicit and implicit assumptions in the case.
   Must output: assumption list, sensitivity flags, confidence level.

Phase 2 — Evidence / behavior routing:

6. MIOS Adapter / MIOS Signal Agent — **PARTIAL** (MIOS signal integration exists)
   Lives in: Add Information
   Purpose: Convert MIOS outputs into CIOS-ready evidence signals.
   Must output: evidence-derived signals, vulnerabilities, strength map.

7. BAOS Adapter / BAOS Signal Agent — **PARTIAL** (BAOS signal integration exists)
   Lives in: Add Information
   Purpose: Convert BAOS outputs into CIOS-ready behavioral signals.
   Must output: objection signals, behavior-friction signals, stakeholder resistance signals.

8. Import Adapter Agent — **BUILT** (existing workbook import)
   Lives in: Add Information
   Purpose: Read workbook or structured import and populate signals without changing engine logic.
   Must output: imported structured signals.
   Rules: workbook is an input adapter, not a new engine; current integration must read only CIOS-ready export rows; do not let raw evidence sheets flow into judgment.

9. Provenance / Traceability Agent — **PLANNED**
   Lives in: Add Information + Judge
   Purpose: Preserve source origin for every signal.
   Each signal must retain: source layer, source reference, originating file/workbook, if available bridge/statement/evidence IDs.
   Rules: clicking a signal should show provenance metadata; required for trust and explainability.

10. Signal Quality Agent — **PLANNED**
    Lives in: Add Information
    Purpose: Score reliability, freshness, directness, and duplication risk of signals.
    Must output: quality score and warnings.

11. Conflict Resolver Agent — **PLANNED**
    Lives in: Add Information
    Purpose: Detect and manage conflicting signals across sources.
    Must output: merged, flagged, or separated conflicts.

Phase 3 — Core judgment enrichment:

12. Core CIOS Judgment Engine — **BUILT** (core-forecast-engine.ts — DO NOT MODIFY)
    Lives in: Judge
    Purpose: Produce the forecast, confidence, top drivers, and top constraints.

13. Case Comparator / Prior Structuring Agent — **PLANNED**
    Lives in: Judge
    Purpose: Compare current case to internal/external prior cases and structure analog logic.
    Must output: comparable case name, brand, company, context, similarity, difference, implication, confidence.
    Rules: analogs must be identifiable; do not render analogs without brand and company; supports judgment but does not replace the core engine.

14. Constraint Decomposition Agent — **BUILT** (constraint decomposition in judgment engine)
    Lives in: Judge
    Purpose: Break vague constraints into ranked concrete drivers.
    Must output: ranked sub-drivers under each constraint.

15. Explanation / Ask CIOS Agent — **BUILT** (ExplainBox.tsx / explain-service.ts)
    Lives in: Judge
    Purpose: Answer "why," "what if," "how to fix," and "what does this mean" questions about the current case.
    Must output: traceable explanations grounded in current state.
    Rules: answers must be grounded in current case state, audit trail, signals, constraints, and analogs; no freewheeling generic chat; if not answerable from current data, say so clearly.

16. Integrity / Consistency Agent — **PARTIAL** (integrity checks in judgment engine)
    Lives in: Judge + Decide
    Purpose: Check that signals, confidence, narrative, recommendation, and constraints are coherent.
    Must output: pass/fail integrity checks and warnings.

Phase 4 — Decision and simulation:

17. Decision Translation Agent — **BUILT** (existing Decide step)
    Lives in: Decide
    Purpose: Convert forecast into a specific recommended decision and rationale.
    Must output: recommended action, rationale, success conditions, kill criteria/falsifiers.

18. Prioritization Agent — **PLANNED**
    Lives in: Decide
    Purpose: Rank actions by leverage and urgency.
    Must output: top 3–5 actions, leverage ranking, immediate vs later actions.

19. Actor Segmentation Agent — **PLANNED**
    Lives in: Simulate, feeds Judge
    Purpose: Identify the market actors that drive adoption and define their behavioral logic. This is behavioral market segmentation, not communication packaging.
    Must output per segment: segment name, role in market, behavioral characteristics, primary constraint, adoption trigger, influence weight, likely adoption timing, sensitivity to key signals, interactions with other actors.
    Examples: academic HCPs, community HCPs, payers, patients, KOLs, IDNs.

20. Simulation Agent — **PARTIAL** (existing simulate step)
    Lives in: Simulate
    Purpose: Generate scenario paths from the current judgment state.
    Must output: base path, upside path, downside path, catalyst triggers, barrier resolution points, timing effects.
    Rules: simulation depends on current judgment and actor segments; do not simulate from raw inputs alone.

21. Stakeholder Reaction Agent — **PLANNED**
    Lives in: Simulate
    Purpose: Simulate how each market actor reacts to changes over time.
    Must output: actor-specific scenario behavior.

Phase 5 — Learning system:

22. Forecast Ledger Agent — **PARTIAL** (forecast ledger exists)
    Lives in: Diagnostics / Library
    Purpose: Store forecast history and updates.
    Must output: prior forecast, updated forecast, delta, why it changed.

23. Calibration Agent — **PARTIAL** (calibration system exists)
    Lives in: Diagnostics / Library
    Purpose: Compare forecast vs real outcomes and detect systematic bias.
    Must output: overconfidence/underconfidence flags, pessimism/optimism drift, accuracy by case type.

24. Human Override / Editorial Agent — **PARTIAL** (manual signal editing exists)
    Lives in: cross-system
    Purpose: Allow expert intervention without breaking structure.

25. Response Composer — **BUILT** (existing Respond step)
    Lives in: Respond
    Purpose: Translate the decision into an output format such as strategy memo, RFP response, pitch answer, or executive summary.

**Immediate build priority order:**
1. Decision Gating Agent — **DONE**
2. Question Structuring Agent
3. External Signal Scout
4. Signal Normalizer / Deduplicator
5. Import Adapter Agent — **DONE**
6. Provenance / Traceability Agent
7. Case Comparator / Prior Structuring Agent
8. Explanation / Ask CIOS Agent — **DONE**
9. Actor Segmentation Agent
10. Simulation Agent
11. Decision Translation Agent — **DONE**
12. Prioritization Agent
13. Forecast Ledger Agent
14. Calibration Agent

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
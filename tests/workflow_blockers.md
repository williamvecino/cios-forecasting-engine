# Workflow Test Blockers Report

## Status: All 10 tests pass

No remaining blockers. All 10 test questions successfully complete the full workflow pipeline:
Question parsing → Field extraction → Case creation → Signal addition → Forecast generation → Sensitivity analysis → Decision recommendation.

## Previously Resolved Issues

All failures were in the question parser (field extraction layer). No issues were found in:
- Case creation API
- Signal creation API
- Forecast engine (Bayesian calculation)
- Sensitivity analysis (swing factor detection)
- Decision recommendation generation
- Actor simulation
- Calibration pipeline

## Architectural Notes

1. **Time horizon inference** — Questions without explicit time references now default to "12 months" when adoption-related keywords are detected. This is a reasonable default for the CIOS domain but may need refinement if non-pharma use cases are added.

2. **Subject extraction** — The parser now uses multiple extraction strategies in priority order: exact brand match → "for/of X" pattern → contextual domain patterns → sentence structure analysis ("Will [subject] [verb]"). This covers most pharma strategic questions but may need extension for highly novel question structures.

3. **Confidence level** — All test forecasts show "Developing" confidence because each test only adds 2 signals. In production use with more signals, confidence would progress to "Moderate" or "High". This is expected behavior, not a bug.

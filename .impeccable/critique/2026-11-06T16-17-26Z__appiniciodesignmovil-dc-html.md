---
target: C · Inicio móvil con DESIGN.md
total_score: 36
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
target_identity: "file:/tmp/claude-1000/-home-alberba-Projects-finance-tracker/1d1be7d5-4b10-47e2-8548-c6795a479671/scratchpad/canvas/project/AppInicioDesignMovil.dc.html"
target_fingerprint: "sha256:df0e4f61be6de45234a08deeb56e0f993e76ac39a12254d9614970eb5f217253"
target_path: /tmp/claude-1000/-home-alberba-Projects-finance-tracker/1d1be7d5-4b10-47e2-8548-c6795a479671/scratchpad/canvas/project/AppInicioDesignMovil.dc.html
timestamp: 2026-11-06T16-17-26Z
slug: appiniciodesignmovil-dc-html
---
Method: dual-agent (A: design review · B: detector + browser), round 5 of an iterative run.

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of status | 4 | Pace verdict, toast + new row together, unsent rows with time |
| 2 | Match real world | 4 | «pendiente» only in glossary sense; natural copy |
| 3 | User control | 4 | Undo everywhere, edit/skip, drag/Escape/scrim, focus return |
| 4 | Consistency | 3 | Suspect item bypass via row/bulk confirm (fixed after scoring) |
| 5 | Error prevention | 3 | Same bypass; suspect match lacked concept check (fixed after scoring) |
| 6 | Recognition | 4 | Date-first meta, › affordance, evidence in review sheet |
| 7 | Flexibility | 4 | Repeat chips, Guardar y otro, confirm-all, catch-up across months |
| 8 | Minimalism | 3 | 266px chart mostly empty future (DESIGN size); error banner length (shortened) |
| 9 | Error recovery | 4 | Count, safety, cause, auto + manual retry |
| 10 | Help | 3 | No empty/first-run states for Movimientos, Presupuesto, Objetivos |
| **Total** | | **36/40** | Excellent (threshold) |

Detector: only false positives (nested-cards from canvas frame, modal occlusion, deliberate caret). Contrast: no failures in any theme. Targets ≥44 everywhere. No console errors.
Post-score fixes: bulk confirm excludes suspected duplicates; suspect row button reads «Revisar»; suspect match requires a shared word; two-line error banner; focus never drops to body.
Trend: 24 → 30 → 31 → 34 → 36.

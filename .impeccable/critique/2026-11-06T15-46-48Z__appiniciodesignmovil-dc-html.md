---
target: C · Inicio móvil con DESIGN.md
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:/tmp/claude-1000/-home-alberba-Projects-finance-tracker/1d1be7d5-4b10-47e2-8548-c6795a479671/scratchpad/canvas/project/AppInicioDesignMovil.dc.html"
target_fingerprint: "sha256:0c108f3711b4f25889a47328a8c6314dc559a9ef14db0eb1c826eb499da8b674"
target_path: /tmp/claude-1000/-home-alberba-Projects-finance-tracker/1d1be7d5-4b10-47e2-8548-c6795a479671/scratchpad/canvas/project/AppInicioDesignMovil.dc.html
timestamp: 2026-11-06T15-46-48Z
slug: appiniciodesignmovil-dc-html
---
⚠️ Round 1 of an iterative critique (dual-agent: A design review · B detector + browser).

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of status | 3 | «hoy» axis label detached from the dot; no offline status |
| 2 | Match real world | 2 | Straight-line plan ignores rent on day 1 → «827 € por encima del plan» |
| 3 | User control | 3 | Undo of a confirmation loses the pending item |
| 4 | Consistency | 2 | `.scr button` cascade overrides FAB/primary/keys/chips; text links vs ↗ cards |
| 5 | Error prevention | 2 | FAB covers Gimnasio «Confirmar» |
| 6 | Recognition | 3 | Repeat chips good; 3 of 6 categories hidden in rail |
| 7 | Flexibility | 2 | No batch entry; date resets to Hoy |
| 8 | Minimalism | 2 | Spend shown 3×, pending twice, date label and links |
| 9 | Error recovery | 2 | No offline/failure states |
| 10 | Help | 3 | Placeholders and labels adequate |
| **Total** | | **24/40** | Acceptable |

P0 cascade bug (FAB/primary 2.36:1). P1 FAB occlusion and fold anchoring. P1 chart plan model. P2 user's ↗-card and no-date corrections. P2 pending logic and placement (DESIGN: sheet from top bar).
Detector (URL scan): low-contrast FAB/primary; text-occlusion of Confirmar; nested-cards ×6 false positive (canvas frame); light-theme toast «Deshacer» 2.34:1; chips/segments 36–38px.

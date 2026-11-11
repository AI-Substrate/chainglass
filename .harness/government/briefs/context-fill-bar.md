# Brief — context-fill bar on terminal window buttons and the window overview

Prime: pij-outer-bobcat · Coder: pij-elegant-marsupial · 2026-11-11 · Jordan asked.

## Ask (Jordan's words, cleaned)

In the window strip above the terminal (the rounded-square buttons used to switch tmux windows), add a
small vertical bar on the right-hand side of each button showing how full that window's agent context
is: a couple of pixels wide, coloured in green / yellow / orange / red bands. Show the same bar in the
down-arrow popout window overview above the terminal (`terminal-window-overview.tsx`).

## Data

- pij already reports it per seat: `sessionStatus.status.contextUsedTokens.value` and
  `contextWindowTokens.value` (also top-level `contextUsed`) on `/v1/seats` / `pij list --json`.
  fill = used / window. 87/97 live seats carry both; the rest render no bar (not an empty or zero bar).
- No new tmux launches and no new polling: the sidecar already reads `rs.seats()` (shared, 5 s TTL) to
  join seats to windows (`tmux-session-manager.ts`, `seatsByPane` / `seatIds`). Carry the fill on the
  window entries it already returns, or reuse the overview's existing `/api/pij/fleet` data there.
  Prefer one source for both surfaces if it stays cheap.

## Design

- Bar: vertical, ~2-3 px wide, inside the button's right edge, full button height as track; filled
  from the bottom to the fill fraction. Track subtle (`bg-muted`-ish), fill coloured by band.
- Bands (prime's default; Jordan may tune): green < 50%, yellow 50–70%, orange 70–85%, red ≥ 85%.
  Put thresholds in one exported constant.
- Accessible: `title`/`aria-label` like "context 47% (468k / 1.0M)". No layout shift on the strip.
- Works in light and dark themes (Tailwind tokens, no hard-coded hex where a token exists).

## Acceptance

- Unit test for the band mapping and fill clamp (0–100%, missing data → no bar).
- Browser proof on Jordan's dev server (do not restart it): screenshots in `scratch/` of the strip on
  unimatrix-main (bars of different bands visible) and of the popout overview showing bars.
- `just fft` at `nice -n 19`, green; one commit on main; push; report SHA + screenshot paths.

## Rules

RULINGS 1-11 (`/Users/jordanknight/substrate/chainglass-governance/.harness/government/RULINGS.md`).
Main tree hot-reloads in Jordan's dev server: keep every save compiling. Stage by path.

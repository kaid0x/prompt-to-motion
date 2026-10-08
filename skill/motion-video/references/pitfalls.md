# Do and don't

Every rule here comes from a real mistake made while building the example videos.

## Do
- **Time everything to words.** `WT('written')`, not `3.14`. A new voice or an edited script then re-times the whole video. If you must use a literal, wrap it in `M()`.
- **Hook in 3 seconds.** The first frame already moves, and the first line is a contrast or a claim ("Most people use systems. I break them.").
- **One idea per beat, 2–5 words of type.** The captions carry the full sentence, so the type carries the idea.
- **Burn in captions.** Most social video autoplays muted, and the word-by-word highlight keeps a muted viewer.
- **Leave the subject on the right third** (`sx` ≈ 1.2–1.8) whenever there is type on the left.
- **Add a hold key before every camera move**, or the camera creeps across the whole gap between keys.
- **Use intensity for glow** (`col('signal', 3)`), not size, and keep secondary elements dim (floor, lattice, dust) so the subject wins.
- **Sheet every beat and every transition** before a full render. Transitions are where empty frames and collisions hide.
- **Render in chunks, detached, resumable**, then pull frames from the final file before delivering.
- **Cap the file size for the destination** (`MAX_MB`): 28 for chat uploads, ~95 for most social sites.
- **Tell the user what you inferred** (descriptions, locations, numbers) so they can check it before posting.
- **Respect licences:** keep the engine's MIT notice, and remember that ElevenLabs free-plan output needs attribution. Kokoro output is free to use.

## Don't
- **Don't let text overflow its container.** Measure (`measure()` / `c.measureText`) and shrink to fit. A word sticking out of a badge is the first thing a viewer sees.
- **Don't stack two text blocks in the same place with overlapping lifetimes.** End one (`t1`) before the next `t0`; each fade-out is 0.4 s.
- **Don't put a bright light behind a title.** Fade the glow out when the title comes in.
- **Don't let cards overlap.** Neighbours on a ring of radius R need an angular gap of at least `2·asin(width / 2R)`.
- **Don't show the backs of cards.** Use `side: FrontSide` (mirrored text looks broken).
- **Don't crop the subject at the frame edge.** Lower `sx` or pull the camera back for big props.
- **Don't use `Infinity` for an element's end time** (fades compute NaN, which shows as a white blowout). Use a large number.
- **Don't keep state between frames** (counters, physics accumulators). Frames render out of order in previews, sheets and chunks. Derive everything from `t`.
- **Don't let a neighbouring station sit behind the type.** Space stations far apart (14+ units at a long lens), or aim the camera down the row so the previous one is behind the lens.
- **Don't use a big additive glow plane.** Its square edges show up as vertical bands once the camera pulls back; put ambient glow in the sky shader instead.
- **Don't let the bloom eat a light theme.** Paper white is ~0.9 linear, so set `bloomThreshold` ≈ 1.6.
- **Don't make the radar sweep or any secondary effect strong.** At full strength it turns into red slabs across the floor.
- **Don't rely on a running dev server.** `render.ts` starts its own for the active `PROJECT`, so another project's server can't leak in.
- **Don't `pkill -f <anything>`** inside a sandbox. The pattern also matches your own shell's command line and kills it. Use `pkill -x chrome`, or kill by PID.
- **Don't render 1080p60 on a CPU-only box.** It runs at ~1 s per 720p frame with SwiftShader. Draft at 720p30 (`SCALE=0.6666667`) and render the final at 1080p on a GPU machine.
- **Don't invent facts about a person or product.** Use their site or CV. If you add filler, flag it.
- **Don't change the script after timing the scene without re-aligning.** `WT()` will point at the wrong moments, or throw.

## Timing cheat sheet
| moment | when |
|---|---|
| camera arrival on a subject | word start + 0.1–0.3 s, eased inOutQuart |
| whoosh SFX | 0.3 s before the move starts |
| impact SFX, punch, flash | on the word start (−0.02 s) |
| riser or swell | ends on the word |
| type in | 0.05–0.1 s before the word |
| type out | 0.3–0.5 s after the line ends, before the next block |
| end card | after the last word, with 2.5 s of tail in the audio |

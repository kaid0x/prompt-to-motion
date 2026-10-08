# Example prompts

A good brief names the **purpose and viewer**, the **length**, the **voice**, where the **facts and brand**
come from, and the **deliverable**. Everything else (the shots, the 3D, the type) is your job.

## 1. Personal intro (this is the prompt behind `projects/portfolio-intro`)
> mhaseebashfaq.com — make a video for me using the same color scheme as the website. A quick intro about
> myself, 30 seconds to 1 min max. Add a male narration, good cinematic camera movement and 3D models or
> shapes, whichever is better. Make it look professional. It should feel engaging and hold a recruiter's attention.

What it became: facts and the palette (CSS variables), fonts (Chakra Petch / JetBrains Mono / IBM Plex Sans) and the
"case file" mood all came from the site. The script runs as hook → name → whoami → tools → AI security → event he built →
three proofs → open to internships → call to action. A single 3D world (a shattered core) works as the "system" being broken,
each section is a camera station, and the 54 s video was delivered under 30 MB.

## 2. Event opener / rules
> Make a 90-second opening video for our school hackathon "WSH '26": no AI tools allowed, volunteers
> monitor the floor and report suspicious activity to the hosts (that can mean disqualification), respect
> the volunteers, hosts and teachers, and ask your table's volunteer if you're stuck. Use the colours from this poster. Female narration.

Approach: one rule per beat. Each rule gets a big stamp-style title and a strong visual metaphor (a crossed-out
robot, an eye, a table map), and the "disqualification" beat is the single loudest moment.

## 3. Product launch teaser (this became `projects/lumen`, a fictional app)
> 20-second teaser for our app Lumen (habit tracker) launching March 3. Calm, premium, dark mode with
> the teal from our logo. Soft female voice. Start on "Small things, every day".

Approach: slow camera, fewer cuts and no HUD. One hero object (a ring of seven days) carries the whole story: orbs fly in
and fill the days, a missed day breathes in warm light and "waits", and the ring completes under the wordmark.

## 4. Concept explainer
> Explain public-key cryptography in 45 seconds for first-year students. Two locks, a padlock you can
> close but not open. Friendly, clear, no jargon.

Approach: script first, about 100 words, built on one metaphor. Each beat adds one object to a scene that grows,
and type carries the terms ("PUBLIC KEY", "PRIVATE KEY").

## 5. Numbers story (this became `projects/byte-night`, a fictional event)
> "Byte Night in numbers": 60 teams, 120 students, 32 challenges across 7 categories, 1,400 flags, won by 4 points.
> 25 seconds, light and editorial, British male voice.

Approach: a light paper palette and lit, shadowed blocks. Each number is a station that builds itself from the thing it
counts (120 cubes, 1,400 flags), with a counter rolling up on its word and the camera dollying down the street. The end shot
pulls back to show the whole night at once.

## Follow-up prompts that work
- "Use this ElevenLabs file instead" → layout trick (`lyrics.layout.json`), align, re-render.
- "Make the accent green" → `brand.json`, re-render.
- "The VOLUNTEER text overflows the badge at the end. Check for other flaws too" → fix, then sheet every beat (not just that one).
- "Shorter, 30 seconds" → cut lines from the script, then re-run tts, align, analyze and render.
- "Compress it so you can send it in one go" → `MAX_MB=28 pipeline/finish.sh` (no re-render).

## Prompts that go wrong
- "Make it like the Apple keynote" with no facts → you end up inventing content. Ask for the facts.
- A 3-minute script for a "quick intro" → recruiters stop at ~45 s. Push back on length.
- "Use [famous character / brand]" → don't reproduce someone else's IP. Offer an original motif.

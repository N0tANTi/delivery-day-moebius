# The brief

This is the brief Delivery Day was built from, unedited. It began as a morph of the
[Summer Cycle](https://github.com/StarKnightt/summer-cycle) brief: same shape, same rules, a broom
instead of a bicycle. The list after it says where the game went beyond it, so the whole thing can
be rebuilt from this file.

---

Delivery Day — Ghibli-Style Broom Flight — Browser Build

The Game

Build a third-person flying game in Three.js with a Studio Ghibli / Makoto Shinkai art style. A young witch rides a broom over a European seaside town on a summer morning, a small black cat perched on the bristles behind her. No combat, no score, no timer, no deliveries to complete — just fly and enjoy the town. This is a cinematic experience for a 30-40 second screen recording.

Art Direction — THIS IS THE MOST IMPORTANT SECTION

The entire build lives or dies on matching this aesthetic. Reference: Studio Ghibli films (Kiki's Delivery Service town and harbour scenes, Porco Rosso's Adriatic, Howl's Moving Castle's Porthaven), Makoto Shinkai films (Your Name, Weathering With You sky and cloud art).

Visual rules
Painterly, not photorealistic — colors should look like watercolor/gouache paintings
Custom toon/cel shader on ALL materials — flat base color + one shadow step + rim light
Bold dark outlines on geometry edges (2-3px), thinning with distance so the far town doesn't turn to ink
Bright mid-morning summer light — clean, high sun slightly to one side, long soft shadows
Soft color palette: terracotta roofs, cream and pastel plaster walls, sea teal to deep blue, sky blue, warm greens on the hills
NO harsh shadows — soft, diffused lighting everywhere
Clouds must be fluffy, volumetric-looking, Ghibli-style cumulus — towering, with lit tops and cool blue undersides — not flat planes. The player can fly close to and around them
Sky gradient: deep blue at top → pale warm white at horizon
Atmosphere/haze over the sea and far coast — distance fog with a cool blue tint over water, warm over land

Shaders (critical)
Toon shader with 2-3 color steps (lit, shadow, dark shadow) instead of smooth PBR
Outline pass using inverted hull method or post-processing edge detection
Painterly texture overlay on surfaces — subtle brush stroke pattern blended on top of flat colors
Sky shader with gradient + procedural cloud shapes
Sea shader: flat toon water with two tones, a moving painted-highlight glint pattern, and white foam lines where water meets the harbour wall and rocks

Environment — Seaside Town on a Hill
The town: Built on a slope rising from the harbour. Narrow streets winding up between tall 3-4 storey houses with pitched terracotta roofs, dormer windows, chimneys and window boxes of red geraniums. Walls in cream, ochre, pale pink, mint. Streets are canyons you can fly down between the roofs
Landmarks (the camera needs things to fly past): A tall clock tower with a green copper spire and a working clock face in the town centre. A bakery on a corner with a striped awning and a hanging bread sign. A church or town hall with a dome. A lighthouse on the harbour mole, red and white
The harbour: Stone quay, a few moored fishing boats and one small steamship with a smoking funnel. Bollards, stacked crates, a crane. Gulls circling and perched on posts
Rooftop life: Laundry lines strung between houses with white sheets and shirts swaying. Pigeons on ridges. Chimney pots with thin wisps of smoke. TV antennas and a weathervane
Beyond the town: Green hills with cypress and olive trees behind, a road winding up them, a far headland across the bay with a second small village, open sea to the horizon with one or two sails
Sky: Large cumulus clouds at mid altitude, reachable. Gulls (flocking particle system) that scatter when you fly through them. Sun high and to the side — god rays through cloud gaps optional

The Character + Broom
Character: Low-poly anime-style young witch sitting side-saddle or astride a broom. Simple body: head (sphere with flat face), torso, arms and legs. Dark dress, big red hair bow, short dark hair — flat colored with toon shader. An original character inspired by the reference, not a copy of one. NOT detailed — think Ghibli background characters, not protagonists. Cel-shaded with the same outline pass as everything else
Broom: Straight wooden handle (cylinder) and a bristle bundle (tapered cone with strand-line texture). A small radio or satchel hanging from the handle. A small black cat sitting on the bristles, tail swaying
Animation: Dress hem and hair bow flutter with speed. Body leans into banks and pitches with climbs and dives. The cat's tail and ears react — ducks down in dives, looks around when slow. Bristles trail slightly

Camera: Third person, behind and slightly above the rider. Follows smoothly with slight lag — not rigid. Pulls back and widens FOV a little with speed, tightens when slow. Rolls gently with the bank (much less than the rider) for a sense of flight. Never clips into roofs — pushes in toward the rider if something is behind

Controls: Auto-flies forward at a gentle cruise. W / Up: speed up. S / Down: slow to a near hover. A / D or Left / Right: bank and turn. Mouse or Space / Shift: climb / descend. Smooth, floaty handling, never twitchy. Speed range: drifting to brisk, never jet-fast. No stalling, no falling

Collision: Soft. Buildings, the tower, the lighthouse, masts and the ground push the broom gently away and it slows — no crash, no bounce-back animation, no damage. Invisible soft ceiling just above the tallest clouds and soft walls at the edge of the bay turn the rider back toward the town. Can pass through clouds (brief white-out mist)

Audio (all synthesized — Web Audio API): Wind: filtered noise that rises and brightens with speed, whooshes when banking hard or passing close to a roof. Gulls: occasional synthesized cries. Harbour: soft water lapping, a distant ship horn now and then. Town: a clock bell chime every so often, faint. No music track (the ambient sounds ARE the soundtrack). All synthesized at runtime, nothing downloaded

Render / Output: 1920x1080. 60fps. Post-processing: toon outline pass, subtle bloom on the sea glint and sunlit clouds, clean summer color grading, soft vignette. No SSAO — keep it flat/painterly. Deploy on GitHub Pages

Do NOT: Make it photorealistic — this is painterly/toon. Use standard PBR materials — everything must use toon/cel shader. Download any assets — all geometry, textures, and audio generated in code. Add combat, enemies, objectives, deliveries, rings to fly through or scoring. Add UI except a subtle altitude/speed indicator if needed. Make the character hyper-detailed. Copy a film character, logo or the town from a film exactly — this is an homage, not a replica. Add night mode or weather changes — keep it one bright morning. Max out GPU — test on RTX 4060

Gauntlet Loop: Builder agent builds the scene following this spec. Critic agent compares rendered frames against Ghibli harbour-town stills and Shinkai cloudscapes, checking specifically: do the roofs read as a hillside town from 100 m up, do the clouds look climbable, does flying feel floaty. Run builder and critic sequentially, not in parallel.

What to Cut if it Gets Too Complex: Gulls; Laundry lines; Steamship smoke; The far village across the bay; Painterly texture overlay; Sea foam lines; Flying through clouds (make them solid-soft). Never cut: toon/cel shader, outlines, cumulus clouds, the witch on the broom, the black cat, the hillside town with terracotta roofs, the clock tower, the sea, the sky gradient, third-person camera.

---

## What changed along the way

The brief was the starting point, not the fence. Across the iterations, at the user's request,
the scope grew past it:

- **Prague became the main city.** The seaside town is still there at `?city=harbour`, but the
  default is a painted summer Prague built on the same engine: the city only swaps the terrain,
  the water and the buildings. The brief said "a European seaside town".
- **The Vltava instead of the sea.** A curving river with stone embankments, painted ripples, sun
  glint and foam at the banks, the bridge piers and a weir upstream. Tour boats run up and down
  and pass under the bridge; small boats are moored along the Old Town bank.
- **Charles Bridge.** Five stone arches you can fly under, cutwaters on the piers, dark statues
  along both parapets (some with gold crosses or halos), lamps, the Old Town Bridge Tower at one
  end and the two Lesser Town Bridge Towers with their gate at the other.
- **Old Town.** Blocks of houses around courtyards, following the river. Curved baroque gables or
  dormer roofs, cornices, first-floor pediments, pastel plaster, terracotta with some slate and
  copper. About one block in seven hides a church whose Gothic spire or green onion dome rises over
  the roofs: the city of a hundred spires.
- **Old Town Square.** A ring of houses facing in, the Jan Hus memorial, the Old Town Hall tower
  with the astronomical clock (its gold hand follows the real time of day), and Týn Church: two
  spiky black towers with rings of pinnacles rising behind the Týn school.
- **Malá Strana and the castle.** Houses climbing the hill on the other bank, St Nicholas with its
  copper dome and bell tower, and on the ridge Prague Castle's long palace front with wings round
  the courtyard. Inside it St Vitus: flying buttresses, pinnacles, twin west spires, a rose window
  and the great south tower with its copper helmet. The Powder Tower stands at the Old Town edge.
- **Petřín and Letná.** Petřín hill with its lattice lookout tower to the west, and the green
  Letná hill on the far bank.
- **Sound for the city.** More church bells answering each other at different pitches, and
  distant tram bells in place of the ship's horn.
- **Lighter geometry for a denser city.** Prague windows are flat painted panels rather than boxes,
  and courtyard and party walls carry no windows, so a thousand-plus houses merge into one mesh.
- **Recording and testing helpers.** `?at=x,y,z,yaw` sets the starting pose, `?auto` makes her
  drift on her own for hands-free recording, `?fps` shows the frame rate, and `window.game.step()`
  advances the simulation when the tab is hidden and animation frames are paused.
- **Hosting.** GitHub Pages from the `gh-pages` branch, with Open Graph and Twitter card tags and
  a preview image, `og.jpg`.

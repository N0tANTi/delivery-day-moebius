# Delivery Day

A young witch and her black cat on a summer morning over Prague. Fly along the Vltava, slip under
Charles Bridge, and circle the spires of St Vitus. There's no score and nothing to deliver: you just fly.

**[Play it in the browser](https://melvincarvalho.github.io/delivery-day/)**

![Flying down the Vltava towards Charles Bridge, Malá Strana and the castle on the hill](og.jpg)

## Controls

| Key | |
|---|---|
| W / S | faster · slower |
| A / D | bank left · right |
| Space / Shift | climb · descend |
| hold mouse | steer and climb with the pointer |
| H | hide all text, for recording |
| M | mute |

The broom always flies forward and can't stall or crash. Buildings push you gently away, and the
edge of the map turns you back towards the city.

## Two cities

- **Prague** (the default): the river, Charles Bridge, Old Town Square with Týn and the astronomical
  clock, Malá Strana, the castle and St Vitus, and the Petřín tower.
- **The harbour town**, [`?city=harbour`](https://melvincarvalho.github.io/delivery-day/?city=harbour):
  a hillside seaside town with a clock tower, a lighthouse and laundry lines, where the game started.

## URL options

| Option | |
|---|---|
| `?city=harbour` | the seaside town instead of Prague |
| `?at=x,y,z,yaw` | start somewhere else, e.g. `?at=70,4.5,32,1.57` flies you under Charles Bridge |
| `?auto` | she drifts and turns on her own, for hands-free recording |
| `?fps` | show the frame rate |

## How it's made

Everything is Three.js generated in code: no models, no textures, no audio files. It's a static page
with ES modules, and Three.js loads from a CDN.

- **Look:** a toon material with three light steps, a brush-stroke overlay and a warm rim light. Ink
  outlines come from a depth and normals pass, fading with distance. Bloom, colour grading and a
  vignette go on top.
- **Sky and water:** a gradient sky, cumulus clouds that white out the screen when you fly into them,
  and a painted water shader with drifting ripples, sun glint and foam.
- **City:** each house is assembled from boxes and extruded shapes and merged into a single mesh.
  Landmarks are built from the same parts.
- **Sound:** Web Audio, all synthesized: wind, a whoosh past roofs, water, gulls, church bells and
  trams.

| File | |
|---|---|
| `src/main.js` | flight model, camera, input, main loop |
| `src/world.js` | light, sky, terrain, water, the house builder, harbour town, trees, clouds, gulls |
| `src/prague.js` | Prague: blocks, Charles Bridge, the square, Týn, the castle and St Vitus, Petřín |
| `src/rider.js` | the witch, the broom and the cat |
| `src/post.js` | ink outlines, bloom, grading |
| `src/toon.js` | toon material and brush noise |
| `src/audio.js` | synthesized sound |
| `src/util.js` | geography for both cities, noise, geometry merging |

To run it locally, serve the folder with any static server, e.g. `python3 -m http.server`.

## The brief

[`PROMPT.md`](PROMPT.md) is the brief it was built from, plus a list of where it went beyond it, so it
can be rebuilt from scratch. It began as a morph of
[Summer Cycle](https://github.com/StarKnightt/summer-cycle)'s brief, with a broom instead of a bicycle.

It's an homage to the feeling of Ghibli's harbour-town films, not a copy of any character or place
from them.

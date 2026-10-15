# Elaborate manga drawn in SVG

This guide concerns editable, code-authored illustration. Do not replace the drawing with a raster image, a traced generated picture or a bitmap reveal.

## Sources and applicable techniques

- [MDN: SVG paths](https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorials/SVG_from_scratch/Paths) explains cubic `C`/`S` and quadratic `Q`/`T` curves. Use deliberate cubic control handles for cheeks, eyelids, hair, fingertips and folds. Keep tangent directions aligned across smooth joins; reserve corners for intentional creases or points.
- [Inkscape: node types](https://inkscape-manuals.readthedocs.io/en/latest/node-types.html) distinguishes smooth nodes from cusps. Do not approximate every contour with short angular segments or force symmetry onto a three-quarter face.
- [Inkscape: calligraphy](https://inkscape.org/doc/tutorials/calligraphy/tutorial-calligraphy.html) describes width, pressure and thinning. In portable SVG code, express selected variable-width ink strokes as closed filled contours. A uniform `stroke-width` on every outline does not reproduce pressure-sensitive inking.
- [MDN: clipping paths](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/clipPath) explains restricting visible regions. Put tone and hatching inside explicit form/shadow clips, with opaque base fills so background construction lines do not show through the subject.
- [MDN: patterns](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/pattern) documents reusable pattern tiles. Keep screentones in deliberate coordinate space and test at final output size; a pattern is shading, not a substitute for anatomy or a finished contour.

These sources explain vector mechanics. The manga-specific drawing decisions below are our application of those mechanics, not a claim that SVG features automatically create good illustration.

## Drawing passes

1. Block the pose, perspective, face landmarks and hand gesture. Review the silhouette before details.
2. Draw a small number of well-controlled primary contours. Rework handle positions before adding extra nodes.
3. Define focal ink masses and tapered accents: hair occlusion, upper eyelid and selected creases. Keep fine interior detail subordinate.
4. Construct grouped hair clumps around the skull, with curving strand direction and reserved highlights. Avoid a repeated row of identical triangles.
5. Construct eyes from separate lid, lash, iris, pupil and highlight shapes; maintain shared proportions between face and close-up. Construct fingers as overlapping curved volumes rather than an angular mitten.
6. Place fabric folds at tension, bend and contact points. Clip tone to actual shadow planes; avoid texture that ignores form.
7. Review the still at full size and thumbnail size, then refine awkward joins, tangencies, over-heavy lines, opaque layering and anatomy. Extra paths alone do not mean extra quality.
8. Animate stable part groups only after the still works. Use one seekable clock and preserve shapes during panel reveals and holds.

## Second study: drawing decisions before vector mechanics

The first pass improved curve mechanics. A more elaborate result needs an artist's construction and revision sequence. SVG can represent these choices, but cannot make the choices automatically.

- [Jose Fernandez: line quality](https://www.clipstudio.net/how-to-draw/archives/163108) ties heavier lines to shadow, crevices and foreground emphasis, and permits broken contours where light strikes. Translate that into selective filled ink wedges and locally thinner or interrupted curves. Avoid one heavy outline around every form.
- [Laovaan: hair construction](https://www.clipstudio.net/how-to-draw/archives/171638) builds hair in successive masses and strand layers. Translate the method into a skull volume, root direction, large overlapping clumps, a smaller strand pass and light-consistent highlights. Keep strand density subordinate to the large shapes; avoid a rigid helmet with evenly spaced white slots.
- [Proko: expressive hands](https://www.clipstudio.net/how-to-draw/archives/156141) starts from palm structure and finger gesture. For the SVG, establish wrist angle, palm volume, thumb mass and finger directions before drawing the final outline. A pen grip needs visible contact and plausible overlap, rather than a pen placed over an unrelated hand silhouette.
- [Anime line-art workflow](https://www.clipstudio.net/how-to-draw/archives/165695) includes local proportion correction and flipping the canvas to expose errors. Keep a temporary mirrored review view and correct eye alignment, jaw shape and negative spaces before adding decorative detail. The final drawing need not be symmetric.

### Required visual review

1. **Construction view:** inspect head axis, shoulder tilt, palm/pen contact, foreground overlap and perspective with tone hidden. Fix the pose here.
2. **Ink-only view:** check focal emphasis, shadow-side weight, light-side restraint, silhouette and accidental tangencies. Keep joins deliberate, without uniform mechanical outlines.
3. **Tone view:** confirm each shadow follows a coherent light source and surface. Hair highlights wrap around the head and clumps; texture does not flatten the subject.
4. **Full-size and thumbnail views:** assess expression, anatomy and hierarchy at both scales. Temporarily mirror the still to catch alignment errors. These are visual judgments; XML validity, path counts and passing browser tests do not establish them.
5. **Motion view:** animate only after the still is coherent. Retain the same drawn volumes and controlled exposure under arbitrary seeking.

These are adaptations of the artists' methods into code-authored SVG, not claims that their tutorials prescribe SVG implementations. Do not copy their artwork or substitute generated raster assets.

## Character-focused study

### Source lessons

- [Evan Liu: three-quarter face construction](https://tips.clip-studio.com/en-us/articles/5164) places the features within a head construction before detailing, and treats hair as large forms following the head. Use reference-dependent proportions rather than enforcing one universal anime ratio.
- [Liz Staley: eyes from different angles](https://tips.clip-studio.com/en-us/articles/6311) explains that eyelids wrap a spherical eye and that the head also has volume. A far eye in a turned face is narrower and closer to the nose; in stronger turns the nose can obscure it. Translating or mirroring a front-facing eye symbol is insufficient.
- [Gesture and action-line study](https://www.clipstudio.net/how-to-draw/archives/156164) starts with the movement through a pose. Use the head, shoulder and torso relationship to communicate intention, then add anatomical detail.
- [Anime-eye expression study](https://www.clipstudio.net/how-to-draw/archives/162395) ties eye shape and expression to the character's overall appearance. Establish gaze and emotion through the lids, brows and mouth together; more highlights do not automatically add expression.

### How this translates to SVG

Before drawing final paths, choose the intended head yaw, pitch, tilt and gaze; block the skull, jaw planes, face centreline and curved feature line. A 2D `rotate()` changes tilt only; it does not construct a turned head. Place each eye, brow, nose, mouth and ear relative to those guides. Share a character's design vocabulary across views, but author the perspective-dependent contours instead of reflecting one identical eye path.

Block torso and shoulder gesture before the head is finalized. Connect the neck plausibly to jaw and shoulders. Use purposeful negative space around arms and hands, and verify finger overlap and prop contact. Construct hair volume over the skull before fringe shapes; make the foreground clumps, root direction and overlap do the work. Do not rely on a heavy black helmet to conceal a weak head construction.

Review the character with highlights and screentones hidden. Can the pose, head turn, gaze and emotion still be read? Compare near/far features, neck placement, silhouette and hand contact. Then inspect full-size and mirrored views for alignment errors. Correct geometry and shape language before increasing stroke detail or texture density.

### Earlier character-sample critique

The earlier application-authored sample was a simplified graphic character. Its head was mainly a frontal construction with a small tilt; the eyes reused a reflected base shape, the torso was nearly frontal, and the pose had little body action. Smoother paths and new hair highlights improve finishing but do not resolve those construction limitations. These observations are our critique of the rendered SVG, not findings asserted by the source authors.

A stronger next character pass needs a coherent constructed pose and head volume, angle-aware facial features, a deliberate expression and supporting body gesture. Passing XML, palette, layout or motion checks cannot certify that artistic result.

## Runtime ownership

`generate-manga-illustration-preview.ts` contains the earlier application-authored code-drawn sample, not the subsequently published Claude-authored preview. Its character, eye and hand are separate editable path groups; the same eye construction is reused in portrait and detail panels. `style-032` owns the model guidance. Manga Production Theatre (`style-136`) has a separate identity.

## Subject-driven construction

Manga does not require a human protagonist. Choose people, animals, creatures, monsters, objects, machines, environments or abstract subjects from the brief. Apply the same standards of form, line hierarchy, selective tone, perspective and continuity to each. Human face, eye, hair and hand studies above are conditional techniques, not a required cast or portrait/eye/hand panel formula. Use species-specific structure for animals, coherent invented anatomy for monsters, structural perspective and articulation for machines, and spatial depth for environments. Do not add human eyes, hands or expressions to objects unless the story asks for anthropomorphism. Choose details and movement that explain this particular subject.

## Eye integrity when eyes are present

Build eye openings, masks and lid contours from matching landmarks in one coordinate system. Project a shared gaze target into both eyes; changing a far eye should preserve a coherent expression, not accidentally produce a squint. Clip the iris and pupil to the opening, keep highlights inside the iris, and place occluding lids above them. Move the iris assembly together for gaze; coordinate lid geometry and occlusion for blinks. Simplify small catchlights and iris texture at card size. Inspect the pair within the whole head, a neutral crop, gaze extremes and any blink frames at full and actual preview sizes. These are code-construction and visual-review requirements, not proof that a geometric or technical check alone guarantees appealing eyes. Apply them only to subjects with eyes.

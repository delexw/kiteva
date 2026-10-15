# Video pacing guidance

Reviewed 2026-10-15. This research informs the shared provider, planning, generation, repair and final-review prompts in `src/server/domains/video/pacing.ts`. It does not establish a universal timing standard or validate any previously generated video.

## Sources and lessons

- [Adobe: Introduction to video editing](https://www.adobe.com/creativecloud/video/discover/edit-a-video.html) presents emotion, story, rhythm, viewer focus and spatial continuity as editorial considerations. Its refinement guidance discusses how both slow and fast scenes can succeed or fail depending on purpose. Its social-media hook advice concerns that format, not the spacing of every subsequent development. Application: motivate cuts and sustain the intended feeling; do not enforce a fixed beat interval across all styles.
- [Animation Mentor: Timing and spacing](https://www.animationmentor.com/blog/tutorial-animate-with-timing-and-spacing-in-mind/) distinguishes motion spacing, acceleration, weight, holds and stylized timing. It recommends experimenting with anticipation, quick actions and dramatic holds instead of mechanical timing. Application: separate shot length from action duration and spacing; use contrast when it improves clarity and expression.
- [Animation Mentor: Anticipation](https://www.animationmentor.com/blog/anticipation-the-12-basic-principles-of-animation/) explains preparing the audience for an action or idea. Application: preserve useful preparation, execution, follow-through and recognition time rather than squeezing every gesture into one short preset.
- [Animation Mentor: Secondary action](https://www.animationmentor.com/blog/secondary-action-the-12-basic-principles-of-animation/) explains supporting behavior that adds character while remaining subordinate to the primary action. Application: crew members and props can react independently or remain still; do not keep everything moving merely to show activity.
- [Netflix: English (USA) timed text](https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide) sets subtitle reading-speed limits of up to 20 characters/second for adult programs and 17 for children's programs. [Subtitle timing guidance](https://partnerhelp.netflixstudios.com/hc/en-us/articles/360051554394-Timed-Text-Style-Guide-Subtitle-Timing-Guidelines) also emphasizes image/audio alignment and watching the complete result. These are Netflix subtitle requirements, not timings for every headline, diagram or speech bubble. Application: account for language, audience, copy length, actual legibility, narration and competing visual demands; do not turn a subtitle ceiling into a universal target.

## Application decisions

The following are our synthesis, not quoted industry rules:

1. Replace the former universal 2–4-second development, 0.25–0.8-second action and 0.3–0.9-second transition guidance. None of the references establishes those as defaults for every video.
2. Favor economical momentum while preserving comprehension and purposeful stillness. A reaction, tension or sustained demonstration can justify a long shot without extra facts. Rapid cuts can fail when the viewer cannot follow the action.
3. Budget fully legible text exposure separately from hidden or moving reveals. Preserve exact copy and selected duration by rebalancing the sequence, not silently shortening the message.
4. Coordinate audio and visual meaning without mechanically cutting on every musical beat or attaching a sound to every entrance. Silence remains valid.
5. Audit both dragging and rushing. A correction requires a documented interval and specific communication problem; a long interval alone is not a defect. A declared pacing plan, matching export duration, pixel-change metric or passing technical QA does not prove the delivered video has good pacing.

Final-review calibration includes justified suspense, varied beat lengths, dense copy exposed too briefly, a text reveal without reading time, and music-driven cuts that interrupt a demonstration. Tests check prompt propagation and evidence handling; human viewing or a completed semantic assessment is still needed to judge the delivered edit.

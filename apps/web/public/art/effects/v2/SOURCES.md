# Full-body butler bow v2

The appearance is the accepted project-original imagegen illustration in
`../v1/butler.webp`, inspected at its native 960×1440 resolution. No new face,
voice, outfit, or independently generated animation frames were introduced.

`scripts/build-effects-butler.py` produces the final motion deterministically:
fixed-length two-bone IK bends both legs while keeping both ankles/toes planted;
separate pelvis, spine, neck and head FK produces the bow; a continuous mesh
skins the existing full-body painted material onto those audited joints. This
retains visible legs/feet and a connected torso instead of hiding the legs and
rotating a cropped upper-body piece. The source is uniformly fitted once, never
resized separately per frame.

- Runtime: `butler-bow.webp`, 56 frames, 256×384 cells, 8×7 sheet (2048×2688).
- Source appearance: `butler-source.webp`, one shared 960×1440 authoring canvas.
- Pose contract/audit: `butler-pose.json`, 56 sets of joints, bones, ground, pivot,
  anatomical near/far identities and phase frames. Bone errors must remain ≤2%;
  all four foot anchors are constant, audited to 0px slide.
- Timing: the shared audio manifest's measured `butlerTiming`; stance and bend
  use 24fps, frames24–35 form an intentional low-pose breathing hold, then rise
  begins after the complete accepted spoken phrase. The final still remains
  fully visible. Reduced motion uses the standing frame.
- Reviews: the builder writes normal, skeleton, near-magenta/far-cyan audit GIFs
  and a 4-keyframe contact sheet to the caller's external review directory. These
  files may be inspected without opening a game page.

```powershell
python scripts/build-effects-butler.py C:/external/effects-v2-review
```

The manifest contains source/final hashes, dimensions, decoded memory and the
rebuild command. Character appearance is project-original generated artwork;
final limb motion and packing are deterministic, not generated guesses.

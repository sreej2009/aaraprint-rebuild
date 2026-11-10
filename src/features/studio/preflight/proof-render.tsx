import type Konva from 'konva';
import { useEffect, useRef } from 'react';
import { Layer, Stage } from 'react-konva';
import { Artwork } from '../canvas/artwork';
import { printBoxes } from '../geometry/boxes';
import type { SurfaceDesign } from '../schema/types';
import type { ProofRenderProps } from './proof-export';

/** Small on-screen stages; Konva redraws them at proof resolution in `toCanvas`. */
const STAGE_EDGE = 400;

/**
 * Draws each side for the proof with the editor's artwork nodes, clipped to the bleed (the proof
 * shows the bleed, tinted later), into its own canvas at the proof's resolution. The stages are
 * off screen and never listen for input; they exist only while a proof is being made.
 */
export default function ProofRender({ surfaces, layout, onDone, onError }: ProofRenderProps) {
  const stages = useRef<(Konva.Stage | null)[]>([]);
  useEffect(() => {
    // After Konva has built its nodes (fonts and images are ready before this mounts).
    const frame = requestAnimationFrame(() => {
      try {
        const canvases = surfaces.map((_, i) => {
          const stage = stages.current[i];
          const panel = layout.panels[i];
          if (!stage || !panel) throw new Error('The proof stage is missing.');
          return stage.toCanvas({ pixelRatio: panel.width / stage.width() });
        });
        onDone(canvases);
      } catch (error) {
        onError(error);
      }
    });
    return () => cancelAnimationFrame(frame);
    // Runs once per proof: the inputs are fixed while it's being made.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed top-0 -left-[10000px] opacity-0" data-testid="proof-render">
      {surfaces.map((surface, i) => (
        <ProofStage
          key={surface.id}
          surface={surface}
          stageRef={(stage) => {
            stages.current[i] = stage;
          }}
        />
      ))}
    </div>
  );
}

function ProofStage({ surface, stageRef }: { surface: SurfaceDesign; stageRef: (stage: Konva.Stage | null) => void }) {
  const { bleed } = printBoxes(surface.print);
  const v = Math.min(1, STAGE_EDGE / Math.max(bleed.width, bleed.height));
  return (
    <Stage ref={stageRef} width={bleed.width * v} height={bleed.height * v} scaleX={v} scaleY={v} x={-bleed.x * v} y={-bleed.y * v} listening={false}>
      <Layer listening={false}>
        <Artwork surface={surface} clip="bleed" />
      </Layer>
    </Stage>
  );
}

import { SkipLink } from '@/components/shell/skip-link';
import { CanvasWorkspace } from './canvas-workspace';
import { CANVAS_REGION_ID } from './dom-ids';
import { InspectorAside, InspectorSheet } from './inspector';
import { MobileToolbar, MoreSheet, PhoneSideBar } from './mobile-toolbar';
import { useStudioSession } from './session-context';
import { ToolPanel, ToolSheet } from './tool-panel';
import { ToolRail } from './tool-rail';
import { TopBar } from './top-bar';
import { useStudioUi } from './ui-context';

/**
 * Full-screen Studio layout (Blueprint §11.1, §13):
 *
 *   desktop  [top bar                                   ]
 *            [rail][panel 320][   workspace   ][inspector 300]
 *   laptop   [rail][panel 320][   workspace              ]   inspector → right drawer
 *   tablet   [rail][   workspace (panel floats over it)  ]   inspector → right drawer
 *   phone    [top bar][side switcher][ workspace ][bottom toolbar]   tools → bottom sheets
 */
export function StudioShell() {
  const { layout } = useStudioUi();
  const { product } = useStudioSession();
  const phone = layout === 'phone';
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-surface-subtle text-fg">
      <SkipLink target={CANVAS_REGION_ID} />
      <TopBar title={`Design Studio: ${product.name}`} />
      <div className="relative flex min-h-0 flex-1">
        {!phone && <ToolRail />}
        {(layout === 'laptop' || layout === 'desktop') && <ToolPanel variant="docked" />}
        {layout === 'tablet' && <ToolPanel variant="overlay" />}
        <main id="main-content" className="flex min-w-0 flex-1 flex-col">
          {/* On phones the side switcher sits above the canvas it controls. */}
          {phone && <PhoneSideBar />}
          <div className="min-h-0 flex-1">
            <CanvasWorkspace />
          </div>
        </main>
        {layout === 'desktop' && <InspectorAside />}
      </div>
      {phone && (
        <>
          <MobileToolbar />
          <ToolSheet />
          <MoreSheet />
        </>
      )}
      {layout !== 'desktop' && <InspectorSheet />}
    </div>
  );
}

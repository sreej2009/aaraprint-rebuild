import { useId } from 'react';
import { drawingFor, elementFrame, type Drawing } from '../canvas/drawing';
import type { DesignElement } from '../schema/types';
import type { TemplateSurface } from './types';

/**
 * A small, static picture of a template side (Plan M13): an SVG built from the same pure drawing
 * descriptions the canvas uses (canvas/drawing.ts), clipped to the finished shape. No Konva stage,
 * no image decoding, nothing interactive — dozens can show at once. Text lines follow the
 * template's own line breaks (templates are laid out so they don't wrap).
 */
export function TemplatePreview({ surface, label, graphicUrl, className }: { surface: TemplateSurface; label?: string; graphicUrl?: (id: string) => string | null; className?: string }) {
  const clipId = `template-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const { widthPx: w, heightPx: h, trim } = surface.print;
  const radius = trim.shape === 'rounded-rectangle' ? trim.cornerRadiusPx : 0;
  const outline = trim.shape === 'ellipse' ? <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} /> : <rect x={0} y={0} width={w} height={h} rx={radius} ry={radius} />;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={className}
      preserveAspectRatio="xMidYMid meet"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      data-testid="template-preview"
    >
      <defs>
        <clipPath id={clipId}>{outline}</clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect x={0} y={0} width={w} height={h} fill={surface.background.color ?? '#ffffff'} />
        {surface.elements.map((element) => (element.hidden ? null : <PreviewElement key={element.id} element={element} graphicUrl={graphicUrl} />))}
      </g>
      {/* The edge, as the canvas shows the trim line. */}
      {trim.shape === 'ellipse' ? (
        <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill="none" stroke="rgba(23,28,38,0.12)" strokeWidth={Math.max(w, h) / 200} vectorEffect="non-scaling-stroke" />
      ) : (
        <rect x={0} y={0} width={w} height={h} rx={radius} ry={radius} fill="none" stroke="rgba(23,28,38,0.12)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}

function PreviewElement({ element, graphicUrl }: { element: DesignElement; graphicUrl: ((id: string) => string | null) | undefined }) {
  const frame = elementFrame(element);
  const transform = `translate(${frame.x} ${frame.y}) rotate(${frame.rotation}) translate(${-frame.offsetX} ${-frame.offsetY})`;
  return (
    <g transform={transform} opacity={frame.opacity}>
      <PreviewDrawing drawing={drawingFor(element)} graphicUrl={graphicUrl} />
    </g>
  );
}

const paint = (fill: string | null, stroke: string | null, strokeWidth: number) => ({ fill: fill ?? 'none', stroke: stroke ?? 'none', strokeWidth: stroke ? strokeWidth : 0 });
const pointList = (points: number[]) => points.reduce<string[]>((out, v, i) => (i % 2 === 0 ? [...out, `${v},${points[i + 1]}`] : out), []).join(' ');

function PreviewDrawing({ drawing: d, graphicUrl }: { drawing: Drawing; graphicUrl: ((id: string) => string | null) | undefined }) {
  switch (d.kind) {
    case 'text': {
      const italic = d.fontStyle.startsWith('italic');
      const weight = d.fontStyle.split(' ').at(-1);
      const anchor = d.align === 'center' ? 'middle' : d.align === 'right' ? 'end' : 'start';
      const x = d.align === 'center' ? d.width / 2 : d.align === 'right' ? d.width : 0;
      const step = d.fontSize * d.lineHeight;
      return (
        <text
          fill={d.fill}
          fontFamily={d.fontFamily}
          fontSize={d.fontSize}
          fontWeight={weight}
          fontStyle={italic ? 'italic' : 'normal'}
          letterSpacing={d.letterSpacing}
          textAnchor={anchor}
          textDecoration={d.textDecoration || undefined}
          dominantBaseline="central"
        >
          {d.text.split('\n').map((line, i) => (
            <tspan key={i} x={x} y={(i + 0.5) * step}>
              {line || ' '}
            </tspan>
          ))}
        </text>
      );
    }
    case 'rect':
      return <rect x={d.x} y={d.y} width={d.width} height={d.height} rx={d.cornerRadius} ry={d.cornerRadius} {...paint(d.fill, d.stroke, d.strokeWidth)} />;
    case 'ellipse':
      return <ellipse cx={d.x} cy={d.y} rx={d.radiusX} ry={d.radiusY} {...paint(d.fill, d.stroke, d.strokeWidth)} />;
    case 'polyline':
      return d.closed ? (
        <polygon points={pointList(d.points)} {...paint(d.fill, d.stroke, d.strokeWidth)} strokeLinejoin="round" />
      ) : (
        <polyline points={pointList(d.points)} fill="none" stroke={d.stroke ?? 'none'} strokeWidth={d.strokeWidth} strokeLinecap={d.lineCap} strokeDasharray={d.dash?.join(' ')} />
      );
    case 'arrow': {
      const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = d.points;
      const tip = x2 - d.pointerLength;
      return (
        <g>
          <line x1={x1} y1={y1} x2={tip} y2={y2} stroke={d.stroke ?? 'none'} strokeWidth={d.strokeWidth} strokeLinecap={d.lineCap} />
          <polygon points={`${tip},${y2 - d.pointerWidth / 2} ${x2},${y2} ${tip},${y2 + d.pointerWidth / 2}`} fill={d.fill ?? 'none'} />
        </g>
      );
    }
    case 'graphic': {
      const url = graphicUrl?.(d.graphicId);
      return url ? <image href={url} width={d.width} height={d.height} preserveAspectRatio="xMidYMid meet" /> : null;
    }
    case 'upload':
      return null; // templates never contain uploads (validate.ts)
  }
}

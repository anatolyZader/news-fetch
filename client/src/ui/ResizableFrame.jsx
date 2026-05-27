import Box from '@mui/material/Box';
import PropTypes from 'prop-types';

const browserWindow = globalThis.window;

const CORNER = 8;

const CURSOR = {
  n:   'n-resize',
  s:   's-resize',
  e:   'e-resize',
  w:   'w-resize',
  ne:  'ne-resize',
  nw:  'nw-resize',
  se:  'se-resize',
  sw:  'sw-resize',
};

const EDGES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

/**
 * Invisible Windows-style edge/corner drag handles. Parent must be position: relative; width/height
 * in px. Does not set dimensions — the parent re-renders with updated size from onSize.
 */
export function ResizableFrame({
  width,
  height,
  onSize,
  minWidth = 200,
  minHeight = 120,
  maxWidth = 10000,
  maxHeight = 10000,
  zIndex = 2,
  edges: edgesProp = EDGES,
}) {
  const startHandle = (edge) => (ev) => {
    if (ev.button !== 0) return;
    const el = ev.currentTarget;
    const pointerId = ev.pointerId;
    el.setPointerCapture(pointerId);
    const startX = ev.clientX;
    const startY = ev.clientY;
    const startW = width;
    const startH = height;

    const move = (e) => {
      let dW = 0;
      let dH = 0;
      if (edge === 'e' || edge === 'ne' || edge === 'se') dW = e.clientX - startX;
      if (edge === 'w' || edge === 'nw' || edge === 'sw') dW = startX - e.clientX;
      if (edge === 's' || edge === 'se' || edge === 'sw') dH = e.clientY - startY;
      if (edge === 'n' || edge === 'ne' || edge === 'nw') dH = startY - e.clientY;
      const nextW = Math.round(Math.min(maxWidth, Math.max(minWidth, startW + dW)));
      const nextH = Math.round(Math.min(maxHeight, Math.max(minHeight, startH + dH)));
      onSize({ width: nextW, height: nextH });
    };
    let finished = false;
    const cleanup = () => {
      if (finished) return;
      finished = true;
      browserWindow?.removeEventListener('pointermove', move, true);
      browserWindow?.removeEventListener('pointerup', cleanup, true);
      browserWindow?.removeEventListener('pointercancel', cleanup, true);
      try {
        el.releasePointerCapture(pointerId);
      } catch { /* */ }
      document.body.style.removeProperty('user-select');
    };
    browserWindow?.addEventListener('pointermove', move, { capture: true, passive: true });
    browserWindow?.addEventListener('pointerup', cleanup, { capture: true });
    browserWindow?.addEventListener('pointercancel', cleanup, { capture: true });
    document.body.style.userSelect = 'none';
    ev.preventDefault();
  };

  const activeEdges = new Set(Array.isArray(edgesProp) ? edgesProp : EDGES);

  return (
    <Box
      aria-hidden
      sx={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        zIndex,
        pointerEvents: 'none',
        touchAction: 'none',
        '& > *': { pointerEvents: 'auto' },
      }}
    >
      {activeEdges.has('n') && (
        <Box
          onPointerDown={startHandle('n')}
          sx={(theme) => ({
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: theme.spacing(1),
            cursor: CURSOR.n,
          })}
        />
      )}
      {activeEdges.has('s') && (
        <Box
          onPointerDown={startHandle('s')}
          sx={(theme) => ({
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: theme.spacing(1),
            cursor: CURSOR.s,
          })}
        />
      )}
      {activeEdges.has('e') && (
        <Box
          onPointerDown={startHandle('e')}
          sx={(theme) => ({
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: theme.spacing(1),
            cursor: CURSOR.e,
          })}
        />
      )}
      {activeEdges.has('w') && (
        <Box
          onPointerDown={startHandle('w')}
          sx={(theme) => ({
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: theme.spacing(1),
            cursor: CURSOR.w,
          })}
        />
      )}
      {activeEdges.has('ne') && (
        <Box
          onPointerDown={startHandle('ne')}
          sx={{ position: 'absolute', right: 0, top: 0, width: CORNER, height: CORNER, cursor: CURSOR.ne }}
        />
      )}
      {activeEdges.has('nw') && (
        <Box
          onPointerDown={startHandle('nw')}
          sx={{ position: 'absolute', left: 0, top: 0, width: CORNER, height: CORNER, cursor: CURSOR.nw }}
        />
      )}
      {activeEdges.has('se') && (
        <Box
          onPointerDown={startHandle('se')}
          sx={{ position: 'absolute', right: 0, bottom: 0, width: CORNER, height: CORNER, cursor: CURSOR.se }}
        />
      )}
      {activeEdges.has('sw') && (
        <Box
          onPointerDown={startHandle('sw')}
          sx={{ position: 'absolute', left: 0, bottom: 0, width: CORNER, height: CORNER, cursor: CURSOR.sw }}
        />
      )}
    </Box>
  );
}

ResizableFrame.propTypes = {
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  onSize: PropTypes.func.isRequired,
  minWidth: PropTypes.number,
  minHeight: PropTypes.number,
  maxWidth: PropTypes.number,
  maxHeight: PropTypes.number,
  zIndex: PropTypes.number,
  edges: PropTypes.arrayOf(PropTypes.string),
};

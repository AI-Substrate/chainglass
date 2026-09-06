import type {
  CommandExecutor,
  PaneLayoutResult,
  ResizePaneRequest,
  TmuxWindowLayout,
} from '../types';

const REVISION_FORMAT = '#{window_layout}|#{status-position}|#{window_zoomed_flag}|#{status}';
const PANE_FORMAT = [
  '#{window_id}',
  '#{window_width}',
  '#{window_height}',
  REVISION_FORMAT,
  '#{status-position}',
  '#{window_zoomed_flag}',
  '#{status}',
  '#{pane_id}',
  '#{pane_left}',
  '#{pane_top}',
  '#{pane_width}',
  '#{pane_height}',
].join('\t');

function isResizeRequest(value: unknown): value is ResizePaneRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  return (
    typeof request.windowId === 'string' &&
    /^@\d{1,20}$/.test(request.windowId) &&
    typeof request.paneId === 'string' &&
    /^%\d{1,20}$/.test(request.paneId) &&
    (request.axis === 'x' || request.axis === 'y') &&
    typeof request.fraction === 'number' &&
    Number.isFinite(request.fraction) &&
    request.fraction >= 0 &&
    request.fraction <= 1 &&
    typeof request.revision === 'string' &&
    request.revision.length > 0 &&
    request.revision.length <= 65536
  );
}

interface LayoutCell {
  width: number;
  height: number;
  left: number;
  top: number;
  minWidth: number;
  minHeight: number;
  paneId?: string;
  axis?: 'x' | 'y';
  children: LayoutCell[];
  parent?: LayoutCell;
}

/** tmux's small recursive layout grammar, not terminal output or browser input. */
function parseLayout(layout: TmuxWindowLayout): { root: LayoutCell; leaves: LayoutCell[] } {
  const text = layout.revision.split('|', 1)[0];
  if (!/^[0-9a-f]{4},/.test(text)) throw new Error('Invalid tmux layout tree');
  let offset = 5;
  const leaves: LayoutCell[] = [];
  function parseCell(parent?: LayoutCell): LayoutCell {
    const match = /^(\d+)x(\d+),(\d+),(\d+)/.exec(text.slice(offset));
    if (!match) throw new Error('Invalid tmux layout cell');
    offset += match[0].length;
    const cell: LayoutCell = {
      width: Number(match[1]),
      height: Number(match[2]),
      left: Number(match[3]),
      top: Number(match[4]),
      minWidth: 1,
      minHeight: 1,
      children: [],
      parent,
    };
    if (
      ![cell.width, cell.height, cell.left, cell.top].every(Number.isSafeInteger) ||
      cell.width < 1 ||
      cell.height < 1 ||
      cell.left < 0 ||
      cell.top < 0
    ) {
      throw new Error('Invalid tmux layout dimensions');
    }
    const opening = text[offset];
    if (opening === '{' || opening === '[') {
      cell.axis = opening === '{' ? 'x' : 'y';
      const closing = opening === '{' ? '}' : ']';
      offset++;
      for (;;) {
        cell.children.push(parseCell(cell));
        if (text[offset] === closing) {
          offset++;
          break;
        }
        if (text[offset++] !== ',') throw new Error('Invalid tmux layout separator');
      }
      if (cell.children.length < 2) throw new Error('Invalid tmux layout split');
      cell.minWidth =
        cell.axis === 'x'
          ? cell.children.reduce((total, child) => total + child.minWidth + 1, -1)
          : Math.max(...cell.children.map((child) => child.minWidth));
      cell.minHeight =
        cell.axis === 'y'
          ? cell.children.reduce((total, child) => total + child.minHeight + 1, -1)
          : Math.max(...cell.children.map((child) => child.minHeight));
      let left = cell.left;
      let top = cell.top;
      for (const child of cell.children) {
        if (
          child.left !== left ||
          child.top !== top ||
          (cell.axis === 'x' ? child.height !== cell.height : child.width !== cell.width)
        ) {
          throw new Error('Inconsistent tmux layout tree');
        }
        if (cell.axis === 'x') left += child.width + 1;
        else top += child.height + 1;
      }
      if (
        cell.axis === 'x' ? left - 1 !== cell.left + cell.width : top - 1 !== cell.top + cell.height
      ) {
        throw new Error('Inconsistent tmux layout extent');
      }
    } else {
      const pane = /^,(\d+)/.exec(text.slice(offset));
      if (!pane) throw new Error('Missing tmux layout pane');
      offset += pane[0].length;
      cell.paneId = `%${pane[1]}`;
      const geometry = layout.panes[leaves.length];
      // select-layout assigns panes in list order, ignoring serialized pane IDs.
      // Refuse a mismatched order rather than silently relocate any pane.
      if (!geometry || geometry.id !== cell.paneId) throw new Error('Tmux pane order changed');
      cell.minWidth += cell.width - geometry.width;
      cell.minHeight += cell.height - geometry.height;
      if (cell.minWidth < 1 || cell.minHeight < 1) throw new Error('Inconsistent tmux pane size');
      leaves.push(cell);
    }
    return cell;
  }
  const root = parseCell();
  if (
    offset !== text.length ||
    leaves.length !== layout.panes.length ||
    root.left !== 0 ||
    root.top !== 0 ||
    root.width !== layout.width ||
    root.height !== layout.height
  ) {
    throw new Error('Inconsistent tmux window layout');
  }
  return { root, leaves };
}

/** Absorb size changes from the moved edge, leaving distant splits in place. */
function resizeCell(cell: LayoutCell, axis: 'x' | 'y', delta: number, edge: 'start' | 'end'): void {
  if (delta === 0) return;
  const size = axis === 'x' ? 'width' : 'height';
  const minimum = axis === 'x' ? 'minWidth' : 'minHeight';
  cell[size] += delta;
  if (!cell.children.length) return;
  if (cell.axis !== axis) {
    for (const child of cell.children) resizeCell(child, axis, delta, edge);
    return;
  }
  const direction = edge === 'start' ? 1 : -1;
  let index = edge === 'start' ? 0 : cell.children.length - 1;
  let remaining = delta;
  while (remaining !== 0 && index >= 0 && index < cell.children.length) {
    const child = cell.children[index];
    const change = remaining > 0 ? remaining : Math.max(remaining, child[minimum] - child[size]);
    if (change !== 0) resizeCell(child, axis, change, edge);
    remaining -= change;
    index += direction;
  }
  if (remaining !== 0) throw new Error('Tmux pane minimum size reached');
}

function serializeLayout(cell: LayoutCell, left: number, top: number): string {
  const dimensions = `${cell.width}x${cell.height},${left},${top}`;
  if (cell.paneId) return `${dimensions},${cell.paneId.slice(1)}`;
  let childLeft = left;
  let childTop = top;
  const children = cell.children.map((child) => {
    const text = serializeLayout(child, childLeft, childTop);
    if (cell.axis === 'x') childLeft += child.width + 1;
    else childTop += child.height + 1;
    return text;
  });
  return cell.axis === 'x'
    ? `${dimensions}{${children.join(',')}}`
    : `${dimensions}[${children.join(',')}]`;
}

function resizeBorderLayout(layout: TmuxWindowLayout, request: ResizePaneRequest): string {
  const { root, leaves } = parseLayout(layout);
  const leaf = leaves.find((cell) => cell.paneId === request.paneId);
  if (!leaf) throw new Error('Pane is not in the active tmux window');
  const size = request.axis === 'x' ? 'width' : 'height';
  const origin = request.axis === 'x' ? 'left' : 'top';
  const minimum = request.axis === 'x' ? 'minWidth' : 'minHeight';
  const border = leaf[origin] + leaf[size];
  let before = leaf;
  let after: LayoutCell | undefined;
  while (before.parent) {
    const parent = before.parent;
    const index = parent.children.indexOf(before);
    if (
      parent.axis === request.axis &&
      index < parent.children.length - 1 &&
      before[origin] + before[size] === border
    ) {
      after = parent.children[index + 1];
      break;
    }
    before = parent;
  }
  if (!after) throw new Error('Pane has no resizable border on this axis');
  const requested = Math.round(request.fraction * layout[size]) - border;
  const delta = Math.max(
    before[minimum] - before[size],
    Math.min(requested, after[size] - after[minimum])
  );
  resizeCell(before, request.axis, delta, 'end');
  resizeCell(after, request.axis, -delta, 'start');
  const body = serializeLayout(root, 0, 0);
  let checksum = 0;
  for (let index = 0; index < body.length; index++) {
    checksum = (((checksum >>> 1) | ((checksum & 1) << 15)) + body.charCodeAt(index)) & 0xffff;
  }
  return `${checksum.toString(16).padStart(4, '0')},${body}`;
}

/** One command provides a consistent snapshot, with no session-prefix matching. */
export function readPaneLayout(exec: CommandExecutor, sessionName: string): TmuxWindowLayout {
  const lines = exec('tmux', ['list-panes', '-t', `=${sessionName}:`, '-F', PANE_FORMAT])
    .trim()
    .split('\n');
  const [windowId, widthText, heightText, revision, statusPosition, zoomed, status] =
    lines[0].split('\t');
  const statusRows = status === 'on' ? 1 : status === 'off' ? 0 : Number(status);
  const width = Number(widthText);
  const height = Number(heightText);
  if (
    !/^@\d+$/.test(windowId) ||
    !Number.isSafeInteger(width) ||
    width < 1 ||
    !Number.isSafeInteger(height) ||
    height < 1 ||
    !revision ||
    !status ||
    !Number.isSafeInteger(statusRows) ||
    statusRows < 0 ||
    statusRows > 5 ||
    (statusPosition !== 'top' && statusPosition !== 'bottom') ||
    (zoomed !== '0' && zoomed !== '1')
  ) {
    throw new Error('Invalid tmux window geometry');
  }

  const header = lines[0].split('\t').slice(0, 7).join('\t');
  const ids = new Set<string>();
  const panes = lines.map((line) => {
    const fields = line.split('\t');
    const [id, left, top, paneWidth, paneHeight] = fields.slice(7);
    const geometry = {
      id,
      left: Number(left),
      top: Number(top),
      width: Number(paneWidth),
      height: Number(paneHeight),
    };
    if (
      fields.length !== 12 ||
      fields.slice(0, 7).join('\t') !== header ||
      !/^%\d+$/.test(id) ||
      ids.has(id) ||
      ![geometry.left, geometry.top, geometry.width, geometry.height].every(Number.isSafeInteger) ||
      geometry.left < 0 ||
      geometry.top < 0 ||
      geometry.width < 1 ||
      geometry.height < 1 ||
      geometry.left + geometry.width > width ||
      geometry.top + geometry.height > height
    ) {
      throw new Error('Invalid tmux pane geometry');
    }
    ids.add(id);
    return geometry;
  });

  return {
    windowId,
    width,
    height,
    panes,
    revision,
    statusPosition,
    statusRows,
    zoomed: zoomed === '1',
  };
}

/** Only the connection session's active, unchanged, unzoomed window may resize. */
export function resizeTmuxPane(
  exec: CommandExecutor,
  sessionName: string,
  request: unknown
): PaneLayoutResult {
  if (!isResizeRequest(request)) return { layout: null, error: 'Invalid pane resize request' };

  let layout: TmuxWindowLayout;
  try {
    layout = readPaneLayout(exec, sessionName);
  } catch (error) {
    return {
      layout: null,
      error: error instanceof Error ? error.message : 'Unable to read pane layout',
    };
  }
  if (request.windowId !== layout.windowId) {
    return { layout, error: 'The active tmux window changed' };
  }
  if (request.revision !== layout.revision) {
    return { layout, error: 'The tmux pane layout changed' };
  }
  if (layout.zoomed) return { layout, error: 'Unzoom the tmux window before resizing panes' };
  const pane = layout.panes.find((candidate) => candidate.id === request.paneId);
  if (!pane) return { layout, error: 'Pane is not in the active tmux window' };

  let resizedLayout: string;
  try {
    resizedLayout = resizeBorderLayout(layout, request);
  } catch (cause) {
    return {
      layout,
      error: cause instanceof Error ? cause.message : 'Unable to resize tmux border',
    };
  }
  // Use the freshly read revision, never interpolate browser strings into tmux.
  const escapedRevision = layout.revision.replace(/[#},]/g, (character) => `#${character}`);
  const guard = `#{&&:#{==:#{window_id},${layout.windowId}},#{==:${REVISION_FORMAT},${escapedRevision}}}`;
  let error: string | undefined;
  try {
    // -F evaluates synchronously: the guard and inserted layout command run in
    // the same tmux queue turn, without a shell job or a window-switch race.
    // Root dimensions and pane order stay unchanged; only this border moves.
    const outcome = exec('tmux', [
      'if-shell',
      '-F',
      '-t',
      `=${sessionName}:`,
      guard,
      `select-layout -t '=${sessionName}:${layout.windowId}' '${resizedLayout}' ; display-message -p pane-resized`,
      'display-message -p pane-layout-changed',
    ]).trim();
    if (outcome !== 'pane-resized') error = 'The active tmux window or pane layout changed';
  } catch (cause) {
    error = cause instanceof Error ? cause.message : 'Unable to resize tmux pane';
  }

  try {
    return { layout: readPaneLayout(exec, sessionName), ...(error ? { error } : {}) };
  } catch (cause) {
    return {
      layout: null,
      error: error ?? (cause instanceof Error ? cause.message : 'Unable to read pane layout'),
    };
  }
}

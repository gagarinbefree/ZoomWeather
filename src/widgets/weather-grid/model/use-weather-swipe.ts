import { reportFailure } from '@/shared/diagnostics';
import { onBeforeUnmount, onMounted, shallowRef, watch, type ShallowRef } from 'vue';
import type { Direction, Position } from 'tikitaki';
import {
  createSwipeEngine,
  type SwipeEngine,
  type EdgeActionState,
  type EdgeActionContext,
} from 'tikitaki/dom';
import { createVueCellAdapter, type VueCellBridge } from '@tikitaki_gagarinbefree/vue';
import type { WeatherCell, WeatherGrid } from '@/entities/weather';
import { messages } from '@/shared/locales';

interface WeatherSwipeView {
  readonly cells: VueCellBridge<WeatherCell>['cells'];
  readonly activeId: Readonly<ShallowRef<string | null>>;
  readonly gridRows: Readonly<ShallowRef<number>>;
  readonly position: Readonly<ShallowRef<Position>>;
  readonly failed: Readonly<ShallowRef<boolean>>;
  readonly refreshState: Readonly<ShallowRef<EdgeActionState | null>>;
  readonly onKeydown: (event: KeyboardEvent) => void;
}

/** Visible pull threshold and loading area height in CSS pixels. */
export const weatherRefreshOptions = Object.freeze({ threshold: 40, holdOffset: 80 });

const keyboardDirections: Readonly<Record<string, Direction>> = {
  ArrowRight: 'left',
  ArrowLeft: 'right',
  ArrowDown: 'up',
  ArrowUp: 'down',
};

/**
 * findCellPosition. Find the current position of a forecast cell
 *
 * @param grid The next available forecast grid.
 * @param id The identity of the selected forecast cell.
 * @param rowStartColumn The logical start of each forecast row.
 * @returns The new coordinates of the same forecast cell when it is still available.
 */
function findCellPosition(
  grid: WeatherGrid,
  id: string | null,
  rowStartColumn: (row: number) => number,
): Position | undefined {
  for (const [row, cells] of grid.entries()) {
    const col = cells.findIndex((cell) => cell.id === id);
    if (col !== -1) return { row, col: col + rowStartColumn(row) };
  }
  return undefined;
}

/**
 * useWeatherSwipe. Connect the weather grid to swipe and keyboard navigation
 *
 * @param container The Vue reference to the engine viewport.
 * @param readGrid The current immutable forecast snapshot.
 * @param onPositionChange The callback for a committed selection.
 * @param onError The callback for a controller failure.
 * @param refresh The optional cancellable current weather refresh.
 * @param canRefresh Whether the page can start a new weather request.
 * @param primaryColumn The shared daily anchor column for vertical navigation.
 * @param rowStartColumn The logical column where each forecast row begins.
 * @param readPrimaryRow The main row after successful historical data arrives.
 * @returns Reactive cell hosts and navigation state owned by the current Vue component.
 */
export function useWeatherSwipe(
  container: Readonly<ShallowRef<HTMLElement | null>>,
  readGrid: () => WeatherGrid,
  onPositionChange: (position: Position) => void,
  onError: (error: Error) => void,
  refresh?: (signal: AbortSignal) => Promise<void>,
  canRefresh: () => boolean = () => true,
  primaryColumn = 0,
  rowStartColumn: (row: number) => number = () => 0,
  readPrimaryRow: () => number = () => 0,
): WeatherSwipeView {
  const bridge = createVueCellAdapter<WeatherCell>();
  const controller = shallowRef<SwipeEngine<WeatherCell> | null>(null);
  const position = shallowRef<Position>({ row: 0, col: 0 });
  const failed = shallowRef(false);
  const refreshState = shallowRef<EdgeActionState | null>(null);
  const activeId = shallowRef<string | null>(null);
  let mountedGrid = readGrid();
  let mountedStarts = mountedGrid.map((_, row) => rowStartColumn(row));
  const gridRows = shallowRef(mountedGrid.length);
  let configuredPrimaryRow = readPrimaryRow();
  let pendingGrid = false;
  let revision = 0;
  let updating = false;
  let disposed = false;

  /**
   * stop. Stop the swipe controller and discard pending updates
   */
  function stop(): void {
    revision++;
    controller.value?.destroy();
    controller.value = null;
  }

  /**
   * reportError. Stop navigation and report a controller error
   *
   * @param error The failure reported by the controller or a navigation promise.
   */
  function reportError(error: unknown): void {
    if (disposed || failed.value) return;
    stop();
    failed.value = true;
    reportFailure(error, 'navigation');
    onError(error instanceof Error ? error : new Error(messages.en.navigationFailed));
  }

  /**
   * refreshWeather. Refresh silently while retaining a usable current card.
   *
   * @param signal The cancellation signal owned by the boundary action.
   * @returns A promise that settles when the current weather request finishes.
   */
  async function refreshWeather(signal: AbortSignal): Promise<void> {
    try {
      await refresh?.(signal);
    } catch (error) {
      if (!signal.aborted) reportFailure(error, 'current', true);
    }
  }

  /**
   * publishPosition. Save the selected cell and notify the page
   *
   * @param next The coordinates committed by TikiTaki.
   */
  function publishPosition(next: Position): void {
    if (disposed || updating) return;
    position.value = next;
    activeId.value = mountedGrid[next.row]?.[next.col - (mountedStarts[next.row] ?? 0)]?.id ?? null;
    onPositionChange(next);
  }

  /**
   * updateGrid. Update forecast cells while keeping the selected cell
   *
   * @param grid The next forecast snapshot.
   * @returns A promise that resolves after the selected cell is reconciled.
   */
  async function updateGrid(grid: WeatherGrid): Promise<void> {
    const engine = controller.value;
    if (!engine) return;
    if (refreshState.value !== null && refreshState.value.phase !== 'idle') {
      pendingGrid = true;
      return;
    }
    let token = ++revision;
    const primaryRow = readPrimaryRow();
    const target = findCellPosition(grid, activeId.value, rowStartColumn) ?? {
      row: primaryRow,
      col: primaryColumn,
    };
    updating = true;
    try {
      if (primaryRow !== configuredPrimaryRow) {
        stop();
        token = revision;
        start(grid, target);
      } else {
        mountedGrid = grid;
        mountedStarts = grid.map((_, row) => rowStartColumn(row));
        gridRows.value = grid.length;
        engine.updateGrid(grid);
        await engine.goTo(target);
      }
      if (disposed || token !== revision) return;
      updating = false;
      if (controller.value) publishPosition(controller.value.getPosition());
    } catch (error) {
      if (!disposed && token === revision) reportError(error);
    } finally {
      if (token === revision) updating = false;
    }
  }

  /**
   * onKeydown. Move between forecast cells with the arrow keys
   *
   * @param event The keyboard event originating from the viewport itself.
   */
  function onKeydown(event: KeyboardEvent): void {
    if (
      event.target !== event.currentTarget ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return;
    const direction = keyboardDirections[event.key];
    if (!direction || !controller.value) return;
    event.preventDefault();
    void controller.value.navigate(direction).catch(reportError);
  }

  /**
   * start. Create a controller for the currently available main row.
   * @param grid The accepted navigation snapshot.
   * @param initialPosition The selected cell after any historical row changes.
   */
  function start(grid: WeatherGrid, initialPosition?: Position): void {
    if (!container.value) return;
    mountedGrid = grid;
    mountedStarts = grid.map((_, row) => rowStartColumn(row));
    gridRows.value = grid.length;
    configuredPrimaryRow = readPrimaryRow();
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      controller.value = createSwipeEngine({
        container: container.value,
        grid,
        ...(initialPosition ? { initialPosition } : {}),
        navigation: {
          primaryRow: configuredPrimaryRow,
          primaryColumn,
          rowStartColumn: (row) => mountedStarts[row] ?? 0,
        },
        adapter: bridge.adapter,
        onPositionChange: publishPosition,
        onError: reportError,
        ...(refresh
          ? {
              edgeAction: {
                direction: 'down' as const,
                returnToPrimary: true,
                ...weatherRefreshOptions,
                enabled: (selected: Position): boolean =>
                  selected.row === 0 &&
                  selected.col === primaryColumn &&
                  ['current', 'history'].includes(
                    readGrid()[0]?.[primaryColumn - rowStartColumn(0)]?.kind ?? '',
                  ) &&
                  canRefresh(),
                onTrigger: ({ signal }: EdgeActionContext): Promise<void> => refreshWeather(signal),
                onStateChange: (state: EdgeActionState): void => {
                  refreshState.value = state;
                  if (state.phase === 'idle' && pendingGrid) {
                    pendingGrid = false;
                    queueMicrotask(() => {
                      if (!disposed) void updateGrid(readGrid());
                    });
                  }
                },
              },
            }
          : {}),
        ...(reduceMotion ? { gesture: { animationDuration: 0 } } : {}),
      });
      publishPosition(controller.value.getPosition());
    } catch (error) {
      reportError(error);
    }
  }
  onMounted(() => {
    start(readGrid());
  });
  watch(
    () => ({ grid: readGrid(), primaryRow: readPrimaryRow() }),
    ({ grid }) => updateGrid(grid),
    { flush: 'post' },
  );

  onBeforeUnmount(() => {
    disposed = true;
    stop();
  });
  return { cells: bridge.cells, activeId, gridRows, position, failed, refreshState, onKeydown };
}

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
  readonly position: Readonly<ShallowRef<Position>>;
  readonly failed: Readonly<ShallowRef<boolean>>;
  readonly refreshState: Readonly<ShallowRef<EdgeActionState | null>>;
  readonly onKeydown: (event: KeyboardEvent) => void;
  readonly navigate: (direction: Direction) => void;
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
): WeatherSwipeView {
  const bridge = createVueCellAdapter<WeatherCell>();
  const controller = shallowRef<SwipeEngine<WeatherCell> | null>(null);
  const position = shallowRef<Position>({ row: 0, col: 0 });
  const failed = shallowRef(false);
  const refreshState = shallowRef<EdgeActionState | null>(null);
  let selectedId: string | null = null;
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
    selectedId = readGrid()[next.row]?.[next.col - rowStartColumn(next.row)]?.id ?? null;
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
    const token = ++revision;
    const target = findCellPosition(grid, selectedId, rowStartColumn);
    updating = true;
    try {
      engine.updateGrid(grid);
      if (target) await engine.goTo(target);
      if (disposed || token !== revision) return;
      updating = false;
      publishPosition(engine.getPosition());
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
   * navigate. Move one cell from an accessible map navigation control.
   * @param direction The requested content movement.
   */
  function navigate(direction: Direction): void {
    void controller.value?.navigate(direction).catch(reportError);
  }

  onMounted(() => {
    if (!container.value) return;
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      controller.value = createSwipeEngine({
        container: container.value,
        grid: readGrid(),
        initialPosition: { row: 0, col: primaryColumn },
        navigation: { primaryColumn, rowStartColumn },
        adapter: bridge.adapter,
        onPositionChange: publishPosition,
        onError: reportError,
        ...(refresh
          ? {
              edgeAction: {
                direction: 'down' as const,
                ...weatherRefreshOptions,
                enabled: (selected: Position): boolean =>
                  selected.row === 0 &&
                  selected.col === primaryColumn &&
                  readGrid()[0]?.[primaryColumn]?.kind === 'current' &&
                  canRefresh(),
                onTrigger: ({ signal }: EdgeActionContext): Promise<void> => refreshWeather(signal),
                onStateChange: (state: EdgeActionState): void => {
                  refreshState.value = state;
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
  });

  watch(readGrid, updateGrid, { flush: 'post' });
  onBeforeUnmount(() => {
    disposed = true;
    stop();
  });
  return { cells: bridge.cells, position, failed, refreshState, onKeydown, navigate };
}

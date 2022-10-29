import { StateEffect, StateField } from "@codemirror/state";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { TabModelState } from "../extension/model-state";
import { TabParseContext } from "./parse-context";
declare type Callback = (deadline?: IdleDeadline) => void;
declare type CancelCallbackRequest = () => void;
/**
 *lazily schedules parsing work based on the current viewport.
 * Default scheduler can be overridden by overriding the `TabParseWorker.requestIdle` method
 */
export declare abstract class TabParseWorker {
    readonly view: EditorView;
    working: (() => void) | null;
    workScheduled: number;
    chunkEnd: number;
    chunkBudget: number;
    constructor(view: EditorView);
    abstract get modelState(): StateField<TabModelState>;
    abstract createStateEffect(state: TabModelState): StateEffect<TabModelState>;
    /**
     * A method that schedules some provided work
     * @param callback the work to be performed
     * @returns a callback that cancels the scheduled work if it hasn't already been performed.
     */
    requestIdle(callback: Callback): CancelCallbackRequest;
    update(update: ViewUpdate): void;
    scheduleWork(): void;
    work(deadline?: IdleDeadline): void;
    checkAsyncSchedule(cx: TabParseContext): void;
    destroy(): void;
    isWorking(): boolean | (() => void);
}
export {};

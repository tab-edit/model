import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { EditorView, logException, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { TabModelState } from "../extension/model-state";
import { TabParseContext } from "./parse-context";

type Callback = (deadline?: IdleDeadline) => void;
type CancelCallbackRequest = () => void;

//requestIdleCallback is expimental. if it is available on this device, use it to 
//schedule work when the user is idle to increase percieved responsiveness. 
//otherwise, schedule work normally
let requestIdle: (callback: Callback) => CancelCallbackRequest
if (typeof requestIdleCallback != "undefined") {
    requestIdle = (callback: (deadline?:IdleDeadline) => void) => {
        let idle = -1;
        let timeout = setTimeout(() => {
            idle = requestIdleCallback(callback, {timeout: Work.MaxPause - Work.MinPause});
        }, Work.MinPause)
        return () => idle < 0 ? clearTimeout(timeout) : cancelIdleCallback(idle);
    }
} else {
    requestIdle = (callback: (deadline?: IdleDeadline) => void) => {
        let timeout = setTimeout(() => callback(), Work.MaxPause);
        return () => clearTimeout(timeout);
    }
}

/**
 *lazily schedules parsing work based on the current viewport. 
 * Default scheduler can be overridden by overriding the `TabParseWorker.requestIdle` method
 */
export abstract class TabParseWorker {
    //cancels current scheduled work via clearTimeout() or similar
    working: (() => void) | null = null;
    workScheduled = 0;
    // End of the current time chunk
    chunkEnd = -1
    // Milliseconds of budget left for this chunk
    chunkBudget = -1

    constructor(readonly view: EditorView) {
        this.work = this.work.bind(this);
        this.scheduleWork();
    }

    abstract get modelState(): StateField<TabModelState>;
    abstract createStateEffect(state: TabModelState): StateEffect<TabModelState>;

    /**
     * A method that schedules some provided work
     * @param callback the work to be performed
     * @returns a callback that cancels the scheduled work if it hasn't already been performed.
     */
    requestIdle(callback: Callback) { return requestIdle(callback) }

    update(update: ViewUpdate) {
        let cx = this.view.state.field(this.modelState).context;
        if (cx.updateViewport(update.view.viewport) || this.view.viewport.to > cx.treeLen) {
            this.scheduleWork();
        }
        if (update.docChanged) {
            if (this.view.hasFocus) this.chunkBudget || Work.ChangeBonus;
        }
        this.checkAsyncSchedule(cx)
    }

    scheduleWork() {
        if (this.working) return;
        let {state} = this.view, field = state.field(this.modelState);
        if (field.tree!=field.context.tree || !field.context.isDone(state.doc.length)) {
            this.working = requestIdle(this.work);
        }
    }

    work(deadline?: IdleDeadline) {
        this.working = null;

        let now = Date.now();
        if (this.chunkEnd < now && (this.chunkEnd < 0 || this.view.hasFocus)) {
            this.chunkEnd = now + Work.ChunkTime;
            this.chunkBudget = Work.ChunkBudget;
        }
        if (this.chunkBudget <= 0) return; // no more budget

        let {state, viewport: {to: vpTo}} = this.view;
        let field = state.field(this.modelState);
        let time = Math.min(this.chunkBudget, Work.Slice, deadline ? Math.max(Work.MinSlice, deadline.timeRemaining() - 5) : 1e9);
        let viewportFirst = field.context.treeLen < vpTo && state.doc.length > vpTo + 1000; // TODO: I don't fully understand this line
        let done = field.context.work(time, vpTo + (viewportFirst ? 0 : Work.MaxParseAhead)); // TODO: I also don't fully understand this.
        this.chunkBudget -= Date.now() - now;
        if (done || this.chunkBudget <= 0) {
            field.context.takeTree();
            this.view.dispatch({effects: this.createStateEffect(field)})
        }
        if (this.chunkBudget > 0 && !(done && !viewportFirst)) this.scheduleWork();
        this.checkAsyncSchedule(field.context);
    }

    checkAsyncSchedule(cx: TabParseContext) {
        if (cx.scheduleOn) {
            this.workScheduled++;
            cx.scheduleOn
                .then(() => this.scheduleWork())
                .catch(err => logException(this.view.state, err))
                .then(() => this.workScheduled--);
            cx.scheduleOn = null;
        }
    }

    destroy() {
        if (this.working) this.working();
    }

    isWorking() {
        return this.working || this.workScheduled > 0;
    }
}
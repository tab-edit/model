import { Transaction } from "@codemirror/state";
import { TabTree } from "../structures/tree";
import { TabParseContext } from "../parse-work/parse-context";

export abstract class TabModelState {
    // The current tree. Immutable, because directly accessible from
    // the editor state.
    readonly tree: TabTree;

    constructor(
        // A mutable parse state that is used to preserve work done during
        // the lifetime of a state when moving to the next state.
        readonly context: TabParseContext
    ) {
        this.tree = context.tree;
    }

    abstract apply(tr: Transaction): TabModelState;
}

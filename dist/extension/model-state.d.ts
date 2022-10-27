import { Transaction } from "@codemirror/state";
import { TabTree } from "../structures/tree";
import { TabParseContext } from "../parse-work/parse-context";
export declare abstract class TabModelState {
    readonly context: TabParseContext;
    readonly tree: TabTree;
    constructor(context: TabParseContext);
    abstract apply(tr: Transaction): TabModelState;
}

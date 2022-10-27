import { EditorState } from "@codemirror/state";
import { Fragment } from "../structures/fragment";
import { TabTree } from "../structures/tree";
import { PartialTabParse } from "./partial_parse";
export declare abstract class TabParser<F extends Fragment = Fragment> {
    abstract createParse(editorState: EditorState, fragments: readonly Fragment[], ranges: readonly {
        from: number;
        to: number;
    }[]): PartialTabParse<F>;
    startParse(editorState: EditorState, fragments?: readonly F[], ranges?: readonly {
        from: number;
        to: number;
    }[]): PartialTabParse<F>;
    parse(editorState: EditorState, fragments?: readonly F[], ranges?: readonly {
        from: number;
        to: number;
    }[]): TabTree<F>;
}

import { EditorState } from "@codemirror/state";
import { Fragment } from "../structures/fragment";
import { TabTree } from "../structures/tree";
import { PartialTabParse } from "./partial_parse";

export abstract class TabParser<F extends Fragment = Fragment> {
    /// Start a parse for a single tree. Called by `startParse`,
    /// with the optional arguments resolved.
    abstract createParse(editorState: EditorState, fragments: readonly Fragment[], ranges: readonly {
        from: number;
        to: number;
    }[]): PartialTabParse<F>;

    /// Start a parse, returning a tab partial parse
    /// object. fragments can be passed in to
    /// make the parse incremental.
    ///
    /// By default, the entire input is parsed. You can pass `ranges`,
    /// which should be a sorted array of non-empty, non-overlapping
    /// ranges, to parse only those ranges. The tree returned in that
    /// case will start at `ranges[0].from`.
    startParse(
        editorState: EditorState,
        fragments?: readonly F[],
        ranges?: readonly {from: number, to: number}[]
    ): PartialTabParse<F> {
        ranges = !ranges ? [{from: 0, to: editorState.doc.length}] : ranges.length ? ranges : [{from: 0, to: 0}];
        return this.createParse(editorState, fragments || [], ranges);
    }

    /// Run a full parse, returning the resulting tree.
    parse(editorState: EditorState, fragments?: readonly F[], ranges?: readonly {
        from: number;
        to: number;
    }[]): TabTree<F> {
        let parse = this.startParse(editorState, fragments, ranges);
        for(;;) {
            let done = parse.advance(100);
            if (done.tree) return done.tree;
        }
    }
}

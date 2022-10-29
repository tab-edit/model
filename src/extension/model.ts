import { EditorState, Extension, Facet, StateField } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import { TabParseWorker } from "../parse-scheduling/parse-worker";
import { TabModelState } from "./model-state";
import { TabTree } from "../structures/tree";
import { TabParser } from "../parsing/parser";


export abstract class TabModel {
    /// The extension value to install this provider.
    readonly extension: Extension;

    constructor(
        /// The tablature data data facet used for this model (TODO: I don't understand this)
        readonly data: Facet<{[name: string]: any}>,
        public parser: TabParser,
        private modelPackage: TabModelPackage,
        extraExtensions: Extension[] = []
    ) {
        this.extension = [
            modelPackage.facet.of(this),
            EditorState.languageData.of((state, pos, side) => state.facet(this.modelPackage.dataFacetAt(state, pos, side)!))
        ].concat(extraExtensions)
    }

    /// Query whether this model is active at the given position
    isActiveAt(state: EditorState, pos: number, side: -1 | 0 | 1 = -1) {
        return this.modelPackage.dataFacetAt(state, pos, side) === this.data;
    }
}

export class TabModelPackage {
    constructor(
        readonly facet: Facet<TabModel, TabModel|null>,
        readonly viewPlugin: ViewPlugin<TabParseWorker>,
        private readonly getModelState: () => StateField<TabModelState>
    ) {}

    get state() { return this.getModelState(); }

    /// Get the syntax tree for a state, which is the current (possibly
    /// incomplete) parse tree of active model, or the empty tree 
    /// if there is no model available.
    tree(state: EditorState) {
        let field = state.field(this.getModelState())
        return field ? field.tree as TabTree : null;
    }

    /// Try to get a parse tree that spans at least up to `upto`. The
    /// method will do at most `timeout` milliseconds of work to parse
    /// up to that point if the tree isn't already available.
    ensureTree(state: EditorState, upto: number, timeout = 50): TabTree | null {
        let parse = state.field(this.getModelState(), false)?.context;
        return !parse ? null : parse.isDone(upto) || parse.work(timeout, upto) ? parse.tree : null
    }

    /// Queries whether there is a full syntax tree available up to the 
    /// given document position. If there isn't, the background parse
    /// process _might_ still be working and update the tree further, but 
    /// there is no guarantee of that-the parser will stop working when it 
    /// has spent a certain amount of time or has moved beyond the visible
    /// viewport. Always returns false if no model has been enabled.
    treeAvailable(state: EditorState, upto = state.doc.length) {
        return state.field(this.state, false)?.context.isDone(upto) || false;
    }

    /// Tells you whether the model parser is planning to do more
    /// parsing work (in a `requestIdleCallback` pseudo-thread) or has
    /// stopped running, either because it parsed the entire document,
    /// because it spent too much time and was cut off, or because there
    /// is no model parser enabled.
    parserRunning(view: EditorView) {
        return view.plugin(this.viewPlugin)?.isWorking() || false;
    }

    dataFacetAt(state: EditorState, pos: number, side: -1 | 0 | 1) {
        let topModel = state.facet(this.facet);
        if (!topModel) return null;
        let facet = topModel.data;
        return facet;
    }

    static defineDataFacet(baseData?: {[name: string]: any}) {
        return Facet.define<{[name:string]: any}>({
            combine: baseData ? values => values.concat(baseData!) : undefined
        })
    }
}
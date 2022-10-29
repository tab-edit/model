import { logException } from '@codemirror/view';
import { EditorState, Facet } from '@codemirror/state';

//requestIdleCallback is expimental. if it is available on this device, use it to 
//schedule work when the user is idle to increase percieved responsiveness. 
//otherwise, schedule work normally
let requestIdle;
if (typeof requestIdleCallback != "undefined") {
    requestIdle = (callback) => {
        let idle = -1;
        let timeout = setTimeout(() => {
            idle = requestIdleCallback(callback, { timeout: 500 /* Work.MaxPause */ - 100 /* Work.MinPause */ });
        }, 100 /* Work.MinPause */);
        return () => idle < 0 ? clearTimeout(timeout) : cancelIdleCallback(idle);
    };
}
else {
    requestIdle = (callback) => {
        let timeout = setTimeout(() => callback(), 500 /* Work.MaxPause */);
        return () => clearTimeout(timeout);
    };
}
/**
 *lazily schedules parsing work based on the current viewport.
 * Default scheduler can be overridden by overriding the `TabParseWorker.requestIdle` method
 */
class TabParseWorker {
    view;
    //cancels current scheduled work via clearTimeout() or similar
    working = null;
    workScheduled = 0;
    // End of the current time chunk
    chunkEnd = -1;
    // Milliseconds of budget left for this chunk
    chunkBudget = -1;
    constructor(view) {
        this.view = view;
        this.work = this.work.bind(this);
        this.scheduleWork();
    }
    /**
     * A method that schedules some provided work
     * @param callback the work to be performed
     * @returns a callback that cancels the scheduled work if it hasn't already been performed.
     */
    requestIdle(callback) { return requestIdle(callback); }
    update(update) {
        let cx = this.view.state.field(this.modelState).context;
        if (cx.updateViewport(update.view.viewport) || this.view.viewport.to > cx.treeLen) {
            this.scheduleWork();
        }
        if (update.docChanged) {
            if (this.view.hasFocus)
                this.chunkBudget || 50 /* Work.ChangeBonus */;
        }
        this.checkAsyncSchedule(cx);
    }
    scheduleWork() {
        if (this.working)
            return;
        let { state } = this.view, field = state.field(this.modelState);
        if (field.tree != field.context.tree || !field.context.isDone(state.doc.length)) {
            this.working = requestIdle(this.work);
        }
    }
    work(deadline) {
        this.working = null;
        let now = Date.now();
        if (this.chunkEnd < now && (this.chunkEnd < 0 || this.view.hasFocus)) {
            this.chunkEnd = now + 30000 /* Work.ChunkTime */;
            this.chunkBudget = 3000 /* Work.ChunkBudget */;
        }
        if (this.chunkBudget <= 0)
            return; // no more budget
        let { state, viewport: { to: vpTo } } = this.view;
        let field = state.field(this.modelState);
        let time = Math.min(this.chunkBudget, 100 /* Work.Slice */, deadline ? Math.max(25 /* Work.MinSlice */, deadline.timeRemaining() - 5) : 1e9);
        let viewportFirst = field.context.treeLen < vpTo && state.doc.length > vpTo + 1000; // TODO: I don't fully understand this line
        let done = field.context.work(time, vpTo + (viewportFirst ? 0 : 100000 /* Work.MaxParseAhead */)); // TODO: I also don't fully understand this.
        this.chunkBudget -= Date.now() - now;
        if (done || this.chunkBudget <= 0) {
            field.context.takeTree();
            this.view.dispatch({ effects: this.createStateEffect(field) });
        }
        if (this.chunkBudget > 0 && !(done && !viewportFirst))
            this.scheduleWork();
        this.checkAsyncSchedule(field.context);
    }
    checkAsyncSchedule(cx) {
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
        if (this.working)
            this.working();
    }
    isWorking() {
        return this.working || this.workScheduled > 0;
    }
}

class TabTree {
    fragments;
    from;
    to;
    constructor(fragments) {
        this.fragments = fragments;
        this.from = fragments[0] ? fragments[0].from : 0;
        this.to = fragments[fragments.length - 1] ? fragments[fragments.length - 1].to : 0;
    }
    // figure out a way to get rid of *createBlankTree* and *empty*
    static createBlankTree(from, to) {
        return new class BlankModel extends TabTree {
        }([{ from, to }]);
    }
    static empty = new class BlankModel extends TabTree {
    }([]);
}

class Fragment {
    from;
    to;
    constructor(from, to) {
        this.from = from;
        this.to = to;
    }
    /**
     * Applies a set of edits to an array of fragments, reusing unaffected fragments,
     * removing fragments overlapping with edits, or creating new fragments with
     * adjusted positions to replace fragments which have moved as a result of edits.
     * @param fragments a set of Fragment objects
     * @param changes a set of ChangedRanges representing edits
     * @returns a new set of fragments
     */
    static applyChanges(fragments, changes) {
        if (!changes.length)
            return fragments;
        let result = [];
        let fI = 1, nextF = fragments.length ? fragments[0] : null;
        for (let cI = 0, off = 0; nextF; cI++) {
            let nextC = cI < changes.length ? changes[cI] : null;
            // TODO: be careful here with the <=. test to make sure that it should be <= and not just <.
            while (nextF && (!nextC || nextF.from <= nextC.toA)) {
                if (!nextC || nextF.to <= nextC.fromA)
                    result.push(nextF.createOffsetCopy(-off));
                nextF = fI < fragments.length ? fragments[fI++] : null;
            }
            off = nextC ? nextC.toA - nextC.toB : 0;
        }
        return result;
    }
    /**
     * Create a set of fragments from a freshly parsed tree, or update
     * an existing set of fragments by replacing the ones that overlap
     * with a tree with content from the tree.
     * @param tree a freshly parsed tree
     * @param fragments a set of fragments
     * @returns fragment set produced by merging the tree's fragment set with the provided fragment set
     */
    static addTree(tree, fragments = []) {
        let result = [...tree.fragments];
        for (let f of fragments)
            if (f.to > tree.to)
                result.push(f);
        return result;
    }
}

class TabParser {
    /// Start a parse, returning a tab partial parse
    /// object. fragments can be passed in to
    /// make the parse incremental.
    ///
    /// By default, the entire input is parsed. You can pass `ranges`,
    /// which should be a sorted array of non-empty, non-overlapping
    /// ranges, to parse only those ranges. The tree returned in that
    /// case will start at `ranges[0].from`.
    startParse(editorState, fragments, ranges) {
        ranges = !ranges ? [{ from: 0, to: editorState.doc.length }] : ranges.length ? ranges : [{ from: 0, to: 0 }];
        return this.createParse(editorState, fragments || [], ranges);
    }
    /// Run a full parse, returning the resulting tree.
    parse(editorState, fragments, ranges) {
        let parse = this.startParse(editorState, fragments, ranges);
        for (;;) {
            let done = parse.advance(100);
            if (done.tree)
                return done.tree;
        }
    }
}

class TabParseContext {
    parser;
    state;
    fragments;
    tree;
    treeLen;
    viewport;
    skipped;
    scheduleOn;
    parse = null;
    /// @internal
    tempSkipped = [];
    /// @internal
    constructor(parser, 
    /// The current editor state.
    state, 
    /// Tree fragments that can be reused by incremental re-parses
    fragments = [], 
    /// @internal
    tree, treeLen, 
    /// The current editor viewport (or some overapproximation
    /// thereof). Intended to be used for opportunistically avoiding
    /// work (in which case
    /// [`skipUntilInView`](#model.ParseContext.skipUntilInView)
    /// should be called to make sure the parser is restarted when the
    /// skipped region becomes visible).
    viewport, 
    /// @internal
    skipped, 
    /// This is where skipping parsers can register a promise that,
    /// when resolved, will schedule a new parse. It is cleared when
    /// the parse worker picks up the promise. @internal
    scheduleOn) {
        this.parser = parser;
        this.state = state;
        this.fragments = fragments;
        this.tree = tree;
        this.treeLen = treeLen;
        this.viewport = viewport;
        this.skipped = skipped;
        this.scheduleOn = scheduleOn;
    }
    startParse() {
        return this.parser.startParse(this.state, this.fragments);
    }
    static init(ParseContextType, state, modelFacet) {
        let vpTo = Math.min(3000 /* Work.InitViewport */, state.doc.length);
        let parseState = new ParseContextType(state.facet(modelFacet).parser, state, [], TabTree.empty, 0, { from: 0, to: vpTo }, [], null);
        if (!parseState.work(20 /* Work.Apply */, vpTo))
            parseState.takeTree(); // TODO: understand this line
        return parseState;
    }
    apply(tr) {
        let newCx = this.changes(tr.changes, tr.state);
        // If the previous parse wasn't done, go forward only up to its
        // end position or the end of the viewport, to avoid slowing down
        // state updates with parse work beyond the viewport.
        //TODO spend some time to understand this correctly.
        let upto = this.treeLen === tr.startState.doc.length ? undefined
            : Math.max(tr.changes.mapPos(this.treeLen), newCx.viewport.to);
        if (!newCx.work(20 /* Work.Apply */, upto))
            newCx.takeTree();
        return newCx;
    }
    /// @internal
    work(time, upto) {
        if (upto != null && upto >= this.state.doc.length)
            upto = undefined;
        if (this.tree !== TabTree.empty && this.isDone(upto ?? this.state.doc.length)) {
            this.takeTree();
            return true;
        }
        return this.withContext(() => {
            let endTime = Date.now() + time;
            if (!this.parse)
                this.parse = this.startParse();
            if (upto != null && (this.parse.stoppedAt === null || this.parse.stoppedAt > upto) &&
                upto < this.state.doc.length)
                this.parse.stopAt(upto);
            for (;;) {
                let { tree } = this.parse.advance();
                if (tree !== null) {
                    this.fragments = this.withoutTempSkipped(Fragment.addTree(tree, this.fragments));
                    this.treeLen = this.parse.stoppedAt ?? this.state.doc.length;
                    this.tree = tree;
                    this.parse = null;
                    // TODO: for some reason, this.parse.stoppedAt is always null when we reach the end of an incompltete tree
                    // and this prevents us from starting another parse
                    if (this.treeLen < (upto ?? this.state.doc.length))
                        this.parse = this.startParse();
                    else
                        return false;
                }
                if (Date.now() > endTime)
                    return false;
            }
        });
    }
    /// @internal
    takeTree() {
        let pos, tree;
        if (this.parse && (pos = this.parse.parsedPos) >= this.treeLen) {
            if (this.parse.stoppedAt === null || this.parse.stoppedAt > pos)
                this.parse.stopAt(pos);
            this.withContext(() => { while (!(tree = this.parse.advance(25 /* Work.MinSlice */).tree)) { } });
            this.treeLen = pos;
            this.tree = tree;
            this.fragments = this.withoutTempSkipped(Fragment.addTree(this.tree, this.fragments));
            this.parse = null;
        }
    }
    withContext(f) {
        let prev = this.currentContext;
        this.currentContext = this;
        try {
            return f();
        }
        finally {
            this.currentContext = prev;
        }
    }
    withoutTempSkipped(fragments) {
        for (let r; r = this.tempSkipped.pop();) {
            fragments = cutFragments(fragments, r.from, r.to);
        }
        return fragments;
    }
    /// @internal
    changes(changes, newState) {
        let { fragments, tree, treeLen, viewport, skipped } = this;
        this.takeTree();
        if (!changes.empty) {
            let ranges = [];
            changes.iterChangedRanges((fromA, toA, fromB, toB) => ranges.push({ fromA, toA, fromB, toB }));
            fragments = Fragment.applyChanges(fragments, ranges);
            tree = TabTree.empty;
            treeLen = 0;
            //update viewport and the skipped positions according to the changes that are made
            viewport = { from: changes.mapPos(viewport.from, -1), to: changes.mapPos(viewport.to, 1) };
            if (this.skipped.length) {
                skipped = [];
                for (let r of this.skipped) {
                    let from = changes.mapPos(r.from, 1);
                    let to = changes.mapPos(r.to, -1);
                    if (from < to)
                        skipped.push({ from, to });
                }
            }
        }
        // create an instance of the subclass which extends this TabParseContext class
        let ParseContextType = this.constructor;
        return new ParseContextType(this.parser, newState, fragments, tree, treeLen, viewport, skipped, this.scheduleOn);
    }
    /// @internal
    updateViewport(viewport) {
        if (this.viewport.from === viewport.from && this.viewport.to === viewport.to)
            return false;
        this.viewport = viewport;
        let startLen = this.skipped.length;
        for (let i = 0; i < this.skipped.length; i++) {
            let { from, to } = this.skipped[i];
            if (from < viewport.to && to > viewport.from) {
                this.fragments = cutFragments(this.fragments, from, to); // TODO: understand this
                this.skipped.splice(i--, 1);
            }
        }
        if (this.skipped.length >= startLen)
            return false;
        this.reset();
        return true;
    }
    /// @internal
    reset() {
        if (this.parse) {
            this.takeTree();
            this.parse = null;
        }
    }
    /// Notify the parse scheduler that the given region was skipped
    /// because it wasn't in view, and the parse should be restarted
    /// when it comes into view.
    skipUntilInView(from, to) {
        this.skipped.push({ from, to });
    }
    /// Returns a parser intended to be used as placeholder when
    /// asynchronously loading a nested parser. It'll skip its input and
    /// mark it as not-really-parsed, so that the next update will parse
    /// it again.
    ///
    /// When `until` is given, a reparse will be scheduled when that
    /// promise resolves.
    static getSkippingParser(until) {
        const test = new class extends TabParser {
            createParse(editorState, fragments, ranges) {
                let from = ranges[0].from, to = ranges[ranges.length - 1].to;
                let parser = {
                    parsedPos: from,
                    advance() {
                        let cx = this.currentContext;
                        if (cx) {
                            for (let r of ranges)
                                cx.tempSkipped.push(r);
                            if (until)
                                cx.scheduleOn = cx.scheduleOn ? Promise.all([cx.scheduleOn, until]) : until;
                        }
                        this.parsedPos = to;
                        return { blocked: false, tree: TabTree.createBlankTree(from, to) };
                    },
                    stoppedAt: null,
                    stopAt() { },
                    getFragments() { return []; }
                };
                return parser;
            }
        };
        return test;
    }
    /// @internal
    isDone(upto) {
        upto = Math.min(upto, this.state.doc.length);
        let frags = this.fragments;
        return this.treeLen >= upto && frags.length && frags[0].from === 0 && frags[frags.length - 1].to >= upto;
    }
}
function cutFragments(fragments, from, to) {
    return Fragment.applyChanges(fragments, [{ fromA: from, toA: to, fromB: from, toB: to }]);
}

class PartialTabParse {
    /// Reports whether `stopAt` has been called on this parse.
    stoppedAt;
}

class Cursor {
}

/// This class bundles a TabModel object with an 
/// optional set of supporting extensions. TabModel packages are 
/// encouraged to export a function that optionally takes a 
/// configuration object and returns a `TabModelSupport` instance, as 
/// the main way for client code to use the package
class TabModelSupport {
    tabModel;
    support;
    /// An extension including both the model and its support 
    /// extensions. (Allowing the object to be used as an extension 
    /// value itself.)
    extension;
    /// Create a support object
    constructor(
    /// The model object.
    tabModel, 
    /// An optional set of supporting extensions.
    support = []) {
        this.tabModel = tabModel;
        this.support = support;
        this.extension = [tabModel, support];
    }
}

class TabModelState {
    context;
    // The current tree. Immutable, because directly accessible from
    // the editor state.
    tree;
    constructor(
    // A mutable parse state that is used to preserve work done during
    // the lifetime of a state when moving to the next state.
    context) {
        this.context = context;
        this.tree = context.tree;
    }
}

class TabModel {
    data;
    parser;
    modelPackage;
    /// The extension value to install this provider.
    extension;
    constructor(
    /// The tablature data data facet used for this model (TODO: I don't understand this)
    data, parser, modelPackage, extraExtensions = []) {
        this.data = data;
        this.parser = parser;
        this.modelPackage = modelPackage;
        this.extension = [
            modelPackage.facet.of(this),
            EditorState.languageData.of((state, pos, side) => state.facet(this.modelPackage.dataFacetAt(state, pos, side)))
        ].concat(extraExtensions);
    }
    /// Query whether this model is active at the given position
    isActiveAt(state, pos, side = -1) {
        return this.modelPackage.dataFacetAt(state, pos, side) === this.data;
    }
}
class TabModelPackage {
    facet;
    viewPlugin;
    getModelState;
    constructor(facet, viewPlugin, getModelState) {
        this.facet = facet;
        this.viewPlugin = viewPlugin;
        this.getModelState = getModelState;
    }
    get state() { return this.getModelState(); }
    /// Get the syntax tree for a state, which is the current (possibly
    /// incomplete) parse tree of active model, or the empty tree 
    /// if there is no model available.
    tree(state) {
        let field = state.field(this.getModelState());
        return field ? field.tree : null;
    }
    /// Try to get a parse tree that spans at least up to `upto`. The
    /// method will do at most `timeout` milliseconds of work to parse
    /// up to that point if the tree isn't already available.
    ensureTree(state, upto, timeout = 50) {
        let parse = state.field(this.getModelState(), false)?.context;
        return !parse ? null : parse.isDone(upto) || parse.work(timeout, upto) ? parse.tree : null;
    }
    /// Queries whether there is a full syntax tree available up to the 
    /// given document position. If there isn't, the background parse
    /// process _might_ still be working and update the tree further, but 
    /// there is no guarantee of that-the parser will stop working when it 
    /// has spent a certain amount of time or has moved beyond the visible
    /// viewport. Always returns false if no model has been enabled.
    treeAvailable(state, upto = state.doc.length) {
        return state.field(this.state, false)?.context.isDone(upto) || false;
    }
    /// Tells you whether the model parser is planning to do more
    /// parsing work (in a `requestIdleCallback` pseudo-thread) or has
    /// stopped running, either because it parsed the entire document,
    /// because it spent too much time and was cut off, or because there
    /// is no model parser enabled.
    parserRunning(view) {
        return view.plugin(this.viewPlugin)?.isWorking() || false;
    }
    dataFacetAt(state, pos, side) {
        let topModel = state.facet(this.facet);
        if (!topModel)
            return null;
        let facet = topModel.data;
        return facet;
    }
    static defineDataFacet(baseData) {
        return Facet.define({
            combine: baseData ? values => values.concat(baseData) : undefined
        });
    }
}

export { Cursor, Fragment, PartialTabParse, TabModel, TabModelPackage, TabModelState, TabModelSupport, TabParseContext, TabParseWorker, TabParser, TabTree };
//# sourceMappingURL=index.js.map

import { ChangedRange } from "@lezer/common";
import { TabTree } from "./tree";
export declare abstract class Fragment {
    readonly from: number;
    readonly to: number;
    constructor(from: number, to: number);
    abstract advance(): boolean;
    abstract get isParsed(): boolean;
    abstract createOffsetCopy(offset: number): Fragment;
    /**
     * Applies a set of edits to an array of fragments, reusing unaffected fragments,
     * removing fragments overlapping with edits, or creating new fragments with
     * adjusted positions to replace fragments which have moved as a result of edits.
     * @param fragments a set of Fragment objects
     * @param changes a set of ChangedRanges representing edits
     * @returns a new set of fragments
     */
    static applyChanges(fragments: readonly Fragment[], changes: readonly ChangedRange[]): readonly Fragment[];
    /**
     * Create a set of fragments from a freshly parsed tree, or update
     * an existing set of fragments by replacing the ones that overlap
     * with a tree with content from the tree.
     * @param tree a freshly parsed tree
     * @param fragments a set of fragments
     * @returns fragment set produced by merging the tree's fragment set with the provided fragment set
     */
    static addTree(tree: TabTree, fragments?: readonly Fragment[]): Fragment[];
}

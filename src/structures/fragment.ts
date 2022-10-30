import { ChangedRange } from "@lezer/common";
import { TabTree } from "./tree";

export abstract class Fragment {
    constructor(
        readonly from: number,
        readonly to: number,
    ) {}

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
    static applyChanges(fragments: readonly Fragment[], changes: readonly ChangedRange[]) {
        if (!changes.length) return fragments;
        let result: Fragment[] = [];
        let fI = 1, nextF = fragments.length ? fragments[0] : null;
        for (let cI = 0, off=0;nextF; cI++) {
            let nextC = cI < changes.length ? changes[cI] : null;
            // TODO: be careful here with the <=. test to make sure that it should be <= and not just <.
            while (nextF && (!nextC || nextF.from <= nextC.toA)) {
                if (!nextC || nextF.to<=nextC.fromA) result.push(nextF.createOffsetCopy(-off));
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
    static addTree(tree: TabTree, fragments: readonly Fragment[] = []) {
        let result = [...tree.fragments];
        for (let f of fragments) if (f.to > tree.to) result.push(f);
        return result
    }
}

import { Fragment } from "./fragment";

export abstract class TabTree<F extends Fragment = Fragment> {
    readonly from: number;
    readonly to: number;
    constructor(readonly fragments: F[]) {
        this.from = fragments[0] ? fragments[0].from : 0;
        this.to = fragments[fragments.length-1] ? fragments[fragments.length-1].to : 0;
    }

    // figure out a way to get rid of *createBlankTree* and *empty*
    static createBlankTree(from: number, to: number) {
        return new class BlankModel extends TabTree<Fragment> {} ([{from, to} as Fragment])
    }

    static readonly empty = new class BlankModel extends TabTree<Fragment> {} ([])
}

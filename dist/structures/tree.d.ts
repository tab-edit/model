import { Fragment } from "./fragment";
export declare abstract class TabTree<F extends Fragment = Fragment> {
    readonly fragments: F[];
    readonly from: number;
    readonly to: number;
    constructor(fragments: F[]);
    static createBlankTree(from: number, to: number): {
        readonly from: number;
        readonly to: number;
        readonly fragments: Fragment[];
    };
    static readonly empty: {
        readonly from: number;
        readonly to: number;
        readonly fragments: Fragment[];
    };
}

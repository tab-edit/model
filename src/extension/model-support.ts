import { Extension } from "@codemirror/state";
import { TabModel } from "./model";

/// This class bundles a TabModel object with an 
/// optional set of supporting extensions. TabModel packages are 
/// encouraged to export a function that optionally takes a 
/// configuration object and returns a `TabModelSupport` instance, as 

/// the main way for client code to use the package
export class TabModelSupport {
    /// An extension including both the model and its support 
    /// extensions. (Allowing the object to be used as an extension 
    /// value itself.)
    extension: Extension;

    /// Create a support object
    constructor(
        /// The model object.
        readonly tabModel: TabModel,
        /// An optional set of supporting extensions.
        readonly support: Extension = []
    ) {
        this.extension = [tabModel, support];
    }
}
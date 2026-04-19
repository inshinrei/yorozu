import {PackageJson} from "./package-json/types";

export interface BuildHookContext {
    outDir: string
    packageDir: string
    packageName: string
    packageJson: PackageJson;
}
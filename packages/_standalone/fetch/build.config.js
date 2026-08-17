export default {
    preparePackageJson({ packageJson, jsr }) {
        if (jsr) {
            packageJson.peerDependencies["tough-cookie"] = "^6.0.2"
            packageJson.peerDependencies["@badrap/valita"] = "^0.4.0"
        }
    },
}

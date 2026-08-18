package cli

import (
	"fmt"
	"os"
)

var commands = map[string]func([]string) int{}

func init() {
	Register("lint", lintCmd)
	Register("build", buildCmd)
	Register("publish", publishCmd)
	Register("bump-version", bumpVersionCmd)
	Register("gen-changelog", genChangelogCmd)
	Register("find-changed-packages", findChangedPackagesCmd)
	Register("release", releaseCmd)
	Register("cr", crCmd)
	Register("docs", leftoverCmd("docs"))
	Register("jsr", leftoverCmd("jsr"))
	Register("gen-deps-graph", depsGraphCmd)
}

func Register(name string, fn func([]string) int) {
	commands[name] = fn
}

func Usage() string {
	return `yorozu-build <command>
lint
build
publish
bump-version
gen-changelog
find-changed-packages
release
jsr
docs
gen-deps-graph
cr`
}

func Run(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, Usage())
		return 0
	}

	name := args[0]
	if fn, ok := commands[name]; ok {
		return fn(args[1:])
	}

	fmt.Fprintf(os.Stderr, "unknown command %q\n", name)
	return 2
}

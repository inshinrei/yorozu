package depsgraph

import (
	"fmt"
	"strings"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/workspace"
)

func Generate(root string, includeRoot, includeExternal bool) (string, error) {
	pkgs, err := workspace.Collect(root, includeRoot)
	if err != nil {
		return "", err
	}
	return FromPackages(pkgs, includeExternal)
}

func FromPackages(pkgs []workspace.Package, includeExternal bool) (string, error) {
	workspacePackages := map[string]struct{}{}
	var commonPrefix *string
	prefixSet := false

	for _, pkg := range pkgs {
		if pkg.JSON.Name == "" {
			continue
		}
		workspacePackages[pkg.JSON.Name] = struct{}{}
		org, name, ok := strings.Cut(pkg.JSON.Name, "/")
		if !ok || name == "" {
			commonPrefix = nil
			prefixSet = true
			break
		}
		if !prefixSet {
			p := org
			commonPrefix = &p
			prefixSet = true
			continue
		}
		if commonPrefix == nil || *commonPrefix != org {
			commonPrefix = nil
			break
		}
	}

	getName := func(name string) string {
		if commonPrefix != nil {
			org, pkg, ok := strings.Cut(name, "/")
			if ok && org == *commonPrefix {
				return pkg
			}
		}
		return name
	}

	var lines []string
	for _, pkg := range pkgs {
		if pkg.JSON.Name == "" {
			continue
		}
		name := getName(pkg.JSON.Name)
		for dep := range pkg.JSON.Dependencies {
			if _, ok := workspacePackages[dep]; !ok && !includeExternal {
				continue
			}
			lines = append(lines, fmt.Sprintf("%q -> %q", name, getName(dep)))
		}
		for dep := range pkg.JSON.DevDependencies {
			if _, ok := workspacePackages[dep]; !ok && !includeExternal {
				continue
			}
			lines = append(lines, fmt.Sprintf("%q -> %q [style=dashed,color=grey]", name, getName(dep)))
		}
	}
	return "digraph {\n" + strings.Join(lines, "\n") + "\n}", nil
}

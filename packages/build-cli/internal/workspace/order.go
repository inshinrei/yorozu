package workspace

import (
	"fmt"
	"maps"
	"slices"
)

func DeterminePublishOrder(deps map[string][]string) ([]string, error) {
	result := make([]string, 0, len(deps))
	visited := map[string]struct{}{}
	visiting := map[string]struct{}{}

	var visit func(name string) error
	visit = func(name string) error {
		if _, ok := visited[name]; ok {
			return nil
		}
		if _, ok := deps[name]; !ok {
			return nil
		}
		if _, ok := visiting[name]; ok {
			return fmt.Errorf("Circular dependency detected: %s", name)
		}
		visiting[name] = struct{}{}
		for _, dep := range deps[name] {
			if err := visit(dep); err != nil {
				return err
			}
		}
		delete(visiting, name)
		visited[name] = struct{}{}
		result = append(result, name)
		return nil
	}

	// Go maps have no insertion order; sort so independent nodes are stable.
	for _, name := range slices.Sorted(maps.Keys(deps)) {
		if err := visit(name); err != nil {
			return nil, err
		}
	}
	return result, nil
}

func SortByPublishOrder(pkgs []Package) ([]Package, error) {
	byName := map[string]Package{}
	for _, pkg := range pkgs {
		if pkg.JSON.Name == "" {
			continue
		}
		byName[pkg.JSON.Name] = pkg
	}

	deps := map[string][]string{}
	for _, pkg := range pkgs {
		if pkg.JSON.Name == "" {
			continue
		}
		var list []string
		list = append(list, workspaceDepNames(pkg.JSON.Dependencies, byName)...)
		list = append(list, workspaceDepNames(pkg.JSON.PeerDependencies, byName)...)
		deps[pkg.JSON.Name] = list
	}

	order, err := DeterminePublishOrder(deps)
	if err != nil {
		return nil, err
	}
	result := make([]Package, 0, len(order))
	for _, name := range order {
		result = append(result, byName[name])
	}
	return result, nil
}

func workspaceDepNames(deps map[string]string, workspacePkgs map[string]Package) []string {
	var names []string
	for name := range deps {
		if _, ok := workspacePkgs[name]; ok {
			names = append(names, name)
		}
	}
	slices.Sort(names)
	return names
}

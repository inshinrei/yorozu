package workspace

import (
	"fmt"
	"path/filepath"
)

func FindByName(pkgs []Package, name string) (Package, error) {
	for _, pkg := range pkgs {
		if pkg.JSON.Name == name {
			return pkg, nil
		}
	}
	return Package{}, fmt.Errorf("Could not find package.json for %s", name)
}

func FindRoot(pkgs []Package) (Package, error) {
	for _, pkg := range pkgs {
		if pkg.Root {
			return pkg, nil
		}
	}
	return Package{}, fmt.Errorf("Could not find package.json for workspace root")
}

func CollectVersions(pkgs []Package) map[string]string {
	versions := map[string]string{}
	for _, pkg := range pkgs {
		if pkg.Root || pkg.JSON.Name == "" || pkg.JSON.Version == "" {
			continue
		}
		versions[pkg.JSON.Name] = pkg.JSON.Version
	}
	return versions
}

func FindPackageJSON(from string) (string, error) {
	current := filepath.Clean(from)
	for {
		candidate := filepath.Join(current, "package.json")
		if fileExists(candidate) {
			return candidate, nil
		}
		parent := filepath.Dir(current)
		if parent == current {
			return "", nil
		}
		current = parent
	}
}

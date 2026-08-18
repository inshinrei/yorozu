package cr

import "github.com/inshinrei/yorozu/packages/build-cli/internal/workspace"

func SelectChangedNpm(publishable, changed []workspace.Package) []workspace.Package {
	selected := append([]workspace.Package(nil), changed...)
	selectedNames := map[string]struct{}{}
	for _, pkg := range selected {
		selectedNames[pkg.JSON.Name] = struct{}{}
	}

	hadChanges := true
	for hadChanges {
		hadChanges = false
		for _, pkg := range publishable {
			pkgName := pkg.JSON.Name
			if _, ok := selectedNames[pkgName]; ok {
				continue
			}
			for _, field := range []map[string]string{pkg.JSON.Dependencies, pkg.JSON.PeerDependencies} {
				for name := range field {
					if _, ok := selectedNames[name]; ok {
						hadChanges = true
						selected = append(selected, pkg)
						selectedNames[pkgName] = struct{}{}
						break
					}
				}
				if _, ok := selectedNames[pkgName]; ok {
					break
				}
			}
		}
	}

	return workspace.FilterForPublish(selected, "npm")
}

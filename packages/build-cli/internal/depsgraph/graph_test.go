package depsgraph_test

import (
	"testing"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/depsgraph"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/workspace"
)

func pkgNamed(name, version string, root bool) workspace.Package {
	return workspace.Package{
		Root: root,
		JSON: workspace.PackageJSON{Name: name, Version: version},
	}
}

func TestGenerateInternalOnlyUsesShortNames(t *testing.T) {
	pkgs := []workspace.Package{
		pkgNamed("@yorozu/utils", "0.1.0", false),
		{
			JSON: workspace.PackageJSON{
				Name:         "@yorozu/io",
				Version:      "0.1.0",
				Dependencies: map[string]string{"@yorozu/utils": "workspace:^"},
			},
		},
	}
	got, err := depsgraph.FromPackages(pkgs, false)
	if err != nil {
		t.Fatal(err)
	}
	want := "digraph {\n\"io\" -> \"utils\"\n}"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestGenerateIncludesDashedDevEdges(t *testing.T) {
	pkgs := []workspace.Package{
		pkgNamed("@yorozu/utils", "0.1.0", false),
		{
			JSON: workspace.PackageJSON{
				Name:            "@yorozu/io",
				Version:         "0.1.0",
				DevDependencies: map[string]string{"@yorozu/utils": "workspace:^"},
			},
		},
	}
	got, err := depsgraph.FromPackages(pkgs, false)
	if err != nil {
		t.Fatal(err)
	}
	want := "digraph {\n\"io\" -> \"utils\" [style=dashed,color=grey]\n}"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

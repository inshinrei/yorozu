package workspace_test

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/workspace"
)

func TestCollectVersionsSkipsRootAndIncomplete(t *testing.T) {
	got := workspace.CollectVersions([]workspace.Package{
		pkgNamed("root", "9.9.9", true),
		pkgNamed("a", "1.0.0", false),
		pkgNamed("b", "2.0.0", false),
		{JSON: workspace.PackageJSON{Name: "no-version"}},
		{JSON: workspace.PackageJSON{Version: "3.0.0"}},
	})
	if got["a"] != "1.0.0" || got["b"] != "2.0.0" || len(got) != 2 {
		t.Fatalf("%v", got)
	}
}

func TestFindByNameAndFindRoot(t *testing.T) {
	rootP := pkg("root", true, nil)
	a := pkg("a", false, nil)
	packages := []workspace.Package{rootP, a}

	got, err := workspace.FindByName(packages, "a")
	if err != nil || got.JSON.Name != "a" {
		t.Fatalf("%v %v", got, err)
	}
	got, err = workspace.FindRoot(packages)
	if err != nil || !got.Root {
		t.Fatalf("%v %v", got, err)
	}
	_, err = workspace.FindByName(packages, "missing")
	if err == nil || !strings.Contains(err.Error(), "Could not find package.json for missing") {
		t.Fatalf("err=%v", err)
	}
	_, err = workspace.FindRoot([]workspace.Package{a})
	if err == nil || !strings.Contains(err.Error(), "Could not find package.json for workspace root") {
		t.Fatalf("err=%v", err)
	}
}

func TestFindPackageJSON(t *testing.T) {
	root := testdataWorkspace(t)
	from := filepath.Join(root, "packages", "package-a", "src", "index.ts")
	got, err := workspace.FindPackageJSON(from)
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(root, "packages", "package-a", "package.json")
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}

	got, err = workspace.FindPackageJSON("/")
	if err != nil || got != "" {
		t.Fatalf("got %q err %v", got, err)
	}
}

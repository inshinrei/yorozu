package workspace_test

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/workspace"
)

func TestCollectPnpmFixture(t *testing.T) {
	root := testdataWorkspace(t)
	pkgs, err := workspace.Collect(root, false)
	if err != nil {
		t.Fatal(err)
	}
	names := namesOf(pkgs)
	if !contains(names, "@yorozu-fixtures/package-a") || !contains(names, "@yorozu-fixtures/package-b") || len(pkgs) != 2 {
		t.Fatalf("%v", names)
	}
	for _, p := range pkgs {
		if p.Root {
			t.Fatal("root leaked")
		}
	}
}

func TestCollectIncludeRootAttachesCatalogs(t *testing.T) {
	root := testdataWorkspace(t)
	pkgs, err := workspace.Collect(root, true)
	if err != nil {
		t.Fatal(err)
	}
	r := mustRoot(t, pkgs)
	if r.JSON.Name != "@yorozu-fixtures/workspace" {
		t.Fatal(r.JSON.Name)
	}
	if !reflect.DeepEqual(r.JSON.Workspaces, []string{"packages/*"}) {
		t.Fatalf("%v", r.JSON.Workspaces)
	}
	if r.JSON.Catalogs[""]["zod"] != "4.3.6" || r.JSON.Catalogs["frontend"]["react"] != "19.0.0" {
		t.Fatalf("%v", r.JSON.Catalogs)
	}
	if len(pkgs) != 3 {
		t.Fatalf("len=%d", len(pkgs))
	}
}

func TestCollectThrowsWithoutWorkspaces(t *testing.T) {
	root := testdataWorkspace(t)
	_, err := workspace.Collect(filepath.Join(root, "packages", "package-a"), false)
	if err == nil || !strings.Contains(err.Error(), "No workspaces found in package.json") {
		t.Fatalf("err=%v", err)
	}
}

func TestFilterForPublish(t *testing.T) {
	rootP := pkg("root", true, nil)
	plain := pkg("plain", false, nil)
	private := pkg("secret", false, &workspace.Yorozu{Private: true})
	npmSkip := pkg("npm-skip", false, &workspace.Yorozu{NPM: "skip"})
	jsrOnly := pkg("jsr-only", false, &workspace.Yorozu{JSR: "only"})
	npmOnly := pkg("npm-only", false, &workspace.Yorozu{NPM: "only"})
	all := []workspace.Package{rootP, plain, private, npmSkip, jsrOnly, npmOnly}
	npm := namesOf(workspace.FilterForPublish(all, "npm"))
	if !reflect.DeepEqual(npm, []string{"plain", "npm-only"}) {
		t.Fatalf("%v", npm)
	}
	jsr := namesOf(workspace.FilterForPublish(all, "jsr"))
	if !reflect.DeepEqual(jsr, []string{"plain", "npm-skip", "jsr-only"}) {
		t.Fatalf("%v", jsr)
	}
}

func testdataWorkspace(t *testing.T) string {
	t.Helper()
	return filepath.Join(findRepoRoot(t), "packages/build-cli/testdata/pnpm-workspace")
}

func findRepoRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "pnpm-workspace.yaml")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatal("could not find repo root (pnpm-workspace.yaml)")
		}
		dir = parent
	}
}

func namesOf(pkgs []workspace.Package) []string {
	names := make([]string, 0, len(pkgs))
	for _, p := range pkgs {
		names = append(names, p.JSON.Name)
	}
	return names
}

func contains(ss []string, want string) bool {
	for _, s := range ss {
		if s == want {
			return true
		}
	}
	return false
}

func mustRoot(t *testing.T, pkgs []workspace.Package) workspace.Package {
	t.Helper()
	for _, p := range pkgs {
		if p.Root {
			return p
		}
	}
	t.Fatal("no root")
	return workspace.Package{}
}

func pkg(name string, root bool, y *workspace.Yorozu) workspace.Package {
	return workspace.Package{
		Root: root,
		JSON: workspace.PackageJSON{Name: name, Yorozu: y},
	}
}

func pkgNamed(name, version string, root bool) workspace.Package {
	return workspace.Package{
		Root: root,
		JSON: workspace.PackageJSON{Name: name, Version: version},
	}
}

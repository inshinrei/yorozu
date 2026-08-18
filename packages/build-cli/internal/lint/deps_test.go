package lint_test

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/config"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/lint"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/workspace"
)

func TestValidateWorkspaceDepsOracles(t *testing.T) {
	t.Run("pnpm-workspace fixture", func(t *testing.T) {
		root := testdataWorkspace(t)
		pkgs, err := workspace.Collect(root, false)
		if err != nil {
			t.Fatal(err)
		}
		got, err := lint.ValidateWorkspaceDeps(root, pkgs, config.LintConfig{})
		if err != nil {
			t.Fatal(err)
		}
		if len(got) != 0 {
			t.Fatalf("errors=%v", got)
		}
	})

	t.Run("compatible chai", func(t *testing.T) {
		got, err := lint.ValidateWorkspaceDeps("/tmp/ws", []workspace.Package{
			workspacePackage(workspace.PackageJSON{
				Name:         "@yorozu-fixtures/package-a",
				Dependencies: map[string]string{"chai": "^1.2.3"},
			}, nil),
			workspacePackage(workspace.PackageJSON{
				Name:         "@yorozu-fixtures/package-b",
				Dependencies: map[string]string{"chai": "1.2.4"},
			}, nil),
		}, config.LintConfig{})
		if err != nil {
			t.Fatal(err)
		}
		if len(got) != 0 {
			t.Fatalf("errors=%v", got)
		}
	})

	t.Run("mismatch chai", func(t *testing.T) {
		got, err := lint.ValidateWorkspaceDeps("/tmp/ws", []workspace.Package{
			workspacePackage(workspace.PackageJSON{
				Name:         "@yorozu-fixtures/package-a",
				Dependencies: map[string]string{"chai": "^1.2.3"},
			}, nil),
			workspacePackage(workspace.PackageJSON{
				Name:         "@yorozu-fixtures/package-b",
				Dependencies: map[string]string{"chai": "^2.0.0"},
			}, nil),
		}, config.LintConfig{})
		if err != nil {
			t.Fatal(err)
		}
		if len(got) != 1 {
			t.Fatalf("len=%d errors=%v", len(got), got)
		}
		want := lint.ExternalError{
			Type:         "external",
			Package:      "@yorozu-fixtures/package-b",
			OtherPackage: "@yorozu-fixtures/package-a",
			Dependency:   "chai",
			Version:      "^2.0.0",
			At:           "dependencies",
			OtherVersion: "^1.2.3",
		}
		if !reflect.DeepEqual(got[0], want) {
			t.Fatalf("got %#v want %#v", got[0], want)
		}
	})

	t.Run("not_workspace_proto", func(t *testing.T) {
		got, err := lint.ValidateWorkspaceDeps("/tmp/ws", []workspace.Package{
			workspacePackage(workspace.PackageJSON{Name: "@yorozu/utils", Version: "0.1.0"}, nil),
			workspacePackage(workspace.PackageJSON{
				Name:         "@yorozu/io",
				Dependencies: map[string]string{"@yorozu/utils": "^0.1.0"},
			}, nil),
		}, config.LintConfig{})
		if err != nil {
			t.Fatal(err)
		}
		want := []lint.Error{
			lint.InternalError{
				Type:       "internal",
				Package:    "@yorozu/io",
				Dependency: "@yorozu/utils",
				Subtype:    "not_workspace_proto",
			},
		}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("got %#v want %#v", got, want)
		}
	})

	t.Run("standalone internal", func(t *testing.T) {
		got, err := lint.ValidateWorkspaceDeps("/tmp/ws", []workspace.Package{
			workspacePackage(workspace.PackageJSON{
				Name:    "@yorozu/fetch",
				Version: "0.0.1",
				Yorozu:  &workspace.Yorozu{Standalone: true},
			}, nil),
			workspacePackage(workspace.PackageJSON{
				Name:         "@yorozu/io",
				Dependencies: map[string]string{"@yorozu/fetch": "^0.0.1"},
			}, nil),
		}, config.LintConfig{})
		if err != nil {
			t.Fatal(err)
		}
		if len(got) != 0 {
			t.Fatalf("errors=%v", got)
		}
	})

	t.Run("not_workspace_dep", func(t *testing.T) {
		got, err := lint.ValidateWorkspaceDeps("/tmp/ws", []workspace.Package{
			workspacePackage(workspace.PackageJSON{
				Name:         "@yorozu/io",
				Dependencies: map[string]string{"@yorozu/missing": "workspace:^"},
			}, nil),
		}, config.LintConfig{})
		if err != nil {
			t.Fatal(err)
		}
		want := []lint.Error{
			lint.InternalError{
				Type:       "internal",
				Package:    "@yorozu/io",
				Dependency: "@yorozu/missing",
				Subtype:    "not_workspace_dep",
			},
		}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("got %#v want %#v", got, want)
		}
	})

	t.Run("external disabled", func(t *testing.T) {
		enabled := false
		var cfg config.LintConfig
		cfg.ExternalDependencies.Enabled = &enabled
		got, err := lint.ValidateWorkspaceDeps("/tmp/ws", []workspace.Package{
			workspacePackage(workspace.PackageJSON{
				Name:         "@yorozu-fixtures/package-a",
				Dependencies: map[string]string{"chai": "^1.2.3"},
			}, nil),
			workspacePackage(workspace.PackageJSON{
				Name:         "@yorozu-fixtures/package-b",
				Dependencies: map[string]string{"chai": "^2.0.0"},
			}, nil),
		}, cfg)
		if err != nil {
			t.Fatal(err)
		}
		if len(got) != 0 {
			t.Fatalf("errors=%v", got)
		}
	})

	t.Run("skip peer dependencies", func(t *testing.T) {
		var cfg config.LintConfig
		cfg.ExternalDependencies.SkipPeerDependencies = true
		got, err := lint.ValidateWorkspaceDeps("/tmp/ws", []workspace.Package{
			workspacePackage(workspace.PackageJSON{
				Name:             "@yorozu-fixtures/package-a",
				PeerDependencies: map[string]string{"chai": "^1.2.3"},
			}, nil),
			workspacePackage(workspace.PackageJSON{
				Name:             "@yorozu-fixtures/package-b",
				PeerDependencies: map[string]string{"chai": "^2.0.0"},
			}, nil),
		}, cfg)
		if err != nil {
			t.Fatal(err)
		}
		if len(got) != 0 {
			t.Fatalf("errors=%v", got)
		}
	})
}

func workspacePackage(json workspace.PackageJSON, extras *workspace.Package) workspace.Package {
	pkg := workspace.Package{
		Path:            "/tmp/" + json.Name,
		PackageJSONPath: "/tmp/" + json.Name + "/package.json",
		Root:            false,
		JSON:            json,
	}
	if json.Name == "" {
		pkg.Path = "/tmp/pkg"
		pkg.PackageJSONPath = "/tmp/pkg/package.json"
	}
	if extras != nil {
		if extras.Path != "" {
			pkg.Path = extras.Path
		}
		if extras.PackageJSONPath != "" {
			pkg.PackageJSONPath = extras.PackageJSONPath
		}
		pkg.Root = extras.Root
	}
	return pkg
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

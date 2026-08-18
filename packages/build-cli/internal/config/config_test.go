package config_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/config"
)

func TestLoadMissingIsNil(t *testing.T) {
	dir := t.TempDir()
	got, err := config.Load(dir)
	if err != nil || got != nil {
		t.Fatalf("got %#v err %v", got, err)
	}
}

func TestLoadDataConfig(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "build.config.js"),
		[]byte("export default { viteConfig: 'vite.config.ts', versioning: { taggingSchema: 'semver' } }\n"), 0o644)
	// point eval helper at the real repo script via t.Setenv
	repo := findRepoRoot(t)
	t.Setenv("YOROZU_BUILD_EVAL_CONFIG", filepath.Join(repo, "packages/build/scripts/eval-config.mjs"))
	got, err := config.Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	if got.ViteConfig != "vite.config.ts" || got.Versioning.TaggingSchema != "semver" {
		t.Fatalf("%+v", got)
	}
}

func TestLoadDropsFunctions(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "build.config.js"),
		[]byte("export default { viteConfig: 'x.ts', jsr: { sourceDir: 'src', includePackage: () => true } }\n"), 0o644)
	t.Setenv("YOROZU_BUILD_EVAL_CONFIG", filepath.Join(findRepoRoot(t), "packages/build/scripts/eval-config.mjs"))
	got, err := config.Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	if got.Jsr.SourceDir != "src" {
		t.Fatalf("%+v", got)
	}
}

func TestLoadBrokenImportErrors(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "build.config.js"),
		[]byte("import 'yorozu-missing-build-config-dep'\nexport default { viteConfig: 'x.js' }\n"), 0o644)
	t.Setenv("YOROZU_BUILD_EVAL_CONFIG", filepath.Join(findRepoRoot(t), "packages/build/scripts/eval-config.mjs"))
	_, err := config.Load(dir)
	if err == nil || !strings.Contains(err.Error(), "Could not load build.config.js") {
		t.Fatalf("err=%v", err)
	}
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

package lint_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/lint"
)

func TestFindPreferProtectedLeftover(t *testing.T) {
	dir := t.TempDir()
	src := []byte("export class Lock {\n    private _queue = 1\n}\n")
	if err := os.WriteFile(filepath.Join(dir, "lock.ts"), src, 0o644); err != nil {
		t.Fatal(err)
	}

	got, err := lint.FindPreferProtected(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 {
		t.Fatalf("errors=%#v", got)
	}
	item := got[0]
	if item.Type != "prefer_protected" || item.File != "lock.ts" || item.Kind != "private_keyword" || item.Name != "_queue" {
		t.Fatalf("%+v", item)
	}
	if item.Line != 2 || item.Column != 5 {
		t.Fatalf("pos %d:%d", item.Line, item.Column)
	}
}

func TestFindPreferProtectedHonorsEnabledFalse(t *testing.T) {
	dir := t.TempDir()
	src := []byte("export class Lock {\n    private _queue = 1\n}\n")
	if err := os.WriteFile(filepath.Join(dir, "lock.ts"), src, 0o644); err != nil {
		t.Fatal(err)
	}

	got, err := lint.FindPreferProtected(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 {
		t.Fatalf("default errors=%#v", got)
	}

	cfg := []byte("export default { lint: { preferProtected: { enabled: false } } }\n")
	if err := os.WriteFile(filepath.Join(dir, "build.config.js"), cfg, 0o644); err != nil {
		t.Fatal(err)
	}
	got, err = lint.FindPreferProtected(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 0 {
		t.Fatalf("disabled errors=%#v", got)
	}
}

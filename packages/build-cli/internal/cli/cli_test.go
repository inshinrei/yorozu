package cli_test

import (
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/cli"
)

func TestUsageListsEveryCommand(t *testing.T) {
	usage := cli.Usage()
	want := []string{
		"lint", "build", "publish", "bump-version", "gen-changelog",
		"find-changed-packages", "release", "jsr", "docs", "gen-deps-graph", "cr",
	}
	for _, name := range want {
		if !strings.Contains(usage, name) {
			t.Fatalf("usage missing %q:\n%s", name, usage)
		}
	}
}

func TestRunNoArgsIsUsageExitZero(t *testing.T) {
	if code := cli.Run(nil); code != 0 {
		t.Fatalf("exit %d", code)
	}
}

func TestRunUnknownCommandIsExitTwo(t *testing.T) {
	if code := cli.Run([]string{"nope"}); code != 2 {
		t.Fatalf("exit %d", code)
	}
}

func TestLintFixtureLooksGood(t *testing.T) {
	root := filepath.Join(findRepoRoot(t), "packages/build-cli/testdata/pnpm-workspace")
	stdout, stderr, code := runLint(t, "--workspace", root)
	if code != 0 {
		t.Fatalf("exit %d stderr=%s", code, stderr)
	}
	if !strings.Contains(stdout, "workspace dependencies look good") {
		t.Fatalf("stdout=%q", stdout)
	}
	if !strings.Contains(stdout, "class members look good") {
		t.Fatalf("stdout=%q", stdout)
	}
}

func TestLintExternalMismatch(t *testing.T) {
	root := mismatchWorkspace(t)
	stdout, stderr, code := runLint(t, "--workspace", root)
	if code != 1 {
		t.Fatalf("exit %d stdout=%q stderr=%q", code, stdout, stderr)
	}
	if !strings.Contains(stderr, "Found external dependencies mismatch:") {
		t.Fatalf("stderr=%q", stderr)
	}
	if !strings.Contains(stderr, "  - at @yorozu-fixtures/package-b: dependencies has chai@^2.0.0, but @yorozu-fixtures/package-a has @^1.2.3") {
		t.Fatalf("stderr=%q", stderr)
	}
}

func TestLintNoErrorCode(t *testing.T) {
	root := mismatchWorkspace(t)
	_, stderr, code := runLint(t, "--workspace", root, "--no-error-code")
	if code != 0 {
		t.Fatalf("exit %d stderr=%q", code, stderr)
	}
	if !strings.Contains(stderr, "Found external dependencies mismatch:") {
		t.Fatalf("stderr=%q", stderr)
	}
}

func TestLintPreferProtected(t *testing.T) {
	root := t.TempDir()
	writeWorkspace(t, root, map[string]string{
		"packages/a/package.json": `{"name":"pkg-a","version":"1.0.0"}`,
		"packages/a/lock.ts":      "export class Lock {\n    private _queue = 1\n}\n",
	})
	stdout, stderr, code := runLint(t, "--workspace", root)
	if code != 1 {
		t.Fatalf("exit %d stdout=%q stderr=%q", code, stdout, stderr)
	}
	if !strings.Contains(stdout, "workspace dependencies look good") {
		t.Fatalf("stdout=%q", stdout)
	}
	if !strings.Contains(stderr, "Found private / # class members (use protected):") {
		t.Fatalf("stderr=%q", stderr)
	}
	if !strings.Contains(stderr, "  - at packages/a/lock.ts:2:5: private _queue — use protected") {
		t.Fatalf("stderr=%q", stderr)
	}
}

func runLint(t *testing.T, args ...string) (stdout, stderr string, code int) {
	t.Helper()
	rOut, wOut, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	rErr, wErr, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	oldOut, oldErr := os.Stdout, os.Stderr
	os.Stdout, os.Stderr = wOut, wErr
	code = cli.Run(append([]string{"lint"}, args...))
	wOut.Close()
	wErr.Close()
	os.Stdout, os.Stderr = oldOut, oldErr
	outb, err := io.ReadAll(rOut)
	if err != nil {
		t.Fatal(err)
	}
	errb, err := io.ReadAll(rErr)
	if err != nil {
		t.Fatal(err)
	}
	return string(outb), string(errb), code
}

func mismatchWorkspace(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	writeWorkspace(t, root, map[string]string{
		"packages/a/package.json": `{"name":"@yorozu-fixtures/package-a","version":"1.0.0","dependencies":{"chai":"^1.2.3"}}`,
		"packages/b/package.json": `{"name":"@yorozu-fixtures/package-b","version":"1.0.0","dependencies":{"chai":"^2.0.0"}}`,
	})
	return root
}

func writeWorkspace(t *testing.T, root string, files map[string]string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(root, "package.json"), []byte(`{"name":"ws","private":true}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "pnpm-workspace.yaml"), []byte("packages:\n  - \"packages/*\"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	for rel, body := range files {
		path := filepath.Join(root, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
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

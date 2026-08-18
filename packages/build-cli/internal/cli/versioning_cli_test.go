package cli_test

import (
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/cli"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/exec"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/versioning"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/workspace"
)

func TestFormatBumpVersionResult(t *testing.T) {
	utils := workspace.Package{
		JSON: workspace.PackageJSON{Name: "@yorozu/utils", Version: "0.2.0"},
	}
	result := versioning.Result{
		ReleaseType: versioning.ReleaseMinor,
		HasBreaking: false,
		HasFeatures: true,
		Changed: []versioning.BumpPkg{
			{Package: utils, PrevVersion: "0.1.0"},
		},
	}

	got := cli.FormatBumpVersionResult(result, true)
	want := strings.Join([]string{
		"detected release type: minor",
		"  has breaking changes: false",
		"  has new features: true",
		"",
		"list of changed packages:",
		"  @yorozu/utils: 0.1.0 → 0.2.0",
	}, "\n")
	if got != want {
		t.Fatalf("got=\n%s\nwant=\n%s", got, want)
	}

	got = cli.FormatBumpVersionResult(result, false)
	want = strings.Join([]string{
		"list of changed packages:",
		"  @yorozu/utils: 0.1.0 → 0.2.0",
	}, "\n")
	if got != want {
		t.Fatalf("no type got=\n%s\nwant=\n%s", got, want)
	}
}

func TestBumpVersionNoPreviousTag(t *testing.T) {
	t.Setenv("GITHUB_ACTIONS", "")
	os.Unsetenv("GITHUB_ACTIONS")
	dir := initVersioningRepo(t)
	writeVersioningWorkspace(t, dir)
	gitRunCLI(t, dir, "add", ".")
	gitRunCLI(t, dir, "commit", "-m", "chore: initial")

	_, stderr, code := runCmd(t, "bump-version", "--root", dir, "--kind", "patch", "--dry-run")
	if code != 1 {
		t.Fatalf("exit %d stderr=%q", code, stderr)
	}
	if !strings.Contains(stderr, "no previous tag found, cannot determine changeset") {
		t.Fatalf("stderr=%q", stderr)
	}
}

func TestBumpVersionDryRunPrintsAndGHAVersion(t *testing.T) {
	t.Setenv("GITHUB_ACTIONS", "")
	os.Unsetenv("GITHUB_ACTIONS")
	dir := initVersioningRepo(t)
	writeVersioningWorkspace(t, dir)
	gitRunCLI(t, dir, "add", ".")
	gitRunCLI(t, dir, "commit", "-m", "chore: initial")
	gitRunCLI(t, dir, "tag", "v0.1.0")

	stdout, stderr, code := runCmd(t, "bump-version", "--root", dir, "--kind", "minor", "--dry-run")
	if code != 0 {
		t.Fatalf("exit %d stderr=%q stdout=%q", code, stderr, stdout)
	}
	if !strings.Contains(stdout, "list of changed packages:") {
		t.Fatalf("stdout=%q", stdout)
	}
	if !strings.Contains(stdout, "@yorozu/utils: 0.1.0 → 0.2.0") {
		t.Fatalf("stdout=%q", stdout)
	}
	if strings.Contains(stdout, "detected release type:") {
		t.Fatalf("explicit kind should not print detected type: %q", stdout)
	}
	if got := readFileCLI(t, filepath.Join(dir, "packages", "utils", "package.json")); !strings.Contains(got, `"version": "0.1.0"`) {
		t.Fatalf("dry-run wrote file: %s", got)
	}

	outPath := filepath.Join(t.TempDir(), "gha")
	if err := os.WriteFile(outPath, nil, 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("GITHUB_ACTIONS", "true")
	t.Setenv("GITHUB_OUTPUT", outPath)
	stdout, stderr, code = runCmd(t, "bump-version", "--root", dir, "--kind", "auto", "--dry-run", "--since", "v0.1.0")
	if code != 0 {
		t.Fatalf("gha exit %d stderr=%q stdout=%q", code, stderr, stdout)
	}
	if !strings.Contains(stdout, "detected release type: patch") {
		t.Fatalf("auto stdout=%q", stdout)
	}
	gha := readFileCLI(t, outPath)
	if !strings.Contains(gha, "version=0.1.1\n") {
		t.Fatalf("gha=%q", gha)
	}
}

func TestFindChangedPackagesNoPreviousTag(t *testing.T) {
	t.Setenv("GITHUB_ACTIONS", "")
	os.Unsetenv("GITHUB_ACTIONS")
	dir := initVersioningRepo(t)
	writeVersioningWorkspace(t, dir)
	gitRunCLI(t, dir, "add", ".")
	gitRunCLI(t, dir, "commit", "-m", "chore: initial")

	_, stderr, code := runCmd(t, "find-changed-packages", "--root", dir)
	if code != 1 {
		t.Fatalf("exit %d stderr=%q", code, stderr)
	}
	if !strings.Contains(stderr, "no previous tag found, cannot determine changeset") {
		t.Fatalf("stderr=%q", stderr)
	}
}

func TestFindChangedPackagesPrintsAndGHA(t *testing.T) {
	t.Setenv("GITHUB_ACTIONS", "")
	os.Unsetenv("GITHUB_ACTIONS")
	dir := initVersioningRepo(t)
	writeVersioningWorkspace(t, dir)
	gitRunCLI(t, dir, "add", ".")
	gitRunCLI(t, dir, "commit", "-m", "chore: initial")
	since := gitRunCLI(t, dir, "rev-parse", "HEAD")
	writeFileCLI(t, filepath.Join(dir, "packages", "utils", "index.ts"), "export const n = 1\n")
	gitRunCLI(t, dir, "add", ".")
	gitRunCLI(t, dir, "commit", "-m", "feat: change utils")

	stdout, stderr, code := runCmd(t, "find-changed-packages", "--root", dir, "--since", since)
	if code != 0 {
		t.Fatalf("exit %d stderr=%q stdout=%q", code, stderr, stdout)
	}
	if strings.TrimSpace(stdout) != "@yorozu/utils" {
		t.Fatalf("stdout=%q", stdout)
	}

	outPath := filepath.Join(t.TempDir(), "gha")
	if err := os.WriteFile(outPath, nil, 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("GITHUB_ACTIONS", "true")
	t.Setenv("GITHUB_OUTPUT", outPath)
	stdout, stderr, code = runCmd(t, "find-changed-packages", "--root", dir, "--since", since)
	if code != 0 {
		t.Fatalf("gha exit %d stderr=%q stdout=%q", code, stderr, stdout)
	}
	if !strings.Contains(stdout, "Written packages to `packages` output") {
		t.Fatalf("stdout=%q", stdout)
	}
	gha := readFileCLI(t, outPath)
	if !strings.Contains(gha, "packages=@yorozu/utils\n") {
		t.Fatalf("gha=%q", gha)
	}
}

func TestGenChangelogPrints(t *testing.T) {
	t.Setenv("GITHUB_ACTIONS", "")
	os.Unsetenv("GITHUB_ACTIONS")
	dir := initVersioningRepo(t)
	writeVersioningWorkspace(t, dir)
	gitRunCLI(t, dir, "add", ".")
	gitRunCLI(t, dir, "commit", "-m", "chore: initial")
	since := gitRunCLI(t, dir, "rev-parse", "HEAD")
	writeFileCLI(t, filepath.Join(dir, "packages", "utils", "index.ts"), "export const n = 1\n")
	gitRunCLI(t, dir, "add", ".")
	gitRunCLI(t, dir, "commit", "-m", "feat: add utils export")

	stdout, stderr, code := runCmd(t, "gen-changelog", "--root", dir, "--since", since)
	if code != 0 {
		t.Fatalf("exit %d stderr=%q stdout=%q", code, stderr, stdout)
	}
	if !strings.Contains(stdout, "### @yorozu/utils") {
		t.Fatalf("stdout=%q", stdout)
	}
	if !strings.Contains(stdout, "feat: add utils export") {
		t.Fatalf("stdout=%q", stdout)
	}
	if strings.Contains(stdout, "chore: initial") {
		t.Fatalf("included chore: %q", stdout)
	}
}

func runCmd(t *testing.T, args ...string) (stdout, stderr string, code int) {
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
	code = cli.Run(args)
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

func initVersioningRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	gitRunCLI(t, dir, "init", "-b", "main")
	gitRunCLI(t, dir, "config", "user.email", "test@example.com")
	gitRunCLI(t, dir, "config", "user.name", "Test")
	gitRunCLI(t, dir, "config", "commit.gpgsign", "false")
	return dir
}

func writeVersioningWorkspace(t *testing.T, dir string) {
	t.Helper()
	writeWorkspace(t, dir, map[string]string{
		"package.json":                "{\n  \"name\": \"yorozu\",\n  \"version\": \"0.1.0\",\n  \"private\": true\n}\n",
		"packages/utils/package.json": "{\n  \"name\": \"@yorozu/utils\",\n  \"version\": \"0.1.0\"\n}\n",
		"packages/utils/index.ts":     "export {}\n",
		"packages/io/package.json":    "{\n  \"name\": \"@yorozu/io\",\n  \"version\": \"0.1.0\"\n}\n",
		"packages/io/index.ts":        "export {}\n",
	})
}

func gitRunCLI(t *testing.T, dir string, args ...string) string {
	t.Helper()
	env := append(os.Environ(),
		"GIT_AUTHOR_NAME=Test",
		"GIT_AUTHOR_EMAIL=test@example.com",
		"GIT_COMMITTER_NAME=Test",
		"GIT_COMMITTER_EMAIL=test@example.com",
		"GIT_CONFIG_GLOBAL=/dev/null",
		"GIT_CONFIG_SYSTEM=/dev/null",
		"GIT_CONFIG_NOSYSTEM=1",
	)
	res, err := exec.Run(append([]string{"git"}, args...), exec.Options{
		Dir:          dir,
		Env:          env,
		ThrowOnError: true,
	})
	if err != nil {
		t.Fatalf("git %v: %v\nstderr=%s\nstdout=%s", args, err, res.Stderr, res.Stdout)
	}
	return strings.TrimSpace(res.Stdout)
}

func writeFileCLI(t *testing.T, path, contents string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(contents), 0o644); err != nil {
		t.Fatal(err)
	}
}

func readFileCLI(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

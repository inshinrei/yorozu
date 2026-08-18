package cli_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestBuildMissingRootValue(t *testing.T) {
	_, stderr, code := runCmd(t, "build", "--root")
	if code != 2 {
		t.Fatalf("exit %d stderr=%q", code, stderr)
	}
	if !strings.Contains(stderr, "missing --root value") {
		t.Fatalf("stderr=%q", stderr)
	}
}

func TestPublishMissingRootValue(t *testing.T) {
	_, stderr, code := runCmd(t, "publish", "--root")
	if code != 2 {
		t.Fatalf("exit %d stderr=%q", code, stderr)
	}
	if !strings.Contains(stderr, "missing --root value") {
		t.Fatalf("stderr=%q", stderr)
	}
}

func TestBuildCommandRegistered(t *testing.T) {
	_, stderr, code := runCmd(t, "build", "--root", t.TempDir())
	if code == 2 && strings.Contains(stderr, "unknown command") {
		t.Fatalf("build not registered: %s", stderr)
	}
}

func TestPublishDryRunAndFailures(t *testing.T) {
	t.Setenv("GITHUB_ACTIONS", "")
	os.Unsetenv("GITHUB_ACTIONS")
	root := t.TempDir()
	writeWorkspace(t, root, map[string]string{
		"packages/a/package.json":      `{"name":"pkg-a","version":"1.0.0"}`,
		"packages/a/dist/package.json": `{"name":"pkg-a","version":"1.0.0"}`,
	})
	dir := t.TempDir()
	logPath := filepath.Join(dir, "npm.log")
	script := "#!/bin/sh\nprintf 'PWD=%s CMD=%s\\n' \"$PWD\" \"$*\" >> " + "'" + logPath + "'" + "\nexit 0\n"
	if err := os.WriteFile(filepath.Join(dir, "npm"), []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "npx"), []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))

	stdout, stderr, code := runCmd(t, "publish", "--root", root, "--dry-run")
	if code != 0 {
		t.Fatalf("exit %d stderr=%q stdout=%q", code, stderr, stdout)
	}
	log := readFileCLI(t, logPath)
	if !strings.Contains(log, "--dry-run") {
		t.Fatalf("log=%s", log)
	}
	if !strings.Contains(stdout, "publishing pkg-a@1.0.0") {
		t.Fatalf("stdout=%q", stdout)
	}
}

func TestPublishFailedPrintsNames(t *testing.T) {
	t.Setenv("GITHUB_ACTIONS", "")
	os.Unsetenv("GITHUB_ACTIONS")
	root := t.TempDir()
	writeWorkspace(t, root, map[string]string{
		"packages/a/package.json":      `{"name":"pkg-a","version":"1.0.0"}`,
		"packages/a/dist/package.json": `{"name":"pkg-a","version":"1.0.0"}`,
	})
	dir := t.TempDir()
	script := "#!/bin/sh\ncmd=$1\n[ \"$1\" = \"--userconfig\" ] && cmd=$3\nif [ \"$cmd\" = publish ]; then exit 1; fi\nexit 0\n"
	if err := os.WriteFile(filepath.Join(dir, "npm"), []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))

	stdout, stderr, code := runCmd(t, "publish", "--root", root, "--skip-version-check")
	if code != 1 {
		t.Fatalf("exit %d stderr=%q stdout=%q", code, stderr, stdout)
	}
	if !strings.Contains(stdout, "failed to publish:") || !strings.Contains(stdout, "  pkg-a") {
		t.Fatalf("stdout=%q", stdout)
	}
}

func TestPublishTarballsListed(t *testing.T) {
	t.Setenv("GITHUB_ACTIONS", "")
	os.Unsetenv("GITHUB_ACTIONS")
	root := t.TempDir()
	writeWorkspace(t, root, map[string]string{
		"packages/a/package.json":      `{"name":"pkg-a","version":"1.0.0"}`,
		"packages/a/dist/package.json": `{"name":"pkg-a","version":"1.0.0"}`,
	})
	dir := t.TempDir()
	script := `#!/bin/sh
cmd=$1
[ "$1" = "--userconfig" ] && cmd=$3
if [ "$cmd" = pack ]; then echo pkg-a-1.0.0.tgz; exit 0; fi
exit 0
`
	if err := os.WriteFile(filepath.Join(dir, "npm"), []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))

	stdout, stderr, code := runCmd(t, "publish", "--root", root, "--skip-version-check", "--with-tarballs")
	if code != 0 {
		t.Fatalf("exit %d stderr=%q stdout=%q", code, stderr, stdout)
	}
	if !strings.Contains(stdout, "tarballs generated:") {
		t.Fatalf("stdout=%q", stdout)
	}
	if !strings.Contains(stdout, "pkg-a-1.0.0.tgz") {
		t.Fatalf("stdout=%q", stdout)
	}

	outPath := filepath.Join(t.TempDir(), "gha")
	if err := os.WriteFile(outPath, nil, 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("GITHUB_ACTIONS", "true")
	t.Setenv("GITHUB_OUTPUT", outPath)
	stdout, stderr, code = runCmd(t, "publish", "--root", root, "--skip-version-check", "--with-tarballs", "--no-provenance")
	if code != 0 {
		t.Fatalf("gha exit %d stderr=%q stdout=%q", code, stderr, stdout)
	}
	if !strings.Contains(stdout, "written paths to tarballs to `tarballs` output") {
		t.Fatalf("stdout=%q", stdout)
	}
	gha := readFileCLI(t, outPath)
	if !strings.Contains(gha, "tarballs=") || !strings.Contains(gha, "pkg-a-1.0.0.tgz") {
		t.Fatalf("gha=%q", gha)
	}
}

func TestBuildWorkspaceLogsAndInvokesVite(t *testing.T) {
	root := t.TempDir()
	writeWorkspace(t, root, map[string]string{
		"packages/a/package.json": `{"name":"pkg-a","version":"1.0.0"}`,
	})
	dir := t.TempDir()
	logPath := filepath.Join(dir, "npx.log")
	script := "#!/bin/sh\nprintf '%s\\n' \"$*\" >> '" + logPath + "'\nexit 0\n"
	if err := os.WriteFile(filepath.Join(dir, "npx"), []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))

	stdout, stderr, code := runCmd(t, "build", "--root", root, "--fixed-version", "0.0.0-canary.1")
	if code != 0 {
		t.Fatalf("exit %d stderr=%q stdout=%q", code, stderr, stdout)
	}
	if !strings.Contains(stdout, "building pkg-a") {
		t.Fatalf("stdout=%q", stdout)
	}
	log := readFileCLI(t, logPath)
	if !strings.Contains(log, "vite build --config") {
		t.Fatalf("npx=%q", log)
	}
}

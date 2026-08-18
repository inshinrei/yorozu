package npm_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/npm"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/workspace"
)

func TestPublishDryRunSkipsWhoamiAndPassesDryRun(t *testing.T) {
	root, pkgs := writePublishWorkspace(t, "pkg-a", "1.0.0")
	logPath := installNPMStub(t, 0)

	res, err := npm.Publish(npm.PublishOpts{
		WorkspaceRoot: root,
		Workspace:     pkgs,
		Packages:      []string{":all"},
		DryRun:        true,
		Token:         "should-not-write-npmrc",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Failed) != 0 {
		t.Fatalf("failed=%v", res.Failed)
	}
	log := readFile(t, logPath)
	if strings.Contains(log, "CMD=whoami") || strings.Contains(log, " whoami ") {
		t.Fatalf("whoami on dry-run: %s", log)
	}
	if !strings.Contains(log, "--dry-run") {
		t.Fatalf("missing --dry-run: %s", log)
	}
	if strings.Contains(log, " -q") || strings.Contains(log, "CMD=-q") {
		t.Fatalf("quiet on dry-run: %s", log)
	}
	if strings.Contains(log, "--userconfig") {
		t.Fatalf("auth written on dry-run: %s", log)
	}
}

func TestPublishSkipsAlreadyPublished(t *testing.T) {
	root, pkgs := writePublishWorkspace(t, "pkg-a", "1.0.0")
	srv := versionServer(t, map[string]int{"/pkg-a/1.0.0": 200})
	logPath := installNPMStub(t, 0)

	res, err := npm.Publish(npm.PublishOpts{
		WorkspaceRoot: root,
		Workspace:     pkgs,
		Packages:      []string{":all"},
		RegistryURL:   srv.URL,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Failed) != 0 {
		t.Fatalf("failed=%v", res.Failed)
	}
	log := readFile(t, logPath)
	if strings.Contains(log, "CMD=publish") {
		t.Fatalf("published already-released: %s", log)
	}
}

func TestPublishUnpublishExisting(t *testing.T) {
	root, pkgs := writePublishWorkspace(t, "pkg-a", "1.0.0")
	srv := versionServer(t, map[string]int{"/pkg-a/1.0.0": 200})
	logPath := installNPMStub(t, 0)

	res, err := npm.Publish(npm.PublishOpts{
		WorkspaceRoot:     root,
		Workspace:         pkgs,
		Packages:          []string{":all"},
		RegistryURL:       srv.URL,
		UnpublishExisting: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Failed) != 0 {
		t.Fatalf("failed=%v", res.Failed)
	}
	log := readFile(t, logPath)
	if !strings.Contains(log, "CMD=unpublish") || !strings.Contains(log, "pkg-a@1.0.0") {
		t.Fatalf("unpublish: %s", log)
	}
	if !strings.Contains(log, "CMD=publish") {
		t.Fatalf("publish after unpublish: %s", log)
	}
}

func TestPublishScopedAddsAccessPublic(t *testing.T) {
	root, pkgs := writePublishWorkspace(t, "@scope/pkg", "1.0.0")
	logPath := installNPMStub(t, 0)

	_, err := npm.Publish(npm.PublishOpts{
		WorkspaceRoot:    root,
		Workspace:        pkgs,
		Packages:         []string{":all"},
		SkipVersionCheck: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	log := readFile(t, logPath)
	if !strings.Contains(log, "--access=public") {
		t.Fatalf("access: %s", log)
	}
}

func TestPublishProvenanceOnGHADefaultRegistry(t *testing.T) {
	root, pkgs := writePublishWorkspace(t, "pkg-a", "1.0.0")
	logPath := installNPMStub(t, 0)
	t.Setenv("GITHUB_ACTIONS", "true")
	t.Setenv("ACTIONS_ID_TOKEN_REQUEST_URL", "https://example.test/token")

	_, err := npm.Publish(npm.PublishOpts{
		WorkspaceRoot:    root,
		Workspace:        pkgs,
		Packages:         []string{":all"},
		SkipVersionCheck: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	log := readFile(t, logPath)
	if !strings.Contains(log, "--provenance") {
		t.Fatalf("provenance: %s", log)
	}
}

func TestPublishNoProvenanceAndExistingFlag(t *testing.T) {
	root, pkgs := writePublishWorkspace(t, "pkg-a", "1.0.0")
	logPath := installNPMStub(t, 0)
	t.Setenv("GITHUB_ACTIONS", "true")
	t.Setenv("ACTIONS_ID_TOKEN_REQUEST_URL", "https://example.test/token")

	_, err := npm.Publish(npm.PublishOpts{
		WorkspaceRoot:    root,
		Workspace:        pkgs,
		Packages:         []string{":all"},
		SkipVersionCheck: true,
		NoProvenance:     true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(readFile(t, logPath), "--provenance") {
		t.Fatal("no-provenance still added")
	}
}

func TestPublishFixedVersionRewritesDist(t *testing.T) {
	root, pkgs := writePublishWorkspace(t, "pkg-a", "1.0.0")
	installNPMStub(t, 0)

	_, err := npm.Publish(npm.PublishOpts{
		WorkspaceRoot:    root,
		Workspace:        pkgs,
		Packages:         []string{":all"},
		SkipVersionCheck: true,
		FixedVersion:     "0.0.0-canary.1",
	})
	if err != nil {
		t.Fatal(err)
	}
	dist := readFile(t, filepath.Join(pkgs[1].Path, "dist", "package.json"))
	var obj map[string]any
	if err := json.Unmarshal([]byte(dist), &obj); err != nil {
		t.Fatal(err)
	}
	if obj["version"] != "0.0.0-canary.1" {
		t.Fatalf("version=%v body=%s", obj["version"], dist)
	}
	if !strings.Contains(dist, "    ") {
		t.Fatalf("expected indent 4: %s", dist)
	}
}

func TestPublishNameFilter(t *testing.T) {
	root := t.TempDir()
	a := writeNamedPkg(t, root, "pkg-a", "1.0.0")
	b := writeNamedPkg(t, root, "pkg-b", "1.0.0")
	pkgs := []workspace.Package{
		{Path: root, Root: true, JSON: workspace.PackageJSON{Name: "ws", Version: "1.0.0"}},
		a, b,
	}
	logPath := installNPMStub(t, 0)

	_, err := npm.Publish(npm.PublishOpts{
		WorkspaceRoot:    root,
		Workspace:        pkgs,
		Packages:         []string{"pkg-b"},
		SkipVersionCheck: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	log := readFile(t, logPath)
	if !strings.Contains(log, filepath.Join(b.Path, "dist")) {
		t.Fatalf("expected pkg-b: %s", log)
	}
	if strings.Count(log, "CMD=publish") != 1 {
		t.Fatalf("publish count: %s", log)
	}
}

func TestPublishFailedCollectsNames(t *testing.T) {
	root, pkgs := writePublishWorkspace(t, "pkg-a", "1.0.0")
	installNPMStub(t, 1)

	res, err := npm.Publish(npm.PublishOpts{
		WorkspaceRoot:    root,
		Workspace:        pkgs,
		Packages:         []string{":all"},
		SkipVersionCheck: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Failed) != 1 || res.Failed[0] != "pkg-a" {
		t.Fatalf("failed=%v", res.Failed)
	}
}

func TestPublishTarballs(t *testing.T) {
	root, pkgs := writePublishWorkspace(t, "pkg-a", "1.0.0")
	installNPMStub(t, 0)

	res, err := npm.Publish(npm.PublishOpts{
		WorkspaceRoot:    root,
		Workspace:        pkgs,
		Packages:         []string{":all"},
		SkipVersionCheck: true,
		WithTarballs:     true,
	})
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(pkgs[1].Path, "dist", "pkg-a-1.0.0.tgz")
	if len(res.Tarballs) != 1 || res.Tarballs[0] != want {
		t.Fatalf("tarballs=%v want %s", res.Tarballs, want)
	}
}

func TestPublishWithBuildScript(t *testing.T) {
	root, pkgs := writePublishWorkspace(t, "pkg-a", "1.0.0")
	pkgs[1].JSON.Scripts = map[string]string{"build": "echo hi"}
	logPath := installNPMStub(t, 0)

	_, err := npm.Publish(npm.PublishOpts{
		WorkspaceRoot:    root,
		Workspace:        pkgs,
		Packages:         []string{":all"},
		SkipVersionCheck: true,
		WithBuild:        true,
	})
	if err != nil {
		t.Fatal(err)
	}
	log := readFile(t, logPath)
	if !strings.Contains(log, "CMD=run build") {
		t.Fatalf("build script: %s", log)
	}
}

func writePublishWorkspace(t *testing.T, name, version string) (string, []workspace.Package) {
	t.Helper()
	root := t.TempDir()
	pkg := writeNamedPkg(t, root, name, version)
	return root, []workspace.Package{
		{Path: root, Root: true, JSON: workspace.PackageJSON{Name: "ws", Version: "1.0.0"}},
		pkg,
	}
}

func writeNamedPkg(t *testing.T, root, name, version string) workspace.Package {
	t.Helper()
	dir := filepath.Join(root, "packages", strings.ReplaceAll(strings.TrimPrefix(name, "@"), "/", "-"))
	dist := filepath.Join(dir, "dist")
	if err := os.MkdirAll(dist, 0o755); err != nil {
		t.Fatal(err)
	}
	pkgJSON := `{"name":"` + name + `","version":"` + version + `"}`
	writeFile(t, filepath.Join(dir, "package.json"), pkgJSON)
	writeFile(t, filepath.Join(dist, "package.json"), pkgJSON)
	return workspace.Package{
		Path:            dir,
		PackageJSONPath: filepath.Join(dir, "package.json"),
		JSON:            workspace.PackageJSON{Name: name, Version: version},
	}
}

func versionServer(t *testing.T, codes map[string]int) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if code, ok := codes[r.URL.Path]; ok {
			w.WriteHeader(code)
			_, _ = io.WriteString(w, `{}`)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func installNPMStub(t *testing.T, publishExit int) string {
	t.Helper()
	dir := t.TempDir()
	logPath := filepath.Join(dir, "npm.log")
	script := `#!/bin/sh
log=` + shellQuote(logPath) + `
printf 'PWD=%s CMD=%s\n' "$PWD" "$*" >> "$log"
cmd=""
for arg in "$@"; do
  if [ "$arg" != "--userconfig" ] && [ "$prev" != "--userconfig" ]; then
    if [ -z "$cmd" ]; then cmd=$arg; fi
  fi
  prev=$arg
done
case "$cmd" in
  whoami) echo user; exit 0 ;;
  publish) exit ` + itoa(publishExit) + ` ;;
  unpublish) exit 0 ;;
  pack) echo pkg-a-1.0.0.tgz; exit 0 ;;
  run) exit 0 ;;
esac
exit 0
`
	if err := os.WriteFile(filepath.Join(dir, "npm"), []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "npx"), []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))
	return logPath
}

func writeFile(t *testing.T, path, contents string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(contents), 0o644); err != nil {
		t.Fatal(err)
	}
}

func readFile(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'"'"'`) + "'"
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	return "1"
}

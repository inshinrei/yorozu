package build_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/build"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/workspace"
)

func TestResolveViteConfigReturnsConfiguredWithoutFilesystem(t *testing.T) {
	dir := t.TempDir()
	got, err := build.ResolveViteConfig(dir, "custom.config.ts")
	if err != nil {
		t.Fatal(err)
	}
	if got != "custom.config.ts" {
		t.Fatalf("got %q", got)
	}
}

func TestResolveViteConfigPrefersTsOverJs(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "vite.config.ts"), "export default {}\n")
	writeFile(t, filepath.Join(dir, "vite.config.js"), "export default {}\n")
	got, err := build.ResolveViteConfig(dir, "")
	if err != nil {
		t.Fatal(err)
	}
	if got != "vite.config.ts" {
		t.Fatalf("got %q", got)
	}
}

func TestResolveViteConfigFallsBackToJs(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "vite.config.js"), "export default {}\n")
	got, err := build.ResolveViteConfig(dir, "")
	if err != nil {
		t.Fatal(err)
	}
	if got != "vite.config.js" {
		t.Fatalf("got %q", got)
	}
}

func TestResolveViteConfigDefaultsToTsWhenNeitherExists(t *testing.T) {
	dir := t.TempDir()
	got, err := build.ResolveViteConfig(dir, "")
	if err != nil {
		t.Fatal(err)
	}
	if got != "vite.config.ts" {
		t.Fatalf("got %q", got)
	}
}

func TestResolveViteConfigEmptyConfiguredLooksAtFilesystem(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "vite.config.js"), "export default {}\n")
	got, err := build.ResolveViteConfig(dir, "")
	if err != nil {
		t.Fatal(err)
	}
	if got != "vite.config.js" {
		t.Fatalf("got %q", got)
	}
}

func TestPackageSetsInternalEnvAndRunsVite(t *testing.T) {
	root := writeBuildWorkspace(t)
	logPath := installBinStubs(t, map[string]string{
		"npx": `#!/bin/sh
printf '%s\n' "PWD=$PWD"
printf '%s\n' "ARGS=$*"
printf '%s\n' "LIST=$__YOROZU_INTERNAL_PACKAGES_LIST"
printf '%s\n' "FIXED=$__YOROZU_INTERNAL_FIXED_VERSION"
`,
	})

	err := build.Package(build.PackageOpts{
		WorkspaceRoot: root,
		PackageName:   "pkg-a",
		FixedVersion:  "0.0.0-canary.1",
	})
	if err != nil {
		t.Fatal(err)
	}

	dump := readFile(t, logPath)
	if !strings.Contains(dump, "ARGS=vite build --config "+filepath.Join(root, "vite.config.ts")) {
		t.Fatalf("args: %s", dump)
	}
	pkgRoot := resolvePath(t, filepath.Join(root, "packages", "a"))
	if !strings.Contains(dump, "PWD="+pkgRoot) {
		t.Fatalf("cwd: %s", dump)
	}
	if !strings.Contains(dump, "FIXED=0.0.0-canary.1") {
		t.Fatalf("fixed: %s", dump)
	}

	listLine := ""
	for _, line := range strings.Split(dump, "\n") {
		if strings.HasPrefix(line, "LIST=") {
			listLine = strings.TrimPrefix(line, "LIST=")
			break
		}
	}
	if listLine == "" {
		t.Fatalf("missing packages list: %s", dump)
	}
	var pkgs []map[string]any
	if err := json.Unmarshal([]byte(listLine), &pkgs); err != nil {
		t.Fatalf("list json: %v\n%s", err, listLine)
	}
	if len(pkgs) < 2 {
		t.Fatalf("pkgs=%d %s", len(pkgs), listLine)
	}
	var member map[string]any
	for _, pkg := range pkgs {
		jsonObj, _ := pkg["json"].(map[string]any)
		if jsonObj != nil && jsonObj["name"] == "pkg-a" {
			member = pkg
			break
		}
	}
	if member == nil {
		t.Fatalf("pkg-a missing: %s", listLine)
	}
	for _, key := range []string{"path", "packageJsonPath", "root", "json"} {
		if _, ok := member[key]; !ok {
			t.Fatalf("missing %s in %v", key, member)
		}
	}
	jsonObj := member["json"].(map[string]any)
	exports, _ := jsonObj["exports"].(map[string]any)
	if exports["."] != "./src/index.ts" {
		t.Fatalf("exports not preserved: %v", jsonObj)
	}
	if member["root"] != false {
		t.Fatalf("root=%v", member["root"])
	}
}

func TestWorkspaceBuildsNpmPackagesInOrder(t *testing.T) {
	root := writeBuildWorkspace(t)
	logPath := installBinStubs(t, map[string]string{
		"npx": `#!/bin/sh
printf '%s\n' "BUILD=$PWD"
`,
	})

	err := build.Workspace(root, "9.9.9")
	if err != nil {
		t.Fatal(err)
	}
	dump := readFile(t, logPath)
	if !strings.Contains(dump, filepath.Join(root, "packages", "a")) {
		t.Fatalf("did not build pkg-a: %s", dump)
	}
	if strings.Contains(dump, filepath.Join(root, "packages", "jsr-only")) {
		t.Fatalf("built jsr-only: %s", dump)
	}
}

func writeBuildWorkspace(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "package.json"), `{"name":"ws","private":true,"version":"1.0.0"}`)
	writeFile(t, filepath.Join(root, "pnpm-workspace.yaml"), "packages:\n  - \"packages/*\"\n")
	writeFile(t, filepath.Join(root, "packages", "a", "package.json"), `{
  "name": "pkg-a",
  "version": "1.0.0",
  "exports": { ".": "./src/index.ts" }
}`)
	writeFile(t, filepath.Join(root, "packages", "jsr-only", "package.json"), `{
  "name": "pkg-jsr",
  "version": "1.0.0",
  "yorozu": { "jsr": "only" }
}`)
	return root
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

func installBinStubs(t *testing.T, scripts map[string]string) string {
	t.Helper()
	dir := t.TempDir()
	logPath := filepath.Join(dir, "stub.log")
	for name, body := range scripts {
		path := filepath.Join(dir, name)
		script := "#!/bin/sh\nexec >>" + shellQuote(logPath) + " 2>&1\n" + body
		if err := os.WriteFile(path, []byte(script), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	t.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))
	return logPath
}

func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'"'"'`) + "'"
}

func resolvePath(t *testing.T, path string) string {
	t.Helper()
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		return path
	}
	return resolved
}

func TestWorkspaceLogsBuilding(t *testing.T) {
	root := writeBuildWorkspace(t)
	installBinStubs(t, map[string]string{
		"npx": "#!/bin/sh\nexit 0\n",
	})

	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	old := os.Stdout
	os.Stdout = w
	err = build.Workspace(root, "")
	w.Close()
	os.Stdout = old
	if err != nil {
		t.Fatal(err)
	}
	buf := make([]byte, 4096)
	n, _ := r.Read(buf)
	got := string(buf[:n])
	if !strings.Contains(got, "building pkg-a") {
		t.Fatalf("stdout=%q", got)
	}
}

func TestPackageUsesProvidedWorkspace(t *testing.T) {
	root := t.TempDir()
	pkgDir := filepath.Join(root, "pkg")
	if err := os.MkdirAll(pkgDir, 0o755); err != nil {
		t.Fatal(err)
	}
	logPath := installBinStubs(t, map[string]string{
		"npx": `#!/bin/sh
printf '%s\n' "PWD=$PWD"
printf '%s\n' "LIST=$__YOROZU_INTERNAL_PACKAGES_LIST"
`,
	})
	pkgs := []workspace.Package{
		{
			Path:            root,
			PackageJSONPath: filepath.Join(root, "package.json"),
			Root:            true,
			JSON:            workspace.PackageJSON{Name: "ws", Version: "1.0.0"},
		},
		{
			Path:            pkgDir,
			PackageJSONPath: filepath.Join(pkgDir, "package.json"),
			Root:            false,
			JSON:            workspace.PackageJSON{Name: "provided", Version: "2.0.0"},
		},
	}
	if err := build.Package(build.PackageOpts{
		WorkspaceRoot: root,
		Workspace:     pkgs,
		PackageName:   "provided",
	}); err != nil {
		t.Fatal(err)
	}
	dump := readFile(t, logPath)
	if !strings.Contains(dump, "PWD="+resolvePath(t, pkgDir)) {
		t.Fatalf("cwd: %s", dump)
	}
	if !strings.Contains(dump, `"name":"provided"`) && !strings.Contains(dump, `"name": "provided"`) {
		t.Fatalf("list: %s", dump)
	}
}

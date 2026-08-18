package versioning_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/exec"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/git"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/workspace"
)

func workspacePackage(json workspace.PackageJSON, extras workspace.Package) workspace.Package {
	name := json.Name
	if name == "" {
		name = "pkg"
	}
	pkg := workspace.Package{
		Path:            extras.Path,
		PackageJSONPath: extras.PackageJSONPath,
		Root:            extras.Root,
		JSON:            json,
	}
	if pkg.Path == "" {
		pkg.Path = "/tmp/" + name
	}
	if pkg.PackageJSONPath == "" {
		pkg.PackageJSONPath = filepath.Join(pkg.Path, "package.json")
	}
	return pkg
}

func lockedWorkspace() (root, utils, io, fetch, own workspace.Package, ws []workspace.Package) {
	root = workspacePackage(workspace.PackageJSON{Name: "yorozu", Version: "0.1.0"}, workspace.Package{
		Root: true,
		Path: "/tmp/ws",
	})
	utils = workspacePackage(workspace.PackageJSON{Name: "@yorozu/utils", Version: "0.1.0"}, workspace.Package{
		Path: "/tmp/ws/packages/utils",
	})
	io = workspacePackage(workspace.PackageJSON{Name: "@yorozu/io", Version: "0.1.0"}, workspace.Package{
		Path: "/tmp/ws/packages/io",
	})
	fetch = workspacePackage(workspace.PackageJSON{
		Name:    "@yorozu/fetch",
		Version: "0.0.1",
		Yorozu:  &workspace.Yorozu{Standalone: true},
	}, workspace.Package{Path: "/tmp/ws/packages/_standalone/fetch"})
	own = workspacePackage(workspace.PackageJSON{
		Name:    "@yorozu/legacy",
		Version: "9.9.9",
		Yorozu:  &workspace.Yorozu{OwnVersioning: true},
	}, workspace.Package{Path: "/tmp/ws/packages/legacy"})
	ws = []workspace.Package{root, utils, io, fetch, own}
	return
}

func commit(message string, description string) git.Commit {
	return git.Commit{
		Hash:        "abc1234",
		Author:      git.Person{Name: "a", Email: "a@b.c", Date: time.Unix(0, 0).UTC()},
		Committer:   git.Person{Name: "a", Email: "a@b.c", Date: time.Unix(0, 0).UTC()},
		Message:     message,
		Description: description,
	}
}

func pkgByName(ws []workspace.Package, name string) workspace.Package {
	for _, pkg := range ws {
		if pkg.JSON.Name == name {
			return pkg
		}
	}
	panic("missing package " + name)
}

func initRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	gitRun(t, dir, "init", "-b", "main")
	gitRun(t, dir, "config", "user.email", "test@example.com")
	gitRun(t, dir, "config", "user.name", "Test")
	gitRun(t, dir, "config", "commit.gpgsign", "false")
	return dir
}

func gitRun(t *testing.T, dir string, args ...string) string {
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

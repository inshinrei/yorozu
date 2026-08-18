package versioning_test

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/versioning"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/workspace"
)

func TestGenerateChangelog(t *testing.T) {
	t.Run("groups conventional commits per package and skips chore by default", func(t *testing.T) {
		dir, since, ws := setupChangelogRepo(t)
		changelog, err := versioning.Generate(versioning.ChangelogOpts{
			Workspace: ws,
			Cwd:       dir,
			Since:     since,
		})
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(changelog, "### @yorozu/utils") {
			t.Fatalf("missing utils header: %q", changelog)
		}
		if !strings.Contains(changelog, "feat: add utils export") {
			t.Fatalf("missing feat: %q", changelog)
		}
		if !strings.Contains(changelog, "### @yorozu/io") {
			t.Fatalf("missing io header: %q", changelog)
		}
		if !strings.Contains(changelog, "fix: tweak io export") {
			t.Fatalf("missing fix: %q", changelog)
		}
		if strings.Contains(changelog, "chore: format utils") {
			t.Fatalf("included chore: %q", changelog)
		}
		if strings.Contains(changelog, "chore: initial") {
			t.Fatalf("included initial: %q", changelog)
		}
	})
}

func setupChangelogRepo(t *testing.T) (dir, since string, ws []workspace.Package) {
	t.Helper()
	dir = initRepo(t)
	utilsDir := filepath.Join(dir, "packages", "utils")
	ioDir := filepath.Join(dir, "packages", "io")
	writeFile(t, filepath.Join(utilsDir, "package.json"), "{\"name\":\"@yorozu/utils\",\"version\":\"0.1.0\"}\n")
	writeFile(t, filepath.Join(ioDir, "package.json"), "{\"name\":\"@yorozu/io\",\"version\":\"0.1.0\"}\n")
	writeFile(t, filepath.Join(utilsDir, "index.ts"), "export {}\n")
	writeFile(t, filepath.Join(ioDir, "index.ts"), "export {}\n")
	gitRun(t, dir, "add", ".")
	gitRun(t, dir, "commit", "-m", "chore: initial")
	since = gitRun(t, dir, "rev-parse", "HEAD")

	writeFile(t, filepath.Join(utilsDir, "index.ts"), "export const n = 1\n")
	gitRun(t, dir, "add", ".")
	gitRun(t, dir, "commit", "-m", "feat: add utils export")

	writeFile(t, filepath.Join(ioDir, "index.ts"), "export const n = 2\n")
	gitRun(t, dir, "add", ".")
	gitRun(t, dir, "commit", "-m", "fix: tweak io export")

	writeFile(t, filepath.Join(utilsDir, "index.ts"), "export const n = 3\n")
	gitRun(t, dir, "add", ".")
	gitRun(t, dir, "commit", "-m", "chore: format utils")

	ws = []workspace.Package{
		workspacePackage(workspace.PackageJSON{Name: "yorozu", Version: "0.1.0"}, workspace.Package{Path: dir, Root: true}),
		workspacePackage(workspace.PackageJSON{Name: "@yorozu/utils", Version: "0.1.0"}, workspace.Package{Path: utilsDir}),
		workspacePackage(workspace.PackageJSON{Name: "@yorozu/io", Version: "0.1.0"}, workspace.Package{Path: ioDir}),
	}
	return dir, since, ws
}

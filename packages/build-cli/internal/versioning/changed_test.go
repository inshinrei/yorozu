package versioning_test

import (
	"path/filepath"
	"reflect"
	"testing"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/versioning"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/workspace"
)

func TestFindProjectChangedPackages(t *testing.T) {
	t.Run("returns packages with source changes and excludes unit tests and markdown by default", func(t *testing.T) {
		dir := initRepo(t)
		utilsDir := filepath.Join(dir, "packages", "utils")
		ioDir := filepath.Join(dir, "packages", "io")
		writeFile(t, filepath.Join(utilsDir, "index.ts"), "export {}\n")
		writeFile(t, filepath.Join(ioDir, "index.ts"), "export {}\n")
		gitRun(t, dir, "add", ".")
		gitRun(t, dir, "commit", "-m", "chore: initial")
		since := gitRun(t, dir, "rev-parse", "HEAD")

		writeFile(t, filepath.Join(utilsDir, "index.ts"), "export const n = 1\n")
		writeFile(t, filepath.Join(utilsDir, "index.unit.ts"), "export {}\n")
		writeFile(t, filepath.Join(utilsDir, "notes.md"), "# notes\n")
		writeFile(t, filepath.Join(ioDir, "readme.md"), "# io\n")
		gitRun(t, dir, "add", ".")
		gitRun(t, dir, "commit", "-m", "feat: change files")

		ws := []workspace.Package{
			workspacePackage(workspace.PackageJSON{Name: "yorozu", Version: "0.1.0"}, workspace.Package{Path: dir, Root: true}),
			workspacePackage(workspace.PackageJSON{Name: "@yorozu/utils", Version: "0.1.0"}, workspace.Package{Path: utilsDir}),
			workspacePackage(workspace.PackageJSON{Name: "@yorozu/io", Version: "0.1.0"}, workspace.Package{Path: ioDir}),
		}

		files, err := versioning.FindChangedFiles(versioning.ChangedOpts{
			Workspace: ws,
			Root:      dir,
			Since:     since,
		})
		if err != nil {
			t.Fatal(err)
		}
		gotFiles := make([]string, 0, len(files))
		for _, file := range files {
			gotFiles = append(gotFiles, file.Package.JSON.Name+":"+file.File)
		}
		if !reflect.DeepEqual(gotFiles, []string{"@yorozu/utils:index.ts"}) {
			t.Fatalf("files=%v", gotFiles)
		}

		packages, err := versioning.FindChangedPackages(versioning.ChangedOpts{
			Workspace: ws,
			Root:      dir,
			Since:     since,
		})
		if err != nil {
			t.Fatal(err)
		}
		gotPkgs := make([]string, 0, len(packages))
		for _, pkg := range packages {
			gotPkgs = append(gotPkgs, pkg.JSON.Name)
		}
		if !reflect.DeepEqual(gotPkgs, []string{"@yorozu/utils"}) {
			t.Fatalf("packages=%v", gotPkgs)
		}
	})

	t.Run("includes .ts files when there is no tsconfig instead of throwing", func(t *testing.T) {
		dir := initRepo(t)
		utilsDir := filepath.Join(dir, "packages", "utils")
		writeFile(t, filepath.Join(utilsDir, "index.ts"), "export {}\n")
		gitRun(t, dir, "add", ".")
		gitRun(t, dir, "commit", "-m", "chore: initial")
		since := gitRun(t, dir, "rev-parse", "HEAD")

		writeFile(t, filepath.Join(utilsDir, "index.ts"), "export const n = 1\n")
		gitRun(t, dir, "add", ".")
		gitRun(t, dir, "commit", "-m", "feat: change files")

		ws := []workspace.Package{
			workspacePackage(workspace.PackageJSON{Name: "yorozu", Version: "0.1.0"}, workspace.Package{Path: dir, Root: true}),
			workspacePackage(workspace.PackageJSON{Name: "@yorozu/utils", Version: "0.1.0"}, workspace.Package{Path: utilsDir}),
		}

		files, err := versioning.FindChangedFiles(versioning.ChangedOpts{
			Workspace: ws,
			Root:      dir,
			Since:     since,
		})
		if err != nil {
			t.Fatal(err)
		}
		gotFiles := make([]string, 0, len(files))
		for _, file := range files {
			gotFiles = append(gotFiles, file.Package.JSON.Name+":"+file.File)
		}
		if !reflect.DeepEqual(gotFiles, []string{"@yorozu/utils:index.ts"}) {
			t.Fatalf("files=%v", gotFiles)
		}
	})
}

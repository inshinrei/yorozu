package versioning_test

import (
	"path/filepath"
	"reflect"
	"sort"
	"testing"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/git"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/versioning"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/workspace"
)

func TestDetermineBumpType(t *testing.T) {
	t.Run("maps a breaking change on 0.0.x to patch", func(t *testing.T) {
		got, err := versioning.DetermineBumpType("0.0.3", []git.Commit{commit("feat!: explode", "")})
		if err != nil {
			t.Fatal(err)
		}
		if got != versioning.ReleasePatch {
			t.Fatalf("got %q", got)
		}
	})

	t.Run("maps a breaking change on 0.x.y (x > 0) to minor", func(t *testing.T) {
		got, err := versioning.DetermineBumpType("0.1.0", []git.Commit{commit("feat!: explode", "")})
		if err != nil {
			t.Fatal(err)
		}
		if got != versioning.ReleaseMinor {
			t.Fatalf("got %q", got)
		}
	})

	t.Run("maps feat on 0.x to patch", func(t *testing.T) {
		got, err := versioning.DetermineBumpType("0.1.0", []git.Commit{commit("feat: add thing", "")})
		if err != nil {
			t.Fatal(err)
		}
		if got != versioning.ReleasePatch {
			t.Fatalf("got %q", got)
		}
	})

	t.Run("maps feat on 1.x to minor and breaking 1.x to major", func(t *testing.T) {
		got, err := versioning.DetermineBumpType("1.2.3", []git.Commit{commit("feat: add thing", "")})
		if err != nil {
			t.Fatal(err)
		}
		if got != versioning.ReleaseMinor {
			t.Fatalf("feat got %q", got)
		}
		got, err = versioning.DetermineBumpType("1.2.3", []git.Commit{commit("feat!: explode", "")})
		if err != nil {
			t.Fatal(err)
		}
		if got != versioning.ReleaseMajor {
			t.Fatalf("breaking got %q", got)
		}
	})

	t.Run("maps everything else to patch", func(t *testing.T) {
		got, err := versioning.DetermineBumpType("1.2.3", []git.Commit{commit("fix: typo", "")})
		if err != nil {
			t.Fatal(err)
		}
		if got != versioning.ReleasePatch {
			t.Fatalf("fix got %q", got)
		}
		got, err = versioning.DetermineBumpType("0.1.0", nil)
		if err != nil {
			t.Fatal(err)
		}
		if got != versioning.ReleasePatch {
			t.Fatalf("empty got %q", got)
		}
	})

	t.Run("sees a BREAKING CHANGE footer in the commit body", func(t *testing.T) {
		got, err := versioning.DetermineBumpType("0.1.0", []git.Commit{
			commit("feat: change tags", "BREAKING CHANGE: tags are now vX.Y.Z"),
		})
		if err != nil {
			t.Fatal(err)
		}
		if got != versioning.ReleaseMinor {
			t.Fatalf("got %q", got)
		}
	})

	t.Run("throws on an invalid version", func(t *testing.T) {
		_, err := versioning.DetermineBumpType("nope", nil)
		if err == nil || err.Error() != "Invalid version: nope" {
			t.Fatalf("err=%v", err)
		}
	})
}

func TestBumpVersion(t *testing.T) {
	t.Run("bumps root 0.1.0 + minor to 0.2.0 on root, utils, and io; leaves standalone and ownVersioning alone", func(t *testing.T) {
		_, _, _, _, _, ws := lockedWorkspace()
		result, err := versioning.Bump(versioning.BumpOpts{
			Workspace: ws,
			Type:      "minor",
			Since:     "HEAD",
			DryRun:    true,
			WithRoot:  true,
		})
		if err != nil {
			t.Fatal(err)
		}
		if result.PreviousVersion != "0.1.0" {
			t.Fatalf("previousVersion=%q", result.PreviousVersion)
		}
		if result.NextVersion != "0.2.0" {
			t.Fatalf("nextVersion=%q", result.NextVersion)
		}
		if result.ReleaseType != versioning.ReleaseMinor {
			t.Fatalf("releaseType=%q", result.ReleaseType)
		}
		if result.HasBreaking {
			t.Fatal("hasBreaking")
		}
		if result.HasFeatures {
			t.Fatal("hasFeatures")
		}
		wantNext := map[string]string{
			"yorozu":        "0.2.0",
			"@yorozu/utils": "0.2.0",
			"@yorozu/io":    "0.2.0",
		}
		if !reflect.DeepEqual(result.NextVersions, wantNext) {
			t.Fatalf("nextVersions=%v", result.NextVersions)
		}
		gotNames := bumpPkgNames(result.Changed)
		sort.Strings(gotNames)
		if !reflect.DeepEqual(gotNames, []string{"@yorozu/io", "@yorozu/utils", "yorozu"}) {
			t.Fatalf("changed=%v", gotNames)
		}
		if pkgByName(ws, "yorozu").JSON.Version != "0.2.0" {
			t.Fatalf("root=%q", pkgByName(ws, "yorozu").JSON.Version)
		}
		if pkgByName(ws, "@yorozu/utils").JSON.Version != "0.2.0" {
			t.Fatalf("utils=%q", pkgByName(ws, "@yorozu/utils").JSON.Version)
		}
		if pkgByName(ws, "@yorozu/io").JSON.Version != "0.2.0" {
			t.Fatalf("io=%q", pkgByName(ws, "@yorozu/io").JSON.Version)
		}
		if pkgByName(ws, "@yorozu/fetch").JSON.Version != "0.0.1" {
			t.Fatalf("fetch=%q", pkgByName(ws, "@yorozu/fetch").JSON.Version)
		}
		if pkgByName(ws, "@yorozu/legacy").JSON.Version != "9.9.9" {
			t.Fatalf("own=%q", pkgByName(ws, "@yorozu/legacy").JSON.Version)
		}
	})

	t.Run("still writes the shared version onto yorozu.private packages", func(t *testing.T) {
		root := workspacePackage(workspace.PackageJSON{Name: "yorozu", Version: "0.1.0"}, workspace.Package{Root: true})
		secret := workspacePackage(workspace.PackageJSON{
			Name:    "@yorozu/secret",
			Version: "0.1.0",
			Yorozu:  &workspace.Yorozu{Private: true},
		}, workspace.Package{})
		ws := []workspace.Package{root, secret}
		result, err := versioning.Bump(versioning.BumpOpts{
			Workspace: ws,
			Type:      "patch",
			Since:     "HEAD",
			DryRun:    true,
		})
		if err != nil {
			t.Fatal(err)
		}
		if pkgByName(ws, "@yorozu/secret").JSON.Version != "0.1.1" {
			t.Fatalf("secret=%q", pkgByName(ws, "@yorozu/secret").JSON.Version)
		}
		if result.NextVersions["@yorozu/secret"] != "0.1.1" {
			t.Fatalf("nextVersions=%v", result.NextVersions)
		}
	})

	t.Run("throws if the root package.json has no version", func(t *testing.T) {
		root := workspacePackage(workspace.PackageJSON{Name: "yorozu"}, workspace.Package{Root: true})
		utils := workspacePackage(workspace.PackageJSON{Name: "@yorozu/utils", Version: "0.1.0"}, workspace.Package{})
		_, err := versioning.Bump(versioning.BumpOpts{
			Workspace: []workspace.Package{root, utils},
			Type:      "minor",
			Since:     "HEAD",
			DryRun:    true,
		})
		if err == nil || err.Error() != "Workspace root package.json is missing a version" {
			t.Fatalf("err=%v", err)
		}
	})

	t.Run("does not write package.json files when dryRun is true", func(t *testing.T) {
		dir := t.TempDir()
		pkgPath := filepath.Join(dir, "package.json")
		writeFile(t, pkgPath, "{\n  \"name\": \"@yorozu/utils\",\n  \"version\": \"0.1.0\"\n}\n")

		root := workspacePackage(workspace.PackageJSON{Name: "yorozu", Version: "0.1.0"}, workspace.Package{
			Root: true,
			Path: dir,
		})
		utils := workspacePackage(workspace.PackageJSON{Name: "@yorozu/utils", Version: "0.1.0"}, workspace.Package{
			Path:            dir,
			PackageJSONPath: pkgPath,
		})
		ws := []workspace.Package{root, utils}
		_, err := versioning.Bump(versioning.BumpOpts{
			Workspace: ws,
			Type:      "minor",
			Since:     "HEAD",
			DryRun:    true,
		})
		if err != nil {
			t.Fatal(err)
		}
		if got := readFile(t, pkgPath); got != "{\n  \"name\": \"@yorozu/utils\",\n  \"version\": \"0.1.0\"\n}\n" {
			t.Fatalf("file=%q", got)
		}
		if pkgByName(ws, "@yorozu/utils").JSON.Version != "0.2.0" {
			t.Fatalf("utils=%q", pkgByName(ws, "@yorozu/utils").JSON.Version)
		}
	})

	t.Run("writes the shared version and keeps the original indentation", func(t *testing.T) {
		dir := t.TempDir()
		rootPath := filepath.Join(dir, "package.json")
		utilsDir := filepath.Join(dir, "packages", "utils")
		utilsPath := filepath.Join(utilsDir, "package.json")
		writeFile(t, rootPath, "{\n  \"name\": \"yorozu\",\n  \"version\": \"0.1.0\"\n}\n")
		writeFile(t, utilsPath, "{\n  \"name\": \"@yorozu/utils\",\n  \"version\": \"0.1.0\"\n}\n")

		root := workspacePackage(workspace.PackageJSON{Name: "yorozu", Version: "0.1.0"}, workspace.Package{
			Root:            true,
			Path:            dir,
			PackageJSONPath: rootPath,
		})
		utils := workspacePackage(workspace.PackageJSON{Name: "@yorozu/utils", Version: "0.1.0"}, workspace.Package{
			Path:            utilsDir,
			PackageJSONPath: utilsPath,
		})
		_, err := versioning.Bump(versioning.BumpOpts{
			Workspace: []workspace.Package{root, utils},
			Type:      "minor",
			Since:     "HEAD",
			DryRun:    false,
			WithRoot:  true,
		})
		if err != nil {
			t.Fatal(err)
		}
		if got := readFile(t, rootPath); got != "{\n  \"name\": \"yorozu\",\n  \"version\": \"0.2.0\"\n}\n" {
			t.Fatalf("root file=%q", got)
		}
		if got := readFile(t, utilsPath); got != "{\n  \"name\": \"@yorozu/utils\",\n  \"version\": \"0.2.0\"\n}\n" {
			t.Fatalf("utils file=%q", got)
		}
	})

	t.Run("auto type uses every commit since `since` and still writes all managed packages", func(t *testing.T) {
		dir := initRepo(t)
		utilsDir := filepath.Join(dir, "packages", "utils")
		ioDir := filepath.Join(dir, "packages", "io")
		writeFile(t, filepath.Join(dir, "package.json"), "{\"name\":\"yorozu\",\"version\":\"0.1.0\"}\n")
		writeFile(t, filepath.Join(utilsDir, "index.ts"), "export {}\n")
		writeFile(t, filepath.Join(ioDir, "index.ts"), "export {}\n")
		gitRun(t, dir, "add", ".")
		gitRun(t, dir, "commit", "-m", "chore: initial")
		since := gitRun(t, dir, "rev-parse", "HEAD")

		writeFile(t, filepath.Join(utilsDir, "index.ts"), "export const n = 1\n")
		gitRun(t, dir, "add", ".")
		gitRun(t, dir, "commit", "-m", "feat: only utils changed")

		root := workspacePackage(workspace.PackageJSON{Name: "yorozu", Version: "0.1.0"}, workspace.Package{
			Root:            true,
			Path:            dir,
			PackageJSONPath: filepath.Join(dir, "package.json"),
		})
		utils := workspacePackage(workspace.PackageJSON{Name: "@yorozu/utils", Version: "0.1.0"}, workspace.Package{
			Path: utilsDir,
		})
		io := workspacePackage(workspace.PackageJSON{Name: "@yorozu/io", Version: "0.1.0"}, workspace.Package{
			Path: ioDir,
		})
		ws := []workspace.Package{root, utils, io}
		result, err := versioning.Bump(versioning.BumpOpts{
			Workspace: ws,
			Since:     since,
			Cwd:       dir,
			DryRun:    true,
			WithRoot:  true,
		})
		if err != nil {
			t.Fatal(err)
		}
		if result.ReleaseType != versioning.ReleasePatch {
			t.Fatalf("releaseType=%q", result.ReleaseType)
		}
		if !result.HasFeatures {
			t.Fatal("hasFeatures")
		}
		if result.HasBreaking {
			t.Fatal("hasBreaking")
		}
		if result.NextVersion != "0.1.1" {
			t.Fatalf("nextVersion=%q", result.NextVersion)
		}
		if pkgByName(ws, "@yorozu/utils").JSON.Version != "0.1.1" {
			t.Fatalf("utils=%q", pkgByName(ws, "@yorozu/utils").JSON.Version)
		}
		if pkgByName(ws, "@yorozu/io").JSON.Version != "0.1.1" {
			t.Fatalf("io=%q", pkgByName(ws, "@yorozu/io").JSON.Version)
		}
		if pkgByName(ws, "yorozu").JSON.Version != "0.1.1" {
			t.Fatalf("root=%q", pkgByName(ws, "yorozu").JSON.Version)
		}
	})

	t.Run("independently bumps a standalone package from its own tag when it has nested commits", func(t *testing.T) {
		dir := initRepo(t)
		utilsDir := filepath.Join(dir, "packages", "utils")
		fetchDir := filepath.Join(dir, "packages", "_standalone", "fetch")
		fetchSrc := filepath.Join(fetchDir, "src")
		writeFile(t, filepath.Join(dir, "package.json"), "{\"name\":\"yorozu\",\"version\":\"0.1.0\"}\n")
		writeFile(t, filepath.Join(utilsDir, "index.ts"), "export {}\n")
		writeFile(t, filepath.Join(fetchDir, "package.json"), "{\"name\":\"@yorozu/fetch\",\"version\":\"0.0.1\"}\n")
		writeFile(t, filepath.Join(fetchSrc, "index.ts"), "export {}\n")
		gitRun(t, dir, "add", ".")
		gitRun(t, dir, "commit", "-m", "chore: initial")
		gitRun(t, dir, "tag", "v0.0.1")

		writeFile(t, filepath.Join(fetchSrc, "client.ts"), "export const n = 1\n")
		gitRun(t, dir, "add", ".")
		gitRun(t, dir, "commit", "-m", "feat: add fetch client")

		root := workspacePackage(workspace.PackageJSON{Name: "yorozu", Version: "0.1.0"}, workspace.Package{
			Root:            true,
			Path:            dir,
			PackageJSONPath: filepath.Join(dir, "package.json"),
		})
		utils := workspacePackage(workspace.PackageJSON{Name: "@yorozu/utils", Version: "0.1.0"}, workspace.Package{
			Path: utilsDir,
		})
		fetch := workspacePackage(workspace.PackageJSON{
			Name:    "@yorozu/fetch",
			Version: "0.0.1",
			Yorozu:  &workspace.Yorozu{Standalone: true},
		}, workspace.Package{
			Path:            fetchDir,
			PackageJSONPath: filepath.Join(fetchDir, "package.json"),
		})
		ws := []workspace.Package{root, utils, fetch}
		result, err := versioning.Bump(versioning.BumpOpts{
			Workspace: ws,
			Type:      "major",
			Since:     "v0.0.1",
			Cwd:       dir,
			DryRun:    true,
			WithRoot:  true,
		})
		if err != nil {
			t.Fatal(err)
		}
		if result.NextVersion != "1.0.0" {
			t.Fatalf("nextVersion=%q", result.NextVersion)
		}
		if pkgByName(ws, "@yorozu/utils").JSON.Version != "1.0.0" {
			t.Fatalf("utils=%q", pkgByName(ws, "@yorozu/utils").JSON.Version)
		}
		if pkgByName(ws, "yorozu").JSON.Version != "1.0.0" {
			t.Fatalf("root=%q", pkgByName(ws, "yorozu").JSON.Version)
		}
		if pkgByName(ws, "@yorozu/fetch").JSON.Version != "0.0.2" {
			t.Fatalf("fetch=%q", pkgByName(ws, "@yorozu/fetch").JSON.Version)
		}
		if result.NextVersions["@yorozu/fetch"] != "0.0.2" {
			t.Fatalf("nextVersions=%v", result.NextVersions)
		}
		if result.HasFeatures {
			t.Fatal("hasFeatures")
		}
		if result.HasBreaking {
			t.Fatal("hasBreaking")
		}
	})
}

func bumpPkgNames(changed []versioning.BumpPkg) []string {
	out := make([]string, 0, len(changed))
	for _, item := range changed {
		out = append(out, item.Package.JSON.Name)
	}
	return out
}

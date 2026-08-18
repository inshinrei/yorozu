package cr

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/build"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/ci"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/config"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/exec"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/git"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/versioning"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/workspace"
)

type Options struct {
	WorkspaceRoot    string
	DistDir          string
	ExtraArgs        []string
	OnlyChanged      bool
	OnlyChangedSince string
}

func Run(opts Options) error {
	root := opts.WorkspaceRoot
	if root == "" {
		root = config.WorkspaceRoot()
	}
	ws, err := workspace.Collect(root, true)
	if err != nil {
		return err
	}
	distDir := opts.DistDir
	if distDir == "" {
		distDir = "dist"
	}

	var withoutRoot []workspace.Package
	for _, pkg := range ws {
		if !pkg.Root {
			withoutRoot = append(withoutRoot, pkg)
		}
	}
	packages := workspace.FilterForPublish(withoutRoot, "npm")

	if opts.OnlyChanged {
		cfg, err := config.Load(root)
		if err != nil {
			return err
		}
		var versioningCfg config.VersioningData
		if cfg != nil {
			versioningCfg = cfg.Versioning
		}
		since := opts.OnlyChangedSince
		if since == "" {
			since, err = git.LatestTag(root)
			if err != nil {
				return err
			}
		}
		if since == "" {
			return fmt.Errorf("no previous tag found, cannot determine changeset")
		}
		changed, err := versioning.FindChangedPackages(versioning.ChangedOpts{
			Workspace:  withoutRoot,
			Root:       root,
			Since:      since,
			Versioning: versioningCfg,
		})
		if err != nil {
			return err
		}
		if len(changed) == 0 {
			fmt.Fprintf(os.Stdout, "no packages changed since %s, nothing to do\n", since)
			return nil
		}
		packages = SelectChangedNpm(packages, changed)
		if len(packages) == 0 {
			fmt.Fprintf(os.Stdout, "no packages changed since %s, nothing to do\n", since)
			return nil
		}
		fmt.Fprintf(os.Stdout, "only publishing changed packages since %s:\n", since)
		for _, pkg := range packages {
			fmt.Fprintf(os.Stdout, "  - %s\n", pkg.JSON.Name)
		}
	}

	if !ci.Running() {
		return fmt.Errorf("cr command is only supported in github actions")
	}

	var distPaths []string
	for _, pkg := range packages {
		if pkg.JSON.Scripts != nil && pkg.JSON.Scripts["build"] != "" {
			if _, err := exec.Run([]string{"npm", "run", "build"}, exec.Options{
				Dir: pkg.Path, InheritIO: true, ThrowOnError: true,
			}); err != nil {
				return err
			}
		} else {
			if err := build.Package(build.PackageOpts{
				WorkspaceRoot: root,
				Workspace:     ws,
				PackageName:   pkg.JSON.Name,
			}); err != nil {
				return err
			}
		}
		distPaths = append(distPaths, filepath.Join(pkg.Path, distDir))
	}

	for _, item := range opts.ExtraArgs {
		if strings.HasPrefix(item, "--pnpm") {
			fmt.Fprintln(os.Stderr, "`--pnpm` flag is not supported and may cause issues, please avoid using it")
			break
		}
	}

	cmd := append([]string{"npx", "pkg-pr-new", "publish"}, opts.ExtraArgs...)
	cmd = append(cmd, distPaths...)
	_, err = exec.Run(cmd, exec.Options{
		Dir:          root,
		ThrowOnError: true,
		InheritIO:    true,
	})
	return err
}

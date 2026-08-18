package cli

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/ci"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/config"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/git"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/versioning"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/workspace"
)

func findChangedPackagesCmd(args []string) int {
	root := config.WorkspaceRoot()
	sinceFlag := ""
	until := ""
	for i := 0; i < len(args); i++ {
		arg := args[i]
		switch {
		case arg == "--root":
			if i+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "missing --root value")
				return 2
			}
			i++
			root = args[i]
		case strings.HasPrefix(arg, "--root="):
			root = strings.TrimPrefix(arg, "--root=")
		case arg == "--since":
			if i+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "missing --since value")
				return 2
			}
			i++
			sinceFlag = args[i]
		case strings.HasPrefix(arg, "--since="):
			sinceFlag = strings.TrimPrefix(arg, "--since=")
		case arg == "--until":
			if i+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "missing --until value")
				return 2
			}
			i++
			until = args[i]
		case strings.HasPrefix(arg, "--until="):
			until = strings.TrimPrefix(arg, "--until=")
		}
	}

	root, err := filepath.Abs(root)
	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		return 1
	}

	cfg, err := config.Load(root)
	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		return 1
	}
	var versioningCfg config.VersioningData
	if cfg != nil {
		versioningCfg = cfg.Versioning
	}

	pkgs, err := workspace.Collect(root, false)
	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		return 1
	}

	since := sinceFlag
	if since == "" {
		since, err = git.LatestTag(root)
		if err != nil {
			fmt.Fprintln(os.Stderr, err.Error())
			return 1
		}
	}
	if since == "" {
		fmt.Fprintln(os.Stderr, "no previous tag found, cannot determine changeset")
		return 1
	}

	list, err := versioning.FindChangedPackages(versioning.ChangedOpts{
		Workspace:  pkgs,
		Root:       root,
		Since:      since,
		Until:      until,
		Versioning: versioningCfg,
	})
	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		return 1
	}

	names := make([]string, 0, len(list))
	for _, pkg := range list {
		names = append(names, pkg.JSON.Name)
	}
	result := strings.Join(names, ",")

	if ci.Running() {
		if err := ci.WriteOutput("packages", result); err != nil {
			fmt.Fprintln(os.Stderr, err.Error())
			return 1
		}
		info("Written packages to `packages` output")
		return 0
	}
	info(result)
	return 0
}

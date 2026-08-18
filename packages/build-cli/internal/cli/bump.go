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

func SharedWorkspaceBumpOptions(kind string, dryRun bool) (typ string, withRoot, all bool) {
	if kind == "auto" {
		kind = ""
	}
	return kind, true, true
}

func FormatBumpVersionResult(result versioning.Result, withReleaseType bool) string {
	var lines []string
	if withReleaseType {
		lines = append(lines, fmt.Sprintf("detected release type: %s", result.ReleaseType))
		lines = append(lines, fmt.Sprintf("  has breaking changes: %t", result.HasBreaking))
		lines = append(lines, fmt.Sprintf("  has new features: %t", result.HasFeatures))
		lines = append(lines, "")
	}

	lines = append(lines, "list of changed packages:")
	for _, item := range result.Changed {
		versionStr := item.PrevVersion
		if item.Package.JSON.Yorozu == nil || !item.Package.JSON.Yorozu.OwnVersioning {
			versionStr += " → " + item.Package.JSON.Version
		}
		lines = append(lines, fmt.Sprintf("  %s: %s", item.Package.JSON.Name, versionStr))
	}
	return strings.Join(lines, "\n")
}

func bumpVersionCmd(args []string) int {
	root := config.WorkspaceRoot()
	kind := "auto"
	sinceFlag := ""
	dryRun := false
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
		case arg == "--kind" || arg == "--type":
			if i+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "missing --type value")
				return 2
			}
			i++
			kind = args[i]
		case strings.HasPrefix(arg, "--kind="):
			kind = strings.TrimPrefix(arg, "--kind=")
		case strings.HasPrefix(arg, "--type="):
			kind = strings.TrimPrefix(arg, "--type=")
		case arg == "--since":
			if i+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "missing --since value")
				return 2
			}
			i++
			sinceFlag = args[i]
		case strings.HasPrefix(arg, "--since="):
			sinceFlag = strings.TrimPrefix(arg, "--since=")
		case arg == "--dry-run":
			dryRun = true
		}
	}

	switch kind {
	case "major", "minor", "patch", "auto":
	default:
		fmt.Fprintf(os.Stderr, "invalid --kind %q\n", kind)
		return 2
	}

	root, err := filepath.Abs(root)
	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		return 1
	}

	typ, withRoot, all := SharedWorkspaceBumpOptions(kind, dryRun)
	pkgs, err := workspace.Collect(root, true)
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

	result, err := versioning.Bump(versioning.BumpOpts{
		Workspace:  pkgs,
		Cwd:        root,
		Since:      since,
		Type:       typ,
		DryRun:     dryRun,
		WithRoot:   withRoot,
		All:        all,
		Versioning: versioningCfg,
	})
	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		return 1
	}

	info(FormatBumpVersionResult(result, typ == ""))

	if ci.Running() {
		if err := ci.WriteOutput("version", result.NextVersion); err != nil {
			fmt.Fprintln(os.Stderr, err.Error())
			return 1
		}
	}
	return 0
}

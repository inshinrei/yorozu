package cli

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/build"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/config"
)

func buildCmd(args []string) int {
	root := config.WorkspaceRoot()
	configPath := ""
	packageName := ":all"
	fixedVersion := ""
	for i := 0; i < len(args); i++ {
		arg := args[i]
		switch {
		case arg == "--config":
			if i+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "missing --config value")
				return 2
			}
			i++
			configPath = args[i]
		case strings.HasPrefix(arg, "--config="):
			configPath = strings.TrimPrefix(arg, "--config=")
		case arg == "--root":
			if i+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "missing --root value")
				return 2
			}
			i++
			root = args[i]
		case strings.HasPrefix(arg, "--root="):
			root = strings.TrimPrefix(arg, "--root=")
		case arg == "--fixed-version":
			if i+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "missing --fixed-version value")
				return 2
			}
			i++
			fixedVersion = args[i]
		case strings.HasPrefix(arg, "--fixed-version="):
			fixedVersion = strings.TrimPrefix(arg, "--fixed-version=")
		case strings.HasPrefix(arg, "-"):
		default:
			packageName = arg
		}
	}

	root, err := filepath.Abs(root)
	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		return 1
	}

	if packageName == ":all" {
		if err := build.Workspace(root, fixedVersion); err != nil {
			fmt.Fprintln(os.Stderr, err.Error())
			return 1
		}
		return 0
	}

	if err := build.Package(build.PackageOpts{
		WorkspaceRoot: root,
		PackageName:   packageName,
		ConfigPath:    configPath,
		FixedVersion:  fixedVersion,
	}); err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		return 1
	}
	return 0
}

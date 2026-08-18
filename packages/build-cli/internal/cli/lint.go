package cli

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/config"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/lint"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/workspace"
)

func lintCmd(args []string) int {
	workspaceRoot := config.WorkspaceRoot()
	noErrorCode := false
	for i := 0; i < len(args); i++ {
		arg := args[i]
		switch {
		case arg == "--workspace":
			if i+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "missing --workspace value")
				return 2
			}
			i++
			workspaceRoot = args[i]
		case strings.HasPrefix(arg, "--workspace="):
			workspaceRoot = strings.TrimPrefix(arg, "--workspace=")
		case arg == "--no-error-code":
			noErrorCode = true
		}
	}

	workspaceRoot, err := filepath.Abs(workspaceRoot)
	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		return 1
	}

	cfg, err := config.Load(workspaceRoot)
	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		return 1
	}
	var lintCfg config.LintConfig
	if cfg != nil {
		lintCfg = cfg.Lint
	}

	pkgs, err := workspace.Collect(workspaceRoot, lintCfg.IncludeRoot)
	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		return 1
	}

	depErrors, err := lint.ValidateWorkspaceDeps(workspaceRoot, pkgs, lintCfg)
	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		return 1
	}
	memberErrors, err := lint.FindPreferProtected(workspaceRoot)
	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		return 1
	}

	if len(depErrors) == 0 {
		info("workspace dependencies look good")
	} else {
		reportDepErrors(depErrors)
	}

	if len(memberErrors) == 0 {
		info("class members look good")
	} else {
		reportMemberErrors(memberErrors)
	}

	if len(depErrors) == 0 && len(memberErrors) == 0 {
		return 0
	}
	if noErrorCode {
		return 0
	}
	return 1
}

func reportDepErrors(errors []lint.Error) {
	var external []lint.ExternalError
	var internal []lint.InternalError
	for _, item := range errors {
		switch e := item.(type) {
		case lint.ExternalError:
			external = append(external, e)
		case lint.InternalError:
			internal = append(internal, e)
		}
	}

	if len(external) > 0 {
		warn("Found external dependencies mismatch:")
		for _, item := range external {
			warn(fmt.Sprintf(
				"  - at %s: %s has %s@%s, but %s has @%s",
				item.Package, item.At, item.Dependency, item.Version, item.OtherPackage, item.OtherVersion,
			))
		}
	}

	if len(internal) > 0 {
		warn("Found issues with internal dependencies:")
		for _, item := range internal {
			warn(fmt.Sprintf("  - at %s, dependency %s: %s", item.Package, item.Dependency, internalMessage(item.Subtype)))
		}
	}
}

func reportMemberErrors(errors []lint.PreferProtectedError) {
	warn("Found private / # class members (use protected):")
	for _, item := range errors {
		label := "private " + item.Name
		hint := "protected"
		if item.Kind == "private_identifier" {
			label = "#" + item.Name
			if strings.HasPrefix(item.Name, "_") {
				hint = "protected " + item.Name
			} else {
				hint = "protected _" + item.Name
			}
		}
		warn(fmt.Sprintf("  - at %s:%d:%d: %s — use %s", item.File, item.Line, item.Column, label, hint))
	}
}

func internalMessage(subtype string) string {
	switch subtype {
	case "not_workspace_proto":
		return "internal dependencies must be linked with workspace: protocol"
	case "not_workspace_dep":
		return "workspace: protocol is used to link to a package not found in the workspace"
	default:
		return subtype
	}
}

func info(message string) {
	fmt.Fprintln(os.Stdout, message)
}

func warn(message string) {
	fmt.Fprintln(os.Stderr, message)
}

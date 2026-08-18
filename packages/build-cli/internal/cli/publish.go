package cli

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/ci"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/config"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/npm"
)

func publishCmd(args []string) int {
	root := config.WorkspaceRoot()
	unpublishExisting := false
	skipVersionCheck := false
	registryURL := ""
	token := ""
	distDir := ""
	dryRun := false
	var publishArgsRaw *string
	packages := ":all"
	withTarballs := false
	withBuild := false
	fixedVersion := ""
	noProvenance := false

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
		case arg == "--unpublish-existing":
			unpublishExisting = true
		case arg == "--skip-version-check":
			skipVersionCheck = true
		case arg == "--registry":
			if i+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "missing --registry value")
				return 2
			}
			i++
			registryURL = args[i]
		case strings.HasPrefix(arg, "--registry="):
			registryURL = strings.TrimPrefix(arg, "--registry=")
		case arg == "--token":
			if i+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "missing --token value")
				return 2
			}
			i++
			token = args[i]
		case strings.HasPrefix(arg, "--token="):
			token = strings.TrimPrefix(arg, "--token=")
		case arg == "--dist-dir":
			if i+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "missing --dist-dir value")
				return 2
			}
			i++
			distDir = args[i]
		case strings.HasPrefix(arg, "--dist-dir="):
			distDir = strings.TrimPrefix(arg, "--dist-dir=")
		case arg == "--dry-run":
			dryRun = true
		case arg == "--publish-args":
			if i+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "missing --publish-args value")
				return 2
			}
			i++
			s := args[i]
			publishArgsRaw = &s
		case strings.HasPrefix(arg, "--publish-args="):
			s := strings.TrimPrefix(arg, "--publish-args=")
			publishArgsRaw = &s
		case arg == "--with-tarballs":
			withTarballs = true
		case arg == "--with-build":
			withBuild = true
		case arg == "--fixed-version":
			if i+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "missing --fixed-version value")
				return 2
			}
			i++
			fixedVersion = args[i]
		case strings.HasPrefix(arg, "--fixed-version="):
			fixedVersion = strings.TrimPrefix(arg, "--fixed-version=")
		case arg == "--no-provenance":
			noProvenance = true
		case strings.HasPrefix(arg, "-"):
		default:
			packages = arg
		}
	}

	root, err := filepath.Abs(root)
	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		return 1
	}

	var publishArgs []string
	if publishArgsRaw != nil {
		publishArgs = strings.Split(*publishArgsRaw, " ")
	}

	result, err := npm.Publish(npm.PublishOpts{
		WorkspaceRoot:     root,
		Packages:          strings.Split(packages, ","),
		UnpublishExisting: unpublishExisting,
		SkipVersionCheck:  skipVersionCheck,
		RegistryURL:       registryURL,
		Token:             token,
		DistDir:           distDir,
		DryRun:            dryRun,
		PublishArgs:       publishArgs,
		WithTarballs:      withTarballs,
		WithBuild:         withBuild,
		FixedVersion:      fixedVersion,
		NoProvenance:      noProvenance,
	})
	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		return 1
	}

	if len(result.Failed) > 0 {
		info("failed to publish:")
		for _, name := range result.Failed {
			info("  " + name)
		}
		return 1
	}

	if len(result.Tarballs) > 0 {
		if ci.Running() {
			info("written paths to tarballs to `tarballs` output")
			if err := ci.WriteOutput("tarballs", strings.Join(result.Tarballs, ",")); err != nil {
				fmt.Fprintln(os.Stderr, err.Error())
				return 1
			}
		} else {
			info("tarballs generated:")
			for _, tar := range result.Tarballs {
				info("  " + tar)
			}
		}
	}
	return 0
}

package cli

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/config"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/release"
)

func releaseCmd(args []string) int {
	opts := release.Options{
		Root: config.WorkspaceRoot(),
		Kind: "auto",
	}
	for i := 0; i < len(args); i++ {
		arg := args[i]
		take := func(flag string) (string, bool) {
			if arg == flag {
				if i+1 >= len(args) {
					fmt.Fprintf(os.Stderr, "missing %s value\n", flag)
					return "", false
				}
				i++
				return args[i], true
			}
			prefix := flag + "="
			if strings.HasPrefix(arg, prefix) {
				return strings.TrimPrefix(arg, prefix), true
			}
			return "", true
		}
		switch {
		case arg == "--kind" || strings.HasPrefix(arg, "--kind="):
			v, ok := take("--kind")
			if !ok {
				return 2
			}
			if v != "" {
				opts.Kind = v
			}
		case arg == "--with-github-release":
			opts.WithGithubRelease = true
		case arg == "--git-extra-origins" || strings.HasPrefix(arg, "--git-extra-origins="):
			v, ok := take("--git-extra-origins")
			if !ok {
				return 2
			}
			opts.GitExtraOrigins = v
		case arg == "--github-token" || strings.HasPrefix(arg, "--github-token="):
			v, ok := take("--github-token")
			if !ok {
				return 2
			}
			opts.GithubToken = v
		case arg == "--github-repo" || strings.HasPrefix(arg, "--github-repo="):
			v, ok := take("--github-repo")
			if !ok {
				return 2
			}
			opts.GithubRepo = v
		case arg == "--github-api-url" || strings.HasPrefix(arg, "--github-api-url="):
			v, ok := take("--github-api-url")
			if !ok {
				return 2
			}
			opts.GithubAPIURL = v
		case arg == "--with-jsr":
			opts.WithJsr = true
		case arg == "--jsr-registry" || strings.HasPrefix(arg, "--jsr-registry="):
			v, ok := take("--jsr-registry")
			if !ok {
				return 2
			}
			opts.JsrRegistry = v
		case arg == "--jsr-token" || strings.HasPrefix(arg, "--jsr-token="):
			v, ok := take("--jsr-token")
			if !ok {
				return 2
			}
			opts.JsrToken = v
		case arg == "--jsr-publish-args" || strings.HasPrefix(arg, "--jsr-publish-args="):
			v, ok := take("--jsr-publish-args")
			if !ok {
				return 2
			}
			opts.JsrPublishArgs = v
		case arg == "--jsr-create-packages":
			opts.JsrCreatePackages = true
		case arg == "--with-npm":
			opts.WithNpm = true
		case arg == "--npm-token" || strings.HasPrefix(arg, "--npm-token="):
			v, ok := take("--npm-token")
			if !ok {
				return 2
			}
			opts.NpmToken = v
		case arg == "--npm-publish-args" || strings.HasPrefix(arg, "--npm-publish-args="):
			v, ok := take("--npm-publish-args")
			if !ok {
				return 2
			}
			opts.NpmPublishArgs = v
		case arg == "--npm-dist-dir" || strings.HasPrefix(arg, "--npm-dist-dir="):
			v, ok := take("--npm-dist-dir")
			if !ok {
				return 2
			}
			opts.NpmDistDir = v
		case arg == "--npm-registry" || strings.HasPrefix(arg, "--npm-registry="):
			v, ok := take("--npm-registry")
			if !ok {
				return 2
			}
			opts.NpmRegistry = v
		case arg == "--no-provenance":
			opts.NoProvenance = true
		case arg == "--dry-run":
			opts.DryRun = true
		}
	}

	abs, err := filepath.Abs(opts.Root)
	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		return 1
	}
	opts.Root = abs

	skipped, err := release.Run(opts)
	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		return 1
	}
	if skipped {
		return 0
	}
	return 0
}

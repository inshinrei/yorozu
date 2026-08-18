package npm

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/build"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/ci"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/exec"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/workspace"
)

type PublishOpts struct {
	WorkspaceRoot     string
	Workspace         []workspace.Package
	Packages          []string
	UnpublishExisting bool
	RegistryURL       string
	Token             string
	DistDir           string
	DryRun            bool
	PublishArgs       []string
	WithTarballs      bool
	WithBuild         bool
	SkipVersionCheck  bool
	FixedVersion      string
	NoProvenance      bool
}

type PublishResult struct {
	Failed   []string
	Tarballs []string
}

func Publish(opts PublishOpts) (PublishResult, error) {
	workspaceRoot := opts.WorkspaceRoot
	if workspaceRoot == "" {
		var err error
		workspaceRoot, err = os.Getwd()
		if err != nil {
			return PublishResult{}, err
		}
	}
	pkgs := opts.Workspace
	if pkgs == nil {
		var err error
		pkgs, err = workspace.Collect(workspaceRoot, true)
		if err != nil {
			return PublishResult{}, err
		}
	}

	registryURL := opts.RegistryURL
	if registryURL == "" {
		registryURL = DefaultRegistry
	}
	distDir := opts.DistDir
	if distDir == "" {
		distDir = "dist"
	}
	publishArgs := append([]string(nil), opts.PublishArgs...)

	var withoutRoot []workspace.Package
	for _, pkg := range pkgs {
		if !pkg.Root {
			withoutRoot = append(withoutRoot, pkg)
		}
	}
	ordered, err := workspace.SortByPublishOrder(withoutRoot)
	if err != nil {
		return PublishResult{}, err
	}
	ordered = workspace.FilterForPublish(ordered, "npm")

	toPublish := ordered
	if len(opts.Packages) != 1 || opts.Packages[0] != ":all" {
		want := make(map[string]struct{}, len(opts.Packages))
		for _, name := range opts.Packages {
			want[name] = struct{}{}
		}
		var filtered []workspace.Package
		for _, pkg := range ordered {
			if _, ok := want[pkg.JSON.Name]; ok {
				filtered = append(filtered, pkg)
			}
		}
		toPublish = filtered
	}

	token := opts.Token
	if opts.DryRun {
		token = ""
	}
	auth, err := PrepareAuth(token, registryURL)
	if err != nil {
		return PublishResult{}, err
	}
	defer auth.Cleanup()

	npmEnv := mergeEnv(auth.ExtraEnv)

	if !opts.DryRun {
		cmd := append([]string{"npm"}, auth.ExtraArgs...)
		cmd = append(cmd, "whoami", "--registry", registryURL)
		if _, err := exec.Run(cmd, exec.Options{ThrowOnError: true, Env: npmEnv}); err != nil {
			return PublishResult{}, err
		}
	}

	if !opts.NoProvenance && ci.Running() && os.Getenv("ACTIONS_ID_TOKEN_REQUEST_URL") != "" && registryURL == DefaultRegistry {
		if !hasArgPrefix(publishArgs, "--provenance") {
			publishArgs = append(publishArgs, "--provenance")
		}
	}

	var failed []string
	var tarballs []string
	for _, pkg := range toPublish {
		name := pkg.JSON.Name
		if name == "" {
			return PublishResult{}, fmt.Errorf("Value is %s.", name)
		}
		pkgVersion := opts.FixedVersion
		if pkgVersion == "" {
			pkgVersion = pkg.JSON.Version
			if pkgVersion == "" {
				return PublishResult{}, fmt.Errorf("Value is %s.", pkgVersion)
			}
		}

		if !opts.DryRun && !opts.SkipVersionCheck {
			exists, err := CheckVersion(registryURL, name, pkgVersion)
			if err != nil {
				return PublishResult{}, err
			}
			if exists {
				if opts.UnpublishExisting {
					cmd := append([]string{"npm"}, auth.ExtraArgs...)
					cmd = append(cmd, "unpublish", "--force", "--registry", registryURL, name+"@"+pkgVersion)
					if _, err := exec.Run(cmd, exec.Options{InheritIO: true, Env: npmEnv}); err != nil {
						return PublishResult{}, err
					}
				} else {
					fmt.Fprintf(os.Stdout, "Skipping %s@%s because it is already published\n", name, pkgVersion)
					continue
				}
			}
		}

		if opts.WithBuild {
			if _, ok := pkg.JSON.Scripts["build"]; ok {
				res, err := exec.Run([]string{"npm", "run", "build"}, exec.Options{
					Dir:       pkg.Path,
					InheritIO: true,
				})
				if err != nil {
					return PublishResult{}, err
				}
				if res.ExitCode != 0 {
					fmt.Fprintf(os.Stdout, "failed to build %s\n", name)
					failed = append(failed, name)
					continue
				}
			} else {
				if err := build.Package(build.PackageOpts{
					WorkspaceRoot: workspaceRoot,
					Workspace:     pkgs,
					PackageName:   name,
					FixedVersion:  opts.FixedVersion,
				}); err != nil {
					fmt.Fprintf(os.Stdout, "failed to build %s:\n", name)
					fmt.Fprintln(os.Stderr, err.Error())
					failed = append(failed, name)
					continue
				}
			}
		}

		fullDistDir := filepath.Join(pkg.Path, distDir)
		if opts.FixedVersion != "" {
			if err := rewriteDistVersion(filepath.Join(fullDistDir, "package.json"), opts.FixedVersion); err != nil {
				return PublishResult{}, err
			}
		}

		fmt.Fprintf(os.Stdout, "publishing %s@%s\n", name, pkgVersion)

		if strings.Contains(name, "/") && !hasArgPrefix(publishArgs, "--access") {
			publishArgs = append(publishArgs, "--access=public")
		}

		cmd := append([]string{"npm"}, auth.ExtraArgs...)
		cmd = append(cmd, "publish", "--registry", registryURL)
		if opts.DryRun {
			cmd = append(cmd, "--dry-run")
		} else {
			cmd = append(cmd, "-q")
		}
		cmd = append(cmd, publishArgs...)
		res, err := exec.Run(cmd, exec.Options{
			Dir:       fullDistDir,
			InheritIO: true,
			Env:       npmEnv,
		})
		if err != nil {
			return PublishResult{}, err
		}
		if res.ExitCode != 0 {
			failed = append(failed, name)
		}

		if opts.WithTarballs {
			tar, err := exec.Run([]string{"npm", "pack", "-q"}, exec.Options{Dir: fullDistDir})
			if err != nil {
				return PublishResult{}, err
			}
			if tar.ExitCode != 0 {
				fmt.Fprintln(os.Stderr, tar.Stderr)
			} else {
				tarballs = append(tarballs, filepath.Join(fullDistDir, strings.TrimSpace(tar.Stdout)))
			}
		}
	}

	return PublishResult{Failed: failed, Tarballs: tarballs}, nil
}

func rewriteDistVersion(path, version string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("Could not parse package.json at %s: %w", path, err)
	}
	var obj map[string]any
	if err := json.Unmarshal(data, &obj); err != nil {
		return fmt.Errorf("Could not parse package.json at %s: %w", path, err)
	}
	obj["version"] = version
	out, err := json.MarshalIndent(obj, "", "    ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, out, 0o644)
}

func hasArgPrefix(args []string, prefix string) bool {
	for _, arg := range args {
		if strings.HasPrefix(arg, prefix) {
			return true
		}
	}
	return false
}

func mergeEnv(extra map[string]string) []string {
	env := os.Environ()
	if len(extra) == 0 {
		return env
	}
	skip := make(map[string]struct{}, len(extra))
	for k := range extra {
		skip[k] = struct{}{}
	}
	out := make([]string, 0, len(env)+len(extra))
	for _, kv := range env {
		name, _, _ := strings.Cut(kv, "=")
		if _, ok := skip[name]; ok {
			continue
		}
		out = append(out, kv)
	}
	for k, v := range extra {
		out = append(out, k+"="+v)
	}
	return out
}

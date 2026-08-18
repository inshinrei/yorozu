package release

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/ci"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/config"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/exec"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/git"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/leftover"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/npm"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/versioning"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/workspace"
)

type Options struct {
	Root              string
	Kind              string
	WithGithubRelease bool
	GitExtraOrigins   string
	GithubToken       string
	GithubRepo        string
	GithubAPIURL      string
	WithJsr           bool
	JsrRegistry       string
	JsrToken          string
	JsrPublishArgs    string
	JsrCreatePackages bool
	WithNpm           bool
	NpmToken          string
	NpmPublishArgs    string
	NpmDistDir        string
	NpmRegistry       string
	NoProvenance      bool
	DryRun            bool
}

func Run(opts Options) (skipped bool, err error) {
	root := opts.Root
	cfg, err := config.Load(root)
	if err != nil {
		return false, err
	}
	var versioningCfg config.VersioningData
	if cfg != nil {
		versioningCfg = cfg.Versioning
	}

	workspaceWithRoot, err := workspace.Collect(root, true)
	if err != nil {
		return false, err
	}
	rootPackage, err := workspace.FindRoot(workspaceWithRoot)
	if err != nil {
		return false, err
	}

	prevTag, err := git.LatestTag(root)
	if err != nil {
		return false, err
	}
	if prevTag == "" {
		info("no previous tag found, assuming this is a first ever release")
	} else {
		info("previous tag: " + prevTag)
	}

	var bumpResult versioning.Result
	var nextVersion string
	var changelog string

	if prevTag == "" {
		nextVersion = rootPackage.JSON.Version
		changelog = "Initial release"
	} else {
		commits, err := git.CommitsBetween(prevTag, "", root, nil)
		if err != nil {
			return false, err
		}
		if ShouldSkipAuto(opts.Kind, prevTag, commits) {
			info(fmt.Sprintf("no commits since %s, nothing to do", prevTag))
			return true, nil
		}

		bumpType := opts.Kind
		if bumpType == "auto" {
			bumpType = ""
		}
		bumpResult, err = versioning.Bump(versioning.BumpOpts{
			Workspace:  workspaceWithRoot,
			Since:      prevTag,
			Cwd:        root,
			Type:       bumpType,
			DryRun:     opts.DryRun,
			WithRoot:   true,
			All:        true,
			Versioning: versioningCfg,
		})
		if err != nil {
			return false, err
		}
		info(formatBump(bumpResult, opts.Kind == "auto"))

		changed := make([]workspace.Package, 0, len(bumpResult.Changed))
		for _, item := range bumpResult.Changed {
			changed = append(changed, item.Package)
		}
		changelog, err = versioning.Generate(versioning.ChangelogOpts{
			Workspace:  changed,
			Cwd:        root,
			Since:      prevTag,
			Versioning: versioningCfg,
		})
		if err != nil {
			return false, err
		}
		nextVersion = bumpResult.NextVersion
		workspaceWithRoot, err = workspace.Collect(root, true)
		if err != nil {
			return false, err
		}
	}

	taggingSchema := "semver"
	if versioningCfg.TaggingSchema != "" {
		taggingSchema = versioningCfg.TaggingSchema
	}

	var tagName string
	if prevTag == "" || taggingSchema == "semver" {
		tagName = "v" + nextVersion
		exists, err := git.TagExists(tagName, root)
		if err != nil {
			return false, err
		}
		if exists {
			return false, fmt.Errorf("tag %s already exists. did the previous release complete successfully? if so, please verify versions in package.json and try again", tagName)
		}
	} else if taggingSchema == "date" {
		tagName, err = NextDateTag(root)
		if err != nil {
			return false, err
		}
	} else {
		return false, fmt.Errorf("Unknown tagging schema: %s", taggingSchema)
	}

	info("next version: " + nextVersion)
	info("next tag: " + tagName)
	info("--begin changelog--")
	info(changelog)
	info("--end changelog--")

	toPublish, err := npmPublishList(workspaceWithRoot)
	if err != nil {
		return false, err
	}
	printPublishList(toPublish)

	if ci.Running() {
		if err := ci.WriteOutput("version", nextVersion); err != nil {
			return false, err
		}
		if err := ci.WriteOutput("tag", tagName); err != nil {
			return false, err
		}
		if err := ci.WriteOutput("changelog", changelog); err != nil {
			return false, err
		}
	}

	var tarballs []string

	if opts.WithNpm {
		if opts.DryRun {
			info("dry run, skipping npm publish")
		} else {
			info("publishing to npm...")
			token := opts.NpmToken
			if token == "" {
				token = os.Getenv("NPM_TOKEN")
			}
			var publishArgs []string
			if opts.NpmPublishArgs != "" {
				publishArgs = strings.Split(opts.NpmPublishArgs, " ")
			}
			result, err := npm.Publish(npm.PublishOpts{
				Packages:      []string{":all"},
				Workspace:     workspaceWithRoot,
				WorkspaceRoot: root,
				RegistryURL:   opts.NpmRegistry,
				Token:         token,
				DistDir:       opts.NpmDistDir,
				PublishArgs:   publishArgs,
				DryRun:        opts.DryRun,
				WithBuild:     true,
				WithTarballs:  opts.WithGithubRelease,
				NoProvenance:  opts.NoProvenance,
			})
			if err != nil {
				return false, err
			}
			if len(result.Failed) > 0 {
				info("failed to publish:")
				for _, name := range result.Failed {
					info("  " + name)
				}
				return false, fmt.Errorf("failed to publish")
			}
			info("published to npm")
			tarballs = result.Tarballs
		}
	} else if opts.WithGithubRelease {
		return false, fmt.Errorf("Cannot create a github release without publishing to npm (yet)")
	}

	if opts.WithJsr {
		if opts.DryRun {
			info("dry run, skipping jsr publish")
		} else {
			if opts.JsrCreatePackages {
				info("creating missing packages in jsr...")
				jsrArgs := []string{"jsr", "create-packages"}
				if opts.JsrRegistry != "" {
					jsrArgs = append(jsrArgs, "--registry", opts.JsrRegistry)
				}
				if opts.JsrToken != "" {
					jsrArgs = append(jsrArgs, "--token", opts.JsrToken)
				}
				if opts.GithubRepo != "" {
					jsrArgs = append(jsrArgs, "--github-repo", opts.GithubRepo)
				}
				if err := leftover.Run(root, jsrArgs); err != nil {
					info("some packages are missing, this might cause issues")
				}
			}
			info("generating deno workspace...")
			if err := leftover.Run(root, []string{"jsr", "gen-deno-workspace"}); err != nil {
				return false, err
			}
			info("publishing to jsr...")
			workspaceDir := filepath.Join(root, "dist/jsr")
			if cfg != nil && cfg.Jsr.OutputDir != "" {
				workspaceDir = filepath.Join(root, cfg.Jsr.OutputDir)
			}
			deno := []string{"deno", "publish", "--quiet", "--allow-dirty"}
			if opts.JsrToken != "" {
				deno = append(deno, "--token", opts.JsrToken)
			}
			if opts.JsrPublishArgs != "" {
				deno = append(deno, strings.Split(opts.JsrPublishArgs, " ")...)
			}
			env := os.Environ()
			if opts.JsrRegistry != "" {
				env = append(env, "JSR_URL="+opts.JsrRegistry)
			}
			if _, err := exec.Run(deno, exec.Options{
				Dir:          workspaceDir,
				Env:          env,
				InheritIO:    true,
				ThrowOnError: true,
			}); err != nil {
				return false, err
			}
			info("published to jsr")
		}
	}

	if opts.DryRun {
		info("dry run, skipping release commit and tag")
	} else {
		message := "chore(release): " + tagName
		if !opts.WithGithubRelease {
			message += "\n\n" + changelog
		}
		if _, err := exec.Run([]string{"git", "commit", "-am", message, "--allow-empty"}, exec.Options{
			Dir: root, InheritIO: true, ThrowOnError: true,
		}); err != nil {
			return false, err
		}
		if _, err := exec.Run([]string{"git", "tag", tagName, "-m", tagName}, exec.Options{
			Dir: root, InheritIO: true, ThrowOnError: true,
		}); err != nil {
			return false, err
		}
		if _, err := exec.Run([]string{"git", "push", "--follow-tags"}, exec.Options{
			Dir: root, InheritIO: true, ThrowOnError: true,
		}); err != nil {
			return false, err
		}
		if opts.GitExtraOrigins != "" {
			for _, origin := range strings.Split(opts.GitExtraOrigins, ",") {
				if _, err := exec.Run([]string{"git", "push", origin, "--force"}, exec.Options{
					Dir: root, InheritIO: true, ThrowOnError: true,
				}); err != nil {
					return false, err
				}
				_, tagErr := exec.Run([]string{"git", "push", origin, "--force", "--tags"}, exec.Options{
					Dir: root, ThrowOnError: true,
				})
				if tagErr != nil {
					if execErr, ok := tagErr.(*exec.Error); ok && strings.Contains(execErr.Result.Stderr, "cannot lock ref 'refs/tags/"+tagName+"': reference already exists") {
						info(fmt.Sprintf("tag %s already exists on %s, skipping", tagName, origin))
					} else {
						return false, tagErr
					}
				}
			}
		}
	}

	if opts.WithGithubRelease {
		if opts.DryRun {
			info("dry run, skipping github release")
		} else {
			token := opts.GithubToken
			if token == "" {
				token = os.Getenv("GITHUB_TOKEN")
			}
			if token == "" {
				return false, fmt.Errorf("github token is not set")
			}
			repo := opts.GithubRepo
			if repo == "" {
				repo = os.Getenv("GITHUB_REPOSITORY")
			}
			if repo == "" {
				return false, fmt.Errorf("github repo is not set")
			}
			info("creating github release...")
			var artifacts []Artifact
			for _, file := range tarballs {
				body, readErr := os.ReadFile(file)
				if readErr != nil {
					return false, readErr
				}
				artifacts = append(artifacts, Artifact{
					Name: filepath.Base(file),
					Type: "application/gzip",
					Body: body,
				})
			}
			if err := CreateGithubRelease(token, repo, tagName, tagName, changelog, opts.GithubAPIURL, artifacts); err != nil {
				return false, err
			}
			info(fmt.Sprintf("github release created: https://github.com/%s/releases/tag/%s", repo, tagName))
		}
	}

	info("done!")
	return false, nil
}

func npmPublishList(pkgs []workspace.Package) ([]workspace.Package, error) {
	var withoutRoot []workspace.Package
	for _, pkg := range pkgs {
		if !pkg.Root {
			withoutRoot = append(withoutRoot, pkg)
		}
	}
	ordered, err := workspace.SortByPublishOrder(withoutRoot)
	if err != nil {
		return nil, err
	}
	return workspace.FilterForPublish(ordered, "npm"), nil
}

func printPublishList(packages []workspace.Package) {
	info("publish list:")
	if len(packages) == 0 {
		info("  (none)")
		return
	}
	for _, pkg := range packages {
		info(fmt.Sprintf("  %s@%s", pkg.JSON.Name, pkg.JSON.Version))
	}
}

func formatBump(result versioning.Result, withReleaseType bool) string {
	var lines []string
	if withReleaseType {
		lines = append(lines,
			fmt.Sprintf("detected release type: %s", result.ReleaseType),
			fmt.Sprintf("  has breaking changes: %t", result.HasBreaking),
			fmt.Sprintf("  has new features: %t", result.HasFeatures),
			"",
		)
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

func info(message string) {
	fmt.Fprintln(os.Stdout, message)
}

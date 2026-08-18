package versioning

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/config"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/git"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/workspace"
)

var skippedTypes = map[string]struct{}{
	"chore": {},
	"ci":    {},
	"docs":  {},
	"test":  {},
}

type ChangelogOpts struct {
	Workspace  []workspace.Package
	Cwd        string
	Since      string
	Until      string
	Versioning config.VersioningData
}

func defaultCommitFilter(parsed *git.Conventional) bool {
	if parsed.Breaking {
		return true
	}
	if parsed.Type == "" {
		return false
	}
	if _, skip := skippedTypes[parsed.Type]; skip {
		return false
	}
	return true
}

func defaultCommitFormatter(commit git.Commit, parsed *git.Conventional) string {
	prefix := ""
	if parsed.Breaking {
		prefix = "**❗ BREAKING** "
	}
	line := fmt.Sprintf("- %s: %s%s", commit.Hash, prefix, commit.Message)
	if parsed.Breaking && commit.Description != "" {
		var body []string
		for _, item := range strings.Split(strings.TrimSpace(commit.Description), "\n") {
			body = append(body, "  "+item)
		}
		line += "\n" + strings.Join(body, "\n")
	}
	return line
}

func defaultPackageCommitsFormatter(packageName string, commits []string) string {
	return fmt.Sprintf("### %s\n%s", packageName, strings.Join(commits, "\n"))
}

func Generate(opts ChangelogOpts) (string, error) {
	cwd := opts.Cwd
	if cwd == "" {
		var err error
		cwd, err = os.Getwd()
		if err != nil {
			return "", err
		}
	}

	changedFiles, err := FindChangedFiles(ChangedOpts{
		Workspace:  opts.Workspace,
		Root:       cwd,
		Since:      opts.Since,
		Until:      opts.Until,
		Versioning: opts.Versioning,
	})
	if err != nil {
		return "", err
	}

	changedFilesByPackage := map[string]workspace.Package{}
	for _, file := range changedFiles {
		pkgRel, err := filepath.Rel(file.Root, file.Package.Path)
		if err != nil {
			pkgRel = file.Package.Path
		}
		key := filepath.ToSlash(filepath.Join(pkgRel, file.File))
		changedFilesByPackage[key] = file.Package
	}

	commits, err := git.CommitsBetween(opts.Since, opts.Until, cwd, nil)
	if err != nil {
		return "", err
	}

	type pkgCommits struct {
		order  []string
		byHash map[string]string
	}
	var packageOrder []string
	byPackage := map[string]*pkgCommits{}

	for _, commit := range commits {
		parsed := git.ParseConventional(commit.Message + "\n" + commit.Description)
		if parsed == nil {
			fmt.Fprintf(os.Stderr, "Failed to parse commit message: %s\n", commit.Message)
			continue
		}
		if !defaultCommitFilter(parsed) {
			continue
		}
		changed, err := git.ChangedFiles(commit.Hash+"~1", commit.Hash, cwd)
		if err != nil {
			return "", err
		}
		formatted := defaultCommitFormatter(commit, parsed)
		for _, file := range changed {
			file = filepath.ToSlash(file)
			pkg, ok := changedFilesByPackage[file]
			if !ok {
				continue
			}
			packageName := pkg.JSON.Name
			if packageName == "" {
				continue
			}
			entry, ok := byPackage[packageName]
			if !ok {
				entry = &pkgCommits{byHash: map[string]string{}}
				byPackage[packageName] = entry
				packageOrder = append(packageOrder, packageName)
			}
			if _, exists := entry.byHash[commit.Hash]; !exists {
				entry.order = append(entry.order, commit.Hash)
			}
			entry.byHash[commit.Hash] = formatted
		}
	}

	var changelog strings.Builder
	for _, name := range packageOrder {
		entry := byPackage[name]
		lines := make([]string, 0, len(entry.order))
		for _, hash := range entry.order {
			lines = append(lines, entry.byHash[hash])
		}
		changelog.WriteString(defaultPackageCommitsFormatter(name, lines))
		changelog.WriteString("\n\n")
	}
	return changelog.String(), nil
}

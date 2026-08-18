package versioning

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"github.com/bmatcuk/doublestar/v4"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/config"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/exec"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/git"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/workspace"
)

var defaultExclude = []string{"**/*.unit.ts", "**/*.md"}

type ChangedFile struct {
	Package workspace.Package
	File    string
	Root    string
}

type ChangedOpts struct {
	Workspace  []workspace.Package
	Root       string
	Since      string
	Until      string
	Versioning config.VersioningData
}

type tsconfigShow struct {
	Files []string `json:"files"`
}

var tsconfigFilesCache sync.Map

func fileBelongsToPackage(file, pkgPath string) bool {
	if pkgPath == "" || pkgPath == "." {
		return true
	}
	return file == pkgPath || strings.HasPrefix(file, pkgPath+"/")
}

func matchAny(patterns []string, path string) bool {
	path = filepath.ToSlash(path)
	for _, pattern := range patterns {
		ok, err := doublestar.Match(filepath.ToSlash(pattern), path)
		if err == nil && ok {
			return true
		}
	}
	return false
}

func tsconfigFiles(pkgDir string) ([]string, error) {
	if cached, ok := tsconfigFilesCache.Load(pkgDir); ok {
		return cached.([]string), nil
	}
	res, err := exec.Run([]string{"npx", "tsc", "--showConfig"}, exec.Options{Dir: pkgDir})
	if err != nil {
		return nil, err
	}
	if res.ExitCode != 0 {
		if strings.TrimSpace(res.Stderr) == "" {
			return nil, errors.New("npx tsc --showConfig failed")
		}
		return nil, errors.New(res.Stderr)
	}
	var cfg tsconfigShow
	if err := json.Unmarshal([]byte(res.Stdout), &cfg); err != nil {
		return nil, err
	}
	if cfg.Files == nil {
		return nil, errors.New("tsconfig.json > .files is not an array")
	}
	files := make([]string, 0, len(cfg.Files))
	for _, file := range cfg.Files {
		files = append(files, strings.TrimPrefix(file, "./"))
	}
	tsconfigFilesCache.Store(pkgDir, files)
	return files, nil
}

func shouldIncludeTS(root string, pkg workspace.Package, file string) bool {
	if !strings.HasSuffix(file, ".ts") {
		return true
	}
	pkgDir := pkg.Path
	if !filepath.IsAbs(pkgDir) {
		pkgDir = filepath.Join(root, pkg.Path)
	}
	files, err := tsconfigFiles(pkgDir)
	if err != nil {
		return true
	}
	for _, item := range files {
		if item == file {
			return true
		}
	}
	return false
}

func FindChangedFiles(opts ChangedOpts) ([]ChangedFile, error) {
	root := opts.Root
	if root == "" {
		var err error
		root, err = os.Getwd()
		if err != nil {
			return nil, err
		}
	}

	changed, err := git.ChangedFiles(opts.Since, opts.Until, root)
	if err != nil {
		return nil, err
	}
	if len(changed) == 0 {
		return []ChangedFile{}, nil
	}

	packages := opts.Workspace
	if packages == nil {
		packages, err = workspace.Collect(root, false)
		if err != nil {
			return nil, err
		}
	}

	type ranked struct {
		pkg     workspace.Package
		relPath string
	}
	var rankedPkgs []ranked
	for _, pkg := range packages {
		if pkg.Root {
			continue
		}
		relPath, err := filepath.Rel(root, pkg.Path)
		if err != nil {
			relPath = pkg.Path
		}
		relPath = filepath.ToSlash(relPath)
		rankedPkgs = append(rankedPkgs, ranked{pkg: pkg, relPath: relPath})
	}
	sort.SliceStable(rankedPkgs, func(i, j int) bool {
		return len(rankedPkgs[i].relPath) > len(rankedPkgs[j].relPath)
	})

	include := opts.Versioning.Include
	exclude := opts.Versioning.Exclude
	useDefaultExclude := opts.Versioning.Exclude == nil
	if useDefaultExclude {
		exclude = defaultExclude
	}

	var files []ChangedFile
	for _, file := range changed {
		file = filepath.ToSlash(file)
		var match *ranked
		for i := range rankedPkgs {
			if fileBelongsToPackage(file, rankedPkgs[i].relPath) {
				match = &rankedPkgs[i]
				break
			}
		}
		if match == nil {
			continue
		}
		relPath, err := relToPackage(match.relPath, file)
		if err != nil {
			continue
		}
		if include != nil && !matchAny(include, relPath) {
			continue
		}
		if exclude != nil && matchAny(exclude, relPath) {
			continue
		}
		info := ChangedFile{
			File:    relPath,
			Package: match.pkg,
			Root:    root,
		}
		if !shouldIncludeTS(root, match.pkg, relPath) {
			continue
		}
		files = append(files, info)
	}
	if files == nil {
		files = []ChangedFile{}
	}
	return files, nil
}

func relToPackage(pkgRel, file string) (string, error) {
	if pkgRel == "" || pkgRel == "." {
		return file, nil
	}
	rel, err := filepath.Rel(filepath.FromSlash(pkgRel), filepath.FromSlash(file))
	if err != nil {
		return "", err
	}
	return filepath.ToSlash(rel), nil
}

func FindChangedPackages(opts ChangedOpts) ([]workspace.Package, error) {
	files, err := FindChangedFiles(opts)
	if err != nil {
		return nil, err
	}
	seen := map[string]struct{}{}
	var pkgs []workspace.Package
	for _, file := range files {
		key := file.Package.Path
		if key == "" {
			key = file.Package.JSON.Name
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		pkgs = append(pkgs, file.Package)
	}
	if pkgs == nil {
		pkgs = []workspace.Package{}
	}
	return pkgs, nil
}

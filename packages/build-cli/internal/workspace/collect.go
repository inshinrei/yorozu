package workspace

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/bmatcuk/doublestar/v4"
)

func Collect(root string, includeRoot bool) ([]Package, error) {
	root, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	root = filepath.Clean(root)

	rootPath, rootJSON, err := ParseWorkspaceRoot(root)
	if err != nil {
		return nil, err
	}
	if rootJSON.Workspaces == nil {
		return nil, errors.New("No workspaces found in package.json")
	}

	var packages []Package
	if includeRoot {
		packages = append(packages, Package{
			Path:            root,
			PackageJSONPath: rootPath,
			Root:            true,
			JSON:            rootJSON,
		})
	}

	depth := maxGlobDepth()
	fsys := os.DirFS(root)
	for _, raw := range rootJSON.Workspaces {
		pattern := filepath.ToSlash(filepath.Clean(raw))
		err := doublestar.GlobWalk(fsys, pattern, func(rel string, d fs.DirEntry) error {
			if !d.IsDir() {
				return nil
			}
			if globDepth(rel) > depth {
				return doublestar.SkipDir
			}
			dir := filepath.Join(root, filepath.FromSlash(rel))
			pkgPath, pkgJSON, err := ParseDir(dir)
			if err != nil {
				if isPackageNotFound(err) {
					return nil
				}
				return err
			}
			packages = append(packages, Package{
				Path:            dir,
				PackageJSONPath: pkgPath,
				Root:            false,
				JSON:            pkgJSON,
			})
			return nil
		})
		if err != nil {
			return nil, err
		}
	}
	return packages, nil
}

func isPackageNotFound(err error) bool {
	if os.IsNotExist(err) {
		return true
	}
	var nf interface{ NotFound() bool }
	if errors.As(err, &nf) && nf.NotFound() {
		return true
	}
	return false
}

func maxGlobDepth() int {
	s := os.Getenv("YOROZU_BUILD_MAX_DEPTH")
	if s == "" {
		return 5
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return 5
	}
	return n
}

func globDepth(rel string) int {
	rel = filepath.ToSlash(rel)
	if rel == "" || rel == "." {
		return 0
	}
	return strings.Count(rel, "/") + 1
}

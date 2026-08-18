package workspace

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

var packageJSONExts = []string{"json", "jsonc", "json5", "yml", "yaml"}

type notFoundError struct {
	dir string
}

func (e *notFoundError) Error() string {
	return fmt.Sprintf("Could not find package.json at %s", e.dir)
}

func (e *notFoundError) NotFound() bool { return true }

type pnpmWorkspaceYAML struct {
	Packages []string                     `yaml:"packages"`
	Catalog  map[string]string            `yaml:"catalog"`
	Catalogs map[string]map[string]string `yaml:"catalogs"`
}

func ParseFile(path string) (PackageJSON, error) {
	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(path), "."))
	var format string
	switch ext {
	case "json", "jsonc", "json5":
		format = "json"
	case "yml", "yaml":
		format = "yaml"
	default:
		return PackageJSON{}, fmt.Errorf("Unknown package.json extension: %s", ext)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return PackageJSON{}, fmt.Errorf("Could not parse package.json at %s: %w", path, err)
	}

	var pkg PackageJSON
	if format == "json" {
		err = json.Unmarshal(data, &pkg)
	} else {
		err = yaml.Unmarshal(data, &pkg)
	}
	if err != nil {
		return PackageJSON{}, fmt.Errorf("Could not parse package.json at %s: %w", path, err)
	}
	return pkg, nil
}

func ParseDir(dir string) (string, PackageJSON, error) {
	for _, ext := range packageJSONExts {
		candidate := filepath.Join(dir, "package."+ext)
		if !fileExists(candidate) {
			continue
		}
		pkg, err := ParseFile(candidate)
		if err != nil {
			return "", PackageJSON{}, err
		}
		return candidate, pkg, nil
	}
	return "", PackageJSON{}, &notFoundError{dir: dir}
}

func ParseWorkspaceRoot(root string) (string, PackageJSON, error) {
	path, pkg, err := ParseDir(root)
	if err != nil {
		return "", PackageJSON{}, err
	}
	if pkg.Workspaces != nil {
		return path, pkg, nil
	}

	pnpmPath := filepath.Join(root, "pnpm-workspace.yaml")
	data, err := os.ReadFile(pnpmPath)
	if err != nil {
		if os.IsNotExist(err) {
			return path, pkg, nil
		}
		return "", PackageJSON{}, err
	}

	var ws pnpmWorkspaceYAML
	if err := yaml.Unmarshal(data, &ws); err != nil {
		return "", PackageJSON{}, err
	}
	if ws.Packages == nil {
		return "", PackageJSON{}, errors.New("No packages found in pnpm-workspace.yaml")
	}

	if ws.Catalog != nil || ws.Catalogs != nil {
		catalogs := map[string]map[string]string{}
		if ws.Catalog != nil {
			catalogs[""] = ws.Catalog
		}
		if ws.Catalogs != nil {
			for name, catalog := range ws.Catalogs {
				catalogs[name] = catalog
			}
		}
		pkg.Catalogs = catalogs
	}

	pkg.Workspaces = ws.Packages
	return path, pkg, nil
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return info.Mode().IsRegular()
}

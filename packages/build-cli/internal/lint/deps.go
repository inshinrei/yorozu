package lint

import (
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"

	"github.com/Masterminds/semver/v3"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/config"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/workspace"
)

type Error interface {
	lintError()
}

type ExternalError struct {
	Type         string `json:"type"`
	Package      string `json:"package"`
	Dependency   string `json:"dependency"`
	Version      string `json:"version"`
	At           string `json:"at"`
	OtherPackage string `json:"otherPackage"`
	OtherVersion string `json:"otherVersion"`
}

func (ExternalError) lintError() {}

type InternalError struct {
	Type       string `json:"type"`
	Package    string `json:"package"`
	Dependency string `json:"dependency"`
	Subtype    string `json:"subtype"`
}

func (InternalError) lintError() {}

var httpOrCatalog = regexp.MustCompile(`^(?:https?://|catalog:)`)
var versionToken = regexp.MustCompile(`\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?`)

func ValidateWorkspaceDeps(root string, pkgs []workspace.Package, cfg config.LintConfig) ([]Error, error) {
	packagesMap := make(map[string]workspace.Package, len(pkgs))
	for _, pkg := range pkgs {
		if pkg.JSON.Name == "" {
			return nil, errors.New("package.json without name is not supported")
		}
		packagesMap[pkg.JSON.Name] = pkg
	}

	externalEnabled := cfg.ExternalDependencies.Enabled == nil || *cfg.ExternalDependencies.Enabled
	skipPeer := cfg.ExternalDependencies.SkipPeerDependencies
	versions := map[string]map[string]string{}
	var out []Error

	for _, pkg := range pkgs {
		name := pkg.JSON.Name
		for _, field := range depFields(pkg.JSON) {
			if field.deps == nil {
				continue
			}
			for _, depName := range sortedKeys(field.deps) {
				version := field.deps[depName]
				if other, ok := packagesMap[depName]; ok {
					standalone := other.JSON.Yorozu != nil && other.JSON.Yorozu.Standalone
					if !standalone && !strings.HasPrefix(version, "workspace:") {
						out = append(out, InternalError{
							Type:       "internal",
							Package:    name,
							Dependency: depName,
							Subtype:    "not_workspace_proto",
						})
					}
					continue
				}

				if strings.HasPrefix(version, "workspace:") {
					out = append(out, InternalError{
						Type:       "internal",
						Package:    name,
						Dependency: depName,
						Subtype:    "not_workspace_dep",
					})
					continue
				}

				if !externalEnabled {
					continue
				}
				if field.name == "peerDependencies" && skipPeer {
					continue
				}

				seen := versions[depName]
				if seen == nil {
					seen = map[string]string{}
					versions[depName] = seen
				}
				for _, otherPkg := range sortedKeys(seen) {
					otherVersion := seen[otherPkg]
					if !versionsCompatible(version, otherVersion) {
						out = append(out, ExternalError{
							Type:         "external",
							Package:      name,
							Dependency:   depName,
							Version:      version,
							At:           field.name,
							OtherPackage: otherPkg,
							OtherVersion: otherVersion,
						})
					}
				}
				seen[name] = version
			}
		}
	}

	return out, nil
}

type depField struct {
	name string
	deps map[string]string
}

func depFields(pj workspace.PackageJSON) []depField {
	return []depField{
		{"dependencies", pj.Dependencies},
		{"devDependencies", pj.DevDependencies},
		{"peerDependencies", pj.PeerDependencies},
		{"optionalDependencies", pj.OptionalDependencies},
	}
}

func versionsCompatible(version, other string) bool {
	if httpOrCatalog.MatchString(other) {
		return version == other
	}
	if v, err := semver.StrictNewVersion(version); err == nil {
		c, err := semver.NewConstraint(other)
		if err != nil {
			return version == other
		}
		return c.Check(v)
	}
	if _, err := semver.NewConstraint(version); err == nil {
		return rangeSubset(other, version)
	}
	return version == other
}

func rangeSubset(sub, dom string) bool {
	if sub == dom {
		return true
	}
	subC, err := semver.NewConstraint(sub)
	if err != nil {
		return false
	}
	domC, err := semver.NewConstraint(dom)
	if err != nil {
		return false
	}
	probes := probeVersions(sub, subC)
	if len(probes) == 0 {
		return false
	}
	for _, v := range probes {
		if !domC.Check(v) {
			return false
		}
	}
	return true
}

func probeVersions(raw string, c *semver.Constraints) []*semver.Version {
	candidates := versionToken.FindAllString(raw, -1)
	candidates = append(candidates, "0.0.0", "0.0.1", "0.1.0", "1.0.0", "1.2.3", "1.2.4", "2.0.0", "3.0.0")
	seen := map[string]struct{}{}
	var out []*semver.Version
	add := func(s string) {
		v, err := semver.NewVersion(s)
		if err != nil {
			return
		}
		key := v.String()
		if _, ok := seen[key]; ok {
			return
		}
		if !c.Check(v) {
			return
		}
		seen[key] = struct{}{}
		out = append(out, v)
	}
	for _, s := range candidates {
		v, err := semver.NewVersion(s)
		if err != nil {
			continue
		}
		add(v.String())
		add(v.IncPatch().String())
		add(v.IncMinor().String())
		add(v.IncMajor().String())
		if v.Patch() > 0 {
			add(fmt.Sprintf("%d.%d.%d", v.Major(), v.Minor(), v.Patch()-1))
		}
		if v.Minor() > 0 {
			add(fmt.Sprintf("%d.%d.0", v.Major(), v.Minor()-1))
		}
		if v.Major() > 0 {
			add(fmt.Sprintf("%d.0.0", v.Major()-1))
		}
	}
	return out
}

func sortedKeys(m map[string]string) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

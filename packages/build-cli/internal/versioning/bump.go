package versioning

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/Masterminds/semver/v3"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/config"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/git"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/workspace"
)

type ReleaseType string

const (
	ReleaseMajor ReleaseType = "major"
	ReleaseMinor ReleaseType = "minor"
	ReleasePatch ReleaseType = "patch"
)

type BumpPkg struct {
	Package     workspace.Package
	PrevVersion string
}

type Result struct {
	PreviousVersion string
	NextVersion     string
	NextVersions    map[string]string
	Changed         []BumpPkg
	ReleaseType     ReleaseType
	HasBreaking     bool
	HasFeatures     bool
}

type BumpOpts struct {
	Workspace  []workspace.Package
	Since      string
	Cwd        string
	Type       string
	DryRun     bool
	WithRoot   bool
	All        bool
	Versioning config.VersioningData
}

func isOwnVersioning(pkg workspace.Package) bool {
	return pkg.JSON.Yorozu != nil && pkg.JSON.Yorozu.OwnVersioning
}

func isStandalone(pkg workspace.Package) bool {
	return pkg.JSON.Yorozu != nil && pkg.JSON.Yorozu.Standalone
}

func isManaged(pkg workspace.Package) bool {
	return !pkg.Root && !isOwnVersioning(pkg) && !isStandalone(pkg)
}

func parseCommit(commit git.Commit) *git.Conventional {
	return git.ParseConventional(commit.Message + "\n" + commit.Description)
}

func summarizeCommits(commits []git.Commit) (hasBreaking, hasFeatures bool) {
	for _, commit := range commits {
		parsed := parseCommit(commit)
		if parsed == nil {
			continue
		}
		if parsed.Breaking {
			hasBreaking = true
		}
		if parsed.Type == "feat" {
			hasFeatures = true
		}
	}
	return hasBreaking, hasFeatures
}

func bumpFromFlags(oldVersion string, hasBreaking, hasFeatures bool) (ReleaseType, error) {
	parsedVersion, err := semver.NewVersion(oldVersion)
	if err != nil {
		return "", fmt.Errorf("Invalid version: %s", oldVersion)
	}
	if hasBreaking {
		if parsedVersion.Major() == 0 && parsedVersion.Minor() == 0 {
			return ReleasePatch, nil
		}
		if parsedVersion.Major() == 0 {
			return ReleaseMinor, nil
		}
		return ReleaseMajor, nil
	}
	if hasFeatures {
		if parsedVersion.Major() == 0 {
			return ReleasePatch, nil
		}
		return ReleaseMinor, nil
	}
	return ReleasePatch, nil
}

func DetermineBumpType(oldVersion string, commits []git.Commit) (ReleaseType, error) {
	hasBreaking, hasFeatures := summarizeCommits(commits)
	return bumpFromFlags(oldVersion, hasBreaking, hasFeatures)
}

func incVersion(oldVersion string, typ ReleaseType) (string, error) {
	parsed, err := semver.NewVersion(oldVersion)
	if err != nil {
		return "", fmt.Errorf("Invalid version increment: %s → %s", oldVersion, typ)
	}
	var next semver.Version
	switch typ {
	case ReleaseMajor:
		next = parsed.IncMajor()
	case ReleaseMinor:
		next = parsed.IncMinor()
	case ReleasePatch:
		next = parsed.IncPatch()
	default:
		return "", fmt.Errorf("Invalid version increment: %s → %s", oldVersion, typ)
	}
	return next.String(), nil
}

func detectIndent(text string) string {
	for _, line := range strings.Split(text, "\n") {
		if line == "" {
			continue
		}
		i := 0
		for i < len(line) && (line[i] == ' ' || line[i] == '\t') {
			i++
		}
		if i > 0 {
			return line[:i]
		}
	}
	return "    "
}

func jsonObjectKeys(data []byte) ([]string, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	tok, err := dec.Token()
	if err != nil {
		return nil, err
	}
	d, ok := tok.(json.Delim)
	if !ok || d != '{' {
		return nil, fmt.Errorf("package.json is not an object")
	}
	var keys []string
	for dec.More() {
		keyTok, err := dec.Token()
		if err != nil {
			return nil, err
		}
		key, ok := keyTok.(string)
		if !ok {
			return nil, fmt.Errorf("package.json has a non-string key")
		}
		keys = append(keys, key)
		var skip json.RawMessage
		if err := dec.Decode(&skip); err != nil {
			return nil, err
		}
	}
	return keys, nil
}

func prettyJSONValue(v any, indent string) (string, error) {
	switch v.(type) {
	case map[string]any, []any:
		b, err := json.MarshalIndent(v, indent, indent)
		if err != nil {
			return "", err
		}
		return string(b), nil
	default:
		b, err := json.Marshal(v)
		if err != nil {
			return "", err
		}
		return string(b), nil
	}
}

func setPackageJSONVersion(data []byte, version string) ([]byte, error) {
	var obj map[string]any
	if err := json.Unmarshal(data, &obj); err != nil {
		return nil, err
	}
	obj["version"] = version
	keys, err := jsonObjectKeys(data)
	if err != nil {
		return nil, err
	}
	hasVersion := false
	for _, key := range keys {
		if key == "version" {
			hasVersion = true
			break
		}
	}
	if !hasVersion {
		keys = append(keys, "version")
	}
	indent := detectIndent(string(data))
	var b strings.Builder
	b.WriteString("{\n")
	for i, key := range keys {
		pretty, err := prettyJSONValue(obj[key], indent)
		if err != nil {
			return nil, err
		}
		keyJSON, err := json.Marshal(key)
		if err != nil {
			return nil, err
		}
		b.WriteString(indent)
		b.Write(keyJSON)
		b.WriteString(": ")
		b.WriteString(pretty)
		if i < len(keys)-1 {
			b.WriteByte(',')
		}
		b.WriteByte('\n')
	}
	b.WriteString("}\n")
	return []byte(b.String()), nil
}

func writePackageVersion(pkg *workspace.Package, version string, dryRun bool) error {
	if !dryRun {
		pkgJSONPath := pkg.PackageJSONPath
		if pkgJSONPath == "" {
			pkgJSONPath = filepath.Join(pkg.Path, "package.json")
		}
		pkgJSONText, err := os.ReadFile(pkgJSONPath)
		if err != nil {
			return err
		}
		updated, err := setPackageJSONVersion(pkgJSONText, version)
		if err != nil {
			return err
		}
		if err := os.WriteFile(pkgJSONPath, updated, 0o644); err != nil {
			return err
		}
	}
	pkg.JSON.Version = version
	return nil
}

func nextStandaloneVersion(pkg workspace.Package, cwd string) (string, error) {
	current := pkg.JSON.Version
	if current == "" {
		return "", fmt.Errorf("Value is %s.", current)
	}
	tag, err := git.LatestTag(pkg.Path)
	if err != nil || tag == "" {
		return current, nil
	}
	rel, err := filepath.Rel(cwd, pkg.Path)
	if err != nil {
		return current, nil
	}
	rel = filepath.ToSlash(rel)
	pathspec := rel
	if rel == "" || rel == "." {
		pathspec = "."
	} else if !strings.HasSuffix(rel, "/") {
		pathspec = rel + "/"
	}
	commits, err := git.CommitsBetween(tag, "", cwd, []string{pathspec})
	if err != nil {
		return current, nil
	}
	if len(commits) == 0 {
		return current, nil
	}
	bumpType, err := DetermineBumpType(current, commits)
	if err != nil {
		return "", err
	}
	return incVersion(current, bumpType)
}

func recordVersion(nextVersions map[string]string, changed *[]BumpPkg, pkg workspace.Package, prev, next string) {
	if pkg.JSON.Name != "" {
		nextVersions[pkg.JSON.Name] = next
	}
	if next != prev {
		*changed = append(*changed, BumpPkg{Package: pkg, PrevVersion: prev})
	}
}

func Bump(opts BumpOpts) (Result, error) {
	ws := opts.Workspace
	cwd := opts.Cwd
	if cwd == "" {
		var err error
		cwd, err = os.Getwd()
		if err != nil {
			return Result{}, err
		}
	}

	rootIdx := -1
	for i := range ws {
		if ws[i].Root {
			rootIdx = i
			break
		}
	}
	if rootIdx < 0 {
		return Result{}, fmt.Errorf("Could not find package.json for workspace root")
	}
	previousVersion := ws[rootIdx].JSON.Version
	if previousVersion == "" {
		return Result{}, fmt.Errorf("Workspace root package.json is missing a version")
	}

	var typ ReleaseType
	var hasFeatures, hasBreaking bool
	if opts.Type == "" {
		commits, err := git.CommitsBetween(opts.Since, "", cwd, nil)
		if err != nil {
			return Result{}, err
		}
		hasBreaking, hasFeatures = summarizeCommits(commits)
		var errType error
		typ, errType = bumpFromFlags(previousVersion, hasBreaking, hasFeatures)
		if errType != nil {
			return Result{}, errType
		}
	} else {
		typ = ReleaseType(opts.Type)
	}

	nextVersion, err := incVersion(previousVersion, typ)
	if err != nil {
		return Result{}, err
	}

	nextVersions := map[string]string{}
	var changed []BumpPkg

	for i := range ws {
		if !isManaged(ws[i]) {
			continue
		}
		prevVersion := ws[i].JSON.Version
		if prevVersion == "" {
			return Result{}, fmt.Errorf("Value is %s.", prevVersion)
		}
		if err := writePackageVersion(&ws[i], nextVersion, opts.DryRun); err != nil {
			return Result{}, err
		}
		recordVersion(nextVersions, &changed, ws[i], prevVersion, nextVersion)
	}

	if opts.WithRoot {
		if err := writePackageVersion(&ws[rootIdx], nextVersion, opts.DryRun); err != nil {
			return Result{}, err
		}
		recordVersion(nextVersions, &changed, ws[rootIdx], previousVersion, nextVersion)
	}

	for i := range ws {
		pkg := ws[i]
		if pkg.Root || isOwnVersioning(pkg) || !isStandalone(pkg) {
			continue
		}
		prevVersion := pkg.JSON.Version
		if prevVersion == "" {
			return Result{}, fmt.Errorf("Value is %s.", prevVersion)
		}
		standaloneNext, err := nextStandaloneVersion(pkg, cwd)
		if err != nil {
			return Result{}, err
		}
		if standaloneNext == prevVersion {
			continue
		}
		if err := writePackageVersion(&ws[i], standaloneNext, opts.DryRun); err != nil {
			return Result{}, err
		}
		recordVersion(nextVersions, &changed, ws[i], prevVersion, standaloneNext)
	}

	return Result{
		PreviousVersion: previousVersion,
		NextVersion:     nextVersion,
		NextVersions:    nextVersions,
		Changed:         changed,
		ReleaseType:     typ,
		HasBreaking:     hasBreaking,
		HasFeatures:     hasFeatures,
	}, nil
}

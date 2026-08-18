package build

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/config"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/exec"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/workspace"
	"gopkg.in/yaml.v3"
)

type PackageOpts struct {
	WorkspaceRoot string
	Workspace     []workspace.Package
	PackageName   string
	ConfigPath    string
	FixedVersion  string
}

func ResolveViteConfig(root, configured string) (string, error) {
	if configured != "" {
		return configured, nil
	}
	ts := filepath.Join(root, "vite.config.ts")
	ok, err := regularFile(ts)
	if err != nil {
		return "", err
	}
	if ok {
		return "vite.config.ts", nil
	}
	js := filepath.Join(root, "vite.config.js")
	ok, err = regularFile(js)
	if err != nil {
		return "", err
	}
	if ok {
		return "vite.config.js", nil
	}
	return "vite.config.ts", nil
}

func Package(opts PackageOpts) error {
	cfg, err := config.Load(opts.WorkspaceRoot)
	if err != nil {
		return err
	}
	pkgs := opts.Workspace
	if pkgs == nil {
		pkgs, err = workspace.Collect(opts.WorkspaceRoot, true)
		if err != nil {
			return err
		}
	}

	configured := ""
	if cfg != nil {
		configured = cfg.ViteConfig
	}
	viteConfig, err := ResolveViteConfig(opts.WorkspaceRoot, configured)
	if err != nil {
		return err
	}
	pkg, err := workspace.FindByName(pkgs, opts.PackageName)
	if err != nil {
		return err
	}

	list, err := encodePackages(pkgs)
	if err != nil {
		return err
	}
	extra := map[string]string{
		"__YOROZU_INTERNAL_PACKAGES_LIST": list,
	}
	if opts.FixedVersion != "" {
		extra["__YOROZU_INTERNAL_FIXED_VERSION"] = opts.FixedVersion
	}

	_, err = exec.Run(
		[]string{"npx", "vite", "build", "--config", filepath.Join(opts.WorkspaceRoot, viteConfig)},
		exec.Options{
			Dir:          pkg.Path,
			Env:          mergeEnv(extra),
			InheritIO:    true,
			ThrowOnError: true,
		},
	)
	return err
}

func Workspace(root, fixedVersion string) error {
	pkgs, err := workspace.Collect(root, true)
	if err != nil {
		return err
	}
	var withoutRoot []workspace.Package
	for _, pkg := range pkgs {
		if !pkg.Root {
			withoutRoot = append(withoutRoot, pkg)
		}
	}
	ordered, err := workspace.SortByPublishOrder(withoutRoot)
	if err != nil {
		return err
	}
	ordered = workspace.FilterForPublish(ordered, "npm")
	for _, pkg := range ordered {
		name := pkg.JSON.Name
		if name == "" {
			return fmt.Errorf("Value is %s.", name)
		}
		fmt.Fprintf(os.Stdout, "building %s\n", name)
		if err := Package(PackageOpts{
			WorkspaceRoot: root,
			Workspace:     pkgs,
			PackageName:   name,
			FixedVersion:  fixedVersion,
		}); err != nil {
			return err
		}
	}
	return nil
}

type envPackage struct {
	Path            string          `json:"path"`
	PackageJSONPath string          `json:"packageJsonPath"`
	Root            bool            `json:"root"`
	JSON            json.RawMessage `json:"json"`
}

func encodePackages(pkgs []workspace.Package) (string, error) {
	out := make([]envPackage, len(pkgs))
	for i, pkg := range pkgs {
		raw, err := jsonForEnv(pkg)
		if err != nil {
			return "", err
		}
		out[i] = envPackage{
			Path:            pkg.Path,
			PackageJSONPath: pkg.PackageJSONPath,
			Root:            pkg.Root,
			JSON:            raw,
		}
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(out); err != nil {
		return "", err
	}
	return strings.TrimRight(buf.String(), "\n"), nil
}

func jsonForEnv(pkg workspace.Package) (json.RawMessage, error) {
	raw := map[string]any{}
	loaded := false
	if pkg.PackageJSONPath != "" {
		data, err := os.ReadFile(pkg.PackageJSONPath)
		if err == nil {
			ext := strings.ToLower(filepath.Ext(pkg.PackageJSONPath))
			switch ext {
			case ".yml", ".yaml":
				if err := yaml.Unmarshal(data, &raw); err == nil {
					loaded = true
				}
			default:
				if err := json.Unmarshal(data, &raw); err == nil {
					loaded = true
				}
			}
		}
	}
	if !loaded {
		typed, err := json.Marshal(pkg.JSON)
		if err != nil {
			return nil, err
		}
		if err := json.Unmarshal(typed, &raw); err != nil {
			return nil, err
		}
	}
	if len(pkg.JSON.Catalogs) > 0 {
		raw["catalogs"] = pkg.JSON.Catalogs
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(raw); err != nil {
		return nil, err
	}
	return json.RawMessage(strings.TrimRight(buf.String(), "\n")), nil
}

func regularFile(path string) (bool, error) {
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}
	return info.Mode().IsRegular(), nil
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

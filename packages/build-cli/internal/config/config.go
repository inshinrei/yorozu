package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/exec"
)

type RootConfig struct {
	ViteConfig string          `json:"viteConfig"`
	Jsr        JsrDataConfig   `json:"jsr"`
	Versioning VersioningData  `json:"versioning"`
	Lint       LintConfig      `json:"lint"`
	Typedoc    json.RawMessage `json:"typedoc"`
}

type JsrDataConfig struct {
	OutputDir            string   `json:"outputDir"`
	SourceDir            string   `json:"sourceDir"`
	Exclude              []string `json:"exclude"`
	CopyRootFiles        []string `json:"copyRootFiles"`
	CopyPackageFiles     []string `json:"copyPackageFiles"`
	DryRun               bool     `json:"dryRun"`
	EnableDenoDirectives bool     `json:"enableDenoDirectives"`
}

type VersioningData struct {
	TaggingSchema      string          `json:"taggingSchema"`
	Include            []string        `json:"include"`
	Exclude            []string        `json:"exclude"`
	BumpWithDependants json.RawMessage `json:"bumpWithDependants"`
}

type LintConfig struct {
	IncludeRoot          bool `json:"includeRoot"`
	ExternalDependencies struct {
		Enabled              *bool `json:"enabled"`
		SkipPeerDependencies bool  `json:"skipPeerDependencies"`
	} `json:"externalDependencies"`
	PreferProtected struct {
		Enabled *bool    `json:"enabled"`
		Exclude []string `json:"exclude"`
	} `json:"preferProtected"`
}

func WorkspaceRoot() string {
	if root := os.Getenv("YOROZU_ROOT"); root != "" {
		return root
	}
	cwd, err := os.Getwd()
	if err != nil {
		return ""
	}
	return cwd
}

func Load(workspaceRoot string) (*RootConfig, error) {
	configPath := filepath.Join(workspaceRoot, "build.config.js")
	if _, err := os.Stat(configPath); err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	helper := os.Getenv("YOROZU_BUILD_EVAL_CONFIG")
	if helper == "" {
		helper = filepath.Join(workspaceRoot, "packages/build/scripts/eval-config.mjs")
	}

	absConfigPath, err := filepath.Abs(configPath)
	if err != nil {
		return nil, fmt.Errorf("Could not load build.config.js: %w", err)
	}

	result, err := exec.Run([]string{"node", helper, absConfigPath}, exec.Options{ThrowOnError: true})
	if err != nil {
		return nil, fmt.Errorf("Could not load build.config.js: %w", err)
	}

	var cfg RootConfig
	if err := json.Unmarshal([]byte(result.Stdout), &cfg); err != nil {
		return nil, fmt.Errorf("Could not load build.config.js: %w", err)
	}
	return &cfg, nil
}

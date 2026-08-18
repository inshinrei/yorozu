package lint

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/exec"
)

type PreferProtectedError struct {
	Type   string `json:"type"`
	File   string `json:"file"`
	Line   int    `json:"line"`
	Column int    `json:"column"`
	Kind   string `json:"kind"`
	Name   string `json:"name"`
}

func FindPreferProtected(root string) ([]PreferProtectedError, error) {
	script, repo, err := leftoverScript()
	if err != nil {
		return nil, err
	}
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	result, err := exec.Run([]string{
		"npx", "tsx", script, "prefer-protected", "--root", absRoot,
	}, exec.Options{
		Dir:          repo,
		ThrowOnError: true,
	})
	if err != nil {
		return nil, err
	}
	var issues []PreferProtectedError
	if err := json.Unmarshal([]byte(strings.TrimSpace(result.Stdout)), &issues); err != nil {
		return nil, fmt.Errorf("leftover prefer-protected: %w", err)
	}
	if issues == nil {
		issues = []PreferProtectedError{}
	}
	return issues, nil
}

func leftoverScript() (script, repo string, err error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", "", err
	}
	start := dir
	for {
		candidate := filepath.Join(dir, "packages/build/src/cli/leftover.ts")
		if st, statErr := os.Stat(candidate); statErr == nil && !st.IsDir() {
			return candidate, dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", "", fmt.Errorf("could not find leftover.ts from %s", start)
		}
		dir = parent
	}
}

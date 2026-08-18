package leftover

import (
	"path/filepath"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/exec"
)

func Run(workspaceRoot string, args []string) error {
	script := filepath.Join(workspaceRoot, "packages/build/src/cli/leftover.ts")
	cmd := append([]string{"npx", "tsx", script}, args...)
	_, err := exec.Run(cmd, exec.Options{
		Dir:          workspaceRoot,
		InheritIO:    true,
		ThrowOnError: true,
	})
	return err
}

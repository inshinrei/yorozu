package cli

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/config"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/depsgraph"
)

func depsGraphCmd(args []string) int {
	root := config.WorkspaceRoot()
	includeRoot := false
	includeExternal := false
	for i := 0; i < len(args); i++ {
		arg := args[i]
		switch {
		case arg == "--root":
			if i+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "missing --root value")
				return 2
			}
			i++
			root = args[i]
		case strings.HasPrefix(arg, "--root="):
			root = strings.TrimPrefix(arg, "--root=")
		case arg == "--include-root":
			includeRoot = true
		case arg == "--include-external":
			includeExternal = true
		}
	}
	abs, err := filepath.Abs(root)
	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		return 1
	}
	dot, err := depsgraph.Generate(abs, includeRoot, includeExternal)
	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		return 1
	}
	info(dot)
	return 0
}

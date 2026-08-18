package cli

import (
	"fmt"
	"os"
	"strings"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/config"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/leftover"
)

func leftoverCmd(name string) func([]string) int {
	return func(args []string) int {
		root := config.WorkspaceRoot()
		rest := args
		for i := 0; i < len(args); i++ {
			if args[i] == "--root" && i+1 < len(args) {
				root = args[i+1]
			}
			if strings.HasPrefix(args[i], "--root=") {
				root = strings.TrimPrefix(args[i], "--root=")
			}
		}
		if err := leftover.Run(root, append([]string{name}, rest...)); err != nil {
			fmt.Fprintln(os.Stderr, err.Error())
			return 1
		}
		return 0
	}
}

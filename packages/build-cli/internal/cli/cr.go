package cli

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/config"
	"github.com/inshinrei/yorozu/packages/build-cli/internal/cr"
)

func crCmd(args []string) int {
	opts := cr.Options{
		WorkspaceRoot: config.WorkspaceRoot(),
	}
	for i := 0; i < len(args); i++ {
		arg := args[i]
		switch {
		case arg == "--root":
			if i+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "missing --root value")
				return 2
			}
			i++
			opts.WorkspaceRoot = args[i]
		case strings.HasPrefix(arg, "--root="):
			opts.WorkspaceRoot = strings.TrimPrefix(arg, "--root=")
		case arg == "--dist-dir":
			if i+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "missing --dist-dir value")
				return 2
			}
			i++
			opts.DistDir = args[i]
		case strings.HasPrefix(arg, "--dist-dir="):
			opts.DistDir = strings.TrimPrefix(arg, "--dist-dir=")
		case arg == "--extra-args":
			if i+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "missing --extra-args value")
				return 2
			}
			i++
			opts.ExtraArgs = strings.Split(args[i], " ")
		case strings.HasPrefix(arg, "--extra-args="):
			opts.ExtraArgs = strings.Split(strings.TrimPrefix(arg, "--extra-args="), " ")
		case arg == "--only-changed":
			opts.OnlyChanged = true
		case arg == "--only-changed-since":
			if i+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "missing --only-changed-since value")
				return 2
			}
			i++
			opts.OnlyChangedSince = args[i]
		case strings.HasPrefix(arg, "--only-changed-since="):
			opts.OnlyChangedSince = strings.TrimPrefix(arg, "--only-changed-since=")
		}
	}
	abs, err := filepath.Abs(opts.WorkspaceRoot)
	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		return 1
	}
	opts.WorkspaceRoot = abs
	if err := cr.Run(opts); err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		return 1
	}
	return 0
}

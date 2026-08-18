package main

import (
	"os"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/cli"
)

func main() {
	os.Exit(cli.Run(os.Args[1:]))
}

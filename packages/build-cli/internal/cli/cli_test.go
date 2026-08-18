package cli_test

import (
	"strings"
	"testing"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/cli"
)

func TestUsageListsEveryCommand(t *testing.T) {
	usage := cli.Usage()
	want := []string{
		"lint", "build", "publish", "bump-version", "gen-changelog",
		"find-changed-packages", "release", "jsr", "docs", "gen-deps-graph", "cr",
	}
	for _, name := range want {
		if !strings.Contains(usage, name) {
			t.Fatalf("usage missing %q:\n%s", name, usage)
		}
	}
}

func TestRunNoArgsIsUsageExitZero(t *testing.T) {
	if code := cli.Run(nil); code != 0 {
		t.Fatalf("exit %d", code)
	}
}

func TestRunUnknownCommandIsExitTwo(t *testing.T) {
	if code := cli.Run([]string{"nope"}); code != 2 {
		t.Fatalf("exit %d", code)
	}
}

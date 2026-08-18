package release

import "github.com/inshinrei/yorozu/packages/build-cli/internal/git"

func ShouldSkipAuto(kind, prevTag string, commits []git.Commit) bool {
	return kind == "auto" && prevTag != "" && len(commits) == 0
}

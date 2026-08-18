package release

import (
	"fmt"
	"time"

	"github.com/inshinrei/yorozu/packages/build-cli/internal/git"
)

func NextDateTag(root string) (string, error) {
	return nextDateTagAt(root, time.Now())
}

func nextDateTagAt(root string, date time.Time) (string, error) {
	prefix := fmt.Sprintf("v%d.%02d.%02d", date.Year(), int(date.Month()), date.Day())
	suffix := byte('a')
	for {
		tag := prefix + string(suffix)
		exists, err := git.TagExists(tag, root)
		if err != nil {
			return "", err
		}
		if !exists {
			return tag, nil
		}
		if suffix == 'z' {
			return "", fmt.Errorf("Too many releases for today (max 26)")
		}
		suffix++
	}
}
